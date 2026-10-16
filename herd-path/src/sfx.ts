/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let lastDig = 0;

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
  /** A little "baa" when a critter drops out of the hatch. */
  spawn: () => {
    tone(520, 0.09, 'triangle', 0.06, 0.8);
    tone(470, 0.12, 'triangle', 0.05, 0.9, 0.07);
  },
  save: () => {
    tone(880, 0.08, 'sine', 0.1);
    tone(1320, 0.12, 'sine', 0.1, 1, 0.06);
  },
  splat: () => {
    tone(180, 0.18, 'sawtooth', 0.12, 0.4);
    noise(0.08, 0.12);
  },
  drown: () => tone(600, 0.3, 'sine', 0.1, 0.3),
  burn: () => {
    noise(0.25, 0.14);
    tone(300, 0.2, 'sawtooth', 0.06, 0.5);
  },
  boom: () => {
    noise(0.4, 0.3);
    tone(80, 0.45, 'sawtooth', 0.2, 0.4);
  },
  dig: () => {
    const t = ctx?.currentTime ?? 0;
    if (t - lastDig < 0.09) return;
    lastDig = t;
    noise(0.03, 0.05);
  },
  brick: () => tone(700, 0.04, 'square', 0.04),
  assign: () => tone(990, 0.06, 'square', 0.06, 1.3),
  select: () => tone(660, 0.05, 'triangle', 0.08),
  deny: () => tone(140, 0.14, 'square', 0.08),
  snap: () => {
    tone(1200, 0.05, 'square', 0.1, 0.3);
    noise(0.06, 0.15);
  },
  wolf: () => tone(220, 0.35, 'sawtooth', 0.1, 1.6),
  click: () => [523, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, 1, i * 0.07)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
