/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem('wordsmith.mute') === '1';
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
    localStorage.setItem('wordsmith.mute', muted ? '1' : '0');
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
  /** Tile click. The pitch rises with each letter of the word. */
  tile: (n: number) => tone(330 * Math.pow(2, Math.min(n, 14) / 12), 0.06, 'triangle', 0.12),
  untile: () => tone(260, 0.05, 'triangle', 0.08, 0.7),
  /** Word attack. Bigger words sound bigger. */
  word: (len: number) => {
    [523, 659, 784, 1047, 1319].slice(0, Math.min(5, Math.max(2, len - 2))).forEach((f, i) => tone(f, 0.12, 'square', 0.07, 1, i * 0.04));
  },
  hit: (big: boolean) => {
    tone(big ? 120 : 200, 0.18, 'sawtooth', 0.16, 0.5);
    noise(big ? 0.2 : 0.08, 0.18);
  },
  kill: () => {
    noise(0.3, 0.2);
    tone(400, 0.3, 'triangle', 0.15, 0.3);
  },
  hurt: () => {
    tone(150, 0.25, 'sawtooth', 0.22, 0.4);
    noise(0.15, 0.2);
  },
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  block: () => tone(700, 0.1, 'square', 0.07, 0.8),
  scramble: () => {
    for (let i = 0; i < 6; i++) tone(300 + Math.random() * 500, 0.04, 'triangle', 0.08, 1, i * 0.03);
  },
  potion: () => tone(400, 0.25, 'sine', 0.15, 2.2),
  curse: () => tone(240, 0.3, 'sawtooth', 0.08, 0.6),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.1)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  step: () => tone(160, 0.05, 'triangle', 0.06),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
