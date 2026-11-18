import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
vi.mock('electron-log', () => ({ default: { info() {}, warn() {}, error() {} }, info() {}, warn() {}, error() {} }));
// @ts-ignore plain JS module
import { buildInstallScript } from '../electron/services/drivers/DriverInstallService.js';

// Found by the VM round43 (DarkOS QEMU lab, elevated).
describe('VM round43 fixes', () => {
  it('USB media: -Label is anchored with \\z (PowerShell "$" also matched before a trailing newline)', () => {
    const ps = fs.readFileSync(path.join(__dirname, '../electron/services/darkos/usb-media.ps1'), 'utf8');
    expect(ps).toContain("[ValidatePattern('^[A-Za-z0-9_-]{1,11}\\z')]");
    expect(/^[\x00-\x7f]*$/.test(ps)).toBe(true);
  });

  it('driver job: old DarkHubDrv_* copies and the per-package copy go through the two-pass Remove-DhTree', () => {
    const s = buildInstallScript({ progressFile: 'C:\\x\\p.txt', packages: [{ id: 'a', vendor: 'nvidia', path: 'C:\\x\\a.exe', sha256: '0'.repeat(64), args: [], wait: true }] });
    expect(s).toMatch(/function Remove-DhTree/);
    expect(s).toMatch(/ForEach-Object \{ Remove-DhTree \$_\.FullName \}/);
    expect(s).toMatch(/if \(\$dir -and -not \$keepDir\) \{ Remove-DhTree \$dir \}/);
    expect(s).not.toMatch(/\[IO\.Directory\]::Delete\(\$_\.FullName, \$true\) \} catch \{ \} \}/);
  });
});
