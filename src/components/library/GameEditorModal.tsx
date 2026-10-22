import React, { useState } from 'react'
import { X, Save, FolderOpen, Plus, Trash2 } from '../icons'
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
    <div className="fixed inset-0 z-50 bg-zinc-950/70 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="w-full max-w-4xl rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl flex flex-col max-h-[90vh] animate-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-50">{editing.id ? t('library.editGame', 'Editar jogo') : t('library.newGame', 'Novo jogo')}</h2>
          <button type="button" onClick={onCancel} aria-label={t('library.cancel', 'Cancelar')} className="dh-btn dh-btn-ghost dh-btn-sm px-2">
            <X size={14} />
          </button>
        </div>

        <div role="tablist" className="flex gap-1 px-5 border-b border-zinc-800 shrink-0">
          <button
            type="button"
            role="tab"
            onClick={() => setActiveTab('info')}
            className={`-mb-px px-3 py-2.5 text-[12.5px] font-medium border-b transition-colors ${activeTab === 'info' ? 'border-blue-300 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            {t('library.tab.general', 'Geral')}
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => setActiveTab('profiles')}
            className={`-mb-px px-3 py-2.5 text-[12.5px] font-medium border-b transition-colors ${activeTab === 'profiles' ? 'border-blue-300 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            {t('library.tab.profiles', 'Perfis & Latência')}
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => setActiveTab('optiscaler')}
            className={`-mb-px px-3 py-2.5 text-[12.5px] font-medium border-b transition-colors ${activeTab === 'optiscaler' ? 'border-blue-300 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
          >
            {t('library.tab.optiscaler', 'OptiScaler (Upscaling)')}
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div>
                  <div className="dh-label mb-1.5">{t('library.form.name', 'Nome do Jogo')}</div>
                  <input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="dh-input w-full"
                  />
                </div>
                <div>
                  <div className="dh-label mb-1.5">{t('library.form.exe', 'Executável (.exe)')}</div>
                  <div className="flex gap-2">
                    <input
                      value={editing.exePath}
                      onChange={(e) => setEditing({ ...editing, exePath: e.target.value })}
                      className="dh-input flex-1 min-w-0 font-mono"
                    />
                    <button onClick={onPickExe} type="button" className="dh-btn px-2.5">
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>
                <div>
                  <div className="dh-label mb-1.5">{t('library.form.workingDir', 'Pasta de Trabalho (Opcional)')}</div>
                  <div className="flex gap-2">
                    <input
                      value={editing.workingDir ?? ''}
                      onChange={(e) => setEditing({ ...editing, workingDir: e.target.value })}
                      className="dh-input flex-1 min-w-0 font-mono"
                    />
                    <button onClick={onPickWorkingDir} type="button" className="dh-btn px-2.5">
                      <FolderOpen size={14} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <div className="dh-label mb-1.5">{t('library.form.args', 'Argumentos de Inicialização')}</div>
                  <input
                    value={editing.args ?? ''}
                    onChange={(e) => setEditing({ ...editing, args: e.target.value })}
                    placeholder="-fullscreen -novid"
                    className="dh-input w-full font-mono"
                  />
                </div>
                <div>
                  <div className="dh-label mb-1.5">{t('library.form.tags', 'Tags (separadas por vírgula)')}</div>
                  <input
                    value={Array.isArray(editing.tags) ? editing.tags.join(', ') : ''}
                    onChange={(e) => handleTagsChange(e.target.value)}
                    placeholder="fps, competitivo, dx12"
                    className="dh-input w-full"
                  />
                </div>
                <div>
                  <div className="dh-label mb-1.5">Steam AppID (Opcional)</div>
                  <input
                    type="number"
                    value={editing.steamAppId || ''}
                    onChange={(e) => setEditing({ ...editing, steamAppId: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="ex: 1245620"
                    className="dh-input w-full font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profiles' && (
            <div className="flex flex-col lg:flex-row gap-5 h-full">
              <div className="w-full lg:w-64 shrink-0 flex flex-col gap-3">
                <div className="dh-label">{t('library.profiles.list', 'Lista de Perfis')}</div>
                <div className="border border-zinc-800 rounded-lg overflow-hidden flex-1 flex flex-col min-h-[200px]">
                  <div className="overflow-y-auto flex-1 p-1">
                    {(editing.profiles ?? []).map(p => (
                      <button
                        key={p.id}
                        onClick={() => setActiveProfileId(p.id)}
                        className={`w-full text-left px-2.5 py-2 rounded-md mb-0.5 transition-colors ${
                          activeProfileId === p.id
                            ? 'bg-zinc-800 text-zinc-50'
                            : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
                        }`}
                      >
                        <div className="text-[12.5px] truncate">{p.name} {editing.defaultProfileId === p.id && <span className="dh-tag ml-1">padrão</span>}</div>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-zinc-800 flex gap-2 shrink-0">
                    <button type="button" onClick={addProfile} className="dh-btn dh-btn-sm flex-1">
                      <Plus size={13} /> {t('library.profiles.add', 'Novo')}
                    </button>
                    <button
                      onClick={removeProfile}
                      disabled={(editing.profiles ?? []).length <= 1}
                      type="button"
                      className="dh-btn dh-btn-danger dh-btn-sm flex-1"
                    >
                      <Trash2 size={13} /> {t('library.profiles.remove', 'Excluir')}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex-1 border border-zinc-800 p-5 rounded-lg">
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
              <div className="mb-5">
                <h3 className="dh-section-title">OptiScaler <span className="dh-tag ml-1">dlss · fsr · xess bridge</span></h3>
                <p className="dh-help mt-1 max-w-[75ch]">
                  {t('library.optiscaler.desc', 'O OptiScaler injeta as tecnologias mais recentes de redimensionamento (Upscaling) em jogos que suportam DLSS, forçando-os a rodar com AMD FSR ou Intel XeSS para ganhar muitos FPS mesmo em placas de vídeo antigas.')}
                </p>
              </div>

              <div className="space-y-5">
                <label className="flex items-center gap-3 cursor-pointer px-4 py-3 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={Boolean(editing.optiscaler?.enabled)}
                    onChange={(e) => updateOptiscaler({ enabled: e.target.checked })}
                  />
                  <div>
                    <div className="text-[13px] text-zinc-100 font-medium">{t('library.optiscaler.enable', 'Habilitar Injeção OptiScaler')}</div>
                    <div className="dh-help">{t('library.optiscaler.enableDesc', 'Substitui a DLL nativa do DLSS pelo motor OptiScaler.')}</div>
                  </div>
                </label>

                <div className={`space-y-4 transition-opacity ${!editing.optiscaler?.enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                  <label className="flex items-center gap-2 text-[12.5px] text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(editing.optiscaler?.applyOnLaunch)}
                      onChange={(e) => updateOptiscaler({ applyOnLaunch: e.target.checked })}
                    />
                    {t('library.optiscaler.applyOnLaunch', 'Injetar automaticamente sempre que abrir o jogo')}
                  </label>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="dh-label mb-1.5">{t('library.optiscaler.loader', 'OptiScaler Loader')}</div>
                      <select
                        value={editing.optiscaler?.loader ?? 'auto'}
                        onChange={(e) => updateOptiscaler({ loader: e.target.value })}
                        className="dh-input w-full"
                      >
                        <option value="auto">Auto-Detect</option>
                        <option value="nvngx">NVIDIA DLSS (nvngx.dll)</option>
                        <option value="fsr2">AMD FSR 2</option>
                        <option value="xess">Intel XeSS</option>
                      </select>
                    </div>
                    <div>
                      <div className="dh-label mb-1.5">{t('library.optiscaler.upscaler', 'Tecnologia Destino (Upscaler)')}</div>
                      <select
                        value={editing.optiscaler?.upscaler ?? 'auto'}
                        onChange={(e) => updateOptiscaler({ upscaler: e.target.value })}
                        className="dh-input w-full"
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
                      <div className="dh-label mb-1.5">{t('library.optiscaler.inputApi', 'API de Captura (Input API)')}</div>
                      <select
                        value={editing.optiscaler?.inputApi ?? 'auto'}
                        onChange={(e) => updateOptiscaler({ inputApi: e.target.value })}
                        className="dh-input w-full"
                      >
                        <option value="auto">Automático</option>
                        <option value="dx11">DirectX 11</option>
                        <option value="dx12">DirectX 12</option>
                        <option value="vulkan">Vulkan</option>
                      </select>
                    </div>
                    <div>
                      <div className="dh-label mb-1.5">{t('library.optiscaler.targetDir', 'Pasta de Injeção Customizada')}</div>
                      <input
                        value={editing.optiscaler?.targetDir ?? ''}
                        onChange={(e) => updateOptiscaler({ targetDir: e.target.value })}
                        placeholder={t('library.optiscaler.targetDirPlaceholder', 'Padrão: mesma pasta do executável')}
                        className="dh-input w-full font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-5 py-3 border-t border-zinc-800 shrink-0">
          <div>
            {editing.id && onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="dh-btn dh-btn-danger"
              >
                <Trash2 size={14} />
                {t('library.remove', 'Excluir Jogo')}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="dh-btn"
            >
              {t('library.cancel', 'Cancelar')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="dh-btn dh-btn-primary"
            >
              <Save size={14} />
              {t('library.save', 'Salvar Alterações')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
