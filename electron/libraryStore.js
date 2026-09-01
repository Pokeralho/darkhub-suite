import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'

function filePath(app) {
  return path.join(app.getPath('userData'), 'library.games.json')
}

function backupFilePath(app) {
  return path.join(app.getPath('userData'), 'library.games.json.bak')
}

function tempFilePath(app) {
  return path.join(app.getPath('userData'), `library.games.json.${process.pid}.tmp`)
}

function newId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return `g_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function newProfileId() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return `p_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function sanitizeProfile(input) {
  const p = input && typeof input === 'object' ? input : {}
  const tweaks = p.tweaks && typeof p.tweaks === 'object' ? p.tweaks : {}
  return {
    id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : newProfileId(),
    name: String(p.name ?? '').trim().slice(0, 80) || 'Perfil',
    enableUltraOnLaunch: Boolean(p.enableUltraOnLaunch),
    pingHost: String(p.pingHost ?? '').trim().slice(0, 200) || '1.1.1.1',
    overlayEnabled: Boolean(p.overlayEnabled),
    shieldEnabled: Boolean(p.shieldEnabled),
    shieldDeltaMs: Number.isFinite(Number(p.shieldDeltaMs)) ? Math.max(5, Math.min(300, Math.trunc(Number(p.shieldDeltaMs)))) : 30,
    shieldMinMs: Number.isFinite(Number(p.shieldMinMs)) ? Math.max(10, Math.min(500, Math.trunc(Number(p.shieldMinMs)))) : 80,
    shieldBeep: Boolean(p.shieldBeep),
    smartCleanMinutes: Number.isFinite(Number(p.smartCleanMinutes))
      ? Math.max(1, Math.min(120, Math.trunc(Number(p.smartCleanMinutes))))
      : 10,
    tweaks: {
      powerPlanHigh: tweaks.powerPlanHigh !== false,
      timerResolution05: tweaks.timerResolution05 !== false,
      processPriorityHigh: tweaks.processPriorityHigh !== false,
      disableFullscreenOptimizations: tweaks.disableFullscreenOptimizations !== false,
      disableMouseAcceleration: tweaks.disableMouseAcceleration !== false,
      gpuHighPerformance: tweaks.gpuHighPerformance !== false,
      qosForExe: tweaks.qosForExe !== false,
      disableNagle: tweaks.disableNagle !== false,
      killBackground: tweaks.killBackground !== false,
      dnsCloudflare: tweaks.dnsCloudflare !== false
    }
  }
}

function sanitizeOptiScaler(input) {
  const o = input && typeof input === 'object' ? input : {}
  const loader = String(o.loader ?? 'auto').trim()
  const upscaler = String(o.upscaler ?? 'auto').trim()
  const inputApi = String(o.inputApi ?? 'auto').trim()
  return {
    enabled: Boolean(o.enabled),
    applyOnLaunch: Boolean(o.applyOnLaunch),
    targetDir: String(o.targetDir ?? '').trim(),
    loader: loader || 'auto',
    upscaler: upscaler || 'auto',
    inputApi: inputApi || 'auto',
    includeAgilitySdk: Boolean(o.includeAgilitySdk),
    sourceVersion: String(o.sourceVersion ?? '').trim(),
    lastInstalledAt: Number.isFinite(Number(o.lastInstalledAt)) ? Number(o.lastInstalledAt) : null
  }
}

function sanitizeGame(input) {
  const g = input && typeof input === 'object' ? input : {}
  const tagsRaw = Array.isArray(g.tags) ? g.tags : []
  const tags = Array.from(
    new Set(tagsRaw.map((x) => String(x).trim()).filter(Boolean).map((x) => x.toLowerCase()))
  ).slice(0, 30)

  const profilesRaw = Array.isArray(g.profiles) ? g.profiles : null
  let profiles = profilesRaw ? profilesRaw.map(sanitizeProfile) : []
  if (profiles.length === 0) {
    const legacy = g.profile && typeof g.profile === 'object' ? g.profile : {}
    profiles = [
      sanitizeProfile({
        id: 'default',
        name: 'Padrão',
        ...legacy
      })
    ]
  }
  const defaultProfileIdRaw =
    typeof g.defaultProfileId === 'string' && g.defaultProfileId.trim() ? g.defaultProfileId.trim() : profiles[0]?.id
  const hasDefault = profiles.some((p) => p.id === defaultProfileIdRaw)
  const defaultProfileId = hasDefault ? defaultProfileIdRaw : profiles[0]?.id

  return {
    id: typeof g.id === 'string' && g.id.trim() ? g.id.trim() : newId(),
    name: String(g.name ?? '').trim().slice(0, 120),
    exePath: String(g.exePath ?? '').trim(),
    args: String(g.args ?? '').trim().slice(0, 2000),
    workingDir: String(g.workingDir ?? '').trim(),
    coverPath: String(g.coverPath ?? '').trim(),
    tags,
    profiles,
    defaultProfileId,
    optiscaler: sanitizeOptiScaler(g.optiscaler),
    playtimeSeconds: Number.isFinite(Number(g.playtimeSeconds)) ? Math.max(0, Number(g.playtimeSeconds)) : 0,
    playCount: Number.isFinite(Number(g.playCount)) ? Math.max(0, Number(g.playCount)) : 0,
    lastPlayedAt: Number.isFinite(Number(g.lastPlayedAt)) ? Number(g.lastPlayedAt) : null
  }
}

async function tryReadGames(targetPath) {
  try {
    const raw = await fs.readFile(targetPath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.games)) return null
    return parsed.games.map(sanitizeGame)
  } catch {
    return null
  }
}

export async function loadLibrary(app) {
  const primary = await tryReadGames(filePath(app))
  if (primary !== null) return { ok: true, games: primary }

  const fromBackup = await tryReadGames(backupFilePath(app))
  if (fromBackup !== null) {
    return {
      ok: true,
      games: fromBackup,
      recoveredFromBackup: true,
      warning: 'O arquivo principal da biblioteca estava corrompido ou ausente; os dados foram recuperados do backup mais recente.'
    }
  }

  return { ok: true, games: [] }
}

export async function saveLibrary(app, games) {
  const payload = { games, updatedAt: Date.now() }
  const target = filePath(app)
  const backup = backupFilePath(app)
  const tmp = tempFilePath(app)

  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')

  try {
    await fs.copyFile(target, backup)
  } catch {

  }

  await fs.rename(tmp, target)
}

export async function upsertGame(app, input) {
  const lib = await loadLibrary(app)
  const next = sanitizeGame(input)
  const games = Array.isArray(lib.games) ? lib.games.slice() : []
  const idx = games.findIndex((g) => g.id === next.id)
  if (idx >= 0) games[idx] = { ...games[idx], ...next, updatedAt: Date.now() }
  else games.unshift({ ...next, createdAt: Date.now(), updatedAt: Date.now() })
  await saveLibrary(app, games)
  return { ok: true, game: games.find((g) => g.id === next.id), games }
}

export async function upsertGamesBulk(app, inputsArray) {
  const lib = await loadLibrary(app)
  const games = Array.isArray(lib.games) ? lib.games.slice() : []
  for (const input of inputsArray) {
    const next = sanitizeGame(input)
    const idx = games.findIndex((g) => g.id === next.id)
    if (idx >= 0) games[idx] = { ...games[idx], ...next, updatedAt: Date.now() }
    else games.unshift({ ...next, createdAt: Date.now(), updatedAt: Date.now() })
  }
  await saveLibrary(app, games)
  return { ok: true, count: inputsArray.length, games }
}

export async function removeGame(app, id) {
  const lib = await loadLibrary(app)
  const games = Array.isArray(lib.games) ? lib.games.slice() : []
  const next = games.filter((g) => g.id !== id)
  await saveLibrary(app, next)
  return { ok: true, removed: games.length - next.length, games: next }
}

export async function discoverGames() {
  const fsRaw = await import('node:fs');
  const path = await import('node:path');
  const cp = await import('node:child_process');

  function getSteamPath() {
    try {
      const out = cp.execSync('reg query "HKCU\\\\Software\\\\Valve\\\\Steam" /v SteamPath', {encoding: 'utf8'});
      const line = out.split('\\n').find(l => l.includes('SteamPath'));
      if (line) return line.trim().split(/\\s{2,}/)[2];
    } catch (e) {}
    return null;
  }

  function getEpicPath() {
    return path.join(process.env.ProgramData || 'C:\\\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  }

  function scoreExecutable(exePath) {
    let score = 50;
    const name = path.basename(exePath).toLowerCase();

    if (/setup|install|update|uninst|crash|reporter|helper|bootstrapper|launcher/i.test(name)) {
      score -= 100;
    }

    try {
      const stat = fsRaw.statSync(exePath);
      if (stat.size < 1024 * 1024 * 2) score -= 20;
      else if (stat.size > 1024 * 1024 * 10) score += 20;
    } catch (e) {}

    const dir = path.dirname(exePath);
    try {
      const files = fsRaw.readdirSync(dir);
      const hasUnity = files.some(f => f.toLowerCase().includes('unityplayer.dll') || f.toLowerCase().endsWith('_data'));
      const hasUnreal = files.some(f => f.toLowerCase() === 'engine' || f.toLowerCase().includes('win64-shipping'));
      const hasCry = files.some(f => f.toLowerCase() === 'crysystem.dll');

      if (hasUnity) score += 50;
      if (hasUnreal) score += 50;
      if (hasCry) score += 50;

      if (files.some(f => f.toLowerCase().includes('dxgi') || f.toLowerCase().includes('d3d'))) score += 10;
      if (files.some(f => f.toLowerCase().includes('vulkan'))) score += 10;
    } catch (e) {}

    return score;
  }

  function scanDirectoryForBestExe(dir) {
    let bestExe = '';
    let bestScore = -999;

    function walk(currentDir, depth) {
      if (depth > 3) return;
      try {
        const files = fsRaw.readdirSync(currentDir, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(currentDir, file.name);
          if (file.isDirectory()) {
            walk(fullPath, depth + 1);
          } else if (file.name.toLowerCase().endsWith('.exe')) {
            const score = scoreExecutable(fullPath);
            if (score > bestScore && score > 0) {
              bestScore = score;
              bestExe = fullPath;
            }
          }
        }
      } catch(e) {}
    }

    walk(dir, 0);
    return bestExe;
  }

  return new Promise((resolve) => {
    try {
      const games = [];
      const steamPath = getSteamPath();
      if (steamPath) {
        const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
        if (fsRaw.existsSync(vdfPath)) {
          const vdf = fsRaw.readFileSync(vdfPath, 'utf8');
          const matches = [...vdf.matchAll(/"path"\\s+"([^"]+)"/g)];
          for (const match of matches) {
            const libPath = match[1].replace(/\\\\\\\\/g, '\\\\');
            const appsDir = path.join(libPath, 'steamapps');
            if (fsRaw.existsSync(appsDir)) {
              const acfs = fsRaw.readdirSync(appsDir).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'));
              for (const acf of acfs) {
                const acfContent = fsRaw.readFileSync(path.join(appsDir, acf), 'utf8');
                const nameMatch = acfContent.match(/"name"\\s+"([^"]+)"/);
                const dirMatch = acfContent.match(/"installdir"\\s+"([^"]+)"/);
                if (nameMatch && dirMatch) {
                  const gameDir = path.join(appsDir, 'common', dirMatch[1]);
                  const exePath = fsRaw.existsSync(gameDir) ? scanDirectoryForBestExe(gameDir) : '';
                  games.push({ name: nameMatch[1], platform: 'Steam', exePath });
                }
              }
            }
          }
        }
      }

      const epicPath = getEpicPath();
      if (fsRaw.existsSync(epicPath)) {
        const items = fsRaw.readdirSync(epicPath).filter(f => f.endsWith('.item'));
        for (const item of items) {
          try {
            const json = JSON.parse(fsRaw.readFileSync(path.join(epicPath, item), 'utf8'));
            if (json.DisplayName) {
              games.push({
                name: json.DisplayName,
                platform: 'Epic Games',
                exePath: path.join(json.InstallLocation, json.LaunchExecutable)
              });
            }
          } catch (e) {}
        }
      }

      const result = games.filter(x => x && x.name).map(g => ({
        name: g.name,
        platform: g.platform,
        exePath: g.exePath || ''
      }));
      resolve({ ok: true, discovered: result });
    } catch(err) {
      resolve({ ok: false, error: 'Falha ao processar heurística: ' + String(err) });
    }
  });
}
