# DarkHub packages: modules and presets

A DarkHub package is a JSON file that describes Windows changes as **data**. Anyone can write one, by hand or with an AI
assistant, and anyone can install it in DarkHub Suite.

- **You see everything before it happens.** DarkHub lists every registry value, service and scheduled task the package
  touches, with the value your PC has now next to the value it will have.
- **Everything comes back.** Before changing anything, DarkHub saves the current value of each item. Removing the package
  restores exactly those values, item by item.
- **No scripts.** Packages only use change types DarkHub knows how to capture, apply, verify and restore. Security
  settings (Defender, UAC, firewall, VBS, Windows Update) and anything that could run code at startup are refused.
- **Built for AI.** The schema describes every field, the validator explains every error, and this guide has a
  complete example for every case. Claude (or any capable model) can write a correct package on the first try.

**Want to add a new screen or tool to DarkHub itself?** That is an *extension*: see [EXTENSIONS.md](EXTENSIONS.md).

Pacotes do DarkHub em português: o formato é o mesmo; os textos do pacote podem ter `pt-BR` e `en-US`. Os prompts
prontos em [PROMPTS.md](PROMPTS.md) estão nos dois idiomas.

---

## Contents

1. [Create a package with Claude](#1-create-a-package-with-claude)
2. [The file](#2-the-file)
3. [Item types](#3-item-types)
4. [Hardware conditions](#4-hardware-conditions)
5. [What packages cannot do](#5-what-packages-cannot-do)
6. [Risk level](#6-risk-level)
7. [Validate, test and install](#7-validate-test-and-install)
8. [How install and removal work](#8-how-install-and-removal-work)
9. [Writing good packages](#9-writing-good-packages)
10. [Publish on the Hub](#10-publish-on-the-hub)
11. [Claude inside DarkHub (MCP)](#11-claude-inside-darkhub-mcp)
12. [Reference files](#12-reference-files)

---

## 1. Create a package with Claude

**With DarkHub's MCP server** (best for most people): turn it on in **Presets e módulos** → **IA (MCP)** and connect
Claude Code or Claude Desktop ([section 11](#11-claude-inside-darkhub-mcp)). Claude then reads your PC's hardware, the
list of built-in tweaks and operations, writes the package, validates it, shows you the preview and installs it after you
approve in DarkHub.

**In Claude Code** (best: it can run the validator), open a clone of this repository and ask, for example:

> Create a DarkHub preset for Fortnite on an NVIDIA laptop, without touching security. Follow docs/hub/README.md,
> save it in docs/hub/examples/ and validate it with npm run hub:validate.

Claude reads [AGENTS.md](../AGENTS.md) and this guide, writes the file, runs the validator and fixes what it reports.

**In Claude.ai or another chat**, paste this guide (or link to it) and ask for the package. Then open DarkHub Suite →
**Presets e módulos** → **Colar JSON**: DarkHub validates it and shows every change before anything is applied.

**From your own PC**: in DarkHub, **Presets e módulos** → **Criar preset do meu PC** turns the DarkHub tweaks you
already applied into a preset file you can share or publish.

More ready-to-use prompts: [PROMPTS.md](PROMPTS.md).

---

## 2. The file

File name: `<id>.darkhub.json` (e.g. `ana.ethernet-gaming.darkhub.json`), UTF-8, up to 512 KB.

```json
{
  "$schema": "https://darkhub.ink/schema/v1.json",
  "schemaVersion": 1,
  "type": "preset",
  "id": "ana.valorant-low-latency",
  "version": "1.0.0",
  "name": { "pt-BR": "Valorant: baixa latência", "en-US": "Valorant: low latency" },
  "description": { "pt-BR": "O que muda e para quem.", "en-US": "What it changes and for whom." },
  "author": { "github": "ana" },
  "license": "MIT",
  "tags": ["valorant", "latency"],
  "minApp": "0.7.3",
  "when": { "os.build": { "gte": 22631 } },
  "items": [
    { "use": "darkhub:tweak:disableGameDvr" }
  ],
  "expects": [{ "metric": "timer.latency", "direction": "down" }],
  "evidence": ["https://learn.microsoft.com/..."]
}
```

| Field | Required | Meaning |
|---|---|---|
| `schemaVersion` | yes | Always `1`. |
| `type` | yes | `module`: a few related changes with one goal. `preset`: a recipe for a scenario (game, laptop, streaming...). Both use the same items. |
| `id` | yes | `<author>.<name>`: lowercase letters, digits, dashes. The author part is your GitHub user in lowercase. Unique forever. |
| `version` | yes | `MAJOR.MINOR.PATCH`. Raise MAJOR when the package changes something new. |
| `name` | yes | Up to 60 characters. Text, or `{ "pt-BR": ..., "en-US": ... }`. |
| `description` | no (recommended) | Up to 600 characters. Say what changes and for whom. No promises like "+50 FPS". |
| `author.github` | yes | Your GitHub user name. |
| `license` | no | SPDX id, default `MIT`. |
| `tags` | no | Up to 12 lowercase tags for search. |
| `minApp` | no | Oldest DarkHub Suite version you tested with. |
| `when` | no | [Condition](#4-hardware-conditions) for the whole package. When it does not match, DarkHub shows "not for this PC". |
| `items` | yes | 1 to 200 [items](#3-item-types), applied in order. |
| `expects` | no | Effects the before/after benchmark can measure: `cpu.single`, `cpu.multi`, `memory.bandwidth`, `memory.latency`, `timer.latency`, `disk.read`, `disk.write`, `boot.time`, `background.processes`, each with `direction` `up` or `down`. |
| `evidence` | no | Up to 10 `https://` links backing the changes (Microsoft docs, measurements, discussions). |

The schema file is [electron/services/hub/schema/v1.json](../../electron/services/hub/schema/v1.json). Point `$schema`
to `https://darkhub.ink/schema/v1.json` and editors like VS Code validate while you type.

---

## 3. Item types

Every item is **exactly one** of `use`, `op`, `registry`, `service` or `task`. Any item can also have:

- `"if": { ... }` — apply this item only when the [condition](#4-hardware-conditions) matches;
- `"note": "..."` — why the item is there (up to 200 characters), shown next to it in DarkHub.

### 3.1 `use`: a built-in DarkHub tweak

```json
{ "use": "darkhub:tweak:disableMouseAcceleration" }
```

Uses one of DarkHub's own tweaks with its definition, snapshot and revert. The full list, with exactly what each tweak
writes, is generated from the code in [BUILTIN.md](BUILTIN.md). Prefer `use` when a built-in tweak does what you want:
it is maintained by DarkHub and may get fixes over time.

On removal, DarkHub only undoes the built-in tweaks the package turned on. If the user already had a tweak on, removing
the package leaves it on.

### 3.2 `op`: a built-in DarkHub operation

```json
{ "op": "darkhub:op:powerPlanUltimate" }
```

Runs one of the Optimizer's operations (power plans, timer, network stack, CPU parking, visual effects, cleanup...).
The list is in the Operations section of [BUILTIN.md](BUILTIN.md), with what each one is allowed to do:

- **reversible** operations are undone on removal with their own revert. If the operation was already active before the
  package, DarkHub leaves it alone and does not undo it later.
- **one-time actions** (`cleanTemp`, `flushDns`, `optimizeRAM`, `optimizeAudioLatency`) just run; nothing to undo.
- operations that only wrap built-in tweaks (for example `explorerTweaks`, `taskbarTweaks`) are installed as those
  tweaks, with the same "already on" handling as `use`.
- **official only**: operations that touch security (core isolation, BitLocker) or remove software without a way back
  (OneDrive cleanup) are refused in community packages.
- **not allowed**: operations that change the system with no way to undo it (switching to the Balanced plan) are refused
  in every package.

### 3.3 `registry`: one value or key

Write a value:

```json
{ "registry": { "path": "HKCU\\System\\GameConfigStore", "name": "GameDVR_FSEBehaviorMode", "type": "dword", "value": 2 } }
```

Delete a value:

```json
{ "registry": { "path": "HKCU\\Software\\Example", "name": "SomeValue", "delete": true } }
```

Delete a whole key (avoid: DarkHub can only restore the values it captured):

```json
{ "registry": { "path": "HKCU\\Software\\Example\\Leftover", "deleteKey": true } }
```

| Field | Meaning |
|---|---|
| `path` | Starts with `HKCU\` or `HKLM\`. In JSON every backslash is written twice: `"HKCU\\Software\\..."`. No trailing backslash. |
| `name` | Value name. `""` is the key's (Default) value. |
| `type` | `dword` (number 0–4294967295), `qword` (number), `string`, `expandString` (text with `%VARIABLES%`), `multiString` (list of texts), `binary` (hex text like `"00ff10"`). |
| `value` | The value, in the form the type asks for. |
| `delete` | `true` to delete the value instead of writing it (no `type`/`value`). |
| `deleteKey` | `true` to delete the key (no `name`/`type`/`value`). |

`HKCU` changes apply to the signed-in user. `HKLM` changes apply to the whole PC and make the package at least medium
risk.

### 3.4 `service`: how a Windows service starts

```json
{ "service": { "name": "SysMain", "startType": "disabled", "stop": true } }
```

| Field | Meaning |
|---|---|
| `name` | The service **name** (not the display name). Find it in `services.msc` → properties, or `Get-Service`. |
| `startType` | `automatic`, `automaticDelayed`, `manual` or `disabled`. |
| `stop` | `true` to also stop it now. Otherwise the new start type takes effect after a restart. |

Removing the package puts the previous start type back. It does not start a service that the package stopped; that
happens on the next restart.

### 3.5 `task`: a scheduled task on or off

```json
{ "task": { "path": "\\Microsoft\\Windows\\Customer Experience Improvement Program\\", "name": "Consolidator", "state": "disabled" } }
```

| Field | Meaning |
|---|---|
| `path` | The task folder, starting and ending with `\` (written `\\` in JSON). |
| `name` | The task name inside the folder. |
| `state` | `enabled` or `disabled`. |

Tasks that do not exist on a given Windows build are skipped and reported, not treated as errors.

---

## 4. Hardware conditions

`when` (whole package) and `if` (one item) take the same object. **All keys must match.** A value can be a single
value, a list (any of them) or a numeric range.

| Key | Values | Example |
|---|---|---|
| `os.build` | Windows build number | `{ "gte": 26100 }` (24H2 or newer) |
| `cpu.vendor` | `intel`, `amd` | `"amd"` |
| `gpu.vendor` | `nvidia`, `amd`, `intel` (any GPU in the PC) | `["nvidia", "amd"]` |
| `gpu.dedicated` | `true` / `false` | `true` |
| `chassis` | `laptop`, `desktop` | `"desktop"` |
| `ram.gb` | installed RAM in GB | `{ "gte": 16 }` |
| `net.wired` | an Ethernet adapter is connected | `true` |
| `darkos` | running on DarkOS | `false` |

Ranges use `gte`, `lte`, `gt`, `lt`, alone or together: `{ "gte": 16, "lt": 64 }`.

Common builds: 19045 (Windows 10 22H2), 22631 (11 23H2), 26100 (11 24H2), 26200 (11 25H2).

```json
{ "use": "darkhub:tweak:disableHibernation", "if": { "chassis": "desktop" } }
```

In DarkHub, **Presets e módulos** shows what this PC reports for each key.

---

## 5. What packages cannot do

These rules are checked by the app and by `npm run hub:validate`. A package that breaks any of them is refused as a
whole.

- **No security changes.** Registry under Microsoft Defender and its policies, Device Guard (VBS/HVCI), LSA, security
  providers, UAC (`...\CurrentVersion\Policies\System`), Windows Firewall, Windows Update, certificates and cryptography;
  the values `EnableSmartScreen`, `ShellSmartScreenLevel`, `SmartScreenEnabled`, `EnableLUA`,
  `ConsentPromptBehaviorAdmin`; built-in tweaks marked **official only** in [BUILTIN.md](BUILTIN.md).
- **Nothing that runs code.** `Run`/`RunOnce` keys, Winlogon, Image File Execution Options, AppInit/AppCert DLLs,
  KnownDLLs, environment variables (PATH), `Software\Classes` (file handlers and shell extensions), and the values
  `BootExecute`, `SetupExecute`, `Execute`, `PendingFileRenameOperations`, `SafeDllSearchMode`, `CWDIllegalInDllSearch`.
- **Services only through `service` items**, never by writing under `HKLM\SYSTEM\CurrentControlSet\Services`.
- **Essential and security services stay as they are**: Defender, firewall, Windows Update and its helpers, cryptography,
  event log, RPC/DCOM, task scheduler, user profiles, power, Plug and Play, DHCP, DNS client, Wi-Fi, audio and similar.
- **Defender, Windows Update, Update Orchestrator, WaaSMedic and Exploit Guard tasks stay as they are.**
- **No scripts or programs.** There is no item type for them.

The complete lists are in [electron/services/hub/hubModel.js](../../electron/services/hub/hubModel.js).

If you believe something on these lists should be allowed, open an issue explaining why. Official DarkHub packages may
include security changes, always with an explicit warning and confirmation.

---

## 6. Risk level

DarkHub computes the risk; authors do not declare it.

| Level | When |
|---|---|
| low | Only per-user registry values (`HKCU`) and low-risk built-in tweaks and operations. |
| medium | Any `HKLM` value, service, scheduled task, or medium-risk built-in tweak or operation. |
| high | Deletes a whole registry key, disables 5 or more services, or uses a high-risk built-in tweak or operation. |

---

## 7. Validate, test and install

**Validate** (no admin, changes nothing):

```
npm run hub:validate -- path/to/your.darkhub.json
```

It prints every error with its location, or a plain-language list of what the package changes. Fix and run again until
it says `All 1 file(s) valid.`

**Try it in DarkHub**: **Presets e módulos** → **Abrir arquivo** (or **Colar JSON**). DarkHub validates the package
again, reads this PC's current values and shows, for each item, *now* and *after*, plus what the conditions skip.
Nothing changes until you click **Instalar**.

**Test safely**: install it in a virtual machine or Windows Sandbox first, check that the changes are right, then use
**Remover e restaurar** and check that everything went back.

---

## 8. How install and removal work

1. DarkHub validates the package and resolves the conditions for this PC.
2. It refuses to install when another installed package writes any of the same registry values (removing one would
   restore the other's values). Remove the other package first.
3. Built-in tweaks the package uses are turned on, except the ones already on.
4. Registry and service items are applied as one change set: current values are saved, the new ones are written, and
   every value is read back. If Windows does not keep a value (a policy, Tamper Protection), the install fails and
   nothing is left half-done.
5. Scheduled tasks: the current state of each is saved, then the new state is set and read back.
6. Operations run in order: reversible ones that are already active are skipped; if any operation fails, everything the
   package did so far is undone.
7. The package, what it changed and the saved values are kept in DarkHub's data folder (`hub\installed.json`).

**Remover e restaurar** runs these steps backwards with the saved values.

---

## 9. Writing good packages

- **One goal per module.** "Ethernet tuned for games" is a module; "everything I like" is a preset made of modules'
  worth of items.
- **Explain every non-obvious item** with `note`, and link sources in `evidence`.
- **Use conditions** instead of separate packages for laptop and desktop.
- **No placebo.** If a change has no measurable effect, say it is a preference, not a performance gain. Use `expects`
  only for effects the benchmark can measure, and measure before publishing.
- **Prefer `use`** when a built-in tweak exists; write `registry` items only for what DarkHub does not cover yet (and
  consider proposing it as a built-in tweak).
- **Keep HKLM to what needs it.** Per-user settings belong in `HKCU`.
- **Version honestly.** Never change what an existing version does; publish a new version.

---

## 10. Publish on the Hub

The Hub is [hub.darkhub.ink](https://hub.darkhub.ink): a catalog DarkHub Suite searches from **Presets e módulos** →
**Catálogo**, with "only the ones for this PC" filtering by your hardware.

1. Validate locally (`npm run hub:validate`).
2. Sign in on the site with GitHub and open **Publicar**: paste or upload the file. The site runs the same validator and
   shows what every item does before you publish.
3. The `id` must start with your GitHub login and `author.github` must be you. New versions need a higher `version`.
4. **A person reviews every submission** before it is listed (and before it is signed): what it changes, the automatic
   checks and the diff against your previous version. A refusal comes with the reason, in **Meus pacotes**.

Every published version is signed by the Hub (Ed25519 over `id@version:sha256:tier`). DarkHub checks the hash and the
signature before showing or installing a package, so nobody in between can change it. Tiers: **community** (anyone),
**verified** (reviewed by the DarkHub team) and **official** (made by the DarkHub team; may use the official-only tweaks
and operations).

Scripts and AI agents can publish with a personal token from the site's **Minha conta** page:

```
curl -X POST https://hub.darkhub.ink/api/packages -H "Authorization: Bearer dhk_..."   -H "content-type: application/json" -d "{\"text\": <the file as a JSON string>}"
```

`POST /api/validate` with `{ "text": ... }` checks a package without publishing (no login needed).

---

## 11. Claude inside DarkHub (MCP)

DarkHub can act as an MCP server so Claude works with your real PC. It is off by default. Turn it on in
**Presets e módulos** → **IA (MCP)**; the tab shows the exact commands with your token. Details in [MCP.md](MCP.md).

---

## 12. Reference files

| File | What it is |
|---|---|
| [schema/v1.json](../../electron/services/hub/schema/v1.json) | The JSON Schema (also served at `https://darkhub.ink/schema/v1.json`). |
| [BUILTIN.md](BUILTIN.md) | Every built-in tweak (`use`) and operation (`op`), generated from the code. |
| [builtins.json](builtins.json) | The same list as data, used by the Hub's validator. |
| [MCP.md](MCP.md) | Connecting Claude Code and Claude Desktop to DarkHub. |
| [EXTENSIONS.md](EXTENSIONS.md) | Extensions: new screens and tools for the app (HTML/CSS/JS, sandboxed, permissions). |
| [PROMPTS.md](PROMPTS.md) | Ready prompts for Claude and other assistants, in Portuguese and English. |
| [examples/](examples/) | Valid packages to copy from. |
| [AGENTS.md](../AGENTS.md) | Instructions AI agents follow in this repository. |
| [hubModel.js](../../electron/services/hub/hubModel.js) | Validation, security rules, conditions and risk (the source of truth). |
