import React, { useMemo, useState } from 'react'
import { Copy, FileText, Loader2, Sparkles } from 'lucide-react'
import { HelpTip } from '../components/HelpTip'
import { useI18n } from '../i18n/I18nProvider'

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
    <div className="space-y-6 w-full">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">{t('summarizer.title')}</h1>
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
          </div>
          <p className="text-zinc-400">{t('summarizer.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleOpen}
            disabled={busy}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <FileText size={18} />
            <span>{t('summarizer.open')}</span>
          </button>
          <button
            onClick={handleSummarize}
            disabled={busy || !text.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
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
        </div>
      </div>

      {status ? <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{status}</div> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-200">{t('summarizer.text')}</div>
            <div className="text-xs text-zinc-500">{t('summarizer.sentencesCount').replace('{n}', String(sentenceCount))}</div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full h-80 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-blue-500"
            placeholder={t('summarizer.textPlaceholder')}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-400 inline-flex items-center gap-2">
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
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={3}
                max={12}
                value={sentences}
                onChange={(e) => setSentences(Number(e.target.value))}
              />
              <div className="text-xs text-zinc-300 w-10 text-right">{sentences}</div>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-200">{t('summarizer.summary')}</div>
            <button
              onClick={() => navigator.clipboard.writeText(summary)}
              disabled={!summary.trim()}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Copy size={16} />
              <span>{t('summarizer.copy')}</span>
            </button>
          </div>
          <textarea
            value={summary}
            readOnly
            className="w-full h-80 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none"
            placeholder={t('summarizer.summaryPlaceholder')}
          />
        </div>
      </div>
    </div>
  )
}
