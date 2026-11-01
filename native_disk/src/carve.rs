//! Signature carving. A reader thread streams the region in large chunks while this thread looks for headers;
//! every hit is then measured by walking the format's own structure (JPEG segments, PNG chunks, ZIP end of
//! central directory, SQLite page count, MP4 boxes...) instead of guessing a fixed size.
use crate::copy::{tolerant_read, ReadStats};
use crate::device::{open_target, read_bytes, BlockDevice, Target};
use crate::util::{cancelled, Fail, Progress, R};
use memchr::memmem;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::mpsc;

pub struct Sig {
    pub ext: &'static str,
    pub magic: &'static [u8],
    /// Offset of `magic` inside the file (4 for MP4's "ftyp").
    pub at: u64,
    pub max: u64,
}

const MB: u64 = 1 << 20;

pub const SIGS: &[Sig] = &[
    Sig { ext: "jpg", magic: b"\xFF\xD8\xFF", at: 0, max: 64 * MB },
    Sig { ext: "png", magic: b"\x89PNG\r\n\x1A\n", at: 0, max: 64 * MB },
    Sig { ext: "gif", magic: b"GIF8", at: 0, max: 64 * MB },
    Sig { ext: "bmp", magic: b"BM", at: 0, max: 256 * MB },
    Sig { ext: "pdf", magic: b"%PDF-", at: 0, max: 512 * MB },
    Sig { ext: "zip", magic: b"PK\x03\x04", at: 0, max: 2048 * MB },
    Sig { ext: "sqlite", magic: b"SQLite format 3\0", at: 0, max: 2048 * MB },
    Sig { ext: "7z", magic: b"7z\xBC\xAF\x27\x1C", at: 0, max: 4096 * MB },
    Sig { ext: "mp4", magic: b"ftyp", at: 4, max: 8192 * MB },
];

/// Random access over the device with a 1 MiB window.
pub struct Src<'a> {
    dev: &'a mut dyn BlockDevice,
    base: u64,
    buf: Vec<u8>,
}

impl<'a> Src<'a> {
    pub fn new(dev: &'a mut dyn BlockDevice) -> Self {
        Self { dev, base: 0, buf: Vec::new() }
    }
    pub fn get(&mut self, off: u64, len: usize) -> Option<&[u8]> {
        if off + len as u64 > self.dev.size() {
            return None;
        }
        if off < self.base || off + len as u64 > self.base + self.buf.len() as u64 {
            let ss = self.dev.sector_size() as u64;
            self.base = off / ss * ss;
            let want = (MB as usize).max(len + ss as usize);
            self.buf = read_bytes(self.dev, self.base, want).ok()?;
            if off + len as u64 > self.base + self.buf.len() as u64 {
                return None;
            }
        }
        let a = (off - self.base) as usize;
        Some(&self.buf[a..a + len])
    }
    fn u8(&mut self, off: u64) -> Option<u8> {
        self.get(off, 1).map(|b| b[0])
    }
    fn be16(&mut self, off: u64) -> Option<u64> {
        self.get(off, 2).map(|b| u16::from_be_bytes([b[0], b[1]]) as u64)
    }
    fn be32(&mut self, off: u64) -> Option<u64> {
        self.get(off, 4).map(|b| u32::from_be_bytes(b.try_into().unwrap()) as u64)
    }
    fn le32(&mut self, off: u64) -> Option<u64> {
        self.get(off, 4).map(|b| u32::from_le_bytes(b.try_into().unwrap()) as u64)
    }
    fn le64(&mut self, off: u64) -> Option<u64> {
        self.get(off, 8).map(|b| u64::from_le_bytes(b.try_into().unwrap()))
    }
    /// First occurrence of `needle` in [from, limit).
    pub fn find(&mut self, from: u64, limit: u64, needle: &[u8]) -> Option<u64> {
        let limit = limit.min(self.dev.size());
        let mut pos = from;
        let win = MB as usize;
        while pos < limit {
            let n = ((limit - pos) as usize).min(win);
            if n < needle.len() {
                return None;
            }
            let hay = self.get(pos, n)?.to_vec();
            if let Some(i) = memmem::find(&hay, needle) {
                return Some(pos + i as u64);
            }
            pos += (n - needle.len() + 1) as u64;
        }
        None
    }
}

fn jpeg_len(s: &mut Src, start: u64, max: u64) -> Option<u64> {
    let end_limit = start + max;
    let mut p = start + 2;
    loop {
        if p >= end_limit || s.u8(p)? != 0xFF {
            return None;
        }
        while s.u8(p + 1)? == 0xFF {
            p += 1;
        }
        let m = s.u8(p + 1)?;
        match m {
            0xD9 => return Some(p + 2 - start),
            0xD0..=0xD7 | 0x01 => p += 2,
            0x00 => return None,
            _ => {
                let len = s.be16(p + 2)?;
                if len < 2 {
                    return None;
                }
                p += 2 + len;
                if m == 0xDA {
                    // Entropy-coded data: the next real marker is FF followed by anything but 00 / RSTn.
                    loop {
                        let f = s.find(p, end_limit, b"\xFF")?;
                        let n = s.u8(f + 1)?;
                        if n == 0x00 || (0xD0..=0xD7).contains(&n) || n == 0xFF {
                            p = f + 1;
                            continue;
                        }
                        p = f;
                        break;
                    }
                }
            }
        }
    }
}

fn png_len(s: &mut Src, start: u64, max: u64) -> Option<u64> {
    let mut p = start + 8;
    loop {
        let len = s.be32(p)?;
        let ty = s.get(p + 4, 4)?.to_vec();
        if !ty.iter().all(|c| c.is_ascii_alphabetic()) || len > 1 << 31 {
            return None;
        }
        p += 12 + len;
        if p - start > max {
            return None;
        }
        if ty == b"IEND" {
            return Some(p - start);
        }
    }
}

fn gif_sub_blocks(s: &mut Src, mut p: u64, limit: u64) -> Option<u64> {
    loop {
        let n = s.u8(p)? as u64;
        p += 1 + n;
        if n == 0 {
            return Some(p);
        }
        if p > limit {
            return None;
        }
    }
}

fn gif_len(s: &mut Src, start: u64, max: u64) -> Option<u64> {
    let v = s.get(start, 6)?;
    if v != b"GIF87a" && v != b"GIF89a" {
        return None;
    }
    let limit = start + max;
    let packed = s.u8(start + 10)?;
    let mut p = start + 13;
    if packed & 0x80 != 0 {
        p += 3 << ((packed & 7) + 1);
    }
    loop {
        match s.u8(p)? {
            0x3B => return Some(p + 1 - start),
            0x21 => p = gif_sub_blocks(s, p + 2, limit)?,
            0x2C => {
                let lp = s.u8(p + 9)?;
                p += 10;
                if lp & 0x80 != 0 {
                    p += 3 << ((lp & 7) + 1);
                }
                p = gif_sub_blocks(s, p + 1, limit)?;
            }
            _ => return None,
        }
        if p > limit {
            return None;
        }
    }
}

fn bmp_len(s: &mut Src, start: u64, max: u64) -> Option<u64> {
    let size = s.le32(start + 2)?;
    let reserved = s.le32(start + 6)?;
    let pixels = s.le32(start + 10)?;
    let dib = s.le32(start + 14)?;
    let ok = reserved == 0 && [12, 40, 52, 56, 108, 124].contains(&dib) && pixels >= 14 + dib && pixels < size && size <= max && size > 54;
    ok.then_some(size)
}

fn pdf_len(s: &mut Src, start: u64, max: u64) -> Option<u64> {
    let limit = start + max;
    let mut end = s.find(start, limit, b"%%EOF")? + 5;
    // Incremental updates append more "%%EOF"s; follow them while no new PDF begins first.
    while let Some(next) = s.find(end, (end + 4 * MB).min(limit), b"%%EOF") {
        if s.find(end, next, b"%PDF-").is_some() {
            break;
        }
        end = next + 5;
    }
    for _ in 0..2 {
        match s.u8(end) {
            Some(b'\r') | Some(b'\n') => end += 1,
            _ => break,
        }
    }
    Some(end - start)
}

fn zip_len(s: &mut Src, start: u64, max: u64) -> Option<u64> {
    let limit = start + max;
    let mut from = start;
    while let Some(e) = s.find(from, limit, b"PK\x05\x06") {
        let cd_size = s.le32(e + 12)?;
        let cd_off = s.le32(e + 16)?;
        let comment = s.get(e + 20, 2).map(|b| u16::from_le_bytes([b[0], b[1]]) as u64)?;
        if start + cd_off + cd_size == e {
            return Some(e + 22 + comment - start);
        }
        from = e + 4; // an EOCD of a nested archive
    }
    None
}

fn zip_kind(s: &mut Src, start: u64, len: u64) -> &'static str {
    let Some(head) = s.get(start, len.min(64 * 1024) as usize).map(|b| b.to_vec()) else { return "zip" };
    let has = |n: &[u8]| memmem::find(&head, n).is_some();
    if has(b"word/") {
        "docx"
    } else if has(b"xl/") {
        "xlsx"
    } else if has(b"ppt/") {
        "pptx"
    } else if has(b"AndroidManifest.xml") {
        "apk"
    } else if has(b"application/epub+zip") {
        "epub"
    } else if has(b"META-INF/MANIFEST.MF") {
        "jar"
    } else {
        "zip"
    }
}

fn sqlite_len(s: &mut Src, start: u64, max: u64) -> Option<u64> {
    let ps = match s.be16(start + 16)? {
        1 => 65536,
        n if n >= 512 && (n as u32).is_power_of_two() => n,
        _ => return None,
    };
    let pages = s.be32(start + 28)?;
    let len = ps * pages;
    (pages > 0 && len <= max).then_some(len)
}

fn sevenz_len(s: &mut Src, start: u64, max: u64) -> Option<u64> {
    let off = s.le64(start + 12)?;
    let size = s.le64(start + 20)?;
    let len = 32u64.checked_add(off)?.checked_add(size)?;
    (size > 0 && len <= max).then_some(len)
}

fn mp4_len(s: &mut Src, start: u64, max: u64) -> Option<(u64, &'static str)> {
    let brand = s.get(start + 8, 4)?.to_vec();
    let ext = match &brand[..] {
        b"qt  " => "mov",
        b"M4A " | b"M4B " => "m4a",
        b"heic" | b"heix" | b"mif1" | b"msf1" => "heic",
        b"3gp4" | b"3gp5" | b"3gp6" | b"3g2a" => "3gp",
        _ => "mp4",
    };
    let mut p = start;
    let mut has_media = false;
    loop {
        let Some(size32) = s.be32(p) else { break };
        let Some(ty) = s.get(p + 4, 4).map(|b| b.to_vec()) else { break };
        if !ty.iter().all(|c| c.is_ascii_alphanumeric() || *c == b' ') {
            break;
        }
        let size = match size32 {
            0 => break, // "to end of file": unknown here
            1 => s.get(p + 8, 8).map(|b| u64::from_be_bytes(b.try_into().unwrap()))?,
            n if n < 8 => break,
            n => n,
        };
        if p == start && ty != b"ftyp" {
            return None;
        }
        if &ty[..] == b"moov" || &ty[..] == b"mdat" || &ty[..] == b"meta" {
            has_media = true;
        }
        if p + size - start > max {
            break;
        }
        p += size;
    }
    (has_media && p > start).then_some((p - start, ext))
}

pub fn measure(s: &mut Src, sig: &Sig, start: u64, max: u64) -> Option<(u64, String)> {
    let max = max.min(sig.max);
    let r = match sig.ext {
        "jpg" => jpeg_len(s, start, max).map(|l| (l, "jpg")),
        "png" => png_len(s, start, max).map(|l| (l, "png")),
        "gif" => gif_len(s, start, max).map(|l| (l, "gif")),
        "bmp" => bmp_len(s, start, max).map(|l| (l, "bmp")),
        "pdf" => pdf_len(s, start, max).map(|l| (l, "pdf")),
        "zip" => zip_len(s, start, max).map(|l| (l, zip_kind(s, start, l))),
        "sqlite" => sqlite_len(s, start, max).map(|l| (l, "sqlite")),
        "7z" => sevenz_len(s, start, max).map(|l| (l, "7z")),
        "mp4" => mp4_len(s, start, max),
        _ => None,
    }?;
    (r.0 >= 16).then(|| (r.0, r.1.to_string()))
}

pub struct CarveOpts {
    pub types: Vec<String>,
    pub max_bytes: Option<u64>,
    pub start: u64,
    pub end: Option<u64>,
    pub max_files: u64,
    pub skip_embedded: bool,
    pub sector_override: Option<u32>,
}

fn type_enabled(types: &[String], ext: &str) -> bool {
    types.is_empty() || types.iter().any(|t| t == ext || (ext == "zip" && ["docx", "xlsx", "pptx", "apk", "jar", "epub"].contains(&t.as_str())) || (ext == "mp4" && ["mov", "m4a", "heic", "3gp"].contains(&t.as_str())))
}

pub fn carve(target: &Target, out_dir: &str, opts: &CarveOpts, prog: &mut Progress) -> R<Value> {
    fs::create_dir_all(out_dir)?;
    let mut dev = open_target(target, false, opts.sector_override)?;
    let end = opts.end.unwrap_or(u64::MAX).min(dev.size());
    let start = opts.start.min(end);
    let sigs: Vec<&Sig> = SIGS.iter().filter(|s| type_enabled(&opts.types, s.ext)).collect();
    if sigs.is_empty() {
        return Err(Fail::new("bad_args", "nenhum tipo de arquivo selecionado"));
    }
    let finders: Vec<(usize, memmem::Finder)> = sigs.iter().enumerate().map(|(i, s)| (i, memmem::Finder::new(s.magic))).collect();

    const CHUNK: usize = 8 << 20;
    const OVERLAP: usize = 64;
    let (tx, rx) = mpsc::sync_channel::<(u64, Vec<u8>)>(2);
    let rt = target.clone();
    let so = opts.sector_override;
    let reader = std::thread::spawn(move || -> R<ReadStats> {
        let mut d = open_target(&rt, false, so)?;
        let mut stats = ReadStats::new();
        let mut pos = start;
        while pos < end && !cancelled() {
            let n = ((end - pos) as usize).min(CHUNK + OVERLAP);
            let mut buf = vec![0u8; n];
            let got = tolerant_read(d.as_mut(), pos, &mut buf, &mut stats);
            buf.truncate(got);
            if tx.send((pos, buf)).is_err() {
                break;
            }
            pos += CHUNK as u64;
        }
        Ok(stats)
    });

    let mut src = Src::new(dev.as_mut());
    let mut next_free = 0u64; // with skip_embedded, hits inside an extracted file are ignored
    let mut files: Vec<Value> = Vec::new();
    let mut by_type: BTreeMap<String, u64> = BTreeMap::new();
    let mut total_bytes = 0u64;
    let mut stop = false;
    for (base, buf) in rx {
        if stop || cancelled() {
            break;
        }
        let scan_len = buf.len().min(CHUNK);
        let mut hits: Vec<(u64, usize)> = Vec::new();
        for (i, f) in &finders {
            for h in f.find_iter(&buf) {
                if h < scan_len {
                    let at = sigs[*i].at;
                    let off = base + h as u64;
                    if off >= at && off - at >= start {
                        hits.push((off - at, *i));
                    }
                }
            }
        }
        hits.sort();
        for (off, i) in hits {
            if off < next_free {
                continue;
            }
            let sig = sigs[i];
            // MP4's "ftyp" also matches inside other boxes; require the 4-byte size before it to be sane.
            let Some((len, ext)) = measure(&mut src, sig, off, opts.max_bytes.unwrap_or(u64::MAX)) else { continue };
            if !type_enabled(&opts.types, &ext) {
                continue;
            }
            let lba = off / src.dev.sector_size() as u64;
            let dir = Path::new(out_dir).join(&ext);
            fs::create_dir_all(&dir)?;
            let path = dir.join(format!("{lba:012}_{off:X}.{ext}"));
            let mut f = fs::File::create(&path)?;
            let mut done = 0u64;
            let mut stats = ReadStats::new();
            let ss = src.dev.sector_size() as u64;
            while done < len {
                let a = (off + done) / ss * ss;
                let skip = (off + done - a) as usize;
                let n = ((len - done) as usize + skip).min(MB as usize).div_ceil(ss as usize) * ss as usize;
                let mut b = vec![0u8; n];
                let got = tolerant_read(src.dev, a, &mut b, &mut stats);
                let take = ((got.saturating_sub(skip)) as u64).min(len - done) as usize;
                if take == 0 {
                    break;
                }
                f.write_all(&b[skip..skip + take])?;
                done += take as u64;
            }
            drop(f);
            total_bytes += done;
            *by_type.entry(ext.clone()).or_default() += 1;
            let item = json!({ "type": ext, "offset": off, "lba": lba, "size": done, "path": path.to_string_lossy(), "damaged": stats.bad_count > 0 });
            prog.event(json!({ "event": "found", "file": item }));
            if files.len() < 5000 {
                files.push(item);
            }
            if opts.skip_embedded {
                next_free = off + len;
            }
            if by_type.values().sum::<u64>() >= opts.max_files {
                stop = true;
                break;
            }
        }
        let scanned = (base + scan_len as u64).min(end) - start;
        prog.tick("carve", scanned, end - start, json!({ "files": by_type.values().sum::<u64>() }));
    }
    let read_stats = reader.join().map_err(|_| Fail::new("internal", "thread de leitura falhou"))??;
    Ok(json!({
        "out_dir": out_dir, "total_files": by_type.values().sum::<u64>(), "total_bytes": total_bytes,
        "by_type": by_type, "files": files, "cancelled": cancelled(), "bad_sectors": read_stats.bad_count,
        "seconds": prog.elapsed(),
    }))
}
