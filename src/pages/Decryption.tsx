import React, { useState } from 'react';
import { Shield, Key, FileDigit, Link, ArrowRightLeft, Copy, Trash2 } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import CryptoJS from 'crypto-js';

type Mode = 'base64' | 'url' | 'hex' | 'binary' | 'aes' | 'tripledes' | 'rabbit' | 'rc4';

const Decryption = () => {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<Mode>('base64');
  const [error, setError] = useState('');
  const [secretKey, setSecretKey] = useState('');

  const handleEncode = () => {
    setError('');
    try {
      let res = '';
      if (mode === 'base64') {
        const bytes = new TextEncoder().encode(input);
        const binString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
        res = btoa(binString);
      } else if (mode === 'url') {
        res = encodeURIComponent(input);
      } else if (mode === 'hex') {
        res = Array.from(new TextEncoder().encode(input), (b) => b.toString(16).padStart(2, '0')).join('');
      } else if (mode === 'binary') {
        res = Array.from(new TextEncoder().encode(input), (b) => b.toString(2).padStart(8, '0')).join(' ');
      } else if (mode === 'aes') {
        if (!secretKey) throw new Error('A chave secreta é necessária para AES');
        res = CryptoJS.AES.encrypt(input, secretKey).toString();
      } else if (mode === 'tripledes') {
        if (!secretKey) throw new Error('A chave secreta é necessária para TripleDES');
        res = CryptoJS.TripleDES.encrypt(input, secretKey).toString();
      } else if (mode === 'rabbit') {
        if (!secretKey) throw new Error('A chave secreta é necessária para Rabbit');
        res = CryptoJS.Rabbit.encrypt(input, secretKey).toString();
      } else if (mode === 'rc4') {
        if (!secretKey) throw new Error('A chave secreta é necessária para RC4');
        res = CryptoJS.RC4.encrypt(input, secretKey).toString();
      }
      setOutput(res);
    } catch (err: any) {
      setError(err.message || 'Erro ao codificar');
      setOutput('');
    }
  };

  const handleDecode = () => {
    setError('');
    try {
      let res = '';
      if (mode === 'base64') {
        const binString = atob(input);
        const bytes = Uint8Array.from(binString, (m) => m.charCodeAt(0));
        res = new TextDecoder().decode(bytes);
      } else if (mode === 'url') {
        res = decodeURIComponent(input);
      } else if (mode === 'hex') {
        const hex = input.replace(/\s/g, '');
        if (!/^([0-9a-f]{2})+$/i.test(hex)) throw new Error('invalid-hex');
        const bytes = Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
        res = new TextDecoder().decode(bytes);
      } else if (mode === 'binary') {
        const bin = input.replace(/\s/g, '');
        if (!/^([01]{8})+$/.test(bin)) throw new Error('invalid-binary');
        const bytes = Uint8Array.from(bin.match(/.{8}/g) ?? [], (b) => parseInt(b, 2));
        res = new TextDecoder().decode(bytes);
      } else if (mode === 'aes') {
        if (!secretKey) throw new Error('A chave secreta é necessária para AES');
        const bytes = CryptoJS.AES.decrypt(input, secretKey);
        res = bytes.toString(CryptoJS.enc.Utf8);
        if (!res) throw new Error('Chave incorreta ou dados corrompidos');
      } else if (mode === 'tripledes') {
        if (!secretKey) throw new Error('A chave secreta é necessária para TripleDES');
        const bytes = CryptoJS.TripleDES.decrypt(input, secretKey);
        res = bytes.toString(CryptoJS.enc.Utf8);
        if (!res) throw new Error('Chave incorreta ou dados corrompidos');
      } else if (mode === 'rabbit') {
        if (!secretKey) throw new Error('A chave secreta é necessária para Rabbit');
        const bytes = CryptoJS.Rabbit.decrypt(input, secretKey);
        res = bytes.toString(CryptoJS.enc.Utf8);
        if (!res) throw new Error('Chave incorreta ou dados corrompidos');
      } else if (mode === 'rc4') {
        if (!secretKey) throw new Error('A chave secreta é necessária para RC4');
        const bytes = CryptoJS.RC4.decrypt(input, secretKey);
        res = bytes.toString(CryptoJS.enc.Utf8);
        if (!res) throw new Error('Chave incorreta ou dados corrompidos');
      }
      setOutput(res);
    } catch (err: any) {
      setError('Formato inválido para descriptografia/decodificação.');
      setOutput('');
    }
  };

  const copyToClipboard = () => {
    if (output) navigator.clipboard.writeText(output);
  };

  const clearAll = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  const encodings: { id: Mode; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'base64', label: 'Base64', icon: Key },
    { id: 'hex', label: 'Hexadecimal', icon: FileDigit },
    { id: 'url', label: 'URL Encode', icon: Link },
    { id: 'binary', label: 'Binário', icon: FileDigit },
  ];
  const ciphers: { id: Mode; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'aes', label: 'AES-256', icon: Shield },
    { id: 'tripledes', label: 'TripleDES', icon: Shield },
    { id: 'rabbit', label: 'Rabbit', icon: Shield },
    { id: 'rc4', label: 'RC4', icon: Shield },
  ];
  const needsKey = ['aes', 'tripledes', 'rabbit', 'rc4'].includes(mode);

  const renderMode = ({ id, label, icon: Icon }: { id: Mode; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }) => {
    const active = mode === id;
    return (
      <button
        key={id}
        role="radio"
        aria-checked={active}
        onClick={() => setMode(id)}
        className={`w-full h-8 flex items-center gap-2.5 px-2.5 rounded-md text-[13px] transition-colors ${
          active ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
        }`}
      >
        <Icon size={16} className={active ? 'text-blue-300' : 'text-zinc-500'} />
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader title="Descriptografia e hash" subtitle="Converta, codifique e decodifique dados em múltiplos formatos" />

      <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] gap-8">
        <nav role="radiogroup" aria-label="Formato" className="space-y-5">
          <div className="space-y-0.5">
            <p className="text-[11px] text-zinc-500 px-2.5 mb-1.5">Codificação</p>
            {encodings.map(renderMode)}
          </div>
          <div className="space-y-0.5">
            <p className="text-[11px] text-zinc-500 px-2.5 mb-1.5">Simétrica (requer chave)</p>
            {ciphers.map(renderMode)}
          </div>
        </nav>

        <div className="space-y-4 min-w-0">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="dec-input" className="dh-label">Entrada</label>
              <button onClick={clearAll} disabled={!input && !output && !error} className="dh-btn dh-btn-ghost dh-btn-sm" title="Limpar">
                <Trash2 size={14} /> Limpar
              </button>
            </div>
            <textarea
              id="dec-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Cole o texto ou código aqui..."
              spellCheck={false}
              className="dh-input w-full h-36 py-2.5 resize-none font-mono text-[12.5px] leading-relaxed"
            />
          </div>

          {needsKey && (
            <div>
              <label htmlFor="dec-key" className="dh-label block mb-1.5">Chave secreta</label>
              <div className="relative max-w-md">
                <Key size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  id="dec-key"
                  type="text"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  placeholder="Digite a chave..."
                  spellCheck={false}
                  autoComplete="off"
                  className="dh-input w-full pl-8 font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleDecode} disabled={!input} className="dh-btn dh-btn-primary">
              <ArrowRightLeft size={14} />
              <span>Decodificar / Decrypt</span>
            </button>
            <button onClick={handleEncode} disabled={!input} className="dh-btn">
              <span>Codificar / Encrypt</span>
            </button>
            {error && (
              <span role="alert" className="text-[12.5px] text-red-400 ml-1">{error}</span>
            )}
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="dec-output" className="dh-label">Saída</label>
              <button
                onClick={copyToClipboard}
                disabled={!output}
                className="dh-btn dh-btn-ghost dh-btn-sm"
                title="Copiar resultado"
              >
                <Copy size={14} /> Copiar
              </button>
            </div>
            <textarea
              id="dec-output"
              value={output}
              readOnly
              placeholder="O resultado aparecerá aqui..."
              spellCheck={false}
              className="dh-input w-full h-36 py-2.5 bg-zinc-900/40 resize-none font-mono text-[12.5px] leading-relaxed"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Decryption;
