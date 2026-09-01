import React, { useState } from 'react'
import { X, Save, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { Game, GameProfile, OptiScalerConfig, defaultProfile } from './types'
import { ProfileEditor } from './ProfileEditor'
import { useI18n } from '../../i18n/I18nProvider'

interface GameEditorModalProps {
  game: Game
  onSave: (game: Game) => void
  onCancel: () => void
  onPickExe: () => void
  onPickWorkingDir: () => void
  onRemove?: () => void
}

export function GameEditorModal({
  game: initialGame,
  onSave,
  onCancel,
  onPickExe,
  onPickWorkingDir,
  onRemove
}: GameEditorModalProps) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<Game>(initialGame)
  const [activeTab, setActiveTab] = useState<'info' | 'profiles' | 'optiscaler'>('info')
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initialGame.defaultProfileId || (initialGame.profiles?.[0]?.id) || 'default'
  )

  const handleTagsChange = (val: string) => {
    const tags = val.split(',').map(x => x.trim()).filter(Boolean).map(x => x.toLowerCase())
    const uniq = Array.from(new Set(tags)).slice(0, 30)
    setEditing({ ...editing, tags: uniq })
  }

  const updateOptiscaler = (patch: Partial<OptiScalerConfig>) => {
    setEditing(prev => ({
      ...prev,
      optiscaler: { ...(prev.optiscaler ?? {}), ...patch }
    }))
  }

  const handleProfileChange = (patch: Partial<GameProfile>) => {
    const profiles = Array.isArray(editing.profiles) ? [...editing.profiles] : []
    const idx = profiles.findIndex(p => p.id === activeProfileId)
    if (idx >= 0) {
      profiles[idx] = { ...profiles[idx], ...patch }
      setEditing({ ...editing, profiles })
    }
  }

  const handleSetDefaultProfile = (isDefault: boolean) => {
    setEditing(prev => ({
      ...prev,
      defaultProfileId: isDefault ? activeProfileId : prev.defaultProfileId
    }))
  }

  const addProfile = () => {
    const profiles = Array.isArray(editing.profiles) ? [...editing.profiles] : []
    const id = `p_${Date.now()}_${Math.random().toString(16).slice(2)}`
    const next = { ...defaultProfile(), id, name: `Perfil ${profiles.length + 1}` }
    profiles.push(next)
    setEditing({ ...editing, profiles })
    setActiveProfileId(id)
  }

  const removeProfile = () => {
    const profiles = Array.isArray(editing.profiles) ? [...editing.profiles] : []
    if (profiles.length <= 1) return
    const next = profiles.filter(p => p.id !== activeProfileId)
    const defaultId = editing.defaultProfileId === activeProfileId ? next[0]?.id : editing.defaultProfileId
    setEditing({ ...editing, profiles: next, defaultProfileId: defaultId })
    setActiveProfileId(defaultId || next[0]?.id)
  }

  const handleSave = () => {
    onSave(editing)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-4xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/80 rounded-t-xl shrink-0">
          <div className="text-white font-semibold text-lg">{editing.id ? t('library.editGame', 'Editar jogo') : t('library.newGame', 'Novo jogo')}</div>
          <button onClick={onCancel} className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex px-6 border-b border-zinc-800 shrink-0">
          <button
            onClick={() => setActiveTab('info')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'info' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            {t('library.tab.general', 'Geral')}
          </button>
          <button
            onClick={() => setActiveTab('profiles')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'profiles' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            {t('library.tab.profiles', 'Perfis & Latência')}
          </button>
          <button
            onClick={() => setActiveTab('optiscaler')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'optiscaler' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            {t('library.tab.optiscaler', 'OptiScaler (Upscaling)')}
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 bg-zinc-950/50">
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">{t('library.form.name', 'Nome do Jogo')}</div>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">{t('library.form.exe', 'Executável (.exe)')}</div>
                  <div className="flex gap-2">
                    <input
                      value={editing.exePath}
                      onChange={(e) => setEditing({ ...editing, exePath: e.target.value })}
                      className="flex-1 bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                    />
                    <button onClick={onPickExe} className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-blue-400 rounded-lg transition-colors flex items-center justify-center">
                      <FolderOpen size={18} />
                    </button>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">{t('library.form.workingDir', 'Pasta de Trabalho (Opcional)')}</div>
                  <div className="flex gap-2">
                    <input
                      value={editing.workingDir ?? ''}
                      onChange={(e) => setEditing({ ...editing, workingDir: e.target.value })}
                      className="flex-1 bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                    />
                    <button onClick={onPickWorkingDir} className="px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-blue-400 rounded-lg transition-colors flex items-center justify-center">
                      <FolderOpen size={18} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">{t('library.form.args', 'Argumentos de Inicialização')}</div>
                  <input
                    value={editing.args ?? ''}
                    onChange={(e) => setEditing({ ...editing, args: e.target.value })}
                    placeholder="-fullscreen -novid"
                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-colors font-mono text-sm"
                  />
                </div>
                <div>
                  <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">{t('library.form.tags', 'Tags (separadas por vírgula)')}</div>
                  <input
                    value={Array.isArray(editing.tags) ? editing.tags.join(', ') : ''}
                    onChange={(e) => handleTagsChange(e.target.value)}
                    placeholder="fps, competitivo, dx12"
                    className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profiles' && (
            <div className="flex flex-col lg:flex-row gap-5 h-full">
              <div className="w-full lg:w-64 shrink-0 flex flex-col gap-3">
                <div className="font-semibold text-zinc-300 text-sm">{t('library.profiles.list', 'Lista de Perfis')}</div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex-1 flex flex-col min-h-[200px]">
                  <div className="overflow-y-auto flex-1 p-1">
                    {(editing.profiles ?? []).map(p => (
                      <button
                        key={p.id}
                        onClick={() => setActiveProfileId(p.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-md mb-1 transition-colors ${
                          activeProfileId === p.id
                            ? 'bg-blue-600/20 text-blue-400 font-medium'
                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        <div className="text-sm truncate">{p.name} {editing.defaultProfileId === p.id && <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded ml-1">Padrão</span>}</div>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 bg-zinc-950 border-t border-zinc-800 flex gap-2 shrink-0">
                    <button onClick={addProfile} className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1">
                      <Plus size={14} /> {t('library.profiles.add', 'Novo')}
                    </button>
                    <button
                      onClick={removeProfile}
                      disabled={(editing.profiles ?? []).length <= 1}
                      className="flex-1 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded text-xs font-medium transition-colors disabled:opacity-30 flex items-center justify-center gap-1"
                    >
                      <Trash2 size={14} /> {t('library.profiles.remove', 'Excluir')}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 bg-zinc-900 border border-zinc-800 p-5 rounded-lg">
                {(() => {
                  const p = (editing.profiles ?? []).find(x => x.id === activeProfileId) ?? editing.profiles?.[0];
                  if (!p) return null;
                  return (
                    <ProfileEditor
                      profile={p}
                      isDefault={editing.defaultProfileId === p.id}
                      onChange={handleProfileChange}
                      onSetDefault={handleSetDefaultProfile}
                    />
                  )
                })()}
              </div>
            </div>
          )}

          {activeTab === 'optiscaler' && (
            <div className="max-w-2xl">
              <div className="mb-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
                <h3 className="text-indigo-400 font-bold mb-1">OptiScaler (DLSS/FSR/XeSS Bridge)</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {t('library.optiscaler.desc', 'O OptiScaler injeta as tecnologias mais recentes de redimensionamento (Upscaling) em jogos que suportam DLSS, forçando-os a rodar com AMD FSR ou Intel XeSS para ganhar muitos FPS mesmo em placas de vídeo antigas.')}
                </p>
              </div>

              <div className="space-y-5">
                <label className="flex items-center gap-3 cursor-pointer p-4 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={Boolean(editing.optiscaler?.enabled)}
                    onChange={(e) => updateOptiscaler({ enabled: e.target.checked })}
                    className="accent-indigo-500 w-5 h-5"
                  />
                  <div>
                    <div className="text-white font-medium">{t('library.optiscaler.enable', 'Habilitar Injeção OptiScaler')}</div>
                    <div className="text-xs text-zinc-500">{t('library.optiscaler.enableDesc', 'Substitui a DLL nativa do DLSS pelo motor OptiScaler.')}</div>
                  </div>
                </label>

                <div className={`space-y-4 transition-opacity ${!editing.optiscaler?.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(editing.optiscaler?.applyOnLaunch)}
                      onChange={(e) => updateOptiscaler({ applyOnLaunch: e.target.checked })}
                      className="accent-indigo-500"
                    />
                    {t('library.optiscaler.applyOnLaunch', 'Injetar automaticamente sempre que abrir o jogo')}
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase">{t('library.optiscaler.loader', 'OptiScaler Loader')}</div>
                      <select
                        value={editing.optiscaler?.loader ?? 'auto'}
                        onChange={(e) => updateOptiscaler({ loader: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="auto">Auto-Detect</option>
                        <option value="nvngx">NVIDIA DLSS (nvngx.dll)</option>
                        <option value="fsr2">AMD FSR 2</option>
                        <option value="xess">Intel XeSS</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase">{t('library.optiscaler.upscaler', 'Tecnologia Destino (Upscaler)')}</div>
                      <select
                        value={editing.optiscaler?.upscaler ?? 'auto'}
                        onChange={(e) => updateOptiscaler({ upscaler: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="auto">Auto (Hardware Detect)</option>
                        <option value="fsr22">AMD FSR 2.2.1</option>
                        <option value="fsr31">AMD FSR 3.1</option>
                        <option value="xess">Intel XeSS</option>
                        <option value="dlss">NVIDIA DLSS (Pass-through)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase">{t('library.optiscaler.inputApi', 'API de Captura (Input API)')}</div>
                      <select
                        value={editing.optiscaler?.inputApi ?? 'auto'}
                        onChange={(e) => updateOptiscaler({ inputApi: e.target.value })}
                        className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                      >
                        <option value="auto">Automático</option>
                        <option value="dx11">DirectX 11</option>
                        <option value="dx12">DirectX 12</option>
                        <option value="vulkan">Vulkan</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-zinc-500 mb-1.5 uppercase">{t('library.optiscaler.targetDir', 'Pasta de Injeção Customizada')}</div>
                      <input
                        value={editing.optiscaler?.targetDir ?? ''}
                        onChange={(e) => updateOptiscaler({ targetDir: e.target.value })}
                        placeholder={t('library.optiscaler.targetDirPlaceholder', 'Padrão: mesma pasta do executável')}
                        className="w-full bg-zinc-900 border border-zinc-800 text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t border-zinc-800 bg-zinc-900/80 shrink-0 rounded-b-xl">
          <div>
            {editing.id && onRemove && (
              <button
                onClick={onRemove}
                className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Trash2 size={16} />
                {t('library.remove', 'Excluir Jogo')}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {t('library.cancel', 'Cancelar')}
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-emerald-900/20"
            >
              <Save size={18} />
              {t('library.save', 'Salvar Alterações')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
