import { useI18n } from '../i18n/I18nProvider';
import React, { useState } from 'react';
import { Activity, Server, ShieldCheck, Zap, Play, Search, Network, RefreshCw, Wifi, Info, Route } from 'lucide-react';

const NetworkTools = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'ping' | 'ports' | 'speed' | 'diag'>('ping');

  const [pingHost, setPingHost] = useState('8.8.8.8');
  const [pingLog, setPingLog] = useState<string>('');
  const [pinging, setPinging] = useState(false);
  const [mtu, setMtu] = useState(1500);

  const [portHost, setPortHost] = useState('127.0.0.1');
  const [portList, setPortList] = useState('80, 443, 8080, 3306, 21, 22');
  const [portResults, setPortResults] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);

  const [speedState, setSpeedState] = useState<'idle' | 'ping' | 'down' | 'up' | 'done'>('idle');
  const [speedMetrics, setSpeedMetrics] = useState({ ping: 0, down: 0, up: 0 });

  const [diagLog, setDiagLog] = useState('');
  const [diagBusy, setDiagBusy] = useState('');
  const [tracertHost, setTracertHost] = useState('8.8.8.8');

  const runPing = async () => {
    if (!pingHost) return;
    setPinging(true);
    setPingLog(`Iniciando Ping para ${pingHost}...\n`);
    try {
      const res = await window.darkhub?.network?.ping?.(pingHost);
      if (res?.ok) {
        setPingLog(prev => prev + res.output + `\nLatência Média: ${res.latency}ms\n`);
        if (res.latency > 0) {
          setMtu(res.latency < 50 ? 1500 : 1492);
        }
      } else {
        setPingLog(prev => prev + `Erro: ${res?.error || res?.output || 'Desconhecido'}\n`);
      }
    } catch (e: any) {
      setPingLog(prev => prev + `Exceção: ${e.message}\n`);
    } finally {
      setPinging(false);
    }
  };

  const runPortScan = async () => {
    if (!portHost || !portList) return;
    setScanning(true);
    setPortResults([]);
    try {
      const ports = portList.split(',').map(p => parseInt(p.trim())).filter(p => !isNaN(p));
      const res = await window.darkhub?.network?.portScan?.({ host: portHost, ports });
      if (res?.ok) setPortResults(res.results);
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  const runSpeedTest = async () => {
    setSpeedState('ping');
    setSpeedMetrics({ ping: 0, down: 0, up: 0 });
    try {
      const pingStart = Date.now();
      await fetch('https://speed.cloudflare.com/__down?bytes=0');
      setSpeedMetrics(m => ({ ...m, ping: Date.now() - pingStart }));
      setSpeedState('down');

      const dlStart = Date.now();
      const dlRes = await fetch('https://speed.cloudflare.com/__down?bytes=50000000', { cache: 'no-store' });
      const blob = await dlRes.blob();
      const dlMbps = ((blob.size * 8) / 1000000) / ((Date.now() - dlStart) / 1000);
      setSpeedMetrics(m => ({ ...m, down: Math.round(dlMbps) }));
      setSpeedState('up');

      const upData = new Uint8Array(20000000);
      const upStart = Date.now();
      await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: upData });
      const upMbps = ((upData.byteLength * 8) / 1000000) / ((Date.now() - upStart) / 1000);
      setSpeedMetrics(m => ({ ...m, up: Math.round(upMbps) }));
      setSpeedState('done');
    } catch (e) {
      console.error(e);
      setSpeedState('done');
    }
  };

  const runDiag = async (label: string, fn: () => Promise<any>) => {
    setDiagBusy(label);
    setDiagLog(`>>> ${label}\n`);
    try {
      const res = await fn();
      setDiagLog(`>>> ${label}\n\n${res?.output || 'Sem saída.'}\n`);
    } catch (e: any) {
      setDiagLog(`>>> ${label}\n\nErro: ${e.message}\n`);
    } finally {
      setDiagBusy('');
    }
  };

  const diagActions = [
    {
      id: 'flush',
      label: 'Limpar Cache DNS',
      icon: RefreshCw,
      desc: 'Executa ipconfig /flushdns',
      color: 'blue',
      fn: () => window.darkhub?.network?.flushDns?.()
    },
    {
      id: 'renew',
      label: 'Renovar IP (DHCP)',
      icon: Wifi,
      desc: 'Release + Renew via DHCP',
      color: 'emerald',
      fn: () => window.darkhub?.network?.renewIp?.()
    },
    {
      id: 'reset',
      label: 'Resetar TCP/IP & Winsock',
      icon: Zap,
      desc: 'netsh int ip reset + winsock reset',
      color: 'orange',
      fn: () => window.darkhub?.network?.resetTcp?.()
    },
    {
      id: 'dns',
      label: 'Informações de DNS / Adaptadores',
      icon: Info,
      desc: 'ipconfig /all completo',
      color: 'purple',
      fn: () => window.darkhub?.network?.dnsInfo?.()
    },
    {
      id: 'adapters',
      label: 'Interfaces de Rede',
      icon: Network,
      desc: 'Listagem via Node os.networkInterfaces()',
      color: 'cyan',
      fn: () => window.darkhub?.network?.adapterInfo?.()
    },
  ];

  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20',
    emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20',
    orange: 'bg-orange-500/10 border-orange-500/30 text-orange-400 hover:bg-orange-500/20',
    purple: 'bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20',
    cyan: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20',
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-3 bg-blue-500/10 rounded-xl">
          <Network className="text-blue-400" size={28} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-zinc-100">{t('net.toolkit', 'Toolkit de Rede')}</h2>
          <p className="text-zinc-400 mt-1">{t('net.toolkitDesc', 'Ferramentas avançadas para análise e otimização de infraestrutura')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
        <button onClick={() => setActiveTab('ping')} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'ping' ? 'bg-blue-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}><Activity size={16}/><span>{t('net.tab.ping', 'Ping & Latência')}</span></button>
        <button onClick={() => setActiveTab('ports')} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'ports' ? 'bg-blue-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}><Server size={16}/><span>{t('net.tab.ports', 'Scanner de Portas')}</span></button>
        <button onClick={() => setActiveTab('speed')} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'speed' ? 'bg-blue-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}><Zap size={16}/><span>{t('net.tab.speed', 'Teste de Velocidade')}</span></button>
        <button onClick={() => setActiveTab('diag')} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'diag' ? 'bg-blue-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}><ShieldCheck size={16}/><span>{t('net.tab.diag', 'Diagnósticos')}</span></button>
      </div>

      {}
      {activeTab === 'ping' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="md:col-span-1 space-y-4">
            <div className="bg-zinc-800/50 rounded-xl p-5 border border-zinc-700/50">
              <label className="block text-sm font-medium text-zinc-300 mb-2">{t('net.hostIp', 'Host / IP')}</label>
              <input type="text" value={pingHost} onChange={e => setPingHost(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:outline-none focus:border-blue-500" />
              <button onClick={runPing} disabled={pinging} className="w-full mt-4 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50">
                <Activity size={18} />
                <span>{pinging ? t('net.running', 'Executando...') : t('net.startPing', 'Iniciar Ping')}</span>
              </button>
            </div>

            <div className="bg-blue-500/10 rounded-xl p-5 border border-blue-500/20">
              <h3 className="text-blue-400 font-semibold mb-2">{t('net.optimizedMtu', 'MTU Otimizado')}</h3>
              <p className="text-3xl font-bold text-zinc-100">{mtu}</p>
              <p className="text-sm text-zinc-400 mt-1">{t('net.mtuDesc', 'Sugestão baseada na latência atual')}</p>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 h-[400px] overflow-y-auto font-mono text-sm text-green-400 whitespace-pre-wrap">
              {pingLog || t('net.waiting', 'Aguardando execução...')}
            </div>
          </div>
        </div>
      )}

      {}
      {activeTab === 'ports' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="md:col-span-1 space-y-4">
            <div className="bg-zinc-800/50 rounded-xl p-5 border border-zinc-700/50">
              <label className="block text-sm font-medium text-zinc-300 mb-2">{t('net.hostIp', 'Host / IP')}</label>
              <input type="text" value={portHost} onChange={e => setPortHost(e.target.value)} className="w-full mb-4 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:outline-none focus:border-blue-500" />
              <label className="block text-sm font-medium text-zinc-300 mb-2">{t('net.portsLabel', 'Portas (separadas por vírgula)')}</label>
              <textarea value={portList} onChange={e => setPortList(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200 focus:outline-none focus:border-blue-500 h-24 resize-none" />
              <button onClick={runPortScan} disabled={scanning} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50">
                <Search size={18} />
                <span>{scanning ? t('net.scanning', 'Escaneando...') : t('net.startScan', 'Iniciar Scan')}</span>
              </button>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="bg-zinc-800/50 rounded-xl p-5 border border-zinc-700/50 min-h-[400px]">
              <h3 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center space-x-2"><Server size={20} className="text-indigo-400"/> <span>{t('net.results', 'Resultados')}</span></h3>
              {portResults.length === 0 ? (
                <div className="text-center text-zinc-500 mt-20">{t('net.noScan', 'Nenhum scan realizado ainda.')}</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {portResults.map((r, i) => (
                    <div key={i} className={`p-4 rounded-lg border ${r.status === 'open' ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-zinc-900 border-zinc-800'}`}>
                      <div className="text-sm text-zinc-400 mb-1">{t('net.port', 'Porta')} {r.port}</div>
                      <div className={`font-bold ${r.status === 'open' ? 'text-emerald-400' : 'text-red-400'}`}>
                        {r.status === 'open' ? t('net.open', 'ABERTA') : r.status === 'closed' ? t('net.closed', 'FECHADA') : t('net.timeout', 'TIMEOUT')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {}
      {activeTab === 'speed' && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-zinc-800/50 rounded-2xl p-8 border border-zinc-700/50 flex flex-col items-center justify-center min-h-[450px]">
            {speedState === 'idle' ? (
              <div className="text-center space-y-6">
                <div className="w-32 h-32 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto border-4 border-blue-500/30 shadow-[0_0_50px_rgba(59,130,246,0.3)]">
                  <Activity size={48} className="text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-100">{t('net.readyToStart', 'Pronto para iniciar')}</h3>
                <button onClick={runSpeedTest} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold text-lg transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/25 flex items-center space-x-2">
                  <Play fill="currentColor" size={20} />
                  <span>INICIAR TESTE</span>
                </button>
              </div>
            ) : (
              <div className="w-full max-w-3xl space-y-12">
                <div className="flex justify-between items-center text-center">
                  <div className={`flex-1 ${speedState === 'ping' ? 'opacity-100 scale-110' : 'opacity-70'} transition-all duration-300`}>
                    <p className="text-sm text-zinc-400 uppercase tracking-wider font-semibold">Ping</p>
                    <p className="text-4xl font-bold text-zinc-100 mt-2">{speedMetrics.ping} <span className="text-lg text-zinc-500">ms</span></p>
                  </div>
                  <div className={`flex-1 ${speedState === 'down' ? 'opacity-100 scale-110' : 'opacity-70'} transition-all duration-300 border-x border-zinc-700`}>
                    <p className="text-sm text-zinc-400 uppercase tracking-wider font-semibold">Download</p>
                    <p className="text-5xl font-bold text-blue-400 mt-2">{speedMetrics.down} <span className="text-lg text-zinc-500">Mbps</span></p>
                  </div>
                  <div className={`flex-1 ${speedState === 'up' ? 'opacity-100 scale-110' : 'opacity-70'} transition-all duration-300`}>
                    <p className="text-sm text-zinc-400 uppercase tracking-wider font-semibold">Upload</p>
                    <p className="text-5xl font-bold text-purple-400 mt-2">{speedMetrics.up} <span className="text-lg text-zinc-500">Mbps</span></p>
                  </div>
                </div>
                {speedState !== 'done' && (
                  <div className="relative h-2 bg-zinc-900 rounded-full overflow-hidden">
                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 animate-pulse" style={{ width: '100%' }}></div>
                  </div>
                )}
                {speedState === 'done' && (
                  <div className="text-center">
                    <button onClick={() => setSpeedState('idle')} className="px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg font-medium transition-colors">Testar Novamente</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {}
      {activeTab === 'diag' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-3">
            {diagActions.map(action => {
              const Icon = action.icon;
              const busy = diagBusy === action.label;
              return (
                <button
                  key={action.id}
                  onClick={() => runDiag(action.label, action.fn)}
                  disabled={!!diagBusy}
                  className={`w-full text-left p-4 rounded-xl border transition-all disabled:opacity-50 ${colorMap[action.color]}`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon size={20} className={busy ? 'animate-spin' : ''} />
                    <div>
                      <p className="font-semibold text-sm">{action.label}</p>
                      <p className="text-xs opacity-70 mt-0.5">{action.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}

            {}
            <div className="p-4 rounded-xl border bg-zinc-800/50 border-zinc-700/50 space-y-2">
              <div className="flex items-center space-x-2 text-zinc-300">
                <Route size={16} />
                <p className="font-semibold text-sm">Traceroute</p>
              </div>
              <input
                type="text"
                value={tracertHost}
                onChange={e => setTracertHost(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 text-sm focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => runDiag(`Traceroute → ${tracertHost}`, () => window.darkhub?.network?.tracert?.(tracertHost))}
                disabled={!!diagBusy}
                className="w-full py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {diagBusy.startsWith('Traceroute') ? 'Executando...' : 'Iniciar Traceroute'}
              </button>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 h-[520px] overflow-y-auto font-mono text-sm text-green-400 whitespace-pre-wrap">
              {diagBusy ? (
                <span className="text-yellow-400 animate-pulse">⟳ Executando: {diagBusy}...</span>
              ) : (
                diagLog || 'Selecione uma ação para executar o diagnóstico.'
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkTools;
