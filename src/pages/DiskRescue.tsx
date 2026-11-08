import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RescueDrive, RescueInspect, RescuePlanResult, RescueSmart, RescueSurface, RescueVolumeHit } from '../global';
import PageHeader from '../components/ui/PageHeader';
import PartitionMapBar from '../components/recovery/PartitionMapBar';
import SectorHexViewer from '../components/recovery/SectorHexViewer';
import HeaderGuardModal from '../components/recovery/HeaderGuardModal';
import CarvingManager from '../components/recovery/CarvingManager';
import CloneWizard from '../components/recovery/CloneWizard';
import PartitionManager from '../components/recovery/PartitionManager';
import { api, ErrorLine, fmtBytes, JobProgress, type ProgressEv } from '../components/recovery/rescueUtils';
import { AlertTriangle, CheckCircle, FolderOpen, Gauge, HardDrive, Loader2, RefreshCw, Save, Search, ShieldCheck, Upload, Wrench } from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';

type Tab = 'health' | 'partitions' | 'guard' | 'editor' | 'carve' | 'clone' | 'boot';
type Guard = { title: string; plan: RescuePlanResult['plan']; apply: (confirmDisk?: number) => Promise<{ ok: boolean; error?: string; result?: RescuePlanResult['result'] }> };

const diskOf = (target: string) => { const m = /^disk:(\d+)$/.exec(target); return m ? Number(m[1]) : null; };

export default function DiskRescue() {
  const { t } = useI18n();
  const [drives, setDrives] = useState<RescueDrive[] | null>(null);
  const [drivesError, setDrivesError] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [tab, setTab] = useState<Tab>('health');
  const [info, setInfo] = useState<RescueInspect | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const loadDrives = useCallback(async () => {
    setDrivesError(null);
    const r = await api()?.listDrives();
    if (r?.ok) {
      setDrives(r.drives);
      setTarget((cur) => cur || (r.drives[0] ? `disk:${r.drives[0].index}` : ''));
    } else { setDrives([]); setDrivesError(r?.error || t('rescue.drivesFail', 'Não foi possível listar os discos.')); }
  }, [t]);

  const loadInfo = useCallback(async () => {
    if (!target) return;
    setLoadingInfo(true); setInfoError(null);
    try {
      const r = await api()?.inspectDisk({ target });
      if (r?.ok) setInfo(r);
      else {
        setInfo(null);
        setInfoError(r?.code === 'access_denied' ? t('rescue.needAdmin', 'Ler o disco direto exige administrador. Abra o DarkHub como administrador (o app instalado já abre assim).') : r?.error || t('rescue.inspectFail', 'Não foi possível ler o disco.'));
      }
    } finally { setLoadingInfo(false); }
  }, [target, t]);

  useEffect(() => { void loadDrives(); }, [loadDrives]);
  useEffect(() => { setInfo(null); void loadInfo(); }, [loadInfo]);

  const drive = drives?.find((d) => `disk:${d.index}` === target) ?? null;
  const isImage = !!target && !target.startsWith('disk:');

  const openImage = async () => {
    const r = await api()?.pickImage({});
    if (r?.ok && r.path) setTarget(r.path);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'health', label: t('rescue.tab.health', 'Saúde e partições') },
    { id: 'partitions', label: t('rescue.tab.partitions', 'Particionamento') },
    { id: 'guard', label: t('rescue.tab.guard', 'HeaderGuard') },
    { id: 'editor', label: t('rescue.tab.editor', 'DiskEditor') },
    { id: 'carve', label: t('rescue.tab.carve', 'Deep Carving') },
    { id: 'clone', label: t('rescue.tab.clone', 'Clonagem e imagens') },
    { id: 'boot', label: t('rescue.tab.boot', 'Boot e reparo offline') }
  ];

  return (
    <div className="dh-page">
      <PageHeader
        title={t('rescue.title', 'Disk Studio & Rescue')}
        subtitle={t('rescue.subtitle', 'Mapa de partições, reparo de MBR/GPT apagados, editor de setores, recuperação de arquivos apagados e clonagem, direto no disco.')}
        actions={<button type="button" className="dh-btn dh-btn-sm" onClick={() => { void loadDrives(); void loadInfo(); setReloadKey((k) => k + 1); }}><RefreshCw size={14} />{t('rescue.reload', 'Recarregar')}</button>}
      >
        <div className="flex flex-wrap items-center gap-2">
          <HardDrive size={16} className="text-zinc-400" />
          <select className="dh-input min-w-[320px]" value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('rescue.pickDisk', 'Disco')}>
            {!drives ? <option>{t('rescue.loading', 'Carregando...')}</option> : null}
            {drives?.map((d) => (
              <option key={d.index} value={`disk:${d.index}`}>
                {`${t('rescue.disk', 'Disco')} ${d.index} · ${d.model || d.bus} · ${fmtBytes(d.size)}${d.is_system ? ` · ${t('rescue.systemTag', 'sistema')}` : ''}`}
              </option>
            ))}
            {isImage ? <option value={target}>{target}</option> : null}
          </select>
          <button type="button" className="dh-btn dh-btn-sm" onClick={() => void openImage()}><FolderOpen size={14} />{t('rescue.openImage', 'Abrir imagem')}</button>
          {drive ? (
            <span className="font-mono text-[11px] text-zinc-500">
              {drive.bus} · {drive.sector_size}/{drive.physical_sector_size} B · {drive.serial || '-'}
            </span>
          ) : null}
          {drive?.is_system ? <span className="text-[11.5px] text-amber-300">{t('rescue.systemDisk', 'Disco do Windows ou do boot: só leitura')}</span> : null}
        </div>
        <ErrorLine text={drivesError} />
        <nav className="flex flex-wrap gap-1 -mb-5 border-b border-transparent" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
              className={`px-3 py-2 text-[12.5px] border-b-2 -mb-px transition-colors duration-150 ${tab === x.id ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
              {x.label}
            </button>
          ))}
        </nav>
      </PageHeader>

      {!target ? <p className="dh-help">{t('rescue.noTarget', 'Escolha um disco ou abra uma imagem.')}</p> : (
        <>
          {tab === 'health' ? <HealthTab target={target} drive={drive} info={info} loading={loadingInfo} error={infoError} /> : null}
          {tab === 'partitions' ? <PartitionManager diskNumber={diskOf(target)} reloadKey={reloadKey} /> : null}
          {tab === 'guard' ? <GuardTab target={target} info={info} readOnly={!!drive?.is_system} onChanged={loadInfo} /> : null}
          {tab === 'editor' ? <SectorHexViewer key={target} target={target} /> : null}
          {tab === 'carve' ? <CarvingManager key={target} target={target} diskNumber={diskOf(target)} /> : null}
          {tab === 'clone' ? <CloneWizard drives={drives ?? []} /> : null}
          {tab === 'boot' ? <BootTab target={target} info={info} readOnly={!!drive?.is_system} onChanged={loadInfo} /> : null}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Saúde e partições

function HealthTab({ target, drive, info, loading, error }: { target: string; drive: RescueDrive | null; info: RescueInspect | null; loading: boolean; error: string | null }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<number | null>(null);
  const [smart, setSmart] = useState<RescueSmart | null | undefined>(undefined);
  const [surface, setSurface] = useState<RescueSurface | null>(null);
  const [ev, setEv] = useState<ProgressEv | null>(null);
  const [testing, setTesting] = useState(false);
  const [surfErr, setSurfErr] = useState<string | null>(null);

  useEffect(() => {
    setSmart(undefined); setSurface(null);
    if (!drive) { setSmart(null); return; }
    void api()?.smart().then((r) => setSmart(r?.ok ? r.disks.find((d) => d.number === drive.index) ?? null : null));
  }, [drive]);
  useEffect(() => api()?.onProgress((e) => { if (e.kind === 'surface' && e.event === 'progress') setEv(e); }), []);

  const runSurface = async () => {
    setTesting(true); setSurfErr(null); setSurface(null); setEv(null);
    try {
      const r = await api()?.surfaceTest({ target, part: selected ?? undefined });
      if (r?.ok) setSurface(r); else setSurfErr(r?.error || t('rescue.surface.fail', 'O teste falhou.'));
    } finally { setTesting(false); }
  };

  const liveMap = (testing ? ev?.map : null) ?? surface?.map ?? null;
  const parts = info?.layout.filter((p) => p.kind !== 'unallocated') ?? [];

  return (
    <div className="space-y-4">
      <section className="dh-card p-4 space-y-3">
        <h2 className="dh-section-title">{t('rescue.health.map', 'Mapa de partições')}</h2>
        {loading && !info ? <div className="h-12 rounded-lg bg-zinc-900 animate-pulse" /> : null}
        <ErrorLine text={error} />
        {info ? (
          <>
            <PartitionMapBar layout={info.layout} totalSectors={info.total_sectors} selected={selected} onSelect={(p) => setSelected(p.index === selected ? null : p.index ?? null)} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] text-zinc-500">
              <span>{info.scheme.toUpperCase()}</span>
              <span>{fmtBytes(info.size)}</span>
              <span>{info.total_sectors.toLocaleString()} {t('rescue.sectors', 'setores')} × {info.sector_size} B</span>
              {info.scheme === 'gpt' ? <span>GUID {info.gpt.primary.disk_guid ?? info.gpt.backup.disk_guid}</span> : <span>{t('rescue.health.sig', 'assinatura')} {info.mbr.disk_signature}</span>}
            </div>
            {info.problems.length ? (
              <ul className="space-y-1">
                {info.problems.map((p, i) => <li key={i} className="flex items-start gap-2 text-[12.5px] text-amber-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{p}</li>)}
              </ul>
            ) : <p className="flex items-center gap-2 text-[12.5px] text-emerald-300"><CheckCircle size={14} />{t('rescue.health.tableOk', 'Tabela de partições íntegra.')}</p>}
            {parts.length ? (
              <table className="w-full text-[12px]">
                <thead className="text-[11px] text-zinc-500"><tr>
                  <th className="py-1.5 text-left font-normal">#</th><th className="text-left font-normal">{t('rescue.fs', 'Sistema')}</th><th className="text-left font-normal">{t('rescue.type', 'Tipo')}</th>
                  <th className="text-right font-normal">{t('rescue.start', 'Início (LBA)')}</th><th className="text-right font-normal">{t('rescue.size', 'Tamanho')}</th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {parts.map((p) => (
                    <tr key={p.start_lba} className={p.index === selected ? 'bg-zinc-900' : ''} onClick={() => setSelected(p.index ?? null)}>
                      <td className="py-1.5 font-mono text-zinc-400">{p.index}</td>
                      <td className="text-zinc-200">{p.fs}{p.label ? <span className="text-zinc-500"> "{p.label}"</span> : null}{p.name ? <span className="text-zinc-500"> · {p.name}</span> : null}</td>
                      <td className="text-zinc-400">{p.type_name}{p.boot ? <span className="ml-1 text-blue-300">{t('rescue.active', 'ativa')}</span> : null}</td>
                      <td className="text-right font-mono text-zinc-400">{p.start_lba.toLocaleString()}</td>
                      <td className="text-right font-mono text-zinc-200">{fmtBytes(p.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="dh-card p-4 space-y-3">
          <h2 className="dh-section-title">{t('rescue.smart.title', 'Saúde (SMART)')}</h2>
          {target.startsWith('disk:') ? null : <p className="dh-help">{t('rescue.smart.image', 'Imagens não têm SMART.')}</p>}
          {smart === undefined && drive ? <div className="h-24 rounded bg-zinc-900 animate-pulse" /> : null}
          {smart === null && drive ? <p className="dh-help">{t('rescue.smart.none', 'O Windows não expõe contadores de confiabilidade para este disco.')}</p> : null}
          {smart ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
              <Stat k={t('rescue.smart.health', 'Estado')} v={smart.health} tone={smart.health === 'Healthy' ? 'ok' : 'bad'} />
              <Stat k={t('rescue.smart.temp', 'Temperatura')} v={smart.temperature != null ? `${smart.temperature} °C` : '-'} />
              <Stat k={t('rescue.smart.wear', 'Desgaste')} v={smart.wear != null ? `${smart.wear}%` : '-'} tone={smart.wear != null && smart.wear >= 90 ? 'bad' : undefined} />
              <Stat k={t('rescue.smart.hours', 'Horas ligado')} v={smart.powerOnHours != null ? smart.powerOnHours.toLocaleString() : '-'} />
              <Stat k={t('rescue.smart.readErr', 'Erros de leitura não corrigidos')} v={String(smart.readErrorsUncorrected ?? '-')} tone={smart.readErrorsUncorrected ? 'bad' : undefined} />
              <Stat k={t('rescue.smart.writeErr', 'Erros de escrita não corrigidos')} v={String(smart.writeErrorsUncorrected ?? '-')} tone={smart.writeErrorsUncorrected ? 'bad' : undefined} />
            </dl>
          ) : null}
        </section>

        <section className="dh-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="dh-section-title">{t('rescue.surface.title', 'Teste de superfície')}</h2>
              <p className="dh-help">{selected != null ? `${t('rescue.surface.part', 'Partição')} #${selected}` : t('rescue.surface.whole', 'Disco inteiro')} · {t('rescue.surface.help', 'só leitura, mede o tempo de cada bloco de 1 MB')}</p>
            </div>
            <button type="button" className="dh-btn dh-btn-sm" disabled={testing} onClick={() => void runSurface()}><Gauge size={14} />{t('rescue.surface.run', 'Testar')}</button>
          </div>
          {testing ? <JobProgress ev={ev} label={t('rescue.surface.running', 'Lendo')} onCancel={() => void api()?.cancel()} cancelLabel={t('rescue.cancel', 'Cancelar')} /> : null}
          <ErrorLine text={surfErr} />
          {liveMap ? (
            <div className="grid gap-px" style={{ gridTemplateColumns: 'repeat(60, minmax(0, 1fr))' }} aria-label={t('rescue.surface.map', 'Mapa de blocos')}>
              {liveMap.split('').map((c, i) => <span key={i} className={`h-2.5 rounded-[1px] ${c === '3' ? 'bg-red-500' : c === '2' ? 'bg-amber-400' : c === '1' ? 'bg-amber-200/60' : 'bg-emerald-500/50'}`} />)}
            </div>
          ) : null}
          {surface ? (
            <p className="text-[12.5px] text-zinc-300">
              <span className="font-mono">{surface.blocks}</span> {t('rescue.surface.blocks', 'blocos')} ·{' '}
              <span className={surface.bad ? 'text-red-400' : ''}>{surface.bad} {t('rescue.surface.bad', 'ilegíveis')}</span> ·{' '}
              <span className={surface.very_slow ? 'text-amber-300' : ''}>{surface.very_slow + surface.slow} {t('rescue.surface.slow', 'lentos')}</span> ·{' '}
              {t('rescue.surface.max', 'pior latência')} <span className="font-mono">{surface.max_latency_ms} ms</span>
              {!surface.complete ? <span className="text-amber-300"> · {t('rescue.surface.partial', 'interrompido')}</span> : null}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: 'ok' | 'bad' }) {
  return (
    <div>
      <dt className="dh-label">{k}</dt>
      <dd className={`font-mono ${tone === 'ok' ? 'text-emerald-300' : tone === 'bad' ? 'text-red-400' : 'text-zinc-200'}`}>{v}</dd>
    </div>
  );
}

// ---------------------------------------------------------------- HeaderGuard

function GuardTab({ target, info, readOnly, onChanged }: { target: string; info: RescueInspect | null; readOnly: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const [guard, setGuard] = useState<Guard | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [hits, setHits] = useState<RescueVolumeHit[] | null>(null);
  const [ev, setEv] = useState<ProgressEv | null>(null);
  const diskNumber = diskOf(target);

  useEffect(() => api()?.onProgress((e) => { if ((e.kind === 'scan' || e.kind === 'repair') && e.event === 'progress') setEv(e); }), []);
  useEffect(() => { setHits(null); setMsg(null); setError(null); }, [target]);

  const wrap = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null); setMsg(null);
    try { await fn(); } finally { setBusy(null); setEv(null); }
  };
  const after = <T extends { ok: boolean }>(r: T | undefined) => { if (r?.ok) onChanged(); return r ?? { ok: false as const, error: '' }; };

  const planGpt = () => wrap('gpt', async () => {
    const r = await api()?.repairHeader({ target, mode: 'gpt' });
    if (!r?.ok) { setError(r?.error ?? null); return; }
    setGuard({ title: t('rescue.guard.gptTitle', 'Restaurar GPT a partir da cópia íntegra'), plan: r.plan,
      apply: async (confirmDisk) => after(await api()?.repairHeader({ target, mode: 'gpt', apply: true, confirmDisk })) });
  });

  const scan = () => wrap('scan', async () => {
    const r = await api()?.repairHeader({ target, mode: 'scan' });
    if (r?.ok) setHits(r.volumes ?? []); else setError(r?.error ?? null);
  });

  const planMbr = () => wrap('mbr', async () => {
    const r = await api()?.repairHeader({ target, mode: 'mbr' });
    if (!r?.ok) { setError(r?.error ?? null); return; }
    if (r.volumes) setHits(r.volumes);
    setGuard({ title: t('rescue.guard.mbrTitle', 'Reconstruir o MBR com os volumes encontrados'), plan: r.plan,
      apply: async (confirmDisk) => after(await api()?.repairHeader({ target, mode: 'mbr', apply: true, confirmDisk })) });
  });

  const backup = () => wrap('backup', async () => {
    const r = await api()?.backupTable({ target });
    if (r?.ok) setMsg(`${t('rescue.guard.backupSaved', 'Backup da tabela salvo em')} ${r.out}`); else setError(r?.error ?? null);
  });

  const restore = () => wrap('restore', async () => {
    const f = await api()?.pickImage({});
    if (!f?.ok || !f.path) return;
    const from = f.path;
    const r = await api()?.restoreBackup({ target, from });
    if (!r?.ok) { setError(r?.error ?? null); return; }
    setGuard({ title: t('rescue.guard.restoreTitle', 'Restaurar setores de um backup .dhbk'), plan: r.plan,
      apply: async (confirmDisk) => after(await api()?.restoreBackup({ target, from, apply: true, confirmDisk })) });
  });

  const g = info?.gpt;
  const copyState = (c: RescueInspect['gpt']['primary'] | undefined) =>
    !c?.present ? t('rescue.guard.absent', 'ausente') : c.valid ? t('rescue.guard.valid', 'íntegro') : t('rescue.guard.corrupt', 'corrompido');

  return (
    <div className="space-y-4">
      <section className="dh-card p-4 space-y-3">
        <h2 className="dh-section-title">{t('rescue.guard.title', 'Cirurgia anti-wiper')}</h2>
        <p className="dh-help max-w-[75ch]">{t('rescue.guard.help', 'Malwares do tipo wiper e quedas de energia costumam apagar só o começo do disco. O GPT guarda uma segunda cópia no fim do disco, e o NTFS guarda uma cópia do setor de boot no fim de cada volume: com elas dá para remontar a tabela sem tocar nos dados. Todo reparo mostra a diferença antes e salva um backup antes de gravar.')}</p>
        {info ? (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3 text-[12.5px]">
            <Stat k="MBR (LBA 0)" v={info.mbr.signature_ok ? t('rescue.guard.valid', 'íntegro') : t('rescue.guard.corrupt', 'corrompido')} tone={info.mbr.signature_ok ? 'ok' : 'bad'} />
            <Stat k={t('rescue.guard.gptPrimary', 'GPT primário (LBA 1)')} v={copyState(g?.primary)} tone={g?.primary.valid ? 'ok' : g?.primary.present || g?.backup.valid ? 'bad' : undefined} />
            <Stat k={`${t('rescue.guard.gptBackup', 'GPT secundário')} (LBA ${g?.backup.lba ?? '-'})`} v={copyState(g?.backup)} tone={g?.backup.valid ? 'ok' : g?.backup.present || g?.primary.valid ? 'bad' : undefined} />
          </dl>
        ) : <div className="h-10 rounded bg-zinc-900 animate-pulse" />}
        {readOnly ? <p className="text-[12.5px] text-amber-300">{t('rescue.guard.readOnly', 'Este é o disco do Windows ou do boot: o DarkHub só mostra o plano e nunca grava nele.')}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="dh-btn dh-btn-primary" disabled={!!busy} onClick={() => void planGpt()}>{busy === 'gpt' ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}{t('rescue.guard.planGpt', 'Analisar reparo do GPT')}</button>
          <button type="button" className="dh-btn" disabled={!!busy} onClick={() => void scan()}>{busy === 'scan' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}{t('rescue.guard.scan', 'Procurar volumes perdidos')}</button>
          <button type="button" className="dh-btn" disabled={!!busy} onClick={() => void backup()}><Save size={14} />{t('rescue.guard.backup', 'Backup da tabela')}</button>
          <button type="button" className="dh-btn" disabled={!!busy} onClick={() => void restore()}><Upload size={14} />{t('rescue.guard.restore', 'Restaurar backup')}</button>
        </div>
        {(busy === 'scan' || busy === 'mbr') ? <JobProgress ev={ev} label={t('rescue.guard.scanning', 'Procurando setores de boot de volume')} onCancel={() => void api()?.cancel()} cancelLabel={t('rescue.cancel', 'Cancelar')} /> : null}
        <ErrorLine text={error} />
        {msg ? <p className="text-[12.5px] text-emerald-300 break-all" role="status">{msg}</p> : null}
      </section>

      {hits ? (
        <section className="dh-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="dh-section-title">{t('rescue.guard.found', 'Volumes encontrados')} <span className="font-mono text-zinc-500">{hits.length}</span></h2>
            {hits.length ? <button type="button" className="dh-btn dh-btn-sm" disabled={!!busy} onClick={() => void planMbr()}><ShieldCheck size={14} />{t('rescue.guard.planMbr', 'Reconstruir MBR')}</button> : null}
          </div>
          {!hits.length ? <p className="dh-help">{t('rescue.guard.noneFound', 'Nenhum setor de boot NTFS, FAT ou exFAT encontrado nos alinhamentos usuais.')}</p> : (
            <ul className="divide-y divide-zinc-800/80 text-[12.5px]">
              {hits.map((h) => (
                <li key={h.start_lba} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                  <span className="text-zinc-100">{h.fs}{h.label ? ` "${h.label}"` : ''}</span>
                  <span className="font-mono text-zinc-400">LBA {h.start_lba.toLocaleString()}</span>
                  <span className="font-mono text-zinc-300">{fmtBytes(h.size)}</span>
                  <span className="dh-tag">{h.sources.join(' + ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {guard ? <HeaderGuardModal title={guard.title} plan={guard.plan} diskNumber={diskNumber} readOnly={readOnly} onApply={guard.apply} onClose={() => setGuard(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- Boot e reparo offline

function BootTab({ target, info, readOnly, onChanged }: { target: string; info: RescueInspect | null; readOnly: boolean; onChanged: () => void }) {
  const { t } = useI18n();
  const [guard, setGuard] = useState<Guard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esp = useMemo(() => info?.layout.find((p) => p.type_name?.startsWith('EFI System')), [info]);
  const active = info?.mbr.entries.find((e) => e.boot);

  const planActive = async (slot: number) => {
    setError(null);
    const r = await api()?.setActive({ target, slot });
    if (!r?.ok) { setError(r?.error ?? null); return; }
    setGuard({ title: `${t('rescue.boot.setActive', 'Marcar como ativa')} #${slot}`, plan: r.plan,
      apply: async (confirmDisk) => { const x = await api()?.setActive({ target, slot, apply: true, confirmDisk }); if (x?.ok) onChanged(); return x ?? { ok: false, error: '' }; } });
  };

  return (
    <div className="space-y-4">
      <section className="dh-card p-4 space-y-3">
        <h2 className="dh-section-title">{t('rescue.boot.title', 'Como este disco dá boot')}</h2>
        {!info ? <div className="h-16 rounded bg-zinc-900 animate-pulse" /> : (
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3 text-[12.5px]">
            <Stat k={t('rescue.boot.mode', 'Modo')} v={info.scheme === 'gpt' ? 'UEFI (GPT)' : info.scheme === 'mbr' ? 'BIOS / Legacy (MBR)' : '-'} />
            {info.scheme === 'gpt' ? <Stat k={t('rescue.boot.esp', 'Partição EFI (ESP)')} v={esp ? `#${esp.index} · ${fmtBytes(esp.size)} · ${esp.fs}` : t('rescue.boot.noEsp', 'não encontrada')} tone={esp ? 'ok' : 'bad'} /> : null}
            {info.scheme === 'mbr' ? <Stat k={t('rescue.boot.code', 'Código de boot no MBR')} v={info.mbr.boot_code_present ? t('rescue.yes', 'presente') : t('rescue.no', 'ausente')} tone={info.mbr.boot_code_present ? 'ok' : 'bad'} /> : null}
            {info.scheme === 'mbr' ? <Stat k={t('rescue.boot.active', 'Partição ativa')} v={active ? `#${active.slot}` : t('rescue.boot.noActive', 'nenhuma')} tone={active ? 'ok' : 'bad'} /> : null}
          </dl>
        )}
        {info?.scheme === 'mbr' && info.mbr.entries.length && !readOnly ? (
          <div className="flex flex-wrap gap-2">
            {info.mbr.entries.filter((e) => e.type !== '0xEE').map((e) => (
              <button key={e.slot} type="button" className="dh-btn dh-btn-sm" disabled={e.boot} onClick={() => void planActive(e.slot)}>
                {t('rescue.boot.setActive', 'Marcar como ativa')} #{e.slot}
              </button>
            ))}
          </div>
        ) : null}
        <ErrorLine text={error} />
      </section>

      <section className="dh-card p-4 space-y-2">
        <h2 className="dh-section-title">{t('rescue.boot.offline', 'BCD e registro offline')}</h2>
        <p className="dh-help max-w-[75ch]">{t('rescue.boot.offlineHelp', 'Nesta versão esta aba é informativa: o DarkHub ainda não edita o BCD nem colmeias de registro de um Windows desligado. Para recriar os arquivos de boot de uma instalação em outro disco, use no Prompt de Comando (como administrador), trocando as letras pelas do seu caso:')}</p>
        <pre className="rounded-lg bg-zinc-950 border border-zinc-800/80 p-3 font-mono text-[12px] text-zinc-300 overflow-x-auto">{'bcdboot W:\\Windows /s S: /f UEFI      (GPT: S: = partição EFI)\nbcdboot W:\\Windows /s W: /f BIOS      (MBR)\nbootsect /nt60 W: /mbr                (recria o código de boot do MBR)'}</pre>
      </section>

      {guard ? <HeaderGuardModal title={guard.title} plan={guard.plan} diskNumber={diskOf(target)} readOnly={readOnly} onApply={guard.apply} onClose={() => setGuard(null)} /> : null}
    </div>
  );
}
