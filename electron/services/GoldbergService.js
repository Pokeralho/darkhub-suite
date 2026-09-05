import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import { app } from 'electron';

/**
 * GoldbergService — manages Goldberg Steam Emulator file operations.
 * 
 * This service handles:
 * - Locating steam_api(64).dll in game directories
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
   * Applies the Goldberg emulator configuration to a game directory.
   * 
   * @param {string} gameDir - Path to the game's root directory
   * @param {string} appId - Steam AppID for the game
   * @param {object} options - Configuration options
   * @param {string} [options.language] - Force language (e.g. 'brazilian', 'english')
   * @param {string} [options.accountName] - Force account name
   * @param {boolean} [options.offline] - Enable offline mode
   * @param {boolean} [options.disableNetworking] - Disable networking
   * @param {boolean} [options.disableOverlay] - Disable overlay
   * @param {boolean} [options.localSave] - Enable local save in game directory
   * @param {boolean} [options.generateInterfaces] - Auto-generate steam_interfaces.txt
   * @returns {{ ok: boolean, actions: string[], error?: string }}
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
        // No DLLs found — just create config at root level
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

      // steam_appid.txt inside steam_settings (preferred location per readme)
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
   * 
   * @param {string} gameDir - Path to the game's root directory
   * @returns {{ ok: boolean, actions: string[], error?: string }}
   */
  removeFix(gameDir) {
    const result = { ok: false, actions: [], type: 'Remoção de Emulação' };

    try {
      if (!gameDir || !fs.existsSync(gameDir)) {
        throw new Error(`Diretório do jogo não encontrado: ${gameDir}`);
      }

      // Find all locations where we applied the fix
      const dllLocations = this.findSteamDlls(gameDir);
      const processedDirs = new Set();

      // Also check root directory
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
        const filesToRemove = [
          'steam_appid.txt',
          'steam_interfaces.txt',
          'local_save.txt'
        ];

        for (const file of filesToRemove) {
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
   * 
   * @param {string} gameDir - Path to the game directory
   * @returns {{ applied: boolean, hasBackups: boolean, dllsFound: string[], settingsDir: boolean }}
   */
  checkStatus(gameDir) {
    const status = {
      applied: false,
      hasBackups: false,
      dllsFound: [],
      settingsDir: false,
      appId: null,
      primaryDir: null
    };

    try {
      if (!gameDir || !fs.existsSync(gameDir)) return status;

      const dllLocations = this.findSteamDlls(gameDir);
      status.dllsFound = dllLocations.map(l => path.relative(gameDir, l.fullPath) || l.dll);

      if (dllLocations.length > 0) {
        status.primaryDir = dllLocations[0].dir;

        // Check if any backup exists (indicates emulator was applied)
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

        // Check for steam_settings directory
        const settingsDir = path.join(dllLocations[0].dir, 'steam_settings');
        status.settingsDir = fs.existsSync(settingsDir);
        if (status.settingsDir) status.applied = true;
      }

      // Check for steam_appid.txt at root or primary dir
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
