// Settings of the real-time optimizer and protection (userData/realtime.json). Both are off by default; everything
// the renderer sends goes through normalize() so a bad value can never reach the services.
import fs from 'node:fs'
import path from 'node:path'
import { isCriticalProcessName } from '../optimizer/OptimizerUtils.js'

const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d }
const PROCESS_NAME_RE = /^[\w .+()-]{1,64}\.exe$/i

/** A process rule names an .exe; system processes are refused (closing or demoting them breaks Windows). */
export function normalizeRule(rule) {
  const name = String(rule?.name ?? '').trim()
  if (!PROCESS_NAME_RE.test(name) || isCriticalProcessName(name) || /^darkhub/i.test(name)) return null
  return { name: name.toLowerCase(), action: rule?.action === 'close' ? 'close' : 'lower' }
}

export function normalizeFolder(p) {
  const s = String(p ?? '').trim()
  return path.isAbsolute(s) && s.length < 260 ? path.normalize(s) : null
}

export function defaults(home = '') {
  return {
    optimizer: {
      enabled: false,
      memory: true,
      // act when available memory drops below this share of the total
      memoryThresholdPct: 15,
      minProcessMb: 150,
      cooldownMin: 10,
      rules: []
    },
    protection: {
      enabled: false,
      folders: home ? [path.join(home, 'Downloads'), path.join(home, 'Desktop')] : [],
      clamav: false,
      autoQuarantine: true,
      maxFileMb: 200,
      // files the user restored from quarantine: trusted, never detected again
      allowHashes: []
    }
  }
}

export function normalize(input = {}, home = '') {
  const d = defaults(home)
  const o = input.optimizer || {}
  const p = input.protection || {}
  const rules = []
  for (const r of Array.isArray(o.rules) ? o.rules : []) {
    const n = normalizeRule(r)
    if (n && !rules.some((x) => x.name === n.name)) rules.push(n)
  }
  const folders = Array.isArray(p.folders) ? [...new Set(p.folders.map(normalizeFolder).filter(Boolean))].slice(0, 12) : d.protection.folders
  return {
    optimizer: {
      enabled: o.enabled === true,
      memory: o.memory !== false,
      memoryThresholdPct: clamp(o.memoryThresholdPct, 5, 40, d.optimizer.memoryThresholdPct),
      minProcessMb: clamp(o.minProcessMb, 50, 2000, d.optimizer.minProcessMb),
      cooldownMin: clamp(o.cooldownMin, 2, 120, d.optimizer.cooldownMin),
      rules: rules.slice(0, 64)
    },
    protection: {
      enabled: p.enabled === true,
      folders,
      clamav: p.clamav === true,
      autoQuarantine: p.autoQuarantine !== false,
      maxFileMb: clamp(p.maxFileMb, 10, 2048, d.protection.maxFileMb),
      allowHashes: Array.isArray(p.allowHashes) ? [...new Set(p.allowHashes.map((h) => String(h).toLowerCase()).filter((h) => /^[0-9a-f]{64}$/.test(h)))].slice(-500) : []
    }
  }
}

export class ConfigStore {
  constructor(file, home) {
    this.file = file
    this.home = home
    this.value = normalize(this.#read(), home)
  }

  #read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { return {} }
  }

  update(patch = {}) {
    const next = normalize({
      optimizer: { ...this.value.optimizer, ...(patch.optimizer || {}) },
      protection: { ...this.value.protection, ...(patch.protection || {}) }
    }, this.home)
    this.value = next
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      // write-then-rename: a crash mid-write never leaves a truncated settings file
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(next, null, 2))
      fs.renameSync(`${this.file}.tmp`, this.file)
    } catch { /* settings stay in memory for this session */ }
    return next
  }
}
