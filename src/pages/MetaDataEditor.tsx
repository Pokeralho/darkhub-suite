import React, { useState } from 'react';
import { Trash2, Loader2, Search, Check, Save, FolderOpen, X, AlertCircle } from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import PageHeader from '../components/ui/PageHeader';

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
        setMetadata(null);
        setTagEdits({});
        setDirtyTags(new Set());

        try {
          const metaRes = await window.darkhub.metadata.read(selected);
          if (!metaRes?.ok) {
            setStatus({ ok: false, msg: metaRes?.error || 'Falha ao ler metadados' });
          } else {
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
        } catch (err: any) {
          setStatus({ ok: false, msg: err?.message ?? String(err) });
        } finally {
          setIsProcessing(false);
        }
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


  const visibleTags = Object.keys(tagEdits).filter(key => key.toLowerCase().includes(tagSearch.toLowerCase()));
  const totalTags = Object.keys(tagEdits).length;

  return (
    <div className="w-full max-w-6xl text-zinc-100">
      <PageHeader
        title={t('metadata.title', 'Editor de Metadados & Exif Universal')}
        subtitle={t('metadata.universalSubtitle', 'Visualize, edite ou anonimize metadados Exif/XMP/ID3/IPTC com suporte universal a Imagens, Áudios, Vídeos e Documentos sem corrupção.')}
        actions={
          <button
            onClick={handleSelectFile}
            disabled={isProcessing}
            className={`dh-btn ${!filePath ? 'dh-btn-primary' : ''}`}
          >
            <FolderOpen size={16} />
            {t('metadata.selectImage', 'Selecionar Arquivo')}
          </button>
        }
      />

      {/* Status */}
      {status && (
        <div className={`mb-4 flex items-center gap-3 text-[12.5px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {status.ok ? <Check size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
          <span className="min-w-0 break-all font-mono text-[12px]">{status.msg}</span>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            {!status.ok && (
              <button onClick={handleSelectFile} disabled={isProcessing} className="dh-btn dh-btn-sm">
                {t('common.retry', 'Tentar novamente')}
              </button>
            )}
            <button
              onClick={() => setStatus(null)}
              className="dh-btn dh-btn-ghost dh-btn-sm"
              aria-label={t('common.dismiss', 'Dispensar')}
              title={t('common.dismiss', 'Dispensar')}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Workspace */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Left Column: File Info & Quick Tags */}
        <section className="dh-card p-4 space-y-4">
          <div>
            <h2 className="dh-section-title">{t('metadata.fileLabel', 'Arquivo selecionado')}</h2>
            <div className={`text-[12px] font-mono mt-1 truncate ${filePath ? 'text-zinc-300' : 'text-zinc-500'}`} title={filePath || undefined}>
              {filePath || t('metadata.noFile', 'Nenhum arquivo carregado.')}
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-zinc-800/80">
            <h3 className="dh-section-title">{t('metadata.mainFields', 'Campos principais')}</h3>

            <div className="space-y-1.5">
              <label className="dh-label block">{t('metadata.artistLabel', 'Autor / Artista:')}</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Ex: Nome do Autor / Fotógrafo"
                className="dh-input w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="dh-label block">{t('metadata.copyrightLabel', 'Direitos / Copyright:')}</label>
              <input
                type="text"
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
                placeholder="Ex: © 2026 Todos os direitos reservados"
                className="dh-input w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="dh-label block">{t('metadata.descLabel', 'Descrição / Título / Comentário:')}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Ex: Detalhes, localização ou observações..."
                className="dh-input w-full h-auto py-2 resize-none"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800/80 space-y-2">
            <button
              onClick={handleUpdateMetadata}
              disabled={!filePath || isProcessing}
              className={`dh-btn w-full ${filePath ? 'dh-btn-primary' : ''}`}
            >
              {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {t('metadata.saveEdits', 'Salvar Metadados Modificados')}
            </button>

            <button
              onClick={handleRemoveMetadata}
              disabled={!filePath || isProcessing}
              className="dh-btn dh-btn-danger w-full"
            >
              <Trash2 size={16} />
              {t('metadata.scrubUniversal', 'Remover Todos os Metadados (Anonimizar)')}
            </button>
          </div>
        </section>

        {/* Right Column: Complete Raw Exif/Metadata Table */}
        <section className="md:col-span-2 dh-card flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-2 min-w-0">
              <h2 className="dh-section-title">{t('metadata.allTags', 'Todos os metadados detectados')}</h2>
              {metadata && (
                <span className="font-mono text-[11px] text-zinc-400">
                  {visibleTags.length !== totalTags ? `${visibleTags.length}/` : ''}{totalTags} <span className="text-zinc-600">{t('metadata.tagsUnit', 'tags')}</span>
                </span>
              )}
            </div>
            <div className="relative w-56">
              <Search size={14} className="text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder={t('metadata.searchTags', 'Filtrar tag (ex: ISO, Model, GPS)...')}
                className="dh-input w-full pl-8 placeholder:text-zinc-600"
              />
            </div>
          </div>

          <div className="flex-1 px-4 overflow-y-auto max-h-[460px]">
            {isProcessing && !metadata ? (
              <div className="divide-y divide-zinc-800/80" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="h-3 w-28 rounded bg-zinc-900 animate-pulse" />
                    <div className="h-7 w-2/3 rounded-md bg-zinc-900 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : !metadata ? (
              <div className="h-64 flex flex-col items-center justify-center gap-3 text-center">
                <p className="text-[12.5px] text-zinc-500 max-w-[48ch]">
                  {t('metadata.noData', 'Selecione um arquivo de imagem, áudio, vídeo ou documento para analisar os metadados.')}
                </p>
                <button onClick={handleSelectFile} className="dh-btn dh-btn-sm">
                  <FolderOpen size={14} />
                  {t('metadata.selectImage', 'Selecionar Arquivo')}
                </button>
              </div>
            ) : visibleTags.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[12.5px] text-zinc-500">
                {t('metadata.noTagMatch', 'Nenhuma tag corresponde ao filtro.')}
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {visibleTags.map((key) => (
                  <div key={key} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-mono text-[11.5px] text-zinc-400 break-all">{key}</span>
                    <input
                      type="text"
                      value={tagEdits[key]}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTagEdits(prev => ({ ...prev, [key]: val }));
                        setDirtyTags(prev => new Set(prev).add(key));
                      }}
                      className={`dh-input h-7 font-mono text-[12px] w-full sm:w-2/3 ${dirtyTags.has(key) ? 'border-blue-400/60' : ''}`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
