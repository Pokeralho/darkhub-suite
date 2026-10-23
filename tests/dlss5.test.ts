import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Dlss5Service from '../electron/services/dlss5/Dlss5Service.js';
// @ts-ignore plain JS modules
import { fileVersionFromBuffer, compareVersions, isPe64 } from '../electron/services/upscale/pe.js';
// @ts-ignore
import { DlssUpdater, scanGameFolder } from '../electron/services/upscale/DlssUpdater.js';
import { dlss5Tier } from '../src/pages/Dlss5Manager';

/** Smallest buffer the version reader accepts: a VS_FIXEDFILEINFO with the given version. */
function fixedInfo(a: number, b: number, c: number, d: number) {
  const buf = Buffer.alloc(64);
  buf.writeUInt32LE(0xfeef04bd, 8);
  buf.writeUInt32LE(0x00010000, 12);
  buf.writeUInt32LE((a << 16) | b, 16);
  buf.writeUInt32LE((c << 16) | d, 20);
  return buf;
}
/** A fake x64 PE (MZ + PE header + machine 0x8664) carrying a version resource. */
function fakeDll(version: [number, number, number, number]) {
  const head = Buffer.alloc(256);
  head.write('MZ', 0, 'latin1');
  head.writeUInt32LE(0x80, 0x3c);
  head.writeUInt32LE(0x00004550, 0x80);
  head.writeUInt16LE(0x8664, 0x84);
  return Buffer.concat([head, fixedInfo(...version)]);
}

describe('DLSS runtime updater', () => {
  it('reads file versions and compares them numerically', () => {
    expect(fileVersionFromBuffer(fixedInfo(310, 9, 16, 0))).toBe('310.9.16.0');
    expect(fileVersionFromBuffer(Buffer.from('no version here'))).toBeNull();
    expect(compareVersions('3.7.20.0', '310.9.16')).toBeLessThan(0);
    expect(compareVersions('310.9.16.0', '310.9.16')).toBe(0);
    expect(compareVersions('310.10.0', '310.9.16')).toBeGreaterThan(0);
  });

  it('finds the DLSS runtimes of a game and its anti-cheat folder', () => {
    const game = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dlssup-'));
    fs.mkdirSync(path.join(game, 'Bin', 'Win64'), { recursive: true });
    fs.mkdirSync(path.join(game, 'EasyAntiCheat'));
    fs.writeFileSync(path.join(game, 'Bin', 'Win64', 'nvngx_dlss.dll'), fakeDll([3, 7, 20, 0]));
    fs.writeFileSync(path.join(game, 'Bin', 'Win64', 'NVNGX_DLSSG.DLL'), fakeDll([310, 2, 1, 0]));
    const r = scanGameFolder(game);
    expect(r.anticheat).toBe('EasyAntiCheat');
    expect(r.dlls.map((d: any) => [d.name, d.kind, d.version, d.x64]).sort()).toEqual([['nvngx_dlss.dll', 'sr', '3.7.20.0', true], ['nvngx_dlssg.dll', 'fg', '310.2.1.0', true]]);
  });

  it('updates only what is behind, keeps the original, refuses anti-cheat unless forced, and restores', async () => {
    const game = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dlssup-'));
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dlsscache-'));
    const old = fakeDll([3, 7, 20, 0]);
    fs.writeFileSync(path.join(game, 'nvngx_dlss.dll'), old);
    fs.writeFileSync(path.join(game, 'nvngx_dlssd.dll'), fakeDll([310, 9, 16, 0]));
    let downloads = 0;
    const u = new DlssUpdater(cache, {
      fetchJsonImpl: async () => ({ tag_name: 'v310.9.16' }),
      download: async (_url: string, dest: string) => { downloads++; fs.writeFileSync(dest, fakeDll([310, 9, 16, 0])); },
      verify: () => true
    });
    const r = await u.update(game);
    expect(r.ok).toBe(true);
    expect(r.updated.map((x: any) => path.basename(x.file))).toEqual(['nvngx_dlss.dll']);
    expect(r.files.every((f: any) => !f.behind)).toBe(true);
    expect(fs.readFileSync(path.join(game, 'nvngx_dlss.dll.darkhub-original')).equals(old)).toBe(true);
    expect((await u.update(game)).updated).toEqual([]);
    expect(downloads).toBe(1);
    u.restore(game);
    expect(fs.readFileSync(path.join(game, 'nvngx_dlss.dll')).equals(old)).toBe(true);
    expect(fs.existsSync(path.join(game, 'nvngx_dlss.dll.darkhub-original'))).toBe(false);

    fs.mkdirSync(path.join(game, 'BattlEye'));
    expect((await u.update(game)).ok).toBe(false);
    expect((await u.update(game, { force: true })).updated).toHaveLength(1);
  });

  it('discards a download that is not a signed 64-bit DLL', async () => {
    const game = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dlssup-'));
    fs.writeFileSync(path.join(game, 'nvngx_dlss.dll'), fakeDll([3, 7, 20, 0]));
    const u = new DlssUpdater(fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dlsscache-')), {
      fetchJsonImpl: async () => ({ tag_name: 'v310.9.16' }),
      download: async (_url: string, dest: string) => fs.writeFileSync(dest, fakeDll([310, 9, 16, 0])),
      verify: () => false
    });
    await expect(u.update(game)).rejects.toThrow(/signed by NVIDIA/);
    expect(fileVersionFromBuffer(fs.readFileSync(path.join(game, 'nvngx_dlss.dll')))).toBe('3.7.20.0');
  });

  it('rates DLSS 5 cost by card generation', () => {
    expect(dlss5Tier('NVIDIA GeForce RTX 5070 Ti', true)).toBe('full');
    expect(dlss5Tier('NVIDIA GeForce RTX 4060', true)).toBe('moderate');
    expect(dlss5Tier('NVIDIA GeForce RTX 3080', true)).toBe('heavy');
    expect(dlss5Tier('NVIDIA GeForce GTX 1660', true)).toBe('none');
    expect(dlss5Tier('AMD Radeon RX 7900 XTX', false)).toBe('none');
  });
});

describe('game scan (shared with the OptiScaler screen)', () => {
  it('detects the graphics API and loader from PE headers', async () => {
    const service: any = new (Dlss5Service as any)();
    const apiResult = await service.detectGraphicsAPI('C:\\Windows\\System32\\notepad.exe', 'C:\\Windows\\System32', 'C:\\Windows');
    expect(apiResult.primaryApi).toBeDefined();
    expect(apiResult.recommendedLoader).toBeDefined();
    expect(apiResult.is64).toBe(true);
    expect(isPe64('C:\\Windows\\System32\\notepad.exe')).toBe(true);
  });
  it('lists Steam games and rejects invalid paths without crashing', async () => {
    const service: any = new (Dlss5Service as any)();
    expect(Array.isArray(await service.getInstalledSteamGames())).toBe(true);
    const result = await service.scanGameDirectory('Z:\\NonExistentPath_Random_12345');
    expect(result.ok).toBe(false);
  });
});
