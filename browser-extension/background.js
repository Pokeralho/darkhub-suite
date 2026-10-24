// DarkHub Vault extension: background (Chrome/Edge service worker, Firefox event page).
// Talks to the DarkHub app only through the native messaging host "com.darkhub.vault".
//
// Security notes:
// - The page URL sent to the app always comes from the browser (tab.url / sender.url), never from page content.
// - Passwords are requested only on an explicit user action (popup "Fill" button or a trusted click on the inline
//   icon) and are delivered only to the frame that asked, after it re-checks its own origin.
// - Credentials captured after a form submit wait in storage.session (memory only) until the user decides in the
//   popup; the app asks again before saving.
'use strict'

const api = globalThis.browser ?? globalThis.chrome
const HOST = 'com.darkhub.vault'
const REQUEST_TIMEOUT_MS = 15000
const SAVE_TIMEOUT_MS = 130000
const PENDING_SAVE_TTL_MS = 5 * 60 * 1000

let port = null
let ready = null // Promise resolved once the bridge handshake is done
let authed = false
let lastError = null
let nextId = 1
const pending = new Map()
let pairing = null // { pairingId, code, status: 'waiting'|'done'|'rejected'|'error', error? }
const memorySession = new Map() // fallback when storage.session is unavailable

// ---------------------------------------------------------------------------------------------------------------
// storage helpers

async function getLocal(key) {
  const r = await api.storage.local.get(key)
  return r?.[key]
}

async function setLocal(obj) {
  await api.storage.local.set(obj)
}

async function sessionGet(key) {
  if (api.storage.session) return (await api.storage.session.get(key))?.[key]
  return memorySession.get(key)
}

async function sessionSet(key, value) {
  if (api.storage.session) return api.storage.session.set({ [key]: value })
  memorySession.set(key, value)
}

async function sessionRemove(key) {
  if (api.storage.session) return api.storage.session.remove(key)
  memorySession.delete(key)
}

async function getSettings() {
  return { offerSave: true, ...(await getLocal('settings')) }
}

// ---------------------------------------------------------------------------------------------------------------
// native port

function disconnect(reason) {
  if (port) {
    try { port.disconnect() } catch {}
  }
  port = null
  ready = null
  authed = false
  lastError = reason || lastError
  for (const [, p] of pending) {
    clearTimeout(p.timer)
    p.reject(new Error(reason || 'disconnected'))
  }
  pending.clear()
}

function onPortMessage(msg) {
  if (!msg || typeof msg !== 'object') return
  if (msg.id != null && pending.has(msg.id)) {
    const p = pending.get(msg.id)
    pending.delete(msg.id)
    clearTimeout(p.timer)
    p.resolve(msg)
    return
  }
  if (msg.type === 'bridge.ready') {
    port._resolveReady?.()
    return
  }
  if (msg.type === 'error') {
    lastError = msg.error || 'error'
    port?._rejectReady?.(new Error(lastError))
    return
  }
  if (msg.type === 'pair.result') {
    onPairResult(msg)
    return
  }
  if (msg.type === 'revoked') {
    authed = false
    setLocal({ pairingCreds: null })
  }
}

function connect() {
  if (ready) return ready
  lastError = null
  ready = new Promise((resolve, reject) => {
    let p
    try {
      p = api.runtime.connectNative(HOST)
    } catch (err) {
      reject(err)
      return
    }
    port = p
    const timer = setTimeout(() => reject(new Error('timeout')), 8000)
    p._resolveReady = () => { clearTimeout(timer); resolve() }
    p._rejectReady = (e) => { clearTimeout(timer); reject(e) }
    p.onMessage.addListener(onPortMessage)
    p.onDisconnect.addListener(() => {
      const err = api.runtime.lastError?.message || p.error?.message
      clearTimeout(timer)
      if (port === p) disconnect(lastError || (err ? 'host_unavailable' : 'disconnected'))
      reject(new Error(lastError || 'host_unavailable'))
    })
  }).then(async () => {
    await authenticate()
  })
  ready.catch(() => disconnect(lastError || 'host_unavailable'))
  return ready
}

function send(type, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!port) return reject(new Error('disconnected'))
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('timeout'))
    }, timeoutMs)
    pending.set(id, { resolve, reject, timer })
    try {
      port.postMessage({ id, type, ...payload })
    } catch (err) {
      clearTimeout(timer)
      pending.delete(id)
      reject(err)
    }
  })
}

async function authenticate() {
  authed = false
  const creds = await getLocal('pairingCreds')
  if (!creds?.clientId || !creds?.token) return
  const res = await send('auth', { clientId: creds.clientId, token: creds.token })
  if (res.ok) authed = true
  else if (res.error === 'auth_failed') await setLocal({ pairingCreds: null })
}

async function request(type, payload, timeoutMs) {
  await connect()
  return send(type, payload, timeoutMs)
}

// ---------------------------------------------------------------------------------------------------------------
// pairing

function browserName() {
  const ua = navigator.userAgent || ''
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Edg\//.test(ua)) return 'edge'
  if (/OPR\//.test(ua)) return 'opera'
  return 'chrome'
}

async function startPairing() {
  await connect()
  const browser = browserName()
  const label = { chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', opera: 'Opera' }[browser] || 'Browser'
  const res = await send('pair.request', { clientName: `${label} (${navigator.platform || 'PC'})`, browser })
  if (!res.ok) {
    pairing = { status: 'error', error: res.error }
    return pairing
  }
  pairing = { pairingId: res.pairingId, code: res.code, status: 'waiting' }
  return pairing
}

async function onPairResult(msg) {
  if (!pairing || msg.pairingId !== pairing.pairingId) return
  if (msg.ok && msg.clientId && msg.token) {
    await setLocal({ pairingCreds: { clientId: msg.clientId, token: msg.token } })
    authed = true
    pairing = { status: 'done' }
  } else {
    pairing = { status: msg.error === 'rejected' ? 'rejected' : 'error', error: msg.error }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// logins

function isWebUrl(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u)
}

async function queryLogins(url, topUrl) {
  const res = await request('logins.query', { url, topUrl: topUrl || url })
  return res
}

async function fetchCredentials(url, topUrl, entryId) {
  return request('logins.fill', { url, topUrl: topUrl || url, entryId })
}

async function badge(tabId, text) {
  try {
    await api.action.setBadgeText({ tabId, text })
    if (text) await api.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' })
  } catch {}
}

async function offerSave(tabId, url, username, password) {
  const settings = await getSettings()
  if (!settings.offerSave || !isWebUrl(url)) return
  if (!password || password.length > 1024 || String(username || '').length > 256) return
  let exists = false
  try {
    const res = await request('logins.check', { url, username: username || '', password })
    if (!res.ok) return // locked / not paired: nothing to offer
    if (res.same) return
    exists = Boolean(res.exists)
  } catch {
    return
  }
  await sessionSet(`pending:${tabId}`, { url, username: username || '', password, exists, at: Date.now() })
  await badge(tabId, '+')
}

async function getPendingSave(tabId) {
  const p = await sessionGet(`pending:${tabId}`)
  if (!p) return null
  if (Date.now() - p.at > PENDING_SAVE_TTL_MS) {
    await sessionRemove(`pending:${tabId}`)
    await badge(tabId, '')
    return null
  }
  return p
}

async function clearPendingSave(tabId) {
  await sessionRemove(`pending:${tabId}`)
  await badge(tabId, '')
}

// ---------------------------------------------------------------------------------------------------------------
// popup API

async function popupState(tabId) {
  const tab = await api.tabs.get(tabId).catch(() => null)
  const url = tab?.url || ''
  const state = { connected: false, error: null, paired: false, unlocked: false, logins: [], url, host: '', pairing, pendingSave: null, settings: await getSettings() }
  try { state.host = new URL(url).host } catch {}
  try {
    await connect()
    state.connected = true
    const st = await send('status')
    state.paired = Boolean(st.paired)
    state.unlocked = Boolean(st.unlocked)
    if (state.paired && state.unlocked && isWebUrl(url)) {
      const res = await queryLogins(url, url)
      if (res.ok) state.logins = res.logins || []
      else state.error = res.error
    }
    const p = await getPendingSave(tabId)
    if (p) state.pendingSave = { host: (() => { try { return new URL(p.url).host } catch { return '' } })(), username: p.username, exists: p.exists }
  } catch (err) {
    state.error = lastError || err?.message || 'host_unavailable'
  }
  return state
}

async function popupFill(tabId, entryId) {
  const tab = await api.tabs.get(tabId)
  if (!isWebUrl(tab?.url)) return { ok: false, error: 'unsupported_page' }
  const res = await fetchCredentials(tab.url, tab.url, entryId)
  if (!res.ok) return res
  const origin = new URL(tab.url).origin
  try {
    const r = await api.tabs.sendMessage(tabId, { type: 'bg.fill', origin, username: res.username, password: res.password }, { frameId: 0 })
    return r?.ok ? { ok: true } : { ok: false, error: r?.error || 'no_form' }
  } catch {
    return { ok: false, error: 'no_form' }
  }
}

async function popupSave(tabId) {
  const p = await getPendingSave(tabId)
  if (!p) return { ok: false, error: 'nothing_to_save' }
  await clearPendingSave(tabId)
  return request('logins.save', { url: p.url, username: p.username, password: p.password }, SAVE_TIMEOUT_MS)
}

// ---------------------------------------------------------------------------------------------------------------
// message routing

function fromPopup(sender) {
  // Extension pages (the popup) have no tab and an extension URL.
  return !sender.tab && typeof sender.url === 'string' && sender.url.startsWith(api.runtime.getURL(''))
}

async function handleMessage(msg, sender) {
  if (sender.id !== api.runtime.id || !msg || typeof msg.type !== 'string') return { ok: false, error: 'forbidden' }

  if (msg.type.startsWith('popup.')) {
    if (!fromPopup(sender)) return { ok: false, error: 'forbidden' }
    const tabId = Number(msg.tabId)
    switch (msg.type) {
      case 'popup.state': return popupState(tabId)
      case 'popup.pair': return startPairing()
      case 'popup.pairCancel':
        pairing = null
        try { await send('pair.cancel') } catch {}
        return { ok: true }
      case 'popup.fill': return popupFill(tabId, String(msg.entryId || ''))
      case 'popup.save': return popupSave(tabId)
      case 'popup.dismissSave': await clearPendingSave(tabId); return { ok: true }
      case 'popup.setOfferSave': {
        const settings = await getSettings()
        await setLocal({ settings: { ...settings, offerSave: Boolean(msg.value) } })
        return { ok: true }
      }
      case 'popup.unpair': {
        try { await request('unpair') } catch {}
        await setLocal({ pairingCreds: null })
        authed = false
        return { ok: true }
      }
      default: return { ok: false, error: 'unknown' }
    }
  }

  // Content scripts: trust only what the browser says about the sender.
  const tab = sender.tab
  const frameUrl = sender.url
  if (!tab || !isWebUrl(frameUrl) || !isWebUrl(tab.url)) return { ok: false, error: 'unsupported_page' }

  switch (msg.type) {
    case 'cs.query': {
      if (!authed) {
        try { await connect() } catch { return { ok: false, error: 'host_unavailable' } }
        if (!authed) return { ok: false, error: 'not_paired' }
      }
      const res = await queryLogins(frameUrl, tab.url)
      return res.ok ? { ok: true, logins: res.logins || [] } : { ok: false, error: res.error }
    }
    case 'cs.fill': {
      const res = await fetchCredentials(frameUrl, tab.url, String(msg.entryId || ''))
      return res.ok ? { ok: true, username: res.username, password: res.password, origin: new URL(frameUrl).origin } : { ok: false, error: res.error }
    }
    case 'cs.submitted':
      if (typeof msg.password !== 'string') return { ok: false }
      offerSave(tab.id, frameUrl, typeof msg.username === 'string' ? msg.username : '', msg.password).catch(() => {})
      return { ok: true }
    default:
      return { ok: false, error: 'unknown' }
  }
}

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse, (err) => sendResponse({ ok: false, error: lastError || err?.message || 'error' }))
  return true
})

api.tabs.onRemoved.addListener((tabId) => { sessionRemove(`pending:${tabId}`).catch(() => {}) })
