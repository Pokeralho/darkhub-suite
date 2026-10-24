// @vitest-environment node
// (the main process uses Node's fetch/AbortController, not jsdom's)
import { describe, it, expect, vi, afterEach } from 'vitest';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const fakeShot = {
  crops: [] as any[],
  isEmpty: () => false,
  getSize: () => ({ width: 3840, height: 2160 }),
  crop(r: any) { fakeShot.crops.push(r); return { toPNG: () => Buffer.from('png'), getSize: () => ({ width: r.width, height: r.height }) }; }
};
vi.mock('electron', () => ({
  desktopCapturer: { getSources: async () => [{ display_id: '1', thumbnail: fakeShot }] },
  screen: { getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ id: 1, size: { width: 2560, height: 1440 }, scaleFactor: 1.5, bounds: { x: 0, y: 0, width: 2560, height: 1440 } }) }
}));
// @ts-ignore plain JS modules
import { SusuyaClient, links, mimeOf } from '../electron/services/susuya/SusuyaClient.js';
// @ts-ignore
import { normalizeShareConfig } from '../electron/ipc/shareIpc.js';
// @ts-ignore
import { physicalSize, screenshotName, cropRect, captureRegion } from '../electron/services/susuya/Screenshot.js';
// @ts-ignore
import { parseRegionTitle, REGION_PAGE } from '../electron/services/susuya/RegionPicker.js';

/** Minimal Susuya: same endpoints and shapes as susuya.darkhub.ink (checked against the live service). */
function fakeSusuya({ chunkSize = 1024, failFirstPutOf = -1 } = {}) {
  const uploads = new Map<string, { name: string; size: number; chunks: Buffer[]; deleted?: boolean }>();
  const failed = new Set<number>();
  const server = http.createServer((req, res) => {
    const body: Buffer[] = [];
    req.on('data', (d) => body.push(d));
    req.on('end', () => {
      const send = (code: number, obj: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      const u = req.url || '';
      if (req.method === 'GET' && u === '/api/config') return send(200, { maxFileSize: 1 << 20, chunkSize, ttlOptions: [3600, 21600, 86400] });
      if (req.method === 'POST' && u === '/api/uploads') {
        const meta = JSON.parse(Buffer.concat(body).toString());
        const id = crypto.randomBytes(5).toString('hex');
        uploads.set(id, { name: meta.name, size: meta.size, chunks: [] });
        return send(200, { id, deleteToken: 'tok', chunkSize, totalChunks: Math.ceil(meta.size / chunkSize) });
      }
      let m = /^\/api\/uploads\/(\w+)\/chunks\/(\d+)$/.exec(u);
      if (req.method === 'PUT' && m) {
        const n = Number(m[2]);
        if (n === failFirstPutOf && !failed.has(n)) { failed.add(n); return send(500, { error: 'boom' }); }
        uploads.get(m[1])!.chunks[n] = Buffer.concat(body);
        return send(200, { ok: true });
      }
      m = /^\/api\/uploads\/(\w+)\/complete$/.exec(u);
      if (req.method === 'POST' && m) {
        const up = uploads.get(m[1])!;
        const data = Buffer.concat(up.chunks);
        if (data.length !== up.size) return send(400, { error: 'incomplete' });
        return send(200, { id: m[1], name: up.name, size: up.size, kind: 'file', createdAt: 1, expiresAt: Date.now() + 3600e3, sha: crypto.createHash('sha256').update(data).digest('hex') });
      }
      m = /^\/api\/uploads\/(\w+)$/.exec(u);
      if (req.method === 'DELETE' && m) { const up = uploads.get(m[1]); if (up) up.deleted = true; return send(200, { ok: true }); }
      m = /^\/api\/files\/(\w+)$/.exec(u);
      if (req.method === 'DELETE' && m) return req.headers['x-delete-token'] === 'tok' ? send(200, { ok: true }) : send(403, { error: 'bad token' });
      send(404, { error: 'not found' });
    });
  });
  return new Promise<{ origin: string; uploads: typeof uploads; close: () => void }>((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address() as any;
    resolve({ origin: `http://127.0.0.1:${port}`, uploads, close: () => server.close() });
  }));
}

const tmpFile = (bytes: Buffer, name = 'payload.bin') => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-sus-')); const f = path.join(d, name); fs.writeFileSync(f, bytes); return f; };
let closeServer: (() => void) | null = null;
afterEach(() => { closeServer?.(); closeServer = null; });

describe('Susuya client', () => {
  it('uploads a multi-chunk file intact, retrying a failed chunk, and reports progress', async () => {
    const srv = await fakeSusuya({ chunkSize: 1000, failFirstPutOf: 3 });
    closeServer = srv.close;
    const data = crypto.randomBytes(10500);
    const progress: number[] = [];
    const r = await new SusuyaClient({ origin: srv.origin }).upload(tmpFile(data), { ttl: 3600, onProgress: (s: number) => progress.push(s) });
    expect((r as any).sha).toBe(crypto.createHash('sha256').update(data).digest('hex'));
    expect(r.deleteToken).toBe('tok');
    expect(r.directUrl).toBe(`https://susuya.darkhub.ink/d/${r.id}`);
    expect(progress.at(-1)).toBe(10500);
    expect(progress.length).toBe(11);
  });
  it('refuses files above the server limit before sending anything', async () => {
    const srv = await fakeSusuya();
    closeServer = srv.close;
    await expect(new SusuyaClient({ origin: srv.origin }).upload(tmpFile(Buffer.alloc((1 << 20) + 1)))).rejects.toThrow(/larger than/);
    expect(srv.uploads.size).toBe(0);
  });
  it('cancels and removes the partial upload on the server', async () => {
    const srv = await fakeSusuya({ chunkSize: 1000 });
    closeServer = srv.close;
    const ctrl = new AbortController();
    const p = new SusuyaClient({ origin: srv.origin }).upload(tmpFile(crypto.randomBytes(9000)), { signal: ctrl.signal, onProgress: () => ctrl.abort() });
    const err = await p.catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    await new Promise((r) => setTimeout(r, 100));
    expect([...srv.uploads.values()][0].deleted).toBe(true);
  });
  it('builds the same links as the site and guesses mime types', () => {
    expect(links('abc')).toEqual({ pageUrl: 'https://susuya.darkhub.ink/f/abc', directUrl: 'https://susuya.darkhub.ink/d/abc' });
    expect(mimeOf('C:\\x\\Shot.PNG')).toBe('image/png');
    expect(mimeOf('x.unknownext')).toBe('application/octet-stream');
  });
});

describe('screenshots and share settings', () => {
  it('uses the physical pixel size of the display', () => {
    expect(physicalSize({ size: { width: 2560, height: 1440 }, scaleFactor: 1.5 })).toEqual({ width: 3840, height: 2160 });
    expect(physicalSize({ size: { width: 1920, height: 1080 } })).toEqual({ width: 1920, height: 1080 });
  });
  it('names files by date and validates settings', () => {
    expect(screenshotName(new Date(2026, 9, 23, 9, 5, 7))).toBe('DarkHub_2026-10-23_09-05-07.png');
    const c = normalizeShareConfig({ ttl: 999, folder: 'relative', hotkey: 'Ctrl+Shift+P' }, 'C:\\Users\\x\\Pictures');
    expect(c).toEqual({ hotkey: 'Ctrl+Shift+P', regionHotkey: 'Ctrl+Shift+F11', folder: 'C:\\Users\\x\\Pictures\\DarkHub Screenshots', autoUpload: false, copyImage: true, ttl: 86400 });
    // the region shortcut can never be the same as the full-screen one
    expect(normalizeShareConfig({ hotkey: 'Alt+F9', regionHotkey: 'Alt+F9' }, 'C:/p').regionHotkey).toBe('Ctrl+Shift+F11');
    expect(normalizeShareConfig({ regionHotkey: 'Alt+F9' }, 'C:/p').regionHotkey).toBe('Alt+F9');
  });
  it('maps a region drawn in logical pixels to physical pixels, clamped', () => {
    const logical = { width: 2560, height: 1440 }, image = { width: 3840, height: 2160 };
    expect(cropRect({ x: 100, y: 50, width: 200, height: 100 }, logical, image)).toEqual({ x: 150, y: 75, width: 300, height: 150 });
    // dragged up-left, and past the edge
    expect(cropRect({ x: 2600, y: 1500, width: -200, height: -100 }, logical, image)).toEqual({ x: 3600, y: 2100, width: 240, height: 60 });
    expect(cropRect({ x: 10, y: 10, width: 1, height: 1 }, logical, image)).toBeNull();
    expect(cropRect(null, logical, image)).toBeNull();
  });
  it('parses only well-formed overlay results', () => {
    expect(parseRegionTitle('dh-region:10,20.5,300,200,2560,1440', { width: 2560, height: 1440 })).toEqual({ x: 10, y: 20.5, width: 300, height: 200 });
    // window came out smaller than the display: scaled back to the display
    expect(parseRegionTitle('dh-region:1272,0,1272,716,2544,1432', { width: 2560, height: 1440 })).toEqual({ x: 1280, y: 0, width: 1280, height: 720 });
    expect(parseRegionTitle('dh-region:10,20,300,200')).toBeNull();
    expect(parseRegionTitle('dh-region:cancel')).toBeNull();
    expect(parseRegionTitle('DarkHub')).toBeNull();
  });
  it('saves only the selected area, and nothing when cancelled', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-region-'));
    try {
      expect(await captureRegion(dir, async () => null)).toBeNull();
      expect(fs.readdirSync(dir)).toEqual([]);
      const shot = await captureRegion(dir, async () => ({ x: 0, y: 0, width: 100, height: 40 }));
      expect(fakeShot.crops.at(-1)).toEqual({ x: 0, y: 0, width: 150, height: 60 });
      expect(shot).toMatchObject({ width: 150, height: 60 });
      expect(fs.readdirSync(dir)).toHaveLength(1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('region selection overlay', () => {
  it('a click or Enter selects the whole display', () => {
    expect(parseRegionTitle('dh-region:full', { width: 2560, height: 1440 })).toEqual({ x: 0, y: 0, width: 2560, height: 1440 });
    expect(parseRegionTitle('dh-region:cancel', { width: 2560, height: 1440 })).toBeNull();
  });
  it('loads its page from the app package itself (it is not unpacked)', () => {
    expect(REGION_PAGE).not.toMatch(/app\.asar\.unpacked/);
    expect(fs.existsSync(REGION_PAGE)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    expect(pkg.build.asarUnpack.some((g: string) => g.includes('assets'))).toBe(false);
  });
});

describe('Susuya QR code', () => {
  it('encodes a Susuya link as a scannable PNG data URL', async () => {
    const QRCode = (await import('qrcode')).default;
    const url = 'https://susuya.darkhub.ink/f/hXunnB9TMo';
    const data = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 280 });
    expect(data.startsWith('data:image/png;base64,')).toBe(true);
    const segments = QRCode.create(url, { errorCorrectionLevel: 'M' });
    expect(segments.modules.size).toBeGreaterThanOrEqual(21);
  });
});
