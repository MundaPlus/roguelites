/** WebAudio synth and the generated drum and bass loop. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicBus: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.3;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.8;
    musicBus.connect(master);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
}

/** Audio clock in seconds, or null when audio is not running. */
export function audioNow(): number | null {
  return ctx && ctx.state === 'running' ? ctx.currentTime : null;
}

export function toggleMute(): boolean {
  muted = !muted;
  if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.3, ctx.currentTime);
  return muted;
}

export const isMuted = (): boolean => muted;

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 1, at = 0, bus: GainNode | null = master): void {
  if (!ctx || !bus) return;
  const now = Math.max(ctx.currentTime, at || ctx.currentTime);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(bus);
  o.start(now);
  o.stop(now + dur + 0.02);
}

function noise(dur: number, vol: number, at = 0, hp = 0, bus: GainNode | null = master): void {
  if (!ctx || !bus || !noiseBuf) return;
  const now = Math.max(ctx.currentTime, at || ctx.currentTime);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  let node: AudioNode = src;
  if (hp) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    node = src.connect(f);
  }
  node.connect(g).connect(bus);
  src.start(now, Math.random() * 0.5);
  src.stop(now + dur + 0.02);
}

const semi = (root: number, n: number): number => root * Math.pow(2, n / 12);

/**
 * Schedule one beat of the loop at audio time `at`.
 * `beat` counts from 0. Negative beats are the count-in clicks.
 */
export function musicBeat(beat: number, at: number, spb: number, zone: number, root: number, bass: number[]): void {
  if (!ctx || !musicBus) return;
  const bus = musicBus;
  if (beat < 0) {
    tone(beat === -1 ? 1320 : 880, 0.05, 'square', 0.12, 1, at, bus);
    return;
  }
  const inBar = beat % 4;
  // Kick on every beat, snare on 2 and 4.
  tone(150, 0.16, 'sine', 0.55, 0.3, at, bus);
  if (inBar === 1 || inBar === 3) noise(0.12, 0.22, at, 1500, bus);
  // Hi-hats on the off-beats.
  noise(0.03, 0.08, at + spb / 2, 7000, bus);
  if (zone >= 2) noise(0.02, 0.05, at + spb / 4, 8000, bus);
  // Bass line.
  const n = bass[beat % bass.length];
  tone(semi(root, n), spb * 0.8, 'sawtooth', 0.13, 1, at, bus);
  tone(semi(root, n + 12), spb * 0.35, 'triangle', 0.06, 1, at + spb / 2, bus);
  // A simple lead arpeggio from zone 2 on, every second bar.
  if (zone >= 1 && Math.floor(beat / 4) % 2 === 1) {
    const arp = [0, 7, 12, 15];
    tone(semi(root * 4, n + arp[inBar]), spb * 0.3, 'square', 0.03, 1, at, bus);
  }
}

export const sfx = {
  step: () => tone(220, 0.04, 'triangle', 0.05),
  swing: () => noise(0.06, 0.12, 0, 3000),
  hit: () => {
    tone(260, 0.1, 'square', 0.1, 0.5);
    noise(0.06, 0.12);
  },
  kill: () => {
    tone(520, 0.08, 'square', 0.1, 1.6);
    tone(780, 0.1, 'triangle', 0.1, 1, (ctx?.currentTime ?? 0) + 0.05);
  },
  hurt: () => {
    tone(140, 0.28, 'sawtooth', 0.22, 0.4);
    noise(0.15, 0.2);
  },
  shield: () => tone(700, 0.12, 'square', 0.08, 0.8),
  dig: () => noise(0.09, 0.16, 0, 400),
  clink: () => tone(1500, 0.05, 'square', 0.05),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  gem: () => [1047, 1319, 1568].forEach((f, i) => tone(f, 0.1, 'sine', 0.1, 1, (ctx?.currentTime ?? 0) + i * 0.05)),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'triangle', 0.15, 1, (ctx?.currentTime ?? 0) + i * 0.08)),
  deny: () => tone(120, 0.15, 'square', 0.1),
  miss: () => tone(90, 0.1, 'square', 0.06),
  fuse: () => noise(0.2, 0.06, 0, 5000),
  boom: () => {
    noise(0.45, 0.35);
    tone(80, 0.45, 'sawtooth', 0.22, 0.4);
  },
  spell: () => tone(400, 0.3, 'sine', 0.15, 3),
  summon: () => tone(300, 0.25, 'triangle', 0.1, 0.5),
  warn: () => tone(880, 0.12, 'square', 0.08, 0.7),
  charge: () => noise(0.2, 0.15, 0, 800),
  unlock: () => [392, 523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.14, 1, (ctx?.currentTime ?? 0) + i * 0.07)),
  stairs: () => tone(600, 0.3, 'sine', 0.12, 0.4),
  tap: () => tone(1000, 0.04, 'sine', 0.08),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, (ctx?.currentTime ?? 0) + i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, (ctx?.currentTime ?? 0) + i * 0.18)),
};

export type SfxName = keyof typeof sfx;
