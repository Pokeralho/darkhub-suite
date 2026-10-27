# Contributing to DarkHub Suite

Thank you for your interest in contributing to DarkHub Suite. You do not need to know C#, Rust or Windows internals to
help: most of the app is TypeScript/React, and many useful contributions are translations, texts, tests and packages.

New here? Pick something from [Good first contributions](#good-first-contributions), or ask in
[GitHub Discussions](https://github.com/Pokeralho/darkhub-suite/discussions).

---

## Areas of Contribution

### 0. Packages: modules and presets (no coding needed)
The easiest way to contribute. A package is a JSON file that describes Windows changes as data; DarkHub shows every
change before applying it and restores everything on removal. Write one by hand or with Claude: follow
[docs/hub/README.md](../docs/hub/README.md), check it with `npm run hub:validate -- your.darkhub.json`, and open a pull
request adding it to `docs/hub/examples/`. Ready prompts: [docs/hub/PROMPTS.md](../docs/hub/PROMPTS.md).

### 1. Translations (i18n)
Help translate the interface into other languages. Refer to [TRANSLATIONS.md](../docs/TRANSLATIONS.md) for instructions on creating and testing translation files.

### 2. Security Rules
Submit verified phishing domain signatures or URL heuristic rules. Refer to [docs/SECURITY_RULES.md](../docs/SECURITY_RULES.md) for schema requirements.

### 3. Bug Fixes and Code Improvements
Help resolve issues, optimize code paths, or enhance Windows integration modules. Start with
[docs/PROJECT_MAP.md](../docs/PROJECT_MAP.md): it shows, for every screen, which file is the screen, which IPC handler it
calls and which service does the work.

---

## Contribute without the native toolchain

The native helpers are **prebuilt and committed** to the repository:

- C# (.NET Framework 4.x): `electron/services/DarkHub.*.exe` and `electron/services/hwsensors/DarkHub.HwSensors.exe`
- Rust (`native_pacer/`): `electron/services/DarkHub.PacerHook.dll` and `DarkHub.PacerHook64.dll`

So you do **not** need Visual Studio, the .NET SDK or Rust unless you change the `.cs` files or `native_pacer/`. For
screens, translations, texts, tests, docs and packages, Node.js 22 LTS and npm are enough:

```bash
git clone https://github.com/YOUR_USERNAME/darkhub-suite.git
cd darkhub-suite
npm install

npm run dev              # Vite + Electron with hot reload
npx vitest run           # unit tests (they do not change your system)
npx tsc --noEmit -p .    # type check, must report 0 errors
npm run shot -- home     # with npm run dev running: 1366x820 screenshot in scratch/shots/ (for UI pull requests)
```

Only rebuild the native parts when you edit them: `npm run build:native` (C#, needs .NET Framework 4.x, which ships with
Windows) and `npm run build:pacer` (needs Rust/cargo).

### When you need administrator rights

You do not need them to work on the interface, translations, tests or docs. You need them only to **try features that
change the system** for real: optimizer tweaks, services, drivers, Defender, firewall, real-time protection, advanced
sensors. Use `npm run dev:admin` for that.

Please test those features in a **virtual machine** (Hyper-V, VirtualBox, VMware) or in **Windows Sandbox** (Windows
10/11 Pro: "Turn Windows features on or off" → Windows Sandbox), not on your main PC. Everything DarkHub changes is
reversible, but a VM lets you check that the revert really restores the original state.

---

## Development Workflow

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/darkhub-suite.git
   cd darkhub-suite
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development environment:
   ```bash
   npm run dev
   ```
5. Before opening the pull request, check that everything passes:
   ```bash
   npx tsc --noEmit -p .
   npx vitest run
   npx vite build
   ```
6. Create a branch and submit your Pull Request with a clear summary of the changes. The pull request template has a
   short checklist.

Project rules worth knowing before you write code:

- New text on screen goes through `t('key', 'fallback')` and gets **both** `pt-BR` and `en-US` entries in
  `src/i18n/` (see [TRANSLATIONS.md](../docs/TRANSLATIONS.md)).
- A new feature follows the path: service (`electron/services/`) → IPC handler → `electron/preload.js` +
  `src/global.d.ts` → screen (`src/pages/`) → i18n → test (`tests/`).
- PowerShell built inside JavaScript must be escaped with the helpers in
  `electron/services/optimizer/OptimizerUtils.js`.
- `npm run map` regenerates the code map in `docs/map/`. It depends on a tool that only exists on the maintainer's
  machine; if you cannot run it, say so in the pull request and the maintainer will regenerate the map.

---

## Good first contributions

Each of these is written up as a ready issue, with the files to look at, how to test and when it is done. They are in
[docs/community/issues/](../docs/community/issues/) and on the
[issue tracker](https://github.com/Pokeralho/darkhub-suite/issues?q=is%3Aopen+label%3A%22good+first+issue%22) with the
`good first issue` label.

| Area | Issue |
|---|---|
| Translation | [Spanish (es-ES): first part of the interface](../docs/community/issues/01-translation-es-es-core.md) |
| Translation | [Review the English (en-US) strings](../docs/community/issues/02-translation-review-en-us.md) |
| Docs | [Update TRANSLATIONS.md to match the real i18n files](../docs/community/issues/03-docs-translations-guide.md) |
| Packages | [Ethernet gaming module](../docs/community/issues/04-package-ethernet-gaming.md) |
| Packages | [Privacy preset for laptops](../docs/community/issues/05-package-privacy-laptop.md) |
| Packages | [Streaming preset (OBS)](../docs/community/issues/06-package-streaming-obs.md) |
| Tests | [Tests for the sensor model helpers](../docs/community/issues/07-tests-sensor-model.md) |
| Tests | [Tests for log secret redaction](../docs/community/issues/08-tests-redact-secrets.md) |
| Tests | [Tests for the save-game manifest indexer](../docs/community/issues/09-tests-manifest-indexer.md) |
| Tests | [Tests for the CPU load tracker](../docs/community/issues/10-tests-cpu-load-tracker.md) |
| Tests | [Tests for visibleInterval](../docs/community/issues/11-tests-visible-interval.md) |
| Tests | [pt-BR / en-US key parity test](../docs/community/issues/12-tests-i18n-parity.md) |
| Tests | [Move the Text Summarizer algorithm to a tested module](../docs/community/issues/13-tests-summarizer-module.md) |
| Accessibility | [Labels for the Text Summarizer fields](../docs/community/issues/14-a11y-summarizer-labels.md) |
| UI | [DLL Injector: anti-cheat warning and neutral placeholder](../docs/community/issues/15-ui-dll-injector-warning.md) |
| Performance | [Pause background polling when the window is hidden](../docs/community/issues/16-perf-visible-interval-polling.md) |
| Optimizer | [NTFS last access as a declarative registry tweak](../docs/community/issues/17-optimizer-declarative-last-access.md) |
| Docs | [User guide for the Disk map](../docs/community/issues/18-docs-disk-map-guide.md) |

If you want to work on one, comment on the issue so nobody else picks it at the same time.
