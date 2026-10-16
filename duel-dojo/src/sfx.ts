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

function noise(dur: number, vol: number, lowpass = 4000, delay = 0): void {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start(ctx.currentTime + delay);
}

export const sfx = {
  hit: (big: boolean) => {
    noise(big ? 0.18 : 0.09, big ? 0.45 : 0.3, big ? 1800 : 3000);
    tone(big ? 110 : 180, big ? 0.18 : 0.08, 'square', 0.12, 0.5);
  },
  counter: () => tone(1400, 0.12, 'square', 0.08, 0.6),
  block: () => {
    tone(900, 0.05, 'square', 0.07, 0.7);
    noise(0.04, 0.12, 6000);
  },
  whoosh: () => noise(0.08, 0.08, 1200),
  jump: () => tone(260, 0.08, 'triangle', 0.06, 1.6),
  land: () => noise(0.05, 0.08, 500),
  throw: () => {
    noise(0.25, 0.4, 900);
    tone(90, 0.3, 'sawtooth', 0.15, 0.5);
  },
  tech: () => [700, 500].forEach((f, i) => tone(f, 0.08, 'square', 0.08, 1, i * 0.05)),
  proj: () => tone(500, 0.25, 'sawtooth', 0.07, 0.4),
  clash: () => tone(1200, 0.15, 'triangle', 0.1, 0.5),
  special: () => tone(330, 0.12, 'triangle', 0.08, 1.8),
  super: () => {
    tone(220, 0.5, 'sawtooth', 0.12, 4);
    tone(440, 0.5, 'square', 0.06, 2, 0.05);
  },
  parry: () => [1200, 1600, 2000].forEach((f, i) => tone(f, 0.1, 'sine', 0.12, 1, i * 0.04)),
  down: () => noise(0.2, 0.25, 400),
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  bell: () => [880, 1320].forEach((f, i) => tone(f, 0.6, 'sine', 0.12, 1, i * 0.02)),
  ko: () => {
    noise(0.5, 0.4, 700);
    [330, 262, 196].forEach((f, i) => tone(f, 0.4, 'sawtooth', 0.12, 1, 0.1 + i * 0.15));
  },
  click: () => tone(600, 0.04, 'triangle', 0.06),
  pick: () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, 'triangle', 0.14, 1, i * 0.07)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
