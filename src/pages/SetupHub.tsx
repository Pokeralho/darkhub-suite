import React, { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  Package,
  Cpu,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Play,
  Loader2,
  Download,
  ExternalLink,
  HardDrive,
  Monitor,
  Search,
  Trash2,
  Wrench,
  Layers,
  ShieldCheck,
  CheckCheck,
  XSquare,
  RefreshCw,
  Network,
  Headphones,
  MemoryStick,
  RotateCcw
} from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import RestoreComponentsPanel from '../components/setup/RestoreComponentsPanel';

const appCatalog: Record<string, { id: string, name: string, desc?: string }[]> = {
  'Drivers & Desinstaladores Limpos': [
    { id: 'Wagnardsoft.DisplayDriverUninstaller', name: 'Display Driver Uninstaller (DDU)', desc: 'Remove completamente drivers GPU sem sobras' },
    { id: 'TechPowerUp.NVCleanstall', name: 'NVCleanstall', desc: 'Instalação customizada de drivers NVIDIA sem bloatware' },
    { id: 'Klocman.BulkCrapUninstaller', name: 'Bulk Crap Uninstaller (BCU)', desc: 'Desinstalador em lote avançado' },
    { id: 'GeekUninstaller.GeekUninstaller', name: 'Geek Uninstaller', desc: 'Desinstalador rápido e limpo' },
    { id: 'RevoUninstaller.RevoUninstaller', name: 'Revo Uninstaller Free', desc: 'Remove registros e arquivos órfãos' },
    { id: 'BleachBit.BleachBit', name: 'BleachBit', desc: 'Limpeza de privacidade open-source' },
    { id: 'OO-Software.ShutUp10', name: 'O&O ShutUp10++', desc: 'Painel de privacidade com centenas de chaves do Windows' },
    { id: 'IObit.IObitUnlocker', name: 'IObit Unlocker', desc: 'Destrava arquivos bloqueados pelo Windows' }
  ],
  'Discos, Partições & Backup': [
    { id: 'AOMEI.Backupper.Standard', name: 'AOMEI Backupper Standard', desc: 'Backup e sincronização de arquivos e partições' },
    { id: 'AOMEI.PartitionAssistant', name: 'AOMEI Partition Assistant', desc: 'Gerenciador de partições e MBR/GPT' },
    { id: 'MiniTool.PartitionWizard.Free', name: 'MiniTool Partition Wizard', desc: 'Redimensionar, formatar e recuperar partições' },
    { id: 'EaseUS.PartitionMaster', name: 'EaseUS Partition Master', desc: 'Gerenciamento de partições e discos' },
    { id: 'EaseUS.TodoBackup', name: 'EaseUS Todo Backup', desc: 'Software de backup e clonagem de sistema' },
    { id: 'Rufus.Rufus', name: 'Rufus', desc: 'Criador de pendrive bootável Windows e Linux' },
    { id: 'Ventoy.Ventoy', name: 'Ventoy', desc: 'Pendrive multi-ISO de inicialização direta' },
    { id: 'Balena.Etcher', name: 'Balena Etcher', desc: 'Gravação de imagens ISO/IMG em cartões e USB' },
    { id: 'JAMSoftware.TreeSize.Free', name: 'TreeSize Free', desc: 'Visualizador de espaço em disco por pastas' },
    { id: 'AntibodySoftware.WizTree', name: 'WizTree', desc: 'Scanner de disco ultra-rápido via MFT' },
    { id: 'CrystalDewWorld.CrystalDiskInfo', name: 'CrystalDiskInfo', desc: 'Monitor de integridade e saúde SMART' },
    { id: 'CrystalDewWorld.CrystalDiskMark', name: 'CrystalDiskMark', desc: 'Benchmark de velocidade de leitura e escrita' }
  ],
  'Diagnóstico, Benchmarks & Sysinternals': [
    { id: 'CPUID.CPU-Z', name: 'CPU-Z', desc: 'Identificação de processador, placa mãe e memória' },
    { id: 'TechPowerUp.GPU-Z', name: 'GPU-Z', desc: 'Informações detalhadas de placa de vídeo' },
    { id: 'REALiX.HWiNFO', name: 'HWiNFO64', desc: 'Monitoramento global de hardware e sensores' },
    { id: 'CPUID.HWMonitor', name: 'HWMonitor', desc: 'Voltagens, temperaturas e rotações de fans' },
    { id: 'OCBase.OCCT.Personal', name: 'OCCT', desc: 'Teste de estabilidade de CPU, GPU, RAM e fonte' },
    { id: 'Geeks3D.FurMark.2', name: 'FurMark', desc: 'Teste de estresse térmico para GPU' },
    { id: 'mersenne.prime95', name: 'Prime95', desc: 'Teste de estresse pesado para CPU e memória' },
    { id: 'Maxon.CinebenchR23', name: 'Cinebench R23', desc: 'Benchmark clássico de renderização para CPU' },
    { id: 'WinsiderSS.SystemInformer', name: 'System Informer (Process Hacker 3)', desc: 'Gerenciador avançado de tarefas e processos' },
    { id: 'Microsoft.Sysinternals.Autoruns', name: 'Sysinternals Autoruns', desc: 'Gerencia tudo que inicializa com o Windows' },
    { id: 'Microsoft.Sysinternals.ProcessExplorer', name: 'Sysinternals Process Explorer', desc: 'Explorador avançado de DLLs e handles' },
    { id: 'Microsoft.Sysinternals.TCPView', name: 'Sysinternals TCPView', desc: 'Monitor de conexões de rede em tempo real' }
  ],
  'Runtimes & Bibliotecas Essenciais': [
    { id: 'abbodi1406.vcredist', name: 'Visual C++ All-In-One (2005-2022)', desc: 'Todas as DLLs de redistribuição essenciais' },
    { id: 'Microsoft.DotNet.DesktopRuntime.8', name: '.NET Desktop Runtime 8.0', desc: 'Ambiente de execução .NET 8 para apps Windows' },
    { id: 'Microsoft.DotNet.DesktopRuntime.6', name: '.NET Desktop Runtime 6.0', desc: 'Ambiente de execução .NET 6 LTS' },
    { id: 'Oracle.JavaRuntimeEnvironment', name: 'Java Runtime Environment (JRE)', desc: 'Máquina virtual Java oficial' },
    { id: 'Microsoft.DirectX', name: 'DirectX End-User Runtimes (Web)', desc: 'Instalador de bibliotecas legadas DirectX 9/10/11' }
  ],
  Navegadores: [
    { id: 'Google.Chrome', name: 'Google Chrome', desc: 'Navegador padrão Google' },
    { id: 'Mozilla.Firefox', name: 'Mozilla Firefox', desc: 'Navegador open-source e focado em privacidade' },
    { id: 'Brave.Brave', name: 'Brave Browser', desc: 'Bloqueio nativo de anúncios e rastreadores' },
    { id: 'Microsoft.Edge', name: 'Microsoft Edge', desc: 'Navegador baseado em Chromium da Microsoft' },
    { id: 'Opera.Opera', name: 'Opera', desc: 'Navegador com recursos integrados' },
    { id: 'Opera.OperaGX', name: 'Opera GX', desc: 'Navegador gamer com limitador de recursos' },
    { id: 'Vivaldi.Vivaldi', name: 'Vivaldi', desc: 'Navegador altamente personalizável' },
    { id: 'Ablaze.Floorp', name: 'Floorp', desc: 'Navegador Firefox super veloz e customizável' }
  ],
  Compactadores: [
    { id: '7zip.7zip', name: '7-Zip', desc: 'Compactador rápido e open-source' },
    { id: 'RARLab.WinRAR', name: 'WinRAR', desc: 'Clássico descompactador de arquivos RAR e ZIP' },
    { id: 'M2Team.NanaZip', name: 'NanaZip', desc: 'Fork moderno do 7-Zip integrado ao menu do Win11' },
    { id: 'Giorgiotani.Peazip', name: 'PeaZip', desc: 'Gerenciador de arquivos compactados completo' }
  ],
  'Utilidades & Produtividade': [
    { id: 'voidtools.Everything', name: 'Everything', desc: 'Busca instantânea de arquivos no disco' },
    { id: 'Microsoft.PowerToys', name: 'Microsoft PowerToys', desc: 'Suíte de produtividade oficial da Microsoft' },
    { id: 'Notepad++.Notepad++', name: 'Notepad++', desc: 'Editor de texto leve e avançado' },
    { id: 'ShareX.ShareX', name: 'ShareX', desc: 'Captura de tela, gravação e OCR' },
    { id: 'OBSProject.OBSStudio', name: 'OBS Studio', desc: 'Gravação de tela e streaming profissional' },
    { id: 'Flameshot.Flameshot', name: 'Flameshot', desc: 'Prints com setas, texto e destaque' },
    { id: 'KeePassXCTeam.KeePassXC', name: 'KeePassXC', desc: 'Cofre de senhas offline' },
    { id: 'Bitwarden.Bitwarden', name: 'Bitwarden', desc: 'Gerenciador de senhas com sincronização' },
    { id: 'LocalSend.LocalSend', name: 'LocalSend', desc: 'Enviar arquivos entre PC e celular na rede local' },
    { id: 'Syncthing.Syncthing', name: 'Syncthing', desc: 'Sincroniza pastas entre dispositivos sem nuvem' },
    { id: 'qBittorrent.qBittorrent', name: 'qBittorrent', desc: 'Cliente BitTorrent sem anúncios' }
  ],
  'Gamer & Launchers': [
    { id: 'Valve.Steam', name: 'Steam', desc: 'Maior plataforma de jogos para PC' },
    { id: 'EpicGames.EpicGamesLauncher', name: 'Epic Games Launcher', desc: 'Loja da Epic Games e Unreal Engine' },
    { id: 'ElectronicArts.EADesktop', name: 'EA App', desc: 'Launcher oficial da Electronic Arts' },
    { id: 'Ubisoft.Connect', name: 'Ubisoft Connect', desc: 'Plataforma oficial de jogos Ubisoft' },
    { id: 'Blizzard.BattleNet', name: 'Battle.net', desc: 'Launcher da Blizzard Entertainment' },
    { id: 'GOG.Galaxy', name: 'GOG Galaxy', desc: 'Launcher livre de DRM da CD Projekt' },
    { id: 'RiotGames.LeagueOfLegends.BR', name: 'League of Legends', desc: 'Instala o Riot Client com o LoL (servidor BR)' },
    { id: 'Guru3D.Afterburner', name: 'MSI Afterburner', desc: 'Overclocking e monitoramento de GPU' },
    { id: 'Guru3D.RTSS', name: 'RivaTuner Statistics Server (RTSS)', desc: 'Estatísticas e medição de quadros' }
  ],
  'Players & Multimídia': [
    { id: 'VideoLAN.VLC', name: 'VLC Media Player', desc: 'Player multimídia universal' },
    { id: 'clsid2.mpc-hc', name: 'MPC-HC', desc: 'Media Player Classic Home Cinema' },
    { id: 'mpv.net', name: 'MPV Player', desc: 'Player minimalista e veloz' },
    { id: 'Spotify.Spotify', name: 'Spotify', desc: 'Streaming de música e podcasts' },
    { id: 'HandBrake.HandBrake', name: 'HandBrake', desc: 'Conversor de formatos de vídeo' },
    { id: 'Gyan.FFmpeg', name: 'FFmpeg', desc: 'Suíte de processamento audiovisual' }
  ],
  // Open-source alternatives. IDs verified with `winget show` (2026-10-21); "gh:" entries are GitHub releases
  // (allow-listed in main.js, MSI checked against GitHub's SHA-256). The Craft apps are recent clean-room
  // reimplementations still in alpha: listed next to the mature option of each category.
  'Escritório, PDF & Estudos': [
    { id: 'TheDocumentFoundation.LibreOffice', name: 'LibreOffice', desc: 'Word, Excel e PowerPoint livres; abre e salva .docx, .xlsx e .pptx' },
    { id: 'ONLYOFFICE.DesktopEditors', name: 'ONLYOFFICE', desc: 'Documentos, planilhas e apresentações com visual do Office' },
    { id: 'gh:storytold/wordcraft', name: 'WordCraft (alfa)', desc: 'Recriação open-source do Microsoft Word, em Rust' },
    { id: 'gh:storytold/gridcraft', name: 'GridCraft (alfa)', desc: 'Planilhas no estilo Excel, open-source em Rust' },
    { id: 'gh:storytold/deckcraft', name: 'DeckCraft (alfa)', desc: 'Apresentações no estilo PowerPoint, open-source' },
    { id: 'gh:storytold/pdfcraft', name: 'PdfCraft (alfa)', desc: 'Leitor e editor de PDF no estilo Acrobat' },
    { id: 'SumatraPDF.SumatraPDF', name: 'SumatraPDF', desc: 'Leitor de PDF, EPUB e quadrinhos leve e rápido' },
    { id: 'PDFsam.PDFsam', name: 'PDFsam Basic', desc: 'Juntar, dividir e reorganizar PDFs' },
    { id: 'KDE.Okular', name: 'Okular', desc: 'Leitor de documentos com anotações' },
    { id: 'Xournal++.Xournal++', name: 'Xournal++', desc: 'Anotações à mão e assinatura em PDF' },
    { id: 'Cyanfish.NAPS2', name: 'NAPS2', desc: 'Digitalizar documentos para PDF com OCR' },
    { id: 'Joplin.Joplin', name: 'Joplin', desc: 'Notas e listas com sincronização' },
    { id: 'Logseq.Logseq', name: 'Logseq', desc: 'Notas conectadas e diário' },
    { id: 'DigitalScholar.Zotero', name: 'Zotero', desc: 'Referências e citações para trabalhos acadêmicos' },
    { id: 'Anki.Anki', name: 'Anki', desc: 'Flashcards com repetição espaçada' },
    { id: 'calibre.calibre', name: 'calibre', desc: 'Biblioteca e conversor de e-books' },
    { id: 'Mozilla.Thunderbird', name: 'Thunderbird', desc: 'E-mail, agenda e contatos' }
  ],
  'Imagem, Foto & Design': [
    { id: 'GIMP.GIMP.3', name: 'GIMP 3', desc: 'Alternativa ao Photoshop: edição e retoque de imagens' },
    { id: 'gh:storytold/photocraft', name: 'PhotoCraft (alfa)', desc: 'Recriação do Photoshop em Rust; abre e salva PSD com camadas' },
    { id: 'KDE.Krita', name: 'Krita', desc: 'Pintura digital e ilustração profissional' },
    { id: 'Inkscape.Inkscape', name: 'Inkscape', desc: 'Alternativa ao Illustrator: vetores e SVG' },
    { id: 'gh:storytold/vectorcraft', name: 'VectorCraft (alfa)', desc: 'Recriação do Illustrator, open-source' },
    { id: 'darktable.darktable', name: 'darktable', desc: 'Alternativa ao Lightroom: revelação de RAW e catálogo' },
    { id: 'gh:storytold/lightcraft', name: 'LightCraft (alfa)', desc: 'Recriação do Lightroom, edição não destrutiva' },
    { id: 'RawTherapee.RawTherapee', name: 'RawTherapee', desc: 'Processamento avançado de fotos RAW' },
    { id: 'KDE.digiKam', name: 'digiKam', desc: 'Organizar e editar grandes coleções de fotos' },
    { id: 'Scribus.Scribus', name: 'Scribus', desc: 'Alternativa ao InDesign: diagramação para impressão' },
    { id: 'gh:storytold/designcraft', name: 'DesignCraft (alfa)', desc: 'Recriação do InDesign, layout de páginas' },
    { id: 'gh:storytold/figcraft', name: 'FigCraft (alfa)', desc: 'Design de interfaces e protótipos no estilo Figma' },
    { id: 'Upscayl.Upscayl', name: 'Upscayl', desc: 'Aumenta a resolução de imagens com IA local' },
    { id: 'Pinta.Pinta', name: 'Pinta', desc: 'Editor simples no estilo Paint.NET' },
    { id: 'OramaInteractive.Pixelorama', name: 'Pixelorama', desc: 'Pixel art e sprites animados' }
  ],
  'Vídeo, Animação & Efeitos': [
    { id: 'KDE.Kdenlive', name: 'Kdenlive', desc: 'Alternativa ao Premiere: edição de vídeo multipista' },
    { id: 'Meltytech.Shotcut', name: 'Shotcut', desc: 'Editor de vídeo leve com muitos formatos' },
    { id: 'gh:storytold/filmcraft', name: 'FilmCraft (alfa)', desc: 'Recriação do Premiere, edição não linear' },
    { id: 'OpenShot.OpenShot', name: 'OpenShot', desc: 'Editor de vídeo simples para iniciantes' },
    { id: 'Natron.Natron', name: 'Natron', desc: 'Alternativa ao After Effects: composição por nós' },
    { id: 'gh:storytold/effectcraft', name: 'EffectCraft (alfa)', desc: 'Recriação do After Effects, motion graphics' },
    { id: 'KDE.Glaxnimate', name: 'Glaxnimate', desc: 'Animação vetorial e Lottie' },
    { id: 'ch.LosslessCut', name: 'LosslessCut', desc: 'Cortar vídeos sem perder qualidade, em segundos' },
    { id: 'Avidemux.Avidemux', name: 'Avidemux', desc: 'Cortes, filtros e conversão rápida' }
  ],
  'Áudio & Música': [
    { id: 'Audacity.Audacity', name: 'Audacity', desc: 'Gravação e edição de áudio' },
    { id: 'TenacityTeam.Tenacity', name: 'Tenacity', desc: 'Editor de áudio derivado do Audacity' },
    { id: 'gh:storytold/soundcraft', name: 'SoundCraft (alfa)', desc: 'Recriação do Pro Tools, estação de áudio' },
    { id: 'LMMS.LMMS', name: 'LMMS', desc: 'Produção musical: sequenciador e sintetizadores' },
    { id: 'Musescore.Musescore', name: 'MuseScore', desc: 'Escrita de partituras' }
  ],
  '3D, CAD & Engenharia': [
    { id: 'BlenderFoundation.Blender', name: 'Blender', desc: 'Modelagem, animação e renderização 3D' },
    { id: 'FreeCAD.FreeCAD', name: 'FreeCAD', desc: 'Alternativa ao AutoCAD/SolidWorks: CAD paramétrico' },
    { id: 'gh:storytold/cadcraft', name: 'CADCraft (alfa)', desc: 'Recriação de CAD 2D/3D no estilo AutoCAD' },
    { id: 'KiCad.KiCad', name: 'KiCad', desc: 'Projeto de circuitos e placas eletrônicas' },
    { id: 'OpenSCAD.OpenSCAD', name: 'OpenSCAD', desc: 'Modelagem 3D por código' },
    { id: 'Ultimaker.Cura', name: 'UltiMaker Cura', desc: 'Fatiador para impressão 3D' },
    { id: 'Prusa3D.PrusaSlicer', name: 'PrusaSlicer', desc: 'Fatiador para impressoras 3D' },
    { id: 'GodotEngine.GodotEngine', name: 'Godot Engine', desc: 'Motor para criar jogos 2D e 3D' }
  ],
  Comunicação: [
    { id: 'Discord.Discord', name: 'Discord', desc: 'Chat de voz, texto e comunidades' },
    { id: 'Telegram.TelegramDesktop', name: 'Telegram', desc: 'Mensageiro rápido e seguro para desktop' },
    { id: '9NKSQGP7F2NH', name: 'WhatsApp', desc: 'Aplicativo oficial WhatsApp para Windows' },
    { id: 'Zoom.Zoom', name: 'Zoom', desc: 'Videoconferências e reuniões online' },
    { id: 'SlackTechnologies.Slack', name: 'Slack', desc: 'Comunicação e colaboração em equipe' }
  ],
  Desenvolvimento: [
    { id: 'Microsoft.VisualStudioCode', name: 'VS Code', desc: 'Editor de código mais popular do mundo' },
    { id: 'VSCodium.VSCodium', name: 'VSCodium', desc: 'VS Code 100% open-source, sem telemetria' },
    { id: 'Microsoft.VisualStudio.2022.Community', name: 'Visual Studio 2022 Community', desc: 'IDE completa para C++, C# e .NET' },
    { id: 'Git.Git', name: 'Git', desc: 'Controle de versão distribuído' },
    { id: 'GitHub.GitHubDesktop', name: 'GitHub Desktop', desc: 'Interface gráfica para repositórios Git' },
    { id: 'Docker.DockerDesktop', name: 'Docker Desktop', desc: 'Ambiente de contêineres para desenvolvimento' },
    { id: 'OpenJS.NodeJS', name: 'Node.js', desc: 'Runtime JavaScript assíncrono' },
    { id: 'Python.Python.3.12', name: 'Python 3.12', desc: 'Linguagem de programação e interpretador' },
    { id: 'Rustlang.Rustup', name: 'Rust (Rustup)', desc: 'Toolchain da linguagem Rust' },
    { id: 'GoLang.Go', name: 'Go (Golang)', desc: 'Compilador e ferramentas Go' },
    { id: 'Kitware.CMake', name: 'CMake', desc: 'Sistema de automação de compilação' }
  ]
};

const CATEGORY_KEYS: Record<string, string> = {
  'Drivers & Desinstaladores Limpos': 'setuphub.cat.drivers',
  'Discos, Partições & Backup': 'setuphub.cat.disks',
  'Diagnóstico, Benchmarks & Sysinternals': 'setuphub.cat.diagnostics',
  'Runtimes & Bibliotecas Essenciais': 'setuphub.cat.runtimes',
  'Navegadores': 'setuphub.cat.browsers',
  'Compactadores': 'setuphub.cat.compression',
  'Utilidades & Produtividade': 'setuphub.cat.utilities',
  'Gamer & Launchers': 'setuphub.cat.gaming',
  'Players & Multimídia': 'setuphub.cat.media',
  'Escritório, PDF & Estudos': 'setuphub.cat.office',
  'Imagem, Foto & Design': 'setuphub.cat.design',
  'Vídeo, Animação & Efeitos': 'setuphub.cat.video',
  'Áudio & Música': 'setuphub.cat.audio',
  '3D, CAD & Engenharia': 'setuphub.cat.cad',
  'Comunicação': 'setuphub.cat.communication',
  'Desenvolvimento': 'setuphub.cat.dev'
};

const SetupHub = ({ onNavigate }: { onNavigate?: (page: string) => void } = {}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'apps' | 'drivers' | 'restore'>('apps');

  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [installing, setInstalling] = useState(false);
  const [installLogs, setInstallLogs] = useState<string[]>([]);
  // Categories start collapsed: the catalog is a list of headings until the user opens one (or searches).
  const [openCats, setOpenCats] = useState<string[]>([]);

  const [hardware, setHardware] = useState<any>(null);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    if (activeTab === 'drivers' && !hardware && !detecting) {
      detectHardware();
    }
  }, [activeTab]);

  const toggleApp = (id: string) => {
    setSelectedApps(prev =>
      prev.includes(id) ? prev.filter(appId => appId !== id) : [...prev, id]
    );
  };

  const toggleCategory = (categoryApps: { id: string }[]) => {
    const ids = categoryApps.map(a => a.id);
    const allSelected = ids.every(id => selectedApps.includes(id));
    if (allSelected) {
      setSelectedApps(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedApps(prev => Array.from(new Set([...prev, ...ids])));
    }
  };

  const applyPreset = (preset: 'essentials' | 'maintenance' | 'gaming' | 'dev' | 'clear') => {
    if (preset === 'clear') {
      setSelectedApps([]);
      return;
    }
    const presets: Record<string, string[]> = {
      essentials: [
        'abbodi1406.vcredist',
        'Microsoft.DirectX',
        '7zip.7zip',
        'Google.Chrome',
        'voidtools.Everything',
        'CrystalDewWorld.CrystalDiskInfo'
      ],
      maintenance: [
        'Wagnardsoft.DisplayDriverUninstaller',
        'AOMEI.PartitionAssistant',
        'Klocman.BulkCrapUninstaller',
        'JAMSoftware.TreeSize.Free',
        'CrystalDewWorld.CrystalDiskInfo',
        'Rufus.Rufus',
        'WinsiderSS.SystemInformer'
      ],
      gaming: [
        'Valve.Steam',
        'EpicGames.EpicGamesLauncher',
        'Discord.Discord',
        'Guru3D.Afterburner',
        'Guru3D.RTSS',
        'abbodi1406.vcredist',
        'Microsoft.DirectX'
      ],
      dev: [
        'Microsoft.VisualStudioCode',
        'Git.Git',
        'GitHub.GitHubDesktop',
        'Docker.DockerDesktop',
        'OpenJS.NodeJS',
        'Python.Python.3.12'
      ]
    };

    const targetList = presets[preset] || [];
    setSelectedApps(prev => Array.from(new Set([...prev, ...targetList])));
  };

  const filteredCatalog = useMemo(() => {
    if (!searchQuery.trim()) return appCatalog;
    const q = searchQuery.toLowerCase();
    const res: Record<string, { id: string, name: string, desc?: string }[]> = {};
    for (const [cat, apps] of Object.entries(appCatalog)) {
      const matching = apps.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        (a.desc && a.desc.toLowerCase().includes(q))
      );
      if (matching.length > 0) {
        res[cat] = matching;
      }
    }
    return res;
  }, [searchQuery]);

  const handleInstallApps = async () => {
    if (selectedApps.length === 0) return;
    setInstalling(true);
    setInstallLogs(['Iniciando instalação em lote via Winget...']);

    try {
      if (window.darkhub?.setup?.installWinget) {

        const cleanup = window.darkhub.setup.onInstallProgress((log: string) => {
          setInstallLogs(prev => [...prev, log]);
        });

        const res = await window.darkhub.setup.installWinget(selectedApps);
        if (res?.ok) {
          setInstallLogs(prev => [...prev, 'Instalação concluída com sucesso!']);
        } else {
          setInstallLogs(prev => [...prev, `[ERRO] ${res?.error || 'Falha na instalação'}`]);
        }
        cleanup();
      } else {
        setInstallLogs(prev => [...prev, '[ERRO] Função de instalação não exposta no preload.']);
      }
    } catch (e: any) {
      setInstallLogs(prev => [...prev, `[EXCEÇÃO] ${e.message}`]);
    }

    setInstalling(false);
  };

  const detectHardware = async () => {
    setDetecting(true);
    try {
      if (window.darkhub?.setup?.detectHardware) {
        const res = await window.darkhub.setup.detectHardware();
        if (res?.ok) {
          setHardware(res.hardware);
        } else {
          console.error(res?.error);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setDetecting(false);
  };

  const presetButtons: { id: 'essentials' | 'maintenance' | 'gaming' | 'dev'; label: string }[] = [
    { id: 'essentials', label: t('setuphub.preset.essentials', '+ Essentials') },
    { id: 'maintenance', label: t('setuphub.preset.maintenance', '+ Maintenance & DDU') },
    { id: 'gaming', label: t('setuphub.preset.gaming', '+ Gaming') },
    { id: 'dev', label: t('setuphub.preset.dev', '+ Dev') },
  ];
  const catalogEmpty = Object.keys(filteredCatalog).length === 0;

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader
        title={t('setuphub.title', 'Pós-Formatação & Instalação em Massa')}
        subtitle={t('setuphub.subtitle', 'Instale softwares essenciais, utilitários de sistema e runtimes via Winget com 1 clique.')}
      >
        <div role="tablist" className="flex gap-5 -mb-5 overflow-x-auto overflow-y-hidden">
          {([
            ['apps', Package, t('setuphub.tab.winget', 'Post-Install (Winget)')],
            ['drivers', Cpu, t('setuphub.tab.drivers', 'Drivers & Hardware')],
            ['restore', RotateCcw, t('rstx.tab', 'Restore Windows components')],
          ] as const).map(([id, Icon, label]) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`relative h-9 inline-flex items-center gap-2 text-[13px] whitespace-nowrap border-b-2 transition-colors ${active ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
              >
                <Icon size={16} className={active ? 'text-blue-300' : 'text-zinc-500'} />
                {label}
              </button>
            );
          })}
        </div>
      </PageHeader>

      {onNavigate ? (
        <div className="mb-5 flex items-center justify-between gap-3 flex-wrap border-l-2 border-blue-400/60 pl-3 py-1">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-zinc-100">{t('drvx.setuphub.title', 'Fresh install with no display driver?')}</p>
            <p className="dh-help max-w-[75ch]">{t('drvx.setuphub.body', '')}</p>
          </div>
          <button onClick={() => onNavigate('driver')} className="dh-btn dh-btn-sm shrink-0">
            <Cpu size={14} />{t('drvx.setuphub.cta', 'Open the Driver Center')}
          </button>
        </div>
      ) : null}

      {activeTab === 'restore' && <RestoreComponentsPanel />}

      {activeTab === 'apps' && (
        <div className="space-y-5 animate-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="dh-label mr-1">{t('setuphub.presets', 'Presets:')}</span>
              {presetButtons.map(p => (
                <button key={p.id} onClick={() => applyPreset(p.id)} disabled={installing} className="dh-btn dh-btn-sm">
                  {p.label}
                </button>
              ))}
              {selectedApps.length > 0 && (
                <button onClick={() => applyPreset('clear')} disabled={installing} className="dh-btn dh-btn-ghost dh-btn-sm">
                  <XSquare size={14} />
                  {t('common.clear', 'Clear')} <span className="font-mono">({selectedApps.length})</span>
                </button>
              )}
            </div>

            <div className="relative md:w-72">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="search"
                placeholder={t('setuphub.searchPlaceholder', 'Search tool, app...')}
                aria-label={t('setuphub.searchPlaceholder', 'Search tool, app...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dh-input w-full pl-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
            <div className="min-w-0">
              {catalogEmpty ? (
                <div className="py-16 text-center">
                  <p className="text-[13px] text-zinc-400">Nada encontrado para <span className="font-mono text-zinc-200">"{searchQuery}"</span>.</p>
                  <button onClick={() => setSearchQuery('')} className="dh-btn dh-btn-sm mt-3">{t('common.clear', 'Clear')}</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setOpenCats(openCats.length ? [] : Object.keys(filteredCatalog))}
                      className="text-[12px] text-zinc-400 hover:text-blue-300 transition-colors"
                    >
                      {openCats.length ? t('setuphub.collapseAll', 'Recolher tudo') : t('setuphub.expandAll', 'Expandir tudo')}
                    </button>
                  </div>
                  {Object.entries(filteredCatalog).map(([category, apps]) => {
                    const allCategorySelected = apps.every(a => selectedApps.includes(a.id));
                    const selCount = apps.filter(a => selectedApps.includes(a.id)).length;
                    const open = Boolean(searchQuery.trim()) || openCats.includes(category);
                    const toggleOpen = () => setOpenCats(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
                    return (
                      <section key={category} className={`dh-card overflow-hidden ${selCount > 0 ? 'border-blue-400/25' : ''}`}>
                        <div className="flex items-center gap-2 pr-3">
                          <button
                            type="button"
                            onClick={toggleOpen}
                            aria-expanded={open}
                            className="flex-1 min-w-0 flex items-center gap-2.5 px-4 py-3 text-left hover:bg-zinc-900/50 transition-colors"
                          >
                            {open ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-500 shrink-0" />}
                            <span className="min-w-0 flex-1">
                              <span className="flex items-baseline gap-2">
                                <span className="text-[13.5px] font-medium text-zinc-100">{t(CATEGORY_KEYS[category] || category, category)}</span>
                                <span className={`font-mono text-[11px] ${selCount > 0 ? 'text-blue-300' : 'text-zinc-500'}`}>{selCount > 0 ? `${selCount}/` : ''}{apps.length}</span>
                              </span>
                              {!open ? (
                                <span className="block text-[12px] text-zinc-500 truncate mt-0.5">
                                  {apps.slice(0, 5).map(a => a.name).join(', ')}{apps.length > 5 ? ` +${apps.length - 5}` : ''}
                                </span>
                              ) : null}
                            </span>
                          </button>
                          <button
                            onClick={() => toggleCategory(apps)}
                            disabled={installing}
                            className="dh-btn dh-btn-ghost dh-btn-sm shrink-0 disabled:opacity-50"
                          >
                            {allCategorySelected ? t('common.deselect', 'Deselect') : t('common.all', 'All')}
                          </button>
                        </div>
                        {open ? (
                        <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 px-4 pb-3 pt-1 border-t border-zinc-800/80">
                          {apps.map(app => {
                            const isSelected = selectedApps.includes(app.id);
                            return (
                              <li key={app.id} className="min-w-0">
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={isSelected}
                                  disabled={installing}
                                  onClick={() => toggleApp(app.id)}
                                  className={`w-full text-left flex items-start gap-2.5 px-2 py-1.5 mt-1 rounded-md transition-colors ${isSelected ? 'bg-blue-500/[0.07]' : 'hover:bg-zinc-900'} disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                  <span className="mt-0.5 shrink-0">
                                    {isSelected ? <CheckSquare size={16} className="text-blue-300" /> : <Square size={16} className="text-zinc-600" />}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className={`block text-[13px] ${isSelected ? 'text-zinc-50 font-medium' : 'text-zinc-200'}`}>
                                      {app.name}
                                      {app.id.startsWith('gh:') ? <span className="dh-tag ml-1.5" title={t('setuphub.githubSource', 'Instalado da release oficial no GitHub, com hash SHA-256 conferido')}>github</span> : null}
                                    </span>
                                    {app.desc ? <span className="block text-[12px] text-zinc-500 truncate" title={t(`app.desc.${app.id}`, app.desc)}>{t(`app.desc.${app.id}`, app.desc)}</span> : null}
                                  </span>
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                        ) : null}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>

            <aside className="dh-card p-4 lg:sticky lg:top-4">
              <h2 className="dh-section-title">{t('setuphub.installation', 'Installation')}</h2>
              <p className="dh-help mt-0.5">
                <span className="font-mono text-zinc-200">{selectedApps.length}</span> {t('setuphub.appsSelected', 'app(s) selected').replace('{n} ', '')}
              </p>

              <button
                onClick={handleInstallApps}
                disabled={installing || selectedApps.length === 0}
                className="dh-btn dh-btn-primary w-full mt-4"
              >
                {installing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                <span>{installing ? t('setuphub.installing', 'Installing...') : t('setuphub.installSelected', 'Install Selected')}</span>
              </button>

              <div className="mt-4 rounded-md border border-zinc-800/80 bg-zinc-950 p-3 h-64 overflow-y-auto font-mono text-[11.5px] leading-relaxed text-zinc-400 flex flex-col gap-0.5" aria-live="polite">
                {installLogs.length === 0 ? (
                  <span className="font-sans text-[12px] text-zinc-600 text-center my-auto">{t('setuphub.readyToInstall', 'Ready to install.')}</span>
                ) : (
                  installLogs.map((log, i) => (
                    <span key={i} className={`whitespace-pre-wrap ${/^\[(ERRO|EXCEÇÃO)\]/.test(log) ? 'text-red-400' : ''}`}>{log}</span>
                  ))
                )}
              </div>
            </aside>
          </div>
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="space-y-8 animate-in">
          {detecting ? (
            <div aria-busy="true" aria-label={t('setuphub.readingSensors', 'Reading sensors and hardware specs via WMI...')}>
              <p className="dh-help mb-4 flex items-center gap-2"><Loader2 size={14} className="animate-spin text-blue-300" />{t('setuphub.readingSensors', 'Reading sensors and hardware specs via WMI...')}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="dh-card p-4 space-y-3">
                    <div className="h-3 w-24 rounded bg-zinc-900 animate-pulse" />
                    <div className="h-4 w-3/4 rounded bg-zinc-900 animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-zinc-900 animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ) : !hardware ? (
            <div className="py-12">
              <p role="alert" className="text-[13px] text-red-400">{t('setuphub.failedHardware', 'Failed to read hardware specifications.')}</p>
              <button onClick={detectHardware} className="dh-btn mt-3"><RefreshCw size={14} /> {t('common.retry', 'Tentar novamente')}</button>
            </div>
          ) : (
            <>
              <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-zinc-800/80">
                <div className="min-w-0 space-y-1.5">
                  <p className="dh-tag truncate">
                    {[hardware.cpu?.name, hardware.gpus?.[0]?.name].filter(Boolean).join(' + ')}
                  </p>
                  <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-zinc-50">
                    Smart Driver Hub e diagnóstico pós-formatação
                  </h2>
                  <p className="text-[12.5px] leading-relaxed text-zinc-400 max-w-[70ch]">
                    Identificamos o seu hardware com precisão. Baixe os drivers oficiais diretamente dos fabricantes para obter máxima taxa de quadros, estabilidade e suporte a recursos avançados.
                  </p>
                </div>

                <button
                  onClick={() => {
                    const recs: string[] = ['abbodi1406.vcredist', 'Microsoft.DirectX', 'Wagnardsoft.DisplayDriverUninstaller'];
                    const text = `${hardware.gpus?.[0]?.name || ''} ${hardware.gpus?.[0]?.vendor || ''}`.toLowerCase();
                    if (text.includes('nvidia')) recs.push('Nvidia.NvidiaApp', 'TechPowerUp.NVCleanstall');
                    else if (text.includes('amd') || text.includes('radeon')) recs.push('AdvancedMicroDevicesInc.AMDSoftwareAdrenalinEdition', 'AdvancedMicroDevicesInc.AMDChipsetDrivers');
                    else if (text.includes('intel')) recs.push('Intel.IntelArcControl', 'Intel.DriverAndSupportAssistant');

                    setSelectedApps(prev => Array.from(new Set([...prev, ...recs])));
                    setActiveTab('apps');
                  }}
                  className="dh-btn dh-btn-primary shrink-0"
                >
                  <Download size={14} />
                  Selecionar drivers recomendados
                </button>
              </section>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <HardwareCard
                  title="Processador (CPU)"
                  icon={Cpu}
                  name={hardware.cpu?.name}
                  manufacturer={joinParts(hardware.cpu?.manufacturer, hardware.cpu?.cores ? `${hardware.cpu.cores} cores` : '', hardware.cpu?.speed ? `${hardware.cpu.speed} GHz` : '')}
                  driverLinks={getCpuChipsetLinks(hardware.cpu?.name, hardware.baseboard?.product)}
                />

                {hardware.gpus?.map((g: any, i: number) => (
                  <HardwareCard
                    key={`gpu-${i}`}
                    title={`Placa de vídeo (GPU ${i+1})`}
                    icon={Monitor}
                    name={`${g.name}${g.vram ? ` (${Math.round(g.vram / 1024)} GB VRAM)` : ''}`}
                    manufacturer={g.vendor}
                    driverLinks={getGpuDriverLinks(g.name, g.vendor)}
                  />
                ))}

                <HardwareCard
                  title="Placa-mãe"
                  icon={Layers}
                  name={hardware.baseboard?.product}
                  manufacturer={hardware.baseboard?.manufacturer}
                  driverLinks={getMoboDriverLinks(hardware.baseboard?.manufacturer, hardware.baseboard?.product)}
                />

                {hardware.ram?.map((r: any, i: number) => (
                  <HardwareCard
                    key={`ram-${i}`}
                    title={`Memória RAM (${i+1})`}
                    icon={MemoryStick}
                    name={joinParts(r.type, r.size ? `${Math.round(r.size / 1024 / 1024 / 1024)} GB` : '')}
                    manufacturer={joinParts(r.manufacturer, r.clock ? `${r.clock} MHz` : '')}
                  />
                ))}

                {hardware.disks?.map((d: any, i: number) => (
                  <HardwareCard
                    key={`disk-${i}`}
                    title={`Armazenamento${d.type ? ` (${d.type})` : ''}`}
                    icon={HardDrive}
                    name={d.name}
                    manufacturer={joinParts(d.interface, d.size ? `${Math.round(d.size / 1024 / 1024 / 1024)} GB` : '')}
                  />
                ))}

                {hardware.network?.slice(0,2).map((n: any, i: number) => (
                  <HardwareCard
                    key={`net-${i}`}
                    title="Controlador de rede / Wi-Fi"
                    icon={Network}
                    name={n.model}
                    manufacturer={n.type}
                    driverLinks={[
                      { label: 'Drivers Intel Wi-Fi & LAN', url: 'https://www.intel.com.br/content/www/br/pt/download/19351/windows-10-and-windows-11-wi-fi-drivers-for-intel-wireless-adapters.html' },
                      { label: 'Drivers Realtek PCIe GbE LAN', url: 'https://www.realtek.com/Download/List?cate_id=584' }
                    ]}
                  />
                ))}

                {hardware.audio?.slice(0,2).map((a: any, i: number) => (
                  <HardwareCard
                    key={`audio-${i}`}
                    title="Controlador de áudio"
                    icon={Headphones}
                    name={a.name}
                    manufacturer={a.manufacturer}
                    driverLinks={[
                      { label: 'Realtek High Definition Audio Driver', url: 'https://www.realtek.com/Download/List?cate_id=585' }
                    ]}
                  />
                ))}
              </div>

              <section>
                <h2 className="dh-section-title">Runtimes universais e essenciais</h2>
                <p className="dh-help mt-0.5">Instale todas as bibliotecas necessárias para rodar jogos e programas pesados sem erros de DLL.</p>
                <ul className="mt-3 grid grid-cols-2 md:grid-cols-4 rounded-xl border border-zinc-800/80 divide-x divide-zinc-800/80 overflow-hidden">
                  {[
                    ['Visual C++ (AIO)', 'https://aka.ms/vs/17/release/vc_redist.x64.exe'],
                    ['.NET Desktop 8.0', 'https://dotnet.microsoft.com/en-us/download/dotnet/8.0'],
                    ['DirectX (End-User)', 'https://www.microsoft.com/pt-br/download/details.aspx?id=35'],
                    ['Vulkan SDK', 'https://vulkan.lunarg.com/sdk/home'],
                  ].map(([label, url]) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer" className="group flex items-center justify-between gap-2 px-4 py-3 text-[13px] text-zinc-200 hover:bg-zinc-900 hover:text-zinc-50 transition-colors">
                        <span className="truncate">{label}</span>
                        <ExternalLink size={14} className="shrink-0 text-zinc-500 group-hover:text-blue-300" />
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const joinParts = (...parts: Array<string | number | undefined | null>) => parts.filter(p => p !== undefined && p !== null && String(p).trim() !== '').join(' · ');

const HardwareCard = ({ title, icon: Icon, name, manufacturer, driverLinks }: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  name?: string;
  manufacturer?: string;
  driverLinks?: { label: string; url: string }[];
}) => {
  return (
    <div className="dh-card p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 text-[12px] text-zinc-500">
        <Icon size={16} className="text-zinc-500" />
        <span>{title}</span>
      </div>
      <dl className="flex-1 mt-3 space-y-0.5">
        <dt className="sr-only">Modelo</dt>
        <dd className="text-[13.5px] font-medium text-zinc-100 leading-snug">{name || 'Desconhecido'}</dd>
        <dt className="sr-only">Fabricante</dt>
        <dd className="font-mono text-[11.5px] text-zinc-500">{manufacturer || 'Fabricante desconhecido'}</dd>
      </dl>
      {driverLinks && driverLinks.length > 0 && (
        <ul className="mt-4 pt-3 border-t border-zinc-800/80 space-y-0.5">
          {driverLinks.map((link, i) => (
            <li key={i}>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-2 -mx-1.5 px-1.5 py-1 rounded-md text-[12.5px] text-zinc-300 hover:bg-zinc-900 hover:text-blue-300 transition-colors"
              >
                <Download size={14} className="shrink-0 text-zinc-500 group-hover:text-blue-300" />
                <span className="truncate flex-1">{link.label}</span>
                <ExternalLink size={14} className="shrink-0 text-zinc-600 group-hover:text-blue-300" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const getGpuDriverLinks = (name: string = '', vendor: string = '') => {
  const text = `${name} ${vendor}`.toLowerCase();
  const links: { label: string; url: string; wingetId?: string }[] = [];

  if (text.includes('nvidia') || text.includes('geforce') || text.includes('rtx') || text.includes('gtx')) {
    links.push({ label: 'NVIDIA App (Painel Oficial)', url: 'https://www.nvidia.com/pt-br/software/nvidia-app/' });
    links.push({ label: 'Drivers Game Ready NVIDIA', url: 'https://www.nvidia.com/pt-br/geforce/drivers/' });
    links.push({ label: 'NVCleanstall (Sem Bloatware)', url: 'https://www.techpowerup.com/download/techpowerup-nvcleanstall/' });
  } else if (text.includes('amd') || text.includes('radeon') || text.includes('rx ') || text.includes('advanced micro')) {
    links.push({ label: 'AMD Software: Adrenalin Edition', url: 'https://www.amd.com/pt/support' });
    links.push({ label: 'Drivers Oficiais AMD Radeon', url: 'https://www.amd.com/en/support/download/drivers.html' });
  } else if (text.includes('intel') || text.includes('arc') || text.includes('iris') || text.includes('uhd')) {
    links.push({ label: 'Intel Arc & Iris Xe Graphics Driver', url: 'https://www.intel.com.br/content/www/br/pt/download/785597/intel-arc-iris-xe-graphics-windows.html' });
    links.push({ label: 'Intel Driver & Support Assistant', url: 'https://www.intel.com.br/content/www/br/pt/support/detect.html' });
  }
  return links;
};

const getCpuChipsetLinks = (cpuName: string = '', moboModel: string = '') => {
  const text = `${cpuName} ${moboModel}`.toLowerCase();
  const links: { label: string; url: string; wingetId?: string }[] = [];

  if (text.includes('amd') || text.includes('ryzen') || text.includes('b450') || text.includes('b550') || text.includes('x570') || text.includes('a520') || text.includes('b650') || text.includes('x670')) {
    links.push({ label: 'Drivers de Chipset AMD Ryzen (AM4/AM5)', url: 'https://www.amd.com/en/support/download/drivers.html' });
  }
  if (text.includes('intel') || text.includes('core') || text.includes('z690') || text.includes('z790') || text.includes('b660') || text.includes('b760') || text.includes('h610')) {
    links.push({ label: 'Drivers de Chipset Intel & Management Engine', url: 'https://www.intel.com.br/content/www/br/pt/support/detect.html' });
  }
  return links;
};

const getMoboDriverLinks = (manufacturer: string = '', model: string = '') => {
  const m = manufacturer.toLowerCase();
  if (m.includes('asus') || m.includes('asustek')) return [{ label: `Suporte ASUS (${model})`, url: `https://www.asus.com/br/support/Download-Center/` }];
  if (m.includes('gigabyte')) return [{ label: `Download Gigabyte (${model})`, url: `https://www.gigabyte.com/br/Support/Motherboard` }];
  if (m.includes('msi') || m.includes('micro-star')) return [{ label: `Suporte MSI (${model})`, url: `https://br.msi.com/support/download/` }];
  if (m.includes('asrock')) return [{ label: `Suporte ASRock (${model})`, url: `https://www.asrock.com/support/index.asp` }];
  if (m.includes('biostar')) return [{ label: `Portal BIOSTAR (${model})`, url: `https://www.biostar.com.tw/app/en/mb/` }];
  return [{ label: `Drivers ${manufacturer} ${model}`, url: `https://www.google.com/search?q=${encodeURIComponent(`${manufacturer} ${model} drivers support download`)}` }];
};

export default SetupHub;
