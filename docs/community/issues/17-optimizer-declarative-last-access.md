---
title: "Optimizer: turn \"NTFS last access off\" into a declarative registry tweak"
labels: optimizer, help wanted
---

## Context

Most optimizer changes are **declarative**: a `defineTweak({ rows: [[key, name, type, new, default]] })` entry in
`electron/services/optimizer/DeepTweaksEngine.js`. The engine snapshots, writes, reads back and reverts those rows by
itself, and packages can reuse them with `{ "use": "darkhub:tweak:<id>" }`.

A few changes are still **imperative** code. One of them is "NTFS last access updates off", used by the Hardcore and
Kernel modes: `SystemEngine._applyLowLevel({ lastAccess: true })` runs `fsutil behavior set disablelastaccess 1`, parses
`fsutil behavior query` output to snapshot the old value, and has its own revert path (`_revertLowLevel`). Because it
is not a tweak, packages cannot use it on its own.

`fsutil behavior set disablelastaccess` stores its setting in the registry value `NtfsDisableLastAccessUpdate` under
`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem` (Windows 10 1803 and later use the high bit `0x80000000` for
"system managed"). Verify this on a VM before relying on it.

## What to do

1. In a VM, record what `fsutil behavior query disablelastaccess` prints and what `NtfsDisableLastAccessUpdate` holds,
   before and after `fsutil behavior set disablelastaccess 1` and `... 2`. Put the table in the pull request.
2. Add a public tweak, for example `tweak:disableNtfsLastAccess`, with one row for that value. Use `null` as the
   default if the value can be absent, so revert deletes it. Write `title` and `description` in Portuguese, like the
   other tweaks, and state the trade-off (some backup and cleanup tools use last-access times).
3. Use the new tweak in `applyHardcoreGamerMode` / `applyExtremeKernelMod` instead of `lastAccess: true`, and the
   matching revert. Keep the BCD (`timer`) part of `_applyLowLevel` as it is.
4. Keep old snapshots working: users who applied the mode with the old code must still be able to revert. Read how
   `LASTACCESS_EXTRA` is stored and handle it (for example, fall back to the old revert when that extra exists).
5. Run `npm run hub:docs` so `docs/hub/BUILTIN.md` lists the new tweak.

## Files to look at

- `electron/services/optimizer/SystemEngine.js` (`_lowLevelReadBlock`, `_applyLowLevel`, `_revertLowLevel`,
  `applyHardcoreGamerMode`, `applyExtremeKernelMod`)
- `electron/services/optimizer/DeepTweaksEngine.js` (`defineTweak`, `buildPublicTweaks`, `buildInternalGroups`)
- `tests/optimizerAudit.test.ts`, `tests/system.test.ts`
- `docs/PROJECT_MAP.md`, section "Otimizador de Sistema" (how the layers fit)

## How to test

Unit tests: `npx vitest run` (extend `tests/optimizerAudit.test.ts` with the new tweak's rows). System test: in a VM
or Windows Sandbox, `npm run dev:admin`, apply and revert the Hardcore mode, and check the value and the `fsutil` output
each time.

## Definition of done

- [ ] New declarative tweak, used by both modes; imperative last-access code removed or kept only for old snapshots
- [ ] Apply and revert verified in a VM (table in the pull request)
- [ ] `BUILTIN.md` regenerated; `tsc` and `vitest` pass
