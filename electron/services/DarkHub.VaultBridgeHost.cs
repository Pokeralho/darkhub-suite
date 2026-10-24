// DarkHub Vault native messaging host.
//
// Chrome / Edge / Firefox start this executable when the DarkHub extension calls runtime.connectNative(). It is a
// byte relay between the browser (stdin/stdout, native messaging framing: uint32 LE length + UTF-8 JSON) and the
// running DarkHub app (TCP 127.0.0.1, same framing). It never parses, stores or logs the messages.
//
// Before relaying it runs a mutual HMAC-SHA256 handshake with the app using the per-start secret in bridge.cfg (next
// to this exe, inside the user's profile). The secret itself never goes on the wire, so a process that grabbed the
// port after DarkHub exited learns nothing and the host refuses to talk to it.
//
// Build: csc /target:exe /platform:anycpu /optimize+ /out:DarkHub.VaultBridgeHost.exe DarkHub.VaultBridgeHost.cs
// (.NET Framework 4.x, present on every Windows 10/11). No admin manifest: browsers launch it unelevated.
using System;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;

internal static class VaultBridgeHost
{
    private const int MaxFromBrowser = 64 * 1024;
    private const int MaxFromApp = 1024 * 1024;
    private static readonly object StdoutLock = new object();

    private static int Main(string[] args)
    {
        Stream stdin = Console.OpenStandardInput();
        Stream stdout = Console.OpenStandardOutput();

        int port;
        string secret;
        if (!ReadConfig(out port, out secret))
        {
            WriteJson(stdout, "{\"type\":\"error\",\"error\":\"app_not_running\"}");
            return 1;
        }

        TcpClient tcp = new TcpClient(AddressFamily.InterNetwork);
        NetworkStream net;
        try
        {
            tcp.NoDelay = true;
            tcp.Connect(IPAddress.Loopback, port);
            net = tcp.GetStream();
            net.ReadTimeout = 10000;
        }
        catch
        {
            WriteJson(stdout, "{\"type\":\"error\",\"error\":\"app_not_running\"}");
            return 1;
        }

        try
        {
            string nonceH = RandomHex(16);
            string argBlob = Convert.ToBase64String(Encoding.UTF8.GetBytes(string.Join("\n", args)));
            WriteFrame(net, Encoding.UTF8.GetBytes("DHVB1 H " + nonceH + " " + argBlob));

            byte[] reply = ReadFrame(net, 4096);
            string[] parts = reply == null ? null : Encoding.UTF8.GetString(reply).Split(' ');
            if (parts == null || parts.Length != 4 || parts[0] != "DHVB1" || parts[1] != "S" || parts[2].Length != 32)
                throw new InvalidDataException();
            string nonceS = parts[2];
            string expected = HmacHex(secret, "S|" + nonceH + "|" + nonceS);
            if (!FixedTimeEquals(expected, parts[3])) throw new InvalidDataException();
            WriteFrame(net, Encoding.UTF8.GetBytes("DHVB1 C " + HmacHex(secret, "C|" + nonceH + "|" + nonceS)));
            net.ReadTimeout = Timeout.Infinite;
        }
        catch
        {
            WriteJson(stdout, "{\"type\":\"error\",\"error\":\"bridge_auth_failed\"}");
            try { tcp.Close(); } catch { }
            return 2;
        }

        Thread appToBrowser = new Thread(delegate ()
        {
            Pump(net, stdout, MaxFromApp, true);
            Environment.Exit(0);
        });
        appToBrowser.IsBackground = true;
        appToBrowser.Start();

        Pump(stdin, net, MaxFromBrowser, false);
        try { tcp.Close(); } catch { }
        Environment.Exit(0);
        return 0;
    }

    private static bool ReadConfig(out int port, out string secret)
    {
        port = 0;
        secret = null;
        try
        {
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            string[] lines = File.ReadAllLines(Path.Combine(dir, "bridge.cfg"));
            foreach (string raw in lines)
            {
                string line = raw.Trim();
                if (line.StartsWith("port=")) int.TryParse(line.Substring(5), out port);
                else if (line.StartsWith("secret=")) secret = line.Substring(7);
            }
        }
        catch
        {
            return false;
        }
        return port > 0 && port < 65536 && secret != null && secret.Length == 64;
    }

    private static void Pump(Stream from, Stream to, int max, bool toStdout)
    {
        try
        {
            while (true)
            {
                byte[] body = ReadFrame(from, max);
                if (body == null) return;
                if (toStdout)
                {
                    lock (StdoutLock) { WriteFrame(to, body); }
                }
                else
                {
                    WriteFrame(to, body);
                }
            }
        }
        catch
        {
        }
    }

    private static byte[] ReadFrame(Stream s, int max)
    {
        byte[] head = new byte[4];
        if (!ReadExact(s, head, 4)) return null;
        int len = BitConverter.ToInt32(head, 0);
        if (len <= 0 || len > max) return null;
        byte[] body = new byte[len];
        if (!ReadExact(s, body, len)) return null;
        return body;
    }

    private static bool ReadExact(Stream s, byte[] buf, int n)
    {
        int off = 0;
        while (off < n)
        {
            int r = s.Read(buf, off, n - off);
            if (r <= 0) return false;
            off += r;
        }
        return true;
    }

    private static void WriteFrame(Stream s, byte[] body)
    {
        byte[] head = BitConverter.GetBytes(body.Length);
        s.Write(head, 0, 4);
        s.Write(body, 0, body.Length);
        s.Flush();
    }

    private static void WriteJson(Stream stdout, string json)
    {
        try
        {
            lock (StdoutLock) { WriteFrame(stdout, Encoding.UTF8.GetBytes(json)); }
        }
        catch
        {
        }
    }

    private static string RandomHex(int bytes)
    {
        byte[] b = new byte[bytes];
        using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) rng.GetBytes(b);
        return ToHex(b);
    }

    private static string HmacHex(string secret, string text)
    {
        using (HMACSHA256 h = new HMACSHA256(Encoding.UTF8.GetBytes(secret)))
            return ToHex(h.ComputeHash(Encoding.UTF8.GetBytes(text)));
    }

    private static string ToHex(byte[] b)
    {
        StringBuilder sb = new StringBuilder(b.Length * 2);
        foreach (byte x in b) sb.Append(x.ToString("x2"));
        return sb.ToString();
    }

    private static bool FixedTimeEquals(string a, string b)
    {
        if (a == null || b == null || a.Length != b.Length) return false;
        int diff = 0;
        for (int i = 0; i < a.Length; i++) diff |= a[i] ^ b[i];
        return diff == 0;
    }
}
