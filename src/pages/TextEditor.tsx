import React, { useState } from 'react';
import { Save, FolderOpen, AlertCircle, Plus, Check } from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
import PageHeader from '../components/ui/PageHeader';

const TextEditor = () => {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState<{ok: boolean, msg: string} | null>(null);

  const handleOpen = async () => {
    if (window.darkhub) {
      try {
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
      } catch (err: any) {
        setStatus({ ok: false, msg: err?.message ?? String(err) });
      }
    }
  };

  const handleSave = async () => {
    if (window.darkhub) {
      try {
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
      } catch (err: any) {
        setStatus({ ok: false, msg: err?.message ?? String(err) });
      }
    }
  };

  const handleNew = () => {
    setContent('')
    setFilePath(null)
    setStatus(null)
  }


  const lineCount = content ? content.split('\n').length : 0;

  return (
    <div className="w-full h-full flex flex-col">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t('text.title')}
            <HelpTip
              title={t('help.text.overview.title')}
              description={t('help.text.overview.desc')}
              sections={[
                { title: t('help.text.overview.sections.storage.title'), content: t('help.text.overview.sections.storage.desc') }
              ]}
              buttonLabel={t('help.button')}
            />
          </span>
        }
        subtitle={t('text.subtitle')}
        actions={
          <>
            <button onClick={handleNew} className="dh-btn dh-btn-ghost">
              <Plus size={16} />
              <span>{t('text.new')}</span>
            </button>
            <button onClick={handleOpen} className="dh-btn">
              <FolderOpen size={16} />
              <span>{t('text.open')}</span>
            </button>
            <button onClick={handleSave} className="dh-btn dh-btn-primary">
              <Save size={16} />
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
          </>
        }
      />

      {status && (
        <div className={`mb-3 flex items-center gap-2 text-[12.5px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {status.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          <span className="min-w-0 truncate">{status.msg}</span>
        </div>
      )}

      <div className="flex-1 min-h-[360px] bg-zinc-950 border border-zinc-800/80 rounded-xl flex flex-col overflow-hidden">
        <div className="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between gap-3">
          <span className={`font-mono text-[11.5px] truncate ${filePath ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {filePath ? filePath : t('text.untitled')}
          </span>
          <span className="font-mono text-[11px] text-zinc-400 shrink-0">
            {lineCount} <span className="text-zinc-600">{t('text.lines', 'linhas')}</span>
            <span className="mx-2 text-zinc-700">/</span>
            {content.length} <span className="text-zinc-600">{t('text.chars', 'caracteres')}</span>
          </span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 w-full bg-transparent text-zinc-200 p-4 font-mono text-[13px] leading-relaxed resize-none focus:outline-none"
          spellCheck={false}
        />
      </div>
    </div>
  );
};

export default TextEditor;
