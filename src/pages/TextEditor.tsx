import React, { useState } from 'react';
import { FileText, Save, FolderOpen, AlertCircle, Plus } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';

const TextEditor = () => {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState<{ok: boolean, msg: string} | null>(null);

  const handleOpen = async () => {
    if (window.darkhub) {
      const res = await window.darkhub.dialog.selectFiles({
        title: t('text.openTitle'),
        filters: [{ name: 'Text Files', extensions: ['txt', 'md', 'json', 'log'] }]
      });
      if (!res.canceled && res.filePaths.length > 0) {
        const file = res.filePaths[0];
        const readRes = await window.darkhub.fs.readFile(file);
        if (readRes.ok) {
          setContent(readRes.content);
          setFilePath(file);
          setStatus(null);
        } else {
          setStatus({ ok: false, msg: readRes.error });
        }
      }
    }
  };

  const handleSave = async () => {
    if (window.darkhub) {
      let targetPath = filePath;
      if (!targetPath) {
        const picked = await window.darkhub.dialog.saveFile({
          title: t('text.saveAsTitle'),
          filters: [{ name: 'Text', extensions: ['txt', 'md', 'json', 'log'] }]
        })
        if (picked?.canceled || !picked?.filePath) return
        targetPath = picked.filePath
        setFilePath(targetPath)
      }

      const res = await window.darkhub.fs.writeFile({ filePath: targetPath, content });
      if (res.ok) {
        setStatus({ ok: true, msg: t('text.saved') });
        setTimeout(() => setStatus(null), 3000);
      } else {
        setStatus({ ok: false, msg: res.error });
      }
    }
  };

  const handleNew = () => {
    setContent('')
    setFilePath(null)
    setStatus(null)
  }

  return (
    <div className="space-y-6 w-full h-full flex flex-col">
      <div className="flex justify-between items-end">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{t('text.title')}</h1>
            <HelpTip
              title={t('help.text.overview.title')}
              description={t('help.text.overview.desc')}
              sections={[
                { title: t('help.text.overview.sections.storage.title'), content: t('help.text.overview.sections.storage.desc') }
              ]}
              buttonLabel={t('help.button')}
            />
          </div>
          <p className="text-zinc-400">{t('text.subtitle')}</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={handleNew} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center space-x-2 transition-colors">
            <Plus size={18} />
            <span>{t('text.new')}</span>
          </button>
          <button onClick={handleOpen} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center space-x-2 transition-colors">
            <FolderOpen size={18} />
            <span>{t('text.open')}</span>
          </button>
          <button onClick={handleSave} className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg flex items-center space-x-2 transition-colors">
            <Save size={18} />
            <span>{t('text.save')}</span>
          </button>
          <HelpTip
            title={t('help.text.actions.title')}
            description={t('help.text.actions.desc')}
            sections={[
              { title: t('help.text.actions.sections.new.title'), content: t('help.text.actions.sections.new.desc') },
              { title: t('help.text.actions.sections.open.title'), content: t('help.text.actions.sections.open.desc') },
              { title: t('help.text.actions.sections.save.title'), content: t('help.text.actions.sections.save.desc') }
            ]}
            example={t('help.text.actions.example')}
            buttonLabel={t('help.button')}
          />
        </div>
      </div>

      {status && (
        <div className={`p-3 rounded-lg flex items-center space-x-2 ${status.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          <AlertCircle size={18} />
          <span>{status.msg}</span>
        </div>
      )}

      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl flex flex-col overflow-hidden pb-6">
        <div className="bg-zinc-950 px-4 py-2 border-b border-zinc-800 text-sm text-zinc-500">
          {filePath ? filePath : t('text.untitled')}
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 w-full bg-transparent text-zinc-200 p-4 font-mono text-sm resize-none focus:outline-none"
          spellCheck={false}
        />
      </div>
    </div>
  );
};

export default TextEditor;
