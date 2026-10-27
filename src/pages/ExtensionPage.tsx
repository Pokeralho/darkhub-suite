import React, { useEffect, useState } from 'react';
import { RefreshCw, Code } from '../components/icons';
import ExtensionFrame from '../components/ExtensionFrame';
import { useI18n } from '../i18n/I18nProvider';
import { parseExtPage, textIn, useExtensions } from '../lib/extensions';

/** A screen contributed by an extension, full height, with a console for extensions under development. */
export default function ExtensionPage({ page, onNavigate }: { page: string; onNavigate: (p: string) => void }) {
  const { t, lang } = useI18n();
  const target = parseExtPage(page);
  const exts = useExtensions();
  const ext = exts.find((e) => e.id === target?.id);
  const contribution = ext?.extension?.pages.find((p) => p.id === target?.contribution);
  const dev = Boolean(ext?.source?.dev);
  const [logs, setLogs] = useState<{ at: string; level: string; text: string }[] | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (logs === null || !ext) return;
    const id = window.setInterval(() => window.darkhub?.ext?.logs({ id: ext.id }).then((r) => setLogs(r.items)), 1000);
    return () => window.clearInterval(id);
  }, [logs, ext]);

  if (!target) return null;
  if (exts.length && !ext) return <p className="text-[13px] text-zinc-400">{t('ext.notInstalled', 'Esta extensão não está mais instalada.')}</p>;

  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-7.5rem)] min-h-[420px]">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-[17px] font-semibold tracking-tight text-zinc-50">{textIn(contribution?.title, lang) || target.contribution}</h1>
        {ext ? <span className="text-[12px] text-zinc-500">{textIn(ext.name, lang)} v{ext.version} · @{ext.author.github}</span> : null}
        {dev ? <span className="inline-flex h-5 items-center rounded-full border border-amber-400/40 px-2 text-[11px] text-amber-300">{t('ext.devBadge', 'em desenvolvimento')}</span> : null}
        <span className="ml-auto flex gap-1.5">
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" onClick={() => setKey((k) => k + 1)} title={t('ext.reload', 'Recarregar')}><RefreshCw size={13} />{t('ext.reload', 'Recarregar')}</button>
          <button type="button" className="dh-btn dh-btn-sm dh-btn-ghost" aria-pressed={logs !== null} onClick={() => setLogs(logs === null ? [] : null)}><Code size={13} />{t('ext.console', 'Console')}</button>
        </span>
      </header>
      <ExtensionFrame key={`${page}-${key}`} extId={target.id} contribution={target.contribution} onNavigate={onNavigate} className="flex-1 min-h-0 rounded-lg border border-zinc-800/80 overflow-hidden" />
      {logs !== null ? (
        <section aria-label={t('ext.console', 'Console')} className="h-40 shrink-0 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11.5px]">
          {logs.length ? logs.map((l, i) => (
            <div key={i} className={l.level === 'error' ? 'text-red-300' : l.level === 'warn' ? 'text-amber-300' : 'text-zinc-300'}>
              <span className="text-zinc-600">{l.at.slice(11, 19)}</span> {l.text}
            </div>
          )) : <p className="text-zinc-600">{t('ext.consoleEmpty', 'Nada no console ainda.')}</p>}
        </section>
      ) : null}
    </div>
  );
}
