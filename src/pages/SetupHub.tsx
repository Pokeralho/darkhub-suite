import React, { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import {
  Package,
  Cpu,
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
  XSquare
} from 'lucide-react';

const appCatalog: Record<string, { id: string, name: string, desc?: string }[]> = {
  'Drivers & Desinstaladores Limpos': [
    { id: 'Wagnardsoft.DisplayDriverUninstaller', name: 'Display Driver Uninstaller (DDU)', desc: 'Remove completamente drivers GPU sem sobras' },
    { id: 'TechPowerUp.NVCleaner', name: 'NVCleanstall', desc: 'Instalação customizada de drivers NVIDIA sem bloatware' },
    { id: 'BCUninstaller.BulkCrapUninstaller', name: 'Bulk Crap Uninstaller (BCU)', desc: 'Desinstalador em lote avançado' },
    { id: 'GeekUninstaller.GeekUninstaller', name: 'Geek Uninstaller', desc: 'Desinstalador rápido e limpo' },
    { id: 'RevoUninstaller.RevoUninstaller', name: 'Revo Uninstaller Free', desc: 'Remove registros e arquivos órfãos' },
    { id: 'BleachBit.BleachBit', name: 'BleachBit', desc: 'Limpeza de privacidade open-source' },
    { id: 'IObit.Unlocker', name: 'IObit Unlocker', desc: 'Destrava arquivos bloqueados pelo Windows' }
  ],
  'Discos, Partições & Backup': [
    { id: 'ParamountSoftware.MacriumReflect.Free', name: 'Macrium Reflect Free', desc: 'Backup de imagem e clonagem de disco' },
    { id: 'AOMEI.Backupper.Standard', name: 'AOMEI Backupper Standard', desc: 'Backup e sincronização de arquivos e partições' },
    { id: 'AOMEI.PartitionAssistant.Standard', name: 'AOMEI Partition Assistant', desc: 'Gerenciador de partições e MBR/GPT' },
    { id: 'MiniTool.PartitionWizard.Free', name: 'MiniTool Partition Wizard', desc: 'Redimensionar, formatar e recuperar partições' },
    { id: 'EaseUS.PartitionMaster.Free', name: 'EaseUS Partition Master', desc: 'Gerenciamento de partições e discos' },
    { id: 'EaseUS.TodoBackup.Free', name: 'EaseUS Todo Backup', desc: 'Software de backup e clonagem de sistema' },
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
    { id: 'HWiNFO.HWiNFO', name: 'HWiNFO64', desc: 'Monitoramento global de hardware e sensores' },
    { id: 'CPUID.HWMonitor', name: 'HWMonitor', desc: 'Voltagens, temperaturas e rotações de fans' },
    { id: 'OCCT.OCCT', name: 'OCCT', desc: 'Teste de estabilidade de CPU, GPU, RAM e fonte' },
    { id: 'Geeks3D.FurMark', name: 'FurMark', desc: 'Teste de estresse térmico para GPU' },
    { id: 'GIMPS.Prime95', name: 'Prime95', desc: 'Teste de estresse pesado para CPU e memória' },
    { id: 'Maxon.CinebenchR23', name: 'Cinebench R23', desc: 'Benchmark clássico de renderização para CPU' },
    { id: 'SystemInformer.SystemInformer', name: 'System Informer (Process Hacker 3)', desc: 'Gerenciador avançado de tarefas e processos' },
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
    { id: 'VivaldiTechnologies.Vivaldi', name: 'Vivaldi', desc: 'Navegador altamente personalizável' },
    { id: 'Floorp.Floorp', name: 'Floorp', desc: 'Navegador Firefox super veloz e customizável' }
  ],
  Compactadores: [
    { id: '7zip.7zip', name: '7-Zip', desc: 'Compactador rápido e open-source' },
    { id: 'RARLab.WinRAR', name: 'WinRAR', desc: 'Clássico descompactador de arquivos RAR e ZIP' },
    { id: 'M2Team.NanaZip', name: 'NanaZip', desc: 'Fork moderno do 7-Zip integrado ao menu do Win11' },
    { id: 'GiorgioTani.PeaZip', name: 'PeaZip', desc: 'Gerenciador de arquivos compactados completo' }
  ],
  'Utilidades & Produtividade': [
    { id: 'voidtools.Everything', name: 'Everything', desc: 'Busca instantânea de arquivos no disco' },
    { id: 'Microsoft.PowerToys', name: 'Microsoft PowerToys', desc: 'Suíte de produtividade oficial da Microsoft' },
    { id: 'Notepad++.Notepad++', name: 'Notepad++', desc: 'Editor de texto leve e avançado' },
    { id: 'ShareX.ShareX', name: 'ShareX', desc: 'Captura de tela, gravação e OCR' },
    { id: 'OBSProject.OBSStudio', name: 'OBS Studio', desc: 'Gravação de tela e streaming profissional' }
  ],
  'Gamer & Launchers': [
    { id: 'Valve.Steam', name: 'Steam', desc: 'Maior plataforma de jogos para PC' },
    { id: 'EpicGames.EpicGamesLauncher', name: 'Epic Games Launcher', desc: 'Loja da Epic Games e Unreal Engine' },
    { id: 'ElectronicArts.EADesktop', name: 'EA App', desc: 'Launcher oficial da Electronic Arts' },
    { id: 'Ubisoft.Connect', name: 'Ubisoft Connect', desc: 'Plataforma oficial de jogos Ubisoft' },
    { id: 'Blizzard.BattleNet', name: 'Battle.net', desc: 'Launcher da Blizzard Entertainment' },
    { id: 'GOG.Galaxy', name: 'GOG Galaxy', desc: 'Launcher livre de DRM da CD Projekt' },
    { id: 'RiotGames.RiotClient', name: 'Riot Client', desc: 'Launcher para League of Legends e Valorant' },
    { id: 'Micro-StarInternational.Afterburner', name: 'MSI Afterburner', desc: 'Overclocking e monitoramento de GPU' },
    { id: 'Guru3D.RTSS', name: 'RivaTuner Statistics Server (RTSS)', desc: 'Estatísticas e medição de quadros' }
  ],
  'Players & Multimídia': [
    { id: 'VideoLAN.VLC', name: 'VLC Media Player', desc: 'Player multimídia universal' },
    { id: 'clsid2.mpc-hc', name: 'MPC-HC', desc: 'Media Player Classic Home Cinema' },
    { id: 'mpv.net.mpv.net', name: 'MPV Player', desc: 'Player minimalista e veloz' },
    { id: 'Spotify.Spotify', name: 'Spotify', desc: 'Streaming de música e podcasts' },
    { id: 'HandBrake.HandBrake', name: 'HandBrake', desc: 'Conversor de formatos de vídeo' },
    { id: 'Gyan.FFmpeg', name: 'FFmpeg', desc: 'Suíte de processamento audiovisual' },
    { id: 'Audacity.Audacity', name: 'Audacity', desc: 'Editor e gravador de áudio' },
    { id: 'GIMP.GIMP', name: 'GIMP', desc: 'Editor de imagens avançado open-source' },
    { id: 'KDE.Krita', name: 'Krita', desc: 'Pintura e ilustração digital' },
    { id: 'BlenderFoundation.Blender', name: 'Blender', desc: 'Criação e animação 3D profissional' }
  ],
  Comunicação: [
    { id: 'Discord.Discord', name: 'Discord', desc: 'Chat de voz, texto e comunidades' },
    { id: 'Telegram.TelegramDesktop', name: 'Telegram', desc: 'Mensageiro rápido e seguro para desktop' },
    { id: 'WhatsApp.WhatsApp', name: 'WhatsApp', desc: 'Aplicativo oficial WhatsApp para Windows' },
    { id: 'Zoom.Zoom', name: 'Zoom', desc: 'Videoconferências e reuniões online' },
    { id: 'SlackTechnologies.Slack', name: 'Slack', desc: 'Comunicação e colaboração em equipe' }
  ],
  Desenvolvimento: [
    { id: 'Microsoft.VisualStudioCode', name: 'VS Code', desc: 'Editor de código mais popular do mundo' },
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
  'Comunicação': 'setuphub.cat.communication',
  'Desenvolvimento': 'setuphub.cat.dev'
};

const SetupHub = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'apps' | 'drivers'>('apps');

  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [installing, setInstalling] = useState(false);
  const [installLogs, setInstallLogs] = useState<string[]>([]);

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
        'ParamountSoftware.MacriumReflect.Free',
        'AOMEI.PartitionAssistant.Standard',
        'BCUninstaller.BulkCrapUninstaller',
        'JAMSoftware.TreeSize.Free',
        'CrystalDewWorld.CrystalDiskInfo',
        'Rufus.Rufus',
        'SystemInformer.SystemInformer'
      ],
      gaming: [
        'Valve.Steam',
        'EpicGames.EpicGamesLauncher',
        'Discord.Discord',
        'Micro-StarInternational.Afterburner',
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-3 bg-indigo-500/10 rounded-xl">
          <Package className="text-indigo-400" size={28} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-zinc-100">Setup Hub</h2>
          <p className="text-zinc-400 mt-1">Pós-formatação, instalação em lote de ferramentas essenciais e identificação de hardware.</p>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('apps')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'apps' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
        >
          <Package size={16}/><span>{t('setuphub.tab.winget', 'Post-Install (Winget)')}</span>
        </button>
        <button
          onClick={() => setActiveTab('drivers')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'drivers' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}
        >
          <Cpu size={16}/><span>{t('setuphub.tab.drivers', 'Drivers & Hardware')}</span>
        </button>
      </div>

      {activeTab === 'apps' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          {}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mr-1">{t('setuphub.presets', 'Presets:')}</span>
              <button
                onClick={() => applyPreset('essentials')}
                className="rounded-lg bg-indigo-500/10 border border-indigo-500/30 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:bg-indigo-500/20 transition-colors"
              >
                {t('setuphub.preset.essentials', '+ Essentials')}
              </button>
              <button
                onClick={() => applyPreset('maintenance')}
                className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
              >
                {t('setuphub.preset.maintenance', '+ Maintenance & DDU')}
              </button>
              <button
                onClick={() => applyPreset('gaming')}
                className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors"
              >
                {t('setuphub.preset.gaming', '+ Gaming')}
              </button>
              <button
                onClick={() => applyPreset('dev')}
                className="rounded-lg bg-cyan-500/10 border border-cyan-500/30 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 transition-colors"
              >
                {t('setuphub.preset.dev', '+ Dev')}
              </button>
              {selectedApps.length > 0 && (
                <button
                  onClick={() => applyPreset('clear')}
                  className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors"
                >
                  {t('common.clear', 'Clear')} ({selectedApps.length})
                </button>
              )}
            </div>

            <div className="relative min-w-[240px]">
              <Search size={16} className="absolute left-3 top-1/2 -tranzinc-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder={t('setuphub.searchPlaceholder', 'Search tool, app...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-1.5 text-sm text-zinc-200 outline-none transition-colors focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Object.entries(filteredCatalog).map(([category, apps]) => {
                  const allCategorySelected = apps.every(a => selectedApps.includes(a.id));
                  return (
                    <div key={category} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                      <div className="flex items-center justify-between mb-3 border-b border-zinc-800 pb-2">
                        <h3 className="text-base font-semibold text-zinc-200">{t(CATEGORY_KEYS[category] || category, category)}</h3>
                        <button
                          onClick={() => toggleCategory(apps)}
                          className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          {allCategorySelected ? t('common.deselect', 'Deselect') : t('common.all', 'All')}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {apps.map(app => {
                          const isSelected = selectedApps.includes(app.id);
                          return (
                            <div
                              key={app.id}
                              onClick={() => !installing && toggleApp(app.id)}
                              className={`flex items-start space-x-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-zinc-800'} ${installing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {isSelected ? (
                                  <CheckSquare size={18} className="text-indigo-400" />
                                ) : (
                                  <Square size={18} className="text-zinc-500" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={`text-sm ${isSelected ? 'text-indigo-300 font-semibold' : 'text-zinc-200 font-medium'}`}>{app.name}</div>
                                {app.desc ? <div className="text-xs text-zinc-500 truncate">{t(`app.desc.${app.id}`, app.desc)}</div> : null}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 sticky top-4">
                <h3 className="text-xl font-bold text-zinc-200 mb-2">{t('setuphub.installation', 'Installation')}</h3>
                <p className="text-zinc-400 text-sm mb-4">
                  {selectedApps.length} {t('setuphub.appsSelected', 'app(s) selected').replace('{n} ', '')}
                </p>

                <button
                  onClick={handleInstallApps}
                  disabled={installing || selectedApps.length === 0}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:bg-zinc-800 text-white rounded-lg font-bold flex items-center justify-center space-x-2 transition-colors"
                >
                  {installing ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
                  <span>{installing ? t('setuphub.installing', 'Installing...') : t('setuphub.installSelected', 'Install Selected')}</span>
                </button>

                <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs text-zinc-400 flex flex-col space-y-1">
                  {installLogs.length === 0 ? (
                    <span className="opacity-50 text-center my-auto">{t('setuphub.readyToInstall', 'Ready to install.')}</span>
                  ) : (
                    installLogs.map((log, i) => (
                      <span key={i} className="whitespace-pre-wrap">{log}</span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'drivers' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          {detecting ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Loader2 size={40} className="animate-spin mb-4 text-indigo-500" />
              <p>{t('setuphub.readingSensors', 'Reading sensors and hardware specs via WMI...')}</p>
            </div>
          ) : !hardware ? (
            <div className="text-center py-12 text-zinc-500">{t('setuphub.failedHardware', 'Failed to read hardware specifications.')}</div>
          ) : (
            <>
              {}
              <div className="bg-gradient-to-r from-indigo-950/60 to-purple-950/40 border border-indigo-500/30 rounded-2xl p-6 relative overflow-hidden">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-bold uppercase tracking-wider">
                        Reconhecimento Automático
                      </span>
                      <span className="text-xs text-zinc-400">
                        {hardware.cpu?.name} + {hardware.gpus?.[0]?.name || 'GPU'}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-zinc-100">
                      Smart Driver Hub & Diagnóstico Pós-Formatação
                    </h3>
                    <p className="text-sm text-zinc-400 max-w-2xl">
                      Identificamos o seu hardware com precisão. Baixe os drivers oficiais diretamente dos fabricantes para obter máxima taxa de quadros, estabilidade e suporte a recursos avançados.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const recs: string[] = ['abbodi1406.vcredist', 'Microsoft.DirectX', 'Wagnardsoft.DisplayDriverUninstaller'];
                        const text = `${hardware.gpus?.[0]?.name || ''} ${hardware.gpus?.[0]?.vendor || ''}`.toLowerCase();
                        if (text.includes('nvidia')) recs.push('Nvidia.NvidiaApp', 'TechPowerUp.NVCleaner');
                        else if (text.includes('amd') || text.includes('radeon')) recs.push('AdvancedMicroDevicesInc.AMDSoftwareAdrenalinEdition', 'AdvancedMicroDevicesInc.AMDChipsetDrivers');
                        else if (text.includes('intel')) recs.push('Intel.IntelArcControl', 'Intel.DriverAndSupportAssistant');

                        setSelectedApps(prev => Array.from(new Set([...prev, ...recs])));
                        setActiveTab('apps');
                      }}
                      className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
                    >
                      <Download size={15} />
                      Instalar Pacote de Drivers Recomendados
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <HardwareCard
                  title="Processador (CPU)"
                  icon={<Cpu className="text-blue-400" size={24} />}
                  name={hardware.cpu?.name}
                  manufacturer={`${hardware.cpu?.manufacturer || 'AMD/Intel'} • ${hardware.cpu?.cores || 6} Cores • ${hardware.cpu?.speed || ''}GHz`}
                  driverLinks={getCpuChipsetLinks(hardware.cpu?.name, hardware.baseboard?.product)}
                />

                {hardware.gpus?.map((g: any, i: number) => (
                  <HardwareCard
                    key={`gpu-${i}`}
                    title={`Placa de Vídeo (GPU ${i+1})`}
                    icon={<Monitor className="text-emerald-400" size={24} />}
                    name={`${g.name} ${g.vram ? `(${Math.round(g.vram / 1024)}GB VRAM)` : ''}`}
                    manufacturer={g.vendor || 'Fabricante'}
                    driverLinks={getGpuDriverLinks(g.name, g.vendor)}
                  />
                ))}

                <HardwareCard
                  title="Placa Mãe (Motherboard)"
                  icon={<HardDrive className="text-orange-400" size={24} />}
                  name={hardware.baseboard?.product || 'Motherboard'}
                  manufacturer={hardware.baseboard?.manufacturer || 'Fabricante'}
                  driverLinks={getMoboDriverLinks(hardware.baseboard?.manufacturer, hardware.baseboard?.product)}
                />

                {hardware.ram?.map((r: any, i: number) => (
                  <HardwareCard
                    key={`ram-${i}`}
                    title={`Módulo de Memória RAM (${i+1})`}
                    icon={<HardDrive className="text-indigo-400" size={24} />}
                    name={`${r.type || 'DDR4/DDR5'} • ${Math.round(r.size / 1024 / 1024 / 1024)}GB`}
                    manufacturer={`${r.manufacturer || 'Memória'} • ${r.clock || '3200'}MHz`}
                  />
                ))}

                {hardware.disks?.map((d: any, i: number) => (
                  <HardwareCard
                    key={`disk-${i}`}
                    title={`Armazenamento (${d.type || 'SSD/HDD'})`}
                    icon={<HardDrive className="text-zinc-400" size={24} />}
                    name={d.name}
                    manufacturer={`${d.interface || 'NVMe/SATA'} • ${Math.round(d.size / 1024 / 1024 / 1024)}GB`}
                  />
                ))}

                {hardware.network?.slice(0,2).map((n: any, i: number) => (
                  <HardwareCard
                    key={`net-${i}`}
                    title="Controlador de Rede / Wi-Fi"
                    icon={<ExternalLink className="text-cyan-400" size={24} />}
                    name={n.model || 'Gigabit Controller'}
                    manufacturer={n.type || 'Ethernet / Wireless'}
                    driverLinks={[
                      { label: 'Drivers Intel Wi-Fi & LAN', url: 'https://www.intel.com.br/content/www/br/pt/download/19351/windows-10-and-windows-11-wi-fi-drivers-for-intel-wireless-adapters.html' },
                      { label: 'Drivers Realtek PCIe GbE LAN', url: 'https://www.realtek.com/Download/List?cate_id=584' }
                    ]}
                  />
                ))}

                {hardware.audio?.slice(0,2).map((a: any, i: number) => (
                  <HardwareCard
                    key={`audio-${i}`}
                    title="Controlador de Áudio"
                    icon={<ExternalLink className="text-pink-400" size={24} />}
                    name={a.name || 'High Definition Audio'}
                    manufacturer={a.manufacturer || 'Realtek / AMD / NVIDIA'}
                    driverLinks={[
                      { label: 'Realtek High Definition Audio Driver', url: 'https://www.realtek.com/Download/List?cate_id=585' }
                    ]}
                  />
                ))}
              </div>

              {}
              <div className="mt-8 bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-indigo-500/20 rounded-lg">
                    <Download className="text-indigo-400" size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-200">Runtimes Universais & Essenciais</h3>
                    <p className="text-zinc-400 text-sm">Instale todas as bibliotecas necessárias para rodar jogos e programas pesados sem erros de DLL.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <a href="https://aka.ms/vs/17/release/vc_redist.x64.exe" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-4 bg-zinc-950 border border-zinc-800 hover:border-indigo-500 rounded-xl transition-colors group">
                    <span className="font-bold text-zinc-300 group-hover:text-indigo-400">Visual C++ (AIO)</span>
                  </a>
                  <a href="https://dotnet.microsoft.com/en-us/download/dotnet/8.0" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-4 bg-zinc-950 border border-zinc-800 hover:border-indigo-500 rounded-xl transition-colors group">
                    <span className="font-bold text-zinc-300 group-hover:text-indigo-400">.NET Desktop 8.0</span>
                  </a>
                  <a href="https://www.microsoft.com/pt-br/download/details.aspx?id=35" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-4 bg-zinc-950 border border-zinc-800 hover:border-indigo-500 rounded-xl transition-colors group">
                    <span className="font-bold text-zinc-300 group-hover:text-indigo-400">DirectX (End-User)</span>
                  </a>
                  <a href="https://vulkan.lunarg.com/sdk/home" target="_blank" rel="noreferrer" className="flex flex-col items-center justify-center p-4 bg-zinc-950 border border-zinc-800 hover:border-indigo-500 rounded-xl transition-colors group">
                    <span className="font-bold text-zinc-300 group-hover:text-indigo-400">Vulkan SDK</span>
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

const HardwareCard = ({ title, icon, name, manufacturer, driverLinks }: any) => {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col h-full">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2 bg-zinc-800 rounded-lg">{icon}</div>
        <h3 className="text-lg font-semibold text-zinc-200">{title}</h3>
      </div>
      <div className="flex-1 mb-4">
        <p className="text-zinc-400 text-sm">Fabricante</p>
        <p className="text-zinc-200 font-medium mb-2">{manufacturer || 'Desconhecido'}</p>
        <p className="text-zinc-400 text-sm">Modelo</p>
        <p className="text-zinc-200 font-medium">{name || 'Desconhecido'}</p>
      </div>
      {driverLinks && driverLinks.length > 0 && (
        <div className="space-y-2 mt-auto pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Downloads & Drivers Oficiais:</p>
          {driverLinks.map((link: any, i: number) => (
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center space-x-2 w-full py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg transition-colors text-xs font-semibold"
            >
              <Download size={13} />
              <span className="truncate">{link.label}</span>
              <ExternalLink size={13} className="ml-1 opacity-60 shrink-0" />
            </a>
          ))}
        </div>
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
