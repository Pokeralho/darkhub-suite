//! DarkHub Disk Rescue: low-level disk engine used by the "Disk Studio & Rescue" page.
//!
//! Short commands print one JSON object (`{"ok":true,...}` / `{"ok":false,"code":..,"error":..}`).
//! Long ones print NDJSON events (`progress`, `found`...) and finish with `{"event":"done","ok":..}`.
//! Writing a line `cancel` to stdin stops a long command, leaving the destination consistent.
mod carve;
mod copy;
mod device;
mod parts;
mod repair;
mod util;
#[cfg(windows)]
mod win;
#[cfg(test)]
mod tests;

use copy::Region;
use device::{open_target, read_sectors, BlockDevice, FileDevice, Target};
use serde_json::{json, Value};
use std::collections::HashMap;
use util::{emit, Fail, Progress, R};

struct Args {
    cmd: String,
    pos: Vec<String>,
    opts: HashMap<String, String>,
}

impl Args {
    fn parse(argv: &[String]) -> Args {
        let mut pos = Vec::new();
        let mut opts = HashMap::new();
        let mut i = 0;
        while i < argv.len() {
            let a = &argv[i];
            if let Some(k) = a.strip_prefix("--") {
                if let Some((k, v)) = k.split_once('=') {
                    opts.insert(k.to_string(), v.to_string());
                } else if i + 1 < argv.len() && !argv[i + 1].starts_with("--") {
                    opts.insert(k.to_string(), argv[i + 1].clone());
                    i += 1;
                } else {
                    opts.insert(k.to_string(), "true".into());
                }
            } else {
                pos.push(a.clone());
            }
            i += 1;
        }
        let cmd = if pos.is_empty() { String::new() } else { pos.remove(0) };
        Args { cmd, pos, opts }
    }
    fn get(&self, k: &str) -> Option<&str> {
        self.opts.get(k).map(|s| s.as_str())
    }
    fn flag(&self, k: &str) -> bool {
        self.get(k).is_some_and(|v| v != "false")
    }
    fn need(&self, k: &str) -> R<&str> {
        self.get(k).ok_or_else(|| Fail::new("bad_args", format!("falta --{k}")))
    }
    fn num(&self, k: &str) -> R<Option<i64>> {
        self.get(k).map(|v| v.parse::<i64>().map_err(|_| Fail::new("bad_args", format!("--{k} precisa ser um número")))).transpose()
    }
    fn target(&self, key: &str) -> R<Target> {
        let s = if key == "target" { self.pos.first().map(|s| s.as_str()).or(self.get("target")) } else { self.get(key) };
        s.map(Target::parse).ok_or_else(|| Fail::new("bad_args", format!("falta o alvo ({key})")))
    }
    fn sector(&self) -> R<Option<u32>> {
        Ok(self.num("sector-size")?.map(|v| v as u32).filter(|v| *v == 512 || *v == 4096))
    }
}

fn system_disks() -> Vec<u32> {
    #[cfg(windows)]
    return win::system_disks();
    #[cfg(not(windows))]
    Vec::new()
}

/// Rules for any command that writes to `t`: never the Windows disk, and a physical disk only with
/// `--confirm-disk N` naming the same disk.
pub fn guard_write(t: &Target, confirm: Option<i64>, sys: &[u32]) -> R<()> {
    if let Target::Disk(n) = t {
        if sys.contains(n) {
            return Err(Fail::new("system_disk", format!("O disco {n} contém o Windows em uso. Gravação recusada.")));
        }
        if confirm != Some(*n as i64) {
            return Err(Fail::new("confirm_required", format!("Confirme o disco de destino com --confirm-disk {n}.")));
        }
    }
    Ok(())
}

fn region_of(dev: &mut dyn BlockDevice, part: Option<i64>) -> R<(Region, Value)> {
    let ss = dev.sector_size() as u64;
    match part {
        None => Ok((Region { offset: 0, len: dev.size() }, json!({ "kind": "disk" }))),
        Some(idx) => {
            let (_, parts) = parts::partitions(dev)?;
            let p = parts.into_iter().find(|p| p.index as i64 == idx).ok_or_else(|| Fail::new("bad_args", format!("partição {idx} não existe")))?;
            if (p.start_lba + p.sectors) * ss > dev.size() {
                return Err(Fail::new("layout", format!("partição {idx} passa do fim do disco")));
            }
            Ok((Region { offset: p.start_lba * ss, len: p.sectors * ss }, json!({ "kind": "partition", "index": idx, "start_lba": p.start_lba, "sectors": p.sectors })))
        }
    }
}

fn plan_result(dev: &mut dyn BlockDevice, plan: &repair::Plan, a: &Args, t: &Target) -> R<Value> {
    let diff = plan.describe(dev)?;
    if a.flag("dry-run") || plan.writes.is_empty() {
        return Ok(json!({ "dry_run": true, "plan": diff }));
    }
    guard_write(t, a.num("confirm-disk")?, &system_disks())?;
    let backup = a.need("backup")?.to_string();
    // Reopen for writing (on a physical disk this locks and dismounts its volumes).
    let mut w = open_target(t, true, a.sector()?)?;
    let applied = repair::apply(w.as_mut(), plan, &backup)?;
    Ok(json!({ "dry_run": false, "plan": diff, "result": applied }))
}

fn hex_rows(data: &[u8], base: u64) -> Vec<Value> {
    data.chunks(16)
        .enumerate()
        .map(|(i, c)| {
            json!({
                "offset": base + (i * 16) as u64,
                "hex": c.iter().map(|b| format!("{b:02X}")).collect::<Vec<_>>().join(" "),
                "ascii": c.iter().map(|&b| if (32..127).contains(&b) { b as char } else { '.' }).collect::<String>(),
            })
        })
        .collect()
}

fn read_sector_cmd(a: &Args) -> R<Value> {
    let t = a.target("target")?;
    let mut dev = open_target(&t, false, a.sector()?)?;
    let total = dev.total_sectors();
    let req = a.num("lba")?.unwrap_or(0);
    let lba = if req < 0 { total as i64 + req } else { req };
    if lba < 0 || lba as u64 >= total {
        return Err(Fail::new("bad_args", format!("LBA {req} fora do disco (0..{})", total.saturating_sub(1))));
    }
    let count = a.num("count")?.unwrap_or(1).clamp(1, 64) as u64;
    let count = count.min(total - lba as u64);
    let data = read_sectors(dev.as_mut(), lba as u64, count)?;
    let ss = dev.sector_size() as u64;
    let s = &data[..data.len().min(ss as usize)];
    let mbr = parts::parse_mbr(s);
    let vbr = parts::detect_vbr(s, lba as u64, ss as u32);
    let gpt = if s.len() >= 92 && &s[..8] == b"EFI PART" {
        let hs = (parts::u32le(s, 12) as usize).clamp(92, s.len());
        json!({ "my_lba": parts::u64le(s, 24), "alternate_lba": parts::u64le(s, 32), "entries_lba": parts::u64le(s, 72), "num_entries": parts::u32le(s, 80), "crc_ok": parts::header_crc(s, hs) == parts::u32le(s, 16), "disk_guid": parts::guid_str(&s[56..72]) })
    } else {
        Value::Null
    };
    Ok(json!({
        "target": t.display(), "lba": lba, "requested_lba": req, "count": count, "total_sectors": total, "sector_size": ss,
        "raw_hex": util::hex(&data), "rows": hex_rows(&data, lba as u64 * ss),
        "decoded": {
            "signature_55aa": mbr.signature_ok,
            "mbr_entries": if vbr.is_none() { mbr.entries.iter().map(|e| json!({ "slot": e.slot, "boot_flag": e.boot, "type": format!("0x{:02X}", e.ptype), "type_name": parts::mbr_type_name(e.ptype), "lba_start": e.lba_start, "sectors": e.sectors })).collect::<Vec<_>>() } else { vec![] },
            "vbr": vbr.map(|v| json!({ "fs": v.fs, "sectors": v.sectors, "label": v.label })),
            "gpt_header": gpt,
            "oem_id": String::from_utf8_lossy(&s[3..11.min(s.len())]).trim().to_string(),
        }
    }))
}

fn write_sector_cmd(a: &Args) -> R<Value> {
    let t = a.target("target")?;
    let mut dev = open_target(&t, false, a.sector()?)?;
    let ss = dev.sector_size() as usize;
    let lba = a.num("lba")?.ok_or_else(|| Fail::new("bad_args", "falta --lba"))?;
    if lba < 0 || lba as u64 >= dev.total_sectors() {
        return Err(Fail::new("bad_args", "LBA fora do disco"));
    }
    let data = util::unhex(a.need("hex")?)?;
    if data.is_empty() || data.len() % ss != 0 {
        return Err(Fail::new("bad_args", format!("os dados precisam ter múltiplos de {ss} bytes")));
    }
    let mut plan = repair::Plan::default();
    plan.writes.push(repair::SectorWrite { lba: lba as u64, data, what: "edição manual".into() });
    plan_result(dev.as_mut(), &plan, a, &t)
}

/// clone / image-create / image-restore share this: copy a disk or partition onto another disk, partition or file.
fn clone_cmd(a: &Args, prog: &mut Progress) -> R<Value> {
    let st = a.target("source")?;
    let dt = a.target("target")?;
    if st == dt {
        return Err(Fail::new("bad_args", "origem e destino são o mesmo"));
    }
    let mut src = open_target(&st, false, a.sector()?)?;
    let (sr, sinfo) = region_of(src.as_mut(), a.num("source-part")?)?;
    let create = a.flag("create");
    #[cfg(windows)]
    if let (Target::Disk(n), Target::Image(p)) = (&st, &dt) {
        if win::disk_of_path(p) == Some(*n) {
            return Err(Fail::new("same_disk", "a imagem não pode ser salva no mesmo disco que está sendo copiado"));
        }
    }
    if create {
        let Target::Image(p) = &dt else { return Err(Fail::new("bad_args", "--create só vale para arquivo de imagem")) };
        if std::path::Path::new(p).exists() && !a.flag("overwrite") {
            return Err(Fail::new("exists", "o arquivo de imagem já existe (use --overwrite)"));
        }
        if a.flag("dry-run") {
            return Ok(json!({ "dry_run": true, "source": sinfo, "bytes": sr.len }));
        }
        let mut dst = FileDevice::create(p, sr.len, src.sector_size())?;
        return finish_copy(a, src.as_mut(), sr, &mut dst, Region { offset: 0, len: sr.len }, sinfo, json!({ "kind": "image", "path": p }), prog, false);
    }
    let probe = open_target(&dt, false, a.sector()?);
    let mut probe = probe?;
    if probe.sector_size() != src.sector_size() && a.get("source-part").is_none() {
        return Err(Fail::new("sector_mismatch", format!("setores diferentes ({} x {}): clone de disco inteiro quebraria a tabela; clone partição por partição", src.sector_size(), probe.sector_size())));
    }
    let (dr, dinfo) = region_of(probe.as_mut(), a.num("target-part")?)?;
    if dr.len < sr.len {
        return Err(Fail::new("target_too_small", format!("destino ({} bytes) menor que a origem ({} bytes)", dr.len, sr.len)));
    }
    if dr.offset % src.sector_size() as u64 != 0 {
        return Err(Fail::new("layout", "destino não alinhado ao setor da origem"));
    }
    drop(probe);
    if a.flag("dry-run") {
        return Ok(json!({ "dry_run": true, "source": sinfo, "target": dinfo, "bytes": sr.len, "target_bytes": dr.len }));
    }
    guard_write(&dt, a.num("confirm-disk")?, &system_disks())?;
    let mut dst = open_target(&dt, true, a.sector()?)?;
    let whole_disk = a.get("source-part").is_none() && a.get("target-part").is_none();
    finish_copy(a, src.as_mut(), sr, dst.as_mut(), dr, sinfo, dinfo, prog, whole_disk)
}

#[allow(clippy::too_many_arguments)]
fn finish_copy(a: &Args, src: &mut dyn BlockDevice, sr: Region, dst: &mut dyn BlockDevice, dr: Region, sinfo: Value, dinfo: Value, prog: &mut Progress, whole_disk: bool) -> R<Value> {
    let chunk = (a.num("chunk-mb")?.unwrap_or(8).clamp(1, 64) as usize) << 20;
    let res = copy::copy_region(src, sr, dst, dr.offset, chunk, prog)?;
    let mut out = json!({
        "source": sinfo, "target": dinfo, "bytes": res.bytes, "total": sr.len, "cancelled": res.cancelled,
        "source_sha256": res.source_sha256, "bad_sectors": res.stats.bad_count, "bad_sector_list": res.stats.bad_sectors,
        "seconds": res.seconds,
    });
    if res.cancelled {
        return Ok(out);
    }
    // Verify the raw copy before the GPT is moved (that changes header sectors on purpose).
    if a.flag("verify") {
        let (h, _, c) = copy::hash_region(dst, Region { offset: dr.offset, len: sr.len }, chunk, "verify", prog)?;
        if c {
            out["cancelled"] = json!(true);
            return Ok(out);
        }
        out["verified"] = json!(h == res.source_sha256);
        out["target_sha256"] = json!(h);
    }
    if whole_disk && dst.size() > sr.len {
        let plan = repair::plan_fix_gpt_after_grow(dst)?;
        if !plan.writes.is_empty() {
            for w in &plan.writes {
                dst.write_at(w.lba * dst.sector_size() as u64, &w.data)?;
            }
            dst.flush()?;
            out["gpt_resized"] = json!(plan.notes);
        }
    }
    Ok(out)
}

fn run(a: &Args, prog: &mut Progress) -> R<Value> {
    match a.cmd.as_str() {
        "list-drives" => {
            #[cfg(windows)]
            return Ok(win::list_drives());
            #[cfg(not(windows))]
            Ok(json!({ "drives": [] }))
        }
        "inspect" => {
            let t = a.target("target")?;
            let mut dev = open_target(&t, false, a.sector()?)?;
            let mut v = parts::inspect(dev.as_mut())?;
            v["target"] = json!(t.display());
            Ok(v)
        }
        "read-sector" => read_sector_cmd(a),
        "write-sector" => write_sector_cmd(a),
        "restore-gpt" => {
            let t = a.target("target")?;
            let mut dev = open_target(&t, false, a.sector()?)?;
            let plan = repair::plan_restore_gpt(dev.as_mut(), a.get("mode").unwrap_or("auto"))?;
            plan_result(dev.as_mut(), &plan, a, &t)
        }
        "scan-vbr" | "rebuild-mbr" => {
            let t = a.target("target")?;
            let mut dev = open_target(&t, false, a.sector()?)?;
            let max = a.num("max-lba")?.map(|v| v as u64);
            let found = repair::scan_vbrs(dev.as_mut(), max, prog)?;
            if a.cmd == "scan-vbr" {
                return Ok(json!({ "volumes": found, "cancelled": util::cancelled() }));
            }
            let plan = repair::plan_rebuild_mbr(dev.as_mut(), &found, a.flag("active"))?;
            let mut r = plan_result(dev.as_mut(), &plan, a, &t)?;
            r["volumes"] = json!(found);
            Ok(r)
        }
        "set-active" => {
            let t = a.target("target")?;
            let mut dev = open_target(&t, false, a.sector()?)?;
            let slot = a.num("slot")?.ok_or_else(|| Fail::new("bad_args", "falta --slot"))? as u8;
            let plan = repair::plan_set_active(dev.as_mut(), slot)?;
            plan_result(dev.as_mut(), &plan, a, &t)
        }
        "backup-table" => {
            let t = a.target("target")?;
            let mut dev = open_target(&t, false, a.sector()?)?;
            let total = dev.total_sectors();
            let n = 34.min(total);
            let mut ranges = vec![(0, n)];
            if total > 2 * n {
                ranges.push((total - 33, 33));
            }
            let out = a.need("out")?;
            let bytes = repair::save_backup(dev.as_mut(), &ranges, out)?;
            Ok(json!({ "out": out, "bytes": bytes, "ranges": ranges }))
        }
        "restore-backup" => {
            let t = a.target("target")?;
            let mut dev = open_target(&t, false, a.sector()?)?;
            let (ss, writes) = repair::load_backup(a.need("from")?)?;
            if ss != dev.sector_size() {
                return Err(Fail::new("sector_mismatch", "o backup foi feito com outro tamanho de setor"));
            }
            if let Some(w) = writes.iter().find(|w| (w.lba * ss as u64) + w.data.len() as u64 > dev.size()) {
                return Err(Fail::new("layout", format!("o backup grava no LBA {}, fora deste disco", w.lba)));
            }
            let plan = repair::Plan { writes, notes: vec![] };
            plan_result(dev.as_mut(), &plan, a, &t)
        }
        "clone" => clone_cmd(a, prog),
        "verify" => {
            let mut s = open_target(&a.target("source")?, false, a.sector()?)?;
            let mut d = open_target(&a.target("target")?, false, a.sector()?)?;
            let (sr, _) = region_of(s.as_mut(), a.num("source-part")?)?;
            let (mut dr, _) = region_of(d.as_mut(), a.num("target-part")?)?;
            dr.len = sr.len.min(dr.len);
            let chunk = 8 << 20;
            let (h1, b1, c1) = copy::hash_region(s.as_mut(), sr, chunk, "hash-source", prog)?;
            if c1 {
                return Ok(json!({ "cancelled": true }));
            }
            let (h2, b2, c2) = copy::hash_region(d.as_mut(), dr, chunk, "hash-target", prog)?;
            Ok(json!({ "cancelled": c2, "source_sha256": h1, "target_sha256": h2, "match": !c2 && h1 == h2 && sr.len == dr.len, "bytes": sr.len, "bad_sectors": b1.bad_count + b2.bad_count }))
        }
        "hash" => {
            let mut s = open_target(&a.target("target")?, false, a.sector()?)?;
            let (r, info) = region_of(s.as_mut(), a.num("part")?)?;
            let (h, b, c) = copy::hash_region(s.as_mut(), r, 8 << 20, "hash", prog)?;
            Ok(json!({ "sha256": h, "bytes": r.len, "region": info, "cancelled": c, "bad_sectors": b.bad_count }))
        }
        "surface-test" => {
            let mut s = open_target(&a.target("target")?, false, a.sector()?)?;
            let (r, _) = region_of(s.as_mut(), a.num("part")?)?;
            let block = (a.num("block-kb")?.unwrap_or(1024).clamp(4, 16384) as usize) << 10;
            copy::surface_test(s.as_mut(), r, block, 600, prog)
        }
        "carve" => {
            let t = a.target("target")?;
            let out = a.need("out")?.to_string();
            #[cfg(windows)]
            if let Target::Disk(n) = &t {
                if win::disk_of_path(&out) == Some(*n) {
                    return Err(Fail::new("same_disk", "salve os arquivos recuperados em OUTRO disco, nunca no que está sendo varrido"));
                }
            }
            let ss = open_target(&t, false, a.sector()?)?.sector_size() as u64;
            let opts = carve::CarveOpts {
                types: a.get("types").map(|s| s.split(',').map(|x| x.trim().to_ascii_lowercase()).filter(|x| !x.is_empty()).collect()).unwrap_or_default(),
                max_bytes: a.num("max-mb")?.map(|m| (m.max(1) as u64) << 20),
                start: a.num("start-lba")?.unwrap_or(0).max(0) as u64 * ss,
                end: a.num("end-lba")?.map(|e| e.max(0) as u64 * ss),
                max_files: a.num("max-files")?.unwrap_or(100_000).max(1) as u64,
                skip_embedded: !a.flag("keep-embedded"),
                sector_override: a.sector()?,
            };
            carve::carve(&t, &out, &opts, prog)
        }
        "" | "help" => Ok(json!({ "commands": ["list-drives", "inspect", "read-sector", "write-sector", "restore-gpt", "scan-vbr", "rebuild-mbr", "set-active", "backup-table", "restore-backup", "clone", "verify", "hash", "surface-test", "carve"] })),
        other => Err(Fail::new("bad_args", format!("comando desconhecido: {other}"))),
    }
}

const STREAMING: &[&str] = &["clone", "verify", "hash", "surface-test", "carve", "scan-vbr", "rebuild-mbr"];

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let a = Args::parse(&argv);
    let streaming = STREAMING.contains(&a.cmd.as_str());
    let mut prog = if streaming && !a.flag("quiet") { Progress::new() } else { Progress::silent() };
    if streaming {
        util::listen_for_cancel();
    }
    let res = run(&a, &mut prog);
    let (code, mut out) = match res {
        Ok(mut v) => {
            if let Some(o) = v.as_object_mut() {
                o.insert("ok".into(), json!(true));
            }
            (0, v)
        }
        Err(f) => (1, json!({ "ok": false, "code": f.code, "error": f.msg })),
    };
    if streaming {
        out["event"] = json!("done");
    }
    emit(&out);
    std::process::exit(code);
}
