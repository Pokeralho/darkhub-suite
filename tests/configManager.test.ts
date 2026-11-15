// @vitest-environment node
// A corrupt config.json is kept aside (not silently reset) and saves are atomic.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-cfg-'));
vi.mock('electron', () => ({ app: { getPath: () => dir } }));
const file = path.join(dir, 'config.json');

const fresh = async () => {
  vi.resetModules();
  // @ts-ignore plain JS module
  return import('../electron/configManager.js');
};

describe('configManager', () => {
  beforeEach(() => { for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true }); });

  it('backs up a corrupt file before falling back to defaults', async () => {
    fs.writeFileSync(file, '{"app": {"theme": "light"');
    const { loadConfig } = await fresh();
    const cfg = await loadConfig();
    expect(cfg.app.theme).toBe('dark');
    const backups = fs.readdirSync(dir).filter((f) => f.startsWith('config.json.corrupt-'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, backups[0]), 'utf8')).toBe('{"app": {"theme": "light"');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).app.theme).toBe('dark');
  });

  it('keeps a valid file and saves atomically (no temp files left)', async () => {
    fs.writeFileSync(file, JSON.stringify({ app: { theme: 'light' }, liveServices: { overlay: false } }));
    const { loadConfig, saveConfig } = await fresh();
    const cfg = await loadConfig();
    expect(cfg.app.theme).toBe('light');
    await saveConfig({ ...cfg, liveServices: { overlay: true } });
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).liveServices.overlay).toBe(true);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('creates the file when missing', async () => {
    const { loadConfig } = await fresh();
    await loadConfig();
    expect(fs.existsSync(file)).toBe(true);
  });
});
