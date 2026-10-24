import React, { useMemo, useState } from 'react';
import { Search, Lock, ChevronDown, ChevronRight } from '../../components/icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { MetaxGroup } from './metaxTypes';

interface Props {
  groups: MetaxGroup[];
  edits: Record<string, string>;
  onEdit: (key: string, value: string) => void;
}

/** Every tag ExifTool found, grouped (EXIF IFD0, XMP-dc, ID3v2_3, PDF, EXE...). Editable only where a writer exists. */
export default function MetaxTagsPanel({ groups, edits, onEdit }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, tags: q ? g.tags.filter((tag) => tag.key.toLowerCase().includes(q) || tag.value.toLowerCase().includes(q)) : g.tags }))
      .filter((g) => g.tags.length > 0);
  }, [groups, filter]);
  const total = groups.reduce((n, g) => n + g.tags.length, 0);
  const shown = visible.reduce((n, g) => n + g.tags.length, 0);

  const toggle = (name: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  return (
    <div className="flex flex-col min-h-0">
      <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] text-zinc-400">
          {shown !== total ? `${shown}/` : ''}{total} {t('metax.tagsUnit', 'tags')} · {groups.length} {t('metax.groupsUnit', 'grupos')}
        </span>
        <div className="relative w-60">
          <Search size={14} className="text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('metax.filterTags', 'Filtrar tag ou valor (ex: GPS, Model)...')}
            className="dh-input w-full pl-8 placeholder:text-zinc-600"
          />
        </div>
      </div>
      <div className="px-4 pb-3 overflow-y-auto max-h-[520px]">
        {visible.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-[12.5px] text-zinc-500">{t('metax.noTagMatch', 'Nenhuma tag corresponde ao filtro.')}</div>
        ) : visible.map((g) => (
          <div key={g.name} className="mt-3">
            <button type="button" onClick={() => toggle(g.name)} className="w-full flex items-center gap-2 py-1 text-left">
              {collapsed.has(g.name) ? <ChevronRight size={13} className="text-zinc-500" /> : <ChevronDown size={13} className="text-zinc-500" />}
              <span className="font-mono text-[11.5px] text-zinc-200">{g.name}</span>
              <span className="font-mono text-[10.5px] text-zinc-500">{g.tags.length}</span>
              {!g.writable && (
                <span className="dh-tag ml-auto inline-flex items-center gap-1 text-[10.5px]"><Lock size={10} />{t('metax.readOnly', 'somente leitura')}</span>
              )}
            </button>
            {!collapsed.has(g.name) && (
              <div className="divide-y divide-zinc-800/60 border-t border-zinc-800/60">
                {g.tags.map((tag) => {
                  const dirty = tag.key in edits;
                  return (
                    <div key={tag.key} className="py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="font-mono text-[11.5px] text-zinc-400 break-all sm:w-1/3">{tag.name}</span>
                      {tag.writable ? (
                        <input
                          type="text"
                          value={dirty ? edits[tag.key] : tag.value}
                          onChange={(e) => onEdit(tag.key, e.target.value)}
                          aria-label={tag.key}
                          className={`dh-input h-7 font-mono text-[12px] w-full sm:w-2/3 ${dirty ? 'border-blue-400/60' : ''}`}
                        />
                      ) : (
                        <span className={`font-mono text-[12px] w-full sm:w-2/3 break-all ${tag.binary ? 'text-zinc-500 italic' : 'text-zinc-300'}`} title={t('metax.readOnlyHint', 'Sem escritor seguro para este campo neste formato')}>
                          {tag.value}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
