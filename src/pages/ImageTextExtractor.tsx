import React, { useState } from 'react';
import { Type, Image as ImageIcon, Loader2, Copy } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';

const ImageTextExtractor = () => {
  const { t } = useI18n();
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [lang, setLang] = useState<'eng+por' | 'eng' | 'por'>('eng+por');
  const [preprocess, setPreprocess] = useState(true);

  const handleSelectImage = async () => {
    if (window.darkhub) {
      const res = await window.darkhub.dialog.selectFiles({
        title: t('ocr.selectImage'),
        filters: [{ name: 'Images', extensions: ['jpg', 'png', 'jpeg', 'webp'] }]
      });
      if (!res.canceled && res.filePaths.length > 0) {
        setImagePath(res.filePaths[0]);
        setExtractedText('');
      }
    }
  };

  const handleExtract = async () => {
    if (!imagePath) return;
    setIsExtracting(true);

    if (window.darkhub) {
      try {
        const result = await window.darkhub.ocr.extractText({ imagePath, lang, preprocess });
        if (result.ok) {
          setExtractedText(result.text);
        }
      } catch (err: any) {
        setExtractedText(`Erro: ${err.message}`);
      }
    }
    setIsExtracting(false);
  };

  return (
    <div className="space-y-6 w-full h-full flex flex-col">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-bold text-white">{t('ocr.title')}</h1>
          <HelpTip
            title={t('help.ocr.overview.title')}
            description={t('help.ocr.overview.desc')}
            sections={[
              { title: t('help.ocr.overview.sections.input.title'), content: t('help.ocr.overview.sections.input.desc') },
              { title: t('help.ocr.overview.sections.output.title'), content: t('help.ocr.overview.sections.output.desc') }
            ]}
            example={t('help.ocr.overview.example')}
            buttonLabel={t('help.button')}
          />
        </div>
        <p className="text-zinc-400">{t('ocr.subtitle')}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={handleSelectImage}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 rounded-lg font-medium transition-colors flex items-center space-x-2"
        >
          <ImageIcon size={18} />
          <span>{t('ocr.selectImage')}</span>
        </button>

        <div className="flex items-center gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
          >
            <option value="eng+por">PT+EN</option>
            <option value="por">PT</option>
            <option value="eng">EN</option>
          </select>
          <label className="text-sm text-zinc-300 flex items-center gap-2">
            <input
              type="checkbox"
              checked={preprocess}
              onChange={(e) => setPreprocess(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded bg-zinc-800 border-zinc-700 focus:ring-blue-500"
            />
            <span className="inline-flex items-center gap-2">
              Pré-processar
              <HelpTip
                title={t('help.ocr.preprocess.title')}
                description={t('help.ocr.preprocess.desc')}
                sections={[
                  { title: t('help.ocr.preprocess.sections.behavior.title'), content: t('help.ocr.preprocess.sections.behavior.desc') }
                ]}
                buttonLabel={t('help.button')}
              />
            </span>
          </label>
        </div>

        <button
          onClick={handleExtract}
          disabled={!imagePath || isExtracting}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center space-x-2 disabled:opacity-50"
        >
          {isExtracting ? <Loader2 size={18} className="animate-spin" /> : <Type size={18} />}
          <span>{isExtracting ? t('ocr.extracting') : t('ocr.extract')}</span>
        </button>
        <HelpTip
          title={t('help.ocr.extract.title')}
          description={t('help.ocr.extract.desc')}
          sections={[
            { title: t('help.ocr.extract.sections.input.title'), content: t('help.ocr.extract.sections.input.desc') },
            { title: t('help.ocr.extract.sections.output.title'), content: t('help.ocr.extract.sections.output.desc') }
          ]}
          example={t('help.ocr.extract.example')}
          buttonLabel={t('help.button')}
        />
      </div>

      {isExtracting ? (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-blue-200">
            <span>Extraindo texto da imagem</span>
            <span>{lang.toUpperCase()}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-400" />
          </div>
        </div>
      ) : null}

      <div className="flex-1 grid grid-cols-2 gap-6 pb-6">
        <div className="border border-zinc-800 bg-zinc-900 rounded-xl overflow-hidden flex items-center justify-center relative">
          {imagePath ? (
            <img src={`local-resource://${encodeURIComponent(imagePath)}`} alt="Selected" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-zinc-500">{t('ocr.none')}</span>
          )}
        </div>

        <div className="border border-zinc-800 bg-zinc-900 rounded-xl flex flex-col relative overflow-hidden">
          <div className="p-3 border-b border-zinc-800 bg-zinc-950 flex justify-between items-center">
            <span className="text-sm font-semibold text-zinc-300">{t('ocr.extractedTitle')}</span>
            <button
              onClick={() => navigator.clipboard.writeText(extractedText)}
              disabled={!extractedText}
              className="text-zinc-400 hover:text-white disabled:opacity-50"
            >
              <Copy size={16} />
            </button>
          </div>
          <textarea
            readOnly
            value={extractedText}
            placeholder={t('ocr.placeholder')}
            className="flex-1 w-full bg-transparent text-zinc-200 p-4 resize-none focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};

export default ImageTextExtractor;
