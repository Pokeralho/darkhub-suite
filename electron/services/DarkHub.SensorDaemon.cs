using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;
using System.Threading;

public class DarkHubSensorDaemon {
    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    private static extern uint PdhOpenQueryW(string szDataSource, IntPtr dwUserData, out IntPtr phQuery);

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    private static extern uint PdhAddEnglishCounterW(IntPtr hQuery, string szFullCounterPath, IntPtr dwUserData, out IntPtr phCounter);

    [DllImport("pdh.dll")]
    private static extern uint PdhCollectQueryData(IntPtr hQuery);

    [DllImport("pdh.dll")]
    private static extern uint PdhGetFormattedCounterValue(IntPtr hCounter, uint dwFormat, out uint lpdwType, out PDH_FMT_COUNTERVALUE pValue);

    [DllImport("pdh.dll", CharSet = CharSet.Unicode)]
    private static extern uint PdhGetFormattedCounterArrayW(IntPtr hCounter, uint dwFormat, ref uint lpdwBufferSize, ref uint lpdwItemCount, IntPtr ItemBuffer);

    [DllImport("pdh.dll")]
    private static extern uint PdhCloseQuery(IntPtr hQuery);

    [StructLayout(LayoutKind.Explicit)]
    private struct PDH_FMT_COUNTERVALUE {
        [FieldOffset(0)] public uint CStatus;
        [FieldOffset(8)] public double doubleValue;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    private struct CoreTempData {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public uint[] uiLoad;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 128)] public uint[] uiTjMax;
        public uint uiCoreCnt;
        public uint uiCPUCnt;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 256)] public float[] fTemp;
        public float fVID;
        public float fCPUSpeed;
        public float fFSBSpeed;
        public float fMultiplier;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 100)] public byte[] sCPUName;
        public byte ucFahrenheit;
        public byte ucDeltaToTjMax;
    }

    private const uint PDH_FMT_DOUBLE = 0x00000200;
    private const uint PDH_FMT_NOCAP100 = 0x00008000;
    private const uint PDH_MORE_DATA = 0x800007D2;

    // PDH_FMT_COUNTERVALUE_ITEM_W = { LPWSTR szName; PDH_FMT_COUNTERVALUE FmtValue; }. FmtValue holds a
    // double, so it is 8-aligned on x86 too: CStatus @8, value @16, stride 24 on BOTH x86 and x64.
    // (The previous IntPtr.Size-based math gave stride 20 / offset 12 on a 32-bit build.)
    private const int PDH_ITEM_STRIDE = 24;
    private const int PDH_ITEM_STATUS_OFFSET = 8;
    private const int PDH_ITEM_VALUE_OFFSET = 16;

    // PDH_CSTATUS_VALID_DATA (0) / PDH_CSTATUS_NEW_DATA (1); anything else is not a real sample.
    private static bool ItemValid(IntPtr item) {
        uint st = (uint)Marshal.ReadInt32(item, PDH_ITEM_STATUS_OFFSET);
        return st == 0 || st == 1;
    }

    private static float ReadCoreTemp() {
        try {
            using (var mmf = MemoryMappedFile.OpenExisting("CoreTempMapping")) {
                using (var a = mmf.CreateViewAccessor(0, Marshal.SizeOf(typeof(CoreTempData)))) {
                    byte[] b = new byte[Marshal.SizeOf(typeof(CoreTempData))];
                    a.ReadArray(0, b, 0, b.Length);
                    GCHandle h = GCHandle.Alloc(b, GCHandleType.Pinned);
                    try {
                        CoreTempData d = (CoreTempData)Marshal.PtrToStructure(h.AddrOfPinnedObject(), typeof(CoreTempData));
                        // CoreTemp can publish Fahrenheit or "distance to TjMax" instead of degrees C.
                        float max = -1;
                        int n = (int)Math.Min(256u, d.uiCoreCnt * Math.Max(1u, d.uiCPUCnt));
                        for (int i = 0; i < n; i++) {
                            float t = d.fTemp[i];
                            if (d.ucDeltaToTjMax != 0) {
                                uint tj = d.uiTjMax[Math.Min(127, i / (int)Math.Max(1u, d.uiCoreCnt))];
                                if (tj == 0) continue;
                                t = tj - t;
                            }
                            if (d.ucFahrenheit != 0) t = (t - 32f) * 5f / 9f;
                            if (t > max) max = t;
                        }
                        return max;
                    } finally {
                        h.Free();
                    }
                }
            }
        } catch {
            return -1.0f;
        }
    }

    public static void Main(string[] args) {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        IntPtr query = IntPtr.Zero;
        uint rc = PdhOpenQueryW(null, IntPtr.Zero, out query);
        if (rc != 0 || query == IntPtr.Zero) {
            Console.Error.WriteLine("PdhOpenQuery failed: 0x" + rc.ToString("X8"));
            return;
        }

        IntPtr hDiskRead = IntPtr.Zero, hDiskWrite = IntPtr.Zero, hDiskIdle = IntPtr.Zero;
        IntPtr hDpcQ = IntPtr.Zero, hInts = IntPtr.Zero, hDpcPct = IntPtr.Zero, hIntPct = IntPtr.Zero;
        IntPtr hNetRx = IntPtr.Zero, hNetTx = IntPtr.Zero;
        IntPtr hGpuUtil = IntPtr.Zero, hGpuMem = IntPtr.Zero;

        PdhAddEnglishCounterW(query, "\\PhysicalDisk(_Total)\\Disk Read Bytes/sec", IntPtr.Zero, out hDiskRead);
        PdhAddEnglishCounterW(query, "\\PhysicalDisk(_Total)\\Disk Write Bytes/sec", IntPtr.Zero, out hDiskWrite);
        PdhAddEnglishCounterW(query, "\\PhysicalDisk(_Total)\\% Idle Time", IntPtr.Zero, out hDiskIdle);

        PdhAddEnglishCounterW(query, "\\Processor(_Total)\\DPCs Queued/sec", IntPtr.Zero, out hDpcQ);
        PdhAddEnglishCounterW(query, "\\Processor(_Total)\\Interrupts/sec", IntPtr.Zero, out hInts);
        PdhAddEnglishCounterW(query, "\\Processor(_Total)\\% DPC Time", IntPtr.Zero, out hDpcPct);
        PdhAddEnglishCounterW(query, "\\Processor(_Total)\\% Interrupt Time", IntPtr.Zero, out hIntPct);

        PdhAddEnglishCounterW(query, "\\Network Interface(*)\\Bytes Received/sec", IntPtr.Zero, out hNetRx);
        PdhAddEnglishCounterW(query, "\\Network Interface(*)\\Bytes Sent/sec", IntPtr.Zero, out hNetTx);

        PdhAddEnglishCounterW(query, "\\GPU Engine(*engtype_3D)\\Utilization Percentage", IntPtr.Zero, out hGpuUtil);
        PdhAddEnglishCounterW(query, "\\GPU Adapter Memory(*)\\Dedicated Usage", IntPtr.Zero, out hGpuMem);

        Dictionary<string, GpuAdapter> adapters = EnumerateAdapters();

        // Prime the query
        PdhCollectQueryData(query);
        Thread.Sleep(1000);

        string tempPath = Path.GetTempPath();
        string procsFlagPath = Path.Combine(tempPath, "darkhub_procs_enabled.flag");

        int tick = 0;
        int procsEvery = 5;
        DateTime prevStamp = DateTime.UtcNow;
        Dictionary<int, double> prevCpu = new Dictionary<int, double>();
        int cores = Environment.ProcessorCount;
        if (cores < 1) cores = 1;

        // Auto-exit if stdin closes (parent died)
        Thread stdinWatcher = new Thread(() => {
            try {
                while (Console.In.Read() != -1) { }
            } catch { }
            Environment.Exit(0);
        });
        stdinWatcher.IsBackground = true;
        stdinWatcher.Start();

        while (true) {
            tick++;
            PdhCollectQueryData(query);

            // 1. Read singles: Disk & Latency
            double diskRead = ReadSingle(hDiskRead);
            double diskWrite = ReadSingle(hDiskWrite);
            double diskIdle = ReadSingle(hDiskIdle);
            double act = double.IsNaN(diskIdle) ? double.NaN : Math.Max(0.0, Math.Min(100.0, 100.0 - diskIdle));
            // A counter that could not be read is sent as null, never as a measured 0.
            Console.WriteLine("{\"type\":\"diskIo\",\"readBps\":" + Num(diskRead, "F0") + ",\"writeBps\":" + Num(diskWrite, "F0") + ",\"activity\":" + Num(act, "F0") + "}");

            double dpcQ = ReadSingle(hDpcQ);
            double ints = ReadSingle(hInts);
            double dpcPct = ReadSingle(hDpcPct);
            double intPct = ReadSingle(hIntPct);
            Console.WriteLine("{\"type\":\"latency\",\"dpcsQueued\":" + Num(dpcQ, "F0") + ",\"interrupts\":" + Num(ints, "F0") +
                ",\"percentDpc\":" + Num(dpcPct, "F2") + ",\"percentInt\":" + Num(intPct, "F2") + "}");

            // 2. Read physical network ONLY (filtering virtual/loopback/tunnel)
            if (hNetRx != IntPtr.Zero || hNetTx != IntPtr.Zero) {
                double rx = ReadMultiFiltered(hNetRx);
                double tx = ReadMultiFiltered(hNetTx);
                Console.WriteLine("{\"type\":\"network\",\"rxBps\":" + Num(rx, "F0") + ",\"txBps\":" + Num(tx, "F0") + "}");
            }

            // 3. Read GPU
            if (adapters.Count > 0 && (hGpuUtil != IntPtr.Zero || hGpuMem != IntPtr.Zero)) {
                Dictionary<string, double> util = ReadByLuid(hGpuUtil);
                Dictionary<string, double> mem = ReadByLuid(hGpuMem);
                List<string> items = new List<string>();
                foreach (KeyValuePair<string, GpuAdapter> a in adapters) {
                    double u = util == null ? double.NaN : (util.ContainsKey(a.Key) ? Math.Min(100.0, util[a.Key]) : 0.0);
                    double m = mem == null || !mem.ContainsKey(a.Key) ? double.NaN : mem[a.Key] / 1048576.0;
                    items.Add("{\"name\":\"" + EscapeJson(a.Value.Name) + "\",\"luid\":\"" + a.Key + "\",\"vendorId\":" + a.Value.VendorId +
                        ",\"utilization\":" + Num(u, "F0") + ",\"memoryUsed\":" + Num(m, "F0") + ",\"memoryTotal\":" + a.Value.DedicatedMb + "}");
                }
                Console.WriteLine("{\"type\":\"gpu\",\"adapters\":[" + string.Join(",", items.ToArray()) + "]}");
            }

            // 4. CoreTemp check (every 5s)
            if ((tick % 5) == 2) {
                float ct = ReadCoreTemp();
                if (ct > 20.0f && ct < 120.0f) {
                    Console.WriteLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                        "{{\"type\":\"hwmonTemps\",\"source\":\"CoreTemp\",\"cpuTempC\":{0:F1},\"gpuTempC\":null}}", ct));
                }
            }

            // 5. Processes: read ONLY when flag exists
            if ((tick % procsEvery) == 1 && File.Exists(procsFlagPath)) {
                Process[] procs = null;
                try {
                    procs = Process.GetProcesses();
                    DateTime now = DateTime.UtcNow;
                    double dt = (now - prevStamp).TotalSeconds;
                    if (dt <= 0) dt = 1.0;
                    Dictionary<int, double> curCpu = new Dictionary<int, double>();
                    Dictionary<int, double> pct = new Dictionary<int, double>();

                    foreach (Process p in procs) {
                        try {
                            int id = p.Id;
                            double cpuSec = p.TotalProcessorTime.TotalSeconds;
                            curCpu[id] = cpuSec;
                            double val = 0.0;
                            if (prevCpu.ContainsKey(id)) {
                                double delta = cpuSec - prevCpu[id];
                                if (delta > 0) val = Math.Round(((delta / dt) / cores) * 100.0, 1);
                                if (val > 100.0) val = 100.0;
                            }
                            pct[id] = val;
                        } catch { }
                    }
                    prevCpu = curCpu;
                    prevStamp = now;

                    // Sort top CPU & top Mem
                    List<Process> sortedCpu = new List<Process>();
                    List<Process> sortedMem = new List<Process>();
                    foreach (Process p in procs) {
                        sortedCpu.Add(p);
                        sortedMem.Add(p);
                    }
                    sortedCpu.Sort((a, b) => {
                        double vA = pct.ContainsKey(a.Id) ? pct[a.Id] : 0.0;
                        double vB = pct.ContainsKey(b.Id) ? pct[b.Id] : 0.0;
                        return vB.CompareTo(vA);
                    });
                    sortedMem.Sort((a, b) => {
                        long mA = 0, mB = 0;
                        try { mA = a.WorkingSet64; } catch { }
                        try { mB = b.WorkingSet64; } catch { }
                        return mB.CompareTo(mA);
                    });

                    // Build JSON array for top 15
                    List<string> topCpuJson = new List<string>();
                    for (int i = 0; i < Math.Min(15, sortedCpu.Count); i++) {
                        Process p = sortedCpu[i];
                        try {
                            double c = pct.ContainsKey(p.Id) ? pct[p.Id] : 0.0;
                            topCpuJson.Add(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                                "{{\"name\":\"{0}\",\"pid\":{1},\"cpu\":{2:F1},\"memRss\":{3}}}",
                                EscapeJson(p.ProcessName), p.Id, c, p.WorkingSet64));
                        } catch { }
                    }

                    List<string> topMemJson = new List<string>();
                    for (int i = 0; i < Math.Min(15, sortedMem.Count); i++) {
                        Process p = sortedMem[i];
                        try {
                            double c = pct.ContainsKey(p.Id) ? pct[p.Id] : 0.0;
                            topMemJson.Add(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                                "{{\"name\":\"{0}\",\"pid\":{1},\"cpu\":{2:F1},\"memRss\":{3}}}",
                                EscapeJson(p.ProcessName), p.Id, c, p.WorkingSet64));
                        } catch { }
                    }

                    Console.WriteLine(string.Format("{{\"type\":\"procs\",\"all\":{0},\"topCpu\":[{1}],\"topMem\":[{2}]}}",
                        procs.Length, string.Join(",", topCpuJson.ToArray()), string.Join(",", topMemJson.ToArray())));
                } catch { }
                finally {
                    // TotalProcessorTime opens a process handle per Process; release them every cycle
                    // instead of waiting for the finalizer (hundreds of handles per tick otherwise).
                    if (procs != null) {
                        foreach (Process p in procs) { try { p.Dispose(); } catch { } }
                    }
                }
            }

            Console.Out.Flush();
            Thread.Sleep(1000);
        }
    }

    private static double ReadSingle(IntPtr hCounter) {
        if (hCounter == IntPtr.Zero) return double.NaN;
        uint lpdwType;
        PDH_FMT_COUNTERVALUE pVal;
        uint rc = PdhGetFormattedCounterValue(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, out lpdwType, out pVal);
        if (rc != 0 || (pVal.CStatus != 0 && pVal.CStatus != 1)) return double.NaN;
        double v = pVal.doubleValue;
        return double.IsInfinity(v) ? double.NaN : v;
    }

    private static double ReadMultiFiltered(IntPtr hCounter) {
        if (hCounter == IntPtr.Zero) return double.NaN;
        uint size = 0, count = 0;
        if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, IntPtr.Zero) != PDH_MORE_DATA) {
            return double.NaN;
        }
        if (size == 0) return double.NaN;

        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try {
            if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, buf) != 0) {
                return double.NaN;
            }
            double sum = 0.0;
            int stride = PDH_ITEM_STRIDE;
            int valueOffset = PDH_ITEM_VALUE_OFFSET;
            for (int i = 0; i < count; i++) {
                IntPtr item = new IntPtr(buf.ToInt64() + (long)i * stride);
                if (!ItemValid(item)) continue;
                IntPtr namePtr = Marshal.ReadIntPtr(item, 0);
                if (namePtr != IntPtr.Zero) {
                    string name = Marshal.PtrToStringUni(namePtr);
                    if (!string.IsNullOrEmpty(name)) {
                        string lower = name.ToLowerInvariant();
                        if (lower.Contains("isatap") || lower.Contains("teredo") ||
                            lower.Contains("vethernet") || lower.Contains("hyper-v") ||
                            lower.Contains("wsl") || lower.Contains("loopback") ||
                            lower.Contains("bluetooth") || lower.Contains("vpn") ||
                            lower.Contains("tap") || lower.Contains("tailscale") ||
                            lower.Contains("zerotier") || lower.Contains("pseudo") ||
                            lower.Contains("npcap") || lower.Contains("virtual")) {
                            continue;
                        }
                    }
                }
                double val = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(item, valueOffset));
                if (double.IsNaN(val) || double.IsInfinity(val)) continue;
                sum += val;
            }
            return sum;
        } finally {
            Marshal.FreeHGlobal(buf);
        }
    }

    /** Sums counter instances per adapter LUID ("..._luid_0xHHHHHHHH_0xLLLLLLLL_..."). null when the counter failed. */
    private static Dictionary<string, double> ReadByLuid(IntPtr hCounter) {
        if (hCounter == IntPtr.Zero) return null;
        uint size = 0, count = 0;
        if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, IntPtr.Zero) != PDH_MORE_DATA) return null;
        if (size == 0) return null;
        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try {
            if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, buf) != 0) return null;
            Dictionary<string, double> sums = new Dictionary<string, double>();
            for (int i = 0; i < count; i++) {
                IntPtr item = new IntPtr(buf.ToInt64() + (long)i * PDH_ITEM_STRIDE);
                if (!ItemValid(item)) continue;
                IntPtr namePtr = Marshal.ReadIntPtr(item, 0);
                if (namePtr == IntPtr.Zero) continue;
                string name = Marshal.PtrToStringUni(namePtr);
                int at = name == null ? -1 : name.IndexOf("luid_0x", StringComparison.OrdinalIgnoreCase);
                if (at < 0 || name.Length < at + 26) continue;
                string luid = name.Substring(at + 5, 21).ToLowerInvariant(); // 0xHHHHHHHH_0xLLLLLLLL
                double val = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(item, PDH_ITEM_VALUE_OFFSET));
                if (double.IsNaN(val) || double.IsInfinity(val)) continue;
                double cur;
                sums.TryGetValue(luid, out cur);
                sums[luid] = cur + val;
            }
            return sums;
        } finally {
            Marshal.FreeHGlobal(buf);
        }
    }

    private class GpuAdapter { public string Name; public uint VendorId; public long DedicatedMb; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DXGI_ADAPTER_DESC1 {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string Description;
        public uint VendorId, DeviceId, SubSysId, Revision;
        public UIntPtr DedicatedVideoMemory, DedicatedSystemMemory, SharedSystemMemory;
        public uint LuidLow;
        public int LuidHigh;
        public uint Flags;
    }

    [ComImport, Guid("29038f61-3839-4626-91fd-086879011a05"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDXGIAdapter1 {
        void SetPrivateData(); void SetPrivateDataInterface(); void GetPrivateData(); void GetParent();
        void EnumOutputs(); void GetDesc(); void CheckInterfaceSupport();
        [PreserveSig] int GetDesc1(out DXGI_ADAPTER_DESC1 desc);
    }

    [ComImport, Guid("770aae78-f26f-4dba-a829-253c83d1b387"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IDXGIFactory1 {
        void SetPrivateData(); void SetPrivateDataInterface(); void GetPrivateData(); void GetParent();
        void EnumAdapters(); void MakeWindowAssociation(); void GetWindowAssociation(); void CreateSwapChain(); void CreateSoftwareAdapter();
        [PreserveSig] int EnumAdapters1(uint index, out IDXGIAdapter1 adapter);
    }

    [DllImport("dxgi.dll")]
    private static extern int CreateDXGIFactory1([In] ref Guid riid, [MarshalAs(UnmanagedType.Interface)] out IDXGIFactory1 factory);

    /** Hardware adapters by LUID, with their real names (the same source Task Manager uses). */
    private static Dictionary<string, GpuAdapter> EnumerateAdapters() {
        Dictionary<string, GpuAdapter> list = new Dictionary<string, GpuAdapter>();
        try {
            Guid iid = typeof(IDXGIFactory1).GUID;
            IDXGIFactory1 f;
            if (CreateDXGIFactory1(ref iid, out f) != 0 || f == null) return list;
            for (uint i = 0; i < 16; i++) {
                IDXGIAdapter1 a;
                if (f.EnumAdapters1(i, out a) != 0 || a == null) break;
                DXGI_ADAPTER_DESC1 d;
                if (a.GetDesc1(out d) == 0 && (d.Flags & 2) == 0) { // skip the software (WARP) adapter
                    string luid = ("0x" + ((uint)d.LuidHigh).ToString("x8") + "_0x" + d.LuidLow.ToString("x8"));
                    list[luid] = new GpuAdapter { Name = d.Description, VendorId = d.VendorId, DedicatedMb = (long)(d.DedicatedVideoMemory.ToUInt64() / 1048576UL) };
                }
                Marshal.ReleaseComObject(a);
            }
            Marshal.ReleaseComObject(f);
        } catch { }
        return list;
    }

    private static string Num(double v, string fmt) {
        return double.IsNaN(v) || double.IsInfinity(v) ? "null" : v.ToString(fmt, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string EscapeJson(string s) {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "");
    }
}
