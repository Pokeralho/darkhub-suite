// Minimal PE reading for DLL swaps: machine type and VS_FIXEDFILEINFO file version, without spawning PowerShell.
import fs from 'node:fs'

const FIXED_SIG = Buffer.from([0xbd, 0x04, 0xef, 0xfe]) // VS_FIXEDFILEINFO.dwSignature 0xFEEF04BD, little endian
const TAIL_BYTES = 4 << 20 // .rsrc is normally the last section: read the end first

function readRange(fd, start, length) {
  const buf = Buffer.alloc(length)
  const n = fs.readSync(fd, buf, 0, length, start)
  return buf.subarray(0, n)
}

/** File version "a.b.c.d" from a PE buffer, or null. */
export function fileVersionFromBuffer(buf) {
  for (let at = buf.indexOf(FIXED_SIG); at !== -1; at = buf.indexOf(FIXED_SIG, at + 4)) {
    if (at + 16 > buf.length) break
    const structVersion = buf.readUInt32LE(at + 4)
    if (structVersion !== 0x00010000) continue // a real VS_FIXEDFILEINFO, not a stray byte pattern
    const ms = buf.readUInt32LE(at + 8)
    const ls = buf.readUInt32LE(at + 12)
    return `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`
  }
  return null
}

export function peFileVersion(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const tail = readRange(fd, Math.max(0, size - TAIL_BYTES), Math.min(size, TAIL_BYTES))
    return fileVersionFromBuffer(tail) ?? (size > TAIL_BYTES ? fileVersionFromBuffer(readRange(fd, 0, size)) : null)
  } finally {
    fs.closeSync(fd)
  }
}

/** True for a 64-bit (x64) PE image. */
export function isPe64(file) {
  const fd = fs.openSync(file, 'r')
  try {
    const head = readRange(fd, 0, 4096)
    if (head.length < 64 || head.readUInt16LE(0) !== 0x5a4d) return false // "MZ"
    const pe = head.readUInt32LE(0x3c)
    if (pe + 6 > head.length || head.readUInt32LE(pe) !== 0x00004550) return false // "PE\0\0"
    return head.readUInt16LE(pe + 4) === 0x8664
  } finally {
    fs.closeSync(fd)
  }
}

/** Numeric compare of dotted versions: <0 when a is older than b. */
export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(Number)
  const pb = String(b || '0').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}
