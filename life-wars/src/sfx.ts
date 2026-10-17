/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem('life.mute') === '1';
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
    localStorage.setItem('life.mute', muted ? '1' : '0');
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
  place: () => tone(660, 0.05, 'triangle', 0.08),
  stamp: () => {
    tone(440, 0.06, 'triangle', 0.1);
    tone(660, 0.08, 'triangle', 0.08, 1, 0.04);
  },
  remove: () => tone(330, 0.06, 'triangle', 0.08, 0.7),
  rotate: () => tone(520, 0.05, 'sine', 0.07, 1.3),
  run: () => tone(220, 0.25, 'sawtooth', 0.08, 2),
  /** Soft tick per generation. The pitch walks up through the turn. */
  gen: (g: number) => tone(180 + g * 18, 0.04, 'sine', 0.035),
  clash: (n: number) => {
    noise(0.06 + Math.min(n, 10) * 0.01, 0.06 + Math.min(n, 10) * 0.012);
  },
  hitE: () => [880, 1175].forEach((f, i) => tone(f, 0.1, 'square', 0.07, 1, i * 0.04)),
  hitP: () => {
    tone(150, 0.25, 'sawtooth', 0.18, 0.5);
    noise(0.12, 0.15);
  },
  heal: () => {
    tone(523, 0.12, 'sine', 0.12);
    tone(784, 0.18, 'sine', 0.12, 1, 0.08);
  },
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.08),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, 1, i * 0.1)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
