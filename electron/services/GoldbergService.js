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

      // 2. For each DLL location, backup original and copy emulator DLL
      const processedDirs = new Set();
      for (const loc of dllLocations) {
        if (processedDirs.has(loc.dir)) continue;
        processedDirs.add(loc.dir);

        // Process both 32-bit and 64-bit DLLs in this directory
        for (const dllName of ['steam_api.dll', 'steam_api64.dll']) {
          const targetDll = path.join(loc.dir, dllName);
          const sourceDll = path.join(this.sdkDir, dllName);

          if (!fs.existsSync(sourceDll)) continue;

          if (fs.existsSync(targetDll)) {
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
          }

          // Copy emulator DLL
          fs.copyFileSync(sourceDll, targetDll);
          result.actions.push(`DLL do emulador instalada: ${dllName} em ${path.relative(gameDir, loc.dir) || '.'}`);
        }

        // 3. Generate steam_interfaces.txt if requested or if original DLL is old
        if (options.generateInterfaces !== false) {
          this._generateInterfaces(loc.dir, result);
        }
      }

      // 4. Create steam_appid.txt in primary directory
      const appIdFile = path.join(primaryDir, 'steam_appid.txt');
      fs.writeFileSync(appIdFile, appIdStr + '\n', 'utf8');
      result.actions.push(`steam_appid.txt criado com AppID: ${appIdStr}`);

      // 5. Create steam_settings directory and config files
      const settingsDir = path.join(primaryDir, 'steam_settings');
      if (!fs.existsSync(settingsDir)) {
        fs.mkdirSync(settingsDir, { recursive: true });
      }

      fs.writeFileSync(path.join(settingsDir, 'steam_appid.txt'), appIdStr + '\n', 'utf8');
      result.actions.push('steam_settings/steam_appid.txt criado');

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

      // Offline mode
      if (options.offline) {
        fs.writeFileSync(path.join(settingsDir, 'offline.txt'), 'Offline mode enabled\n', 'utf8');
        result.actions.push('Modo offline ativado');
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
   * Removes the Goldberg emulator and restores original DLLs from backups.
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
      gameDir: gameDir || null
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
