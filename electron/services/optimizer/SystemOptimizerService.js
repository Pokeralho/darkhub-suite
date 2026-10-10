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
import { POWER_GUIDS } from './OptimizerUtils.js';

const RISK_FROM_TWEAK = { low: 'safe', medium: 'moderate', high: 'advanced' };
const RISK_ORDER = { safe: 0, moderate: 1, advanced: 2 };

/**
 * Normalises whatever an engine returns ({ok,msg|error} or the standard {status,message}) into the
 * shape runTasks expects. An engine result with ok:false or an error is NEVER reported as success.
 */
export function adaptResult(res, { resources = [], processed = 1 } = {}) {
  const failed = !res || res.ok === false || res.status === 'Error' || Boolean(res.error && res.ok !== true);
  const message = failed ? (res?.error || res?.message || res?.msg || 'Falha desconhecida') : (res.msg || res.message || 'Operação concluída.');
  return {
    status: failed ? 'Error' : (res.status === 'Warning' ? 'Warning' : 'Success'),
    message,
    error: failed ? message : undefined,
    affectedResources: res?.affectedResources?.length ? res.affectedResources : resources,
    processedItems: failed ? 0 : (res?.processedItems ?? processed),
    savingsBytes: res?.savingsBytes || res?.freedBytes || 0,
    requiresReboot: Boolean(res?.requiresReboot || res?.needsReboot),
    verified: res?.verified
  };
}

class SystemOptimizerService {
  constructor() {
    this.operations = new Map();
    this.profiles = {};
    this.registerOperations();
    this.registerReverts();
    this.registerProfiles();
  }

  /** Registers an operation that applies one or more DeepTweaksEngine tweaks (risk/admin/reboot come from the tweak definitions). */
  _tweakOp(def) {
    const defs = def.tweakIds.map((id) => DeepTweaksEngine.getDefinition(id)).filter(Boolean);
    let risk = 'safe';
    for (const d of defs) {
      const r = RISK_FROM_TWEAK[d.risk] || 'safe';
      if (RISK_ORDER[r] > RISK_ORDER[risk]) risk = r;
    }
    const op = {
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 500,
      isReversible: true,
      requiresAdmin: defs.some((d) => d.requiresAdmin),
      requiresReboot: defs.some((d) => d.requiresReboot),
      securityRelated: defs.some((d) => d.securityRelated),
      risk,
      ...def,
      description: def.description || defs.map((d) => d.description).join(' '),
      revert: async () => adaptResult(await DeepTweaksEngine.revertTweaks(def.tweakIds), { resources: def.resources })
    };
    op.execute = async () => adaptResult(await DeepTweaksEngine.applyTweaks(def.tweakIds, () => {}), { resources: def.resources, processed: defs.length });
    this.operations.set(op.id, op);
  }

  _op(def) {
    this.operations.set(def.id, {
      compatibility: 'Windows 10/11',
      estimatedTimeMs: 500,
      requiresReboot: false,
      isReversible: false,
      securityRelated: false,
      ...def
    });
  }

  registerOperations() {
    // ---------------------------------------------------------------- limpeza / memória / energia
    this._op({
      id: 'optimizer:flushDns',
      name: 'Limpar Cache de DNS',
      description: 'Limpa o cache local do resolvedor de DNS (ipconfig /flushdns). Útil se um site não abre após troca de IP; não acelera a internet.',
      technicalDescription: 'Executa "ipconfig /flushdns" e confere o código de saída.',
      category: 'network',
      risk: 'safe',
      requiresAdmin: false,
      estimatedTimeMs: 200,
      execute: async () => adaptResult(await NetworkEngine.flushDns(), { resources: ['DNS Cache'] })
    });

    this._op({
      id: 'optimizer:cleanTemp',
      name: 'Limpar Arquivos Temporários',
      description: 'Apaga arquivos temporários (TEMP do usuário, Windows\\Temp, cache de download do Windows Update, minidumps). Arquivos em uso são ignorados e o espaço liberado é medido de verdade.',
      technicalDescription: 'Varre recursivamente %TEMP%, %WINDIR%\\Temp, SoftwareDistribution\\Download, Minidump e CrashDumps preservando caches de shader. Pastas do sistema podem exigir administrador.',
      category: 'storage',
      risk: 'safe',
      requiresAdmin: false,
      estimatedTimeMs: 1500,
      execute: async () => adaptResult(await StorageEngine.cleanTempFiles(), { resources: ['Temp folders'] })
    });

    this._op({
      id: 'optimizer:optimizeRAM',
      name: 'Liberar Memória RAM (temporário)',
      description: 'Pede ao Windows para devolver páginas ociosas dos processos. A RAM "livre" sobe na hora, mas o Windows já gerencia isso sozinho: o efeito é temporário e os apps podem ficar levemente mais lentos ao voltar a usar a memória.',
      technicalDescription: 'EmptyWorkingSet nos processos acessíveis (exceto críticos do sistema), medindo a memória disponível antes e depois.',
      category: 'memory',
      risk: 'safe',
      requiresAdmin: false,
      estimatedTimeMs: 3000,
      execute: async () => adaptResult(await MemoryEngine.optimizeRAM(), { resources: ['RAM Working Set'] })
    });

    this._op({
      id: 'optimizer:powerPlanHighPerformance',
      name: 'Plano de Energia: Alto Desempenho',
      description: 'Ativa o plano Alto Desempenho (CPU em clocks mais altos). Em notebooks aumenta consumo e calor; não eleva o FPS sozinho. O plano anterior é lembrado.',
      technicalDescription: 'powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c (criado se estiver oculto) e leitura do plano ativo para confirmar.',
      category: 'power',
      risk: 'moderate',
      requiresAdmin: false,
      isReversible: true,
      estimatedTimeMs: 500,
      execute: async () => adaptResult(await PowerEngine.setHighPerformance(), { resources: ['Powercfg'] }),
      revert: async () => adaptResult(await PowerEngine.restorePrevious(), { resources: ['Powercfg'] }),
      statusFn: async () => {
        const g = await PowerEngine._getActiveSchemeGuid();
        return g === POWER_GUIDS.high || g === POWER_GUIDS.ultimate;
      }
    });

    this._op({
      id: 'optimizer:powerPlanBalanced',
      name: 'Plano de Energia: Equilibrado',
      description: 'Ativa o plano Equilibrado (padrão do Windows) e confirma lendo o plano ativo.',
      technicalDescription: 'powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e.',
      category: 'power',
      risk: 'safe',
      requiresAdmin: false,
      isReversible: false,
      estimatedTimeMs: 500,
      execute: async () => adaptResult(await PowerEngine.setBalanced(), { resources: ['Powercfg'] })
    });

    // ---------------------------------------------------------------- privacidade (tweaks verificados + snapshot)
    this._tweakOp({
      id: 'optimizer:disableTelemetry',
      name: 'Reduzir Telemetria ao Mínimo',
      tweakIds: ['tweak:disableTelemetry'],
      technicalDescription: 'Políticas sob DataCollection (AllowTelemetry=0), CEIP e Windows Error Reporting; lido de volta do registro.',
      category: 'privacy',
      resources: ['Windows Registry (Telemetry)'],
      warning: 'Em Windows Home/Pro o nível mínimo é "Obrigatório": a Microsoft ainda coleta o básico.'
    });
    this._tweakOp({
      id: 'optimizer:disableLocation',
      name: 'Desativar Localização (política)',
      tweakIds: ['tweak:disableLocation'],
      technicalDescription: 'Políticas LocationAndSensors: DisableLocation=1.',
      category: 'privacy',
      resources: ['Windows Registry (Location)']
    });
    this._tweakOp({
      id: 'optimizer:disableActivityHistory',
      name: 'Desativar Histórico de Atividades',
      tweakIds: ['tweak:disableActivityHistory'],
      technicalDescription: 'PublishUserActivities, UploadUserActivities e EnableActivityFeed = 0.',
      category: 'privacy',
      resources: ['Windows Registry (ActivityFeed)']
    });
    this._tweakOp({
      id: 'optimizer:disableCortana',
      name: 'Desativar Cortana (política legada)',
      tweakIds: ['tweak:disableCortana'],
      technicalDescription: 'AllowCortana=0 em Policies\\Windows Search.',
      category: 'privacy',
      resources: ['Windows Registry (Cortana)']
    });
    this._tweakOp({
      id: 'optimizer:disableAiAndAds',
      name: 'Desativar Recall (IA), Copilot e Sugestões Web',
      tweakIds: ['tweak:disableAiAndAds'],
      technicalDescription: 'Políticas WindowsAI/WindowsCopilot e sugestões de busca web.',
      category: 'privacy',
      resources: ['Windows Registry (AI)']
    });
    this._tweakOp({
      id: 'optimizer:blockAdsAndSuggestions',
      name: 'Bloquear Anúncios e Sugestões do Windows',
      tweakIds: ['tweak:blockAdsAndSuggestions'],
      technicalDescription: 'Valores do ContentDeliveryManager e ID de publicidade desativados.',
      category: 'privacy',
      resources: ['ContentDeliveryManager']
    });

    // ---------------------------------------------------------------- jogos / áudio / rede
    this._tweakOp({
      id: 'optimizer:disableGameBar',
      name: 'Desativar Gravação em Segundo Plano (Game DVR)',
      tweakIds: ['tweak:disableGameDvr'],
      technicalDescription: 'AppCaptureEnabled=0 e GameDVR_Enabled=0 em HKCU.',
      category: 'gaming',
      resources: ['Windows Registry (GameDVR)']
    });

    this._op({
      id: 'optimizer:optimizeAudioLatency',
      name: 'Garantir Prioridade Alta do Áudio (temporário)',
      description: 'Garante prioridade Alta e todos os núcleos para o audiodg.exe. O Windows já faz isso por padrão, então na maioria dos PCs nada muda; o ajuste dura só até o mecanismo de áudio reiniciar.',
      technicalDescription: 'Lê prioridade/afinidade do audiodg.exe, eleva só se estiver abaixo de Alta, restaura afinidade completa e relê o resultado.',
      category: 'audio',
      risk: 'safe',
      requiresAdmin: true,
      estimatedTimeMs: 1000,
      execute: async () => adaptResult(await MemoryEngine.optimizeAudioLatency(), { resources: ['audiodg.exe'] })
    });

    this._op({
      id: 'optimizer:optimizeGameRoute',
      name: 'Prioridade Multimídia para Jogos (MMCSS)',
      description: 'Remove o limite de rede do agendador multimídia, reduz a reserva de CPU para segundo plano e eleva a tarefa "Games". Efeito pequeno, mais perceptível com muitos apps abertos. Não altera a rota de rede nem o ping.',
      technicalDescription: 'NetworkThrottlingIndex=0xffffffff, SystemResponsiveness=10, Tasks\\Games Priority=6/Scheduling Category=High; snapshot e leitura de volta.',
      category: 'gaming',
      risk: 'moderate',
      requiresAdmin: true,
      isReversible: true,
      estimatedTimeMs: 800,
      tweakIds: ['tweak:mmcssGames'],
      execute: async () => adaptResult(await NetworkEngine.optimizeGameRoute(), { resources: ['Windows Registry (MMCSS)'], processed: 5 }),
      revert: async () => adaptResult(await NetworkEngine.revertGameRoute(), { resources: ['Windows Registry (MMCSS)'] })
    });

    // ---------------------------------------------------------------- serviços / segurança (opt-in, com aviso)
    this._op({
      id: 'optimizer:disableServices',
      name: 'Desativar Serviços Redundantes (WSearch, DiagTrack, CDPSvc, lfsvc)',
      description: 'Desativa a Busca do Windows (indexação), a telemetria DiagTrack, a Plataforma de Dispositivos Conectados e a Geolocalização. A busca de arquivos/e-mails fica mais lenta. O modo original de cada serviço é salvo e restaurado ao reverter.',
      technicalDescription: 'sc.exe config <serviço> start= disabled + stop, conferido via WMI. SysMain e BITS não são tocados.',
      category: 'services',
      risk: 'advanced',
      requiresAdmin: true,
      isReversible: true,
      estimatedTimeMs: 2000,
      warning: 'Altera serviços do Windows. A pesquisa de arquivos e o Outlook ficam mais lentos sem a indexação.',
      execute: async () => adaptResult(await ServicesEngine.applyServicesTweak(), { resources: ['Windows Services (WSearch, DiagTrack, CDPSvc, lfsvc)'], processed: 4 }),
      revert: async () => adaptResult(await ServicesEngine.revertServicesTweak(), { resources: ['Windows Services'] }),
      statusFn: async () => {
        const map = await ServicesEngine.readServices();
        const present = Object.values(map || {});
        return present.length > 0 && present.every((x) => x.startMode === 'Disabled');
      }
    });

    this._op({
      id: 'optimizer:disableCoreIsolation',
      name: 'Modo Hardcore: Desativar VBS / Integridade de Memória  [RISCO DE SEGURANÇA]',
      description: 'Desliga a Segurança Baseada em Virtualização e a Integridade de Memória (HVCI), desativa a hibernação e a atualização de "último acesso" do NTFS. Pode dar ganho de FPS em jogos limitados por CPU (geralmente 0-10%) mas REDUZ a proteção contra malware de kernel. Exige reiniciar.',
      technicalDescription: 'DeviceGuard\\EnableVirtualizationBasedSecurity=0, HypervisorEnforcedCodeIntegrity\\Enabled=0, powercfg /hibernate off, fsutil disablelastaccess=1 (valores anteriores salvos).',
      category: 'security',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: true,
      isReversible: true,
      securityRelated: true,
      estimatedTimeMs: 3000,
      tweakIds: ['tweak:disableVBS', 'tweak:disableHibernation'],
      warning: 'Reduz a proteção do sistema contra malware de kernel. Use apenas se entender o risco.',
      execute: async () => adaptResult(await SystemEngine.applyHardcoreGamerMode(), { resources: ['DeviceGuard / HVCI', 'NTFS', 'Hibernação'], processed: 4 }),
      revert: async () => adaptResult(await SystemEngine.revertHardcoreGamerMode(), { resources: ['DeviceGuard / HVCI'] })
    });

    // ---------------------------------------------------------------- visual / shell
    this._op({
      id: 'optimizer:disableVisualEffects',
      name: 'Efeitos Visuais: Melhor Desempenho',
      description: 'Desativa animações de janelas, transparência de seleção e AeroPeek para o usuário atual. Não precisa de administrador; os valores originais são salvos e restaurados ao reverter. Pode precisar sair e entrar na sessão para valer por completo.',
      technicalDescription: 'VisualFXSetting=2, UserPreferencesMask, MinAnimate, EnableAeroPeek e animações do Explorer (HKCU).',
      category: 'visuals',
      risk: 'safe',
      requiresAdmin: false,
      isReversible: true,
      estimatedTimeMs: 1500,
      tweakIds: ['group:visualEffects'],
      execute: async () => adaptResult(await VisualsEngine.disableVisualEffects(), { resources: ['Windows Explorer / DWM (HKCU)'], processed: 7 }),
      revert: async () => adaptResult(await VisualsEngine.revertVisualEffects(), { resources: ['Windows Explorer / DWM (HKCU)'] })
    });

    this._tweakOp({
      id: 'optimizer:classicContextMenu',
      name: 'Menu de Contexto Clássico (Windows 11)',
      tweakIds: ['tweak:classicContextMenu'],
      technicalDescription: 'Cria HKCU\\Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}\\InprocServer32 (valor padrão vazio); o Explorer é reiniciado uma vez.',
      category: 'system',
      compatibility: 'Windows 11',
      resources: ['Explorer Shell Context Menu']
    });
    this._tweakOp({
      id: 'optimizer:taskbarTweaks',
      name: 'Barra de Tarefas: Esquerda, sem Pesquisa e sem Visão de Tarefas',
      tweakIds: ['tweak:taskbarAlignLeft', 'tweak:hideSearchBox', 'tweak:hideTaskViewButton', 'tweak:taskbarEndTask'],
      description: 'Alinha a barra de tarefas à esquerda, oculta a caixa de pesquisa e o botão Visão de Tarefas e ativa "Finalizar tarefa". São preferências de aparência (Windows 11); não afetam o desempenho.',
      technicalDescription: 'TaskbarAl=0, SearchboxTaskbarMode=0, ShowTaskViewButton=0, TaskbarEndTask=1 (HKCU).',
      category: 'system',
      resources: ['Windows Taskbar Registry']
    });
    this._tweakOp({
      id: 'optimizer:taskbarEndTask',
      name: 'Habilitar "Finalizar Tarefa" na Barra de Tarefas',
      tweakIds: ['tweak:taskbarEndTask'],
      technicalDescription: 'TaskbarEndTask=1 em Explorer\\Advanced\\TaskbarDeveloperSettings (Windows 11 23H2+).',
      category: 'system',
      compatibility: 'Windows 11',
      resources: ['Taskbar Developer Settings']
    });
    this._tweakOp({
      id: 'optimizer:darkModeAndColors',
      name: 'Modo Escuro no Sistema e Aplicativos',
      tweakIds: ['tweak:darkModeAndColors'],
      technicalDescription: 'SystemUsesLightTheme=0, AppsUseLightTheme=0, ColorPrevalence e EnableTransparency.',
      category: 'system',
      resources: ['Windows Personalize Registry']
    });
    this._tweakOp({
      id: 'optimizer:explorerTweaks',
      name: 'Explorador: Este Computador, Extensões e Itens Ocultos',
      tweakIds: ['tweak:explorerOpenThisPC', 'tweak:showFileExtensions', 'tweak:showHiddenFiles', 'tweak:explorerCompactMode'],
      description: 'Abre o Explorador em "Este Computador", mostra extensões de arquivo, mostra itens ocultos E protegidos do sistema e usa o modo compacto. São preferências, não otimizações de desempenho.',
      technicalDescription: 'LaunchTo=1, HideFileExt=0, Hidden=1, ShowSuperHidden=1, UseCompactMode=1.',
      category: 'system',
      resources: ['Explorer Advanced Registry']
    });
    this._tweakOp({
      id: 'optimizer:edgeOptimizations',
      name: 'Microsoft Edge: Sem Execução em Segundo Plano',
      tweakIds: ['tweak:edgeOptimizations'],
      technicalDescription: 'Políticas do Edge: BackgroundModeEnabled=0, StartupBoostEnabled=0, HideFirstRunExperience=1.',
      category: 'system',
      resources: ['Edge Policies']
    });
    this._tweakOp({
      id: 'optimizer:disableMouseAcceleration',
      name: 'Desativar Aceleração do Mouse (precisão do ponteiro)',
      tweakIds: ['tweak:disableMouseAcceleration'],
      technicalDescription: 'MouseSpeed=0, MouseThreshold1/2=0 e aplicado ao vivo (SPI_SETMOUSE). Jogos com entrada bruta (raw input) já ignoram a aceleração do Windows.',
      category: 'gaming',
      resources: ['Control Panel\\Mouse']
    });
    this._tweakOp({
      id: 'optimizer:preventAutoBitLocker',
      name: 'Impedir Criptografia Automática do Dispositivo (BitLocker)',
      tweakIds: ['tweak:preventAutoBitLocker'],
      technicalDescription: 'PreventDeviceEncryption=1 em HKLM\\SYSTEM\\CurrentControlSet\\Control\\BitLocker. Não descriptografa discos já protegidos.',
      category: 'system',
      warning: 'Reduz a proteção dos seus dados em caso de perda ou roubo do aparelho.',
      resources: ['BitLocker Control']
    });

    // ---------------------------------------------------------------- armazenamento / componentes
    this._tweakOp({
      id: 'optimizer:disableHibernation',
      name: 'Desativar Hibernação (liberar espaço do hiberfil.sys)',
      tweakIds: ['tweak:disableHibernation'],
      risk: 'moderate',
      technicalDescription: 'powercfg /hibernate off; estado lido de HibernateEnabled. Desativa também a Inicialização Rápida.',
      category: 'storage',
      resources: ['hiberfil.sys']
    });

    this._op({
      id: 'optimizer:deepCleanOneDrive',
      name: 'Desinstalar OneDrive',
      description: 'Encerra e desinstala o OneDrive pelo desinstalador oficial e remove a inicialização automática. Seus arquivos locais são mantidos, mas arquivos "somente online" deixam de poder ser baixados. Nenhum arquivo do Windows é apagado.',
      technicalDescription: 'OneDriveSetup.exe /uninstall, remoção de Run\\OneDrive e verificação dos executáveis.',
      category: 'storage',
      risk: 'moderate',
      requiresAdmin: false,
      isReversible: false,
      estimatedTimeMs: 20000,
      warning: 'Irreversível pelo app: para voltar a usar o OneDrive é preciso reinstalá-lo.',
      execute: async () => adaptResult(await SystemEngine.deepCleanOneDrive(), { resources: ['OneDrive'] })
    });

    this._op({
      id: 'optimizer:removeCapabilities',
      name: 'Remover Recursos Opcionais Legados & Recall',
      description: 'Remove componentes opcionais (Windows Hello Face, Assistência Rápida, WordPad, sincronização OneSync) e o Recall quando existir. Atenção: remover o Hello Face desativa o login por reconhecimento facial. Só remove o que está instalado e informa o que foi feito.',
      technicalDescription: 'Remove-WindowsCapability / Disable-WindowsOptionalFeature (Recall); reinstalável pelo botão Reverter (requer internet).',
      category: 'system',
      risk: 'moderate',
      requiresAdmin: true,
      isReversible: true,
      estimatedTimeMs: 60000,
      warning: 'Remove o login por reconhecimento facial e outros componentes. A reinstalação precisa de internet.',
      execute: async () => adaptResult(await SystemEngine.removeCapabilitiesAndRecall(), { resources: ['Windows Capabilities'] }),
      revert: async () => adaptResult(await SystemEngine.restoreCapabilities(), { resources: ['Windows Capabilities'] }),
      statusExtra: 'sys:capabilities'
    });

    // ---------------------------------------------------------------- latência avançada (antes só acessíveis por atalhos soltos)
    this._op({
      id: 'optimizer:kernelExtreme',
      name: 'Kernel e Latência: prioridade de primeiro plano, MMCSS, NTFS e timer',
      description: 'Win32PrioritySeparation=0x26, DisablePagingExecutive, perfil MMCSS de jogos, atualização de "último acesso" do NTFS desligada e dynamic tick desligado (exige reiniciar). Ganhos reais, porém pequenos; DisablePagingExecutive mantém o kernel na RAM (use com 16 GB ou mais). Todos os valores anteriores são salvos.',
      technicalDescription: 'PriorityControl\\Win32PrioritySeparation=38, Memory Management\\DisablePagingExecutive=1, MMCSS Games, fsutil disablelastaccess=1, bcdedit disabledynamictick=yes.',
      category: 'gaming',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: true,
      isReversible: true,
      estimatedTimeMs: 5000,
      tweakIds: ['group:kernelCore', 'tweak:mmcssGames'],
      warning: 'Altera o agendador e o gerenciamento de memória do Windows. Reinicie para concluir.',
      execute: async () => adaptResult(await SystemEngine.applyExtremeKernelMod(), { resources: ['Kernel / MMCSS / NTFS / BCD'], processed: 8 }),
      revert: async () => adaptResult(await SystemEngine.revertExtremeKernelMod(), { resources: ['Kernel / MMCSS / NTFS / BCD'] })
    });

    this._op({
      id: 'optimizer:timerTuning',
      name: 'Timer: desativar dynamic tick (BCD)',
      description: 'bcdedit /set disabledynamictick yes. Mantém os ticks do timer constantes; pode reduzir jitter em alguns PCs e aumentar o consumo em repouso. Exige reiniciar. Não altera a "resolução do timer" por si só.',
      technicalDescription: 'bcdedit.exe /set disabledynamictick yes, com o valor anterior salvo e conferido.',
      category: 'gaming',
      risk: 'moderate',
      requiresAdmin: true,
      requiresReboot: true,
      isReversible: true,
      estimatedTimeMs: 2500,
      statusExtra: 'sys:bcd',
      execute: async () => adaptResult(await SystemEngine.applyTimerTuning(), { resources: ['BCD'] }),
      revert: async () => adaptResult(await SystemEngine.revertTimerTuning(), { resources: ['BCD'] })
    });

    this._op({
      id: 'optimizer:networkExtreme',
      name: 'Pilha TCP: RSC desligado, RSS ligado, timestamps off',
      description: 'Desliga o Receive Segment Coalescing (menos latência por pacote, um pouco mais de CPU), garante RSS ligado, timestamps TCP desligados e autotuning normal. Não aumenta a velocidade da internet; efeito pequeno no ping.',
      technicalDescription: 'Set-NetOffloadGlobalSetting -ReceiveSegmentCoalescing Disabled; Set-NetTCPSetting -SettingName InternetCustom -Timestamps Disabled -AutoTuningLevelLocal Normal; conferido por leitura e restaurável.',
      category: 'network',
      risk: 'moderate',
      requiresAdmin: true,
      isReversible: true,
      estimatedTimeMs: 2500,
      statusExtra: 'sys:networkExtreme',
      execute: async () => adaptResult(await SystemEngine.applyExtremeNetworkMod(), { resources: ['TCP global settings'] }),
      revert: async () => adaptResult(await SystemEngine.revertExtremeNetworkMod(), { resources: ['TCP global settings'] })
    });

    this._op({
      id: 'optimizer:advancedNetwork',
      name: 'Rede: TCP NoDelay/AckFrequency por adaptador, EEE off, QoS',
      description: 'TcpAckFrequency=1 e TCPNoDelay=1 na interface de cada adaptador ativo (reduz a latência de pacotes pequenos), Energy-Efficient Ethernet desligado e a política de QoS NonBestEffortLimit=0 (sem efeito prático no Windows moderno). NÃO aumenta a velocidade da internet.',
      technicalDescription: 'HKLM\\...\\Tcpip\\Parameters\\Interfaces\\{GUID}: TcpAckFrequency/TCPNoDelay; *EEE via Set-NetAdapterAdvancedProperty; Psched NonBestEffortLimit=0.',
      category: 'network',
      risk: 'moderate',
      requiresAdmin: true,
      isReversible: true,
      estimatedTimeMs: 4000,
      statusKey: 'network:advanced',
      execute: async () => adaptResult(await NetworkEngine.advancedNetworkApply(), { resources: ['TCP interfaces / EEE'] }),
      revert: async () => adaptResult(await NetworkEngine.advancedNetworkRevert(), { resources: ['TCP interfaces / EEE'] })
    });

    this._op({
      id: 'optimizer:cpuUnpark',
      name: 'CPU: manter todos os núcleos ativos (plano atual, na tomada)',
      description: 'Define o mínimo de núcleos ativos em 100% no plano de energia atual quando ligado na tomada. Vale só para o plano ativo; aumenta consumo e calor e costuma ter ganho mínimo em CPUs/Windows modernos.',
      technicalDescription: 'powercfg /setacvalueindex <plano> SUB_PROCESSOR CPMINCORES 100 (+CPMAXCORES), valores anteriores salvos.',
      category: 'power',
      risk: 'moderate',
      requiresAdmin: true,
      isReversible: true,
      estimatedTimeMs: 2000,
      statusExtra: 'sys:cpuUnpark',
      execute: async () => adaptResult(await SystemEngine.applyCpuUnpark(), { resources: ['Powercfg (processador)'] }),
      revert: async () => adaptResult(await SystemEngine.revertCpuUnpark(), { resources: ['Powercfg (processador)'] })
    });

    this._op({
      id: 'optimizer:msiMode',
      name: 'Modo MSI para a(s) GPU(s)  [AVANÇADO]',
      description: 'Ativa interrupções sinalizadas por mensagem (MSISupported=1) somente nas placas de vídeo PCI. Muitas GPUs modernas já usam MSI; o ganho é pequeno. Exige reiniciar. Se houver tela preta ou instabilidade, use Reverter (ou o modo de segurança).',
      technicalDescription: 'HKLM\\SYSTEM\\CurrentControlSet\\Enum\\PCI\\...\\Interrupt Management\\MessageSignaledInterruptProperties\\MSISupported=1, apenas para a classe Display.',
      category: 'gaming',
      risk: 'advanced',
      requiresAdmin: true,
      requiresReboot: true,
      isReversible: true,
      estimatedTimeMs: 3000,
      statusKey: 'msi:display',
      warning: 'Mexe em configurações de interrupção do driver de vídeo. Crie um ponto de restauração antes.',
      execute: async () => adaptResult(await SystemEngine.applyMsiMode(), { resources: ['GPU interrupt settings'] }),
      revert: async () => adaptResult(await SystemEngine.revertMsiMode(), { resources: ['GPU interrupt settings'] })
    });
  }

  /** Every operation with a revert() gets a companion "Reverter: ..." operation that the UI can run through the same channel. */
  registerReverts() {
    for (const op of Array.from(this.operations.values())) {
      if (typeof op.revert !== 'function' || op.isRevert) continue;
      const revertId = op.id.replace('optimizer:', 'optimizer:revert:');
      this.operations.set(revertId, {
        id: revertId,
        name: `Reverter: ${op.name}`,
        description: `Desfaz "${op.name}" restaurando os valores que existiam antes (snapshot) ou os padrões do Windows quando não há snapshot.`,
        technicalDescription: 'Restauração baseada em snapshot com verificação por leitura de volta.',
        category: op.category,
        risk: 'safe',
        requiresAdmin: op.requiresAdmin,
        requiresReboot: op.requiresReboot,
        isReversible: false,
        securityRelated: false,
        compatibility: op.compatibility,
        estimatedTimeMs: op.estimatedTimeMs,
        isRevert: true,
        revertOf: op.id,
        execute: async () => op.revert()
      });
      op.revertId = revertId;
    }
  }

  registerProfiles() {
    const safe = [
      'optimizer:cleanTemp',
      'optimizer:flushDns',
      'optimizer:optimizeRAM',
      'optimizer:classicContextMenu',
      'optimizer:taskbarTweaks',
      'optimizer:darkModeAndColors',
      'optimizer:explorerTweaks'
    ];
    const recommended = [
      ...safe,
      'optimizer:disableActivityHistory',
      'optimizer:disableCortana',
      'optimizer:edgeOptimizations',
      'optimizer:blockAdsAndSuggestions'
    ];
    const gaming = [
      ...recommended,
      'optimizer:disableGameBar',
      'optimizer:optimizeGameRoute',
      'optimizer:optimizeAudioLatency',
      'optimizer:disableVisualEffects',
      'optimizer:disableMouseAcceleration'
    ];
    const advanced = [
      ...gaming,
      'optimizer:disableTelemetry',
      'optimizer:disableLocation',
      'optimizer:disableAiAndAds',
      'optimizer:disableHibernation',
      'optimizer:preventAutoBitLocker',
      'optimizer:deepCleanOneDrive',
      'optimizer:removeCapabilities',
      'optimizer:disableServices',
      'optimizer:disableCoreIsolation'
    ];
    const lowLatency = [
      'optimizer:kernelExtreme',
      'optimizer:networkExtreme',
      'optimizer:advancedNetwork',
      'optimizer:cpuUnpark'
    ];
    this.profiles = {
      safe: {
        id: 'safe',
        name: 'Perfil Seguro',
        description: 'Limpezas básicas, liberação de RAM e preferências visuais reversíveis (menu clássico, barra de tarefas, modo escuro, Explorador). Nada de segurança, serviços ou privacidade é alterado.',
        risk: 'safe',
        tweakIds: safe
      },
      recommended: {
        id: 'recommended',
        name: 'Perfil Recomendado (Produtividade & Privacidade básica)',
        description: 'Perfil Seguro + histórico de atividades, Cortana legada, Edge em segundo plano e anúncios do Windows. Não inclui telemetria, localização, BitLocker, serviços nem VBS.',
        risk: 'safe',
        tweakIds: recommended
      },
      gaming: {
        id: 'gaming',
        name: 'Perfil Jogos',
        description: 'Perfil Recomendado + Game DVR off, prioridade multimídia (MMCSS), áudio, efeitos visuais leves e mouse sem aceleração. Não toca em VBS, serviços, hibernação nem privacidade avançada.',
        risk: 'moderate',
        tweakIds: gaming
      },
      advanced: {
        id: 'advanced',
        name: 'Perfil Avançado (Hardcore) - exige confirmação',
        description: 'Perfil Jogos + telemetria, localização, IA/Recall, hibernação, BitLocker automático, desinstalar OneDrive, remover recursos legados, desativar serviços e desligar VBS/Integridade de Memória. REDUZ a segurança; cada item tem seu próprio aviso.',
        risk: 'advanced',
        tweakIds: advanced
      },
      lowLatency: {
        id: 'lowLatency',
        name: 'Baixa Latência (Avançado, exige reiniciar)',
        description: 'Kernel/MMCSS/NTFS/timer, pilha TCP, ajustes de rede por adaptador e núcleos sempre ativos. Ganhos pequenos; cada item é reversível e verificado. Não inclui VBS, serviços nem Defender. MSI e timer ficam como itens separados.',
        risk: 'moderate',
        tweakIds: lowLatency
      }
    };
  }

  _publicOp(op) {
    return {
      id: op.id,
      name: op.name,
      description: op.description,
      technicalDescription: op.technicalDescription,
      category: op.category,
      risk: op.risk,
      requiresAdmin: op.requiresAdmin,
      requiresReboot: op.requiresReboot,
      isReversible: op.isReversible,
      securityRelated: Boolean(op.securityRelated),
      warning: op.warning || null,
      tweakIds: op.tweakIds || [],
      revertId: op.revertId || null,
      isRevert: Boolean(op.isRevert),
      revertOf: op.revertOf || null,
      compatibility: op.compatibility,
      estimatedTimeMs: op.estimatedTimeMs
    };
  }

  /** applied: true/false from the REAL system state when it can be known, null for one-shot actions. */
  async _appliedState(op, statusMap) {
    try {
      if (op.isRevert) return null;
      if (op.statusFn) return await op.statusFn();
      if (op.statusExtra) return Boolean(DeepTweaksEngine.getExtra(op.statusExtra));
      if (op.statusKey) return statusMap ? Boolean(statusMap.status?.[op.statusKey]) : null;
      if (op.tweakIds?.length && statusMap?.ok) return op.tweakIds.every((id) => Boolean(statusMap.status?.[id]));
    } catch (e) {
      Logger.warn('SystemOptimizer', `Falha ao ler o estado de ${op.id}`, e);
    }
    return null;
  }

  listOperations() {
    const ops = Array.from(this.operations.values());
    return ops.map((op) => ({
      ...this._publicOp(op),
      applied: null,
      partial: false
    }));
  }

  async checkOperationsStatus() {
    let statusMap = null;
    try { statusMap = await DeepTweaksEngine.checkTweaksStatus(); } catch { statusMap = null; }
    const ops = Array.from(this.operations.values());
    const applied = await Promise.all(ops.map((op) => this._appliedState(op, statusMap)));
    const status = {};
    const partial = {};
    ops.forEach((op, i) => {
      status[op.id] = applied[i];
      partial[op.id] = Boolean(op.tweakIds?.length && applied[i] === false && op.tweakIds.some((id) => statusMap?.partial?.[id] || statusMap?.status?.[id]));
    });
    return {
      ok: true,
      status,
      partial,
      deepStatus: statusMap?.status || {},
      deepPartial: statusMap?.partial || {}
    };
  }

  listProfiles() {
    return Object.values(this.profiles);
  }

  async analyze(operationIds = []) {
    const ids = Array.isArray(operationIds) ? operationIds : [];
    const items = ids.map((id) => this.operations.get(id)).filter(Boolean);
    const requiresAdmin = items.some((op) => op.requiresAdmin);
    const requiresReboot = items.some((op) => op.requiresReboot);
    const totalEstimatedTimeMs = items.reduce((acc, op) => acc + (op.estimatedTimeMs || 300), 0);
    const riskLevels = {
      safe: items.filter((op) => op.risk === 'safe').length,
      moderate: items.filter((op) => op.risk === 'moderate').length,
      advanced: items.filter((op) => op.risk === 'advanced').length
    };
    return {
      ok: true,
      count: items.length,
      requiresAdmin,
      requiresReboot,
      totalEstimatedTimeMs,
      riskLevels,
      securityRelated: items.filter((op) => op.securityRelated).map((op) => op.id),
      irreversible: items.filter((op) => !op.isReversible && !op.isRevert).map((op) => op.id),
      items: items.map((op) => this._publicOp(op))
    };
  }

  async checkIsAdmin() {
    try {
      return await ElevationHelper.isElevated();
    } catch {
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

  /**
   * Runs operations ONE AT A TIME. They share the snapshot store, may need a UAC prompt and several touch the same
   * registry keys, so the previous parallel execution (concurrency > 1) could corrupt snapshots or stack UAC prompts.
   * The `concurrency` argument is kept for API compatibility and ignored.
   */
  async runTasks(ids, _concurrency = 1, eventSender = () => {}) {
    const list = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string');
    const runId = `run_${Date.now()}`;
    let completed = 0;
    let okCount = 0;
    const results = Array(list.length).fill(null);

    Logger.info('SystemOptimizer', `[START] Iniciando execução em lote: ${runId}. Total: ${list.length}`);
    eventSender('optimizer:runEvent', { type: 'run-start', runId, total: list.length, concurrency: 1, startedAt: Date.now() });

    for (let index = 0; index < list.length; index += 1) {
      const id = list[index];
      const start = Date.now();
      const op = this.operations.get(id);
      eventSender('optimizer:runEvent', { type: 'op-start', runId, opId: id, index, startedAt: start });

      if (!op) {
        results[index] = { id, ok: false, error: 'Operação não registrada ou obsoleta' };
        Logger.auditOptimizer({ type: 'operation', runId, opId: id, ok: false, status: 'Error', error: 'Operação não registrada ou obsoleta', durationMs: Date.now() - start });
      } else {
        try {
          Logger.info('SystemOptimizer', `[EXEC] Executando: ${id}`);
          const comp = await this.validateTaskCompatibility(id);
          if (!comp.ok) throw new Error(comp.error);

          const raw = await op.execute(eventSender);
          const output = raw && raw.status ? raw : adaptResult(raw);
          const durationMs = Date.now() - start;
          const standardOut = {
            ok: output.status === 'Success' || output.status === 'Warning',
            status: output.status || 'Success',
            msg: output.message || 'Operação realizada com sucesso.',
            error: output.error || undefined,
            durationMs,
            affectedResources: output.affectedResources || [],
            processedItems: output.processedItems || 0,
            savingsBytes: output.savingsBytes || 0,
            requiresReboot: Boolean(output.requiresReboot),
            verified: output.verified
          };
          results[index] = { id, ok: standardOut.ok, error: standardOut.error, output: standardOut, durationMs };
          Logger.info('SystemOptimizer', `[DONE] Concluído: ${id} em ${durationMs}ms | Status: ${standardOut.status}`);
          Logger.auditOptimizer({ type: 'operation', runId, opId: id, ok: standardOut.ok, status: standardOut.status, message: standardOut.msg, error: standardOut.error, durationMs, affectedResources: standardOut.affectedResources, processedItems: standardOut.processedItems });
        } catch (e) {
          const durationMs = Date.now() - start;
          Logger.error('SystemOptimizer', `[FAIL] Falha crítica na tarefa: ${id}`, e);
          Logger.auditOptimizer({ type: 'operation', runId, opId: id, ok: false, status: 'Error', error: e.message, durationMs });
          results[index] = { id, ok: false, error: e.message };
        }
      }

      completed += 1;
      if (results[index].ok) okCount += 1;
      eventSender('optimizer:runEvent', {
        type: 'op-finish', runId, opId: id, index,
        ok: results[index].ok, error: results[index].error, completed, total: list.length, finishedAt: Date.now(), output: results[index].output
      });
    }

    Logger.info('SystemOptimizer', `[FINISH] Execução em lote finalizada: ${runId} (${okCount}/${list.length} ok)`);
    eventSender('optimizer:runEvent', { type: 'run-finish', runId, total: list.length, completed, ok: okCount, failed: list.length - okCount, finishedAt: Date.now() });
    return { runId, results };
  }
}

export default new SystemOptimizerService();
