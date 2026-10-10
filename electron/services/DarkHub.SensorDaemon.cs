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
    }

    private const uint PDH_FMT_DOUBLE = 0x00000200;
    private const uint PDH_FMT_NOCAP100 = 0x00008000;
    private const uint PDH_MORE_DATA = 0x800007D2;

    private static float ReadCoreTemp() {
        try {
            using (var mmf = MemoryMappedFile.OpenExisting("CoreTempMapping")) {
                using (var a = mmf.CreateViewAccessor(0, Marshal.SizeOf(typeof(CoreTempData)))) {
                    byte[] b = new byte[Marshal.SizeOf(typeof(CoreTempData))];
                    a.ReadArray(0, b, 0, b.Length);
                    GCHandle h = GCHandle.Alloc(b, GCHandleType.Pinned);
                    try {
                        CoreTempData d = (CoreTempData)Marshal.PtrToStructure(h.AddrOfPinnedObject(), typeof(CoreTempData));
                        float max = 0;
                        for (int i = 0; i < (int)d.uiCoreCnt && i < 256; i++) {
                            if (d.fTemp[i] > max) max = d.fTemp[i];
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

        IntPtr hDiskRead = IntPtr.Zero, hDiskWrite = IntPtr.Zero, hDiskTime = IntPtr.Zero;
        IntPtr hDpcQ = IntPtr.Zero, hInts = IntPtr.Zero, hDpcPct = IntPtr.Zero, hIntPct = IntPtr.Zero;
        IntPtr hNetRx = IntPtr.Zero, hNetTx = IntPtr.Zero;
        IntPtr hGpuUtil = IntPtr.Zero, hGpuMem = IntPtr.Zero;

        PdhAddEnglishCounterW(query, "\\PhysicalDisk(_Total)\\Disk Read Bytes/sec", IntPtr.Zero, out hDiskRead);
        PdhAddEnglishCounterW(query, "\\PhysicalDisk(_Total)\\Disk Write Bytes/sec", IntPtr.Zero, out hDiskWrite);
        PdhAddEnglishCounterW(query, "\\PhysicalDisk(_Total)\\% Disk Time", IntPtr.Zero, out hDiskTime);

        PdhAddEnglishCounterW(query, "\\Processor(_Total)\\DPCs Queued/sec", IntPtr.Zero, out hDpcQ);
        PdhAddEnglishCounterW(query, "\\Processor(_Total)\\Interrupts/sec", IntPtr.Zero, out hInts);
        PdhAddEnglishCounterW(query, "\\Processor(_Total)\\% DPC Time", IntPtr.Zero, out hDpcPct);
        PdhAddEnglishCounterW(query, "\\Processor(_Total)\\% Interrupt Time", IntPtr.Zero, out hIntPct);

        PdhAddEnglishCounterW(query, "\\Network Interface(*)\\Bytes Received/sec", IntPtr.Zero, out hNetRx);
        PdhAddEnglishCounterW(query, "\\Network Interface(*)\\Bytes Sent/sec", IntPtr.Zero, out hNetTx);

        PdhAddEnglishCounterW(query, "\\GPU Engine(*engtype_3D)\\Utilization Percentage", IntPtr.Zero, out hGpuUtil);
        PdhAddEnglishCounterW(query, "\\GPU Adapter Memory(*)\\Dedicated Usage", IntPtr.Zero, out hGpuMem);

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
            double diskTime = ReadSingle(hDiskTime);
            long rd = (long)Math.Round(diskRead);
            long wr = (long)Math.Round(diskWrite);
            int act = (int)Math.Round(diskTime);
            if (act > 100) act = 100;
            Console.WriteLine(string.Format("{{\"type\":\"diskIo\",\"readBps\":{0},\"writeBps\":{1},\"activity\":{2}}}", rd, wr, act));

            double dpcQ = ReadSingle(hDpcQ);
            double ints = ReadSingle(hInts);
            double dpcPct = ReadSingle(hDpcPct);
            double intPct = ReadSingle(hIntPct);
            Console.WriteLine(string.Format(System.Globalization.CultureInfo.InvariantCulture,
                "{{\"type\":\"latency\",\"dpcsQueued\":{0},\"interrupts\":{1},\"percentDpc\":{2},\"percentInt\":{3}}}",
                (long)Math.Round(dpcQ), (long)Math.Round(ints),
                dpcPct.ToString("F2", System.Globalization.CultureInfo.InvariantCulture),
                intPct.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)));

            // 2. Read physical network ONLY (filtering virtual/loopback/tunnel)
            if (hNetRx != IntPtr.Zero || hNetTx != IntPtr.Zero) {
                long rx = (long)Math.Round(ReadMultiFiltered(hNetRx));
                long tx = (long)Math.Round(ReadMultiFiltered(hNetTx));
                Console.WriteLine(string.Format("{{\"type\":\"network\",\"rxBps\":{0},\"txBps\":{1}}}", rx, tx));
            }

            // 3. Read GPU
            if (hGpuUtil != IntPtr.Zero || hGpuMem != IntPtr.Zero) {
                double gpuUtil = ReadMultiMax(hGpuUtil);
                double gpuMem = ReadMultiSum(hGpuMem);
                int gu = (int)Math.Round(gpuUtil);
                if (gu > 100) gu = 100;
                long gm = (long)Math.Round(gpuMem / 1048576.0);
                Console.WriteLine(string.Format("{{\"type\":\"gpu\",\"utilization\":{0},\"memoryUsed\":{1}}}", gu, gm));
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
                try {
                    Process[] procs = Process.GetProcesses();
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
            }

            Console.Out.Flush();
            Thread.Sleep(1000);
        }
    }

    private static double ReadSingle(IntPtr hCounter) {
        if (hCounter == IntPtr.Zero) return 0.0;
        uint lpdwType;
        PDH_FMT_COUNTERVALUE pVal;
        uint rc = PdhGetFormattedCounterValue(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, out lpdwType, out pVal);
        return (rc == 0) ? pVal.doubleValue : 0.0;
    }

    private static double ReadMultiFiltered(IntPtr hCounter) {
        if (hCounter == IntPtr.Zero) return 0.0;
        uint size = 0, count = 0;
        if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, IntPtr.Zero) != PDH_MORE_DATA) {
            return 0.0;
        }
        if (size == 0) return 0.0;

        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try {
            if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, buf) != 0) {
                return 0.0;
            }
            double sum = 0.0;
            int stride = IntPtr.Size + 16;
            int valueOffset = IntPtr.Size + 8;
            for (int i = 0; i < count; i++) {
                IntPtr item = new IntPtr(buf.ToInt64() + (long)i * stride);
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

    private static double ReadMultiMax(IntPtr hCounter) {
        if (hCounter == IntPtr.Zero) return 0.0;
        uint size = 0, count = 0;
        if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, IntPtr.Zero) != PDH_MORE_DATA) return 0.0;
        if (size == 0) return 0.0;

        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try {
            if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, buf) != 0) return 0.0;
            double max = 0.0;
            int stride = IntPtr.Size + 16;
            int valueOffset = IntPtr.Size + 8;
            for (int i = 0; i < count; i++) {
                IntPtr item = new IntPtr(buf.ToInt64() + (long)i * stride);
                double val = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(item, valueOffset));
                if (double.IsNaN(val) || double.IsInfinity(val)) continue;
                if (val > max) max = val;
            }
            return max;
        } finally {
            Marshal.FreeHGlobal(buf);
        }
    }

    private static double ReadMultiSum(IntPtr hCounter) {
        if (hCounter == IntPtr.Zero) return 0.0;
        uint size = 0, count = 0;
        if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, IntPtr.Zero) != PDH_MORE_DATA) return 0.0;
        if (size == 0) return 0.0;

        IntPtr buf = Marshal.AllocHGlobal((int)size);
        try {
            if (PdhGetFormattedCounterArrayW(hCounter, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100, ref size, ref count, buf) != 0) return 0.0;
            double sum = 0.0;
            int stride = IntPtr.Size + 16;
            int valueOffset = IntPtr.Size + 8;
            for (int i = 0; i < count; i++) {
                IntPtr item = new IntPtr(buf.ToInt64() + (long)i * stride);
                double val = BitConverter.Int64BitsToDouble(Marshal.ReadInt64(item, valueOffset));
                if (double.IsNaN(val) || double.IsInfinity(val)) continue;
                sum += val;
            }
            return sum;
        } finally {
            Marshal.FreeHGlobal(buf);
        }
    }

    private static string EscapeJson(string s) {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", "").Replace("\n", "");
    }
}
