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

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetThreadDesktop(IntPtr hDesktop);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool CloseDesktop(IntPtr hDesktop);

        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        [DllImport("winmm.dll", EntryPoint = "timeBeginPeriod", SetLastError = true)]
        private static extern uint timeBeginPeriod(uint uMilliseconds);

        [DllImport("winmm.dll", EntryPoint = "timeEndPeriod", SetLastError = true)]
        private static extern uint timeEndPeriod(uint uMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern IntPtr CreateWaitableTimerExW(IntPtr lpTimerAttributes, string lpTimerName, uint dwFlags, uint dwDesiredAccess);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetWaitableTimer(IntPtr hTimer, ref long pDueTime, int lPeriod, IntPtr pfnCompletionRoutine, IntPtr lpArgToCompletionRoutine, bool fResume);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool CloseHandle(IntPtr hObject);

        private const uint CREATE_WAITABLE_TIMER_HIGH_RESOLUTION = 0x00000002;
        private const uint TIMER_ALL_ACCESS = 0x001F0003;

        private const uint INPUT_MOUSE = 0;
        private const uint MOUSEEVENTF_LEFTDOWN   = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP     = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN  = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP    = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP   = 0x0040;

        private static volatile bool isRunning = false;
        private static volatile int intervalMs = 50;
        private static volatile string buttonType = "left";
        private static volatile int hotkeyVk = 0x75; // VK_F6
        private static Thread workerThread = null;
        private static Thread hotkeyThread = null;
        private static volatile bool exitRequested = false;
        private static readonly object stateLock = new object();
        private static int timerPeriodActive = 0;
        private static IntPtr inputDesktop = IntPtr.Zero;

        private static void SendMouseButtonDown(uint downFlag)
        {
            try
            {
                INPUT[] inputs = new INPUT[1];
                inputs[0] = new INPUT
                {
                    type = INPUT_MOUSE,
                    mi = new MOUSEINPUT { dwFlags = downFlag }
                };
                uint sent = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                if (sent == 0)
                {
                    mouse_event(downFlag, 0, 0, 0, 0);
                }
            }
            catch
            {
                mouse_event(downFlag, 0, 0, 0, 0);
            }
        }

        private static void SendMouseButtonUp(uint upFlag)
        {
            try
            {
                INPUT[] inputs = new INPUT[1];
                inputs[0] = new INPUT
                {
                    type = INPUT_MOUSE,
                    mi = new MOUSEINPUT { dwFlags = upFlag }
                };
                uint sent = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                if (sent == 0)
                {
                    mouse_event(upFlag, 0, 0, 0, 0);
                }
            }
            catch
            {
                mouse_event(upFlag, 0, 0, 0, 0);
            }
        }

        private static void ReleaseAllButtons()
        {
            try
            {
                mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                mouse_event(MOUSEEVENTF_MIDDLEUP, 0, 0, 0, 0);
            }
            catch {}
        }

        private static void PerformClick(string button, int currentInterval)
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

            // Calculate physical hold duration for realistic registration across OS, browsers & games
            int holdMs = Math.Max(1, Math.Min(12, currentInterval / 3));

            SendMouseButtonDown(downFlag);

            if (holdMs > 2)
            {
                Thread.Sleep(holdMs);
            }
            else
            {
                Thread.SpinWait(holdMs * 100);
            }

            SendMouseButtonUp(upFlag);
        }

        private static void WorkerLoop()
        {
            IntPtr hTimer = IntPtr.Zero;
            try
            {
                // Opened once per process and reused: a desktop handle assigned to a thread cannot
                // be closed (CloseDesktop fails while in use), so a per-START handle leaked forever.
                if (inputDesktop == IntPtr.Zero)
                {
                    inputDesktop = OpenInputDesktop(0, false, 0x01FF);
                }
                if (inputDesktop != IntPtr.Zero)
                {
                    SetThreadDesktop(inputDesktop);
                }
            }
            catch {}

            // High-resolution waitable timer (Win10 1803+): blocks instead of spinning a core.
            try { hTimer = CreateWaitableTimerExW(IntPtr.Zero, null, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS); } catch {}

            try
            {
                RunClickLoop(hTimer);
            }
            finally
            {
                ReleaseAllButtons();
                if (hTimer != IntPtr.Zero) CloseHandle(hTimer);
            }
        }

        private static void RunClickLoop(IntPtr hTimer)
        {
            double frequency = (double)Stopwatch.Frequency;

            while (isRunning)
            {
                long start = Stopwatch.GetTimestamp();
                string currentButton = buttonType;
                int currentInterval = intervalMs;

                if (currentButton == "double")
                {
                    PerformClick("left", currentInterval);
                    Thread.Sleep(20);
                    PerformClick("left", currentInterval);
                }
                else
                {
                    PerformClick(currentButton, currentInterval);
                }

                if (currentInterval <= 0) currentInterval = 1;

                long targetTicks = start + (long)((currentInterval / 1000.0) * frequency);
                long currentTicks = Stopwatch.GetTimestamp();
                long remainingTicks = targetTicks - currentTicks;

                if (remainingTicks > 0)
                {
                    double remainingMsD = (remainingTicks * 1000.0) / frequency;
                    if (hTimer != IntPtr.Zero && remainingMsD > 0.75)
                    {
                        // Relative due time in 100 ns units (negative = relative); wake ~0.5 ms early.
                        long due = -(long)((remainingMsD - 0.5) * 10000.0);
                        if (due >= 0) due = -1;
                        if (SetWaitableTimer(hTimer, ref due, 0, IntPtr.Zero, IntPtr.Zero, false))
                        {
                            WaitForSingleObject(hTimer, (uint)remainingMsD + 20);
                        }
                        else if (remainingMsD > 3)
                        {
                            Thread.Sleep((int)remainingMsD - 2);
                        }
                    }
                    else if (remainingMsD > 3)
                    {
                        Thread.Sleep((int)remainingMsD - 2);
                    }

                    // Short spin tail only (<= ~0.5 ms with the timer, <= ~3 ms without).
                    while (Stopwatch.GetTimestamp() < targetTicks && isRunning)
                    {
                        Thread.SpinWait(10);
                    }
                }
            }
        }

        private static int ParseVkKey(string keyName)
        {
            if (string.IsNullOrEmpty(keyName)) return 0;
            string k = keyName.Trim().ToUpperInvariant();
            if (k == "F1") return 0x70;
            if (k == "F2") return 0x71;
            if (k == "F3") return 0x72;
            if (k == "F4") return 0x73;
            if (k == "F5") return 0x74;
            if (k == "F6") return 0x75;
            if (k == "F7") return 0x76;
            if (k == "F8") return 0x77;
            if (k == "F9") return 0x78;
            if (k == "F10") return 0x79;
            if (k == "F11") return 0x7A;
            if (k == "F12") return 0x7B;
            if (k == "MOUSE4" || k == "XBUTTON1") return 0x05;
            if (k == "MOUSE5" || k == "XBUTTON2") return 0x06;
            return 0;
        }

        private static void HotkeyListenerLoop()
        {
            bool wasPressed = false;

            while (!exitRequested)
            {
                int vk = hotkeyVk;
                if (vk > 0)
                {
                    short state = GetAsyncKeyState(vk);
                    bool isPressed = (state & 0x8000) != 0;

                    if (isPressed && !wasPressed)
                    {
                        wasPressed = true;

                        if (isRunning)
                        {
                            StopClicking();
                            Console.WriteLine("{\"event\":\"toggle\",\"status\":\"stopped\"}");
                        }
                        else
                        {
                            StartClicking(buttonType, intervalMs);
                            Console.WriteLine("{\"event\":\"toggle\",\"status\":\"running\",\"button\":\"" + buttonType + "\",\"intervalMs\":" + intervalMs + "}");
                        }
                    }
                    else if (!isPressed && wasPressed)
                    {
                        wasPressed = false;
                    }
                }

                Thread.Sleep(15);
            }
        }

        public static void StartClicking(string button, int interval)
        {
            // Called from both the stdin thread and the hotkey thread.
            lock (stateLock)
            {
                string b = (button ?? "left").ToLowerInvariant();
                if (b != "left" && b != "right" && b != "middle" && b != "double") b = "left";
                buttonType = b;
                intervalMs = Math.Max(1, Math.Min(10000, interval));

                if (!isRunning)
                {
                    // A previous worker that did not finish within StopClicking's Join keeps
                    // checking isRunning; let it exit before starting a new one.
                    if (workerThread != null && workerThread.IsAlive) workerThread.Join(500);
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
        }

        public static void StopClicking()
        {
            lock (stateLock)
            {
                isRunning = false;
                if (workerThread != null && workerThread.IsAlive)
                {
                    workerThread.Join(250);
                }
                ReleaseAllButtons();
                Console.WriteLine("{\"status\":\"stopped\"}");
            }
        }

        private static void Cleanup()
        {
            exitRequested = true;
            isRunning = false;
            ReleaseAllButtons();
            if (Interlocked.Exchange(ref timerPeriodActive, 0) == 1)
            {
                timeEndPeriod(1);
            }
        }

        public static void SetHotkey(string key)
        {
            hotkeyVk = ParseVkKey(key);
            Console.WriteLine("{\"status\":\"hotkey_updated\",\"hotkey\":\"" + (key ?? "") + "\",\"vk\":" + hotkeyVk + "}");
        }

        public static void Main(string[] args)
        {
            if (timeBeginPeriod(1) == 0) timerPeriodActive = 1;
            AppDomain.CurrentDomain.ProcessExit += (s, e) => Cleanup();
            Console.CancelKeyPress += (s, e) => Cleanup();

            // Start hotkey listener thread
            hotkeyThread = new Thread(HotkeyListenerLoop)
            {
                IsBackground = true,
                Priority = ThreadPriority.Normal
            };
            hotkeyThread.Start();

            if (args.Length >= 2 && args[0].Equals("--run", StringComparison.OrdinalIgnoreCase))
            {
                string btn = args.Length > 1 ? args[1] : "left";
                int ms = 50;
                if (args.Length > 2) int.TryParse(args[2], out ms);
                StartClicking(btn, ms);
            }

            string line;
            while (true)
            {
                try { line = Console.ReadLine(); } catch { line = null; }
                // EOF = parent (Electron) closed the pipe or died: stop clicking and exit.
                if (line == null) break;
                line = line.Trim();
                if (string.IsNullOrEmpty(line)) continue;

                string[] parts = line.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                string cmd = parts[0].ToUpperInvariant();

                if (cmd == "START")
                {
                    string btn = parts.Length > 1 ? parts[1].ToLowerInvariant() : "left";
                    int ms = 50;
                    if (parts.Length > 2) int.TryParse(parts[2], out ms);
                    StartClicking(btn, ms);
                }
                else if (cmd == "STOP")
                {
                    StopClicking();
                }
                else if (cmd == "HOTKEY")
                {
                    string key = parts.Length > 1 ? parts[1] : "";
                    SetHotkey(key);
                }
                else if (cmd == "STATUS")
                {
                    Console.WriteLine("{\"status\":\"" + (isRunning ? "running" : "stopped") + "\",\"button\":\"" + buttonType + "\",\"intervalMs\":" + intervalMs + ",\"hotkeyVk\":" + hotkeyVk + "}");
                }
                else if (cmd == "EXIT" || cmd == "QUIT")
                {
                    exitRequested = true;
                    StopClicking();
                    break;
                }
            }

            exitRequested = true;
            try { if (isRunning) StopClicking(); } catch {}
            Cleanup();
        }
    }
}
