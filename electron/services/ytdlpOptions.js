// Extra yt-dlp options from the Video Downloader screen → argument array. Pure; every value is validated here
// because it comes from the renderer.

const CONTAINERS = ['mp4', 'mkv', 'webm']
const SPONSOR_CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic', 'filler']
const TIME = /^(\d{1,2}:)?\d{1,2}:\d{2}(\.\d+)?$|^\d+(\.\d+)?$/

/** "1:30" / "01:02:03" / "90" → seconds, or null. */
export function parseTime(v) {
  const s = String(v ?? '').trim()
  if (!s || !TIME.test(s)) return null
  return s.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)
}

/**
 * @param {object} o
 * @param {boolean} audioOnly  audio presets ignore container/codec options
 * @returns {{ args: string[], container: string }}
 */
export function buildExtraArgs(o = {}, audioOnly = false) {
  const args = []
  const container = CONTAINERS.includes(o.container) ? o.container : 'mp4'

  if (!audioOnly) {
    // h264: plays everywhere (TVs, editors, WhatsApp); best: AV1/VP9 when available (smaller, sharper)
    if (o.codec === 'h264') args.push('-S', 'vcodec:h264,res,acodec:m4a')
    else if (o.codec === 'av1') args.push('-S', 'vcodec:av01,res')

    if (o.subtitles) {
      const langs = String(o.subLangs || 'pt.*,en.*').split(',').map((x) => x.trim()).filter((x) => /^[a-zA-Z.*-]{1,12}$/.test(x)).slice(0, 8)
      args.push('--write-subs', '--sub-langs', langs.join(',') || 'pt.*,en.*', '--embed-subs')
      if (o.autoSubs) args.push('--write-auto-subs')
      // webm can't carry srt; mp4/mkv embed fine after conversion
      if (container !== 'webm') args.push('--convert-subs', 'srt')
    }
  }

  if (o.chapters === 'embed') args.push('--embed-chapters')
  else if (o.chapters === 'split') args.push('--split-chapters', '-o', 'chapter:%(title).120B/%(section_number)02d - %(section_title).120B.%(ext)s')

  const sponsor = (Array.isArray(o.sponsorBlock) ? o.sponsorBlock : []).filter((c) => SPONSOR_CATEGORIES.includes(c))
  if (sponsor.length) args.push(o.sponsorMode === 'mark' ? '--sponsorblock-mark' : '--sponsorblock-remove', sponsor.join(','))

  const from = parseTime(o.trimStart)
  const to = parseTime(o.trimEnd)
  if (from != null || to != null) {
    if (to != null && from != null && to <= from) throw new Error('O fim do trecho precisa ser depois do início.')
    args.push('--download-sections', `*${from ?? 0}-${to ?? 'inf'}`, '--force-keyframes-at-cuts')
  }

  const items = String(o.playlistItems ?? '').replace(/\s/g, '')
  if (items) {
    if (!/^(\d+(-\d*)?|-\d+)(,(\d+(-\d*)?|-\d+))*$/.test(items)) throw new Error('Intervalo da playlist inválido (ex.: 1-10,15,20-).')
    args.push('--playlist-items', items)
  }

  const rate = String(o.rateLimit ?? '').trim()
  if (rate) {
    if (!/^\d+(\.\d+)?[KMG]?$/i.test(rate)) throw new Error('Limite de velocidade inválido (ex.: 5M, 800K).')
    args.push('-r', rate.toUpperCase())
  }

  if (o.archivePath) args.push('--download-archive', String(o.archivePath))
  if (o.writeDescription) args.push('--write-description')
  if (o.writeThumbnail) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg')

  return { args, container }
}
