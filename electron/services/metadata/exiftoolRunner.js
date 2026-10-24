// Runs the ExifTool binary (bundled through exiftool-vendored.exe) with an UTF-8 argument file, so file names and
// values with any characters (quotes, accents, $, @) reach ExifTool intact and nothing is ever parsed by a shell.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'

// Argfile lines are taken verbatim except that ExifTool trims leading whitespace and one space after "=". Values that
// would be altered by that (or contain line breaks) are passed through a temp file with "-TAG<=file", which ExifTool
// reads byte-for-byte. Plain args must not contain line breaks.
function needsFile(value) {
  return /[\r\n\t]/.test(value) || /^\s/.test(value)
}

const tmpName = (suffix) => path.join(os.tmpdir(), `dh-exiftool-${crypto.randomBytes(6).toString('hex')}${suffix}`)

/** Builds the assignment argument for one tag; values that need it go through a temp file pushed to `files`. */
export async function assignArg(tag, value, files) {
  const v = value == null ? '' : String(value)
  if (!needsFile(v)) return `-${tag}=${v}`
  const f = tmpName('.val')
  await fs.writeFile(f, v, 'utf8')
  files.push(f)
  return `-${tag}<=${f}`
}

export async function runExiftool(exePath, args, { encoding = 'utf8', timeoutMs = 120000 } = {}) {
  if (!exePath) throw new Error('ExifTool is not available')
  const lines = ['-charset', 'filename=utf8', '-charset', 'utf8', ...args].map(String)
  if (lines.some((a) => /[\r\n]/.test(a))) throw new Error('internal: ExifTool argument contains a line break')
  const argFile = tmpName('.args')
  await fs.writeFile(argFile, lines.join('\n') + '\n', 'utf8')
  try {
    return await new Promise((resolve) => {
      execFile(exePath, ['-@', argFile], { windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding: encoding === 'buffer' ? 'buffer' : 'utf8' },
        (err, stdout, stderr) => resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr: String(stderr || ''), error: err }))
    })
  } finally {
    fs.unlink(argFile).catch(() => {})
  }
}

/** Flat `-G1` tag map ("Group:Tag" -> value) of one file. */
export async function readTags(exePath, filePath, extraArgs = []) {
  const r = await runExiftool(exePath, ['-json', '-G1', '-a', '-api', 'LargeFileSupport=1', ...extraArgs, filePath])
  let data
  try { data = JSON.parse(r.stdout || '[]') } catch { data = null }
  if (!Array.isArray(data) || !data[0]) throw new Error((r.stderr || 'ExifTool could not read the file').trim().split(/\r?\n/)[0])
  const out = { ...data[0] }
  delete out.SourceFile
  return out
}

/** Extracts one binary tag (e.g. Picture/CoverArt). Returns a Buffer or null. */
export async function readBinaryTag(exePath, filePath, tag) {
  const r = await runExiftool(exePath, ['-b', `-${tag}`, filePath], { encoding: 'buffer' })
  return r.code === 0 && Buffer.isBuffer(r.stdout) && r.stdout.length ? r.stdout : null
}

/** Writes `assignArgs` (e.g. ["-XMP-dc:Title=x"]) from inPath into a NEW file outPath (must not exist). */
export async function writeTagsTo(exePath, inPath, outPath, assignArgs, tempFiles = []) {
  try {
    const r = await runExiftool(exePath, ['-api', 'LargeFileSupport=1', ...assignArgs, '-o', outPath, inPath])
    const warnings = r.stderr.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    let exists = false
    try { await fs.access(outPath); exists = true } catch { /* not written */ }
    if (!exists) {
      // "0 image files updated, 1 image files unchanged": nothing to change, so the output is an identical copy.
      if (/unchanged/i.test(String(r.stdout)) && !/error/i.test(r.stderr)) {
        await fs.copyFile(inPath, outPath)
        return { warnings, unchanged: true }
      }
      throw new Error(warnings.find((w) => /error/i.test(w)) || warnings[0] || 'ExifTool did not write the file')
    }
    return { warnings, unchanged: false }
  } finally {
    for (const f of tempFiles) fs.unlink(f).catch(() => {})
  }
}
