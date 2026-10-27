# Instructions for AI agents (Claude Code and others)

DarkHub Suite is an open-source (MIT) Windows optimizer built with Electron 41, React 19, Vite, TypeScript and
Tailwind 4. Most people who open this repository with an AI agent want one of two things. Find yours below and follow
it exactly.

---

## A. Create or change a DarkHub package (module or preset)

A package is a JSON file (`<id>.darkhub.json`) that describes Windows changes as data. You do **not** need to touch the
app's code for this.

1. Read [docs/hub/README.md](hub/README.md) completely. It is the specification.
2. Look up built-in tweaks and operations in [docs/hub/BUILTIN.md](hub/BUILTIN.md) and prefer
   `{ "use": "darkhub:tweak:<id>" }` or `{ "op": "darkhub:op:<id>" }` over raw registry items whenever one does the job.
   Operations marked official only or not allowed are refused in community packages.
3. Start from a file in [docs/hub/examples/](hub/examples/). Keep `"$schema": "https://darkhub.ink/schema/v1.json"`
   and `"schemaVersion": 1`.
4. Save the package as `docs/hub/examples/<id>.darkhub.json` unless the user asked for another place.
5. Validate and iterate until it passes:
   ```
   npm run hub:validate -- docs/hub/examples/<id>.darkhub.json
   ```
   The output lists each error with its location (e.g. `items.3: falta o campo "value"`), or a plain-language summary
   of every change when the file is valid. Show the user that summary.
6. Tell the user how to try it: DarkHub Suite → **Presets e módulos** → **Arquivo e meu PC** → **Abrir arquivo**.
   If the DarkHub MCP server is connected (tools named `darkhub_*`), use `darkhub_validate` and `darkhub_inspect` on the
   user's real PC and offer `darkhub_install`: DarkHub asks the user to approve. See [docs/hub/MCP.md](hub/MCP.md).
   To publish, point the user to https://hub.darkhub.ink (Publicar). DarkHub shows the current
   and the new value of every item before installing, and removing the package restores everything.

Rules you must follow for packages:

- Never try to work around the security rules in docs/hub/README.md §5 (Defender, UAC, firewall, Windows Update,
  startup programs, services written through the registry, and so on). If the user asks for something on that list,
  explain that community packages cannot do it and why.
- No scripts, programs or downloads: packages have no item type for them, and none should be invented.
- Every item gets a `note` unless it is self-explanatory. Never promise FPS numbers; use `expects` only for metrics the
  benchmark measures.
- `id` is `<github-user-lowercase>.<name>`; ask the user for their GitHub user if you do not know it.
- In JSON, every backslash in a registry path or task path is written twice.
- Give `name` and `description` in both `pt-BR` and `en-US` when you can.

## C. Create a DarkHub extension (a new screen or tool inside the app)

1. Read [docs/hub/EXTENSIONS.md](hub/EXTENSIONS.md). Extensions are plain HTML/CSS/JS in a sandbox; all access goes
   through `window.darkhub` and the permissions in `darkhub-extension.json`.
2. Start from `npm run ext:new -- <github-login>.<name> [folder]` or from docs/hub/extensions/pokeralho.painel-termico.
3. If DarkHub's MCP server is connected, load the folder with `darkhub_extension_dev_load`, then read
   `darkhub_extension_logs` after each change and fix what it reports. Otherwise ask the user to load it in Presets e
   módulos > Arquivo e meu PC > Carregar extensão de uma pasta.
4. `npm run ext:pack -- <folder>` must print ✓ before you say it is done. Ask for the fewest permissions that work; never
   use eval, new Function, minified code or direct fetch (they are flagged in review and blocked at runtime).

## B. Change the application itself

1. Read [CLAUDE.md](../.claude/CLAUDE.md) (project rules, in Portuguese) and [CONTRIBUTING.md](../.github/CONTRIBUTING.md).
2. Locate code with the map instead of scanning the tree: `npm run map:find -- <term>` and
   [docs/PROJECT_MAP.md](PROJECT_MAP.md).
3. Every new feature goes: service → IPC handler → `electron/preload.js` + `src/global.d.ts` → screen → i18n (pt-BR
   and en-US) → test.
4. Before finishing: `npx tsc --noEmit -p .`, `npx vitest run`, and `npm run map`. When you change the built-in tweaks
   in `electron/services/optimizer/DeepTweaksEngine.js`, or the Optimizer's operations, run `npm run hub:docs` (BUILTIN.md and builtins.json) and `npm run hub:core`.
5. Embedded PowerShell must be escaped with the helpers in `electron/services/optimizer/OptimizerUtils.js`; elevated
   scripts are ASCII only.

## Useful commands

| Command | What it does |
|---|---|
| `npm run hub:validate -- <files>` | Validates DarkHub packages exactly like the app does and explains them. |
| `npm run hub:docs` | Regenerates docs/hub/BUILTIN.md and docs/hub/builtins.json from the code. |
| `npm run ext:new -- <id>` / `npm run ext:pack -- <folder>` | Create an extension from the template / pack and validate it. |
| `npm run hub:core` | Copies the package rules to the Hub server (darkhub-ecosystem/apps/hub-api). |
| `npm run map:find -- <term>` | Finds screens, IPC channels, optimizer items and functions. |
| `npx vitest run` | Runs the test suite. |
| `npx tsc --noEmit -p .` | Type-checks the renderer. |
