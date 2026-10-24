import { detectRuntimes, runCode, cancelRun } from '../services/CodeRunner.js'

/** `code:*`: run snippets from the Text Editor with toolchains installed on the PC. */
export function registerCodeRunnerIPC({ ipcMain, logger } = {}) {
  const handle = (channel, fn) => ipcMain.handle(channel, async (_e, payload) => {
    try { return await fn(payload ?? {}) } catch (err) {
      logger?.error?.('CodeRunner', `${channel}: ${err?.message ?? err}`)
      return { ok: false, error: err?.message ?? String(err) }
    }
  })
  handle('code:runtimes', async ({ refresh }) => ({ ok: true, runtimes: await detectRuntimes(Boolean(refresh)) }))
  handle('code:run', (p) => runCode({ language: String(p.language || ''), code: p.code, input: p.input, timeoutSec: p.timeoutSec }))
  handle('code:cancel', () => cancelRun())
}

export default registerCodeRunnerIPC
