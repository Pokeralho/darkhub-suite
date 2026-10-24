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

let writeChain = Promise.resolve()
function serialized(task) {
  const run = writeChain.then(task, task)
  writeChain = run.catch(() => {})
  return run
}

export function upsertGame(app, input) {
  return serialized(() => upsertGameUnsafe(app, input))
}

async function upsertGameUnsafe(app, input) {
  const lib = await loadLibrary(app)
  const next = sanitizeGame(input)
  const games = Array.isArray(lib.games) ? lib.games.slice() : []
  const idx = games.findIndex((g) => g.id === next.id)
  if (idx >= 0) games[idx] = { ...games[idx], ...next, updatedAt: Date.now() }
  else games.unshift({ ...next, createdAt: Date.now(), updatedAt: Date.now() })
  await saveLibrary(app, games)
  return { ok: true, game: games.find((g) => g.id === next.id), games }
}

export function upsertGamesBulk(app, inputsArray) {
  return serialized(() => upsertGamesBulkUnsafe(app, inputsArray))
}

async function upsertGamesBulkUnsafe(app, inputsArray) {
  const lib = await loadLibrary(app)
  const games = Array.isArray(lib.games) ? lib.games.slice() : []
  const sameExe = (a, b) => a && b && a.toLowerCase() === b.toLowerCase()
  for (const input of inputsArray) {
    const next = sanitizeGame(input)
    // importing a game that is already in the library (same exe) keeps the existing entry and its stats
    if (!input?.id && games.some((g) => sameExe(g.exePath, next.exePath))) continue
    const idx = games.findIndex((g) => g.id === next.id)
    if (idx >= 0) games[idx] = { ...games[idx], ...next, updatedAt: Date.now() }
    else games.unshift({ ...next, createdAt: Date.now(), updatedAt: Date.now() })
  }
  await saveLibrary(app, games)
  return { ok: true, count: inputsArray.length, games }
}

export function removeGame(app, id) {
  return serialized(() => removeGameUnsafe(app, id))
}

async function removeGameUnsafe(app, id) {
  const lib = await loadLibrary(app)
  const games = Array.isArray(lib.games) ? lib.games.slice() : []
  const next = games.filter((g) => g.id !== id)
  await saveLibrary(app, next)
  return { ok: true, removed: games.length - next.length, games: next }
}

export function updateGame(app, id, mutator) {
  return serialized(async () => {
    const lib = await loadLibrary(app)
    const games = Array.isArray(lib.games) ? lib.games.slice() : []
    const game = games.find((g) => g.id === id)
    if (!game) return null
    mutator(game)
    await saveLibrary(app, games)
    return game
  })
}
