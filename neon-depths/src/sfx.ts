/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
const last: Record<string, number> = {};

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

type Wave = OscillatorType;

function tone(freq: number, dur: number, type: Wave, vol: number, slide = 0, minGap = 0.03, key = `${freq}${type}`): void {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime;
  if (now - (last[key] ?? -1) < minGap) return;
  last[key] = now;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, now);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), now + dur);
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(master);
  o.start(now);
  o.stop(now + dur + 0.02);
}

function noise(dur: number, vol: number, key: string, minGap = 0.05): void {
  if (!ctx || !master || muted) return;
  const now = ctx.currentTime;
  if (now - (last[key] ?? -1) < minGap) return;
  last[key] = now;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g).connect(master);
  src.start(now);
}

export const sfx = {
  shoot: () => tone(880, 0.05, 'square', 0.04, 0.5, 0.06, 'shoot'),
  hit: () => tone(220, 0.06, 'triangle', 0.12, 0.6, 0.03, 'hit'),
  kill: () => tone(330, 0.12, 'sawtooth', 0.1, 0.3, 0.04, 'kill'),
  hurt: () => {
    tone(160, 0.25, 'sawtooth', 0.25, 0.4, 0.1, 'hurt');
    noise(0.15, 0.2, 'hurtn');
  },
  dodge: () => tone(500, 0.12, 'sine', 0.1, 2, 0.1, 'dodge'),
  boom: () => noise(0.4, 0.4, 'boom', 0.08),
  pickup: () => tone(1200, 0.08, 'sine', 0.12, 1.5, 0.04, 'pickup'),
  item: () => {
    tone(523, 0.15, 'triangle', 0.2, 1, 0, 'i1');
    setTimeout(() => tone(659, 0.15, 'triangle', 0.2, 1, 0, 'i2'), 110);
    setTimeout(() => tone(784, 0.3, 'triangle', 0.2, 1, 0, 'i3'), 220);
  },
  door: () => tone(140, 0.2, 'square', 0.08, 0.7, 0.1, 'door'),
  zap: () => tone(1600, 0.08, 'sawtooth', 0.06, 0.3, 0.05, 'zap'),
  enemyShot: () => tone(600, 0.06, 'triangle', 0.03, 0.7, 0.08, 'eshot'),
  deny: () => tone(120, 0.15, 'square', 0.1, 1, 0.15, 'deny'),
};
