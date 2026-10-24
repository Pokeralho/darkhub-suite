// DarkHub needs administrator rights (drivers, services, firewall, sensors). The exe manifest already asks for them
// (requireAdministrator), but some launch paths can still start it without: a shell that elevates silently, tools that
// ignore the manifest. In that case reopen through UAC; if the user declines, explain and let them choose.
import { spawn } from 'node:child_process'

const RETRY_FLAG = '--elevated-retry'

/** Quotes one argument for Start-Process -ArgumentList (it joins the list with spaces and does not quote). */
export function quoteArg(a) {
  const s = String(a)
  return /[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s
}

/** PowerShell command that starts `exe` elevated; exit code 0 only when the UAC prompt was accepted. */
export function buildRelaunchCommand(exe, args) {
  const list = args.map(quoteArg).join(' ').replace(/'/g, "''")
  return `try { Start-Process -FilePath '${String(exe).replace(/'/g, "''")}'${list ? ` -ArgumentList '${list}'` : ''} -Verb RunAs -ErrorAction Stop; exit 0 } catch { exit 1 }`
}

function relaunchAsAdmin(exe, args) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', buildRelaunchCommand(exe, args)], { windowsHide: true })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

/**
 * Returns true to continue starting this process, false when it is exiting (an elevated copy took over or the user
 * chose to quit). Packaged Windows builds only; DARKHUB_NO_ELEVATE=1 or --no-elevate skips it.
 */
export async function ensureElevated({ app, dialog, isElevated, log }) {
  if (!app.isPackaged || process.platform !== 'win32' || process.env.DARKHUB_NO_ELEVATE === '1' || process.argv.includes('--no-elevate')) return true
  if (await isElevated().catch(() => true)) return true

  const pt = String(app.getLocale?.() || '').toLowerCase().startsWith('pt')
  // the portable build runs from a temporary copy: relaunch the original file
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
  const args = [...process.argv.slice(1).filter((a) => a !== RETRY_FLAG && a !== exe), RETRY_FLAG]

  for (;;) {
    log?.info?.('[elevation] not running as administrator: asking UAC to reopen elevated')
    // the elevated copy must not find this process holding the single-instance lock
    app.releaseSingleInstanceLock()
    if (await relaunchAsAdmin(exe, args)) {
      app.exit(0)
      return false
    }
    app.requestSingleInstanceLock()
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'DarkHub Suite',
      message: pt ? 'O DarkHub precisa ser aberto como administrador' : 'DarkHub needs to run as administrator',
      detail: pt
        ? 'Sem isso, otimizações, drivers, sensores avançados, firewall e proteção em tempo real não funcionam. Clique em "Tentar de novo" e escolha "Sim" na janela do Windows.'
        : 'Without it, optimizations, drivers, advanced sensors, firewall and real-time protection do not work. Click "Try again" and choose "Yes" in the Windows prompt.',
      buttons: pt ? ['Tentar de novo', 'Continuar sem administrador', 'Sair'] : ['Try again', 'Continue without administrator', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    })
    if (choice === 1) { log?.warn?.('[elevation] user chose to continue without administrator'); return true }
    if (choice === 2) { app.exit(0); return false }
  }
}
