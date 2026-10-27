---
title: "Update TRANSLATIONS.md to match how translations really work"
labels: good first issue, documentation, translation
---

## Context

[TRANSLATIONS.md](../../TRANSLATIONS.md) describes one dictionary in `src/i18n/messages.ts`. Today the strings are
split across `messages.ts` and about 25 files named `src/i18n/*Messages.ts` (darkos, realtime, overlay, hub...), which
are merged into `messages` by a loop at the end of `messages.ts`. The guide also says to verify only with
`npm run build:renderer`, while the project checks `npx tsc --noEmit -p .` and `npx vitest run`.

## What to do

Rewrite TRANSLATIONS.md so a first-time translator can follow it:

1. Where strings live: `messages.ts` plus the `*Messages.ts` files, and how they are merged.
2. How a language becomes visible: a code in `availableLanguages` **and** a dictionary (`I18nProvider.tsx` hides
   languages without one), and that missing keys fall back to English.
3. Recommended layout for a new language: one file per language (for example `src/i18n/esMessages.ts`) added to the
   merge loop, instead of editing every `*Messages.ts`.
4. Rules: keep keys and placeholders (`{n}`), keep product names, use sentence case.
5. Testing: the in-app import in Settings → Language (use the real labels from that screen), then `npm run dev`,
   `npx tsc --noEmit -p .` and `npx vitest run`.

## Files to look at

- `TRANSLATIONS.md`
- `src/i18n/messages.ts` (top: `availableLanguages`; bottom: merge loop and `getTranslationTemplate`)
- `src/i18n/I18nProvider.tsx`
- `src/pages/Settings.tsx` (the custom translation import; search for `importCustomTranslation`)

## How to test

Follow your own guide from a clean clone and add one string in a test language. Everything you describe must match the
code.

## Definition of done

- [ ] TRANSLATIONS.md describes the real file layout, fallback and test steps
- [ ] Every path and label in the guide exists in the code
