// Which document conversions exist and which engine does each one. Pure data + lookups, shared by the converter,
// the IPC capability report and the tests. Engines:
//   lo       bundled LibreOffice (headless)            Office/OpenDocument/legacy formats, high fidelity
//   pdfjs    pdf-parse (pdf.js + @napi-rs/canvas)       PDF -> text, PDF pages -> PNG/JPG
//   chromium Electron's own Chromium (printToPDF)       HTML/Markdown/TXT/EPUB -> PDF
//   js       in-process                                 Markdown/EPUB -> HTML/TXT, CSV/JSON/XML/YAML data

export const LO_FAMILIES = {
  writer: {
    inputs: ['doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'odt', 'ott', 'fodt', 'rtf', 'wpd', 'wps', 'abw', 'zabw', 'lwp', 'hwp', 'pages', 'sxw', 'wri'],
    outputs: ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'epub']
  },
  calc: {
    inputs: ['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'ots', 'fods', 'numbers', 'sxc', 'dbf', 'slk', 'wk1', 'wks'],
    outputs: ['pdf', 'xlsx', 'xls', 'ods', 'csv', 'html']
  },
  impress: {
    inputs: ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'pot', 'potx', 'odp', 'otp', 'fodp', 'key', 'sxi'],
    outputs: ['pdf', 'pptx', 'ppt', 'odp']
  },
  draw: {
    inputs: ['vsd', 'vsdx', 'vdx', 'odg', 'fodg', 'cdr', 'pub', 'wpg'],
    outputs: ['pdf', 'odg', 'png', 'svg']
  }
}

/** LibreOffice --convert-to value per (family, output): explicit filters where the default is ambiguous. */
export const LO_EXPORT = {
  writer: { pdf: 'pdf:writer_pdf_Export', docx: 'docx:MS Word 2007 XML', doc: 'doc:MS Word 97', odt: 'odt:writer8', rtf: 'rtf:Rich Text Format', txt: 'txt:Text (encoded):UTF8', html: 'html:HTML (StarWriter)', epub: 'epub:EPUB' },
  calc: { pdf: 'pdf:calc_pdf_Export', xlsx: 'xlsx:Calc Office Open XML', xls: 'xls:MS Excel 97', ods: 'ods:calc8', csv: 'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1', html: 'html:HTML (StarCalc)' },
  impress: { pdf: 'pdf:impress_pdf_Export', pptx: 'pptx:Impress Office Open XML', ppt: 'ppt:MS PowerPoint 97', odp: 'odp:impress8' },
  draw: { pdf: 'pdf:draw_pdf_Export', odg: 'odg:draw8', png: 'png:draw_png_Export', svg: 'svg:draw_svg_Export' }
}

const TEXT_INPUTS = ['txt', 'text', 'log']
const MD_INPUTS = ['md', 'markdown', 'mdown', 'mkd']
const HTML_INPUTS = ['html', 'htm', 'xhtml']
const CSV_INPUTS = ['csv', 'tsv']

export function familyOf(ext) {
  for (const [name, f] of Object.entries(LO_FAMILIES)) if (f.inputs.includes(ext)) return name
  return null
}

/**
 * Every output reachable from an input extension: [{ out, engine, infilter?, convertTo? }]. The first route for an
 * output wins (cheapest engine first).
 */
export function routesFor(inExt) {
  const ext = String(inExt || '').toLowerCase()
  const r = []
  const add = (out, engine, extra = {}) => { if (!r.some((x) => x.out === out)) r.push({ out, engine, ...extra }) }
  const fam = familyOf(ext)
  // Same format is allowed (LibreOffice re-saves it): a mixed .docx + .odt queue can still all become .docx.
  if (fam) for (const out of LO_FAMILIES[fam].outputs) add(out, 'lo', { family: fam, convertTo: LO_EXPORT[fam][out] })
  if (ext === 'pdf') {
    add('txt', 'pdfjs')
    add('png', 'pdfjs')
    add('jpg', 'pdfjs')
    add('docx', 'lo', { family: 'writer', infilter: 'writer_pdf_import', convertTo: LO_EXPORT.writer.docx })
    add('odt', 'lo', { family: 'writer', infilter: 'writer_pdf_import', convertTo: LO_EXPORT.writer.odt })
    add('odg', 'lo', { family: 'draw', convertTo: LO_EXPORT.draw.odg })
  }
  if (MD_INPUTS.includes(ext)) {
    add('html', 'js')
    add('pdf', 'chromium')
    add('docx', 'lo', { family: 'writer', viaHtml: true, infilter: 'HTML (StarWriter)', convertTo: LO_EXPORT.writer.docx })
    add('odt', 'lo', { family: 'writer', viaHtml: true, infilter: 'HTML (StarWriter)', convertTo: LO_EXPORT.writer.odt })
    add('txt', 'js')
  }
  if (HTML_INPUTS.includes(ext)) {
    add('pdf', 'chromium')
    add('txt', 'js')
    for (const out of ['docx', 'odt', 'rtf', 'doc', 'epub']) add(out, 'lo', { family: 'writer', infilter: 'HTML (StarWriter)', convertTo: LO_EXPORT.writer[out] })
  }
  if (TEXT_INPUTS.includes(ext)) {
    add('pdf', 'chromium')
    add('html', 'js')
    for (const out of ['docx', 'odt', 'rtf']) add(out, 'lo', { family: 'writer', infilter: 'Text (encoded):UTF8', convertTo: LO_EXPORT.writer[out] })
  }
  if (ext === 'epub') {
    add('html', 'js')
    add('txt', 'js')
    add('pdf', 'chromium')
  }
  if (CSV_INPUTS.includes(ext)) {
    add('json', 'js')
    for (const out of ['xlsx', 'ods', 'xls', 'pdf', 'html']) add(out, 'lo', { family: 'calc', csvInput: true, convertTo: LO_EXPORT.calc[out] })
  }
  if (ext === 'json') { add('csv', 'js'); add('xml', 'js'); add('yaml', 'js') }
  if (ext === 'yaml' || ext === 'yml') add('json', 'js')
  return r
}

export const DOC_INPUTS = [...new Set([
  ...Object.values(LO_FAMILIES).flatMap((f) => f.inputs), 'pdf', ...MD_INPUTS, ...HTML_INPUTS, ...TEXT_INPUTS,
  'epub', ...CSV_INPUTS, 'json', 'yaml', 'yml'
])]

/** Outputs every file in the queue can reach (what the UI may offer for a mixed selection). */
export function commonOutputs(exts) {
  const lists = exts.map((e) => routesFor(e).map((r) => r.out))
  if (!lists.length) return []
  return lists.reduce((acc, l) => acc.filter((o) => l.includes(o)))
}

/** CSV/TSV delimiter guess from the first non-empty line, as a LibreOffice CSV token (char code). */
export function detectDelimiter(text) {
  const line = String(text || '').split(/\r?\n/).find((l) => l.trim()) || ''
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 }
  let q = false
  for (const ch of line) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++ }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : ','
}

/** RFC 4180 CSV parser (quoted fields, doubled quotes, CR/LF inside quotes). */
export function parseCsv(text, delimiter = ',') {
  const rows = []
  let row = []
  let field = ''
  let q = false
  const s = String(text || '').replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++ } else q = false } else field += c
    } else if (c === '"') q = true
    else if (c === delimiter) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

export function toCsv(rows) {
  const cell = (v) => {
    const t = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return rows.map((r) => r.map(cell).join(',')).join('\r\n')
}

const xmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const xmlName = (k) => { const n = String(k).replace(/[^A-Za-z0-9_.-]/g, '_'); return /^[A-Za-z_]/.test(n) ? n : `_${n}` }

export function jsonToXml(value, tag = 'root') {
  const t = xmlName(tag)
  if (value === null || value === undefined) return `<${t}/>`
  if (Array.isArray(value)) return `<${t}>${value.map((v) => jsonToXml(v, 'item')).join('')}</${t}>`
  if (typeof value === 'object') return `<${t}>${Object.entries(value).map(([k, v]) => jsonToXml(v, k)).join('')}</${t}>`
  return `<${t}>${xmlEsc(value)}</${t}>`
}
