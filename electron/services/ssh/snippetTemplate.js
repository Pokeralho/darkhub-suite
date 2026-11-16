// Snippet placeholders: {{name}} in the body. Values are single-quoted for POSIX shells unless the argument is
// marked raw, and control characters (newlines included) are always refused, so an argument can never smuggle a
// second command into the session.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/
const PLACEHOLDER_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,31})\s*\}\}/g
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x08\x0a-\x1f\x7f]/

export class SnippetArgError extends Error {
  constructor(code, message, names = []) {
    super(message)
    this.code = code
    this.names = names
  }
}

/** Placeholder names in order of first appearance. */
export function placeholdersOf(body) {
  const out = []
  for (const m of String(body ?? '').matchAll(PLACEHOLDER_RE)) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** Keeps the declared args that the body uses, adds the ones only found in the body. */
export function normalizeArgsSchema(schema, body) {
  const used = placeholdersOf(body)
  const declared = new Map()
  for (const a of Array.isArray(schema) ? schema : []) {
    const name = typeof a?.name === 'string' ? a.name.trim() : ''
    if (!NAME_RE.test(name) || declared.has(name)) continue
    declared.set(name, {
      name,
      label: typeof a.label === 'string' ? a.label.slice(0, 80) : '',
      default: typeof a.default === 'string' ? a.default.slice(0, 1024) : '',
      raw: a.raw === true
    })
  }
  return used.map((name) => declared.get(name) ?? { name, label: '', default: '', raw: false })
}

export function shellQuote(value) {
  const v = String(value)
  if (v === '') return "''"
  if (/^[A-Za-z0-9_./:=@%+,-]+$/.test(v)) return v
  return `'${v.replace(/'/g, `'\\''`)}'`
}

/**
 * Interpolates args into the snippet body and returns what is written to the PTY (lines joined with CR, ending
 * with CR so the last line runs).
 */
export function renderSnippet(snippet, args = {}) {
  const body = String(snippet?.body ?? '')
  const schema = normalizeArgsSchema(snippet?.argsSchema, body)
  const values = {}
  const missing = []
  const invalid = []
  for (const a of schema) {
    const given = args && Object.prototype.hasOwnProperty.call(args, a.name) ? args[a.name] : undefined
    const v = given == null || given === '' ? a.default : String(given)
    if (v == null || v === '') { missing.push(a.name); continue }
    if (CONTROL_RE.test(v) || v.length > 1024) { invalid.push(a.name); continue }
    values[a.name] = a.raw ? v : shellQuote(v)
  }
  if (missing.length) throw new SnippetArgError('MISSING_ARG', `Missing value for: ${missing.join(', ')}`, missing)
  if (invalid.length) throw new SnippetArgError('INVALID_ARG', `Invalid value for: ${invalid.join(', ')}`, invalid)
  const text = body.replace(PLACEHOLDER_RE, (_m, name) => values[name])
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  return `${lines.join('\r')}\r`
}
