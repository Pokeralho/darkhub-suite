//! DarkHub GPU benchmark engine. D3D12 rasterization and DXR 1.1 inline ray tracing over the closed-form scene in
//! scene.rs. Talks JSON lines on stdin/stdout; the app relays to the server. Contract: docs/GPU_BENCHMARK.md.
#![windows_subsystem = "console"]

mod audit;
mod gpu;
mod proof;
mod scene;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::sync::mpsc;
use std::time::{Duration, Instant};

pub(crate) fn say(v: Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

fn u32s_b64(v: &[u32]) -> String {
    let mut b = Vec::with_capacity(v.len() * 4);
    for x in v { b.extend_from_slice(&x.to_le_bytes()); }
    B64.encode(b)
}

/// Same samples the JS test compares: if these drift, GPU and server no longer agree.
fn vectors() -> Value {
    use scene::*;
    let mut boxes = vec![];
    let mut cams = vec![];
    for (seed, frame) in [(1u32, 0u32), (12345, 500), (0xdeadbeef, 3000), (7, 99999)] {
        for (cx, cz) in [(0u32, 0u32), (13, 40), (63, 63)] {
            let b = box_at(seed, frame, cx, cz);
            boxes.push(json!({"seed": seed, "frame": frame, "cx": cx, "cz": cz, "min": b.min, "max": b.max}));
        }
        let c = camera(seed, frame);
        cams.push(json!({"seed": seed, "frame": frame, "eye": c.eye, "target": c.target}));
    }
    let pcgs: Vec<u32> = [0u32, 1, 0xdeadbeef, 0xffffffff].iter().map(|x| pcg(*x)).collect();
    json!({"pcg": pcgs, "hash2": hash2(7, 9), "boxes": boxes, "cameras": cams})
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    if args.iter().any(|a| a == "--vectors") {
        say(vectors());
        return Ok(());
    }
    let parent = args.iter().position(|a| a == "--parent").and_then(|i| args.get(i + 1)).and_then(|v| v.parse::<isize>().ok());
    let mut g = gpu::Gpu::new(parent).map_err(|e| format!("d3d12: {e}"))?;
    say(json!({"type": "ready", "adapter": g.info.name, "vendorId": g.info.vendor, "deviceId": g.info.device,
        "vramMb": g.info.vram_mb, "driver": g.info.driver, "dxr": g.info.dxr,
        "width": scene::WIDTH, "height": scene::HEIGHT, "tiles": scene::TILE_COUNT}));

    let (tx, rx) = mpsc::channel::<String>();
    let hwnd = g.hwnd_raw();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines().map_while(Result::ok) {
            // handled here, not in the main loop: the window must follow the app even in the middle of a segment
            if let Ok(m) = serde_json::from_str::<Value>(&line) {
                if m["cmd"] == "rect" {
                    let n = |k: &str| m[k].as_i64().unwrap_or(0) as i32;
                    gpu::place(hwnd, n("x"), n("y"), n("w"), n("h"), m["visible"].as_bool().unwrap_or(true));
                    continue;
                }
            }
            if tx.send(line).is_err() { break; }
        }
        let _ = tx.send("{\"cmd\":\"quit\"}".into()); // stdin closed: the parent is gone
    });

    // the commitment of every segment, by seed: openings run after the whole test, never on the clock of a later segment
    let mut segments: HashMap<u32, Vec<proof::Hash>> = HashMap::new();
    loop {
        if !g.pump() { say(json!({"type": "aborted"})); return Ok(()); }
        let line = match rx.recv_timeout(Duration::from_millis(15)) {
            Ok(l) => l,
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(_) => return Ok(()),
        };
        let Ok(msg) = serde_json::from_str::<Value>(&line) else { continue };
        let test = msg["test"].as_str().unwrap_or("raster");
        let rt = test == "rt";
        let seed = msg["seed"].as_u64().unwrap_or(0) as u32;
        match msg["cmd"].as_str().unwrap_or("") {
            "quit" => return Ok(()),
            "segment" => {
                if rt && !g.info.dxr { say(json!({"type": "error", "error": "dxr_unsupported"})); continue; }
                let ms = msg["ms"].as_u64().unwrap_or(6000).clamp(100, 60000);
                let started = Instant::now();
                let r = g.segment(rt, seed, Duration::from_millis(ms)).map_err(|e| format!("segment: {e}"))?;
                let Some(r) = r else { say(json!({"type": "aborted"})); return Ok(()); };
                say(json!({"type": "segment", "test": test, "index": msg["index"], "frames": r.roots.len(),
                    "root": proof::hex(&proof::merkle_root(&r.roots)), "frameUs": u32s_b64(&r.frame_us),
                    "wallMs": started.elapsed().as_millis() as u64, "clock": r.clock}));
                segments.insert(seed, r.roots);
            }
            "open" => {
                let frame = msg["frame"].as_u64().unwrap_or(0) as u32;
                let tiles: Vec<u32> = msg["tiles"].as_array().map(|a| a.iter().filter_map(|t| t.as_u64().map(|x| x as u32)).collect()).unwrap_or_default();
                let empty = vec![];
                let roots = segments.get(&seed).unwrap_or(&empty);
                if frame as usize >= roots.len() || tiles.iter().any(|t| *t >= scene::TILE_COUNT) {
                    say(json!({"type": "error", "error": "bad_open"}));
                    continue;
                }
                let (ids, hashes) = g.capture(rt, seed, frame).map_err(|e| format!("capture: {e}"))?;
                let w = scene::WIDTH as usize;
                let raw: Vec<Value> = tiles.iter().map(|t| {
                    let (tx0, ty0) = ((*t % scene::TILES_X * scene::TILE) as usize, (*t / scene::TILES_X * scene::TILE) as usize);
                    let mut px = Vec::with_capacity(256);
                    for y in 0..scene::TILE as usize { px.extend_from_slice(&ids[(ty0 + y) * w + tx0..(ty0 + y) * w + tx0 + scene::TILE as usize]); }
                    json!({"tile": t, "ids": u32s_b64(&px)})
                }).collect();
                let path: Vec<Value> = proof::merkle_path(roots, frame as usize).into_iter().map(|(left, h)| json!({"left": left, "hash": proof::hex(&h)})).collect();
                say(json!({"type": "opening", "test": test, "frame": frame, "tiles": raw, "tileHashes": u32s_b64(&hashes), "path": path}));
            }
            "fingerprint" => {
                // the same frame must always come out identical: stress test compares this against its reference
                if rt && !g.info.dxr { say(json!({"type": "error", "error": "dxr_unsupported"})); continue; }
                let frame = msg["frame"].as_u64().unwrap_or(0) as u32;
                let (ids, hashes) = g.capture(rt, seed, frame).map_err(|e| format!("capture: {e}"))?;
                let image = g.read_ldr().map_err(|e| format!("image: {e}"))?;
                let ids_bytes: Vec<u8> = ids.iter().chain(hashes.iter()).flat_map(|x| x.to_le_bytes()).collect();
                say(json!({"type": "fingerprint", "ids": proof::hex(&proof::frame_root(&ids_bytes)), "image": proof::hex(&proof::frame_root(&image))}));
            }
            "driver" => say(audit::driver(g.info.vendor == 0x10DE)),
            "modules" => say(json!({"type": "modules", "modules": gpu::loaded_modules()})),
            "shot" => {
                let path = msg["path"].as_str().unwrap_or("");
                let rgba = g.read_ldr().map_err(|e| format!("shot: {e}"))?;
                let ok = std::fs::write(path, rgba).is_ok();
                say(json!({"type": "shot", "ok": ok, "width": scene::WIDTH, "height": scene::HEIGHT}));
            }
            _ => {}
        }
    }
}

fn main() {
    if let Err(e) = run() {
        say(json!({"type": "error", "error": e}));
        std::process::exit(1);
    }
}
