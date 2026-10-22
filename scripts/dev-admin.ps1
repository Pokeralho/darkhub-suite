# Opens an elevated PowerShell window running the DarkHub dev environment (UAC prompt).
# Many Optimizer / DarkOS / Defender features only work as administrator.
param([string]$Page = '')
$root = Split-Path -Parent $PSScriptRoot
$cmd = "Set-Location -LiteralPath '$($root -replace "'", "''")'; npm run dev" + $(if ($Page) { " -- --page=$Page" } else { '' })
Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', $cmd)
