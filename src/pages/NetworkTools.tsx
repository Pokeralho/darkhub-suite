import { useI18n } from '../i18n/I18nProvider';
import React, { useState } from 'react';
import { Activity, Server, ShieldCheck, Zap, Play, Search, Network, RefreshCw, Wifi, Info, Route, Loader2, Gauge, Globe, Sliders, AlertTriangle } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { LiveLatencyPanel, RouteMtuPanel, BufferbloatPanel, DnsBenchPanel, LatencyTweaksPanel } from '../components/network/LatencyLab';

const NetworkTools = () => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'ping' | 'live' | 'route' | 'bloat' | 'dns' | 'tweaks' | 'ports' | 'speed' | 'diag'>('ping');

  const [pingHost, setPingHost] = useState('8.8.8.8');
  const [pingLog, setPingLog] = useState<string>('');
  const [pinging, setPinging] = useState(false);

  const [portHost, setPortHost] = useState('127.0.0.1');
  const [portList, setPortList] = useState('80, 443, 8080, 3306, 21, 22');
  const [portResults, setPortResults] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [portError, setPortError] = useState<string | null>(null);

  const [speedState, setSpeedState] = useState<'idle' | 'ping' | 'down' | 'up' | 'done'>('idle');
  const [speedMetrics, setSpeedMetrics] = useState({ ping: 0, down: 0, up: 0 });
  const [speedError, setSpeedError] = useState<string | null>(null);

  const [diagLog, setDiagLog] = useState('');
  const [diagBusy, setDiagBusy] = useState('');
  const [tracertHost, setTracertHost] = useState('8.8.8.8');
  const [confirmReset, setConfirmReset] = useState(false);

  const runPing = async () => {
    if (!pingHost) return;
    setPinging(true);
    setPingLog(`Iniciando Ping para ${pingHost}...\n`);
    try {
      const res = await window.darkhub?.network?.ping?.(pingHost);
      if (res?.ok) {
        setPingLog(prev => prev + res.output + `\nLatência Média: ${res.latency}ms\n`);
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
    setPortError(null);
    try {
      const ports = portList.split(',').map(p => parseInt(p.trim(), 10)).filter(p => Number.isInteger(p) && p > 0 && p <= 65535);
      if (!ports.length) { setPortError(t('net.noValidPorts', 'Nenhuma porta válida (1-65535).')); return; }
      const res = await window.darkhub?.network?.portScan?.({ host: portHost, ports });
      if (res?.ok) setPortResults(Array.isArray(res.results) ? res.results : []);
      else setPortError(res?.error ?? t('net.scanFailed', 'Falha no scan.'));
    } catch (e: any) {
      setPortError(e?.message ?? String(e));
    } finally {
      setScanning(false);
    }
  };

  const runSpeedTest = async () => {
    setSpeedState('ping');
    setSpeedMetrics({ ping: 0, down: 0, up: 0 });
    setSpeedError(null);
    try {
      const pingStart = Date.now();
      const pingRes = await fetch('https://speed.cloudflare.com/__down?bytes=0', { cache: 'no-store' });
      if (!pingRes.ok) throw new Error(`HTTP ${pingRes.status}`);
      setSpeedMetrics(m => ({ ...m, ping: Date.now() - pingStart }));
      setSpeedState('down');

      const dlStart = Date.now();
      const dlRes = await fetch('https://speed.cloudflare.com/__down?bytes=50000000', { cache: 'no-store' });
      if (!dlRes.ok || !dlRes.body) throw new Error(`HTTP ${dlRes.status}`);
      // count bytes as they stream instead of buffering 50 MB into a Blob
      const reader = dlRes.body.getReader();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
      }
      const dlMbps = ((received * 8) / 1000000) / ((Date.now() - dlStart) / 1000);
      setSpeedMetrics(m => ({ ...m, down: Math.round(dlMbps) }));
      setSpeedState('up');

      const upData = new Uint8Array(20000000);
      const upStart = Date.now();
      const upRes = await fetch('https://speed.cloudflare.com/__up', { method: 'POST', body: upData });
      if (!upRes.ok) throw new Error(`HTTP ${upRes.status}`);
      const upMbps = ((upData.byteLength * 8) / 1000000) / ((Date.now() - upStart) / 1000);
      setSpeedMetrics(m => ({ ...m, up: Math.round(upMbps) }));
      setSpeedState('done');
    } catch (e: any) {
      setSpeedError(e?.message ?? String(e));
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
      fn: () => window.darkhub?.network?.flushDns?.()
    },
    {
      id: 'renew',
      label: 'Renovar IP (DHCP)',
      icon: Wifi,
      desc: 'Release + Renew via DHCP',
      fn: () => window.darkhub?.network?.renewIp?.()
    },
    {
      id: 'reset',
      label: 'Resetar TCP/IP & Winsock',
      icon: Zap,
      desc: 'netsh int ip reset + winsock reset',
      confirm: true,
      fn: () => window.darkhub?.network?.resetTcp?.()
    },
    {
      id: 'dns',
      label: t('network.dnsInfo', 'Informações de DNS / Adaptadores'),
      icon: Info,
      desc: t('network.dnsInfoDesc', 'ipconfig /all completo'),
      fn: () => window.darkhub?.network?.dnsInfo?.()
    },
    {
      id: 'adapters',
      label: 'Interfaces de Rede',
      icon: Network,
      desc: 'Listagem via Node os.networkInterfaces()',
      fn: () => window.darkhub?.network?.adapterInfo?.()
    },
  ];

  const tabs = [
    { id: 'ping' as const, icon: Activity, label: t('net.tab.ping', 'Ping & Latência') },
    { id: 'live' as const, icon: Activity, label: t('netx.tab.live', 'Monitor ao vivo') },
    { id: 'route' as const, icon: Route, label: t('netx.tab.route', 'Rota & MTU') },
    { id: 'bloat' as const, icon: Gauge, label: t('netx.tab.bloat', 'Bufferbloat') },
    { id: 'dns' as const, icon: Globe, label: t('netx.tab.dns', 'DNS') },
    { id: 'tweaks' as const, icon: Sliders, label: t('netx.tab.tweaks', 'Ajustes de latência') },
    { id: 'ports' as const, icon: Server, label: t('net.tab.ports', 'Scanner de Portas') },
    { id: 'speed' as const, icon: Zap, label: t('net.tab.speed', 'Teste de Velocidade') },
    { id: 'diag' as const, icon: ShieldCheck, label: t('net.tab.diag', 'Diagnósticos') },
  ];

  const consoleCls = 'rounded-xl border border-zinc-800/80 bg-zinc-950 p-4 overflow-y-auto font-mono text-[12.5px] leading-relaxed text-zinc-300 whitespace-pre-wrap';
  const speedPhases: { key: 'ping' | 'down' | 'up'; label: string; unit: string }[] = [
    { key: 'ping', label: 'Ping', unit: 'ms' },
    { key: 'down', label: 'Download', unit: 'Mbps' },
    { key: 'up', label: 'Upload', unit: 'Mbps' },
  ];
  const phaseOrder = ['ping', 'down', 'up', 'done'];

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader title={t('net.toolkit', 'Toolkit de Rede')} subtitle={t('net.toolkitDesc', 'Ferramentas avançadas para análise e otimização de infraestrutura')}>
        <div role="tablist" aria-label={t('net.toolkit', 'Toolkit de Rede')} className="flex gap-5 -mb-5 overflow-x-auto overflow-y-hidden">
          {tabs.map(({ id, icon: Icon, label }) => {
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

      {activeTab === 'ping' && (
        <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 animate-in">
          <div className="space-y-6">
            <div>
              <label htmlFor="ping-host" className="dh-label block mb-1.5">{t('net.hostIp', 'Host / IP')}</label>
              <input id="ping-host" type="text" value={pingHost} onChange={e => setPingHost(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !pinging) runPing(); }} spellCheck={false} className="dh-input w-full font-mono" />
              <button onClick={runPing} disabled={pinging || !pingHost} className="dh-btn dh-btn-primary w-full mt-3">
                {pinging ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                <span>{pinging ? t('net.running', 'Executando...') : t('net.startPing', 'Iniciar Ping')}</span>
              </button>
            </div>

            <div className="border-t border-zinc-800/80 pt-4">
              <p className="dh-label">MTU</p>
              <p className="dh-help mt-1.5">{t('netx.mtuMoved', 'A latência não indica o MTU. Meça o MTU real do caminho (ping com "não fragmentar") na aba Rota & MTU.')}</p>
              <button className="dh-btn dh-btn-sm mt-2" onClick={() => setActiveTab('route')}><Route size={12} />{t('netx.tab.route', 'Rota & MTU')}</button>
            </div>
          </div>
          <div className={`${consoleCls} h-[420px]`} aria-live="polite">
            {pingLog || <span className="font-sans text-zinc-500">{t('net.waiting', 'Aguardando execução...')}</span>}
          </div>
        </div>
      )}

      {activeTab === 'live' && <LiveLatencyPanel />}
      {activeTab === 'route' && <RouteMtuPanel />}
      {activeTab === 'bloat' && <BufferbloatPanel />}
      {activeTab === 'dns' && <DnsBenchPanel />}
      {activeTab === 'tweaks' && <LatencyTweaksPanel />}

      {activeTab === 'ports' && (
        <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-6 animate-in">
          <div className="space-y-3">
            <div>
              <label htmlFor="port-host" className="dh-label block mb-1.5">{t('net.hostIp', 'Host / IP')}</label>
              <input id="port-host" type="text" value={portHost} onChange={e => setPortHost(e.target.value)} spellCheck={false} className="dh-input w-full font-mono" />
            </div>
            <div>
              <label htmlFor="port-list" className="dh-label block mb-1.5">{t('net.portsLabel', 'Portas (separadas por vírgula)')}</label>
              <textarea id="port-list" value={portList} onChange={e => setPortList(e.target.value)} spellCheck={false} className="dh-input w-full h-24 py-2 font-mono resize-none" />
            </div>
            <button onClick={runPortScan} disabled={scanning} className="dh-btn dh-btn-primary w-full">
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              <span>{scanning ? t('net.scanning', 'Escaneando...') : t('net.startScan', 'Iniciar Scan')}</span>
            </button>
          </div>
          <section aria-labelledby="port-results" className="min-w-0">
            <h2 id="port-results" className="dh-section-title mb-3">{t('net.results', 'Resultados')}</h2>
            {portError ? (
              <p role="alert" className="mb-3 text-[12.5px] text-red-400">
                {portError} <button onClick={runPortScan} disabled={scanning} className="ml-2 underline underline-offset-2 text-red-300 hover:text-red-200">{t('common.retry', 'Tentar novamente')}</button>
              </p>
            ) : null}
            {scanning ? (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-8 rounded-md bg-zinc-900 animate-pulse" />)}
              </div>
            ) : portResults.length === 0 ? (
              <p className="py-10 text-[12.5px] text-zinc-500">{t('net.noScan', 'Nenhum scan realizado ainda.')}</p>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="text-[11px] text-zinc-500 text-left border-b border-zinc-800/80">
                    <th className="font-normal py-2 w-32">{t('net.port', 'Porta')}</th>
                    <th className="font-normal py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {portResults.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2 font-mono text-zinc-200">{r.port}</td>
                      <td className={`py-2 ${r.status === 'open' ? 'text-emerald-400' : r.status === 'closed' ? 'text-zinc-400' : 'text-amber-400'}`}>
                        {r.status === 'open' ? t('net.open', 'ABERTA') : r.status === 'closed' ? t('net.closed', 'FECHADA') : t('net.timeout', 'TIMEOUT')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}

      {activeTab === 'speed' && (
        <div className="animate-in max-w-3xl">
          <div className="grid grid-cols-3 divide-x divide-zinc-800/80 border-y border-zinc-800/80">
            {speedPhases.map(({ key, label, unit }) => {
              const running = speedState === key;
              const reached = speedState !== 'idle' && phaseOrder.indexOf(speedState) >= phaseOrder.indexOf(key);
              const val = speedMetrics[key];
              return (
                <div key={key} className="px-5 py-6 first:pl-0">
                  <p className="text-[12px] text-zinc-500 flex items-center gap-1.5">
                    {label}
                    {running ? <Loader2 size={12} className="animate-spin text-blue-300" /> : null}
                  </p>
                  <p className={`mt-2 font-mono text-[32px] leading-none tracking-[-0.02em] ${reached && !running ? 'text-zinc-50' : 'text-zinc-600'}`}>
                    {reached && !running ? val : running ? <span className="inline-block h-7 w-16 rounded bg-zinc-900 animate-pulse align-middle" /> : '0'}
                    <span className="ml-1.5 text-[13px] text-zinc-500">{unit}</span>
                  </p>
                </div>
              );
            })}
          </div>

          {speedState !== 'idle' && speedState !== 'done' && (
            <div className="mt-4 h-[3px] rounded-full bg-zinc-900 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={phaseOrder.indexOf(speedState)}>
              <div className="h-full bg-blue-400 transition-[width] duration-200" style={{ width: `${((phaseOrder.indexOf(speedState) + 0.5) / 3) * 100}%` }} />
            </div>
          )}

          {speedState === 'done' && speedError && (
            <p role="alert" className="mt-4 text-[12.5px] text-red-400">
              {t('net.speedFailed', 'Teste interrompido')}: {speedError}
            </p>
          )}

          <div className="mt-6 flex items-center gap-3">
            {speedState === 'idle' ? (
              <>
                <button onClick={runSpeedTest} className="dh-btn dh-btn-primary">
                  <Play size={14} />
                  <span>Iniciar teste</span>
                </button>
                <span className="dh-help">{t('net.readyToStart', 'Pronto para iniciar')} · <span className="dh-tag">speed.cloudflare.com</span></span>
              </>
            ) : speedState === 'done' ? (
              <button onClick={() => setSpeedState('idle')} className="dh-btn">
                <RefreshCw size={14} />
                Testar novamente
              </button>
            ) : null}
          </div>
        </div>
      )}

      {activeTab === 'diag' && (
        <div className="animate-in grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-6">
          <div className="space-y-5">
            <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
              {diagActions.map(action => {
                const Icon = action.icon;
                const busy = diagBusy === action.label;
                return (
                  <li key={action.id}>
                    <button
                      onClick={() => ((action as any).confirm ? setConfirmReset(true) : runDiag(action.label, action.fn))}
                      disabled={!!diagBusy}
                      className="group w-full text-left flex items-start gap-3 py-3 px-1 hover:bg-zinc-900/60 rounded-md disabled:opacity-50 transition-colors"
                    >
                      {busy ? <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-blue-300" /> : <Icon size={16} className="mt-0.5 shrink-0 text-zinc-500 group-hover:text-blue-300 transition-colors" />}
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-zinc-100">{action.label}</span>
                        <span className="block font-mono text-[11.5px] text-zinc-500 mt-0.5">{action.desc}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {confirmReset ? (
              <div role="alertdialog" aria-labelledby="netx-reset-title" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                <p id="netx-reset-title" className="text-[13px] font-medium text-amber-200 flex items-center gap-2"><AlertTriangle size={14} />{t('netx.resetTitle', 'Redefinir Winsock e TCP/IP?')}</p>
                <p className="dh-help">{t('netx.resetBody', 'Volta a pilha de rede ao padrão de fábrica: remove LSPs de terceiros (alguns VPNs/antivírus precisam ser reinstalados) e pode apagar IP fixo configurado no adaptador. Não pode ser desfeito, pede administrador e só vale depois de REINICIAR o Windows. Use apenas se a internet estiver quebrada.')}</p>
                <div className="flex gap-2">
                  <button className="dh-btn dh-btn-sm dh-btn-danger" onClick={() => { setConfirmReset(false); const a = diagActions.find((x) => x.id === 'reset')!; runDiag(a.label, a.fn); }}>{t('netx.resetConfirm', 'Redefinir e reiniciar depois')}</button>
                  <button className="dh-btn dh-btn-sm" onClick={() => setConfirmReset(false)}>{t('netx.cancel', 'Cancelar')}</button>
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="tracert-host" className="dh-label flex items-center gap-2 mb-1.5"><Route size={14} className="text-zinc-500" /> Traceroute</label>
              <div className="flex gap-2">
                <input
                  id="tracert-host"
                  type="text"
                  value={tracertHost}
                  onChange={e => setTracertHost(e.target.value)}
                  spellCheck={false}
                  className="dh-input flex-1 min-w-0 font-mono"
                />
                <button
                  onClick={() => runDiag(`Traceroute → ${tracertHost}`, () => window.darkhub?.network?.tracert?.(tracertHost))}
                  disabled={!!diagBusy}
                  className="dh-btn"
                >
                  {diagBusy.startsWith('Traceroute') ? 'Executando...' : 'Iniciar'}
                </button>
              </div>
            </div>
          </div>

          <div className={`${consoleCls} h-[520px]`} aria-live="polite">
            {diagBusy ? (
              <span className="inline-flex items-center gap-2 font-sans text-zinc-400"><Loader2 size={14} className="animate-spin text-blue-300" /> Executando: {diagBusy}...</span>
            ) : (
              diagLog || <span className="font-sans text-zinc-500">Selecione uma ação para executar o diagnóstico.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NetworkTools;
