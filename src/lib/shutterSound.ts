// Camera shutter sound for screenshots, synthesized with Web Audio (no audio file shipped): a short filtered noise
// burst for the curtain plus a low click for the mirror. ~120 ms.
let ctx: AudioContext | null = null;

export function playShutter(volume = 0.35) {
  try {
    ctx ||= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = volume;
    out.connect(ctx.destination);

    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = i < len * 0.35 ? Math.exp(-i / (len * 0.06)) : 0.55 * Math.exp(-(i - len * 0.35) / (len * 0.08));
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 3200;
    band.Q.value = 0.8;
    noise.connect(band).connect(out);
    noise.start(t);

    const click = ctx.createOscillator();
    const cg = ctx.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(180, t);
    click.frequency.exponentialRampToValueAtTime(60, t + 0.03);
    cg.gain.setValueAtTime(0.4, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    click.connect(cg).connect(out);
    click.start(t);
    click.stop(t + 0.04);
  } catch { /* no audio device */ }
}
