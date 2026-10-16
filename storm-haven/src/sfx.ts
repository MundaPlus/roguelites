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
  click: () => tone(660, 0.05, 'triangle', 0.08),
  place: () => {
    tone(220, 0.08, 'square', 0.08, 0.7);
    noise(0.06, 0.08);
  },
  built: () => [392, 523, 659].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, 1, i * 0.06)),
  chop: () => tone(180, 0.05, 'square', 0.04, 0.6),
  drop: () => tone(900, 0.04, 'sine', 0.04, 1.3),
  deny: () => tone(120, 0.15, 'square', 0.1),
  order: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, 1, i * 0.08)),
  glade: () => [440, 554, 659].forEach((f, i) => tone(f, 0.2, 'sine', 0.12, 1, i * 0.1)),
  danger: () => {
    tone(110, 0.4, 'sawtooth', 0.12, 0.7);
    tone(116, 0.4, 'sawtooth', 0.1, 0.7, 0.05);
  },
  leave: () => [330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, 1, i * 0.15)),
  arrive: () => [523, 659].forEach((f, i) => tone(f, 0.15, 'sine', 0.1, 1, i * 0.1)),
  storm: () => {
    noise(1.2, 0.18);
    tone(70, 1.0, 'sawtooth', 0.12, 0.5);
  },
  thunder: () => noise(0.8, 0.12),
  season: () => tone(784, 0.3, 'sine', 0.1, 1.2),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.16, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.1, 1, i * 0.18)),
};
