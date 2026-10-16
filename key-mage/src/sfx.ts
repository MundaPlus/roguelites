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
  key: () => tone(1400 + Math.random() * 300, 0.025, 'square', 0.025),
  typo: () => tone(110, 0.12, 'square', 0.09),
  word: (combo: number) => {
    tone(520 * Math.pow(2, Math.min(combo, 24) / 24), 0.09, 'triangle', 0.13, 1.6);
    noise(0.05, 0.06);
  },
  kill: () => {
    tone(260, 0.14, 'sawtooth', 0.11, 0.4);
    noise(0.12, 0.12);
  },
  shield: () => tone(900, 0.09, 'square', 0.07, 0.7),
  fire: () => {
    noise(0.25, 0.14);
    tone(180, 0.25, 'sawtooth', 0.1, 2);
  },
  frost: () => [1320, 1760, 2093].forEach((f, i) => tone(f, 0.12, 'sine', 0.08, 1, i * 0.04)),
  volt: () => {
    tone(80, 0.18, 'square', 0.1, 6);
    noise(0.1, 0.1);
  },
  lance: () => tone(700, 0.16, 'triangle', 0.12, 0.5),
  nova: () => {
    noise(0.45, 0.25);
    tone(120, 0.45, 'sawtooth', 0.18, 0.3);
  },
  wall: () => {
    tone(90, 0.3, 'square', 0.15, 0.6);
    noise(0.2, 0.15);
  },
  heal: () => {
    tone(523, 0.12, 'sine', 0.15);
    tone(784, 0.18, 'sine', 0.15, 1, 0.08);
  },
  fizzle: () => tone(200, 0.2, 'sine', 0.08, 0.5),
  hurt: () => {
    tone(150, 0.25, 'sawtooth', 0.22, 0.4);
    noise(0.15, 0.2);
  },
  block: () => tone(1000, 0.12, 'triangle', 0.12, 0.6),
  boss: () => [98, 92, 82].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.14, 1, i * 0.25)),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.1)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(600, 0.04, 'triangle', 0.06),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
