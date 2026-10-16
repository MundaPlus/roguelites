/** Small WebAudio synth. No sound files. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

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
  if (muted) engineStop();
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

function noise(dur: number, vol: number, hp = 0): void {
  if (!ctx || !master || muted) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = vol;
  if (hp > 0) {
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = hp;
    src.connect(f).connect(g).connect(master);
  } else src.connect(g).connect(master);
  src.start();
}

/** Engine hum. `speed` 0..1.4, `on` false fades it out. */
export function engineSet(speed: number, nitro: boolean): void {
  if (!ctx || !master || muted) return;
  if (!engine) {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    gain.gain.value = 0;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(master);
    osc.start();
    osc2.start();
    engine = { osc, osc2, gain, filter };
  }
  const t = ctx.currentTime;
  const f = 45 + speed * 120 + (nitro ? 30 : 0);
  engine.osc.frequency.setTargetAtTime(f, t, 0.05);
  engine.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
  engine.filter.frequency.setTargetAtTime(400 + speed * 900, t, 0.05);
  engine.gain.gain.setTargetAtTime(0.05 + speed * 0.04, t, 0.08);
}

export function engineStop(): void {
  if (!engine || !ctx) return;
  const e = engine;
  engine = null;
  e.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  setTimeout(() => {
    try {
      e.osc.stop();
      e.osc2.stop();
    } catch {
      /* already stopped */
    }
  }, 300);
}

export const sfx = {
  beep: () => tone(440, 0.18, 'square', 0.12),
  go: () => tone(880, 0.4, 'square', 0.14),
  crash: (v: number) => {
    noise(0.18, Math.min(0.35, 0.08 + v / 1500));
    tone(110, 0.15, 'sawtooth', 0.12, 0.5);
  },
  wall: () => {
    noise(0.1, 0.12);
    tone(90, 0.1, 'square', 0.08, 0.6);
  },
  mine: () => {
    noise(0.45, 0.4);
    tone(70, 0.5, 'sawtooth', 0.22, 0.4);
  },
  oil: () => tone(300, 0.3, 'sine', 0.1, 0.4),
  shield: () => tone(700, 0.25, 'triangle', 0.1, 1.6),
  jump: () => tone(250, 0.3, 'triangle', 0.12, 2),
  land: () => noise(0.08, 0.15),
  boost: () => tone(400, 0.25, 'sawtooth', 0.09, 2.5),
  nitro: () => noise(0.25, 0.12, 1500),
  drop: () => tone(200, 0.08, 'square', 0.08, 0.7),
  lap: () => [660, 880].forEach((f, i) => tone(f, 0.15, 'triangle', 0.14, 1, i * 0.1)),
  wreck: () => [300, 200, 120].forEach((f, i) => tone(f, 0.2, 'sawtooth', 0.12, 0.8, i * 0.1)),
  item: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.1)),
  coin: () => tone(1200, 0.08, 'sine', 0.12, 1.5),
  deny: () => tone(120, 0.15, 'square', 0.1),
  click: () => tone(600, 0.04, 'triangle', 0.06),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, 1, i * 0.12)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.12, 1, i * 0.18)),
};
