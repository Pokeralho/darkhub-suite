// DLSS 5 neural rendering through DLSS 5 Autopilot (Kizzuwatnaa/DLSS5-Autopilot, MIT): it reads each game, picks the
// route that works for it (OptiScaler fork, ReShade add-ons, bridge, feeder, RTX Remix...), fetches every part from its
// publisher and can take all of it back out. DarkHub installs its official release (SHA-256 from GitHub) and opens it;
// it does not re-implement the routes, which change every week.
import cp from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { assetSha256, downloadToFile, fetchJson, SYSTEM_TAR } from '../SecureDownload.js'

const REPO = 'Kizzuwatnaa/DLSS5-Autopilot'
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`
const ASSET_RE = /^DLSS5-Autopilot-v[\d.]+-win64\.zip$/i

function findExe(dir, depth = 0) {
  let entries = []
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return null }
  const exe = entries.find((e) => e.isFile() && /^dlss5[-_ ]?autopilot.*\.exe$/i.test(e.name))
  if (exe) return path.join(dir, exe.name)
  if (depth >= 2) return null
  for (const e of entries) if (e.isDirectory()) { const found = findExe(path.join(dir, e.name), depth + 1); if (found) return found }
  return null
}

export class Autopilot {
  constructor(root, { fetchJsonImpl = fetchJson, download = downloadToFile } = {}) {
    this.root = path.join(root, 'DLSS5-Autopilot')
    Object.assign(this, { fetchJsonImpl, download })
  }

  installed() {
    let tags = []
    try { tags = fs.readdirSync(this.root).filter((t) => /^v[\d.]+$/.test(t)) } catch { return null }
    tags.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    for (const tag of tags) {
      const exe = findExe(path.join(this.root, tag))
      if (exe) return { tag, exe }
    }
    return null
  }

  async latest() {
    const rel = await this.fetchJsonImpl(LATEST)
    const asset = (rel.assets || []).find((a) => ASSET_RE.test(a.name))
    if (!asset) throw new Error('no win64 package in the latest release')
    const sha256 = assetSha256(asset)
    if (!sha256) throw new Error('release asset has no published SHA-256')
    return { tag: rel.tag_name, url: asset.browser_download_url, sha256, size: asset.size, notesUrl: rel.html_url }
  }

  async status() {
    const local = this.installed()
    let remote = null
    try { remote = await this.latest() } catch (e) { return { installed: local, latest: null, error: String(e.message) } }
    return { installed: local, latest: remote.tag, updateAvailable: Boolean(local && remote.tag !== local.tag), notesUrl: remote.notesUrl }
  }

  /** Downloads and unpacks the newest release (verified against GitHub's SHA-256); older versions are removed. */
  async install(onProgress = () => {}) {
    const rel = await this.latest()
    const dir = path.join(this.root, rel.tag)
    const zip = path.join(this.root, `${rel.tag}.zip`)
    fs.mkdirSync(this.root, { recursive: true })
    await this.download(rel.url, zip, { expectedSha256: rel.sha256, maxBytes: 200 * 1048576, timeoutMs: 120000, onProgress })
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
    // bsdtar (Windows 10 1803+) reads zip and does not follow absolute or ../ paths out of the target
    cp.execFileSync(SYSTEM_TAR, ['-xf', zip, '-C', dir], { windowsHide: true, timeout: 120000 })
    fs.rmSync(zip, { force: true })
    if (!findExe(dir)) throw new Error('package unpacked but the executable was not found')
    for (const old of fs.readdirSync(this.root)) if (old !== rel.tag && /^v[\d.]+$/.test(old)) fs.rmSync(path.join(this.root, old), { recursive: true, force: true })
    return this.installed()
  }

  launch() {
    const local = this.installed()
    if (!local) throw new Error('DLSS 5 Autopilot is not installed')
    const child = cp.spawn(local.exe, [], { cwd: path.dirname(local.exe), detached: true, stdio: 'ignore' })
    child.unref()
    return local
  }
}
