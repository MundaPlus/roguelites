/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

export const isMuted = (): boolean => muted;

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 1, delay = 0): void {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(master);
  o.start(now);
  o.stop(now + dur + 0.02);
}

function noise(dur: number, vol: number): void {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start();
}

export const sfx = {
  cast: () => {
    tone(600, 0.18, 'sine', 0.1, 0.5);
    noise(0.12, 0.05);
  },
  splash: () => noise(0.25, 0.14),
  bite: () => [880, 1175].forEach((f, i) => tone(f, 0.09, 'square', 0.08, 1, i * 0.07)),
  reel: (t: number) => tone(180 + t * 500, 0.03, 'triangle', 0.025),
  strain: () => tone(1400, 0.05, 'sawtooth', 0.04, 0.9),
  catch: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, 1, i * 0.07)),
  rare: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'sine', 0.15, 1, i * 0.08)),
  snap: () => {
    tone(1600, 0.08, 'square', 0.12, 0.3);
    noise(0.1, 0.1);
  },
  lost: () => tone(300, 0.3, 'triangle', 0.1, 0.5),
  bump: () => {
    tone(90, 0.2, 'sawtooth', 0.18, 0.6);
    noise(0.15, 0.2);
  },
  thud: () => tone(140, 0.08, 'triangle', 0.08, 0.7),
  shade: () => {
    tone(70, 0.6, 'sawtooth', 0.18, 0.5);
    noise(0.4, 0.15);
  },
  banish: () => tone(900, 0.25, 'sine', 0.08, 0.4),
  whisper: () => {
    noise(0.6, 0.04);
    tone(220, 0.8, 'sine', 0.04, 0.95);
  },
  bell: () => tone(330, 1.2, 'sine', 0.12, 1),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  place: () => tone(330, 0.06, 'triangle', 0.08),
  rotate: () => tone(520, 0.04, 'triangle', 0.05),
  deny: () => tone(120, 0.15, 'square', 0.1),
  horn: () => {
    tone(147, 0.7, 'sawtooth', 0.1);
    tone(220, 0.7, 'sawtooth', 0.06);
  },
  dawn: () => [392, 494, 587, 784].forEach((f, i) => tone(f, 0.3, 'sine', 0.1, 1, i * 0.15)),
  night: () => [294, 277, 262].forEach((f, i) => tone(f, 0.5, 'sine', 0.08, 1, i * 0.3)),
  buy: () => [659, 988].forEach((f, i) => tone(f, 0.12, 'triangle', 0.13, 1, i * 0.06)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
