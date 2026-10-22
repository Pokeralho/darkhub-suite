// native_pacer/src/lib.rs - v5 (DXGI Present / Present1 hook: frame limiter + measured telemetry)
// All published metrics come from real Present() timings. See PacerTelemetryV2 for the layout.

#![allow(non_snake_case)]
#![allow(non_camel_case_types)]
#![allow(dead_code)]
#![allow(static_mut_refs)]

use std::ffi::c_void;
use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

type HRESULT = i32;
type HWND = *mut c_void;
type BOOL = i32;
type DWORD = u32;
type HANDLE = *mut c_void;
type LPVOID = *mut c_void;
type SIZE_T = usize;

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
pub struct PacerConfig {
    pub magic: u32,        // 0x4441524B 'DARK'
    pub target_fps: u32,
    pub pacing_mode: u32,
    pub enabled: u32,
}

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
    fn Sleep(dwMilliseconds: DWORD);
    fn LoadLibraryA(lpLibFileName: *const i8) -> *mut c_void;
    fn GetProcAddress(hModule: *mut c_void, lpProcName: *const i8) -> *mut c_void;
    fn CreateThread(lpThreadAttributes: *mut c_void, dwStackSize: SIZE_T, lpStartAddress: extern "system" fn(*mut c_void) -> u32, lpParameter: *mut c_void, dwCreationFlags: DWORD, lpThreadId: *mut DWORD) -> HANDLE;
    fn CreateWaitableTimerExW(lpTimerAttributes: *mut c_void, lpTimerName: *const u16, dwFlags: DWORD, dwDesiredAccess: DWORD) -> HANDLE;
    fn SetWaitableTimer(hTimer: HANDLE, lpDueTime: *const i64, lPeriod: i32, pfnCompletionRoutine: *mut c_void, lpArgToCompletionRoutine: *mut c_void, fResume: BOOL) -> BOOL;
    fn WaitForSingleObject(hHandle: HANDLE, dwMilliseconds: DWORD) -> DWORD;
}

const CREATE_WAITABLE_TIMER_HIGH_RESOLUTION: DWORD = 0x0000_0002;
const TIMER_ALL_ACCESS: DWORD = 0x001F_0003;

type FnPresent = unsafe extern "system" fn(p_swap_chain: *mut c_void, sync_interval: u32, flags: u32) -> HRESULT;
type FnPresent1 = unsafe extern "system" fn(p_swap_chain: *mut c_void, sync_interval: u32, present_flags: u32, p_present_parameters: *const c_void) -> HRESULT;

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
// Every number published here is measured from real Present() calls. Nothing is estimated or
// back-filled: until enough frames exist, the corresponding field is published as 0 and the
// reader must treat 0 as "not available".
//
// Consistency: single writer / many readers "seqlock". `seq` is odd while the writer is updating.
// A reader copies the block, and accepts it only if `seq` was even and unchanged afterwards.
// ---------------------------------------------------------------------------------------------
pub const TEL_MAGIC: u32 = 0x324D_4C54; // 'TLM2'
pub const TEL_RING: usize = 240;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct PacerTelemetryV2 {
    pub magic: u32,                // 0
    pub seq: u32,                  // 4
    pub frame_count: u64,          // 8
    pub last_present_qpc: i64,     // 16  raw QueryPerformanceCounter value of the last measured Present
    pub qpc_freq: i64,             // 24
    pub game_pid: u32,             // 32
    pub target_fps: u32,           // 36
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

static mut ORIGINAL_PRESENT: Option<FnPresent> = None;
static mut ORIGINAL_PRESENT1: Option<FnPresent1> = None;
static mut PRESENT_SLOT: usize = 0;
static mut PRESENT1_SLOT: usize = 0;
static mut PRESENT_ORIG_ADDR: usize = 0;
static mut PRESENT1_ORIG_ADDR: usize = 0;

static mut QPC_FREQ: i64 = 0;
static mut LAST_PRESENT_QPC: i64 = 0;
static mut TELEMETRY_PTR: *mut PacerTelemetryV2 = ptr::null_mut();
static mut CONFIG_PTR: *mut PacerConfig = ptr::null_mut();

// High-resolution waitable timer used by the limiter. Only touched while BUSY is held, so one
// shared handle is enough. Null => fall back to Sleep() (Windows < 10 1803).
static mut WAIT_TIMER: HANDLE = ptr::null_mut();

static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);
static HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);
static TIMER_PERIOD_SET: AtomicBool = AtomicBool::new(false);
static BUSY: AtomicBool = AtomicBool::new(false);

const HIST_CAP: usize = 2048;
static mut HIST: [f32; HIST_CAP] = [0.0; HIST_CAP];
static mut HIST_HEAD: usize = 0; // next write position
static mut HIST_LEN: usize = 0;
static mut SCRATCH: [f32; HIST_CAP] = [0.0; HIST_CAP];

static mut CUR_STATS: Stats = Stats::ZERO;
static mut MEDIAN_MS: f32 = 0.0;
static mut STUTTERS: u32 = 0;
static mut LAST_PUBLISH_MS: f64 = 0.0;

// Swap chains seen presenting. Only the busiest one (the game's own) is paced and measured, so
// that overlay / capture swap chains do not pollute the numbers.
const SC_SLOTS: usize = 8;
static mut SC_PTRS: [usize; SC_SLOTS] = [0; SC_SLOTS];
static mut SC_COUNTS: [u32; SC_SLOTS] = [0; SC_SLOTS];
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

/// Returns true when this swap chain is the one that should be paced and measured.
unsafe fn is_main_swapchain(sc: usize, now_ms: f64) -> bool {
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
                slot = i;
                break;
            }
        }
    }
    if slot < SC_SLOTS {
        SC_COUNTS[slot] = SC_COUNTS[slot].saturating_add(1);
    }
    if MAIN_SC == 0 {
        MAIN_SC = sc;
        SC_WINDOW_START_MS = now_ms;
    }

    // Re-elect the busiest swap chain every 2 seconds.
    if now_ms - SC_WINDOW_START_MS > 2000.0 {
        let mut best = MAIN_SC;
        let mut best_count = 0u32;
        for i in 0..SC_SLOTS {
            if SC_PTRS[i] != 0 && SC_COUNTS[i] > best_count {
                best_count = SC_COUNTS[i];
                best = SC_PTRS[i];
            }
            if SC_COUNTS[i] == 0 {
                SC_PTRS[i] = 0; // inactive, free the slot
            }
            SC_COUNTS[i] = 0;
        }
        if best != MAIN_SC {
            MAIN_SC = best;
            LAST_PRESENT_QPC = 0;
        }
        SC_WINDOW_START_MS = now_ms;
    }

    sc == MAIN_SC
}

// Shared pacing + measurement for Present and Present1.
unsafe fn perform_pacing(sc: usize) {
    if BUSY.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed).is_err() {
        return; // another thread is already measuring; never block the game
    }

    let now = get_qpc_ms();
    if !is_main_swapchain(sc, now) {
        BUSY.store(false, Ordering::Release);
        return;
    }

    // Config: pacing_mode 2 = uncapped.
    let mut target_fps = 0u32;
    if !CONFIG_PTR.is_null() {
        let cfg = &*CONFIG_PTR;
        if cfg.magic == 0x4441524B && cfg.enabled == 1 && cfg.pacing_mode != 2 {
            target_fps = cfg.target_fps;
        }
    }

    let last_ms = if LAST_PRESENT_QPC > 0 && QPC_FREQ > 0 {
        (LAST_PRESENT_QPC as f64 / QPC_FREQ as f64) * 1000.0
    } else {
        0.0
    };

    // Frame limiter: hold the Present until the target frame time has elapsed.
    if target_fps > 0 && last_ms > 0.0 {
        let target_ms = 1000.0 / target_fps as f64;
        if now - last_ms < target_ms {
            precision_wait(target_ms, last_ms);
        }
    }

    let mut qpc_now = 0i64;
    QueryPerformanceCounter(&mut qpc_now);
    let after_ms = if QPC_FREQ > 0 { (qpc_now as f64 / QPC_FREQ as f64) * 1000.0 } else { 0.0 };

    // The very first Present after (re)start has no predecessor: record nothing instead of
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

// Hooked IDXGISwapChain::Present (vtable index 8)
unsafe extern "system" fn hooked_present(p_swap_chain: *mut c_void, sync_interval: u32, flags: u32) -> HRESULT {
    perform_pacing(p_swap_chain as usize);
    if let Some(orig) = ORIGINAL_PRESENT {
        orig(p_swap_chain, sync_interval, flags)
    } else {
        0
    }
}

// Hooked IDXGISwapChain1::Present1 (vtable index 22)
unsafe extern "system" fn hooked_present1(
    p_swap_chain: *mut c_void,
    sync_interval: u32,
    present_flags: u32,
    p_present_parameters: *const c_void,
) -> HRESULT {
    perform_pacing(p_swap_chain as usize);
    if let Some(orig) = ORIGINAL_PRESENT1 {
        orig(p_swap_chain, sync_interval, present_flags, p_present_parameters)
    } else {
        0
    }
}

unsafe fn map_named(names: &[&str], size: usize) -> *mut c_void {
    for name in names {
        let name_u16: Vec<u16> = name.encode_utf16().collect();
        let h = CreateFileMappingW(ptr::null_mut(), ptr::null_mut(), 0x04, 0, size as u32, name_u16.as_ptr());
        if !h.is_null() {
            let p = MapViewOfFile(h, 0x0006, 0, 0, size);
            // The view holds its own reference to the section (the name stays valid while it is
            // mapped), so the handle is never needed again: close it on success and on failure.
            CloseHandle(h);
            if !p.is_null() {
                return p;
            }
        }
    }
    ptr::null_mut()
}

unsafe fn setup_shared_memory() {
    let mut freq = 0i64;
    QueryPerformanceFrequency(&mut freq);
    QPC_FREQ = freq;

    let cfg = map_named(
        &["DarkHub_Pacer_Config\0", "Local\\DarkHub_Pacer_Config\0", "Global\\DarkHub_Pacer_Config\0"],
        std::mem::size_of::<PacerConfig>(),
    ) as *mut PacerConfig;
    if !cfg.is_null() {
        CONFIG_PTR = cfg;
        (*cfg).magic = 0x4441524B;
        (*cfg).enabled = 1;
        (*cfg).target_fps = 0;
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
    // PAGE_READWRITE. Never write when the protection change failed: the vtable lives in a
    // read-only section and the write would crash the game.
    if VirtualProtect(slot as LPVOID, std::mem::size_of::<usize>(), 0x04, &mut old_protect) == 0 {
        return false;
    }
    *(slot as *mut usize) = new_value;
    VirtualProtect(slot as LPVOID, std::mem::size_of::<usize>(), old_protect, &mut old_protect);
    true
}

/// IUnknown::Release (vtable index 2) for the throw-away COM objects.
unsafe fn com_release(obj: *mut c_void) {
    if obj.is_null() {
        return;
    }
    let vtbl = *(obj as *const *const usize);
    let release: unsafe extern "system" fn(*mut c_void) -> u32 = std::mem::transmute(*vtbl.add(2));
    release(obj);
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

extern "system" fn init_thread(_param: *mut c_void) -> u32 {
    unsafe {
        // 1 ms kernel timer resolution for the limiter's coarse sleep (fallback path).
        if timeBeginPeriod(1) == 0 {
            TIMER_PERIOD_SET.store(true, Ordering::Release);
        }
        WAIT_TIMER = CreateWaitableTimerExW(ptr::null_mut(), ptr::null(), CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS);
        setup_shared_memory();
        // Give the game time to create its graphics device before hooking.
        Sleep(500);
        install_vtable_hooks();
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
                // `reserved` is non-null when the process is terminating: nothing to restore then.
                if reserved.is_null() {
                    remove_vtable_hooks();
                    // Hooks are gone, but a Present may still be inside perform_pacing on another
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
    #[no_mangle] pub extern "system" fn Sleep(_: DWORD) {}
    #[no_mangle] pub extern "system" fn LoadLibraryA(_: *const i8) -> *mut c_void { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn GetProcAddress(_: *mut c_void, _: *const i8) -> *mut c_void { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn CreateThread(_: *mut c_void, _: SIZE_T, _: extern "system" fn(*mut c_void) -> u32, _: *mut c_void, _: DWORD, _: *mut DWORD) -> HANDLE { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn CreateWaitableTimerExW(_: *mut c_void, _: *const u16, _: DWORD, _: DWORD) -> HANDLE { ptr::null_mut() }
    #[no_mangle] pub extern "system" fn SetWaitableTimer(_: HANDLE, _: *const i64, _: i32, _: *mut c_void, _: *mut c_void, _: BOOL) -> BOOL { 0 }
    #[no_mangle] pub extern "system" fn WaitForSingleObject(_: HANDLE, _: DWORD) -> DWORD { 0 }
}
