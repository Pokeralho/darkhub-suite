import cp from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import nativeLatencyClient from '../services/NativeLatencyClient.js'
import SecurityService from '../services/SecurityService.js'
import { ConfigStore } from '../services/realtime/realtimeConfig.js'
import { RealtimeOptimizer } from '../services/realtime/RealtimeOptimizer.js'
import { RealtimeProtection } from '../services/realtime/RealtimeProtection.js'
import { HashDb, EICAR_SHA256 } from '../services/realtime/HashDb.js'
import { Quarantine } from '../services/realtime/Quarantine.js'
import { ClamAv } from '../services/realtime/ClamAv.js'

const CLAM_UPDATE_EVERY_MS = 24 * 3600 * 1000
const CLAM_CHECK_MS = 6 * 3600 * 1000

/** `realtime:*`: real-time optimizer and protection (both off by default, running in the main process). */
export function registerRealtimeIPC({ app, ipcMain, dialog, BrowserWindow, Notification, logger } = {}) {
  const dataRoot = path.join(process.env.ProgramData || 'C:\\ProgramData', 'DarkHub')
  const store = new ConfigStore(path.join(app.getPath('userData'), 'realtime.json'), os.homedir())
  const quarantine = new Quarantine(path.join(dataRoot, 'Quarantine'))
  const clamav = new ClamAv(dataRoot)

  // Known-bad hashes: the EICAR test signature plus the community rules; rebuilt only when the rules change.
  let hashDb = null
  const getHashDb = () => (hashDb ||= new HashDb([{ sha256: EICAR_SHA256, name: 'EICAR-Test-File' }, ...SecurityService.customFileHashes]))
  SecurityService.onFileHashesChanged = () => { hashDb = null }

  const broadcast = (msg) => { for (const w of BrowserWindow.getAllWindows()) { try { w.webContents.send('realtime:event', msg) } catch { /* closing */ } } }
  const optimizer = new RealtimeOptimizer({ native: nativeLatencyClient, getConfig: () => store.value.optimizer })
  const protection = new RealtimeProtection({
    getConfig: () => store.value.protection,
    getHashDb,
    clamav,
    quarantine,
    notify: ({ file, detection, quarantined }) => {
      try {
        if (Notification?.isSupported?.()) {
          new Notification({ title: quarantined ? 'DarkHub: ameaça em quarentena' : 'DarkHub: ameaça detectada', body: `${detection}\n${path.basename(file)}` }).show()
        }
      } catch { /* notifications unavailable */ }
    }
  })
  optimizer.on('event', (e) => broadcast({ source: 'optimizer', ...e }))
  protection.on('event', (e) => broadcast({ source: 'protection', ...e }))

  let clamTimer = null
  const refreshClam = async () => {
    const p = store.value.protection
    if (!p.enabled || !p.clamav || !clamav.status().installed) return
    const age = clamav.databaseAge()
    if (age != null && age < CLAM_UPDATE_EVERY_MS) return
    const r = await clamav.update()
    if (!r.ok) logger?.warn?.('Realtime', `freshclam: ${r.error}`)
  }

  let protectionFolders = ''
  const apply = () => {
    const { optimizer: o, protection: p } = store.value
    if (o.enabled && !optimizer.running) optimizer.start()
    if (!o.enabled && optimizer.running) optimizer.stop()
    const folders = p.folders.join('|')
    if (p.enabled && (!protection.running || folders !== protectionFolders)) {
      if (protection.running) protection.stop()
      SecurityService.loadCommunityRules()
      hashDb = null
      protection.start()
      protectionFolders = folders
    }
    if (!p.enabled && protection.running) protection.stop()
    clearInterval(clamTimer)
    clamTimer = null
    if (p.enabled && p.clamav) {
      clamTimer = setInterval(() => { void refreshClam() }, CLAM_CHECK_MS)
      clamTimer.unref?.()
      void refreshClam()
    }
  }

  // Windows' own antivirus: when it runs, DarkHub's protection complements it instead of replacing it.
  let defender = { at: 0, running: null }
  const defenderRunning = () => {
    if (Date.now() - defender.at < 60000) return defender.running
    let running = null
    try { running = /RUNNING/.test(cp.execFileSync('sc.exe', ['query', 'WinDefend'], { encoding: 'utf8', windowsHide: true, timeout: 3000 })) } catch { running = false }
    defender = { at: Date.now(), running }
    return running
  }

  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('Realtime', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  const status = () => ({
    ok: true,
    config: store.value,
    optimizer: optimizer.status(),
    protection: { ...protection.status(), hashes: getHashDb().size, clamav: clamav.status(), defender: defenderRunning() },
    quarantine: quarantine.list().length
  })

  handle('realtime:status', status)
  // ClamAV comes with protection: turning protection on installs it (official winget package) and its signatures in
  // the background, then switches it on. One attempt at a time; progress and failures go to the activity log.
  let clamSetup = null
  const ensureClamAv = () => {
    if (clamSetup || store.value.protection.clamav) return
    clamSetup = (async () => {
      broadcast({ source: 'protection', at: Date.now(), level: 'action', event: 'clamav-setup' })
      const s = clamav.status()
      const r = s.installed ? { ok: true } : await clamav.install()
      const u = r.ok && !clamav.status().database ? await clamav.update() : r
      if (r.ok && u.ok && clamav.status().database) { store.update({ protection: { clamav: true } }); apply() }
      broadcast({ source: 'protection', at: Date.now(), level: r.ok && u.ok ? 'action' : 'error', event: 'clamav-ready', error: r.ok && u.ok ? undefined : (r.error || u.error) })
    })().catch((e) => logger?.warn?.('Realtime', `ClamAV setup: ${e?.message ?? e}`)).finally(() => { clamSetup = null })
  }
  handle('realtime:setConfig', (patch) => {
    store.update(patch)
    apply()
    if (patch?.protection?.enabled === true) ensureClamAv()
    return status()
  })
  handle('realtime:quarantineList', () => ({ ok: true, items: quarantine.list() }))
  handle('realtime:quarantineRestore', async ({ id }) => {
    const item = quarantine.list().find((x) => x.id === id)
    const r = await quarantine.restore(String(id))
    // the user vouched for this file: never quarantine it again
    if (item?.sha256) store.update({ protection: { allowHashes: [...store.value.protection.allowHashes, item.sha256] } })
    return { ok: true, ...r }
  })
  handle('realtime:quarantineDelete', ({ id }) => { quarantine.remove(String(id)); return { ok: true } })
  handle('realtime:clamavInstall', async () => {
    const r = await clamav.install()
    if (!r.ok) return r
    const u = await clamav.update()
    return { ...u, status: clamav.status() }
  })
  handle('realtime:clamavUpdate', async () => ({ ...(await clamav.update()), status: clamav.status() }))
  handle('realtime:scanFiles', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
    if (r.canceled || !r.filePaths.length) return { ok: true, queued: 0 }
    protection.scanNow(r.filePaths)
    return { ok: true, queued: r.filePaths.length }
  })

  app.whenReady().then(() => { const t = setTimeout(apply, 8000); t.unref?.() })
  // ClamAV installed by the setup comes without signatures: fetch them once in the background so the antivirus is
  // ready the moment protection is turned on (protection itself stays off until the user enables it)
  app.whenReady().then(() => {
    const t = setTimeout(() => {
      const s = clamav.status()
      if (!s.installed || s.database || clamSetup) return
      logger?.info?.('Realtime', 'ClamAV installed without signatures: downloading them in the background')
      clamav.update().then((r) => { if (!r.ok) logger?.warn?.('Realtime', `freshclam: ${r.error}`) }).catch(() => {})
    }, 60000)
    t.unref?.()
  })
  app.on('before-quit', () => { optimizer.stop(); protection.stop(); clearInterval(clamTimer) })
}

export default registerRealtimeIPC
