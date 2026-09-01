import { useI18n } from '../i18n/I18nProvider';
import React, { useState } from 'react';
import { Code, ArrowRightLeft, Hash, Brackets, Scale, FileDiff, Calculator } from 'lucide-react';
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

  const diffResult = Diff.diffLines(diffOld, diffNew);

  const rule3Result = r3Inverse
    ? (r3C === 0 ? 0 : (r3A * r3B) / r3C)
    : (r3A === 0 ? 0 : (r3B * r3C) / r3A);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-3 bg-purple-500/10 rounded-xl">
          <Code className="text-purple-400" size={28} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-zinc-100">Ferramentas de Desenvolvedor</h2>
          <p className="text-zinc-400 mt-1">Utilitários em tempo real para código, hashes e conversões</p>
        </div>
      </div>

      <div className="flex space-x-2 border-b border-zinc-800 pb-2">
        <button onClick={() => setActiveTab('json')} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'json' ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}><Brackets size={16}/><span>JSON Formatter</span></button>
        <button onClick={() => setActiveTab('hash')} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'hash' ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}><Hash size={16}/><span>Gerador de Hash</span></button>
        <button onClick={() => setActiveTab('unit')} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'unit' ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}><Scale size={16}/><span>Conversor & Calc</span></button>
        <button onClick={() => setActiveTab('diff')} className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2 ${activeTab === 'diff' ? 'bg-purple-500 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'}`}><FileDiff size={16}/><span>Comparador (Diff)</span></button>
      </div>

      {activeTab === 'json' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-sm font-medium text-zinc-300">Minificado / Original</label>
              <button onClick={formatJson} className="text-sm text-purple-400 hover:text-purple-300">Formatar &rarr;</button>
            </div>
            <textarea value={jsonInput} onChange={e => setJsonInput(e.target.value)} className="w-full h-[500px] bg-zinc-900 border border-zinc-700 rounded-lg p-4 font-mono text-sm text-zinc-200 focus:outline-none focus:border-purple-500 resize-none" placeholder='{"exemplo": "cole aqui"}' />
          </div>
          <div className="space-y-2">
             <label className="text-sm font-medium text-zinc-300">Formatado / Resultado</label>
             {jsonError ? (
               <div className="w-full h-[500px] bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 font-mono text-sm">{jsonError}</div>
             ) : (
               <textarea value={jsonOutput} readOnly className="w-full h-[500px] bg-zinc-900/50 border border-zinc-700 rounded-lg p-4 font-mono text-sm text-emerald-400 focus:outline-none resize-none" placeholder='Resultado aparecerá aqui' />
             )}
          </div>
        </div>
      )}

      {activeTab === 'hash' && (
        <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-zinc-800/50 rounded-xl p-5 border border-zinc-700/50">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Texto de Entrada</label>
            <textarea value={hashInput} onChange={e => generateHashes(e.target.value)} className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-purple-500 resize-none" placeholder="Digite o texto para gerar os hashes..." />
          </div>

          <div className="space-y-3">
            {Object.entries(hashes).map(([alg, val]) => (
              <div key={alg} className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 flex items-center justify-between">
                <span className="font-bold text-zinc-400 uppercase w-20">{alg}</span>
                <span className="font-mono text-sm text-purple-400 break-all select-all">{val || '...'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'unit' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700/50 space-y-6">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-medium text-zinc-200 flex items-center space-x-2"><Scale size={20}/> <span>Temperatura</span></h3>
             </div>
             <div>
                <label className="text-sm text-zinc-400">Celsius (°C)</label>
                <input type="number" value={tempVal} onChange={e => setTempVal(parseFloat(e.target.value) || 0)} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200" />
             </div>
             <div className="flex items-center justify-center text-zinc-600"><ArrowRightLeft size={20} className="rotate-90 md:rotate-0" /></div>
             <div>
                <label className="text-sm text-zinc-400">Fahrenheit (°F)</label>
                <div className="w-full mt-1 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-purple-400 font-bold">
                  {((tempVal * 9/5) + 32).toFixed(2)} °F
                </div>
             </div>
          </div>

          <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700/50 space-y-6">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-medium text-zinc-200 flex items-center space-x-2"><Scale size={20}/> <span>Armazenamento</span></h3>
             </div>
             <div>
                <label className="text-sm text-zinc-400">Megabytes (MB)</label>
                <input type="number" value={storageVal} onChange={e => setStorageVal(parseFloat(e.target.value) || 0)} className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200" />
             </div>
             <div className="flex items-center justify-center text-zinc-600"><ArrowRightLeft size={20} className="rotate-90 md:rotate-0" /></div>
             <div>
                <label className="text-sm text-zinc-400">Gigabytes (GB)</label>
                <div className="w-full mt-1 bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-purple-400 font-bold">
                  {(storageVal / 1024).toFixed(6)} GB
                </div>
             </div>
          </div>

          <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700/50 space-y-6 md:col-span-2">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-lg font-medium text-zinc-200 flex items-center space-x-2"><Calculator size={20}/> <span>Regra de 3</span></h3>
               <button
                 onClick={() => setR3Inverse(!r3Inverse)}
                 className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors border ${r3Inverse ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'bg-zinc-700 border-zinc-600 text-zinc-300 hover:bg-zinc-600'}`}
               >
                 {r3Inverse ? '⇄ Inversamente proporcional' : '→ Diretamente proporcional'}
               </button>
             </div>
             {r3Inverse ? (
               <p className="text-xs text-orange-400/80">Fórmula: A × B = C × X → X = (A × B) / C</p>
             ) : (
               <p className="text-xs text-zinc-500">Fórmula: A → B / C → X = (B × C) / A</p>
             )}
             <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
                <input type="number" value={r3A} onChange={e => setR3A(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200" placeholder="A" />
                <span className="text-zinc-400">&rarr;</span>
                <input type="number" value={r3B} onChange={e => setR3B(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200" placeholder="B" />

                <input type="number" value={r3C} onChange={e => setR3C(parseFloat(e.target.value) || 0)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-200" placeholder="C" />
                <span className="text-zinc-400">&rarr;</span>
                <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-2 text-purple-400 font-bold">
                  {rule3Result.toFixed(4)}
                </div>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'diff' && (
        <div className="animate-in fade-in slide-in-from-bottom-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Texto Original (Antigo)</label>
              <textarea value={diffOld} onChange={e => setDiffOld(e.target.value)} className="w-full h-64 bg-zinc-900 border border-zinc-700 rounded-lg p-4 font-mono text-sm text-zinc-200 focus:outline-none focus:border-purple-500 resize-none" placeholder="Cole o texto original..." />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Texto Novo</label>
              <textarea value={diffNew} onChange={e => setDiffNew(e.target.value)} className="w-full h-64 bg-zinc-900 border border-zinc-700 rounded-lg p-4 font-mono text-sm text-zinc-200 focus:outline-none focus:border-purple-500 resize-none" placeholder="Cole o texto modificado..." />
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-sm overflow-auto min-h-32">
            {diffResult.length === 1 && !diffResult[0].added && !diffResult[0].removed ? (
              <span className="text-zinc-500">Sem diferenças detectadas.</span>
            ) : (
              diffResult.map((part, i) => {
                const colorClass = part.added ? 'text-emerald-400 bg-emerald-400/10' : part.removed ? 'text-red-400 bg-red-400/10 line-through' : 'text-zinc-400';
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
