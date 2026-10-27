// Copies the package rules (hubModel.js, builtins.js, schema, builtins.json) to the Hub server so it validates exactly
// like the app. Usage: npm run hub:core -- [path to apps/hub-api] (default: the darkhub-ecosystem checkout next to this
// repo). Run it after changing the schema, the security rules or the tweak/operation list (npm run hub:docs first).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dest = path.resolve(process.argv[2] || path.join(root, '..', 'DarkHub Inc', 'darkhub-ecosystem', 'apps', 'hub-api'))
if (!fs.existsSync(path.join(dest, 'package.json'))) {
  console.error(`hub-api not found at ${dest}`)
  process.exit(2)
}
const core = path.join(dest, 'src', 'core')
const files = [
  ['electron/services/hub/hubModel.js', 'hubModel.js'],
  ['electron/services/hub/builtins.js', 'builtins.js'],
  ['electron/services/hub/extensionModel.js', 'extensionModel.js'],
  ['electron/services/hub/schema/v1.json', 'schema/v1.json'],
  ['docs/hub/builtins.json', 'builtins.json']
]
for (const [from, to] of files) {
  const out = path.join(core, to)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.copyFileSync(path.join(root, from), out)
}
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
fs.writeFileSync(path.join(core, 'SOURCE.md'), `Copied from DarkHub Suite ${version} by \`npm run hub:core\`. Do not edit here.\n`)
console.log(`copied ${files.length} files to ${path.relative(root, core)}`)
