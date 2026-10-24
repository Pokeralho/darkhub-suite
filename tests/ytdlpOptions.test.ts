// @vitest-environment node
import { describe, it, expect } from 'vitest'
// @ts-ignore - plain JS module
import { buildExtraArgs, parseTime } from '../electron/services/ytdlpOptions.js'

describe('ytdlpOptions', () => {
  it('parses times', () => {
    expect(parseTime('1:30')).toBe(90)
    expect(parseTime('01:02:03')).toBe(3723)
    expect(parseTime('45')).toBe(45)
    expect(parseTime('abc')).toBeNull()
    expect(parseTime('')).toBeNull()
  })

  it('builds the expected arguments', () => {
    const { args, container } = buildExtraArgs({
      container: 'mkv', codec: 'h264', subtitles: true, autoSubs: true, subLangs: 'pt.*, en.*, bad;rm',
      chapters: 'embed', sponsorBlock: ['sponsor', 'evil'], trimStart: '1:00', trimEnd: '2:00', playlistItems: '1-5, 9', rateLimit: '5m'
    })
    expect(container).toBe('mkv')
    expect(args).toEqual([
      '-S', 'vcodec:h264,res,acodec:m4a',
      '--write-subs', '--sub-langs', 'pt.*,en.*', '--embed-subs', '--write-auto-subs', '--convert-subs', 'srt',
      '--embed-chapters',
      '--sponsorblock-remove', 'sponsor',
      '--download-sections', '*60-120', '--force-keyframes-at-cuts',
      '--playlist-items', '1-5,9',
      '-r', '5M'
    ])
  })

  it('skips video-only options for audio and rejects bad input', () => {
    expect(buildExtraArgs({ codec: 'h264', subtitles: true }, true).args).toEqual([])
    expect(buildExtraArgs({ trimStart: '30' }).args).toEqual(['--download-sections', '*30-inf', '--force-keyframes-at-cuts'])
    expect(() => buildExtraArgs({ trimStart: '2:00', trimEnd: '1:00' })).toThrow()
    expect(() => buildExtraArgs({ playlistItems: '1;calc' })).toThrow()
    expect(() => buildExtraArgs({ rateLimit: '5 MB' })).toThrow()
  })
})
