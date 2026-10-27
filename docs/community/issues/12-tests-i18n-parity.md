---
title: "Test that every pt-BR string has an en-US string (and the other way round)"
labels: good first issue, tests, translation
---

## Context

Project rule: every text on screen has a pt-BR **and** an en-US entry. Nothing checks it today. When a key exists only
in pt-BR, English users see Portuguese (the fallback in `src/i18n/I18nProvider.tsx` is en-US, then pt-BR, then the
key).

## What to do

Create `tests/i18nParity.test.ts` that imports `{ messages }` from `../src/i18n/messages` (the merged dictionaries) and
checks:

1. every key in `messages['pt-BR']` exists in `messages['en-US']`, and the other way round
2. no value is an empty string
3. placeholders match: if the pt-BR text has `{n}`, the en-US text has `{n}` too (extract with `/\{\w+\}/g`)

Print the missing keys in the failure message so they are easy to fix.

If the test finds existing gaps, either add the missing translations in the same pull request (preferred when there
are only a few) or add a short, commented allow-list in the test and open an issue listing the rest. Do not silence
the whole test.

## Files to look at

- `src/i18n/messages.ts` and `src/i18n/*Messages.ts`
- `src/i18n/I18nProvider.tsx`
- `tests/dlss5Lifecycle.test.ts` (already imports `messages` to check one screen's strings)

## How to test

```bash
npx vitest run tests/i18nParity.test.ts
npx vitest run
```

## Definition of done

- [ ] The test runs in CI and fails with a readable list when a key is missing
- [ ] Existing gaps are fixed or listed in an allow-list with a follow-up issue
