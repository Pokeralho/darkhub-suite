import React, { useState } from 'react';
import { Image as ImageIcon, Trash2, FileOutput, Loader2 } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';

const MetaDataEditor = () => {
  const { t } = useI18n();
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ok: boolean, msg: string} | null>(null);
  const [artist, setArtist] = useState('');
  const [copyright, setCopyright] = useState('');
  const [description, setDescription] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [tagEdits, setTagEdits] = useState<Record<string, string>>({});
  const [dirtyTags, setDirtyTags] = useState<Set<string>>(new Set());

  const handleSelectImage = async () => {
    if (window.darkhub) {
      const res = await window.darkhub.dialog.selectFiles({
        title: t('metadata.selectForAnalysis'),
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
      });
      if (!res.canceled && res.filePaths.length > 0) {
        setImagePath(res.filePaths[0]);
        setStatus(null);

        setIsProcessing(true);
        const metaRes = await window.darkhub.metadata.read(res.filePaths[0]);
        if (metaRes.ok) {
          setMetadata(metaRes.metadata);
          setArtist(String(metaRes.metadata?.Artist ?? ''));
          setCopyright(String(metaRes.metadata?.Copyright ?? ''));
          setDescription(String(metaRes.metadata?.ImageDescription ?? metaRes.metadata?.Description ?? ''));

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
    if (!imagePath || !window.darkhub) return;

    setIsProcessing(true);
    try {
      const folder = await window.darkhub.dialog.selectFolder({ title: t('metadata.selectDestination') });
      if (!folder.canceled && folder.folderPath) {
        const outPath = `${folder.folderPath}\\clean_image_${Date.now()}.jpg`;
        const res = await window.darkhub.metadata.remove({ inputPath: imagePath, outputPath: outPath });
        if (res.ok) {
          setStatus({ ok: true, msg: `${t('metadata.cleanSaved', 'Imagem limpa salva em:')} ${res.path}` });
        } else {
          setStatus({ ok: false, msg: res.error });
        }
      }
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    }
    setIsProcessing(false);
  };

  const handleUpdateMetadata = async () => {
    if (!imagePath || !window.darkhub) return;
    setIsProcessing(true);
    try {
      const folder = await window.darkhub.dialog.selectFolder({ title: t('metadata.selectDestination') });
      if (!folder.canceled && folder.folderPath) {
        const ext = imagePath.includes('.') ? imagePath.slice(imagePath.lastIndexOf('.')) : '.jpg'
        const safeExt = ext.length <= 6 ? ext : '.jpg'
        const outPath = `${folder.folderPath}\\edited_image_${Date.now()}${safeExt}`;
        const tags: any = {};
        if (artist.trim()) tags.Artist = artist.trim();
        if (copyright.trim()) tags.Copyright = copyright.trim();
        if (description.trim()) tags.ImageDescription = description.trim();
        for (const key of Array.from(dirtyTags)) {
          const val = tagEdits[key]
          if (val != null) tags[key] = val
        }

        const res = await window.darkhub.metadata.update({ inputPath: imagePath, outputPath: outPath, tags });
        if (res.ok) setStatus({ ok: true, msg: `${t('metadata.editedSaved', 'Imagem editada salva em:')} ${res.path}` });
        else setStatus({ ok: false, msg: res.error });
      }
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    }
    setIsProcessing(false);
  };

  return (
    <div className="space-y-6 w-full h-full flex flex-col">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">{t('metadata.title')}</h1>
          <HelpTip
            title={t('help.metadata.overview.title')}
            description={t('help.metadata.overview.desc')}
            sections={[
              { title: t('help.metadata.overview.sections.input.title'), content: t('help.metadata.overview.sections.input.desc') },
              { title: t('help.metadata.overview.sections.output.title'), content: t('help.metadata.overview.sections.output.desc') }
            ]}
            example={t('help.metadata.overview.example')}
            buttonLabel={t('help.button')}
          />
        </div>
        <p className="text-zinc-400">{t('metadata.subtitle')}</p>
      </div>

      <div className="flex space-x-4">
        <button
          onClick={handleSelectImage}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 rounded-lg font-medium transition-colors flex items-center space-x-2"
        >
          <ImageIcon size={18} />
          <span>{t('metadata.selectImage')}</span>
        </button>

        <button
          onClick={handleUpdateMetadata}
          disabled={!imagePath || isProcessing}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50"
        >
          {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <FileOutput size={18} />}
          <span>{t('metadata.saveEdited')}</span>
        </button>

        <button
          onClick={handleRemoveMetadata}
          disabled={!imagePath || isProcessing}
          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50"
        >
          {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
          <span>{t('metadata.scrub')}</span>
        </button>
        <HelpTip
          title={t('help.metadata.actions.title')}
          description={t('help.metadata.actions.desc')}
          sections={[
            { title: t('help.metadata.actions.sections.edit.title'), content: t('help.metadata.actions.sections.edit.desc') },
            { title: t('help.metadata.actions.sections.scrub.title'), content: t('help.metadata.actions.sections.scrub.desc') }
          ]}
          example={t('help.metadata.actions.example')}
          buttonLabel={t('help.button')}
        />
      </div>

      {status && (
        <div className={`p-4 rounded-lg flex items-center space-x-3 ${status.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
          <FileOutput size={20} />
          <span>{status.msg}</span>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">
        <div className="border border-zinc-800 bg-zinc-900 rounded-xl overflow-hidden flex items-center justify-center relative">
          {imagePath ? (
            <img src={`local-resource://${encodeURIComponent(imagePath)}`} alt="Selected" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-zinc-500">{t('metadata.none')}</span>
          )}
        </div>

        <div className="border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col relative overflow-hidden">
          <div className="p-3 border-b border-zinc-800 bg-zinc-950">
            <span className="text-sm font-semibold text-zinc-300">{t('metadata.exif')}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-3 mb-4">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Artist</div>
                <input
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Copyright</div>
                <input
                  value={copyright}
                  onChange={(e) => setCopyright(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <div className="text-xs text-zinc-500 mb-1">Description</div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full h-20 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="mb-3">
              <div className="text-xs text-zinc-500 mb-1">Metadados (avançado)</div>
              <input
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                placeholder="Buscar chave EXIF..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-2 mb-4 max-h-56 overflow-y-auto pr-1">
              {Object.keys(tagEdits)
                .filter((k) => k.toLowerCase().includes(tagSearch.trim().toLowerCase()))
                .slice(0, 80)
                .map((k) => (
                  <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                    <div className="text-xs text-zinc-400 truncate">{k}</div>
                    <input
                      value={tagEdits[k] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setTagEdits((prev) => ({ ...prev, [k]: v }))
                        setDirtyTags((prev) => {
                          const next = new Set(prev)
                          next.add(k)
                          return next
                        })
                      }}
                      className="md:col-span-2 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
            </div>
            {metadata ? (
              <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-500">
                {t('metadata.noData')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetaDataEditor;
