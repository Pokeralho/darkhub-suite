// Pure planning for audio/video conversions: reads what `ffmpeg -i` says about the input, then decides per stream
// whether it can be copied (no re-encode) or must be encoded, and with which encoder (GPU first, CPU fallback).
// No I/O here, so every decision is unit-tested (tests/converterMedia.test.ts).

/** Codecs NVDEC can decode on the GPU (8-bit 4:2:0 keeps the frames in VRAM end to end). */
const NVDEC_CODECS = new Set(['h264', 'hevc', 'vp8', 'vp9', 'av1', 'mpeg1video', 'mpeg2video', 'mpeg4', 'vc1', 'mjpeg'])
const EIGHT_BIT_420 = new Set(['yuv420p', 'yuvj420p', 'nv12'])
const TEN_BIT_420 = new Set(['yuv420p10le', 'yuv420p10be', 'p010le'])
const TEXT_SUBS = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text'])

/**
 * Container rules. `copyVideo`/`copyAudio`: codecs the container accepts as-is ('*' = anything ffmpeg can mux).
 * `video`: codecs offered for encoding, first = default. `audio`: encoder used when audio cannot be copied.
 */
export const VIDEO_TARGETS = {
  mp4: { video: ['h264', 'hevc', 'av1'], copyVideo: ['h264', 'hevc', 'av1', 'mpeg4', 'vp9'], copyAudio: ['aac', 'mp3', 'ac3', 'eac3', 'alac', 'opus', 'flac'], audio: 'aac', subs: 'mov_text', faststart: true },
  mov: { video: ['h264', 'hevc'], copyVideo: ['h264', 'hevc', 'mpeg4', 'prores', 'mjpeg'], copyAudio: ['aac', 'alac', 'mp3', 'ac3', 'pcm_s16le', 'pcm_s24le'], audio: 'aac', subs: 'mov_text', faststart: true },
  mkv: { video: ['h264', 'hevc', 'av1'], copyVideo: '*', copyAudio: '*', audio: 'aac', subs: 'copy' },
  webm: { video: ['vp9', 'av1'], copyVideo: ['vp8', 'vp9', 'av1'], copyAudio: ['opus', 'vorbis'], audio: 'opus', subs: 'webvtt' },
  avi: { video: ['mpeg4'], copyVideo: ['mpeg4', 'h264', 'mjpeg', 'msmpeg4v3'], copyAudio: ['mp3', 'ac3', 'pcm_s16le'], audio: 'mp3' },
  wmv: { video: ['wmv2'], copyVideo: ['wmv1', 'wmv2', 'wmv3', 'vc1'], copyAudio: ['wmav1', 'wmav2'], audio: 'wmav2' },
  flv: { video: ['h264'], copyVideo: ['h264', 'flv1'], copyAudio: ['aac', 'mp3'], audio: 'aac' },
  ts: { video: ['h264', 'hevc'], copyVideo: ['h264', 'hevc', 'mpeg2video'], copyAudio: ['aac', 'ac3', 'eac3', 'mp3', 'mp2'], audio: 'aac' },
  m4v: { video: ['h264', 'hevc'], copyVideo: ['h264', 'hevc'], copyAudio: ['aac', 'ac3', 'alac'], audio: 'aac', subs: 'mov_text', faststart: true }
}

/** Audio-only targets: encoder args and the source codecs that can be copied straight into the container. */
export const AUDIO_TARGETS = {
  mp3: { copy: ['mp3'], args: (br) => ['-c:a', 'libmp3lame', '-b:a', br || '320k'] },
  wav: { copy: ['pcm_s16le'], args: () => ['-c:a', 'pcm_s16le'] },
  flac: { copy: ['flac'], args: () => ['-c:a', 'flac', '-compression_level', '8'] },
  m4a: { copy: ['aac', 'alac'], args: (br) => ['-c:a', 'aac', '-b:a', br || '256k'] },
  aac: { copy: ['aac'], args: (br) => ['-c:a', 'aac', '-b:a', br || '256k'], format: 'adts' },
  ogg: { copy: ['vorbis', 'opus'], args: (br) => ['-c:a', 'libvorbis', '-b:a', br || '256k'] },
  opus: { copy: ['opus'], args: (br) => ['-c:a', 'libopus', '-b:a', br || '160k'] },
  wma: { copy: ['wmav2'], args: (br) => ['-c:a', 'wmav2', '-b:a', br || '192k'] },
  aiff: { copy: ['pcm_s16be'], args: () => ['-c:a', 'pcm_s16be'] },
  ac3: { copy: ['ac3'], args: (br) => ['-c:a', 'ac3', '-b:a', br || '448k'] },
  alac: { copy: ['alac'], args: () => ['-c:a', 'alac'], ext: 'm4a' }
}

export const MEDIA_OUTPUTS = [...Object.keys(VIDEO_TARGETS), 'gif', ...Object.keys(AUDIO_TARGETS)]

/** Parses the stream list `ffmpeg -hide_banner -i <file>` prints on stderr. */
export function parseProbe(stderr) {
  const text = String(stderr || '')
  const out = { durationSec: 0, video: null, videos: [], audio: [], subtitles: [], attachments: 0 }
  const d = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (d) out.durationSec = Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3])
  const re = /Stream #0:(\d+)(?:\[[^\]]*\])?(?:\(([^)]*)\))?: (Video|Audio|Subtitle|Attachment|Data): ([^\r\n]*)/g
  let m
  while ((m = re.exec(text))) {
    const index = Number(m[1])
    const kind = m[3]
    const rest = m[4]
    const codec = (rest.match(/^([\w-]+)/) || [])[1] || 'unknown'
    if (kind === 'Video') {
      // pixel format is the first ", word" after the codec descriptions; its own "(tv, bt709)" may contain commas
      const pix = (rest.match(/^[\w-]+(?: \([^)]*\))*, ([a-z0-9_]+)/) || [])[1] || ''
      const size = rest.match(/, (\d{2,5})x(\d{2,5})/)
      const fps = rest.match(/, ([\d.]+) fps/)
      const v = {
        index, codec, pixFmt: pix,
        width: size ? Number(size[1]) : 0, height: size ? Number(size[2]) : 0,
        fps: fps ? Number(fps[1]) : 0,
        attachedPic: /\(attached pic\)/.test(rest)
      }
      out.videos.push(v)
      if (!out.video && !v.attachedPic) out.video = v
    } else if (kind === 'Audio') {
      const ch = rest.match(/, (mono|stereo|5\.1|7\.1|quad|[\d.]+ channels)/)
      out.audio.push({ index, codec, lang: m[2] || '', channels: ch ? ch[1] : '' })
    } else if (kind === 'Subtitle') {
      out.subtitles.push({ index, codec, lang: m[2] || '', text: TEXT_SUBS.has(codec) })
    } else if (kind === 'Attachment') {
      out.attachments += 1
    }
  }
  return out
}

/** Encoder name per (codec, vendor). Vendors are tried in the order the detection found them. */
export const HW_ENCODERS = {
  h264: { nvenc: 'h264_nvenc', amf: 'h264_amf', qsv: 'h264_qsv' },
  hevc: { nvenc: 'hevc_nvenc', amf: 'hevc_amf', qsv: 'hevc_qsv' },
  av1: { nvenc: 'av1_nvenc', amf: 'av1_amf', qsv: 'av1_qsv' },
  vp9: { qsv: 'vp9_qsv' }
}
export const SW_ENCODERS = { h264: 'libx264', hevc: 'libx265', av1: 'libaom-av1', vp9: 'libvpx-vp9', mpeg4: 'mpeg4', wmv2: 'wmv2' }

/** Every hardware encoder name worth probing. */
export const HW_ENCODER_NAMES = Object.values(HW_ENCODERS).flatMap((v) => Object.values(v))

/**
 * Constant-quality targets, calibrated with VMAF on a 1080p60 H.264 source on an RTX 5060: NVENC H.264 cq 30 scored
 * 96.8 against 94.8 for the old libx264 -preset fast -crf 22, at a similar size. Lower = better and bigger.
 */
const QUALITY = {
  fast: { nv: { h264: 32, hevc: 32, av1: 36 }, nvPreset: 'p3', amf: 'speed', qsv: 'veryfast', x264: ['veryfast', 23], x265: ['veryfast', 27], aom: [8, 36], vpx: [6, 34], qp: 26 },
  balanced: { nv: { h264: 30, hevc: 30, av1: 34 }, nvPreset: 'p5', amf: 'balanced', qsv: 'medium', x264: ['fast', 22], x265: ['fast', 25], aom: [6, 32], vpx: [4, 32], qp: 23 },
  high: { nv: { h264: 26, hevc: 26, av1: 30 }, nvPreset: 'p6', amf: 'quality', qsv: 'slower', x264: ['medium', 19], x265: ['medium', 22], aom: [4, 28], vpx: [2, 28], qp: 20 }
}

function encoderArgs(codec, encoder, quality, threads) {
  const q = QUALITY[quality] || QUALITY.balanced
  if (encoder.endsWith('_nvenc')) {
    const a = ['-c:v', encoder, '-preset', q.nvPreset, '-tune', 'hq', '-rc', 'vbr', '-cq', String(q.nv[codec] ?? 30), '-b:v', '0']
    if (quality === 'high') a.push('-multipass', 'qres')
    return a
  }
  if (encoder.endsWith('_amf')) {
    return ['-c:v', encoder, '-quality', q.amf, '-rc', 'cqp', '-qp_i', String(q.qp), '-qp_p', String(q.qp + 2), ...(codec === 'av1' ? [] : ['-qp_b', String(q.qp + 4)])]
  }
  if (encoder.endsWith('_qsv')) return ['-c:v', encoder, '-preset', q.qsv, '-global_quality', String(q.qp)]
  const t = threads ? ['-threads', String(threads)] : []
  switch (encoder) {
    case 'libx264': return ['-c:v', 'libx264', '-preset', q.x264[0], '-crf', String(q.x264[1]), ...t]
    case 'libx265': return ['-c:v', 'libx265', '-preset', q.x265[0], '-crf', String(q.x265[1]), '-x265-params', `log-level=error${threads ? `:pools=${threads}` : ''}`]
    case 'libaom-av1': return ['-c:v', 'libaom-av1', '-cpu-used', String(q.aom[0]), '-crf', String(q.aom[1]), '-b:v', '0', '-row-mt', '1', '-tiles', '2x2', ...t]
    case 'libvpx-vp9': return ['-c:v', 'libvpx-vp9', '-deadline', 'good', '-cpu-used', String(q.vpx[0]), '-crf', String(q.vpx[1]), '-b:v', '0', '-row-mt', '1', '-tile-columns', '2', ...t]
    case 'mpeg4': return ['-c:v', 'mpeg4', '-vtag', 'XVID', '-qscale:v', quality === 'high' ? '2' : '3', ...t]
    case 'wmv2': return ['-c:v', 'wmv2', '-qscale:v', quality === 'high' ? '2' : '4', ...t]
    default: return ['-c:v', encoder, ...t]
  }
}

function audioEncoderArgs(name, bitrate) {
  switch (name) {
    case 'aac': return ['-c:a', 'aac', '-b:a', bitrate || '192k']
    case 'opus': return ['-c:a', 'libopus', '-b:a', bitrate || '160k']
    case 'mp3': return ['-c:a', 'libmp3lame', '-b:a', bitrate || '192k']
    case 'wmav2': return ['-c:a', 'wmav2', '-b:a', bitrate || '192k']
    default: return ['-c:a', name]
  }
}

const accepts = (list, codec) => list === '*' || (Array.isArray(list) && list.includes(codec))

/**
 * Picks the encoder for a codec: the first detected hardware encoder unless `encoderPref` is 'cpu', else software.
 * `available` is the list of hardware encoder names that passed the real test encode.
 */
export function pickVideoEncoder(codec, { encoderPref = 'auto', available = [] } = {}) {
  if (encoderPref !== 'cpu') {
    const hw = HW_ENCODERS[codec] || {}
    for (const vendor of ['nvenc', 'amf', 'qsv']) {
      if (hw[vendor] && available.includes(hw[vendor])) return { encoder: hw[vendor], hardware: vendor }
    }
  }
  return { encoder: SW_ENCODERS[codec] || codec, hardware: null }
}

/**
 * Builds the ffmpeg plan for one file. Returns { attempts: [{ label, args, encoder, hardware, copy }], mode } where
 * attempts are tried in order (full GPU pipeline, GPU encode with CPU decode, CPU only); args exclude the output path.
 *
 * opts: { target, sourceExt, codec ('auto'|...), quality, maxHeight, maxFps, encoderPref ('auto'|'gpu'|'cpu'),
 *         copy ('auto'|'never'), audioBitrate, gifFps, gifWidth, threads, available (hw encoders) }
 */
export function buildMediaPlan(inputFile, probe, opts = {}) {
  const target = String(opts.target || '').toLowerCase()
  const sourceExt = String(opts.sourceExt || '').toLowerCase()
  const sameContainer = sourceExt === target || (sourceExt === 'mkv' && target === 'mkv')
  const threads = opts.threads > 0 ? opts.threads : 0
  const base = ['-hide_banner', '-nostdin', '-y']
  const progress = ['-progress', 'pipe:1', '-nostats', '-loglevel', 'error']

  if (AUDIO_TARGETS[target]) {
    const t = AUDIO_TARGETS[target]
    const a = probe.audio[0]
    if (!a) throw new Error('no-audio-stream')
    const copy = opts.copy !== 'never' && !sameContainer && t.copy.includes(a.codec)
    const args = [...base, '-i', inputFile, '-map', `0:${a.index}`, '-vn', '-sn', '-dn', '-map_metadata', '0',
      ...(copy ? ['-c:a', 'copy'] : t.args(opts.audioBitrate)), ...(t.format ? ['-f', t.format] : []), ...progress]
    return { mode: copy ? 'copy' : 'audio', ext: t.ext || target, attempts: [{ label: copy ? 'copy' : 'audio', args, encoder: copy ? 'copy' : null, hardware: null, copy }] }
  }

  if (target === 'gif') {
    if (!probe.video) throw new Error('no-video-stream')
    const fps = Number(opts.gifFps) > 0 ? Number(opts.gifFps) : 15
    const width = Number(opts.gifWidth) > 0 ? Number(opts.gifWidth) : 480
    const vf = `fps=${fps},scale=${width}:-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`
    // -vf (one input, one output) keeps the mapped stream and the palette graph as a single output stream
    const args = [...base, '-i', inputFile, '-map', `0:${probe.video.index}`, '-an', '-sn', '-dn', '-vf', vf, ...(threads ? ['-threads', String(threads)] : []), ...progress]
    return { mode: 'gif', ext: 'gif', attempts: [{ label: 'gif', args, encoder: 'gif', hardware: null, copy: false }] }
  }

  const t = VIDEO_TARGETS[target]
  if (!t) throw new Error(`unsupported-target:${target}`)
  const v = probe.video
  if (!v) throw new Error('no-video-stream')

  const maxH = Number(opts.maxHeight) > 0 ? Number(opts.maxHeight) : 0
  const maxFps = Number(opts.maxFps) > 0 ? Number(opts.maxFps) : 0
  const needScale = maxH > 0 && v.height > maxH
  const needFps = maxFps > 0 && v.fps > maxFps + 0.5
  const wanted = opts.codec && opts.codec !== 'auto' ? opts.codec : null

  // -------- streams --------
  const maps = ['-map', `0:${v.index}`]
  const audioArgs = []
  probe.audio.forEach((a, i) => {
    maps.push('-map', `0:${a.index}`)
    const copyA = opts.copy !== 'never' && accepts(t.copyAudio, a.codec)
    audioArgs.push(...(copyA ? [`-c:a:${i}`, 'copy'] : audioEncoderArgs(t.audio, opts.audioBitrate).map((x, k) => (k === 0 ? `-c:a:${i}` : x))))
  })
  const subArgs = []
  let s = 0
  for (const sub of probe.subtitles) {
    if (t.subs === 'copy') { maps.push('-map', `0:${sub.index}`); subArgs.push(`-c:s:${s++}`, 'copy') }
    else if ((t.subs === 'mov_text' || t.subs === 'webvtt') && sub.text) { maps.push('-map', `0:${sub.index}`); subArgs.push(`-c:s:${s++}`, t.subs) }
  }
  if (t.subs === 'copy' && probe.attachments > 0) maps.push('-map', '0:t?', '-c:t', 'copy')
  const muxer = [...(t.faststart ? ['-movflags', '+faststart'] : []), '-map_metadata', '0', '-map_chapters', '0']

  // -------- video: copy? --------
  const canCopyVideo = opts.copy !== 'never' && !sameContainer && !needScale && !needFps
    && accepts(t.copyVideo, v.codec) && (!wanted || wanted === v.codec)
  if (canCopyVideo) {
    const tag = v.codec === 'hevc' && (target === 'mp4' || target === 'mov' || target === 'm4v') ? ['-tag:v', 'hvc1'] : []
    const args = [...base, '-i', inputFile, ...maps, '-c:v', 'copy', ...tag, ...audioArgs, ...subArgs, ...muxer, ...progress]
    // If muxing as-is fails (odd timestamps, unsupported profile), fall back to a real encode.
    const encodePlan = buildMediaPlan(inputFile, probe, { ...opts, copy: 'never' })
    return { mode: 'copy', ext: target, attempts: [{ label: 'copy', args, encoder: 'copy', hardware: null, copy: true }, ...encodePlan.attempts] }
  }

  // -------- video: encode --------
  let codec = wanted && t.video.includes(wanted) ? wanted : t.video[0]
  // WebM: AV1 on a GPU that encodes it is far faster than software VP9 and smaller at the same quality.
  if (target === 'webm' && !wanted) {
    const av1 = pickVideoEncoder('av1', { encoderPref: opts.encoderPref, available: opts.available })
    codec = av1.hardware ? 'av1' : 'vp9'
  }
  const hw = pickVideoEncoder(codec, { encoderPref: opts.encoderPref, available: opts.available })
  const sw = { encoder: SW_ENCODERS[codec] || codec, hardware: null }
  const tenBit = TEN_BIT_420.has(v.pixFmt)
  const keep10 = tenBit && (codec === 'hevc' || codec === 'av1')
  const tag = codec === 'hevc' && (target === 'mp4' || target === 'mov' || target === 'm4v') ? ['-tag:v', 'hvc1'] : []
  const fpsF = needFps ? [`fps=${maxFps}`] : []
  const scaleH = needScale ? maxH : 0

  const attempts = []
  const make = (label, enc, { gpuFrames = false, hwaccel = null } = {}) => {
    const filters = [...fpsF]
    let pix = []
    if (gpuFrames) {
      if (scaleH) filters.push(`scale_cuda=-2:${scaleH}`)
    } else {
      if (scaleH) filters.push(`scale=-2:${scaleH}:flags=lanczos`)
      pix = ['-pix_fmt', keep10 ? (enc.hardware ? 'p010le' : 'yuv420p10le') : (enc.hardware === 'qsv' ? 'nv12' : 'yuv420p')]
    }
    const pre = gpuFrames ? ['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda'] : hwaccel ? ['-hwaccel', hwaccel] : []
    const args = [...base, ...pre, '-i', inputFile, ...maps, ...(filters.length ? ['-vf', filters.join(',')] : []),
      ...encoderArgs(codec, enc.encoder, opts.quality, enc.hardware ? 0 : threads), ...pix, ...tag,
      ...audioArgs, ...subArgs, ...muxer, ...progress]
    attempts.push({ label, args, encoder: enc.encoder, hardware: enc.hardware, copy: false })
  }

  if (hw.hardware === 'nvenc') {
    const gpuOk = NVDEC_CODECS.has(v.codec) && (EIGHT_BIT_420.has(v.pixFmt) || (tenBit && keep10))
    if (gpuOk) make('gpu-full', hw, { gpuFrames: true })
    make('gpu-encode', hw, { hwaccel: NVDEC_CODECS.has(v.codec) ? 'cuda' : null })
  } else if (hw.hardware) {
    make('gpu-encode', hw, { hwaccel: 'd3d11va' })
  }
  if (opts.encoderPref !== 'gpu' || !hw.hardware) make('cpu', sw)
  return { mode: hw.hardware ? 'gpu' : 'cpu', ext: target, codec, attempts }
}

/** Parses one `-progress pipe:1` block; returns { outTimeSec, speed, fps, done } or null. */
export function parseProgressChunk(text) {
  const t = String(text || '')
  const us = [...t.matchAll(/out_time_(?:us|ms)=(\d+)/g)].pop()
  const sp = [...t.matchAll(/speed=\s*([\d.]+)x/g)].pop()
  const fp = [...t.matchAll(/(?:^|\n)fps=([\d.]+)/g)].pop()
  const done = /progress=end/.test(t)
  if (!us && !done) return null
  return { outTimeSec: us ? Number(us[1]) / 1e6 : null, speed: sp ? Number(sp[1]) : null, fps: fp ? Number(fp[1]) : null, done }
}

/** Threads for CPU encoders when the user keeps the PC responsive: leave a quarter of the logical cores free. */
export function responsiveThreads(cores) {
  const n = Math.max(1, Number(cores) || 1)
  return Math.max(2, Math.floor(n * 0.75))
}
