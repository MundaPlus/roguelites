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

export function setMuted(v: boolean): void {
  muted = v;
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
  step: () => tone(140, 0.05, 'triangle', 0.05),
  guardStep: () => tone(90, 0.06, 'triangle', 0.05),
  door: () => {
    tone(220, 0.08, 'square', 0.05, 0.7);
    noise(0.05, 0.05);
  },
  select: () => tone(660, 0.05, 'sine', 0.08),
  ko: () => {
    tone(180, 0.15, 'sawtooth', 0.15, 0.4);
    noise(0.1, 0.15);
  },
  hack: () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.07, 'square', 0.06, 1, i * 0.05)),
  coin: () => {
    tone(1200, 0.08, 'sine', 0.12, 1.5);
    tone(1600, 0.1, 'sine', 0.1, 1.2, 0.07);
  },
  spotted: () => {
    tone(880, 0.12, 'square', 0.12);
    tone(1100, 0.18, 'square', 0.12, 1, 0.12);
  },
  alarm: () => [0, 0.25, 0.5].forEach((d) => tone(700, 0.2, 'sawtooth', 0.1, 1.4, d)),
  shot: () => {
    noise(0.12, 0.3);
    tone(120, 0.15, 'sawtooth', 0.15, 0.5);
  },
  hurt: () => tone(150, 0.25, 'sawtooth', 0.2, 0.4),
  gadget: () => tone(500, 0.12, 'triangle', 0.1, 1.8),
  smoke: () => noise(0.4, 0.15),
  deny: () => tone(120, 0.15, 'square', 0.1),
  turn: () => tone(330, 0.1, 'sine', 0.08, 1.2),
  escape: () => [392, 523, 659].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, 1, i * 0.09)),
  buy: () => tone(900, 0.08, 'sine', 0.12, 1.4),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
