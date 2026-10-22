# DarkHub Suite: mapa do projeto

Guia para achar o código de qualquer função **sem varrer o projeto inteiro**. Comece aqui e só abra os arquivos que o mapa apontar.

| Quero... | Abra |
|---|---|
| Saber onde fica uma funcionalidade ("a função X do Otimizador") | `npm run map:find -- <termo>` ou este arquivo, seção **Funcionalidades** |
| Ver a tela → canal IPC → handler → serviço de uma página | [`docs/map/FEATURES.md`](map/FEATURES.md) |
| Achar um item do Otimizador / tweak pelo nome em português | [`docs/map/CATALOG.md`](map/CATALOG.md) |
| Achar um canal IPC (`window.darkhub.x.y`) e quem o usa | [`docs/map/IPC.md`](map/IPC.md) |
| Achar uma função pelo nome (arquivo:linha) | [`docs/map/SYMBOLS.md`](map/SYMBOLS.md) |
| Ver dependências entre módulos / quem chama quem | `graphify explain "Nome"` · `graphify-out/GRAPH_REPORT.md` · `graphify-out/graph.html` |

Os arquivos em `docs/map/` e `graphify-out/` são **gerados**. Depois de mudar código, rode `npm run map` (leva ~15 s, sem custo de IA).

---

## Como uma função do app funciona (o fluxo)

```
src/pages/<Tela>.tsx            React (renderer). Chama window.darkhub.<ns>.<metodo>(payload)
        │
electron/preload.js             contextBridge: <ns>.<metodo> -> ipcRenderer.invoke('<ns>:<canal>')
        │                       (tipos em src/global.d.ts -> interface DarkHubAPI)
electron/main.js                ipcMain.handle('<ns>:<canal>') ... a maioria dos handlers fica aqui
electron/ipc/*.js               handlers de darkos:*, driver:*, powershell:*
electron/networkIPC.js          handlers de network:*
electron/services/downloads/registerDownloadsIPC.js   handlers de downloads:*
        │
electron/services/**            lógica de verdade (engines, serviços, PowerShell, binários nativos)
```

Para mexer numa função quase sempre basta: **a tela** + **o handler** + **o serviço**. O `FEATURES.md` lista os três para cada tela, com linha.

Eventos do main para a tela (`onUpdate`, `onLog`, `onMetrics`...) usam `webContents.send` e aparecem no `IPC.md` como "evento main->tela".

---

## Funcionalidades (rota → tela → backend)

A rota é o `id` usado em `src/App.tsx` (switch `renderPage`) e no menu (`src/layouts/MainLayout.tsx`, array `navSections`).

### Visão geral
| Rota | Tela | Backend principal |
|---|---|---|
| `home` | `src/pages/Home.tsx` | `electron/main.js` |
| `dashboard` | `src/pages/Dashboard.tsx` | `electron/services/HardwareService.js`, `electron/hal/**`, engines do otimizador (memória, storage) |
| `darkos` | `src/pages/DarkOSCenter.tsx` + `src/components/darkos/*` | `electron/ipc/darkosIpc.js` → `electron/services/darkos/DarkOSRecoveryService.js` → `DarkOS.Cli.ps1` → `DarkOS.Recovery.psm1` |

### Jogos e desempenho
| Rota | Tela | Backend principal |
|---|---|---|
| `optimizer` | `src/pages/Optimizer.tsx` | `electron/services/optimizer/*` (ver seção Otimizador) |
| `ultra-latency` | `src/pages/UltraLowLatency.tsx` | `electron/latencyGuardian.js`, `electron/services/NativeLatencyClient.js`, `DarkHub.LatencyEngine.cs` |
| `darkpacer` / `framepacer` | `src/pages/FramePacer.tsx` | `electron/services/FramePacerEngine.js`, `FramePacerOverlay.js`, `DarkHub.FrameLimiter.cs`, `native_pacer/` (Rust) |
| `optiscaler` | `src/pages/OptiScalerManager.tsx` | `electron/optiscalerManager.js` |
| `dlss5` | `src/pages/Dlss5Manager.tsx` | `electron/services/dlss5/Dlss5Service.js` |
| `dll-injector` | `src/pages/DllInjector.tsx` | `electron/main.js` (`injector:*`) → `electron/DarkHub.Injector.ps1` |

Obs.: no `preload.js` o namespace do FramePacer é `darkpacer`, com o apelido `framepacer` (as duas formas funcionam).

### Diagnóstico e hardware
| Rota | Tela | Backend principal |
|---|---|---|
| `monitor` | `src/pages/SystemMonitor.tsx` | `electron/services/HardwareService.js`, `DeepHardwareService.js`, `electron/hal/**`, `DarkHub.SensorDaemon.cs` |
| `driver` | `src/pages/DriverCenter.tsx` | `electron/ipc/driverIpc.js` → `electron/services/DriverCenterService.js` |
| `networktools` | `src/pages/NetworkTools.tsx` | `electron/networkIPC.js` |
| `setuphub` | `src/pages/SetupHub.tsx` | `electron/main.js` (`setup:*`, winget) |

### Utilitários
| Rota | Tela | Backend principal |
|---|---|---|
| `spacesniffer` | `src/pages/SpaceSniffer/` (Mapa de disco: `index.tsx`, `TreemapCanvas.tsx`, `treemap.ts`) | `electron/ipc/diskScanIpc.js` → `electron/services/diskscan/` (`DiskScanService`, `ScanModel`, `filter`) → `electron/services/DarkHub.DiskScan.exe` |
| `library` | `src/pages/Library.tsx` + `src/components/library/*` | `electron/libraryStore.js`, `CoverProviderService.js` |
| `security` | `src/pages/AdvancedSecurity.tsx` | `electron/services/SecurityService.js` |
| `passwords` | `src/pages/PasswordManager.tsx` | `electron/main.js` (`vault:*`) → `electron/vaultCrypto.js` |
| `decryption` | `src/pages/Decryption.tsx` | só no renderer (crypto-js) |
| `converter` | `src/pages/FileConverter.tsx` | `electron/main.js` (`files:*`: sharp, ffmpeg-static; PDF via pdf-parse em `files:convertDocuments`) |
| `downloads` | `src/pages/Downloads.tsx` | `electron/services/downloads/*` |
| `youtube` | `src/pages/YoutubeDownloader.tsx` | `electron/main.js` (`youtube:*`) → `electron/ytdlp.js` (yt-dlp.exe) |
| `ocr` | `src/pages/ImageTextExtractor.tsx` | `electron/main.js` (`ocr:*`, tesseract.js) |
| `metadata` | `src/pages/MetaDataEditor.tsx` | `electron/main.js` (exiftool-vendored, exifr) |
| `texteditor` | `src/pages/TextEditor.tsx` | `electron/main.js` (`fs:*`) |
| `summarizer` | `src/pages/TextSummarizer.tsx` | resumo calculado na própria tela (`summarize()`); arquivo lido via `fs:readFile` em `electron/main.js` |
| `autoclicker` | `src/pages/AutoClicker.tsx` | `electron/main.js` (`autoclicker:*`) → `DarkHub.ClickEngine.cs` |
| `devtools` | `src/pages/DevTools.tsx` | só no renderer |
| `powershell` | `src/pages/PowerShellTools.tsx` | `electron/ipc/powershellIpc.js` → `electron/services/PowerShellToolsService.js` |
| `luluflix` / `juuzou` | `src/pages/LuluFlix.tsx`, `Juuzou.tsx` → `src/components/EmbeddedSitePage.tsx` | webview; `main.js` (`will-attach-webview`, `setWindowOpenHandler`) |
| `settings` | `src/pages/Settings.tsx` | `electron/configManager.js`, `electron/services/UpdateService.js` |

---

## Otimizador de Sistema (a parte mais pedida)

Camadas, de cima para baixo:

1. **Tela**: `src/pages/Optimizer.tsx`. Abas e botões chamam `api().<metodo>` (`api = window.darkhub.optimizer`).
2. **Handlers**: `electron/main.js`, canais `optimizer:*` (lista com linha em `docs/map/IPC.md`).
3. **Catálogo de operações**: `electron/services/optimizer/SystemOptimizerService.js`, `registerOperations()`. Cada item tem `id: 'optimizer:<nome>'`, `name` em português, `category`, `risk`, `execute`/`revert`/`statusFn`. Itens `_tweakOp` só apontam para tweaks de registro (`tweakIds`).
4. **Tweaks de registro**: `electron/services/optimizer/DeepTweaksEngine.js`, `defineTweak({ id: 'tweak:<nome>', rows: [[chave, valor, tipo, novo, padrão]] })`. Snapshots de "antes" permitem desfazer.
5. **Engines** (a ação de verdade):

| Engine | Cuida de |
|---|---|
| `SystemEngine.js` | pagefile, NTFS last access, ponto de restauração, Recall, modos hardcore/kernel |
| `PowerEngine.js` | planos de energia (Alto Desempenho / Desempenho Máximo), restaurar anterior |
| `MemoryEngine.js` | liberar RAM, status de RAM, ajuste de áudio |
| `StorageEngine.js` | limpeza de temporários / lixo |
| `NetworkEngine.js` | flush DNS, tweaks de rede avançados |
| `DnsEngine.js` | presets de DNS (guarda o DNS original) |
| `ServicesEngine.js` | serviços do Windows (snapshot do modo de inicialização) |
| `AppManagerEngine.js` | apps de inicialização, desinstalador, prioridade de processo, HAGS |
| `DefenderControlEngine.js` | Defender (desativar/ativar, restaurar remoção da imagem DarkOS) |
| `VisualsEngine.js` | efeitos visuais "melhor desempenho" (só HKCU, com snapshot) |
| `ToolboxEngine.js` | atalhos: abrir antivírus, SpaceSniffer, Gerenciador de Tarefas |
| `WindowsToolsEngine.js` | aba "Recursos & Reparos": recursos do Windows (estado real), reset do Windows Update, reparo do winget, limpeza do WinSxS, Edge, BitLocker, autologon, painéis clássicos. IPC `wintools:*` em `electron/ipc/winToolsIpc.js`; tela `src/components/optimizer/WindowsToolsPanel.tsx` |
| `ElevationHelper.js` | rodar PowerShell como administrador (UAC) e ler a saída |
| `OptimizerUtils.js` | helpers comuns: escape para PowerShell, parse de `reg`/`powercfg`, marcadores `DH*\|` |

**Exemplo:** "arrume a telemetria do otimizador".
`npm run map:find -- telemetria` retorna `optimizer:disableTelemetry` em `SystemOptimizerService.js:184`, que aponta para `tweak:disableTelemetry` em `DeepTweaksEngine.js:177`. Pronto: são 2 arquivos.

Testes: `tests/optimizerAudit.test.ts`, `tests/system.test.ts`.

---

## DarkOS (integração com o sistema próprio)

- Detecção: `darkos:isDarkOS` → `DarkOSRecoveryService.info()`.
- **Modo Windows ("Mods do DarkOS")**: no Windows comum os mesmos canais `darkos:*` usam um segundo serviço (`mode: 'windows'`, escolhido por `pick()` em `darkosIpc.js`): módulo embutido + `electron/services/darkos/policy/catalog.json` (cópia de `D:\Backup\ISOLab\Work\darkos-core\policy\catalog.json`; recopie quando o catálogo do DarkOS mudar), estado em `C:\ProgramData\DarkHub\WinMods`, itens `defaultUser` vão para o HKCU. No DarkOS, `DARKHUB_WINMODS=1` (só dev) força o modo para testar.
- Cadeia: `darkosIpc.js` → `DarkOSRecoveryService.js` (fila, timeout, progresso `DKPROG:`, resultado `DKJSON`/`DHDONE`) → `DarkOS.Cli.ps1` → `DarkOS.Recovery.psm1` (catálogo de mudanças, manifest com lock, snapshots, perfis, restauração de Appx via payload/Store/winget).
- PowerShell 5.1: não use sintaxe do PS7 (`??`, ternário, `-Parallel`). O módulo é só ASCII.
- Testes: `tests/darkosService.test.ts`.

---

## Infraestrutura comum

| Assunto | Onde |
|---|---|
| Rodar PowerShell (normal) | `electron/services/PowerShellRunner.js` (`runPowerShell`, `runCommand`) |
| Rodar como admin | `electron/services/optimizer/ElevationHelper.js` |
| Log (com mascaramento de segredos) | `electron/services/LoggerService.js` |
| Download seguro com hash | `electron/services/SecureDownload.js` |
| Atualização do app | `electron/services/UpdateService.js` (GitHub, exige SHA-256) |
| Configurações persistentes | `electron/configManager.js` |
| Processos filhos gerenciados | `electron/services/ManagedProcessRegistry.js` |
| Binários nativos (fonte → exe) | `electron/services/DarkHub.*.cs` (`npm run build:native`), `native_pacer/` Rust (`npm run build:pacer`) |
| Traduções | `src/i18n/messages.ts` (geral) e `src/i18n/darkosMessages.ts` (DarkOS, PowerShell, chaves novas); `t('chave', 'fallback')` via `useI18n()` de `src/i18n/I18nProvider.tsx`. Sempre adicionar **pt-BR e en-US**. |
| Tipos da API da tela | `src/global.d.ts` (`DarkHubAPI`) |
| Erros por página | `src/components/ErrorBoundary.tsx` (usado em `src/App.tsx`) |
| Empacotamento | `package.json` → `build` (asarUnpack para .exe/.dll/.ps1) |

### Para adicionar uma função nova
1. Serviço em `electron/services/...`
2. Handler `ipcMain.handle('<ns>:<acao>')` em `main.js` (ou `electron/ipc/<ns>Ipc.js`)
3. Método em `electron/preload.js` + tipo em `src/global.d.ts`
4. Tela/aba em `src/pages/...` + chaves i18n pt-BR/en-US
5. Teste em `tests/*.test.ts`. Rode `npx tsc --noEmit -p .`, `npx vitest run` e `npm run map`.

### Fora de escopo (não reintroduzir)
Steam Lua / SteamUnlocker / Goldberg / Steamless foram removidos de propósito (`tests/noProhibitedSteamTools.test.ts` garante isso).
