//! Windows physical disks: raw sector I/O through `\\.\PhysicalDriveN` and the storage IOCTLs.
//! IOCTL codes and structures are declared here (they are stable ABI) to keep the binding surface small.
use crate::device::{read_full, write_full, AlignedBuf, BlockDevice};
use serde_json::{json, Value};
use std::ffi::c_void;
use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::fs::OpenOptionsExt;
use std::os::windows::io::AsRawHandle;
use windows_sys::Win32::Storage::FileSystem::{
    FindFirstVolumeW, FindNextVolumeW, FindVolumeClose, GetVolumePathNamesForVolumeNameW,
};
use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
use windows_sys::Win32::System::IO::DeviceIoControl;

const IOCTL_DISK_GET_DRIVE_GEOMETRY_EX: u32 = 0x0007_00A0;
const IOCTL_DISK_GET_LENGTH_INFO: u32 = 0x0007_405C;
const IOCTL_DISK_UPDATE_PROPERTIES: u32 = 0x0007_0140;
const IOCTL_STORAGE_QUERY_PROPERTY: u32 = 0x002D_1400;
const IOCTL_STORAGE_GET_DEVICE_NUMBER: u32 = 0x002D_1080;
const IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS: u32 = 0x0056_0000;
const FSCTL_LOCK_VOLUME: u32 = 0x0009_0018;
const FSCTL_DISMOUNT_VOLUME: u32 = 0x0009_0020;

const FILE_SHARE_READ_WRITE: u32 = 0x1 | 0x2;
const FILE_FLAG_NO_BUFFERING: u32 = 0x2000_0000;
const FILE_FLAG_WRITE_THROUGH: u32 = 0x8000_0000;
const ALIGN: usize = 4096;

fn ioctl(f: &File, code: u32, input: &[u8], out: &mut [u8]) -> io::Result<usize> {
    let mut ret: u32 = 0;
    let ok = unsafe {
        DeviceIoControl(
            f.as_raw_handle() as _,
            code,
            if input.is_empty() { std::ptr::null() } else { input.as_ptr() as *const c_void },
            input.len() as u32,
            if out.is_empty() { std::ptr::null_mut() } else { out.as_mut_ptr() as *mut c_void },
            out.len() as u32,
            &mut ret,
            std::ptr::null_mut(),
        )
    };
    if ok == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(ret as usize)
    }
}

fn u32le(b: &[u8], o: usize) -> u32 {
    u32::from_le_bytes(b[o..o + 4].try_into().unwrap())
}
fn u64le(b: &[u8], o: usize) -> u64 {
    u64::from_le_bytes(b[o..o + 8].try_into().unwrap())
}

pub fn disk_path(n: u32) -> String {
    format!(r"\\.\PhysicalDrive{n}")
}

/// Opens with no data access: enough for the query IOCTLs and works without admin.
fn open_query(path: &str) -> io::Result<File> {
    OpenOptions::new().access_mode(0).share_mode(FILE_SHARE_READ_WRITE).open(path)
}

pub struct Geometry {
    pub size: u64,
    pub logical: u32,
    pub physical: u32,
    pub media_type: u32,
}

fn geometry(f: &File) -> io::Result<Geometry> {
    let mut g = [0u8; 256];
    ioctl(f, IOCTL_DISK_GET_DRIVE_GEOMETRY_EX, &[], &mut g)?;
    let mut logical = u32le(&g, 20);
    let media_type = u32le(&g, 8);
    let mut size = u64le(&g, 24);
    let mut len = [0u8; 8];
    if ioctl(f, IOCTL_DISK_GET_LENGTH_INFO, &[], &mut len).is_ok() {
        size = u64::from_le_bytes(len);
    }
    let mut physical = logical;
    // STORAGE_PROPERTY_QUERY { StorageAccessAlignmentProperty = 6, PropertyStandardQuery = 0 }
    let mut q = [0u8; 12];
    q[0..4].copy_from_slice(&6u32.to_le_bytes());
    let mut a = [0u8; 64];
    if ioctl(f, IOCTL_STORAGE_QUERY_PROPERTY, &q, &mut a).is_ok() && u32le(&a, 4) >= 24 {
        let l = u32le(&a, 16);
        let p = u32le(&a, 20);
        if l == 512 || l == 4096 {
            logical = l;
        }
        if p >= logical {
            physical = p;
        }
    }
    if logical == 0 {
        logical = 512;
    }
    Ok(Geometry { size, logical, physical, media_type })
}

fn bus_name(b: u32) -> &'static str {
    match b {
        1 => "SCSI",
        2 => "ATAPI",
        3 => "ATA",
        4 => "1394",
        6 => "Fibre",
        7 => "USB",
        8 => "RAID",
        9 => "iSCSI",
        10 => "SAS",
        11 => "SATA",
        12 => "SD",
        13 => "MMC",
        14 => "Virtual",
        15 => "FileBackedVirtual",
        16 => "Spaces",
        17 => "NVMe",
        18 => "SCM",
        19 => "UFS",
        _ => "Unknown",
    }
}

fn descriptor_string(buf: &[u8], off: u32) -> String {
    let o = off as usize;
    if o == 0 || o >= buf.len() {
        return String::new();
    }
    let end = buf[o..].iter().position(|&c| c == 0).map(|p| o + p).unwrap_or(buf.len());
    String::from_utf8_lossy(&buf[o..end]).trim().to_string()
}

fn device_info(f: &File) -> Value {
    let q = [0u8; 12]; // StorageDeviceProperty = 0, PropertyStandardQuery = 0
    let mut d = vec![0u8; 1024];
    if ioctl(f, IOCTL_STORAGE_QUERY_PROPERTY, &q, &mut d).is_err() {
        return json!({});
    }
    let vendor = descriptor_string(&d, u32le(&d, 12));
    let product = descriptor_string(&d, u32le(&d, 16));
    let model = format!("{vendor} {product}").trim().to_string();
    json!({
        "model": model,
        "revision": descriptor_string(&d, u32le(&d, 20)),
        "serial": descriptor_string(&d, u32le(&d, 24)).trim_end_matches('.').to_string(),
        "bus": bus_name(u32le(&d, 28)),
        "removable": d[10] != 0,
    })
}

/// A mounted volume and the disk extents that back it.
pub struct VolumeInfo {
    pub guid_path: String,
    pub mount_points: Vec<String>,
    pub extents: Vec<(u32, u64, u64)>,
}

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
fn from_wide(b: &[u16]) -> String {
    let end = b.iter().position(|&c| c == 0).unwrap_or(b.len());
    String::from_utf16_lossy(&b[..end])
}

fn volume_extents(path: &str) -> Vec<(u32, u64, u64)> {
    let Ok(f) = open_query(path) else { return vec![] };
    let mut out = vec![0u8; 8 + 24 * 32];
    if ioctl(&f, IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS, &[], &mut out).is_err() {
        return vec![];
    }
    let n = u32le(&out, 0) as usize;
    (0..n.min(32))
        .map(|i| {
            let o = 8 + i * 24;
            (u32le(&out, o), u64le(&out, o + 8), u64le(&out, o + 16))
        })
        .collect()
}

pub fn volumes() -> Vec<VolumeInfo> {
    let mut list = Vec::new();
    let mut name = vec![0u16; 64];
    let h = unsafe { FindFirstVolumeW(name.as_mut_ptr(), name.len() as u32) };
    if h as isize == -1 {
        return list;
    }
    loop {
        let guid = from_wide(&name);
        let mut paths = vec![0u16; 1024];
        let mut ret = 0u32;
        let mut mount_points = Vec::new();
        let w = wide(&guid);
        if unsafe { GetVolumePathNamesForVolumeNameW(w.as_ptr(), paths.as_mut_ptr(), paths.len() as u32, &mut ret) } != 0 {
            for p in paths[..ret as usize].split(|&c| c == 0) {
                if !p.is_empty() {
                    mount_points.push(String::from_utf16_lossy(p));
                }
            }
        }
        let open_path = guid.trim_end_matches('\\').to_string();
        list.push(VolumeInfo { extents: volume_extents(&open_path), guid_path: open_path, mount_points });
        name.iter_mut().for_each(|c| *c = 0);
        if unsafe { FindNextVolumeW(h, name.as_mut_ptr(), name.len() as u32) } == 0 {
            break;
        }
    }
    unsafe { FindVolumeClose(h) };
    list
}

/// Disks that hold the Windows volume or the partition the firmware boots from (the ESP / "System
/// Reserved" volume can live on a different disk than C:). These are never written to.
pub fn system_disks() -> Vec<u32> {
    let drive = std::env::var("SystemDrive").unwrap_or_else(|_| "C:".into());
    let mut v: Vec<u32> = volume_extents(&format!(r"\\.\{}", drive.trim_end_matches('\\'))).iter().map(|e| e.0).collect();
    // HKLM\SYSTEM\Setup\SystemPartition = \Device\HarddiskVolumeN
    let mut buf = vec![0u16; 260];
    let mut len = (buf.len() * 2) as u32;
    let key = wide(r"SYSTEM\Setup");
    let val = wide("SystemPartition");
    let rc = unsafe { RegGetValueW(HKEY_LOCAL_MACHINE, key.as_ptr(), val.as_ptr(), RRF_RT_REG_SZ, std::ptr::null_mut(), buf.as_mut_ptr() as *mut c_void, &mut len) };
    if rc == 0 {
        let dev = from_wide(&buf);
        if let Some(rest) = dev.strip_prefix(r"\Device\") {
            v.extend(volume_extents(&format!(r"\\?\GLOBALROOT\Device\{rest}")).iter().map(|e| e.0));
        }
    }
    v.sort();
    v.dedup();
    v
}

pub fn list_drives() -> Value {
    let sys = system_disks();
    let vols = volumes();
    let mut drives = Vec::new();
    for n in 0..64u32 {
        let Ok(f) = open_query(&disk_path(n)) else { continue };
        let Ok(g) = geometry(&f) else { continue };
        let mut info = device_info(&f);
        let mounts: Vec<Value> = vols
            .iter()
            .filter(|v| v.extents.iter().any(|e| e.0 == n))
            .map(|v| {
                let e = v.extents.iter().find(|e| e.0 == n).unwrap();
                json!({ "volume": v.guid_path, "mount_points": v.mount_points, "offset": e.1, "length": e.2 })
            })
            .collect();
        let obj = info.as_object_mut().unwrap();
        obj.insert("index".into(), json!(n));
        obj.insert("path".into(), json!(disk_path(n)));
        obj.insert("size".into(), json!(g.size));
        obj.insert("sector_size".into(), json!(g.logical));
        obj.insert("physical_sector_size".into(), json!(g.physical));
        obj.insert("media_type".into(), json!(if g.media_type == 11 { "removable" } else { "fixed" }));
        obj.insert("is_system".into(), json!(sys.contains(&n)));
        obj.insert("volumes".into(), json!(mounts));
        drives.push(info);
    }
    json!({ "drives": drives, "system_disks": sys })
}

/// Disk number that holds a filesystem path (e.g. a carving output folder).
pub fn disk_of_path(path: &str) -> Option<u32> {
    let p = std::path::Path::new(path);
    let root = p.components().next()?.as_os_str().to_string_lossy().trim_end_matches('\\').to_string();
    if root.len() == 2 && root.ends_with(':') {
        volume_extents(&format!(r"\\.\{root}")).first().map(|e| e.0)
    } else {
        None
    }
}

/// Locks and dismounts every volume on disk `n`. Handles stay open (lock held) until dropped.
pub struct VolumeLocks {
    _handles: Vec<File>,
    pub warnings: Vec<String>,
}

pub fn lock_volumes(n: u32) -> VolumeLocks {
    let mut handles = Vec::new();
    let mut warnings = Vec::new();
    for v in volumes().into_iter().filter(|v| v.extents.iter().any(|e| e.0 == n)) {
        let f = match OpenOptions::new().read(true).write(true).share_mode(FILE_SHARE_READ_WRITE).open(&v.guid_path) {
            Ok(f) => f,
            Err(e) => {
                warnings.push(format!("{}: não abriu ({e})", v.guid_path));
                continue;
            }
        };
        let mut locked = false;
        for _ in 0..10 {
            if ioctl(&f, FSCTL_LOCK_VOLUME, &[], &mut []).is_ok() {
                locked = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        if !locked {
            warnings.push(format!("{} {:?}: em uso, desmontando à força", v.guid_path, v.mount_points));
        }
        if let Err(e) = ioctl(&f, FSCTL_DISMOUNT_VOLUME, &[], &mut []) {
            warnings.push(format!("{}: falha ao desmontar ({e})", v.guid_path));
        }
        handles.push(f);
    }
    VolumeLocks { _handles: handles, warnings }
}

pub struct PhysicalDisk {
    file: File,
    geo: Geometry,
    buf: AlignedBuf,
    #[allow(dead_code)] // held so the volumes stay locked while we write
    locks: Option<VolumeLocks>,
}

impl PhysicalDisk {
    pub fn open(n: u32, write: bool) -> io::Result<Self> {
        let locks = if write { Some(lock_volumes(n)) } else { None };
        // Diagnostics go to stderr so stdout stays one JSON document / NDJSON stream.
        for w in locks.iter().flat_map(|l| &l.warnings) {
            eprintln!("aviso: {w}");
        }
        let file = OpenOptions::new()
            .read(true)
            .write(write)
            .share_mode(FILE_SHARE_READ_WRITE)
            .custom_flags(FILE_FLAG_NO_BUFFERING | if write { FILE_FLAG_WRITE_THROUGH } else { 0 })
            .open(disk_path(n))?;
        let geo = geometry(&file)?;
        let mut dn = [0u8; 12];
        if ioctl(&file, IOCTL_STORAGE_GET_DEVICE_NUMBER, &[], &mut dn).is_ok() && u32le(&dn, 4) != n {
            return Err(io::Error::other("número do disco não confere"));
        }
        Ok(Self { file, geo, buf: AlignedBuf::new(1 << 20, ALIGN), locks })
    }
}

impl BlockDevice for PhysicalDisk {
    fn size(&self) -> u64 {
        self.geo.size
    }
    fn sector_size(&self) -> u32 {
        self.geo.logical
    }
    fn read_at(&mut self, off: u64, out: &mut [u8]) -> io::Result<usize> {
        let mut done = 0usize;
        while done < out.len() {
            let pos = off + done as u64;
            if pos >= self.geo.size {
                break;
            }
            let want = (out.len() - done).min(1 << 20).min((self.geo.size - pos) as usize);
            let b = &mut self.buf.as_mut_slice()[..want];
            let n = read_full(&self.file, pos, b)?;
            out[done..done + n].copy_from_slice(&self.buf.as_slice()[..n]);
            done += n;
            if n < want {
                break;
            }
        }
        Ok(done)
    }
    fn write_at(&mut self, off: u64, data: &[u8]) -> io::Result<()> {
        if off + data.len() as u64 > self.geo.size {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "escrita além do fim do disco"));
        }
        let mut done = 0usize;
        while done < data.len() {
            let want = (data.len() - done).min(1 << 20);
            self.buf.as_mut_slice()[..want].copy_from_slice(&data[done..done + want]);
            write_full(&self.file, off + done as u64, &self.buf.as_slice()[..want])?;
            done += want;
        }
        Ok(())
    }
    fn flush(&mut self) -> io::Result<()> {
        self.file.sync_all()?;
        let _ = ioctl(&self.file, IOCTL_DISK_UPDATE_PROPERTIES, &[], &mut []);
        Ok(())
    }
}
