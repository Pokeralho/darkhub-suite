// D3D11 + flip-model DXGI present loop used to test DarkHub.PacerHook (see ../README.md and ../run_pacer.ps1).
//
//   dxgi_harness <present|present1|alt> <seconds> [--free-hook-after-ms N]
//     present   IDXGISwapChain::Present (vtable slot 8) on a CreateSwapChainForHwnd swap chain
//     present1  IDXGISwapChain1::Present1 (slot 22) on the same kind of swap chain
//     alt       alternates both every frame
//   --free-hook-after-ms N : as soon as DarkHub.PacerHook.*.dll appears in this process, wait N ms and call
//                            FreeLibrary on it once (simulates an early unload while the hook's init thread sleeps).
//
// Prints {"mode":..} once, then one JSON line per second: {"t":s,"fps":n,"hook":<module mapped>}.
// Calls go through the vtable on every frame, like a game (the hook patches the slots).
#![allow(non_upper_case_globals, non_camel_case_types, non_snake_case)]

use std::ffi::c_void;
use std::io::Write;
use std::ptr;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::Instant;

type HWND = *mut c_void;
type HRESULT = i32;

#[repr(C)]
struct WNDCLASSW {
    style: u32,
    wnd_proc: unsafe extern "system" fn(HWND, u32, usize, isize) -> isize,
    cls_extra: i32,
    wnd_extra: i32,
    instance: *mut c_void,
    icon: *mut c_void,
    cursor: *mut c_void,
    background: *mut c_void,
    menu_name: *const u16,
    class_name: *const u16,
}
#[repr(C)]
struct MSG {
    hwnd: HWND,
    message: u32,
    wparam: usize,
    lparam: isize,
    time: u32,
    pt: [i32; 2],
    private: u32,
}
#[repr(C)]
struct GUID(u32, u16, u16, [u8; 8]);
const IID_IDXGIDevice: GUID = GUID(0x54ec77fa, 0x1377, 0x44e6, [0x8c, 0x32, 0x88, 0xfd, 0x5f, 0x44, 0xc8, 0x4c]);
const IID_IDXGIFactory2: GUID = GUID(0x50c83a1c, 0xe072, 0x4c48, [0x87, 0xb0, 0x36, 0x30, 0xfa, 0x36, 0xa6, 0xd0]);

#[repr(C)]
struct DXGI_SWAP_CHAIN_DESC1 {
    width: u32,
    height: u32,
    format: u32,
    stereo: i32,
    sample_count: u32,
    sample_quality: u32,
    buffer_usage: u32,
    buffer_count: u32,
    scaling: u32,
    swap_effect: u32,
    alpha_mode: u32,
    flags: u32,
}
#[repr(C)]
struct DXGI_PRESENT_PARAMETERS {
    dirty_rects_count: u32,
    dirty_rects: *mut c_void,
    scroll_rect: *mut c_void,
    scroll_offset: *mut c_void,
}

#[link(name = "user32")]
extern "system" {
    fn RegisterClassW(c: *const WNDCLASSW) -> u16;
    fn CreateWindowExW(ex: u32, class: *const u16, title: *const u16, style: u32, x: i32, y: i32, w: i32, h: i32, parent: HWND, menu: *mut c_void, inst: *mut c_void, param: *mut c_void) -> HWND;
    fn DefWindowProcW(h: HWND, m: u32, w: usize, l: isize) -> isize;
    fn PeekMessageW(msg: *mut MSG, h: HWND, a: u32, b: u32, remove: u32) -> i32;
    fn TranslateMessage(msg: *const MSG) -> i32;
    fn DispatchMessageW(msg: *const MSG) -> isize;
}
#[link(name = "d3d11")]
extern "system" {
    fn D3D11CreateDevice(adapter: *mut c_void, driver: u32, sw: *mut c_void, flags: u32, levels: *const u32, nlevels: u32, sdk: u32, dev: *mut *mut c_void, level: *mut u32, ctx: *mut *mut c_void) -> HRESULT;
}
#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    fn FreeLibrary(m: *mut c_void) -> i32;
    fn GetCurrentProcessId() -> u32;
}

unsafe extern "system" fn wndproc(h: HWND, m: u32, w: usize, l: isize) -> isize {
    DefWindowProcW(h, m, w, l)
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
unsafe fn vfn(obj: *mut c_void, i: usize) -> usize {
    *(*(obj as *const *const usize)).add(i)
}
fn hook_module() -> *mut c_void {
    unsafe {
        for n in ["DarkHub.PacerHook.x64.dll", "DarkHub.PacerHook.x86.dll"] {
            let h = GetModuleHandleW(wide(n).as_ptr());
            if !h.is_null() {
                return h;
            }
        }
    }
    ptr::null_mut()
}
fn out(s: String) {
    println!("{}", s);
    let _ = std::io::stdout().flush();
}

static START_MS: AtomicI64 = AtomicI64::new(0);

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mode = args.get(1).cloned().unwrap_or_else(|| "present".into());
    let seconds: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(10);
    let free_after: Option<u64> = args.iter().position(|a| a == "--free-hook-after-ms").and_then(|i| args.get(i + 1)).and_then(|s| s.parse().ok());
    let start = Instant::now();
    START_MS.store(0, Ordering::Relaxed);

    if let Some(ms) = free_after {
        std::thread::spawn(move || {
            let t0 = Instant::now();
            loop {
                let h = hook_module();
                if !h.is_null() {
                    let seen = start.elapsed().as_secs_f64();
                    std::thread::sleep(std::time::Duration::from_millis(ms));
                    let ok = unsafe { FreeLibrary(h) };
                    let still = !hook_module().is_null();
                    out(format!("{{\"event\":\"freelibrary\",\"seenAtS\":{:.3},\"freedAtS\":{:.3},\"ok\":{},\"stillMapped\":{}}}", seen, start.elapsed().as_secs_f64(), ok != 0, still));
                    // Report when the module really goes away.
                    let mut last = still;
                    loop {
                        std::thread::sleep(std::time::Duration::from_millis(20));
                        let now = !hook_module().is_null();
                        if now != last {
                            out(format!("{{\"event\":\"hook_mapped_changed\",\"mapped\":{},\"atS\":{:.3}}}", now, start.elapsed().as_secs_f64()));
                            last = now;
                        }
                        if start.elapsed().as_secs() >= seconds {
                            return;
                        }
                    }
                }
                if t0.elapsed().as_secs() > 60 {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
        });
    }

    unsafe {
        let hinst = GetModuleHandleW(ptr::null());
        let class = wide("DarkHubDxgiHarness");
        let wc = WNDCLASSW {
            style: 0,
            wnd_proc: wndproc,
            cls_extra: 0,
            wnd_extra: 0,
            instance: hinst,
            icon: ptr::null_mut(),
            cursor: ptr::null_mut(),
            background: ptr::null_mut(),
            menu_name: ptr::null(),
            class_name: class.as_ptr(),
        };
        RegisterClassW(&wc);
        let title = wide(&format!("dxgi_harness {}", mode));
        let hwnd = CreateWindowExW(0, class.as_ptr(), title.as_ptr(), 0x00CF_0000 | 0x1000_0000, 60, 60, 320, 240, ptr::null_mut(), ptr::null_mut(), hinst, ptr::null_mut());
        if hwnd.is_null() {
            out("{\"error\":\"CreateWindow failed\"}".into());
            std::process::exit(1);
        }
        let (mut dev, mut ctx, mut lvl) = (ptr::null_mut(), ptr::null_mut(), 0u32);
        let hr = D3D11CreateDevice(ptr::null_mut(), 1, ptr::null_mut(), 0, ptr::null(), 0, 7, &mut dev, &mut lvl, &mut ctx);
        if hr < 0 {
            out(format!("{{\"error\":\"D3D11CreateDevice 0x{:08x}\"}}", hr));
            std::process::exit(1);
        }
        // device -> IDXGIDevice -> adapter -> IDXGIFactory2
        type QI = unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> HRESULT;
        let qi: QI = std::mem::transmute(vfn(dev, 0));
        let mut dxgi_dev = ptr::null_mut();
        if qi(dev, &IID_IDXGIDevice, &mut dxgi_dev) < 0 {
            out("{\"error\":\"QI IDXGIDevice\"}".into());
            std::process::exit(1);
        }
        let get_adapter: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT = std::mem::transmute(vfn(dxgi_dev, 7));
        let mut adapter = ptr::null_mut();
        get_adapter(dxgi_dev, &mut adapter);
        let get_parent: unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> HRESULT = std::mem::transmute(vfn(adapter, 6));
        let mut factory = ptr::null_mut();
        if get_parent(adapter, &IID_IDXGIFactory2, &mut factory) < 0 {
            out("{\"error\":\"IDXGIFactory2 not available\"}".into());
            std::process::exit(1);
        }
        if mode == "tearing-check" {
            // IDXGIFactory5::CheckFeatureSupport(DXGI_FEATURE_PRESENT_ALLOW_TEARING): what GpuBench now asks before
            // creating its swap chain with DXGI_SWAP_CHAIN_FLAG_ALLOW_TEARING.
            const IID_IDXGIFactory5: GUID = GUID(0x7632e1f5, 0xee65, 0x4dca, [0x87, 0xfd, 0x84, 0xcd, 0x75, 0xf8, 0x83, 0x8d]);
            let fqi: QI = std::mem::transmute(vfn(factory, 0));
            let mut f5 = ptr::null_mut();
            if fqi(factory, &IID_IDXGIFactory5, &mut f5) < 0 {
                out("{\"tearingCheck\":\"IDXGIFactory5 not available\",\"allowTearing\":false}".into());
                return;
            }
            let check: unsafe extern "system" fn(*mut c_void, u32, *mut c_void, u32) -> HRESULT = std::mem::transmute(vfn(f5, 28));
            let mut allow: i32 = 0;
            let hr = check(f5, 0, &mut allow as *mut i32 as *mut c_void, 4);
            out(format!("{{\"tearingCheck\":\"hr=0x{:08x}\",\"allowTearing\":{}}}", hr, hr >= 0 && allow != 0));
            return;
        }
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            width: 320,
            height: 240,
            format: 28, // R8G8B8A8_UNORM
            stereo: 0,
            sample_count: 1,
            sample_quality: 0,
            buffer_usage: 0x20, // RENDER_TARGET_OUTPUT
            buffer_count: 2,
            scaling: 0,
            swap_effect: 4, // FLIP_DISCARD
            alpha_mode: 0,
            flags: 0,
        };
        type CreateForHwnd = unsafe extern "system" fn(*mut c_void, *mut c_void, HWND, *const DXGI_SWAP_CHAIN_DESC1, *const c_void, *mut c_void, *mut *mut c_void) -> HRESULT;
        let create: CreateForHwnd = std::mem::transmute(vfn(factory, 15));
        let mut sc1 = ptr::null_mut();
        let hr = create(factory, dev, hwnd, &desc, ptr::null(), ptr::null_mut(), &mut sc1);
        if hr < 0 {
            out(format!("{{\"error\":\"CreateSwapChainForHwnd 0x{:08x}\"}}", hr));
            std::process::exit(1);
        }
        out(format!("{{\"mode\":\"{}\",\"bits\":{},\"pid\":{},\"swapchain\":\"flip_discard/CreateSwapChainForHwnd\"}}", mode, usize::BITS, GetCurrentProcessId()));

        let params = DXGI_PRESENT_PARAMETERS { dirty_rects_count: 0, dirty_rects: ptr::null_mut(), scroll_rect: ptr::null_mut(), scroll_offset: ptr::null_mut() };
        let mut frame = 0u64;
        let mut sec_start = Instant::now();
        let mut frames = 0u32;
        let mut t = 0u64;
        let mut bad_hr = 0u64;
        let mut msg: MSG = std::mem::zeroed();
        while start.elapsed().as_secs() < seconds {
            while PeekMessageW(&mut msg, ptr::null_mut(), 0, 0, 1) != 0 {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let use1 = match mode.as_str() {
                "present1" => true,
                "alt" => frame % 2 == 1,
                _ => false,
            };
            let hr = if use1 {
                let p1: unsafe extern "system" fn(*mut c_void, u32, u32, *const DXGI_PRESENT_PARAMETERS) -> HRESULT = std::mem::transmute(vfn(sc1, 22));
                p1(sc1, 0, 0, &params)
            } else {
                let p: unsafe extern "system" fn(*mut c_void, u32, u32) -> HRESULT = std::mem::transmute(vfn(sc1, 8));
                p(sc1, 0, 0)
            };
            if hr < 0 {
                bad_hr += 1;
            }
            frame += 1;
            frames += 1;
            let el = sec_start.elapsed();
            if el.as_secs_f64() >= 1.0 {
                t += 1;
                out(format!("{{\"t\":{},\"fps\":{:.1},\"hook\":{},\"badHr\":{}}}", t, frames as f64 / el.as_secs_f64(), !hook_module().is_null(), bad_hr));
                frames = 0;
                sec_start = Instant::now();
            }
        }
        out(format!("{{\"event\":\"exit\",\"frames\":{},\"badHr\":{}}}", frame, bad_hr));
    }
}
