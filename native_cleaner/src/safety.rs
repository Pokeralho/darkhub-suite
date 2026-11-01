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

impl Env {
    pub fn from_process() -> Env {
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

    /// Every known folder lives under `base` (tests).
    pub fn rooted(base: &Path) -> Env {
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

    pub fn one(&self, k: &str) -> Option<&PathBuf> {
        self.vars.get(k).and_then(|v| v.first())
    }

    fn roots(&self) -> Vec<Root> {
        let mut r = Vec::new();
        let mut add = |p: Option<PathBuf>, whole_ok: bool| {
            if let Some(p) = p {
                r.push(Root { path: norm(&p), whole_ok });
            }
        };
        for k in ["temp", "tmp"] {
            for p in self.vars.get(k).into_iter().flatten() {
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

    /// Ok(()) when `dir` may be cleaned with these patterns; Err(reason) otherwise.
    pub fn check_rule(&self, dir: &Path, patterns: &[String], recurse: bool) -> Result<(), String> {
        let d = norm(dir);
        if !is_plain_absolute(&d) {
            return Err("caminho não é absoluto em uma unidade local".into());
        }
        if d.split('\\').any(|s| s == ".." || s == ".") {
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
                // the most specific root wins (Temp inside LocalAppData)
                if best.is_none_or(|(bd, _, _)| depth < bd) {
                    best = Some((depth, root.whole_ok, root.path.len()));
                }
            }
        }
        let Some((depth, whole_ok, root_len)) = best else { return Err("fora das pastas permitidas (AppData, Temp, ProgramData, logs do Windows)".into()) };
        // only the part below the root counts (the user name may well be "DarkOS")
        if let Some(seg) = d[root_len..].split('\\').find(|s| PROTECTED_DIRS.contains(s)) {
            return Err(format!("pasta protegida ({seg})"));
        }
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

/// Lowercase, backslashes, no trailing separator.
pub fn norm(p: &Path) -> String {
    let s = p.to_string_lossy().replace('/', "\\").to_lowercase();
    let s = s.trim_end_matches('\\').to_string();
    if s.len() == 2 && s.ends_with(':') {
        return s + "\\";
    }
    s
}

fn is_plain_absolute(d: &str) -> bool {
    let b = d.as_bytes();
    b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'\\'
}

/// How many folders below `root` the path is (0 = the root itself).
pub fn depth_under(d: &str, root: &str) -> Option<usize> {
    if d == root {
        return Some(0);
    }
    let rest = d.strip_prefix(root)?.strip_prefix('\\')?;
    Some(rest.split('\\').filter(|s| !s.is_empty()).count())
}
