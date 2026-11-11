

using System;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Diagnostics;
using System.Threading;
using System.Collections.Generic;
using System.Security.Principal;
using System.Text;

// Controller -> hook config v2, shared memory "DarkHub_Pacer_Config2" (created by the hook in the
// game, opened here). Must stay byte-identical to PacerConfigV2 in native_pacer/src/lib.rs, which
// is read by BOTH the x64 and the x86 hook: fixed-size fields at explicit offsets only.
// tests/pacerConfigLayout.test.ts compares the two tables; `--layout` prints this one at runtime.
[StructLayout(LayoutKind.Explicit, Size = 64)]
public struct PacerConfigV2
{
    [FieldOffset(0)] public uint magic;          // 'DARK'
    [FieldOffset(4)] public uint version;        // 2
    [FieldOffset(8)] public uint size;           // 64
    [FieldOffset(12)] public uint enabled;       // 1 = limiter on
    [FieldOffset(16)] public uint target_fps;
    [FieldOffset(20)] public uint pacing_mode;   // 2 = uncapped
    [FieldOffset(24)] public long heartbeat_qpc; // QPC of the last beat; 0 = controller gone
    [FieldOffset(32)] public ulong adapter_luid; // LowPart | HighPart << 32; 0 = any adapter
    [FieldOffset(40)] public uint controller_pid;
    [FieldOffset(44)] public uint flags;
    [FieldOffset(48)] public ulong reserved0;
    [FieldOffset(56)] public ulong reserved1;
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

/// <summary>A process as identified at detection time. PID alone is not an identity (PIDs are
/// recycled); PID + creation time + image path is.</summary>
class GameTarget
{
    public int Pid;
    public long CreationTime; // FILETIME (100 ns since 1601), from GetProcessTimes
    public string Path;
    public string Name;
    public string Key { get { return Pid.ToString(CultureInfo.InvariantCulture) + ":" + CreationTime.ToString(CultureInfo.InvariantCulture); } }
}

class InjectResult
{
    public bool Ok;
    public bool Permanent; // refusals are not retried for the same process identity
    public string Code;
    public string Message;
    public string Arch = "";
    public static InjectResult Success(string arch, string msg) { return new InjectResult { Ok = true, Code = "ok", Message = msg, Arch = arch }; }
    public static InjectResult Refuse(string code, string msg) { return new InjectResult { Ok = false, Permanent = true, Code = code, Message = msg }; }
    public static InjectResult Fail(string code, string msg) { return new InjectResult { Ok = false, Permanent = false, Code = code, Message = msg }; }
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
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessTimes(IntPtr hProcess, out long creation, out long exit, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeProcess(IntPtr hProcess, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetExitCodeThread(IntPtr hThread, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool IsWow64Process(IntPtr hProcess, out bool wow64);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool IsWow64Process2(IntPtr hProcess, out ushort processMachine, out ushort nativeMachine);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ProcessIdToSessionId(uint pid, out uint session);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetProcessInformation(IntPtr hProcess, int infoClass, out uint info, uint size);
    [DllImport("kernel32.dll", SetLastError = true, EntryPoint = "K32EnumProcessModulesEx")]
    static extern bool EnumProcessModulesEx(IntPtr hProcess, [Out] IntPtr[] modules, uint cb, out uint needed, uint filter);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "K32GetModuleBaseNameW")]
    static extern uint GetModuleBaseName(IntPtr hProcess, IntPtr module, StringBuilder name, uint size);
    [DllImport("advapi32.dll", SetLastError = true)]
    static extern bool OpenProcessToken(IntPtr hProcess, uint access, out IntPtr token);
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
    const uint SYNCHRONIZE = 0x00100000;
    const uint MEM_COMMIT = 0x00001000;
    const uint MEM_RESERVE = 0x00002000;
    const uint MEM_RELEASE = 0x00008000;
    const uint PAGE_READWRITE = 4;
    const uint STILL_ACTIVE = 259;
    const uint TOKEN_QUERY = 0x0008;
    const int ProcessProtectionLevelInfo = 7;
    const uint PROTECTION_LEVEL_NONE = 0xFFFFFFFE;
    const ushort IMAGE_FILE_MACHINE_UNKNOWN = 0;
    const ushort IMAGE_FILE_MACHINE_I386 = 0x014c;
    const ushort IMAGE_FILE_MACHINE_AMD64 = 0x8664;
    const ushort IMAGE_FILE_MACHINE_ARM64 = 0xAA64;

    const string HOOK_X64 = "DarkHub.PacerHook.x64.dll";
    const string HOOK_X86 = "DarkHub.PacerHook.x86.dll";
    const string INJECT_X86 = "DarkHub.PacerInject.x86.exe";

    static volatile int targetFps = 144;
    static volatile string pacingMode = "flatline";
    static volatile bool running = true;
    static long adapterLuid = 0; // 0 = any adapter (Interlocked)
    static volatile string injectStatus = "";

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

    // Games running under kernel/user-mode anti-cheat are never injected (fail closed). Matched
    // against the target's loaded modules (prefix) and the folders anti-cheats ship next to the game.
    static readonly string[] AntiCheatModules = {
        "easyanticheat", "eac_", "eosac", "beclient", "battleye", "bedaisy", "vgk", "vanguard",
        "npggnt", "gameguard", "xigncode", "x3.xem", "equ8", "faceit", "acebase", "ace-base",
        "sguard", "nprotect", "pbcl", "punkbuster", "atvi-randgrid", "ricochet"
    };
    static readonly string[] AntiCheatDirs = { "EasyAntiCheat", "EasyAntiCheat_EOS", "BattlEye", "XIGNCODE", "GameGuard", "EQU8", "PunkBuster", "AntiCheatExpert" };

    static bool IsBlacklisted(string processName)
    {
        string name = (processName ?? "").ToLowerInvariant();
        foreach (string b in Blacklist) if (name.Contains(b)) return true;
        return false;
    }

    static string GetProcessPath(int pid)
    {
        IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return "";
        try { return GetHandlePath(h); } finally { CloseHandle(h); }
    }

    static string GetHandlePath(IntPtr h)
    {
        StringBuilder sb = new StringBuilder(1024);
        uint sz = 1024;
        return QueryFullProcessImageName(h, 0, sb, ref sz) ? sb.ToString() : "";
    }

    /// <summary>Captures PID + creation time + image path right after detection.</summary>
    static GameTarget CaptureIdentity(int pid, string name)
    {
        IntPtr h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
        if (h == IntPtr.Zero) return null;
        try
        {
            long c, e, k, u;
            if (!GetProcessTimes(h, out c, out e, out k, out u) || c <= 0) return null;
            string path = GetHandlePath(h);
            if (string.IsNullOrEmpty(path)) return null;
            return new GameTarget { Pid = pid, CreationTime = c, Path = path, Name = string.IsNullOrEmpty(name) ? System.IO.Path.GetFileName(path) : name };
        }
        finally { CloseHandle(h); }
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
                            if (!IsBlacklisted(p.ProcessName))
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
                    if (IsBlacklisted(p.ProcessName)) continue;

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

    // ------------------------------------------------------------------------------------------
    // Injection safety checks
    // ------------------------------------------------------------------------------------------

    /// <summary>PE machine of a file on disk, 0 when unreadable.</summary>
    static ushort PeMachine(string path)
    {
        try
        {
            using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var br = new BinaryReader(fs))
            {
                if (fs.Length < 0x40 || br.ReadUInt16() != 0x5A4D) return 0;
                fs.Position = 0x3c;
                int off = br.ReadInt32();
                if (off <= 0 || off + 6 > fs.Length) return 0;
                fs.Position = off;
                if (br.ReadUInt32() != 0x00004550) return 0;
                return br.ReadUInt16();
            }
        }
        catch { return 0; }
    }

    /// <summary>"x64", "x86", or null with a refusal reason.</summary>
    static string TargetArch(IntPtr h, out string why)
    {
        why = "";
        ushort pm, nm;
        bool have2 = false;
        try { have2 = IsWow64Process2(h, out pm, out nm); }
        catch (EntryPointNotFoundException)
        {
            // Windows 10 < 1511 (x64 only there): IsWow64Process says "32-bit on 64-bit" or not.
            bool wow;
            if (!IsWow64Process(h, out wow)) { why = "bitness query failed"; return null; }
            return wow ? "x86" : "x64";
        }
        if (!have2) { why = "IsWow64Process2 failed (" + Marshal.GetLastWin32Error() + ")"; return null; }
        if (nm == IMAGE_FILE_MACHINE_ARM64) { why = "ARM64 Windows is not supported"; return null; }
        if (nm != IMAGE_FILE_MACHINE_AMD64) { why = "unsupported host machine 0x" + nm.ToString("x"); return null; }
        if (pm == IMAGE_FILE_MACHINE_UNKNOWN) return "x64";
        if (pm == IMAGE_FILE_MACHINE_I386) return "x86";
        why = "unsupported process machine 0x" + pm.ToString("x");
        return null;
    }

    static List<string> ModuleNames(IntPtr h)
    {
        var names = new List<string>();
        try
        {
            IntPtr[] mods = new IntPtr[2048];
            uint needed;
            if (!EnumProcessModulesEx(h, mods, (uint)(mods.Length * IntPtr.Size), out needed, 3 /* LIST_MODULES_ALL */)) return names;
            int n = Math.Min(mods.Length, (int)(needed / IntPtr.Size));
            StringBuilder sb = new StringBuilder(260);
            for (int i = 0; i < n; i++)
            {
                sb.Length = 0;
                if (GetModuleBaseName(h, mods[i], sb, 260) > 0) names.Add(sb.ToString());
            }
        }
        catch { }
        return names;
    }

    static string AntiCheatFound(IntPtr h, string exePath)
    {
        foreach (string m in ModuleNames(h))
        {
            string lm = m.ToLowerInvariant();
            foreach (string ac in AntiCheatModules) if (lm.StartsWith(ac)) return "module " + m;
        }
        try
        {
            string dir = Path.GetDirectoryName(exePath);
            if (File.Exists(Path.Combine(dir, "start_protected_game.exe"))) return "start_protected_game.exe";
            for (int up = 0; up < 4 && !string.IsNullOrEmpty(dir); up++)
            {
                foreach (string d in AntiCheatDirs)
                    if (Directory.Exists(Path.Combine(dir, d))) return "folder " + Path.Combine(dir, d);
                dir = Path.GetDirectoryName(dir);
            }
        }
        catch { }
        return null;
    }

    static string FindBinary(string name)
    {
        string exeDir = AppDomain.CurrentDomain.BaseDirectory;
        string p = Path.Combine(exeDir, name);
        if (File.Exists(p)) return Path.GetFullPath(p);
        p = Path.Combine(exeDir, "..", "..", "electron", "services", name);
        return File.Exists(p) ? Path.GetFullPath(p) : null;
    }

    static bool ModuleLoaded(IntPtr h, string dllPath)
    {
        string want = Path.GetFileName(dllPath);
        foreach (string m in ModuleNames(h)) if (string.Equals(m, want, StringComparison.OrdinalIgnoreCase)) return true;
        return false;
    }

    /// <summary>
    /// Injects the hook DLL of the matching bitness into exactly the process identified at
    /// detection. Every check runs on the handle that is then used for the injection, so the PID
    /// cannot be recycled between check and use. Refuses (never "tries anyway") on any doubt.
    /// </summary>
    static InjectResult InjectHookDll(GameTarget t)
    {
        if (!Environment.Is64BitProcess) return InjectResult.Refuse("controller_not_64bit", "DarkHub.FrameLimiter.exe must run as a 64-bit process");
        if (!ConfigLayoutOk()) return InjectResult.Refuse("config_layout", "PacerConfigV2 layout mismatch");
        if (t == null || t.Pid <= 4) return InjectResult.Refuse("bad_target", "no target");

        uint access = PROCESS_CREATE_THREAD | PROCESS_QUERY_INFORMATION | PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_OPERATION | PROCESS_VM_WRITE | PROCESS_VM_READ | SYNCHRONIZE;
        IntPtr h = OpenProcess(access, false, t.Pid);
        if (h == IntPtr.Zero)
        {
            int err = Marshal.GetLastWin32Error();
            // 5 = access denied: elevated, protected or another user's process. Not retried.
            if (err == 5) return InjectResult.Refuse("access_denied", "OpenProcess access denied (elevated, protected or other user)");
            return InjectResult.Fail("open_failed", "OpenProcess error " + err);
        }
        try
        {
            long c, e, k, u;
            if (!GetProcessTimes(h, out c, out e, out k, out u)) return InjectResult.Refuse("identity_mismatch", "GetProcessTimes failed");
            if (c != t.CreationTime) return InjectResult.Refuse("identity_mismatch", "creation time " + c + " != detected " + t.CreationTime + " (PID reused)");
            uint code;
            if (!GetExitCodeProcess(h, out code) || code != STILL_ACTIVE) return InjectResult.Refuse("exited", "process is gone");
            string path = GetHandlePath(h);
            if (!string.Equals(path, t.Path, StringComparison.OrdinalIgnoreCase)) return InjectResult.Refuse("identity_mismatch", "image path changed");
            if (IsBlacklisted(Path.GetFileNameWithoutExtension(path))) return InjectResult.Refuse("blacklisted", Path.GetFileName(path));

            uint mySession, theirSession;
            if (!ProcessIdToSessionId((uint)Process.GetCurrentProcess().Id, out mySession) || !ProcessIdToSessionId((uint)t.Pid, out theirSession))
                return InjectResult.Refuse("other_session", "session query failed");
            if (theirSession == 0 || theirSession != mySession) return InjectResult.Refuse("other_session", "target runs in session " + theirSession);

            if (!SameUser(h)) return InjectResult.Refuse("other_user", "target belongs to another user");

            try
            {
                uint level;
                if (!GetProcessInformation(h, ProcessProtectionLevelInfo, out level, 4)) return InjectResult.Refuse("protected_process", "protection query failed");
                if (level != PROTECTION_LEVEL_NONE) return InjectResult.Refuse("protected_process", "protection level 0x" + level.ToString("x"));
            }
            catch (EntryPointNotFoundException) { /* Windows 7: no protected games */ }

            string ac = AntiCheatFound(h, path);
            if (ac != null) return InjectResult.Refuse("anticheat", ac);

            string why;
            string arch = TargetArch(h, out why);
            if (arch == null) return InjectResult.Refuse("unsupported_arch", why);

            if (arch == "x64")
            {
                string dll = FindBinary(HOOK_X64);
                if (dll == null) return InjectResult.Refuse("dll_missing", HOOK_X64);
                if (PeMachine(dll) != IMAGE_FILE_MACHINE_AMD64) return InjectResult.Refuse("dll_wrong_bitness", HOOK_X64 + " is not an x64 image");
                InjectResult r = InjectX64(h, dll);
                r.Arch = arch;
                return r;
            }
            else
            {
                string dll = FindBinary(HOOK_X86);
                string helper = FindBinary(INJECT_X86);
                if (dll == null) return InjectResult.Refuse("dll_missing", HOOK_X86);
                if (helper == null) return InjectResult.Refuse("helper_missing", INJECT_X86);
                if (PeMachine(dll) != IMAGE_FILE_MACHINE_I386) return InjectResult.Refuse("dll_wrong_bitness", HOOK_X86 + " is not an x86 image");
                if (PeMachine(helper) != IMAGE_FILE_MACHINE_I386) return InjectResult.Refuse("helper_wrong_bitness", INJECT_X86 + " is not an x86 image");
                // `h` stays open while the helper runs: the process object (and so the PID) is pinned.
                InjectResult r = InjectViaX86Helper(helper, t, dll);
                r.Arch = arch;
                return r;
            }
        }
        catch (Exception ex)
        {
            return InjectResult.Fail("exception", ex.GetType().Name + ": " + ex.Message);
        }
        finally
        {
            CloseHandle(h);
        }
    }

    static bool SameUser(IntPtr h)
    {
        IntPtr tok;
        if (!OpenProcessToken(h, TOKEN_QUERY, out tok)) return false;
        try
        {
            using (var them = new WindowsIdentity(tok))
            using (var me = WindowsIdentity.GetCurrent())
            {
                return them.User != null && them.User.Equals(me.User);
            }
        }
        catch { return false; }
        finally { CloseHandle(tok); }
    }

    static InjectResult InjectX64(IntPtr hProcess, string dllPath)
    {
        byte[] dllBytes = Encoding.Unicode.GetBytes(dllPath + "\0");
        IntPtr mem = VirtualAllocEx(hProcess, IntPtr.Zero, (uint)dllBytes.Length, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        if (mem == IntPtr.Zero) return InjectResult.Fail("alloc_failed", "VirtualAllocEx error " + Marshal.GetLastWin32Error());

        UIntPtr written;
        if (!WriteProcessMemory(hProcess, mem, dllBytes, (uint)dllBytes.Length, out written))
        {
            VirtualFreeEx(hProcess, mem, 0, MEM_RELEASE);
            return InjectResult.Fail("write_failed", "WriteProcessMemory error " + Marshal.GetLastWin32Error());
        }

        // This process is x64 and so is the target: kernel32 is mapped at the same base in both.
        IntPtr loadLibraryAddr = GetProcAddress(GetModuleHandle("kernel32.dll"), "LoadLibraryW");
        if (loadLibraryAddr == IntPtr.Zero) { VirtualFreeEx(hProcess, mem, 0, MEM_RELEASE); return InjectResult.Fail("no_loadlibrary", "LoadLibraryW not found"); }

        IntPtr hThread = CreateRemoteThread(hProcess, IntPtr.Zero, 0, loadLibraryAddr, mem, 0, IntPtr.Zero);
        if (hThread == IntPtr.Zero)
        {
            VirtualFreeEx(hProcess, mem, 0, MEM_RELEASE);
            return InjectResult.Fail("thread_failed", "CreateRemoteThread error " + Marshal.GetLastWin32Error());
        }
        uint wait = WaitForSingleObject(hThread, 2000);
        uint exitCode = 0;
        if (wait == 0) GetExitCodeThread(hThread, out exitCode);
        CloseHandle(hThread);
        // Only free the path buffer once LoadLibraryW has returned (WAIT_OBJECT_0). On a
        // timeout the remote thread may still read it: leak 1 small page instead of crashing the game.
        if (wait != 0) return InjectResult.Fail("timeout", "LoadLibraryW did not return within 2 s");
        VirtualFreeEx(hProcess, mem, 0, MEM_RELEASE);
        // The exit code is the low 32 bits of the HMODULE: 0 almost always means failure, but
        // confirm against the module list before deciding.
        if (exitCode == 0 && !ModuleLoaded(hProcess, dllPath)) return InjectResult.Fail("loadlibrary_failed", "LoadLibraryW returned NULL in the target");
        return InjectResult.Success("x64", "module 0x" + exitCode.ToString("x8"));
    }

    static InjectResult InjectViaX86Helper(string helper, GameTarget t, string dll)
    {
        var psi = new ProcessStartInfo
        {
            FileName = helper,
            Arguments = t.Pid.ToString(INV) + " " + t.CreationTime.ToString(INV) + " \"" + dll + "\"",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        using (Process p = Process.Start(psi))
        {
            string outLine = p.StandardOutput.ReadToEnd();
            if (!p.WaitForExit(10000))
            {
                try { p.Kill(); } catch { }
                return InjectResult.Fail("helper_timeout", "x86 helper did not finish");
            }
            string code = JsonStr(outLine, "code");
            string msg = JsonStr(outLine, "message");
            if (p.ExitCode == 0 && code == "ok") return InjectResult.Success("x86", msg);
            // 3 identity / 4 refused / 2 bad build: permanent. 5: transient injection failure.
            if (p.ExitCode == 5) return InjectResult.Fail(code == "" ? "helper_failed" : code, msg);
            return InjectResult.Refuse(code == "" ? "helper_failed" : code, msg == "" ? ("helper exit " + p.ExitCode) : msg);
        }
    }

    static string JsonStr(string json, string key)
    {
        if (json == null) return "";
        string k = "\"" + key + "\":\"";
        int i = json.IndexOf(k);
        if (i < 0) return "";
        i += k.Length;
        int e = json.IndexOf('"', i);
        while (e > 0 && json[e - 1] == '\\') e = json.IndexOf('"', e + 1);
        return e < 0 ? "" : json.Substring(i, e - i).Replace("\\\"", "\"").Replace("\\\\", "\\");
    }

    // ------------------------------------------------------------------------------------------
    // Shared config + heartbeat
    // ------------------------------------------------------------------------------------------

    const uint CFG_MAGIC = 0x4441524B;
    const uint CFG_VERSION = 2;
    const int CFG_SIZE = 64;
    static readonly int OFF_MAGIC = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "magic");
    static readonly int OFF_VERSION = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "version");
    static readonly int OFF_SIZE = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "size");
    static readonly int OFF_ENABLED = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "enabled");
    static readonly int OFF_TARGET = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "target_fps");
    static readonly int OFF_MODE = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "pacing_mode");
    static readonly int OFF_HEARTBEAT = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "heartbeat_qpc");
    static readonly int OFF_LUID = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "adapter_luid");
    static readonly int OFF_PID = (int)Marshal.OffsetOf(typeof(PacerConfigV2), "controller_pid");

    static bool ConfigLayoutOk()
    {
        return Marshal.SizeOf(typeof(PacerConfigV2)) == CFG_SIZE && OFF_MAGIC == 0 && OFF_VERSION == 4 && OFF_SIZE == 8 &&
               OFF_ENABLED == 12 && OFF_TARGET == 16 && OFF_MODE == 20 && OFF_HEARTBEAT == 24 && OFF_LUID == 32 && OFF_PID == 40;
    }

    static readonly object cfgLock = new object();
    static MemoryMappedFile cfgMap;
    static MemoryMappedViewAccessor cfgView;
    static int capReset = 0;

    /// <summary>Opens the block the hook created (never creates it: the game's own default DACL
    /// must own it so a non-elevated game can always open it).</summary>
    static bool EnsureConfigView()
    {
        if (cfgView != null) return true;
        string[] names = { "DarkHub_Pacer_Config2", "Local\\DarkHub_Pacer_Config2", "Global\\DarkHub_Pacer_Config2" };
        foreach (string name in names)
        {
            try
            {
                cfgMap = MemoryMappedFile.OpenExisting(name, MemoryMappedFileRights.ReadWrite);
                cfgView = cfgMap.CreateViewAccessor(0, CFG_SIZE, MemoryMappedFileAccess.ReadWrite);
                return true;
            }
            catch
            {
                try { if (cfgMap != null) cfgMap.Dispose(); } catch { }
                cfgMap = null;
                cfgView = null;
            }
        }
        return false;
    }

    /// <summary>Writes the whole block plus a fresh heartbeat. Called by the heartbeat thread and
    /// whenever the config changes. Keeping the view open also keeps the section (and its name)
    /// alive, so a game started later opens this same block.</summary>
    static void PublishConfig()
    {
        if (!ConfigLayoutOk()) return;
        lock (cfgLock)
        {
            if (Volatile.Read(ref capReset) == 1) return;
            if (!EnsureConfigView()) return;
            try
            {
                cfgView.Write(OFF_MAGIC, CFG_MAGIC);
                cfgView.Write(OFF_VERSION, CFG_VERSION);
                cfgView.Write(OFF_SIZE, (uint)CFG_SIZE);
                cfgView.Write(OFF_TARGET, (uint)ClampFps(targetFps));
                cfgView.Write(OFF_MODE, pacingMode == "uncapped" ? 2u : 0u);
                cfgView.Write(OFF_LUID, (ulong)Interlocked.Read(ref adapterLuid));
                cfgView.Write(OFF_PID, (uint)Process.GetCurrentProcess().Id);
                cfgView.Write(OFF_ENABLED, 1u);
                // Aligned 8-byte store: the hook (also a 32-bit one) reads it atomically.
                cfgView.Write(OFF_HEARTBEAT, Stopwatch.GetTimestamp());
            }
            catch
            {
                try { cfgView.Dispose(); } catch { }
                try { cfgMap.Dispose(); } catch { }
                cfgView = null;
                cfgMap = null;
            }
        }
    }

    static void HeartbeatLoop()
    {
        // ~4 beats per second; the hook gives up after 2 s without one.
        while (running && Volatile.Read(ref capReset) == 0)
        {
            PublishConfig();
            Thread.Sleep(250);
        }
    }

    /// <summary>Removes the in-game cap (enabled=0, heartbeat=0). Idempotent; runs on STOP, stdin
    /// EOF, Ctrl+C, ProcessExit and fatal errors. If this process is killed instead, the hook
    /// lifts the cap by itself once the heartbeat is older than 2 s.</summary>
    static void ResetCap()
    {
        if (Interlocked.Exchange(ref capReset, 1) == 1) return;
        lock (cfgLock)
        {
            try
            {
                if (EnsureConfigView())
                {
                    cfgView.Write(OFF_ENABLED, 0u);
                    cfgView.Write(OFF_TARGET, 0u);
                    cfgView.Write(OFF_HEARTBEAT, 0L);
                }
            }
            catch { }
        }
    }

    static int ClampFps(int v)
    {
        if (v < 0) return 0;
        if (v > 1000) return 1000;
        return v;
    }

    /// <summary>"" / "0" = any adapter; otherwise up to 16 hex digits (LowPart | HighPart << 32,
    /// as printed by DXGI tools). Returns false on garbage.</summary>
    static bool TryParseLuid(string s, out long luid)
    {
        luid = 0;
        if (s == null) return false;
        s = s.Trim();
        if (s.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) s = s.Substring(2);
        if (s.Length == 0) return true;
        if (s.Length > 16) return false;
        ulong v;
        if (!ulong.TryParse(s, NumberStyles.HexNumber, INV, out v)) return false;
        luid = unchecked((long)v);
        return true;
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
        sb.Append(",\"injectStatus\":\"").Append(EscJ(injectStatus)).Append("\"");
        sb.Append(",\"adapterLuid\":\"").Append(Interlocked.Read(ref adapterLuid).ToString("x16")).Append("\"");
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
                                targetFps = ClampFps(v);
                        }
                    }

                    i = line.IndexOf("\"pacingMode\":\"");
                    if (i >= 0)
                    {
                        string r = line.Substring(i + 14);
                        int e = r.IndexOf("\"");
                        if (e >= 0) pacingMode = r.Substring(0, e);
                    }

                    if (line.IndexOf("\"adapterLuid\":") >= 0)
                    {
                        long luid;
                        if (TryParseLuid(JsonStr(line, "adapterLuid"), out luid)) Interlocked.Exchange(ref adapterLuid, luid);
                    }

                    PublishConfig();
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

    static string ArgValue(string[] args, string name)
    {
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
        return null;
    }

    static string ResultJson(InjectResult r, GameTarget t)
    {
        return "{\"ok\":" + (r.Ok ? "true" : "false") + ",\"code\":\"" + EscJ(r.Code) + "\",\"message\":\"" + EscJ(r.Message) +
               "\",\"arch\":\"" + EscJ(r.Arch) + "\",\"pid\":" + (t == null ? 0 : t.Pid) + ",\"creation\":" + (t == null ? 0 : t.CreationTime) + "}";
    }

    static void Main(string[] args)
    {
        Thread.CurrentThread.CurrentCulture = INV;
        Thread.CurrentThread.CurrentUICulture = INV;

        // Diagnostics / tests: print the PacerConfigV2 layout this build uses.
        if (Array.IndexOf(args, "--layout") >= 0)
        {
            Console.WriteLine("{\"size\":" + Marshal.SizeOf(typeof(PacerConfigV2)) + ",\"ok\":" + (ConfigLayoutOk() ? "true" : "false") +
                ",\"heartbeat_qpc\":" + OFF_HEARTBEAT + ",\"adapter_luid\":" + OFF_LUID + ",\"is64\":" + (Environment.Is64BitProcess ? "true" : "false") + "}");
            return;
        }

        // One-shot injection into a given process with every safety check (used by tests/e2e.ps1).
        // --creation lets a test pass a stale identity and confirm it is refused.
        string injectArg = ArgValue(args, "--inject");
        if (injectArg != null)
        {
            int ipid;
            GameTarget t = int.TryParse(injectArg, NumberStyles.Integer, INV, out ipid) ? CaptureIdentity(ipid, null) : null;
            string creationArg = ArgValue(args, "--creation");
            long forced;
            if (t != null && creationArg != null && long.TryParse(creationArg, NumberStyles.Integer, INV, out forced)) t.CreationTime = forced;
            InjectResult r = t == null ? InjectResult.Refuse("bad_target", "process not found") : InjectHookDll(t);
            Console.WriteLine(ResultJson(r, t));
            Environment.Exit(r.Ok ? 0 : 1);
            return;
        }

        int argFps;
        if (args.Length > 0 && int.TryParse(args[0], NumberStyles.Integer, INV, out argFps)) targetFps = ClampFps(argFps);
        if (args.Length > 1 && !args[1].StartsWith("--")) pacingMode = args[1];
        long argLuid;
        if (TryParseLuid(ArgValue(args, "--adapter-luid"), out argLuid)) adapterLuid = argLuid;
        int fixedPid = 0;
        string fixedPidArg = ArgValue(args, "--target-pid");
        if (fixedPidArg != null) int.TryParse(fixedPidArg, NumberStyles.Integer, INV, out fixedPid);

        AppDomain.CurrentDomain.ProcessExit += (s, e) => ResetCap();
        Console.CancelKeyPress += (s, e) => { running = false; ResetCap(); };

        Thread stdinThread = new Thread(ReadStdin);
        stdinThread.IsBackground = true;
        stdinThread.Start();

        Thread heartbeatThread = new Thread(HeartbeatLoop);
        heartbeatThread.IsBackground = true;
        heartbeatThread.Start();

        string activeGameName = "Nenhum Jogo Detectado";
        int currentGamePid = 0;
        DateTime lastScanTime = DateTime.MinValue;
        string injectedKey = null;
        var refused = new Dictionary<string, string>();
        var attempts = new Dictionary<string, int>();

        try
        {
        while (running)
        {
            DateTime now = DateTime.UtcNow;

            // Enumerating every process is expensive: scan every 1.5s while tracking a game, every 4s while idle.
            double scanEveryMs = currentGamePid == 0 ? 4000 : 1500;
            if ((now - lastScanTime).TotalMilliseconds > scanEveryMs || lastScanTime == DateTime.MinValue)
            {
                string detectedName = null;
                int detectedPid = fixedPid > 0 ? fixedPid : DetectActiveGame(out detectedName);
                // Identity is captured right after detection and re-verified on the injection handle.
                GameTarget target = detectedPid > 0 ? CaptureIdentity(detectedPid, detectedName) : null;
                if (target != null)
                {
                    activeGameName = target.Name;
                    currentGamePid = target.Pid;
                    string key = target.Key;

                    if (injectedKey != key && !refused.ContainsKey(key))
                    {
                        int n;
                        attempts.TryGetValue(key, out n);
                        if (n < 3)
                        {
                            InjectResult r = InjectHookDll(target);
                            attempts[key] = n + 1;
                            if (r.Ok)
                            {
                                injectedKey = key;
                                injectStatus = "ok:" + r.Arch;
                                Thread.Sleep(150);
                                PublishConfig();
                            }
                            else
                            {
                                if (r.Permanent) refused[key] = r.Code;
                                injectStatus = (r.Permanent ? "refused:" : "failed:") + r.Code;
                                Console.Error.WriteLine("inject " + target.Name + " (" + target.Pid + "): " + r.Code + " " + r.Message);
                            }
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
                EmitTelemetry(activeGameName, tel, "In-Game DXGI/OpenGL Present Hook");
            }
            else
            {
                string method = currentGamePid > 0 ? "Aguardando frames do jogo..." : "Procurando Renderizador 3D...";
                if (currentGamePid > 0 && injectStatus.StartsWith("refused:")) method = "Inje\u00e7\u00e3o recusada: " + injectStatus.Substring(8);
                EmitTelemetry(activeGameName, null, method);
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
