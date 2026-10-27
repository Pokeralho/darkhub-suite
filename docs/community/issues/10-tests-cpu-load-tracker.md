---
title: "Tests for the CPU load tracker"
labels: good first issue, tests
---

## Context

`electron/services/CpuLoadTracker.js` computes CPU load from two snapshots of `os.cpus()` times. It is 35 lines, pure
apart from `os.cpus()`, and has no test.

## What to do

Create `tests/cpuLoadTracker.test.ts`. Mock `node:os` with `vi.mock('node:os', ...)` (or `vi.spyOn(os, 'cpus')`) so
`cpus()` returns values you control, then check:

- the first `sample()` returns `null` (no previous snapshot)
- a second sample with idle time growing by 25 out of 100 total returns `75`
- equal totals (no time passed) return `0`
- the result is clamped to 0..100 and rounded
- several cores are summed, not averaged per core
- `os.cpus()` returning `[]` gives `null`

## Files to look at

- `electron/services/CpuLoadTracker.js`
- `tests/hwSensors.test.ts` (an example that mocks Node modules)

## How to test

```bash
npx vitest run tests/cpuLoadTracker.test.ts
```

## Definition of done

- [ ] The six cases above are covered
- [ ] `npx vitest run` passes
