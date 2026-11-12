// @vitest-environment node
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
// @ts-ignore plain JS module
import { encodeBmp, encodeIco, readIcoDirectory, decodeIcoBest, decodeIcoDib } from '../electron/services/converter/imageCodecs.js';
// @ts-ignore plain JS module
import { ddsFormatArg, ffmpegImageEncodeArgs, ffmpegImageDecodeArgs, IMAGE_INPUT, IMAGE_OUTPUT, DDS_FORMATS } from '../electron/services/converter/ImageConverter.js';

function gradient(w: number, h: number, alpha = 255) {
  const b = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    b[i] = x * 8; b[i + 1] = y * 8; b[i + 2] = 128; b[i + 3] = alpha;
  }
  return b;
}

describe('BMP writer', () => {
  it('writes 24-bit for opaque pixels, bottom-up, padded rows', () => {
    const bmp = encodeBmp(gradient(3, 2), 3, 2);
    expect(bmp.toString('ascii', 0, 2)).toBe('BM');
    expect(bmp.readUInt16LE(28)).toBe(24);
    expect(bmp.readUInt32LE(2)).toBe(bmp.length);
    expect(bmp.length).toBe(54 + 12 * 2); // 3 px * 3 bytes = 9, padded to 12
    // first stored row is the bottom one (y=1): x=0 -> B=128, G=8, R=0
    expect([...bmp.subarray(54, 57)]).toEqual([128, 8, 0]);
  });

  it('writes 32-bit BGRA with bitfields when there is transparency', () => {
    const bmp = encodeBmp(gradient(4, 4, 100), 4, 4);
    expect(bmp.readUInt16LE(28)).toBe(32);
    expect(bmp.readUInt32LE(30)).toBe(3);
    expect(bmp.readUInt32LE(66)).toBe(0xff000000);
    expect(bmp[bmp.readUInt32LE(10) + 3]).toBe(100);
  });
});

describe('ICO / CUR', () => {
  it('round-trips PNG entries with sizes and cursor hotspots', async () => {
    const sizes = [16, 32, 256];
    const images = await Promise.all(sizes.map(async (size) => ({ size, png: await sharp(gradient(32, 32), { raw: { width: 32, height: 32, channels: 4 } }).resize(size, size).png().toBuffer() })));
    const ico = encodeIco(images);
    expect(ico.readUInt16LE(2)).toBe(1);
    const dir = readIcoDirectory(ico);
    expect(dir.map((d: any) => d.width)).toEqual([16, 32, 256]);
    expect(dir.every((d: any) => d.png)).toBe(true);
    expect(ico[6 + 2 * 16]).toBe(0); // 256 is stored as 0
    const best = decodeIcoBest(ico);
    expect((await sharp(best.png).metadata()).width).toBe(256);

    const cur = encodeIco(images, { cursor: true, hotspot: { x: 128, y: 64 } });
    expect(cur.readUInt16LE(2)).toBe(2);
    expect(cur.readUInt16LE(6 + 4)).toBe(8); // 16 px image: 128 * 16/256
    expect(cur.readUInt16LE(6 + 2 * 16 + 6)).toBe(64);
  });

  it('decodes a classic 32-bit DIB entry and an 8-bit paletted one with its AND mask', () => {
    // 2x2, 32 bpp, BITMAPINFOHEADER with doubled height
    const w = 2; const h = 2;
    const dib = Buffer.alloc(40 + w * h * 4 + 4 * h);
    dib.writeUInt32LE(40, 0); dib.writeInt32LE(w, 4); dib.writeInt32LE(h * 2, 8); dib.writeUInt16LE(1, 12); dib.writeUInt16LE(32, 14);
    // bottom row first: (0,1) red opaque, (1,1) green half
    dib.set([0, 0, 255, 255, 0, 255, 0, 128], 40);
    dib.set([255, 0, 0, 255, 255, 255, 255, 0], 48);
    const d = decodeIcoDib(dib);
    expect([...d.rgba.subarray(8, 12)]).toEqual([255, 0, 0, 255]);
    expect([...d.rgba.subarray(12, 16)]).toEqual([0, 255, 0, 128]);

    const p = Buffer.alloc(40 + 256 * 4 + 4 * h + 4 * h);
    p.writeUInt32LE(40, 0); p.writeInt32LE(w, 4); p.writeInt32LE(h * 2, 8); p.writeUInt16LE(1, 12); p.writeUInt16LE(8, 14); p.writeUInt32LE(256, 32);
    p.set([10, 20, 30, 0], 40 + 4 * 1); // palette[1] = BGR(10,20,30)
    const pix = 40 + 1024;
    p[pix] = 1; p[pix + 1] = 1; p[pix + 4] = 1; p[pix + 5] = 1;
    p[pix + 8] = 0b01000000; // AND mask, bottom row: pixel 1 transparent
    const q = decodeIcoDib(p);
    expect([...q.rgba.subarray(8, 12)]).toEqual([30, 20, 10, 255]);
    expect(q.rgba[15]).toBe(0);
  });

  it('rejects files that are not icons', () => {
    expect(() => readIcoDirectory(Buffer.from('not an icon at all'))).toThrow();
  });
});

describe('image engines', () => {
  it('maps DDS options to texconv formats', () => {
    expect(ddsFormatArg('BC7', true)).toBe('BC7_UNORM_SRGB');
    expect(ddsFormatArg('bc1', false)).toBe('BC1_UNORM');
    expect(ddsFormatArg('BC5', true)).toBe('BC5_UNORM'); // no sRGB variant
    expect(ddsFormatArg('BC6H')).toBe('BC6H_UF16');
    expect(ddsFormatArg('nope')).toBe('BC7_UNORM_SRGB');
    expect(Object.keys(DDS_FORMATS)).toEqual(['BC1', 'BC3', 'BC4', 'BC5', 'BC6H', 'BC7', 'RGBA']);
  });

  it('linearizes for EXR/HDR output and tone-maps them back on input', () => {
    expect(ffmpegImageEncodeArgs('exr').join(' ')).toContain('t=linear');
    expect(ffmpegImageEncodeArgs('exr')).toContain('half');
    expect(ffmpegImageEncodeArgs('hdr')).toContain('hdr');
    expect(ffmpegImageEncodeArgs('tga')).toEqual(['-c:v', 'targa']);
    expect(() => ffmpegImageEncodeArgs('png')).toThrow();
    expect(ffmpegImageDecodeArgs('exr').pre).toEqual(['-apply_trc', 'iec61966_2_1']);
    expect(ffmpegImageDecodeArgs('hdr').vf.join(' ')).toContain('tin=linear');
    expect(ffmpegImageDecodeArgs('tga')).toEqual({ pre: [], vf: [] });
  });

  it('covers the formats the owner asked for', () => {
    for (const f of ['dds', 'tga', 'hdr', 'exr', 'psd', 'ico', 'cur', 'avif', 'heic', 'jxl', 'svg', 'cr2', 'nef', 'arw', 'dng']) expect(IMAGE_INPUT).toContain(f);
    for (const f of ['dds', 'tga', 'hdr', 'exr', 'ico', 'cur', 'avif', 'jxl', 'bmp']) expect(IMAGE_OUTPUT).toContain(f);
  });
});
