import { describe, it, expect } from 'vitest'
import { messages } from '../src/i18n/messages'
import { hubMessages } from '../src/i18n/hubMessages'
import { overlayEditorMessages } from '../src/i18n/overlayEditorMessages'
import { powerMessages } from '../src/i18n/powerMessages'
import { parts as ptParts } from '../src/i18n/locales/pt-BR/index'
import { parts as enParts } from '../src/i18n/locales/en-US/index'
import ptSsh from '../src/i18n/locales/pt-BR/ssh'
import enSsh from '../src/i18n/locales/en-US/ssh'
import ptPs from '../src/i18n/locales/pt-BR/psTools'
import enPs from '../src/i18n/locales/en-US/psTools'
import ptRec from '../src/i18n/locales/pt-BR/recovery'
import enRec from '../src/i18n/locales/en-US/recovery'

const keys = (d: Record<string, string>) => Object.keys(d).sort()

describe('i18n parity', () => {
  it.each([
    ['hubMessages', hubMessages],
    ['overlayEditorMessages', overlayEditorMessages],
    ['powerMessages', powerMessages]
  ])('%s has the same keys in pt-BR and en-US', (_name, dicts) => {
    expect(keys(dicts['pt-BR'])).toEqual(keys(dicts['en-US']))
  })

  it('the merged dictionaries have the same keys in pt-BR and en-US', () => {
    const pt = new Set(Object.keys(messages['pt-BR']))
    const en = new Set(Object.keys(messages['en-US']))
    expect([...pt].filter((k) => !en.has(k))).toEqual([])
    expect([...en].filter((k) => !pt.has(k))).toEqual([])
  })
})

describe('per-language locale chunks', () => {
  // The app loads locales/<lang>/index.ts at startup and the screen namespaces on demand (src/i18n/store.ts);
  // merged in order they must give exactly the combined `messages` dictionary.
  const merge = (parts: ReadonlyArray<readonly [number, Record<string, string>]>, extra: Array<[number, Record<string, string>]>) => {
    const all = [...parts, ...extra].sort((a, b) => a[0] - b[0])
    return Object.assign({}, ...all.map(([, d]) => d))
  }

  it('pt-BR startup + namespaces equals messages[pt-BR]', () => {
    expect(merge(ptParts, [[2, ptSsh], [9, ptPs], [31, ptRec]])).toEqual(messages['pt-BR'])
  })

  it('en-US startup + namespaces equals messages[en-US]', () => {
    expect(merge(enParts, [[2, enSsh], [9, enPs], [31, enRec]])).toEqual(messages['en-US'])
  })

  it('the startup chunk of a language never contains the other language', () => {
    const pt = merge(ptParts, [])
    expect(pt['nav.home']).toBe(messages['pt-BR']['nav.home'])
    expect(pt['nav.home']).not.toBe(messages['en-US']['nav.home'])
  })
})
