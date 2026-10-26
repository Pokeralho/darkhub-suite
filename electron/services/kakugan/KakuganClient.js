// Kakugan (kakugan.darkhub.ink): Steam hours/cards farm. Talks to the same JSON API as the website. The session is the
// site's own httpOnly cookie (kg_sess), kept in the main process only; the renderer never sees it.
export const KAKUGAN_ORIGIN = 'https://kakugan.darkhub.ink'
const COOKIE = 'kg_sess'

export class KakuganError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/**
 * Session token from the response's Set-Cookie headers (pure).
 * undefined = no change, null = the server cleared it (logout / expired), string = new token.
 */
export function sessionFromSetCookie(headers = []) {
  for (const h of headers) {
    const m = new RegExp(`^\\s*${COOKIE}=([^;]*)`).exec(String(h))
    if (!m) continue
    const expired = /expires=([^;]+)/i.exec(h)
    if (!m[1] || (expired && Date.parse(expired[1]) <= Date.now())) return null
    return decodeURIComponent(m[1])
  }
  return undefined
}

export class KakuganClient {
  /** store: { get(): string|null, set(token: string|null): void } */
  constructor({ store, fetchImpl = globalThis.fetch, origin = KAKUGAN_ORIGIN } = {}) {
    this.store = store
    this.fetch = fetchImpl
    this.origin = origin
  }

  get loggedIn() { return Boolean(this.store.get()) }

  async request(method, path, body) {
    const headers = { accept: 'application/json', 'user-agent': 'DarkHubSuite' }
    const token = this.store.get()
    if (token) headers.cookie = `${COOKIE}=${encodeURIComponent(token)}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    let r
    try {
      r = await this.fetch(this.origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000) })
    } catch {
      throw new KakuganError(0, 'Sem conexão com o Kakugan. Confira a internet e tente de novo.')
    }
    const next = sessionFromSetCookie(r.headers.getSetCookie?.() ?? [])
    if (next !== undefined) this.store.set(next)
    const data = await r.json().catch(() => null)
    if (!r.ok) {
      if (r.status === 401) this.store.set(null)
      throw new KakuganError(r.status, data?.error || `Kakugan respondeu ${r.status}`)
    }
    return data
  }

  status() { return this.request('GET', '/api/status') }
  plans() { return this.request('GET', '/api/plans') }
  me() { return this.request('GET', '/api/me') }
  login(email, password) { return this.request('POST', '/api/auth/login', { email, password }) }
  async logout() {
    try { await this.request('POST', '/api/auth/logout', {}) } finally { this.store.set(null) }
  }
  dashboard() { return this.request('GET', '/api/dashboard') }
  orders() { return this.request('GET', '/api/orders') }
  steamLoginStart(target) { return this.request('POST', '/api/steam-login', { ...target, method: 'qr' }) }
  steamLoginPoll(id) { return this.request('GET', `/api/steam-login/${encodeURIComponent(id)}`) }
  steamLoginCode(id, code) { return this.request('POST', `/api/steam-login/${encodeURIComponent(id)}/code`, { code }) }
  steamLoginCancel(id) { return this.request('DELETE', `/api/steam-login/${encodeURIComponent(id)}`) }
  updateAccount(id, patch) { return this.request('PATCH', `/api/accounts/${encodeURIComponent(id)}`, patch) }
  accountInput(id, kind, value) { return this.request('POST', `/api/accounts/${encodeURIComponent(id)}/login`, { kind, value }) }
  removeAccount(id) { return this.request('DELETE', `/api/accounts/${encodeURIComponent(id)}`) }
  searchGames(q) { return this.request('GET', `/api/steam/search?q=${encodeURIComponent(q)}`) }
  gameNames(ids) { return this.request('GET', `/api/steam/apps?ids=${ids.map(Number).filter((n) => n > 0).slice(0, 64).join(',')}`) }
}
