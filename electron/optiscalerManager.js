import path from 'node:path'
import os from 'node:os'
import fsRaw from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  encodePowerShellScript as encodePowerShellScriptShared,
  powerShellArgsForEncodedScript,
  runCommand,
  parseJsonOutput
} from './services/PowerShellRunner.js'

const fs = fsRaw.promises
const execFileAsync = promisify(execFile)

const RELEASE_FOLDER_NAME = 'Optiscaler_0.9.1-final.20260427._DSB'
const SUPPORTED_LOADERS = ['dxgi.dll', 'winmm.dll', 'version.dll', 'dbghelp.dll', 'd3d12.dll', 'wininet.dll', 'winhttp.dll', 'OptiScaler.asi']
const ROOT_EXCLUDES = new Set([
  'OptiScaler.dll',
  'setup_windows.bat',
  'setup_linux.sh',
  '!! README_EXTRACT ALL FILES TO GAME FOLDER !!.txt'
])
const LEGACY_CONFLICTS = ['nvapi64.dll', 'nvngx.dll', 'OptiScaler.dll', 'OptiScaler.asi', 'Remove OptiScaler.bat']
const MANIFEST_FILE = 'DarkHubOptiScaler.json'

function nowStamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function getSourceVersion(app) {
  try {
    const dir = resolveReleaseDir(app);
    const verFile = path.join(dir, 'version.txt');
    if (await exists(verFile)) {
      const v = (await fs.readFile(verFile, 'utf8')).trim();
      if (v) return v;
    }
  } catch {}
  return RELEASE_FOLDER_NAME.replace(/^Optiscaler_/i, '');
}

function resolveReleaseDir(app) {
  try {
    const userDir = path.join(app.getPath('userData'), 'OptiScaler', RELEASE_FOLDER_NAME);
    if (fsRaw.existsSync(path.join(userDir, 'OptiScaler.dll')) || fsRaw.existsSync(path.join(userDir, 'nvngx.dll'))) {
      return userDir;
    }
    if (app.isPackaged) {
      const resDir = path.join(process.resourcesPath, RELEASE_FOLDER_NAME);
      if (fsRaw.existsSync(resDir)) return resDir;
      return userDir;
    }
  } catch {}
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', RELEASE_FOLDER_NAME);
}

function normalizeWinPath(value) {
  return path.resolve(String(value ?? '').trim())
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return null
  }
}

async function runPowerShellJson(script, args = [], timeout = 8000) {
  if (process.platform !== 'win32') return null
  try {
    const encoded = encodePowerShellScriptShared(script)
    const psArgs = [...powerShellArgsForEncodedScript(encoded), ...args]
    const { code, stdout } = await runCommand('powershell.exe', psArgs, {
      timeoutMs: timeout,
      trim: true,
      maxBuffer: 1024 * 1024
    })
    if (code !== 0) return null
    return stdout ? parseJsonOutput(stdout, null) : null
  } catch {
    return null
  }
}

async function getFileVersionInfo(filePath) {
  const script = `
    $ErrorActionPreference = 'Stop'
    $p = $args[0]
    if (!(Test-Path -LiteralPath $p -PathType Leaf)) { return }
    $v = (Get-Item -LiteralPath $p).VersionInfo
    [PSCustomObject]@{
      originalFilename = [string]$v.OriginalFilename
      fileVersion = [string]$v.FileVersion
      productVersion = [string]$v.ProductVersion
      productName = [string]$v.ProductName
      companyName = [string]$v.CompanyName
    } | ConvertTo-Json -Compress
  `
  return runPowerShellJson(script, [filePath])
}

async function getGpuInfo() {
  const script = `
    $ErrorActionPreference = 'Stop'
    Get-CimInstance Win32_VideoController |
      Select-Object Name, AdapterCompatibility, DriverVersion, PNPDeviceID |
      ConvertTo-Json -Compress
  `
  const parsed = await runPowerShellJson(script)
  const list = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
  const text = list.map((x) => `${x.Name ?? ''} ${x.AdapterCompatibility ?? ''} ${x.PNPDeviceID ?? ''}`).join(' ').toLowerCase()
  const vendor = text.includes('nvidia')
    ? 'nvidia'
    : text.includes('intel')
      ? 'intel'
      : text.includes('amd') || text.includes('advanced micro devices') || text.includes('radeon')
        ? 'amd'
        : 'unknown'
  const amdArchitecture = vendor === 'amd'
    ? /(?:rx\s*)?9\d{3}|radeon.*(?:9060|9070|9080|9090)/i.test(text)
      ? 'rdna4'
      : /(?:rx\s*)?7\d{3}|radeon.*(?:7400|7600|7700|7800|7900|740m|760m|780m|880m|890m)/i.test(text)
        ? 'rdna3'
        : /(?:rx\s*)?6\d{3}|radeon.*(?:6400|6500|6600|6700|6800|6900)/i.test(text)
          ? 'rdna2'
          : 'unknown'
    : null
  return { vendor, amdArchitecture, controllers: list }
}

function getWindowsBuild() {
  const parts = String(os.release()).split('.').map((x) => Number(x))
  return Number.isFinite(parts[2]) ? parts[2] : 0
}

function isWindows11OrNewer() {
  return getWindowsBuild() >= 22000
}

async function walkFiles(root, { maxDepth = 4, maxFiles = 5000 } = {}) {
  const out = []
  const rootPath = normalizeWinPath(root)
  const skipDirs = new Set(['.git', 'node_modules', 'content', 'movies', 'sound', 'audio', 'localization'])

  async function walk(dir, depth) {
    if (out.length >= maxFiles || depth > maxDepth) return
    let entries = []
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) return
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name.toLowerCase())) await walk(full, depth + 1)
      } else if (entry.isFile()) {
        out.push({ name: entry.name, lower: entry.name.toLowerCase(), path: full, relative: path.relative(rootPath, full) })
      }
    }
  }

  await walk(rootPath, 0)
  return out
}

async function findUnrealExecutableCandidates(baseDir) {
  const files = await walkFiles(baseDir, { maxDepth: 5, maxFiles: 3000 })
  return files
    .filter((f) => /-(win64|wingdk)-shipping\.exe$/i.test(f.name) && !f.relative.toLowerCase().startsWith(`engine${path.sep}`))
    .slice(0, 12)
    .map((f) => ({ exePath: f.path, workingDir: path.dirname(f.path), name: path.basename(f.name, '.exe') }))
}

function detectUpscaleFiles(files) {
  const byKind = []
  const add = (kind, file, detail = '') => byKind.push({ kind, file: file.name, path: file.path, relative: file.relative, detail })

  for (const file of files) {
    const n = file.lower
    if (n === 'nvngx_dlss.dll') add('DLSS', file, 'nvngx_dlss')
    if (n === 'nvngx_dlssg.dll' || n === 'sl.dlss_g.dll') add('DLSS-G', file, 'frame generation')
    if (n === 'sl.dlss.dll' || n === 'sl.interposer.dll') add('Streamline', file)
    if (n === 'libxess.dll' || n === 'libxess_dx11.dll') add('XeSS', file)
    if (n === 'libxess_fg.dll') add('XeFG', file)
    if (n.includes('fsr2') || n.includes('fsr3')) add('FSR', file)
    if (n === 'amd_fidelityfx_dx12.dll' || n === 'amd_fidelityfx_upscaler_dx12.dll' || n === 'amd_fidelityfx_framegeneration_dx12.dll') add('FidelityFX', file)
    if (n === 'vulkan-1.dll') add('Vulkan', file)
    if (n === 'd3d12.dll') add('D3D12', file)
    if (n === 'd3d11.dll') add('D3D11', file)
  }

  const kinds = new Set(byKind.map((x) => x.kind))
  return {
    files: byKind,
    hasDlss: kinds.has('DLSS') || kinds.has('Streamline') || kinds.has('DLSS-G'),
    hasDlssFg: kinds.has('DLSS-G'),
    hasXess: kinds.has('XeSS') || kinds.has('XeFG'),
    hasFsr: kinds.has('FSR') || kinds.has('FidelityFX'),
    hasFfx: kinds.has('FidelityFX'),
    hasVulkan: kinds.has('Vulkan'),
    hasD3d12: kinds.has('D3D12'),
    hasD3d11: kinds.has('D3D11')
  }
}

async function detectInstalledLoaders(targetDir) {
  const loaders = []
  const conflicts = []

  for (const loader of SUPPORTED_LOADERS) {
    const filePath = path.join(targetDir, loader)
    if (!(await exists(filePath))) continue
    const versionInfo = await getFileVersionInfo(filePath)
    const original = String(versionInfo?.originalFilename ?? '').toLowerCase()
    const product = String(versionInfo?.productName ?? '').toLowerCase()
    const isOptiScaler = original === 'optiscaler.dll' || product.includes('optiscaler')
    const entry = {
      file: loader,
      path: filePath,
      isOptiScaler,
      originalFilename: versionInfo?.originalFilename || '',
      fileVersion: versionInfo?.fileVersion || '',
      productVersion: versionInfo?.productVersion || ''
    }
    loaders.push(entry)
    if (!isOptiScaler) conflicts.push(entry)
  }

  return { loaders, conflicts }
}

function chooseLoader({ targetDir, installed, detected, exePath }) {
  const existingOpti = installed.loaders.find((x) => x.isOptiScaler)
  if (existingOpti) return { loader: existingOpti.file, reason: 'OptiScaler ja instalado com este loader.' }

  const lowerPath = `${targetDir} ${exePath}`.toLowerCase()
  const occupied = new Set(installed.conflicts.map((x) => x.file.toLowerCase()))
  const prefer = lowerPath.includes('wingdk') || lowerPath.includes('windowsapps')
    ? ['winmm.dll', 'version.dll', 'dxgi.dll', 'd3d12.dll', 'dbghelp.dll', 'wininet.dll', 'winhttp.dll']
    : detected.hasVulkan && !detected.hasD3d12
      ? ['winmm.dll', 'dxgi.dll', 'version.dll', 'd3d12.dll', 'dbghelp.dll', 'wininet.dll', 'winhttp.dll']
      : ['dxgi.dll', 'winmm.dll', 'version.dll', 'd3d12.dll', 'dbghelp.dll', 'wininet.dll', 'winhttp.dll']

  const free = prefer.find((x) => !occupied.has(x.toLowerCase()))
  if (free) return { loader: free, reason: free === 'dxgi.dll' ? 'Padrao recomendado pelo guia oficial.' : 'Escolhido para evitar conflito com DLL existente.' }
  return { loader: 'dxgi.dll', reason: 'Todos os loaders comuns parecem ocupados; sera necessario sobrescrever com backup.' }
}

function chooseInputApi(detected) {
  if (detected.hasDlss) return 'dlss'
  if (detected.hasFsr) return 'fsr'
  if (detected.hasXess) return 'xess'
  return 'auto'
}

function normalizeChoice(value, allowed, fallback) {
  const v = String(value ?? '').trim().toLowerCase()
  return allowed.includes(v) ? v : fallback
}

function buildIniPatch({ upscaler, inputApi, gpu, includeAgilitySdk }) {
  const patch = []
  const isFsr4Mode = upscaler === 'fsr4' || upscaler === 'fsr4_rdna3'

  if (upscaler === 'fsr22') {
    patch.push(['Upscalers', 'Dx11Upscaler', 'fsr22'], ['Upscalers', 'Dx12Upscaler', 'fsr22'], ['Upscalers', 'VulkanUpscaler', 'fsr22'], ['FSR', 'UpscalerIndex', '2'], ['FSR', 'Fsr4Update', 'false'])
  } else if (upscaler === 'fsr31') {
    patch.push(['Upscalers', 'Dx11Upscaler', 'fsr31'], ['Upscalers', 'Dx12Upscaler', 'fsr31'], ['Upscalers', 'VulkanUpscaler', 'fsr31'], ['FSR', 'UpscalerIndex', '1'], ['FSR', 'Fsr4Update', 'false'])
  } else if (isFsr4Mode) {
    patch.push(['Upscalers', 'Dx11Upscaler', 'fsr31_12'], ['Upscalers', 'Dx12Upscaler', 'fsr31'], ['Upscalers', 'VulkanUpscaler', 'fsr31_12'], ['FSR', 'UpscalerIndex', '0'], ['FSR', 'Fsr4Update', 'true'])
    if (includeAgilitySdk) patch.push(['FSR', 'FsrAgilitySDKUpgrade', 'true'])
  } else if (upscaler === 'xess') {
    patch.push(['Upscalers', 'Dx11Upscaler', gpu.vendor === 'intel' ? 'xess' : 'xess_12'], ['Upscalers', 'Dx12Upscaler', 'xess'], ['Upscalers', 'VulkanUpscaler', 'xess'])
  } else if (upscaler === 'dlss') {
    patch.push(['Upscalers', 'Dx11Upscaler', 'dlss'], ['Upscalers', 'Dx12Upscaler', 'dlss'], ['Upscalers', 'VulkanUpscaler', 'dlss'])
  }

  if (inputApi === 'dlss') {
    patch.push(['Inputs', 'EnableDlssInputs', 'true'], ['Inputs', 'EnableXeSSInputs', 'auto'], ['Inputs', 'EnableFsr2Inputs', 'auto'], ['Inputs', 'EnableFsr3Inputs', 'auto'], ['Spoofing', 'Dxgi', 'auto'])
  } else if (inputApi === 'xess') {
    patch.push(['Inputs', 'EnableXeSSInputs', 'true'], ['Inputs', 'EnableDlssInputs', 'false'], ['Spoofing', 'Dxgi', 'false'])
  } else if (inputApi === 'fsr') {
    patch.push(['Inputs', 'EnableFsr2Inputs', 'true'], ['Inputs', 'UseFsr2Inputs', 'true'], ['Inputs', 'EnableFsr3Inputs', 'true'], ['Inputs', 'UseFsr3Inputs', 'true'], ['Inputs', 'EnableFfxInputs', 'true'], ['Inputs', 'UseFfxInputs', 'true'], ['Inputs', 'EnableDlssInputs', 'false'], ['Spoofing', 'Dxgi', 'false'])
  }

  return patch
}

function setIniValue(content, section, key, value) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const sectionPattern = new RegExp(`^\\s*\\[${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*$`, 'i')
  const keyPattern = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`, 'i')
  let sectionStart = -1
  let sectionEnd = lines.length

  for (let i = 0; i < lines.length; i += 1) {
    if (sectionPattern.test(lines[i])) {
      sectionStart = i
      break
    }
  }

  if (sectionStart === -1) {
    lines.push('', `[${section}]`, `${key}=${value}`)
    return lines.join(eol)
  }

  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (/^\s*\[[^\]]+\]\s*$/.test(lines[i])) {
      sectionEnd = i
      break
    }
  }

  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    if (keyPattern.test(lines[i])) {
      lines[i] = `${key}=${value}`
      return lines.join(eol)
    }
  }

  lines.splice(sectionEnd, 0, `${key}=${value}`)
  return lines.join(eol)
}

function applyIniPatch(content, patch) {
  return patch.reduce((next, [section, key, value]) => setIniValue(next, section, key, value), content)
}

function getExePayload(payload) {
  const game = payload?.game && typeof payload.game === 'object' ? payload.game : {}
  return {
    game,
    gameId: String(payload?.gameId ?? game.id ?? '').trim(),
    exePath: normalizeWinPath(payload?.exePath || game.exePath || ''),
    workingDir: String(payload?.workingDir ?? game.workingDir ?? '').trim()
  }
}

async function buildAnalysis(app, payload = {}) {
  if (process.platform !== 'win32') return { ok: false, error: 'OptiScaler Manager so e suportado no Windows.' }

  const { game, gameId, exePath, workingDir } = getExePayload(payload)
  if (!exePath || !exePath.toLowerCase().endsWith('.exe')) return { ok: false, error: 'Selecione um executavel .exe valido.' }
  if (!(await exists(exePath))) return { ok: false, error: `Executavel nao encontrado: ${exePath}` }

  const releaseDir = resolveReleaseDir(app)
  const sourceOk = (await exists(path.join(releaseDir, 'OptiScaler.dll'))) && (await exists(path.join(releaseDir, 'OptiScaler.ini')))
  const initialDir = normalizeWinPath(payload?.targetDir || workingDir || path.dirname(exePath))
  let targetDir = initialDir
  let targetExePath = exePath
  let unrealCandidates = []
  let notes = []

  if (await exists(path.join(initialDir, 'Engine'))) {
    unrealCandidates = await findUnrealExecutableCandidates(initialDir)
    if (!payload?.targetDir && unrealCandidates[0]) {
      targetDir = unrealCandidates[0].workingDir
      targetExePath = unrealCandidates[0].exePath
      notes.push('Unreal Engine detectado: usando Binaries\\Win64/WinGDK do executavel shipping.')
    } else {
      notes.push('Pasta Engine detectada. Em jogos Unreal, prefira o executavel *-Win64-Shipping.exe em Binaries\\Win64.')
    }
  }

  const files = await walkFiles(targetDir, { maxDepth: 4, maxFiles: 6000 })
  const detected = detectUpscaleFiles(files)
  const installed = await detectInstalledLoaders(targetDir)
  const gpu = await getGpuInfo()
  const autoLoader = chooseLoader({ targetDir, installed, detected, exePath: targetExePath })
  const preferredLoader = normalizeChoice(payload?.loader, ['auto', ...SUPPORTED_LOADERS.map((x) => x.toLowerCase())], 'auto')
  const requestedLoader = preferredLoader === 'auto'
    ? autoLoader.loader
    : SUPPORTED_LOADERS.find((x) => x.toLowerCase() === preferredLoader) || autoLoader.loader
  const upscaler = normalizeChoice(payload?.upscaler ?? game?.optiscaler?.upscaler, ['auto', 'fsr22', 'fsr31', 'fsr4', 'fsr4_rdna3', 'xess', 'dlss'], 'auto')
  const inputApi = normalizeChoice(payload?.inputApi ?? game?.optiscaler?.inputApi, ['auto', 'dlss', 'xess', 'fsr'], 'auto')
  const resolvedInputApi = inputApi === 'auto' ? chooseInputApi(detected) : inputApi
  const isFsr4Mode = upscaler === 'fsr4' || upscaler === 'fsr4_rdna3'
  const includeAgilitySdk = Boolean(payload?.includeAgilitySdk ?? game?.optiscaler?.includeAgilitySdk ?? (isFsr4Mode && !isWindows11OrNewer()))
  const manifest = await readJsonIfExists(path.join(targetDir, MANIFEST_FILE))
  const selectedLoaderConflict = installed.conflicts.find((x) => x.file.toLowerCase() === requestedLoader.toLowerCase()) || null
  const legacyConflicts = []

  for (const name of LEGACY_CONFLICTS) {
    const p = path.join(targetDir, name)
    if (await exists(p)) legacyConflicts.push({ file: name, path: p })
  }

  const versionFiles = detected.files
    .filter((x) => ['DLSS', 'DLSS-G', 'XeSS', 'XeFG', 'FidelityFX'].includes(x.kind))
    .slice(0, 8)
  const versions = []
  for (const item of versionFiles) {
    const info = await getFileVersionInfo(item.path)
    versions.push({ ...item, fileVersion: info?.fileVersion || '', productVersion: info?.productVersion || '' })
  }

  if (!detected.hasDlss && !detected.hasFsr && !detected.hasXess) {
    notes.push('Nenhum arquivo DLSS/XeSS/FSR foi encontrado nesta pasta. O jogo ainda pode funcionar, mas talvez a pasta alvo esteja errada.')
  }
  if (isFsr4Mode && gpu.vendor !== 'amd') {
    notes.push('FSR4 foi selecionado, mas a GPU AMD nao foi detectada. O suporte real depende do driver/jogo.')
  }
  if (isFsr4Mode && gpu.vendor === 'amd' && gpu.amdArchitecture !== 'rdna4') {
    notes.push('FSR4 e oficialmente suportado em Radeon RX 9000/RDNA4. Este perfil fora de RDNA4 e experimental.')
  }
  if (upscaler === 'fsr4_rdna3') {
    if (gpu.amdArchitecture === 'rdna3') {
      notes.push('Perfil RDNA3 detectado: DarkHub vai forcar Fsr4Update=true e UpscalerIndex=0 para testar FSR4.')
    } else {
      notes.push('Perfil FSR4 RDNA3 selecionado, mas a deteccao nao confirmou RDNA3.')
    }
  }
  if (selectedLoaderConflict) notes.push(`${requestedLoader} ja existe e nao parece ser OptiScaler. A aplicacao fara backup antes de sobrescrever.`)
  if (includeAgilitySdk) notes.push('D3D12_Optiscaler sera instalado para o modo FSR4/Agility SDK.')

  const iniPatch = buildIniPatch({ upscaler, inputApi: resolvedInputApi, gpu, includeAgilitySdk })

  return {
    ok: true,
    source: {
      path: releaseDir,
      exists: sourceOk,
      version: await getSourceVersion(app)
    },
    game: {
      id: gameId,
      name: String(game?.name ?? path.basename(targetExePath, '.exe')),
      exePath,
      targetExePath,
      workingDir: workingDir || path.dirname(exePath),
      targetDir
    },
    os: {
      platform: process.platform,
      release: os.release(),
      windowsBuild: getWindowsBuild(),
      isWindows11OrNewer: isWindows11OrNewer()
    },
    gpu,
    detected,
    detectedVersions: versions,
    installed,
    manifest,
    choices: {
      loader: requestedLoader,
      loaderReason: autoLoader.reason,
      preferredLoader,
      upscaler,
      inputApi,
      resolvedInputApi,
      includeAgilitySdk,
      applyOnLaunch: Boolean(payload?.applyOnLaunch ?? game?.optiscaler?.applyOnLaunch),
      iniPatch
    },
    conflicts: {
      selectedLoader: selectedLoaderConflict,
      legacy: legacyConflicts
    },
    unrealCandidates,
    notes
  }
}

async function backupPathIfExists(targetPath, backupDir, manifest) {
  if (!(await exists(targetPath))) return false
  const name = path.basename(targetPath)
  const dest = path.join(backupDir, name)
  const stat = await fs.lstat(targetPath)
  if (stat.isDirectory()) await fs.cp(targetPath, dest, { recursive: true, force: true })
  else await fs.copyFile(targetPath, dest)
  manifest.backedUp.push({ path: targetPath, backupPath: dest, type: stat.isDirectory() ? 'directory' : 'file' })
  return true
}

async function copySourceRootFiles(releaseDir, targetDir, backupDir, manifest) {
  const entries = await fs.readdir(releaseDir, { withFileTypes: true })
  const copied = []
  for (const entry of entries) {
    if (!entry.isFile() || ROOT_EXCLUDES.has(entry.name)) continue
    const lower = entry.name.toLowerCase()
    if (!lower.endsWith('.dll') && !lower.endsWith('.ini') && lower !== 'fakenvapi.ini') continue
    const src = path.join(releaseDir, entry.name)
    const dest = path.join(targetDir, entry.name)
    await backupPathIfExists(dest, backupDir, manifest)
    await fs.copyFile(src, dest)
    copied.push({ source: src, path: dest })
  }
  return copied
}

async function copySourceDirectory(releaseDir, targetDir, name, backupDir, manifest) {
  const src = path.join(releaseDir, name)
  if (!(await exists(src))) return null
  const dest = path.join(targetDir, name)
  await backupPathIfExists(dest, backupDir, manifest)
  await fs.cp(src, dest, { recursive: true, force: true })
  return { source: src, path: dest }
}

function isSameInstall(analysis, payload) {
  if (!payload?.onlyIfNeeded) return false
  const manifest = analysis.manifest
  if (!manifest?.optiscaler) return false
  const opti = manifest.optiscaler
  const loaderPath = path.join(analysis.game.targetDir, analysis.choices.loader)
  return (
    opti.sourceVersion === analysis.source.version &&
    opti.loader === analysis.choices.loader &&
    opti.upscaler === analysis.choices.upscaler &&
    opti.inputApi === analysis.choices.resolvedInputApi &&
    fsRaw.existsSync(loaderPath) &&
    fsRaw.existsSync(path.join(analysis.game.targetDir, 'OptiScaler.ini'))
  )
}

async function applyOptiScaler(app, getLibraryStore, payload = {}) {
  const analysis = await buildAnalysis(app, payload)
  if (!analysis.ok) return analysis
  if (!analysis.source.exists) return { ok: false, error: `Release local do OptiScaler nao encontrada em: ${analysis.source.path}`, analysis }
  if (isSameInstall(analysis, payload)) return { ok: true, skipped: true, reason: 'Instalacao ja esta atualizada.', analysis }

  const targetDir = analysis.game.targetDir
  if (!(await exists(targetDir))) return { ok: false, error: `Pasta alvo nao encontrada: ${targetDir}`, analysis }
  const parsed = path.parse(targetDir)
  if (normalizeWinPath(targetDir) === normalizeWinPath(parsed.root)) {
    return { ok: false, error: 'A pasta alvo nao pode ser a raiz do disco.', analysis }
  }

  const backupRoot = path.join(targetDir, 'OptiScaler_Backups')
  const backupDir = path.join(backupRoot, nowStamp())
  await fs.mkdir(backupDir, { recursive: true })

  const manifest = {
    createdAt: new Date().toISOString(),
    backupDir,
    backedUp: [],
    copied: [],
    optiscaler: {
      sourceVersion: analysis.source.version,
      sourcePath: analysis.source.path,
      loader: analysis.choices.loader,
      upscaler: analysis.choices.upscaler,
      inputApi: analysis.choices.resolvedInputApi,
      includeAgilitySdk: analysis.choices.includeAgilitySdk
    }
  }

  try {
    const copiedRoot = await copySourceRootFiles(analysis.source.path, targetDir, backupDir, manifest)
    manifest.copied.push(...copiedRoot)

    const loaderDest = path.join(targetDir, analysis.choices.loader)
    await backupPathIfExists(loaderDest, backupDir, manifest)
    await fs.copyFile(path.join(analysis.source.path, 'OptiScaler.dll'), loaderDest)
    manifest.copied.push({ source: path.join(analysis.source.path, 'OptiScaler.dll'), path: loaderDest, renamedTo: analysis.choices.loader })

    const licenses = await copySourceDirectory(analysis.source.path, targetDir, 'Licenses', backupDir, manifest)
    if (licenses) manifest.copied.push(licenses)

    if (analysis.choices.includeAgilitySdk) {
      const agility = await copySourceDirectory(analysis.source.path, targetDir, 'D3D12_Optiscaler', backupDir, manifest)
      if (agility) manifest.copied.push(agility)
    }

    const iniPath = path.join(targetDir, 'OptiScaler.ini')
    const iniRaw = await fs.readFile(iniPath, 'utf8')
    const patched = applyIniPatch(iniRaw, analysis.choices.iniPatch)
    await fs.writeFile(iniPath, patched, 'utf8')

    await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    await fs.writeFile(path.join(targetDir, MANIFEST_FILE), JSON.stringify({
      ...manifest,
      backupDir,
      lastAppliedAt: new Date().toISOString()
    }, null, 2), 'utf8')

    const gameId = analysis.game.id
    const applyOnLaunch = Boolean(payload?.applyOnLaunch)
    if (gameId && getLibraryStore) {
      const { loadLibrary, upsertGame } = await getLibraryStore()
      const lib = await loadLibrary(app)
      const game = lib.games.find((g) => g.id === gameId)
      if (game) {
        await upsertGame(app, {
          ...game,
          workingDir: game.workingDir || path.dirname(game.exePath),
          optiscaler: {
            ...(game.optiscaler ?? {}),
            enabled: true,
            applyOnLaunch,
            targetDir,
            loader: analysis.choices.loader,
            upscaler: analysis.choices.upscaler,
            inputApi: analysis.choices.resolvedInputApi,
            includeAgilitySdk: analysis.choices.includeAgilitySdk,
            sourceVersion: analysis.source.version,
            lastInstalledAt: Date.now()
          }
        })
      }
    }

    return { ok: true, analysis, backupDir, manifest }
  } catch (err) {
    manifest.error = err?.message ?? String(err)
    try {
      await fs.writeFile(path.join(backupDir, 'manifest.failed.json'), JSON.stringify(manifest, null, 2), 'utf8')
    } catch {}
    return { ok: false, error: manifest.error, analysis, backupDir, manifest }
  }
}

async function restoreBackup(app, getLibraryStore, payload = {}) {
  const targetDir = normalizeWinPath(payload?.targetDir || path.dirname(String(payload?.exePath ?? '')))
  if (!targetDir || !(await exists(targetDir))) return { ok: false, error: 'Pasta alvo do jogo nao encontrada.' }

  const backupId = payload?.backupId || payload?.id
  const backupRoot = path.join(targetDir, 'OptiScaler_Backups')
  let backupDir = payload?.backupPath ? normalizeWinPath(payload.backupPath) : null
  if (!backupDir && backupId) {
    backupDir = path.join(backupRoot, backupId)
  }

  if (!backupDir || !(await exists(backupDir))) {
    const listRes = await listBackups(payload)
    if (listRes.ok && listRes.backups.length > 0) {
      backupDir = listRes.backups[0].path
    }
  }

  if (!backupDir || !(await exists(backupDir))) {
    return { ok: false, error: 'Nenhum backup valido encontrado para restaurar.' }
  }

  const manifest = (await readJsonIfExists(path.join(backupDir, 'manifest.json'))) ||
                   (await readJsonIfExists(path.join(backupDir, 'manifest.failed.json')))

  const restored = []
  const removed = []

  try {

    if (manifest && Array.isArray(manifest.backedUp)) {
      for (const item of manifest.backedUp) {
        if (await exists(item.backupPath)) {
          const stat = await fs.lstat(item.backupPath)
          if (stat.isDirectory()) {
            await fs.cp(item.backupPath, item.path, { recursive: true, force: true })
          } else {
            await fs.copyFile(item.backupPath, item.path)
          }
          restored.push(item.path)
        }
      }
    }

    const filesToClean = [
      'OptiScaler.dll', 'OptiScaler.ini', 'OptiScaler.log', 'OptiScaler.asi',
      'DarkHubOptiScaler.json', 'fakenvapi.ini', 'nvngx.ini'
    ]
    for (const loader of SUPPORTED_LOADERS) {
      filesToClean.push(loader)
    }

    if (manifest && Array.isArray(manifest.copied)) {
      for (const item of manifest.copied) {
        const dest = item.path || item.dest
        if (dest && typeof dest === 'string') {
          const wasBackedUp = manifest.backedUp?.some((b) => normalizeWinPath(b.path) === normalizeWinPath(dest))
          if (!wasBackedUp && (await exists(dest))) {
            const stat = await fs.lstat(dest)
            if (stat.isDirectory()) {
              await fs.rm(dest, { recursive: true, force: true })
            } else {
              await fs.unlink(dest)
            }
            removed.push(dest)
          }
        }
      }
    } else {
      for (const f of filesToClean) {
        const p = path.join(targetDir, f)
        if (await exists(p)) {
          try {
            await fs.unlink(p)
            removed.push(p)
          } catch {}
        }
      }
    }

    for (const dirName of ['D3D12_Optiscaler', 'Licenses']) {
      const p = path.join(targetDir, dirName)
      if (await exists(p)) {
        try {
          await fs.rm(p, { recursive: true, force: true })
          removed.push(p)
        } catch {}
      }
    }

    const localManifest = path.join(targetDir, MANIFEST_FILE)
    if (await exists(localManifest)) {
      try { await fs.unlink(localManifest) } catch {}
    }

    const gameId = payload?.gameId || payload?.game?.id
    if (gameId && getLibraryStore) {
      const { loadLibrary, upsertGame } = await getLibraryStore()
      const lib = await loadLibrary(app)
      const game = lib.games.find((g) => g.id === gameId)
      if (game) {
        await upsertGame(app, {
          ...game,
          optiscaler: {
            ...(game.optiscaler ?? {}),
            enabled: false,
            lastRestoredAt: Date.now()
          }
        })
      }
    }

    return { ok: true, message: 'Backup restaurado com sucesso.', restored, removed, backupDir }
  } catch (err) {
    return { ok: false, error: `Falha na restauracao: ${err?.message ?? String(err)}` }
  }
}

async function deleteBackup(payload = {}) {
  const targetDir = normalizeWinPath(payload?.targetDir || path.dirname(String(payload?.exePath ?? '')))
  const backupId = payload?.backupId || payload?.id
  const backupRoot = path.join(targetDir, 'OptiScaler_Backups')
  const backupDir = payload?.backupPath ? normalizeWinPath(payload.backupPath) : path.join(backupRoot, backupId || '')

  if (!backupDir || !(await exists(backupDir))) {
    return { ok: false, error: 'Pasta de backup nao encontrada.' }
  }

  try {
    await fs.rm(backupDir, { recursive: true, force: true })
    return { ok: true, message: 'Backup excluido com sucesso.' }
  } catch (err) {
    return { ok: false, error: `Falha ao excluir backup: ${err?.message ?? String(err)}` }
  }
}

async function createManualBackup(payload = {}) {
  const targetDir = normalizeWinPath(payload?.targetDir || path.dirname(String(payload?.exePath ?? '')))
  if (!targetDir || !(await exists(targetDir))) return { ok: false, error: 'Pasta alvo nao encontrada.' }

  const backupRoot = path.join(targetDir, 'OptiScaler_Backups')
  const backupDir = path.join(backupRoot, 'manual_' + nowStamp())
  await fs.mkdir(backupDir, { recursive: true })

  const manifest = {
    createdAt: new Date().toISOString(),
    isManual: true,
    backupDir,
    backedUp: [],
    copied: []
  }

  try {
    const potentialFiles = [
      ...SUPPORTED_LOADERS,
      'OptiScaler.ini', 'nvngx.dll', 'nvapi64.dll', 'dxgi.dll', 'd3d12.dll',
      'version.dll', 'winmm.dll', 'dbghelp.dll', 'wininet.dll', 'winhttp.dll'
    ]

    for (const f of potentialFiles) {
      const p = path.join(targetDir, f)
      if (await exists(p)) {
        await backupPathIfExists(p, backupDir, manifest)
      }
    }

    await fs.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
    return { ok: true, backupDir, manifest }
  } catch (err) {
    return { ok: false, error: `Falha ao criar backup manual: ${err?.message ?? String(err)}` }
  }
}

export function registerOptiScalerIPC({ app, ipcMain, getLibraryStore }) {
  ipcMain.handle('optiscaler:analyze', async (_event, payload) => {
    try {
      return await buildAnalysis(app, payload)
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('optiscaler:apply', async (_event, payload) => {
    try {
      return await applyOptiScaler(app, getLibraryStore, payload)
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('optiscaler:listBackups', async (_event, payload) => {
    try {
      return await listBackups(payload)
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('optiscaler:restoreBackup', async (_event, payload) => {
    try {
      return await restoreBackup(app, getLibraryStore, payload)
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('optiscaler:deleteBackup', async (_event, payload) => {
    try {
      return await deleteBackup(payload)
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('optiscaler:createManualBackup', async (_event, payload) => {
    try {
      return await createManualBackup(payload)
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('optiscaler:checkUpdate', async () => {
    try {
      const https = await import('https');
      return await new Promise((resolve) => {
        const req = https.get('https://api.github.com/repos/optiscaler/OptiScaler/releases/latest', {
          headers: { 'User-Agent': 'DarkHub' }
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', async () => {
            if (res.statusCode !== 200) {
              return resolve({ ok: false, error: 'Erro GitHub API: ' + res.statusCode });
            }
            try {
              const json = JSON.parse(data);
              const version = json.tag_name || json.name;
              const current = await getSourceVersion(app);

              const asset = json.assets?.find(a => a.name.match(/\.(zip|7z)$/i));
              if (!asset) return resolve({ ok: false, error: 'Nenhum ZIP/7Z encontrado no release.' });

              resolve({
                ok: true,
                hasUpdate: version !== current,
                latestVersion: version,
                currentVersion: current,
                downloadUrl: asset.browser_download_url
              });
            } catch (e) {
              resolve({ ok: false, error: 'Erro de Parse JSON' });
            }
          });
        });
        req.on('error', err => resolve({ ok: false, error: err.message }));
      });
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) }
    }
  })

  ipcMain.handle('optiscaler:downloadUpdate', async (_event, payload) => {
    try {
      const downloadUrl = payload?.url || payload;
      const targetVersion = payload?.version || '';
      const https = await import('https');
      const http = await import('http');
      const os = await import('os');
      const fsRaw = await import('fs');

      const ext = String(downloadUrl).toLowerCase().endsWith('.7z') ? '.7z' : '.zip';
      const targetZip = path.join(os.tmpdir(), 'OptiScaler-Update-' + Date.now() + ext);
      const destDir = resolveReleaseDir(app);

      const downloadFileWithRedirects = (url, dest, maxRedirects = 5) => {
        return new Promise((resolve, reject) => {
          if (maxRedirects <= 0) return reject(new Error('Muitos redirecionamentos ao baixar OptiScaler.'));
          const client = url.startsWith('https:') ? https : http;
          const req = client.get(url, { headers: { 'User-Agent': 'DarkHub' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              return resolve(downloadFileWithRedirects(res.headers.location, dest, maxRedirects - 1));
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`Servidor respondeu com status ${res.statusCode}`));
            }
            const fileStream = fsRaw.createWriteStream(dest);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
              fileStream.close(() => resolve());
            });
            fileStream.on('error', (err) => {
              fsRaw.unlink(dest, () => {});
              reject(err);
            });
          });
          req.on('error', reject);
        });
      };

      await downloadFileWithRedirects(downloadUrl, targetZip);
      await fs.mkdir(destDir, { recursive: true });

      let extracted = false;

      try {
        await execFileAsync('tar.exe', ['-xf', targetZip, '-C', destDir], { windowsHide: true });
        extracted = true;
      } catch {}

      if (!extracted && ext === '.zip') {
        try {
          const script = `Expand-Archive -Path "${targetZip}" -DestinationPath "${destDir}" -Force`;
          await runPowerShellJson(script);
          extracted = true;
        } catch {}
      }

      const files = await fs.readdir(destDir, { recursive: true });
      const hasDll = files.some(f => {
        const name = path.basename(f).toLowerCase();
        return name === 'optiscaler.dll' || name === 'nvngx.dll' || name === 'dxgi.dll';
      });

      fsRaw.unlink(targetZip, () => {});

      if (!hasDll) {
        return { ok: false, error: 'Atualização falhou: DLL principal não encontrada no pacote extraído.' };
      }

      if (targetVersion) {
        await fs.writeFile(path.join(destDir, 'version.txt'), targetVersion, 'utf8');
      }

      return { ok: true };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  })
}
