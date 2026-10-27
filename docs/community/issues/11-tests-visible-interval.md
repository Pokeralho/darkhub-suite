---
title: "Tests for visibleInterval (renderer polling helper)"
labels: good first issue, tests, performance
---

## Context

`src/utils/visibleInterval.ts` replaces `setInterval` for polling in the renderer: it skips ticks while the window is
hidden, never runs two ticks at once, and refreshes right away when the window becomes visible. Several screens rely on
it (Home, Settings, AutoClicker, UltraLowLatency, GuardianWidget, useSecurityScore). It has no test.

## What to do

Create `tests/visibleInterval.test.ts`. The test environment is jsdom (see `vite.config.js`), so `window` and
`document` exist. Use `vi.useFakeTimers()` and control `document.hidden` with
`Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })`. Check:

- the callback runs every `ms` while visible
- no call while `document.hidden` is true
- a `visibilitychange` event when the page becomes visible runs the callback immediately
- a slow async callback (a promise you resolve later) is not started again until it finishes
- an error thrown by the callback does not stop later ticks
- after calling the returned stop function, no more calls happen and the `visibilitychange` listener is removed

## Files to look at

- `src/utils/visibleInterval.ts`
- `vite.config.js` (the `test` section)

## How to test

```bash
npx vitest run tests/visibleInterval.test.ts
```

## Definition of done

- [ ] All six behaviours covered
- [ ] Fake timers are restored after each test (`vi.useRealTimers()`)
- [ ] `npx vitest run` passes
