//! Registry checks (missing shared DLLs, orphan App Paths, dead Run/StartupApproved entries) and the cleanup
//! with a mandatory .reg backup: the backup is written and read back before the first key is touched; if that
//! fails nothing is deleted. Every finding is found again by a fresh scan before deletion, so the caller can
//! only choose among real findings, never name an arbitrary key.
use crate::util::{Fail, R};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use windows_sys::Win32::System::Registry::*;

const KEY_READ: u32 = 0x20019;
const KEY_ALL: u32 = 0xF003F;
const WOW64_64: u32 = 0x100;

pub struct Key(HKEY);

impl Drop for Key {
    fn drop(&mut self) {
        unsafe { RegCloseKey(self.0) };
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn hive(name: &str) -> Option<(HKEY, &'static str)> {
    match name.to_uppercase().as_str() {
        "HKCU" | "HKEY_CURRENT_USER" => Some((HKEY_CURRENT_USER, "HKEY_CURRENT_USER")),
        "HKLM" | "HKEY_LOCAL_MACHINE" => Some((HKEY_LOCAL_MACHINE, "HKEY_LOCAL_MACHINE")),
        "HKCR" | "HKEY_CLASSES_ROOT" => Some((HKEY_CLASSES_ROOT, "HKEY_CLASSES_ROOT")),
        "HKU" | "HKEY_USERS" => Some((HKEY_USERS, "HKEY_USERS")),
        _ => None,
    }
}

/// "HKCU\Software\X" → (hive, "Software\X").
pub fn split(full: &str) -> Option<(&str, &str)> {
    let (h, rest) = full.trim().trim_end_matches('\\').split_once('\\')?;
    hive(h).map(|_| (h, rest))
}

pub fn open(h: &str, path: &str, write: bool) -> Option<Key> {
    let (hk, _) = hive(h)?;
    let mut out: HKEY = std::ptr::null_mut();
    let rc = unsafe { RegOpenKeyExW(hk, wide(path).as_ptr(), 0, (if write { KEY_ALL } else { KEY_READ }) | WOW64_64, &mut out) };
    (rc == 0).then_some(Key(out))
}

pub fn exists(full: &str) -> bool {
    split(full).is_some_and(|(h, p)| open(h, p, false).is_some())
}

pub struct RegValue {
    pub name: String,
    pub kind: u32,
    pub data: Vec<u8>,
}

impl RegValue {
    /// REG_SZ / REG_EXPAND_SZ as text.
    pub fn text(&self) -> Option<String> {
        if self.kind != 1 && self.kind != 2 {
            return None;
        }
        let u: Vec<u16> = self.data.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|c| *c != 0).collect();
        Some(String::from_utf16_lossy(&u))
    }
}

impl Key {
    fn info(&self) -> (u32, u32, u32, u32, u32) {
        let (mut subs, mut max_sub, mut vals, mut max_name, mut max_data) = (0u32, 0u32, 0u32, 0u32, 0u32);
        unsafe {
            RegQueryInfoKeyW(self.0, std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null(), &mut subs, &mut max_sub, std::ptr::null_mut(), &mut vals, &mut max_name, &mut max_data, std::ptr::null_mut(), std::ptr::null_mut())
        };
        (subs, max_sub, vals, max_name, max_data)
    }

    pub fn values(&self) -> Vec<RegValue> {
        let (_, _, count, max_name, max_data) = self.info();
        let mut out = Vec::new();
        for i in 0..count {
            let mut name = vec![0u16; max_name as usize + 2];
            let mut nlen = name.len() as u32;
            let mut data = vec![0u8; max_data as usize + 2];
            let mut dlen = data.len() as u32;
            let mut kind = 0u32;
            let rc = unsafe { RegEnumValueW(self.0, i, name.as_mut_ptr(), &mut nlen, std::ptr::null(), &mut kind, data.as_mut_ptr(), &mut dlen) };
            if rc == 0 {
                data.truncate(dlen as usize);
                out.push(RegValue { name: String::from_utf16_lossy(&name[..nlen as usize]), kind, data });
            }
        }
        out
    }

    pub fn value(&self, name: &str) -> Option<RegValue> {
        self.values().into_iter().find(|v| v.name.eq_ignore_ascii_case(name))
    }

    pub fn subkeys(&self) -> Vec<String> {
        let (count, max_sub, _, _, _) = self.info();
        let mut out = Vec::new();
        for i in 0..count {
            let mut name = vec![0u16; max_sub as usize + 2];
            let mut len = name.len() as u32;
            let rc = unsafe { RegEnumKeyExW(self.0, i, name.as_mut_ptr(), &mut len, std::ptr::null(), std::ptr::null_mut(), std::ptr::null_mut(), std::ptr::null_mut()) };
            if rc == 0 {
                out.push(String::from_utf16_lossy(&name[..len as usize]));
            }
        }
        out
    }

    pub fn delete_value(&self, name: &str) -> u32 {
        unsafe { RegDeleteValueW(self.0, wide(name).as_ptr()) }
    }

    pub fn delete_tree(&self, sub: &str) -> u32 {
        unsafe { RegDeleteTreeW(self.0, wide(sub).as_ptr()) }
    }

    #[allow(dead_code)] // tests
    pub fn set(&self, name: &str, kind: u32, data: &[u8]) -> u32 {
        unsafe { RegSetValueExW(self.0, wide(name).as_ptr(), 0, kind, data.as_ptr(), data.len() as u32) }
    }
}

#[allow(dead_code)] // tests
pub fn create(h: &str, path: &str) -> Option<Key> {
    let (hk, _) = hive(h)?;
    let mut out: HKEY = std::ptr::null_mut();
    let mut disp = 0u32;
    let rc = unsafe { RegCreateKeyExW(hk, wide(path).as_ptr(), 0, std::ptr::null(), 0, KEY_ALL | WOW64_64, std::ptr::null(), &mut out, &mut disp) };
    (rc == 0).then_some(Key(out))
}

#[allow(dead_code)] // tests
pub fn sz(s: &str) -> Vec<u8> {
    wide(s).iter().flat_map(|c| c.to_le_bytes()).collect()
}

// ---------- .reg export ----------

fn esc(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

fn hex_list(prefix: &str, data: &[u8]) -> String {
    let mut s = String::from(prefix);
    for (i, b) in data.iter().enumerate() {
        if i > 0 {
            s.push(',');
            if i % 25 == 0 {
                s.push_str("\\\r\n  ");
            }
        }
        s.push_str(&format!("{b:02x}"));
    }
    s
}

pub fn value_line(v: &RegValue) -> String {
    let name = if v.name.is_empty() { "@".to_string() } else { format!("\"{}\"", esc(&v.name)) };
    let data = match v.kind {
        1 => match v.text() {
            Some(t) if !t.contains('\r') && !t.contains('\n') => format!("\"{}\"", esc(&t)),
            _ => hex_list("hex(1):", &v.data),
        },
        4 if v.data.len() == 4 => format!("dword:{:08x}", u32::from_le_bytes([v.data[0], v.data[1], v.data[2], v.data[3]])),
        3 => hex_list("hex:", &v.data),
        k => hex_list(&format!("hex({k:x}):"), &v.data),
    };
    format!("{name}={data}\r\n")
}

/// The .reg text that recreates `value` (or, when None, the whole key with its subkeys).
pub fn export(h: &str, path: &str, value: Option<&str>) -> R<String> {
    let (_, long) = hive(h).ok_or_else(|| Fail::new("bad_args", "hive inválido"))?;
    let key = open(h, path, false).ok_or_else(|| Fail::new("not_found", format!("chave não encontrada: {h}\\{path}")))?;
    let mut s = format!("[{long}\\{path}]\r\n");
    match value {
        Some(name) => {
            let v = key.value(name).ok_or_else(|| Fail::new("not_found", format!("valor não encontrado: {name}")))?;
            s.push_str(&value_line(&v));
            s.push_str("\r\n");
        }
        None => {
            for v in key.values() {
                s.push_str(&value_line(&v));
            }
            s.push_str("\r\n");
            for sub in key.subkeys() {
                s.push_str(&export(h, &format!("{path}\\{sub}"), None)?);
            }
        }
    }
    Ok(s)
}

/// Writes a regedit 5 file (UTF-16LE with BOM) and reads it back to be sure it is on disk.
pub fn write_reg_file(file: &Path, body: &str) -> R<()> {
    let text = format!("Windows Registry Editor Version 5.00\r\n\r\n{body}");
    let mut bytes = vec![0xFF, 0xFE];
    bytes.extend(text.encode_utf16().flat_map(|c| c.to_le_bytes()));
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(file, &bytes)?;
    let back = std::fs::read(file)?;
    if back != bytes {
        return Err(Fail::new("backup_failed", "o backup .reg não foi gravado corretamente"));
    }
    Ok(())
}

// ---------- scan ----------

pub struct Sources {
    pub shared_dlls: Vec<(String, String)>,
    pub app_paths: Vec<(String, String)>,
    pub run: Vec<(String, String)>,
    /// (hive, StartupApproved\Run key, matching Run key)
    pub approved_run: Vec<(String, String, String)>,
    /// (hive, StartupApproved\StartupFolder key, Startup folder)
    pub approved_folder: Vec<(String, String, PathBuf)>,
}

pub const TEST_PREFIX: &str = "Software\\DarkHubCleanerTest";

impl Sources {
    pub fn system() -> Sources {
        let cv = "SOFTWARE\\Microsoft\\Windows\\CurrentVersion";
        let w6 = "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion";
        let appr = |k: &str| format!("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\{k}");
        let s = |a: &str, b: &str| (a.to_string(), b.to_string());
        let appdata = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_default();
        let pd = std::env::var_os("ProgramData").map(PathBuf::from).unwrap_or_default();
        Sources {
            shared_dlls: vec![s("HKLM", &format!("{cv}\\SharedDLLs")), s("HKLM", &format!("{w6}\\SharedDLLs"))],
            app_paths: vec![s("HKLM", &format!("{cv}\\App Paths")), s("HKCU", &format!("{cv}\\App Paths")), s("HKLM", &format!("{w6}\\App Paths"))],
            run: vec![s("HKCU", &format!("{cv}\\Run")), s("HKCU", &format!("{cv}\\RunOnce")), s("HKLM", &format!("{cv}\\Run")), s("HKLM", &format!("{cv}\\RunOnce")), s("HKLM", &format!("{w6}\\Run"))],
            approved_run: vec![
                ("HKCU".into(), appr("Run"), format!("{cv}\\Run")),
                ("HKLM".into(), appr("Run"), format!("{cv}\\Run")),
                ("HKLM".into(), appr("Run32"), format!("{w6}\\Run")),
            ],
            approved_folder: vec![
                ("HKCU".into(), appr("StartupFolder"), appdata.join("Microsoft\\Windows\\Start Menu\\Programs\\Startup")),
                ("HKLM".into(), appr("StartupFolder"), pd.join("Microsoft\\Windows\\Start Menu\\Programs\\StartUp")),
            ],
        }
    }

    /// Same checks under a test key in HKCU (only `HKCU\Software\DarkHubCleanerTest*` is accepted).
    pub fn test(root: &str, startup_folder: PathBuf) -> R<Sources> {
        let root = root.trim_start_matches("HKCU\\").trim_start_matches("HKEY_CURRENT_USER\\");
        if !root.to_lowercase().starts_with(&TEST_PREFIX.to_lowercase()) || root.contains("..") {
            return Err(Fail::new("bad_args", format!("--root só aceita HKCU\\{TEST_PREFIX}*")));
        }
        let s = |k: &str| ("HKCU".to_string(), format!("{root}\\{k}"));
        Ok(Sources {
            shared_dlls: vec![s("SharedDLLs")],
            app_paths: vec![s("App Paths")],
            run: vec![s("Run")],
            approved_run: vec![("HKCU".into(), format!("{root}\\StartupApproved\\Run"), format!("{root}\\Run"))],
            approved_folder: vec![("HKCU".into(), format!("{root}\\StartupApproved\\StartupFolder"), startup_folder)],
        })
    }
}

pub struct Finding {
    pub kind: &'static str,
    pub hive: String,
    pub key: String,
    /// None = the whole key (App Paths entry).
    pub value: Option<String>,
    pub data: String,
    pub missing: String,
}

impl Finding {
    pub fn id(&self) -> String {
        format!("{}|{}\\{}|{}", self.kind, self.hive, self.key, self.value.as_deref().unwrap_or("*"))
    }
    pub fn to_json(&self) -> Value {
        json!({ "id": self.id(), "kind": self.kind, "hive": self.hive, "key": self.key, "value": self.value, "data": self.data, "missing": self.missing })
    }
}

fn expand_env(s: &str) -> String {
    let mut out = String::new();
    let mut rest = s;
    while let Some(i) = rest.find('%') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        match after.find('%') {
            Some(j) => {
                let var = &after[..j];
                match std::env::var(var) {
                    Ok(v) if !var.is_empty() => out.push_str(&v),
                    _ => out.push_str(&rest[i..i + j + 2]),
                }
                rest = &after[j + 1..];
            }
            None => {
                out.push_str(&rest[i..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn absolute(p: &str) -> Option<PathBuf> {
    let b = p.as_bytes();
    (b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && b[2] == b'\\').then(|| PathBuf::from(p))
}

/// The file a path refers to is missing, and its drive is present (a disconnected USB drive is not "dead").
fn missing(p: &Path, wow: bool) -> bool {
    let s = p.to_string_lossy().to_string();
    let p = if wow { PathBuf::from(s.replace("\\System32\\", "\\SysWOW64\\").replace("\\system32\\", "\\SysWOW64\\")) } else { p.to_path_buf() };
    let drive_ok = s.get(..3).is_some_and(|d| Path::new(d).exists());
    drive_ok && !p.exists()
}

/// The program a Run/App Paths command line points to, when it is an absolute path we can judge.
pub fn command_target(cmd: &str) -> Option<PathBuf> {
    let c = expand_env(cmd.trim());
    let (exe, rest) = if let Some(r) = c.strip_prefix('"') {
        let end = r.find('"')?;
        (r[..end].to_string(), r[end + 1..].to_string())
    } else {
        let low = c.to_lowercase();
        let end = [".exe", ".com", ".bat", ".cmd"].iter().filter_map(|e| low.find(e).map(|i| i + e.len())).min()?;
        (c[..end].to_string(), c[end..].to_string())
    };
    let name = exe.rsplit('\\').next().unwrap_or("").to_lowercase();
    if name == "rundll32.exe" {
        // judge the DLL instead: rundll32 "C:\x\a.dll",Entry
        let arg = rest.trim().trim_start_matches('"');
        let dll = arg.split([',', '"']).next().unwrap_or("").trim();
        return absolute(&expand_env(dll));
    }
    absolute(&exe)
}

pub fn scan(src: &Sources) -> Vec<Finding> {
    let mut out = Vec::new();
    for (h, k) in &src.shared_dlls {
        let wow = k.to_lowercase().contains("wow6432node");
        if let Some(key) = open(h, k, false) {
            for v in key.values() {
                if let Some(p) = absolute(&expand_env(&v.name)) {
                    if missing(&p, wow) {
                        out.push(Finding { kind: "shared_dll", hive: h.clone(), key: k.clone(), value: Some(v.name.clone()), data: v.name.clone(), missing: p.to_string_lossy().into() });
                    }
                }
            }
        }
    }
    for (h, k) in &src.app_paths {
        let wow = k.to_lowercase().contains("wow6432node");
        if let Some(key) = open(h, k, false) {
            for sub in key.subkeys() {
                let Some(sk) = open(h, &format!("{k}\\{sub}"), false) else { continue };
                let Some(text) = sk.value("").and_then(|v| v.text()) else { continue };
                if let Some(p) = absolute(&expand_env(text.trim().trim_matches('"'))) {
                    if missing(&p, wow) {
                        out.push(Finding { kind: "app_path", hive: h.clone(), key: format!("{k}\\{sub}"), value: None, data: text.clone(), missing: p.to_string_lossy().into() });
                    }
                }
            }
        }
    }
    for (h, k) in &src.run {
        let wow = k.to_lowercase().contains("wow6432node");
        if let Some(key) = open(h, k, false) {
            for v in key.values() {
                let Some(text) = v.text() else { continue };
                if let Some(p) = command_target(&text) {
                    if missing(&p, wow) {
                        out.push(Finding { kind: "run", hive: h.clone(), key: k.clone(), value: Some(v.name.clone()), data: text.clone(), missing: p.to_string_lossy().into() });
                    }
                }
            }
        }
    }
    for (h, appr, run) in &src.approved_run {
        let Some(key) = open(h, appr, false) else { continue };
        let names: Vec<String> = open(h, run, false).map(|r| r.values().into_iter().map(|v| v.name.to_lowercase()).collect()).unwrap_or_default();
        for v in key.values() {
            if !v.name.is_empty() && !names.contains(&v.name.to_lowercase()) {
                out.push(Finding { kind: "startup_approved", hive: h.clone(), key: appr.clone(), value: Some(v.name.clone()), data: format!("sem entrada em {h}\\{run}"), missing: v.name.clone() });
            }
        }
    }
    for (h, appr, folder) in &src.approved_folder {
        let Some(key) = open(h, appr, false) else { continue };
        if !folder.is_dir() {
            continue;
        }
        for v in key.values() {
            if !v.name.is_empty() && !v.name.contains('\\') && !folder.join(&v.name).exists() {
                out.push(Finding { kind: "startup_folder", hive: h.clone(), key: appr.clone(), value: Some(v.name.clone()), data: folder.to_string_lossy().into(), missing: folder.join(&v.name).to_string_lossy().into() });
            }
        }
    }
    out
}

/// Removes the chosen findings after writing `backup` (.reg). Dry-run returns what would be removed.
pub fn clean(src: &Sources, ids: &[String], backup: Option<&Path>, apply: bool) -> R<Value> {
    let chosen: Vec<Finding> = scan(src).into_iter().filter(|f| ids.contains(&f.id())).collect();
    let listed: Vec<Value> = chosen.iter().map(|f| f.to_json()).collect();
    let stale = ids.len() - chosen.len();
    if !apply || chosen.is_empty() {
        return Ok(json!({ "dry_run": !apply, "findings": listed, "stale": stale, "removed": 0 }));
    }
    let backup = backup.ok_or_else(|| Fail::new("bad_args", "falta --backup"))?;
    let mut body = String::new();
    for f in &chosen {
        body.push_str(&export(&f.hive, &f.key, f.value.as_deref())?);
    }
    write_reg_file(backup, &body)?;
    let mut removed = Vec::new();
    let mut failed = Vec::new();
    for f in &chosen {
        let rc = match &f.value {
            Some(v) => open(&f.hive, &f.key, true).map(|k| k.delete_value(v)).unwrap_or(5),
            None => {
                let (parent, leaf) = f.key.rsplit_once('\\').unwrap_or(("", &f.key));
                open(&f.hive, parent, true).map(|k| k.delete_tree(leaf)).unwrap_or(5)
            }
        };
        if rc == 0 {
            removed.push(f.id());
        } else {
            failed.push(json!({ "id": f.id(), "error": if rc == 5 { "acesso negado (execute como administrador)".to_string() } else { format!("erro {rc}") } }));
        }
    }
    Ok(json!({ "dry_run": false, "backup": backup.to_string_lossy(), "findings": listed, "stale": stale, "removed": removed.len(), "removed_ids": removed, "failed": failed }))
}
