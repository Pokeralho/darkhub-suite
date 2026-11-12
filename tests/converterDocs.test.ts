// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';
// @ts-ignore plain JS module
import { routesFor, commonOutputs, familyOf, parseCsv, toCsv, detectDelimiter, jsonToXml, DOC_INPUTS } from '../electron/services/converter/docRoutes.js';
// @ts-ignore plain JS module
import { htmlToText, epubToHtml, createDocumentConverter } from '../electron/services/converter/DocumentConverter.js';

const outs = (ext: string) => routesFor(ext).map((r: any) => r.out);

describe('document routes', () => {
  it('Office formats go through the bundled LibreOffice with explicit filters', () => {
    expect(outs('docx')).toEqual(['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'epub']);
    expect(routesFor('docx').find((r: any) => r.out === 'pdf')).toMatchObject({ engine: 'lo', convertTo: 'pdf:writer_pdf_Export' });
    expect(outs('xls')).toEqual(['pdf', 'xlsx', 'xls', 'ods', 'csv', 'html']);
    expect(outs('pptx')).toEqual(['pdf', 'pptx', 'ppt', 'odp']);
    expect(commonOutputs(['docx', 'odt'])).toContain('docx');
    expect(familyOf('vsdx')).toBe('draw');
    expect(routesFor('xlsx').find((r: any) => r.out === 'csv').convertTo).toMatch(/^csv:Text - txt - csv \(StarCalc\):44,34,76,1/);
  });

  it('PDF uses pdf.js for text and page images, LibreOffice to become editable', () => {
    const r = routesFor('pdf');
    expect(r.find((x: any) => x.out === 'txt').engine).toBe('pdfjs');
    expect(r.find((x: any) => x.out === 'png').engine).toBe('pdfjs');
    expect(r.find((x: any) => x.out === 'docx')).toMatchObject({ engine: 'lo', infilter: 'writer_pdf_import' });
  });

  it('Markdown, HTML, text and EPUB need no LibreOffice for PDF', () => {
    for (const ext of ['md', 'html', 'txt', 'epub']) expect(routesFor(ext).find((x: any) => x.out === 'pdf').engine).toBe('chromium');
    expect(routesFor('md').find((x: any) => x.out === 'docx')).toMatchObject({ engine: 'lo', viaHtml: true });
  });

  it('a mixed queue only offers outputs every file can reach', () => {
    expect(commonOutputs(['docx', 'odt'])).toEqual(expect.arrayContaining(['pdf', 'rtf', 'epub']));
    expect(commonOutputs(['docx', 'xlsx'])).toEqual(['pdf', 'html']);
    expect(commonOutputs(['json', 'pdf'])).toEqual([]);
    expect(commonOutputs([])).toEqual([]);
    expect(DOC_INPUTS).toEqual(expect.arrayContaining(['doc', 'xlsb', 'pps', 'pages', 'numbers', 'key', 'epub', 'md', 'yaml']));
  });
});

describe('data formats', () => {
  it('parses RFC 4180 CSV and detects the delimiter', () => {
    const csv = '﻿nome;cidade;obs\r\n"Ana";"São Paulo";"diz ""oi""; tchau"\r\nJoão;Recife;"linha1\nlinha2"\r\n';
    expect(detectDelimiter(csv)).toBe(';');
    expect(detectDelimiter('a,b,c\n1,2,3')).toBe(',');
    expect(detectDelimiter('a\tb')).toBe('\t');
    expect(parseCsv(csv, ';')).toEqual([['nome', 'cidade', 'obs'], ['Ana', 'São Paulo', 'diz "oi"; tchau'], ['João', 'Recife', 'linha1\nlinha2']]);
    expect(toCsv([['a', 'b,c'], ['x"y', null]])).toBe('a,"b,c"\r\n"x""y",');
  });

  it('JSON to XML escapes text and fixes invalid tag names', () => {
    expect(jsonToXml({ '1st key': 'a<b', list: [1, 2], n: null })).toBe('<root><_1st_key>a&lt;b</_1st_key><list><item>1</item><item>2</item></list><n/></root>');
  });

  it('extracts readable text from HTML', () => {
    expect(htmlToText('<html><head><title>x</title><style>p{}</style></head><body><h1>Título</h1><p>a&amp;b &#233; <b>c</b></p><script>alert(1)</script></body></html>')).toBe('Título\na&b é c');
  });
});

describe('EPUB reader', () => {
  it('follows the spine, inlines images and drops scripts', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const zip = zipSync({
      mimetype: strToU8('application/epub+zip'),
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>'),
      'OEBPS/content.opf': strToU8('<package><metadata><dc:title>Livro Teste</dc:title></metadata><manifest><item id="c2" href="text/c2.xhtml"/><item id="c1" href="text/c1.xhtml"/><item id="css" href="style.css"/><item id="img" href="img/a.png"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'),
      'OEBPS/style.css': strToU8('p{color:red}'),
      'OEBPS/img/a.png': new Uint8Array(png),
      'OEBPS/text/c1.xhtml': strToU8('<html><body><h1>Capítulo 1</h1><img src="../img/a.png"/><script>bad()</script></body></html>'),
      'OEBPS/text/c2.xhtml': strToU8('<html><body><p onclick="x()">Capítulo 2</p></body></html>')
    });
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'epub-')), 'book.epub');
    fs.writeFileSync(file, zip);
    const { title, html } = await epubToHtml(file);
    expect(title).toBe('Livro Teste');
    expect(html.indexOf('Capítulo 1')).toBeLessThan(html.indexOf('Capítulo 2'));
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('p{color:red}');
    expect(html).not.toContain('bad()');
    expect(html).not.toContain('onclick');
  });
});

describe('document converter (JS engines, no LibreOffice needed)', () => {
  it('converts CSV, JSON, YAML, Markdown and text in a batch and keeps distinct output names', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docconv-'));
    const a = path.join(dir, 'dados.csv');
    fs.writeFileSync(a, 'nome,idade\n"Silva, Ana",31\n');
    const b = path.join(dir, 'conf.yaml');
    fs.writeFileSync(b, 'a: 1\nlista: [x, y]\n');
    const c = path.join(dir, 'notas.md');
    fs.writeFileSync(c, '# Título\n\nTexto **forte**.\n\n<script>alert(1)</script>\n');
    const conv = createDocumentConverter({ app: null, htmlToPdf: null });
    const [r1] = await conv.convert([a], { outputDir: dir, outputFormat: 'json' });
    expect(r1.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(r1.outputFile, 'utf8'))).toEqual([{ nome: 'Silva, Ana', idade: '31' }]);
    const [r2] = await conv.convert([b], { outputDir: dir, outputFormat: 'json' });
    expect(JSON.parse(fs.readFileSync(r2.outputFile, 'utf8'))).toEqual({ a: 1, lista: ['x', 'y'] });
    const [r3] = await conv.convert([c], { outputDir: dir, outputFormat: 'html' });
    const html = fs.readFileSync(r3.outputFile, 'utf8');
    expect(html).toContain('<h1>Título</h1>');
    expect(html).toContain('<strong>forte</strong>');
    expect(html).not.toContain('<script>');
    const [r4] = await conv.convert([a], { outputDir: dir, outputFormat: 'pptx' });
    expect(r4.ok).toBe(false); // CSV cannot become a presentation
    // the converter never leaves its temp folder behind
    expect(fs.readdirSync(dir).filter((f) => f.startsWith('.darkhub-convert-'))).toEqual([]);
  });
});
