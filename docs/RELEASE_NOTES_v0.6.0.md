# DarkHub Suite v0.6.0: Frost, DarkOS Mods e sensores reais

Maior atualização do DarkHub até agora:
- novo visual **Frost**, com as 30 telas refeitas;
- os **mods do DarkOS em qualquer Windows**;
- **paridade com o WinUtil** (Chris Titus), adaptada;
- um **mapa de disco** nativo;
- um **monitor de hardware que só mostra dados reais**, agora com todos os sensores do LibreHardwareMonitor.

Também corrige um defeito antigo: **na versão instalada, os sensores rápidos e o injetor de DLL nunca funcionavam**.

---

## 📥 Downloads

| Arquivo | Para quê |
|---|---|
| `DarkHub-Setup-0.6.0.exe` | **Instalador (recomendado)**. É o arquivo usado pela atualização automática. |
| `DarkHub.Setup.0.6.0.exe` | O mesmo instalador com o nome antigo, para o `install.ps1` de versões anteriores. |
| `DarkHub.0.6.0-portable.exe` | Portátil: roda sem instalar. |
| `latest.yml` | Metadados da atualização automática (SHA-512 do instalador). |

**SHA-256**
```
323624104849b4cdf7e094391b45c7bcedd62cbdb80ed0e8e7cb61885f12b76a  DarkHub-Setup-0.6.0.exe / DarkHub.Setup.0.6.0.exe
f2c3f9d68b90f853a902e5391069e40a3de53fdfaaed825b0586d714f830ee21  DarkHub.0.6.0-portable.exe
```

**Instalação em uma linha** (PowerShell como administrador). Agora o script confere o SHA-512 do instalador antes de executá-lo:
```powershell
irm https://raw.githubusercontent.com/Pokeralho/darkhub-suite/main/install.ps1 | iex
```

Quem já usa o DarkHub recebe esta versão pela atualização automática. O download também é conferido pelo SHA-512.

Requisitos: Windows 10 ou 11, 64 bits. O DarkHub abre como administrador.

---

### 🧊 1. Novo visual: Frost
- Identidade nova a partir da marca: tons frios, um único acento azul-glacial e as fontes Geist e Geist Mono.
- **125 ícones próprios**, que substituem a biblioteca genérica.
- Shell redesenhado:
  - barra lateral com indicador ativo;
  - navegação por teclado (↑ ↓ Home End);
  - foco visível.
- **As 30 telas revisadas**:
  - uma ação principal por tela;
  - estados de carregamento, vazio e erro em todas;
  - sem caixa-alta gritando e sem selos de "hype".
- Cada tela tem seu próprio limite de erro: se um módulo falha, o resto do app continua funcionando.
- As páginas abrem no topo. O LuluFlix e o Juuzou agora ocupam a janela inteira (antes ficavam presos numa caixa de 420 px).

---

### 🎮 2. DarkOS Mods em qualquer Windows
- No Windows comum, a tela DarkOS vira **DarkOS Mods**: os **167 ajustes da imagem DarkOS** ficam disponíveis um a um.
  - Jogos e latência vêm primeiro.
  - Também podem ser aplicados por categoria ou por perfil: **Equilibrado**, **Jogos competitivos** ou **Desempenho máximo**.
- Usa o mesmo motor do DarkOS:
  - salva o valor original;
  - lê de volta para confirmar que aplicou;
  - desfaz com verificação;
  - snapshots e "restaurar tudo".
- O que o Windows já tem aparece como **"Já ativo"**. Serviços e tarefas que não existem nessa versão do Windows aparecem como tal, em vez de um "Aplicar" que não faz nada.
- Motor do DarkOS (módulo v3): serviços protegidos, como a Otimização de Entrega (DoSvc), passam a ser configurados pelo registro, em vez de falhar.
- DarkOS Center: o status carrega em **~5 s em vez de 26 s**.

---

### ⚙️ 3. Otimizador: tudo do WinUtil, adaptado
**31 ajustes novos**, todos com snapshot, verificação e desfazer:
- **Jogos e rede**:
  - MPO desligado;
  - preferir IPv4 ou desligar o IPv6 (são alternativas: aplicar uma desfaz a outra, e o desfazer volta ao valor original real);
  - Teredo desligado.
- **Energia**: sem rede no Modern Standby; suspensão S3.
- **Privacidade e anti-bloat**:
  - sem resultados da Loja na busca do Iniciar;
  - notificações desligadas;
  - bloqueio da autoinstalação do Razer Synapse e do Logi Download Assistant (sem desligar os drivers do Windows Update);
  - WPBT desligado;
  - debloat do Brave;
  - Outlook clássico mantido.
- **Armazenamento**: Storage Sense e Armazenamento Reservado desligados.
- **Sistema**:
  - caminhos longos;
  - backup do registro;
  - tela azul detalhada;
  - logon detalhado;
  - menu F8 no boot;
  - servidor NTP do pool;
  - sem aviso para arquivos .rdp sem assinatura.
- **Interface**:
  - Início e Galeria do Explorer desligados;
  - sem detecção de tipo de pasta;
  - menu Iniciar anterior;
  - tela de bloqueio desligada;
  - porcentagem da bateria;
  - barras de rolagem sempre visíveis;
  - Snap desligado;
  - Num Lock ligado no boot.

**Nova aba "Recursos e Reparos do Windows"**:
- Recursos com o estado real: WSL, Plataforma de VM, Hyper-V, Sandbox, .NET 3.5, mídia legada, NFS e servidor OpenSSH.
- Reparos:
  - reset do Windows Update;
  - reparo do winget;
  - limpeza do repositório de componentes, sem `/ResetBase`.
- Ações avançadas:
  - autologon pelo netplwiz;
  - remover ou reinstalar o Edge;
  - desligar o BitLocker.
- 19 atalhos para o Painel de Controle e as ferramentas MMC clássicas.

**Também no Otimizador:**
- Scripts longos demais para a linha de comando do Windows agora rodam a partir de um arquivo temporário privado. Isso tinha quebrado a leitura de status de todos os ajustes.
- O plano "Desempenho Máximo" não falha mais quando já existe.
- A verificação do desestacionamento de núcleos foi corrigida.

---

### 📈 4. Monitor de hardware: só dados reais
- Nova aba **Todos os sensores**, no estilo HWMonitor:
  - tudo o que o LibreHardwareMonitor lê, por componente: temperaturas, tensões, potência, clocks, uso, ventoinhas, memória e SMART;
  - mínimo e máximo da sessão, com filtro.
- **Sensores avançados** (LibreHardwareMonitor):
  - o driver **PawnIO** é instalado automaticamente ao ativar: release oficial 2.2.0, SHA-256 fixo, assinatura digital conferida e instalação silenciosa;
  - com ele, o DarkHub lê a temperatura de cada núcleo, as ventoinhas e as tensões da placa-mãe;
  - o WinRing0 foi descartado porque está na lista de drivers vulneráveis da Microsoft.
- **GPU por placa** (DXGI): integrada e dedicada não se misturam mais num "GPU 1", e a VRAM bate com o Monitor de Desempenho do Windows.
- **Tempo ativo do disco** igual ao do Gerenciador de Tarefas.
- **Removidos valores inventados**:
  - atividade de disco estimada sobre 7000 MB/s;
  - temperatura da CPU mostrada como a da GPU;
  - "SMART OK" sem dados;
  - "0 B" de lixo quando a varredura falhava;
  - núcleos físicos chutados como threads ÷ 2;
  - zona ACPI apresentada como temperatura da CPU;
  - "+16 °C" somados à zona ACPI.
- O que não dá para ler aparece como **"indisponível"**, nunca como um 0 "medido".
- Sem administrador, os valores fictícios que o driver devolve ficam ocultos, e a tela explica o motivo.
- Na Home, a memória mostra o **uso real** (o mesmo número do Gerenciador de Tarefas), atualizado a cada 3 s.
- **Mais leve**:
  - o daemon em PowerShell não repete mais o que o daemon nativo já lê;
  - removidas ~200 linhas de fallback duplicado;
  - custo medido: ~0,1 % de CPU (sensores avançados: +0,06 % e 44 MB).
- 🛠️ **Correção crítica**: na versão instalada, o daemon nativo de sensores (disco, rede, GPU, DPC) e o injetor de DLL tentavam rodar de dentro do pacote `app.asar` e nunca iniciavam. Agora rodam de `app.asar.unpacked`.

---

### 🗺️ 5. Mapa de disco (nova tela)
- Substitui a réplica do SpaceSniffer, que mostrava dados de exemplo e chamava um executável que não vinha no pacote.
- **Varredura nativa multi-thread** (`DarkHub.DiskScan.exe`): um C: inteiro (~790 mil arquivos) em **4 a 8 s**, sem seguir junções e links.
- O mapa atualiza ao vivo durante a varredura.
- Filtros por nome, tamanho, idade, pasta, tipo, tags e atributos, rodando na árvore inteira em ~0,3 s.
- Painel do item selecionado:
  - abrir;
  - mostrar no Explorer;
  - copiar o caminho;
  - tags;
  - **mover para a Lixeira** (com confirmação).
- Relatórios TXT e CSV, e espaço livre e "não visível" por unidade.

---

### 📦 6. Pós-instalação
- Novas categorias com alternativas open source:
  - **Office/PDF**: LibreOffice, ONLYOFFICE;
  - **Imagem**: GIMP, Inkscape, darktable;
  - **Vídeo**: Kdenlive;
  - **Áudio**;
  - **3D/CAD**: Blender, FreeCAD.
- Os apps **"Craft"** (PhotoCraft, WordCraft, GridCraft…, marcados como alpha) e o **O&O ShutUp10++**.
- Apps do GitHub são baixados da release oficial **com SHA-256 conferido**.
- **Categorias recolhidas por padrão**, com prévia dos apps. A busca abre as categorias com resultado, e há o botão "Expandir/Recolher tudo".
- 19 IDs de winget que não existiam mais foram corrigidos. O Macrium Reflect Free, descontinuado, foi removido.

---

### 🩺 7. Driver Center e outras correções
- Placas de vídeo rodando no **driver genérico da Microsoft** são identificadas pelo fabricante, com link direto para o app oficial. A Home mostra um aviso quando isso acontece.
- **Diagnóstico e reparo da câmera e da captura de tela**:
  - serviços;
  - políticas de privacidade;
  - reinstalação do driver UVC;
  - limpeza de dispositivos USB fantasmas.
- Arrastar e soltar voltou a funcionar no Conversor e no DLSS 5.
- O arquivamento no Conversor não falha mais.
- Jogos Steam não aparecem mais duplicados, e o executável certo é escolhido (ex.: Deadlock).
- O HAGS não aparece mais como "Indisponível" até abrir a aba GPU.
- A Dashboard não diz mais "Ótimo" com a nota de segurança vermelha.
- O Ultra Low Latency aceita teclas F sozinhas.
- 12 textos que faltavam na interface em inglês foram adicionados.

---

### 🔒 8. Instalação e repositório
- O `install.ps1` agora:
  - confere o **SHA-512** do instalador antes de executá-lo;
  - verifica o código de saída da instalação;
  - fecha os helpers novos antes de instalar.
- Novo CI no GitHub Actions (typecheck, testes e build), Dependabot e política de segurança (`SECURITY.md`).
- README atualizado.

---

## ✅ Como esta versão foi testada
- **176 testes automatizados** e TypeScript sem erros.
- **Selftest com o backend real** nesta máquina:
  - 81 canais de leitura e cenários funcionais OK;
  - **as 33 telas** abriram sem erro de console, de IPC ou alerta.
- Tudo o que altera o sistema foi **aplicado, verificado e revertido numa VM DarkOS/Windows**:
  - 30 dos 31 ajustes do WinUtil (o Armazenamento Reservado é recusado pelo Windows enquanto há uma atualização pendente);
  - todos os recursos e reparos;
  - os mods do DarkOS no modo Windows;
  - a instalação automática do PawnIO.
- Análise estática de segurança sem achados reais.

## ⚠️ Observações
- O instalador ainda não tem assinatura digital com certificado, então o SmartScreen pode avisar na primeira execução. Confira o SHA-256 acima.
- Temperaturas da CPU, ventoinhas e tensões dependem do driver PawnIO e do DarkHub aberto como administrador (o padrão da versão instalada).

Lista técnica completa: [CHANGELOG.md](https://github.com/Pokeralho/darkhub-suite/blob/main/CHANGELOG.md)
