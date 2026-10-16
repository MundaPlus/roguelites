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
  bubble: () => [330, 440, 392].forEach((f, i) => tone(f, 0.09, 'sine', 0.1, 1.6, i * 0.06)),
  plop: () => {
    tone(520, 0.12, 'sine', 0.16, 0.4);
    tone(260, 0.1, 'triangle', 0.08, 1.5, 0.05);
  },
  stir: () => tone(180 + Math.random() * 60, 0.06, 'triangle', 0.035),
  water: () => noise(0.06, 0.04),
  grind: () => noise(0.05, 0.06),
  tick: () => tone(900, 0.03, 'square', 0.03),
  chime: (n: number) => [523, 659, 784].slice(0, n).forEach((f, i) => tone(f * 1.5, 0.14, 'sine', 0.1, 1, i * 0.05)),
  salt: () => [1400, 1700, 1250].forEach((f, i) => tone(f, 0.05, 'square', 0.04, 1, i * 0.03)),
  bottle: () => {
    tone(700, 0.08, 'sine', 0.14, 1.8);
    [784, 988, 1175].forEach((f, i) => tone(f, 0.16, 'triangle', 0.12, 1, 0.08 + i * 0.07));
  },
  boom: () => {
    noise(0.45, 0.32);
    tone(110, 0.5, 'sawtooth', 0.2, 0.3);
  },
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  sale: () => [988, 1319, 1568].forEach((f, i) => tone(f, 0.1, 'sine', 0.13, 1, i * 0.06)),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, 1, i * 0.1)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  night: () => [392, 330, 294].forEach((f, i) => tone(f, 0.3, 'sine', 0.1, 1, i * 0.15)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
