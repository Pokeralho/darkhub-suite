// Filter grammar of the disk map (SpaceSniffer-compatible). Clauses are joined by ";" and must ALL match.
//   *.iso  setup?.exe     name mask (files)            \temp      folder in the path
//   >100mb  <16k          size (b, k/kb, m/mb, g/gb, t/tb)
//   m<1day  c>1year  a>2weeks   age by modified/created/accessed (s, min, h, d, w, month, y)
//   :red  :tag:r+y        tags            :class:video    file class
//   :attr:h+s  :attr:-h   attributes (r h s a c e o p; "-" = must not have)
//   |clause               negation
export const FILE_CLASSES = Object.freeze({
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mpg', 'mpeg'],
  audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'psd', 'tif', 'tiff', 'heic', 'raw', 'cr2', 'nef', 'dds'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'xz', 'zst', 'iso', 'img', 'cab', 'pak', 'vpk', 'bsa', 'ba2', 'wim', 'esd'],
  program: ['exe', 'dll', 'msi', 'msix', 'appx', 'bat', 'cmd', 'ps1', 'sys', 'ocx', 'so'],
  code: ['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'rs', 'cpp', 'c', 'h', 'cs', 'java', 'go', 'html', 'css', 'xml', 'yml', 'yaml', 'map', 'pdb', 'obj', 'lib'],
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'txt', 'md', 'csv', 'rtf', 'epub'],
  data: ['vhd', 'vhdx', 'vmdk', 'vdi', 'qcow2', 'db', 'sqlite', 'mdf', 'ldf', 'bak', 'dmp', 'log', 'etl', 'evtx', 'tmp', 'cache', 'bin', 'dat']
});

const EXT_CLASS = new Map();
for (const [cls, exts] of Object.entries(FILE_CLASSES)) for (const e of exts) if (!EXT_CLASS.has(e)) EXT_CLASS.set(e, cls);

export function classOf(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return 'other';
  return EXT_CLASS.get(name.slice(dot + 1).toLowerCase()) || 'other';
}

const SIZE_UNITS = { b: 1, k: 1024, kb: 1024, m: 1024 ** 2, mb: 1024 ** 2, g: 1024 ** 3, gb: 1024 ** 3, t: 1024 ** 4, tb: 1024 ** 4 };
const S = 1000, MIN = 60 * S, H = 60 * MIN, D = 24 * H;
const AGE_UNITS = {
  s: S, sec: S, second: S, seconds: S, min: MIN, mins: MIN, minute: MIN, minutes: MIN, h: H, hour: H, hours: H,
  d: D, day: D, days: D, w: 7 * D, week: 7 * D, weeks: 7 * D, mo: 30 * D, month: 30 * D, months: 30 * D, y: 365 * D, year: 365 * D, years: 365 * D
};
const TAGS = { r: 'red', red: 'red', y: 'yellow', yellow: 'yellow', g: 'green', green: 'green', b: 'blue', blue: 'blue' };
const ATTR_BITS = { r: 0x1, h: 0x2, s: 0x4, a: 0x20, c: 0x800, e: 0x4000, o: 0x1000, p: 0x200 };

function maskToRegExp(mask) {
  return new RegExp(`^${mask.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
}

/** Parses one clause. Returns a condition or { error }. */
export function parseClause(raw) {
  let expr = raw.trim();
  let negated = false;
  if (expr.startsWith('|')) { negated = true; expr = expr.slice(1).trim(); }
  if (!expr) return null;
  const low = expr.toLowerCase();

  const tagM = /^:(?:tag:)?([a-z+,]+)$/.exec(low);
  if (tagM && tagM[1].split(/[+,]/).every((t) => TAGS[t])) {
    return { type: 'tag', negated, tags: tagM[1].split(/[+,]/).map((t) => TAGS[t]), raw };
  }
  if (low.startsWith(':class:')) {
    const cls = low.slice(7).trim();
    if (!FILE_CLASSES[cls] && cls !== 'other') return { error: `Classe desconhecida: ${cls}` };
    return { type: 'class', negated, cls, raw };
  }
  if (low.startsWith(':attr:')) {
    let need = 0, forbid = 0;
    for (const m of low.slice(6).matchAll(/([+-]?)([a-z])/g)) {
      const bit = ATTR_BITS[m[2]];
      if (!bit) return { error: `Atributo desconhecido: ${m[2]}` };
      if (m[1] === '-') forbid |= bit; else need |= bit;
    }
    return { type: 'attr', negated, need, forbid, raw };
  }
  if (expr.startsWith('\\')) {
    const seg = expr.slice(1).replace(/\\+$/, '').trim();
    if (!seg) return { error: 'Pasta vazia' };
    return { type: 'folder', negated, re: maskToRegExp(seg.includes('*') || seg.includes('?') ? seg : `*${seg}*`), raw };
  }
  const sizeM = /^([><=])\s*(\d+(?:\.\d+)?)\s*([a-z]{0,2})$/.exec(low);
  if (sizeM && SIZE_UNITS[sizeM[3] || 'b'] !== undefined) {
    return { type: 'size', negated, op: sizeM[1], bytes: Number(sizeM[2]) * SIZE_UNITS[sizeM[3] || 'b'], raw };
  }
  const ageM = /^([cma])?\s*([><=])\s*(\d+(?:\.\d+)?)\s*([a-z]+)$/.exec(low);
  if (ageM && AGE_UNITS[ageM[4]]) {
    return { type: 'age', negated, field: ageM[1] || 'm', op: ageM[2], ms: Number(ageM[3]) * AGE_UNITS[ageM[4]], raw };
  }
  if (/^[<>=]/.test(expr)) return { error: `Condição inválida: ${expr}` };
  return { type: 'name', negated, re: maskToRegExp(expr), raw };
}

/** "a;b;|c" -> { conditions, errors }. */
export function parseFilter(query) {
  const conditions = [];
  const errors = [];
  for (const part of String(query || '').split(';')) {
    const c = parseClause(part);
    if (!c) continue;
    if (c.error) errors.push(c.error); else conditions.push(c);
  }
  return { conditions, errors };
}

/**
 * Tests one file. `file` = { name, size, mtime, ctime, atime, attr, tag, folderMatch(re) }.
 * Folder clauses are answered by the caller through folderMatch (evaluated once per folder, not per file).
 */
export function matchFile(conditions, file, now) {
  for (const c of conditions) {
    let ok;
    switch (c.type) {
      case 'name': ok = c.re.test(file.name); break;
      case 'folder': ok = file.folderMatch(c); break;
      case 'size': ok = c.op === '>' ? file.size > c.bytes : c.op === '<' ? file.size < c.bytes : file.size === c.bytes; break;
      case 'age': {
        const t = c.field === 'c' ? file.ctime : c.field === 'a' ? file.atime : file.mtime;
        const age = now - (t || file.mtime);
        ok = c.op === '>' ? age > c.ms : c.op === '<' ? age < c.ms : Math.abs(age - c.ms) < D;
        break;
      }
      case 'tag': ok = Boolean(file.tag) && c.tags.includes(file.tag); break;
      case 'class': ok = classOf(file.name) === c.cls; break;
      case 'attr': ok = (file.attr & c.need) === c.need && (file.attr & c.forbid) === 0; break;
      default: ok = true;
    }
    if (c.negated ? ok : !ok) return false;
  }
  return true;
}
