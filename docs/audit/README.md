# Ambiente de auditoria ao vivo

## Subir o ambiente

| Comando | O que faz |
|---|---|
| `npm run dev` | Vite + Electron. A tela recarrega sozinha ao salvar `src/**`; o processo principal reinicia sozinho ao salvar `electron/**` e reabre na mesma tela. |
| `npm run dev -- --page=optimizer` | Abre direto numa tela (rotas em [TRACKER.md](TRACKER.md)). |
| `npm run dev:admin` | O mesmo, numa janela PowerShell como administrador (UAC). Necessário para Otimizador, DarkOS, Defender, DLL Injector etc. Aceita `-- -Page optimizer`. |
| `npm run test:watch` | Testes unitários rodando continuamente (reexecutam ao salvar). |
| `npx vitest run tests/optimizerAudit.test.ts` | Testes de um item só. |
| `npm run dev:legacy` | O modo dev antigo (concurrently, sem reinício automático). |

O modo dev usa um **perfil separado** (`%APPDATA%\<app>-dev`): roda junto com o DarkHub instalado e não mexe nas configurações, no cofre e na biblioteca reais.
Atenção: as **ações** continuam sendo reais. Um tweak aplicado no modo dev altera o Windows de verdade, então use o "Reverter" de cada item ou crie um ponto de restauração antes.

## Acompanhar se está funcionando

- **Painel "IPC" no canto inferior direito** (só no modo dev): mostra cada chamada que a tela faz ao backend, com tempo, OK/ERR e a mensagem de erro. Clique numa linha para ver os argumentos e o resultado. **Copiar resumo** gera um texto para colar na conversa com o Claude.
- **Terminal**: cada chamada aparece como `[ipc] OK canal 12 ms` ou `[ipc] ERR canal ... -> erro`. Logs do processo principal e do Vite também ficam lá.
- **DevTools** (abre destacado): erros do React e do console da tela.

## Fluxo de auditoria de um item

1. Você diz o item (ex.: "Otimizador → Plano de Energia").
2. O Claude localiza o código com `npm run map:find -- <termo>` e lê só esses arquivos.
3. Teste isolado: um arquivo `tests/<item>.test.ts` cobre a lógica com o PowerShell/sistema simulado. Ele roda em segundos e sem alterar o Windows.
4. Teste ao vivo: você abre a tela (`--page=`), usa a função e olha o painel IPC. Se der erro, copie o resumo e mande.
5. Correção e melhoria no item. Ao salvar, o app recarrega sozinho e você testa de novo.
6. Atualiza o status em [TRACKER.md](TRACKER.md) e roda `npm run map`.
