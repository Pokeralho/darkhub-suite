//! Header surgery: every write is first expressed as a `Plan` (list of sector writes) so the UI can show a
//! before/after diff, and applying a plan always saves the sectors it overwrites to a backup file first.
use crate::device::{read_sectors, BlockDevice};
use crate::parts::{self, build_mbr, detect_vbr, parse_mbr, read_gpt_state, relocate_header, MbrEntry, Vbr};
use crate::util::{cancelled, hex, Fail, Progress, R};
use serde_json::{json, Value};
use std::fs;
use std::io::{Read, Write};

pub struct SectorWrite {
    pub lba: u64,
    pub data: Vec<u8>,
    pub what: String,
}

#[derive(Default)]
pub struct Plan {
    pub writes: Vec<SectorWrite>,
    pub notes: Vec<String>,
}

impl Plan {
    /// JSON with the before/after of every write (first sector of each in full hex, to keep it small).
    pub fn describe(&self, dev: &mut dyn BlockDevice) -> R<Value> {
        let ss = dev.sector_size() as u64;
        let mut items = Vec::new();
        for w in &self.writes {
            let n = (w.data.len() as u64).div_ceil(ss);
            let before = read_sectors(dev, w.lba, n)?;
            let changed = before.iter().zip(&w.data).filter(|(a, b)| a != b).count() + w.data.len().saturating_sub(before.len());
            items.push(json!({
                "lba": w.lba, "sectors": n, "what": w.what, "changed_bytes": changed,
                "before_hex": hex(&before[..before.len().min(ss as usize)]),
                "after_hex": hex(&w.data[..w.data.len().min(ss as usize)]),
            }));
        }
        Ok(json!({ "writes": items, "notes": self.notes }))
    }
}

const BACKUP_MAGIC: &[u8; 8] = b"DHDKBK01";

/// Saves the current contents of `ranges` (lba, sectors) to `path`.
pub fn save_backup(dev: &mut dyn BlockDevice, ranges: &[(u64, u64)], path: &str) -> R<u64> {
    let ss = dev.sector_size();
    let mut out = Vec::new();
    out.extend_from_slice(BACKUP_MAGIC);
    out.extend_from_slice(&ss.to_le_bytes());
    out.extend_from_slice(&(ranges.len() as u32).to_le_bytes());
    out.extend_from_slice(&dev.size().to_le_bytes());
    for &(lba, n) in ranges {
        let data = read_sectors(dev, lba, n)?;
        out.extend_from_slice(&lba.to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&data);
    }
    let mut f = fs::File::create(path)?;
    f.write_all(&out)?;
    f.sync_all()?;
    Ok(out.len() as u64)
}

pub fn load_backup(path: &str) -> R<(u32, Vec<SectorWrite>)> {
    let mut b = Vec::new();
    fs::File::open(path)?.read_to_end(&mut b)?;
    if b.len() < 24 || &b[..8] != BACKUP_MAGIC {
        return Err(Fail::new("bad_backup", "arquivo não é um backup de setores do DarkHub"));
    }
    let ss = parts::u32le(&b, 8);
    let count = parts::u32le(&b, 12) as usize;
    let mut pos = 24;
    let mut writes = Vec::new();
    for _ in 0..count {
        if pos + 12 > b.len() {
            return Err(Fail::new("bad_backup", "backup truncado"));
        }
        let lba = parts::u64le(&b, pos);
        let len = parts::u32le(&b, pos + 8) as usize;
        pos += 12;
        if pos + len > b.len() {
            return Err(Fail::new("bad_backup", "backup truncado"));
        }
        writes.push(SectorWrite { lba, data: b[pos..pos + len].to_vec(), what: "restauração do backup".into() });
        pos += len;
    }
    Ok((ss, writes))
}

/// Backs up every sector the plan touches, then writes and flushes.
pub fn apply(dev: &mut dyn BlockDevice, plan: &Plan, backup_path: &str) -> R<Value> {
    let ss = dev.sector_size() as u64;
    for w in &plan.writes {
        if w.data.len() as u64 % ss != 0 {
            return Err(Fail::new("internal", "escrita não alinhada ao setor"));
        }
    }
    let ranges: Vec<(u64, u64)> = plan.writes.iter().map(|w| (w.lba, w.data.len() as u64 / ss)).collect();
    let backup_bytes = save_backup(dev, &ranges, backup_path)?;
    for w in &plan.writes {
        dev.write_at(w.lba * ss, &w.data)?;
    }
    dev.flush()?;
    // Read back to prove the write landed.
    for w in &plan.writes {
        let back = read_sectors(dev, w.lba, w.data.len() as u64 / ss)?;
        if back != w.data {
            return Err(Fail::new("verify_failed", format!("o setor {} não ficou como esperado depois da gravação", w.lba)));
        }
    }
    Ok(json!({ "applied": plan.writes.len(), "backup_file": backup_path, "backup_bytes": backup_bytes }))
}

// ---------------------------------------------------------------- GPT

/// `mode`: "auto" (repair whichever copy is broken), "primary" (rebuild primary from backup),
/// "backup" (rebuild backup from primary).
pub fn plan_restore_gpt(dev: &mut dyn BlockDevice, mode: &str) -> R<Plan> {
    let ss = dev.sector_size() as usize;
    let last = dev.total_sectors() - 1;
    let st = read_gpt_state(dev)?;
    let p_ok = st.primary.as_ref().is_some_and(|c| c.valid());
    let b_ok = st.backup.as_ref().is_some_and(|c| c.valid());
    let mut plan = Plan::default();
    let target = match mode {
        "primary" => "primary",
        "backup" => "backup",
        _ if !p_ok && b_ok => "primary",
        _ if p_ok && !b_ok => "backup",
        _ if p_ok && b_ok => {
            plan.notes.push("As duas cópias do GPT estão íntegras: nada a fazer.".into());
            return Ok(plan);
        }
        _ => return Err(Fail::new("no_valid_gpt", "Nenhuma cópia íntegra do GPT. Use a varredura de VBR para reconstruir a tabela.")),
    };
    let pad = |mut v: Vec<u8>| {
        let n = v.len().div_ceil(ss) * ss;
        v.resize(n, 0);
        v
    };
    if target == "primary" {
        let src = st.backup.ok_or_else(|| Fail::new("no_valid_gpt", "GPT secundário não encontrado"))?;
        if !src.valid() {
            return Err(Fail::new("no_valid_gpt", "GPT secundário está corrompido"));
        }
        let entries = pad(src.entries_raw.clone());
        let entry_sectors = (entries.len() / ss) as u64;
        if 2 + entry_sectors > src.header.first_usable {
            return Err(Fail::new("layout", "a tabela de entradas não cabe antes do primeiro setor utilizável"));
        }
        plan.writes.push(SectorWrite { lba: 2, data: entries, what: "entradas do GPT primário".into() });
        plan.writes.push(SectorWrite { lba: 1, data: relocate_header(&src.header, ss, 1, st.backup_lba, 2, None), what: "cabeçalho do GPT primário".into() });
        plan.notes.push(format!("GPT primário reconstruído a partir do secundário (LBA {}).", st.backup_lba));
    } else {
        let src = st.primary.ok_or_else(|| Fail::new("no_valid_gpt", "GPT primário não encontrado"))?;
        if !src.valid() {
            return Err(Fail::new("no_valid_gpt", "GPT primário está corrompido"));
        }
        let entries = pad(src.entries_raw.clone());
        let entry_sectors = (entries.len() / ss) as u64;
        let entries_lba = last - entry_sectors;
        if entries_lba <= src.header.last_usable {
            return Err(Fail::new("layout", "não há espaço no fim do disco para o GPT secundário"));
        }
        plan.writes.push(SectorWrite { lba: entries_lba, data: entries, what: "entradas do GPT secundário".into() });
        plan.writes.push(SectorWrite { lba: last, data: relocate_header(&src.header, ss, last, 1, entries_lba, None), what: "cabeçalho do GPT secundário".into() });
        if src.header.alternate_lba != last {
            plan.writes.push(SectorWrite { lba: 1, data: relocate_header(&src.header, ss, 1, last, src.header.entries_lba, None), what: "cabeçalho primário apontando para o novo secundário".into() });
        }
        plan.notes.push(format!("GPT secundário reconstruído no fim do disco (LBA {last})."));
    }
    // A wiped LBA 0 makes Windows ignore a valid GPT: add a protective MBR when it is missing.
    let lba0 = read_sectors(dev, 0, 1)?;
    if !parse_mbr(&lba0).signature_ok {
        let sectors = last.min(u32::MAX as u64) as u32;
        let mut mbr = build_mbr(&lba0, &[MbrEntry { slot: 1, boot: false, ptype: 0xEE, lba_start: 1, sectors }]);
        mbr.resize(ss, 0);
        plan.writes.insert(0, SectorWrite { lba: 0, data: mbr, what: "MBR protetivo".into() });
        plan.notes.push("LBA 0 estava sem assinatura: um MBR protetivo também será gravado.".into());
    }
    Ok(plan)
}

/// After a whole-disk copy onto a larger disk the GPT backup sits in the middle: move it to the real end.
pub fn plan_fix_gpt_after_grow(dev: &mut dyn BlockDevice) -> R<Plan> {
    let ss = dev.sector_size() as usize;
    let last = dev.total_sectors() - 1;
    let st = read_gpt_state(dev)?;
    let mut plan = Plan::default();
    let Some(p) = st.primary.filter(|p| p.valid()) else { return Ok(plan) };
    if p.header.alternate_lba == last {
        return Ok(plan);
    }
    let mut entries = p.entries_raw.clone();
    entries.resize(entries.len().div_ceil(ss) * ss, 0);
    let entry_sectors = (entries.len() / ss) as u64;
    let entries_lba = last - entry_sectors;
    let last_usable = entries_lba - 1;
    plan.writes.push(SectorWrite { lba: 1, data: relocate_header(&p.header, ss, 1, last, 2.max(p.header.entries_lba), Some(last_usable)), what: "cabeçalho primário (disco maior)".into() });
    plan.writes.push(SectorWrite { lba: entries_lba, data: entries, what: "entradas do GPT secundário".into() });
    plan.writes.push(SectorWrite { lba: last, data: relocate_header(&p.header, ss, last, 1, entries_lba, Some(last_usable)), what: "cabeçalho do GPT secundário".into() });
    let lba0 = read_sectors(dev, 0, 1)?;
    let mbr = parse_mbr(&lba0);
    if let Some(e) = mbr.entries.iter().find(|e| e.ptype == 0xEE) {
        let mut ne = e.clone();
        ne.sectors = last.min(u32::MAX as u64) as u32;
        let mut s = build_mbr(&lba0, &[ne]);
        s.resize(ss, 0);
        plan.writes.insert(0, SectorWrite { lba: 0, data: s, what: "MBR protetivo com o novo tamanho".into() });
    }
    plan.notes.push(format!("GPT ajustado ao novo tamanho: espaço livre no fim agora vai até o LBA {last_usable}."));
    Ok(plan)
}

// ---------------------------------------------------------------- VBR scan / MBR rebuild

/// Looks for boot sectors at every alignment boundary, plus the sector just before it (where the NTFS backup
/// boot sector of an aligned partition ends up). A backup copy points back to its partition through the
/// "hidden sectors" field, so a volume whose first sector was wiped is still found.
pub fn scan_vbrs(dev: &mut dyn BlockDevice, max_lba: Option<u64>, prog: &mut Progress) -> R<Vec<Value>> {
    let ss = dev.sector_size();
    let step: u64 = if ss >= 4096 { 256 } else { 2048 };
    let end = max_lba.unwrap_or(u64::MAX).min(dev.total_sectors());
    let mut found: Vec<(Vbr, &'static str)> = Vec::new();
    let check = |dev: &mut dyn BlockDevice, lba: u64, found: &mut Vec<(Vbr, &'static str)>| -> R<()> {
        let s = match read_sectors(dev, lba, 1) {
            Ok(s) => s,
            Err(_) => return Ok(()), // unreadable sector: keep scanning
        };
        let Some(v) = detect_vbr(&s, lba, ss) else { return Ok(()) };
        let hidden = parts::u32le(&s, 0x1C) as u64;
        if v.fs == "NTFS" && hidden > 0 && hidden < lba && hidden + v.sectors - 1 == lba {
            found.push((Vbr { start_lba: hidden, ..v }, "backup"));
        } else {
            found.push((v, "primary"));
        }
        Ok(())
    };
    // LBA 63: old (pre-Vista) alignment.
    if end > 63 {
        check(dev, 63, &mut found)?;
    }
    let mut lba = step;
    while lba < end {
        if cancelled() {
            break;
        }
        check(dev, lba - 1, &mut found)?;
        check(dev, lba, &mut found)?;
        prog.tick("scan", lba * ss as u64, end * ss as u64, json!({ "found": found.len() }));
        lba += step;
    }
    // Merge primary + backup hits for the same volume.
    found.sort_by_key(|(v, _)| v.start_lba);
    let mut out: Vec<Value> = Vec::new();
    let mut last_start = u64::MAX;
    for (v, src) in &found {
        if v.start_lba == last_start {
            if let Some(o) = out.last_mut() {
                o["sources"].as_array_mut().unwrap().push(json!(src));
            }
            continue;
        }
        last_start = v.start_lba;
        out.push(json!({ "fs": v.fs, "start_lba": v.start_lba, "sectors": v.sectors, "size": v.sectors * ss as u64, "label": v.label, "sources": [src] }));
    }
    Ok(out)
}

pub fn plan_rebuild_mbr(dev: &mut dyn BlockDevice, vbrs: &[Value], active_first: bool) -> R<Plan> {
    let ss = dev.sector_size() as usize;
    let total = dev.total_sectors();
    let mut plan = Plan::default();
    let mut entries: Vec<MbrEntry> = Vec::new();
    let mut end = 0u64;
    for v in vbrs {
        let start = v["start_lba"].as_u64().unwrap_or(0);
        let sectors = v["sectors"].as_u64().unwrap_or(0);
        let fs = v["fs"].as_str().unwrap_or("");
        let ptype = match fs {
            "NTFS" | "exFAT" | "BitLocker" => 0x07,
            "FAT32" => 0x0C,
            "FAT16" => 0x0E,
            "FAT12" => 0x01,
            _ => {
                plan.notes.push(format!("{fs} em LBA {start} ignorado (tipo não suportado no MBR)."));
                continue;
            }
        };
        if start < end || sectors == 0 || start + sectors > total {
            plan.notes.push(format!("{fs} em LBA {start} ignorado (sobrepõe outro volume ou passa do fim do disco)."));
            continue;
        }
        if start + sectors > u32::MAX as u64 {
            plan.notes.push(format!("{fs} em LBA {start} passa de 2 TiB: MBR não consegue endereçar, use GPT."));
            continue;
        }
        if entries.len() == 4 {
            plan.notes.push("Mais de 4 volumes: só os 4 primeiros cabem no MBR.".into());
            break;
        }
        entries.push(MbrEntry { slot: entries.len() as u8 + 1, boot: active_first && entries.is_empty(), ptype, lba_start: start as u32, sectors: sectors as u32 });
        end = start + sectors;
    }
    if entries.is_empty() {
        return Err(Fail::new("nothing_found", "Nenhum volume reconhecido para montar o MBR."));
    }
    let mut lba0 = read_sectors(dev, 0, 1)?;
    if lba0.len() >= 444 && lba0[440..444].iter().all(|&b| b == 0) {
        let sig = (std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(1) as u32) | 1;
        lba0[440..444].copy_from_slice(&sig.to_le_bytes());
    }
    let mut mbr = build_mbr(&lba0, &entries);
    mbr.resize(ss, 0);
    if lba0[..440].iter().all(|&b| b == 0) {
        plan.notes.push("Sem código de boot no LBA 0: o disco volta a ser lido como dados; para dar boot, rode bootsect /nt60 depois.".into());
    }
    plan.writes.push(SectorWrite { lba: 0, data: mbr, what: format!("MBR reconstruído com {} partição(ões)", entries.len()) });
    Ok(plan)
}

/// Sets (or clears) the active flag of an MBR slot.
pub fn plan_set_active(dev: &mut dyn BlockDevice, slot: u8) -> R<Plan> {
    let ss = dev.sector_size() as usize;
    let lba0 = read_sectors(dev, 0, 1)?;
    let mbr = parse_mbr(&lba0);
    if !mbr.signature_ok || !mbr.entries.iter().any(|e| e.slot == slot) {
        return Err(Fail::new("bad_args", format!("partição {slot} não existe no MBR")));
    }
    let entries: Vec<MbrEntry> = mbr.entries.iter().map(|e| MbrEntry { boot: e.slot == slot, ..e.clone() }).collect();
    let mut s = build_mbr(&lba0, &entries);
    s.resize(ss, 0);
    let mut plan = Plan::default();
    plan.writes.push(SectorWrite { lba: 0, data: s, what: format!("partição {slot} marcada como ativa") });
    Ok(plan)
}
