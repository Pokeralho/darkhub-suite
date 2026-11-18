//! Registry ops through the Win32 API, always in the 64-bit view (KEY_WOW64_64KEY), matching what the PowerShell
//! scripts did with [Microsoft.Win32.RegistryKey]::OpenBaseKey(..., Registry64).
//!
//! Read results keep the shape of buildRegistryReadScript's JSON (key, name, keyExists, exists, kind, value) so the
//! JS side parses both the same way: DWORD as a signed 32-bit number (like .NET's Int32), QWORD as a number (a string
//! when it does not fit a JS double exactly), binary as lowercase hex, multi-string joined with '|', strings unexpanded.

use crate::values::{depth, hex, RegData, RegPath};
use serde_json::{json, Value};
use std::ptr::{null, null_mut};
use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_MORE_DATA, ERROR_PATH_NOT_FOUND, ERROR_SUCCESS, WIN32_ERROR};
use windows_sys::Win32::System::Diagnostics::Debug::{FormatMessageW, FORMAT_MESSAGE_FROM_SYSTEM, FORMAT_MESSAGE_IGNORE_INSERTS};
use windows_sys::Win32::System::Registry::*;

use crate::values::Hive;

fn root(h: Hive) -> HKEY {
    match h {
        Hive::Hkcu => HKEY_CURRENT_USER,
        Hive::Hklm => HKEY_LOCAL_MACHINE,
        Hive::Hkcr => HKEY_CLASSES_ROOT,
        Hive::Hku => HKEY_USERS,
    }
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

pub fn err_text(code: WIN32_ERROR) -> String {
    let mut buf = [0u16; 512];
    let n = unsafe {
        FormatMessageW(FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS, null(), code, 0, buf.as_mut_ptr(), buf.len() as u32, null())
    };
    let text = String::from_utf16_lossy(&buf[..n as usize]);
    let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.is_empty() { format!("win32 error {code}") } else { format!("{text} (win32 {code})") }
}

fn not_found(code: WIN32_ERROR) -> bool {
    code == ERROR_FILE_NOT_FOUND || code == ERROR_PATH_NOT_FOUND
}

struct Key(HKEY);
impl Drop for Key {
    fn drop(&mut self) {
        unsafe { RegCloseKey(self.0) };
    }
}

fn open(p: &RegPath, access: u32) -> Result<Key, WIN32_ERROR> {
    let sub = wide(&p.sub);
    let mut h: HKEY = null_mut();
    let rc = unsafe { RegOpenKeyExW(root(p.hive), sub.as_ptr(), 0, access | KEY_WOW64_64KEY, &mut h) };
    if rc == ERROR_SUCCESS { Ok(Key(h)) } else { Err(rc) }
}

fn create(p: &RegPath) -> Result<Key, WIN32_ERROR> {
    let sub = wide(&p.sub);
    let mut h: HKEY = null_mut();
    let rc = unsafe {
        RegCreateKeyExW(root(p.hive), sub.as_ptr(), 0, null(), REG_OPTION_NON_VOLATILE, KEY_SET_VALUE | KEY_QUERY_VALUE | KEY_WOW64_64KEY, null(), &mut h, null_mut())
    };
    if rc == ERROR_SUCCESS { Ok(Key(h)) } else { Err(rc) }
}

/// Raw value: (type, bytes). Ok(None) = the value does not exist.
fn query_raw(k: &Key, name: &str) -> Result<Option<(u32, Vec<u8>)>, WIN32_ERROR> {
    let wname = wide(name);
    let mut size: u32 = 256;
    loop {
        let mut buf = vec![0u8; size as usize];
        let mut ty: u32 = 0;
        let mut len = size;
        let rc = unsafe { RegQueryValueExW(k.0, wname.as_ptr(), null(), &mut ty, buf.as_mut_ptr(), &mut len) };
        if rc == ERROR_SUCCESS {
            buf.truncate(len as usize);
            return Ok(Some((ty, buf)));
        }
        if not_found(rc) { return Ok(None); }
        if rc == ERROR_MORE_DATA && len > size && len <= 64 << 20 {
            size = len;
            continue;
        }
        return Err(rc);
    }
}

fn utf16(bytes: &[u8]) -> Vec<u16> {
    bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect()
}

/// REG_SZ / REG_EXPAND_SZ: up to the first NUL (like .NET).
fn decode_sz(bytes: &[u8]) -> String {
    let w = utf16(bytes);
    let end = w.iter().position(|&c| c == 0).unwrap_or(w.len());
    String::from_utf16_lossy(&w[..end])
}

/// REG_MULTI_SZ: strings until the empty terminator (like .NET's GetValue).
fn decode_multi(bytes: &[u8]) -> Vec<String> {
    let w = utf16(bytes);
    let mut out = Vec::new();
    let mut cur = Vec::new();
    for c in w {
        if c == 0 {
            if cur.is_empty() { break; }
            out.push(String::from_utf16_lossy(&cur));
            cur.clear();
        } else {
            cur.push(c);
        }
    }
    if !cur.is_empty() { out.push(String::from_utf16_lossy(&cur)); }
    out
}

const MAX_SAFE: i64 = 9_007_199_254_740_991;

fn kind_and_value(ty: u32, b: &[u8]) -> (&'static str, Value) {
    match ty {
        REG_DWORD if b.len() >= 4 => ("DWord", json!(i32::from_le_bytes([b[0], b[1], b[2], b[3]]))),
        REG_QWORD if b.len() >= 8 => {
            let v = i64::from_le_bytes(b[..8].try_into().unwrap());
            ("QWord", if (-MAX_SAFE..=MAX_SAFE).contains(&v) { json!(v) } else { json!(v.to_string()) })
        }
        REG_SZ => ("String", json!(decode_sz(b))),
        REG_EXPAND_SZ => ("ExpandString", json!(decode_sz(b))),
        REG_MULTI_SZ => ("MultiString", json!(decode_multi(b).join("|"))),
        REG_BINARY => ("Binary", json!(hex(b))),
        REG_NONE => ("None", json!(hex(b))),
        _ => ("Unknown", json!(hex(b))),
    }
}

/// { key, name, keyExists, exists, kind, value }. Errors read as "not there" (the PS script did the same).
pub fn read(key: &str, p: Option<&RegPath>, name: &str) -> Value {
    let mut r = json!({ "ok": true, "key": key, "name": name, "keyExists": false, "exists": false, "kind": null, "value": null });
    let Some(p) = p else { return r };
    let Ok(k) = open(p, KEY_QUERY_VALUE) else { return r };
    r["keyExists"] = json!(true);
    if let Ok(Some((ty, bytes))) = query_raw(&k, name) {
        let (kind, value) = kind_and_value(ty, &bytes);
        r["exists"] = json!(true);
        r["kind"] = json!(kind);
        r["value"] = value;
    }
    r
}

fn encode(data: &RegData) -> (u32, Vec<u8>) {
    let sz = |s: &str| -> Vec<u8> { s.encode_utf16().chain(std::iter::once(0)).flat_map(u16::to_le_bytes).collect() };
    match data {
        RegData::Dword(v) => (REG_DWORD, v.to_le_bytes().to_vec()),
        RegData::Qword(v) => (REG_QWORD, v.to_le_bytes().to_vec()),
        RegData::Sz(s) => (REG_SZ, sz(s)),
        RegData::ExpandSz(s) => (REG_EXPAND_SZ, sz(s)),
        RegData::Binary(b) => (REG_BINARY, b.clone()),
        RegData::MultiSz(items) => {
            let mut out: Vec<u8> = Vec::new();
            for s in items { out.extend(sz(s)); }
            out.extend([0u8, 0u8]);
            (REG_MULTI_SZ, out)
        }
    }
}

pub fn set(p: &RegPath, name: &str, data: &RegData) -> Result<(), String> {
    let k = create(p).map_err(err_text)?;
    let (ty, bytes) = encode(data);
    let wname = wide(name);
    let rc = unsafe { RegSetValueExW(k.0, wname.as_ptr(), 0, ty, bytes.as_ptr(), bytes.len() as u32) };
    if rc == ERROR_SUCCESS { Ok(()) } else { Err(err_text(rc)) }
}

/// Missing key or value is fine (DeleteValue(name, $false)).
pub fn delete_value(p: &RegPath, name: &str) -> Result<(), String> {
    let k = match open(p, KEY_SET_VALUE) {
        Ok(k) => k,
        Err(rc) if not_found(rc) => return Ok(()),
        Err(rc) => return Err(err_text(rc)),
    };
    let wname = wide(name);
    let rc = unsafe { RegDeleteValueW(k.0, wname.as_ptr()) };
    if rc == ERROR_SUCCESS || not_found(rc) { Ok(()) } else { Err(err_text(rc)) }
}

/// The key and everything below it (DeleteSubKeyTree(sub, $false)). Refuses keys directly under a hive.
pub fn delete_key(p: &RegPath) -> Result<(), String> {
    if depth(&p.sub) < 2 {
        return Err("refusing to delete a top-level registry key".into());
    }
    // RegDeleteTreeW has no view flag: open the parent in the 64-bit view and delete the leaf from there.
    let (parent, leaf) = p.sub.rsplit_once('\\').unwrap();
    let parent_path = RegPath { hive: p.hive, sub: parent.to_string() };
    let k = match open(&parent_path, KEY_ALL_ACCESS) {
        Ok(k) => k,
        Err(rc) if not_found(rc) => return Ok(()),
        Err(rc) => return Err(err_text(rc)),
    };
    let wleaf = wide(leaf);
    let rc = unsafe { RegDeleteTreeW(k.0, wleaf.as_ptr()) };
    if !(rc == ERROR_SUCCESS || not_found(rc)) { return Err(err_text(rc)); }
    let rc = unsafe { RegDeleteKeyExW(k.0, wleaf.as_ptr(), KEY_WOW64_64KEY, 0) };
    if rc == ERROR_SUCCESS || not_found(rc) { Ok(()) } else { Err(err_text(rc)) }
}

/// Deletes the key only when it has no values and no subkeys.
pub fn delete_key_if_empty(p: &RegPath) -> Result<(), String> {
    let k = match open(p, KEY_QUERY_VALUE | KEY_ENUMERATE_SUB_KEYS) {
        Ok(k) => k,
        Err(rc) if not_found(rc) => return Ok(()),
        Err(rc) => return Err(err_text(rc)),
    };
    let (mut subkeys, mut values) = (0u32, 0u32);
    let rc = unsafe {
        RegQueryInfoKeyW(k.0, null_mut(), null_mut(), null(), &mut subkeys, null_mut(), null_mut(), &mut values, null_mut(), null_mut(), null_mut(), null_mut())
    };
    drop(k);
    if rc != ERROR_SUCCESS { return Err(err_text(rc)); }
    if subkeys != 0 || values != 0 { return Ok(()); }
    let sub = wide(&p.sub);
    let rc = unsafe { RegDeleteKeyExW(root(p.hive), sub.as_ptr(), KEY_WOW64_64KEY, 0) };
    if rc == ERROR_SUCCESS || not_found(rc) { Ok(()) } else { Err(err_text(rc)) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::values::{parse_data, split_key};

    const BASE: &str = "HKCU\\Software\\DarkHub-SysOpsTest-unit";

    fn p(s: &str) -> RegPath { split_key(s).unwrap() }

    #[test]
    fn roundtrip_every_type_in_hkcu() {
        let k = format!("{BASE}\\rt");
        let _ = delete_key(&p(BASE));
        let cases = [
            ("d", "REG_DWORD", json!("0xffffffff"), "DWord", json!(-1)),
            ("q", "REG_QWORD", json!("9007199254740993"), "QWord", json!("9007199254740993")),
            ("q2", "REG_QWORD", json!(42), "QWord", json!(42)),
            ("s", "REG_SZ", json!("olá"), "String", json!("olá")),
            ("e", "REG_EXPAND_SZ", json!("%SystemRoot%\\x"), "ExpandString", json!("%SystemRoot%\\x")),
            ("b", "REG_BINARY", json!("00ff10"), "Binary", json!("00ff10")),
            ("m", "REG_MULTI_SZ", json!("a|b"), "MultiString", json!("a|b")),
            ("", "REG_SZ", json!("default"), "String", json!("default")),
        ];
        for (name, ty, data, kind, value) in cases {
            set(&p(&k), name, &parse_data(ty, &data).unwrap()).unwrap();
            let r = read(&k, Some(&p(&k)), name);
            assert_eq!(r["exists"], json!(true), "{name}");
            assert_eq!(r["kind"], json!(kind), "{name}");
            assert_eq!(r["value"], value, "{name}");
        }
        // names are case-insensitive, like the registry
        assert_eq!(read(&k, Some(&p(&k)), "D")["exists"], json!(true));
        delete_value(&p(&k), "d").unwrap();
        delete_value(&p(&k), "d").unwrap();
        assert_eq!(read(&k, Some(&p(&k)), "d")["exists"], json!(false));
        assert_eq!(read(&k, Some(&p(&k)), "d")["keyExists"], json!(true));

        // not empty: kept
        delete_key_if_empty(&p(&k)).unwrap();
        assert_eq!(read(&k, Some(&p(&k)), "s")["keyExists"], json!(true));
        let empty = format!("{BASE}\\empty");
        set(&p(&empty), "x", &RegData::Dword(1)).unwrap();
        delete_value(&p(&empty), "x").unwrap();
        delete_key_if_empty(&p(&empty)).unwrap();
        assert_eq!(read(&empty, Some(&p(&empty)), "x")["keyExists"], json!(false));

        delete_key(&p(BASE)).unwrap();
        assert_eq!(read(&k, Some(&p(&k)), "s")["keyExists"], json!(false));
        delete_key(&p(BASE)).unwrap();
        delete_value(&p(&k), "s").unwrap();
        delete_key_if_empty(&p(&k)).unwrap();
        assert!(delete_key(&p("HKCU\\Software")).is_err());
    }
}
