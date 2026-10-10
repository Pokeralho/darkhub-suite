import DeepTweaksEngine from './DeepTweaksEngine.js';

const GROUP_ID = 'group:visualEffects';

class VisualsEngine {
  /**
   * "Best performance" visual effects for the CURRENT USER only (HKCU - no administrator, no UAC).
   * The previous version also rewrote HKLM "VisualEffects\*\DefaultValue" metadata (changing the defaults of
   * every user in the opposite direction) and restarted Explorer from an elevated shell (leaving the desktop
   * shell running as administrator); both were removed. Original values are snapshotted and restored on revert.
   */
  async disableVisualEffects() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const res = await DeepTweaksEngine.applyTweaks([GROUP_ID]);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, msg: 'Efeitos visuais ajustados para desempenho (verificado no registro). O Explorer foi reiniciado; algumas animações só mudam completamente após sair e entrar na sessão do Windows.' };
  }

  async revertVisualEffects() {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows supported' };
    const res = await DeepTweaksEngine.revertTweaks([GROUP_ID]);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, msg: 'Efeitos visuais restaurados para os valores que você tinha antes (ou padrão do Windows se não havia snapshot).' };
  }
}

export default new VisualsEngine();
