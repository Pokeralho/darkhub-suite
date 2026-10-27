---
title: "Move the Text Summarizer algorithm into a tested module"
labels: good first issue, tests
---

## Context

The Text Summarizer screen (`src/pages/TextSummarizer.tsx`) computes the summary on the page itself, with three local
functions: `splitSentences`, `tokenize` and `summarize` (frequency-based sentence scoring with a stopword list). Logic
inside a React component cannot be tested on its own, so none of it is.

## What to do

1. Move the stopword list, `splitSentences`, `tokenize` and `summarize` to a new file `src/lib/summarize.ts` and export
   them. Do not change their behaviour.
2. Import them in `TextSummarizer.tsx`.
3. Create `tests/summarize.test.ts`:
   - a text with fewer sentences than requested is returned whole (sentences joined by a blank line)
   - the selected sentences keep their original order
   - `maxSentences` of 0 or less still returns one sentence
   - `tokenize` drops stopwords, words shorter than 3 letters and punctuation, and keeps accented letters
     ("ação", "über")
   - an empty text returns an empty string

## Files to look at

- `src/pages/TextSummarizer.tsx` (`stopwords` at the top; the functions are near lines 67 to 105)
- `src/lib/cipherTools.ts` and `tests/cipherTools.test.ts` (same pattern: pure module in `src/lib/` plus a test)

## How to test

```bash
npx vitest run tests/summarize.test.ts
npx tsc --noEmit -p .
npm run dev    # open Utilities → Summarizer and check it still works
```

## Definition of done

- [ ] `src/lib/summarize.ts` exported and used by the screen; the screen behaves exactly as before
- [ ] `tests/summarize.test.ts` covers the cases above
- [ ] `tsc` and `vitest` pass
