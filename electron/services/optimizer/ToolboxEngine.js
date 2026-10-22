import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Starts a detached GUI program and waits for the OS to confirm that the process really started
 * (spawn 'error' event, e.g. ENOENT) instead of reporting success blindly.
 */
function launch(command, args = []) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    try {
      const child = spawn(command, args, { windowsHide: false, detached: true, stdio: 'ignore' });
      child.once('error', (err) => done({ ok: false, error: err.message }));
      child.once('spawn', () => { child.unref(); done({ ok: true }); });
      setTimeout(() => done({ ok: true }), 1500); // old Node without the 'spawn' event
    } catch (err) {
      done({ ok: false, error: err.message });
    }
  });
}

class ToolboxEngine {
  /**
   * The Malicious Software Removal Tool (mrt.exe) is a small on-demand scanner for specific, widespread malware families.
   * It is NOT a full antivirus. It needs administrator rights, so Windows shows the UAC prompt itself.
   */
  async openAntivirus() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const mrtPath = path.join(process.env.windir || 'C:\\Windows', 'System32', 'mrt.exe');
    if (!fs.existsSync(mrtPath)) return { ok: false, error: 'mrt.exe não existe nesta versão do Windows (foi removido em versões recentes). Use a Segurança do Windows para escanear.' };
    const res = await launch(mrtPath);
    if (!res.ok) return { ok: false, error: `Não foi possível abrir o MRT: ${res.error}` };
    return { ok: true, msg: 'Ferramenta de Remoção de Software Mal-Intencionado (MRT) aberta. Ela procura apenas famílias específicas de malware e NÃO substitui um antivírus.' };
  }

  async openTaskManager() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const res = await launch('taskmgr.exe');
    if (!res.ok) return { ok: false, error: `Não foi possível abrir o Gerenciador de Tarefas: ${res.error}` };
    return { ok: true, msg: 'Gerenciador de Tarefas aberto.' };
  }
}

export default new ToolboxEngine();
