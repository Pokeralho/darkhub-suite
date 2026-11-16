#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = path.join(root, 'native_cleaner', 'Cargo.toml')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', ...opts })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

if (process.platform === 'win32') {
  const env = { ...process.env, RUSTFLAGS: [process.env.RUSTFLAGS, '-C target-feature=+crt-static'].filter(Boolean).join(' ') }
  run('cargo', ['build', '--release', '--manifest-path', manifest], { env, shell: process.platform === 'win32' })
  const src = path.join(root, 'native_cleaner', 'target', 'release', 'DarkHub_Cleaner.exe')
  const dest = path.join(root, 'electron', 'services', 'DarkHub.Cleaner.exe')
  copy(src, dest)
  console.log(`[build:cleaner] copied ${src} -> ${dest}`)
} else {
  run('cargo', ['build', '--release', '--manifest-path', manifest])
  const src = path.join(root, 'native_cleaner', 'target', 'release', 'DarkHub_Cleaner')
  const dest = path.join(root, 'electron', 'services', 'DarkHub_Cleaner')
  if (!fs.existsSync(src)) {
    console.error(`[build:cleaner] expected Linux cleaner binary not found: ${src}`)
    process.exit(1)
  }
  copy(src, dest)
  try { fs.chmodSync(dest, 0o755) } catch {}
  console.log(`[build:cleaner] copied ${src} -> ${dest}`)
}
