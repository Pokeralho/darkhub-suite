// Matching of vault entries against the page a browser extension is asking about.
// Pure module (no Electron imports) so the rules are unit-tested in tests/vaultBridge.test.ts.
//
// Rules (security-relevant, keep in sync with browser-extension/README.md):
// - Only http/https pages are ever matched. Anything else (file:, chrome:, about:, data:...) gets nothing.
// - "exact": same host (a leading "www." is ignored on both sides) and same port.
// - "domain": same registrable domain (eTLD+1) and same port. Never used for IP addresses, localhost or single-label
//   hosts, and never when the registrable domain cannot be determined.
// - Scheme: an https page matches entries saved as https:// or without a scheme. An http page only matches entries
//   explicitly saved as http:// (exact host only), or any entry for localhost / loopback IPs. An entry saved as
//   https:// never matches an http page (downgrade protection).
// - Entries whose "site" is not a host name (e.g. "Gmail", "my bank") never match.

// Multi-label public suffixes that matter in practice. This is a compact subset of the Public Suffix List (ICANN
// second-level ccTLD suffixes + PRIVATE hosting platforms where every subdomain belongs to a different owner).
// Unknown platforms fall back to "last two labels"; the popup shows the saved host for every non-exact match so the
// user can see what is being offered.
const MULTI_LABEL_SUFFIXES = new Set([
  // ICANN second-level registrations (the generic ccTLD rule below covers most com.xx / co.xx / org.xx)
  'gov.uk', 'ltd.uk', 'plc.uk', 'me.uk', 'nhs.uk', 'police.uk', 'sch.uk',
  'blog.br', 'eco.br', 'emp.br', 'eng.br', 'esp.br', 'etc.br', 'eti.br', 'far.br', 'fot.br', 'inf.br', 'jor.br',
  'jus.br', 'leg.br', 'med.br', 'mp.br', 'nom.br', 'ong.br', 'ppg.br', 'pro.br', 'psi.br', 'qsl.br', 'rec.br',
  'srv.br', 'tmp.br', 'tur.br', 'tv.br', 'vet.br', 'wiki.br', 'app.br', 'dev.br', 'log.br', 'art.br', 'adv.br',
  'arq.br', 'bio.br', 'cim.br', 'cng.br', 'cnt.br', 'ecn.br', 'fnd.br', 'fst.br', 'g12.br', 'ggf.br', 'imb.br',
  'ind.br', 'lel.br', 'mat.br', 'mus.br', 'not.br', 'ntr.br', 'odo.br', 'slg.br', 'taxi.br', 'teo.br', 'trd.br',
  'zlg.br', 'b.br', 'def.br', 'coop.br', 'radio.br', 'seg.br', 'agr.br', 'am.br', 'tc.br', 'sp.gov.br',
  'rj.gov.br', 'mg.gov.br', 'id.au', 'asn.au', 'csiro.au', 'gen.nz', 'geek.nz', 'school.nz', 'kiwi.nz',
  'gob.mx', 'gob.ar', 'gob.es', 'nom.es', 'gouv.fr', 'asso.fr', 'nom.fr', 'nic.in', 'firm.in', 'gen.in', 'ind.in',
  'res.in', 'or.kr', 'go.kr', 'ne.kr', 're.kr', 'pe.kr', 'ed.jp', 'go.jp', 'lg.jp', 'ad.jp', 'gr.jp',
  'idv.tw', 'idv.hk', 'k12.tr', 'av.tr', 'bel.tr', 'dr.tr', 'gen.tr', 'pol.tr', 'tel.tr', 'tv.tr', 'web.tr',
  // PRIVATE: hosting platforms (each subdomain is a different tenant)
  'github.io', 'githubusercontent.com', 'gitlab.io', 'bitbucket.io', 'pages.dev', 'workers.dev', 'vercel.app',
  'now.sh', 'netlify.app', 'netlify.com', 'herokuapp.com', 'herokussl.com', 'blogspot.com', 'blogspot.com.br',
  'appspot.com', 'web.app', 'firebaseapp.com', 'azurewebsites.net', 'azurestaticapps.net', 'cloudapp.net',
  'cloudapp.azure.com', 'trafficmanager.net', 'cloudfront.net', 's3.amazonaws.com', 'elasticbeanstalk.com',
  'amplifyapp.com', 'onrender.com', 'fly.dev', 'glitch.me', 'repl.co', 'replit.app', 'replit.dev', 'ngrok.io',
  'ngrok-free.app', 'ngrok.app', 'duckdns.org', 'ddns.net', 'no-ip.org', 'dynu.net', 'myshopify.com',
  'wordpress.com', 'wpcomstaging.com', 'tumblr.com', 'wixsite.com', 'squarespace.com', 'weebly.com',
  'webflow.io', 'carrd.co', 'neocities.org', 'surge.sh', 'readthedocs.io', 'gitbook.io', 'notion.site',
  'sharepoint.com', 'myftp.org', 'dyndns.org', 'beget.app', 'deno.dev', 'railway.app', 'up.railway.app',
  'translate.goog', 'run.app', 'cloudfunctions.net', 'lovable.app', 'framer.app', 'framer.website', 'itch.io',
  'substack.com', 'mystrikingly.com', 'jimdosite.com', 'ucoz.net', 'free.fr', 'hopto.org', 'zapto.org'
])

// Second-level labels that, under a 2-letter ccTLD, are public registries (com.br, co.uk, org.au, ac.jp...).
const GENERIC_SECOND_LEVEL = new Set(['com', 'net', 'org', 'gov', 'edu', 'co', 'ac', 'ne', 'or', 'go', 'mil', 'gob', 'nic', 'sch'])

const MAX_SITE_LENGTH = 2048

function isIPv4(host) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
}

function isIPv6(host) {
  return host.startsWith('[') || host.includes(':')
}

export function isIpHost(host) {
  return isIPv4(host) || isIPv6(host)
}

export function isLoopbackHost(host) {
  const h = String(host || '').toLowerCase()
  return h === 'localhost' || h.endsWith('.localhost') || h === '[::1]' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h)
}

function stripWww(host) {
  return host.startsWith('www.') ? host.slice(4) : host
}

/**
 * Registrable domain (eTLD+1) of a normalized (lowercase, punycode) host name.
 * Returns null for IPs, localhost, single-label hosts and hosts that are themselves a public suffix.
 */
export function registrableDomain(host) {
  const h = String(host || '').toLowerCase().replace(/\.$/, '')
  if (!h || isIpHost(h) || isLoopbackHost(h)) return null
  const labels = h.split('.')
  if (labels.length < 2 || labels.some((l) => !l)) return null

  // Longest matching suffix from the explicit list (up to 3 labels deep).
  let suffixLabels = 1
  for (let n = Math.min(3, labels.length); n >= 2; n -= 1) {
    if (MULTI_LABEL_SUFFIXES.has(labels.slice(-n).join('.'))) { suffixLabels = n; break }
  }
  if (suffixLabels === 1 && labels.length >= 2) {
    const tld = labels[labels.length - 1]
    const sld = labels[labels.length - 2]
    if (tld.length === 2 && GENERIC_SECOND_LEVEL.has(sld)) suffixLabels = 2
  }
  if (labels.length <= suffixLabels) return null
  return labels.slice(-(suffixLabels + 1)).join('.')
}

function defaultPort(protocol) {
  return protocol === 'https:' ? '443' : protocol === 'http:' ? '80' : ''
}

/**
 * Parses a URL the browser reports for a page. Returns null unless it is http(s) with a host.
 * @returns {{ protocol: string, host: string, port: string, origin: string } | null}
 */
export function parsePageUrl(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_SITE_LENGTH) return null
  let u
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (!u.hostname || u.username || u.password) return null
  const host = u.hostname.toLowerCase()
  return { protocol: u.protocol, host, port: u.port || defaultPort(u.protocol), origin: `${u.protocol}//${u.host.toLowerCase()}` }
}

/**
 * Parses the free-text "site" field of a vault entry.
 * @returns {{ scheme: 'http:'|'https:'|null, host: string, port: string|null } | null}
 */
export function parseEntrySite(raw) {
  const s = String(raw ?? '').trim()
  if (!s || s.length > MAX_SITE_LENGTH || /\s/.test(s)) return null
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s)
  let u
  try { u = new URL(hasScheme ? s : `https://${s}`) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = (u.hostname || '').toLowerCase()
  if (!host) return null
  // "Gmail" or "banco" are labels, not hosts (except localhost).
  if (!host.includes('.') && !isLoopbackHost(host) && !isIpHost(host)) return null
  const scheme = hasScheme ? u.protocol : null
  // URL() drops default ports, so an explicit port here is always a non-default one.
  const port = u.port || null
  return { scheme, host, port }
}

/**
 * How a vault entry's site relates to a page. Returns 'exact', 'domain' or null (no match).
 */
export function matchSite(entrySite, pageUrl) {
  const page = typeof pageUrl === 'string' ? parsePageUrl(pageUrl) : pageUrl
  const entry = typeof entrySite === 'string' ? parseEntrySite(entrySite) : entrySite
  if (!page || !entry) return null

  const loopback = isLoopbackHost(page.host)
  // Scheme / downgrade rules.
  if (page.protocol === 'http:' && !loopback) {
    if (entry.scheme !== 'http:') return null
  }
  if (entry.scheme === 'https:' && page.protocol === 'http:') return null
  // (An entry saved as http:// matching an https page is an upgrade and is allowed.)

  // Port: an entry without an explicit port matches the page's default port only.
  if ((entry.port ?? defaultPort(page.protocol)) !== page.port) return null

  if (stripWww(entry.host) === stripWww(page.host)) return 'exact'

  // Plain-http pages only ever get exact matches (other than loopback, which has no registrable domain anyway).
  if (page.protocol === 'http:') return null

  const a = registrableDomain(entry.host)
  const b = registrableDomain(page.host)
  if (a && b && a === b) return 'domain'
  return null
}

/**
 * Entries that match a page, exact matches first. Never includes passwords.
 * @param {Array<{id:string, site:string, username:string}>} entries
 * @returns {Array<{ entryId: string, username: string, host: string, match: 'exact'|'domain' }>}
 */
export function findMatchingEntries(entries, pageUrl, limit = 20) {
  const page = parsePageUrl(pageUrl)
  if (!page || !Array.isArray(entries)) return []
  const out = []
  for (const e of entries) {
    if (!e || typeof e.id !== 'string') continue
    const parsed = parseEntrySite(e.site)
    const match = matchSite(parsed, page)
    if (!match) continue
    out.push({ entryId: e.id, username: String(e.username ?? ''), host: parsed.host, match })
  }
  out.sort((x, y) => (x.match === y.match ? x.username.localeCompare(y.username) : x.match === 'exact' ? -1 : 1))
  return out.slice(0, limit)
}

/** True when both URLs are http(s) and share the same registrable domain (or the same exact host). */
export function sameSite(urlA, urlB) {
  const a = parsePageUrl(urlA)
  const b = parsePageUrl(urlB)
  if (!a || !b) return false
  if (a.host === b.host) return true
  const ra = registrableDomain(a.host)
  return Boolean(ra) && ra === registrableDomain(b.host)
}

/** Canonical "site" value stored for a login saved from the browser: the page origin (scheme + host[:port]). */
export function siteForSavedLogin(pageUrl) {
  const page = parsePageUrl(pageUrl)
  return page ? page.origin : null
}
