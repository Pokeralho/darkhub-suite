// DarkHub extensions: new screens and widgets for the app, written in HTML/CSS/JS and shipped as a package of type
// "extension". They run in a sandboxed frame with no Node, no disk, no direct network and no access to the app's page;
// everything goes through a bridge that only answers the permissions the user approved. Pure, no IO.

export const MAX_EXTENSION_BYTES = 2 * 1024 * 1024
/** Extension pages: inline code only, no network, no remote anything. Sent as a header and repeated as a <meta>. */
export const EXT_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'"

export const PERMISSIONS = {
  storage: { risk: 0, pt: 'Guardar os próprios dados (só desta extensão)', en: 'Keep its own data (this extension only)' },
  hardware: { risk: 0, pt: 'Ler dados do PC (CPU, GPU, memória, tipo de máquina)', en: 'Read PC facts (CPU, GPU, memory, kind of machine)' },
  sensors: { risk: 0, pt: 'Ler sensores ao vivo (temperatura, uso, clocks)', en: 'Read live sensors (temperature, load, clocks)' },
  'tweaks.read': { risk: 0, pt: 'Ver quais ajustes do DarkHub estão ligados', en: 'See which DarkHub tweaks are on' },
  notifications: { risk: 0, pt: 'Mostrar notificações do Windows', en: 'Show Windows notifications' },
  clipboard: { risk: 0, pt: 'Copiar texto para a área de transferência', en: 'Copy text to the clipboard' },
  network: { risk: 1, pt: 'Acessar a internet, só nestes endereços', en: 'Use the internet, only these addresses' },
  packages: { risk: 1, pt: 'Pedir para instalar pacotes do DarkHub (você aprova cada um)', en: 'Ask to install DarkHub packages (you approve each one)' }
}

/** Static review aid: patterns that deserve a human look. Not a verdict, never blocks by itself. */
const RULES = [
  { id: 'eval', sev: 'high', re: /\beval\s*\(/, pt: 'usa eval()', en: 'uses eval()' },
  { id: 'function-ctor', sev: 'high', re: /\bnew\s+Function\s*\(|\bFunction\s*\(\s*['"`]/, pt: 'cria código a partir de texto (Function)', en: 'builds code from text (Function)' },
  { id: 'string-timer', sev: 'medium', re: /\bset(?:Timeout|Interval)\s*\(\s*['"`]/, pt: 'timer com código em texto', en: 'timer with code as text' },
  { id: 'escape-frame', sev: 'high', re: /\b(?:window\.)?(?:top|parent|opener)\s*\.\s*(?:location|document|darkhub|postMessage)/, pt: 'tenta falar com a janela do DarkHub fora da ponte', en: 'tries to reach the DarkHub window outside the bridge' },
  { id: 'remote-code', sev: 'high', re: /<script[^>]+src\s*=\s*['"]?(?:https?:)?\/\//i, pt: 'tenta carregar script de fora', en: 'tries to load a remote script' },
  { id: 'raw-network', sev: 'medium', re: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator\.sendBeacon)\b/, pt: 'rede direta (bloqueada: use darkhub.net.fetch)', en: 'direct network (blocked: use darkhub.net.fetch)' },
  { id: 'dynamic-import', sev: 'medium', re: /\bimport\s*\(/, pt: 'import dinâmico', en: 'dynamic import' },
  { id: 'doc-write', sev: 'low', re: /\bdocument\.write\s*\(/, pt: 'usa document.write', en: 'uses document.write' },
  { id: 'base64-blob', sev: 'medium', re: /[A-Za-z0-9+/]{400,}={0,2}/, pt: 'bloco grande em base64 (pode esconder código)', en: 'large base64 block (may hide code)' },
  { id: 'hex-escapes', sev: 'medium', re: /(?:\\x[0-9a-fA-F]{2}){20,}|(?:\\u[0-9a-fA-F]{4}){20,}/, pt: 'texto escapado longo (ofuscação)', en: 'long escaped text (obfuscation)' }
]

/** Findings per file and line: [{ file, line, rule, severity, message: { pt, en } }]. Minified files get one finding. */
export function scanExtension(pkg) {
  const out = []
  for (const [file, src] of Object.entries(pkg.files || {})) {
    if (!/\.(js|html)$/.test(file)) continue
    const lines = String(src).split('\n')
    if (lines.some((l) => l.length > 1500)) out.push({ file, line: 1, rule: 'minified', severity: 'medium', message: { pt: 'código minificado ou ofuscado: peça o código-fonte legível', en: 'minified or obfuscated code: ask for readable source' } })
    lines.forEach((l, i) => {
      for (const r of RULES) if (r.re.test(l)) out.push({ file, line: i + 1, rule: r.id, severity: r.sev, message: { pt: r.pt, en: r.en } })
    })
  }
  return out.slice(0, 200)
}

const lowerKeys = (o) => Object.keys(o || {})

/** Rules the schema cannot express. Returns { errors, risk, findings }. */
export function validateExtension(pkg) {
  const errors = []
  const files = pkg.files || {}
  const size = Object.values(files).reduce((n, s) => n + Buffer.byteLength(String(s), 'utf8'), 0)
  if (size > MAX_EXTENSION_BYTES) errors.push({ path: 'files', message: 'arquivos da extensão passam de 2 MB.' })
  for (const f of lowerKeys(files)) if (f.split('/').some((p) => p === '..' || p === '.')) errors.push({ path: `files.${f}`, message: 'caminho inválido.' })
  const perms = new Set(pkg.permissions || [])
  for (const [kind, list] of [['pages', pkg.contributes?.pages], ['widgets', pkg.contributes?.widgets]]) {
    const ids = new Set()
    ;(list || []).forEach((p, i) => {
      if (ids.has(p.id)) errors.push({ path: `contributes.${kind}.${i}.id`, message: `id repetido: ${p.id}` })
      ids.add(p.id)
      if (!(p.entry in files)) errors.push({ path: `contributes.${kind}.${i}.entry`, message: `o arquivo ${p.entry} não está em "files".` })
    })
  }
  if (perms.has('network') && !(pkg.network || []).length) errors.push({ path: 'network', message: 'a permissão network precisa da lista de endereços em "network".' })
  if (!perms.has('network') && (pkg.network || []).length) errors.push({ path: 'network', message: '"network" sem a permissão network.' })
  const findings = scanExtension(pkg)
  const level = Math.max(0, ...[...perms].map((p) => PERMISSIONS[p]?.risk || 0), findings.some((f) => f.severity === 'high') ? 2 : 0)
  return { errors, findings, risk: ['low', 'medium', 'high'][level] }
}

/** Rows for previews: one per permission (with the network origins) and one per screen/widget. */
export function describeExtension(pkg, lang = 'pt-BR') {
  const pt = lang !== 'en-US'
  const name = (t) => (typeof t === 'string' ? t : t?.[lang] || t?.['pt-BR'] || t?.['en-US'] || '')
  const rows = []
  ;(pkg.permissions || []).forEach((p) => {
    const d = PERMISSIONS[p]
    rows.push({ kind: 'permission', group: pt ? 'Permissão' : 'Permission', title: d ? (pt ? d.pt : d.en) : p, target: p === 'network' ? (pkg.network || []).join(', ') : '', id: p })
  })
  ;(pkg.contributes?.pages || []).forEach((p) => rows.push({ kind: 'page', group: pt ? 'Tela nova' : 'New screen', title: name(p.title), target: '', id: p.id }))
  ;(pkg.contributes?.widgets || []).forEach((w) => rows.push({ kind: 'widget', group: pt ? 'Cartão no painel' : 'Dashboard card', title: name(w.title), target: '', id: w.id }))
  return rows
}

const esc = (s) => String(s).replace(/<\/(script|style)/gi, '<\\/$1')

/**
 * The HTML the sandboxed frame loads for one page: a strict CSP (no network, no remote code), the DarkHub look, the
 * bridge client, then the page with its own <script src> and <link href> replaced by the files' contents.
 */
export function buildExtensionDoc(pkg, entry, { bridgeJs, baseCss, lang = 'pt-BR', theme = {} } = {}) {
  const files = pkg.files || {}
  let html = String(files[entry] || '<p>Arquivo não encontrado.</p>')
  const dir = entry.includes('/') ? entry.slice(0, entry.lastIndexOf('/') + 1) : ''
  const resolve = (ref) => {
    if (/^[a-z]+:|^\/\//i.test(ref)) return null
    const parts = (dir + ref.replace(/^\.\//, '')).split('/')
    const stack = []
    for (const p of parts) { if (p === '..') stack.pop(); else if (p && p !== '.') stack.push(p) }
    return stack.join('/')
  }
  html = html.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, a, src, b) => {
    const f = resolve(src)
    return f && files[f] != null ? `<script${a}${b}>${esc(files[f])}</script>` : '<!-- script removido -->'
  })
  html = html.replace(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi, (m) => {
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(m)?.[1]
    const f = href && resolve(href)
    return f && files[f] != null ? `<style>${esc(files[f])}</style>` : ''
  })
  const csp = EXT_CSP
  const head = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${esc(baseCss || '')}</style><script>window.__DARKHUB_EXT__=${JSON.stringify({ id: pkg.id, version: pkg.version, lang, theme })};${esc(bridgeJs || '')}</script>`
  // our CSP is the very first thing parsed, before anything the extension wrote (its own doctype/html/head merge in)
  return `<!doctype html><html lang="${lang}"><head>${head}</head>${html.replace(/<!doctype[^>]*>/i, '')}`
}

/**
 * What the "sensors" permission returns: a small, stable shape (numbers or null), never the raw snapshot, which also
 * carries process names. Bytes and bytes per second; loads in percent; temperatures in °C.
 */
export function sensorsForExtensions(s = {}) {
  const num = (v) => { const x = v && typeof v === 'object' ? v.value : v; return typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 10) / 10 : null }
  const gpu = s.gpu?.values?.gpus?.[0] || {}
  const gpuProbe = (s.temps?.values?.probes || []).find((p) => p?.category === 'gpu')?.temperature
  return {
    at: Date.now(),
    cpu: { load: num(s.cpu?.values?.currentLoad), temp: num(s.temps?.values?.main) ?? num((s.temps?.values?.probes || []).find((p) => p?.category === 'cpu')?.temperature) },
    gpu: { name: typeof gpu.name === 'string' ? gpu.name : null, load: num(gpu.utilization), temp: num(gpuProbe) ?? num(gpu.temperature) },
    ram: { load: num(s.ram?.values?.percent), totalBytes: num(s.ram?.values?.total), usedBytes: num(s.ram?.values?.used) },
    net: { rxBps: num(s.network?.values?.rxBps), txBps: num(s.network?.values?.txBps) },
    disk: { readBps: num(s.diskIo?.values?.readBps), writeBps: num(s.diskIo?.values?.writeBps), activity: num(s.diskIo?.values?.activity) }
  }
}
