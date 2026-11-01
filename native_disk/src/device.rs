//! Block devices: image files and (on Windows) physical disks behind one trait, so every
//! parser / repair / copy routine can be tested against synthetic images.
use std::fs::{File, OpenOptions};
use std::io;

pub trait BlockDevice: Send {
    /// Total size in bytes.
    fn size(&self) -> u64;
    /// Logical sector size (512 or 4096).
    fn sector_size(&self) -> u32;
    /// Reads `buf.len()` bytes at `off`. Both must be sector-aligned. Returns bytes read (short at the end).
    fn read_at(&mut self, off: u64, buf: &mut [u8]) -> io::Result<usize>;
    /// Writes at `off`. Both must be sector-aligned.
    fn write_at(&mut self, off: u64, buf: &[u8]) -> io::Result<()>;
    fn flush(&mut self) -> io::Result<()>;
    fn total_sectors(&self) -> u64 {
        self.size() / self.sector_size() as u64
    }
}

pub struct FileDevice {
    file: File,
    size: u64,
    sector: u32,
}

impl FileDevice {
    pub fn open(path: &str, write: bool, sector: u32) -> io::Result<Self> {
        let file = OpenOptions::new().read(true).write(write).open(path)?;
        let size = file.metadata()?.len();
        Ok(Self { file, size, sector })
    }

    /// Creates (or truncates) an image file of `size` bytes for writing.
    pub fn create(path: &str, size: u64, sector: u32) -> io::Result<Self> {
        let file = OpenOptions::new().read(true).write(true).create(true).truncate(true).open(path)?;
        file.set_len(size)?;
        Ok(Self { file, size, sector })
    }
}

#[cfg(windows)]
fn pread(f: &File, buf: &mut [u8], off: u64) -> io::Result<usize> {
    use std::os::windows::fs::FileExt;
    f.seek_read(buf, off)
}
#[cfg(not(windows))]
fn pread(f: &File, buf: &mut [u8], off: u64) -> io::Result<usize> {
    use std::os::unix::fs::FileExt;
    f.read_at(buf, off)
}
#[cfg(windows)]
fn pwrite(f: &File, buf: &[u8], off: u64) -> io::Result<usize> {
    use std::os::windows::fs::FileExt;
    f.seek_write(buf, off)
}
#[cfg(not(windows))]
fn pwrite(f: &File, buf: &[u8], off: u64) -> io::Result<usize> {
    use std::os::unix::fs::FileExt;
    f.write_at(buf, off)
}

pub(crate) fn read_full(f: &File, mut off: u64, mut buf: &mut [u8]) -> io::Result<usize> {
    let mut total = 0;
    while !buf.is_empty() {
        let n = pread(f, buf, off)?;
        if n == 0 {
            break;
        }
        total += n;
        off += n as u64;
        buf = &mut buf[n..];
    }
    Ok(total)
}

pub(crate) fn write_full(f: &File, mut off: u64, mut buf: &[u8]) -> io::Result<()> {
    while !buf.is_empty() {
        let n = pwrite(f, buf, off)?;
        if n == 0 {
            return Err(io::Error::new(io::ErrorKind::WriteZero, "escrita retornou 0 bytes"));
        }
        off += n as u64;
        buf = &buf[n..];
    }
    Ok(())
}

impl BlockDevice for FileDevice {
    fn size(&self) -> u64 {
        self.size
    }
    fn sector_size(&self) -> u32 {
        self.sector
    }
    fn read_at(&mut self, off: u64, buf: &mut [u8]) -> io::Result<usize> {
        read_full(&self.file, off, buf)
    }
    fn write_at(&mut self, off: u64, buf: &[u8]) -> io::Result<()> {
        if off + buf.len() as u64 > self.size {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "escrita além do fim da imagem"));
        }
        write_full(&self.file, off, buf)
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.sync_all()
    }
}

/// Reads `count` sectors starting at `lba`.
pub fn read_sectors(dev: &mut dyn BlockDevice, lba: u64, count: u64) -> io::Result<Vec<u8>> {
    let ss = dev.sector_size() as u64;
    let mut buf = vec![0u8; (count * ss) as usize];
    let n = dev.read_at(lba * ss, &mut buf)?;
    buf.truncate(n);
    Ok(buf)
}

/// Reads an arbitrary byte range, widening it to sector boundaries internally.
pub fn read_bytes(dev: &mut dyn BlockDevice, off: u64, len: usize) -> io::Result<Vec<u8>> {
    let ss = dev.sector_size() as u64;
    let start = off / ss * ss;
    let end = (off + len as u64).div_ceil(ss) * ss;
    let mut buf = vec![0u8; (end - start) as usize];
    let n = dev.read_at(start, &mut buf)?;
    buf.truncate(n);
    let a = (off - start) as usize;
    if a >= buf.len() {
        return Ok(Vec::new());
    }
    let b = (a + len).min(buf.len());
    Ok(buf[a..b].to_vec())
}

/// A target given on the command line.
#[derive(Debug, Clone, PartialEq)]
pub enum Target {
    Disk(u32),
    Image(String),
}

impl Target {
    pub fn parse(s: &str) -> Target {
        let l = s.trim().to_ascii_lowercase();
        let num = l
            .strip_prefix(r"\\.\physicaldrive")
            .or_else(|| l.strip_prefix("disk:"))
            .and_then(|n| n.parse::<u32>().ok());
        match num {
            Some(n) => Target::Disk(n),
            None => Target::Image(s.trim().to_string()),
        }
    }
    pub fn display(&self) -> String {
        match self {
            Target::Disk(n) => format!(r"\\.\PhysicalDrive{n}"),
            Target::Image(p) => p.clone(),
        }
    }
}

pub fn open_target(t: &Target, write: bool, sector_override: Option<u32>) -> io::Result<Box<dyn BlockDevice>> {
    match t {
        Target::Image(p) => Ok(Box::new(FileDevice::open(p, write, sector_override.unwrap_or(512))?)),
        #[cfg(windows)]
        Target::Disk(n) => Ok(Box::new(crate::win::PhysicalDisk::open(*n, write)?)),
        #[cfg(not(windows))]
        Target::Disk(_) => Err(io::Error::new(io::ErrorKind::Unsupported, "discos físicos só no Windows")),
    }
}

/// A heap buffer whose start is aligned to `align` (needed for FILE_FLAG_NO_BUFFERING).
pub struct AlignedBuf {
    raw: Vec<u8>,
    start: usize,
    len: usize,
}

impl AlignedBuf {
    pub fn new(len: usize, align: usize) -> Self {
        let raw = vec![0u8; len + align];
        let addr = raw.as_ptr() as usize;
        let start = (align - addr % align) % align;
        Self { raw, start, len }
    }
    pub fn as_slice(&self) -> &[u8] {
        &self.raw[self.start..self.start + self.len]
    }
    pub fn as_mut_slice(&mut self) -> &mut [u8] {
        &mut self.raw[self.start..self.start + self.len]
    }
}
