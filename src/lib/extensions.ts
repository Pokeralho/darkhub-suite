import { useEffect, useState } from 'react';
import type { HubInstalled } from '../global';

/** Route of an extension screen: ids have dots, routes only keep [\w-]; ids never contain "_". */
export const extPageId = (id: string, contribution: string) => `ext__${id.replace(/\./g, '_')}__${contribution}`;
export function parseExtPage(page: string): { id: string; contribution: string } | null {
  const m = /^ext__([a-z0-9-]+_[a-z0-9-]+)__([a-z0-9-]+)$/.exec(page);
  return m ? { id: m[1].replace('_', '.'), contribution: m[2] } : null;
}

/** Tell every listener (sidebar, dashboard) that extensions were installed, removed or reloaded. */
export const extensionsChanged = () => window.dispatchEvent(new Event('darkhub:extensions'));

/** Installed extensions, kept fresh. */
export function useExtensions(): HubInstalled[] {
  const [list, setList] = useState<HubInstalled[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => window.darkhub?.hub?.list().then((r) => { if (alive && r?.ok) setList((r.packages || []).filter((p) => p.type === 'extension' && p.extension)); });
    load();
    window.addEventListener('darkhub:extensions', load);
    const off = window.darkhub?.hub?.onEvent?.((m) => { if (m.type === 'extReload') load(); });
    return () => { alive = false; window.removeEventListener('darkhub:extensions', load); off?.(); };
  }, []);
  return list;
}

export const textIn = (t: string | Record<string, string> | undefined, lang: string) => (typeof t === 'string' ? t : t ? t[lang] || t['pt-BR'] || t['en-US'] || '' : '');
