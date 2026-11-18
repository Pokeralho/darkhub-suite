// Vulkan test program for the DarkHub low-latency layer (native_lowlatency). See ../README.md.
//
// It never touches a game: it opens its own small window, renders clears, and prints JSON lines.
//
//   vk_harness [--frames N] [--submit v1|v2|mix] [--enum full|partial|groups|groups-khr]
//              [--ext none|antilag|nvll2|both] [--features full|none] [--present immediate|mailbox|fifo]
//              [--cycles N] [--validation]
//
// Exit codes: 0 ok, 1 Vulkan error, 2 device lost, 3 hang (no progress for 10 s or a 5 s fence timeout).
#![allow(clippy::too_many_arguments)]

use ash::vk;
use std::ffi::{c_void, CStr, CString};
use std::io::Write;
use std::ptr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

static PROGRESS: AtomicU64 = AtomicU64::new(0);
static VAL_ERRORS: AtomicU64 = AtomicU64::new(0);
static VAL_WARNINGS: AtomicU64 = AtomicU64::new(0);

// ---------------------------------------------------------------- Win32
type HWND = *mut c_void;
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
struct PROCESS_MEMORY_COUNTERS_EX {
    cb: u32,
    page_fault_count: u32,
    peak_working_set: usize,
    working_set: usize,
    quota_peak_paged: usize,
    quota_paged: usize,
    quota_peak_nonpaged: usize,
    quota_nonpaged: usize,
    pagefile: usize,
    peak_pagefile: usize,
    private_usage: usize,
}
#[link(name = "user32")]
extern "system" {
    fn RegisterClassW(c: *const WNDCLASSW) -> u16;
    fn CreateWindowExW(ex: u32, class: *const u16, title: *const u16, style: u32, x: i32, y: i32, w: i32, h: i32, parent: HWND, menu: *mut c_void, inst: *mut c_void, param: *mut c_void) -> HWND;
    fn DefWindowProcW(h: HWND, m: u32, w: usize, l: isize) -> isize;
    fn PeekMessageW(msg: *mut MSG, h: HWND, a: u32, b: u32, remove: u32) -> i32;
    fn TranslateMessage(msg: *const MSG) -> i32;
    fn DispatchMessageW(msg: *const MSG) -> isize;
    fn DestroyWindow(h: HWND) -> i32;
}
#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleW(name: *const u16) -> *mut c_void;
    fn GetModuleHandleExW(flags: u32, name: *const u16, out: *mut *mut c_void) -> i32;
    fn GetModuleFileNameW(m: *mut c_void, buf: *mut u16, n: u32) -> u32;
    fn GetCurrentProcess() -> *mut c_void;
    fn GetProcessHandleCount(p: *mut c_void, n: *mut u32) -> i32;
    fn K32GetProcessMemoryInfo(p: *mut c_void, c: *mut PROCESS_MEMORY_COUNTERS_EX, cb: u32) -> i32;
}
unsafe extern "system" fn wndproc(h: HWND, m: u32, w: usize, l: isize) -> isize {
    DefWindowProcW(h, m, w, l)
}
fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}
fn pump() {
    unsafe {
        let mut msg: MSG = std::mem::zeroed();
        while PeekMessageW(&mut msg, ptr::null_mut(), 0, 0, 1) != 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }
}
fn module_of(addr: usize) -> String {
    if addr == 0 {
        return String::new();
    }
    unsafe {
        let mut h = ptr::null_mut();
        // FROM_ADDRESS | UNCHANGED_REFCOUNT
        if GetModuleHandleExW(0x4 | 0x2, addr as *const u16, &mut h) == 0 {
            return "?".into();
        }
        let mut buf = [0u16; 512];
        let n = GetModuleFileNameW(h, buf.as_mut_ptr(), 512) as usize;
        let full = String::from_utf16_lossy(&buf[..n]);
        full.rsplit('\\').next().unwrap_or("").to_string()
    }
}
fn mem_snapshot() -> (usize, u32) {
    unsafe {
        let mut c = PROCESS_MEMORY_COUNTERS_EX { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX>() as u32, ..Default::default() };
        K32GetProcessMemoryInfo(GetCurrentProcess(), &mut c, c.cb);
        let mut h = 0u32;
        GetProcessHandleCount(GetCurrentProcess(), &mut h);
        (c.private_usage, h)
    }
}
fn layer_dll_loaded() -> bool {
    unsafe { !GetModuleHandleW(wide("VkLayer_KORTHOS_LowLatency.dll").as_ptr()).is_null() }
}

// ---------------------------------------------------------------- output
fn esc(s: &str) -> String {
    let mut o = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o
}
fn emit(s: String) {
    println!("{}", s);
    let _ = std::io::stdout().flush();
}
fn fail(what: &str, r: vk::Result) -> ! {
    emit(format!("{{\"event\":\"error\",\"what\":\"{}\",\"result\":\"{:?}\"}}", esc(what), r));
    std::process::exit(match r {
        vk::Result::ERROR_DEVICE_LOST => 2,
        vk::Result::TIMEOUT => 3,
        _ => 1,
    });
}
fn chk<T>(r: Result<T, vk::Result>, what: &str) -> T {
    match r {
        Ok(v) => v,
        Err(e) => fail(what, e),
    }
}
fn chk_raw(r: vk::Result, what: &str) {
    if r != vk::Result::SUCCESS {
        fail(what, r);
    }
}

unsafe extern "system" fn dbg_cb(
    sev: vk::DebugUtilsMessageSeverityFlagsEXT,
    _ty: vk::DebugUtilsMessageTypeFlagsEXT,
    data: *const vk::DebugUtilsMessengerCallbackDataEXT<'_>,
    _user: *mut c_void,
) -> vk::Bool32 {
    let is_err = sev.contains(vk::DebugUtilsMessageSeverityFlagsEXT::ERROR);
    let n = if is_err { VAL_ERRORS.fetch_add(1, Ordering::Relaxed) } else { VAL_WARNINGS.fetch_add(1, Ordering::Relaxed) };
    if n < 25 && !data.is_null() && !(*data).p_message.is_null() {
        let m = CStr::from_ptr((*data).p_message).to_string_lossy();
        emit(format!("{{\"event\":\"validation\",\"severity\":\"{}\",\"message\":\"{}\"}}", if is_err { "error" } else { "warning" }, esc(&m)));
    }
    vk::FALSE
}

// ---------------------------------------------------------------- extension structs (defined here so the
// harness does not depend on the ash version knowing VK_AMD_anti_lag / VK_NV_low_latency2)
const ST_ANTI_LAG_FEATURES: i32 = 1000476000;
const ST_ANTI_LAG_DATA: i32 = 1000476001;
const ST_ANTI_LAG_PRESENTATION: i32 = 1000476002;
const ST_LATENCY_SLEEP_MODE_INFO: i32 = 1000505000;
const ST_LATENCY_SLEEP_INFO: i32 = 1000505001;
const ST_SET_LATENCY_MARKER_INFO: i32 = 1000505002;
const ST_GET_LATENCY_MARKER_INFO: i32 = 1000505003;
const ST_LATENCY_SUBMISSION_PRESENT_ID: i32 = 1000505005;
const ST_SWAPCHAIN_LATENCY_CREATE_INFO: i32 = 1000505007;

#[repr(C)]
struct AntiLagFeatures {
    s_type: vk::StructureType,
    p_next: *mut c_void,
    anti_lag: vk::Bool32,
}
#[repr(C)]
struct AntiLagPresentationInfo {
    s_type: vk::StructureType,
    p_next: *mut c_void,
    stage: u32, // 0 INPUT, 1 PRESENT
    frame_index: u64,
}
#[repr(C)]
struct AntiLagData {
    s_type: vk::StructureType,
    p_next: *const c_void,
    mode: u32, // 0 DRIVER_CONTROL, 1 ON, 2 OFF
    max_fps: u32,
    p_presentation_info: *const AntiLagPresentationInfo,
}
#[repr(C)]
struct LatencySleepModeInfo {
    s_type: vk::StructureType,
    p_next: *const c_void,
    low_latency_mode: vk::Bool32,
    low_latency_boost: vk::Bool32,
    minimum_interval_us: u32,
}
#[repr(C)]
struct LatencySleepInfo {
    s_type: vk::StructureType,
    p_next: *const c_void,
    signal_semaphore: vk::Semaphore,
    value: u64,
}
#[repr(C)]
struct SetLatencyMarkerInfo {
    s_type: vk::StructureType,
    p_next: *const c_void,
    present_id: u64,
    marker: u32,
}
#[repr(C)]
struct GetLatencyMarkerInfo {
    s_type: vk::StructureType,
    p_next: *const c_void,
    timing_count: u32,
    p_timings: *mut c_void,
}
#[repr(C)]
struct LatencySubmissionPresentId {
    s_type: vk::StructureType,
    p_next: *const c_void,
    present_id: u64,
}
#[repr(C)]
struct SwapchainLatencyCreateInfo {
    s_type: vk::StructureType,
    p_next: *const c_void,
    latency_mode_enable: vk::Bool32,
}
type PfnAntiLagUpdate = unsafe extern "system" fn(vk::Device, *const AntiLagData);
type PfnSetSleepMode = unsafe extern "system" fn(vk::Device, vk::SwapchainKHR, *const LatencySleepModeInfo) -> vk::Result;
type PfnLatencySleep = unsafe extern "system" fn(vk::Device, vk::SwapchainKHR, *const LatencySleepInfo) -> vk::Result;
type PfnSetMarker = unsafe extern "system" fn(vk::Device, vk::SwapchainKHR, *const SetLatencyMarkerInfo);
type PfnGetTimings = unsafe extern "system" fn(vk::Device, vk::SwapchainKHR, *mut GetLatencyMarkerInfo);

// ---------------------------------------------------------------- args
struct Args {
    frames: u64,
    submit: String,
    enum_mode: String,
    ext: String,
    features: String,
    present: String,
    cycles: u32,
    validation: bool,
}
impl Args {
    fn parse() -> Args {
        let v: Vec<String> = std::env::args().collect();
        let get = |k: &str, d: &str| -> String {
            v.iter().position(|a| a == k).and_then(|i| v.get(i + 1)).cloned().unwrap_or_else(|| d.to_string())
        };
        Args {
            frames: get("--frames", "300").parse().unwrap_or(300),
            submit: get("--submit", "mix"),
            enum_mode: get("--enum", "full"),
            ext: get("--ext", "none"),
            features: get("--features", "full"),
            present: get("--present", "immediate"),
            cycles: get("--cycles", "1").parse().unwrap_or(1),
            validation: v.iter().any(|a| a == "--validation"),
        }
    }
}

fn main() {
    let a = Args::parse();
    // Watchdog: a hung present/submit/fence never returns, so a separate thread has to notice.
    std::thread::spawn(|| {
        let mut last = u64::MAX;
        let mut since = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(500));
            let p = PROGRESS.load(Ordering::Relaxed);
            if p != last {
                last = p;
                since = Instant::now();
            } else if since.elapsed() > Duration::from_secs(10) {
                emit(format!("{{\"event\":\"hang\",\"progress\":{}}}", p));
                std::process::exit(3);
            }
        }
    });
    if a.features == "none" && a.submit != "v1" {
        emit("{\"event\":\"error\",\"what\":\"--features none needs --submit v1 (vkQueueSubmit2 needs synchronization2)\"}".into());
        std::process::exit(1);
    }
    let entry = match unsafe { ash::Entry::load() } {
        Ok(e) => e,
        Err(e) => {
            emit(format!("{{\"event\":\"error\",\"what\":\"load vulkan-1.dll: {}\"}}", esc(&e.to_string())));
            std::process::exit(1);
        }
    };
    unsafe {
        let hinst = GetModuleHandleW(ptr::null());
        let class = wide("DarkHubVkHarness");
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
        let title = wide("vk_harness (DarkHub layer test)");
        // WS_OVERLAPPEDWINDOW | WS_VISIBLE, small
        let hwnd = CreateWindowExW(0, class.as_ptr(), title.as_ptr(), 0x00CF_0000 | 0x1000_0000, 80, 80, 336, 279, ptr::null_mut(), ptr::null_mut(), hinst, ptr::null_mut());
        if hwnd.is_null() {
            emit("{\"event\":\"error\",\"what\":\"CreateWindow\"}".into());
            std::process::exit(1);
        }
        for c in 0..a.cycles {
            run_cycle(&entry, &a, hinst, hwnd, c);
        }
        DestroyWindow(hwnd);
    }
    emit(format!(
        "{{\"event\":\"done\",\"validationErrors\":{},\"validationWarnings\":{}}}",
        VAL_ERRORS.load(Ordering::Relaxed),
        VAL_WARNINGS.load(Ordering::Relaxed)
    ));
}

unsafe fn run_cycle(entry: &ash::Entry, a: &Args, hinst: *mut c_void, hwnd: HWND, cycle: u32) {
    PROGRESS.fetch_add(1, Ordering::Relaxed);
    let layer_names: Vec<String> = chk(entry.enumerate_instance_layer_properties(), "enumerate layers")
        .iter()
        .map(|l| l.layer_name_as_c_str().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default())
        .collect();
    let has_validation = layer_names.iter().any(|n| n == "VK_LAYER_KHRONOS_validation");
    let use_val = a.validation && has_validation;

    // ---- instance
    let app_name = CString::new("vk_harness").unwrap();
    let app = vk::ApplicationInfo::default().application_name(&app_name).api_version(vk::make_api_version(0, 1, 3, 0));
    let mut iexts = vec![ash::khr::surface::NAME.as_ptr(), ash::khr::win32_surface::NAME.as_ptr()];
    if a.enum_mode == "groups-khr" {
        iexts.push(ash::khr::device_group_creation::NAME.as_ptr());
    }
    let mut ilayers = vec![];
    if use_val {
        ilayers.push(c"VK_LAYER_KHRONOS_validation".as_ptr());
        iexts.push(ash::ext::debug_utils::NAME.as_ptr());
    }
    let ici = vk::InstanceCreateInfo::default().application_info(&app).enabled_extension_names(&iexts).enabled_layer_names(&ilayers);
    let instance = chk(entry.create_instance(&ici, None), "vkCreateInstance");
    let debug_utils = ash::ext::debug_utils::Instance::new(entry, &instance);
    let messenger = if use_val {
        let mci = vk::DebugUtilsMessengerCreateInfoEXT::default()
            .message_severity(vk::DebugUtilsMessageSeverityFlagsEXT::ERROR | vk::DebugUtilsMessageSeverityFlagsEXT::WARNING)
            .message_type(vk::DebugUtilsMessageTypeFlagsEXT::GENERAL | vk::DebugUtilsMessageTypeFlagsEXT::VALIDATION | vk::DebugUtilsMessageTypeFlagsEXT::PERFORMANCE)
            .pfn_user_callback(Some(dbg_cb));
        chk(debug_utils.create_debug_utils_messenger(&mci, None), "create messenger")
    } else {
        vk::DebugUtilsMessengerEXT::null()
    };
    let layer_loaded = layer_dll_loaded();
    emit(format!(
        "{{\"event\":\"instance\",\"cycle\":{},\"layerDllLoaded\":{},\"envEnable\":\"{}\",\"envReflex\":\"{}\",\"validation\":{},\"validationAvailable\":{},\"instanceLayers\":[{}]}}",
        cycle,
        layer_loaded,
        std::env::var("LOW_LATENCY_LAYER").unwrap_or_default(),
        std::env::var("LOW_LATENCY_LAYER_REFLEX").unwrap_or_default(),
        use_val,
        has_validation,
        layer_names.iter().map(|n| format!("\"{}\"", esc(n))).collect::<Vec<_>>().join(",")
    ));

    // ---- physical device selection (the order of calls matters for the layer's device registration)
    let ih = instance.handle();
    let fp10 = instance.fp_v1_0();
    let mut probes: Vec<String> = vec![];
    let probe = |probes: &mut Vec<String>, name: &str, r: vk::Result, n: u32| probes.push(format!("{{\"call\":\"{}\",\"result\":\"{:?}\",\"count\":{}}}", name, r, n));
    let pd: vk::PhysicalDevice = match a.enum_mode.as_str() {
        "partial" => {
            // Never enumerate fully before creating the device: the layer has to find this device lazily.
            let mut buf = [vk::PhysicalDevice::null(); 1];
            let mut n = 0u32;
            let r = (fp10.enumerate_physical_devices)(ih, &mut n, buf.as_mut_ptr());
            probe(&mut probes, "vkEnumeratePhysicalDevices(count=0,non-null)", r, n);
            let mut n = 1u32;
            let r = (fp10.enumerate_physical_devices)(ih, &mut n, buf.as_mut_ptr());
            probe(&mut probes, "vkEnumeratePhysicalDevices(count=1)", r, n);
            if r != vk::Result::SUCCESS && r != vk::Result::INCOMPLETE {
                fail("enumerate partial", r);
            }
            buf[0]
        }
        "groups" | "groups-khr" => {
            let khr = a.enum_mode == "groups-khr";
            let f: vk::PFN_vkEnumeratePhysicalDeviceGroups = if khr {
                let p = (entry.static_fn().get_instance_proc_addr)(ih, c"vkEnumeratePhysicalDeviceGroupsKHR".as_ptr());
                match p {
                    Some(p) => std::mem::transmute(p),
                    None => fail("vkGetInstanceProcAddr(vkEnumeratePhysicalDeviceGroupsKHR) = NULL", vk::Result::ERROR_EXTENSION_NOT_PRESENT),
                }
            } else {
                instance.fp_v1_1().enumerate_physical_device_groups
            };
            let name = if khr { "vkEnumeratePhysicalDeviceGroupsKHR" } else { "vkEnumeratePhysicalDeviceGroups" };
            let mut total = 0u32;
            let r = f(ih, &mut total, ptr::null_mut());
            probe(&mut probes, &format!("{}(query)", name), r, total);
            let mut groups = vec![vk::PhysicalDeviceGroupProperties::default(); total.max(1) as usize];
            let mut n = 0u32;
            let r = f(ih, &mut n, groups.as_mut_ptr());
            probe(&mut probes, &format!("{}(count=0,non-null)", name), r, n);
            let mut n = total;
            let r = f(ih, &mut n, groups.as_mut_ptr());
            probe(&mut probes, &format!("{}(full)", name), r, n);
            chk_raw(r, name);
            groups[0].physical_devices[0]
        }
        _ => {
            let mut n = 0u32;
            let r = (fp10.enumerate_physical_devices)(ih, &mut n, ptr::null_mut());
            probe(&mut probes, "vkEnumeratePhysicalDevices(query)", r, n);
            let mut v = vec![vk::PhysicalDevice::null(); n as usize];
            let r = (fp10.enumerate_physical_devices)(ih, &mut n, v.as_mut_ptr());
            probe(&mut probes, "vkEnumeratePhysicalDevices(full)", r, n);
            chk_raw(r, "enumerate");
            v[0]
        }
    };
    PROGRESS.fetch_add(1, Ordering::Relaxed);
    let props = instance.get_physical_device_properties(pd);
    let dev_name = props.device_name_as_c_str().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();

    // ---- device extensions (also the layer-specific list and an undersized query -> VK_INCOMPLETE)
    let dexts = chk(instance.enumerate_device_extension_properties(pd), "enumerate device extensions");
    let has = |n: &CStr| dexts.iter().any(|e| e.extension_name_as_c_str().ok() == Some(n));
    let has_antilag = has(c"VK_AMD_anti_lag");
    let has_nvll2 = has(c"VK_NV_low_latency2");
    let has_present_id = has(c"VK_KHR_present_id");
    let mut n = (dexts.len() as u32).saturating_sub(1);
    let mut tmp = vec![vk::ExtensionProperties::default(); dexts.len()];
    let r = (fp10.enumerate_device_extension_properties)(pd, ptr::null(), &mut n, tmp.as_mut_ptr());
    probe(&mut probes, "vkEnumerateDeviceExtensionProperties(count=total-1)", r, n);
    let mut layer_exts: Vec<String> = vec![];
    if layer_loaded {
        let lname = c"VK_LAYER_KORTHOS_low_latency";
        let mut n = 0u32;
        let r = (fp10.enumerate_device_extension_properties)(pd, lname.as_ptr(), &mut n, ptr::null_mut());
        probe(&mut probes, "vkEnumerateDeviceExtensionProperties(layer,query)", r, n);
        let mut v = vec![vk::ExtensionProperties::default(); n as usize];
        let r = (fp10.enumerate_device_extension_properties)(pd, lname.as_ptr(), &mut n, v.as_mut_ptr());
        probe(&mut probes, "vkEnumerateDeviceExtensionProperties(layer,full)", r, n);
        layer_exts = v.iter().map(|e| e.extension_name_as_c_str().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default()).collect();
    }
    // After selection, the remaining enumeration paths (reported only).
    if a.enum_mode != "full" {
        let mut n = 0u32;
        let r = (fp10.enumerate_physical_devices)(ih, &mut n, ptr::null_mut());
        probe(&mut probes, "vkEnumeratePhysicalDevices(query,after)", r, n);
    }
    if !a.enum_mode.starts_with("groups") {
        let mut n = 0u32;
        let r = (instance.fp_v1_1().enumerate_physical_device_groups)(ih, &mut n, ptr::null_mut());
        probe(&mut probes, "vkEnumeratePhysicalDeviceGroups(query,after)", r, n);
        let mut g = vec![vk::PhysicalDeviceGroupProperties::default(); n as usize];
        let r = (instance.fp_v1_1().enumerate_physical_device_groups)(ih, &mut n, g.as_mut_ptr());
        probe(&mut probes, "vkEnumeratePhysicalDeviceGroups(full,after)", r, n);
    }

    // ---- surface + queue family
    let surface_i = ash::khr::surface::Instance::new(entry, &instance);
    let win32_i = ash::khr::win32_surface::Instance::new(entry, &instance);
    let sci = vk::Win32SurfaceCreateInfoKHR::default().hinstance(hinst as isize).hwnd(hwnd as isize);
    let surface = chk(win32_i.create_win32_surface(&sci, None), "vkCreateWin32SurfaceKHR");
    let qfs = instance.get_physical_device_queue_family_properties(pd);
    let qf = (0..qfs.len() as u32)
        .find(|&i| qfs[i as usize].queue_flags.contains(vk::QueueFlags::GRAPHICS) && surface_i.get_physical_device_surface_support(pd, i, surface).unwrap_or(false))
        .unwrap_or_else(|| fail("no graphics+present queue family", vk::Result::ERROR_INITIALIZATION_FAILED));
    let ts_bits = qfs[qf as usize].timestamp_valid_bits;

    // ---- device
    let want_antilag = a.ext == "antilag" || a.ext == "both";
    let want_nvll2 = a.ext == "nvll2" || a.ext == "both";
    if want_antilag && !has_antilag {
        fail("VK_AMD_anti_lag requested but not exposed", vk::Result::ERROR_EXTENSION_NOT_PRESENT);
    }
    if want_nvll2 && !has_nvll2 {
        fail("VK_NV_low_latency2 requested but not exposed", vk::Result::ERROR_EXTENSION_NOT_PRESENT);
    }
    let full_features = a.features == "full";
    let use_present_id = want_nvll2 && has_present_id && full_features;
    let mut dext: Vec<*const i8> = vec![ash::khr::swapchain::NAME.as_ptr()];
    if want_antilag {
        dext.push(c"VK_AMD_anti_lag".as_ptr());
    }
    if want_nvll2 {
        dext.push(c"VK_NV_low_latency2".as_ptr());
    }
    if use_present_id {
        dext.push(c"VK_KHR_present_id".as_ptr());
    }
    let mut f12 = vk::PhysicalDeviceVulkan12Features::default().timeline_semaphore(true);
    let mut f13 = vk::PhysicalDeviceVulkan13Features::default().synchronization2(true);
    let mut fpid = vk::PhysicalDevicePresentIdFeaturesKHR::default().present_id(true);
    let mut fal = AntiLagFeatures { s_type: vk::StructureType::from_raw(ST_ANTI_LAG_FEATURES), p_next: ptr::null_mut(), anti_lag: vk::TRUE };
    let mut head: *mut c_void = ptr::null_mut();
    if full_features {
        f12.p_next = head;
        head = &mut f12 as *mut _ as *mut c_void;
        f13.p_next = head;
        head = &mut f13 as *mut _ as *mut c_void;
    }
    if use_present_id {
        fpid.p_next = head;
        head = &mut fpid as *mut _ as *mut c_void;
    }
    if want_antilag {
        fal.p_next = head;
        head = &mut fal as *mut _ as *mut c_void;
    }
    let prio = [1.0f32];
    let qci = [vk::DeviceQueueCreateInfo::default().queue_family_index(qf).queue_priorities(&prio)];
    let mut dci = vk::DeviceCreateInfo::default().queue_create_infos(&qci).enabled_extension_names(&dext);
    dci.p_next = head;
    let device = chk(instance.create_device(pd, &dci, None), "vkCreateDevice");
    PROGRESS.fetch_add(1, Ordering::Relaxed);
    let dh = device.handle();

    // ---- what vkGetDeviceProcAddr hands out (and which module owns the pointer)
    let gdpa = fp10.get_device_proc_addr;
    let gdpa_names = [
        "vkAntiLagUpdateAMD",
        "vkSetLatencySleepModeNV",
        "vkLatencySleepNV",
        "vkSetLatencyMarkerNV",
        "vkGetLatencyTimingsNV",
        "vkQueueNotifyOutOfBandNV",
        "vkQueueSubmit",
        "vkQueueSubmit2",
        "vkQueueSubmit2KHR",
        "vkQueuePresentKHR",
    ];
    let mut gdpa_json = vec![];
    let mut fns = std::collections::HashMap::new();
    for nm in gdpa_names {
        let cn = CString::new(nm).unwrap();
        let p = gdpa(dh, cn.as_ptr()).map(|f| f as usize).unwrap_or(0);
        fns.insert(nm, p);
        gdpa_json.push(format!("\"{}\":\"{}\"", nm, if p == 0 { "NULL".to_string() } else { module_of(p) }));
    }
    emit(format!(
        "{{\"event\":\"device\",\"cycle\":{},\"gpu\":\"{}\",\"api\":\"{}.{}.{}\",\"enum\":\"{}\",\"probes\":[{}],\"exposes\":{{\"VK_AMD_anti_lag\":{},\"VK_NV_low_latency2\":{},\"VK_KHR_present_id\":{}}},\"layerExtensions\":[{}],\"enabledExt\":\"{}\",\"features\":\"{}\",\"timestampValidBits\":{},\"gdpa\":{{{}}}}}",
        cycle,
        esc(&dev_name),
        vk::api_version_major(props.api_version),
        vk::api_version_minor(props.api_version),
        vk::api_version_patch(props.api_version),
        a.enum_mode,
        probes.join(","),
        has_antilag,
        has_nvll2,
        has_present_id,
        layer_exts.iter().map(|n| format!("\"{}\"", esc(n))).collect::<Vec<_>>().join(","),
        a.ext,
        a.features,
        ts_bits,
        gdpa_json.join(",")
    ));
    let queue = device.get_device_queue(qf, 0);

    // ---- swapchain
    let caps = chk(surface_i.get_physical_device_surface_capabilities(pd, surface), "surface caps");
    let formats = chk(surface_i.get_physical_device_surface_formats(pd, surface), "surface formats");
    let fmt = formats.iter().copied().find(|f| f.format == vk::Format::B8G8R8A8_UNORM).unwrap_or(formats[0]);
    let modes = chk(surface_i.get_physical_device_surface_present_modes(pd, surface), "present modes");
    let wanted = match a.present.as_str() {
        "fifo" => vk::PresentModeKHR::FIFO,
        "mailbox" => vk::PresentModeKHR::MAILBOX,
        _ => vk::PresentModeKHR::IMMEDIATE,
    };
    let pmode = if modes.contains(&wanted) { wanted } else { vk::PresentModeKHR::FIFO };
    let extent = if caps.current_extent.width != u32::MAX { caps.current_extent } else { vk::Extent2D { width: 320, height: 240 } };
    let mut img_count = (caps.min_image_count + 1).max(2);
    if caps.max_image_count > 0 {
        img_count = img_count.min(caps.max_image_count);
    }
    let swl = SwapchainLatencyCreateInfo { s_type: vk::StructureType::from_raw(ST_SWAPCHAIN_LATENCY_CREATE_INFO), p_next: ptr::null(), latency_mode_enable: vk::TRUE };
    let mut scci = vk::SwapchainCreateInfoKHR::default()
        .surface(surface)
        .min_image_count(img_count)
        .image_format(fmt.format)
        .image_color_space(fmt.color_space)
        .image_extent(extent)
        .image_array_layers(1)
        .image_usage(vk::ImageUsageFlags::COLOR_ATTACHMENT | vk::ImageUsageFlags::TRANSFER_DST)
        .image_sharing_mode(vk::SharingMode::EXCLUSIVE)
        .pre_transform(caps.current_transform)
        .composite_alpha(vk::CompositeAlphaFlagsKHR::OPAQUE)
        .present_mode(pmode)
        .clipped(true);
    if want_nvll2 {
        scci.p_next = &swl as *const _ as *const c_void;
    }
    let swapchain_d = ash::khr::swapchain::Device::new(&instance, &device);
    let swapchain = chk(swapchain_d.create_swapchain(&scci, None), "vkCreateSwapchainKHR");
    let images = chk(swapchain_d.get_swapchain_images(swapchain), "swapchain images");

    // ---- per-frame objects
    const FIF: usize = 2;
    let pool = chk(
        device.create_command_pool(&vk::CommandPoolCreateInfo::default().queue_family_index(qf).flags(vk::CommandPoolCreateFlags::RESET_COMMAND_BUFFER), None),
        "command pool",
    );
    let cmds = chk(device.allocate_command_buffers(&vk::CommandBufferAllocateInfo::default().command_pool(pool).command_buffer_count(FIF as u32)), "alloc cmd");
    let mk_sem = || chk(device.create_semaphore(&vk::SemaphoreCreateInfo::default(), None), "semaphore");
    let acquired: Vec<vk::Semaphore> = (0..FIF).map(|_| mk_sem()).collect();
    let rendered: Vec<vk::Semaphore> = (0..images.len()).map(|_| mk_sem()).collect();
    let fences: Vec<vk::Fence> = (0..FIF).map(|_| chk(device.create_fence(&vk::FenceCreateInfo::default().flags(vk::FenceCreateFlags::SIGNALED), None), "fence")).collect();
    let extra_fence = chk(device.create_fence(&vk::FenceCreateInfo::default(), None), "fence");
    let use_sleep = want_nvll2 && full_features;
    let timeline = if use_sleep {
        let mut tci = vk::SemaphoreTypeCreateInfo::default().semaphore_type(vk::SemaphoreType::TIMELINE).initial_value(0);
        chk(device.create_semaphore(&vk::SemaphoreCreateInfo::default().push_next(&mut tci), None), "timeline semaphore")
    } else {
        vk::Semaphore::null()
    };

    let anti_lag: Option<PfnAntiLagUpdate> = if want_antilag && fns["vkAntiLagUpdateAMD"] != 0 { Some(std::mem::transmute(fns["vkAntiLagUpdateAMD"])) } else { None };
    let set_sleep_mode: Option<PfnSetSleepMode> = if want_nvll2 && fns["vkSetLatencySleepModeNV"] != 0 { Some(std::mem::transmute(fns["vkSetLatencySleepModeNV"])) } else { None };
    let latency_sleep: Option<PfnLatencySleep> = if use_sleep && fns["vkLatencySleepNV"] != 0 { Some(std::mem::transmute(fns["vkLatencySleepNV"])) } else { None };
    let set_marker: Option<PfnSetMarker> = if want_nvll2 && fns["vkSetLatencyMarkerNV"] != 0 { Some(std::mem::transmute(fns["vkSetLatencyMarkerNV"])) } else { None };
    let get_timings: Option<PfnGetTimings> = if want_nvll2 && fns["vkGetLatencyTimingsNV"] != 0 { Some(std::mem::transmute(fns["vkGetLatencyTimingsNV"])) } else { None };
    if let Some(f) = set_sleep_mode {
        let info = LatencySleepModeInfo { s_type: vk::StructureType::from_raw(ST_LATENCY_SLEEP_MODE_INFO), p_next: ptr::null(), low_latency_mode: vk::TRUE, low_latency_boost: vk::TRUE, minimum_interval_us: 0 };
        let r = f(dh, swapchain, &info);
        emit(format!("{{\"event\":\"nv\",\"call\":\"vkSetLatencySleepModeNV\",\"result\":\"{:?}\"}}", r));
    }
    let marker = |id: u64, m: u32| {
        if let Some(f) = set_marker {
            let info = SetLatencyMarkerInfo { s_type: vk::StructureType::from_raw(ST_SET_LATENCY_MARKER_INFO), p_next: ptr::null(), present_id: id, marker: m };
            f(dh, swapchain, &info);
        }
    };
    let anti_lag_update = |stage: u32, idx: u64| {
        if let Some(f) = anti_lag {
            let pi = AntiLagPresentationInfo { s_type: vk::StructureType::from_raw(ST_ANTI_LAG_PRESENTATION), p_next: ptr::null_mut(), stage, frame_index: idx };
            let d = AntiLagData { s_type: vk::StructureType::from_raw(ST_ANTI_LAG_DATA), p_next: ptr::null(), mode: 1, max_fps: 0, p_presentation_info: &pi };
            f(dh, &d);
        }
    };

    // ---- frame loop
    let mut frame_ms: Vec<f64> = Vec::with_capacity(a.frames as usize);
    let mut last = Instant::now();
    let start = Instant::now();
    let snap_at = (a.frames / 10).clamp(1, 200);
    let mut mem_early = (0usize, 0u32);
    let (mut n_v1, mut n_v2, mut n_multi, mut n_empty, mut n_suboptimal, mut n_sleep) = (0u64, 0u64, 0u64, 0u64, 0u64, 0u64);
    let mut tl_value = 0u64;
    for i in 0..a.frames {
        pump();
        let f = (i as usize) % FIF;
        let present_id = i + 1;
        match device.wait_for_fences(&[fences[f]], true, 5_000_000_000) {
            Ok(()) => {}
            Err(e) => fail(&format!("vkWaitForFences frame {}", i), e),
        }
        if let Some(sleep) = latency_sleep {
            tl_value += 1;
            let info = LatencySleepInfo { s_type: vk::StructureType::from_raw(ST_LATENCY_SLEEP_INFO), p_next: ptr::null(), signal_semaphore: timeline, value: tl_value };
            chk_raw(sleep(dh, swapchain, &info), "vkLatencySleepNV");
            let sems = [timeline];
            let vals = [tl_value];
            chk(device.wait_semaphores(&vk::SemaphoreWaitInfo::default().semaphores(&sems).values(&vals), 5_000_000_000), "wait latency sleep semaphore");
            n_sleep += 1;
        }
        anti_lag_update(0, present_id);
        marker(present_id, 0); // SIMULATION_START
        marker(present_id, 1); // SIMULATION_END
        let (img, sub) = match swapchain_d.acquire_next_image(swapchain, 5_000_000_000, acquired[f], vk::Fence::null()) {
            Ok(v) => v,
            Err(e) => fail(&format!("vkAcquireNextImageKHR frame {}", i), e),
        };
        if sub {
            n_suboptimal += 1;
        }
        chk(device.reset_fences(&[fences[f]]), "reset fence");
        let cmd = cmds[f];
        chk(device.reset_command_buffer(cmd, vk::CommandBufferResetFlags::empty()), "reset cmd");
        chk(device.begin_command_buffer(cmd, &vk::CommandBufferBeginInfo::default().flags(vk::CommandBufferUsageFlags::ONE_TIME_SUBMIT)), "begin cmd");
        let range = vk::ImageSubresourceRange::default().aspect_mask(vk::ImageAspectFlags::COLOR).level_count(1).layer_count(1);
        let to_dst = vk::ImageMemoryBarrier::default()
            .src_access_mask(vk::AccessFlags::empty())
            .dst_access_mask(vk::AccessFlags::TRANSFER_WRITE)
            .old_layout(vk::ImageLayout::UNDEFINED)
            .new_layout(vk::ImageLayout::TRANSFER_DST_OPTIMAL)
            .src_queue_family_index(vk::QUEUE_FAMILY_IGNORED)
            .dst_queue_family_index(vk::QUEUE_FAMILY_IGNORED)
            .image(images[img as usize])
            .subresource_range(range);
        device.cmd_pipeline_barrier(cmd, vk::PipelineStageFlags::TRANSFER, vk::PipelineStageFlags::TRANSFER, vk::DependencyFlags::empty(), &[], &[], &[to_dst]);
        let t = (i % 120) as f32 / 120.0;
        let color = vk::ClearColorValue { float32: [t, 0.15, 1.0 - t, 1.0] };
        device.cmd_clear_color_image(cmd, images[img as usize], vk::ImageLayout::TRANSFER_DST_OPTIMAL, &color, &[range]);
        let to_present = vk::ImageMemoryBarrier::default()
            .src_access_mask(vk::AccessFlags::TRANSFER_WRITE)
            .dst_access_mask(vk::AccessFlags::empty())
            .old_layout(vk::ImageLayout::TRANSFER_DST_OPTIMAL)
            .new_layout(vk::ImageLayout::PRESENT_SRC_KHR)
            .src_queue_family_index(vk::QUEUE_FAMILY_IGNORED)
            .dst_queue_family_index(vk::QUEUE_FAMILY_IGNORED)
            .image(images[img as usize])
            .subresource_range(range);
        device.cmd_pipeline_barrier(cmd, vk::PipelineStageFlags::TRANSFER, vk::PipelineStageFlags::BOTTOM_OF_PIPE, vk::DependencyFlags::empty(), &[], &[], &[to_present]);
        chk(device.end_command_buffer(cmd), "end cmd");

        marker(present_id, 2); // RENDERSUBMIT_START
        let use_v2 = match a.submit.as_str() {
            "v1" => false,
            "v2" => true,
            _ => i % 2 == 1,
        };
        let multi = i % 5 == 0; // work and signal in two batches of one call
        let lspi = LatencySubmissionPresentId { s_type: vk::StructureType::from_raw(ST_LATENCY_SUBMISSION_PRESENT_ID), p_next: ptr::null(), present_id };
        let lspi_ptr = if want_nvll2 { &lspi as *const _ as *const c_void } else { ptr::null() };
        if use_v2 {
            n_v2 += 1;
            let wait = [vk::SemaphoreSubmitInfo::default().semaphore(acquired[f]).stage_mask(vk::PipelineStageFlags2::ALL_COMMANDS)];
            let sig = [vk::SemaphoreSubmitInfo::default().semaphore(rendered[img as usize]).stage_mask(vk::PipelineStageFlags2::ALL_COMMANDS)];
            let cbi = [vk::CommandBufferSubmitInfo::default().command_buffer(cmd)];
            let mut s = if multi {
                vec![
                    vk::SubmitInfo2::default().wait_semaphore_infos(&wait).command_buffer_infos(&cbi),
                    vk::SubmitInfo2::default().signal_semaphore_infos(&sig),
                ]
            } else {
                vec![vk::SubmitInfo2::default().wait_semaphore_infos(&wait).command_buffer_infos(&cbi).signal_semaphore_infos(&sig)]
            };
            for x in s.iter_mut() {
                x.p_next = lspi_ptr;
            }
            chk(device.queue_submit2(queue, &s, fences[f]), &format!("vkQueueSubmit2 frame {}", i));
        } else {
            n_v1 += 1;
            let wait = [acquired[f]];
            let stages = [vk::PipelineStageFlags::ALL_COMMANDS];
            let sig = [rendered[img as usize]];
            let cb = [cmd];
            let mut s = if multi {
                vec![
                    vk::SubmitInfo::default().wait_semaphores(&wait).wait_dst_stage_mask(&stages).command_buffers(&cb),
                    vk::SubmitInfo::default().signal_semaphores(&sig),
                ]
            } else {
                vec![vk::SubmitInfo::default().wait_semaphores(&wait).wait_dst_stage_mask(&stages).command_buffers(&cb).signal_semaphores(&sig)]
            };
            for x in s.iter_mut() {
                x.p_next = lspi_ptr;
            }
            chk(device.queue_submit(queue, &s, fences[f]), &format!("vkQueueSubmit frame {}", i));
        }
        if multi {
            n_multi += 1;
        }
        marker(present_id, 3); // RENDERSUBMIT_END
        anti_lag_update(1, present_id);
        marker(present_id, 4); // PRESENT_START
        let wait = [rendered[img as usize]];
        let scs = [swapchain];
        let idx = [img];
        let ids = [present_id];
        let mut pid = vk::PresentIdKHR::default().present_ids(&ids);
        let mut pi = vk::PresentInfoKHR::default().wait_semaphores(&wait).swapchains(&scs).image_indices(&idx);
        if use_present_id {
            pi = pi.push_next(&mut pid);
        }
        match swapchain_d.queue_present(queue, &pi) {
            Ok(sub) => {
                if sub {
                    n_suboptimal += 1
                }
            }
            Err(e) => fail(&format!("vkQueuePresentKHR frame {}", i), e),
        }
        marker(present_id, 5); // PRESENT_END

        // A zero-batch submit that only signals a fence (the layer must pass it through untouched).
        if i % 97 == 50 {
            chk(device.queue_submit(queue, &[], extra_fence), "vkQueueSubmit(0 batches)");
            chk(device.wait_for_fences(&[extra_fence], true, 5_000_000_000), "wait 0-batch fence");
            chk(device.reset_fences(&[extra_fence]), "reset extra fence");
            n_empty += 1;
        }

        let now = Instant::now();
        frame_ms.push((now - last).as_secs_f64() * 1000.0);
        last = now;
        PROGRESS.fetch_add(1, Ordering::Relaxed);
        if i + 1 == snap_at {
            mem_early = mem_snapshot();
        }
        if (i + 1) % 500 == 0 {
            let (m, h) = mem_snapshot();
            emit(format!("{{\"event\":\"progress\",\"cycle\":{},\"frame\":{},\"elapsedS\":{:.2},\"privateMB\":{:.2},\"handles\":{}}}", cycle, i + 1, start.elapsed().as_secs_f64(), m as f64 / 1048576.0, h));
        }
    }
    let total_s = start.elapsed().as_secs_f64();
    chk(device.device_wait_idle(), "vkDeviceWaitIdle");
    let mem_end = mem_snapshot();
    let mut timings_count = -1i64;
    if let Some(f) = get_timings {
        let mut info = GetLatencyMarkerInfo { s_type: vk::StructureType::from_raw(ST_GET_LATENCY_MARKER_INFO), p_next: ptr::null(), timing_count: 0, p_timings: ptr::null_mut() };
        f(dh, swapchain, &mut info);
        timings_count = info.timing_count as i64;
    }

    // ---- stats
    let mut s: Vec<f64> = frame_ms.iter().copied().skip(10).collect();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap());
    let pct = |p: f64| if s.is_empty() { 0.0 } else { s[((s.len() - 1) as f64 * p).round() as usize] };
    let mean = if s.is_empty() { 0.0 } else { s.iter().sum::<f64>() / s.len() as f64 };
    emit(format!(
        "{{\"event\":\"summary\",\"cycle\":{},\"layerDllLoaded\":{},\"ext\":\"{}\",\"submit\":\"{}\",\"presentMode\":\"{:?}\",\"frames\":{},\"seconds\":{:.2},\"fps\":{:.1},\"frameMs\":{{\"mean\":{:.3},\"p50\":{:.3},\"p95\":{:.3},\"p99\":{:.3},\"max\":{:.3}}},\"submits\":{{\"v1\":{},\"v2\":{},\"multiBatch\":{},\"zeroBatch\":{}}},\"latencySleeps\":{},\"latencyTimingsCount\":{},\"suboptimal\":{},\"privateMB\":{{\"atFrame\":{},\"early\":{:.2},\"end\":{:.2},\"delta\":{:.2}}},\"handles\":{{\"early\":{},\"end\":{}}},\"validationErrors\":{}}}",
        cycle,
        layer_dll_loaded(),
        a.ext,
        a.submit,
        pmode,
        a.frames,
        total_s,
        a.frames as f64 / total_s,
        mean,
        pct(0.5),
        pct(0.95),
        pct(0.99),
        s.last().copied().unwrap_or(0.0),
        n_v1,
        n_v2,
        n_multi,
        n_empty,
        n_sleep,
        timings_count,
        n_suboptimal,
        snap_at,
        mem_early.0 as f64 / 1048576.0,
        mem_end.0 as f64 / 1048576.0,
        (mem_end.0 as f64 - mem_early.0 as f64) / 1048576.0,
        mem_early.1,
        mem_end.1,
        VAL_ERRORS.load(Ordering::Relaxed)
    ));

    // ---- teardown (exercises the layer's DestroySwapchain/DestroyDevice/DestroyInstance)
    if timeline != vk::Semaphore::null() {
        device.destroy_semaphore(timeline, None);
    }
    device.destroy_fence(extra_fence, None);
    for &x in &fences {
        device.destroy_fence(x, None);
    }
    for &x in acquired.iter().chain(rendered.iter()) {
        device.destroy_semaphore(x, None);
    }
    device.destroy_command_pool(pool, None);
    swapchain_d.destroy_swapchain(swapchain, None);
    device.destroy_device(None);
    surface_i.destroy_surface(surface, None);
    if messenger != vk::DebugUtilsMessengerEXT::null() {
        debug_utils.destroy_debug_utils_messenger(messenger, None);
    }
    instance.destroy_instance(None);
    PROGRESS.fetch_add(1, Ordering::Relaxed);
    emit(format!("{{\"event\":\"teardown\",\"cycle\":{},\"ok\":true}}", cycle));
}
