/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const last: Record<string, number> = {};

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setMuted(m: boolean): void {
  muted = m;
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

const SOUNDS: Record<string, () => void> = {
  click: () => tone(660, 0.05, 'triangle', 0.08),
  turn: () => tone(420, 0.03, 'triangle', 0.04),
  arrow: () => tone(900, 0.06, 'triangle', 0.05, 0.6),
  magic: () => tone(500, 0.18, 'sine', 0.07, 2),
  frost: () => tone(1400, 0.12, 'sine', 0.05, 0.7),
  slash: () => noise(0.05, 0.08),
  boom: () => {
    noise(0.25, 0.18);
    tone(110, 0.25, 'sawtooth', 0.1, 0.5);
  },
  heal: () => {
    tone(523, 0.1, 'sine', 0.08);
    tone(784, 0.14, 'sine', 0.08, 1, 0.06);
  },
  kill: () => tone(240, 0.1, 'square', 0.06, 0.5),
  hurt: () => {
    tone(160, 0.15, 'sawtooth', 0.12, 0.5);
    noise(0.08, 0.1);
  },
  crash: () => {
    noise(0.3, 0.3);
    tone(90, 0.4, 'sawtooth', 0.2, 0.4);
  },
  gem: () => tone(1320, 0.07, 'sine', 0.07, 1.4),
  coin: () => tone(1700, 0.06, 'sine', 0.07, 1.3),
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, 1, i * 0.07)),
  recruit: () => [392, 523, 659].forEach((f, i) => tone(f, 0.16, 'triangle', 0.14, 1, i * 0.08)),
  spawn: () => tone(200, 0.2, 'sine', 0.04, 1.6),
  enemyShot: () => tone(330, 0.08, 'square', 0.03, 0.7),
  charge: () => tone(140, 0.3, 'sawtooth', 0.08, 2),
  boss: () => [196, 185, 175, 147].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, 1, i * 0.15)),
  wave: () => [440, 554, 659].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, 1, i * 0.09)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.28, 'triangle', 0.16, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};

/** Plays a named sound. The same sound plays at most once per 45 ms. */
export function play(name: string): void {
  if (!ctx || muted) return;
  const now = performance.now();
  if (now - (last[name] ?? 0) < 45) return;
  last[name] = now;
  SOUNDS[name]?.();
}
