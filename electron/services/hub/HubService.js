// Installs and removes DarkHub packages (modules/presets). Registry and service items go through the Optimizer's
// change-set engine (captures the previous values, applies, reads back, restores exactly); DarkHub tweaks referenced
// with `use` go through their own definitions; operations (`op`) run their own execute/revert; scheduled tasks are
// captured and restored here.
import fs from 'node:fs'
import path from 'node:path'
import { runPowerShellJson } from '../PowerShellRunner.js'
import ElevationHelper from '../optimizer/ElevationHelper.js'
import { psQuote, regEntryId, regValueMatches, canonicalRegValue } from '../optimizer/OptimizerUtils.js'
import {
  validatePackage, resolvePackage, toChangeSet, touchedEntries, describeStep, textOf, hardwareFromRaw, presetFromState, serviceKey, newerAppNeeded } from './hubModel.js'
import { buildBuiltins } from './builtins.js'
import { describeExtension } from './extensionModel.js'

const HW_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Manufacturer
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name })
$chassis = @((Get-CimInstance Win32_SystemEnclosure).ChassisTypes)
$battery = @(Get-CimInstance Win32_Battery).Count
$ram = (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory
$build = (Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion').CurrentBuildNumber
$wired = [bool](Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -and $_.MediaType -eq '802.3' })
[pscustomobject]@{ cpu = $cpu; gpus = $gpus; chassis = $chassis; battery = $battery; ram = $ram; build = $build; wired = $wired } | ConvertTo-Json -Compress
`

/**
 * PowerShell list of tasks as objects. Not nested arrays: @(@('a','b')) with ONE element is flattened by PowerShell
 * and the loop then walks the strings (found in the VM: "TaskName is null").
 */
export function psTaskList(tasks) {
  return `@(${tasks.map((t) => `[pscustomobject]@{ p = ${psQuote(t.path)}; n = ${psQuote(t.name)}; on = ${t.state === 'enabled' ? '$true' : '$false'} }`).join(', ')})`
}

const taskReadScript = (tasks) => `
$ErrorActionPreference = 'SilentlyContinue'
$out = @()
foreach ($t in ${psTaskList(tasks)}) {
  $x = Get-ScheduledTask -TaskPath $t.p -TaskName $t.n -ErrorAction SilentlyContinue
  $out += [pscustomobject]@{ path = $t.p; name = $t.n; exists = [bool]$x; state = if ($x) { [string]$x.State } else { '' } }
}
ConvertTo-Json -InputObject @($out) -Compress
`

/** Elevated script that sets each task to the wanted state and reads it back. ASCII only. */
export function taskApplyScript(tasks) {
  return `foreach ($t in ${psTaskList(tasks)}) {
  $x = Get-ScheduledTask -TaskPath $t.p -TaskName $t.n -ErrorAction SilentlyContinue
  if (-not $x) { continue }
  if ($t.on) { Enable-ScheduledTask -TaskPath $t.p -TaskName $t.n -ErrorAction Stop | Out-Null } else { Disable-ScheduledTask -TaskPath $t.p -TaskName $t.n -ErrorAction Stop | Out-Null }
  $now = [string](Get-ScheduledTask -TaskPath $t.p -TaskName $t.n).State
  if ($t.on -and $now -eq 'Disabled') { throw ('tarefa nao habilitou: ' + $t.p + $t.n) }
  if (-not $t.on -and $now -ne 'Disabled') { throw ('tarefa nao desabilitou: ' + $t.p + $t.n) }
}`
}

const opFailed = (r) => !r || r.status === 'Error' || r.ok === false

export class HubService {
  /** deps: { app, tweaks (DeepTweaksEngine), optimizer (SystemOptimizerService), darkosRoot } */
  constructor({ app, tweaks, optimizer = null, darkosRoot = 'C:\\ProgramData\\DarkOS' }) {
    this.app = app
    this.tweaks = tweaks
    this.optimizer = optimizer
    this.darkosRoot = darkosRoot
    this.dir = path.join(app.getPath('userData'), 'hub')
    this.file = path.join(this.dir, 'installed.json')
    this._hw = null
    this._busy = false
    this._builtins = null
  }

  // ------------------------------------------------------------------ state
  _load() { try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) } catch { return { packages: {} } } }
  _save(state) { fs.mkdirSync(this.dir, { recursive: true }); fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(state, null, 1)); fs.renameSync(`${this.file}.tmp`, this.file) }

  builtins() { return (this._builtins ||= buildBuiltins(this.tweaks, this.optimizer)) }

  async hardware(force = false) {
    if (this._hw && !force && Date.now() - this._hw.at < 5 * 60_000) return this._hw.value
    const { data } = await runPowerShellJson(HW_SCRIPT, { timeoutMs: 30000, fallback: {}, allowNonZero: true })
    const darkos = fs.existsSync(path.win32.join(this.darkosRoot, 'Recovery', 'manifest.json'))
    const value = hardwareFromRaw(data || {}, darkos)
    this._hw = { at: Date.now(), value }
    return value
  }

  list() {
    const st = this._load()
    return {
      ok: true,
      packages: Object.values(st.packages).map((p) => ({
        id: p.pkg.id, version: p.pkg.version, name: p.pkg.name, author: p.pkg.author, type: p.pkg.type,
        installedAt: p.installedAt, risk: p.risk, steps: p.steps.length, source: p.source || null,
        extension: p.pkg.type === 'extension' ? { pages: p.pkg.contributes?.pages || [], widgets: p.pkg.contributes?.widgets || [], permissions: p.pkg.permissions || [], network: p.pkg.network || [] } : null
      }))
    }
  }

  record(id) { return this._load().packages[id] || null }

  async _opStatus() {
    if (!this.optimizer) return {}
    try { return (await this.optimizer.checkOperationsStatus()).status || {} } catch { return {} }
  }

  /** "precisa do DarkHub 0.7.4 (este é o 0.7.3)" when the package asks for a newer app, else null. */
  _tooOld(pkg, lang) {
    const need = newerAppNeeded(pkg.minApp, this.app.getVersion?.())
    if (!need) return null
    return lang === 'en-US' ? `needs DarkHub ${need} or newer (this is ${this.app.getVersion()}); update DarkHub first` : `precisa do DarkHub ${need} ou mais novo (este é o ${this.app.getVersion()}); atualize o DarkHub antes`
  }

  // ------------------------------------------------------------------ inspect (dry run)
  /**
   * Validates, resolves for this PC and reads the current state of everything the package touches. Changes nothing.
   * official: only for packages whose Hub signature says "official".
   */
  async inspect(text, lang = 'pt-BR', { official = false } = {}) {
    const builtins = this.builtins()
    const v = validatePackage(text, builtins, { official })
    if (!v.ok) return { ok: false, errors: v.errors }
    const pkg = v.pkg
    const installed = this._load().packages[pkg.id] || null
    const head = { id: pkg.id, version: pkg.version, type: pkg.type, name: textOf(pkg.name, lang), description: textOf(pkg.description, lang), author: pkg.author, tags: pkg.tags || [], evidence: pkg.evidence || [], expects: pkg.expects || [] }
    const installedInfo = installed ? { version: installed.pkg.version, installedAt: installed.installedAt, source: installed.source || null } : null
    const tooOld = this._tooOld(pkg, lang)
    // an extension changes nothing in Windows: the preview is what it may ask for and where it shows up
    if (pkg.type === 'extension') {
      const rows = describeExtension(pkg, lang).map((x, i) => ({ index: i, ...x, note: '', current: null, done: false, missing: false, requiresReboot: false }))
      return { ok: true, pkg: head, risk: v.risk, official, applicable: !tooOld, notFor: tooOld, rows, skipped: [], findings: v.findings || [], installed: installedInfo, hardware: null }
    }
    const hw = await this.hardware()
    const r = resolvePackage(pkg, hw, builtins)

    const { changes } = toChangeSet(r.steps)
    const regMap = await this.tweaks.readEntries(changes.filter((c) => !c.deleteKey).map((c) => ({ key: c.key, name: c.name })))
    const tweakStatus = r.steps.some((s) => s.kind === 'tweak') ? (await this.tweaks.checkTweaksStatus()).status || {} : {}
    const opStatus = r.steps.some((s) => s.kind === 'op') ? await this._opStatus() : {}
    const tasks = r.steps.filter((s) => s.kind === 'task')
    const taskStates = tasks.length ? await this._readTasks(tasks) : []

    const rows = r.steps.map((s) => {
      const d = describeStep(s, lang, builtins)
      let current = null
      let done = false
      let missing = false
      if (s.kind === 'tweak') { done = Boolean(tweakStatus[s.id]); current = done ? 'on' : 'off' }
      else if (s.kind === 'op') {
        const b = builtins.get(s.id)
        const st = opStatus[b.opId]
        current = st === true ? 'on' : st === false ? 'off' : null
        done = b.reversible && st === true
      } else if (s.kind === 'registry') {
        const target = toChangeSet([s]).changes[0]
        const cur = target.deleteKey ? null : regMap?.get(regEntryId(target.key, target.name))
        current = cur?.exists ? canonicalRegValue(cur.type || target.type || 'REG_SZ', cur.value !== undefined ? cur.value : cur.data) : null
        done = target.deleteKey ? false : target.deleteValue ? !cur?.exists : regValueMatches(target, cur)
      } else if (s.kind === 'service') {
        const cur = regMap?.get(regEntryId(serviceKey(s.name), 'Start'))
        const startNow = cur?.exists ? Number(cur.value !== undefined ? cur.value : cur.data) : null
        current = startNow == null ? null : ({ 2: 'automatic', 3: 'manual', 4: 'disabled' }[startNow] || String(startNow))
        done = current === (s.startType === 'automaticDelayed' ? 'automatic' : s.startType)
      } else if (s.kind === 'task') {
        const t = taskStates.find((x) => x.path === s.path && x.name === s.name)
        missing = !t?.exists
        current = missing ? null : (t.state === 'Disabled' ? 'disabled' : 'enabled')
        done = current === s.state
      }
      return { index: s.index, kind: s.kind, ...d, note: s.note || '', current, done, missing, requiresReboot: Boolean(builtins.get(s.id)?.requiresReboot) }
    })
    return {
      ok: true,
      pkg: head,
      risk: v.risk,
      official,
      applicable: r.applicable && !tooOld,
      notFor: tooOld || r.notFor,
      rows,
      skipped: r.skipped.map((s) => ({ index: s.index, reason: s.reason, ...describeStep(s.step, lang, builtins) })),
      installed: installedInfo,
      hardware: hw
    }
  }

  async _readTasks(tasks) {
    const { data } = await runPowerShellJson(taskReadScript(tasks), { timeoutMs: 30000, fallback: [], allowNonZero: true })
    return Array.isArray(data) ? data : data ? [data] : []
  }

  // ------------------------------------------------------------------ install / uninstall
  /** source: { hub, tier, sha256 } when the package came from the Hub (kept to detect updates). */
  /** replace: an extension already installed is swapped in place (development reload); packages never are. */
  async install(text, { official = false, source = null, replace = false } = {}) {
    if (this._busy) return { ok: false, error: 'Outra instalação está em andamento' }
    this._busy = true
    try { return await this._install(text, { official, source, replace }) } finally { this._busy = false }
  }

  async _install(text, { official, source, replace }) {
    const builtins = this.builtins()
    const v = validatePackage(text, builtins, { official })
    if (!v.ok) return { ok: false, errors: v.errors, error: v.errors.map((e) => `${e.path}: ${e.message}`).join('; ') }
    const pkg = v.pkg
    const tooOld = this._tooOld(pkg, 'pt-BR')
    if (tooOld) return { ok: false, error: tooOld }
    if (pkg.type === 'extension') {
      const state = this._load()
      const prev = state.packages[pkg.id]
      if (prev && !(replace && prev.pkg.type === 'extension')) return { ok: false, error: 'Esta extensão já está instalada. Remova antes de instalar outra versão.' }
      state.packages[pkg.id] = { pkg, risk: v.risk, steps: [], installedAt: prev?.installedAt || new Date().toISOString(), tweaksAdded: [], tasks: [], changeSet: null, opsApplied: [], source }
      this._save(state)
      return { ok: true, id: pkg.id, applied: 0, skipped: 0, notes: [], requiresReboot: false, missingTasks: [], extension: true }
    }
    const hw = await this.hardware()
    const r = resolvePackage(pkg, hw, builtins)
    if (!r.applicable) return { ok: false, error: `Este pacote não é para este PC (${r.notFor}).` }
    const state = this._load()
    if (state.packages[pkg.id]) return { ok: false, error: 'Este pacote já está instalado. Remova antes de instalar outra versão.' }

    // two packages writing the same value (or running the same operation) would restore each other's state on removal
    const mine = new Set([...touchedEntries(r.steps), ...r.steps.filter((s) => s.kind === 'op').map((s) => s.id)])
    for (const other of Object.values(state.packages)) {
      const theirs = [...touchedEntries(other.steps), ...(other.opsApplied || [])]
      const clash = theirs.find((e) => mine.has(e))
      if (clash) return { ok: false, error: `Conflito com o pacote instalado "${other.pkg.id}" (${clash.replace('|', '\\')}). Remova-o antes.` }
    }

    const record = { pkg, risk: v.risk, steps: r.steps, installedAt: new Date().toISOString(), tweaksAdded: [], tasks: [], changeSet: null, opsApplied: [], source }
    const undo = async () => { try { await this._remove(record) } catch { /* best effort */ } }
    const notes = []

    // 1) DarkHub tweaks: only the ones not already on, so removing the package does not undo the user's own choices
    const tweakIds = [...new Set(r.steps.filter((s) => s.kind === 'tweak').map((s) => s.id))]
    if (tweakIds.length) {
      const status = (await this.tweaks.checkTweaksStatus()).status || {}
      const toApply = tweakIds.filter((id) => !status[id])
      if (toApply.length) {
        const res = await this.tweaks.applyTweaks(toApply)
        if (!res?.ok) return { ok: false, error: `Ajustes do DarkHub: ${res?.error || 'falha'}` }
        record.tweaksAdded = toApply
      }
    }

    // 2) registry + services in one change set (snapshot, apply, read back)
    const { changes, stopServices } = toChangeSet(r.steps)
    if (changes.length) {
      const id = `hub:${pkg.id}`
      const commands = stopServices.length ? { apply: stopServices.map((n) => `Stop-Service -Name ${psQuote(n)} -Force -ErrorAction SilentlyContinue`).join('\n') } : undefined
      const res = await this.tweaks.applyChangeSet({ id, title: textOf(pkg.name, 'pt-BR'), changes, commands })
      if (!res?.ok) { await undo(); return { ok: false, error: `Registro/serviços: ${res?.error || 'falha'}` } }
      record.changeSet = { id, changes }
    }

    // 3) scheduled tasks: remember the previous state, then set and read back
    const tasks = r.steps.filter((s) => s.kind === 'task')
    if (tasks.length) {
      const before = await this._readTasks(tasks)
      record.tasks = tasks.map((t) => {
        const b = before.find((x) => x.path === t.path && x.name === t.name)
        return { path: t.path, name: t.name, state: t.state, existed: Boolean(b?.exists), previous: b?.exists ? (b.state === 'Disabled' ? 'disabled' : 'enabled') : null }
      })
      const present = record.tasks.filter((t) => t.existed)
      if (present.length) {
        const res = await ElevationHelper.runMarked(taskApplyScript(present), 120000)
        if (!res.ok) { await undo(); return { ok: false, error: `Tarefas: ${res.error}` } }
      }
    }

    // 4) operations: reversible ones that are already on are left alone (removal will not undo them); one-time
    // actions just run
    const ops = r.steps.filter((s) => s.kind === 'op')
    if (ops.length) {
      const status = await this._opStatus()
      for (const s of ops) {
        const b = builtins.get(s.id)
        const op = this.optimizer?.operations.get(b.opId)
        if (!op) { await undo(); return { ok: false, error: `Operação indisponível: ${s.id}` } }
        if (b.reversible && status[b.opId] === true) continue
        const res = await op.execute()
        if (opFailed(res)) { await undo(); return { ok: false, error: `${b.title}: ${res?.error || res?.message || 'falhou'}` } }
        if (b.reversible) record.opsApplied.push(s.id)
        if (res?.requiresReboot) notes.push(`${b.title}: reinicie o Windows para concluir.`)
      }
    }

    state.packages[pkg.id] = record
    this._save(state)
    return {
      ok: true, id: pkg.id, applied: r.steps.length, skipped: r.skipped.length, notes,
      requiresReboot: notes.length > 0 || r.steps.some((s) => builtins.get(s.id)?.requiresReboot),
      missingTasks: record.tasks.filter((t) => !t.existed).map((t) => `${t.path}${t.name}`)
    }
  }

  async _remove(record) {
    const errors = []
    if (record.pkg.type === 'extension') fs.rmSync(path.join(this.dir, 'ext-data', `${record.pkg.id}.json`), { force: true })
    const builtins = this.builtins()
    for (const id of [...(record.opsApplied || [])].reverse()) {
      const op = this.optimizer?.operations.get(builtins.get(id)?.opId)
      if (!op?.revert) { errors.push(`${id}: sem como reverter`); continue }
      const res = await op.revert()
      if (opFailed(res)) errors.push(`${builtins.get(id).title}: ${res?.error || res?.message || 'falha ao reverter'}`)
    }
    const back = record.tasks.filter((t) => t.existed && t.previous && t.previous !== t.state).map((t) => ({ path: t.path, name: t.name, state: t.previous }))
    if (back.length) { const res = await ElevationHelper.runMarked(taskApplyScript(back), 120000); if (!res.ok) errors.push(`tarefas: ${res.error}`) }
    if (record.changeSet) {
      const res = await this.tweaks.restoreChangeSet({ id: record.changeSet.id, title: textOf(record.pkg.name, 'pt-BR'), fallbackChanges: [] })
      if (!res?.ok) errors.push(`registro/serviços: ${res?.error || 'falha'}`)
    }
    if (record.tweaksAdded.length) {
      const res = await this.tweaks.undoTweaks(record.tweaksAdded)
      if (!res?.ok) errors.push(`ajustes: ${res?.error || 'falha'}`)
    }
    return errors
  }

  async uninstall(id) {
    if (this._busy) return { ok: false, error: 'Outra operação está em andamento' }
    this._busy = true
    try {
      const state = this._load()
      const record = state.packages[id]
      if (!record) return { ok: false, error: 'Pacote não instalado' }
      const errors = await this._remove(record)
      if (errors.length) return { ok: false, error: errors.join('; ') }
      delete state.packages[id]
      this._save(state)
      return { ok: true }
    } finally { this._busy = false }
  }

  // ------------------------------------------------------------------ export
  /** A preset with the DarkHub tweaks and reversible operations active on this PC. */
  async exportMine({ name, github }) {
    const handle = String(github || 'eu').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39) || 'eu'
    const slug = String(name || 'meu-pc').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meu-pc'
    const st = await this.tweaks.checkTweaksStatus()
    if (!st?.ok) return { ok: false, error: st?.error || 'Não foi possível ler o estado dos ajustes' }
    const builtins = this.builtins()
    const activeIds = Object.entries(st.status).filter(([, on]) => on).map(([id]) => id)
    const opStatus = await this._opStatus()
    const activeOps = [...builtins.entries()]
      .filter(([, b]) => b.kind === 'op' && b.reversible && !b.tweakIds && b.packageUse === 'yes' && opStatus[b.opId] === true)
      .map(([id]) => id)
    const pkg = presetFromState({ id: `${handle.toLowerCase()}.${slug.length >= 2 ? slug : `${slug}-pc`}`, name: String(name || 'Meu PC').slice(0, 60), github: handle, activeIds, activeOps, builtins, appVersion: this.app.getVersion() })
    if (!pkg.items.length) return { ok: false, error: 'Nenhum ajuste do DarkHub está aplicado neste PC ainda.' }
    return { ok: true, text: `${JSON.stringify(pkg, null, 2)}\n`, count: pkg.items.length }
  }
}
