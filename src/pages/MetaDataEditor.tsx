import React, { useCallback, useMemo, useState } from 'react';
import { Trash2, Loader2, Check, Save, FolderOpen, X, AlertCircle, AlertTriangle, Lock, Image as ImageIcon, Layers, CheckCircle2, XCircle } from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import PageHeader from '../components/ui/PageHeader';
import MetaxTagsPanel from './metadata/MetaxTagsPanel';
import MetaxFilePanel from './metadata/MetaxFilePanel';
import type { MetaxInfo, MetaxField, MetaxCheck, MetaxWriteRequest } from './metadata/metaxTypes';

type Tab = 'tags' | 'file' | 'hex';
type Status = { ok: boolean; msg: string } | null;

const FIELD_LABELS: Record<string, string> = {
  title: 'Título', description: 'Descrição', artist: 'Artista / Autor', copyright: 'Direitos autorais', keywords: 'Palavras-chave',
  creationDate: 'Data de criação', software: 'Software', author: 'Autor', subject: 'Assunto', creator: 'Aplicativo criador',
  producer: 'Produtor (PDF)', modifyDate: 'Data de modificação', album: 'Álbum', albumArtist: 'Artista do álbum', year: 'Ano',
  track: 'Faixa', genre: 'Gênero', composer: 'Compositor', comment: 'Comentário', lastModifiedBy: 'Modificado por último por',
  category: 'Categoria', company: 'Empresa', manager: 'Gerente', modifiedDate: 'Data de modificação'
};
const BACKEND_LABELS: Record<string, [string, string]> = {
  exiftool: ['metax.backendExiftool', 'ExifTool (EXIF/IPTC/XMP/PDF)'],
  ffmpeg: ['metax.backendFfmpeg', 'ffmpeg -c copy (sem recodificar)'],
  ooxml: ['metax.backendOoxml', 'Office OOXML (docProps)']
};
const FAMILY_LABELS: Record<string, [string, string]> = {
  image: ['metax.familyImage', 'Imagem'], audio: ['metax.familyAudio', 'Áudio'], video: ['metax.familyVideo', 'Vídeo'],
  pdf: ['metax.familyPdf', 'PDF'], office: ['metax.familyOffice', 'Documento Office'], pe: ['metax.familyPe', 'Executável Windows'],
  other: ['metax.familyOther', 'Outro']
};

const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const baseName = (p: string) => p.split(/[\\/]/).pop() || p;
const dirName = (p: string) => p.slice(0, Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/')));
const extOf = (p: string) => { const b = baseName(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; };
const stemOf = (p: string) => { const b = baseName(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(0, i) : b; };

export default function MetaDataEditor() {
  const { t } = useI18n();
  const [info, setInfo] = useState<MetaxInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [tab, setTab] = useState<Tab>('tags');
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  const [rawEdits, setRawEdits] = useState<Record<string, string>>({});
  const [cover, setCover] = useState<{ path: string } | { remove: true } | null>(null);
  const [strip, setStrip] = useState(false);
  const [removeGps, setRemoveGps] = useState(false);
  const [saveAsCopy, setSaveAsCopy] = useState(true);
  const [backup, setBackup] = useState(true);
  const [preserveDates, setPreserveDates] = useState(false);
  const [checks, setChecks] = useState<MetaxCheck[] | null>(null);

  const fieldLabel = useCallback((key: string) => {
    if (key.startsWith('pe.') || key.startsWith('app.') || key.startsWith('core.')) return key.slice(key.indexOf('.') + 1);
    return t(`metax.field.${key}`, FIELD_LABELS[key] ?? key);
  }, [t]);

  const resetEdits = () => {
    setFieldEdits({}); setRawEdits({}); setCover(null); setStrip(false); setRemoveGps(false); setChecks(null);
  };

  const load = useCallback(async (file: string, keepStatus = false) => {
    setBusy(true);
    if (!keepStatus) setStatus(null);
    try {
      const res = await window.darkhub.metax.read(file);
      if (!res.ok) { setStatus({ ok: false, msg: res.error }); return; }
      setInfo(res);
      resetEdits();
      if (res.warnings.length && !keepStatus) setStatus({ ok: false, msg: res.warnings.join(' · ') });
    } catch (err: any) {
      setStatus({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  }, []);

  const pickFile = async () => {
    const res = await window.darkhub?.dialog?.selectFiles({ title: t('metax.pickTitle', 'Abrir arquivo para ver/editar metadados'), filters: [{ name: t('metax.filterAll', 'Todos os arquivos'), extensions: ['*'] }] });
    if (res && !res.canceled && res.filePaths?.[0]) await load(res.filePaths[0]);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length || !window.darkhub?.dialog?.grantDroppedFiles) return;
    const res = await window.darkhub.dialog.grantDroppedFiles(files);
    const first = res?.granted?.[0];
    if (first) await load(first);
  };

  const dirtyFields = useMemo(() => {
    if (!info) return {} as Record<string, string>;
    const out: Record<string, string> = {};
    for (const f of info.fields) if (f.writable && f.key in fieldEdits && fieldEdits[f.key] !== f.value) out[f.key] = fieldEdits[f.key];
    return out;
  }, [info, fieldEdits]);
  const pending = Object.keys(dirtyFields).length + Object.keys(rawEdits).length + (cover ? 1 : 0) + (strip ? 1 : 0) + (removeGps ? 1 : 0);

  const buildRequest = (path: string): MetaxWriteRequest => ({
    path, fields: dirtyFields, rawTags: rawEdits, strip, removeGps, cover, backup, preserveDates
  });

  const describeChecks = (list: MetaxCheck[] | undefined) => {
    const n = list?.length ?? 0;
    const bad = list?.filter((c) => !c.ok).length ?? 0;
    return bad ? t('metax.verifyFailed', '{n} verificação(ões) falharam').replace('{n}', String(bad)) : t('metax.verifyOk', '{n} campo(s) relidos e conferidos').replace('{n}', String(n));
  };

  const save = async () => {
    if (!info || !pending) return;
    let outputPath: string | null = null;
    if (saveAsCopy) {
      const res = await window.darkhub.dialog.saveFile({
        title: t('metax.saveCopyTitle', 'Salvar cópia com os metadados alterados'),
        defaultPath: `${dirName(info.path)}\\${stemOf(info.path)}_edited${extOf(info.path)}`,
        filters: [{ name: info.detect.label, extensions: [extOf(info.path).slice(1) || '*'] }]
      });
      if (res.canceled || !res.filePath) return;
      outputPath = res.filePath;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await window.darkhub.metax.write({ ...buildRequest(info.path), outputPath });
      setChecks(res.verification ?? null);
      if (!res.ok) {
        setStatus({ ok: false, msg: `${t('metax.saveFailed', 'Nada foi alterado')}: ${res.error}` });
        return;
      }
      if (res.unchanged) { setStatus({ ok: true, msg: t('metax.nothingChanged', 'Nada para alterar neste formato.') }); return; }
      const msg = [`${t('metax.saved', 'Salvo')}: ${res.path}`, describeChecks(res.verification)];
      if (res.backupPath) msg.push(`${t('metax.backupAt', 'Backup')}: ${res.backupPath}`);
      if (res.skipped?.length) msg.push(`${t('metax.skipped', 'Ignorados neste formato')}: ${res.skipped.join(', ')}`);
      const verification = res.verification ?? null;
      await load(res.path || info.path, true);
      setChecks(verification);
      setStatus({ ok: true, msg: msg.join(' · ') });
    } catch (err: any) {
      setStatus({ ok: false, msg: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  };

  // Same fields/options on other files: in place with .bak, or as "<name>_edited.<ext>" next to each file.
  const applyToOthers = async () => {
    if (!info || !pending) return;
    const res = await window.darkhub.dialog.selectFiles({ title: t('metax.batchTitle', 'Aplicar as mesmas alterações a outros arquivos'), filters: [{ name: t('metax.filterAll', 'Todos os arquivos'), extensions: ['*'] }] });
    if (res.canceled || !res.filePaths?.length) return;
    setBusy(true);
    setStatus(null);
    let ok = 0;
    const failed: string[] = [];
    for (const file of res.filePaths) {
      try {
        const req = buildRequest(file);
        req.rawTags = {};
        const out = saveAsCopy ? `${dirName(file)}\\${stemOf(file)}_edited${extOf(file)}` : null;
        const r = await window.darkhub.metax.write({ ...req, outputPath: out });
        if (r.ok) ok++; else failed.push(`${baseName(file)}: ${r.error}`);
      } catch (err: any) {
        failed.push(`${baseName(file)}: ${err?.message ?? err}`);
      }
    }
    setBusy(false);
    const summary = t('metax.batchDone', '{ok} de {n} arquivo(s) alterados e conferidos').replace('{ok}', String(ok)).replace('{n}', String(res.filePaths.length));
    setStatus({ ok: failed.length === 0, msg: failed.length ? `${summary} · ${failed.join(' · ')}` : summary });
  };

  const pickCover = async () => {
    const res = await window.darkhub.dialog.selectFiles({ title: t('metax.coverPick', 'Escolher capa (JPEG ou PNG)'), filters: [{ name: 'JPEG/PNG', extensions: ['jpg', 'jpeg', 'png'] }] });
    if (!res.canceled && res.filePaths?.[0]) setCover({ path: res.filePaths[0] });
  };

  const applyFsProps = async (props: { created?: number; modified?: number; accessed?: number; readOnly?: boolean; hidden?: boolean }) => {
    if (!info || !Object.keys(props).length) return;
    setBusy(true);
    try {
      const r = await window.darkhub.metax.setFileProps({ path: info.path, ...props });
      if (r.ok && r.fs) { setInfo({ ...info, fs: r.fs }); setStatus({ ok: true, msg: t('metax.fsApplied', 'Datas e atributos aplicados.') }); }
      else setStatus({ ok: false, msg: r.error || 'error' });
    } finally { setBusy(false); }
  };

  const removeStream = async (name: string) => {
    if (!info) return;
    if (!window.confirm(t('metax.streamConfirm', 'Remover o fluxo ":{name}" deste arquivo? Isso não pode ser desfeito.').replace('{name}', name))) return;
    setBusy(true);
    try {
      const r = await window.darkhub.metax.removeStream({ path: info.path, name });
      if (r.ok && r.fs) { setInfo({ ...info, fs: r.fs }); setStatus({ ok: true, msg: t('metax.streamRemoved', 'Fluxo removido.') }); }
      else setStatus({ ok: false, msg: r.error || 'error' });
    } finally { setBusy(false); }
  };

  const renderField = (f: MetaxField) => {
    const value = f.key in fieldEdits ? fieldEdits[f.key] : f.value;
    const dirty = f.key in dirtyFields;
    const cls = `dh-input w-full ${dirty ? 'border-blue-400/60' : ''}`;
    const set = (v: string) => setFieldEdits((prev) => ({ ...prev, [f.key]: v }));
    return (
      <div key={f.key} className="space-y-1">
        <label className="dh-label flex items-center gap-1.5">
          {fieldLabel(f.key)}
          {!f.writable && <Lock size={10} className="text-zinc-500" aria-label={t('metax.readOnly', 'somente leitura')} />}
        </label>
        {!f.writable ? (
          <div className="font-mono text-[12px] text-zinc-300 break-all min-h-[20px]">{f.value || '—'}</div>
        ) : f.kind === 'multiline' ? (
          <textarea value={value} onChange={(e) => set(e.target.value)} rows={2} className={`${cls} h-auto py-2 resize-y`} />
        ) : (
          <input type="text" value={value} onChange={(e) => set(e.target.value)} className={cls}
            placeholder={f.kind === 'date' ? 'AAAA-MM-DD HH:MM:SS' : f.kind === 'list' ? t('metax.listHint', 'separe por vírgula') : f.kind === 'year' ? 'AAAA' : undefined} />
        )}
      </div>
    );
  };

  const caps = info?.capabilities;
  const backendLabel = info?.backend ? t(BACKEND_LABELS[info.backend][0], BACKEND_LABELS[info.backend][1]) : t('metax.backendNone', 'Somente leitura (sem escritor seguro)');

  return (
    <div className="w-full max-w-6xl text-zinc-100" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <PageHeader
        title={t('metax.title', 'Editor de Metadados Universal')}
        subtitle={t('metax.subtitle', 'Leia e reescreva o cabeçalho de qualquer arquivo: imagens, áudio, vídeo, PDF, Office, executáveis e as propriedades do próprio arquivo no disco.')}
        actions={
          <button onClick={pickFile} disabled={busy} className={`dh-btn ${!info ? 'dh-btn-primary' : ''}`}>
            <FolderOpen size={16} />
            {t('metax.open', 'Abrir arquivo')}
          </button>
        }
      />

      {status && (
        <div className={`mb-4 flex items-start gap-3 text-[12.5px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {status.ok ? <Check size={14} className="shrink-0 mt-0.5" /> : <AlertCircle size={14} className="shrink-0 mt-0.5" />}
          <span className="min-w-0 break-all font-mono text-[12px]">{status.msg}</span>
          <button onClick={() => setStatus(null)} className="dh-btn dh-btn-ghost dh-btn-sm ml-auto shrink-0" aria-label={t('common.dismiss', 'Dispensar')}>
            <X size={14} />
          </button>
        </div>
      )}

      {!info ? (
        <section className="dh-card h-72 flex flex-col items-center justify-center gap-3 text-center px-6">
          <Layers size={28} className="text-zinc-600" />
          <p className="text-[12.5px] text-zinc-400 max-w-[60ch]">
            {busy ? t('metax.reading', 'Lendo metadados...') : t('metax.empty', 'Abra ou arraste qualquer arquivo. O tipo real é detectado pelos bytes iniciais; os campos com escritor seguro ficam editáveis e o resto aparece como somente leitura.')}
          </p>
          <button onClick={pickFile} disabled={busy} className="dh-btn dh-btn-sm">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
            {t('metax.open', 'Abrir arquivo')}
          </button>
        </section>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: detected type, main fields, options */}
          <section className="lg:col-span-2 dh-card p-4 space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="dh-tag">{t(FAMILY_LABELS[info.detect.family][0], FAMILY_LABELS[info.detect.family][1])}</span>
                <span className="dh-tag font-mono">{info.detect.label}</span>
                <span className="font-mono text-[11px] text-zinc-500">{fmtSize(info.detect.size)}</span>
              </div>
              <div className="text-[12px] font-mono text-zinc-300 truncate" title={info.path}>{baseName(info.path)}</div>
              <div className="text-[11.5px] text-zinc-500">{t('metax.writer', 'Escritor')}: <span className={info.backend ? 'text-zinc-300' : 'text-amber-400'}>{backendLabel}</span></div>
              {info.detect.extMismatch && (
                <div className="flex items-center gap-1.5 text-[11.5px] text-amber-400">
                  <AlertTriangle size={12} />
                  {t('metax.extMismatch', 'A extensão .{ext} não corresponde ao conteúdo real ({type}).').replace('{ext}', info.detect.ext).replace('{type}', info.detect.label)}
                </div>
              )}
            </div>

            {info.fields.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-zinc-800/80">
                <h3 className="dh-section-title">{t('metax.mainFields', 'Campos principais')}</h3>
                {info.fields.map(renderField)}
              </div>
            )}

            {caps?.cover && (
              <div className="space-y-2 pt-4 border-t border-zinc-800/80">
                <h3 className="dh-section-title">{t('metax.cover', 'Capa')}</h3>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden shrink-0">
                    {cover && 'remove' in cover ? <X size={18} className="text-zinc-600" />
                      : info.cover?.dataUrl && !cover ? <img src={info.cover.dataUrl} alt="" className="w-full h-full object-cover" />
                      : <ImageIcon size={18} className="text-zinc-600" />}
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <div className="text-[11.5px] text-zinc-400 truncate">
                      {cover && 'path' in cover ? baseName(cover.path) : cover ? t('metax.coverWillRemove', 'A capa será removida') : info.cover ? fmtSize(info.cover.size) : t('metax.coverNone', 'Sem capa')}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={pickCover} disabled={busy} className="dh-btn dh-btn-sm">{t('metax.coverReplace', 'Trocar capa')}</button>
                      {(info.cover || cover) && (
                        <button onClick={() => setCover(cover ? null : { remove: true })} disabled={busy} className="dh-btn dh-btn-ghost dh-btn-sm">
                          {cover ? t('metax.undo', 'Desfazer') : t('metax.coverRemove', 'Remover')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {info.backend && (
              <div className="space-y-2 pt-4 border-t border-zinc-800/80 text-[12.5px] text-zinc-300">
                <h3 className="dh-section-title">{t('metax.options', 'Opções')}</h3>
                {caps?.strip && (
                  <label className="flex items-start gap-2">
                    <input type="checkbox" className="mt-0.5" checked={strip} onChange={(e) => setStrip(e.target.checked)} />
                    <span>
                      {t('metax.strip', 'Remover todos os metadados')}
                      {caps.stripIncremental && <span className="block text-[11px] text-amber-400/90">{t('metax.stripPdfNote', 'Em PDF a remoção é feita por atualização incremental: os dados antigos continuam no arquivo e podem ser recuperados.')}</span>}
                    </span>
                  </label>
                )}
                {caps?.gps && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={removeGps} onChange={(e) => setRemoveGps(e.target.checked)} />
                    {t('metax.removeGps', 'Remover localização (GPS)')}
                    {info.gpsTags.length > 0 && <span className="dh-tag text-amber-400">{info.gpsTags.length} GPS</span>}
                  </label>
                )}
                <label className="flex items-center gap-2"><input type="checkbox" checked={saveAsCopy} onChange={(e) => setSaveAsCopy(e.target.checked)} />{t('metax.saveAsCopy', 'Salvar como cópia (não altera o original)')}</label>
                {!saveAsCopy && (
                  <label className="flex items-center gap-2 pl-5"><input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />{t('metax.keepBak', 'Manter backup .bak do original')}</label>
                )}
                <label className="flex items-center gap-2"><input type="checkbox" checked={preserveDates} onChange={(e) => setPreserveDates(e.target.checked)} />{t('metax.preserveDates', 'Manter datas de criação/modificação do arquivo')}</label>
              </div>
            )}

            <div className="pt-4 border-t border-zinc-800/80 space-y-2">
              <button onClick={save} disabled={!info.backend || !pending || busy} className={`dh-btn w-full ${pending ? 'dh-btn-primary' : ''}`}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : strip ? <Trash2 size={16} /> : <Save size={16} />}
                {strip ? t('metax.saveStrip', 'Remover metadados e verificar') : t('metax.save', 'Gravar e verificar')}
                {pending > 0 && <span className="font-mono text-[11px] opacity-80">({pending})</span>}
              </button>
              <button onClick={applyToOthers} disabled={!info.backend || !pending || busy} className="dh-btn dh-btn-ghost w-full">
                <Layers size={15} />
                {t('metax.batch', 'Aplicar a outros arquivos...')}
              </button>
              {!info.backend && <p className="dh-help">{t('metax.readOnlyFormat', 'Este formato é somente leitura aqui. Datas, atributos e fluxos do arquivo ainda podem ser editados na aba Arquivo.')}</p>}
            </div>

            {checks && checks.length > 0 && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-1">
                <h3 className="dh-section-title">{t('metax.verification', 'Verificação (releitura do arquivo gravado)')}</h3>
                {checks.map((c) => (
                  <div key={c.field} className="flex items-start gap-2 text-[11.5px]">
                    {c.ok ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0 mt-0.5" /> : <XCircle size={12} className="text-red-400 shrink-0 mt-0.5" />}
                    <span className="text-zinc-300">{c.field === 'gps' ? 'GPS' : c.field === 'cover' ? t('metax.cover', 'Capa') : fieldLabel(c.field)}</span>
                    <span className="font-mono text-zinc-500 break-all">{c.expected ? c.actual || '—' : c.ok ? t('metax.removed', 'removido') : c.actual}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Right: all tags / file system / hex */}
          <section className="lg:col-span-3 dh-card flex flex-col overflow-hidden">
            <div className="px-4 pt-3 flex items-center gap-1 border-b border-zinc-800/80">
              {([
                ['tags', t('metax.tabTags', 'Todas as tags')],
                ['file', t('metax.tabFile', 'Arquivo (NTFS)')],
                ['hex', t('metax.tabHex', 'Hex / assinatura')]
              ] as [Tab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} className={`px-3 py-2 text-[12.5px] border-b-2 -mb-px ${tab === id ? 'border-blue-400 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}>
                  {label}
                  {id === 'file' && info.fs.zone && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle" />}
                </button>
              ))}
            </div>
            {tab === 'tags' && (
              <MetaxTagsPanel groups={info.groups} edits={rawEdits} onEdit={(k, v) => setRawEdits((prev) => ({ ...prev, [k]: v }))} />
            )}
            {tab === 'file' && <MetaxFilePanel path={info.path} info={info.fs} busy={busy} onApply={applyFsProps} onRemoveStream={removeStream} />}
            {tab === 'hex' && (
              <div className="p-4 space-y-2 overflow-x-auto">
                <p className="text-[12px] text-zinc-400">
                  {t('metax.hexDetected', 'Assinatura detectada')}: <span className="text-zinc-200">{info.detect.label}</span> · <span className="font-mono">{info.detect.mime}</span>
                </p>
                <pre className="font-mono text-[11.5px] leading-5 text-zinc-300">
                  {info.hex.map((r) => `${r.offset.toString(16).padStart(8, '0')}  ${r.hex.padEnd(47, ' ')}  ${r.ascii}`).join('\n')}
                </pre>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
