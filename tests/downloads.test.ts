// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { DownloadManager } from '../electron/services/downloads/DownloadManager.js';
import {
  sanitizeFileName, planPieces, isInsideWindow, safeJoin, categoryForFile, Throttle, validateDownloadUrl, parseContentDisposition, uniquePath
} from '../electron/services/downloads/downloadUtils.js';

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');

describe('download utils', () => {
  it('sanitizes dangerous names', () => {
    expect(sanitizeFileName('..\\..\\Windows\\evil.exe')).toBe('evil.exe');
    expect(sanitizeFileName('a/b/c.txt')).toBe('c.txt');
    expect(sanitizeFileName('CON')).toBe('_CON');
    expect(sanitizeFileName('bad:name?.zip')).toBe('bad_name_.zip');
    expect(sanitizeFileName('')).toBe('download');
    expect(sanitizeFileName('x'.repeat(400) + '.mp4').length).toBeLessThanOrEqual(180);
    expect(sanitizeFileName('invoice‮gpj.exe')).toBe('invoicegpj.exe');
    expect(sanitizeFileName('%2e%2e%2f%2e%2e%2fevil.dll')).toBe('evil.dll');
    expect(parseContentDisposition('attachment; filename="..\\..\\AppData\\evil.exe"')).not.toBeNull();
    expect(sanitizeFileName(parseContentDisposition('attachment; filename="..\\..\\AppData\\evil.exe"'))).toBe('evil.exe');
  });
  it('never escapes the destination folder', () => {
    const root = path.join(os.tmpdir(), 'dhroot');
    expect(path.dirname(safeJoin(root, '../../etc/passwd'))).toBe(path.resolve(root));
  });
  it('plans contiguous pieces covering the whole file', () => {
    for (const size of [1, 1000, 512 * 1024, 5_000_001, 3_000_000_000]) {
      const pieces = planPieces(size, 8);
      expect(pieces[0].start).toBe(0);
      expect(pieces[pieces.length - 1].end).toBe(size - 1);
      for (let i = 1; i < pieces.length; i++) expect(pieces[i].start).toBe(pieces[i - 1].end + 1);
      expect(pieces.length).toBeLessThanOrEqual(96);
    }
    expect(planPieces(0, 8)).toEqual([]);
  });
  it('handles schedule windows crossing midnight', () => {
    const at = (h: number, m = 0) => new Date(2026, 0, 1, h, m);
    expect(isInsideWindow(at(23, 30), '22:00', '06:00')).toBe(true);
    expect(isInsideWindow(at(3), '22:00', '06:00')).toBe(true);
    expect(isInsideWindow(at(12), '22:00', '06:00')).toBe(false);
    expect(isInsideWindow(at(12), '01:00', '07:00')).toBe(false);
    expect(isInsideWindow(at(2), '01:00', '07:00')).toBe(true);
  });
  it('validates urls, categories, headers and unique names', () => {
    expect(validateDownloadUrl('ftp://x/y').ok).toBe(false);
    expect(validateDownloadUrl('javascript:alert(1)').ok).toBe(false);
    expect(validateDownloadUrl('https://example.com/a.zip').ok).toBe(true);
    expect(categoryForFile('movie.MKV')).toBe('Video');
    expect(categoryForFile('x.unknown')).toBe('Other');
    expect(parseContentDisposition('attachment; filename="a b.zip"')).toBe('a b.zip');
    expect(parseContentDisposition("attachment; filename*=UTF-8''%C3%A9.txt")).toBe('é.txt');
    expect(path.basename(uniquePath('/x', 'a.zip', (p: string) => p.endsWith('a.zip')))).toBe('a (1).zip');
  });
  it('throttle spaces out bytes', () => {
    const t = new Throttle(1000);
    expect(t.take(1000, 0)).toBe(0);
    expect(t.take(1000, 0)).toBe(1000);
    expect(new Throttle(0).take(1e9)).toBe(0);
  });
});

describe('DownloadManager (real HTTP server)', () => {
  const cleanup: Array<() => void> = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  function startServer(data: Buffer, { ranges = true, slowChunkMs = 0 } = {}) {
    const hits = { ranged: 0, total: 0 };
    const server = http.createServer((req, res) => {
      hits.total++;
      const range = /bytes=(\d+)-(\d*)/.exec(String(req.headers.range ?? ''));
      let start = 0, end = data.length - 1, status = 200;
      const headers: Record<string, string | number> = { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="server-name.bin"' };
      if (ranges) headers['Accept-Ranges'] = 'bytes';
      if (range && ranges) {
        hits.ranged++;
        start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), data.length - 1) : data.length - 1;
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${data.length}`;
      }
      headers['Content-Length'] = end - start + 1;
      res.writeHead(status, headers);
      const body = data.subarray(start, end + 1);
      if (!slowChunkMs) { res.end(body); return; }
      let off = 0;
      const tick = () => {
        if (off >= body.length || res.destroyed) { res.end(); return; }
        res.write(body.subarray(off, off + 64 * 1024)); off += 64 * 1024;
        setTimeout(tick, slowChunkMs);
      };
      tick();
    });
    return new Promise<{ url: string; hits: typeof hits }>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as any).port;
        cleanup.push(() => server.close());
        resolve({ url: `http://127.0.0.1:${port}/file.bin`, hits });
      });
    });
  }

  async function newManager(extra: any = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dh-dl-'));
    const m = new DownloadManager({ dataDir: path.join(root, 'data'), defaultDownloadDir: path.join(root, 'out') });
    await m.init();
    if (Object.keys(extra).length) await m.setSettings(extra);
    cleanup.push(() => { void m.shutdown(); });
    return { m, root };
  }

  const waitFor = async (fn: () => boolean, ms = 15000) => {
    const t0 = Date.now();
    while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 40)); }
  };

  it('downloads with several connections and gets identical bytes', async () => {
    const data = crypto.randomBytes(5 * 1024 * 1024 + 123);
    const { url, hits } = await startServer(data);
    const { m } = await newManager();
    const r = await m.add({ url, connections: 4 });
    expect(r.ok).toBe(true);
    await waitFor(() => m.list()[0]?.status === 'completed');
    const item = m.list()[0];
    expect(item.fileName).toBe('server-name.bin');
    expect(sha(fs.readFileSync(item.filePath))).toBe(sha(data));
    expect(hits.ranged).toBeGreaterThan(4);
    expect(fs.existsSync(item.filePath + '.dhpart')).toBe(false);
  });

  it('falls back to one connection when the server has no Range support', async () => {
    const data = crypto.randomBytes(1024 * 1024 + 7);
    const { url } = await startServer(data, { ranges: false });
    const { m } = await newManager();
    await m.add({ url, connections: 8 });
    await waitFor(() => m.list()[0]?.status === 'completed');
    expect(m.list()[0].resumable).toBe(false);
    expect(sha(fs.readFileSync(m.list()[0].filePath))).toBe(sha(data));
  });

  it('pauses and resumes without corrupting the file', async () => {
    const data = crypto.randomBytes(4 * 1024 * 1024);
    const { url } = await startServer(data, { slowChunkMs: 8 });
    const { m } = await newManager();
    const { id } = await m.add({ url, connections: 4 }) as any;
    await waitFor(() => (m.list()[0]?.downloaded ?? 0) > 500_000);
    expect(m.pause(id).ok).toBe(true);
    await waitFor(() => m.list()[0].status === 'paused');
    const partial = m.list()[0].downloaded;
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(data.length);
    m.resume(id);
    await waitFor(() => m.list()[0].status === 'completed', 30000);
    expect(sha(fs.readFileSync(m.list()[0].filePath))).toBe(sha(data));
  });

  it('honours the speed limit', async () => {
    const data = crypto.randomBytes(1024 * 1024);
    const { url } = await startServer(data);
    const { m } = await newManager({ globalSpeedLimitKBps: 512 });
    const t0 = Date.now();
    await m.add({ url, connections: 4 });
    await waitFor(() => m.list()[0]?.status === 'completed', 20000);
    expect(Date.now() - t0).toBeGreaterThan(1200); // 1 MiB at 512 KiB/s ≈ 2 s
  });

  it('rejects a wrong sha256 and reports an error', async () => {
    const data = crypto.randomBytes(200_000);
    const { url } = await startServer(data);
    const { m } = await newManager();
    await m.add({ url, sha256: 'a'.repeat(64) });
    await waitFor(() => m.list()[0]?.status === 'error');
    expect(m.list()[0].error).toBe('sha256-mismatch');
  });

  it('refuses non-http urls', async () => {
    const { m } = await newManager();
    expect((await m.add({ url: 'file:///etc/passwd' })).ok).toBe(false);
  });

  it('never queues more than maxConcurrent downloads at once', async () => {
    const data = crypto.randomBytes(1024 * 1024);
    const { url } = await startServer(data, { slowChunkMs: 15 });
    const { m } = await newManager({ maxConcurrent: 2 });
    for (let i = 0; i < 5; i++) await m.add({ url });
    await new Promise((r) => setTimeout(r, 300));
    expect(m.list().filter((i: any) => i.status === 'downloading').length).toBeLessThanOrEqual(2);
    await waitFor(() => m.list().every((i: any) => i.status === 'completed'), 60000);
  }, 70000);
});
