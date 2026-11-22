// Quarantine: a detected file is moved into <root>/<id>.q, XOR-ed with a random per-item key so it can neither run nor
// be picked up again by another scanner, with <id>.json holding where it came from. Restore reverses it exactly.
//
// We run as Administrator and <root> lives under ProgramData, whose default ACL lets any user create files in new
// subfolders. So the folder is locked to Administrators + SYSTEM before use (otherwise a planted <id>.json could make
// restore() write anywhere as admin), the file added is checked to be the one that was scanned (no swap for a
// link or another file between detection and quarantine), and restore never writes into system folders.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { protectedPathReason } from '../diskscan/DiskScanService.js'
import { psQuote } from '../optimizer/OptimizerUtils.js'

const ID_RE = /^[0-9a-f]{16}$/

function xorStream(key, hash) {
  let offset = 0
  return new Transform({
    transform(chunk, _enc, done) {
      hash?.update(chunk)
      const out = Buffer.allocUnsafe(chunk.length)
      for (let i = 0; i < chunk.length; i++) out[i] = chunk[i] ^ key[(offset + i) % key.length]
      offset += chunk.length
      done(null, out)
    }
  })
}

/** XORs `src` (a path or an open fd) into `dest`; resolves the SHA-256 of what was read. */
async function transcode(src, dest, key) {
  const tmp = `${dest}.part`
  fs.rmSync(tmp, { force: true }) // a .part left by a crash would make the exclusive create below fail forever
  const hash = crypto.createHash('sha256')
  const input = typeof src === 'number' ? fs.createReadStream(null, { fd: src, autoClose: false }) : fs.createReadStream(src)
  try {
    await pipeline(input, xorStream(key, hash), fs.createWriteStream(tmp, { flags: 'wx' }))
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
  fs.renameSync(tmp, dest)
  return hash.digest('hex')
}

/** Locks `dir` to Administrators and SYSTEM (owner Administrators, no inherited ACEs). Windows only. */
export function lockDownDir(dir) {
  if (process.platform !== 'win32') return Promise.resolve(true)
  const icacls = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'icacls.exe')
  const run = (args) => new Promise((resolve) => execFile(icacls, args, { windowsHide: true, timeout: 20000 }, (err) => resolve(!err)))
  return run([dir, '/setowner', '*S-1-5-32-544'])
    .then(() => run([dir, '/inheritance:r', '/grant:r', '*S-1-5-32-544:(OI)(CI)F', '*S-1-5-18:(OI)(CI)F']))
}

const TRUSTED_OWNERS = new Set(['S-1-5-32-544', 'S-1-5-18'])

/**
 * Files under `dir` (recursive) owned by anyone but Administrators / SYSTEM. Before the first lockdown ProgramData lets
 * a standard user create the folder and files in it; the lockdown cuts its access, but what it planted (a .json naming
 * any restore target, with its own key and payload) would still be listed and restored as admin. Windows only.
 */
export function foreignOwnedFiles(dir) {
  if (process.platform !== 'win32') return Promise.resolve([])
  const lit = psQuote(dir)
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    `Get-ChildItem -LiteralPath ${lit} -Recurse -Force -File | ForEach-Object {`,
    '  $o = (Get-Acl -LiteralPath $_.FullName).GetOwner([Security.Principal.SecurityIdentifier]).Value',
    `  if (${[...TRUSTED_OWNERS].map((s) => `$o -ne '${s}'`).join(' -and ')}) { $_.FullName }`,
    '}'
  ].join('\n')
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
  return new Promise((resolve, reject) => {
    execFile(ps, args, { windowsHide: true, timeout: 60000, maxBuffer: 16 << 20, encoding: 'utf8' }, (err, out) => {
      if (err) return reject(new Error(`could not check who owns the files in ${dir}: ${err.message}`))
      resolve(String(out).split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    })
  })
}

/** lockDownDir + removes what a non-admin planted there before. Resolves the removed paths; throws when unsure. */
export async function secureDir(dir, { foreignOwned = foreignOwnedFiles } = {}) {
  if (!(await lockDownDir(dir))) throw new Error(`could not secure ${dir}`)
  const bad = await foreignOwned(dir)
  for (const f of bad) fs.rmSync(f, { force: true })
  return bad
}

export class Quarantine {
  /**
   * opts.lockDown: ACL the folder to Administrators + SYSTEM before first use. A boolean or an async predicate: the app
   * passes "are we elevated?" (a non-elevated dev run would lock itself out, and is no privilege-escalation path anyway).
   */
  constructor(root, { lockDown = false, foreignOwned = foreignOwnedFiles, secure = secureDir } = {}) {
    this.root = root
    this.lockDown = lockDown
    this.foreignOwned = foreignOwned
    this.secure = secure
    this.locked = false
    this.purged = []
    this.ready = null
  }

  async #ensureRoot() {
    this.ready ||= (async () => {
      fs.mkdirSync(this.root, { recursive: true })
      const lock = typeof this.lockDown === 'function' ? await this.lockDown().catch(() => false) : this.lockDown
      if (lock) {
        try { this.purged = await this.secure(this.root, { foreignOwned: this.foreignOwned }) } catch { throw new Error('could not secure the quarantine folder') }
        this.locked = true
      }
    })().catch((e) => { this.ready = null; throw e })
    return this.ready
  }

  #paths(id) {
    if (!ID_RE.test(id)) throw new Error('invalid quarantine id')
    return { data: path.join(this.root, `${id}.q`), meta: path.join(this.root, `${id}.json`) }
  }

  /**
   * Moves the file into quarantine. If it cannot be removed (in use), nothing is kept and an error is thrown.
   * info.sha256 / info.size (what was scanned): when given, the file must still match them.
   */
  async add(file, info = {}) {
    await this.#ensureRoot()
    const st = fs.lstatSync(file)
    if (!st.isFile() || st.isSymbolicLink()) throw new Error('not a regular file, not quarantined')
    const fd = fs.openSync(file, 'r')
    const id = crypto.randomBytes(8).toString('hex')
    const key = crypto.randomBytes(32)
    const p = this.#paths(id)
    try {
      const fst = fs.fstatSync(fd)
      if (fst.ino !== st.ino || fst.dev !== st.dev) throw new Error('file changed while being quarantined')
      if (info.size != null && fst.size !== info.size) throw new Error('file changed since it was scanned')
      const sha = await transcode(fd, p.data, key)
      if (info.sha256 && sha !== String(info.sha256).toLowerCase()) {
        fs.rmSync(p.data, { force: true })
        throw new Error('file changed since it was scanned')
      }
    } finally {
      fs.closeSync(fd)
    }
    try {
      fs.unlinkSync(file)
    } catch (e) {
      fs.rmSync(p.data, { force: true })
      throw new Error(`file in use, not quarantined: ${e.code || e.message}`)
    }
    const meta = { id, originalPath: file, key: key.toString('hex'), at: Date.now(), ...info }
    fs.writeFileSync(p.meta, JSON.stringify(meta))
    return this.#public(meta)
  }

  #public(meta) {
    const { key, ...rest } = meta
    return rest
  }

  list() {
    let names = []
    try { names = fs.readdirSync(this.root) } catch { return [] }
    const items = []
    for (const n of names) {
      if (!n.endsWith('.json')) continue
      try { items.push(this.#public(JSON.parse(fs.readFileSync(path.join(this.root, n), 'utf8')))) } catch { /* skip a damaged entry */ }
    }
    return items.sort((a, b) => b.at - a.at)
  }

  /** Restores to the original path, or next to it with a suffix when a file with that name exists again. */
  async restore(id) {
    await this.#ensureRoot()
    const p = this.#paths(id)
    const meta = JSON.parse(fs.readFileSync(p.meta, 'utf8'))
    if (typeof meta.originalPath !== 'string' || !path.isAbsolute(meta.originalPath) || !/^[0-9a-f]{64}$/.test(String(meta.key))) {
      throw new Error('damaged quarantine entry')
    }
    // never write into Windows / Program Files / ProgramData as admin on behalf of a metadata file
    if (protectedPathReason(meta.originalPath)) throw new Error('refusing to restore into a system folder: restore it manually')
    if (this.locked) {
      // only entries this (elevated) app wrote: anything else in the folder was planted, whatever the lockdown left
      const foreign = new Set((await this.foreignOwned(this.root)).map((f) => path.resolve(f).toLowerCase()))
      if ([p.meta, p.data].some((f) => foreign.has(path.resolve(f).toLowerCase()))) throw new Error('quarantine entry not created by DarkHub: refusing to restore')
    }
    const { dir, name, ext } = path.parse(meta.originalPath)
    let dest = meta.originalPath
    for (let i = 1; fs.existsSync(dest); i++) dest = path.join(dir, `${name} (restored ${i})${ext}`)
    fs.mkdirSync(dir, { recursive: true })
    await transcode(p.data, dest, Buffer.from(meta.key, 'hex'))
    fs.rmSync(p.data, { force: true })
    fs.rmSync(p.meta, { force: true })
    return { restoredTo: dest }
  }

  remove(id) {
    const p = this.#paths(id)
    fs.rmSync(p.data, { force: true })
    fs.rmSync(p.meta, { force: true })
  }
}
