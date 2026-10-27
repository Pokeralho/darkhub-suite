// DarkHub MCP bridge for clients that only speak stdio (Claude Desktop).
//
// The client starts this executable and writes JSON-RPC messages, one per line, to stdin. Each one is POSTed to the MCP
// endpoint the running DarkHub app serves on 127.0.0.1 (url and token in mcp.json in DarkHub's profile folder) and the
// answer is written back to stdout as one line. When DarkHub is not open, requests get a JSON-RPC error saying so.
// mcp.json is read again on every message, so turning the server on later or rotating the token needs no restart.
//
// Usage: DarkHub.Mcp.exe [--config "%APPDATA%\DarkHub\mcp.json"]
// Build: csc /target:exe /platform:anycpu /optimize+ /r:System.Web.Extensions.dll /out:DarkHub.Mcp.exe DarkHub.Mcp.cs
// (.NET Framework 4.x, present on every Windows 10/11). No admin manifest: AI clients launch it unelevated.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Web.Script.Serialization;

internal static class DarkHubMcp
{
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 8 * 1024 * 1024 };
    private static string sessionId;

    private static int Main(string[] args)
    {
        string config = null;
        for (int i = 0; i + 1 < args.Length; i++) if (args[i] == "--config") config = args[i + 1];

        Stream stdinStream = Console.OpenStandardInput();
        var stdin = new StreamReader(stdinStream, new UTF8Encoding(false));
        var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true, NewLine = "\n" };

        string line;
        while ((line = stdin.ReadLine()) != null)
        {
            if (line.Trim().Length == 0) continue;
            string answer = Relay(line, config);
            if (answer != null && answer.Trim().Length > 0) stdout.WriteLine(answer.Replace("\r", "").Replace("\n", ""));
        }
        return 0;
    }

    private static string Relay(string line, string config)
    {
        string url, token;
        if (!ReadConfig(config, out url, out token))
            return ErrorFor(line, "DarkHub MCP is off. Open DarkHub > Presets e modulos > IA (MCP) and turn it on.");
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = "POST";
            req.ContentType = "application/json";
            req.Accept = "application/json, text/event-stream";
            req.Headers["Authorization"] = "Bearer " + token;
            if (sessionId != null) req.Headers["Mcp-Session-Id"] = sessionId;
            req.Timeout = 6 * 60 * 1000; // installs wait for the user to approve in DarkHub (up to 5 minutes)
            req.ReadWriteTimeout = req.Timeout;
            req.Proxy = null;
            byte[] body = Encoding.UTF8.GetBytes(line);
            req.ContentLength = body.Length;
            using (Stream s = req.GetRequestStream()) s.Write(body, 0, body.Length);
            using (var res = (HttpWebResponse)req.GetResponse())
            {
                string sid = res.Headers["Mcp-Session-Id"];
                if (!string.IsNullOrEmpty(sid)) sessionId = sid;
                using (var r = new StreamReader(res.GetResponseStream(), Encoding.UTF8)) return r.ReadToEnd();
            }
        }
        catch (WebException e)
        {
            var res = e.Response as HttpWebResponse;
            if (res != null)
            {
                using (var r = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
                {
                    string text = r.ReadToEnd();
                    if (text.TrimStart().StartsWith("{") && HasId(line)) return WithId(text, line);
                }
                return ErrorFor(line, "DarkHub answered HTTP " + (int)res.StatusCode + ".");
            }
            return ErrorFor(line, "DarkHub is not open (or its MCP server is off).");
        }
        catch (Exception e)
        {
            return ErrorFor(line, "Bridge error: " + e.Message);
        }
    }

    private static bool ReadConfig(string explicitPath, out string url, out string token)
    {
        url = null;
        token = null;
        var candidates = new List<string>();
        // --config means exactly that profile; without it, the installed app first, then development profiles
        if (explicitPath != null) candidates.Add(explicitPath);
        else
        {
            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            foreach (string dir in new[] { "DarkHub", "darkhub-suite", "darkhub-suite-dev" }) candidates.Add(Path.Combine(appData, dir, "mcp.json"));
        }
        foreach (string file in candidates)
        {
            try
            {
                if (!File.Exists(file)) continue;
                var cfg = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file, Encoding.UTF8));
                object on, u, t;
                if (!cfg.TryGetValue("enabled", out on) || !(on is bool) || !(bool)on) continue;
                if (!cfg.TryGetValue("url", out u) || !cfg.TryGetValue("token", out t)) continue;
                string us = u as string;
                if (us == null || !us.StartsWith("http://127.0.0.1:")) continue; // never send the token anywhere else
                url = us;
                token = t as string;
                return token != null;
            }
            catch { }
        }
        return false;
    }

    private static object IdOf(string line)
    {
        try
        {
            var msg = Json.Deserialize<Dictionary<string, object>>(line);
            object id;
            return msg != null && msg.TryGetValue("id", out id) ? id : null;
        }
        catch { return null; }
    }

    private static bool HasId(string line) { return IdOf(line) != null; }

    /** Notifications (no id) get no answer; requests get a JSON-RPC error with their id. */
    private static string ErrorFor(string line, string message)
    {
        object id = IdOf(line);
        if (id == null) return null;
        return Json.Serialize(new Dictionary<string, object> {
            { "jsonrpc", "2.0" }, { "id", id },
            { "error", new Dictionary<string, object> { { "code", -32000 }, { "message", message } } }
        });
    }

    /** The server answers HTTP errors with id null (it could not read the request); give the request its id back. */
    private static string WithId(string text, string line)
    {
        try
        {
            var msg = Json.Deserialize<Dictionary<string, object>>(text);
            msg["id"] = IdOf(line);
            return Json.Serialize(msg);
        }
        catch { return ErrorFor(line, "DarkHub refused the request."); }
    }
}
