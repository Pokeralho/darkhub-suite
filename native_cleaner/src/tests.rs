//! Everything here runs in throwaway folders and, for the registry, under HKCU\Software\DarkHubCleanerTest-*.
use crate::files::{self, Opts};
use crate::safety::Env;
use crate::util::wild_match;
use crate::winapp2::{self, parse};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};

static N: AtomicU32 = AtomicU32::new(0);

fn tmp(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("dh-cleaner-{tag}-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
    let _ = fs::remove_dir_all(&d);
    fs::create_dir_all(&d).unwrap();
    d
}

fn put(p: &Path, bytes: usize) {
    fs::create_dir_all(p.parent().unwrap()).unwrap();
    fs::write(p, vec![7u8; bytes]).unwrap();
}

fn no_reg(_: &str) -> bool {
    false
}

#[test]
fn wildcard_matching() {
    assert!(wild_match("*.*", "noext"));
    assert!(wild_match("*.log", "A.LOG"));
    assert!(wild_match("thumbcache_*.db", "thumbcache_256.db"));
    assert!(wild_match("f?le.txt", "file.txt"));
    assert!(!wild_match("*.log", "a.log.txt"));
    assert!(!wild_match("a*b", "ac"));
}

#[test]
fn rules_outside_expected_folders_are_refused() {
    let base = tmp("safety");
    let env = Env::rooted(&base);
    let local = base.join("Users\\me\\AppData\\Local");
    let any = vec!["*.*".to_string()];
    assert!(env.check_rule(&local.join("App\\Cache"), &any, true).is_ok());
    assert!(env.check_rule(&local, &["*.log".into()], false).is_err(), "root itself");
    assert!(env.check_rule(&local.join("App"), &any, true).is_err(), "whole program folder");
    assert!(env.check_rule(&local.join("App"), &["*.log".into()], true).is_ok(), "logs of a program are fine");
    assert!(env.check_rule(&local.join("Temp"), &any, true).is_ok(), "temp may be emptied");
    assert!(env.check_rule(&base.join("Users\\me\\Documents\\x"), &any, true).is_err());
    assert!(env.check_rule(&base.join("Program Files\\App\\logs"), &any, true).is_err());
    assert!(env.check_rule(&local.join("App\\..\\..\\x"), &any, true).is_err());
    assert!(env.check_rule(&local.join("App\\Cache"), &["..\\*".into()], true).is_err());
    assert!(env.check_rule(&local.join("NVIDIA\\DXCache"), &any, true).is_err(), "shader cache kept");
    assert!(env.check_rule(&base.join("ProgramData\\Microsoft\\Crypto\\x"), &any, true).is_err());
    assert!(env.check_rule(&base.join("ProgramData\\Microsoft\\Windows\\WER\\ReportQueue"), &any, true).is_ok());
    assert!(env.check_rule(Path::new("\\\\server\\share\\x"), &any, true).is_err());
}

#[test]
fn winapp2_parsing_detection_and_validation() {
    let base = tmp("w2");
    let env = Env::rooted(&base);
    let local = base.join("Users\\me\\AppData\\Local");
    put(&local.join("Foo\\Cache\\a.tmp"), 10);
    put(&local.join("Foo\\Profiles\\p1\\cache2\\b.bin"), 20);
    put(&local.join("Foo\\Profiles\\p2\\cache2\\c.bin"), 30);
    put(&local.join("Foo\\Cache\\keep.dat"), 5);
    fs::create_dir_all(base.join("Users\\me\\Documents\\Foo")).unwrap();
    fs::create_dir_all(base.join("Program Files\\Foo\\logs")).unwrap();
    let ini = r#"; Version: test
[Foo *]
LangSecRef=3021
DetectFile=%LocalAppData%\Foo
Warning=cuidado
FileKey1=%LocalAppData%\Foo\Cache|*.*
FileKey2=%LocalAppData%\Foo\Profiles\*\cache2|*.*|RECURSE
FileKey3=%Documents%\Foo|*.*|RECURSE
FileKey4=%ProgramFiles%\Foo\logs|*.log
FileKey5=%LocalAppData%\Foo|*.*|RECURSE
FileKey6=%Bogus%\x|*.*
RegKey1=HKCU\Software\Foo
ExcludeKey1=FILE|%LocalAppData%\Foo\Cache\keep.dat

[Not Installed]
DetectFile=%LocalAppData%\Nope
FileKey1=%LocalAppData%\Nope\Cache|*.*

[Registry Detect]
Detect=HKCU\Software\Nope
FileKey1=%LocalAppData%\Foo\Cache|*.*
"#;
    let secs = parse(ini);
    assert_eq!(secs.len(), 3);
    let (targets, stats) = winapp2::load_all(&env, Some(ini), &no_reg);
    assert_eq!(stats["winapp2_sections"], 3);
    let foo = targets.iter().find(|t| t.id == "w2:Foo *").expect("Foo detected");
    assert_eq!(foo.name, "Foo");
    assert_eq!(foo.category, "Aplicativos");
    assert_eq!(foo.warning.as_deref(), Some("cuidado"));
    assert_eq!(foo.rules.len(), 3, "Cache + two profiles");
    assert_eq!(foo.ignored_registry, 1);
    // Documents, Program Files, whole program folder, unknown variable
    assert_eq!(foo.rejected.len(), 4, "{:?}", foo.rejected);
    assert!(!targets.iter().any(|t| t.id == "w2:Not Installed"));
    assert!(!targets.iter().any(|t| t.id == "w2:Registry Detect"));

    // dry-run counts but deletes nothing; the excluded file is kept on apply
    let r = files::run(&env, &[foo], &Opts { apply: false, shred: 0, sample: 10 });
    assert_eq!(r["total"]["files"], 3);
    assert_eq!(r["total"]["bytes"], 60);
    assert!(local.join("Foo\\Cache\\a.tmp").exists());
    let r = files::run(&env, &[foo], &Opts { apply: true, shred: 0, sample: 10 });
    assert_eq!(r["total"]["files"], 3);
    assert!(!local.join("Foo\\Cache\\a.tmp").exists());
    assert!(!local.join("Foo\\Profiles\\p1\\cache2\\b.bin").exists());
    assert!(local.join("Foo\\Cache\\keep.dat").exists());
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn protected_files_survive_and_shred_unlinks() {
    let base = tmp("shred");
    let env = Env::rooted(&base);
    let cache = base.join("Users\\me\\AppData\\Local\\App\\Cache");
    put(&cache.join("x.bin"), 3 << 20);
    put(&cache.join("Login Data"), 10);
    put(&cache.join("vault.kdbx"), 10);
    let ini = "[App]\nFileKey1=%LocalAppData%\\App\\Cache|*.*|RECURSE\n";
    let (targets, _) = winapp2::load_all(&env, Some(ini), &no_reg);
    let t = targets.iter().find(|t| t.id == "w2:App").unwrap();
    let r = files::run(&env, &[t], &Opts { apply: true, shred: 3, sample: 10 });
    assert_eq!(r["total"]["files"], 1);
    assert_eq!(r["total"]["protected"], 2);
    assert!(!cache.join("x.bin").exists());
    assert!(cache.join("Login Data").exists());
    let left: Vec<_> = fs::read_dir(&cache).unwrap().flatten().map(|e| e.file_name().to_string_lossy().to_string()).collect();
    assert!(!left.iter().any(|n| n.ends_with(".dhs")), "no renamed leftovers: {left:?}");
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn shred_overwrites_before_unlink() {
    let d = tmp("ow");
    let p = d.join("secret.txt");
    fs::write(&p, b"TOP-SECRET-TOP-SECRET").unwrap();
    // A hard link sees the same data: after shred the link must hold no trace of the old content.
    let link = d.join("link.txt");
    fs::hard_link(&p, &link).unwrap();
    files::shred_file(&p, 2).unwrap();
    assert!(!p.exists());
    let after = fs::read(&link).unwrap();
    assert!(after.is_empty(), "truncated after overwrite");
    let _ = fs::remove_dir_all(&d);
}

#[test]
fn builtin_targets_parse() {
    let secs = parse(winapp2::BUILTIN);
    assert!(secs.len() >= 8);
    for s in &secs {
        assert!(s.keys.iter().any(|(k, _)| k.starts_with("FileKey")), "{}", s.name);
    }
}

fn make_db(path: &Path) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let c = rusqlite::Connection::open(path).unwrap();
    c.execute_batch("PRAGMA journal_mode=DELETE; CREATE TABLE t(x BLOB);").unwrap();
    for _ in 0..200 {
        c.execute("INSERT INTO t VALUES (zeroblob(4000))", []).unwrap();
    }
    c.execute("DELETE FROM t WHERE rowid % 4 != 0", []).unwrap();
}

#[test]
fn browser_vacuum_shrinks_and_keeps_rows() {
    let base = tmp("vac");
    let env = Env::rooted(&base);
    put(&base.join("Chrome\\Default\\Preferences"), 2);
    make_db(&base.join("Chrome\\Default\\History"));
    make_db(&base.join("Firefox\\abc.default\\places.sqlite"));
    put(&base.join("Edge\\Default\\Preferences"), 2);
    fs::write(base.join("Edge\\Default\\History"), b"not a database").unwrap();

    let dry = crate::browsers::vacuum(&env, &[], Some(&base), false);
    assert_eq!(dry["total"]["count"], 2, "{dry}");
    assert!(dry["total"]["reclaimable"].as_u64().unwrap() > 100_000);
    let before = fs::metadata(base.join("Chrome\\Default\\History")).unwrap().len();
    let r = crate::browsers::vacuum(&env, &["chrome".into()], Some(&base), true);
    assert_eq!(r["databases"][0]["status"], "vacuumed", "{r}");
    let after = fs::metadata(base.join("Chrome\\Default\\History")).unwrap().len();
    assert!(after < before);
    let c = rusqlite::Connection::open(base.join("Chrome\\Default\\History")).unwrap();
    let n: i64 = c.query_row("SELECT count(*) FROM t", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 50);
    drop(c);

    // an open database (another process holding it) is skipped
    let held = fs::OpenOptions::new().read(true).open(base.join("Firefox\\abc.default\\places.sqlite")).unwrap();
    let r = crate::browsers::vacuum(&env, &["firefox".into()], Some(&base), true);
    assert_eq!(r["databases"][0]["status"], "in_use", "{r}");
    drop(held);
    let _ = fs::remove_dir_all(&base);
}

#[cfg(windows)]
mod reg {
    use super::*;
    use crate::registry::{self, command_target, sz, Sources};

    fn values_of(path: &str) -> Vec<(String, u32, Vec<u8>)> {
        let mut v: Vec<_> = registry::open("HKCU", path, false).unwrap().values().into_iter().map(|v| (v.name, v.kind, v.data)).collect();
        v.sort();
        v
    }

    #[test]
    fn command_lines() {
        assert_eq!(command_target("\"C:\\A B\\app.exe\" --min"), Some(PathBuf::from("C:\\A B\\app.exe")));
        assert_eq!(command_target("C:\\Tools\\x.exe -s"), Some(PathBuf::from("C:\\Tools\\x.exe")));
        assert_eq!(command_target("rundll32.exe \"C:\\x\\a.dll\",Start"), Some(PathBuf::from("C:\\x\\a.dll")));
        assert_eq!(command_target("app.exe"), None, "relative paths are not judged");
        assert_eq!(command_target("something weird"), None);
    }

    #[test]
    fn scan_backup_clean_and_restore() {
        let root = format!("{}-{}-{}", registry::TEST_PREFIX, std::process::id(), N.fetch_add(1, Ordering::Relaxed));
        let folder = tmp("startup");
        fs::write(folder.join("alive.lnk"), b"x").unwrap();
        let win = std::env::var("WINDIR").unwrap_or("C:\\Windows".into());
        let live = format!("{win}\\System32\\cmd.exe");
        let dead = format!("{win}\\DarkHubNoSuchDir\\gone.exe");

        let k = |sub: &str| registry::create("HKCU", &format!("{root}\\{sub}")).unwrap();
        let run = k("Run");
        run.set("Live", 1, &sz(&format!("\"{live}\" /c")));
        run.set("Dead", 1, &sz(&format!("\"{dead}\" --tray")));
        let shared = k("SharedDLLs");
        shared.set(&dead.replace(".exe", ".dll"), 4, &1u32.to_le_bytes());
        shared.set(&live, 4, &1u32.to_le_bytes());
        let ap = k("App Paths\\gone.exe");
        ap.set("", 1, &sz(&dead));
        ap.set("Path", 2, &sz("%WINDIR%\\DarkHubNoSuchDir"));
        ap.set("Multi", 7, &[sz("a"), sz("b\"q\\"), vec![0, 0]].concat());
        ap.set("Q", 11, &7u64.to_le_bytes());
        ap.set("Bin", 3, &(0u8..60).collect::<Vec<_>>());
        k("App Paths\\gone.exe\\Sub").set("Deep", 1, &sz("x"));
        k("App Paths\\cmd.exe").set("", 1, &sz(&live));
        let appr = k("StartupApproved\\Run");
        appr.set("Live", 3, &[2, 0, 0, 0]);
        appr.set("Ghost", 3, &[3, 0, 0, 0]);
        let folder_key = k("StartupApproved\\StartupFolder");
        folder_key.set("alive.lnk", 3, &[2, 0, 0, 0]);
        folder_key.set("gone.lnk", 3, &[2, 0, 0, 0]);

        let src = Sources::test(&format!("HKCU\\{root}"), folder.clone()).unwrap();
        let found = registry::scan(&src);
        let mut kinds: Vec<_> = found.iter().map(|f| f.kind).collect();
        kinds.sort();
        assert_eq!(kinds, vec!["app_path", "run", "shared_dll", "startup_approved", "startup_folder"], "{:?}", found.iter().map(|f| f.id()).collect::<Vec<_>>());
        let ids: Vec<String> = found.iter().map(|f| f.id()).collect();

        let before_run = values_of(&format!("{root}\\Run"));
        let before_ap = values_of(&format!("{root}\\App Paths\\gone.exe"));
        let before_shared = values_of(&format!("{root}\\SharedDLLs"));

        // dry-run leaves everything as is
        let r = registry::clean(&src, &ids, None, false).unwrap();
        assert_eq!(r["removed"], 0);
        assert_eq!(registry::scan(&src).len(), 5);

        // apply without a backup path is refused before touching anything
        assert!(registry::clean(&src, &ids, None, true).is_err());
        assert_eq!(registry::scan(&src).len(), 5);

        // an id that is not a current finding is ignored (cannot name arbitrary keys)
        let mut forged = ids.clone();
        forged.push(format!("run|HKCU\\{root}\\Run|Live"));
        let backup = folder.join("restore.reg");
        let r = registry::clean(&src, &forged, Some(&backup), true).unwrap();
        assert_eq!(r["removed"], 5, "{r}");
        assert_eq!(r["stale"], 1);
        assert!(registry::scan(&src).is_empty());
        assert!(registry::open("HKCU", &format!("{root}\\App Paths\\gone.exe"), false).is_none());
        assert_eq!(values_of(&format!("{root}\\Run")).len(), 1, "Live stays");
        let bytes = fs::read(&backup).unwrap();
        assert_eq!(&bytes[..2], &[0xFF, 0xFE]);

        // the .reg brings everything back exactly
        let st = std::process::Command::new("reg").args(["import", &backup.to_string_lossy()]).output().unwrap();
        assert!(st.status.success(), "{}", String::from_utf8_lossy(&st.stderr));
        assert_eq!(values_of(&format!("{root}\\Run")), before_run);
        assert_eq!(values_of(&format!("{root}\\App Paths\\gone.exe")), before_ap);
        assert_eq!(values_of(&format!("{root}\\SharedDLLs")), before_shared);
        assert_eq!(values_of(&format!("{root}\\App Paths\\gone.exe\\Sub")).len(), 1);
        assert_eq!(registry::scan(&src).len(), 5);

        drop((run, shared, ap, appr, folder_key));
        registry::open("HKCU", "Software", true).unwrap().delete_tree(root.trim_start_matches("Software\\"));
        let _ = fs::remove_dir_all(&folder);
    }

    #[test]
    fn test_root_is_confined() {
        assert!(Sources::test("HKCU\\Software\\Microsoft", PathBuf::new()).is_err());
        assert!(Sources::test("HKCU\\Software\\DarkHubCleanerTest\\..\\Microsoft", PathBuf::new()).is_err());
    }
}

#[test]
fn rules_aimed_at_passwords_are_refused() {
    let base = tmp("pw");
    let env = Env::rooted(&base);
    put(&base.join(r"Users\me\AppData\Roaming\Br\Profiles\p\key4.db"), 4);
    put(&base.join(r"Users\me\AppData\Roaming\Br\Profiles\p\Login Data"), 4);
    let ini = "[Br Passwords]\nFileKey1=%AppData%\\Br\\Profiles\\*|key4.db;logins.json\nFileKey2=%AppData%\\Br\\Profiles\\*|Login Data*\n";
    let (targets, _) = winapp2::load_all(&env, Some(ini), &no_reg);
    let t = targets.iter().find(|t| t.id == "w2:Br Passwords").unwrap();
    assert!(t.rules.is_empty());
    assert_eq!(t.rejected.len(), 2);
    assert!(crate::safety::is_protected_pattern("Login Data*"));
    assert!(!crate::safety::is_protected_pattern("*.db"));
    let _ = fs::remove_dir_all(&base);
}

#[test]
fn recycle_bin_is_never_touched_in_test_mode() {
    let argv: Vec<String> = ["recycle-bin", "--apply", "--test-root", "C:\nope"].iter().map(|s| s.to_string()).collect();
    let r = crate::run(&crate::Args::parse(&argv));
    assert!(matches!(r, Err(ref f) if f.code == "bad_args"));
    let base = tmp("rbt");
    let argv: Vec<String> = vec!["targets".into(), "--test-root".into(), base.to_string_lossy().into()];
    let v = crate::run(&crate::Args::parse(&argv)).unwrap();
    assert!(!v["targets"].as_array().unwrap().iter().any(|t| t["id"] == "dh:recycle-bin"));
    let _ = fs::remove_dir_all(&base);
}
