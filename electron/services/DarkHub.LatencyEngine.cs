

using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Net;
using System.Net.Sockets;

[StructLayout(LayoutKind.Sequential)]
public struct PROCESS_POWER_THROTTLING_STATE
{
    public uint Version;
    public uint ControlMask;
    public uint StateMask;
}

public class DarkHubLatencyEngine
{

    [DllImport("ntdll.dll", SetLastError = false)]
    public static extern int NtSetTimerResolution(uint DesiredResolution, bool SetResolution, out uint CurrentResolution);

    [DllImport("ntdll.dll", SetLastError = false)]
    public static extern int NtQueryTimerResolution(out uint MinimumResolution, out uint MaximumResolution, out uint CurrentResolution);

    [DllImport("winmm.dll", EntryPoint = "timeBeginPeriod", SetLastError = false)]
    public static extern uint TimeBeginPeriod(uint uPeriod);

    [DllImport("winmm.dll", EntryPoint = "timeEndPeriod", SetLastError = false)]
    public static extern uint TimeEndPeriod(uint uPeriod);

    [DllImport("Avrt.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr AvSetMmThreadCharacteristicsW(string TaskName, ref uint TaskIndex);

    [DllImport("Avrt.dll", SetLastError = true)]
    public static extern bool AvRevertMmThreadCharacteristics(IntPtr AvrtHandle);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetPriorityClass(IntPtr hProcess, uint dwPriorityClass);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetProcessPriorityBoost(IntPtr hProcess, bool bDisablePriorityBoost);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetProcessAffinityMask(IntPtr hProcess, UIntPtr dwProcessAffinityMask);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool GetProcessAffinityMask(IntPtr hProcess, out UIntPtr lpProcessAffinityMask, out UIntPtr lpSystemAffinityMask);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll")]
    public static extern IntPtr GetCurrentProcess();

    [DllImport("kernel32.dll")]
    public static extern IntPtr GetCurrentThread();

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetThreadPriority(IntPtr hThread, int nPriority);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetProcessInformation(IntPtr hProcess, int ProcessInformationClass, ref PROCESS_POWER_THROTTLING_STATE ProcessInformation, uint ProcessInformationSize);

    [DllImport("iphlpapi.dll", SetLastError = true)]
    public static extern IntPtr IcmpCreateFile();

    [DllImport("iphlpapi.dll", SetLastError = true)]
    public static extern bool IcmpCloseHandle(IntPtr icmpHandle);

    [DllImport("iphlpapi.dll", SetLastError = true)]
    public static extern uint IcmpSendEcho(
        IntPtr icmpHandle,
        uint destinationAddress,
        byte[] requestData,
        ushort requestSize,
        IntPtr requestOptions,
        byte[] replyBuffer,
        uint replySize,
        uint timeout
    );

    [DllImport("psapi.dll", SetLastError = true)]
    public static extern int EmptyWorkingSet(IntPtr hProcess);

    const uint PROCESS_SET_INFORMATION = 0x0200;
    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const uint PROCESS_ALL_ACCESS = 0x1F0FFF;

    const uint NORMAL_PRIORITY_CLASS = 0x00000020;
    const uint IDLE_PRIORITY_CLASS = 0x00000040;
    const uint HIGH_PRIORITY_CLASS = 0x00000080;
    const uint REALTIME_PRIORITY_CLASS = 0x00000100;
    const uint BELOW_NORMAL_PRIORITY_CLASS = 0x00004000;
    const uint ABOVE_NORMAL_PRIORITY_CLASS = 0x00008000;

    const int THREAD_PRIORITY_HIGHEST = 2;
    const int THREAD_PRIORITY_TIME_CRITICAL = 15;

    const int ProcessPowerThrottling = 0x4;
    const uint PROCESS_POWER_THROTTLING_CURRENT_VERSION = 1;
    const uint PROCESS_POWER_THROTTLING_EXECUTION_SPEED = 0x1;
    const uint PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION = 0x4;

    static volatile bool isRunning = true;
    static volatile bool isTimerLocked = false;
    static uint lockedResolution100ns = 5000;
    static IntPtr mmcssHandle = IntPtr.Zero;
    static Thread timerWorkerThread = null;
    static readonly object lockObj = new object();

    public static void Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        Console.InputEncoding = Encoding.UTF8;

        try
        {
            SetPriorityClass(GetCurrentProcess(), HIGH_PRIORITY_CLASS);
            SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);

            var powerState = new PROCESS_POWER_THROTTLING_STATE
            {
                Version = PROCESS_POWER_THROTTLING_CURRENT_VERSION,
                ControlMask = PROCESS_POWER_THROTTLING_EXECUTION_SPEED | PROCESS_POWER_THROTTLING_IGNORE_TIMER_RESOLUTION,
                StateMask = 0
            };
            SetProcessInformation(GetCurrentProcess(), ProcessPowerThrottling, ref powerState, (uint)Marshal.SizeOf(powerState));
        }
        catch {}

        SendJson(new Dictionary<string, object>
        {
            { "event", "ready" },
            { "version", "1.0.0" },
            { "pid", Process.GetCurrentProcess().Id }
        });

        Thread pipeThread = new Thread(NamedPipeServerWorker);
        pipeThread.IsBackground = true;
        pipeThread.Start();

        string line;
        while (isRunning && (line = Console.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            string response = HandleCommand(line.Trim());
            if (!string.IsNullOrEmpty(response))
            {
                Console.WriteLine(response);
            }
        }

        UnlockTimerResolution();
    }

    private static void NamedPipeServerWorker()
    {
        while (isRunning)
        {
            try
            {
                using (var server = new NamedPipeServerStream("DarkHubLatencyEngine", PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous))
                {
                    server.WaitForConnection();
                    using (var reader = new StreamReader(server, Encoding.UTF8))
                    using (var writer = new StreamWriter(server, Encoding.UTF8) { AutoFlush = true })
                    {
                        string request = reader.ReadLine();
                        if (!string.IsNullOrWhiteSpace(request))
                        {
                            string response = HandleCommand(request.Trim());
                            writer.WriteLine(response);
                        }
                    }
                }
            }
            catch
            {
                Thread.Sleep(100);
            }
        }
    }

    private static string HandleCommand(string json)
    {
        try
        {

            string cmd = GetJsonStringValue(json, "cmd");
            if (string.IsNullOrEmpty(cmd))
            {
                return FormatResponse(false, "missing_cmd", null);
            }

            switch (cmd.ToLowerInvariant())
            {
                case "ping_native":
                case "ping":
                {
                    string host = GetJsonStringValue(json, "host");
                    if (string.IsNullOrEmpty(host)) host = "1.1.1.1";
                    int timeout = GetJsonIntValue(json, "timeout_ms", 2000);
                    return HandlePingNative(host, timeout);
                }

                case "lock_timer":
                {
                    uint res = (uint)GetJsonIntValue(json, "resolution_100ns", 5000);
                    if (res < 5000) res = 5000;
                    LockTimerResolution(res);
                    return FormatResponse(true, "timer_locked", QueryTimerResolutionInternal());
                }

                case "unlock_timer":
                {
                    UnlockTimerResolution();
                    return FormatResponse(true, "timer_unlocked", QueryTimerResolutionInternal());
                }

                case "query_timer":
                {
                    return FormatResponse(true, "timer_status", QueryTimerResolutionInternal());
                }

                case "boost_process":
                {
                    int pid = GetJsonIntValue(json, "pid", 0);
                    string prio = GetJsonStringValue(json, "priority") ?? "high";
                    bool pCoresOnly = GetJsonBoolValue(json, "p_cores_only", false);
                    return HandleBoostProcess(pid, prio, pCoresOnly);
                }

                case "set_affinity":
                {
                    int pid = GetJsonIntValue(json, "pid", 0);
                    string maskHex = GetJsonStringValue(json, "mask_hex");
                    return HandleSetAffinity(pid, maskHex);
                }

                case "get_cpu_topology":
                {
                    return FormatResponse(true, "cpu_topology", GetCpuTopologyInternal());
                }

                case "clean_ram":
                {
                    int excludePid = GetJsonIntValue(json, "exclude_pid", -1);
                    return HandleCleanRam(excludePid);
                }

                case "exit":
                {
                    isRunning = false;
                    UnlockTimerResolution();
                    return FormatResponse(true, "exiting", null);
                }

                default:
                    return FormatResponse(false, "unknown_command: " + cmd, null);
            }
        }
        catch (Exception ex)
        {
            return FormatResponse(false, ex.Message, null);
        }
    }

    private static void LockTimerResolution(uint desired100ns)
    {
        lock (lockObj)
        {
            lockedResolution100ns = desired100ns;
            isTimerLocked = true;

            if (timerWorkerThread == null || !timerWorkerThread.IsAlive)
            {
                timerWorkerThread = new Thread(TimerWorkerLoop);
                timerWorkerThread.Priority = ThreadPriority.Highest;
                timerWorkerThread.IsBackground = true;
                timerWorkerThread.Start();
            }
        }
    }

    private static void UnlockTimerResolution()
    {
        lock (lockObj)
        {
            isTimerLocked = false;
            try
            {
                TimeEndPeriod(1);
                uint cur;
                NtSetTimerResolution(lockedResolution100ns, false, out cur);
                if (mmcssHandle != IntPtr.Zero)
                {
                    AvRevertMmThreadCharacteristics(mmcssHandle);
                    mmcssHandle = IntPtr.Zero;
                }
            }
            catch {}
        }
    }

    private static void TimerWorkerLoop()
    {

        try
        {
            uint taskIndex = 0;
            mmcssHandle = AvSetMmThreadCharacteristicsW("Games", ref taskIndex);
            if (mmcssHandle == IntPtr.Zero)
            {
                taskIndex = 0;
                mmcssHandle = AvSetMmThreadCharacteristicsW("Pro Audio", ref taskIndex);
            }
        }
        catch {}

        try { TimeBeginPeriod(1); } catch {}

        try
        {
            uint cur;
            NtSetTimerResolution(lockedResolution100ns, true, out cur);
        }
        catch {}

        while (isTimerLocked && isRunning)
        {
            Thread.Sleep(1000);
        }
    }

    private static Dictionary<string, object> QueryTimerResolutionInternal()
    {
        uint min = 156250, max = 5000, current = 156250;
        try
        {
            NtQueryTimerResolution(out min, out max, out current);
        }
        catch {}

        double curMs = Math.Round(current / 10000.0, 4);
        double minMs = Math.Round(min / 10000.0, 4);
        double maxMs = Math.Round(max / 10000.0, 4);

        return new Dictionary<string, object>
        {
            { "locked", isTimerLocked },
            { "current_100ns", current },
            { "min_100ns", min },
            { "max_100ns", max },
            { "current_ms", curMs },
            { "min_ms", minMs },
            { "max_ms", maxMs }
        };
    }

    private static string HandleBoostProcess(int pid, string prio, bool pCoresOnly)
    {
        if (pid <= 4) return FormatResponse(false, "invalid_pid", null);

        IntPtr hProcess = OpenProcess(PROCESS_SET_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (hProcess == IntPtr.Zero)
        {
            return FormatResponse(false, "failed_to_open_process_handle", null);
        }

        try
        {

            uint prioClass = HIGH_PRIORITY_CLASS;
            if (prio.Equals("realtime", StringComparison.OrdinalIgnoreCase)) prioClass = REALTIME_PRIORITY_CLASS;
            else if (prio.Equals("above_normal", StringComparison.OrdinalIgnoreCase)) prioClass = ABOVE_NORMAL_PRIORITY_CLASS;
            else if (prio.Equals("normal", StringComparison.OrdinalIgnoreCase)) prioClass = NORMAL_PRIORITY_CLASS;

            bool prioOk = SetPriorityClass(hProcess, prioClass);

            SetProcessPriorityBoost(hProcess, false);

            bool affinityOk = true;
            ulong appliedMask = 0;
            if (pCoresOnly)
            {
                var topo = GetCpuTopologyInternal();
                if (topo.ContainsKey("p_core_mask_ulong"))
                {
                    appliedMask = (ulong)topo["p_core_mask_ulong"];
                    if (appliedMask > 0)
                    {
                        affinityOk = SetProcessAffinityMask(hProcess, new UIntPtr(appliedMask));
                    }
                }
            }

            return FormatResponse(true, "process_boosted", new Dictionary<string, object>
            {
                { "pid", pid },
                { "priority_ok", prioOk },
                { "priority_class", prio },
                { "affinity_ok", affinityOk },
                { "affinity_mask", appliedMask > 0 ? "0x" + appliedMask.ToString("X") : "default" }
            });
        }
        finally
        {
            CloseHandle(hProcess);
        }
    }

    private static string HandleSetAffinity(int pid, string maskHex)
    {
        if (pid <= 4) return FormatResponse(false, "invalid_pid", null);

        ulong mask = 0;
        if (!string.IsNullOrEmpty(maskHex))
        {
            if (maskHex.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
                maskHex = maskHex.Substring(2);
            ulong.TryParse(maskHex, System.Globalization.NumberStyles.HexNumber, null, out mask);
        }

        if (mask == 0) return FormatResponse(false, "invalid_mask", null);

        IntPtr hProcess = OpenProcess(PROCESS_SET_INFORMATION, false, pid);
        if (hProcess == IntPtr.Zero) return FormatResponse(false, "failed_to_open_process_handle", null);

        try
        {
            bool ok = SetProcessAffinityMask(hProcess, new UIntPtr(mask));
            return FormatResponse(ok, ok ? "affinity_set" : "failed_to_set_affinity", new Dictionary<string, object>
            {
                { "pid", pid },
                { "mask", "0x" + mask.ToString("X") }
            });
        }
        finally
        {
            CloseHandle(hProcess);
        }
    }

    private static string HandleCleanRam(int excludePid)
    {
        int count = 0;
        var critical = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
            "System", "Idle", "Registry", "smss", "csrss", "wininit", "winlogon", "services", "lsass", "dwm", "audiodg", "DarkHub", "DarkHub.LatencyEngine"
        };

        Process[] procs = Process.GetProcesses();
        foreach (var p in procs)
        {
            try
            {
                if (p.Id == excludePid || p.Id <= 4) continue;
                if (critical.Contains(p.ProcessName)) continue;
                if (p.WorkingSet64 < 100 * 1024 * 1024) continue;

                EmptyWorkingSet(p.Handle);
                count++;
            }
            catch {}
            finally {
                try { p.Dispose(); } catch {}
            }
        }

        return FormatResponse(true, "ram_cleaned", new Dictionary<string, object>
        {
            { "processes_cleaned", count }
        });
    }

    private static Dictionary<string, object> GetCpuTopologyInternal()
    {
        int logicalCores = Environment.ProcessorCount;
        ulong allCoresMask = 0;
        for (int i = 0; i < Math.Min(64, logicalCores); i++)
        {
            allCoresMask |= (1UL << i);
        }

        ulong pCoreMask = allCoresMask;
        if (logicalCores >= 12)
        {

            pCoreMask = 0xFFFFUL & allCoresMask;
        }

        return new Dictionary<string, object>
        {
            { "logical_cores", logicalCores },
            { "all_cores_mask_hex", "0x" + allCoresMask.ToString("X") },
            { "p_core_mask_hex", "0x" + pCoreMask.ToString("X") },
            { "p_core_mask_ulong", pCoreMask }
        };
    }

    private static string HandlePingNative(string host, int timeoutMs)
    {
        IntPtr icmpHandle = IntPtr.Zero;
        try
        {
            IPAddress ip;
            if (!IPAddress.TryParse(host, out ip))
            {
                IPHostEntry entry = Dns.GetHostEntry(host);
                if (entry.AddressList.Length == 0)
                    return FormatResponse(false, "could_not_resolve_host", null);
                ip = entry.AddressList[0];
            }

            if (ip.AddressFamily != AddressFamily.InterNetwork)
            {

                using (var p = new System.Net.NetworkInformation.Ping())
                {
                    var reply = p.Send(ip, timeoutMs);
                    return FormatResponse(reply.Status == System.Net.NetworkInformation.IPStatus.Success, reply.Status.ToString(), new Dictionary<string, object>
                    {
                        { "host", host },
                        { "ip", ip.ToString() },
                        { "latency_ms", reply.RoundtripTime },
                        { "status", reply.Status.ToString() }
                    });
                }
            }

            icmpHandle = IcmpCreateFile();
            if (icmpHandle == IntPtr.Zero)
            {
                return FormatResponse(false, "icmp_create_file_failed", null);
            }

            uint ipUint = BitConverter.ToUInt32(ip.GetAddressBytes(), 0);
            byte[] sendData = Encoding.ASCII.GetBytes("DarkHubUltraLowLatencyNativePing");
            uint replySize = (uint)(Marshal.SizeOf(typeof(ICMP_ECHO_REPLY)) + sendData.Length + 64);
            byte[] replyBuffer = new byte[replySize];

            uint replies = IcmpSendEcho(icmpHandle, ipUint, sendData, (ushort)sendData.Length, IntPtr.Zero, replyBuffer, replySize, (uint)timeoutMs);

            if (replies > 0)
            {
                GCHandle handle = GCHandle.Alloc(replyBuffer, GCHandleType.Pinned);
                try
                {
                    ICMP_ECHO_REPLY echoReply = (ICMP_ECHO_REPLY)Marshal.PtrToStructure(handle.AddrOfPinnedObject(), typeof(ICMP_ECHO_REPLY));
                    return FormatResponse(true, "success", new Dictionary<string, object>
                    {
                        { "host", host },
                        { "ip", ip.ToString() },
                        { "latency_ms", echoReply.RoundTripTime },
                        { "status", echoReply.Status == 0 ? "Success" : ("Status_" + echoReply.Status) },
                        { "ttl", echoReply.Options.Ttl }
                    });
                }
                finally
                {
                    handle.Free();
                }
            }

            return FormatResponse(false, "timeout", new Dictionary<string, object>
            {
                { "host", host },
                { "latency_ms", timeoutMs },
                { "status", "TimedOut" }
            });
        }
        catch (Exception ex)
        {
            return FormatResponse(false, ex.Message, null);
        }
        finally
        {
            if (icmpHandle != IntPtr.Zero)
            {
                IcmpCloseHandle(icmpHandle);
            }
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct IP_OPTION_INFORMATION
    {
        public byte Ttl;
        public byte Tos;
        public byte Flags;
        public byte OptionsSize;
        public IntPtr OptionsData;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct ICMP_ECHO_REPLY
    {
        public uint Address;
        public uint Status;
        public uint RoundTripTime;
        public ushort DataSize;
        public ushort Reserved;
        public IntPtr Data;
        public IP_OPTION_INFORMATION Options;
    }

    private static void SendJson(Dictionary<string, object> data)
    {
        Console.WriteLine(DictionaryToJson(data));
    }

    private static string FormatResponse(bool ok, string message, object data)
    {
        var dict = new Dictionary<string, object>
        {
            { "ok", ok },
            { "message", message }
        };
        if (data != null) dict["data"] = data;
        return DictionaryToJson(dict);
    }

    private static string DictionaryToJson(Dictionary<string, object> dict)
    {
        var sb = new StringBuilder();
        sb.Append("{");
        bool first = true;
        foreach (var kv in dict)
        {
            if (!first) sb.Append(",");
            first = false;
            sb.Append("\"").Append(kv.Key).Append("\":");
            sb.Append(ObjectToJson(kv.Value));
        }
        sb.Append("}");
        return sb.ToString();
    }

    private static string ObjectToJson(object obj)
    {
        if (obj == null) return "null";
        if (obj is bool) return (bool)obj ? "true" : "false";
        if (obj is int || obj is long || obj is uint || obj is ulong || obj is double || obj is float)
            return Convert.ToString(obj, System.Globalization.CultureInfo.InvariantCulture);
        if (obj is string)
            return "\"" + ((string)obj).Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "") + "\"";
        if (obj is Dictionary<string, object>)
            return DictionaryToJson((Dictionary<string, object>)obj);
        return "\"" + obj.ToString() + "\"";
    }

    private static string GetJsonStringValue(string json, string key)
    {
        string needle = "\"" + key + "\":";
        int idx = json.IndexOf(needle, StringComparison.OrdinalIgnoreCase);
        if (idx == -1) return null;
        int start = idx + needle.Length;
        while (start < json.Length && (json[start] == ' ' || json[start] == '"')) start++;
        int end = start;
        while (end < json.Length && json[end] != '"' && json[end] != ',' && json[end] != '}') end++;
        return json.Substring(start, end - start).Trim().Replace("\"", "");
    }

    private static int GetJsonIntValue(string json, string key, int fallback)
    {
        string needle = "\"" + key + "\":";
        int idx = json.IndexOf(needle, StringComparison.OrdinalIgnoreCase);
        if (idx == -1) return fallback;
        int start = idx + needle.Length;
        while (start < json.Length && (json[start] == ' ' || json[start] == ':')) start++;
        int end = start;
        while (end < json.Length && (char.IsDigit(json[end]) || json[end] == '-')) end++;
        int res;
        if (int.TryParse(json.Substring(start, end - start), out res)) return res;
        return fallback;
    }

    private static bool GetJsonBoolValue(string json, string key, bool fallback)
    {
        string needle = "\"" + key + "\":";
        int idx = json.IndexOf(needle, StringComparison.OrdinalIgnoreCase);
        if (idx == -1) return fallback;
        string sub = json.Substring(idx + needle.Length, Math.Min(10, json.Length - (idx + needle.Length))).ToLowerInvariant();
        if (sub.Contains("true")) return true;
        if (sub.Contains("false")) return false;
        return fallback;
    }
}
