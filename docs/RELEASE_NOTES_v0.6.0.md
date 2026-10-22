# DarkHub Suite 0.6.0

Versão grande: novo visual **Frost**, mods do DarkOS em qualquer Windows, paridade com o WinUtil, mapa de disco
nativo e um monitor de hardware que mostra **só dados reais**, agora com todos os sensores do LibreHardwareMonitor.

## Downloads

| Arquivo | Uso | SHA-256 |
|---|---|---|
| `DarkHub Setup 0.6.0.exe` | Instalador (recomendado) | `323624104849b4cdf7e094391b45c7bcedd62cbdb80ed0e8e7cb61885f12b76a` |
| `DarkHub 0.6.0-portable.exe` | Portátil, sem instalar | `f2c3f9d68b90f853a902e5391069e40a3de53fdfaaed825b0586d714f830ee21` |

Requisitos: Windows 10/11 x64. O DarkHub abre como administrador (necessário para os otimizadores e os sensores).

## Destaques

### Mods do DarkOS em qualquer Windows
- No Windows comum, a tela DarkOS vira **DarkOS Mods**: os 167 ajustes do DarkOS, um a um, por categoria ou por perfil
  (Equilibrado / Jogos competitivos / Desempenho máximo), com foco em jogos e latência.
- Mesmo motor do DarkOS: valor original salvo, verificação depois de aplicar, desfazer verificado, snapshots e
  "restaurar tudo".

### Otimizador: tudo do WinUtil, adaptado
- 31 ajustes novos (MPO, IPv4/IPv6, Teredo, Storage Sense, BSOD detalhado, menu Iniciar anterior, Snap, Num Lock...),
  todos com desfazer.
- Nova aba **Recursos e Reparos do Windows**: WSL, Hyper-V, Sandbox, .NET 3.5, OpenSSH; reset do Windows Update,
  reparo do winget, limpeza do repositório de componentes; Edge remover/reinstalar, autologon, desligar BitLocker.

### Monitor de hardware: só dados reais
- Nova aba **Todos os sensores** (estilo HWMonitor): tensões, temperaturas, potência, clocks, uso, ventoinhas e SMART
  de cada componente, com mínimo e máximo e filtro.
- Sensores avançados com LibreHardwareMonitor. O driver PawnIO é instalado junto ao ativar: release oficial, hash
  fixo e assinatura conferida.
- GPU e VRAM lidas por placa (integrada e dedicada não se misturam mais). O tempo ativo do disco é igual ao do
  Gerenciador de Tarefas.
- Removidos todos os valores estimados ou trocados. O que não dá para ler aparece como "indisponível".
- **Correção importante:** na versão instalada, o daemon de sensores (disco, rede, GPU, DPC) e o injetor de DLL nunca
  iniciavam. Agora funcionam.

### Mapa de disco (novo)
- Varredura nativa multi-thread: um C: inteiro (~790 mil arquivos) em 4 a 8 s.
- Mapa ao vivo, filtros em todo o disco, relatórios TXT/CSV, mover para a Lixeira com confirmação.

### Pós-instalação
- Catálogo com alternativas open source (LibreOffice, GIMP, Inkscape, Kdenlive, Blender, FreeCAD...), os apps
  "Craft" e O&O ShutUp10++. Apps do GitHub são baixados da release oficial com SHA-256 conferido.
- Categorias recolhidas por padrão, com prévia dos apps. A busca abre as categorias com resultado.
- 19 IDs de winget quebrados foram corrigidos.

### Visual Frost
- Nova identidade: tons frios, um único acento glacial, 125 ícones próprios e as 30 telas revisadas.
- LuluFlix e Juuzou ocupam a janela inteira.

### Outras correções
- Driver Center identifica GPUs com o driver genérico da Microsoft. Diagnóstico e reparo da câmera.
- Arrastar e soltar no Conversor e no DLSS 5, jogos Steam duplicados, "Desempenho Máximo" já existente, HAGS
  "Indisponível", status do DarkOS Center de 26 s para ~5 s.

Lista completa em [CHANGELOG.md](../CHANGELOG.md).

## Testes desta versão
- 176 testes automatizados, TypeScript sem erros.
- Selftest com o backend real: 81 canais e cenários OK; as 33 telas abriram sem erros.
- Ajustes que alteram o sistema foram aplicados, verificados e revertidos numa VM DarkOS/Windows.
