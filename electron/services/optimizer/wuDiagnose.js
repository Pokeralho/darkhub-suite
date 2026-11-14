// Windows Update diagnosis: runs wu-diagnose.ps1 (read-only, no admin) and turns what it finds into a short list of
// problems, each with what to do. The repair itself is WindowsToolsEngine.resetWindowsUpdate.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'wu-diagnose.ps1')
const NEEDED = ['wuauserv', 'bits', 'cryptsvc']
const BLOCKED_IP = /^(0\.0\.0\.0|127\.|::1?$|::$)/

const ipv4 = (ip) => {
  const p = String(ip).split('.').map(Number)
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3] : null
}
/** Is an IPv4 address inside a firewall address ("1.2.3.4", "1.2.3.0/24", "1.2.3.0/255.255.255.0", "1.2.3.4-1.2.3.9")? */
export function ipInRange(ip, range) {
  const x = ipv4(ip)
  if (x === null) return false
  const r = String(range).trim()
  if (r.includes('-')) { const [a, b] = r.split('-').map(ipv4); return a !== null && b !== null && x >= a && x <= b }
  const [base, mask] = r.split('/')
  const b = ipv4(base)
  if (b === null) return false
  if (mask === undefined) return x === b
  const bits = mask.includes('.') ? (ipv4(mask) ?? 0) : (Number(mask) === 0 ? 0 : (0xffffffff << (32 - Number(mask))) >>> 0)
  return ((x & bits) >>> 0) === ((b & bits) >>> 0)
}

/**
 * raw: the script's JSON. Returns [{ id, level: 'bad' | 'warn', data }] with the most likely cause first;
 * an empty list means nothing wrong was found.
 */
export function wuFindings(raw) {
  const out = []
  const svc = raw?.services || {}
  const disabled = Object.entries(svc).filter(([n, s]) => s?.exists && s.start === 4 && [...NEEDED, 'dosvc', 'usosvc', 'trustedinstaller'].includes(n)).map(([n]) => n)
  if (disabled.length) out.push({ id: 'servicesDisabled', level: 'bad', data: { services: disabled.join(', ') } })
  const missing = NEEDED.filter((n) => svc[n] && !svc[n].exists)
  if (missing.length) out.push({ id: 'servicesMissing', level: 'bad', data: { services: missing.join(', ') } })

  const pol = raw?.policies || {}
  if (pol.disableAccess === 1) out.push({ id: 'policyAccess', level: 'bad', data: {} })
  if (pol.noInternet === 1) out.push({ id: 'policyInternet', level: 'bad', data: {} })
  if (pol.wsus) out.push({ id: 'wsus', level: 'warn', data: { server: pol.wsusServer || '' } })

  if ((raw?.hosts || []).length) out.push({ id: 'hosts', level: 'bad', data: { lines: raw.hosts.slice(0, 5).join(' | ') } })

  const net = raw?.net || []
  const noDns = net.filter((n) => !n.dns).map((n) => n.host)
  const sinkholed = net.filter((n) => n.dns && (n.ips || []).some((ip) => BLOCKED_IP.test(ip))).map((n) => n.host)
  const noTcp = net.filter((n) => n.dns && !sinkholed.includes(n.host) && !n.tcp).map((n) => `${n.host}:${n.port}`)
  if (sinkholed.length) out.push({ id: 'dnsBlocked', level: 'bad', data: { hosts: sinkholed.join(', ') } })
  if (noDns.length === net.length && net.length) out.push({ id: 'noDns', level: 'bad', data: {} })
  else if (noDns.length) out.push({ id: 'dnsPartial', level: 'bad', data: { hosts: noDns.join(', ') } })
  if (noTcp.length) out.push({ id: 'blockedPorts', level: 'bad', data: { targets: noTcp.join(', ') } })

  // DarkHub's own IP blocklist catching a Windows Update server: a cause we can name exactly
  const dh = (raw?.darkhubBlocklist || []).map(String)
  const caught = dh.length ? net.filter((n) => (n.ips || []).some((ip) => dh.some((r) => ipInRange(ip, r)))).map((n) => n.host) : []
  if (caught.length) out.unshift({ id: 'darkhubBlocklist', level: 'bad', data: { hosts: caught.join(', ') } })
  if (raw?.proxy) out.push({ id: 'proxy', level: 'warn', data: { proxy: raw.proxy } })
  if (Number.isFinite(raw?.clockSkewMin) && Math.abs(raw.clockSkewMin) >= 5) out.push({ id: 'clock', level: 'bad', data: { minutes: String(raw.clockSkewMin) } })
  if (Number.isFinite(raw?.freeGb) && raw.freeGb < 8) out.push({ id: 'space', level: raw.freeGb < 3 ? 'bad' : 'warn', data: { gb: String(raw.freeGb) } })
  if ((raw?.firewallBlocks || []).length) out.push({ id: 'firewall', level: 'warn', data: { rules: raw.firewallBlocks.slice(0, 5).join(', ') } })
  if (raw?.cache && (!raw.cache.softwareDistribution || !raw.cache.catroot2)) out.push({ id: 'cache', level: 'warn', data: {} })
  return out
}

/** runner: (script, opts) -> { stdout } (PowerShellRunner.runPowerShell). */
export async function diagnoseWindowsUpdate(runner) {
  if (process.platform !== 'win32') return { ok: false, unsupported: true, platform: process.platform, reason: 'windows-only', error: 'Apenas suportado no Windows.' }
  const res = await runner(fs.readFileSync(SCRIPT, 'utf8'), { timeoutMs: 90000, trim: true })
  let raw = null
  try { raw = JSON.parse(String(res?.stdout || '').trim().split(/\r?\n/).pop()) } catch { /* not JSON */ }
  if (!raw) return { ok: false, error: String(res?.stderr || '').trim() || 'Não foi possível ler o diagnóstico.' }
  return { ok: true, findings: wuFindings(raw), raw }
}
