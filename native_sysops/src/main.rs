//! DarkHub.SysOps.exe: one JSON request on stdin, one JSON response on stdout, then exit.
//!
//! Request:  { "v": 1, "dryRun": false, "ops": [ { "op": "reg.read" | "reg.set" | "reg.deleteValue" | "reg.deleteKey"
//!             | "reg.deleteKeyIfEmpty", "key": "HKLM\\...", "name": "...", "type": "REG_DWORD", "data": ... }, ... ] }
//! Response: { "v": 1, "ok": true, "results": [ ... one per op, same order ... ] }
//!
//! There is deliberately no "run a command" op: the helper only knows a closed list of operations, and every key and
//! value is validated here again (the JS side validates first). `dryRun` validates the writes without touching the
//! registry (used by the catalog test). `--version` prints the protocol version.

mod values;
#[cfg(windows)]
mod reg;

use serde_json::{json, Value};
use std::io::{Read, Write};
use values::{parse_data, split_key, valid_name};

const PROTOCOL: u32 = 1;
const MAX_OPS: usize = 20_000;
const MAX_INPUT: u64 = 32 << 20;

fn fail(msg: &str) -> Value {
    json!({ "ok": false, "message": msg })
}

fn str_field<'a>(op: &'a Value, f: &str) -> &'a str {
    op.get(f).and_then(Value::as_str).unwrap_or("")
}

#[cfg(windows)]
fn result(r: Result<(), String>) -> Value {
    match r {
        Ok(()) => json!({ "ok": true, "message": "" }),
        Err(e) => fail(&e),
    }
}

fn run_op(op: &Value, dry_run: bool) -> Value {
    let kind = str_field(op, "op");
    let key = str_field(op, "key");
    let name = str_field(op, "name");
    if !valid_name(name) {
        return fail("invalid value name");
    }
    let path = split_key(key);
    if kind == "reg.read" {
        #[cfg(windows)]
        return reg::read(key, path.as_ref(), name);
        #[cfg(not(windows))]
        return fail("unsupported platform");
    }
    let Some(path) = path else { return fail("invalid key") };
    if path.sub.is_empty() {
        return fail("refusing to modify a registry hive root");
    }
    let data = match kind {
        "reg.set" => match parse_data(str_field(op, "type"), op.get("data").unwrap_or(&Value::Null)) {
            Some(d) => Some(d),
            None => return fail("invalid type"),
        },
        "reg.deleteValue" | "reg.deleteKey" | "reg.deleteKeyIfEmpty" => None,
        _ => return fail("unknown op"),
    };
    if kind == "reg.deleteKey" && values::depth(&path.sub) < 2 {
        return fail("refusing to delete a top-level registry key");
    }
    if dry_run {
        return json!({ "ok": true, "message": "dry run" });
    }
    #[cfg(windows)]
    {
        result(match kind {
            "reg.set" => reg::set(&path, name, data.as_ref().unwrap()),
            "reg.deleteValue" => reg::delete_value(&path, name),
            "reg.deleteKey" => reg::delete_key(&path),
            _ => reg::delete_key_if_empty(&path),
        })
    }
    #[cfg(not(windows))]
    {
        let _ = data;
        fail("unsupported platform")
    }
}

fn handle(input: &str) -> Value {
    let req: Value = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(e) => return json!({ "v": PROTOCOL, "ok": false, "error": format!("invalid request: {e}") }),
    };
    if req.get("v").and_then(Value::as_u64) != Some(PROTOCOL as u64) {
        return json!({ "v": PROTOCOL, "ok": false, "error": "unsupported protocol version" });
    }
    let Some(ops) = req.get("ops").and_then(Value::as_array) else {
        return json!({ "v": PROTOCOL, "ok": false, "error": "missing ops" });
    };
    if ops.len() > MAX_OPS {
        return json!({ "v": PROTOCOL, "ok": false, "error": "too many ops" });
    }
    let dry_run = req.get("dryRun").and_then(Value::as_bool).unwrap_or(false);
    let results: Vec<Value> = ops.iter().map(|op| run_op(op, dry_run)).collect();
    json!({ "v": PROTOCOL, "ok": true, "results": results })
}

fn main() {
    if std::env::args().any(|a| a == "--version") {
        println!("{{\"v\":{PROTOCOL},\"name\":\"DarkHub.SysOps\",\"version\":\"{}\"}}", env!("CARGO_PKG_VERSION"));
        return;
    }
    let mut input = String::new();
    let out = match std::io::stdin().take(MAX_INPUT).read_to_string(&mut input) {
        Ok(_) => handle(input.trim_start_matches('\u{feff}')),
        Err(e) => json!({ "v": PROTOCOL, "ok": false, "error": format!("cannot read stdin: {e}") }),
    };
    let mut stdout = std::io::stdout().lock();
    let _ = writeln!(stdout, "{out}");
    let _ = stdout.flush();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protocol_and_validation() {
        assert_eq!(handle("nope")["ok"], json!(false));
        assert_eq!(handle(r#"{"v":2,"ops":[]}"#)["error"], json!("unsupported protocol version"));
        assert_eq!(handle(r#"{"v":1}"#)["error"], json!("missing ops"));
        let r = handle(r#"{"v":1,"dryRun":true,"ops":[
            {"op":"reg.set","key":"HKLM\\SOFTWARE\\X","name":"a","type":"REG_DWORD","data":"1"},
            {"op":"reg.set","key":"HKLM","name":"a","type":"REG_DWORD","data":"1"},
            {"op":"reg.set","key":"HKEY_LOCAL_MACHINE\\X","name":"a","type":"REG_DWORD","data":"1"},
            {"op":"reg.set","key":"HKLM\\SOFTWARE\\X","name":"a","type":"REG_NONE","data":"1"},
            {"op":"reg.deleteKey","key":"HKLM\\SOFTWARE"},
            {"op":"reg.deleteKey","key":"HKLM\\SOFTWARE\\X"},
            {"op":"reg.exec","key":"HKLM\\SOFTWARE\\X"},
            {"op":"reg.set","key":"HKLM\\SOFTWARE\\X","name":"a\nb","type":"REG_SZ","data":""}
        ]}"#);
        let msgs: Vec<String> = r["results"].as_array().unwrap().iter()
            .map(|x| if x["ok"] == json!(true) { "ok".into() } else { x["message"].as_str().unwrap().to_string() }).collect();
        assert_eq!(msgs, vec![
            "ok", "refusing to modify a registry hive root", "invalid key", "invalid type",
            "refusing to delete a top-level registry key", "ok", "unknown op", "invalid value name"
        ]);
    }
}
