// PawnIO (namazso): signed kernel driver used by LibreHardwareMonitorLib for CPU MSRs, Super I/O and SMBus.
// Installed from the author's official release with a pinned SHA-256 (redistribution terms of the setup are not
// published, so the binary is not shipped inside DarkHub). Authenticode is checked again before it runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadToFile } from '../SecureDownload.js';

export const PAWNIO = Object.freeze({
  version: '2.2.0',
  url: 'https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe',
  sha256: '1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032'
});

/** Downloads, verifies and silently installs PawnIO. `runElevated(script, ms)` -> { ok, error }. */
export async function installPawnIo(runElevated) {
  const dir = path.join(os.tmpdir(), 'darkhub-setup');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `PawnIO_setup_${PAWNIO.version}.exe`);
  try {
    await downloadToFile(PAWNIO.url, file, { expectedSha256: PAWNIO.sha256, timeoutMs: 300000 });
    const q = file.replace(/'/g, "''");
    const r = await runElevated(`$sig = Get-AuthenticodeSignature -LiteralPath '${q}'
if ($sig.Status -ne 'Valid') { throw ('Assinatura do instalador do PawnIO invalida: ' + $sig.Status) }
$p = Start-Process -FilePath '${q}' -ArgumentList '-install','-silent' -Wait -PassThru -WindowStyle Hidden
if ($p.ExitCode -ne 0 -and $p.ExitCode -ne 3010) { throw ('O instalador do PawnIO terminou com codigo ' + $p.ExitCode) }
$svc = 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\PawnIO'
for ($i = 0; $i -lt 30 -and -not (Test-Path $svc); $i++) { Start-Sleep -Seconds 1 }
if (-not (Test-Path $svc)) { throw 'O driver PawnIO nao foi registrado.' }
if ($p.ExitCode -eq 3010) { Write-Output 'DHREBOOT|1' }`, 300000);
    return r.ok ? { ok: true, reboot: /DHREBOOT\|1/.test(r.out || '') } : { ok: false, error: r.error };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    try { fs.rmSync(file, { force: true }); } catch { /* in use */ }
  }
}
