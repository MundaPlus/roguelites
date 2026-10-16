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
  click: () => tone(520, 0.05, 'triangle', 0.08),
  coin: () => {
    tone(1200, 0.08, 'sine', 0.12, 1.5);
    tone(1600, 0.1, 'sine', 0.1, 1.2, 0.06);
  },
  buy: () => tone(700, 0.08, 'triangle', 0.1, 0.8),
  sail: () => {
    noise(0.5, 0.08);
    [330, 440, 554].forEach((f, i) => tone(f, 0.2, 'sine', 0.1, 1, i * 0.08));
  },
  day: () => tone(240, 0.05, 'sine', 0.04, 1.2),
  arrive: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, 1, i * 0.09)),
  cannon: () => {
    noise(0.4, 0.35);
    tone(80, 0.4, 'sawtooth', 0.2, 0.4);
  },
  storm: () => {
    noise(1.2, 0.25);
    tone(60, 1, 'sawtooth', 0.1, 0.6);
  },
  alarm: () => [880, 660, 880].forEach((f, i) => tone(f, 0.12, 'square', 0.08, 1, i * 0.14)),
  good: () => [659, 880].forEach((f, i) => tone(f, 0.15, 'triangle', 0.14, 1, i * 0.08)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
