/**
 * Imported overlay layouts carry their own CSS, which the editor injects into a ShadowRoot of the main
 * window. The main window's CSP allows `img-src https:`, so a shared layout could use
 * `background: url(https://tracker/...)` (or @import, image-set("https://..."), a UNC path, ...) as a beacon
 * that fires when the user only previews it. This strips every external reference and keeps data: URIs and
 * local/relative paths.
 */

const BLOCKED_URL = 'url("data:,")'

/** Decode CSS escapes that spell plain URL/at-rule characters, so `u\72l(` or `@\69mport` cannot hide. */
function decodeHarmlessEscapes(css: string): string {
  return css.replace(/\\([0-9a-fA-F]{1,6})\s?|\\([^\n0-9a-fA-F])/g, (match, hex: string | undefined, ch: string | undefined) => {
    const c = hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : ch ?? ''
    return /[A-Za-z0-9:/@(.\\-]/.test(c) ? c : match
  })
}

/** True when a url()/string target would leave the machine (or hit a UNC share): anything but data: and local paths. */
export function isExternalCssUrl(raw: string): boolean {
  // Browsers drop tabs/newlines inside URLs and trim spaces; normalise the same way before judging.
  const target = raw.replace(/[\t\n\r\f]/g, '').trim().replace(/^['"]|['"]$/g, '').trim()
  if (!target) return false
  if (/^[\\/]{2}/.test(target)) return true // //host/x, \\server\share, /\host
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(target)
  if (!scheme) return false // relative or absolute path on the app's own origin
  return scheme[1].toLowerCase() !== 'data'
}

export function sanitizeImportedCss(input: string): string {
  let css = decodeHarmlessEscapes(String(input ?? ''))
  // No markup at all. Removing "</style" in one pass was not enough: "</st</styleyle>" collapses back into
  // "</style>" and what follows used to be parsed as HTML in the main window. "\3c " is the CSS escape for "<",
  // so a selector or string that really needs the character still works and no tag can be spelled.
  css = css.replace(/</g, '\\3c ')
  // @import always fetches a stylesheet; local imports are not useful in a single-file layout either.
  css = css.replace(/@import\b[^;]*;?/gi, '')
  // url(...) with or without quotes.
  css = css.replace(/url\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^)]*)\s*\)/gi, (match, target: string) =>
    isExternalCssUrl(target) ? BLOCKED_URL : match
  )
  // Bare strings are fetched too: image-set("https://..." 1x), @font-face src: "..." in some engines.
  css = css.replace(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g, (match, dq: string | undefined, sq: string | undefined) => {
    const body = dq ?? sq ?? ''
    if (/^data:,?$/.test(body)) return match
    return isExternalCssUrl(body) ? '""' : match
  })
  return css
}
