# Auditoria da página "Otimização do Sistema" (DarkHub Suite)

Escopo: `src/pages/Optimizer.tsx`, `electron/services/optimizer/*` e o caminho UI -> preload -> IPC -> engine. Todas as correções seguem a regra de **não remover recursos**: o que era placebo foi mantido com título e descrição honestos, e o código passou a fazer a coisa certa, medir o resultado e guardar como desfazer.

> Ambiente: a auditoria e as correções foram feitas em Linux. Só foram executados `node --check`, `tsc --noEmit` e `vitest`. **Nada do que toca o Windows real (PowerShell, UAC, Registro, bcdedit, powercfg, netsh, fsutil, CIM, Appx, OneDrive) foi executado.** A coluna "veredito" descreve o estado ANTES da correção, reconstruído por leitura de código; como a auditoria atravessou uma compactação de contexto, alguns detalhes do comportamento antigo (principalmente nos tweaks de registro) foram reconstruídos a partir das notas e do que o código novo corrige, então trate a coluna "Realidade (antes)" como análise, não como medição.

## Resumo

| Veredito (antes) | Quantidade |
|---|---|
| REAL | 25 |
| PLACEBO | 8 |
| FICTITIOUS | 6 |
| BROKEN | 29 |
| RISKY | 18 |
| **Total de ações auditadas** | **86** |

Legenda: REAL = fazia o que dizia; PLACEBO = efeito nulo/ínfimo ou não verificável; FICTITIOUS = prometia algo que o código não fazia; BROKEN = fazia, mas errado (chave/comando/estado/medição incorreta); RISKY = funcionava, porém perigoso ou aplicado sem aviso/opt-in.

## Tabela completa


### Ações rápidas (barra superior)

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Otimizar RAM (optimizer:optimizeRAM)` | Liberar memória RAM | Esvaziava working sets sem medir nada e, segundo o código antigo, também esvaziava a Lixeira e limpava DNS (efeitos não anunciados). Mostrava sempre "RAM otimizada!". | PLACEBO | Mede RAM livre antes/depois (os.freemem), só esvazia processos de usuário (lista de exclusão), mostra o delta real e diz que o efeito é temporário. Removidos Lixeira e DNS. |
| `Limpar Disco (optimizer:cleanTemp)` | Apagar arquivos temporários | Apagava, mas o valor "liberado" era estimado/fixo e falhas por arquivo em uso eram silenciosas. | BROKEN | Contagem real de bytes por arquivo apagado (itens em uso são ignorados e contados); protege caches de shader/jogos; mensagem com o valor medido. |
| `Limpar DNS (optimizer:flushDns)` | Limpar cache de DNS | Executava ipconfig /flushdns, mas o log da UI dizia "redefinindo socket" (não fazia) e o resultado nunca era conferido. | REAL | Confere o código de saída, devolve ok:false com a saída do comando em caso de erro; texto honesto (só cache local). |
| `Alto Desempenho (powerPlanHighPerformance)` | Ativar plano de energia Alto Desempenho | Localizava o plano por NOME (falha em Windows localizado/sem o plano) e nunca conferia qual plano ficou ativo. | BROKEN | Trabalha com GUID (powercfg /list), duplica o esquema quando o plano não existe, lê o plano ativo de volta, guarda o plano anterior e oferece "Reverter" (restorePrevious). |
| `Latência de Áudio (optimizeAudioLatency)` | "Ajustar afinidade de núcleos e prioridade de áudio" | Ajustava audiodg.exe, que já roda em Alta por padrão; a afinidade prometida não era alterada. Mostrava sucesso mesmo sem processo. | FICTITIOUS | Renomeado para "Garantir prioridade Alta do áudio (temporário)": define prioridade/afinidade só se diferentes, relê o valor e informa "nada a mudar" quando já está certo. Efeito dura até o audiodg reiniciar (dito na UI). |
| `Restaurar Padrões (revert_all)` | Reverter modificações | Chamava deepTweaksRevert em TODOS os tweaks (gravava o padrão do Windows por cima de configurações que o usuário nunca mudou) e revertia serviços/kernel sem saber se estavam ativos; Promise.all com handlers que ligam/desligam isOptimizing. | RISKY | Só reverte o que está ATIVO: operações com applied===true via operação de reversão, tweaks com snapshot via undoTweaks (snapshot-only, restaura os valores exatos anteriores), Defender só se houver política do DarkHub, DNS só se houver token. Pede confirmação e é sequencial. |
| `Otimização Global (global_recommended)` | Aplicar a otimização recomendada | Rodava RAM+disco+DNS+tweaks em Promise.all (condição de corrida no estado "ocupado") e aplicava telemetria/IA/Cortana; o IPC globalRecommendedTweaks aplicava TODOS os tweaks (inclusive VBS e BitLocker). | RISKY | Botão renomeado "Otimização Segura": confirmação, passos em sequência, apenas tweaks recommended && risk=low && !securityRelated. Patch obrigatório para o IPC no main.js (ver optimizer_main_patch.md). |
| `Criar ponto de restauração (novo botão)` | Criar ponto de restauração antes de mexer | Existia no backend, sem botão na UI; o Windows ignora silenciosamente um segundo ponto em 24 h e o código declarava sucesso. | BROKEN | Botão no cabeçalho; levanta temporariamente o limite de 24 h e confirma pelo número de sequência (Get-ComputerRestorePoint). |

### Controle HAGS / texturas

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Ativar/Desativar HAGS` | Corrigir texturas lentas (Overwatch 2, Warzone) | Gravava HwSchMode, mas lia o estado de forma ambígua (ausente == "desativado"), botões habilitados/desabilitados com lógica trocada e prometia "fix de texturas". | BROKEN | Estado em 3 valores (on=2, off=1, padrão do driver=ausente), botões coerentes, escrita via grupo do DeepTweaks com snapshot e verificação; texto sem promessa de correção, avisa que reinicia. |
| `Reverter HAGS` | Voltar ao padrão do Windows | Apagava a chave, ignorando o valor que existia antes. | BROKEN | Restaura o snapshot (valor anterior exato) e só apaga se não existia. |
| `Restaurar Padrões de Streaming & Kernel` | Restaurar kernel/serviços/HAGS | Afirmava "SysMain preservado" (não tocava em SysMain) e revertia serviços sem relação com texturas. | FICTITIOUS | Reverte apenas o kernelExtreme (se ativo) e o HAGS; mensagens reais. |

### Operações do catálogo (aba Ajustes)

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `optimizer:disableTelemetry` | Desativar telemetria | Dizia "desativar", mas em Windows Home/Pro o mínimo é "Obrigatório"; entrava no preset recomendado. | PLACEBO | Título "Reduzir ao mínimo" + aviso; fora de qualquer perfil seguro/recomendado/jogos; verificado por leitura do Registro. |
| `optimizer:disableLocation` | Desativar localização | Política aplicada sem aviso de efeitos colaterais. | REAL | Aviso (clima, mapas, fuso automático) e verificação; fora dos perfis seguros. |
| `optimizer:disableActivityHistory` | Desativar histórico de atividades | Políticas gravadas sem leitura de volta. | REAL | Verificação + snapshot + reversão. |
| `optimizer:disableCortana` | Desativar Cortana | Política AllowCortana sem efeito em versões atuais. | PLACEBO | Mantido, com a descrição dizendo que é política legada sem efeito prático nas versões recentes. |
| `optimizer:disableAiAndAds` | Desativar Recall/Copilot/sugestões web | Valores de políticas, alguns só em builds específicos. | REAL | Texto honesto sobre builds; verificação por leitura; fora dos presets. |
| `optimizer:blockAdsAndSuggestions` | Bloquear anúncios/sugestões | Chaves ContentDeliveryManager gravadas sem conferir. | REAL | Verificação; descrição avisa que grandes atualizações podem reativar. |
| `optimizer:disableGameBar` | Desativar Game DVR | Chaves gravadas, sem conferir o estado. | REAL | Verificação, snapshot, descrição realista do ganho. |
| `optimizer:optimizeGameRoute` | "Otimizar rota de jogos" / ping | Gravava MMCSS (NetworkThrottlingIndex, SystemResponsiveness); o nome sugeria rota de rede e queda de ping. | PLACEBO | Renomeado "Prioridade multimídia para jogos (MMCSS)"; valor verificado; descrição afirma que não altera rota nem ping. Mesmo conjunto é o tweak:mmcssGames. |
| `optimizer:disableServices` | Desativar serviços redundantes | Desativava serviços (SysMain etc.) por nome, sem snapshot do modo original; entrava em presets. | RISKY | Lista reduzida e gerenciada (WSearch, DiagTrack, CDPSvc, lfsvc), snapshot do StartMode, reversão pelo snapshot, aviso e fora de todo perfil seguro/recomendado/jogos. |
| `optimizer:disableCoreIsolation (VBS/HVCI)` | "+15% de FPS" desativando VBS | Desligava VBS/HVCI sem aviso e prometia ganho fixo; estava no preset avançado sem confirmação. | RISKY | Opt-in, marcado como RISCO DE SEGURANÇA, confirmação obrigatória, ganho descrito como 0-10% em jogos limitados por CPU, nunca em perfil seguro; reversão por snapshot. |
| `optimizer:disableVisualEffects` | Efeitos visuais: desempenho | Gravava chaves de uma lista incompleta e exigia relogar sem avisar. | REAL | Grupo group:visualEffects com snapshot, SystemParametersInfo para aplicar ao vivo, verificação. |
| `optimizer:classicContextMenu` | Menu clássico do Windows 11 | Criava a chave CLSID; reversão não removia a chave pai. | REAL | Remove a chave pai só se foi criada pelo tweak; título corrigido ("estilo Windows 10"). |
| `optimizer:taskbarTweaks` | Barra de tarefas | Preferência visual agrupada. | REAL | Verificação + reinício do Explorer não elevado; descrição diz que não afeta desempenho. |
| `optimizer:taskbarEndTask` | Finalizar tarefa na barra | Chave correta mas exigia 23H2 sem avisar. | REAL | Descrição cita a versão mínima; duplicado com o tweak individual foi unificado na UI. |
| `optimizer:darkModeAndColors` | Modo escuro | Preferência visual. | REAL | Verificação; descrição sem promessa de desempenho. |
| `optimizer:explorerTweaks` | Explorador | Misturava mostrar arquivos protegidos do sistema sem aviso. | REAL | Descrição avisa sobre arquivos protegidos; verificação. |
| `optimizer:edgeOptimizations` | Edge sem segundo plano | Políticas do Edge. | REAL | Avisa que o Edge mostrará "gerenciado pela organização". |
| `optimizer:disableMouseAcceleration` | Sem aceleração do mouse | Gravava as chaves mas o efeito só valia após relogar. | REAL | Aplica ao vivo (SPI_SETMOUSE) e confere. |
| `optimizer:preventAutoBitLocker` | Impedir BitLocker automático | Estava num preset de "otimização"; reduz proteção de dados. | RISKY | Marcado SEGURANÇA, aviso explícito, confirmação, fora dos presets. |
| `optimizer:disableHibernation` | Desativar hibernação | Rodava powercfg sem verificar e ia no preset de jogos. | RISKY | Verifica via powercfg /a e hiberfil; aviso (notebooks); fora dos perfis seguros. |
| `optimizer:deepCleanOneDrive` | Desinstalar OneDrive por completo | Apagava pastas do sistema (SysWOW64/System32) e chaves de forma agressiva. | RISKY | Usa só o desinstalador oficial (/uninstall), sem apagar arquivos do Windows; aviso de irreversibilidade. |
| `optimizer:removeCapabilities` | Remover recursos legados/Recall | Removia Hello Face etc. sem snapshot. | RISKY | Só remove o que está instalado, grava a lista em sys:capabilities e oferece restauração; aviso sobre login facial. |
| `optimizer:kernelExtreme (novo item de UI)` | Kernel/Latência extremo | Aplicava um pacote de chaves, incluindo LargeSystemCache, 8dot3, memoryusage e apagava HwSchMode (efeitos colaterais e valores sem base). | RISKY | Reduzido ao que tem base: Win32PrioritySeparation 0x26, DisablePagingExecutive, MMCSS, lastaccess e dynamic tick; snapshot completo e reversão (antes era impossível reverter). |
| `optimizer:timerTuning (novo)` | "Resolução do timer" a 0.5 ms | O botão "timer-resolution" prometia timer de 0.5 ms mas só chamava bcdedit sem verificar. | PLACEBO | Item honesto: bcdedit disabledynamictick (BCD), verificado, reversível com valor original; descrição diz que não muda a resolução por si. |
| `optimizer:networkExtreme (novo)` | Rede extrema | Definia InitialRto 2000, TTL e EnableTCPA/RSS globais; nenhum benefício e risco de lentidão. | RISKY | Mantido apenas RSC off, RSS on, timestamps off, autotuning normal, com snapshot em sys:networkExtreme e reversão. |
| `optimizer:advancedNetwork` | "RSS 4 filas, MTU 1500, TCP NoDelay" | Escrevia TcpAckFrequency/TCPNoDelay na chave GLOBAL (o Windows só lê na chave da interface), forçava MTU 1500 (quebra PPPoE/VPN) e a UI exibia caixas estáticas "RSS 4 filas". | FICTITIOUS | Escreve na chave de cada adaptador ativo (GUID validado), desliga EEE pelo keyword *EEE, remove MTU/RSS fictícios, limpa os valores legados na reversão e a UI lê o estado real. |
| `optimizer:cpuUnpark (novo)` | Núcleos sempre ativos | Gravava o índice de energia de forma global sem snapshot. | PLACEBO | Aplica ao plano ATIVO (powercfg /setacvalueindex), lê CPMINCORES de volta e guarda o valor anterior (sys:cpuUnpark). |
| `optimizer:msiMode (novo)` | Modo MSI para GPU | Aplicava MSISupported a TODOS os dispositivos PCI, incluindo controladoras de disco/rede (risco de falha de boot). | RISKY | Apenas dispositivos da classe Display, id PCI validado, snapshot por dispositivo (msi:display), aviso e Reverter; fora de todos os presets. |
| `optimizer:powerPlanBalanced` | Plano Equilibrado | Mesma falha do plano por nome. | BROKEN | Baseado em GUID e conferido. |

### Tweaks de registro (35, aba Ajustes)

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `tweak:taskbarAlignLeft` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:hideSearchBox` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:hideTaskViewButton` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:hideCopilotButton` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:showSecondsInClock` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:explorerOpenThisPC` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:showFileExtensions` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:explorerCompactMode` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:addCopyMoveToContextMenu` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:desktopIcons` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:disableAeroShake` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:disableLockscreenBlur` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:disableStickyKeys` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:disableDeliveryOptimization` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:disableErrorReporting` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:disableFastStartup` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:disableBackgroundApps` | Aplicar/reverter ajuste de registro | O estado "ATIVADO" era lido comparando texto bruto (0x1 vs 1), então aparecia errado; a reversão gravava um padrão fixo sem snapshot e não conferia o resultado. | BROKEN | Estado calculado comparando valores canônicos (0x1==1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e reversão pelo snapshot; ações não verificadas devolvem ok:false. |
| `tweak:showHiddenFiles` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Mostrava arquivos protegidos do sistema sem aviso. Agora avisa para ter cuidado ao apagar. | RISKY | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:setUtcTime` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Mudava o relógio do hardware para UTC; num PC só com Windows deixa a hora errada. Agora a descrição limita a dual boot com Linux. | RISKY | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableCortana` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Política legada sem efeito nas versões atuais; descrição honesta. | PLACEBO | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:mmcssGames` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Novo tweak verificado, mesmo conjunto que optimizeGameRoute. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableMouseAcceleration` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Aplicação ao vivo + verificação. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:classicContextMenu` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Chave pai removida só se criada pelo tweak. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableVBS` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:disableCoreIsolation. | RISKY | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableHibernation` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:disableHibernation. | RISKY | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:preventAutoBitLocker` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:preventAutoBitLocker. | RISKY | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableTelemetry` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:disableTelemetry. | PLACEBO | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableAiAndAds` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:disableAiAndAds. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableActivityHistory` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:disableActivityHistory. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableLocation` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:disableLocation. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:blockAdsAndSuggestions` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:blockAdsAndSuggestions. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:disableGameDvr` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:disableGameBar. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:taskbarEndTask` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:taskbarEndTask. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:darkModeAndColors` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:darkModeAndColors. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |
| `tweak:edgeOptimizations` | Aplicar/reverter ajuste de registro | Mesmo problema de estado/reversão dos demais tweaks. Ver optimizer:edgeOptimizations. | REAL | Verificação por leitura de volta, snapshot e reversão exata; flags de risco/segurança expostos para a UI. |

### Aba Desinstalador

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Desinstalar & Limpar Resíduos` | Desinstalar e limpar sobras | Rodava a string de desinstalação por um shell (injeção possível) e apagava pastas de resíduo mesmo se o desinstalador falhasse/fosse cancelado; "liberado" não era medido. | RISKY | Sem shell (parseUninstallString), espera o programa sumir do Registro, só então limpa resíduos com nome exato e dentro de raízes seguras, mede os bytes e pede confirmação (AppData pode ter dados). |

### Aba GPU

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Preferência de GPU por jogo` | Forçar a GPU dedicada | Sobrescrevia o valor inteiro (perdia SwapEffectUpgradeEnable etc.), aceitava qualquer caminho e não conferia; em PC com uma GPU não faz nada. | BROKEN | Mescla GpuPreference com os demais campos, valida .exe existente, relê, mostra aviso de GPU única, opção "padrão" e marca arquivos inexistentes. |

### Aba Prioridade

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Definir prioridade de processo` | Tornar o jogo mais rápido | Botão "Definir Alta" usava estado desatualizado (aplicava no PID anterior), permitia RealTime sem aviso e processos críticos; nada era conferido; parecia permanente. | BROKEN | PID e prioridade passados como argumentos, processos críticos bloqueados, RealTime com confirmação, valor relido, texto "não persiste após o processo fechar". |

### Aba Rede & DNS

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `DNS Benchmark` | Medir a latência real | Se o benchmark falhasse a UI mostrava uma lista fixa com latências inventadas (8, 12, 15, 18 ms); lia res.data (nunca existiu), então o adaptador ficava "Detectando...". | FICTITIOUS | Sem latências inventadas: antes de medir mostra "não medido"; depois mostra a mediana real de respostas DNS válidas (UDP 53) e quantos servidores falharam. |
| `Aplicar DNS` | Trocar o servidor DNS | setDnsServers aplicava em todos os adaptadores e applyDns não pedia elevação nem verificava, e o token de desfazer era perdido ao fechar o app; servidores não verificados eram aceitos. | BROKEN | DnsEngine: UAC, leitura de volta, desfazer persistente, botão Restaurar DNS, confirmação para servidores sem flag trusted. (Delegação no main.js depende do patch.) |
| `Ajustes TCP (Aplicar/Restaurar)` | "Otimização avançada da pilha TCP" | Ver optimizer:advancedNetwork. | FICTITIOUS | Ver optimizer:advancedNetwork. |

### Aba Defender

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Desativar/Ativar Defender` | "Via TrustedInstaller" | O texto da UI dizia TrustedInstaller (não usado), o resultado só era logado se ok, e a Proteção contra Adulteração fazia o Windows ignorar a mudança sem aviso. | FICTITIOUS | Remove a alegação; usa Set-MpPreference + políticas, checa o estado com o próprio Defender, se Tamper Protection estiver ligada recusa com instruções e botão para abrir a Segurança do Windows e desfaz se não pegou. |

### Aba Debloat UWP

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Remover aplicativos selecionados` | Remover apps pré-instalados | Usava wildcards (*nome*) que podiam remover pacotes de sistema; sem confirmação e sem lista de resultados. | RISKY | Nomes exatos de uma lista fechada, bloqueio de pacotes protegidos, relatório removidos/falhas/ausentes, flag installed e confirmação. |

### Aba Inicialização

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Desativar item de inicialização` | Desativar programas da inicialização | Apagava a entrada Run (irreversível, sem backup) e não tratava HKLM/pasta Startup; sem estado ativado/desativado na UI. | BROKEN | Usa StartupApproved (mesmo mecanismo do Gerenciador de Tarefas): reversível, mostra Ativo/Desativado e escopo; RunOnce tem backup antes de remover. |

### Terminal / eventos

| Ação | Promessa | Realidade (antes) | Veredito | O que foi alterado |
|---|---|---|---|---|
| `Evento run-finish` | Informar o resultado da execução | Sempre registrava "Concluído com sucesso" e desligava o indicador de ocupado mesmo com falhas. | BROKEN | Usa ok/failed reais, logs coloridos por nível (ok/erro/aviso) e o estado ocupado só é controlado pelo handler. |
| `adaptResult / runTasks` | Resultado das operações | Operações que devolviam {ok:false} eram marcadas como Success; execução em paralelo. | BROKEN | adaptResult nunca marca sucesso com ok:false/erro; runTasks é sequencial. |

## Mudanças transversais (valem para todas as linhas acima)

- **Motor de Registro único** (`DeepTweaksEngine` + `OptimizerUtils`): API .NET (`RegistryKey`) em vez de `reg.exe`/strings, comparação canônica de valores (0x1 == 1, 0xffffffff), snapshot antes de aplicar, leitura de volta depois e restauração pelo snapshot (valores exatos anteriores; o padrão do Windows só é usado quando não há snapshot).
- **Resultado honesto**: qualquer falha devolve `ok:false` + `error`; `adaptResult` não relata sucesso com erro; a UI trata cada resposta (antes só fazia algo se `ok` e ignorava o resto).
- **Elevação**: scripts elevados usam marcadores explícitos (`DHDONE` / `DHFAIL|motivo`) em vez do código de saída do invólucro (que refletia só o último comando nativo); saída decodificada de UTF-16LE/BOM; sem `exit` dentro do invólucro.
- **Operações com reversão**: cada operação reversível registra uma operação companheira `optimizer:revert:<nome>` acessível pelo canal existente `optimizer:run`; `listOperations` devolve `applied` (estado real) e `partial`.
- **Presets**: `safe`, `recommended` e `gaming` não contêm VBS, BitLocker, serviços, telemetria, localização nem hibernação (há teste automatizado). `advanced` e `lowLatency` exigem confirmação e cada item mostra seu aviso. MSI e timer ficam fora de todos os perfis.
- **UI**: modal de confirmação para itens avançados/de segurança e lotes; badges de risco, reinício, administrador, segurança, ativo/parcial/padrão; lotes só revertem o que está ativo; todos os textos via `t()` com chaves `optimizer.audit.*` em pt-BR e en-US.

## Limitações restantes

1. **Nada foi testado no Windows.** Toda a lógica pura tem testes (`tests/optimizerAudit.test.ts`), mas scripts PowerShell, fluxo de UAC, escrita no Registro, bcdedit/powercfg/netsh/fsutil, consultas CIM, remoção de Appx e desinstalação do OneDrive precisam de teste manual em Windows 10 e 11 (de preferência numa VM com snapshot).
2. **IPC do main.js**: `optimizer:globalRecommendedTweaks` ainda aplica TODOS os tweaks até o patch em `optimizer_main_patch.md` ser aplicado (a UI nova não usa esse canal). Os handlers de DNS antigos continuam ativos até o mesmo patch; a UI funciona com ambos.
3. **Tamper Protection** não é (nem deve ser) contornada: com ela ligada o Defender não pode ser desativado pelo app.
4. **Ganhos de desempenho** de MMCSS, kernel, timer, MSI, núcleos e TCP são pequenos e dependem de hardware/driver; os textos agora dizem isso, mas o app não executa benchmark antes/depois de FPS.
5. **Traduções**: títulos/descrições/avisos de operações, tweaks e perfis vêm do backend em português; a UI os traduz por chaves `optimizer.audit.op.*`, `.tweak.*` e `.profile.*` (arquivo `optimizer_i18n.json`, a ser mesclado em `src/i18n/messages.ts`). Mensagens de erro/sucesso devolvidas pelos engines continuam em português.
6. **RAM/Áudio** continuam sendo ações temporárias por natureza; a restauração de energia, MSI, kernel e timer exige reiniciar para refletir por completo.
7. **Reversão de remoções** (Appx, OneDrive, capacidades): Appx e OneDrive não têm desfazer automático (reinstalar pela Microsoft Store / instalador); capacidades têm lista de restauração mas dependem de internet.
8. **Itens fora do escopo da página** (Dashboard, Latency Guardian) não foram auditados; Dashboard.tsx tem texto de "MB liberados" que deve ser ajustado (ver patch).
