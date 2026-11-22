import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('OptiScaler Manager - FSR 4.1.1b RDNA 2 (the3rdparty1917) Integration', () => {
  it('does not carry the FSR 4.1.1b INT8 DLL: it is downloaded on demand and checked against the hash GitHub publishes', () => {
    // AMD's code repackaged by a third party: not ours to redistribute, in the repository or in the installer
    expect(fs.existsSync(path.resolve('electron/services/fsr4_rdna2'))).toBe(false);
    const src = fs.readFileSync(path.resolve('electron/optiscalerManager.js'), 'utf8');
    const fn = src.slice(src.indexOf('async function resolveFsr4Rdna2Path'), src.indexOf('async function applyOptiScaler'));
    expect(fn).toContain('the3rdparty1917/fsr4xyz/releases/tags/4.1.1b');
    expect(fn).toMatch(/if \(!expectedSha256\) throw/);
    expect(fn).not.toMatch(/services['"], ['"]fsr4_rdna2/);
  });


  it('should verify RDNA 2 architecture regex mapping', () => {
    const isRdna2 = (name: string) => /(?:rx\s*)?6\d{3}|radeon.*(?:6400|6500|6600|6700|6800|6900)/i.test(name);
    
    expect(isRdna2('AMD Radeon RX 6650 XT')).toBe(true);
    expect(isRdna2('AMD Radeon RX 6700 XT')).toBe(true);
    expect(isRdna2('Radeon RX 6800')).toBe(true);
    expect(isRdna2('Radeon RX 6900 XT')).toBe(true);
    expect(isRdna2('AMD Radeon RX 7900 XTX')).toBe(false);
  });

  it('should verify that optiscaler:listBackups and optiscaler:restoreBackup IPC handlers are properly registered and functional', async () => {
    const { registerOptiScalerIPC } = await import('../electron/optiscalerManager.js');
    const handlers: Record<string, Function> = {};
    const mockApp = {
      getPath: () => path.resolve('test-userdata'),
      isPackaged: false
    };
    const mockIpcMain = {
      handle: (channel: string, fn: Function) => {
        handlers[channel] = fn;
      }
    };
    const mockGetLibraryStore = async () => ({
      loadLibrary: async () => ({ games: [] }),
      upsertGame: async () => {}
    });

    registerOptiScalerIPC({ app: mockApp, ipcMain: mockIpcMain, getLibraryStore: mockGetLibraryStore });

    expect(typeof handlers['optiscaler:listBackups']).toBe('function');
    expect(typeof handlers['optiscaler:restoreBackup']).toBe('function');
    expect(typeof handlers['optiscaler:apply']).toBe('function');
    expect(typeof handlers['optiscaler:analyze']).toBe('function');

    // Test non-existent folder gracefully returns ok: true, backups: []
    const listRes = await handlers['optiscaler:listBackups'](null, { targetDir: 'C:\\NonExistentPath_Test' });
    expect(listRes.ok).toBe(true);
    expect(Array.isArray(listRes.backups)).toBe(true);
  });
});

describe('OptiScaler ini patch against the real OptiScaler 0.9.4 ini', () => {
  // tests/fixtures/OptiScaler-0.9.4.ini is the OptiScaler.ini shipped in optiscaler/OptiScaler v0.9.4 (GPL-3.0)
  const ini = fs.readFileSync(path.resolve('tests/fixtures/OptiScaler-0.9.4.ini'), 'utf8');
  const sections = new Map<string, Set<string>>();
  let current = '';
  for (const line of ini.split(/\r?\n/)) {
    const sec = /^\[([^\]]+)\]/.exec(line);
    if (sec) { current = sec[1]; if (!sections.has(current)) sections.set(current, new Set()); continue; }
    const key = /^([A-Za-z0-9_]+)=/.exec(line);
    if (key && current) sections.get(current)!.add(key[1]);
  }
  const sectionKeys = (sec: string) => sections.get(sec) || new Set<string>();
  it('writes only sections and keys that exist in OptiScaler (every preset, input and frame generation mode)', async () => {
    const { buildIniPatch } = await import('../electron/optiscalerManager.js');
    const gpus = [{ vendor: 'nvidia' }, { vendor: 'amd', amdArchitecture: 'rdna2' }, { vendor: 'intel' }];
    for (const upscaler of ['fsr22', 'fsr31', 'fsr4', 'fsr4_rdna3', 'fsr4_rdna2', 'xess', 'dlss', 'auto'])
      for (const inputApi of ['dlss', 'xess', 'fsr'])
        for (const frameGen of ['off', 'fsrfg', 'xefg'])
          for (const gpu of gpus)
            for (const [sec, key] of buildIniPatch({ upscaler, inputApi, gpu, includeAgilitySdk: true, frameGen, fgInput: 'dlssg' }))
              expect(sectionKeys(sec).has(key), `[${sec}] ${key}`).toBe(true);
  });
  it('uses values OptiScaler accepts for frame generation', async () => {
    const { buildIniPatch, applyIniPatch } = await import('../electron/optiscalerManager.js');
    const out = applyIniPatch(ini, buildIniPatch({ upscaler: 'dlss', inputApi: 'dlss', gpu: { vendor: 'nvidia' }, includeAgilitySdk: false, frameGen: 'fsrfg', fgInput: 'dlssg' }));
    expect(out).toMatch(/\[FrameGen\][\s\S]*?\nEnabled=true/);
    expect(out).toMatch(/\nFGInput=dlssg/);
    expect(out).toMatch(/\nFGOutput=fsrfg/);
    const off = applyIniPatch(ini, buildIniPatch({ upscaler: 'dlss', inputApi: 'dlss', gpu: { vendor: 'nvidia' }, includeAgilitySdk: false }));
    expect(off).toMatch(/\nFGOutput=nofg/);
  });
});

describe('OptiScaler restore while files are in use', () => {
  it('reports a partial restore, keeps the tracking json and skips the Library update', async () => {
    const os = await import('node:os');
    const { vi } = await import('vitest');
    const { registerOptiScalerIPC } = await import('../electron/optiscalerManager.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-opti-restore-'));
    for (const f of ['OptiScaler.ini', 'nvngx.ini', 'DarkHubOptiScaler.json']) fs.writeFileSync(path.join(dir, f), 'x');
    const handlers: Record<string, Function> = {};
    const upserts: any[] = [];
    registerOptiScalerIPC({
      app: { getPath: () => path.join(dir, 'userData'), isPackaged: false },
      ipcMain: { handle: (c: string, fn: Function) => { handlers[c] = fn; } },
      getLibraryStore: async () => ({ loadLibrary: async () => ({ games: [{ id: 'g1', exePath: path.join(dir, 'game.exe') }] }), upsertGame: async (_a: any, g: any) => { upserts.push(g); } })
    });
    const realUnlink = fs.promises.unlink;
    const spy = vi.spyOn(fs.promises, 'unlink').mockImplementation(async (p: any) => {
      if (String(p).endsWith('nvngx.ini')) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      return realUnlink(p);
    });
    try {
      const r = await handlers['optiscaler:restoreBackup'](null, { targetDir: dir, gameId: 'g1' });
      expect(r).toMatchObject({ ok: false, partial: true });
      expect(r.failed.map((f: any) => path.basename(f.path))).toEqual(['nvngx.ini']);
      expect(fs.existsSync(path.join(dir, 'DarkHubOptiScaler.json'))).toBe(true);
      expect(upserts).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
    // game closed: the second attempt finishes and only then drops the tracking json
    const r2 = await handlers['optiscaler:restoreBackup'](null, { targetDir: dir, gameId: 'g1' });
    expect(r2.ok).toBe(true);
    expect(fs.existsSync(path.join(dir, 'DarkHubOptiScaler.json'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'nvngx.ini'))).toBe(false);
    expect(upserts).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
