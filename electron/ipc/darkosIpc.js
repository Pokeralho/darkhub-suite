import { DarkOSRecoveryService } from '../services/darkos/DarkOSRecoveryService.js'
import { UsbMediaService } from '../services/darkos/UsbMediaService.js'

// Elevated "Reinstall Edge" script. No `exit`: runElevatedPowerShell wraps the script as `& { ... }`, and an exit
// would end the wrapper before it writes its done/exit flag files (the caller would then wait the full timeout).
// The result is reported through DKEDGE:* markers on stdout.
export const REINSTALL_EDGE_SCRIPT = [
  "$ErrorActionPreference = 'Continue'",
  "Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\EdgeUpdateDev' -Name 'AllowUninstall' -ErrorAction SilentlyContinue",
  "$w = Get-Command winget.exe -ErrorAction SilentlyContinue",
  "if (-not $w) { Write-Output 'DKEDGE:NOWINGET' } else {",
  "  & $w.Source install --id Microsoft.Edge -e --silent --scope machine --accept-package-agreements --accept-source-agreements",
  "  if ((Test-Path \"${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe\") -or (Test-Path \"$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe\")) { Remove-ItemProperty -Path 'HKLM:\\SOFTWARE\\DarkOS' -Name 'EdgeRemoved' -ErrorAction SilentlyContinue; Write-Output 'DKEDGE:OK' }",
  "  else { Write-Output 'DKEDGE:FAIL' }",
  "}"
].join('\r\n')

/**
 * Registers the `darkos:*` IPC surface. Every handler returns { ok, ... } and never throws.
 * Progress for long operations is streamed to the calling window on 'darkos:runEvent'.
 */
export function registerDarkOSIPC({ ipcMain, dialog, BrowserWindow, app, logger, service } = {}) {
  if (process.platform !== 'win32') {
    const unsupported = (extra = {}) => ({ ok: false, unsupported: true, platform: process.platform, reason: 'windows-only', error: 'DarkOS/Windows tweaks são suportados apenas no Windows.', ...extra })
    const handle = (channel, fn) => {
      ipcMain.handle(channel, async (event, payload) => {
        try { return await fn(payload ?? {}, { onEvent: () => {} }, event) } catch (err) {
          try { logger?.error?.('DarkOS', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
          return { ok: false, error: err?.message ?? String(err) }
        }
      })
    }
    handle('darkos:isDarkOS', async () => ({ ok: true, isDarkOS: false, platform: process.platform, supported: false, unsupported: true, reason: 'windows-only' }))
    handle('darkos:latestRelease', async () => unsupported({ release: null }))
    handle('darkos:getCatalog', () => unsupported({ items: [], profiles: [] }))
    handle('darkos:getManifest', () => unsupported())
    handle('darkos:getStatus', () => unsupported())
    handle('darkos:applyChange', () => unsupported())
    handle('darkos:revertChange', () => unsupported())
    handle('darkos:setProfile', () => unsupported())
    handle('darkos:restoreProfile', () => unsupported())
    handle('darkos:getRemovedApps', () => unsupported({ apps: [] }))
    handle('darkos:restoreAppx', () => unsupported())
    handle('darkos:listSnapshots', () => unsupported({ snapshots: [] }))
    handle('darkos:createSnapshot', () => unsupported())
    handle('darkos:restoreSnapshot', () => unsupported())
    handle('darkos:getFailures', () => unsupported({ failures: [] }))
    handle('darkos:getRebootPending', () => unsupported({ pending: false }))
    handle('darkos:usbDisks', () => unsupported({ disks: [] }))
    handle('darkos:usbFindIsos', () => unsupported({ isos: [] }))
    handle('darkos:usbPickIso', () => unsupported())
    handle('darkos:usbHashIso', () => unsupported())
    handle('darkos:usbWrite', () => unsupported())
    handle('darkos:usbCancel', () => ({ ok: true, unsupported: true, platform: process.platform }))
    handle('darkos:exportDiagnostics', () => unsupported())
    handle('darkos:reinstallEdge', () => unsupported())
    return null
  }

  const svc = service || new DarkOSRecoveryService({ logger })
  // On a stock Windows the same screens drive "Windows mode": DarkOS tweaks one by one, own state folder.
  const win = new DarkOSRecoveryService({ logger, mode: 'windows' })
  // DARKHUB_WINMODS=1 (dev builds only) previews Windows mode on a DarkOS machine.
  const forceWin = process.env.DARKHUB_WINMODS === '1' && app && !app.isPackaged
  const pick = () => (!forceWin && svc.isDarkOS() ? svc : win)

  const sendTo = (sender) => (evt) => {
    try {
      if (sender && !sender.isDestroyed()) sender.send('darkos:runEvent', evt)
    } catch { /* window closing */ }
  }

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await fn(payload ?? {}, { onEvent: sendTo(event.sender) }, event)
      } catch (err) {
        try { logger?.error?.('DarkOS', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
        return { ok: false, error: err?.message ?? String(err) }
      }
    })
  }

  // DarkOS removes Microsoft Edge from the image (owner decision). This puts it back: first revert the catalog
  // items that block Edge (update services/tasks + EdgeUpdate policies), then install it with winget (machine
  // scope, elevated). If winget is unavailable or fails, open Microsoft's official download page instead.
  handle('darkos:reinstallEdge', async (_p, o) => {
    const ids = ['edge.noDesktopShortcut', 'svc.lean.edgeupdate', 'svc.lean.edgeupdatem', 'svc.lean.microsoftedgeelevationservice',
      'task.edge.updatecore.disabled', 'task.edge.updateua.disabled']
    const rev = await svc.revertChange({ ids }, o)
    if (!rev?.ok) return { ok: false, revert: rev, error: rev?.error || 'Nao foi possivel desfazer os bloqueios do DarkOS ao Edge.' }
    const { default: ElevationHelper } = await import('../services/optimizer/ElevationHelper.js')
    const r = await ElevationHelper.runElevatedPowerShell(REINSTALL_EDGE_SCRIPT, { timeoutMs: 15 * 60 * 1000 })
    const out = `${r?.stdout || ''}`
    if (out.includes('DKEDGE:OK')) return { ok: true, revert: rev, msg: 'Microsoft Edge reinstalado.' }
    try { const { shell } = await import('electron'); await shell.openExternal('https://www.microsoft.com/edge/download') } catch { /* ignore */ }
    return { ok: false, revert: rev, error: out.includes('DKEDGE:NOWINGET')
      ? 'winget nao esta disponivel. Abri a pagina oficial de download do Edge; os bloqueios do DarkOS ja foram desfeitos.'
      : 'A instalacao automatica falhou. Abri a pagina oficial de download do Edge; os bloqueios do DarkOS ja foram desfeitos.' }
  })

  handle('darkos:isDarkOS', async () => pick().info())
  // Latest DarkOS ISO published on darkos.darkhub.ink (version, build, SHA-256 from the site's .sha256 file).
  handle('darkos:latestRelease', async () => ({ ok: true, release: await (await import('../services/darkos/darkosRelease.js')).fetchLatestRelease() }))
  handle('darkos:getCatalog', (p, o) => pick().getCatalog(p, o))
  handle('darkos:getManifest', (_p, o) => pick().getManifest(o))
  handle('darkos:getStatus', (p, o) => pick().getStatus(p, o))
  handle('darkos:applyChange', (p, o) => pick().applyChange(p, o))
  handle('darkos:revertChange', (p, o) => pick().revertChange(p, o))
  handle('darkos:setProfile', (p, o) => pick().setProfile(p, o))
  handle('darkos:restoreProfile', (_p, o) => pick().restoreProfile(o))
  handle('darkos:getRemovedApps', (_p, o) => pick().getRemovedApps(o))
  handle('darkos:restoreAppx', (p, o) => pick().restoreAppx(p, o))
  handle('darkos:listSnapshots', (_p, o) => pick().listSnapshots(o))
  handle('darkos:createSnapshot', (p, o) => pick().createSnapshot(p, o))
  handle('darkos:restoreSnapshot', (p, o) => pick().restoreSnapshot(p, o))
  handle('darkos:getFailures', (_p, o) => pick().getFailures(o))
  handle('darkos:getRebootPending', (_p, o) => pick().getRebootPending(o))

  // Installation media. DARKHUB_USB_VHD=1 (dev builds only) also lists virtual disks, to test with a VHD.
  const usb = new UsbMediaService({ app, allowVirtual: process.env.DARKHUB_USB_VHD === '1' && app && !app.isPackaged })
  const usbEvent = (sender) => (evt) => { try { if (sender && !sender.isDestroyed()) sender.send('darkos:usbEvent', evt) } catch { /* closing */ } }
  handle('darkos:usbDisks', () => usb.listDisks())
  handle('darkos:usbFindIsos', () => usb.findIsos())
  handle('darkos:usbPickIso', async (_p, _o, event) => {
    const r = await dialog.showOpenDialog(BrowserWindow?.fromWebContents?.(event.sender) ?? undefined, {
      title: 'Escolher a ISO do DarkOS', properties: ['openFile'], filters: [{ name: 'Imagem ISO', extensions: ['iso'] }]
    })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    return { ok: true, iso: usb.allowIso(r.filePaths[0]) }
  })
  handle('darkos:usbHashIso', (p, _o, event) => usb.hashIso(String(p.path || ''), (percent) => usbEvent(event.sender)({ step: 'hash', percent })))
  handle('darkos:usbWrite', (p, _o, event) => usb.write({ diskNumber: Number(p.diskNumber), expectedSize: Number(p.expectedSize), isoPath: String(p.isoPath || '') }, usbEvent(event.sender)))
  handle('darkos:usbCancel', () => usb.cancel())

  // The destination is always chosen in the native dialog; a renderer-supplied path is ignored.
  handle('darkos:exportDiagnostics', async (_p, o, event) => {
    const parentWin = BrowserWindow?.fromWebContents?.(event.sender) ?? undefined
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    let defaultDir = ''
    try { defaultDir = app?.getPath?.('documents') ?? '' } catch { defaultDir = '' }
    const saved = await dialog.showSaveDialog(parentWin, {
      title: 'Salvar diagnostico do DarkOS',
      defaultPath: defaultDir ? `${defaultDir}\\DarkOS-Diagnostico-${stamp}.zip` : `DarkOS-Diagnostico-${stamp}.zip`,
      filters: [{ name: 'Arquivo ZIP', extensions: ['zip'] }]
    })
    if (saved.canceled || !saved.filePath) return { ok: false, canceled: true }
    const dest = /\.zip$/i.test(saved.filePath) ? saved.filePath : `${saved.filePath}.zip`
    return pick().exportDiagnostics({ destination: dest }, o)
  })

  return svc
}

export default registerDarkOSIPC
