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
  pick: () => tone(520, 0.06, 'triangle', 0.1, 1.3),
  place: () => {
    tone(260, 0.07, 'square', 0.08, 0.7);
    noise(0.04, 0.08);
  },
  rotate: () => tone(700, 0.05, 'triangle', 0.08, 1.4),
  star: () => [880, 1320].forEach((f, i) => tone(f, 0.1, 'sine', 0.1, 1, i * 0.05)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  buy: () => [660, 990].forEach((f, i) => tone(f, 0.08, 'triangle', 0.12, 1, i * 0.05)),
  sell: () => [990, 660].forEach((f, i) => tone(f, 0.08, 'triangle', 0.1, 1, i * 0.05)),
  reroll: () => [400, 500, 600].forEach((f, i) => tone(f, 0.05, 'square', 0.06, 1, i * 0.04)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  hit: (big: boolean) => {
    tone(big ? 140 : 220, 0.1, 'sawtooth', big ? 0.16 : 0.1, 0.5);
    noise(0.06, big ? 0.18 : 0.1);
  },
  block: () => tone(600, 0.08, 'square', 0.05, 0.8),
  heal: () => {
    tone(523, 0.1, 'sine', 0.1);
    tone(784, 0.14, 'sine', 0.1, 1, 0.06);
  },
  poison: () => tone(180, 0.15, 'triangle', 0.08, 1.6),
  stun: () => tone(1500, 0.12, 'sine', 0.08, 0.5),
  fight: () => [330, 440, 660].forEach((f, i) => tone(f, 0.15, 'sawtooth', 0.08, 1, i * 0.08)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
