// @vitest-environment node
// The elevated app never runs an executable from a folder the user can write: tools live in C:\ProgramData\DarkHub
// (locked to Administrators + SYSTEM) when elevated, in userData only in a non-elevated (dev) run; older copies in
// %APPDATA% are taken over only when pinned by hash; the update installer runs from a protected, re-verified copy.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
// @ts-ignore plain JS module
import { trustedDataDir, trustedToolsDir, migratePinnedFile, _resetProgramDataRoot } from '../electron/services/programDataRoot.js';
// @ts-ignore plain JS module
import { stageVerifiedInstaller, publishedSha512 } from '../electron/services/stageInstaller.js';
// @ts-ignore plain JS module
import { createSecureStagingDir } from '../electron/services/secureStaging.js';
// @ts-ignore plain JS module
import { PresentMonService, PRESENTMON } from '../electron/services/overlay/PresentMonService.js';
// @ts-ignore plain JS module
import { Autopilot } from '../electron/services/upscale/Autopilot.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-trusted-'));
const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');

describe('trustedToolsDir: elevated or not', () => {
  beforeEach(() => _resetProgramDataRoot());

  it('not elevated (dev run): stays in userData, ProgramData untouched', async () => {
    const secureRoot = vi.fn();
    const userData = tmp();
    expect(await trustedToolsDir({ userData, platform: 'win32', elevated: false, secureRoot })).toBe(path.join(userData, 'tools'));
    expect(await trustedToolsDir({ userData, platform: 'linux', elevated: true, secureRoot })).toBe(path.join(userData, 'tools'));
    expect(secureRoot).not.toHaveBeenCalled();
  });

  it('elevated: waits for the root lock, then secures <root>\\tools once; userData is never used', async () => {
    const root = path.join(tmp(), 'DarkHub');
    const order: string[] = [];
    let releaseRoot: () => void = () => {};
    // like secureProgramDataRoot: one lock per run, every caller waits for it
    const locked = new Promise<void>((r) => { releaseRoot = () => { fs.mkdirSync(root, { recursive: true }); r(); }; });
    const secureRoot = vi.fn((o: any) => { order.push(`root:${o.root}`); return locked; });
    const secure = vi.fn(async (d: string) => { order.push(`sub:${d}`); return []; });
    const opts = { userData: 'C:\\Users\\x\\AppData\\Roaming\\DarkHub', root, platform: 'win32', elevated: true, secureRoot, secure };
    const a = trustedToolsDir(opts);
    await new Promise((r) => setTimeout(r, 10));
    expect(secure).not.toHaveBeenCalled(); // nothing is created in ProgramData before the root lock finished
    releaseRoot();
    const dir = await a;
    expect(dir).toBe(path.win32.join(root, 'tools'));
    expect(fs.statSync(dir).isDirectory()).toBe(true);
    expect(await trustedToolsDir(opts)).toBe(dir);
    expect(order).toEqual([`root:${root}`, `sub:${dir}`]);
    expect(await trustedDataDir('dlss-runtimes', opts)).toBe(path.win32.join(root, 'dlss-runtimes'));
    expect(secure).toHaveBeenCalledTimes(2);
  });

  it('elevated: a failure throws (no fallback to userData) and is retried on the next call', async () => {
    const root = path.join(tmp(), 'DarkHub');
    const secureRoot = vi.fn(async () => { throw new Error('icacls failed'); });
    const opts = { userData: tmp(), root, platform: 'win32', elevated: true, secureRoot, secure: async () => [] };
    await expect(trustedToolsDir(opts)).rejects.toThrow(/icacls/);
    await expect(trustedToolsDir(opts)).rejects.toThrow(/icacls/);
    expect(secureRoot).toHaveBeenCalledTimes(2);
  });

  it('refuses folder names that leave the root', () => {
    expect(() => trustedDataDir('..', { userData: tmp(), elevated: false })).toThrow();
    expect(() => trustedDataDir('a/b', { userData: tmp(), elevated: false })).toThrow();
  });

  it.skipIf(process.platform !== 'win32')('elevated: a junction planted as <root>\\tools is unlinked, its target untouched', async () => {
    const base = tmp();
    const root = path.join(base, 'DarkHub');
    const target = path.join(base, 'attacker');
    fs.mkdirSync(root);
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'yt-dlp.exe'), 'evil');
    fs.symlinkSync(target, path.join(root, 'tools'), 'junction');
    const dir = await trustedToolsDir({ userData: base, root, platform: 'win32', elevated: true, secureRoot: async () => {}, secure: async () => [] });
    expect(fs.lstatSync(dir).isSymbolicLink()).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(fs.readFileSync(path.join(target, 'yt-dlp.exe'), 'utf8')).toBe('evil');
  });
});

describe('migratePinnedFile', () => {
  it('copies the exact bytes it hashed when they match the pin', async () => {
    const src = path.join(tmp(), 'PresentMon.exe');
    fs.writeFileSync(src, 'genuine');
    const dest = path.join(tmp(), 'tools', 'PresentMon.exe');
    expect(await migratePinnedFile(src, dest, sha256('genuine'))).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('genuine');
  });

  it('ignores a swapped or missing file', async () => {
    const src = path.join(tmp(), 'PresentMon.exe');
    fs.writeFileSync(src, 'swapped');
    const dest = path.join(tmp(), 'PresentMon.exe');
    expect(await migratePinnedFile(src, dest, sha256('genuine'))).toBe(false);
    expect(await migratePinnedFile(path.join(tmp(), 'none.exe'), dest, sha256('genuine'))).toBe(false);
    expect(fs.existsSync(dest)).toBe(false);
  });
});

describe('PresentMonService with a trusted tools folder', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it('resolves the folder lazily and does not take over a legacy exe whose hash is not the pinned one', async () => {
    const trusted = tmp();
    const legacy = tmp();
    fs.writeFileSync(path.join(legacy, PRESENTMON.file), 'planted by a non-admin program');
    const svc = new PresentMonService({ toolsDir: async () => trusted, legacyDir: legacy });
    expect(svc.installed()).toBe(false);
    globalThis.fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode('not presentmon').buffer })) as any;
    await expect(svc.ensure()).rejects.toThrow(/não confere/);
    expect(svc.exe).toBe(path.join(trusted, PRESENTMON.file));
    expect(fs.existsSync(svc.exe)).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('Autopilot with a trusted tools folder', () => {
  it('looks for the installed exe only under the resolved folder', async () => {
    const trusted = tmp();
    const exeDir = path.join(trusted, 'DLSS5-Autopilot', 'v1.2.0');
    fs.mkdirSync(exeDir, { recursive: true });
    fs.writeFileSync(path.join(exeDir, 'DLSS5-Autopilot.exe'), 'x');
    const ap = new Autopilot(async () => trusted);
    expect(await ap.installed()).toEqual({ tag: 'v1.2.0', exe: path.join(exeDir, 'DLSS5-Autopilot.exe') });
    expect(await new Autopilot(async () => tmp()).installed()).toBeNull();
  });
});

describe('update installer staging', () => {
  const b64 = (s: string) => crypto.createHash('sha512').update(s).digest('base64');
  const staging = (o: any) => createSecureStagingDir({ ...o, elevated: false });

  it('publishedSha512 takes the entry for the downloaded file', () => {
    const info = { files: [{ url: 'DarkHub-Setup-1.0.0.exe', sha512: 'AAA' }, { url: 'other.exe', sha512: 'BBB' }] };
    expect(publishedSha512(info, 'C:\\x\\pending\\DarkHub-Setup-1.0.0.exe')).toBe('AAA');
    expect(publishedSha512({ files: [{ url: 'a.exe', sha512: 'CCC' }] }, 'b.exe')).toBe('CCC');
    expect(publishedSha512({ files: [] }, 'b.exe')).toBeNull();
  });

  it('copies a matching installer out of the user cache and returns the SHA-256 of the copy', async () => {
    const src = path.join(tmp(), 'DarkHub-Setup-1.0.0.exe');
    fs.writeFileSync(src, 'installer bytes');
    const r = await stageVerifiedInstaller({ source: src, sha512: b64('installer bytes'), fallbackBase: tmp(), createStaging: staging });
    expect(r.file).not.toBe(src);
    expect(path.basename(r.file)).toBe('DarkHub-Setup-1.0.0.exe');
    expect(fs.readFileSync(r.file, 'utf8')).toBe('installer bytes');
    expect(r.sha256).toBe(sha256('installer bytes'));
  });

  it('refuses a swapped installer and leaves nothing behind', async () => {
    const src = path.join(tmp(), 'setup.exe');
    fs.writeFileSync(src, 'swapped');
    const base = tmp();
    await expect(stageVerifiedInstaller({ source: src, sha512: b64('genuine'), fallbackBase: base, createStaging: staging })).rejects.toThrow(/sha512/);
    expect(fs.readdirSync(base)).toEqual([]);
    await expect(stageVerifiedInstaller({ source: src, fallbackBase: base, createStaging: staging })).rejects.toThrow(/digest/);
  });
});
