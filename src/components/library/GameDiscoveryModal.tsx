import React from 'react'
import { Gamepad2, X, Check } from 'lucide-react'
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-2xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <div className="text-white font-semibold flex items-center gap-2">
              <Gamepad2 size={18} className="text-indigo-400" />
              {t('library.discovery.found', '{count} jogos encontrados').replace('{count}', String(discovered.length))}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {t('library.discovery.subtitle', 'Selecione os que deseja importar para a biblioteca')}
            </div>
          </div>
          <button onClick={onCancel} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {discovered.length === 0 ? (
            <div className="p-6 text-center text-zinc-500">
              {t('library.discovery.empty', 'Nenhum jogo encontrado nas plataformas suportadas.')}
            </div>
          ) : (
            discovered.map((g, i) => (
              <label key={i} className="flex items-center gap-3 px-5 py-3 border-b border-zinc-800 last:border-b-0 hover:bg-zinc-800/50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={!!selectedDiscovered[i]}
                  onChange={e => onToggleSelection(i, e.target.checked)}
                  className="accent-indigo-500 w-4 h-4"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{g.name}</div>
                  <div className="text-xs text-zinc-500 font-mono truncate">{g.exePath}</div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  g.platform === 'Steam' ? 'bg-blue-500/20 text-blue-300' :
                  g.platform === 'Epic Games' ? 'bg-purple-500/20 text-purple-300' :
                  g.platform === 'GOG' ? 'bg-amber-500/20 text-amber-300' :
                  'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {g.platform}
                </span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-between items-center px-5 py-4 border-t border-zinc-800 bg-zinc-900/50">
          <button
            onClick={onSelectAll}
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {t('library.discovery.selectAll', 'Selecionar todos')}
          </button>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors text-sm font-medium">
              {t('library.discovery.cancel', 'Cancelar')}
            </button>
            <button
              onClick={onImport}
              disabled={!hasSelected}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors text-sm flex items-center gap-2 font-medium shadow-lg shadow-indigo-900/20"
            >
              <Check size={16} />
              {t('library.discovery.import', 'Importar Selecionados')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
