import React, { useMemo, useState } from 'react';
import { ArrowRight, Hash, Brackets, Scale, FileDiff, Calculator, Code, Key, Clock, Search, Type, Fingerprint, Sparkles, Link2, Eraser } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import CryptoJS from 'crypto-js';
import * as Diff from 'diff';
import UnitConverter from '../devtools/UnitConverter';
import ColorPicker from '../devtools/ColorPicker';
import { EncodeTool, IdTool, JwtTool, RegexTool, CronTool, LoremTool, PasswordTool } from '../devtools/TextToolViews';
import { jsonMinify } from '../devtools/textTools';
import { CopyButton, textareaCls, useDevT } from '../devtools/ui';

type ToolId = 'unit' | 'color' | 'rule3' | 'json' | 'encode' | 'hash' | 'diff' | 'regex' | 'jwt' | 'cron' | 'ids' | 'password' | 'lorem';

const DevTools = () => {
  const T = useDevT();
  const [activeTab, setActiveTab] = useState<ToolId>('unit');

  const [jsonInput, setJsonInput] = useState('');
  const [jsonOutput, setJsonOutput] = useState('');
  const [jsonError, setJsonError] = useState('');

  const [hashInput, setHashInput] = useState('');
  const [hashes, setHashes] = useState({ md5: '', sha1: '', sha256: '', sha512: '' });

  const [r3A, setR3A] = useState(1);
  const [r3B, setR3B] = useState(1);
  const [r3C, setR3C] = useState(1);
  const [r3Inverse, setR3Inverse] = useState(false);

  const [diffOld, setDiffOld] = useState('');
  const [diffNew, setDiffNew] = useState('');

  const runJson = (mode: 'format' | 'minify' | 'validate') => {
    try {
      setJsonError('');
      const parsed = JSON.parse(jsonInput);
      if (mode === 'format') setJsonOutput(JSON.stringify(parsed, null, 2));
      else if (mode === 'minify') setJsonOutput(jsonMinify(jsonInput));
      else setJsonOutput(T('jsonValid', 'JSON válido.'));
    } catch (e: any) {
      setJsonError(e.message);
      setJsonOutput('');
    }
  };

  const generateHashes = (val: string) => {
    setHashInput(val);
    if (!val) {
      setHashes({ md5: '', sha1: '', sha256: '', sha512: '' });
      return;
    }
    setHashes({
      md5: CryptoJS.MD5(val).toString(),
      sha1: CryptoJS.SHA1(val).toString(),
      sha256: CryptoJS.SHA256(val).toString(),
      sha512: CryptoJS.SHA512(val).toString()
    });
  };

  // diffLines is O(n*m): only compute it for the diff tool and when its inputs change
  const diffResult = useMemo(
    () => (activeTab === 'diff' ? Diff.diffLines(diffOld, diffNew) : []),
    [activeTab, diffOld, diffNew]
  );

  const rule3Result = r3Inverse
    ? (r3C === 0 ? 0 : (r3A * r3B) / r3C)
    : (r3A === 0 ? 0 : (r3B * r3C) / r3A);

  const groups = [
    {
      label: T('group.convert', 'Conversão'),
      items: [
        { id: 'unit' as const, icon: Scale, label: T('tool.unit', 'Conversor de unidades') },
        { id: 'color' as const, icon: Eraser, label: T('tool.color', 'Seletor de cores') },
        { id: 'rule3' as const, icon: Calculator, label: T('tool.rule3', 'Regra de 3') },
      ],
    },
    {
      label: T('group.text', 'Texto e dados'),
      items: [
        { id: 'json' as const, icon: Brackets, label: T('tool.json', 'JSON') },
        { id: 'encode' as const, icon: Link2, label: T('tool.encode', 'Base64 / URL / HTML') },
        { id: 'hash' as const, icon: Hash, label: T('tool.hash', 'Gerador de hash') },
        { id: 'diff' as const, icon: FileDiff, label: T('tool.diff', 'Comparador (diff)') },
        { id: 'regex' as const, icon: Search, label: T('tool.regex', 'Testador de regex') },
      ],
    },
    {
      label: T('group.dev', 'Desenvolvimento'),
      items: [
        { id: 'jwt' as const, icon: Key, label: T('tool.jwt', 'Decodificador JWT') },
        { id: 'cron' as const, icon: Clock, label: T('tool.cron', 'Explicador de cron') },
        { id: 'ids' as const, icon: Fingerprint, label: T('tool.ids', 'UUID / ULID') },
        { id: 'password' as const, icon: Code, label: T('tool.password', 'Senha e entropia') },
        { id: 'lorem' as const, icon: Type, label: T('tool.lorem', 'Lorem ipsum') },
      ],
    },
  ];

  const sectionTitle: Partial<Record<ToolId, string>> = {};
  groups.forEach(g => g.items.forEach(i => { sectionTitle[i.id] = i.label; }));

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader title={T('title', 'Ferramentas de desenvolvedor')} subtitle={T('subtitle', 'Conversores, cores, codificação, hashes, regex e outros utilitários locais')} />

      <div className="grid grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)] gap-6 items-start">
        <nav aria-label={T('tools', 'Ferramentas')} className="md:sticky md:top-2 space-y-3">
          {groups.map(g => (
            <div key={g.label}>
              <div className="dh-tag uppercase tracking-wider px-2 mb-1">{g.label}</div>
              <div role="tablist" aria-orientation="vertical" className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible">
                {g.items.map(({ id, icon: Icon, label }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(id)}
                      className={`h-8 px-2 rounded-md inline-flex items-center gap-2 text-[13px] whitespace-nowrap text-left transition-colors ${active ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'}`}
                    >
                      <Icon size={15} className={active ? 'text-blue-300' : 'text-zinc-500'} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div role="tabpanel" className="min-w-0 animate-in" key={activeTab}>
          <h2 className="dh-section-title mb-3 text-[15px]">{sectionTitle[activeTab]}</h2>

          {activeTab === 'unit' && <UnitConverter />}
          {activeTab === 'color' && <ColorPicker />}
          {activeTab === 'encode' && <EncodeTool />}
          {activeTab === 'regex' && <RegexTool />}
          {activeTab === 'jwt' && <JwtTool />}
          {activeTab === 'cron' && <CronTool />}
          {activeTab === 'ids' && <IdTool />}
          {activeTab === 'password' && <PasswordTool />}
          {activeTab === 'lorem' && <LoremTool />}

          {activeTab === 'json' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 min-h-7">
                  <label htmlFor="json-in" className="dh-label">{T('json.in', 'Minificado / original')}</label>
                  <div className="flex gap-1.5">
                    <button onClick={() => runJson('validate')} disabled={!jsonInput.trim()} className="dh-btn dh-btn-sm">{T('json.validate', 'Validar')}</button>
                    <button onClick={() => runJson('minify')} disabled={!jsonInput.trim()} className="dh-btn dh-btn-sm">{T('json.minify', 'Minificar')}</button>
                    <button onClick={() => runJson('format')} disabled={!jsonInput.trim()} className="dh-btn dh-btn-primary dh-btn-sm">
                      {T('json.format', 'Formatar')} <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
                <textarea id="json-in" value={jsonInput} onChange={e => setJsonInput(e.target.value)} spellCheck={false} className={`${textareaCls} h-[460px]`} placeholder='{"exemplo": "cole aqui"}' />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between min-h-7">
                  <label htmlFor="json-out" className="dh-label">{T('json.out', 'Formatado / resultado')}</label>
                  <CopyButton text={jsonOutput} />
                </div>
                {jsonError ? (
                  <div role="alert" className="w-full h-[460px] rounded-md border border-red-500/30 bg-red-500/[0.06] p-4 font-mono text-[12.5px] text-red-300">{jsonError}</div>
                ) : (
                  <textarea id="json-out" value={jsonOutput} readOnly spellCheck={false} className={`${textareaCls} h-[460px] bg-zinc-900/40 text-zinc-200`} placeholder={T('json.outPlaceholder', 'Resultado aparecerá aqui')} />
                )}
              </div>
            </div>
          )}

          {activeTab === 'hash' && (
            <div className="max-w-3xl space-y-5">
              <div>
                <label htmlFor="hash-in" className="dh-label block mb-1.5">{T('hash.in', 'Texto de entrada')}</label>
                <textarea id="hash-in" value={hashInput} onChange={e => generateHashes(e.target.value)} className={`${textareaCls} h-32`} placeholder={T('hash.placeholder', 'Digite o texto para gerar os hashes...')} />
              </div>

              <dl className="dh-card divide-y divide-zinc-800/80">
                {Object.entries(hashes).map(([alg, val]) => (
                  <div key={alg} className="grid grid-cols-[72px_minmax(0,1fr)_auto] items-baseline gap-4 px-4 py-3">
                    <dt className="dh-tag text-[11.5px] text-zinc-400">{alg}</dt>
                    <dd className={`font-mono text-[12.5px] break-all select-all ${val ? 'text-zinc-100' : 'text-zinc-600'}`}>{val || T('hash.waiting', 'aguardando entrada')}</dd>
                    <CopyButton text={val} />
                  </div>
                ))}
              </dl>
            </div>
          )}

          {activeTab === 'rule3' && (
            <section className="dh-card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="dh-help font-mono">
                  {r3Inverse ? 'A × B = C × X  ·  X = (A × B) / C' : 'A → B, C → X  ·  X = (B × C) / A'}
                </p>
                <div role="radiogroup" aria-label={T('r3.label', 'Proporção')} className="inline-flex rounded-md border border-zinc-800 p-0.5">
                  {[false, true].map((inv) => (
                    <button
                      key={String(inv)}
                      role="radio"
                      aria-checked={r3Inverse === inv}
                      onClick={() => setR3Inverse(inv)}
                      className={`h-7 px-3 rounded text-[12px] transition-colors ${r3Inverse === inv ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'}`}
                    >
                      {inv ? T('r3.inverse', 'Inversamente proporcional') : T('r3.direct', 'Diretamente proporcional')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-center max-w-xl">
                <input type="number" aria-label="A" value={r3A} onChange={e => setR3A(parseFloat(e.target.value) || 0)} className="dh-input w-full font-mono" placeholder="A" />
                <ArrowRight size={14} className="text-zinc-600" />
                <input type="number" aria-label="B" value={r3B} onChange={e => setR3B(parseFloat(e.target.value) || 0)} className="dh-input w-full font-mono" placeholder="B" />

                <input type="number" aria-label="C" value={r3C} onChange={e => setR3C(parseFloat(e.target.value) || 0)} className="dh-input w-full font-mono" placeholder="C" />
                <ArrowRight size={14} className="text-zinc-600" />
                <output className="flex h-8 items-center gap-2 px-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/60 font-mono text-[13px] text-zinc-50">
                  <span className="text-zinc-500">X =</span> {rule3Result.toFixed(4)}
                </output>
              </div>
            </section>
          )}

          {activeTab === 'diff' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="diff-old" className="dh-label block mb-1.5">{T('diff.old', 'Texto original (antigo)')}</label>
                  <textarea id="diff-old" value={diffOld} onChange={e => setDiffOld(e.target.value)} spellCheck={false} className={`${textareaCls} h-64`} placeholder={T('diff.oldPh', 'Cole o texto original...')} />
                </div>
                <div>
                  <label htmlFor="diff-new" className="dh-label block mb-1.5">{T('diff.new', 'Texto novo')}</label>
                  <textarea id="diff-new" value={diffNew} onChange={e => setDiffNew(e.target.value)} spellCheck={false} className={`${textareaCls} h-64`} placeholder={T('diff.newPh', 'Cole o texto modificado...')} />
                </div>
              </div>

              <div className="dh-card p-4 font-mono text-[12.5px] leading-relaxed overflow-auto min-h-32">
                {!diffOld && !diffNew ? (
                  <span className="text-zinc-500 font-sans text-[12.5px]">{T('diff.empty', 'Cole os dois textos acima para ver as diferenças linha a linha.')}</span>
                ) : diffResult.length === 1 && !diffResult[0].added && !diffResult[0].removed ? (
                  <span className="text-zinc-500 font-sans text-[12.5px]">{T('diff.none', 'Sem diferenças detectadas.')}</span>
                ) : (
                  diffResult.map((part, i) => {
                    const colorClass = part.added ? 'text-emerald-300 bg-emerald-400/10' : part.removed ? 'text-red-300 bg-red-400/10 line-through decoration-red-400/50' : 'text-zinc-400';
                    return (
                      <span key={i} className={`whitespace-pre-wrap ${colorClass}`}>
                        {part.value}
                      </span>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DevTools;
