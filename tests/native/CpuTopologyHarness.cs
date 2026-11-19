// Test entry for the CPU topology logic of DarkHub.LatencyEngine.cs (tests/cpuTopology.test.ts).
// Compiled together with the engine source: csc /main:CpuTopologyHarness DarkHub.LatencyEngine.cs CpuTopologyHarness.cs
// Never touches the OS topology APIs: it feeds synthetic records / buffers to the pure functions.
// stdin, one command per line, one JSON line out per command:
//   buf <ptrSize 4|8> <logicalCores> <hex bytes>   SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX buffer -> parse -> select
//   records <logicalCores> <cores> <l3>            cores = mask:eff,... l3 = mask:sizeBytes,... (hex masks, "-" = none)
//   fail <logicalCores>                            API failure (no records)
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

public static class CpuTopologyHarness
{
    public static int Main(string[] args)
    {
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            line = line.Trim();
            if (line.Length == 0) continue;
            try { Console.WriteLine(Run(line.Split(' '))); }
            catch (Exception e) { Console.WriteLine("{\"error\":\"" + e.GetType().Name + ": " + e.Message.Replace("\"", "'") + "\"}"); }
            Console.Out.Flush();
        }
        return 0;
    }

    static ulong Hex(string s)
    {
        if (s.StartsWith("0x", StringComparison.OrdinalIgnoreCase)) s = s.Substring(2);
        return ulong.Parse(s, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
    }

    static string Run(string[] a)
    {
        var cores = new List<DarkHubLatencyEngine.CpuCoreRecord>();
        var l3 = new List<DarkHubLatencyEngine.CpuL3Record>();
        int logical;
        if (a[0] == "fail")
        {
            logical = int.Parse(a[1]);
        }
        else if (a[0] == "records")
        {
            logical = int.Parse(a[1]);
            if (a[2] != "-")
                foreach (var c in a[2].Split(',')) { var p = c.Split(':'); cores.Add(new DarkHubLatencyEngine.CpuCoreRecord(Hex(p[0]), int.Parse(p[1]))); }
            if (a.Length > 3 && a[3] != "-")
                foreach (var c in a[3].Split(',')) { var p = c.Split(':'); l3.Add(new DarkHubLatencyEngine.CpuL3Record(Hex(p[0]), uint.Parse(p[1]))); }
        }
        else if (a[0] == "buf")
        {
            int ptrSize = int.Parse(a[1]);
            logical = int.Parse(a[2]);
            string hex = a.Length > 3 ? a[3] : "";
            var bytes = new byte[hex.Length / 2];
            for (int i = 0; i < bytes.Length; i++) bytes[i] = byte.Parse(hex.Substring(i * 2, 2), NumberStyles.HexNumber);
            DarkHubLatencyEngine.ParseProcessorInfo(bytes, bytes.Length, ptrSize, cores, l3);
        }
        else throw new ArgumentException("unknown command " + a[0]);

        var topo = DarkHubLatencyEngine.SelectCpuTopology(logical, cores, l3);
        var sb = new StringBuilder("{\"cores\":[");
        for (int i = 0; i < cores.Count; i++)
            sb.Append(i > 0 ? "," : "").Append("{\"mask\":\"0x").Append(cores[i].Mask.ToString("X")).Append("\",\"eff\":").Append(cores[i].EfficiencyClass).Append("}");
        sb.Append("],\"l3\":[");
        for (int i = 0; i < l3.Count; i++)
            sb.Append(i > 0 ? "," : "").Append("{\"mask\":\"0x").Append(l3[i].Mask.ToString("X")).Append("\",\"size\":").Append(l3[i].Size).Append("}");
        sb.Append("],\"topo\":{");
        bool first = true;
        foreach (var kv in topo)
        {
            if (!first) sb.Append(",");
            first = false;
            sb.Append("\"").Append(kv.Key).Append("\":");
            object v = kv.Value;
            if (v is bool) sb.Append((bool)v ? "true" : "false");
            else if (v is string) sb.Append("\"").Append((string)v).Append("\"");
            else if (v is ulong) sb.Append("\"").Append(((ulong)v).ToString(CultureInfo.InvariantCulture)).Append("\"");
            else sb.Append(Convert.ToString(v, CultureInfo.InvariantCulture));
        }
        return sb.Append("}}").ToString();
    }
}
