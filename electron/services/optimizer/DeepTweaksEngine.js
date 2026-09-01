import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
import ElevationHelper from './ElevationHelper.js';
import Logger from '../../services/LoggerService.js';

const app = electron?.app || (electron && typeof electron === 'object' && 'app' in electron ? electron.app : null);
const execAsync = promisify(exec);

class DeepTweaksEngine {
  constructor() {
    this.deepTweaksUndoStore = new Map();
    this.undoFilePath = null;
    try {
      const userDataDir = app?.getPath ? app.getPath('userData') : (process.env.APPDATA || path.join(process.cwd(), '.data'));
      this.undoFilePath = path.join(userDataDir, 'optimizer_undo_store.json');
      this.loadUndoStore();
    } catch (e) {
      Logger.warn('DeepTweaksEngine', 'Falha ao iniciar caminho da persistência de undo', e);
    }
    this.deepTweaks = [
      {
        id: 'tweak:disableTelemetry',
        category: 'privacy',
        risk: 'medium',
        requiresAdmin: true,
        title: 'Desativar telemetria',
        description: 'Reduz coleta de dados via políticas do Windows.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', name: 'AllowTelemetry', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', name: 'MaxTelemetryAllowed', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', name: 'AllowTelemetry', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows', name: 'CEIPEnable', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppCompat', name: 'AITEnable', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableLocation',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar localização',
        description: 'Desativa políticas de rastreio de localização.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors', name: 'DisableLocation', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:disableGameDvr',
        category: 'gaming',
        risk: 'low',
        requiresAdmin: false,
        title: 'Desativar Game DVR / Game Bar',
        description: 'Reduz sobrecarga e stuttering associado à captura.',
        changes: [
          { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', name: 'AppCaptureEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\System\\GameConfigStore', name: 'GameDVR_Enabled', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableActivityHistory',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Activity History',
        description: 'Desativa feed de atividades.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'EnableActivityFeed', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'PublishUserActivities', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'UploadUserActivities', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'EnableCdp', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableAiAndAds',
        category: 'privacy',
        risk: 'medium',
        requiresAdmin: true,
        title: 'Desativar Inteligência Artificial (Recall) e Ads',
        description: 'Bloqueia o Windows Recall, Copilot IA, Pesquisa Web no Iniciar e Propagandas.',
        changes: [
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsAI', name: 'DisableAIDataAnalysis', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', name: 'DisableAIDataAnalysis', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', name: 'AllowCloudSearch', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', name: 'ConnectedSearchPrivacy', type: 'REG_DWORD', data: '3' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', name: 'BingSearchEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338389Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\UserProfileEngagement', name: 'ScoobeSystemSettingEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', name: 'DisableSettingsAgent', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:disableCortana',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Cortana',
        description: 'Desativa Cortana via políticas.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', name: 'AllowCortana', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:classicContextMenu',
        category: 'system',
        risk: 'low',
        requiresAdmin: false,
        title: 'Menu de Contexto Clássico (Windows 10)',
        description: 'Restaura o menu de clique direito completo do Windows 10 no Windows 11 sem a opção "Mostrar mais opções".',
        changes: [
          { key: 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32', name: '', type: 'REG_SZ', data: '' }
        ]
      },
      {
        id: 'tweak:taskbarTweaks',
        category: 'system',
        risk: 'low',
        requiresAdmin: false,
        title: 'Otimizações da Barra de Tarefas',
        description: 'Alinha a barra de tarefas à esquerda, oculta a caixa de pesquisa e oculta a Visão de Tarefas para máxima fluidez.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'TaskbarAl', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', name: 'SearchboxTaskbarMode', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowTaskViewButton', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'TaskbarDeveloperSettings', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:taskbarEndTask',
        category: 'system',
        risk: 'low',
        requiresAdmin: false,
        title: 'Habilitar "Finalizar Tarefa" na Barra de Tarefas',
        description: 'Adiciona a opção de finalizar qualquer aplicativo travado diretamente com o botão direito no ícone da barra de tarefas (Windows 11).',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'TaskbarDeveloperSettings', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'TaskbarDeveloperSettings', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:darkModeAndColors',
        category: 'system',
        risk: 'low',
        requiresAdmin: false,
        title: 'Modo Escuro Completo & Cores',
        description: 'Ativa o tema escuro em todo o sistema e aplicativos, com transparência e cores de destaque acentuadas.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'SystemUsesLightTheme', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'AppsUseLightTheme', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'ColorPrevalence', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'EnableTransparency', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:explorerTweaks',
        category: 'system',
        risk: 'low',
        requiresAdmin: false,
        title: 'Explorador de Arquivos Avançado',
        description: 'Abre no "Este Computador", exibe extensões de arquivos conhecidos e revela arquivos ocultos e do sistema.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'LaunchTo', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'HideFileExt', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'Hidden', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowSuperHidden', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:edgeOptimizations',
        category: 'system',
        risk: 'low',
        requiresAdmin: true,
        title: 'Otimização do Microsoft Edge',
        description: 'Desativa processos em segundo plano, desativa Startup Boost e desativa a tela de primeira execução.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\Recommended', name: 'BackgroundModeEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge\\Recommended', name: 'StartupBoostEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'HideFirstRunExperience', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:blockAdsAndSuggestions',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Bloqueio de Anúncios e Sugestões da Microsoft',
        description: 'Desativa anúncios no menu iniciar, propagandas de apps no Windows e sugestões do ContentDeliveryManager.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', name: 'DisableWindowsConsumerFeatures', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', name: 'TurnOffWindowsCopilot', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer', name: 'DisableSearchBoxSuggestions', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'ContentDeliveryAllowed', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'FeatureManagementEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'OEMPreInstalledAppsEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'PreInstalledAppsEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'PreInstalledAppsEverEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SilentInstalledAppsEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SoftLandingEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContentEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-310093Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338387Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338388Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338389Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338393Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-353694Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-353696Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-353698Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SystemPaneSuggestionsEnabled', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableMouseAcceleration',
        category: 'gaming',
        risk: 'low',
        requiresAdmin: false,
        title: 'Desativar Aceleração do Mouse (1:1 Raw Input)',
        description: 'Remove a curva de aceleração e suavização do ponteiro para garantir precisão absoluta 1:1 em jogos.',
        changes: [
          { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseSpeed', type: 'REG_SZ', data: '0' },
          { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseThreshold1', type: 'REG_SZ', data: '0' },
          { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseThreshold2', type: 'REG_SZ', data: '0' }
        ]
      },
      {
        id: 'tweak:preventAutoBitLocker',
        category: 'system',
        risk: 'low',
        requiresAdmin: true,
        title: 'Impedir Criptografia Automática (BitLocker Automático)',
        description: 'Evita que o Windows bloqueie ou encripte unidades de disco e SSDs automaticamente sem consentimento explícito.',
        changes: [
          { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\BitLocker', name: 'PreventDeviceEncryption', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:disableVBS',
        category: 'gaming',
        risk: 'medium',
        requiresAdmin: true,
        title: 'Desativar VBS / Core Isolation (Isolamento de Núcleo)',
        description: 'Desativa o Virtualization-Based Security (VBS) e HVCI para liberar até 15% a mais de FPS e reduzir latência de CPU.',
        changes: [
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\DeviceGuard', name: 'EnableVirtualizationBasedSecurity', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity', name: 'Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity', name: 'EnabledBootId', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity', name: 'WasEnabledBy', type: 'REG_DWORD', data: '0' }
        ]
      }
    ];
  }

  loadUndoStore() {
    if (this.undoFilePath && fs.existsSync(this.undoFilePath)) {
      try {
        const raw = fs.readFileSync(this.undoFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          this.deepTweaksUndoStore.set(k, v);
        }
      } catch (e) {
        Logger.warn('DeepTweaksEngine', 'Falha ao carregar undo store do disco', e);
      }
    }
  }

  saveUndoStore() {
    if (this.undoFilePath) {
      try {
        const obj = {};
        for (const [k, v] of this.deepTweaksUndoStore.entries()) {
          obj[k] = v;
        }
        fs.writeFileSync(this.undoFilePath, JSON.stringify(obj, null, 2), 'utf8');
      } catch (e) {
        Logger.warn('DeepTweaksEngine', 'Falha ao salvar undo store no disco', e);
      }
    }
  }

  async runCommand(command, args, options = {}) {
    try {
      const { stdout, stderr } = await execAsync(`"${command}" ${args.join(' ')}`, options);
      return { code: 0, stdout, stderr };
    } catch (e) {
      return { code: e.code || 1, stderr: e.message };
    }
  }

  async runElevatedCommand(script) {
    return await ElevationHelper.runElevatedPowerShell(script);
  }

  parseRegQueryValue(stdout, valueName) {
    const lines = String(stdout || '').split(/\r?\n/g).map((l) => l.trim()).filter(Boolean);
    const matchLine = lines.find((l) => l.toLowerCase().startsWith(valueName.toLowerCase() + ' '));
    if (!matchLine) return null;
    const parts = matchLine.split(/\s+/g);
    if (parts.length < 3) return null;
    return { type: parts[1], data: parts.slice(2).join(' ') };
  }

  async readRegistryValues(items) {
    if (!items || items.length === 0) return [];

    return await Promise.all(items.map(async (item) => {
      const prev = await this.readRegistryValue(item.key, item.name);
      return { key: item.key, name: item.name, existed: prev.existed, type: prev.type, data: prev.data, targetData: item.data, targetType: item.type };
    }));
  }

  async readRegistryValue(key, name) {
    const { code, stdout } = await this.runCommand('reg', ['query', `"${key}"`, '/v', `"${name}"`], { timeout: 8000 });
    if (code !== 0) return { existed: false };
    const parsed = this.parseRegQueryValue(stdout, name);
    if (!parsed) return { existed: false };
    return { existed: true, type: parsed.type, data: parsed.data };
  }

  async applyTweaks(ids, eventSender) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const selected = this.deepTweaks.filter((t) => ids.includes(t.id));
    if (selected.length === 0) return { ok: false, error: 'No valid tweakIds' };

    const runId = `winUtilTweaks_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    eventSender('optimizer:runEvent', { runId, type: 'run-start', total: selected.length, concurrency: 1, startedAt: Date.now() });

    const undoEntries = [];
    let completed = 0;

    let batchScript = '$ErrorActionPreference = "Stop";\r\n';

    try {

      const allChanges = [];
      for (const tweak of selected) {
        for (const change of tweak.changes) {
          allChanges.push(change);
        }
      }

      const queryResults = await this.readRegistryValues(allChanges);
      for (const res of queryResults) {
        undoEntries.push({ key: res.key, name: res.name, existed: res.existed, type: res.type, data: res.data });
        batchScript += `reg add "${res.key}" /v "${res.name}" /t ${res.targetType} /d "${res.targetData}" /f;\r\n`;
      }

      for (let i = 0; i < selected.length; i += 1) {
        eventSender('optimizer:runEvent', { runId, type: 'op-start', opId: selected[i].id, index: i, startedAt: Date.now() });
      }

      const elevRes = await this.runElevatedCommand(batchScript);
      if (elevRes.code !== 0) {
        throw new Error("Falha na elevação ou gravação no registro (Acesso Negado / UAC Cancelado).");
      }

      const verifyResults = await this.readRegistryValues(allChanges);
      const verifyMismatches = [];

      for (let i = 0; i < allChanges.length; i++) {
        const change = allChanges[i];
        const after = verifyResults[i];
        const matches = after.existed && String(after.data).trim() === String(change.data).trim();
        if (!matches) {
          verifyMismatches.push({ key: change.key, name: change.name, expected: change.data, actual: after.existed ? after.data : '(ausente)' });
        }
      }

      if (verifyMismatches.length > 0) {
        Logger.warn('DeepTweaksEngine', `Verificação pós-aplicação encontrou ${verifyMismatches.length} valor(es) divergente(s): ${JSON.stringify(verifyMismatches)}`);
      }
      Logger.auditOptimizer({
        type: 'verification',
        runId,
        ok: verifyMismatches.length === 0,
        mismatches: verifyMismatches
      });

      for (let i = 0; i < selected.length; i += 1) {
        completed += 1;
        const tweakChangeKeys = new Set(selected[i].changes.map(c => `${c.key}:${c.name}`));
        const tweakMismatches = verifyMismatches.filter((m) => tweakChangeKeys.has(`${m.key}:${m.name}`));
        eventSender('optimizer:runEvent', {
          runId, type: 'op-finish', opId: selected[i].id, index: i,
          ok: tweakMismatches.length === 0, completed, total: selected.length, finishedAt: Date.now(),
          verified: tweakMismatches.length === 0,
          verificationDetails: tweakMismatches.length > 0 ? tweakMismatches : undefined
        });
      }

      const undoToken = `${runId}_undo`;
      this.deepTweaksUndoStore.set(undoToken, undoEntries);
      this.saveUndoStore();

      eventSender('optimizer:runEvent', { runId, type: 'run-finish', total: selected.length, completed, finishedAt: Date.now() });

      if (verifyMismatches.length > 0) {
        return {
          ok: true,
          msg: `Advanced WinUtil Tweaks Applied (com ${verifyMismatches.length} divergência(s) detectada(s) na verificação pós-aplicação)`,
          undoToken,
          runId,
          verified: false,
          verifyMismatches
        };
      }
      return { ok: true, msg: 'Advanced WinUtil Tweaks Applied', undoToken, runId, verified: true };
    } catch (err) {
      eventSender('optimizer:runEvent', { runId, type: 'run-finish', total: selected.length, completed, ok: false, error: err.message, finishedAt: Date.now() });
      return { ok: false, error: err.message, runId };
    }
  }

  async undoTweaks(undoToken) {
    const entries = this.deepTweaksUndoStore.get(undoToken);
    if (!entries) return { ok: false, error: 'Undo token inválido ou expirado' };

    let batchScript = '$ErrorActionPreference = "Continue";\r\n';
    try {
      for (const entry of entries) {
        if (!entry.existed) {
          batchScript += `reg delete "${entry.key}" /v "${entry.name}" /f;\r\n`;
        } else {
          batchScript += `reg add "${entry.key}" /v "${entry.name}" /t ${entry.type} /d "${entry.data}" /f;\r\n`;
        }
      }
      const elevRes = await this.runElevatedCommand(batchScript);
      if (elevRes.code !== 0) {
        throw new Error("Falha na elevação ou reversão no registro (Acesso Negado / UAC Cancelado).");
      }
      this.deepTweaksUndoStore.delete(undoToken);
      this.saveUndoStore();
      return { ok: true, msg: 'Deep Tweaks revertidos' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  listTweaks() {
    return this.deepTweaks;
  }
}

export default new DeepTweaksEngine();
