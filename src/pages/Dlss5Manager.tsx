import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ExternalLink, FolderOpen, Loader2, Play, RefreshCw, RotateCcw, Sparkles } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import type { DlssFile } from '../global';

const up = () => window.darkhub?.upscale;
const legacy = () => window.darkhub?.dlss5;

type GameRow = { name: string; dir: string; anticheat?: string | null; files: DlssFile[] };
type Tier = 'full' | 'moderate' | 'heavy' | 'none';

/** What DLSS 5 neural rendering costs on this card (community builds: RTX 50 native, 40 sm_89, 20/30 FP16). Pure. */
export function dlss5Tier(model: string, isNvidia: boolean): Tier {
  if (!isNvidia) return 'none';
  const m = /RTX\s*(?:PRO\s*)?(\d)(\d)\d{2}/i.exec(model);
  if (!m) return 'none';
  const gen = Number(m[1]);
  if (gen >= 5) return 'full';
  if (gen === 4) return 'moderate';
  if (gen === 2 || gen === 3) return 'heavy';
  return 'none';
}

const KIND_LABEL: Record<DlssFile['kind'], string> = { sr: 'DLSS', rr: 'Ray Reconstruction', fg: 'Frame Generation' };

export default function Dlss5Manager() {
  const { t } = useI18n();
  const [gpu, setGpu] = useState<{ model: string; nvidia: boolean } | null>(null);
  const [ap, setAp] = useState<{ installed: { tag: string } | null; latest: string | null; updateAvailable?: boolean; notesUrl?: string; error?: string } | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [legacyGames, setLegacyGames] = useState<{ name: string; installDir: string }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [confirmForce, setConfirmForce] = useState<string | null>(null);

  const refreshAutopilot = useCallback(async () => { const s = await up()?.autopilotStatus().catch(() => null); if (s) setAp(s); }, []);

  useEffect(() => {
    void legacy()?.detectGpu().then((g) => setGpu(g?.ok ? { model: g.model, nvidia: g.vendor === 'nvidia' } : null)).catch(() => {});
    void refreshAutopilot();
    void up()?.dlssLatest().then((r) => r.ok && setLatest(r.version || null)).catch(() => {});
    void legacy()?.getSteamGames().then((list) => setLegacyGames((list || []).filter((g) => g.isApplied).map((g) => ({ name: g.name, installDir: g.installDir })))).catch(() => {});
  }, [refreshAutopilot]);

  const run = async (id: string, fn: () => Promise<{ ok: boolean; error?: string } | undefined>, ok?: string) => {
    setBusy(id); setNotice(null);
    try {
      const r = await fn();
      if (r && !r.ok) setNotice({ tone: 'err', text: r.error || t('dlss.failed', 'A operação falhou.') });
      else if (ok) setNotice({ tone: 'ok', text: ok });
      return r;
    } catch (e) {
      setNotice({ tone: 'err', text: String((e as Error)?.message || e) });
      return undefined;
    } finally { setBusy(null); }
  };

  const scan = () => run('scan', async () => {
    const r = await up()!.scanLibrary();
    if (r.ok) { setGames((r.games || []) as GameRow[]); if (r.latest) setLatest(r.latest); }
    return r;
  });
  const replaceRow = (dir: string, files?: DlssFile[], anticheat?: string | null) => setGames((list) => (list || []).map((g) => (g.dir === dir ? { ...g, files: files || g.files, anticheat: anticheat ?? g.anticheat } : g)));
  const update = (g: GameRow, force = false) => run(`u:${g.dir}`, async () => {
    const r = await up()!.updateGame(g.dir, force);
    if (r.files) replaceRow(g.dir, r.files, r.anticheat);
    return r;
  }, t('dlss.updated', 'DLSS atualizado em {name}.').replace('{name}', g.name));
  const restore = (g: GameRow) => run(`r:${g.dir}`, async () => {
    const r = await up()!.restoreGame(g.dir);
    const fresh = await up()!.inspectGame(g.dir);
    if (fresh.files) replaceRow(g.dir, fresh.files);
    return r;
  }, t('dlss.restored', 'Arquivos originais de {name} restaurados.').replace('{name}', g.name));
  const addFolder = async () => {
    const pick = await window.darkhub?.diskscan.pickFolder().catch(() => null);
    if (!pick?.path) return;
    await run('add', async () => {
      const r = await up()!.inspectGame(pick.path!);
      if (r.ok) {
        if (!r.files?.length) return { ok: false, error: t('dlss.noneInFolder', 'Nenhuma DLL do DLSS nesta pasta.') };
        setGames((list) => [{ name: pick.path!.split(/[\\/]/).pop() || pick.path!, dir: pick.path!, anticheat: r.anticheat, files: r.files || [] }, ...(list || []).filter((g) => g.dir !== pick.path)]);
      }
      return r;
    });
  };
  const updateAll = () => run('all', async () => {
    for (const g of (games || []).filter((x) => !x.anticheat && x.files.some((f) => f.behind))) {
      const r = await up()!.updateGame(g.dir);
      if (r.files) replaceRow(g.dir, r.files, r.anticheat);
    }
    return { ok: true };
  }, t('dlss.allUpdated', 'Jogos atualizados (os com anti-cheat ficaram de fora).'));

  const tier = gpu ? dlss5Tier(gpu.model, gpu.nvidia) : null;
  const tierText: Record<Tier, string> = {
    full: t('dlss5.tier.full', 'RTX 50: roda o build da própria NVIDIA, em velocidade total.'),
    moderate: t('dlss5.tier.moderate', 'RTX 40: build da comunidade (sm_89), custo moderado.'),
    heavy: t('dlss5.tier.heavy', 'RTX 20/30: build FP16 da comunidade, pesado (cerca de metade do FPS a 100% da resolução do modelo).'),
    none: t('dlss5.tier.none', 'Esta placa não roda o DLSS 5 neural (exige NVIDIA RTX 20 ou mais nova). A atualização do DLSS abaixo continua valendo.')
  };
  const behindCount = (games || []).filter((g) => g.files.some((f) => f.behind)).length;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <PageHeader title={t('dlss.title', 'DLSS Manager')} subtitle={t('dlss.subtitle', 'DLSS 5 neural rendering em jogos que não o trazem, e o DLSS de cada jogo mantido na versão mais nova da NVIDIA.')} />
      {notice ? <p role={notice.tone === 'err' ? 'alert' : 'status'} className={`text-[12.5px] ${notice.tone === 'err' ? 'text-red-300' : 'text-blue-200'}`}>{notice.text}</p> : null}

      {/* ------------------------------------------------------------ DLSS 5 */}
      <section className="dh-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="min-w-0 max-w-[80ch]">
            <h2 className="dh-section-title flex items-center gap-2"><Sparkles size={15} className="text-zinc-400" />{t('dlss5.title', 'DLSS 5 neural rendering')}</h2>
            <p className="dh-help mt-1">{t('dlss5.desc', 'A rede da NVIDIA que reilumina o quadro pronto (materiais, pele, tom). Para levá-la a outros jogos, o DarkHub usa o DLSS 5 Autopilot (código aberto, MIT): ele lê cada jogo, escolhe a rota que funciona (OptiScaler, ReShade, bridge, feeder, RTX Remix), baixa cada peça do autor original e desinstala tudo quando você quiser.')}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            {ap?.installed ? (
              <button type="button" className="dh-btn dh-btn-primary" disabled={busy !== null} onClick={() => run('launch', () => up()!.autopilotLaunch())}><Play size={14} />{t('dlss5.open', 'Abrir o Autopilot')}</button>
            ) : null}
            {!ap?.installed || ap.updateAvailable ? (
              <button type="button" className={`dh-btn ${ap?.installed ? '' : 'dh-btn-primary'}`} disabled={busy !== null || !ap?.latest} onClick={async () => { await run('install', () => up()!.autopilotInstall(), t('dlss5.installed', 'DLSS 5 Autopilot instalado.')); void refreshAutopilot(); }}>
                {busy === 'install' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {ap?.installed ? t('dlss5.update', 'Atualizar para {v}').replace('{v}', ap.latest || '') : t('dlss5.install', 'Instalar o Autopilot {v}').replace('{v}', ap?.latest || '')}
              </button>
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12.5px]">
          <div><dt className="text-zinc-500">{t('dlss5.gpu', 'Placa de vídeo')}</dt><dd className="text-zinc-100 truncate">{gpu?.model || '--'}</dd></div>
          <div className="sm:col-span-2"><dt className="text-zinc-500">{t('dlss5.compat', 'Compatibilidade')}</dt><dd className={tier === 'none' ? 'text-amber-200' : 'text-zinc-200'}>{tier ? tierText[tier] : '--'}</dd></div>
        </dl>
        <p className="dh-help">
          {ap?.installed ? t('dlss5.version', 'Instalado: {v}.').replace('{v}', ap.installed.tag) + ' ' : ''}
          {t('dlss5.anticheat', 'Jogos online com anti-cheat podem tratar arquivos trocados como trapaça: use só em jogos offline.')}
          {ap?.notesUrl ? <> <button type="button" className="text-blue-300 hover:underline inline-flex items-center gap-1" onClick={() => window.darkhub?.shell.openExternal(ap.notesUrl!)}>{t('dlss5.notes', 'Notas da versão')}<ExternalLink size={12} /></button></> : null}
        </p>
        {ap?.error ? <p className="text-[12px] text-amber-200">{ap.error}</p> : null}
      </section>

      {/* ------------------------------------------------------------ DLSS updater */}
      <section className="dh-card p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="min-w-0 max-w-[80ch]">
            <h2 className="dh-section-title">{t('dlss.updater', 'Atualizar o DLSS dos jogos')}</h2>
            <p className="dh-help mt-1">{t('dlss.updaterDesc', 'Troca o DLSS, o Ray Reconstruction e o Frame Generation de cada jogo pela versão mais nova da NVIDIA ({v}): imagem mais nítida e menos cintilação no mesmo jogo e na mesma placa. Os arquivos vêm só do repositório oficial da NVIDIA, com assinatura digital conferida, e o original fica guardado para restaurar.').replace('{v}', latest || '...')}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button type="button" className="dh-btn" disabled={busy !== null} onClick={addFolder}><FolderOpen size={14} />{t('dlss.addFolder', 'Adicionar pasta')}</button>
            <button type="button" className="dh-btn dh-btn-primary" disabled={busy !== null} onClick={scan}>{busy === 'scan' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t('dlss.scan', 'Analisar biblioteca Steam')}</button>
          </div>
        </div>
        {games === null ? <p className="dh-help">{t('dlss.scanHint', 'Analise a biblioteca ou adicione a pasta de um jogo.')}</p> : games.length === 0 ? (
          <p className="dh-help">{t('dlss.noGames', 'Nenhum jogo com DLSS encontrado.')}</p>
        ) : (
          <>
            {behindCount > 1 ? <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null} onClick={updateAll}>{t('dlss.updateAll', 'Atualizar os {n} desatualizados').replace('{n}', String(behindCount))}</button> : null}
            <ul className="divide-y divide-zinc-800/80">
              {games.map((g) => {
                const behind = g.files.some((f) => f.behind);
                const modified = g.files.some((f) => f.hasOriginal);
                return (
                  <li key={g.dir} className="py-2.5 flex flex-col md:flex-row md:items-center gap-2 text-[12.5px]">
                    <div className="min-w-0 flex-1">
                      <p className="text-zinc-100 truncate flex items-center gap-2" title={g.dir}>
                        {g.name}
                        {g.anticheat ? <span className="dh-tag text-amber-200" title={t('dlss.anticheatTip', 'Anti-cheat encontrado: fica fora do "atualizar todos".')}>anti-cheat</span> : null}
                      </p>
                      <p className="text-zinc-500 font-mono text-[11.5px]">
                        {g.files.map((f) => `${KIND_LABEL[f.kind]} ${f.version || '?'}`).join(' · ')}
                        {behind ? <span className="text-blue-300"> → {latest}</span> : <span className="text-zinc-400"> · {t('dlss.current', 'em dia')}</span>}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {behind ? (
                        g.anticheat && confirmForce !== g.dir ? (
                          <button type="button" className="dh-btn dh-btn-sm" onClick={() => setConfirmForce(g.dir)}><AlertTriangle size={14} />{t('dlss.update', 'Atualizar')}</button>
                        ) : (
                          <button type="button" className={`dh-btn dh-btn-sm ${g.anticheat ? 'dh-btn-danger' : ''}`} disabled={busy !== null} onClick={() => { setConfirmForce(null); void update(g, Boolean(g.anticheat)); }}>
                            {busy === `u:${g.dir}` ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            {g.anticheat ? t('dlss.updateAnyway', 'Atualizar mesmo assim') : t('dlss.update', 'Atualizar')}
                          </button>
                        )
                      ) : <span className="inline-flex items-center gap-1 text-zinc-500"><CheckCircle2 size={14} />{t('dlss.current', 'em dia')}</span>}
                      {modified ? <button type="button" className="dh-btn dh-btn-ghost dh-btn-sm" disabled={busy !== null} onClick={() => restore(g)}><RotateCcw size={14} />{t('dlss.restore', 'Restaurar original')}</button> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      {/* ------------------------------------------------------------ legacy installs */}
      {legacyGames.length ? (
        <section className="dh-card p-4 space-y-3">
          <h2 className="dh-section-title">{t('dlss.legacy', 'Instalações antigas do DLSS 5 do DarkHub')}</h2>
          <p className="dh-help">{t('dlss.legacyDesc', 'A versão anterior desta tela instalava arquivos que não ativavam o DLSS 5. Remova para devolver os arquivos originais do jogo; depois use o Autopilot.')}</p>
          <ul className="divide-y divide-zinc-800/80">
            {legacyGames.map((g) => (
              <li key={g.installDir} className="py-2 flex items-center gap-2 text-[12.5px]">
                <span className="flex-1 truncate text-zinc-200" title={g.installDir}>{g.name}</span>
                <button type="button" className="dh-btn dh-btn-sm" disabled={busy !== null} onClick={async () => {
                  const r = await run(`l:${g.installDir}`, () => legacy()!.revert({ targetDir: g.installDir }), t('dlss.legacyRemoved', 'Removido; arquivos originais restaurados.'));
                  if (r?.ok) setLegacyGames((list) => list.filter((x) => x.installDir !== g.installDir));
                }}><RotateCcw size={14} />{t('dlss.legacyRemove', 'Remover e restaurar')}</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
