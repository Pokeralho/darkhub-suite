import React, { useEffect, useState } from 'react';
import type { RescueCarveResult, RescueCarvedFile } from '../../global';
import { FolderOpen, Loader2, Play } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import { api, ErrorLine, fmtBytes, JobProgress, type ProgressEv } from './rescueUtils';

const TYPES: { id: string; label: string }[] = [
  { id: 'jpg', label: 'JPEG' }, { id: 'png', label: 'PNG' }, { id: 'gif', label: 'GIF' }, { id: 'bmp', label: 'BMP' }, { id: 'heic', label: 'HEIC' },
  { id: 'pdf', label: 'PDF' }, { id: 'docx', label: 'DOCX' }, { id: 'xlsx', label: 'XLSX' }, { id: 'pptx', label: 'PPTX' },
  { id: 'zip', label: 'ZIP' }, { id: '7z', label: '7z' }, { id: 'sqlite', label: 'SQLite' }, { id: 'mp4', label: 'MP4' }, { id: 'mov', label: 'MOV' }
];

/** Signature-based recovery of deleted files: types, output folder, live progress and the list of what was found. */
export default function CarvingManager({ target, diskNumber }: { target: string; diskNumber: number | null }) {
  const { t } = useI18n();
  const [types, setTypes] = useState<string[]>(['jpg', 'png', 'pdf', 'docx', 'xlsx', 'mp4']);
  const [out, setOut] = useState('');
  const [running, setRunning] = useState(false);
  const [ev, setEv] = useState<ProgressEv | null>(null);
  const [found, setFound] = useState<RescueCarvedFile[]>([]);
  const [result, setResult] = useState<RescueCarveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => api()?.onProgress((e) => {
    if (e.kind !== 'carve') return;
    if (e.event === 'progress') setEv(e);
    else if (e.event === 'found') setFound((f) => (f.length >= 2000 ? f : [...f, e.file]));
  }), []);

  const pick = async () => {
    const r = await api()?.pickFolder();
    if (r?.ok && r.path) setOut(r.path);
  };

  const start = async () => {
    setRunning(true); setError(null); setResult(null); setFound([]); setEv(null);
    try {
      const r = await api()?.startCarve({ target, out, types });
      if (r?.ok) setResult(r); else setError(r?.error || t('rescue.carve.fail', 'A varredura falhou.'));
    } finally { setRunning(false); }
  };

  const toggle = (id: string) => setTypes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const sameDiskHint = diskNumber !== null && out && /^[A-Za-z]:/.test(out);

  return (
    <div className="space-y-4">
      <section className="dh-card p-4 space-y-4">
        <div>
          <h2 className="dh-section-title">{t('rescue.carve.title', 'Recuperação por assinatura')}</h2>
          <p className="dh-help max-w-[75ch]">{t('rescue.carve.help', 'Lê o disco inteiro procurando o começo de cada tipo de arquivo e mede o tamanho real pela estrutura do formato. Funciona mesmo sem tabela de partições ou sistema de arquivos. Só leitura: o disco de origem não é alterado.')}</p>
        </div>
        <fieldset className="space-y-2" disabled={running}>
          <legend className="dh-label">{t('rescue.carve.types', 'Tipos de arquivo')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {TYPES.map((x) => (
              <label key={x.id} className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-300">
                <input type="checkbox" checked={types.includes(x.id)} onChange={() => toggle(x.id)} />{x.label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="dh-btn" disabled={running} onClick={() => void pick()}><FolderOpen size={14} />{t('rescue.carve.pick', 'Pasta de saída')}</button>
          <span className="font-mono text-[12px] text-zinc-400 break-all">{out || t('rescue.carve.noOut', 'nenhuma pasta escolhida')}</span>
        </div>
        {sameDiskHint ? <p className="dh-help">{t('rescue.carve.otherDisk', 'Use uma pasta em OUTRO disco: gravar no disco que está sendo recuperado sobrescreve justamente os arquivos apagados. O motor recusa a mesma unidade física.')}</p> : null}
        <div className="flex items-center gap-2">
          <button type="button" className="dh-btn dh-btn-primary" disabled={running || !out || !types.length} onClick={() => void start()}>
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}{t('rescue.carve.start', 'Iniciar varredura')}
          </button>
        </div>
        {running ? <JobProgress ev={ev} label={`${t('rescue.carve.scanning', 'Varrendo')} · ${found.length} ${t('rescue.carve.files', 'arquivos')}`} onCancel={() => void api()?.cancelCarve()} cancelLabel={t('rescue.cancel', 'Cancelar')} /> : null}
        <ErrorLine text={error} />
        {result ? (
          <p className="text-[12.5px] text-zinc-300" role="status">
            {result.cancelled ? t('rescue.carve.cancelled', 'Varredura cancelada.') : t('rescue.carve.done', 'Varredura concluída.')}{' '}
            <span className="font-mono">{result.total_files}</span> {t('rescue.carve.files', 'arquivos')} · <span className="font-mono">{fmtBytes(result.total_bytes)}</span>
            {result.bad_sectors ? <> · <span className="text-amber-300">{result.bad_sectors} {t('rescue.badSectors', 'setores ilegíveis')}</span></> : null}
          </p>
        ) : null}
      </section>

      {found.length ? (
        <section className="dh-card p-0 overflow-hidden">
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-zinc-950 text-[11px] text-zinc-500">
                <tr><th className="px-3 py-2 text-left font-normal">{t('rescue.carve.colType', 'Tipo')}</th><th className="px-3 py-2 text-right font-normal">{t('rescue.size', 'Tamanho')}</th><th className="px-3 py-2 text-right font-normal">LBA</th><th className="px-3 py-2 text-left font-normal">{t('rescue.carve.colFile', 'Arquivo')}</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {found.map((f) => (
                  <tr key={f.offset}>
                    <td className="px-3 py-1.5 font-mono text-zinc-200">{f.type}{f.damaged ? <span className="ml-1 text-amber-300">!</span> : null}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{fmtBytes(f.size)}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-500">{f.lba}</td>
                    <td className="px-3 py-1.5 font-mono text-zinc-400 truncate max-w-[420px]" title={f.path}>{f.path.split(/[\\/]/).pop()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
