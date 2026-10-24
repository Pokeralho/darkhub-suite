// Game save backup: finds where installed games keep their saves (Ludusavi manifest, data from PCGamingWiki), keeps
// versioned copies in plain folders, and restores them. Files are stored by manifest template so a restore also works
// for another Windows user or PC.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolveTemplate, matchGames, expandGlob, staticPrefix, nameKey } from './savePaths.js'
import { psQuote } from '../optimizer/OptimizerUtils.js'

const MANIFEST_URL = 'https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml'
const INDEXER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'manifestIndexer.js')
const MANIFEST_MAX_AGE_MS = 7 * 86400000
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024

const sha256File = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256')
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')))
})
const run = (cmd, args, timeout = 60000) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }))
})
const safeName = (s) => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').slice(0, 100) || 'game'
// manifest templates use "/"; turn the non-glob part into a template prefix we can resolve again at restore time
const templatePrefix = (tpl) => staticPrefix(String(tpl).replace(/\//g, '\\'))

export class SaveBackupService {
  constructor({ app, getInstalledGames, onEvent }) {
    this.app = app
    this.dir = path.join(app.getPath('userData'), 'saves')
    this.settingsFile = path.join(this.dir, 'settings.json')
    this.getInstalledGames = getInstalledGames
    this.onEvent = onEvent
    this.index = null
    this.busy = false
    fs.mkdirSync(this.dir, { recursive: true })
  }

  settings() {
    let s = {}
    try { s = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')) } catch { /* defaults */ }
    return {
      backupRoot: s.backupRoot || path.join(this.app.getPath('documents'), 'DarkHub Saves'),
      keep: Math.min(100, Math.max(1, Number(s.keep) || 10)),
      autoOnExit: s.autoOnExit === true,
      custom: Array.isArray(s.custom) ? s.custom : []
    }
  }

  setSettings(patch = {}) {
    const next = { ...this.settings(), ...patch }
    if (patch.backupRoot && !path.isAbsolute(String(patch.backupRoot))) return { ok: false, error: 'Pasta inválida' }
    fs.writeFileSync(this.settingsFile, JSON.stringify(next, null, 1))
    return { ok: true, settings: this.settings() }
  }

  _env(game) {
    const home = os.homedir()
    return {
      home,
      appData: process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
      localAppData: process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'),
      localAppDataLow: path.join(home, 'AppData', 'LocalLow'),
      documents: this.app.getPath('documents'),
      public: process.env.PUBLIC || 'C:\\Users\\Public',
      programData: process.env.ProgramData || 'C:\\ProgramData',
      winDir: process.env.WINDIR || 'C:\\Windows',
      osUserName: os.userInfo().username,
      base: game?.installDir || null,
      game: game?.installDir ? path.basename(game.installDir) : null,
      root: game?.libraryRoot || null,
      // any Steam/store account on this PC
      storeUserId: '*',
      storeGameId: game?.appId || null
    }
  }

  /** Downloads the manifest when missing or older than a week (ETag aware) and rebuilds the index in a child process. */
  async _ensureIndex(force = false) {
    const yamlFile = path.join(this.dir, 'manifest.yaml')
    const indexFile = path.join(this.dir, 'manifest-index.json')
    const metaFile = path.join(this.dir, 'manifest-meta.json')
    let meta = {}
    try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) } catch { /* first time */ }
    const fresh = fs.existsSync(indexFile) && Date.now() - (meta.checkedAt || 0) < MANIFEST_MAX_AGE_MS
    if (!force && fresh) {
      this.index ||= JSON.parse(fs.readFileSync(indexFile, 'utf8'))
      return { updated: false }
    }
    this.onEvent?.({ type: 'manifest', stage: 'download' })
    let changed = false
    try {
      const res = await fetch(MANIFEST_URL, { headers: meta.etag && fs.existsSync(yamlFile) ? { 'If-None-Match': meta.etag } : {} })
      if (res.status === 200) {
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > MAX_MANIFEST_BYTES) throw new Error('manifest too large')
        fs.writeFileSync(yamlFile, buf)
        meta.etag = res.headers.get('etag') || null
        changed = true
      } else if (res.status !== 304) throw new Error(`HTTP ${res.status}`)
    } catch (e) {
      // offline: keep using the cached index if there is one
      if (!fs.existsSync(indexFile)) throw new Error(`Não foi possível baixar a lista de jogos: ${e?.message ?? e}`)
    }
    if (changed || !fs.existsSync(indexFile)) {
      this.onEvent?.({ type: 'manifest', stage: 'index' })
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [INDEXER, yamlFile, indexFile], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true })
        let err = ''
        child.stderr.on('data', (d) => { err += d })
        child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-300) || `indexer exit ${code}`))))
      })
    }
    meta.checkedAt = Date.now()
    fs.writeFileSync(metaFile, JSON.stringify(meta))
    this.index = JSON.parse(fs.readFileSync(indexFile, 'utf8'))
    return { updated: changed }
  }

  /** Every save file of one matched game: [{ template, prefixTemplate, file, rel }]. */
  _collect(match) {
    const env = this._env(match.game)
    const out = []
    for (const f of match.entry.files || []) {
      const pattern = resolveTemplate(f.path, env)
      if (!pattern) continue
      const prefix = staticPrefix(pattern)
      for (const file of expandGlob(pattern)) {
        out.push({ template: f.path, prefixTemplate: templatePrefix(f.path), file, rel: path.relative(prefix, file) })
      }
    }
    return out
  }

  _gameDir(name) { return path.join(this.settings().backupRoot, safeName(name)) }

  versions(name) {
    const dir = this._gameDir(name)
    let ids = []
    try { ids = fs.readdirSync(dir).filter((d) => /^\d{8}-\d{6}/.test(d)) } catch { return [] }
    return ids.map((id) => {
      try { return { id, ...JSON.parse(fs.readFileSync(path.join(dir, id, 'backup.json'), 'utf8')), files: undefined } } catch { return null }
    }).filter(Boolean).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id, undefined, { numeric: true }))
  }

  async scan({ refreshManifest = false } = {}) {
    await this._ensureIndex(refreshManifest)
    const installed = await this.getInstalledGames()
    const s = this.settings()
    const matches = matchGames(this.index, installed)
    // games the user added by hand (folders/files not in the manifest)
    for (const c of s.custom) matches.push({ game: { name: c.name }, entry: { name: c.name, files: (c.paths || []).map((p) => ({ path: p.replace(/\\/g, '/') })), registry: [], custom: true } })
    const games = matches.map((m) => {
      const files = this._collect(m)
      let bytes = 0
      for (const f of files) { try { bytes += fs.statSync(f.file).size } catch { /* vanished */ } }
      const versions = this.versions(m.entry.name)
      return { name: m.entry.name, installed: m.game.name, custom: Boolean(m.entry.custom), files: files.length, bytes, registry: (m.entry.registry || []).length, lastBackupAt: versions[0]?.at ?? null, versions: versions.length }
    }).sort((a, b) => b.files - a.files || a.name.localeCompare(b.name))
    this._matches = new Map(matches.map((m) => [m.entry.name, m]))
    return { ok: true, games, settings: s, manifestGames: this.index.length }
  }

  async _match(name) {
    if (!this._matches?.has(name)) await this.scan()
    const m = this._matches.get(name)
    if (!m) throw new Error('Jogo não encontrado')
    return m
  }

  async backup(name, { label = '' } = {}) {
    if (this.busy) return { ok: false, error: 'Outro backup está em andamento' }
    this.busy = true
    try {
      const m = await this._match(name)
      const files = this._collect(m)
      const regKeys = (m.entry.registry || []).map((r) => r.key.replace(/\//g, '\\')).filter((k) => /^HKEY_CURRENT_USER\\/i.test(k))
      if (!files.length && !regKeys.length) return { ok: false, error: 'Nenhum save encontrado para este jogo' }
      const list = []
      for (const f of files) {
        const st = fs.statSync(f.file)
        list.push({ prefixTemplate: f.prefixTemplate, rel: f.rel, size: st.size, mtime: st.mtimeMs, sha256: await sha256File(f.file) })
      }
      // same content as the newest version: nothing to do
      const fingerprint = crypto.createHash('sha256').update(JSON.stringify(list.map((x) => [x.prefixTemplate, x.rel, x.sha256]).sort())).digest('hex')
      const prev = this.versions(name)[0]
      if (prev && prev.fingerprint === fingerprint && !regKeys.length) return { ok: true, skipped: true, reason: 'unchanged', id: prev.id }

      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`
      // two backups in the same second (e.g. the safety copy right before a restore) must never share a folder:
      // the second one would overwrite the version being restored
      let id = stamp
      for (let n = 2; fs.existsSync(path.join(this._gameDir(name), id)); n++) id = `${stamp}-${n}`
      const vdir = path.join(this._gameDir(name), id)
      fs.mkdirSync(vdir, { recursive: true })
      const groups = [...new Set(list.map((x) => x.prefixTemplate))]
      let bytes = 0
      for (let i = 0; i < files.length; i++) {
        const dest = path.join(vdir, 'files', String(groups.indexOf(list[i].prefixTemplate)), list[i].rel)
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(files[i].file, dest)
        bytes += list[i].size
      }
      const registry = []
      for (let i = 0; i < regKeys.length; i++) {
        const out = path.join(vdir, `registry-${i}.reg`)
        const r = await run('reg.exe', ['export', regKeys[i], out, '/y'])
        if (r.code === 0) registry.push({ key: regKeys[i], file: path.basename(out) })
      }
      const info = { game: name, at: d.getTime(), label: String(label).slice(0, 80), fingerprint, bytes, groups, files: list, registry }
      fs.writeFileSync(path.join(vdir, 'backup.json'), JSON.stringify(info, null, 1))
      this._rotate(name)
      this.onEvent?.({ type: 'backup', game: name, id })
      return { ok: true, id, files: list.length, bytes, registry: registry.length }
    } finally {
      this.busy = false
    }
  }

  _rotate(name) {
    const keep = this.settings().keep
    // safety copies made before a restore are never rotated away automatically
    const old = this.versions(name).filter((v) => v.label !== 'before-restore').slice(keep)
    for (const v of old) fs.rmSync(path.join(this._gameDir(name), v.id), { recursive: true, force: true })
  }

  /** Where each stored file would go back to on this PC. */
  async previewRestore(name, id) {
    const m = await this._match(name)
    const vdir = path.join(this._gameDir(name), path.basename(String(id)))
    const info = JSON.parse(fs.readFileSync(path.join(vdir, 'backup.json'), 'utf8'))
    const env = this._env(m.game)
    const targets = info.files.map((f) => {
      const base = resolveTemplate(f.prefixTemplate.replace(/\\/g, '/'), env)
      const dest = base ? path.join(base, f.rel) : null
      // never write outside the save location the manifest names
      const inside = dest && !path.relative(base, dest).startsWith('..') && !path.isAbsolute(path.relative(base, dest))
      return { rel: f.rel, group: info.groups.indexOf(f.prefixTemplate), dest: inside ? dest : null, size: f.size, exists: Boolean(dest && fs.existsSync(dest)) }
    })
    return { ok: true, info: { ...info, files: undefined }, targets, vdir, installDir: m.game.installDir || null }
  }

  async _gameRunning(installDir) {
    if (!installDir) return false
    const ps = `$d = ${psQuote(installDir)}; @(Get-Process | Where-Object { $_.Path -and $_.Path.StartsWith($d, [StringComparison]::OrdinalIgnoreCase) }).Count`
    const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], 20000)
    return Number(r.stdout.trim()) > 0
  }

  async restore(name, id) {
    if (this.busy) return { ok: false, error: 'Outro backup está em andamento' }
    const p = await this.previewRestore(name, id)
    if (await this._gameRunning(p.installDir)) return { ok: false, error: 'Feche o jogo antes de restaurar' }
    // safety copy of what is there now, so a restore can always be undone
    const safety = await this.backup(name, { label: 'before-restore' })
    this.busy = true
    try {
      let restored = 0
      const skipped = []
      for (const t of p.targets) {
        if (!t.dest) { skipped.push(t.rel); continue }
        const src = path.join(p.vdir, 'files', String(t.group), t.rel)
        fs.mkdirSync(path.dirname(t.dest), { recursive: true })
        fs.copyFileSync(src, t.dest)
        restored++
      }
      let registry = 0
      for (const r of p.info.registry || []) {
        if (!/^HKEY_CURRENT_USER\\/i.test(r.key)) continue
        const res = await run('reg.exe', ['import', path.join(p.vdir, r.file)])
        if (res.code === 0) registry++
      }
      this.onEvent?.({ type: 'restore', game: name, id })
      return { ok: true, restored, skipped, registry, safetyId: safety.ok ? safety.id ?? null : null }
    } finally {
      this.busy = false
    }
  }

  removeVersion(name, id) {
    const vdir = path.join(this._gameDir(name), path.basename(String(id)))
    if (!fs.existsSync(path.join(vdir, 'backup.json'))) return { ok: false, error: 'Versão não encontrada' }
    fs.rmSync(vdir, { recursive: true, force: true })
    return { ok: true }
  }

  async backupAll() {
    const s = await this.scan()
    const results = []
    for (const g of s.games.filter((x) => x.files > 0 || x.registry > 0)) {
      results.push({ name: g.name, ...(await this.backup(g.name).catch((e) => ({ ok: false, error: String(e?.message ?? e) }))) })
    }
    return { ok: true, results }
  }

  /** Called when a game launched from the Library closes. */
  async onGameClosed(game) {
    if (!this.settings().autoOnExit || !game?.gameName) return
    try {
      await this._ensureIndex()
      const installed = await this.getInstalledGames()
      const hit = matchGames(this.index, installed.filter((g) => nameKey(g.name) === nameKey(game.gameName)))[0]
      if (hit) await this.backup(hit.entry.name, { label: 'auto' })
    } catch { /* best effort */ }
  }
}
