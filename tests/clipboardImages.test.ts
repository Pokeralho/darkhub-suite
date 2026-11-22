// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
// @ts-ignore plain JS module
import { writeClipboardImage, clipboardImageSize } from '../electron/services/clipboardImages.js';

// Electron 44 removed clipboard.readImage()/writeImage() and made the module asynchronous. These fakes have the
// shape of the new API (ClipboardItem with MIME-keyed Blobs).
class FakeItem {
  data: Record<string, any>;
  constructor(data: Record<string, any>) { this.data = data; }
  get types() { return Object.keys(this.data); }
  async getType(t: string) { return this.data[t]; }
}
const png = (bytes: number[]) => ({ toPNG: () => Buffer.from(bytes) });

describe('clipboard pictures (Electron 44+ API)', () => {
  it('writes one item with the PNG bytes, plus the text when given', async () => {
    const clipboard = { write: vi.fn(async (_: any[]) => {}) };
    await writeClipboardImage({ clipboard, ClipboardItem: FakeItem }, png([1, 2, 3]));
    const [item] = clipboard.write.mock.calls[0][0];
    expect(item.types).toEqual(['image/png']);
    expect(item.data['image/png'].type).toBe('image/png');
    expect([...new Uint8Array(await item.data['image/png'].arrayBuffer())]).toEqual([1, 2, 3]);

    await writeClipboardImage({ clipboard, ClipboardItem: FakeItem }, png([9]), 'https://susuya.example/x');
    const [both] = clipboard.write.mock.calls[1][0];
    expect(both.types).toEqual(['image/png', 'text/plain']);
    expect(both.data['text/plain']).toBe('https://susuya.example/x');
  });

  it('a busy clipboard rejects, so callers can catch it', async () => {
    const clipboard = { write: async () => { throw new Error('busy'); } };
    await expect(writeClipboardImage({ clipboard, ClipboardItem: FakeItem }, png([1]))).rejects.toThrow('busy');
  });

  it('reads the size of the picture on the clipboard, or null when there is none', async () => {
    const nativeImage = {
      createFromBuffer: (b: Buffer) => ({ isEmpty: () => b.length === 0, getSize: () => ({ width: b[0], height: b[1] }) })
    };
    const withImage = { read: async () => [new FakeItem({ 'text/plain': new Blob(['x']) }), new FakeItem({ 'image/png': new Blob([new Uint8Array([64, 48])]) })] };
    expect(await clipboardImageSize({ clipboard: withImage, nativeImage })).toEqual({ width: 64, height: 48 });
    expect(await clipboardImageSize({ clipboard: { read: async () => [new FakeItem({ 'text/plain': new Blob(['x']) })] }, nativeImage })).toBeNull();
    expect(await clipboardImageSize({ clipboard: { read: async () => [] }, nativeImage })).toBeNull();
    // an image entry that does not decode is skipped
    expect(await clipboardImageSize({ clipboard: { read: async () => [new FakeItem({ 'image/png': new Blob([]) })] }, nativeImage })).toBeNull();
  });
});
