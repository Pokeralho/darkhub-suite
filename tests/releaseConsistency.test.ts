// @vitest-environment node
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

// A release bump touches several files by hand. 0.9.5 shipped with install.ps1 still falling back to 0.9.4:
// these checks fail the build when one of them is left behind.
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

describe('release files agree on the version', () => {
  it('package-lock.json', () => {
    const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
    expect(lock.version).toBe(pkg.version);
    expect(lock.packages[''].version).toBe(pkg.version);
  });

  it('install.ps1 offline fallback', () => {
    const m = /^\s*\$Version = "([^"]+)"/m.exec(fs.readFileSync('install.ps1', 'utf8'));
    expect(m?.[1]).toBe(pkg.version);
  });

  it('CHANGELOG.md has the entry', () => {
    expect(fs.readFileSync('CHANGELOG.md', 'utf8')).toMatch(new RegExp(`^## \\[?v?${pkg.version.replace(/\./g, '\\.')}\\b`, 'm'));
  });
});
