import { ipcMain } from 'electron';
import net from 'net';
import os from 'os';
import fs from 'node:fs/promises';
import { runCommand } from './services/PowerShellRunner.js';
import NetLatencyService from './services/NetLatencyService.js';

const SAFE_HOST_RE = /^[A-Za-z0-9_.:-]{1,253}$/;

function assertSafeHost(host) {
  const h = String(host ?? '').trim();
  if (!SAFE_HOST_RE.test(h)) {
    throw new Error('Host inválido: apenas letras, números, pontos, dois-pontos, hífen e underscore são permitidos.');
  }
  return h;
}

async function runWinCmd(command, args = []) {
  try {
    const { code, stdout, stderr } = await runCommand('cmd.exe', ['/c', 'chcp', '65001', '>', 'nul', '&&', command, ...args], {
      timeoutMs: 20000,
      trim: true
    });
    if (code !== 0) return { ok: false, output: stderr || stdout };
    return { ok: true, output: stdout };
  } catch (err) {
    return { ok: false, output: err?.message ?? String(err) };
  }
}

export function registerNetworkIPC() {
  ipcMain.handle('network:ping', async (_event, host) => {
    try {
      const safeHost = assertSafeHost(host);
      if (process.platform === 'win32') {
        const { code, stdout } = await runCommand(
          'cmd.exe',
          ['/c', 'chcp', '65001', '>', 'nul', '&&', 'ping', '-n', '4', safeHost],
          { timeoutMs: 15000 }
        );
        const output = String(stdout || '');
        if (code !== 0) return { ok: false, output };
        const match = output.match(/(?:M.dia|Average)\s*=\s*(\d+)ms/i);
        const latency = match ? parseInt(match[1], 10) : -1;
        return { ok: true, output, latency };
      }
      const { code, stdout, stderr } = await runCommand('ping', ['-c', '4', '-W', '2', safeHost], { timeoutMs: 15000 });
      const output = `${stdout || ''}${stderr || ''}`;
      if (code !== 0) return { ok: false, output };
      const match = output.match(/(?:rtt|round-trip)[^=]*=\s*[\d.]+\/([\d.]+)\//i) || output.match(/time[=<]\s*([\d.]+)\s*ms/i);
      const latency = match ? Math.round(Number(match[1])) : -1;
      return { ok: true, output, latency };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('network:portScan', async (_event, payload) => {
    // `payload` may be null from the renderer; destructuring defaults only cover `undefined`.
    const { host, ports } = payload ?? {};
    let safeHost;
    try {
      safeHost = assertSafeHost(host);
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }

    const portList = Array.isArray(ports) ? ports : [];
    const MAX_PORTS = 256;
    const validPorts = portList
      .map((p) => Number(p))
      .filter((p) => Number.isInteger(p) && p >= 1 && p <= 65535)
      .slice(0, MAX_PORTS);

    if (validPorts.length === 0) {
      return { ok: false, error: 'Nenhuma porta válida informada (use valores entre 1 e 65535).' };
    }

    const checkPort = (port) => {
      return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(800);

        socket.on('connect', () => {
          socket.destroy();
          resolve({ port, status: 'open' });
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve({ port, status: 'timeout' });
        });

        socket.on('error', () => {
          socket.destroy();
          resolve({ port, status: 'closed' });
        });

        socket.connect(port, safeHost);
      });
    };

    // Probe in small parallel batches (results keep port order): a 256-port sequential scan
    // could take ~3.5 min at 800 ms per filtered port.
    const results = [];
    const BATCH = 16;
    for (let i = 0; i < validPorts.length; i += BATCH) {
      results.push(...await Promise.all(validPorts.slice(i, i + BATCH).map(checkPort)));
    }

    return { ok: true, results };
  });

  ipcMain.handle('network:flushDns', async () => {
    if (process.platform === 'win32') return runWinCmd('ipconfig', ['/flushdns']);
    try {
      const { code, stdout, stderr } = await runCommand('resolvectl', ['flush-caches'], { timeoutMs: 15000, trim: true });
      if (code === 0) return { ok: true, output: stdout || 'DNS cache flushed (resolvectl).' };
      const alt = await runCommand('systemd-resolve', ['--flush-caches'], { timeoutMs: 15000, trim: true }).catch(() => null);
      if (alt && alt.code === 0) return { ok: true, output: alt.stdout || 'DNS cache flushed.' };
      return { ok: false, output: stderr || stdout || 'Flush DNS não disponível nesta distribuição (requer systemd-resolved).' };
    } catch (err) {
      return { ok: false, output: err?.message ?? String(err) };
    }
  });

  // Needs administrator (the old non-elevated netsh calls failed without elevation); asks UAC and requires a reboot.
  ipcMain.handle('network:resetTcp', async () => {
    if (process.platform !== 'win32') {
      return { ok: false, output: 'Redefinição de pilha TCP/IP não suportada automaticamente no Linux. Verifique NetworkManager/rotas manualmente.' };
    }
    try { return await NetLatencyService.resetStack(); }
    catch (err) { return { ok: false, output: err?.message ?? String(err) }; }
  });

  // ---- latency lab (diagnostics are read-only; tweaks snapshot the previous value and offer Restore)
  const safe = (fn) => async (_event, payload) => {
    try { return await fn(payload ?? {}); }
    catch (err) { return { ok: false, error: err?.message ?? String(err) }; }
  };
  ipcMain.handle('network:latencyPresets', safe(() => ({ ok: true, presets: NetLatencyService.getPresets() })));
  ipcMain.handle('network:probe', safe((p) => NetLatencyService.probe({ host: p.host, mode: p.mode })));
  ipcMain.handle('network:traceHops', safe((p) => NetLatencyService.traceroute({ host: p.host, maxHops: p.maxHops })));
  ipcMain.handle('network:bufferbloat', safe((p) => NetLatencyService.bufferbloat({ host: p.host, seconds: p.seconds })));
  ipcMain.handle('network:mtuDiscover', safe((p) => NetLatencyService.mtu({ host: p.host })));
  ipcMain.handle('network:latencyState', safe(() => NetLatencyService.getState()));
  ipcMain.handle('network:applyLatencyTweak', safe((p) => NetLatencyService.applyTweak({ id: p.id, value: p.value, exe: p.exe })));
  ipcMain.handle('network:restoreLatencyTweak', safe((p) => NetLatencyService.restoreTweak({ id: p.id })));

  ipcMain.handle('network:dnsInfo', async () => {
    if (process.platform === 'win32') return runWinCmd('ipconfig', ['/all']);
    try {
      const resolv = await fs.readFile('/etc/resolv.conf', 'utf8').catch(() => '');
      const { stdout } = await runCommand('ip', ['addr'], { timeoutMs: 8000, trim: true }).catch(() => ({ stdout: '' }));
      const { stdout: route } = await runCommand('ip', ['route'], { timeoutMs: 8000, trim: true }).catch(() => ({ stdout: '' }));
      const out = [resolv ? `# /etc/resolv.conf\n${resolv}` : '', route ? `# ip route\n${route}` : '', stdout ? `# ip addr\n${stdout}` : ''].filter(Boolean).join('\n\n');
      return { ok: true, output: out || 'Nenhuma informação de rede disponível.' };
    } catch (err) {
      return { ok: false, output: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('network:tracert', async (_event, host) => {
    try {
      const safeHost = assertSafeHost(host);
      if (process.platform === 'win32') {
        const { code, stdout, stderr } = await runCommand(
          'cmd.exe',
          ['/c', 'chcp', '65001', '>', 'nul', '&&', 'tracert', '-d', '-h', '15', safeHost],
          { timeoutMs: 30000 }
        );
        return { ok: code === 0, output: String(stdout || '') + String(stderr || '') };
      }
      // prefer traceroute, fallback to tracepath
      let res = await runCommand('traceroute', ['-n', '-m', '15', '-w', '1', safeHost], { timeoutMs: 30000 }).catch(() => null);
      if (!res || (res.code !== 0 && !String(res.stdout || '').trim())) {
        res = await runCommand('tracepath', ['-n', safeHost], { timeoutMs: 30000 }).catch(() => null);
      }
      if (!res) return { ok: false, output: 'traceroute/tracepath não encontrado no sistema.' };
      return { ok: res.code === 0, output: String(res.stdout || '') + String(res.stderr || '') };
    } catch (err) {
      return { ok: false, output: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('network:adapterInfo', async () => {
    const ifaces = os.networkInterfaces();
    const lines = [];
    for (const [name, addrs] of Object.entries(ifaces)) {
      lines.push(`=== ${name} ===`);
      for (const a of addrs || []) {
        lines.push(`  ${a.family}: ${a.address}${a.internal ? ' (interno)' : ''}`);
        if (a.mac && a.mac !== '00:00:00:00:00:00') lines.push(`  MAC: ${a.mac}`);
      }
    }
    return { ok: true, output: lines.join('\n') || 'Nenhum adaptador encontrado.' };
  });

  ipcMain.handle('network:renewIp', async () => {
    if (process.platform === 'win32') {
      const r1 = await runWinCmd('ipconfig', ['/release']);
      const r2 = await runWinCmd('ipconfig', ['/renew']);
      return { ok: true, output: '[Release]\n' + r1.output + '\n[Renew]\n' + r2.output };
    }
    try {
      // best-effort: nmcli if available
      const devs = await runCommand('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE', 'device'], { timeoutMs: 8000, trim: true }).catch(() => null);
      if (!devs || devs.code !== 0) {
        return { ok: false, output: 'Renovação automática de IP requer NetworkManager (nmcli) ou ação manual (dhclient/networkctl) no Linux.' };
      }
      const active = String(devs.stdout || '').split('\n').map((l) => l.trim()).find((l) => /connected/i.test(l) && !/:loopback:/i.test(l));
      const dev = active ? active.split(':')[0] : '';
      if (!dev) return { ok: false, output: 'Nenhuma conexão ativa encontrada via NetworkManager.' };
      const down = await runCommand('nmcli', ['device', 'disconnect', dev], { timeoutMs: 15000, trim: true }).catch(() => ({ stdout: '', stderr: '' }));
      const up = await runCommand('nmcli', ['device', 'connect', dev], { timeoutMs: 20000, trim: true }).catch(() => ({ stdout: '', stderr: '' }));
      return { ok: up?.code === 0, output: `[disconnect ${dev}]\n${down?.stdout || down?.stderr || ''}\n[connect ${dev}]\n${up?.stdout || up?.stderr || ''}`.trim() };
    } catch (err) {
      return { ok: false, output: err?.message ?? String(err) };
    }
  });
}
