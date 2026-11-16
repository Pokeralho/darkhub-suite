#![cfg(windows)]
//! The D3D12 renderer: device, passes and the frame loop. One queue, three frames in flight.
use crate::proof::{self, Hash};
use crate::scene::*;
use std::ffi::c_void;
use std::mem::{size_of, transmute_copy, ManuallyDrop};
use std::time::{Duration, Instant};
use windows::core::*;
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Direct3D::*;
use windows::Win32::Graphics::Direct3D12::*;
use windows::Win32::Graphics::Dxgi::Common::*;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::ProcessStatus::{K32EnumProcessModules, K32GetModuleFileNameExW};
use windows::Win32::System::Threading::{CreateEventW, GetCurrentProcess, WaitForSingleObject, INFINITE};
use windows::Win32::UI::WindowsAndMessaging::*;

const SLOTS: usize = 3;
const SHADOW: u32 = 4096;
const SUB: u32 = 16;
const VERTS: u32 = 6 * SUB * SUB * 6;
const TILE_BYTES: u64 = TILE_COUNT as u64 * 4;
const SET_SHADE: u32 = 0;
const SET_RT: u32 = 1;
const SET_POST: u32 = 2;
const SET_GROUND: u32 = 3;

#[repr(C)]
#[derive(Clone, Copy)]
struct FrameCb {
    view_proj: [[f32; 4]; 4],
    sun_view_proj: [[f32; 4]; 4],
    eye: [f32; 4],
    fwd: [f32; 4],
    right: [f32; 4],
    up: [f32; 4],
    sun: [f32; 4],
    seed: u32,
    frame: u32,
    pad: [u32; 2],
}

#[repr(C)]
#[derive(Clone, Copy)]
struct Instance {
    transform: [f32; 12],
    id_mask: u32,
    contrib_flags: u32,
    blas: u64,
}

pub struct Info {
    pub name: String,
    pub vendor: u32,
    pub device: u32,
    pub vram_mb: u64,
    pub driver: String,
    pub dxr: bool,
}

pub struct Segment {
    pub clock: serde_json::Value,
    pub roots: Vec<Hash>,
    pub frame_us: Vec<u32>,
}

struct Slot {
    alloc: ID3D12CommandAllocator,
    list: ID3D12GraphicsCommandList4,
    tiles: ID3D12Resource,
    fence_value: u64,
    pending: bool,
}

struct Rt {
    tlas: ID3D12Resource,
    scratch: ID3D12Resource,
    blas_addr: u64,
    _blas: ID3D12Resource,
    _verts: ID3D12Resource,
    instances: ID3D12Resource,
    instances_ptr: *mut Instance,
    pso: ID3D12PipelineState,
}

pub struct Gpu {
    pub info: Info,
    hwnd: HWND,
    closed: bool,
    device: ID3D12Device5,
    queue: ID3D12CommandQueue,
    swap: IDXGISwapChain3,
    backbuffers: Vec<ID3D12Resource>,
    fence: ID3D12Fence,
    fence_event: HANDLE,
    fence_next: u64,
    slots: Vec<Slot>,
    root: ID3D12RootSignature,
    pso_shadow: ID3D12PipelineState,
    pso_vis: ID3D12PipelineState,
    pso_ground: ID3D12PipelineState,
    pso_shade: ID3D12PipelineState,
    pso_tiles: ID3D12PipelineState,
    pso_tone: ID3D12PipelineState,
    heap: ID3D12DescriptorHeap,
    inc: u32,
    rtv_heap: ID3D12DescriptorHeap,
    dsv_heap: ID3D12DescriptorHeap,
    ids: ID3D12Resource,
    ids_state: D3D12_RESOURCE_STATES,
    hdr: ID3D12Resource,
    ldr: ID3D12Resource,
    shadow: ID3D12Resource,
    _depth: ID3D12Resource,
    tile_buf: ID3D12Resource,
    cb: ID3D12Resource,
    cb_ptr: *mut u8,
    query: ID3D12QueryHeap,
    query_rb: ID3D12Resource,
    ts_freq: u64,
    rt: Option<Rt>,
}

extern "system" fn wndproc(h: HWND, m: u32, w: WPARAM, l: LPARAM) -> LRESULT {
    unsafe {
        if m == WM_DESTROY { PostQuitMessage(0); return LRESULT(0); }
        DefWindowProcW(h, m, w, l)
    }
}

fn heap_props(t: D3D12_HEAP_TYPE) -> D3D12_HEAP_PROPERTIES {
    D3D12_HEAP_PROPERTIES { Type: t, ..Default::default() }
}

fn buffer_desc(size: u64, flags: D3D12_RESOURCE_FLAGS) -> D3D12_RESOURCE_DESC {
    D3D12_RESOURCE_DESC {
        Dimension: D3D12_RESOURCE_DIMENSION_BUFFER, Width: size, Height: 1, DepthOrArraySize: 1, MipLevels: 1,
        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 }, Layout: D3D12_TEXTURE_LAYOUT_ROW_MAJOR, Flags: flags, ..Default::default()
    }
}

fn tex_desc(w: u32, h: u32, f: DXGI_FORMAT, flags: D3D12_RESOURCE_FLAGS) -> D3D12_RESOURCE_DESC {
    D3D12_RESOURCE_DESC {
        Dimension: D3D12_RESOURCE_DIMENSION_TEXTURE2D, Width: w as u64, Height: h, DepthOrArraySize: 1, MipLevels: 1, Format: f,
        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 }, Flags: flags, ..Default::default()
    }
}

unsafe fn create(d: &ID3D12Device5, t: D3D12_HEAP_TYPE, desc: &D3D12_RESOURCE_DESC, s: D3D12_RESOURCE_STATES, clear: Option<*const D3D12_CLEAR_VALUE>) -> Result<ID3D12Resource> {
    let mut r: Option<ID3D12Resource> = None;
    d.CreateCommittedResource(&heap_props(t), D3D12_HEAP_FLAG_NONE, desc, s, clear, &mut r)?;
    Ok(r.unwrap())
}

fn barrier(r: &ID3D12Resource, before: D3D12_RESOURCE_STATES, after: D3D12_RESOURCE_STATES) -> D3D12_RESOURCE_BARRIER {
    D3D12_RESOURCE_BARRIER {
        Type: D3D12_RESOURCE_BARRIER_TYPE_TRANSITION,
        Flags: D3D12_RESOURCE_BARRIER_FLAG_NONE,
        Anonymous: D3D12_RESOURCE_BARRIER_0 {
            Transition: ManuallyDrop::new(D3D12_RESOURCE_TRANSITION_BARRIER {
                pResource: unsafe { transmute_copy(r) },
                Subresource: D3D12_RESOURCE_BARRIER_ALL_SUBRESOURCES,
                StateBefore: before,
                StateAfter: after,
            }),
        },
    }
}

fn uav_barrier(r: &ID3D12Resource) -> D3D12_RESOURCE_BARRIER {
    D3D12_RESOURCE_BARRIER {
        Type: D3D12_RESOURCE_BARRIER_TYPE_UAV,
        Flags: D3D12_RESOURCE_BARRIER_FLAG_NONE,
        Anonymous: D3D12_RESOURCE_BARRIER_0 { UAV: ManuallyDrop::new(D3D12_RESOURCE_UAV_BARRIER { pResource: unsafe { transmute_copy(r) } }) },
    }
}

fn bytecode(b: &'static [u8]) -> D3D12_SHADER_BYTECODE {
    D3D12_SHADER_BYTECODE { pShaderBytecode: b.as_ptr() as *const c_void, BytecodeLength: b.len() }
}

unsafe fn compute_pso(d: &ID3D12Device5, root: &ID3D12RootSignature, cs: &'static [u8]) -> Result<ID3D12PipelineState> {
    let desc = D3D12_COMPUTE_PIPELINE_STATE_DESC { pRootSignature: transmute_copy(root), CS: bytecode(cs), ..Default::default() };
    d.CreateComputePipelineState(&desc)
}

unsafe fn graphics_pso(d: &ID3D12Device5, root: &ID3D12RootSignature, vs: &'static [u8], ps: Option<&'static [u8]>) -> Result<ID3D12PipelineState> {
    let mut desc = D3D12_GRAPHICS_PIPELINE_STATE_DESC {
        pRootSignature: transmute_copy(root),
        VS: bytecode(vs),
        SampleMask: u32::MAX,
        PrimitiveTopologyType: D3D12_PRIMITIVE_TOPOLOGY_TYPE_TRIANGLE,
        DSVFormat: DXGI_FORMAT_D32_FLOAT,
        SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
        ..Default::default()
    };
    desc.RasterizerState = D3D12_RASTERIZER_DESC { FillMode: D3D12_FILL_MODE_SOLID, CullMode: D3D12_CULL_MODE_NONE, DepthClipEnable: true.into(), ..Default::default() };
    desc.DepthStencilState = D3D12_DEPTH_STENCIL_DESC { DepthEnable: true.into(), DepthWriteMask: D3D12_DEPTH_WRITE_MASK_ALL, DepthFunc: D3D12_COMPARISON_FUNC_LESS, ..Default::default() };
    desc.BlendState.RenderTarget[0].RenderTargetWriteMask = D3D12_COLOR_WRITE_ENABLE_ALL.0 as u8;
    if let Some(ps) = ps {
        desc.PS = bytecode(ps);
        desc.NumRenderTargets = 1;
        desc.RTVFormats[0] = DXGI_FORMAT_R32_UINT;
    }
    d.CreateGraphicsPipelineState(&desc)
}

unsafe fn root_signature(d: &ID3D12Device5) -> Result<ID3D12RootSignature> {
    let srv = D3D12_DESCRIPTOR_RANGE { RangeType: D3D12_DESCRIPTOR_RANGE_TYPE_SRV, NumDescriptors: 2, BaseShaderRegister: 0, RegisterSpace: 0, OffsetInDescriptorsFromTableStart: 0 };
    let uav = D3D12_DESCRIPTOR_RANGE { RangeType: D3D12_DESCRIPTOR_RANGE_TYPE_UAV, NumDescriptors: 2, BaseShaderRegister: 0, RegisterSpace: 0, OffsetInDescriptorsFromTableStart: 0 };
    let params = [
        D3D12_ROOT_PARAMETER { ParameterType: D3D12_ROOT_PARAMETER_TYPE_CBV, Anonymous: D3D12_ROOT_PARAMETER_0 { Descriptor: D3D12_ROOT_DESCRIPTOR { ShaderRegister: 0, RegisterSpace: 0 } }, ShaderVisibility: D3D12_SHADER_VISIBILITY_ALL },
        D3D12_ROOT_PARAMETER { ParameterType: D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE, Anonymous: D3D12_ROOT_PARAMETER_0 { DescriptorTable: D3D12_ROOT_DESCRIPTOR_TABLE { NumDescriptorRanges: 1, pDescriptorRanges: &srv } }, ShaderVisibility: D3D12_SHADER_VISIBILITY_ALL },
        D3D12_ROOT_PARAMETER { ParameterType: D3D12_ROOT_PARAMETER_TYPE_DESCRIPTOR_TABLE, Anonymous: D3D12_ROOT_PARAMETER_0 { DescriptorTable: D3D12_ROOT_DESCRIPTOR_TABLE { NumDescriptorRanges: 1, pDescriptorRanges: &uav } }, ShaderVisibility: D3D12_SHADER_VISIBILITY_ALL },
    ];
    let sampler = D3D12_STATIC_SAMPLER_DESC {
        Filter: D3D12_FILTER_COMPARISON_MIN_MAG_LINEAR_MIP_POINT,
        AddressU: D3D12_TEXTURE_ADDRESS_MODE_BORDER, AddressV: D3D12_TEXTURE_ADDRESS_MODE_BORDER, AddressW: D3D12_TEXTURE_ADDRESS_MODE_BORDER,
        ComparisonFunc: D3D12_COMPARISON_FUNC_LESS_EQUAL, BorderColor: D3D12_STATIC_BORDER_COLOR_OPAQUE_WHITE, MaxLOD: 0.0,
        ShaderRegister: 0, RegisterSpace: 0, ShaderVisibility: D3D12_SHADER_VISIBILITY_ALL, ..Default::default()
    };
    let desc = D3D12_ROOT_SIGNATURE_DESC { NumParameters: 3, pParameters: params.as_ptr(), NumStaticSamplers: 1, pStaticSamplers: &sampler, Flags: D3D12_ROOT_SIGNATURE_FLAG_NONE };
    let mut blob: Option<ID3DBlob> = None;
    D3D12SerializeRootSignature(&desc, D3D_ROOT_SIGNATURE_VERSION_1, &mut blob, None)?;
    let blob = blob.unwrap();
    d.CreateRootSignature(0, std::slice::from_raw_parts(blob.GetBufferPointer() as *const u8, blob.GetBufferSize()))
}

/// Moves the embedded window. Called from the stdin thread: async, so a busy render loop never blocks it.
pub fn place(hwnd: isize, x: i32, y: i32, w: i32, h: i32, visible: bool) {
    unsafe {
        let show = if visible { SWP_SHOWWINDOW } else { SWP_HIDEWINDOW };
        let _ = SetWindowPos(HWND(hwnd as *mut c_void), HWND_TOP, x, y, w.max(1), h.max(1), SWP_NOACTIVATE | SWP_ASYNCWINDOWPOS | show);
    }
}

/// File names (no paths) of everything loaded in this process: shows overlays and injected hooks to a reviewer.
pub fn loaded_modules() -> Vec<String> {
    unsafe {
        let mut mods = [HMODULE::default(); 1024];
        let mut needed = 0u32;
        let proc = GetCurrentProcess();
        if !K32EnumProcessModules(proc, mods.as_mut_ptr(), size_of::<[HMODULE; 1024]>() as u32, &mut needed).as_bool() { return vec![]; }
        let n = (needed as usize / size_of::<HMODULE>()).min(mods.len());
        mods[..n].iter().filter_map(|m| {
            let mut buf = [0u16; 520];
            let len = K32GetModuleFileNameExW(proc, *m, &mut buf) as usize;
            let path = String::from_utf16_lossy(&buf[..len]);
            path.rsplit(['\\', '/']).next().map(str::to_string)
        }).collect()
    }
}

fn dot(a: [f32; 3], b: [f32; 3]) -> f32 { a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

fn sun_dir() -> [f32; 3] {
    let v = [0.45f32, 0.7, 0.35];
    let l = dot(v, v).sqrt();
    [v[0] / l, v[1] / l, v[2] / l]
}

fn frame_cb(seed: u32, frame: u32) -> FrameCb {
    let cam = camera(seed, frame);
    let (f, r, u) = basis(&cam);
    let eye = [cam.eye[0] as f32, cam.eye[1] as f32, cam.eye[2] as f32];
    let (near, far) = (1.0f32, 12000.0f32);
    let (sy, sx) = (0.5f32, 0.5f32 * WIDTH as f32 / HEIGHT as f32);
    let a = far / (far - near);
    let mut vp = [[0f32; 4]; 4];
    for i in 0..3 { vp[i] = [r[i] / sx, u[i] / sy, f[i] * a, f[i]]; }
    vp[3] = [-dot(eye, r) / sx, -dot(eye, u) / sy, -dot(eye, f) * a - near * a, -dot(eye, f)];

    // sun: orthographic over the whole city
    let s = sun_dir();
    let centre = [(GRID * CELL / 2) as f32, 0.0, (GRID * CELL / 2) as f32];
    let sr = { let c = [s[2], 0.0, -s[0]]; let l = dot(c, c).sqrt(); [c[0] / l, 0.0, c[2] / l] };
    let su = [s[1] * sr[2] - s[2] * sr[1], s[2] * sr[0] - s[0] * sr[2], s[0] * sr[1] - s[1] * sr[0]];
    let half = 3200.0f32;
    let mut sv = [[0f32; 4]; 4];
    for i in 0..3 { sv[i] = [sr[i] / half, su[i] / half, -s[i] / (2.0 * half), 0.0]; }
    sv[3] = [-dot(centre, sr) / half, -dot(centre, su) / half, 0.5 + dot(centre, s) / (2.0 * half), 1.0];

    let v4 = |v: [f32; 3]| [v[0], v[1], v[2], 0.0];
    FrameCb { view_proj: vp, sun_view_proj: sv, eye: v4(eye), fwd: v4(f), right: v4(r), up: v4(u), sun: v4(s), seed, frame, pad: [0; 2] }
}

impl Gpu {
    /// `parent`: the app window to render inside. None opens a window of its own (scripts and tests).
    pub fn new(parent: Option<isize>) -> Result<Self> {
        unsafe {
            let factory: IDXGIFactory6 = CreateDXGIFactory2(DXGI_CREATE_FACTORY_FLAGS(0))?;
            let adapter: IDXGIAdapter1 = factory.EnumAdapterByGpuPreference(0, DXGI_GPU_PREFERENCE_HIGH_PERFORMANCE)?;
            let ad = adapter.GetDesc1()?;
            let name = String::from_utf16_lossy(&ad.Description).trim_end_matches('\0').to_string();
            let driver = adapter.CheckInterfaceSupport(&IDXGIDevice::IID).map(|v| {
                let q = v as u64;
                format!("{}.{}.{}.{}", q >> 48, (q >> 32) & 0xffff, (q >> 16) & 0xffff, q & 0xffff)
            }).unwrap_or_default();

            let mut dev: Option<ID3D12Device5> = None;
            D3D12CreateDevice(&adapter, D3D_FEATURE_LEVEL_12_0, &mut dev)?;
            let device = dev.unwrap();
            let mut o5 = D3D12_FEATURE_DATA_D3D12_OPTIONS5::default();
            device.CheckFeatureSupport(D3D12_FEATURE_D3D12_OPTIONS5, &mut o5 as *mut _ as *mut c_void, size_of::<D3D12_FEATURE_DATA_D3D12_OPTIONS5>() as u32)?;
            let dxr = o5.RaytracingTier.0 >= D3D12_RAYTRACING_TIER_1_1.0;

            let queue: ID3D12CommandQueue = device.CreateCommandQueue(&D3D12_COMMAND_QUEUE_DESC { Type: D3D12_COMMAND_LIST_TYPE_DIRECT, ..Default::default() })?;

            let hinst = GetModuleHandleW(None)?;
            let class = w!("DarkHubGpuBench");
            RegisterClassW(&WNDCLASSW { lpfnWndProc: Some(wndproc), hInstance: hinst.into(), lpszClassName: class, hCursor: LoadCursorW(None, IDC_ARROW)?, ..Default::default() });
            let title = w!("DarkHub GPU Benchmark");
            let hwnd = match parent {
                // hidden until the app says where it goes
                Some(p) => CreateWindowExW(WINDOW_EX_STYLE(0), class, title, WS_CHILD | WS_CLIPSIBLINGS, 0, 0, 16, 9, HWND(p as *mut c_void), None, hinst, None)?,
                None => CreateWindowExW(WINDOW_EX_STYLE(0), class, title, WS_OVERLAPPEDWINDOW | WS_VISIBLE, CW_USEDEFAULT, CW_USEDEFAULT, 1296, 759, None, None, hinst, None)?,
            };

            let sd = DXGI_SWAP_CHAIN_DESC1 {
                Width: WIDTH, Height: HEIGHT, Format: DXGI_FORMAT_R8G8B8A8_UNORM, SampleDesc: DXGI_SAMPLE_DESC { Count: 1, Quality: 0 },
                BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT, BufferCount: 3, Scaling: DXGI_SCALING_STRETCH, SwapEffect: DXGI_SWAP_EFFECT_FLIP_DISCARD,
                Flags: DXGI_SWAP_CHAIN_FLAG_ALLOW_TEARING.0 as u32, ..Default::default()
            };
            let swap: IDXGISwapChain3 = factory.CreateSwapChainForHwnd(&queue, hwnd, &sd, None, None)?.cast()?;
            let backbuffers = (0..3).map(|i| swap.GetBuffer::<ID3D12Resource>(i)).collect::<Result<Vec<_>>>()?;

            let root = root_signature(&device)?;
            let pso_shadow = graphics_pso(&device, &root, include_bytes!("../shaders/out/shadow_vs.dxil"), None)?;
            let pso_vis = graphics_pso(&device, &root, include_bytes!("../shaders/out/vis_vs.dxil"), Some(include_bytes!("../shaders/out/vis_ps.dxil")))?;
            let pso_ground = compute_pso(&device, &root, include_bytes!("../shaders/out/ground.dxil"))?;
            let pso_shade = compute_pso(&device, &root, include_bytes!("../shaders/out/shade.dxil"))?;
            let pso_tiles = compute_pso(&device, &root, include_bytes!("../shaders/out/tiles.dxil"))?;
            let pso_tone = compute_pso(&device, &root, include_bytes!("../shaders/out/tone.dxil"))?;

            let uav = D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS;
            let clear_id = D3D12_CLEAR_VALUE { Format: DXGI_FORMAT_R32_UINT, Anonymous: D3D12_CLEAR_VALUE_0 { Color: [0.0; 4] } };
            let clear_d = D3D12_CLEAR_VALUE { Format: DXGI_FORMAT_D32_FLOAT, Anonymous: D3D12_CLEAR_VALUE_0 { DepthStencil: D3D12_DEPTH_STENCIL_VALUE { Depth: 1.0, Stencil: 0 } } };
            let def = D3D12_HEAP_TYPE_DEFAULT;
            let ids = create(&device, def, &tex_desc(WIDTH, HEIGHT, DXGI_FORMAT_R32_UINT, uav | D3D12_RESOURCE_FLAG_ALLOW_RENDER_TARGET), D3D12_RESOURCE_STATE_RENDER_TARGET, Some(&clear_id))?;
            let hdr = create(&device, def, &tex_desc(WIDTH, HEIGHT, DXGI_FORMAT_R16G16B16A16_FLOAT, uav), D3D12_RESOURCE_STATE_UNORDERED_ACCESS, None)?;
            let ldr = create(&device, def, &tex_desc(WIDTH, HEIGHT, DXGI_FORMAT_R8G8B8A8_UNORM, uav), D3D12_RESOURCE_STATE_UNORDERED_ACCESS, None)?;
            let depth = create(&device, def, &tex_desc(WIDTH, HEIGHT, DXGI_FORMAT_D32_FLOAT, D3D12_RESOURCE_FLAG_ALLOW_DEPTH_STENCIL), D3D12_RESOURCE_STATE_DEPTH_WRITE, Some(&clear_d))?;
            let shadow = create(&device, def, &tex_desc(SHADOW, SHADOW, DXGI_FORMAT_R32_TYPELESS, D3D12_RESOURCE_FLAG_ALLOW_DEPTH_STENCIL), D3D12_RESOURCE_STATE_DEPTH_WRITE, Some(&clear_d))?;
            let tile_buf = create(&device, def, &buffer_desc(TILE_BYTES, uav), D3D12_RESOURCE_STATE_UNORDERED_ACCESS, None)?;
            let cb = create(&device, D3D12_HEAP_TYPE_UPLOAD, &buffer_desc(256 * SLOTS as u64, D3D12_RESOURCE_FLAG_NONE), D3D12_RESOURCE_STATE_GENERIC_READ, None)?;
            let mut cb_ptr = std::ptr::null_mut();
            cb.Map(0, None, Some(&mut cb_ptr))?;

            let query: ID3D12QueryHeap = {
                let mut q: Option<ID3D12QueryHeap> = None;
                device.CreateQueryHeap(&D3D12_QUERY_HEAP_DESC { Type: D3D12_QUERY_HEAP_TYPE_TIMESTAMP, Count: 2 * SLOTS as u32, NodeMask: 0 }, &mut q)?;
                q.unwrap()
            };
            let query_rb = create(&device, D3D12_HEAP_TYPE_READBACK, &buffer_desc(16 * SLOTS as u64, D3D12_RESOURCE_FLAG_NONE), D3D12_RESOURCE_STATE_COPY_DEST, None)?;
            let ts_freq = queue.GetTimestampFrequency()?;

            let heap: ID3D12DescriptorHeap = device.CreateDescriptorHeap(&D3D12_DESCRIPTOR_HEAP_DESC { Type: D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV, NumDescriptors: 16, Flags: D3D12_DESCRIPTOR_HEAP_FLAG_SHADER_VISIBLE, NodeMask: 0 })?;
            let rtv_heap: ID3D12DescriptorHeap = device.CreateDescriptorHeap(&D3D12_DESCRIPTOR_HEAP_DESC { Type: D3D12_DESCRIPTOR_HEAP_TYPE_RTV, NumDescriptors: 1, ..Default::default() })?;
            let dsv_heap: ID3D12DescriptorHeap = device.CreateDescriptorHeap(&D3D12_DESCRIPTOR_HEAP_DESC { Type: D3D12_DESCRIPTOR_HEAP_TYPE_DSV, NumDescriptors: 2, ..Default::default() })?;
            let inc = device.GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_CBV_SRV_UAV);
            let dsv_inc = device.GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_DSV) as usize;
            device.CreateRenderTargetView(&ids, None, rtv_heap.GetCPUDescriptorHandleForHeapStart());
            let dsv0 = dsv_heap.GetCPUDescriptorHandleForHeapStart();
            device.CreateDepthStencilView(&depth, None, dsv0);
            let dsv_desc = D3D12_DEPTH_STENCIL_VIEW_DESC { Format: DXGI_FORMAT_D32_FLOAT, ViewDimension: D3D12_DSV_DIMENSION_TEXTURE2D, ..Default::default() };
            device.CreateDepthStencilView(&shadow, Some(&dsv_desc), D3D12_CPU_DESCRIPTOR_HANDLE { ptr: dsv0.ptr + dsv_inc });

            let mut slots = vec![];
            for _ in 0..SLOTS {
                let alloc: ID3D12CommandAllocator = device.CreateCommandAllocator(D3D12_COMMAND_LIST_TYPE_DIRECT)?;
                let list: ID3D12GraphicsCommandList4 = device.CreateCommandList(0, D3D12_COMMAND_LIST_TYPE_DIRECT, &alloc, None)?;
                list.Close()?;
                let tiles = create(&device, D3D12_HEAP_TYPE_READBACK, &buffer_desc(TILE_BYTES, D3D12_RESOURCE_FLAG_NONE), D3D12_RESOURCE_STATE_COPY_DEST, None)?;
                slots.push(Slot { alloc, list, tiles, fence_value: 0, pending: false });
            }
            let fence: ID3D12Fence = device.CreateFence(0, D3D12_FENCE_FLAG_NONE)?;
            let fence_event = CreateEventW(None, false, false, None)?;

            let mut g = Gpu {
                info: Info { name, vendor: ad.VendorId, device: ad.DeviceId, vram_mb: (ad.DedicatedVideoMemory / 1048576) as u64, driver, dxr },
                hwnd, closed: false, device, queue, swap, backbuffers, fence, fence_event, fence_next: 1, slots, root,
                pso_shadow, pso_vis, pso_ground, pso_shade, pso_tiles, pso_tone, heap, inc, rtv_heap, dsv_heap,
                ids, ids_state: D3D12_RESOURCE_STATE_RENDER_TARGET, hdr, ldr, shadow, _depth: depth, tile_buf,
                cb, cb_ptr: cb_ptr as *mut u8, query, query_rb, ts_freq, rt: None,
            };
            if dxr { g.init_rt()?; }
            g.write_descriptors();
            Ok(g)
        }
    }

    unsafe fn cpu_handle(&self, i: u32) -> D3D12_CPU_DESCRIPTOR_HANDLE {
        D3D12_CPU_DESCRIPTOR_HANDLE { ptr: self.heap.GetCPUDescriptorHandleForHeapStart().ptr + (i * self.inc) as usize }
    }
    unsafe fn gpu_handle(&self, i: u32) -> D3D12_GPU_DESCRIPTOR_HANDLE {
        D3D12_GPU_DESCRIPTOR_HANDLE { ptr: self.heap.GetGPUDescriptorHandleForHeapStart().ptr + (i * self.inc) as u64 }
    }

    /// Four descriptors per set: two SRVs then two UAVs. Slots a pass does not use hold null views.
    unsafe fn write_descriptors(&self) {
        let d = &self.device;
        let tex_srv = |f: DXGI_FORMAT| D3D12_SHADER_RESOURCE_VIEW_DESC {
            Format: f, ViewDimension: D3D12_SRV_DIMENSION_TEXTURE2D, Shader4ComponentMapping: D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING,
            Anonymous: D3D12_SHADER_RESOURCE_VIEW_DESC_0 { Texture2D: D3D12_TEX2D_SRV { MipLevels: 1, ..Default::default() } },
        };
        let tex_uav = |f: DXGI_FORMAT| D3D12_UNORDERED_ACCESS_VIEW_DESC { Format: f, ViewDimension: D3D12_UAV_DIMENSION_TEXTURE2D, ..Default::default() };
        let (u32f, f32f, hf, lf) = (DXGI_FORMAT_R32_UINT, DXGI_FORMAT_R32_FLOAT, DXGI_FORMAT_R16G16B16A16_FLOAT, DXGI_FORMAT_R8G8B8A8_UNORM);
        let set = |s: u32, slot: u32| self.cpu_handle(s * 4 + slot);

        d.CreateShaderResourceView(&self.ids, Some(&tex_srv(u32f)), set(SET_SHADE, 0));
        d.CreateShaderResourceView(&self.shadow, Some(&tex_srv(f32f)), set(SET_SHADE, 1));
        d.CreateUnorderedAccessView(&self.hdr, None, Some(&tex_uav(hf)), set(SET_SHADE, 2));
        d.CreateUnorderedAccessView(None, None, Some(&tex_uav(hf)), set(SET_SHADE, 3));

        if let Some(rt) = &self.rt {
            let v = D3D12_SHADER_RESOURCE_VIEW_DESC {
                ViewDimension: D3D12_SRV_DIMENSION_RAYTRACING_ACCELERATION_STRUCTURE, Shader4ComponentMapping: D3D12_DEFAULT_SHADER_4_COMPONENT_MAPPING,
                Anonymous: D3D12_SHADER_RESOURCE_VIEW_DESC_0 { RaytracingAccelerationStructure: D3D12_RAYTRACING_ACCELERATION_STRUCTURE_SRV { Location: rt.tlas.GetGPUVirtualAddress() } },
                ..Default::default()
            };
            d.CreateShaderResourceView(None, Some(&v), set(SET_RT, 0));
        }
        d.CreateShaderResourceView(None, Some(&tex_srv(u32f)), set(SET_RT, 1));
        d.CreateUnorderedAccessView(&self.ids, None, Some(&tex_uav(u32f)), set(SET_RT, 2));
        d.CreateUnorderedAccessView(&self.hdr, None, Some(&tex_uav(hf)), set(SET_RT, 3));

        d.CreateShaderResourceView(&self.ids, Some(&tex_srv(u32f)), set(SET_POST, 0));
        d.CreateShaderResourceView(&self.hdr, Some(&tex_srv(hf)), set(SET_POST, 1));
        let tiles = D3D12_UNORDERED_ACCESS_VIEW_DESC {
            ViewDimension: D3D12_UAV_DIMENSION_BUFFER,
            Anonymous: D3D12_UNORDERED_ACCESS_VIEW_DESC_0 { Buffer: D3D12_BUFFER_UAV { NumElements: TILE_COUNT, StructureByteStride: 4, ..Default::default() } },
            ..Default::default()
        };
        d.CreateUnorderedAccessView(&self.tile_buf, None, Some(&tiles), set(SET_POST, 2));
        d.CreateUnorderedAccessView(&self.ldr, None, Some(&tex_uav(lf)), set(SET_POST, 3));

        d.CreateShaderResourceView(None, Some(&tex_srv(u32f)), set(SET_GROUND, 0));
        d.CreateShaderResourceView(None, Some(&tex_srv(u32f)), set(SET_GROUND, 1));
        d.CreateUnorderedAccessView(&self.ids, None, Some(&tex_uav(u32f)), set(SET_GROUND, 2));
        d.CreateUnorderedAccessView(None, None, Some(&tex_uav(u32f)), set(SET_GROUND, 3));
    }

    unsafe fn init_rt(&mut self) -> Result<()> {
        let d = self.device.clone();
        // unit cube with every face subdivided: same planes as the raster test, but a real BVH to walk.
        // Each box is an instance scaled to its bounds.
        const F: [[[f32; 3]; 4]; 6] = [
            [[1.,0.,0.],[1.,1.,0.],[1.,1.,1.],[1.,0.,1.]], [[0.,0.,1.],[0.,1.,1.],[0.,1.,0.],[0.,0.,0.]],
            [[0.,1.,0.],[0.,1.,1.],[1.,1.,1.],[1.,1.,0.]], [[0.,0.,1.],[0.,0.,0.],[1.,0.,0.],[1.,0.,1.]],
            [[1.,0.,1.],[1.,1.,1.],[0.,1.,1.],[0.,0.,1.]], [[0.,0.,0.],[0.,1.,0.],[1.,1.,0.],[1.,0.,0.]],
        ];
        let mut tris: Vec<[f32; 3]> = vec![];
        for f in F {
            let at = |u: f32, v: f32| -> [f32; 3] {
                let mut o = [0f32; 3];
                for i in 0..3 { o[i] = f[0][i] + (f[1][i] - f[0][i]) * u + (f[3][i] - f[0][i]) * v; }
                o
            };
            let n = SUB as f32;
            for y in 0..SUB {
                for x in 0..SUB {
                    let (u0, v0, u1, v1) = (x as f32 / n, y as f32 / n, (x + 1) as f32 / n, (y + 1) as f32 / n);
                    tris.extend_from_slice(&[at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v0), at(u1, v1), at(u0, v1)]);
                }
            }
        }
        let bytes = (tris.len() * 12) as u64;
        let verts = create(&d, D3D12_HEAP_TYPE_UPLOAD, &buffer_desc(bytes, D3D12_RESOURCE_FLAG_NONE), D3D12_RESOURCE_STATE_GENERIC_READ, None)?;
        let mut p = std::ptr::null_mut();
        verts.Map(0, None, Some(&mut p))?;
        std::ptr::copy_nonoverlapping(tris.as_ptr() as *const u8, p as *mut u8, bytes as usize);
        verts.Unmap(0, None);

        let geom = D3D12_RAYTRACING_GEOMETRY_DESC {
            Type: D3D12_RAYTRACING_GEOMETRY_TYPE_TRIANGLES, Flags: D3D12_RAYTRACING_GEOMETRY_FLAG_OPAQUE,
            Anonymous: D3D12_RAYTRACING_GEOMETRY_DESC_0 { Triangles: D3D12_RAYTRACING_GEOMETRY_TRIANGLES_DESC {
                VertexFormat: DXGI_FORMAT_R32G32B32_FLOAT, VertexCount: tris.len() as u32,
                VertexBuffer: D3D12_GPU_VIRTUAL_ADDRESS_AND_STRIDE { StartAddress: verts.GetGPUVirtualAddress(), StrideInBytes: 12 },
                ..Default::default()
            } },
        };
        let blas_in = D3D12_BUILD_RAYTRACING_ACCELERATION_STRUCTURE_INPUTS {
            Type: D3D12_RAYTRACING_ACCELERATION_STRUCTURE_TYPE_BOTTOM_LEVEL, Flags: D3D12_RAYTRACING_ACCELERATION_STRUCTURE_BUILD_FLAG_PREFER_FAST_TRACE,
            NumDescs: 1, DescsLayout: D3D12_ELEMENTS_LAYOUT_ARRAY,
            Anonymous: D3D12_BUILD_RAYTRACING_ACCELERATION_STRUCTURE_INPUTS_0 { pGeometryDescs: &geom },
        };
        let tlas_in = |addr: u64| D3D12_BUILD_RAYTRACING_ACCELERATION_STRUCTURE_INPUTS {
            Type: D3D12_RAYTRACING_ACCELERATION_STRUCTURE_TYPE_TOP_LEVEL, Flags: D3D12_RAYTRACING_ACCELERATION_STRUCTURE_BUILD_FLAG_PREFER_FAST_TRACE,
            NumDescs: BOXES, DescsLayout: D3D12_ELEMENTS_LAYOUT_ARRAY,
            Anonymous: D3D12_BUILD_RAYTRACING_ACCELERATION_STRUCTURE_INPUTS_0 { InstanceDescs: addr },
        };
        let mut bi = Default::default();
        let mut ti = Default::default();
        d.GetRaytracingAccelerationStructurePrebuildInfo(&blas_in, &mut bi);
        d.GetRaytracingAccelerationStructurePrebuildInfo(&tlas_in(0), &mut ti);
        let uav = D3D12_RESOURCE_FLAG_ALLOW_UNORDERED_ACCESS;
        let as_state = D3D12_RESOURCE_STATE_RAYTRACING_ACCELERATION_STRUCTURE;
        let blas = create(&d, D3D12_HEAP_TYPE_DEFAULT, &buffer_desc(bi.ResultDataMaxSizeInBytes, uav), as_state, None)?;
        let tlas = create(&d, D3D12_HEAP_TYPE_DEFAULT, &buffer_desc(ti.ResultDataMaxSizeInBytes, uav), as_state, None)?;
        let scratch = create(&d, D3D12_HEAP_TYPE_DEFAULT, &buffer_desc(bi.ScratchDataSizeInBytes.max(ti.ScratchDataSizeInBytes), uav), D3D12_RESOURCE_STATE_UNORDERED_ACCESS, None)?;
        let inst_bytes = (BOXES as usize * size_of::<Instance>() * SLOTS) as u64;
        let instances = create(&d, D3D12_HEAP_TYPE_UPLOAD, &buffer_desc(inst_bytes, D3D12_RESOURCE_FLAG_NONE), D3D12_RESOURCE_STATE_GENERIC_READ, None)?;
        let mut ip = std::ptr::null_mut();
        instances.Map(0, None, Some(&mut ip))?;

        let s = &self.slots[0];
        s.alloc.Reset()?;
        s.list.Reset(&s.alloc, None)?;
        let build = D3D12_BUILD_RAYTRACING_ACCELERATION_STRUCTURE_DESC {
            DestAccelerationStructureData: blas.GetGPUVirtualAddress(), Inputs: blas_in,
            ScratchAccelerationStructureData: scratch.GetGPUVirtualAddress(), ..Default::default()
        };
        s.list.BuildRaytracingAccelerationStructure(&build, None);
        s.list.Close()?;
        self.queue.ExecuteCommandLists(&[Some(s.list.cast()?)]);
        self.wait_idle()?;

        let pso = compute_pso(&d, &self.root, include_bytes!("../shaders/out/rt.dxil"))?;
        self.rt = Some(Rt { blas_addr: blas.GetGPUVirtualAddress(), _blas: blas, _verts: verts, tlas, scratch, instances, instances_ptr: ip as *mut Instance, pso });
        Ok(())
    }

    unsafe fn wait_value(&self, v: u64) -> Result<()> {
        if self.fence.GetCompletedValue() < v {
            self.fence.SetEventOnCompletion(v, self.fence_event)?;
            WaitForSingleObject(self.fence_event, INFINITE);
        }
        Ok(())
    }

    unsafe fn wait_idle(&mut self) -> Result<()> {
        let v = self.fence_next;
        self.fence_next += 1;
        self.queue.Signal(&self.fence, v)?;
        self.wait_value(v)
    }

    pub fn hwnd_raw(&self) -> isize { self.hwnd.0 as isize }

    pub fn pump(&mut self) -> bool {
        unsafe {
            let mut m = MSG::default();
            while PeekMessageW(&mut m, None, 0, 0, PM_REMOVE).as_bool() {
                if m.message == WM_QUIT { self.closed = true; }
                let _ = TranslateMessage(&m);
                DispatchMessageW(&m);
            }
        }
        !self.closed
    }

    unsafe fn ids_to(&mut self, list: &ID3D12GraphicsCommandList4, s: D3D12_RESOURCE_STATES) {
        if self.ids_state != s {
            list.ResourceBarrier(&[barrier(&self.ids, self.ids_state, s)]);
            self.ids_state = s;
        }
    }

    unsafe fn record(&mut self, slot: usize, rt_test: bool, seed: u32, frame: u32) -> Result<()> {
        let list = self.slots[slot].list.clone();
        let alloc = self.slots[slot].alloc.clone();
        alloc.Reset()?;
        list.Reset(&alloc, None)?;

        let cb = frame_cb(seed, frame);
        std::ptr::copy_nonoverlapping(&cb as *const FrameCb as *const u8, self.cb_ptr.add(slot * 256), size_of::<FrameCb>());
        let cb_addr = self.cb.GetGPUVirtualAddress() + (slot * 256) as u64;

        list.SetDescriptorHeaps(&[Some(self.heap.clone())]);
        list.SetComputeRootSignature(&self.root);
        list.SetGraphicsRootSignature(&self.root);
        list.SetComputeRootConstantBufferView(0, cb_addr);
        list.SetGraphicsRootConstantBufferView(0, cb_addr);
        list.EndQuery(&self.query, D3D12_QUERY_TYPE_TIMESTAMP, slot as u32 * 2);

        let (gx, gy) = (WIDTH / 8, HEIGHT / 8);
        let npsr = D3D12_RESOURCE_STATE_NON_PIXEL_SHADER_RESOURCE;
        let uav = D3D12_RESOURCE_STATE_UNORDERED_ACCESS;
        if rt_test {
            self.ids_to(&list, uav);
            let rt = self.rt.as_ref().unwrap();
            let base = slot * BOXES as usize;
            for i in 0..BOXES {
                let b = box_at(seed, frame, i % GRID, i / GRID);
                let (x, y, z) = (b.min[0] as f32, b.min[1] as f32, b.min[2] as f32);
                let (sx, sy, sz) = ((b.max[0] - b.min[0]) as f32, (b.max[1] - b.min[1]) as f32, (b.max[2] - b.min[2]) as f32);
                *rt.instances_ptr.add(base + i as usize) = Instance { transform: [sx, 0., 0., x, 0., sy, 0., y, 0., 0., sz, z], id_mask: i | (0xff << 24), contrib_flags: 0, blas: rt.blas_addr };
            }
            let inputs = D3D12_BUILD_RAYTRACING_ACCELERATION_STRUCTURE_INPUTS {
                Type: D3D12_RAYTRACING_ACCELERATION_STRUCTURE_TYPE_TOP_LEVEL, Flags: D3D12_RAYTRACING_ACCELERATION_STRUCTURE_BUILD_FLAG_PREFER_FAST_TRACE,
                NumDescs: BOXES, DescsLayout: D3D12_ELEMENTS_LAYOUT_ARRAY,
                Anonymous: D3D12_BUILD_RAYTRACING_ACCELERATION_STRUCTURE_INPUTS_0 { InstanceDescs: rt.instances.GetGPUVirtualAddress() + (base * size_of::<Instance>()) as u64 },
            };
            let build = D3D12_BUILD_RAYTRACING_ACCELERATION_STRUCTURE_DESC {
                DestAccelerationStructureData: rt.tlas.GetGPUVirtualAddress(), Inputs: inputs,
                ScratchAccelerationStructureData: rt.scratch.GetGPUVirtualAddress(), ..Default::default()
            };
            list.BuildRaytracingAccelerationStructure(&build, None);
            list.ResourceBarrier(&[uav_barrier(&rt.tlas)]);
            list.SetPipelineState(&rt.pso);
            list.SetComputeRootDescriptorTable(1, self.gpu_handle(SET_RT * 4));
            list.SetComputeRootDescriptorTable(2, self.gpu_handle(SET_RT * 4 + 2));
            list.Dispatch(gx, gy, 1);
            self.ids_to(&list, npsr);
            list.ResourceBarrier(&[barrier(&self.hdr, uav, npsr)]);
        } else {
            self.ids_to(&list, D3D12_RESOURCE_STATE_RENDER_TARGET);
            let dsv0 = self.dsv_heap.GetCPUDescriptorHandleForHeapStart();
            let dsv1 = D3D12_CPU_DESCRIPTOR_HANDLE { ptr: dsv0.ptr + self.device.GetDescriptorHandleIncrementSize(D3D12_DESCRIPTOR_HEAP_TYPE_DSV) as usize };
            let rtv = self.rtv_heap.GetCPUDescriptorHandleForHeapStart();
            list.IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);

            // sun shadow map
            let sv = D3D12_VIEWPORT { Width: SHADOW as f32, Height: SHADOW as f32, MaxDepth: 1.0, ..Default::default() };
            let sr = RECT { right: SHADOW as i32, bottom: SHADOW as i32, ..Default::default() };
            list.RSSetViewports(&[sv]);
            list.RSSetScissorRects(&[sr]);
            list.ClearDepthStencilView(dsv1, D3D12_CLEAR_FLAG_DEPTH, 1.0, 0, &[]);
            list.OMSetRenderTargets(0, None, false, Some(&dsv1));
            list.SetPipelineState(&self.pso_shadow);
            list.DrawInstanced(VERTS, BOXES, 0, 0);
            list.ResourceBarrier(&[barrier(&self.shadow, D3D12_RESOURCE_STATE_DEPTH_WRITE, npsr)]);

            // visibility
            let v = D3D12_VIEWPORT { Width: WIDTH as f32, Height: HEIGHT as f32, MaxDepth: 1.0, ..Default::default() };
            let r = RECT { right: WIDTH as i32, bottom: HEIGHT as i32, ..Default::default() };
            list.RSSetViewports(&[v]);
            list.RSSetScissorRects(&[r]);
            list.ClearRenderTargetView(rtv, &[0.0; 4], None);
            list.ClearDepthStencilView(dsv0, D3D12_CLEAR_FLAG_DEPTH, 1.0, 0, &[]);
            list.OMSetRenderTargets(1, Some(&rtv), false, Some(&dsv0));
            list.SetPipelineState(&self.pso_vis);
            list.DrawInstanced(VERTS, BOXES, 0, 0);

            // resolve empty pixels to ground or sky
            self.ids_to(&list, uav);
            list.SetPipelineState(&self.pso_ground);
            list.SetComputeRootDescriptorTable(1, self.gpu_handle(SET_GROUND * 4));
            list.SetComputeRootDescriptorTable(2, self.gpu_handle(SET_GROUND * 4 + 2));
            list.Dispatch(gx, gy, 1);
            self.ids_to(&list, npsr);

            // shade
            list.SetPipelineState(&self.pso_shade);
            list.SetComputeRootDescriptorTable(1, self.gpu_handle(SET_SHADE * 4));
            list.SetComputeRootDescriptorTable(2, self.gpu_handle(SET_SHADE * 4 + 2));
            list.Dispatch(gx, gy, 1);
            list.ResourceBarrier(&[barrier(&self.hdr, uav, npsr), barrier(&self.shadow, npsr, D3D12_RESOURCE_STATE_DEPTH_WRITE)]);
        }

        // commitment and tone map, common to both tests
        list.SetComputeRootDescriptorTable(1, self.gpu_handle(SET_POST * 4));
        list.SetComputeRootDescriptorTable(2, self.gpu_handle(SET_POST * 4 + 2));
        list.SetPipelineState(&self.pso_tiles);
        list.Dispatch(TILE_COUNT.div_ceil(64), 1, 1);
        list.SetPipelineState(&self.pso_tone);
        list.Dispatch(gx, gy, 1);

        let bb = self.backbuffers[self.swap.GetCurrentBackBufferIndex() as usize].clone();
        let (src, dst, present) = (D3D12_RESOURCE_STATE_COPY_SOURCE, D3D12_RESOURCE_STATE_COPY_DEST, D3D12_RESOURCE_STATE_PRESENT);
        list.ResourceBarrier(&[barrier(&self.ldr, uav, src), barrier(&bb, present, dst), barrier(&self.tile_buf, uav, src)]);
        list.CopyResource(&bb, &self.ldr);
        list.CopyBufferRegion(&self.slots[slot].tiles, 0, &self.tile_buf, 0, TILE_BYTES);
        list.ResourceBarrier(&[barrier(&self.ldr, src, uav), barrier(&bb, dst, present), barrier(&self.tile_buf, src, uav), barrier(&self.hdr, npsr, uav)]);
        list.EndQuery(&self.query, D3D12_QUERY_TYPE_TIMESTAMP, slot as u32 * 2 + 1);
        list.ResolveQueryData(&self.query, D3D12_QUERY_TYPE_TIMESTAMP, slot as u32 * 2, 2, &self.query_rb, slot as u64 * 16);
        list.Close()?;
        Ok(())
    }

    unsafe fn submit(&mut self, slot: usize) -> Result<()> {
        self.queue.ExecuteCommandLists(&[Some(self.slots[slot].list.cast()?)]);
        self.swap.Present(0, DXGI_PRESENT_ALLOW_TEARING).ok()?;
        let v = self.fence_next;
        self.fence_next += 1;
        self.queue.Signal(&self.fence, v)?;
        self.slots[slot].fence_value = v;
        self.slots[slot].pending = true;
        Ok(())
    }

    /// Reads a finished slot: its frame's commitment and GPU time.
    unsafe fn collect(&mut self, slot: usize) -> Result<(Hash, u32)> {
        self.wait_value(self.slots[slot].fence_value)?;
        self.slots[slot].pending = false;
        let mut p = std::ptr::null_mut();
        let t = &self.slots[slot].tiles;
        t.Map(0, Some(&D3D12_RANGE { Begin: 0, End: TILE_BYTES as usize }), Some(&mut p))?;
        let root = proof::frame_root(std::slice::from_raw_parts(p as *const u8, TILE_BYTES as usize));
        t.Unmap(0, None);
        let mut q = std::ptr::null_mut();
        let range = D3D12_RANGE { Begin: slot * 16, End: slot * 16 + 16 };
        self.query_rb.Map(0, Some(&range), Some(&mut q))?;
        let ts = std::slice::from_raw_parts((q as *const u8).add(slot * 16) as *const u64, 2);
        let us = (ts[1].saturating_sub(ts[0]) as u128 * 1_000_000 / self.ts_freq as u128) as u32;
        self.query_rb.Unmap(0, None);
        Ok((root, us))
    }

    /// The GPU's timestamp counter now, in seconds (the driver samples it together with the CPU clock).
    fn gpu_clock(&self) -> Option<f64> {
        unsafe {
            let (mut gpu, mut cpu) = (0u64, 0u64);
            self.queue.GetClockCalibration(&mut gpu, &mut cpu).ok()?;
            Some(gpu as f64 / self.ts_freq as f64)
        }
    }

    /// Renders for `dur`. None when the window was closed.
    pub fn segment(&mut self, rt: bool, seed: u32, dur: Duration) -> Result<Option<Segment>> {
        unsafe {
            let (mut roots, mut frame_us) = (vec![], vec![]);
            let (clock0, gpu0) = (crate::audit::clocks(), self.gpu_clock());
            let started = Instant::now();
            let mut frame = 0u32;
            let (mut tick_at, mut tick_frame) = (Instant::now(), 0u32);
            while started.elapsed() < dur {
                if tick_at.elapsed() >= Duration::from_millis(500) {
                    let fps = (frame - tick_frame) as f64 / tick_at.elapsed().as_secs_f64();
                    crate::say(serde_json::json!({"type": "tick", "fps": (fps * 10.0).round() / 10.0, "frame": frame}));
                    (tick_at, tick_frame) = (Instant::now(), frame);
                }
                if !self.pump() { self.wait_idle()?; return Ok(None); }
                let slot = frame as usize % SLOTS;
                if self.slots[slot].pending {
                    let (r, us) = self.collect(slot)?;
                    roots.push(r);
                    frame_us.push(us);
                }
                self.record(slot, rt, seed, frame)?;
                self.submit(slot)?;
                frame += 1;
            }
            // oldest first, so the roots stay in frame order
            for i in 0..SLOTS {
                let slot = (frame as usize + i) % SLOTS;
                if self.slots[slot].pending {
                    let (r, us) = self.collect(slot)?;
                    roots.push(r);
                    frame_us.push(us);
                }
            }
            let gpu_ms = match (gpu0, self.gpu_clock()) { (Some(a), Some(b)) => Some((b - a) * 1000.0), _ => None };
            let clock = crate::audit::clock_report(clock0, crate::audit::clocks(), gpu_ms);
            Ok(Some(Segment { roots, frame_us, clock }))
        }
    }

    /// Renders one frame again and returns its raw IDs and tile hashes.
    pub fn capture(&mut self, rt: bool, seed: u32, frame: u32) -> Result<(Vec<u32>, Vec<u32>)> {
        unsafe {
            self.record(0, rt, seed, frame)?;
            self.submit(0)?;
            self.collect(0)?;
            let mut hashes = vec![0u32; TILE_COUNT as usize];
            let mut p = std::ptr::null_mut();
            self.slots[0].tiles.Map(0, Some(&D3D12_RANGE { Begin: 0, End: TILE_BYTES as usize }), Some(&mut p))?;
            std::ptr::copy_nonoverlapping(p as *const u32, hashes.as_mut_ptr(), TILE_COUNT as usize);
            self.slots[0].tiles.Unmap(0, None);

            let ids_res = self.ids.clone();
            let state = self.ids_state;
            let bytes = self.read_texture(&ids_res, state, 4)?;
            let ids = bytes.chunks_exact(4).map(|c| u32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
            Ok((ids, hashes))
        }
    }

    pub fn read_ldr(&mut self) -> Result<Vec<u8>> {
        unsafe {
            let ldr = self.ldr.clone();
            self.read_texture(&ldr, D3D12_RESOURCE_STATE_UNORDERED_ACCESS, 4)
        }
    }

    /// Copies a WIDTH x HEIGHT texture to the CPU. The row pitch (10240) is already 256-aligned.
    unsafe fn read_texture(&mut self, tex: &ID3D12Resource, state: D3D12_RESOURCE_STATES, bpp: u32) -> Result<Vec<u8>> {
        let size = WIDTH as u64 * HEIGHT as u64 * bpp as u64;
        let rb = create(&self.device, D3D12_HEAP_TYPE_READBACK, &buffer_desc(size, D3D12_RESOURCE_FLAG_NONE), D3D12_RESOURCE_STATE_COPY_DEST, None)?;
        let s = &self.slots[1];
        self.wait_value(s.fence_value)?;
        s.alloc.Reset()?;
        s.list.Reset(&s.alloc, None)?;
        let src_state = D3D12_RESOURCE_STATE_COPY_SOURCE;
        s.list.ResourceBarrier(&[barrier(tex, state, src_state)]);
        let format = tex.GetDesc().Format;
        let dst = D3D12_TEXTURE_COPY_LOCATION {
            pResource: transmute_copy(&rb), Type: D3D12_TEXTURE_COPY_TYPE_PLACED_FOOTPRINT,
            Anonymous: D3D12_TEXTURE_COPY_LOCATION_0 { PlacedFootprint: D3D12_PLACED_SUBRESOURCE_FOOTPRINT {
                Offset: 0, Footprint: D3D12_SUBRESOURCE_FOOTPRINT { Format: format, Width: WIDTH, Height: HEIGHT, Depth: 1, RowPitch: WIDTH * bpp },
            } },
        };
        let src = D3D12_TEXTURE_COPY_LOCATION { pResource: transmute_copy(tex), Type: D3D12_TEXTURE_COPY_TYPE_SUBRESOURCE_INDEX, Anonymous: D3D12_TEXTURE_COPY_LOCATION_0 { SubresourceIndex: 0 } };
        s.list.CopyTextureRegion(&dst, 0, 0, 0, &src, None);
        s.list.ResourceBarrier(&[barrier(tex, src_state, state)]);
        s.list.Close()?;
        self.queue.ExecuteCommandLists(&[Some(s.list.cast()?)]);
        self.wait_idle()?;
        let mut p = std::ptr::null_mut();
        rb.Map(0, Some(&D3D12_RANGE { Begin: 0, End: size as usize }), Some(&mut p))?;
        let out = std::slice::from_raw_parts(p as *const u8, size as usize).to_vec();
        rb.Unmap(0, None);
        Ok(out)
    }
}

impl Drop for Gpu {
    fn drop(&mut self) {
        unsafe {
            let _ = self.wait_idle();
            let _ = DestroyWindow(self.hwnd);
        }
    }
}
