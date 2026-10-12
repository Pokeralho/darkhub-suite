import { PowerShellToolsService } from '../services/PowerShellToolsService.js'

/**
 * Registers the `powershell:*` IPC surface for the PowerShell advanced tools page.
 * Every handler returns { ok, ... } and never throws. Path validation (scripts must live under
 * C:\ProgramData\DarkOS) and the "never change the system execution policy" rule live in the service.
 */
export function registerPowerShellIPC({ ipcMain, logger, service } = {}) {
  const svc = service || new PowerShellToolsService()

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await fn(payload ?? {}, event)
      } catch (err) {
        try { logger?.error?.('PowerShellTools', `${channel}: ${err?.message ?? err}`) } catch { /* ignore */ }
        return { ok: false, error: err?.message ?? String(err) }
      }
    })
  }

  handle('powershell:getPolicies', () => svc.getPolicies())
  handle('powershell:listScripts', () => svc.listScripts())
  handle('powershell:getSignature', (p) => svc.getSignature(p?.path))
  handle('powershell:runScript', (p) => svc.runScript(p))
  handle('powershell:openElevatedTerminal', (p) => svc.openElevatedTerminal(p))

  return svc
}

export default registerPowerShellIPC
