// Test entry for DarkHub.FrameLimiter.cs InjectViaX86Helper (tests/nativeHelpers.test.ts), compiled with
// csc /main:FrameLimiterHarness DarkHub.FrameLimiter.cs FrameLimiterHarness.cs. The method is private, so it is
// called through reflection: the engine source stays untouched. args: <helperExe> <dll>; prints one JSON line.
using System;
using System.Diagnostics;
using System.Reflection;

public static class FrameLimiterHarness
{
    public static int Main(string[] args)
    {
        var flags = BindingFlags.NonPublic | BindingFlags.Static;
        MethodInfo m = typeof(DarkHubFrameLimiter).GetMethod("InjectViaX86Helper", flags);
        if (m == null) { Console.WriteLine("{\"error\":\"InjectViaX86Helper not found\"}"); return 1; }
        var t = new GameTarget { Pid = 4242, CreationTime = 133000000000000000L, Path = @"C:\Games\x.exe", Name = "x.exe" };
        var sw = Stopwatch.StartNew();
        var r = (InjectResult)m.Invoke(null, new object[] { args[0], t, args[1] });
        sw.Stop();
        Console.WriteLine("{\"ok\":" + (r.Ok ? "true" : "false") + ",\"permanent\":" + (r.Permanent ? "true" : "false") +
            ",\"code\":\"" + Esc(r.Code) + "\",\"message\":\"" + Esc(r.Message) + "\",\"arch\":\"" + Esc(r.Arch) + "\",\"ms\":" + sw.ElapsedMilliseconds + "}");
        return 0;
    }

    static string Esc(string s) { return (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""); }
}
