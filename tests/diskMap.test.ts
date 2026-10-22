import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-ignore plain JS module
import { parseFilter, matchFile, classOf } from '../electron/services/diskscan/filter.js';
// @ts-ignore plain JS module
import { ScanModel } from '../electron/services/diskscan/ScanModel.js';
// @ts-ignore plain JS module
import { DiskScanService } from '../electron/services/diskscan/DiskScanService.js';
import { squarify, layoutTree, hitTest } from '../src/pages/SpaceSniffer/treemap';

const win32 = process.platform === 'win32' ? it : it.skip;
const DAY = 86400000;
const file = (o: any) => ({ name: 'a.txt', size: 100, mtime: Date.now(), ctime: Date.now(), atime: Date.now(), attr: 0x20, tag: undefined, folderMatch: () => false, ...o });

describe('disk map filter', () => {
  const ok = (q: string, f: any) => matchFile(parseFilter(q).conditions, file(f), Date.now());
  it('name masks, sizes and negation', () => {
    expect(ok('*.iso', { name: 'win.ISO' })).toBe(true);
    expect(ok('*.iso', { name: 'win.img' })).toBe(false);
    expect(ok('>1gb', { size: 2 * 1024 ** 3 })).toBe(true);
    expect(ok('<16k', { size: 20 * 1024 })).toBe(false);
    expect(ok('|*.dll', { name: 'x.dll' })).toBe(false);
    expect(ok('*.mp4;>100mb', { name: 'v.mp4', size: 50 * 1024 ** 2 })).toBe(false);
  });
  it('ages by modified / created', () => {
    expect(ok('m<1day', { mtime: Date.now() - 3600000 })).toBe(true);
    expect(ok('c>1year', { ctime: Date.now() - 400 * DAY })).toBe(true);
    expect(ok('>2weeks', { mtime: Date.now() - 3 * DAY })).toBe(false);
  });
  it('tags, classes and real attributes', () => {
    expect(ok(':red', { tag: 'red' })).toBe(true);
    expect(ok(':tag:r+y', { tag: 'blue' })).toBe(false);
    expect(ok(':class:video', { name: 'clip.mkv' })).toBe(true);
    expect(ok(':attr:h', { attr: 0x2 | 0x20 })).toBe(true);
    expect(ok(':attr:-h', { attr: 0x2 })).toBe(false);
    expect(ok(':attr:h+s', { attr: 0x2 })).toBe(false);
  });
  it('reports invalid clauses instead of matching nothing silently', () => {
    expect(parseFilter('>12qq').errors.length).toBe(1);
    expect(parseFilter(':class:banana').errors.length).toBe(1);
    expect(parseFilter(':attr:z').errors.length).toBe(1);
    expect(classOf('README')).toBe('other');
    expect(classOf('game.pak')).toBe('archive');
  });
});

describe('scan model', () => {
  const lines = [
    'D\t0\t-1\tC:\\\t0\t0\t0\t16',
    'F\t2\tlate.bin\t500\t1\t1\t1\t32', // file before its folder (threads flush independently)
    'D\t1\t0\tGames\t1\t1\t1\t16',
    'D\t2\t1\tBig\t1\t1\t1\t16',
    'F\t1\tsave.dat\t100\t1\t1\t1\t32',
    'F\t0\tpagefile.sys\t1000\t1\t1\t1\t38',
    ...Array.from({ length: 50 }, (_, i) => `F\t2\tsmall${i}.txt\t1\t1\t1\t1\t32`),
    'E\tC:\\System Volume Information\t5',
    'DONE\t2\t53\t1\t10'
  ];
  const build = () => { const m = new ScanModel('C:\\'); let done: any; for (const l of lines) { const r = m.addLine(l); if (r) done = r; } return { m, done }; };

  it('aggregates folder sizes and paths, including entries that arrived early', () => {
    const { m, done } = build();
    expect(done).toEqual({ dirs: 2, files: 53, errors: 1, ms: 10 });
    const s = m.sizes(null);
    expect(s.dirSize[2]).toBe(550);
    expect(s.dirSize[1]).toBe(650);
    expect(s.dirSize[0]).toBe(1650);
    expect(m.dirPath(2)).toBe('C:\\Games\\Big');
    expect(m.dirPath(0)).toBe('C:\\');
    expect(m.errorCount).toBe(1);
  });
  it('folds entries too small to draw into one block', () => {
    const { m } = build();
    const v = m.view(2, { minBytes: 10 });
    expect(v.children.map((c: any) => c.kind)).toEqual(['file', 'rest']);
    expect(v.children[1]).toMatchObject({ count: 50, size: 50 });
  });
  it('filters over the whole tree, inherits folder tags and forgets trashed items', () => {
    const { m } = build();
    const f = { ...parseFilter('*.txt'), key: '*.txt' };
    expect(m.sizes(f).dirSize[0]).toBe(50);
    m.setTag('d1', 'red');
    const red = { ...parseFilter(':red'), key: ':red' };
    expect(m.sizes(red).dirSize[0]).toBe(650);
    m.markRemoved('d2');
    expect(m.sizes(null).dirSize[0]).toBe(1100);
    expect(m.parse('d99')).toBeNull();
    expect(m.parse('x1')).toBeNull();
  });
});

describe('treemap layout', () => {
  it('squarify keeps areas proportional and inside the box', () => {
    const vals = [60, 30, 10];
    const r = squarify(vals, 0, 0, 100, 50);
    const areas = r.map(([, , w, h]) => w * h);
    areas.forEach((a, i) => expect(a).toBeCloseTo((vals[i] / 100) * 5000, 5));
    r.forEach(([x, y, w, h]) => { expect(x + w).toBeLessThanOrEqual(100.0001); expect(y + h).toBeLessThanOrEqual(50.0001); });
  });
  it('hit test returns the deepest cell', () => {
    const tree: any = { id: 'd0', name: 'C:', size: 100, kind: 'dir', children: [{ id: 'f1', name: 'a', size: 100, kind: 'file' }] };
    const cells = layoutTree(tree, 400, 300, 10);
    expect(hitTest(cells, 200, 200)?.node.id).toBe('f1');
    expect(hitTest(cells, 5, 5)?.node.id).toBe('d0');
  });
});

describe('disk scan service (real helper)', () => {
  const exe = path.resolve('electron/services/DarkHub.DiskScan.exe');
  win32('scans a folder, serves the view and trashes through the shell', async () => {
    if (!fs.existsSync(exe)) return;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-diskmap-'));
    fs.mkdirSync(path.join(root, 'sub', 'deep'), { recursive: true });
    fs.writeFileSync(path.join(root, 'big.iso'), Buffer.alloc(300000));
    fs.writeFileSync(path.join(root, 'sub', 'a.txt'), 'x'.repeat(1000));
    fs.writeFileSync(path.join(root, 'sub', 'deep', 'ção 名字.bin'), Buffer.alloc(5000));
    const trashed: string[] = [];
    const svc = new DiskScanService({ exePath: exe, shell: { trashItem: async (p: string) => { trashed.push(p); fs.rmSync(p, { recursive: true }); } } });
    await new Promise<void>((resolve) => { svc.start(root, (st: any) => { if (!st.running) resolve(); }); });
    const st = svc.status();
    expect(st.done).toMatchObject({ files: 3, dirs: 2, errors: 0 });
    const v = svc.view({ id: 'd0' });
    expect(v.tree.size).toBe(306000);
    expect(v.tree.children[0]).toMatchObject({ name: 'big.iso', kind: 'file', cls: 'archive' });
    const sub = v.tree.children.find((c: any) => c.name === 'sub');
    const deep = svc.view({ id: sub.id }).tree.children.find((c: any) => c.name === 'deep');
    const unicode = svc.view({ id: deep.id }).tree.children[0];
    expect(unicode.name).toBe('ção 名字.bin');
    expect(svc.info(unicode.id).info.path).toBe(path.join(root, 'sub', 'deep', 'ção 名字.bin'));
    expect((await svc.trash('d0')).ok).toBe(false);
    const r = await svc.trash(sub.id);
    expect(r.ok).toBe(true);
    expect(svc.view({ id: 'd0' }).tree.size).toBe(300000);
    expect(svc.view({ id: 'd0', filter: '*.iso' }).tree.size).toBe(300000);
    expect(svc.view({ id: 'd0', filter: '>1gb' }).tree.size).toBe(0);
    const csv = path.join(root, 'r.csv');
    expect((await svc.exportTo({ id: 'd0', format: 'csv' }, csv)).rows).toBe(1);
    fs.rmSync(root, { recursive: true, force: true });
  }, 30000);
});
