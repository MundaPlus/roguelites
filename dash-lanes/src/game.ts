/** Pure game core: track generation, runner physics, collisions, pickups, power-ups and bosses. */
import { BOSSES, CHUNKS, POWERS, ROW, type BossDef, type ChunkDef, type PwId, type StrikeKind, type ZoneDef } from './data';
import { Rng } from './rng';

export type Action = 'left' | 'right' | 'jump' | 'slide';
export type ObKind = 'barrier' | 'bar' | 'wall' | 'train' | 'oncoming' | 'shifter';

/** Modifiers from perks, the runner and the zone. */
export interface Mods {
  jumps: number;
  magnetMul: number;
  passive: number;
  rampMul: number;
  grav: number;
  laneSpeed: number;
  buffer: number;
  durMul: number;
  luck: number;
  coinValue: number;
  scoreMul: number;
  guard: boolean;
}

export const PHYS = {
  jumpV: 9.2,
  gravity: 28,
  slideDur: 0.62,
  laneSpeed: 9,
  buffer: 0.16,
  standH: 1.7,
  slideH: 0.75,
  halfZ: 0.35,
  halfX: 0.15,
  jetY: 4.6,
};

export const SPEED = { base: 13, ramp: 0.0052, max: 34 };

export interface Obstacle {
  id: number;
  kind: ObKind;
  lane: number;
  z: number;
  len: number;
  vz: number;
  y0: number;
  y1: number;
  hw: number;
  /** Shifter: the other lane, the period and the phase. */
  to: number;
  period: number;
  phase: number;
  /** Game time when it was smashed, or -1. */
  dead: number;
  /** The chunk that placed it. */
  chunk: string;
}

export interface Coin {
  lane: number;
  z: number;
  y: number;
  got: boolean;
  pull: number;
}

export interface Item {
  kind: PwId;
  lane: number;
  z: number;
  got: boolean;
}

export interface Strike {
  kind: StrikeKind;
  lanes: number[];
  /** Time of the hit. */
  at: number;
  dur: number;
  start: number;
  hit: boolean;
  live: boolean;
  done: boolean;
}

export interface Runner {
  lane: number;
  prev: number;
  x: number;
  y: number;
  vy: number;
  air: boolean;
  jumps: number;
  slide: number;
  slideQ: boolean;
  buf: { a: Action; t: number }[];
  bump: number;
  inv: number;
  jet: number;
}

export interface Boss {
  def: BossDef;
  next: number;
  fired: number;
  down: boolean;
}

export type GameEvent =
  | { type: 'jump' | 'djump' | 'slide' | 'lane' | 'land' | 'bump' | 'crash' | 'shield' | 'hit' | 'tele' | 'zap' | 'stageEnd' }
  | { type: 'coin'; n: number; lane: number }
  | { type: 'power'; kind: PwId }
  | { type: 'dodge'; pts: number }
  | { type: 'bossDown'; pts: number }
  | { type: 'smash'; o: Obstacle };

export interface Pw {
  magnet: number;
  shield: number;
  boost: number;
}

export interface Game {
  stage: number;
  zone: ZoneDef;
  len: number;
  /** Total run distance at the start of this stage. */
  base: number;
  dist: number;
  time: number;
  speed: number;
  obstacles: Obstacle[];
  coins: Coin[];
  items: Item[];
  strikes: Strike[];
  genZ: number;
  rng: Rng;
  r: Runner;
  pw: Pw;
  hits: number;
  coinsGot: number;
  score: number;
  state: 'run' | 'crash' | 'done';
  crashT: number;
  boss: Boss | null;
  mods: Mods;
  ev: GameEvent[];
  nextId: number;
  lastChunk: string;
  /** Difficulty level added for endless stages. */
  extra: number;
  killer: string;
}

export function newRunner(): Runner {
  return { lane: 0, prev: 0, x: 0, y: 0, vy: 0, air: false, jumps: 0, slide: 0, slideQ: false, buf: [], bump: 0, inv: 0, jet: 0 };
}

export function cloneRunner(r: Runner): Runner {
  return { ...r, buf: r.buf.map((b) => ({ ...b })) };
}

export interface GameSetup {
  stage: number;
  zone: ZoneDef;
  len: number;
  base: number;
  boss: string | null;
  seed: number;
  mods: Mods;
  hits: number;
  score: number;
  extra: number;
  startJet: boolean;
}

export function createGame(s: GameSetup): Game {
  const g: Game = {
    stage: s.stage,
    zone: s.boss ? BOSSES[s.boss].zone : s.zone,
    len: s.len,
    base: s.base,
    dist: 0,
    time: 0,
    speed: 0,
    obstacles: [],
    coins: [],
    items: [],
    strikes: [],
    genZ: 45,
    rng: new Rng(s.seed),
    r: newRunner(),
    pw: { magnet: 0, shield: s.mods.guard ? 99 : 0, boost: 0 },
    hits: s.hits,
    coinsGot: 0,
    score: s.score,
    state: 'run',
    crashT: 0,
    boss: s.boss ? { def: BOSSES[s.boss], next: 3, fired: 0, down: false } : null,
    mods: s.mods,
    ev: [],
    nextId: 1,
    lastChunk: '',
    extra: s.extra,
    killer: '',
  };
  g.speed = speedAt(g);
  for (let z = 14; z < 42; z += 2.5) g.coins.push({ lane: 0, z, y: 0.6, got: false, pull: 0 });
  if (s.startJet) activate(g, 'jet');
  generate(g);
  return g;
}

export function speedAt(g: Game): number {
  const total = g.base + g.dist;
  return Math.min(SPEED.max, (SPEED.base + SPEED.ramp * total * g.mods.rampMul) * g.zone.speedMul);
}

// ---------- Track generation ----------

function target(g: Game): number {
  const t = 1.3 + g.stage * 0.85 + (g.dist / g.len) * 0.7 + g.zone.diff + g.extra;
  return Math.max(1, Math.min(5.2, g.boss ? Math.min(t, 2.4) : t));
}

function pickChunk(g: Game): ChunkDef {
  const tg = target(g);
  const items: [ChunkDef, number][] = [];
  for (const c of CHUNKS) {
    const w = g.zone.mix[c.tag] ?? 0;
    if (!w || c.id === g.lastChunk) continue;
    if (g.boss && (c.tag === 'oncoming' || c.tag === 'shifter' || c.tag === 'mixed')) continue;
    items.push([c, w * Math.exp(-((c.d - tg) ** 2) / 1.1)]);
  }
  return g.rng.weighted(items);
}

const DIMS: Record<ObKind, { y0: number; y1: number; hw: number; len: number }> = {
  barrier: { y0: 0, y1: 0.9, hw: 0.42, len: 0.6 },
  bar: { y0: 1.05, y1: 1.9, hw: 0.45, len: 0.5 },
  wall: { y0: 0, y1: 2.8, hw: 0.42, len: 1.5 },
  train: { y0: 0, y1: 3.2, hw: 0.42, len: 0 },
  oncoming: { y0: 0, y1: 3.2, hw: 0.42, len: 0 },
  shifter: { y0: 0, y1: 1.6, hw: 0.38, len: 2.2 },
};

function addOb(g: Game, kind: ObKind, lane: number, z: number, len?: number): Obstacle {
  const d = DIMS[kind];
  const o: Obstacle = {
    id: g.nextId++,
    kind,
    lane,
    z,
    len: len ?? d.len,
    vz: kind === 'oncoming' ? -7 : 0,
    y0: d.y0,
    y1: d.y1,
    hw: d.hw,
    to: lane,
    period: 2.8,
    phase: 0,
    dead: -1,
    chunk: g.lastChunk,
  };
  if (kind === 'shifter') {
    o.to = lane === 0 ? (g.rng.chance(0.5) ? -1 : 1) : 0;
    o.phase = g.rng.next();
    o.period = 2.4 + g.rng.next() * 0.8;
  }
  if (kind === 'oncoming') {
    // Place it so that it meets the runner near its chunk row.
    const meet = Math.max(0, z - g.dist);
    o.z = z + (meet / Math.max(8, g.speed)) * 7;
  }
  g.obstacles.push(o);
  return o;
}

function addCoins(g: Game, lane: number, z: number, n: number, step = 2): void {
  for (let i = 0; i < n; i++) g.coins.push({ lane, z: z + i * step, y: 0.6, got: false, pull: 0 });
}

function pickPower(g: Game): PwId {
  return g.rng.weighted(Object.values(POWERS).map((p) => [p.id, p.weight] as [PwId, number]));
}

function placeChunk(g: Game, c: ChunkDef, z0: number, mirror: boolean): void {
  for (let L = 0; L < 3; L++) {
    const lane = mirror ? 1 - L : L - 1;
    for (let i = 0; i < c.rows.length; i++) {
      const ch = c.rows[i][L];
      const z = z0 + i * ROW;
      if (ch === 't' || ch === 'o') {
        let k = 1;
        while (i + k < c.rows.length && c.rows[i + k][L] === ch) k++;
        addOb(g, ch === 't' ? 'train' : 'oncoming', lane, z, k * ROW - 0.6);
        i += k - 1;
      } else if (ch === 'b') addOb(g, 'barrier', lane, z);
      else if (ch === 'B') {
        addOb(g, 'barrier', lane, z);
        [-4, -2, 0, 2, 4].forEach((dz, k) => g.coins.push({ lane, z: z + 0.3 + dz, y: [0.9, 1.6, 1.9, 1.6, 0.9][k], got: false, pull: 0 }));
      } else if (ch === 'h') addOb(g, 'bar', lane, z);
      else if (ch === 'w') addOb(g, 'wall', lane, z);
      else if (ch === 's') addOb(g, 'shifter', lane, z);
      else if (ch === 'c') addCoins(g, lane, z, 2);
      else if (ch === 'p') {
        if (g.rng.chance(Math.min(0.9, 0.45 * g.mods.luck * g.zone.luck))) g.items.push({ kind: pickPower(g), lane, z: z + 1, got: false });
        else addCoins(g, lane, z, 2);
      }
    }
  }
}

function generate(g: Game): void {
  const end = g.len - 45;
  while (g.genZ < Math.min(g.dist + 190, end)) {
    const c = pickChunk(g);
    const size = c.rows.length * ROW;
    if (g.genZ + size > end) {
      addCoins(g, g.rng.int(-1, 1), g.genZ, Math.floor((end - g.genZ) / 2.5), 2.5);
      g.genZ = end;
      break;
    }
    g.lastChunk = c.id;
    placeChunk(g, c, g.genZ, g.rng.chance(0.5));
    g.genZ += size;
    // The join gap scales with speed: at least 0.55 s between two chunks.
    const gap = Math.max(ROW * 2, g.speed * 0.55) * (g.boss ? 1.6 : 1);
    if (g.rng.chance(0.07 * g.mods.luck * g.zone.luck)) g.items.push({ kind: pickPower(g), lane: g.rng.int(-1, 1), z: g.genZ + gap / 2, got: false });
    else if (g.rng.chance(0.6)) addCoins(g, g.rng.int(-1, 1), g.genZ + 3, Math.floor((gap - 4) / 2.5), 2.5);
    g.genZ += gap;
  }
}

// ---------- Runner ----------

function tryAction(r: Runner, a: Action, m: Mods, ev: GameEvent[] | null): boolean {
  if (a === 'left' || a === 'right') {
    const n = r.lane + (a === 'left' ? -1 : 1);
    if (n < -1 || n > 1) return true;
    r.prev = r.lane;
    r.lane = n;
    ev?.push({ type: 'lane' });
    return true;
  }
  if (r.jet > 0) return true;
  if (a === 'jump') {
    if (!r.air) {
      r.vy = PHYS.jumpV;
      r.air = true;
      r.jumps = 1;
      r.slide = 0;
      r.slideQ = false;
      ev?.push({ type: 'jump' });
      return true;
    }
    if (r.jumps <= m.jumps) {
      r.vy = PHYS.jumpV * 0.92;
      r.jumps++;
      r.slideQ = false;
      ev?.push({ type: 'djump' });
      return true;
    }
    return false;
  }
  // slide
  if (r.air) {
    r.vy = Math.min(r.vy, -PHYS.jumpV * 1.35);
    r.slideQ = true;
    return true;
  }
  if (r.slide <= 0) ev?.push({ type: 'slide' });
  r.slide = PHYS.slideDur;
  return true;
}

/** One physics step of the runner. Shared by the game and the bot's lookahead. */
export function stepRunner(r: Runner, m: Mods, laneMul: number, dt: number, acts: Action[] | null, ev: GameEvent[] | null): void {
  if (acts) {
    for (const a of acts) {
      // The newest vertical input wins: a jump drops a buffered slide and the other way round.
      if (a === 'jump' || a === 'slide') r.buf = r.buf.filter((b) => b.a !== 'jump' && b.a !== 'slide');
      r.buf.push({ a, t: m.buffer });
    }
  }
  if (r.buf.length) {
    const keep: { a: Action; t: number }[] = [];
    for (const b of r.buf) {
      if (!tryAction(r, b.a, m, ev)) {
        b.t -= dt;
        if (b.t > 0) keep.push(b);
      }
    }
    r.buf = keep;
  }
  const ls = m.laneSpeed * laneMul * dt;
  if (r.x < r.lane) r.x = Math.min(r.lane, r.x + ls);
  else if (r.x > r.lane) r.x = Math.max(r.lane, r.x - ls);
  if (r.jet > 0) {
    r.jet -= dt;
    r.y += (PHYS.jetY - r.y) * Math.min(1, dt * 4);
    r.vy = 0;
    r.air = true;
    r.slide = 0;
    if (r.jet <= 0) {
      r.jet = 0;
      r.inv = Math.max(r.inv, 1.1);
    }
  } else if (r.air) {
    r.vy -= PHYS.gravity * m.grav * dt;
    r.y += r.vy * dt;
    if (r.y <= 0) {
      r.y = 0;
      r.vy = 0;
      r.air = false;
      r.jumps = 0;
      ev?.push({ type: 'land' });
      if (r.slideQ) {
        r.slideQ = false;
        r.slide = PHYS.slideDur;
        ev?.push({ type: 'slide' });
      }
    }
  }
  if (r.slide > 0) r.slide = Math.max(0, r.slide - dt);
  if (r.bump > 0) r.bump -= dt;
  if (r.inv > 0) r.inv -= dt;
}

export function obX(o: Obstacle, time: number): number {
  if (o.kind !== 'shifter') return o.lane;
  const u = (time / o.period + o.phase) % 1;
  const tri = u < 0.5 ? u * 2 : 2 - u * 2;
  const k = Math.max(0, Math.min(1, (tri - 0.2) / 0.6));
  const s = k * k * (3 - 2 * k);
  return o.lane + (o.to - o.lane) * s;
}

export interface Hit {
  o: Obstacle | null;
  s: Strike | null;
  bump: boolean;
}

const LONG: Record<ObKind, boolean> = { train: true, oncoming: true, wall: true, barrier: false, bar: false, shifter: false };

/** What the runner `r` at distance `rz` hits `t` seconds from now, or null. */
export function probe(g: Game, r: Runner, rz: number, t: number, near: Obstacle[] = g.obstacles, pad = 0): Hit | null {
  if (r.jet > 0 || r.inv > 0) return null;
  const h = r.slide > 0 ? PHYS.slideH : PHYS.standH;
  const time = g.time + t;
  for (const o of near) {
    if (o.dead >= 0) continue;
    const z0 = o.z + o.vz * t;
    if (z0 > rz + PHYS.halfZ + pad || z0 + o.len < rz - PHYS.halfZ - pad) continue;
    const ox = obX(o, time);
    if (Math.abs(r.x - ox) >= o.hw + PHYS.halfX + pad * 0.1) continue;
    if (o.y0 >= r.y + h + pad * 0.2 || o.y1 <= r.y - pad * 0.2) continue;
    const alongside = LONG[o.kind] && z0 + 0.9 < rz && r.prev !== r.lane && Math.abs(r.x - r.lane) > 0.02;
    if (alongside && r.bump > 0) continue;
    return { o, s: null, bump: alongside };
  }
  for (const s of g.strikes) {
    if (s.hit || time < s.at - pad * 0.2 || time > s.at + s.dur + pad * 0.2) continue;
    let hit = false;
    if (s.kind === 'slam') hit = r.y < 0.35;
    else if (s.kind === 'sweep') hit = r.y + h > 1.0 && r.y < 2.3;
    else hit = s.lanes.some((l) => Math.abs(r.x - l) < 0.5);
    if (hit) return { o: null, s, bump: false };
  }
  return null;
}

// ---------- Power-ups ----------

export function activate(g: Game, k: PwId): void {
  const dur = POWERS[k].dur * g.mods.durMul;
  if (k === 'jet') {
    g.r.jet = Math.max(g.r.jet, dur);
    g.r.slide = 0;
    // A wavy coin trail in the air.
    const n = Math.floor((g.speed * dur) / 3);
    for (let i = 0; i < n; i++) {
      const lane = Math.round(Math.sin(i / 5)) as number;
      g.coins.push({ lane, z: g.dist + 12 + i * 3, y: PHYS.jetY + 0.5, got: false, pull: 0 });
    }
  } else g.pw[k] = Math.max(g.pw[k], dur);
  g.ev.push({ type: 'power', kind: k });
}

// ---------- Boss ----------

function fireStrike(g: Game, b: Boss): void {
  const kind = g.rng.weighted(b.def.attacks);
  const tele = b.def.tele;
  const at = g.time + tele;
  const rl = g.r.lane;
  let lanes: number[];
  if (kind === 'beam') lanes = [g.rng.chance(0.7) ? rl : g.rng.int(-1, 1)];
  else if (kind === 'beam2') {
    const other = g.rng.pick([-1, 0, 1].filter((l) => l !== rl));
    lanes = [rl, other];
  } else lanes = [-1, 0, 1];
  const s: Strike = { kind: kind === 'beam2' ? 'beam' : kind, lanes, at, dur: kind === 'beam' || kind === 'beam2' ? 0.35 : 0.2, start: g.time, hit: false, live: false, done: false };
  g.strikes.push(s);
  // Keep it fair: clear obstacles that would make the strike impossible to dodge.
  const zHit = g.dist + g.speed * tele;
  for (const o of g.obstacles) {
    if (o.dead >= 0) continue;
    // Lane blockers from beside the runner to well past the hit point, so a safe lane is always reachable.
    // Every obstacle close to the hit point, so the dodge never needs a second move at the same moment.
    const after = zHit + g.speed * 0.9;
    if (o.z > after || o.z + o.len < g.dist - 1) continue;
    const nearHit = o.z + o.len > zHit - g.speed * 0.6;
    const clear = o.kind === 'shifter' || LONG[o.kind] || nearHit;
    if (clear) {
      o.dead = g.time;
      g.ev.push({ type: 'smash', o });
    }
  }
  b.fired++;
  const p = Math.min(1, g.dist / g.len);
  b.next = g.time + b.def.interval[0] + (b.def.interval[1] - b.def.interval[0]) * p;
  g.ev.push({ type: 'tele' });
}

function updateBoss(g: Game): void {
  const b = g.boss!;
  if (!b.down && g.dist < g.len - 90 && g.time >= b.next) fireStrike(g, b);
  if (!b.down && g.dist >= g.len - 70 && g.strikes.every((s) => s.done)) {
    b.down = true;
    const pts = 500;
    g.score += pts;
    g.ev.push({ type: 'bossDown', pts });
  }
  for (const s of g.strikes) {
    if (!s.live && g.time >= s.at) {
      s.live = true;
      g.ev.push({ type: 'zap' });
    }
    if (!s.done && g.time > s.at + s.dur) {
      s.done = true;
      if (!s.hit) {
        g.score += 40;
        g.ev.push({ type: 'dodge', pts: 40 });
      }
    }
  }
  g.strikes = g.strikes.filter((s) => !s.done || g.time < s.at + s.dur + 0.6);
}

// ---------- Main update ----------

function smash(g: Game, h: Hit): void {
  if (h.o) {
    h.o.dead = g.time;
    g.ev.push({ type: 'smash', o: h.o });
  }
  if (h.s) h.s.hit = true;
}

export function update(g: Game, dt: number, acts: Action[] | null): void {
  if (g.state === 'crash') {
    g.crashT += dt;
    return;
  }
  if (g.state !== 'run') return;
  const m = g.mods;
  const r = g.r;
  g.time += dt;
  g.speed = speedAt(g);
  stepRunner(r, m, g.zone.laneMul, dt, acts, g.ev);
  const d = g.speed * dt;
  g.dist += d;
  g.score += d * m.scoreMul * g.zone.scoreMul * (g.pw.boost > 0 ? 2 : 1);
  for (const o of g.obstacles) if (o.vz) o.z += o.vz * dt;

  const h = probe(g, r, g.dist, 0);
  if (h) {
    if (h.bump) {
      const back = r.prev;
      r.prev = r.lane;
      r.lane = back;
      r.bump = 0.35;
      g.ev.push({ type: 'bump' });
    } else if (g.pw.shield > 0) {
      g.pw.shield = 0;
      r.inv = 1;
      smash(g, h);
      g.ev.push({ type: 'shield' });
    } else if (g.hits > 0) {
      g.hits--;
      r.inv = 1.4;
      smash(g, h);
      g.ev.push({ type: 'hit' });
    } else {
      if (h.s) h.s.hit = true;
      g.killer = h.o ? `${h.o.kind}@${h.o.chunk}` : `strike-${h.s!.kind}`;
      g.state = 'crash';
      g.ev.push({ type: 'crash' });
      return;
    }
  }

  // Coins and power-ups.
  const rz = g.dist;
  const bodyH = r.slide > 0 ? PHYS.slideH : PHYS.standH;
  const range = g.pw.magnet > 0 ? 16 * m.magnetMul : 0;
  for (const c of g.coins) {
    if (c.got) continue;
    const dz = c.z - rz;
    if (dz < -3 && c.pull === 0) continue;
    if (c.pull > 0 || (range && dz < range && dz > -1) || (m.passive && dz < 2 + m.passive * 2 && dz > -1 && Math.abs(c.lane - r.x) < 1.3 && Math.abs(c.y - r.y) < 2.5)) {
      c.pull = Math.min(1, c.pull + dt * 6);
      if (c.pull >= 1) {
        c.got = true;
        g.coinsGot += m.coinValue;
        g.score += 10 * m.coinValue;
        g.ev.push({ type: 'coin', n: m.coinValue, lane: c.lane });
      }
    } else if (Math.abs(c.lane - r.x) < 0.45 && Math.abs(dz) < 1 && c.y > r.y - 0.4 && c.y < r.y + bodyH + 0.4) {
      c.got = true;
      g.coinsGot += m.coinValue;
      g.score += 10 * m.coinValue;
      g.ev.push({ type: 'coin', n: m.coinValue, lane: c.lane });
    }
  }
  for (const it of g.items) {
    if (it.got) continue;
    if (Math.abs(it.lane - r.x) < 0.5 && Math.abs(it.z - rz) < 1.2 && r.y < 2.5) {
      it.got = true;
      activate(g, it.kind);
    }
  }
  g.pw.magnet = Math.max(0, g.pw.magnet - dt);
  g.pw.boost = Math.max(0, g.pw.boost - dt);
  if (g.pw.shield > 0 && g.pw.shield < 90) g.pw.shield = Math.max(0, g.pw.shield - dt);

  if (g.boss) updateBoss(g);

  generate(g);
  if (g.obstacles.length > 60) g.obstacles = g.obstacles.filter((o) => o.z + o.len > rz - 12);
  if (g.coins.length > 200) g.coins = g.coins.filter((c) => !c.got && c.z > rz - 6);
  if (g.items.length > 20) g.items = g.items.filter((i) => !i.got && i.z > rz - 6);

  if (g.dist >= g.len) {
    g.state = 'done';
    g.ev.push({ type: 'stageEnd' });
  }
}
