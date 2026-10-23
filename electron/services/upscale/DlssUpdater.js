// Keeps a game's NVIDIA DLSS runtimes current (super resolution, ray reconstruction, frame generation), like DLSS
// Swapper / DLSS 5 Autopilot's "dlss page". The new DLLs come only from NVIDIA's own SDK repository (NVIDIA/DLSS,
// lib/Windows_x86_64/rel at the latest release tag) and are installed only if they are 64-bit images carrying a valid
// NVIDIA Authenticode signature. The game's file is kept beside it as <name>.darkhub-original and comes back on restore.
import cp from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { downloadToFile, fetchJson } from '../SecureDownload.js'
import { compareVersions, isPe64, peFileVersion } from './pe.js'

export const DLSS_FILES = { 'nvngx_dlss.dll': 'sr', 'nvngx_dlssd.dll': 'rr', 'nvngx_dlssg.dll': 'fg' }
const RELEASES = 'https://api.github.com/repos/NVIDIA/DLSS/releases/latest'
const RAW = (tag, name) => `https://raw.githubusercontent.com/NVIDIA/DLSS/${tag}/lib/Windows_x86_64/rel/${name}`
const HOSTS = ['api.github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com']
const ORIGINAL_SUFFIX = '.darkhub-original'
const RECORD = 'darkhub-dlss-update.json'
const MAX_DEPTH = 5
// Folders an anti-cheat lives in: a changed DLL there can be treated as tampering, so "update all" skips the game.
const ANTICHEAT = /^(easyanticheat|battleye|eac|vanguard|xigncode3?|nprotect|gameguard|anticheatexpert|ricochet|faceit)$/i
const SKIP_DIRS = new Set(['$recyclebin', 'node_modules', '__pycache__', '.git', 'shadercache', 'logs', 'crashes', 'saved'])

/** Finds DLSS runtimes and anti-cheat folders under a game folder (bounded depth, no symlink following). */
export function scanGameFolder(root) {
  const dlls = []
  let anticheat = null
  const walk = (dir, depth) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (ANTICHEAT.test(e.name)) anticheat ||= e.name
        if (depth < MAX_DEPTH && !e.isSymbolicLink() && !SKIP_DIRS.has(e.name.toLowerCase())) walk(full, depth + 1)
      } else if (e.isFile() && DLSS_FILES[e.name.toLowerCase()]) {
        let version = null
        try { version = peFileVersion(full) } catch { /* unreadable */ }
        dlls.push({ file: full, name: e.name.toLowerCase(), kind: DLSS_FILES[e.name.toLowerCase()], version, hasOriginal: fs.existsSync(full + ORIGINAL_SUFFIX), x64: safe(() => isPe64(full)) })
      }
    }
  }
  walk(root, 0)
  return { dlls, anticheat }
}
const safe = (fn) => { try { return fn() } catch { return false } }

function verifySignature(file) {
  // Authenticode check through Windows itself; the path travels in an environment variable, never inside the script.
  const ps = "$s = Get-AuthenticodeSignature -LiteralPath $env:DH_VERIFY_FILE; '{0}|{1}' -f $s.Status, $s.SignerCertificate.Subject"
  try {
    const out = cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 30000, env: { ...process.env, DH_VERIFY_FILE: file } }).trim()
    const [status, subject] = out.split('|')
    return status === 'Valid' && /O=NVIDIA Corporation/.test(subject || '')
  } catch { return false }
}

export class DlssUpdater {
  constructor(cacheRoot, { fetchJsonImpl = fetchJson, download = downloadToFile, verify = verifySignature } = {}) {
    this.cacheRoot = cacheRoot
    Object.assign(this, { fetchJsonImpl, download, verify })
    this.latestCache = null
  }

  /** {tag, version} of NVIDIA's newest SDK release (cached 6 h). */
  async latest() {
    if (this.latestCache && Date.now() - this.latestCache.at < 6 * 3600000) return this.latestCache.value
    const rel = await this.fetchJsonImpl(RELEASES, { allowedHosts: HOSTS })
    const tag = String(rel?.tag_name || '')
    if (!/^v\d+(\.\d+)+$/.test(tag)) throw new Error('unexpected NVIDIA/DLSS release tag')
    const value = { tag, version: tag.slice(1) }
    this.latestCache = { at: Date.now(), value }
    return value
  }

  /** Local path of NVIDIA's verified DLL for this tag (downloaded once, then reused for every game). */
  async officialDll(tag, name) {
    const dir = path.join(this.cacheRoot, tag)
    const file = path.join(dir, name)
    if (fs.existsSync(file)) return file
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${file}.download`
    await this.download(RAW(tag, name), tmp, { allowedHosts: HOSTS, maxBytes: 300 * 1048576, timeoutMs: 10 * 60000 })
    if (!isPe64(tmp) || !this.verify(tmp)) {
      fs.rmSync(tmp, { force: true })
      throw new Error(`${name}: not a 64-bit DLL signed by NVIDIA, discarded`)
    }
    fs.renameSync(tmp, file)
    return file
  }

  /** Per-file status for a game folder: current version, NVIDIA's newest, and whether it is behind. */
  async inspect(gameDir) {
    const { tag, version } = await this.latest()
    const { dlls, anticheat } = scanGameFolder(gameDir)
    return {
      latest: version,
      tag,
      anticheat,
      files: dlls.map((d) => ({ ...d, behind: Boolean(d.version && d.x64 && compareVersions(d.version, version) < 0) }))
    }
  }

  /** Updates every DLSS runtime of the game that is behind NVIDIA's newest. Refuses anti-cheat games unless forced. */
  async update(gameDir, { force = false, onLog = () => {} } = {}) {
    const info = await this.inspect(gameDir)
    if (info.anticheat && !force) return { ok: false, error: `anti-cheat (${info.anticheat}): a changed DLL can be flagged as tampering`, ...info }
    const updated = []
    for (const f of info.files.filter((x) => x.behind)) {
      const source = await this.officialDll(info.tag, f.name)
      const original = f.file + ORIGINAL_SUFFIX
      // the game's own build is kept once; a later update never overwrites that backup
      if (!fs.existsSync(original)) fs.copyFileSync(f.file, original)
      const tmp = `${f.file}.darkhub-new`
      fs.copyFileSync(source, tmp)
      fs.renameSync(tmp, f.file)
      updated.push({ file: f.file, from: f.version, to: info.latest })
      onLog(`${path.relative(gameDir, f.file)}: ${f.version} -> ${info.latest}`)
    }
    if (updated.length) this.#record(gameDir, updated)
    return { ok: true, updated, ...(await this.inspect(gameDir)) }
  }

  /** Puts back every original the updater kept under this game folder. */
  restore(gameDir) {
    const restored = []
    for (const d of scanGameFolder(gameDir).dlls) {
      const original = d.file + ORIGINAL_SUFFIX
      if (!fs.existsSync(original)) continue
      fs.copyFileSync(original, d.file)
      fs.rmSync(original, { force: true })
      restored.push(d.file)
    }
    if (restored.length) fs.rmSync(path.join(gameDir, RECORD), { force: true })
    return { ok: true, restored }
  }

  #record(gameDir, updated) {
    const file = path.join(gameDir, RECORD)
    let prev = []
    try { prev = JSON.parse(fs.readFileSync(file, 'utf8')).history || [] } catch { /* first update */ }
    try { fs.writeFileSync(file, JSON.stringify({ tool: 'DarkHub', history: [...prev, { at: new Date().toISOString(), updated }].slice(-20) }, null, 2)) } catch { /* read-only folder: the backups still exist */ }
  }
}
