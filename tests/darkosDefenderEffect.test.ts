import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The DarkOS item "sec.defender.realtimeOff" is only a policy: Windows keeps the values but ignores them while
// Tamper Protection is on. The module must check the real Defender state (fake backend here) and never report
// "applied" when real-time protection is still running.
const dir = path.resolve(__dirname, '..', 'electron', 'services', 'darkos');
const modulePath = path.join(dir, 'DarkOS.Recovery.psm1');
const catalogPath = path.join(dir, 'policy', 'catalog.json');
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

function run(defender: string | null, body: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-def-'));
  const script = [
    `$m = Import-Module ${q(modulePath)} -Force -PassThru`,
    `[void](Set-DarkOSEnvironment -Root ${q(root)} -DryRun -Mode Windows -CatalogPath ${q(catalogPath)})`,
    defender ? `& $m { $s = Load-DkFakeState; $s.defender = ${defender}; Save-DkFakeState $s }` : '',
    body
  ].filter(Boolean).join('; ');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', timeout: 90000 });
  return JSON.parse(out.trim().split(/\r?\n/).pop() as string);
}

const APPLY = `$r = @(Invoke-DarkOSChange -Id 'sec.defender.realtimeOff' -Action Apply -ConfirmSecurity)[0]; ` +
  `$reg = & $m { Invoke-Dk 'RegGet' @('LocalMachine', 'SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection', 'DisableRealtimeMonitoring') }; ` +
  `$st = @(Get-DarkOSStatus -Id 'sec.defender.realtimeOff')[0]; ` +
  `$d = & $m { Invoke-Dk 'DefenderState' @() }; ` +
  `[pscustomobject]@{ ok = $r.ok; verified = $r.verified; reason = $r.reason; error = $r.error; regWritten = ($null -ne $reg); live = $st.live; realtime = $d.realtime } | ConvertTo-Json -Compress`;

describe.skipIf(process.platform !== 'win32')('DarkOS Defender effect check', () => {
  it('refuses with a reason and writes nothing while Tamper Protection is on', () => {
    const r = run('@{ present = $true; running = $true; realtime = $true; tamper = $true }', APPLY);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('tamperProtection');
    expect(r.error).toMatch(/Violacoes/);
    expect(r.regWritten).toBe(false);
    expect(r.live).toBe(false);
  }, 100000);

  it('rolls back and says why when the policy is written but Defender keeps running', () => {
    const r = run('@{ present = $true; running = $true; realtime = $true; tamper = $false; managed = $true }', APPLY);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('noEffect');
    expect(r.regWritten).toBe(false);
    expect(r.realtime).toBe(true);
  }, 100000);

  it('reports applied only when real-time protection is really off, and the revert turns it back on', () => {
    const r = run('@{ present = $true; running = $true; realtime = $true; tamper = $false }', APPLY.replace(
      '| ConvertTo-Json -Compress',
      "| Add-Member -PassThru -NotePropertyName afterRevert -NotePropertyValue $(& { [void](Invoke-DarkOSChange -Id 'sec.defender.realtimeOff' -Action Revert); (& $m { Invoke-Dk 'DefenderState' @() }).realtime }) | ConvertTo-Json -Compress"
    ));
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.regWritten).toBe(true);
    expect(r.live).toBe(true);
    expect(r.realtime).toBe(false);
    expect(r.afterRevert).toBe(true);
  }, 100000);

  it('a PC without Defender (DarkOS image) applies the policy normally', () => {
    const r = run(null, APPLY);
    expect(r.ok).toBe(true);
    expect(r.live).toBe(true);
  }, 100000);
});
