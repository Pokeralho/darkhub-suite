import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, Loader2, Copy, UploadCloud, Clipboard, Check, X, RefreshCw } from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import PageHeader from '../components/ui/PageHeader';

export default function ImageTextExtractor() {
  const { t } = useI18n();
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [lang, setLang] = useState<'eng+por' | 'eng' | 'por'>('eng+por');
  const [preprocess, setPreprocess] = useState(true);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractingRef = useRef(false);

  // --- Clipboard Paste Listener (Ctrl+V) ---
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (loadEvent) => {
              const base64 = loadEvent.target?.result as string;
              setImagePreview(base64);
              setImagePath(null);
              setExtractedText('');
              triggerOcr({ base64 });
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [lang, preprocess]);

  const handleSelectImage = async () => {
    if (window.darkhub?.dialog?.selectFiles) {
      try {
        const res = await window.darkhub.dialog.selectFiles({
          title: t('ocr.selectImage', 'Selecionar Imagem'),
          filters: [{ name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff'] }]
        });
        if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
          const filePath = res.filePaths[0];
          setImagePath(filePath);
          setImagePreview(`local-resource://${encodeURIComponent(filePath)}`);
          setExtractedText('');
          triggerOcr({ imagePath: filePath });
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const base64 = loadEvent.target?.result as string;
        setImagePreview(base64);
        setImagePath(null);
        setExtractedText('');
        triggerOcr({ base64 });
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Drag & Drop ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const base64 = loadEvent.target?.result as string;
        setImagePreview(base64);
        setImagePath(null);
        setExtractedText('');
        triggerOcr({ base64 });
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerOcr = async (payload: { imagePath?: string; base64?: string }) => {
    if (!window.darkhub?.ocr?.extractText) return;
    // a paste/drop while an OCR job is still running would race the result
    if (extractingRef.current) return;
    extractingRef.current = true;
    setIsExtracting(true);
    try {
      const res = await window.darkhub.ocr.extractText({
        ...payload,
        lang,
        preprocess
      });
      if (res.ok) {
        setExtractedText(res.text || 'Nenhum texto detectado na imagem.');
      } else {
        setExtractedText(`Erro: ${res.error || 'Falha ao processar OCR'}`);
      }
    } catch (err: any) {
      setExtractedText(`Erro: ${err.message}`);
    } finally {
      extractingRef.current = false;
      setIsExtracting(false);
    }
  };

  const handleCopyText = () => {
    if (!extractedText) return;
    navigator.clipboard.writeText(extractedText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePasteFromClipboard = () => {
    navigator.clipboard.read().then(async (items) => {
      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const reader = new FileReader();
          reader.onload = (loadEvent) => {
            const base64 = loadEvent.target?.result as string;
            setImagePreview(base64);
            setImagePath(null);
            setExtractedText('');
            triggerOcr({ base64 });
          };
          reader.readAsDataURL(blob);
          break;
        }
      }
    }).catch(() => {});
  };

  const rerunOcr = () => {
    if (imagePath) triggerOcr({ imagePath });
    else if (imagePreview) triggerOcr({ base64: imagePreview });
  };

  const isError = extractedText.startsWith('Erro:');

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full max-w-6xl text-zinc-100"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        className="hidden"
      />

      <PageHeader
        title={t('ocr.title', 'Extrator de Texto (OCR)')}
        subtitle={<>{t('ocr.subtitle', 'Extraia texto de imagens totalmente offline.')} <span className="dh-tag ml-1">tesseract</span></>}
        actions={
          <>
            <button onClick={handlePasteFromClipboard} className="dh-btn">
              <Clipboard size={16} className="text-zinc-400" />
              {t('ocr.pasteHint', 'Colar Screenshot (Ctrl+V)')}
            </button>
            <button onClick={handleSelectImage} className="dh-btn dh-btn-primary">
              <ImageIcon size={16} />
              {t('ocr.selectImage', 'Selecionar Imagem')}
            </button>
          </>
        }
      />

      {/* Options */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="flex items-center gap-2">
          <span className="dh-label">{t('ocr.language', 'Idioma')}</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as any)}
            className="dh-input"
          >
            <option value="eng+por">{t('ocr.langPorEng', 'Português + Inglês')}</option>
            <option value="por">{t('ocr.langPor', 'Apenas Português')}</option>
            <option value="eng">{t('ocr.langEng', 'Apenas Inglês')}</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-[12.5px] text-zinc-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={preprocess}
            onChange={(e) => setPreprocess(e.target.checked)}
          />
          <span>{t('ocr.preprocess', 'Filtro de contraste')}</span>
        </label>

        {imagePreview && (
          <button
            onClick={rerunOcr}
            disabled={isExtracting}
            className="dh-btn dh-btn-ghost dh-btn-sm ml-auto"
          >
            {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {t('ocr.extract', 'Re-extrair Texto')}
          </button>
        )}
      </div>

      {/* Main Workspace (Preview + Extracted Text) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[480px]">
        {/* Left: Image Dropzone / Preview */}
        <div
          onClick={!imagePreview ? handleSelectImage : undefined}
          className={`rounded-xl flex flex-col items-center justify-center p-4 relative overflow-hidden select-none transition-colors duration-150 ${
            imagePreview
              ? 'border border-zinc-800/80 bg-zinc-950'
              : isDragging
                ? 'border border-dashed border-blue-400 bg-blue-400/5 cursor-pointer'
                : 'border border-dashed border-zinc-800 hover:border-zinc-700 cursor-pointer'
          }`}
        >
          {imagePreview ? (
            <div className="w-full h-full flex flex-col items-center justify-center relative">
              <img
                src={imagePreview}
                alt="Preview"
                className="max-w-full max-h-full object-contain rounded-lg"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setImagePreview(null);
                  setImagePath(null);
                  setExtractedText('');
                }}
                className="dh-btn dh-btn-sm absolute top-2 right-2 bg-zinc-950/90"
                title={t('ocr.removeImage', 'Remover imagem')}
                aria-label={t('ocr.removeImage', 'Remover imagem')}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="text-center space-y-3 p-6">
              <UploadCloud size={20} className="mx-auto text-zinc-500" />
              <p className="text-[13px] text-zinc-300">{t('ocr.dragDrop', 'Arraste uma imagem ou clique para selecionar')}</p>
              <p className="dh-tag">{t('ocr.supportedFormats', 'jpg, png, webp, bmp ou Ctrl+V')}</p>
            </div>
          )}
        </div>

        {/* Right: Extracted Text Workspace */}
        <div className="border border-zinc-800/80 rounded-xl bg-zinc-950 flex flex-col overflow-hidden">
          <div className="h-11 px-3 border-b border-zinc-800/80 flex items-center justify-between">
            <h2 className="dh-section-title">{t('ocr.extractedTitle', 'Texto Reconhecido')}</h2>
            <button
              onClick={handleCopyText}
              disabled={!extractedText.trim()}
              className="dh-btn dh-btn-ghost dh-btn-sm"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? t('ocr.textCopied', 'Copiado!') : t('ocr.copyText', 'Copiar')}
            </button>
          </div>

          <div className="flex-1 p-3 relative flex flex-col min-h-0">
            {isExtracting ? (
              <div className="flex-1 space-y-2.5" aria-busy="true" aria-label={t('ocr.processing', 'Processando reconhecimento óptico de caracteres...')}>
                {[92, 78, 85, 60, 88, 70, 45].map((w, i) => (
                  <div key={i} className="h-3 rounded bg-zinc-900 animate-pulse" style={{ width: `${w}%` }} />
                ))}
              </div>
            ) : (
              <>
                {isError && (
                  <div className="flex items-center justify-between gap-3 mb-2 text-[12px] text-red-400">
                    <span className="truncate">{extractedText}</span>
                    {imagePreview && (
                      <button onClick={rerunOcr} className="dh-btn dh-btn-sm shrink-0">
                        {t('common.retry', 'Tentar novamente')}
                      </button>
                    )}
                  </div>
                )}
                <textarea
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder={t('ocr.placeholder', 'O texto extraído aparecerá aqui. Você poderá editar ou copiar livremente...')}
                  className="w-full h-full flex-1 bg-transparent text-[12.5px] text-zinc-200 resize-none font-mono focus:outline-none leading-relaxed placeholder:text-zinc-600"
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
