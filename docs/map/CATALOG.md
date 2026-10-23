<!-- GERADO por electron_feature_map.py em 2026-10-23T15:42:17. NAO edite a mao: rode `npm run map`. -->

# Catalogo de operacoes registradas (106)

Cada item do Otimizador/tweaks/etc. com o arquivo e a linha onde e definido e a funcao que ele executa.

## `electron/services/optimizer/DeepTweaksEngine.js`

| id | nome | categoria | risco | linha | executa |
|---|---|---|---|---|---|
| `tweak:taskbarAlignLeft` | Alinhar Barra de Tarefas à Esquerda | customization |  | 66 | `registro: TaskbarAl` |
| `tweak:taskbarEndTask` | Habilitar "Finalizar Tarefa" na Barra de Tarefas | customization |  | 72 | `registro: TaskbarEndTask` |
| `tweak:hideSearchBox` | Ocultar Caixa de Pesquisa da Barra de Tarefas | customization |  | 78 | `registro: SearchboxTaskbarMode` |
| `tweak:hideTaskViewButton` | Ocultar Botão Visão de Tarefas (Task View) | customization |  | 84 | `registro: ShowTaskViewButton` |
| `tweak:hideCopilotButton` | Ocultar Botão do Copilot na Barra de Tarefas | customization |  | 90 | `registro: ShowCopilotButton` |
| `tweak:showSecondsInClock` | Exibir Segundos no Relógio da Barra de Tarefas | customization |  | 96 | `registro: ShowSecondsInSystemClock` |
| `tweak:classicContextMenu` | Menu de Contexto Clássico (estilo Windows 10) | customization |  | 104 |  |
| `tweak:explorerOpenThisPC` | Abrir Explorador no "Este Computador" | customization |  | 111 | `registro: LaunchTo` |
| `tweak:showFileExtensions` | Exibir Extensões de Arquivos Conhecidos | customization |  | 117 | `registro: HideFileExt` |
| `tweak:showHiddenFiles` | Exibir Arquivos Ocultos e Protegidos do Sistema | customization |  | 123 | `registro: Hidden, ShowSuperHidden` |
| `tweak:explorerCompactMode` | Modo de Exibição Compacto no Explorador | customization |  | 129 | `registro: UseCompactMode` |
| `tweak:addCopyMoveToContextMenu` | Adicionar "Copiar Para" e "Mover Para" no Menu de Contexto | customization |  | 135 |  |
| `tweak:desktopIcons` | Exibir Ícones Essenciais na Área de Trabalho | customization |  | 150 |  |
| `tweak:darkModeAndColors` | Modo Escuro Completo no Sistema e Aplicativos | customization |  | 157 | `registro: SystemUsesLightTheme, AppsUseLightTheme, EnableTransparency` |
| `tweak:disableAeroShake` | Desativar Aero Shake (Chacoalhar Janelas) | customization |  | 167 | `registro: DisallowShaking` |
| `tweak:disableLockscreenBlur` | Desativar Desfoque na Tela de Login | customization |  | 173 | `registro: DisableAcrylicBackgroundOnLogon` |
| `tweak:hideHomeGallery` | Remover "Início" e "Galeria" do Explorador | customization |  | 579 | `registro: System.IsPinnedToNameSpaceTree` |
| `tweak:disableFolderDiscovery` | Explorador mais rápido em pastas grandes (sem detecção de tipo de pasta) | customization |  | 588 | `registro: FolderType` |
| `tweak:classicStartMenu` | Menu Iniciar anterior (antes do novo layout do 25H2) | customization |  | 594 | `registro: EnabledState` |
| `tweak:disableLockScreen` | Pular a tela de bloqueio (ir direto para a senha) | customization |  | 600 | `registro: NoLockScreen` |
| `tweak:hideSettingsHome` | Ocultar a página "Início" do app Configurações | customization |  | 606 | `registro: SettingsPageVisibility` |
| `tweak:batteryPercentage` | Porcentagem da bateria na barra de tarefas | customization |  | 612 | `registro: IsBatteryPercentageEnabled` |
| `tweak:scrollbarsAlwaysVisible` | Barras de rolagem sempre visíveis | customization |  | 618 | `registro: DynamicScrollbars` |
| `tweak:disableWindowSnapping` | Desativar o encaixe automático de janelas (Snap) | customization |  | 624 | `registro: WindowArrangementActive` |
| `tweak:numLockOnStartup` | Num Lock ligado ao iniciar | customization |  | 630 | `registro: InitialKeyboardIndicators` |
| `tweak:disableGameDvr` | Desativar Xbox Game DVR / Gravação em Segundo Plano | gaming |  | 251 | `registro: AppCaptureEnabled, GameDVR_Enabled` |
| `tweak:mmcssGames` | Prioridade Multimídia (MMCSS) para Jogos | gaming |  | 260 | `registro: NetworkThrottlingIndex, SystemResponsiveness, Priority, Scheduling Category, SFIO Priority` |
| `tweak:disableMouseAcceleration` | Desativar Aceleração do Mouse ("Aprimorar precisão do ponteiro") | gaming |  | 272 | `registro: MouseSpeed, MouseThreshold1, MouseThreshold2` |
| `tweak:disableStickyKeys` | Desativar Atalho das Teclas de Aderência (Shift 5x) | gaming |  | 282 | `registro: Flags` |
| `tweak:disableVBS` | Desativar VBS / Isolamento de Núcleo (HVCI)  [RISCO DE SEGURANÇA] | gaming | high | 288 | `registro: EnableVirtualizationBasedSecurity, Enabled` |
| `tweak:disableMpo` | Desativar Multiplane Overlay (MPO) | gaming |  | 355 | `registro: OverlayTestMode` |
| `group:hags` | HAGS (Agendamento de GPU acelerado por hardware) | gaming |  | 689 | `registro: HwSchMode` |
| `tweak:preferIPv4` | Preferir IPv4 em vez de IPv6 | network |  | 363 | `registro: DisabledComponents` |
| `tweak:disableIPv6` | Desativar IPv6 | network | medium | 369 | `registro: DisabledComponents` |
| `tweak:disableTeredo` | Desativar túnel Teredo | network |  | 376 | `registro: Teredo_State` |
| `tweak:standbyNetworkOff` | Sem rede durante a suspensão moderna (notebooks) | power |  | 388 | `registro: DCSettingIndex, ACSettingIndex` |
| `tweak:s3Sleep` | Usar suspensão S3 clássica em vez do Modern Standby | power | medium | 397 | `registro: PlatformAoAcOverride` |
| `tweak:disableTelemetry` | Reduzir Telemetria da Microsoft ao Mínimo | privacy | medium | 181 | `registro: AllowTelemetry, CEIPEnable` |
| `tweak:disableAiAndAds` | Desativar Recall (IA), Copilot e Sugestões Web na Pesquisa | privacy | medium | 191 | `registro: DisableAIDataAnalysis, AllowCloudSearch, BingSearchEnabled, DisableSearchBoxSuggestions, TurnOffWindowsCopilot` |
| `tweak:disableCortana` | Desativar Assistente Cortana (política legada) | privacy |  | 205 | `registro: AllowCortana` |
| `tweak:disableActivityHistory` | Desativar Histórico de Atividades (Timeline) | privacy |  | 211 | `registro: EnableActivityFeed, PublishUserActivities, UploadUserActivities` |
| `tweak:disableLocation` | Desativar Rastreamento de Localização (política) | privacy | medium | 217 | `registro: DisableLocation` |
| `tweak:disableDeliveryOptimization` | Desativar Otimização de Entrega P2P | privacy |  | 224 | `registro: DODownloadMode` |
| `tweak:disableErrorReporting` | Desativar Relatório de Erros do Windows | privacy |  | 230 | `registro: Disabled` |
| `tweak:blockAdsAndSuggestions` | Bloqueio de Anúncios e Sugestões do Windows | privacy |  | 236 | `registro: SystemPaneSuggestionsEnabled, SoftLandingEnabled, RotatingLockScreenEnabled, RotatingLockScreenOverlayEnabled, SubscribedContent-338388Enabled, SubscribedContent-338389Enabled, SubscribedContent-353694Enabled, SubscribedContent-353696Enabled, Enabled, TailoredExperiencesWithDiagnosticDataEnabled` |
| `tweak:disableStoreSearchResults` | Sem sugestões da Microsoft Store na pesquisa do Iniciar | privacy |  | 406 |  |
| `tweak:disableNotifications` | Desativar Central de Notificações e notificações pop-up | privacy |  | 424 | `registro: DisableNotificationCenter, ToastEnabled` |
| `tweak:blockDeviceMetadata` | Bloquear apps de fabricante baixados ao conectar dispositivos | privacy |  | 433 | `registro: PreventDeviceMetadataFromNetwork` |
| `tweak:blockPeripheralBloat` | Bloquear instalação automática do Razer Synapse e do Logi Download Assistant | privacy |  | 439 | `registro: DisableCoInstallers` |
| `tweak:disableWpbt` | Impedir que o firmware instale programas no Windows (WPBT) | privacy |  | 458 | `registro: DisableWpbtExecution` |
| `tweak:braveDebloat` | Brave sem Rewards, carteira cripto, VPN, IA e telemetria | privacy |  | 464 | `registro: BraveRewardsDisabled, BraveWalletDisabled, BraveVPNDisabled, BraveAIChatEnabled, BraveNewsDisabled, BraveTalkDisabled, TorDisabled, BraveStatsPingEnabled, BraveP3AEnabled, MetricsReportingEnabled, UrlKeyedAnonymizedDataCollectionEnabled, SafeBrowsingExtendedReportingEnabled` |
| `tweak:keepClassicOutlook` | Manter o Outlook clássico (sem migração para o "novo Outlook") | privacy |  | 478 | `registro: UseNewOutlook, HideNewOutlookToggle, DoNewOutlookAutoMigration, NewOutlookMigrationUserSetting` |
| `group:defenderPolicy` | Políticas do Microsoft Defender (desativação) | security | high | 680 | `registro: DisableAntiSpyware, DisableRealtimeMonitoring` |
| `tweak:disableHibernation` | Desativar Hibernação (apaga hiberfil.sys) | storage |  | 299 |  |
| `tweak:preventAutoBitLocker` | Impedir Criptografia Automática de Dispositivo (BitLocker)  [SEGURANÇA] | storage | medium | 311 | `registro: PreventDeviceEncryption` |
| `tweak:disableStorageSense` | Desativar o Sensor de Armazenamento | storage |  | 491 | `registro: 01` |
| `tweak:disableReservedStorage` | Liberar o Armazenamento Reservado (~7 GB) | storage |  | 497 |  |
| `tweak:disableFastStartup` | Desativar Inicialização Rápida (Fast Startup) | system |  | 317 | `registro: HiberbootEnabled` |
| `tweak:setUtcTime` | Relógio do Hardware em UTC (somente dual boot com Linux) | system | medium | 323 | `registro: RealTimeIsUniversal` |
| `tweak:disableBackgroundApps` | Bloquear Aplicativos UWP em Segundo Plano | system |  | 330 | `registro: GlobalUserDisabled, LetAppsRunInBackground` |
| `tweak:edgeOptimizations` | Otimização do Microsoft Edge (políticas) | system |  | 339 | `registro: BackgroundModeEnabled, StartupBoostEnabled, HideFirstRunExperience` |
| `tweak:longPaths` | Permitir caminhos de arquivo com mais de 260 caracteres | system |  | 524 | `registro: LongPathsEnabled` |
| `tweak:registryBackup` | Backup automático do registro (RegBack) | system |  | 530 | `registro: EnablePeriodicBackup` |
| `tweak:detailedBsod` | Tela azul (BSOD) com detalhes técnicos | system |  | 536 | `registro: DisplayParameters, DisableEmoticon` |
| `tweak:verboseLogon` | Mensagens detalhadas ao iniciar e desligar | system |  | 545 | `registro: VerboseStatus` |
| `tweak:legacyBootMenu` | Menu de boot clássico (F8 / Modo de Segurança) | system |  | 551 |  |
| `tweak:ntpPool` | Sincronizar o relógio com pool.ntp.org | system |  | 567 | `registro: NtpServer` |
| `tweak:rdpUnsignedNoWarning` | Sem aviso ao abrir arquivos .rdp não assinados  [SEGURANÇA] | system | medium | 640 | `registro: RedirectionWarningDialogVersion, RdpLaunchConsentAccepted` |
| `group:kernelCore` | Kernel: prioridade de primeiro plano e paginação do executivo | system |  | 655 | `registro: Win32PrioritySeparation, DisablePagingExecutive` |
| `group:visualEffects` | Efeitos visuais: melhor desempenho (usuário atual) | visuals |  | 664 | `registro: VisualFXSetting, UserPreferencesMask, MinAnimate, EnableAeroPeek, TaskbarAnimations, ListviewAlphaSelect, ListviewShadow` |

## `electron/services/optimizer/SystemOptimizerService.js`

| id | nome | categoria | risco | linha | executa |
|---|---|---|---|---|---|
| `optimizer:optimizeAudioLatency` | Garantir Prioridade Alta do Áudio (temporário) | audio | safe | 244 | `MemoryEngine.optimizeAudioLatency` |
| `optimizer:disableGameBar` | Desativar Gravação em Segundo Plano (Game DVR) | gaming |  | 235 | `-> tweak:disableGameDvr (electron/services/optimizer/DeepTweaksEngine.js:251)` |
| `optimizer:optimizeGameRoute` | Prioridade Multimídia para Jogos (MMCSS) | gaming | moderate | 256 | `NetworkEngine.optimizeGameRoute`<br>`NetworkEngine.revertGameRoute`<br>`-> tweak:mmcssGames (electron/services/optimizer/DeepTweaksEngine.js:260)` |
| `optimizer:disableMouseAcceleration` | Desativar Aceleração do Mouse (precisão do ponteiro) | gaming |  | 378 | `-> tweak:disableMouseAcceleration (electron/services/optimizer/DeepTweaksEngine.js:272)` |
| `optimizer:kernelExtreme` | Kernel e Latência: prioridade de primeiro plano, MMCSS, NTFS e timer | gaming | moderate | 438 | `SystemEngine.applyExtremeKernelMod`<br>`SystemEngine.revertExtremeKernelMod`<br>`-> group:kernelCore (electron/services/optimizer/DeepTweaksEngine.js:655)`<br>`-> tweak:mmcssGames (electron/services/optimizer/DeepTweaksEngine.js:260)` |
| `optimizer:timerTuning` | Timer: desativar dynamic tick (BCD) | gaming | moderate | 455 | `SystemEngine.applyTimerTuning`<br>`SystemEngine.revertTimerTuning` |
| `optimizer:msiMode` | Modo MSI para a(s) GPU(s)  [AVANÇADO] | gaming | advanced | 516 | `SystemEngine.applyMsiMode`<br>`SystemEngine.revertMsiMode` |
| `optimizer:optimizeRAM` | Liberar Memória RAM (temporário) | memory | safe | 109 | `MemoryEngine.optimizeRAM` |
| `optimizer:flushDns` | Limpar Cache de DNS | network | safe | 85 | `NetworkEngine.flushDns` |
| `optimizer:networkExtreme` | Pilha TCP: RSC desligado, RSS ligado, timestamps off | network | moderate | 471 | `SystemEngine.applyExtremeNetworkMod`<br>`SystemEngine.revertExtremeNetworkMod` |
| `optimizer:advancedNetwork` | Rede: TCP NoDelay/AckFrequency por adaptador, EEE off, QoS | network | moderate | 486 | `NetworkEngine.advancedNetworkApply`<br>`NetworkEngine.advancedNetworkRevert` |
| `optimizer:powerPlanHighPerformance` | Plano de Energia: Alto Desempenho | power | moderate | 121 | `PowerEngine.setHighPerformance`<br>`PowerEngine.restorePrevious` |
| `optimizer:powerPlanUltimate` | Plano de Energia: Desempenho Máximo | power | moderate | 139 | `PowerEngine.setUltimate`<br>`PowerEngine.restorePrevious` |
| `optimizer:powerPlanBalanced` | Plano de Energia: Equilibrado | power | safe | 157 | `PowerEngine.setBalanced` |
| `optimizer:powerPlanRestore` | Plano de Energia: Restaurar anterior | power | safe | 170 | `PowerEngine.restorePrevious` |
| `optimizer:cpuUnpark` | CPU: manter todos os núcleos ativos (plano atual, na tomada) | power | moderate | 501 | `SystemEngine.applyCpuUnpark`<br>`SystemEngine.revertCpuUnpark` |
| `optimizer:disableTelemetry` | Reduzir Telemetria ao Mínimo | privacy |  | 184 | `-> tweak:disableTelemetry (electron/services/optimizer/DeepTweaksEngine.js:181)` |
| `optimizer:disableLocation` | Desativar Localização (política) | privacy |  | 193 | `-> tweak:disableLocation (electron/services/optimizer/DeepTweaksEngine.js:217)` |
| `optimizer:disableActivityHistory` | Desativar Histórico de Atividades | privacy |  | 201 | `-> tweak:disableActivityHistory (electron/services/optimizer/DeepTweaksEngine.js:211)` |
| `optimizer:disableCortana` | Desativar Cortana (política legada) | privacy |  | 209 | `-> tweak:disableCortana (electron/services/optimizer/DeepTweaksEngine.js:205)` |
| `optimizer:disableAiAndAds` | Desativar Recall (IA), Copilot e Sugestões Web | privacy |  | 217 | `-> tweak:disableAiAndAds (electron/services/optimizer/DeepTweaksEngine.js:191)` |
| `optimizer:blockAdsAndSuggestions` | Bloquear Anúncios e Sugestões do Windows | privacy |  | 225 | `-> tweak:blockAdsAndSuggestions (electron/services/optimizer/DeepTweaksEngine.js:236)` |
| `optimizer:disableCoreIsolation` | Modo Hardcore: Desativar VBS / Integridade de Memória  [RISCO DE SEGURANÇA] | security | advanced | 292 | `SystemEngine.applyHardcoreGamerMode`<br>`SystemEngine.revertHardcoreGamerMode`<br>`-> tweak:disableVBS (electron/services/optimizer/DeepTweaksEngine.js:288)`<br>`-> tweak:disableHibernation (electron/services/optimizer/DeepTweaksEngine.js:299)` |
| `optimizer:disableServices` | Desativar Serviços Redundantes (WSearch, DiagTrack, CDPSvc, lfsvc) | services | advanced | 272 | `ServicesEngine.applyServicesTweak`<br>`ServicesEngine.revertServicesTweak`<br>`ServicesEngine.readServices` |
| `optimizer:cleanTemp` | Limpar Arquivos Temporários | storage | safe | 97 | `StorageEngine.cleanTempFiles` |
| `optimizer:disableHibernation` | Desativar Hibernação (liberar espaço do hiberfil.sys) | storage | moderate | 397 | `-> tweak:disableHibernation (electron/services/optimizer/DeepTweaksEngine.js:299)` |
| `optimizer:deepCleanOneDrive` | Desinstalar OneDrive | storage | moderate | 407 | `SystemEngine.deepCleanOneDrive` |
| `optimizer:classicContextMenu` | Menu de Contexto Clássico (Windows 11) | system |  | 326 | `-> tweak:classicContextMenu (electron/services/optimizer/DeepTweaksEngine.js:104)` |
| `optimizer:taskbarTweaks` | Barra de Tarefas: Esquerda, sem Pesquisa e sem Visão de Tarefas | system |  | 335 | `-> tweak:taskbarAlignLeft (electron/services/optimizer/DeepTweaksEngine.js:66)`<br>`-> tweak:hideSearchBox (electron/services/optimizer/DeepTweaksEngine.js:78)`<br>`-> tweak:hideTaskViewButton (electron/services/optimizer/DeepTweaksEngine.js:84)`<br>`-> tweak:taskbarEndTask (electron/services/optimizer/DeepTweaksEngine.js:72)` |
| `optimizer:taskbarEndTask` | Habilitar "Finalizar Tarefa" na Barra de Tarefas | system |  | 344 | `-> tweak:taskbarEndTask (electron/services/optimizer/DeepTweaksEngine.js:72)` |
| `optimizer:darkModeAndColors` | Modo Escuro no Sistema e Aplicativos | system |  | 353 | `-> tweak:darkModeAndColors (electron/services/optimizer/DeepTweaksEngine.js:157)` |
| `optimizer:explorerTweaks` | Explorador: Este Computador, Extensões e Itens Ocultos | system |  | 361 | `-> tweak:explorerOpenThisPC (electron/services/optimizer/DeepTweaksEngine.js:111)`<br>`-> tweak:showFileExtensions (electron/services/optimizer/DeepTweaksEngine.js:117)`<br>`-> tweak:showHiddenFiles (electron/services/optimizer/DeepTweaksEngine.js:123)`<br>`-> tweak:explorerCompactMode (electron/services/optimizer/DeepTweaksEngine.js:129)` |
| `optimizer:edgeOptimizations` | Microsoft Edge: Sem Execução em Segundo Plano | system |  | 370 | `-> tweak:edgeOptimizations (electron/services/optimizer/DeepTweaksEngine.js:339)` |
| `optimizer:preventAutoBitLocker` | Impedir Criptografia Automática do Dispositivo (BitLocker) | system |  | 386 | `-> tweak:preventAutoBitLocker (electron/services/optimizer/DeepTweaksEngine.js:311)` |
| `optimizer:removeCapabilities` | Remover Recursos Opcionais Legados & Recall | system | moderate | 421 | `SystemEngine.removeCapabilitiesAndRecall`<br>`SystemEngine.restoreCapabilities` |
| `optimizer:disableVisualEffects` | Efeitos Visuais: Melhor Desempenho | visuals | safe | 311 | `VisualsEngine.disableVisualEffects`<br>`VisualsEngine.revertVisualEffects`<br>`-> group:visualEffects (electron/services/optimizer/DeepTweaksEngine.js:664)` |
