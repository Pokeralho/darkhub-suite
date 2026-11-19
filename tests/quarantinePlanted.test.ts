import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore plain JS module
import { Quarantine, secureDir } from '../electron/services/realtime/Quarantine.js';

// VM round43: a standard user created C:\ProgramData\DarkHub\Quarantine before DarkHub ever locked it and planted an
// entry; after the lockdown it was still listed and the elevated restore wrote the user's payload to the path it chose.
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dh-qp-'));
function plant(root: string, id: string, target: string, text: string) {
  const key = crypto.randomBytes(32);
  const data = Buffer.from(text);
  for (let i = 0; i < data.length; i++) data[i] ^= key[i % key.length];
  fs.writeFileSync(path.join(root, `${id}.q`), data);
  fs.writeFileSync(path.join(root, `${id}.json`), JSON.stringify({ id, originalPath: target, key: key.toString('hex'), at: 1 }));
}

describe('quarantine entries planted before the lockdown', () => {
  it('are removed when the folder is secured and never restored', async () => {
    const root = tmp();
    const out = tmp();
    plant(root, '1111111111111111', path.join(out, 'planted.txt'), 'PLANTED');
    const planted = new Set([path.join(root, '1111111111111111.json'), path.join(root, '1111111111111111.q')]);
    const foreignOwned = async () => [...planted].filter((f) => fs.existsSync(f));
    const q = new Quarantine(root, { lockDown: true, foreignOwned, secure: async (d: string, o: any) => { const bad = await o.foreignOwned(d); for (const f of bad) fs.rmSync(f, { force: true }); return bad; } });
    expect(typeof secureDir).toBe('function');
    await expect(q.restore('1111111111111111')).rejects.toThrow();
    expect(fs.existsSync(path.join(out, 'planted.txt'))).toBe(false);
    expect(q.list()).toEqual([]);
  });

  it('refuses to restore an entry not owned by Administrators/SYSTEM even if it is still there', async () => {
    const root = tmp();
    const out = tmp();
    plant(root, '2222222222222222', path.join(out, 'x.txt'), 'X');
    const foreignOwned = async () => [path.join(root, '2222222222222222.json')];
    const q = new Quarantine(root, { lockDown: true, foreignOwned, secure: async () => [] });
    await expect(q.restore('2222222222222222')).rejects.toThrow(/not created by DarkHub/);
    expect(fs.existsSync(path.join(out, 'x.txt'))).toBe(false);
  });

  it('restores its own entries normally', async () => {
    const root = tmp();
    const src = path.join(tmp(), 'f.exe');
    fs.writeFileSync(src, 'payload');
    const q = new Quarantine(root, { lockDown: true, foreignOwned: async () => [], secure: async () => [] });
    const item = await q.add(src);
    expect(fs.existsSync(src)).toBe(false);
    expect((await q.restore(item.id)).restoredTo).toBe(src);
    expect(fs.readFileSync(src, 'utf8')).toBe('payload');
  });
});
