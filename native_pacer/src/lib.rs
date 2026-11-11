// native_pacer/src/lib.rs - v6 (DXGI Present / Present1 + OpenGL SwapBuffers hook: frame limiter
// + measured telemetry). All published metrics come from real present timings. See
// PacerTelemetryV2 for the telemetry layout and PacerConfigV2 for the controller -> hook block.
//
// Built for x86_64 (DarkHub.PacerHook.x64.dll) and i686 (DarkHub.PacerHook.x86.dll); the layout of
// both shared blocks is identical on the two (checked at compile time below).
//
// Fail-safe rules:
// - The cap only applies while the controller (DarkHub.FrameLimiter.exe) keeps writing a fresh
//   QPC heartbeat into PacerConfigV2. If it stops for > HEARTBEAT_STALE_MS (crash, kill, hang),
//   every present passes straight through until it beats again.
// - A config block with an unknown magic / version / size is ignored (pass-through).
// - When the controller selects an adapter LUID, only swap chains whose adapter LUID is known and
//   equal are paced; anything that cannot be attributed (OpenGL, failed query) is left alone.

#![allow(non_snake_case)]
#![allow(non_camel_case_types)]
#![allow(dead_code)]
#![allow(static_mut_refs)]
#![allow(non_upper_case_globals)]

use std::ffi::c_void;
use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, Ordering};

type HRESULT = i32;
type HWND = *mut c_void;
type BOOL = i32;
type DWORD = u32;
type HANDLE = *mut c_void;
type LPVOID = *mut c_void;
type SIZE_T = usize;
type HMODULE = *mut c_void;

#[repr(C)]
struct DXGI_RATIONAL {
    numerator: u32,
    denominator: u32,
}

#[repr(C)]
struct DXGI_MODE_DESC {
    width: u32,
    height: u32,
    refresh_rate: DXGI_RATIONAL,
    format: u32,
    scanline_ordering: u32,
    scaling: u32,
}

#[repr(C)]
struct DXGI_SAMPLE_DESC {
    count: u32,
    quality: u32,
}

#[repr(C)]
struct DXGI_SWAP_CHAIN_DESC {
    buffer_desc: DXGI_MODE_DESC,
    sample_desc: DXGI_SAMPLE_DESC,
    buffer_usage: u32,
    buffer_count: u32,
    output_window: HWND,
    windowed: BOOL,
    swap_effect: u32,
    flags: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct LUID {
    low: u32,
    high: i32,
}

#[repr(C)]
struct DXGI_ADAPTER_DESC {
    description: [u16; 128],
    vendor_id: u32,
    device_id: u32,
    sub_sys_id: u32,
    revision: u32,
    dedicated_video_memory: usize,
    dedicated_system_memory: usize,
    shared_system_memory: usize,
    adapter_luid: LUID,
}

#[repr(C)]
struct GUID {
    d1: u32,
    d2: u16,
    d3: u16,
    d4: [u8; 8],
}

const IID_IDXGIDevice: GUID = GUID { d1: 0x54ec77fa, d2: 0x1377, d3: 0x44e6, d4: [0x8c, 0x32, 0x88, 0xfd, 0x5f, 0x44, 0xc8, 0x4c] };
const IID_ID3D12CommandQueue: GUID = GUID { d1: 0x0ec870a6, d2: 0x5d7e, d3: 0x4c22, d4: [0x8c, 0xfc, 0x5b, 0xaa, 0xe0, 0x76, 0x16, 0xed] };
const IID_ID3D12Device: GUID = GUID { d1: 0x189819f1, d2: 0x1db6, d3: 0x4b57, d4: [0xbe, 0x54, 0x18, 0x21, 0x33, 0x9b, 0x85, 0xf7] };

// ---------------------------------------------------------------------------------------------
// Controller -> hook config v2 (shared memory "DarkHub_Pacer_Config2").
//
// Written by DarkHub.FrameLimiter.exe (C#, struct PacerConfigV2 with explicit FieldOffset),
// read by this DLL in 64-bit AND 32-bit games. Every field has a fixed size and offset; the
// compile-time asserts below and tests/pacerConfigLayout.test.ts keep both sides identical.
// The mapping name differs from v1 ("DarkHub_Pacer_Config", 16 bytes) on purpose: an older hook
// still loaded in a running game never misreads a v2 block (it would read `version` as fps).
// ---------------------------------------------------------------------------------------------
pub const CFG_MAGIC: u32 = 0x4441_524B; // 'DARK'
pub const CFG_VERSION: u32 = 2;
pub const CFG_SIZE: u32 = 64;
/// Heartbeat older than this means "controller gone": stop limiting.
pub const HEARTBEAT_STALE_MS: f64 = 2000.0;
const MAX_TARGET_FPS: u32 = 1000;

#[repr(C, align(8))]
#[derive(Clone, Copy)]
pub struct PacerConfigV2 {
    pub magic: u32,          // 0   'DARK'
    pub version: u32,        // 4   = 2
    pub size: u32,           // 8   = 64
    pub enabled: u32,        // 12  1 = limiter on
    pub target_fps: u32,     // 16
    pub pacing_mode: u32,    // 20  2 = uncapped
    pub heartbeat_qpc: i64,  // 24  controller's QueryPerformanceCounter at its last beat (0 = gone)
    pub adapter_luid: u64,   // 32  LowPart | HighPart << 32 of the adapter to pace; 0 = any
    pub controller_pid: u32, // 40  informational
    pub flags: u32,          // 44  reserved, 0
    pub reserved: [u64; 2],  // 48
}

const _: () = {
    assert!(std::mem::size_of::<PacerConfigV2>() == 64);
    assert!(std::mem::align_of::<PacerConfigV2>() == 8);
    assert!(std::mem::offset_of!(PacerConfigV2, magic) == 0);
    assert!(std::mem::offset_of!(PacerConfigV2, version) == 4);
    assert!(std::mem::offset_of!(PacerConfigV2, size) == 8);
    assert!(std::mem::offset_of!(PacerConfigV2, enabled) == 12);
    assert!(std::mem::offset_of!(PacerConfigV2, target_fps) == 16);
    assert!(std::mem::offset_of!(PacerConfigV2, pacing_mode) == 20);
    assert!(std::mem::offset_of!(PacerConfigV2, heartbeat_qpc) == 24);
    assert!(std::mem::offset_of!(PacerConfigV2, adapter_luid) == 32);
    assert!(std::mem::offset_of!(PacerConfigV2, controller_pid) == 40);
    assert!(std::mem::offset_of!(PacerConfigV2, flags) == 44);
    assert!(std::mem::offset_of!(PacerConfigV2, reserved) == 48);
};

#[cfg_attr(windows, link(name = "user32"))]
extern "system" {
    fn CreateWindowExA(
        dwExStyle: DWORD,
        lpClassName: *const i8,
        lpWindowName: *const i8,
        dwStyle: DWORD,
        X: i32,
        Y: i32,
        nWidth: i32,
        nHeight: i32,
        hWndParent: HWND,
        hMenu: *mut c_void,
        hInstance: *mut c_void,
        lpParam: *mut c_void,
    ) -> HWND;
    fn DestroyWindow(hWnd: HWND) -> BOOL;
}

#[cfg_attr(windows, link(name = "winmm"))]
extern "system" {
    fn timeBeginPeriod(uPeriod: u32) -> u32;
    fn timeEndPeriod(uPeriod: u32) -> u32;
}

extern "system" {
    fn QueryPerformanceCounter(lpPerformanceCount: *mut i64) -> BOOL;
    fn QueryPerformanceFrequency(lpFrequency: *mut i64) -> BOOL;
    fn VirtualProtect(lpAddress: LPVOID, dwSize: SIZE_T, flNewProtect: DWORD, lpflOldProtect: *mut DWORD) -> BOOL;
    fn CreateFileMappingW(hFile: HANDLE, lpAttributes: *mut c_void, flProtect: DWORD, dwMaximumSizeHigh: DWORD, dwMaximumSizeLow: DWORD, lpName: *const u16) -> HANDLE;
    fn OpenFileMappingW(dwDesiredAccess: DWORD, bInheritHandle: BOOL, lpName: *const u16) -> HANDLE;
    fn MapViewOfFile(hFileMappingObject: HANDLE, dwDesiredAccess: DWORD, dwFileOffsetHigh: DWORD, dwFileOffsetLow: DWORD, dwNumberOfBytesToMap: SIZE_T) -> LPVOID;
    fn CloseHandle(hObject: HANDLE) -> BOOL;
    fn GetCurrentProcessId() -> DWORD;
    fn GetCurrentThreadId() -> DWORD;
    fn GetCurrentProcess() -> HANDLE;
    fn Sleep(dwMilliseconds: DWORD);
    fn LoadLibraryA(lpLibFileName: *const i8) -> *mut c_void;
    fn GetModuleHandleA(lpModuleName: *const i8) -> HMODULE;
    fn GetModuleHandleExW(dwFlags: DWORD, lpModuleName: *const u16, phModule: *mut HMODULE) -> BOOL;
    fn FreeLibrary(hLibModule: HMODULE) -> BOOL;
    fn K32EnumProcessModules(hProcess: HANDLE, lphModule: *mut HMODULE, cb: DWORD, lpcbNeeded: *mut DWORD) -> BOOL;
    fn GetProcAddress(hModule: *mut c_void, lpProcName: *const i8) -> *mut c_void;
    fn CreateThread(lpThreadAttributes: *mut c_void, dwStackSize: SIZE_T, lpStartAddress: extern "system" fn(*mut c_void) -> u32, lpParameter: *mut c_void, dwCreationFlags: DWORD, lpThreadId: *mut DWORD) -> HANDLE;
    fn CreateWaitableTimerExW(lpTimerAttributes: *mut c_void, lpTimerName: *const u16, dwFlags: DWORD, dwDesiredAccess: DWORD) -> HANDLE;
    fn SetWaitableTimer(hTimer: HANDLE, lpDueTime: *const i64, lPeriod: i32, pfnCompletionRoutine: *mut c_void, lpArgToCompletionRoutine: *mut c_void, fResume: BOOL) -> BOOL;
    fn WaitForSingleObject(hHandle: HANDLE, dwMilliseconds: DWORD) -> DWORD;
}

const CREATE_WAITABLE_TIMER_HIGH_RESOLUTION: DWORD = 0x0000_0002;
const TIMER_ALL_ACCESS: DWORD = 0x001F_0003;
const GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT: DWORD = 0x2;
const GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS: DWORD = 0x4;

type FnPresent = unsafe extern "system" fn(p_swap_chain: *mut c_void, sync_interval: u32, flags: u32) -> HRESULT;
type FnPresent1 = unsafe extern "system" fn(p_swap_chain: *mut c_void, sync_interval: u32, present_flags: u32, p_present_parameters: *const c_void) -> HRESULT;
type FnSwapBuffers = unsafe extern "system" fn(hdc: *mut c_void) -> BOOL;

type FnD3D11CreateDeviceAndSwapChain = unsafe extern "system" fn(
    p_adapter: *mut c_void,
    driver_type: u32,
    software: *mut c_void,
    flags: u32,
    p_feature_levels: *const u32,
    feature_levels: u32,
    sdkversion: u32,
    p_swap_chain_desc: *const DXGI_SWAP_CHAIN_DESC,
    pp_swap_chain: *mut *mut *mut usize,
    pp_device: *mut *mut c_void,
    p_feature_level: *mut u32,
    pp_immediate_context: *mut *mut c_void,
) -> HRESULT;

// ---------------------------------------------------------------------------------------------
// Telemetry v2 (shared memory "DarkHub_Pacer_Telemetry2")
//
// Every number published here is measured from real present calls. Nothing is estimated or
// back-filled: until enough frames exist, the corresponding field is published as 0 and the
// reader must treat 0 as "not available".
//
// Consistency: single writer / many readers "seqlock". `seq` is odd while the writer is updating.
// A reader copies the block, and accepts it only if `seq` was even and unchanged afterwards.
// ---------------------------------------------------------------------------------------------
pub const TEL_MAGIC: u32 = 0x324D_4C54; // 'TLM2'
pub const TEL_RING: usize = 240;

#[repr(C, align(8))]
#[derive(Clone, Copy)]
pub struct PacerTelemetryV2 {
    pub magic: u32,                // 0
    pub seq: u32,                  // 4
    pub frame_count: u64,          // 8
    pub last_present_qpc: i64,     // 16  raw QueryPerformanceCounter value of the last measured present
    pub qpc_freq: i64,             // 24
    pub game_pid: u32,             // 32
    pub target_fps: u32,           // 36  cap actually applied (0 = none, e.g. controller gone)
    pub current_fps: f32,          // 40
    pub current_frametime_ms: f32, // 44
    pub avg_fps: f32,              // 48  frames in the last ~1s window
    pub low1_fps: f32,             // 52  1% low  = fps of the mean of the worst 1% frame times
    pub low01_fps: f32,            // 56  0.1% low (0 until >= 1000 frames were captured)
    pub jitter_ms: f32,            // 60  std-dev of frame time in the last ~1s window
    pub stutter_count: u32,        // 64  cumulative frames slower than 2x the rolling median
    pub sample_count: u32,         // 68  frames currently held in the statistics window
    pub ring_len: u32,             // 72  valid entries in `ring`
    pub reserved: u32,             // 76
    pub ring: [f32; TEL_RING],     // 80  most recent frame times (ms), oldest first
}

const _: () = {
    assert!(std::mem::size_of::<PacerTelemetryV2>() == 80 + TEL_RING * 4);
    assert!(std::mem::offset_of!(PacerTelemetryV2, last_present_qpc) == 16);
    assert!(std::mem::offset_of!(PacerTelemetryV2, game_pid) == 32);
    assert!(std::mem::offset_of!(PacerTelemetryV2, ring_len) == 72);
    assert!(std::mem::offset_of!(PacerTelemetryV2, ring) == 80);
};

static mut ORIGINAL_PRESENT: Option<FnPresent> = None;
static mut ORIGINAL_PRESENT1: Option<FnPresent1> = None;
static mut PRESENT_SLOT: usize = 0;
static mut PRESENT1_SLOT: usize = 0;
static mut PRESENT_ORIG_ADDR: usize = 0;
static mut PRESENT1_ORIG_ADDR: usize = 0;

static mut QPC_FREQ: i64 = 0;
static mut LAST_PRESENT_QPC: i64 = 0;
static mut TELEMETRY_PTR: *mut PacerTelemetryV2 = ptr::null_mut();
static mut CONFIG_PTR: *mut PacerConfigV2 = ptr::null_mut();

// High-resolution waitable timer used by the limiter. Only touched while BUSY is held, so one
// shared handle is enough. Null => fall back to Sleep() (Windows < 10 1803).
static mut WAIT_TIMER: HANDLE = ptr::null_mut();

static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);
static HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);
static TIMER_PERIOD_SET: AtomicBool = AtomicBool::new(false);
static BUSY: AtomicBool = AtomicBool::new(false);
/// Thread currently inside a hooked present. A present that re-enters on the same thread (e.g.
/// SwapBuffers -> hooked gdi32 import -> another hooked slot, or Present1 -> Present) is not
/// paced twice.
static IN_PRESENT_TID: AtomicU32 = AtomicU32::new(0);

const HIST_CAP: usize = 2048;
static mut HIST: [f32; HIST_CAP] = [0.0; HIST_CAP];
static mut HIST_HEAD: usize = 0; // next write position
static mut HIST_LEN: usize = 0;
static mut SCRATCH: [f32; HIST_CAP] = [0.0; HIST_CAP];

static mut CUR_STATS: Stats = Stats::ZERO;
static mut MEDIAN_MS: f32 = 0.0;
static mut STUTTERS: u32 = 0;
static mut LAST_PUBLISH_MS: f64 = 0.0;

// Swap chains (DXGI) and device contexts (OpenGL) seen presenting. Only the busiest eligible one
// (the game's own) is paced and measured, so overlay / capture swap chains do not pollute it.
const KIND_DXGI: u8 = 1;
const KIND_GL: u8 = 2;
const SC_SLOTS: usize = 8;
static mut SC_PTRS: [usize; SC_SLOTS] = [0; SC_SLOTS];
static mut SC_COUNTS: [u32; SC_SLOTS] = [0; SC_SLOTS];
/// Adapter LUID of each slot (0 = unknown / not attributable, e.g. OpenGL).
static mut SC_LUIDS: [u64; SC_SLOTS] = [0; SC_SLOTS];
static mut MAIN_SC: usize = 0;
static mut SC_WINDOW_START_MS: f64 = 0.0;

#[derive(Clone, Copy)]
struct Stats {
    avg_fps: f32,
    low1_fps: f32,
    low01_fps: f32,
    jitter_ms: f32,
    samples: u32,
}

impl Stats {
    const ZERO: Stats = Stats { avg_fps: 0.0, low1_fps: 0.0, low01_fps: 0.0, jitter_ms: 0.0, samples: 0 };
}

#[inline]
unsafe fn get_qpc_ms() -> f64 {
    let mut count = 0i64;
    QueryPerformanceCounter(&mut count);
    if QPC_FREQ == 0 {
        return 0.0;
    }
    (count as f64 / QPC_FREQ as f64) * 1000.0
}

#[inline]
unsafe fn precision_wait(target_ms: f64, start_ms: f64) {
    loop {
        let elapsed = get_qpc_ms() - start_ms;
        let remaining = target_ms - elapsed;
        if remaining <= 0.0 {
            break;
        }
        // Block on a high-resolution waitable timer while far from the deadline (no core burned),
        // then spin only for the last ~0.5 ms. Without the timer, coarse Sleep + ~1.5 ms spin.
        if !WAIT_TIMER.is_null() && remaining > 0.75 {
            let due_100ns: i64 = -(((remaining - 0.5) * 10_000.0) as i64).max(1); // relative
            if SetWaitableTimer(WAIT_TIMER, &due_100ns, 0, ptr::null_mut(), ptr::null_mut(), 0) != 0 {
                WaitForSingleObject(WAIT_TIMER, (remaining as u32).saturating_add(20));
            } else {
                Sleep((remaining - 1.0).max(0.0) as u32);
            }
        } else if WAIT_TIMER.is_null() && remaining > 1.5 {
            Sleep((remaining - 1.0) as u32);
        } else {
            std::hint::spin_loop();
        }
    }
}

/// k = 0 is the most recent sample.
#[inline]
unsafe fn hist_recent(k: usize) -> f32 {
    HIST[(HIST_HEAD + HIST_CAP - 1 - k) % HIST_CAP]
}

unsafe fn push_sample(ft: f32) {
    HIST[HIST_HEAD] = ft;
    HIST_HEAD = (HIST_HEAD + 1) % HIST_CAP;
    if HIST_LEN < HIST_CAP {
        HIST_LEN += 1;
    }
}

/// Recomputes statistics from the real frame-time history. Called a few times per second.
unsafe fn compute_stats() -> Stats {
    let len = HIST_LEN;
    if len < 2 {
        return Stats::ZERO;
    }

    // ~1 second window: average fps and jitter.
    let mut acc = 0.0f64;
    let mut n1 = 0usize;
    while n1 < len && acc < 1000.0 {
        acc += hist_recent(n1) as f64;
        n1 += 1;
    }
    let avg_fps = if acc > 0.0 { (n1 as f64 * 1000.0 / acc) as f32 } else { 0.0 };
    let mean = (acc / n1 as f64) as f32;
    let mut var = 0.0f32;
    for k in 0..n1 {
        let d = hist_recent(k) - mean;
        var += d * d;
    }
    let jitter = (var / n1 as f32).sqrt();

    // Percentile lows over the whole retained history, from a sorted copy.
    for i in 0..len {
        SCRATCH[i] = hist_recent(i);
    }
    SCRATCH[..len].sort_unstable_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    MEDIAN_MS = SCRATCH[len / 2];

    let mean_worst = |count: usize| -> f32 {
        let c = count.max(1).min(len);
        let mut s = 0.0f32;
        for i in (len - c)..len {
            s += SCRATCH[i];
        }
        s / c as f32
    };

    let worst1 = mean_worst(len / 100);
    let low1 = if worst1 > 0.0 { 1000.0 / worst1 } else { 0.0 };
    let low01 = if len >= 1000 {
        let w = mean_worst(len / 1000);
        if w > 0.0 { 1000.0 / w } else { 0.0 }
    } else {
        0.0
    };

    Stats { avg_fps, low1_fps: low1, low01_fps: low01, jitter_ms: jitter, samples: len as u32 }
}

unsafe fn publish(target_fps: u32, cur_ft: f32, qpc_now: i64) {
    if TELEMETRY_PTR.is_null() {
        return;
    }
    let tel = TELEMETRY_PTR;
    let seq_ptr = ptr::addr_of_mut!((*tel).seq);

    // seq -> odd: writing
    let s0 = ptr::read_volatile(seq_ptr);
    ptr::write_volatile(seq_ptr, s0.wrapping_add(1));
    std::sync::atomic::fence(Ordering::SeqCst);

    (*tel).magic = TEL_MAGIC;
    (*tel).frame_count = FRAME_COUNT.load(Ordering::Relaxed);
    (*tel).last_present_qpc = qpc_now;
    (*tel).qpc_freq = QPC_FREQ;
    (*tel).game_pid = GetCurrentProcessId();
    (*tel).target_fps = target_fps;
    (*tel).current_frametime_ms = cur_ft;
    (*tel).current_fps = if cur_ft > 0.0 { 1000.0 / cur_ft } else { 0.0 };
    (*tel).avg_fps = CUR_STATS.avg_fps;
    (*tel).low1_fps = CUR_STATS.low1_fps;
    (*tel).low01_fps = CUR_STATS.low01_fps;
    (*tel).jitter_ms = CUR_STATS.jitter_ms;
    (*tel).stutter_count = STUTTERS;
    (*tel).sample_count = CUR_STATS.samples;

    let n = HIST_LEN.min(TEL_RING);
    for i in 0..n {
        // oldest first
        (*tel).ring[i] = hist_recent(n - 1 - i);
    }
    (*tel).ring_len = n as u32;

    std::sync::atomic::fence(Ordering::SeqCst);
    ptr::write_volatile(seq_ptr, s0.wrapping_add(2)); // even: stable
}

/// What the controller currently asks for, already validated.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Directive {
    /// Cap to apply; 0 = pass through.
    pub target_fps: u32,
    /// Adapter filter; 0 = any adapter.
    pub adapter_luid: u64,
}

/// Pure decision from a config snapshot. `now_qpc` / `freq` are this process' QPC (system-wide
/// clock, so directly comparable with the controller's heartbeat).
pub fn evaluate_config(cfg: &PacerConfigV2, now_qpc: i64, freq: i64) -> Directive {
    let off = Directive { target_fps: 0, adapter_luid: 0 };
    if cfg.magic != CFG_MAGIC || cfg.version != CFG_VERSION || cfg.size != CFG_SIZE || freq <= 0 {
        return off;
    }
    let luid = cfg.adapter_luid;
    let hb = cfg.heartbeat_qpc;
    if hb <= 0 {
        return Directive { target_fps: 0, adapter_luid: luid };
    }
    let age_ms = (now_qpc - hb) as f64 * 1000.0 / freq as f64;
    // A heartbeat from the future (> 0.5 s) is as untrustworthy as a stale one.
    if age_ms > HEARTBEAT_STALE_MS || age_ms < -500.0 {
        return Directive { target_fps: 0, adapter_luid: luid };
    }
    if cfg.enabled != 1 || cfg.pacing_mode == 2 {
        return Directive { target_fps: 0, adapter_luid: luid };
    }
    Directive { target_fps: cfg.target_fps.min(MAX_TARGET_FPS), adapter_luid: luid }
}

/// Reads the shared block field by field (the 64-bit fields atomically, so a 32-bit game never
/// sees a torn heartbeat) and evaluates it.
unsafe fn current_directive() -> Directive {
    if CONFIG_PTR.is_null() {
        return Directive { target_fps: 0, adapter_luid: 0 };
    }
    let p = CONFIG_PTR;
    let snap = PacerConfigV2 {
        magic: ptr::read_volatile(ptr::addr_of!((*p).magic)),
        version: ptr::read_volatile(ptr::addr_of!((*p).version)),
        size: ptr::read_volatile(ptr::addr_of!((*p).size)),
        enabled: ptr::read_volatile(ptr::addr_of!((*p).enabled)),
        target_fps: ptr::read_volatile(ptr::addr_of!((*p).target_fps)),
        pacing_mode: ptr::read_volatile(ptr::addr_of!((*p).pacing_mode)),
        heartbeat_qpc: (*(ptr::addr_of!((*p).heartbeat_qpc) as *const AtomicI64)).load(Ordering::Acquire),
        adapter_luid: (*(ptr::addr_of!((*p).adapter_luid) as *const AtomicU64)).load(Ordering::Acquire),
        controller_pid: 0,
        flags: 0,
        reserved: [0; 2],
    };
    let mut now = 0i64;
    QueryPerformanceCounter(&mut now);
    evaluate_config(&snap, now, QPC_FREQ)
}

#[inline]
unsafe fn vfn(obj: *mut c_void, index: usize) -> usize {
    *(*(obj as *const *const usize)).add(index)
}

/// IUnknown::Release (vtable index 2).
unsafe fn com_release(obj: *mut c_void) {
    if obj.is_null() {
        return;
    }
    let release: unsafe extern "system" fn(*mut c_void) -> u32 = std::mem::transmute(vfn(obj, 2));
    release(obj);
}

#[inline]
fn pack_luid(l: LUID) -> u64 {
    (l.low as u64) | ((l.high as u32 as u64) << 32)
}

/// Adapter LUID of a DXGI swap chain, 0 when it cannot be determined.
/// D3D10/11: IDXGISwapChain::GetDevice(IDXGIDevice) -> GetAdapter -> GetDesc.AdapterLuid.
/// D3D12: the swap chain's "device" is the command queue -> ID3D12DeviceChild::GetDevice ->
/// ID3D12Device::GetAdapterLuid. This is the adapter that RENDERS the chain; it says nothing about
/// which GPU scans the image out (hybrid laptops copy across adapters).
unsafe fn query_swapchain_luid(sc: *mut c_void) -> u64 {
    type FnGetDevice = unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> HRESULT;
    type FnGetAdapter = unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT;
    type FnGetDesc = unsafe extern "system" fn(*mut c_void, *mut DXGI_ADAPTER_DESC) -> HRESULT;
    type FnGetAdapterLuid = unsafe extern "system" fn(*mut c_void, *mut LUID) -> *mut LUID;

    if sc.is_null() {
        return 0;
    }
    let get_device: FnGetDevice = std::mem::transmute(vfn(sc, 7)); // IDXGIDeviceSubObject::GetDevice

    let mut dev: *mut c_void = ptr::null_mut();
    if get_device(sc, &IID_IDXGIDevice, &mut dev) >= 0 && !dev.is_null() {
        let mut luid = 0u64;
        let get_adapter: FnGetAdapter = std::mem::transmute(vfn(dev, 7)); // IDXGIDevice::GetAdapter
        let mut adapter: *mut c_void = ptr::null_mut();
        if get_adapter(dev, &mut adapter) >= 0 && !adapter.is_null() {
            let get_desc: FnGetDesc = std::mem::transmute(vfn(adapter, 8)); // IDXGIAdapter::GetDesc
            let mut desc: DXGI_ADAPTER_DESC = std::mem::zeroed();
            if get_desc(adapter, &mut desc) >= 0 {
                luid = pack_luid(desc.adapter_luid);
            }
            com_release(adapter);
        }
        com_release(dev);
        return luid;
    }

    let mut queue: *mut c_void = ptr::null_mut();
    if get_device(sc, &IID_ID3D12CommandQueue, &mut queue) >= 0 && !queue.is_null() {
        let mut luid = 0u64;
        let child_get_device: FnGetDevice = std::mem::transmute(vfn(queue, 7)); // ID3D12DeviceChild::GetDevice
        let mut d12: *mut c_void = ptr::null_mut();
        if child_get_device(queue, &IID_ID3D12Device, &mut d12) >= 0 && !d12.is_null() {
            let get_luid: FnGetAdapterLuid = std::mem::transmute(vfn(d12, 43)); // ID3D12Device::GetAdapterLuid
            let mut l = LUID { low: 0, high: 0 };
            get_luid(d12, &mut l);
            luid = pack_luid(l);
            com_release(d12);
        }
        com_release(queue);
        return luid;
    }
    0
}

#[inline]
fn eligible(slot_luid: u64, filter: u64) -> bool {
    filter == 0 || (slot_luid != 0 && slot_luid == filter)
}

/// Returns true when this swap chain / DC is the one that should be paced and measured.
unsafe fn is_main_swapchain(sc: usize, kind: u8, now_ms: f64, filter: u64) -> bool {
    let mut slot = SC_SLOTS;
    for i in 0..SC_SLOTS {
        if SC_PTRS[i] == sc {
            slot = i;
            break;
        }
    }
    if slot == SC_SLOTS {
        for i in 0..SC_SLOTS {
            if SC_PTRS[i] == 0 {
                SC_PTRS[i] = sc;
                SC_COUNTS[i] = 0;
                // Looked up once per swap chain, on the presenting thread.
                SC_LUIDS[i] = if kind == KIND_DXGI { query_swapchain_luid(sc as *mut c_void) } else { 0 };
                slot = i;
                break;
            }
        }
    }
    let ok = slot < SC_SLOTS && eligible(SC_LUIDS[slot], filter);
    if ok {
        SC_COUNTS[slot] = SC_COUNTS[slot].saturating_add(1);
    }
    if ok && (MAIN_SC == 0 || !main_is_eligible(filter)) {
        MAIN_SC = sc;
        SC_WINDOW_START_MS = now_ms;
        LAST_PRESENT_QPC = 0;
    }

    // Re-elect the busiest eligible swap chain every 2 seconds.
    if now_ms - SC_WINDOW_START_MS > 2000.0 {
        let mut best = 0usize;
        let mut best_count = 0u32;
        for i in 0..SC_SLOTS {
            if SC_PTRS[i] != 0 && SC_COUNTS[i] > best_count && eligible(SC_LUIDS[i], filter) {
                best_count = SC_COUNTS[i];
                best = SC_PTRS[i];
            }
            if SC_PTRS[i] != 0 && SC_COUNTS[i] == 0 && SC_PTRS[i] != sc {
                SC_PTRS[i] = 0; // inactive, free the slot
                SC_LUIDS[i] = 0;
            }
            SC_COUNTS[i] = 0;
        }
        if best != 0 && best != MAIN_SC {
            MAIN_SC = best;
            LAST_PRESENT_QPC = 0;
        }
        SC_WINDOW_START_MS = now_ms;
    }

    ok && sc == MAIN_SC
}

unsafe fn main_is_eligible(filter: u64) -> bool {
    for i in 0..SC_SLOTS {
        if SC_PTRS[i] == MAIN_SC && MAIN_SC != 0 {
            return eligible(SC_LUIDS[i], filter);
        }
    }
    false
}

// Shared pacing + measurement for Present, Present1 and SwapBuffers.
unsafe fn perform_pacing(sc: usize, kind: u8) {
    if BUSY.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed).is_err() {
        return; // another thread is already measuring; never block the game
    }

    let directive = current_directive();
    let now = get_qpc_ms();
    if !is_main_swapchain(sc, kind, now, directive.adapter_luid) {
        BUSY.store(false, Ordering::Release);
        return;
    }
    let target_fps = directive.target_fps;

    let last_ms = if LAST_PRESENT_QPC > 0 && QPC_FREQ > 0 {
        (LAST_PRESENT_QPC as f64 / QPC_FREQ as f64) * 1000.0
    } else {
        0.0
    };

    // Frame limiter: hold the present until the target frame time has elapsed.
    if target_fps > 0 && last_ms > 0.0 {
        let target_ms = 1000.0 / target_fps as f64;
        if now - last_ms < target_ms {
            precision_wait(target_ms, last_ms);
        }
    }

    let mut qpc_now = 0i64;
    QueryPerformanceCounter(&mut qpc_now);
    let after_ms = if QPC_FREQ > 0 { (qpc_now as f64 / QPC_FREQ as f64) * 1000.0 } else { 0.0 };

    // The very first present after (re)start has no predecessor: record nothing instead of
    // inventing a frame time. Gaps >= 2s (loading screen, alt-tab) are not frames either.
    let mut measured = false;
    let mut ft = 0.0f32;
    if last_ms > 0.0 {
        let diff = after_ms - last_ms;
        if diff > 0.05 && diff < 2000.0 {
            ft = diff as f32;
            measured = true;
        }
    }
    LAST_PRESENT_QPC = qpc_now;

    if measured {
        // Stutter = frame slower than 2x the rolling median (needs a warm-up of 30 frames).
        if HIST_LEN >= 30 && MEDIAN_MS > 0.0 && ft > MEDIAN_MS * 2.0 && ft > 20.0 {
            STUTTERS = STUTTERS.wrapping_add(1);
        }
        push_sample(ft);
        FRAME_COUNT.fetch_add(1, Ordering::Relaxed);

        // Heavy statistics + publishing at ~20 Hz are plenty for a UI.
        if after_ms - LAST_PUBLISH_MS >= 50.0 {
            CUR_STATS = compute_stats();
            publish(target_fps, ft, qpc_now);
            LAST_PUBLISH_MS = after_ms;
        }
    }

    BUSY.store(false, Ordering::Release);
}

/// Enters a hooked present. Returns (owns_guard, nested).
#[inline]
unsafe fn enter_present() -> (bool, bool) {
    let tid = GetCurrentThreadId();
    match IN_PRESENT_TID.compare_exchange(0, tid, Ordering::AcqRel, Ordering::Acquire) {
        Ok(_) => (true, false),
        Err(v) => (false, v == tid),
    }
}

#[inline]
fn leave_present(owned: bool) {
    if owned {
        IN_PRESENT_TID.store(0, Ordering::Release);
    }
}

// Hooked IDXGISwapChain::Present (vtable index 8)
unsafe extern "system" fn hooked_present(p_swap_chain: *mut c_void, sync_interval: u32, flags: u32) -> HRESULT {
    let (owned, nested) = enter_present();
    if !nested {
        perform_pacing(p_swap_chain as usize, KIND_DXGI);
    }
    let r = if let Some(orig) = ORIGINAL_PRESENT { orig(p_swap_chain, sync_interval, flags) } else { 0 };
    leave_present(owned);
    r
}

// Hooked IDXGISwapChain1::Present1 (vtable index 22)
unsafe extern "system" fn hooked_present1(
    p_swap_chain: *mut c_void,
    sync_interval: u32,
    present_flags: u32,
    p_present_parameters: *const c_void,
) -> HRESULT {
    let (owned, nested) = enter_present();
    if !nested {
        perform_pacing(p_swap_chain as usize, KIND_DXGI);
    }
    let r = if let Some(orig) = ORIGINAL_PRESENT1 {
        orig(p_swap_chain, sync_interval, present_flags, p_present_parameters)
    } else {
        0
    };
    leave_present(owned);
    r
}

// ---------------------------------------------------------------------------------------------
// OpenGL: SwapBuffers / wglSwapBuffers through import-table (IAT) slots.
//
// Every loaded module's IAT entry that points at one of the known entry points below is swapped
// for a hook that paces and then calls exactly that entry point (so inline hooks other tools put
// on the export itself, e.g. overlays, still run). On Windows 10/11 gdi32!SwapBuffers is a thunk
// that jumps through gdi32's own IAT to gdi32full!SwapBuffers, so patching that slot also catches
// callers that resolved gdi32!SwapBuffers with GetProcAddress. Not covered: a wglSwapBuffers
// pointer obtained with GetProcAddress before the hook was installed, and wglSwapLayerBuffers.
// ---------------------------------------------------------------------------------------------
const GL_GDI: usize = 0; // gdi32!SwapBuffers
const GL_GDIFULL: usize = 1; // gdi32full!SwapBuffers (Windows 10+)
const GL_WGL: usize = 2; // opengl32!wglSwapBuffers
static mut GL_TARGETS: [usize; 3] = [0; 3];

const MAX_IAT: usize = 64;
static mut IAT_SLOT: [usize; MAX_IAT] = [0; MAX_IAT];
static mut IAT_ORIG: [usize; MAX_IAT] = [0; MAX_IAT];
static mut IAT_HOOK: [usize; MAX_IAT] = [0; MAX_IAT];
static mut IAT_COUNT: usize = 0;
static mut SELF_BASE: usize = 0;

#[inline]
unsafe fn gl_present(which: usize, hdc: *mut c_void) -> BOOL {
    let (owned, nested) = enter_present();
    if !nested && !hdc.is_null() {
        perform_pacing(hdc as usize, KIND_GL);
    }
    let target = GL_TARGETS[which];
    let r = if target != 0 {
        let f: FnSwapBuffers = std::mem::transmute(target);
        f(hdc)
    } else {
        0
    };
    leave_present(owned);
    r
}

unsafe extern "system" fn hooked_gdi_swap(hdc: *mut c_void) -> BOOL {
    gl_present(GL_GDI, hdc)
}
unsafe extern "system" fn hooked_gdifull_swap(hdc: *mut c_void) -> BOOL {
    gl_present(GL_GDIFULL, hdc)
}
unsafe extern "system" fn hooked_wgl_swap(hdc: *mut c_void) -> BOOL {
    gl_present(GL_WGL, hdc)
}

unsafe fn resolve_gl_targets() {
    let gdi = GetModuleHandleA(b"gdi32.dll\0".as_ptr() as *const i8);
    if !gdi.is_null() {
        GL_TARGETS[GL_GDI] = GetProcAddress(gdi, b"SwapBuffers\0".as_ptr() as *const i8) as usize;
    }
    let full = GetModuleHandleA(b"gdi32full.dll\0".as_ptr() as *const i8);
    if !full.is_null() {
        GL_TARGETS[GL_GDIFULL] = GetProcAddress(full, b"SwapBuffers\0".as_ptr() as *const i8) as usize;
    }
    // Never load opengl32 into a game that does not use it.
    let gl = GetModuleHandleA(b"opengl32.dll\0".as_ptr() as *const i8);
    if !gl.is_null() {
        GL_TARGETS[GL_WGL] = GetProcAddress(gl, b"wglSwapBuffers\0".as_ptr() as *const i8) as usize;
    }
}

unsafe fn already_patched(slot: usize) -> bool {
    for i in 0..IAT_COUNT {
        if IAT_SLOT[i] == slot {
            return true;
        }
    }
    false
}

/// Walks one module's import address table and swaps matching entries. Bounded loops; only reads
/// inside the module's own image.
unsafe fn patch_module_iat(base: usize) {
    if *(base as *const u16) != 0x5A4D {
        return; // MZ
    }
    let e_lfanew = *((base + 0x3c) as *const i32);
    if !(0..0x1000).contains(&e_lfanew) {
        return;
    }
    let nt = base + e_lfanew as usize;
    if *(nt as *const u32) != 0x0000_4550 {
        return; // PE\0\0
    }
    let opt = nt + 24;
    let magic = *(opt as *const u16);
    // Only modules of this process' own bitness.
    let (dirs, count_off) = if cfg!(target_pointer_width = "64") && magic == 0x20b {
        (opt + 112, opt + 108)
    } else if cfg!(target_pointer_width = "32") && magic == 0x10b {
        (opt + 96, opt + 92)
    } else {
        return;
    };
    let size_of_image = *((opt + 56) as *const u32) as usize;
    if *(count_off as *const u32) < 2 {
        return;
    }
    let imp_rva = *((dirs + 8) as *const u32) as usize;
    if imp_rva == 0 || imp_rva >= size_of_image {
        return;
    }
    let mut desc = base + imp_rva;
    for _ in 0..4096 {
        if desc + 20 > base + size_of_image {
            return;
        }
        let original_first_thunk = *(desc as *const u32);
        let name_rva = *((desc + 12) as *const u32);
        let first_thunk = *((desc + 16) as *const u32) as usize;
        if original_first_thunk == 0 && name_rva == 0 && first_thunk == 0 {
            return;
        }
        if first_thunk != 0 && first_thunk < size_of_image {
            patch_thunks(base, first_thunk, size_of_image);
        }
        desc += 20;
    }
}

/// Delay-load imports (data directory 13). On Windows 10/11 gdi32!SwapBuffers jumps through a
/// delay-load slot of gdi32 itself; it only holds gdi32full!SwapBuffers after the first call, so
/// the periodic rescans pick it up once the game has presented once.
unsafe fn patch_module_delay_iat(base: usize) {
    if *(base as *const u16) != 0x5A4D {
        return;
    }
    let e_lfanew = *((base + 0x3c) as *const i32);
    if !(0..0x1000).contains(&e_lfanew) || *((base + e_lfanew as usize) as *const u32) != 0x0000_4550 {
        return;
    }
    let opt = base + e_lfanew as usize + 24;
    let magic = *(opt as *const u16);
    let (dirs, count_off) = if cfg!(target_pointer_width = "64") && magic == 0x20b {
        (opt + 112, opt + 108)
    } else if cfg!(target_pointer_width = "32") && magic == 0x10b {
        (opt + 96, opt + 92)
    } else {
        return;
    };
    if *(count_off as *const u32) < 14 {
        return;
    }
    let size_of_image = *((opt + 56) as *const u32) as usize;
    let rva = *((dirs + 13 * 8) as *const u32) as usize;
    if rva == 0 || rva >= size_of_image {
        return;
    }
    let mut desc = base + rva;
    for _ in 0..1024 {
        if desc + 32 > base + size_of_image {
            return;
        }
        let attrs = *(desc as *const u32);
        let name_rva = *((desc + 4) as *const u32);
        let iat_rva = *((desc + 12) as *const u32) as usize;
        if name_rva == 0 && iat_rva == 0 {
            return;
        }
        // Only the modern RVA-based descriptor (attribute bit 0); old VA-based ones are skipped.
        if attrs & 1 == 1 && iat_rva != 0 && iat_rva < size_of_image {
            patch_thunks(base, iat_rva, size_of_image);
        }
        desc += 32;
    }
}

/// Swaps every pointer in one thunk array that equals a known SwapBuffers entry point.
unsafe fn patch_thunks(base: usize, first_thunk: usize, size_of_image: usize) {
    let word = std::mem::size_of::<usize>();
    let mut slot = base + first_thunk;
    for _ in 0..16384 {
        if slot + word > base + size_of_image {
            break;
        }
        let v = *(slot as *const usize);
        if v == 0 {
            break;
        }
        let hook = if v == GL_TARGETS[GL_GDI] {
            hooked_gdi_swap as *const () as usize
        } else if v == GL_TARGETS[GL_GDIFULL] {
            hooked_gdifull_swap as *const () as usize
        } else if v == GL_TARGETS[GL_WGL] {
            hooked_wgl_swap as *const () as usize
        } else {
            0
        };
        if hook != 0 && IAT_COUNT < MAX_IAT && !already_patched(slot) && patch_slot(slot, hook) {
            IAT_SLOT[IAT_COUNT] = slot;
            IAT_ORIG[IAT_COUNT] = v;
            IAT_HOOK[IAT_COUNT] = hook;
            IAT_COUNT += 1;
        }
        slot += word;
    }
}

/// Installs / refreshes the OpenGL import hooks in every loaded module (modules loaded later are
/// picked up by the periodic rescans in init_thread).
unsafe fn install_gl_hooks() {
    resolve_gl_targets();
    if GL_TARGETS.iter().all(|&t| t == 0) {
        return;
    }
    let mut mods: [HMODULE; 1024] = [ptr::null_mut(); 1024];
    let mut needed: DWORD = 0;
    let cb = (mods.len() * std::mem::size_of::<HMODULE>()) as DWORD;
    if K32EnumProcessModules(GetCurrentProcess(), mods.as_mut_ptr(), cb, &mut needed) == 0 {
        return;
    }
    let n = (needed as usize / std::mem::size_of::<HMODULE>()).min(mods.len());
    for i in 0..n {
        let base = mods[i] as usize;
        if base == 0 || base == SELF_BASE {
            continue;
        }
        // Pin the module while its headers are read so a concurrent FreeLibrary cannot unmap it.
        let mut pinned: HMODULE = ptr::null_mut();
        if GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, base as *const u16, &mut pinned) == 0 || pinned as usize != base {
            continue;
        }
        patch_module_iat(base);
        patch_module_delay_iat(base);
        FreeLibrary(pinned);
    }
}

unsafe fn remove_gl_hooks() {
    for i in 0..IAT_COUNT {
        let slot = IAT_SLOT[i];
        // Restore only while the owning module is still mapped and the slot still holds our hook.
        let mut owner: HMODULE = ptr::null_mut();
        if GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, slot as *const u16, &mut owner) == 0 {
            continue;
        }
        if *(slot as *const usize) == IAT_HOOK[i] {
            patch_slot(slot, IAT_ORIG[i]);
        }
    }
    IAT_COUNT = 0;
}

unsafe fn map_named(names: &[&str], size: usize) -> *mut c_void {
    for name in names {
        let name_u16: Vec<u16> = name.encode_utf16().collect();
        // INVALID_HANDLE_VALUE = section backed by the paging file (NULL would fail with ERROR_INVALID_HANDLE).
        let h = CreateFileMappingW(usize::MAX as HANDLE, ptr::null_mut(), 0x04, 0, size as u32, name_u16.as_ptr());
        if !h.is_null() {
            let p = MapViewOfFile(h, 0x0006, 0, 0, size);
            if !p.is_null() {
                // Keep the handle for the life of the process: a named section loses its NAME when
                // its last handle closes (a mapped view does not keep the name), and the
                // controller finds the block by name. One handle per block, opened once.
                return p;
            }
            CloseHandle(h);
        }
    }
    ptr::null_mut()
}

unsafe fn setup_shared_memory() {
    let mut freq = 0i64;
    QueryPerformanceFrequency(&mut freq);
    QPC_FREQ = freq;

    let cfg = map_named(
        &["DarkHub_Pacer_Config2\0", "Local\\DarkHub_Pacer_Config2\0", "Global\\DarkHub_Pacer_Config2\0"],
        std::mem::size_of::<PacerConfigV2>(),
    ) as *mut PacerConfigV2;
    if !cfg.is_null() {
        // Never touch a block the controller already filled; a fresh section is all zeroes, which
        // evaluates to "no controller" (pass-through) until the controller writes it.
        CONFIG_PTR = cfg;
    }

    let tel = map_named(
        &["DarkHub_Pacer_Telemetry2\0", "Local\\DarkHub_Pacer_Telemetry2\0", "Global\\DarkHub_Pacer_Telemetry2\0"],
        std::mem::size_of::<PacerTelemetryV2>(),
    ) as *mut PacerTelemetryV2;
    if !tel.is_null() {
        TELEMETRY_PTR = tel;
        (*tel).magic = TEL_MAGIC;
        (*tel).game_pid = GetCurrentProcessId();
        (*tel).qpc_freq = freq;
    }
}

unsafe fn patch_slot(slot: usize, new_value: usize) -> bool {
    let mut old_protect = 0u32;
    // PAGE_READWRITE. Never write when the protection change failed: the vtable / IAT lives in a
    // read-only section and the write would crash the game.
    if VirtualProtect(slot as LPVOID, std::mem::size_of::<usize>(), 0x04, &mut old_protect) == 0 {
        return false;
    }
    // Pointer-sized aligned store: other threads see either the old or the new entry.
    (*(slot as *const std::sync::atomic::AtomicUsize)).store(new_value, Ordering::SeqCst);
    VirtualProtect(slot as LPVOID, std::mem::size_of::<usize>(), old_protect, &mut old_protect);
    true
}

// Hook IDXGISwapChain::Present (index 8) and Present1 (index 22) through a throw-away swap chain.
// All swap chains created by the same dxgi.dll implementation share this vtable.
unsafe fn install_vtable_hooks() -> bool {
    if HOOK_INSTALLED.load(Ordering::Relaxed) {
        return true;
    }

    let d3d11 = LoadLibraryA(b"d3d11.dll\0".as_ptr() as *const i8);
    if d3d11.is_null() {
        return false;
    }
    let create_fn_ptr = GetProcAddress(d3d11, b"D3D11CreateDeviceAndSwapChain\0".as_ptr() as *const i8);
    if create_fn_ptr.is_null() {
        return false;
    }
    let create_fn: FnD3D11CreateDeviceAndSwapChain = std::mem::transmute(create_fn_ptr);

    let hwnd = CreateWindowExA(0, b"STATIC\0".as_ptr() as *const i8, b"DH_Dummy\0".as_ptr() as *const i8, 0, 0, 0, 10, 10, ptr::null_mut(), ptr::null_mut(), ptr::null_mut(), ptr::null_mut());
    if hwnd.is_null() {
        return false;
    }

    let mut sc_desc: DXGI_SWAP_CHAIN_DESC = std::mem::zeroed();
    sc_desc.buffer_count = 1;
    sc_desc.buffer_desc.format = 28; // DXGI_FORMAT_R8G8B8A8_UNORM
    sc_desc.buffer_desc.width = 10;
    sc_desc.buffer_desc.height = 10;
    sc_desc.buffer_usage = 0x20;
    sc_desc.output_window = hwnd;
    sc_desc.sample_desc.count = 1;
    sc_desc.windowed = 1;

    let mut p_swap_chain: *mut *mut usize = ptr::null_mut();
    let mut p_device: *mut c_void = ptr::null_mut();
    let mut p_context: *mut c_void = ptr::null_mut();
    let mut feature_level: u32 = 0;
    let feature_levels = [0xb000u32, 0xa000u32];

    let hr = create_fn(
        ptr::null_mut(),
        1, // D3D_DRIVER_TYPE_HARDWARE
        ptr::null_mut(),
        0,
        feature_levels.as_ptr(),
        2,
        7, // D3D11_SDK_VERSION
        &sc_desc,
        &mut p_swap_chain,
        &mut p_device,
        &mut feature_level,
        &mut p_context,
    );

    if hr >= 0 && !p_swap_chain.is_null() {
        let vtable = *p_swap_chain;

        // Present (index 8)
        let present_slot = vtable.add(8) as usize;
        PRESENT_SLOT = present_slot;
        PRESENT_ORIG_ADDR = *(present_slot as *const usize);
        ORIGINAL_PRESENT = Some(std::mem::transmute(PRESENT_ORIG_ADDR));
        if patch_slot(present_slot, hooked_present as *const () as usize) {
            // Present1 (index 22), only when the implementation exposes it
            let present1_slot = vtable.add(22) as usize;
            let orig1 = *(present1_slot as *const usize);
            if orig1 != 0 {
                PRESENT1_ORIG_ADDR = orig1;
                ORIGINAL_PRESENT1 = Some(std::mem::transmute(orig1));
                if patch_slot(present1_slot, hooked_present1 as *const () as usize) {
                    PRESENT1_SLOT = present1_slot;
                }
            }

            HOOK_INSTALLED.store(true, Ordering::Relaxed);
        } else {
            PRESENT_SLOT = 0;
        }
    }

    // The dummy device / context / swap chain were only needed to find the vtable (which lives in
    // dxgi.dll and stays valid). Release them so no D3D device + GPU memory leaks into the game.
    com_release(p_context);
    com_release(p_swap_chain as *mut c_void);
    com_release(p_device);

    DestroyWindow(hwnd);
    HOOK_INSTALLED.load(Ordering::Relaxed)
}

/// Restores the original vtable entries (DLL unloaded through FreeLibrary).
unsafe fn remove_vtable_hooks() {
    if !HOOK_INSTALLED.swap(false, Ordering::Relaxed) {
        return;
    }
    if PRESENT_SLOT != 0 && PRESENT_ORIG_ADDR != 0 {
        patch_slot(PRESENT_SLOT, PRESENT_ORIG_ADDR);
    }
    if PRESENT1_SLOT != 0 && PRESENT1_ORIG_ADDR != 0 {
        patch_slot(PRESENT1_SLOT, PRESENT1_ORIG_ADDR);
    }
}

static UNLOADING: AtomicBool = AtomicBool::new(false);

extern "system" fn init_thread(_param: *mut c_void) -> u32 {
    unsafe {
        // 1 ms kernel timer resolution for the limiter's coarse sleep (fallback path).
        if timeBeginPeriod(1) == 0 {
            TIMER_PERIOD_SET.store(true, Ordering::Release);
        }
        WAIT_TIMER = CreateWaitableTimerExW(ptr::null_mut(), ptr::null(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS);
        let mut me: HMODULE = ptr::null_mut();
        if GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, init_thread as *const () as *const u16, &mut me) != 0 {
            SELF_BASE = me as usize;
        }
        setup_shared_memory();
        // Give the game time to create its graphics device before hooking.
        Sleep(500);
        install_vtable_hooks();
        install_gl_hooks();
        // OpenGL is often loaded after the first frames (or by a module loaded later): rescan the
        // import tables a few times during the first 30 s.
        for _ in 0..15 {
            Sleep(2000);
            if UNLOADING.load(Ordering::Acquire) {
                break;
            }
            install_gl_hooks();
        }
    }
    0
}

#[no_mangle]
pub extern "system" fn DllMain(
    _hinst: *const c_void,
    reason: u32,
    reserved: *const c_void,
) -> BOOL {
    match reason {
        1 => { // DLL_PROCESS_ATTACH
            unsafe {
                let h = CreateThread(ptr::null_mut(), 0, init_thread, ptr::null_mut(), 0, ptr::null_mut());
                if !h.is_null() {
                    CloseHandle(h); // the thread keeps running; we never wait on it
                }
            }
        }
        0 => { // DLL_PROCESS_DETACH
            unsafe {
                UNLOADING.store(true, Ordering::Release);
                // `reserved` is non-null when the process is terminating: nothing to restore then.
                if reserved.is_null() {
                    remove_vtable_hooks();
                    remove_gl_hooks();
                    // Hooks are gone, but a present may still be inside perform_pacing on another
                    // thread; only free the timer when nobody holds BUSY.
                    if !WAIT_TIMER.is_null() && BUSY.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed).is_ok() {
                        CloseHandle(WAIT_TIMER);
                        WAIT_TIMER = ptr::null_mut();
                        BUSY.store(false, Ordering::Release);
                    }
                }
                // Only undo a period this DLL actually requested (init_thread may never have run).
                if TIMER_PERIOD_SET.swap(false, Ordering::AcqRel) {
                    timeEndPeriod(1);
                }
            }
        }
        _ => {}
    }
    1
}

#[cfg(test)]
mod tests {
    use super::*;

    unsafe fn reset() {
        HIST_HEAD = 0;
        HIST_LEN = 0;
    }

    #[test]
    fn stats_come_only_from_real_samples() {
        unsafe {
            reset();
            assert_eq!(compute_stats().samples, 0, "no samples must mean no stats");

            // 1000 frames of 10 ms plus 10 frames of 50 ms.
            for _ in 0..1000 { push_sample(10.0); }
            for _ in 0..10 { push_sample(50.0); }
            let s = compute_stats();
            assert_eq!(s.samples, 1010);
            // 1% low = mean of worst 10 frames = 50 ms -> 20 fps
            assert!((s.low1_fps - 20.0).abs() < 0.01, "low1 was {}", s.low1_fps);
            // 0.1% low = worst 1 frame = 50 ms -> 20 fps (only valid with >= 1000 samples)
            assert!((s.low01_fps - 20.0).abs() < 0.01, "low01 was {}", s.low01_fps);
            assert!(MEDIAN_MS > 9.9 && MEDIAN_MS < 10.1);
        }
    }

    #[test]
    fn low01_unavailable_with_few_samples() {
        unsafe {
            reset();
            for _ in 0..200 { push_sample(16.0); }
            let s = compute_stats();
            assert_eq!(s.low01_fps, 0.0);
            assert!((s.avg_fps - 62.5).abs() < 0.5, "avg was {}", s.avg_fps);
            assert!(s.jitter_ms < 0.001);
        }
    }

    #[test]
    fn telemetry_layout_matches_reader() {
        assert_eq!(std::mem::size_of::<PacerTelemetryV2>(), 80 + TEL_RING * 4);
        assert_eq!(std::mem::align_of::<PacerTelemetryV2>(), 8);
    }

    /// Same table as `PacerConfigV2` in electron/services/DarkHub.FrameLimiter.cs (and the
    /// compile-time asserts, which also run for the i686 build).
    #[test]
    fn config_layout_is_fixed() {
        use std::mem::offset_of;
        assert_eq!(std::mem::size_of::<PacerConfigV2>(), CFG_SIZE as usize);
        let table = [
            (offset_of!(PacerConfigV2, magic), 0),
            (offset_of!(PacerConfigV2, version), 4),
            (offset_of!(PacerConfigV2, size), 8),
            (offset_of!(PacerConfigV2, enabled), 12),
            (offset_of!(PacerConfigV2, target_fps), 16),
            (offset_of!(PacerConfigV2, pacing_mode), 20),
            (offset_of!(PacerConfigV2, heartbeat_qpc), 24),
            (offset_of!(PacerConfigV2, adapter_luid), 32),
            (offset_of!(PacerConfigV2, controller_pid), 40),
            (offset_of!(PacerConfigV2, flags), 44),
            (offset_of!(PacerConfigV2, reserved), 48),
        ];
        for (got, want) in table {
            assert_eq!(got, want);
        }
    }

    fn cfg(enabled: u32, fps: u32, mode: u32, hb: i64, luid: u64) -> PacerConfigV2 {
        PacerConfigV2 {
            magic: CFG_MAGIC,
            version: CFG_VERSION,
            size: CFG_SIZE,
            enabled,
            target_fps: fps,
            pacing_mode: mode,
            heartbeat_qpc: hb,
            adapter_luid: luid,
            controller_pid: 1,
            flags: 0,
            reserved: [0; 2],
        }
    }

    const F: i64 = 10_000_000; // 10 MHz QPC

    #[test]
    fn fresh_heartbeat_applies_the_cap() {
        let now = 100 * F;
        assert_eq!(evaluate_config(&cfg(1, 60, 0, now - F / 10, 0), now, F).target_fps, 60);
        assert_eq!(evaluate_config(&cfg(1, 60, 0, now - F, 0), now, F).target_fps, 60); // 1 s old
    }

    #[test]
    fn stale_or_missing_heartbeat_passes_through() {
        let now = 100 * F;
        assert_eq!(evaluate_config(&cfg(1, 60, 0, now - 3 * F, 0), now, F).target_fps, 0); // 3 s old
        assert_eq!(evaluate_config(&cfg(1, 60, 0, 0, 0), now, F).target_fps, 0); // never beat / reset
        assert_eq!(evaluate_config(&cfg(1, 60, 0, now + 2 * F, 0), now, F).target_fps, 0); // future
    }

    #[test]
    fn disabled_uncapped_or_foreign_blocks_pass_through() {
        let now = 100 * F;
        assert_eq!(evaluate_config(&cfg(0, 60, 0, now, 0), now, F).target_fps, 0);
        assert_eq!(evaluate_config(&cfg(1, 60, 2, now, 0), now, F).target_fps, 0);
        let mut bad = cfg(1, 60, 0, now, 0);
        bad.version = 1;
        assert_eq!(evaluate_config(&bad, now, F).target_fps, 0);
        let mut bad = cfg(1, 60, 0, now, 0);
        bad.size = 16;
        assert_eq!(evaluate_config(&bad, now, F).target_fps, 0);
        let mut bad = cfg(1, 60, 0, now, 0);
        bad.magic = 0;
        assert_eq!(evaluate_config(&bad, now, F).target_fps, 0);
        assert_eq!(evaluate_config(&cfg(1, 5000, 0, now, 0), now, F).target_fps, MAX_TARGET_FPS);
    }

    #[test]
    fn adapter_filter() {
        assert!(eligible(0, 0));
        assert!(eligible(0x1234, 0));
        assert!(eligible(0x1234, 0x1234));
        assert!(!eligible(0x9999, 0x1234));
        assert!(!eligible(0, 0x1234), "an unattributed chain is never paced when an adapter is selected");
        assert_eq!(pack_luid(LUID { low: 0x89ab_cdef, high: 0x0123_4567 }), 0x0123_4567_89ab_cdef);
        assert_eq!(pack_luid(LUID { low: 1, high: -1 }), 0xffff_ffff_0000_0001);
    }
}

// Linux-only link stubs so the pure statistics code can be unit-tested off Windows.
#[cfg(all(test, not(windows)))]
mod win_stubs {
    use super::*;
    #[no_mangle] pub extern "system" fn CreateWindowExA(_: DWORD, _: *const i8, _: *const i8, _: DWORD, _: i32, _: i32, _: i32, _: i32, _: HWND, _: *mut c_void, _: *mut c_void, _: *mut c_void) -> HWND { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn DestroyWindow(_: HWND) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn timeBeginPeriod(_: u32) -> u32 { 0 }
    #[no_mangle] pub extern "system" fn timeEndPeriod(_: u32) -> u32 { 0 }
    #[no_mangle] pub extern "system" fn QueryPerformanceCounter(_: *mut i64) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn QueryPerformanceFrequency(_: *mut i64) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn VirtualProtect(_: LPVOID, _: SIZE_T, _: DWORD, _: *mut DWORD) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn CreateFileMappingW(_: HANDLE, _: *mut c_void, _: DWORD, _: DWORD, _: DWORD, _: *const u16) -> HANDLE { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn OpenFileMappingW(_: DWORD, _: BOOL, _: *const u16) -> HANDLE { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn MapViewOfFile(_: HANDLE, _: DWORD, _: DWORD, _: DWORD, _: SIZE_T) -> LPVOID { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn CloseHandle(_: HANDLE) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn GetCurrentProcessId() -> DWORD { 1 }
    #[no_mangle] pub extern "system" fn GetCurrentThreadId() -> DWORD { 1 }
    #[no_mangle] pub extern "system" fn GetCurrentProcess() -> HANDLE { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn Sleep(_: DWORD) {}
    #[no_mangle] pub extern "system" fn LoadLibraryA(_: *const i8) -> *mut c_void { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn GetModuleHandleA(_: *const i8) -> HMODULE { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn GetModuleHandleExW(_: DWORD, _: *const u16, _: *mut HMODULE) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn FreeLibrary(_: HMODULE) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn K32EnumProcessModules(_: HANDLE, _: *mut HMODULE, _: DWORD, _: *mut DWORD) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn GetProcAddress(_: *mut c_void, _: *const i8) -> *mut c_void { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn CreateThread(_: *mut c_void, _: SIZE_T, _: extern "system" fn(*mut c_void) -> u32, _: *mut c_void, _: DWORD, _: *mut DWORD) -> HANDLE { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn CreateWaitableTimerExW(_: *mut c_void, _: *const u16, _: DWORD, _: DWORD) -> HANDLE { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn SetWaitableTimer(_: HANDLE, _: *const i64, _: i32, _: *mut c_void, _: *mut c_void, _: BOOL) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn WaitForSingleObject(_: HANDLE, _: DWORD) -> DWORD { 0 }
}
