---
title: "Tests for the sensor model helpers (SensorModel.js)"
labels: good first issue, tests
---

## Context

`electron/hal/models/SensorModel.js` holds small pure functions that every hardware reading goes through. One of the
app's rules is that a value that cannot be read is shown as "unavailable", never as a fake `0`. These functions enforce
that, and they have no tests.

## What to do

Create `tests/sensorModel.test.ts` covering:

- `createSensor(value, unit, source, opts)`: a number gives `availability: 'available'`, `quality: 'high'`,
  `status: 'OK'`; `null`, `undefined` and `NaN` give `value: null`, `'unsupported'`, `'unavailable'`; a string as the
  4th argument is used as `status`; explicit `opts` win over the defaults.
- `createUnavailableSensor(unit, source, reason)`.
- `classifyTemperature(value, component)`: the limits for `cpu`, `gpu`, `storage`, `system`, exactly at the
  boundaries (75 / 90 for CPU...), an unknown component falls back to CPU, `null` gives `'Unavailable'`.
- `numOrNull(v)`: `''`, `null`, `'abc'`, `Infinity` give `null`; `'42'` gives `42`; `0` stays `0`.
- `sameGpu(a, b)`: "NVIDIA GeForce RTX 4070" vs "RTX 4070", "AMD Radeon(TM) RX 7800 XT" vs "Radeon RX 7800 XT",
  two different cards, empty strings.

For `timestamp`, check that it is a number close to `Date.now()` (or use `vi.useFakeTimers()`).

## Files to look at

- `electron/hal/models/SensorModel.js`
- `tests/frameStats.test.ts` or `tests/benchStats.test.ts` (style of existing tests for pure modules)

## How to test

```bash
npx vitest run tests/sensorModel.test.ts
npx tsc --noEmit -p .
```

No administrator rights needed; nothing on the system changes.

## Definition of done

- [ ] `tests/sensorModel.test.ts` covers the five exported functions, including boundaries
- [ ] `npx vitest run` passes
- [ ] No change to `SensorModel.js` (if you find a bug, describe it in the pull request or a new issue)
