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

function noise(dur: number, vol: number, delay = 0, lowpass = 0): void {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  if (lowpass > 0) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    src.connect(f).connect(g).connect(master);
  } else src.connect(g).connect(master);
  src.start(ctx.currentTime + delay);
}

let lastLand = 0;

export const sfx = {
  move: () => tone(520, 0.03, 'square', 0.03),
  rotate: () => tone(700, 0.05, 'triangle', 0.07, 1.3),
  slam: () => tone(300, 0.12, 'sawtooth', 0.06, 0.5),
  land: (speed: number) => {
    if (!ctx) return;
    const now = ctx.currentTime;
    if (now - lastLand < 0.05) return;
    lastLand = now;
    const v = Math.min(1, speed / 6);
    tone(110 + 40 * v, 0.12, 'triangle', 0.12 + 0.12 * v, 0.6);
    noise(0.06, 0.06 + 0.1 * v, 0, 900);
  },
  lost: () => {
    tone(600, 0.6, 'sine', 0.14, 0.25);
    tone(150, 0.3, 'sawtooth', 0.12, 0.5, 0.45);
  },
  zap: () => {
    tone(1400, 0.2, 'sawtooth', 0.08, 0.3);
    noise(0.15, 0.1);
  },
  spell: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, 1, i * 0.05)),
  glue: () => tone(240, 0.18, 'sine', 0.16, 0.6),
  pin: () => {
    tone(90, 0.25, 'square', 0.12, 0.7);
    tone(1800, 0.08, 'triangle', 0.06, 1, 0.02);
  },
  warn: () => [440, 440].forEach((f, i) => tone(f, 0.1, 'square', 0.07, 1, i * 0.16)),
  curse: () => {
    tone(80, 0.6, 'sawtooth', 0.14, 0.6);
    noise(0.5, 0.12, 0, 600);
  },
  storm: () => noise(1.2, 0.18, 0, 500),
  goal: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, 1, i * 0.08)),
  tick: () => tone(1000, 0.03, 'sine', 0.06),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  buy: () => [784, 1047].forEach((f, i) => tone(f, 0.1, 'triangle', 0.12, 1, i * 0.06)),
  heal: () => [523, 784].forEach((f, i) => tone(f, 0.16, 'sine', 0.14, 1, i * 0.08)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(880, 0.03, 'triangle', 0.05),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
