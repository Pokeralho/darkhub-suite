---
title: "Spanish (es-ES): translate the core of the interface (navigation, Home, Settings)"
labels: good first issue, translation, help wanted
---

## Context

DarkHub Suite ships pt-BR and en-US. Spanish is already listed in `availableLanguages` in `src/i18n/messages.ts`, but
it has no dictionary, so `I18nProvider` hides it from the language picker. Missing keys fall back to English
(`t()` in `src/i18n/I18nProvider.tsx`), so a partial translation is safe: untranslated text simply shows in English.

The full app has about 4,000 strings, too many for one pull request. This issue covers the first part: what every user
sees first. Later parts (Optimizer, help texts, tools) will be separate issues.

## What to do

1. Create `src/i18n/esMessages.ts` exporting `export const esMessages = { 'es-ES': { ... } }`.
2. Copy the `en-US` values of these key groups from `src/i18n/messages.ts` and translate them to Spanish (Spain):
   `nav.*`, `common.*`, `app.*`, `home.*`, `settings.*` (about 200 strings).
3. Import `esMessages` in `src/i18n/messages.ts` and add it to the `for (const extra of [...])` merge loop at the end of
   the file.
4. Keep placeholders exactly as they are (`{n}`, `{name}`...), keep product names in English (DarkHub, DarkPacer,
   OptiScaler, DLSS), and keep keyboard shortcuts unchanged.

Follow [TRANSLATIONS.md](../../TRANSLATIONS.md) for the general rules. You can also try a draft without rebuilding:
Settings → Language → import a JSON dictionary.

## Files to look at

- `src/i18n/messages.ts` (the `en-US` block starts around line 1729; the merge loop is at the end)
- `src/i18n/I18nProvider.tsx` (fallback rules, language list)
- `src/layouts/MainLayout.tsx` (navigation labels), `src/pages/Home.tsx`, `src/pages/Settings.tsx`

## How to test

```bash
npm install
npm run dev
```

Open Settings → Language → Español. Check the side menu, Home and Settings. Look for text that overflows buttons
(Spanish is often longer than English). Then run `npx tsc --noEmit -p .` and `npx vitest run`.

## Definition of done

- [ ] `src/i18n/esMessages.ts` with the five key groups translated, merged in `messages.ts`
- [ ] Español appears in the language picker and the three areas read naturally
- [ ] No placeholder or key name was changed; `tsc` and `vitest` pass
- [ ] Screenshot of Home in Spanish in the pull request
