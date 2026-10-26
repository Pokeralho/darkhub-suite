import fs from 'node:fs'
import path from 'node:path'
import QRCode from 'qrcode'
import { KakuganClient, KAKUGAN_ORIGIN } from '../services/kakugan/KakuganClient.js'
import { kakuganAlerts, accountsToPause } from '../services/kakugan/kakuganAlerts.js'
import appEvents from '../services/appEvents.js'

// Pages of the site the app may open (account creation, plans and payment stay on the website).
const SITE_PAGES = new Set(['/', '/entrar', '/criar-conta', '/painel', '/termos', '/privacidade'])

/**
 * Session token encrypted with the Windows user's key (safeStorage/DPAPI) in userData. Without safeStorage the login
 * lasts until DarkHub closes: the token is never written in clear text.
 */
export function makeTokenStore(file, safeStorage) {
  let token = null
  const can = () => Boolean(safeStorage?.isEncryptionAvailable?.())
  try { if (can() && fs.existsSync(file)) token = safeStorage.decryptString(fs.readFileSync(file)) || null } catch { token = null }
  return {
    get: () => token,
    set(v) {
      token = v || null
      try {
        if (!token) fs.rmSync(file, { force: true })
        else if (can()) fs.writeFileSync(file, safeStorage.encryptString(token))
      } catch { /* kept in memory */ }
    }
  }
}

const POLL_MS = 5 * 60_000

/**
 * `kakugan:*`: the Kakugan panel (Steam hours and cards farm) inside DarkHub, plus, while signed in, tray alerts
 * (Steam asking for a code, plan ending, farm down/up) and pausing the farm while a Library game runs.
 */
export function registerKakuganIPC({ app, ipcMain, shell, safeStorage, Notification, openPage, logger } = {}) {
  const dir = app.getPath('userData')
  const client = new KakuganClient({ store: makeTokenStore(path.join(dir, 'kakugan-session.bin'), safeStorage) })
  const stateFile = path.join(dir, 'kakugan-state.json')
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { return {} } }
  const st = readState()
  const state = {
    notify: st.notify !== false,
    autoPause: st.autoPause !== false,
    sent: new Set(Array.isArray(st.sent) ? st.sent.slice(-300) : []),
    pausedByUs: Array.isArray(st.pausedByUs) ? st.pausedByUs : []
  }
  const save = () => { try { fs.writeFileSync(stateFile, JSON.stringify({ notify: state.notify, autoPause: state.autoPause, sent: [...state.sent].slice(-300), pausedByUs: state.pausedByUs })) } catch { /* kept in memory */ } }
  const settings = () => ({ notify: state.notify, autoPause: state.autoPause })

  let last = null
  const poll = async () => {
    if (!client.loggedIn || !state.notify) return
    try {
      const dash = await client.dashboard()
      for (const a of kakuganAlerts(last, dash, state.sent)) {
        state.sent.add(a.key)
        try {
          const n = new Notification({ title: a.title, body: a.body })
          n.on('click', () => openPage?.('kakugan'))
          n.show()
        } catch { /* notifications unavailable */ }
      }
      last = dash
      save()
    } catch (e) { if (e?.status !== 0) logger?.warn?.('Kakugan', `poll: ${e?.message ?? e}`) }
  }
  const timer = setInterval(() => { void poll() }, POLL_MS)
  timer.unref?.()
  setTimeout(() => { void poll() }, 30_000).unref?.()

  // one Steam session plays at a time: pause the farm while a Library game runs, resume what we paused afterwards
  const resume = async () => {
    const ids = state.pausedByUs
    state.pausedByUs = []
    save()
    for (const id of ids) await client.updateAccount(id, { paused: false }).catch(() => {})
  }
  appEvents.on('gameStarted', async () => {
    if (!client.loggedIn || !state.autoPause) return
    try {
      const ids = accountsToPause(await client.dashboard())
      for (const id of ids) await client.updateAccount(id, { paused: true })
      state.pausedByUs = [...new Set([...state.pausedByUs, ...ids])]
      save()
    } catch (e) { logger?.warn?.('Kakugan', `autopause: ${e?.message ?? e}`) }
  })
  appEvents.on('gameStopped', () => { void resume() })
  // DarkHub closed in the middle of a game: resume on the next start
  if (state.pausedByUs.length) setTimeout(() => { void resume() }, 60_000).unref?.()
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return { ok: true, ...(await fn(payload ?? {})) } } catch (err) {
      if (!err?.status) logger?.error?.('Kakugan', `${channel}: ${err?.message ?? err}`)
      return { ok: false, status: err?.status ?? 0, error: err?.message ?? String(err) }
    }
  })
  const withQr = async (attempt) => ({ attempt: { ...attempt, qrDataUrl: attempt?.qrUrl ? await QRCode.toDataURL(attempt.qrUrl, { errorCorrectionLevel: 'M', margin: 1, width: 260, color: { dark: '#0d1014', light: '#ffffff' } }) : null } })
  const str = (v, max = 200) => String(v ?? '').slice(0, max)

  handle('kakugan:state', async () => {
    const [status, plans, me] = await Promise.all([client.status(), client.plans(), client.loggedIn ? client.me().catch(() => null) : null])
    return { status, plans, me }
  })
  handle('kakugan:login', async ({ email, password }) => ({ me: await client.login(str(email), str(password)) }))
  handle('kakugan:logout', async () => { await client.logout(); last = null; return {} })
  handle('kakugan:getSettings', async () => settings())
  handle('kakugan:setSettings', async (p) => {
    if (typeof p.notify === 'boolean') state.notify = p.notify
    if (typeof p.autoPause === 'boolean') state.autoPause = p.autoPause
    save()
    return settings()
  })
  handle('kakugan:dashboard', async () => ({ dashboard: await client.dashboard() }))
  handle('kakugan:steamLoginStart', async ({ planId, accountId }) => withQr(await client.steamLoginStart(accountId ? { accountId: str(accountId, 80) } : { planId: str(planId, 80) })))
  handle('kakugan:steamLoginPoll', async ({ id }) => withQr(await client.steamLoginPoll(str(id, 80))))
  handle('kakugan:steamLoginCode', async ({ id, code }) => withQr(await client.steamLoginCode(str(id, 80), str(code, 8))))
  handle('kakugan:steamLoginCancel', async ({ id }) => { await client.steamLoginCancel(str(id, 80)); return {} })
  handle('kakugan:updateAccount', async ({ id, patch }) => {
    const p = patch && typeof patch === 'object' ? patch : {}
    const allowed = {}
    if (Array.isArray(p.games)) allowed.games = p.games.map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 32)
    for (const k of ['farmCards', 'invisible', 'paused']) if (typeof p[k] === 'boolean') allowed[k] = p[k]
    if (p.customGame === null || typeof p.customGame === 'string') allowed.customGame = p.customGame === null ? null : str(p.customGame, 40)
    await client.updateAccount(str(id, 80), allowed)
    return {}
  })
  handle('kakugan:accountInput', async ({ id, kind, value }) => {
    if (!['password', 'email_code', 'app_code'].includes(kind)) throw new Error('invalid input kind')
    await client.accountInput(str(id, 80), kind, str(value, 128))
    return {}
  })
  handle('kakugan:removeAccount', async ({ id }) => { await client.removeAccount(str(id, 80)); return {} })
  handle('kakugan:searchGames', async ({ q }) => ({ games: await client.searchGames(str(q, 80)) }))
  handle('kakugan:gameNames', async ({ ids }) => ({ games: Array.isArray(ids) && ids.length ? await client.gameNames(ids) : [] }))
  handle('kakugan:openSite', async ({ page }) => {
    const p = String(page || '/')
    const ok = SITE_PAGES.has(p) || /^\/assinar\/[a-z0-9-]{1,40}$/.test(p)
    await shell.openExternal(KAKUGAN_ORIGIN + (ok ? p : '/'))
    return {}
  })
}

export default registerKakuganIPC
