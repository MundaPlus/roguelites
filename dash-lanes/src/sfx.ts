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
  jump: () => tone(330, 0.14, 'triangle', 0.12, 1.8),
  djump: () => tone(520, 0.14, 'triangle', 0.12, 1.6),
  slide: () => noise(0.18, 0.08),
  lane: () => tone(240, 0.05, 'sine', 0.06, 1.3),
  land: () => tone(110, 0.06, 'triangle', 0.08, 0.7),
  coin: (n: number) => tone(1100 + (n % 6) * 90, 0.07, 'sine', 0.08, 1.4),
  power: () => [523, 784, 1047, 1319].forEach((f, i) => tone(f, 0.12, 'square', 0.07, 1, i * 0.05)),
  shield: () => {
    tone(700, 0.2, 'square', 0.1, 0.5);
    noise(0.15, 0.15);
  },
  bump: () => tone(160, 0.1, 'square', 0.1, 0.6),
  crash: () => {
    noise(0.5, 0.35);
    tone(120, 0.5, 'sawtooth', 0.22, 0.3);
  },
  tele: () => {
    tone(880, 0.09, 'square', 0.06);
    tone(880, 0.09, 'square', 0.06, 1, 0.15);
  },
  zap: () => {
    tone(1400, 0.25, 'sawtooth', 0.1, 0.2);
    noise(0.12, 0.1);
  },
  dodge: () => tone(660, 0.08, 'triangle', 0.07, 1.5),
  boss: () => [196, 233, 196, 262].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.1, 1, i * 0.16)),
  bossDown: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.14, 1, i * 0.08)),
  gate: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, 1, i * 0.08)),
  click: () => tone(600, 0.04, 'sine', 0.06),
  buy: () => tone(1200, 0.08, 'sine', 0.1, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
