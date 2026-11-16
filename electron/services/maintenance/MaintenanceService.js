// Scheduled maintenance: runs the app's own maintenance actions on a schedule while DarkHub is open (also in the tray).
// Off by default; a slot missed while the PC was off runs once at the next check. Results go to a history log.
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { isDue, nextRun, normalizeTask } from './schedule.js'

const CHECK_MS = 60 * 1000
const FIRST_CHECK_MS = 2 * 60 * 1000
const HISTORY_MAX = 200
// a failed run is retried after 1 h, then 2 h, 4 h... (never later than the next regular slot)
const RETRY_BASE_MS = 60 * 60 * 1000

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
    resolve({
      code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
      missing: err?.code === 'ENOENT',
      timedOut: Boolean(err?.killed),
      stdout: String(stdout || ''),
      stderr: String(stderr || '')
    })
  })
})

// "winget upgrade" with nothing to update can exit non-zero; these texts mean the list is simply empty
const WINGET_EMPTY = /No installed package|Nenhum pacote|No available upgrade|Nenhuma atualiza/i

/**
 * When an enabled task should run next: its regular slot (anchored to the last success or the (re)enable time),
 * or, after a failed attempt, a retry with backoff that never waits past the next regular slot.
 */
export function dueAt(t, now) {
  if (!t?.enabled) return null
  const slot = nextRun(t, Math.max(t.lastRunAt || 0, t.enabledAt || 0) || now)
  const failedAt = t.lastAttemptAt && t.lastAttemptAt > (t.lastRunAt || 0) ? t.lastAttemptAt : 0
  if (!failedAt) return slot
  const retry = failedAt + RETRY_BASE_MS * 2 ** Math.min(6, Math.max(0, (t.failures || 1) - 1))
  return Math.max(slot, Math.min(retry, nextRun(t, failedAt)))
}

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
    for (const [id, def] of Object.entries(TASKS)) {
      const r = raw.tasks?.[id]
      tasks[id] = { ...normalizeTask(r, def.defaults), lastRunAt: Number(r?.lastRunAt) || null, lastAttemptAt: Number(r?.lastAttemptAt) || null, failures: Number(r?.failures) || 0 }
    }
    return { tasks, history: Array.isArray(raw.history) ? raw.history : [] }
  }

  _save(state) { fs.writeFileSync(this.file, JSON.stringify(state, null, 1)) }

  state() {
    const s = this._load()
    const now = Date.now()
    const tasks = Object.fromEntries(Object.entries(s.tasks).map(([id, t]) => [id, { ...t, nextRunAt: t.enabled ? Math.max(now, dueAt(t, now)) : null }]))
    return { ok: true, tasks, history: s.history.slice(0, 50), running: this.running }
  }

  setTask(id, patch = {}) {
    if (!TASKS[id]) return { ok: false, error: 'Tarefa desconhecida' }
    const s = this._load()
    const prev = s.tasks[id]
    const next = normalizeTask({ ...prev, ...patch, options: { ...prev.options, ...(patch.options || {}) } }, TASKS[id].defaults)
    // enabling starts counting from now, so the task does not fire immediately
    if (next.enabled && !prev.enabled) next.enabledAt = Date.now()
    s.tasks[id] = { ...next, lastRunAt: prev.lastRunAt, lastAttemptAt: prev.lastAttemptAt, failures: prev.failures }
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
      // a task may finish with a summary and still be a failure (e.g. every list failed to download)
      entry = { id, at: started, ms: Date.now() - started, ok: !r.error, manual, summary: r.summary, ...(r.error ? { error: r.error } : {}) }
    } catch (e) {
      entry = { id, at: started, ms: Date.now() - started, ok: false, manual, error: String(e?.message ?? e) }
    } finally {
      this.running = null
    }
    const s = this._load()
    // only a success moves the schedule forward; a failure is retried (see dueAt)
    s.tasks[id].lastAttemptAt = started
    if (entry.ok) { s.tasks[id].lastRunAt = started; s.tasks[id].failures = 0 } else s.tasks[id].failures = (s.tasks[id].failures || 0) + 1
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
    if (!list.length) {
      if (r?.ok === false) throw new Error(r?.error || 'Falha ao atualizar as listas')
      return { summary: { updated: 0, note: 'no-lists' } }
    }
    const failed = list.filter((x) => !x.ok)
    const summary = { updated: list.length - failed.length, failed: failed.length }
    if (failed.length === list.length) return { summary, error: failed.map((x) => `${x.id}: ${x.error || 'falhou'}`).join('; ') }
    return { summary }
  }

  async _clamav() {
    const r = await this.deps.updateClamav()
    if (r?.skipped) return { summary: { note: 'not-installed' } }
    if (!r?.ok) throw new Error(r?.error || 'freshclam falhou')
    return { summary: { updated: true } }
  }

  async _saveBackups() {
    const r = await this.deps.backupSaves()
    if (r?.ok === false && !Array.isArray(r?.results)) throw new Error(r?.error || 'Falha no backup de saves')
    const res = r?.results || []
    const summary = { games: res.length, saved: res.filter((x) => x.ok && !x.skipped).length, unchanged: res.filter((x) => x.skipped).length, failed: res.filter((x) => !x.ok).length }
    if (summary.failed && summary.failed === res.length) return { summary, error: res.map((x) => x.error).filter(Boolean).slice(0, 3).join('; ') || 'Falha no backup de saves' }
    return { summary }
  }

  async _wingetUpdates(options) {
    const run = this.deps.winget || winget
    const listUpdates = async () => {
      const r = await run(['upgrade', '--source', 'winget', '--disable-interactivity', '--accept-source-agreements'], 180000)
      if (r.missing) throw new Error('winget não está instalado (App Installer)')
      if (r.timedOut) throw new Error('winget não respondeu a tempo')
      const rows = this.deps.parseWinget(r.stdout)
      if (r.code !== 0 && !rows.length && !WINGET_EMPTY.test(r.stdout)) throw new Error((r.stderr.trim() || r.stdout.trim().slice(-300)) || `winget terminou com código ${r.code}`)
      return rows
    }
    const rows = await listUpdates()
    if (!options.install || !rows.length) return { summary: { available: rows.length, names: rows.slice(0, 20).map((r) => r.name || r.Name || r.id || r.Id) } }
    // only when the user turned "install automatically" on for this task
    const up = await run(['upgrade', '--all', '--source', 'winget', '--silent', '--disable-interactivity', '--accept-package-agreements', '--accept-source-agreements'], 60 * 60000)
    const after = await listUpdates()
    const summary = { available: rows.length, installed: Math.max(0, rows.length - after.length), remaining: after.length, exitCode: up.code }
    if (up.missing || up.timedOut || (up.code !== 0 && after.length)) return { summary, error: up.timedOut ? 'winget não terminou a tempo' : `winget terminou com código ${up.code}; ${after.length} atualização(ões) pendente(s)` }
    return { summary }
  }

  async tick() {
    if (this.running) return
    const s = this._load()
    const now = Date.now()
    for (const [id, t] of Object.entries(s.tasks)) {
      if (isDue(t, t.lastRunAt, now) && dueAt(t, now) <= now) await this.runTask(id)
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
