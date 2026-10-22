import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// A single backslash inside a JS template literal disappears (`HKLM:\SYSTEM` becomes "HKLM:SYSTEM"). Scripts sent to
// PowerShell are built that way, so this guards the whole electron/ tree. Parsed with the TypeScript parser.
const VALID = /\\(?:[ntrbfv0'"`$\\\r\n]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\})/g;

function lostEscapes(file: string, src: string): string[] {
  const out: string[] = [];
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (n: ts.Node) => {
    if (ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const raw = n.getText(sf).replace(VALID, '');
      const m = /\\(.)/.exec(raw);
      if (m) out.push(`line ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: \\${m[1]}`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('template literals sent to PowerShell keep their backslashes', () => {
  it('catches a dropped escape and accepts valid ones', () => {
    expect(lostEscapes('a.js', 'const s = `HKLM:\\SYSTEM`')).toHaveLength(1);
    expect(lostEscapes('a.js', 'const s = `HKLM:\\\\SYSTEM\\n${x.replace(/\\s+/g, "")}`')).toHaveLength(0);
  });
  it('electron/**/*.js has no silently dropped escapes', () => {
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); } else if (e.name.endsWith('.js')) {
          for (const hit of lostEscapes(p, fs.readFileSync(p, 'utf8'))) bad.push(`${path.relative('.', p)} ${hit}`);
        }
      }
    };
    walk('electron');
    expect(bad).toEqual([]);
  });
});
