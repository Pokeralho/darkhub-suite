#!/usr/bin/env node
const name = process.argv[2] || 'this script'
if (process.platform !== 'win32') {
  console.error(`[${name}] Windows-only: this step requires Windows (PowerShell/csc.exe/MSVC/Windows targets).`)
  process.exit(1)
}
