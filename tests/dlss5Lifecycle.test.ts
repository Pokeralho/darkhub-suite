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

  it('keeps the manifest and reports a partial revert when the signature check cannot be restored', async () => {
    const { root, game } = legacyInstall();
    const mf = path.join(game, 'DarkHubDLSS5.json');
    fs.writeFileSync(mf, JSON.stringify({ ...JSON.parse(fs.readFileSync(mf, 'utf8')), signatureBypass: { applied: true, previous: null } }));
    const svc: any = new (Dlss5Service as any)({ getPath: () => path.join(root, 'ud') });
    svc.restoreSignatureCheckBypass = async () => ({ ok: false });
    const res = await svc.revert({ targetDir: game }, () => {});
    expect(res).toMatchObject({ ok: false, partial: true, signatureBypassLeft: true });
    expect(JSON.parse(fs.readFileSync(mf, 'utf8')).signatureBypass).toMatchObject({ applied: true });
    // the retry (admin accepted) finishes the revert
    svc.restoreSignatureCheckBypass = async () => ({ ok: true });
    expect((await svc.revert({ targetDir: game }, () => {})).ok).toBe(true);
    expect(fs.existsSync(mf)).toBe(false);
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

describe('DLSS GPU detection', () => {
  it('classifies by PCI vendor id, prefers NVIDIA and skips Microsoft/VM adapters', async () => {
    const { classifyDlssGpu } = await import('../electron/services/dlss5/Dlss5Service.js');
    const intel = { Name: 'Intel(R) UHD Graphics 770', AdapterRAM: 2147483648, PNPDeviceID: 'PCI/VEN_8086&DEV_4680' };
    const nv = { Name: 'NVIDIA GeForce RTX 4070', AdapterRAM: 4293918720, PNPDeviceID: 'PCI/VEN_10DE&DEV_2786' };
    const basic = { Name: 'Microsoft Basic Display Adapter', AdapterRAM: 0, PNPDeviceID: 'ROOT/BASICDISPLAY/0000' };
    const remote = { Name: 'Microsoft Remote Display Adapter', PNPDeviceID: 'SWD/REMOTEDISPLAYENUM/VEN_1414' };
    expect(classifyDlssGpu([intel, nv])).toMatchObject({ vendor: 'nvidia', isRtx: true, defaultProfile: 'nvidia' });
    // the 4 GB AdapterRAM cap made the iGPU win before; a name without "AMD" is still found by its vendor id
    expect(classifyDlssGpu([intel, { Name: 'Radeon RX 7800 XT', PNPDeviceID: 'PCI/VEN_1002&DEV_747E' }])).toMatchObject({ vendor: 'amd', defaultProfile: 'amd' });
    expect(classifyDlssGpu([basic, remote])).toMatchObject({ vendor: 'other', defaultProfile: null });
    expect(classifyDlssGpu([{ Name: 'VMware SVGA 3D', PNPDeviceID: 'PCI/VEN_15AD&DEV_0405' }]).defaultProfile).toBeNull();
    expect(classifyDlssGpu([intel])).toMatchObject({ vendor: 'intel', defaultProfile: null });
  });
});
