import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Regression guard (DarkOS scope restriction): the Steam Lua / Depot Tools,
// Steam unlocker, and Goldberg Steam-emulator functionality must stay removed.
// This checks ABSENCE only; it does not reference or reproduce the removed code.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(resolve(root, p), 'utf8');

describe('prohibited Steam DRM/emulation tooling stays removed', () => {
  it('dedicated source files and folders do not exist', () => {
    for (const p of [
      'electron/services/goldberg',
      'electron/services/GoldbergService.js',
      'electron/services/SteamLuaService.js',
      'electron/services/SteamUnlockerService.js',
      'src/pages/SteamLuaTools.tsx',
      'tests/steamLua.test.ts',
    ]) {
      expect(existsSync(resolve(root, p)), `${p} should not exist`).toBe(false);
    }
  });

  it('electron/main.js registers no removed IPC channels or service imports', () => {
    const s = read('electron/main.js');
    for (const t of ['steamLua:', 'steamUnlocker:', 'goldberg:', 'GoldbergService', 'SteamLuaService', 'SteamUnlockerService']) {
      expect(s.includes(t), `main.js must not contain "${t}"`).toBe(false);
    }
  });

  it('electron/preload.js exposes none of the removed namespaces', () => {
    const s = read('electron/preload.js');
    for (const t of ['steamLua', 'steamUnlocker', 'goldberg']) {
      expect(s.includes(t), `preload.js must not contain "${t}"`).toBe(false);
    }
  });

  it('src/App.tsx has no removed page import or route', () => {
    const s = read('src/App.tsx');
    for (const t of ['SteamLuaTools', 'steam-lua', 'steamlua']) {
      expect(s.includes(t), `App.tsx must not contain "${t}"`).toBe(false);
    }
  });

  it('src/global.d.ts declares none of the removed namespaces', () => {
    const s = read('src/global.d.ts');
    for (const t of ['steamLua', 'steamUnlocker', 'goldberg']) {
      expect(s.includes(t), `global.d.ts must not contain "${t}"`).toBe(false);
    }
  });

  it('src/i18n/messages.ts has no steamLua keys', () => {
    expect(read('src/i18n/messages.ts').includes('steamLua')).toBe(false);
  });

  it('src/layouts/MainLayout.tsx has no steam-lua nav entry', () => {
    expect(read('src/layouts/MainLayout.tsx').includes('steam-lua')).toBe(false);
  });

  it('package.json does not package electron/services/goldberg', () => {
    expect(read('package.json').includes('goldberg')).toBe(false);
  });
});
