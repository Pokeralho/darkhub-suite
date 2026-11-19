//! Scan and clean of file rules, with optional shredding (overwrite before unlink).
use crate::safety::{is_protected_dir, is_protected_file, norm, Env};
use crate::util::{wild_match, XorShift};
use crate::winapp2::{Rule, Target};
use serde_json::{json, Value};
use std::fs::{self, Metadata, OpenOptions};
use std::io::{self, Seek, SeekFrom, Write};
use std::path::Path;

pub fn is_reparse(md: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        md.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    md.file_type().is_symlink()
}

/// Refuses a rule folder when it, or any folder between it and the allowed root it matched, is a link or junction:
/// a literal segment like `Foo\Cache` pointing at another drive would otherwise be cleaned through the link.
/// The root itself may be a junction (e.g. %TEMP% moved to a RAM disk).
pub fn check_links(env: &Env, dir: &Path) -> Result<(), String> {
    let Some(root) = env.matched_root(dir) else { return Ok(()) }; // check_rule already refuses it
    #[cfg(not(windows))]
    {
        // Resolve the matched root's symlink before any deletion: a temp root that is a link to
        // `$HOME` or `/` (or was retargeted after the rule was built) must refuse the whole clean.
        env.check_root_target(Path::new(&root))?;
    }
    let mut cur = dir.to_path_buf();
    while norm(&cur).len() > root.len() {
        if let Ok(md) = fs::symlink_metadata(&cur) {
            if is_reparse(&md) {
                return Err(format!("link ou junção no caminho ({})", cur.to_string_lossy()));
            }
        }
        if !cur.pop() {
            break;
        }
    }
    Ok(())
}

#[derive(Default)]
pub struct Stats {
    pub files: u64,
    pub bytes: u64,
    pub locked: u64,
    pub denied: u64,
    pub protected: u64,
    pub links: u64,
    pub sample: Vec<String>,
}

pub struct Opts {
    pub apply: bool,
    pub shred: u32,
    pub sample: usize,
}

/// Overwrites the file `passes` times (random data, last pass zeros when there are two or more), flushes it to
/// disk, renames it to a random name and only then unlinks it. On SSDs the controller may keep old copies in
/// remapped blocks; this is the best a file-level tool can do.
///
/// Links are never overwritten: a symlink / junction / other reparse point, or a file with more than one hard
/// link, would carry the overwrite to data outside the cleaned folder. Those only lose this directory entry.
pub fn shred_file(path: &Path, passes: u32) -> io::Result<()> {
    {
        let Some(mut f) = open_for_shred(path)? else { return fs::remove_file(path) };
        let len = f.metadata()?.len();
        let mut rng = XorShift::seeded();
        let mut buf = vec![0u8; 1 << 20];
        for pass in 0..passes.max(1) {
            let zeros = passes >= 2 && pass == passes - 1;
            f.seek(SeekFrom::Start(0))?;
            let mut left = len;
            while left > 0 {
                let n = left.min(buf.len() as u64) as usize;
                if zeros {
                    buf[..n].fill(0);
                } else {
                    rng.fill(&mut buf[..n]);
                }
                f.write_all(&buf[..n])?;
                left -= n as u64;
            }
            f.sync_all()?;
        }
        f.set_len(0)?;
        f.sync_all()?;
    }
    let mut name = [0u8; 8];
    XorShift::seeded().fill(&mut name);
    let tmp = path.with_file_name(format!("{}.dhs", name.iter().map(|b| format!("{b:02x}")).collect::<String>()));
    fs::rename(path, &tmp)?;
    fs::remove_file(&tmp)
}

/// Opens `path` itself (not what it points to) for writing; `None` when it is a link that must not be overwritten.
#[cfg(windows)]
fn open_for_shred(path: &Path) -> io::Result<Option<fs::File>> {
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_ATTRIBUTE_REPARSE_POINT, FILE_FLAG_OPEN_REPARSE_POINT};
    let f = OpenOptions::new().write(true).custom_flags(FILE_FLAG_OPEN_REPARSE_POINT).open(path)?;
    let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    if unsafe { GetFileInformationByHandle(f.as_raw_handle() as _, &mut info) } == 0 {
        return Err(io::Error::last_os_error());
    }
    if info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 || info.nNumberOfLinks != 1 {
        return Ok(None);
    }
    Ok(Some(f))
}

#[cfg(not(windows))]
fn open_for_shred(path: &Path) -> io::Result<Option<fs::File>> {
    use std::os::unix::fs::MetadataExt;
    let md = fs::symlink_metadata(path)?;
    if md.file_type().is_symlink() || md.nlink() != 1 {
        return Ok(None);
    }
    Ok(Some(OpenOptions::new().write(true).open(path)?))
}

pub fn delete_file(path: &Path, shred: u32) -> io::Result<()> {
    let r = if shred > 0 { shred_file(path, shred) } else { fs::remove_file(path) };
    match r {
        Err(e) if e.kind() == io::ErrorKind::PermissionDenied => {
            // read-only attribute: clear it once and retry
            let md = fs::metadata(path)?;
            if !md.permissions().readonly() {
                return Err(e);
            }
            let mut p = md.permissions();
            #[allow(clippy::permissions_set_readonly_false)]
            p.set_readonly(false);
            fs::set_permissions(path, p)?;
            if shred > 0 { shred_file(path, shred) } else { fs::remove_file(path) }
        }
        other => other,
    }
}

fn walk(t: &Target, rule: &Rule, dir: &Path, depth: u32, o: &Opts, s: &mut Stats) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    let catch_all = rule.patterns.iter().any(|p| p == "*" || p == "*.*");
    for e in rd.flatten() {
        let path = e.path();
        let name = e.file_name().to_string_lossy().to_string();
        let Ok(md) = fs::symlink_metadata(&path) else { continue };
        if is_reparse(&md) {
            // never follow links/junctions: they may point outside the cleaned folder
            s.links += 1;
            continue;
        }
        if md.is_dir() {
            if !rule.recurse || depth >= 64 {
                continue;
            }
            if is_protected_dir(&name) {
                s.protected += 1;
                continue;
            }
            walk(t, rule, &path, depth + 1, o, s);
            if o.apply && catch_all && !t.excluded(&path) {
                let _ = fs::remove_dir(&path); // only succeeds when empty
            }
            continue;
        }
        if !rule.patterns.iter().any(|p| wild_match(p, &name)) {
            continue;
        }
        if is_protected_file(&name) || t.excluded(&path) {
            s.protected += 1;
            continue;
        }
        let size = md.len();
        if o.apply {
            if let Err(err) = delete_file(&path, o.shred) {
                if err.kind() == io::ErrorKind::PermissionDenied && err.raw_os_error() == Some(5) {
                    s.denied += 1;
                } else {
                    s.locked += 1;
                }
                continue;
            }
        }
        s.files += 1;
        s.bytes += size;
        if s.sample.len() < o.sample {
            s.sample.push(path.to_string_lossy().to_string());
        }
    }
}

/// Scans (apply=false) or cleans the targets. Every rule is checked against the allowed folders again here.
pub fn run(env: &Env, targets: &[&Target], o: &Opts) -> Value {
    let mut out = Vec::new();
    let mut total = Stats::default();
    for t in targets {
        let mut s = Stats::default();
        let mut refused = Vec::new();
        for rule in &t.rules {
            if let Err(why) = env.check_rule(&rule.dir, &rule.patterns, rule.recurse).and_then(|_| check_links(env, &rule.dir)) {
                refused.push(json!({ "dir": rule.dir.to_string_lossy(), "reason": why }));
                continue;
            }
            walk(t, rule, &rule.dir, 0, o, &mut s);
            if o.apply && rule.remove_self {
                let _ = fs::remove_dir(&rule.dir);
            }
        }
        total.files += s.files;
        total.bytes += s.bytes;
        total.locked += s.locked;
        total.denied += s.denied;
        total.protected += s.protected;
        total.links += s.links;
        out.push(json!({
            "id": t.id, "name": t.name, "files": s.files, "bytes": s.bytes, "locked": s.locked, "denied": s.denied,
            "protected": s.protected, "links": s.links, "sample": s.sample, "refused": refused,
        }));
    }
    json!({
        "dry_run": !o.apply, "shred": o.shred, "targets": out,
        "total": { "files": total.files, "bytes": total.bytes, "locked": total.locked, "denied": total.denied, "protected": total.protected, "links": total.links },
    })
}
