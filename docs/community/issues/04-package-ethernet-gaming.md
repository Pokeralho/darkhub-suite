---
title: "Package: Ethernet gaming module"
labels: good first issue, packages, help wanted
---

## Context

DarkHub packages are JSON files that describe Windows changes as data. DarkHub shows every change before applying it
and restores the saved values on removal. No coding needed. The specification is
[docs/hub/README.md](../../hub/README.md).

There is no package yet for players on a wired connection.

## What to do

Write a `module` named `<your-github-user>.ethernet-gaming` that only applies on PCs with Ethernet connected
(`"when": { "net.wired": true }`), with a few network changes that have a documented effect. Candidates to evaluate
(read each description in [docs/hub/BUILTIN.md](../../hub/BUILTIN.md) first):

- `darkhub:tweak:disableTeredo`
- `darkhub:tweak:preferIPv4`
- `darkhub:tweak:standbyNetworkOff`
- operations listed under "Operations" in BUILTIN.md (for example `darkhub:op:advancedNetwork`), if the description
  fits

Rules: every item gets a `note`, sources go in `evidence`, no FPS promises, `name` and `description` in pt-BR and en-US
if you can. Per-adapter registry tweaks (paths with an interface GUID) cannot be expressed in a package; leave them out.

## Files to look at

- `docs/hub/README.md` (sections 2 to 9)
- `docs/hub/BUILTIN.md`
- `docs/hub/examples/pokeralho.gaming-essentials.darkhub.json` (a similar file to copy from)
- `electron/services/hub/schema/v1.json`

## How to test

```bash
npm run hub:validate -- docs/hub/examples/<id>.darkhub.json
```

Then in DarkHub: **Presets e módulos** → **Abrir arquivo**, check the "now / after" list, install it in a VM or Windows
Sandbox, and use **Remover e restaurar** to confirm that everything goes back.

## Definition of done

- [ ] `docs/hub/examples/<id>.darkhub.json`, valid (`All 1 file(s) valid.`)
- [ ] Every item has a `note`; `evidence` has at least one source
- [ ] The pull request includes the validator summary and says where you tested install and removal
