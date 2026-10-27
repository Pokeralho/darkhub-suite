# Prompts for creating DarkHub packages with AI

Copy a prompt, replace what is in brackets, and send it to Claude. In **Claude Code** (inside a clone of this
repository) Claude can also run the validator and fix the file by itself. In **Claude.ai** or another chat, attach or
link [README.md](README.md) and [BUILTIN.md](BUILTIN.md), then paste the result in DarkHub → **Presets e módulos** →
**Colar JSON**.

Prompts em português primeiro; English below.

---

## Português

### Criar um preset para um jogo
> Crie um preset do DarkHub para [nome do jogo] em [notebook/desktop] com placa [NVIDIA/AMD/Intel]. Siga
> docs/hub/README.md. Use os ajustes de docs/hub/BUILTIN.md sempre que existirem, explique cada item com "note",
> não mexa em segurança e coloque nomes em pt-BR e en-US. Meu usuário do GitHub é [usuário]. Salve em
> docs/hub/examples/ e valide com `npm run hub:validate`.

### Transformar a minha lista de ajustes num módulo
> Tenho estes ajustes que faço à mão depois de formatar: [cole a lista, chaves de registro, serviços...]. Transforme
> em um módulo do DarkHub seguindo docs/hub/README.md. Troque pelo ajuste equivalente de docs/hub/BUILTIN.md quando
> houver. Diga quais itens o DarkHub recusaria e por quê.

### Adaptar a notebook e desktop no mesmo preset
> Neste preset [cole o JSON], faça os itens que gastam bateria valerem só para desktop e os de economia só para
> notebook, usando "if" com "chassis". Não crie dois pacotes.

### Revisar um pacote de outra pessoa
> Revise este pacote do DarkHub [cole o JSON] como um revisor desconfiado: diga o que cada item faz de verdade no
> Windows, se algum item é placebo, se algum pode atrapalhar jogos online com anti-cheat, e se as notas e evidências
> batem com o que ele faz.

### Corrigir erros do validador
> O validador do DarkHub disse isto: [cole a saída de npm run hub:validate]. Corrija o pacote [cole o JSON] sem
> mudar o que ele faz.

### Traduzir um pacote
> Complete os campos name e description deste pacote [cole o JSON] em pt-BR e en-US, mantendo o tom simples e sem
> promessas de desempenho.

### Medir antes de publicar
> Neste preset [cole o JSON], quais efeitos o Benchmark antes/depois do DarkHub consegue medir? Preencha "expects"
> só com esses e me diga como rodar a medição.

---

### Com o DarkHub conectado ao Claude (MCP)

> Use o DarkHub para ver o hardware deste PC e montar um preset para jogos competitivos. Valide, me mostre a
> pré-visualização e instale se for risco baixo ou médio.

> Procure no Hub do DarkHub presets de privacidade que sirvam neste PC e explique as diferenças.

### Criar uma extensão (tela nova no DarkHub)

> Crie uma extensão do DarkHub que mostre a temperatura da GPU num gráfico e me avise acima de 80 °C. Siga
> docs/hub/EXTENSIONS.md, carregue com o MCP e corrija o que aparecer no console até funcionar.

## English

### Create an extension (a new DarkHub screen)

> Create a DarkHub extension that lists my Steam library's 10 most played games using the Steam Web API. Follow
> docs/hub/EXTENSIONS.md, ask only for the permissions it needs, load it over MCP and fix console errors until it works.


### With DarkHub connected to Claude (MCP)

> Use DarkHub to look at this PC's hardware and build a preset for competitive shooters. Validate it, show me the
> preview and install it if it is low or medium risk.



### Create a preset for a game
> Create a DarkHub preset for [game] on a [laptop/desktop] with an [NVIDIA/AMD/Intel] GPU. Follow
> docs/hub/README.md. Use the tweaks in docs/hub/BUILTIN.md whenever they exist, explain every item with "note",
> do not touch security, and give names in pt-BR and en-US. My GitHub user is [user]. Save it in docs/hub/examples/
> and validate it with `npm run hub:validate`.

### Turn my manual tweaks into a module
> These are the tweaks I apply by hand after a clean install: [paste the list: registry keys, services...]. Turn them
> into a DarkHub module following docs/hub/README.md. Replace items with the matching built-in tweak from
> docs/hub/BUILTIN.md when there is one. Tell me which items DarkHub would refuse and why.

### One preset for laptops and desktops
> In this preset [paste the JSON], make the battery-hungry items apply only on desktops and the power-saving items only
> on laptops, using "if" with "chassis". Do not split it into two packages.

### Review someone else's package
> Review this DarkHub package [paste the JSON] as a skeptical reviewer: what each item really does in Windows, whether
> any item is placebo, whether any could upset online games with anti-cheat, and whether the notes and evidence match
> what it does.

### Fix validator errors
> The DarkHub validator said: [paste the npm run hub:validate output]. Fix the package [paste the JSON] without
> changing what it does.

### Measure before publishing
> For this preset [paste the JSON], which effects can DarkHub's before/after benchmark measure? Fill "expects" with
> only those and tell me how to run the measurement.
