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
  hit: () => {
    tone(200, 0.1, 'sawtooth', 0.14, 0.5);
    noise(0.07, 0.14);
  },
  crit: () => {
    tone(880, 0.1, 'square', 0.1);
    tone(1320, 0.14, 'triangle', 0.12, 1, 0.05);
    noise(0.1, 0.18);
  },
  hurt: () => {
    tone(150, 0.2, 'sawtooth', 0.18, 0.45);
    noise(0.12, 0.16);
  },
  fire: () => {
    noise(0.3, 0.22);
    tone(180, 0.3, 'sawtooth', 0.12, 2.2);
  },
  ice: () => [1568, 2093, 2637].forEach((f, i) => tone(f, 0.12, 'sine', 0.08, 0.9, i * 0.05)),
  thunder: () => {
    noise(0.25, 0.3);
    tone(90, 0.25, 'square', 0.15, 0.5);
  },
  holy: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, 'sine', 0.08, 1, i * 0.05)),
  dark: () => tone(110, 0.45, 'sawtooth', 0.14, 0.5),
  magic: () => tone(600, 0.2, 'triangle', 0.1, 1.8),
  heal: () => {
    tone(523, 0.12, 'sine', 0.13);
    tone(784, 0.18, 'sine', 0.13, 1, 0.08);
  },
  buff: () => [440, 660, 880].forEach((f, i) => tone(f, 0.12, 'triangle', 0.09, 1, i * 0.04)),
  debuff: () => [440, 330, 247].forEach((f, i) => tone(f, 0.14, 'triangle', 0.09, 1, i * 0.05)),
  miss: () => tone(300, 0.08, 'sine', 0.06, 0.7),
  ko: () => tone(260, 0.4, 'sawtooth', 0.14, 0.3),
  ready: () => tone(1046, 0.07, 'square', 0.05),
  move: () => tone(660, 0.03, 'square', 0.035),
  select: () => tone(880, 0.06, 'square', 0.06, 1.3),
  back: () => tone(440, 0.05, 'square', 0.05, 0.7),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  level: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, 1, i * 0.07)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.16, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
