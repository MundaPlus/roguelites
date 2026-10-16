/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const lastAt: Record<string, number> = {};

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

/** Skip a sound that already played in the last `ms` milliseconds. */
function throttle(key: string, ms: number): boolean {
  const now = performance.now();
  if (now - (lastAt[key] ?? -1e9) < ms) return true;
  lastAt[key] = now;
  return false;
}

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
  click: () => tone(660, 0.05, 'triangle', 0.08),
  select: () => tone(520, 0.06, 'triangle', 0.1, 1.3),
  deploy: () => {
    tone(300, 0.1, 'triangle', 0.15, 1.8);
    tone(600, 0.08, 'sine', 0.08, 1, 0.05);
  },
  enemyDeploy: () => {
    if (!throttle('ed', 200)) tone(220, 0.1, 'square', 0.05, 0.8);
  },
  spell: () => {
    noise(0.3, 0.25);
    tone(140, 0.35, 'sawtooth', 0.15, 0.5);
  },
  freeze: () => [1400, 1800, 2200].forEach((f, i) => tone(f, 0.15, 'sine', 0.06, 1, i * 0.04)),
  heal: () => {
    tone(523, 0.12, 'sine', 0.12);
    tone(784, 0.18, 'sine', 0.12, 1, 0.08);
  },
  shoot: () => {
    if (!throttle('sh', 90)) tone(900, 0.04, 'triangle', 0.03, 0.6);
  },
  hitTower: () => {
    if (!throttle('ht', 140)) tone(110, 0.08, 'square', 0.07, 0.7);
  },
  death: () => {
    if (!throttle('d', 70)) tone(260, 0.1, 'sawtooth', 0.05, 0.5);
  },
  tower: () => {
    noise(0.6, 0.35);
    tone(80, 0.6, 'sawtooth', 0.25, 0.4);
  },
  breach: () => {
    tone(150, 0.25, 'sawtooth', 0.2, 0.4);
    noise(0.15, 0.2);
  },
  boss: () => [196, 233, 196].forEach((f, i) => tone(f, 0.2, 'square', 0.1, 1, i * 0.12)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, 1, i * 0.1)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  double: () => [440, 660, 880].forEach((f, i) => tone(f, 0.12, 'square', 0.08, 1, i * 0.07)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
