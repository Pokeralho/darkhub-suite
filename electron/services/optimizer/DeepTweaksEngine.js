import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ElevationHelper from './ElevationHelper.js';
import Logger from '../../services/LoggerService.js';
import { runPowerShell } from '../PowerShellRunner.js';
import {
  buildRegistryReadScript,
  buildRegistryScript,
  fallbackRevertOp,
  isUserHiveKey,
  parseDhResults,
  parseDhCommandResults,
  buildCommandBlock,
  parseRegistryReadOutput,
  pickRecommendedTweaks,
  regEntryId,
  regValueMatches,
  snapshotEntryToOps,
  validateChange,
  canonicalRegValue
} from './OptimizerUtils.js';

// loaded lazily so the module also works outside Electron (unit tests, tooling)
let electron = null;
try { electron = createRequire(import.meta.url)('electron'); } catch { electron = null; }

const app = electron?.app || (electron && typeof electron === 'object' && 'app' in electron ? electron.app : null);

// ------------------------------------------------------------------------------------------------
// Tweak definition helpers
// rows: [key, name, type, valueToApply, valueOnFallbackRevert | null (= delete the value)]
// ------------------------------------------------------------------------------------------------
const DW = 'REG_DWORD';
const SZ = 'REG_SZ';
const ADV = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced';
const CDM = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager';
const POL_SYS = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\System';
const POL_SEARCH = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search';
const POL_EDGE_M = 'HKLM\\SOFTWARE\\Policies\\Microsoft\\Edge';
const POL_EDGE_U = 'HKCU\\Software\\Policies\\Microsoft\\Edge';
const MMCSS = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile';

function defineTweak(def) {
  const rows = def.rows || [];
  const out = { ...def };
  out.changes = rows.map(([key, name, type, data]) => ({ key, name, type, data: String(data) }));
  out.revertChanges = def.revertChanges || rows.map(([key, name, type, , dflt]) => (
    dflt === null || dflt === undefined ? { key, name, deleteValue: true } : { key, name, type, data: String(dflt) }
  ));
  delete out.rows;
  out.requiresAdmin = def.requiresAdmin ?? out.changes.some((c) => !isUserHiveKey(c.key)) ?? false;
  out.risk = def.risk || 'low';
  out.recommended = def.recommended === true;
  return out;
}

function buildPublicTweaks() {
  return [
    // ===================================== CUSTOMIZACAO: BARRA DE TAREFAS / INICIAR
    defineTweak({
      id: 'tweak:taskbarAlignLeft', category: 'customization', explorerRestart: true,
      title: 'Alinhar Barra de Tarefas à Esquerda',
      description: 'Alinha os ícones e o botão Iniciar à esquerda (estilo Windows 10). Só tem efeito no Windows 11.',
      rows: [[ADV, 'TaskbarAl', DW, 0, 1]]
    }),
    defineTweak({
      id: 'tweak:taskbarEndTask', category: 'customization', explorerRestart: true,
      title: 'Habilitar "Finalizar Tarefa" na Barra de Tarefas',
      description: 'Adiciona "Finalizar tarefa" ao clique direito nos ícones da barra de tarefas. Requer Windows 11 23H2 ou mais novo.',
      rows: [[`${ADV}\\TaskbarDeveloperSettings`, 'TaskbarEndTask', DW, 1, 0]]
    }),
    defineTweak({
      id: 'tweak:hideSearchBox', category: 'customization', explorerRestart: true,
      title: 'Ocultar Caixa de Pesquisa da Barra de Tarefas',
      description: 'Oculta a caixa de pesquisa da barra de tarefas (a pesquisa continua funcionando pelo menu Iniciar).',
      rows: [['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'SearchboxTaskbarMode', DW, 0, 2]]
    }),
    defineTweak({
      id: 'tweak:hideTaskViewButton', category: 'customization', explorerRestart: true,
      title: 'Ocultar Botão Visão de Tarefas (Task View)',
      description: 'Remove o botão Visão de Tarefas da barra de tarefas.',
      rows: [[ADV, 'ShowTaskViewButton', DW, 0, 1]]
    }),
    defineTweak({
      id: 'tweak:hideCopilotButton', category: 'customization', explorerRestart: true,
      title: 'Ocultar Botão do Copilot na Barra de Tarefas',
      description: 'Remove o botão do Copilot da barra de tarefas (Windows 11; em builds recentes o botão pode já não existir).',
      rows: [[ADV, 'ShowCopilotButton', DW, 0, 1]]
    }),
    defineTweak({
      id: 'tweak:showSecondsInClock', category: 'customization', explorerRestart: true,
      title: 'Exibir Segundos no Relógio da Barra de Tarefas',
      description: 'Mostra os segundos no relógio da bandeja do sistema (HH:MM:SS). Aumenta levemente o uso de CPU do Explorer.',
      rows: [[ADV, 'ShowSecondsInSystemClock', DW, 1, 0]]
    }),

    // ===================================== CUSTOMIZACAO: EXPLORADOR
    defineTweak({
      id: 'tweak:classicContextMenu', category: 'customization', explorerRestart: true,
      title: 'Menu de Contexto Clássico (estilo Windows 10)',
      description: 'Restaura o menu de clique direito completo no Windows 11, sem a opção "Mostrar mais opções".',
      rows: [['HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32', '', SZ, '', null]],
      revertChanges: [{ key: 'HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}', deleteKey: true }]
    }),
    defineTweak({
      id: 'tweak:explorerOpenThisPC', category: 'customization',
      title: 'Abrir Explorador no "Este Computador"',
      description: 'Faz o Explorador de Arquivos abrir em "Este Computador" (discos) em vez de Acesso Rápido / Início.',
      rows: [[ADV, 'LaunchTo', DW, 1, null]]
    }),
    defineTweak({
      id: 'tweak:showFileExtensions', category: 'customization', recommended: true,
      title: 'Exibir Extensões de Arquivos Conhecidos',
      description: 'Exibe as extensões (.exe, .txt, .zip...) - ajuda a identificar arquivos disfarçados. Vale para janelas novas do Explorer.',
      rows: [[ADV, 'HideFileExt', DW, 0, 1]]
    }),
    defineTweak({
      id: 'tweak:showHiddenFiles', category: 'customization',
      title: 'Exibir Arquivos Ocultos e Protegidos do Sistema',
      description: 'Mostra pastas ocultas (AppData) E arquivos protegidos do sistema (pagefile.sys etc.). Cuidado ao apagar o que aparecer.',
      rows: [[ADV, 'Hidden', DW, 1, 2], [ADV, 'ShowSuperHidden', DW, 1, 0]]
    }),
    defineTweak({
      id: 'tweak:explorerCompactMode', category: 'customization',
      title: 'Modo de Exibição Compacto no Explorador',
      description: 'Reduz o espaçamento entre itens no Explorador de Arquivos do Windows 11.',
      rows: [[ADV, 'UseCompactMode', DW, 1, 0]]
    }),
    defineTweak({
      id: 'tweak:addCopyMoveToContextMenu', category: 'customization', requiresAdmin: true,
      title: 'Adicionar "Copiar Para" e "Mover Para" no Menu de Contexto',
      description: 'Adiciona "Copiar para pasta..." e "Mover para pasta..." ao clique direito de arquivos e pastas.',
      rows: [
        ['HKCR\\AllFilesystemObjects\\shellex\\ContextMenuHandlers\\Copy To', '', SZ, '{C2FBB630-2971-11D1-A18C-00C04FD75D13}', null],
        ['HKCR\\AllFilesystemObjects\\shellex\\ContextMenuHandlers\\Move To', '', SZ, '{C2FBB631-2971-11D1-A18C-00C04FD75D13}', null]
      ],
      revertChanges: [
        { key: 'HKCR\\AllFilesystemObjects\\shellex\\ContextMenuHandlers\\Copy To', deleteKey: true },
        { key: 'HKCR\\AllFilesystemObjects\\shellex\\ContextMenuHandlers\\Move To', deleteKey: true }
      ]
    }),

    // ===================================== CUSTOMIZACAO: AREA DE TRABALHO / TEMA
    defineTweak({
      id: 'tweak:desktopIcons', category: 'customization', explorerRestart: true,
      title: 'Exibir Ícones Essenciais na Área de Trabalho',
      description: 'Mostra "Este Computador", "Painel de Controle", "Pasta do Usuário" e "Rede" na Área de Trabalho.',
      rows: ['{20D04FE0-3AEA-1069-A2D8-08002B30309D}', '{5399E694-6CE5-4D6C-8FCE-1D8870FDCBA0}', '{59031a47-3f72-44a7-89c5-5595fe6b30ee}', '{F02C1A0D-BE21-4350-88B0-7367FC96EF3C}']
        .map((g) => ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\HideDesktopIcons\\NewStartPanel', g, DW, 0, 1])
    }),
    defineTweak({
      id: 'tweak:darkModeAndColors', category: 'customization',
      title: 'Modo Escuro Completo no Sistema e Aplicativos',
      description: 'Aplica o tema escuro no Windows e nos aplicativos (preferência visual; não melhora desempenho).',
      rows: [
        ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'SystemUsesLightTheme', DW, 0, 1],
        ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'AppsUseLightTheme', DW, 0, 1],
        ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', DW, 1, 1]
      ]
    }),
    defineTweak({
      id: 'tweak:disableAeroShake', category: 'customization',
      title: 'Desativar Aero Shake (Chacoalhar Janelas)',
      description: 'Evita minimizar as outras janelas ao chacoalhar uma janela. Pode exigir sair e entrar na sessão.',
      rows: [[ADV, 'DisallowShaking', DW, 1, 0]]
    }),
    defineTweak({
      id: 'tweak:disableLockscreenBlur', category: 'customization', requiresAdmin: true,
      title: 'Desativar Desfoque na Tela de Login',
      description: 'Remove o desfoque acrílico do fundo da tela de login. É um ajuste visual; o ganho de desempenho é desprezível.',
      rows: [[POL_SYS, 'DisableAcrylicBackgroundOnLogon', DW, 1, null]]
    }),

    // ===================================== PRIVACIDADE
    defineTweak({
      id: 'tweak:disableTelemetry', category: 'privacy', risk: 'medium', requiresAdmin: true,
      title: 'Reduzir Telemetria da Microsoft ao Mínimo',
      description: 'Define a política de coleta para o menor nível permitido e desativa o programa CEIP. Em Windows Home/Pro o nível mínimo é "Obrigatório" (só Enterprise/Education chegam a "Desativado"). O serviço DiagTrack continua existindo.',
      rows: [
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', DW, 0, null],
        ['HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\DataCollection', 'AllowTelemetry', DW, 0, null],
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\SQMClient\\Windows', 'CEIPEnable', DW, 0, null]
      ]
    }),
    defineTweak({
      id: 'tweak:disableAiAndAds', category: 'privacy', risk: 'medium', requiresAdmin: true,
      title: 'Desativar Recall (IA), Copilot e Sugestões Web na Pesquisa',
      description: 'Políticas contra a análise de dados de IA/Recall, o Copilot legado e as sugestões do Bing na pesquisa do Iniciar. Alguns itens só existem em builds específicos do Windows 11.',
      rows: [
        ['HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', DW, 1, null],
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', DW, 1, null],
        [POL_SEARCH, 'AllowCloudSearch', DW, 0, null],
        ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'BingSearchEnabled', DW, 0, 1],
        ['HKCU\\Software\\Policies\\Microsoft\\Windows\\Explorer', 'DisableSearchBoxSuggestions', DW, 1, null],
        ['HKCU\\Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', DW, 1, null],
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', DW, 1, null]
      ]
    }),
    defineTweak({
      id: 'tweak:disableCortana', category: 'privacy', requiresAdmin: true,
      title: 'Desativar Assistente Cortana (política legada)',
      description: 'Aplica a política AllowCortana=0. A Cortana foi descontinuada no Windows 11 e nas versões recentes do Windows 10, então o efeito prático é nulo nelas.',
      rows: [[POL_SEARCH, 'AllowCortana', DW, 0, null]]
    }),
    defineTweak({
      id: 'tweak:disableActivityHistory', category: 'privacy', requiresAdmin: true, recommended: true,
      title: 'Desativar Histórico de Atividades (Timeline)',
      description: 'Desativa a coleta e o envio do histórico de atividades para a Microsoft.',
      rows: [[POL_SYS, 'EnableActivityFeed', DW, 0, null], [POL_SYS, 'PublishUserActivities', DW, 0, null], [POL_SYS, 'UploadUserActivities', DW, 0, null]]
    }),
    defineTweak({
      id: 'tweak:disableLocation', category: 'privacy', risk: 'medium', requiresAdmin: true,
      title: 'Desativar Rastreamento de Localização (política)',
      description: 'Bloqueia o acesso à localização para o sistema e apps via política. Pode quebrar clima, mapas, fuso horário automático e "Encontrar meu dispositivo".',
      rows: [['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors', 'DisableLocation', DW, 1, null]]
    }),
    defineTweak({
      id: 'tweak:disableDeliveryOptimization', category: 'privacy', requiresAdmin: true, recommended: true,
      title: 'Desativar Otimização de Entrega P2P',
      description: 'Impede o Windows de compartilhar partes de atualizações com outros PCs (modo apenas HTTP).',
      rows: [['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DeliveryOptimization', 'DODownloadMode', DW, 0, null]]
    }),
    defineTweak({
      id: 'tweak:disableErrorReporting', category: 'privacy', requiresAdmin: true,
      title: 'Desativar Relatório de Erros do Windows',
      description: 'Impede o envio de relatórios de falhas para a Microsoft. Você perde a sugestão automática de correções.',
      rows: [['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', DW, 1, null]]
    }),
    defineTweak({
      id: 'tweak:blockAdsAndSuggestions', category: 'privacy', recommended: true,
      title: 'Bloqueio de Anúncios e Sugestões do Windows',
      description: 'Desativa sugestões no Iniciar, dicas da tela de bloqueio, apps sugeridos e o ID de publicidade. O Windows pode reativar alguns itens após grandes atualizações.',
      rows: [
        [CDM, 'SystemPaneSuggestionsEnabled', DW, 0, 1], [CDM, 'SoftLandingEnabled', DW, 0, 1],
        [CDM, 'RotatingLockScreenEnabled', DW, 0, 1], [CDM, 'RotatingLockScreenOverlayEnabled', DW, 0, 1],
        [CDM, 'SubscribedContent-338388Enabled', DW, 0, 1], [CDM, 'SubscribedContent-338389Enabled', DW, 0, 1],
        [CDM, 'SubscribedContent-353694Enabled', DW, 0, 1], [CDM, 'SubscribedContent-353696Enabled', DW, 0, 1],
        ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', DW, 0, 1],
        ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', 'TailoredExperiencesWithDiagnosticDataEnabled', DW, 0, 1]
      ]
    }),

    // ===================================== DESEMPENHO / JOGOS
    defineTweak({
      id: 'tweak:disableGameDvr', category: 'gaming', recommended: true,
      title: 'Desativar Xbox Game DVR / Gravação em Segundo Plano',
      description: 'Desliga a gravação em segundo plano da Game Bar. Ganho pequeno (mais perceptível em PCs modestos); capturas manuais com Win+Alt+R deixam de funcionar.',
      rows: [
        ['HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppCaptureEnabled', DW, 0, 1],
        ['HKCU\\System\\GameConfigStore', 'GameDVR_Enabled', DW, 0, 1]
      ]
    }),
    defineTweak({
      id: 'tweak:mmcssGames', category: 'gaming', requiresAdmin: true,
      title: 'Prioridade Multimídia (MMCSS) para Jogos',
      description: 'Remove o limite de rede do agendador multimídia, reduz a reserva de CPU para tarefas de segundo plano e eleva a prioridade da tarefa "Games". Efeito pequeno, mais perceptível com muitos apps abertos.',
      rows: [
        [MMCSS, 'NetworkThrottlingIndex', DW, '0xffffffff', 10],
        [MMCSS, 'SystemResponsiveness', DW, 10, 20],
        [`${MMCSS}\\Tasks\\Games`, 'Priority', DW, 6, 2],
        [`${MMCSS}\\Tasks\\Games`, 'Scheduling Category', SZ, 'High', 'Medium'],
        [`${MMCSS}\\Tasks\\Games`, 'SFIO Priority', SZ, 'High', 'Normal']
      ]
    }),
    defineTweak({
      id: 'tweak:disableMouseAcceleration', category: 'gaming', liveAction: 'mouse',
      title: 'Desativar Aceleração do Mouse ("Aprimorar precisão do ponteiro")',
      description: 'Desliga a aceleração do ponteiro do Windows (movimento 1:1 na área de trabalho e em jogos que a respeitam). Jogos com Raw Input já ignoram a aceleração.',
      rows: [
        ['HKCU\\Control Panel\\Mouse', 'MouseSpeed', SZ, '0', '1'],
        ['HKCU\\Control Panel\\Mouse', 'MouseThreshold1', SZ, '0', '6'],
        ['HKCU\\Control Panel\\Mouse', 'MouseThreshold2', SZ, '0', '10']
      ]
    }),
    defineTweak({
      id: 'tweak:disableStickyKeys', category: 'gaming', liveAction: 'stickykeys',
      title: 'Desativar Atalho das Teclas de Aderência (Shift 5x)',
      description: 'Impede o popup de Teclas de Aderência ao apertar Shift várias vezes durante jogos.',
      rows: [['HKCU\\Control Panel\\Accessibility\\StickyKeys', 'Flags', SZ, '506', '510']]
    }),
    defineTweak({
      id: 'tweak:disableVBS', category: 'gaming', risk: 'high', securityRelated: true, requiresReboot: true, requiresAdmin: true,
      title: 'Desativar VBS / Isolamento de Núcleo (HVCI)  [RISCO DE SEGURANÇA]',
      description: 'Desliga a Segurança Baseada em Virtualização e a Integridade de Memória. Pode dar ganho de FPS em jogos limitados por CPU (geralmente 0-10%, não "15%"), mas REDUZ a proteção contra malware de kernel. Exige reiniciar. Não entra em nenhum perfil recomendado.',
      rows: [
        ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard', 'EnableVirtualizationBasedSecurity', DW, 0, null],
        ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity', 'Enabled', DW, 0, null]
      ]
    }),

    // ===================================== ARMAZENAMENTO / SISTEMA
    defineTweak({
      id: 'tweak:disableHibernation', category: 'storage', requiresAdmin: true,
      title: 'Desativar Hibernação (apaga hiberfil.sys)',
      description: 'Executa "powercfg /hibernate off": remove o hiberfil.sys (libera vários GB, ~40% da RAM) e também desativa a Inicialização Rápida. Notebooks perdem a hibernação.',
      statusOnly: [['HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power', 'HibernateEnabled', DW, 0]],
      commands: {
        apply: "& powercfg.exe /hibernate off; if ($LASTEXITCODE -ne 0) { throw 'powercfg /hibernate off falhou' }",
        revert: (snap) => (snapshotNumber(snap, 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Power', 'HibernateEnabled') === 0
          ? null
          : "& powercfg.exe /hibernate on; if ($LASTEXITCODE -ne 0) { throw 'powercfg /hibernate on falhou' }")
      }
    }),
    defineTweak({
      id: 'tweak:preventAutoBitLocker', category: 'storage', risk: 'medium', securityRelated: true, requiresAdmin: true,
      title: 'Impedir Criptografia Automática de Dispositivo (BitLocker)  [SEGURANÇA]',
      description: 'Impede o Windows de ligar automaticamente a Criptografia de Dispositivo. Não descriptografa discos já protegidos. Sem criptografia, os dados ficam legíveis se o disco for retirado do PC.',
      rows: [['HKLM\\SYSTEM\\CurrentControlSet\\Control\\BitLocker', 'PreventDeviceEncryption', DW, 1, null]]
    }),
    defineTweak({
      id: 'tweak:disableFastStartup', category: 'system', requiresAdmin: true,
      title: 'Desativar Inicialização Rápida (Fast Startup)',
      description: 'Faz "Desligar" fechar o kernel de verdade (como uma reinicialização limpa). Resolve problemas de drivers que não reiniciam, ao custo de boot um pouco mais lento em HDD. Vale a partir do próximo desligamento.',
      rows: [['HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Power', 'HiberbootEnabled', DW, 0, 1]]
    }),
    defineTweak({
      id: 'tweak:setUtcTime', category: 'system', risk: 'medium', requiresReboot: true, requiresAdmin: true,
      title: 'Relógio do Hardware em UTC (somente dual boot com Linux)',
      description: 'Faz o Windows tratar o relógio da placa-mãe como UTC. SÓ use se tiver Linux em dual boot - num PC só com Windows a hora ficará errada. Reinicie e acerte o horário depois.',
      rows: [['HKLM\\SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation', 'RealTimeIsUniversal', DW, 1, null]]
    }),
    defineTweak({
      id: 'tweak:disableBackgroundApps', category: 'system', requiresAdmin: true,
      title: 'Bloquear Aplicativos UWP em Segundo Plano',
      description: 'Impede que apps da Microsoft Store rodem em segundo plano (usa a política "Permitir que apps rodem em segundo plano = Negar", válida no Windows 10 e 11). Não afeta programas Win32 comuns.',
      rows: [
        ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'GlobalUserDisabled', DW, 1, 0],
        ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\AppPrivacy', 'LetAppsRunInBackground', DW, 2, null]
      ]
    }),
    defineTweak({
      id: 'tweak:edgeOptimizations', category: 'system', requiresAdmin: true,
      title: 'Otimização do Microsoft Edge (políticas)',
      description: 'Desativa o modo em segundo plano e o Startup Boost do Edge e oculta a tela de primeira execução. O Edge mostrará "gerenciado pela sua organização" por usar políticas.',
      rows: [
        [POL_EDGE_M, 'BackgroundModeEnabled', DW, 0, null], [POL_EDGE_M, 'StartupBoostEnabled', DW, 0, null],
        [POL_EDGE_M, 'HideFirstRunExperience', DW, 1, null],
        [POL_EDGE_U, 'BackgroundModeEnabled', DW, 0, null], [POL_EDGE_U, 'StartupBoostEnabled', DW, 0, null]
      ]
    })
  ];
}

/** Internal groups: same machinery (snapshot/verify/undo) but not shown in the tweak list. */
function buildInternalGroups() {
  const kernelCore = defineTweak({
    id: 'group:kernelCore', category: 'system', internal: true, requiresAdmin: true,
    title: 'Kernel: prioridade de primeiro plano e paginação do executivo',
    description: 'Win32PrioritySeparation=0x26 e DisablePagingExecutive=1.',
    rows: [
      ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', DW, 38, 2],
      ['HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management', 'DisablePagingExecutive', DW, 1, 0]
    ]
  });
  const visual = defineTweak({
    id: 'group:visualEffects', category: 'visuals', internal: true, requiresAdmin: false,
    title: 'Efeitos visuais: melhor desempenho (usuário atual)',
    description: 'VisualFXSetting, UserPreferencesMask e animações do Explorer (somente HKCU).',
    rows: [
      ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', DW, 2, 0],
      ['HKCU\\Control Panel\\Desktop', 'UserPreferencesMask', 'REG_BINARY', '9012038010000000', '9e3e078012000000'],
      ['HKCU\\Control Panel\\Desktop\\WindowMetrics', 'MinAnimate', SZ, '0', '1'],
      ['HKCU\\Software\\Microsoft\\Windows\\DWM', 'EnableAeroPeek', DW, 0, 1],
      [ADV, 'TaskbarAnimations', DW, 0, 1],
      [ADV, 'ListviewAlphaSelect', DW, 0, 1],
      [ADV, 'ListviewShadow', DW, 0, 1]
    ]
  });
  visual.explorerRestart = true;
  visual.needsRelogin = true;
  const defender = defineTweak({
    id: 'group:defenderPolicy', category: 'security', internal: true, risk: 'high', securityRelated: true, requiresAdmin: true,
    title: 'Políticas do Microsoft Defender (desativação)',
    description: 'DisableAntiSpyware / DisableRealtimeMonitoring.',
    rows: [
      ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender', 'DisableAntiSpyware', DW, 1, null],
      ['HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows Defender\\Real-Time Protection', 'DisableRealtimeMonitoring', DW, 1, null]
    ]
  });
  const hags = defineTweak({
    id: 'group:hags', category: 'gaming', internal: true, requiresAdmin: true, requiresReboot: true,
    title: 'HAGS (Agendamento de GPU acelerado por hardware)',
    description: 'HwSchMode=2 liga, 1 desliga, ausente = padrão do driver.',
    rows: [['HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', DW, 2, null]]
  });
  return [kernelCore, visual, defender, hags];
}

function snapshotNumber(snap, key, name) {
  const e = (snap?.entries || []).find((x) => regEntryId(x.key, x.name) === regEntryId(key, name));
  if (!e || !e.existed) return null;
  const n = Number(canonicalRegValue(e.type || 'REG_DWORD', e.data));
  return Number.isFinite(n) ? n : null;
}

// Live (no logoff) application of settings stored in HKCU. Values are read back from the registry.
const LIVE_ACTIONS = {
  mouse: `
$sig = @'
using System; using System.Runtime.InteropServices;
public static class DhSpi { [DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(uint a, uint b, int[] c, uint d); }
'@
Add-Type -TypeDefinition $sig -ErrorAction Stop
$m = Get-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Mouse'
$p = [int[]]@([int]$m.MouseThreshold1, [int]$m.MouseThreshold2, [int]$m.MouseSpeed)
if (-not [DhSpi]::SystemParametersInfo(0x0004, 0, $p, 3)) { throw 'SPI_SETMOUSE falhou' }`,
  stickykeys: `
$sig = @'
using System; using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential)] public struct DhStickyKeys { public uint cbSize; public uint dwFlags; }
public static class DhSpi2 { [DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(uint a, uint b, ref DhStickyKeys c, uint d); }
'@
Add-Type -TypeDefinition $sig -ErrorAction Stop
$f = [uint32](Get-ItemProperty -LiteralPath 'HKCU:\\Control Panel\\Accessibility\\StickyKeys').Flags
$s = New-Object DhStickyKeys
$s.cbSize = 8
$s.dwFlags = $f
if (-not [DhSpi2]::SystemParametersInfo(0x003B, 8, [ref]$s, 3)) { throw 'SPI_SETSTICKYKEYS falhou' }`
};

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
    this.deepTweaks = buildPublicTweaks();
    this.internalGroups = buildInternalGroups();
  }

  /** Public tweaks shown in the UI (34 original + MMCSS). */
  listTweaks() {
    return this.deepTweaks;
  }

  /** Ids of the safe, low-risk, reversible tweaks that make up the "recommended" selection. */
  getRecommendedIds() {
    return pickRecommendedTweaks(this.deepTweaks).map((t) => t.id);
  }

  getDefinition(id) {
    return this.deepTweaks.find((t) => t.id === id) || this.internalGroups.find((t) => t.id === id) || null;
  }

  // ------------------------------------------------------------------ undo store
  loadUndoStore() {
    if (this.undoFilePath && fs.existsSync(this.undoFilePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.undoFilePath, 'utf8'));
        for (const [k, v] of Object.entries(parsed)) this.deepTweaksUndoStore.set(k, v);
      } catch (e) {
        Logger.warn('DeepTweaksEngine', 'Falha ao carregar undo store do disco', e);
      }
    }
  }

  saveUndoStore() {
    if (!this.undoFilePath) return;
    try {
      const obj = {};
      for (const [k, v] of this.deepTweaksUndoStore.entries()) obj[k] = v;
      const tmp = `${this.undoFilePath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
      fs.renameSync(tmp, this.undoFilePath);
    } catch (e) {
      Logger.warn('DeepTweaksEngine', 'Falha ao salvar undo store no disco', e);
    }
  }

  hasSnapshot(id) {
    return this.deepTweaksUndoStore.has(id);
  }

  /** Free-form data engines may keep next to the registry snapshots (fsutil values, original service modes...). */
  saveExtra(id, data) {
    this.deepTweaksUndoStore.set(`extra:${id}`, { capturedAt: Date.now(), data });
    this.saveUndoStore();
  }
  getExtra(id) {
    return this.deepTweaksUndoStore.get(`extra:${id}`)?.data ?? null;
  }
  clearExtra(id) {
    this.deepTweaksUndoStore.delete(`extra:${id}`);
    this.saveUndoStore();
  }

  // ------------------------------------------------------------------ registry IO
  /** Reads many registry values in a single (non elevated) PowerShell call. Returns Map or null on failure. */
  async readEntries(entries) {
    const unique = [];
    const seen = new Set();
    for (const e of entries) {
      const id = regEntryId(e.key, e.name);
      if (!seen.has(id)) { seen.add(id); unique.push({ key: e.key, name: e.name || '' }); }
    }
    if (unique.length === 0) return new Map();
    try {
      const res = await runPowerShell(buildRegistryReadScript(unique), { timeoutMs: 15000, trim: true });
      if (res.code !== 0 && !res.stdout) return null;
      const map = parseRegistryReadOutput(res.stdout);
      return map.size ? map : null;
    } catch (e) {
      Logger.warn('DeepTweaksEngine', 'Falha ao ler valores do registro', e);
      return null;
    }
  }

  /**
   * Executes registry operations (+ optional elevated command scripts).
   * HKCU ops run in the user's own process (no UAC); everything else - machine ops and command scripts - goes
   * into ONE elevated script (one UAC prompt). Returns an array of { ok, message } aligned with `ops`
   * (also exposes .cmdResults: Map<defIndex,{ok,message}> and .stdout).
   */
  async runRegistryOps(ops, commands = []) {
    const results = new Array(ops.length).fill(null);
    results.cmdResults = new Map();
    results.stdout = '';
    const userIdx = [];
    const machineIdx = [];
    ops.forEach((op, i) => {
      if (!validateChange(op)) { results[i] = { ok: false, message: 'definição inválida' }; return; }
      (isUserHiveKey(op.key) ? userIdx : machineIdx).push(i);
    });

    const exec = async (script, elevated) => {
      try {
        return elevated
          ? await ElevationHelper.runElevatedPowerShell(script)
          : await runPowerShell(script, { timeoutMs: 60000, trim: true });
      } catch (e) {
        return { code: 1, stdout: '', stderr: e?.message ?? String(e) };
      }
    };

    if (userIdx.length) {
      const res = await exec(buildRegistryScript(userIdx.map((i) => ops[i])), false);
      const parsed = parseDhResults(res.stdout);
      userIdx.forEach((origIdx, localIdx) => {
        results[origIdx] = parsed.get(localIdx) || { ok: false, message: String(res.stderr || 'sem resposta do PowerShell').slice(0, 300) };
      });
    }

    if (machineIdx.length || commands.length) {
      const parts = [];
      if (machineIdx.length) parts.push(buildRegistryScript(machineIdx.map((i) => ops[i])));
      else parts.push("$ErrorActionPreference = 'Stop'");
      for (const c of commands) parts.push(buildCommandBlock(c.di, c.script));
      const res = await exec(parts.join('\r\n'), true);
      results.stdout = String(res.stdout || '');
      const parsed = parseDhResults(res.stdout);
      machineIdx.forEach((origIdx, localIdx) => {
        results[origIdx] = parsed.get(localIdx) || { ok: false, message: String(res.stderr || 'sem resposta do PowerShell (UAC cancelado?)').slice(0, 300) };
      });
      const cmdParsed = parseDhCommandResults(res.stdout);
      for (const c of commands) {
        results.cmdResults.set(c.di, cmdParsed.get(c.di) || { ok: false, message: String(res.stderr || 'sem resposta do PowerShell (UAC cancelado?)').slice(0, 300) });
      }
    }
    return results;
  }

  // ------------------------------------------------------------------ snapshots
  _entriesFor(def) {
    const list = [];
    for (const c of def.changes || []) if (!c.deleteKey) list.push({ key: c.key, name: c.name || '' });
    for (const r of def.statusOnly || []) list.push({ key: r[0], name: r[1] || '' });
    return list;
  }

  _buildSnapshot(def, readMap) {
    const entries = this._entriesFor(def).map((e) => {
      const cur = readMap?.get(regEntryId(e.key, e.name));
      if (!cur) return { key: e.key, name: e.name, existed: false, keyExisted: undefined, unknown: true };
      return {
        key: e.key, name: e.name, existed: !!cur.exists, keyExisted: !!cur.keyExists,
        type: cur.type || undefined, data: cur.exists ? cur.value : undefined
      };
    });
    return { capturedAt: Date.now(), entries, applied: (def.changes || []).filter((c) => !c.deleteKey) };
  }

  /** Captures the state before applying (only once: re-applying never overwrites the original snapshot). */
  async captureSnapshot(def, readMap = null) {
    if (this.deepTweaksUndoStore.has(def.id)) return false;
    const map = readMap || await this.readEntries(this._entriesFor(def));
    if (!map) throw new Error('Não foi possível ler o estado atual do registro para criar o ponto de restauração do ajuste.');
    this.deepTweaksUndoStore.set(def.id, this._buildSnapshot(def, map));
    this.saveUndoStore();
    return true;
  }

  // ------------------------------------------------------------------ status
  _evalDefStatus(def, readMap, changesOverride = null) {
    const changes = (changesOverride || def.changes || []).filter((c) => !c.deleteKey);
    const checks = changes.length ? changes : (def.statusOnly || []).map(([key, name, type, data]) => ({ key, name, type, data }));
    if (checks.length === 0) return { active: false, partial: false };
    let hits = 0;
    for (const c of checks) {
      if (regValueMatches(c, readMap.get(regEntryId(c.key, c.name)))) hits += 1;
    }
    return { active: hits === checks.length, partial: hits > 0 && hits < checks.length };
  }

  /** Real state read from the registry: a tweak is active only if EVERY value matches. */
  async checkTweaksStatus() {
    if (process.platform !== 'win32') return { ok: true, status: {}, partial: {} };
    const defs = [...this.deepTweaks, ...this.internalGroups];
    // dynamic groups (e.g. adapter specific network keys) are evaluated from what was applied
    const dynamic = [];
    for (const [id, snap] of this.deepTweaksUndoStore.entries()) {
      if (id.startsWith('extra:') || defs.some((d) => d.id === id)) continue;
      if (Array.isArray(snap?.applied) && snap.applied.length) dynamic.push({ id, changes: snap.applied });
    }
    const all = [...defs, ...dynamic];
    const entries = [];
    for (const d of all) {
      for (const c of d.changes || []) if (!c.deleteKey) entries.push(c);
      for (const r of d.statusOnly || []) entries.push({ key: r[0], name: r[1] });
    }
    const map = await this.readEntries(entries);
    if (!map) return { ok: false, error: 'Não foi possível ler o registro', status: {}, partial: {} };
    const status = {};
    const partial = {};
    for (const d of all) {
      const r = this._evalDefStatus(d, map);
      status[d.id] = r.active;
      if (r.partial) partial[d.id] = true;
    }
    return { ok: true, status, partial };
  }

  // ------------------------------------------------------------------ side effects
  async restartExplorer() {
    try {
      await runPowerShell(
        "Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 900; if (-not (Get-Process -Name explorer -ErrorAction SilentlyContinue)) { Start-Process explorer.exe }",
        { timeoutMs: 15000 }
      );
      return true;
    } catch (err) {
      Logger.warn('DeepTweaksEngine', 'Falha ao reiniciar explorer', err);
      return false;
    }
  }

  async runLiveAction(name) {
    const script = LIVE_ACTIONS[name];
    if (!script) return true;
    try {
      const res = await runPowerShell(`$ErrorActionPreference='Stop'\n${script}`, { timeoutMs: 20000, trim: true });
      return res.code === 0;
    } catch {
      return false;
    }
  }

  async _runCommandScript(script) {
    if (!script) return { ok: true };
    const res = await ElevationHelper.runElevatedPowerShell(`$ErrorActionPreference = 'Stop'\r\n${script}`);
    return { ok: res.code === 0, error: res.stderr || (res.code !== 0 ? 'comando falhou ou UAC cancelado' : '') };
  }

  // ------------------------------------------------------------------ apply
  /**
   * Core apply for tweak definitions (public tweaks, internal groups or ad-hoc change sets).
   * Returns { ok, results:[{id, ok, error, verified}], needsReboot, needsRelogin }
   */
  async _applyDefs(defs, eventSender = () => {}, runLabel = 'darkHubTweaks') {
    const runId = `${runLabel}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    eventSender('optimizer:runEvent', { runId, type: 'run-start', total: defs.length, concurrency: 1, startedAt: Date.now() });

    const results = defs.map((d) => ({ id: d.id, ok: false, error: '', verified: false }));
    const notes = [];
    defs.forEach((d, i) => eventSender('optimizer:runEvent', { runId, type: 'op-start', opId: d.id, index: i, startedAt: Date.now() }));

    // 1) snapshots (one read for all tweaks)
    let readMap = null;
    try {
      readMap = await this.readEntries(defs.flatMap((d) => this._entriesFor(d)));
      if (!readMap) throw new Error('leitura do registro falhou');
    } catch (e) {
      defs.forEach((d, i) => { results[i].error = `Não foi possível ler o estado atual do registro: ${e.message}`; });
      return this._finishRun(eventSender, runId, defs, results, notes);
    }
    const freshSnapshots = new Set();
    for (const d of defs) {
      try {
        if (await this.captureSnapshot(d, readMap)) freshSnapshots.add(d.id);
      } catch (e) {
        results[defs.indexOf(d)].error = e.message;
      }
    }

    // 2) registry writes (HKCU direct) + machine writes and command scripts in ONE elevated script
    const ops = [];
    const owner = [];
    const cmds = [];
    defs.forEach((d, di) => {
      if (results[di].error) return;
      for (const c of d.changes || []) { ops.push(c.deleteKey ? { key: c.key, deleteKey: true } : { ...c }); owner.push(di); }
      if (d.commands?.apply) cmds.push({ di, script: typeof d.commands.apply === 'function' ? d.commands.apply() : d.commands.apply });
    });
    const opResults = await this.runRegistryOps(ops, cmds);
    const writeErrors = new Map();
    opResults.forEach((r, i) => {
      if (!r?.ok) writeErrors.set(owner[i], r?.message || 'falha ao escrever no registro');
    });
    for (const [di, r] of opResults.cmdResults) if (!r.ok && !writeErrors.has(di)) writeErrors.set(di, r.message || 'comando falhou');
    const batchStdout = opResults.stdout;

    // 4) read back what the system really holds now
    const afterMap = await this.readEntries(defs.flatMap((d) => this._entriesFor(d)));
    defs.forEach((d, di) => {
      const res = results[di];
      if (res.error) return;
      if (writeErrors.has(di)) { res.error = writeErrors.get(di); return; }
      if (!afterMap) { res.error = 'Não foi possível verificar o resultado no registro'; return; }
      const st = this._evalDefStatus(d, afterMap);
      res.verified = st.active;
      if (st.active) res.ok = true;
      else res.error = 'O Windows não manteve o valor (política bloqueada, Tamper Protection ou valor sobrescrito). Nada foi alterado de forma verificável.';
    });

    // 5) drop snapshots of tweaks that did not change anything; keep `applied` current for the others
    defs.forEach((d, di) => {
      if (!results[di].ok && freshSnapshots.has(d.id)) this.deepTweaksUndoStore.delete(d.id);
      else if (results[di].ok && this.deepTweaksUndoStore.has(d.id)) {
        this.deepTweaksUndoStore.get(d.id).applied = (d.changes || []).filter((c) => !c.deleteKey);
      }
    });
    this.saveUndoStore();

    // 6) live effects
    const okDefs = defs.filter((d, di) => results[di].ok);
    if (okDefs.some((d) => d.explorerRestart)) {
      if (!(await this.restartExplorer())) notes.push('Não foi possível reiniciar o Explorer; saia e entre na sessão para ver todas as mudanças.');
    }
    for (const name of new Set(okDefs.map((d) => d.liveAction).filter(Boolean))) {
      if (!(await this.runLiveAction(name))) notes.push(`O ajuste "${name}" só terá efeito completo após sair e entrar na sessão.`);
    }

    return this._finishRun(eventSender, runId, defs, results, notes, batchStdout);
  }

  _finishRun(eventSender, runId, defs, results, notes, stdout = '') {
    defs.forEach((d, i) => {
      eventSender('optimizer:runEvent', { runId, type: 'op-finish', opId: d.id, index: i, ok: results[i].ok, error: results[i].error || undefined });
    });
    const okCount = results.filter((r) => r.ok).length;
    eventSender('optimizer:runEvent', { runId, type: 'run-finish', completed: defs.length, total: defs.length, failed: defs.length - okCount });
    const needsReboot = defs.some((d, i) => results[i].ok && d.requiresReboot);
    const needsRelogin = defs.some((d, i) => results[i].ok && (d.needsRelogin || d.liveAction));
    return { results, notes, needsReboot, needsRelogin, okCount, stdout };
  }

  _summarize(verb, defs, run) {
    const failed = defs.map((d, i) => ({ d, r: run.results[i] })).filter((x) => !x.r.ok);
    const extra = [];
    if (run.needsReboot) extra.push('Reinicie o Windows para concluir.');
    if (run.notes.length) extra.push(...run.notes);
    const base = `${run.okCount}/${defs.length} ajuste(s) ${verb} e verificados no sistema.`;
    const msg = [base, ...extra].join(' ');
    if (failed.length === 0) return { ok: true, msg, results: run.results, needsReboot: run.needsReboot, stdout: run.stdout };
    const detail = failed.map(({ d, r }) => `${d.title || d.id}: ${r.error}`).join(' | ');
    return { ok: false, error: `${base} Falhas: ${detail}`, msg, results: run.results, needsReboot: run.needsReboot, stdout: run.stdout };
  }

  async applyTweaks(idsInput, eventSender = () => {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const ids = (Array.isArray(idsInput) ? idsInput : []).filter((i) => typeof i === 'string');
    const defs = ids.map((id) => this.getDefinition(id)).filter(Boolean);
    if (defs.length === 0) return { ok: false, error: 'Nenhum tweak válido selecionado' };
    const run = await this._applyDefs(defs, eventSender);
    const out = this._summarize('aplicado(s)', defs, run);
    Logger.auditOptimizer({ type: 'tweaks-apply', ids: defs.map((d) => d.id), ok: out.ok, error: out.error });
    return out;
  }

  /** Applies only the safe, low-risk, reversible tweaks (never VBS, BitLocker, telemetry policies...). */
  async applyRecommended(eventSender = () => {}) {
    return this.applyTweaks(this.getRecommendedIds(), eventSender);
  }

  /** Apply an ad-hoc change set (used by other engines) with snapshot + read-back verification. */
  async applyChangeSet({ id, title, changes, statusOnly, commands, explorerRestart, liveAction, requiresReboot }, eventSender = () => {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const clean = (changes || []).map((c) => (c.deleteKey ? { key: c.key, deleteKey: true } : { key: c.key, name: c.name || '', type: c.type || 'REG_SZ', data: String(c.data ?? '') }));
    if (!id || clean.some((c) => !validateChange(c))) return { ok: false, error: 'Conjunto de alterações inválido' };
    const def = { id, title: title || id, changes: clean, statusOnly: statusOnly || [], commands, explorerRestart, liveAction, requiresReboot, requiresAdmin: true };
    const run = await this._applyDefs([def], eventSender, 'darkHubChangeSet');
    return this._summarize('aplicado(s)', [def], run);
  }

  // ------------------------------------------------------------------ revert / undo
  /**
   * Restores a tweak: from the snapshot taken before it was applied when available (true previous values),
   * otherwise with the documented Windows defaults. Verifies by reading the registry back.
   */
  async _restoreDefs(defs, eventSender, { requireSnapshot = false, runLabel = 'darkHubRevert', fallbackFor = null } = {}) {
    const runId = `${runLabel}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    eventSender('optimizer:runEvent', { runId, type: 'run-start', total: defs.length, concurrency: 1, startedAt: Date.now() });
    const results = defs.map((d) => ({ id: d.id, ok: false, error: '', verified: false, usedSnapshot: false }));
    const notes = [];
    defs.forEach((d, i) => eventSender('optimizer:runEvent', { runId, type: 'op-start', opId: d.id, index: i, startedAt: Date.now() }));

    const ops = [];
    const owner = [];
    const expectations = []; // per op: { op, defIdx }
    defs.forEach((d, di) => {
      const snap = this.deepTweaksUndoStore.get(d.id);
      if (!snap && requireSnapshot) { results[di].error = 'Sem ponto de restauração salvo para este ajuste'; return; }
      results[di].usedSnapshot = !!snap;
      let defOps = [];
      if (snap) {
        const changeIds = new Set((d.changes || []).map((c) => regEntryId(c.key, c.name)));
        // statusOnly entries are restored by the revert command, not written back
        for (const e of snap.entries || []) {
          if (!changeIds.has(regEntryId(e.key, e.name)) && (d.changes || []).length) continue;
          if (!(d.changes || []).length) continue;
          if (e.unknown) continue;
          defOps.push(...snapshotEntryToOps(e));
        }
        // parent keys created by the tweak (e.g. classic menu CLSID): removed only if they did not exist before and are now empty
        for (const rc of d.revertChanges || []) {
          if (!rc.deleteKey) continue;
          const createdByUs = (snap.entries || []).some((e) => e.existed === false && e.keyExisted === false
            && String(e.key).toLowerCase().startsWith(String(rc.key).toLowerCase()));
          if (createdByUs) defOps.push({ key: rc.key, deleteKeyIfEmpty: true });
        }
      } else {
        const src = fallbackFor ? fallbackFor(d) : d.revertChanges;
        defOps = (src || []).map(fallbackRevertOp).filter(Boolean);
      }
      // de-duplicate (a deleteKey on the parent supersedes value deletes under it)
      for (const op of defOps) { ops.push(op); owner.push(di); expectations.push({ op, di }); }
    });

    const cmds = [];
    defs.forEach((d, di) => {
      if (results[di].error || !d.commands?.revert) return;
      const snap = this.deepTweaksUndoStore.get(d.id);
      const script = typeof d.commands.revert === 'function' ? d.commands.revert(snap) : d.commands.revert;
      if (script) cmds.push({ di, script });
    });
    const opResults = await this.runRegistryOps(ops, cmds);
    const errors = new Map();
    opResults.forEach((r, i) => { if (!r?.ok) errors.set(owner[i], r?.message || 'falha ao restaurar'); });
    for (const [di, r] of opResults.cmdResults) if (!r.ok && !errors.has(di)) errors.set(di, r.message || 'comando falhou');
    const batchStdout = opResults.stdout;

    // verification: every restored value must read back as expected
    const verifyEntries = expectations.filter((x) => !x.op.deleteKey && !x.op.deleteKeyIfEmpty).map((x) => ({ key: x.op.key, name: x.op.name || '' }));
    const keyChecks = expectations.filter((x) => x.op.deleteKey).map((x) => ({ key: x.op.key, name: '' }));
    const afterMap = await this.readEntries([...verifyEntries, ...keyChecks, ...defs.flatMap((d) => (d.commands?.revert ? this._entriesFor(d) : []))]);
    defs.forEach((d, di) => {
      const res = results[di];
      if (res.error) return;
      if (errors.has(di)) { res.error = errors.get(di); return; }
      if (!afterMap) { res.error = 'Não foi possível verificar a restauração'; return; }
      let good = true;
      for (const x of expectations.filter((e) => e.di === di)) {
        const cur = afterMap.get(regEntryId(x.op.key, x.op.name || ''));
        if (x.op.deleteKeyIfEmpty) continue;
        if (x.op.deleteKey) { if (cur?.keyExists) good = false; continue; }
        if (x.op.deleteValue) { if (cur?.exists) good = false; continue; }
        if (!regValueMatches(x.op, cur)) good = false;
      }
      res.verified = good;
      res.ok = good;
      if (!good) res.error = 'O valor restaurado não foi mantido pelo Windows';
    });

    defs.forEach((d, di) => { if (results[di].ok) this.deepTweaksUndoStore.delete(d.id); });
    this.saveUndoStore();

    const okDefs = defs.filter((d, di) => results[di].ok);
    if (okDefs.some((d) => d.explorerRestart) && !(await this.restartExplorer())) notes.push('Não foi possível reiniciar o Explorer.');
    for (const name of new Set(okDefs.map((d) => d.liveAction).filter(Boolean))) {
      if (!(await this.runLiveAction(name))) notes.push(`O ajuste "${name}" só terá efeito completo após sair e entrar na sessão.`);
    }
    return this._finishRun(eventSender, runId, defs, results, notes, batchStdout);
  }

  async revertTweaks(idsInput, eventSender = () => {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const ids = (Array.isArray(idsInput) ? idsInput : []).filter((i) => typeof i === 'string');
    const defs = ids.map((id) => this.getDefinition(id)).filter(Boolean);
    if (defs.length === 0) return { ok: false, error: 'Nenhum tweak válido selecionado' };
    const run = await this._restoreDefs(defs, eventSender);
    const out = this._summarize('revertido(s)', defs, run);
    Logger.auditOptimizer({ type: 'tweaks-revert', ids: defs.map((d) => d.id), ok: out.ok, error: out.error });
    return out;
  }

  /** Restore strictly from the saved snapshot (the exact previous values). */
  async undoTweaks(idsInput, eventSender = () => {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const ids = (Array.isArray(idsInput) ? idsInput : [idsInput]).filter((i) => typeof i === 'string');
    const defs = ids.map((id) => this.getDefinition(id)).filter((d) => d && this.deepTweaksUndoStore.has(d.id));
    if (defs.length === 0) return { ok: false, error: 'Nenhum snapshot disponível para os ajustes selecionados' };
    const run = await this._restoreDefs(defs, eventSender, { requireSnapshot: true, runLabel: 'darkHubUndo' });
    return this._summarize('restaurado(s)', defs, run);
  }

  /** Restore an ad-hoc change set applied through applyChangeSet. */
  async restoreChangeSet({ id, title, fallbackChanges, explorerRestart, liveAction, commands, statusOnly, requiresReboot }, eventSender = () => {}) {
    if (process.platform !== 'win32') return { ok: false, error: 'Only Windows' };
    const snap = this.deepTweaksUndoStore.get(id);
    const changes = snap?.applied || fallbackChanges || [];
    const def = {
      id, title: title || id, changes: changes.map((c) => ({ ...c })), revertChanges: fallbackChanges, explorerRestart, liveAction, commands,
      statusOnly: statusOnly || [], requiresReboot
    };
    const run = await this._restoreDefs([def], eventSender, { runLabel: 'darkHubChangeSetRevert' });
    return this._summarize('restaurado(s)', [def], run);
  }
}

export default new DeepTweaksEngine();
