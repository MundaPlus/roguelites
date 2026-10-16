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
  dig: () => {
    noise(0.05, 0.08);
    tone(110 + Math.random() * 40, 0.05, 'square', 0.04);
  },
  crumble: () => {
    noise(0.15, 0.18);
    tone(90, 0.15, 'triangle', 0.1, 0.6);
  },
  ore: () => tone(880 + Math.random() * 200, 0.09, 'triangle', 0.12, 1.3),
  deposit: () => [523, 659, 784].forEach((f, i) => tone(f, 0.1, 'sine', 0.12, 1, i * 0.05)),
  gadget: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.16, 1, i * 0.08)),
  alarm: () => [0, 0.3, 0.6].forEach((d) => tone(660, 0.22, 'square', 0.1, 0.7, d)),
  laser: () => tone(1400 + Math.random() * 300, 0.06, 'sawtooth', 0.03, 0.8),
  sword: () => tone(300, 0.08, 'triangle', 0.06, 2),
  hit: () => tone(240, 0.06, 'square', 0.05, 0.6),
  kill: () => {
    noise(0.12, 0.15);
    tone(320, 0.18, 'triangle', 0.12, 0.4);
  },
  hurt: () => {
    tone(130, 0.25, 'sawtooth', 0.18, 0.5);
    noise(0.12, 0.15);
  },
  shield: () => tone(700, 0.08, 'sine', 0.07, 0.8),
  strike: () => {
    noise(0.6, 0.35);
    tone(80, 0.6, 'sawtooth', 0.25, 0.3);
  },
  jet: () => noise(0.04, 0.03),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  buy: () => [659, 988].forEach((f, i) => tone(f, 0.12, 'triangle', 0.14, 1, i * 0.07)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.15, 1, i * 0.09)),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, 1, i * 0.13)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
