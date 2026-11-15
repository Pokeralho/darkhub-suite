import { spawn as nodeSpawn, execFile } from 'node:child_process'

// Serial port terminal without native Node modules: a PowerShell 5.1 process compiles a tiny C# bridge
// (System.IO.Ports) with Add-Type. Protocol on stdio, one line per message:
//   bridge -> app: "OPEN" | "D<base64 bytes>" | "E<error message>"
//   app -> bridge: "W<base64 bytes>" | "BRK" (send break) | "Q" (close)
// Port settings travel in environment variables, never inside the script text.

const BRIDGE = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$src = @'
using System; using System.IO.Ports; using System.Threading;
public static class DhSerialBridge {
  public static void Run(string port, int baud, string parity, int dataBits, string stopBits, string flow) {
    var sp = new SerialPort(port, baud, (Parity)Enum.Parse(typeof(Parity), parity), dataBits, (StopBits)Enum.Parse(typeof(StopBits), stopBits));
    sp.Handshake = (Handshake)Enum.Parse(typeof(Handshake), flow);
    sp.DtrEnable = true;
    sp.RtsEnable = flow != "RequestToSend" && flow != "RequestToSendXOnXOff";
    sp.Open();
    var o = Console.Out;
    lock (o) { o.WriteLine("OPEN"); o.Flush(); }
    var reader = new Thread(() => {
      var buf = new byte[4096];
      try {
        while (true) {
          int n = sp.BaseStream.Read(buf, 0, buf.Length);
          if (n <= 0) break;
          var s = Convert.ToBase64String(buf, 0, n);
          lock (o) { o.WriteLine("D" + s); o.Flush(); }
        }
      } catch (Exception e) { lock (o) { o.WriteLine("E" + e.Message.Replace("\r", " ").Replace("\n", " ")); o.Flush(); } }
      Environment.Exit(0);
    });
    reader.IsBackground = true;
    reader.Start();
    string line;
    while ((line = Console.In.ReadLine()) != null) {
      if (line.StartsWith("W")) { var b = Convert.FromBase64String(line.Substring(1)); sp.BaseStream.Write(b, 0, b.Length); }
      else if (line == "BRK") { sp.BreakState = true; Thread.Sleep(250); sp.BreakState = false; }
      else if (line == "Q") break;
    }
    sp.Close();
  }
}
'@
try {
  Add-Type -TypeDefinition $src -Language CSharp
  [DhSerialBridge]::Run($env:DH_PORT, [int]$env:DH_BAUD, $env:DH_PARITY, [int]$env:DH_DATABITS, $env:DH_STOPBITS, $env:DH_FLOW)
} catch {
  [Console]::Out.WriteLine('E' + ($_.Exception.Message -replace '[\r\n]+', ' '))
  exit 1
}
`

const LIST = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$names = @{}
Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\((COM\d+)\)' } | ForEach-Object { if ($_.Name -match '\((COM\d+)\)') { $names[$matches[1]] = $_.Name } }
$ports = [System.IO.Ports.SerialPort]::GetPortNames() | Sort-Object -Unique
@($ports | ForEach-Object { [pscustomobject]@{ port = $_; name = $(if ($names[$_]) { $names[$_] } else { $_ }) } }) | ConvertTo-Json -Compress
`

const encode = (script) => Buffer.from(script, 'utf16le').toString('base64')
export const PARITIES = ['None', 'Odd', 'Even', 'Mark', 'Space']
export const STOP_BITS = ['One', 'OnePointFive', 'Two']
export const FLOWS = ['None', 'XOnXOff', 'RequestToSend', 'RequestToSendXOnXOff']
export const BAUDS = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export class SerialError extends Error {
  constructor(code, message) {
    super(message || code)
    this.code = code
  }
}

export function validateSerialOptions(o = {}) {
  const port = String(o.port ?? '').toUpperCase()
  if (!/^COM\d{1,3}$/.test(port)) throw new SerialError('VALIDATION', 'port must look like COM3')
  const baud = Number(o.baud ?? 9600)
  if (!Number.isInteger(baud) || baud < 50 || baud > 4_000_000) throw new SerialError('VALIDATION', 'invalid baud rate')
  const dataBits = Number(o.dataBits ?? 8)
  if (![5, 6, 7, 8].includes(dataBits)) throw new SerialError('VALIDATION', 'data bits must be 5 to 8')
  const parity = PARITIES.includes(o.parity) ? o.parity : 'None'
  const stopBits = STOP_BITS.includes(o.stopBits) ? o.stopBits : 'One'
  const flow = FLOWS.includes(o.flow) ? o.flow : 'None'
  const newline = ['cr', 'lf', 'crlf'].includes(o.newline) ? o.newline : 'cr'
  return { port, baud, dataBits, parity, stopBits, flow, newline, localEcho: o.localEcho === true }
}

export class SerialService {
  constructor({ spawn = nodeSpawn, run = execFile, platform = process.platform } = {}) {
    this.spawn = spawn
    this.run = run
    this.platform = platform
    this.sessions = new Map()
  }

  listPorts() {
    if (this.platform !== 'win32') return Promise.resolve([])
    return new Promise((resolve) => {
      this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encode(LIST)], { windowsHide: true, timeout: 20000 }, (err, stdout) => {
        if (err) return resolve([])
        try {
          const v = JSON.parse(String(stdout).trim() || '[]')
          resolve((Array.isArray(v) ? v : [v]).filter((x) => x?.port).map((x) => ({ port: String(x.port), name: String(x.name ?? x.port) })))
        } catch { resolve([]) }
      })
    })
  }

  open({ sessionId, ...opts } = {}, send = () => {}) {
    if (!ID_RE.test(String(sessionId ?? ''))) throw new SerialError('VALIDATION', 'invalid sessionId')
    if (this.sessions.has(sessionId)) throw new SerialError('VALIDATION', 'session already exists')
    const o = validateSerialOptions(opts)
    if (this.platform !== 'win32') throw new SerialError('UNSUPPORTED', 'serial ports are supported on Windows only')
    const child = this.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(BRIDGE)], {
      windowsHide: true,
      env: { ...process.env, DH_PORT: o.port, DH_BAUD: String(o.baud), DH_PARITY: o.parity, DH_DATABITS: String(o.dataBits), DH_STOPBITS: o.stopBits, DH_FLOW: o.flow }
    })
    const s = { id: sessionId, child, send, opts: o, status: 'connecting', decoder: new TextDecoder('utf-8'), pending: '', timer: null, buf: '', closed: false }
    this.sessions.set(sessionId, s)
    const status = (st, extra = {}) => { s.status = st; try { send('ssh:session:status', { sessionId, status: st, ...extra }) } catch { /* window gone */ } }
    status('connecting')
    return new Promise((resolve) => {
      let settled = false
      const settle = (v) => { if (!settled) { settled = true; resolve(v) } }
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        s.buf += chunk
        let i
        while ((i = s.buf.indexOf('\n')) >= 0) {
          const line = s.buf.slice(0, i).replace(/\r$/, '')
          s.buf = s.buf.slice(i + 1)
          if (line === 'OPEN') { status('connected'); settle({ ok: true, sessionId, status: 'connected' }) }
          else if (line.startsWith('D')) this.output(s, Buffer.from(line.slice(1), 'base64'))
          else if (line.startsWith('E')) {
            s.error = line.slice(1).slice(0, 300)
            if (!settled) settle({ ok: false, code: /denied|in use|acesso/i.test(s.error) ? 'PORT_IN_USE' : 'SERIAL_ERROR', error: s.error })
          }
        }
      })
      child.on('error', (err) => { s.error = String(err?.message ?? err); settle({ ok: false, code: 'SERIAL_ERROR', error: s.error }); this.finish(sessionId) })
      child.on('exit', () => {
        settle({ ok: false, code: 'SERIAL_ERROR', error: s.error ?? 'serial bridge exited' })
        this.finish(sessionId)
      })
    })
  }

  output(s, bytes) {
    const text = s.decoder.decode(bytes, { stream: true })
    if (!text) return
    s.pending += text
    if (!s.timer) s.timer = setTimeout(() => this.flush(s), 8)
  }

  flush(s) {
    if (s.timer) { clearTimeout(s.timer); s.timer = null }
    if (!s.pending) return
    const data = s.pending
    s.pending = ''
    try { s.send('ssh:session:data', { sessionId: s.id, data }) } catch { /* window gone */ }
  }

  write(sessionId, text) {
    const s = this.sessions.get(sessionId)
    if (!s || s.closed || s.status !== 'connected') return false
    // xterm sends CR for Enter: translate to the line ending the device expects
    let out = String(text)
    if (s.opts.newline === 'lf') out = out.replace(/\r/g, '\n')
    else if (s.opts.newline === 'crlf') out = out.replace(/\r(?!\n)/g, '\r\n')
    if (s.opts.localEcho) { s.pending += out.replace(/\r(?!\n)/g, '\r\n'); this.flush(s) }
    try { s.child.stdin.write(`W${Buffer.from(out, 'utf8').toString('base64')}\n`); return true } catch { return false }
  }

  sendBreak(sessionId) {
    const s = this.sessions.get(sessionId)
    if (!s || s.closed) return false
    try { s.child.stdin.write('BRK\n'); return true } catch { return false }
  }

  has(sessionId) { return this.sessions.has(sessionId) }

  finish(sessionId) {
    const s = this.sessions.get(sessionId)
    if (!s || s.closed) return
    s.closed = true
    this.flush(s)
    this.sessions.delete(sessionId)
    try { s.send('ssh:session:status', { sessionId, status: s.error ? 'error' : 'closed', error: s.error }) } catch { /* window gone */ }
  }

  close(sessionId) {
    const s = this.sessions.get(sessionId)
    if (!s) return false
    try { s.child.stdin.write('Q\n'); s.child.stdin.end() } catch { /* gone */ }
    const t = setTimeout(() => { try { s.child.kill() } catch { /* gone */ } }, 1500)
    t.unref?.()
    this.finish(sessionId)
    return true
  }

  closeBySender(predicate) {
    for (const [id, s] of this.sessions) if (predicate(s.send)) this.close(id)
  }

  closeAll() {
    for (const id of [...this.sessions.keys()]) this.close(id)
  }
}
