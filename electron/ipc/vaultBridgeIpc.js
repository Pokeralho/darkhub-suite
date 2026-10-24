// IPC + lifecycle of the password vault's browser-extension bridge.
// The vault itself stays in main.js; this module only sees it through the accessors passed in `vault`.
import path from 'node:path'
import fs from 'node:fs'
import { powerMonitor } from 'electron'
import { VaultBridgeServer } from '../services/vaultBridge/bridgeServer.js'
import { PairingStore } from '../services/vaultBridge/pairingStore.js'
import {
  NativeHostRegistry, ALLOWED_CALLERS, CHROMIUM_EXTENSION_ID, GECKO_EXTENSION_ID, isBrowserId, writeBridgeConfig
} from '../services/vaultBridge/nativeHost.js'
import { NATIVE_HOST_NAME } from '../services/vaultBridge/protocol.js'

// Native dialogs are shown by the main process (the renderer cannot fake or pre-answer them), so their strings live
// here. Renderer strings are in src/i18n/vaultMessages.ts.
const DIALOG_STRINGS = {
  'pt-BR': {
    pairTitle: 'Parear extensão do navegador',
    pairMessage: 'Um navegador quer se conectar ao cofre do DarkHub.',
    pairDetail: 'Navegador: {browser} ({name})\n\nCódigo: {code}\n\nSó confirme se este mesmo código aparece agora na extensão DarkHub Vault. A extensão poderá listar e preencher logins dos sites que você visitar enquanto o cofre estiver desbloqueado.',
    pairAccept: 'Parear',
    pairReject: 'Recusar',
    saveTitle: 'Salvar login do navegador',
    saveMessage: 'Salvar este login no cofre do DarkHub?',
    updateMessage: 'Atualizar a senha deste login no cofre do DarkHub?',
    saveDetail: 'Site: {host}\nUsuário: {username}\nOrigem: {client}',
    saveAccept: 'Salvar',
    updateAccept: 'Atualizar',
    saveReject: 'Cancelar',
    noUsername: '(sem usuário)'
  },
  'en-US': {
    pairTitle: 'Pair browser extension',
    pairMessage: 'A browser wants to connect to the DarkHub vault.',
    pairDetail: 'Browser: {browser} ({name})\n\nCode: {code}\n\nOnly confirm if this same code is showing in the DarkHub Vault extension right now. The extension will be able to list and fill logins for the sites you visit while the vault is unlocked.',
    pairAccept: 'Pair',
    pairReject: 'Reject',
    saveTitle: 'Save browser login',
    saveMessage: 'Save this login to the DarkHub vault?',
    updateMessage: 'Update the password of this login in the DarkHub vault?',
    saveDetail: 'Site: {host}\nUsername: {username}\nFrom: {client}',
    saveAccept: 'Save',
    updateAccept: 'Update',
    saveReject: 'Cancel',
    noUsername: '(no username)'
  }
}

const BROWSER_LABELS = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', brave: 'Brave', opera: 'Opera', other: 'Browser' }

function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}

export function registerVaultBridgeIPC({ app, ipcMain, dialog, shell, BrowserWindow, getMainWindow, vault, logger }) {
  const dir = path.join(app.getPath('userData'), 'vault-bridge')
  const cfgPath = path.join(dir, 'bridge.cfg')
  let language = String(app.getLocale?.() || '').toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US'
  const S = () => DIALOG_STRINGS[language] || DIALOG_STRINGS['en-US']

  const registry = new NativeHostRegistry({ dir })
  const pairingStore = new PairingStore({ filePath: path.join(dir, 'pairings.json') })

  const broadcastChange = () => {
    for (const w of BrowserWindow.getAllWindows()) {
      try { if (!w.isDestroyed()) w.webContents.send('vaultx:changed') } catch {}
    }
  }

  const parentWindow = () => {
    const w = getMainWindow?.()
    if (!w || w.isDestroyed()) return null
    try {
      if (w.isMinimized()) w.restore()
      if (!w.isVisible()) w.show()
      w.focus()
    } catch {}
    return w
  }

  const ask = async (opts, signal) => {
    const w = parentWindow()
    const res = w ? await dialog.showMessageBox(w, { ...opts, signal }) : await dialog.showMessageBox({ ...opts, signal })
    return res.response === 0
  }

  const prompts = {
    confirmPairing: ({ code, clientName, browser }, signal) => {
      const s = S()
      return ask({
        type: 'question',
        title: s.pairTitle,
        message: s.pairMessage,
        detail: fill(s.pairDetail, { browser: BROWSER_LABELS[browser] || browser, name: clientName, code }),
        buttons: [s.pairAccept, s.pairReject],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      }, signal)
    },
    confirmSave: ({ host, username, update, clientName }, signal) => {
      const s = S()
      return ask({
        type: 'question',
        title: s.saveTitle,
        message: update ? s.updateMessage : s.saveMessage,
        detail: fill(s.saveDetail, { host, username: username || s.noUsername, client: clientName || 'Browser' }),
        buttons: [update ? s.updateAccept : s.saveAccept, s.saveReject],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      }, signal)
    }
  }

  const server = new VaultBridgeServer({
    vault,
    prompts,
    pairingStore,
    allowedCallers: ALLOWED_CALLERS,
    writeConfig: (cfg) => writeBridgeConfig(dir, cfg),
    onChange: broadcastChange,
    logger
  })

  // The loopback listener only exists while at least one browser has the host registered.
  let syncing = Promise.resolve()
  const syncServer = () => {
    syncing = syncing.then(async () => {
      try {
        if (process.platform !== 'win32') return
        if (await registry.anyRegistered()) await server.start()
        else await server.stop()
      } catch (err) {
        logger?.warn?.('vault-bridge', `${err?.message || err}`)
      }
    })
    return syncing
  }

  app.whenReady().then(() => {
    syncServer()
    // Audit fix: lock the vault when the session is locked or the machine sleeps, not only after the idle timer.
    try {
      powerMonitor.on('lock-screen', () => vault.lock())
      powerMonitor.on('suspend', () => vault.lock())
    } catch {}
  })
  app.on('will-quit', () => {
    // Synchronous: the process is about to exit. Without bridge.cfg the host cannot find (or be fooled about) the app.
    try { fs.rmSync(cfgPath, { force: true }) } catch {}
    server.stop().catch(() => {})
  })

  const extensionFolder = () => {
    const candidates = [
      path.join(app.getAppPath(), 'browser-extension'),
      path.join(path.dirname(app.getAppPath()), 'browser-extension'),
      process.resourcesPath ? path.join(process.resourcesPath, 'browser-extension') : null
    ].filter(Boolean)
    return candidates.find((p) => fs.existsSync(path.join(p, 'manifest.json'))) || null
  }

  const status = async () => {
    const supported = process.platform === 'win32'
    const browsers = supported ? await registry.statusAll() : []
    const connected = new Set(server.connectedClientIds())
    const clients = (await pairingStore.list()).map((c) => ({ ...c, connected: connected.has(c.id) }))
    return {
      ok: true,
      supported,
      serverRunning: server.running,
      unlocked: vault.isUnlocked(),
      hostName: NATIVE_HOST_NAME,
      extensionIds: { chromium: CHROMIUM_EXTENSION_ID, gecko: GECKO_EXTENSION_ID },
      extensionFolder: extensionFolder(),
      browsers,
      clients
    }
  }

  const safe = (fn) => async (...args) => {
    try { return await fn(...args) } catch (err) { return { ok: false, error: err?.message || String(err) } }
  }

  ipcMain.handle('vaultx:bridgeStatus', safe(status))

  ipcMain.handle('vaultx:registerHost', safe(async (_e, browser) => {
    if (!isBrowserId(browser)) return { ok: false, error: 'Unknown browser' }
    await registry.register(browser)
    await syncServer()
    broadcastChange()
    return status()
  }))

  ipcMain.handle('vaultx:unregisterHost', safe(async (_e, browser) => {
    if (!isBrowserId(browser)) return { ok: false, error: 'Unknown browser' }
    await registry.unregister(browser)
    await syncServer()
    broadcastChange()
    return status()
  }))

  ipcMain.handle('vaultx:revokeClient', safe(async (_e, clientId) => {
    if (typeof clientId !== 'string' || !/^[0-9a-f]{32}$/.test(clientId)) return { ok: false, error: 'Invalid client' }
    await pairingStore.revoke(clientId)
    server.disconnectClient(clientId)
    broadcastChange()
    return status()
  }))

  ipcMain.handle('vaultx:openExtensionFolder', safe(async () => {
    const folder = extensionFolder()
    if (!folder) return { ok: false, error: 'extension_folder_missing' }
    const err = await shell.openPath(folder)
    return err ? { ok: false, error: err } : { ok: true, path: folder }
  }))

  ipcMain.handle('vaultx:setLanguage', (_e, lang) => {
    if (lang === 'pt-BR' || lang === 'en-US') language = lang
    else if (typeof lang === 'string') language = lang.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US'
    return { ok: true }
  })

  return { server, registry, pairingStore }
}
