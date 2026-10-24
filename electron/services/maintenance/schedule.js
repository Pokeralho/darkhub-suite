// Scheduling rules for scheduled maintenance. Pure (the clock is passed in).
// A task has { enabled, freq: 'daily'|'weekly'|'monthly', time: 'HH:MM', weekday: 0-6 (Sunday = 0), day: 1-28 }.

const parseTime = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ''))
  const h = m ? Math.min(23, Number(m[1])) : 3
  const min = m ? Math.min(59, Number(m[2])) : 0
  return { h, min }
}

/** The first scheduled moment strictly after `from` (ms), in local time. */
export function nextRun(task, from) {
  const { h, min } = parseTime(task.time)
  const d = new Date(from)
  const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, min, 0, 0)
  if (task.freq === 'weekly') {
    const wd = Number.isInteger(task.weekday) ? task.weekday : 0
    at.setDate(at.getDate() + ((wd - at.getDay() + 7) % 7))
    if (at.getTime() <= from) at.setDate(at.getDate() + 7)
  } else if (task.freq === 'monthly') {
    const day = Math.min(28, Math.max(1, Number(task.day) || 1))
    at.setDate(day)
    if (at.getTime() <= from) at.setMonth(at.getMonth() + 1, day)
  } else {
    if (at.getTime() <= from) at.setDate(at.getDate() + 1)
  }
  return at.getTime()
}

/**
 * Due when the slot after the last run has already passed. A PC that was off at the scheduled time runs the task
 * at the next check (catch-up), once — not once per missed slot.
 */
export function isDue(task, lastRunAt, now) {
  if (!task?.enabled) return false
  // never run: anchor to when the task was enabled, so enabling it does not run it immediately
  const anchor = lastRunAt || task.enabledAt || now
  return nextRun(task, anchor) <= now
}

export function normalizeTask(t = {}, defaults = {}) {
  const freq = ['daily', 'weekly', 'monthly'].includes(t.freq) ? t.freq : defaults.freq || 'weekly'
  return {
    enabled: t.enabled === true,
    enabledAt: Number(t.enabledAt) || null,
    freq,
    time: /^\d{1,2}:\d{2}$/.test(String(t.time)) ? t.time : defaults.time || '03:00',
    weekday: Number.isInteger(t.weekday) && t.weekday >= 0 && t.weekday <= 6 ? t.weekday : defaults.weekday ?? 0,
    day: Math.min(28, Math.max(1, Number(t.day) || defaults.day || 1)),
    options: { ...(defaults.options || {}), ...(t.options && typeof t.options === 'object' ? t.options : {}) }
  }
}
