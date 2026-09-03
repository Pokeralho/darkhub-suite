

import fs from 'node:fs/promises'
import path from 'node:path'
import { app } from 'electron'

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
const DEFAULT_LICENSE_VERIFY_URL = process.env.DARKHUB_LICENSE_VERIFY_URL || null

let _configCache = null

function mergeDefaultConfig(config = {}) {
  const defaults = getDefaultConfig()
  return {
    ...defaults,
    ...config,
    license: {
      ...defaults.license,
      ...(config.license || {})
    },
    app: {
      ...defaults.app,
      ...(config.app || {})
    },
    telemetry: {
      ...defaults.telemetry,
      ...(config.telemetry || {})
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

  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8')
    _configCache = mergeDefaultConfig(JSON.parse(data))
    if (shouldMigrateVerifyUrl(_configCache.license?.verifyUrl)) {
      _configCache.license.verifyUrl = DEFAULT_LICENSE_VERIFY_URL
      await saveConfig(_configCache)
    }
    return _configCache
  } catch {

    _configCache = getDefaultConfig()
    await saveConfig(_configCache)
    return _configCache
  }
}

export async function saveConfig(newConfig) {
  _configCache = mergeDefaultConfig(newConfig)
  await fs.writeFile(CONFIG_PATH, JSON.stringify(_configCache, null, 2))
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

    telemetry: {
      bugReportsEnabled: true,
      bugWebhookUrl: '',
      includeDiagnostics: true
    },

    features: {
      gamingOverlayEnabled: true,
      advancedOptimizerEnabled: true
    }
  }
}

export async function getConfigValue(keyPath) {
  const config = await loadConfig()
  return keyPath.split('.').reduce((obj, key) => obj?.[key], config)
}

export async function setConfigValue(keyPath, value) {
  const config = await loadConfig()
  const keys = keyPath.split('.')
  let current = config

  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {}
    current = current[keys[i]]
  }

  current[keys[keys.length - 1]] = value
  await saveConfig(config)
  return config
}
