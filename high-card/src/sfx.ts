/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem('highcard.mute') === '1';
} catch {
  /* storage can be blocked */
}

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
  try {
    localStorage.setItem('highcard.mute', muted ? '1' : '0');
  } catch {
    /* ignore */
  }
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

function noise(dur: number, vol: number, hp = 1500): void {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  select: () => tone(660, 0.05, 'triangle', 0.08, 1.2),
  deselect: () => tone(520, 0.05, 'triangle', 0.06, 0.8),
  deal: () => noise(0.06, 0.12, 3000),
  play: () => {
    noise(0.1, 0.15, 2000);
    tone(330, 0.1, 'triangle', 0.1, 1.5);
  },
  /** Chip step. The pitch rises with each step in the count. */
  chips: (n: number) => tone(392 * Math.pow(2, Math.min(n, 24) / 12), 0.08, 'triangle', 0.12),
  mult: (n: number) => tone(523 * Math.pow(2, Math.min(n, 24) / 12), 0.09, 'square', 0.07),
  xmult: () => {
    tone(784, 0.12, 'square', 0.09, 1.5);
    tone(1175, 0.18, 'triangle', 0.1, 1, 0.06);
  },
  bad: () => tone(140, 0.15, 'sawtooth', 0.1, 0.7),
  total: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, 1, i * 0.05)),
  glass: () => {
    noise(0.25, 0.25, 4000);
    tone(2200, 0.2, 'sine', 0.06, 0.5);
  },
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  buy: () => [880, 1320].forEach((f, i) => tone(f, 0.09, 'sine', 0.13, 1, i * 0.06)),
  sell: () => [1320, 880].forEach((f, i) => tone(f, 0.09, 'sine', 0.12, 1, i * 0.06)),
  use: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.16, 'sine', 0.12, 1, i * 0.05)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  blind: () => [262, 330, 392].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, 1, i * 0.08)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
