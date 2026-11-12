// Document, spreadsheet, presentation, e-book and data conversion without anything installed on Windows:
// LibreOffice ships with the app (vendor/libreoffice -> resources/libreoffice, scripts/fetch-libreoffice.ps1), PDF
// text/pages come from pdf.js, HTML/Markdown/EPUB -> PDF use Electron's Chromium, data formats are plain JS.
import path from 'node:path'
import fs from 'node:fs/promises'
import fsRaw from 'node:fs'
import { pathToFileURL } from 'node:url'
import { run, uniqueOutputPath, extOf } from './processUtil.js'
import { bundledSofficePath } from './vendorTools.js'
import { routesFor, detectDelimiter, parseCsv, toCsv, jsonToXml } from './docRoutes.js'

const SOFFICE_FALLBACKS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.com',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com'
]

/** The bundled LibreOffice, else an installed one (developer machines without `npm run build:libreoffice`). */
export function findSoffice() {
  const bundled = bundledSofficePath()
  if (bundled) return { path: bundled, bundled: true }
  for (const p of SOFFICE_FALLBACKS) if (fsRaw.existsSync(p)) return { path: p, bundled: false }
  return null
}

const PAGE_CSS = `body{font-family:"Segoe UI",Arial,sans-serif;max-width:820px;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1f2328}
pre,code{font-family:Consolas,"Cascadia Mono",monospace;background:#f6f8fa;border-radius:4px}pre{padding:12px;overflow:auto;white-space:pre-wrap}
code{padding:.1em .3em}table{border-collapse:collapse}td,th{border:1px solid #d0d7de;padding:4px 8px}img{max-width:100%}
blockquote{border-left:4px solid #d0d7de;margin:0;padding:0 1em;color:#59636e}h1,h2{border-bottom:1px solid #d8dee4;padding-bottom:.3em}`

const htmlEsc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const wrapHtml = (title, body, css = PAGE_CSS) =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${htmlEsc(title)}</title><style>${css}</style></head><body>${body}</body></html>`

/** Visible text of an HTML document (scripts/styles dropped, blocks become line breaks, entities decoded). */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' }

/** Reads an EPUB into one self-contained HTML document (images inlined, scripts removed). */
export async function epubToHtml(file) {
  const { unzipSync, strFromU8 } = await import('fflate')
  const zip = unzipSync(new Uint8Array(await fs.readFile(file)))
  const get = (p) => zip[p] || zip[decodeURIComponent(p)]
  const container = get('META-INF/container.xml')
  if (!container) throw new Error('EPUB without META-INF/container.xml')
  const opfPath = (strFromU8(container).match(/full-path="([^"]+)"/) || [])[1]
  const opf = opfPath && get(opfPath)
  if (!opf) throw new Error('EPUB package (OPF) not found')
  const opfText = strFromU8(opf)
  const baseDir = path.posix.dirname(opfPath) === '.' ? '' : `${path.posix.dirname(opfPath)}/`
  const manifest = {}
  for (const m of opfText.matchAll(/<item\b[^>]*>/g)) {
    const id = (m[0].match(/\bid="([^"]+)"/) || [])[1]
    const href = (m[0].match(/\bhref="([^"]+)"/) || [])[1]
    if (id && href) manifest[id] = path.posix.normalize(baseDir + href)
  }
  const title = (opfText.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/) || [])[1] || path.basename(file, '.epub')
  const spine = [...opfText.matchAll(/<itemref\b[^>]*idref="([^"]+)"/g)].map((m) => manifest[m[1]]).filter(Boolean)
  let css = ''
  for (const href of Object.values(manifest)) if (/\.css$/i.test(href) && get(href)) css += strFromU8(get(href)) + '\n'
  const parts = []
  for (const doc of spine) {
    const data = get(doc)
    if (!data) continue
    let body = strFromU8(data)
    body = (body.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [null, body])[1]
    body = body.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '')
    const dir = path.posix.dirname(doc)
    body = body.replace(/(<(?:img|image)\b[^>]*?\s(?:src|xlink:href|href)=")([^"]+)(")/gi, (all, a, src, z) => {
      if (/^(data|https?):/i.test(src)) return all
      const p = path.posix.normalize(`${dir}/${decodeURIComponent(src)}`)
      const bytes = get(p)
      const mime = MIME[extOf(p)]
      return bytes && mime ? `${a}data:${mime};base64,${Buffer.from(bytes).toString('base64')}${z}` : all
    })
    parts.push(`<section class="epub-chapter">${body}</section>`)
  }
  if (!parts.length) throw new Error('EPUB has no readable chapters')
  return { title: htmlToText(title), html: wrapHtml(htmlToText(title), parts.join('\n<hr style="page-break-after:always;border:0">\n'), PAGE_CSS + '\n' + css) }
}

export function createDocumentConverter({ app, htmlToPdf, logger } = {}) {
  let loQueue = Promise.resolve()
  const profileUrl = () => pathToFileURL(path.join(app?.getPath?.('userData') || process.cwd(), 'converter', 'lo-profile')).href

  /** Runs one LibreOffice batch (LibreOffice allows one instance per profile, so batches are queued). */
  function runLo(files, { convertTo, infilter, outDir, job }) {
    const task = loQueue.then(async () => {
      const so = findSoffice()
      if (!so) throw new Error('LibreOffice not available')
      const args = [`-env:UserInstallation=${profileUrl()}`, '--headless', '--invisible', '--nologo', '--norestore', '--nolockcheck', '--nodefault', '--nofirststartwizard']
      if (infilter) args.push(`--infilter=${infilter}`)
      args.push('--convert-to', convertTo, '--outdir', outDir, ...files)
      const r = await run(so.path, args, { job, timeoutMs: (3 + files.length) * 60 * 1000, lowPriority: true })
      return r
    })
    loQueue = task.catch(() => {})
    return task
  }

  async function chromiumPdf(htmlFile, outFile) {
    if (typeof htmlToPdf !== 'function') throw new Error('PDF renderer not available')
    await htmlToPdf(htmlFile, outFile)
  }

  async function markdownHtml(file) {
    const { marked } = await import('marked')
    const md = await fs.readFile(file, 'utf8')
    // Raw HTML inside Markdown is kept as text: the result is opened by Chromium (scripts are off anyway).
    const body = marked.parse(md.replace(/^\uFEFF/, ''), { gfm: true, breaks: false, async: false })
    return wrapHtml(path.basename(file, path.extname(file)), body.replace(/<script[\s\S]*?<\/script>/gi, ''))
  }

  async function pdfjs(file, out, outputFile, tmp) {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: await fs.readFile(file) })
    try {
      if (out === 'txt') {
        const r = await parser.getText()
        await fs.writeFile(outputFile, r.text || '', 'utf8')
        return [outputFile]
      }
      const shots = await parser.getScreenshot({ scale: 2, imageDataUrl: false })
      const sharp = (await import('sharp')).default
      const base = outputFile.slice(0, -(out.length + 1))
      const written = []
      for (const p of shots.pages) {
        const target = shots.pages.length === 1 ? outputFile : uniqueOutputPath(path.dirname(outputFile), `${path.basename(base)}-p${String(p.pageNumber).padStart(3, '0')}`, out)
        if (out === 'jpg') await sharp(Buffer.from(p.data)).flatten({ background: '#ffffff' }).jpeg({ quality: 90, mozjpeg: true }).toFile(target)
        else await fs.writeFile(target, Buffer.from(p.data))
        written.push(target)
      }
      return written
    } finally {
      await parser.destroy().catch(() => {})
    }
  }

  async function jsConvert(file, inExt, out, outputFile, tmp) {
    if (['md', 'markdown', 'mdown', 'mkd'].includes(inExt)) {
      const html = await markdownHtml(file)
      if (out === 'html') return fs.writeFile(outputFile, html, 'utf8')
      if (out === 'txt') return fs.writeFile(outputFile, htmlToText(html), 'utf8')
    }
    if (inExt === 'epub') {
      const { html } = await epubToHtml(file)
      if (out === 'html') return fs.writeFile(outputFile, html, 'utf8')
      if (out === 'txt') return fs.writeFile(outputFile, htmlToText(html), 'utf8')
    }
    if (['html', 'htm', 'xhtml'].includes(inExt) && out === 'txt') return fs.writeFile(outputFile, htmlToText(await fs.readFile(file, 'utf8')), 'utf8')
    if (['txt', 'text', 'log'].includes(inExt) && out === 'html') {
      const t = await fs.readFile(file, 'utf8')
      return fs.writeFile(outputFile, wrapHtml(path.basename(file), `<pre>${htmlEsc(t.replace(/^\uFEFF/, ''))}</pre>`), 'utf8')
    }
    if ((inExt === 'csv' || inExt === 'tsv') && out === 'json') {
      const raw = await fs.readFile(file, 'utf8')
      const rows = parseCsv(raw, inExt === 'tsv' ? '\t' : detectDelimiter(raw))
      const [head = [], ...body] = rows
      const keys = head.map((h, i) => h.trim() || `col${i + 1}`)
      const arr = body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])))
      return fs.writeFile(outputFile, JSON.stringify(arr, null, 2), 'utf8')
    }
    if (inExt === 'json') {
      const json = JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
      if (out === 'xml') return fs.writeFile(outputFile, `<?xml version="1.0" encoding="UTF-8"?>\n${jsonToXml(json)}`, 'utf8')
      if (out === 'yaml') { const YAML = (await import('yaml')).default; return fs.writeFile(outputFile, YAML.stringify(json), 'utf8') }
      if (out === 'csv') {
        const arr = Array.isArray(json) ? json : [json]
        const keys = [...new Set(arr.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : ['value'])))]
        const rows = [keys, ...arr.map((o) => keys.map((k) => (o && typeof o === 'object' ? o[k] : o)))]
        return fs.writeFile(outputFile, '\uFEFF' + toCsv(rows), 'utf8')
      }
    }
    if ((inExt === 'yaml' || inExt === 'yml') && out === 'json') {
      const YAML = (await import('yaml')).default
      return fs.writeFile(outputFile, JSON.stringify(YAML.parse(await fs.readFile(file, 'utf8')), null, 2), 'utf8')
    }
    throw new Error(`no converter for .${inExt} -> .${out}`)
  }

  async function chromiumConvert(file, inExt, outputFile, tmp) {
    let htmlFile = file
    if (['md', 'markdown', 'mdown', 'mkd'].includes(inExt)) {
      htmlFile = path.join(tmp, 'markdown.html')
      // <base> = the source folder, so relative image paths in the Markdown still resolve.
      const baseHref = pathToFileURL(path.dirname(file) + path.sep).href
      await fs.writeFile(htmlFile, (await markdownHtml(file)).replace('<head>', `<head><base href="${baseHref}">`), 'utf8')
    } else if (inExt === 'epub') {
      htmlFile = path.join(tmp, 'book.html')
      await fs.writeFile(htmlFile, (await epubToHtml(file)).html, 'utf8')
    } else if (['txt', 'text', 'log'].includes(inExt)) {
      htmlFile = path.join(tmp, 'text.html')
      const t = await fs.readFile(file, 'utf8')
      await fs.writeFile(htmlFile, wrapHtml(path.basename(file), `<pre style="background:none;font-size:10.5pt">${htmlEsc(t.replace(/^\uFEFF/, ''))}</pre>`), 'utf8')
    }
    await chromiumPdf(htmlFile, outputFile)
  }

  /**
   * opts: { outputDir, outputFormat }. Returns [{ inputFile, outputFile, ok, error, engine, outputs? }].
   * LibreOffice routes are batched (one soffice start per group of files with the same filters).
   */
  async function convert(inputFiles, opts, { job, onProgress } = {}) {
    const out = String(opts.outputFormat || '').toLowerCase().trim().replace(/^\./, '')
    await fs.mkdir(opts.outputDir, { recursive: true })
    const tmpRoot = await fs.mkdtemp(path.join(opts.outputDir, '.darkhub-convert-'))
    const results = new Array(inputFiles.length)
    const reserved = []
    const plan = inputFiles.map((file, index) => {
      const inExt = extOf(file)
      const route = routesFor(inExt).find((r) => r.out === out)
      const outputFile = uniqueOutputPath(opts.outputDir, path.basename(file, path.extname(file)), out, [...inputFiles, ...reserved])
      reserved.push(outputFile)
      return { file, index, inExt, route, outputFile }
    })
    let finished = 0
    const progress = (p, stage) => onProgress?.({ index: p.index, total: inputFiles.length, inputFile: p.file, stage, percent: stage === 'done' ? 100 : null, finished: stage === 'encode' ? finished : ++finished })
    const fail = (p, err) => { results[p.index] = { inputFile: p.file, outputFile: p.outputFile, ok: false, error: err?.message ?? String(err) }; progress(p, 'error') }
    const ok = (p, extra = {}) => { results[p.index] = { inputFile: p.file, outputFile: p.outputFile, ok: true, engine: p.route.engine, ...extra }; progress(p, 'done') }

    try {
      const loGroups = new Map()
      for (const p of plan) {
        if (job?.cancelled) { results[p.index] = { inputFile: p.file, outputFile: p.outputFile, ok: false, cancelled: true, error: 'cancelled' }; continue }
        if (!p.route) { fail(p, new Error(`.${p.inExt} -> .${out} is not supported`)); continue }
        if (p.route.engine === 'lo') {
          let infilter = p.route.infilter || ''
          let src = p.file
          if (p.route.csvInput) {
            const head = (await fs.readFile(p.file, 'utf8').catch(() => '')).slice(0, 64 * 1024)
            const sep = p.inExt === 'tsv' ? '\t' : detectDelimiter(head)
            infilter = `Text - txt - csv (StarCalc):${sep.charCodeAt(0)},34,76,1`
          }
          if (p.route.viaHtml) {
            src = path.join(tmpRoot, `md-${p.index}`, `${path.basename(p.file, path.extname(p.file))}.html`)
            await fs.mkdir(path.dirname(src), { recursive: true })
            await fs.writeFile(src, await markdownHtml(p.file), 'utf8')
          }
          const key = `${infilter}|${p.route.convertTo}`
          if (!loGroups.has(key)) loGroups.set(key, [])
          loGroups.get(key).push({ ...p, src, infilter })
          continue
        }
        progress(p, 'encode')
        const tmp = path.join(tmpRoot, `f${p.index}`)
        await fs.mkdir(tmp, { recursive: true })
        try {
          if (p.route.engine === 'pdfjs') {
            const files = await pdfjs(p.file, out, p.outputFile, tmp)
            ok(p, { outputs: files, outputFile: files[0] })
          } else if (p.route.engine === 'chromium') {
            await chromiumConvert(p.file, p.inExt, p.outputFile, tmp)
            ok(p)
          } else {
            await jsConvert(p.file, p.inExt, out, p.outputFile, tmp)
            ok(p)
          }
        } catch (err) {
          await fs.rm(p.outputFile, { force: true }).catch(() => {})
          fail(p, err)
        }
      }

      for (const [, group] of loGroups) {
        // LibreOffice names outputs after the input: a batch never holds two inputs with the same base name.
        const batches = []
        for (const p of group) {
          const base = path.basename(p.src, path.extname(p.src)).toLowerCase()
          let b = batches.find((x) => !x.names.has(base))
          if (!b) { b = { names: new Set(), items: [] }; batches.push(b) }
          b.names.add(base); b.items.push(p)
        }
        for (const b of batches) {
          if (job?.cancelled) { for (const p of b.items) results[p.index] = { inputFile: p.file, outputFile: p.outputFile, ok: false, cancelled: true, error: 'cancelled' }; continue }
          const outDir = path.join(tmpRoot, `lo-${Math.random().toString(36).slice(2, 8)}`)
          await fs.mkdir(outDir, { recursive: true })
          for (const p of b.items) progress(p, 'encode')
          let r = null
          let err = null
          try { r = await runLo(b.items.map((p) => p.src), { convertTo: b.items[0].route.convertTo, infilter: b.items[0].infilter, outDir, job }) } catch (e) { err = e }
          const produced = await fs.readdir(outDir).catch(() => [])
          for (const p of b.items) {
            const base = path.basename(p.src, path.extname(p.src))
            const main = produced.find((f) => f.toLowerCase() === `${base}.${out}`.toLowerCase())
            // CSV export of every sheet writes "<base>-<sheet>.csv" per sheet.
            const sheets = main ? [] : produced.filter((f) => f.toLowerCase().startsWith(`${base.toLowerCase()}-`) && f.toLowerCase().endsWith(`.${out}`))
            if (!main && sheets.length) {
              const outputs = []
              for (const f of sheets) {
                const target = uniqueOutputPath(path.dirname(p.outputFile), path.basename(f, path.extname(f)), out, inputFiles)
                await fs.rename(path.join(outDir, f), target).catch(async () => { await fs.copyFile(path.join(outDir, f), target) })
                outputs.push(target)
              }
              ok(p, { outputs, outputFile: outputs[0] })
              continue
            }
            if (!main) {
              const why = err?.message || (r?.cancelled ? 'cancelled' : String(r?.stderr || r?.stdout || '').split(/\r?\n/).filter((l) => /error/i.test(l)).pop()) || 'LibreOffice produced no output'
              fail(p, new Error(why))
              continue
            }
            await fs.rename(path.join(outDir, main), p.outputFile).catch(async () => { await fs.copyFile(path.join(outDir, main), p.outputFile) })
            // HTML export writes its images beside the page.
            const extras = produced.filter((f) => f !== main && f.toLowerCase().startsWith(`${base.toLowerCase()}_`))
            for (const f of extras) await fs.rename(path.join(outDir, f), path.join(path.dirname(p.outputFile), f)).catch(() => {})
            ok(p)
          }
        }
      }
    } finally {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
    }
    return results.map((r, i) => r || { inputFile: inputFiles[i], ok: false, error: 'not converted' })
  }

  return { convert }
}
