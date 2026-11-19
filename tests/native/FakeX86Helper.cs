// Stand-in for DarkHub.PacerInject.x86.exe (tests/nativeHelpers.test.ts), built with csc /platform:x86.
// Same command line as the real helper: <pid> <creationTime> "<dll>". The behaviour is picked by the dll file name:
//   hang.dll      writes its pid to <dll>.pid, prints a partial line and never exits
//   flood.dll     writes 1 MB to stderr (more than the pipe buffer) and then reports success
//   ok.dll        reports success
//   refuse.dll    exit 3 (permanent refusal)
//   transient.dll exit 5 (retryable failure)
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

public static class FakeX86Helper
{
    public static int Main(string[] args)
    {
        string dll = args.Length > 2 ? args[2] : "";
        string mode = Path.GetFileNameWithoutExtension(dll);
        Console.Error.WriteLine("ptr=" + IntPtr.Size);
        switch (mode)
        {
            case "hang":
                File.WriteAllText(dll + ".pid", Process.GetCurrentProcess().Id.ToString());
                Console.Out.Write("{\"code\":\"ok\",\"mess");
                Console.Out.Flush();
                Thread.Sleep(Timeout.Infinite);
                return 0;
            case "flood":
                var line = new string('x', 1023);
                for (int i = 0; i < 1024; i++) Console.Error.WriteLine(line);
                Console.Out.WriteLine("{\"code\":\"ok\",\"message\":\"flooded x86\"}");
                return 0;
            case "ok":
                Console.Out.WriteLine("{\"code\":\"ok\",\"message\":\"module 0x1234 pid " + args[0] + " ct " + args[1] + "\"}");
                return 0;
            case "refuse":
                Console.Out.WriteLine("{\"code\":\"identity_mismatch\",\"message\":\"process changed\"}");
                return 3;
            case "transient":
                Console.Out.WriteLine("{\"code\":\"thread_failed\",\"message\":\"try again\"}");
                return 5;
        }
        return 2;
    }
}
