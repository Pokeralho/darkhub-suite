// DarkHub extension tooling.
//   npm run ext:new -- <github-login>.<name> [folder]   creates a working extension from a template
//   npm run ext:pack -- <folder> [out.darkhub.json]     packs a folder into one package and validates it like the app
import fs from 'node:fs'
import path from 'node:path'
import { packExtensionFolder, MANIFEST } from '../electron/services/hub/extensionPack.js'
import { validatePackage } from '../electron/services/hub/hubModel.js'

const [cmd, a, b] = process.argv.slice(2)

if (cmd === 'new') {
  if (!/^[a-z0-9][a-z0-9-]{1,38}\.[a-z0-9][a-z0-9-]{1,62}$/.test(a || '')) { console.error('uso: npm run ext:new -- <login-do-github>.<nome>   (minúsculas, números e hífen)'); process.exit(2) }
  const dir = path.resolve(b || a)
  if (fs.existsSync(dir) && fs.readdirSync(dir).length) { console.error(`${dir} já existe e não está vazia`); process.exit(2) }
  fs.mkdirSync(dir, { recursive: true })
  const name = a.split('.')[1].replace(/-/g, ' ')
  fs.writeFileSync(path.join(dir, MANIFEST), `${JSON.stringify({
    $schema: 'https://darkhub.ink/schema/v1.json', schemaVersion: 1, type: 'extension', id: a, version: '0.1.0',
    name: { 'pt-BR': name, 'en-US': name }, description: { 'pt-BR': 'O que esta extensão faz.', 'en-US': 'What this extension does.' },
    author: { github: a.split('.')[0] }, license: 'MIT', minApp: '0.7.3',
    permissions: ['storage', 'hardware'],
    contributes: { pages: [{ id: 'main', title: { 'pt-BR': name, 'en-US': name }, icon: 'puzzle', entry: 'index.html' }] }
  }, null, 2)}\n`)
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html>
<html>
<head><link rel="stylesheet" href="style.css"></head>
<body>
  <main class="wrap">
    <h1 id="title"></h1>
    <div class="dh-card">
      <p class="dh-help" id="hw-label"></p>
      <p id="hw">...</p>
    </div>
    <div class="dh-row">
      <button class="dh-btn dh-btn-accent" id="count" type="button"></button>
      <span id="clicks" class="dh-muted"></span>
    </div>
  </main>
  <script src="app.js"></script>
</body>
</html>
`)
  fs.writeFileSync(path.join(dir, 'style.css'), '.wrap { display: grid; gap: 12px; padding: 16px; max-width: 720px; }\n')
  fs.writeFileSync(path.join(dir, 'app.js'), `// window.darkhub is the bridge to the app. Every call needs the matching permission in darkhub-extension.json.
const t = darkhub.t
const $ = (id) => document.getElementById(id)

$('title').textContent = t('Olá do DarkHub', 'Hello from DarkHub')
$('hw-label').textContent = t('Este PC', 'This PC')
$('count').textContent = t('Contar', 'Count')

darkhub.hardware.info().then((hw) => {
  $('hw').textContent = [hw.cpuVendor, ...(hw.gpuVendors || []), hw.ramGb && hw.ramGb + ' GB', hw.chassis].filter(Boolean).join(' · ')
})

let clicks = 0
darkhub.storage.get('clicks').then((n) => { clicks = n || 0; show() })
$('count').addEventListener('click', async () => { clicks++; await darkhub.storage.set('clicks', clicks); show() })
function show() { $('clicks').textContent = t(clicks + ' cliques salvos', clicks + ' clicks saved') }
`)
  console.log(`Extensão criada em ${dir}
Teste no DarkHub: Presets e módulos > Arquivo e meu PC > Carregar extensão de uma pasta (recarrega sozinha a cada mudança).
Empacote: npm run ext:pack -- "${dir}"`)
} else if (cmd === 'pack') {
  if (!a) { console.error('uso: npm run ext:pack -- <pasta> [saida.darkhub.json]'); process.exit(2) }
  let pkg
  try { pkg = packExtensionFolder(path.resolve(a)) } catch (e) { console.error(e.message); process.exit(1) }
  const text = `${JSON.stringify(pkg, null, 2)}\n`
  const v = validatePackage(text)
  if (!v.ok) { console.log('✗ inválida'); for (const e of v.errors) console.log(`  ${e.path}: ${e.message}`); process.exit(1) }
  const out = path.resolve(b || `${pkg.id}.darkhub.json`)
  fs.writeFileSync(out, text)
  console.log(`✓ ${pkg.id} v${pkg.version} · risco ${v.risk} · ${Object.keys(pkg.files).length} arquivo(s) · ${(Buffer.byteLength(text) / 1024).toFixed(1)} KB\n  ${out}`)
  for (const f of v.findings || []) console.log(`  atenção: ${f.file}:${f.line} ${f.message.pt}`)
} else {
  console.error('uso: npm run ext:new -- <id>  |  npm run ext:pack -- <pasta>')
  process.exit(2)
}
