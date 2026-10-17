/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
try {
  muted = localStorage.getItem('crate-crypt.mute') === '1';
} catch {
  /* ignore */
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
    localStorage.setItem('crate-crypt.mute', muted ? '1' : '0');
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
  step: () => tone(180 + Math.random() * 30, 0.04, 'triangle', 0.05),
  push: () => {
    tone(90, 0.12, 'sawtooth', 0.09, 0.7);
    noise(0.07, 0.06);
  },
  slide: () => tone(900, 0.3, 'sine', 0.06, 0.4),
  heavy: () => tone(60, 0.2, 'square', 0.1, 0.8),
  bump: () => tone(110, 0.05, 'square', 0.04),
  plate: () => {
    tone(660, 0.1, 'triangle', 0.12);
    tone(990, 0.14, 'triangle', 0.1, 1, 0.06);
  },
  open: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, 1, i * 0.08)),
  exit: () => tone(300, 0.25, 'sine', 0.12, 2.2),
  undo: () => tone(500, 0.06, 'sine', 0.07, 0.6),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  pick: () => [659, 880].forEach((f, i) => tone(f, 0.12, 'triangle', 0.13, 1, i * 0.06)),
  bite: () => {
    tone(160, 0.2, 'sawtooth', 0.18, 0.5);
    noise(0.1, 0.15);
  },
  shove: () => tone(240, 0.08, 'square', 0.08, 0.6),
  kill: () => {
    noise(0.15, 0.15);
    tone(400, 0.2, 'square', 0.1, 0.3);
  },
  boom: () => {
    noise(0.45, 0.35);
    tone(80, 0.5, 'sawtooth', 0.22, 0.3);
  },
  magic: () => [784, 1047, 1319].forEach((f, i) => tone(f, 0.12, 'sine', 0.1, 1, i * 0.04)),
  buy: () => tone(1000, 0.1, 'sine', 0.12, 1.4),
  deny: () => tone(120, 0.15, 'square', 0.1),
  hurt: () => [300, 220, 150].forEach((f, i) => tone(f, 0.2, 'sawtooth', 0.14, 1, i * 0.1)),
  descend: () => [523, 440, 349, 262].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, 1, i * 0.08)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
