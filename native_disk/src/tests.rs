//! Every test runs against synthetic image files in the temp folder. Nothing touches a real disk.
use crate::carve::{self, CarveOpts};
use crate::copy::{self, Region};
use crate::device::{read_sectors, BlockDevice, FileDevice, Target};
use crate::parts;
use crate::repair;
use crate::util::Progress;
use crate::guard_write;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};

static N: AtomicU32 = AtomicU32::new(0);

fn tmp(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("dh_disk_test_{}_{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
    fs::create_dir_all(&d).unwrap();
    d.join(name)
}

const BASIC: [u8; 16] = [0xA2, 0xA0, 0xD0, 0xEB, 0xE5, 0xB9, 0x33, 0x44, 0x87, 0xC0, 0x68, 0xB6, 0xB7, 0x26, 0x99, 0xC7];

fn gpt_header(ss: usize, my: u64, alt: u64, entries_lba: u64, last_usable: u64, entries_crc: u32) -> Vec<u8> {
    let mut h = vec![0u8; ss];
    h[0..8].copy_from_slice(b"EFI PART");
    h[8..12].copy_from_slice(&0x0001_0000u32.to_le_bytes());
    h[12..16].copy_from_slice(&92u32.to_le_bytes());
    h[24..32].copy_from_slice(&my.to_le_bytes());
    h[32..40].copy_from_slice(&alt.to_le_bytes());
    h[40..48].copy_from_slice(&(if ss == 4096 { 6u64 } else { 34u64 }).to_le_bytes());
    h[48..56].copy_from_slice(&last_usable.to_le_bytes());
    h[56..72].copy_from_slice(&[7u8; 16]);
    h[72..80].copy_from_slice(&entries_lba.to_le_bytes());
    h[80..84].copy_from_slice(&128u32.to_le_bytes());
    h[84..88].copy_from_slice(&128u32.to_le_bytes());
    h[88..92].copy_from_slice(&entries_crc.to_le_bytes());
    let crc = parts::header_crc(&h, 92);
    h[16..20].copy_from_slice(&crc.to_le_bytes());
    h
}

fn ntfs_vbr(ss: usize, start: u64, sectors: u64) -> Vec<u8> {
    let mut s = vec![0u8; ss];
    s[0..3].copy_from_slice(&[0xEB, 0x52, 0x90]);
    s[3..11].copy_from_slice(b"NTFS    ");
    s[11..13].copy_from_slice(&(ss as u16).to_le_bytes());
    s[0x1C..0x20].copy_from_slice(&(start as u32).to_le_bytes());
    s[0x28..0x30].copy_from_slice(&(sectors - 1).to_le_bytes());
    s[510] = 0x55;
    s[511] = 0xAA;
    s
}

/// GPT disk with one NTFS partition [first, last].
fn build_gpt(path: &PathBuf, ss: usize, total: u64, first: u64, last: u64) -> Vec<u8> {
    let mut entries = vec![0u8; 128 * 128];
    entries[0..16].copy_from_slice(&BASIC);
    entries[16..32].copy_from_slice(&[9u8; 16]);
    entries[32..40].copy_from_slice(&first.to_le_bytes());
    entries[40..48].copy_from_slice(&last.to_le_bytes());
    for (i, c) in "DADOS".encode_utf16().enumerate() {
        entries[56 + i * 2..58 + i * 2].copy_from_slice(&c.to_le_bytes());
    }
    let crc = crc32fast::hash(&entries);
    let es = (entries.len() / ss) as u64;
    let mut img = vec![0u8; total as usize * ss];
    let mut mbr = parts::build_mbr(&[], &[parts::MbrEntry { slot: 1, boot: false, ptype: 0xEE, lba_start: 1, sectors: (total - 1) as u32 }]);
    mbr.resize(ss, 0);
    img[..ss].copy_from_slice(&mbr);
    let last_usable = total - 2 - es;
    img[ss..2 * ss].copy_from_slice(&gpt_header(ss, 1, total - 1, 2, last_usable, crc));
    img[2 * ss..2 * ss + entries.len()].copy_from_slice(&entries);
    let bl = total - 1 - es;
    img[bl as usize * ss..bl as usize * ss + entries.len()].copy_from_slice(&entries);
    img[(total - 1) as usize * ss..].copy_from_slice(&gpt_header(ss, total - 1, 1, bl, last_usable, crc));
    let n = last - first + 1;
    img[first as usize * ss..(first as usize + 1) * ss].copy_from_slice(&ntfs_vbr(ss, first, n));
    img[(first + n - 1) as usize * ss..(first + n) as usize * ss].copy_from_slice(&ntfs_vbr(ss, first, n));
    fs::write(path, &img).unwrap();
    img
}

fn open(p: &PathBuf, write: bool, ss: u32) -> FileDevice {
    FileDevice::open(p.to_str().unwrap(), write, ss).unwrap()
}

#[test]
fn inspect_reads_gpt_and_ntfs() {
    let p = tmp("d.raw");
    build_gpt(&p, 512, 8192, 2048, 6143);
    let mut d = open(&p, false, 512);
    let v = parts::inspect(&mut d).unwrap();
    assert_eq!(v["scheme"], "gpt");
    assert_eq!(v["gpt"]["primary"]["valid"], true);
    assert_eq!(v["gpt"]["backup"]["valid"], true);
    let part = v["layout"].as_array().unwrap().iter().find(|x| x["fs"] == "NTFS").unwrap();
    assert_eq!(part["start_lba"], 2048);
    assert_eq!(part["kind"], "ntfs");
    assert_eq!(part["name"], "DADOS");
    assert!(v["problems"].as_array().unwrap().is_empty());
}

#[test]
fn restores_wiped_primary_gpt_and_protective_mbr() {
    for ss in [512usize, 4096] {
        let p = tmp("w.raw");
        let total = if ss == 512 { 8192 } else { 2048 };
        let orig = build_gpt(&p, ss, total, if ss == 512 { 2048 } else { 256 }, total - 100);
        // Wiper: zero LBA 0..33 (512) / 0..5 (4K).
        let wipe = if ss == 512 { 34 } else { 6 } * ss;
        let mut img = orig.clone();
        img[..wipe].fill(0);
        fs::write(&p, &img).unwrap();

        let mut d = open(&p, false, ss as u32);
        let plan = repair::plan_restore_gpt(&mut d, "auto").unwrap();
        assert_eq!(plan.writes[0].lba, 0, "protective MBR first");
        drop(d);
        let mut w = open(&p, true, ss as u32);
        let bk = tmp("bk.bin");
        repair::apply(&mut w, &plan, bk.to_str().unwrap()).unwrap();
        let v = parts::inspect(&mut w).unwrap();
        assert_eq!(v["gpt"]["primary"]["valid"], true, "ss={ss}");
        assert_eq!(v["scheme"], "gpt");
        let after = fs::read(&p).unwrap();
        assert_eq!(after[ss..2 * ss], orig[ss..2 * ss], "primary header identical to the original (ss={ss})");

        // The backup file puts the wiped sectors back.
        let (bss, writes) = repair::load_backup(bk.to_str().unwrap()).unwrap();
        assert_eq!(bss as usize, ss);
        assert!(writes.iter().all(|x| x.data.iter().all(|&b| b == 0)));
    }
}

#[test]
fn rebuilds_backup_gpt_from_primary() {
    let p = tmp("b.raw");
    let orig = build_gpt(&p, 512, 8192, 2048, 6143);
    let mut img = orig.clone();
    let n = img.len();
    img[n - 512..].fill(0);
    fs::write(&p, &img).unwrap();
    let mut d = open(&p, true, 512);
    let plan = repair::plan_restore_gpt(&mut d, "auto").unwrap();
    repair::apply(&mut d, &plan, tmp("bk").to_str().unwrap()).unwrap();
    assert_eq!(fs::read(&p).unwrap(), orig);
}

#[test]
fn dry_run_plan_does_not_write() {
    let p = tmp("dr.raw");
    let orig = build_gpt(&p, 512, 8192, 2048, 6143);
    let mut img = orig.clone();
    img[512..1024].fill(0);
    fs::write(&p, &img).unwrap();
    let mut d = open(&p, false, 512);
    let plan = repair::plan_restore_gpt(&mut d, "auto").unwrap();
    let diff = plan.describe(&mut d).unwrap();
    assert!(diff["writes"].as_array().unwrap().iter().any(|w| w["lba"] == 1 && w["changed_bytes"].as_u64().unwrap() > 0));
    assert_eq!(fs::read(&p).unwrap(), img);
}

#[test]
fn scan_finds_ntfs_from_backup_boot_sector_and_rebuilds_mbr() {
    let p = tmp("v.raw");
    let total = 16384u64;
    let mut img = vec![0u8; total as usize * 512];
    // Volume at 2048 (4096 sectors) whose first sector was wiped: only the backup at the end remains.
    let a = ntfs_vbr(512, 2048, 4096);
    img[(2048 + 4095) * 512..(2048 + 4096) * 512].copy_from_slice(&a);
    // Intact volume at 8192.
    let b = ntfs_vbr(512, 8192, 4096);
    img[8192 * 512..8193 * 512].copy_from_slice(&b);
    fs::write(&p, &img).unwrap();
    let mut d = open(&p, true, 512);
    let found = repair::scan_vbrs(&mut d, None, &mut Progress::silent()).unwrap();
    assert_eq!(found.len(), 2);
    assert_eq!(found[0]["start_lba"], 2048);
    assert_eq!(found[0]["sources"][0], "backup");
    assert_eq!(found[1]["start_lba"], 8192);
    let plan = repair::plan_rebuild_mbr(&mut d, &found, false).unwrap();
    repair::apply(&mut d, &plan, tmp("bk").to_str().unwrap()).unwrap();
    let mbr = parts::parse_mbr(&read_sectors(&mut d, 0, 1).unwrap());
    assert!(mbr.signature_ok);
    assert_eq!(mbr.entries.len(), 2);
    assert_eq!((mbr.entries[0].lba_start, mbr.entries[0].sectors, mbr.entries[0].ptype), (2048, 4096, 0x07));
    assert_ne!(mbr.disk_signature, 0);
}

#[test]
fn clone_to_larger_image_moves_gpt_backup_and_verifies() {
    let s = tmp("src.raw");
    build_gpt(&s, 512, 8192, 2048, 6143);
    let t = tmp("dst.raw");
    fs::write(&t, vec![0xAAu8; 16384 * 512]).unwrap();
    let mut src = open(&s, false, 512);
    let mut dst = open(&t, true, 512);
    let len = src.size();
    let r = copy::copy_region(&mut src, Region { offset: 0, len }, &mut dst, 0, 1 << 20, &mut Progress::silent()).unwrap();
    assert!(!r.cancelled);
    let (h, _, _) = copy::hash_region(&mut dst, Region { offset: 0, len }, 1 << 20, "v", &mut Progress::silent()).unwrap();
    assert_eq!(h, r.source_sha256);
    let plan = repair::plan_fix_gpt_after_grow(&mut dst).unwrap();
    assert!(!plan.writes.is_empty());
    for w in &plan.writes {
        dst.write_at(w.lba * 512, &w.data).unwrap();
    }
    let v = parts::inspect(&mut dst).unwrap();
    assert_eq!(v["gpt"]["primary"]["valid"], true);
    assert_eq!(v["gpt"]["backup"]["valid"], true);
    assert_eq!(v["gpt"]["backup"]["lba"], 16383);
    assert_eq!(v["gpt"]["primary"]["last_usable"], 16383 - 33);
}

#[test]
fn partition_region_and_image_roundtrip() {
    let s = tmp("p.raw");
    build_gpt(&s, 512, 8192, 2048, 6143);
    let mut src = open(&s, false, 512);
    let (_, parts) = parts::partitions(&mut src).unwrap();
    let p = &parts[0];
    let reg = Region { offset: p.start_lba * 512, len: p.sectors * 512 };
    let img = tmp("part.img");
    let mut out = FileDevice::create(img.to_str().unwrap(), reg.len, 512).unwrap();
    let r = copy::copy_region(&mut src, reg, &mut out, 0, 1 << 20, &mut Progress::silent()).unwrap();
    assert_eq!(r.bytes, 4096 * 512);
    let data = fs::read(&img).unwrap();
    assert_eq!(&data[3..11], b"NTFS    ");
}

#[test]
fn guard_refuses_system_disk_and_unconfirmed_writes() {
    assert_eq!(guard_write(&Target::Disk(1), Some(1), &[1]).unwrap_err().code, "system_disk");
    assert_eq!(guard_write(&Target::Disk(2), None, &[1]).unwrap_err().code, "confirm_required");
    assert_eq!(guard_write(&Target::Disk(2), Some(3), &[1]).unwrap_err().code, "confirm_required");
    assert!(guard_write(&Target::Disk(2), Some(2), &[1]).is_ok());
    assert!(guard_write(&Target::Image("x.raw".into()), None, &[0]).is_ok());
    assert_eq!(Target::parse(r"\\.\PhysicalDrive3"), Target::Disk(3));
    assert_eq!(Target::parse("disk:0"), Target::Disk(0));
}

fn jpeg() -> Vec<u8> {
    let mut j = vec![0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
    j.extend_from_slice(b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
    j.extend_from_slice(&[0xFF, 0xDA, 0x00, 0x08, 1, 1, 0, 0, 0x3F, 0]);
    j.extend_from_slice(&[0x12, 0xFF, 0x00, 0x34, 0xFF, 0xD3, 0x56, 0x78]); // stuffed byte + RST marker
    j.extend_from_slice(&[0xFF, 0xD9]);
    j
}

fn png() -> Vec<u8> {
    let mut p = b"\x89PNG\r\n\x1A\n".to_vec();
    let chunk = |p: &mut Vec<u8>, t: &[u8], d: &[u8]| {
        p.extend_from_slice(&(d.len() as u32).to_be_bytes());
        p.extend_from_slice(t);
        p.extend_from_slice(d);
        p.extend_from_slice(&crc32fast::hash(&[t, d].concat()).to_be_bytes());
    };
    chunk(&mut p, b"IHDR", &[0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]);
    chunk(&mut p, b"IDAT", &[1, 2, 3, 4, 5]);
    chunk(&mut p, b"IEND", &[]);
    p
}

fn zip_docx() -> Vec<u8> {
    let name = b"word/document.xml";
    let body = b"<w:document/>";
    let mut z = Vec::new();
    z.extend_from_slice(b"PK\x03\x04");
    z.extend_from_slice(&[20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    z.extend_from_slice(&crc32fast::hash(body).to_le_bytes());
    z.extend_from_slice(&(body.len() as u32).to_le_bytes());
    z.extend_from_slice(&(body.len() as u32).to_le_bytes());
    z.extend_from_slice(&(name.len() as u16).to_le_bytes());
    z.extend_from_slice(&0u16.to_le_bytes());
    z.extend_from_slice(name);
    z.extend_from_slice(body);
    let cd_off = z.len() as u32;
    let mut cd = b"PK\x01\x02".to_vec();
    cd.extend_from_slice(&[20, 0, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    cd.extend_from_slice(&crc32fast::hash(body).to_le_bytes());
    cd.extend_from_slice(&(body.len() as u32).to_le_bytes());
    cd.extend_from_slice(&(body.len() as u32).to_le_bytes());
    cd.extend_from_slice(&(name.len() as u16).to_le_bytes());
    cd.extend_from_slice(&[0; 12]);
    cd.extend_from_slice(&0u32.to_le_bytes());
    cd.extend_from_slice(name);
    z.extend_from_slice(&cd);
    z.extend_from_slice(b"PK\x05\x06\0\0\0\0\x01\0\x01\0");
    z.extend_from_slice(&(cd.len() as u32).to_le_bytes());
    z.extend_from_slice(&cd_off.to_le_bytes());
    z.extend_from_slice(&0u16.to_le_bytes());
    z
}

fn sqlite() -> Vec<u8> {
    let mut s = vec![0u8; 3 * 1024];
    s[..16].copy_from_slice(b"SQLite format 3\0");
    s[16..18].copy_from_slice(&1024u16.to_be_bytes());
    s[28..32].copy_from_slice(&3u32.to_be_bytes());
    s
}

fn pdf() -> Vec<u8> {
    b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n2 0 obj<<>>endobj\n%%EOF\n".to_vec()
}

#[test]
fn carves_planted_files_with_exact_sizes() {
    crate::util::reset_cancel();
    let p = tmp("c.raw");
    let mut img = vec![0u8; 4 << 20];
    let files: Vec<(&str, Vec<u8>, usize)> = vec![
        ("jpg", jpeg(), 0x10000),
        ("png", png(), 0x30000),
        ("docx", zip_docx(), 0x50000),
        ("sqlite", sqlite(), 0x70000),
        ("pdf", pdf(), 0x90000),
        ("jpg", jpeg(), (8 << 20) - 1000), // will be past the end: ignored
    ];
    for (_, data, at) in &files {
        if at + data.len() <= img.len() {
            img[*at..at + data.len()].copy_from_slice(data);
        }
    }
    fs::write(&p, &img).unwrap();
    let out = tmp("out");
    let opts = CarveOpts { types: vec![], max_bytes: None, start: 0, end: None, max_files: 100, skip_embedded: true, sector_override: None };
    let r = carve::carve(&Target::Image(p.to_str().unwrap().into()), out.to_str().unwrap(), &opts, &mut Progress::silent()).unwrap();
    assert_eq!(r["total_files"], 5, "{r}");
    for (ext, data, at) in files.iter().take(5) {
        let f = r["files"].as_array().unwrap().iter().find(|f| f["offset"] == *at as u64).unwrap_or_else(|| panic!("{ext} not found: {r}"));
        assert_eq!(f["type"], *ext);
        assert_eq!(f["size"], data.len() as u64, "{ext}");
        assert_eq!(fs::read(f["path"].as_str().unwrap()).unwrap(), *data);
    }
}

#[test]
fn surface_test_maps_whole_image() {
    let p = tmp("s.raw");
    fs::write(&p, vec![0u8; 3 << 20]).unwrap();
    let mut d = open(&p, false, 512);
    let v = copy::surface_test(&mut d, Region { offset: 0, len: 3 << 20 }, 1 << 20, 10, &mut Progress::silent()).unwrap();
    assert_eq!(v["blocks"], 3);
    assert_eq!(v["bad"], 0);
    assert_eq!(v["complete"], true);
    assert_eq!(v["map"].as_str().unwrap().len(), 10);
}
