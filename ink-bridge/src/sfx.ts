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
  /** Pen scratch while drawing. */
  scratch: () => noise(0.03, 0.04),
  stroke: () => tone(660, 0.08, 'triangle', 0.08, 1.3),
  undo: () => tone(420, 0.08, 'triangle', 0.08, 0.7),
  go: () => {
    tone(330, 0.12, 'square', 0.08, 1.5);
    tone(494, 0.15, 'triangle', 0.1, 1, 0.08);
  },
  hit: (speed: number) => tone(120 + Math.min(speed, 12) * 25, 0.06, 'triangle', Math.min(0.15, 0.03 + speed * 0.01)),
  star: (n: number) => tone(660 * Math.pow(2, n / 6), 0.18, 'triangle', 0.15),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, 1, i * 0.1)),
  miss: () => {
    tone(220, 0.3, 'sawtooth', 0.14, 0.5);
    noise(0.15, 0.15);
  },
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, 1, i * 0.1)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  tick: () => tone(1000, 0.03, 'square', 0.04),
  victory: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, 1, i * 0.13)),
  defeat: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
