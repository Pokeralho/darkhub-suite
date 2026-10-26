// Latest DarkOS release from darkos.darkhub.ink/releases/. The page is the source of truth; the ISO's SHA-256 comes
// from the .sha256 file published next to it, so the download is always checked against what the site serves.
export const DARKOS_SITE = 'https://darkos.darkhub.ink'

/** Release facts from the releases page HTML (pure). Null when no ISO link is found. */
export function parseReleasePage(html) {
  const s = String(html || '')
  const iso = /href="(?:\.\.\/)?files\/(DarkOS_[A-Za-z0-9_.-]+\.iso)"/.exec(s)?.[1]
  if (!iso) return null
  const text = s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const version = /DarkOS\s+\S+\s+v(\d+(?:\.\d+)*)/.exec(text)?.[1] ?? null
  const build = /_(\d{5}\.\d+)_/.exec(iso)?.[1] ?? null
  const date = /v\d+(?:\.\d+)*\s+(\d{1,2}\s+\S+\s+\d{4})/.exec(text)?.[1] ?? null
  return { version, build, date, isoName: iso, url: `${DARKOS_SITE}/files/${iso}` }
}

/** First 64-hex hash of a `sha256sum` style file (pure). */
export function parseSha256File(text) {
  return /\b([0-9a-f]{64})\b/i.exec(String(text || ''))?.[1]?.toLowerCase() ?? null
}

/** Is the published build newer than the installed one? Builds look like 26300.9550 (pure). */
export function isNewerBuild(latest, installed) {
  const p = (v) => String(v || '').split('.').map(Number)
  const [a, b] = [p(latest), p(installed)]
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0)
  }
  return false
}

export async function fetchLatestRelease(fetchImpl = globalThis.fetch) {
  const get = (u, init) => fetchImpl(u, { headers: { 'user-agent': 'DarkHubSuite' }, signal: AbortSignal.timeout(15000), ...init })
  const page = await get(`${DARKOS_SITE}/releases/`)
  if (!page.ok) throw new Error(`darkos.darkhub.ink respondeu ${page.status}`)
  const rel = parseReleasePage(await page.text())
  if (!rel) throw new Error('Nenhuma ISO encontrada na página de releases do DarkOS')
  const [shaRes, head] = await Promise.all([get(`${rel.url}.sha256`), get(rel.url, { method: 'HEAD' }).catch(() => null)])
  const sha256 = shaRes.ok ? parseSha256File(await shaRes.text()) : null
  if (!sha256) throw new Error('O SHA-256 da ISO não foi publicado: download recusado')
  return { ...rel, sha256, size: Number(head?.headers?.get('content-length')) || null, releasesUrl: `${DARKOS_SITE}/releases/` }
}
