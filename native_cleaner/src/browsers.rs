//! VACUUM of the SQLite databases kept by Chrome, Edge and Firefox. Nothing is deleted: VACUUM rebuilds the
//! file without the free pages and is atomic in SQLite. A database the browser has open is skipped (the file is
//! opened without sharing first, which fails while the browser holds it), and `quick_check` must pass.
use crate::safety::Env;
use rusqlite::{Connection, OpenFlags};
use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

const CHROMIUM_DBS: &[&str] = &["History", "Favicons", "Web Data", "Top Sites", "Shortcuts", "Network Action Predictor", "Cookies", "Network\\Cookies"];
const FIREFOX_DBS: &[&str] = &["places.sqlite", "favicons.sqlite", "cookies.sqlite", "formhistory.sqlite", "content-prefs.sqlite", "permissions.sqlite", "webappsstore.sqlite", "storage.sqlite"];

pub struct Db {
    pub browser: &'static str,
    pub profile: String,
    pub path: PathBuf,
}

fn is_sqlite(p: &Path) -> bool {
    let mut h = [0u8; 16];
    fs::File::open(p).and_then(|mut f| f.read_exact(&mut h)).is_ok() && &h == b"SQLite format 3\0"
}

fn chromium(out: &mut Vec<Db>, browser: &'static str, user_data: &Path) {
    let Ok(rd) = fs::read_dir(user_data) else { return };
    for e in rd.flatten() {
        let prof = e.path();
        // a profile folder is one with a Preferences file (Default, Profile 1, ...)
        if !prof.join("Preferences").is_file() {
            continue;
        }
        for name in CHROMIUM_DBS {
            let p = prof.join(name);
            if p.is_file() && is_sqlite(&p) {
                out.push(Db { browser, profile: e.file_name().to_string_lossy().into(), path: p });
            }
        }
    }
}

/// Finds the databases. `root` (tests) replaces the real profile folders: <root>\Chrome, <root>\Edge, <root>\Brave,
/// <root>\Firefox, <root>\Zen.
pub fn find(env: &Env, which: &[String], root: Option<&Path>) -> Vec<Db> {
    let want = |b: &str| which.is_empty() || which.iter().any(|w| w == "all" || w.eq_ignore_ascii_case(b));
    let local = env.one("localappdata").cloned().unwrap_or_default();
    let roaming = env.one("appdata").cloned().unwrap_or_default();
    let dir = |test: &str, real: PathBuf| root.map(|r| r.join(test)).unwrap_or(real);
    let mut out = Vec::new();
    for (b, test, real) in [
        ("chrome", "Chrome", local.join("Google\\Chrome\\User Data")),
        ("edge", "Edge", local.join("Microsoft\\Edge\\User Data")),
        ("brave", "Brave", local.join("BraveSoftware\\Brave-Browser\\User Data")),
    ] {
        if want(b) {
            chromium(&mut out, b, &dir(test, real));
        }
    }
    // Firefox and its forks (Zen)
    for (b, test, real) in [("firefox", "Firefox", roaming.join("Mozilla\\Firefox\\Profiles")), ("zen", "Zen", roaming.join("zen\\Profiles"))] {
        if !want(b) {
            continue;
        }
        let Ok(rd) = fs::read_dir(dir(test, real)) else { continue };
        for e in rd.flatten() {
            for name in FIREFOX_DBS {
                let p = e.path().join(name);
                if p.is_file() && is_sqlite(&p) {
                    out.push(Db { browser: b, profile: e.file_name().to_string_lossy().into(), path: p });
                }
            }
        }
    }
    out
}

/// True when another process has the file open (Windows: an exclusive open fails with a sharing violation).
fn in_use(p: &Path) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        fs::OpenOptions::new().read(true).write(true).share_mode(0).open(p).is_err()
    }
    #[cfg(not(windows))]
    {
        let _ = p;
        false
    }
}

fn file_len(p: &Path) -> u64 {
    fs::metadata(p).map(|m| m.len()).unwrap_or(0)
}

fn one(db: &Db, apply: bool) -> Value {
    let before = file_len(&db.path);
    let base = json!({ "browser": db.browser, "profile": db.profile, "path": db.path.to_string_lossy(), "bytes": before });
    let with = |extra: Value| {
        let mut v = base.clone();
        if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) {
            o.extend(e.clone());
        }
        v
    };
    if in_use(&db.path) {
        return with(json!({ "status": "in_use" }));
    }
    let flags = if apply { OpenFlags::SQLITE_OPEN_READ_WRITE } else { OpenFlags::SQLITE_OPEN_READ_ONLY };
    let conn = match Connection::open_with_flags(&db.path, flags | OpenFlags::SQLITE_OPEN_NO_MUTEX) {
        Ok(c) => c,
        Err(e) => return with(json!({ "status": "error", "error": e.to_string() })),
    };
    let _ = conn.busy_timeout(std::time::Duration::from_millis(0));
    let page: i64 = conn.query_row("PRAGMA page_size", [], |r| r.get(0)).unwrap_or(4096);
    let free: i64 = conn.query_row("PRAGMA freelist_count", [], |r| r.get(0)).unwrap_or(0);
    let reclaimable = (page * free).max(0) as u64;
    if !apply {
        return with(json!({ "status": "ok", "reclaimable": reclaimable }));
    }
    let check: String = conn.query_row("PRAGMA quick_check", [], |r| r.get(0)).unwrap_or_else(|e| e.to_string());
    if check != "ok" {
        return with(json!({ "status": "corrupt", "error": check }));
    }
    if let Err(e) = conn.execute_batch("VACUUM;") {
        let busy = e.sqlite_error_code() == Some(rusqlite::ErrorCode::DatabaseBusy) || e.sqlite_error_code() == Some(rusqlite::ErrorCode::DatabaseLocked);
        return with(json!({ "status": if busy { "in_use" } else { "error" }, "error": e.to_string() }));
    }
    drop(conn);
    let after = file_len(&db.path);
    with(json!({ "status": "vacuumed", "reclaimable": reclaimable, "after": after, "saved": before.saturating_sub(after) }))
}

pub fn vacuum(env: &Env, which: &[String], root: Option<&Path>, apply: bool) -> Value {
    let dbs = find(env, which, root);
    let items: Vec<Value> = dbs.iter().map(|d| one(d, apply)).collect();
    let sum = |k: &str| items.iter().map(|v| v[k].as_u64().unwrap_or(0)).sum::<u64>();
    let in_use = items.iter().filter(|v| v["status"] == "in_use").count();
    json!({ "dry_run": !apply, "databases": items, "total": { "count": dbs.len(), "bytes": sum("bytes"), "reclaimable": sum("reclaimable"), "saved": sum("saved"), "in_use": in_use } })
}
