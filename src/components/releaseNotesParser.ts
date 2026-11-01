// Release notes come as GitHub Markdown (GitHub API) or as HTML (electron-updater converts them). Both are turned into
// a small block list that ReleaseNotes renders with React elements: nothing from the network is injected as HTML.

export type Inline = { t: 'text' | 'b' | 'i' | 'code'; v: string } | { t: 'link'; v: string; href: string };
export type Block =
  | { t: 'h'; level: 1 | 2 | 3; text: Inline[] }
  | { t: 'p'; text: Inline[] }
  | { t: 'ul' | 'ol'; items: Inline[][] }
  | { t: 'code'; v: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'hr' };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decode = (s: string) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

/** HTML release notes → Markdown, keeping only structure (headings, lists, code, links, emphasis). */
export function htmlToMarkdown(html: string): string {
  let s = html.replace(/\r/g, '');
  s = s.replace(/<pre[^>]*>(?:\s*<code[^>]*>)?([\s\S]*?)(?:<\/code>\s*)?<\/pre>/gi, (_m, c: string) => `\n\`\`\`\n${decode(c.replace(/<[^>]+>/g, ''))}\n\`\`\`\n`);
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, l: string, c: string) => `\n${'#'.repeat(Math.min(3, Number(l)))} ${c}\n`);
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, c: string) => `\n- ${c.replace(/<\/?p[^>]*>/gi, ' ').trim()}`);
  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, h: string, c: string) => `[${c}](${h})`);
  s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**').replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*').replace(/<code>([\s\S]*?)<\/code>/gi, '`$1`');
  s = s.replace(/<hr\s*\/?>/gi, '\n---\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|ul|ol|table|tr|div)>/gi, '\n');
  s = s.replace(/<\/t[hd]>/gi, ' | ').replace(/<[^>]+>/g, '');
  return decode(s).replace(/\n{3,}/g, '\n\n').trim();
}

const looksHtml = (s: string) => /<(p|h[1-6]|ul|ol|li|br|div|strong|code)\b[^>]*>/i.test(s);

/** `**bold**`, `*italic*`, `` `code` ``, `[text](https://...)`. Only http(s) links are kept as links. */
export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[1]) out.push({ t: 'code', v: m[1].slice(1, -1) });
    else if (m[2]) out.push({ t: 'b', v: m[2].slice(2, -2) });
    else if (m[3]) out.push({ t: 'i', v: m[3].slice(1, -1) });
    else if (m[4]) out.push(/^https?:\/\//i.test(m[6]) ? { t: 'link', v: m[5], href: m[6] } : { t: 'text', v: m[5] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => parseInline(c.trim()));

export function parseNotes(input: string): Block[] {
  const md = looksHtml(input) ? htmlToMarkdown(input) : input.replace(/\r/g, '');
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ t: 'p', text: parseInline(para.join(' ')) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tr = line.trim();
    if (!tr) { flush(); continue; }
    if (tr.startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i]);
      blocks.push({ t: 'code', v: code.join('\n') });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(tr);
    if (h) { flush(); blocks.push({ t: 'h', level: Math.min(3, h[1].length) as 1 | 2 | 3, text: parseInline(h[2]) }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(tr)) { flush(); blocks.push({ t: 'hr' }); continue; }
    if (tr.startsWith('|') && i + 1 < lines.length && /^\|?\s*:?-{2,}/.test(lines[i + 1].trim())) {
      flush();
      const head = cells(tr);
      const rows: Inline[][][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i]));
      i--;
      blocks.push({ t: 'table', head, rows });
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const kind = /\d/.test(li[1]) ? 'ol' : 'ul';
      const items: string[] = [li[2]];
      // continuation lines (indented, not a new item) belong to the previous item
      for (i++; i < lines.length; i++) {
        const n = lines[i];
        const m2 = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(n);
        if (m2 && (/\d/.test(m2[1]) ? 'ol' : 'ul') === kind) items.push(m2[2]);
        else if (n.trim() && /^\s{2,}/.test(n)) items[items.length - 1] += ` ${n.trim()}`;
        else break;
      }
      i--;
      blocks.push({ t: kind, items: items.map(parseInline) });
      continue;
    }
    para.push(tr);
  }
  flush();
  return blocks;
}
