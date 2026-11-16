import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// `New-Item -Path <registry key> -Force` on a key that already exists RECREATES it empty: every value and subkey is
// lost. Found in the VM (one tweak wiped another's markers) and in latencyGuardian, which wiped the compatibility flags
// of every program, every app's GPU preference and a network adapter's TCP/IP settings. Files and folders are fine
// (-ItemType), registry keys must be guarded with Test-Path.
function walk(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else if (/\.(js|mjs|ps1|psm1)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('registry keys are never recreated by New-Item -Force', () => {
  it('every New-Item -Force without -ItemType is guarded by Test-Path', () => {
    const bad: string[] = [];
    for (const f of walk(path.resolve(__dirname, '../electron'))) {
      fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
        if (!/New-Item\b/.test(line) || !/-Force\b/.test(line) || /-ItemType\b/.test(line)) return;
        if (/Test-Path|if \(-not \$ke\)/.test(line)) return;
        bad.push(`${path.relative(process.cwd(), f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
