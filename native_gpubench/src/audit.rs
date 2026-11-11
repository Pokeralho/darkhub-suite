//! Read-only checks that go with a ranked run: the driver profile that applies to this process (NVIDIA only, through
//! the documented NVAPI DRS calls) and three clocks that must agree. Everything here is a report from the client: the
//! server treats it as a claim. It catches a tuned control panel and off-the-shelf speedhacks, not a rebuilt engine.
//! Function ids, setting ids and struct layouts: NVIDIA's public SDK (nvapi_interface.h, nvapi.h, NvApiDriverSettings.h).
use serde_json::{json, Value};
use std::ffi::c_void;
use windows::core::{s, w};
use windows::Win32::Foundation::HMODULE;
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32};

const NVAPI_INITIALIZE: u32 = 0x0150e828;
const DRS_CREATE_SESSION: u32 = 0x0694d52e;
const DRS_DESTROY_SESSION: u32 = 0xdad9cff8;
const DRS_LOAD_SETTINGS: u32 = 0x375dbd6b;
const DRS_GET_CURRENT_GLOBAL_PROFILE: u32 = 0x617bff9f;
const DRS_FIND_APPLICATION_BY_NAME: u32 = 0xeee566b2;
const DRS_GET_SETTING: u32 = 0x73bf8338;
const DRS_ENUM_SETTINGS: u32 = 0xae3039da;
const DRS_GET_BASE_PROFILE: u32 = 0xda8466a0;
const SETTING_NOT_FOUND: i32 = -160;
const OFF_ID: usize = 4100;

/// (report key, setting id). Texture filtering, LOD bias, vsync and the driver's frame limiter.
const SETTINGS: [(&str, u32); 9] = [
    ("texture_quality", 0x00CE2691),
    ("anisotropic_optimization", 0x00E73211),
    ("trilinear_optimization", 0x002ECAF2),
    ("negative_lod_bias", 0x0019BB68),
    ("lod_bias", 0x00738E8F),
    ("anisotropic_mode", 0x10D2BB16),
    ("anisotropic_level", 0x101E61A9),
    ("vsync", 0x00A879CF),
    ("frame_limiter", 0x10835002),
];

// NVDRS_SETTING_V1, packed: version, name[2048 u16], id, type, location, isCurrentPredefined, isPredefinedValid,
// predefined union (4100 bytes), current union (4100 bytes).
const SETTING_SIZE: usize = 12320;
const OFF_TYPE: usize = 4104;
const OFF_LOCATION: usize = 4108;
const OFF_PREDEFINED_VALID: usize = 4116;
const OFF_PREDEFINED: usize = 4120;
const OFF_CURRENT: usize = 8220;
// NVDRS_APPLICATION_V4: version, isPredefined, four names, flags, command line.
const APP_SIZE: usize = 20492;
const UNICODE_STRING: usize = 2048;
const GUARD: usize = 64;
const GUARD_BYTE: u8 = 0xA5;

type Query = unsafe extern "C" fn(u32) -> *const c_void;

/// A buffer the driver fills, with guard bytes after it: a driver that writes past the struct is caught, not trusted.
struct Guarded(Vec<u8>, usize);
impl Guarded {
    fn new(size: usize, version: u32) -> Self {
        let mut v = vec![0u8; size + GUARD];
        v[size..].fill(GUARD_BYTE);
        v[..4].copy_from_slice(&((size as u32) | (version << 16)).to_le_bytes());
        Guarded(v, size)
    }
    fn intact(&self) -> bool { self.0[self.1..].iter().all(|b| *b == GUARD_BYTE) }
    fn u32_at(&self, off: usize) -> u32 { u32::from_le_bytes(self.0[off..off + 4].try_into().unwrap()) }
    fn ptr(&mut self) -> *mut c_void { self.0.as_mut_ptr() as *mut c_void }
}

unsafe fn func<T: Copy>(query: Query, id: u32) -> Option<T> {
    let p = query(id);
    if p.is_null() { None } else { Some(std::mem::transmute_copy(&p)) }
}

/// The driver settings that apply to this executable. `nvidia`: whether the benchmark adapter is an NVIDIA one.
pub fn driver(nvidia: bool) -> Value {
    if !nvidia { return json!({"type": "driver", "ok": false, "reason": "not_nvidia"}); }
    match unsafe { read_drs() } {
        Ok(v) => v,
        Err(reason) => json!({"type": "driver", "ok": false, "reason": reason}),
    }
}

unsafe fn read_drs() -> Result<Value, String> {
    // System32 only: never an nvapi64.dll sitting next to the executable
    let lib: HMODULE = LoadLibraryExW(w!("nvapi64.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32).map_err(|_| "nvapi_missing".to_string())?;
    let query: Query = std::mem::transmute(GetProcAddress(lib, s!("nvapi_QueryInterface")).ok_or("nvapi_missing")?);
    let missing = || "nvapi_function_missing".to_string();
    let init: unsafe extern "C" fn() -> i32 = func(query, NVAPI_INITIALIZE).ok_or_else(missing)?;
    let create: unsafe extern "C" fn(*mut *mut c_void) -> i32 = func(query, DRS_CREATE_SESSION).ok_or_else(missing)?;
    let destroy: unsafe extern "C" fn(*mut c_void) -> i32 = func(query, DRS_DESTROY_SESSION).ok_or_else(missing)?;
    let load: unsafe extern "C" fn(*mut c_void) -> i32 = func(query, DRS_LOAD_SETTINGS).ok_or_else(missing)?;
    let global: unsafe extern "C" fn(*mut c_void, *mut *mut c_void) -> i32 = func(query, DRS_GET_CURRENT_GLOBAL_PROFILE).ok_or_else(missing)?;
    let find: unsafe extern "C" fn(*mut c_void, *const u16, *mut *mut c_void, *mut c_void) -> i32 = func(query, DRS_FIND_APPLICATION_BY_NAME).ok_or_else(missing)?;
    let get: unsafe extern "C" fn(*mut c_void, *mut c_void, u32, *mut c_void) -> i32 = func(query, DRS_GET_SETTING).ok_or_else(missing)?;
    let enumerate: Option<unsafe extern "C" fn(*mut c_void, *mut c_void, u32, *mut u32, *mut c_void) -> i32> = func(query, DRS_ENUM_SETTINGS);
    let base: Option<unsafe extern "C" fn(*mut c_void, *mut *mut c_void) -> i32> = func(query, DRS_GET_BASE_PROFILE);

    let status = |what: &str, code: i32| if code == 0 { Ok(()) } else { Err(format!("{what}_{code}")) };
    status("initialize", init())?;
    let mut session = std::ptr::null_mut();
    status("session", create(&mut session))?;
    let result = (|| {
        status("load", load(session))?;
        // an application profile for this executable wins over the global one, as it does in the driver
        let mut profile = std::ptr::null_mut();
        let mut name = vec![0u16; UNICODE_STRING];
        let exe: Vec<u16> = std::env::current_exe().map_err(|_| "exe_path")?.to_string_lossy().encode_utf16().collect();
        let n = exe.len().min(UNICODE_STRING - 1);
        name[..n].copy_from_slice(&exe[..n]);
        let mut app = Guarded::new(APP_SIZE, 4);
        let scope = if find(session, name.as_ptr(), &mut profile, app.ptr()) == 0 && !profile.is_null() && app.intact() { "application" } else {
            profile = std::ptr::null_mut();
            status("global_profile", global(session, &mut profile))?;
            "global"
        };
        if !app.intact() { return Err("guard_overrun".to_string()); }

        let mut settings = serde_json::Map::new();
        let mut skipped = serde_json::Map::new();
        for (key, id) in SETTINGS {
            let mut s = Guarded::new(SETTING_SIZE, 1);
            let code = get(session, profile, id, s.ptr());
            if !s.intact() { return Err("guard_overrun".to_string()); }
            // not found: no profile sets it, so the driver default applies
            if code == SETTING_NOT_FOUND { settings.insert(key.to_string(), json!({"state": "default"})); continue; }
            // any other answer, another value type, or an id that does not echo back (layout drift): not reported as a value
            if code != 0 || s.u32_at(OFF_TYPE) != 0 || s.u32_at(OFF_ID) != id { skipped.insert(key.to_string(), json!(code)); continue; }
            let default = if s.u32_at(OFF_PREDEFINED_VALID) != 0 { json!(s.u32_at(OFF_PREDEFINED)) } else { Value::Null };
            settings.insert(key.to_string(), json!({"state": "set", "value": s.u32_at(OFF_CURRENT), "default": default, "location": s.u32_at(OFF_LOCATION)}));
        }
        // Layout check on a setting that certainly exists: the first one the base profile lists must read back through
        // GetSetting with the same id and value. Without it a "default" above could be a misread struct.
        let mut layout = Value::Null;
        if let (Some(enumerate), Some(base)) = (enumerate, base) {
            let mut bp = std::ptr::null_mut();
            let mut first = Guarded::new(SETTING_SIZE, 1);
            let mut count = 1u32;
            if base(session, &mut bp) == 0 && enumerate(session, bp, 0, &mut count, first.ptr()) == 0 && count == 1 && first.intact() {
                let id = first.u32_at(OFF_ID);
                let mut again = Guarded::new(SETTING_SIZE, 1);
                let ok = get(session, bp, id, again.ptr()) == 0 && again.intact() && again.u32_at(OFF_ID) == id
                    && (first.u32_at(OFF_TYPE) != 0 || again.u32_at(OFF_CURRENT) == first.u32_at(OFF_CURRENT));
                layout = json!(ok);
            }
        }
        if layout == json!(false) { return Err("layout_mismatch".to_string()); }
        Ok(json!({"type": "driver", "ok": true, "layoutChecked": layout, "api": "nvapi-drs", "profile": scope, "settings": settings, "skipped": skipped}))
    })();
    destroy(session);
    result
}

#[link(name = "kernel32")]
extern "system" {
    fn QueryPerformanceCounter(count: *mut i64) -> i32;
    fn QueryPerformanceFrequency(freq: *mut i64) -> i32;
}

/// Three readings of "now", each from a different source. A speedhack hooks the first and cannot reach the others.
#[derive(Clone, Copy)]
pub struct Clocks {
    /// QueryPerformanceCounter through the API, in seconds.
    pub qpc: f64,
    /// The kernel's interrupt time read straight from the shared user page, in seconds: no API call to hook.
    pub interrupt: f64,
}

pub fn clocks() -> Clocks {
    unsafe {
        let (mut c, mut f) = (0i64, 1i64);
        QueryPerformanceCounter(&mut c);
        QueryPerformanceFrequency(&mut f);
        // KUSER_SHARED_DATA.InterruptTime (KSYSTEM_TIME at 0x7FFE0008), 100 ns units; high part read twice against tearing
        let base = 0x7FFE_0008usize as *const u32;
        let ticks = loop {
            let (high1, low, high2) = (base.add(1).read_volatile(), base.read_volatile(), base.add(2).read_volatile());
            if high1 == high2 { break ((high1 as u64) << 32) | low as u64; }
        };
        Clocks { qpc: c as f64 / f as f64, interrupt: ticks as f64 / 1e7 }
    }
}

/// Elapsed milliseconds on each clock; `gpu` is the GPU's own timestamp counter over the same span.
pub fn clock_report(start: Clocks, end: Clocks, gpu_ms: Option<f64>) -> Value {
    let r = |x: f64| (x * 100.0).round() / 100.0;
    json!({"qpcMs": r((end.qpc - start.qpc) * 1000.0), "interruptMs": r((end.interrupt - start.interrupt) * 1000.0), "gpuMs": gpu_ms.map(r)})
}
