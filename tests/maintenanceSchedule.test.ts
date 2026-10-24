// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { nextRun, isDue, normalizeTask } from '../electron/services/maintenance/schedule.js'

const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()

describe('maintenance schedule', () => {
  it('computes the next daily, weekly and monthly slot', () => {
    expect(nextRun({ freq: 'daily', time: '03:00' }, at(2026, 10, 24, 1))).toBe(at(2026, 10, 24, 3))
    expect(nextRun({ freq: 'daily', time: '03:00' }, at(2026, 10, 24, 4))).toBe(at(2026, 10, 25, 3))
    // 2026-10-24 is a Saturday; weekday 0 = Sunday
    expect(nextRun({ freq: 'weekly', time: '03:00', weekday: 0 }, at(2026, 10, 24, 12))).toBe(at(2026, 10, 25, 3))
    expect(nextRun({ freq: 'weekly', time: '03:00', weekday: 6 }, at(2026, 10, 24, 12))).toBe(at(2026, 10, 31, 3))
    expect(nextRun({ freq: 'monthly', time: '03:00', day: 1 }, at(2026, 10, 24))).toBe(at(2026, 11, 1, 3))
    expect(nextRun({ freq: 'monthly', time: '03:00', day: 1 }, at(2026, 12, 5))).toBe(at(2027, 1, 1, 3))
  })

  it('catches up once after the PC was off, and does not run right after enabling', () => {
    const task = { enabled: true, freq: 'daily', time: '03:00', enabledAt: at(2026, 10, 20, 12) }
    expect(isDue(task, at(2026, 10, 21, 3, 1), at(2026, 10, 24, 15))).toBe(true)
    expect(isDue(task, at(2026, 10, 24, 15), at(2026, 10, 24, 16))).toBe(false)
    expect(isDue({ ...task, enabledAt: at(2026, 10, 24, 15) }, null, at(2026, 10, 24, 16))).toBe(false)
    expect(isDue({ ...task, enabled: false }, null, at(2030, 1, 1))).toBe(false)
  })

  it('normalizes bad input', () => {
    expect(normalizeTask({ freq: 'hourly', time: 'x', weekday: 9, day: 40 })).toEqual({ enabled: false, enabledAt: null, freq: 'weekly', time: '03:00', weekday: 0, day: 28, options: {} })
  })
})
