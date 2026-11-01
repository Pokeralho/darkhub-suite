import React, { useEffect, useMemo, useState } from 'react';
import type { RescueCloneResult, RescueDrive, RescueInspect } from '../../global';
import { AlertTriangle, CheckCircle, Copy, FolderOpen, Loader2, XCircle } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import { api, ErrorLine, fmtBytes, JobProgress, type ProgressEv } from './rescueUtils';

type Mode = 'disk' | 'part' | 'image' | 'restore';

const diskTarget = (d: RescueDrive) => `disk:${d.index}`;

/**
 * Disk → disk, partition → partition, disk/partition → image file and image → disk/partition.
 * First a dry run checks sizes, then the copy runs with progress, SHA-256 verification and bad-sector tolerance.
 */
export default function CloneWizard({ drives }: { drives: RescueDrive[] }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('disk');
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [sourcePart, setSourcePart] = useState<number | ''>('');
  const [targetPart, setTargetPart] = useState<number | ''>('');
  const [srcInfo, setSrcInfo] = useState<RescueInspect | null>(null);
  const [dstInfo, setDstInfo] = useState<RescueInspect | null>(null);
  const [verify, setVerify] = useState(true);
  const [check, setCheck] = useState<RescueCloneResult | null>(null);
  const [typed, setTyped] = useState('');
  const [running, setRunning] = useState(false);
  const [ev, setEv] = useState<ProgressEv | null>(null);
  const [result, setResult] = useState<RescueCloneResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => api()?.onProgress((e) => { if (e.kind === 'clone' && e.event === 'progress') setEv(e); }), []);
  useEffect(() => { setCheck(null); setResult(null); setError(null); setTyped(''); }, [mode, source, target, sourcePart, targetPart, verify]);
  useEffect(() => { setSource(''); setTarget(''); setSourcePart(''); setTargetPart(''); }, [mode]);

  const usesPart = mode === 'part';
  useEffect(() => {
    setSrcInfo(null);
    if (source && (usesPart || mode === 'image')) void api()?.inspectDisk({ target: source }).then((r) => { if (r?.ok) setSrcInfo(r); });
  }, [source, usesPart, mode]);
  useEffect(() => {
    setDstInfo(null);
    if (target && (usesPart || mode === 'restore') && target.startsWith('disk:')) void api()?.inspectDisk({ target }).then((r) => { if (r?.ok) setDstInfo(r); });
  }, [target, usesPart, mode]);

  const writable = drives.filter((d) => !d.is_system);
  const targetDisk = /^disk:(\d+)$/.exec(target)?.[1];
  const targetDiskNum = targetDisk !== undefined ? Number(targetDisk) : null;

  const payload = useMemo(() => ({
    source, target, verify,
    sourcePart: sourcePart === '' ? undefined : sourcePart,
    targetPart: targetPart === '' ? undefined : targetPart,
    createImage: mode === 'image'
  }), [source, target, verify, sourcePart, targetPart, mode]);

  const dryRun = async () => {
    setError(null); setCheck(null);
    const r = await api()?.clone({ ...payload, apply: false, overwrite: mode === 'image' });
    if (r?.ok) setCheck(r); else setError(r?.error || t('rescue.clone.fail', 'Não foi possível validar a cópia.'));
  };

  const run = async () => {
    setRunning(true); setError(null); setResult(null); setEv(null);
    try {
      const r = await api()?.clone({ ...payload, apply: true, overwrite: mode === 'image', confirmDisk: targetDiskNum ?? undefined });
      if (r?.ok) setResult(r); else setError(r?.error || t('rescue.clone.fail', 'Não foi possível validar a cópia.'));
    } finally { setRunning(false); }
  };

  const pickImage = async (save: boolean) => {
    const r = await api()?.pickImage({ save, defaultName: 'disco.img' });
    if (r?.ok && r.path) (save ? setTarget : setSource)(r.path);
  };

  const DriveSelect = ({ value, onChange, list, label }: { value: string; onChange: (v: string) => void; list: RescueDrive[]; label: string }) => (
    <label className="block space-y-1">
      <span className="dh-label">{label}</span>
      <select className="dh-input w-full" value={value} onChange={(e) => onChange(e.target.value)} disabled={running}>
        <option value="">{t('rescue.clone.choose', 'Escolha um disco')}</option>
        {list.map((d) => (
          <option key={d.index} value={diskTarget(d)}>
            {`${t('rescue.disk', 'Disco')} ${d.index} · ${d.model || d.bus} · ${fmtBytes(d.size)}${d.volumes.some((v) => v.mount_points.length) ? ` · ${d.volumes.flatMap((v) => v.mount_points).join(' ')}` : ''}`}
          </option>
        ))}
      </select>
    </label>
  );

  const PartSelect = ({ info, value, onChange, label }: { info: RescueInspect | null; value: number | ''; onChange: (v: number | '') => void; label: string }) => (
    <label className="block space-y-1">
      <span className="dh-label">{label}</span>
      <select className="dh-input w-full" value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} disabled={running || !info}>
        <option value="">{info ? t('rescue.clone.choosePart', 'Escolha uma partição') : t('rescue.loading', 'Carregando...')}</option>
        {(info?.layout ?? []).filter((p) => p.index != null).map((p) => (
          <option key={p.index} value={p.index}>{`#${p.index} · ${p.fs || ''}${p.label ? ` "${p.label}"` : ''} · ${fmtBytes(p.size)}${p.name ? ` · ${p.name}` : ''}`}</option>
        ))}
      </select>
    </label>
  );

  const ready = source && target && (!usesPart || (sourcePart !== '' && targetPart !== ''));
  const typedOk = targetDiskNum === null || typed.trim() === String(targetDiskNum);
  const modes: { id: Mode; label: string }[] = [
    { id: 'disk', label: t('rescue.clone.mDisk', 'Disco para disco') },
    { id: 'part', label: t('rescue.clone.mPart', 'Partição para partição') },
    { id: 'image', label: t('rescue.clone.mImage', 'Criar imagem') },
    { id: 'restore', label: t('rescue.clone.mRestore', 'Restaurar imagem') }
  ];

  return (
    <section className="dh-card p-4 space-y-4">
      <div>
        <h2 className="dh-section-title">{t('rescue.clone.title', 'Clonagem e imagens')}</h2>
        <p className="dh-help max-w-[75ch]">{t('rescue.clone.help', 'Cópia setor a setor com leitura tolerante a setores defeituosos (são preenchidos com zeros e listados) e verificação SHA-256 no fim. Ao clonar para um disco maior, o GPT é ajustado ao novo tamanho. O disco do Windows e o da partição de boot nunca aparecem como destino.')}</p>
      </div>

      <div className="flex flex-wrap gap-1" role="tablist">
        {modes.map((m) => (
          <button key={m.id} type="button" role="tab" aria-selected={mode === m.id} disabled={running}
            className={`dh-btn dh-btn-sm ${mode === m.id ? 'border-blue-400/60 text-blue-200' : ''}`} onClick={() => setMode(m.id)}>{m.label}</button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          {mode === 'restore' ? (
            <div className="space-y-1">
              <span className="dh-label">{t('rescue.clone.srcImage', 'Arquivo de imagem')}</span>
              <div className="flex items-center gap-2">
                <button type="button" className="dh-btn dh-btn-sm" disabled={running} onClick={() => void pickImage(false)}><FolderOpen size={14} />{t('rescue.open', 'Abrir')}</button>
                <span className="font-mono text-[12px] text-zinc-400 break-all">{source || '-'}</span>
              </div>
            </div>
          ) : DriveSelect({ value: source, onChange: setSource, list: drives, label: t('rescue.clone.source', 'Origem') })}
          {usesPart || mode === 'image' ? PartSelect({ info: srcInfo, value: sourcePart, onChange: setSourcePart, label: mode === 'image' ? t('rescue.clone.partOptional', 'Partição (vazio = disco inteiro)') : t('rescue.clone.srcPart', 'Partição de origem') }) : null}
        </div>
        <div className="space-y-2">
          {mode === 'image' ? (
            <div className="space-y-1">
              <span className="dh-label">{t('rescue.clone.dstImage', 'Salvar imagem em')}</span>
              <div className="flex items-center gap-2">
                <button type="button" className="dh-btn dh-btn-sm" disabled={running} onClick={() => void pickImage(true)}><FolderOpen size={14} />{t('rescue.saveAs', 'Salvar como')}</button>
                <span className="font-mono text-[12px] text-zinc-400 break-all">{target || '-'}</span>
              </div>
            </div>
          ) : DriveSelect({ value: target, onChange: setTarget, list: writable.filter((d) => diskTarget(d) !== source), label: t('rescue.clone.target', 'Destino (será sobrescrito)') })}
          {usesPart || mode === 'restore' ? PartSelect({ info: dstInfo, value: targetPart, onChange: setTargetPart, label: mode === 'restore' ? t('rescue.clone.partOptionalDst', 'Partição de destino (vazio = disco inteiro)') : t('rescue.clone.dstPart', 'Partição de destino') }) : null}
        </div>
      </div>

      <label className="inline-flex items-center gap-2 text-[12.5px] text-zinc-300">
        <input type="checkbox" checked={verify} disabled={running} onChange={(e) => setVerify(e.target.checked)} />{t('rescue.clone.verify', 'Verificar com SHA-256 depois de copiar')}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="dh-btn" disabled={!ready || running} onClick={() => void dryRun()}>{t('rescue.clone.check', 'Validar')}</button>
      </div>
      <ErrorLine text={error} />

      {check && !running && !result ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
          <p className="text-[12.5px] text-zinc-200">
            {t('rescue.clone.willCopy', 'Serão copiados')} <span className="font-mono">{fmtBytes(check.bytes)}</span>
            {check.target_bytes ? <> {t('rescue.clone.into', 'para um destino de')} <span className="font-mono">{fmtBytes(check.target_bytes)}</span></> : null}.
          </p>
          {mode !== 'image' ? (
            <p className="flex items-start gap-2 text-[12.5px] text-amber-200"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t('rescue.clone.erase', 'Tudo no destino será apagado e substituído. Os volumes do disco de destino são desmontados durante a cópia.')}</p>
          ) : null}
          {targetDiskNum !== null ? (
            <label className="flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-300">
              {t('rescue.guard.type', 'Digite o número do disco para confirmar')} <span className="font-mono text-zinc-50">{targetDiskNum}</span>
              <input className="dh-input w-20 font-mono" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </label>
          ) : null}
          <button type="button" className={`dh-btn ${mode === 'image' ? 'dh-btn-primary' : 'dh-btn-danger'}`} disabled={!typedOk} onClick={() => void run()}>
            <Copy size={14} />{mode === 'image' ? t('rescue.clone.startImage', 'Criar imagem') : t('rescue.clone.start', 'Iniciar cópia')}
          </button>
        </div>
      ) : null}

      {running ? <JobProgress ev={ev} label={ev?.phase === 'verify' ? t('rescue.clone.verifying', 'Verificando') : t('rescue.clone.copying', 'Copiando')} onCancel={() => void api()?.cancel()} cancelLabel={t('rescue.cancel', 'Cancelar')} /> : null}
      {running && !ev ? <p className="dh-help flex items-center gap-2"><Loader2 size={13} className="animate-spin" />{t('rescue.clone.preparing', 'Preparando (desmontando volumes do destino)...')}</p> : null}

      {result ? (
        <div className="space-y-1 text-[12.5px]" role="status">
          {result.cancelled ? <p className="text-amber-300">{t('rescue.clone.cancelled', 'Cópia cancelada. O destino ficou com uma cópia parcial.')}</p> : (
            <p className="flex items-center gap-2 text-emerald-300"><CheckCircle size={14} />{t('rescue.clone.done', 'Cópia concluída')} · <span className="font-mono">{fmtBytes(result.bytes)}</span>{result.seconds ? <span className="font-mono text-zinc-400">· {Math.round(result.seconds)} s</span> : null}</p>
          )}
          {result.verified === true ? <p className="text-emerald-300">{t('rescue.clone.verified', 'Verificação SHA-256: idêntico')}</p> : null}
          {result.verified === false ? <p className="flex items-center gap-2 text-red-400"><XCircle size={14} />{t('rescue.clone.mismatch', 'Verificação SHA-256: o destino é diferente da origem')}</p> : null}
          {result.bad_sectors ? <p className="text-amber-300">{result.bad_sectors} {t('rescue.badSectors', 'setores ilegíveis')} {t('rescue.clone.zeroed', '(gravados como zeros)')}</p> : null}
          {result.gpt_resized?.map((n, i) => <p key={i} className="text-zinc-300">{n}</p>)}
          {result.source_sha256 ? <p className="font-mono text-[11px] text-zinc-500 break-all">SHA-256 {result.source_sha256}</p> : null}
          {result.warnings?.length ? <ul className="dh-help">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
        </div>
      ) : null}
    </section>
  );
}
