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

export function setMuted(m: boolean): void {
  muted = m;
}

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
  select: () => tone(660, 0.05, 'triangle', 0.08),
  step: () => tone(180, 0.06, 'triangle', 0.08),
  /** Wood creak when the beam tilts. Lower pitch for a bigger tilt. */
  creak: (t: number) => tone(260 - Math.min(4, Math.abs(t)) * 30, 0.22, 'sawtooth', 0.05, 0.8),
  slide: () => tone(400, 0.18, 'sine', 0.06, 0.6),
  hit: () => {
    tone(200, 0.12, 'sawtooth', 0.15, 0.5);
    noise(0.08, 0.15);
  },
  bump: () => tone(110, 0.1, 'square', 0.1, 0.7),
  fall: () => tone(700, 0.7, 'triangle', 0.14, 0.12),
  hurt: () => {
    tone(150, 0.25, 'sawtooth', 0.2, 0.4);
    noise(0.15, 0.18);
  },
  brace: () => tone(320, 0.12, 'square', 0.07, 1.2),
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.1)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  turn: () => tone(440, 0.1, 'triangle', 0.08, 1.3),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
