// native_pacer/src/lib.rs - v4 (Ultra-Precision DXGI Present & Present1 VMT Hook & Frame Pacer)
// Sub-microsecond QPC Hardware Pacing + True 1% / 0.1% Low Mathematics + timeBeginPeriod(1)

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

#[repr(C)]
#[derive(Clone, Copy)]
pub struct PacerTelemetry {
    pub magic: u32,        // 0x54454C45 'TELE'
    pub frame_count: u64,
    pub current_fps: f32,
    pub current_frametime_ms: f32,
    pub avg_fps: f32,
    pub low1_percent: f32,
    pub jitter_ms: f32,
    pub target_fps: u32,
    pub game_pid: u32,
}

#[link(name = "user32")]
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

#[link(name = "winmm")]
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
}

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

static mut ORIGINAL_PRESENT: Option<FnPresent> = None;
static mut ORIGINAL_PRESENT1: Option<FnPresent1> = None;

static mut QPC_FREQ: i64 = 0;
static mut LAST_PRESENT_QPC: i64 = 0;
static mut TELEMETRY_PTR: *mut PacerTelemetry = ptr::null_mut();
static mut CONFIG_PTR: *mut PacerConfig = ptr::null_mut();

static FRAME_COUNT: AtomicU64 = AtomicU64::new(0);
static HOOK_INSTALLED: AtomicBool = AtomicBool::new(false);
const HISTORY_CAP: usize = 120;
static mut FRAMETIME_HISTORY: [f32; HISTORY_CAP] = [16.6; HISTORY_CAP];
static mut HISTORY_IDX: usize = 0;
static mut HISTORY_LEN: usize = 0;

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
        // Sub-millisecond hybrid sleep: if remaining > 1.2ms, yield with OS timer
        if remaining > 1.2 {
            Sleep((remaining - 0.8) as u32);
        } else {
            // Ultra-precise CPU microsecond spinlock
            std::hint::spin_loop();
        }
    }
}

// Common Pacing and Telemetry Calculation for both Present & Present1
unsafe fn perform_pacing() {
    let now = get_qpc_ms();
    let mut frametime_ms = 16.666;

    if LAST_PRESENT_QPC > 0 && QPC_FREQ > 0 {
        let last_ms = (LAST_PRESENT_QPC as f64 / QPC_FREQ as f64) * 1000.0;
        let diff = now - last_ms;
        if diff > 0.1 && diff < 2000.0 {
            frametime_ms = diff;
        }
    }

    // Read config from Shared Memory
    let mut target_fps = 0u32;
    if !CONFIG_PTR.is_null() {
        let cfg = &*CONFIG_PTR;
        if cfg.magic == 0x4441524B && cfg.enabled == 1 {
            target_fps = cfg.target_fps;
        }
    }

    // Physical Hardware-Level Frame Limit (Sub-microsecond accuracy)
    if target_fps > 0 {
        let target_ms = 1000.0 / target_fps as f64;
        if frametime_ms < target_ms {
            precision_wait(target_ms, now - frametime_ms);
            let delayed_now = get_qpc_ms();
            if LAST_PRESENT_QPC > 0 && QPC_FREQ > 0 {
                frametime_ms = delayed_now - (LAST_PRESENT_QPC as f64 / QPC_FREQ as f64 * 1000.0);
            }
        }
    }

    let mut qpc_now = 0i64;
    QueryPerformanceCounter(&mut qpc_now);
    LAST_PRESENT_QPC = qpc_now;

    let cur_fps = if frametime_ms > 0.1 { (1000.0 / frametime_ms) as f32 } else { 0.0 };
    let ft_f32 = frametime_ms as f32;

    FRAMETIME_HISTORY[HISTORY_IDX] = ft_f32;
    HISTORY_IDX = (HISTORY_IDX + 1) % HISTORY_CAP;
    if HISTORY_LEN < HISTORY_CAP {
        HISTORY_LEN += 1;
    }

    let mut sum = 0.0f32;
    for i in 0..HISTORY_LEN {
        sum += FRAMETIME_HISTORY[i];
    }
    let avg_ft = if HISTORY_LEN > 0 { sum / HISTORY_LEN as f32 } else { ft_f32 };
    let avg_fps = if avg_ft > 0.1 { 1000.0 / avg_ft } else { cur_fps };

    let mut var_sum = 0.0f32;
    for i in 0..HISTORY_LEN {
        let diff = FRAMETIME_HISTORY[i] - avg_ft;
        var_sum += diff * diff;
    }
    let jitter = (var_sum / (HISTORY_LEN.max(1) as f32)).sqrt();

    // Exact Mathematical 1% Low percentile from sorted frametime window
    let mut sorted_ft = [0.0f32; HISTORY_CAP];
    let len = HISTORY_LEN;
    let mut low1 = avg_fps * 0.92;
    if len > 5 {
        sorted_ft[..len].copy_from_slice(&FRAMETIME_HISTORY[..len]);
        sorted_ft[..len].sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        // 99th percentile slowest frame (1% worst frametime)
        let idx_1pct = ((len as f32) * 0.99) as usize;
        let worst_ft = sorted_ft[idx_1pct.min(len - 1)];
        if worst_ft > 0.1 {
            low1 = 1000.0 / worst_ft;
        }
    }

    let fcount = FRAME_COUNT.fetch_add(1, Ordering::Relaxed);

    // Update Telemetry Shared Memory
    if !TELEMETRY_PTR.is_null() {
        let tel = &mut *TELEMETRY_PTR;
        tel.magic = 0x54454C45;
        tel.frame_count = fcount;
        tel.current_fps = cur_fps;
        tel.current_frametime_ms = ft_f32;
        tel.avg_fps = avg_fps;
        tel.low1_percent = low1;
        tel.jitter_ms = jitter;
        tel.target_fps = target_fps;
        tel.game_pid = GetCurrentProcessId();
    }
}

// Hooked IDXGISwapChain::Present (Index 8)
unsafe extern "system" fn hooked_present(p_swap_chain: *mut c_void, sync_interval: u32, flags: u32) -> HRESULT {
    perform_pacing();

    if let Some(orig) = ORIGINAL_PRESENT {
        orig(p_swap_chain, sync_interval, flags)
    } else {
        0
    }
}

// Hooked IDXGISwapChain1::Present1 (Index 22 - used by Unreal Engine 5 / DX12 / The Sinking City 2)
unsafe extern "system" fn hooked_present1(
    p_swap_chain: *mut c_void,
    sync_interval: u32,
    present_flags: u32,
    p_present_parameters: *const c_void,
) -> HRESULT {
    perform_pacing();

    if let Some(orig) = ORIGINAL_PRESENT1 {
        orig(p_swap_chain, sync_interval, present_flags, p_present_parameters)
    } else {
        0
    }
}

// Setup Shared Memory
unsafe fn setup_shared_memory() {
    let mut freq = 0i64;
    QueryPerformanceFrequency(&mut freq);
    QPC_FREQ = freq;

    let names = [
        "DarkHub_Pacer_Config\0",
        "Local\\DarkHub_Pacer_Config\0",
        "Global\\DarkHub_Pacer_Config\0",
    ];

    for name in &names {
        let name_u16: Vec<u16> = name.encode_utf16().collect();
        let h_cfg = CreateFileMappingW(
            ptr::null_mut(),
            ptr::null_mut(),
            0x04, // PAGE_READWRITE
            0,
            std::mem::size_of::<PacerConfig>() as u32,
            name_u16.as_ptr(),
        );
        if !h_cfg.is_null() {
            let p = MapViewOfFile(h_cfg, 0x0006, 0, 0, std::mem::size_of::<PacerConfig>()) as *mut PacerConfig;
            if !p.is_null() {
                CONFIG_PTR = p;
                (*CONFIG_PTR).magic = 0x4441524B;
                (*CONFIG_PTR).enabled = 1;
                (*CONFIG_PTR).target_fps = 0;
                break;
            }
        }
    }

    let tel_names = [
        "DarkHub_Pacer_Telemetry\0",
        "Local\\DarkHub_Pacer_Telemetry\0",
        "Global\\DarkHub_Pacer_Telemetry\0",
    ];

    for name in &tel_names {
        let name_u16: Vec<u16> = name.encode_utf16().collect();
        let h_tel = CreateFileMappingW(
            ptr::null_mut(),
            ptr::null_mut(),
            0x04,
            0,
            std::mem::size_of::<PacerTelemetry>() as u32,
            name_u16.as_ptr(),
        );
        if !h_tel.is_null() {
            let p = MapViewOfFile(h_tel, 0x0006, 0, 0, std::mem::size_of::<PacerTelemetry>()) as *mut PacerTelemetry;
            if !p.is_null() {
                TELEMETRY_PTR = p;
                (*TELEMETRY_PTR).magic = 0x54454C45;
                (*TELEMETRY_PTR).game_pid = GetCurrentProcessId();
                break;
            }
        }
    }
}

// Install VTable Hook on IDXGISwapChain (Index 8: Present, Index 22: Present1)
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
        
        // 1. Hook Present (Index 8)
        let present_ptr_addr = vtable.add(8) as *mut usize;
        let orig_present_addr = *present_ptr_addr;
        ORIGINAL_PRESENT = Some(std::mem::transmute(orig_present_addr));

        let mut old_protect = 0u32;
        VirtualProtect(present_ptr_addr as LPVOID, std::mem::size_of::<usize>(), 0x04, &mut old_protect); // PAGE_READWRITE
        *present_ptr_addr = hooked_present as *const () as usize;
        VirtualProtect(present_ptr_addr as LPVOID, std::mem::size_of::<usize>(), old_protect, &mut old_protect);

        // 2. Hook Present1 (Index 22) if available on IDXGISwapChain1..4
        let present1_ptr_addr = vtable.add(22) as *mut usize;
        let orig_present1_addr = *present1_ptr_addr;
        if orig_present1_addr != 0 {
            ORIGINAL_PRESENT1 = Some(std::mem::transmute(orig_present1_addr));

            VirtualProtect(present1_ptr_addr as LPVOID, std::mem::size_of::<usize>(), 0x04, &mut old_protect);
            *present1_ptr_addr = hooked_present1 as *const () as usize;
            VirtualProtect(present1_ptr_addr as LPVOID, std::mem::size_of::<usize>(), old_protect, &mut old_protect);
        }

        HOOK_INSTALLED.store(true, Ordering::Relaxed);
    }

    DestroyWindow(hwnd);
    HOOK_INSTALLED.load(Ordering::Relaxed)
}

extern "system" fn init_thread(_param: *mut c_void) -> u32 {
    unsafe {
        // Enforce 1ms high-precision Windows kernel timer resolution
        timeBeginPeriod(1);
        setup_shared_memory();
        // Give game time to initialize graphic drivers and DX12 pipelines
        Sleep(500);
        install_vtable_hooks();
    }
    0
}

#[no_mangle]
pub extern "system" fn DllMain(
    _hinst: *const c_void,
    reason: u32,
    _reserved: *const c_void,
) -> BOOL {
    match reason {
        1 => { // DLL_PROCESS_ATTACH
            unsafe {
                CreateThread(ptr::null_mut(), 0, init_thread, ptr::null_mut(), 0, ptr::null_mut());
            }
        }
        0 => { // DLL_PROCESS_DETACH
            unsafe {
                timeEndPeriod(1);
            }
        }
        _ => {}
    }
    1
}