import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, ShieldCheck, Loader2, Trash2, Eye, Shield, Activity, Zap,
  Globe, Radio, Lock, AlertTriangle, CheckCircle2, RefreshCw, Terminal, ExternalLink,
  Search, Laptop, Server, KeyRound, Wifi, Flame, Sparkles, Code, Download, Upload, Users
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
import PageHeader from '../components/ui/PageHeader';

type SecurityTab = 'malware' | 'phishing' | 'network' | 'ransomware' | 'tracking' | 'community';

export default function AdvancedSecurity() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<SecurityTab>('malware');
  const [isScanning, setIsScanning] = useState(false);
  const [threats, setThreats] = useState<any[]>([]);
  const [trackers, setTrackers] = useState<any[]>([]);
  const [trackingSummary, setTrackingSummary] = useState<any | null>(null);
  const [customDomains, setCustomDomains] = useState<string>('');
  const [hasScanned, setHasScanned] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const [phishingStatus, setPhishingStatus] = useState<{ active?: boolean; totalDomains?: number; rulesCount?: number } | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlScanResult, setUrlScanResult] = useState<any | null>(null);

  const [connections, setConnections] = useState<any[]>([]);
  const [connectionSearch, setConnectionSearch] = useState('');

  const [ransomwareArmor, setRansomwareArmor] = useState<{ vssRunning?: boolean; vssStatus?: string; smb1Disabled?: boolean } | null>(null);

  const [communityStats, setCommunityStats] = useState<any | null>(null);
  const [communityJsonInput, setCommunityJsonInput] = useState<string>('');

  useEffect(() => {
    loadPhishingStatus();
    loadRansomwareStatus();
    loadCommunityRulesStats();
  }, []);

  const loadPhishingStatus = async () => {
    if (!window.darkhub?.security?.getPhishingShieldStatus) return;
    try {
      const res = await window.darkhub.security.getPhishingShieldStatus();
      if (res?.ok) setPhishingStatus(res);
    } catch {}
  };

  const loadRansomwareStatus = async () => {
    if (!window.darkhub?.security?.checkRansomwareArmor) return;
    try {
      const res = await window.darkhub.security.checkRansomwareArmor();
      if (res?.ok && res.armor) setRansomwareArmor(res.armor);
    } catch {}
  };

  const loadCommunityRulesStats = async () => {
    if (!window.darkhub?.security?.getCommunityRules) return;
    try {
      const res = await window.darkhub.security.getCommunityRules();
      if (res?.ok) setCommunityStats(res);
    } catch {}
  };

  const handleScan = async () => {
    setIsScanning(true);
    setStatusMsg(null);
    if (window.darkhub) {
      try {
        const res = await window.darkhub.security.scanProcesses();
        setThreats(Array.isArray(res) ? res : []);
      } catch (err: any) {
        setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
      }
    }
    setIsScanning(false);
    setHasScanned(true);
  };

  const handleKill = async (pid: number, name?: string) => {
    if (!window.darkhub) return;
    if (!confirm(`Encerrar o processo ${name ?? ''} (PID ${pid})?`)) return;
    try {
      const res = await window.darkhub.security.killProcess(pid);
      if (res?.ok) {
        setThreats((prev) => prev.filter((t) => t.pid !== pid));
      } else {
        setStatusMsg({ ok: false, msg: res?.error ?? `Falha ao encerrar PID ${pid}` });
      }
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    }
  };

  const handleTogglePhishingShield = async (enable: boolean) => {
    setIsScanning(true);
    setStatusMsg(null);
    try {
      const res = enable
        ? await window.darkhub.security.enablePhishingShield()
        : await window.darkhub.security.disablePhishingShield();
      setStatusMsg({ ok: res.ok, msg: res.ok ? res.msg : res.error });
      await loadPhishingStatus();
      await loadCommunityRulesStats();
    } catch (e: any) {
      setStatusMsg({ ok: false, msg: e.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;
    setIsScanning(true);
    setUrlScanResult(null);
    try {
      const res = await window.darkhub.security.scanUrl({ url: urlInput.trim() });
      if (res?.ok) {
        setUrlScanResult(res);
      } else {
        setStatusMsg({ ok: false, msg: res?.error || 'Falha ao analisar URL' });
      }
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleScanNetworkConnections = async () => {
    setIsScanning(true);
    setStatusMsg(null);
    try {
      const res = await window.darkhub.security.getLiveNetworkConnections();
      if (res?.ok) {
        setConnections(res.connections || []);
      } else {
        setStatusMsg({ ok: false, msg: res?.error || 'Falha ao inspecionar conexões' });
      }
    } catch (e: any) {
      setStatusMsg({ ok: false, msg: e.message });
    } finally {
      setIsScanning(false);
      setHasScanned(true);
    }
  };

  const handleEnableRansomwareArmor = async () => {
    setIsScanning(true);
    setStatusMsg(null);
    try {
      const res = await window.darkhub.security.enableRansomwareArmor();
      setStatusMsg({ ok: res.ok, msg: res.ok ? res.msg : res.error });
      await loadRansomwareStatus();
    } catch (e: any) {
      setStatusMsg({ ok: false, msg: e.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleImportCommunityRules = async () => {
    if (!communityJsonInput.trim()) return;
    setIsScanning(true);
    setStatusMsg(null);
    try {
      const parsed = JSON.parse(communityJsonInput.trim());
      const res = await window.darkhub.security.importCommunityRules(parsed);
      if (res?.ok) {
        setStatusMsg({ ok: true, msg: res.msg });
        setCommunityJsonInput('');
        await loadCommunityRulesStats();
        await loadPhishingStatus();
      } else {
        setStatusMsg({ ok: false, msg: res?.error || 'Falha ao importar regras' });
      }
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: 'Formato JSON inválido: ' + err.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleResetCommunityRules = async () => {
    if (!confirm('Deseja redefinir as regras comunitárias para o padrão de fábrica?')) return;
    setIsScanning(true);
    try {
      const res = await window.darkhub.security.resetCommunityRules();
      setStatusMsg({ ok: res.ok, msg: res.ok ? res.msg : res.error });
      await loadCommunityRulesStats();
      await loadPhishingStatus();
    } catch (e: any) {
      setStatusMsg({ ok: false, msg: e.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleDownloadRulesTemplate = () => {
    const template = {
      phishingDomains: [
        'exemplo-golpe-steam.xyz',
        'exemplo-falso-discord.nitro'
      ],
      keywords: [
        'claim-airdrop-now',
        'auth-security-pass'
      ],
      brands: [
        {
          name: 'MeuServico',
          target: 'meuservico.com.br',
          typos: ['meuservicoo', 'meu-servico']
        }
      ]
    };
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'darkhub-community-rules-template.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleAuditTracking = async () => {
    setIsScanning(true);
    setStatusMsg(null);
    try {
      if (window.darkhub) {
        const res = await window.darkhub.security.auditTracking();
        if (res?.ok) {
          setTrackers(Array.isArray(res.trackers) ? res.trackers : []);
          setTrackingSummary(res.summary ?? null);
          setHasScanned(true);
        } else {
          setStatusMsg({ ok: false, msg: res?.error ?? 'Falha na auditoria.' });
        }
      }
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setIsScanning(false);
    }
  };

  const handleBlockTracking = async () => {
    setIsScanning(true);
    try {
      if (window.darkhub) {
        const res = await window.darkhub.security.blockTracking();
        setStatusMsg({ ok: Boolean(res?.ok), msg: res?.ok ? res.msg : res?.error });
      }
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setIsScanning(false);
    }
  };

  const handleUnblockTracking = async () => {
    setIsScanning(true);
    try {
      if (window.darkhub?.security?.unblockTracking) {
        const res = await window.darkhub.security.unblockTracking();
        setStatusMsg({ ok: Boolean(res?.ok), msg: res?.ok ? res.msg : res?.error });
      }
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setIsScanning(false);
    }
  };

  const loadTrackingDomains = async () => {
    if (!window.darkhub?.security?.getTrackingDomains) return;
    try {
      const res = await window.darkhub.security.getTrackingDomains();
      if (res?.ok) {
        const list = Array.isArray(res.custom) ? res.custom : [];
        setCustomDomains(list.join('\n'));
      }
    } catch {}
  };

  const saveTrackingDomains = async () => {
    if (!window.darkhub?.security?.setCustomTrackingDomains) return;
    const domains = customDomains
      .split(/\r?\n/g)
      .map((d) => d.trim())
      .filter(Boolean);
    setIsScanning(true);
    try {
      const res = await window.darkhub.security.setCustomTrackingDomains({ domains });
      if (res?.ok) setStatusMsg({ ok: true, msg: `Lista personalizada salva (${res.count}).` });
      else setStatusMsg({ ok: false, msg: res?.error ?? 'Falha ao salvar.' });
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setIsScanning(false);
    }
  };

  const filteredConnections = connections.filter(
    (c) =>
      c.ProcessName?.toLowerCase().includes(connectionSearch.toLowerCase()) ||
      c.Local?.includes(connectionSearch) ||
      c.Remote?.includes(connectionSearch) ||
      String(c.Pid).includes(connectionSearch)
  );

  const tabs: { id: SecurityTab; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; onSelect: () => void }[] = [
    { id: 'malware', icon: Activity, label: 'Processos', onSelect: () => { setActiveTab('malware'); setHasScanned(false); setStatusMsg(null); } },
    { id: 'phishing', icon: Globe, label: 'Anti-phishing', onSelect: () => { setActiveTab('phishing'); setStatusMsg(null); loadPhishingStatus(); } },
    { id: 'network', icon: Radio, label: 'Sentinela de rede', onSelect: () => { setActiveTab('network'); setStatusMsg(null); handleScanNetworkConnections(); } },
    { id: 'ransomware', icon: Lock, label: 'Anti-ransomware', onSelect: () => { setActiveTab('ransomware'); setStatusMsg(null); loadRansomwareStatus(); } },
    { id: 'tracking', icon: Eye, label: 'Rastreadores', onSelect: () => { setActiveTab('tracking'); setHasScanned(false); setStatusMsg(null); } },
    { id: 'community', icon: Users, label: 'Regras da comunidade', onSelect: () => { setActiveTab('community'); setStatusMsg(null); loadCommunityRulesStats(); } },
  ];

  const sevText = (risk?: string) => risk === 'CRITICAL' || risk === 'MALICIOUS' ? 'text-red-400' : risk === 'SUSPICIOUS' || risk === 'HIGH' || risk === 'MEDIUM' || risk === 'WARNING' ? 'text-amber-400' : risk === 'SAFE' || risk === 'CLEAN' ? 'text-emerald-400' : 'text-amber-400';
  const verdictText = (v?: string) => v === 'MALICIOUS' ? 'text-red-400' : v === 'SUSPICIOUS' ? 'text-amber-400' : 'text-emerald-400';
  const skel = (w = 'w-16') => <span className={`inline-block h-3.5 ${w} rounded bg-zinc-900 animate-pulse align-middle`} />;
  const activeDomains = communityStats?.totalActivePhishingDomains || phishingStatus?.totalDomains;

  const tableSkeleton = (
    <div className="space-y-2" aria-busy="true">
      {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-8 rounded-md bg-zinc-900 animate-pulse" />)}
    </div>
  );

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Central de segurança
            <HelpTip
              title="Segurança e proteção em tempo real"
              description="Monitore a integridade do sistema, bloqueie golpes de phishing, audite processos voláteis e proteja contra ransomware."
              sections={[
                { title: 'Anti-phishing', content: 'Bloqueio de domínios maliciosos no DNS e scanner heurístico de URLs.' },
                { title: 'Heurística de processos', content: 'Detecção de aleatoriedade de entropia binária e ausência de assinaturas digitais.' },
                { title: 'Regras comunitárias', content: 'Importe feeds de inteligência contra ameaças e colabore com novas regras.' }
              ]}
              buttonLabel={t('help.button')}
            />
          </span>
        }
        subtitle="Proteção endpoint avançada, anti-phishing proativo e auditoria de tráfego de rede."
        actions={phishingStatus?.active ? (
          <span className="hidden sm:inline-flex items-center gap-2 text-[12px] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Escudo de rede ativo
          </span>
        ) : null}
      >
        <div role="tablist" aria-label="Central de segurança" className="flex gap-5 -mb-5 overflow-x-auto overflow-y-hidden custom-scrollbar">
          {tabs.map(({ id, icon: Icon, label, onSelect }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={onSelect}
                className={`relative h-9 inline-flex items-center gap-2 text-[13px] whitespace-nowrap border-b-2 transition-colors ${active ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
              >
                <Icon size={16} className={active ? 'text-blue-300' : 'text-zinc-500'} />
                {label}
              </button>
            );
          })}
        </div>
      </PageHeader>

      {statusMsg && (
        <div role="status" className={`mb-5 flex items-start justify-between gap-3 text-[12.5px] ${statusMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          <div className="flex items-start gap-2 min-w-0">
            {statusMsg.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
            <span className="break-words">{statusMsg.msg}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="shrink-0 text-[12px] text-zinc-500 hover:text-zinc-200">
            Fechar
          </button>
        </div>
      )}

      {activeTab === 'malware' && (
        <section className="animate-in">
          <SectionHead
            title="Varredura heurística de memória"
            desc="Analisa processos ativos via entropia de Shannon, assinaturas Authenticode e caminhos de execução suspeitos."
            actions={
              <button onClick={handleScan} disabled={isScanning} className="dh-btn dh-btn-primary">
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {isScanning ? 'Escaneando...' : 'Iniciar varredura'}
              </button>
            }
          />

          {isScanning ? tableSkeleton : !hasScanned ? (
            <p className="py-12 border-t border-zinc-800/80 text-[12.5px] text-zinc-500">
              Nenhuma varredura nesta sessão. Inicie a varredura para listar processos com indicadores de atenção.
            </p>
          ) : threats.length === 0 ? (
            <div className="py-10 border-t border-zinc-800/80 flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 text-emerald-400 shrink-0" size={16} />
              <div>
                <h3 className="text-[13px] font-medium text-zinc-100">Nenhum processo com anomalia detectado</h3>
                <p className="dh-help mt-0.5">Todos os binários em execução possuem assinaturas válidas e níveis normais de entropia.</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-[12px] text-zinc-500 mb-2">Processos com indicadores de atenção <span className="font-mono text-zinc-300">({threats.length})</span></p>
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="text-[11px] text-zinc-500 border-b border-zinc-800/80">
                    <th className="py-2 pr-4 font-normal w-28">Risco</th>
                    <th className="py-2 pr-4 font-normal">Processo</th>
                    <th className="py-2 pr-4 font-normal w-20 text-right">PID</th>
                    <th className="py-2 pr-4 font-normal w-24 text-right">Memória</th>
                    <th className="py-2 font-normal w-32"><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {threats.map((threat, index) => (
                    <tr key={index} className="align-top hover:bg-zinc-900/40">
                      <td className="py-2.5 pr-4">
                        <span className={`font-medium ${sevText(threat.risk)}`}>{threat.risk}</span>
                        <span className="block font-mono text-[11px] text-zinc-500">{threat.score}<span className="text-zinc-600">/100</span></span>
                      </td>
                      <td className="py-2.5 pr-4 min-w-0">
                        <span className="font-mono text-zinc-100">{threat.Name}</span>
                        <span className="block font-mono text-[11px] text-zinc-500 break-all">{threat.Path}</span>
                        {threat.flags && threat.flags.length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                            {threat.flags.map((f: string, fi: number) => (
                              <span key={fi} className="dh-tag text-zinc-400">{f}</span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-zinc-300">{threat.pid}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-zinc-300">{threat.MemoryMb ? <>{threat.MemoryMb}<span className="text-zinc-500"> MB</span></> : null}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => handleKill(threat.pid, threat.Name)} className="dh-btn dh-btn-danger dh-btn-sm">
                          <Trash2 size={14} /> Finalizar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}

      {activeTab === 'phishing' && (
        <div className="space-y-10 animate-in">
          <section>
            <SectionHead
              title="Escudo de rede anti-phishing (DNS sinkhole)"
              desc="Bloqueia automaticamente domínios conhecidos de golpes, clones da Steam/Discord, falsos portais de autenticação Microsoft/Google e crypto drainers."
              actions={phishingStatus?.active ? (
                <button onClick={() => handleTogglePhishingShield(false)} disabled={isScanning} className="dh-btn">
                  Desativar escudo
                </button>
              ) : (
                <button onClick={() => handleTogglePhishingShield(true)} disabled={isScanning} className="dh-btn dh-btn-accent">
                  {isScanning ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Ativar escudo
                </button>
              )}
            />
            <StatRow items={[
              {
                label: 'Status do escudo',
                value: !phishingStatus ? skel('w-24') : phishingStatus.active
                  ? <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle2 size={14} /> Protegido</span>
                  : <span className="inline-flex items-center gap-1.5 text-amber-400"><AlertTriangle size={14} /> Desativado</span>
              },
              {
                label: 'Domínios maliciosos bloqueados',
                value: activeDomains ? <span className="font-mono">{activeDomains}<span className="text-zinc-500"> assinaturas</span></span> : skel('w-20')
              },
              { label: 'Mecanismo de proteção', value: <span className="font-mono text-zinc-300">0.0.0.0 hosts redirection</span> },
            ]} />
          </section>

          <section>
            <SectionHead
              title="Scanner heurístico de links e URLs"
              desc="Cole qualquer link suspeito ou recebido por e-mail/Discord para verificar typosquatting, caracteres homógrafos (Punycode), extensões perigosas e iscas de phishing."
            />
            <form onSubmit={handleScanUrl} className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://steamcommunyty.com/tradeoffer"
                  aria-label="URL para analisar"
                  spellCheck={false}
                  className="dh-input w-full pl-8 font-mono"
                />
              </div>
              <button type="submit" disabled={isScanning || !urlInput.trim()} className="dh-btn dh-btn-primary shrink-0">
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : null}
                Analisar link
              </button>
            </form>

            {urlScanResult && (
              <div className="mt-4 rounded-lg border border-zinc-800/80 animate-in">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 border-b border-zinc-800/80">
                  <span className={`text-[13px] font-semibold ${verdictText(urlScanResult.verdict)}`}>{urlScanResult.verdict}</span>
                  <span className="font-mono text-[12px] text-zinc-400">score <span className="text-zinc-100">{urlScanResult.score}</span><span className="text-zinc-600">/100</span></span>
                  <span className="font-mono text-[12px] text-zinc-300 break-all">{urlScanResult.hostname}</span>
                </div>
                <div className="px-4 py-3 space-y-3">
                  <p className="text-[13px] text-zinc-200">{urlScanResult.recommendation}</p>
                  {urlScanResult.flags && urlScanResult.flags.length > 0 && (
                    <div>
                      <div className="text-[11px] text-zinc-500 mb-1">Indicadores detectados</div>
                      <ul className="space-y-0.5">
                        {urlScanResult.flags.map((f: string, idx: number) => (
                          <li key={idx} className="font-mono text-[12px] text-zinc-300">{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {activeTab === 'network' && (
        <section className="animate-in">
          <SectionHead
            title="Sentinela de portas e conexões ativas"
            desc="Auditoria em tempo real de portas em escuta (Listen) e conexões de saída (Established) com seus processos associados."
            actions={
              <button onClick={handleScanNetworkConnections} disabled={isScanning} className="dh-btn">
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Atualizar
              </button>
            }
          />

          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="relative w-full max-w-sm">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="search"
                value={connectionSearch}
                onChange={(e) => setConnectionSearch(e.target.value)}
                placeholder="Filtrar por processo, IP ou porta..."
                aria-label="Filtrar conexões"
                className="dh-input w-full pl-8 font-mono"
              />
            </div>
            {connections.length > 0 ? (
              <span className="font-mono text-[12px] text-zinc-500 shrink-0">{filteredConnections.length}<span className="text-zinc-600">/{connections.length}</span></span>
            ) : null}
          </div>

          <div className="max-h-[440px] overflow-y-auto custom-scrollbar">
            {isScanning && connections.length === 0 ? tableSkeleton : filteredConnections.length === 0 ? (
              <p className="py-12 border-t border-zinc-800/80 text-[12.5px] text-zinc-500">
                {connections.length === 0 ? 'Nenhuma conexão listada ainda. Use Atualizar para inspecionar.' : 'Nenhuma conexão encontrada com o filtro atual.'}
              </p>
            ) : (
              <table className="w-full text-left text-[12.5px]">
                <thead className="sticky top-0 bg-zinc-950">
                  <tr className="text-[11px] text-zinc-500 border-b border-zinc-800/80">
                    <th className="py-2 pr-4 font-normal">Processo</th>
                    <th className="py-2 pr-4 font-normal text-right w-20">PID</th>
                    <th className="py-2 pr-4 font-normal">Endereço local</th>
                    <th className="py-2 pr-4 font-normal">Endereço remoto</th>
                    <th className="py-2 font-normal w-28">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {filteredConnections.map((c, i) => (
                    <tr key={i} className="hover:bg-zinc-900/40">
                      <td className={`py-2 pr-4 font-sans ${c.IsSuspicious ? 'text-red-400' : 'text-zinc-100'}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {c.IsSuspicious && <AlertTriangle size={14} className="shrink-0" aria-label="Suspeito" />}
                          {c.ProcessName}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-400">{c.Pid}</td>
                      <td className="py-2 pr-4 text-zinc-300">{c.Local}</td>
                      <td className="py-2 pr-4 text-zinc-300">{c.Remote}</td>
                      <td className={`py-2 text-[12px] ${c.State === 'Listen' ? 'text-zinc-400' : 'text-zinc-200'}`}>{c.State}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {activeTab === 'ransomware' && (
        <section className="animate-in">
          <SectionHead
            title="Blindagem anti-ransomware e integridade de arquivos"
            desc="Protege o subsistema de Volume Shadow Copies (VSS) e neutraliza protocolos de rede vulneráveis a exploração remota."
            actions={
              <button onClick={handleEnableRansomwareArmor} disabled={isScanning} className="dh-btn dh-btn-primary">
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />} Ativar blindagem
              </button>
            }
          />

          <ul className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
            <li className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-8 gap-y-1 py-4">
              <div>
                <div className="text-[13px] font-medium text-zinc-100">Serviço Volume Shadow Copy <span className="dh-tag">VSS</span></div>
                <p className="dh-help mt-0.5 max-w-[65ch]">Permite a restauração instantânea de arquivos caso um ransomware tente criptografar seus dados pessoais.</p>
              </div>
              <div className="sm:text-right text-[12.5px]">
                {!ransomwareArmor ? skel('w-24') : ransomwareArmor.vssRunning ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle2 size={14} /> Ativo e automático</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-amber-400"><AlertTriangle size={14} /> Não iniciado</span>
                )}
              </div>
            </li>
            <li className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-x-8 gap-y-1 py-4">
              <div>
                <div className="text-[13px] font-medium text-zinc-100">Bloqueio do protocolo <span className="font-mono">SMBv1</span></div>
                <p className="dh-help mt-0.5 max-w-[65ch]">Neutraliza explorações remotas estilo WannaCry / EternalBlue que se propagam pela rede local através da porta <span className="font-mono">445</span>.</p>
              </div>
              <div className="sm:text-right text-[12.5px]">
                {!ransomwareArmor ? skel('w-24') : ransomwareArmor.smb1Disabled ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-400"><CheckCircle2 size={14} /> Bloqueado</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-red-400"><AlertTriangle size={14} /> Vulnerável</span>
                )}
              </div>
            </li>
          </ul>
        </section>
      )}

      {activeTab === 'tracking' && (
        <div className="space-y-10 animate-in">
          <section>
            <SectionHead
              title={t('security.tracking.title')}
              desc={t('security.tracking.desc')}
              actions={
                <button onClick={handleAuditTracking} disabled={isScanning} className="dh-btn dh-btn-primary">
                  {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  {t('security.tracking.auditButton') || 'Auditar Rastreadores'}
                </button>
              }
            />

            {hasScanned ? (
              <div className="space-y-4">
                {trackingSummary && (
                  <dl className="grid grid-cols-2 max-w-md rounded-lg border border-zinc-800/80 divide-x divide-zinc-800/80">
                    <div className="px-4 py-3">
                      <dt className="text-[11px] text-zinc-500">Rastreadores conhecidos</dt>
                      <dd className="mt-1 font-mono text-[15px] text-zinc-50">{trackingSummary.totalKnown}</dd>
                    </div>
                    <div className="px-4 py-3">
                      <dt className="text-[11px] text-zinc-500">Bloqueados no hosts</dt>
                      <dd className="mt-1 font-mono text-[15px] text-zinc-50">{trackingSummary.present}</dd>
                    </div>
                  </dl>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleBlockTracking} disabled={isScanning} className="dh-btn dh-btn-accent">
                    <ShieldCheck size={14} /> {t('security.tracking.blockButton') || 'Bloquear Todos os Rastreadores'}
                  </button>
                  <button onClick={handleUnblockTracking} disabled={isScanning} className="dh-btn">
                    {t('security.tracking.unblockButton') || 'Restaurar / Desbloquear'}
                  </button>
                </div>
              </div>
            ) : isScanning ? tableSkeleton : (
              <p className="py-8 border-t border-zinc-800/80 text-[12.5px] text-zinc-500">Execute a auditoria para ver quantos rastreadores conhecidos já estão bloqueados.</p>
            )}
          </section>

          <section>
            <div className="flex items-end justify-between gap-3 mb-2">
              <div>
                <label htmlFor="custom-tracking" className="dh-section-title">Domínios personalizados para bloqueio</label>
                <p className="dh-help mt-0.5">Um domínio por linha.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={loadTrackingDomains} className="dh-btn dh-btn-ghost dh-btn-sm">Carregar salvos</button>
                <button onClick={saveTrackingDomains} disabled={isScanning} className="dh-btn dh-btn-sm">
                  Salvar lista
                </button>
              </div>
            </div>
            <textarea
              id="custom-tracking"
              value={customDomains}
              onChange={(e) => setCustomDomains(e.target.value)}
              placeholder="telemetry.sample.com"
              rows={5}
              spellCheck={false}
              className="dh-input w-full h-auto py-2 font-mono leading-relaxed"
            />
          </section>
        </div>
      )}

      {activeTab === 'community' && (
        <div className="space-y-8 animate-in">
          <section>
            <SectionHead
              title="Colaboração open source e regras comunitárias"
              desc="Importe feeds de inteligência de ameaças da comunidade ou colabore adicionando novas regras de phishing, termos de isca e marcas monitoradas."
              actions={
                <>
                  <button onClick={handleDownloadRulesTemplate} className="dh-btn dh-btn-ghost">
                    <Download size={14} /> Baixar modelo <span className="dh-tag">.json</span>
                  </button>
                  <button onClick={handleResetCommunityRules} disabled={isScanning} className="dh-btn dh-btn-danger">
                    <RefreshCw size={14} /> Redefinir regras
                  </button>
                </>
              }
            />
            <StatRow items={[
              { label: 'Regras nativas integradas', value: communityStats ? <span className="font-mono">{communityStats.defaultsCount ?? 0}<span className="text-zinc-500"> domínios</span></span> : skel() },
              { label: 'Importadas da comunidade', value: communityStats ? <span className="font-mono">{communityStats.customPhishingDomains?.length || 0}<span className="text-zinc-500"> domínios</span></span> : skel() },
              { label: 'Total de proteções ativas', value: communityStats ? <span className="font-mono">{communityStats.totalActivePhishingDomains ?? 0}<span className="text-zinc-500"> assinaturas</span></span> : skel() },
            ]} />
          </section>

          <section>
            <label htmlFor="community-json" className="dh-section-title flex items-center gap-2">
              <Code size={16} className="text-zinc-400" />
              Importar regras comunitárias
            </label>
            <p className="dh-help mt-0.5 mb-2">Cole o JSON do feed.</p>
            <textarea
              id="community-json"
              value={communityJsonInput}
              onChange={(e) => setCommunityJsonInput(e.target.value)}
              placeholder={`{
  "phishingDomains": ["novo-golpe-steam.xyz", "falso-discord.nitro"],
  "keywords": ["claim-free-robux", "airdrop-claim"],
  "brands": [
    { "name": "Servico", "target": "servico.com", "typos": ["serivco", "servicco"] }
  ]
}`}
              rows={7}
              spellCheck={false}
              className="dh-input w-full h-auto py-2.5 font-mono text-[12px] leading-relaxed"
            />
            <button
              onClick={handleImportCommunityRules}
              disabled={isScanning || !communityJsonInput.trim()}
              className="dh-btn dh-btn-primary mt-3"
            >
              {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar e ativar no escudo
            </button>
          </section>
        </div>
      )}
    </div>
  );
}

const SectionHead = ({ title, desc, actions }: { title: React.ReactNode; desc?: React.ReactNode; actions?: React.ReactNode }) => (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="dh-section-title">{title}</h2>
        {desc ? <p className="dh-help mt-0.5 max-w-[75ch]">{desc}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );

const StatRow = ({ items }: { items: { label: string; value: React.ReactNode }[] }) => (
    <dl className="grid grid-cols-1 sm:grid-cols-3 rounded-lg border border-zinc-800/80 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800/80">
      {items.map((it) => (
        <div key={it.label} className="px-4 py-3 min-w-0">
          <dt className="text-[11px] text-zinc-500">{it.label}</dt>
          <dd className="mt-1 text-[13px] text-zinc-100">{it.value}</dd>
        </div>
      ))}
    </dl>
  );

