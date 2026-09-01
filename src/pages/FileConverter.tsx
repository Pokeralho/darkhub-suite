import React, { useState, useMemo } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Music,
  Video,
  Archive,
  FileCode,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Trash2,
  Layers,
  RefreshCw,
  Sliders,
  Sparkles
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';

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
          setResults([{ inputFile: inputFiles[0], outputFile: outputDir, ok: res?.ok }]);
        } else {
          const archiveOut = `${outputDir}\\DarkHub_Archive_${Date.now()}.${targetFormat === 'tar.gz' ? 'tar.gz' : 'zip'}`;
          const res = await window.darkhub.files.archiveOperation({
            action: 'compress',
            inputFiles,
            outputArchive: archiveOut
          });
          setResults([{ inputFile: `${inputFiles.length} arquivos`, outputFile: archiveOut, ok: res?.ok }]);
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

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <RefreshCw className="text-blue-400" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-zinc-100 flex items-center gap-2">
              Conversor Universal de Arquivos
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Multi-Engine
              </span>
            </h1>
            <p className="text-zinc-400 text-sm mt-1">
              Converta imagens, vídeos, áudios, documentos e compacte arquivos com máxima fidelidade e processamento paralelo multithread.
            </p>
          </div>
        </div>
        <HelpTip
          title="Conversor Universal"
          description="Converta múltiplos arquivos em lote. Suporta conversão cruzada de vídeo para áudio, criação de ícones ICO, extração de texto de PDF e compactação nativa."
          sections={[
            { title: "Multithread", content: "Imagens e mídias utilizam todos os núcleos da CPU simultaneamente." },
            { title: "Vídeo para GIF", content: "Cria GIFs de alta resolução com paleta dinâmica calculada." }
          ]}
          buttonLabel="Guia"
        />
      </div>

      {}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-zinc-900/70 p-1.5 rounded-xl border border-zinc-800">
        <button
          onClick={() => { setCategory('image'); setTargetFormat('png'); }}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${category === 'image' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'}`}
        >
          <ImageIcon size={16} />
          <span>Imagens</span>
        </button>
        <button
          onClick={() => { setCategory('audio'); setTargetFormat('mp3'); }}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${category === 'audio' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'}`}
        >
          <Music size={16} />
          <span>Áudio</span>
        </button>
        <button
          onClick={() => { setCategory('video'); setTargetFormat('mp4'); }}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${category === 'video' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'}`}
        >
          <Video size={16} />
          <span>Vídeo & GIF</span>
        </button>
        <button
          onClick={() => { setCategory('document'); setTargetFormat('txt'); }}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${category === 'document' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'}`}
        >
          <FileText size={16} />
          <span>Documentos</span>
        </button>
        <button
          onClick={() => { setCategory('archive'); setTargetFormat('zip'); }}
          className={`flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${category === 'archive' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'}`}
        >
          <Archive size={16} />
          <span>Compactador</span>
        </button>
      </div>

      {}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {}
        <div className="lg:col-span-7 space-y-4">
          <div
            className="p-8 rounded-2xl border-2 border-dashed border-zinc-700/80 hover:border-blue-500/60 bg-zinc-900/40 hover:bg-zinc-900/80 transition-all flex flex-col items-center justify-center text-center cursor-pointer group"
            onClick={handlePickFiles}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const files = Array.from(e.dataTransfer.files ?? []);
              const paths = files.map((f: any) => f?.path).filter(Boolean);
              if (paths.length) {
                await window.darkhub?.dialog?.grantDroppedFiles?.(paths);
                applyFiles(paths);
              }
            }}
          >
            <div className="p-4 bg-zinc-800/80 group-hover:bg-blue-600/20 group-hover:scale-110 rounded-2xl mb-4 transition-all border border-zinc-700/50 group-hover:border-blue-500/40">
              <FileCode size={36} className="text-zinc-400 group-hover:text-blue-400 transition-colors" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 mb-1">
              Arraste e solte arquivos aqui
            </h3>
            <p className="text-zinc-400 text-xs max-w-sm mb-4">
              Suporta múltiplos arquivos simultâneos. Imagens, vídeos, áudios, documentos e arquivos compactados.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
              >
                <FolderOpen size={14} />
                Selecionar Arquivos
              </button>
            </div>
          </div>

          {}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-blue-400" />
                <span className="text-sm font-semibold text-zinc-200">
                  Fila de Arquivos ({inputFiles.length})
                </span>
              </div>
              {inputFiles.length > 0 && (
                <button
                  onClick={clearQueue}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 hover:underline"
                >
                  <Trash2 size={13} />
                  Limpar Fila
                </button>
              )}
            </div>

            {inputFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                Nenhum arquivo adicionado ainda.
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {inputFiles.map((file, idx) => {
                  const filename = file.split(/[\\/]/).pop();
                  const ext = filename?.split('.').pop()?.toUpperCase();
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/60 hover:border-zinc-700 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] font-bold shrink-0">
                          {ext}
                        </span>
                        <span className="text-zinc-200 truncate font-medium">{filename}</span>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                        className="text-zinc-500 hover:text-rose-400 p-1 rounded-lg hover:bg-rose-500/10 transition-colors shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {}
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-3 text-xs">
              <div className="min-w-0 flex-1">
                <span className="text-zinc-500 block mb-0.5">Pasta de Destino:</span>
                <span className="text-zinc-300 font-mono truncate block bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800/80">
                  {outputDir || 'Nenhuma pasta selecionada (clique ao lado)'}
                </span>
              </div>
              <button
                onClick={handlePickOutputDir}
                className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg font-medium text-xs border border-zinc-700 transition-colors shrink-0 mt-3"
              >
                Alterar Pasta
              </button>
            </div>
          </div>
        </div>

        {}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                <Sparkles size={16} className="text-blue-400" />
                Formato de Saída
              </h3>
              <span className="text-xs text-zinc-500 font-mono uppercase">
                {category}
              </span>
            </div>

            {}
            <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
              {currentFormats.map((fmt) => {
                const isSelected = targetFormat === fmt.ext;
                return (
                  <button
                    key={fmt.ext}
                    onClick={() => setTargetFormat(fmt.ext)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-blue-600/15 border-blue-500 text-white shadow-sm'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{fmt.name}</span>
                        {fmt.tag && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            isSelected ? 'bg-blue-500/30 text-blue-200' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            {fmt.tag}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5">{fmt.desc}</p>
                    </div>
                    {isSelected && <CheckCircle2 size={18} className="text-blue-400 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>

            {}
            {category === 'image' && ['jpg', 'webp', 'avif', 'tiff'].includes(targetFormat) && (
              <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800/80 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 flex items-center gap-1.5 font-medium">
                    <Sliders size={13} /> Qualidade de Imagem
                  </span>
                  <span className="font-mono text-blue-400 font-bold">{quality}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            )}

            {category === 'audio' && ['mp3', 'aac', 'm4a', 'opus'].includes(targetFormat) && (
              <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800/80 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Bitrate de Áudio</span>
                  <span className="font-mono text-blue-400 font-bold">{audioBitrate}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {['128k', '192k', '256k', '320k'].map((br) => (
                    <button
                      key={br}
                      onClick={() => setAudioBitrate(br)}
                      className={`py-1 text-xs font-mono rounded-lg border transition-all ${
                        audioBitrate === br
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {br}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {category === 'video' && targetFormat === 'gif' && (
              <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800/80 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 font-medium">Taxa de Quadros (GIF FPS)</span>
                  <span className="font-mono text-blue-400 font-bold">{gifFps} FPS</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {[10, 15, 20, 24].map((f) => (
                    <button
                      key={f}
                      onClick={() => setGifFps(f)}
                      className={`py-1 text-xs font-mono rounded-lg border transition-all ${
                        gifFps === f
                          ? 'bg-blue-600 text-white border-blue-500'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {f} FPS
                    </button>
                  ))}
                </div>
              </div>
            )}

            {}
            <button
              onClick={handleConvert}
              disabled={isConverting || !inputFiles.length}
              className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isConverting ? (
                <>
                  <RefreshCw className="animate-spin" size={18} />
                  <span>Convertendo {inputFiles.length} arquivo(s)...</span>
                </>
              ) : (
                <>
                  <span>Converter Agora</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle size={20} className="shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              Resultado da Conversão ({results.filter(r => r.ok).length} de {results.length} concluídos)
            </h3>
            {outputDir && (
              <span className="text-xs text-zinc-500 font-mono">
                Salvo em: {outputDir}
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-800/60 max-h-60 overflow-y-auto custom-scrollbar border border-zinc-800/80 rounded-xl bg-zinc-950">
            {results.map((r, i) => (
              <div key={i} className="p-3 text-xs flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-zinc-200 font-medium truncate">{r.inputFile}</div>
                  <div className="text-zinc-500 truncate font-mono text-[11px] mt-0.5">{r.outputFile}</div>
                </div>
                <div className="shrink-0">
                  {r.ok ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold text-[11px]">
                      Sucesso
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 font-semibold text-[11px]">
                      {r.error || 'Erro'}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileConverter;

