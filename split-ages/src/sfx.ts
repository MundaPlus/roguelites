/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem('ages.mute') === '1';
} catch {
  /* storage can be blocked */
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
  try {
    localStorage.setItem('ages.mute', muted ? '1' : '0');
  } catch {
    /* ignore */
  }
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
  select: () => tone(520, 0.05, 'triangle', 0.06),
  step: () => tone(170, 0.06, 'triangle', 0.07),
  /** The time pulse from the past to the future: a rising shimmer. */
  cause: () => {
    tone(330, 0.35, 'sine', 0.1, 3);
    tone(660, 0.3, 'triangle', 0.05, 2, 0.05);
  },
  grow: () => [392, 523, 659].forEach((f, i) => tone(f, 0.16, 'sine', 0.1, 1, 0.25 + i * 0.06)),
  crumble: () => {
    noise(0.25, 0.25);
    tone(110, 0.25, 'sawtooth', 0.1, 0.5);
  },
  flood: () => {
    noise(0.5, 0.12);
    tone(200, 0.5, 'sine', 0.08, 0.6);
  },
  hit: () => {
    tone(220, 0.1, 'square', 0.1, 0.6);
    noise(0.06, 0.12);
  },
  hurt: () => {
    tone(150, 0.25, 'sawtooth', 0.18, 0.4);
    noise(0.12, 0.15);
  },
  kill: () => [600, 400, 250].forEach((f, i) => tone(f, 0.08, 'square', 0.07, 1, i * 0.04)),
  block: () => tone(800, 0.1, 'square', 0.06, 0.8),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  gate: () => [880, 660, 990].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, 1, i * 0.07)),
  rewind: () => tone(900, 0.3, 'sine', 0.1, 0.3),
  deny: () => tone(120, 0.15, 'square', 0.08),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, 1, i * 0.09)),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, 1, i * 0.1)),
  wave: () => {
    tone(80, 0.5, 'sawtooth', 0.15, 2);
    noise(0.3, 0.15);
  },
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.16, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
