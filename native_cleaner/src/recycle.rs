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
