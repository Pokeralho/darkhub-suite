# DarkHub Suite: instruções para o Claude

Electron 41 + React 19 + Vite + TypeScript + Tailwind 4. Utilitário para Windows e para o DarkOS (o Windows customizado do dono).

## Antes de procurar código: use o mapa (não varra o projeto)

1. Rode `npm run map:find -- <termo>` (tela, canal IPC, item do otimizador ou nome de função; aceita português, ex.: `telemetria`, `hags`, `dns`). Ele devolve `arquivo:linha`.
2. Se precisar de contexto, leia **só** a seção relevante de:
   - `docs/PROJECT_MAP.md`: guia escrito à mão (fluxo tela → IPC → serviço, tabela de rotas, camadas do Otimizador, DarkOS).
   - `docs/map/FEATURES.md`: por tela, a lista de API → canal → handler (linha) → serviço.
   - `docs/map/CATALOG.md`: todos os itens do Otimizador e os tweaks de registro, com o nome em português.
   - `docs/map/IPC.md` / `docs/map/SYMBOLS.md`: canais IPC e índice de funções.
   - `graphify explain "<Nome>"` ou `graphify-out/GRAPH_REPORT.md`: quem chama quem.
3. Abra apenas os arquivos apontados. Use Grep/varredura ampla só se o mapa não tiver a resposta.

Os números de linha podem estar desatualizados por alguns commits; confirme com Grep pelo nome. **Depois de mudar código, rode `npm run map`** (~15 s, sem custo de IA) para manter o mapa em dia.

## Verificação

- `npx tsc --noEmit -p .` (deve dar 0 erros)
- `npx vitest run`
- `npx vite build`
- `npm run selftest` (com `npm run dev` rodando): chama todos os canais de **leitura** do backend nesta máquina, roda cenários funcionais com arquivos temporários (OCR, conversão, metadados, rede, YouTube, descoberta de jogos) e abre todas as telas com o backend real. Relatório e screenshots em `scratch/selftest/`. Nunca executa ações que alteram o sistema.
- `npm run shot -- <rota>`: screenshot 1366x820 sem backend (layout).
- Binários nativos: `npm run build:native` (C#) e `npm run build:pacer` (Rust; precisa do cargo)

## Regras do projeto

- Toda função nova passa por: serviço → handler IPC → `electron/preload.js` + `src/global.d.ts` → tela → i18n (pt-BR **e** en-US) → teste.
- PowerShell embutido: escape com os helpers de `electron/services/optimizer/OptimizerUtils.js`. Prefira `execFile`/`spawn` com array de argumentos a strings de shell.
- `DarkOS.Recovery.psm1`: compatível com PowerShell 5.1 e só ASCII. **Suba o `# ModuleVersion: N` (linha 2) a cada mudança de comportamento**: o app usa o mais novo entre o módulo instalado em `C:\ProgramData\DarkOS\bin` e o embutido.
- Recursos exclusivos do DarkOS devem degradar com elegância no Windows comum (`darkos:isDarkOS`).
- Fora de escopo, não reintroduzir: Steam Lua, SteamUnlocker, Goldberg, Steamless.
