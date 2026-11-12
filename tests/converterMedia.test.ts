// @vitest-environment node
import { describe, it, expect } from 'vitest';
// @ts-ignore plain JS module
import { parseProbe, buildMediaPlan, parseProgressChunk, pickVideoEncoder, responsiveThreads, MEDIA_OUTPUTS } from '../electron/services/converter/mediaPlan.js';

// Real `ffmpeg -i` output (FFmpeg 6.1.1) for the promo video used in the benchmark.
const MP4_PROBE = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'src1080p60.mp4':
  Duration: 00:01:00.99, start: 0.000000, bitrate: 16290 kb/s
  Stream #0:0[0x1](und): Video: h264 (Main) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080, 15966 kb/s, SAR 1:1 DAR 16:9, 60 fps, 60 tbr, 15360 tbn (default)
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 320 kb/s (default)
  Stream #0:2[0x3](eng): Data: none (tmcd / 0x64636D74) (default)`;

const MKV_PROBE = `Input #0, matroska,webm, from 'movie.mkv':
  Duration: 01:42:10.50, start: 0.000000, bitrate: 6000 kb/s
  Stream #0:0: Video: hevc (Main 10), yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160 [SAR 1:1 DAR 16:9], 23.98 fps, 23.98 tbr, 1k tbn (default)
  Stream #0:1(por): Audio: eac3, 48000 Hz, 5.1(side), fltp, 640 kb/s (default)
  Stream #0:2(eng): Audio: flac, 48000 Hz, stereo, s32 (24 bit)
  Stream #0:3(por): Subtitle: subrip (default)
  Stream #0:4(eng): Subtitle: hdmv_pgs_subtitle, 1920x1080
  Stream #0:5: Attachment: ttf
    Metadata:
      filename        : font.ttf`;

const AUDIO_PROBE = `Input #0, mp3, from 'song.mp3':
  Duration: 00:03:21.12, start: 0.025057, bitrate: 320 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 320 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 500x500 [SAR 1:1 DAR 1:1], 90k tbr, 90k tbn (attached pic)`;

const NV = ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc'];
const argAfter = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('ffmpeg probe parsing', () => {
  it('reads duration, the main video stream, audio, subtitles and attachments', () => {
    const p = parseProbe(MKV_PROBE);
    expect(p.durationSec).toBeCloseTo(6130.5, 1);
    expect(p.video).toMatchObject({ index: 0, codec: 'hevc', pixFmt: 'yuv420p10le', width: 3840, height: 2160, fps: 23.98 });
    expect(p.audio.map((a: any) => a.codec)).toEqual(['eac3', 'flac']);
    expect(p.subtitles).toEqual([
      { index: 3, codec: 'subrip', lang: 'por', text: true },
      { index: 4, codec: 'hdmv_pgs_subtitle', lang: 'eng', text: false }
    ]);
    expect(p.attachments).toBe(1);
  });

  it('skips cover art as the main video stream', () => {
    const p = parseProbe(AUDIO_PROBE);
    expect(p.video).toBeNull();
    expect(p.videos[0].attachedPic).toBe(true);
    expect(p.audio[0]).toMatchObject({ index: 0, codec: 'mp3' });
  });

  it('parses -progress blocks', () => {
    expect(parseProgressChunk('frame=120\nfps=240.5\nout_time_us=2000000\nspeed=4.01x\nprogress=continue\n')).toEqual({ outTimeSec: 2, speed: 4.01, fps: 240.5, done: false });
    expect(parseProgressChunk('progress=end\n')?.done).toBe(true);
    expect(parseProgressChunk('nothing here')).toBeNull();
  });
});

describe('media plan', () => {
  const mp4 = parseProbe(MP4_PROBE);
  const mkv = parseProbe(MKV_PROBE);

  it('container change with a compatible codec copies the video instead of re-encoding', () => {
    const plan = buildMediaPlan('in.mkv', { ...mkv, audio: [mkv.audio[0]] }, { target: 'mp4', sourceExt: 'mkv', available: NV });
    expect(plan.mode).toBe('copy');
    const a = plan.attempts[0].args;
    expect(argAfter(a, '-c:v')).toBe('copy');
    expect(argAfter(a, '-tag:v')).toBe('hvc1');
    expect(argAfter(a, '-c:a:0')).toBe('copy'); // E-AC-3 fits MP4
    expect(a).toContain('mov_text'); // text subtitle converted, PGS dropped
    expect(a.join(' ')).not.toContain('0:4');
    // if copying fails, real encodes follow (10-bit -> H.264 decodes on the GPU but converts on the CPU side)
    expect(plan.attempts.slice(1).map((x: any) => x.label)).toEqual(['gpu-encode', 'cpu']);
  });

  it('same container re-encodes on the GPU end to end, CPU last', () => {
    const plan = buildMediaPlan('in.mp4', mp4, { target: 'mp4', sourceExt: 'mp4', available: NV, threads: 12 });
    expect(plan.mode).toBe('gpu');
    expect(plan.attempts.map((x: any) => x.label)).toEqual(['gpu-full', 'gpu-encode', 'cpu']);
    const full = plan.attempts[0].args;
    expect(full.slice(full.indexOf('-hwaccel'), full.indexOf('-hwaccel') + 4)).toEqual(['-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda']);
    expect(argAfter(full, '-c:v')).toBe('h264_nvenc');
    expect(argAfter(full, '-cq')).toBe('30');
    expect(full).not.toContain('-pix_fmt');
    const cpu = plan.attempts[2].args;
    expect(argAfter(cpu, '-c:v')).toBe('libx264');
    expect(argAfter(cpu, '-threads')).toBe('12');
    expect(argAfter(cpu, '-movflags')).toBe('+faststart');
  });

  it('without a working GPU encoder it plans CPU only; "gpu only" drops the CPU fallback', () => {
    const cpu = buildMediaPlan('in.mp4', mp4, { target: 'mp4', sourceExt: 'mp4', available: [] });
    expect(cpu.attempts.map((x: any) => x.label)).toEqual(['cpu']);
    const gpu = buildMediaPlan('in.mp4', mp4, { target: 'mp4', sourceExt: 'mp4', available: NV, encoderPref: 'gpu' });
    expect(gpu.attempts.map((x: any) => x.label)).toEqual(['gpu-full', 'gpu-encode']);
    expect(pickVideoEncoder('hevc', { encoderPref: 'cpu', available: NV })).toEqual({ encoder: 'libx265', hardware: null });
    expect(pickVideoEncoder('h264', { available: ['h264_amf'] })).toEqual({ encoder: 'h264_amf', hardware: 'amf' });
  });

  it('downscaling keeps frames on the GPU with scale_cuda and blocks stream copy', () => {
    const plan = buildMediaPlan('in.mkv', mp4, { target: 'mkv', sourceExt: 'mp4', available: NV, maxHeight: 720, maxFps: 30 });
    expect(plan.mode).toBe('gpu');
    expect(argAfter(plan.attempts[0].args, '-vf')).toBe('fps=30,scale_cuda=-2:720');
    expect(argAfter(plan.attempts[1].args, '-vf')).toBe('fps=30,scale=-2:720:flags=lanczos');
  });

  it('10-bit HDR to H.264 skips the all-GPU path; to HEVC it stays 10-bit', () => {
    const h264 = buildMediaPlan('in.mkv', mkv, { target: 'mp4', sourceExt: 'mkv', available: NV, copy: 'never' });
    expect(h264.attempts[0].label).toBe('gpu-encode');
    expect(argAfter(h264.attempts[0].args, '-pix_fmt')).toBe('yuv420p');
    const hevc = buildMediaPlan('in.mkv', mkv, { target: 'mp4', sourceExt: 'mkv', available: NV, copy: 'never', codec: 'hevc' });
    expect(hevc.attempts[0].label).toBe('gpu-full');
    expect(argAfter(hevc.attempts[1].args, '-pix_fmt')).toBe('p010le');
  });

  it('WebM uses AV1 on a GPU that encodes it, VP9 on the CPU otherwise', () => {
    const gpu = buildMediaPlan('in.mp4', mp4, { target: 'webm', sourceExt: 'mp4', available: NV });
    expect(argAfter(gpu.attempts[0].args, '-c:v')).toBe('av1_nvenc');
    expect(argAfter(gpu.attempts[0].args, '-c:a:0')).toBe('libopus'); // AAC does not fit WebM
    const cpu = buildMediaPlan('in.mp4', mp4, { target: 'webm', sourceExt: 'mp4', available: [] });
    const a = cpu.attempts[0].args;
    expect(argAfter(a, '-c:v')).toBe('libvpx-vp9');
    expect(argAfter(a, '-row-mt')).toBe('1');
    expect(argAfter(a, '-cpu-used')).toBe('4');
  });

  it('MKV keeps every audio track, subtitles and attachments as they are', () => {
    const plan = buildMediaPlan('in.mkv', mkv, { target: 'mkv', sourceExt: 'mkv', available: NV });
    const a = plan.attempts[0].args.join(' ');
    expect(a).toContain('-map 0:1 -map 0:2');
    expect(a).toContain('-c:a:0 copy -c:a:1 copy');
    expect(a).toContain('-c:s:0 copy -c:s:1 copy');
    expect(a).toContain('-map 0:t? -c:t copy');
  });

  it('audio targets copy the stream when the codec already fits and the container changes', () => {
    const p = parseProbe(AUDIO_PROBE);
    expect(buildMediaPlan('a.mp3', p, { target: 'mp3', sourceExt: 'mp3' }).mode).toBe('audio');
    const toMka = buildMediaPlan('a.m4a', { ...p, audio: [{ index: 0, codec: 'aac' }] }, { target: 'm4a', sourceExt: 'mp4' });
    expect(toMka.mode).toBe('copy');
    const flac = buildMediaPlan('a.mp3', p, { target: 'flac', sourceExt: 'mp3' }).attempts[0].args;
    expect(argAfter(flac, '-c:a')).toBe('flac');
    expect(flac).toContain('-vn');
    expect(buildMediaPlan('a.mp3', p, { target: 'aac', sourceExt: 'mp3' }).attempts[0].args).toContain('adts');
    expect(buildMediaPlan('a.mp3', p, { target: 'alac', sourceExt: 'mp3' }).ext).toBe('m4a');
  });

  it('GIF uses a two-pass palette at the chosen size and rate', () => {
    const a = buildMediaPlan('in.mp4', mp4, { target: 'gif', sourceExt: 'mp4', gifFps: 20, gifWidth: 640 }).attempts[0].args;
    expect(a).not.toContain('-filter_complex');
    expect(argAfter(a, '-vf')).toMatch(/^fps=20,scale=640:-2:flags=lanczos,split.*palettegen.*paletteuse/);
  });

  it('rejects unknown targets and leaves headroom on the CPU', () => {
    expect(() => buildMediaPlan('in.mp4', mp4, { target: 'exe' })).toThrow();
    expect(MEDIA_OUTPUTS).toEqual(expect.arrayContaining(['mp4', 'mkv', 'webm', 'gif', 'mp3', 'flac', 'alac']));
    expect(responsiveThreads(16)).toBe(12);
    expect(responsiveThreads(2)).toBe(2);
  });
});
