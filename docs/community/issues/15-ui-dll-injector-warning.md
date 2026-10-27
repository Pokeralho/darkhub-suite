---
title: "DLL Injector: add an anti-cheat warning and a neutral placeholder"
labels: good first issue, ui
---

## Context

The DLL Injector screen (`src/pages/DllInjector.tsx`) is a developer and modding tool. Two things on it send the wrong
message:

- the only notice (`dllinjector.warning`) praises the technique ("robust CreateRemoteThread...") but does not warn that
  injecting into online games protected by anti-cheat (Easy Anti-Cheat, BattlEye, Vanguard, VAC) can get the account
  banned;
- the DLL path placeholder is `C:\Cheats\minhadll.dll` (hard-coded, in Portuguese, and suggests cheating), and the
  process placeholder lists `csgo` (a VAC-protected game).

## What to do

1. Rewrite `dllinjector.warning` in pt-BR and en-US: what the tool does (loads a DLL you choose into a process you
   name), the anti-cheat risk, "only inject DLLs you trust", and the 32/64-bit note. Keep it short (two or three
   sentences).
2. Show it as a warning (amber icon such as `AlertTriangle` from `lucide-react`, already used in other screens) instead
   of the neutral `ShieldCheck`.
3. Replace the placeholders with neutral, translated examples, for example `notepad` and
   `C:\Mods\example.dll`, using new keys `dllinjector.processPlaceholder` and `dllinjector.dllPlaceholder`.

## Files to look at

- `src/pages/DllInjector.tsx`
- `src/i18n/messages.ts` (`dllinjector.*` keys, pt-BR and en-US blocks)
- `README.md`, section "Why DarkHub needs administrator rights" (the wording there is a good reference)

## How to test

`npm run dev -- --page=dll-injector` and check both languages (Settings → Language). Then `npx tsc --noEmit -p .` and
`npx vitest run`.

## Definition of done

- [ ] Warning mentions anti-cheat and trusted DLLs, in pt-BR and en-US
- [ ] Warning styled as a warning
- [ ] No hard-coded placeholder left on the screen
- [ ] Screenshot in the pull request
