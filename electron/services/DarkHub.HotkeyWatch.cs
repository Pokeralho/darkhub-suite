// DarkHub hotkey watcher: tells the app when one of its hotkeys is pressed, without taking the key away from the game
// or app in front (GetAsyncKeyState only looks; a Windows global shortcut would swallow the key).
// stdin:  SET <id> <hotkey>   |   CLEAR <id>        (hotkey: "Ctrl+Shift+F9", "Alt+X", "Mouse4"...)
// stdout: {"event":"hotkey","id":"<id>"}  and  {"status":"set","id":"<id>","ok":true|false}
// Exits when stdin closes (the app quit or died).
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

namespace DarkHub
{
    public static class HotkeyWatch
    {
        [DllImport("user32.dll")]
        private static extern short GetAsyncKeyState(int vKey);

        private class Hotkey { public int Vk; public int Mods; public bool Down; }
        private static readonly Dictionary<string, Hotkey> keys = new Dictionary<string, Hotkey>();
        private static readonly object gate = new object();
        private static volatile bool quit = false;

        // One key in Electron accelerator spelling (F6, A, 7, Space, Mouse4...) -> virtual-key code, 0 if unknown.
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

        // "Ctrl+Shift+F6" -> key + modifier mask. Unknown pieces make the whole hotkey invalid (vk 0).
        private static void ParseHotkey(string text, out int vk, out int mods)
        {
            vk = 0; mods = 0;
            if (string.IsNullOrEmpty(text) || text.Equals("NONE", StringComparison.OrdinalIgnoreCase)) return;
            string[] parts = text.Split('+');
            for (int i = 0; i < parts.Length; i++)
            {
                string p = parts[i].Trim().ToUpperInvariant();
                // "Ctrl++" (the plus key) splits into empty pieces
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

        private static void Emit(string json) { lock (gate) { Console.Out.WriteLine(json); Console.Out.Flush(); } }

        private static void Watch()
        {
            while (!quit)
            {
                List<KeyValuePair<string, Hotkey>> list;
                lock (keys) list = new List<KeyValuePair<string, Hotkey>>(keys);
                if (list.Count > 0)
                {
                    int mods = ModsDown();
                    foreach (var kv in list)
                    {
                        bool pressed = Down(kv.Value.Vk) && mods == kv.Value.Mods;
                        if (pressed && !kv.Value.Down) Emit("{\"event\":\"hotkey\",\"id\":\"" + kv.Key + "\"}");
                        kv.Value.Down = pressed;
                    }
                }
                Thread.Sleep(15);
            }
        }

        public static void Main(string[] args)
        {
            var t = new Thread(Watch) { IsBackground = true };
            t.Start();
            string line;
            while ((line = Console.ReadLine()) != null)
            {
                string[] parts = line.Trim().Split(new char[] { ' ' }, 3, StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 2) continue;
                string id = parts[1];
                // ids are plain words chosen by the app
                bool safe = id.Length <= 32;
                foreach (char c in id) if (!char.IsLetterOrDigit(c) && c != '-' && c != '_') safe = false;
                if (!safe) continue;
                string cmd = parts[0].ToUpperInvariant();
                if (cmd == "SET" && parts.Length == 3)
                {
                    int vk, mods;
                    ParseHotkey(parts[2], out vk, out mods);
                    lock (keys) { if (vk != 0) keys[id] = new Hotkey { Vk = vk, Mods = mods, Down = true }; else keys.Remove(id); }
                    Emit("{\"status\":\"set\",\"id\":\"" + id + "\",\"ok\":" + (vk != 0 ? "true" : "false") + "}");
                }
                else if (cmd == "CLEAR")
                {
                    lock (keys) keys.Remove(id);
                }
            }
            quit = true;
        }
    }
}
