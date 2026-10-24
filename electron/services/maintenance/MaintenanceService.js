// Scheduled maintenance: runs the app's own maintenance actions on a schedule while DarkHub is open (also in the tray).
// Off by default; a slot missed while the PC was off runs once at the next check. Results go to a history log.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { isDue, nextRun, normalizeTask } from './schedule.js'

const CHECK_MS = 60 * 1000
const FIRST_CHECK_MS = 2 * 60 * 1000
const HISTORY_MAX = 200

/** Every task: defaults (schedule + options) and what it runs. Each run returns { summary, details? }. */
export const TASKS = {
  cleanTemp: { defaults: { freq: 'weekly', weekday: 0, time: '03:00' } },
  securityLists: { defaults: { freq: 'daily', time: '04:00' } },
  clamav: { defaults: { freq: 'daily', time: '04:30' } },
  saveBackups: { defaults: { freq: 'weekly', weekday: 0, time: '20:00' } },
  wingetUpdates: { defaults: { freq: 'weekly', weekday: 6, time: '12:00', options: { install: false } } }
}

const winget = (args, timeoutMs) => new Promise((resolve) => {
  execFile('winget.exe', args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
    resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })
  })
})

export class MaintenanceService {
  constructor({ app, notify, onEvent, deps }) {
    this.file = path.join(app.getPath('userData'), 'maintenance.json')
    this.notify = notify
    this.onEvent = onEvent
    // the actions come from the services that already implement them (injected so tests can fake them)
    this.deps = deps
    this.running = null
    this.timer = null
  }

  _load() {
    let raw = {}
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { /* first run */ }
    const tasks = {}
    for (const [id, def] of Object.entries(TASKS)) tasks[id] = { ...normalizeTask(raw.tasks?.[id], def.defaults), lastRunAt: Number(raw.tasks?.[id]?.lastRunAt) || null }
    return { tasks, history: Array.isArray(raw.history) ? raw.history : [] }
  }

  _save(state) { fs.writeFileSync(this.file, JSON.stringify(state, null, 1)) }

  state() {
    const s = this._load()
    const now = Date.now()
    const tasks = Object.fromEntries(Object.entries(s.tasks).map(([id, t]) => [id, { ...t, nextRunAt: t.enabled ? nextRun(t, Math.max(now, t.lastRunAt || 0)) : null }]))
    return { ok: true, tasks, history: s.history.slice(0, 50), running: this.running }
  }

  setTask(id, patch = {}) {
    if (!TASKS[id]) return { ok: false, error: 'Tarefa desconhecida' }
    const s = this._load()
    const prev = s.tasks[id]
    const next = normalizeTask({ ...prev, ...patch, options: { ...prev.options, ...(patch.options || {}) } }, TASKS[id].defaults)
    // enabling starts counting from now, so the task does not fire immediately
    if (next.enabled && !prev.enabled) next.enabledAt = Date.now()
    s.tasks[id] = { ...next, lastRunAt: prev.lastRunAt }
    this._save(s)
    return this.state()
  }

  async runTask(id, { manual = false } = {}) {
    if (!TASKS[id]) return { ok: false, error: 'Tarefa desconhecida' }
    if (this.running) return { ok: false, error: 'Outra tarefa de manutenção está rodando' }
    this.running = id
    this.onEvent?.({ type: 'started', id })
    const started = Date.now()
    let entry
    try {
      const options = this._load().tasks[id].options
      const r = await this[`_${id}`](options)
      entry = { id, at: started, ms: Date.now() - started, ok: true, manual, summary: r.summary }
    } catch (e) {
      entry = { id, at: started, ms: Date.now() - started, ok: false, manual, error: String(e?.message ?? e) }
    } finally {
      this.running = null
    }
    const s = this._load()
    s.tasks[id].lastRunAt = started
    s.history = [entry, ...s.history].slice(0, HISTORY_MAX)
    this._save(s)
    this.onEvent?.({ type: 'finished', ...entry })
    if (!manual) this.notify?.(entry)
    return { ok: entry.ok, entry, error: entry.error }
  }

  async _cleanTemp() {
    const r = await this.deps.cleanTemp()
    if (!r?.ok) throw new Error(r?.error || r?.message || 'Falha na limpeza')
    return { summary: { freedBytes: r.freedBytes ?? 0, files: r.processedItems ?? 0, locked: r.lockedFiles ?? 0 } }
  }

  async _securityLists() {
    const r = await this.deps.updateSecurityLists()
    const list = Array.isArray(r?.results) ? r.results : []
    if (!list.length) return { summary: { updated: 0, note: 'no-lists' } }
    return { summary: { updated: list.filter((x) => x.ok).length, failed: list.filter((x) => !x.ok).length } }
  }

  async _clamav() {
    const r = await this.deps.updateClamav()
    if (r?.skipped) return { summary: { note: 'not-installed' } }
    if (!r?.ok) throw new Error(r?.error || 'freshclam falhou')
    return { summary: { updated: true } }
  }

  async _saveBackups() {
    const r = await this.deps.backupSaves()
    const res = r?.results || []
    return { summary: { games: res.length, saved: res.filter((x) => x.ok && !x.skipped).length, unchanged: res.filter((x) => x.skipped).length, failed: res.filter((x) => !x.ok).length } }
  }

  async _wingetUpdates(options) {
    const list = await winget(['upgrade', '--disable-interactivity'], 180000)
    const rows = this.deps.parseWinget(list.stdout)
    if (!options.install || !rows.length) return { summary: { available: rows.length, names: rows.slice(0, 20).map((r) => r.name || r.Name || r.id || r.Id) } }
    // only when the user turned "install automatically" on for this task
    const up = await winget(['upgrade', '--all', '--silent', '--disable-interactivity', '--accept-package-agreements', '--accept-source-agreements'], 60 * 60000)
    const after = this.deps.parseWinget((await winget(['upgrade', '--disable-interactivity'], 180000)).stdout)
    return { summary: { available: rows.length, installed: Math.max(0, rows.length - after.length), remaining: after.length, exitCode: up.code } }
  }

  async tick() {
    if (this.running) return
    const s = this._load()
    const now = Date.now()
    for (const [id, t] of Object.entries(s.tasks)) {
      if (isDue(t, t.lastRunAt, now)) await this.runTask(id)
    }
  }

  start() {
    const first = setTimeout(() => { void this.tick() }, FIRST_CHECK_MS)
    first.unref?.()
    this.timer = setInterval(() => { void this.tick() }, CHECK_MS)
    this.timer.unref?.()
  }

  stop() { clearInterval(this.timer) }
}
