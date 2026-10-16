/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem('gridcrawler.mute') === '1';
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
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem('gridcrawler.mute', muted ? '1' : '0');
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

const SOUNDS: Record<string, () => void> = {
  step: () => tone(140, 0.04, 'triangle', 0.05),
  hit: () => {
    tone(220, 0.1, 'sawtooth', 0.12, 0.5);
    noise(0.06, 0.12);
  },
  crit: () => {
    tone(330, 0.12, 'square', 0.12, 0.5);
    tone(660, 0.12, 'triangle', 0.12, 1, 0.04);
    noise(0.08, 0.15);
  },
  miss: () => tone(500, 0.08, 'sine', 0.06, 0.6),
  block: () => tone(900, 0.06, 'square', 0.06, 0.7),
  kill: () => {
    tone(180, 0.2, 'sawtooth', 0.12, 0.3);
    noise(0.15, 0.12);
  },
  hurt: () => {
    tone(130, 0.22, 'sawtooth', 0.18, 0.5);
    noise(0.12, 0.18);
  },
  coin: () => tone(1200, 0.08, 'sine', 0.1, 1.5),
  pickup: () => [523, 784].forEach((f, i) => tone(f, 0.08, 'triangle', 0.1, 1, i * 0.05)),
  equip: () => tone(300, 0.1, 'square', 0.08, 1.5),
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, 1, i * 0.08)),
  die: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.16, 1, i * 0.12)),
  trap: () => {
    tone(700, 0.15, 'square', 0.1, 0.4);
    noise(0.1, 0.1);
  },
  teleport: () => tone(300, 0.35, 'sine', 0.14, 4),
  stairs: () => [392, 330, 262].forEach((f, i) => tone(f, 0.15, 'triangle', 0.12, 1, i * 0.08)),
  quaff: () => [600, 700, 800].forEach((f, i) => tone(f, 0.06, 'sine', 0.08, 1, i * 0.05)),
  heal: () => {
    tone(523, 0.12, 'sine', 0.14);
    tone(784, 0.18, 'sine', 0.14, 1, 0.08);
  },
  read: () => noise(0.12, 0.06),
  zap: () => tone(900, 0.18, 'sawtooth', 0.08, 0.3),
  fire: () => {
    noise(0.4, 0.22);
    tone(90, 0.4, 'sawtooth', 0.15, 0.5);
  },
  shoot: () => tone(1000, 0.1, 'triangle', 0.07, 0.4),
  spell: () => tone(400, 0.25, 'sine', 0.1, 2),
  alert: () => tone(880, 0.08, 'square', 0.05),
  deny: () => tone(120, 0.12, 'square', 0.08),
  click: () => tone(600, 0.04, 'triangle', 0.06),
};

export function play(name: string): void {
  SOUNDS[name]?.();
}
