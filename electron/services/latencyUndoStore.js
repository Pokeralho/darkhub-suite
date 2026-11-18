// Ultra Low Latency undo record on disk. The guardian keeps what it changed (power plan, mouse, DNS, Nagle, QoS,
// FSO/GPU flags, TCP stack) in RAM; if the app quits, crashes or updates while Ultra mode is on, nothing would ever
// revert it. The record is written when the tweaks are applied, cleared when they are reverted, and replayed on the
// next start when it is still there.
//
// The file lives in userData, which unelevated processes of the same user can write, while DarkHub runs elevated:
// every value read back is validated to the exact shape the guardian itself produces (GUIDs, the Tcpip interface
// key, DarkHub's QoS policy names, IP addresses) so a tampered file cannot steer an elevated write elsewhere.
import fs from 'node:fs/promises'

export const UNDO_VERSION = 1

const GUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/
const NAGLE_KEY_RE = /^HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}$/
const QOS_NAME_RE = /^DarkHub-ULLM-[0-9a-f]{10}$/
const IP_RE = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9A-Fa-f:]{2,39}(?:%\d{1,3})?)$/
const RSC_VALUES = new Set(['enabled', 'disabled'])

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v)
const applied = (v) => isObj(v) && !v.error
const shortStr = (v, max = 512) => (typeof v === 'string' && v.length <= max ? v : null)
const regValue = (v) => (v === undefined || v === null || v === '' ? null : (typeof v === 'string' || typeof v === 'number') && String(v).length <= 64 ? v : undefined)
const dword = (v) => (v === undefined || v === null || v === '' ? null : Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 0xffffffff ? Number(v) : undefined)

/**
 * Keeps only the tweaks that outlive DarkHub and can be reverted, in a validated, JSON-safe shape. Timer
 * resolution and process priority die with their processes; killed background apps cannot be "un-killed".
 * Returns null when there is nothing to revert.
 */
export function persistableUndo(undo, { exePath = '' } = {}) {
  const u = isObj(undo) ? undo : {}
  const out = {}
  if (applied(u.powerPlan)) {
    const m = String(u.powerPlan.prev ?? '').match(GUID_RE)
    if (m) out.powerPlan = { prev: m[0] }
  }
  if (applied(u.fullscreen) && 'prev' in u.fullscreen) {
    const prev = u.fullscreen.prev == null ? '' : shortStr(String(u.fullscreen.prev))
    if (prev != null) out.fullscreen = { prev }
  }
  if (applied(u.mouseAccel) && isObj(u.mouseAccel.prev)) {
    const p = u.mouseAccel.prev
    const prev = {}
    let valid = true
    for (const k of ['MouseSpeed', 'MouseThreshold1', 'MouseThreshold2']) {
      const v = regValue(p[k])
      if (v === undefined) valid = false
      else if (v !== null) prev[k] = String(v)
    }
    if (valid) out.mouseAccel = { prev }
  }
  if (applied(u.gpuPref) && 'prev' in u.gpuPref) {
    const prev = u.gpuPref.prev == null ? '' : shortStr(String(u.gpuPref.prev))
    if (prev != null) out.gpuPref = { prev }
  }
  if (applied(u.qos) && QOS_NAME_RE.test(String(u.qos.policyName ?? ''))) out.qos = { policyName: u.qos.policyName }
  if (applied(u.nagle) && NAGLE_KEY_RE.test(String(u.nagle.key ?? ''))) {
    const n = { key: u.nagle.key }
    let valid = true
    for (const k of ['TcpAckFrequency', 'TCPNoDelay', 'TcpDelAckTicks']) {
      const v = dword(u.nagle[k])
      if (v === undefined) valid = false
      else n[k] = v
    }
    if (valid) out.nagle = n
  }
  if (applied(u.dns)) {
    const adapter = shortStr(u.dns.adapter, 256)
    const prev = Array.isArray(u.dns.prev) ? u.dns.prev.map(String) : []
    if (adapter && prev.length <= 8 && prev.every((ip) => IP_RE.test(ip))) out.dns = { adapter, prev }
  }
  if (applied(u.tcpStack) && u.tcpStack.optimized === true) {
    const rscPrev = RSC_VALUES.has(String(u.tcpStack.rscPrev ?? '').toLowerCase()) ? String(u.tcpStack.rscPrev).toLowerCase() : null
    out.tcpStack = { optimized: true, rscPrev }
  }
  if (!Object.keys(out).length) return null
  return { version: UNDO_VERSION, savedAt: Date.now(), exePath: shortStr(String(exePath ?? ''), 1024) ?? '', undo: out }
}

/** Parses a record read from disk; anything that is not exactly what persistableUndo writes is dropped. */
export function parseUndoRecord(text) {
  let raw
  try { raw = JSON.parse(String(text ?? '')) } catch { return null }
  if (!isObj(raw) || raw.version !== UNDO_VERSION || !isObj(raw.undo)) return null
  return persistableUndo(raw.undo, { exePath: typeof raw.exePath === 'string' ? raw.exePath : '' })
}

/** Writes the record atomically (temp + rename); a null record removes the file. */
export async function writeUndoRecord(file, record) {
  if (!record) return clearUndoRecord(file)
  const tmp = `${file}.${process.pid}.tmp`
  await fs.writeFile(tmp, JSON.stringify(record, null, 2), 'utf8')
  await fs.rename(tmp, file)
}

export async function readUndoRecord(file) {
  try { return parseUndoRecord(await fs.readFile(file, 'utf8')) } catch { return null }
}

export async function clearUndoRecord(file) {
  try { await fs.unlink(file) } catch { /* not there */ }
}
