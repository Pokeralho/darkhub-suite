# Plano completo: DarkHub Suite com paridade de capacidades no Linux (Ubuntu)

> **Objetivo (Opção A, adotada):** paridade **por capacidade**, em fases. Para cada feature hoje acoplada ao Windows: **(1) portar** com equivalente Linux atrás de abstração por plataforma, **(2) portar parcialmente** quando só parte faz sentido, ou **(3) manter Windows-only** quando for inerentemente dependente de Win32/Registry/serviços/drivers/kernel/injeção — sempre degradando com contrato `unsupported` e documentado. Não prometer equivalência 1:1 onde a plataforma não oferece primitiva equivalente.
>
> **Base já entregue (fundação Ubuntu):** `.kilo/plans/1794600498000-linux-ubuntu-contribution-plan.md` — checks/CI Linux (`tsc`, `vitest`, `vite build`), `electron/platform.js` (`unsupported`), `scripts/dev.mjs` POSIX, guards de scripts npm Windows-only, gates de boot/IPC/serviços críticos e correções de portabilidade/testes. Este plano **expande** essa base até cobertura funcional máxima no Linux.

## Princípios e contratos (obrigatórios em todo o trabalho)

- **Zero regressão no Windows:** toda mudança é condicionada por capacidade/plataforma; caminhos/semântica Windows preservados. O job CI Windows continua verde.
- **Abstração por capacidade, não por `if (linux)` espalhado:** introduzir interfaces/módulos por domínio (`platform/*.js` ou providers) selecionados em runtime; handlers IPC e UI consomem o contrato comum.
- **Contrato de indisponibilidade (compatível):** `{ ok: false, unsupported: true, platform: process.platform, reason, error }` (+ campos extras quando útil). Nunca crashar por falta de binário/daemon/API Windows; nunca spawnar `.exe/.ps1/powershell/reg/taskkill/netsh/sc` no Linux.
- **Nível de suporte explícito por feature:** `supported` | `partial` | `unsupported` exposto via capacidade (ex. `*:capabilities`/`*:status`) para a UI decidir renderização/ações, não inferir por texto de erro.
- **Segurança:** sem elevação implícita; operações privilegiadas no Linux usam `pkexec`/PolicyKit ou fluxo explícito e auditável quando viável, caso contrário ficam `unsupported` com orientação.
- **Validação contínua:** cada fase mantém `npx tsc --noEmit -p .`, `npx vitest run`, `npx vite build` verdes no Ubuntu; testes específicos de plataforma via mocks/condicionais justificadas. Smoke de boot do Electron no ambiente disponível.
- **Entregas incrementais:** PRs pequenos por domínio (conforme `.github/PULL_REQUEST_TEMPLATE.md`), sem commit/push/PR automático.

## Inventário e classificação (fonte: `docs/PROJECT_MAP.md`, `docs/map/*`, rotas em `electron/devSelfTest.js`/`src/App.tsx`)

Legenda: **P** = portável/reimplementável, **~** = parcial (subconjunto/alternativa), **W** = inerentemente Windows-only (manter degradado). “Equivalente Linux” indica a primitiva-alvo.

| Rota/área | Domínio | Classe | Equivalente/estratégia Linux | Dependências Windows atuais |
|---|---|---|---|---|
| `home`, `settings` | UI/config/update | **P** | Já cross-platform (Electron/React). Update: `electron-updater` funciona; validar feed/artefatos Linux. | Tray/startup/protocolo parcialmente win-gated |
| `dashboard`, `monitor` | Telemetria/hardware | **~→P** | `/proc`, `/sys/class`, `os`, `systeminformation` (onde confiável), NVML/DRM/`lspci`/`sensors`/`hwmon` para GPU/temps/fans; CPU por core, RAM, disco, rede, processos, DPC **W** (sem DPC). Leituras reais ou “indisponível”, nunca estimar. Substituir daemons C# (`DarkHub.SensorDaemon`, `HwSensors`) por coletores Node/nativos Linux ou LHM-for-Linux quando viável. | `HardwareService`, `DeepHardwareService`, `electron/hal/**`, `HwSensorsDaemon`, `Slow/FastSensorDaemon`, WMI/PDH/ETW/.exe |
| `darkos` | Mods DarkOS/recovery | **W (~docs)** | Manifesta/CLI/PSM1 são do ecossistema DarkOS (imagem Windows). No Linux: detectar não aplicável, expor estado `unsupported` com explicação; manter UI informativa. Só portar se houver alvo DarkOS-Linux formal (fora de escopo atual). | `darkosIpc`, `DarkOSRecoveryService`, `DarkOS.Cli.ps1`, `Recovery/*.psm1`, Registro/serviços |
| `optimizer` (núcleo) | Tweaks sistema/registro/energia/rede/serviços/memória/armazenamento/visual/apps | **~** | Separar em: (a) tweaks com análogo (`sysctl`, `cpupower`/governor, perf-bias, swappiness, dirty ratios, TRIM/fstrim, DNS via `resolvectl`/NetworkManager, autostart XDG, nice/ionice, limpeza `/tmp`/cache) — **P** por provider; (b) Registro/serviços Windows, pagefile/HAGS/Defender/Recall/power plans Windows, BCD/NTFS flags — **W**. `DeepTweaksEngine`/`SystemOptimizerService` precisam de backend por plataforma e catálogo anotado com `platforms`. | `services/optimizer/*` (PowerShell/reg/powercfg/sc/netsh), `wu-diagnose.ps1` |
| `ultra-latency` | Latência/input/timer/MMCSS | **~** | Análogos parciais: governor/perf, IRQ affinity, `preempt`/sched tuning, gamemode/MangoHud hints **P** onde seguro; MMCSS/timer resolution Win32, interrupt policy Windows — **W**. | `latencyGuardian`, `NativeLatencyClient`, `DarkHub.LatencyEngine.cs/.exe` |
| `darkpacer`/`framepacer` | Frame limiter/pacing | **~** | Limiter userspace cross-platform (Rust `native_pacer` já existe: avaliar build Linux + apresentação X11/Wayland/Vulkan layer) **~→P**; overlay Win32/DXGI atual **~**. | `FramePacerEngine`, `FramePacerOverlay`, `DarkHub.FrameLimiter.*`, hooks/DLL Win32 |
| `optiscaler` | OptiScaler/FG | **~** | Gerenciar arquivos/mods em jogos (Wine/Proton/Linux nativos) **P**; injeção/mods específicos DXGI/DX12 Windows **~**. Depende do suporte real do OptiScaler no alvo. | `optiscalerManager`, DLLs |
| `dlss5` | DLSS swap/autopilot | **W (~)** | DLSS/NGX é NVIDIA+Windows/DX na prática do produto; no Linux só possível em cenários Proton/DXVK suportados — tratar como **~** experimental só se validado, default **W**. | `services/dlss5`, DLLs NVIDIA |
| `dll-injector` | Injeção DLL | **W** | Injeção Win32 não existe no Linux; desabilitar com explicação. (LD_PRELOAD é outro modelo e fora do produto.) | `DarkHub.Injector.ps1` |
| `driver` | Drivers/câmera/captura | **~** | GPU detect via `lspci`/`/sys`/Mesa/NVIDIA **P**; instalação/links de drivers Windows, reparo câmera WinRT/DirectShow — **W/~** (oferecer diagnósticos/links distro/NVIDIA quando aplicável). | `DriverCenterService`, `DriverInstallService`, winget/PowerShell |
| `networktools` | Diagnóstico/reparo rede | **~** | `ip`, `ss`, `nmcli`, `resolvectl`, `ping/traceroute` **P**; reset stack Winsock/netsh, firewall Windows — **W**. | `networkIPC`, `netsh` |
| `setuphub` | Instalação de apps | **~** | Abstrair gerenciador: winget (Win) / `apt`+Flathub+snap quando apropriado (Ubuntu) **P** para catálogo curado; preservar winget no Windows. | winget, scripts Windows |
| `library` | Biblioteca de jogos | **~** | Scan Steam/Lutris/Heroic/Bottles paths Linux **P**; launchers/paths Windows atuais **~**. | `libraryStore`, paths |
| `security` | Hosts/firewall/portas/Defender/URL | **~** | Edição `/etc/hosts` (privilegiada) **P** com backup; audit portas `ss` **P**; firewall `ufw/nft/iptables` **~**; controle Defender — **W**. | `SecurityService`, Defender/netsh |
| `passwords` | Cofre AES-GCM | **P** | `electron/vaultCrypto.js` e storage local já agnósticos; validar caminhos/IPC. | — |
| `decryption`, `devtools`, `summarizer`, `texteditor` | Ferramentas renderer/fs | **P** | Já majoritariamente renderer/Node (`fs`); revisar paths e disponibilidade. | — |
| `converter` | Conversão mídia/docs/imagem | **~** | `sharp`, `ffmpeg-static`/ffmpeg do sistema, `pdf-parse` **P**; deps vendorizadas Windows (LibreOffice/imagetools portáteis) — prover alternativa Linux (LibreOffice do sistema, pacotes) **~**. | `converterIpc`, binários vendorizados |
| `downloads` | Gerenciador downloads | **P** | Lógica Node/Electron; validar paths/permissões. | — |
| `youtube` | yt-dlp/FFmpeg | **P** | `yt-dlp`/`ffmpeg` binários por plataforma (baixar/usar do sistema) — generalizar resolução. | `ytdlp.js` (exe) |
| `ocr` | OCR | **P** | `tesseract.js` cross-platform. | — |
| `metadata` | ExifTool/ffprobe | **P** | `exiftool-vendored`/`exifr`/ffmpeg resolvidos por plataforma. | paths win |
| `autoclicker` | Click engine | **~** | No Linux X11/Wayland APIs diferentes (uinput/ydotool/XTest) e restrições de segurança; viável como **~** (X11 primeiro) ou **W** se não confiável — avaliar. | `DarkHub.ClickEngine.cs` |
| `powershell` | Execução PS/scripts | **W** | Superfície específica de Windows; no Linux expor `unsupported` (ou futuro “shell tools” separado, fora de escopo). | `PowerShellRunner`, `PowerShellToolsService`, `.ps1` |
| `benchmark`, `gpubench`, `spacesniffer`, `disk-rescue` (scan) | Bench/scan nativos | **~** | Rust crates (`native_gpubench`, `native_disk`, `native_cleaner`) — compilar para Linux e integrar binários por plataforma **P** onde o código for portável; UI/IPC ok. Features de disco/partição destrutivas: **read-only/diagnóstico P**, mutação de partições **W/~** (muito arriscado, requer backends `parted`/`udisks` e validação extensa). | `.exe`, APIs NTFS/Win32 |
| `realtime` (otimizador/proteção) | Watchers/trim/ClamAV/regras | **~** | `fs.watch`/scan/hash/quarentena **P**; trim RAM/process rules via `ps`/`/proc`/`renice` **~**; integração ClamAV já externa **P**. | `EmptyWorkingSet`/Win APIs |
| `savebackup` | Backups de saves | **~** | Paths Linux/Proton prefixes **P** (já há base cross-path); discovery por launchers Windows **~**. | paths/heurísticas |
| `overlay` | Overlay/PresentMon/atalhos | **~** | Overlay em jogos no Linux é stack específica (MangoHud/Vulkan layer/X11) — **~** difícil; PresentMon é Windows **W**. | `OverlayService`, `PresentMonService`, hotkeys globais Win32 |
| `startup`, `maintenance`, `usb`, `restore`, `share` (captura), `kakugan` | Diversos utilitários | **~** | Startup XDG autostart **P**; manutenção (SFC/DISM/chkdsk/restore points) **W**; USB criação de mídia DarkOS/Win — **W**; restore componentes Windows — **W**; captura de tela: `grim`/`spectacle`/X11 **~** (exclusivo fullscreen depende compositor); kakugan conforme deps. | `startupIpc`, `MaintenanceService`, `usb-media.ps1`, `RestoreService`, APIs captura Win32 |

## Arquitetura alvo (evolução incremental)

1. **Camada de capacidade (`electron/capabilities/` ou `electron/platform/`)**
   - `platform.js` (já existe) + `capabilities.js` agregando por domínio: `{ hardware, optimizer, latency, framePacer, drivers, network, security, setup, capture, ... } -> { level: 'supported'|'partial'|'unsupported', reason?, features? }`.
   - Handler `app:getCapabilities` (e/ou por namespace) para a UI.
2. **Providers por domínio (`electron/services/<dominio>/platform/{windows,linux}.js`)**
   - Manter implementação Windows atual como provider `windows`; extrair contrato comum; implementar `linux` progressivamente. Ex.: `optimizer/providers/linux/*`, `hardware/collectors/linux/*`, `network/providers/linux.js`.
3. **Resolução de binários/paths por plataforma (`electron/services/binResolver.js`)**
   - Centralizar localização de `ffmpeg`, `yt-dlp`, `exiftool`, `tesseract` data, Rust helpers, ferramentas de sistema; eliminar hardcodes `.exe`/`where.exe`/`C:\`.
4. **IPC resiliente**
   - Handlers de domínios não portados retornam `unsupported` via helper; domínios parciais retornam `partial` + resultados do que foi possível. Registro de canais nunca falha por ausência de backend.
5. **UI orientada a capacidade**
   - Componentes checam `supported/partial/unsupported`: desabilitam ação, mostram motivo/alternativa, evitam polling inútil (ex. `latency:getConfig` em loop quando desativado). Textos em pt-BR/en-US.
6. **Nativos (Rust/C#)**
   - **Rust** (`native_pacer`, `native_disk`, `native_cleaner`, `native_gpubench`): adicionar targets `x86_64-unknown-linux-gnu`, compilar no CI Linux, empacotar binários por OS. **C#/.ps1/.exe**: permanecem Windows-only; substituir por provider Linux em Node/Rust onde houver equivalente.

## Fases de execução (com entregáveis e critérios de aceite)

### Fase 0 — Consolidação da fundação (já majoritariamente pronta; fechar lacunas)
- **Tarefas:** garantir que todos os handlers usados no boot/rotas comuns nunca lancem no Linux; padronizar respostas `unsupported` restantes; expor `app:getCapabilities` mínimo; silenciar/condicionar polling da UI quando capacidade ausente (corrige ruído `ERR latency:getConfig`/`optimizer:getHagsStatus`).
- **Arquivos-alvo:** `electron/main.js`, `electron/ipc/*`, `electron/latencyGuardian.js`, `electron/services/*Engine*` tocados no boot, `src/pages/UltraLowLatency.tsx`, `src/pages/Optimizer.tsx`, `src/components/monitor/*`.
- **Aceite:** `npm run dev` no Ubuntu abre UI navegável sem crash/exceções não tratadas; logs sem spam de erros esperados.

### Fase 1 — Infra de capabilities, binários e observabilidade
- Implementar `capabilities` + providers esqueleto Linux; `binResolver` (ffmpeg/yt-dlp/exiftool); adaptação de `ytdlp.js`, `metadata/*`, `converter` para resolução por plataforma.
- **Aceite:** `youtube`, `metadata`, `ocr`, `converter` (formatos suportados por libs/bins disponíveis), `downloads`, `passwords`, `texteditor/decryption/devtools/summarizer` funcionais no Ubuntu quando deps presentes; degradação clara quando não.

### Fase 2 — Telemetria e hardware (valor central no Linux)
- Coletores Linux para CPU/RAM/disco/rede/GPU/temps/fans/processos via `/proc`, `/sys`, `systeminformation` e ferramentas do sistema; integrar ao `HardwareService`/HAL sem daemons `.exe`.
- **Aceite:** Dashboard/Monitor mostram métricas reais disponíveis e “indisponível” para o resto (incl. DPC **W**); sem spawn de daemons Windows; polling estável.

### Fase 3 — Rede, segurança, setup e utilitários de usuário
- `networktools`: diagnósticos (`ping`, `traceroute`, DNS, interfaces) + tweaks seguros Linux; sem netsh/Winsock reset. `security`: `/etc/hosts` com backup/elevação explícita, portas, heurísticas; firewall/Defender marcados conforme suporte. `setuphub`: provider apt/flatpak/snap. `startup`: XDG autostart. `library`: detecção Steam/Proton/Lutris/Heroic.
- **Aceite:** operações suportadas executam e revertem; privilegiadas pedem confirmação/elevação correta ou retornam `unsupported` orientado.

### Fase 4 — Optimizer por capacidade (maior esforço)
- Refatorar catálogo/execução para declarar `platforms`/`provider`; implementar subset Linux (governor/cpupower, sysctl de rede/VM seguros e reversíveis com snapshot, limpeza, DNS, autostart, prioridades) e marcar explicitamente itens de Registro/serviços/Defender/HAGS/power plans Windows como **W**.
- **Aceite:** UI mostra apenas ações aplicáveis (ou claramente indisponíveis) por plataforma; aplicar/reverter idempotente com snapshot no Linux para itens suportados.

### Fase 5 — Nativos, jogos, captura e realtime avançado
- Compilar/empacotar crates Rust para Linux; avaliar `native_pacer`/limiter e `optiscaler` em cenários Linux/Proton; captura de tela via ferramentas Linux/portais; `realtime` com regras/scan/quarentena cross-platform e trim via mecanismos Linux. Overlay/PresentMon/DLSS5/injeção permanecem **W/~** conforme viabilidade real (prototipar, documentar resultado).
- **Aceite:** binários Linux incluídos quando estáveis; features viáveis ativadas, demais `partial/unsupported` com razão.

### Fase 6 — Empacotamento, distribuição e documentação Linux
- `electron-builder` targets Linux (`AppImage`, `deb`; avaliar `rpm`) com ícones/metadados, dependências declaradas; CI publica/valida artefatos (smoke de instalação quando possível). Atualizar `README.md`/`CONTRIBUTING.md` com matriz de suporte por feature (P/~/W), pré-requisitos (ex. `cpupower`, `gamemode`, `libayatana-appindicator`/tray, permissões), e limitações conhecidas (Wayland/X11, sandbox, captura). Atualizar `.github/PULL_REQUEST_TEMPLATE.md` se checks Linux mudarem.
- **Aceite:** artefato Linux instalável abre e opera features suportadas; matriz de suporte documentada e consistente com `capabilities`.

## Matriz de validação (por fase/PR)

| Verificação | Ubuntu (obrigatório) | Windows (obrigatório) |
|---|---|---|
| Tipos | `npx tsc --noEmit -p .` | job CI Windows |
| Testes | `npx vitest run` | job CI Windows |
| Build renderer | `npx vite build` | job CI Windows |
| Smoke app | `npm run dev` ou `npm run build:renderer && npx electron .` (evidência; headless: ausência de crash de plataforma) | smoke manual/CI quando aplicável |
| Nativos (fases 5–6) | build/test crates + binários presentes | build existente preservado |
| Empacote (fase 6) | `electron-builder --linux` gera artefato | targets Windows inalterados |

## Riscos e mitigações

- **Regressão Windows:** providers isolados, CI Windows obrigatório, flags de capacidade, testes de contrato.
- **Diversidade Linux (distro/Wayland/X11/privilegios):** focar Ubuntu LTS/current como baseline; detectar compositor/ferramentas e degradar; documentar pré-requisitos.
- **Elevação/segurança (hosts, sysctl, pacotes):** ações explícitas, auditáveis, reversíveis; nunca escalar silenciosamente.
- **Expectativa de paridade total:** comunicar matriz P/~/W na UI e docs; `unsupported` sempre com motivo.
- **Escopo/tempo:** fases independentes, valor entregue cedo (fases 1–3) antes de refactors pesados (4–5).

## Critério de “concluído” do plano (estado-alvo)

- Matriz de capacidades publicada e refletida na UI; todas as rotas abrem no Ubuntu sem crash.
- Features classificadas **P** implementadas e testadas; **~** com melhor esforço viável entregue e limitações explícitas; **W** isoladas, documentadas e nunca acionadas no Linux.
- CI Ubuntu+Windows verde; artefatos Linux distribuíveis; documentação de suporte/limitações completa.
