import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, Loader2, Trash2, Eye, Shield, Activity, Zap, Globe, Radio, AlertTriangle, CheckCircle2, RefreshCw,
  Search, Download, Upload, Users, Code, Lock, LayoutGrid
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
import PageHeader from '../components/ui/PageHeader';
import BlocklistsPanel from '../components/security/BlocklistsPanel';
import HardeningPanel from '../components/security/HardeningPanel';
import { SectionHead, StatRow, OnOff, Skel, fmtDate, fmtNum, errorText } from '../components/security/ui';

type SecurityTab = 'overview' | 'blocklists' | 'hardening' | 'malware' | 'phishing' | 'network' | 'tracking' | 'community';

export default function AdvancedSecurity() {
  const { t } = useI18n();
  const sec = window.darkhub?.security;
  const [activeTab, setActiveTab] = useState<SecurityTab>('overview');
  const [isScanning, setIsScanning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [adv, setAdv] = useState<any | null>(null);
  const [threats, setThreats] = useState<any[]>([]);
  const [trackingSummary, setTrackingSummary] = useState<any | null>(null);
  const [customDomains, setCustomDomains] = useState<string>('');
  const [hasScanned, setHasScanned] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const [phishingStatus, setPhishingStatus] = useState<{ active?: boolean } | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [urlScanResult, setUrlScanResult] = useState<any | null>(null);
  const [connections, setConnections] = useState<any[]>([]);
  const [connectionSearch, setConnectionSearch] = useState('');
  const [communityStats, setCommunityStats] = useState<any | null>(null);
  const [communityJsonInput, setCommunityJsonInput] = useState<string>('');

  const loadAdv = useCallback(async () => {
    if (!sec?.advStatus) return;
    try {
      const res = await sec.advStatus();
      if (res?.ok) setAdv(res);
    } catch { /* backend unavailable */ }
  }, [sec]);

  const loadPhishingStatus = async () => {
    try { const res = await sec?.getPhishingShieldStatus?.(); if (res?.ok) setPhishingStatus(res); } catch { /* ignore */ }
  };

  const loadCommunityRulesStats = async () => {
    try { const res = await sec?.getCommunityRules?.(); if (res?.ok) setCommunityStats(res); } catch { /* ignore */ }
  };

  useEffect(() => {
    loadAdv();
    loadPhishingStatus();
    loadCommunityRulesStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Runs one backend action, shows its result and re-reads the live status. */
  const run = async (key: string, fn: () => Promise<any>, okMsg: (res: any) => string) => {
    if (!sec) return;
    setBusy(key);
    setStatusMsg(null);
    try {
      const res = await fn();
      setStatusMsg(res?.ok ? { ok: true, msg: okMsg(res) } : { ok: false, msg: errorText(t, res?.error) + (res?.detail ? ` ${res.detail}` : '') });
    } catch (e: any) {
      setStatusMsg({ ok: false, msg: e?.message ?? String(e) });
    } finally {
      await loadAdv();
      setBusy(null);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setStatusMsg(null);
    try {
      const res = await sec?.scanProcesses();
      setThreats(Array.isArray(res) ? res : []);
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    }
    setIsScanning(false);
    setHasScanned(true);
  };

  const handleKill = async (pid: number, name?: string) => {
    if (!sec) return;
    if (!confirm(t('secx.proc.killConfirm', 'Encerrar o processo {name} (PID {pid})?').replace('{name}', name ?? '').replace('{pid}', String(pid)))) return;
    try {
      const res = await sec.killProcess(pid);
      if (res?.ok) setThreats((prev) => prev.filter((x) => x.pid !== pid));
      else setStatusMsg({ ok: false, msg: res?.error ?? errorText(t) });
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    }
  };

  const handleDisableLegacyShield = async () => {
    setIsScanning(true);
    try {
      const res = await sec.disablePhishingShield();
      setStatusMsg({ ok: res.ok, msg: res.ok ? t('secx.legacy.removed', 'Escudo antigo removido do arquivo hosts.') : errorText(t, res.error) });
      await loadPhishingStatus();
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
      const res = await sec.scanUrl({ url: urlInput.trim() });
      if (res?.ok) setUrlScanResult(res);
      else setStatusMsg({ ok: false, msg: res?.error || errorText(t) });
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
      const res = await sec?.getLiveNetworkConnections();
      if (res?.ok) setConnections(res.connections || []);
      else if (res) setStatusMsg({ ok: false, msg: res?.error || errorText(t) });
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
      const res = await sec.importCommunityRules(parsed);
      if (res?.ok) {
        setStatusMsg({ ok: true, msg: t('secx.community.imported', 'Regras importadas. Domínios personalizados ativos: {n}.').replace('{n}', String(res.total ?? 0)) });
        setCommunityJsonInput('');
        await loadCommunityRulesStats();
      } else {
        setStatusMsg({ ok: false, msg: res?.error || errorText(t) });
      }
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: t('secx.community.badJson', 'JSON inválido: ') + err.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleResetCommunityRules = async () => {
    if (!confirm(t('secx.community.resetConfirm', 'Apagar as regras personalizadas importadas?'))) return;
    setIsScanning(true);
    try {
      const res = await sec.resetCommunityRules();
      setStatusMsg({ ok: res.ok, msg: res.ok ? t('secx.community.resetDone', 'Regras personalizadas apagadas.') : errorText(t, res.error) });
      await loadCommunityRulesStats();
    } catch (e: any) {
      setStatusMsg({ ok: false, msg: e.message });
    } finally {
      setIsScanning(false);
    }
  };

  const handleDownloadRulesTemplate = () => {
    const template = {
      phishingDomains: ['exemplo-golpe-steam.xyz'],
      keywords: ['claim-airdrop-now'],
      brands: [{ name: 'MeuServico', target: 'meuservico.com.br', typos: ['meuservicoo', 'meu-servico'] }],
      fileHashes: [{ sha256: '0'.repeat(64), name: 'exemplo' }]
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
      const res = await sec?.auditTracking();
      if (res?.ok) { setTrackingSummary(res.summary ?? null); setHasScanned(true); }
      else if (res) setStatusMsg({ ok: false, msg: res?.error ?? errorText(t) });
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setIsScanning(false);
    }
  };

  const trackingAction = async (fn: () => Promise<any>) => {
    setIsScanning(true);
    try {
      const res = await fn();
      setStatusMsg({ ok: Boolean(res?.ok), msg: res?.ok ? (res.msg || t('secx.done', 'Concluído.')) : errorText(t, res?.error) });
      await handleAuditTracking();
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setIsScanning(false);
    }
  };

  const loadTrackingDomains = async () => {
    try {
      const res = await sec?.getTrackingDomains?.();
      if (res?.ok) setCustomDomains((Array.isArray(res.custom) ? res.custom : []).join('\n'));
    } catch { /* ignore */ }
  };

  const saveTrackingDomains = async () => {
    const domains = customDomains.split(/\r?\n/g).map((d) => d.trim()).filter(Boolean);
    setIsScanning(true);
    try {
      const res = await sec.setCustomTrackingDomains({ domains });
      setStatusMsg(res?.ok ? { ok: true, msg: t('secx.tracking.saved', 'Lista personalizada salva ({n}).').replace('{n}', String(res.count)) } : { ok: false, msg: res?.error ?? errorText(t) });
    } catch (err: any) {
      setStatusMsg({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setIsScanning(false);
    }
  };

  const q = connectionSearch.toLowerCase();
  const filteredConnections = connections.filter(
    (c) => c.ProcessName?.toLowerCase().includes(q) || c.Local?.includes(connectionSearch) || c.Remote?.includes(connectionSearch) || String(c.Pid).includes(connectionSearch)
  );

  const go = (id: SecurityTab, extra?: () => void) => () => { setActiveTab(id); setStatusMsg(null); setHasScanned(false); extra?.(); };
  const tabs: { id: SecurityTab; icon: React.ComponentType<{ size?: number; className?: string }>; label: string; onSelect: () => void }[] = [
    { id: 'overview', icon: LayoutGrid, label: t('secx.tab.overview', 'Visão geral'), onSelect: go('overview', loadAdv) },
    { id: 'blocklists', icon: Shield, label: t('secx.tab.blocklists', 'Listas da comunidade'), onSelect: go('blocklists', loadAdv) },
    { id: 'hardening', icon: Lock, label: t('secx.tab.hardening', 'Endurecimento'), onSelect: go('hardening', loadAdv) },
    { id: 'malware', icon: Activity, label: t('secx.tab.processes', 'Processos'), onSelect: go('malware') },
    { id: 'phishing', icon: Globe, label: t('secx.tab.phishing', 'Verificar links'), onSelect: go('phishing', loadPhishingStatus) },
    { id: 'network', icon: Radio, label: t('secx.tab.network', 'Conexões'), onSelect: go('network', handleScanNetworkConnections) },
    { id: 'tracking', icon: Eye, label: t('secx.tab.tracking', 'Rastreadores'), onSelect: go('tracking') },
    { id: 'community', icon: Users, label: t('secx.tab.custom', 'Regras próprias'), onSelect: go('community', loadCommunityRulesStats) },
  ];

  const sevText = (risk?: string) => risk === 'CRITICAL' || risk === 'MALICIOUS' ? 'text-red-400' : risk === 'SAFE' || risk === 'CLEAN' ? 'text-emerald-400' : 'text-amber-400';
  const tableSkeleton = (
    <div className="space-y-2" aria-busy="true">
      {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-8 rounded-md bg-zinc-900 animate-pulse" />)}
    </div>
  );

  const hd = adv?.hardening;
  const hdItems: any[] = hd?.items ?? [];
  const protectedCount = [adv?.hosts?.present, (adv?.firewall?.rules ?? 0) > 0, adv?.hashes?.active].filter(Boolean).length;

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            {t('secx.title', 'Central de segurança')}
            <HelpTip
              title={t('secx.help.title', 'Segurança avançada')}
              description={t('secx.help.desc', 'Bloqueios reais com listas mantidas pela comunidade e endurecimento do Windows. Tudo mostra o estado lido do sistema e pode ser restaurado.')}
              sections={[
                { title: t('secx.tab.blocklists', 'Listas da comunidade'), content: t('secx.help.blocklists', 'StevenBlack, HaGeZi, URLhaus, Spamhaus DROP e outras: no arquivo hosts, no Firewall do Windows e na proteção em tempo real.') },
                { title: t('secx.tab.hardening', 'Endurecimento'), content: t('secx.help.hardening', 'Regras ASR do Defender, PUA, acesso controlado a pastas, SmartScreen, SMBv1, LLMNR/NetBIOS, log de PowerShell e RDP.') },
                { title: t('secx.tab.processes', 'Processos'), content: t('secx.help.processes', 'Heurística: assinatura digital, entropia do executável e pastas de execução suspeitas. Não é um antivírus.') }
              ]}
              buttonLabel={t('help.button')}
            />
          </span>
        }
        subtitle={t('secx.subtitle', 'Listas de bloqueio da comunidade, endurecimento do Windows e auditoria de processos e conexões.')}
        actions={adv ? (
          <span className="hidden sm:inline-flex items-center gap-2 text-[12px] text-zinc-400">
            <span className={`h-1.5 w-1.5 rounded-full ${protectedCount > 0 ? 'bg-emerald-400' : 'bg-zinc-600'}`} aria-hidden="true" />
            {t('secx.header.layers', '{n}/3 camadas de bloqueio ativas').replace('{n}', String(protectedCount))}
          </span>
        ) : null}
      >
        <div role="tablist" aria-label={t('secx.title', 'Central de segurança')} className="flex gap-5 -mb-5 overflow-x-auto overflow-y-hidden custom-scrollbar">
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
          <button onClick={() => setStatusMsg(null)} className="shrink-0 text-[12px] text-zinc-500 hover:text-zinc-200">{t('secx.close', 'Fechar')}</button>
        </div>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-10 animate-in">
          <section>
            <SectionHead
              title={t('secx.ov.title', 'Estado da proteção')}
              desc={t('secx.ov.desc', 'Lido agora do sistema: arquivo hosts, regras do Firewall do Windows, regras de hash da proteção em tempo real e configurações do Windows.')}
              actions={
                <button onClick={() => { setBusy('reload'); loadAdv().finally(() => setBusy(null)); }} disabled={busy !== null} className="dh-btn">
                  {busy === 'reload' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {t('secx.refresh', 'Atualizar')}
                </button>
              }
            />
            <StatRow cols={4} items={[
              {
                label: t('secx.ov.hosts', 'Bloqueio DNS (hosts)'),
                value: !adv ? <Skel w="w-24" /> : <OnOff on={Boolean(adv.hosts?.present)} onLabel={`${fmtNum(adv.hosts?.entries)} ${t('secx.bl.domains', 'domínios')}`} offLabel={t('secx.inactive', 'Inativo')} />,
                sub: adv?.hosts?.appliedAt ? `${t('secx.lastApplied', 'Aplicado em')} ${fmtDate(adv.hosts.appliedAt)}` : undefined
              },
              {
                label: t('secx.ov.firewall', 'Firewall (IPs maliciosos)'),
                value: !adv ? <Skel w="w-24" /> : <OnOff on={(adv.firewall?.rules ?? 0) > 0} onLabel={`${fmtNum(adv.firewall?.rules)} ${t('secx.bl.rules', 'regras')} · ${fmtNum(adv.firewall?.addresses)} IPs`} offLabel={t('secx.inactive', 'Inativo')} />,
                sub: adv?.firewall?.appliedAt ? `${t('secx.lastApplied', 'Aplicado em')} ${fmtDate(adv.firewall.appliedAt)}` : undefined
              },
              {
                label: t('secx.ov.hashes', 'Hashes de malware (tempo real)'),
                value: !adv ? <Skel w="w-24" /> : <OnOff on={Boolean(adv.hashes?.active)} onLabel={`${fmtNum(adv.hashes?.count)} ${t('secx.bl.hashes', 'hashes')}`} offLabel={t('secx.inactive', 'Inativo')} />,
                sub: adv?.hashes?.appliedAt ? `${t('secx.lastApplied', 'Aplicado em')} ${fmtDate(adv.hashes.appliedAt)}` : undefined
              },
              {
                label: t('secx.ov.hardening', 'Endurecimento do Windows'),
                value: !adv ? <Skel w="w-24" /> : <span className="font-mono">{hdItems.filter((i) => i.applied).length}<span className="text-zinc-500">/{hdItems.length}</span></span>,
                sub: adv ? (hd?.defenderActive ? t('secx.hd.defenderOn', 'Microsoft Defender ativo') : t('secx.ov.defenderOff', 'Defender inativo')) : undefined
              }
            ]} />
          </section>

          <section>
            <SectionHead title={t('secx.ov.lists', 'Listas baixadas')} />
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-[11px] text-zinc-500 border-b border-zinc-800/80">
                  <th className="py-2 pr-4 font-normal">{t('secx.bl.source', 'Fonte')}</th>
                  <th className="py-2 pr-4 font-normal">{t('secx.ov.use', 'Uso')}</th>
                  <th className="py-2 pr-4 font-normal text-right">{t('secx.bl.entries', 'Entradas')}</th>
                  <th className="py-2 font-normal">{t('secx.bl.lastUpdate', 'Última atualização')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {(adv?.sources ?? []).filter((s: any) => s.enabled).map((s: any) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 text-zinc-100">{s.name}<span className="block text-[11px] text-zinc-500">{s.license}</span></td>
                    <td className="py-2 pr-4 text-zinc-400">{s.kind === 'hosts' ? 'hosts' : s.kind === 'ip' ? 'firewall' : t('secx.ov.realtime', 'tempo real')}</td>
                    <td className="py-2 pr-4 text-right font-mono text-zinc-300">{s.updatedAt ? fmtNum(s.count) : '-'}</td>
                    <td className="py-2 text-zinc-400">{s.updatedAt ? fmtDate(s.updatedAt) : <span className="text-zinc-600">{t('secx.bl.never', 'nunca baixada')}</span>}{s.error ? <span className="block text-[11px] text-red-400">{s.error}</span> : null}</td>
                  </tr>
                ))}
                {!adv ? <tr><td colSpan={4} className="py-3">{tableSkeleton}</td></tr> : null}
              </tbody>
            </table>
            <button onClick={() => setActiveTab('blocklists')} className="dh-btn dh-btn-ghost mt-3"><Shield size={14} /> {t('secx.ov.manage', 'Gerenciar listas')}</button>
          </section>

          {phishingStatus?.active ? (
            <section>
              <SectionHead
                title={t('secx.legacy.title', 'Escudo anti-phishing antigo')}
                desc={t('secx.legacy.desc', 'A versão anterior bloqueava ~40 domínios de exemplo escritos à mão. Foi substituída pelas listas da comunidade (phishing-filter, URLhaus). Você pode removê-lo do hosts.')}
                actions={<button onClick={handleDisableLegacyShield} disabled={isScanning} className="dh-btn">{t('secx.legacy.remove', 'Remover escudo antigo')}</button>}
              />
            </section>
          ) : null}
        </div>
      )}

      {activeTab === 'blocklists' && <BlocklistsPanel status={adv} busy={busy} run={run} reload={loadAdv} />}

      {activeTab === 'hardening' && <HardeningPanel hardening={hd ?? null} busy={busy} run={run} reload={loadAdv} />}

      {activeTab === 'malware' && (
        <section className="animate-in">
          <SectionHead
            title={t('secx.proc.title', 'Varredura heurística de processos')}
            desc={t('secx.proc.desc', 'Analisa os processos em execução: assinatura Authenticode, entropia do executável e pastas de execução suspeitas. É uma triagem, não substitui o antivírus.')}
            actions={
              <button onClick={handleScan} disabled={isScanning} className="dh-btn dh-btn-primary">
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                {isScanning ? t('secx.proc.scanning', 'Analisando...') : t('secx.proc.scan', 'Iniciar varredura')}
              </button>
            }
          />
          {isScanning ? tableSkeleton : !hasScanned ? (
            <p className="py-12 border-t border-zinc-800/80 text-[12.5px] text-zinc-500">{t('secx.proc.empty', 'Nenhuma varredura nesta sessão.')}</p>
          ) : threats.length === 0 ? (
            <div className="py-10 border-t border-zinc-800/80 flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 text-emerald-400 shrink-0" size={16} />
              <div>
                <h3 className="text-[13px] font-medium text-zinc-100">{t('secx.proc.clean', 'Nenhum processo com indicadores de atenção')}</h3>
                <p className="dh-help mt-0.5">{t('secx.proc.cleanDesc', 'Todos os executáveis em execução são assinados e têm entropia normal.')}</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="text-[11px] text-zinc-500 border-b border-zinc-800/80">
                  <th className="py-2 pr-4 font-normal w-28">{t('secx.proc.risk', 'Risco')}</th>
                  <th className="py-2 pr-4 font-normal">{t('secx.proc.process', 'Processo')}</th>
                  <th className="py-2 pr-4 font-normal w-20 text-right">PID</th>
                  <th className="py-2 pr-4 font-normal w-24 text-right">{t('secx.proc.memory', 'Memória')}</th>
                  <th className="py-2 font-normal w-32"><span className="sr-only">{t('secx.actions', 'Ações')}</span></th>
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
                      {threat.flags?.length ? (
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                          {threat.flags.map((f: string, fi: number) => <span key={fi} className="dh-tag text-zinc-400">{f}</span>)}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-zinc-300">{threat.pid}</td>
                    <td className="py-2.5 pr-4 text-right font-mono text-zinc-300">{threat.MemoryMb ? <>{threat.MemoryMb}<span className="text-zinc-500"> MB</span></> : null}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => handleKill(threat.pid, threat.Name)} className="dh-btn dh-btn-danger dh-btn-sm"><Trash2 size={14} /> {t('secx.proc.kill', 'Finalizar')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {activeTab === 'phishing' && (
        <div className="space-y-10 animate-in">
          <section>
            <SectionHead
              title={t('secx.url.title', 'Verificador de links')}
              desc={t('secx.url.desc', 'Cole um link recebido por e-mail ou chat. Ele é comparado às listas da comunidade baixadas (phishing, malware) e passa por heurísticas: typosquatting, Punycode, TLDs de risco, iscas e HTTP sem criptografia.')}
            />
            <form onSubmit={handleScanUrl} className="flex gap-2">
              <div className="relative flex-1 min-w-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://steamcommunyty.com/tradeoffer" aria-label={t('secx.url.input', 'Link para analisar')} spellCheck={false} className="dh-input w-full pl-8 font-mono" />
              </div>
              <button type="submit" disabled={isScanning || !urlInput.trim()} className="dh-btn dh-btn-primary shrink-0">
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : null} {t('secx.url.scan', 'Analisar link')}
              </button>
            </form>
            {urlScanResult && (
              <div className="mt-4 rounded-lg border border-zinc-800/80 animate-in">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3 border-b border-zinc-800/80">
                  <span className={`text-[13px] font-semibold ${sevText(urlScanResult.verdict)}`}>{t(`secx.url.verdict.${urlScanResult.verdict}`, urlScanResult.verdict)}</span>
                  <span className="font-mono text-[12px] text-zinc-400">score <span className="text-zinc-100">{urlScanResult.score}</span><span className="text-zinc-600">/100</span></span>
                  <span className="font-mono text-[12px] text-zinc-300 break-all">{urlScanResult.hostname}</span>
                </div>
                {urlScanResult.flags?.length ? (
                  <ul className="px-4 py-3 space-y-0.5">
                    {urlScanResult.flags.map((f: string, idx: number) => <li key={idx} className="font-mono text-[12px] text-zinc-300">{f}</li>)}
                  </ul>
                ) : <p className="px-4 py-3 text-[12.5px] text-zinc-400">{t('secx.url.noFlags', 'Nenhum indicador encontrado.')}</p>}
              </div>
            )}
          </section>
          {phishingStatus?.active ? (
            <section>
              <SectionHead
                title={t('secx.legacy.title', 'Escudo anti-phishing antigo')}
                desc={t('secx.legacy.desc', 'A versão anterior bloqueava ~40 domínios de exemplo escritos à mão. Foi substituída pelas listas da comunidade (phishing-filter, URLhaus). Você pode removê-lo do hosts.')}
                actions={<button onClick={handleDisableLegacyShield} disabled={isScanning} className="dh-btn">{t('secx.legacy.remove', 'Remover escudo antigo')}</button>}
              />
            </section>
          ) : null}
        </div>
      )}

      {activeTab === 'network' && (
        <section className="animate-in">
          <SectionHead
            title={t('secx.net.title', 'Conexões ativas')}
            desc={t('secx.net.desc', 'Portas em escuta e conexões estabelecidas com o processo dono. IPs remotos presentes nas listas de IP baixadas (Spamhaus DROP, Feodo, IPsum) são destacados.')}
            actions={
              <button onClick={handleScanNetworkConnections} disabled={isScanning} className="dh-btn">
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {t('secx.refresh', 'Atualizar')}
              </button>
            }
          />
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="relative w-full max-w-sm">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input type="search" value={connectionSearch} onChange={(e) => setConnectionSearch(e.target.value)} placeholder={t('secx.net.filter', 'Filtrar por processo, IP ou porta...')} aria-label={t('secx.net.filter', 'Filtrar por processo, IP ou porta...')} className="dh-input w-full pl-8 font-mono" />
            </div>
            {connections.length > 0 ? <span className="font-mono text-[12px] text-zinc-500 shrink-0">{filteredConnections.length}<span className="text-zinc-600">/{connections.length}</span></span> : null}
          </div>
          <div className="max-h-[440px] overflow-y-auto custom-scrollbar">
            {isScanning && connections.length === 0 ? tableSkeleton : filteredConnections.length === 0 ? (
              <p className="py-12 border-t border-zinc-800/80 text-[12.5px] text-zinc-500">{connections.length === 0 ? t('secx.net.empty', 'Nenhuma conexão listada ainda.') : t('secx.net.noMatch', 'Nenhuma conexão com o filtro atual.')}</p>
            ) : (
              <table className="w-full text-left text-[12.5px]">
                <thead className="sticky top-0 bg-zinc-950">
                  <tr className="text-[11px] text-zinc-500 border-b border-zinc-800/80">
                    <th className="py-2 pr-4 font-normal">{t('secx.proc.process', 'Processo')}</th>
                    <th className="py-2 pr-4 font-normal text-right w-20">PID</th>
                    <th className="py-2 pr-4 font-normal">{t('secx.net.local', 'Endereço local')}</th>
                    <th className="py-2 pr-4 font-normal">{t('secx.net.remote', 'Endereço remoto')}</th>
                    <th className="py-2 font-normal w-28">{t('secx.net.state', 'Estado')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 font-mono">
                  {filteredConnections.map((c, i) => (
                    <tr key={i} className="hover:bg-zinc-900/40">
                      <td className={`py-2 pr-4 font-sans ${c.IsSuspicious ? 'text-red-400' : 'text-zinc-100'}`}>
                        <span className="inline-flex items-center gap-1.5">{c.IsSuspicious && <AlertTriangle size={14} className="shrink-0" />}{c.ProcessName}</span>
                      </td>
                      <td className="py-2 pr-4 text-right text-zinc-400">{c.Pid}</td>
                      <td className="py-2 pr-4 text-zinc-300">{c.Local}</td>
                      <td className="py-2 pr-4 text-zinc-300">{c.Remote}{c.Blocklisted ? <span className="block font-sans text-[11px] text-red-400">{t('secx.net.listed', 'na lista')}: {String(c.Blocklisted)}</span> : null}</td>
                      <td className="py-2 text-[12px] text-zinc-400">{c.State}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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
                  {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} {t('security.tracking.auditButton', 'Auditar rastreadores')}
                </button>
              }
            />
            {hasScanned ? (
              <div className="space-y-4">
                {trackingSummary && (
                  <StatRow cols={2} items={[
                    { label: t('secx.tracking.known', 'Rastreadores conhecidos'), value: <span className="font-mono">{trackingSummary.totalKnown}</span> },
                    { label: t('secx.tracking.blocked', 'Bloqueados no hosts'), value: <span className="font-mono">{trackingSummary.present}</span> }
                  ]} />
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => trackingAction(() => sec.blockTracking())} disabled={isScanning} className="dh-btn dh-btn-accent"><ShieldCheck size={14} /> {t('security.tracking.blockButton', 'Bloquear rastreadores')}</button>
                  <button onClick={() => trackingAction(() => sec.unblockTracking())} disabled={isScanning} className="dh-btn">{t('security.tracking.unblockButton', 'Restaurar')}</button>
                </div>
              </div>
            ) : isScanning ? tableSkeleton : (
              <p className="py-8 border-t border-zinc-800/80 text-[12.5px] text-zinc-500">{t('secx.tracking.hint', 'Execute a auditoria para ver quantos rastreadores conhecidos já estão bloqueados. Para bloqueio amplo, use as listas da comunidade.')}</p>
            )}
          </section>
          <section>
            <div className="flex items-end justify-between gap-3 mb-2">
              <div>
                <label htmlFor="custom-tracking" className="dh-section-title">{t('secx.tracking.custom', 'Domínios personalizados para bloqueio')}</label>
                <p className="dh-help mt-0.5">{t('secx.tracking.onePerLine', 'Um domínio por linha.')}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={loadTrackingDomains} className="dh-btn dh-btn-ghost dh-btn-sm">{t('secx.tracking.load', 'Carregar salvos')}</button>
                <button onClick={saveTrackingDomains} disabled={isScanning} className="dh-btn dh-btn-sm">{t('secx.tracking.save', 'Salvar lista')}</button>
              </div>
            </div>
            <textarea id="custom-tracking" value={customDomains} onChange={(e) => setCustomDomains(e.target.value)} placeholder="telemetry.sample.com" rows={5} spellCheck={false} className="dh-input w-full h-auto py-2 font-mono leading-relaxed" />
          </section>
        </div>
      )}

      {activeTab === 'community' && (
        <div className="space-y-8 animate-in">
          <section>
            <SectionHead
              title={t('secx.community.title', 'Regras próprias (JSON)')}
              desc={t('secx.community.desc', 'Domínios, termos de isca, marcas monitoradas e hashes SHA-256 seus. Domínios e marcas reforçam o verificador de links; hashes entram na proteção em tempo real.')}
              actions={
                <>
                  <button onClick={handleDownloadRulesTemplate} className="dh-btn dh-btn-ghost"><Download size={14} /> {t('secx.community.template', 'Baixar modelo')} <span className="dh-tag">.json</span></button>
                  <button onClick={handleResetCommunityRules} disabled={isScanning} className="dh-btn dh-btn-danger"><RefreshCw size={14} /> {t('secx.community.reset', 'Apagar regras')}</button>
                </>
              }
            />
            <StatRow items={[
              { label: t('secx.community.domains', 'Domínios importados'), value: communityStats ? <span className="font-mono">{communityStats.customPhishingDomains?.length || 0}</span> : <Skel /> },
              { label: t('secx.community.brands', 'Marcas monitoradas'), value: communityStats ? <span className="font-mono">{communityStats.customBrands?.length || 0}</span> : <Skel /> },
              { label: t('secx.community.hashes', 'Hashes próprios'), value: communityStats ? <span className="font-mono">{communityStats.customFileHashes ?? 0}</span> : <Skel /> },
            ]} />
          </section>
          <section>
            <label htmlFor="community-json" className="dh-section-title flex items-center gap-2"><Code size={16} className="text-zinc-400" /> {t('secx.community.import', 'Importar regras')}</label>
            <p className="dh-help mt-0.5 mb-2">{t('secx.community.paste', 'Cole o JSON no formato do modelo.')}</p>
            <textarea
              id="community-json"
              value={communityJsonInput}
              onChange={(e) => setCommunityJsonInput(e.target.value)}
              placeholder={'{\n  "phishingDomains": ["novo-golpe-steam.xyz"],\n  "keywords": ["claim-free-robux"],\n  "brands": [{ "name": "Servico", "target": "servico.com", "typos": ["serivco"] }],\n  "fileHashes": [{ "sha256": "...", "name": "amostra" }]\n}'}
              rows={7}
              spellCheck={false}
              className="dh-input w-full h-auto py-2.5 font-mono text-[12px] leading-relaxed"
            />
            <button onClick={handleImportCommunityRules} disabled={isScanning || !communityJsonInput.trim()} className="dh-btn dh-btn-primary mt-3">
              {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} {t('secx.community.importBtn', 'Importar')}
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
