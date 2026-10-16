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
  /** Reel tick while the reels spin. */
  tick: () => tone(700 + Math.random() * 200, 0.03, 'square', 0.04),
  /** One reel stops. */
  stop: (col: number) => {
    tone(180 + col * 30, 0.08, 'triangle', 0.16, 0.6);
    noise(0.04, 0.08);
  },
  /** A cell pays. The pitch rises with each payout in the spin. */
  pay: (n: number) => tone(520 * Math.pow(2, Math.min(n, 24) / 12), 0.07, 'sine', 0.1, 1.3),
  big: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, 'triangle', 0.14, 1, i * 0.05)),
  destroy: () => {
    noise(0.18, 0.22);
    tone(140, 0.18, 'sawtooth', 0.12, 0.5);
  },
  transform: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.1, 'sine', 0.1, 1, i * 0.04)),
  add: () => tone(500, 0.1, 'triangle', 0.12, 1.8),
  pick: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.15, 1, i * 0.06)),
  item: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, 1, i * 0.08)),
  rent: () => {
    noise(0.1, 0.12);
    [1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, 'square', 0.07, 1, i * 0.07));
  },
  remove: () => tone(300, 0.2, 'sawtooth', 0.12, 0.4),
  reroll: () => [400, 500, 600, 800].forEach((f, i) => tone(f, 0.05, 'square', 0.06, 1, i * 0.03)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
