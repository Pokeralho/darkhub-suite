#requires -Version 5.1
# DarkOS.Cli.ps1 - single entry point used by DarkHub Suite and provisioning.
# Usage: DarkOS.Cli.ps1 -Command <name> -ArgsJson <json> [-DryRun] [-Root <path>]
# Emits exactly one data line:  DKJSON:<compressed json>
# then a terminator:            DHDONE                 (success)
#                        or     DHFAIL|<message>       (failure)
# Progress (optional) is emitted as DKPROG:<pct>|<message> lines.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Command,
    [string]$ArgsJson = '{}',
    [switch]$DryRun,
    [string]$Root
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Write-DhLine { param([string]$Text) [Console]::Out.WriteLine($Text); [Console]::Out.Flush() }
function Write-DhFail { param([string]$Message) $m = ($Message -replace '[\r\n]+', ' '); Write-DhLine ('DHFAIL|' + $m); exit 1 }

# Local JSON compressor (module internal ConvertTo-DarkOSJson is not exported): escape non-ASCII.
function ConvertTo-CliJson {
    param($InputObject)
    $json = ConvertTo-Json -InputObject $InputObject -Depth 25 -Compress
    if ($null -eq $json) { return 'null' }
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $json.ToCharArray()) {
        if ([int]$ch -gt 127) { [void]$sb.AppendFormat('\u{0:x4}', [int]$ch) } else { [void]$sb.Append($ch) }
    }
    return $sb.ToString()
}

try {
    $modulePath = Join-Path $PSScriptRoot 'DarkOS.Recovery.psm1'
    if (-not (Test-Path -LiteralPath $modulePath)) { Write-DhFail "Modulo nao encontrado: $modulePath" }
    Import-Module $modulePath -Force -ErrorAction Stop

    $allowed = @(
        'Get-DarkOSCatalog', 'Get-DarkOSManifest', 'Get-DarkOSStatus', 'Invoke-DarkOSChange',
        'Set-DarkOSProfile', 'Restore-DarkOSProfile', 'Restore-DarkOSAppx', 'Get-DarkOSRemovedApps',
        'New-DarkOSSnapshot', 'Get-DarkOSSnapshot', 'Restore-DarkOSSnapshot', 'Get-DarkOSFailures',
        'Get-DarkOSRebootPending', 'Export-DarkOSDiagnostics', 'Initialize-DarkOSRecovery'
    )
    if ($allowed -notcontains $Command) { Write-DhFail "Comando nao permitido: $Command" }

    $parsed = @{}
    if ($ArgsJson -and $ArgsJson.Trim()) {
        $obj = ConvertFrom-Json -InputObject $ArgsJson
        foreach ($p in $obj.PSObject.Properties) { $parsed[$p.Name] = $p.Value }
    }

    # progress handler streams DKPROG lines to the host
    # Written straight to the process stdout (not the pipeline) so lines stream live and can never
    # leak into the command's return value / DKJSON payload.
    $progress = {
        param($pct, $msg)
        [Console]::Out.WriteLine(("DKPROG:{0}|{1}" -f $pct, ([string]$msg -replace '[\r\n]+', ' ')))
        [Console]::Out.Flush()
    }
    $envArgs = @{ ProgressHandler = $progress }
    if ($Root) { $envArgs.Root = $Root }
    if ($DryRun) { $envArgs.DryRun = $true }
    Set-DarkOSEnvironment @envArgs | Out-Null

    # build parameters for the target command (only pass known keys; cast arrays)
    $callArgs = @{}
    foreach ($k in $parsed.Keys) {
        $v = $parsed[$k]
        if ($v -is [System.Array]) { $callArgs[$k] = @($v) } else { $callArgs[$k] = $v }
    }
    # switches must be real [switch]
    foreach ($sw in 'ConfirmSecurity') {
        if ($callArgs.ContainsKey($sw)) { $callArgs[$sw] = [bool]$callArgs[$sw] }
    }

    # List-returning commands always serialize as a JSON array (also when empty or single item).
    $listCommands = @('Get-DarkOSCatalog', 'Get-DarkOSStatus', 'Invoke-DarkOSChange', 'Restore-DarkOSAppx',
        'Get-DarkOSRemovedApps', 'Get-DarkOSSnapshot', 'Get-DarkOSFailures')
    if ($listCommands -contains $Command) { $result = @(& $Command @callArgs) }
    else { $result = & $Command @callArgs }

    $json = ConvertTo-CliJson -InputObject $result
    Write-DhLine ('DKJSON:' + $json)
    Write-DhLine 'DHDONE'
    exit 0
} catch {
    $msg = $_.Exception.Message
    if ($_.InvocationInfo -and $_.InvocationInfo.ScriptLineNumber) { $msg = "$msg (linha $($_.InvocationInfo.ScriptLineNumber))" }
    Write-DhFail $msg
}
