

import { BrowserWindow, screen, globalShortcut, ipcMain } from 'electron'
import FramePacerEngine from './FramePacerEngine.js'
import Logger from './LoggerService.js'

let overlayWindow = null
let clickThrough = false
let overlayConfig = {
  scale: 1,
  showGraph: true,
  showLows: true,
  opacity: 0.94,
  position: 'top-right'
}

export function createFramePacerOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show()
    overlayWindow.focus()
    return overlayWindow
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  overlayWindow = new BrowserWindow({
    width: 320,
    height: 180,
    x: width - 340,
    y: 30,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: false,
      sandbox: false
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 10000);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (globalThis._darkhub_topmost_timer) {
    clearInterval(globalThis._darkhub_topmost_timer);
  }
  globalThis._darkhub_topmost_timer = setInterval(() => {
    if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
      overlayWindow.moveTop();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver', 10000);
    }
  }, 350);

  if (clickThrough) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; user-select: none; margin: 0; padding: 0; }
    body {
      background: rgba(6, 9, 15, ${overlayConfig.opacity});
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      border: 1px solid rgba(56, 189, 248, 0.25);
      border-radius: 12px;
      padding: 10px 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(16px);
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      -webkit-app-region: drag;
      cursor: grab;
      padding-bottom: 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    .title {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.8px;
      color: #38bdf8;
      text-transform: uppercase;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .dot {
      width: 6px;
      height: 6px;
      background: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 8px #22c55e;
    }
    .game-name {
      font-size: 10px;
      color: #94a3b8;
      font-family: monospace;
      max-width: 130px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .stats-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin: 4px 0;
    }
    .fps-main {
      font-family: 'Consolas', monospace;
      font-size: 22px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1;
    }
    .fps-unit {
      font-size: 10px;
      color: #64748b;
      margin-left: 2px;
      font-weight: 600;
    }
    .badges {
      display: flex;
      gap: 6px;
    }
    .badge {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .badge-label {
      font-size: 8px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 700;
    }
    .badge-val {
      font-family: 'Consolas', monospace;
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
    }
    .badge-val.low1 { color: #f59e0b; }
    .badge-val.jitter { color: #a855f7; }

    /* Canvas Frametime Graph */
    .graph-container {
      width: 100%;
      height: 65px;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      position: relative;
      overflow: hidden;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    .target-line {
      position: absolute;
      left: 0;
      right: 0;
      border-top: 1px dashed rgba(56, 189, 248, 0.4);
      pointer-events: none;
    }
    .ft-legend {
      position: absolute;
      right: 4px;
      top: 2px;
      font-size: 8px;
      font-family: monospace;
      color: #64748b;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <span class="dot"></span> FRAMEPACER
    </div>
    <div class="game-name" id="activeGame">Global Pacing</div>
  </div>

  <div class="stats-row">
    <div>
      <span class="fps-main" id="fps">--</span><span class="fps-unit">FPS</span>
    </div>
    <div class="badges">
      <div class="badge">
        <span class="badge-label">Frametime</span>
        <span class="badge-val" id="ft">-- ms</span>
      </div>
      <div class="badge">
        <span class="badge-label">1% Low</span>
        <span class="badge-val low1" id="low1">--</span>
      </div>
      <div class="badge">
        <span class="badge-label">Jitter</span>
        <span class="badge-val jitter" id="jitter">±0.0ms</span>
      </div>
    </div>
  </div>

  <div class="graph-container">
    <canvas id="graphCanvas" width="296" height="65"></canvas>
    <div class="ft-legend" id="legend">Target: --ms</div>
  </div>

  <script>
    const canvas = document.getElementById('graphCanvas');
    const ctx = canvas.getContext('2d');
    const fpsEl = document.getElementById('fps');
    const ftEl = document.getElementById('ft');
    const low1El = document.getElementById('low1');
    const jitterEl = document.getElementById('jitter');
    const gameEl = document.getElementById('activeGame');
    const legendEl = document.getElementById('legend');

    let history = [];
    let targetFps = 144;
    let maxScaleMs = 33.3; // Escala máxima do gráfico (33.3ms = 30 FPS)

    window.updateData = function(data) {
      if (!data) return;
      fpsEl.textContent = data.currentFps || '--';
      ftEl.textContent = (data.currentFrametimeMs || 0) + ' ms';
      low1El.textContent = data.low1Percent ? Math.round(data.low1Percent) : '--';
      jitterEl.textContent = '±' + (data.frametimeJitterMs || 0) + 'ms';
      if (data.activeGame) gameEl.textContent = data.activeGame;

      targetFps = data.targetFps || 144;
      const targetFt = data.targetFrametimeMs || (targetFps > 0 ? (1000 / targetFps).toFixed(1) : '16.6');
      legendEl.textContent = 'Alvo: ' + targetFt + 'ms';

      if (data.history && Array.isArray(data.history)) {
        history = data.history;
      }
      drawGraph();
    };

    function drawGraph() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (history.length < 2) return;

      // Grade horizontal de referência (16.6ms / 60fps e 8.3ms / 120fps)
      const targetFt = targetFps > 0 ? 1000 / targetFps : 16.66;
      maxScaleMs = Math.max(25, targetFt * 2.2);

      // Linha guia do alvo
      const targetY = h - (targetFt / maxScaleMs) * h;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, targetY);
      ctx.lineTo(w, targetY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Desenha a linha de Frametime
      const step = w / (history.length - 1);
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const ft = history[i];
        const x = i * step;
        const y = Math.max(2, Math.min(h - 2, h - (ft / maxScaleMs) * h));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      // Gradiente de preenchimento
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.4)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // Destaque para stutters / picos
      for (let i = 0; i < history.length; i++) {
        const ft = history[i];
        if (ft > targetFt * 1.4) {
          const x = i * step;
          const y = Math.max(2, Math.min(h - 2, h - (ft / maxScaleMs) * h));
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(x, y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  </script>
</body>
</html>`

  overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

  if (!FramePacerEngine.isRunning) {
    FramePacerEngine.start()
  }

  const metricsHandler = (metrics) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) return
    overlayWindow.webContents.executeJavaScript(`
      if (window.updateData) window.updateData(${JSON.stringify(metrics)});
    `).catch(() => {})
  }

  FramePacerEngine.on('metrics', metricsHandler)

  overlayWindow.on('closed', () => {
    if (globalThis._darkhub_topmost_timer) {
      clearInterval(globalThis._darkhub_topmost_timer);
      globalThis._darkhub_topmost_timer = null;
    }
    FramePacerEngine.off('metrics', metricsHandler);
    overlayWindow = null;
  });

  return overlayWindow
}

export function closeFramePacerOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.close()
    overlayWindow = null
  }
}

export function toggleFramePacerOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (overlayWindow.isVisible()) {
      overlayWindow.hide()
    } else {
      overlayWindow.show()
    }
    return { ok: true, isVisible: overlayWindow.isVisible() }
  } else {
    createFramePacerOverlay()
    return { ok: true, isVisible: true }
  }
}

export function setOverlayClickThrough(enabled) {
  clickThrough = Boolean(enabled)
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true })
  }
  return { ok: true, clickThrough }
}

export function setOverlayConfig(config = {}) {
  overlayConfig = { ...overlayConfig, ...config }
  return { ok: true, overlayConfig }
}

export function getOverlayStatus() {
  return {
    isOpen: overlayWindow !== null && !overlayWindow.isDestroyed() && overlayWindow.isVisible(),
    clickThrough,
    config: overlayConfig
  }
}
