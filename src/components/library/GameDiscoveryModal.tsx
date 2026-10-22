import React from 'react'
import { X, Check } from '../icons'
import { useI18n } from '../../i18n/I18nProvider'

interface DiscoveredGame {
  name: string
  exePath: string
  workingDir?: string
  platform: string
}

interface GameDiscoveryModalProps {
  discovered: DiscoveredGame[]
  selectedDiscovered: Record<number, boolean>
  onToggleSelection: (index: number, selected: boolean) => void
  onSelectAll: () => void
  onCancel: () => void
  onImport: () => void
}

export function GameDiscoveryModal({
  discovered,
  selectedDiscovered,
  onToggleSelection,
  onSelectAll,
  onCancel,
  onImport
}: GameDiscoveryModalProps) {
  const { t } = useI18n()

  const hasSelected = Object.values(selectedDiscovered).some(Boolean)

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/70 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl animate-in" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <div className="dh-section-title">
              {t('library.discovery.found', '{count} jogos encontrados').replace('{count}', String(discovered.length))}
            </div>
            <div className="dh-help mt-0.5">
              {t('library.discovery.subtitle', 'Selecione os que deseja importar para a biblioteca')}
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label={t('library.discovery.cancel', 'Cancelar')} className="dh-btn dh-btn-ghost dh-btn-sm px-2">
            <X size={14} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {discovered.length === 0 ? (
            <div className="px-5 py-10 text-center text-[12.5px] text-zinc-500">
              {t('library.discovery.empty', 'Nenhum jogo encontrado nas plataformas suportadas.')}
            </div>
          ) : (
            discovered.map((g, i) => (
              <label key={i} className="flex items-center gap-3 px-5 py-2.5 border-b border-zinc-800/80 last:border-b-0 hover:bg-zinc-800/40 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={!!selectedDiscovered[i]}
                  onChange={e => onToggleSelection(i, e.target.checked)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] text-zinc-100 font-medium truncate">{g.name}</div>
                  <div className="text-[11px] text-zinc-500 font-mono truncate">{g.exePath}</div>
                </div>
                <span className="dh-tag shrink-0">
                  {g.platform}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-between items-center px-5 py-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={onSelectAll}
            className="dh-btn dh-btn-ghost dh-btn-sm"
          >
            {t('library.discovery.selectAll', 'Selecionar todos')}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="dh-btn">
              {t('library.discovery.cancel', 'Cancelar')}
            </button>
            <button
              onClick={onImport}
              disabled={!hasSelected}
              type="button"
              className="dh-btn dh-btn-primary"
            >
              <Check size={14} />
              {t('library.discovery.import', 'Importar Selecionados')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
