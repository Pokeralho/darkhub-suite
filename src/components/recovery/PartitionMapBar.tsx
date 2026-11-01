import React from 'react';
import type { RescueLayoutItem } from '../../global';
import { useI18n } from '../../i18n/I18nProvider';
import { fmtBytes, KIND_STYLE } from './rescueUtils';

/**
 * Proportional bar of the disk: one segment per partition / free gap. Tiny segments keep a minimum width so they
 * stay clickable; widths are then renormalised.
 */
export default function PartitionMapBar({ layout, totalSectors, selected, onSelect }: {
  layout: RescueLayoutItem[];
  totalSectors: number;
  selected?: number | null;
  onSelect?: (item: RescueLayoutItem) => void;
}) {
  const { t } = useI18n();
  if (!layout.length || !totalSectors) {
    return <div className="h-12 rounded-lg border border-dashed border-zinc-800 grid place-items-center text-[12px] text-zinc-500">{t('rescue.map.empty', 'Nenhuma partição reconhecida neste disco.')}</div>;
  }
  const raw = layout.map((p) => Math.max(1.2, (p.sectors / totalSectors) * 100));
  const sum = raw.reduce((a, b) => a + b, 0);
  const kinds = Array.from(new Set(layout.map((p) => p.kind)));
  return (
    <div className="space-y-2">
      <div className="flex h-12 w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950" role="list" aria-label={t('rescue.map.aria', 'Mapa de partições')}>
        {layout.map((p, i) => {
          const st = KIND_STYLE[p.kind];
          const isSel = p.index != null && p.index === selected;
          const name = p.kind === 'unallocated' ? t('rescue.map.free', 'Não alocado') : `${p.fs || ''}${p.label ? ` "${p.label}"` : ''}`;
          return (
            <button
              key={`${p.start_lba}-${i}`}
              type="button"
              role="listitem"
              disabled={p.kind === 'unallocated' || !onSelect}
              onClick={() => onSelect?.(p)}
              title={`${name} · ${fmtBytes(p.size)} · LBA ${p.start_lba}`}
              style={{ width: `${(raw[i] / sum) * 100}%` }}
              className={`relative h-full min-w-0 border-r border-zinc-950 last:border-r-0 px-1.5 text-left transition-colors duration-150 ${st.bar} ${p.kind === 'unallocated' ? 'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,0.03)_6px_12px)]' : 'hover:brightness-125'} ${isSel ? 'ring-2 ring-inset ring-zinc-50' : ''}`}
            >
              <span className="block truncate text-[11px] font-medium text-zinc-50/90">{name}</span>
              <span className="block truncate font-mono text-[10.5px] text-zinc-100/70">{fmtBytes(p.size)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
        {kinds.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-sm ${KIND_STYLE[k].dot}`} />
            {k === 'unallocated' ? t('rescue.map.free', 'Não alocado') : KIND_STYLE[k].label}
          </span>
        ))}
      </div>
    </div>
  );
}
