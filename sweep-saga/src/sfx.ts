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

export function setMuted(v: boolean): void {
  muted = v;
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
  /** Opening tiles. Bigger floods ring a higher chord. */
  open: (n: number) => {
    tone(520 + Math.min(n, 30) * 12, 0.06, 'triangle', 0.07);
    if (n > 4) tone(780 + Math.min(n, 30) * 10, 0.12, 'sine', 0.06, 1, 0.04);
  },
  hit: (dmg: number) => {
    tone(Math.max(60, 220 - dmg * 12), 0.18, 'sawtooth', 0.16, 0.5);
    noise(0.1 + Math.min(dmg, 10) * 0.01, 0.18);
  },
  kill: () => tone(330, 0.1, 'square', 0.07, 0.6, 0.05),
  xp: () => tone(990, 0.06, 'sine', 0.05, 1.3),
  level: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, 1, i * 0.06)),
  coin: () => {
    tone(1200, 0.08, 'sine', 0.12, 1.5);
    tone(1600, 0.1, 'sine', 0.1, 1.2, 0.07);
  },
  key: () => [1320, 1760].forEach((f, i) => tone(f, 0.08, 'triangle', 0.1, 1, i * 0.06)),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, 1, i * 0.06)),
  heal: () => {
    tone(523, 0.12, 'sine', 0.13);
    tone(784, 0.18, 'sine', 0.13, 1, 0.08);
  },
  scout: () => [880, 1175, 1568, 2093].forEach((f, i) => tone(f, 0.12, 'sine', 0.06, 1, i * 0.04)),
  bomb: () => {
    noise(0.4, 0.32);
    tone(90, 0.4, 'sawtooth', 0.2, 0.4);
  },
  chest: () => [440, 554, 659, 880].forEach((f, i) => tone(f, 0.1, 'square', 0.06, 1, i * 0.05)),
  boss: () => {
    tone(70, 0.6, 'sawtooth', 0.2, 0.6);
    noise(0.3, 0.2, 0.05);
  },
  stairs: () => [262, 330, 392, 523].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, 1, i * 0.1)),
  mark: () => tone(700, 0.04, 'sine', 0.06),
  select: () => tone(660, 0.05, 'sine', 0.08),
  buy: () => tone(900, 0.08, 'sine', 0.12, 1.4),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
