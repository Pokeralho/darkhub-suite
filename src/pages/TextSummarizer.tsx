import React, { useMemo, useState } from 'react'
import { Copy, FileText, Loader2, Sparkles } from '../components/icons'
import { HelpTip } from '../components/HelpTip'
import { useI18n } from '../i18n/I18nProvider'
import PageHeader from '../components/ui/PageHeader'

const stopwords = new Set([
  'a',
  'o',
  'os',
  'as',
  'de',
  'do',
  'da',
  'dos',
  'das',
  'e',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'para',
  'por',
  'com',
  'sem',
  'um',
  'uma',
  'uns',
  'umas',
  'que',
  'se',
  'ao',
  'aos',
  'à',
  'às',
  'como',
  'mais',
  'menos',
  'muito',
  'muita',
  'muitos',
  'muitas',
  'já',
  'não',
  'sim',
  'ser',
  'estar',
  'ter',
  'há',
  'foi',
  'são',
  'é',
  'and',
  'or',
  'the',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'is',
  'are'
])

function splitSentences(text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const parts = normalized.split(/(?<=[\.\!\?])\s+/g)
  return parts.map((p) => p.trim()).filter(Boolean)
}

function tokenize(sentence: string) {
  return sentence
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .split(/\s+/g)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !stopwords.has(w))
}

function summarize(text: string, maxSentences: number) {
  const sentences = splitSentences(text)
  if (sentences.length <= maxSentences) return sentences.join('\n\n')

  const freq = new Map<string, number>()
  for (const s of sentences) {
    for (const w of tokenize(s)) {
      freq.set(w, (freq.get(w) ?? 0) + 1)
    }
  }

  const scored = sentences.map((s, idx) => {
    const tokens = tokenize(s)
    const score = tokens.reduce((acc, w) => acc + (freq.get(w) ?? 0), 0) / Math.max(1, tokens.length)
    return { idx, s, score }
  })

  const selected = scored
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxSentences))
    .sort((a, b) => a.idx - b.idx)

  return selected.map((x) => x.s).join('\n\n')
}

export default function TextSummarizer() {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [summary, setSummary] = useState('')
  const [sentences, setSentences] = useState(6)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const sentenceCount = useMemo(() => splitSentences(text).length, [text])

  const handleOpen = async () => {
    if (!window.darkhub) return
    const picked = await window.darkhub.dialog.selectFiles({
      title: t('summarizer.openTitle'),
      filters: [{ name: 'Text', extensions: ['txt', 'md', 'log', 'json'] }]
    })
    const filePath = picked?.filePaths?.[0]
    if (picked?.canceled || !filePath) return

    setBusy(true)
    setStatus(null)
    try {
      const res = await window.darkhub.fs.readFile(filePath)
      if (res?.ok) {
        setText(res.content ?? '')
        setSummary('')
      } else {
        setStatus(res?.error ?? 'Falha ao abrir arquivo')
      }
    } catch (e: any) {
      setStatus(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleSummarize = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const out = summarize(text, sentences)
      setSummary(out)
    } catch (e: any) {
      setStatus(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }


  return (
    <div className="w-full max-w-6xl">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            {t('summarizer.title')}
            <HelpTip
              title={t('help.summarizer.overview.title')}
              description={t('help.summarizer.overview.desc')}
              sections={[
                { title: t('help.summarizer.overview.sections.input.title'), content: t('help.summarizer.overview.sections.input.desc') },
                { title: t('help.summarizer.overview.sections.output.title'), content: t('help.summarizer.overview.sections.output.desc') }
              ]}
              example={t('help.summarizer.overview.example')}
              buttonLabel={t('help.button')}
            />
          </span>
        }
        subtitle={t('summarizer.subtitle')}
        actions={
          <>
            <button onClick={handleOpen} disabled={busy} className="dh-btn">
              <FileText size={16} />
              <span>{t('summarizer.open')}</span>
            </button>
            <button
              onClick={handleSummarize}
              disabled={busy || !text.trim()}
              className="dh-btn dh-btn-primary"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              <span>{t('summarizer.summarize')}</span>
            </button>
            <HelpTip
              title={t('help.summarizer.summarize.title')}
              description={t('help.summarizer.summarize.desc')}
              sections={[
                { title: t('help.summarizer.summarize.sections.input.title'), content: t('help.summarizer.summarize.sections.input.desc') },
                { title: t('help.summarizer.summarize.sections.output.title'), content: t('help.summarizer.summarize.sections.output.desc') }
              ]}
              example={t('help.summarizer.summarize.example')}
              buttonLabel={t('help.button')}
            />
          </>
        }
      />

      {status ? (
        <div className="mb-4 flex items-center gap-3 text-[12.5px] text-red-400">
          <span className="min-w-0 truncate">{status}</span>
          <button onClick={handleOpen} disabled={busy} className="dh-btn dh-btn-sm shrink-0">
            {t('common.retry', 'Tentar novamente')}
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="dh-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="dh-section-title">{t('summarizer.text')}</h2>
            <div className="text-[11px] text-zinc-500 font-mono">{t('summarizer.sentencesCount').replace('{n}', String(sentenceCount))}</div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="dh-input w-full h-80 py-2 resize-none leading-relaxed"
            placeholder={t('summarizer.textPlaceholder')}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="dh-label inline-flex items-center gap-2">
              {t('summarizer.size')}
              <HelpTip
                title={t('help.summarizer.size.title')}
                description={t('help.summarizer.size.desc')}
                sections={[
                  { title: t('help.summarizer.size.sections.input.title'), content: t('help.summarizer.size.sections.input.desc') }
                ]}
                example={t('help.summarizer.size.example')}
                buttonLabel={t('help.button')}
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={3}
                max={12}
                value={sentences}
                onChange={(e) => setSentences(Number(e.target.value))}
              />
              <div className="text-[12px] text-zinc-200 font-mono w-6 text-right">{sentences}</div>
            </div>
          </div>
        </section>

        <section className="dh-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="dh-section-title">{t('summarizer.summary')}</h2>
            <button
              onClick={() => navigator.clipboard.writeText(summary).catch(() => {})}
              disabled={!summary.trim()}
              className="dh-btn dh-btn-ghost dh-btn-sm"
            >
              <Copy size={14} />
              <span>{t('summarizer.copy')}</span>
            </button>
          </div>
          {busy ? (
            <div className="h-80 rounded-md border border-zinc-800 bg-zinc-950 p-3 space-y-2.5" aria-busy="true">
              {[90, 74, 82, 58, 86, 66].map((w, i) => (
                <div key={i} className="h-3 rounded bg-zinc-900 animate-pulse" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <textarea
              value={summary}
              readOnly
              className="dh-input w-full h-80 py-2 resize-none leading-relaxed"
              placeholder={t('summarizer.summaryPlaceholder')}
            />
          )}
        </section>
      </div>
    </div>
  )
}
