/** Pure-ish game simulation. `tick` advances one fixed step. All state is plain JSON (except the explored map). */
import {
  CHARS,
  CREATURES,
  DAY,
  DT,
  INV_SIZE,
  ITEMS,
  MAP,
  NODES,
  PARTS,
  RECIPES,
  SEASONS,
  SEASON_DAYS,
  SEASON_DEFS,
  STRUCTS,
  type Season,
  type Slot,
} from './data';
import { generate, idx, inMap, reach, type Node, type World } from './world';

export interface Stack {
  id: string;
  n: number;
  /** Freshness 0..1 for food. */
  f?: number;
  /** Durability left (uses, hit points or seconds). */
  d?: number;
}

export interface Creature {
  id: number;
  k: string;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  max: number;
  st: 'idle' | 'wander' | 'chase' | 'flee' | 'sleep' | 'windup' | 'home';
  tx: number;
  ty: number;
  t: number;
  cd: number;
  angry: boolean;
  flash: number;
  /** Spawner node id, or 0. */
  from: number;
  hx: number;
  hy: number;
  hunt?: boolean;
  /** Wind-up target for area attacks. */
  wx?: number;
  wy?: number;
  wind?: number;
  face: number;
}

export interface Struct {
  id: number;
  k: string;
  x: number;
  y: number;
  fuel: number;
  parts?: string[];
  caught?: number;
  hang?: { id: string; t: number }[];
}

export interface Drop {
  id: number;
  s: Stack;
  x: number;
  y: number;
}

export type GoalKind = 'node' | 'creature' | 'struct' | 'drop' | 'pos';
export interface Goal {
  kind: GoalKind;
  id: number;
  x: number;
  y: number;
}

export interface Player {
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  hunger: number;
  san: number;
  temp: number;
  maxHp: number;
  maxHunger: number;
  maxSan: number;
  inv: (Stack | null)[];
  eq: Record<Slot, Stack | null>;
  goal: Goal | null;
  path: number[];
  pathT: number;
  work: number;
  atk: number;
  dark: number;
  face: number;
  hurt: number;
  moving: boolean;
  swing: number;
}

export type Ev =
  | { k: 'float'; x: number; y: number; text: string; color: string }
  | { k: 'sfx'; name: string }
  | { k: 'toast'; text: string }
  | { k: 'shake'; n: number }
  | { k: 'craft' }
  | { k: 'dawn' }
  | { k: 'ring'; x: number; y: number; r: number; color: string };

export interface Game {
  v: 1;
  seed: number;
  char: string;
  time: number;
  rs: number;
  uid: number;
  w: World;
  cre: Creature[];
  st: Struct[];
  drops: Drop[];
  p: Player;
  kills: number;
  bossKills: number;
  crafted: number;
  over: null | 'win' | 'dead';
  cause: string;
  winT: number;
  bosses: string[];
  nextWave: number;
  lastDay: number;
  lastPhase: Phase;
  sec: number;
  seen: Uint8Array;
  warned: Record<string, number>;
  ev: Ev[];
}

export type Phase = 'day' | 'dusk' | 'night';

// ---------------- Random ----------------

export function rnd(g: Game): number {
  g.rs = (g.rs + 0x6d2b79f5) | 0;
  let t = g.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const rint = (g: Game, a: number, b: number): number => a + Math.floor(rnd(g) * (b - a + 1));

// ---------------- Clock ----------------

export const dayNum = (g: Game): number => Math.floor(g.time / DAY) + 1;
export const dayFrac = (g: Game): number => (g.time % DAY) / DAY;
export const year = (g: Game): number => Math.floor((dayNum(g) - 1) / (SEASON_DAYS * 4));
export const seasonOf = (g: Game): Season => SEASONS[Math.floor((dayNum(g) - 1) / SEASON_DAYS) % 4];
export const seasonDay = (g: Game): number => ((dayNum(g) - 1) % SEASON_DAYS) + 1;

export function phase(g: Game): Phase {
  const s = SEASON_DEFS[seasonOf(g)];
  const f = dayFrac(g);
  return f < s.dayEnd ? 'day' : f < s.duskEnd ? 'dusk' : 'night';
}

/** Darkness alpha 0..0.95. */
export function darkness(g: Game): number {
  const s = SEASON_DEFS[seasonOf(g)];
  const f = dayFrac(g);
  if (f < 0.03) return 0.6 * (1 - f / 0.03);
  if (f < s.dayEnd) return 0;
  if (f < s.duskEnd) return 0.6 * ((f - s.dayEnd) / (s.duskEnd - s.dayEnd));
  const n = (f - s.duskEnd) / 0.04;
  return Math.min(0.95, 0.6 + 0.35 * Math.min(1, n));
}

export function airTemp(g: Game): number {
  const s = SEASON_DEFS[seasonOf(g)];
  const ph = phase(g);
  let t = ph === 'day' ? s.temp[0] : ph === 'dusk' ? s.temp[1] : s.temp[2];
  if (year(g) > 0) t += seasonOf(g) === 'winter' ? -6 : seasonOf(g) === 'summer' ? 5 : 0;
  return t;
}

// ---------------- Helpers ----------------

export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.hypot(ax - bx, ay - by);

export function isWater(g: Game, x: number, y: number): boolean {
  if (!inMap(x, y)) return true;
  return g.w.water[idx(x, y)] === 1;
}

export function biomeAt(g: Game, x: number, y: number): number {
  if (!inMap(x, y)) return 0;
  return g.w.biome[idx(x, y)];
}

const ev = (g: Game, e: Ev): void => {
  if (g.ev.length < 200) g.ev.push(e);
};
const float = (g: Game, x: number, y: number, text: string, color = '#fff'): void => ev(g, { k: 'float', x, y, text, color });
const sfx = (g: Game, name: string): void => ev(g, { k: 'sfx', name });
const toast = (g: Game, text: string): void => ev(g, { k: 'toast', text });

/** Toast at most once per `gap` seconds per key. */
function warn(g: Game, key: string, text: string, gap = 20): void {
  if ((g.warned[key] ?? -1e9) + gap > g.time) return;
  g.warned[key] = g.time;
  toast(g, text);
}

export function charDef(g: Game) {
  return CHARS[g.char] ?? CHARS.wren;
}

// ---------------- Inventory ----------------

export function count(g: Game, id: string): number {
  let n = 0;
  for (const s of g.p.inv) if (s && s.id === id) n += s.n;
  return n;
}

export function invFree(g: Game): number {
  return g.p.inv.filter((s) => !s).length;
}

/** Adds items to the inventory. Returns how many did not fit. */
export function addItem(g: Game, s: Stack): number {
  const d = ITEMS[s.id];
  let left = s.n;
  if (d.stack > 1) {
    for (const t of g.p.inv) {
      if (!t || t.id !== s.id || t.n >= d.stack) continue;
      const k = Math.min(left, d.stack - t.n);
      if (t.f !== undefined || s.f !== undefined) t.f = ((t.f ?? 1) * t.n + (s.f ?? 1) * k) / (t.n + k);
      t.n += k;
      left -= k;
      if (!left) return 0;
    }
  }
  for (let i = 0; i < g.p.inv.length && left > 0; i++) {
    if (g.p.inv[i]) continue;
    const k = Math.min(left, d.stack);
    g.p.inv[i] = { id: s.id, n: k, ...(s.f !== undefined ? { f: s.f } : {}), ...(s.d !== undefined ? { d: s.d } : {}) };
    left -= k;
  }
  return left;
}

export function newStack(id: string, n: number): Stack {
  const d = ITEMS[id];
  const s: Stack = { id, n };
  if (d.food) s.f = 1;
  if (d.dur) s.d = d.dur;
  return s;
}

function give(g: Game, id: string, n: number, x = g.p.x, y = g.p.y): void {
  const s = newStack(id, n);
  const left = addItem(g, s);
  if (left > 0) dropAt(g, { ...s, n: left }, x, y);
}

export function take(g: Game, id: string, n: number): boolean {
  if (count(g, id) < n) return false;
  for (let i = g.p.inv.length - 1; i >= 0 && n > 0; i--) {
    const s = g.p.inv[i];
    if (!s || s.id !== id) continue;
    const k = Math.min(n, s.n);
    s.n -= k;
    n -= k;
    if (s.n <= 0) g.p.inv[i] = null;
  }
  return true;
}

export function dropAt(g: Game, s: Stack, x: number, y: number): void {
  for (let i = 0; i < 8; i++) {
    const a = rnd(g) * Math.PI * 2;
    const r = 0.3 + rnd(g) * 0.7;
    const nx = x + Math.cos(a) * r;
    const ny = y + Math.sin(a) * r;
    if (!isWater(g, nx, ny)) {
      g.drops.push({ id: g.uid++, s, x: nx, y: ny });
      return;
    }
  }
  g.drops.push({ id: g.uid++, s, x, y });
}

// ---------------- New game ----------------

export function newGame(seed: number, char: string): Game {
  const w = generate(seed);
  const c = CHARS[char] ?? CHARS.wren;
  const p: Player = {
    x: w.start.x,
    y: w.start.y,
    px: w.start.x,
    py: w.start.y,
    hp: c.hp,
    hunger: c.hunger,
    san: c.san,
    temp: 28,
    maxHp: c.hp,
    maxHunger: c.hunger,
    maxSan: c.san,
    inv: Array(INV_SIZE).fill(null),
    eq: { hand: null, head: null, body: null },
    goal: null,
    path: [],
    pathT: 0,
    work: 0,
    atk: 0,
    dark: 0,
    face: 1,
    hurt: 0,
    moving: false,
    swing: 0,
  };
  const g: Game = {
    v: 1,
    seed,
    char: CHARS[char] ? char : 'wren',
    time: 0,
    rs: seed ^ 0x2545f491,
    uid: 100000,
    w,
    cre: [],
    st: [],
    drops: [],
    p,
    kills: 0,
    bossKills: 0,
    crafted: 0,
    over: null,
    cause: '',
    winT: 0,
    bosses: [],
    nextWave: 5,
    lastDay: 1,
    lastPhase: 'day',
    sec: 0,
    seen: new Uint8Array(MAP * MAP),
    warned: {},
    ev: [],
  };
  for (const [id, n] of c.kit) give(g, id, n);
  g.st.push({ id: g.uid++, k: 'portal', x: w.portal.x, y: w.portal.y, fuel: 0, parts: [] });
  // Fill spawners.
  for (const n of w.nodes) {
    const d = NODES[n.k];
    if (!d.spawns) continue;
    const max = spawnMax(n.k);
    for (let i = 0; i < max; i++) spawnFrom(g, n);
  }
  explore(g);
  return g;
}

// ---------------- Save helpers ----------------

export function serialize(g: Game): string {
  const { w, seen, ev: _ev, ...rest } = g;
  void _ev;
  let s = '';
  for (let i = 0; i < seen.length; i += 4) s += ((seen[i] | (seen[i + 1] << 1) | (seen[i + 2] << 2) | (seen[i + 3] << 3)) & 15).toString(16);
  return JSON.stringify({ ...rest, nodes: w.nodes, seenHex: s });
}

export function deserialize(raw: string): Game | null {
  try {
    const o = JSON.parse(raw);
    if (o.v !== 1 || typeof o.seed !== 'number') return null;
    const w = generate(o.seed);
    w.nodes = o.nodes;
    const seen = new Uint8Array(MAP * MAP);
    const hex: string = o.seenHex ?? '';
    for (let i = 0; i < hex.length; i++) {
      const v = parseInt(hex[i], 16);
      for (let b = 0; b < 4; b++) if (i * 4 + b < seen.length) seen[i * 4 + b] = (v >> b) & 1;
    }
    delete o.nodes;
    delete o.seenHex;
    const g = { ...o, w, seen, ev: [] } as Game;
    return g;
  } catch {
    return null;
  }
}

// ---------------- Creatures ----------------

function spawnMax(k: string): number {
  return k === 'burrow' ? 1 : k === 'herd' ? 4 : 2;
}

const RESPAWN: Record<string, number> = { burrow: 40, nest: 130, den: 180, pond: 70, herd: 360, sty: 220 };

export function makeCreature(g: Game, k: string, x: number, y: number, from = 0): Creature {
  const d = CREATURES[k];
  const hpMul = d.boss ? 1 + 0.5 * year(g) : 1 + 0.25 * year(g);
  const c: Creature = {
    id: g.uid++,
    k,
    x,
    y,
    px: x,
    py: y,
    hp: Math.round(d.hp * hpMul),
    max: Math.round(d.hp * hpMul),
    st: 'idle',
    tx: x,
    ty: y,
    t: rnd(g) * 3,
    cd: 0,
    angry: false,
    flash: 0,
    from,
    hx: x,
    hy: y,
    face: 1,
  };
  g.cre.push(c);
  return c;
}

function spawnFrom(g: Game, n: Node): void {
  const k = NODES[n.k].spawns!;
  for (let i = 0; i < 6; i++) {
    const x = n.x + (rnd(g) - 0.5) * 3;
    const y = n.y + (rnd(g) - 0.5) * 3;
    if (!isWater(g, x, y)) {
      const c = makeCreature(g, k, x, y, n.id);
      c.hx = n.x;
      c.hy = n.y;
      return;
    }
  }
}

/** A land point at about `r` tiles from (x, y). */
function ringPoint(g: Game, x: number, y: number, r: number): { x: number; y: number } | null {
  for (let i = 0; i < 30; i++) {
    const a = rnd(g) * Math.PI * 2;
    const nx = x + Math.cos(a) * r;
    const ny = y + Math.sin(a) * r;
    if (inMap(nx, ny) && !isWater(g, nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

function creatureActive(g: Game, k: string): boolean {
  const a = CREATURES[k].active;
  const ph = phase(g);
  return a === 'always' || (a === 'day' ? ph !== 'night' : ph === 'night');
}

function moveEnt(g: Game, e: { x: number; y: number }, dx: number, dy: number, speed: number): boolean {
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  const step = speed * DT;
  const ux = dx / len;
  const uy = dy / len;
  const tryMove = (vx: number, vy: number): boolean => {
    const nx = e.x + vx * step;
    const ny = e.y + vy * step;
    if (isWater(g, nx, ny)) return false;
    e.x = nx;
    e.y = ny;
    return true;
  };
  if (tryMove(ux, uy)) return true;
  if (Math.abs(ux) > 0.1 && tryMove(Math.sign(ux), 0)) return true;
  if (Math.abs(uy) > 0.1 && tryMove(0, Math.sign(uy))) return true;
  for (const a of [0.8, -0.8, 1.6, -1.6]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    if (tryMove(ux * c - uy * s, ux * s + uy * c)) return true;
  }
  return false;
}

/** Damage to the player after armor. */
export function hurtPlayer(g: Game, amount: number, cause: string): void {
  const p = g.p;
  let left = amount;
  for (const slot of ['head', 'body'] as Slot[]) {
    const s = p.eq[slot];
    if (!s) continue;
    const d = ITEMS[s.id];
    if (!d.absorb) continue;
    const ab = left * d.absorb;
    left -= ab;
    s.d = (s.d ?? d.dur ?? 0) - ab;
    if (s.d <= 0) {
      p.eq[slot] = null;
      toast(g, `Your ${d.name.toLowerCase()} broke!`);
      sfx(g, 'break');
    }
  }
  left = Math.round(left);
  p.hp -= left;
  p.hurt = 0.3;
  float(g, p.x, p.y - 0.8, `-${left}`, '#ff5d5d');
  sfx(g, 'hurt');
  ev(g, { k: 'shake', n: Math.min(10, 3 + amount / 8) });
  if (p.hp <= 0 && !g.over) {
    g.over = 'dead';
    g.cause = cause;
  }
}

function angerHerd(g: Game, c: Creature): void {
  c.angry = true;
  if (c.k === 'yak' || c.k === 'boar' || c.k === 'spider') {
    for (const o of g.cre) if (o.k === c.k && dist(o.x, o.y, c.x, c.y) < (c.k === 'yak' ? 4.5 : 6)) o.angry = true;
  }
}

function updateCreature(g: Game, c: Creature): boolean {
  const d = CREATURES[c.k];
  const p = g.p;
  const pd = dist(c.x, c.y, p.x, p.y);
  if (pd > 30 && !d.boss && !c.hunt) return true;
  c.px = c.x;
  c.py = c.y;
  c.cd -= DT;
  c.t -= DT;
  if (c.flash > 0) c.flash -= DT;
  const active = creatureActive(g, c.k);
  const ph = phase(g);
  let speed = 0;
  let mx = 0;
  let my = 0;

  // Leave conditions.
  if (c.k === 'rabbit' && !active) {
    if (dist(c.x, c.y, c.hx, c.hy) < 0.5) return false;
    c.st = 'home';
  }
  if (c.k === 'shade' && p.san > p.maxSan * 0.45) {
    float(g, c.x, c.y, 'fades', '#9a8cff');
    return false;
  }
  if (c.hunt && ph === 'day' && pd > 10) return false;

  // Decide the state.
  if (c.st !== 'windup') {
    if (d.mood === 'passive') {
      if (c.st === 'home') {
        // keep going home
      } else if (pd < d.aggro) c.st = 'flee';
      else if (c.st === 'flee' && pd > d.aggro + 2) c.st = 'wander';
      else if (c.st !== 'flee' && c.t <= 0) c.st = 'wander';
    } else if (d.boss) {
      if (ph === 'night' && !c.angry) c.st = 'sleep';
      else if (pd < d.aggro || c.angry) c.st = 'chase';
      else c.st = 'wander';
      if (pd > 15) c.angry = false;
    } else {
      const asleep = !active && !c.angry && !c.hunt;
      if (c.k === 'spider' && asleep && pd < 3) c.angry = true;
      if (d.mood === 'neutral') {
        if (c.k === 'boar' && ph === 'night' && pd < 2.5) c.angry = true;
        if (c.k === 'yak' && seasonOf(g) === 'spring' && pd < 1.8) c.angry = true;
      } else if (active && pd < d.aggro) c.angry = true;
      if (c.hunt || c.k === 'shade') c.angry = true;
      if (c.angry && pd > (c.hunt ? 40 : d.aggro + 5)) c.angry = false;
      if (c.angry && !active && !c.hunt && pd > 6) c.angry = false;
      const farHome = c.from && dist(c.x, c.y, c.hx, c.hy) > 16;
      if (c.angry && !farHome) c.st = 'chase';
      else if (asleep) c.st = dist(c.x, c.y, c.hx, c.hy) > 1 ? 'home' : 'sleep';
      else if (c.st === 'chase' || c.st === 'sleep' || c.st === 'idle') c.st = 'wander';
      if (farHome && c.st === 'chase') {
        c.angry = false;
        c.st = 'home';
      }
    }
  }

  switch (c.st) {
    case 'flee':
      mx = c.x - p.x;
      my = c.y - p.y;
      speed = d.speed;
      break;
    case 'home':
      mx = c.hx - c.x;
      my = c.hy - c.y;
      speed = d.speed * 0.7;
      if (Math.hypot(mx, my) < 0.4) c.st = d.mood === 'passive' ? 'home' : 'sleep';
      break;
    case 'wander': {
      if (c.t <= 0 || dist(c.x, c.y, c.tx, c.ty) < 0.4) {
        c.t = 2 + rnd(g) * 4;
        if (d.boss) {
          c.tx = p.x + (rnd(g) - 0.5) * 30;
          c.ty = p.y + (rnd(g) - 0.5) * 30;
        } else if (rnd(g) < 0.35) {
          c.tx = c.x;
          c.ty = c.y;
        } else {
          const r = c.k === 'shade' ? 3 : c.k === 'yak' ? 6 : 5;
          c.tx = (c.from ? c.hx : c.x) + (rnd(g) - 0.5) * 2 * r;
          c.ty = (c.from ? c.hy : c.y) + (rnd(g) - 0.5) * 2 * r;
        }
      }
      mx = c.tx - c.x;
      my = c.ty - c.y;
      speed = d.speed * (d.boss ? 0.55 : 0.4);
      break;
    }
    case 'chase': {
      if (pd > d.range + 0.2 + p.hurt * 0) {
        mx = p.x - c.x;
        my = p.y - c.y;
        speed = d.speed;
      } else if (c.cd <= 0) {
        if (d.windup) {
          c.st = 'windup';
          c.wind = d.windup;
          c.wx = p.x;
          c.wy = p.y;
          ev(g, { k: 'ring', x: p.x, y: p.y, r: d.area ?? 2, color: '#ff4040' });
        } else {
          c.cd = d.cd;
          hurtPlayer(g, d.dmg * (1 + 0.2 * year(g)), d.name);
        }
      }
      break;
    }
    case 'windup': {
      c.wind = (c.wind ?? 0) - DT;
      if (c.wind <= 0) {
        c.st = 'chase';
        c.cd = d.cd;
        sfx(g, 'slam');
        ev(g, { k: 'shake', n: 8 });
        if (dist(p.x, p.y, c.wx!, c.wy!) < (d.area ?? 2)) hurtPlayer(g, d.dmg * (1 + 0.2 * year(g)), d.name);
      }
      break;
    }
    default:
      break;
  }
  if (speed > 0) {
    moveEnt(g, c, mx, my, speed);
    if (Math.abs(mx) > 0.05) c.face = mx > 0 ? 1 : -1;
  }
  return true;
}

// ---------------- Lights and fires ----------------

export function fireRadius(s: Struct): number {
  if (s.k !== 'campfire' && s.k !== 'firepit') return 0;
  if (s.fuel <= 0) return 0;
  return 2.2 + 4 * Math.min(1, s.fuel / 120);
}

export interface Light {
  x: number;
  y: number;
  r: number;
}

export function lights(g: Game): Light[] {
  const out: Light[] = [];
  for (const s of g.st) {
    const r = fireRadius(s);
    if (r > 0) out.push({ x: s.x, y: s.y, r });
  }
  const h = g.p.eq.hand;
  if (h && ITEMS[h.id].light && (h.d ?? 0) > 0) out.push({ x: g.p.x, y: g.p.y, r: ITEMS[h.id].light! });
  return out;
}

/** Heat from fires close by. */
export function fireHeat(g: Game, x: number, y: number): number {
  let h = 0;
  for (const s of g.st) {
    if (fireRadius(s) <= 0) continue;
    const d = dist(s.x, s.y, x, y);
    if (d < 4) h = Math.max(h, 38 * (1 - d / 5));
  }
  return h;
}

export function isLit(g: Game, x: number, y: number): boolean {
  for (const l of lights(g)) if (dist(l.x, l.y, x, y) < l.r * 0.82) return true;
  return false;
}

/** The nearest burning fire within `r`. */
export function nearFire(g: Game, r = 2.6): Struct | null {
  let best: Struct | null = null;
  let bd = r;
  for (const s of g.st) {
    if (fireRadius(s) <= 0) continue;
    const d = dist(s.x, s.y, g.p.x, g.p.y);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/** The science tier the player can craft at right now. */
export function tierAt(g: Game): number {
  let t = 0;
  for (const s of g.st) {
    const tier = STRUCTS[s.k].tier ?? 0;
    if (tier > t && dist(s.x, s.y, g.p.x, g.p.y) < 4.5) t = tier;
  }
  return Math.min(2, t + (charDef(g).tierBonus ?? 0));
}

// ---------------- Player actions ----------------

export function canCraft(g: Game, id: string): boolean {
  const r = RECIPES.find((x) => x.id === id);
  if (!r || r.tier > tierAt(g)) return false;
  return r.cost.every(([it, n]) => count(g, it) >= n);
}

export function craft(g: Game, id: string): boolean {
  const r = RECIPES.find((x) => x.id === id);
  if (!r || !canCraft(g, id)) return false;
  for (const [it, n] of r.cost) take(g, it, n);
  g.crafted++;
  if (r.place) {
    const p = g.p;
    let x = p.x + p.face * 1.2;
    let y = p.y + 0.3;
    if (isWater(g, x, y)) {
      x = p.x;
      y = p.y;
    }
    const def = STRUCTS[r.place];
    g.st.push({ id: g.uid++, k: r.place, x, y, fuel: def.maxFuel ? def.maxFuel * 0.55 : 0 });
    float(g, x, y - 0.5, `${def.icon} built`, '#ffe08a');
  } else {
    give(g, r.out, r.n);
    float(g, g.p.x, g.p.y - 0.8, `+${ITEMS[r.out].icon}`, '#ffe08a');
  }
  sfx(g, 'craft');
  return true;
}

export function equip(g: Game, slot: number): void {
  const s = g.p.inv[slot];
  if (!s) return;
  const d = ITEMS[s.id];
  if (!d.slot) return;
  const old = g.p.eq[d.slot];
  g.p.eq[d.slot] = s;
  g.p.inv[slot] = old;
  sfx(g, 'equip');
}

export function unequip(g: Game, slot: Slot): void {
  const s = g.p.eq[slot];
  if (!s) return;
  if (addItem(g, s) > 0) {
    warn(g, 'full', 'Your pockets are full.', 3);
    return;
  }
  g.p.eq[slot] = null;
  sfx(g, 'equip');
}

export function foodValue(g: Game, s: Stack): { hunger: number; hp: number; san: number } {
  const fd = ITEMS[s.id].food!;
  const f = s.f ?? 1;
  let hunger = fd.hunger * (fd.plant ? (charDef(g).plantMul ?? 1) : 1);
  let hp = fd.hp;
  let san = fd.san;
  if (f < 0.2) {
    hunger *= 0.5;
    hp = Math.min(hp, 0);
    san -= 10;
  } else if (f < 0.5) {
    hunger *= 0.67;
    if (hp > 0) hp *= 0.33;
  }
  return { hunger: Math.round(hunger), hp: Math.round(hp), san: Math.round(san) };
}

export function eat(g: Game, slot: number): boolean {
  const s = g.p.inv[slot];
  if (!s || !ITEMS[s.id].food) return false;
  const v = foodValue(g, s);
  const p = g.p;
  p.hunger = Math.min(p.maxHunger, p.hunger + v.hunger);
  p.hp = Math.min(p.maxHp, p.hp + v.hp);
  p.san = Math.max(0, Math.min(p.maxSan, p.san + v.san));
  s.n--;
  if (s.n <= 0) p.inv[slot] = null;
  float(g, p.x, p.y - 0.8, `🍴 +${v.hunger}`, '#ffd166');
  if (v.hp) float(g, p.x + 0.6, p.y - 0.4, `${v.hp > 0 ? '+' : ''}${v.hp} ❤`, v.hp > 0 ? '#7ee08a' : '#ff5d5d');
  if (p.hp <= 0 && !g.over) {
    g.over = 'dead';
    g.cause = 'bad food';
  }
  sfx(g, 'eat');
  return true;
}

export function cook(g: Game, slot: number): boolean {
  const s = g.p.inv[slot];
  if (!s) return false;
  const fd = ITEMS[s.id].food;
  if (!fd?.cook || !nearFire(g)) return false;
  s.n--;
  if (s.n <= 0) g.p.inv[slot] = null;
  give(g, fd.cook, 1);
  float(g, g.p.x, g.p.y - 0.8, `🔥 ${ITEMS[fd.cook].icon}`, '#ffb347');
  sfx(g, 'cook');
  return true;
}

export function canSleep(g: Game): string | null {
  if (phase(g) !== 'night') return 'You can only sleep at night.';
  if (!nearFire(g, 3.5)) return 'You need a fire close by.';
  if (g.cre.some((c) => CREATURES[c.k].mood === 'hostile' && (c.angry || c.st === 'chase') && dist(c.x, c.y, g.p.x, g.p.y) < 12)) return 'Something hunts you. You cannot sleep now.';
  if (g.p.hunger < 20) return 'You are too hungry to sleep.';
  return null;
}

function sleep(g: Game): boolean {
  const why = canSleep(g);
  if (why) {
    toast(g, why);
    return false;
  }
  const skip = DAY - (g.time % DAY);
  for (let i = 0; i < skip; i++) secondUpdate(g, false);
  for (const s of g.st) if (s.fuel > 0) s.fuel = Math.max(0, s.fuel - skip);
  g.time += skip;
  const p = g.p;
  p.hunger = Math.max(0, p.hunger - 45);
  p.hp = Math.min(p.maxHp, p.hp + 25);
  p.san = Math.min(p.maxSan, p.san + 40);
  p.temp = Math.max(p.temp, 20);
  p.dark = 0;
  toast(g, 'You sleep until dawn.');
  sfx(g, 'sleep');
  return true;
}

/** Use the item in an inventory slot: eat, equip, heal, sleep or place. */
export function useItem(g: Game, slot: number): boolean {
  const s = g.p.inv[slot];
  if (!s) return false;
  const d = ITEMS[s.id];
  if (d.food) return eat(g, slot);
  if (d.slot) {
    equip(g, slot);
    return true;
  }
  if (d.heal) {
    const p = g.p;
    if (p.hp >= p.maxHp) {
      toast(g, 'You are not hurt.');
      return false;
    }
    p.hp = Math.min(p.maxHp, p.hp + d.heal);
    s.n--;
    if (s.n <= 0) p.inv[slot] = null;
    float(g, p.x, p.y - 0.8, `+${d.heal} ❤`, '#7ee08a');
    sfx(g, 'heal');
    return true;
  }
  if (s.id === 'bedroll') {
    if (!sleep(g)) return false;
    s.n--;
    if (s.n <= 0) g.p.inv[slot] = null;
    return true;
  }
  if (d.place) {
    s.n--;
    if (s.n <= 0) g.p.inv[slot] = null;
    g.st.push({ id: g.uid++, k: d.place, x: g.p.x + g.p.face * 0.9, y: g.p.y, fuel: 0 });
    sfx(g, 'craft');
    return true;
  }
  return false;
}

export function dropItem(g: Game, slot: number): void {
  const s = g.p.inv[slot];
  if (!s) return;
  g.p.inv[slot] = null;
  dropAt(g, s, g.p.x, g.p.y);
}

/** Fuel a fire with one item. Picks a cheap fuel when `id` is not given. */
export function fuelFire(g: Game, st: Struct, id?: string): boolean {
  const max = STRUCTS[st.k].maxFuel;
  if (!max) return false;
  if (st.k === 'campfire' && st.fuel <= 0) {
    toast(g, 'This campfire burned out. Build a new one.');
    return false;
  }
  if (st.fuel > max - 8) {
    warn(g, 'fullfire', 'The fire is full.', 2);
    return false;
  }
  const order = id ? [id] : st.fuel < max * 0.4 ? ['log', 'boards', 'fuelx', 'grass', 'twigs', 'reeds', 'rot'] : ['rot', 'reeds', 'grass', 'twigs', 'log'];
  for (const it of order) {
    if (!ITEMS[it].fuel || count(g, it) <= 0) continue;
    take(g, it, 1);
    st.fuel = Math.min(max, st.fuel + ITEMS[it].fuel!);
    float(g, st.x, st.y - 0.6, `+${ITEMS[it].icon}`, '#ffb347');
    sfx(g, 'fuel');
    return true;
  }
  warn(g, 'nofuel', 'You have nothing to burn.', 3);
  return false;
}

// ---------------- Goals and paths ----------------

export function goalPos(g: Game, goal: Goal): { x: number; y: number; r: number } | null {
  switch (goal.kind) {
    case 'node': {
      const n = g.w.nodes.find((x) => x.id === goal.id);
      if (!n || n.s !== 0) return null;
      return { x: n.x, y: n.y, r: 0.75 + NODES[n.k].size * 0.3 };
    }
    case 'creature': {
      const c = g.cre.find((x) => x.id === goal.id);
      if (!c) return null;
      return { x: c.x, y: c.y, r: 1.25 + CREATURES[c.k].size * 0.3 };
    }
    case 'struct': {
      const s = g.st.find((x) => x.id === goal.id);
      if (!s) return null;
      return { x: s.x, y: s.y, r: s.k === 'portal' ? 2 : 1.4 };
    }
    case 'drop': {
      const d = g.drops.find((x) => x.id === goal.id);
      if (!d) return null;
      return { x: d.x, y: d.y, r: 0.4 };
    }
    case 'pos':
      return { x: goal.x, y: goal.y, r: 0.25 };
  }
}

export function setGoal(g: Game, goal: Goal | null): void {
  g.p.goal = goal;
  g.p.path = [];
  g.p.pathT = 0;
  g.p.work = 0;
}

function lineClear(g: Game, x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.ceil(dist(x0, y0, x1, y1) / 0.35);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (isWater(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

/** BFS over land tiles. Returns tile indices from start to goal (excluding start). */
function findPath(g: Game, x0: number, y0: number, x1: number, y1: number): number[] {
  const start = idx(x0, y0);
  let goal = idx(x1, y1);
  if (g.w.water[goal]) {
    // Aim for a land tile next to the target.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      if (inMap(x1 + dx, y1 + dy) && !g.w.water[idx(x1 + dx, y1 + dy)]) {
        goal = idx(x1 + dx, y1 + dy);
        break;
      }
    }
  }
  const prev = new Int32Array(MAP * MAP).fill(-1);
  prev[start] = start;
  const q = [start];
  let head = 0;
  while (head < q.length) {
    const c = q[head++];
    if (c === goal) break;
    const x = c % MAP;
    const y = (c / MAP) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const n = ny * MAP + nx;
      if (prev[n] !== -1 || g.w.water[n]) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  if (prev[goal] === -1) return [];
  const path: number[] = [];
  for (let c = goal; c !== start; c = prev[c]) path.push(c);
  return path.reverse();
}

function walkTo(g: Game, tx: number, ty: number, speed: number): void {
  const p = g.p;
  p.pathT -= DT;
  if (lineClear(g, p.x, p.y, tx, ty)) {
    p.path = [];
    moveEnt(g, p, tx - p.x, ty - p.y, speed);
  } else {
    if (!p.path.length || p.pathT <= 0) {
      p.path = findPath(g, p.x, p.y, tx, ty);
      p.pathT = 1;
    }
    while (p.path.length) {
      const c = p.path[0];
      const cx = (c % MAP) + 0.5;
      const cy = ((c / MAP) | 0) + 0.5;
      if (dist(p.x, p.y, cx, cy) < 0.35) {
        p.path.shift();
        continue;
      }
      moveEnt(g, p, cx - p.x, cy - p.y, speed);
      break;
    }
    if (!p.path.length) moveEnt(g, p, tx - p.x, ty - p.y, speed);
  }
  if (Math.abs(tx - p.x) > 0.05) p.face = tx > p.x ? 1 : -1;
  p.moving = true;
}

/** Equip a tool of the kind from the inventory. */
function equipTool(g: Game, tool: 'chop' | 'mine'): boolean {
  const h = g.p.eq.hand;
  if (h && ITEMS[h.id].tool === tool) return true;
  const i = g.p.inv.findIndex((s) => s && ITEMS[s.id].tool === tool);
  if (i < 0) return false;
  equip(g, i);
  return true;
}

/** Equip the best weapon from the inventory if it beats the current hand. Lights stay at night. */
export function bestWeapon(g: Game): void {
  const h = g.p.eq.hand;
  if (h && ITEMS[h.id].light && phase(g) === 'night' && !nearFire(g, 5)) return;
  const cur = h ? (ITEMS[h.id].dmg ?? 10) : 10;
  let bi = -1;
  let bd = cur;
  g.p.inv.forEach((s, i) => {
    if (!s) return;
    const d = ITEMS[s.id];
    if (d.slot === 'hand' && !d.light && (d.dmg ?? 0) > bd) {
      bd = d.dmg!;
      bi = i;
    }
  });
  if (bi >= 0) equip(g, bi);
}

function useDur(g: Game, slot: Slot, n = 1): void {
  const s = g.p.eq[slot];
  if (!s || s.d === undefined) return;
  s.d -= n;
  if (s.d <= 0) {
    g.p.eq[slot] = null;
    toast(g, `Your ${ITEMS[s.id].name.toLowerCase()} broke!`);
    sfx(g, 'break');
  }
}

function harvest(g: Game, n: Node): void {
  const d = NODES[n.k];
  for (const [it, k, p] of d.drops) if (rnd(g) < p) give(g, it, k, n.x, n.y);
  const got = d.drops.filter(([, , p]) => p >= 1).map(([it, k]) => `+${k}${ITEMS[it].icon}`)[0] ?? '';
  float(g, n.x, n.y - 0.7, got, '#e9f5c9');
  if (d.san) {
    g.p.san = Math.min(g.p.maxSan, g.p.san + d.san);
  }
  if (d.regrow > 0) {
    n.s = 1;
    n.t = d.regrow * DAY * (0.85 + rnd(g) * 0.3);
  } else {
    n.s = 2;
  }
  if (ITEMS[d.drops[0]?.[0]]?.part) {
    toast(g, `You found a portal part: ${ITEMS[d.drops[0][0]].icon} ${ITEMS[d.drops[0][0]].name}!`);
    sfx(g, 'part');
  } else sfx(g, d.tool === 'mine' ? 'rock' : d.tool === 'chop' ? 'treefall' : 'pick');
}

function attackCreature(g: Game, c: Creature): void {
  const p = g.p;
  const h = p.eq.hand;
  const base = h ? (ITEMS[h.id].dmg ?? 10) : 10;
  const dmg = Math.round(base * (charDef(g).dmgMul ?? 1));
  c.hp -= dmg;
  c.flash = 0.15;
  p.atk = 0.7;
  p.swing = 0.25;
  if (h && !ITEMS[h.id].light) useDur(g, 'hand');
  float(g, c.x, c.y - 0.8, `${dmg}`, '#ffffff');
  sfx(g, 'hit');
  angerHerd(g, c);
  if (c.st === 'sleep' || c.st === 'home') c.st = 'chase';
  // Knock back a little.
  const dx = c.x - p.x;
  const dy = c.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  if (!CREATURES[c.k].boss) moveEnt(g, c, dx / len, dy / len, 6);
  if (c.hp <= 0) killCreature(g, c);
}

function killCreature(g: Game, c: Creature): void {
  const d = CREATURES[c.k];
  g.cre = g.cre.filter((x) => x !== c);
  g.kills++;
  for (const [it, k, pr] of d.drops) if (rnd(g) < pr) dropAt(g, newStack(it, k), c.x, c.y);
  float(g, c.x, c.y - 1, `${d.icon} ✖`, '#ffd166');
  sfx(g, d.boss ? 'bossdie' : 'kill');
  if (d.boss) {
    g.bossKills++;
    toast(g, `${d.name} falls! It dropped an ancient heart.`);
    ev(g, { k: 'shake', n: 12 });
  }
}

function interact(g: Game, goal: Goal): boolean {
  const p = g.p;
  switch (goal.kind) {
    case 'node': {
      const n = g.w.nodes.find((x) => x.id === goal.id)!;
      const d = NODES[n.k];
      if (d.hits <= 0) return false;
      if (d.tool && !equipTool(g, d.tool)) {
        warn(g, 'tool' + d.tool, d.tool === 'chop' ? 'You need an axe to chop trees.' : 'You need a pickaxe to mine rocks.', 4);
        return false;
      }
      const hitT = d.tool ? 0.45 : n.k === 'nest' ? 0.7 : 0.55;
      p.work += DT;
      if (p.work < hitT) return true;
      p.work = 0;
      p.swing = 0.2;
      const pow = d.tool === 'chop' ? (charDef(g).chopMul ?? 1) : 1;
      n.hp -= pow;
      if (d.tool) {
        useDur(g, 'hand');
        sfx(g, d.tool === 'chop' ? 'chop' : 'mine');
      }
      if (n.k === 'nest') {
        sfx(g, 'hit');
        const kids = g.cre.filter((c) => c.from === n.id);
        for (const c of kids) c.angry = true;
        if (kids.length < 3 && rnd(g) < 0.3) spawnFrom(g, n);
        for (const c of g.cre) if (c.from === n.id) c.angry = true;
      }
      if (n.hp > 0) return true;
      harvest(g, n);
      return false;
    }
    case 'creature': {
      const c = g.cre.find((x) => x.id === goal.id)!;
      if (p.atk > 0) return true;
      bestWeapon(g);
      attackCreature(g, c);
      return g.cre.includes(c);
    }
    case 'struct': {
      const s = g.st.find((x) => x.id === goal.id)!;
      if (s.k === 'campfire' || s.k === 'firepit') {
        if (s.k === 'firepit' && s.fuel <= 0) {
          // Relight with any fuel.
        }
        fuelFire(g, s);
        return false;
      }
      if (s.k === 'science' || s.k === 'alchemy') {
        ev(g, { k: 'craft' });
        return false;
      }
      if (s.k === 'trap') {
        if (s.caught) {
          give(g, 'morsel', 1, s.x, s.y);
          s.caught = 0;
          float(g, s.x, s.y - 0.6, '+1🍗', '#e9f5c9');
          sfx(g, 'pick');
        } else {
          g.st = g.st.filter((x) => x !== s);
          give(g, 'trap', 1);
          sfx(g, 'pick');
        }
        return false;
      }
      if (s.k === 'rack') {
        rackUse(g, s);
        return false;
      }
      if (s.k === 'portal') {
        portalUse(g, s);
        return false;
      }
      return false;
    }
    case 'drop':
      return false;
    case 'pos':
      return false;
  }
}

const RAW_MEAT = ['meat', 'mmeat', 'morsel', 'legs'];

function rackUse(g: Game, s: Struct): void {
  s.hang = s.hang ?? [];
  const done = s.hang.filter((h) => h.t <= 0);
  for (const h of done) give(g, h.id, 1, s.x, s.y);
  s.hang = s.hang.filter((h) => h.t > 0);
  let hung = 0;
  for (const id of RAW_MEAT) {
    while (s.hang.length < 3 && count(g, id) > 0) {
      take(g, id, 1);
      s.hang.push({ id: 'jerky', t: DAY * 0.8 });
      hung++;
    }
  }
  if (done.length) float(g, s.x, s.y - 0.6, `+${done.length}🥓`, '#e9f5c9');
  else if (hung) float(g, s.x, s.y - 0.6, `hung ${hung}`, '#e9f5c9');
  else warn(g, 'rack', 'Hang raw meat here. It dries to jerky in about a day.', 3);
  sfx(g, 'pick');
}

function portalUse(g: Game, s: Struct): void {
  s.parts = s.parts ?? [];
  let added = 0;
  for (const id of PARTS) {
    if (s.parts.includes(id) || count(g, id) <= 0) continue;
    take(g, id, 1);
    s.parts.push(id);
    added++;
  }
  if (added) {
    sfx(g, 'part');
    float(g, s.x, s.y - 1, `+${added} part${added > 1 ? 's' : ''}`, '#b388ff');
  }
  if (s.parts.length >= PARTS.length) {
    if (!g.winT) {
      g.winT = 3;
      toast(g, 'The gate hums and opens…');
      sfx(g, 'portal');
    }
  } else {
    warn(g, 'portal', `The gate needs ${PARTS.length - s.parts.length} more part(s): ${PARTS.filter((id) => !s.parts!.includes(id)).map((id) => ITEMS[id].icon).join(' ')}`, 3);
  }
}

/** Nearest thing to act on within `r` tiles: a drop, a ready node, a creature you fight, or a structure. */
export function nearestAct(g: Game, r = 4): Goal | null {
  const p = g.p;
  let best: Goal | null = null;
  let bd = r;
  for (const d of g.drops) {
    const k = dist(d.x, d.y, p.x, p.y);
    if (k < bd) {
      bd = k;
      best = { kind: 'drop', id: d.id, x: d.x, y: d.y };
    }
  }
  for (const n of g.w.nodes) {
    if (n.s !== 0 || NODES[n.k].hits <= 0 || n.k === 'nest') continue;
    const k = dist(n.x, n.y, p.x, p.y);
    if (k < bd) {
      bd = k;
      best = { kind: 'node', id: n.id, x: n.x, y: n.y };
    }
  }
  for (const s of g.st) {
    const k = dist(s.x, s.y, p.x, p.y) - 0.3;
    if (k < bd) {
      bd = k;
      best = { kind: 'struct', id: s.id, x: s.x, y: s.y };
    }
  }
  return best;
}

export function nearestFoe(g: Game, r = 6): Goal | null {
  const p = g.p;
  let best: Goal | null = null;
  let bd = r;
  for (const c of g.cre) {
    const k = dist(c.x, c.y, p.x, p.y) - (c.angry || c.st === 'chase' ? 2 : 0);
    if (k < bd) {
      bd = k;
      best = { kind: 'creature', id: c.id, x: c.x, y: c.y };
    }
  }
  return best;
}

// ---------------- Tick ----------------

export interface Input {
  mx: number;
  my: number;
}

export function tick(g: Game, inp: Input): void {
  if (g.over) return;
  const p = g.p;
  g.time += DT;
  p.px = p.x;
  p.py = p.y;
  p.moving = false;
  if (p.atk > 0) p.atk -= DT;
  if (p.hurt > 0) p.hurt -= DT;
  if (p.swing > 0) p.swing -= DT;

  if (g.winT > 0) {
    g.winT -= DT;
    if (g.winT <= 0) {
      g.over = 'win';
      g.winT = 0;
    }
    return;
  }

  const ch = charDef(g);
  const speed = 4 * (p.hunger <= 0 ? 0.8 : 1);
  // Movement
  const ml = Math.hypot(inp.mx, inp.my);
  if (ml > 0.15) {
    if (p.goal) setGoal(g, null);
    const k = Math.min(1, ml);
    moveEnt(g, p, inp.mx, inp.my, speed * k);
    if (Math.abs(inp.mx) > 0.1) p.face = inp.mx > 0 ? 1 : -1;
    p.moving = true;
  } else if (p.goal) {
    const gp = goalPos(g, p.goal);
    if (!gp) setGoal(g, null);
    else {
      p.goal.x = gp.x;
      p.goal.y = gp.y;
      const d = dist(p.x, p.y, gp.x, gp.y);
      if (d > gp.r) {
        walkTo(g, gp.x, gp.y, speed);
        p.work = 0;
      } else {
        if (Math.abs(gp.x - p.x) > 0.05) p.face = gp.x > p.x ? 1 : -1;
        if (!interact(g, p.goal)) setGoal(g, null);
      }
    }
  }

  // Auto pickup
  for (let i = g.drops.length - 1; i >= 0; i--) {
    const d = g.drops[i];
    if (dist(d.x, d.y, p.x, p.y) > 0.75) continue;
    const left = addItem(g, d.s);
    if (left < d.s.n) {
      float(g, d.x, d.y - 0.5, `+${d.s.n - left}${ITEMS[d.s.id].icon}`, '#e9f5c9');
      sfx(g, 'pick');
      if (ITEMS[d.s.id].part) toast(g, `You picked up a portal part: ${ITEMS[d.s.id].icon} ${ITEMS[d.s.id].name}!`);
    }
    if (left <= 0) g.drops.splice(i, 1);
    else {
      d.s.n = left;
      warn(g, 'full', 'Your pockets are full.', 6);
    }
  }

  // Creatures
  g.cre = g.cre.filter((c) => updateCreature(g, c));

  // Needs
  const ph = phase(g);
  const lit = isLit(g, p.x, p.y);
  p.hunger -= (75 / DAY) * (ch.hungerRate ?? 1) * DT;
  if (p.hunger <= 0) {
    p.hunger = 0;
    p.hp -= 1.1 * DT;
    warn(g, 'starve', 'You are starving! Eat something.', 15);
    if (p.hp <= 0 && !g.over) {
      g.over = 'dead';
      g.cause = 'hunger';
    }
  }
  if (p.hunger > p.maxHunger * 0.6 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 0.12 * DT);
  let ds = 0;
  if (ph === 'dusk') ds -= 0.05;
  if (ph === 'night') ds -= lit ? 0.12 : 0.6;
  const h = p.eq.hand;
  if (h?.id === 'blade') ds -= 0.25;
  const hd = p.eq.head;
  if (hd && ITEMS[hd.id].san) {
    ds += ITEMS[hd.id].san!;
    hd.d = (hd.d ?? 0) - DT;
    if (hd.d <= 0) {
      p.eq.head = null;
      toast(g, 'Your flower crown wilted.');
    }
  }
  p.san = Math.max(0, Math.min(p.maxSan, p.san + ds * DT));

  // Temperature
  const air = airTemp(g);
  let warm = ch.warm ?? 0;
  let cool = 0;
  for (const slot of ['hand', 'head', 'body'] as Slot[]) {
    const s = p.eq[slot];
    if (!s) continue;
    warm += ITEMS[s.id].warm ?? 0;
    cool += ITEMS[s.id].cool ?? 0;
  }
  let target = air + (air < 40 ? warm : warm * 0.5) - (air > 40 ? cool : 0);
  if (seasonOf(g) === 'summer' && biomeAt(g, p.x, p.y) === 1) target -= 10;
  target += fireHeat(g, p.x, p.y);
  if (air < 40) target = Math.min(target, 50);
  p.temp += Math.sign(target - p.temp) * Math.min(Math.abs(target - p.temp), 0.9 * DT);
  if (p.temp < 0) {
    p.hp -= 1.2 * DT;
    warn(g, 'freeze', 'You are freezing! Find a fire or warm clothes.', 15);
    if (p.hp <= 0 && !g.over) {
      g.over = 'dead';
      g.cause = 'the cold';
    }
  } else if (p.temp > 70) {
    p.hp -= 1.2 * DT;
    warn(g, 'heat', 'You are overheating! Find shade or cool clothes.', 15);
    if (p.hp <= 0 && !g.over) {
      g.over = 'dead';
      g.cause = 'the heat';
    }
  }

  // Lights in hand burn down.
  if (h && ITEMS[h.id].light) {
    h.d = (h.d ?? 0) - DT;
    if (h.d <= 0) {
      p.eq.hand = null;
      toast(g, `Your ${ITEMS[h.id].name.toLowerCase()} burned out.`);
      sfx(g, 'break');
    }
  }

  // The dark
  if (ph === 'night' && darkness(g) > 0.8 && !lit) {
    const before = p.dark;
    p.dark += DT;
    if (before < 0.6 && p.dark >= 0.6) toast(g, 'It is pitch dark. Something is watching. Find light!');
    if (p.dark >= 3) {
      p.dark = 1;
      hurtPlayer(g, 34, 'the darkness');
      p.san = Math.max(0, p.san - 12);
      float(g, p.x - 0.5, p.y - 1.2, 'Something bites!', '#c38cff');
    }
  } else p.dark = Math.max(0, p.dark - DT * 2);

  // Fires burn
  for (const s of g.st) {
    if (s.fuel > 0 && STRUCTS[s.k].maxFuel) {
      s.fuel -= DT;
      if (s.fuel <= 0) s.fuel = 0;
    }
  }

  // Slow updates
  g.sec += DT;
  while (g.sec >= 1) {
    g.sec -= 1;
    secondUpdate(g, true);
  }

  if (p.hp <= 0 && !g.over) {
    g.over = 'dead';
    g.cause = g.cause || 'wounds';
  }
}

function explore(g: Game): void {
  const p = g.p;
  const r = phase(g) === 'night' ? (isLit(g, p.x, p.y) ? 5 : 2) : 7;
  const x0 = Math.floor(p.x);
  const y0 = Math.floor(p.y);
  for (let y = y0 - r; y <= y0 + r; y++) {
    for (let x = x0 - r; x <= x0 + r; x++) {
      if (!inMap(x, y)) continue;
      if ((x - x0) ** 2 + (y - y0) ** 2 <= r * r) g.seen[y * MAP + x] = 1;
    }
  }
}

function spoil(s: Stack, rate: number): void {
  const fd = ITEMS[s.id].food;
  if (!fd || s.f === undefined) return;
  s.f -= rate / (fd.spoil * DAY);
  if (s.f <= 0) {
    s.id = 'rot';
    delete s.f;
  }
}

/** Once per game second: regrow, spawners, spoilage, seasons, waves, shades, traps. */
function secondUpdate(g: Game, live: boolean): void {
  const season = seasonOf(g);
  const sd = SEASON_DEFS[season];
  const ph = phase(g);
  const p = g.p;
  // Nodes
  for (const n of g.w.nodes) {
    const d = NODES[n.k];
    if (n.s === 1) {
      if (d.plant && !sd.grows) continue;
      n.t -= 1;
      if (n.t <= 0) {
        n.s = 0;
        n.hp = d.hits;
      }
    }
    if (live && d.spawns && n.s === 0) {
      if (n.k === 'burrow' && ph === 'night') continue;
      const alive = g.cre.reduce((a, c) => a + (c.from === n.id ? 1 : 0), 0);
      if (alive >= spawnMax(n.k)) {
        n.sp = RESPAWN[n.k];
        continue;
      }
      n.sp = (n.sp ?? 0) - 1;
      if (n.sp <= 0 && dist(n.x, n.y, p.x, p.y) > 8) {
        spawnFrom(g, n);
        n.sp = RESPAWN[n.k];
      }
    }
  }
  // Spoilage: slower in winter.
  const rate = season === 'winter' ? 0.5 : 1;
  for (const s of p.inv) if (s) spoil(s, rate);
  for (const d of g.drops) spoil(d.s, rate);
  // Racks
  for (const s of g.st) {
    if (s.hang) for (const h of s.hang) h.t -= 1;
    if (s.k === 'trap' && !s.caught) {
      const holes = g.w.nodes.some((n) => n.k === 'burrow' && dist(n.x, n.y, s.x, s.y) < 5);
      const rab = g.cre.find((c) => c.k === 'rabbit' && dist(c.x, c.y, s.x, s.y) < 4);
      if (holes && rab && rnd(g) < 0.02) {
        s.caught = 1;
        g.cre = g.cre.filter((c) => c !== rab);
        if (live) float(g, s.x, s.y - 0.6, 'caught!', '#e9f5c9');
      }
    }
  }
  if (!live) return;
  explore(g);

  // Day and phase changes
  const day = dayNum(g);
  if (day !== g.lastDay) {
    g.lastDay = day;
    ev(g, { k: 'dawn' });
    sfx(g, 'dawn');
    const sday = seasonDay(g);
    if (sday === 1) {
      toast(g, `${sd.icon} ${sd.name} begins.${season === 'winter' ? ' Stay warm: fires, fur hat, fur coat.' : season === 'summer' ? ' Stay cool: shade, straw hat, reed vest.' : ''}`);
      // Last season's boss leaves.
      for (const c of g.cre.filter((c) => CREATURES[c.k].boss)) {
        float(g, c.x, c.y, 'leaves', '#aaa');
        toast(g, `${CREATURES[c.k].name} wanders off.`);
      }
      g.cre = g.cre.filter((c) => !CREATURES[c.k].boss);
    } else toast(g, `Day ${day} · ${sd.icon} ${sd.name} day ${sday}`);
    const key = `${year(g)}-${season}`;
    if (sday === 2 && (season !== 'autumn' || year(g) > 0) && !g.bosses.includes(key)) {
      g.bosses.push(key);
      const pt = ringPoint(g, p.x, p.y, 20) ?? ringPoint(g, p.x, p.y, 12);
      if (pt) {
        makeCreature(g, sd.boss, pt.x, pt.y);
        toast(g, `The ground shakes. ${CREATURES[sd.boss].icon} ${CREATURES[sd.boss].name} roams the land. It carries an ancient heart.`);
        sfx(g, 'boss');
      }
    }
  }
  if (ph !== g.lastPhase) {
    g.lastPhase = ph;
    if (ph === 'dusk') {
      toast(g, '🌆 Dusk. Night comes soon. Get light ready.');
      sfx(g, 'dusk');
    }
    if (ph === 'night') {
      if (day >= g.nextWave) {
        g.nextWave = day + (year(g) > 0 ? 2 : 3);
        const n = 1 + Math.floor(day / 5);
        for (let i = 0; i < n; i++) {
          const pt = ringPoint(g, p.x, p.y, 15);
          if (!pt) continue;
          const c = makeCreature(g, 'wolf', pt.x, pt.y);
          c.hunt = true;
          c.angry = true;
          c.st = 'chase';
        }
        toast(g, '🐺 You hear howling. A pack is coming!');
        sfx(g, 'howl');
      }
    }
  }
  // Shades
  const ratio = p.san / p.maxSan;
  if (ratio < 0.3) {
    const shades = g.cre.filter((c) => c.k === 'shade').length;
    const max = ratio < 0.1 ? 3 : 1;
    if (shades < max && rnd(g) < 0.06) {
      const pt = ringPoint(g, p.x, p.y, 9);
      if (pt) {
        makeCreature(g, 'shade', pt.x, pt.y);
        warn(g, 'shade', 'Your mind slips. Shadows take shape…', 30);
      }
    }
  }
  // Clean old far drops (not parts) to keep the list small.
  if (g.drops.length > 160) g.drops = g.drops.filter((d) => ITEMS[d.s.id].part || dist(d.x, d.y, p.x, p.y) < 20);
}

/** Tiles reachable from the player. Used by bots. */
export function reachable(g: Game): Uint8Array {
  return reach(g.w.water, Math.floor(g.p.x), Math.floor(g.p.y));
}

export function partsHeld(g: Game): string[] {
  return PARTS.filter((id) => count(g, id) > 0);
}

export function portalStruct(g: Game): Struct {
  return g.st.find((s) => s.k === 'portal')!;
}

/** Remaining items: a quick check of what is in a slot for the UI. */
export function rngInt(g: Game, a: number, b: number): number {
  return rint(g, a, b);
}
