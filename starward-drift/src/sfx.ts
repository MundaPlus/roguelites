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

/** Rate limit, so a burst of events does not stack 20 sounds. */
const last = new Map<string, number>();
function gate(key: string, gap: number): boolean {
  const now = performance.now();
  if ((last.get(key) ?? 0) + gap > now) return false;
  last.set(key, now);
  return true;
}

export const sfx = {
  laser: () => gate('laser', 60) && tone(1400, 0.12, 'square', 0.06, 0.3),
  missile: () => {
    if (!gate('missile', 80)) return;
    noise(0.35, 0.12);
    tone(220, 0.35, 'sawtooth', 0.06, 2);
  },
  beam: () => gate('beam', 100) && tone(320, 0.45, 'sawtooth', 0.08, 1.6),
  ion: () => gate('ion', 80) && tone(600, 0.25, 'sine', 0.12, 0.5),
  hit: () => {
    if (!gate('hit', 50)) return;
    noise(0.3, 0.3);
    tone(120, 0.3, 'sawtooth', 0.15, 0.4);
  },
  hurt: () => {
    if (!gate('hurt', 60)) return;
    noise(0.4, 0.4);
    tone(80, 0.45, 'square', 0.18, 0.5);
  },
  block: () => gate('block', 50) && tone(900, 0.15, 'triangle', 0.1, 0.6),
  miss: () => gate('miss', 50) && tone(500, 0.12, 'sine', 0.06, 1.5),
  fire: () => gate('fire', 200) && noise(0.5, 0.12),
  death: () => tone(300, 0.6, 'triangle', 0.15, 0.3),
  fixed: () => gate('fixed', 120) && tone(880, 0.08, 'triangle', 0.08, 1.2),
  power: (up: boolean) => tone(up ? 520 : 360, 0.07, 'square', 0.06, up ? 1.3 : 0.75),
  click: () => tone(700, 0.05, 'triangle', 0.06),
  deny: () => tone(120, 0.15, 'square', 0.1),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  jump: () => {
    tone(150, 0.9, 'sawtooth', 0.12, 6);
    noise(0.6, 0.08, 0.3);
  },
  boom: () => {
    noise(1.2, 0.5);
    tone(60, 1.2, 'sawtooth', 0.25, 0.3);
  },
  alarm: () => gate('alarm', 1500) && [0, 0.25].forEach((d) => tone(660, 0.18, 'square', 0.06, 0.8, d)),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
