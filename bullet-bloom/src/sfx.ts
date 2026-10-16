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
    master.gain.value = 0.22;
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
  shot: () => tone(1400, 0.03, 'square', 0.012, 0.6),
  hit: () => tone(520, 0.03, 'triangle', 0.03, 0.7),
  kill: () => {
    tone(660, 0.08, 'triangle', 0.1, 1.6);
    noise(0.06, 0.06);
  },
  big: () => {
    tone(110, 0.4, 'sawtooth', 0.16, 0.4);
    noise(0.3, 0.2);
  },
  graze: () => tone(2400, 0.025, 'sine', 0.05),
  item: () => tone(1200, 0.04, 'sine', 0.05, 1.3),
  bomb: () => {
    noise(0.6, 0.3);
    tone(70, 0.7, 'sawtooth', 0.22, 0.5);
    [523, 784, 1047].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, 1, 0.1 + i * 0.06));
  },
  die: () => {
    tone(600, 0.5, 'sawtooth', 0.2, 0.15);
    noise(0.4, 0.25);
  },
  spell: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.18, 'square', 0.06, 1, i * 0.05)),
  capture: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, 1, i * 0.07)),
  bombUp: () => [659, 988].forEach((f, i) => tone(f, 0.15, 'sine', 0.14, 1, i * 0.08)),
  shield: () => tone(900, 0.25, 'square', 0.08, 0.5),
  phase: () => {
    noise(0.25, 0.15);
    tone(220, 0.3, 'triangle', 0.12, 2);
  },
  clear: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, 1, i * 0.1)),
  pick: () => [523, 659, 784].forEach((f, i) => tone(f, 0.15, 'triangle', 0.14, 1, i * 0.07)),
  click: () => tone(700, 0.05, 'triangle', 0.08),
  deny: () => tone(140, 0.15, 'square', 0.1),
  win: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.16, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
