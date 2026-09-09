import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { app } from 'electron';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GoldbergService — manages Goldberg Steam Emulator file operations.
 * 
 * This service handles:
 * - Locating steam_api(64).dll in game directories
 * - Auto-detecting game install paths from Steam's libraryfolders.vdf
 * - Backing up original DLLs before replacement
 * - Copying emulator DLLs from bundled resources
 * - Creating steam_appid.txt and steam_settings/ config
 * - Generating steam_interfaces.txt for older games
 * - Detecting and removing SteamStub PE wrapper from executables
 * - Reverting all changes by restoring backups
 */
class GoldbergService {
  constructor() {
    this._sdkDir = null;
  }

  /**
   * Resolves the bundled Goldberg SDK directory.
   * In dev mode it's under electron/services/goldberg/
   * In production it's unpacked from the asar.
   */
  get sdkDir() {
    if (this._sdkDir) return this._sdkDir;

    const candidates = [
      // Production: asarUnpack puts files under app.asar.unpacked
      path.join(path.dirname(app.getAppPath()), 'app.asar.unpacked', 'electron', 'services', 'goldberg'),
      // Dev mode
      path.join(app.getAppPath(), 'electron', 'services', 'goldberg'),
      // Fallback: relative to this file
      path.join(__dirname, 'goldberg')
    ];

    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, 'steam_api.dll')) || fs.existsSync(path.join(dir, 'steam_api64.dll'))) {
        this._sdkDir = dir;
        return dir;
      }
    }

    // Last resort: use the first candidate
    this._sdkDir = candidates[0];
    return this._sdkDir;
  }

  /**
   * Resolves the bundled Steamless CLI directory.
   */
  get steamlessDir() {
    const candidates = [
      path.join(path.dirname(app.getAppPath()), 'app.asar.unpacked', 'electron', 'services', 'goldberg', 'steamless'),
      path.join(app.getAppPath(), 'electron', 'services', 'goldberg', 'steamless'),
      path.join(__dirname, 'goldberg', 'steamless')
    ];

    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, 'Steamless.CLI.exe'))) {
        return dir;
      }
    }
    return null;
  }

  /**
   * Auto-detects the game install directory by AppID using Steam's libraryfolders.vdf
   * and appmanifest_<appId>.acf files, with fallback to folder name heuristics.
   *
   * @param {number|string} appId - Steam AppID
   * @param {string} [gameName] - Optional game name for heuristics
   * @returns {string|null} - Path to game install directory, or null if not found
   */
  findGameDirByAppId(appId, gameName = '') {
    const appIdStr = String(appId).trim();
    const cleanGameName = (gameName || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Find Steam install path
    const steamPath = this._getSteamPath();
    if (!steamPath) return null;

    // 2. Parse libraryfolders.vdf to get all library paths
    const libraryPaths = this._getLibraryPaths(steamPath);

    // 3. For each library path, check appmanifest_<appId>.acf
    for (const libPath of libraryPaths) {
      const appsDir = path.join(libPath, 'steamapps');
      const acfPath = path.join(appsDir, `appmanifest_${appIdStr}.acf`);

      if (fs.existsSync(acfPath)) {
        try {
          const acf = fs.readFileSync(acfPath, 'utf8');
          const dirMatch = acf.match(/"installdir"\s+"([^"]+)"/);
          if (dirMatch && dirMatch[1]) {
            const gameDir = path.join(appsDir, 'common', dirMatch[1]);
            if (fs.existsSync(gameDir)) {
              return gameDir;
            }
          }
        } catch {}
      }

      // Check folders in steamapps/common
      const commonDir = path.join(appsDir, 'common');
      if (fs.existsSync(commonDir)) {
        try {
          const entries = fs.readdirSync(commonDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const targetPath = path.join(commonDir, entry.name);

            // Check steam_appid.txt
            const appIdPath = path.join(targetPath, 'steam_appid.txt');
            if (fs.existsSync(appIdPath)) {
              try {
                if (fs.readFileSync(appIdPath, 'utf8').trim() === appIdStr) {
                  return targetPath;
                }
              } catch {}
            }

            // Check name match if provided
            if (cleanGameName.length >= 3) {
              const entryClean = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '');
              if (entryClean === cleanGameName || entryClean.includes(cleanGameName) || cleanGameName.includes(entryClean)) {
                const dlls = this.findSteamDlls(targetPath, 2);
                if (dlls.length > 0) {
                  return targetPath;
                }
              }
            }
          }
        } catch {}
      }
    }

    return null;
  }

  /**
   * Get Steam installation path from registry
   */
  _getSteamPath() {
    if (process.platform !== 'win32') return null;
    const queries = [
      'reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath',
      'reg query "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam" /v InstallPath',
      'reg query "HKLM\\SOFTWARE\\Valve\\Steam" /v InstallPath'
    ];

    for (const q of queries) {
      try {
        const out = cp.execSync(q, { windowsHide: true, encoding: 'utf8' });
        for (const line of out.split(/\r?\n/)) {
          const match = line.match(/(?:SteamPath|InstallPath)\s+REG_SZ\s+(.+)$/i);
          if (match && match[1]) {
            let p = match[1].trim().replace(/\//g, '\\');
            if (fs.existsSync(path.join(p, 'steam.exe'))) {
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
      if (fs.existsSync(path.join(dp, 'steam.exe'))) return dp;
    }

    return null;
  }

  /**
   * Parse libraryfolders.vdf to get all Steam library paths.
   */
  _getLibraryPaths(steamPath) {
    const paths = [steamPath];
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');

    if (!fs.existsSync(vdfPath)) return paths;

    try {
      const vdf = fs.readFileSync(vdfPath, 'utf8');
      const matches = [...vdf.matchAll(/"path"\s+"([^"]+)"/g)];
      for (const m of matches) {
        const libPath = path.normalize(m[1].replace(/\\\\/g, '\\'));
        if (!paths.includes(libPath) && fs.existsSync(libPath)) {
          paths.push(libPath);
        }
      }
    } catch {}

    return paths;
  }

  /**
   * Scans a game directory tree (up to 3 levels deep) for steam_api.dll / steam_api64.dll.
   * Returns an array of { dll, fullPath, dir } objects.
   */
  findSteamDlls(gameDir, maxDepth = 3) {
    const results = [];
    const targetNames = ['steam_api.dll', 'steam_api64.dll'];

    const scan = (dir, depth) => {
      if (depth > maxDepth) return;
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isFile() && targetNames.includes(entry.name.toLowerCase())) {
          results.push({ dll: entry.name.toLowerCase(), fullPath, dir });
        } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
          scan(fullPath, depth + 1);
        }
      }
    };

    scan(gameDir, 0);
    return results;
  }

  /**
   * Finds all .exe files in a game directory (non-recursive, root level only).
   * Returns array of full paths.
   */
  findGameExecutables(gameDir) {
    const results = [];
    try {
      const entries = fs.readdirSync(gameDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
          // Skip known non-game executables
          const lower = entry.name.toLowerCase();
          if (lower.startsWith('unins') || lower.includes('setup') || lower.includes('redist') ||
              lower.includes('vcredist') || lower.includes('dxsetup') || lower.includes('dotnet') ||
              lower === 'steamless.cli.exe' || lower === 'generate_interfaces_file.exe') {
            continue;
          }
          results.push(path.join(gameDir, entry.name));
        }
      }
    } catch {}
    return results;
  }

  /**
   * Detects if a PE executable has a SteamStub wrapper by checking for a .bind section
   * with the entry point residing within it.
   * 
   * @param {string} exePath - Path to the executable
   * @returns {{ hasSteamStub: boolean, bindSection?: object, entryPoint?: number, arch?: string }}
   */
  detectSteamStub(exePath) {
    const result = { hasSteamStub: false };

    try {
      const fd = fs.openSync(exePath, 'r');
      const headerBuf = Buffer.alloc(4096);
      fs.readSync(fd, headerBuf, 0, 4096, 0);

      // Check DOS signature
      if (headerBuf.readUInt16LE(0) !== 0x5A4D) {
        fs.closeSync(fd);
        return result;
      }

      // PE offset
      const peOffset = headerBuf.readUInt32LE(60);
      if (peOffset + 24 >= 4096) {
        fs.closeSync(fd);
        return result;
      }

      // Check PE signature
      if (headerBuf.readUInt32LE(peOffset) !== 0x00004550) {
        fs.closeSync(fd);
        return result;
      }

      // COFF header
      const machine = headerBuf.readUInt16LE(peOffset + 4);
      const numberOfSections = headerBuf.readUInt16LE(peOffset + 6);
      const sizeOfOptionalHeader = headerBuf.readUInt16LE(peOffset + 20);

      result.arch = machine === 0x8664 ? 'x64' : machine === 0x14C ? 'x86' : 'unknown';

      // Entry point
      const addressOfEntryPoint = headerBuf.readUInt32LE(peOffset + 24 + 16);
      result.entryPoint = addressOfEntryPoint;

      // Section headers
      const sectionStart = peOffset + 24 + sizeOfOptionalHeader;
      
      // We may need more data for section headers
      const sectionBufSize = numberOfSections * 40;
      const sectionBuf = Buffer.alloc(sectionBufSize);
      fs.readSync(fd, sectionBuf, 0, sectionBufSize, sectionStart);

      for (let i = 0; i < numberOfSections; i++) {
        const off = i * 40;
        const name = sectionBuf.toString('ascii', off, off + 8).replace(/\0/g, '');
        
        if (name === '.bind') {
          const virtualSize = sectionBuf.readUInt32LE(off + 8);
          const virtualAddress = sectionBuf.readUInt32LE(off + 12);
          const sizeOfRawData = sectionBuf.readUInt32LE(off + 16);
          const pointerToRawData = sectionBuf.readUInt32LE(off + 20);

          result.bindSection = {
            index: i,
            name,
            virtualSize,
            virtualAddress,
            sizeOfRawData,
            pointerToRawData,
            isLastSection: (i === numberOfSections - 1)
          };

          // Check if EP is within .bind section
          if (addressOfEntryPoint >= virtualAddress &&
              addressOfEntryPoint < virtualAddress + virtualSize) {
            result.hasSteamStub = true;
          }
          break;
        }
      }

      fs.closeSync(fd);
    } catch {}

    return result;
  }

  /**
   * Removes SteamStub PE wrapper from an executable using bundled Steamless CLI.
   * Creates a backup of the original exe first.
   * 
   * @param {string} exePath - Path to the executable to unpack
   * @param {object} result - Result object to append actions to
   * @returns {boolean} - True if successfully unpacked
   */
  removeSteamStub(exePath, result) {
    const steamlessDir = this.steamlessDir;
    if (!steamlessDir) {
      result.actions.push('⚠ Steamless CLI não encontrado — passo de remoção do wrapper pulado');
      return false;
    }

    const steamlessCli = path.join(steamlessDir, 'Steamless.CLI.exe');
    const exeName = path.basename(exePath);
    const exeDir = path.dirname(exePath);

    try {
      // Create backup of original exe
      const backupPath = exePath + '.steamstub.original';
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(exePath, backupPath);
        result.actions.push(`Backup do executável criado: ${exeName}.steamstub.original`);
        result.backupsCreated.push(backupPath);
      }

      // Run Steamless CLI to unpack
      // Steamless outputs to <filename>.unpacked.exe in the same directory
      const unpackedPath = exePath.replace(/\.exe$/i, '.unpacked.exe');

      // Clean up any previous unpacked file
      if (fs.existsSync(unpackedPath)) {
        try { fs.unlinkSync(unpackedPath); } catch {}
      }

      cp.execSync(
        `"${steamlessCli}" --quiet "${exePath}"`,
        {
          cwd: exeDir,
          windowsHide: true,
          timeout: 120000, // 2 minutes timeout for large executables
          stdio: 'pipe'
        }
      );

      // Check if unpacked file was created
      if (fs.existsSync(unpackedPath)) {
        // Replace original with unpacked version
        fs.unlinkSync(exePath);
        fs.renameSync(unpackedPath, exePath);
        result.actions.push(`✓ SteamStub removido: ${exeName} (wrapper PE desempacotado)`);
        return true;
      } else {
        result.actions.push(`⚠ Steamless não conseguiu desempacotar ${exeName}`);
        return false;
      }
    } catch (err) {
      result.actions.push(`⚠ Erro ao remover wrapper de ${exeName}: ${err.message || String(err)}`);
      
      // If something went wrong, try to restore backup
      const backupPath = exePath + '.steamstub.original';
      if (fs.existsSync(backupPath) && !fs.existsSync(exePath)) {
        try {
          fs.copyFileSync(backupPath, exePath);
          result.actions.push('Executável restaurado do backup após falha');
        } catch {}
      }
      return false;
    }
  }

  /**
   * High-level auto-apply: given AppID and optional gameName/gameDir, auto-detects game directory and applies fix.
   *
   * @param {number|string} appId - Steam AppID
   * @param {object} options - Same options as applyFix
   * @returns {{ ok: boolean, actions: string[], gameDir?: string, error?: string }}
   */
  applyFixAuto(appId, options = {}) {
    let gameDir = options.gameDir;
    if (!gameDir) {
      gameDir = this.findGameDirByAppId(appId, options.gameName);
    }
    if (!gameDir) {
      return {
        ok: false,
        actions: [],
        error: `Não foi possível encontrar o diretório de instalação para AppID ${appId}. Verifique se o jogo está instalado via Steam ou selecione a pasta manualmente.`,
        type: 'Configuração de Emulação'
      };
    }

    const result = this.applyFix(gameDir, appId, options);
    result.gameDir = gameDir;
    return result;
  }

  /**
   * High-level auto-remove: given AppID, auto-detects game directory and removes fix.
   */
  removeFixAuto(appId, options = {}) {
    let gameDir = options?.gameDir;
    if (!gameDir) {
      gameDir = this.findGameDirByAppId(appId, options?.gameName);
    }
    if (!gameDir) {
      return {
        ok: false,
        actions: [],
        error: `Não foi possível encontrar o diretório de instalação para AppID ${appId}.`,
        type: 'Remoção de Emulação'
      };
    }

    const result = this.removeFix(gameDir);
    result.gameDir = gameDir;
    return result;
  }

  /**
   * High-level auto-status: given AppID, auto-detects game directory and checks status.
   */
  checkStatusAuto(appId, gameName = '') {
    const gameDir = this.findGameDirByAppId(appId, gameName);
    const base = {
      applied: false,
      hasBackups: false,
      dllsFound: [],
      settingsDir: false,
      appId: String(appId),
      primaryDir: null,
      gameDir: null
    };

    if (!gameDir) return base;

    const status = this.checkStatus(gameDir);
    status.gameDir = gameDir;
    return status;
  }

  /**
   * Applies the Goldberg emulator configuration to a game directory.
   * This includes:
   *  1. Detecting and removing SteamStub wrapper from game executables
   *  2. Replacing steam_api(64).dll with Goldberg emulator DLLs
   *  3. Creating steam_appid.txt, steam_settings/, and steam_interfaces.txt
   */
  applyFix(gameDir, appId, options = {}) {
    const result = { ok: false, actions: [], backupsCreated: [], type: 'Configuração de Emulação' };

    try {
      // Validate inputs
      if (!gameDir || !fs.existsSync(gameDir)) {
        throw new Error(`Diretório do jogo não encontrado: ${gameDir}`);
      }
      if (!appId || isNaN(Number(appId))) {
        throw new Error('AppID inválido');
      }

      const appIdStr = String(appId).trim();

      // 1. Find all steam_api DLLs in the game directory tree
      const dllLocations = this.findSteamDlls(gameDir);

      if (dllLocations.length === 0) {
        result.actions.push('Nenhum steam_api.dll encontrado. Configuração criada na raiz do jogo.');
      }

      // Determine the primary directory (where the first DLL was found, or game root)
      const primaryDir = dllLocations.length > 0 ? dllLocations[0].dir : gameDir;

      // 2. Detect and remove SteamStub from game executables BEFORE DLL replacement
      const gameExes = this.findGameExecutables(gameDir);
      for (const exePath of gameExes) {
        const stubInfo = this.detectSteamStub(exePath);
        if (stubInfo.hasSteamStub) {
          result.actions.push(`SteamStub detectado em ${path.basename(exePath)} (${stubInfo.arch}, seção .bind)`);
          this.removeSteamStub(exePath, result);
        }
      }

      // Also check subdirs where DLLs were found (sometimes exe is in a subfolder)
      const checkedDirs = new Set([gameDir]);
      for (const loc of dllLocations) {
        if (checkedDirs.has(loc.dir)) continue;
        checkedDirs.add(loc.dir);
        const subExes = this.findGameExecutables(loc.dir);
        for (const exePath of subExes) {
          const stubInfo = this.detectSteamStub(exePath);
          if (stubInfo.hasSteamStub) {
            result.actions.push(`SteamStub detectado em ${path.basename(exePath)} (${stubInfo.arch}, seção .bind)`);
            this.removeSteamStub(exePath, result);
          }
        }
      }

      // 3. For each DLL location, backup original and copy emulator DLL
      const processedDirs = new Set();
      for (const loc of dllLocations) {
        if (processedDirs.has(loc.dir)) continue;
        processedDirs.add(loc.dir);

        // Process both 32-bit and 64-bit DLLs in this directory
        for (const dllName of ['steam_api.dll', 'steam_api64.dll']) {
          const targetDll = path.join(loc.dir, dllName);
          const sourceDll = path.join(this.sdkDir, dllName);

          // Only process if the source (Goldberg) DLL exists
          if (!fs.existsSync(sourceDll)) continue;
          
          // Only process if the target DLL exists in the game dir
          // (don't create new DLLs that the game doesn't use)
          if (!fs.existsSync(targetDll)) continue;

          // Check if it's already a Goldberg DLL (same size as ours)
          const targetSize = fs.statSync(targetDll).size;
          const sourceSize = fs.statSync(sourceDll).size;

          if (targetSize === sourceSize) {
            result.actions.push(`${dllName} já é a versão do emulador em ${path.relative(gameDir, loc.dir) || '.'}`);
            continue;
          }

          // Backup original
          const backupPath = targetDll + '.original';
          if (!fs.existsSync(backupPath)) {
            fs.copyFileSync(targetDll, backupPath);
            result.backupsCreated.push(backupPath);
            result.actions.push(`Backup criado: ${dllName}.original`);
          }

          // Copy emulator DLL — use writeFileSync with the buffer to ensure full replacement
          const sourceBuffer = fs.readFileSync(sourceDll);
          fs.writeFileSync(targetDll, sourceBuffer);
          
          // Verify the copy was successful
          const newSize = fs.statSync(targetDll).size;
          if (newSize === sourceSize) {
            result.actions.push(`✓ DLL do emulador instalada: ${dllName} (${newSize} bytes) em ${path.relative(gameDir, loc.dir) || '.'}`);
          } else {
            result.actions.push(`⚠ DLL copiada mas tamanho diferente do esperado: ${dllName} (${newSize} vs ${sourceSize})`);
          }
        }

        // 4. Generate steam_interfaces.txt if requested or if original DLL is old
        if (options.generateInterfaces !== false) {
          this._generateInterfaces(loc.dir, result);
        }
      }

      // 5. Create steam_appid.txt in primary directory
      const appIdFile = path.join(primaryDir, 'steam_appid.txt');
      fs.writeFileSync(appIdFile, appIdStr + '\n', 'utf8');
      result.actions.push(`steam_appid.txt criado com AppID: ${appIdStr}`);

      // 6. Create steam_settings directory and config files
      const settingsDir = path.join(primaryDir, 'steam_settings');
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }

      fs.writeFileSync(path.join(settingsDir, 'steam_appid.txt'), appIdStr + '\n', 'utf8');
      result.actions.push('steam_settings/steam_appid.txt criado');

      // Force offline mode for all games by default
      fs.writeFileSync(path.join(settingsDir, 'offline.txt'), 'Offline mode enabled\n', 'utf8');
      result.actions.push('Modo offline ativado');

      // Force language if specified
      if (options.language) {
        fs.writeFileSync(path.join(settingsDir, 'force_language.txt'), options.language.trim() + '\n', 'utf8');
        result.actions.push(`Idioma forçado: ${options.language}`);
      }

      // Force account name if specified
      if (options.accountName) {
        fs.writeFileSync(path.join(settingsDir, 'force_account_name.txt'), options.accountName.trim() + '\n', 'utf8');
        result.actions.push(`Nome de conta forçado: ${options.accountName}`);
      }

      // Disable networking
      if (options.disableNetworking) {
        fs.writeFileSync(path.join(settingsDir, 'disable_networking.txt'), 'Networking disabled\n', 'utf8');
        result.actions.push('Rede desativada');
      }

      // Disable overlay
      if (options.disableOverlay) {
        fs.writeFileSync(path.join(settingsDir, 'disable_overlay.txt'), 'Overlay disabled\n', 'utf8');
        result.actions.push('Overlay desativado');
      }

      // Local save
      if (options.localSave) {
        fs.writeFileSync(path.join(primaryDir, 'local_save.txt'), 'goldberg_saves\n', 'utf8');
        result.actions.push('Save local ativado (goldberg_saves/)');
      }

      result.ok = true;
      result.message = `Emulação configurada com sucesso para AppID ${appIdStr}`;

    } catch (err) {
      result.error = err.message || String(err);
      result.message = `Falha na configuração: ${result.error}`;
    }

    return result;
  }

  /**
   * Attempts to generate steam_interfaces.txt by running generate_interfaces_file.exe
   * on the backed up original DLL.
   */
  _generateInterfaces(dllDir, result) {
    const interfacesFile = path.join(dllDir, 'steam_interfaces.txt');
    if (fs.existsSync(interfacesFile)) {
      result.actions.push('steam_interfaces.txt já existe');
      return;
    }

    const generatorExe = path.join(this.sdkDir, 'generate_interfaces_file.exe');
    if (!fs.existsSync(generatorExe)) return;

    // Try to generate from original backup
    for (const dllName of ['steam_api.dll.original', 'steam_api64.dll.original']) {
      const originalDll = path.join(dllDir, dllName);
      if (!fs.existsSync(originalDll)) continue;

      try {
        // Copy the generator next to the DLL temporarily
        const tempGenerator = path.join(dllDir, 'generate_interfaces_file.exe');
        fs.copyFileSync(generatorExe, tempGenerator);

        cp.execSync(`"${tempGenerator}" "${originalDll}"`, {
          cwd: dllDir,
          windowsHide: true,
          timeout: 10000,
          stdio: 'pipe'
        });

        // Clean up temp generator
        try { fs.unlinkSync(tempGenerator); } catch {}

        if (fs.existsSync(interfacesFile)) {
          result.actions.push('steam_interfaces.txt gerado automaticamente');
          return;
        }
      } catch {
        // Clean up on error
        try { fs.unlinkSync(path.join(dllDir, 'generate_interfaces_file.exe')); } catch {}
      }
    }
  }

  /**
   * Removes the Goldberg emulator and restores original DLLs and executables from backups.
   */
  removeFix(gameDir) {
    const result = { ok: false, actions: [], type: 'Remoção de Emulação' };

    try {
      if (!gameDir || !fs.existsSync(gameDir)) {
        throw new Error(`Diretório do jogo não encontrado: ${gameDir}`);
      }

      const dllLocations = this.findSteamDlls(gameDir);
      const processedDirs = new Set();
      const allDirs = [gameDir, ...dllLocations.map(l => l.dir)];

      for (const dir of allDirs) {
        if (processedDirs.has(dir)) continue;
        processedDirs.add(dir);

        // Restore backed up DLLs
        for (const dllName of ['steam_api.dll', 'steam_api64.dll']) {
          const backupPath = path.join(dir, dllName + '.original');
          const targetPath = path.join(dir, dllName);

          if (fs.existsSync(backupPath)) {
            fs.copyFileSync(backupPath, targetPath);
            fs.unlinkSync(backupPath);
            result.actions.push(`DLL original restaurada: ${dllName}`);
          }
        }

        // Restore backed up executables (SteamStub originals)
        try {
          const entries = fs.readdirSync(dir);
          for (const entry of entries) {
            if (entry.endsWith('.steamstub.original')) {
              const originalExeName = entry.replace('.steamstub.original', '');
              const backupPath = path.join(dir, entry);
              const targetPath = path.join(dir, originalExeName);

              fs.copyFileSync(backupPath, targetPath);
              fs.unlinkSync(backupPath);
              result.actions.push(`Executável original restaurado: ${originalExeName}`);
            }
          }
        } catch {}

        // Remove generated files
        for (const file of ['steam_appid.txt', 'steam_interfaces.txt', 'local_save.txt']) {
          const filePath = path.join(dir, file);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            result.actions.push(`Removido: ${file}`);
          }
        }

        // Remove steam_settings directory
        const settingsDir = path.join(dir, 'steam_settings');
        if (fs.existsSync(settingsDir)) {
          fs.rmSync(settingsDir, { recursive: true, force: true });
          result.actions.push('Pasta steam_settings/ removida');
        }
      }

      result.ok = true;
      result.message = 'Emulação removida e arquivos originais restaurados';

    } catch (err) {
      result.error = err.message || String(err);
      result.message = `Falha na remoção: ${result.error}`;
    }

    return result;
  }

  /**
   * Checks if a game directory already has Goldberg emulator applied.
   */
  checkStatus(gameDir) {
    const status = {
      applied: false,
      hasBackups: false,
      dllsFound: [],
      settingsDir: false,
      appId: null,
      primaryDir: null,
      gameDir: gameDir || null,
      steamStubRemoved: false
    };

    try {
      if (!gameDir || !fs.existsSync(gameDir)) return status;

      const dllLocations = this.findSteamDlls(gameDir);
      status.dllsFound = dllLocations.map(l => path.relative(gameDir, l.fullPath) || l.dll);

      if (dllLocations.length > 0) {
        status.primaryDir = dllLocations[0].dir;

        for (const loc of dllLocations) {
          for (const dllName of ['steam_api.dll.original', 'steam_api64.dll.original']) {
            if (fs.existsSync(path.join(loc.dir, dllName))) {
              status.hasBackups = true;
              status.applied = true;
              break;
            }
          }
          if (status.applied) break;
        }

        const settingsDir = path.join(dllLocations[0].dir, 'steam_settings');
        status.settingsDir = fs.existsSync(settingsDir);
        if (status.settingsDir) status.applied = true;
      }

      // Check for SteamStub backups
      try {
        const entries = fs.readdirSync(gameDir);
        for (const entry of entries) {
          if (entry.endsWith('.steamstub.original')) {
            status.steamStubRemoved = true;
            status.applied = true;
            break;
          }
        }
      } catch {}

      for (const dir of [gameDir, status.primaryDir].filter(Boolean)) {
        const appIdFile = path.join(dir, 'steam_appid.txt');
        if (fs.existsSync(appIdFile)) {
          try {
            status.appId = fs.readFileSync(appIdFile, 'utf8').trim();
          } catch {}
          break;
        }
      }

    } catch {}

    return status;
  }

  /**
   * Returns a list of supported Goldberg languages.
   */
  getSupportedLanguages() {
    return [
      'arabic', 'bulgarian', 'schinese', 'tchinese', 'czech', 'danish',
      'dutch', 'english', 'finnish', 'french', 'german', 'greek',
      'hungarian', 'italian', 'japanese', 'koreana', 'norwegian', 'polish',
      'portuguese', 'brazilian', 'romanian', 'russian', 'spanish', 'latam',
      'swedish', 'thai', 'turkish', 'ukrainian', 'vietnamese'
    ];
  }
}

export const goldbergService = new GoldbergService();
