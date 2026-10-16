/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
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
  /** Chain link. The pitch rises with the chain length. */
  link: (n: number) => tone(330 * Math.pow(2, Math.min(n, 24) / 12), 0.06, 'triangle', 0.09),
  unlink: () => tone(260, 0.05, 'triangle', 0.06),
  hit: () => {
    tone(220, 0.1, 'sawtooth', 0.12, 0.5);
    noise(0.06, 0.12);
  },
  kill: (n: number) => [0, 1, 2].slice(0, Math.min(3, n)).forEach((k) => tone(520 + k * 140, 0.09, 'square', 0.07, 1.4, k * 0.05)),
  armor: () => tone(700, 0.1, 'square', 0.07, 0.8),
  coin: () => {
    tone(1200, 0.08, 'sine', 0.12, 1.5);
    tone(1600, 0.08, 'sine', 0.1, 1.2, 0.06);
  },
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  hurt: () => {
    tone(150, 0.25, 'sawtooth', 0.22, 0.4);
    noise(0.15, 0.2);
  },
  block: () => tone(400, 0.08, 'square', 0.08, 0.6),
  boom: () => {
    noise(0.4, 0.32);
    tone(80, 0.45, 'sawtooth', 0.22, 0.4);
  },
  drop: () => tone(180, 0.05, 'triangle', 0.05, 0.8),
  skill: () => [392, 587, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, 1.2, i * 0.04)),
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.15, 1, i * 0.07)),
  shop: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.12, 'sine', 0.13, 1, i * 0.06)),
  floor: () => [262, 330, 392].forEach((f, i) => tone(f, 0.2, 'triangle', 0.13, 1, i * 0.1)),
  boss: () => [110, 104, 98].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.16, 0.9, i * 0.22)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(600, 0.04, 'triangle', 0.06),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
