---
title: "Accessibility: label the Text Summarizer fields and announce the copy action"
labels: good first issue, accessibility, ui
---

## Context

In `src/pages/TextSummarizer.tsx` the two text areas (input and summary) and the "size" slider have no accessible name:
there is a visible heading or label next to them, but it is not linked to the field, so a screen reader announces
"edit text" or "slider" with no context. The Copy button copies silently, with no feedback for anyone.

Other screens already do this right, for example `src/pages/DllInjector.tsx` uses `<label htmlFor>` with an `id` on the
input.

## What to do

1. Give each `<textarea>` an accessible name: `aria-labelledby` pointing to the `id` of its `<h2>` (Text / Summary).
2. Give the `<input type="range">` an `id` and link it to the "size" label, and add `aria-valuetext` with the number of
   sentences (for example "5 sentences", translated).
3. After a successful copy, show a short confirmation ("Copied") for about 2 seconds, inside an element with
   `role="status"` so screen readers announce it.
4. Add any new text to `src/i18n/messages.ts` in **both** pt-BR and en-US (`summarizer.*` keys).

## Files to look at

- `src/pages/TextSummarizer.tsx` (around lines 215 to 280)
- `src/pages/DllInjector.tsx` (labels and the `role="status"` message)
- `src/i18n/messages.ts` (`summarizer.*` keys)

## How to test

`npm run dev`, open the Summarizer. With Windows Narrator (Ctrl+Win+Enter) or NVDA, Tab through the fields and check
that each one is announced with its name, and that "Copied" is announced. Run `npx tsc --noEmit -p .` and
`npx vitest run`.

## Definition of done

- [ ] Both text areas and the slider have accessible names
- [ ] Copy shows and announces a confirmation
- [ ] New strings exist in pt-BR and en-US
- [ ] Before/after screenshot in the pull request (`npm run shot -- summarizer` with `npm run dev` running)
