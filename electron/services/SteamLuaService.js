import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import https from 'node:https';

const fsPromises = fs.promises;

export class SteamLocator {
  static getRegistrySteamPath() {
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
            let cleanPath = match[1].trim().replace(/\//g, '\\');
            const exe = path.join(cleanPath, 'steam.exe');
            if (fs.existsSync(exe)) {
              return cleanPath;
            }
          }
        }
      } catch {}
    }

    const defaultPaths = [
      'C:\\Program Files (x86)\\Steam',
      'C:\\Program Files\\Steam',
      'D:\\Steam',
      'E:\\Steam'
    ];
    for (const dp of defaultPaths) {
      if (fs.existsSync(path.join(dp, 'steam.exe'))) {
        return dp;
      }
    }

    return null;
  }

  static getSteamLanguage() {
    if (process.platform !== 'win32') return null;
    try {
      const out = cp.execSync('reg query "HKCU\\Software\\Valve\\Steam" /v Language', { windowsHide: true, encoding: 'utf8' });
      const match = out.match(/Language\s+REG_SZ\s+(.+)$/i);
      return match && match[1] ? match[1].trim().toLowerCase() : null;
    } catch {
      return null;
    }
  }

  static isSteamRunning() {
    if (process.platform !== 'win32') return false;
    try {
      const out = cp.execSync('tasklist /FI "IMAGENAME eq steam.exe" /NH', { windowsHide: true, encoding: 'utf8' });
      return out.toLowerCase().includes('steam.exe');
    } catch {
      return false;
    }
  }

  static stopSteam() {
    if (process.platform !== 'win32') return false;
    try {
      cp.execSync('taskkill /F /IM steam.exe /T', { windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  static killSteam() {
    return this.stopSteam();
  }

  static startSteam(steamPath) {
    if (process.platform !== 'win32' || !steamPath) return false;
    const exe = path.join(steamPath, 'steam.exe');
    if (!fs.existsSync(exe)) return false;
    try {
      cp.spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
      return true;
    } catch {
      return false;
    }
  }

  static restartSteam(steamPath) {
    this.stopSteam();
    return this.startSteam(steamPath);
  }
}

export class LuaFileParser {
  static AddAppIdRegex = /addappid\s*\(\s*(\d+)\s*(?:,\s*\d+\s*(?:,\s*"([^"]*)")?)?\s*\)[ \t]*(?:--[ \t]*(.*?)[ \t]*)?$/i;
  static SetManifestRegex = /setManifestid\s*\(\s*(\d+)\s*,\s*"(\d+)"\s*(?:,\s*(\d+))?/i;
  static CommentTailRegex = /\s*\(\d+\)\s*\S*\s*$/;

  static cleanComment(raw) {
    if (!raw || typeof raw !== 'string' || !raw.trim()) return null;
    let s = raw.trim();
    if (
      s.toLowerCase().includes('setmanifestid') ||
      s.toLowerCase().includes('addappid') ||
      s.toLowerCase().includes('addtoken')
    ) {
      return null;
    }
    s = s.replace(this.CommentTailRegex, '').trim();
    return s.length > 0 ? s : null;
  }

  static parse(filePathOrContent, appIdFromName = 0, isContent = false) {
    try {
      const text = isContent ? filePathOrContent : fs.readFileSync(filePathOrContent, 'utf8');
      const order = [];
      const keyById = new Map();
      const commentById = new Map();
      const manifests = new Map();
      const sizes = new Map();
      const commentedManifests = new Map();
      const disabledOrder = [];
      const disabledKeyById = new Map();

      const lines = text.split(/\r?\n/);
      for (const rawLine of lines) {
        const line = rawLine.trim();
        const commented = line.startsWith('--');

        const pinMatch = line.match(this.SetManifestRegex);
        if (pinMatch) {
          const depot = Number.parseInt(pinMatch[1], 10);
          const manifestId = pinMatch[2];
          if (commented) {
            commentedManifests.set(depot, manifestId);
          } else {
            manifests.set(depot, manifestId);
          }

          if (pinMatch[3]) {
            const sz = Number.parseInt(pinMatch[3], 10);
            if (sz > 0 && !sizes.has(depot)) {
              sizes.set(depot, sz);
            }
          }
        }

        const targetLine = commented ? line.replace(/^[- \t]+/, '') : line;
        const addMatch = targetLine.match(this.AddAppIdRegex);
        if (!addMatch) continue;

        const id = Number.parseInt(addMatch[1], 10);
        const key = addMatch[2] && addMatch[2].length > 0 ? addMatch[2] : null;
        const comment = this.cleanComment(addMatch[3]);

        if (comment) {
          const prev = commentById.get(id);
          if (!prev || comment.length > prev.length) {
            commentById.set(id, comment);
          }
        }

        if (commented) {
          if (disabledKeyById.has(id)) {
            disabledKeyById.set(id, disabledKeyById.get(id) || key);
          } else {
            disabledKeyById.set(id, key);
            disabledOrder.push(id);
          }
          continue;
        }

        if (keyById.has(id)) {
          keyById.set(id, keyById.get(id) || key);
        } else {
          keyById.set(id, key);
          order.push(id);
        }
      }

      const entries = order.map((id) => ({
        id,
        key: keyById.get(id) || null,
        hasKey: Boolean(keyById.get(id)),
        manifestId: manifests.get(id) || null,
        commentedManifestId: commentedManifests.get(id) || null,
        comment: commentById.get(id) || null,
        sizeOnDisk: sizes.get(id) || null,
        isEnabled: true,
        isLocked: manifests.has(id)
      }));

      const disabledEntries = disabledOrder
        .filter((id) => !keyById.has(id))
        .map((id) => ({
          id,
          key: disabledKeyById.get(id) || null,
          hasKey: Boolean(disabledKeyById.get(id)),
          manifestId: manifests.get(id) || null,
          commentedManifestId: commentedManifests.get(id) || null,
          comment: commentById.get(id) || null,
          sizeOnDisk: sizes.get(id) || null,
          isEnabled: false,
          isLocked: manifests.has(id)
        }));

      const baseAppId = entries.length > 0 ? entries[0].id : (appIdFromName || 0);
      const activePinsObj = Object.fromEntries(manifests);
      const commentedPinsObj = Object.fromEntries(commentedManifests);

      return {
        baseAppId,
        entries,
        disabledEntries,
        activePins: activePinsObj,
        commentedPins: commentedPinsObj,
        depotCount: entries.filter((e) => e.hasKey).length,
        dlcCount: entries.filter((e) => !e.hasKey && e.id !== baseAppId).length,
        hasActivePins: manifests.size > 0,
        rawText: text
      };
    } catch (err) {
      return null;
    }
  }
}

export class LuaEditor {
  static rewrite(lua, regex, active) {
    const lines = lua.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(regex);
      if (!m) continue;

      const indent = m[1] || '';
      const hasComment = Boolean(m[2]);
      if (hasComment === !active) continue;

      if (active) {
        lines[i] = indent + lines[i].slice(indent.length).replace(/^--\s*/, '');
      } else {
        lines[i] = indent + '-- ' + lines[i].slice(indent.length);
      }
    }
    return lines.join('\n');
  }

  static pinRegex(depotId) {
    return new RegExp('^(\\s*)(--\\s*)?(setManifestid\\s*\\(\\s*' + depotId + '\\s*[,)])', 'i');
  }

  static addAppIdRegex(depotId) {
    return new RegExp('^(\\s*)(--\\s*)?(addappid\\s*\\(\\s*' + depotId + '\\s*[,)])', 'i');
  }

  static setDepotLocked(lua, depotId, locked) {
    return this.rewrite(lua, this.pinRegex(depotId), locked);
  }

  static setDepotEnabled(lua, depotId, enabled) {
    return this.rewrite(lua, this.addAppIdRegex(depotId), enabled);
  }

  static commentOutManifestPins(lua) {
    const lines = lua.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trimStart();
      if (trimmed.startsWith('--')) continue;
      lines[i] = lines[i].replace(/^(\s*)(setManifestid\s*\()/i, '$1-- $2');
    }
    return lines.join('\n');
  }
}

export class SteamLuaManager {
  constructor() {
    this.steamPath = SteamLocator.getRegistrySteamPath();
  }

  getSteamStatus() {
    const steamPath = this.steamPath || SteamLocator.getRegistrySteamPath();
    this.steamPath = steamPath;
    const isValid = Boolean(steamPath && fs.existsSync(path.join(steamPath, 'steam.exe')));
    const isRunning = SteamLocator.isSteamRunning();
    const stPlugInDir = steamPath ? path.join(steamPath, 'config', 'stplug-in') : null;
    const depotCacheDir = steamPath ? path.join(steamPath, 'config', 'depotcache') : null;
    const language = SteamLocator.getSteamLanguage();

    let luaCount = 0;
    if (stPlugInDir && fs.existsSync(stPlugInDir)) {
      try {
        luaCount = fs.readdirSync(stPlugInDir).filter((f) => f.toLowerCase().endsWith('.lua') && /^\d+\.lua$/i.test(f)).length;
      } catch {}
    }

    return {
      isValid,
      isRunning,
      steamPath,
      stPlugInDir,
      depotCacheDir,
      language,
      luaCount
    };
  }

  listInstalledLuas() {
    const status = this.getSteamStatus();
    if (!status.isValid || !status.stPlugInDir || !fs.existsSync(status.stPlugInDir)) {
      return [];
    }

    const results = [];
    try {
      const files = fs.readdirSync(status.stPlugInDir);
      for (const file of files) {
        if (!file.toLowerCase().endsWith('.lua')) continue;
        const match = file.match(/^(\d+)\.lua$/i);
        if (!match) continue;

        const appId = Number.parseInt(match[1], 10);
        const fullPath = path.join(status.stPlugInDir, file);
        const parsed = LuaFileParser.parse(fullPath, appId);
        if (parsed) {
          const stat = fs.statSync(fullPath);
          results.push({
            appId,
            fileName: file,
            filePath: fullPath,
            updatedAt: stat.mtimeMs,
            sizeBytes: stat.size,
            depotCount: parsed.depotCount,
            dlcCount: parsed.dlcCount,
            hasActivePins: parsed.hasActivePins,
            entriesCount: parsed.entries.length,
            disabledCount: parsed.disabledEntries.length,
            baseAppId: parsed.baseAppId
          });
        }
      }
    } catch {}

    results.sort((a, b) => b.updatedAt - a.updatedAt);
    return results;
  }

  getLuaDetails(appId) {
    const status = this.getSteamStatus();
    if (!status.stPlugInDir) return null;
    const filePath = path.join(status.stPlugInDir, `${appId}.lua`);
    if (!fs.existsSync(filePath)) return null;

    const parsed = LuaFileParser.parse(filePath, appId);
    if (!parsed) return null;

    return {
      ...parsed,
      appId,
      filePath
    };
  }

  saveLuaText(appId, rawText) {
    const status = this.getSteamStatus();
    if (!status.stPlugInDir) throw new Error('Steam stplug-in directory not found');
    fs.mkdirSync(status.stPlugInDir, { recursive: true });
    const filePath = path.join(status.stPlugInDir, `${appId}.lua`);
    fs.writeFileSync(filePath, rawText, 'utf8');
    return true;
  }

  toggleDepot(appId, depotId, { enabled, locked }) {
    const details = this.getLuaDetails(appId);
    if (!details) throw new Error('Lua file not found for AppID ' + appId);

    let updated = details.rawText;
    if (typeof enabled === 'boolean') {
      updated = LuaEditor.setDepotEnabled(updated, depotId, enabled);
    }
    if (typeof locked === 'boolean') {
      updated = LuaEditor.setDepotLocked(updated, depotId, locked);
    }

    this.saveLuaText(appId, updated);
    return this.getLuaDetails(appId);
  }

  deleteLua(appId) {
    const status = this.getSteamStatus();
    if (!status.stPlugInDir) return false;
    const filePath = path.join(status.stPlugInDir, `${appId}.lua`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  installLuaFile(sourcePath, appId, { autoUpdate = true, forceLocked = false } = {}) {
    const status = this.getSteamStatus();
    if (!status.stPlugInDir) throw new Error('Steam directory not found');
    fs.mkdirSync(status.stPlugInDir, { recursive: true });

    const raw = fs.readFileSync(sourcePath, 'utf8');
    const finalContent = autoUpdate && !forceLocked ? LuaEditor.commentOutManifestPins(raw) : raw;
    const targetFile = path.join(status.stPlugInDir, `${appId}.lua`);
    fs.writeFileSync(targetFile, finalContent, 'utf8');
    return { ok: true, targetFile };
  }

  installManifestFile(sourcePath) {
    const status = this.getSteamStatus();
    if (!status.depotCacheDir) throw new Error('Steam depotcache directory not found');
    fs.mkdirSync(status.depotCacheDir, { recursive: true });

    const targetFile = path.join(status.depotCacheDir, path.basename(sourcePath));
    if (!fs.existsSync(targetFile)) {
      fs.copyFileSync(sourcePath, targetFile);
    }
    return { ok: true, targetFile };
  }

  async fetchSteamStoreInfo(appId) {
    return new Promise((resolve) => {
      const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`;
      https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 DarkHub' } }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json && json[appId] && json[appId].success) {
              const d = json[appId].data;
              return resolve({
                appId,
                name: d.name,
                headerImage: d.header_image,
                dlcList: d.dlc || [],
                developers: d.developers || [],
                publishers: d.publishers || [],
                genres: (d.genres || []).map((g) => g.description)
              });
            }
          } catch {}
          resolve(null);
        });
      }).on('error', () => resolve(null));
    });
  }

  async downloadFileBuffer(url, headers = {}) {
    return new Promise((resolve, reject) => {
      const proto = url.startsWith('https') ? https : http;
      const req = proto.get(url, { headers, timeout: 15000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return this.downloadFileBuffer(res.headers.location, headers).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', reject);
    });
  }

  async downloadAndInstallPackage(appIdInput, { autoUpdate = true, onlineFix = false } = {}) {
    const appId = SteamLuaManager.parseAppId(appIdInput);
    if (!appId) {
      return { ok: false, error: 'AppID inválido ou link da Steam não reconhecido.' };
    }

    const status = this.getSteamStatus();
    if (!status.isValid || !status.steamPath) {
      return { ok: false, error: 'Diretório da Steam não encontrado' };
    }

    const stPlugIn = status.stPlugInDir || path.join(status.steamPath, 'config', 'stplug-in');
    const depotCache1 = status.depotCacheDir || path.join(status.steamPath, 'depotcache');
    const depotCache2 = path.join(status.steamPath, 'config', 'depotcache');

    fs.mkdirSync(stPlugIn, { recursive: true });
    fs.mkdirSync(depotCache1, { recursive: true });
    fs.mkdirSync(depotCache2, { recursive: true });

    const sources = [
      { url: `http://167.235.229.108/${appId}`, headers: { 'User-Agent': 'secretgoonpoon' } },
      { url: `https://raw.githubusercontent.com/sushi-dev55-alt/sushitools-games-repo-alt/refs/heads/main/${appId}.zip`, headers: { 'User-Agent': 'Mozilla/5.0 DarkHub' } }
    ];

    let downloadedBuffer = null;
    for (const src of sources) {
      try {
        const buf = await this.downloadFileBuffer(src.url, src.headers);
        if (buf && buf.length > 50) {
          downloadedBuffer = buf;
          break;
        }
      } catch {}
    }

    const tempZip = path.join(process.env.TEMP || status.steamPath, `${appId}_pkg_${Date.now()}.zip`);
    const extractDir = path.join(process.env.TEMP || status.steamPath, `${appId}_extract_${Date.now()}`);

    try {
      if (downloadedBuffer && downloadedBuffer[0] === 0x50 && downloadedBuffer[1] === 0x4B) {
        fs.writeFileSync(tempZip, downloadedBuffer);
        fs.mkdirSync(extractDir, { recursive: true });

        const escapedZip = tempZip.replace(/'/g, "''");
        const escapedDest = extractDir.replace(/'/g, "''");
        try {
          cp.execSync(`powershell -NoProfile -NonInteractive -Command "Expand-Archive -Force -Path '${escapedZip}' -DestinationPath '${escapedDest}'"`, { windowsHide: true });
        } catch {
          cp.execSync(`tar -xf "${tempZip}" -C "${extractDir}"`, { windowsHide: true });
        }

        const files = fs.readdirSync(extractDir);
        let luaInstalled = false;

        for (const f of files) {
          const full = path.join(extractDir, f);
          if (f.endsWith('.lua')) {
            let luaText = fs.readFileSync(full, 'utf8');
            if (autoUpdate) {
              luaText = LuaEditor.commentOutManifestPins(luaText);
            }
            if (onlineFix && !luaText.includes('480')) {
              luaText += '\n-- Spacewar Online Fix\naddappid(480)\n';
            }
            fs.writeFileSync(path.join(stPlugIn, `${appId}.lua`), luaText, 'utf8');
            luaInstalled = true;
          } else if (f.endsWith('.manifest')) {
            fs.copyFileSync(full, path.join(depotCache1, f));
            try { fs.copyFileSync(full, path.join(depotCache2, f)); } catch {}
          }
        }

        if (!luaInstalled) {
          let starter = `addappid(${appId}) -- Added via DarkHub Suite\n`;
          if (onlineFix) starter += 'addappid(480) -- Spacewar Online Fix\n';
          fs.writeFileSync(path.join(stPlugIn, `${appId}.lua`), starter, 'utf8');
        }

        return { ok: true, appId, packageDownloaded: true, manifestsCount: files.filter(f => f.endsWith('.manifest')).length };
      } else {
        // Fallback starter lua
        const luaPath = path.join(stPlugIn, `${appId}.lua`);
        let starter = `addappid(${appId}) -- Added via DarkHub Suite\n`;
        if (onlineFix) starter += 'addappid(480) -- Spacewar Online Fix\n';
        fs.writeFileSync(luaPath, starter, 'utf8');
        return { ok: true, appId, packageDownloaded: false, message: 'Game entitlement added (No remote manifest package found)' };
      }
    } finally {
      try { if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip); } catch {}
      try { if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
    }
  }

  static parseAppId(input) {
    if (!input) return null;
    const str = String(input).trim();
    if (/^\d+$/.test(str)) {
      const num = parseInt(str, 10);
      return num > 0 ? num : null;
    }
    const match = str.match(/(?:\/app\/|store\/|info\/app\/)(\d+)/i);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      return num > 0 ? num : null;
    }
    const anyNum = str.match(/\d{2,8}/);
    if (anyNum) {
      const num = parseInt(anyNum[0], 10);
      return num > 0 ? num : null;
    }
    return null;
  }

  cleanupRogueFiles() {
    const status = this.getSteamStatus();
    if (!status.isValid || !status.steamPath) return;
    const rogueFiles = ['winmm.dll', 'winmm_real.dll', 'wsock32.dll', 'bcrypt_real.dll'];
    for (const f of rogueFiles) {
      const p = path.join(status.steamPath, f);
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {}
    }
    const marker = path.join(status.steamPath, '.cef-enable-remote-debugging');
    try {
      if (fs.existsSync(marker) || fs.lstatSync(marker)) {
        try { cp.execSync('cmd.exe /c rmdir "' + marker + '"', { windowsHide: true }); } catch {}
        try { fs.unlinkSync(marker); } catch {}
      }
    } catch {}
  }

  toggleOnlineFix(appId, enable) {
    const details = this.getLuaDetails(appId);
    if (!details) throw new Error('Arquivo Lua não encontrado para o AppID ' + appId);

    let raw = details.rawText;
    const has480 = /addappid\s*\(\s*480\s*\)/i.test(raw);

    if (enable && !has480) {
      raw = raw.trim() + '\n-- Spacewar Online Fix\naddappid(480)\n';
    } else if (!enable && has480) {
      raw = raw
        .split(/\r?\n/)
        .filter(line => !/addappid\s*\(\s*480\s*\)/i.test(line) && !/Spacewar Online Fix/i.test(line))
        .join('\n');
    }

    this.saveLuaText(appId, raw);
    return this.getLuaDetails(appId);
  }
}

export const steamLuaService = new SteamLuaManager();
