import React, { useMemo, useState } from 'react';
import { ArrowRight, ArrowRightLeft, Hash, Brackets, Scale, FileDiff, Calculator } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import CryptoJS from 'crypto-js';
import * as Diff from 'diff';

const DevTools = () => {
  const [activeTab, setActiveTab] = useState<'json' | 'hash' | 'unit' | 'diff'>('json');

  const [jsonInput, setJsonInput] = useState('');
  const [jsonOutput, setJsonOutput] = useState('');
  const [jsonError, setJsonError] = useState('');

  const [hashInput, setHashInput] = useState('');
  const [hashes, setHashes] = useState({ md5: '', sha1: '', sha256: '' });

  const [tempVal, setTempVal] = useState(1);
  const [storageVal, setStorageVal] = useState(1);
  const [r3A, setR3A] = useState(1);
  const [r3B, setR3B] = useState(1);
  const [r3C, setR3C] = useState(1);
  const [r3Inverse, setR3Inverse] = useState(false);

  const [diffOld, setDiffOld] = useState('');
  const [diffNew, setDiffNew] = useState('');

  const formatJson = () => {
    try {
      setJsonError('');
      const parsed = JSON.parse(jsonInput);
      setJsonOutput(JSON.stringify(parsed, null, 2));
    } catch (e: any) {
      setJsonError(e.message);
      setJsonOutput('');
    }
  };

  const generateHashes = (val: string) => {
    setHashInput(val);
    if (!val) {
      setHashes({ md5: '', sha1: '', sha256: '' });
      return;
    }
    setHashes({
      md5: CryptoJS.MD5(val).toString(),
      sha1: CryptoJS.SHA1(val).toString(),
      sha256: CryptoJS.SHA256(val).toString()
    });
  };

  // diffLines is O(n*m): only compute it for the diff tab and when its inputs change
  const diffResult = useMemo(
    () => (activeTab === 'diff' ? Diff.diffLines(diffOld, diffNew) : []),
    [activeTab, diffOld, diffNew]
  );

  const rule3Result = r3Inverse
    ? (r3C === 0 ? 0 : (r3A * r3B) / r3C)
    : (r3A === 0 ? 0 : (r3B * r3C) / r3A);


  const tabs = [
    { id: 'json' as const, icon: Brackets, label: 'JSON Formatter' },
    { id: 'hash' as const, icon: Hash, label: 'Gerador de hash' },
    { id: 'unit' as const, icon: Scale, label: 'Conversor e calculadora' },
    { id: 'diff' as const, icon: FileDiff, label: 'Comparador (diff)' },
  ];

  const textareaCls = 'dh-input w-full py-3 font-mono text-[12.5px] leading-relaxed resize-none';

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader title="Ferramentas de desenvolvedor" subtitle="Utilitários em tempo real para código, hashes e conversões">
        <div role="tablist" aria-label="Ferramentas" className="flex gap-5 -mb-5 overflow-x-auto overflow-y-hidden">
          {tabs.map(({ id, icon: Icon, label }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`relative h-9 inline-flex items-center gap-2 text-[13px] whitespace-nowrap border-b-2 transition-colors ${active ? 'border-blue-400 text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
              >
                <Icon size={16} className={active ? 'text-blue-300' : 'text-zinc-500'} />
                {label}
              </button>
            );
          })}
        </div>
      </PageHeader>

      {activeTab === 'json' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in">
          <div className="space-y-2">
            <div className="flex items-center justify-between h-7">
              <label htmlFor="json-in" className="dh-label">Minificado / original</label>
              <button onClick={formatJson} disabled={!jsonInput.trim()} className="dh-btn dh-btn-primary dh-btn-sm">
                Formatar <ArrowRight size={14} />
              </button>
            </div>
            <textarea id="json-in" value={jsonInput} onChange={e => setJsonInput(e.target.value)} spellCheck={false} className={`${textareaCls} h-[460px]`} placeholder='{"exemplo": "cole aqui"}' />
          </div>
          <div className="space-y-2">
            <div className="flex items-center h-7">
              <label htmlFor="json-out" className="dh-label">Formatado / resultado</label>
            </div>
            {jsonError ? (
              <div role="alert" className="w-full h-[460px] rounded-md border border-red-500/30 bg-red-500/[0.06] p-4 font-mono text-[12.5px] text-red-300">{jsonError}</div>
            ) : (
              <textarea id="json-out" value={jsonOutput} readOnly spellCheck={false} className={`${textareaCls} h-[460px] bg-zinc-900/40 text-zinc-200`} placeholder='Resultado aparecerá aqui' />
            )}
          </div>
        </div>
      )}

      {activeTab === 'hash' && (
        <div className="max-w-3xl space-y-5 animate-in">
          <div>
            <label htmlFor="hash-in" className="dh-label block mb-1.5">Texto de entrada</label>
            <textarea id="hash-in" value={hashInput} onChange={e => generateHashes(e.target.value)} className={`${textareaCls} h-32`} placeholder="Digite o texto para gerar os hashes..." />
          </div>

          <dl className="dh-card divide-y divide-zinc-800/80">
            {Object.entries(hashes).map(([alg, val]) => (
              <div key={alg} className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-4 px-4 py-3">
                <dt className="dh-tag text-[11.5px] text-zinc-400">{alg}</dt>
                <dd className={`font-mono text-[12.5px] break-all select-all ${val ? 'text-zinc-100' : 'text-zinc-600'}`}>{val || 'aguardando entrada'}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {activeTab === 'unit' && (
        <div className="animate-in grid grid-cols-1 md:grid-cols-2 gap-4">
          <section className="dh-card p-5 space-y-4">
            <h2 className="dh-section-title">Temperatura</h2>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
              <div>
                <label htmlFor="temp-c" className="dh-label block mb-1.5">Celsius (°C)</label>
                <input id="temp-c" type="number" value={tempVal} onChange={e => setTempVal(parseFloat(e.target.value) || 0)} className="dh-input w-full font-mono" />
              </div>
              <ArrowRightLeft size={16} className="mb-2 text-zinc-600" />
              <div>
                <span className="dh-label block mb-1.5">Fahrenheit (°F)</span>
                <output className="flex h-8 items-center font-mono text-[14px] text-zinc-50">
                  {((tempVal * 9/5) + 32).toFixed(2)}<span className="ml-1 text-zinc-500 text-[12px]">°F</span>
                </output>
              </div>
            </div>
          </section>

          <section className="dh-card p-5 space-y-4">
            <h2 className="dh-section-title">Armazenamento</h2>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
              <div>
                <label htmlFor="stor-mb" className="dh-label block mb-1.5">Megabytes (MB)</label>
                <input id="stor-mb" type="number" value={storageVal} onChange={e => setStorageVal(parseFloat(e.target.value) || 0)} className="dh-input w-full font-mono" />
              </div>
              <ArrowRightLeft size={16} className="mb-2 text-zinc-600" />
              <div>
                <span className="dh-label block mb-1.5">Gigabytes (GB)</span>
                <output className="flex h-8 items-center font-mono text-[14px] text-zinc-50">
                  {(storageVal / 1024).toFixed(6)}<span className="ml-1 text-zinc-500 text-[12px]">GB</span>
                </output>
              </div>
            </div>
          </section>

          <section className="dh-card p-5 space-y-4 md:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="dh-section-title flex items-center gap-2"><Calculator size={16} className="text-zinc-400" /> Regra de 3</h2>
                <p className="dh-help mt-0.5 font-mono">
                  {r3Inverse ? 'A × B = C × X  ·  X = (A × B) / C' : 'A → B, C → X  ·  X = (B × C) / A'}
                </p>
              </div>
              <div role="radiogroup" aria-label="Proporção" className="inline-flex rounded-md border border-zinc-800 p-0.5">
                {[false, true].map((inv) => (
                  <button
                    key={String(inv)}
                    role="radio"
                    aria-checked={r3Inverse === inv}
                    onClick={() => setR3Inverse(inv)}
                    className={`h-7 px-3 rounded text-[12px] transition-colors ${r3Inverse === inv ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    {inv ? 'Inversamente proporcional' : 'Diretamente proporcional'}
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
        </div>
      )}

      {activeTab === 'diff' && (
        <div className="animate-in space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="diff-old" className="dh-label block mb-1.5">Texto original (antigo)</label>
              <textarea id="diff-old" value={diffOld} onChange={e => setDiffOld(e.target.value)} spellCheck={false} className={`${textareaCls} h-64`} placeholder="Cole o texto original..." />
            </div>
            <div>
              <label htmlFor="diff-new" className="dh-label block mb-1.5">Texto novo</label>
              <textarea id="diff-new" value={diffNew} onChange={e => setDiffNew(e.target.value)} spellCheck={false} className={`${textareaCls} h-64`} placeholder="Cole o texto modificado..." />
            </div>
          </div>

          <div className="dh-card p-4 font-mono text-[12.5px] leading-relaxed overflow-auto min-h-32">
            {!diffOld && !diffNew ? (
              <span className="text-zinc-500 font-sans text-[12.5px]">Cole os dois textos acima para ver as diferenças linha a linha.</span>
            ) : diffResult.length === 1 && !diffResult[0].added && !diffResult[0].removed ? (
              <span className="text-zinc-500 font-sans text-[12.5px]">Sem diferenças detectadas.</span>
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
  );
};

export default DevTools;
