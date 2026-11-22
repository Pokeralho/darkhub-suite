import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore plain JS module
import { secureProgramDataRoot, _resetProgramDataRoot } from '../electron/services/programDataRoot.js';
// @ts-ignore plain JS module
import { secureDir, foreignOwnedFiles } from '../electron/services/realtime/Quarantine.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-pdr-'));

describe('C:\\ProgramData\\DarkHub is secured at startup', () => {
  beforeEach(() => _resetProgramDataRoot());

  it('does nothing when there is no privilege boundary', async () => {
    const calls: string[] = [];
    const secure = async (d: string) => { calls.push(d); return []; };
    expect(await secureProgramDataRoot({ root: path.join(tmp(), 'DarkHub'), platform: 'linux', elevated: true, secure })).toEqual({ skipped: true });
    expect(await secureProgramDataRoot({ root: path.join(tmp(), 'DarkHub'), platform: 'win32', elevated: false, secure })).toEqual({ skipped: true });
    expect(calls).toEqual([]);
  });

  it('creates the root and secures it once, keeping read access for Users', async () => {
    const root = path.join(tmp(), 'DarkHub');
    const calls: any[] = [];
    const secure = async (d: string, o: any) => { calls.push([d, o]); return ['planted.json']; };
    const a = await secureProgramDataRoot({ root, platform: 'win32', elevated: true, secure });
    const b = await secureProgramDataRoot({ root, platform: 'win32', elevated: true, secure });
    expect(fs.statSync(root).isDirectory()).toBe(true);
    expect(a).toEqual({ removed: ['planted.json'] });
    expect(b).toBe(a);
    expect(calls).toEqual([[root, { usersRead: true }]]);
  });

  it.skipIf(process.platform !== 'win32')('moves a junction root aside instead of securing its target', async () => {
    const base = tmp();
    const target = path.join(base, 'elsewhere');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'keep.txt'), 'x');
    const root = path.join(base, 'DarkHub');
    fs.symlinkSync(target, root, 'junction');
    const secured: string[] = [];
    await secureProgramDataRoot({ root, platform: 'win32', elevated: true, secure: async (d: string) => { secured.push(d); return []; } });
    expect(fs.lstatSync(root).isSymbolicLink()).toBe(false);
    expect(fs.readdirSync(root)).toEqual([]);
    expect(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('x');
    expect(secured).toEqual([root]);
  });
});

describe.skipIf(process.platform !== 'win32')('secureDir never follows a planted junction', () => {
  it('reports and unlinks the junction, leaves the files it points to alone', async () => {
    // long path: PowerShell reports C:\Users\runneradmin\... where os.tmpdir() can give the 8.3 name RUNNER~1
    const dir = fs.realpathSync.native(tmp());
    const victim = tmp();
    fs.writeFileSync(path.join(victim, 'victim.txt'), 'do not delete');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'planted.json'), '{}');
    fs.symlinkSync(victim, path.join(dir, 'link'), 'junction');

    // A link is always reported and never entered. planted.json is "foreign" only when this run is not elevated (an
    // elevated process, like the CI runner, creates files owned by Administrators).
    const found: string[] = await foreignOwnedFiles(dir);
    expect(found).toContain(path.join(dir, 'link'));
    expect(found.some((f) => f.startsWith(victim))).toBe(false);
    expect(found.every((f) => f === path.join(dir, 'link') || f === path.join(dir, 'sub', 'planted.json'))).toBe(true);

    const planted = [path.join(dir, 'link'), path.join(dir, 'sub', 'planted.json')];
    const removed = await secureDir(dir, { lockDown: async () => true, takeOwnership: async () => true, foreignOwned: async () => planted });
    expect(removed).toEqual(planted);
    expect(fs.existsSync(path.join(dir, 'link'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'sub', 'planted.json'))).toBe(false);
    expect(fs.readFileSync(path.join(victim, 'victim.txt'), 'utf8')).toBe('do not delete');
  }, 60000);

  it('throws when the folder cannot be locked or taken over', async () => {
    const dir = tmp();
    await expect(secureDir(dir, { lockDown: async () => false, foreignOwned: async () => [], takeOwnership: async () => true })).rejects.toThrow(/could not secure/);
    await expect(secureDir(dir, { lockDown: async () => true, foreignOwned: async () => [], takeOwnership: async () => false })).rejects.toThrow(/ownership/);
  });
});
