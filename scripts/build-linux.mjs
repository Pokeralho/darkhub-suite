#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false, ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

/** Find the icon that package.json's build.linux.extraResources copies into the packaged resources. */
export function findPackagedIcon(rootDir = root) {
  const out = path.join(rootDir, 'dist_release')
  if (!fs.existsSync(out)) return null
  for (const entry of fs.readdirSync(out, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('linux')) continue
    const icon = path.join(out, entry.name, 'resources', 'assets', 'icon.png')
    try {
      if (fs.statSync(icon).size > 0) return icon
    } catch {}
  }
  return null
}

/** Linux package smoke check: without this file getAppIconPath() fails and close-to-tray strands the window. */
export function assertPackagedIcon(rootDir = root) {
  const icon = findPackagedIcon(rootDir)
  if (!icon) {
    throw new Error(
      '[build:linux] packaged tray icon missing (expected dist_release/linux-unpacked/resources/assets/icon.png). ' +
      'Check build.linux.extraResources in package.json.'
    )
  }
  console.log(`[build:linux] smoke ok: packaged tray icon ${path.relative(rootDir, icon)}`)
  return icon
}

function main() {
  if (process.platform === 'win32') {
    console.error('[build:linux] Run this on Linux/Ubuntu to produce Linux artifacts.')
    process.exit(1)
  }

  const sourceIcon = path.join(root, 'build', 'icon.png')
  if (!fs.existsSync(sourceIcon)) {
    console.error('[build:linux] build/icon.png is missing; the Linux package needs it as app/tray icon.')
    process.exit(1)
  }

  // electron-builder extraResources "from" paths must exist; create empty placeholders for optional Windows-only/vendor assets.
  for (const rel of ['PGE Portable', 'vendor/realesrgan', 'vendor/libreoffice', 'vendor/imagetools']) {
    const dir = path.join(root, rel)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'

  run(npm, ['run', 'build:cleaner'])
  run(npm, ['run', 'build:renderer'])
  run(npm, ['run', 'integrity'])
  run(npx, ['electron-builder', '--linux', 'dir'])

  assertPackagedIcon()
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) main()
