/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const lastPlay = new Map<string, number>();

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

export const isMuted = (): boolean => muted;

/** True when the sound with this key played less than `gap` seconds ago. Keeps fast waves from getting too loud. */
function busy(key: string, gap: number): boolean {
  if (!ctx) return true;
  const now = ctx.currentTime;
  if ((lastPlay.get(key) ?? -1) > now - gap) return true;
  lastPlay.set(key, now);
  return false;
}

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
  ballista: () => !busy('ballista', 0.06) && tone(520, 0.08, 'triangle', 0.08, 0.6),
  mortar: () => !busy('mortar', 0.1) && tone(140, 0.15, 'square', 0.08, 0.5),
  boom: () => {
    if (busy('boom', 0.08)) return;
    noise(0.3, 0.18);
    tone(80, 0.3, 'sawtooth', 0.12, 0.4);
  },
  frost: () => !busy('frost', 0.1) && tone(1400, 0.12, 'sine', 0.05, 1.4),
  zap: () => {
    if (busy('zap', 0.08)) return;
    tone(900, 0.1, 'sawtooth', 0.06, 0.3);
    noise(0.06, 0.06);
  },
  flame: () => !busy('flame', 0.18) && noise(0.16, 0.05),
  kill: () => !busy('kill', 0.05) && tone(1100 + Math.random() * 300, 0.06, 'sine', 0.07, 1.5),
  leak: () => {
    tone(160, 0.3, 'sawtooth', 0.2, 0.4);
    noise(0.2, 0.2);
  },
  heal: () => !busy('heal', 0.3) && tone(600, 0.15, 'sine', 0.05, 1.3),
  block: () => !busy('block', 0.15) && tone(300, 0.05, 'square', 0.04),
  build: () => {
    tone(330, 0.08, 'square', 0.1);
    tone(495, 0.1, 'triangle', 0.12, 1, 0.07);
  },
  upgrade: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, 1, i * 0.06)),
  sell: () => tone(900, 0.1, 'sine', 0.12, 0.6),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(700, 0.04, 'triangle', 0.06),
  horn: () => {
    tone(220, 0.5, 'sawtooth', 0.1, 1.02);
    tone(330, 0.5, 'sawtooth', 0.07, 1.02, 0.05);
  },
  boss: () => {
    tone(110, 0.9, 'sawtooth', 0.18, 0.7);
    noise(0.6, 0.15, 0.1);
  },
  clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.15, 'triangle', 0.13, 1, i * 0.07)),
  card: () => [659, 988].forEach((f, i) => tone(f, 0.15, 'sine', 0.13, 1, i * 0.08)),
  tile: () => tone(200, 0.25, 'triangle', 0.1, 1.5),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, 1, i * 0.13)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
