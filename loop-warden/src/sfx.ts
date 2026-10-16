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
  hit: () => tone(260, 0.07, 'square', 0.07, 0.6),
  crit: () => {
    tone(700, 0.08, 'square', 0.09);
    tone(1100, 0.12, 'triangle', 0.1, 1, 0.04);
  },
  hurt: () => {
    tone(140, 0.15, 'sawtooth', 0.12, 0.5);
    noise(0.06, 0.08);
  },
  miss: () => tone(900, 0.06, 'sine', 0.05, 0.7),
  kill: () => {
    tone(330, 0.1, 'triangle', 0.12, 0.5);
    noise(0.12, 0.12);
  },
  battle: () => [196, 262].forEach((f, i) => tone(f, 0.18, 'sawtooth', 0.1, 1, i * 0.1)),
  boss: () => [98, 92, 87].forEach((f, i) => tone(f, 0.5, 'sawtooth', 0.18, 0.9, i * 0.25)),
  place: () => {
    tone(180, 0.08, 'triangle', 0.15, 0.7);
    noise(0.05, 0.08);
  },
  card: () => tone(880, 0.06, 'sine', 0.06, 1.3),
  heal: () => {
    tone(523, 0.1, 'sine', 0.1);
    tone(784, 0.14, 'sine', 0.1, 1, 0.07);
  },
  coin: () => tone(1200, 0.06, 'sine', 0.06, 1.5),
  day: () => tone(660, 0.18, 'sine', 0.05, 1.2),
  camp: () => [392, 494, 587].forEach((f, i) => tone(f, 0.2, 'triangle', 0.12, 1, i * 0.08)),
  equip: () => tone(500, 0.08, 'square', 0.07, 1.4),
  potion: () => [400, 600, 800].forEach((f, i) => tone(f, 0.08, 'sine', 0.1, 1, i * 0.05)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(600, 0.03, 'triangle', 0.05),
  build: () => [262, 330, 392, 523].forEach((f, i) => tone(f, 0.15, 'triangle', 0.14, 1, i * 0.07)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};

export function setMuted(m: boolean): void {
  muted = m;
}
