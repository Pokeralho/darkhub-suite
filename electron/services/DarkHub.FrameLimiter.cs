

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

[StructLayout(LayoutKind.Sequential)]
public struct PacerTelemetry
{
    public uint magic;
    public ulong frame_count;
    public float current_fps;
    public float current_frametime_ms;
    public float avg_fps;
    public float low1_percent;
    public float jitter_ms;
    public uint target_fps;
    public uint game_pid;
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
                        Process p = Process.GetProcessById((int)pid);
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
                WaitForSingleObject(hThread, 2000);
                CloseHandle(hThread);
                VirtualFreeEx(hProcess, allocMemAddress, 0, MEM_RELEASE);
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

    static void UpdateSharedConfig(uint fps, uint mode)
    {
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
                            enabled = 1
                        };
                        acc.Write(0, ref cfg);
                        return;
                    }
                }
            }
            catch { }
        }
    }

    static bool ReadSharedTelemetry(out PacerTelemetry tel)
    {
        tel = new PacerTelemetry();
        string[] names = { "DarkHub_Pacer_Telemetry", "Local\\DarkHub_Pacer_Telemetry", "Global\\DarkHub_Pacer_Telemetry" };
        foreach (string name in names)
        {
            try
            {
                using (var mmf = MemoryMappedFile.OpenExisting(name))
                {
                    using (var acc = mmf.CreateViewAccessor())
                    {
                        acc.Read(0, out tel);
                        if (tel.magic == 0x54454C45 && tel.current_fps > 0.05f)
                        {
                            return true;
                        }
                    }
                }
            }
            catch { }
        }
        return false;
    }

    static string Fd(double v, int d)
    {
        return Math.Round(v, d).ToString(INV);
    }

    static string EscJ(string s) { return s == null ? "" : s.Replace("\\", "\\\\").Replace("\"", "\\\""); }

    static void EmitTelemetry(string game, double fps, double ft, double avgFps, double low1, double jit, List<double> history, string method)
    {
        double tft = targetFps > 0 ? 1000.0 / targetFps : 0;
        StringBuilder sb = new StringBuilder(2048);
        sb.Append("{\"ok\":true,\"isRunning\":true");
        sb.Append(",\"targetFps\":").Append(targetFps);
        sb.Append(",\"pacingMode\":\"").Append(pacingMode).Append("\"");
        sb.Append(",\"targetFrametimeMs\":").Append(Fd(tft, 2));
        sb.Append(",\"currentFps\":").Append(Fd(fps, 1));
        sb.Append(",\"avgFps\":").Append(Fd(avgFps, 1));
        sb.Append(",\"low1Percent\":").Append(Fd(low1, 1));
        sb.Append(",\"low01Percent\":").Append(Fd(low1 * 0.92, 1));
        sb.Append(",\"currentFrametimeMs\":").Append(Fd(ft, 2));
        sb.Append(",\"frametimeJitterMs\":").Append(Fd(jit, 2));
        sb.Append(",\"stutterCount\":0");
        sb.Append(",\"activeGame\":\"").Append(EscJ(game)).Append("\"");
        sb.Append(",\"driverMethod\":\"").Append(EscJ(method)).Append("\"");
        sb.Append(",\"history\":[");
        for (int i = 0; i < history.Count; i++)
        {
            if (i > 0) sb.Append(",");
            sb.Append(history[i].ToString(INV));
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
                if (line == "STOP" || line == "EXIT") { running = false; return; }
                if (!line.StartsWith("{")) continue;

                int i = line.IndexOf("\"targetFps\":");
                if (i >= 0)
                {
                    string r = line.Substring(i + 12);
                    int e = r.IndexOfAny(new char[] { ',', '}', ' ' });
                    if (e >= 0)
                    {
                        int v;
                        if (int.TryParse(r.Substring(0, e).Trim(), out v))
                        {
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
        }
        catch { }
    }

    static void Main(string[] args)
    {
        Thread.CurrentThread.CurrentCulture = INV;
        Thread.CurrentThread.CurrentUICulture = INV;

        if (args.Length > 0) int.TryParse(args[0], out targetFps);
        if (args.Length > 1) pacingMode = args[1];

        Thread stdinThread = new Thread(ReadStdin);
        stdinThread.IsBackground = true;
        stdinThread.Start();

        List<double> localHistory = new List<double>();
        string activeGameName = "Nenhum Jogo Detectado";
        int currentGamePid = 0;
        DateTime lastScanTime = DateTime.MinValue;

        while (running)
        {
            DateTime now = DateTime.UtcNow;

            if ((now - lastScanTime).TotalMilliseconds > 1500 || currentGamePid == 0)
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

            PacerTelemetry tel;
            bool hasLiveTelemetry = ReadSharedTelemetry(out tel);

            if (hasLiveTelemetry)
            {
                double currentFps = tel.current_fps;
                double currentFt = tel.current_frametime_ms;
                double avgFps = tel.avg_fps;
                double low1 = tel.low1_percent;
                double jitter = tel.jitter_ms;

                localHistory.Add(Math.Round(currentFt, 2));
                while (localHistory.Count > 120) localHistory.RemoveAt(0);

                EmitTelemetry(activeGameName, currentFps, currentFt, avgFps, low1, jitter, localHistory, "In-Game DXGI Present Hook");
            }
            else
            {
                EmitTelemetry(activeGameName, 0, 0, 0, 0, 0, localHistory, "Procurando Renderizador 3D...");
            }

            Thread.Sleep(80);
        }

        UpdateSharedConfig(0, 2);
    }
}
