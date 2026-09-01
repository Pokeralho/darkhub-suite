

import log from 'electron-log'
import { spawn } from 'node:child_process'

export function runCommand(command, args = [], {
  timeoutMs = 30000,
  spawnOptions = {},
  encoding = 'utf8',
  maxBuffer = 8 * 1024 * 1024,
  trim = false,
  onStdout = null,
  onStderr = null
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      ...spawnOptions
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (fn, value) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      fn(value)
    }

    const appendChunk = (streamName, current, chunk, callback) => {
      const text = chunk.toString(encoding)
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
    const objectStart = text.indexOf('{')
    const objectEnd = text.lastIndexOf('}')
    const arrayStart = text.indexOf('[')
    const arrayEnd = text.lastIndexOf(']')
    const candidates = []
    if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1))
    if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1))

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate)
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
  const encodedScript = encodePowerShellScript(script)
  const spawnOptions = {
    windowsHide: hidden,
    ...(workingDirectory ? { cwd: workingDirectory } : {})
  }

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
