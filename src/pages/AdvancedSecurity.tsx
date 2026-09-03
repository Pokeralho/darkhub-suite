import React, { useState, useEffect } from 'react';
import {
  ShieldAlert, ShieldCheck, Loader2, Trash2, Eye, Shield, Activity, Zap,
  Globe, Radio, Lock, AlertTriangle, CheckCircle2, RefreshCw, Terminal, ExternalLink,
  Search, Laptop, Server, KeyRound, Wifi, Flame, Sparkles, Code, Download, Upload, Users
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';

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
        if (res) {
          setThreats(res);
        }
      } catch (err) {
        console.error(err);
      }
    }
    setIsScanning(false);
    setHasScanned(true);
  };

  const handleKill = async (pid: number) => {
    if (window.darkhub) {
      const res = await window.darkhub.security.killProcess(pid);
      if (res.ok) {
        setThreats(threats.filter((t) => t.pid !== pid));
      }
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
    URL.revokeObjectURL(url);
  };

  const handleAuditTracking = async () => {
    setIsScanning(true);
    setStatusMsg(null);
    if (window.darkhub) {
      const res = await window.darkhub.security.auditTracking();
      if (res.ok) {
        setTrackers(res.trackers);
        setTrackingSummary(res.summary ?? null);
        setHasScanned(true);
      } else {
        setStatusMsg({ ok: false, msg: res.error });
      }
    }
    setIsScanning(false);
  };

  const handleBlockTracking = async () => {
    setIsScanning(true);
    if (window.darkhub) {
      const res = await window.darkhub.security.blockTracking();
      setStatusMsg({ ok: res.ok, msg: res.ok ? res.msg : res.error });
    }
    setIsScanning(false);
  };

  const handleUnblockTracking = async () => {
    setIsScanning(true);
    if (window.darkhub?.security?.unblockTracking) {
      const res = await window.darkhub.security.unblockTracking();
      setStatusMsg({ ok: res.ok, msg: res.ok ? res.msg : res.error });
    }
    setIsScanning(false);
  };

  const loadTrackingDomains = async () => {
    if (!window.darkhub?.security?.getTrackingDomains) return;
    const res = await window.darkhub.security.getTrackingDomains();
    if (res?.ok) {
      const list = Array.isArray(res.custom) ? res.custom : [];
      setCustomDomains(list.join('\n'));
    }
  };

  const saveTrackingDomains = async () => {
    if (!window.darkhub?.security?.setCustomTrackingDomains) return;
    const domains = customDomains
      .split(/\r?\n/g)
      .map((d) => d.trim())
      .filter(Boolean);
    setIsScanning(true);
    const res = await window.darkhub.security.setCustomTrackingDomains({ domains });
    if (res?.ok) setStatusMsg({ ok: true, msg: `Lista personalizada salva (${res.count}).` });
    else setStatusMsg({ ok: false, msg: res?.error ?? 'Falha ao salvar.' });
    setIsScanning(false);
  };

  const filteredConnections = connections.filter(
    (c) =>
      c.ProcessName?.toLowerCase().includes(connectionSearch.toLowerCase()) ||
      c.Local?.includes(connectionSearch) ||
      c.Remote?.includes(connectionSearch) ||
      String(c.Pid).includes(connectionSearch)
  );

  return (
    <div className="space-y-6 w-full max-w-6xl mx-auto p-1 md:p-2 animate-fadeIn">
      {}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="text-blue-500" size={22} />
              Central de Segurança Avançada & Proteção em Tempo Real
            </h1>
            <HelpTip
              title="Segurança e Proteção em Tempo Real"
              description="Monitore a integridade do sistema, bloqueie golpes de phishing, audite processos voláteis e proteja contra ransomware."
              sections={[
                { title: 'Anti-Phishing', content: 'Bloqueio de domínios maliciosos no DNS e scanner heurístico de URLs.' },
                { title: 'Heurística de Processos', content: 'Detecção de aleatoriedade de entropia binária e ausência de assinaturas digitais.' },
                { title: 'Regras Comunitárias', content: 'Importe feeds de inteligência contra ameaças e colabore com novas regras.' }
              ]}
              buttonLabel={t('help.button')}
            />
          </div>
          <p className="text-xs text-zinc-400">Proteção endpoint avançada, anti-phishing proativo e auditoria de tráfego de rede.</p>
        </div>

        {phishingStatus?.active && (
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-xs font-semibold">
            <ShieldCheck size={14} /> Escudo de Rede Ativo
          </div>
        )}
      </div>

      {}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar p-1.5 bg-zinc-900 border border-zinc-800 rounded-xl">
        <button
          onClick={() => { setActiveTab('malware'); setHasScanned(false); setStatusMsg(null); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'malware' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Activity size={15} /> Varredura de Processos
        </button>

        <button
          onClick={() => { setActiveTab('phishing'); setStatusMsg(null); loadPhishingStatus(); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'phishing' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Globe size={15} /> Anti-Phishing & Scanner
        </button>

        <button
          onClick={() => { setActiveTab('network'); setStatusMsg(null); handleScanNetworkConnections(); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'network' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Radio size={15} /> Sentinela de Rede
        </button>

        <button
          onClick={() => { setActiveTab('ransomware'); setStatusMsg(null); loadRansomwareStatus(); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'ransomware' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Lock size={15} /> Blindagem Anti-Ransomware
        </button>

        <button
          onClick={() => { setActiveTab('tracking'); setHasScanned(false); setStatusMsg(null); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'tracking' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Eye size={15} /> Bloqueador de Tracking
        </button>

        <button
          onClick={() => { setActiveTab('community'); setStatusMsg(null); loadCommunityRulesStats(); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeTab === 'community' ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
          }`}
        >
          <Users size={15} /> Regras da Comunidade
        </button>
      </div>

      {}
      {statusMsg && (
        <div className={`p-3.5 rounded-lg flex items-center justify-between text-xs font-medium border ${
          statusMsg.ok ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
        }`}>
          <div className="flex items-center gap-2">
            {statusMsg.ok ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
            <span>{statusMsg.msg}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="text-zinc-400 hover:text-zinc-200 text-xs underline">
            Fechar
          </button>
        </div>
      )}

      {}
      {activeTab === 'malware' && (
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Varredura Heurística de Memória</h2>
              <p className="text-xs text-zinc-400">Analisa processos ativos via Entropia de Shannon, assinaturas Authenticode e caminhos de execução suspeitos.</p>
            </div>

            <button
              onClick={handleScan}
              disabled={isScanning}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
            >
              {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {isScanning ? 'Escaneando...' : 'Iniciar Varredura Heurística'}
            </button>
          </div>

          {hasScanned && (
            <div className="space-y-3">
              {threats.length === 0 ? (
                <div className="p-8 text-center bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-2">
                  <CheckCircle2 className="mx-auto text-emerald-400" size={32} />
                  <h3 className="text-sm font-bold text-white">Nenhum processo com anomalia detectado</h3>
                  <p className="text-xs text-zinc-400">Todos os binários em execução possuem assinaturas válidas e níveis normais de entropia.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-zinc-400">Processos com Indicadores de Atenção ({threats.length}):</div>
                  {threats.map((threat, index) => {
                    const isCritical = threat.risk === 'CRITICAL';
                    return (
                      <div
                        key={index}
                        className={`p-3.5 rounded-lg border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          isCritical ? 'bg-rose-950/20 border-rose-500/30' : 'bg-amber-950/20 border-amber-500/30'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              isCritical ? 'bg-rose-500/20 text-rose-300' : 'bg-amber-500/20 text-amber-300'
                            }`}>
                              {threat.risk} (Score {threat.score}/100)
                            </span>
                            <span className="text-xs font-bold text-white font-mono">{threat.Name}</span>
                            <span className="text-[11px] text-zinc-400 font-mono">PID: {threat.pid}</span>
                            {threat.MemoryMb && <span className="text-[11px] text-zinc-500 font-mono">{threat.MemoryMb} MB</span>}
                          </div>
                          <div className="text-[11px] text-zinc-400 font-mono break-all">{threat.Path}</div>
                          {threat.flags && threat.flags.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {threat.flags.map((f: string, fi: number) => (
                                <span key={fi} className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] rounded">
                                  {f}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleKill(threat.pid)}
                          className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors self-start md:self-auto"
                        >
                          <Trash2 size={13} /> Finalizar Processo
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {}
      {activeTab === 'phishing' && (
        <div className="space-y-6">
          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Globe className="text-emerald-400" size={18} />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">Escudo de Rede Anti-Phishing (DNS Sinkhole)</h2>
                </div>
                <p className="text-xs text-zinc-400">
                  Bloqueia automaticamente domínios conhecidos de golpes, clones da Steam/Discord, falsos portais de autenticação Microsoft/Google e crypto drainers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {phishingStatus?.active ? (
                  <button
                    onClick={() => handleTogglePhishingShield(false)}
                    disabled={isScanning}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                  >
                    Desativar Escudo
                  </button>
                ) : (
                  <button
                    onClick={() => handleTogglePhishingShield(true)}
                    disabled={isScanning}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
                  >
                    <ShieldCheck size={14} /> Ativar Escudo Anti-Phishing
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase font-mono">Status do Escudo</div>
                <div className="text-xs font-bold">
                  {phishingStatus?.active ? (
                    <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={13} /> Protegido Ativamente</span>
                  ) : (
                    <span className="text-amber-400 flex items-center gap-1"><AlertTriangle size={13} /> Desativado</span>
                  )}
                </div>
              </div>

              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase font-mono">Domínios Maliciosos Bloqueados</div>
                <div className="text-xs font-bold text-white font-mono">{communityStats?.totalActivePhishingDomains || phishingStatus?.totalDomains || 30}+ assinaturas</div>
              </div>

              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase font-mono">Mecanismo de Proteção</div>
                <div className="text-xs font-bold text-zinc-300 font-mono">0.0.0.0 Hosts Redirection</div>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
            <div className="space-y-1 border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Search className="text-blue-400" size={18} />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Scanner Heurístico de Links & URLs</h2>
              </div>
              <p className="text-xs text-zinc-400">
                Cole qualquer link suspeito ou recebido por e-mail/Discord para verificar typosquatting, caracteres homógrafos (Punycode), extensões perigosas e iscas de phishing.
              </p>
            </div>

            <form onSubmit={handleScanUrl} className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Exemplo: https://steamcommunyty.com/tradeoffer ou discrod-nitro.gift"
                className="flex-1 px-3.5 py-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-mono"
              />
              <button
                type="submit"
                disabled={isScanning || !urlInput.trim()}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50 shrink-0"
              >
                {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Analisar Link
              </button>
            </form>

            {urlScanResult && (
              <div className={`p-4 rounded-xl border space-y-3 ${
                urlScanResult.verdict === 'MALICIOUS'
                  ? 'bg-rose-950/30 border-rose-500/40'
                  : urlScanResult.verdict === 'SUSPICIOUS'
                  ? 'bg-amber-950/30 border-amber-500/40'
                  : 'bg-emerald-950/30 border-emerald-500/40'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded ${
                      urlScanResult.verdict === 'MALICIOUS'
                        ? 'bg-rose-500 text-white'
                        : urlScanResult.verdict === 'SUSPICIOUS'
                        ? 'bg-amber-500 text-zinc-950'
                        : 'bg-emerald-500 text-white'
                    }`}>
                      {urlScanResult.verdict} (Score {urlScanResult.score}/100)
                    </span>
                    <span className="text-xs font-mono text-zinc-300">{urlScanResult.hostname}</span>
                  </div>
                </div>

                <p className="text-xs font-medium text-white">{urlScanResult.recommendation}</p>

                {urlScanResult.flags && urlScanResult.flags.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[11px] text-zinc-400 font-semibold">Indicadores Detectados:</div>
                    <div className="space-y-1">
                      {urlScanResult.flags.map((f: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {}
      {activeTab === 'network' && (
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Sentinela de Portas & Conexões Ativas</h2>
              <p className="text-xs text-zinc-400">Auditoria em tempo real de portas em escuta (Listen) e conexões de saída (Established) com seus processos associados.</p>
            </div>

            <button
              onClick={handleScanNetworkConnections}
              disabled={isScanning}
              className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isScanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Atualizar Conexões
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={connectionSearch}
              onChange={(e) => setConnectionSearch(e.target.value)}
              placeholder="Filtrar por processo, IP ou porta..."
              className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-mono"
            />
          </div>

          <div className="max-h-96 overflow-y-auto custom-scrollbar rounded-lg border border-zinc-800 bg-zinc-950">
            {filteredConnections.length === 0 ? (
              <div className="p-8 text-center text-xs text-zinc-500">
                {isScanning ? 'Inspecionando conexões de rede...' : 'Nenhuma conexão encontrada com o filtro atual.'}
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-zinc-900 text-zinc-400 border-b border-zinc-800 sticky top-0">
                  <tr>
                    <th className="p-2.5">Processo</th>
                    <th className="p-2.5">PID</th>
                    <th className="p-2.5">Endereço Local</th>
                    <th className="p-2.5">Endereço Remoto</th>
                    <th className="p-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-850">
                  {filteredConnections.map((c, i) => (
                    <tr key={i} className={`hover:bg-zinc-900/50 ${c.IsSuspicious ? 'bg-rose-950/20 text-rose-300' : 'text-zinc-300'}`}>
                      <td className="p-2.5 font-bold text-white flex items-center gap-1.5">
                        {c.IsSuspicious && <AlertTriangle size={13} className="text-rose-400" />}
                        {c.ProcessName}
                      </td>
                      <td className="p-2.5 text-zinc-400">{c.Pid}</td>
                      <td className="p-2.5">{c.Local}</td>
                      <td className="p-2.5">{c.Remote}</td>
                      <td className="p-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          c.State === 'Listen' ? 'bg-sky-500/10 text-sky-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                          {c.State}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {}
      {activeTab === 'ransomware' && (
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Blindagem Anti-Ransomware & Integridade de Arquivos</h2>
              <p className="text-xs text-zinc-400">Protege o subsistema de Volume Shadow Copies (VSS) e neutraliza protocolos de rede vulneráveis a exploração remota.</p>
            </div>

            <button
              onClick={handleEnableRansomwareArmor}
              disabled={isScanning}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-rose-600/20 disabled:opacity-50"
            >
              <Lock size={14} /> Ativar Blindagem Completa
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Serviço Volume Shadow Copy (VSS)</span>
                {ransomwareArmor?.vssRunning ? (
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Ativo & Automático</span>
                ) : (
                  <span className="text-amber-400 text-xs font-bold flex items-center gap-1"><AlertTriangle size={13} /> Não iniciado</span>
                )}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Permite a restauração instantânea de arquivos caso um ransomware tente criptografar seus dados pessoais.
              </p>
            </div>

            <div className="p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Bloqueio do Protocolo SMBv1</span>
                {ransomwareArmor?.smb1Disabled ? (
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Bloqueado com Segurança</span>
                ) : (
                  <span className="text-rose-400 text-xs font-bold flex items-center gap-1"><AlertTriangle size={13} /> Vulnerável</span>
                )}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Neutraliza explorações remotas estilo WannaCry / EternalBlue que se propagam pela rede local através da porta 445.
              </p>
            </div>
          </div>
        </div>
      )}

      {}
      {activeTab === 'tracking' && (
        <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
          <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">{t('security.tracking.title')}</h2>
              <p className="text-xs text-zinc-400">{t('security.tracking.desc')}</p>
            </div>
            <button
              onClick={handleAuditTracking}
              disabled={isScanning}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
            >
              {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {t('security.tracking.auditButton') || 'Auditar Rastreadores'}
            </button>
          </div>

          {hasScanned && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={handleBlockTracking}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all"
                >
                  <ShieldCheck size={14} /> {t('security.tracking.blockButton') || 'Bloquear Todos os Rastreadores'}
                </button>
                <button
                  onClick={handleUnblockTracking}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold transition-colors"
                >
                  {t('security.tracking.unblockButton') || 'Restaurar / Desbloquear'}
                </button>
              </div>

              {trackingSummary && (
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-400 space-y-1">
                  <div>Rastreadores Conhecidos: <span className="text-white font-bold">{trackingSummary.totalKnown}</span></div>
                  <div>Rastreadores Bloqueados no Hosts: <span className="text-emerald-400 font-bold">{trackingSummary.present}</span></div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-zinc-800">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-zinc-300">Domínios Personalizados para Bloqueio:</span>
              <div className="flex gap-2">
                <button
                  onClick={loadTrackingDomains}
                  className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                >
                  Carregar Salvos
                </button>
                <button
                  onClick={saveTrackingDomains}
                  className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs rounded font-medium"
                >
                  Salvar Lista
                </button>
              </div>
            </div>
            <textarea
              value={customDomains}
              onChange={(e) => setCustomDomains(e.target.value)}
              placeholder="Digite um domínio por linha (ex: telemetry.sample.com)"
              rows={4}
              className="w-full p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-zinc-700"
            />
          </div>
        </div>
      )}

      {}
      {activeTab === 'community' && (
        <div className="space-y-5">
          <div className="p-5 rounded-xl border border-zinc-800 bg-zinc-900 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="text-blue-400" size={18} />
                  <h2 className="text-sm font-bold text-white uppercase tracking-wider">Colaboração Open Source & Regras Comunitárias</h2>
                </div>
                <p className="text-xs text-zinc-400">
                  Importe feeds de inteligência de ameaças da comunidade ou colabore adicionando novas regras de phishing, termos de isca e marcas monitoradas.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleDownloadRulesTemplate}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <Download size={13} /> Baixar Modelo (.json)
                </button>
                <button
                  onClick={handleResetCommunityRules}
                  className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-950/60 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw size={13} /> Redefinir Regras
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase font-mono">Regras Nativas Integradas</div>
                <div className="text-xs font-bold text-white font-mono">{communityStats?.defaultsCount || 30} domínios</div>
              </div>
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase font-mono">Regras Importadas da Comunidade</div>
                <div className="text-xs font-bold text-blue-400 font-mono">{communityStats?.customPhishingDomains?.length || 0} domínios</div>
              </div>
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 rounded-lg space-y-1">
                <div className="text-[10px] text-zinc-500 uppercase font-mono">Total de Proteções Ativas</div>
                <div className="text-xs font-bold text-emerald-400 font-mono">{communityStats?.totalActivePhishingDomains || 30} assinaturas</div>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <label className="text-xs font-semibold text-zinc-300 flex items-center gap-2">
                <Code size={14} className="text-blue-400" />
                Importar Regras Comunitárias (Cole o JSON do Feed):
              </label>
              <textarea
                value={communityJsonInput}
                onChange={(e) => setCommunityJsonInput(e.target.value)}
                placeholder={`{
  "phishingDomains": ["novo-golpe-steam.xyz", "falso-discord.nitro"],
  "keywords": ["claim-free-robux", "airdrop-claim"],
  "brands": [
    { "name": "Servico", "target": "servico.com", "typos": ["serivco", "servicco"] }
  ]
}`}
                rows={6}
                className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleImportCommunityRules}
                disabled={isScanning || !communityJsonInput.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-blue-600/20 disabled:opacity-50"
              >
                <Upload size={14} /> Importar & Ativar no Escudo de Segurança
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
