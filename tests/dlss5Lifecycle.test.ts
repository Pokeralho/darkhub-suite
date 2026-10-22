import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { messages } from '../src/i18n/messages';
import Dlss5Service from '../electron/services/dlss5/Dlss5Service.js';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dlss5-'));
  const userData = path.join(root, 'ud');
  const game = path.join(root, 'game');
  const bundle = path.join(userData, 'OptiScaler', 'OptiScaler_DLSS5_Universal');
  fs.mkdirSync(bundle, { recursive: true });
  fs.mkdirSync(game, { recursive: true });
  fs.writeFileSync(path.join(bundle, 'OptiScaler.dll'), 'opti');
  fs.writeFileSync(path.join(bundle, 'nvngx_dlss.dll'), 'new');
  fs.writeFileSync(path.join(game, 'game.exe'), 'MZ');
  fs.writeFileSync(path.join(game, 'dxgi.dll'), 'orig-dxgi');
  fs.writeFileSync(path.join(game, 'nvngx_dlss.dll'), 'orig-dlss');
  return { root, userData, game };
}

describe('DLSS5 apply/revert lifecycle', () => {
  it('restores originals and removes injected files, even after re-applying', async () => {
    const { userData, game } = setup();
    const svc: any = new (Dlss5Service as any)({ getPath: () => userData });
    expect((await svc.apply({ targetDir: game, profile: 'nvidia' }, () => {})).ok).toBe(true);
    expect((await svc.apply({ targetDir: game, profile: 'nvidia' }, () => {})).ok).toBe(true);
    expect(fs.readFileSync(path.join(game, 'dxgi.dll'), 'utf8')).toBe('opti');
    const res = await svc.revert({ targetDir: game }, () => {});
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(path.join(game, 'dxgi.dll'), 'utf8')).toBe('orig-dxgi');
    expect(fs.readFileSync(path.join(game, 'nvngx_dlss.dll'), 'utf8')).toBe('orig-dlss');
    expect(fs.existsSync(path.join(game, 'OptiScaler.dll'))).toBe(false);
    expect(fs.existsSync(path.join(game, 'DarkHubDLSS5.json'))).toBe(false);
  });

  it('refuses AMD Neural when the AMD-NR package is missing and when the game is not DX12', async () => {
    const { userData, game } = setup();
    const svc: any = new (Dlss5Service as any)({ getPath: () => userData });
    svc.detectGpu = async () => ({ vendor: 'amd' });
    const dx11 = await svc.apply({ targetDir: game, profile: 'amd', amdEngine: 'neural' }, () => {});
    expect(dx11.ok).toBe(false);
  });

  it('drops the previous proxy loader when re-applying with a different one', async () => {
    const { userData, game } = setup();
    fs.writeFileSync(path.join(game, 'winmm.dll'), 'orig-winmm');
    const svc: any = new (Dlss5Service as any)({ getPath: () => userData });
    expect((await svc.apply({ targetDir: game, profile: 'nvidia', loader: 'dxgi.dll' }, () => {})).ok).toBe(true);
    expect((await svc.apply({ targetDir: game, profile: 'nvidia', loader: 'winmm.dll' }, () => {})).ok).toBe(true);
    expect(fs.readFileSync(path.join(game, 'dxgi.dll'), 'utf8')).toBe('orig-dxgi');
    expect(fs.readFileSync(path.join(game, 'winmm.dll'), 'utf8')).toBe('opti');
    const res = await svc.revert({ targetDir: game }, () => {});
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(path.join(game, 'dxgi.dll'), 'utf8')).toBe('orig-dxgi');
    expect(fs.readFileSync(path.join(game, 'winmm.dll'), 'utf8')).toBe('orig-winmm');
    expect(fs.existsSync(path.join(game, 'OptiScaler.dll'))).toBe(false);
  });

  it('has AMD Neural i18n keys in both locales', () => {
    for (const k of ['dlss5.amdEngineNeural', 'dlss5.amdEngineNeuralDesc', 'dlss5.neuralPasses', 'dlss5.amdNrPackageHint']) {
      expect(messages['pt-BR'][k]).toBeTruthy();
      expect(messages['en-US'][k]).toBeTruthy();
    }
  });
});
