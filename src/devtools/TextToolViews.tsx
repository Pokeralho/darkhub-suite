import React, { useMemo, useState } from 'react';
import { RefreshCw } from '../components/icons';
import {
  decodeJwt, decodeText, encodeText, entropyBits, explainCron, generatePassword, lorem, nextCronRuns, regexSegments, strengthLabel, ulid, ulidTime, uuidV4,
  type EncodeKind,
} from './textTools';
import { CopyButton, Segmented, textareaCls, useDevT } from './ui';

// ---------------- Base64 / URL / HTML ----------------
export const EncodeTool = () => {
  const T = useDevT();
  const [kind, setKind] = useState<EncodeKind>('base64');
  const [dir, setDir] = useState<'encode' | 'decode'>('encode');
  const [input, setInput] = useState('');
  const { output, error } = useMemo(() => {
    if (!input) return { output: '', error: '' };
    try { return { output: dir === 'encode' ? encodeText(kind, input) : decodeText(kind, input), error: '' }; }
    catch { return { output: '', error: T('invalidInput', 'Entrada inválida para esta conversão.') }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, dir, input]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={kind} onChange={setKind} label={T('format', 'Formato')} options={[{ id: 'base64', label: 'Base64' }, { id: 'url', label: 'URL' }, { id: 'html', label: 'HTML' }]} />
        <Segmented value={dir} onChange={setDir} label={T('direction', 'Direção')} options={[{ id: 'encode', label: T('encode', 'Codificar') }, { id: 'decode', label: T('decode', 'Decodificar') }]} />
        <button type="button" className="dh-btn dh-btn-sm" disabled={!output} onClick={() => { setInput(output); setDir(dir === 'encode' ? 'decode' : 'encode'); }}>
          {T('useAsInput', 'Usar resultado como entrada (inverter)')}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="enc-in" className="dh-label block mb-1.5">{T('input', 'Entrada')}</label>
          <textarea id="enc-in" value={input} onChange={e => setInput(e.target.value)} spellCheck={false} className={`${textareaCls} h-72`} />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5"><label htmlFor="enc-out" className="dh-label">{T('output', 'Resultado')}</label><CopyButton text={output} /></div>
          {error ? <div role="alert" className="h-72 rounded-md border border-red-500/30 bg-red-500/[0.06] p-4 text-[12.5px] text-red-300">{error}</div>
            : <textarea id="enc-out" readOnly value={output} spellCheck={false} className={`${textareaCls} h-72 bg-zinc-900/40`} />}
        </div>
      </div>
    </div>
  );
};

// ---------------- UUID / ULID ----------------
export const IdTool = () => {
  const T = useDevT();
  const [kind, setKind] = useState<'uuid' | 'ulid'>('uuid');
  const [count, setCount] = useState(5);
  const make = (k: 'uuid' | 'ulid', n: number) => Array.from({ length: n }, () => (k === 'uuid' ? uuidV4() : ulid()));
  const [ids, setIds] = useState<string[]>(() => make('uuid', 5));
  const regen = (k = kind, n = count) => setIds(make(k, n));
  const [probe, setProbe] = useState('');
  const probeMs = ulidTime(probe.trim());
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={kind} onChange={k => { setKind(k); regen(k); }} label={T('type', 'Tipo')} options={[{ id: 'uuid', label: 'UUID v4' }, { id: 'ulid', label: 'ULID' }]} />
        <label className="dh-label flex items-center gap-2">{T('quantity', 'Quantidade')}
          <input type="number" min={1} max={100} value={count} onChange={e => { const n = Math.min(100, Math.max(1, Number(e.target.value) || 1)); setCount(n); regen(kind, n); }} className="dh-input w-20 font-mono" />
        </label>
        <button type="button" className="dh-btn dh-btn-primary dh-btn-sm" onClick={() => regen()}><RefreshCw size={14} /> {T('generate', 'Gerar')}</button>
        <CopyButton text={ids.join('\n')} label={T('copyAll', 'Copiar todos')} />
      </div>
      <ul className="dh-card divide-y divide-zinc-800/80">
        {ids.map(id => (
          <li key={id} className="flex items-center justify-between px-4 py-2"><span className="font-mono text-[13px] text-zinc-100 select-all">{id}</span><CopyButton text={id} /></li>
        ))}
      </ul>
      {kind === 'ulid' && (
        <div className="dh-card p-4 space-y-2">
          <label htmlFor="ulid-probe" className="dh-label block">{T('ulidDate', 'Ler a data de um ULID')}</label>
          <input id="ulid-probe" value={probe} onChange={e => setProbe(e.target.value)} spellCheck={false} className="dh-input w-full font-mono" placeholder="01HV..." />
          {probe && <p className="dh-help font-mono">{probeMs === null ? T('invalidUlid', 'ULID inválido') : new Date(probeMs).toISOString()}</p>}
        </div>
      )}
    </div>
  );
};

// ---------------- JWT ----------------
export const JwtTool = () => {
  const T = useDevT();
  const [token, setToken] = useState('');
  const res = useMemo(() => {
    if (!token.trim()) return null;
    try { return { ok: true as const, jwt: decodeJwt(token) }; } catch (e: any) { return { ok: false as const, error: String(e?.message || e) }; }
  }, [token]);
  const fmt = (v: unknown) => JSON.stringify(v, null, 2);
  const exp = res?.ok ? res.jwt.expiresAt : undefined;
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="jwt-in" className="dh-label block mb-1.5">{T('jwtToken', 'Token JWT')}</label>
        <textarea id="jwt-in" value={token} onChange={e => setToken(e.target.value)} spellCheck={false} className={`${textareaCls} h-28 break-all`} placeholder="eyJhbGciOi..." />
      </div>
      {res && !res.ok && <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/[0.06] p-3 text-[12.5px] text-red-300">{T('invalidJwt', 'JWT inválido')}: {res.error}</div>}
      {res?.ok && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[['Header', res.jwt.header], ['Payload', res.jwt.payload]].map(([name, val]) => (
              <section key={name as string} className="dh-card p-4">
                <div className="flex items-center justify-between mb-2"><h2 className="dh-section-title">{name as string}</h2><CopyButton text={fmt(val)} /></div>
                <pre className="font-mono text-[12.5px] text-zinc-200 whitespace-pre-wrap break-all">{fmt(val)}</pre>
              </section>
            ))}
          </div>
          <div className="dh-help space-y-0.5">
            {exp !== undefined && <p>{exp < Date.now() ? T('expired', 'Expirado em') : T('expiresAt', 'Expira em')}: <span className="font-mono text-zinc-300">{new Date(exp).toLocaleString()}</span></p>}
            {res.jwt.issuedAt !== undefined && <p>{T('issuedAt', 'Emitido em')}: <span className="font-mono text-zinc-300">{new Date(res.jwt.issuedAt).toLocaleString()}</span></p>}
            <p>{T('jwtNoVerify', 'Somente decodificação: a assinatura NÃO é verificada, então não prova que o token é autêntico. Tudo é processado localmente.')}</p>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------- Regex ----------------
export const RegexTool = () => {
  const T = useDevT();
  const [pattern, setPattern] = useState('\\b\\w{5}\\b');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('Hello world, hello DarkHub tools!');
  const res = useMemo(() => {
    if (!pattern) return null;
    try { return { ok: true as const, ...regexSegments(pattern, flags.replace(/[^dgimsuvy]/g, ''), text) }; } catch (e: any) { return { ok: false as const, error: String(e?.message || e) }; }
  }, [pattern, flags, text]);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
        <div>
          <label htmlFor="re-p" className="dh-label block mb-1.5">{T('pattern', 'Expressão regular')}</label>
          <input id="re-p" value={pattern} onChange={e => setPattern(e.target.value)} spellCheck={false} aria-invalid={res?.ok === false} className="dh-input w-full font-mono" />
        </div>
        <div>
          <label htmlFor="re-f" className="dh-label block mb-1.5">{T('flags', 'Flags')}</label>
          <input id="re-f" value={flags} onChange={e => setFlags(e.target.value)} spellCheck={false} className="dh-input w-full font-mono" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="re-t" className="dh-label block mb-1.5">{T('testText', 'Texto de teste')}</label>
          <textarea id="re-t" value={text} onChange={e => setText(e.target.value)} spellCheck={false} className={`${textareaCls} h-64`} />
        </div>
        <div>
          <div className="dh-label mb-1.5">{res?.ok ? `${T('matches', 'Ocorrências')}: ${res.count}` : T('matches', 'Ocorrências')}</div>
          {res && !res.ok ? <div role="alert" className="h-64 rounded-md border border-red-500/30 bg-red-500/[0.06] p-4 font-mono text-[12.5px] text-red-300">{res.error}</div> : (
            <div className="dh-card h-64 overflow-auto p-3 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-zinc-400">
              {res?.ok ? res.segments.map((s, i) => s.match ? <mark key={i} className="bg-amber-400/25 text-amber-100 rounded-sm px-px">{s.text}</mark> : <span key={i}>{s.text}</span>) : text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------- Cron ----------------
export const CronTool = () => {
  const T = useDevT();
  const [expr, setExpr] = useState('*/15 9-17 * * 1-5');
  const res = useMemo(() => {
    try { return { ok: true as const, text: explainCron(expr), runs: nextCronRuns(expr, 5) }; } catch (e: any) { return { ok: false as const, error: String(e?.message || e) }; }
  }, [expr]);
  const presets = ['*/5 * * * *', '0 * * * *', '0 0 * * *', '0 9 * * 1-5', '0 0 1 * *', '@weekly'];
  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <label htmlFor="cron-in" className="dh-label block mb-1.5">{T('cronExpr', 'Expressão cron (minuto hora dia mês dia-da-semana)')}</label>
        <input id="cron-in" value={expr} onChange={e => setExpr(e.target.value)} spellCheck={false} aria-invalid={!res.ok} className="dh-input w-full font-mono text-[14px]" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map(p => <button key={p} type="button" onClick={() => setExpr(p)} className="h-7 px-2.5 rounded-md border border-zinc-800 text-[12px] font-mono text-zinc-400 hover:text-zinc-100 hover:border-zinc-700">{p}</button>)}
      </div>
      {res.ok ? (
        <div className="dh-card p-4 space-y-3">
          <p className="text-[14px] text-zinc-50">{res.text}</p>
          <div>
            <div className="dh-label mb-1">{T('nextRuns', 'Próximas execuções (horário local)')}</div>
            <ul className="font-mono text-[12.5px] text-zinc-300 space-y-0.5">{res.runs.map(d => <li key={d.getTime()}>{d.toLocaleString()}</li>)}{res.runs.length === 0 && <li className="text-zinc-500">-</li>}</ul>
          </div>
        </div>
      ) : <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/[0.06] p-3 text-[12.5px] text-red-300">{res.error}</div>}
    </div>
  );
};

// ---------------- Lorem ipsum ----------------
export const LoremTool = () => {
  const T = useDevT();
  const [paras, setParas] = useState(3);
  const [sents, setSents] = useState(5);
  const [seed, setSeed] = useState(1);
  const text = useMemo(() => lorem(paras, sents, seed), [paras, sents, seed]);
  const num = (v: number, set: (n: number) => void, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => set(Math.min(max, Math.max(1, Number(e.target.value) || 1)));
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <label className="dh-label flex items-center gap-2">{T('paragraphs', 'Parágrafos')}<input type="number" value={paras} onChange={num(paras, setParas, 50)} className="dh-input w-20 font-mono" /></label>
        <label className="dh-label flex items-center gap-2">{T('sentences', 'Frases por parágrafo')}<input type="number" value={sents} onChange={num(sents, setSents, 20)} className="dh-input w-20 font-mono" /></label>
        <button type="button" className="dh-btn dh-btn-primary dh-btn-sm" onClick={() => setSeed(s => s + 1)}><RefreshCw size={14} /> {T('shuffle', 'Variar')}</button>
        <CopyButton text={text} />
      </div>
      <textarea readOnly value={text} className={`${textareaCls} h-80 bg-zinc-900/40 font-sans`} aria-label="Lorem ipsum" />
    </div>
  );
};

// ---------------- Password / entropy ----------------
export const PasswordTool = () => {
  const T = useDevT();
  const [opts, setOpts] = useState({ length: 20, lower: true, upper: true, digits: true, symbols: true });
  const [pw, setPw] = useState(() => generatePassword({ length: 20, lower: true, upper: true, digits: true, symbols: true }));
  const [probe, setProbe] = useState('');
  const regen = (o = opts) => setPw(generatePassword(o));
  const update = (patch: Partial<typeof opts>) => { const o = { ...opts, ...patch }; setOpts(o); regen(o); };
  const labels = { veryWeak: T('veryWeak', 'Muito fraca'), weak: T('weak', 'Fraca'), fair: T('fair', 'Razoável'), strong: T('strong', 'Forte'), veryStrong: T('veryStrong', 'Muito forte') };
  const meter = (text: string) => {
    const bits = entropyBits(text);
    const lvl = strengthLabel(bits);
    const color = lvl === 'veryWeak' || lvl === 'weak' ? 'bg-red-400' : lvl === 'fair' ? 'bg-amber-400' : 'bg-emerald-400';
    return (
      <div className="space-y-1" aria-live="polite">
        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden"><div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, (bits / 100) * 100)}%` }} /></div>
        <p className="dh-help font-mono">{text ? `${bits.toFixed(0)} bits · ${labels[lvl]}` : '-'}</p>
      </div>
    );
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <section className="dh-card p-5 space-y-3">
        <h2 className="dh-section-title">{T('genPassword', 'Gerar senha')}</h2>
        <div className="flex items-center gap-2">
          <output className="dh-input flex-1 flex items-center font-mono text-[14px] select-all overflow-x-auto whitespace-nowrap">{pw}</output>
          <CopyButton text={pw} />
          <button type="button" className="dh-btn dh-btn-sm" onClick={() => regen()} aria-label={T('generate', 'Gerar')}><RefreshCw size={14} /></button>
        </div>
        {meter(pw)}
        <label className="dh-label flex items-center gap-3">{T('length', 'Tamanho')}: {opts.length}
          <input type="range" min={6} max={64} value={opts.length} onChange={e => update({ length: Number(e.target.value) })} className="flex-1" />
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {([['lower', 'a-z'], ['upper', 'A-Z'], ['digits', '0-9'], ['symbols', '!@#']] as const).map(([k, l]) => (
            <label key={k} className="dh-label flex items-center gap-1.5"><input type="checkbox" checked={opts[k]} onChange={e => update({ [k]: e.target.checked } as any)} />{l}</label>
          ))}
        </div>
        <p className="dh-help">{T('pwLocal', 'Gerada localmente com o gerador criptográfico do sistema; nada é enviado.')}</p>
      </section>
      <section className="dh-card p-5 space-y-3">
        <h2 className="dh-section-title">{T('checkStrength', 'Estimar entropia')}</h2>
        <input value={probe} onChange={e => setProbe(e.target.value)} spellCheck={false} autoComplete="off" className="dh-input w-full font-mono" aria-label={T('checkStrength', 'Estimar entropia')} placeholder={T('typeToCheck', 'Digite para estimar')} />
        {meter(probe)}
        <p className="dh-help">{T('entropyNote', 'Estimativa baseada no tamanho e nos tipos de caracteres; senhas previsíveis (palavras, datas) são mais fracas do que o valor mostrado.')}</p>
      </section>
    </div>
  );
};
