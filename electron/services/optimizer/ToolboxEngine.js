import { spawn } from 'node:child_process';
import path from 'node:path';
import electron from 'electron';
import fs from 'node:fs';

const app = electron?.app || (electron && typeof electron === 'object' && 'app' in electron ? electron.app : null);

class ToolboxEngine {
  async openAntivirus() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      const mrtPath = path.join(process.env.windir || 'C:\\Windows', 'System32', 'mrt.exe');
      const p = spawn('cmd', ['/c', mrtPath], { windowsHide: false, detached: true });
      p.unref();
      return { ok: true, msg: 'Malicious Software Removal Tool (MRT) executado' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async openSpaceSniffer() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      const isPackaged = Boolean(app?.isPackaged);

      const assetsDir = isPackaged
        ? path.join(process.resourcesPath, 'assets')
        : path.join(__dirname, '..', '..', '..', 'assets');

      const executablePath = path.join(assetsDir, 'SpaceSniffer.exe');

      if (!fs.existsSync(executablePath)) {
        return { ok: false, error: 'SpaceSniffer.exe não encontrado na pasta assets.' };
      }

      const p = spawn('cmd', ['/c', `""${executablePath}""`], { windowsHide: false, detached: true });
      p.unref();
      return { ok: true, msg: 'SpaceSniffer lançado para analise de disco' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async openTaskManager() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    try {
      const p = spawn('taskmgr', [], { windowsHide: false, detached: true });
      p.unref();
      return { ok: true, msg: 'Gerenciador de Tarefas Aberto' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

export default new ToolboxEngine();
