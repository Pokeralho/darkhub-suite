// DarkHub.HwSensors: advanced hardware sensors through LibreHardwareMonitorLib (MPL-2.0).
// Runs only when the user enables "advanced sensors". CPU core temperatures, Super I/O fans and voltages and RAM
// SPD need the PawnIO driver (installed by the user from DarkHub, signed, HVCI compatible); GPU (NVAPI/ADL) and
// disk SMART work without it.
// Output: one JSON line per sample on stdout:
//   {"type":"lhm","t":<ms>,"pawnio":<bool>,"admin":<bool>,"hw":[{"kind":"Cpu","name":"...","s":[["Temperature","Core (Tctl/Tdie)",45.25],...]}]}
// Usage: DarkHub.HwSensors.exe [intervalMs]   (stdin closing ends the process)
using System;
using System.Globalization;
using System.IO;
using System.Text;
using System.Threading;
using LibreHardwareMonitor.Hardware;
using Microsoft.Win32;

namespace DarkHub.Native
{
    public static class HwSensors
    {
        private static void Esc(StringBuilder sb, string s)
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
                sb.Append("]}");
                try { stdout.WriteLine(sb.ToString()); stdout.Flush(); }
                catch (IOException) { break; }
                Thread.Sleep(interval);
            }
            computer.Close();
            return 0;
        }
    }
}
