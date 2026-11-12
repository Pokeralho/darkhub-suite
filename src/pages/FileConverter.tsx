import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Archive,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Trash2,
  RefreshCw,
  X
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
import PageHeader from '../components/ui/PageHeader';
import type { ConverterCapabilities, ConvertProgress, ConvertResult } from '../global';

type ConvertCategory = 'image' | 'audio' | 'video' | 'document' | 'archive';

/** Input extensions per category (mirrors electron/services/converter; used to route the queue instantly). */
export const IMAGE_EXTS = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif', 'svg', 'svgz', 'heic', 'heif', 'jxl', 'ico', 'cur', 'dds',
  'bmp', 'dib', 'tga', 'psd', 'exr', 'hdr', 'pcx', 'sgi', 'qoi', 'jp2', 'j2k', 'pbm', 'pgm', 'ppm', 'pnm', 'pam', 'pfm', 'xbm', 'xwd', 'ras', 'dpx',
  'cr2', 'cr3', 'crw', 'nef', 'nrw', 'arw', 'srf', 'sr2', 'dng', 'orf', 'rw2', 'raf', 'pef', 'srw', 'x3f', '3fr', 'erf', 'kdc', 'mrw', 'iiq', 'rwl', 'dcr'];
export const AUDIO_EXTS = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'oga', 'opus', 'wma', 'aiff', 'aif', 'ac3', 'eac3', 'dts', 'amr', 'ape', 'wv', 'mka', 'mid'];
export const VIDEO_EXTS = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'ts', 'm2ts', 'mts', 'm4v', 'mpg', 'mpeg', 'vob', '3gp', 'ogv', 'asf', 'f4v', 'rm', 'rmvb', 'divx'];
export const ARCHIVE_EXTS = ['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'rar', '7z'];
export const DOC_EXTS = ['pdf', 'doc', 'docx', 'docm', 'dot', 'dotx', 'odt', 'ott', 'fodt', 'rtf', 'wpd', 'wps', 'abw', 'lwp', 'hwp', 'pages', 'wri',
  'xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'ods', 'ots', 'fods', 'numbers', 'dbf', 'csv', 'tsv',
  'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'pot', 'potx', 'odp', 'otp', 'fodp', 'key',
  'vsd', 'vsdx', 'odg', 'cdr', 'pub', 'md', 'markdown', 'html', 'htm', 'xhtml', 'txt', 'log', 'epub', 'json', 'yaml', 'yml'];

const IMAGE_OUT = ['png', 'jpg', 'webp', 'avif', 'jxl', 'tiff', 'gif', 'bmp', 'ico', 'cur', 'dds', 'tga', 'exr', 'hdr', 'qoi', 'jp2', 'ppm', 'pcx'];
const IMAGE_TAG: Record<string, string> = { png: 'Lossless', webp: 'Web', avif: 'Next-Gen', jxl: 'Next-Gen', dds: 'Games', exr: 'HDR', hdr: 'HDR', ico: 'Icon', cur: 'Cursor' };
const VIDEO_OUT = ['mp4', 'mkv', 'webm', 'mov', 'm4v', 'ts', 'avi', 'wmv', 'flv', 'gif', 'mp3'];
const AUDIO_OUT = ['mp3', 'flac', 'wav', 'm4a', 'aac', 'opus', 'ogg', 'wma', 'aiff', 'ac3', 'alac'];
const LOSSY_IMAGE = ['jpg', 'webp', 'avif', 'jxl'];
const DDS_FORMATS = ['BC7', 'BC1', 'BC3', 'BC4', 'BC5', 'BC6H', 'RGBA'];

export function detectCategory(filePath: string): ConvertCategory {
  const lower = filePath.toLowerCase();
  if (/\.(tar\.gz|tar\.bz2|tar\.xz)$/.test(lower)) return 'archive';
  const ext = lower.split('.').pop() ?? '';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (AUDIO_EXTS.includes(ext)) return 'audio';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  if (ARCHIVE_EXTS.includes(ext)) return 'archive';
  return 'document';
}

const DEFAULT_TARGET: Record<ConvertCategory, string> = { image: 'png', audio: 'mp3', video: 'mp4', document: 'pdf', archive: 'zip' };

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
const extOf = (f: string) => (f.split(/[\\/]/).pop() ?? '').split('.').pop()?.toLowerCase() ?? '';
const fmtBytes = (n?: number | null) => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const FileConverter = () => {
  const { t } = useI18n();
  const [inputFiles, setInputFiles] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [category, setCategory] = useState<ConvertCategory>('image');
  const [targetFormat, setTargetFormat] = useState<string>('png');
  const [caps, setCaps] = useState<ConverterCapabilities | null>(null);
  const [docTargets, setDocTargets] = useState<string[]>([]);
  // image
  const [quality, setQuality] = useState<number>(85);
  const [lossless, setLossless] = useState(false);
  const [resizeW, setResizeW] = useState('');
  const [resizeH, setResizeH] = useState('');
  const [keepMeta, setKeepMeta] = useState(false);
  const [ddsFormat, setDdsFormat] = useState('BC7');
  const [srgb, setSrgb] = useState(true);
  const [mipmaps, setMipmaps] = useState(true);
  // media
  const [codec, setCodec] = useState<'auto' | 'h264' | 'hevc' | 'av1' | 'vp9'>('auto');
  const [preset, setPreset] = useState<'fast' | 'balanced' | 'high'>('balanced');
  const [maxHeight, setMaxHeight] = useState(0);
  const [maxFps, setMaxFps] = useState(0);
  const [encoderPref, setEncoderPref] = useState<'auto' | 'gpu' | 'cpu'>('auto');
  const [allowCopy, setAllowCopy] = useState(true);
  const [responsive, setResponsive] = useState(true);
  const [audioBitrate, setAudioBitrate] = useState<string>('320k');
  const [gifFps, setGifFps] = useState<number>(15);
  const [gifWidth, setGifWidth] = useState<number>(480);
  // run state
  const [isConverting, setIsConverting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<Record<number, ConvertProgress>>({});
  const [results, setResults] = useState<ConvertResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef<string | null>(null);

  useEffect(() => {
    window.darkhub?.files?.converterCapabilities?.().then(setCaps).catch(() => {});
  }, []);

  useEffect(() => {
    const off = window.darkhub?.files?.onConvertProgress?.((info) => {
      if (info.jobId !== jobRef.current) return;
      setProgress((prev) => ({ ...prev, [info.index]: info }));
    });
    return () => { off?.(); };
  }, []);

  // Document targets depend on what is in the queue (Word, Excel, PDF, Markdown... each reach different formats).
  useEffect(() => {
    if (category !== 'document') return;
    const exts = Array.from(new Set(inputFiles.map(extOf)));
    if (!exts.length) { setDocTargets([]); return; }
    window.darkhub?.files?.docTargets?.(exts).then((r) => {
      const outs = r?.outputs ?? [];
      setDocTargets(outs);
      setTargetFormat((cur) => (outs.includes(cur) ? cur : outs[0] ?? cur));
    }).catch(() => setDocTargets([]));
  }, [category, inputFiles]);

  const getDir = (filePath: string) => {
    const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
    return idx !== -1 ? filePath.slice(0, idx) : null;
  };

  const applyFiles = (paths: string[]) => {
    if (!paths.length) return;
    setInputFiles((prev) => Array.from(new Set([...prev, ...paths])));
    const firstCat = detectCategory(paths[0]);
    if (inputFiles.length === 0 || firstCat !== category) {
      setCategory(firstCat);
      setTargetFormat(DEFAULT_TARGET[firstCat]);
    }
    const dir = getDir(paths[0]);
    if (dir && !outputDir) setOutputDir(dir);
    setResults(null);
    setError(null);
  };

  const handlePickFiles = async () => {
    if (!window.darkhub?.dialog?.selectFiles) return;
    const res = await window.darkhub.dialog.selectFiles({
      title: t('conv.pickTitle', 'Selecionar arquivos para conversão'),
      filters: [{ name: t('conv.filterAll', 'Todos os formatos suportados'), extensions: [...IMAGE_EXTS, ...AUDIO_EXTS, ...VIDEO_EXTS, ...DOC_EXTS, ...ARCHIVE_EXTS] }]
    });
    if (!res?.canceled && Array.isArray(res.filePaths) && res.filePaths.length) applyFiles(res.filePaths);
  };

  const handlePickOutputDir = async () => {
    if (!window.darkhub?.dialog?.selectFolder) return;
    const res = await window.darkhub.dialog.selectFolder({ title: t('conv.outDirTitle', 'Selecionar pasta de saída') });
    if (!res?.canceled && res.folderPath) {
      setOutputDir(res.folderPath);
      setError(null);
    }
  };

  const handleCancel = useCallback(async () => {
    if (!jobRef.current) return;
    setCancelling(true);
    await window.darkhub?.files?.cancelConvert?.(jobRef.current);
  }, []);

  const handleConvert = async () => {
    if (!window.darkhub?.files) return;
    if (!inputFiles.length) { setError(t('conv.errNoFiles', 'Adicione pelo menos um arquivo na fila.')); return; }
    if (!outputDir) { setError(t('conv.errNoDir', 'Selecione uma pasta de destino para salvar os arquivos convertidos.')); return; }
    if (category === 'document' && !docTargets.includes(targetFormat)) { setError(t('conv.errNoTarget', 'Nenhum formato de saída serve para todos os arquivos da fila.')); return; }

    const jobId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    jobRef.current = jobId;
    setIsConverting(true);
    setCancelling(false);
    setError(null);
    setResults(null);
    setProgress({});
    const base = { inputFiles, outputDir, outputFormat: targetFormat, jobId };

    try {
      if (category === 'archive') {
        if (targetFormat === 'extract') {
          const res = await window.darkhub.files.archiveOperation({ action: 'extract', inputFiles, extractDir: outputDir });
          setResults([{ inputFile: inputFiles[0], outputFile: outputDir, ok: Boolean(res?.ok), error: res?.error }]);
        } else {
          const archiveOut = `${outputDir}\\DarkHub_Archive_${Date.now()}.${targetFormat === 'tar.gz' ? 'tar.gz' : 'zip'}`;
          const res = await window.darkhub.files.archiveOperation({ action: 'compress', inputFiles, outputArchive: archiveOut });
          setResults([{ inputFile: fill(t('conv.arc.files', '{n} arquivos'), { n: inputFiles.length }), outputFile: archiveOut, ok: Boolean(res?.ok), error: res?.error }]);
        }
      } else if (category === 'image') {
        const w = Number(resizeW) || undefined;
        const h = Number(resizeH) || undefined;
        setResults(await window.darkhub.files.convertImages({ ...base, quality, lossless, width: w, height: h, keepMetadata: keepMeta, ddsFormat, srgb, mipmaps }));
      } else if (category === 'document') {
        setResults(await window.darkhub.files.convertDocuments(base));
      } else {
        setResults(await window.darkhub.files.convertMedia({
          ...base, codec, quality: preset, maxHeight, maxFps, encoderPref, copy: allowCopy ? 'auto' : 'never',
          audioBitrate, gifFps, gifWidth, responsive
        }));
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setIsConverting(false);
      setCancelling(false);
      jobRef.current = null;
    }
  };

  const removeFile = (index: number) => {
    setInputFiles((prev) => prev.filter((_, i) => i !== index));
    setResults(null);
  };

  const clearQueue = () => {
    setInputFiles([]);
    setResults(null);
    setError(null);
    setProgress({});
  };

  const currentFormats = useMemo(() => {
    const item = (ext: string, key: string, tag?: string) => ({ ext, name: ext.toUpperCase(), desc: t(key, ''), tag });
    if (category === 'image') return IMAGE_OUT.map((e) => item(e, `conv.fmt.${e}`, IMAGE_TAG[e]));
    if (category === 'audio') return AUDIO_OUT.map((e) => item(e, `conv.fmt.${e}`));
    if (category === 'video') {
      return VIDEO_OUT.map((e) => (e === 'gif' ? { ...item(e, 'conv.fmt.vgif'), name: 'GIF' } : e === 'mp3' ? { ...item(e, 'conv.fmt.vmp3'), name: 'MP3' } : item(e, `conv.fmt.${e}`)));
    }
    if (category === 'document') return docTargets.map((e) => item(e, `conv.doc.${e}`));
    return [
      { ext: 'zip', name: t('conv.arc.zip', 'Compactar em ZIP'), desc: t('conv.arc.zipDesc', ''), tag: 'ZIP' },
      { ext: 'tar.gz', name: t('conv.arc.targz', 'Compactar em TAR.GZ'), desc: t('conv.arc.targzDesc', ''), tag: 'TAR.GZ' },
      { ext: 'extract', name: t('conv.arc.extract', 'Extrair'), desc: t('conv.arc.extractDesc', ''), tag: 'Extract' }
    ];
  }, [category, docTargets, t]);

  const categories: { id: ConvertCategory; icon: React.ReactNode; label: string }[] = [
    { id: 'image', icon: <ImageIcon size={16} />, label: t('conv.cat.image', 'Imagens') },
    { id: 'audio', icon: <Music size={16} />, label: t('conv.cat.audio', 'Áudio') },
    { id: 'video', icon: <Video size={16} />, label: t('conv.cat.video', 'Vídeo e GIF') },
    { id: 'document', icon: <FileText size={16} />, label: t('conv.cat.document', 'Documentos') },
    { id: 'archive', icon: <Archive size={16} />, label: t('conv.cat.archive', 'Compactador') }
  ];

  const chip = (active: boolean) =>
    `h-7 px-2 text-xs font-mono rounded-md border transition-colors ${
      active ? 'border-blue-400/70 bg-zinc-800/60 text-zinc-50' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
    }`;

  const hwList = caps?.hwEncoders ?? [];
  const engineNote = (() => {
    if (!caps) return null;
    if (category === 'video' || category === 'audio') {
      return hwList.length
        ? fill(t('conv.engine.gpuFound', 'GPU detectada: {list}'), { list: hwList.join(', ') })
        : t('conv.engine.gpuNone', 'Nenhum codificador de GPU funcionou neste PC; vídeos usam a CPU.');
    }
    if (category === 'document') {
      if (!caps.libreoffice.available) return t('conv.engine.loMissing', 'LibreOffice embutido ausente nesta build.');
      return caps.libreoffice.bundled ? t('conv.engine.loBundled', 'LibreOffice embutido pronto') : t('conv.engine.loInstalled', 'Usando o LibreOffice instalado no Windows');
    }
    return null;
  })();

  const toggle = (checked: boolean, onChange: (v: boolean) => void, label: string, id: string) => (
    <label htmlFor={id} className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-blue-400" />
      <span>{label}</span>
    </label>
  );

  const doneCount = Object.values(progress).filter((p) => p.stage === 'done' || p.stage === 'error').length;

  return (
    <div className="w-full space-y-6 pb-12">
      <PageHeader
        title={t('conv.title', 'Conversor Universal de Arquivos')}
        subtitle={t('conv.subtitle', 'Imagens, vídeos, áudios, documentos, planilhas, apresentações e e-books, tudo no seu PC e sem instalar nada.')}
        actions={
          <HelpTip
            title={t('conv.help.title', 'Conversor Universal')}
            description={t('conv.help.desc', '')}
            sections={[
              { title: t('conv.help.gpu.title', 'GPU primeiro'), content: t('conv.help.gpu.desc', '') },
              { title: t('conv.help.copy.title', 'Sem recodificar'), content: t('conv.help.copy.desc', '') },
              { title: t('conv.help.docs.title', 'Documentos sem instalar nada'), content: t('conv.help.docs.desc', '') }
            ]}
            buttonLabel={t('conv.help.button', 'Guia')}
          />
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 rounded-lg border border-zinc-800" role="tablist">
        {categories.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active}
              disabled={isConverting}
              onClick={() => { setCategory(c.id); setTargetFormat(DEFAULT_TARGET[c.id]); }}
              className={`flex items-center justify-center gap-2 h-8 px-3 rounded-md text-[12.5px] font-medium transition-colors ${
                active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <span className={active ? 'text-blue-300' : 'text-zinc-500'}>{c.icon}</span>
              <span>{c.label}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-4">
          <div
            role="button"
            tabIndex={0}
            className="px-6 py-8 rounded-xl border border-dashed border-zinc-800 hover:border-zinc-700 transition-colors flex flex-col items-center justify-center text-center gap-3 cursor-pointer"
            onClick={handlePickFiles}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlePickFiles(); } }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const res = await window.darkhub?.dialog?.grantDroppedFiles?.(e.dataTransfer.files);
              if (res?.granted?.length) applyFiles(res.granted);
            }}
          >
            <p className="text-[12.5px] text-zinc-400">{t('conv.drop', 'Arraste e solte arquivos aqui.')}</p>
            <button type="button" className="dh-btn dh-btn-sm">
              <FolderOpen size={14} />
              {t('conv.pick', 'Selecionar arquivos')}
            </button>
          </div>

          <section className="dh-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="dh-section-title">
                {t('conv.queue', 'Fila de arquivos')} <span className="font-mono text-zinc-500 font-normal">{inputFiles.length}</span>
              </h2>
              {inputFiles.length > 0 && !isConverting && (
                <button onClick={clearQueue} className="dh-btn dh-btn-ghost dh-btn-sm hover:!text-red-300">
                  <Trash2 size={14} />
                  {t('conv.clear', 'Limpar fila')}
                </button>
              )}
            </div>

            {inputFiles.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-zinc-500">{t('conv.empty', 'Nenhum arquivo adicionado ainda.')}</p>
            ) : (
              <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-zinc-800/80 border-y border-zinc-800/80">
                {inputFiles.map((file, idx) => {
                  const filename = file.split(/[\\/]/).pop();
                  const p = progress[idx];
                  const pct = p?.stage === 'done' ? 100 : p?.percent ?? null;
                  return (
                    <div key={file} className="py-2 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="dh-tag w-12 shrink-0 text-center">{extOf(file)}</span>
                          <span className="text-zinc-200 truncate select-text" title={file}>{filename}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {p && p.stage === 'encode' && (
                            <span className="font-mono text-[11px] text-zinc-400">
                              {pct != null ? `${pct.toFixed(0)}%` : t('conv.progress.encode', 'Convertendo')}
                              {p.speed ? ` · ${fill(t('conv.progress.speed', '{x}x'), { x: p.speed.toFixed(1) })}` : ''}
                              {p.copy ? ` · ${t('conv.copyBadge', 'cópia')}` : p.hardware ? ` · ${t('conv.gpuBadge', 'GPU')}` : ''}
                            </span>
                          )}
                          {p?.stage === 'probe' && <span className="text-[11px] text-zinc-500">{t('conv.progress.probe', 'Analisando...')}</span>}
                          {!isConverting && (
                            <button
                              onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                              aria-label={t('conv.remove', 'Remover')}
                              title={t('conv.remove', 'Remover')}
                              className="dh-btn dh-btn-ghost dh-btn-sm !px-1.5 hover:!text-red-300"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                      {isConverting && p && (p.stage === 'encode' || p.stage === 'done') && (
                        <div className="h-1 rounded bg-zinc-900 overflow-hidden" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
                          <div className={`h-full bg-blue-400/80 transition-[width] duration-300 ${pct == null ? 'w-1/3 animate-pulse' : ''}`} style={pct != null ? { width: `${pct}%` } : undefined} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-1 flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="dh-label block mb-1">{t('conv.outDir', 'Pasta de destino')}:</span>
                <span className={`font-mono text-xs truncate block select-text ${outputDir ? 'text-zinc-300' : 'text-zinc-500'}`} title={outputDir || undefined}>
                  {outputDir || t('conv.outDirNone', 'Nenhuma pasta selecionada (clique ao lado)')}
                </span>
              </div>
              <button onClick={handlePickOutputDir} disabled={isConverting} className="dh-btn dh-btn-sm shrink-0">
                <FolderOpen size={14} />
                {t('conv.outDirPick', 'Alterar pasta')}
              </button>
            </div>
          </section>
        </div>

        <div className="lg:col-span-5">
          <section className="dh-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="dh-section-title">{t('conv.output', 'Formato de saída')}</h2>
              <span className="dh-tag">{category}</span>
            </div>
            {engineNote && <p className="text-[11.5px] text-zinc-500">{engineNote}</p>}

            {category === 'document' && docTargets.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-zinc-500">
                {inputFiles.length ? t('conv.errNoTarget', 'Nenhum formato de saída serve para todos os arquivos da fila.') : t('conv.docPickFirst', 'Adicione arquivos para ver os formatos possíveis.')}
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto pr-1 custom-scrollbar space-y-1" role="radiogroup">
                {currentFormats.map((fmt) => {
                  const isSelected = targetFormat === fmt.ext;
                  return (
                    <button
                      key={fmt.ext}
                      role="radio"
                      aria-checked={isSelected}
                      disabled={isConverting}
                      onClick={() => setTargetFormat(fmt.ext)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                        isSelected ? 'border-blue-400/70 bg-zinc-800/60 text-zinc-50' : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[13px] font-medium">{fmt.name}</span>
                          {fmt.tag && <span className="dh-tag">{fmt.tag}</span>}
                        </div>
                        {fmt.desc && <p className="text-xs text-zinc-500 mt-0.5">{fmt.desc}</p>}
                      </div>
                      {isSelected && <CheckCircle2 size={16} className="text-blue-300 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            {category === 'image' && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                {LOSSY_IMAGE.includes(targetFormat) && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label htmlFor="fc-quality" className="dh-label">{t('conv.opt.quality', 'Qualidade')}</label>
                      <span className="font-mono text-xs text-zinc-100">{lossless ? '-' : quality}</span>
                    </div>
                    <input id="fc-quality" type="range" min="20" max="100" value={quality} disabled={lossless} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
                    {targetFormat !== 'jpg' && toggle(lossless, setLossless, t('conv.opt.lossless', 'Sem perdas'), 'fc-lossless')}
                  </div>
                )}
                {targetFormat === 'dds' && (
                  <div className="space-y-2">
                    <label htmlFor="fc-dds" className="dh-label block">{t('conv.opt.ddsFormat', 'Compressão DDS')}</label>
                    <select id="fc-dds" value={ddsFormat} onChange={(e) => setDdsFormat(e.target.value)} className="dh-input w-full h-8 text-xs">
                      {DDS_FORMATS.filter((f) => !caps || caps.ddsFormats.includes(f)).map((f) => (
                        <option key={f} value={f}>{t(`conv.opt.dds.${f}`, f)}</option>
                      ))}
                    </select>
                    {toggle(srgb, setSrgb, t('conv.opt.srgb', 'Cor sRGB'), 'fc-srgb')}
                    {toggle(mipmaps, setMipmaps, t('conv.opt.mipmaps', 'Gerar mipmaps'), 'fc-mips')}
                  </div>
                )}
                {!['ico', 'cur'].includes(targetFormat) && (
                  <div className="space-y-1.5">
                    <span className="dh-label block">{t('conv.opt.resize', 'Redimensionar')}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <input aria-label={t('conv.opt.width', 'Largura')} placeholder={t('conv.opt.width', 'Largura')} inputMode="numeric" value={resizeW} onChange={(e) => setResizeW(e.target.value.replace(/\D/g, '').slice(0, 5))} className="dh-input h-8 text-xs font-mono" />
                      <input aria-label={t('conv.opt.height', 'Altura')} placeholder={t('conv.opt.height', 'Altura')} inputMode="numeric" value={resizeH} onChange={(e) => setResizeH(e.target.value.replace(/\D/g, '').slice(0, 5))} className="dh-input h-8 text-xs font-mono" />
                    </div>
                  </div>
                )}
                {toggle(keepMeta, setKeepMeta, t('conv.opt.keepMeta', 'Manter metadados'), 'fc-meta')}
              </div>
            )}

            {category === 'video' && targetFormat !== 'gif' && targetFormat !== 'mp3' && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                <div className="space-y-1.5">
                  <span className="dh-label block">{t('conv.opt.codec', 'Codec de vídeo')}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(['auto', 'h264', 'hevc', 'av1', 'vp9'] as const)
                      .filter((c) => c === 'auto' || (targetFormat === 'webm' ? ['vp9', 'av1'].includes(c) : ['mp4', 'mkv'].includes(targetFormat) ? ['h264', 'hevc', 'av1'].includes(c) : ['mov', 'm4v', 'ts'].includes(targetFormat) ? ['h264', 'hevc'].includes(c) : false))
                      .map((c) => (
                        <button key={c} onClick={() => setCodec(c)} aria-pressed={codec === c} className={chip(codec === c)}>
                          {c === 'auto' ? t('conv.opt.codecAuto', 'Automático') : c.toUpperCase()}
                        </button>
                      ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="dh-label block">{t('conv.opt.preset', 'Velocidade e qualidade')}</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['fast', 'balanced', 'high'] as const).map((p) => (
                      <button key={p} onClick={() => setPreset(p)} aria-pressed={preset === p} className={chip(preset === p)}>{t(`conv.opt.preset.${p}`, p)}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="fc-res" className="dh-label block">{t('conv.opt.resolution', 'Resolução máxima')}</label>
                    <select id="fc-res" value={maxHeight} onChange={(e) => setMaxHeight(Number(e.target.value))} className="dh-input w-full h-8 text-xs">
                      <option value={0}>{t('conv.opt.source', 'Original')}</option>
                      {[2160, 1440, 1080, 720, 480].map((h) => <option key={h} value={h}>{h}p</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="fc-fps" className="dh-label block">{t('conv.opt.fps', 'FPS máximo')}</label>
                    <select id="fc-fps" value={maxFps} onChange={(e) => setMaxFps(Number(e.target.value))} className="dh-input w-full h-8 text-xs">
                      <option value={0}>{t('conv.opt.source', 'Original')}</option>
                      {[60, 30, 24].map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="fc-enc" className="dh-label block">{t('conv.opt.encoder', 'Codificador')}</label>
                  <select id="fc-enc" value={encoderPref} onChange={(e) => setEncoderPref(e.target.value as 'auto' | 'gpu' | 'cpu')} className="dh-input w-full h-8 text-xs">
                    <option value="auto">{t('conv.opt.encoder.auto', 'Automático (GPU, depois CPU)')}</option>
                    <option value="gpu" disabled={caps != null && hwList.length === 0}>{t('conv.opt.encoder.gpu', 'Só GPU')}</option>
                    <option value="cpu">{t('conv.opt.encoder.cpu', 'Só CPU')}</option>
                  </select>
                </div>
                {toggle(allowCopy, setAllowCopy, t('conv.opt.copy', 'Copiar sem recodificar quando possível'), 'fc-copy')}
                {toggle(responsive, setResponsive, t('conv.opt.responsive', 'Manter o PC responsivo'), 'fc-resp')}
              </div>
            )}

            {(category === 'audio' || (category === 'video' && targetFormat === 'mp3')) && ['mp3', 'aac', 'm4a', 'opus', 'ogg', 'wma', 'ac3'].includes(targetFormat) && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="dh-label">{t('conv.opt.bitrate', 'Bitrate de áudio')}</span>
                  <span className="font-mono text-xs text-zinc-100">{audioBitrate}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {['128k', '192k', '256k', '320k'].map((br) => (
                    <button key={br} onClick={() => setAudioBitrate(br)} aria-pressed={audioBitrate === br} className={chip(audioBitrate === br)}>{br}</button>
                  ))}
                </div>
                {category === 'audio' && toggle(allowCopy, setAllowCopy, t('conv.opt.copy', 'Copiar sem recodificar quando possível'), 'fc-copy-a')}
              </div>
            )}

            {category === 'video' && targetFormat === 'gif' && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-3">
                <div className="space-y-1.5">
                  <span className="dh-label block">{t('conv.opt.gifFps', 'Quadros por segundo do GIF')}</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[10, 15, 20, 24].map((f) => (
                      <button key={f} onClick={() => setGifFps(f)} aria-pressed={gifFps === f} className={chip(gifFps === f)}>{f}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span className="dh-label block">{t('conv.opt.gifWidth', 'Largura do GIF')}</span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[320, 480, 640, 800].map((w) => (
                      <button key={w} onClick={() => setGifWidth(w)} aria-pressed={gifWidth === w} className={chip(gifWidth === w)}>{w}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isConverting ? (
              <div className="flex gap-2">
                <div className="dh-btn dh-btn-primary flex-1 pointer-events-none" aria-live="polite">
                  <RefreshCw className="animate-spin" size={14} />
                  <span>
                    {fill(t('conv.converting', 'Convertendo {n} arquivo(s)...'), { n: inputFiles.length })}
                    {inputFiles.length > 1 && <span className="font-mono"> {doneCount}/{inputFiles.length}</span>}
                  </span>
                </div>
                {category !== 'archive' && (
                  <button onClick={handleCancel} disabled={cancelling} className="dh-btn shrink-0 hover:!text-red-300">
                    <X size={14} />
                    {cancelling ? t('conv.cancelling', 'Cancelando...') : t('conv.cancel', 'Cancelar')}
                  </button>
                )}
              </div>
            ) : (
              <button onClick={handleConvert} disabled={!inputFiles.length || (category === 'document' && !docTargets.length)} className="dh-btn dh-btn-primary w-full">
                <span>{t('conv.convert', 'Converter agora')}</span>
                <ArrowRight size={14} />
              </button>
            )}
          </section>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-red-300">
          <AlertCircle size={14} className="shrink-0" />
          <span className="min-w-0">{error}</span>
          {inputFiles.length > 0 && outputDir && !isConverting && (
            <button onClick={handleConvert} className="dh-btn dh-btn-ghost dh-btn-sm">{t('conv.retry', 'Tentar novamente')}</button>
          )}
        </div>
      )}

      {results && results.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="dh-section-title">
              {t('conv.results', 'Resultado da conversão')}{' '}
              <span className="font-normal text-zinc-500">({fill(t('conv.resultsCount', '{ok} de {total} concluídos'), { ok: results.filter((r) => r.ok).length, total: results.length })})</span>
            </h2>
            {outputDir && (
              <span className="text-xs text-zinc-500 truncate max-w-full">
                {t('conv.savedIn', 'Salvo em:')} <span className="font-mono select-text">{outputDir}</span>
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-800/80 max-h-60 overflow-y-auto custom-scrollbar border-y border-zinc-800/80">
            {results.map((r, i) => (
              <div key={i} className="py-2.5 text-xs flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-zinc-200 truncate select-text">{r.inputFile}</div>
                  <div className="text-zinc-500 truncate font-mono text-[11px] mt-0.5 select-text">
                    {r.outputFile}
                    {r.outputs && r.outputs.length > 1 ? ` (+${r.outputs.length - 1})` : ''}
                  </div>
                </div>
                <div className="shrink-0 max-w-[45%] text-right space-y-0.5">
                  {r.ok ? (
                    <>
                      <span className="text-emerald-300 text-[11px]">{t('conv.ok', 'Concluído')}</span>
                      <div className="font-mono text-[10.5px] text-zinc-500">
                        {[r.copy ? t('conv.copyBadge', 'cópia sem recodificar') : r.encoder ? `${r.hardware ? t('conv.gpuBadge', 'GPU') : t('conv.cpuBadge', 'CPU')} ${r.encoder}` : r.engine,
                          r.seconds != null ? `${r.seconds.toFixed(1)}s` : '', fmtBytes(r.bytes)].filter(Boolean).join(' · ')}
                      </div>
                    </>
                  ) : r.cancelled ? (
                    <span className="text-zinc-400 text-[11px]">{t('conv.cancelled', 'Cancelado')}</span>
                  ) : (
                    <span className="text-red-300 text-[11px] break-words">{r.error || t('conv.error', 'Erro')}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default FileConverter;
