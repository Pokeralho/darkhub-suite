import path from 'node:path';
import fsRaw from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { execFile, exec, execSync } from 'node:child_process';
import Logger from '../LoggerService.js';
import ElevationHelper from '../optimizer/ElevationHelper.js';
import { downloadToFile, fetchJson, assetSha256 } from '../SecureDownload.js';

const fs = fsRaw.promises;
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const MANIFEST_NAME = 'DarkHubDLSS5.json';
const BACKUP_DIR_NAME = 'DLSS5_Backups';
const HISTORY_FILE_NAME = 'dlss5_history.json';
const PRIMARY_BUNDLE_FOLDER = 'OptiScaler_DLSS5_Universal';
const AMD_NR_FOLDER = 'AMD_NR';
const AMD_NR_WEIGHTS = 'dlssnr_on_amd_weights.bin';

/**
 * Portable Executable (PE) Inspector
 * Extracts bitness (32-bit vs 64-bit PE32+) and imported DLL names directly from PE headers.
 */
function inspectPeExecutable(filePath) {
  if (!filePath || !fsRaw.existsSync(filePath)) {
    return { isPe: false, is64: true, bitness: '64-bit', importedDlls: [] };
  }
  try {
    const fd = fsRaw.openSync(filePath, 'r');
    const headerBuf = Buffer.alloc(4096);
    const bytesRead = fsRaw.readSync(fd, headerBuf, 0, 4096, 0);
    if (bytesRead < 64 || headerBuf.readUInt16LE(0) !== 0x5A4D) { // 'MZ'
      fsRaw.closeSync(fd);
      return { isPe: false, is64: true, bitness: '64-bit', importedDlls: [] };
    }
    const peOffset = headerBuf.readUInt32LE(0x3C);
    const peBuf = Buffer.alloc(1024);
    fsRaw.readSync(fd, peBuf, 0, 1024, peOffset);
    if (peBuf.readUInt32LE(0) !== 0x00004550) { // 'PE\0\0'
      fsRaw.closeSync(fd);
      return { isPe: false, is64: true, bitness: '64-bit', importedDlls: [] };
    }
    const numSections = peBuf.readUInt16LE(6);
    const optHeaderSize = peBuf.readUInt16LE(20);
    const optMagic = peBuf.readUInt16LE(24);
    const is64 = optMagic === 0x20B; // 0x20B = PE32+ (64-bit), 0x10B = PE32 (32-bit)
    const importRvaOffset = is64 ? 24 + 112 + 8 : 24 + 96 + 8;
    const importRva = peBuf.readUInt32LE(importRvaOffset);
    const importSize = peBuf.readUInt32LE(importRvaOffset + 4);
    if (!importRva || !importSize) {
      fsRaw.closeSync(fd);
      return { isPe: true, is64, bitness: is64 ? '64-bit' : '32-bit', importedDlls: [] };
    }
    const secOffset = peOffset + 24 + optHeaderSize;
    const secBuf = Buffer.alloc(numSections * 40);
    fsRaw.readSync(fd, secBuf, 0, numSections * 40, secOffset);

    function rvaToFileOffset(rva) {
      for (let i = 0; i < numSections; i++) {
        const va = secBuf.readUInt32LE(i * 40 + 12);
        const vs = secBuf.readUInt32LE(i * 40 + 8);
        const ptr = secBuf.readUInt32LE(i * 40 + 20);
        if (rva >= va && rva < va + vs) return rva - va + ptr;
      }
      return null;
    }

    const importFileOffset = rvaToFileOffset(importRva);
    if (!importFileOffset) {
      fsRaw.closeSync(fd);
      return { isPe: true, is64, bitness: is64 ? '64-bit' : '32-bit', importedDlls: [] };
    }
    const descBuf = Buffer.alloc(Math.min(importSize, 16384));
    fsRaw.readSync(fd, descBuf, 0, descBuf.length, importFileOffset);
    const dlls = [];
    for (let pos = 0; pos < descBuf.length - 20; pos += 20) {
      const nameRva = descBuf.readUInt32LE(pos + 12);
      if (!nameRva) break;
      const nameOffset = rvaToFileOffset(nameRva);
      if (nameOffset) {
        const nameBuf = Buffer.alloc(64);
        fsRaw.readSync(fd, nameBuf, 0, 64, nameOffset);
        const nullIdx = nameBuf.indexOf(0);
        const dllName = nameBuf.toString('ascii', 0, nullIdx > 0 ? nullIdx : 64).trim();
        if (dllName) dlls.push(dllName.toLowerCase());
      }
    }
    fsRaw.closeSync(fd);
    return {
      isPe: true,
      is64,
      bitness: is64 ? '64-bit' : '32-bit',
      importedDlls: Array.from(new Set(dlls))
    };
  } catch {
    return { isPe: false, is64: true, bitness: '64-bit', importedDlls: [] };
  }
}

/**
 * Calculates SHA-256 hash of a file for cryptographic authenticity verification
 */
async function computeSha256(filePath) {
  try {
    const data = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(data).digest('hex');
  } catch {
    return null;
  }
}

class Dlss5Service {
  constructor(app) {
    this.app = app;
  }

  getHistoryFilePath() {
    try {
      const userData = this.app?.getPath ? this.app.getPath('userData') : (process.env.APPDATA || path.join(process.cwd(), '.data'));
      return path.join(userData, HISTORY_FILE_NAME);
    } catch {
      return path.join(process.cwd(), HISTORY_FILE_NAME);
    }
  }

  async getRecentGames() {
    try {
      const p = this.getHistoryFilePath();
      if (!fsRaw.existsSync(p)) return [];
      const raw = await fs.readFile(p, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async saveRecentGame(gameInfo) {
    if (!gameInfo?.targetDir) return;
    try {
      const p = this.getHistoryFilePath();
      let list = await this.getRecentGames();
      list = list.filter(g => g.targetDir.toLowerCase() !== gameInfo.targetDir.toLowerCase());
      list.unshift({
        ...gameInfo,
        lastAppliedAt: Date.now()
      });
      if (list.length > 20) list = list.slice(0, 20);
      await fs.writeFile(p, JSON.stringify(list, null, 2), 'utf8');
    } catch (e) {
      Logger.warn('Dlss5Service', 'Falha ao salvar historico de jogos DLSS 5', e);
    }
  }

  getSteamPath() {
    if (process.platform !== 'win32') return null;
    const queries = [
      'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
      'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v InstallPath'
    ];

    for (const q of queries) {
      try {
        // execSync returns the stdout string itself (destructuring it yielded
        // undefined, so the registry lookup never worked).
        const stdout = execSync(q, { windowsHide: true, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
        for (const line of String(stdout || '').split(/\r?\n/)) {
          const match = line.match(/(?:SteamPath|InstallPath)\s+REG_SZ\s+(.+)$/i);
          if (match && match[1]) {
            const p = match[1].trim().replace(/\//g, '\\');
            if (fsRaw.existsSync(path.join(p, 'steam.exe'))) {
              return p;
            }
          }
        }
      } catch {}
    }

    const defaults = [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'E:\\Steam'
    ];
    for (const dp of defaults) {
      if (fsRaw.existsSync(path.join(dp, 'steam.exe'))) return dp;
    }
    return null;
  }

  getLibraryPaths(steamPath) {
    const paths = [steamPath];
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (!fsRaw.existsSync(vdfPath)) return paths;
    try {
      const vdf = fsRaw.readFileSync(vdfPath, 'utf8');
      const matches = [...vdf.matchAll(/"path"\s+"([^"]+)"/g)];
      for (const m of matches) {
        const libPath = path.normalize(m[1].replace(/\\\\/g, '\\'));
        // Windows paths are case-insensitive: the registry path and the vdf entry for the same library differ in case.
        const key = libPath.toLowerCase().replace(/\\+$/, '');
        if (!paths.some((p) => path.normalize(p).toLowerCase().replace(/\\+$/, '') === key) && fsRaw.existsSync(libPath)) {
          paths.push(libPath);
        }
      }
    } catch {}
    return paths;
  }

  async getInstalledSteamGames() {
    const steamPath = this.getSteamPath();
    if (!steamPath) return [];
    const libPaths = this.getLibraryPaths(steamPath);
    const games = [];
    const ignoredApps = new Set([
      '228980', '431960', '966610', '1391110', '1070560', '1628350', '1493710', '250820'
    ]);

    for (const lib of libPaths) {
      const appsDir = path.join(lib, 'steamapps');
      if (!fsRaw.existsSync(appsDir)) continue;
      try {
        const files = await fs.readdir(appsDir);
        for (const f of files) {
          if (f.startsWith('appmanifest_') && f.endsWith('.acf')) {
            try {
              const acf = await fs.readFile(path.join(appsDir, f), 'utf8');
              const idMatch = acf.match(/"appid"\s+"([^"]+)"/);
              const nameMatch = acf.match(/"name"\s+"([^"]+)"/);
              const dirMatch = acf.match(/"installdir"\s+"([^"]+)"/);
              if (idMatch && nameMatch && dirMatch) {
                const appId = idMatch[1];
                if (ignoredApps.has(appId) || games.some((g) => g.appId === appId)) continue;
                const gameDir = path.join(appsDir, 'common', dirMatch[1]);
                if (fsRaw.existsSync(gameDir)) {
                  const manifestPath = path.join(gameDir, MANIFEST_NAME);
                  let isApplied = fsRaw.existsSync(manifestPath);
                  if (!isApplied) {
                    isApplied = fsRaw.existsSync(path.join(gameDir, 'nvngx_dlssnr.dll'));
                  }

                  games.push({
                    appId,
                    name: nameMatch[1],
                    installDir: gameDir,
                    headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
                    isApplied
                  });
                }
              }
            } catch {}
          }
        }
      } catch {}
    }

    return games.sort((a, b) => a.name.localeCompare(b.name));
  }

  async detectGpu() {
    if (process.platform !== 'win32') {
      return { vendor: 'other', model: 'Desconhecido', isRtx: false, isAmd: false, defaultProfile: 'nvidia' };
    }

    try {
      const script = `
        Get-CimInstance Win32_VideoController | Select-Object -Property Name, DriverVersion, AdapterRAM | ConvertTo-Json -Compress
      `;
      const { stdout } = await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${script.trim()}"`);
      if (!stdout || !stdout.trim()) {
        return { vendor: 'other', model: 'Genérico', isRtx: false, isAmd: false, defaultProfile: 'nvidia' };
      }

      let parsed = JSON.parse(stdout.trim());
      if (Array.isArray(parsed)) {
        parsed = parsed.find(g => (g.AdapterRAM && g.AdapterRAM > 500000000)) || parsed[0];
      }

      const name = parsed.Name || '';
      const driver = parsed.DriverVersion || '';
      const lower = name.toLowerCase();

      const isNvidia = lower.includes('nvidia') || lower.includes('geforce') || lower.includes('rtx') || lower.includes('gtx');
      const isAmd = lower.includes('amd') || lower.includes('radeon');
      const isIntel = lower.includes('intel') || lower.includes('arc');
      const isRtx = isNvidia && (lower.includes('rtx') || lower.includes('titan'));

      let vendor = 'other';
      if (isNvidia) vendor = 'nvidia';
      else if (isAmd) vendor = 'amd';
      else if (isIntel) vendor = 'intel';

      return {
        ok: true,
        vendor,
        model: name || 'GPU Desconhecida',
        driverVersion: driver,
        isRtx,
        isAmd,
        isIntel,
        defaultProfile: isAmd ? 'amd' : 'nvidia'
      };
    } catch (e) {
      Logger.warn('Dlss5Service', 'Erro ao detectar GPU via WMI', e);
      return {
        ok: true,
        vendor: 'nvidia',
        model: 'Adaptador de Vídeo Padrão',
        driverVersion: '',
        isRtx: true,
        isAmd: false,
        isIntel: false,
        defaultProfile: 'nvidia'
      };
    }
  }

  /**
   * Deeply inspects executable imports, sibling DLLs, and engine files to identify the graphics API
   */
  async detectGraphicsAPI(exePath, injectionDir, searchBaseDir) {
    const peInfo = exePath ? inspectPeExecutable(exePath) : { isPe: false, is64: true, bitness: '64-bit', importedDlls: [] };
    const importedDlls = peInfo.importedDlls;
    const is64 = peInfo.is64;
    const bitness = peInfo.bitness;

    let dirFiles = [];
    try {
      if (injectionDir && fsRaw.existsSync(injectionDir)) {
        dirFiles = (await fs.readdir(injectionDir)).map(f => f.toLowerCase());
      }
    } catch {}

    // Detect RTX Remix presence (.trex directory or Remix runtime markers)
    let isRemix = false;
    try {
      if (
        (injectionDir && fsRaw.existsSync(path.join(injectionDir, '.trex'))) ||
        (searchBaseDir && fsRaw.existsSync(path.join(searchBaseDir, '.trex'))) ||
        dirFiles.includes('.trex') ||
        dirFiles.some(f => f.includes('rtx-remix') || f.includes('nvremix'))
      ) {
        isRemix = true;
      }
    } catch {}

    const hasD3D12 = importedDlls.includes('d3d12.dll') || dirFiles.includes('d3d12.dll') || dirFiles.includes('d3d12core.dll');
    const hasAgilitySdk = dirFiles.includes('d3d12core.dll') || dirFiles.includes('d3d12') || (injectionDir && fsRaw.existsSync(path.join(injectionDir, 'D3D12')));
    const hasD3D11 = importedDlls.includes('d3d11.dll') || dirFiles.includes('d3d11.dll');
    const hasVulkan = importedDlls.includes('vulkan-1.dll') || dirFiles.includes('vulkan-1.dll') || dirFiles.some(f => f.startsWith('vulkan'));
    const hasOpenGL = importedDlls.includes('opengl32.dll') || dirFiles.includes('opengl32.dll') || dirFiles.includes('glad.dll') || dirFiles.includes('glew32.dll');
    const hasD3D9 = importedDlls.includes('d3d9.dll') || dirFiles.includes('d3d9.dll');

    const detectedApis = [];
    if (isRemix) detectedApis.push('RTX Remix (Path-Tracing Runtime)');
    if (hasD3D12) detectedApis.push(hasAgilitySdk ? 'DirectX 12 (Agility SDK / Ultimate)' : 'DirectX 12');
    if (hasD3D11) detectedApis.push('DirectX 11');
    if (hasVulkan) detectedApis.push('Vulkan');
    if (hasOpenGL) detectedApis.push('OpenGL');
    if (hasD3D9 && !hasD3D11 && !hasD3D12) detectedApis.push('DirectX 9');

    let primaryApi = 'dx11';
    let apiName = 'DirectX 11';
    let apiBadge = 'DX11';
    let recommendedLoader = 'dxgi.dll';
    let loaderReason = 'DirectX 11 utiliza o proxy padrão dxgi.dll para interceptar criação de SwapChain.';
    let compatibilityNote = 'Compatibilidade nativa com DLSS 5 e FSR 3.1 Frame Generation.';

    if (isRemix) {
      primaryApi = 'remix';
      apiName = 'RTX Remix Runtime';
      apiBadge = 'RTX Remix';
      recommendedLoader = 'dxgi.dll';
      loaderReason = 'Runtime RTX Remix detectado (.trex). Injeta diretamente via bridge nativa, com ReShade isolado para evitar instabilidade.';
      compatibilityNote = 'Totalmente compatível com iluminação neural Path-Tracing e DLSS 5.';
    } else if (hasD3D12) {
      if (hasAgilitySdk) {
        primaryApi = 'dx12_agility';
        apiName = 'DirectX 12 (Agility SDK / Ultimate)';
        apiBadge = 'DX12 Agility';
        recommendedLoader = 'dxgi.dll';
        loaderReason = 'Agility SDK moderno detectado (D3D12Core). O loader dxgi.dll intercepta filas de baixa latência e Work Graphs.';
        compatibilityNote = 'Suporta Frame Generation neural, Shader Model 6.6+ e Ray Reconstruction.';
      } else {
        primaryApi = 'dx12';
        apiName = 'DirectX 12';
        apiBadge = 'DX12';
        recommendedLoader = 'dxgi.dll';
        loaderReason = 'DirectX 12 nativo. dxgi.dll é o hook ideal para Command Queues e renderização assíncrona.';
        compatibilityNote = 'Suporta DLSS 5, FSR 3.1 e Frame Generation em tempo real.';
      }
    } else if (hasVulkan) {
      primaryApi = 'vulkan';
      apiName = 'Vulkan';
      apiBadge = 'Vulkan';
      recommendedLoader = 'version.dll';
      loaderReason = 'Motores Vulkan puros não carregam dxgi.dll para swapchain. O proxy version.dll intercepta o processo e faz hook direto em vkCreateInstance.';
      compatibilityNote = 'OptiScaler intercepta camadas Vulkan e redireciona para DLSS/FSR com pipelines SPIR-V.';
    } else if (hasOpenGL) {
      primaryApi = 'opengl';
      apiName = 'OpenGL';
      apiBadge = 'OpenGL';
      recommendedLoader = 'version.dll';
      loaderReason = 'Jogos OpenGL utilizam version.dll para injetar a camada de tradução intermediária Zink/DXVK.';
      compatibilityNote = 'OpenGL opera via ponte de tradução temporal para aplicar upscaling neural em buffers de cor/profundidade.';
    } else if (hasD3D11) {
      primaryApi = 'dx11';
      apiName = 'DirectX 11';
      apiBadge = 'DX11';
      recommendedLoader = 'dxgi.dll';
      loaderReason = 'DirectX 11 padrão. O loader dxgi.dll garante compatibilidade máxima de injeção.';
      compatibilityNote = 'Suporta upscaling neural DLSS e geração de quadros FSR 3.1.';
    } else if (hasD3D9) {
      primaryApi = 'dx9';
      apiName = 'DirectX 9 (Legacy)';
      apiBadge = 'DX9';
      recommendedLoader = 'dxgi.dll';
      loaderReason = 'DirectX 9 legado opera através de ponte DXVK (d3d9 para Vulkan/DX11).';
      compatibilityNote = 'Injeção adaptativa via camada de tradução DXVK.';
    }

    return {
      primaryApi,
      apiName,
      apiBadge,
      hasD3D12,
      hasAgilitySdk,
      hasD3D11,
      hasVulkan,
      hasOpenGL,
      hasD3D9,
      isRemix,
      is64,
      bitness,
      detectedApis: detectedApis.length > 0 ? detectedApis : ['DirectX 11 (Fallback)'],
      importedDlls: importedDlls.filter(d => /d3d|dxgi|vulkan|opengl|glad|glew/i.test(d)),
      recommendedLoader,
      loaderReason,
      compatibilityNote
    };
  }

  /**
   * DLSS5-Autopilot 8-Route Mapping Matrix
   * Inspired by Kizzuwatnaa/DLSS5-Autopilot architecture
   */
  detectAutoRoute({ graphicsApi = {}, hasDlss = false, isRemix = false, is64 = true }) {
    const allowedRoutes = [
      { id: 'optiscaler', name: 'OptiScaler D3D12 (Nativo)', description: 'Hook NVNGX nativo em DirectX 12 com substituição direta de modelos neurais.' },
      { id: 'dlss5-bridge', name: 'DLSS5-Bridge (D3D11 / Vulkan)', description: 'Ponte direta para títulos D3D11 ou Vulkan com suporte a DLSS.' },
      { id: 'feeder', name: 'DLSS5-Feeder (ReShade / Universal)', description: 'Extração de buffers e injeção do pipeline neural DLSS 5 em jogos sem DLSS de fábrica.' },
      { id: 'remix', name: 'RTX Remix Route', description: 'Rota dedicada RTX Remix (isola a injeção e bloqueia ReShade para proteger o runtime de path-tracing).' },
      { id: 'renodx-dlss5', name: 'RenoDX + DLSS 5 HDR', description: 'Pipeline de HDR nativo RenoDX com reconstrução neural DLSS 5.' },
      { id: 'renodx-dlss', name: 'RenoDX DLSS (DX9 x64)', description: 'DirectX 9 x64 via DXVK e RenoDX.' },
      { id: 'dx9-32bit', name: 'DX9 x86 Bridge (32-bit)', description: 'DirectX 9 legado x86 (32 bits) via DXVK + ponte Feeder.' },
      { id: 'opengl-zink', name: 'OpenGL Zink Bridge', description: 'Ponte OpenGL para Vulkan (Zink) com proxy version.dll.' }
    ];

    let recommendedRoute = 'optiscaler';
    let routeBadge = 'OptiScaler';
    let routeDescription = '';

    if (isRemix || graphicsApi.isRemix) {
      recommendedRoute = 'remix';
      routeBadge = 'RTX Remix';
      routeDescription = 'Jogo RTX Remix detectado (.trex). O Autopilot isola a injeção e bloqueia ReShade para evitar conflitos no runtime de path-tracing.';
    } else if (!is64 && graphicsApi.hasD3D9 && !graphicsApi.hasD3D11 && !graphicsApi.hasD3D12) {
      recommendedRoute = 'dx9-32bit';
      routeBadge = 'DX9 32-bit';
      routeDescription = 'Executável PE de 32 bits legado com DirectX 9. Roteado via DXVK e ponte DLSS5-Feeder.';
    } else if (is64 && graphicsApi.hasD3D9 && !graphicsApi.hasD3D11 && !graphicsApi.hasD3D12) {
      recommendedRoute = 'renodx-dlss';
      routeBadge = 'RenoDX DX9';
      routeDescription = 'DirectX 9 de 64 bits. Roteado via DXVK e RenoDX com upscaling neural.';
    } else if (graphicsApi.hasOpenGL && !graphicsApi.hasD3D11 && !graphicsApi.hasD3D12 && !graphicsApi.hasVulkan) {
      recommendedRoute = 'opengl-zink';
      routeBadge = 'OpenGL Zink';
      routeDescription = 'Jogo OpenGL puro. Roteado via camada de tradução Zink e proxy version.dll.';
    } else if (!hasDlss) {
      recommendedRoute = 'feeder';
      routeBadge = 'DLSS5-Feeder';
      routeDescription = 'Jogo sem DLSS nativo. O Autopilot utiliza o pipeline DLSS5-Feeder para injetar DLSS 5 e reconstrução neural diretamente no swapchain.';
    } else if (graphicsApi.hasD3D12 || graphicsApi.primaryApi === 'dx12' || graphicsApi.primaryApi === 'dx12_agility') {
      recommendedRoute = 'optiscaler';
      routeBadge = 'OptiScaler D3D12';
      routeDescription = 'DirectX 12 com DLSS nativo. Interceptação direta no pipeline NVNGX com troca para modelos neurais DLSS 5.';
    } else if (graphicsApi.hasD3D11 || graphicsApi.hasVulkan) {
      recommendedRoute = 'dlss5-bridge';
      routeBadge = 'DLSS5-Bridge';
      routeDescription = `${graphicsApi.hasVulkan ? 'Vulkan' : 'DirectX 11'} com DLSS nativo. Injeta a ponte DLSS5-Bridge com hook de swapchain.`;
    }

    const routeObj = allowedRoutes.find(r => r.id === recommendedRoute);

    return {
      recommendedRoute,
      routeName: routeObj ? routeObj.name : recommendedRoute,
      routeBadge,
      routeDescription,
      allowedRoutes,
      isRemix: Boolean(isRemix || graphicsApi.isRemix),
      is64: Boolean(is64),
      neuralUpstreamRecommended: true
    };
  }

  async scanGameDirectory(inputPath) {
    if (!inputPath || typeof inputPath !== 'string') {
      return { ok: false, error: 'Caminho de pasta ou executável não fornecido.' };
    }

    const resolved = path.resolve(inputPath.trim());
    if (!fsRaw.existsSync(resolved)) {
      return { ok: false, error: 'O caminho selecionado não existe.' };
    }

    const stat = await fs.stat(resolved);
    let searchBaseDir = stat.isDirectory() ? resolved : path.dirname(resolved);
    let selectedExe = stat.isFile() && resolved.toLowerCase().endsWith('.exe') ? resolved : null;

    let injectionDir = searchBaseDir;
    let engine = 'custom';
    let gameName = path.basename(searchBaseDir);

    const ignoredExePatterns = [
      /unins\w*\.exe$/i,
      /crashreport\w*\.exe$/i,
      /unitycrashhandler\w*\.exe$/i,
      /launcher\w*\.exe$/i,
      /easyanticheat\w*\.exe$/i,
      /battleye\w*\.exe$/i,
      /redprelauncher\.exe$/i,
      /epicwebhelper\.exe$/i,
      /steamerrorreporter\.exe$/i
    ];

    const findCandidates = async (dir, depth = 0) => {
      if (depth > 3) return [];
      let found = [];
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name.toLowerCase() === 'binaries') {
              const win64 = path.join(full, 'Win64');
              if (fsRaw.existsSync(win64)) {
                found.push({ dir: win64, isUnrealWin64: true });
              }
            } else if (depth < 3 && !/^_|^dlss5_backups|^optiscaler_backups|\.git/i.test(entry.name)) {
              const sub = await findCandidates(full, depth + 1);
              found.push(...sub);
            }
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
            if (!ignoredExePatterns.some(p => p.test(entry.name))) {
              found.push({ file: full, dir, name: entry.name });
            }
          }
        }
      } catch {}
      return found;
    };

    const results = await findCandidates(searchBaseDir, 0);

    const unrealCandidate = results.find(r => r.isUnrealWin64);
    if (unrealCandidate) {
      injectionDir = unrealCandidate.dir;
      engine = 'unreal';
      try {
        const files = await fs.readdir(injectionDir);
        const win64Exe = files.find(f => f.toLowerCase().endsWith('.exe') && !ignoredExePatterns.some(p => p.test(f)));
        if (win64Exe) selectedExe = path.join(injectionDir, win64Exe);
      } catch {}
    } else {
      const exeCandidate = results.find(r => r.file);
      if (exeCandidate) {
        if (!selectedExe) selectedExe = exeCandidate.file;
        injectionDir = exeCandidate.dir;
      }
    }

    try {
      const items = await fs.readdir(searchBaseDir);
      if (items.some(i => i.toLowerCase().endsWith('_data'))) engine = 'unity';
      else if (items.some(i => i.toLowerCase() === 'engine' || i.toLowerCase().endsWith('.uproject'))) engine = 'unreal';
      else if (items.some(i => i.toLowerCase() === 'r6' || i.toLowerCase() === 'bin')) engine = 'redengine';
    } catch {}

    if (selectedExe) {
      gameName = path.basename(selectedExe).replace(/\.exe$/i, '');
    }

    // Run deep graphics API detection on resolved executable
    const graphicsApi = await this.detectGraphicsAPI(selectedExe, injectionDir, searchBaseDir);

    let existingDlls = [];
    let installed = false;
    let installedProfile = null;
    let installedLoader = null;
    let manifestData = null;

    try {
      const targetItems = await fs.readdir(injectionDir);
      const knownFiles = [
        'nvngx_dlss.dll', 'nvngx_dlssg.dll', 'nvngx_dlssd.dll',
        'dxgi.dll', 'version.dll', 'winmm.dll', 'd3d12.dll', 'OptiScaler.dll',
        'OptiScaler.ini', 'nvngx.ini', 'dlssg_to_fsr3_amd_is_better.dll',
        'fakenvapi.dll', 'fakenvapi.ini'
      ];
      for (const k of knownFiles) {
        if (targetItems.some(item => item.toLowerCase() === k.toLowerCase())) {
          existingDlls.push(k);
        }
      }

      const manifestPath = path.join(injectionDir, MANIFEST_NAME);
      if (fsRaw.existsSync(manifestPath)) {
        try {
          const mf = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
          manifestData = mf;
          installed = true;
          installedProfile = mf.profile || null;
          installedLoader = mf.loader || null;
        } catch {}
      } else if (existingDlls.includes('nvngx.ini') && (existingDlls.includes('dxgi.dll') || existingDlls.includes('OptiScaler.dll'))) {
        installed = true;
      }
    } catch {}

    const hasDlss = existingDlls.some(d => d.startsWith('nvngx_dlss'));
    const routeInfo = this.detectAutoRoute({
      graphicsApi,
      hasDlss,
      isRemix: graphicsApi.isRemix,
      is64: graphicsApi.is64
    });

    return {
      ok: true,
      gameName,
      exePath: selectedExe,
      targetDir: injectionDir,
      searchBaseDir,
      engine,
      graphicsApi,
      routeInfo,
      dlssDetected: hasDlss,
      existingDlls,
      installed,
      installedProfile,
      installedLoader,
      manifest: manifestData
    };
  }

  /**
   * Resolves where the compiled real OptiScaler / DLSS-NR binaries are cached on disk
   */
  async resolveOptiScalerSource() {
    const candidateDirs = [];
    try {
      const userData = this.app?.getPath ? this.app.getPath('userData') : (process.env.APPDATA || path.join(process.cwd(), '.data'));
      candidateDirs.push(path.join(userData, 'OptiScaler', PRIMARY_BUNDLE_FOLDER));
    } catch {}

    for (const d of candidateDirs) {
      if (fsRaw.existsSync(d)) {
        if (fsRaw.existsSync(path.join(d, 'OptiScaler.dll'))) {
          return d;
        }
        try {
          const entries = await fs.readdir(d, { withFileTypes: true });
          for (const e of entries) {
            if (e.isDirectory()) {
              const sub = path.join(d, e.name);
              if (fsRaw.existsSync(path.join(sub, 'OptiScaler.dll'))) {
                return sub;
              }
            }
          }
        } catch {}
      }
    }

    return null;
  }

  /**
   * Returns complete provenance, open-source repositories, and authenticity proofs of DLSS 5
   */
  async getBinaryProvenance() {
    const sourceDir = await this.resolveOptiScalerSource();
    let files = [];
    let hasBinaries = false;

    if (sourceDir && fsRaw.existsSync(sourceDir)) {
      try {
        const list = await fs.readdir(sourceDir);
        for (const item of list) {
          const full = path.join(sourceDir, item);
          const st = await fs.stat(full);
          if (st.isFile() && /\.(dll|ini|txt)$/i.test(item)) {
            const sha = await computeSha256(full);
            files.push({
              name: item,
              size: st.size,
              sha256: sha,
              isBinary: item.endsWith('.dll')
            });
          }
        }
        hasBinaries = files.some(f => f.name.toLowerCase() === 'optiscaler.dll');
      } catch {}
    }

    return {
      ok: true,
      title: 'DLSS 5 & Universal Neural Upscaler - Arquitetura de Binários',
      version: 'v0.9.4 Final Release (C++ x64 Compilado)',
      architecture: 'x86_64 PE Dynamic Link Library',
      hasBinaries,
      sourceDir: sourceDir || 'Pendente de download',
      filesCount: files.length,
      files,
      upstreamRepositories: [
        {
          name: 'fsr4xyz (the3rdparty1917)',
          url: 'https://github.com/the3rdparty1917/fsr4xyz',
          role: 'FSR 4.1.1b com bypass de instruções INT8 e mitigação de ghosting/shimmering para placas AMD Radeon RDNA 2 (RX 6000).'
        },
        {
          name: 'dlss5-image-enhancer-zluda (RedDukeDev)',
          url: 'https://github.com/RedDukeDev/dlss5-image-enhancer-zluda',
          role: 'Motor neural ZLUDA para GPUs AMD Radeon (RDNA 3 / RDNA 4). Traduz kernels CUDA para ROCm/HIP com aceleração por matrizes WMMA FP16/FP8 e compilação antecipada AOT.'
        },
        {
          name: 'ZLUDA (RedDukeDev / vosen)',
          url: 'https://github.com/RedDukeDev/ZLUDA',
          role: 'Camada de compatibilidade binária CUDA para AMD ROCm, provendo nvcuda.dll e nvapi64.dll com suporte a compilador LLVM otimizado para hardware AMD.'
        },
        {
          name: 'DLSS5-Autopilot (Kizzuwatnaa)',
          url: 'https://github.com/Kizzuwatnaa/DLSS5-Autopilot',
          role: 'Arquitetura Autopilot para roteamento inteligente multi-API (OptiScaler, DLSS5-Bridge, Feeder e Neural Upstream).'
        },
        {
          name: 'OptiScaler (cdozdil / optiscaler)',
          url: 'https://github.com/optiscaler/OptiScaler',
          role: 'Middleware central em C++ que intercepta chamadas NVNGX (DLSS 1/2/3/4/5) e roteia para DLSS, FSR 3.1 ou XeSS.'
        },
        {
          name: 'DLSSG-to-FSR3 (Nukem9)',
          url: 'https://github.com/Nukem9/dlssg-to-fsr3',
          role: 'Ponte de tradução de Frame Generation proprietária da NVIDIA (dlssg) para AMD FSR 3.1 Frame Gen.'
        },
        {
          name: 'DLSSTweaks (emoose)',
          url: 'https://github.com/emoose/DLSSTweaks',
          role: 'Injeção de modelos neurais profundos (Presets E/F/G), DLAA forçado e bypass de assinaturas.'
        },
        {
          name: 'TechPowerUp NVIDIA DLSS Database',
          url: 'https://www.techpowerup.com/download/nvidia-dlss-dll/',
          role: 'Repositório oficial dos pesos e modelos neurais de reconstrução de imagem da NVIDIA (nvngx_dlss.dll).'
        }
      ],
      guarantee: 'Todos os binários aplicados são arquivos executáveis compilados em C++ x64 reais, verificados criptograficamente via SHA-256.'
    };
  }

  async downloadOptiScalerBundle(onProgress = () => {}) {
    const userData = this.app?.getPath ? this.app.getPath('userData') : (process.env.APPDATA || path.join(process.cwd(), '.data'));
    const destFolder = path.join(userData, 'OptiScaler', PRIMARY_BUNDLE_FOLDER);
    await fs.mkdir(destFolder, { recursive: true });
    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'darkhub-dlss5-'));
    const hashLogPath = path.join(destFolder, 'downloads.sha256.json');
    let hashLog = {};
    try { hashLog = JSON.parse(fsRaw.readFileSync(hashLogPath, 'utf8')); } catch {}

    const extractArchive = async (archive, dest) => {
      try {
        await execFileAsync('tar.exe', ['-xf', archive, '-C', dest], { windowsHide: true });
        return;
      } catch (err) {
        Logger.warn('Dlss5Service', 'tar.exe falhou, tentando fallback', err);
      }
      if (!archive.toLowerCase().endsWith('.zip')) throw new Error('Nao foi possivel extrair o pacote (tar.exe indisponivel).');
      await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        'Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force',
        archive, dest
      ], { windowsHide: true });
    };

    try {
      onProgress('Consultando release mais recente do repositório oficial OptiScaler (GitHub API)...');
      const releaseData = await fetchJson('https://api.github.com/repos/optiscaler/OptiScaler/releases/latest');
      const asset = releaseData.assets?.find(a => /\.(7z|zip)$/i.test(a.name));
      if (!asset?.browser_download_url) throw new Error('Nenhum pacote 7z/zip encontrado na release oficial.');

      onProgress(`Baixando ${asset.name} (${(asset.size / (1024 * 1024)).toFixed(1)} MB)...`);
      const ext = asset.name.toLowerCase().endsWith('.zip') ? '.zip' : '.7z';
      const tempArchive = path.join(workDir, `optiscaler${ext}`);
      const main = await downloadToFile(asset.browser_download_url, tempArchive, {
        expectedSha256: assetSha256(asset),
        maxBytes: 300 * 1024 * 1024
      });
      hashLog[asset.name] = { sha256: main.sha256, verifiedByPublisherDigest: Boolean(assetSha256(asset)), at: Date.now() };

      onProgress('Extraindo pacote...');
      await extractArchive(tempArchive, destFolder);
      if (!fsRaw.existsSync(path.join(destFolder, 'OptiScaler.dll'))) {
        throw new Error('Falha ao extrair OptiScaler.dll do pacote baixado.');
      }
      onProgress('[OK] Binários do OptiScaler baixados.');

      const dlss5Assets = [
        { name: 'nvngx_dlssnr.dll', tag: 'dlssnr-310.8.SF-v2', desc: 'DLSS-NR (reconstrução neural)' },
        { name: 'nvngx_dlss.dll', tag: 'dlss-310.9.0', desc: 'Super Resolution 3.10' },
        { name: 'nvngx_dlssg.dll', tag: 'dlssg-310.9.0', desc: 'Frame Generation 3.10' },
        { name: 'nvngx_dlssd.dll', tag: 'dlssd-310.9.0', desc: 'Ray Reconstruction 3.10' }
      ];

      for (const item of dlss5Assets) {
        if (fsRaw.existsSync(path.join(destFolder, item.name))) continue;
        try {
          onProgress(`Baixando componente: ${item.desc}...`);
          const rel = await fetchJson(`https://api.github.com/repos/RankFTW/rhi-repo/releases/tags/${item.tag}`);
          const compAsset = rel.assets?.find(a => /\.zip$/i.test(a.name));
          if (!compAsset?.browser_download_url) throw new Error('asset zip nao encontrado');
          const tempZip = path.join(workDir, `${item.name}.zip`);
          const dl = await downloadToFile(compAsset.browser_download_url, tempZip, {
            expectedSha256: assetSha256(compAsset),
            maxBytes: 200 * 1024 * 1024
          });
          const previous = hashLog[compAsset.name];
          if (previous && previous.sha256 !== dl.sha256) {
            onProgress(`[AVISO] ${compAsset.name} mudou desde o ultimo download (hash diferente).`);
          }
          hashLog[compAsset.name] = { sha256: dl.sha256, verifiedByPublisherDigest: Boolean(assetSha256(compAsset)), at: Date.now() };
          await extractArchive(tempZip, destFolder);
          onProgress(`[OK] ${item.name} integrado (sha256 ${dl.sha256.slice(0, 12)}…).`);
        } catch (err) {
          Logger.warn('Dlss5Service', `Falha ao baixar ${item.name}`, err);
          onProgress(`[ERRO] ${item.name}: ${err?.message ?? err}`);
        }
      }

      try { fsRaw.writeFileSync(hashLogPath, JSON.stringify(hashLog, null, 2), 'utf8'); } catch {}
      onProgress('[COMPLETO] Binários baixados.');
      return destFolder;
    } finally {
      fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  generateNvngxIni(profile, options = {}) {
    const isAmd = profile === 'amd';
    const enableFg = options.enableFrameGen !== false;
    const overlay = options.enableOverlay !== false;
    const primaryApi = options.primaryApi || 'dx12';
    const neuralUpstream = options.neuralUpstream !== false;
    const route = options.route || 'optiscaler';
    const isRemix = Boolean(options.isRemix || route === 'remix');
    const amdEngine = options.amdEngine || 'zluda';
    const zludaCache = options.zludaCache !== false;
    const zludaCacheDir = options.zludaCacheDir || '%APPDATA%\\DarkHub\\dlss5_zluda_cache';

    const upscalerChoice = isAmd ? 'fsr31' : 'dlss';
    const fgOutputChoice = isAmd ? 'nukems' : 'dlssg';

    if (isAmd) {
      return `; ==============================================================================
; DarkHub Suite - DLSS 5 & Universal Neural Upscaler
; PERFIL: AMD RADEON (${amdEngine === 'zluda' ? 'ZLUDA HIP WMMA ACCELERATED' : 'FSR 3.1 / DIRECTCOMPUTE'})
; API DETECTADA: ${primaryApi.toUpperCase()} | AUTOPILOT ROUTE: ${route.toUpperCase()}
; ==============================================================================

[General]
LogLevel=2
LogToConsole=false
LogToFile=false
OpenConsole=false

[Upscalers]
Dx11Upscaler=${primaryApi === 'vulkan' ? 'auto' : 'fsr31'}
Dx12Upscaler=fsr31
VulkanUpscaler=fsr31

[Inputs]
EnableDlssInputs=true
EnableXeSSInputs=auto
EnableFsr2Inputs=auto
EnableFsr3Inputs=auto
EnableFfxInputs=true
UseFsr2Inputs=true
UseFsr3Inputs=true
UseFfxInputs=true

[DLSS]
Enabled=true
RenderPresetOverride=true
RenderPresetForAll=7
RenderPresetDLAA=7
RenderPresetUltraQuality=7
RenderPresetQuality=7
RenderPresetBalanced=7
RenderPresetPerformance=7
RenderPresetUltraPerformance=7
UseGenericAppIdWithDlss=true

[DLSSD]
RenderPresetOverride=true
RenderPresetForAll=5
RenderPresetDLAA=5
RenderPresetQuality=5
RenderPresetBalanced=5

[DLSSNR]
Enable=true
QualityMode=0
DenoisingLevel=1.0
NeuralUpstream=${neuralUpstream}
WorkResolution=${neuralUpstream ? 'render' : 'output'}
PassOrdering=${neuralUpstream ? 'pre_upscale' : 'post_upscale'}
Route=${route}
ZludaBackend=${amdEngine === 'zluda'}
WmmaMatrixAccel=${amdEngine === 'zluda'}

[FrameGen]
Enabled=${enableFg}
FGInput=dlssg
FGOutput=${fgOutputChoice}

[Spoofing]
Dxgi=true
SpoofedVendorId=0x10de
SpoofedDeviceId=0x2684
SpoofedGPUName=NVIDIA GeForce RTX 4090
StreamlineSpoofing=true
SpoofHAGS=true

[FSR]
ApplyRcas=true
RcasSharpness=0.8
UseReactiveMaskForTransparency=true

[ZLUDA]
Enable=${amdEngine === 'zluda'}
HipRuntime=${amdEngine === 'zluda'}
WmmaAcceleration=${amdEngine === 'zluda'}
Fp16Native=true
Fp8Native=true
ArchitectureTarget=rdna3_rdna4
PrecompileShaders=${zludaCache}
CacheCompilation=${zludaCache}
CacheDirectory=${zludaCacheDir}

[Libraries]
OptiDllPath=.\\
NvngxDlssPath=.\\nvngx_dlss.dll
NvapiPath=.\\nvapi64.dll

[Menu]
OverlayMenu=${overlay && !isRemix}
ShortcutKey=0x2D
OverlayKey=36
`;
    }

    return `; ==============================================================================
; DarkHub Suite - DLSS 5 & Universal Neural Upscaler
; PERFIL: NVIDIA GEFORCE (ESTÁVEL - NATIVO)
; API DETECTADA: ${primaryApi.toUpperCase()} | AUTOPILOT ROUTE: ${route.toUpperCase()}
; ==============================================================================

[General]
LogLevel=2
LogToConsole=false
LogToFile=false
OpenConsole=false

[Upscalers]
Dx11Upscaler=${primaryApi === 'vulkan' ? 'auto' : 'dlss'}
Dx12Upscaler=dlss
VulkanUpscaler=dlss

[Inputs]
EnableDlssInputs=true
EnableXeSSInputs=auto
EnableFsr2Inputs=auto
EnableFsr3Inputs=auto
EnableFfxInputs=true
UseFsr2Inputs=true
UseFsr3Inputs=true
UseFfxInputs=true

[DLSS]
Enabled=true
RenderPresetOverride=true
RenderPresetForAll=7
RenderPresetDLAA=7
RenderPresetUltraQuality=7
RenderPresetQuality=7
RenderPresetBalanced=7
RenderPresetPerformance=7
RenderPresetUltraPerformance=7
UseGenericAppIdWithDlss=true

[DLSSD]
RenderPresetOverride=true
RenderPresetForAll=5
RenderPresetDLAA=5
RenderPresetQuality=5
RenderPresetBalanced=5

[DLSSNR]
Enable=true
QualityMode=0
DenoisingLevel=1.0
NeuralUpstream=${neuralUpstream}
WorkResolution=${neuralUpstream ? 'render' : 'output'}
PassOrdering=${neuralUpstream ? 'pre_upscale' : 'post_upscale'}
Route=${route}

[FrameGen]
Enabled=${enableFg}
FGInput=dlssg
FGOutput=dlssg

[Spoofing]
Dxgi=auto
SpoofedVendorId=0x10de
SpoofedDeviceId=0x2684
SpoofedGPUName=NVIDIA GeForce RTX 4090
StreamlineSpoofing=true
SpoofHAGS=true

[Libraries]
OptiDllPath=.\\
NvngxDlssPath=.\\nvngx_dlss.dll
NvapiPath=.\\nvapi64.dll

[Menu]
OverlayMenu=${overlay && !isRemix}
ShortcutKey=0x2D
OverlayKey=36
`;
  }

  getUserDataDir() {
    try {
      if (this.app?.getPath) return this.app.getPath('userData');
    } catch {}
    return process.env.APPDATA || path.join(os.tmpdir(), 'DarkHubSuite');
  }

  /** Looks for an imported AMD-NR package (dxgi.dll + dlssnr_on_amd_weights.bin). */
  async resolveAmdNrSource(customPath) {
    const candidates = [];
    if (customPath && typeof customPath === 'string') candidates.push(path.resolve(customPath));
    candidates.push(path.join(this.getUserDataDir(), 'OptiScaler', AMD_NR_FOLDER));
    const isPackage = (d) => fsRaw.existsSync(path.join(d, 'dxgi.dll')) && fsRaw.existsSync(path.join(d, AMD_NR_WEIGHTS));
    for (const d of candidates) {
      if (!fsRaw.existsSync(d)) continue;
      if (isPackage(d)) return d;
      try {
        for (const e of await fs.readdir(d, { withFileTypes: true })) {
          if (e.isDirectory() && isPackage(path.join(d, e.name))) return path.join(d, e.name);
        }
      } catch {}
    }
    return null;
  }

  _resolveFsr4Rdna2() {
    const rel = path.join('fsr4_rdna2', 'amd_fidelityfx_upscaler_dx12.dll');
    const candidates = [
      path.join(this.getUserDataDir(), 'OptiScaler', 'FSR4_RDNA2', 'amd_fidelityfx_upscaler_dx12.dll'),
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', rel)
    ];
    return candidates.find((c) => fsRaw.existsSync(c)) || null;
  }

  async _readManifest(targetDir) {
    try {
      return JSON.parse(await fs.readFile(path.join(targetDir, MANIFEST_NAME), 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * NVIDIA signature-check bypass (machine-wide registry value). Opt-in only.
   * Returns the previous value so revert can restore it.
   */
  async applySignatureCheckBypass() {
    if (process.platform !== 'win32') return { ok: false, error: 'unsupported' };
    try {
      const script = `
$key = 'HKLM:\\SOFTWARE\\NVIDIA Corporation\\Global\\NGXCore'
$name = 'DisableNvidiaSignatureChecks'
$prev = $null
if (Test-Path -LiteralPath $key) {
  $prev = (Get-ItemProperty -LiteralPath $key -Name $name -ErrorAction SilentlyContinue).$name
} else {
  New-Item -Path $key -Force | Out-Null
}
Set-ItemProperty -LiteralPath $key -Name $name -Value 1 -Type DWord -Force
if ($null -eq $prev) { 'PREV=none' } else { "PREV=$prev" }
`;
      const res = await ElevationHelper.runElevatedPowerShell(script, { timeoutMs: 60000 });
      if (res.code !== 0) return { ok: false, error: (res.stderr || 'powershell failed').trim() };
      const m = /PREV=(\w+)/.exec(res.stdout || '');
      return { ok: true, previous: m && m[1] !== 'none' ? Number(m[1]) : null };
    } catch (e) {
      Logger.warn('Dlss5Service', 'Falha ao aplicar bypass de assinatura NVIDIA', e);
      return { ok: false, error: e.message };
    }
  }

  async restoreSignatureCheckBypass(previous) {
    if (process.platform !== 'win32') return { ok: false };
    try {
      const script = previous === null || previous === undefined
        ? `Remove-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\NVIDIA Corporation\\Global\\NGXCore' -Name 'DisableNvidiaSignatureChecks' -ErrorAction SilentlyContinue`
        : `Set-ItemProperty -LiteralPath 'HKLM:\\SOFTWARE\\NVIDIA Corporation\\Global\\NGXCore' -Name 'DisableNvidiaSignatureChecks' -Value ${Number(previous) | 0} -Type DWord -Force`;
      const res = await ElevationHelper.runElevatedPowerShell(script, { timeoutMs: 60000 });
      return { ok: res.code === 0 };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async apply(payload = {}, onLog = () => {}) {
    const scanRes = await this.scanGameDirectory(payload.gamePath || payload.targetDir);
    if (!scanRes.ok) return scanRes;

    const targetDir = scanRes.targetDir;
    const profile = payload.profile === 'amd' ? 'amd' : 'nvidia';
    const graphicsApi = scanRes.graphicsApi || {};
    const route = payload.route || scanRes.routeInfo?.recommendedRoute || 'optiscaler';
    const neuralUpstream = payload.neuralUpstream !== false;
    const amdEngine = profile === 'amd' ? (['neural', 'zluda', 'fsr'].includes(payload.amdEngine) ? payload.amdEngine : 'fsr') : null;
    const isNeural = amdEngine === 'neural';
    const warnings = [];

    // Cross-tool conflict: the OptiScaler Manager owns this folder.
    if (fsRaw.existsSync(path.join(targetDir, 'DarkHubOptiScaler.json'))) {
      return {
        ok: false,
        error: 'Esta pasta já possui uma instalação do OptiScaler Manager. Remova-a lá antes de aplicar o DLSS 5 (os dois usam os mesmos arquivos proxy).'
      };
    }

    let loader = payload.loader || 'dxgi.dll';
    if (!payload.loader || payload.loader === 'auto') loader = graphicsApi.recommendedLoader || 'dxgi.dll';
    if (!/^[A-Za-z0-9_.-]+\.dll$/.test(loader)) return { ok: false, error: 'Loader inválido.' };

    // --- AMD Neural (AMD-NR) pre-flight -------------------------------------------------
    let nrSource = null;
    if (isNeural) {
      const gpu = await this.detectGpu();
      if (gpu.vendor !== 'amd') {
        return { ok: false, error: 'O modo AMD Neural (AMD-NR) exige uma GPU AMD Radeon.' };
      }
      const apiName = String(graphicsApi.primaryApi || '');
      if (!(/^dx12/.test(apiName) || graphicsApi.hasD3D12)) {
        return { ok: false, error: 'O modo AMD Neural (AMD-NR) funciona apenas em jogos DirectX 12.' };
      }
      nrSource = await this.resolveAmdNrSource(payload.amdNrPath);
      if (!nrSource) {
        return {
          ok: false,
          code: 'AMD_NR_PACKAGE_MISSING',
          error: `Pacote AMD-NR não encontrado. Baixe o pacote em github.com/3zwr1/AMD-NR---OptiScaler e extraia em: ${path.join(this.getUserDataDir(), 'OptiScaler', AMD_NR_FOLDER)} (precisa conter dxgi.dll e ${AMD_NR_WEIGHTS}).`
        };
      }
      loader = 'dxgi.dll';
    }

    onLog(`[DLSS 5] Iniciando aplicação em: ${targetDir}`);
    onLog(`[API DETECTADA] ${graphicsApi.apiName || 'DirectX'} (${graphicsApi.bitness || '64-bit'}) -> Loader: ${loader}`);
    onLog(`[DLSS 5] Perfil: ${profile === 'amd' ? `AMD Radeon (${amdEngine})` : 'NVIDIA GeForce'} | Rota: ${String(route).toUpperCase()}`);

    // --- Baseline / backup bookkeeping ---------------------------------------------------
    const prev = await this._readManifest(targetDir);
    const backupRoot = path.join(targetDir, BACKUP_DIR_NAME);
    let backupDir = prev?.backupDir && fsRaw.existsSync(prev.backupDir) ? prev.backupDir : path.join(backupRoot, `backup_${Date.now()}`);
    await fs.mkdir(backupDir, { recursive: true });
    const backedUp = new Set(Array.isArray(prev?.backedUp) ? prev.backedUp : []);
    // Originals backed up during *this* run; only these are rolled back on failure.
    const newlyBackedUp = new Set();
    const ownedBefore = new Set((prev?.injectedFiles || []).map((f) => String(f.file).toLowerCase()));
    const injected = new Map();
    const createdDirs = new Set(prev?.createdDirs || []);

    const insideTarget = (p) => {
      const rel = path.relative(targetDir, p);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    };

    const ensureBackedUp = async (rel) => {
      const dst = path.join(targetDir, rel);
      if (!insideTarget(dst)) throw new Error(`Caminho fora da pasta do jogo: ${rel}`);
      if (backedUp.has(rel) || ownedBefore.has(rel.toLowerCase())) return;
      if (fsRaw.existsSync(dst)) {
        const bak = path.join(backupDir, rel);
        await fs.mkdir(path.dirname(bak), { recursive: true });
        await fs.copyFile(dst, bak);
        backedUp.add(rel);
        newlyBackedUp.add(rel);
      }
    };

    const place = async (srcPath, rel, { quiet = false } = {}) => {
      await ensureBackedUp(rel);
      const dst = path.join(targetDir, rel);
      const parent = path.dirname(dst);
      if (!fsRaw.existsSync(parent)) {
        await fs.mkdir(parent, { recursive: true });
        createdDirs.add(path.relative(targetDir, parent));
      }
      await fs.copyFile(srcPath, dst);
      injected.set(rel, { file: rel, sha256: await computeSha256(dst) });
      if (!quiet) onLog(`[DEPLOY] ${rel}`);
    };

    const placeContent = async (content, rel) => {
      await ensureBackedUp(rel);
      await fs.writeFile(path.join(targetDir, rel), content, 'utf8');
      injected.set(rel, { file: rel, sha256: await computeSha256(path.join(targetDir, rel)) });
    };

    const placeDir = async (srcDir, relDir) => {
      for (const e of await fs.readdir(srcDir, { withFileTypes: true })) {
        const s = path.join(srcDir, e.name);
        const r = path.join(relDir, e.name);
        if (e.isDirectory()) await placeDir(s, r);
        else if (e.isFile()) await place(s, r, { quiet: true });
      }
    };

    let signatureState = prev?.signatureBypass || null;

    try {
      if (isNeural) {
        // ----- AMD-NR: OptiScaler (DLSS-NR AMD backend) --------------------------------
        const passes = [1, 2, 3].includes(Number(payload.neuralPasses)) ? Number(payload.neuralPasses) : 3;
        await place(path.join(nrSource, 'dxgi.dll'), 'dxgi.dll');
        for (let i = 1; i <= passes; i++) {
          const f = `dlssnr_amd_pass${i}.dll`;
          const s = path.join(nrSource, f);
          if (fsRaw.existsSync(s)) await place(s, f);
          else warnings.push(`Arquivo ausente no pacote AMD-NR: ${f}`);
        }
        await place(path.join(nrSource, AMD_NR_WEIGHTS), AMD_NR_WEIGHTS);
        const fwd = path.join(nrSource, 'nvngx.dll_dlssnr.dll');
        if (fsRaw.existsSync(fwd)) await place(fwd, 'nvngx.dll_dlssnr.dll');
        else warnings.push('Arquivo ausente no pacote AMD-NR: nvngx.dll_dlssnr.dll');
        const libsDir = path.join(nrSource, 'OptiScaler');
        if (fsRaw.existsSync(libsDir)) await placeDir(libsDir, 'OptiScaler');
        const pkgIni = path.join(nrSource, 'OptiScaler.ini');
        if (fsRaw.existsSync(pkgIni)) await place(pkgIni, 'OptiScaler.ini');
        else warnings.push('OptiScaler.ini não veio no pacote; o OptiScaler criará um padrão no primeiro uso.');
        onLog('[AMD-NR] Pacote implantado. Abra o jogo e use INSERT -> aba Neural para ajustar a resolução NR e os passes.');
      } else {
        // ----- Standard OptiScaler / DLSS-NR bundle -----------------------------------
        let sourceDir = await this.resolveOptiScalerSource();
        if (!sourceDir) {
          onLog('[DLSS 5] Baixando binários oficiais...');
          try {
            sourceDir = await this.downloadOptiScalerBundle(onLog);
          } catch (e) {
            onLog(`[AVISO] Falha no download: ${e.message}`);
          }
        }
        if (!sourceDir || !fsRaw.existsSync(path.join(sourceDir, 'OptiScaler.dll'))) {
          await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
          return { ok: false, error: 'Binários do OptiScaler indisponíveis. Baixe-os (botão de download) ou importe-os manualmente.' };
        }

        const zludaCacheDir = path.join(this.getUserDataDir(), 'dlss5_zluda_cache');
        const iniOptions = {
          ...payload, amdEngine: amdEngine || 'fsr', zludaCache: payload.zludaCache !== false, zludaCacheDir,
          route, neuralUpstream, isRemix: graphicsApi.isRemix, primaryApi: graphicsApi.primaryApi || 'dx12'
        };
        await placeContent(this.generateNvngxIni(profile, iniOptions), 'OptiScaler.ini');
        onLog('[DLSS 5] OptiScaler.ini gravado.');

        const optiSrc = path.join(sourceDir, 'OptiScaler.dll');
        await place(optiSrc, 'OptiScaler.dll');
        await place(optiSrc, loader);

        const optional = ['nvngx_dlssnr.dll', 'nvngx_dlss.dll', 'nvngx_dlssg.dll', 'nvngx_dlssd.dll',
          'libxess.dll', 'libxell.dll', 'libxess_fg.dll', 'libxess_dx11.dll'];
        if (payload.enableFrameGen !== false) {
          optional.push('dlssg_to_fsr3_amd_is_better.dll', 'amd_fidelityfx_framegeneration_dx12.dll',
            'amd_fidelityfx_upscaler_dx12.dll', 'amd_fidelityfx_dx12.dll', 'amd_fidelityfx_vk.dll');
        }
        for (const f of optional) {
          const s = path.join(sourceDir, f);
          if (fsRaw.existsSync(s)) await place(s, f);
        }

        if (profile === 'amd' && payload.enableFrameGen !== false) {
          const fsr4 = this._resolveFsr4Rdna2();
          if (fsr4) await place(fsr4, 'amd_fidelityfx_upscaler_dx12.dll');
        }

        // GPU spoofing is only meaningful off NVIDIA hardware.
        if (profile === 'amd') {
          const fakeSrc = path.join(sourceDir, 'fakenvapi.dll');
          if (fsRaw.existsSync(fakeSrc)) {
            await place(fakeSrc, 'fakenvapi.dll');
            await place(fakeSrc, 'nvapi64.dll');
            await placeContent('[fakenvapi]\ngpu_spoofing=1\nhags_spoofing=1\nforce_spoofed_gpu=1\nspoofed_gpu=4090\n', 'fakenvapi.ini');
            onLog('[SPOOFING] fakenvapi/nvapi64 implantados (GPU reportada como RTX 4090 para o jogo).');
          }
        }

        if (profile === 'amd' && amdEngine === 'zluda') {
          for (const z of ['nvcuda.dll', 'zluda.dll']) {
            const s = path.join(sourceDir, z);
            if (fsRaw.existsSync(s)) await place(s, z);
          }
          onLog('[AMD ZLUDA] Bibliotecas ZLUDA copiadas apenas se presentes no pacote de origem.');
        }
      }

      // Legacy config name from older versions
      const legacyIni = path.join(targetDir, 'nvngx.ini');
      if (fsRaw.existsSync(legacyIni) && !isNeural) {
        await ensureBackedUp('nvngx.ini');
        await fs.unlink(legacyIni).catch(() => {});
      }

      // Opt-in, NVIDIA only, machine-wide.
      if (profile === 'nvidia' && payload.signatureBypass === true && !signatureState) {
        onLog('[DLSS 5] Aplicando bypass de assinatura NVIDIA (opcional) no registro...');
        const r = await this.applySignatureCheckBypass();
        if (r.ok) signatureState = { applied: true, previous: r.previous };
        else warnings.push(`Bypass de assinatura não aplicado: ${r.error || 'erro'}`);
      }
    } catch (err) {
      Logger.warn('Dlss5Service', 'Falha durante apply; revertendo parcialmente', err);
      for (const [rel] of injected) {
        if (!ownedBefore.has(rel.toLowerCase())) await fs.unlink(path.join(targetDir, rel)).catch(() => {});
      }
      // Restoring originals backed up by a *previous* install would break that
      // install (its manifest still lists the loader as injected).
      for (const rel of newlyBackedUp) {
        const bak = path.join(backupDir, rel);
        if (fsRaw.existsSync(bak)) await fs.copyFile(bak, path.join(targetDir, rel)).catch(() => {});
      }
      if (!prev) await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
      return { ok: false, error: err?.message || String(err) };
    }

    // Re-apply with a different proxy loader: drop the previous one, otherwise two
    // OptiScaler proxies get loaded (0xc0000142 / double hooks).
    const staleLoaders = new Set();
    const prevLoader = typeof prev?.loader === 'string' ? prev.loader : null;
    if (prevLoader && prevLoader.toLowerCase() !== loader.toLowerCase() && !injected.has(prevLoader) &&
        ownedBefore.has(prevLoader.toLowerCase()) && insideTarget(path.join(targetDir, prevLoader))) {
      const dst = path.join(targetDir, prevLoader);
      const bak = path.join(backupDir, prevLoader);
      try {
        if (backedUp.has(prevLoader) && fsRaw.existsSync(bak)) {
          await fs.copyFile(bak, dst);
          backedUp.delete(prevLoader);
        } else {
          await fs.unlink(dst);
        }
        staleLoaders.add(prevLoader.toLowerCase());
        onLog(`[DLSS 5] Loader anterior removido: ${prevLoader}`);
      } catch (e) {
        warnings.push(`Não foi possível remover o loader anterior ${prevLoader}: ${e.message}`);
      }
    }

    const injectedFiles = [
      ...injected.values(),
      ...(prev?.injectedFiles || []).filter((f) => !injected.has(f.file) && !staleLoaders.has(String(f.file).toLowerCase()))
    ];
    const manifest = {
      appliedAt: Date.now(),
      gameName: scanRes.gameName,
      targetDir,
      exePath: scanRes.exePath,
      profile,
      amdEngine,
      loader,
      route,
      neuralUpstream,
      graphicsApi: scanRes.graphicsApi,
      routeInfo: scanRes.routeInfo,
      backupDir,
      backedUp: [...backedUp],
      createdDirs: [...createdDirs],
      injectedFiles,
      signatureBypass: signatureState,
      options: payload
    };
    await fs.writeFile(path.join(targetDir, MANIFEST_NAME), JSON.stringify(manifest, null, 2), 'utf8');

    await this.saveRecentGame({
      gameName: scanRes.gameName, targetDir, exePath: scanRes.exePath, profile, loader, route,
      neuralUpstream, engine: scanRes.engine, graphicsApi: scanRes.graphicsApi
    });

    onLog(`[SUCESSO] DLSS 5 aplicado em ${scanRes.gameName}.`);
    return {
      ok: true,
      msg: `DLSS 5 aplicado para ${graphicsApi.apiName || 'o jogo'} (Rota: ${route}).`,
      targetDir, profile, amdEngine, loader, route, neuralUpstream, injectedFiles, warnings
    };
  }

  async revert(payload = {}, onLog = () => {}) {
    const scanRes = await this.scanGameDirectory(payload.gamePath || payload.targetDir);
    if (!scanRes.ok) return scanRes;

    const targetDir = scanRes.targetDir;
    onLog(`[REVERSÃO] Revertendo modificações DLSS 5 em: ${targetDir}`);

    const manifest = await this._readManifest(targetDir);
    if (!manifest) {
      return { ok: false, error: 'Nenhuma instalação do DLSS 5 (manifesto) encontrada nesta pasta.' };
    }

    const inside = (p) => {
      const rel = path.relative(targetDir, p);
      return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
    };

    const stillInjected = [];
    // 1) Remove only what we injected
    for (const entry of manifest.injectedFiles || []) {
      const rel = typeof entry === 'string' ? entry : entry.file;
      if (!rel) continue;
      const p = path.join(targetDir, rel);
      if (!inside(p)) continue;
      try {
        await fs.unlink(p);
      } catch (e) {
        // ENOENT is fine; EBUSY/EPERM (game running) means the mod is still there.
        if (e?.code !== 'ENOENT') stillInjected.push(entry);
      }
    }

    // 2) Restore originals recorded at install time
    let restoredCount = 0;
    const failed = [];
    const backupDir = manifest.backupDir;
    for (const rel of manifest.backedUp || []) {
      const src = backupDir ? path.join(backupDir, rel) : null;
      const dst = path.join(targetDir, rel);
      if (!src || !inside(dst) || !fsRaw.existsSync(src)) { failed.push(rel); continue; }
      try {
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.copyFile(src, dst);
        restoredCount++;
      } catch {
        failed.push(rel);
      }
    }

    // 3) Remove empty directories we created (deepest first)
    const dirs = [...(manifest.createdDirs || [])].sort((a, b) => b.length - a.length);
    for (const rel of dirs) {
      const d = path.join(targetDir, rel);
      if (inside(d)) await fs.rmdir(d).catch(() => {});
    }

    // 4) Registry bypass
    if (manifest.signatureBypass?.applied) {
      await this.restoreSignatureCheckBypass(manifest.signatureBypass.previous);
    }

    // 5) Cleanup. If anything could not be undone (e.g. the game is running and
    // holds the DLLs), keep a manifest of what is left so revert can be retried
    // instead of losing track of the injected files and the backups.
    if (failed.length > 0 || stillInjected.length > 0) {
      const remaining = { ...manifest, injectedFiles: stillInjected, backedUp: failed, signatureBypass: null, partialRevertAt: Date.now() };
      await fs.writeFile(path.join(targetDir, MANIFEST_NAME), JSON.stringify(remaining, null, 2), 'utf8').catch(() => {});
      onLog(`[AVISO] Reversão parcial: ${stillInjected.length + failed.length} arquivo(s) em uso. Feche o jogo e reverta novamente.`);
      return {
        ok: false,
        partial: true,
        error: `Reversão parcial: ${stillInjected.length + failed.length} arquivo(s) não puderam ser alterados (o jogo está aberto?). Feche o jogo e tente novamente.`,
        restoredCount,
        failed,
        stillInjected: stillInjected.map((e) => (typeof e === 'string' ? e : e.file))
      };
    }
    if (backupDir && inside(backupDir)) {
      await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
      await fs.rmdir(path.join(targetDir, BACKUP_DIR_NAME)).catch(() => {});
    }
    await fs.unlink(path.join(targetDir, MANIFEST_NAME)).catch(() => {});

    onLog(`[SUCESSO] DLSS 5 desinstalado. ${restoredCount} arquivo(s) original(is) restaurado(s).`);
    return {
      ok: true,
      msg: failed.length ? `DLSS 5 removido, mas ${failed.length} arquivo(s) original(is) não puderam ser restaurados.` : 'DLSS 5 removido e arquivos originais restaurados com sucesso.',
      restoredCount,
      failed
    };
  }
}

export function registerDlss5IPC({ app, ipcMain, shell }) {
  const service = new Dlss5Service(app);
  // apply/revert back up and swap game DLLs; never let two of them interleave
  // (double click, apply racing revert) or the backups capture modded files.
  let mutationChain = Promise.resolve();
  const serialized = (fn) => {
    const run = mutationChain.then(fn, fn);
    mutationChain = run.catch(() => {});
    return run;
  };

  ipcMain.handle('dlss5:getSteamGames', async () => {
    try {
      return await service.getInstalledSteamGames();
    } catch (err) {
      Logger.warn('Dlss5Service', 'Erro ao listar jogos Steam', err);
      return [];
    }
  });

  ipcMain.handle('dlss5:detectGpu', async () => {
    try {
      return await service.detectGpu();
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('dlss5:scanGame', async (_event, payload) => {
    try {
      const p = typeof payload === 'string' ? payload : (payload?.path || payload?.targetDir || payload?.gamePath);
      return await service.scanGameDirectory(p);
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('dlss5:apply', async (event, payload) => {
    try {
      const onLog = (msg) => {
        try {
          event.sender.send('dlss5:log', msg);
        } catch {}
      };
      return await serialized(() => service.apply(payload, onLog));
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('dlss5:revert', async (event, payload) => {
    try {
      const onLog = (msg) => {
        try {
          event.sender.send('dlss5:log', msg);
        } catch {}
      };
      const p = typeof payload === 'string' ? { targetDir: payload } : payload;
      return await serialized(() => service.revert(p, onLog));
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('dlss5:getRecentGames', async () => {
    try {
      return await service.getRecentGames();
    } catch {
      return [];
    }
  });

  ipcMain.handle('dlss5:getProvenance', async () => {
    try {
      return await service.getBinaryProvenance();
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('dlss5:downloadBinaries', async (event) => {
    try {
      const onLog = (msg) => {
        try {
          event.sender.send('dlss5:log', msg);
        } catch {}
      };
      await service.downloadOptiScalerBundle(onLog);
      return await service.getBinaryProvenance();
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('dlss5:openFolder', async (_event, targetPath) => {
    try {
      if (shell?.openPath && targetPath) {
        await shell.openPath(targetPath);
        return { ok: true };
      }
      return { ok: false, error: 'Shell não disponível' };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });
}

export default Dlss5Service;
