// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { psQuote } from '../electron/services/optimizer/OptimizerUtils.js';
import { buildRelaunchCommand } from '../electron/services/ensureElevated.js';

// PowerShell closes a single-quoted string at ' and also at the typographic quotes U+2018..U+201B. A helper that
// only doubles ' lets a value such as a game folder named "Baldur’s Gate", or a tampered undo file, end the string
// and run the rest as code in an elevated script. Several files used to carry such a local helper.
describe('PowerShell quoting', () => {
  it('psQuote doubles every character PowerShell accepts as a single quote', () => {
    for (const q of ["'", '\u2018', '\u2019', '\u201A', '\u201B']) {
      const out = psQuote(`a${q}; Start-Process calc #`);
      expect(out).toBe(`'a${q}${q}; Start-Process calc #'`);
    }
  });

  it('the relaunch command quotes the executable and its arguments with it', () => {
    const cmd = buildRelaunchCommand('C:\\Games\\Baldur\u2019s Gate\\app.exe', ['--page=it\u2019s']);
    expect(cmd).toContain("-FilePath 'C:\\Games\\Baldur\u2019\u2019s Gate\\app.exe'");
    expect(cmd).toContain("-ArgumentList '--page=it\u2019\u2019s'");
  });

  it('no file under electron/ carries its own weaker single-quote helper', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(js|mjs|cjs)$/.test(e.name) && /\.replace\(\/'\/g,\s*["']''["']\)/.test(fs.readFileSync(p, 'utf8'))) offenders.push(p.split(path.sep).join('/'));
      }
    };
    walk('electron');
    expect(offenders).toEqual([]);
  });
});
