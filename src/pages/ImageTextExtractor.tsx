import React, { useState, useEffect, useRef } from 'react';
import { Type, Image as ImageIcon, Loader2, Copy, UploadCloud, Clipboard, Check, Sparkles, X, FileImage } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';

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
      setIsExtracting(false);
    }
  };

  const handleCopyText = () => {
    if (!extractedText) return;
    navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full max-w-6xl mx-auto space-y-4 p-1 md:p-2 animate-fadeIn text-zinc-100 pb-12"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800/80">
        <div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Type className="w-5 h-5 text-rose-500" />
            {t('ocr.title', 'Extrator de Texto (OCR)')}
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono border border-zinc-700/60">
              Offline Tesseract
            </span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            {t('ocr.subtitle', 'Extraia texto de imagens totalmente offline.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 font-mono focus:outline-none"
          >
            <option value="eng+por">Português + Inglês</option>
            <option value="por">Apenas Português</option>
            <option value="eng">Apenas Inglês</option>
          </select>

          <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={preprocess}
              onChange={(e) => setPreprocess(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-rose-600 focus:ring-0 w-3.5 h-3.5"
            />
            <span>Filtro de Contraste Sharp</span>
          </label>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleSelectImage}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition shadow-sm"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Selecionar Imagem
        </button>

        <button
          onClick={() => {
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
          }}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition"
        >
          <Clipboard className="w-3.5 h-3.5 text-zinc-400" />
          {t('ocr.pasteHint', 'Colar Screenshot (Ctrl+V)')}
        </button>

        {imagePreview && (
          <button
            onClick={() => {
              if (imagePath) triggerOcr({ imagePath });
              else if (imagePreview) triggerOcr({ base64: imagePreview });
            }}
            disabled={isExtracting}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold rounded-lg border border-zinc-700 transition disabled:opacity-50"
          >
            {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-500" /> : <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
            {t('ocr.extract', 'Re-extrair Texto')}
          </button>
        )}
      </div>

      {/* Main Workspace (Preview + Extracted Text) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-[480px]">
        {/* Left: Image Dropzone / Preview */}
        <div
          onClick={!imagePreview ? handleSelectImage : undefined}
          className={`border rounded-xl bg-zinc-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none transition ${
            isDragging
              ? 'border-rose-500 bg-rose-950/20'
              : 'border-zinc-800/80 hover:border-zinc-700'
          } ${!imagePreview ? 'cursor-pointer' : ''}`}
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
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-zinc-900/90 text-zinc-400 hover:text-zinc-100 border border-zinc-700 shadow-md"
                title="Remover imagem"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="text-center space-y-3 p-6">
              <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold text-zinc-200">{t('ocr.dragDrop', 'Arraste uma imagem ou clique para selecionar')}</div>
                <div className="text-[11px] text-zinc-500 mt-1 font-mono">Suporta JPG, PNG, WEBP, BMP ou colar direto com Ctrl+V</div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Extracted Text Workspace */}
        <div className="border border-zinc-800/80 rounded-xl bg-zinc-950 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between">
            <span className="text-xs font-bold text-zinc-200 flex items-center gap-2">
              <Type className="w-3.5 h-3.5 text-rose-500" />
              {t('ocr.extractedTitle', 'Texto Reconhecido')}
            </span>
            <button
              onClick={handleCopyText}
              disabled={!extractedText.trim()}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700/60 transition disabled:opacity-40"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? t('ocr.textCopied', 'Copiado!') : t('ocr.copyText', 'Copiar')}
            </button>
          </div>

          <div className="flex-1 p-3 relative flex flex-col">
            {isExtracting ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-xs text-zinc-400">
                <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                <span>Processando reconhecimento óptico de caracteres...</span>
              </div>
            ) : (
              <textarea
                value={extractedText}
                onChange={(e) => setExtractedText(e.target.value)}
                placeholder={t('ocr.placeholder', 'O texto extraído aparecerá aqui. Você poderá editar ou copiar livremente...')}
                className="w-full h-full flex-1 bg-transparent text-xs text-zinc-200 resize-none font-mono focus:outline-none leading-relaxed"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
