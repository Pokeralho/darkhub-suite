// Test entry for the NVML loader of hwsensors/DarkHub.HwSensors.cs (tests/nativeHelpers.test.ts), compiled with
// csc /main:NvmlHarness /r:LibreHardwareMonitorLib.dll /r:System.Management.dll DarkHub.HwSensors.cs NvmlHarness.cs.
// The test plants a decoy nvml.dll next to this exe and in the working directory; prints which nvml.dll got loaded.
using System;
using System.Diagnostics;
using System.Text;

public static class NvmlHarness
{
    public static int Main(string[] args)
    {
        var nvml = new DarkHub.Native.Nvml();
        var sb = new StringBuilder("{\"ok\":").Append(nvml.Ok ? "true" : "false").Append(",\"modules\":[");
        bool first = true;
        foreach (ProcessModule mod in Process.GetCurrentProcess().Modules)
        {
            if (!string.Equals(mod.ModuleName, "nvml.dll", StringComparison.OrdinalIgnoreCase)) continue;
            if (!first) sb.Append(',');
            first = false;
            sb.Append('"').Append(mod.FileName.Replace("\\", "\\\\")).Append('"');
        }
        Console.WriteLine(sb.Append("]}").ToString());
        return 0;
    }
}
