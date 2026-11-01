//! Partition tables (MBR, GPT) and volume boot record detection.
use crate::device::{read_bytes, read_sectors, BlockDevice};
use serde_json::{json, Value};
use std::io;

pub fn u16le(b: &[u8], o: usize) -> u16 {
    u16::from_le_bytes([b[o], b[o + 1]])
}
pub fn u32le(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
pub fn u64le(b: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}

// ---------------------------------------------------------------- MBR

#[derive(Debug, Clone, PartialEq)]
pub struct MbrEntry {
    pub slot: u8,
    pub boot: bool,
    pub ptype: u8,
    pub lba_start: u32,
    pub sectors: u32,
}

#[derive(Debug, Clone)]
pub struct Mbr {
    pub signature_ok: bool,
    pub disk_signature: u32,
    pub entries: Vec<MbrEntry>,
}

pub fn parse_mbr(s: &[u8]) -> Mbr {
    let signature_ok = s.len() >= 512 && s[510] == 0x55 && s[511] == 0xAA;
    let mut entries = Vec::new();
    if signature_ok {
        for i in 0..4 {
            let e = &s[446 + i * 16..462 + i * 16];
            if e[4] != 0 {
                entries.push(MbrEntry { slot: i as u8 + 1, boot: e[0] == 0x80, ptype: e[4], lba_start: u32le(e, 8), sectors: u32le(e, 12) });
            }
        }
    }
    Mbr { signature_ok, disk_signature: if s.len() >= 444 { u32le(s, 440) } else { 0 }, entries }
}

pub fn mbr_type_name(t: u8) -> &'static str {
    match t {
        0x01 | 0x04 | 0x06 | 0x0E => "FAT12/16",
        0x05 | 0x0F => "Estendida",
        0x07 => "NTFS/exFAT",
        0x0B | 0x0C => "FAT32",
        0x27 => "Recuperação (Windows RE)",
        0x82 => "Linux swap",
        0x83 => "Linux",
        0x8E => "Linux LVM",
        0xEE => "GPT protetivo",
        0xEF => "EFI System",
        _ => "Desconhecido",
    }
}

/// CHS fields are set to the LBA-mode sentinel (0xFE 0xFF 0xFF) as modern tools do.
pub fn build_mbr(keep: &[u8], entries: &[MbrEntry]) -> Vec<u8> {
    let mut s = vec![0u8; 512];
    if keep.len() >= 446 {
        s[..446].copy_from_slice(&keep[..446]); // boot code + disk signature + reserved
    }
    for e in entries.iter().take(4) {
        let o = 446 + (e.slot as usize - 1) * 16;
        s[o] = if e.boot { 0x80 } else { 0 };
        s[o + 1..o + 4].copy_from_slice(&[0xFE, 0xFF, 0xFF]);
        s[o + 4] = e.ptype;
        s[o + 5..o + 8].copy_from_slice(&[0xFE, 0xFF, 0xFF]);
        s[o + 8..o + 12].copy_from_slice(&e.lba_start.to_le_bytes());
        s[o + 12..o + 16].copy_from_slice(&e.sectors.to_le_bytes());
    }
    s[510] = 0x55;
    s[511] = 0xAA;
    s
}

// ---------------------------------------------------------------- GPT

#[derive(Debug, Clone)]
pub struct GptHeader {
    pub raw: Vec<u8>,
    pub header_size: u32,
    pub header_crc_ok: bool,
    pub my_lba: u64,
    pub alternate_lba: u64,
    pub first_usable: u64,
    pub last_usable: u64,
    pub disk_guid: String,
    pub entries_lba: u64,
    pub num_entries: u32,
    pub entry_size: u32,
    pub entries_crc: u32,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct GptEntry {
    pub index: u32,
    pub type_guid: String,
    pub unique_guid: String,
    pub first_lba: u64,
    pub last_lba: u64,
    pub attributes: u64,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct GptCopy {
    pub header: GptHeader,
    pub entries_raw: Vec<u8>,
    pub entries_crc_ok: bool,
}

impl GptCopy {
    pub fn valid(&self) -> bool {
        self.header.header_crc_ok && self.entries_crc_ok
    }
}

pub fn guid_str(b: &[u8]) -> String {
    format!(
        "{:08X}-{:04X}-{:04X}-{:02X}{:02X}-{:02X}{:02X}{:02X}{:02X}{:02X}{:02X}",
        u32le(b, 0),
        u16le(b, 4),
        u16le(b, 6),
        b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]
    )
}

pub fn gpt_type_name(g: &str) -> &'static str {
    match g {
        "EBD0A0A2-B9E5-4433-87C0-68B6B72699C7" => "Dados básicos (Windows)",
        "C12A7328-F81F-11D2-BA4B-00A0C93EC93B" => "EFI System (ESP)",
        "E3C9E316-0B5C-4DB8-817D-F92DF00215AE" => "Microsoft Reservada (MSR)",
        "DE94BBA4-06D1-4D40-A16A-BFD50179D6AC" => "Recuperação do Windows",
        "5808C8AA-7E8F-42E0-85D2-E1E90434CFB3" | "AF9B60A0-1431-4F62-BC68-3311714A69AD" => "Disco dinâmico (LDM)",
        "E75CAF8F-F680-4CEE-AFA3-B001E56EFC2D" => "Storage Spaces",
        "0FC63DAF-8483-4772-8E79-3D69D8477DE4" => "Linux",
        "0657FD6D-A4AB-43C4-84E5-0933C84B4F4F" => "Linux swap",
        "E6D6D379-F507-44C2-A23C-238F2A3DF928" => "Linux LVM",
        "4F68BCE3-E8CD-4DB1-96E7-FBCAF984B709" => "Linux root (x86-64)",
        "48465300-0000-11AA-AA11-00306543ECAC" => "Apple HFS+",
        "7C3457EF-0000-11AA-AA11-00306543ECAC" => "Apple APFS",
        "21686148-6449-6E6F-744E-656564454649" => "BIOS boot",
        _ => "Desconhecido",
    }
}

pub fn header_crc(raw: &[u8], size: usize) -> u32 {
    let mut h = raw[..size].to_vec();
    h[16..20].fill(0);
    crc32fast::hash(&h)
}

pub fn read_gpt_at(dev: &mut dyn BlockDevice, lba: u64) -> io::Result<Option<GptCopy>> {
    if lba >= dev.total_sectors() {
        return Ok(None);
    }
    let s = read_sectors(dev, lba, 1)?;
    if s.len() < 92 || &s[0..8] != b"EFI PART" {
        return Ok(None);
    }
    let header_size = u32le(&s, 12);
    let hs = (header_size as usize).clamp(92, s.len());
    let header = GptHeader {
        header_crc_ok: (92..=s.len() as u32).contains(&header_size) && header_crc(&s, hs) == u32le(&s, 16),
        header_size,
        my_lba: u64le(&s, 24),
        alternate_lba: u64le(&s, 32),
        first_usable: u64le(&s, 40),
        last_usable: u64le(&s, 48),
        disk_guid: guid_str(&s[56..72]),
        entries_lba: u64le(&s, 72),
        num_entries: u32le(&s, 80),
        entry_size: u32le(&s, 84),
        entries_crc: u32le(&s, 88),
        raw: s,
    };
    let len = header.num_entries as u64 * header.entry_size as u64;
    let sane = header.entry_size >= 128 && header.entry_size.is_power_of_two() && len > 0 && len <= 4 << 20;
    let entries_raw = if sane && header.entries_lba < dev.total_sectors() {
        let off = header.entries_lba * dev.sector_size() as u64;
        read_bytes(dev, off, len as usize)?
    } else {
        Vec::new()
    };
    let entries_crc_ok = sane && entries_raw.len() as u64 == len && crc32fast::hash(&entries_raw) == header.entries_crc;
    Ok(Some(GptCopy { header, entries_raw, entries_crc_ok }))
}

pub fn parse_gpt_entries(c: &GptCopy) -> Vec<GptEntry> {
    let es = c.header.entry_size as usize;
    let mut out = Vec::new();
    if es == 0 {
        return out;
    }
    for (i, e) in c.entries_raw.chunks_exact(es).enumerate() {
        if e[0..16].iter().all(|&b| b == 0) {
            continue;
        }
        let name_u16: Vec<u16> = e[56..128].chunks_exact(2).map(|p| u16::from_le_bytes([p[0], p[1]])).take_while(|&c| c != 0).collect();
        out.push(GptEntry {
            index: i as u32 + 1,
            type_guid: guid_str(&e[0..16]),
            unique_guid: guid_str(&e[16..32]),
            first_lba: u64le(e, 32),
            last_lba: u64le(e, 40),
            attributes: u64le(e, 48),
            name: String::from_utf16_lossy(&name_u16),
        });
    }
    out
}

/// Builds a header sector for `copy` relocated to `my_lba`, with entries at `entries_lba`.
pub fn relocate_header(src: &GptHeader, sector: usize, my_lba: u64, alternate: u64, entries_lba: u64, last_usable: Option<u64>) -> Vec<u8> {
    let mut h = vec![0u8; sector];
    let hs = (src.header_size as usize).clamp(92, sector);
    h[..hs].copy_from_slice(&src.raw[..hs]);
    h[24..32].copy_from_slice(&my_lba.to_le_bytes());
    h[32..40].copy_from_slice(&alternate.to_le_bytes());
    if let Some(l) = last_usable {
        h[48..56].copy_from_slice(&l.to_le_bytes());
    }
    h[72..80].copy_from_slice(&entries_lba.to_le_bytes());
    let crc = header_crc(&h, hs);
    h[16..20].copy_from_slice(&crc.to_le_bytes());
    h
}

pub struct GptState {
    pub primary: Option<GptCopy>,
    pub backup: Option<GptCopy>,
    pub backup_lba: u64,
}

pub fn read_gpt_state(dev: &mut dyn BlockDevice) -> io::Result<GptState> {
    let last = dev.total_sectors().saturating_sub(1);
    let primary = read_gpt_at(dev, 1)?;
    // Prefer where the primary says its backup is; fall back to the last sector.
    let mut backup_lba = last;
    let mut backup = None;
    if let Some(p) = primary.as_ref().filter(|p| p.header.header_crc_ok) {
        if p.header.alternate_lba != last {
            backup = read_gpt_at(dev, p.header.alternate_lba)?;
            if backup.is_some() {
                backup_lba = p.header.alternate_lba;
            }
        }
    }
    if backup.is_none() {
        backup = read_gpt_at(dev, last)?;
        backup_lba = last;
    }
    Ok(GptState { primary, backup, backup_lba })
}

// ---------------------------------------------------------------- volume boot records

#[derive(Debug, Clone)]
pub struct Vbr {
    pub fs: &'static str,
    pub start_lba: u64,
    pub sectors: u64,
    pub label: String,
}

/// Recognises a boot sector. `at_lba` is where it was read; `hidden` (sectors before the volume) is used
/// to tell a primary boot sector from the NTFS/FAT32 backup copy.
pub fn detect_vbr(s: &[u8], at_lba: u64, ss: u32) -> Option<Vbr> {
    if s.len() < 512 || s[510] != 0x55 || s[511] != 0xAA {
        return None;
    }
    let bps = u16le(s, 11) as u32;
    let scale = |n: u64| if bps > 0 && bps != ss { n * bps as u64 / ss as u64 } else { n };
    if &s[3..11] == b"NTFS    " {
        let total = u64le(s, 0x28) + 1; // the field excludes the backup boot sector
        return Some(Vbr { fs: "NTFS", start_lba: at_lba, sectors: scale(total), label: String::new() });
    }
    if &s[3..11] == b"EXFAT   " {
        let shift = s[108] as u32; // BytesPerSectorShift
        let len = u64le(s, 0x48);
        let sectors = if (1u64 << shift) as u32 != ss { len * (1u64 << shift) / ss as u64 } else { len };
        return Some(Vbr { fs: "exFAT", start_lba: at_lba, sectors, label: String::new() });
    }
    if &s[3..11] == b"-FVE-FS-" {
        return Some(Vbr { fs: "BitLocker", start_lba: at_lba, sectors: scale(u64le(s, 0x28)), label: String::new() });
    }
    if &s[3..7] == b"ReFS" {
        return Some(Vbr { fs: "ReFS", start_lba: at_lba, sectors: 0, label: String::new() });
    }
    if &s[82..90] == b"FAT32   " && bps > 0 {
        let label = String::from_utf8_lossy(&s[71..82]).trim().to_string();
        return Some(Vbr { fs: "FAT32", start_lba: at_lba, sectors: scale(u32le(s, 0x20) as u64), label });
    }
    if &s[54..59] == b"FAT16" || &s[54..59] == b"FAT12" {
        let t16 = u16le(s, 0x13) as u64;
        let total = if t16 != 0 { t16 } else { u32le(s, 0x20) as u64 };
        let label = String::from_utf8_lossy(&s[43..54]).trim().to_string();
        return Some(Vbr { fs: if &s[54..59] == b"FAT16" { "FAT16" } else { "FAT12" }, start_lba: at_lba, sectors: scale(total), label });
    }
    None
}

/// Filesystem at the start of a partition (also recognises ext2/3/4 and swap, which have no 0x55AA).
pub fn detect_fs(dev: &mut dyn BlockDevice, start_lba: u64) -> io::Result<(String, String)> {
    let ss = dev.sector_size() as u64;
    let head = read_bytes(dev, start_lba * ss, 4096)?;
    if head.len() >= 512 {
        if let Some(v) = detect_vbr(&head, start_lba, ss as u32) {
            return Ok((v.fs.to_string(), v.label));
        }
    }
    if head.len() >= 1024 + 0x80 && u16le(&head, 1024 + 56) == 0xEF53 {
        let compat = u32le(&head, 1024 + 0x5C);
        let incompat = u32le(&head, 1024 + 0x60);
        let fs = if incompat & 0x40 != 0 { "ext4" } else if compat & 0x4 != 0 { "ext3" } else { "ext2" };
        let label = String::from_utf8_lossy(&head[1024 + 0x78..1024 + 0x88]).trim_end_matches('\0').to_string();
        return Ok((fs.into(), label));
    }
    if head.len() >= 4096 && &head[4086..4096] == b"SWAPSPACE2" {
        return Ok(("swap".into(), String::new()));
    }
    Ok(("RAW".into(), String::new()))
}

// ---------------------------------------------------------------- inspect

pub fn fs_kind(fs: &str) -> &'static str {
    match fs {
        "NTFS" | "ReFS" | "BitLocker" => "ntfs",
        "FAT32" | "FAT16" | "FAT12" | "exFAT" => "fat",
        "ext2" | "ext3" | "ext4" | "swap" => "ext",
        _ => "raw",
    }
}

/// One partition, independent of the table it came from.
#[derive(Debug, Clone)]
pub struct Part {
    pub index: u32,
    pub start_lba: u64,
    pub sectors: u64,
    pub type_name: String,
    pub type_id: String,
    pub name: String,
    pub boot: bool,
}

pub fn partitions(dev: &mut dyn BlockDevice) -> io::Result<(String, Vec<Part>)> {
    let lba0 = read_sectors(dev, 0, 1)?;
    let mbr = parse_mbr(&lba0);
    let st = read_gpt_state(dev)?;
    let gpt = [st.primary.as_ref(), st.backup.as_ref()].into_iter().flatten().find(|c| c.valid()).cloned();
    if let Some(g) = gpt {
        let parts = parse_gpt_entries(&g)
            .into_iter()
            .map(|e| Part {
                index: e.index,
                start_lba: e.first_lba,
                sectors: e.last_lba.saturating_sub(e.first_lba) + 1,
                type_name: gpt_type_name(&e.type_guid).to_string(),
                type_id: e.type_guid,
                name: e.name,
                boot: false,
            })
            .collect();
        return Ok(("gpt".into(), parts));
    }
    if mbr.signature_ok && !mbr.entries.is_empty() {
        let parts = mbr
            .entries
            .iter()
            .filter(|e| e.ptype != 0xEE)
            .map(|e| Part {
                index: e.slot as u32,
                start_lba: e.lba_start as u64,
                sectors: e.sectors as u64,
                type_name: mbr_type_name(e.ptype).to_string(),
                type_id: format!("0x{:02X}", e.ptype),
                name: String::new(),
                boot: e.boot,
            })
            .collect();
        return Ok(("mbr".into(), parts));
    }
    Ok(("none".into(), Vec::new()))
}

fn gpt_json(c: &Option<GptCopy>, lba: u64) -> Value {
    match c {
        None => json!({ "present": false, "lba": lba }),
        Some(c) => json!({
            "present": true, "lba": lba, "valid": c.valid(),
            "header_crc_ok": c.header.header_crc_ok, "entries_crc_ok": c.entries_crc_ok,
            "my_lba": c.header.my_lba, "alternate_lba": c.header.alternate_lba,
            "first_usable": c.header.first_usable, "last_usable": c.header.last_usable,
            "entries_lba": c.header.entries_lba, "num_entries": c.header.num_entries,
            "disk_guid": c.header.disk_guid,
        }),
    }
}

pub fn inspect(dev: &mut dyn BlockDevice) -> io::Result<Value> {
    let ss = dev.sector_size() as u64;
    let total = dev.total_sectors();
    let lba0 = read_sectors(dev, 0, 1)?;
    let mbr = parse_mbr(&lba0);
    let st = read_gpt_state(dev)?;
    let (scheme, parts) = partitions(dev)?;

    let mut items = Vec::new();
    let mut sorted = parts.clone();
    sorted.sort_by_key(|p| p.start_lba);
    let mut cursor = 0u64;
    let reserved = if scheme == "gpt" { 34 } else { 1 };
    for p in &sorted {
        if p.start_lba > cursor.max(reserved) + 2047 {
            let gap_start = cursor.max(reserved);
            items.push(json!({ "kind": "unallocated", "start_lba": gap_start, "sectors": p.start_lba - gap_start, "size": (p.start_lba - gap_start) * ss }));
        }
        let (fs, label) = if p.start_lba < total { detect_fs(dev, p.start_lba)? } else { ("RAW".into(), String::new()) };
        items.push(json!({
            "kind": fs_kind(&fs), "index": p.index, "start_lba": p.start_lba, "sectors": p.sectors,
            "size": p.sectors * ss, "offset": p.start_lba * ss, "fs": fs, "label": label,
            "type_name": p.type_name, "type_id": p.type_id, "name": p.name, "boot": p.boot,
            "beyond_disk": p.start_lba + p.sectors > total,
        }));
        cursor = cursor.max(p.start_lba + p.sectors);
    }
    let end = if scheme == "gpt" { total.saturating_sub(33) } else { total };
    if end > cursor.max(reserved) + 2047 {
        let s = cursor.max(reserved);
        items.push(json!({ "kind": "unallocated", "start_lba": s, "sectors": end - s, "size": (end - s) * ss }));
    }

    let mut problems = Vec::new();
    if !mbr.signature_ok {
        problems.push("LBA 0 sem assinatura 0x55AA (MBR apagado ou corrompido)");
    }
    match (&st.primary, &st.backup) {
        (Some(p), Some(b)) if p.valid() && b.valid() => {}
        (Some(p), _) if p.valid() => problems.push("GPT secundário ausente ou corrompido"),
        (_, Some(b)) if b.valid() => problems.push("GPT primário ausente ou corrompido (dá para restaurar do secundário)"),
        (None, None) if mbr.entries.iter().any(|e| e.ptype == 0xEE) => problems.push("MBR protetivo presente mas nenhum GPT válido"),
        (Some(_), _) | (_, Some(_)) => problems.push("GPT encontrado mas os CRCs não conferem nas duas cópias"),
        _ => {}
    }
    if scheme == "none" {
        problems.push("Nenhuma tabela de partições válida: use a varredura de VBR para reconstruir");
    }

    Ok(json!({
        "size": dev.size(), "sector_size": ss, "total_sectors": total, "scheme": scheme,
        "mbr": {
            "signature_ok": mbr.signature_ok, "disk_signature": format!("{:08X}", mbr.disk_signature),
            "boot_code_present": lba0.len() >= 440 && lba0[..440].iter().any(|&b| b != 0),
            "entries": mbr.entries.iter().map(|e| json!({ "slot": e.slot, "boot": e.boot, "type": format!("0x{:02X}", e.ptype), "type_name": mbr_type_name(e.ptype), "lba_start": e.lba_start, "sectors": e.sectors })).collect::<Vec<_>>(),
        },
        "gpt": { "primary": gpt_json(&st.primary, 1), "backup": gpt_json(&st.backup, st.backup_lba) },
        "layout": items,
        "problems": problems,
    }))
}
