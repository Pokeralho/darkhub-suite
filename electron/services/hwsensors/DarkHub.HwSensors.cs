// DarkHub.HwSensors: advanced hardware sensors through LibreHardwareMonitorLib (MPL-2.0).
// Runs only when the user enables "advanced sensors". CPU core temperatures, Super I/O fans and voltages and RAM
// SPD need the PawnIO driver (installed by the user from DarkHub, signed, HVCI compatible); GPU (NVAPI/ADL) and
// disk SMART work without it.
// Output: one JSON line per sample on stdout:
//   {"type":"lhm","t":<ms>,"pawnio":<bool>,"admin":<bool>,"hw":[{"kind":"Cpu","name":"...","s":[["Temperature","Core (Tctl/Tdie)",45.25],...]}],
//    "nvml":[{"name":"...","energyMj":..,"powerMw":..,...}],"smbios":{"ramMts":..,"ramRatedMts":..,...}}
//    "nvrails":[{"name":"...","state":"ok|no_rails|unsupported|disabled","boardW":..,"rails":[{"id":"16PIN0","w":..,"v":..,"a":..},{"id":"PCIE",..}]}]
// "nvml" (NVIDIA only: direct NVML reads that LHM does not expose), "nvrails" (NVIDIA only: per-connector input power
// through NVAPI; ids PCIE, 16PIN0, 8PIN0/1, 6PIN0/1; "bad" marks a sample that failed the V x A check) and "smbios"
// (memory modules, read once) are omitted when absent; inside them a field the card/driver does not report is omitted
// too, never written as zero, and a rail the card does not sense has no entry.
// Usage: DarkHub.HwSensors.exe --probe-rails   prints the raw NVAPI power-channel table once (read-only diagnostic)
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

    // Per-connector input power on NVIDIA (PCIe slot 12 V, 12VHPWR/12V-2x6, 8-pin, 6-pin), read-only, through the
    // undocumented NVAPI power-monitor pair (GetInfo: channel table; GetStatus: per-channel samples). Interface facts
    // (query IDs, struct versions, offsets, rail codes, units) are corroborated by open-source NVAPI wrappers and were
    // verified against a shipping tool. Defensive by design: nvapi64.dll from System32 only, explicit size+version in
    // every struct, guard bytes after each buffer (an overrun disables the feature for good), 3 consecutive failures
    // disable it for the session, and every value is range- and consistency-checked. A rail the card does not sense
    // is simply absent: never a zero.
    internal sealed class NvRails
    {
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr LoadLibraryExW(string path, IntPtr reserved, uint flags);
        [DllImport("kernel32.dll", CharSet = CharSet.Ansi, SetLastError = true)] private static extern IntPtr GetProcAddress(IntPtr module, string name);
        private const uint LoadLibrarySearchSystem32 = 0x800;

        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate IntPtr FQuery(uint id);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FInit();
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FEnum([Out] IntPtr[] handles, out int count);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)] private delegate int FName(IntPtr gpu, StringBuilder name);
        [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FBuf(IntPtr gpu, IntPtr buffer);

        // NVAPI query-interface IDs (public ones from NVIDIA's nvapi_interface.h; the power-monitor pair is undocumented)
        private const uint IdInitialize = 0x0150E828, IdEnumPhysical = 0xE5AC921F, IdFullName = 0xCEEE8E9F;
        private const uint IdMonitorInfo = 0xC12EB19E, IdMonitorStatus = 0xF40238EF;

        // Channel table: two known versions share the same header and channel layout (v3 adds larger relation entries)
        private static readonly uint[] InfoVersions = { (3u << 16) | 0xCA8, (1u << 16) | 0xAA8 };
        private const uint StatusVersion = (1u << 16) | 0x59C;
        private const int InfoMask = 16, InfoChannels = 40, InfoStride = 60, InfoType = 12, InfoRail = 16;
        private const int StatusMask = 4, StatusBoard = 8, StatusChannels = 28, StatusStride = 44;
        private const int MaxChannels = 32, GuardLen = 64;
        private const byte GuardByte = 0x5C;

        // input rail codes → connector ids; anything else (outputs, internal, totals) is never shown as a connector
        private static string RailId(uint rail)
        {
            switch (rail)
            {
                case 255: return "PCIE";   // PCIe slot 12 V
                case 218: return "16PIN0"; // 12VHPWR / 12V-2x6
                case 250: return "8PIN0";
                case 251: return "8PIN1";
                case 252: return "6PIN0";
                case 253: return "6PIN1";
                default: return null;
            }
        }
        // channel kinds that carry a sensed value (summation of sensed inputs, sensor, client-aligned sensor). Estimated
        // and lookup-table channels are model outputs, not measurements.
        private static int TypeRank(uint type) { return type == 8 ? 3 : type == 6 ? 2 : type == 1 ? 1 : 0; }

        private sealed class Gpu
        {
            public IntPtr Handle; public string Name; public uint InfoVersion;
            public uint Mask; public readonly Dictionary<string, int> Channels = new Dictionary<string, int>(); public string State = "pending";
        }

        private readonly List<Gpu> _gpus = new List<Gpu>();
        private FBuf _info, _status;
        private int _failures;
        private bool _disabled;
        private string _why;
        public bool Present { get { return _gpus.Count > 0; } }

        public NvRails()
        {
            try
            {
                string path = Path.Combine(Environment.SystemDirectory, "nvapi64.dll");
                if (!File.Exists(path)) return;
                IntPtr lib = LoadLibraryExW(path, IntPtr.Zero, LoadLibrarySearchSystem32);
                if (lib == IntPtr.Zero) return;
                IntPtr qi = GetProcAddress(lib, "nvapi_QueryInterface");
                if (qi == IntPtr.Zero) return;
                var query = (FQuery)Marshal.GetDelegateForFunctionPointer(qi, typeof(FQuery));
                var init = Fn<FInit>(query, IdInitialize);
                var enumerate = Fn<FEnum>(query, IdEnumPhysical);
                var name = Fn<FName>(query, IdFullName);
                _info = Fn<FBuf>(query, IdMonitorInfo);
                _status = Fn<FBuf>(query, IdMonitorStatus);
                if (init == null || enumerate == null || init() != 0) return;
                var handles = new IntPtr[64];
                int count;
                if (enumerate(handles, out count) != 0) return;
                for (int i = 0; i < Math.Min(count, 64); i++)
                {
                    var g = new Gpu { Handle = handles[i] };
                    var sb = new StringBuilder(64);
                    if (name != null && name(handles[i], sb) == 0) g.Name = sb.ToString();
                    _gpus.Add(g);
                }
                if (_info == null || _status == null) { _disabled = true; _why = "not_exposed"; }
            }
            catch { _gpus.Clear(); }
        }

        private static T Fn<T>(FQuery query, uint id) where T : class
        {
            IntPtr p = query(id);
            return p == IntPtr.Zero ? null : Marshal.GetDelegateForFunctionPointer(p, typeof(T)) as T;
        }

        // One call into the driver with a version-stamped buffer and guard bytes after it. Returns the payload or null.
        private byte[] Call(FBuf fn, IntPtr gpu, uint version, uint mask, out int status)
        {
            int size = (int)(version & 0xFFFF);
            IntPtr mem = Marshal.AllocHGlobal(size + GuardLen);
            try
            {
                var init = new byte[size + GuardLen];
                for (int i = size; i < init.Length; i++) init[i] = GuardByte;
                BitConverter.GetBytes(version).CopyTo(init, 0);
                if (mask != 0) BitConverter.GetBytes(mask).CopyTo(init, StatusMask);
                Marshal.Copy(init, 0, mem, init.Length);
                status = fn(gpu, mem);
                var back = new byte[size + GuardLen];
                Marshal.Copy(mem, back, 0, back.Length);
                for (int i = size; i < back.Length; i++)
                    if (back[i] != GuardByte) { _disabled = true; _why = "overrun"; status = -1; return null; }
                if (status != 0) return null;
                var payload = new byte[size];
                Array.Copy(back, payload, size);
                return payload;
            }
            finally { Marshal.FreeHGlobal(mem); }
        }

        private static uint U32(byte[] b, int off) { return BitConverter.ToUInt32(b, off); }

        private void Fail(string why)
        {
            _why = why;
            if (++_failures >= 3) _disabled = true;
        }

        // Reads the channel table once per GPU: which channels are inputs we can name, and which version the driver takes.
        private bool Describe(Gpu g)
        {
            foreach (uint v in InfoVersions)
            {
                int st;
                byte[] info = Call(_info, g.Handle, v, 0, out st);
                if (_disabled) return false;
                if (info == null) continue;
                if (U32(info, 0) != v) continue;
                g.InfoVersion = v;
                g.Mask = U32(info, InfoMask);
                var best = new Dictionary<string, int>();
                var rank = new Dictionary<string, int>();
                var ambiguous = new HashSet<string>();
                for (int c = 0; c < MaxChannels; c++)
                {
                    if ((g.Mask & (1u << c)) == 0) continue;
                    int o = InfoChannels + c * InfoStride;
                    uint type = U32(info, o + InfoType), rail = U32(info, o + InfoRail);
                    string id = RailId(rail);
                    int r = TypeRank(type);
                    if (id == null || r == 0) continue;
                    int prev;
                    if (!rank.TryGetValue(id, out prev) || r > prev) { rank[id] = r; best[id] = c; ambiguous.Remove(id); }
                    else if (r == prev) ambiguous.Add(id); // two channels of the same kind claim one connector: unreadable
                }
                foreach (var kv in best) if (!ambiguous.Contains(kv.Key)) g.Channels[kv.Key] = kv.Value;
                g.State = g.Channels.Count > 0 ? "ok" : "no_rails";
                return true;
            }
            g.State = "unsupported";
            return false;
        }

        private static string F(double v) { return v.ToString("0.###", CultureInfo.InvariantCulture); }

        // {"name":..,"state":"ok|no_rails|unsupported|disabled","boardW":..,"rails":[{"id","w","v","a"}]}
        public void Dump(StringBuilder sb)
        {
            sb.Append('[');
            for (int i = 0; i < _gpus.Count; i++)
            {
                Gpu g = _gpus[i];
                if (i > 0) sb.Append(',');
                sb.Append("{\"name\":"); HwSensors.Esc(sb, g.Name ?? "");
                var rails = new StringBuilder();
                double? board = null;
                try
                {
                    if (!_disabled && g.State == "pending" && !Describe(g) && !_disabled) Fail("info");
                    if (!_disabled && g.State == "ok")
                    {
                        int st;
                        byte[] s = Call(_status, g.Handle, StatusVersion, g.Mask, out st);
                        if (s == null || U32(s, 0) != StatusVersion) { if (!_disabled) Fail("status " + st); }
                        else
                        {
                            _failures = 0;
                            uint returned = U32(s, StatusMask);
                            uint boardMw = U32(s, StatusBoard);
                            if (boardMw > 0 && boardMw <= 3000000) board = boardMw / 1000.0;
                            bool firstRail = true;
                            foreach (var kv in g.Channels)
                            {
                                if ((returned & (1u << kv.Value)) == 0) continue;
                                int o = StatusChannels + kv.Value * StatusStride;
                                uint mw = U32(s, o), ma = U32(s, o + 12), uv = U32(s, o + 16);
                                double? w = mw != uint.MaxValue && mw <= 900000 ? mw / 1000.0 : (double?)null;
                                double? a = ma != uint.MaxValue && ma <= 80000 ? ma / 1000.0 : (double?)null;
                                double? v = uv != uint.MaxValue && uv > 0 && uv <= 30000000 ? uv / 1e6 : (double?)null;
                                string flag = null;
                                // a sensed 12 V input reads well above 0 V; W must agree with V x A (shunt + ADC rounding)
                                if (v.HasValue && v.Value < 1.0) { v = null; flag = "v_range"; }
                                if (w.HasValue && v.HasValue && a.HasValue)
                                {
                                    double va = v.Value * a.Value;
                                    if (Math.Abs(w.Value - va) > Math.Max(3.0, 0.15 * Math.Max(w.Value, va))) { w = null; a = null; flag = "w_va"; }
                                }
                                if (!w.HasValue && !v.HasValue && !a.HasValue && flag == null) continue;
                                rails.Append(firstRail ? "" : ",").Append("{\"id\":\"").Append(kv.Key).Append('"');
                                firstRail = false;
                                if (w.HasValue) rails.Append(",\"w\":").Append(F(w.Value));
                                if (v.HasValue) rails.Append(",\"v\":").Append(F(v.Value));
                                if (a.HasValue) rails.Append(",\"a\":").Append(F(a.Value));
                                if (flag != null) rails.Append(",\"bad\":\"").Append(flag).Append('"');
                                rails.Append('}');
                            }
                        }
                    }
                }
                catch (Exception ex) { Fail(ex.GetType().Name); }
                sb.Append(",\"state\":\"").Append(_disabled ? "disabled" : g.State).Append('"');
                if (_disabled && _why != null) { sb.Append(",\"why\":"); HwSensors.Esc(sb, _why); }
                if (board.HasValue) sb.Append(",\"boardW\":").Append(F(board.Value));
                sb.Append(",\"rails\":[").Append(rails).Append("]}");
            }
            sb.Append(']');
        }

        // Diagnostic: the raw channel table and one status sample, for verifying a new card. Read-only.
        public void Probe(TextWriter o)
        {
            if (_info == null || _status == null) { o.WriteLine("power-monitor query not exposed by this driver"); return; }
            foreach (Gpu g in _gpus)
            {
                o.WriteLine("gpu: " + g.Name + "  disabled=" + _disabled + " why=" + _why);
                foreach (uint v in InfoVersions)
                {
                    int st;
                    byte[] info = Call(_info, g.Handle, v, 0, out st);
                    o.WriteLine(string.Format("  info v=0x{0:X} status={1} {2}", v, st, info == null ? "(none)" : ""));
                    if (info == null) continue;
                    uint mask = U32(info, InfoMask);
                    o.WriteLine(string.Format("  supported={0} mask=0x{1:X8}", info[4], mask));
                    for (int c = 0; c < MaxChannels; c++)
                        if ((mask & (1u << c)) != 0)
                        {
                            int off = InfoChannels + c * InfoStride;
                            o.WriteLine(string.Format("    ch{0,2} type={1} rail={2} -> {3}", c, U32(info, off + InfoType), U32(info, off + InfoRail), RailId(U32(info, off + InfoRail)) ?? "-"));
                        }
                    byte[] s = Call(_status, g.Handle, StatusVersion, mask, out st);
                    o.WriteLine(string.Format("  status call={0} {1}", st, s == null ? "(none)" : ""));
                    if (s != null)
                    {
                        uint rm = U32(s, StatusMask);
                        o.WriteLine(string.Format("  returned=0x{0:X8} board_mW={1}", rm, U32(s, StatusBoard)));
                        for (int c = 0; c < MaxChannels; c++)
                            if ((rm & (1u << c)) != 0)
                            {
                                int off = StatusChannels + c * StatusStride;
                                o.WriteLine(string.Format("    ch{0,2} mW={1} min={2} max={3} mA={4} uV={5}", c, U32(s, off), U32(s, off + 4), U32(s, off + 8), U32(s, off + 12), U32(s, off + 16)));
                            }
                    }
                    break;
                }
            }
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
            if (args.Length > 0 && args[0] == "--probe-rails")
            {
                // read-only diagnostic of the NVIDIA per-connector power query; no LHM, no loop
                var probe = new NvRails();
                if (!probe.Present) Console.WriteLine("no NVIDIA GPU through NVAPI");
                else probe.Probe(Console.Out);
                return 0;
            }
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
            // the NVAPI rail query only ever runs when LHM found an NVIDIA GPU
            bool hasNvidia = false;
            foreach (IHardware h in computer.Hardware) if (h.HardwareType == HardwareType.GpuNvidia) hasNvidia = true;
            NvRails rails = null;
            if (hasNvidia) { try { rails = new NvRails(); } catch { rails = null; } }
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
                if (rails != null && rails.Present)
                {
                    var rb = new StringBuilder();
                    try { rails.Dump(rb); sb.Append(",\"nvrails\":").Append(rb); } catch { }
                }
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
