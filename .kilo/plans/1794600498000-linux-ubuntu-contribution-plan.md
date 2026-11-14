# Plano: base de contribuição Linux (Ubuntu) para DarkHub Suite

## Decisões (recomendadas, adotadas)
- **Marco de “pronto” (Opção A, recomendada):** em Ubuntu, `npm ci`, `npx tsc --noEmit -p .`, `npx vitest run` e `npx vite build` passam; e há smoke de boot do app (janela/main process sem crash) validado manualmente pelo implementador no ambiente disponível. **Não** exigir `xvfb-run` de Electron no CI nesta fase (evita flakiness/deps gráficas). Se o ambiente for headless/sem GUI, o smoke deve ser executado de forma controlada com evidência de ausência de crash no main por motivo de plataforma, e a limitação documentada.
- **Estratégia:** fundação cross-platform por **capacidade/plataforma** com degradação graciosa; **zero mudança funcional no Windows**.
- **Contrato de indisponibilidade (compatível):** manter shape atual (`ok`, `error` quando aplicável) e padronizar adição de `unsupported: true`, `platform: process.platform`, `reason: 'windows-only'` (ou razão específica) onde a operação não for suportada no Linux.
- **Escopo:** PRs/lotes incrementais, mas implementáveis em sequência nesta sessão conforme capacidade; foco em boot + checks + dev + docs, não em port de features Windows.

## Protocolo de execução (obrigatório para o agente implementador)
1. Implementar o escopo abaixo de forma incremental e verificável.
2. **Testar de fato** (ver “Validação”) e corrigir falhas dentro do escopo quando seguro; não mascarar falhas.
3. Ao concluir, **descrever completamente**: arquivos alterados/criados e motivo; decisões; comportamento Windows vs Ubuntu; resultado de cada comando/teste (pass/fail + saída relevante); limitações/bloqueios (ex.: libs gráficas/headless); próximos passos/PRs sugeridos.
4. **Não** fazer commit, push, criar PR/tag ou alterar git config sem autorização explícita do usuário. Entregar relatório e aguardar.
5. Respeitar `.github/PULL_REQUEST_TEMPLATE.md` quando aplicável (tsc/vitest/build; i18n/screenshots/map apenas se tocados).

## Não-objetivos
- Paridade funcional de features Windows-only (optimizer/DarkOS, registry/serviços/drivers, DLL injection, hooks Win32, sensores via daemons C#/.exe, instaladores/updates Windows).
- Migração para Tauri ou shell Rust nativo; portar `.cs/.exe` para Linux; empacotamento Linux final (`AppImage`/`deb`).

## Contexto (evidências)
- Electron+React+Vite+TS: `package.json`, `vite.config.js`, `tsconfig.json`.
- Boot/IPC/services acoplados a Windows: `electron/main.js`, `electron/preload.js`, `electron/ipc/*.js`, `electron/services/*`, `electron/optiscalerManager.js` (muitos gates `process.platform === 'win32'`, `powershell.exe`/`where.exe`/`.exe`).
- Dev runner com limpeza Windows-only: `scripts/dev.mjs` (`killStaleDev` via PowerShell/taskkill).
- CI atual Windows-only: `.github/workflows/ci.yml` (`windows-latest`, `npm ci`, `npx tsc --noEmit -p .`, `npx vitest run`, `npx vite build`, `ELECTRON_SKIP_BINARY_DOWNLOAD=1`).
- Sem `CONTRIBUTING.md`; PR template em `.github/PULL_REQUEST_TEMPLATE.md`.

## Tarefas de implementação (ordem recomendada)

### 1) Plataforma e contrato de capacidade
- **Criar** `electron/platform.js` (ou equivalente) com `isWindows`, `isLinux`, `isMac`, `platform`, e helper `unsupported(reason, extra?)` retornando `{ ok:false, unsupported:true, platform, reason, ...extra }` compatível com retornos existentes.
- Adotar helper nos pontos críticos primeiro (boot, handlers que já retornam “Only supported on Windows/Disponível apenas no Windows”), evitando churn amplo desnecessário.
- **`electron/preload.js`**: manter contrato/shape da API estável; apenas garantir propagação de respostas tratáveis.

### 2) Boot seguro no `electron/main.js` (Ubuntu)
- Gatear/encapsular inicializações e ações Windows-only: pressupostos de admin, tray/atalhos/protocolo/updater/auto-update, carregamento/execução de `.exe/.ps1` e `powershell.exe`/`where.exe`/`csc`, integrações de serviços/daemons Windows.
- Em Linux: **não** spawnar ferramentas Windows; pular com log claro e/ou retornar estado suportável; preservar caminhos Windows intactos.
- Ajustar resolução de comandos/paths por plataforma onde impactar boot (ex.: `where.exe` vs `which`/fallback, separadores).
- **Critério:** `npm run dev` ou `npm run build:renderer && npx electron .` não derruba o main por falta de capacidade Windows.

### 3) IPC e serviços — degradação controlada
- Proteger `electron/ipc/*.js`, `electron/services/*`, `electron/optiscalerManager.js` e pontos com spawn de binários/PowerShell/Win32: checar capacidade antes de executar, responder `unsupported` no Linux.
- Prioridade: handlers usados no boot/fluxos comuns; manter registro seguro de canais e evitar exceções não tratadas.
- Não portar lógica de domínio; apenas impedir crash/efeitos colaterais.

### 4) Dev/build scripts cross-platform
- **`scripts/dev.mjs`**: em `win32` preservar comportamento atual (PowerShell/taskkill/orphans de `electron/services`); em Linux usar `process.kill`/sinais POSIX e caminhos portáveis, sem `powershell.exe`.
- **`package.json`**: `dev`, `dev:renderer`, `dev:electron` (quando aplicável), `build:renderer` utilizáveis no Ubuntu. Scripts nativos Windows (`build:native`, `build:pacer`, `build:disk`, `build:cleaner`, `build:gpubench`, `build:upscaler`, `build:libreoffice`, `build:imagetools`, e `build` completo que depende de toolchain Windows) devem em não-Windows **falhar rápido com mensagem explícita** (ex.: “Windows-only”) ou serem guardados claramente, sem alterar comportamento no Windows.
- Não mudar targets/empacotamento Windows do `electron-builder`.

### 5) CI (matriz Ubuntu) e compatibilidade de testes/typecheck
- **`.github/workflows/ci.yml`**: adicionar job Ubuntu (`ubuntu-latest`, Node 22, cache npm, `ELECTRON_SKIP_BINARY_DOWNLOAD: '1'`) com `npm ci`, `npx tsc --noEmit -p .`, `npx vitest run`, `npx vite build`; manter job Windows existente.
- Corrigir falhas Linux-específicas (case-sensitive paths, separadores, `win32` assumptions em código/testes/mocks) preservando semântica Windows. Testes intrinsecamente Windows-only: condicionar/skip com justificativa clara e mínima.
- Sem `xvfb`/launch de Electron no CI nesta fase.

### 6) UX mínima de indisponibilidade (somente se necessário)
- Em `src/*`, tratar respostas `unsupported`/erro de plataforma onde a ausência quebraria navegação/estado, exibindo indisponibilidade/mensagem clara.
- Respeitar i18n do projeto (pt-BR/en-US) para textos novos/alterados visíveis; evitar redesign e port de features.

### 7) Documentação e higiene
- **`README.md`**: atualizar plataforma/dev — Windows suportado, Ubuntu em desenvolvimento (fundação), pré-requisitos e comandos (`npm ci`, checks, dev/build renderer), e o que permanece Windows-only.
- **Criar `CONTRIBUTING.md`**: setup, checks locais, convenção de PRs pequenos, validação Ubuntu e não-regressão Windows, alinhado a CI e `.github/PULL_REQUEST_TEMPLATE.md`.
- Não abrir issues/PRs remotos nem alterar git config.

## Validação e relatório final
- **Executar no Ubuntu (obrigatório, nesta ordem):** `npm ci`; `npx tsc --noEmit -p .`; `npx vitest run`; `npx vite build`; smoke `npm run dev` **ou** `npm run build:renderer && npx electron .` (com evidência). Em headless, documentar limitação e evidenciar que não há crash imediato de plataforma no main.
- **Windows:** sem ambiente local, declarar que não-regressão depende do job Windows em CI e de guardas condicionais preservadas.
- **Relatório (obrigatório):** tabela/lista por comando com status e saída relevante; arquivos tocados e motivo; decisões; comportamento Windows vs Ubuntu; falhas/correções/bloqueios; checklist PR relevante; próximos passos. **Aguardar autorização para commit/push/PR.**

## Riscos e mitigações
- **Regressão Windows:** mudanças condicionais por capacidade; manter caminhos Windows.
- **Tray/atalhos/updater/protocolo no Linux:** inicializar só quando suportado, com fallback/log.
- **Dependências gráficas do Electron no Ubuntu:** podem impedir smoke visual; registrar ambiente e evidências.
- **Hardcodes Windows:** `*.exe`, `powershell.exe`, `where.exe`, `C:\`, `\` em exec/path.
- **Escopo:** limitar a fundação; backlog para ports por domínio.
