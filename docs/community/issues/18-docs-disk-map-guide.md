---
title: "Docs: user guide for the Disk map"
labels: good first issue, documentation
---

## Context

The Disk map (route `spacesniffer`) is one of the most used tools: a native multi-threaded scanner, a live treemap,
categories (system, programs, games, junk...), filters and reports. The only user documentation is one line in the
README and `docs/UserManual.md`, which is 16 lines long and does not mention it.

## What to do

Write `docs/guides/disk-map.md`, in plain English, for someone who has never used a treemap:

1. What the screen shows and how to start a scan.
2. How to read the map: size, colours by category or by file type, the category list.
3. Navigation: click, double-click / Enter, Backspace, Alt+Left/Right, keyboard list navigation (the hint text in
   `diskmap.navHint` lists them).
4. What the "Junk (safe to clean)" and "System" categories mean, and that nothing is deleted automatically.
5. Filters and reports (open the screen and describe what is really there).
6. Two screenshots (`npm run shot -- spacesniffer` with `npm run dev` running gives the layout; a real scan screenshot
   is better).

Then link the guide from `docs/UserManual.md`.

## Files to look at

- `src/pages/SpaceSniffer/index.tsx`, `TreemapCanvas.tsx`, `diskCategories.ts`
- `src/i18n/diskMapMessages.ts` (every label and hint on the screen, in both languages)
- `docs/PROJECT_MAP.md` (route table, "Utilitários")

## How to test

Follow the guide on your own PC with `npm run dev` (scanning a folder is read-only). Every button and label you mention
must exist on the screen.

## Definition of done

- [ ] `docs/guides/disk-map.md` with the six parts above
- [ ] Linked from `docs/UserManual.md`
- [ ] Labels match the en-US interface text
