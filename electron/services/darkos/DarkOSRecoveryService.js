// DarkOS management/recovery bridge.
//
// DarkHub never edits DarkOS state itself: every read/apply/revert goes through the shared
// PowerShell module (DarkOS.Recovery.psm1) via its CLI wrapper (DarkOS.Cli.ps1). The CLI prints
//   DKJSON:<compressed json>
//   DHDONE            or   DHFAIL|<message>
// This service validates every input, serializes all CLI calls (one at a time), applies
// timeouts, streams progress and NEVER reports success unless the module said verified===true.

import fs from 'node:fs'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { isValidAppxName } from '../optimizer/OptimizerUtils.js'

export const DARKOS_ROOT = 'C:\\ProgramData\\DarkOS'
/** State folder of "Windows mode" (DarkOS tweaks applied on a stock Windows); never shared with a real DarkOS. */
export const WINMODS_ROOT = 'C:\\ProgramData\\DarkHub\\WinMods'
export const PROFILES = Object.freeze(['darkosDefault', 'competitive', 'maxPerformance'])
export const CLI_FILE = 'DarkOS.Cli.ps1'
export const MODULE_FILE = 'DarkOS.Recovery.psm1'

const MIN = 60 * 1000

/** Whitelisted CLI commands, whether they mutate state and their timeout. */
export const COMMANDS = Object.freeze({
  'Get-DarkOSCatalog': { mutates: false, timeoutMs: 2 * MIN },
  'Get-DarkOSManifest': { mutates: false, timeoutMs: 2 * MIN },
  'Get-DarkOSStatus': { mutates: false, timeoutMs: 5 * MIN },
  'Invoke-DarkOSChange': { mutates: true, timeoutMs: 15 * MIN },
  'Set-DarkOSProfile': { mutates: true, timeoutMs: 30 * MIN },
  'Restore-DarkOSProfile': { mutates: true, timeoutMs: 30 * MIN },
  'Restore-DarkOSAppx': { mutates: true, timeoutMs: 30 * MIN },
  'Get-DarkOSRemovedApps': { mutates: false, timeoutMs: 2 * MIN },
  'New-DarkOSSnapshot': { mutates: true, timeoutMs: 10 * MIN },
  'Get-DarkOSSnapshot': { mutates: false, timeoutMs: 2 * MIN },
  'Restore-DarkOSSnapshot': { mutates: true, timeoutMs: 30 * MIN },
  'Get-DarkOSFailures': { mutates: false, timeoutMs: 2 * MIN },
  'Get-DarkOSRebootPending': { mutates: false, timeoutMs: 1 * MIN },
  'Export-DarkOSDiagnostics': { mutates: false, timeoutMs: 10 * MIN }
})

const ID_RE = /^[a-zA-Z0-9._-]+$/
/** First line printed by the wrapper script: the PowerShell host PID (used to kill the whole tree on timeout). */
const PID_LINE_RE = /^DKPID:(\d{1,10})$/
const FULL_PACKAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._~-]{1,200}$/

export function isValidChangeId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 160 && ID_RE.test(id)
}

export function isValidProfile(p) {
  return typeof p === 'string' && PROFILES.includes(p)
}

/** Package family/short names (Microsoft.BingNews) or full names (Name_1.2.3.4_x64__publisherid). */
export function isValidPackageName(name) {
  if (typeof name !== 'string') return false
  const n = name.trim()
  if (n !== name) return false
  return isValidAppxName(n) || FULL_PACKAGE_RE.test(n)
}

/** Snapshot label: printable text only, bounded length. Returns the cleaned label or null. */
export function sanitizeLabel(label) {
  if (label == null) return null
  const s = String(label).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s || s.length > 80) return null
  return s
}

/** Diagnostics destination: absolute Windows path ending in .zip without control/wildcard chars. */
export function isValidDiagnosticsDestination(p) {
  if (typeof p !== 'string' || p.length < 8 || p.length > 259) return false
  if (!path.win32.isAbsolute(p) || !/^[A-Za-z]:\\/.test(p)) return false
  if (/[\u0000-\u001f"*?<>|]/.test(p.slice(2))) return false
  return /\.zip$/i.test(p)
}

function uniqueIds(ids) {
  const list = Array.isArray(ids) ? ids : [ids]
  if (list.length === 0 || list.length > 500) throw new Error('Lista de ids invalida.')
  for (const id of list) {
    if (!isValidChangeId(id)) throw new Error(`Id de alteracao invalido: ${String(id).slice(0, 60)}`)
  }
  return [...new Set(list)]
}

/**
 * Parses CLI stdout. Success requires a DHDONE marker AND (when present) a parseable DKJSON line.
 * Returns { ok, data, error, logs }.
 */
export function parseCliOutput(stdout, stderr = '', code = 0) {
  const text = String(stdout ?? '').replace(/^﻿/, '').replace(/\0/g, '')
  const lines = text.split(/\r?\n/)
  let json = null
  let jsonSeen = false
  let jsonError = null
  let done = false
  let fail = null
  const logs = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('DKJSON:')) {
      jsonSeen = true
      try {
        json = JSON.parse(line.slice(7))
        jsonError = null
      } catch (e) {
        jsonError = `JSON invalido do modulo DarkOS: ${e?.message ?? e}`
      }
    } else if (PID_LINE_RE.test(line)) {
      continue
    } else if (line === 'DHDONE') {
      done = true
    } else if (line.startsWith('DHFAIL')) {
      fail = line.slice(6).replace(/^\|/, '').trim() || 'Falha sem mensagem.'
    } else if (!line.startsWith('DKPROG:')) {
      logs.push(line)
    }
  }
  if (fail !== null) return { ok: false, data: json, error: fail, logs }
  if (!done) {
    const err = String(stderr ?? '').trim()
    return { ok: false, data: json, error: err ? err.slice(0, 600) : `Sem marcador de conclusao (codigo ${code ?? '?'}).`, logs }
  }
  if (jsonSeen && jsonError) return { ok: false, data: null, error: jsonError, logs }
  return { ok: true, data: json, error: null, logs }
}

/** Parses an optional progress line "DKPROG:<pct>|<message>". */
export function parseProgressLine(line) {
  const m = /^DKPROG:(\d{1,3})(?:\|(.*))?$/.exec(String(line ?? '').trim())
  if (!m) return null
  return { progress: Math.max(0, Math.min(100, Number(m[1]))), message: (m[2] ?? '').trim() }
}

const PROG_STR_RE = /^DKPROG:/

/**
 * Defensive cleanup: if the module's progress callback wrote DKPROG lines to the pipeline of the
 * called function, they end up inside the DKJSON payload. Remove them (top level and `results`)
 * and unwrap the single remaining value. Returns { data, progress: string[] }.
 */
export function stripLeakedProgress(data) {
  const progress = []
  const clean = (arr) => arr.filter((x) => {
    if (typeof x === 'string' && PROG_STR_RE.test(x)) { progress.push(x); return false }
    return true
  })
  let out = data
  if (Array.isArray(out)) {
    const kept = clean(out)
    if (kept.length !== out.length) {
      out = kept.length === 1 ? kept[0] : kept
    }
  }
  // `$results += @(Invoke-DarkOSChange ...)` in PowerShell nests the returned array, so per-item
  // result lists are always flattened (and cleaned) here.
  if (out && typeof out === 'object' && !Array.isArray(out) && Array.isArray(out.results)) {
    const kept = clean(out.results.flat(Infinity))
    if (kept.length !== out.results.length || kept.some((x, i) => x !== out.results[i])) out = { ...out, results: kept }
  } else if (Array.isArray(out) && out.some(Array.isArray) && out.every((x) => Array.isArray(x) || (x && typeof x === 'object' && 'id' in x))) {
    out = clean(out.flat(Infinity))
  }
  return { data: out, progress }
}

/** Extracts per-change results from whatever shape the module returned. */
export function extractChangeResults(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const key of ['results', 'Results', 'changes']) {
      if (Array.isArray(data[key])) return data[key]
    }
    if (typeof data.id === 'string' && 'verified' in data) return [data]
  }
  return null
}

/**
 * Normalizes mutating-operation results. An item only counts as success when ok===true AND
 * verified===true. The operation is ok only when every item is verified (and there is at least one
 * item, or the module returned an explicit top-level verified===true for non-itemized ops).
 */
export function summarizeChangeResults(data, { securityDeclined = false } = {}) {
  const items = extractChangeResults(data)
  if (!items) {
    const verified = Boolean(data && typeof data === 'object' && data.verified === true && data.ok !== false)
    return {
      ok: verified,
      results: [],
      failed: [],
      rebootRequired: Boolean(data?.rebootRequired),
      error: verified ? null : (data?.error || 'O modulo DarkOS nao confirmou (verified) a operacao.')
    }
  }
  const results = items.map((r) => {
    const verified = r?.verified === true
    const ok = r?.ok === true && verified
    // Applied but only verifiable after a restart: never a success, never a hard failure.
    const pendingReboot = !verified && r?.ok === true && r?.rebootRequired === true
    // Security item refused by the module because the user did not confirm it: skipped on purpose.
    // Set-DarkOSProfile reports these itself ({ skipped: true, reason: 'requiresConfirmation' }, error null);
    // Invoke-DarkOSChange reports them as an error mentioning ConfirmSecurity.
    const skipped = !ok && (r?.skipped === true || (securityDeclined && /ConfirmSecurity/.test(String(r?.error ?? ''))))
    return {
      id: typeof r?.id === 'string' ? r.id : String(r?.id ?? r?.PackageName ?? r?.packageName ?? '?'),
      ok,
      verified,
      rebootRequired: r?.rebootRequired === true,
      pendingReboot,
      skipped,
      error: pendingReboot
        ? 'Aguardando reinicio para verificar.'
        : r?.ok === true && !verified ? (r?.error || 'Aplicado, mas a verificacao nao confirmou o estado.') : (r?.error ?? null)
    }
  })
  const failed = results.filter((r) => !r.ok && !r.pendingReboot && !r.skipped)
  const pending = results.filter((r) => r.pendingReboot)
  const skipped = results.filter((r) => r.skipped)
  // An empty result list means the module had nothing to change (DHDONE was still required upstream).
  let error = null
  if (failed.length) error = `${failed.length} de ${results.length} item(ns) nao verificados.`
  else if (pending.length) error = `${pending.length} item(ns) aplicados; a verificacao so sera possivel apos reiniciar.`
  return {
    ok: failed.length === 0 && pending.length === 0,
    status: failed.length ? 'failed' : pending.length ? 'pending-reboot' : 'ok',
    noop: results.length === 0,
    results,
    failed,
    pending,
    skipped,
    rebootRequired: results.some((r) => r.rebootRequired) || data?.rebootRequired === true,
    error
  }
}

/** PowerShell single-quoted literal. */
function psq(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function defaultBundledDir() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    // Inside a packaged app the .ps1/.psm1 files live in app.asar.unpacked (see asarUnpack).
    return here.replace(/app\.asar(?![.\w])/, 'app.asar.unpacked')
  } catch {
    return null
  }
}

/** Grace period between our own tree-kill and PowerShellRunner's last-resort kill of the host process. */
const KILL_GRACE_MS = 15 * 1000

async function defaultRunner({ script, timeoutMs, onLine }) {
  const { runPowerShell, runCommand } = await import('../PowerShellRunner.js')
  let pending = ''
  let pid = null
  let timedOut = false
  const onStdout = (chunk) => {
    pending += chunk
    const parts = pending.split(/\r?\n/)
    pending = parts.pop() ?? ''
    for (const p of parts) {
      const m = PID_LINE_RE.exec(p.trim())
      if (m) pid = Number(m[1])
      else onLine?.(p)
    }
  }
  // On timeout kill the WHOLE tree (winget/DISM/robocopy children included) while the host is still
  // alive: PowerShellRunner's own timeout only kills powershell.exe and would orphan its children,
  // which would then race the next queued operation.
  const timer = setTimeout(() => {
    timedOut = true
    if (pid) runCommand('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { timeoutMs: 10000 }).catch(() => {})
  }, timeoutMs)
  try {
    const res = await runPowerShell(script, { timeoutMs: timeoutMs + KILL_GRACE_MS, onStdout, maxBuffer: 32 * 1024 * 1024 })
    if (pending) onLine?.(pending)
    if (timedOut) throw new Error(`Command timed out after ${timeoutMs}ms`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function defaultIsElevated() {
  try {
    const mod = await import('../optimizer/ElevationHelper.js')
    return await mod.default.isElevated()
  } catch {
    return false
  }
}

let runSeq = 0

export class DarkOSRecoveryService extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.root]        DarkOS root (default C:\ProgramData\DarkOS)
   * @param {string} [opts.bundledDir]  Fallback folder with the module shipped inside DarkHub
   * @param {Function} [opts.runner]    ({script,timeoutMs,onLine}) => Promise<{code,stdout,stderr}>
   * @param {Function} [opts.isElevated]
   * @param {object} [opts.fsImpl]
   * @param {object} [opts.logger]
   * @param {'darkos'|'windows'} [opts.mode]  'windows' runs the bundled module + catalog against WINMODS_ROOT
   */
  constructor(opts = {}) {
    super()
    this.mode = opts.mode === 'windows' ? 'windows' : 'darkos'
    this.root = opts.root || (this.mode === 'windows' ? WINMODS_ROOT : DARKOS_ROOT)
    this.bundledDir = opts.bundledDir === undefined ? defaultBundledDir() : opts.bundledDir
    this.runner = opts.runner || defaultRunner
    this.isElevated = opts.isElevated || defaultIsElevated
    this.fs = opts.fsImpl || fs
    this.logger = opts.logger || null
    this._tail = Promise.resolve()
    this._pending = 0
    this._current = null
  }

  get manifestPath() {
    return path.win32.join(this.root, 'Recovery', 'manifest.json')
  }

  isDarkOS() {
    try {
      return this.fs.existsSync(this.manifestPath)
    } catch {
      return false
    }
  }

  /**
   * Runs the newest module: the "# ModuleVersion: N" header decides (no header = 0), ties keep the installed copy.
   * Otherwise fixes shipped with DarkHub would never reach a DarkOS machine that has an older module in bin\.
   * Both files of a pair must exist.
   */
  /** DarkOS mode needs the DarkOS manifest; Windows mode works on any Windows that has the bundled module. */
  available() {
    return this.mode === 'windows' ? Boolean(this.resolveCli()) : this.isDarkOS()
  }

  get catalogPath() {
    return this.bundledDir ? path.join(this.bundledDir, 'policy', 'catalog.json') : null
  }

  resolveCli() {
    const candidates = [
      // Windows mode always uses the bundled module: it is the one that knows -Mode / -CatalogPath.
      ...(this.mode === 'windows' ? [] : [{ dir: path.win32.join(this.root, 'bin'), source: 'installed' }]),
      ...(this.bundledDir ? [{ dir: this.bundledDir, source: 'bundled' }] : [])
    ]
    let best = null
    for (const c of candidates) {
      const cli = path.join(c.dir, CLI_FILE)
      const mod = path.join(c.dir, MODULE_FILE)
      try {
        if (!this.fs.existsSync(cli) || !this.fs.existsSync(mod)) continue
      } catch { continue }
      let version = 0
      try { version = Number(/^# ModuleVersion:\s*(\d+)/m.exec(String(this.fs.readFileSync(mod, 'utf8')).slice(0, 4000))?.[1] || 0) } catch { /* unreadable: 0 */ }
      if (!best || version > best.version) best = { cliPath: cli, modulePath: mod, source: c.source, version }
    }
    return best
  }

  info() {
    const cli = this.resolveCli()
    return {
      ok: true,
      mode: this.mode,
      isDarkOS: this.mode === 'darkos' && this.isDarkOS(),
      root: this.root,
      cliSource: cli?.source ?? null,
      cliAvailable: Boolean(cli),
      busy: this._pending > 0,
      current: this._current
    }
  }

  _emit(evt, onEvent) {
    const payload = { ...evt, timestamp: Date.now() }
    try { this.emit('event', payload) } catch { /* listener errors are not ours */ }
    if (typeof onEvent === 'function') {
      try { onEvent(payload) } catch { /* renderer gone */ }
    }
  }

  /** Serializes work: each task starts only after the previous one settled. */
  _enqueue(task) {
    this._pending++
    const run = this._tail.then(task, task)
    this._tail = run.then(() => undefined, () => undefined).finally(() => { this._pending-- })
    return run
  }

  buildScript(cliPath, command, args) {
    const json = JSON.stringify(args ?? {})
    const winArgs = this.mode === 'windows' ? ` -Root ${psq(this.root)} -Mode Windows -CatalogPath ${psq(this.catalogPath)}` : ''
    return [
      "$ErrorActionPreference = 'Stop'",
      "$ProgressPreference = 'SilentlyContinue'",
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '[Console]::Out.WriteLine("DKPID:$PID"); [Console]::Out.Flush()',
      `& ${psq(cliPath)} -Command ${psq(command)} -ArgsJson ${psq(json)}${winArgs}`
    ].join('\n')
  }

  /**
   * Runs one whitelisted CLI command (queued). Returns { ok, data, error, runId }.
   * @param {string} command
   * @param {object} args
   * @param {{label?:string,onEvent?:Function}} [opts]
   */
  run(command, args = {}, opts = {}) {
    const spec = COMMANDS[command]
    if (!spec) return Promise.resolve({ ok: false, error: `Comando DarkOS nao permitido: ${command}` })
    const runId = `darkos-${Date.now()}-${++runSeq}`
    const label = opts.label || command
    const onEvent = opts.onEvent

    if (spec.mutates) this._emit({ runId, type: 'log', message: `${label}: aguardando na fila...` }, onEvent)

    return this._enqueue(async () => {
      if (!this.available()) {
        return { ok: false, runId, error: this.mode === 'windows' ? 'Modulo de mods do DarkOS nao encontrado no DarkHub.' : 'Este Windows nao e o DarkOS (manifest.json nao encontrado).' }
      }
      const cli = this.resolveCli()
      if (!cli) {
        return { ok: false, runId, error: 'Modulo DarkOS.Recovery nao encontrado (nem instalado, nem embutido no DarkHub).' }
      }
      if (spec.mutates && !(await this.isElevated())) {
        return { ok: false, runId, error: 'O DarkHub precisa estar em modo administrador para alterar o DarkOS.' }
      }

      this._current = { runId, command, label, startedAt: Date.now() }
      // Only mutating runs are announced: reads never emit run-finish, so a run-start for them would leave
      // the renderer's activity panel stuck in "running" after every refresh.
      if (spec.mutates) this._emit({ runId, type: 'run-start', message: `${label}: iniciando`, progress: 0 }, onEvent)
      const onLine = (line) => {
        const text = String(line ?? '').trim()
        if (!text || text.startsWith('DKJSON:') || text === 'DHDONE' || PID_LINE_RE.test(text)) return
        const prog = parseProgressLine(text)
        if (prog) {
          if (!spec.mutates) return
          this._emit({ runId, type: 'progress', progress: prog.progress, message: prog.message || `${prog.progress}%` }, onEvent)
        } else if (text.startsWith('DHFAIL') && spec.mutates) {
          this._emit({ runId, type: 'log', message: text.replace(/^DHFAIL\|?/, 'Falha: ') }, onEvent)
        } else if (spec.mutates) {
          this._emit({ runId, type: 'log', message: text.slice(0, 400) }, onEvent)
        }
      }

      let parsed
      try {
        const res = await this.runner({ script: this.buildScript(cli.cliPath, command, args), timeoutMs: spec.timeoutMs, onLine })
        parsed = parseCliOutput(res?.stdout, res?.stderr, res?.code)
      } catch (e) {
        const msg = e?.message ?? String(e)
        parsed = { ok: false, data: null, error: /timed out/i.test(msg) ? `Tempo limite excedido (${Math.round(spec.timeoutMs / 1000)}s).` : msg }
      } finally {
        this._current = null
      }
      if (parsed.data != null) {
        const stripped = stripLeakedProgress(parsed.data)
        parsed.data = stripped.data
        if (spec.mutates) {
          for (const line of stripped.progress) {
            const prog = parseProgressLine(line)
            if (prog) this._emit({ runId, type: 'log', message: `[${prog.progress}%] ${prog.message}` }, onEvent)
          }
        }
      }
      try { this.logger?.info?.('DarkOS', `${command} ok=${parsed.ok}${parsed.error ? ` err=${parsed.error}` : ''}`) } catch { /* ignore */ }
      return { ok: parsed.ok, data: parsed.data, error: parsed.error, runId }
    })
  }

  /** Runs a mutating command and only reports success when every item is verified. */
  async _runChange(command, args, opts = {}) {
    const res = await this.run(command, args, opts)
    const runId = res.runId
    if (!res.ok) {
      if (runId) this._emit({ runId, type: 'error', ok: false, error: res.error, message: res.error }, opts.onEvent)
      return { ok: false, error: res.error, results: extractChangeResults(res.data) ? summarizeChangeResults(res.data).results : [], runId }
    }
    const summary = summarizeChangeResults(res.data, { securityDeclined: opts.securityDeclined === true })
    const verifiedCount = summary.results.filter((r) => r.ok).length
    const skippedNote = summary.skipped?.length ? ` ${summary.skipped.length} item(ns) de seguranca ignorados (sem confirmacao).` : ''
    const message = summary.ok
      ? (verifiedCount === 0 ? `Nada a alterar.${skippedNote}` : `Concluido e verificado (${verifiedCount} item(ns)).${skippedNote}`)
      : (summary.error || 'Falha na verificacao.')
    this._emit({ runId, type: summary.ok ? 'run-finish' : 'error', ok: summary.ok, progress: 100, message, error: summary.ok ? undefined : message }, opts.onEvent)
    return { ...summary, message, runId }
  }

  async _read(command, args, opts) {
    const res = await this.run(command, args, opts)
    return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error }
  }

  // ---- public API (all inputs validated here; the renderer is never trusted) ----

  getCatalog(payload = {}, opts) {
    const args = {}
    if (payload?.profile != null) {
      if (!isValidProfile(payload.profile)) return Promise.resolve({ ok: false, error: 'Perfil invalido.' })
      args.Profile = payload.profile
    }
    return this._read('Get-DarkOSCatalog', args, opts)
  }

  getManifest(opts) {
    return this._read('Get-DarkOSManifest', {}, opts)
  }

  getStatus(payload = {}, opts) {
    const args = {}
    if (payload?.ids != null) {
      try { args.Id = uniqueIds(payload.ids) } catch (e) { return Promise.resolve({ ok: false, error: e.message }) }
    }
    return this._read('Get-DarkOSStatus', args, opts)
  }

  _change(action, payload, opts) {
    let ids
    try { ids = uniqueIds(payload?.ids ?? payload?.id) } catch (e) { return Promise.resolve({ ok: false, error: e.message, results: [] }) }
    const args = { Id: ids, Action: action, Source: 'darkhub' }
    // Security-related items are refused by the module unless this is an explicit boolean true.
    if (payload?.confirmSecurity === true) args.ConfirmSecurity = true
    const label = `${action === 'Apply' ? 'Reaplicar' : 'Desfazer'} ${ids.length === 1 ? ids[0] : `${ids.length} itens`}`
    return this._runChange('Invoke-DarkOSChange', args, { ...opts, label, securityDeclined: args.ConfirmSecurity !== true })
  }

  applyChange(payload, opts) {
    return this._change('Apply', payload, opts)
  }

  revertChange(payload, opts) {
    return this._change('Revert', payload, opts)
  }

  setProfile(payload, opts) {
    if (!isValidProfile(payload?.profile)) return Promise.resolve({ ok: false, error: 'Perfil invalido.', results: [] })
    const args = { Profile: payload.profile }
    if (payload?.confirmSecurity === true) args.ConfirmSecurity = true
    return this._runChange('Set-DarkOSProfile', args, { ...opts, label: `Perfil ${payload.profile}`, securityDeclined: args.ConfirmSecurity !== true })
  }

  restoreProfile(opts) {
    return this._runChange('Restore-DarkOSProfile', {}, { ...opts, label: 'Restaurar tudo ao original' })
  }

  getRemovedApps(opts) {
    return this._read('Get-DarkOSRemovedApps', {}, opts)
  }

  restoreAppx(payload, opts) {
    const list = Array.isArray(payload?.packageNames) ? payload.packageNames : [payload?.packageName]
    if (list.length === 0 || list.length > 200 || !list.every(isValidPackageName)) {
      return Promise.resolve({ ok: false, error: 'Nome de pacote invalido.', results: [] })
    }
    return this._runChange('Restore-DarkOSAppx', { PackageName: [...new Set(list)] }, { ...opts, label: `Restaurar ${list.length} app(s)` })
  }

  listSnapshots(opts) {
    return this._read('Get-DarkOSSnapshot', {}, opts)
  }

  async createSnapshot(payload, opts) {
    const label = sanitizeLabel(payload?.label ?? `Snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`)
    if (!label) return { ok: false, error: 'Nome do snapshot invalido (1 a 80 caracteres).' }
    const res = await this.run('New-DarkOSSnapshot', { Label: label }, { ...opts, label: 'Criar snapshot' })
    // A snapshot only counts when the module returned its id.
    const id = res.data?.id ?? res.data?.Id
    const ok = res.ok && typeof id === 'string' && isValidChangeId(id)
    const message = ok ? `Snapshot criado: ${label}` : (res.error || 'O modulo nao retornou o id do snapshot.')
    this._emit({ runId: res.runId, type: ok ? 'run-finish' : 'error', ok, progress: 100, message, error: ok ? undefined : message }, opts?.onEvent)
    return ok ? { ok: true, snapshot: res.data, runId: res.runId } : { ok: false, error: message, runId: res.runId }
  }

  restoreSnapshot(payload, opts) {
    if (!isValidChangeId(payload?.id)) return Promise.resolve({ ok: false, error: 'Id de snapshot invalido.', results: [] })
    return this._runChange('Restore-DarkOSSnapshot', { Id: payload.id }, { ...opts, label: `Restaurar snapshot ${payload.id}`, securityDeclined: true })
  }

  getFailures(opts) {
    return this._read('Get-DarkOSFailures', {}, opts)
  }

  getRebootPending(opts) {
    return this._read('Get-DarkOSRebootPending', {}, opts)
  }

  async exportDiagnostics(payload, opts) {
    const dest = payload?.destination
    if (!isValidDiagnosticsDestination(dest)) return { ok: false, error: 'Destino invalido (use um caminho .zip absoluto).' }
    const res = await this.run('Export-DarkOSDiagnostics', { Destination: dest }, { ...opts, label: 'Exportar diagnostico' })
    let exists = false
    try { exists = res.ok && this.fs.existsSync(dest) } catch { exists = false }
    const ok = res.ok && exists
    const message = ok ? `Diagnostico salvo em ${dest}` : (res.error || 'O arquivo de diagnostico nao foi criado.')
    this._emit({ runId: res.runId, type: ok ? 'run-finish' : 'error', ok, progress: 100, message, error: ok ? undefined : message }, opts?.onEvent)
    return ok ? { ok: true, path: dest, runId: res.runId } : { ok: false, error: message, runId: res.runId }
  }
}

export default DarkOSRecoveryService
