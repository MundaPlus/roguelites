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
  click: () => tone(520, 0.05, 'triangle', 0.08),
  hit: () => {
    tone(220, 0.1, 'square', 0.12, 0.5);
    noise(0.08, 0.15);
  },
  super: () => {
    tone(330, 0.12, 'sawtooth', 0.15, 0.4);
    noise(0.15, 0.25);
  },
  weak: () => tone(160, 0.1, 'triangle', 0.1, 0.7),
  crit: () => {
    tone(880, 0.1, 'square', 0.1);
    tone(1320, 0.14, 'triangle', 0.12, 1, 0.05);
  },
  miss: () => tone(600, 0.15, 'sine', 0.08, 0.5),
  status: () => [440, 370, 311].forEach((f, i) => tone(f, 0.1, 'triangle', 0.1, 1, i * 0.06)),
  boost: () => [392, 523, 659].forEach((f, i) => tone(f, 0.08, 'square', 0.06, 1, i * 0.05)),
  faint: () => tone(400, 0.5, 'sawtooth', 0.15, 0.2),
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  throw: () => tone(300, 0.2, 'triangle', 0.15, 2.5),
  shake: () => tone(180, 0.08, 'square', 0.08, 1.4),
  caught: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, 1, i * 0.08)),
  escape: () => tone(700, 0.2, 'sine', 0.1, 0.4),
  swap: () => tone(330, 0.1, 'triangle', 0.12, 1.6),
  level: () => [659, 784, 988].forEach((f, i) => tone(f, 0.12, 'square', 0.08, 1, i * 0.07)),
  evolve: () => [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, 1, i * 0.11)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
