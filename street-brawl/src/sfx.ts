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

function noise(dur: number, vol: number, freq = 0, delay = 0): void {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  if (freq) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    src.connect(f).connect(g).connect(master);
  } else src.connect(g).connect(master);
  src.start(now);
}

export const sfx: Record<string, () => void> = {
  swing: () => noise(0.07, 0.08, 1800),
  swingH: () => noise(0.12, 0.12, 900),
  hitL: () => {
    noise(0.06, 0.28, 1200);
    tone(160, 0.07, 'square', 0.1, 0.5);
  },
  hitH: () => {
    noise(0.12, 0.4, 600);
    tone(110, 0.16, 'sawtooth', 0.18, 0.4);
  },
  hurt: () => {
    noise(0.1, 0.3, 500);
    tone(220, 0.18, 'sawtooth', 0.15, 0.5);
  },
  ko: () => {
    noise(0.2, 0.35, 300);
    tone(90, 0.3, 'square', 0.16, 0.5);
  },
  bossko: () => {
    noise(0.5, 0.45, 200);
    [196, 147, 98].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.18, 0.6, i * 0.12));
  },
  grab: () => tone(260, 0.08, 'triangle', 0.15, 1.3),
  throw: () => noise(0.18, 0.15, 700),
  thud: () => {
    noise(0.16, 0.4, 150);
    tone(70, 0.2, 'sine', 0.3, 0.6);
  },
  fall: () => noise(0.1, 0.15, 200),
  break: () => {
    noise(0.15, 0.3, 400);
    tone(140, 0.08, 'square', 0.08, 0.6);
  },
  glass: () => {
    noise(0.2, 0.25, 4000);
    [2200, 3100, 2600].forEach((f, i) => tone(f, 0.08, 'triangle', 0.06, 1, i * 0.03));
  },
  pickup: () => tone(520, 0.1, 'triangle', 0.15, 1.5),
  coin: () => {
    tone(988, 0.06, 'square', 0.08);
    tone(1319, 0.12, 'square', 0.08, 1, 0.06);
  },
  food: () => [523, 659, 784].forEach((f, i) => tone(f, 0.1, 'sine', 0.14, 1, i * 0.05)),
  jump: () => tone(300, 0.1, 'triangle', 0.08, 1.6),
  land: () => noise(0.05, 0.08, 250),
  special: () => {
    tone(330, 0.2, 'sawtooth', 0.12, 2);
    noise(0.25, 0.15, 1500);
  },
  slam: () => {
    noise(0.35, 0.45, 120);
    tone(60, 0.35, 'sine', 0.35, 0.5);
  },
  toss: () => tone(400, 0.12, 'triangle', 0.08, 0.6),
  shot: () => {
    noise(0.12, 0.4, 2500);
    tone(180, 0.1, 'square', 0.12, 0.3);
  },
  summon: () => [392, 392, 523].forEach((f, i) => tone(f, 0.12, 'square', 0.08, 1, i * 0.1)),
  boss: () => [110, 104, 98, 92].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.14, 1, i * 0.18)),
  lock: () => tone(196, 0.15, 'square', 0.07),
  go: () => [523, 784].forEach((f, i) => tone(f, 0.12, 'square', 0.08, 1, i * 0.1)),
  combo: () => [659, 880, 1175].forEach((f, i) => tone(f, 0.1, 'square', 0.08, 1, i * 0.06)),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, 1, i * 0.09)),
  revive: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.16, 1, i * 0.07)),
  dead: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
  buy: () => [784, 1047].forEach((f, i) => tone(f, 0.1, 'square', 0.08, 1, i * 0.06)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(600, 0.04, 'triangle', 0.06),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
