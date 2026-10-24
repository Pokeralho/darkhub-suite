import { describe, it, expect, vi } from 'vitest';

vi.mock('electron-log', () => ({ default: { info() {}, warn() {}, error() {} }, info() {}, warn() {}, error() {} }));

// @ts-ignore plain JS module
import * as B from '../electron/services/psTools/psToolBuilders.js';
// @ts-ignore plain JS module
import { PsToolkitService } from '../electron/services/psTools/PsToolkitService.js';
// @ts-ignore plain JS module
import { isStartFolder } from '../electron/services/PowerShellToolsService.js';
import { validateParam, flagsFor, toolById, rowsToCsv as uiCsv } from '../src/components/pstools/psSchema';

describe('psTools schema validation', () => {
  it('applies defaults and validates number ranges', () => {
    const tool = B.getTool('eventLog');
    const ok = B.validateParams(tool, {});
    expect(ok.ok).toBe(true);
    expect(ok.values).toMatchObject({ log: 'System', level: 'error', hours: 24, max: 100 });
    expect(B.validateParams(tool, { hours: 0 }).errors.hours).toBe('min');
    expect(B.validateParams(tool, { max: 5000 }).errors.max).toBe('max');
    expect(B.validateParams(tool, { hours: '1.5' }).errors.hours).toBe('number');
    expect(B.validateParams(tool, { log: 'Security' }).errors.log).toBe('option');
  });
  it('requires an absolute plain folder and refuses UNC / ADS / wildcards', () => {
    const tool = B.getTool('largeFiles');
    expect(B.validateParams(tool, {}).errors.folder).toBe('required');
    expect(B.validateParams(tool, { folder: 'relative\\x' }).errors.folder).toBe('path');
    expect(B.validateParams(tool, { folder: '\\\\server\\share' }).errors.folder).toBe('path');
    expect(B.validateParams(tool, { folder: 'C:\\a:stream' }).errors.folder).toBe('path');
    expect(B.validateParams(tool, { folder: 'C:\\a*' }).errors.folder).toBe('path');
    expect(B.validateParams(tool, { folder: 'D:\\Games' }).ok).toBe(true);
  });
  it('validates the winget package id pattern', () => {
    const tool = B.getTool('wingetUpgrade');
    expect(B.validateParams(tool, { id: 'Mozilla.Firefox' }).ok).toBe(true);
    expect(B.validateParams(tool, { id: 'x; Remove-Item C:\\' }).errors.id).toBe('pattern');
  });
  it('save paths must match the extension', () => {
    const tool = B.getTool('batteryReport');
    expect(B.validateParams(tool, { outputPath: 'C:\\r\\b.txt' }).errors.outputPath).toBe('path');
    expect(B.validateParams(tool, { outputPath: 'C:\\r\\b.html' }).ok).toBe(true);
  });
  it('the renderer validator agrees with the main-process one', () => {
    const tool = toolById('largeFiles')!;
    const folder = tool.params.find((p) => p.key === 'folder')!;
    expect(validateParam(folder, '')).toBe('required');
    expect(validateParam(folder, '\\\\srv\\x')).toBe('path');
    expect(validateParam(folder, 'C:\\x')).toBeNull();
    const min = tool.params.find((p) => p.key === 'minSizeMB')!;
    expect(validateParam(min, '0')).toBe('min');
  });
});

describe('psTools plans', () => {
  it('quotes user text as a single-quoted PowerShell literal', () => {
    const r = B.buildPlan('services', { filter: "x'; Stop-Computer; '" });
    expect(r.ok).toBe(true);
    expect(r.plan.script).toContain("$q = 'x''; Stop-Computer; '''");
    expect(r.plan.admin).toBe(false);
    expect(r.plan.mutating).toBe(false);
  });
  it('flags mutating / admin runs from the parameters', () => {
    expect(B.buildPlan('cleanOldFiles', {}).plan.mutating).toBe(false); // dry run by default
    expect(B.buildPlan('cleanOldFiles', { dryRun: false }).plan.mutating).toBe(true);
    expect(B.buildPlan('sfc', {}).plan).toMatchObject({ admin: true, mutating: false });
    expect(B.buildPlan('sfc', { mode: 'scannow' }).plan).toMatchObject({ admin: true, mutating: true });
    expect(B.buildPlan('dism', { mode: 'restore' }).plan.script).toContain('/RestoreHealth');
    expect(B.buildPlan('diskHealth', { asAdmin: true }).plan.admin).toBe(true);
    expect(flagsFor(toolById('cleanOldFiles')!, { dryRun: false }).mutating).toBe(true);
  });
  it('builds winget commands as argument arrays', () => {
    const list = B.buildPlan('wingetUpgrades', { includeUnknown: true }).plan;
    expect(list.kind).toBe('cmd');
    expect(list.args).toEqual(['upgrade', '--disable-interactivity', '--include-unknown']);
    const one = B.buildPlan('wingetUpgrade', { id: 'Git.Git' }).plan;
    expect(one.args.slice(0, 4)).toEqual(['upgrade', '--id', 'Git.Git', '--exact']);
    expect(one.mutating).toBe(true);
    expect(B.buildPlan('wingetUpgrade', {}).ok).toBe(false);
  });
  it('builds include/exclude wildcard lists for file scans', () => {
    const p = B.buildPlan('largeFiles', { folder: 'D:\\Data', include: '*.iso; *.mp4', exclude: 'node_modules, *\\.git\\*', recurse: false }).plan;
    expect(p.script).toContain("$inc = @('*.iso', '*.mp4')");
    expect(p.script).toContain("$exc = @('*node_modules*', '*\\.git\\*')");
    expect(p.script).not.toContain('-Recurse');
  });
  it('refuses to clean dangerous roots', () => {
    const env = { SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\me', ProgramFiles: 'C:\\Program Files' };
    expect(B.isDangerousCleanupRoot('C:\\', env)).toBe(true);
    expect(B.isDangerousCleanupRoot('C:\\Windows\\Temp', env)).toBe(true);
    expect(B.isDangerousCleanupRoot('C:\\Program Files\\X', env)).toBe(true);
    expect(B.isDangerousCleanupRoot('C:\\Users\\me', env)).toBe(true);
    expect(B.isDangerousCleanupRoot('C:\\Users\\me\\Downloads\\old', env)).toBe(false);
    expect(B.buildPlan('cleanOldFiles', { folder: 'C:\\' }).ok).toBe(false);
  });
});

describe('psTools parsers', () => {
  it('parses winget upgrade tables in any language, ignoring spinner noise and the footer', () => {
    const text = [
      '   - \r   \\ \r',
      'Nome                     ID                   Versão    Disponível Origem',
      '---------------------------------------------------------------------------',
      'Mozilla Firefox (x64 pt) Mozilla.Firefox      128.0     129.0      winget',
      'Git                      Git.Git              2.45.0    2.46.0     winget',
      '2 atualizações disponíveis.'
    ].join('\n');
    const rows = B.parseWingetTable(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ Name: 'Mozilla Firefox (x64 pt)', Id: 'Mozilla.Firefox', Version: '128.0', Available: '129.0', Source: 'winget' });
    expect(rows[1].Id).toBe('Git.Git');
    expect(B.parseWingetTable('No installed package found.')).toEqual([]);
  });
  it('parses WLAN profile XML and only returns the key when asked', () => {
    const xml = '<WLANProfile><name>Casa &amp; Cia</name><SSIDConfig><SSID><name>CasaNet</name></SSID></SSIDConfig><connectionMode>auto</connectionMode><MSM><security><authEncryption><authentication>WPA2PSK</authentication><encryption>AES</encryption></authEncryption><sharedKey><keyMaterial>s3cret</keyMaterial></sharedKey></security></MSM></WLANProfile>';
    const p = B.parseWlanProfileXml(xml);
    expect(p).toEqual({ Name: 'Casa & Cia', SSID: 'CasaNet', Auth: 'WPA2PSK', Encryption: 'AES', ConnectionMode: 'auto' });
    expect('key' in p).toBe(false);
    expect(B.parseWlanProfileXml(xml, { withKey: true }).key).toBe('s3cret');
    expect(B.isValidWifiProfileName('Casa "x"')).toBe(false);
    expect(B.isValidWifiProfileName('Minha Rede 5G')).toBe(true);
  });
  it('parses hosts entries, disabled lines and comments', () => {
    const e = B.parseHosts('# comment\n127.0.0.1 localhost # loop\n# 0.0.0.0 ads.example.com\n\n::1 localhost');
    expect(e).toEqual([
      { line: 2, ip: '127.0.0.1', hosts: 'localhost', comment: 'loop', enabled: true },
      { line: 3, ip: '0.0.0.0', hosts: 'ads.example.com', comment: '', enabled: false },
      { line: 5, ip: '::1', hosts: 'localhost', comment: '', enabled: true }
    ]);
  });
  it('summarizes hosts diffs and writes with a backup first', () => {
    expect(B.diffLines('a\nb\n', 'a\nc\n')).toEqual({ added: ['c'], removed: ['b'] });
    const s = B.buildHostsWriteScript('C:\\Windows\\System32\\drivers\\etc\\hosts', "1.2.3.4 x # it's", '20260101-120000');
    expect(s.indexOf('Copy-Item')).toBeLessThan(s.indexOf('WriteAllText'));
    expect(s).toContain("hosts.darkhub-20260101-120000.bak'");
    expect(s).not.toContain("it's"); // content travels as base64
    expect(B.validateHostsContent('x'.repeat(1024 * 1024 + 1))).toBeTruthy();
  });
  it('exports CSV safely (quoting + formula guard) in both main and renderer', () => {
    const rows = [{ A: 'x,y', B: '=cmd()' }, { A: 'q"z', C: 5 }];
    for (const csv of [B.rowsToCsv(rows), uiCsv(rows)]) {
      const lines = csv.split(/\r?\n/);
      expect(lines[0]).toBe('A,B,C');
      expect(lines[1]).toBe('"x,y",\'=cmd(),');
      expect(lines[2]).toBe('"q""z",,5');
    }
    expect(B.rowsToText([{ Name: 'a', Size: 1 }])).toContain('Name  Size');
  });
});

describe('PsToolkitService', () => {
  const mk = (over: Record<string, unknown> = {}) => {
    const ps = vi.fn(async () => ({ code: 0, stdout: '[{"Name":"a"}]', stderr: '' }));
    const elevated = vi.fn(async () => ({ code: 0, stdout: 'ok\nDH_EXIT=0', stderr: '' }));
    const cmd = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
    const svc = new PsToolkitService({ runner: ps, elevatedRunner: elevated, cmdRunner: cmd, platform: 'win32', ...over });
    return { svc, ps, elevated, cmd };
  };
  it('runs read-only tools directly and returns rows', async () => {
    const { svc, ps } = mk();
    const r = await svc.runTool('services', {});
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([{ Name: 'a' }]);
    expect(ps).toHaveBeenCalledTimes(1);
  });
  it('refuses admin or system-changing runs until confirmed, then elevates', async () => {
    const { svc, elevated, ps } = mk();
    const r = await svc.runTool('sfc', { mode: 'scannow' });
    expect(r).toMatchObject({ ok: false, needsConfirmation: true, mutating: true });
    expect(elevated).not.toHaveBeenCalled();
    const ok = await svc.runTool('sfc', { mode: 'scannow' }, { confirm: true });
    expect(ok.ok).toBe(true);
    expect(ok.text).toBe('ok');
    expect(elevated).toHaveBeenCalledTimes(1);
    expect(ps).not.toHaveBeenCalled();
    const clean = await svc.runTool('cleanOldFiles', { folder: 'D:\\Old', dryRun: false });
    expect(clean.needsConfirmation).toBe(true);
  });
  it('reports invalid parameters without running anything', async () => {
    const { svc, ps } = mk();
    const r = await svc.runTool('largeFiles', { folder: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.errors.folder).toBe('path');
    expect(ps).not.toHaveBeenCalled();
  });
  it('needs confirmation for custom scripts and refuses empty ones', async () => {
    const spawn = vi.fn();
    const { svc } = mk({ spawnImpl: spawn });
    expect((await svc.startCustom({ script: '  ' })).ok).toBe(false);
    expect((await svc.startCustom({ script: 'Get-Date' })).needsConfirmation).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });
  it('stores snippets in the data dir (upsert by name, delete)', () => {
    const files = new Map<string, string>();
    const fsImpl: any = {
      readFileSync: (p: string) => { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p); },
      writeFileSync: (p: string, d: string) => files.set(p, d),
      renameSync: (a: string, b: string) => { files.set(b, files.get(a) as string); files.delete(a); },
      mkdirSync: () => {}, existsSync: (p: string) => files.has(p)
    };
    const { svc } = mk({ fsImpl, dataDir: 'C:\\data' });
    expect(svc.listSnippets().snippets).toEqual([]);
    expect(svc.saveSnippet({ name: '', script: 'x' }).ok).toBe(false);
    const a = svc.saveSnippet({ name: 'Temp', script: 'gci $env:TEMP' });
    expect(a.ok).toBe(true);
    const b = svc.saveSnippet({ name: 'temp', script: 'gci', elevated: true });
    expect(b.snippets).toHaveLength(1);
    expect(b.snippet.id).toBe(a.snippet.id);
    expect(b.snippet.elevated).toBe(true);
    expect(svc.deleteSnippet(a.snippet.id).snippets).toEqual([]);
  });
});

describe('elevated terminal starting folder', () => {
  it('accepts plain absolute folders only', () => {
    expect(isStartFolder('D:\\Projects\\x')).toBe(true);
    expect(isStartFolder('\\\\srv\\share')).toBe(false);
    expect(isStartFolder('C:\\a"; calc')).toBe(false);
    expect(isStartFolder('rel')).toBe(false);
  });
});
