---
title: "Package: streaming preset (OBS)"
labels: packages, help wanted
---

## Context

DarkHub packages describe Windows changes as data, shown before applying and restored on removal. Specification:
[docs/hub/README.md](../../hub/README.md). Streamers who play and run OBS on the same PC have no preset yet.

## What to do

Write a `preset` named `<your-github-user>.streaming-obs` for playing and streaming on one PC. Start from the built-in
tweaks and operations in [docs/hub/BUILTIN.md](../../hub/BUILTIN.md) and keep only what has a documented reason, for
example:

- `darkhub:tweak:disableGameDvr` (Game Bar background recording competes with OBS)
- `darkhub:tweak:disableNotifications` (no pop-ups on stream)
- `darkhub:tweak:mmcssGames`
- a power plan operation only on desktops (`"if": { "chassis": "desktop" }`)

Do not add changes just because they appear in every guide: the preset must say what each item is for (`note`) and
link sources (`evidence`). Use `expects` only for metrics DarkHub's benchmark measures.

## Files to look at

- `docs/hub/README.md` (items, conditions, risk, writing good packages)
- `docs/hub/BUILTIN.md`
- `docs/hub/examples/pokeralho.gaming-essentials.darkhub.json`

## How to test

`npm run hub:validate -- docs/hub/examples/<id>.darkhub.json`; open it in DarkHub and check the preview; install and
remove it in a VM or Windows Sandbox. If you can, stream for a few minutes with OBS before and after and describe what
you saw.

## Definition of done

- [ ] Valid preset in `docs/hub/examples/`
- [ ] Every item has a `note`; at least one `evidence` link
- [ ] The pull request describes how it was tested
