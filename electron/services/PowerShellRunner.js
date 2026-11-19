

import log from 'electron-log'
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'

/** Longest -EncodedCommand value that keeps the whole command line under Windows' 32767-char limit. */
export const MAX_ENCODED_ARG = 30000

/** Reads the whole script from stdin as UTF-8 bytes (no console code page involved) and runs it as one script block. */
export const STDIN_BOOTSTRAP = [
  '$__dhMs = New-Object System.IO.MemoryStream',
  '[Console]::OpenStandardInput().CopyTo($__dhMs)',
  '& ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString($__dhMs.ToArray())))'
].join('\n')

export function runCommand(command, args = [], {
  timeoutMs = 30000,
  spawnOptions = {},
  encoding = 'utf8',
  maxBuffer = 8 * 1024 * 1024,
  trim = false,
  onStdout = null,
  onStderr = null,
  input = null
} = {}) {
  // On non-Windows hosts, Windows-specific tool invocations are not supported.
  // Fail fast with a structured error so callers can degrade gracefully.
  if (process.platform !== 'win32' && /^(powershell(\.exe)?|pwsh(\.exe)?|where(\.exe)?|cmd(\.exe)?|schtasks(\.exe)?|reg(\.exe)?|taskkill(\.exe)?|msiexec(\.exe)?|winget(\.exe)?)$/i.test(command)) {
    return Promise.resolve({
      code: 1,
      stdout: '',
      stderr: `Windows-only command not available on ${process.platform}: ${command}`
    })
  }
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...spawnOptions
    })
    if (input != null) {
      child.stdin?.on('error', () => {}) // child exited before reading everything: 'close' reports it
      child.stdin?.end(input)
    }
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (fn, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      fn(value)
    }

    // a multibyte UTF-8 character split across two 'data' chunks must not turn into two U+FFFD: decode statefully
    const enc = Buffer.isEncoding(encoding) ? encoding : 'utf8'
    const decoders = { stdout: new StringDecoder(enc), stderr: new StringDecoder(enc) }
    const appendChunk = (streamName, current, chunk, callback) => {
      const text = typeof chunk === 'string' ? chunk : decoders[streamName].write(chunk)
      if (!text) return current
      if (typeof callback === 'function') {
        try {
          callback(text, child)
        } catch (err) {
          log.warn(`Command ${streamName} callback failed`, err?.message ?? String(err))
        }
      }

      if (current.length + text.length > maxBuffer) {
        try {
          child.kill()
        } catch {}
        finish(reject, new Error(`Command ${streamName} exceeded ${maxBuffer} bytes`))
        return current
      }

      return current + text
    }

    const timer = typeof timeoutMs === 'number' && timeoutMs > 0
      ? setTimeout(() => {
          // Kill the whole tree so winget/DISM grandchildren are not orphaned.
          try {
            if (process.platform === 'win32' && child.pid) {
              spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {})
            } else if (child.pid) {
              try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
            }
          } catch {}
          try {
            child.kill()
          } catch {}
          finish(reject, new Error(`Command timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      : null

    child.stdout?.on('data', (chunk) => {
      stdout = appendChunk('stdout', stdout, chunk, onStdout)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = appendChunk('stderr', stderr, chunk, onStderr)
    })
    child.on('error', (err) => {
      finish(reject, err)
    })
    child.on('close', (code) => {
      const outTail = decoders.stdout.end()
      const errTail = decoders.stderr.end()
      if (outTail) stdout += outTail
      if (errTail) stderr += errTail
      finish(resolve, {
        code,
        stdout: trim ? stdout.trim() : stdout,
        stderr: trim ? stderr.trim() : stderr
      })
    })
  })
}

export function stripBom(s) {
  const str = String(s ?? '')
  return str.charCodeAt(0) === 0xfeff ? str.slice(1) : str
}

export function encodePowerShellScript(script) {
  if (typeof script !== 'string' || script.trim().length === 0) {
    throw new Error('PowerShell script cannot be empty')
  }
  return Buffer.from(script, 'utf16le').toString('base64')
}

export function powerShellArgsForEncodedScript(encodedScript, { nonInteractive = true } = {}) {
  return [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    ...(nonInteractive ? ['-NonInteractive'] : []),
    '-EncodedCommand',
    encodedScript
  ]
}

export function parseJsonOutput(stdout, fallback = null) {
  const text = stripBom(stdout).trim()
  if (!text) return fallback

  try {
    return JSON.parse(text)
  } catch {
    // Non-JSON noise (WARNING:/VERBOSE: lines, progress text) may precede the payload. The payload starts at the
    // first line that begins with "[" or "{" and its opener decides the closer: trying "{" before "[" would return
    // only the inner object of a one-element array.
    const starts = []
    const lineRe = /^[ \t]*([[{])/gm
    let m
    while ((m = lineRe.exec(text)) && starts.length < 32) starts.push(m.index + m[0].length - 1)
    // last resort: the first "[" or "{" anywhere (JSON glued to the end of a noise line)
    const anyStart = [text.indexOf('['), text.indexOf('{')].filter((i) => i >= 0).sort((a, b) => a - b)
    if (anyStart.length) starts.push(anyStart[0])

    const tried = new Set()
    for (const start of starts) {
      if (tried.has(start)) continue
      tried.add(start)
      const end = text.lastIndexOf(text[start] === '[' ? ']' : '}')
      if (end <= start) continue
      try {
        return JSON.parse(text.slice(start, end + 1))
      } catch {}
    }

    throw new Error('PowerShell output is not valid JSON')
  }
}

function psSingleQuote(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

export async function runPowerShell(script, {
  timeoutMs = 30000,
  asAdmin = false,
  workingDirectory = null,
  hidden = true,
  onStdout = null,
  onStderr = null,
  maxBuffer,
  trim = false
} = {}) {
  // output is read as UTF-8: without this, Windows PowerShell writes in the console code page and accented text
  // (device names, update titles...) arrives broken ("comunica��o")
  if (!/OutputEncoding/.test(script)) script = `[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
${script}`
  const encodedScript = encodePowerShellScript(script)
  const spawnOptions = {
    windowsHide: hidden,
    ...(workingDirectory ? { cwd: workingDirectory } : {})
  }

  // asAdmin starts a second, elevated powershell through ShellExecute (Start-Process -Verb RunAs). ShellExecute
  // cannot redirect the child's standard streams, so the result only carries the exit code: stdout/stderr are
  // always ''. This is inherent, not a bug. Capturing the output through a temp file is deliberately not done: the
  // file would sit in a folder an unelevated process can write to (see the stdin note below). DarkHub already runs
  // elevated, so callers that need output should run without asAdmin.
  if (asAdmin) {
    const workingDirectoryLine = workingDirectory
      ? `$startInfo.WorkingDirectory = ${psSingleQuote(workingDirectory)}`
      : ''
    const windowStyleLine = hidden ? "$startInfo.WindowStyle = 'Hidden'" : ''
    const adminScript = `
      $ErrorActionPreference = 'Stop'
      $startInfo = @{
        FilePath = 'powershell.exe'
        ArgumentList = @(
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-NonInteractive',
          '-EncodedCommand',
          '${encodedScript}'
        )
        Verb = 'RunAs'
        Wait = $true
        PassThru = $true
      }
      ${workingDirectoryLine}
      ${windowStyleLine}
      $process = Start-Process @startInfo
      if ($null -ne $process -and $null -ne $process.ExitCode) { exit $process.ExitCode }
    `
    const adminEncodedScript = encodePowerShellScript(adminScript)
    return runCommand('powershell.exe', powerShellArgsForEncodedScript(adminEncodedScript), {
      timeoutMs,
      spawnOptions,
      onStdout,
      onStderr,
      maxBuffer,
      trim
    })
  }

  // Windows caps a command line at 32767 chars and -EncodedCommand doubles the script size (UTF-16 + base64):
  // big scripts (e.g. the batched registry status read of every tweak) are piped through stdin to a tiny bootstrap.
  // Never through a temp .ps1: the app runs elevated and %TEMP% is writable by unelevated processes of the same
  // user, which could swap the file between write and -File.
  if (encodedScript.length > MAX_ENCODED_ARG) {
    return runCommand('powershell.exe', powerShellArgsForEncodedScript(encodePowerShellScript(STDIN_BOOTSTRAP)), {
      timeoutMs, spawnOptions, onStdout, onStderr, maxBuffer, trim, input: Buffer.from(script, 'utf8')
    })
  }

  return runCommand('powershell.exe', powerShellArgsForEncodedScript(encodedScript), {
    timeoutMs,
    spawnOptions,
    onStdout,
    onStderr,
    maxBuffer,
    trim
  })
}

export async function runPowerShellJson(script, options = {}) {
  const { allowNonZero = false, fallback = null, ...powerShellOptions } = options
  const result = await runPowerShell(script, powerShellOptions)
  if (result.code !== 0 && !allowNonZero) {
    throw new Error(result.stderr || `PowerShell exited with code ${result.code}`)
  }
  return {
    ...result,
    data: parseJsonOutput(result.stdout, fallback)
  }
}

export default {
  runCommand,
  runPowerShell,
  runPowerShellJson,
  stripBom,
  encodePowerShellScript,
  powerShellArgsForEncodedScript,
  parseJsonOutput
}
