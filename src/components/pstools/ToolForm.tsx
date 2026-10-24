import React from 'react';
import { FolderOpen, Save } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';
import type { ParamDef, ParamValues, ToolDef } from './psSchema';

interface Props {
  tool: ToolDef;
  values: ParamValues;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (key: string, value: string | number | boolean) => void;
}

const api = () => window.darkhub?.powershell;

/** Parameter form generated from the tool schema. Booleans go in their own row below the fields. */
export default function ToolForm({ tool, values, errors, disabled, onChange }: Props) {
  const { t } = useI18n();
  const label = (p: ParamDef) => t(`psx.param.${tool.id}.${p.key}`, p.label);
  const errText = (p: ParamDef, code: string) => {
    if (code === 'min' || code === 'max' || code === 'number') {
      return t('psx.err.range', 'Use um número inteiro entre {min} e {max}.').replace('{min}', String(p.min ?? 0)).replace('{max}', String(p.max ?? ''));
    }
    return t(`psx.err.${code}`, code);
  };

  const pickFolder = async (p: ParamDef) => {
    const cur = String(values[p.key] ?? '');
    const r = await api()?.pickFolder({ defaultPath: /^[A-Za-z]:\\/.test(cur) ? cur : undefined });
    if (r?.ok && r.path) onChange(p.key, r.path);
  };
  const pickSave = async (p: ParamDef) => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const r = await api()?.pickSavePath({ ext: p.ext || 'html', defaultName: `${tool.id}-${stamp}` });
    if (r?.ok && r.path) onChange(p.key, r.path);
  };

  const fields = tool.params.filter((p) => p.type !== 'bool');
  const bools = tool.params.filter((p) => p.type === 'bool');
  if (!tool.params.length) return <p className="dh-help">{t('psx.form.noParams', 'Esta ferramenta não tem opções: é só executar.')}</p>;

  return (
    <div className="space-y-3">
      {fields.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          {fields.map((p) => {
            const id = `psx-${tool.id}-${p.key}`;
            const err = errors[p.key];
            const wide = p.type === 'folder' || p.type === 'savePath' || p.type === 'patterns';
            return (
              <div key={p.key} className={`min-w-0 ${wide ? 'md:col-span-2' : ''}`}>
                <label htmlFor={id} className="dh-label block mb-1">{label(p)}</label>
                {p.type === 'select' ? (
                  <select id={id} className="dh-input w-full" disabled={disabled} value={String(values[p.key])} onChange={(e) => onChange(p.key, e.target.value)}>
                    {(p.options || []).map((o) => <option key={o.value} value={o.value}>{t(`psx.opt.${tool.id}.${p.key}.${o.value}`, o.label)}</option>)}
                  </select>
                ) : p.type === 'folder' || p.type === 'savePath' ? (
                  <div className="flex gap-2">
                    <input
                      id={id} className="dh-input flex-1 min-w-0 font-mono" disabled={disabled} spellCheck={false}
                      readOnly={p.type === 'savePath'}
                      placeholder={p.type === 'savePath' ? t('psx.form.pickSave', 'Clique em Escolher...') : 'C:\\...'}
                      value={String(values[p.key] ?? '')} aria-invalid={!!err}
                      onChange={(e) => onChange(p.key, e.target.value)}
                    />
                    <button type="button" className="dh-btn shrink-0" disabled={disabled} onClick={() => (p.type === 'folder' ? pickFolder(p) : pickSave(p))}>
                      {p.type === 'folder' ? <FolderOpen size={14} /> : <Save size={14} />}{t('psx.form.choose', 'Escolher')}
                    </button>
                  </div>
                ) : (
                  <input
                    id={id} className={`dh-input w-full ${p.type === 'patterns' ? 'font-mono' : ''}`} disabled={disabled} spellCheck={false}
                    type={p.type === 'number' ? 'number' : 'text'} min={p.min} max={p.max} maxLength={p.maxLength}
                    value={String(values[p.key] ?? '')} aria-invalid={!!err}
                    onChange={(e) => onChange(p.key, p.type === 'number' ? e.target.value : e.target.value)}
                  />
                )}
                {err ? <p className="mt-1 text-[11.5px] text-red-300">{errText(p, err)}</p> : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {bools.length ? (
        <div className="flex flex-col gap-2">
          {bools.map((p) => (
            <label key={p.key} className="inline-flex items-center gap-2 text-[12.5px] text-zinc-300 cursor-pointer select-none">
              <input type="checkbox" className="accent-blue-400" disabled={disabled} checked={values[p.key] === true} onChange={(e) => onChange(p.key, e.target.checked)} />
              {label(p)}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}
