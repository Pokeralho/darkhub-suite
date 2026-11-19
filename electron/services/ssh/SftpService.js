import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const PROGRESS_MS = 100 // 10 Hz per transfer
const MAX_LIST = 20_000
const MAX_TREE = 100_000
const MAX_REMOTE_DELETE = 10_000
export const MAX_TEXT_BYTES = 10 * 1024 * 1024
const WATCH_MS = 1000

export class SftpError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code)
    this.code = code
    Object.assign(this, extra)
  }
}

const S_IFMT = 0o170000
const S_IFDIR = 0o040000
const S_IFLNK = 0o120000
const isDirMode = (mode) => (mode & S_IFMT) === S_IFDIR

export function modeString(mode, isDir, isLink) {
  const chars = ['r', 'w', 'x']
  let out = isLink ? 'l' : isDir ? 'd' : '-'
  for (let i = 8; i >= 0; i -= 1) out += mode & (1 << i) ? chars[(8 - i) % 3] : '-'
  return out
}

/** Remote paths are POSIX: normalize without letting ".." climb above "/". */
export function normalizeRemote(p) {
  const s = String(p ?? '').replace(/\\/g, '/').trim() || '.'
  const n = path.posix.normalize(s)
  return n === '' ? '.' : n
}

export function normalizeLocal(p) {
  const s = String(p ?? '').trim()
  if (!s) return os.homedir()
  if (!path.isAbsolute(s)) throw new SftpError('VALIDATION', 'local path must be absolute')
  return path.resolve(s)
}

// ---------- local (Windows) safety ----------
const WIN_RESERVED = /^(con|prn|aux|nul|conin\$|conout\$|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i
/**
 * Whether a remote file name can be used as ONE local path segment on Windows: no separators, drive/stream colons,
 * wildcard or control characters, no "." / "..", no trailing dot/space (Windows strips them) and no device names.
 */
export function isSafeLocalName(name) {
  const n = String(name ?? '')
  if (!n || n.length > 255 || n === '.' || n === '..') return false
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(n)) return false
  if (/[. ]$/.test(n)) return false
  return !WIN_RESERVED.test(n.split('.')[0].trimEnd())
}

/** A safe local name derived from any remote name (used for temp copies). */
export function sanitizeLocalName(name) {
  let n = String(name ?? '').slice(0, 200).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[. ]+$/, '')
  if (!n || n === '.' || n === '..') n = 'file'
  if (WIN_RESERVED.test(n.split('.')[0].trimEnd())) n = `_${n}`
  return n
}

/** target is root itself or below it (Windows paths compare case-insensitively). */
export function isInsideLocal(root, target) {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
}

// extensions that open in a viewer/editor and never execute: everything else gets ".txt" appended before opening
const VIEW_SAFE_EXT = new Set(['.txt', '.log', '.md', '.markdown', '.json', '.jsonc', '.yaml', '.yml', '.toml', '.ini', '.conf', '.cfg', '.cnf', '.properties'])
/** Local file name for "edit locally": shell.openPath must never run a script or program (.bat, .js, .vbs, .lnk...). */
export function editLocalName(remoteName, pathext = process.env.PATHEXT) {
  const n = sanitizeLocalName(remoteName)
  const ext = path.extname(n).toLowerCase()
  const exec = String(pathext ?? '').toLowerCase().split(';').map((e) => e.trim()).filter(Boolean)
  return VIEW_SAFE_EXT.has(ext) && !exec.includes(ext) ? n : `${n}.txt`
}

/**
 * Local folders the SFTP panel never writes to, renames or deletes in (the app runs elevated: a slip, or a hostile
 * file name, must not land in Windows or Program Files).
 */
export function protectedLocalRoots(extra = [], env = process.env) {
  const out = [env.WINDIR, env.SystemRoot, env.ProgramFiles, env['ProgramFiles(x86)'], env.ProgramW6432,
    env.ProgramData ? path.join(env.ProgramData, 'Microsoft') : null, ...extra]
  return [...new Set(out.filter((d) => typeof d === 'string' && d.trim()).map((d) => path.resolve(d)))]
}

export function parseMode(mode) {
  const s = String(mode ?? '').trim()
  if (!/^[0-7]{3,4}$/.test(s)) throw new SftpError('VALIDATION', 'mode must be octal like 755')
  return parseInt(s, 8)
}

/**
 * Text decoding for the editor: refuses binary (NUL bytes), keeps a UTF-8 BOM, falls back to latin1 when the bytes
 * are not valid UTF-8, and normalizes line endings to \n (the EOL is reported so saving restores it).
 */
export function decodeText(buf) {
  const head = buf.subarray(0, 8192)
  if (head.includes(0)) return { binary: true }
  let bom = false
  let body = buf
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { bom = true; body = buf.subarray(3) }
  let encoding = 'utf-8'
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(body) } catch { encoding = 'latin1'; text = body.toString('latin1') }
  const crlf = (text.match(/\r\n/g) || []).length
  const lf = (text.match(/(?<!\r)\n/g) || []).length
  const eol = crlf > lf ? 'crlf' : 'lf'
  return { binary: false, content: text.replace(/\r\n/g, '\n'), encoding, eol, bom }
}

export function encodeText(content, { encoding = 'utf-8', eol = 'lf', bom = false } = {}) {
  const text = String(content ?? '').replace(/\r\n/g, '\n')
  const withEol = eol === 'crlf' ? text.replace(/\n/g, '\r\n') : text
  const body = encoding === 'latin1' ? Buffer.from(withEol, 'latin1') : Buffer.from(withEol, 'utf8')
  return bom && encoding !== 'latin1' ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]) : body
}

function remoteEntry(dir, item) {
  const mode = item.attrs?.mode ?? 0
  const type = isDirMode(mode) ? 'dir' : (mode & S_IFMT) === S_IFLNK ? 'link' : 'file'
  return {
    name: item.filename,
    path: path.posix.join(dir, item.filename),
    type,
    size: Number(item.attrs?.size ?? 0),
    mtimeMs: Number(item.attrs?.mtime ?? 0) * 1000,
    mode: mode & 0o7777,
    permissions: modeString(mode, type === 'dir', type === 'link'),
    uid: item.attrs?.uid,
    gid: item.attrs?.gid
  }
}

const p = (fn) => new Promise((resolve, reject) => fn((err, v) => (err ? reject(err) : resolve(v))))

// ---------- root mode: sftp-server started through sudo on an exec channel (what WinSCP calls "SFTP server: sudo") ----------
export const SFTP_SERVER_PROBE = 'for p in /usr/lib/openssh/sftp-server /usr/libexec/openssh/sftp-server /usr/lib/ssh/sftp-server /usr/libexec/sftp-server /usr/lib/sftp-server /usr/local/libexec/sftp-server /usr/sbin/sftp-server; do [ -x "$p" ] && { echo "$p"; exit 0; }; done; command -v sftp-server || exit 1'
const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`
const SUDO_TIMEOUT_MS = 20_000

/** Runs a command on an exec channel; resolves { code, stdout, stderr }. stdin (optional) is written then closed. */
export function execCapture(client, cmd, stdin, timeoutMs = SUDO_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => { try { stream.close() } catch { /* gone */ } reject(new SftpError('TIMEOUT', `command timed out: ${cmd.split(' ')[0]}`)) }, timeoutMs)
      stream.on('data', (d) => { stdout += d })
      stream.stderr.on('data', (d) => { stderr += d })
      stream.on('close', (code) => { clearTimeout(timer); resolve({ code: typeof code === 'number' ? code : null, stdout: stdout.slice(0, 64 * 1024), stderr: stderr.slice(0, 8 * 1024) }) })
      if (stdin != null) stream.end(stdin)
    })
  })
}

/**
 * Wraps ssh2's SFTP client protocol around an exec channel (instead of the "sftp" subsystem): the channel runs
 * `sudo sftp-server`, so every file operation happens as root. The SFTP class only needs channelData/channelClose.
 */
export function sftpOverStream(client, stream, { preamble } = {}) {
  const { SFTP } = require('ssh2/lib/protocol/SFTP.js')
  // Backpressure: when the exec channel's buffer is full (write() returns false) the SFTP layer is told its window
  // is exhausted, so it queues packets in its own buffer instead of piling them on the channel; 'drain' reopens it.
  const OPEN_WINDOW = Number.MAX_SAFE_INTEGER
  let paused = false
  const fake = {
    _protocol: {
      _remoteIdentRaw: client?._protocol?._remoteIdentRaw,
      channelData: (_id, data) => {
        let flowing = true
        try { flowing = stream.write(data) !== false } catch { /* closed */ }
        if (!flowing) { paused = true; info.outgoing.window = 0; sftp._waitWindow = true }
      },
      channelClose: () => { try { stream.end() } catch { /* closed */ } }
    }
  }
  const info = {
    type: 'session',
    incoming: { id: 0, window: 2 ** 32 - 1, packetSize: 256 * 1024, state: 'open' },
    outgoing: { id: 0, window: OPEN_WINDOW, packetSize: 256 * 1024, state: 'open' }
  }
  const sftp = new SFTP(fake, info, {})
  stream.on?.('drain', () => {
    if (!paused) return
    paused = false
    info.outgoing.window = OPEN_WINDOW
    sftp._waitWindow = false
    const resume = sftp._chunkcb
    sftp._chunkcb = undefined
    if (typeof resume === 'function') { resume.call(sftp); return }
    // a packet split when the pause hit was queued without a resume callback: flush the queue in order
    while (!paused && Array.isArray(sftp._buffer) && sftp._buffer.length) fake._protocol.channelData(0, sftp._buffer.shift())
  })
  let stderr = ''
  stream.stderr?.on('data', (d) => { stderr = (stderr + d).slice(-4000) })
  stream.on('data', (d) => sftp.push(d))
  stream.on('end', () => sftp.push(null))
  stream.on('close', (code) => { info.outgoing.state = 'closed'; sftp.emit('close', code) })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => fail(new SftpError('SUDO_FAILED', stderr.trim() || 'sftp-server did not answer (sudo may need a terminal: "requiretty")')), SUDO_TIMEOUT_MS)
    const fail = (err) => { clearTimeout(timer); try { stream.close() } catch { /* gone */ } reject(err) }
    sftp.once('ready', () => { clearTimeout(timer); resolve(sftp) })
    sftp.once('error', (err) => fail(new SftpError('SUDO_FAILED', stderr.trim() || String(err?.message ?? err))))
    sftp.once('close', (code) => fail(new SftpError(/password|senha|incorrect|sorry/i.test(stderr) ? 'SUDO_PASSWORD' : 'SUDO_FAILED', stderr.trim() || `sftp-server exited (${code})`)))
    if (preamble) stream.write(preamble)
    sftp._init()
  })
}

/**
 * Opens a root SFTP session: finds sftp-server, then decides how to call sudo. Without a password it must be
 * NOPASSWD (sudo -n); with one, the password is checked first (sudo -k forces sudo to read it from stdin every
 * time, so the bytes that follow are always SFTP and never mistaken for a password).
 */
export async function openSudoSftp(client, password) {
  const probe = await execCapture(client, `sh -c ${shq(SFTP_SERVER_PROBE)}`)
  const server = probe.stdout.trim().split(/\r?\n/)[0]
  if (probe.code !== 0 || !server || !server.startsWith('/')) throw new SftpError('SFTP_SERVER_NOT_FOUND', 'sftp-server was not found on this server')
  const nopass = await execCapture(client, 'sudo -n true')
  if (nopass.code === 0) {
    const stream = await p((cb) => client.exec(`sudo -n -- ${shq(server)}`, cb))
    return { sftp: await sftpOverStream(client, stream), server, usedPassword: false }
  }
  if (/not in the sudoers|não está no arquivo sudoers|may not run sudo/i.test(nopass.stderr)) throw new SftpError('SUDO_DENIED', nopass.stderr.trim())
  if (!password) throw new SftpError('SUDO_PASSWORD_REQUIRED', 'sudo asks for a password')
  const check = await execCapture(client, "sudo -S -k -p '' true", `${password}\n`)
  if (check.code !== 0) {
    if (/not in the sudoers|may not run sudo/i.test(check.stderr)) throw new SftpError('SUDO_DENIED', check.stderr.trim())
    if (/tty|terminal/i.test(check.stderr)) throw new SftpError('SUDO_TTY', check.stderr.trim())
    throw new SftpError('SUDO_PASSWORD', 'wrong sudo password')
  }
  const stream = await p((cb) => client.exec(`sudo -S -k -p '' -- ${shq(server)}`, cb))
  return { sftp: await sftpOverStream(client, stream, { preamble: `${password}\n` }), server, usedPassword: true }
}
const permErr = (err) => err?.code === 3 || err?.code === 'EACCES' || err?.code === 'EPERM'
const notFound = (err) => err?.code === 2 || err?.code === 'ENOENT'

/**
 * SFTP dual-pane backend: local listing via fs, remote via ssh2's SFTP subsystem, file and folder transfers with
 * .part files, 10 Hz progress events, cancellation, text read/write for the built-in editor (atomic, with conflict
 * detection) and "edit locally" (download to a temp file, open it, re-upload on every save).
 */
export class SftpService {
  constructor({ manager, trashItem, openPath, onProgress, onWatch, tempDir, protectedDirs = [] } = {}) {
    this.manager = manager
    this.protectedRoots = protectedLocalRoots(protectedDirs)
    this.trashItem = trashItem
    this.openPath = openPath
    this.onProgress = onProgress ?? (() => {})
    this.onWatch = onWatch ?? (() => {})
    this.tempDir = tempDir ?? path.join(os.tmpdir(), 'darkhub-sftp-edit')
    this.handles = new Map() // sftpId -> { conn, sftp, hostId, home }
    this.transfers = new Map() // transferId -> { sftpId, cancel }
    this.watches = new Map() // watchId -> { sftpId, local, remote, stop }
  }

  /**
   * Opens (or reuses) the SFTP session of a tab. root=true runs sftp-server through sudo; sudoPassword defaults to
   * the login password of a password credential (or the one typed for this connection).
   */
  async open({ sftpId, hostId, password, root = false, sudoPassword } = {}) {
    if (!ID_RE.test(String(sftpId ?? ''))) throw new SftpError('VALIDATION', 'invalid sftpId')
    const existing = this.handles.get(sftpId)
    if (existing && existing.hostId === hostId && existing.root === Boolean(root)) return { remoteCwd: existing.home, localCwd: os.homedir(), root: existing.root }
    if (existing) this.close(sftpId)
    const conn = await this.manager.connectClient(hostId, { ownerId: sftpId, password, onDrop: () => this.dropped(sftpId) })
    let sftp
    let sudo = null
    try {
      if (root) {
        const host = this.manager.store?.getHost?.(hostId)
        const loginPw = host ? this.manager.authFor?.(host, password)?.password : password
        const pw = typeof sudoPassword === 'string' && sudoPassword.length ? sudoPassword : loginPw
        const r = await openSudoSftp(conn.client, pw)
        sftp = r.sftp
        sudo = { password: r.usedPassword ? pw : null }
      } else {
        sftp = await p((cb) => conn.client.sftp(cb))
      }
    } catch (err) {
      conn.close()
      if (err instanceof SftpError) throw err
      throw new SftpError('SFTP_UNAVAILABLE', `SFTP subsystem unavailable: ${err?.message ?? err}`)
    }
    let home = '/'
    try { home = await p((cb) => sftp.realpath('.', cb)) } catch { /* keep "/" */ }
    this.handles.set(sftpId, { conn, sftp, hostId, home, root: Boolean(root), sudo })
    return { remoteCwd: home, localCwd: os.homedir(), root: Boolean(root) }
  }

  /** Throws PROTECTED when a local write/rename/delete would touch a system or app folder (symlinks resolved). */
  async assertLocalWritable(file) {
    const candidates = [path.resolve(file)]
    try { candidates.push(await fs.promises.realpath(file)) } catch {
      try { candidates.push(path.join(await fs.promises.realpath(path.dirname(file)), path.basename(file))) } catch { /* parent missing */ }
    }
    for (const c of candidates) {
      for (const root of this.protectedRoots) {
        if (isInsideLocal(root, c)) throw new SftpError('PROTECTED', `${file}: writing inside ${root} is not allowed`)
      }
    }
  }

  dropped(sftpId) {
    this.handles.delete(sftpId)
    for (const [id, w] of this.watches) if (w.sftpId === sftpId) this.stopWatch(id, 'disconnected')
  }

  handle(sftpId) {
    const h = this.handles.get(sftpId)
    if (!h) throw new SftpError('NOT_OPEN', 'SFTP session is not open')
    return h
  }

  close(sftpId) {
    const h = this.handles.get(sftpId)
    this.manager.cancelPromptsOf?.(sftpId)
    for (const [id, t] of this.transfers) if (t.sftpId === sftpId) { t.cancel(); this.transfers.delete(id) }
    for (const [id, w] of this.watches) if (w.sftpId === sftpId) this.stopWatch(id, 'closed')
    if (!h) return false
    this.handles.delete(sftpId)
    try { h.sftp.end() } catch { /* closed */ }
    try { h.conn.close() } catch { /* closed */ }
    return true
  }

  // ---------- listing ----------
  async listLocal(dirPath) {
    const dir = normalizeLocal(dirPath)
    let dirents
    try { dirents = await fs.promises.readdir(dir, { withFileTypes: true }) } catch (err) { throw new SftpError(permErr(err) ? 'PERMISSION' : notFound(err) ? 'NOT_FOUND' : 'LOCAL_ERROR', `${dir}: ${err?.message ?? err}`) }
    const entries = []
    for (const d of dirents.slice(0, MAX_LIST)) {
      const full = path.join(dir, d.name)
      let st = null
      try { st = await fs.promises.lstat(full) } catch { /* locked/system file */ }
      const type = d.isDirectory() ? 'dir' : d.isSymbolicLink() ? 'link' : 'file'
      entries.push({ name: d.name, path: full, type, size: st?.size ?? 0, mtimeMs: st?.mtimeMs ?? 0, mode: (st?.mode ?? 0) & 0o7777, permissions: modeString(st?.mode ?? 0, type === 'dir', type === 'link') })
    }
    return { path: dir, parent: path.dirname(dir) === dir ? null : path.dirname(dir), entries, drives: process.platform === 'win32' && path.parse(dir).root === dir ? await this.listDrives() : undefined }
  }

  async listDrives() {
    const out = []
    for (const l of 'CDEFGHIJKLMNOPQRSTUVWXYZ') { try { await fs.promises.access(`${l}:\\`); out.push(`${l}:\\`) } catch { /* absent */ } }
    return out
  }

  async listRemote(sftpId, remotePath) {
    const { sftp, home } = this.handle(sftpId)
    let dir = normalizeRemote(remotePath || home)
    try { dir = await p((cb) => sftp.realpath(dir, cb)) } catch { /* keep as given */ }
    let list
    try { list = await p((cb) => sftp.readdir(dir, cb)) } catch (err) { throw new SftpError(permErr(err) ? 'PERMISSION' : notFound(err) ? 'NOT_FOUND' : 'REMOTE_ERROR', `${dir}: ${err?.message ?? err}`) }
    const entries = list.filter((i) => i.filename !== '.' && i.filename !== '..').slice(0, MAX_LIST).map((i) => remoteEntry(dir, i))
    // symlinks: resolve whether they point to a folder so double click can enter them
    await Promise.all(entries.filter((e) => e.type === 'link').map(async (e) => {
      try { const st = await p((cb) => sftp.stat(e.path, cb)); e.linkTarget = isDirMode(st.mode) ? 'dir' : 'file' } catch { e.linkTarget = 'broken' }
    }))
    return { path: dir, parent: dir === '/' ? null : path.posix.dirname(dir), entries }
  }

  // ---------- side abstraction ----------
  side(kind, sftp) {
    if (kind === 'local') {
      return {
        kind,
        join: (...a) => path.join(...a),
        stat: async (f) => { const s = await fs.promises.stat(f); return { isDir: s.isDirectory(), size: s.size, mode: s.mode & 0o7777, mtimeMs: s.mtimeMs } },
        lstat: async (f) => { const s = await fs.promises.lstat(f); return { isDir: s.isDirectory(), isLink: s.isSymbolicLink(), size: s.size } },
        readdir: async (d) => (await fs.promises.readdir(d)),
        mkdir: (d) => fs.promises.mkdir(d, { recursive: true }),
        readStream: (f) => fs.createReadStream(f),
        writeStream: (f) => fs.createWriteStream(f),
        unlink: (f) => fs.promises.unlink(f),
        rename: (a, b) => fs.promises.rename(a, b),
        exists: async (f) => { try { await fs.promises.stat(f); return true } catch { return false } }
      }
    }
    return {
      kind,
      join: (...a) => path.posix.join(...a),
      stat: async (f) => { const s = await p((cb) => sftp.stat(f, cb)); return { isDir: isDirMode(s.mode), size: Number(s.size ?? 0), mode: s.mode & 0o7777, mtimeMs: Number(s.mtime ?? 0) * 1000 } },
      lstat: async (f) => { const s = await p((cb) => sftp.lstat(f, cb)); return { isDir: isDirMode(s.mode), isLink: (s.mode & S_IFMT) === S_IFLNK, size: Number(s.size ?? 0) } },
      readdir: async (d) => (await p((cb) => sftp.readdir(d, cb))).map((i) => i.filename).filter((n) => n !== '.' && n !== '..'),
      mkdir: async (d) => { try { await p((cb) => sftp.mkdir(d, cb)) } catch (err) { if (!(await this.remoteExists(sftp, d))) throw err } },
      readStream: (f) => sftp.createReadStream(f),
      writeStream: (f) => sftp.createWriteStream(f),
      unlink: (f) => p((cb) => sftp.unlink(f, cb)),
      rename: (a, b) => this.remoteRename(sftp, a, b),
      exists: (f) => this.remoteExists(sftp, f)
    }
  }

  async remoteExists(sftp, file) {
    try { await p((cb) => sftp.stat(file, cb)); return true } catch { return false }
  }

  /** Atomic overwrite when the server supports posix-rename@openssh.com, else unlink + rename. */
  async remoteRename(sftp, from, to, overwrite = true) {
    if (overwrite && typeof sftp.ext_openssh_rename === 'function') {
      try { await p((cb) => sftp.ext_openssh_rename(from, to, cb)); return } catch { /* extension missing: fallback */ }
    }
    try { await p((cb) => sftp.rename(from, to, cb)) } catch (err) {
      if (!overwrite || !(await this.remoteExists(sftp, to))) throw err
      await p((cb) => sftp.unlink(to, cb))
      await p((cb) => sftp.rename(from, to, cb))
    }
  }

  /**
   * Replaces a remote file atomically (temp file in the same folder + rename) without breaking it: a symlink is
   * followed and its target rewritten, the temp file gets the original mode and owner/group, and when the owner
   * cannot be restored (not root) the file is overwritten in place instead, keeping owner, links and ACLs.
   * writeTo(dest) writes the new content to dest. Returns the path actually written.
   */
  async remoteReplace(sftp, file, writeTo) {
    let target = file
    try {
      const l = await p((cb) => sftp.lstat(file, cb))
      if ((l.mode & S_IFMT) === S_IFLNK) target = await p((cb) => sftp.realpath(file, cb))
    } catch { /* new file */ }
    let st = null
    try { st = await p((cb) => sftp.stat(target, cb)) } catch { /* new file */ }
    const tmp = path.posix.join(path.posix.dirname(target), `.${path.posix.basename(target)}.darkhub-${crypto.randomBytes(4).toString('hex')}.tmp`)
    try {
      await writeTo(tmp)
      if (st) {
        if (st.mode & 0o7777) { try { await p((cb) => sftp.chmod(tmp, st.mode & 0o7777, cb)) } catch { /* unsupported */ } }
        if (typeof st.uid === 'number' && typeof st.gid === 'number') {
          try { await p((cb) => sftp.chown(tmp, st.uid, st.gid, cb)) } catch {
            try { await p((cb) => sftp.unlink(tmp, cb)) } catch { /* gone */ }
            await writeTo(target)
            return target
          }
        }
      }
      await this.remoteRename(sftp, tmp, target, true)
    } catch (err) {
      try { await p((cb) => sftp.unlink(tmp, cb)) } catch { /* nothing written */ }
      throw err
    }
    return target
  }

  /** Walks a source tree: [{ rel, isDir, size }] (directories first, so they are created before their files). */
  async walk(src, root, budget = { left: MAX_TREE }) {
    const out = []
    const visit = async (rel) => {
      const full = rel ? src.join(root, rel) : root
      const names = await src.readdir(full)
      for (const n of names) {
        if (--budget.left < 0) throw new SftpError('TOO_MANY', `more than ${MAX_TREE} entries`)
        const r = rel ? (src.kind === 'local' ? path.join(rel, n) : path.posix.join(rel, n)) : n
        let st
        try {
          // lstat: a symlink/junction to a folder is not descended (it can point back up the tree and loop forever);
          // a symlink to a file is copied as the file it points to
          st = await src.lstat(src.join(root, r))
          if (st.isLink) {
            const t = await src.stat(src.join(root, r))
            if (t.isDir) continue
            st = t
          }
        } catch { continue }
        if (st.isDir) { out.push({ rel: r, isDir: true, size: 0 }); await visit(r) } else out.push({ rel: r, isDir: false, size: st.size })
      }
    }
    await visit('')
    return out
  }

  /**
   * Starts a transfer (file or whole folder) and resolves when it ends. conflict: 'fail' (default, error EXISTS),
   * 'overwrite' or 'skip' (existing files are kept). Progress goes through onProgress with aggregate bytes.
   */
  async transfer({ transferId, sftpId, direction, localPath, remotePath, overwrite = false, conflict } = {}) {
    if (!ID_RE.test(String(transferId ?? ''))) throw new SftpError('VALIDATION', 'invalid transferId')
    if (this.transfers.has(transferId)) throw new SftpError('VALIDATION', 'transfer already running')
    if (direction !== 'upload' && direction !== 'download') throw new SftpError('VALIDATION', 'direction must be upload or download')
    const policy = conflict === 'overwrite' || conflict === 'skip' ? conflict : overwrite ? 'overwrite' : 'fail'
    const { sftp } = this.handle(sftpId)
    const local = normalizeLocal(localPath)
    const remote = normalizeRemote(remotePath)
    const src = this.side(direction === 'upload' ? 'local' : 'remote', sftp)
    const dst = this.side(direction === 'upload' ? 'remote' : 'local', sftp)
    const srcRoot = direction === 'upload' ? local : remote
    const dstRoot = direction === 'upload' ? remote : local
    if (direction === 'download') {
      // the local target is "<folder>\\<remote name>": a server-chosen name like "..\\..\\x.bat", "C:x" or "CON" must
      // not steer the write outside that folder
      const rawName = String(remotePath ?? '').split('/').filter(Boolean).pop() ?? ''
      if (!isSafeLocalName(rawName) || String(localPath ?? '').split(/[\\/]/).some((seg) => seg === '.' || seg === '..')) {
        throw new SftpError('UNSAFE_NAME', `"${rawName}" is not a valid file name on Windows`, { names: [rawName] })
      }
      await this.assertLocalWritable(local)
    }

    let rootStat
    try { rootStat = await src.stat(srcRoot) } catch (err) { throw new SftpError(notFound(err) ? 'NOT_FOUND' : 'TRANSFER_FAILED', `${srcRoot}: ${err?.message ?? err}`) }
    const dstExists = await dst.exists(dstRoot)
    if (dstExists && policy === 'fail') throw new SftpError('EXISTS', `${dstRoot} already exists`, { isDir: rootStat.isDir })

    const items = rootStat.isDir ? await this.walk(src, srcRoot) : [{ rel: '', isDir: false, size: rootStat.size }]
    const total = items.reduce((a, i) => a + i.size, 0)
    const files = items.filter((i) => !i.isDir).length
    const state = { cancelled: false, transferred: 0, done: 0, skipped: 0, current: null, active: null, unsafe: [] }
    const started = Date.now()
    let lastEmit = 0
    const emit = (status, extra = {}) => {
      const elapsed = Math.max(1, Date.now() - started) / 1000
      this.onProgress({
        transferId, sftpId, direction, transferredBytes: state.transferred, totalBytes: total, speedBps: Math.round(state.transferred / elapsed),
        status, isDir: rootStat.isDir, filesDone: state.done, filesTotal: files, filesSkipped: state.skipped, currentFile: state.current, ...extra
      })
    }
    this.transfers.set(transferId, {
      sftpId,
      cancel: () => {
        state.cancelled = true
        const a = state.active
        if (a) { try { a.src.unpipe(a.dst) } catch { /* gone */ } try { a.src.destroy() } catch { /* gone */ } try { a.dst.destroy() } catch { /* gone */ } }
      }
    })

    const copyFile = async (from, to) => {
      const part = `${to}.part`
      const rs = src.readStream(from)
      const ws = dst.writeStream(part)
      state.active = { src: rs, dst: ws }
      try {
        await new Promise((resolve, reject) => {
          rs.on('data', (chunk) => {
            state.transferred += chunk.length
            const t = Date.now()
            if (t - lastEmit >= PROGRESS_MS) { lastEmit = t; emit('running') }
          })
          // pipe() leaves the destination open when the source fails (and the source open when the destination
          // fails): close both ends so neither the local fd nor the remote handle leaks, and wait (bounded: a dead
          // connection never answers FXP_CLOSE) until the .part is closed before it is unlinked
          let failed = false
          const fail = (err) => {
            if (failed) return
            failed = true
            try { rs.unpipe(ws) } catch { /* gone */ }
            try { rs.destroy() } catch { /* gone */ }
            if (ws.closed) return reject(err)
            const timer = setTimeout(() => reject(err), 2000)
            ws.once('close', () => { clearTimeout(timer); reject(err) })
            try { ws.destroy() } catch { clearTimeout(timer); reject(err) }
          }
          rs.on('error', fail)
          ws.on('error', fail)
          // 'close' (not 'finish'): on SFTP it fires only after the remote handle is closed (FXP_CLOSE answered),
          // so the .part file is complete on the server before it is renamed
          ws.on('close', () => { if (!failed) resolve() })
          rs.pipe(ws)
        })
        if (state.cancelled) throw new SftpError('CANCELLED', 'transfer cancelled')
        await dst.rename(part, to, true)
        // keep the permission bits on uploads/downloads of scripts
        if (dst.kind === 'remote') { try { const st = await src.stat(from); if (st.mode) await p((cb) => sftp.chmod(to, st.mode, cb)) } catch { /* not supported */ } }
      } catch (err) {
        try { await dst.unlink(part) } catch { /* nothing written */ }
        throw err
      } finally {
        state.active = null
      }
    }

    emit('running')
    try {
      if (!rootStat.isDir) {
        state.current = path.basename(srcRoot)
        if (dstExists && policy === 'skip') state.skipped += 1
        else { await copyFile(srcRoot, dstRoot); state.done += 1 }
      } else {
        await dst.mkdir(dstRoot)
        for (const it of items) {
          if (state.cancelled) throw new SftpError('CANCELLED', 'transfer cancelled')
          const relDst = dst.kind === 'remote' ? it.rel.split(path.sep).join('/') : it.rel.split('/').join(path.sep)
          const from = src.join(srcRoot, it.rel)
          const to = dst.join(dstRoot, relDst)
          if (dst.kind === 'local') {
            // every remote name segment must be a plain Windows name, and the result must stay in the folder
            const bad = it.rel.split('/').find((seg) => !isSafeLocalName(seg))
            if (bad !== undefined || !isInsideLocal(dstRoot, to) || path.resolve(to) === path.resolve(dstRoot)) {
              const shown = bad ?? it.rel
              if (!state.unsafe.includes(shown) && state.unsafe.length < 20) state.unsafe.push(shown)
              if (!it.isDir) { state.skipped += 1; state.transferred += it.size }
              continue
            }
          }
          if (it.isDir) { await dst.mkdir(to); continue }
          state.current = it.rel
          if (policy !== 'overwrite' && await dst.exists(to)) { state.skipped += 1; state.transferred += it.size; continue }
          await copyFile(from, to)
          state.done += 1
        }
      }
      emit('done', state.unsafe.length ? { unsafeNames: state.unsafe } : {})
      return { ok: true, transferId, filesDone: state.done, filesSkipped: state.skipped, totalBytes: total, ...(state.unsafe.length ? { unsafeNames: state.unsafe } : {}) }
    } catch (err) {
      const cancelled = state.cancelled
      const code = cancelled ? 'CANCELLED' : permErr(err) ? 'PERMISSION' : err?.code === 'TOO_MANY' ? 'TOO_MANY' : 'TRANSFER_FAILED'
      emit(cancelled ? 'cancelled' : 'failed', { error: cancelled ? undefined : String(err?.message ?? err).slice(0, 300) })
      return { ok: false, transferId, code, error: String(err?.message ?? err).slice(0, 300) }
    } finally {
      this.transfers.delete(transferId)
    }
  }

  cancelTransfer(transferId) {
    const t = this.transfers.get(transferId)
    if (!t) return false
    t.cancel()
    return true
  }

  // ---------- text editor ----------
  async readText({ sftpId, side, path: target, force = false } = {}) {
    const isLocal = side === 'local'
    const file = isLocal ? normalizeLocal(target) : normalizeRemote(target)
    const io = this.side(isLocal ? 'local' : 'remote', isLocal ? null : this.handle(sftpId).sftp)
    let st
    try { st = await io.stat(file) } catch (err) { throw new SftpError(notFound(err) ? 'NOT_FOUND' : permErr(err) ? 'PERMISSION' : 'READ_FAILED', `${file}: ${err?.message ?? err}`) }
    if (st.isDir) throw new SftpError('NOT_FILE', 'this is a folder')
    if (st.size > MAX_TEXT_BYTES) throw new SftpError('TOO_LARGE', `file is larger than ${MAX_TEXT_BYTES / 1048576} MB`, { size: st.size })
    const buf = await this.readAll(io, file, MAX_TEXT_BYTES + 1)
    const decoded = decodeText(buf)
    if (decoded.binary && !force) throw new SftpError('BINARY', 'this looks like a binary file')
    let readOnly = false
    if (isLocal) { try { await fs.promises.access(file, fs.constants.W_OK) } catch { readOnly = true } }
    return { path: file, content: decoded.binary ? buf.toString('latin1') : decoded.content, encoding: decoded.encoding ?? 'latin1', eol: decoded.eol ?? 'lf', bom: Boolean(decoded.bom), size: st.size, mtimeMs: st.mtimeMs, mode: st.mode, readOnly }
  }

  async readAll(io, file, limit) {
    const chunks = []
    let n = 0
    await new Promise((resolve, reject) => {
      const rs = io.readStream(file)
      rs.on('data', (c) => { chunks.push(c); n += c.length; if (n > limit) { rs.destroy(); reject(new SftpError('TOO_LARGE', 'file too large')) } })
      rs.on('error', (err) => reject(permErr(err) ? new SftpError('PERMISSION', String(err.message)) : err))
      rs.on('end', resolve)
      rs.on('close', resolve)
    })
    return Buffer.concat(chunks)
  }

  /**
   * Saves editor content atomically (temp file + rename, mode preserved). expectedMtimeMs/expectedSize detect
   * that someone else changed the file since it was opened: CONFLICT unless force.
   */
  async writeText({ sftpId, side, path: target, content, encoding, eol, bom, expectedMtimeMs, expectedSize, force = false, create = false } = {}) {
    const isLocal = side === 'local'
    let file = isLocal ? normalizeLocal(target) : normalizeRemote(target)
    const requested = file
    if (isLocal) {
      await this.assertLocalWritable(file)
      // a symlink is saved through to its target (renaming over it would replace the link with a plain file)
      try { if ((await fs.promises.lstat(file)).isSymbolicLink()) file = await fs.promises.realpath(file) } catch { /* new file */ }
    }
    const sftp = isLocal ? null : this.handle(sftpId).sftp
    const io = this.side(isLocal ? 'local' : 'remote', sftp)
    const buf = encodeText(content, { encoding, eol, bom })
    if (buf.length > MAX_TEXT_BYTES) throw new SftpError('TOO_LARGE', 'content too large')
    let current = null
    try { current = await io.stat(file) } catch { /* new file */ }
    if (current?.isDir) throw new SftpError('NOT_FILE', 'this is a folder')
    if (!current && !create && expectedMtimeMs != null) throw new SftpError('CONFLICT', 'the file was deleted since it was opened', { deleted: true })
    if (current && create) throw new SftpError('EXISTS', `${file} already exists`)
    if (current && !force && expectedMtimeMs != null) {
      const changed = Math.abs(current.mtimeMs - Number(expectedMtimeMs)) >= 1000 || (expectedSize != null && current.size !== Number(expectedSize))
      if (changed) throw new SftpError('CONFLICT', 'the file changed on disk since it was opened', { mtimeMs: current.mtimeMs, size: current.size })
    }
    const writeBuf = (dest) => new Promise((resolve, reject) => {
      const ws = io.writeStream(dest)
      ws.on('error', reject)
      ws.on('close', resolve) // after the handle is closed (see copyFile)
      ws.end(buf)
    })
    if (!isLocal) {
      try { await this.remoteReplace(sftp, file, writeBuf) } catch (err) {
        throw new SftpError(permErr(err) ? 'PERMISSION' : 'WRITE_FAILED', `${file}: ${err?.message ?? err}`)
      }
    } else {
      const tmp = path.join(path.dirname(file), `.${path.basename(file)}.darkhub-${crypto.randomBytes(4).toString('hex')}.tmp`)
      try {
        await writeBuf(tmp)
        if (current?.mode) { try { await fs.promises.chmod(tmp, current.mode) } catch { /* windows */ } }
        await fs.promises.rename(tmp, file)
      } catch (err) {
        try { await io.unlink(tmp) } catch { /* nothing written */ }
        throw new SftpError(permErr(err) ? 'PERMISSION' : 'WRITE_FAILED', `${file}: ${err?.message ?? err}`)
      }
    }
    const st = await io.stat(file)
    return { path: requested, size: st.size, mtimeMs: st.mtimeMs }
  }

  async stat({ sftpId, side, path: target } = {}) {
    const isLocal = side === 'local'
    const file = isLocal ? normalizeLocal(target) : normalizeRemote(target)
    if (isLocal) {
      const st = await fs.promises.lstat(file)
      return { path: file, type: st.isDirectory() ? 'dir' : st.isSymbolicLink() ? 'link' : 'file', size: st.size, mode: st.mode & 0o7777, mtimeMs: st.mtimeMs, atimeMs: st.atimeMs }
    }
    const { sftp } = this.handle(sftpId)
    const st = await p((cb) => sftp.lstat(file, cb))
    let target2 = null
    if ((st.mode & S_IFMT) === S_IFLNK) { try { target2 = await p((cb) => sftp.readlink(file, cb)) } catch { /* unreadable */ } }
    return { path: file, type: isDirMode(st.mode) ? 'dir' : (st.mode & S_IFMT) === S_IFLNK ? 'link' : 'file', size: Number(st.size ?? 0), mode: st.mode & 0o7777, mtimeMs: Number(st.mtime ?? 0) * 1000, atimeMs: Number(st.atime ?? 0) * 1000, uid: st.uid, gid: st.gid, linkTarget: target2 }
  }

  /** Folder size for the properties dialog (bounded walk). */
  async du({ sftpId, side, path: target } = {}) {
    const isLocal = side === 'local'
    const root = isLocal ? normalizeLocal(target) : normalizeRemote(target)
    const io = this.side(isLocal ? 'local' : 'remote', isLocal ? null : this.handle(sftpId).sftp)
    const items = await this.walk(io, root)
    return { files: items.filter((i) => !i.isDir).length, dirs: items.filter((i) => i.isDir).length, bytes: items.reduce((a, i) => a + i.size, 0) }
  }

  // ---------- edit locally (default Windows app, auto re-upload) ----------
  async editExternal({ sftpId, path: remote } = {}) {
    const { sftp } = this.handle(sftpId)
    const file = normalizeRemote(remote)
    const st = await this.side('remote', sftp).stat(file)
    if (st.isDir) throw new SftpError('NOT_FILE', 'this is a folder')
    const watchId = `w${crypto.randomBytes(5).toString('hex')}`
    const dir = path.join(this.tempDir, watchId)
    await fs.promises.mkdir(dir, { recursive: true })
    const local = path.join(dir, editLocalName(path.posix.basename(file)))
    await new Promise((resolve, reject) => {
      const rs = sftp.createReadStream(file)
      const ws = fs.createWriteStream(local)
      // a failed download must not leave the local temp file open (locked) or the remote handle open
      const fail = (err) => { try { rs.destroy() } catch { /* gone */ } try { ws.destroy() } catch { /* gone */ } reject(err) }
      rs.on('error', fail); ws.on('error', fail); ws.on('close', resolve)
      rs.pipe(ws)
    })
    let last = (await fs.promises.stat(local)).mtimeMs
    let uploading = false
    const check = async () => {
      if (uploading) return
      let now
      try { now = (await fs.promises.stat(local)).mtimeMs } catch { return }
      if (now === last) return
      last = now
      uploading = true
      this.onWatch({ watchId, sftpId, remotePath: file, localPath: local, status: 'uploading' })
      try {
        const h = this.handles.get(sftpId)
        if (!h) throw new SftpError('NOT_OPEN', 'SFTP session closed')
        await this.remoteReplace(h.sftp, file, (dest) => new Promise((resolve, reject) => {
          const rs = fs.createReadStream(local)
          const ws = h.sftp.createWriteStream(dest)
          // 'close' only (as in copyFile): the temp file must be closed on the server before remoteReplace renames it;
          // on an error both ends are closed so the remote handle doesn't leak
          const fail = (err) => { try { rs.destroy() } catch { /* gone */ } try { ws.destroy() } catch { /* gone */ } reject(err) }
          rs.on('error', fail); ws.on('error', fail); ws.on('close', resolve)
          rs.pipe(ws)
        }))
        this.onWatch({ watchId, sftpId, remotePath: file, localPath: local, status: 'uploaded', at: Date.now() })
      } catch (err) {
        this.onWatch({ watchId, sftpId, remotePath: file, localPath: local, status: 'error', error: String(err?.message ?? err).slice(0, 300) })
      } finally {
        uploading = false
      }
    }
    const timer = setInterval(() => { void check() }, WATCH_MS)
    timer.unref?.()
    this.watches.set(watchId, { sftpId, local, remote: file, stop: () => clearInterval(timer), dir })
    this.onWatch({ watchId, sftpId, remotePath: file, localPath: local, status: 'watching' })
    if (this.openPath) {
      const err = await this.openPath(local)
      if (err) { this.stopWatch(watchId); throw new SftpError('OPEN_FAILED', String(err)) }
    }
    return { watchId, localPath: local }
  }

  stopWatch(watchId, reason = 'stopped') {
    const w = this.watches.get(watchId)
    if (!w) return false
    w.stop()
    this.watches.delete(watchId)
    this.onWatch({ watchId, sftpId: w.sftpId, remotePath: w.remote, localPath: w.local, status: 'stopped', reason })
    setTimeout(() => { fs.promises.rm(w.dir, { recursive: true, force: true }).catch(() => {}) }, 5000).unref?.()
    return true
  }

  listWatches() {
    return [...this.watches.entries()].map(([watchId, w]) => ({ watchId, sftpId: w.sftpId, remotePath: w.remote, localPath: w.local }))
  }

  // ---------- file operations ----------
  async removeRemote(sftp, target, budget = { left: MAX_REMOTE_DELETE }) {
    const st = await p((cb) => sftp.lstat(target, cb))
    if (!isDirMode(st.mode)) {
      if (--budget.left < 0) throw new SftpError('TOO_MANY', 'too many entries to delete')
      return p((cb) => sftp.unlink(target, cb))
    }
    const list = await p((cb) => sftp.readdir(target, cb))
    for (const i of list) {
      if (i.filename === '.' || i.filename === '..') continue
      await this.removeRemote(sftp, path.posix.join(target, i.filename), budget)
    }
    return p((cb) => sftp.rmdir(target, cb))
  }

  async fsOp({ sftpId, side, op, path: target, targetPath, mode } = {}) {
    if (!['mkdir', 'rename', 'delete', 'chmod', 'touch', 'symlink', 'copy'].includes(op)) throw new SftpError('VALIDATION', 'unknown operation')
    if (side === 'local') {
      const file = normalizeLocal(target)
      if (path.parse(file).root === file) throw new SftpError('VALIDATION', 'refusing to touch a drive root')
      await this.assertLocalWritable(file)
      if ((op === 'rename' || op === 'copy') && targetPath != null) await this.assertLocalWritable(normalizeLocal(targetPath))
      try {
        if (op === 'mkdir') await fs.promises.mkdir(file, { recursive: false })
        else if (op === 'rename') await fs.promises.rename(file, normalizeLocal(targetPath))
        else if (op === 'delete') {
          // local deletions go to the Recycle Bin, never straight to oblivion
          if (!this.trashItem) throw new SftpError('UNAVAILABLE', 'recycle bin unavailable')
          await this.trashItem(file)
        } else if (op === 'chmod') await fs.promises.chmod(file, parseMode(mode))
        else if (op === 'touch') await (await fs.promises.open(file, 'wx')).close()
        else if (op === 'copy') await fs.promises.cp(file, normalizeLocal(targetPath), { recursive: true, errorOnExist: true, force: false })
        else throw new SftpError('VALIDATION', 'symlinks are not created on the local side')
      } catch (err) {
        if (err instanceof SftpError) throw err
        throw new SftpError(err?.code === 'EEXIST' ? 'EXISTS' : permErr(err) ? 'PERMISSION' : 'LOCAL_ERROR', `${file}: ${err?.message ?? err}`)
      }
      return { ok: true }
    }
    if (side !== 'remote') throw new SftpError('VALIDATION', 'side must be local or remote')
    const { sftp, conn, sudo, root } = this.handle(sftpId)
    const file = normalizeRemote(target)
    if (file === '/' || file === '.') throw new SftpError('VALIDATION', 'refusing to touch the remote root')
    try {
      if (op === 'mkdir') await p((cb) => sftp.mkdir(file, cb))
      else if (op === 'rename') {
        const to = normalizeRemote(targetPath)
        if (await this.remoteExists(sftp, to)) throw new SftpError('EXISTS', `${to} already exists`)
        await p((cb) => sftp.rename(file, to, cb))
      } else if (op === 'delete') await this.removeRemote(sftp, file)
      else if (op === 'chmod') await p((cb) => sftp.chmod(file, parseMode(mode), cb))
      else if (op === 'touch') {
        const h = await p((cb) => sftp.open(file, 'wx', cb))
        await p((cb) => sftp.close(h, cb))
      } else if (op === 'symlink') await p((cb) => sftp.symlink(normalizeRemote(targetPath), file, cb))
      else if (op === 'copy') {
        // server-side copy through an exec channel (cp -a), arguments single-quoted
        const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`
        const to = normalizeRemote(targetPath)
        if (await this.remoteExists(sftp, to)) throw new SftpError('EXISTS', `${to} already exists`)
        const cp = `cp -a -- ${q(file)} ${q(to)}`
        const r = !root ? await execCapture(conn.client, cp)
          : sudo?.password ? await execCapture(conn.client, `sudo -S -k -p '' -- sh -c ${q(cp)}`, `${sudo.password}\n`)
            : await execCapture(conn.client, `sudo -n -- sh -c ${q(cp)}`)
        if (r.code !== 0) throw new Error(r.stderr.trim() || `cp exited with ${r.code}`)
      }
    } catch (err) {
      if (err instanceof SftpError) throw err
      throw new SftpError(permErr(err) ? 'PERMISSION' : err?.code === 4 && op === 'touch' ? 'EXISTS' : 'REMOTE_ERROR', `${file}: ${err?.message ?? err}`)
    }
    return { ok: true }
  }

  closeAll() {
    for (const id of [...this.watches.keys()]) this.stopWatch(id, 'closed')
    for (const id of [...this.handles.keys()]) this.close(id)
  }
}
