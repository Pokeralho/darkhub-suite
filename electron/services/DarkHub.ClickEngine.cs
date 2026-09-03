using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;

namespace DarkHub.Native
{
    public static class ClickEngine
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public MOUSEINPUT mi;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

        [DllImport("winmm.dll", EntryPoint = "timeBeginPeriod", SetLastError = true)]
        private static extern uint timeBeginPeriod(uint uMilliseconds);

        [DllImport("winmm.dll", EntryPoint = "timeEndPeriod", SetLastError = true)]
        private static extern uint timeEndPeriod(uint uMilliseconds);

        private const uint INPUT_MOUSE = 0;
        private const uint MOUSEEVENTF_LEFTDOWN   = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP     = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN  = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP    = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP   = 0x0040;

        private static volatile bool isRunning = false;
        private static volatile int intervalMs = 100;
        private static volatile string buttonType = "left";
        private static Thread workerThread = null;

        private static void PerformClick(string button)
        {
            uint downFlag = MOUSEEVENTF_LEFTDOWN;
            uint upFlag = MOUSEEVENTF_LEFTUP;

            if (button == "right")
            {
                downFlag = MOUSEEVENTF_RIGHTDOWN;
                upFlag = MOUSEEVENTF_RIGHTUP;
            }
            else if (button == "middle")
            {
                downFlag = MOUSEEVENTF_MIDDLEDOWN;
                upFlag = MOUSEEVENTF_MIDDLEUP;
            }

            try
            {
                INPUT[] inputs = new INPUT[2];
                inputs[0] = new INPUT
                {
                    type = INPUT_MOUSE,
                    mi = new MOUSEINPUT { dwFlags = downFlag }
                };
                inputs[1] = new INPUT
                {
                    type = INPUT_MOUSE,
                    mi = new MOUSEINPUT { dwFlags = upFlag }
                };

                uint sent = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
                if (sent == 0)
                {
                    mouse_event(downFlag, 0, 0, 0, 0);
                    mouse_event(upFlag, 0, 0, 0, 0);
                }
            }
            catch
            {
                mouse_event(downFlag, 0, 0, 0, 0);
                mouse_event(upFlag, 0, 0, 0, 0);
            }
        }

        private static void WorkerLoop()
        {
            double frequency = (double)Stopwatch.Frequency;
            while (isRunning)
            {
                long start = Stopwatch.GetTimestamp();
                string currentButton = buttonType;
                int currentInterval = intervalMs;

                if (currentButton == "double")
                {
                    PerformClick("left");
                    Thread.Sleep(20);
                    PerformClick("left");
                }
                else
                {
                    PerformClick(currentButton);
                }

                if (currentInterval <= 0) currentInterval = 1;

                long targetTicks = start + (long)((currentInterval / 1000.0) * frequency);
                
                if (currentInterval > 3)
                {
                    int sleepPart = currentInterval - 2;
                    Thread.Sleep(sleepPart);
                }

                while (Stopwatch.GetTimestamp() < targetTicks && isRunning)
                {
                    Thread.SpinWait(10);
                }
            }
        }

        public static void StartClicking(string button, int interval)
        {
            buttonType = button ?? "left";
            intervalMs = Math.Max(1, Math.Min(10000, interval));

            if (!isRunning)
            {
                isRunning = true;
                workerThread = new Thread(WorkerLoop)
                {
                    IsBackground = true,
                    Priority = ThreadPriority.Highest
                };
                workerThread.Start();
            }

            Console.WriteLine("{\"status\":\"running\",\"button\":\"" + buttonType + "\",\"intervalMs\":" + intervalMs + "}");
        }

        public static void StopClicking()
        {
            isRunning = false;
            if (workerThread != null && workerThread.IsAlive)
            {
                workerThread.Join(200);
                workerThread = null;
            }
            Console.WriteLine("{\"status\":\"stopped\"}");
        }

        public static void Main(string[] args)
        {
            timeBeginPeriod(1);

            if (args.Length >= 2 && args[0].Equals("--run", StringComparison.OrdinalIgnoreCase))
            {
                string btn = args.Length > 1 ? args[1] : "left";
                int ms = 100;
                if (args.Length > 2) int.TryParse(args[2], out ms);
                StartClicking(btn, ms);
            }

            string line;
            while ((line = Console.ReadLine()) != null)
            {
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                string[] parts = line.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                string cmd = parts[0].ToUpperInvariant();

                if (cmd == "START")
                {
                    string btn = parts.Length > 1 ? parts[1].ToLowerInvariant() : "left";
                    int ms = 100;
                    if (parts.Length > 2) int.TryParse(parts[2], out ms);
                    StartClicking(btn, ms);
                }
                else if (cmd == "STOP")
                {
                    StopClicking();
                }
                else if (cmd == "STATUS")
                {
                    Console.WriteLine("{\"status\":\"" + (isRunning ? "running" : "stopped") + "\",\"button\":\"" + buttonType + "\",\"intervalMs\":" + intervalMs + "}");
                }
                else if (cmd == "EXIT" || cmd == "QUIT")
                {
                    StopClicking();
                    break;
                }
            }

            timeEndPeriod(1);
        }
    }
}
