import { ipcMain } from 'electron';
import net from 'net';
import os from 'os';
import { runCommand } from './services/PowerShellRunner.js';

const SAFE_HOST_RE = /^[A-Za-z0-9_.:-]{1,253}$/;

function assertSafeHost(host) {
  const h = String(host ?? '').trim();
  if (!SAFE_HOST_RE.test(h)) {
    throw new Error('Host inválido: apenas letras, números, pontos, dois-pontos, hífen e underscore são permitidos.');
  }
  return h;
}

async function runCmd(command, args = []) {
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

      const { code, stdout } = await runCommand(
        'cmd.exe',
        ['/c', 'chcp', '65001', '>', 'nul', '&&', 'ping', '-n', '4', safeHost],
        { timeoutMs: 15000 }
      );
      const output = stdout;
      if (code !== 0) return { ok: false, output };

      const match = output.match(/(?:M.dia|Average)\s*=\s*(\d+)ms/i);
      const latency = match ? parseInt(match[1]) : -1;
      return { ok: true, output, latency };
    } catch (err) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('network:portScan', async (_event, { host, ports } = {}) => {
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

    const results = [];

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

    for (const port of validPorts) {
      results.push(await checkPort(port));
    }

    return { ok: true, results };
  });

  ipcMain.handle('network:flushDns', async () => {
    return runCmd('ipconfig', ['/flushdns']);
  });

  ipcMain.handle('network:resetTcp', async () => {
    const r1 = await runCmd('netsh', ['int', 'ip', 'reset']);
    const r2 = await runCmd('netsh', ['winsock', 'reset']);
    return {
      ok: r1.ok || r2.ok,
      output: '[Reset IP]\n' + r1.output + '\n[Reset Winsock]\n' + r2.output
    };
  });

  ipcMain.handle('network:dnsInfo', async () => {
    return runCmd('ipconfig', ['/all']);
  });

  ipcMain.handle('network:tracert', async (_event, host) => {
    try {
      const safeHost = assertSafeHost(host);
      const { code, stdout, stderr } = await runCommand(
        'cmd.exe',
        ['/c', 'chcp', '65001', '>', 'nul', '&&', 'tracert', '-d', '-h', '15', safeHost],
        { timeoutMs: 30000 }
      );
      return { ok: code === 0, output: stdout + stderr };
    } catch (err) {
      return { ok: false, output: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('network:adapterInfo', async () => {

    const ifaces = os.networkInterfaces();
    const lines = [];
    for (const [name, addrs] of Object.entries(ifaces)) {
      lines.push(`=== ${name} ===`);
      for (const a of addrs) {
        lines.push(`  ${a.family}: ${a.address}${a.internal ? ' (interno)' : ''}`);
        if (a.mac && a.mac !== '00:00:00:00:00:00') lines.push(`  MAC: ${a.mac}`);
      }
    }
    return { ok: true, output: lines.join('\n') };
  });

  ipcMain.handle('network:renewIp', async () => {
    const r1 = await runCmd('ipconfig', ['/release']);
    const r2 = await runCmd('ipconfig', ['/renew']);
    return {
      ok: true,
      output: '[Release]\n' + r1.output + '\n[Renew]\n' + r2.output
    };
  });
}
