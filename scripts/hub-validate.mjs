#!/usr/bin/env node
// Validates DarkHub packages exactly like the app does (schema + security rules + built-in tweak/operation ids) and explains
// what each one changes. Usage: npm run hub:validate -- <file.darkhub.json> [more files...]
// Exit code 0 when every file is valid, 1 otherwise. Made for people and AI agents (Claude Code) alike.
import fs from 'node:fs'
import { validatePackage, resolvePackage, describeStep, textOf } from '../electron/services/hub/hubModel.js'

import { buildBuiltins } from '../electron/services/hub/builtins.js'

const { default: engine } = await import(new URL('../electron/services/optimizer/DeepTweaksEngine.js', import.meta.url))
const { default: optimizer } = await import(new URL('../electron/services/optimizer/SystemOptimizerService.js', import.meta.url))
const builtins = buildBuiltins(engine, optimizer)
const official = process.argv.includes('--official')

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))
if (!files.length) {
  console.error('usage: npm run hub:validate -- <file.darkhub.json> [...] [--official]')
  process.exit(2)
}

let failed = 0
for (const file of files) {
  let text
  try { text = fs.readFileSync(file, 'utf8') } catch (e) { console.log(`\n✗ ${file}\n  cannot read: ${e.message}`); failed++; continue }
  const v = validatePackage(text, builtins, { official })
  if (!v.ok) {
    failed++
    console.log(`\n✗ ${file}`)
    for (const e of v.errors) console.log(`  ${e.path}: ${e.message}`)
    continue
  }
  const pkg = v.pkg
  // describe every item as if all conditions matched, so the author sees the whole package
  const all = resolvePackage({ ...pkg, when: undefined, items: pkg.items.map(({ if: _if, ...it }) => it) }, {}, builtins)
  console.log(`\n✓ ${file}`)
  console.log(`  ${pkg.id} v${pkg.version} · ${pkg.type} · risk ${v.risk} · ${pkg.items.length} item(s)`)
  console.log(`  ${textOf(pkg.name, 'en-US') || textOf(pkg.name, 'pt-BR')}`)
  if (pkg.when) console.log(`  only when: ${JSON.stringify(pkg.when)}`)
  for (const s of all.steps) {
    const d = describeStep(s, 'en-US', builtins)
    const cond = pkg.items[s.index].if ? `   [if ${JSON.stringify(pkg.items[s.index].if)}]` : ''
    const via = s.via ? `   (via darkhub:${s.via})` : ''
    console.log(`  ${String(s.index + 1).padStart(2)}. ${d.group}: ${d.title}${d.target ? ` -> ${d.target}` : ''}${via}${cond}`)
  }
}
console.log(failed ? `\n${failed} of ${files.length} file(s) failed.` : `\nAll ${files.length} file(s) valid.`)
process.exit(failed ? 1 : 0)
