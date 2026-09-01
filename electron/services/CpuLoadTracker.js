

import os from 'node:os'

export class CpuLoadTracker {
  constructor() {
    this._last = null
  }

  sample() {
    const cpus = os.cpus()
    if (!cpus || cpus.length === 0) return null

    let idle = 0
    let total = 0
    for (const cpu of cpus) {
      for (const type in cpu.times) total += cpu.times[type]
      idle += cpu.times.idle
    }

    if (!this._last) {
      this._last = { idle, total }
      return null
    }

    const idleDiff = idle - this._last.idle
    const totalDiff = total - this._last.total
    this._last = { idle, total }

    if (totalDiff === 0) return 0
    return Math.max(0, Math.min(100, 100 - Math.round((100 * idleDiff) / totalDiff)))
  }
}

export default CpuLoadTracker
