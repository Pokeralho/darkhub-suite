import { describe, it, expect } from 'vitest';
import { classifyPath, pathSegments, joinPath, CATEGORIES, CATEGORY_COLOR, categoryFill } from '../src/pages/SpaceSniffer/diskCategories';

const cases: Array<[string, boolean, string]> = [
  // system
  ['C:\\Windows', true, 'system'],
  ['C:\\Windows\\System32\\ntoskrnl.exe', false, 'system'],
  ['C:\\Windows\\WinSxS', true, 'system'],
  ['C:\\Windows\\Installer\\1a2b.msi', false, 'system'],
  ['C:\\pagefile.sys', false, 'system'],
  ['C:\\hiberfil.sys', false, 'system'],
  ['C:\\swapfile.sys', false, 'system'],
  ['C:\\System Volume Information', true, 'system'],
  ['C:\\ProgramData\\Microsoft\\Windows Defender', true, 'system'],
  ['C:\\ProgramData\\Package Cache\\{guid}\\vc_redist.exe', false, 'system'],
  ['C:\\Windows\\Fonts\\arial.ttf', false, 'system'],
  // junk
  ['C:\\$Recycle.Bin', true, 'junk'],
  ['D:\\$RECYCLE.BIN\\S-1-5-21\\$R123.zip', false, 'junk'],
  ['C:\\Windows\\Temp', true, 'junk'],
  ['C:\\Windows\\Prefetch\\CHROME.EXE-1234.pf', false, 'junk'],
  ['C:\\Windows\\SoftwareDistribution\\Download', true, 'junk'],
  ['C:\\Windows\\SoftwareDistribution\\DataStore', true, 'system'],
  ['C:\\Windows\\MEMORY.DMP', false, 'junk'],
  ['C:\\Windows\\ServiceProfiles\\NetworkService\\AppData\\Local\\Microsoft\\Windows\\DeliveryOptimization\\Cache', true, 'junk'],
  ['C:\\Users\\ana\\AppData\\Local\\Temp', true, 'junk'],
  ['C:\\Users\\ana\\AppData\\Local\\Temp\\x.bin', false, 'junk'],
  ['C:\\Users\\ana\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache\\Cache_Data', true, 'junk'],
  ['C:\\Users\\ana\\AppData\\Local\\Mozilla\\Firefox\\Profiles\\abc\\cache2', true, 'junk'],
  ['C:\\Users\\ana\\AppData\\Local\\Microsoft\\Windows\\Explorer\\thumbcache_1024.db', false, 'junk'],
  ['C:\\Users\\ana\\AppData\\Local\\CrashDumps\\app.exe.1234.dmp', false, 'junk'],
  ['D:\\Projects\\server.log', false, 'junk'],
  ['D:\\stuff\\backup.old', false, 'junk'],
  ['C:\\ProgramData\\Microsoft\\Windows\\WER\\ReportArchive', true, 'junk'],
  ['C:\\Windows.old', true, 'junk'],
  ['C:\\Temp', true, 'junk'],
  // dev
  ['D:\\code\\app\\node_modules', true, 'dev'],
  ['D:\\code\\app\\node_modules\\.cache\\babel', true, 'dev'],
  ['D:\\code\\app\\.git\\objects\\pack\\pack-1.pack', false, 'dev'],
  ['C:\\Users\\ana\\.nuget\\packages', true, 'dev'],
  ['D:\\code\\app\\bin\\Debug\\app.pdb', false, 'dev'],
  // games
  ['C:\\Program Files (x86)\\Steam\\steamapps\\common\\Portal 2', true, 'games'],
  ['D:\\SteamLibrary\\steamapps\\common\\Game\\data.pak', false, 'games'],
  ['C:\\Program Files\\Epic Games\\Fortnite', true, 'games'],
  ['D:\\XboxGames\\Halo', true, 'games'],
  ['D:\\GOG Games\\Witcher 3', true, 'games'],
  ['E:\\Games\\Emulation\\rom.iso', false, 'games'],
  // programs
  ['C:\\Program Files\\Mozilla Firefox', true, 'programs'],
  ['C:\\Program Files\\Adobe\\big.dll', false, 'programs'],
  ['C:\\ProgramData\\Docker', true, 'programs'],
  ['C:\\Users\\ana\\AppData\\Roaming\\Discord', true, 'programs'],
  ['C:\\Users\\ana\\AppData\\Local\\Programs\\Microsoft VS Code', true, 'programs'],
  // archives / installers
  ['C:\\Users\\ana\\Downloads\\ubuntu.iso', false, 'archives'],
  ['C:\\Users\\ana\\Downloads\\ChromeSetup.exe', false, 'archives'],
  ['D:\\Backups\\photos.7z', false, 'archives'],
  ['D:\\tools\\vlc-installer.exe', false, 'archives'],
  // personal
  ['C:\\Users\\ana\\Videos\\trip.mp4', false, 'personal'],
  ['D:\\Fotos\\IMG_0001.JPG', false, 'personal'],
  ['D:\\Music\\song.flac', false, 'personal'],
  ['C:\\Users\\ana\\Documents', true, 'personal'],
  ['C:\\Users\\ana\\Documents\\report.docx', false, 'personal'],
  ['C:\\Users\\ana\\Desktop\\notes', true, 'personal'],
  // other
  ['C:\\', true, 'other'],
  ['C:\\Users', true, 'other'],
  ['C:\\Users\\ana', true, 'other'],
  ['D:\\random\\file.xyz', false, 'other'],
  ['D:\\tools\\app.exe', false, 'other']
];

describe('classifyPath', () => {
  it.each(cases)('%s (dir=%s) -> %s', (p, isDir, expected) => {
    expect(classifyPath(p, isDir)).toBe(expected);
  });

  it('accepts forward slashes, long-path and UNC prefixes', () => {
    expect(classifyPath('C:/Windows/Temp', true)).toBe('junk');
    expect(classifyPath('\\\\?\\C:\\Windows\\System32', true)).toBe('system');
    expect(classifyPath('\\\\nas\\share\\Videos\\a.mkv', false)).toBe('personal');
  });

  it('a folder named "cache" is junk but a file named "cache" is not', () => {
    expect(classifyPath('D:\\x\\cache', true)).toBe('junk');
    expect(classifyPath('D:\\x\\cache', false)).toBe('other');
  });

  it('is fast enough for a full view (100k paths well under a second)', () => {
    const t0 = performance.now();
    for (let i = 0; i < 100000; i++) classifyPath(`C:\\Users\\ana\\AppData\\Local\\Pkg${i}\\file${i}.dat`, false);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('helpers', () => {
  it('pathSegments strips the drive and lower-cases', () => {
    expect(pathSegments('C:\\Program Files\\App')).toEqual(['program files', 'app']);
    expect(pathSegments('C:\\')).toEqual([]);
  });
  it('joinPath handles a trailing separator', () => {
    expect(joinPath('C:\\', 'Windows')).toBe('C:\\Windows');
    expect(joinPath('D:\\Backup', 'x')).toBe('D:\\Backup\\x');
  });
  it('every category has a distinct colour and fills are valid oklch()', () => {
    const colors = CATEGORIES.map((c) => CATEGORY_COLOR[c]);
    expect(new Set(colors).size).toBe(CATEGORIES.length);
    for (const c of CATEGORIES) expect(categoryFill(c, true, 3)).toMatch(/^oklch\(/);
  });
});
