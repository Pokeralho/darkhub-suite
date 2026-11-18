# Plano: motor do Otimizador em Rust (`DarkHub.SysOps.exe`)

Status (2026-11-18): **fases 0 e 1 feitas** (crate `native_sysops/`, `SysOps.js`, leitura e escrita do registro no
`DeepTweaksEngine`, testes de paridade em `tests/sysops.test.ts`). Medido nesta máquina: status dos tweaks (157 valores)
de 414–1217 ms para 23 ms; gravar 40 valores de ~350 ms para 16 ms. Rodada 45 na VM (setup 0.9.5 instalado, processo
elevado, integridade cobrada): 289 valores reais lidos igual ao PowerShell (2666 ms → 41 ms), 81/82 tweaks aplicados
(270 escritas pelo helper, 64 em HKLM), desfazer sem nenhuma diferença, helper adulterado recusado com volta ao PS.
Sai na 0.9.5. Falta: fases 2 a 6.
Também usam o helper, sem mudança no código deles: `HubService` e `AppManagerEngine` (passam por `readEntries` /
`runRegistryOps`). Ainda em PowerShell: `security/hardeningCatalog.js`, que monta os próprios scripts de registro.

## Objetivo

Trocar o PowerShell que o Otimizador gera em texto por um helper Rust que fala direto com as APIs do Windows
(registro, serviços, energia). A tela, o catálogo, os textos e o histórico de desfazer continuam em JS. Muda só
**quem executa** a leitura e a escrita.

O que se ganha:

- **Velocidade.** Abrir o `powershell.exe` custa ~180 ms nesta máquina; um `.exe` nativo, ~7 ms. Em PCs comuns
  a diferença é maior, e scripts com CIM (`FACTS_SCRIPT`) levam segundos.
- **Segurança.** Não existe mais string de script montada: o helper recebe JSON e só conhece uma lista fechada
  de operações. Acaba a classe de bugs de escape/injeção da auditoria.
- **Confiabilidade.** Tipos de registro tratados de forma exata (QWORD, MULTI_SZ, EXPAND_SZ, BINARY), sem as
  conversões do PowerShell 5.1, e um erro por item em vez de um `stderr` genérico.
- **Antivírus.** Menos `powershell -ExecutionPolicy Bypass` oculto rodando como administrador.

## Como está hoje (levantamento)

| Parte | Mecanismo atual | Volume |
|---|---|---|
| Tweaks de registro (`DeepTweaksEngine` + `MoreTweaks`) | `buildRegistryScript` / `buildRegistryReadScript` em `OptimizerUtils.js` geram PS com `[Microsoft.Win32.RegistryKey]` | 90 tweaks, 10 com `dynamicRows`, 10 com `serviceTargets` |
| Tweaks com script próprio (`commands`) | blocos PS no lote elevado | 9 (hibernação, armazenamento reservado, menu de boot, NTP, tarefas de telemetria, AutoLogger...) |
| Fatos da máquina (`FACTS_SCRIPT`) | PS + `Get-CimInstance` (build, RAM, GPUs) | 1 chamada por sessão, 1–3 s |
| Planos e ajustes de energia | `powercfg` | `PowerEngine` 15, `SystemEngine` 13, `SystemOptimizerService` 16 |
| Serviços | `Get-Service` / `Set-Service` / `sc` | `ServicesEngine`, `AppManagerEngine`, `serviceTargets` |
| Rede / DNS | `netsh`, `Set-DnsClient*` | `NetworkEngine`, `DnsEngine` |
| Apps (AppX) | `Get-AppxPackage` / `Remove-AppxPackage` | 16 chamadas em `AppManagerEngine` |
| Defender, DISM, winget, WU | PS e ferramentas do sistema | `DefenderControlEngine`, `WindowsToolsEngine`, `wuDiagnose` |

Detalhes que mudam o desenho:

- O app empacotado já roda como administrador (`requestedExecutionLevel: requireAdministrator`), e
  `ElevationHelper.runElevatedPowerShell` executa direto quando `isElevated()`. O helper pode então ser chamado com
  `execFile` e stdin, sem UAC, sem arquivo temporário e sem `.vbs`. O caminho via `runas` só sobra para `npm run dev`
  sem admin.
- Os snapshots de desfazer (`deepTweaksUndoStore`) e a lógica de "não sobrescrever o snapshot original" ficam em JS.
  O helper só lê e escreve, então o formato do arquivo de undo **não muda** e quem atualizar não perde o desfazer.
- `runRegistryOps` já separa HKCU de HKLM e devolve `{ ok, message }` por item, alinhado com `ops`. O helper devolve
  exatamente isso, e o resto do motor não percebe a troca.

## Desenho

Novo crate `native_sysops/` (mesmo padrão do `native_cleaner`: `windows-sys`, `serde_json`, `crt-static`,
`panic = "abort"`), gerando `electron/services/DarkHub.SysOps.exe`, que entra no `integrity.json`.

Protocolo: uma requisição JSON pelo stdin e uma resposta JSON pelo stdout; o processo sai em seguida.

```json
{ "v": 1, "ops": [
  { "op": "reg.read",  "key": "HKLM\\SOFTWARE\\...", "name": "X" },
  { "op": "reg.set",   "key": "HKCU\\Software\\...", "name": "Y", "type": "REG_DWORD", "data": "0" },
  { "op": "reg.deleteValue", "key": "...", "name": "Z" },
  { "op": "reg.deleteKeyIfEmpty", "key": "..." },
  { "op": "svc.query", "name": "DiagTrack" },
  { "op": "svc.setStart", "name": "DiagTrack", "start": "disabled" },
  { "op": "power.read", "scheme": "active", "sub": "...", "setting": "..." }
]}
→ { "v": 1, "results": [ { "ok": true, "value": "...", "type": "REG_DWORD", "exists": true, "keyExists": true }, ... ] }
```

Regras do helper (iguais às de hoje, agora em código):

- Sempre `KEY_WOW64_64KEY`. Recusa a raiz de uma hive e hives fora de HKLM/HKCU/HKCR/HKU.
- Um resultado por op, na mesma ordem; uma falha não interrompe o lote.
- Sem op genérica de "executar comando". O que precisar de processo externo continua no JS, com `execFile`.

Do lado JS, uma camada `SysOps.js` com `run(ops)` substitui `buildRegistryScript` + `parseDhResults` dentro de
`runRegistryOps` e `readEntries`. Durante a transição, uma chave `optimizer.engine = 'native' | 'powershell'`
(padrão `native`) mantém o caminho antigo como reserva por uma versão.

## Fases

Cada fase termina com tsc, vitest, `cargo test`, `npm run integrity`, `npm run map` e a rodada na VM
(aplicar → ler status → desfazer → comparar com o snapshot).

| Fase | Escopo | Tamanho | Ganho visível |
|---|---|---|---|
| **0. Base** | crate, protocolo, build script, CI (`cargo test` no job native), integrity, `SysOps.js`, medição antes/depois (abrir a tela, checar status, aplicar os recomendados) | 1–2 dias | nenhum ainda |
| **1. Registro** | `reg.read/set/deleteValue/deleteKey/deleteKeyIfEmpty`, com os mesmos tipos de `validateChange`. Liga `readEntries`, `runRegistryOps`, `captureSnapshot`, `checkTweaksStatus`. Cobre os 90 tweaks sem `commands` | ~1 semana | status do Otimizador quase instantâneo; aplicar ou desfazer em lote em < 1 s |
| **2. Fatos da máquina** | build, RAM (`GlobalMemoryStatusEx`) e GPUs (classe de vídeo no registro), no lugar do `FACTS_SCRIPT` | 1–2 dias | a primeira abertura da tela deixa de esperar 1–3 s |
| **3. Serviços** | `svc.query/setStart/stop/start` via SCM (`OpenSCManager`, `ChangeServiceConfig`, `QueryServiceConfig`). `ServicesEngine`, `serviceTargets` (com `bestEffort`) e a parte de serviços do `AppManagerEngine` | 3–4 dias | a aba Serviços carrega e aplica sem PS |
| **4. Energia** | `power.*` via `powrprof` (`PowerGetActiveScheme`, `PowerRead/WriteACValueIndex`, `PowerDuplicateScheme`, `PowerSetActiveScheme`). `PowerEngine`, `SystemEngine` e as chamadas de `SystemOptimizerService` | ~1 semana | some o maior bloco de `powercfg` (44 chamadas) |
| **5. Tweaks com `commands`** | um por vez: hibernação (`powercfg /h` vira `CallNtPowerInformation`/registro), armazenamento reservado e NTP (registro + serviço `w32time`), tarefas de telemetria (Task Scheduler COM). Os que dependem de `bcdedit`/`DISM` ficam como `execFile` com array de argumentos, fora do PS | 1 semana | o lote elevado fica sem PS |
| **6. Limpeza** | uma versão depois de a 5 sair sem regressão: remover `buildRegistryScript`, `buildRegistryReadScript`, `parseDhResults` e a chave `optimizer.engine` | 1 dia | menos código |

Total estimado: **4 a 5 semanas** de trabalho focado. As fases 1 e 2 já entregam a maior parte do ganho
percebido e podem sair sozinhas numa versão.

## Fora deste plano (continuam como estão)

- **AppX** (`Get/Remove-AppxPackage`): dá para fazer com `Windows.Management.Deployment.PackageManager` pelo crate
  `windows`, mas é WinRT, de risco maior e pouco usado. Avaliar depois.
- **DISM, winget, Windows Update, BitLocker** (`WindowsToolsEngine`, `wuDiagnose`): são ferramentas do sistema
  por natureza. Só trocar PS por `execFile` com array de argumentos onde ainda houver string.
- **Defender** (`Set-MpPreference`): não há API estável fora do WMI `MSFT_MpPreference`. Fica em PS.
- **Rede/DNS**: avaliar depois da fase 4. `SetInterfaceDnsSettings` existe a partir do Windows 10 20H2/11.
- **`DarkOS.Recovery.psm1`**: continua PowerShell (regra do projeto).

## Testes

- **Paridade (fases 1–4):** um teste roda a mesma lista de ops pelos dois motores numa chave descartável
  (`HKCU\Software\DarkHub-SysOpsTest`) e compara os resultados. Cobre todos os tipos, valor e chave inexistentes,
  chave vazia e permissão negada.
- **Catálogo:** para cada tweak, gerar as ops de aplicar e de reverter e checar se o helper aceita todas
  (nenhum `invalid op`). É rápido e roda no vitest com o binário real.
- **Rust:** testes unitários de parsing e tipos, e um teste de integração no registro da chave descartável.
- **VM:** rodada nova com "aplicar recomendados → reiniciar → status → desfazer tudo → diff do registro contra o
  snapshot de antes". Mesmo procedimento das rodadas 41/43/44.

## Riscos e cuidados

- **HKCU de outro usuário:** quando o app eleva com a conta de outro administrador ("over-the-shoulder"), o HKCU
  do processo elevado não é o do usuário logado. Hoje o problema é o mesmo; o helper pode resolver isso de vez
  recebendo o SID do usuário da sessão interativa e escrevendo em `HKU\<SID>`.
- **Tipos:** o PS converte números e strings de forma frouxa. Testes de paridade antes de ligar o motor nativo,
  para não mudar o valor gravado.
- **Undo antigo:** snapshots gravados pela versão PS precisam ser restauráveis pelo helper. Teste com um arquivo de
  undo real de uma instalação 0.9.4.
- **Integridade:** binário novo entra no `integrity.json`. Não afeta o Hub (o allowlist é só do GpuBench).
- **Antivírus:** um `.exe` novo, sem assinatura, que grava em HKLM pode ser marcado. Enviar ao VirusTotal antes de
  lançar e comparar com os helpers atuais.
