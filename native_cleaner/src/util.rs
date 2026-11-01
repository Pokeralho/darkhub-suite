//! Errors and JSON output shared by every command.
use serde_json::Value;
use std::io::{self, Write};

#[derive(Debug)]
pub struct Fail {
    pub code: &'static str,
    pub msg: String,
}

impl Fail {
    pub fn new(code: &'static str, msg: impl Into<String>) -> Self {
        Self { code, msg: msg.into() }
    }
}

impl From<io::Error> for Fail {
    fn from(e: io::Error) -> Self {
        let code = match e.raw_os_error() {
            Some(5) => "access_denied",
            Some(32) | Some(33) => "in_use",
            Some(2) | Some(3) => "not_found",
            _ => match e.kind() {
                io::ErrorKind::NotFound => "not_found",
                io::ErrorKind::PermissionDenied => "access_denied",
                _ => "io_error",
            },
        };
        Fail::new(code, e.to_string())
    }
}

pub type R<T> = Result<T, Fail>;

pub fn emit(v: &Value) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

/// Case-insensitive wildcard match (`*` and `?`) on a single name. `*.*` matches names without a dot too,
/// like Windows does.
pub fn wild_match(pattern: &str, name: &str) -> bool {
    let p: Vec<char> = if pattern == "*.*" { vec!['*'] } else { pattern.to_lowercase().chars().collect() };
    let n: Vec<char> = name.to_lowercase().chars().collect();
    let (mut pi, mut ni, mut star, mut mark) = (0usize, 0usize, None::<usize>, 0usize);
    while ni < n.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == n[ni]) {
            pi += 1;
            ni += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ni;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ni = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

pub fn has_wild(s: &str) -> bool {
    s.contains('*') || s.contains('?')
}

/// Small non-cryptographic PRNG for shred passes (the goal is to overwrite, not to be unpredictable).
pub struct XorShift(u64);

impl XorShift {
    pub fn seeded() -> Self {
        let t = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(0x9E37_79B9);
        Self(t | 1)
    }
    pub fn fill(&mut self, buf: &mut [u8]) {
        for chunk in buf.chunks_mut(8) {
            let mut x = self.0;
            x ^= x << 13;
            x ^= x >> 7;
            x ^= x << 17;
            self.0 = x;
            let b = x.to_le_bytes();
            chunk.copy_from_slice(&b[..chunk.len()]);
        }
    }
}
