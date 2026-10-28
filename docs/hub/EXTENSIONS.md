# DarkHub extensions: new features for the app

An extension adds **new functionality to DarkHub itself**: a new screen in the sidebar, a card on the Dashboard, a tool
that reads sensors, talks to a web API, keeps its own data or offers DarkHub packages to install. It is written in plain
**HTML, CSS and JavaScript**, needs no build step, and is shared on the Hub like any package.

Presets and modules change Windows. Extensions change **DarkHub**.

---

## 1. Create one in a minute

```bash
npm run ext:new -- yourgithub.my-tool
```

This creates a folder with a working extension (a screen that shows the PC's hardware and saves a counter). Then in
DarkHub: **Presets e módulos** → **Arquivo e meu PC** → **Carregar extensão de uma pasta**, and pick the folder. The
extension appears in the sidebar under **Extensões** and **reloads by itself every time you save a file**.

**With Claude Code**: ask "Create a DarkHub extension that … following docs/hub/EXTENSIONS.md". If DarkHub's MCP server is
on ([MCP.md](MCP.md)), Claude can load the folder with `darkhub_extension_dev_load` (you approve once), read its console
with `darkhub_extension_logs` and fix errors on its own.

---

## 2. The folder

```
yourgithub.my-tool/
  darkhub-extension.json   the manifest
  index.html               a screen
  app.js, style.css        anything the pages reference
  widget.html              a Dashboard card (optional)
```

`darkhub-extension.json`:

```json
{
  "$schema": "https://darkhub.ink/schema/v1.json",
  "schemaVersion": 1,
  "type": "extension",
  "id": "yourgithub.my-tool",
  "version": "1.0.0",
  "name": { "pt-BR": "Minha ferramenta", "en-US": "My tool" },
  "description": { "pt-BR": "O que ela faz.", "en-US": "What it does." },
  "author": { "github": "yourgithub" },
  "license": "MIT",
  "minApp": "0.7.3",
  "permissions": ["storage", "sensors"],
  "contributes": {
    "pages": [{ "id": "main", "title": "Minha ferramenta", "icon": "gauge", "entry": "index.html" }],
    "widgets": [{ "id": "now", "title": "Agora", "entry": "widget.html" }]
  }
}
```

| Field | Meaning |
|---|---|
| `permissions` | What it may ask DarkHub for. The user sees this list before installing. Ask only for what you use. |
| `network` | With the `network` permission: the only `https://` origins it may call. |
| `contributes.pages` | Screens in the sidebar (up to 8). `icon`: puzzle, chart, gauge, cpu, gamepad, wrench, shield, bolt, globe, music, image, code, list, star, clock, folder. |
| `contributes.widgets` | Cards on the Dashboard (up to 4). They grow with their content. |

Files: `.html .js .css .json .svg .md .txt`, up to 2 MB in total. Pages reference their scripts and styles with normal
`<script src="app.js">` and `<link rel="stylesheet" href="style.css">`; DarkHub inlines them. Images go as SVG or `data:`
URLs. Nothing is loaded from the internet.

`npm run ext:pack -- <folder>` turns the folder into one `<id>.darkhub.json`, validated exactly like the Hub does.

---

## 3. The `darkhub` API

Every page gets `window.darkhub`. Calls return promises; a call without its permission fails with a clear error.

| Call | Permission | Returns |
|---|---|---|
| `darkhub.t(pt, en)` | none | the text for the app's language |
| `darkhub.lang` | none | `"pt-BR"` or `"en-US"` |
| `darkhub.app.info()` | none | `{ id, version, appVersion, permissions }` |
| `darkhub.app.toast(text)` | none | shows a short message in DarkHub |
| `darkhub.app.navigate(page)` | none | opens a DarkHub screen (`"optimizer"`, `"dashboard"`, or `"ext__<id with _ for .>__<page>"`) |
| `darkhub.app.openExternal(url)` | none | opens an `https://` link in the browser |
| `darkhub.storage.get(key)` / `set(key, value)` / `delete(key)` / `keys()` | `storage` | JSON values, 1 MB per extension, removed on uninstall |
| `darkhub.hardware.info()` | `hardware` | `{ osBuild, cpuVendor, gpuVendors, gpuNames, gpuDedicated, chassis, ramGb, netWired, darkos }` |
| `darkhub.sensors.read()` | `sensors` | `{ cpu: { load, temp }, gpu: { name, load, temp }, ram: { load, totalBytes, usedBytes }, net: { rxBps, txBps }, disk: { readBps, writeBps, activity } }` (numbers or `null`) |
| `darkhub.sensors.subscribe(fn, everyMs)` | `sensors` | calls `fn(reading)` repeatedly; returns a function that stops it |
| `darkhub.tweaks.list()` / `status()` | `tweaks.read` | the built-in tweaks and which are on |
| `darkhub.net.fetch(url, { method, headers, body })` | `network` | `{ ok, status, headers, body, json(), text() }`; only the origins in `network`, no cookies, 2 MB, 20 s |
| `darkhub.notify(title, body)` | `notifications` | a Windows notification |
| `darkhub.clipboard.writeText(text)` | `clipboard` | copies text |
| `darkhub.screen.pickColor()` | `screen` | DarkHub hides, the user clicks a point on any monitor (magnifier, arrows, Esc cancels); returns `{ hex, rgb: [r, g, b], x, y }` or `null` if canceled. Only that color reaches the extension, never the screen image |
| `darkhub.packages.preview(pkg)` | `packages` | the same preview the Presets screen shows, for this PC |
| `darkhub.packages.install(pkg)` / `installFromHub(id)` | `packages` | asks the **user** to approve in DarkHub, then installs; `{ ok, error }` |

`console.log/warn/error` and uncaught errors go to the extension's console: the **Console** button on its screen, or
`darkhub_extension_logs` over MCP.

### Look and feel

Pages start with DarkHub's look: dark background, its fonts and these classes: `dh-card`, `dh-btn`, `dh-btn-primary`,
`dh-btn-accent`, `dh-input`, `dh-badge`, `dh-stat`, `dh-row`, `dh-grid`, `dh-muted`, `dh-help`; and the CSS variables
`--dh-text`, `--dh-muted`, `--dh-accent`, `--dh-ok`, `--dh-warn`, `--dh-danger`, `--dh-radius`. Use them or bring your own.

---

## 4. What an extension can never do

Extensions run in an isolated frame with a strict security policy:

- no Node.js, no files, no programs, no PowerShell;
- no direct network: `fetch`, `XMLHttpRequest`, `WebSocket` and remote scripts are blocked; only `darkhub.net.fetch` to
  the declared origins works;
- no access to DarkHub's own screens, data or other extensions;
- it cannot navigate away or open windows;
- the only way to change Windows is `darkhub.packages.install`, which goes through the same package engine (preview,
  snapshot, undo) and **the user approves every install**.

Sensors never include the list of running programs.

---

## 5. Publish

1. `npm run ext:pack -- <folder>`
2. On [hub.darkhub.ink](https://hub.darkhub.ink) → **Publicar**: drop the `.darkhub.json`, write the README and the
   release notes.
3. **Every submission is reviewed by a person** before it appears in the catalog. The reviewer sees the permissions,
   an automatic scan (`eval`, obfuscated code, remote scripts, direct network…) and the full diff against your previous
   version. If something is refused, the reason shows in **Meus pacotes**; fix it and send it again.

Approved versions are signed by the Hub. DarkHub only installs a Hub extension whose hash and signature check out, and
an unapproved version is never signed. The approved source code is public on the package's **Código** tab.

Tips that make review fast: readable code (not minified), a README that says what each permission is for, and the
smallest list of permissions and network origins that works.

---

## 6. Example

- [extensions/pokeralho.painel-termico](extensions/pokeralho.painel-termico): a live CPU/GPU temperature chart with
  session peaks, an alert over a limit you choose, and a Dashboard card. Permissions: `sensors`, `storage`,
  `notifications`.
- [extensions/pokeralho.conta-gotas](extensions/pokeralho.conta-gotas): a screen color picker with HEX/RGB/HSL/OKLCH,
  history and a Dashboard card. Permissions: `screen`, `clipboard`, `storage`.
