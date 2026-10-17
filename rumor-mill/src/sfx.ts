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
  /** A whisper: soft noise and a low hum. */
  plant: () => {
    noise(0.25, 0.08);
    tone(220, 0.3, 'sine', 0.12, 1.5);
  },
  /** One tick per spread turn. */
  spread: (n: number) => {
    for (let i = 0; i < Math.min(n, 6); i++) tone(500 + i * 60, 0.05, 'triangle', 0.05, 1, i * 0.04);
  },
  /** A believer. The pitch rises with the count this turn. */
  believe: (n: number) => tone(523 * Math.pow(2, Math.min(n, 12) / 12), 0.14, 'sine', 0.12, 1, 0.05 * Math.min(n, 12)),
  defend: () => tone(180, 0.18, 'square', 0.06, 0.8),
  mutate: () => tone(900, 0.06, 'square', 0.05, 0.6),
  trace: () => {
    tone(660, 0.12, 'square', 0.08);
    tone(440, 0.12, 'square', 0.08, 1, 0.14);
  },
  expose: () => {
    tone(150, 0.3, 'sawtooth', 0.22, 0.4);
    noise(0.2, 0.2);
  },
  rival: () => tone(330, 0.25, 'sawtooth', 0.08, 0.7),
  click: () => tone(700, 0.04, 'triangle', 0.06),
  pick: () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, 'triangle', 0.14, 1, i * 0.08)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
