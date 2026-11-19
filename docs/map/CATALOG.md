<!-- GERADO por electron_feature_map.py em 2026-11-18T20:02:22. NAO edite a mao: rode `npm run map`. -->

# Catalogo de operacoes registradas (132)

Cada item do Otimizador/tweaks/etc. com o arquivo e a linha onde e definido e a funcao que ele executa.

## `electron/services/optimizer/DeepTweaksEngine.js`

| id | nome | categoria | risco | linha | executa |
|---|---|---|---|---|---|
| `tweak:taskbarAlignLeft` | Alinhar Barra de Tarefas à Esquerda | customization |  | 70 | `registro: TaskbarAl` |
| `tweak:taskbarEndTask` | Habilitar "Finalizar Tarefa" na Barra de Tarefas | customization |  | 76 | `registro: TaskbarEndTask` |
| `tweak:hideSearchBox` | Ocultar Caixa de Pesquisa da Barra de Tarefas | customization |  | 82 | `registro: SearchboxTaskbarMode` |
| `tweak:hideTaskViewButton` | Ocultar Botão Visão de Tarefas (Task View) | customization |  | 88 | `registro: ShowTaskViewButton` |
| `tweak:hideCopilotButton` | Ocultar Botão do Copilot na Barra de Tarefas | customization |  | 94 | `registro: ShowCopilotButton` |
| `tweak:showSecondsInClock` | Exibir Segundos no Relógio da Barra de Tarefas | customization |  | 100 | `registro: ShowSecondsInSystemClock` |
| `tweak:classicContextMenu` | Menu de Contexto Clássico (estilo Windows 10) | customization |  | 108 |  |
| `tweak:explorerOpenThisPC` | Abrir Explorador no "Este Computador" | customization |  | 115 | `registro: LaunchTo` |
| `tweak:showFileExtensions` | Exibir Extensões de Arquivos Conhecidos | customization |  | 121 | `registro: HideFileExt` |
| `tweak:showHiddenFiles` | Exibir Arquivos Ocultos e Protegidos do Sistema | customization |  | 127 | `registro: Hidden, ShowSuperHidden` |
| `tweak:explorerCompactMode` | Modo de Exibição Compacto no Explorador | customization |  | 133 | `registro: UseCompactMode` |
| `tweak:addCopyMoveToContextMenu` | Adicionar "Copiar Para" e "Mover Para" no Menu de Contexto | customization |  | 139 |  |
| `tweak:desktopIcons` | Exibir Ícones Essenciais na Área de Trabalho | customization |  | 154 |  |
| `tweak:darkModeAndColors` | Modo Escuro Completo no Sistema e Aplicativos | customization |  | 161 | `registro: SystemUsesLightTheme, AppsUseLightTheme, EnableTransparency` |
| `tweak:disableAeroShake` | Desativar Aero Shake (Chacoalhar Janelas) | customization |  | 171 | `registro: DisallowShaking` |
| `tweak:disableLockscreenBlur` | Desativar Desfoque na Tela de Login | customization |  | 177 | `registro: DisableAcrylicBackgroundOnLogon` |
| `tweak:hideHomeGallery` | Remover "Início" e "Galeria" do Explorador | customization |  | 589 | `registro: System.IsPinnedToNameSpaceTree` |
| `tweak:disableFolderDiscovery` | Explorador mais rápido em pastas grandes (sem detecção de tipo de pasta) | customization |  | 598 | `registro: FolderType` |
| `tweak:classicStartMenu` | Menu Iniciar anterior (antes do novo layout do 25H2) | customization |  | 604 | `registro: EnabledState` |
| `tweak:disableLockScreen` | Pular a tela de bloqueio (ir direto para a senha) | customization |  | 610 | `registro: NoLockScreen` |
| `tweak:hideSettingsHome` | Ocultar a página "Início" do app Configurações | customization |  | 616 | `registro: SettingsPageVisibility` |
| `tweak:batteryPercentage` | Porcentagem da bateria na barra de tarefas | customization |  | 622 | `registro: IsBatteryPercentageEnabled` |
| `tweak:scrollbarsAlwaysVisible` | Barras de rolagem sempre visíveis | customization |  | 628 | `registro: DynamicScrollbars` |
| `tweak:disableWindowSnapping` | Desativar o encaixe automático de janelas (Snap) | customization |  | 634 | `registro: WindowArrangementActive` |
| `tweak:numLockOnStartup` | Num Lock ligado ao iniciar | customization |  | 640 | `registro: InitialKeyboardIndicators` |
| `tweak:disableGameDvr` | Desativar Xbox Game DVR / Gravação em Segundo Plano | gaming |  | 255 | `registro: AppCaptureEnabled, GameDVR_Enabled` |
| `tweak:mmcssGames` | Prioridade Multimídia (MMCSS) para Jogos | gaming |  | 264 | `registro: NetworkThrottlingIndex, SystemResponsiveness, Priority, Scheduling Category, SFIO Priority` |
| `tweak:disableMouseAcceleration` | Desativar Aceleração do Mouse ("Aprimorar precisão do ponteiro") | gaming |  | 276 | `registro: MouseSpeed, MouseThreshold1, MouseThreshold2` |
| `tweak:disableStickyKeys` | Desativar Atalho das Teclas de Aderência (Shift 5x) | gaming |  | 286 | `registro: Flags` |
| `tweak:disableVBS` | Desativar VBS / Isolamento de Núcleo (HVCI)  [RISCO DE SEGURANÇA] | gaming | high | 292 | `registro: EnableVirtualizationBasedSecurity, Enabled` |
| `tweak:disableMpo` | Desativar Multiplane Overlay (MPO) | gaming |  | 359 | `registro: OverlayTestMode` |
| `group:hags` | HAGS (Agendamento de GPU acelerado por hardware) | gaming |  | 704 | `registro: HwSchMode` |
| `tweak:preferIPv4` | Preferir IPv4 em vez de IPv6 | network |  | 367 | `registro: DisabledComponents` |
| `tweak:disableIPv6` | Desativar IPv6 | network | medium | 373 | `registro: DisabledComponents` |
| `tweak:disableTeredo` | Desativar túnel Teredo | network |  | 380 | `registro: Teredo_State` |
| `tweak:standbyNetworkOff` | Sem rede durante a suspensão moderna (notebooks) | power |  | 393 | `registro: DCSettingIndex, ACSettingIndex` |
| `tweak:s3Sleep` | Usar suspensão S3 clássica em vez do Modern Standby | power | medium | 402 | `registro: PlatformAoAcOverride` |
| `tweak:disableTelemetry` | Reduzir Telemetria da Microsoft ao Mínimo | privacy | medium | 185 | `registro: AllowTelemetry, CEIPEnable` |
| `tweak:disableAiAndAds` | Desativar Recall (IA), Copilot e Sugestões Web na Pesquisa | privacy | medium | 195 | `registro: DisableAIDataAnalysis, AllowCloudSearch, BingSearchEnabled, DisableSearchBoxSuggestions, TurnOffWindowsCopilot` |
| `tweak:disableCortana` | Desativar Assistente Cortana (política legada) | privacy |  | 209 | `registro: AllowCortana` |
| `tweak:disableActivityHistory` | Desativar Histórico de Atividades (Timeline) | privacy |  | 215 | `registro: EnableActivityFeed, PublishUserActivities, UploadUserActivities` |
| `tweak:disableLocation` | Desativar Rastreamento de Localização (política) | privacy | medium | 221 | `registro: DisableLocation` |
| `tweak:disableDeliveryOptimization` | Desativar Otimização de Entrega P2P | privacy |  | 228 | `registro: DODownloadMode` |
| `tweak:disableErrorReporting` | Desativar Relatório de Erros do Windows | privacy |  | 234 | `registro: Disabled` |
| `tweak:blockAdsAndSuggestions` | Bloqueio de Anúncios e Sugestões do Windows | privacy |  | 240 | `registro: SystemPaneSuggestionsEnabled, SoftLandingEnabled, RotatingLockScreenEnabled, RotatingLockScreenOverlayEnabled, SubscribedContent-338388Enabled, SubscribedContent-338389Enabled, SubscribedContent-353694Enabled, SubscribedContent-353696Enabled, Enabled, TailoredExperiencesWithDiagnosticDataEnabled` |
| `tweak:disableStoreSearchResults` | Sem sugestões da Microsoft Store na pesquisa do Iniciar | privacy |  | 411 |  |
| `tweak:disableNotifications` | Desativar Central de Notificações e notificações pop-up | privacy |  | 434 | `registro: DisableNotificationCenter, ToastEnabled` |
| `tweak:blockDeviceMetadata` | Bloquear apps de fabricante baixados ao conectar dispositivos | privacy |  | 443 | `registro: PreventDeviceMetadataFromNetwork` |
| `tweak:blockPeripheralBloat` | Bloquear instalação automática do Razer Synapse e do Logi Download Assistant | privacy |  | 449 | `registro: DisableCoInstallers` |
| `tweak:disableWpbt` | Impedir que o firmware instale programas no Windows (WPBT) | privacy |  | 468 | `registro: DisableWpbtExecution` |
| `tweak:braveDebloat` | Brave sem Rewards, carteira cripto, VPN, IA e telemetria | privacy |  | 474 | `registro: BraveRewardsDisabled, BraveWalletDisabled, BraveVPNDisabled, BraveAIChatEnabled, BraveNewsDisabled, BraveTalkDisabled, TorDisabled, BraveStatsPingEnabled, BraveP3AEnabled, MetricsReportingEnabled, UrlKeyedAnonymizedDataCollectionEnabled, SafeBrowsingExtendedReportingEnabled` |
| `tweak:keepClassicOutlook` | Manter o Outlook clássico (sem migração para o "novo Outlook") | privacy |  | 488 | `registro: UseNewOutlook, HideNewOutlookToggle, DoNewOutlookAutoMigration, NewOutlookMigrationUserSetting` |
| `group:defenderPolicy` | Políticas do Microsoft Defender (desativação) | security | high | 695 | `registro: DisableAntiSpyware, DisableRealtimeMonitoring` |
| `tweak:disableHibernation` | Desativar Hibernação (apaga hiberfil.sys) | storage |  | 303 |  |
| `tweak:preventAutoBitLocker` | Impedir Criptografia Automática de Dispositivo (BitLocker)  [SEGURANÇA] | storage | medium | 315 | `registro: PreventDeviceEncryption` |
| `tweak:disableStorageSense` | Desativar o Sensor de Armazenamento | storage |  | 501 | `registro: 01` |
| `tweak:disableReservedStorage` | Liberar o Armazenamento Reservado (~7 GB) | storage |  | 507 |  |
| `tweak:disableFastStartup` | Desativar Inicialização Rápida (Fast Startup) | system |  | 321 | `registro: HiberbootEnabled` |
| `tweak:setUtcTime` | Relógio do Hardware em UTC (somente dual boot com Linux) | system | medium | 327 | `registro: RealTimeIsUniversal` |
| `tweak:disableBackgroundApps` | Bloquear Aplicativos UWP em Segundo Plano | system |  | 334 | `registro: GlobalUserDisabled, LetAppsRunInBackground` |
| `tweak:edgeOptimizations` | Otimização do Microsoft Edge (políticas) | system |  | 343 | `registro: BackgroundModeEnabled, StartupBoostEnabled, HideFirstRunExperience` |
| `tweak:longPaths` | Permitir caminhos de arquivo com mais de 260 caracteres | system |  | 534 | `registro: LongPathsEnabled` |
| `tweak:registryBackup` | Backup automático do registro (RegBack) | system |  | 540 | `registro: EnablePeriodicBackup` |
| `tweak:detailedBsod` | Tela azul (BSOD) com detalhes técnicos | system |  | 546 | `registro: DisplayParameters, DisableEmoticon` |
| `tweak:verboseLogon` | Mensagens detalhadas ao iniciar e desligar | system |  | 555 | `registro: VerboseStatus` |
| `tweak:legacyBootMenu` | Menu de boot clássico (F8 / Modo de Segurança) | system |  | 561 |  |
| `tweak:ntpPool` | Sincronizar o relógio com pool.ntp.org | system |  | 577 | `registro: NtpServer` |
| `tweak:rdpUnsignedNoWarning` | Sem aviso ao abrir arquivos .rdp não assinados  [SEGURANÇA] | system | medium | 651 | `registro: RedirectionWarningDialogVersion, RdpLaunchConsentAccepted` |
| `group:kernelCore` | Kernel: prioridade de primeiro plano e paginação do executivo | system |  | 670 | `registro: Win32PrioritySeparation, DisablePagingExecutive` |
| `group:visualEffects` | Efeitos visuais: melhor desempenho (usuário atual) | visuals |  | 679 | `registro: VisualFXSetting, UserPreferencesMask, MinAnimate, EnableAeroPeek, TaskbarAnimations, ListviewAlphaSelect, ListviewShadow` |

## `electron/services/optimizer/MoreTweaks.js`

| id | nome | categoria | risco | linha | executa |
|---|---|---|---|---|---|
| `tweak:amdDisableUlps` | AMD: desativar ULPS (economia de energia profunda) |  |  | 387 |  |
| `tweak:amdDisablePowerGating` | AMD: desativar power gating e estados dinâmicos |  |  | 393 |  |
| `tweak:amdDisableClockGating` | AMD: desativar clock gating do codificador de vídeo |  |  | 399 |  |
| `tweak:amdDisableAspm` | AMD: desativar ASPM do PCIe na placa |  |  | 405 |  |
| `tweak:nvidiaDisableDynamicPstate` | NVIDIA: desativar P-states dinâmicos |  |  | 411 |  |
| `tweak:nvidiaDisableAsyncPstates` | NVIDIA: desativar P-states assíncronos |  |  | 417 |  |
| `tweak:intelDisableAsyncFlips` | Intel: desativar async flips |  |  | 423 |  |
| `tweak:intelDisableAdaptiveVsync` | Intel: desativar V-Sync adaptativo do driver |  |  | 429 |  |
| `tweak:fasterMenus` | Menus e inicialização do Explorer mais rápidos | customization |  | 290 | `registro: MenuShowDelay, StartupDelayInMSec` |
| `tweak:hideStartRecommended` | Ocultar a seção "Recomendados" do Iniciar | customization |  | 299 | `registro: HideRecommendedSection` |
| `tweak:hideMeetNow` | Ocultar o botão "Reunir agora" da barra de tarefas | customization |  | 309 | `registro: HideSCAMeetNow` |
| `tweak:disableWidgets` | Desativar Widgets / Notícias e Interesses | customization |  | 315 | `registro: AllowNewsAndInterests` |
| `tweak:fastKeyboardRepeat` | Repetição de teclado mais rápida | gaming |  | 352 | `registro: KeyboardDelay, KeyboardSpeed` |
| `tweak:disableAccessibilityHotkeys` | Desativar atalhos de Teclas de Alternância e Teclas de Filtragem | gaming |  | 361 | `registro: Flags` |
| `tweak:disablePowerThrottling` | Desativar o Power Throttling (limitação de apps em segundo plano) | power |  | 372 | `registro: PowerThrottlingOff` |
| `tweak:usbNoPowerDrainRecovery` | USB: não desligar a porta após sobrecarga de energia | power | medium | 378 | `registro: AttemptRecoveryFromUsbPowerDrain` |
| `tweak:telemetryExtended` | Telemetria: pedidos de feedback, inventário de apps e dados opcionais | privacy |  | 231 | `registro: DoNotShowFeedbackNotifications, AllowCommercialDataPipeline, AllowDeviceNameInTelemetry, MicrosoftEdgeDataOptIn, NumberOfSIUFInPeriod, DisableMFUTracking, DisableInventory, AITEnable, NoExplicitFeedback, NoActiveHelp, HasAccepted, Start_TrackProgs` |
| `tweak:disableTelemetryTasks` | Desativar tarefas agendadas de telemetria | privacy |  | 250 |  |
| `tweak:disableAutoLoggers` | Desativar sessões de log de diagnóstico no boot (AutoLogger) | privacy |  | 257 |  |
| `tweak:disableFindMyDevice` | Desativar "Localizar meu dispositivo" | privacy | medium | 266 | `registro: AllowFindMyDevice` |
| `tweak:disableClickToDo` | Desativar o Click to Do (IA do Windows 11) | privacy |  | 273 | `registro: DisableClickToDo` |
| `tweak:disableSettingsAccountAds` | Sem propagandas do Microsoft 365 e da conta no app Configurações | privacy |  | 282 | `registro: DisableConsumerAccountStateContent` |
| `tweak:longerUpdatePause` | Permitir pausar o Windows Update por mais tempo | system |  | 323 | `registro: FlightSettingsMaxPauseDays` |
| `tweak:svchostGrouping` | Agrupar serviços em menos processos svchost | system |  | 329 |  |
| `tweak:webdavLargeFiles` | WebDAV: permitir arquivos maiores que 50 MB | system |  | 336 | `registro: FileSizeLimitInBytes` |
| `tweak:servicesManual` | Serviços do Windows em modo Manual (lista ampla) | system | medium | 342 |  |

## `electron/services/optimizer/SystemOptimizerService.js`

| id | nome | categoria | risco | linha | executa |
|---|---|---|---|---|---|
| `optimizer:optimizeAudioLatency` | Garantir Prioridade Alta do Áudio (temporário) | audio | safe | 258 | `MemoryEngine.optimizeAudioLatency` |
| `optimizer:disableGameBar` | Desativar Gravação em Segundo Plano (Game DVR) | gaming |  | 249 | `-> tweak:disableGameDvr (electron/services/optimizer/DeepTweaksEngine.js:255)` |
| `optimizer:optimizeGameRoute` | Prioridade Multimídia para Jogos (MMCSS) | gaming | moderate | 270 | `NetworkEngine.optimizeGameRoute`<br>`NetworkEngine.revertGameRoute`<br>`-> tweak:mmcssGames (electron/services/optimizer/DeepTweaksEngine.js:264)` |
| `optimizer:disableMouseAcceleration` | Desativar Aceleração do Mouse (precisão do ponteiro) | gaming |  | 392 | `-> tweak:disableMouseAcceleration (electron/services/optimizer/DeepTweaksEngine.js:276)` |
| `optimizer:kernelExtreme` | Kernel e Latência: prioridade de primeiro plano, MMCSS, NTFS e timer | gaming | moderate | 452 | `SystemEngine.applyExtremeKernelMod`<br>`SystemEngine.revertExtremeKernelMod`<br>`-> group:kernelCore (electron/services/optimizer/DeepTweaksEngine.js:670)`<br>`-> tweak:mmcssGames (electron/services/optimizer/DeepTweaksEngine.js:264)` |
| `optimizer:timerTuning` | Timer: desativar dynamic tick (BCD) | gaming | moderate | 469 | `SystemEngine.applyTimerTuning`<br>`SystemEngine.revertTimerTuning` |
| `optimizer:msiMode` | Modo MSI para a(s) GPU(s)  [AVANÇADO] | gaming | advanced | 530 | `SystemEngine.applyMsiMode`<br>`SystemEngine.revertMsiMode` |
| `optimizer:optimizeRAM` | Liberar Memória RAM (temporário) | memory | safe | 123 | `MemoryEngine.optimizeRAM` |
| `optimizer:flushDns` | Limpar Cache de DNS | network | safe | 97 | `NetworkEngine.flushDns` |
| `optimizer:networkExtreme` | Pilha TCP: RSC desligado, RSS ligado, timestamps off | network | moderate | 485 | `SystemEngine.applyExtremeNetworkMod`<br>`SystemEngine.revertExtremeNetworkMod` |
| `optimizer:advancedNetwork` | Rede: TCP NoDelay/AckFrequency por adaptador, EEE off, QoS | network | moderate | 500 | `NetworkEngine.advancedNetworkApply`<br>`NetworkEngine.advancedNetworkRevert` |
| `optimizer:powerPlanHighPerformance` | Plano de Energia: Alto Desempenho | power | moderate | 135 | `PowerEngine.setHighPerformance`<br>`PowerEngine.restorePrevious`<br>`PowerEngine.isUltimateGuid` |
| `optimizer:powerPlanUltimate` | Plano de Energia: Desempenho Máximo | power | moderate | 153 | `PowerEngine.setUltimate`<br>`PowerEngine.restorePrevious`<br>`PowerEngine.isUltimateGuid` |
| `optimizer:powerPlanBalanced` | Plano de Energia: Equilibrado | power | safe | 171 | `PowerEngine.setBalanced` |
| `optimizer:powerPlanRestore` | Plano de Energia: Restaurar anterior | power | safe | 184 | `PowerEngine.restorePrevious` |
| `optimizer:cpuUnpark` | CPU: manter todos os núcleos ativos (plano atual, na tomada) | power | moderate | 515 | `SystemEngine.applyCpuUnpark`<br>`SystemEngine.revertCpuUnpark` |
| `optimizer:disableTelemetry` | Reduzir Telemetria ao Mínimo | privacy |  | 198 | `-> tweak:disableTelemetry (electron/services/optimizer/DeepTweaksEngine.js:185)` |
| `optimizer:disableLocation` | Desativar Localização (política) | privacy |  | 207 | `-> tweak:disableLocation (electron/services/optimizer/DeepTweaksEngine.js:221)` |
| `optimizer:disableActivityHistory` | Desativar Histórico de Atividades | privacy |  | 215 | `-> tweak:disableActivityHistory (electron/services/optimizer/DeepTweaksEngine.js:215)` |
| `optimizer:disableCortana` | Desativar Cortana (política legada) | privacy |  | 223 | `-> tweak:disableCortana (electron/services/optimizer/DeepTweaksEngine.js:209)` |
| `optimizer:disableAiAndAds` | Desativar Recall (IA), Copilot e Sugestões Web | privacy |  | 231 | `-> tweak:disableAiAndAds (electron/services/optimizer/DeepTweaksEngine.js:195)` |
| `optimizer:blockAdsAndSuggestions` | Bloquear Anúncios e Sugestões do Windows | privacy |  | 239 | `-> tweak:blockAdsAndSuggestions (electron/services/optimizer/DeepTweaksEngine.js:240)` |
| `optimizer:disableCoreIsolation` | Modo Hardcore: Desativar VBS / Integridade de Memória  [RISCO DE SEGURANÇA] | security | advanced | 306 | `SystemEngine.applyHardcoreGamerMode`<br>`SystemEngine.revertHardcoreGamerMode`<br>`-> tweak:disableVBS (electron/services/optimizer/DeepTweaksEngine.js:292)`<br>`-> tweak:disableHibernation (electron/services/optimizer/DeepTweaksEngine.js:303)` |
| `optimizer:disableServices` | Desativar Serviços Redundantes (WSearch, DiagTrack, CDPSvc, lfsvc) | services | advanced | 286 | `ServicesEngine.applyServicesTweak`<br>`ServicesEngine.revertServicesTweak`<br>`ServicesEngine.readServices` |
| `optimizer:cleanTemp` | Limpar Arquivos Temporários | storage | safe | 109 | `StorageEngine.cleanTempFiles` |
| `optimizer:disableHibernation` | Desativar Hibernação (liberar espaço do hiberfil.sys) | storage | moderate | 411 | `-> tweak:disableHibernation (electron/services/optimizer/DeepTweaksEngine.js:303)` |
| `optimizer:deepCleanOneDrive` | Desinstalar OneDrive | storage | moderate | 421 | `SystemEngine.deepCleanOneDrive` |
| `optimizer:classicContextMenu` | Menu de Contexto Clássico (Windows 11) | system |  | 340 | `-> tweak:classicContextMenu (electron/services/optimizer/DeepTweaksEngine.js:108)` |
| `optimizer:taskbarTweaks` | Barra de Tarefas: Esquerda, sem Pesquisa e sem Visão de Tarefas | system |  | 349 | `-> tweak:taskbarAlignLeft (electron/services/optimizer/DeepTweaksEngine.js:70)`<br>`-> tweak:hideSearchBox (electron/services/optimizer/DeepTweaksEngine.js:82)`<br>`-> tweak:hideTaskViewButton (electron/services/optimizer/DeepTweaksEngine.js:88)`<br>`-> tweak:taskbarEndTask (electron/services/optimizer/DeepTweaksEngine.js:76)` |
| `optimizer:taskbarEndTask` | Habilitar "Finalizar Tarefa" na Barra de Tarefas | system |  | 358 | `-> tweak:taskbarEndTask (electron/services/optimizer/DeepTweaksEngine.js:76)` |
| `optimizer:darkModeAndColors` | Modo Escuro no Sistema e Aplicativos | system |  | 367 | `-> tweak:darkModeAndColors (electron/services/optimizer/DeepTweaksEngine.js:161)` |
| `optimizer:explorerTweaks` | Explorador: Este Computador, Extensões e Itens Ocultos | system |  | 375 | `-> tweak:explorerOpenThisPC (electron/services/optimizer/DeepTweaksEngine.js:115)`<br>`-> tweak:showFileExtensions (electron/services/optimizer/DeepTweaksEngine.js:121)`<br>`-> tweak:showHiddenFiles (electron/services/optimizer/DeepTweaksEngine.js:127)`<br>`-> tweak:explorerCompactMode (electron/services/optimizer/DeepTweaksEngine.js:133)` |
| `optimizer:edgeOptimizations` | Microsoft Edge: Sem Execução em Segundo Plano | system |  | 384 | `-> tweak:edgeOptimizations (electron/services/optimizer/DeepTweaksEngine.js:343)` |
| `optimizer:preventAutoBitLocker` | Impedir Criptografia Automática do Dispositivo (BitLocker) | system |  | 400 | `-> tweak:preventAutoBitLocker (electron/services/optimizer/DeepTweaksEngine.js:315)` |
| `optimizer:removeCapabilities` | Remover Recursos Opcionais Legados & Recall | system | moderate | 435 | `SystemEngine.removeCapabilitiesAndRecall`<br>`SystemEngine.restoreCapabilities` |
| `optimizer:disableVisualEffects` | Efeitos Visuais: Melhor Desempenho | visuals | safe | 325 | `VisualsEngine.disableVisualEffects`<br>`VisualsEngine.revertVisualEffects`<br>`-> group:visualEffects (electron/services/optimizer/DeepTweaksEngine.js:679)` |
