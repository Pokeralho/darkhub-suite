//! Errors, NDJSON progress and cancellation shared by every command.
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

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
            Some(21) => "not_ready",
            Some(23) | Some(1117) => "io_error",
            _ => match e.kind() {
                io::ErrorKind::NotFound => "not_found",
                io::ErrorKind::PermissionDenied => "access_denied",
                _ => "io_error",
            },
        };
        let hint = if code == "access_denied" { " Execute como Administrador." } else { "" };
        Fail::new(code, format!("{e}.{hint}"))
    }
}

pub type R<T> = Result<T, Fail>;

static CANCEL: AtomicBool = AtomicBool::new(false);

pub fn cancelled() -> bool {
    CANCEL.load(Ordering::Relaxed)
}

#[cfg(test)]
pub fn reset_cancel() {
    CANCEL.store(false, Ordering::Relaxed);
}

/// A line "cancel" on stdin requests cancellation. EOF is ignored (stdin may simply be closed).
pub fn listen_for_cancel() {
    std::thread::spawn(|| {
        for line in io::stdin().lock().lines() {
            match line {
                Ok(l) if l.trim().eq_ignore_ascii_case("cancel") => CANCEL.store(true, Ordering::Relaxed),
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });
}

pub fn emit(v: &Value) {
    let mut out = io::stdout().lock();
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

/// Throttled progress reporter with speed / ETA.
pub struct Progress {
    started: Instant,
    last: Option<Instant>,
    every: Duration,
    pub quiet: bool,
}

impl Progress {
    pub fn new() -> Self {
        Self { started: Instant::now(), last: None, every: Duration::from_millis(250), quiet: false }
    }
    pub fn silent() -> Self {
        Self { quiet: true, ..Self::new() }
    }
    pub fn elapsed(&self) -> f64 {
        self.started.elapsed().as_secs_f64()
    }
    pub fn tick(&mut self, phase: &str, done: u64, total: u64, extra: Value) {
        if self.quiet {
            return;
        }
        let now = Instant::now();
        if done < total && self.last.is_some_and(|l| now - l < self.every) {
            return;
        }
        self.last = Some(now);
        let secs = self.elapsed().max(0.001);
        let speed = done as f64 / secs;
        let eta = if speed > 0.0 && total > done { ((total - done) as f64 / speed).round() as u64 } else { 0 };
        let mut v = json!({
            "event": "progress", "phase": phase, "bytes": done, "total": total,
            "percent": if total > 0 { (done as f64 * 1000.0 / total as f64).round() / 10.0 } else { 0.0 },
            "speed_bps": speed.round() as u64, "eta_s": eta,
        });
        if let (Some(o), Some(e)) = (v.as_object_mut(), extra.as_object()) {
            for (k, x) in e {
                o.insert(k.clone(), x.clone());
            }
        }
        emit(&v);
    }
    pub fn event(&self, v: Value) {
        if !self.quiet {
            emit(&v);
        }
    }
}

pub fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

pub fn unhex(s: &str) -> R<Vec<u8>> {
    let s: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    if s.len() % 2 != 0 {
        return Err(Fail::new("bad_args", "hex com número ímpar de dígitos"));
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| Fail::new("bad_args", "hex inválido")))
        .collect()
}
