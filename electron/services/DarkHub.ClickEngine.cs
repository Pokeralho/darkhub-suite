using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace DarkHub.Native
{
    public static class ClickEngine
    {
        [StructLayout(LayoutKind.Sequential)]
        private struct INPUT
        {
            public uint type;
            public INPUTUNION u;
        }

        [StructLayout(LayoutKind.Explicit)]
        private struct INPUTUNION
        {
            [FieldOffset(0)]
            public MOUSEINPUT mi;
            [FieldOffset(0)]
            public KEYBDINPUT ki;
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

        [StructLayout(LayoutKind.Sequential)]
        private struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        private struct MacroRecord
        {
            public uint EventType;
            public uint Param1;
            public uint Param2;
            public uint TimestampMs;
            public uint Hwnd;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern uint MapVirtualKeyA(uint uCode, uint uMapType);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [DllImport("user32.dll")]
        private static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        private static extern int GetSystemMetrics(int nIndex);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

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
        private const uint INPUT_KEYBOARD = 1;

        private const uint MOUSEEVENTF_MOVE        = 0x0001;
        private const uint MOUSEEVENTF_LEFTDOWN    = 0x0002;
        private const uint MOUSEEVENTF_LEFTUP      = 0x0004;
        private const uint MOUSEEVENTF_RIGHTDOWN   = 0x0008;
        private const uint MOUSEEVENTF_RIGHTUP     = 0x0010;
        private const uint MOUSEEVENTF_MIDDLEDOWN  = 0x0020;
        private const uint MOUSEEVENTF_MIDDLEUP    = 0x0040;
        private const uint MOUSEEVENTF_VIRTUALDESK = 0x4000;
        private const uint MOUSEEVENTF_ABSOLUTE    = 0x8000;

        private const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        private const uint KEYEVENTF_KEYUP       = 0x0002;

        private const int SM_CXSCREEN = 0;
        private const int SM_CYSCREEN = 1;
        private const int SM_XVIRTUALSCREEN  = 76;
        private const int SM_YVIRTUALSCREEN  = 77;
        private const int SM_CXVIRTUALSCREEN = 78;
        private const int SM_CYVIRTUALSCREEN = 79;

        // TinyTask .rec 20-byte event codes
        private const uint EVT_SENTINEL    = 0x000;
        private const uint EVT_KEYDOWN     = 0x100;
        private const uint EVT_KEYUP       = 0x101;
        private const uint EVT_MOUSEMOVE   = 0x200;
        private const uint EVT_LBUTTONDOWN = 0x201;
        private const uint EVT_LBUTTONUP   = 0x202;
        private const uint EVT_RBUTTONDOWN = 0x204;
        private const uint EVT_RBUTTONUP   = 0x205;
        private const uint EVT_MBUTTONDOWN = 0x207;
        private const uint EVT_MBUTTONUP   = 0x208;

        // Fixed AutoClicker state
        private static volatile bool isRunning = false;
        private static volatile int intervalMs = 50;
        private static volatile string buttonType = "left";
        private static volatile int hotkeyVk = 0;
        private static volatile int hotkeyMods = 0;
        private static Thread workerThread = null;

        // Macro Recorder / Player state
        private static volatile int macroMode = 0; // 0 = idle, 1 = recording, 2 = playing
        private static volatile int macroRecVk = 0;
        private static volatile int macroRecMods = 0;
        private static volatile int macroPlayVk = 0;
        private static volatile int macroPlayMods = 0;
        private static volatile int macroSpeedX100 = 100; // 100 = 1.0x, 50 = 0.5x, 10000 = 100x
        private static volatile int macroLoops = 1;
        private static volatile bool macroContinuous = false;
        private static volatile uint selfPid = 0;
        private static string macroSavePath = null;
        private static List<MacroRecord> macroEvents = new List<MacroRecord>();
        private static Thread macroThread = null;

        private static Thread hotkeyThread = null;
        private static volatile bool exitRequested = false;
        private static readonly object stateLock = new object();
        private static readonly object outLock = new object();
        private static int timerPeriodActive = 0;
        private static IntPtr inputDesktop = IntPtr.Zero;

        private static void EmitJson(string json)
        {
            lock (outLock)
            {
                Console.WriteLine(json);
            }
        }

        private static void AttachInputDesktop()
        {
            try
            {
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
        }

        private static void WaitPreciseMs(IntPtr hTimer, double waitMs, Func<bool> keepWaiting)
        {
            if (waitMs <= 0.0) return;
            double frequency = (double)Stopwatch.Frequency;
            long start = Stopwatch.GetTimestamp();
            long targetTicks = start + (long)((waitMs / 1000.0) * frequency);

            while (keepWaiting())
            {
                long now = Stopwatch.GetTimestamp();
                long remTicks = targetTicks - now;
                if (remTicks <= 0) break;

                double remMs = (remTicks * 1000.0) / frequency;
                // Slice long waits into <= 40 ms chunks so STOP / Kill-Switch responds immediately
                double stepMs = remMs > 40.0 ? 40.0 : remMs;

                if (hTimer != IntPtr.Zero && stepMs > 0.75)
                {
                    long due = -(long)((stepMs - 0.5) * 10000.0);
                    if (due >= 0) due = -1;
                    if (SetWaitableTimer(hTimer, ref due, 0, IntPtr.Zero, IntPtr.Zero, false))
                    {
                        WaitForSingleObject(hTimer, (uint)stepMs + 20);
                    }
                    else if (stepMs > 3.0)
                    {
                        Thread.Sleep((int)stepMs - 2);
                    }
                }
                else if (stepMs > 3.0)
                {
                    Thread.Sleep((int)stepMs - 2);
                }
                else
                {
                    while (Stopwatch.GetTimestamp() < targetTicks && keepWaiting())
                    {
                        Thread.SpinWait(10);
                    }
                    break;
                }
            }
        }

        private static void SendMouseButtonDown(uint downFlag)
        {
            try
            {
                INPUT[] inputs = new INPUT[1];
                inputs[0].type = INPUT_MOUSE;
                inputs[0].u.mi = new MOUSEINPUT { dwFlags = downFlag };
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
                inputs[0].type = INPUT_MOUSE;
                inputs[0].u.mi = new MOUSEINPUT { dwFlags = upFlag };
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

        private static void SendMouseMoveAbsolute(int x, int y)
        {
            try
            {
                int vx = GetSystemMetrics(SM_XVIRTUALSCREEN);
                int vy = GetSystemMetrics(SM_YVIRTUALSCREEN);
                int vw = GetSystemMetrics(SM_CXVIRTUALSCREEN);
                int vh = GetSystemMetrics(SM_CYVIRTUALSCREEN);
                if (vw <= 1) vw = Math.Max(1, GetSystemMetrics(SM_CXSCREEN));
                if (vh <= 1) vh = Math.Max(1, GetSystemMetrics(SM_CYSCREEN));

                int normX = (int)(((long)(x - vx) * 65535L) / Math.Max(1, vw - 1));
                int normY = (int)(((long)(y - vy) * 65535L) / Math.Max(1, vh - 1));

                INPUT[] inputs = new INPUT[1];
                inputs[0].type = INPUT_MOUSE;
                inputs[0].u.mi = new MOUSEINPUT
                {
                    dx = normX,
                    dy = normY,
                    dwFlags = MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK
                };
                uint sent = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                SetCursorPos(x, y);
                if (sent == 0)
                {
                    int sw = Math.Max(1, GetSystemMetrics(SM_CXSCREEN));
                    int sh = Math.Max(1, GetSystemMetrics(SM_CYSCREEN));
                    mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, (uint)((x * 65535) / sw), (uint)((y * 65535) / sh), 0, 0);
                }
            }
            catch
            {
                try { SetCursorPos(x, y); } catch {}
            }
        }

        private static bool IsExtendedVk(byte vk)
        {
            if (vk >= 0x21 && vk <= 0x2E) return true;
            if (vk == 0x5B || vk == 0x5C || vk == 0x5D) return true;
            if (vk == 0xA3 || vk == 0xA5 || vk == 0x6F) return true;
            return false;
        }

        private static void SendKeyTransition(byte vk, bool keyUp)
        {
            if (vk == 0 || vk == 0xA0) return;
            uint scan = MapVirtualKeyA(vk, 0);
            uint flags = keyUp ? KEYEVENTF_KEYUP : 0u;
            if (IsExtendedVk(vk)) flags |= KEYEVENTF_EXTENDEDKEY;

            try
            {
                INPUT[] inputs = new INPUT[1];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].u.ki = new KEYBDINPUT
                {
                    wVk = vk,
                    wScan = (ushort)scan,
                    dwFlags = flags
                };
                uint sent = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
                if (sent == 0)
                {
                    keybd_event(vk, (byte)scan, flags, UIntPtr.Zero);
                }
            }
            catch
            {
                try { keybd_event(vk, (byte)scan, flags, UIntPtr.Zero); } catch {}
            }
        }

        private static void ReleaseAllButtons()
        {
            try
            {
                if (Down(0x01)) SendMouseButtonUp(MOUSEEVENTF_LEFTUP);
                if (Down(0x02)) SendMouseButtonUp(MOUSEEVENTF_RIGHTUP);
                if (Down(0x04)) SendMouseButtonUp(MOUSEEVENTF_MIDDLEUP);
            }
            catch {}
        }

        private static void ReleaseAllKeysAndButtons()
        {
            ReleaseAllButtons();
            try
            {
                for (int vk = 8; vk < 255; vk++)
                {
                    if (vk == 0x14 || vk == 0x90 || vk == 0x91) continue; // preserve Caps/Num/ScrollLock toggle state
                    if (Down(vk))
                    {
                        SendKeyTransition((byte)vk, true);
                    }
                }
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
            AttachInputDesktop();
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

                    while (Stopwatch.GetTimestamp() < targetTicks && isRunning)
                    {
                        Thread.SpinWait(10);
                    }
                }
            }
        }

        private static uint GetMacroDurationMs(List<MacroRecord> list)
        {
            if (list == null || list.Count < 2) return 0;
            uint first = list[0].TimestampMs;
            uint last = list[list.Count - 1].TimestampMs;
            return last >= first ? (last - first) : 0u;
        }

        private static void SaveRecFile(string path, List<MacroRecord> events)
        {
            if (string.IsNullOrEmpty(path)) return;
            string dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            {
                Directory.CreateDirectory(dir);
            }
            int count = events != null ? events.Count : 0;
            byte[] buf = new byte[(count + 3) * 20];
            for (int i = 0; i < count; i++)
            {
                MacroRecord ev = events[i];
                int off = i * 20;
                Buffer.BlockCopy(BitConverter.GetBytes(ev.EventType), 0, buf, off, 4);
                Buffer.BlockCopy(BitConverter.GetBytes(ev.Param1), 0, buf, off + 4, 4);
                Buffer.BlockCopy(BitConverter.GetBytes(ev.Param2), 0, buf, off + 8, 4);
                Buffer.BlockCopy(BitConverter.GetBytes(ev.TimestampMs), 0, buf, off + 12, 4);
                Buffer.BlockCopy(BitConverter.GetBytes(ev.Hwnd), 0, buf, off + 16, 4);
            }
            File.WriteAllBytes(path, buf);
        }

        private static List<MacroRecord> ReadRecFile(string path)
        {
            byte[] raw = File.ReadAllBytes(path);
            int offset = 0;
            if (raw.Length >= 36352 && raw[0] == 0x4D && raw[1] == 0x5A)
            {
                offset = 36352;
            }
            int payloadBytes = raw.Length - offset;
            if (payloadBytes < 20 || (payloadBytes % 20) != 0)
            {
                throw new InvalidDataException("Invalid .rec payload length");
            }
            int records = payloadBytes / 20;
            List<MacroRecord> list = new List<MacroRecord>(records);
            for (int i = 0; i < records; i++)
            {
                int pos = offset + (i * 20);
                uint type = BitConverter.ToUInt32(raw, pos);
                if (type == 0)
                {
                    if (list.Count > 0) break;
                    continue;
                }
                MacroRecord r = new MacroRecord();
                r.EventType = type;
                r.Param1 = BitConverter.ToUInt32(raw, pos + 4);
                r.Param2 = BitConverter.ToUInt32(raw, pos + 8);
                r.TimestampMs = BitConverter.ToUInt32(raw, pos + 12);
                r.Hwnd = BitConverter.ToUInt32(raw, pos + 16);
                list.Add(r);
            }
            return list;
        }

        private static bool IsHotkeyKey(int vk)
        {
            int mods = ModsDown();
            if (macroRecVk > 0 && vk == macroRecVk && mods == macroRecMods) return true;
            if (macroPlayVk > 0 && vk == macroPlayVk && mods == macroPlayMods) return true;
            return false;
        }

        private static void RecordWorkerLoop()
        {
            IntPtr hTimer = IntPtr.Zero;
            AttachInputDesktop();
            try { hTimer = CreateWaitableTimerExW(IntPtr.Zero, null, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS); } catch {}

            List<MacroRecord> captured = new List<MacroRecord>(2048);
            bool[] prevDown = new bool[256];
            for (int k = 1; k < 255; k++) prevDown[k] = Down(k);

            POINT pt;
            if (!GetCursorPos(out pt)) { pt.X = 0; pt.Y = 0; }
            int lastX = pt.X;
            int lastY = pt.Y;

            double freq = (double)Stopwatch.Frequency;
            long startTicks = Stopwatch.GetTimestamp();
            long lastProgressTicks = startTicks;

            IntPtr initHwnd = GetForegroundWindow();
            captured.Add(new MacroRecord
            {
                EventType = EVT_MOUSEMOVE,
                Param1 = (uint)pt.X,
                Param2 = (uint)pt.Y,
                TimestampMs = 0u,
                Hwnd = (uint)(initHwnd.ToInt64() & 0xFFFFFFFFL)
            });

            try
            {
                while (macroMode == 1 && !exitRequested)
                {
                    long nowTicks = Stopwatch.GetTimestamp();
                    uint elapsedMs = (uint)(((nowTicks - startTicks) * 1000.0) / freq);
                    IntPtr fg = GetForegroundWindow();
                    uint fgU32 = (uint)(fg.ToInt64() & 0xFFFFFFFFL);

                    GetCursorPos(out pt);

                    // Mouse Move
                    if (pt.X != lastX || pt.Y != lastY)
                    {
                        lastX = pt.X;
                        lastY = pt.Y;
                        captured.Add(new MacroRecord
                        {
                            EventType = EVT_MOUSEMOVE,
                            Param1 = (uint)pt.X,
                            Param2 = (uint)pt.Y,
                            TimestampMs = elapsedMs,
                            Hwnd = fgU32
                        });
                    }

                    // Mouse Buttons & Keyboard Transitions
                    for (int vk = 1; vk < 255; vk++)
                    {
                        // Skip left/right specific modifier VKs so 0x10/0x11/0x12 stay canonical like TinyTask
                        if (vk >= 0xA0 && vk <= 0xA5) continue;
                        if (vk == 0x03 || vk == 0x05 || vk == 0x06 || vk == 0x07) continue;

                        bool cur = Down(vk);
                        if (cur != prevDown[vk])
                        {
                            prevDown[vk] = cur;
                            if (IsHotkeyKey(vk)) continue;

                            if (vk == 0x01)
                            {
                                captured.Add(new MacroRecord
                                {
                                    EventType = cur ? EVT_LBUTTONDOWN : EVT_LBUTTONUP,
                                    Param1 = (uint)pt.X,
                                    Param2 = (uint)pt.Y,
                                    TimestampMs = elapsedMs,
                                    Hwnd = fgU32
                                });
                            }
                            else if (vk == 0x02)
                            {
                                captured.Add(new MacroRecord
                                {
                                    EventType = cur ? EVT_RBUTTONDOWN : EVT_RBUTTONUP,
                                    Param1 = (uint)pt.X,
                                    Param2 = (uint)pt.Y,
                                    TimestampMs = elapsedMs,
                                    Hwnd = fgU32
                                });
                            }
                            else if (vk == 0x04)
                            {
                                captured.Add(new MacroRecord
                                {
                                    EventType = cur ? EVT_MBUTTONDOWN : EVT_MBUTTONUP,
                                    Param1 = (uint)pt.X,
                                    Param2 = (uint)pt.Y,
                                    TimestampMs = elapsedMs,
                                    Hwnd = fgU32
                                });
                            }
                            else if (vk >= 0x08)
                            {
                                uint scan = MapVirtualKeyA((uint)vk, 0) & 0xFFu;
                                captured.Add(new MacroRecord
                                {
                                    EventType = cur ? EVT_KEYDOWN : EVT_KEYUP,
                                    Param1 = (scan << 8) | (uint)vk,
                                    Param2 = scan,
                                    TimestampMs = elapsedMs,
                                    Hwnd = fgU32
                                });
                            }
                        }
                    }

                    if (((nowTicks - lastProgressTicks) * 1000.0) / freq >= 200.0)
                    {
                        lastProgressTicks = nowTicks;
                        EmitJson("{\"event\":\"macro_progress\",\"mode\":\"recording\",\"elapsedMs\":" + elapsedMs + ",\"eventCount\":" + captured.Count + "}");
                    }

                    WaitPreciseMs(hTimer, 4.0, () => macroMode == 1 && !exitRequested);
                }
            }
            finally
            {
                if (hTimer != IntPtr.Zero) CloseHandle(hTimer);
            }

            // Strip trailing clicks/moves targeted at DarkHub's own window when user clicked "Stop Recording"
            if (selfPid != 0 && captured.Count > 1)
            {
                uint endTs = captured[captured.Count - 1].TimestampMs;
                while (captured.Count > 1)
                {
                    MacroRecord tail = captured[captured.Count - 1];
                    if (endTs - tail.TimestampMs > 650u) break;
                    uint pid = 0;
                    if (tail.Hwnd != 0)
                    {
                        GetWindowThreadProcessId(new IntPtr((int)tail.Hwnd), out pid);
                    }
                    if (pid == selfPid && (tail.EventType == EVT_LBUTTONDOWN || tail.EventType == EVT_LBUTTONUP || tail.EventType == EVT_MOUSEMOVE))
                    {
                        captured.RemoveAt(captured.Count - 1);
                    }
                    else
                    {
                        break;
                    }
                }
            }

            uint duration = GetMacroDurationMs(captured);
            string targetFile = null;
            lock (stateLock)
            {
                macroEvents = captured;
                targetFile = macroSavePath;
                if (macroMode == 1) macroMode = 0;
            }

            if (!string.IsNullOrEmpty(targetFile))
            {
                try { SaveRecFile(targetFile, captured); } catch {}
            }

            EmitJson("{\"event\":\"macro\",\"mode\":\"idle\",\"recorded\":true,\"eventCount\":" + captured.Count + ",\"durationMs\":" + duration + "}");
        }

        private static void MacroPlayWorkerLoop()
        {
            IntPtr hTimer = IntPtr.Zero;
            AttachInputDesktop();
            try { hTimer = CreateWaitableTimerExW(IntPtr.Zero, null, CREATE_WAITABLE_TIMER_HIGH_RESOLUTION, TIMER_ALL_ACCESS); } catch {}

            List<MacroRecord> snapshot;
            int speedX100;
            int totalLoops;
            bool continuous;

            lock (stateLock)
            {
                snapshot = new List<MacroRecord>(macroEvents);
                speedX100 = macroSpeedX100;
                totalLoops = Math.Max(1, macroLoops);
                continuous = macroContinuous;
            }

            uint durationMs = GetMacroDurationMs(snapshot);
            string stoppedReason = "completed";
            double freq = (double)Stopwatch.Frequency;

            try
            {
                if (snapshot.Count == 0)
                {
                    stoppedReason = "empty";
                    return;
                }

                int loopIdx = 0;
                while (macroMode == 2 && !exitRequested && (continuous || loopIdx < totalLoops))
                {
                    loopIdx++;
                    long loopStartTicks = Stopwatch.GetTimestamp();
                    long lastProgressTicks = loopStartTicks;
                    bool mouseHeld = false;

                    EmitJson("{\"event\":\"macro_progress\",\"mode\":\"playing\",\"loop\":" + loopIdx + ",\"totalLoops\":" + totalLoops + ",\"continuous\":" + (continuous ? "true" : "false") + ",\"elapsedMs\":0,\"durationMs\":" + durationMs + ",\"eventCount\":" + snapshot.Count + "}");

                    int i = 0;
                    while (i < snapshot.Count && macroMode == 2 && !exitRequested)
                    {
                        // Hardware emergency kill-switch: Pause (0x13) or ScrollLock (0x91) like TinyTask
                        if (Down(0x13) || Down(0x91))
                        {
                            stoppedReason = "killswitch";
                            macroMode = 0;
                            break;
                        }

                        MacroRecord rec = snapshot[i];
                        int curSpeed = Math.Max(10, macroSpeedX100);

                        // Dispatch event
                        if (rec.EventType == EVT_MOUSEMOVE)
                        {
                            // 100x Turbo coalescing (same algorithm as TinyTask FUN_004034c6)
                            if (curSpeed >= 10000 && !mouseHeld)
                            {
                                while (i + 1 < snapshot.Count && snapshot[i + 1].EventType == EVT_MOUSEMOVE)
                                {
                                    if ((i % 6) == 0)
                                    {
                                        SendMouseMoveAbsolute((int)snapshot[i].Param1, (int)snapshot[i].Param2);
                                    }
                                    i++;
                                }
                                rec = snapshot[i];
                            }
                            SendMouseMoveAbsolute((int)rec.Param1, (int)rec.Param2);
                        }
                        else if (rec.EventType == EVT_LBUTTONDOWN)
                        {
                            SendMouseMoveAbsolute((int)rec.Param1, (int)rec.Param2);
                            SendMouseButtonDown(MOUSEEVENTF_LEFTDOWN);
                            mouseHeld = true;
                        }
                        else if (rec.EventType == EVT_LBUTTONUP)
                        {
                            SendMouseMoveAbsolute((int)rec.Param1, (int)rec.Param2);
                            SendMouseButtonUp(MOUSEEVENTF_LEFTUP);
                            mouseHeld = false;
                        }
                        else if (rec.EventType == EVT_RBUTTONDOWN)
                        {
                            SendMouseMoveAbsolute((int)rec.Param1, (int)rec.Param2);
                            SendMouseButtonDown(MOUSEEVENTF_RIGHTDOWN);
                            mouseHeld = true;
                        }
                        else if (rec.EventType == EVT_RBUTTONUP)
                        {
                            SendMouseMoveAbsolute((int)rec.Param1, (int)rec.Param2);
                            SendMouseButtonUp(MOUSEEVENTF_RIGHTUP);
                            mouseHeld = false;
                        }
                        else if (rec.EventType == EVT_MBUTTONDOWN)
                        {
                            SendMouseMoveAbsolute((int)rec.Param1, (int)rec.Param2);
                            SendMouseButtonDown(MOUSEEVENTF_MIDDLEDOWN);
                            mouseHeld = true;
                        }
                        else if (rec.EventType == EVT_MBUTTONUP)
                        {
                            SendMouseMoveAbsolute((int)rec.Param1, (int)rec.Param2);
                            SendMouseButtonUp(MOUSEEVENTF_MIDDLEUP);
                            mouseHeld = false;
                        }
                        else if (rec.EventType == EVT_KEYDOWN)
                        {
                            SendKeyTransition((byte)(rec.Param1 & 0xFFu), false);
                        }
                        else if (rec.EventType == EVT_KEYUP)
                        {
                            SendKeyTransition((byte)(rec.Param1 & 0xFFu), true);
                        }

                        long nowTicks = Stopwatch.GetTimestamp();
                        if (((nowTicks - lastProgressTicks) * 1000.0) / freq >= 200.0)
                        {
                            lastProgressTicks = nowTicks;
                            uint loopElapsed = (uint)(((nowTicks - loopStartTicks) * 1000.0) / freq);
                            EmitJson("{\"event\":\"macro_progress\",\"mode\":\"playing\",\"loop\":" + loopIdx + ",\"totalLoops\":" + totalLoops + ",\"continuous\":" + (continuous ? "true" : "false") + ",\"elapsedMs\":" + loopElapsed + ",\"durationMs\":" + durationMs + ",\"eventCount\":" + snapshot.Count + "}");
                        }

                        if (i + 1 < snapshot.Count && macroMode == 2 && !exitRequested)
                        {
                            uint curTs = rec.TimestampMs;
                            uint nextTs = snapshot[i + 1].TimestampMs;
                            uint rawDelta = nextTs > curTs ? (nextTs - curTs) : 0u;
                            double waitMs = curSpeed >= 10000 ? (rawDelta > 0 ? 1.0 : 0.0) : (rawDelta * 100.0) / (double)curSpeed;
                            if (waitMs > 0.1)
                            {
                                WaitPreciseMs(hTimer, waitMs, () => macroMode == 2 && !exitRequested && !Down(0x13) && !Down(0x91));
                            }
                        }

                        i++;
                    }

                    ReleaseAllKeysAndButtons();
                }

                if (macroMode != 2 && stoppedReason == "completed")
                {
                    stoppedReason = "stopped";
                }
            }
            finally
            {
                ReleaseAllKeysAndButtons();
                if (hTimer != IntPtr.Zero) CloseHandle(hTimer);
                int count = 0;
                lock (stateLock)
                {
                    if (macroMode == 2) macroMode = 0;
                    count = macroEvents.Count;
                }
                EmitJson("{\"event\":\"macro\",\"mode\":\"idle\",\"stoppedBy\":\"" + stoppedReason + "\",\"eventCount\":" + count + ",\"durationMs\":" + durationMs + "}");
            }
        }

        private static int ParseVkKey(string keyName)
        {
            if (string.IsNullOrEmpty(keyName)) return 0;
            string k = keyName.Trim().ToUpperInvariant();
            if (k.Length == 1 && k[0] >= 'A' && k[0] <= 'Z') return k[0];
            if (k.Length == 1 && k[0] >= '0' && k[0] <= '9') return k[0];
            int n;
            if (k.Length >= 2 && k[0] == 'F' && int.TryParse(k.Substring(1), out n) && n >= 1 && n <= 24) return 0x70 + n - 1;
            if (k.StartsWith("NUM") && k.Length == 4 && k[3] >= '0' && k[3] <= '9') return 0x60 + (k[3] - '0');
            switch (k)
            {
                case "MOUSE4": case "XBUTTON1": return 0x05;
                case "MOUSE5": case "XBUTTON2": return 0x06;
                case "MOUSEMIDDLE": return 0x04;
                case "SPACE": return 0x20;
                case "TAB": return 0x09;
                case "ENTER": case "RETURN": return 0x0D;
                case "BACKSPACE": return 0x08;
                case "ESCAPE": case "ESC": return 0x1B;
                case "INSERT": return 0x2D;
                case "DELETE": return 0x2E;
                case "HOME": return 0x24;
                case "END": return 0x23;
                case "PAGEUP": return 0x21;
                case "PAGEDOWN": return 0x22;
                case "UP": return 0x26;
                case "DOWN": return 0x28;
                case "LEFT": return 0x25;
                case "RIGHT": return 0x27;
                case "CAPSLOCK": return 0x14;
                case "SCROLLLOCK": return 0x91;
                case "PAUSE": return 0x13;
                case "PRINTSCREEN": return 0x2C;
                case "NUMADD": return 0x6B;
                case "NUMSUB": return 0x6D;
                case "NUMMULT": return 0x6A;
                case "NUMDIV": return 0x6F;
                case "NUMDEC": return 0x6E;
                case "-": return 0xBD;
                case "=": case "PLUS": return 0xBB;
                case ",": return 0xBC;
                case ".": return 0xBE;
                case "/": return 0xBF;
                case ";": return 0xBA;
                case "'": return 0xDE;
                case "[": return 0xDB;
                case "]": return 0xDD;
                case "\\": return 0xDC;
                case "`": return 0xC0;
            }
            return 0;
        }

        private static void ParseHotkey(string text, out int vk, out int mods)
        {
            vk = 0; mods = 0;
            if (string.IsNullOrEmpty(text) || text.Equals("NONE", StringComparison.OrdinalIgnoreCase)) return;
            string[] parts = text.Split('+');
            for (int i = 0; i < parts.Length; i++)
            {
                string p = parts[i].Trim().ToUpperInvariant();
                if (p.Length == 0) { if (i == parts.Length - 1) { vk = 0xBB; } continue; }
                if (p == "CTRL" || p == "CONTROL" || p == "COMMANDORCONTROL" || p == "CMDORCTRL") mods |= 1;
                else if (p == "ALT" || p == "OPTION") mods |= 2;
                else if (p == "SHIFT") mods |= 4;
                else if (p == "SUPER" || p == "META" || p == "WIN") mods |= 8;
                else { int k = ParseVkKey(p); if (k == 0 || vk != 0) { vk = 0; mods = 0; return; } vk = k; }
            }
            if (vk == 0) mods = 0;
        }

        private static bool Down(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

        private static int ModsDown()
        {
            int m = 0;
            if (Down(0x11)) m |= 1;
            if (Down(0x12)) m |= 2;
            if (Down(0x10)) m |= 4;
            if (Down(0x5B) || Down(0x5C)) m |= 8;
            return m;
        }

        private static void HotkeyListenerLoop()
        {
            bool wasClickPressed = false;
            bool wasRecPressed = false;
            bool wasPlayPressed = false;

            while (!exitRequested)
            {
                int modsNow = ModsDown();

                int vkClick = hotkeyVk;
                if (vkClick > 0)
                {
                    bool isPressed = Down(vkClick) && modsNow == hotkeyMods;
                    if (isPressed && !wasClickPressed)
                    {
                        wasClickPressed = true;
                        if (isRunning)
                        {
                            StopClicking();
                            EmitJson("{\"event\":\"toggle\",\"status\":\"stopped\"}");
                        }
                        else
                        {
                            StartClicking(buttonType, intervalMs);
                            EmitJson("{\"event\":\"toggle\",\"status\":\"running\",\"button\":\"" + buttonType + "\",\"intervalMs\":" + intervalMs + "}");
                        }
                    }
                    else if (!isPressed && wasClickPressed)
                    {
                        wasClickPressed = false;
                    }
                }

                int vkRec = macroRecVk;
                if (vkRec > 0)
                {
                    bool recPressed = Down(vkRec) && modsNow == macroRecMods;
                    if (recPressed && !wasRecPressed)
                    {
                        wasRecPressed = true;
                        if (macroMode == 1) StopMacroRecording();
                        else StartMacroRecording(null);
                    }
                    else if (!recPressed && wasRecPressed)
                    {
                        wasRecPressed = false;
                    }
                }

                int vkPlay = macroPlayVk;
                if (vkPlay > 0)
                {
                    bool playPressed = Down(vkPlay) && modsNow == macroPlayMods;
                    if (playPressed && !wasPlayPressed)
                    {
                        wasPlayPressed = true;
                        if (macroMode == 2) StopMacroPlayback();
                        else if (macroMode == 0) StartMacroPlayback(macroSpeedX100, macroLoops, macroContinuous);
                    }
                    else if (!playPressed && wasPlayPressed)
                    {
                        wasPlayPressed = false;
                    }
                }

                Thread.Sleep(15);
            }
        }

        private static void StopMacroInternalUnlocked()
        {
            if (macroMode != 0)
            {
                macroMode = 0;
                if (macroThread != null && macroThread.IsAlive && Thread.CurrentThread != macroThread)
                {
                    macroThread.Join(350);
                }
                ReleaseAllKeysAndButtons();
            }
        }

        public static void StartMacroRecording(string savePathOverride)
        {
            lock (stateLock)
            {
                if (isRunning)
                {
                    isRunning = false;
                    if (workerThread != null && workerThread.IsAlive) workerThread.Join(250);
                }
                StopMacroInternalUnlocked();

                if (!string.IsNullOrEmpty(savePathOverride))
                {
                    macroSavePath = savePathOverride;
                }

                ReleaseAllKeysAndButtons();
                macroEvents = new List<MacroRecord>();
                macroMode = 1;
                macroThread = new Thread(RunWithTimer(RecordWorkerLoop))
                {
                    IsBackground = true,
                    Priority = ThreadPriority.Highest
                };
                macroThread.Start();
                EmitJson("{\"event\":\"macro\",\"mode\":\"recording\",\"eventCount\":0,\"durationMs\":0}");
            }
        }

        public static void StopMacroRecording()
        {
            Thread t = null;
            lock (stateLock)
            {
                if (macroMode != 1) return;
                macroMode = 0;
                t = macroThread;
            }
            if (t != null && t.IsAlive && Thread.CurrentThread != t)
            {
                t.Join(500);
            }
        }

        public static void StartMacroPlayback(int speedX100, int loops, bool continuous)
        {
            lock (stateLock)
            {
                if (macroMode == 1) return;
                if (isRunning)
                {
                    isRunning = false;
                    if (workerThread != null && workerThread.IsAlive) workerThread.Join(250);
                }
                StopMacroInternalUnlocked();

                macroSpeedX100 = Math.Max(10, Math.Min(10000, speedX100));
                macroLoops = Math.Max(1, Math.Min(99999, loops));
                macroContinuous = continuous;

                if (macroEvents == null || macroEvents.Count == 0)
                {
                    EmitJson("{\"event\":\"macro\",\"mode\":\"idle\",\"error\":\"empty\",\"eventCount\":0,\"durationMs\":0}");
                    return;
                }

                ReleaseAllKeysAndButtons();
                macroMode = 2;
                uint dur = GetMacroDurationMs(macroEvents);
                int cnt = macroEvents.Count;
                macroThread = new Thread(RunWithTimer(MacroPlayWorkerLoop))
                {
                    IsBackground = true,
                    Priority = ThreadPriority.Highest
                };
                macroThread.Start();
                EmitJson("{\"event\":\"macro\",\"mode\":\"playing\",\"loop\":1,\"totalLoops\":" + macroLoops + ",\"continuous\":" + (macroContinuous ? "true" : "false") + ",\"speedX100\":" + macroSpeedX100 + ",\"eventCount\":" + cnt + ",\"durationMs\":" + dur + "}");
            }
        }

        public static void StopMacroPlayback()
        {
            Thread t = null;
            lock (stateLock)
            {
                if (macroMode != 2) return;
                macroMode = 0;
                t = macroThread;
            }
            if (t != null && t.IsAlive && Thread.CurrentThread != t)
            {
                t.Join(400);
            }
            ReleaseAllKeysAndButtons();
        }

        public static void StartClicking(string button, int interval)
        {
            lock (stateLock)
            {
                StopMacroInternalUnlocked();

                string b = (button ?? "left").ToLowerInvariant();
                if (b != "left" && b != "right" && b != "middle" && b != "double") b = "left";
                buttonType = b;
                intervalMs = Math.Max(1, Math.Min(10000, interval));

                if (!isRunning)
                {
                    if (workerThread != null && workerThread.IsAlive) workerThread.Join(500);
                    isRunning = true;
                    workerThread = new Thread(RunWithTimer(WorkerLoop))
                    {
                        IsBackground = true,
                        Priority = ThreadPriority.Highest
                    };
                    workerThread.Start();
                }

                EmitJson("{\"status\":\"running\",\"button\":\"" + buttonType + "\",\"intervalMs\":" + intervalMs + "}");
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
                EmitJson("{\"status\":\"stopped\"}");
            }
        }

        // 1 ms timer resolution only while a clicking / recording / playback worker is alive: the daemon itself runs
        // 24/7 for the global hotkeys and must not keep the whole system at 1 ms while idle. Reference-counted, one
        // acquire + one release per worker thread (RunWithTimer), and force-released on exit.
        private static readonly object timerLock = new object();
        private static int timerRefs = 0;

        private static void AcquireTimerPeriod()
        {
            lock (timerLock)
            {
                timerRefs++;
                if (timerRefs == 1 && timerPeriodActive == 0)
                {
                    try { if (timeBeginPeriod(1) == 0) timerPeriodActive = 1; } catch {}
                }
            }
        }

        private static void ReleaseTimerPeriod()
        {
            lock (timerLock)
            {
                if (timerRefs <= 0) return; // already force-released by Cleanup
                timerRefs--;
                if (timerRefs == 0 && timerPeriodActive == 1)
                {
                    try { timeEndPeriod(1); } catch {}
                    timerPeriodActive = 0;
                }
            }
        }

        private static ThreadStart RunWithTimer(ThreadStart body)
        {
            return delegate
            {
                AcquireTimerPeriod();
                try { body(); }
                finally { ReleaseTimerPeriod(); }
            };
        }

        private static void Cleanup()
        {
            exitRequested = true;
            isRunning = false;
            macroMode = 0;
            ReleaseAllKeysAndButtons();
            lock (timerLock)
            {
                timerRefs = 0;
                if (timerPeriodActive == 1)
                {
                    try { timeEndPeriod(1); } catch {}
                    timerPeriodActive = 0;
                }
            }
        }

        public static void SetHotkey(string key)
        {
            int vk, mods;
            ParseHotkey(key, out vk, out mods);
            hotkeyMods = mods;
            hotkeyVk = vk;
            EmitJson("{\"status\":\"hotkey_updated\",\"vk\":" + hotkeyVk + ",\"mods\":" + hotkeyMods + "}");
        }

        public static void SetMacroHotkeys(string recKey, string playKey)
        {
            int rVk, rMods, pVk, pMods;
            ParseHotkey(recKey, out rVk, out rMods);
            ParseHotkey(playKey, out pVk, out pMods);
            macroRecMods = rMods;
            macroRecVk = rVk;
            macroPlayMods = pMods;
            macroPlayVk = pVk;
            EmitJson("{\"status\":\"macro_hotkeys_updated\",\"recVk\":" + macroRecVk + ",\"playVk\":" + macroPlayVk + "}");
        }

        public static void Arm(string button, int interval)
        {
            lock (stateLock)
            {
                string b = (button ?? "left").ToLowerInvariant();
                if (b != "left" && b != "right" && b != "middle" && b != "double") b = "left";
                buttonType = b;
                intervalMs = Math.Max(1, Math.Min(10000, interval));
            }
            EmitJson("{\"status\":\"armed\",\"button\":\"" + buttonType + "\",\"intervalMs\":" + intervalMs + "}");
        }

        private static string DecodeB64Utf8(string b64)
        {
            if (string.IsNullOrEmpty(b64) || b64 == "NONE") return null;
            try
            {
                return Encoding.UTF8.GetString(Convert.FromBase64String(b64));
            }
            catch
            {
                return null;
            }
        }

        public static void Main(string[] args)
        {
            Console.OutputEncoding = new UTF8Encoding(false);
            try { SetProcessDPIAware(); } catch {}
            AppDomain.CurrentDomain.ProcessExit += (s, e) => Cleanup();
            Console.CancelKeyPress += (s, e) => Cleanup();

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
                else if (cmd == "ARM")
                {
                    string btn = parts.Length > 1 ? parts[1].ToLowerInvariant() : "left";
                    int ms = 50;
                    if (parts.Length > 2) int.TryParse(parts[2], out ms);
                    Arm(btn, ms);
                }
                else if (cmd == "HOTKEY")
                {
                    string key = parts.Length > 1 ? parts[1] : "";
                    SetHotkey(key);
                }
                else if (cmd == "SELF_PID")
                {
                    uint p = 0;
                    if (parts.Length > 1) uint.TryParse(parts[1], out p);
                    selfPid = p;
                }
                else if (cmd == "MACRO_HOTKEYS")
                {
                    string rk = parts.Length > 1 ? parts[1] : "NONE";
                    string pk = parts.Length > 2 ? parts[2] : "NONE";
                    SetMacroHotkeys(rk, pk);
                }
                else if (cmd == "MACRO_SAVE_PATH")
                {
                    string path = parts.Length > 1 ? DecodeB64Utf8(parts[1]) : null;
                    lock (stateLock) { macroSavePath = path; }
                }
                else if (cmd == "MACRO_ARM")
                {
                    int sp = 100;
                    int lp = 1;
                    int cont = 0;
                    if (parts.Length > 1) int.TryParse(parts[1], out sp);
                    if (parts.Length > 2) int.TryParse(parts[2], out lp);
                    if (parts.Length > 3) int.TryParse(parts[3], out cont);
                    lock (stateLock)
                    {
                        macroSpeedX100 = Math.Max(10, Math.Min(10000, sp));
                        macroLoops = Math.Max(1, Math.Min(99999, lp));
                        macroContinuous = cont != 0;
                    }
                    EmitJson("{\"status\":\"macro_armed\",\"speedX100\":" + macroSpeedX100 + ",\"loops\":" + macroLoops + ",\"continuous\":" + (macroContinuous ? "true" : "false") + "}");
                }
                else if (cmd == "REC_START")
                {
                    string savePath = parts.Length > 1 ? DecodeB64Utf8(parts[1]) : null;
                    StartMacroRecording(savePath);
                }
                else if (cmd == "REC_STOP")
                {
                    StopMacroRecording();
                }
                else if (cmd == "MACRO_PLAY")
                {
                    int sp = macroSpeedX100;
                    int lp = macroLoops;
                    int cont = macroContinuous ? 1 : 0;
                    if (parts.Length > 1) int.TryParse(parts[1], out sp);
                    if (parts.Length > 2) int.TryParse(parts[2], out lp);
                    if (parts.Length > 3) int.TryParse(parts[3], out cont);
                    StartMacroPlayback(sp, lp, cont != 0);
                }
                else if (cmd == "MACRO_STOP")
                {
                    StopMacroPlayback();
                }
                else if (cmd == "MACRO_LOAD")
                {
                    string loadPath = parts.Length > 1 ? DecodeB64Utf8(parts[1]) : null;
                    if (!string.IsNullOrEmpty(loadPath) && File.Exists(loadPath))
                    {
                        try
                        {
                            List<MacroRecord> loaded = ReadRecFile(loadPath);
                            uint dur = GetMacroDurationMs(loaded);
                            lock (stateLock)
                            {
                                StopMacroInternalUnlocked();
                                macroEvents = loaded;
                            }
                            EmitJson("{\"event\":\"macro_loaded\",\"eventCount\":" + loaded.Count + ",\"durationMs\":" + dur + "}");
                        }
                        catch
                        {
                            EmitJson("{\"event\":\"macro_error\",\"error\":\"load_failed\"}");
                        }
                    }
                }
                else if (cmd == "MACRO_CLEAR")
                {
                    lock (stateLock)
                    {
                        StopMacroInternalUnlocked();
                        macroEvents = new List<MacroRecord>();
                    }
                    EmitJson("{\"event\":\"macro\",\"mode\":\"idle\",\"eventCount\":0,\"durationMs\":0}");
                }
                else if (cmd == "STATUS")
                {
                    string mMode = macroMode == 1 ? "recording" : (macroMode == 2 ? "playing" : "idle");
                    EmitJson("{\"status\":\"" + (isRunning ? "running" : "stopped") + "\",\"button\":\"" + buttonType + "\",\"intervalMs\":" + intervalMs + ",\"hotkeyVk\":" + hotkeyVk + ",\"macroMode\":\"" + mMode + "\",\"macroEvents\":" + macroEvents.Count + "}");
                }
                else if (cmd == "EXIT" || cmd == "QUIT")
                {
                    exitRequested = true;
                    StopMacroRecording();
                    StopMacroPlayback();
                    StopClicking();
                    break;
                }
            }

            exitRequested = true;
            try { StopMacroRecording(); } catch {}
            try { StopMacroPlayback(); } catch {}
            try { if (isRunning) StopClicking(); } catch {}
            Cleanup();
        }
    }
}
