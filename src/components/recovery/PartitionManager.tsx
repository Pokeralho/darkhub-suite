import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PartitionDisk, PartitionEntry, PartitionFs, PartitionPlan, PartitionRequest } from '../../global';
import PartitionMapBar from './PartitionMapBar';
import PartitionPlanModal from './PartitionPlanModal';
import { alignGap, freeLetters, layoutOf, MIB } from './partitionLayout';
import { api, ErrorLine, fmtBytes } from './rescueUtils';
import { AlertTriangle, Loader2 } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

type Selection = { partition: number } | { gap: number } | null;
type Action = 'format' | 'resize' | 'letter' | null;
const FILE_SYSTEMS: PartitionFs[] = ['NTFS', 'exFAT', 'FAT32'];

export default function PartitionManager({ diskNumber, reloadKey = 0 }: { diskNumber: number | null; reloadKey?: number }) {
  const { t } = useI18n();
  const [disks, setDisks] = useState<PartitionDisk[] | null>(null);
  const [elevated, setElevated] = useState(true);
  const [used, setUsed] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection>(null);
  const [action, setAction] = useState<Action>(null);
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<{ title: string; plan: PartitionPlan } | null>(null);

  const load = useCallback(async () => {
    const r = await api()?.partitionList();
    if (r?.ok) { setDisks(r.disks); setElevated(r.elevated); setUsed(r.usedLetters ?? []); setError(null); }
    else { setDisks([]); setError(r?.error || t('rescue.part.fail', 'Não foi possível ler os discos.')); }
  }, [t]);
  useEffect(() => { void load(); }, [load, reloadKey]);
  useEffect(() => { setSel(null); setAction(null); }, [diskNumber]);

  const disk = useMemo(() => disks?.find((d) => d.number === diskNumber) ?? null, [disks, diskNumber]);
  const part = sel && 'partition' in sel ? disk?.partitions.find((p) => p.number === sel.partition) ?? null : null;
  const gap = sel && 'gap' in sel ? disk?.free.find((g) => g.offset === sel.gap) ?? null : null;
  const readOnly = !!disk && (disk.isBoot || disk.isSystem || disk.partitions.some((p) => p.role === 'esp'));

  const roleName = (p: PartitionEntry) => ({
    esp: t('rescue.part.role.esp', 'Partição EFI'),
    msr: t('rescue.part.role.msr', 'Reservada da Microsoft'),
    recovery: t('rescue.part.role.recovery', 'Recuperação'),
    basic: t('rescue.part.role.basic', 'Dados'),
    dynamic: t('rescue.part.role.dynamic', 'Disco dinâmico'),
    spaces: t('rescue.part.role.spaces', 'Storage Spaces'),
    linux: t('rescue.part.role.linux', 'Linux'),
    extended: t('rescue.part.role.extended', 'Estendida'),
    unknown: t('rescue.part.role.unknown', 'Desconhecida')
  }[p.role]);

  const review = async (title: string, req: PartitionRequest) => {
    setPlanning(true); setError(null);
    try {
      const r = await api()?.partitionPlan(req);
      if (r?.ok) setPlan({ title, plan: r }); else setError(r?.error ?? null);
    } finally { setPlanning(false); }
  };

  if (diskNumber === null) return <p className="dh-help">{t('rescue.part.image', 'O particionamento funciona em discos físicos, não em arquivos de imagem.')}</p>;

  const rows = disk ? [
    ...disk.partitions.map((p) => ({ offset: p.offset, p, g: null })),
    ...disk.free.map((g) => ({ offset: g.offset, p: null, g }))
  ].sort((a, b) => a.offset - b.offset) : [];

  return (
    <div className="space-y-4">
      <section className="dh-card p-4 space-y-3">
        <h2 className="dh-section-title">{t('rescue.part.title', 'Partições e volumes')}</h2>
        {!disks ? <div className="h-12 rounded-lg bg-zinc-900 animate-pulse" /> : null}
        <ErrorLine text={error} />
        {disks && !disk && !error ? <p className="dh-help">{t('rescue.part.noDisk', 'O Windows não listou este disco.')}</p> : null}
        {disk ? (
          <>
            <PartitionMapBar layout={layoutOf(disk)} totalSectors={disk.size / disk.sectorSize} selected={part?.number ?? null} onSelect={(i) => { if (i.index != null) { setSel({ partition: i.index }); setAction(null); } }} />
            <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11.5px] text-zinc-500">
              <span>{disk.name || '-'}</span><span>{disk.style}</span><span>{disk.bus}</span><span>{fmtBytes(disk.size)}</span>
            </div>
            {readOnly ? <p className="flex items-start gap-2 text-[12.5px] text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{t('rescue.part.systemDisk', 'Este disco tem o Windows ou uma partição de boot: fica só para leitura.')}</p> : null}
            {!elevated ? <p className="dh-help">{t('rescue.part.notElevated', 'Sem administrador o estado do BitLocker não pode ser lido, e nenhuma operação fica disponível.')}</p> : null}
            {rows.length ? (
              <table className="w-full text-[12px]">
                <thead className="text-[11px] text-zinc-500"><tr>
                  <th className="py-1.5 text-left font-normal">#</th>
                  <th className="text-left font-normal">{t('rescue.part.letter', 'Unidade')}</th>
                  <th className="text-left font-normal">{t('rescue.type', 'Tipo')}</th>
                  <th className="text-left font-normal">{t('rescue.fs', 'Sistema')}</th>
                  <th className="text-left font-normal">BitLocker</th>
                  <th className="text-right font-normal">{t('rescue.size', 'Tamanho')}</th>
                  <th className="text-right font-normal">{t('rescue.part.free', 'Livre')}</th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {rows.map(({ offset, p, g }) => p ? (
                    <tr key={offset} className={`cursor-pointer ${part?.number === p.number ? 'bg-zinc-900' : ''}`} onClick={() => { setSel({ partition: p.number as number }); setAction(null); }}>
                      <td className="py-1.5 font-mono text-zinc-400">{p.number}</td>
                      <td className="font-mono text-zinc-200">{p.letter ? `${p.letter}:` : '-'}{p.label ? <span className="font-sans text-zinc-500"> "{p.label}"</span> : null}</td>
                      <td className="text-zinc-400">{roleName(p)}{p.isWindows ? <span className="ml-1 text-amber-300">Windows</span> : null}{p.hasPagefile ? <span className="ml-1 text-amber-300">{t('rescue.part.pagefile', 'paginação')}</span> : null}</td>
                      <td className="text-zinc-200">{p.fileSystem || '-'}</td>
                      <td className={p.bitlocker === 'on' ? 'text-amber-300' : 'text-zinc-400'}>{{ on: t('rescue.part.bl.on', 'criptografado'), off: t('rescue.part.bl.off', 'não'), unknown: t('rescue.part.bl.unknown', 'desconhecido'), none: '-' }[p.bitlocker]}</td>
                      <td className="text-right font-mono text-zinc-200">{fmtBytes(p.size)}</td>
                      <td className="text-right font-mono text-zinc-400">{p.free == null ? '-' : fmtBytes(p.free)}</td>
                    </tr>
                  ) : (
                    <tr key={offset} className={`cursor-pointer ${gap?.offset === g?.offset ? 'bg-zinc-900' : ''}`} onClick={() => { setSel({ gap: offset }); setAction(null); }}>
                      <td className="py-1.5 font-mono text-zinc-600">-</td>
                      <td colSpan={4} className="text-zinc-500">{t('rescue.map.free', 'Não alocado')}</td>
                      <td className="text-right font-mono text-zinc-400">{fmtBytes(g?.size)}</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="dh-help">{t('rescue.part.empty', 'Este disco não tem partições.')}</p>}
          </>
        ) : null}
      </section>

      {disk && !readOnly ? (
        <>
          {disk.style === 'RAW' && !disk.partitions.length ? (
            <section className="dh-card p-4 space-y-2">
              <h2 className="dh-section-title">{t('rescue.part.init.title', 'Disco não inicializado')}</h2>
              <p className="dh-help max-w-[75ch]">{t('rescue.part.init.help', 'Inicializar grava uma tabela GPT vazia. Se este disco tinha partições e a tabela foi perdida, use a aba HeaderGuard antes.')}</p>
              <button type="button" className="dh-btn dh-btn-primary" disabled={planning} onClick={() => void review(t('rescue.part.init.action', 'Inicializar como GPT'), { op: 'init', disk: disk.number })}>{t('rescue.part.init.action', 'Inicializar como GPT')}</button>
            </section>
          ) : null}

          {gap ? <CreateForm key={gap.offset} disk={disk} gap={gap} used={used} busy={planning} onReview={review} /> : null}

          {part && part.number !== null ? (
            <section className="dh-card p-4 space-y-3">
              <h2 className="dh-section-title">{t('rescue.part.selected', 'Partição')} #{part.number} {part.letter ? `(${part.letter}:)` : ''}</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="dh-btn" disabled={planning} onClick={() => setAction('format')}>{t('rescue.part.op.format', 'Formatar')}</button>
                <button type="button" className="dh-btn" disabled={planning} onClick={() => setAction('resize')}>{t('rescue.part.op.resize', 'Redimensionar')}</button>
                <button type="button" className="dh-btn" disabled={planning} onClick={() => setAction('letter')}>{t('rescue.part.op.letter', 'Trocar letra')}</button>
                <button type="button" className="dh-btn dh-btn-danger" disabled={planning} onClick={() => void review(`${t('rescue.part.op.delete', 'Excluir')} #${part.number}`, { op: 'delete', disk: disk.number, partition: part.number as number })}>{planning ? <Loader2 size={14} className="animate-spin" /> : null}{t('rescue.part.op.delete', 'Excluir')}</button>
              </div>
              {action === 'format' ? <FormatForm key={`f${part.number}`} disk={disk} part={part} busy={planning} onReview={review} /> : null}
              {action === 'resize' ? <ResizeForm key={`r${part.number}`} disk={disk} part={part} busy={planning} onReview={review} /> : null}
              {action === 'letter' ? <LetterForm key={`l${part.number}`} disk={disk} part={part} used={used} busy={planning} onReview={review} /> : null}
            </section>
          ) : null}
        </>
      ) : null}

      {plan ? <PartitionPlanModal title={plan.title} plan={plan.plan} onClose={() => setPlan(null)} onDone={() => { setSel(null); setAction(null); void load(); }} /> : null}
    </div>
  );
}

type Review = (title: string, req: PartitionRequest) => Promise<void>;

function FsFields({ fs, setFs, label, setLabel }: { fs: PartitionFs; setFs: (f: PartitionFs) => void; label: string; setLabel: (s: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <label className="space-y-1"><span className="dh-label block">{t('rescue.fs', 'Sistema')}</span>
        <select className="dh-input" value={fs} onChange={(e) => setFs(e.target.value as PartitionFs)}>{FILE_SYSTEMS.map((f) => <option key={f} value={f}>{f}</option>)}</select>
      </label>
      <label className="space-y-1"><span className="dh-label block">{t('rescue.part.label', 'Rótulo')}</span>
        <input className="dh-input w-44" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={fs === 'NTFS' ? 32 : fs === 'exFAT' ? 15 : 11} />
      </label>
    </>
  );
}

function CreateForm({ disk, gap, used, busy, onReview }: { disk: PartitionDisk; gap: { offset: number; size: number }; used: string[]; busy: boolean; onReview: Review }) {
  const { t } = useI18n();
  const room = alignGap(gap);
  const maxMb = room.size / MIB;
  const [mb, setMb] = useState(String(maxMb));
  const [fs, setFs] = useState<PartitionFs>('NTFS');
  const [label, setLabel] = useState('');
  const [letter, setLetter] = useState('');
  const n = Number(mb);
  const valid = Number.isInteger(n) && n >= 16 && n <= maxMb;
  return (
    <section className="dh-card p-4 space-y-3">
      <h2 className="dh-section-title">{t('rescue.part.op.create', 'Criar partição')}</h2>
      <div className="flex flex-wrap items-end gap-3 text-[12.5px]">
        <label className="space-y-1"><span className="dh-label block">{t('rescue.part.sizeMb', 'Tamanho (MB)')} ≤ {maxMb.toLocaleString()}</span>
          <input className="dh-input w-36 font-mono" inputMode="numeric" value={mb} onChange={(e) => setMb(e.target.value)} />
        </label>
        <FsFields fs={fs} setFs={setFs} label={label} setLabel={setLabel} />
        <label className="space-y-1"><span className="dh-label block">{t('rescue.part.letter', 'Unidade')}</span>
          <select className="dh-input" value={letter} onChange={(e) => setLetter(e.target.value)}>
            <option value="">{t('rescue.part.autoLetter', 'Automática')}</option>
            {freeLetters(used).map((l) => <option key={l} value={l}>{l}:</option>)}
          </select>
        </label>
        <button type="button" className="dh-btn dh-btn-primary" disabled={!valid || busy} onClick={() => void onReview(t('rescue.part.op.create', 'Criar partição'), { op: 'create', disk: disk.number, offset: room.offset, size: n * MIB, fs, label, letter: letter || null })}>{t('rescue.part.review', 'Revisar')}</button>
      </div>
    </section>
  );
}

function FormatForm({ disk, part, busy, onReview }: { disk: PartitionDisk; part: PartitionEntry; busy: boolean; onReview: Review }) {
  const { t } = useI18n();
  const [fs, setFs] = useState<PartitionFs>('NTFS');
  const [label, setLabel] = useState(part.label);
  const [full, setFull] = useState(false);
  return (
    <div className="flex flex-wrap items-end gap-3 text-[12.5px]">
      <FsFields fs={fs} setFs={setFs} label={label} setLabel={setLabel} />
      <label className="flex items-center gap-2 text-zinc-300"><input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />{t('rescue.part.fullFormat', 'Formatação completa (lenta)')}</label>
      <button type="button" className="dh-btn dh-btn-primary" disabled={busy} onClick={() => void onReview(`${t('rescue.part.op.format', 'Formatar')} #${part.number}`, { op: 'format', disk: disk.number, partition: part.number as number, fs, label, full })}>{t('rescue.part.review', 'Revisar')}</button>
    </div>
  );
}

function ResizeForm({ disk, part, busy, onReview }: { disk: PartitionDisk; part: PartitionEntry; busy: boolean; onReview: Review }) {
  const { t } = useI18n();
  const [limits, setLimits] = useState<{ min: number; max: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mb, setMb] = useState(String(Math.floor(part.size / MIB)));
  useEffect(() => {
    void api()?.partitionLimits({ disk: disk.number, partition: part.number as number }).then((r) => {
      if (r?.ok) setLimits({ min: r.min, max: r.max }); else setError(r?.error ?? t('rescue.part.limitsFail', 'Não foi possível ler os limites desta partição.'));
    });
  }, [disk.number, part.number, t]);
  const n = Number(mb);
  const minMb = limits ? Math.ceil(limits.min / MIB) : 0;
  const maxMb = limits ? Math.floor(limits.max / MIB) : 0;
  const valid = !!limits && Number.isInteger(n) && n >= minMb && n <= maxMb;
  return (
    <div className="space-y-2 text-[12.5px]">
      <ErrorLine text={error} />
      {limits ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1"><span className="dh-label block">{t('rescue.part.sizeMb', 'Tamanho (MB)')}: {minMb.toLocaleString()} – {maxMb.toLocaleString()}</span>
            <input className="dh-input w-36 font-mono" inputMode="numeric" value={mb} onChange={(e) => setMb(e.target.value)} />
          </label>
          <button type="button" className="dh-btn dh-btn-primary" disabled={!valid || busy} onClick={() => void onReview(`${t('rescue.part.op.resize', 'Redimensionar')} #${part.number}`, { op: 'resize', disk: disk.number, partition: part.number as number, newSize: n * MIB })}>{t('rescue.part.review', 'Revisar')}</button>
        </div>
      ) : !error ? <div className="h-9 w-64 rounded bg-zinc-900 animate-pulse" /> : null}
    </div>
  );
}

function LetterForm({ disk, part, used, busy, onReview }: { disk: PartitionDisk; part: PartitionEntry; used: string[]; busy: boolean; onReview: Review }) {
  const { t } = useI18n();
  const options = freeLetters(used);
  const [letter, setLetter] = useState(options[0] ?? '');
  return (
    <div className="flex flex-wrap items-end gap-3 text-[12.5px]">
      <label className="space-y-1"><span className="dh-label block">{t('rescue.part.newLetter', 'Nova letra')}</span>
        <select className="dh-input" value={letter} onChange={(e) => setLetter(e.target.value)}>{options.map((l) => <option key={l} value={l}>{l}:</option>)}</select>
      </label>
      <button type="button" className="dh-btn dh-btn-primary" disabled={!letter || busy} onClick={() => void onReview(`${t('rescue.part.op.letter', 'Trocar letra')} #${part.number}`, { op: 'letter', disk: disk.number, partition: part.number as number, letter })}>{t('rescue.part.review', 'Revisar')}</button>
    </div>
  );
}
