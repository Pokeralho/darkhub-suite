import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Guards the status read cache in DarkOS.Recovery.psm1: under StrictMode an undeclared cache variable made every
// Invoke-Dk call outside Get-DarkOSStatus throw (apply/revert would break). Runs the real module on the fake backend.
const modulePath = path.resolve(__dirname, '..', 'electron', 'services', 'darkos', 'DarkOS.Recovery.psm1');

describe.skipIf(process.platform !== 'win32')('DarkOS module read cache', () => {
  it('Invoke-Dk works outside a status read and the cache is cleared afterwards', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-cache-'));
    const script = [
      `$m = Import-Module '${modulePath.replace(/'/g, "''")}' -Force -PassThru`,
      `[void](Set-DarkOSEnvironment -Root '${root.replace(/'/g, "''")}' -DryRun)`,
      `$before = & $m { [bool](Invoke-Dk 'IsAdmin' @()); 'invoke-ok' }`,
      `try { [void](Get-DarkOSStatus) } catch { }`,
      `$after = & $m { if ($null -eq $script:DkReadCache) { 'cache-cleared' } else { 'cache-leaked' } }`,
      `Write-Output (@($before)[-1] + '|' + $after)`
    ].join('; ');
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8', timeout: 60000 });
    expect(out.trim().split(/\r?\n/).pop()).toBe('invoke-ok|cache-cleared');
  }, 70000);
});
