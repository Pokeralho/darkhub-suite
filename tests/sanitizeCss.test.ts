import { describe, it, expect } from 'vitest'
import { sanitizeImportedCss, isExternalCssUrl } from '../src/components/overlay/sanitizeCss'

describe('sanitizeImportedCss (imported overlay layouts)', () => {
  it('neutralises external url() in every spelling', () => {
    const css = [
      '.a{background:url(https://t.example/p.gif)}',
      '.b{background:url("http://t.example/p.gif")}',
      ".c{background-image:url( 'HTTPS://t.example/p.gif' )}",
      '.d{background:url(//t.example/p.gif)}',
      // CSS source for the UNC path \\server\share\p.png (backslashes escaped inside the CSS string)
      String.raw`.e{background:url("\\\\server\\share\\p.png")}`,
      String.raw`.f{background:u\72l(https://t.example/esc.gif)}`,
      '.g{background:url(ftp://t.example/x)}'
    ].join('\n')
    const out = sanitizeImportedCss(css)
    expect(out).not.toMatch(/t\.example|server/i)
    expect(out.match(/url\("data:,"\)/g)?.length).toBe(7)
  })

  it('drops @import (also escaped) and external bare strings in image-set', () => {
    const out = sanitizeImportedCss(String.raw`@import url(https://x.example/a.css);
@\69mport "https://x.example/b.css";
.h{background-image:image-set("https://x.example/i.png" 1x)}
.i{color:red}`)
    expect(out).not.toMatch(/x\.example/)
    expect(out).not.toMatch(/@import/i)
    expect(out).toContain('.i{color:red}')
  })

  it('keeps data: URIs, local paths and ordinary CSS', () => {
    const css = String.raw`.a{background:url(data:image/png;base64,AAAA)}
.b{background:url("img/x.png")}
.c{background:url(/abs/x.png)}
.d{content:"\2022 ok";color:#fff}`
    expect(sanitizeImportedCss(css)).toBe(css)
  })

  it('strips </style> break-outs', () => {
    expect(sanitizeImportedCss('.a{}</style><img src=x>')).not.toMatch(/<\/style/i)
  })

  it('classifies url targets', () => {
    expect(isExternalCssUrl('https://a')).toBe(true)
    expect(isExternalCssUrl(' "//a" ')).toBe(true)
    expect(isExternalCssUrl('/\\a')).toBe(true)
    expect(isExternalCssUrl('java\nscript:alert(1)')).toBe(true)
    expect(isExternalCssUrl('data:image/png;base64,AA')).toBe(false)
    expect(isExternalCssUrl('fonts/x.woff2')).toBe(false)
  })
})
