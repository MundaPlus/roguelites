/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem('cursedfairway.mute') === '1';
} catch {
  muted = false;
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
    localStorage.setItem('cursedfairway.mute', muted ? '1' : '0');
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
  /** Club hit. Stronger shots sound lower and louder. */
  swing: (p: number) => {
    noise(0.05, 0.12 + p * 0.2);
    tone(900 - p * 400, 0.08, 'triangle', 0.15 + p * 0.1, 0.5);
  },
  bounce: (v: number) => tone(180 + Math.min(v, 600) * 0.4, 0.05, 'sine', Math.min(0.15, 0.03 + v / 4000)),
  sand: () => noise(0.12, 0.12),
  splash: () => {
    noise(0.4, 0.25);
    tone(400, 0.3, 'sine', 0.12, 0.3);
  },
  spike: () => {
    tone(1400, 0.06, 'square', 0.08, 0.6);
    tone(200, 0.15, 'sawtooth', 0.12, 0.5, 0.03);
  },
  idol: () => [523, 784, 1047, 1319].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, 1, i * 0.06)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  cup: () => {
    tone(330, 0.08, 'sine', 0.15);
    [659, 880, 1175].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 1, 0.12 + i * 0.08));
  },
  ace: () => {
    tone(600, 0.12, 'square', 0.08, 2);
    tone(1200, 0.18, 'sine', 0.1, 1, 0.06);
  },
  rocket: () => {
    noise(0.3, 0.2);
    tone(150, 0.3, 'sawtooth', 0.12, 3);
  },
  brake: () => tone(500, 0.25, 'square', 0.08, 0.3),
  click: () => tone(700, 0.03, 'triangle', 0.06),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.1)),
  buy: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  boss: () => [196, 185, 175].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1, 1, i * 0.15)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
