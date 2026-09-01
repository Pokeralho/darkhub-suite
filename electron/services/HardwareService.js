import { ipcMain } from 'electron';
import Logger from './LoggerService.js';
import HAL from '../hal/HardwareHAL.js';

const EMIT_INTERVAL_MS = 1000;

const IDLE_TEARDOWN_MS = 60000;
class HardwareService {
  constructor() {
    this.mainWindow = null;
    this.timer = null;

    this.activeConsumers = 0;
    this._paused = false;
    this._daemonsUp = false;
    this._idleTimer = null;
    this._handlersRegistered = false;
    this._boundWindow = null;
    this._windowListeners = null;
    this._lastSentRefs = {};
  }

  init(mainWindow) {
    this.mainWindow = mainWindow;
    this._bindWindowVisibility(mainWindow);

    if (this._handlersRegistered) {

      this._lastSentRefs = {};
      return;
    }
    this._handlersRegistered = true;
    Logger.info('HardwareService', 'Motor de telemetria ativado (daemons persistentes, zero spawn por ciclo).');

    ipcMain.handle('hardware:startPolling', () => {
      this.activeConsumers += 1;
      if (this.activeConsumers === 1) this.start();
      return { ok: true, activeConsumers: this.activeConsumers };
    });

    ipcMain.handle('hardware:stopPolling', () => {
      this.activeConsumers = Math.max(0, this.activeConsumers - 1);
      if (this.activeConsumers === 0) this.stop();
      return { ok: true, activeConsumers: this.activeConsumers };
    });
  }

  _bindWindowVisibility(win) {
    if (!win || win === this._boundWindow) return;

    if (this._boundWindow && this._windowListeners && !this._boundWindow.isDestroyed()) {
      for (const [event, handler] of this._windowListeners) {
        this._boundWindow.removeListener(event, handler);
      }
    }

    const pause = () => this._setPaused(true);
    const resume = () => this._setPaused(false);
    const listeners = [
      ['minimize', pause],
      ['hide', pause],
      ['restore', resume],
      ['show', resume]
    ];
    for (const [event, handler] of listeners) win.on(event, handler);

    this._boundWindow = win;
    this._windowListeners = listeners;
  }

  _setPaused(paused) {
    if (this._paused === paused) return;
    this._paused = paused;

    if (paused) {

      this._stopTimer();
      this._clearIdleTimer();

      this._idleTimer = setTimeout(() => {
        this._idleTimer = null;
        if (!this._paused) return;
        Logger.info('HardwareService', 'Janela oculta há um tempo — encerrando daemons de sensores.');
        this._stopDaemons();
      }, IDLE_TEARDOWN_MS);
      return;
    }

    this._clearIdleTimer();
    if (this.activeConsumers > 0) this._setup();
  }

  _clearIdleTimer() {
    if (this._idleTimer) {
      clearTimeout(this._idleTimer);
      this._idleTimer = null;
    }
  }

  emitSnapshot() {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;

    const snapshot = HAL.getSnapshot();

    const diff = {};
    let hasChanges = false;
    for (const key of Object.keys(snapshot)) {
      if (this._lastSentRefs[key] !== snapshot[key]) {
        diff[key] = snapshot[key];
        this._lastSentRefs[key] = snapshot[key];
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.mainWindow.webContents.send('hardware:update', diff);
    }
  }

  _setup() {
    if (!this._daemonsUp) {
      HAL.init();
      this._daemonsUp = true;
    }
    this._stopTimer();

    this.emitSnapshot();
    this.timer = setInterval(() => this.emitSnapshot(), EMIT_INTERVAL_MS);
  }

  _stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _stopDaemons() {
    if (!this._daemonsUp) return;
    HAL.shutdown();
    this._daemonsUp = false;
  }

  start() {
    if (this._paused) {

      return;
    }
    Logger.info('HardwareService', 'Iniciando telemetria de hardware...');
    this._setup();
  }

  stop() {
    Logger.info('HardwareService', 'Encerrando telemetria de hardware...');
    this._clearIdleTimer();
    this._stopTimer();
    this._stopDaemons();
    this._lastSentRefs = {};
  }
}

export default new HardwareService();
