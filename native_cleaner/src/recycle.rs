//! Recycle Bin of the current user, on every drive, through the Shell API (the same calls Explorer uses).
//! Emptying is permanent; callers only do it after the user asked for it.
use crate::util::{Fail, R};
use windows_sys::Win32::UI::Shell::{SHEmptyRecycleBinW, SHQueryRecycleBinW, SHERB_NOCONFIRMATION, SHERB_NOPROGRESSUI, SHERB_NOSOUND, SHQUERYRBINFO};

/// (bytes, items) in the Recycle Bin of every drive.
pub fn query() -> R<(u64, u64)> {
    let mut info = SHQUERYRBINFO { cbSize: std::mem::size_of::<SHQUERYRBINFO>() as u32, i64Size: 0, i64NumItems: 0 };
    let hr = unsafe { SHQueryRecycleBinW(std::ptr::null(), &mut info) };
    if hr < 0 {
        return Err(Fail::new("recycle_bin", format!("não foi possível ler a Lixeira (0x{:08x})", hr as u32)));
    }
    Ok((info.i64Size.max(0) as u64, info.i64NumItems.max(0) as u64))
}

/// Empties the Recycle Bin of every drive, without dialogs or sound.
pub fn empty() -> R<()> {
    let hr = unsafe { SHEmptyRecycleBinW(std::ptr::null_mut(), std::ptr::null(), SHERB_NOCONFIRMATION | SHERB_NOPROGRESSUI | SHERB_NOSOUND) };
    // E_UNEXPECTED is what Windows answers when the bin was already empty
    if hr < 0 && hr as u32 != 0x8000_FFFF {
        return Err(Fail::new("recycle_bin", format!("o Windows não esvaziou a Lixeira (0x{:08x})", hr as u32)));
    }
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------------------
// Orphans. Windows keeps every deleted item as two entries in <drive>\$Recycle.Bin\<SID>: `$R<id>` (the content) and
// `$I<id>` (where it came from). When emptying hits a file in use, the Shell can delete the `$I` and leave the `$R`
// behind: that content is invisible in Explorer and to SHQueryRecycleBin, so it is never freed. These are found here
// and, with the user's "clean", removed (only in the current user's own bin folders).

use std::fs;
use std::path::{Path, PathBuf};

/// An orphan `$R` entry (no matching `$I`) and its size in bytes.
pub struct Orphan {
    pub path: PathBuf,
    pub bytes: u64,
}

/// Size of a file or folder without following links or junctions.
fn size_of(p: &Path) -> u64 {
    let Ok(m) = fs::symlink_metadata(p) else { return 0 };
    if m.file_type().is_symlink() || is_reparse(&m) {
        return 0;
    }
    if !m.is_dir() {
        return m.len();
    }
    let Ok(rd) = fs::read_dir(p) else { return 0 };
    rd.flatten().map(|e| size_of(&e.path())).sum()
}

#[cfg(windows)]
fn is_reparse(m: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    m.file_attributes() & 0x400 != 0
}
#[cfg(not(windows))]
fn is_reparse(_: &fs::Metadata) -> bool {
    false
}

/// `$R` entries of one bin folder (`<drive>\$Recycle.Bin\<SID>`) whose `$I` record is missing.
pub fn orphans_in(sid_dir: &Path) -> Vec<Orphan> {
    let Ok(rd) = fs::read_dir(sid_dir) else { return Vec::new() };
    let mut out = Vec::new();
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.len() < 3 || !name.starts_with("$R") {
            continue;
        }
        let record = sid_dir.join(format!("$I{}", &name[2..]));
        if fs::symlink_metadata(&record).is_ok() {
            continue;
        }
        let path = e.path();
        out.push(Orphan { bytes: size_of(&path), path });
    }
    out
}

/// Removes one orphan. remove_dir_all deletes links and junctions themselves, never what they point to.
pub fn remove_orphan(o: &Orphan) -> bool {
    let p = &o.path;
    let r = match fs::symlink_metadata(p) {
        Ok(m) if m.is_dir() && !is_reparse(&m) => fs::remove_dir_all(p),
        Ok(m) if m.is_dir() => fs::remove_dir(p),
        Ok(_) => fs::remove_file(p),
        Err(_) => return true,
    };
    r.is_ok() || fs::symlink_metadata(p).is_err()
}

/// The current user's bin folder on every fixed or removable drive that has one.
#[cfg(windows)]
pub fn user_bin_dirs() -> Vec<PathBuf> {
    use windows_sys::Win32::Storage::FileSystem::GetDriveTypeW;
    let Some(sid) = current_user_sid() else { return Vec::new() };
    let mut out = Vec::new();
    for d in b'A'..=b'Z' {
        let root: Vec<u16> = format!("{}:\\", d as char).encode_utf16().chain(Some(0)).collect();
        // 2 = removable, 3 = fixed (network, CD and RAM drives have no bin of ours to touch)
        let t = unsafe { GetDriveTypeW(root.as_ptr()) };
        if t != 2 && t != 3 {
            continue;
        }
        let dir = PathBuf::from(format!("{}:\\$Recycle.Bin\\{}", d as char, sid));
        if dir.is_dir() {
            out.push(dir);
        }
    }
    out
}

/// String SID of the user this process runs as (an elevated DarkHub is still that user).
#[cfg(windows)]
fn current_user_sid() -> Option<String> {
    use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, HANDLE};
    use windows_sys::Win32::Security::Authorization::ConvertSidToStringSidW;
    use windows_sys::Win32::Security::{GetTokenInformation, TokenUser, TOKEN_QUERY, TOKEN_USER};
    use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};
    unsafe {
        let mut tok: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut tok) == 0 {
            return None;
        }
        let mut need = 0u32;
        GetTokenInformation(tok, TokenUser, std::ptr::null_mut(), 0, &mut need);
        let mut buf = vec![0u8; need.max(64) as usize];
        let ok = GetTokenInformation(tok, TokenUser, buf.as_mut_ptr().cast(), buf.len() as u32, &mut need);
        CloseHandle(tok);
        if ok == 0 {
            return None;
        }
        let tu = &*(buf.as_ptr() as *const TOKEN_USER);
        let mut s: *mut u16 = std::ptr::null_mut();
        if ConvertSidToStringSidW(tu.User.Sid, &mut s) == 0 || s.is_null() {
            return None;
        }
        let mut n = 0;
        while *s.add(n) != 0 {
            n += 1;
        }
        let out = String::from_utf16_lossy(std::slice::from_raw_parts(s, n));
        LocalFree(s.cast());
        Some(out)
    }
}
