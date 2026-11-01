import { describe, it, expect } from 'vitest';
import { parseNotes, parseInline, htmlToMarkdown } from '../src/components/releaseNotesParser';

// Shape of the real v0.7.4 GitHub release body.
const MD = `# DarkHub Suite v0.7.4: no telemetry

This release adds four things:
- **No telemetry**: nothing leaves your PC any more.
- **Color picker**: a new extension
  that picks colors from any monitor.

---

## Downloads

| File | Purpose |
|---|---|
| \`DarkHub-Setup-0.7.4.exe\` | **Installer (recommended)**. |

\`\`\`powershell
irm https://raw.githubusercontent.com/x/install.ps1 | iex
\`\`\`

See [the site](https://darkhub.ink) or [this](javascript:alert(1)).`;

describe('release notes formatting', () => {
  it('turns GitHub Markdown into headings, lists, tables, code and links', () => {
    const b = parseNotes(MD);
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'ul', 'hr', 'h', 'table', 'code', 'p']);
    const list = b[2] as any;
    expect(list.items).toHaveLength(2);
    expect(list.items[0][0]).toEqual({ t: 'b', v: 'No telemetry' });
    expect(list.items[1].map((p: any) => p.v).join('')).toContain('that picks colors');
    const table = b[5] as any;
    expect(table.rows[0][0]).toEqual([{ t: 'code', v: 'DarkHub-Setup-0.7.4.exe' }]);
    expect((b[6] as any).v).toContain('irm https://');
    const links = (b[7] as any).text.filter((p: any) => p.t === 'link');
    expect(links).toEqual([{ t: 'link', v: 'the site', href: 'https://darkhub.ink' }]);
  });

  it('reads the HTML that electron-updater delivers', () => {
    const html = '<h2>What&#39;s new</h2><ul><li><strong>Fix</strong> for <code>x</code></li><li>Two</li></ul><p>See <a href="https://darkhub.ink">site</a></p>';
    expect(htmlToMarkdown(html)).toContain("## What's new");
    const b = parseNotes(html);
    expect(b[0]).toMatchObject({ t: 'h', level: 2 });
    expect((b[1] as any).items[0]).toEqual([{ t: 'b', v: 'Fix' }, { t: 'text', v: ' for ' }, { t: 'code', v: 'x' }]);
    expect(b.some((x: any) => x.t === 'p' && x.text.some((p: any) => p.t === 'link'))).toBe(true);
  });

  it('keeps plain text as text', () => {
    expect(parseInline('a <b> c')).toEqual([{ t: 'text', v: 'a <b> c' }]);
    expect(parseNotes('Performance optimizations.')).toEqual([{ t: 'p', text: [{ t: 'text', v: 'Performance optimizations.' }] }]);
  });
});
