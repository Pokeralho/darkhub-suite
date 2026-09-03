import React, { useState } from 'react';
import { FileText, Trash2, FileOutput, Loader2, Search, Check, Save, Sparkles, FolderOpen } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

export default function MetaDataEditor() {
  const { t } = useI18n();
  const [filePath, setFilePath] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [artist, setArtist] = useState('');
  const [copyright, setCopyright] = useState('');
  const [description, setDescription] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [tagEdits, setTagEdits] = useState<Record<string, string>>({});
  const [dirtyTags, setDirtyTags] = useState<Set<string>>(new Set());

  const handleSelectFile = async () => {
    if (window.darkhub?.dialog?.selectFiles) {
      const res = await window.darkhub.dialog.selectFiles({
        title: 'Selecionar Arquivo para Análise de Metadados / Exif',
        filters: [
          { name: t('metadata.filterAllSupported', 'Todos os Arquivos Suportados'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'heic', 'gif', 'bmp', 'svg', 'dng', 'cr2', 'nef', 'arw', 'mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'pdf', 'docx', 'xlsx', 'pptx'] },
          { name: t('metadata.filterImages', 'Imagens & Fotos'), extensions: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'heic', 'gif', 'bmp', 'svg', 'dng', 'cr2', 'nef', 'arw'] },
          { name: t('metadata.filterAudio', 'Áudio & Música'), extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma'] },
          { name: t('metadata.filterVideo', 'Vídeos'), extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'm4v'] },
          { name: t('metadata.filterDocs', 'Documentos'), extensions: ['pdf', 'docx', 'xlsx', 'pptx', 'epub'] },
          { name: t('metadata.filterAll', 'Todos os Arquivos (*.*)'), extensions: ['*'] }
        ]
      });
      if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
        const selected = res.filePaths[0];
        setFilePath(selected);
        setStatus(null);
        setIsProcessing(true);

        const metaRes = await window.darkhub.metadata.read(selected);
        if (metaRes.ok) {
          setMetadata(metaRes.metadata);
          setArtist(String(metaRes.metadata?.Artist ?? metaRes.metadata?.Author ?? metaRes.metadata?.Creator ?? ''));
          setCopyright(String(metaRes.metadata?.Copyright ?? ''));
          setDescription(String(metaRes.metadata?.ImageDescription ?? metaRes.metadata?.Description ?? metaRes.metadata?.Comment ?? ''));

          const nextEdits: Record<string, string> = {};
          const m = metaRes.metadata ?? {};
          for (const key of Object.keys(m)) {
            const v = m[key];
            if (v == null) continue;
            if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
              const s = String(v);
              if (s.length > 300) continue;
              nextEdits[key] = s;
            }
          }
          setTagEdits(nextEdits);
          setDirtyTags(new Set());
        }
        setIsProcessing(false);
      }
    }
  };

  const handleRemoveMetadata = async () => {
    if (!filePath || !window.darkhub?.metadata) return;

    setIsProcessing(true);
    try {
      const folder = await window.darkhub.dialog.selectFolder({ title: 'Selecionar Pasta de Destino para o Arquivo Limpo' });
      if (!folder.canceled && folder.folderPath) {
        const ext = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.')) : '';
        const baseName = filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || 'clean';
        const outPath = `${folder.folderPath}\\${baseName}_anonymized_${Date.now()}${ext}`;

        const res = await window.darkhub.metadata.remove({ inputPath: filePath, outputPath: outPath });
        if (res.ok) {
          setStatus({ ok: true, msg: `✓ Arquivo limpo com metadados/rastros removidos salvo em: ${res.path}` });
        } else {
          setStatus({ ok: false, msg: res.error || 'Falha ao limpar metadados' });
        }
      }
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    }
    setIsProcessing(false);
  };

  const handleUpdateMetadata = async () => {
    if (!filePath || !window.darkhub?.metadata) return;
    setIsProcessing(true);
    try {
      const folder = await window.darkhub.dialog.selectFolder({ title: 'Selecionar Pasta de Destino para o Arquivo Modificado' });
      if (!folder.canceled && folder.folderPath) {
        const ext = filePath.includes('.') ? filePath.slice(filePath.lastIndexOf('.')) : '';
        const baseName = filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || 'edited';
        const outPath = `${folder.folderPath}\\${baseName}_edited_${Date.now()}${ext}`;

        const tags: any = {};
        if (artist.trim()) tags.Artist = artist.trim();
        if (copyright.trim()) tags.Copyright = copyright.trim();
        if (description.trim()) tags.ImageDescription = description.trim();
        for (const key of Array.from(dirtyTags)) {
          const val = tagEdits[key];
          if (val != null) tags[key] = val;
        }

        const res = await window.darkhub.metadata.update({ inputPath: filePath, outputPath: outPath, tags });
        if (res.ok) setStatus({ ok: true, msg: `✓ Arquivo com metadados atualizados salvo em: ${res.path}` });
        else setStatus({ ok: false, msg: res.error || 'Falha ao salvar metadados' });
      }
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    }
    setIsProcessing(false);
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 p-1 md:p-2 animate-fadeIn text-zinc-100 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-500" />
            {t('metadata.title', 'Editor de Metadados & Exif Universal')}
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono border border-zinc-700/60">
              Preservação Não-Destrutiva
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {t('metadata.universalSubtitle', 'Visualize, edite ou anonimize metadados Exif/XMP/ID3/IPTC com suporte universal a Imagens, Áudios, Vídeos e Documentos sem corrupção.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSelectFile}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition shadow-sm"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {t('metadata.selectImage', 'Selecionar Arquivo')}
          </button>
        </div>
      </div>

      {/* Status Alert */}
      {status && (
        <div className={`p-3 rounded-xl border text-xs font-mono flex items-center justify-between ${
          status.ok 
            ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300' 
            : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
        }`}>
          <span>{status.msg}</span>
          <button onClick={() => setStatus(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Workspace */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left Column: File Info & Quick Tags */}
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-4 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider">Arquivo Selecionado</h3>
            <div className="text-xs font-mono text-zinc-400 mt-1 truncate">
              {filePath || 'Nenhum arquivo carregado.'}
            </div>
          </div>

          <div className="space-y-3 pt-2 border-t border-zinc-800/80">
            <h4 className="text-xs font-bold text-zinc-300">Campos Principais:</h4>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400">{t('metadata.artistLabel', 'Autor / Artista:')}</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Ex: Nome do Autor / Fotógrafo"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400">{t('metadata.copyrightLabel', 'Direitos / Copyright:')}</label>
              <input
                type="text"
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
                placeholder="Ex: © 2026 Todos os direitos reservados"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-zinc-400">{t('metadata.descLabel', 'Descrição / Título / Comentário:')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Ex: Detalhes, localização ou observações..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 font-mono resize-none"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800/80 space-y-2">
            <button
              onClick={handleUpdateMetadata}
              disabled={!filePath || isProcessing}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition disabled:opacity-50 shadow-sm"
            >
              {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {t('metadata.saveEdits', 'Salvar Metadados Modificados')}
            </button>

            <button
              onClick={handleRemoveMetadata}
              disabled={!filePath || isProcessing}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold rounded-lg border border-zinc-800 transition disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              {t('metadata.scrubUniversal', 'Remover Todos os Metadados (Anonimizar)')}
            </button>
          </div>
        </div>

        {/* Right Column: Complete Raw Exif/Metadata Table */}
        <div className="md:col-span-2 bg-zinc-950 border border-zinc-800/80 rounded-xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-zinc-200">Todos os Metadados Detectados</span>
            <div className="relative w-56">
              <Search className="w-3 h-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder={t('metadata.searchTags', 'Filtrar tag (ex: ISO, Model, GPS)...')}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-7 pr-2.5 py-1 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex-1 p-3 overflow-y-auto max-h-[420px]">
            {!metadata ? (
              <div className="h-64 flex flex-col items-center justify-center text-zinc-500 text-xs">
                {t('metadata.noData', 'Selecione um arquivo de imagem, áudio, vídeo ou documento para analisar os metadados.')}
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60 font-mono text-xs">
                {Object.keys(tagEdits)
                  .filter(key => key.toLowerCase().includes(tagSearch.toLowerCase()))
                  .map((key) => (
                    <div key={key} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-zinc-400 font-semibold text-[11px] break-all">{key}</span>
                      <input
                        type="text"
                        value={tagEdits[key]}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTagEdits(prev => ({ ...prev, [key]: val }));
                          setDirtyTags(prev => new Set(prev).add(key));
                        }}
                        className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-700 w-full sm:w-2/3"
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
