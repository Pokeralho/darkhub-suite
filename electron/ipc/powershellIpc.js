import { PowerShellToolsService } from '../services/PowerShellToolsService.js'
import { PsToolkitService } from '../services/psTools/PsToolkitService.js'
import { isPlainAbsPath } from '../services/psTools/psToolBuilders.js'

/**
 * Registers the `powershell:*` IPC surface for the PowerShell Tools page.
 * Every handler returns { ok, ... } and never throws. Path validation (scripts must live under
 * C:\ProgramData\DarkOS) and the "never change the system execution policy" rule live in the service.
 * Toolkit rules (confirmation for admin/system-changing runs, dialog-chosen output paths) live in
 * PsToolkitService + here. Electron modules are loaded lazily so main.js only passes ipcMain/logger.
 */
export function registerPowerShellIPC({ ipcMain, logger, service, toolkit, electron: injected } = {}) {
  const svc = service || new PowerShellToolsService()
  let electronMod = injected || null
  const getElectron = async () => (electronMod ||= await import('electron'))
  const kit = toolkit || new PsToolkitService({
    dataDir: () => { try { return electronMod?.app?.getPath('userData') } catch { return null } },
    elevatedRunner: async (script, opts) => (await import('../services/optimizer/ElevationHelper.js')).default.runElevatedPowerShell(script, opts)
  })
  // Report files this session generated: only these may be opened with the default app.
  const generated = new Set()

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        await getElectron()
        return await fn(payload ?? {}, event)
      } catch (err) {
        try { logger?.error?.('PowerShellTools', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
        return { ok: false, error: err?.message ?? String(err) }
      }
    })
  }
  const winOf = (event) => electronMod?.BrowserWindow?.fromWebContents?.(event?.sender) ?? undefined
  const cleanName = (s, fallback) => String(s || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || fallback

  handle('powershell:getPolicies', () => svc.getPolicies())
  handle('powershell:listScripts', () => svc.listScripts())
  handle('powershell:getSignature', (p) => svc.getSignature(p?.path))
  handle('powershell:runScript', (p) => svc.runScript(p))
  handle('powershell:openElevatedTerminal', (p) => svc.openElevatedTerminal(p))

  // ---- toolkit ----
  handle('powershell:previewTool', (p) => kit.preview(String(p.id || ''), p.params || {}))
  handle('powershell:runTool', async (p) => {
    const r = await kit.runTool(String(p.id || ''), p.params || {}, { confirm: p.confirm === true })
    if (r?.ok && r.file) generated.add(String(r.file).toLowerCase())
    return r
  })
  handle('powershell:pickFolder', async (p, event) => {
    const r = await electronMod.dialog.showOpenDialog(winOf(event), {
      title: 'Escolher pasta', properties: ['openDirectory'], defaultPath: isPlainAbsPath(p.defaultPath) ? p.defaultPath : undefined
    })
    return r.canceled || !r.filePaths?.[0] ? { ok: false, canceled: true } : { ok: true, path: r.filePaths[0] }
  })
  handle('powershell:pickSavePath', async (p, event) => {
    const ext = /^[a-z0-9]{1,8}$/i.test(String(p.ext || '')) ? String(p.ext).toLowerCase() : 'html'
    const docs = (() => { try { return electronMod.app.getPath('documents') } catch { return '' } })()
    const name = `${cleanName(p.defaultName, 'relatorio')}.${ext}`
    const r = await electronMod.dialog.showSaveDialog(winOf(event), {
      title: 'Salvar relatório', defaultPath: docs ? `${docs}\\${name}` : name,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    return r.canceled || !r.filePath ? { ok: false, canceled: true } : { ok: true, path: r.filePath }
  })
  // The destination always comes from the native save dialog.
  handle('powershell:export', async (p, event) => {
    const format = ['csv', 'json', 'txt'].includes(p.format) ? p.format : 'txt'
    const r = await electronMod.dialog.showSaveDialog(winOf(event), {
      title: 'Exportar resultado', defaultPath: `${cleanName(p.defaultName, 'resultado')}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    })
    if (r.canceled || !r.filePath) return { ok: false, canceled: true }
    return kit.exportTo(r.filePath, { rows: Array.isArray(p.rows) ? p.rows : undefined, text: p.text, format })
  })
  handle('powershell:revealFile', (p) => {
    const f = String(p.path || '')
    if (!isPlainAbsPath(f) || !generated.has(f.toLowerCase())) return { ok: false, error: 'Arquivo desconhecido.' }
    electronMod.shell.showItemInFolder(f)
    return { ok: true }
  })
  handle('powershell:openReport', async (p) => {
    const f = String(p.path || '')
    if (!isPlainAbsPath(f) || !/\.html?$/i.test(f) || !generated.has(f.toLowerCase())) return { ok: false, error: 'Arquivo desconhecido.' }
    const err = await electronMod.shell.openPath(f)
    return err ? { ok: false, error: err } : { ok: true }
  })
  handle('powershell:wifiKey', (p) => kit.revealWifiKey(p.name))
  handle('powershell:hostsRead', () => kit.readHosts())
  handle('powershell:hostsBackup', (p) => kit.readHostsBackup(p.name))
  handle('powershell:hostsPreview', (p) => kit.previewHosts(p.content))
  handle('powershell:hostsWrite', (p) => kit.writeHosts(p.content, { confirm: p.confirm === true }))

  // ---- custom scripts (live output on 'powershell:customEvent' to the window that started the run) ----
  handle('powershell:customStart', (p, event) => kit.startCustom(
    { script: p.script, elevated: p.elevated === true, confirm: p.confirm === true },
    (ev) => { try { if (!event.sender.isDestroyed()) event.sender.send('powershell:customEvent', ev) } catch { /* window closing */ } }
  ))
  handle('powershell:customStop', () => kit.stopCustom())
  handle('powershell:customStatus', () => ({ ok: true, running: kit.isCustomRunning() }))
  handle('powershell:snippetsList', () => kit.listSnippets())
  handle('powershell:snippetSave', (p) => kit.saveSnippet(p))
  handle('powershell:snippetDelete', (p) => kit.deleteSnippet(String(p.id || '')))

  return svc
}

export default registerPowerShellIPC
