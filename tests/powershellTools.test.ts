import { describe, it, expect, vi } from 'vitest';

// PowerShellRunner (imported transitively) pulls electron-log; stub it so the module loads in jsdom.
vi.mock('electron-log', () => ({ default: { info() {}, warn() {}, error() {} }, info() {}, warn() {}, error() {} }));

// @ts-ignore plain JS module
import * as P from '../electron/services/PowerShellToolsService.js';

describe('PowerShellTools path validation', () => {
  it('accepts only .ps1 files', () => {
    expect(P.isPs1('C:\\ProgramData\\DarkOS\\a.ps1')).toBe(true);
    expect(P.isPs1('a.PS1')).toBe(true);
    expect(P.isPs1('a.txt')).toBe(false);
    expect(P.isPs1(42 as any)).toBe(false);
  });
  it('confines scripts to the DarkOS root (no traversal, not the root itself)', () => {
    const root = 'C:\\ProgramData\\DarkOS';
    expect(P.isUnderDarkOS('C:\\ProgramData\\DarkOS\\scripts\\fix.ps1', root)).toBe(true);
    expect(P.isUnderDarkOS('C:\\ProgramData\\DarkOS\\x.ps1', root)).toBe(true);
    expect(P.isUnderDarkOS('C:\\ProgramData\\DarkOS', root)).toBe(false); // the root itself
    expect(P.isUnderDarkOS('C:\\ProgramData\\DarkOS\\..\\Other\\evil.ps1', root)).toBe(false); // traversal
    expect(P.isUnderDarkOS('C:\\Windows\\System32\\evil.ps1', root)).toBe(false); // elsewhere
    expect(P.isUnderDarkOS('C:\\ProgramData\\DarkOSEvil\\x.ps1', root)).toBe(false); // sibling prefix spoof
    expect(P.isUnderDarkOS('', root)).toBe(false);
  });
});

describe('PowerShellTools execution-policy parsing', () => {
  it('normalizes scope objects from either casing', () => {
    const scopes = P.normalizeScopes([
      { scope: 'MachinePolicy', policy: 'Undefined' },
      { Scope: 'CurrentUser', ExecutionPolicy: 'RemoteSigned' },
      { scope: '', policy: 'x' }
    ]);
    expect(scopes).toHaveLength(2);
    expect(scopes[1]).toEqual({ scope: 'CurrentUser', policy: 'RemoteSigned' });
  });
  it('resolves the effective policy by Windows precedence', () => {
    const scopes = [
      { scope: 'MachinePolicy', policy: 'Undefined' },
      { scope: 'UserPolicy', policy: 'Undefined' },
      { scope: 'Process', policy: 'Undefined' },
      { scope: 'CurrentUser', policy: 'RemoteSigned' },
      { scope: 'LocalMachine', policy: 'Restricted' }
    ];
    expect(P.effectivePolicy(scopes)).toEqual({ scope: 'CurrentUser', policy: 'RemoteSigned' });
  });
  it('lets Process override CurrentUser/LocalMachine', () => {
    const scopes = [
      { scope: 'Process', policy: 'Bypass' },
      { scope: 'CurrentUser', policy: 'RemoteSigned' },
      { scope: 'LocalMachine', policy: 'Restricted' }
    ];
    expect(P.effectivePolicy(scopes)).toEqual({ scope: 'Process', policy: 'Bypass' });
  });
  it('defaults to Restricted when every scope is Undefined', () => {
    const scopes = P.POLICY_PRECEDENCE.map((scope) => ({ scope, policy: 'Undefined' }));
    expect(P.effectivePolicy(scopes)).toEqual({ scope: 'Default', policy: 'Restricted' });
  });
});

describe('PowerShellTools signature normalization', () => {
  it('marks only Valid as trusted', () => {
    expect(P.normalizeSignature({ status: 'Valid', signer: 'CN=DarkOS' })).toEqual({ status: 'Valid', trusted: true, signer: 'CN=DarkOS' });
    expect(P.normalizeSignature({ status: 'NotSigned' }).trusted).toBe(false);
    expect(P.normalizeSignature(null)).toEqual({ status: 'Unknown', trusted: false, signer: '' });
  });
});
