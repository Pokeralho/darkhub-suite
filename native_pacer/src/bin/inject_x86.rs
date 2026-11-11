// DarkHub.PacerInject.x86.exe: loads DarkHub.PacerHook.x86.dll into ONE 32-bit (WOW64) game.
//
// The 64-bit controller (DarkHub.FrameLimiter.exe) cannot simply resolve the 32-bit
// kernel32!LoadLibraryW for a WOW64 target, so it runs this x86 helper, which can: in every WOW64
// process the 32-bit kernel32 is mapped at the same address as in this one.
//
// Usage: DarkHub.PacerInject.x86.exe <pid> <creation-filetime> <absolute dll path>
// Prints one JSON line and exits 0 on success. Exit codes: 2 bad arguments / wrong build,
// 3 identity mismatch (PID reused), 4 refused (wrong bitness, protected, other session/user),
// 5 injection failed.
//
// It re-checks everything the controller checked, on its own handle: never trusts the caller.

#![cfg_attr(not(windows), allow(dead_code))]

#[cfg(all(windows, target_arch = "x86"))]
mod imp {
    use std::ffi::c_void;
    use std::ptr;

    type BOOL = i32;
    type HANDLE = *mut c_void;
    type DWORD = u32;

    #[repr(C)]
    #[derive(Default, Clone, Copy)]
    struct FILETIME {
        low: u32,
        high: u32,
    }

    extern "system" {
        fn OpenProcess(access: DWORD, inherit: BOOL, pid: DWORD) -> HANDLE;
        fn CloseHandle(h: HANDLE) -> BOOL;
        fn GetProcessTimes(h: HANDLE, creation: *mut FILETIME, exit: *mut FILETIME, kernel: *mut FILETIME, user: *mut FILETIME) -> BOOL;
        fn GetExitCodeProcess(h: HANDLE, code: *mut DWORD) -> BOOL;
        fn GetExitCodeThread(h: HANDLE, code: *mut DWORD) -> BOOL;
        fn GetCurrentProcess() -> HANDLE;
        fn GetCurrentProcessId() -> DWORD;
        fn ProcessIdToSessionId(pid: DWORD, session: *mut DWORD) -> BOOL;
        fn IsWow64Process(h: HANDLE, wow: *mut BOOL) -> BOOL;
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
        fn GetProcAddress(m: *mut c_void, name: *const u8) -> *mut c_void;
        fn VirtualAllocEx(h: HANDLE, addr: *mut c_void, size: usize, ty: DWORD, protect: DWORD) -> *mut c_void;
        fn VirtualFreeEx(h: HANDLE, addr: *mut c_void, size: usize, ty: DWORD) -> BOOL;
        fn WriteProcessMemory(h: HANDLE, addr: *mut c_void, buf: *const c_void, size: usize, written: *mut usize) -> BOOL;
        fn CreateRemoteThread(h: HANDLE, attr: *mut c_void, stack: usize, start: *mut c_void, param: *mut c_void, flags: DWORD, tid: *mut DWORD) -> HANDLE;
        fn WaitForSingleObject(h: HANDLE, ms: DWORD) -> DWORD;
        fn GetLastError() -> DWORD;
        fn GetFileAttributesW(path: *const u16) -> DWORD;
    }

    #[link(name = "advapi32")]
    extern "system" {
        fn OpenProcessToken(h: HANDLE, access: DWORD, token: *mut HANDLE) -> BOOL;
        fn GetTokenInformation(token: HANDLE, class: u32, info: *mut c_void, len: DWORD, ret: *mut DWORD) -> BOOL;
        fn EqualSid(a: *mut c_void, b: *mut c_void) -> BOOL;
    }

    const PROCESS_CREATE_THREAD: DWORD = 0x0002;
    const PROCESS_VM_OPERATION: DWORD = 0x0008;
    const PROCESS_VM_READ: DWORD = 0x0010;
    const PROCESS_VM_WRITE: DWORD = 0x0020;
    const PROCESS_QUERY_INFORMATION: DWORD = 0x0400;
    const PROCESS_QUERY_LIMITED_INFORMATION: DWORD = 0x1000;
    const SYNCHRONIZE: DWORD = 0x0010_0000;
    const MEM_COMMIT: DWORD = 0x1000;
    const MEM_RESERVE: DWORD = 0x2000;
    const MEM_RELEASE: DWORD = 0x8000;
    const PAGE_READWRITE: DWORD = 4;
    const STILL_ACTIVE: DWORD = 259;
    const IMAGE_FILE_MACHINE_UNKNOWN: u16 = 0;
    const IMAGE_FILE_MACHINE_I386: u16 = 0x014c;
    const TOKEN_QUERY: DWORD = 0x0008;
    const TOKEN_USER_CLASS: u32 = 1;
    const PROCESS_PROTECTION_LEVEL_INFO_CLASS: u32 = 7;
    const PROTECTION_LEVEL_NONE: DWORD = 0xFFFF_FFFE;

    fn out(ok: bool, code: &str, msg: &str) {
        let esc = msg.replace('\\', "\\\\").replace('"', "\\\"");
        println!("{{\"ok\":{},\"code\":\"{}\",\"message\":\"{}\"}}", ok, code, esc);
    }

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// PE machine of a file on disk (0 when unreadable).
    fn pe_machine(path: &str) -> u16 {
        let data = match std::fs::read(path) {
            Ok(d) => d,
            Err(_) => return 0,
        };
        if data.len() < 0x40 || &data[0..2] != b"MZ" {
            return 0;
        }
        let off = u32::from_le_bytes([data[0x3c], data[0x3d], data[0x3e], data[0x3f]]) as usize;
        if off + 6 > data.len() || &data[off..off + 4] != b"PE\0\0" {
            return 0;
        }
        u16::from_le_bytes([data[off + 4], data[off + 5]])
    }

    struct Handle(HANDLE);
    impl Drop for Handle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe { CloseHandle(self.0) };
            }
        }
    }

    unsafe fn token_user(process: HANDLE, buf: &mut [u8; 256]) -> *mut c_void {
        let mut tok: HANDLE = ptr::null_mut();
        if OpenProcessToken(process, TOKEN_QUERY, &mut tok) == 0 {
            return ptr::null_mut();
        }
        let tok = Handle(tok);
        let mut len = 0u32;
        if GetTokenInformation(tok.0, TOKEN_USER_CLASS, buf.as_mut_ptr() as *mut c_void, buf.len() as u32, &mut len) == 0 {
            return ptr::null_mut();
        }
        // TOKEN_USER { SID_AND_ATTRIBUTES { PSID Sid; DWORD Attributes } }
        *(buf.as_ptr() as *const *mut c_void)
    }

    /// Bitness of the target as seen from this (WOW64) helper. Returns the WOW64 guest machine,
    /// or IMAGE_FILE_MACHINE_UNKNOWN when it is a native (64-bit / ARM64) process.
    unsafe fn target_machine(h: HANDLE) -> Option<(u16, u16)> {
        type FnIsWow64Process2 = unsafe extern "system" fn(HANDLE, *mut u16, *mut u16) -> BOOL;
        let k32 = GetModuleHandleW(wide("kernel32.dll").as_ptr());
        let p = GetProcAddress(k32, b"IsWow64Process2\0".as_ptr());
        if !p.is_null() {
            let f: FnIsWow64Process2 = std::mem::transmute(p);
            let (mut pm, mut nm) = (0u16, 0u16);
            if f(h, &mut pm, &mut nm) != 0 {
                return Some((pm, nm));
            }
            return None;
        }
        // Windows 10 < 1511: IsWow64Process only says "32-bit on 64-bit" (x64 hosts only there).
        let mut wow: BOOL = 0;
        if IsWow64Process(h, &mut wow) == 0 {
            return None;
        }
        Some((if wow != 0 { IMAGE_FILE_MACHINE_I386 } else { IMAGE_FILE_MACHINE_UNKNOWN }, 0x8664))
    }

    unsafe fn protection_level(h: HANDLE) -> Option<DWORD> {
        type FnGetProcessInformation = unsafe extern "system" fn(HANDLE, u32, *mut c_void, DWORD) -> BOOL;
        let k32 = GetModuleHandleW(wide("kernel32.dll").as_ptr());
        let p = GetProcAddress(k32, b"GetProcessInformation\0".as_ptr());
        if p.is_null() {
            return Some(PROTECTION_LEVEL_NONE); // Windows 7: no protected games to worry about
        }
        let f: FnGetProcessInformation = std::mem::transmute(p);
        let mut level: DWORD = 0;
        if f(h, PROCESS_PROTECTION_LEVEL_INFO_CLASS, &mut level as *mut DWORD as *mut c_void, 4) == 0 {
            return None;
        }
        Some(level)
    }

    pub fn main() -> i32 {
        let args: Vec<String> = std::env::args().collect();
        if args.len() != 4 {
            out(false, "bad_args", "usage: <pid> <creation-filetime> <dll>");
            return 2;
        }
        let pid: u32 = match args[1].parse() {
            Ok(v) if v > 4 => v,
            _ => {
                out(false, "bad_args", "pid");
                return 2;
            }
        };
        let creation: u64 = match args[2].parse() {
            Ok(v) if v > 0 => v,
            _ => {
                out(false, "bad_args", "creation time");
                return 2;
            }
        };
        let dll = args[3].clone();
        let dll_w = wide(&dll);
        if !std::path::Path::new(&dll).is_absolute() || unsafe { GetFileAttributesW(dll_w.as_ptr()) } == u32::MAX {
            out(false, "dll_missing", &dll);
            return 2;
        }
        if pe_machine(&dll) != IMAGE_FILE_MACHINE_I386 {
            out(false, "dll_wrong_bitness", "the hook DLL is not an x86 image");
            return 4;
        }

        unsafe {
            let access = PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION
                | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ | SYNCHRONIZE;
            let h = Handle(OpenProcess(access, 0, pid));
            if h.0.is_null() {
                out(false, "open_failed", &format!("OpenProcess error {}", GetLastError()));
                return 5;
            }

            // Identity: the handle pins the process object, so after this check the PID cannot be
            // recycled under us.
            let (mut c, mut e, mut k, mut u) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
            if GetProcessTimes(h.0, &mut c, &mut e, &mut k, &mut u) == 0 {
                out(false, "identity_mismatch", "GetProcessTimes failed");
                return 3;
            }
            let got = ((c.high as u64) << 32) | c.low as u64;
            if got != creation {
                out(false, "identity_mismatch", &format!("creation time {} != expected {}", got, creation));
                return 3;
            }
            let mut code: DWORD = 0;
            if GetExitCodeProcess(h.0, &mut code) == 0 || code != STILL_ACTIVE {
                out(false, "exited", "target is not running");
                return 3;
            }

            match target_machine(h.0) {
                Some((IMAGE_FILE_MACHINE_I386, _)) => {}
                Some((pm, nm)) => {
                    out(false, "wrong_bitness", &format!("target is not a 32-bit x86 process (process 0x{:x}, native 0x{:x})", pm, nm));
                    return 4;
                }
                None => {
                    out(false, "wrong_bitness", "bitness query failed");
                    return 4;
                }
            }

            let (mut s_me, mut s_t) = (0u32, 0u32);
            if ProcessIdToSessionId(GetCurrentProcessId(), &mut s_me) == 0 || ProcessIdToSessionId(pid, &mut s_t) == 0 || s_t == 0 || s_t != s_me {
                out(false, "other_session", "target is not in this interactive session");
                return 4;
            }
            let (mut b1, mut b2) = ([0u8; 256], [0u8; 256]);
            let me = token_user(GetCurrentProcess(), &mut b1);
            let them = token_user(h.0, &mut b2);
            if me.is_null() || them.is_null() || EqualSid(me, them) == 0 {
                out(false, "other_user", "target belongs to another user");
                return 4;
            }
            match protection_level(h.0) {
                Some(PROTECTION_LEVEL_NONE) => {}
                _ => {
                    out(false, "protected_process", "target is a protected process");
                    return 4;
                }
            }

            let bytes = (dll_w.len() * 2) as usize;
            let mem = VirtualAllocEx(h.0, ptr::null_mut(), bytes, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
            if mem.is_null() {
                out(false, "alloc_failed", &format!("VirtualAllocEx error {}", GetLastError()));
                return 5;
            }
            let mut written = 0usize;
            if WriteProcessMemory(h.0, mem, dll_w.as_ptr() as *const c_void, bytes, &mut written) == 0 || written != bytes {
                VirtualFreeEx(h.0, mem, 0, MEM_RELEASE);
                out(false, "write_failed", &format!("WriteProcessMemory error {}", GetLastError()));
                return 5;
            }
            let k32 = GetModuleHandleW(wide("kernel32.dll").as_ptr());
            let load_library = GetProcAddress(k32, b"LoadLibraryW\0".as_ptr());
            if load_library.is_null() {
                VirtualFreeEx(h.0, mem, 0, MEM_RELEASE);
                out(false, "no_loadlibrary", "LoadLibraryW not found");
                return 5;
            }
            let th = Handle(CreateRemoteThread(h.0, ptr::null_mut(), 0, load_library, mem, 0, ptr::null_mut()));
            if th.0.is_null() {
                VirtualFreeEx(h.0, mem, 0, MEM_RELEASE);
                out(false, "thread_failed", &format!("CreateRemoteThread error {}", GetLastError()));
                return 5;
            }
            let wait = WaitForSingleObject(th.0, 5000);
            if wait != 0 {
                // LoadLibraryW may still be reading the path: leak one page instead of crashing the game.
                out(false, "timeout", "LoadLibraryW did not return within 5 s");
                return 5;
            }
            VirtualFreeEx(h.0, mem, 0, MEM_RELEASE);
            let mut module: DWORD = 0;
            GetExitCodeThread(th.0, &mut module);
            if module == 0 {
                out(false, "loadlibrary_failed", "LoadLibraryW returned NULL in the target");
                return 5;
            }
            out(true, "ok", &format!("module 0x{:08x}", module));
            0
        }
    }
}

#[cfg(all(windows, target_arch = "x86"))]
fn main() {
    std::process::exit(imp::main());
}

/// Built for any other architecture this helper refuses to do anything: injecting from the wrong
/// bitness would resolve the wrong LoadLibraryW.
#[cfg(not(all(windows, target_arch = "x86")))]
fn main() {
    println!("{{\"ok\":false,\"code\":\"wrong_helper_build\",\"message\":\"this helper must be built for i686-pc-windows-msvc\"}}");
    std::process::exit(2);
}
