/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let lastClick = 0;

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

export function setMuted(v: boolean): void {
  muted = v;
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
  /** Coin click. Throttled so fast tapping does not get too loud. */
  click: () => {
    const t = performance.now();
    if (t - lastClick < 45) return;
    lastClick = t;
    tone(900 + Math.random() * 300, 0.06, 'sine', 0.1, 1.4);
  },
  crit: () => {
    tone(1200, 0.1, 'square', 0.08);
    tone(1800, 0.14, 'triangle', 0.1, 1, 0.05);
  },
  buy: () => tone(520, 0.07, 'triangle', 0.1, 1.5),
  set: () => [660, 880].forEach((f, i) => tone(f, 0.1, 'triangle', 0.12, 1, i * 0.06)),
  upgrade: () => [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, 1, i * 0.07)),
  node: () => [392, 523, 784].forEach((f, i) => tone(f, 0.18, 'sine', 0.15, 1, i * 0.08)),
  deny: () => tone(120, 0.15, 'square', 0.08),
  pick: () => tone(660, 0.12, 'sine', 0.14, 1.3),
  prestige: () => {
    noise(0.4, 0.15);
    [262, 392, 523, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.15, 1, i * 0.09));
  },
  region: () => {
    tone(110, 0.3, 'sawtooth', 0.12, 0.6);
    [440, 554, 659].forEach((f, i) => tone(f, 0.2, 'square', 0.07, 1, 0.1 + i * 0.08));
  },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.4, 'triangle', 0.18, 1, i * 0.14)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
