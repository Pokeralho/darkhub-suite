// DarkHub.HwSensors: advanced hardware sensors through LibreHardwareMonitorLib (MPL-2.0).
// Runs only when the user enables "advanced sensors". CPU core temperatures, Super I/O fans and voltages and RAM
// SPD need the PawnIO driver (installed by the user from DarkHub, signed, HVCI compatible); GPU (NVAPI/ADL) and
// disk SMART work without it.
// Output: one JSON line per sample on stdout:
//   {"type":"lhm","t":<ms>,"pawnio":<bool>,"admin":<bool>,"hw":[{"kind":"Cpu","name":"...","s":[["Temperature","Core (Tctl/Tdie)",45.25],...]}],
//    "nvml":[{"name":"...","energyMj":..,"powerMw":..,...}],"smbios":{"ramMts":..,"ramRatedMts":..,...}}
// "nvml" (NVIDIA only: direct NVML reads that LHM does not expose) and "smbios" (memory modules, read once) are omitted
// when absent; inside them a field the card/driver does not report is omitted too, never written as zero.
// Usage: DarkHub.HwSensors.exe [intervalMs]   (stdin closing ends the process)
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;
using Microsoft.Win32;

namespace DarkHub.Native
{
    // Direct NVML reads (nvml.dll ships with the NVIDIA driver, in System32). Functions are resolved by name at run time
    // so an older driver without one of them only loses that field. Signatures: NVIDIA's nvml.h.
    internal sealed class Nvml
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)] private static extern IntPtr LoadLibrary(string name);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)] private static extern IntPtr GetProcAddress(IntPtr module, string name);

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FInit();
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FCount(out uint n);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FHandle(uint index, out IntPtr dev);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FName(IntPtr dev, StringBuilder name, uint len);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FU32(IntPtr dev, out uint v);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FU64(IntPtr dev, out ulong v);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FUtil(IntPtr dev, out uint util, out uint periodUs);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FProcs(IntPtr dev, ref uint count, [Out] ProcInfo[] infos);

        [StructLayout(LayoutKind.Sequential)]
        private struct ProcInfo { public uint Pid; public ulong UsedGpuMemory; public uint GpuInstanceId; public uint ComputeInstanceId; }

        private const int Success = 0;
        private const int InsufficientSize = 7;
        private const ulong NotAvailable = ulong.MaxValue; // NVML_VALUE_NOT_AVAILABLE in an unsigned 64-bit field

        private sealed class Device
        {
            public IntPtr Handle; public string Name;
            public FU64 Energy, Throttle; public FU32 Power, PowerLimit, EnforcedLimit, PcieGen, PcieWidth, PcieMaxGen, PcieMaxWidth;
            public FUtil Encoder, Decoder; public FProcs Compute, Graphics;
        }

        private readonly List<Device> _devices = new List<Device>();
        public bool Ok { get { return _devices.Count > 0; } }

        private static T Fn<T>(IntPtr lib, params string[] names) where T : class
        {
            foreach (string n in names)
            {
                IntPtr p = GetProcAddress(lib, n);
                if (p != IntPtr.Zero) return Marshal.GetDelegateForFunctionPointer(p, typeof(T)) as T;
            }
            return null;
        }

        public Nvml()
        {
            try
            {
                IntPtr lib = LoadLibrary("nvml.dll");
                if (lib == IntPtr.Zero) return;
                var init = Fn<FInit>(lib, "nvmlInit_v2", "nvmlInit");
                var count = Fn<FCount>(lib, "nvmlDeviceGetCount_v2", "nvmlDeviceGetCount");
                var handle = Fn<FHandle>(lib, "nvmlDeviceGetHandleByIndex_v2", "nvmlDeviceGetHandleByIndex");
                var name = Fn<FName>(lib, "nvmlDeviceGetName");
                if (init == null || count == null || handle == null || init() != Success) return;
                uint n;
                if (count(out n) != Success) return;
                for (uint i = 0; i < n; i++)
                {
                    IntPtr h;
                    if (handle(i, out h) != Success) continue;
                    var d = new Device { Handle = h };
                    var sb = new StringBuilder(96);
                    if (name != null && name(h, sb, 96) == Success) d.Name = sb.ToString();
                    d.Energy = Fn<FU64>(lib, "nvmlDeviceGetTotalEnergyConsumption");
                    d.Power = Fn<FU32>(lib, "nvmlDeviceGetPowerUsage");
                    d.PowerLimit = Fn<FU32>(lib, "nvmlDeviceGetPowerManagementLimit");
                    d.EnforcedLimit = Fn<FU32>(lib, "nvmlDeviceGetEnforcedPowerLimit");
                    d.PcieGen = Fn<FU32>(lib, "nvmlDeviceGetCurrPcieLinkGeneration");
                    d.PcieWidth = Fn<FU32>(lib, "nvmlDeviceGetCurrPcieLinkWidth");
                    d.PcieMaxGen = Fn<FU32>(lib, "nvmlDeviceGetMaxPcieLinkGeneration");
                    d.PcieMaxWidth = Fn<FU32>(lib, "nvmlDeviceGetMaxPcieLinkWidth");
                    d.Encoder = Fn<FUtil>(lib, "nvmlDeviceGetEncoderUtilization");
                    d.Decoder = Fn<FUtil>(lib, "nvmlDeviceGetDecoderUtilization");
                    // the *EventReasons name is the current one; an older driver exports the Throttle name
                    d.Throttle = Fn<FU64>(lib, "nvmlDeviceGetCurrentClocksEventReasons", "nvmlDeviceGetCurrentClocksThrottleReasons");
                    d.Compute = Fn<FProcs>(lib, "nvmlDeviceGetComputeRunningProcesses_v3");
                    d.Graphics = Fn<FProcs>(lib, "nvmlDeviceGetGraphicsRunningProcesses_v3");
                    _devices.Add(d);
                }
            }
            catch { _devices.Clear(); }
        }

        private static void Num(StringBuilder sb, ref bool first, string key, double v)
        {
            if (!first) sb.Append(',');
            first = false;
            sb.Append('"').Append(key).Append("\":").Append(v.ToString("0.###", CultureInfo.InvariantCulture));
        }

        private static void U32(StringBuilder sb, ref bool first, string key, FU32 f, IntPtr h)
        {
            uint v;
            if (f != null && f(h, out v) == Success) Num(sb, ref first, key, v);
        }

        // Sum of the memory NVML attributes to processes. False when the driver does not report it (on WDDM it often does not).
        private static bool ProcMem(FProcs f, IntPtr h, out ulong bytes, out uint procs)
        {
            bytes = 0; procs = 0;
            if (f == null) return false;
            uint count = 0;
            int r = f(h, ref count, null);
            if (r == Success && count == 0) return true;
            if (r != InsufficientSize && r != Success) return false;
            var infos = new ProcInfo[Math.Max(count + 8, 16)];
            count = (uint)infos.Length;
            if (f(h, ref count, infos) != Success) return false;
            procs = count;
            bool any = false;
            for (int i = 0; i < count; i++)
                if (infos[i].UsedGpuMemory != NotAvailable) { bytes += infos[i].UsedGpuMemory; any = true; }
            return any;
        }

        public void Dump(StringBuilder sb)
        {
            sb.Append('[');
            for (int i = 0; i < _devices.Count; i++)
            {
                Device d = _devices[i];
                if (i > 0) sb.Append(',');
                sb.Append('{');
                bool first = true;
                if (d.Name != null) { sb.Append("\"name\":"); HwSensors.Esc(sb, d.Name); first = false; }
                try
                {
                    ulong e; uint a, b;
                    if (d.Energy != null && d.Energy(d.Handle, out e) == Success) Num(sb, ref first, "energyMj", e);
                    U32(sb, ref first, "powerMw", d.Power, d.Handle);
                    U32(sb, ref first, "powerLimitMw", d.PowerLimit, d.Handle);
                    U32(sb, ref first, "enforcedLimitMw", d.EnforcedLimit, d.Handle);
                    U32(sb, ref first, "pcieGen", d.PcieGen, d.Handle);
                    U32(sb, ref first, "pcieWidth", d.PcieWidth, d.Handle);
                    U32(sb, ref first, "pcieMaxGen", d.PcieMaxGen, d.Handle);
                    U32(sb, ref first, "pcieMaxWidth", d.PcieMaxWidth, d.Handle);
                    if (d.Encoder != null && d.Encoder(d.Handle, out a, out b) == Success) Num(sb, ref first, "encoderPct", a);
                    if (d.Decoder != null && d.Decoder(d.Handle, out a, out b) == Success) Num(sb, ref first, "decoderPct", a);
                    if (d.Throttle != null && d.Throttle(d.Handle, out e) == Success) Num(sb, ref first, "throttle", e);
                    ulong bytes; uint procs;
                    if (ProcMem(d.Compute, d.Handle, out bytes, out procs)) { Num(sb, ref first, "computeMemMb", bytes / 1048576.0); Num(sb, ref first, "computeProcs", procs); }
                    if (ProcMem(d.Graphics, d.Handle, out bytes, out procs)) { Num(sb, ref first, "graphicsMemMb", bytes / 1048576.0); Num(sb, ref first, "graphicsProcs", procs); }
                }
                catch { }
                sb.Append('}');
            }
            sb.Append(']');
        }
    }

    public static class HwSensors
    {
        internal static void Esc(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s ?? "")
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < 0x20) sb.Append(' ');
                else sb.Append(c);
            }
            sb.Append('"');
        }

        private static bool PawnIoInstalled()
        {
            using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\PawnIO"))
                return k != null;
        }

        private static void Dump(StringBuilder sb, IHardware hw, ref bool first, bool slowTick)
        {
            // Disks (SMART) and memory modules change slowly: refreshed every 5th sample, last values reused between.
            bool slow = hw.HardwareType == HardwareType.Storage || hw.HardwareType == HardwareType.Memory;
            if (!slow || slowTick) hw.Update();
            if (!first) sb.Append(',');
            first = false;
            sb.Append("{\"kind\":");
            Esc(sb, hw.HardwareType.ToString());
            sb.Append(",\"name\":");
            Esc(sb, hw.Name);
            sb.Append(",\"s\":[");
            bool fs = true;
            foreach (ISensor s in hw.Sensors)
            {
                if (!s.Value.HasValue || float.IsNaN(s.Value.Value) || float.IsInfinity(s.Value.Value)) continue;
                if (!fs) sb.Append(',');
                fs = false;
                sb.Append('[');
                Esc(sb, s.SensorType.ToString());
                sb.Append(',');
                Esc(sb, s.Name);
                sb.Append(',').Append(s.Value.Value.ToString("0.###", CultureInfo.InvariantCulture)).Append(']');
            }
            sb.Append("]}");
            foreach (IHardware sub in hw.SubHardware) Dump(sb, sub, ref first, slowTick);
        }

        // PawnIO only answers elevated callers: without admin LHM returns placeholders for CPU and Super I/O.
        private static bool IsAdmin()
        {
            try { return new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator); }
            catch { return false; }
        }

        // SMBIOS memory modules (Win32_PhysicalMemory), read once: they do not change while the PC runs. ConfiguredClockSpeed
        // is the speed the modules run at (MT/s on DDR, despite the name) and Speed the rated one. Both come from firmware
        // tables, not from a live counter, so the app marks them as derived.
        private static string ReadSmbios()
        {
            try
            {
                double cfg = 0, rated = 0; int modules = 0; string type = null;
                using (var q = new System.Management.ManagementObjectSearcher("SELECT ConfiguredClockSpeed, Speed, SMBIOSMemoryType FROM Win32_PhysicalMemory"))
                    foreach (System.Management.ManagementBaseObject m in q.Get())
                    {
                        modules++;
                        object c = m["ConfiguredClockSpeed"], s = m["Speed"], t = m["SMBIOSMemoryType"];
                        if (c != null && Convert.ToDouble(c) > cfg) cfg = Convert.ToDouble(c);
                        if (s != null && Convert.ToDouble(s) > rated) rated = Convert.ToDouble(s);
                        if (t != null)
                        {
                            int code = Convert.ToInt32(t);
                            type = code == 34 ? "DDR5" : code == 26 ? "DDR4" : code == 24 ? "DDR3" : code == 35 ? "LPDDR5" : code == 30 ? "LPDDR4" : code == 29 ? "LPDDR3" : type;
                        }
                    }
                if (modules == 0) return null;
                var sb = new StringBuilder("{\"modules\":" + modules);
                if (cfg > 0) sb.Append(",\"ramMts\":").Append(cfg.ToString("0", CultureInfo.InvariantCulture));
                if (rated > 0) sb.Append(",\"ramRatedMts\":").Append(rated.ToString("0", CultureInfo.InvariantCulture));
                if (type != null) sb.Append(",\"ramType\":\"").Append(type).Append('"');
                return sb.Append('}').ToString();
            }
            catch { return null; }
        }

        public static int Main(string[] args)
        {
            int interval = 1000;
            if (args.Length > 0) int.TryParse(args[0], out interval);
            interval = Math.Max(250, Math.Min(10000, interval));
            Console.OutputEncoding = new UTF8Encoding(false);

            // The parent closing our stdin (or dying) ends the loop: no orphaned sensor process.
            var stdinWatcher = new Thread(() => { try { Console.In.ReadToEnd(); } catch { } Environment.Exit(0); }) { IsBackground = true };
            stdinWatcher.Start();

            var computer = new Computer
            {
                IsCpuEnabled = true,
                IsGpuEnabled = true,
                IsMotherboardEnabled = true,
                IsMemoryEnabled = true,
                IsStorageEnabled = true,
                IsControllerEnabled = true
            };
            try { computer.Open(); }
            catch (Exception ex) { Console.Error.WriteLine("open failed: " + ex.Message); return 1; }

            bool pawnio = PawnIoInstalled();
            bool admin = IsAdmin();
            var nvml = new Nvml();
            string smbios = ReadSmbios();
            var sb = new StringBuilder(32 * 1024);
            var stdout = Console.Out;
            long tick = 0;
            while (true)
            {
                bool slowTick = tick++ % 5 == 0;
                sb.Clear();
                sb.Append("{\"type\":\"lhm\",\"t\":").Append((long)(DateTime.UtcNow - new DateTime(1970, 1, 1)).TotalMilliseconds);
                sb.Append(",\"pawnio\":").Append(pawnio ? "true" : "false").Append(",\"admin\":").Append(admin ? "true" : "false").Append(",\"hw\":[");
                bool first = true;
                foreach (IHardware hw in computer.Hardware)
                {
                    try { Dump(sb, hw, ref first, slowTick); } catch { }
                }
                sb.Append(']');
                if (nvml.Ok) { sb.Append(",\"nvml\":"); try { nvml.Dump(sb); } catch { sb.Append("[]"); } }
                if (smbios != null) sb.Append(",\"smbios\":").Append(smbios);
                sb.Append('}');
                try { stdout.WriteLine(sb.ToString()); stdout.Flush(); }
                catch (IOException) { break; }
                Thread.Sleep(interval);
            }
            computer.Close();
            return 0;
        }
    }
}
