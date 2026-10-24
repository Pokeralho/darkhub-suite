import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Save, FolderOpen, AlertCircle, Plus, Check, Play, Square, Loader2, RefreshCw } from '../components/icons';
import { useI18n } from '../i18n/I18nProvider';
import { HelpTip } from '../components/HelpTip';
import PageHeader from '../components/ui/PageHeader';
import { EXAMPLES, LANGUAGE_EXT, languageForFile, type CodeLanguage, type ExampleId } from '../lib/codeExamples';

type Runtimes = Record<string, { label: string; available: boolean; path: string | null }>;
type RunResult = NonNullable<Awaited<ReturnType<NonNullable<typeof window.darkhub>['code']['run']>>>;

const LANGS: CodeLanguage[] = ['javascript', 'python', 'powershell', 'c', 'cpp', 'csharp', 'java', 'go', 'rust', 'batch'];
// where to get each toolchain when it is missing (winget ids where one exists)
const INSTALL_HINT: Partial<Record<CodeLanguage, string>> = {
  python: 'winget install Python.Python.3.13', c: 'winget install BrechtSanders.WinLibs.POSIX.UCRT', cpp: 'winget install BrechtSanders.WinLibs.POSIX.UCRT',
  csharp: 'winget install Microsoft.DotNet.SDK.10', java: 'winget install EclipseAdoptium.Temurin.21.JDK', go: 'winget install GoLang.Go', rust: 'winget install Rustlang.Rustup'
};
const TEXT_EXT = ['txt', 'md', 'json', 'log', 'csv', 'xml', 'yaml', 'yml', 'ini', 'html', 'css'];

const TextEditor = () => {
  const { t } = useI18n();
  const [content, setContent] = useState('');
  const [filePath, setFilePath] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [language, setLanguage] = useState<CodeLanguage | ''>('');
  const [runtimes, setRuntimes] = useState<Runtimes | null>(null);
  const [stdin, setStdin] = useState('');
  const [timeoutSec, setTimeoutSec] = useState(10);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const api = () => window.darkhub?.code;
  const loadRuntimes = (refresh = false) => { void api()?.runtimes({ refresh }).then((r) => { if (r?.ok && r.runtimes) setRuntimes(r.runtimes); }).catch(() => {}); };
  useEffect(() => { loadRuntimes(); }, []);

  const handleOpen = async () => {
    if (!window.darkhub) return;
    try {
      const res = await window.darkhub.dialog.selectFiles({
        title: t('text.openTitle'),
        filters: [
          { name: t('textx.filter.all', 'Texto e código'), extensions: [...TEXT_EXT, ...Object.values(LANGUAGE_EXT).flat()] },
          { name: t('textx.filter.any', 'Todos os arquivos'), extensions: ['*'] }
        ]
      });
      if (!res.canceled && res.filePaths.length > 0) {
        const file = res.filePaths[0];
        const readRes = await window.darkhub.fs.readFile(file);
        if (readRes.ok) {
          setContent(readRes.content);
          setFilePath(file);
          setLanguage(languageForFile(file) ?? '');
          setStatus(null);
          setResult(null);
        } else {
          setStatus({ ok: false, msg: readRes.error });
        }
      }
    } catch (err: any) {
      setStatus({ ok: false, msg: err?.message ?? String(err) });
    }
  };

  const handleSave = async () => {
    if (!window.darkhub) return;
    try {
      let targetPath = filePath;
      if (!targetPath) {
        const ext = language ? LANGUAGE_EXT[language] : TEXT_EXT;
        const picked = await window.darkhub.dialog.saveFile({ title: t('text.saveAsTitle'), filters: [{ name: language || 'Text', extensions: ext }] });
        if (picked?.canceled || !picked?.filePath) return;
        targetPath = picked.filePath;
        setFilePath(targetPath);
      }
      const res = await window.darkhub.fs.writeFile({ filePath: targetPath, content });
      if (res.ok) {
        setStatus({ ok: true, msg: t('text.saved') });
        setTimeout(() => setStatus(null), 3000);
      } else {
        setStatus({ ok: false, msg: res.error });
      }
    } catch (err: any) {
      setStatus({ ok: false, msg: err?.message ?? String(err) });
    }
  };

  const handleNew = () => { setContent(''); setFilePath(null); setStatus(null); setResult(null); };

  const loadExample = (id: ExampleId) => {
    if (!language) return;
    if (content.trim() && !window.confirm(t('textx.replaceConfirm', 'Substituir o texto atual pelo exemplo?'))) return;
    setContent(EXAMPLES[language][id]);
    setFilePath(null);
    setResult(null);
    if (id === 'input' && !stdin) setStdin(language === 'c' ? '2 3' : 'Maria');
  };

  const runtime = language ? runtimes?.[language] : undefined;
  const canRun = Boolean(language && runtime?.available && content.trim() && !running);

  const run = async () => {
    if (!language || running || !content.trim()) return;
    setRunning(true);
    setResult(null);
    try {
      const r = await api()?.run({ language, code: content, input: stdin, timeoutSec });
      setResult(r ?? { ok: false, error: 'offline' });
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? String(e) });
    } finally {
      setRunning(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.key === 'Enter' && (e.ctrlKey || e.metaKey)) || e.key === 'F5') { e.preventDefault(); void run(); return; }
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
      // indent with spaces instead of leaving the editor
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: a, selectionEnd: b } = el;
      const next = content.slice(0, a) + '  ' + content.slice(b);
      setContent(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 2; });
    }
  };

  const lineCount = content ? content.split('\n').length : 1;
  const gutter = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1).join('\n'), [lineCount]);

  const outcome = (() => {
    if (!result) return null;
    if (!result.ok) return { tone: 'text-red-400', text: result.error === 'runtime-missing' ? t('textx.missing', '{lang} não está instalado neste PC.').replace('{lang}', runtime?.label ?? String(language)) : String(result.error) };
    if (result.cancelled) return { tone: 'text-zinc-400', text: t('textx.cancelled', 'Execução interrompida.') };
    if (result.timedOut) return { tone: 'text-amber-300', text: t('textx.timeout', 'Tempo limite de {n} s atingido: o programa foi encerrado (laço infinito?).').replace('{n}', String(timeoutSec)) };
    if (result.phase === 'compile') return { tone: 'text-red-400', text: t('textx.compileError', 'Erro de compilação: veja as mensagens abaixo.') };
    return result.code === 0
      ? { tone: 'text-emerald-400', text: t('textx.ok', 'Terminou em {ms} ms (código 0).').replace('{ms}', String(result.ms)) }
      : { tone: 'text-red-400', text: t('textx.exit', 'Terminou com erro (código {c}) em {ms} ms.').replace('{c}', String(result.code)).replace('{ms}', String(result.ms)) };
  })();

  return (
    <div className="w-full h-full flex flex-col">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t('text.title')}
            <HelpTip
              title={t('help.text.overview.title')}
              description={t('help.text.overview.desc')}
              sections={[
                { title: t('help.text.overview.sections.storage.title'), content: t('help.text.overview.sections.storage.desc') },
                { title: t('textx.help.runTitle', 'Executar código'), content: t('textx.help.run', 'Escolha a linguagem e clique em Executar (ou Ctrl+Enter / F5). O texto do campo Entrada vai para o programa como se fosse digitado. Use os Exemplos para aprender: a mesma ideia em cada linguagem.') }
              ]}
              buttonLabel={t('help.button')}
            />
          </span>
        }
        subtitle={t('textx.subtitle', 'Edite textos e rode código em JavaScript, Python, PowerShell, C, C++, C#, Java, Go e Rust.')}
        actions={
          <>
            <button onClick={handleNew} className="dh-btn dh-btn-ghost"><Plus size={16} /><span>{t('text.new')}</span></button>
            <button onClick={handleOpen} className="dh-btn"><FolderOpen size={16} /><span>{t('text.open')}</span></button>
            <button onClick={handleSave} className="dh-btn dh-btn-primary"><Save size={16} /><span>{t('text.save')}</span></button>
          </>
        }
      />

      {status && (
        <div className={`mb-3 flex items-center gap-2 text-[12.5px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>
          {status.ok ? <Check size={14} /> : <AlertCircle size={14} />}
          <span className="min-w-0 truncate">{status.msg}</span>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={language} onChange={(e) => { setLanguage(e.target.value as CodeLanguage | ''); setResult(null); }} className="dh-input" aria-label={t('textx.language', 'Linguagem')}>
          <option value="">{t('textx.plain', 'Texto simples')}</option>
          {LANGS.map((l) => (
            <option key={l} value={l}>{runtimes?.[l]?.label ?? l}{runtimes && !runtimes[l]?.available ? ` (${t('textx.notInstalled', 'não instalado')})` : ''}</option>
          ))}
        </select>
        {language && (
          <>
            <select value="" onChange={(e) => e.target.value && loadExample(e.target.value as ExampleId)} className="dh-input" aria-label={t('textx.examples', 'Exemplos')}>
              <option value="">{t('textx.examples', 'Exemplos')}…</option>
              <option value="hello">{t('textx.ex.hello', 'Olá, mundo (saída)')}</option>
              <option value="input">{t('textx.ex.input', 'Ler a entrada')}</option>
              <option value="loop">{t('textx.ex.loop', 'Função e laço')}</option>
            </select>
            {running ? (
              <button onClick={() => void api()?.cancel()} className="dh-btn dh-btn-danger"><Square size={14} />{t('textx.stop', 'Parar')}</button>
            ) : (
              <button onClick={() => void run()} disabled={!canRun} className="dh-btn dh-btn-primary" title="Ctrl+Enter / F5"><Play size={14} />{t('textx.run', 'Executar')}</button>
            )}
            <label className="flex items-center gap-1.5 text-[12px] text-zinc-400">
              {t('textx.limit', 'Limite')}
              <input type="number" min={1} max={120} value={timeoutSec} onChange={(e) => setTimeoutSec(Math.max(1, Math.min(120, Number(e.target.value) || 10)))} className="dh-input w-16 font-mono" />
              s
            </label>
            {runtime && !runtime.available && (
              <span className="flex items-center gap-2 text-[12px] text-amber-300">
                <AlertCircle size={14} />
                {t('textx.install', 'Instale para rodar:')}
                {INSTALL_HINT[language] && <code className="font-mono text-zinc-300 select-all">{INSTALL_HINT[language]}</code>}
                <button onClick={() => loadRuntimes(true)} className="dh-btn dh-btn-ghost dh-btn-sm"><RefreshCw size={13} />{t('textx.recheck', 'Verificar de novo')}</button>
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex-1 min-h-[300px] bg-zinc-950 border border-zinc-800/80 rounded-xl flex flex-col overflow-hidden">
        <div className="h-9 px-3 border-b border-zinc-800/80 flex items-center justify-between gap-3">
          <span className={`font-mono text-[11.5px] truncate ${filePath ? 'text-zinc-400' : 'text-zinc-500'}`}>{filePath ? filePath : t('text.untitled')}</span>
          <span className="font-mono text-[11px] text-zinc-400 shrink-0">
            {content ? lineCount : 0} <span className="text-zinc-600">{t('text.lines', 'linhas')}</span>
            <span className="mx-2 text-zinc-700">/</span>
            {content.length} <span className="text-zinc-600">{t('text.chars', 'caracteres')}</span>
          </span>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div ref={gutterRef} aria-hidden="true" className="shrink-0 overflow-hidden select-none py-4 pl-3 pr-2 text-right font-mono text-[13px] leading-relaxed text-zinc-600 whitespace-pre">{gutter}</div>
          <textarea
            ref={editorRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={onKeyDown}
            onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
            wrap="off"
            className="flex-1 min-w-0 bg-transparent text-zinc-200 py-4 pr-4 pl-2 font-mono text-[13px] leading-relaxed resize-none focus:outline-none"
            spellCheck={false}
            aria-label={t('text.title')}
          />
        </div>
      </div>

      {language && (
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col">
            <label htmlFor="code-stdin" className="dh-label mb-1">{t('textx.stdin', 'Entrada (stdin)')}</label>
            <textarea id="code-stdin" value={stdin} onChange={(e) => setStdin(e.target.value)} spellCheck={false}
              placeholder={t('textx.stdinPh', 'O que o programa vai ler, como se fosse digitado')}
              className="dh-input h-32 py-2 resize-none font-mono text-[12.5px]" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="dh-label">{t('textx.output', 'Saída')}</span>
              {running && <Loader2 size={13} className="animate-spin text-zinc-400" />}
              {outcome && <span className={`text-[12px] truncate ${outcome.tone}`}>{outcome.text}</span>}
            </div>
            <pre className="h-32 overflow-auto rounded-md border border-zinc-800/80 bg-zinc-950 p-2 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap break-words">
              {result?.ok && result.stdout ? <span className="text-zinc-200">{result.stdout}</span> : null}
              {result?.ok && result.stderr ? <span className="text-red-300">{result.stderr}</span> : null}
              {!result && !running && <span className="text-zinc-600">{t('textx.outputPh', 'Clique em Executar (Ctrl+Enter) para ver o resultado aqui.')}</span>}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextEditor;
