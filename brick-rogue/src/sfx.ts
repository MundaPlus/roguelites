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
  /** Brick hit. Higher HP gives a lower note. */
  hit: (hp: number) => tone(660 - Math.min(hp, 6) * 60, 0.06, 'square', 0.06),
  kill: (n: number) => tone(520 * Math.pow(2, Math.min(n, 24) / 24), 0.09, 'triangle', 0.12, 1.4),
  paddle: () => tone(260, 0.07, 'triangle', 0.14, 1.3),
  wall: () => tone(180, 0.03, 'square', 0.03),
  boom: () => {
    noise(0.3, 0.28);
    tone(110, 0.35, 'sawtooth', 0.18, 0.4);
  },
  power: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.1, 'sine', 0.12, 1, i * 0.05)),
  coin: () => tone(1200, 0.08, 'sine', 0.1, 1.5),
  laser: () => tone(1400, 0.05, 'sawtooth', 0.04, 0.5),
  shoot: () => tone(300, 0.1, 'square', 0.05, 0.6),
  stun: () => {
    tone(90, 0.25, 'sawtooth', 0.15, 2);
    noise(0.1, 0.12);
  },
  zap: () => tone(1800, 0.08, 'square', 0.05, 0.3),
  shield: () => tone(700, 0.15, 'sine', 0.12, 0.6),
  boss: () => tone(140, 0.08, 'square', 0.1, 0.8),
  lost: () => [392, 294, 196].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.14, 1, i * 0.12)),
  breach: () => {
    noise(0.4, 0.25);
    tone(70, 0.5, 'square', 0.15, 0.5);
  },
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, 1, i * 0.08)),
  split: () => tone(900, 0.06, 'sine', 0.08, 1.6),
  click: () => tone(500, 0.04, 'triangle', 0.08),
  buy: () => [659, 988].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, 1, i * 0.07)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
