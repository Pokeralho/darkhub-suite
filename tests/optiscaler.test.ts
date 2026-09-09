import { describe, it, expect } from 'vitest';
import Dlss5Service from '../electron/services/dlss5/Dlss5Service.js';
import fs from 'node:fs';
import path from 'node:path';

describe('OptiScaler Manager - FSR 4.1.1b RDNA 2 (the3rdparty1917) Integration', () => {
  it('should verify the existence and size of the FSR 4.1.1b INT8 DLL', () => {
    const dllPath = path.resolve('electron/services/fsr4_rdna2/amd_fidelityfx_upscaler_dx12.dll');
    expect(fs.existsSync(dllPath)).toBe(true);

    const stat = fs.statSync(dllPath);
    expect(stat.size).toBe(34013696);
  });

  it('should verify that the3rdparty1917/fsr4xyz is registered in binary provenance', async () => {
    const service = new Dlss5Service();
    const prov = await service.getBinaryProvenance();

    expect(prov.ok).toBe(true);
    const repo = prov.upstreamRepositories.find((r: any) => r.url.includes('the3rdparty1917/fsr4xyz'));
    expect(repo).toBeDefined();
    expect(repo?.name).toContain('the3rdparty1917');
    expect(repo?.role).toContain('RDNA 2');
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
