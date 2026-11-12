// Small pure-JS codecs for formats sharp/libvips does not write (BMP, ICO, CUR) or read (ICO, CUR, BMP inside ICO).
// RGBA buffers are top-down, 4 bytes per pixel.

/** Encodes RGBA pixels as a BMP: 24-bit when fully opaque, else 32-bit BGRA with BITMAPV4 alpha mask. */
export function encodeBmp(rgba, width, height) {
  let opaque = true
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) { opaque = false; break }
  const bpp = opaque ? 24 : 32
  const rowSize = Math.ceil((width * bpp) / 32) * 4
  const headerSize = opaque ? 40 : 108
  const offset = 14 + headerSize
  const size = offset + rowSize * height
  const b = Buffer.alloc(size)
  b.write('BM', 0, 'ascii')
  b.writeUInt32LE(size, 2)
  b.writeUInt32LE(offset, 10)
  b.writeUInt32LE(headerSize, 14)
  b.writeInt32LE(width, 18)
  b.writeInt32LE(height, 22) // bottom-up
  b.writeUInt16LE(1, 26)
  b.writeUInt16LE(bpp, 28)
  b.writeUInt32LE(opaque ? 0 : 3, 30) // BI_RGB | BI_BITFIELDS
  b.writeUInt32LE(rowSize * height, 34)
  b.writeInt32LE(2835, 38)
  b.writeInt32LE(2835, 42)
  if (!opaque) {
    b.writeUInt32LE(0x00ff0000, 54)
    b.writeUInt32LE(0x0000ff00, 58)
    b.writeUInt32LE(0x000000ff, 62)
    b.writeUInt32LE(0xff000000, 66)
    b.write('BGRs', 70, 'ascii') // LCS_sRGB, stored little-endian as 'sRGB'
  }
  for (let y = 0; y < height; y++) {
    let o = offset + (height - 1 - y) * rowSize
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      b[o++] = rgba[i + 2]; b[o++] = rgba[i + 1]; b[o++] = rgba[i]
      if (!opaque) b[o++] = rgba[i + 3]
    }
  }
  return b
}

/**
 * Builds an ICO (type 1) or CUR (type 2) from PNG images: [{ size, png }]. PNG entries are valid from Windows Vista
 * on for every size. For cursors, `hotspot` is in pixels of the largest image and scaled for the others.
 */
export function encodeIco(images, { cursor = false, hotspot = { x: 0, y: 0 } } = {}) {
  const sorted = [...images].sort((a, b) => a.size - b.size)
  const max = sorted[sorted.length - 1]?.size || 1
  const header = Buffer.alloc(6 + 16 * sorted.length)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(cursor ? 2 : 1, 2)
  header.writeUInt16LE(sorted.length, 4)
  let offset = header.length
  sorted.forEach((img, i) => {
    const e = 6 + i * 16
    header[e] = img.size >= 256 ? 0 : img.size
    header[e + 1] = img.size >= 256 ? 0 : img.size
    header[e + 2] = 0
    header[e + 3] = 0
    if (cursor) {
      header.writeUInt16LE(Math.round((hotspot.x * img.size) / max), e + 4)
      header.writeUInt16LE(Math.round((hotspot.y * img.size) / max), e + 6)
    } else {
      header.writeUInt16LE(1, e + 4)
      header.writeUInt16LE(32, e + 6)
    }
    header.writeUInt32LE(img.png.length, e + 8)
    header.writeUInt32LE(offset, e + 12)
    offset += img.png.length
  })
  return Buffer.concat([header, ...sorted.map((i) => i.png)])
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

/** Lists the images inside an ICO/CUR: [{ width, height, bpp, offset, length, png }]. */
export function readIcoDirectory(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || ![1, 2].includes(buf.readUInt16LE(2))) throw new Error('not an ICO/CUR file')
  const count = buf.readUInt16LE(4)
  const out = []
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16
    if (e + 16 > buf.length) break
    const length = buf.readUInt32LE(e + 8)
    const offset = buf.readUInt32LE(e + 12)
    if (offset + length > buf.length || length < 8) continue
    const data = buf.subarray(offset, offset + length)
    const png = data.subarray(0, 4).equals(PNG_SIG)
    let width = buf[e] || 256
    let height = buf[e + 1] || 256
    let bpp = buf.readUInt16LE(e + 6)
    if (png && data.length > 24) { width = data.readUInt32BE(16); height = data.readUInt32BE(20) }
    else if (!png && data.length >= 40) { width = data.readInt32LE(4); height = Math.abs(data.readInt32LE(8)) / 2; bpp = data.readUInt16LE(14) || bpp }
    out.push({ width, height, bpp, offset, length, png })
  }
  return out
}

/** Decodes a DIB stored inside an ICO/CUR (1/4/8/24/32-bit + AND mask) to RGBA. */
export function decodeIcoDib(data) {
  const hdr = data.readUInt32LE(0)
  const width = data.readInt32LE(4)
  const height = Math.abs(data.readInt32LE(8)) / 2
  const bpp = data.readUInt16LE(14)
  const colors = data.readUInt32LE(32) || (bpp <= 8 ? 1 << bpp : 0)
  const palOff = hdr
  const pixOff = palOff + colors * 4
  const xorRow = Math.ceil((width * bpp) / 32) * 4
  const andOff = pixOff + xorRow * height
  const andRow = Math.ceil(width / 32) * 4
  const rgba = Buffer.alloc(width * height * 4)
  let anyAlpha = false
  for (let y = 0; y < height; y++) {
    const row = pixOff + (height - 1 - y) * xorRow
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      let r = 0; let g = 0; let b = 0; let a = 255
      if (bpp === 32) { b = data[row + x * 4]; g = data[row + x * 4 + 1]; r = data[row + x * 4 + 2]; a = data[row + x * 4 + 3]; if (a) anyAlpha = true }
      else if (bpp === 24) { b = data[row + x * 3]; g = data[row + x * 3 + 1]; r = data[row + x * 3 + 2] }
      else {
        const per = 8 / bpp
        const byte = data[row + Math.floor(x / per)]
        const shift = (per - 1 - (x % per)) * bpp
        const idx = (byte >> shift) & ((1 << bpp) - 1)
        const p = palOff + idx * 4
        b = data[p]; g = data[p + 1]; r = data[p + 2]
      }
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a
    }
  }
  // Without an alpha channel the AND mask decides transparency.
  if (bpp !== 32 || !anyAlpha) {
    for (let y = 0; y < height; y++) {
      const row = andOff + (height - 1 - y) * andRow
      if (row + andRow > data.length) break
      for (let x = 0; x < width; x++) {
        const bit = (data[row + (x >> 3)] >> (7 - (x & 7))) & 1
        rgba[(y * width + x) * 4 + 3] = bit ? 0 : 255
      }
    }
  }
  return { rgba, width, height }
}

/** Picks the best image of an ICO/CUR (largest, then deepest) and returns either { png } or { rgba, width, height }. */
export function decodeIcoBest(buf) {
  const dir = readIcoDirectory(buf)
  if (!dir.length) throw new Error('empty ICO/CUR')
  dir.sort((a, b) => (b.width * b.height - a.width * a.height) || (b.bpp - a.bpp))
  const best = dir[0]
  const data = buf.subarray(best.offset, best.offset + best.length)
  if (best.png) return { png: Buffer.from(data) }
  return decodeIcoDib(data)
}
