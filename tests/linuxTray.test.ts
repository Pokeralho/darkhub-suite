// @vitest-environment node
// B2: on Linux the packaged icon must exist and close-to-tray must never hide a window that
// cannot be restored. The tray helpers are lifted out of main.js and run with a mocked Tray so
// the behaviour is exercised without booting the whole Electron app.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'

const root = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

/** Extract a complete brace-delimited block (function body / callback) from main.js. */
function extractBlock(src: string, marker: string): string {
  const start = src.indexOf(marker)
  if (start < 0) throw new Error(`marker not found in main.js: ${marker}`)
  const brace = src.indexOf('{', start)
  if (brace < 0) throw new Error(`no block after marker: ${marker}`)
  let depth = 0
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) {
        // Callback registrations end with `)` after the block; function declarations do not.
        let end = i + 1
        while (end < src.length && (src[end] === ')' || src[end] === ';')) end++
        return src.slice(start, end)
      }
    }
  }
  throw new Error(`unbalanced block after marker: ${marker}`)
}

type HarnessOptions = {
  platform?: string
  iconExists?: boolean
  trayThrows?: boolean
  closeToTrayEnabled?: boolean
}

function harness(opts: HarnessOptions = {}) {
  const src = read('electron/main.js')
  const code = [
    extractBlock(src, 'function getAppIconPath()'),
    extractBlock(src, 'function ensureTray()'),
    extractBlock(src, 'function hideWindowToBackground(win)'),
    extractBlock(src, "win.on('close', (event) => {"),
    extractBlock(src, "ipcMain.handle('window:close', (e) => {")
  ].join('\n')

  const hidden: string[] = []
  const closed: string[] = []
  const prevented: string[] = []
  const warns: string[] = []
  const destroyed: string[] = []
  const win = {
    isDestroyed: () => false,
    hide: () => { hidden.push('hide') },
    close: () => { closed.push('close') },
    on: (_event: string, handler: (e: any) => void) => { ctx.closeHandler = handler }
  }
  const event = { preventDefault: () => { prevented.push('prevent') } }

  class FakeTray {
    constructor(public icon: string) {
      if (opts.trayThrows) throw new Error('no appindicator on this desktop')
    }
    setToolTip() {}
    setContextMenu() {}
    on() {}
    destroy() { destroyed.push('destroy') }
  }

  const ctx: any = {
    process: { platform: opts.platform ?? 'linux', resourcesPath: '/fake/resources', env: {} },
    path: {
      join: (...parts: string[]) => parts.join('/'),
      resolve: (...parts: string[]) => '/' + parts.join('/'),
      dirname: (p: string) => p,
      relative: (_from: string, to: string) => to
    },
    fsRaw: { existsSync: () => opts.iconExists !== false },
    __dirname: '/app/electron',
    Tray: FakeTray,
    Menu: { buildFromTemplate: (template: any) => template },
    app: { quit: () => {} },
    log: { warn: (...args: any[]) => { warns.push(args.join(' ')) } },
    showMainWindow: () => {},
    tray: null,
    appIsQuitting: false,
    closeToTrayEnabled: opts.closeToTrayEnabled !== false,
    mainWindow: null,
    BrowserWindow: { fromWebContents: () => win },
    ipcMain: { handle: (_channel: string, handler: (e: any) => void) => { ctx.ipcCloseHandler = handler } },
    win,
    event,
    hidden,
    closed,
    prevented,
    warns,
    destroyed
  }
  vm.createContext(ctx)
  vm.runInContext(code, ctx)
  return { ctx, win, event, hidden, closed, prevented, warns, destroyed }
}

describe('Linux close-to-tray safety (B2)', () => {
  it('ensureTray returns true and creates the tray when the packaged icon is present', () => {
    const h = harness({ iconExists: true })
    expect(h.ctx.getAppIconPath()).toBe('/fake/resources/assets/icon.png')
    expect(h.ctx.ensureTray()).toBe(true)
    expect(h.ctx.tray).not.toBeNull()
    expect(h.ctx.tray.icon).toBe('/fake/resources/assets/icon.png')
  })

  it('ensureTray returns false when no icon can be found', () => {
    const h = harness({ iconExists: false })
    expect(h.ctx.getAppIconPath()).toBeNull()
    expect(h.ctx.ensureTray()).toBe(false)
    expect(h.ctx.tray).toBeNull()
    expect(h.warns.join(' ')).toMatch(/Tray icon not found/)
  })

  it('ensureTray returns false and does not leave a tray when the Tray constructor throws', () => {
    const h = harness({ iconExists: true, trayThrows: true })
    expect(h.ctx.ensureTray()).toBe(false)
    expect(h.ctx.tray).toBeNull()
    expect(h.warns.join(' ')).toMatch(/unavailable/)
  })

  it('hideWindowToBackground only hides when a tray exists', () => {
    const ok = harness({ iconExists: true })
    expect(ok.ctx.hideWindowToBackground(ok.win)).toBe(true)
    expect(ok.hidden).toEqual(['hide'])

    const noIcon = harness({ iconExists: false })
    expect(noIcon.ctx.hideWindowToBackground(noIcon.win)).toBe(false)
    expect(noIcon.hidden).toEqual([])

    const noTray = harness({ iconExists: true, trayThrows: true })
    expect(noTray.ctx.hideWindowToBackground(noTray.win)).toBe(false)
    expect(noTray.hidden).toEqual([])
  })

  it('the window close handler ends the app when close-to-tray is on but no tray is available', () => {
    const h = harness({ iconExists: false, closeToTrayEnabled: true })
    h.ctx.closeHandler(h.event)
    expect(h.prevented).toEqual([])
    expect(h.hidden).toEqual([])
    expect(h.ctx.appIsQuitting).toBe(true)
  })

  it('the window close handler still hides to the tray when the tray works', () => {
    const h = harness({ iconExists: true, closeToTrayEnabled: true })
    h.ctx.closeHandler(h.event)
    expect(h.prevented).toEqual(['prevent'])
    expect(h.hidden).toEqual(['hide'])
    expect(h.ctx.appIsQuitting).toBe(false)
  })

  it('the window close handler respects closeToTray=false (Windows behaviour preserved)', () => {
    const h = harness({ iconExists: true, closeToTrayEnabled: false })
    h.ctx.closeHandler(h.event)
    expect(h.prevented).toEqual([])
    expect(h.hidden).toEqual([])
    expect(h.ctx.appIsQuitting).toBe(true)
  })

  it('window:close IPC closes the window outright when no tray can restore it', () => {
    const h = harness({ iconExists: true, trayThrows: true, closeToTrayEnabled: true })
    h.ctx.ipcCloseHandler({ sender: {} })
    expect(h.closed).toEqual(['close'])
    expect(h.hidden).toEqual([])
  })

  it('window:close IPC backgrounds the window when the tray works', () => {
    const h = harness({ iconExists: true, closeToTrayEnabled: true })
    h.ctx.ipcCloseHandler({ sender: {} })
    expect(h.closed).toEqual([])
    expect(h.hidden).toEqual(['hide'])
  })
})

describe('Linux icon resource in the package', () => {
  it('copies build/icon.png into resources/assets/icon.png on Linux', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.build.linux.icon).toBe('build/icon.png')
    expect(pkg.build.linux.extraResources).toContainEqual({
      from: 'build/icon.png',
      to: 'assets/icon.png'
    })
    // Windows keeps its own .ico configuration; the Linux extraResource must not disturb it.
    expect(pkg.build.win.icon).toBe('build/icon.ico')
    expect(fs.existsSync(path.join(root, 'build', 'icon.png'))).toBe(true)
  })

  it('the smoke build validates the icon inside the packaged resources', async () => {
    // @ts-ignore - plain JS module
    const { assertPackagedIcon } = await import('../scripts/build-linux.mjs')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'darkhub-linux-smoke-'))
    try {
      expect(() => assertPackagedIcon(tmp)).toThrow(/tray icon missing/)

      const iconDir = path.join(tmp, 'dist_release', 'linux-unpacked', 'resources', 'assets')
      fs.mkdirSync(iconDir, { recursive: true })
      fs.writeFileSync(path.join(iconDir, 'icon.png'), Buffer.from('packaged-icon'))
      expect(assertPackagedIcon(tmp)).toContain(path.join('resources', 'assets', 'icon.png'))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
