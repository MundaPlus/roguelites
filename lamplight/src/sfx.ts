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
  select: () => tone(660, 0.05, 'triangle', 0.1, 1.2),
  place: () => {
    tone(520, 0.08, 'sine', 0.12, 1.4);
    tone(780, 0.1, 'triangle', 0.06, 1, 0.04);
  },
  cast: () => {
    noise(0.25, 0.08);
    tone(180, 0.35, 'sine', 0.15, 2.2);
  },
  hit: () => {
    tone(200, 0.12, 'sawtooth', 0.15, 0.5);
    noise(0.08, 0.15);
  },
  hurt: () => {
    tone(150, 0.25, 'sawtooth', 0.2, 0.4);
    noise(0.15, 0.18);
  },
  clash: () => {
    tone(900, 0.06, 'square', 0.08, 0.6);
    tone(600, 0.08, 'square', 0.06, 0.6, 0.04);
  },
  kill: () => {
    tone(330, 0.2, 'triangle', 0.15, 0.3);
    noise(0.2, 0.12);
  },
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  step: () => tone(140, 0.06, 'triangle', 0.08),
  dark: () => tone(70, 0.5, 'sawtooth', 0.12, 0.7),
  turn: () => [440, 660].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, 1, i * 0.08)),
  pick: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.15, 1, i * 0.08)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
