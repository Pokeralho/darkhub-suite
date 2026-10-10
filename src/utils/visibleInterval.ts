/**
 * setInterval replacement for polling in the renderer:
 *  - does nothing while the window/document is hidden or minimised (no wasted IPC / CPU),
 *  - never overlaps: a new tick is skipped while the previous (async) one is still running,
 *  - refreshes immediately when the window becomes visible again.
 * Returns a stop function.
 */
export function visibleInterval(fn: () => unknown | Promise<unknown>, ms: number): () => void {
  let stopped = false
  let inFlight = false

  const run = async () => {
    if (stopped || inFlight) return
    if (typeof document !== 'undefined' && document.hidden) return
    inFlight = true
    try {
      await fn()
    } catch {
      // polling errors are handled by the callers
    } finally {
      inFlight = false
    }
  }

  const timer = window.setInterval(run, ms)
  const onVisible = () => {
    if (!document.hidden) void run()
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    stopped = true
    window.clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  }
}
