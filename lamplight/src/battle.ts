/**
 * Pure battle rules: grid, light, shadows, strikes, enemy turns, room generator and bots.
 * No DOM here, so the sim and the UI use the same code.
 */
import { ACTS, FOES, HEROES, LAMPS, type FoeKind, type HeroKind, type LampKind } from './data';
import { Rng, hash } from './rng';

export const W = 7;
export const H = 8;
/** After this turn, the dark hurts every figure (both sides) at the end of every turn: 1, then 2, then 3 ... */
export const DARK_TURN = 12;
export const darkDamage = (turn: number): number => Math.max(0, turn - DARK_TURN);

export type Side = 'you' | 'foe';

export interface Fig {
  id: number;
  side: Side;
  kind: string;
  x: number;
  y: number;
  /** Tiles relative to x/y. Always includes [0, 0]. */
  cells: [number, number][];
  hp: number;
  max: number;
  atk: number;
  tall: number;
  pierce: boolean;
  walk: number;
  /** Index in the run roster for your figures, -1 for enemies. */
  slot: number;
  boss: boolean;
}

export interface Lamp {
  id: number;
  side: Side;
  kind: LampKind;
  x: number;
  y: number;
  /** Position at the start of this turn. Moves are measured from here. */
  sx: number;
  sy: number;
  reach: number;
  len: number;
  /** Extra length from upgrades (used by the flicker roll). */
  plus: number;
  dmg: number;
  move: number;
  heal: number;
  flicker: boolean;
  /** Figure that carries this lamp, or -1. */
  bearer: number;
  slot: number;
}

export interface Battle {
  walls: number[];
  figs: Fig[];
  lamps: Lamp[];
  turn: number;
  perTurn: number;
  seed: number;
  over: '' | 'win' | 'lose';
  boss: boolean;
  nextId: number;
  kills: number;
  dealt: number;
  taken: number;
}

export interface Shadow {
  fig: number;
  lamp: number;
  side: Side;
  /** Tile indices, nearest first. */
  tiles: number[];
  steps: number[];
  hits: { fig: number; k: number }[];
  /** Last step that still counts after clashes. */
  cut: number;
}

export interface Hit {
  from: number;
  to: number;
  dmg: number;
  lamp: number;
}

export interface Clash {
  tile: number;
  a: number;
  b: number;
}

export interface Resolution {
  shadows: Shadow[];
  hits: Hit[];
  clashes: Clash[];
  heals: { fig: number; amt: number }[];
  /** Total damage per figure id. */
  dmg: Record<number, number>;
  heal: Record<number, number>;
}

export interface MoveLog {
  kind: 'fig' | 'lamp';
  id: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

export interface RoundLog {
  res: Resolution;
  dead: Fig[];
  moves: MoveLog[];
  dark: { fig: number; dmg: number }[];
  darkDead: Fig[];
}

export const idx = (x: number, y: number): number => y * W + x;
export const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
export const cheb = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

export function clone(b: Battle): Battle {
  return JSON.parse(JSON.stringify(b)) as Battle;
}

export const figById = (b: Battle, id: number): Fig | undefined => b.figs.find((f) => f.id === id);
export const lampById = (b: Battle, id: number): Lamp | undefined => b.lamps.find((l) => l.id === id);
export const yours = (b: Battle): Fig[] => b.figs.filter((f) => f.side === 'you');
export const foes = (b: Battle): Fig[] => b.figs.filter((f) => f.side === 'foe');

export function figTiles(f: Fig): [number, number][] {
  return f.cells.map(([dx, dy]) => [f.x + dx, f.y + dy]);
}

/** Figure id per tile, -1 if empty. */
export function figGrid(b: Battle): Int32Array {
  const g = new Int32Array(W * H).fill(-1);
  for (const f of b.figs) for (const [x, y] of figTiles(f)) if (inside(x, y)) g[idx(x, y)] = f.id;
  return g;
}

/** Lamp id per tile for lamps that stand on their own tile (not carried). */
function lampGrid(b: Battle): Int32Array {
  const g = new Int32Array(W * H).fill(-1);
  for (const l of b.lamps) if (l.bearer < 0) g[idx(l.x, l.y)] = l.id;
  return g;
}

const isWall = (b: Battle, x: number, y: number): boolean => !inside(x, y) || b.walls[idx(x, y)] === 1;

function losLine(b: Battle, ax: number, ay: number, bx: number, by: number, ex: number, ey: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const n = Math.max(Math.abs(dx), Math.abs(dy)) * 4;
  for (let k = 1; k < n; k++) {
    const x = Math.round(ax + (dx * k) / n + ex);
    const y = Math.round(ay + (dy * k) / n + ey);
    if ((x === ax && y === ay) || (x === bx && y === by)) continue;
    if (isWall(b, x, y)) return false;
  }
  return true;
}

/** Walls block light. A line that only grazes a wall corner passes. */
export function los(b: Battle, ax: number, ay: number, bx: number, by: number): boolean {
  return losLine(b, ax, ay, bx, by, 0.01, -0.01) || losLine(b, ax, ay, bx, by, -0.01, 0.01);
}

/** Does this lamp light the tile? */
export function lights(b: Battle, l: Lamp, x: number, y: number): boolean {
  if (l.x === x && l.y === y) return false;
  if (cheb(l.x, l.y, x, y) > l.reach) return false;
  return los(b, l.x, l.y, x, y);
}

/** Round half away from zero, so shadows look the same in every direction. */
const rnd = (v: number): number => Math.sign(v) * Math.round(Math.abs(v));

/**
 * The shadow continues the line from the lamp through the figure.
 * Step k of the shadow is k tiles further along that line (counted like a king moves).
 */
export function shadowStep(dx: number, dy: number, k: number): [number, number] {
  const m = Math.max(Math.abs(dx), Math.abs(dy));
  return [rnd((dx * k) / m), rnd((dy * k) / m)];
}

/** Raw shadows of every lit figure tile, before clashes. */
function rawShadows(b: Battle, fg: Int32Array, lg: Int32Array): Shadow[] {
  const out: Shadow[] = [];
  const sideOf = new Map<number, Side>();
  for (const f of b.figs) sideOf.set(f.id, f.side);
  for (const l of b.lamps) {
    if (l.len <= 0) continue;
    for (const f of b.figs) {
      const len = l.len + f.tall;
      const seen = new Set<number>();
      for (const [cx, cy] of figTiles(f)) {
        if (!lights(b, l, cx, cy)) continue;
        const ddx = cx - l.x;
        const ddy = cy - l.y;
        const s: Shadow = { fig: f.id, lamp: l.id, side: f.side, tiles: [], steps: [], hits: [], cut: 99 };
        for (let k = 1; k <= len; k++) {
          const [sx, sy] = shadowStep(ddx, ddy, k);
          const x = cx + sx;
          const y = cy + sy;
          if (isWall(b, x, y)) break;
          const i = idx(x, y);
          const o = fg[i];
          if (o >= 0) {
            if (o === f.id || sideOf.get(o) === f.side) break;
            if (!seen.has(o)) {
              seen.add(o);
              s.hits.push({ fig: o, k });
            }
            if (!f.pierce) break;
            continue;
          }
          if (lg[i] >= 0) break;
          s.tiles.push(i);
          s.steps.push(k);
        }
        if (s.tiles.length || s.hits.length) out.push(s);
      }
    }
  }
  return out;
}

/**
 * Resolve one strike: all shadows from all lamps at once.
 * - A shadow that reaches an enemy figure deals the owner's attack + the lamp bonus.
 * - Two enemy shadows that cross clash: both stop on that tile and both owners take 1.
 * - Healing lamps heal figures of their side that they light.
 */
export function resolve(b: Battle): Resolution {
  const fg = figGrid(b);
  const lg = lampGrid(b);
  const shadows = rawShadows(b, fg, lg);

  // Crossings between shadows of opposite sides. The earliest crossing wins.
  const byTile = new Map<number, { s: number; k: number }[]>();
  shadows.forEach((s, si) =>
    s.tiles.forEach((t, j) => {
      const list = byTile.get(t) ?? [];
      list.push({ s: si, k: s.steps[j] });
      byTile.set(t, list);
    }),
  );
  const cross: { a: number; b: number; ka: number; kb: number; tile: number }[] = [];
  for (const [tile, list] of byTile) {
    for (const p of list) {
      if (shadows[p.s].side !== 'you') continue;
      for (const q of list) {
        if (shadows[q.s].side !== 'foe') continue;
        cross.push({ a: p.s, b: q.s, ka: p.k, kb: q.k, tile });
      }
    }
  }
  cross.sort((m, n) => Math.max(m.ka, m.kb) - Math.max(n.ka, n.kb) || m.tile - n.tile);
  const clashes: Clash[] = [];
  const clashPairs = new Set<string>();
  const dmg: Record<number, number> = {};
  const add = (id: number, n: number) => (dmg[id] = (dmg[id] ?? 0) + n);
  for (const c of cross) {
    const sa = shadows[c.a];
    const sb = shadows[c.b];
    if (c.ka > sa.cut || c.kb > sb.cut) continue;
    sa.cut = Math.min(sa.cut, c.ka);
    sb.cut = Math.min(sb.cut, c.kb);
    const key = `${sa.fig}x${sb.fig}`;
    if (clashPairs.has(key)) continue;
    clashPairs.add(key);
    clashes.push({ tile: c.tile, a: sa.fig, b: sb.fig });
    add(sa.fig, 1);
    add(sb.fig, 1);
  }

  const hits: Hit[] = [];
  const hitKeys = new Set<string>();
  for (const s of shadows) {
    const keep = s.steps.filter((k) => k <= s.cut).length;
    s.tiles = s.tiles.slice(0, keep);
    s.steps = s.steps.slice(0, keep);
    s.hits = s.hits.filter((h) => h.k < s.cut);
    const owner = figById(b, s.fig)!;
    const lamp = lampById(b, s.lamp)!;
    for (const h of s.hits) {
      const key = `${s.fig}>${s.lamp}>${h.fig}`;
      if (hitKeys.has(key)) continue;
      hitKeys.add(key);
      const d = owner.atk + lamp.dmg;
      hits.push({ from: s.fig, to: h.fig, dmg: d, lamp: s.lamp });
      add(h.fig, d);
    }
  }

  const heals: { fig: number; amt: number }[] = [];
  const heal: Record<number, number> = {};
  for (const l of b.lamps) {
    if (l.heal <= 0) continue;
    for (const f of b.figs) {
      if (f.side !== l.side) continue;
      if (!figTiles(f).some(([x, y]) => lights(b, l, x, y))) continue;
      heal[f.id] = (heal[f.id] ?? 0) + l.heal;
    }
  }
  for (const [id, amt] of Object.entries(heal)) heals.push({ fig: +id, amt });
  return { shadows, hits, clashes, heals, dmg, heal };
}

/** Sum of damage that really lands (capped at HP) per side, and kills. */
export function score(b: Battle, r: Resolution): { dealt: number; taken: number; kills: number; lost: number; healed: number } {
  let dealt = 0;
  let taken = 0;
  let kills = 0;
  let lost = 0;
  let healed = 0;
  for (const f of b.figs) {
    const d = r.dmg[f.id] ?? 0;
    const h = r.heal[f.id] ?? 0;
    const after = Math.min(f.max, f.hp - d + (f.hp - d > 0 ? h : 0));
    if (f.side === 'foe') {
      dealt += Math.min(d, f.hp);
      if (f.hp - d <= 0) kills++;
    } else {
      taken += Math.min(d, f.hp);
      if (f.hp - d <= 0) lost++;
      else healed += Math.max(0, after - (f.hp - d));
    }
  }
  return { dealt, taken, kills, lost, healed };
}

function removeDead(b: Battle): Fig[] {
  const dead = b.figs.filter((f) => f.hp <= 0);
  if (!dead.length) return dead;
  const ids = new Set(dead.map((f) => f.id));
  b.figs = b.figs.filter((f) => !ids.has(f.id));
  b.lamps = b.lamps.filter((l) => !ids.has(l.bearer));
  for (const f of dead) if (f.side === 'foe') b.kills++;
  return dead;
}

function checkOver(b: Battle): void {
  if (!yours(b).length) b.over = 'lose';
  else if (!foes(b).length) b.over = 'win';
}

export function applyResolution(b: Battle, r: Resolution): Fig[] {
  for (const f of b.figs) {
    const d = r.dmg[f.id] ?? 0;
    if (f.side === 'foe') b.dealt += Math.min(d, f.hp);
    else b.taken += Math.min(d, f.hp);
    f.hp -= d;
    if (f.hp > 0 && r.heal[f.id]) f.hp = Math.min(f.max, f.hp + r.heal[f.id]);
  }
  const dead = removeDead(b);
  checkOver(b);
  return dead;
}

// ---------- Your lamp moves ----------

export const movedCount = (b: Battle): number => b.lamps.filter((l) => l.side === 'you' && (l.x !== l.sx || l.y !== l.sy)).length;
export const isMoved = (l: Lamp): boolean => l.x !== l.sx || l.y !== l.sy;

export function canMove(b: Battle, l: Lamp): boolean {
  return l.side === 'you' && l.move > 0 && (isMoved(l) || movedCount(b) < b.perTurn);
}

export function legalDest(b: Battle, l: Lamp, x: number, y: number, fg = figGrid(b)): boolean {
  if (!inside(x, y) || !canMove(b, l)) return false;
  if (cheb(l.sx, l.sy, x, y) > l.move) return false;
  if (b.walls[idx(x, y)] || fg[idx(x, y)] >= 0) return false;
  return !b.lamps.some((o) => o.id !== l.id && o.bearer < 0 && o.x === x && o.y === y);
}

export function dests(b: Battle, l: Lamp): number[] {
  const fg = figGrid(b);
  const out: number[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (legalDest(b, l, x, y, fg)) out.push(idx(x, y));
  return out;
}

export function moveLamp(b: Battle, id: number, x: number, y: number): boolean {
  const l = lampById(b, id);
  if (!l || !legalDest(b, l, x, y)) return false;
  l.x = x;
  l.y = y;
  return true;
}

export function resetMoves(b: Battle): void {
  for (const l of b.lamps) if (l.side === 'you') [l.x, l.y] = [l.sx, l.sy];
}

// ---------- Enemy turn ----------

function foeValue(b: Battle): number {
  const s = score(b, resolve(b));
  return s.taken + 3 * s.lost;
}

/** Walking distance (king moves around walls) from every tile to the nearest of your figures. */
function distMap(b: Battle): Int32Array {
  const d = new Int32Array(W * H).fill(99);
  const q: number[] = [];
  for (const f of yours(b)) {
    d[idx(f.x, f.y)] = 0;
    q.push(idx(f.x, f.y));
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny) || b.walls[idx(nx, ny)] || d[idx(nx, ny)] <= d[i] + 1) continue;
        d[idx(nx, ny)] = d[i] + 1;
        q.push(idx(nx, ny));
      }
  }
  return d;
}

function freeFor(b: Battle, fg: Int32Array, x: number, y: number, self: number): boolean {
  if (!inside(x, y) || b.walls[idx(x, y)]) return false;
  const o = fg[idx(x, y)];
  if (o >= 0 && o !== self) return false;
  return !b.lamps.some((l) => l.bearer < 0 && l.x === x && l.y === y && l.id !== self);
}

/** Each walking enemy and each free enemy lamp picks the spot that hurts you most next strike. */
export function enemyPhase(b: Battle): MoveLog[] {
  const logs: MoveLog[] = [];
  const movers = foes(b).filter((f) => f.walk > 0 && f.cells.length === 1);
  const dm = distMap(b);
  for (const f of movers) {
    const fg = figGrid(b);
    const lamp = b.lamps.find((l) => l.bearer === f.id);
    const ox = f.x;
    const oy = f.y;
    let best = { v: -1e9, x: ox, y: oy };
    for (let dy = -f.walk; dy <= f.walk; dy++)
      for (let dx = -f.walk; dx <= f.walk; dx++) {
        const x = ox + dx;
        const y = oy + dy;
        if (!(dx === 0 && dy === 0) && !freeFor(b, fg, x, y, f.id)) continue;
        if (b.lamps.some((l) => l.bearer < 0 && l.x === x && l.y === y)) continue;
        f.x = x;
        f.y = y;
        if (lamp) [lamp.x, lamp.y] = [x, y];
        const v = foeValue(b) - 0.4 * dm[idx(x, y)] - (dx === 0 && dy === 0 ? 0 : 0.001);
        if (v > best.v) best = { v, x, y };
      }
    f.x = best.x;
    f.y = best.y;
    if (lamp) [lamp.x, lamp.y] = [best.x, best.y];
    if (best.x !== ox || best.y !== oy) logs.push({ kind: 'fig', id: f.id, fx: ox, fy: oy, tx: best.x, ty: best.y });
  }
  for (const l of b.lamps.filter((m) => m.side === 'foe' && m.bearer < 0 && m.move > 0)) {
    const fg = figGrid(b);
    const dm = distMap(b);
    const ox = l.x;
    const oy = l.y;
    let best = { v: -1e9, x: ox, y: oy };
    for (let dy = -l.move; dy <= l.move; dy++)
      for (let dx = -l.move; dx <= l.move; dx++) {
        const x = ox + dx;
        const y = oy + dy;
        if (!inside(x, y) || b.walls[idx(x, y)] || fg[idx(x, y)] >= 0) continue;
        if (b.lamps.some((o) => o.id !== l.id && o.bearer < 0 && o.x === x && o.y === y)) continue;
        l.x = x;
        l.y = y;
        const v = foeValue(b) - 0.05 * dm[idx(x, y)];
        if (v > best.v) best = { v, x, y };
      }
    l.x = best.x;
    l.y = best.y;
    if (best.x !== ox || best.y !== oy) logs.push({ kind: 'lamp', id: l.id, fx: ox, fy: oy, tx: best.x, ty: best.y });
  }
  return logs;
}

function startTurn(b: Battle): void {
  for (const l of b.lamps) {
    if (l.flicker) {
      const r = new Rng(hash(b.seed, 'flicker', l.id, b.turn));
      l.len = r.int(1, 5) + l.plus;
    }
    l.sx = l.x;
    l.sy = l.y;
  }
}

/** Cast: resolve your strike, then the enemies move, then the next turn starts. */
export function cast(b: Battle): RoundLog {
  for (const l of b.lamps) [l.sx, l.sy] = [l.x, l.y];
  const res = resolve(b);
  const dead = applyResolution(b, res);
  const log: RoundLog = { res, dead, moves: [], dark: [], darkDead: [] };
  if (b.over) return log;
  log.moves = enemyPhase(b);
  b.turn++;
  if (b.turn > DARK_TURN) {
    const d = darkDamage(b.turn);
    for (const f of b.figs) {
      if (f.side === 'you') b.taken += Math.min(d, f.hp);
      else b.dealt += Math.min(d, f.hp);
      f.hp -= d;
      log.dark.push({ fig: f.id, dmg: d });
    }
    log.darkDead = removeDead(b);
    checkOver(b);
  }
  startTurn(b);
  return log;
}

// ---------- Room generator ----------

export interface HeroState {
  kind: HeroKind;
  hp: number;
  max: number;
  atk: number;
  tall: number;
}

export interface LampState {
  kind: LampKind;
  reach: number;
  plus: number;
  dmg: number;
  move: number;
}

export type RoomKind = 'fight' | 'elite' | 'boss';

export function lampFromState(s: LampState): Omit<Lamp, 'id' | 'x' | 'y' | 'sx' | 'sy' | 'slot' | 'side' | 'bearer'> {
  const d = LAMPS[s.kind];
  return { kind: s.kind, reach: s.reach, len: d.len + s.plus, plus: s.plus, dmg: s.dmg, move: s.move, heal: d.heal, flicker: d.flicker };
}

export function newLampState(kind: LampKind): LampState {
  const d = LAMPS[kind];
  return { kind, reach: d.reach, plus: 0, dmg: d.dmg, move: d.move };
}

export function newHeroState(kind: HeroKind): HeroState {
  const d = HEROES[kind];
  return { kind, hp: d.hp, max: d.hp, atk: d.atk, tall: d.tall };
}

function enemyLamp(b: Battle, kind: LampKind, x: number, y: number, bearer: number): Lamp {
  const d = LAMPS[kind];
  return {
    id: b.nextId++,
    side: 'foe',
    kind,
    x,
    y,
    sx: x,
    sy: y,
    reach: d.reach,
    len: d.len,
    plus: 0,
    dmg: d.dmg,
    move: bearer >= 0 ? 0 : d.move,
    heal: 0,
    flicker: false,
    bearer,
    slot: -1,
  };
}

/** Can one of your figures reach this enemy with a shadow from some lamp spot? */
function alignable(b: Battle, f: Fig): boolean {
  for (const h of yours(b))
    for (const [fx, fy] of figTiles(f)) {
      const d = cheb(fx, fy, h.x, h.y);
      if (d < 1 || d > 2 + h.tall || !los(b, h.x, h.y, fx, fy)) continue;
      const [sx, sy] = shadowStep(h.x - fx, h.y - fy, 1);
      const lx = h.x + sx;
      const ly = h.y + sy;
      if (inside(lx, ly) && !b.walls[idx(lx, ly)]) return true;
    }
  return false;
}

export function foeCount(act: number, room: number, kind: RoomKind): number {
  if (kind === 'boss') return 1 + act;
  return 2 + act + (room >= 2 ? 1 : 0) + (kind === 'elite' ? 1 : 0);
}

export function makeBattle(seed: number, act: number, room: number, kind: RoomKind, heroes: HeroState[], lamps: LampState[], perTurn: number): Battle {
  const actDef = ACTS[act];
  for (let tries = 0; ; tries++) {
    const rng = new Rng(hash(seed, 'room', tries));
    const b: Battle = { walls: new Array(W * H).fill(0), figs: [], lamps: [], turn: 1, perTurn, seed, over: '', boss: kind === 'boss', nextId: 1, kills: 0, dealt: 0, taken: 0 };
    // Walls: a few pillars in the middle rows, some short bars.
    const nWalls = rng.int(4, 7);
    for (let i = 0; i < nWalls; i++) {
      const x = rng.int(0, W - 1);
      const y = rng.int(2, H - 3);
      b.walls[idx(x, y)] = 1;
      if (rng.chance(0.3)) {
        const [dx, dy] = rng.pick([[1, 0], [0, 1]] as const);
        if (inside(x + dx, y + dy) && y + dy <= H - 3) b.walls[idx(x + dx, y + dy)] = 1;
      }
    }
    const fg = () => figGrid(b);
    const free = (x: number, y: number) => inside(x, y) && !b.walls[idx(x, y)] && fg()[idx(x, y)] < 0 && !b.lamps.some((l) => l.x === x && l.y === y);
    const spot = (y0: number, y1: number): [number, number] | null => {
      for (let t = 0; t < 60; t++) {
        const x = rng.int(0, W - 1);
        const y = rng.int(y0, y1);
        if (free(x, y)) return [x, y];
      }
      return null;
    };
    // Your figures in the lower half.
    heroes.forEach((h, slot) => {
      const p = spot(4, H - 1);
      if (!p) return;
      const d = HEROES[h.kind];
      b.figs.push({ id: b.nextId++, side: 'you', kind: h.kind, x: p[0], y: p[1], cells: [[0, 0]], hp: h.hp, max: h.max, atk: h.atk, tall: h.tall, pierce: !!d.pierce, walk: 0, slot, boss: false });
    });
    if (b.figs.length < heroes.length) continue;
    // Enemies in the upper half.
    const addFoe = (k: FoeKind, x: number, y: number, extraHp: number) => {
      const d = FOES[k];
      const f: Fig = {
        id: b.nextId++,
        side: 'foe',
        kind: k,
        x,
        y,
        cells: [[0, 0], ...(d.cells ?? [])],
        hp: d.hp + extraHp,
        max: d.hp + extraHp,
        atk: d.atk,
        tall: d.tall,
        pierce: false,
        walk: d.walk ?? 0,
        slot: -1,
        boss: !!d.cells,
      };
      b.figs.push(f);
      if (d.lamp) b.lamps.push(enemyLamp(b, d.lamp, x, y, f.id));
      return f;
    };
    let ok = true;
    const extra = actDef.hp + (kind === 'elite' ? 1 : 0);
    const kinds: FoeKind[] = [];
    if (kind === 'boss') {
      const bd = FOES[actDef.boss];
      let placed = false;
      for (let t = 0; t < 60 && !placed; t++) {
        const x = rng.int(0, W - 3);
        const y = rng.int(1, 2);
        const cells = [[0, 0], ...(bd.cells ?? [])];
        if (cells.every(([dx, dy]) => free(x + dx, y + dy))) {
          const boss = addFoe(actDef.boss, x, y, 0);
          placed = alignable(b, boss);
          if (!placed) b.figs.pop();
        }
      }
      if (!placed) continue;
      for (let i = 0; i < actDef.wisps; i++) {
        const p = spot(0, 2);
        if (p) b.lamps.push(enemyLamp(b, 'wisp', p[0], p[1], -1));
      }
      const n = foeCount(act, room, kind) - 1;
      for (let i = 0; i < n; i++) kinds.push(rng.weighted(actDef.foes));
    } else {
      const n = foeCount(act, room, kind);
      kinds.push(rng.pick(['bearer', ...(act > 0 ? (['torcher'] as const) : [])] as FoeKind[]));
      while (kinds.length < n) kinds.push(rng.weighted(actDef.foes));
    }
    for (const k of kinds) {
      let placed = false;
      for (let t = 0; t < 40 && !placed; t++) {
        const p = spot(0, 3);
        if (!p) break;
        const f = addFoe(k, p[0], p[1], extra);
        // Enemies that never walk must be reachable by one of your shadows.
        if (f.walk === 0 && !alignable(b, f)) {
          b.figs.pop();
          continue;
        }
        if (yours(b).some((h) => cheb(h.x, h.y, f.x, f.y) < 2)) {
          b.figs.pop();
          b.lamps = b.lamps.filter((l) => l.bearer !== f.id);
          continue;
        }
        placed = true;
      }
      if (!placed) ok = false;
    }
    if (!ok && tries < 50) continue;
    // Your lamps behind your figures.
    lamps.forEach((s, slot) => {
      const p = spot(5, H - 1) ?? spot(3, H - 1);
      if (!p) return;
      b.lamps.push({ id: b.nextId++, side: 'you', x: p[0], y: p[1], sx: p[0], sy: p[1], bearer: -1, slot, ...lampFromState(s) });
    });
    startTurn(b);
    return b;
  }
}

// ---------- Bots ----------

export interface BotMove {
  lamp: number;
  x: number;
  y: number;
}

/** Value of the coming strike for you. */
export function youValue(b: Battle, r = resolve(b)): number {
  const s = score(b, r);
  return s.dealt + 3 * s.kills - 1.2 * s.taken - 5 * s.lost + 0.6 * s.healed;
}

/** Every single-lamp move (and holding still) with its value for the coming strike. */
function candidates(b: Battle): { v: number; mv: BotMove | null }[] {
  const out: { v: number; mv: BotMove | null }[] = [{ v: youValue(b), mv: null }];
  for (const l of b.lamps) {
    if (!canMove(b, l) || isMoved(l)) continue;
    const ox = l.x;
    const oy = l.y;
    for (const t of dests(b, l)) {
      l.x = t % W;
      l.y = Math.floor(t / W);
      out.push({ v: youValue(b), mv: { lamp: l.id, x: l.x, y: l.y } });
    }
    l.x = ox;
    l.y = oy;
  }
  return out;
}

/**
 * Search every lamp and every legal tile, one lamp at a time.
 * With `look` > 0 the best few moves are also played out: enemy turn, then your best next strike.
 */
export function bestMoves(b: Battle, look = 4): BotMove[] {
  const work = clone(b);
  const out: BotMove[] = [];
  for (let m = 0; m < work.perTurn; m++) {
    const cands = candidates(work).sort((p, q) => q.v - p.v);
    let best = cands[0];
    if (look > 0 && m === work.perTurn - 1) {
      let bestV = -1e9;
      for (const c of cands.slice(0, look)) {
        const sim = clone(work);
        if (c.mv) moveLamp(sim, c.mv.lamp, c.mv.x, c.mv.y);
        cast(sim);
        const next = sim.over === 'win' ? 20 : sim.over === 'lose' ? -20 : Math.max(...candidates(sim).map((n) => n.v));
        const v = c.v + 0.7 * next;
        if (v > bestV + 1e-9) {
          bestV = v;
          best = c;
        }
      }
    }
    if (!best.mv) break;
    moveLamp(work, best.mv.lamp, best.mv.x, best.mv.y);
    out.push(best.mv);
  }
  return out;
}

/** A random lamp to a random legal tile. */
export function randomMoves(b: Battle, rng: Rng): BotMove[] {
  const ls = b.lamps.filter((l) => canMove(b, l));
  if (!ls.length || rng.chance(0.1)) return [];
  const l = rng.pick(ls);
  const ds = dests(b, l);
  if (!ds.length) return [];
  const t = rng.pick(ds);
  return [{ lamp: l.id, x: t % W, y: Math.floor(t / W) }];
}
