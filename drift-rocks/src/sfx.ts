/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

try {
  muted = localStorage.getItem('drift.mute') === '1';
} catch {
  /* ignore */
}

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function toggleMute(): boolean {
  muted = !muted;
  try {
    localStorage.setItem('drift.mute', muted ? '1' : '0');
  } catch {
    /* ignore */
  }
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

function noise(dur: number, vol: number, lowpass = 2000): void {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export const sfx = {
  shoot: () => tone(880, 0.07, 'square', 0.035, 0.5),
  enemyShoot: () => tone(520, 0.12, 'sawtooth', 0.04, 0.6),
  boom: (size: number) => {
    noise(0.15 + size * 0.12, 0.18 + size * 0.06, 500 + 900 / size);
    tone(120 / size + 40, 0.2 + size * 0.08, 'sine', 0.15, 0.4);
  },
  hit: () => tone(300, 0.04, 'triangle', 0.05, 0.7),
  clink: () => tone(1500, 0.06, 'square', 0.04, 0.9),
  gem: () => tone(1250, 0.07, 'sine', 0.08, 1.5),
  lost: () => {
    noise(0.8, 0.35, 900);
    tone(220, 0.7, 'sawtooth', 0.15, 0.2);
  },
  shield: () => {
    tone(600, 0.2, 'square', 0.08, 0.5);
    noise(0.15, 0.12, 3000);
  },
  shieldUp: () => tone(440, 0.18, 'sine', 0.07, 2),
  hyper: () => tone(200, 0.35, 'sine', 0.12, 6),
  nova: () => {
    tone(80, 0.5, 'sawtooth', 0.15, 3);
    noise(0.4, 0.2, 1500);
  },
  arm: () => tone(1800, 0.05, 'square', 0.05),
  warn: () => [0, 0.18, 0.36].forEach((d) => tone(330, 0.12, 'square', 0.07, 1, d)),
  wave: () => [392, 523, 659].forEach((f, i) => tone(f, 0.14, 'triangle', 0.1, 1, i * 0.08)),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.12, 1, i * 0.08)),
  buy: () => [659, 988].forEach((f, i) => tone(f, 0.12, 'sine', 0.12, 1, i * 0.07)),
  pick: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.13, 1, i * 0.07)),
  deny: () => tone(120, 0.15, 'square', 0.08),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.1, 1, i * 0.18)),
};
