/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let last: Record<string, number> = {};

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
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

const SOUNDS: Record<string, () => void> = {
  jump: () => tone(300, 0.12, 'square', 0.06, 1.8),
  climb: () => tone(500, 0.03, 'triangle', 0.04),
  grab: () => tone(220, 0.05, 'triangle', 0.08),
  land: () => noise(0.05, 0.08),
  hurt: () => {
    tone(160, 0.25, 'sawtooth', 0.2, 0.4);
    noise(0.12, 0.15);
  },
  die: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, 1, i * 0.15)),
  item: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, 1, i * 0.07)),
  whip: () => {
    noise(0.06, 0.12);
    tone(900, 0.06, 'sawtooth', 0.04, 0.3);
  },
  shotgun: () => {
    noise(0.25, 0.35);
    tone(120, 0.2, 'square', 0.15, 0.4);
  },
  throw: () => tone(400, 0.1, 'triangle', 0.08, 0.6),
  deny: () => tone(120, 0.15, 'square', 0.1),
  rope: () => [300, 400, 500, 600].forEach((f, i) => tone(f, 0.05, 'triangle', 0.08, 1, i * 0.03)),
  buy: () => [880, 1320].forEach((f, i) => tone(f, 0.12, 'sine', 0.14, 1, i * 0.08)),
  hit: () => tone(240, 0.08, 'square', 0.1, 0.5),
  kill: () => {
    tone(330, 0.15, 'square', 0.1, 0.4);
    noise(0.08, 0.1);
  },
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  crate: () => {
    noise(0.12, 0.2);
    tone(180, 0.1, 'square', 0.08, 0.6);
  },
  pot: () => {
    noise(0.1, 0.18);
    tone(700, 0.08, 'triangle', 0.08, 0.5);
  },
  bomb: () => {
    noise(0.5, 0.45);
    tone(80, 0.5, 'sawtooth', 0.25, 0.3);
  },
  coin: () => tone(1200, 0.08, 'sine', 0.1, 1.5),
  gem: () => {
    tone(1400, 0.08, 'sine', 0.12, 1.3);
    tone(2100, 0.12, 'sine', 0.1, 1, 0.06);
  },
  pet: () => [660, 880].forEach((f, i) => tone(f, 0.1, 'sine', 0.12, 1.2, i * 0.08)),
  exit: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, 1, i * 0.06)),
  stomp: () => tone(200, 0.1, 'square', 0.12, 2),
  grunt: () => tone(110, 0.2, 'sawtooth', 0.12, 0.7),
  roar: () => {
    tone(70, 0.6, 'sawtooth', 0.2, 0.6);
    noise(0.4, 0.1);
  },
  slam: () => {
    noise(0.4, 0.35);
    tone(55, 0.4, 'sine', 0.3, 0.5);
  },
  rumble: () => noise(0.3, 0.12),
  arrow: () => tone(1200, 0.12, 'sawtooth', 0.06, 0.3),
  shatter: () => {
    noise(0.1, 0.12);
    tone(2400, 0.1, 'triangle', 0.06, 0.5);
  },
  thud: () => {
    noise(0.15, 0.25);
    tone(70, 0.2, 'sine', 0.2, 0.6);
  },
  ghost: () => [440, 415, 392, 370].forEach((f, i) => tone(f, 0.5, 'sine', 0.08, 0.98, i * 0.25)),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.16, 1, i * 0.13)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
  click: () => tone(600, 0.04, 'triangle', 0.06),
};

/** Plays a named sound. The same sound plays at most once every 40 ms. */
export function play(name: string): void {
  if (!ctx || muted) return;
  const now = performance.now();
  if (now - (last[name] ?? 0) < 40) return;
  last[name] = now;
  SOUNDS[name]?.();
}

export function resetSfx(): void {
  last = {};
}
