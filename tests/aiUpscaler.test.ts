// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
// @ts-ignore plain JS module
import { AiUpscaler, planEnhance, parseProgress, buildArgs, ultraName, MODELS, defaultDir } from '../electron/services/susuya/AiUpscaler.js';

const SHA256 = 'ABC02804E17982A3BE33675E4D471E91EA374E65B70167ABC09E31ACB412802D';

describe('AI screenshot enhancement', () => {
  it('fast uses the compact model, max the large one; areas at 4x, full screens at 2x', () => {
    expect(planEnhance({ width: 300, height: 80, region: true })).toEqual({ model: MODELS.fast4, scale: 4, outScale: 4 });
    expect(planEnhance({ width: 2560, height: 1440 })).toEqual({ model: MODELS.fast2, scale: 2, outScale: 2 });
    expect(planEnhance({ width: 300, height: 80, region: true, quality: 'max' })).toEqual({ model: MODELS.photo, scale: 4, outScale: 4 });
    expect(planEnhance({ width: 2400, height: 1000, region: true, quality: 'max', style: 'anime' })).toEqual({ model: MODELS.anime, scale: 4, outScale: 2 });
    expect(planEnhance({ width: 2560, height: 1440, quality: 'max' })).toEqual({ model: MODELS.photo, scale: 4, outScale: 2 });
  });

  it('reads progress in either decimal separator', () => {
    expect(parseProgress('98,08%')).toBe(98.08);
    expect(parseProgress('12.5%')).toBe(12.5);
    expect(parseProgress('[0 NVIDIA GeForce]')).toBeNull();
  });

  it('builds the command line and the output name', () => {
    expect(buildArgs('C:\\r', 'a.png', 'b.png', MODELS.photo, 4)).toEqual(['-i', 'a.png', '-o', 'b.png', '-n', 'realesrgan-x4plus', '-s', '4', '-m', path.join('C:\\r', 'models'), '-f', 'png']);
    expect(ultraName('C:\\s\\DarkHub_1.png')).toBe('C:\\s\\DarkHub_1_ultra.png');
    expect(ultraName('C:\\s\\DarkHub_1_ultra.png')).toBe('C:\\s\\DarkHub_1_ultra.png');
  });

  it('the build script pins the same release hash', () => {
    const ps = fs.readFileSync(path.resolve(__dirname, '../scripts/fetch-realesrgan.ps1'), 'utf8');
    expect(ps).toContain(`$Sha256 = '${SHA256}'`);
    expect(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')).toContain('"from": "vendor/realesrgan"');
  });

  it('reports a clear error when the upscaler is not installed', async () => {
    const ai = new AiUpscaler({ dir: path.join(os.tmpdir(), 'no-such-realesrgan') });
    expect(ai.available()).toBe(false);
    await expect(ai.enhance('x.png')).rejects.toThrow(/não está instalado/);
  });

  it.runIf(process.platform === 'win32' && new AiUpscaler().available())('enhances a real image on the GPU into _ultra.png, keeping the original', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-ai-'));
    const src = path.join(dir, 'DarkHub_test.png');
    // a small "game HUD" crop: text-like strokes and a gradient
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="48"><defs><linearGradient id="g"><stop offset="0" stop-color="#1b3a6b"/><stop offset="1" stop-color="#c0602a"/></linearGradient></defs><rect width="96" height="48" fill="url(#g)"/><text x="6" y="30" font-size="18" font-family="Arial" fill="#fff">HP 99</text></svg>`;
    await sharp(Buffer.from(svg)).png().toFile(src);
    const before = fs.readFileSync(src);
    const seen: number[] = [];
    const r = await new AiUpscaler().enhance(src, { region: true }, (p: number) => seen.push(p));
    expect(r.file).toBe(path.join(dir, 'DarkHub_test_ultra.png'));
    const meta = await sharp(r.file).metadata();
    expect([meta.width, meta.height]).toEqual([384, 192]);
    expect(fs.readFileSync(src).equals(before)).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.includes('.tmp'))).toEqual([]);
    expect(defaultDir()).toMatch(/vendor[\\/]realesrgan$/);
  }, 60000);
});
