import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { messages } from '../src/i18n/messages';
import Dlss5Service from '../electron/services/dlss5/Dlss5Service.js';

/** A game folder as the previous DarkHub DLSS 5 install left it (same manifest shape it wrote). */
function legacyInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dlss5-'));
  const game = path.join(root, 'game');
  const backupDir = path.join(game, 'DLSS5_Backups', 'backup_1');
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(game, 'game.exe'), 'MZ');
  fs.writeFileSync(path.join(backupDir, 'dxgi.dll'), 'orig-dxgi');
  fs.writeFileSync(path.join(backupDir, 'nvngx_dlss.dll'), 'orig-dlss');
  for (const f of ['dxgi.dll', 'OptiScaler.dll', 'OptiScaler.ini', 'nvngx_dlss.dll', 'nvngx_dlssnr.dll']) fs.writeFileSync(path.join(game, f), 'mod');
  fs.writeFileSync(path.join(game, 'DarkHubDLSS5.json'), JSON.stringify({
    appliedAt: 1, targetDir: game, backupDir, backedUp: ['dxgi.dll', 'nvngx_dlss.dll'], createdDirs: [],
    injectedFiles: ['dxgi.dll', 'OptiScaler.dll', 'OptiScaler.ini', 'nvngx_dlss.dll', 'nvngx_dlssnr.dll'].map((file) => ({ file })), signatureBypass: null
  }));
  return { root, game };
}

describe('legacy DLSS 5 install removal', () => {
  it('removes every injected file and restores the originals', async () => {
    const { root, game } = legacyInstall();
    const svc: any = new (Dlss5Service as any)({ getPath: () => path.join(root, 'ud') });
    const res = await svc.revert({ targetDir: game }, () => {});
    expect(res.ok).toBe(true);
    expect(res.restoredCount).toBe(2);
    expect(fs.readFileSync(path.join(game, 'dxgi.dll'), 'utf8')).toBe('orig-dxgi');
    expect(fs.readFileSync(path.join(game, 'nvngx_dlss.dll'), 'utf8')).toBe('orig-dlss');
    for (const f of ['OptiScaler.dll', 'OptiScaler.ini', 'nvngx_dlssnr.dll', 'DarkHubDLSS5.json', 'DLSS5_Backups']) expect(fs.existsSync(path.join(game, f))).toBe(false);
    expect(fs.existsSync(path.join(game, 'game.exe'))).toBe(true);
  });

  it('refuses a folder without the DarkHub manifest', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dlss5-'));
    const svc: any = new (Dlss5Service as any)({ getPath: () => root });
    expect((await svc.revert({ targetDir: root }, () => {})).ok).toBe(false);
  });

  it('no longer offers the install that never turned DLSS 5 on', () => {
    const svc: any = new (Dlss5Service as any)({ getPath: () => os.tmpdir() });
    for (const m of ['apply', 'generateNvngxIni', 'detectAutoRoute', 'downloadOptiScalerBundle']) expect(svc[m]).toBeUndefined();
  });

  it('has the new DLSS screen strings in both languages', () => {
    for (const k of ['dlss.title', 'dlss.updater', 'dlss5.title', 'dlss5.tier.none', 'dlss.legacyRemove']) {
      expect(messages['pt-BR'][k], k).toBeTruthy();
      expect(messages['en-US'][k], k).toBeTruthy();
    }
  });
});
