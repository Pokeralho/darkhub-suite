// PowerShell Tools toolkit runtime: runs catalog tools, the custom-script runner (live output, stop) and the
// snippet store. Pure logic lives in psToolBuilders.js. No `electron` import here: the IPC layer injects
// the data dir, the elevated runner (ElevationHelper) and the dialogs.
//
// Safety rules enforced here (not only in the UI):
//  - a plan that needs admin or changes the system refuses to run without `confirm: true`
//  - custom scripts always need `confirm: true`
//  - export / report paths always come from a native dialog chosen by the user (IPC layer)

import fsDefault from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn as spawnDefault } from 'node:child_process'
import { runPowerShell, runCommand, parseJsonOutput, stripBom } from '../PowerShellRunner.js'
import { psQuote } from '../optimizer/OptimizerUtils.js'
import {
  buildPlan, normalizeRows, parseWingetTable, parseWlanProfileXml, isValidWifiProfileName,
  parseHosts, validateHostsContent, buildHostsWriteScript, diffLines, validateSnippet,
  rowsToCsv, rowsToText, isPlainAbsPath
} from './psToolBuilders.js'

const MAX_CUSTOM_SCRIPT = 200000
const MAX_SNIPPETS = 200

function safeJson(stdout, fallback) {
  try { return parseJsonOutput(stdout, fallback) } catch { return fallback }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function hostsFilePath(env = process.env) {
  return path.win32.join(env.SystemRoot || env.windir || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
}

export class PsToolkitService {
  constructor({ runner, cmdRunner, elevatedRunner, fsImpl, spawnImpl, dataDir, tmpDir, platform } = {}) {
    this._fs = fsImpl || fsDefault
    this._ps = runner || ((script, opts) => runPowerShell(script, opts))
    this._cmd = cmdRunner || ((cmd, args, opts) => runCommand(cmd, args, opts))
    this._elevated = elevatedRunner || null
    this._spawn = spawnImpl || spawnDefault
    this._dataDir = dataDir || null // function or string
    this._tmpBase = tmpDir || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'DarkHub', 'pstools')
    this._platform = platform || process.platform
    this._custom = null // { runId, child, elevated }
  }

  _dir() {
    const d = typeof this._dataDir === 'function' ? this._dataDir() : this._dataDir
    return d || path.join(os.tmpdir(), 'DarkHub')
  }

  _privateTmp() {
    const dir = path.join(this._tmpBase, crypto.randomBytes(6).toString('hex'))
    this._fs.mkdirSync(dir, { recursive: true })
    return dir
  }

  async _runElevated(script, timeoutMs) {
    if (!this._elevated) return { code: 1, stdout: '', stderr: 'Execução como administrador indisponível.' }
    return this._elevated(script, { timeoutMs })
  }

  /** What a run would execute, without running it (used by the confirmation dialog). */
  preview(id, params) {
    const r = buildPlan(id, params)
    if (!r.ok) return r
    const { preview, admin, mutating, kind } = r.plan
    return { ok: true, preview, admin, mutating, kind }
  }

  async runTool(id, params = {}, { confirm = false } = {}) {
    if (this._platform !== 'win32') return { ok: false, error: 'Disponível apenas no Windows.' }
    const built = buildPlan(id, params)
    if (!built.ok) return built
    const plan = built.plan
    if ((plan.admin || plan.mutating) && confirm !== true) {
      return { ok: false, needsConfirmation: true, preview: plan.preview, admin: plan.admin, mutating: plan.mutating }
    }
    const started = Date.now()
    let res
    try {
      if (plan.kind === 'native') return await this._native(plan)
      if (plan.kind === 'cmd') {
        res = await this._cmd(plan.command, plan.args, { timeoutMs: plan.timeoutMs, maxBuffer: 32 * 1024 * 1024 })
      } else if (plan.admin) {
        res = await this._runElevated(plan.script, plan.timeoutMs)
      } else {
        res = await this._ps(plan.script, { timeoutMs: plan.timeoutMs, maxBuffer: 64 * 1024 * 1024 })
      }
    } catch (e) {
      const msg = e?.code === 'ENOENT' ? `${plan.command || 'powershell.exe'} não foi encontrado neste Windows.` : (e?.message ?? String(e))
      return { ok: false, error: msg, preview: plan.preview }
    }
    return this._shape(plan, res, Date.now() - started)
  }

  _shape(plan, res, ms) {
    const stdout = String(res?.stdout ?? '').replace(/\u0000/g, '')
    const stderr = String(res?.stderr ?? '').replace(/\u0000/g, '')
    const base = { tool: plan.id, admin: plan.admin, mutating: plan.mutating, durationMs: ms, preview: plan.preview }
    if (/DH_NOFOLDER/.test(stdout) || /DH_NOFOLDER/.test(stderr)) return { ...base, ok: false, error: 'Pasta não encontrada.' }
    if (plan.output === 'table') {
      if (plan.parse === 'winget') {
        const rows = parseWingetTable(stdout)
        const ok = res?.code === 0 || rows.length > 0 || /No installed package|Nenhum pacote|No available upgrade|Nenhuma atualiza/i.test(stdout)
        return { ...base, ok, kind: 'table', rows, raw: rows.length ? undefined : stdout.trim().slice(-4000), error: ok ? undefined : (stderr.trim() || stdout.trim().slice(-600) || `winget terminou com código ${res?.code}.`) }
      }
      const data = safeJson(stdout, null)
      if (data === null) {
        const err = stderr.trim()
        if (!stdout.trim() && !err) return { ...base, ok: true, kind: 'table', rows: [] }
        return { ...base, ok: false, kind: 'table', rows: [], error: (err || 'Saída inesperada.').slice(0, 1200) }
      }
      return { ...base, ok: true, kind: 'table', rows: normalizeRows(data) }
    }
    const exitM = /DH_EXIT=(-?\d+)/.exec(stdout)
    const code = exitM ? Number(exitM[1]) : (res?.code ?? 1)
    const text = stdout.replace(/DH_EXIT=-?\d+\s*$/, '').trim()
    if (plan.output === 'file') {
      const exists = plan.file && this._fs.existsSync(plan.file)
      return { ...base, ok: !!exists, kind: 'file', file: exists ? plan.file : undefined, text: [text, stderr.trim()].filter(Boolean).join('\n\n'), code, error: exists ? undefined : (stderr.trim() || text.slice(-600) || 'O relatório não foi gerado.') }
    }
    return { ...base, ok: code === 0, kind: 'text', code, text: [text, stderr.trim()].filter(Boolean).join('\n\n'), error: code === 0 ? undefined : (stderr.trim().slice(0, 600) || `Terminou com código ${code}.`) }
  }

  async _native(plan) {
    if (plan.native === 'hosts') return this.readHosts()
    if (plan.native === 'wifiProfiles') return this.listWifiProfiles()
    return { ok: false, error: 'Ferramenta desconhecida.' }
  }

  // ---------- Wi-Fi ----------

  async _exportWlan(extra = []) {
    const dir = this._privateTmp()
    try {
      // netsh parses its own command line; names are validated (no quotes) before reaching here.
      const res = await this._cmd('netsh.exe', ['wlan', 'export', 'profile', ...extra, `folder="${dir}"`], {
        timeoutMs: 30000, spawnOptions: { windowsVerbatimArguments: true }
      })
      const files = this._fs.existsSync(dir) ? this._fs.readdirSync(dir).filter((f) => /\.xml$/i.test(f)) : []
      const xmls = files.map((f) => { try { return stripBom(this._fs.readFileSync(path.join(dir, f), 'utf8')) } catch { return '' } })
      return { res, xmls }
    } finally {
      try { this._fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }

  async listWifiProfiles() {
    const { res, xmls } = await this._exportWlan()
    const rows = xmls.map((x) => parseWlanProfileXml(x)).filter((r) => r.Name).sort((a, b) => a.Name.localeCompare(b.Name))
    if (!rows.length && res?.code !== 0) {
      return { ok: false, kind: 'table', rows: [], error: (String(res?.stdout || res?.stderr || '').trim().slice(0, 400)) || 'Não foi possível ler os perfis (o serviço WLAN está ativo?).' }
    }
    return { ok: true, kind: 'table', tool: 'wifiProfiles', rows }
  }

  /** Reveals ONE profile key, only on an explicit user click. The key is never logged or stored. */
  async revealWifiKey(name) {
    if (!isValidWifiProfileName(name)) return { ok: false, error: 'Nome de rede inválido.' }
    const { xmls } = await this._exportWlan([`name="${name}"`, 'key=clear'])
    const p = xmls.map((x) => parseWlanProfileXml(x, { withKey: true })).find((r) => r.Name === name)
    if (!p) return { ok: false, error: 'Perfil não encontrado.' }
    if (!p.key) return { ok: false, error: 'A senha não foi revelada (rede aberta, perfil corporativo ou é preciso abrir o app como administrador).' }
    return { ok: true, key: p.key }
  }

  // ---------- hosts ----------

  async readHosts() {
    const file = hostsFilePath()
    let content = ''
    try { content = stripBom(this._fs.readFileSync(file, 'utf8')) } catch (e) {
      return { ok: false, kind: 'hosts', error: `Não foi possível ler ${file}: ${e?.message ?? e}` }
    }
    let backups = []
    try {
      const dir = path.win32.dirname(file)
      backups = this._fs.readdirSync(dir).filter((f) => /^hosts\.darkhub-\d{8}-\d{6}\.bak$/i.test(f)).sort().reverse().slice(0, 20)
    } catch { /* ignore */ }
    return { ok: true, kind: 'hosts', tool: 'hosts', path: file, content, entries: parseHosts(content), backups }
  }

  async readHostsBackup(name) {
    if (typeof name !== 'string' || !/^hosts\.darkhub-\d{8}-\d{6}\.bak$/i.test(name)) return { ok: false, error: 'Backup inválido.' }
    try {
      return { ok: true, content: stripBom(this._fs.readFileSync(path.win32.join(path.win32.dirname(hostsFilePath()), name), 'utf8')) }
    } catch (e) {
      return { ok: false, error: e?.message ?? String(e) }
    }
  }

  async previewHosts(content) {
    const err = validateHostsContent(content)
    if (err) return { ok: false, error: err }
    const cur = await this.readHosts()
    return { ok: true, ...diffLines(cur.ok ? cur.content : '', content) }
  }

  async writeHosts(content, { confirm = false } = {}) {
    const err = validateHostsContent(content)
    if (err) return { ok: false, error: err }
    if (confirm !== true) return { ok: false, needsConfirmation: true }
    const script = buildHostsWriteScript(hostsFilePath(), content, stamp())
    const res = await this._runElevated(script, 120000)
    const ok = String(res?.stdout ?? '').includes('DH_HOSTS_OK')
    return ok ? { ok: true } : { ok: false, error: String(res?.stderr ?? '').trim() || 'Não foi possível salvar o arquivo hosts.' }
  }

  // ---------- custom scripts ----------

  isCustomRunning() {
    return !!this._custom
  }

  /**
   * Starts a user script. Non-elevated runs stream stdout/stderr through `emit({ runId, type, text })`; elevated
   * runs go through ElevationHelper (UAC) and deliver their output when they finish. Always needs confirm:true.
   */
  async startCustom({ script, elevated = false, confirm = false } = {}, emit = () => {}) {
    if (this._platform !== 'win32') return { ok: false, error: 'Disponível apenas no Windows.' }
    const text = String(script ?? '')
    if (!text.trim()) return { ok: false, error: 'O script está vazio.' }
    if (text.length > MAX_CUSTOM_SCRIPT) return { ok: false, error: 'O script passou do limite de 200 mil caracteres.' }
    if (confirm !== true) return { ok: false, needsConfirmation: true }
    if (this._custom) return { ok: false, error: 'Já existe um script em execução.' }
    const runId = crypto.randomBytes(6).toString('hex')
    const send = (ev) => { try { emit({ runId, ...ev }) } catch { /* window closed */ } }

    if (elevated) {
      this._custom = { runId, child: null, elevated: true }
      ;(async () => {
        let res
        try { res = await this._runElevated(text, 60 * 60000) } catch (e) { res = { code: 1, stdout: '', stderr: e?.message ?? String(e) } }
        if (res?.stdout) send({ type: 'stdout', text: String(res.stdout) })
        if (res?.stderr) send({ type: 'stderr', text: String(res.stderr) })
        this._custom = null
        send({ type: 'exit', code: res?.code ?? 1 })
      })()
      return { ok: true, runId, elevated: true }
    }

    const dir = this._privateTmp()
    const file = path.join(dir, 'custom.ps1')
    this._fs.writeFileSync(file, `\ufeff${text}`, 'utf8')
    let child
    try {
      // UTF-8 pipe so accents survive; `& file` keeps the user's line numbers in error messages.
      const launcher = `try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}; & ${psQuote(file)}; exit $LASTEXITCODE`
      child = this._spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-Command', launcher], {
        windowsHide: true, cwd: process.env.USERPROFILE || undefined
      })
    } catch (e) {
      try { this._fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
      return { ok: false, error: e?.message ?? String(e) }
    }
    this._custom = { runId, child, elevated: false, stopped: false }
    const decode = (chunk) => chunk.toString('utf8')
    child.stdout?.on('data', (c) => send({ type: 'stdout', text: decode(c) }))
    child.stderr?.on('data', (c) => send({ type: 'stderr', text: decode(c) }))
    let finished = false
    const finish = (code, error) => {
      if (finished) return
      finished = true
      const stopped = this._custom?.stopped === true
      this._custom = null
      try { this._fs.rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
      if (error) send({ type: 'stderr', text: String(error) })
      send({ type: 'exit', code: code ?? 1, stopped })
    }
    child.on('error', (e) => finish(1, e?.message ?? e))
    child.on('close', (code) => finish(code))
    return { ok: true, runId, elevated: false }
  }

  stopCustom() {
    const cur = this._custom
    if (!cur) return { ok: true, running: false }
    if (cur.elevated || !cur.child) return { ok: false, error: 'Um script elevado não pode ser interrompido por aqui; feche-o pelo Gerenciador de Tarefas.' }
    cur.stopped = true
    try {
      if (cur.child.pid) this._spawn('taskkill.exe', ['/PID', String(cur.child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on?.('error', () => {})
    } catch { /* ignore */ }
    try { cur.child.kill() } catch { /* ignore */ }
    return { ok: true }
  }

  // ---------- snippets ----------

  _snippetFile() {
    return path.join(this._dir(), 'pstools-snippets.json')
  }

  listSnippets() {
    try {
      const raw = JSON.parse(stripBom(this._fs.readFileSync(this._snippetFile(), 'utf8')))
      const list = Array.isArray(raw?.snippets) ? raw.snippets : []
      return { ok: true, snippets: list.filter((s) => s && typeof s.id === 'string' && typeof s.script === 'string') }
    } catch {
      return { ok: true, snippets: [] }
    }
  }

  _writeSnippets(list) {
    const file = this._snippetFile()
    this._fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    this._fs.writeFileSync(tmp, JSON.stringify({ version: 1, snippets: list }, null, 2), 'utf8')
    this._fs.renameSync(tmp, file)
  }

  saveSnippet(s = {}) {
    const err = validateSnippet(s)
    if (err) return { ok: false, error: err }
    const list = this.listSnippets().snippets
    const name = String(s.name).trim()
    const idx = list.findIndex((x) => (s.id && x.id === s.id) || x.name.toLowerCase() === name.toLowerCase())
    const item = {
      id: idx >= 0 ? list[idx].id : crypto.randomBytes(6).toString('hex'),
      name, script: String(s.script), elevated: s.elevated === true, updatedAt: new Date().toISOString()
    }
    if (idx >= 0) list[idx] = item
    else {
      if (list.length >= MAX_SNIPPETS) return { ok: false, error: `Limite de ${MAX_SNIPPETS} snippets atingido.` }
      list.push(item)
    }
    list.sort((a, b) => a.name.localeCompare(b.name))
    this._writeSnippets(list)
    return { ok: true, snippet: item, snippets: list }
  }

  deleteSnippet(id) {
    const list = this.listSnippets().snippets
    const next = list.filter((x) => x.id !== id)
    if (next.length === list.length) return { ok: false, error: 'Snippet não encontrado.' }
    this._writeSnippets(next)
    return { ok: true, snippets: next }
  }

  // ---------- export ----------

  /** Serializes rows/text for export. `filePath` must come from the native save dialog. */
  exportTo(filePath, { rows, text, format } = {}) {
    if (!isPlainAbsPath(filePath)) return { ok: false, error: 'Caminho inválido.' }
    let body
    if (Array.isArray(rows)) {
      const list = normalizeRows(rows)
      body = format === 'json' ? JSON.stringify(list, null, 2) : format === 'csv' ? '\ufeff' + rowsToCsv(list) : rowsToText(list, 200)
    } else {
      body = String(text ?? '')
    }
    if (body.length > 64 * 1024 * 1024) return { ok: false, error: 'Conteúdo grande demais para exportar.' }
    this._fs.writeFileSync(filePath, body, 'utf8')
    return { ok: true, path: filePath }
  }
}

export default PsToolkitService
