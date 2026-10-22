import React, { useState, useMemo } from 'react';
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
  RefreshCw
} from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
import PageHeader from '../components/ui/PageHeader';

type ConvertCategory = 'image' | 'audio' | 'video' | 'document' | 'archive';

interface FormatOption {
  ext: string;
  name: string;
  desc: string;
  tag?: string;
}

const FORMAT_MAP: Record<ConvertCategory, FormatOption[]> = {
  image: [
    { ext: 'png', name: 'PNG', desc: 'Sem perdas com suporte a transparência (Lossless)', tag: 'Lossless' },
    { ext: 'jpg', name: 'JPEG / JPG', desc: 'Fotografia com alta taxa de compressão', tag: 'Padrão' },
    { ext: 'webp', name: 'WebP (Google)', desc: 'Ultra-otimizado para web e alta fidelidade', tag: 'Recomendado' },
    { ext: 'avif', name: 'AVIF (Next-Gen)', desc: 'Nova geração com máxima economia de dados', tag: 'Next-Gen' },
    { ext: 'ico', name: 'ICO (Ícone)', desc: 'Ícone de aplicativo para Windows (256x256)', tag: 'Icon' },
    { ext: 'tiff', name: 'TIFF', desc: 'Fidelidade máxima para impressão e edição', tag: 'Print' },
    { ext: 'bmp', name: 'BMP', desc: 'Formato bitmap bruto sem compressão', tag: 'Raw' },
    { ext: 'gif', name: 'GIF', desc: 'Animação ou paleta de 256 cores', tag: 'Anim' }
  ],
  audio: [
    { ext: 'mp3', name: 'MP3', desc: 'Padrão universal (libmp3lame até 320kbps)', tag: 'Universal' },
    { ext: 'wav', name: 'WAV', desc: 'Áudio PCM 16-bit sem compressão de estúdio', tag: 'Studio' },
    { ext: 'flac', name: 'FLAC', desc: 'Compressão 100% sem perdas (Lossless Audiophile)', tag: 'Lossless' },
    { ext: 'm4a', name: 'M4A / AAC', desc: 'Alta eficiência de codificação para Apple e Web', tag: 'High-Bitrate' },
    { ext: 'ogg', name: 'OGG Vorbis', desc: 'Codec aberto de alta performance', tag: 'Open-Source' },
    { ext: 'opus', name: 'OPUS', desc: 'Baixa latência com clareza cristalina', tag: 'Ultra-Low-Bitrate' },
    { ext: 'wma', name: 'WMA', desc: 'Windows Media Audio', tag: 'Legacy' }
  ],
  video: [
    { ext: 'mp4', name: 'MP4 (H.264 / AAC)', desc: 'Máxima compatibilidade universal com players e web', tag: 'Universal' },
    { ext: 'webm', name: 'WebM (VP9 / Opus)', desc: 'Vídeo moderno de alta eficiência para web e streaming', tag: 'Web' },
    { ext: 'mkv', name: 'MKV (Matroska)', desc: 'Container flexível para múltiplas faixas e legendas', tag: 'Master' },
    { ext: 'avi', name: 'AVI (Xvid)', desc: 'Formato legado clássico', tag: 'Legacy' },
    { ext: 'mov', name: 'MOV (QuickTime)', desc: 'Formato nativo para ecossistemas Apple e Premiere', tag: 'Apple' },
    { ext: 'wmv', name: 'WMV', desc: 'Windows Media Video para players clássicos', tag: 'Windows' },
    { ext: 'gif', name: 'GIF Animado', desc: 'Transforma trecho de vídeo em GIF com paleta otimizada', tag: 'Animation' },
    { ext: 'mp3', name: 'Extrair Áudio (MP3)', desc: 'Separa e extrai a trilha sonora do vídeo em MP3 320k', tag: 'Audio Only' }
  ],
  document: [
    { ext: 'txt', name: 'PDF para Texto (.txt)', desc: 'Extrai texto bruto de documentos PDF via parser', tag: 'PDF to TXT' },
    { ext: 'html', name: 'Markdown para HTML (.html)', desc: 'Converte notas Markdown (.md) em página web estilizada', tag: 'MD to HTML' },
    { ext: 'json', name: 'CSV para JSON (.json)', desc: 'Converte tabelas/planilhas CSV em array de objetos JSON', tag: 'CSV to JSON' },
    { ext: 'csv', name: 'JSON para CSV (.csv)', desc: 'Converte objetos JSON em planilha CSV delimitada', tag: 'JSON to CSV' },
    { ext: 'xml', name: 'JSON para XML (.xml)', desc: 'Gera estrutura de tags XML a partir de dados JSON', tag: 'JSON to XML' },
    { ext: 'pdf', name: 'Documento para PDF (LibreOffice)', desc: 'Converte DOCX, DOC, ODT, RTF em documento PDF', tag: 'Office' }
  ],
  archive: [
    { ext: 'zip', name: 'Compactar em ZIP (.zip)', desc: 'Cria arquivo compactado padrão Windows', tag: 'Compress' },
    { ext: 'tar.gz', name: 'Compactar em TAR.GZ (.tar.gz)', desc: 'Formato de alta compressão Unix/Linux', tag: 'Compress' },
    { ext: 'extract', name: 'Extrair Arquivo (Descompactar)', desc: 'Extrai arquivos .zip, .tar, .gz para a pasta de destino', tag: 'Extract' }
  ]
};

const FileConverter = () => {
  const { t } = useI18n();
  const [inputFiles, setInputFiles] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [category, setCategory] = useState<ConvertCategory>('image');
  const [targetFormat, setTargetFormat] = useState<string>('png');
  const [quality, setQuality] = useState<number>(85);
  const [audioBitrate, setAudioBitrate] = useState<string>('320k');
  const [gifFps, setGifFps] = useState<number>(15);
  const [isConverting, setIsConverting] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detectCategory = (filePath: string): ConvertCategory => {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'avif', 'svg', 'ico', 'heic'].includes(ext)) return 'image';
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aiff'].includes(ext)) return 'audio';
    if (['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'ts', 'm4v'].includes(ext)) return 'video';
    if (['zip', 'tar', 'gz', 'tgz', 'rar', '7z'].includes(ext)) return 'archive';
    return 'document';
  };

  const getDir = (filePath: string) => {
    const idx = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
    return idx !== -1 ? filePath.slice(0, idx) : null;
  };

  const applyFiles = (paths: string[]) => {
    if (!paths.length) return;
    setInputFiles(prev => Array.from(new Set([...prev, ...paths])));
    const firstCat = detectCategory(paths[0]);
    setCategory(firstCat);
    if (firstCat === 'image') setTargetFormat('png');
    else if (firstCat === 'audio') setTargetFormat('mp3');
    else if (firstCat === 'video') setTargetFormat('mp4');
    else if (firstCat === 'document') setTargetFormat('txt');
    else if (firstCat === 'archive') setTargetFormat('zip');

    const dir = getDir(paths[0]);
    if (dir && !outputDir) setOutputDir(dir);
    setResults(null);
    setError(null);
  };

  const handlePickFiles = async () => {
    if (!window.darkhub?.dialog?.selectFiles) return;
    const res = await window.darkhub.dialog.selectFiles({
      title: t('converter.browse', 'Selecionar Arquivos para Conversão'),
      filters: [
        {
          name: 'Todos os Arquivos Suportados',
          extensions: [
            'jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'bmp', 'gif', 'avif', 'svg', 'ico', 'heic',
            'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma',
            'mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv',
            'pdf', 'csv', 'json', 'xml', 'md', 'html', 'docx', 'doc', 'odt', 'rtf', 'txt',
            'zip', 'tar', 'gz', '7z'
          ]
        }
      ]
    });
    if (!res?.canceled && Array.isArray(res.filePaths) && res.filePaths.length) {
      applyFiles(res.filePaths);
    }
  };

  const handlePickOutputDir = async () => {
    if (!window.darkhub?.dialog?.selectFolder) return;
    const res = await window.darkhub.dialog.selectFolder({ title: 'Selecionar Pasta de Saída' });
    if (!res?.canceled && res.folderPath) {
      setOutputDir(res.folderPath);
      setError(null);
    }
  };

  const handleConvert = async () => {
    if (!window.darkhub?.files) return;
    if (!inputFiles.length) {
      setError('Adicione pelo menos um arquivo na fila.');
      return;
    }
    if (!outputDir) {
      setError('Selecione uma pasta de destino para salvar os arquivos convertidos.');
      return;
    }

    setIsConverting(true);
    setError(null);
    setResults(null);

    try {
      if (category === 'archive') {
        if (targetFormat === 'extract') {
          const res = await window.darkhub.files.archiveOperation({
            action: 'extract',
            inputFiles,
            extractDir: outputDir
          });
          setResults([{ inputFile: inputFiles[0], outputFile: outputDir, ok: res?.ok, error: res?.error }]);
        } else {
          const archiveOut = `${outputDir}\\DarkHub_Archive_${Date.now()}.${targetFormat === 'tar.gz' ? 'tar.gz' : 'zip'}`;
          const res = await window.darkhub.files.archiveOperation({
            action: 'compress',
            inputFiles,
            outputArchive: archiveOut
          });
          setResults([{ inputFile: `${inputFiles.length} arquivos`, outputFile: archiveOut, ok: res?.ok, error: res?.error }]);
        }
      } else if (category === 'image') {
        const res = await window.darkhub.files.convertImages({
          inputFiles,
          outputDir,
          outputFormat: targetFormat,
          quality
        });
        setResults(res || []);
      } else if (category === 'document') {
        const res = await window.darkhub.files.convertDocuments({
          inputFiles,
          outputDir,
          outputFormat: targetFormat
        });
        setResults(res || []);
      } else {
        const res = await window.darkhub.files.convertMedia({
          inputFiles,
          outputDir,
          outputFormat: targetFormat,
          bitrate: audioBitrate,
          fps: gifFps
        });
        setResults(res || []);
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setIsConverting(false);
    }
  };

  const removeFile = (index: number) => {
    setInputFiles(prev => prev.filter((_, i) => i !== index));
    setResults(null);
  };

  const clearQueue = () => {
    setInputFiles([]);
    setResults(null);
    setError(null);
  };

  const currentFormats = useMemo(() => {
    return FORMAT_MAP[category] || [];
  }, [category]);

  const categories: { id: ConvertCategory; fmt: string; icon: React.ReactNode; label: string }[] = [
    { id: 'image', fmt: 'png', icon: <ImageIcon size={16} />, label: 'Imagens' },
    { id: 'audio', fmt: 'mp3', icon: <Music size={16} />, label: 'Áudio' },
    { id: 'video', fmt: 'mp4', icon: <Video size={16} />, label: 'Vídeo & GIF' },
    { id: 'document', fmt: 'txt', icon: <FileText size={16} />, label: 'Documentos' },
    { id: 'archive', fmt: 'zip', icon: <Archive size={16} />, label: 'Compactador' }
  ];

  const chip = (active: boolean) =>
    `h-7 text-xs font-mono rounded-md border transition-colors ${
      active ? 'border-blue-400/70 bg-zinc-800/60 text-zinc-50' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
    }`;

  return (
    <div className="w-full space-y-6 pb-12">
      <PageHeader
        title="Conversor Universal de Arquivos"
        subtitle="Converta imagens, vídeos, áudios, documentos e compacte arquivos com máxima fidelidade e processamento paralelo multithread."
        actions={
          <HelpTip
            title="Conversor Universal"
            description="Converta múltiplos arquivos em lote. Suporta conversão cruzada de vídeo para áudio, criação de ícones ICO, extração de texto de PDF e compactação nativa."
            sections={[
              { title: "Multithread", content: "Imagens e mídias utilizam todos os núcleos da CPU simultaneamente." },
              { title: "Vídeo para GIF", content: "Cria GIFs de alta resolução com paleta dinâmica calculada." }
            ]}
            buttonLabel="Guia"
          />
        }
      />

      {/* Category */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 rounded-lg border border-zinc-800" role="tablist">
        {categories.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={active}
              onClick={() => { setCategory(c.id); setTargetFormat(c.fmt); }}
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
        {/* Input */}
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
            <p className="text-[12.5px] text-zinc-400">
              Arraste e solte arquivos aqui: imagens, vídeos, áudios, documentos ou compactados.
            </p>
            <button type="button" className="dh-btn dh-btn-sm">
              <FolderOpen size={14} />
              Selecionar Arquivos
            </button>
          </div>

          <section className="dh-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="dh-section-title">
                Fila de Arquivos <span className="font-mono text-zinc-500 font-normal">{inputFiles.length}</span>
              </h2>
              {inputFiles.length > 0 && (
                <button onClick={clearQueue} className="dh-btn dh-btn-ghost dh-btn-sm hover:!text-red-300">
                  <Trash2 size={14} />
                  Limpar Fila
                </button>
              )}
            </div>

            {inputFiles.length === 0 ? (
              <p className="py-6 text-center text-[12.5px] text-zinc-500">
                Nenhum arquivo adicionado ainda.
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto custom-scrollbar divide-y divide-zinc-800/80 border-y border-zinc-800/80">
                {inputFiles.map((file, idx) => {
                  const filename = file.split(/[\\/]/).pop();
                  const ext = filename?.split('.').pop()?.toLowerCase();
                  return (
                    <div key={idx} className="flex items-center justify-between gap-3 py-2 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="dh-tag w-10 shrink-0">{ext}</span>
                        <span className="text-zinc-200 truncate select-text" title={file}>{filename}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        aria-label="Remover"
                        title="Remover"
                        className="dh-btn dh-btn-ghost dh-btn-sm !px-1.5 hover:!text-red-300 shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-1 flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="dh-label block mb-1">Pasta de Destino:</span>
                <span className={`font-mono text-xs truncate block select-text ${outputDir ? 'text-zinc-300' : 'text-zinc-500'}`} title={outputDir || undefined}>
                  {outputDir || 'Nenhuma pasta selecionada (clique ao lado)'}
                </span>
              </div>
              <button onClick={handlePickOutputDir} className="dh-btn dh-btn-sm shrink-0">
                <FolderOpen size={14} />
                Alterar Pasta
              </button>
            </div>
          </section>
        </div>

        {/* Output */}
        <div className="lg:col-span-5">
          <section className="dh-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="dh-section-title">Formato de Saída</h2>
              <span className="dh-tag">{category}</span>
            </div>

            <div className="max-h-72 overflow-y-auto pr-1 custom-scrollbar space-y-1" role="radiogroup">
              {currentFormats.map((fmt) => {
                const isSelected = targetFormat === fmt.ext;
                return (
                  <button
                    key={fmt.ext}
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setTargetFormat(fmt.ext)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'border-blue-400/70 bg-zinc-800/60 text-zinc-50'
                        : 'border-transparent hover:border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-medium">{fmt.name}</span>
                        {fmt.tag && <span className="dh-tag">{fmt.tag}</span>}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{fmt.desc}</p>
                    </div>
                    {isSelected && <CheckCircle2 size={16} className="text-blue-300 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {category === 'image' && ['jpg', 'webp', 'avif', 'tiff'].includes(targetFormat) && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="fc-quality" className="dh-label">Qualidade de Imagem</label>
                  <span className="font-mono text-xs text-zinc-100">{quality}<span className="text-zinc-500">%</span></span>
                </div>
                <input
                  id="fc-quality"
                  type="range"
                  min="20"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            )}

            {category === 'audio' && ['mp3', 'aac', 'm4a', 'opus'].includes(targetFormat) && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="dh-label">Bitrate de Áudio</span>
                  <span className="font-mono text-xs text-zinc-100">{audioBitrate.replace('k', '')}<span className="text-zinc-500">k</span></span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {['128k', '192k', '256k', '320k'].map((br) => (
                    <button key={br} onClick={() => setAudioBitrate(br)} aria-pressed={audioBitrate === br} className={chip(audioBitrate === br)}>
                      {br}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {category === 'video' && targetFormat === 'gif' && (
              <div className="pt-4 border-t border-zinc-800/80 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="dh-label">Taxa de Quadros (GIF FPS)</span>
                  <span className="font-mono text-xs text-zinc-100">{gifFps}<span className="text-zinc-500"> FPS</span></span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[10, 15, 20, 24].map((f) => (
                    <button key={f} onClick={() => setGifFps(f)} aria-pressed={gifFps === f} className={chip(gifFps === f)}>
                      {f} <span className="text-zinc-500">FPS</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleConvert}
              disabled={isConverting || !inputFiles.length}
              className="dh-btn dh-btn-primary w-full"
            >
              {isConverting ? (
                <>
                  <RefreshCw className="animate-spin" size={14} />
                  <span>Convertendo <span className="font-mono">{inputFiles.length}</span> arquivo(s)...</span>
                </>
              ) : (
                <>
                  <span>Converter Agora</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </section>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-red-300">
          <AlertCircle size={14} className="shrink-0" />
          <span className="min-w-0">{error}</span>
          {inputFiles.length > 0 && outputDir && !isConverting && (
            <button onClick={handleConvert} className="dh-btn dh-btn-ghost dh-btn-sm">Tentar novamente</button>
          )}
        </div>
      )}

      {isConverting && (
        <section className="space-y-3" aria-hidden>
          <div className="h-3.5 w-48 rounded bg-zinc-900 animate-pulse" />
          <div className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
            {Array.from({ length: Math.min(Math.max(inputFiles.length, 1), 4) }).map((_, i) => (
              <div key={i} className="py-3 flex items-center justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-1/3 rounded bg-zinc-900 animate-pulse" />
                  <div className="h-2.5 w-1/2 rounded bg-zinc-900 animate-pulse" />
                </div>
                <div className="h-3 w-14 rounded bg-zinc-900 animate-pulse" />
              </div>
            ))}
          </div>
        </section>
      )}

      {results && results.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="dh-section-title">
              Resultado da Conversão{' '}
              <span className="font-normal text-zinc-500">
                (<span className="font-mono text-zinc-300">{results.filter(r => r.ok).length}</span> de <span className="font-mono text-zinc-300">{results.length}</span> concluídos)
              </span>
            </h2>
            {outputDir && (
              <span className="text-xs text-zinc-500 truncate max-w-full">
                Salvo em: <span className="font-mono select-text">{outputDir}</span>
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-800/80 max-h-60 overflow-y-auto custom-scrollbar border-y border-zinc-800/80">
            {results.map((r, i) => (
              <div key={i} className="py-2.5 text-xs flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-zinc-200 truncate select-text">{r.inputFile}</div>
                  <div className="text-zinc-500 truncate font-mono text-[11px] mt-0.5 select-text">{r.outputFile}</div>
                </div>
                <div className="shrink-0 max-w-[45%] text-right">
                  {r.ok ? (
                    <span className="text-emerald-300 text-[11px]">Sucesso</span>
                  ) : (
                    <span className="text-red-300 text-[11px] break-words">{r.error || 'Erro'}</span>
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
