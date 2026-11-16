#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false, ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (process.platform === 'win32') {
  console.error('[build:linux] Run this on Linux/Ubuntu to produce Linux artifacts.')
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
