//! Where the cleaner may delete. Every rule, built-in or from winapp2.ini (downloaded, untrusted), is checked
//! here before it is scanned and again before anything is deleted.
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Known folders, by winapp2 variable name (lowercase, without %).
#[derive(Clone, Debug)]
pub struct Env {
    pub vars: HashMap<String, Vec<PathBuf>>,
}

struct Root {
    path: String,
    /// Temp-like folders: emptying the root itself is the point.
    whole_ok: bool,
}

/// File names that are never deleted, whatever the rule says: passwords, keys, bookmarks, browser state.
const PROTECTED_FILES: &[&str] = &[
    "login data", "login data-journal", "login data for account", "key3.db", "key4.db", "logins.json", "logins-backup.json",
    "bookmarks", "bookmarks.bak", "places.sqlite", "local state", "preferences", "secure preferences", "cert9.db", "wallet.dat",
    "ntuser.dat", "usrclass.dat", "desktop.ini",
];
const PROTECTED_EXT: &[&str] = &[".kdbx", ".kdb", ".pfx", ".p12", ".ovpn", ".wallet"];
/// Folder names that are never entered (shader caches are kept on purpose: rebuilding them causes stutter in games).
const PROTECTED_DIRS: &[&str] = &[
    "d3dscache", "directxshadercache", "nv_shader_cache", "nvcache", "dxcache", "glcache", "vkcache", "credentials", "protect",
    "crypto", "systemcertificates", "vault", "darkhub", "darkos", "start menu",
];

/// Resolve `.`/`..` lexically, without touching the disk.
#[cfg(not(windows))]
fn lexical_clean(p: &Path) -> PathBuf {
    use std::path::Component;
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Canonicalize as far as the disk allows: resolve symlinks on the longest existing prefix and
/// append the remaining (not-yet-existing) segments literally. `std::fs::canonicalize` fails for a
/// path that does not exist yet, which is common while validating rules; this always yields a
/// stable absolute path so a symlinked TMPDIR cannot hide its real target from the checks below.
#[cfg(not(windows))]
fn canonical_or_lexical(p: &Path) -> PathBuf {
    if let Ok(c) = std::fs::canonicalize(p) {
        return c;
    }
    let mut out = PathBuf::from("/");
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    let mut missing = false;
    for comp in p.components() {
        let seg = comp.as_os_str();
        if seg.is_empty() || seg == std::ffi::OsStr::new("/") {
            continue;
        }
        if missing {
            tail.push(seg.to_os_string());
            continue;
        }
        let candidate = out.join(seg);
        match std::fs::symlink_metadata(&candidate) {
            Ok(md) if md.file_type().is_symlink() => match std::fs::canonicalize(&candidate) {
                Ok(c) => out = c,
                Err(_) => {
                    missing = true;
                    tail.push(seg.to_os_string());
                }
            },
            Ok(_) => out = candidate,
            Err(_) => {
                missing = true;
                tail.push(seg.to_os_string());
            }
        }
    }
    for seg in tail {
        out.push(seg);
    }
    lexical_clean(&out)
}

/// Whether a canonicalized Unix path is safe to use as a cleaning root at all. Unsafe values are
/// never turned into a root (and therefore never gain `whole_ok`): the filesystem root, `$HOME`,
/// any ancestor of `$HOME`, and any ancestor of a well-known personal/system tree are rejected.
/// `/tmp`, `/var/tmp`, a user temp below `$HOME`, and a validated XDG cache all pass, since none of
/// them contain the home or a system tree.
#[cfg(not(windows))]
fn unix_root_ok(candidate: &Path, home: Option<&Path>) -> bool {
    let canon = canonical_or_lexical(candidate);
    if canon == Path::new("/") {
        return false;
    }
    // $HOME itself or one of its ancestors (e.g. `/`, `/home`).
    if let Some(h) = home.map(canonical_or_lexical) {
        if h.starts_with(&canon) {
            return false;
        }
    }
    // A root that contains personal/system trees: canonical path is an ancestor of a known
    // top-level location (so `/home` and `/var` are refused, but `/var/tmp` and `/tmp` are fine).
    const TOP: &[&str] = &[
        "home", "root", "Users", "etc", "usr", "var", "bin", "sbin", "lib", "lib64", "opt", "boot",
        "dev", "proc", "sys", "srv", "mnt", "media", "run",
    ];
    for seg in TOP {
        let sensitive = Path::new("/").join(seg);
        if sensitive.exists() && sensitive.starts_with(&canon) {
            return false;
        }
    }
    true
}

impl Env {
    pub fn from_process() -> Env {
        #[cfg(windows)]
        {
            Self::from_process_windows()
        }
        #[cfg(not(windows))]
        {
            Self::from_process_unix()
        }
    }

    #[cfg(windows)]
    fn from_process_windows() -> Env {
        let get = |k: &str| std::env::var_os(k).map(PathBuf::from);
        let profile = get("USERPROFILE").unwrap_or_else(|| PathBuf::from("C:\\Users\\Default"));
        let windir = get("WINDIR").or_else(|| get("SystemRoot")).unwrap_or_else(|| PathBuf::from("C:\\Windows"));
        let local = get("LOCALAPPDATA").unwrap_or_else(|| profile.join("AppData\\Local"));
        let mut v: HashMap<String, Vec<PathBuf>> = HashMap::new();
        let mut put = |k: &str, p: Option<PathBuf>| {
            if let Some(p) = p {
                v.entry(k.to_string()).or_default().push(p);
            }
        };
        put("userprofile", Some(profile.clone()));
        put("appdata", get("APPDATA").or_else(|| Some(profile.join("AppData\\Roaming"))));
        put("localappdata", Some(local.clone()));
        put("locallowappdata", Some(profile.join("AppData\\LocalLow")));
        put("temp", get("TEMP"));
        put("tmp", get("TMP"));
        put("windir", Some(windir.clone()));
        put("systemroot", Some(windir.clone()));
        put("systemdrive", get("SystemDrive"));
        put("homedrive", get("HOMEDRIVE"));
        put("commonappdata", get("ProgramData"));
        put("programdata", get("ProgramData"));
        put("allusersprofile", get("ProgramData"));
        put("programfiles", get("ProgramFiles"));
        put("programfiles", get("ProgramFiles(x86)"));
        put("commonprogramfiles", get("CommonProgramFiles"));
        put("commonprogramfiles", get("CommonProgramFiles(x86)"));
        put("public", get("PUBLIC"));
        put("documents", Some(profile.join("Documents")));
        put("desktop", Some(profile.join("Desktop")));
        put("pictures", Some(profile.join("Pictures")));
        put("music", Some(profile.join("Music")));
        put("video", Some(profile.join("Videos")));
        put("savedgames", Some(profile.join("Saved Games")));
        Env { vars: v }
    }

    #[cfg(not(windows))]
    fn from_process_unix() -> Env {
        let get = |k: &str| std::env::var_os(k).map(PathBuf::from);
        let home = get("HOME").unwrap_or_else(|| PathBuf::from("/tmp"));
        let cache = get("XDG_CACHE_HOME").unwrap_or_else(|| home.join(".cache"));
        let data = get("XDG_DATA_HOME").unwrap_or_else(|| home.join(".local/share"));
        let config = get("XDG_CONFIG_HOME").unwrap_or_else(|| home.join(".config"));
        let mut v: HashMap<String, Vec<PathBuf>> = HashMap::new();
        let mut put = |k: &str, p: Option<PathBuf>| {
            if let Some(p) = p {
                v.entry(k.to_string()).or_default().push(p);
            }
        };
        put("home", Some(home.clone()));
        put("userprofile", Some(home.clone()));
        put("xdg_cache_home", Some(cache.clone()));
        put("xdg_config_home", Some(config.clone()));
        put("xdg_data_home", Some(data.clone()));
        for k in ["TMPDIR", "TEMP", "TMP"] {
            put("temp", get(k));
            put("tmp", get(k));
            put(&k.to_lowercase(), get(k));
        }
        put("temp", Some(PathBuf::from("/tmp")));
        put("tmp", Some(PathBuf::from("/tmp")));
        put("var_tmp", Some(PathBuf::from("/var/tmp")));
        put("localappdata", Some(data.clone()));
        put("appdata", Some(config.clone()));
        Env { vars: v }
    }

    /// Every known folder lives under `base` (tests).
    pub fn rooted(base: &Path) -> Env {
        #[cfg(windows)]
        {
            Self::rooted_windows(base)
        }
        #[cfg(not(windows))]
        {
            Self::rooted_unix(base)
        }
    }

    #[cfg(windows)]
    fn rooted_windows(base: &Path) -> Env {
        let profile = base.join("Users\\me");
        let windir = base.join("Windows");
        let mut v: HashMap<String, Vec<PathBuf>> = HashMap::new();
        for (k, p) in [
            ("userprofile", profile.clone()),
            ("appdata", profile.join("AppData\\Roaming")),
            ("localappdata", profile.join("AppData\\Local")),
            ("locallowappdata", profile.join("AppData\\LocalLow")),
            ("temp", profile.join("AppData\\Local\\Temp")),
            ("tmp", profile.join("AppData\\Local\\Temp")),
            ("windir", windir.clone()),
            ("systemroot", windir.clone()),
            ("systemdrive", base.to_path_buf()),
            ("commonappdata", base.join("ProgramData")),
            ("programdata", base.join("ProgramData")),
            ("programfiles", base.join("Program Files")),
            ("documents", profile.join("Documents")),
        ] {
            v.entry(k.to_string()).or_default().push(p);
        }
        Env { vars: v }
    }

    #[cfg(not(windows))]
    fn rooted_unix(base: &Path) -> Env {
        let home = base.join("home/me");
        let cache = home.join(".cache");
        let data = home.join(".local/share");
        let config = home.join(".config");
        let tmp = base.join("tmp");
        let var_tmp = base.join("var/tmp");
        let mut v: HashMap<String, Vec<PathBuf>> = HashMap::new();
        for (k, p) in [
            ("home", home.clone()),
            ("userprofile", home.clone()),
            ("xdg_cache_home", cache.clone()),
            ("xdg_config_home", config.clone()),
            ("xdg_data_home", data.clone()),
            ("temp", tmp.clone()),
            ("tmp", tmp.clone()),
            ("tmpdir", tmp.clone()),
            ("var_tmp", var_tmp.clone()),
            ("localappdata", data.clone()),
            ("appdata", config.clone()),
        ] {
            v.entry(k.to_string()).or_default().push(p);
        }
        Env { vars: v }
    }

    pub fn one(&self, k: &str) -> Option<&PathBuf> {
        self.vars.get(k).and_then(|v| v.first())
    }

    fn roots(&self) -> Vec<Root> {
        #[cfg(windows)]
        {
            self.roots_windows()
        }
        #[cfg(not(windows))]
        {
            self.roots_unix()
        }
    }

    #[cfg(windows)]
    fn roots_windows(&self) -> Vec<Root> {
        let mut r = Vec::new();
        let mut add = |p: Option<PathBuf>, whole_ok: bool| {
            if let Some(p) = p {
                r.push(Root { path: norm(&p), whole_ok });
            }
        };
        // A TEMP/TMP pointed at a drive root or at a folder holding the profile or Windows would make "clean temp"
        // delete that whole tree: such a value is ignored (LOCALAPPDATA\Temp below still covers the real temp).
        let guarded: Vec<String> = ["userprofile", "localappdata", "appdata", "windir", "programdata", "programfiles"]
            .iter().filter_map(|k| self.one(k)).map(|p| norm(p)).collect();
        for k in ["temp", "tmp"] {
            for p in self.vars.get(k).into_iter().flatten() {
                let n = norm(p);
                if n.len() <= 3 || guarded.iter().any(|g| depth_under(g, &n).is_some()) { continue; }
                add(Some(p.clone()), true);
            }
        }
        add(self.one("localappdata").map(|p| p.join("Temp")), true);
        add(self.one("localappdata").map(|p| p.join("CrashDumps")), true);
        let win = self.one("windir").cloned();
        for (sub, whole) in [("Temp", true), ("SoftwareDistribution\\Download", true), ("Minidump", true), ("LiveKernelReports", true), ("Logs", false)] {
            add(win.as_ref().map(|w| w.join(sub)), whole);
        }
        add(self.one("localappdata").cloned(), false);
        add(self.one("locallowappdata").cloned(), false);
        add(self.one("appdata").cloned(), false);
        add(self.one("programdata").cloned(), false);
        r
    }

    #[cfg(not(windows))]
    fn roots_unix(&self) -> Vec<Root> {
        let mut r = Vec::new();
        let home = self.one("home").map(|p| canonical_or_lexical(p.as_path()));
        let mut add = |p: &Path| {
            let n = norm(p);
            if !r.iter().any(|x: &Root| x.path == n) {
                // Only paths that passed unix_root_ok are ever added: an arbitrary TMPDIR/TEMP/TMP
                // that points at `/`, `$HOME`, an ancestor of home or a system tree never reaches
                // this point, so untrusted env values cannot be promoted to `whole_ok`.
                r.push(Root { path: n, whole_ok: true });
            }
        };
        // System temp (`/tmp`, `/var/tmp`) and user temp variables are validated the same way;
        // a validated temp root is safe to empty.
        for k in ["temp", "tmp", "tmpdir", "var_tmp"] {
            for p in self.vars.get(k).into_iter().flatten() {
                if unix_root_ok(p, home.as_deref()) {
                    add(p);
                }
            }
        }
        // XDG cache home is handled separately: it is a cache, so a validated value may be emptied,
        // but `/` or `$HOME` are refused just like for the temp variables.
        if let Some(cache) = self.one("xdg_cache_home") {
            if unix_root_ok(cache, home.as_deref()) {
                add(cache);
            }
        }
        r
    }

    /// Re-check the resolved target of a matched root right before cleaning (Unix). A symlink may
    /// have been created or retargeted after the rule was validated; resolving it here prevents a
    /// clean from being redirected into `$HOME` or `/`.
    #[cfg(not(windows))]
    pub fn check_root_target(&self, root: &Path) -> Result<(), String> {
        let home = self.one("home").map(|p| canonical_or_lexical(p.as_path()));
        if !unix_root_ok(root, home.as_deref()) {
            return Err("raiz temporária resolve para local protegido".into());
        }
        Ok(())
    }

    /// Ok(()) when `dir` may be cleaned with these patterns; Err(reason) otherwise.
    pub fn check_rule(&self, dir: &Path, patterns: &[String], recurse: bool) -> Result<(), String> {
        let d = norm(dir);
        if !is_plain_absolute(&d) {
            #[cfg(windows)]
            { return Err("caminho não é absoluto em uma unidade local".into()); }
            #[cfg(not(windows))]
            { return Err("caminho não é absoluto".into()); }
        }
        if d.split(|c| c == '\\' || c == '/').any(|s| s == ".." || s == ".") {
            return Err("caminho com '..'".into());
        }
        for p in patterns {
            if p.is_empty() || p.contains('\\') || p.contains('/') || p.contains(':') || p.contains("..") {
                return Err(format!("padrão inválido: {p}"));
            }
        }
        let mut best: Option<(usize, bool, usize)> = None;
        for root in self.roots() {
            if let Some(depth) = depth_under(&d, &root.path) {
                // the most specific root wins (Temp inside LocalAppData / cache inside home)
                if best.is_none_or(|(bd, _, _)| depth < bd) {
                    best = Some((depth, root.whole_ok, root.path.len()));
                }
            }
        }
        let Some((depth, whole_ok, root_len)) = best else {
            #[cfg(windows)]
            { return Err("fora das pastas permitidas (AppData, Temp, ProgramData, logs do Windows)".into()); }
            #[cfg(not(windows))]
            { return Err("fora das pastas permitidas (cache/temp do usuário ou do sistema)".into()); }
        };
        // only the part below the root counts (the user name may well be "DarkOS")
        if let Some(seg) = d[root_len..].split(|c| c == '\\' || c == '/').find(|s| PROTECTED_DIRS.contains(s)) {
            return Err(format!("pasta protegida ({seg})"));
        }
        #[cfg(windows)]
        if self.denied_programdata(&d) {
            return Err("pasta do sistema em ProgramData".into());
        }
        let catch_all = patterns.iter().any(|p| p == "*" || p == "*.*");
        if !whole_ok {
            if depth == 0 {
                return Err("apagaria a pasta raiz inteira".into());
            }
            if catch_all && recurse && depth < 2 {
                return Err("apagaria a pasta inteira de um programa (só caches e logs são aceitos)".into());
            }
        }
        Ok(())
    }

    /// The most specific allowed root that contains `dir` (normalized), as `check_rule` picks it.
    pub fn matched_root(&self, dir: &Path) -> Option<String> {
        let d = norm(dir);
        self.roots().into_iter().filter_map(|r| depth_under(&d, &r.path).map(|depth| (depth, r.path))).min_by_key(|(depth, _)| *depth).map(|(_, p)| p)
    }

    #[cfg(windows)]
    fn denied_programdata(&self, d: &str) -> bool {
        let Some(pd) = self.one("programdata").map(|p| norm(p)) else { return false };
        match depth_under(d, &pd) {
            Some(n) if n >= 1 => {
                let rest = &d[pd.len() + 1..];
                let first = rest.split('\\').next().unwrap_or("");
                (first == "microsoft" && !rest.starts_with("microsoft\\windows\\wer")) || first == "packages" || first == "package cache"
            }
            _ => false,
        }
    }
}

pub fn is_protected_file(name: &str) -> bool {
    let n = name.to_lowercase();
    PROTECTED_FILES.contains(&n.as_str()) || PROTECTED_EXT.iter().any(|e| n.ends_with(e))
}

/// A pattern aimed at protected files ("Login Data*", "key4.db"). Broad ones ("*", "*.db") are not: the files
/// they would hit are still skipped one by one.
pub fn is_protected_pattern(p: &str) -> bool {
    !p.starts_with('*') && (is_protected_file(p) || PROTECTED_FILES.iter().any(|f| crate::util::wild_match(p, f)))
}

pub fn is_protected_dir(name: &str) -> bool {
    PROTECTED_DIRS.contains(&name.to_lowercase().as_str())
}

/// Lowercase, backslashes on Windows; normalized separators on Unix.
pub fn norm(p: &Path) -> String {
    #[cfg(windows)]
    {
        let s = p.to_string_lossy().replace('/', "\\").to_lowercase();
        let s = s.trim_end_matches('\\').to_string();
        if s.len() == 2 && s.ends_with(':') {
            return s + "\\";
        }
        s
    }
    #[cfg(not(windows))]
    {
        let s = p.to_string_lossy().replace('\\', "/");
        if s == "/" {
            return "/".to_string();
        }
        s.trim_end_matches('/').to_string()
    }
}

fn is_plain_absolute(d: &str) -> bool {
    #[cfg(windows)]
    {
        let b = d.as_bytes();
        b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'\\'
    }
    #[cfg(not(windows))]
    {
        d.starts_with('/')
    }
}

/// How many folders below `root` the path is (0 = the root itself).
pub fn depth_under(d: &str, root: &str) -> Option<usize> {
    if d == root {
        return Some(0);
    }
    #[cfg(windows)]
    {
        let rest = d.strip_prefix(root)?.strip_prefix('\\')?;
        Some(rest.split('\\').filter(|s| !s.is_empty()).count())
    }
    #[cfg(not(windows))]
    {
        let prefix = if root == "/" { "/".to_string() } else { format!("{root}/") };
        let rest = d.strip_prefix(&prefix)?;
        Some(rest.split('/').filter(|s| !s.is_empty()).count())
    }
}
