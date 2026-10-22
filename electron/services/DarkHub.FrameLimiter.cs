

using System;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
using System.Text;

[StructLayout(LayoutKind.Sequential)]
public struct PacerConfig
{
    public uint magic;
    public uint target_fps;
    public uint pacing_mode;
    public uint enabled;
}

// Telemetry v2 layout (see PacerTelemetryV2 in native_pacer/src/lib.rs). Offsets are explicit on purpose.
class TelemetrySnapshot
{
    public ulong FrameCount;
    public long LastPresentQpc;
    public long QpcFreq;
    public uint GamePid;
    public uint TargetFps;
    public float CurrentFps;
    public float CurrentFrametimeMs;
    public float AvgFps;
    public float Low1Fps;
    public float Low01Fps;
    public float JitterMs;
    public uint StutterCount;
    public uint SampleCount;
    public float[] Ring;
}

class DarkHubFrameLimiter
{
    static readonly CultureInfo INV = CultureInfo.InvariantCulture;

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll", SetLastError = true, ExactSpelling = true)]
    static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint flAllocationType, uint flProtect);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, byte[] lpBuffer, uint nSize, out UIntPtr lpNumberOfBytesWritten);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateRemoteThread(IntPtr hProcess, IntPtr lpThreadAttributes, uint dwStackSize, IntPtr lpStartAddress, IntPtr lpParameter, uint dwCreationFlags, IntPtr lpThreadId);
    [DllImport("kernel32.dll", CharSet = CharSet.Auto)]
    static extern IntPtr GetModuleHandle(string lpModuleName);
    [DllImport("kernel32", CharSet = CharSet.Ansi, ExactSpelling = true, SetLastError = true)]
    static extern IntPtr GetProcAddress(IntPtr hModule, string procName);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool QueryFullProcessImageName(IntPtr hProcess, uint flags, StringBuilder name, ref uint size);
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
    [DllImport("user32.dll")]
    static extern bool IsWindowVisible(IntPtr h);

    [DllImport("kernel32.dll", SetLastError = true, ExactSpelling = true)]
    static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, uint dwSize, uint dwFreeType);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    const uint PROCESS_CREATE_THREAD = 0x0002;
    const uint PROCESS_QUERY_INFORMATION = 0x0400;
    const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
    const uint PROCESS_VM_OPERATION = 0x0008;
    const uint PROCESS_VM_WRITE = 0x0020;
    const uint PROCESS_VM_READ = 0x0010;
    const uint MEM_COMMIT = 0x00001000;
    const uint MEM_RESERVE = 0x00002000;
    const uint MEM_RELEASE = 0x00008000;
    const uint PAGE_READWRITE = 4;

    static volatile int targetFps = 144;
    static volatile string pacingMode = "flatline";
    static volatile bool running = true;
    static int injectedPid = 0;

    static readonly HashSet<string> Blacklist = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "explorer","darkhub","electron","svchost","system","idle","steamwebhelper",
        "cmd","powershell","pwsh","conhost","taskmgr","chrome","firefox","msedge",
        "discord","spotify","code","devenv","dwm","csrss","lsass","services",
        "wininit","winlogon","smss","fontdrvhost","searchhost","runtimebroker",
        "applicationframehost","shellexperiencehost","startmenuexperiencehost",
        "textinputhost","ctfmon","securityhealthsystray","gamebar",
        "gamebarpresencewriter","gamebarftserver","widgets","msedgewebview2",
        "crashhandler","millennium","steam","epicwebhelper","csc","vbcscompiler",
        "audiodg","sihost","dllhost","taskhostw","wmiprvse","spoolsv","registry",
        "antimalware","windowsterminal","microsoftedgeupdate","onedrive","teams",
        "slack","telegram","whatsapp","zoom","vlc","notepad","everything",
        "powertoys","cursor","windsurf","copilot","cortana","calculator","paint",
        "snippingtool","git","node","python","java","framelimiter","mpcoresvc",
        "mchose","razer","synapse","logitech","ghub","corsair","icue","steelseries",
        "armoury","asus","aura","vanguard","easyanticheat","battleye","anticheat",
        "nvidia","nvcontainer","nvcplui","radeoncommander","cnext","cncmd"
    };

    static string GetProcessPath(int pid)
    {
        IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return "";
        StringBuilder sb = new StringBuilder(1024);
        uint sz = 1024;
        bool ok = QueryFullProcessImageName(h, 0, sb, ref sz);
        CloseHandle(h);
        return ok ? sb.ToString() : "";
    }

    static int DetectActiveGame(out string gameName)
    {
        gameName = "Nenhum Jogo Detectado";

        try
        {
            IntPtr fg = GetForegroundWindow();
            if (fg != IntPtr.Zero && IsWindowVisible(fg))
            {
                uint pid;
                GetWindowThreadProcessId(fg, out pid);
                if (pid > 4)
                {
                    try
                    {
                        using (Process p = Process.GetProcessById((int)pid))
                        {
                        string name = p.ProcessName.ToLower();
                        bool blacklisted = false;
                        foreach (string b in Blacklist)
                        {
                            if (name.Contains(b)) { blacklisted = true; break; }
                        }
                        if (!blacklisted)
                        {
                            string path = GetProcessPath((int)pid);
                            string lp = path.ToLower();
                            if (lp.Contains("steam") || lp.Contains("game") || lp.Contains("epic") || lp.Contains("gog") || p.Threads.Count >= 8)
                            {
                                gameName = p.ProcessName + ".exe";
                                return (int)pid;
                            }
                        }
                        }
                    }
                    catch { }
                }
            }
        }
        catch { }

        try
        {
            Process[] procs = Process.GetProcesses();
            Process best = null;
            long maxMemory = 0;

            try
            {
            foreach (Process p in procs)
            {
                try
                {
                    if (p.Id <= 4) continue;
                    string name = p.ProcessName.ToLower();
                    bool blacklisted = false;
                    foreach (string b in Blacklist)
                    {
                        if (name.Contains(b)) { blacklisted = true; break; }
                    }
                    if (blacklisted) continue;

                    string path = GetProcessPath(p.Id);
                    if (string.IsNullOrEmpty(path)) continue;
                    string lp = path.ToLower();

                    bool isGamePath = lp.Contains("steamapps") || lp.Contains("\\games\\") ||
                                     lp.Contains("epic games") || lp.Contains("gog galaxy") ||
                                     lp.Contains("-win64-shipping") || lp.Contains("\\game\\") ||
                                     lp.Contains("riot games") || lp.Contains("ubisoft") ||
                                     lp.Contains("ea games") || lp.Contains("battle.net");

                    if (isGamePath && p.Threads.Count >= 8 && p.WorkingSet64 > 80 * 1024 * 1024)
                    {
                        if (p.WorkingSet64 > maxMemory)
                        {
                            maxMemory = p.WorkingSet64;
                            best = p;
                        }
                    }
                }
                catch { }
            }

            if (best != null)
            {
                gameName = best.ProcessName + ".exe";
                return best.Id;
            }
            }
            finally
            {
                // Scanned every 1.5-4 s: release the Process objects (and any handles they opened).
                foreach (Process p in procs) { try { p.Dispose(); } catch { } }
            }
        }
        catch { }

        return 0;
    }

    static bool InjectHookDll(int pid)
    {
        try
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;
            string dllPath = Path.Combine(exeDir, "DarkHub.PacerHook.dll");
            if (!File.Exists(dllPath))
            {
                dllPath = Path.Combine(exeDir, "..", "..", "electron", "services", "DarkHub.PacerHook.dll");
            }
            if (!File.Exists(dllPath)) return false;

            IntPtr hProcess = OpenProcess(PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ, false, pid);
            if (hProcess == IntPtr.Zero) return false;

            byte[] dllBytes = Encoding.Unicode.GetBytes(dllPath + "\0");
            IntPtr allocMemAddress = VirtualAllocEx(hProcess, IntPtr.Zero, (uint)dllBytes.Length, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
            if (allocMemAddress == IntPtr.Zero) { CloseHandle(hProcess); return false; }

            UIntPtr bytesWritten;
            bool writeResult = WriteProcessMemory(hProcess, allocMemAddress, dllBytes, (uint)dllBytes.Length, out bytesWritten);
            if (!writeResult) { VirtualFreeEx(hProcess, allocMemAddress, 0, MEM_RELEASE); CloseHandle(hProcess); return false; }

            IntPtr loadLibraryAddr = GetProcAddress(GetModuleHandle("kernel32.dll"), "LoadLibraryW");
            if (loadLibraryAddr == IntPtr.Zero) { VirtualFreeEx(hProcess, allocMemAddress, 0, MEM_RELEASE); CloseHandle(hProcess); return false; }

            IntPtr hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, loadLibraryAddr, allocMemAddress, 0, IntPtr.Zero);
            if (hThread != IntPtr.Zero)
            {
                uint wait = WaitForSingleObject(hThread, 2000);
                CloseHandle(hThread);
                // Only free the path buffer once LoadLibraryW has returned (WAIT_OBJECT_0). On a
                // timeout the remote thread may still read it: leak 1 small page instead of crashing the game.
                if (wait == 0) VirtualFreeEx(hProcess, allocMemAddress, 0, MEM_RELEASE);
                CloseHandle(hProcess);
                return true;
            }
            VirtualFreeEx(hProcess, allocMemAddress, 0, MEM_RELEASE);
            CloseHandle(hProcess);
            return false;
        }
        catch
        {
            return false;
        }
    }

    static int capReset = 0;

    /// <summary>Removes the in-game cap (hook sees enabled=0 / uncapped). Idempotent; runs on STOP,
    /// stdin EOF, Ctrl+C, ProcessExit and fatal errors so no cap survives this process.</summary>
    static void ResetCap()
    {
        if (Interlocked.Exchange(ref capReset, 1) == 1) return;
        try { UpdateSharedConfig(0, 2, 0); } catch { }
    }

    static int ClampFps(int v)
    {
        if (v < 0) return 0;
        if (v > 1000) return 1000;
        return v;
    }

    static void UpdateSharedConfig(uint fps, uint mode)
    {
        UpdateSharedConfig(fps, mode, 1);
    }

    static void UpdateSharedConfig(uint fps, uint mode, uint enabled)
    {
        // After STOP/EOF the main loop may still be finishing an iteration (e.g. a fresh injection);
        // never re-enable the cap once it was reset.
        if (enabled != 0 && Volatile.Read(ref capReset) == 1) return;
        string[] names = { "DarkHub_Pacer_Config", "Local\\DarkHub_Pacer_Config", "Global\\DarkHub_Pacer_Config" };
        foreach (string name in names)
        {
            try
            {
                using (var mmf = MemoryMappedFile.OpenExisting(name))
                {
                    using (var acc = mmf.CreateViewAccessor())
                    {
                        PacerConfig cfg = new PacerConfig
                        {
                            magic = 0x4441524B,
                            target_fps = fps,
                            pacing_mode = mode,
                            enabled = enabled
                        };
                        acc.Write(0, ref cfg);
                        return;
                    }
                }
            }
            catch { }
        }
    }

    const uint TEL_MAGIC = 0x324D4C54; // 'TLM2'
    const int TEL_RING = 240;
    const int TEL_SIZE = 80 + TEL_RING * 4;

    static MemoryMappedFile telMap;
    static MemoryMappedViewAccessor telView;
    static readonly byte[] telBuf = new byte[TEL_SIZE];

    static bool OpenTelemetry()
    {
        if (telView != null) return true;
        string[] names = { "DarkHub_Pacer_Telemetry2", "Local\\DarkHub_Pacer_Telemetry2", "Global\\DarkHub_Pacer_Telemetry2" };
        foreach (string name in names)
        {
            try
            {
                telMap = MemoryMappedFile.OpenExisting(name, MemoryMappedFileRights.Read);
                telView = telMap.CreateViewAccessor(0, TEL_SIZE, MemoryMappedFileAccess.Read);
                return true;
            }
            catch { }
        }
        return false;
    }

    static void CloseTelemetry()
    {
        try { if (telView != null) telView.Dispose(); } catch { }
        try { if (telMap != null) telMap.Dispose(); } catch { }
        telView = null;
        telMap = null;
    }

    /// <summary>
    /// Reads one consistent snapshot using the writer's seqlock. Returns false when the game is not
    /// producing frames (no mapping, stale data, other process). Nothing is ever estimated here.
    /// </summary>
    static bool ReadSharedTelemetry(int expectedPid, out TelemetrySnapshot snap)
    {
        snap = null;
        if (!OpenTelemetry()) return false;

        for (int attempt = 0; attempt < 4; attempt++)
        {
            uint seq1, seq2;
            try
            {
                seq1 = telView.ReadUInt32(4);
                if ((seq1 & 1) != 0) { Thread.Sleep(1); continue; }
                telView.ReadArray(0, telBuf, 0, TEL_SIZE);
                seq2 = telView.ReadUInt32(4);
            }
            catch { CloseTelemetry(); return false; }

            if (seq1 != seq2) continue;

            if (BitConverter.ToUInt32(telBuf, 0) != TEL_MAGIC) return false;

            TelemetrySnapshot t = new TelemetrySnapshot();
            t.FrameCount = BitConverter.ToUInt64(telBuf, 8);
            t.LastPresentQpc = BitConverter.ToInt64(telBuf, 16);
            t.QpcFreq = BitConverter.ToInt64(telBuf, 24);
            t.GamePid = BitConverter.ToUInt32(telBuf, 32);
            t.TargetFps = BitConverter.ToUInt32(telBuf, 36);
            t.CurrentFps = BitConverter.ToSingle(telBuf, 40);
            t.CurrentFrametimeMs = BitConverter.ToSingle(telBuf, 44);
            t.AvgFps = BitConverter.ToSingle(telBuf, 48);
            t.Low1Fps = BitConverter.ToSingle(telBuf, 52);
            t.Low01Fps = BitConverter.ToSingle(telBuf, 56);
            t.JitterMs = BitConverter.ToSingle(telBuf, 60);
            t.StutterCount = BitConverter.ToUInt32(telBuf, 64);
            t.SampleCount = BitConverter.ToUInt32(telBuf, 68);
            uint ringLen = BitConverter.ToUInt32(telBuf, 72);
            if (ringLen > TEL_RING) ringLen = TEL_RING;
            t.Ring = new float[ringLen];
            for (int i = 0; i < ringLen; i++) t.Ring[i] = BitConverter.ToSingle(telBuf, 80 + i * 4);

            if (t.FrameCount == 0 || t.QpcFreq <= 0 || t.LastPresentQpc <= 0) return false;
            if (expectedPid > 0 && t.GamePid != (uint)expectedPid) return false;

            // Stale = the game stopped presenting (paused, minimised, closed).
            double ageSec = (double)(Stopwatch.GetTimestamp() - t.LastPresentQpc) / (double)Stopwatch.Frequency;
            if (ageSec > 1.5 || ageSec < -1.0) return false;

            snap = t;
            return true;
        }
        return false;
    }

    static string Fd(double v, int d)
    {
        return Math.Round(v, d).ToString(INV);
    }

    static string EscJ(string s) { return s == null ? "" : s.Replace("\\", "\\\\").Replace("\"", "\\\""); }

    static void EmitTelemetry(string game, TelemetrySnapshot t, string method)
    {
        bool live = t != null;
        double tft = targetFps > 0 ? 1000.0 / targetFps : 0;
        StringBuilder sb = new StringBuilder(2048);
        sb.Append("{\"ok\":true,\"isRunning\":true");
        sb.Append(",\"hasLiveTelemetry\":").Append(live ? "true" : "false");
        sb.Append(",\"targetFps\":").Append(targetFps);
        sb.Append(",\"pacingMode\":\"").Append(pacingMode).Append("\"");
        sb.Append(",\"targetFrametimeMs\":").Append(Fd(tft, 2));
        sb.Append(",\"currentFps\":").Append(live ? Fd(t.CurrentFps, 1) : "0");
        sb.Append(",\"avgFps\":").Append(live ? Fd(t.AvgFps, 1) : "0");
        sb.Append(",\"low1Percent\":").Append(live ? Fd(t.Low1Fps, 1) : "0");
        // 0.1% low needs >= 1000 captured frames; until then it is reported as "not available" (null).
        sb.Append(",\"low01Percent\":").Append(live && t.Low01Fps > 0 ? Fd(t.Low01Fps, 1) : "null");
        sb.Append(",\"currentFrametimeMs\":").Append(live ? Fd(t.CurrentFrametimeMs, 2) : "0");
        sb.Append(",\"frametimeJitterMs\":").Append(live ? Fd(t.JitterMs, 2) : "0");
        sb.Append(",\"stutterCount\":").Append(live ? t.StutterCount.ToString(INV) : "0");
        sb.Append(",\"sampleCount\":").Append(live ? t.SampleCount.ToString(INV) : "0");
        sb.Append(",\"activeGame\":\"").Append(EscJ(game)).Append("\"");
        sb.Append(",\"driverMethod\":\"").Append(EscJ(method)).Append("\"");
        sb.Append(",\"history\":[");
        if (live)
        {
            // Real frame times straight from the hook (most recent 120), oldest first.
            int start = Math.Max(0, t.Ring.Length - 120);
            for (int i = start; i < t.Ring.Length; i++)
            {
                if (i > start) sb.Append(",");
                sb.Append(Fd(t.Ring[i], 2));
            }
        }
        sb.Append("]}");
        Console.Out.WriteLine(sb.ToString());
        Console.Out.Flush();
    }

    static void ReadStdin()
    {
        try
        {
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (line == "STOP" || line == "EXIT") { running = false; ResetCap(); return; }
                if (!line.StartsWith("{")) continue;

                // A malformed line must never kill the reader thread (that would orphan the limiter).
                try
                {
                    int i = line.IndexOf("\"targetFps\":");
                    if (i >= 0)
                    {
                        string r = line.Substring(i + 12).TrimStart();
                        int e = r.IndexOfAny(new char[] { ',', '}', ' ' });
                        if (e >= 0)
                        {
                            int v;
                            if (int.TryParse(r.Substring(0, e).Trim(), NumberStyles.Integer, INV, out v))
                            {
                                v = ClampFps(v);
                                targetFps = v;
                                UpdateSharedConfig((uint)v, pacingMode == "uncapped" ? 2u : 0u);
                            }
                        }
                    }

                    i = line.IndexOf("\"pacingMode\":\"");
                    if (i >= 0)
                    {
                        string r = line.Substring(i + 14);
                        int e = r.IndexOf("\"");
                        if (e >= 0)
                        {
                            pacingMode = r.Substring(0, e);
                            UpdateSharedConfig((uint)targetFps, pacingMode == "uncapped" ? 2u : 0u);
                        }
                    }
                }
                catch { }
            }
        }
        catch { }
        finally
        {
            // EOF (Electron closed the pipe / died) or a broken stdin: stop and drop the cap.
            running = false;
            ResetCap();
        }
    }

    static void Main(string[] args)
    {
        Thread.CurrentThread.CurrentCulture = INV;
        Thread.CurrentThread.CurrentUICulture = INV;

        int argFps;
        if (args.Length > 0 && int.TryParse(args[0], NumberStyles.Integer, INV, out argFps)) targetFps = ClampFps(argFps);
        if (args.Length > 1) pacingMode = args[1];

        AppDomain.CurrentDomain.ProcessExit += (s, e) => ResetCap();
        Console.CancelKeyPress += (s, e) => { running = false; ResetCap(); };

        Thread stdinThread = new Thread(ReadStdin);
        stdinThread.IsBackground = true;
        stdinThread.Start();

        string activeGameName = "Nenhum Jogo Detectado";
        int currentGamePid = 0;
        DateTime lastScanTime = DateTime.MinValue;

        try
        {
        while (running)
        {
            DateTime now = DateTime.UtcNow;

            // Enumerating every process is expensive: scan every 1.5s while tracking a game, every 4s while idle.
            double scanEveryMs = currentGamePid == 0 ? 4000 : 1500;
            if ((now - lastScanTime).TotalMilliseconds > scanEveryMs || lastScanTime == DateTime.MinValue)
            {
                string detectedName;
                int detectedPid = DetectActiveGame(out detectedName);
                if (detectedPid > 0)
                {
                    activeGameName = detectedName;
                    currentGamePid = detectedPid;

                    if (injectedPid != detectedPid)
                    {
                        if (InjectHookDll(detectedPid))
                        {
                            injectedPid = detectedPid;
                            Thread.Sleep(150);
                            UpdateSharedConfig((uint)targetFps, pacingMode == "uncapped" ? 2u : 0u);
                        }
                    }
                }
                else
                {
                    activeGameName = "Nenhum Jogo Detectado";
                    currentGamePid = 0;
                }
                lastScanTime = now;
            }

            TelemetrySnapshot tel;
            if (ReadSharedTelemetry(currentGamePid, out tel))
            {
                EmitTelemetry(activeGameName, tel, "In-Game DXGI Present Hook");
            }
            else
            {
                EmitTelemetry(activeGameName, null, currentGamePid > 0 ? "Aguardando frames do jogo..." : "Procurando Renderizador 3D...");
            }

            Thread.Sleep(80);
        }
        }
        catch (IOException) { /* stdout pipe closed: parent is gone */ }
        finally
        {
            running = false;
            ResetCap();
        }
    }
}
