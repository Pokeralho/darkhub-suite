---
title: "Package: privacy preset for laptops"
labels: good first issue, packages
---

## Context

DarkHub packages describe Windows changes as data; every change is shown before it is applied and restored on removal.
Specification: [docs/hub/README.md](../../hub/README.md). There is a small `privacy-lite` module and a `laptop-quiet`
preset in `docs/hub/examples/`, but no privacy preset aimed at laptops.

## What to do

Write a `preset` named `<your-github-user>.privacy-laptop` with `"when": { "chassis": "laptop" }` that reduces data
sent to Microsoft and ads without breaking what laptop users need. Prefer built-in tweaks
(`{ "use": "darkhub:tweak:<id>" }`), for example `disableTelemetry`, `disableAiAndAds`, `disableActivityHistory`,
`blockAdsAndSuggestions`, `disableErrorReporting`, `disableStoreSearchResults`.

Think about trade-offs and explain them in `note`. For example, `disableLocation` breaks "Find my device" and the
automatic time zone, which matter on a laptop: leave it out or say so clearly. Security items (Defender, SmartScreen,
Windows Update, firewall) are refused in community packages, so do not include them.

## Files to look at

- `docs/hub/README.md` (sections 3 to 5 and 9)
- `docs/hub/BUILTIN.md`
- `docs/hub/examples/pokeralho.privacy-lite.darkhub.json` and `docs/hub/examples/pokeralho.laptop-quiet.darkhub.json`

## How to test

`npm run hub:validate -- docs/hub/examples/<id>.darkhub.json`, then open it in DarkHub (**Presets e módulos** →
**Abrir arquivo**). Install and remove it in a VM or Windows Sandbox and confirm that the values come back.

## Definition of done

- [ ] Valid preset in `docs/hub/examples/`
- [ ] Each item has a `note` that states the trade-off when there is one
- [ ] `name` and `description` in pt-BR and en-US
