import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import electron from 'electron';
import ElevationHelper from './ElevationHelper.js';
import Logger from '../../services/LoggerService.js';
import { runPowerShell as runPowerShellShared } from '../PowerShellRunner.js';

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
      // ==========================================
      // 1. CUSTOMIZAÇÃO: TASKBAR & INICIAR (DarkHub Suite Pro)
      // ==========================================
      {
        id: 'tweak:taskbarAlignLeft',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Alinhar Barra de Tarefas à Esquerda',
        description: 'Alinha os ícones e o botão Iniciar à esquerda (estilo Windows 10 clássico) em vez do centro.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'TaskbarAl', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'TaskbarAl', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:taskbarEndTask',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Habilitar "Finalizar Tarefa" na Barra de Tarefas',
        description: 'Adiciona a opção de finalizar qualquer aplicativo travado diretamente com o botão direito no ícone da barra de tarefas.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\TaskbarDeveloperSettings', name: 'TaskbarEndTask', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\TaskbarDeveloperSettings', name: 'TaskbarEndTask', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\TaskbarDeveloperSettings', name: 'TaskbarEndTask', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\TaskbarDeveloperSettings', name: 'TaskbarEndTask', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:hideSearchBox',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Ocultar Caixa de Pesquisa da Barra de Tarefas',
        description: 'Oculta a barra de pesquisa volumosa liberando espaço na barra de tarefas (a pesquisa continua funcionando abrindo o menu Iniciar).',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', name: 'SearchboxTaskbarMode', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', name: 'SearchboxTaskbarMode', type: 'REG_DWORD', data: '2' }
        ]
      },
      {
        id: 'tweak:hideTaskViewButton',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Ocultar Botão Visão de Tarefas (Task View)',
        description: 'Remove o botão Visão de Tarefas da barra de tarefas para uma interface mais limpa.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowTaskViewButton', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowTaskViewButton', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:hideCopilotButton',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Ocultar Botão do Copilot na Barra de Tarefas',
        description: 'Remove o botão do Copilot da barra de tarefas do Windows 11.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowCopilotButton', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowCopilotButton', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:showSecondsInClock',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Exibir Segundos no Relógio da Barra de Tarefas',
        description: 'Mostra os segundos em tempo real no relógio da bandeja do sistema (HH:MM:SS).',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowSecondsInSystemClock', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowSecondsInSystemClock', type: 'REG_DWORD', data: '0' }
        ]
      },

      // ==========================================
      // 2. CUSTOMIZAÇÃO: EXPLORADOR DE ARQUIVOS (DarkHub Suite Pro)
      // ==========================================
      {
        id: 'tweak:classicContextMenu',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Menu de Contexto Clássico (Windows 10)',
        description: 'Restaura o menu de clique direito completo do Windows 10 no Windows 11 sem a opção "Mostrar mais opções".',
        changes: [
          { key: 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32', name: '', type: 'REG_SZ', data: '' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32', deleteKey: true }
        ]
      },
      {
        id: 'tweak:explorerOpenThisPC',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Abrir Explorador no "Este Computador"',
        description: 'Faz o Explorador de Arquivos abrir diretamente no "Este Computador" (discos) em vez do Acesso Rápido / Home.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'LaunchTo', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'LaunchTo', type: 'REG_DWORD', data: '2' }
        ]
      },
      {
        id: 'tweak:showFileExtensions',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Exibir Extensões de Arquivos Conhecidos',
        description: 'Exibe extensões de arquivos (.exe, .txt, .zip, .png) para maior clareza e proteção contra malwares disfarçados.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'HideFileExt', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'HideFileExt', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:showHiddenFiles',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Exibir Arquivos e Pastas Ocultos',
        description: 'Torna pastas como AppData e arquivos ocultos do sistema visíveis no Explorador de Arquivos.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'Hidden', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowSuperHidden', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'Hidden', type: 'REG_DWORD', data: '2' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'ShowSuperHidden', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:explorerCompactMode',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Modo de Exibição Compacto no Explorador',
        description: 'Reduz o espaçamento excessivo entre pastas e arquivos no Explorador do Windows 11.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'UseCompactMode', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'UseCompactMode', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:addCopyMoveToContextMenu',
        category: 'customization',
        risk: 'low',
        requiresAdmin: true,
        title: 'Adicionar "Copiar Para" e "Mover Para" no Menu de Contexto',
        description: 'Permite copiar ou mover qualquer arquivo selecionado para uma pasta de destino com 1 clique.',
        changes: [
          { key: 'HKCR\\AllFilesystemObjects\\shellex\\ContextMenuHandlers\\Copy To', name: '', type: 'REG_SZ', data: '{C2FBB630-2971-11D1-A18C-00C04FD75D13}' },
          { key: 'HKCR\\AllFilesystemObjects\\shellex\\ContextMenuHandlers\\Move To', name: '', type: 'REG_SZ', data: '{C2FBB631-2971-11D1-A18C-00C04FD75D13}' }
        ],
        revertChanges: [
          { key: 'HKCR\\AllFilesystemObjects\\shellex\\ContextMenuHandlers\\Copy To', deleteKey: true },
          { key: 'HKCR\\AllFilesystemObjects\\shellex\\ContextMenuHandlers\\Move To', deleteKey: true }
        ]
      },

      // ==========================================
      // 3. CUSTOMIZAÇÃO: ÁREA DE TRABALHO & TEMA (DarkHub Suite Pro)
      // ==========================================
      {
        id: 'tweak:desktopIcons',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Exibir Ícones Essenciais na Área de Trabalho',
        description: 'Coloca os ícones do "Este Computador", "Painel de Controle", "Pasta do Usuário" e "Rede" na Área de Trabalho.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', name: '{20D04FE0-3AEA-1069-A2D8-08002B30309D}', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', name: '{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', name: '{59031a47-3f72-44a7-89c5-5595fe6b30ee}', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', name: '{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', name: '{20D04FE0-3AEA-1069-A2D8-08002B30309D}', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', name: '{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', name: '{59031a47-3f72-44a7-89c5-5595fe6b30ee}', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', name: '{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:darkModeAndColors',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Modo Escuro Completo no Sistema e Aplicativos',
        description: 'Aplica o tema escuro completo no Windows, janelas e aplicativos modernos.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'SystemUsesLightTheme', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'AppsUseLightTheme', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'EnableTransparency', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'SystemUsesLightTheme', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', name: 'AppsUseLightTheme', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:disableAeroShake',
        category: 'customization',
        risk: 'low',
        requiresAdmin: false,
        title: 'Desativar Aero Shake (Chacoalhar Janelas)',
        description: 'Impede que outras janelas sejam minimizadas acidentalmente ao mover ou chacoalhar uma janela ativa.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'DisallowShaking', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', name: 'DisallowShaking', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableLockscreenBlur',
        category: 'customization',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Desfoque na Tela de Bloqueio',
        description: 'Acelera a transição de login do Windows removendo o efeito de blur acrílico pesado.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'DisableAcrylicBackgroundOnLogon', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'DisableAcrylicBackgroundOnLogon', type: 'REG_DWORD', data: '0' }
        ]
      },

      // ==========================================
      // 4. PRIVACIDADE, IA & ANTI-TELEMETRIA (DarkHub Suite Pro)
      // ==========================================
      {
        id: 'tweak:disableTelemetry',
        category: 'privacy',
        risk: 'medium',
        requiresAdmin: true,
        title: 'Desativar Telemetria da Microsoft e Diagnósticos',
        description: 'Bloqueia a coleta e envio de dados de uso do sistema via políticas do Windows.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', name: 'AllowTelemetry', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', name: 'MaxTelemetryAllowed', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', name: 'AllowTelemetry', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows', name: 'CEIPEnable', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', name: 'AllowTelemetry', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', name: 'MaxTelemetryAllowed', type: 'REG_DWORD', data: '3' },
          { key: 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', name: 'AllowTelemetry', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows', name: 'CEIPEnable', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:disableAiAndAds',
        category: 'privacy',
        risk: 'medium',
        requiresAdmin: true,
        title: 'Desativar Windows Recall IA, Copilot e Anúncios',
        description: 'Bloqueia o Windows Recall (capturas de tela de IA), Copilot, Pesquisa Web no Iniciar e Anúncios embutidos.',
        changes: [
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsAI', name: 'DisableAIDataAnalysis', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', name: 'DisableAIDataAnalysis', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', name: 'AllowCloudSearch', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', name: 'BingSearchEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', name: 'TurnOffWindowsCopilot', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', name: 'TurnOffWindowsCopilot', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsAI', name: 'DisableAIDataAnalysis', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', name: 'DisableAIDataAnalysis', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', name: 'AllowCloudSearch', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', name: 'BingSearchEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', name: 'TurnOffWindowsCopilot', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', name: 'TurnOffWindowsCopilot', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableCortana',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Assistente Cortana',
        description: 'Desativa a assistente Cortana em políticas do sistema.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', name: 'AllowCortana', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', name: 'AllowCortana', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:disableActivityHistory',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Histórico de Atividades (Timeline)',
        description: 'Desativa o upload e a coleta do histórico de atividades e documentos recentes.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'EnableActivityFeed', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'PublishUserActivities', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'UploadUserActivities', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'EnableActivityFeed', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'PublishUserActivities', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System', name: 'UploadUserActivities', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:disableLocation',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Rastreamento de Localização',
        description: 'Desativa o serviço e permissões de geolocalização do Windows.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors', name: 'DisableLocation', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors', name: 'DisableLocation', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableDeliveryOptimization',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Otimização de Entrega P2P',
        description: 'Impede o Windows de usar sua largura de banda de upload para enviar atualizações para outros PCs na internet.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization', name: 'DODownloadMode', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization', name: 'DODownloadMode', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:disableErrorReporting',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Relatório de Erros do Windows',
        description: 'Impede o envio em segundo plano de relatórios de falhas de aplicativos para a Microsoft.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', name: 'Disabled', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', name: 'Disabled', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:blockAdsAndSuggestions',
        category: 'privacy',
        risk: 'low',
        requiresAdmin: false,
        title: 'Bloqueio de Anúncios e Sugestões do Windows',
        description: 'Bloqueia anúncios embutidos, sugestões no menu Iniciar, dicas da tela de bloqueio e rastreamento de ID de publicidade.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SystemPaneSuggestionsEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SoftLandingEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'RotatingLockScreenEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'RotatingLockScreenOverlayEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338388Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338389Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-353694Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-353696Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', name: 'Enabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', name: 'TailoredExperiencesWithDiagnosticDataEnabled', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SystemPaneSuggestionsEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SoftLandingEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'RotatingLockScreenEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'RotatingLockScreenOverlayEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338388Enabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-338389Enabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-353694Enabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', name: 'SubscribedContent-353696Enabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', name: 'Enabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', name: 'TailoredExperiencesWithDiagnosticDataEnabled', type: 'REG_DWORD', data: '1' }
        ]
      },

      // ==========================================
      // 5. PERFORMANCE, KERNEL & GAMING (DarkHub Suite Pro)
      // ==========================================
      {
        id: 'tweak:disableGameDvr',
        category: 'gaming',
        risk: 'low',
        requiresAdmin: false,
        title: 'Desativar Xbox Game DVR / Gravação em Segundo Plano',
        description: 'Elimina stutterings e quedas de FPS causadas pela gravação contínua da Game Bar.',
        changes: [
          { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', name: 'AppCaptureEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\System\\GameConfigStore', name: 'GameDVR_Enabled', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', name: 'AppCaptureEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\System\\GameConfigStore', name: 'GameDVR_Enabled', type: 'REG_DWORD', data: '1' }
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
        ],
        revertChanges: [
          { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseSpeed', type: 'REG_SZ', data: '1' },
          { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseThreshold1', type: 'REG_SZ', data: '6' },
          { key: 'HKCU\\Control Panel\\Mouse', name: 'MouseThreshold2', type: 'REG_SZ', data: '10' }
        ]
      },
      {
        id: 'tweak:disableStickyKeys',
        category: 'gaming',
        risk: 'low',
        requiresAdmin: false,
        title: 'Desativar Teclas de Aderência (Shift 5x)',
        description: 'Impede o popup irritante de Teclas de Aderência ao pressionar Shift repetidamente em jogos.',
        changes: [
          { key: 'HKCU\\Control Panel\\Accessibility\\StickyKeys', name: 'Flags', type: 'REG_SZ', data: '506' }
        ],
        revertChanges: [
          { key: 'HKCU\\Control Panel\\Accessibility\\StickyKeys', name: 'Flags', type: 'REG_SZ', data: '510' }
        ]
      },
      {
        id: 'tweak:disableVBS',
        category: 'gaming',
        risk: 'medium',
        requiresAdmin: true,
        title: 'Desativar VBS / Isolamento de Núcleo (HVCI)',
        description: 'Desativa o Virtualization-Based Security (VBS) para liberar até 15% a mais de taxa de quadros (FPS) em jogos pesados.',
        changes: [
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\DeviceGuard', name: 'EnableVirtualizationBasedSecurity', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity', name: 'Enabled', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\DeviceGuard', name: 'EnableVirtualizationBasedSecurity', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity', name: 'Enabled', type: 'REG_DWORD', data: '1' }
        ]
      },

      // ==========================================
      // 6. ARMAZENAMENTO & DISCO (DarkHub Suite Pro)
      // ==========================================
      {
        id: 'tweak:disableHibernation',
        category: 'storage',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Hibernação (Liberar Espaço no SSD)',
        description: 'Desativa o arquivo hiberfil.sys liberando gigabytes de espaço valioso no disco C:.',
        changes: [
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\Power', name: 'HibernateEnabled', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\Power', name: 'HibernateEnabled', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:preventAutoBitLocker',
        category: 'storage',
        risk: 'low',
        requiresAdmin: true,
        title: 'Impedir Criptografia Automática (BitLocker Automático)',
        description: 'Evita que o Windows bloqueie ou encripte unidades de disco e SSDs automaticamente sem consentimento explícito.',
        changes: [
          { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\BitLocker', name: 'PreventDeviceEncryption', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\BitLocker', name: 'PreventDeviceEncryption', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableFastStartup',
        category: 'system',
        risk: 'low',
        requiresAdmin: true,
        title: 'Desativar Inicialização Rápida (Fast Startup)',
        description: 'Garante desligamentos limpos do kernel do Windows evitando corrupção de drivers e falhas de reinicialização.',
        changes: [
          { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', name: 'HiberbootEnabled', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', name: 'HiberbootEnabled', type: 'REG_DWORD', data: '1' }
        ]
      },
      {
        id: 'tweak:setUtcTime',
        category: 'system',
        risk: 'low',
        requiresAdmin: true,
        title: 'Configurar Relógio para UTC (Fix Dual Boot Linux/Windows)',
        description: 'Evita descompasso de horário ao alternar entre Windows e distribuições Linux no mesmo PC.',
        changes: [
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\TimeZoneInformation', name: 'RealTimeIsUniversal', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKLM\\System\\CurrentControlSet\\Control\\TimeZoneInformation', name: 'RealTimeIsUniversal', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:disableBackgroundApps',
        category: 'system',
        risk: 'low',
        requiresAdmin: false,
        title: 'Desativar Aplicativos em Segundo Plano',
        description: 'Impede que aplicativos do Windows rodem em segundo plano consumindo CPU e memória RAM.',
        changes: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', name: 'GlobalUserDisabled', type: 'REG_DWORD', data: '1' }
        ],
        revertChanges: [
          { key: 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', name: 'GlobalUserDisabled', type: 'REG_DWORD', data: '0' }
        ]
      },
      {
        id: 'tweak:edgeOptimizations',
        category: 'system',
        risk: 'low',
        requiresAdmin: true,
        title: 'Otimização do Microsoft Edge',
        description: 'Desativa processos em segundo plano do Edge, Startup Boost e telas iniciais desnecessárias.',
        changes: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'BackgroundModeEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'StartupBoostEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'HideFirstRunExperience', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Edge', name: 'BackgroundModeEnabled', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Edge', name: 'StartupBoostEnabled', type: 'REG_DWORD', data: '0' }
        ],
        revertChanges: [
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'BackgroundModeEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'StartupBoostEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge', name: 'HideFirstRunExperience', type: 'REG_DWORD', data: '0' },
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Edge', name: 'BackgroundModeEnabled', type: 'REG_DWORD', data: '1' },
          { key: 'HKCU\\Software\\Policies\\Microsoft\\Edge', name: 'StartupBoostEnabled', type: 'REG_DWORD', data: '1' }
        ]
      }
    ];
  }

  listTweaks() {
    return this.deepTweaks;
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
    const matchLine = lines.find((l) => {
      if (!valueName) {
        return l.toLowerCase().startsWith('(default)') || l.toLowerCase().startsWith('(padrão)') || l.toLowerCase().startsWith('<sem nome>');
      }
      return l.toLowerCase().startsWith(valueName.toLowerCase() + ' ');
    });
    if (!matchLine) return null;
    const parts = matchLine.split(/\s+/g);
    if (parts.length < 3) return null;
    return { type: parts[1], data: parts.slice(2).join(' ') };
  }

  async readRegistryValue(key, name) {
    const args = !name
      ? ['query', `"${key}"`, '/ve']
      : ['query', `"${key}"`, '/v', `"${name}"`];
    const { code, stdout } = await this.runCommand('reg', args, { timeout: 8000 });
    if (code !== 0) return { existed: false };
    const parsed = this.parseRegQueryValue(stdout, name);
    if (!parsed) return { existed: false };
    return { existed: true, type: parsed.type, data: parsed.data };
  }

  // --- Check Live Status for All Tweaks in Registry ---
  async checkTweaksStatus() {
    if (process.platform !== 'win32') return { ok: true, status: {} };
    const statusMap = {};

    for (const tweak of this.deepTweaks) {
      if (!tweak.changes || tweak.changes.length === 0) {
        statusMap[tweak.id] = false;
        continue;
      }
      try {
        const firstChange = tweak.changes[0];
        const res = await this.readRegistryValue(firstChange.key, firstChange.name);
        if (res.existed && String(res.data).trim().toLowerCase() === String(firstChange.data).trim().toLowerCase()) {
          statusMap[tweak.id] = true;
        } else {
          statusMap[tweak.id] = false;
        }
      } catch {
        statusMap[tweak.id] = false;
      }
    }

    return { ok: true, status: statusMap };
  }

  // --- Apply Tweaks ---
  async applyTweaks(ids, eventSender = () => {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const selected = this.deepTweaks.filter((t) => ids.includes(t.id));
    if (selected.length === 0) return { ok: false, error: 'Nenhum tweak válido selecionado' };

    const runId = `darkHubTweaks_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    eventSender('optimizer:runEvent', { runId, type: 'run-start', total: selected.length, concurrency: 1, startedAt: Date.now() });

    let elevatedScript = '$ErrorActionPreference = "SilentlyContinue";\r\n';
    let needsElevation = false;

    for (let i = 0; i < selected.length; i++) {
      const tweak = selected[i];
      eventSender('optimizer:runEvent', { runId, type: 'op-start', opId: tweak.id, index: i, startedAt: Date.now() });

      for (const change of tweak.changes) {
        const isHkcu = change.key.toUpperCase().startsWith('HKCU');

        // Apply HKCU changes directly in current user process (instant, reliable, no UAC needed for user hive)
        if (isHkcu) {
          try {
            if (change.deleteKey) {
              await this.runCommand('reg', ['delete', `"${change.key}"`, '/f']);
            } else if (!change.name) {
              await this.runCommand('reg', ['add', `"${change.key}"`, '/ve', '/t', change.type || 'REG_SZ', '/d', `"${change.data || ''}"`, '/f']);
            } else {
              await this.runCommand('reg', ['add', `"${change.key}"`, '/v', `"${change.name}"`, '/t', change.type, '/d', `"${change.data}"`, '/f']);
            }
          } catch (err) {
            Logger.warn('DeepTweaksEngine', `Falha ao aplicar HKCU direto para ${tweak.id}`, err);
          }
        }

        // Prepare elevated script for HKLM/HKCR or administrative changes
        if (!isHkcu || tweak.requiresAdmin) {
          needsElevation = true;
          if (change.deleteKey) {
            elevatedScript += `reg delete "${change.key}" /f;\r\n`;
          } else if (!change.name) {
            elevatedScript += `reg add "${change.key}" /ve /t ${change.type || 'REG_SZ'} /d "${change.data || ''}" /f;\r\n`;
          } else {
            elevatedScript += `reg add "${change.key}" /v "${change.name}" /t ${change.type} /d "${change.data}" /f;\r\n`;
          }
        }
      }
    }

    if (needsElevation) {
      const elevRes = await this.runElevatedCommand(elevatedScript);
      if (elevRes.code !== 0) {
        Logger.warn('DeepTweaksEngine', 'Aviso: Script elevado falhou ou UAC foi cancelado', elevRes.stderr);
      }
    }

    // Restart Explorer cleanly if any customization/taskbar tweak was applied
    const hasExplorerTweaks = selected.some(t => t.category === 'customization');
    if (hasExplorerTweaks) {
      try {
        await execAsync('powershell -NoProfile -Command "Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 600; Start-Process explorer"');
      } catch (err) {
        Logger.warn('DeepTweaksEngine', 'Falha ao reiniciar explorer', err);
      }
    }

    for (let i = 0; i < selected.length; i++) {
      eventSender('optimizer:runEvent', { runId, type: 'op-finish', opId: selected[i].id, index: i, ok: true });
    }

    eventSender('optimizer:runEvent', { runId, type: 'run-finish', completed: selected.length, total: selected.length });
    return { ok: true, msg: `${selected.length} ajuste(s) aplicados com sucesso.` };
  }

  // --- Revert Tweaks to Windows Defaults ---
  async revertTweaks(ids, eventSender = () => {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const selected = this.deepTweaks.filter((t) => ids.includes(t.id));
    if (selected.length === 0) return { ok: false, error: 'Nenhum tweak válido selecionado' };

    const runId = `darkHubRevert_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    eventSender('optimizer:runEvent', { runId, type: 'run-start', total: selected.length, concurrency: 1, startedAt: Date.now() });

    let elevatedScript = '$ErrorActionPreference = "SilentlyContinue";\r\n';
    let needsElevation = false;

    for (let i = 0; i < selected.length; i++) {
      const tweak = selected[i];
      eventSender('optimizer:runEvent', { runId, type: 'op-start', opId: tweak.id, index: i, startedAt: Date.now() });

      const reverts = tweak.revertChanges || [];
      for (const change of reverts) {
        const isHkcu = change.key.toUpperCase().startsWith('HKCU');

        if (isHkcu) {
          try {
            if (change.deleteKey) {
              await this.runCommand('reg', ['delete', `"${change.key}"`, '/f']);
            } else if (!change.name) {
              await this.runCommand('reg', ['add', `"${change.key}"`, '/ve', '/t', change.type || 'REG_SZ', '/d', `"${change.data || ''}"`, '/f']);
            } else {
              await this.runCommand('reg', ['add', `"${change.key}"`, '/v', `"${change.name}"`, '/t', change.type, '/d', `"${change.data}"`, '/f']);
            }
          } catch (err) {
            Logger.warn('DeepTweaksEngine', `Falha ao reverter HKCU direto para ${tweak.id}`, err);
          }
        }

        if (!isHkcu || tweak.requiresAdmin) {
          needsElevation = true;
          if (change.deleteKey) {
            elevatedScript += `reg delete "${change.key}" /f;\r\n`;
          } else if (!change.name) {
            elevatedScript += `reg add "${change.key}" /ve /t ${change.type || 'REG_SZ'} /d "${change.data || ''}" /f;\r\n`;
          } else {
            elevatedScript += `reg add "${change.key}" /v "${change.name}" /t ${change.type} /d "${change.data}" /f;\r\n`;
          }
        }
      }
    }

    if (needsElevation) {
      const elevRes = await this.runElevatedCommand(elevatedScript);
      if (elevRes.code !== 0) {
        Logger.warn('DeepTweaksEngine', 'Aviso: Script elevado de reversão falhou ou UAC foi cancelado', elevRes.stderr);
      }
    }

    const hasExplorerTweaks = selected.some(t => t.category === 'customization');
    if (hasExplorerTweaks) {
      try {
        await execAsync('powershell -NoProfile -Command "Stop-Process -Name explorer -Force; Start-Sleep -Milliseconds 600; Start-Process explorer"');
      } catch (err) {
        Logger.warn('DeepTweaksEngine', 'Falha ao reiniciar explorer', err);
      }
    }

    for (let i = 0; i < selected.length; i++) {
      eventSender('optimizer:runEvent', { runId, type: 'op-finish', opId: selected[i].id, index: i, ok: true });
    }

    eventSender('optimizer:runEvent', { runId, type: 'run-finish', completed: selected.length, total: selected.length });
    return { ok: true, msg: `${selected.length} ajuste(s) revertidos com sucesso para o padrão do Windows.` };
  }
}

export default new DeepTweaksEngine();
