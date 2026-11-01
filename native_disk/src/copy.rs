//! Clone / image / verify / surface test. Reads tolerate bad sectors the way ddrescue does: retry the chunk,
//! then fall back to single sectors, fill what stays unreadable with zeros and report it.
use crate::device::BlockDevice;
use crate::util::{cancelled, hex, Progress, R};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Instant;

#[derive(Clone, Copy, Debug)]
pub struct Region {
    pub offset: u64,
    pub len: u64,
}

pub struct ReadStats {
    pub bad_sectors: Vec<u64>,
    pub bad_count: u64,
}

impl ReadStats {
    pub fn new() -> Self {
        Self { bad_sectors: Vec::new(), bad_count: 0 }
    }
    fn mark(&mut self, lba: u64) {
        self.bad_count += 1;
        if self.bad_sectors.len() < 1000 {
            self.bad_sectors.push(lba);
        }
    }
}

/// Reads `buf` at `off`, never failing: unreadable sectors become zeros and go into `stats`.
pub fn tolerant_read(dev: &mut dyn BlockDevice, off: u64, buf: &mut [u8], stats: &mut ReadStats) -> usize {
    for _ in 0..2 {
        if let Ok(n) = dev.read_at(off, buf) {
            return n;
        }
    }
    let ss = dev.sector_size() as usize;
    let mut done = 0;
    while done < buf.len() {
        let end = (done + ss).min(buf.len());
        let sector = &mut buf[done..end];
        let mut ok = false;
        for _ in 0..3 {
            if dev.read_at(off + done as u64, sector).is_ok() {
                ok = true;
                break;
            }
        }
        if !ok {
            sector.fill(0);
            stats.mark((off + done as u64) / ss as u64);
        }
        done = end;
    }
    buf.len()
}

pub struct CopyResult {
    pub bytes: u64,
    pub cancelled: bool,
    pub source_sha256: String,
    pub stats: ReadStats,
    pub seconds: f64,
}

pub fn copy_region(src: &mut dyn BlockDevice, sr: Region, dst: &mut dyn BlockDevice, dst_off: u64, chunk: usize, prog: &mut Progress) -> R<CopyResult> {
    let ss = src.sector_size().max(dst.sector_size()) as usize;
    let chunk = (chunk / ss).max(1) * ss;
    let mut buf = vec![0u8; chunk];
    let mut hasher = Sha256::new();
    let mut stats = ReadStats::new();
    let mut pos = 0u64;
    let mut was_cancelled = false;
    while pos < sr.len {
        if cancelled() {
            was_cancelled = true;
            break;
        }
        let n = ((sr.len - pos) as usize).min(chunk);
        let b = &mut buf[..n];
        let got = tolerant_read(src, sr.offset + pos, b, &mut stats);
        if got < n {
            b[got..].fill(0);
        }
        hasher.update(&*b);
        dst.write_at(dst_off + pos, b)?;
        pos += n as u64;
        prog.tick("copy", pos, sr.len, json!({ "bad_sectors": stats.bad_count }));
    }
    dst.flush()?;
    Ok(CopyResult { bytes: pos, cancelled: was_cancelled, source_sha256: hex(&hasher.finalize()), stats, seconds: prog.elapsed() })
}

pub fn hash_region(dev: &mut dyn BlockDevice, r: Region, chunk: usize, phase: &str, prog: &mut Progress) -> R<(String, ReadStats, bool)> {
    let ss = dev.sector_size() as usize;
    let chunk = (chunk / ss).max(1) * ss;
    let mut buf = vec![0u8; chunk];
    let mut hasher = Sha256::new();
    let mut stats = ReadStats::new();
    let mut pos = 0u64;
    while pos < r.len {
        if cancelled() {
            return Ok((String::new(), stats, true));
        }
        let n = ((r.len - pos) as usize).min(chunk);
        let b = &mut buf[..n];
        let got = tolerant_read(dev, r.offset + pos, b, &mut stats);
        if got < n {
            b[got..].fill(0);
        }
        hasher.update(&*b);
        pos += n as u64;
        prog.tick(phase, pos, r.len, json!({}));
    }
    Ok((hex(&hasher.finalize()), stats, false))
}

/// Reads the whole device, timing each block. Map cells hold the worst status of the blocks they cover:
/// 0 ok, 1 slow (>= 150 ms), 2 very slow (>= 500 ms), 3 unreadable.
pub fn surface_test(dev: &mut dyn BlockDevice, r: Region, block: usize, cells: usize, prog: &mut Progress) -> R<Value> {
    let ss = dev.sector_size() as usize;
    let block = (block / ss).max(1) * ss;
    let mut buf = vec![0u8; block];
    let mut map = vec![0u8; cells];
    let (mut slow, mut very_slow, mut bad) = (0u64, 0u64, 0u64);
    let mut bad_ranges: Vec<Value> = Vec::new();
    let mut max_ms = 0f64;
    let mut pos = 0u64;
    let mut last_map = Instant::now();
    while pos < r.len {
        if cancelled() {
            break;
        }
        let n = ((r.len - pos) as usize).min(block);
        let t = Instant::now();
        let res = dev.read_at(r.offset + pos, &mut buf[..n]);
        let ms = t.elapsed().as_secs_f64() * 1000.0;
        max_ms = max_ms.max(ms);
        let status = match res {
            Err(_) => {
                bad += 1;
                if bad_ranges.len() < 500 {
                    bad_ranges.push(json!({ "offset": r.offset + pos, "length": n }));
                }
                3
            }
            Ok(_) if ms >= 500.0 => {
                very_slow += 1;
                2
            }
            Ok(_) if ms >= 150.0 => {
                slow += 1;
                1
            }
            Ok(_) => 0,
        };
        let cell = ((pos as u128 * cells as u128) / r.len.max(1) as u128) as usize;
        let c = &mut map[cell.min(cells - 1)];
        *c = (*c).max(status);
        pos += n as u64;
        let send_map = last_map.elapsed().as_millis() > 1000;
        if send_map {
            last_map = Instant::now();
        }
        prog.tick("surface", pos, r.len, json!({ "slow": slow, "very_slow": very_slow, "bad": bad, "map": if send_map { json!(map.iter().map(|&x| x.to_string()).collect::<String>()) } else { Value::Null } }));
    }
    Ok(json!({
        "bytes_tested": pos, "complete": pos >= r.len, "block_size": block, "blocks": pos.div_ceil(block as u64),
        "slow": slow, "very_slow": very_slow, "bad": bad, "max_latency_ms": (max_ms * 10.0).round() / 10.0,
        "map": map.iter().map(|&x| x.to_string()).collect::<String>(), "bad_ranges": bad_ranges,
        "seconds": prog.elapsed(),
    }))
}
