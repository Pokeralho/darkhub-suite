

import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
const DEFAULT_LICENSE_VERIFY_URL = process.env.DARKHUB_LICENSE_VERIFY_URL || null

let _configCache = null

function mergeDefaultConfig(config = {}) {
  const defaults = getDefaultConfig()
  // telemetry: settings of the removed bug reporter, dropped from old files
  const { telemetry: _removed, ...rest } = config
  return {
    ...defaults,
    ...rest,
    license: {
      ...defaults.license,
      ...(config.license || {})
    },
    app: {
      ...defaults.app,
      ...(config.app || {})
    },
    features: {
      ...defaults.features,
      ...(config.features || {})
    }
  }
}

function shouldMigrateVerifyUrl(value) {
  if (!value) return true
  const normalized = String(value).trim()
  return (
    /^(http:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?/i.test(normalized)
    || /your-domain\.com/i.test(normalized)
    || /example\.(com|org|net)/i.test(normalized)
    || /luluhub\.shop/i.test(normalized)
    || /darkhub\.space/i.test(normalized)
  )
}

export async function loadConfig() {
  if (_configCache) return _configCache

  let data
  try {
    data = await fs.readFile(CONFIG_PATH, 'utf8')
  } catch (err) {
    _configCache = getDefaultConfig()
    // only a missing file is (re)created; a locked/unreadable one is left alone so the user's settings survive
    if (err?.code === 'ENOENT') await saveConfig(_configCache).catch(() => {})
    return _configCache
  }

  let parsed
  try {
    parsed = JSON.parse(data)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
  } catch {
    // keep the broken file for inspection/recovery instead of silently resetting it
    await fs.rename(CONFIG_PATH, `${CONFIG_PATH}.corrupt-${Date.now()}`).catch(() => {})
    _configCache = getDefaultConfig()
    await saveConfig(_configCache).catch(() => {})
    return _configCache
  }

  _configCache = mergeDefaultConfig(parsed)
  if (shouldMigrateVerifyUrl(_configCache.license?.verifyUrl)) {
    _configCache.license.verifyUrl = DEFAULT_LICENSE_VERIFY_URL
    await saveConfig(_configCache).catch(() => {})
  }
  return _configCache
}

/** Atomic write: a crash or power loss mid-write leaves the old file, never a truncated one. */
async function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  await fs.writeFile(tmp, text)
  try {
    await fs.rename(tmp, file)
  } catch (err) {
    // the target may be briefly locked (antivirus, indexer): fall back to an in-place write
    await fs.rm(tmp, { force: true }).catch(() => {})
    if (err?.code === 'EPERM' || err?.code === 'EBUSY' || err?.code === 'EACCES') await fs.writeFile(file, text)
    else throw err
  }
}

export async function saveConfig(newConfig) {
  _configCache = mergeDefaultConfig(newConfig)
  await writeAtomic(CONFIG_PATH, JSON.stringify(_configCache, null, 2))
  return _configCache
}

export function getDefaultConfig() {
  return {

    license: {
      verifyUrl: DEFAULT_LICENSE_VERIFY_URL,
      lastCheck: null,
      gracePeriodDays: 3
    },

    app: {
      firstRun: true,
      theme: 'dark',
      language: 'pt-BR',
      closeToTray: true
    },

    features: {
      advancedOptimizerEnabled: true
    }
  }
}
