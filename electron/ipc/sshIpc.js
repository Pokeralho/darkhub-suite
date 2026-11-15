import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { SshVaultStore } from '../services/ssh/SshVaultStore.js'
import { SshSessionManager } from '../services/ssh/SshSessionManager.js'
import { SftpService } from '../services/ssh/SftpService.js'
import { PortForwardService } from '../services/ssh/PortForwardService.js'
import { SerialService } from '../services/ssh/SerialService.js'
import { renderSnippet } from '../services/ssh/snippetTemplate.js'
import { parseSshConfig } from '../services/ssh/sshConfigParser.js'

/**
 * Vault key: 32 random bytes wrapped with DPAPI (safeStorage) in userData/ssh-vault.key. Without DPAPI (should not
 * happen on Windows) the key is kept unwrapped and getState reports keyProtection: 'none'.
 */
export function makeVaultKeyProvider(file, safeStorage) {
  let key = null
  let protection = 'none'
  const can = () => { try { return Boolean(safeStorage?.isEncryptionAvailable?.()) } catch { return false } }
  const locked = (why) => Object.assign(new Error(`SSH vault key could not be unlocked (${why})`), { code: 'VAULT_LOCKED' })
  const load = () => {
    if (key) return key
    // A key file that exists but cannot be unwrapped right now (DPAPI not ready before app 'ready', a corrupt file,
    // a wrong length) must never be replaced: a fresh key would make every stored secret unreadable for good.
    // Only a missing file creates a new key; the caller gets VAULT_LOCKED and can retry later.
    let text = null
    try { text = fs.readFileSync(file, 'utf8') } catch (err) {
      if (err?.code !== 'ENOENT') throw locked(err?.code ?? 'read error')
    }
    if (text !== null) {
      let raw
      try { raw = JSON.parse(text) } catch { throw locked('corrupt key file') }
      let k = null
      if (raw?.protection === 'dpapi' && typeof raw.wrappedB64 === 'string') {
        if (!can()) throw locked('DPAPI unavailable')
        try { k = Buffer.from(safeStorage.decryptString(Buffer.from(raw.wrappedB64, 'base64')), 'base64') } catch { throw locked('DPAPI decrypt failed') }
      } else if (raw?.protection === 'none' && typeof raw.keyB64 === 'string') {
        k = Buffer.from(raw.keyB64, 'base64')
      } else throw locked('unknown key format')
      if (k.length !== 32) throw locked('bad key length')
      key = k
      protection = raw.protection
      return key
    }
    const fresh = crypto.randomBytes(32)
    const b64 = fresh.toString('base64')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const wrapped = can()
    const body = wrapped
      ? { protection: 'dpapi', wrappedB64: safeStorage.encryptString(b64).toString('base64') }
      : { protection: 'none', keyB64: b64 }
    // 'wx': never clobber a key file written in the meantime; if one appeared, use it instead
    try { fs.writeFileSync(file, JSON.stringify(body), { flag: 'wx' }) } catch (err) {
      if (err?.code === 'EEXIST') return load()
      throw err
    }
    key = fresh
    protection = body.protection
    return key
  }
  return { getKey: load, protection: () => protection }
}

const ok = (extra = {}) => ({ ok: true, ...extra })
const failOf = (err) => ({
  ok: false, code: typeof err?.code === 'string' ? err.code : 'ERROR', error: String(err?.message ?? err ?? 'error').slice(0, 400),
  ...(typeof err?.isDir === 'boolean' ? { isDir: err.isDir } : {}), ...(err?.deleted ? { deleted: true } : {}),
  ...(typeof err?.mtimeMs === 'number' ? { mtimeMs: err.mtimeMs } : {}), ...(typeof err?.size === 'number' ? { size: err.size } : {})
})
const idOf = (p) => (typeof p?.id === 'string' ? p.id : '')

/** `ssh:*`: DarkHub SSH (hosts, keychain, known hosts, terminal sessions, SFTP, snippets, port forwarding). */
export function registerSshIPC({ app, ipcMain, BrowserWindow, safeStorage, shell, logger } = {}) {
  const dir = app.getPath('userData')
  const keys = makeVaultKeyProvider(path.join(dir, 'ssh-vault.key'), safeStorage)
  const store = new SshVaultStore({ file: path.join(dir, 'ssh-vault.json'), getKey: keys.getKey }).load()
  const logsDir = path.join(dir, 'ssh-logs')
  const serial = new SerialService()
  const manager = new SshSessionManager({ store, logger, logsDir, serial })
  const broadcast = (channel, payload) => {
    for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send(channel, payload) } catch { /* closing */ } }
  }
  const sftp = new SftpService({
    manager,
    trashItem: (p) => shell.trashItem(p),
    openPath: (p) => shell.openPath(p),
    onProgress: (e) => broadcast('ssh:sftp:progress', e),
    onWatch: (e) => broadcast('ssh:sftp:watch', e),
    tempDir: path.join(app.getPath('temp'), 'darkhub-sftp-edit'),
    // the app's own install folder joins Windows / Program Files / ProgramData\Microsoft as off limits for local writes
    protectedDirs: [path.dirname(app.getPath('exe')), process.env.PORTABLE_EXECUTABLE_DIR].filter(Boolean)
  })
  const tunnels = new PortForwardService({ store, manager, logger, onStatus: (e) => broadcast('ssh:tunnel:status', e) })
  manager.on('hostkey', (prompt) => broadcast('ssh:hostkey:prompt', prompt))
  manager.on('hostkey:resolved', (e) => broadcast('ssh:hostkey:resolved', e))
  manager.on('auth', (prompt) => broadcast('ssh:auth:prompt', prompt))
  manager.on('auth:resolved', (e) => broadcast('ssh:auth:resolved', e))

  // Every handler returns { ok:false, code, error } instead of throwing. Payloads are never logged: they may carry
  // passwords or private keys.
  const handle = (channel, fn) => ipcMain.handle(channel, async (event, payload) => {
    try { return await fn(payload ?? {}, event) } catch (err) {
      logger?.warn?.('SSH', `${channel} failed: ${err?.code ?? 'ERROR'}`)
      return failOf(err)
    }
  })

  const state = () => ({
    ...store.getState(),
    tunnels: tunnels.list(),
    sessions: manager.listSessions(),
    pendingHostKeys: manager.pendingPrompts(),
    pendingAuth: manager.pendingAuthPrompts(),
    watches: sftp.listWatches(),
    logsDir,
    keyProtection: keys.protection()
  })

  handle('ssh:vault:getState', () => ok(state()))

  // ---- groups / hosts ----
  handle('ssh:group:save', (p) => ok({ group: store.saveGroup(p) }))
  handle('ssh:group:delete', (p) => { store.deleteGroup(idOf(p)); return ok() })
  handle('ssh:host:save', (p) => ok({ host: store.saveHost(p) }))
  handle('ssh:host:delete', (p) => {
    const { removedTunnels } = store.deleteHost(idOf(p))
    for (const t of removedTunnels) tunnels.stop(t)
    return ok()
  })
  handle('ssh:host:importSshConfig', (p) => {
    const file = path.join(os.homedir(), '.ssh', 'config')
    let text = ''
    try { text = fs.readFileSync(file, 'utf8') } catch { return { ok: false, code: 'NOT_FOUND', error: `${file} not found` } }
    const parsed = parseSshConfig(text)
    const existing = store.getState().hosts
    const fresh = parsed.filter((h) => !existing.some((e) => e.hostname.toLowerCase() === h.hostname.toLowerCase() && e.port === h.port && (!h.username || e.username === h.username)))
    if (p.dryRun !== false) return ok({ imported: fresh, skipped: parsed.length - fresh.length, file })
    const imported = []
    const byAlias = new Map()
    for (const h of fresh) {
      try {
        const host = store.saveHost({ label: h.alias, hostname: h.hostname, port: h.port, username: h.username || undefined, tags: ['ssh-config'] })
        imported.push(host)
        byAlias.set(h.alias, host.id)
      } catch { /* invalid entry: skipped */ }
    }
    // second pass: ProxyJump aliases resolve to hosts that now exist
    for (const h of fresh) {
      const id = byAlias.get(h.alias)
      const jump = h.proxyJump ? byAlias.get(h.proxyJump) ?? store.getState().hosts.find((x) => x.label === h.proxyJump)?.id : null
      if (id && jump) { try { store.saveHost({ ...store.getHost(id), jumpHostId: jump }) } catch { /* cycle: leave direct */ } }
    }
    return ok({ imported, skipped: parsed.length - imported.length, file })
  })

  // ---- keychain ----
  handle('ssh:keychain:save', (p) => ok({ credential: store.saveCredential(p) }))
  handle('ssh:keychain:generateKey', async (p) => ok(await store.generateKey(p)))
  handle('ssh:keychain:delete', (p) => { store.deleteCredential(idOf(p)); return ok() })

  // ---- known hosts / TOFU ----
  handle('ssh:knownHosts:trust', (p) => {
    // a pending handshake prompt: main already holds the presented key, the renderer only says "trust"
    if (typeof p.requestId === 'string') {
      const r = manager.resolveHostKey(p.requestId, true)
      if (!r) return { ok: false, code: 'EXPIRED', error: 'host key prompt expired' }
      return ok({ knownHost: r.knownHost })
    }
    return ok({ knownHost: store.trustKnownHost(p) })
  })
  handle('ssh:knownHosts:reject', (p) => ok({ resolved: Boolean(manager.resolveHostKey(String(p.requestId ?? ''), false)) }))
  handle('ssh:knownHosts:delete', (p) => { store.deleteKnownHost(idOf(p)); return ok() })

  // ---- terminal sessions ----
  const senders = new WeakSet()
  const senderFor = (event) => {
    const wc = event.sender
    if (!senders.has(wc)) {
      senders.add(wc)
      // a closed/reloaded window takes its sessions with it
      const drop = () => { manager.disconnectBySender((send) => send.wc === wc); serial.closeBySender((send) => send.wc === wc) }
      wc.once('destroyed', drop)
      wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => { if (isMainFrame && !isInPlace) drop() })
    }
    const send = (channel, payload) => { if (!wc.isDestroyed()) wc.send(channel, payload) }
    send.wc = wc
    return send
  }
  handle('ssh:session:connect', (p, event) => manager.openSession({ sessionId: p.sessionId, hostId: p.hostId, cols: p.cols, rows: p.rows, password: p.password }, senderFor(event)))
  handle('ssh:session:write', (p) => ok({ writtenCount: manager.write(Array.isArray(p.sessionIds) ? p.sessionIds.slice(0, 64) : [], p.data) }))
  handle('ssh:session:resize', (p) => ok({ resized: manager.resize(p.sessionId, p.cols, p.rows) }))
  handle('ssh:session:disconnect', (p) => {
    const id = String(p.sessionId ?? '')
    return ok({ closed: serial.has(id) ? serial.close(id) : manager.disconnect(id) })
  })
  handle('ssh:session:setLogging', (p) => {
    const r = manager.setLogging(String(p.sessionId ?? ''), p.on === true)
    return r ? ok(r) : { ok: false, code: 'NOT_FOUND', error: 'session not found' }
  })
  handle('ssh:auth:respond', (p) => ok({ resolved: manager.resolveAuthPrompt(String(p.requestId ?? ''), Array.isArray(p.answers) ? p.answers : null) }))

  // ---- serial ----
  handle('ssh:serial:listPorts', async () => ok({ ports: await serial.listPorts() }))
  handle('ssh:serial:connect', (p, event) => serial.open(p, senderFor(event)))
  handle('ssh:serial:break', (p) => ok({ sent: serial.sendBreak(String(p.sessionId ?? '')) }))

  // ---- settings / logs ----
  handle('ssh:settings:save', (p) => ok({ settings: store.saveSettings(p) }))
  const insideLogs = (f) => typeof f === 'string' && path.resolve(f).toLowerCase().startsWith(path.resolve(logsDir).toLowerCase() + path.sep)
  handle('ssh:logs:open', async (p) => {
    const log = store.data.sessionLogs.find((l) => l.id === p.id)
    if (!log?.logFilePath || !insideLogs(log.logFilePath) || !fs.existsSync(log.logFilePath)) return { ok: false, code: 'NOT_FOUND', error: 'log file not found' }
    const err = await shell.openPath(log.logFilePath)
    return err ? { ok: false, code: 'OPEN_FAILED', error: err } : ok()
  })
  handle('ssh:logs:openFolder', async () => {
    fs.mkdirSync(logsDir, { recursive: true })
    const err = await shell.openPath(logsDir)
    return err ? { ok: false, code: 'OPEN_FAILED', error: err } : ok()
  })

  // ---- SFTP ----
  handle('ssh:sftp:open', async (p) => ok(await sftp.open(p)))
  handle('ssh:sftp:listLocal', async (p) => ok(await sftp.listLocal(p.dirPath)))
  handle('ssh:sftp:listRemote', async (p) => ok(await sftp.listRemote(p.sftpId, p.remotePath)))
  handle('ssh:sftp:transfer', async (p) => sftp.transfer(p))
  handle('ssh:sftp:cancelTransfer', (p) => ok({ cancelled: sftp.cancelTransfer(String(p.transferId ?? '')) }))
  handle('ssh:sftp:fsOp', async (p) => sftp.fsOp(p))
  handle('ssh:sftp:close', (p) => ok({ closed: sftp.close(String(p.sftpId ?? '')) }))
  handle('ssh:sftp:readText', async (p) => ok(await sftp.readText(p)))
  handle('ssh:sftp:writeText', async (p) => ok(await sftp.writeText(p)))
  handle('ssh:sftp:stat', async (p) => ok(await sftp.stat(p)))
  handle('ssh:sftp:du', async (p) => ok(await sftp.du(p)))
  handle('ssh:sftp:editExternal', async (p) => ok(await sftp.editExternal(p)))
  handle('ssh:sftp:stopWatch', (p) => ok({ stopped: sftp.stopWatch(String(p.watchId ?? '')) }))

  // ---- snippets ----
  handle('ssh:snippet:save', (p) => (p.kind === 'package' ? ok({ package: store.savePackage(p) }) : ok({ snippet: store.saveSnippet(p) })))
  handle('ssh:snippet:delete', (p) => { store.deleteSnippet(idOf(p), p.kind === 'package' ? 'package' : 'snippet'); return ok() })
  handle('ssh:snippet:run', (p) => {
    const snippet = store.getSnippet(String(p.snippetId ?? ''))
    if (!snippet) return { ok: false, code: 'NOT_FOUND', error: 'snippet not found' }
    const text = renderSnippet(snippet, p.args && typeof p.args === 'object' ? p.args : {})
    const ids = (Array.isArray(p.sessionIds) ? p.sessionIds : []).slice(0, 64)
    const sentTo = ids.filter((id) => manager.write([id], text) === 1)
    return ok({ sentTo })
  })

  // ---- port forwarding ----
  handle('ssh:tunnel:save', (p) => {
    const was = tunnels.status(String(p.id ?? '')).status
    const tunnel = store.saveTunnel(p)
    // an edited rule that was running restarts with its new settings
    if (was === 'active') { tunnels.stop(tunnel.id); void tunnels.start(tunnel.id).catch(() => {}) }
    return ok({ tunnel })
  })
  handle('ssh:tunnel:delete', (p) => { tunnels.stop(idOf(p)); store.deleteTunnel(idOf(p)); return ok() })
  handle('ssh:tunnel:start', async (p) => {
    const st = await tunnels.start(idOf(p))
    return ok({ status: st.status, boundPort: st.boundPort })
  })
  handle('ssh:tunnel:stop', (p) => { tunnels.stop(idOf(p)); return ok({ status: 'stopped' }) })

  // tunnels need the vault key, which needs DPAPI (safeStorage), which is only usable after 'ready'
  void app.whenReady().then(() => { setTimeout(() => { void tunnels.autoStart().catch(() => {}) }, 4000).unref?.() })

  const dispose = () => {
    try { tunnels.stopAll() } catch { /* closing */ }
    try { sftp.closeAll() } catch { /* closing */ }
    try { manager.disposeAll() } catch { /* closing */ }
    try { serial.closeAll() } catch { /* closing */ }
  }
  app.on('before-quit', dispose)
  return { store, manager, sftp, tunnels, serial, dispose }
}
