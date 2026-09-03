import { useI18n } from '../i18n/I18nProvider';
import React, { useState } from 'react';
import { Shield, Key, FileDigit, Link, ArrowRightLeft, Copy, Trash2 } from 'lucide-react';
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
        res = Array.from(input).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
      } else if (mode === 'binary') {
        res = Array.from(input).map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ');
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
        for (let i = 0; i < hex.length; i += 2) {
          res += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
        }
      } else if (mode === 'binary') {
        const bin = input.replace(/\s/g, '');
        for (let i = 0; i < bin.length; i += 8) {
          res += String.fromCharCode(parseInt(bin.substr(i, 8), 2));
        }
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

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <div className="flex items-center space-x-3 mb-8">
        <div className="p-3 bg-emerald-500/10 rounded-xl">
          <Shield className="text-emerald-400" size={28} />
        </div>
        <div>
          <h2 className="text-3xl font-bold text-zinc-100">Descriptografia & Hash</h2>
          <p className="text-zinc-400 mt-1">Converta, codifique e decodifique dados em múltiplos formatos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {}
        <div className="md:col-span-1 space-y-2">
          <button
            onClick={() => setMode('base64')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              mode === 'base64' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <Key size={18} />
            <span className="font-medium">Base64</span>
          </button>

          <button
            onClick={() => setMode('hex')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              mode === 'hex' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <FileDigit size={18} />
            <span className="font-medium">Hexadecimal</span>
          </button>

          <button
            onClick={() => setMode('url')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              mode === 'url' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <Link size={18} />
            <span className="font-medium">URL Encode</span>
          </button>

          <button
            onClick={() => setMode('binary')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              mode === 'binary' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <FileDigit size={18} />
            <span className="font-medium">Binário</span>
          </button>

          <div className="pt-2 pb-1">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider pl-2">Simétrica (Requer Chave)</p>
          </div>

          <button
            onClick={() => setMode('aes')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              mode === 'aes' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <Shield size={18} />
            <span className="font-medium">AES-256</span>
          </button>

          <button
            onClick={() => setMode('tripledes')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              mode === 'tripledes' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <Shield size={18} />
            <span className="font-medium">TripleDES</span>
          </button>

          <button
            onClick={() => setMode('rabbit')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              mode === 'rabbit' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <Shield size={18} />
            <span className="font-medium">Rabbit</span>
          </button>

          <button
            onClick={() => setMode('rc4')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
              mode === 'rc4' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            <Shield size={18} />
            <span className="font-medium">RC4 Drop</span>
          </button>
        </div>

        {}
        <div className="md:col-span-3 space-y-4">
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Entrada</label>
              <button onClick={clearAll} className="text-zinc-500 hover:text-red-400 transition-colors">
                <Trash2 size={16} />
              </button>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Cole o texto ou código aqui..."
              className="w-full h-32 bg-zinc-900/50 border border-zinc-700 rounded-lg p-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 resize-none font-mono text-sm"
            />
            {['aes', 'tripledes', 'rabbit', 'rc4'].includes(mode) && (
              <div className="mt-3">
                <label className="text-xs font-medium text-zinc-400 mb-1 block">Chave Secreta</label>
                <div className="relative">
                  <Key size={16} className="absolute left-3 top-1/2 -tranzinc-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                    placeholder="Digite a chave..."
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg py-2 pl-9 pr-3 text-zinc-200 focus:outline-none focus:border-emerald-500/50 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center space-x-4">
            <button
              onClick={handleEncode}
              disabled={!input}
              className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-lg font-medium transition-colors border border-zinc-700 flex items-center space-x-2"
            >
              <span>Codificar / Encrypt</span>
              <ArrowRightLeft size={16} className="rotate-90 md:rotate-0" />
            </button>

            <button
              onClick={handleDecode}
              disabled={!input}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-medium transition-colors shadow-lg shadow-emerald-500/20 flex items-center space-x-2"
            >
              <ArrowRightLeft size={16} className="rotate-90 md:rotate-0" />
              <span>Decodificar / Decrypt</span>
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">
              {error}
            </div>
          )}

          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4">
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-zinc-300 uppercase tracking-wider">Saída</label>
              <button
                onClick={copyToClipboard}
                disabled={!output}
                className="text-zinc-500 hover:text-emerald-400 transition-colors disabled:opacity-50"
                title="Copiar resultado"
              >
                <Copy size={16} />
              </button>
            </div>
            <textarea
              value={output}
              readOnly
              placeholder="O resultado aparecerá aqui..."
              className="w-full h-32 bg-zinc-900/50 border border-zinc-700 rounded-lg p-3 text-emerald-400 focus:outline-none resize-none font-mono text-sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Decryption;
