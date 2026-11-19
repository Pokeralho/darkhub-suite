//! Pure parsing shared by the registry ops: key paths and value data, with the same rules as the JS side
//! (OptimizerUtils.js: splitRegKey, validateChange, parseDwordLike, parseBinaryLike, psValueLiteral).
//! No OS access here, so everything is testable on any platform.

use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Hive {
    Hkcu,
    Hklm,
    Hkcr,
    Hku,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RegPath {
    pub hive: Hive,
    /// Subkey without leading/trailing backslashes; empty = the hive root.
    pub sub: String,
}

pub const MAX_KEY_LEN: usize = 1000;
pub const MAX_NAME_LEN: usize = 260;

/// "HKLM\\SOFTWARE\\X" -> RegPath. Same grammar as splitRegKey: HKCU/HKLM/HKCR/HKU only, no control characters,
/// no empty path segments, trailing backslashes dropped.
pub fn split_key(key: &str) -> Option<RegPath> {
    let key = key.trim();
    if key.is_empty() || key.chars().count() > MAX_KEY_LEN {
        return None;
    }
    let (head, rest) = match key.find('\\') {
        Some(i) => (&key[..i], Some(&key[i + 1..])),
        None => (key, None),
    };
    let hive = match head.to_ascii_uppercase().as_str() {
        "HKCU" => Hive::Hkcu,
        "HKLM" => Hive::Hklm,
        "HKCR" => Hive::Hkcr,
        "HKU" => Hive::Hku,
        _ => return None,
    };
    let sub = rest.unwrap_or("").trim_end_matches('\\').to_string();
    if sub.contains(['\r', '\n', '\0']) || sub.contains("\\\\") || sub.starts_with('\\') {
        return None;
    }
    Some(RegPath { hive, sub })
}

pub fn valid_name(name: &str) -> bool {
    name.chars().count() <= MAX_NAME_LEN && !name.contains(['\r', '\n', '\0'])
}

/// Number of path segments below the hive ("SOFTWARE\\X" = 2).
pub fn depth(sub: &str) -> usize {
    if sub.is_empty() { 0 } else { sub.split('\\').count() }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegData {
    Dword(u32),
    Qword(u64),
    Sz(String),
    ExpandSz(String),
    Binary(Vec<u8>),
    MultiSz(Vec<String>),
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() { i.to_string() } else if let Some(u) = n.as_u64() { u.to_string() } else { n.to_string() }
        }
        Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

/// parseDwordLike: 1, -1, "0x1", "1", "-1" -> u32 (wrapping like `>>> 0`). Anything else -> 0 (psValueLiteral).
pub fn parse_dword(v: &Value) -> u32 {
    if let Value::Number(n) = v {
        if let Some(i) = n.as_i64() { return i as u32; }
        if let Some(u) = n.as_u64() { return u as u32; }
        if let Some(f) = n.as_f64() { return if f.is_finite() { (f.trunc() as i64) as u32 } else { 0 }; }
    }
    let s = value_to_string(v);
    let s = s.trim();
    if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        if !hex.is_empty() && hex.chars().all(|c| c.is_ascii_hexdigit()) {
            // JS parseInt(hex) >>> 0 keeps the low 32 bits of arbitrarily long input
            let tail = if hex.len() > 8 { &hex[hex.len() - 8..] } else { hex };
            return u32::from_str_radix(tail, 16).unwrap_or(0);
        }
        return 0;
    }
    let digits = s.strip_prefix('-').unwrap_or(s);
    if !digits.is_empty() && digits.chars().all(|c| c.is_ascii_digit()) {
        if let Ok(i) = s.parse::<i64>() { return i as u32; }
        if let Ok(i) = s.parse::<i128>() { return i as u32; }
    }
    0
}

/// BigInt(String(data).trim() || '0'): decimal (optionally negative) or 0x hex. Invalid -> 0.
pub fn parse_qword(v: &Value) -> u64 {
    if let Value::Number(n) = v {
        if let Some(i) = n.as_i64() { return i as u64; }
        if let Some(u) = n.as_u64() { return u; }
    }
    let s = value_to_string(v);
    let s = s.trim();
    if s.is_empty() { return 0; }
    if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        return u64::from_str_radix(hex, 16).unwrap_or(0);
    }
    if let Ok(i) = s.parse::<i64>() { return i as u64; }
    s.parse::<u64>().unwrap_or(0)
}

/// parseBinaryLike: [1, 255] or "01ff" / "01,ff" / "01 FF" (non-hex characters ignored, odd nibble dropped).
pub fn parse_binary(v: &Value) -> Vec<u8> {
    if let Value::Array(a) = v {
        return a.iter().map(|x| match x {
            Value::Number(n) => (n.as_i64().unwrap_or(0) & 0xff) as u8,
            other => (value_to_string(other).trim().parse::<i64>().unwrap_or(0) & 0xff) as u8,
        }).collect();
    }
    let hex: Vec<u8> = value_to_string(v).bytes().filter(|b| b.is_ascii_hexdigit()).collect();
    hex.chunks_exact(2)
        .map(|p| u8::from_str_radix(std::str::from_utf8(p).unwrap_or("00"), 16).unwrap_or(0))
        .collect()
}

/// REG_MULTI_SZ data: an array of strings, or "a|b|c" with empty parts dropped.
pub fn parse_multi(v: &Value) -> Vec<String> {
    match v {
        Value::Array(a) => a.iter().map(value_to_string).collect(),
        other => value_to_string(other).split('|').filter(|s| !s.is_empty()).map(str::to_string).collect(),
    }
}

/// Builds the data to write for a type name (REG_DWORD, ...). None = unknown type.
pub fn parse_data(type_name: &str, data: &Value) -> Option<RegData> {
    let t = if type_name.trim().is_empty() { "REG_SZ".to_string() } else { type_name.trim().to_ascii_uppercase() };
    Some(match t.as_str() {
        "REG_DWORD" => RegData::Dword(parse_dword(data)),
        "REG_QWORD" => RegData::Qword(parse_qword(data)),
        "REG_SZ" => RegData::Sz(value_to_string(data)),
        "REG_EXPAND_SZ" => RegData::ExpandSz(value_to_string(data)),
        "REG_BINARY" => RegData::Binary(parse_binary(data)),
        "REG_MULTI_SZ" => RegData::MultiSz(parse_multi(data)),
        _ => return None,
    })
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keys_follow_split_reg_key() {
        assert_eq!(split_key("HKLM\\SOFTWARE\\X\\"), Some(RegPath { hive: Hive::Hklm, sub: "SOFTWARE\\X".into() }));
        assert_eq!(split_key("hkcu"), Some(RegPath { hive: Hive::Hkcu, sub: String::new() }));
        assert_eq!(split_key("  HKU\\S-1-5-18 "), Some(RegPath { hive: Hive::Hku, sub: "S-1-5-18".into() }));
        assert_eq!(split_key("HKEY_LOCAL_MACHINE\\SOFTWARE"), None);
        assert_eq!(split_key("HKLM\\A\\\\B"), None);
        assert_eq!(split_key("HKLM\\A\nB"), None);
        assert_eq!(split_key("HKLM\\A\0"), None);
        assert_eq!(split_key("HKCC\\X"), None);
        assert_eq!(split_key(&format!("HKLM\\{}", "a".repeat(1000))), None);
        assert_eq!(depth(""), 0);
        assert_eq!(depth("SOFTWARE"), 1);
        assert_eq!(depth("SOFTWARE\\X"), 2);
    }

    #[test]
    fn dword_matches_parse_dword_like() {
        assert_eq!(parse_dword(&json!(1)), 1);
        assert_eq!(parse_dword(&json!(-1)), 0xffff_ffff);
        assert_eq!(parse_dword(&json!("0x1")), 1);
        assert_eq!(parse_dword(&json!("0xFFFFFFFF")), 0xffff_ffff);
        assert_eq!(parse_dword(&json!("-1")), 0xffff_ffff);
        assert_eq!(parse_dword(&json!(" 38 ")), 38);
        assert_eq!(parse_dword(&json!("4294967296")), 0);
        assert_eq!(parse_dword(&json!("abc")), 0);
        assert_eq!(parse_dword(&json!(null)), 0);
    }

    #[test]
    fn qword_binary_multi() {
        assert_eq!(parse_qword(&json!("0x10")), 16);
        assert_eq!(parse_qword(&json!("-1")), u64::MAX);
        assert_eq!(parse_qword(&json!("18446744073709551615")), u64::MAX);
        assert_eq!(parse_qword(&json!("")), 0);
        assert_eq!(parse_binary(&json!("01,ff 0A")), vec![1, 255, 10]);
        assert_eq!(parse_binary(&json!("abc")), vec![0xab]);
        assert_eq!(parse_binary(&json!([1, 256, 255])), vec![1, 0, 255]);
        assert_eq!(parse_multi(&json!("a||b|")), vec!["a", "b"]);
        assert_eq!(parse_multi(&json!(["a", "", "b"])), vec!["a", "", "b"]);
        assert_eq!(parse_data("", &json!(5)), Some(RegData::Sz("5".into())));
        assert_eq!(parse_data("reg_dword", &json!("0x10")), Some(RegData::Dword(16)));
        assert_eq!(parse_data("REG_NONE", &json!("")), None);
        assert_eq!(hex(&[0, 0xab]), "00ab");
    }
}
