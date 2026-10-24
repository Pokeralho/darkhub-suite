import React, { useMemo, useState } from 'react';
import { Shield, Key, FileDigit, Link, ArrowRightLeft, Copy, Trash2, Search } from '../components/icons';
import PageHeader from '../components/ui/PageHeader';
import { useI18n } from '../i18n/I18nProvider';
import { transform, cipher, hash, identify, decodeJwt, caesarBruteForce, HASHES, type TextMode, type CipherMode, type HashName } from '../lib/cipherTools';

type Mode = TextMode | CipherMode | 'hash' | 'identify';
type Icon = React.ComponentType<{ size?: number; className?: string }>;

const CIPHERS: CipherMode[] = ['aes-gcm', 'aes', 'tripledes', 'rabbit', 'rc4'];
const KEYED: Mode[] = ['caesar', 'vigenere', 'xor', ...CIPHERS];
// identify() guesses → the screen's mode, so a click on a guess opens the right decoder
const GUESS_MODE: Record<string, Mode> = { base64: 'base64', base64url: 'base64url', base32: 'base32', hex: 'hex', binary: 'binary', morse: 'morse', url: 'url', html: 'html', 'cipher:DarkHub AES-256-GCM': 'aes-gcm', 'cipher:OpenSSL / CryptoJS (AES, 3DES, Rabbit, RC4)': 'aes' };

const Decryption = () => {
  const { t } = useI18n();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [mode, setMode] = useState<Mode>('base64');
  const [error, setError] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [busy, setBusy] = useState(false);

  const groups: { title: string; items: { id: Mode; label: string; icon: Icon }[] }[] = [
    { title: t('dec.group.analyze', 'Analisar'), items: [
      { id: 'identify', label: t('dec.mode.identify', 'Identificar / JWT'), icon: Search },
      { id: 'hash', label: t('dec.mode.hash', 'Hashes e HMAC'), icon: FileDigit }
    ] },
    { title: t('dec.group.encoding', 'Codificação'), items: [
      { id: 'base64', label: 'Base64', icon: Key }, { id: 'base64url', label: 'Base64 URL', icon: Key },
      { id: 'base32', label: 'Base32', icon: Key }, { id: 'base58', label: 'Base58', icon: Key },
      { id: 'hex', label: t('dec.mode.hex', 'Hexadecimal'), icon: FileDigit }, { id: 'binary', label: t('dec.mode.binary', 'Binário'), icon: FileDigit },
      { id: 'url', label: 'URL', icon: Link }, { id: 'html', label: t('dec.mode.html', 'Entidades HTML'), icon: Link },
      { id: 'morse', label: 'Morse', icon: FileDigit }
    ] },
    { title: t('dec.group.classic', 'Cifras clássicas'), items: [
      { id: 'rot13', label: 'ROT13', icon: ArrowRightLeft }, { id: 'rot47', label: 'ROT47', icon: ArrowRightLeft },
      { id: 'caesar', label: t('dec.mode.caesar', 'César'), icon: ArrowRightLeft }, { id: 'atbash', label: 'Atbash', icon: ArrowRightLeft },
      { id: 'vigenere', label: 'Vigenère', icon: ArrowRightLeft }, { id: 'xor', label: 'XOR', icon: ArrowRightLeft }
    ] },
    { title: t('dec.group.cipher', 'Criptografia (requer senha)'), items: [
      { id: 'aes-gcm', label: t('dec.mode.gcm', 'AES-256-GCM (recomendado)'), icon: Shield },
      { id: 'aes', label: 'AES (OpenSSL)', icon: Shield }, { id: 'tripledes', label: 'TripleDES', icon: Shield },
      { id: 'rabbit', label: 'Rabbit', icon: Shield }, { id: 'rc4', label: 'RC4', icon: Shield }
    ] }
  ];

  const needsKey = KEYED.includes(mode);
  const isCipher = (CIPHERS as Mode[]).includes(mode);
  const keyLabel = mode === 'caesar' ? t('dec.key.shift', 'Deslocamento (1 a 25)') : mode === 'vigenere' ? t('dec.key.word', 'Palavra-chave') : isCipher ? t('dec.key.password', 'Senha') : t('dec.key.key', 'Chave');

  const fail = (e: unknown) => {
    const m = String((e as Error)?.message ?? e);
    setError(m === 'key' ? t('dec.err.key', 'Informe a chave/senha (ou ela está incorreta).') : t('dec.err.format', 'Entrada inválida para este formato ou chave incorreta.'));
    setOutput('');
  };

  const run = async (dir: 'encode' | 'decode') => {
    setError('');
    setBusy(true);
    try {
      if (isCipher) setOutput(await cipher(mode as CipherMode, input, dir === 'encode' ? 'encrypt' : 'decrypt', secretKey));
      else setOutput(transform(mode as TextMode, input, dir, secretKey));
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const hashes = useMemo(() => (mode === 'hash' && input ? HASHES.map((h) => ({ h, v: hash(h as HashName, input, secretKey) })) : []), [mode, input, secretKey]);
  const guesses = useMemo(() => (mode === 'identify' ? identify(input) : []), [mode, input]);
  const jwt = useMemo(() => { try { return guesses.includes('jwt') ? decodeJwt(input) : null; } catch { return null; } }, [guesses, input]);
  const brute = useMemo(() => (mode === 'caesar' && input && !secretKey ? caesarBruteForce(input.slice(0, 300)) : []), [mode, input, secretKey]);

  const copy = (v: string) => { if (v) void navigator.clipboard.writeText(v); };
  const clearAll = () => { setInput(''); setOutput(''); setError(''); };

  const guessLabel = (g: string) => g === 'jwt' ? 'JWT' : g.startsWith('hash:') ? `${t('dec.guess.hash', 'Hash')} ${g.slice(5)}` : g.startsWith('cipher:') ? `${t('dec.guess.cipher', 'Cifrado')} ${g.slice(7)}` : g;

  return (
    <div className="w-full max-w-6xl mx-auto">
      <PageHeader title={t('dec.title', 'Descriptografia e hash')} subtitle={t('dec.subtitle', 'Identifique, codifique, decodifique, cifre e gere hashes. Tudo roda localmente.')} />

      <div className="grid grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)] gap-8">
        <nav role="radiogroup" aria-label={t('dec.format', 'Formato')} className="space-y-5">
          {groups.map((g) => (
            <div key={g.title} className="space-y-0.5">
              <p className="text-[11px] text-zinc-500 px-2.5 mb-1.5">{g.title}</p>
              {g.items.map(({ id, label, icon: I }) => {
                const active = mode === id;
                return (
                  <button key={id} role="radio" aria-checked={active} onClick={() => { setMode(id); setOutput(''); setError(''); }}
                    className={`w-full h-8 flex items-center gap-2.5 px-2.5 rounded-md text-[13px] transition-colors ${active ? 'bg-zinc-800/80 text-zinc-50' : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'}`}>
                    <I size={16} className={active ? 'text-blue-300' : 'text-zinc-500'} />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="space-y-4 min-w-0">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="dec-input" className="dh-label">{t('dec.input', 'Entrada')}</label>
              <button onClick={clearAll} disabled={!input && !output && !error} className="dh-btn dh-btn-ghost dh-btn-sm">
                <Trash2 size={14} /> {t('dec.clear', 'Limpar')}
              </button>
            </div>
            <textarea id="dec-input" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false}
              placeholder={t('dec.input.ph', 'Cole o texto, hash, token ou código aqui...')}
              className="dh-input w-full h-36 py-2.5 resize-none font-mono text-[12.5px] leading-relaxed" />
          </div>

          {(needsKey || mode === 'hash') && (
            <div>
              <label htmlFor="dec-key" className="dh-label block mb-1.5">{mode === 'hash' ? t('dec.key.hmac', 'Chave HMAC (opcional)') : keyLabel}</label>
              <div className="relative max-w-md">
                <Key size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input id="dec-key" type={isCipher ? 'password' : 'text'} value={secretKey} onChange={(e) => setSecretKey(e.target.value)}
                  spellCheck={false} autoComplete="off" className="dh-input w-full pl-8 font-mono"
                  placeholder={mode === 'caesar' ? t('dec.key.shiftPh', 'Vazio = testar todos') : ''} />
              </div>
              {mode === 'aes-gcm' && <p className="dh-help mt-1.5">{t('dec.gcm.help', 'AES-256-GCM autenticado, chave derivada com PBKDF2-SHA256 (310 mil iterações), sal e IV aleatórios. Senha errada falha em vez de devolver lixo.')}</p>}
              {(mode === 'aes' || mode === 'tripledes' || mode === 'rabbit' || mode === 'rc4') && <p className="dh-help mt-1.5">{t('dec.legacy.help', 'Formato OpenSSL/CryptoJS ("Salted__"), útil para abrir dados de outros programas. Para cifrar algo novo, prefira AES-256-GCM.')}</p>}
            </div>
          )}

          {mode === 'hash' ? (
            <div className="space-y-1.5">
              {hashes.length === 0 && <p className="dh-help">{t('dec.hash.empty', 'Digite algo na entrada para ver todos os hashes.')}</p>}
              {hashes.map(({ h, v }) => (
                <div key={h} className="flex items-center gap-3 min-w-0">
                  <span className="w-24 shrink-0 text-[12px] text-zinc-400">{secretKey ? `HMAC-${h}` : h}</span>
                  <code className="flex-1 min-w-0 truncate font-mono text-[12px] text-zinc-200" title={v}>{v}</code>
                  <button onClick={() => copy(v)} className="dh-btn dh-btn-ghost dh-btn-sm" aria-label={t('dec.copy', 'Copiar')}><Copy size={13} /></button>
                </div>
              ))}
            </div>
          ) : mode === 'identify' ? (
            <div className="space-y-3">
              {input && !guesses.length && <p className="dh-help">{t('dec.identify.none', 'Formato não reconhecido. Pode ser texto comum ou uma cifra sem cabeçalho.')}</p>}
              <div className="flex flex-wrap gap-2">
                {guesses.map((g) => GUESS_MODE[g]
                  ? <button key={g} className="dh-btn dh-btn-sm" onClick={() => setMode(GUESS_MODE[g])}>{guessLabel(g)}</button>
                  : <span key={g} className="px-2 py-1 rounded-md bg-zinc-900 text-[12px] text-zinc-300">{guessLabel(g)}</span>)}
              </div>
              {guesses.some((g) => g.startsWith('hash:')) && <p className="dh-help">{t('dec.identify.hash', 'Hashes são de mão única: não dá para "descriptografar", só comparar com o hash de um texto conhecido (aba Hashes).')}</p>}
              {jwt && (
                <div className="grid gap-3 md:grid-cols-2">
                  {(['header', 'payload'] as const).map((k) => (
                    <div key={k}>
                      <p className="dh-label mb-1">{k === 'header' ? t('dec.jwt.header', 'Cabeçalho') : t('dec.jwt.payload', 'Conteúdo')}</p>
                      <pre className="dh-input w-full max-h-60 overflow-auto py-2 font-mono text-[12px] whitespace-pre-wrap">{JSON.stringify(jwt[k], null, 2)}</pre>
                    </div>
                  ))}
                  <p className="dh-help md:col-span-2">{t('dec.jwt.note', 'A assinatura não é verificada (exige a chave de quem emitiu o token).')}</p>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => run('decode')} disabled={!input || busy} className="dh-btn dh-btn-primary">
                  <ArrowRightLeft size={14} />
                  <span>{isCipher ? t('dec.decrypt', 'Descriptografar') : t('dec.decode', 'Decodificar')}</span>
                </button>
                <button onClick={() => run('encode')} disabled={!input || busy} className="dh-btn">
                  <span>{isCipher ? t('dec.encrypt', 'Criptografar') : t('dec.encode', 'Codificar')}</span>
                </button>
                {output && <button onClick={() => { setInput(output); setOutput(''); }} className="dh-btn dh-btn-ghost">{t('dec.useOutput', 'Usar saída como entrada')}</button>}
                {error && <span role="alert" className="text-[12.5px] text-red-400 ml-1">{error}</span>}
              </div>

              {brute.length > 0 && (
                <div>
                  <p className="dh-label mb-1.5">{t('dec.brute', 'Todos os deslocamentos')}</p>
                  <div className="max-h-56 overflow-auto rounded-md border border-zinc-800 divide-y divide-zinc-900">
                    {brute.map((b) => (
                      <button key={b.shift} onClick={() => setSecretKey(String(b.shift))} className="w-full flex gap-3 px-2.5 py-1 text-left hover:bg-zinc-900">
                        <span className="w-8 shrink-0 text-[12px] text-zinc-500 tabular-nums">{b.shift}</span>
                        <span className="truncate font-mono text-[12px] text-zinc-300">{b.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="dec-output" className="dh-label">{t('dec.output', 'Saída')}</label>
                  <button onClick={() => copy(output)} disabled={!output} className="dh-btn dh-btn-ghost dh-btn-sm"><Copy size={14} /> {t('dec.copy', 'Copiar')}</button>
                </div>
                <textarea id="dec-output" value={output} readOnly spellCheck={false} placeholder={t('dec.output.ph', 'O resultado aparecerá aqui...')}
                  className="dh-input w-full h-36 py-2.5 bg-zinc-900/40 resize-none font-mono text-[12.5px] leading-relaxed" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Decryption;
