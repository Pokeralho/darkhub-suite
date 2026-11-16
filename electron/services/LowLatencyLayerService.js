// Experimental: the Korthos low_latency_layer (MIT, vendored and ported in native_lowlatency/) as an implicit Vulkan
// layer. It gives AMD/Intel GPUs Reflex (VK_NV_low_latency2) or Anti-Lag 2 (VK_AMD_anti_lag) in Vulkan games only.
//
// How it is wired on Windows:
//   - the DLL + manifest are copied to %ProgramFiles%\DarkHubVkLayer: a stable path that survives app updates and,
//     unlike ProgramData, cannot be pre-created or written by a standard user (while the layer is on, the DLL is
//     loaded into every Vulkan process, elevated ones included);
//   - the manifest is listed in HKLM\SOFTWARE\Khronos\Vulkan\ImplicitLayers, like the Steam and OBS layers;
//   - the manifest's enable_environment means the loader only loads the DLL when LOW_LATENCY_LAYER=1, so the
//     user-level environment variables below are the on/off switch. "off" removes all of it.
// No `electron` import, so the pure helpers are unit-testable; the runner is injectable.
import fs from 'node:fs'
import path from 'node:path'
import { runPowerShell, parseJsonOutput } from './PowerShellRunner.js'
import { psQuote } from './optimizer/OptimizerUtils.js'
import { SERVICES_DIR, sha256File, integrityError } from './binaryIntegrity.js'

export const LAYER_DLL = 'VkLayer_KORTHOS_LowLatency.dll'
export const LAYER_JSON = 'VkLayer_KORTHOS_LowLatency.json'
export const LAYER_FILES = [LAYER_DLL, LAYER_JSON]
export const REGISTRY_KEY = 'HKLM:\\SOFTWARE\\Khronos\\Vulkan\\ImplicitLayers'
export const ENV_ENABLE = 'LOW_LATENCY_LAYER'
export const ENV_REFLEX = 'LOW_LATENCY_LAYER_REFLEX'
export const MODES = ['off', 'antilag', 'reflex']

export const sourceDir = () => path.join(SERVICES_DIR, 'lowlatency')
export const installDir = (env = process.env) => path.join(env.ProgramW6432 || env.ProgramFiles || 'C:\\Program Files', 'DarkHubVkLayer')

/** PCI vendor from a PNPDeviceID such as PCI\VEN_1002&DEV_744C... */
export function vendorFromPnp(pnp = '', name = '') {
  const id = /VEN_([0-9A-F]{4})/i.exec(String(pnp))?.[1]?.toUpperCase()
  if (id === '10DE') return 'nvidia'
  if (id === '1002' || id === '1022') return 'amd'
  if (id === '8086') return 'intel'
  const n = String(name).toLowerCase()
  if (/nvidia|geforce|quadro|rtx/.test(n)) return 'nvidia'
  if (/radeon|amd/.test(n)) return 'amd'
  if (/intel|arc/.test(n)) return 'intel'
  return 'other'
}

/** Current mode from the user's environment variables (anything but exactly "1" is off, like the layer itself). */
export function modeFromEnv(enable, reflex) {
  if (String(enable ?? '') !== '1') return 'off'
  return String(reflex ?? '') === '1' ? 'reflex' : 'antilag'
}

/**
 * What the UI should say about this machine. NVIDIA already has Reflex in its driver; the layer only adds something
 * on AMD/Intel. A virtual or basic display adapter gets 'none'.
 */
export function recommendation(gpus = []) {
  const vendors = new Set(gpus.map((g) => g.vendor))
  if (vendors.has('amd') || vendors.has('intel')) return 'useful'
  if (vendors.has('nvidia')) return 'nativeNvidia'
  return 'none'
}

const STATUS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$layers = @()
$key = Get-Item -LiteralPath ${psQuote(REGISTRY_KEY)}
if ($key) { $layers = @($key.GetValueNames()) }
$gpus = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = [string]$_.Name; pnp = [string]$_.PNPDeviceID } })
@{
  layers = $layers
  enable = [Environment]::GetEnvironmentVariable(${psQuote(ENV_ENABLE)}, 'User')
  reflex = [Environment]::GetEnvironmentVariable(${psQuote(ENV_REFLEX)}, 'User')
  gpus = $gpus
} | ConvertTo-Json -Compress -Depth 4
`

/** Registers (or unregisters) the manifest and sets (or clears) the user variables in one script. */
export function buildApplyScript(mode, manifestPath) {
  const on = mode !== 'off'
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    `$manifest = ${psQuote(manifestPath)}`,
    `$key = ${psQuote(REGISTRY_KEY)}`
  ]
  if (on) {
    lines.push(
      'if (-not (Test-Path -LiteralPath $key)) { New-Item -Path $key -Force | Out-Null }',
      'New-ItemProperty -LiteralPath $key -Name $manifest -PropertyType DWord -Value 0 -Force | Out-Null',
      `[Environment]::SetEnvironmentVariable(${psQuote(ENV_ENABLE)}, '1', 'User')`,
      `[Environment]::SetEnvironmentVariable(${psQuote(ENV_REFLEX)}, ${mode === 'reflex' ? "'1'" : '$null'}, 'User')`
    )
  } else {
    lines.push(
      'if (Test-Path -LiteralPath $key) { Remove-ItemProperty -LiteralPath $key -Name $manifest -ErrorAction SilentlyContinue }',
      `[Environment]::SetEnvironmentVariable(${psQuote(ENV_ENABLE)}, $null, 'User')`,
      `[Environment]::SetEnvironmentVariable(${psQuote(ENV_REFLEX)}, $null, 'User')`
    )
  }
  lines.push("Write-Output 'OK'")
  return lines.join('\n')
}

export class LowLatencyLayerService {
  constructor({ runner, fsImpl = fs, env = process.env, source = sourceDir(), checkIntegrity = integrityError } = {}) {
    this._run = runner || ((script) => runPowerShell(script, { timeoutMs: 30000 }))
    this._fs = fsImpl
    this._env = env
    this._source = source
    this._checkIntegrity = checkIntegrity
  }

  _filesState() {
    const dir = installDir(this._env)
    const bundled = LAYER_FILES.every((f) => this._fs.existsSync(path.join(this._source, f)))
    const installed = LAYER_FILES.every((f) => this._fs.existsSync(path.join(dir, f)))
    let upToDate = false
    if (bundled && installed) {
      try {
        upToDate = LAYER_FILES.every((f) => sha256File(path.join(this._source, f)) === sha256File(path.join(dir, f)))
      } catch { upToDate = false }
    }
    return { dir, bundled, installed, upToDate, manifestPath: path.join(dir, LAYER_JSON) }
  }

  async getStatus() {
    const files = this._filesState()
    let data = null
    try {
      const r = await this._run(STATUS_SCRIPT)
      data = parseJsonOutput(r?.stdout, null)
    } catch { data = null }
    const layers = Array.isArray(data?.layers) ? data.layers : []
    const gpus = (Array.isArray(data?.gpus) ? data.gpus : data?.gpus ? [data.gpus] : [])
      .map((g) => ({ name: String(g?.name || ''), vendor: vendorFromPnp(g?.pnp, g?.name) }))
    const registered = layers.some((v) => String(v).toLowerCase() === files.manifestPath.toLowerCase())
    const mode = registered && files.installed ? modeFromEnv(data?.enable, data?.reflex) : 'off'
    return {
      ok: data !== null,
      mode,
      bundled: files.bundled,
      installed: files.installed,
      registered,
      upToDate: files.upToDate,
      installDir: files.dir,
      gpus,
      recommendation: recommendation(gpus)
    }
  }

  _install() {
    const files = this._filesState()
    if (!files.bundled) return { ok: false, error: 'not_bundled' }
    const bad = this._checkIntegrity(['lowlatency/'])
    if (bad) return { ok: false, error: bad }
    if (files.upToDate) return { ok: true, manifestPath: files.manifestPath }
    try {
      this._fs.mkdirSync(files.dir, { recursive: true })
      for (const f of LAYER_FILES) this._fs.copyFileSync(path.join(this._source, f), path.join(files.dir, f))
    } catch (err) {
      // EBUSY/EPERM: a running Vulkan game still has the old DLL loaded
      const busy = /EBUSY|EPERM|EACCES/.test(String(err?.code || err?.message))
      return { ok: false, error: busy ? 'in_use' : (err?.message ?? String(err)) }
    }
    return { ok: true, manifestPath: files.manifestPath }
  }

  _removeFiles() {
    const dir = installDir(this._env)
    let inUse = false
    for (const f of LAYER_FILES) {
      try { this._fs.rmSync(path.join(dir, f), { force: true }) } catch { inUse = true }
    }
    try { if (!inUse) this._fs.rmSync(dir, { recursive: true, force: true }) } catch { /* not empty / locked */ }
    return inUse
  }

  /** mode: 'off' | 'antilag' | 'reflex'. Games (and their launchers, e.g. Steam) must be restarted to pick it up. */
  async apply(mode) {
    if (!MODES.includes(mode)) return { ok: false, error: 'invalid_mode' }
    let manifestPath = this._filesState().manifestPath
    if (mode !== 'off') {
      const inst = this._install()
      if (!inst.ok) return inst
      manifestPath = inst.manifestPath
    }
    let r
    try {
      r = await this._run(buildApplyScript(mode, manifestPath))
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
    if (r?.code !== 0 || !/OK/.test(String(r?.stdout))) {
      return { ok: false, error: String(r?.stderr || `exit ${r?.code}`).trim() }
    }
    const filesLeft = mode === 'off' ? this._removeFiles() : false
    return { ok: true, mode, restartRequired: true, filesLeft }
  }
}

export default new LowLatencyLayerService()
