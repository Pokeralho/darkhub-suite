import path from 'node:path';
import fsRaw from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { execFile, exec, execSync } from 'node:child_process';
import Logger from '../LoggerService.js';
import ElevationHelper from '../optimizer/ElevationHelper.js';

const fs = fsRaw.promises;
const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

const MANIFEST_NAME = 'DarkHubDLSS5.json';
const BACKUP_DIR_NAME = 'DLSS5_Backups';
const HISTORY_FILE_NAME = 'dlss5_history.json';

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
      return { ok: false, error: 'Não foi possível identificar a placa de vídeo (WMI).', vendor: 'unknown', model: '', driverVersion: '', isRtx: false, isAmd: false, isIntel: false };
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

    return {
      ok: true,
      gameName,
      exePath: selectedExe,
      targetDir: injectionDir,
      searchBaseDir,
      engine,
      graphicsApi,
      dlssDetected: hasDlss,
      existingDlls,
      installed,
      installedProfile,
      installedLoader,
      manifest: manifestData
    };
  }





  getUserDataDir() {
    try {
      if (this.app?.getPath) return this.app.getPath('userData');
    } catch {}
    return process.env.APPDATA || path.join(os.tmpdir(), 'DarkHubSuite');
  }



  async _readManifest(targetDir) {
    try {
      return JSON.parse(await fs.readFile(path.join(targetDir, MANIFEST_NAME), 'utf8'));
    } catch {
      return null;
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
