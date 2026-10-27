---
title: "Performance: stop polling the backend while the window is hidden"
labels: performance, good first issue
---

## Context

DarkHub often runs minimized or in the tray while you play. Screens that poll the main process with a plain
`setInterval` keep sending IPC calls (and waking PowerShell or WMI queries) even when nobody can see them. The project
already has a helper for this, `visibleInterval()` in `src/utils/visibleInterval.ts`: it skips ticks while the window
is hidden, never overlaps two slow calls, and refreshes as soon as the window is visible again.

These screens still use a plain `setInterval` for backend polling:

- `src/pages/Home.tsx`: memory reading every 3 s (around line 95)
- `src/pages/SystemMonitor.tsx`: app resource usage every 3 s (around line 218)
- `src/pages/SpaceSniffer/index.tsx`: view refresh every 1 s while scanning (around line 84)

## What to do

Replace those three `setInterval`/`clearInterval` pairs with `visibleInterval(fn, ms)` and call the returned stop
function in the effect cleanup. Keep the first immediate call where there is one. Leave timers that are not backend
polling alone (for example the countdown in `UsbControl.tsx` or the CPS counter in `AutoClicker.tsx`).

## Files to look at

- `src/utils/visibleInterval.ts`
- `src/pages/AutoClicker.tsx` or `src/pages/Settings.tsx` (already use `visibleInterval`)
- the three files above

## How to test

`npm run dev`, open each screen, check that the numbers still update. Minimize the window and check in DevTools
(Ctrl+Shift+I → Network/Console, or a temporary `console.count`) that the calls stop, and that they resume right away
when you restore the window. Run `npx tsc --noEmit -p .` and `npx vitest run`.

## Definition of done

- [ ] The three screens use `visibleInterval`
- [ ] No behaviour change while the window is visible
- [ ] `tsc` and `vitest` pass
