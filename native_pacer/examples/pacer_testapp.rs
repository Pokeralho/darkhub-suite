// Minimal present loop used to verify the frame limiter end to end (see tests/e2e.ps1).
//
//   pacer_testapp <mode> <seconds>
//   mode: d3d11 | d3d11-warp | gl | gl-gpa | gl-wgl
//     d3d11       hardware D3D11 device, DXGI blt swap chain, Present(0, 0)
//     d3d11-warp  same on the WARP software adapter (a different adapter LUID)
//     gl          OpenGL, gdi32!SwapBuffers through the import table
//     gl-gpa      OpenGL, gdi32!SwapBuffers through GetProcAddress (not through the import table)
//     gl-wgl      OpenGL, opengl32!wglSwapBuffers through the import table
//
// Prints one JSON line per second: {"t":<s>,"fps":<frames in that second>}. Build for both
// x86_64 and i686 (cargo build --release --example pacer_testapp [--target i686-pc-windows-msvc]).

#[cfg(windows)]
#[allow(non_upper_case_globals, non_camel_case_types)]
mod app {
    use std::ffi::c_void;
    use std::io::Write;
    use std::ptr;
    use std::time::Instant;

    type HWND = *mut c_void;
    type BOOL = i32;

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
    #[derive(Default)]
    struct PIXELFORMATDESCRIPTOR {
        n_size: u16,
        n_version: u16,
        dw_flags: u32,
        i_pixel_type: u8,
        c_color_bits: u8,
        rest: [u8; 18],
        layer_mask: u32,
        visible_mask: u32,
        damage_mask: u32,
    }

    #[repr(C)]
    struct DXGI_SWAP_CHAIN_DESC {
        width: u32,
        height: u32,
        refresh_num: u32,
        refresh_den: u32,
        format: u32,
        scanline: u32,
        scaling: u32,
        sample_count: u32,
        sample_quality: u32,
        buffer_usage: u32,
        buffer_count: u32,
        output_window: HWND,
        windowed: BOOL,
        swap_effect: u32,
        flags: u32,
    }

    #[repr(C)]
    struct GUID(u32, u16, u16, [u8; 8]);
    const IID_IDXGIDevice: GUID = GUID(0x54ec77fa, 0x1377, 0x44e6, [0x8c, 0x32, 0x88, 0xfd, 0x5f, 0x44, 0xc8, 0x4c]);

    #[repr(C)]
    struct DXGI_ADAPTER_DESC {
        description: [u16; 128],
        ids: [u32; 4],
        mem: [usize; 3],
        luid_low: u32,
        luid_high: i32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn RegisterClassW(c: *const WNDCLASSW) -> u16;
        fn CreateWindowExW(ex: u32, class: *const u16, title: *const u16, style: u32, x: i32, y: i32, w: i32, h: i32, parent: HWND, menu: *mut c_void, inst: *mut c_void, param: *mut c_void) -> HWND;
        fn DefWindowProcW(h: HWND, m: u32, w: usize, l: isize) -> isize;
        fn PeekMessageW(msg: *mut MSG, h: HWND, a: u32, b: u32, remove: u32) -> BOOL;
        fn TranslateMessage(msg: *const MSG) -> BOOL;
        fn DispatchMessageW(msg: *const MSG) -> isize;
        fn GetDC(h: HWND) -> *mut c_void;
    }
    #[link(name = "gdi32")]
    extern "system" {
        fn ChoosePixelFormat(hdc: *mut c_void, pfd: *const PIXELFORMATDESCRIPTOR) -> i32;
        fn SetPixelFormat(hdc: *mut c_void, fmt: i32, pfd: *const PIXELFORMATDESCRIPTOR) -> BOOL;
        fn SwapBuffers(hdc: *mut c_void) -> BOOL;
    }
    #[link(name = "opengl32")]
    extern "system" {
        fn wglCreateContext(hdc: *mut c_void) -> *mut c_void;
        fn wglMakeCurrent(hdc: *mut c_void, ctx: *mut c_void) -> BOOL;
        fn wglGetProcAddress(name: *const u8) -> *mut c_void;
        fn wglSwapBuffers(hdc: *mut c_void) -> BOOL;
        fn glClearColor(r: f32, g: f32, b: f32, a: f32);
        fn glClear(mask: u32);
    }
    #[link(name = "d3d11")]
    extern "system" {
        fn D3D11CreateDeviceAndSwapChain(adapter: *mut c_void, driver: u32, sw: *mut c_void, flags: u32, levels: *const u32, nlevels: u32, sdk: u32, desc: *const DXGI_SWAP_CHAIN_DESC, sc: *mut *mut c_void, dev: *mut *mut c_void, level: *mut u32, ctx: *mut *mut c_void) -> i32;
    }
    extern "system" {
        fn GetModuleHandleW(name: *const u16) -> *mut c_void;
        fn GetProcAddress(m: *mut c_void, name: *const u8) -> *mut c_void;
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

    unsafe fn adapter_luid(sc: *mut c_void) -> String {
        type GetDevice = unsafe extern "system" fn(*mut c_void, *const GUID, *mut *mut c_void) -> i32;
        type GetAdapter = unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> i32;
        type GetDesc = unsafe extern "system" fn(*mut c_void, *mut DXGI_ADAPTER_DESC) -> i32;
        let gd: GetDevice = std::mem::transmute(vfn(sc, 7));
        let mut dev = ptr::null_mut();
        if gd(sc, &IID_IDXGIDevice, &mut dev) < 0 {
            return String::new();
        }
        let ga: GetAdapter = std::mem::transmute(vfn(dev, 7));
        let mut ad = ptr::null_mut();
        if ga(dev, &mut ad) < 0 {
            return String::new();
        }
        let gdesc: GetDesc = std::mem::transmute(vfn(ad, 8));
        let mut d: DXGI_ADAPTER_DESC = std::mem::zeroed();
        gdesc(ad, &mut d);
        let name = String::from_utf16_lossy(&d.description).trim_end_matches('\0').to_string();
        format!("{:016x}\",\"adapter\":\"{}", ((d.luid_high as u32 as u64) << 32) | d.luid_low as u64, name)
    }

    pub fn run() {
        let args: Vec<String> = std::env::args().collect();
        let mode = args.get(1).cloned().unwrap_or_else(|| "d3d11".into());
        let seconds: u64 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(10);
        unsafe {
            let class = wide("DarkHubPacerTest");
            let wc = WNDCLASSW {
                style: 0,
                wnd_proc: wndproc,
                cls_extra: 0,
                wnd_extra: 0,
                instance: GetModuleHandleW(ptr::null()),
                icon: ptr::null_mut(),
                cursor: ptr::null_mut(),
                background: ptr::null_mut(),
                menu_name: ptr::null(),
                class_name: class.as_ptr(),
            };
            RegisterClassW(&wc);
            let title = wide(&format!("pacer_testapp {}", mode));
            // WS_OVERLAPPEDWINDOW | WS_VISIBLE
            let hwnd = CreateWindowExW(0, class.as_ptr(), title.as_ptr(), 0x00CF_0000 | 0x1000_0000, 40, 40, 320, 240, ptr::null_mut(), ptr::null_mut(), wc.instance, ptr::null_mut());
            if hwnd.is_null() {
                println!("{{\"error\":\"CreateWindow failed\"}}");
                return;
            }

            let mut present: Box<dyn FnMut()> = if mode.starts_with("d3d11") {
                let desc = DXGI_SWAP_CHAIN_DESC {
                    width: 320,
                    height: 240,
                    refresh_num: 0,
                    refresh_den: 0,
                    format: 28,
                    scanline: 0,
                    scaling: 0,
                    sample_count: 1,
                    sample_quality: 0,
                    buffer_usage: 0x20,
                    buffer_count: 1,
                    output_window: hwnd,
                    windowed: 1,
                    swap_effect: 0,
                    flags: 0,
                };
                let driver = if mode == "d3d11-warp" { 5 } else { 1 };
                let (mut sc, mut dev, mut ctx, mut lvl) = (ptr::null_mut(), ptr::null_mut(), ptr::null_mut(), 0u32);
                let hr = D3D11CreateDeviceAndSwapChain(ptr::null_mut(), driver, ptr::null_mut(), 0, ptr::null(), 0, 7, &desc, &mut sc, &mut dev, &mut lvl, &mut ctx);
                if hr < 0 {
                    println!("{{\"error\":\"D3D11CreateDeviceAndSwapChain 0x{:08x}\"}}", hr);
                    return;
                }
                println!("{{\"mode\":\"{}\",\"luid\":\"{}\",\"bits\":{}}}", mode, adapter_luid(sc), usize::BITS);
                Box::new(move || {
                    // Through the vtable on every frame, like a real game (a hook patches the slot).
                    let p: unsafe extern "system" fn(*mut c_void, u32, u32) -> i32 = std::mem::transmute(vfn(sc, 8));
                    p(sc, 0, 0);
                })
            } else {
                let hdc = GetDC(hwnd);
                let mut pfd = PIXELFORMATDESCRIPTOR::default();
                pfd.n_size = std::mem::size_of::<PIXELFORMATDESCRIPTOR>() as u16;
                pfd.n_version = 1;
                pfd.dw_flags = 0x4 | 0x20 | 0x1; // DRAW_TO_WINDOW | SUPPORT_OPENGL | DOUBLEBUFFER
                pfd.c_color_bits = 32;
                let fmt = ChoosePixelFormat(hdc, &pfd);
                SetPixelFormat(hdc, fmt, &pfd);
                let ctx = wglCreateContext(hdc);
                if ctx.is_null() || wglMakeCurrent(hdc, ctx) == 0 {
                    println!("{{\"error\":\"wgl context failed\"}}");
                    return;
                }
                let swap_interval = wglGetProcAddress(b"wglSwapIntervalEXT\0".as_ptr());
                if !swap_interval.is_null() {
                    let f: unsafe extern "system" fn(i32) -> BOOL = std::mem::transmute(swap_interval);
                    f(0); // no vsync
                }
                println!("{{\"mode\":\"{}\",\"bits\":{}}}", mode, usize::BITS);
                let gpa_swap: unsafe extern "system" fn(*mut c_void) -> BOOL =
                    std::mem::transmute(GetProcAddress(GetModuleHandleW(wide("gdi32.dll").as_ptr()), b"SwapBuffers\0".as_ptr()));
                let m = mode.clone();
                let mut frame = 0u32;
                Box::new(move || {
                    frame = frame.wrapping_add(1);
                    glClearColor((frame % 256) as f32 / 255.0, 0.2, 0.3, 1.0);
                    glClear(0x4000);
                    match m.as_str() {
                        "gl-gpa" => {
                            gpa_swap(hdc);
                        }
                        "gl-wgl" => {
                            wglSwapBuffers(hdc);
                        }
                        _ => {
                            SwapBuffers(hdc);
                        }
                    }
                })
            };

            let start = Instant::now();
            let mut sec_start = Instant::now();
            let mut frames = 0u32;
            let mut t = 0u64;
            let mut msg: MSG = std::mem::zeroed();
            while start.elapsed().as_secs() < seconds {
                while PeekMessageW(&mut msg, ptr::null_mut(), 0, 0, 1) != 0 {
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                }
                present();
                frames += 1;
                let el = sec_start.elapsed();
                if el.as_secs_f64() >= 1.0 {
                    t += 1;
                    println!("{{\"t\":{},\"fps\":{:.1}}}", t, frames as f64 / el.as_secs_f64());
                    let _ = std::io::stdout().flush();
                    frames = 0;
                    sec_start = Instant::now();
                }
            }
        }
    }
}

#[cfg(windows)]
fn main() {
    app::run();
}

#[cfg(not(windows))]
fn main() {}
