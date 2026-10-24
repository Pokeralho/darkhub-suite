// What a file or folder is, from its full path alone (no disk access): drives the Disk Map colours,
// the legend totals and the "usually safe to clean" hint. Pure and cheap; callers memoize per scan view.

export type DiskCategory = 'system' | 'programs' | 'games' | 'personal' | 'archives' | 'dev' | 'junk' | 'other';

/** Display order of the legend (most important / most actionable first). */
export const CATEGORIES: DiskCategory[] = ['system', 'programs', 'games', 'personal', 'archives', 'dev', 'junk', 'other'];

/** [lightness, chroma, hue] per category, tuned for the Frost dark canvas. Junk is the only warm, saturated one. */
const BASE: Record<DiskCategory, [number, number, number]> = {
  system: [0.33, 0.018, 255],
  programs: [0.45, 0.075, 262],
  games: [0.46, 0.095, 305],
  personal: [0.50, 0.075, 195],
  archives: [0.50, 0.075, 95],
  dev: [0.47, 0.085, 150],
  junk: [0.64, 0.155, 48],
  other: [0.40, 0.012, 255]
};

const oklch = (l: number, c: number, h: number, a?: number) => `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h}${a === undefined ? '' : ` / ${a}`})`;

/** Swatch colour (legend, list dots). */
export const CATEGORY_COLOR: Record<DiskCategory, string> = Object.fromEntries(
  CATEGORIES.map((k) => [k, oklch(...BASE[k])])
) as Record<DiskCategory, string>;

/** Treemap fill: folders are a little darker and lighten with depth so nesting still reads; files use the swatch. */
export function categoryFill(cat: DiskCategory, isDir: boolean, depth: number): string {
  const [l, c, h] = BASE[cat];
  if (!isDir) return oklch(l, c, h);
  return oklch(Math.min(l - 0.1 + depth * 0.025, l - 0.02), c * 0.75, h);
}

// ---------------------------------------------------------------- rules (all lower-case)

const VIDEO = new Set(['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv', 'm4v', 'mpg', 'mpeg', 'ts', 'm2ts', '3gp']);
const IMAGE = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'heic', 'heif', 'tif', 'tiff', 'raw', 'cr2', 'nef', 'arw', 'dng', 'psd', 'svg', 'avif']);
const AUDIO = new Set(['mp3', 'flac', 'wav', 'aac', 'ogg', 'opus', 'm4a', 'wma', 'aiff', 'alac']);
const DOCS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'txt', 'md', 'epub', 'mobi', 'csv', 'pst', 'ost']);
const ARCHIVES = new Set(['zip', '7z', 'rar', 'iso', 'img', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'cab', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'dmg']);
const JUNK_EXT = new Set(['dmp', 'mdmp', 'hdmp', 'log', 'tmp', 'temp', 'old', 'etl']);
const DEV_EXT = new Set(['pdb', 'obj', 'ilk', 'pch', 'ipch', 'tlog']);

const ROOT_SYSTEM_FILES = new Set(['pagefile.sys', 'hiberfil.sys', 'swapfile.sys', 'bootmgr', 'bootnxt', 'dumpstack.log', 'dumpstack.log.tmp']);
const ROOT_SYSTEM_DIRS = new Set(['windows', 'system volume information', 'recovery', 'boot', 'efi', '$windows.~bt', '$windows.~ws', '$winreagent', '$sysreset', '$getcurrent', 'config.msi', 'msocache', 'perflogs', 'documents and settings', '$extend']);
const ROOT_JUNK_DIRS = new Set(['windows.old', '$recycle.bin', 'recycler', 'temp', 'tmp']);
const PROGRAM_DIRS = new Set(['program files', 'program files (x86)', 'programdata']);
/** ProgramData children that belong to Windows / installers and must not be touched. */
const PROGRAMDATA_SYSTEM = new Set(['microsoft', 'package cache', 'packages', 'usoshared', 'usoprivate', 'regid.1991-06.com.microsoft', 'ssh', 'windowsholographicdevices', 'darkos']);

/** Folders under the Windows directory that Windows itself regenerates (Disk Cleanup targets). */
const WINDOWS_JUNK: string[][] = [
  ['temp'], ['prefetch'], ['minidump'], ['livekernelreports'], ['logs'], ['panther'],
  ['softwaredistribution', 'download'], ['softwaredistribution', 'deliveryoptimization'], ['downloaded program files']
];

const ANYWHERE_JUNK_DIRS = new Set([
  '$recycle.bin', 'recycler', 'temp', 'tmp', 'deliveryoptimization', 'crashdumps', 'crash reports', 'crashpad', 'reportarchive', 'reportqueue',
  'cache', 'cache2', 'caches', 'cache_data', 'code cache', 'gpucache', 'shadercache', 'dawncache', 'grshadercache', 'graphitedawncache',
  'inetcache', 'temporary internet files', 'webcache', 'd3dscache', 'dxcache', 'glcache', 'nv_cache', 'service worker'
]);
const DEV_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', '__pycache__', '.venv', 'venv', '.gradle', '.m2', '.nuget', '.cargo', '.rustup', '.next', '.nuxt',
  '.turbo', '.parcel-cache', '.pytest_cache', '.mypy_cache', '.tox', 'bower_components', '.vs', '.idea', '.angular', '.expo', '.cache',
  'npm-cache', '.pnpm-store', '.yarn', '.android', '.dotnet', 'vcpkg'
]);
const GAME_DIRS = new Set([
  'steamapps', 'steamlibrary', 'epic games', 'gog games', 'xboxgames', 'modifiablewindowsapps', 'riot games', 'rockstar games', 'ea games',
  'origin games', 'ubisoft game launcher', 'games', 'my games', 'battlestate games', 'emulators'
]);
const PERSONAL_DIRS = new Set(['documents', 'pictures', 'videos', 'music', 'desktop', 'downloads', 'onedrive', 'my documents', 'saved pictures', 'camera roll', 'screenshots']);

function startsWith(segs: string[], at: number, seq: string[]) {
  for (let k = 0; k < seq.length; k++) if (segs[at + k] !== seq[k]) return false;
  return true;
}

function extOf(name: string) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1) : '';
}

/** Path split into lower-case segments without the drive / UNC prefix: "C:\Windows\Temp" -> ["windows", "temp"]. */
export function pathSegments(fullPath: string): string[] {
  let p = String(fullPath || '').toLowerCase().replace(/\//g, '\\');
  p = p.replace(/^\\\\\?\\(unc\\)?/, '');
  if (/^[a-z]:/.test(p)) p = p.slice(2);
  else if (p.startsWith('\\\\')) p = p.replace(/^\\\\[^\\]+\\[^\\]+/, ''); // \\server\share
  return p.split('\\').filter(Boolean);
}

/**
 * Category of a file or folder from its full path. Rule order matters:
 * system-regenerated junk > Windows/system > dev > generic junk (caches, temp, *.log...) > games > programs > archives > personal > other.
 */
export function classifyPath(fullPath: string, isDir: boolean): DiskCategory {
  const segs = pathSegments(fullPath);
  if (!segs.length) return 'other';
  const name = segs[segs.length - 1];
  const ext = isDir ? '' : extOf(name);
  const top = segs[0];

  // Root of the drive
  if (segs.length === 1 && !isDir && ROOT_SYSTEM_FILES.has(name)) return 'system';
  if (ROOT_JUNK_DIRS.has(top)) return 'junk';

  // Windows directory: only the well-known regenerated folders and dump/log/tmp files are junk.
  if (top === 'windows') {
    if (WINDOWS_JUNK.some((seq) => startsWith(segs, 1, seq))) return 'junk';
    if (segs.includes('deliveryoptimization')) return 'junk';
    if (!isDir && (ext === 'dmp' || ext === 'log' || ext === 'tmp' || ext === 'etl')) return 'junk';
    return 'system';
  }
  if (ROOT_SYSTEM_DIRS.has(top)) return 'system';
  if (top === 'programdata' && segs.length > 1) {
    if (segs[1] === 'microsoft' && segs.includes('wer')) return 'junk';
    if (segs[1] === 'microsoft' && segs.includes('deliveryoptimization')) return 'junk';
    if (PROGRAMDATA_SYSTEM.has(segs[1])) return 'system';
  }

  // Development: dependency trees, VCS and build caches (before generic "cache" so node_modules\.cache stays dev).
  for (const s of segs) if (DEV_DIRS.has(s)) return 'dev';
  if (DEV_EXT.has(ext)) return 'dev';

  // Generic junk anywhere: temp, browser / GPU / shader caches, crash dumps, logs, thumbnail caches.
  for (let i = 0; i < segs.length; i++) {
    if (ANYWHERE_JUNK_DIRS.has(segs[i]) && (isDir || i < segs.length - 1)) return 'junk';
  }
  if (!isDir) {
    if (JUNK_EXT.has(ext)) return 'junk';
    if (/^(thumbcache|iconcache)_.*\.db$/.test(name)) return 'junk';
  }

  // Games (Steam usually lives under Program Files, so this comes first).
  for (const s of segs) if (GAME_DIRS.has(s)) return 'games';

  // Installed programs and application data.
  if (PROGRAM_DIRS.has(top) || segs.includes('windowsapps')) return 'programs';
  const appdata = segs.indexOf('appdata');
  if (appdata >= 0 && segs.length > appdata + 1) return 'programs';

  // Files the user brought: archives / installers, then media and documents.
  if (!isDir) {
    if (ARCHIVES.has(ext)) return 'archives';
    if (ext === 'exe' && (segs.includes('downloads') || /setup|install|installer|update/.test(name))) return 'archives';
    if (VIDEO.has(ext) || IMAGE.has(ext) || AUDIO.has(ext) || DOCS.has(ext)) return 'personal';
  }
  if (top === 'users' && segs.length > 2 && PERSONAL_DIRS.has(segs[2])) return 'personal';
  if (top !== 'users' && isDir && PERSONAL_DIRS.has(name)) return 'personal';
  return 'other';
}

/** Junk is usually safe to clean; system is not. Used for the hint and the extra warning on trash. */
export const isSafeToCleanHint = (cat: DiskCategory) => cat === 'junk';
export const isProtected = (cat: DiskCategory) => cat === 'system';

/** Joins a parent path and a child name the Windows way. */
export function joinPath(parent: string, name: string): string {
  if (!parent) return name;
  return /[\\/]$/.test(parent) ? `${parent}${name}` : `${parent}\\${name}`;
}
