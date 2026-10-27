// Turns an extension folder into a package (one .darkhub.json with every file inlined as text).
// The folder holds darkhub-extension.json (the manifest: everything except "files") and the source files.
import fs from 'node:fs'
import path from 'node:path'

export const MANIFEST = 'darkhub-extension.json'
const ALLOWED = /\.(html|js|css|json|svg|md|txt)$/
const SKIP = new Set(['node_modules', '.git', 'dist', '.vscode'])

export function packExtensionFolder(dir) {
  const manifestFile = path.join(dir, MANIFEST)
  if (!fs.existsSync(manifestFile)) throw new Error(`${MANIFEST} não encontrado em ${dir}`)
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8').replace(/^﻿/, ''))
  const files = {}
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(r)
      else if (ALLOWED.test(e.name) && r !== MANIFEST) files[r] = fs.readFileSync(path.join(dir, r), 'utf8')
    }
  }
  walk('')
  const { files: _ignored, ...rest } = manifest
  return { schemaVersion: 1, type: 'extension', ...rest, files }
}
