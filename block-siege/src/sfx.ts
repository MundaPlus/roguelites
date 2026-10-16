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

const SCALE = [523, 587, 659, 784, 880, 1047];

export const sfx = {
  move: () => tone(330, 0.03, 'square', 0.03),
  rotate: () => tone(520, 0.04, 'triangle', 0.06, 1.2),
  lock: () => tone(140, 0.06, 'square', 0.07, 0.7),
  hard: () => {
    tone(110, 0.1, 'square', 0.1, 0.5);
    noise(0.05, 0.08);
  },
  hold: () => tone(440, 0.08, 'sine', 0.1, 0.75),
  /** Line clear. More lines give a longer chord. */
  clear: (lines: number, combo: number) => {
    const base = Math.max(0, Math.min(combo, 6));
    for (let i = 0; i < Math.min(lines, 5); i++) tone(SCALE[(base + i) % SCALE.length] * (i >= 3 ? 1.5 : 1), 0.18, 'triangle', 0.13, 1, i * 0.05);
    if (lines >= 4) tone(1568, 0.35, 'sine', 0.12, 1, 0.22);
  },
  strike: () => {
    tone(260, 0.15, 'sawtooth', 0.12, 2.2);
    noise(0.1, 0.12, 0.08);
  },
  shield: () => tone(900, 0.1, 'square', 0.06, 0.8),
  garbage: () => {
    tone(90, 0.3, 'sawtooth', 0.18, 0.6);
    noise(0.2, 0.15);
  },
  hurt: () => {
    tone(160, 0.25, 'sawtooth', 0.2, 0.4);
    noise(0.15, 0.18);
  },
  topout: () => {
    [330, 262, 196, 131].forEach((f, i) => tone(f, 0.2, 'square', 0.14, 0.8, i * 0.08));
    noise(0.4, 0.2, 0.1);
  },
  speed: () => [400, 600, 800].forEach((f, i) => tone(f, 0.08, 'square', 0.06, 1.3, i * 0.04)),
  lockCells: () => [700, 500].forEach((f, i) => tone(f, 0.1, 'square', 0.08, 1, i * 0.08)),
  blind: () => tone(200, 0.5, 'sine', 0.1, 0.5),
  enemyBuff: () => tone(300, 0.25, 'triangle', 0.1, 1.6),
  heal: () => {
    tone(523, 0.12, 'sine', 0.13);
    tone(784, 0.18, 'sine', 0.13, 1, 0.08);
  },
  burn: () => noise(0.06, 0.05),
  fire: () => {
    noise(0.25, 0.14);
    tone(200, 0.2, 'sawtooth', 0.08, 2);
  },
  ice: () => [1400, 1800, 2200].forEach((f, i) => tone(f, 0.12, 'sine', 0.07, 1, i * 0.04)),
  bomb: () => {
    noise(0.4, 0.3);
    tone(80, 0.45, 'sawtooth', 0.2, 0.4);
  },
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  unlock: () => tone(1000, 0.1, 'triangle', 0.08, 0.6),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, 1, i * 0.1)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(600, 0.04, 'triangle', 0.06),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
