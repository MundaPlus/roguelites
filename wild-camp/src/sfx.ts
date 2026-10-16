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

function noise(dur: number, vol: number, hp = 0, delay = 0): void {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  let node: AudioNode = src;
  if (hp > 0) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    src.connect(f);
    node = f;
  }
  node.connect(g).connect(master);
  src.start(ctx.currentTime + delay);
}

const SOUNDS: Record<string, () => void> = {
  chop: () => {
    tone(180, 0.08, 'square', 0.12, 0.6);
    noise(0.06, 0.12, 800);
  },
  mine: () => {
    tone(900, 0.05, 'square', 0.08, 0.7);
    noise(0.05, 0.12, 2000);
  },
  treefall: () => {
    noise(0.35, 0.18, 200);
    tone(110, 0.3, 'triangle', 0.15, 0.5);
  },
  rock: () => {
    noise(0.25, 0.2, 400);
    tone(140, 0.2, 'square', 0.1, 0.5);
  },
  pick: () => tone(660, 0.07, 'sine', 0.12, 1.4),
  hit: () => {
    tone(220, 0.08, 'sawtooth', 0.12, 0.6);
    noise(0.05, 0.12, 1000);
  },
  kill: () => [392, 294].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, 0.8, i * 0.07)),
  hurt: () => {
    tone(150, 0.22, 'sawtooth', 0.2, 0.4);
    noise(0.12, 0.18);
  },
  slam: () => {
    noise(0.45, 0.35, 60);
    tone(60, 0.5, 'sine', 0.35, 0.5);
  },
  craft: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, 1, i * 0.06)),
  equip: () => tone(440, 0.06, 'square', 0.06, 1.3),
  eat: () => [300, 360].forEach((f, i) => tone(f, 0.07, 'square', 0.07, 0.8, i * 0.08)),
  cook: () => {
    noise(0.3, 0.1, 3000);
    tone(500, 0.1, 'sine', 0.08, 1.5);
  },
  heal: () => [523, 784].forEach((f, i) => tone(f, 0.16, 'sine', 0.14, 1, i * 0.08)),
  sleep: () => [392, 330, 262].forEach((f, i) => tone(f, 0.4, 'sine', 0.12, 1, i * 0.25)),
  fuel: () => noise(0.25, 0.12, 1500),
  break: () => {
    noise(0.15, 0.2, 1500);
    tone(300, 0.15, 'square', 0.1, 0.4);
  },
  part: () => [659, 880, 1175, 1568].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 1, i * 0.09)),
  portal: () => [262, 392, 523, 784, 1047].forEach((f, i) => tone(f, 0.5, 'sine', 0.15, 1.02, i * 0.15)),
  dawn: () => [523, 659, 784].forEach((f, i) => tone(f, 0.3, 'sine', 0.08, 1, i * 0.12)),
  dusk: () => [392, 330].forEach((f, i) => tone(f, 0.4, 'sine', 0.08, 1, i * 0.2)),
  boss: () => {
    tone(70, 1.2, 'sawtooth', 0.2, 0.7);
    noise(0.8, 0.15, 50);
  },
  bossdie: () => [196, 262, 330, 392, 523].forEach((f, i) => tone(f, 0.35, 'triangle', 0.16, 1, i * 0.1)),
  howl: () => {
    tone(420, 0.9, 'sine', 0.1, 1.5);
    tone(400, 0.9, 'sine', 0.08, 1.45, 0.5);
  },
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, 1, i * 0.14)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.12, 1, i * 0.2)),
  click: () => tone(800, 0.03, 'square', 0.05),
};

export function play(name: string): void {
  SOUNDS[name]?.();
}
