

import { BrowserWindow, screen } from 'electron'
import os from 'node:os'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { gamingBooster } from './gamingBooster.js'
import { CpuLoadTracker } from './services/CpuLoadTracker.js'

let overlayWindow = null
let metricsInterval = null

async function getRealLatency() {
  return new Promise((resolve) => {
    const start = Date.now()
    const socket = new net.Socket()
    socket.setTimeout(800)

    const finish = (ms) => {
      socket.destroy()
      resolve(ms)
    }

    socket.on('connect', () => finish(Math.min(Date.now() - start, 300)))
    socket.on('timeout', () => finish(280))
    socket.on('error', () => finish(280))

    socket.connect(53, '1.1.1.1')
  })
}

const cpuLoadTracker = new CpuLoadTracker()

export function createGamingOverlay() {
  if (overlayWindow) {
    overlayWindow.focus()
    return overlayWindow
  }

  overlayWindow = new BrowserWindow({
    width: 340,
    height: 215,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  const { width } = screen.getPrimaryDisplay().workAreaSize
  overlayWindow.setPosition(width - 360, 20)

  overlayWindow.loadURL(`data:text/html;charset=utf-8,
    <html>
      <head>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;600&amp;family=Space+Grotesk:wght@600&amp;display=swap');

          body {
            margin:0;
            padding:16px 18px;
            background: rgba(8, 10, 14, 0.94);
            color: #e2e8f0;
            font-family: 'Inter', system-ui, sans-serif;
            border-radius: 18px;
            border: 1px solid #334155;
            box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
            backdrop-filter: blur(24px);
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
            padding-bottom: 10px;
            border-bottom: 1px solid #334155;
          }
          .title {
            font-weight: 700;
            font-size: 15px;
            color: #60a5fa;
            letter-spacing: -0.4px;
          }
          .metric {
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin: 8px 0;
            font-size:14.2px;
          }
          .label {
            color: #64748b;
            font-weight: 500;
          }
          .value {
            font-family: 'Space Grotesk', 'Consolas', monospace;
            font-weight: 700;
            font-size: 16px;
            min-width: 58px;
            text-align: right;
          }
          .value.latency { color: #fbbf24; }
          .value.cpu { color: #34d399; }
          .value.ram { color: #60a5fa; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">DARKHUB GAMING</div>
        </div>

        <div class="metric">
          <span class="label">Latência</span>
          <span class="value latency" id="latency">-- ms</span>
        </div>
        <div class="metric">
          <span class="label">CPU</span>
          <span class="value cpu" id="cpu">--%</span>
        </div>
        <div class="metric">
          <span class="label">RAM</span>
          <span class="value ram" id="ram">--%</span>
        </div>
      </body>
    </html>
  `)

  gamingBooster.start()

  metricsInterval = setInterval(async () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return

    try {
      const latency = await getRealLatency()
      const totalRam = os.totalmem()
      const freeRam = os.freemem()
      const cpuLoad = cpuLoadTracker.sample()

      const metrics = {
        latency,

        cpu: cpuLoad,
        ram: Math.round(((totalRam - freeRam) / totalRam) * 100)
      }

      overlayWindow.webContents.executeJavaScript(`
        document.getElementById('latency').innerText = '${metrics.latency} ms';
        document.getElementById('cpu').innerText = '${metrics.cpu === null ? '--' : metrics.cpu + '%'}';
        document.getElementById('ram').innerText = '${metrics.ram}%';
      `).catch(() => {})
    } catch (err) {}
  }, 4000)

  overlayWindow.on('closed', () => {
    gamingBooster.stop()
    if (metricsInterval) clearInterval(metricsInterval)
    overlayWindow = null
    metricsInterval = null
  })

  return overlayWindow
}

export function toggleGamingOverlay() {
  if (overlayWindow) {
    overlayWindow.close()
  } else {
    createGamingOverlay()
  }
}
