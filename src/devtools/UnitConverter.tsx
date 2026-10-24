import React, { useMemo, useState } from 'react';
import { ArrowDownUp } from '../components/icons';
import { BASES, CATEGORIES, convert, findCategory, formatBase, formatNumber, isoToUnix, parseBase, unixToIso, unixToLocal, type TsUnit } from './units';
import { CopyButton, Segmented, selectCls, useDevT } from './ui';

type Mode = string; // category id | 'bases' | 'timestamp'

const CATEGORY_KEYS: Record<string, string> = {
  temperature: 'Temperatura', data: 'Armazenamento', datarate: 'Taxa de dados', length: 'Comprimento', mass: 'Massa', time: 'Tempo',
  speed: 'Velocidade', area: 'Área', volume: 'Volume', energy: 'Energia', pressure: 'Pressão', angle: 'Ângulo', frequency: 'Frequência',
};

/** Two linked fields: editing either one updates the other. */
const LinearConverter = ({ categoryId }: { categoryId: string }) => {
  const T = useDevT();
  const cat = findCategory(categoryId);
  const [state, setState] = useState<Record<string, { ua: string; ub: string; src: 'a' | 'b'; text: string }>>({});
  const s = state[cat.id] ?? { ua: cat.defaultFrom, ub: cat.defaultTo, src: 'a' as const, text: '1' };
  const set = (patch: Partial<typeof s>) => setState(prev => ({ ...prev, [cat.id]: { ...s, ...patch } }));

  const parsed = parseFloat(s.text.replace(',', '.'));
  const other = Number.isFinite(parsed) ? formatNumber(s.src === 'a' ? convert(cat.id, s.ua, s.ub, parsed) : convert(cat.id, s.ub, s.ua, parsed)) : '';
  const aText = s.src === 'a' ? s.text : other;
  const bText = s.src === 'b' ? s.text : other;

  const swap = () => set({ ua: s.ub, ub: s.ua, src: s.src, text: other || s.text });

  const unitLabel = (id: string) => cat.units.find(u => u.id === id)?.label ?? id;
  const row = (side: 'a' | 'b') => {
    const unit = side === 'a' ? s.ua : s.ub;
    const text = side === 'a' ? aText : bText;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-end">
        <div>
          <label className="dh-label block mb-1.5">{side === 'a' ? T('value', 'Valor') : T('result', 'Resultado')}</label>
          <input
            inputMode="decimal"
            aria-label={`${T('value', 'Valor')} ${unitLabel(unit)}`}
            value={text}
            onChange={e => set({ src: side, text: e.target.value })}
            className="dh-input w-full font-mono"
          />
        </div>
        <div>
          <label className="dh-label block mb-1.5">{T('unit', 'Unidade')}</label>
          <select
            aria-label={T('unit', 'Unidade')}
            value={unit}
            onChange={e => set(side === 'a' ? { ua: e.target.value } : { ub: e.target.value })}
            className={selectCls}
          >
            {cat.units.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
          </select>
        </div>
        <CopyButton text={text} />
      </div>
    );
  };

  return (
    <section className="dh-card p-5 space-y-3 max-w-3xl">
      {row('a')}
      <div className="flex justify-center">
        <button type="button" onClick={swap} className="dh-btn dh-btn-sm" title={T('swap', 'Inverter')}>
          <ArrowDownUp size={14} /> {T('swap', 'Inverter')}
        </button>
      </div>
      {row('b')}
      {cat.id === 'data' && (
        <p className="dh-help">{T('dataHelp', 'KB/MB/GB/TB são decimais (1000); KiB/MiB/GiB/TiB são binários (1024). Windows mostra valores binários, mas chama de GB.')}</p>
      )}
      {cat.id === 'datarate' && (
        <p className="dh-help">{T('rateHelp', 'Mbps = megabits por segundo (provedores de internet); MB/s = megabytes por segundo (downloads). 1 byte = 8 bits.')}</p>
      )}
    </section>
  );
};

const BaseConverter = () => {
  const T = useDevT();
  const [src, setSrc] = useState<number>(10);
  const [text, setText] = useState('255');
  const value = parseBase(text, src);
  return (
    <section className="dh-card p-5 space-y-3 max-w-3xl">
      <p className="dh-help">{T('basesHelp', 'Edite qualquer campo; os outros acompanham. Aceita prefixos 0x, 0b, 0o e números negativos grandes.')}</p>
      {BASES.map(base => {
        const shown = base === src ? text : value === null ? '' : formatBase(value, base);
        const name = base === 2 ? T('bin', 'Binário (2)') : base === 8 ? T('oct', 'Octal (8)') : base === 10 ? T('dec', 'Decimal (10)') : T('hex', 'Hexadecimal (16)');
        const invalid = base === src && text.trim() !== '' && value === null;
        return (
          <div key={base} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-center gap-3">
            <label htmlFor={`base-${base}`} className="dh-label">{name}</label>
            <input
              id={`base-${base}`}
              value={shown}
              spellCheck={false}
              aria-invalid={invalid}
              onChange={e => { setSrc(base); setText(e.target.value); }}
              className={`dh-input w-full font-mono ${invalid ? '!border-red-500/60' : ''}`}
            />
            <CopyButton text={shown} />
          </div>
        );
      })}
    </section>
  );
};

const TimestampConverter = () => {
  const T = useDevT();
  const [unit, setUnit] = useState<TsUnit>('s');
  const [src, setSrc] = useState<'unix' | 'iso'>('unix');
  const [text, setText] = useState(() => String(Math.floor(Date.now() / 1000)));

  const ms = useMemo(() => {
    if (src === 'unix') {
      const n = Number(text.trim());
      return text.trim() !== '' && Number.isFinite(n) ? (unit === 's' ? n * 1000 : n) : null;
    }
    const n = isoToUnix(text, 'ms');
    return n;
  }, [src, text, unit]);

  const unixOut = ms === null ? '' : String(unit === 's' ? Math.floor(ms / 1000) : ms);
  const isoOut = ms === null ? '' : unixToIso(ms, 'ms') ?? '';
  const localOut = ms === null ? '' : unixToLocal(ms, 'ms') ?? '';

  const fields: { id: 'unix' | 'iso'; label: string; value: string }[] = [
    { id: 'unix', label: `Unix (${unit === 's' ? T('seconds', 'segundos') : T('milliseconds', 'milissegundos')})`, value: src === 'unix' ? text : unixOut },
    { id: 'iso', label: 'ISO 8601 (UTC)', value: src === 'iso' ? text : isoOut },
  ];

  const changeUnit = (u: TsUnit) => {
    if (src === 'unix' && ms !== null) setText(String(u === 's' ? Math.floor(ms / 1000) : ms));
    setUnit(u);
  };

  return (
    <section className="dh-card p-5 space-y-3 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="dh-help">{T('tsHelp', 'Edite o Unix ou o ISO 8601; o outro e o horário local acompanham.')}</p>
        <Segmented value={unit} onChange={changeUnit} label={T('unit', 'Unidade')} options={[{ id: 's', label: T('seconds', 'segundos') }, { id: 'ms', label: 'ms' }]} />
      </div>
      {fields.map(f => (
        <div key={f.id} className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3">
          <label htmlFor={`ts-${f.id}`} className="dh-label">{f.label}</label>
          <input
            id={`ts-${f.id}`}
            value={f.value}
            spellCheck={false}
            aria-invalid={src === f.id && text.trim() !== '' && ms === null}
            onChange={e => { setSrc(f.id); setText(e.target.value); }}
            className={`dh-input w-full font-mono ${src === f.id && text.trim() !== '' && ms === null ? '!border-red-500/60' : ''}`}
          />
          <CopyButton text={f.value} />
        </div>
      ))}
      <div className="grid grid-cols-[150px_minmax(0,1fr)_auto] items-center gap-3">
        <span className="dh-label">{T('local', 'Horário local')}</span>
        <output className="font-mono text-[12.5px] text-zinc-100 h-8 flex items-center">{localOut || <span className="text-zinc-600">-</span>}</output>
        <CopyButton text={localOut} />
      </div>
      <button type="button" className="dh-btn dh-btn-sm" onClick={() => { setSrc('unix'); setText(String(unit === 's' ? Math.floor(Date.now() / 1000) : Date.now())); }}>
        {T('now', 'Agora')}
      </button>
    </section>
  );
};

const UnitConverter = () => {
  const T = useDevT();
  const [mode, setMode] = useState<Mode>('temperature');
  const items: { id: Mode; label: string }[] = [
    ...CATEGORIES.map(c => ({ id: c.id, label: T(`cat.${c.id}`, CATEGORY_KEYS[c.id] ?? c.label) })),
    { id: 'bases', label: T('cat.bases', 'Bases numéricas') },
    { id: 'timestamp', label: T('cat.timestamp', 'Timestamp') },
  ];
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={T('categories', 'Categorias')} className="flex flex-wrap gap-1.5">
        {items.map(i => (
          <button
            key={i.id}
            role="tab"
            aria-selected={mode === i.id}
            onClick={() => setMode(i.id)}
            className={`h-7 px-3 rounded-full border text-[12px] transition-colors ${mode === i.id ? 'border-blue-400/60 bg-blue-400/10 text-zinc-50' : 'border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'}`}
          >
            {i.label}
          </button>
        ))}
      </div>
      {mode === 'bases' ? <BaseConverter /> : mode === 'timestamp' ? <TimestampConverter /> : <LinearConverter key={mode} categoryId={mode} />}
    </div>
  );
};

export default UnitConverter;
