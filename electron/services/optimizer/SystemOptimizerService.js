import Logger from '../LoggerService.js';
import NetworkEngine from './NetworkEngine.js';
import StorageEngine from './StorageEngine.js';
import PowerEngine from './PowerEngine.js';
import MemoryEngine from './MemoryEngine.js';
import ServicesEngine from './ServicesEngine.js';
import DeepTweaksEngine from './DeepTweaksEngine.js';
import VisualsEngine from './VisualsEngine.js';
import SystemEngine from './SystemEngine.js';
import ElevationHelper from './ElevationHelper.js';
import cp from 'node:child_process';
import util from 'node:util';

const execAsync = util.promisify(cp.exec);

class SystemOptimizerService {
  constructor() {
    this.operations = new Map();
    this.profiles = {};
    this.registerOperations();
    this.registerProfiles();
  }

  registerOperations() {

    this.operations.set('optimizer:flushDns', {
      id: 'optimizer:flushDns',
      name: 'Limpar Cache de DNS',
      description: 'Limpa o cache de resolução de nomes do Windows.',
      technicalDescription: 'Executa "ipconfig /flushdns" para limpar registros obsoletos de resolução de rede.',
      category: 'network',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: false,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 200,
      execute: async () => {
        return await NetworkEngine.flushDns();
      }
    });

    this.operations.set('optimizer:cleanTemp', {
      id: 'optimizer:cleanTemp',
      name: 'Limpar Arquivos Temporários',
      description: 'Exclui caches locais e arquivos de log temporários inofensivos.',
      technicalDescription: 'Varre e remove arquivos não bloqueados em %TEMP%, %WINDIR%\\Temp e pastas de logs do sistema.',
      category: 'storage',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: false,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 500,
      execute: async () => {
        return await StorageEngine.cleanTempFiles();
      }
    });

    this.operations.set('optimizer:optimizeRAM', {
      id: 'optimizer:optimizeRAM',
      name: 'Otimizar Memória RAM',
      description: 'Esvazia a lista de páginas de cache (Working Set) dos processos inativos.',
      technicalDescription: 'Invoca a API nativa EmptyWorkingSet do Windows para liberar páginas de memória física não utilizadas.',
      category: 'memory',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: false,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 400,
      execute: async () => {
        const res = await MemoryEngine.optimizeRAM();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.msg,
          savingsBytes: res.freedBytes || 0,
          affectedResources: ['RAM Working Set'],
          processedItems: 1
        };
      }
    });

    this.operations.set('optimizer:powerPlanHighPerformance', {
      id: 'optimizer:powerPlanHighPerformance',
      name: 'Plano de Energia: Alto Desempenho',
      description: 'Ativa o plano de energia de alto desempenho para priorizar CPU.',
      technicalDescription: 'Altera o esquema de energia ativa para o GUID correspondente ao High Performance (SCHEME_MIN).',
      category: 'power',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 300,
      execute: async () => {
        return await PowerEngine.setHighPerformance();
      }
    });

    this.operations.set('optimizer:powerPlanBalanced', {
      id: 'optimizer:powerPlanBalanced',
      name: 'Plano de Energia: Equilibrado',
      description: 'Restaura o plano de energia padrão equilibrado para economia.',
      technicalDescription: 'Restaura o GUID de energia ativo para o padrão Balanced (SCHEME_BALANCED).',
      category: 'power',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 300,
      execute: async () => {
        return await PowerEngine.setBalanced();
      }
    });

    this.operations.set('optimizer:disableTelemetry', {
      id: 'optimizer:disableTelemetry',
      name: 'Desativar Telemetria',
      description: 'Bloqueia o envio de relatórios de telemetria e diagnósticos para a Microsoft.',
      technicalDescription: 'Modifica chaves sob Policies\\Microsoft\\Windows\\DataCollection desativando AllowTelemetry e MaxTelemetryAllowed.',
      category: 'privacy',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 800,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:disableTelemetry'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Registry (Telemetry Keys)'],
          processedItems: 5
        };
      }
    });

    this.operations.set('optimizer:disableLocation', {
      id: 'optimizer:disableLocation',
      name: 'Desativar Localização',
      description: 'Desativa o serviço de geolocalização do Windows.',
      technicalDescription: 'Modifica a chave DisableLocation no registro de políticas.',
      category: 'privacy',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 300,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:disableLocation'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Registry (Location Keys)'],
          processedItems: 1
        };
      }
    });

    this.operations.set('optimizer:disableActivityHistory', {
      id: 'optimizer:disableActivityHistory',
      name: 'Desativar Histórico de Atividades',
      description: 'Desativa o envio do histórico de atividades de arquivos e aplicativos para a nuvem.',
      technicalDescription: 'Desativa PublishUserActivities, UploadUserActivities e CDP no registro.',
      category: 'privacy',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 400,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:disableActivityHistory'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Registry (ActivityFeed Keys)'],
          processedItems: 4
        };
      }
    });

    this.operations.set('optimizer:disableCortana', {
      id: 'optimizer:disableCortana',
      name: 'Desativar Cortana',
      description: 'Desativa a assistente Cortana no Windows.',
      technicalDescription: 'Adiciona AllowCortana = 0 no registro sob Windows Search.',
      category: 'privacy',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 300,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:disableCortana'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Registry (Cortana Keys)'],
          processedItems: 1
        };
      }
    });

    this.operations.set('optimizer:disableGameBar', {
      id: 'optimizer:disableGameBar',
      name: 'Desativar Game DVR / Game Bar',
      description: 'Desativa a gravação de tela em segundo plano do Xbox.',
      technicalDescription: 'Desliga AppCaptureEnabled e GameDVR_Enabled no registro local do usuário.',
      category: 'gaming',
      risk: 'moderate',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 400,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:disableGameDvr'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Registry (GameDVR Keys)'],
          processedItems: 2
        };
      }
    });

    this.operations.set('optimizer:disableAiAndAds', {
      id: 'optimizer:disableAiAndAds',
      name: 'Desativar Windows Recall, Copilot e Anúncios',
      description: 'Bloqueia o monitoramento local de Recall IA, Copilot e anúncios embutidos do Windows.',
      technicalDescription: 'Desativa DisableAIDataAnalysis, BingSearchEnabled, ScoobeSystemSettingEnabled e chaves de telemetria de anúncios.',
      category: 'privacy',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 1000,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:disableAiAndAds'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Registry (AI & Ads Keys)'],
          processedItems: 8
        };
      }
    });

    this.operations.set('optimizer:optimizeAudioLatency', {
      id: 'optimizer:optimizeAudioLatency',
      name: 'Otimizar Latência de Áudio',
      description: 'Ajusta a afinidade do processador e prioridade do serviço audiodg.exe para reduzir latência de som.',
      technicalDescription: 'Define a afinidade de CPU para um único núcleo e define a classe de prioridade para alta.',
      category: 'audio',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 300,
      execute: async () => {
        const res = await MemoryEngine.optimizeAudioLatency();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.msg,
          affectedResources: ['audiodg.exe process configuration'],
          processedItems: 1
        };
      }
    });

    this.operations.set('optimizer:optimizeGameRoute', {
      id: 'optimizer:optimizeGameRoute',
      name: 'Priorização de Rede e Jogos (MMCSS)',
      description: 'Ajusta o Multimedia Class Scheduler para priorizar jogos e desativar throttling de rede.',
      technicalDescription: 'Modifica NetworkThrottlingIndex para 0xffffffff e define GPU Priority para 8 na tarefa Games.',
      category: 'gaming',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 500,
      execute: async () => {
        const res = await NetworkEngine.optimizeGameRoute();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.msg,
          affectedResources: ['Windows Registry (MMCSS Tasks)'],
          processedItems: 3
        };
      }
    });

    this.operations.set('optimizer:disableServices', {
      id: 'optimizer:disableServices',
      name: 'Desativar Serviços Redundantes',
      description: 'Desativa o Windows Search (Indexador), SysMain (Superfetch) e Connected User Experiences.',
      technicalDescription: 'Executa comandos SC para desativar e parar WSearch, SysMain, DiagTrack e CDPSvc.',
      category: 'services',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 1200,
      execute: async () => {
        const res = await ServicesEngine.applyServicesTweak();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Services (SysMain, WSearch, DiagTrack, CDPSvc)'],
          processedItems: 4
        };
      }
    });

    this.operations.set('optimizer:disableCoreIsolation', {
      id: 'optimizer:disableCoreIsolation',
      name: 'Modo Hardcore Gamer (Desativar VBS / Isolamento de Núcleo)',
      description: 'Desativa a Virtualization Based Security (VBS) e o Isolamento de Núcleo para ganho bruto de FPS.',
      technicalDescription: 'Modifica chaves sob DeviceGuard e DeviceGuard\\Scenarios\\HypervisorEnforcedCodeIntegrity no HKLM.',
      category: 'security',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: true,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 1500,
      execute: async () => {
        const res = await SystemEngine.applyHardcoreGamerMode();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Registry (HypervisorEnforcedCodeIntegrity, DeviceGuard)'],
          processedItems: 3
        };
      }
    });

    this.operations.set('optimizer:disableVisualEffects', {
      id: 'optimizer:disableVisualEffects',
      name: 'Desativar Efeitos Visuais Pesados',
      description: 'Desativa animações de janelas e efeitos do DWM para resposta mais rápida.',
      technicalDescription: 'Ajusta VisualFXSetting para 2 (Melhor desempenho) e desativa animações MinAnimate e AeroPeek.',
      category: 'visuals',
      risk: 'moderate',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 500,
      execute: async () => {
        const res = await VisualsEngine.disableVisualEffects();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Explorer DWM registry keys'],
          processedItems: 4
        };
      }
    });

    this.operations.set('optimizer:classicContextMenu', {
      id: 'optimizer:classicContextMenu',
      name: 'Menu de Contexto Clássico (Windows 10)',
      description: 'Restaura o menu de contexto clássico com todas as opções no Windows 11.',
      technicalDescription: 'Cria a chave CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32 no HKCU.',
      category: 'system',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 11',
      estimatedTimeMs: 300,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:classicContextMenu'], eventSender || (() => {}));
        await SystemEngine.restartExplorer();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? 'Menu clássico ativado e Explorer reiniciado' : res.error,
          affectedResources: ['Windows Explorer Shell Context Menu'],
          processedItems: 1
        };
      }
    });

    this.operations.set('optimizer:taskbarTweaks', {
      id: 'optimizer:taskbarTweaks',
      name: 'Otimizar Barra de Tarefas',
      description: 'Alinha a barra de tarefas à esquerda, oculta pesquisa desnecessária e oculta a Visão de Tarefas.',
      technicalDescription: 'Ajusta TaskbarAl=0, SearchboxTaskbarMode=0, ShowTaskViewButton=0 e TaskbarDeveloperSettings=1 no registro.',
      category: 'system',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 400,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:taskbarTweaks'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? 'Barra de tarefas otimizada com sucesso' : res.error,
          affectedResources: ['Windows Taskbar Registry'],
          processedItems: 4
        };
      }
    });

    this.operations.set('optimizer:taskbarEndTask', {
      id: 'optimizer:taskbarEndTask',
      name: 'Habilitar "Finalizar Tarefa" na Barra de Tarefas',
      description: 'Permite finalizar aplicativos travados com o botão direito diretamente no ícone da barra de tarefas.',
      technicalDescription: 'Define TaskbarDeveloperSettings=1 em HKCU e HKLM sob Explorer\\Advanced.',
      category: 'system',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 11',
      estimatedTimeMs: 300,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:taskbarEndTask'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? '"Finalizar Tarefa" ativado na barra de tarefas' : res.error,
          affectedResources: ['Taskbar Developer Settings'],
          processedItems: 2
        };
      }
    });

    this.operations.set('optimizer:darkModeAndColors', {
      id: 'optimizer:darkModeAndColors',
      name: 'Modo Escuro Completo & Cores',
      description: 'Aplica o tema escuro em todo o sistema, janelas, apps e destaca transparência e cores com elegância.',
      technicalDescription: 'Ajusta SystemUsesLightTheme=0, AppsUseLightTheme=0, ColorPrevalence=1 e EnableTransparency=1.',
      category: 'system',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 400,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:darkModeAndColors'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? 'Modo escuro e cores de destaque aplicados' : res.error,
          affectedResources: ['Windows Personalize Registry'],
          processedItems: 4
        };
      }
    });

    this.operations.set('optimizer:explorerTweaks', {
      id: 'optimizer:explorerTweaks',
      name: 'Otimizar Explorador de Arquivos',
      description: 'Abre no "Este Computador", exibe extensões de arquivo conhecidas e exibe itens ocultos e do sistema.',
      technicalDescription: 'Ajusta LaunchTo=1, HideFileExt=0, Hidden=1 e ShowSuperHidden=1.',
      category: 'system',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 400,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:explorerTweaks'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? 'Explorador configurado para máxima produtividade' : res.error,
          affectedResources: ['Windows Explorer Advanced Registry'],
          processedItems: 4
        };
      }
    });

    this.operations.set('optimizer:edgeOptimizations', {
      id: 'optimizer:edgeOptimizations',
      name: 'Otimização do Microsoft Edge',
      description: 'Desativa processos do Edge em segundo plano, remove o Startup Boost e desliga telas de primeira execução.',
      technicalDescription: 'Define BackgroundModeEnabled=0, StartupBoostEnabled=0 e HideFirstRunExperience=1 via políticas.',
      category: 'system',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 500,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:edgeOptimizations'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? 'Microsoft Edge otimizado (sem sobrecarga em segundo plano)' : res.error,
          affectedResources: ['Edge Policies Registry'],
          processedItems: 3
        };
      }
    });

    this.operations.set('optimizer:blockAdsAndSuggestions', {
      id: 'optimizer:blockAdsAndSuggestions',
      name: 'Bloqueio Total de Anúncios e Sugestões',
      description: 'Bloqueia anúncios embutidos, sugestões de apps, Bing Search no menu iniciar e telemetria de propaganda.',
      technicalDescription: 'Desativa todas as chaves do ContentDeliveryManager, CloudContent e Copilot.',
      category: 'privacy',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 800,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:blockAdsAndSuggestions'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? 'Anúncios e sugestões da Microsoft bloqueados com sucesso' : res.error,
          affectedResources: ['ContentDeliveryManager & CloudContent Policies'],
          processedItems: 18
        };
      }
    });

    this.operations.set('optimizer:disableMouseAcceleration', {
      id: 'optimizer:disableMouseAcceleration',
      name: 'Desativar Aceleração do Mouse (1:1 Raw Input)',
      description: 'Desativa a aceleração do ponteiro do mouse para precisão absoluta e mira consistente em jogos.',
      technicalDescription: 'Define MouseSpeed=0, MouseThreshold1=0 e MouseThreshold2=0 no HKCU\\Control Panel\\Mouse.',
      category: 'gaming',
      risk: 'safe',
      requiresAdmin: false,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 200,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:disableMouseAcceleration'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? 'Aceleração de mouse desativada (Entrada bruta 1:1 ativa)' : res.error,
          affectedResources: ['Control Panel Mouse Registry'],
          processedItems: 3
        };
      }
    });

    this.operations.set('optimizer:preventAutoBitLocker', {
      id: 'optimizer:preventAutoBitLocker',
      name: 'Impedir Criptografia Automática (BitLocker)',
      description: 'Impede o Windows de bloquear ou encriptar unidades de disco e SSDs automaticamente.',
      technicalDescription: 'Define PreventDeviceEncryption=1 sob HKLM\\SYSTEM\\CurrentControlSet\\Control\\BitLocker.',
      category: 'system',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 300,
      execute: async (eventSender) => {
        const res = await DeepTweaksEngine.applyTweaks(['tweak:preventAutoBitLocker'], eventSender || (() => {}));
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? 'Criptografia automática de disco prevenida' : res.error,
          affectedResources: ['BitLocker Control Registry'],
          processedItems: 1
        };
      }
    });

    this.operations.set('optimizer:disableHibernation', {
      id: 'optimizer:disableHibernation',
      name: 'Desativar Arquivo de Hibernação (Liberar Espaço no SSD)',
      description: 'Desativa o arquivo hiberfil.sys liberando gigabytes de espaço valioso no disco C:.',
      technicalDescription: 'Executa "powercfg.exe /HIBERNATE OFF" para remover o arquivo de hibernação.',
      category: 'storage',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: true,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 500,
      execute: async () => {
        const res = await SystemEngine.toggleHibernation(false);
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['C:\\hiberfil.sys'],
          processedItems: 1
        };
      }
    });

    this.operations.set('optimizer:deepCleanOneDrive', {
      id: 'optimizer:deepCleanOneDrive',
      name: 'Remover OneDrive Completamente',
      description: 'Encerra processos do OneDrive, remove instaladores do System32 e desvincula inicialização.',
      technicalDescription: 'Remove OneDriveSetup.exe de System32 e SysWOW64 e limpa entradas de execução no registro.',
      category: 'storage',
      risk: 'safe',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: false,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 800,
      execute: async () => {
        const res = await SystemEngine.deepCleanOneDrive();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['OneDrive Executables & Registry Run'],
          processedItems: 4
        };
      }
    });

    this.operations.set('optimizer:removeCapabilities', {
      id: 'optimizer:removeCapabilities',
      name: 'Remover Recursos Obsoletos & Recall',
      description: 'Remove recursos legados do Windows (Hello Face, Quick Assist, WordPad) e desinstala o Recall.',
      technicalDescription: 'Usa Remove-WindowsCapability e Disable-WindowsOptionalFeature para remover pacotes legados.',
      category: 'system',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: false,
      isReversible: false,
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 4000,
      execute: async () => {
        const res = await SystemEngine.removeCapabilitiesAndRecall();
        return {
          status: res.ok ? 'Success' : 'Error',
          message: res.ok ? res.msg : res.error,
          affectedResources: ['Windows Capabilities & Optional Features'],
          processedItems: 6
        };
      }
    });
  }

  registerProfiles() {
    this.profiles = {
      safe: {
        id: 'safe',
        name: 'Perfil Seguro',
        description: 'Limpezas básicas inofensivas, liberação de cache RAM e otimizações visuais de usabilidade (Modo Escuro, Menu Clássico, Finalizar Tarefa e Explorer).',
        risk: 'safe',
        tweakIds: [
          'optimizer:cleanTemp',
          'optimizer:flushDns',
          'optimizer:optimizeRAM',
          'optimizer:classicContextMenu',
          'optimizer:taskbarTweaks',
          'optimizer:taskbarEndTask',
          'optimizer:darkModeAndColors',
          'optimizer:explorerTweaks'
        ]
      },
      recommended: {
        id: 'recommended',
        name: 'Perfil Recomendado (Produtividade & Privacidade)',
        description: 'Perfil Seguro + bloqueio total de telemetria, propagandas, otimização do Edge e prevenção de BitLocker automático.',
        risk: 'moderate',
        tweakIds: [
          'optimizer:cleanTemp',
          'optimizer:flushDns',
          'optimizer:optimizeRAM',
          'optimizer:classicContextMenu',
          'optimizer:taskbarTweaks',
          'optimizer:taskbarEndTask',
          'optimizer:darkModeAndColors',
          'optimizer:explorerTweaks',
          'optimizer:disableTelemetry',
          'optimizer:disableLocation',
          'optimizer:disableActivityHistory',
          'optimizer:disableCortana',
          'optimizer:edgeOptimizations',
          'optimizer:blockAdsAndSuggestions',
          'optimizer:preventAutoBitLocker'
        ]
      },
      gaming: {
        id: 'gaming',
        name: 'Perfil Jogos & Máxima Fluidez',
        description: 'Perfil Recomendado + desativação de gravação de tela Xbox, priorização MMCSS, áudio de alta prioridade, efeitos visuais rápidos, remoção de aceleração do mouse e desativação de hibernação.',
        risk: 'moderate',
        tweakIds: [
          'optimizer:cleanTemp',
          'optimizer:flushDns',
          'optimizer:optimizeRAM',
          'optimizer:classicContextMenu',
          'optimizer:taskbarTweaks',
          'optimizer:taskbarEndTask',
          'optimizer:darkModeAndColors',
          'optimizer:explorerTweaks',
          'optimizer:disableTelemetry',
          'optimizer:disableLocation',
          'optimizer:disableActivityHistory',
          'optimizer:disableCortana',
          'optimizer:edgeOptimizations',
          'optimizer:blockAdsAndSuggestions',
          'optimizer:preventAutoBitLocker',
          'optimizer:disableGameBar',
          'optimizer:disableAiAndAds',
          'optimizer:optimizeAudioLatency',
          'optimizer:optimizeGameRoute',
          'optimizer:disableVisualEffects',
          'optimizer:disableMouseAcceleration',
          'optimizer:disableHibernation'
        ]
      },
      advanced: {
        id: 'advanced',
        name: 'Perfil Avançado (Hardcore / Máximo FPS)',
        description: 'Perfil Jogos + desativação de serviços redundantes, remoção completa de resíduos do OneDrive, remoção de Capabilities legadas e desativação de VBS/Core Isolation para ganho bruto de FPS.',
        risk: 'advanced',
        tweakIds: [
          'optimizer:cleanTemp',
          'optimizer:flushDns',
          'optimizer:optimizeRAM',
          'optimizer:classicContextMenu',
          'optimizer:taskbarTweaks',
          'optimizer:darkModeAndColors',
          'optimizer:explorerTweaks',
          'optimizer:disableTelemetry',
          'optimizer:disableLocation',
          'optimizer:disableActivityHistory',
          'optimizer:disableCortana',
          'optimizer:edgeOptimizations',
          'optimizer:blockAdsAndSuggestions',
          'optimizer:preventAutoBitLocker',
          'optimizer:disableGameBar',
          'optimizer:disableAiAndAds',
          'optimizer:optimizeAudioLatency',
          'optimizer:optimizeGameRoute',
          'optimizer:disableVisualEffects',
          'optimizer:disableMouseAcceleration',
          'optimizer:disableHibernation',
          'optimizer:deepCleanOneDrive',
          'optimizer:removeCapabilities',
          'optimizer:disableServices',
          'optimizer:disableCoreIsolation'
        ]
      }
    };
  }

  listOperations() {
    return Array.from(this.operations.values()).map(op => ({
      id: op.id,
      name: op.name,
      description: op.description,
      technicalDescription: op.technicalDescription,
      category: op.category,
      risk: op.risk,
      requiresAdmin: op.requiresAdmin,
      requiresReboot: op.requiresReboot,
      isReversible: op.isReversible,
      compatibility: op.compatibility,
      estimatedTimeMs: op.estimatedTimeMs
    }));
  }

  listProfiles() {
    return Object.values(this.profiles);
  }

  async analyze(operationIds = []) {
    const ids = Array.isArray(operationIds) ? operationIds : [];
    const items = ids.map(id => this.operations.get(id)).filter(Boolean);
    const requiresAdmin = items.some(op => op.requiresAdmin);
    const requiresReboot = items.some(op => op.requiresReboot);
    const totalEstimatedTimeMs = items.reduce((acc, op) => acc + (op.estimatedTimeMs || 300), 0);
    const riskLevels = {
      safe: items.filter(op => op.risk === 'safe').length,
      moderate: items.filter(op => op.risk === 'moderate').length,
      advanced: items.filter(op => op.risk === 'advanced').length
    };
    return {
      ok: true,
      count: items.length,
      requiresAdmin,
      requiresReboot,
      totalEstimatedTimeMs,
      riskLevels,
      items: items.map(op => ({
        id: op.id,
        name: op.name,
        description: op.description,
        technicalDescription: op.technicalDescription,
        category: op.category,
        risk: op.risk,
        requiresAdmin: op.requiresAdmin,
        requiresReboot: op.requiresReboot,
        isReversible: op.isReversible
      }))
    };
  }

  async checkIsAdmin() {
    try {
      await execAsync('net session');
      return true;
    } catch (e) {
      return false;
    }
  }

  async validateTaskCompatibility(id) {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'O otimizador é compatível apenas com sistemas operacionais Windows.' };
    }
    const op = this.operations.get(id);
    if (!op) return { ok: false, error: `A operação '${id}' não foi encontrada.` };
    return { ok: true };
  }

  async runTasks(ids, concurrency = 1, eventSender) {
    const runId = `run_${Date.now()}`;
    let completed = 0;
    const results = Array(ids.length).fill(null);

    Logger.info('SystemOptimizer', `[START] Iniciando execução em lote: ${runId}. Total: ${ids.length}`);
    eventSender('optimizer:runEvent', { type: 'run-start', runId, total: ids.length, concurrency, startedAt: Date.now() });

    const queue = ids.map((id, index) => ({ id, index }));

    const worker = async () => {
      while (queue.length > 0) {
        const task = queue.shift();
        const start = Date.now();
        const op = this.operations.get(task.id);

        eventSender('optimizer:runEvent', { type: 'op-start', runId, opId: task.id, index: task.index, startedAt: start });

        if (!op) {
          results[task.index] = {
            id: task.id,
            ok: false,
            error: 'Operação não registrada ou obsoleta'
          };
          Logger.auditOptimizer({
            type: 'operation',
            runId,
            opId: task.id,
            ok: false,
            status: 'Error',
            error: 'Operação não registrada ou obsoleta',
            durationMs: Date.now() - start
          });
        } else {
          try {
            Logger.info('SystemOptimizer', `[EXEC] Executando: ${task.id}`);

            const comp = await this.validateTaskCompatibility(task.id);
            if (!comp.ok) {
              throw new Error(comp.error);
            }

            const output = await op.execute(eventSender);
            const durationMs = Date.now() - start;

            const standardOut = {
              ok: output.status === 'Success' || output.status === 'Warning',
              status: output.status || 'Success',
              msg: output.message || 'Operação realizada com sucesso.',
              error: output.error || undefined,
              durationMs,
              affectedResources: output.affectedResources || [],
              processedItems: output.processedItems || 0,
              savingsBytes: output.savingsBytes || 0
            };

            results[task.index] = {
              id: task.id,
              ok: standardOut.ok,
              output: standardOut,
              durationMs
            };

            Logger.info('SystemOptimizer', `[DONE] Concluído: ${task.id} em ${durationMs}ms | Status: ${standardOut.status}`);
            Logger.auditOptimizer({
              type: 'operation',
              runId,
              opId: task.id,
              ok: standardOut.ok,
              status: standardOut.status,
              message: standardOut.message,
              error: standardOut.error,
              durationMs,
              affectedResources: standardOut.affectedResources,
              processedItems: standardOut.processedItems
            });
          } catch (e) {
            const durationMs = Date.now() - start;
            Logger.error('SystemOptimizer', `[FAIL] Falha crítica na tarefa: ${task.id}`, e);
            Logger.auditOptimizer({
              type: 'operation',
              runId,
              opId: task.id,
              ok: false,
              status: 'Error',
              error: e.message,
              durationMs
            });
            results[task.index] = {
              id: task.id,
              ok: false,
              error: e.message
            };
          }
        }

        completed++;
        eventSender('optimizer:runEvent', {
          type: 'op-finish', runId, opId: task.id, index: task.index,
          ok: results[task.index].ok, error: results[task.index].error, completed, total: ids.length, finishedAt: Date.now(), output: results[task.index].output
        });
      }
    };

    const limit = Math.max(1, Math.min(concurrency, ids.length));
    const workers = Array.from({ length: limit }, worker);
    await Promise.all(workers);

    Logger.info('SystemOptimizer', `[FINISH] Execução em lote finalizada: ${runId}`);
    eventSender('optimizer:runEvent', { type: 'run-finish', runId, total: ids.length, completed, finishedAt: Date.now() });
    return { runId, results };
  }
}

export default new SystemOptimizerService();
