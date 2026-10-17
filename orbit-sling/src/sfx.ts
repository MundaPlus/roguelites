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

export function setMuted(m: boolean): void {
  muted = m;
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

function noise(dur: number, vol: number, delay = 0): void {
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
  src.start(ctx.currentTime + delay);
}

export const sfx = {
  launch: (power: number) => {
    tone(180 + power * 220, 0.25, 'sawtooth', 0.08, 2.5);
    noise(0.12, 0.08);
  },
  aim: () => tone(900, 0.03, 'sine', 0.03),
  hit: (n: number) => tone(660 * Math.pow(2, Math.min(n, 12) / 12), 0.12, 'triangle', 0.16, 1.4),
  kill: () => {
    noise(0.3, 0.22);
    tone(330, 0.3, 'square', 0.08, 0.5);
  },
  crash: () => {
    noise(0.25, 0.18);
    tone(120, 0.25, 'sawtooth', 0.12, 0.5);
  },
  swallow: () => tone(220, 0.7, 'sine', 0.2, 0.15),
  lost: () => tone(300, 0.25, 'sine', 0.06, 0.6),
  phase: () => tone(500, 0.25, 'sine', 0.1, 1.8),
  split: () => [700, 900, 1100].forEach((f, i) => tone(f, 0.08, 'triangle', 0.08, 1, i * 0.03)),
  breakit: () => {
    noise(0.18, 0.2);
    tone(200, 0.12, 'square', 0.08, 0.6);
  },
  bank: () => [784, 1047].forEach((f, i) => tone(f, 0.15, 'sine', 0.14, 1, i * 0.07)),
  orbit: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, 1, i * 0.06)),
  caught: () => [880, 1320].forEach((f, i) => tone(f, 0.12, 'sine', 0.14, 1, i * 0.05)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(520, 0.05, 'triangle', 0.06),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 1, i * 0.09)),
  fail: () => [392, 311, 233].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1, 1, i * 0.15)),
  warp: () => {
    tone(120, 0.6, 'sawtooth', 0.08, 6);
    noise(0.4, 0.06, 0.1);
  },
  win: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.16, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
