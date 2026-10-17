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
  /** Rune key. Each rune has its own pitch. */
  rune: (r: number) => tone(330 * Math.pow(2, [0, 2, 4, 5, 7, 9, 11, 12][r % 8] / 12), 0.09, 'triangle', 0.12),
  erase: () => tone(260, 0.06, 'sine', 0.08, 0.7),
  cast: (n: number) => {
    for (let i = 0; i < n; i++) tone(440 * Math.pow(2, i / 5), 0.12, 'sine', 0.1, 1.2, i * 0.04);
  },
  fizzle: () => {
    tone(300, 0.25, 'sawtooth', 0.08, 0.3);
    noise(0.15, 0.08);
  },
  reson: () => [659, 988, 1319].forEach((f, i) => tone(f, 0.3, 'sine', 0.1, 1, i * 0.05)),
  hit: () => {
    tone(200, 0.12, 'sawtooth', 0.15, 0.5);
    noise(0.08, 0.15);
  },
  hurt: () => {
    tone(150, 0.25, 'sawtooth', 0.22, 0.4);
    noise(0.15, 0.2);
  },
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  shield: () => tone(700, 0.1, 'square', 0.07, 0.8),
  poison: () => tone(180, 0.2, 'triangle', 0.12, 1.4),
  hex: () => tone(520, 0.25, 'sine', 0.1, 0.5),
  kill: () => [392, 523, 659].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, 1, i * 0.05)),
  silence: () => tone(900, 0.2, 'sine', 0.08, 0.3),
  page: () => noise(0.06, 0.06),
  reveal: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'sine', 0.13, 1, i * 0.07)),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.1)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
