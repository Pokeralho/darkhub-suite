//! DarkHub Cleaner Core: native engine behind the "Limpeza profunda" page.
//!
//! Every command prints one JSON object (`{"ok":true,...}` / `{"ok":false,"code":..,"error":..}`).
//! Anything that deletes is a simulation unless `--apply` is passed.
//!
//!   targets   [--winapp2 F]                          cleanable targets (built-in + winapp2) found on this PC
//!   scan      --ids-file F [--winapp2 F]             what each chosen target would delete (files, bytes, sample)
//!   clean     --ids-file F [--winapp2 F] [--apply] [--shred N]
//!   browsers  [--browser chrome,edge,firefox] [--apply]   VACUUM of the browsers' SQLite databases
//!   reg-scan                                         missing shared DLLs, orphan App Paths, dead Run/Startup entries
//!   reg-clean --ids-file F --backup F.reg [--apply]  removes chosen findings after writing the .reg backup
//!
//! Test-only options keep everything inside throwaway places: `--test-root DIR` (files and browsers),
//! `--root HKCU\Software\DarkHubCleanerTest...` and `--startup-folder DIR` (registry).
mod browsers;
mod files;
#[cfg(windows)]
mod registry;
mod safety;
mod util;
mod winapp2;
#[cfg(test)]
mod tests;

use safety::Env;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use util::{emit, Fail, R};

struct Args {
    cmd: String,
    opts: HashMap<String, String>,
}

impl Args {
    fn parse(argv: &[String]) -> Args {
        let mut opts = HashMap::new();
        let mut cmd = String::new();
        let mut i = 0;
        while i < argv.len() {
            let a = &argv[i];
            if let Some(k) = a.strip_prefix("--") {
                if i + 1 < argv.len() && !argv[i + 1].starts_with("--") {
                    opts.insert(k.to_string(), argv[i + 1].clone());
                    i += 1;
                } else {
                    opts.insert(k.to_string(), "true".into());
                }
            } else if cmd.is_empty() {
                cmd = a.clone();
            }
            i += 1;
        }
        Args { cmd, opts }
    }
    fn get(&self, k: &str) -> Option<&str> {
        self.opts.get(k).map(|s| s.as_str())
    }
    fn flag(&self, k: &str) -> bool {
        self.get(k).is_some_and(|v| v != "false")
    }
}

fn env_of(a: &Args) -> Env {
    match a.get("test-root") {
        Some(d) => Env::rooted(Path::new(d)),
        None => Env::from_process(),
    }
}

/// winapp2.ini is read as text with a size cap; invalid UTF-8 is replaced, never executed.
fn read_winapp2(a: &Args) -> R<Option<String>> {
    let Some(f) = a.get("winapp2") else { return Ok(None) };
    let md = std::fs::metadata(f)?;
    if md.len() > 16 << 20 {
        return Err(Fail::new("too_big", "winapp2.ini maior que 16 MB"));
    }
    Ok(Some(String::from_utf8_lossy(&std::fs::read(f)?).into_owned()))
}

fn read_ids(a: &Args) -> R<Vec<String>> {
    let f = a.get("ids-file").ok_or_else(|| Fail::new("bad_args", "falta --ids-file"))?;
    let v: Value = serde_json::from_slice(&std::fs::read(f)?).map_err(|e| Fail::new("bad_args", format!("ids-file inválido: {e}")))?;
    Ok(v.as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect()).unwrap_or_default())
}

fn reg_exists(full: &str) -> bool {
    #[cfg(windows)]
    return registry::exists(full);
    #[cfg(not(windows))]
    {
        let _ = full;
        false
    }
}

#[cfg(windows)]
fn reg_sources(a: &Args) -> R<registry::Sources> {
    match a.get("root") {
        Some(r) => registry::Sources::test(r, a.get("startup-folder").map(PathBuf::from).unwrap_or_default()),
        None => Ok(registry::Sources::system()),
    }
}

fn run(a: &Args) -> R<Value> {
    match a.cmd.as_str() {
        "targets" => {
            let env = env_of(a);
            let text = read_winapp2(a)?;
            let (targets, stats) = winapp2::load_all(&env, text.as_deref(), &reg_exists);
            Ok(json!({ "targets": targets.iter().map(|t| t.to_json()).collect::<Vec<_>>(), "stats": stats }))
        }
        "scan" | "clean" => {
            let env = env_of(a);
            let ids = read_ids(a)?;
            let text = read_winapp2(a)?;
            let (targets, _) = winapp2::load_all(&env, text.as_deref(), &reg_exists);
            let chosen: Vec<&winapp2::Target> = targets.iter().filter(|t| ids.contains(&t.id)).collect();
            let apply = a.cmd == "clean" && a.flag("apply");
            let shred = a.get("shred").map(|v| v.parse::<u32>().map_err(|_| Fail::new("bad_args", "--shred precisa ser 1 a 7"))).transpose()?.unwrap_or(0);
            if shred > 7 {
                return Err(Fail::new("bad_args", "--shred precisa ser 1 a 7"));
            }
            let sample = a.get("sample").and_then(|v| v.parse().ok()).unwrap_or(30);
            let mut out = files::run(&env, &chosen, &files::Opts { apply, shred, sample });
            out["unknown_ids"] = json!(ids.iter().filter(|i| !targets.iter().any(|t| &t.id == *i)).collect::<Vec<_>>());
            Ok(out)
        }
        "browsers" => {
            let env = env_of(a);
            let which: Vec<String> = a.get("browser").map(|s| s.split(',').map(|x| x.trim().to_lowercase()).collect()).unwrap_or_default();
            let root = a.get("test-root").map(PathBuf::from);
            Ok(browsers::vacuum(&env, &which, root.as_deref(), a.flag("apply")))
        }
        #[cfg(windows)]
        "reg-scan" => {
            let f = registry::scan(&reg_sources(a)?);
            Ok(json!({ "findings": f.iter().map(|x| x.to_json()).collect::<Vec<_>>() }))
        }
        #[cfg(windows)]
        "reg-clean" => {
            let ids = read_ids(a)?;
            let backup = a.get("backup").map(PathBuf::from);
            if let Some(b) = &backup {
                if !b.to_string_lossy().to_lowercase().ends_with(".reg") {
                    return Err(Fail::new("bad_args", "--backup precisa terminar em .reg"));
                }
            }
            registry::clean(&reg_sources(a)?, &ids, backup.as_deref(), a.flag("apply"))
        }
        "" | "help" => Ok(json!({ "commands": ["targets", "scan", "clean", "browsers", "reg-scan", "reg-clean"] })),
        other => Err(Fail::new("bad_args", format!("comando desconhecido: {other}"))),
    }
}

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let a = Args::parse(&argv);
    let (code, out) = match run(&a) {
        Ok(mut v) => {
            if let Some(o) = v.as_object_mut() {
                o.insert("ok".into(), json!(true));
            }
            (0, v)
        }
        Err(f) => (1, json!({ "ok": false, "code": f.code, "error": f.msg })),
    };
    emit(&out);
    std::process::exit(code);
}
