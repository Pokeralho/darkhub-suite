# Creates the community labels and the issues drafted in docs/community/issues/*.md on GitHub.
#
# Requirements: GitHub CLI (https://cli.github.com) logged in with `gh auth login` and write access to the repository.
# Usage (from the repository root, Windows PowerShell 5.1 or PowerShell 7):
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File docs\community\create-issues.ps1 -DryRun   # show what it would do
#   powershell -NoProfile -ExecutionPolicy Bypass -File docs\community\create-issues.ps1           # create for real
#
# Each draft starts with front matter:
#   ---
#   title: "Issue title"
#   labels: good first issue, tests
#   ---
# Labels that do not exist yet are created. Issues whose title already exists (open or closed) are skipped, so the
# script can be run again safely.
param(
  [string]$Repo = 'Pokeralho/darkhub-suite',
  [string]$IssuesDir = (Join-Path $PSScriptRoot 'issues'),
  [string]$Branch = 'main',
  [switch]$DryRun,
  # only parse the drafts and print titles, labels and rewritten links (no gh calls)
  [switch]$ParseOnly
)
$ErrorActionPreference = 'Stop'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI (gh) not found. Install it from https://cli.github.com and run gh auth login.' }

# name -> color, description
$LabelDefs = [ordered]@{
  'good first issue' = @('7057ff', 'Good for newcomers')
  'help wanted'      = @('008672', 'Extra attention is needed')
  'documentation'    = @('0075ca', 'Improvements or additions to documentation')
  'translation'      = @('fbca04', 'Interface translations (i18n)')
  'tests'            = @('c5def5', 'Unit tests (vitest)')
  'ui'               = @('d4c5f9', 'Screens and visual polish')
  'accessibility'    = @('5319e7', 'Keyboard, screen readers, contrast')
  'performance'      = @('e99695', 'Speed, CPU, memory, polling')
  'packages'         = @('0e8a16', 'DarkHub packages: modules and presets (docs/hub)')
  'optimizer'        = @('b60205', 'System Optimizer engines and tweaks')
}

function Read-Draft([string]$path) {
  $text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
  $text = $text -replace "`r`n", "`n"
  $m = [regex]::Match($text, '(?s)\A---\n(.*?)\n---\n(.*)\z')
  if (-not $m.Success) { throw "No front matter in $path" }
  $title = $null; $labels = @()
  foreach ($line in ($m.Groups[1].Value -split "`n")) {
    if ($line -match '^\s*title:\s*(.+?)\s*$') {
      $title = $Matches[1]
      if ($title.StartsWith('"') -and $title.EndsWith('"')) { $title = $title.Substring(1, $title.Length - 2) -replace '\\"', '"' }
    } elseif ($line -match '^\s*labels:\s*(.+?)\s*$') {
      $raw = $Matches[1].Trim().TrimStart('[').TrimEnd(']')
      $labels = @($raw -split ',' | ForEach-Object { $_.Trim().Trim('"').Trim("'") } | Where-Object { $_ })
    }
  }
  if (-not $title) { throw "No title in $path" }
  return [pscustomobject]@{ Path = $path; Title = $title; Labels = $labels; Body = (Convert-Links $m.Groups[2].Value.Trim() $path) + "`n" }
}

# Relative links in the drafts point at files in the repository; in an issue they would be broken, so turn them into
# https://github.com/<repo>/blob/<branch>/<path> links.
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
function Convert-Links([string]$body, [string]$draftPath) {
  $dir = Split-Path -Parent $draftPath
  return [regex]::Replace($body, '\]\((?!https?://|#|mailto:)([^)\s]+)\)', {
    param($mm)
    $target = $mm.Groups[1].Value
    $anchor = ''
    $i = $target.IndexOf('#')
    if ($i -ge 0) { $anchor = $target.Substring($i); $target = $target.Substring(0, $i) }
    $full = [System.IO.Path]::GetFullPath((Join-Path $dir ($target -replace '/', '\')))
    if (-not $full.StartsWith($RepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) { return $mm.Value }
    $rel = $full.Substring($RepoRoot.Length).TrimStart('\') -replace '\\', '/'
    $kind = if (Test-Path -LiteralPath $full -PathType Container) { 'tree' } else { 'blob' }
    return "](https://github.com/$Repo/$kind/$Branch/$rel$anchor)"
  })
}

$drafts = @(Get-ChildItem -LiteralPath $IssuesDir -Filter '*.md' | Sort-Object Name | ForEach-Object { Read-Draft $_.FullName })
Write-Host ("{0} drafts in {1}" -f $drafts.Count, $IssuesDir)
if ($ParseOnly) {
  foreach ($d in $drafts) {
    Write-Host ("- {0}  [{1}]" -f $d.Title, ($d.Labels -join ', '))
    [regex]::Matches($d.Body, '\]\((https://github\.com/[^)]+)\)') | ForEach-Object { Write-Host ('    ' + $_.Groups[1].Value) }
  }
  return
}

# ---------------------------------------------------------------- labels
$existingLabels = @(gh label list --repo $Repo --limit 500 --json name --jq '.[].name')
if ($LASTEXITCODE -ne 0) { throw 'gh label list failed (check gh auth status and the repository name).' }
$needed = @($drafts | ForEach-Object { $_.Labels } | Sort-Object -Unique)
foreach ($name in $needed) {
  if ($existingLabels -contains $name) { continue }
  $def = $LabelDefs[$name]
  if (-not $def) { $def = @('ededed', '') }
  if ($DryRun) { Write-Host "[dry-run] would create label '$name'"; continue }
  gh label create $name --repo $Repo --color $def[0] --description $def[1] | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not create label '$name'" }
  Write-Host "label created: $name"
}

# ---------------------------------------------------------------- issues
$existingTitles = @(gh issue list --repo $Repo --state all --limit 1000 --json title --jq '.[].title')
if ($LASTEXITCODE -ne 0) { throw 'gh issue list failed.' }
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$created = 0; $skipped = 0
foreach ($d in $drafts) {
  if ($existingTitles -contains $d.Title) { Write-Host "skip (exists): $($d.Title)"; $skipped++; continue }
  if ($DryRun) { Write-Host ("[dry-run] would create: {0}  [{1}]" -f $d.Title, ($d.Labels -join ', ')); continue }
  $bodyFile = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($bodyFile, $d.Body, $utf8NoBom)
    $ghArgs = @('issue', 'create', '--repo', $Repo, '--title', $d.Title, '--body-file', $bodyFile)
    foreach ($l in $d.Labels) { $ghArgs += @('--label', $l) }
    $url = & gh @ghArgs
    if ($LASTEXITCODE -ne 0) { throw "Could not create issue: $($d.Title)" }
    Write-Host "created: $url"
    $created++
  } finally {
    Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue
  }
}
Write-Host ("Done. Created {0}, skipped {1}." -f $created, $skipped)
