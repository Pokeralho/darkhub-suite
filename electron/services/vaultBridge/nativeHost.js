// Per-user registration of the native messaging host for Chrome, Edge and Firefox.
// Writes only under HKCU and the app's userData folder; unregister removes exactly what register created.
import fsp from 'node:fs/promises'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { NATIVE_HOST_NAME } from './protocol.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Fixed IDs of the DarkHub extension (browser-extension/manifest.json). The Chromium ID comes from the "key" field,
// so it is the same for every unpacked install; the Firefox ID from browser_specific_settings.gecko.id.
export const CHROMIUM_EXTENSION_ID = 'dpibeiimcolhiofphhncmjbejgcfblgh'
export const GECKO_EXTENSION_ID = 'vault@darkhub.app'
// The Chrome Web Store and Edge Add-ons give a published extension its own id: add each one here once it exists.
export const STORE_CHROMIUM_IDS = []
export const CHROMIUM_EXTENSION_IDS = [CHROMIUM_EXTENSION_ID, ...STORE_CHROMIUM_IDS]
export const ALLOWED_CALLERS = new Set([...CHROMIUM_EXTENSION_IDS.map((id) => `chromium:${id}`), `gecko:${GECKO_EXTENSION_ID}`])

export const HOST_EXE_NAME = 'DarkHub.VaultBridgeHost.exe'

export const BROWSERS = Object.freeze({
  chrome: { label: 'Google Chrome', key: `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`, kind: 'chromium' },
  edge: { label: 'Microsoft Edge', key: `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`, kind: 'chromium' },
  firefox: { label: 'Mozilla Firefox', key: `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${NATIVE_HOST_NAME}`, kind: 'gecko' }
})

export function isBrowserId(v) {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(BROWSERS, v)
}

/** Host manifest for one browser. Only our extension is allowed to start the host. */
export function buildHostManifest(browser, exePath) {
  const b = BROWSERS[browser]
  if (!b) throw new Error('Unknown browser')
  const base = {
    name: NATIVE_HOST_NAME,
    description: 'DarkHub Vault bridge',
    path: exePath,
    type: 'stdio'
  }
  return b.kind === 'gecko'
    ? { ...base, allowed_extensions: [GECKO_EXTENSION_ID] }
    : { ...base, allowed_origins: CHROMIUM_EXTENSION_IDS.map((id) => `chrome-extension://${id}/`) }
}

export function manifestFileName(browser) {
  return `${NATIVE_HOST_NAME}.${browser}.json`
}

function defaultRunReg(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

/** Where the bundled host exe and its C# source live (dev tree or app.asar.unpacked). */
export function bundledHostCandidates() {
  const servicesDir = path.join(__dirname, '..')
  const unpacked = servicesDir.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`)
  const list = [path.join(unpacked, HOST_EXE_NAME), path.join(servicesDir, HOST_EXE_NAME)]
  if (process.resourcesPath) list.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'electron', 'services', HOST_EXE_NAME))
  return { exes: [...new Set(list)], source: path.join(unpacked, 'DarkHub.VaultBridgeHost.cs') }
}

async function sha256File(p) {
  try { return crypto.createHash('sha256').update(await fsp.readFile(p)).digest('hex') } catch { return null }
}

export class NativeHostRegistry {
  /**
   * @param {{ dir: string, runReg?: (args: string[]) => Promise<{code:number, stdout:string}>, platform?: string,
   *           findBundledExe?: () => Promise<string|null> }} opts
   */
  constructor({ dir, runReg = defaultRunReg, platform = process.platform, findBundledExe }) {
    this.dir = dir
    this.runReg = runReg
    this.platform = platform
    this.findBundledExe = findBundledExe || (() => this.#defaultFindBundledExe())
  }

  get hostExePath() {
    return path.join(this.dir, HOST_EXE_NAME)
  }

  manifestPath(browser) {
    return path.join(this.dir, manifestFileName(browser))
  }

  async #defaultFindBundledExe() {
    const { exes, source } = bundledHostCandidates()
    for (const p of exes) if (fs.existsSync(p)) return p
    // Not shipped (e.g. build:native not run): compile it from the bundled C# source with the in-box .NET compiler.
    const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe')
    if (!fs.existsSync(csc) || !fs.existsSync(source)) return null
    const out = path.join(this.dir, `build-${HOST_EXE_NAME}`)
    await fsp.mkdir(this.dir, { recursive: true })
    const ok = await new Promise((resolve) => {
      execFile(csc, ['/nologo', '/target:exe', '/platform:anycpu', '/optimize+', `/out:${out}`, source], { windowsHide: true, timeout: 60000 }, (err) => resolve(!err))
    })
    return ok && fs.existsSync(out) ? out : null
  }

  async #installHostExe() {
    const src = await this.findBundledExe()
    if (!src) throw new Error('host_exe_missing')
    await fsp.mkdir(this.dir, { recursive: true })
    const dest = this.hostExePath
    if (path.resolve(src) === path.resolve(dest)) return dest
    const [a, b] = await Promise.all([sha256File(src), sha256File(dest)])
    if (a && a === b) return dest
    try {
      await fsp.copyFile(src, dest)
    } catch (err) {
      // A browser may be running the old copy; it is still usable if present.
      if (!fs.existsSync(dest)) throw err
    }
    return dest
  }

  async register(browser) {
    if (this.platform !== 'win32') throw new Error('windows_only')
    if (!isBrowserId(browser)) throw new Error('Unknown browser')
    const exe = await this.#installHostExe()
    const manifestPath = this.manifestPath(browser)
    await fsp.writeFile(manifestPath, JSON.stringify(buildHostManifest(browser, exe), null, 2), 'utf8')
    const res = await this.runReg(['add', BROWSERS[browser].key, '/ve', '/t', 'REG_SZ', '/d', manifestPath, '/f'])
    if (res.code !== 0) {
      await fsp.rm(manifestPath, { force: true })
      throw new Error('registry_write_failed')
    }
    return this.status(browser)
  }

  async unregister(browser) {
    if (!isBrowserId(browser)) throw new Error('Unknown browser')
    const current = await this.#readRegValue(browser)
    // Only delete the key when it points at our manifest (never someone else's host with the same name).
    if (current && path.resolve(current).toLowerCase() === path.resolve(this.manifestPath(browser)).toLowerCase()) {
      await this.runReg(['delete', BROWSERS[browser].key, '/f'])
    }
    await fsp.rm(this.manifestPath(browser), { force: true })
    return this.status(browser)
  }

  async #readRegValue(browser) {
    if (this.platform !== 'win32') return null
    const res = await this.runReg(['query', BROWSERS[browser].key, '/ve'])
    if (res.code !== 0) return null
    const m = res.stdout.match(/REG_SZ\s+(.+?)\s*$/m)
    return m ? m[1].trim() : null
  }

  /** { browser, label, registered, pointsToUs, manifestOk, manifestPath } */
  async status(browser) {
    const regValue = await this.#readRegValue(browser)
    const manifestPath = this.manifestPath(browser)
    const pointsToUs = Boolean(regValue) && path.resolve(regValue).toLowerCase() === path.resolve(manifestPath).toLowerCase()
    let manifestOk = false
    try {
      const m = JSON.parse(await fsp.readFile(manifestPath, 'utf8'))
      manifestOk = m?.name === NATIVE_HOST_NAME && typeof m.path === 'string' && fs.existsSync(m.path)
    } catch {}
    return {
      browser,
      label: BROWSERS[browser].label,
      registered: pointsToUs && manifestOk,
      foreignRegistration: Boolean(regValue) && !pointsToUs,
      manifestPath
    }
  }

  async statusAll() {
    return Promise.all(Object.keys(BROWSERS).map((b) => this.status(b)))
  }

  async anyRegistered() {
    return (await this.statusAll()).some((s) => s.registered)
  }
}

/** bridge.cfg (read by the host exe). Written on server start, deleted on stop. */
export async function writeBridgeConfig(dir, cfg) {
  const p = path.join(dir, 'bridge.cfg')
  if (!cfg) {
    await fsp.rm(p, { force: true })
    return
  }
  await fsp.mkdir(dir, { recursive: true })
  const tmp = `${p}.${process.pid}.tmp`
  await fsp.writeFile(tmp, `port=${cfg.port}\nsecret=${cfg.secret}\n`, { encoding: 'utf8', mode: 0o600 })
  await fsp.rename(tmp, p)
}
