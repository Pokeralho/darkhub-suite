---
title: "Review the English (en-US) interface strings"
labels: good first issue, translation, documentation
---

## Context

The app was written in Portuguese first and translated to English. Most en-US strings are fine, but some read like a
translation, mix British and American spelling, or shout in capital letters. Examples found while reading the code:

- `diskmap.colorBy`: "Colour by" (British spelling in an en-US dictionary), in `src/i18n/diskMapMessages.ts`
- `dllinjector.warning`: "The injection engine uses robust CreateRemoteThread and LoadLibraryA Win32 techniques..."
  (marketing tone, tells the user nothing useful), in `src/i18n/messages.ts`
- `optimizer.gpu.dedicatedBadge`, `optimizer.gpu.integratedBadge`, `net.closed`, `net.timeout`: all caps in the
  dictionary (if a badge must look uppercase, the CSS class `uppercase` does that)

## What to do

1. Read the `en-US` blocks of `src/i18n/messages.ts` and the smaller `src/i18n/*Messages.ts` files. Pick one or two
   areas (for example Optimizer, Disk map, Network tools) so the pull request stays easy to review.
2. Fix spelling (American English), grammar, capitalization (sentence case for labels and buttons) and unclear
   wording. Keep the meaning; if a string is wrong about what the feature does, open a separate issue instead.
3. Do not change keys or placeholders (`{n}`, `{name}`).

## Files to look at

- `src/i18n/messages.ts` (en-US block)
- `src/i18n/diskMapMessages.ts`, `src/i18n/optimizerUiMessages.ts`, `src/i18n/networkMessages.ts` and the other
  `src/i18n/*Messages.ts`

## How to test

`npm run dev`, set Settings → Language → English and open the screens you changed. Run `npx tsc --noEmit -p .` and
`npx vitest run` (some tests check strings in both languages).

## Definition of done

- [ ] One pull request per area, with a short list of what changed and why
- [ ] American spelling, sentence case, no all-caps strings in the dictionaries you touched
- [ ] `tsc` and `vitest` pass
