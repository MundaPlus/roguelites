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
  /** Card clear. The pitch rises with the streak. */
  clear: (n: number) => tone(392 * Math.pow(2, Math.min(n, 18) / 12), 0.09, 'triangle', 0.13),
  draw: () => {
    noise(0.06, 0.08);
    tone(260, 0.06, 'sine', 0.06, 1.4);
  },
  flip: () => tone(900, 0.03, 'square', 0.03),
  armor: () => tone(700, 0.1, 'square', 0.08, 0.6),
  unlock: () => [880, 1320].forEach((f, i) => tone(f, 0.08, 'triangle', 0.09, 1, i * 0.05)),
  enemy: () => tone(140, 0.2, 'sawtooth', 0.14, 0.7),
  burn: () => {
    noise(0.18, 0.18);
    tone(220, 0.18, 'sawtooth', 0.12, 0.5);
  },
  hurt: () => {
    tone(150, 0.25, 'sawtooth', 0.2, 0.4);
    noise(0.15, 0.2);
  },
  bomb: () => {
    noise(0.4, 0.32);
    tone(80, 0.45, 'sawtooth', 0.22, 0.4);
  },
  magic: () => [660, 990, 1320].forEach((f, i) => tone(f, 0.1, 'sine', 0.1, 1, i * 0.04)),
  cast: () => tone(500, 0.18, 'triangle', 0.13, 2),
  smash: () => {
    noise(0.12, 0.2);
    tone(180, 0.15, 'square', 0.1, 0.5);
  },
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  shield: () => tone(600, 0.12, 'square', 0.07, 1.3),
  grow: () => tone(200, 0.2, 'triangle', 0.1, 1.8),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(500, 0.04, 'triangle', 0.06),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.1)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
