import React, { useEffect, useState } from 'react';
import { Save, Trash2, Loader2, ShieldAlert } from '../../components/icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { MetaxFsInfo } from './metaxTypes';

interface Props {
  path: string;
  info: MetaxFsInfo;
  busy: boolean;
  onApply: (props: { created?: number; modified?: number; accessed?: number; readOnly?: boolean; hidden?: boolean }) => void;
  onRemoveStream: (name: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** ms -> value for <input type="datetime-local" step="1"> (local time). */
export function toLocalInput(ms: number): string {
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
export function fromLocalInput(s: string): number | undefined {
  if (!s) return undefined;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

const ZONES: Record<number, [string, string]> = {
  0: ['metax.zone0', 'Computador local'],
  1: ['metax.zone1', 'Intranet'],
  2: ['metax.zone2', 'Sites confiáveis'],
  3: ['metax.zone3', 'Internet'],
  4: ['metax.zone4', 'Sites restritos']
};

/** Filesystem side of any file: timestamps, attributes and NTFS alternate data streams. */
export default function MetaxFilePanel({ path, info, busy, onApply, onRemoveStream }: Props) {
  const { t } = useI18n();
  const [created, setCreated] = useState('');
  const [modified, setModified] = useState('');
  const [accessed, setAccessed] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setCreated(toLocalInput(info.created));
    setModified(toLocalInput(info.modified));
    setAccessed(toLocalInput(info.accessed));
    setReadOnly(info.readOnly);
    setHidden(info.hidden);
  }, [path, info]);

  const apply = () => {
    const props: { created?: number; modified?: number; accessed?: number; readOnly?: boolean; hidden?: boolean } = {};
    if (created !== toLocalInput(info.created)) props.created = fromLocalInput(created);
    if (modified !== toLocalInput(info.modified)) props.modified = fromLocalInput(modified);
    if (accessed !== toLocalInput(info.accessed)) props.accessed = fromLocalInput(accessed);
    if (readOnly !== info.readOnly) props.readOnly = readOnly;
    if (hidden !== info.hidden) props.hidden = hidden;
    onApply(props);
  };

  const zone = info.zone;
  const zoneLabel = zone?.zoneId != null && ZONES[zone.zoneId] ? t(ZONES[zone.zoneId][0], ZONES[zone.zoneId][1]) : String(zone?.zoneId ?? '?');

  return (
    <div className="p-4 space-y-5">
      <div className="space-y-3">
        <h3 className="dh-section-title">{t('metax.fsTimes', 'Datas do sistema de arquivos')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
          {([
            ['metax.created', 'Criado em', created, setCreated],
            ['metax.modified', 'Modificado em', modified, setModified],
            ['metax.accessed', 'Último acesso', accessed, setAccessed]
          ] as const).map(([key, fallback, value, set]) => (
            <label key={key} className="space-y-1.5 block">
              <span className="dh-label block">{t(key, fallback)}</span>
              <input type="datetime-local" step={1} value={value} onChange={(e) => set(e.target.value)} className="dh-input w-full font-mono text-[12px]" />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-zinc-300">
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />{t('metax.attrReadOnly', 'Somente leitura')}</label>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />{t('metax.attrHidden', 'Oculto')}</label>
          {info.system && <span className="dh-tag">{t('metax.attrSystem', 'Sistema')}</span>}
          {info.archive && <span className="dh-tag">{t('metax.attrArchive', 'Arquivo (A)')}</span>}
          <button onClick={apply} disabled={busy} className="dh-btn dh-btn-sm ml-auto">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {t('metax.applyFsProps', 'Aplicar datas e atributos')}
          </button>
        </div>
        <p className="dh-help">{t('metax.fsHint', 'Altera apenas o registro do arquivo no disco (NTFS), não o conteúdo.')}</p>
      </div>

      <div className="space-y-2 pt-4 border-t border-zinc-800/80">
        <h3 className="dh-section-title">{t('metax.zoneTitle', 'Marca "baixado da internet" (Zone.Identifier)')}</h3>
        {zone ? (
          <div className="flex items-start gap-3 text-[12.5px]">
            <ShieldAlert size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <div className="text-zinc-200">{t('metax.zoneLabel', 'Zona')}: {zoneLabel}</div>
              {zone.hostUrl && <div className="font-mono text-[11.5px] text-zinc-400 break-all">{t('metax.zoneHost', 'Origem')}: {zone.hostUrl}</div>}
              {zone.referrerUrl && <div className="font-mono text-[11.5px] text-zinc-400 break-all">{t('metax.zoneReferrer', 'Página')}: {zone.referrerUrl}</div>}
            </div>
            <button onClick={() => onRemoveStream('Zone.Identifier')} disabled={busy} className="dh-btn dh-btn-sm ml-auto shrink-0">
              <Trash2 size={14} />{t('metax.zoneRemove', 'Remover marca')}
            </button>
          </div>
        ) : (
          <p className="text-[12.5px] text-zinc-500">{t('metax.zoneNone', 'Este arquivo não tem a marca de download.')}</p>
        )}
      </div>

      <div className="space-y-2 pt-4 border-t border-zinc-800/80">
        <h3 className="dh-section-title">{t('metax.streamsTitle', 'Fluxos de dados alternativos (NTFS ADS)')}</h3>
        {!info.streamsSupported ? (
          <p className="text-[12.5px] text-zinc-500">{t('metax.streamsUnsupported', 'Não foi possível listar fluxos neste volume.')}</p>
        ) : info.streams.length === 0 ? (
          <p className="text-[12.5px] text-zinc-500">{t('metax.streamsNone', 'Nenhum fluxo alternativo.')}</p>
        ) : (
          <div className="divide-y divide-zinc-800/60">
            {info.streams.map((s) => (
              <div key={s.name} className="py-1.5 flex items-center gap-3">
                <span className="font-mono text-[12px] text-zinc-300 break-all">:{s.name}</span>
                <span className="font-mono text-[11px] text-zinc-500">{s.size} B</span>
                <button onClick={() => onRemoveStream(s.name)} disabled={busy} className="dh-btn dh-btn-ghost dh-btn-sm ml-auto" aria-label={t('metax.streamRemove', 'Remover fluxo')} title={t('metax.streamRemove', 'Remover fluxo')}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
