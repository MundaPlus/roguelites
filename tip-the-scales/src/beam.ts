/**
 * Pure beam rules. Every function that changes a battle works on a copy.
 *
 * Tilt rule:
 *   moment = sum of weight × (cell − pivot)
 *   tilt   = moment ÷ step, rounded toward zero, then + sway, capped at ±LIMIT.
 * Slide rule (after every action):
 *   slide = |tilt| − 1 − grip cells toward the low end (never below 0).
 *   At the limit (|tilt| = 4) grip does not help: every unit slides 3.
 *   Floating and braced units never slide. Ice adds 1 to any slide.
 *   A unit cannot brace two turns in a row (no endless stalemates).
 *   A unit stops at the next unit. A unit that slides past the edge falls.
 *   Then the tilt is measured again, until nothing moves.
 */
import { BEAMS, KINDS, type Team } from './data';
import { Rng, hash } from './rng';

export const LIMIT = 4;
/** A fight that lasts longer than this many rounds ends: the enemies give up. */
export const MAX_ROUNDS = 30;

export interface Unit {
  id: number;
  kind: string;
  team: Team;
  x: number;
  hp: number;
  max: number;
  w: number;
  grip: number;
  move: number;
  atk: number;
  knock: number;
  range: number;
  skills: string[];
  float: boolean;
  grow: number;
  boss: boolean;
  hits: number;
  ballast: number;
  braced: boolean;
  /** Braced during its last turn: cannot brace again this turn. */
  tired: boolean;
  moved: boolean;
  acted: boolean;
  /** Index into the run party (allies only). */
  pi: number;
}

export interface Battle {
  beam: string;
  R: number;
  step: number;
  pivots: number[];
  ice: boolean;
  /** Rope swing: +1 or −1 added to the tilt. 0 on other beams. */
  sway: number;
  boots: boolean;
  /** Climbing Rope saves left this fight. */
  rope: number;
  units: Unit[];
  nextId: number;
  round: number;
  over: null | 'win' | 'lose';
  seed: number;
  stats: { tipped: number; kills: number; lost: number };
  /** Party indexes of allies lost this fight. */
  dead: number[];
}

export type Action =
  | { t: 'move'; id: number; to: number }
  | { t: 'attack'; id: number; tg: number }
  | { t: 'skill'; id: number; s: string; tg: number }
  | { t: 'brace'; id: number };

export type Ev =
  | { k: 'dmg'; id: number; n: number; x: number }
  | { k: 'fall'; id: number; x: number }
  | { k: 'die'; id: number; x: number }
  | { k: 'slide'; id: number; from: number; to: number }
  | { k: 'move'; id: number; from: number; to: number }
  | { k: 'push'; id: number; from: number; to: number }
  | { k: 'hang'; id: number; x: number }
  | { k: 'bump'; id: number; x: number }
  | { k: 'spawn'; id: number; x: number }
  | { k: 'brace'; id: number; x: number };

/** One snapshot for the animation. */
export interface Frame {
  tilt: number;
  pos: Record<number, number>;
}

export interface Result {
  b: Battle;
  frames: Frame[];
  evs: (Ev & { f: number })[];
}

// ---------- Basics ----------

export function clone(b: Battle): Battle {
  return {
    ...b,
    pivots: b.pivots,
    units: b.units.map((u) => ({ ...u })),
    stats: { ...b.stats },
    dead: [...b.dead],
  };
}

export function weight(u: Unit): number {
  return u.w + Math.min(4, u.hits * u.grow) + u.ballast;
}

export const unitAt = (b: Battle, x: number): Unit | undefined => b.units.find((u) => u.x === x);
export const unitById = (b: Battle, id: number): Unit | undefined => b.units.find((u) => u.id === id);
export const allies = (b: Battle): Unit[] => b.units.filter((u) => u.team === 'ally');
export const enemies = (b: Battle): Unit[] => b.units.filter((u) => u.team === 'enemy');

/** The moment around the active pivot. With two pivots it is 0 while the weight sits between them. */
export function momentInfo(b: Battle): { m: number; pivot: number | null } {
  if (b.pivots.length === 1) {
    const p = b.pivots[0];
    let m = 0;
    for (const u of b.units) m += weight(u) * (u.x - p);
    return { m, pivot: p };
  }
  const pl = b.pivots[0];
  const pr = b.pivots[b.pivots.length - 1];
  let mr = 0;
  let ml = 0;
  for (const u of b.units) {
    mr += weight(u) * (u.x - pr);
    ml += weight(u) * (u.x - pl);
  }
  if (mr > 0) return { m: mr, pivot: pr };
  if (ml < 0) return { m: ml, pivot: pl };
  return { m: 0, pivot: null };
}

export function tiltOf(b: Battle): number {
  const { m } = momentInfo(b);
  const t = Math.trunc(m / b.step) + b.sway;
  return Math.max(-LIMIT, Math.min(LIMIT, t));
}

/** Cells the unit slides at this tilt (before it hits something). */
export function slideDist(b: Battle, u: Unit, t: number): number {
  if (u.float || u.braced || t === 0) return 0;
  const a = Math.abs(t);
  let d = a >= LIMIT ? LIMIT - 1 : Math.max(0, a - 1 - u.grip);
  if (d > 0 && b.ice && !(u.team === 'ally' && b.boots)) d += 1;
  return d;
}

/** The tilt at which this unit starts to slide. */
export function slideAt(u: Unit): number {
  if (u.float) return 99;
  return Math.min(LIMIT, 2 + u.grip);
}

export function makeUnit(b: Battle, kind: string, x: number, pi = -1): Unit {
  const k = KINDS[kind];
  const u: Unit = {
    id: b.nextId++,
    kind,
    team: k.team,
    x,
    hp: k.hp,
    max: k.hp,
    w: k.w,
    grip: k.grip,
    move: k.move,
    atk: k.atk,
    knock: k.knock,
    range: k.range,
    skills: [...k.skills],
    float: !!k.float,
    grow: k.grow ?? 0,
    boss: !!k.boss,
    hits: 0,
    ballast: 0,
    braced: false,
    tired: false,
    moved: false,
    acted: false,
    pi,
  };
  return u;
}

export function newBattle(beamId: string, seed: number): Battle {
  const d = BEAMS[beamId];
  return {
    beam: beamId,
    R: d.R,
    step: d.step,
    pivots: d.pivots,
    ice: d.ice,
    sway: d.rope ? 1 : 0,
    boots: false,
    rope: 0,
    units: [],
    nextId: 1,
    round: 1,
    over: null,
    seed,
    stats: { tipped: 0, kills: 0, lost: 0 },
    dead: [],
  };
}

// ---------- Resolution context ----------

class Ctx {
  frames: Frame[] = [];
  evs: (Ev & { f: number })[] = [];
  constructor(public b: Battle) {
    this.snap();
  }
  snap(): void {
    const pos: Record<number, number> = {};
    for (const u of this.b.units) pos[u.id] = u.x;
    this.frames.push({ tilt: tiltOf(this.b), pos });
  }
  ev(e: Ev): void {
    this.evs.push({ ...e, f: this.frames.length });
  }
  result(): Result {
    return { b: this.b, frames: this.frames, evs: this.evs };
  }
}

function remove(c: Ctx, u: Unit, fell: boolean): void {
  const b = c.b;
  b.units = b.units.filter((v) => v !== u);
  c.ev({ k: fell ? 'fall' : 'die', id: u.id, x: u.x });
  if (u.team === 'enemy') {
    if (fell) b.stats.tipped++;
    else b.stats.kills++;
  } else if (u.team === 'ally') {
    b.stats.lost++;
    b.dead.push(u.pi);
  }
}

function damage(c: Ctx, u: Unit, n: number): void {
  if (n <= 0) return;
  u.hp -= n;
  u.hits++;
  c.ev({ k: 'dmg', id: u.id, n, x: u.x });
}

function cleanup(c: Ctx): void {
  for (const u of [...c.b.units]) if (u.hp <= 0) remove(c, u, false);
}

/** Unit goes past the edge. Returns true when it really fell. */
function fallOff(c: Ctx, u: Unit): boolean {
  const b = c.b;
  if (u.team === 'ally' && b.rope > 0) {
    b.rope--;
    u.braced = true;
    c.ev({ k: 'hang', id: u.id, x: u.x });
    damage(c, u, 2);
    return false;
  }
  remove(c, u, true);
  return true;
}

/** Push a unit `n` cells in direction `dir`. Stops at a unit (1 bump damage to both) or falls off the edge. */
function push(c: Ctx, u: Unit, dir: number, n: number): void {
  const b = c.b;
  const from = u.x;
  for (let i = 0; i < n; i++) {
    const nx = u.x + dir;
    if (Math.abs(nx) > b.R) {
      if (u.x !== from) c.ev({ k: 'push', id: u.id, from, to: u.x });
      fallOff(c, u);
      return;
    }
    const o = unitAt(b, nx);
    if (o) {
      c.ev({ k: 'bump', id: o.id, x: o.x });
      damage(c, u, 1);
      damage(c, o, 1);
      break;
    }
    u.x = nx;
  }
  if (u.x !== from) c.ev({ k: 'push', id: u.id, from, to: u.x });
}

/** Slide units until the beam is still. */
function settle(c: Ctx): void {
  const b = c.b;
  for (let pass = 0; pass < 12; pass++) {
    const t = tiltOf(b);
    if (t === 0) break;
    const dir = Math.sign(t);
    const order = [...b.units].sort((p, q) => q.x * dir - p.x * dir);
    let any = false;
    for (const u of order) {
      if (!b.units.includes(u)) continue;
      const d = slideDist(b, u, t);
      if (d <= 0) continue;
      const from = u.x;
      let fell = false;
      for (let i = 0; i < d; i++) {
        const nx = u.x + dir;
        if (Math.abs(nx) > b.R) {
          if (u.x !== from) c.ev({ k: 'slide', id: u.id, from, to: u.x });
          fell = true;
          any = true;
          fallOff(c, u);
          break;
        }
        if (unitAt(b, nx)) break;
        u.x = nx;
      }
      if (!fell && u.x !== from) {
        any = true;
        c.ev({ k: 'slide', id: u.id, from, to: u.x });
      }
    }
    cleanup(c);
    if (!any) break;
    c.snap();
  }
}

function checkOver(b: Battle): void {
  if (b.over) return;
  if (!allies(b).length) b.over = 'lose';
  else if (!enemies(b).length) b.over = 'win';
}

// ---------- Legal options ----------

/** Cells a unit can walk to. It can pass its own team, not others. */
export function reach(b: Battle, u: Unit): number[] {
  if (u.moved || u.acted || u.move <= 0) return [];
  const out: number[] = [];
  for (const dir of [-1, 1]) {
    for (let i = 1; i <= u.move; i++) {
      const x = u.x + dir * i;
      if (Math.abs(x) > b.R) break;
      const o = unitAt(b, x);
      if (o && o.team !== u.team) break;
      if (!o) out.push(x);
    }
  }
  return out;
}

export function attackTargets(b: Battle, u: Unit): Unit[] {
  if (u.acted || u.atk <= 0) return [];
  return b.units.filter((o) => {
    if (o.team === u.team) return false;
    const d = Math.abs(o.x - u.x);
    if (d < 1 || d > u.range) return false;
    if (u.range === 1) return true;
    return true;
  });
}

/** Targets of a skill: unit ids, or cells for leap and drop. */
export function skillTargets(b: Battle, u: Unit, s: string): number[] {
  if (u.acted) return [];
  const dist = (o: Unit) => Math.abs(o.x - u.x);
  switch (s) {
    case 'shove':
      return b.units.filter((o) => o !== u && dist(o) === 1).map((o) => o.id);
    case 'hook':
      return b.units
        .filter((o) => o !== u && dist(o) >= 2 && dist(o) <= 4)
        .filter((o) => !unitAt(b, u.x + Math.sign(o.x - u.x)))
        .map((o) => o.id);
    case 'swap':
      return b.units.filter((o) => o !== u && dist(o) <= 2).map((o) => o.id);
    case 'ballast':
    case 'slam':
      return [u.id];
    case 'leap': {
      const out: number[] = [];
      for (let x = -b.R; x <= b.R; x++) if (x !== u.x && Math.abs(x - u.x) <= 4 && !unitAt(b, x)) out.push(x);
      return out;
    }
    case 'drop': {
      const out: number[] = [];
      for (let x = -b.R; x <= b.R; x++) if (!unitAt(b, x)) out.push(x);
      return out;
    }
  }
  return [];
}

/** True when the skill targets a cell, not a unit. */
export const cellSkill = (s: string): boolean => s === 'leap' || s === 'drop';

export function actOptions(b: Battle, u: Unit): Action[] {
  if (u.acted) return [];
  const out: Action[] = [];
  for (const o of attackTargets(b, u)) out.push({ t: 'attack', id: u.id, tg: o.id });
  for (const s of u.skills) for (const tg of skillTargets(b, u, s)) out.push({ t: 'skill', id: u.id, s, tg });
  if (canBrace(u)) out.push({ t: 'brace', id: u.id });
  return out;
}

export function canBrace(u: Unit): boolean {
  return !u.acted && !u.tired;
}

export function canAct(u: Unit): boolean {
  return !u.acted;
}

// ---------- Apply ----------

export function apply(b0: Battle, a: Action): Result {
  const b = clone(b0);
  const c = new Ctx(b);
  const u = unitById(b, a.id);
  if (!u || b.over) return c.result();
  switch (a.t) {
    case 'move': {
      const from = u.x;
      u.x = a.to;
      u.moved = true;
      c.ev({ k: 'move', id: u.id, from, to: a.to });
      break;
    }
    case 'attack': {
      const o = unitById(b, a.tg);
      u.moved = u.acted = true;
      if (!o) break;
      damage(c, o, u.atk);
      if (o.hp > 0 && u.knock > 0) push(c, o, Math.sign(o.x - u.x), u.knock);
      break;
    }
    case 'brace':
      if (u.tired) break;
      u.moved = u.acted = true;
      u.braced = true;
      c.ev({ k: 'brace', id: u.id, x: u.x });
      break;
    case 'skill':
      u.moved = u.acted = true;
      doSkill(c, u, a.s, a.tg);
      break;
  }
  cleanup(c);
  c.snap();
  settle(c);
  checkOver(b);
  return c.result();
}

function doSkill(c: Ctx, u: Unit, s: string, tg: number): void {
  const b = c.b;
  switch (s) {
    case 'shove': {
      const o = unitById(b, tg);
      if (o) push(c, o, Math.sign(o.x - u.x), 2);
      break;
    }
    case 'hook': {
      const o = unitById(b, tg);
      if (!o) break;
      damage(c, o, 1);
      if (o.hp <= 0) break;
      const dir = Math.sign(u.x - o.x);
      const from = o.x;
      while (o.x + dir !== u.x && !unitAt(b, o.x + dir)) o.x += dir;
      if (o.x !== from) c.ev({ k: 'push', id: o.id, from, to: o.x });
      break;
    }
    case 'swap': {
      const o = unitById(b, tg);
      if (!o) break;
      const x = u.x;
      c.ev({ k: 'move', id: u.id, from: u.x, to: o.x });
      c.ev({ k: 'move', id: o.id, from: o.x, to: x });
      u.x = o.x;
      o.x = x;
      break;
    }
    case 'ballast':
      u.ballast += 3;
      c.ev({ k: 'brace', id: u.id, x: u.x });
      break;
    case 'slam':
      for (const o of b.units.filter((v) => Math.abs(v.x - u.x) === 1)) {
        damage(c, o, 1);
        if (o.hp > 0) push(c, o, Math.sign(o.x - u.x), 1);
      }
      break;
    case 'leap': {
      const from = u.x;
      u.x = tg;
      c.ev({ k: 'move', id: u.id, from, to: tg });
      break;
    }
    case 'drop': {
      if (unitAt(b, tg)) break;
      const n = makeUnit(b, 'boulder', tg);
      b.units.push(n);
      c.ev({ k: 'spawn', id: n.id, x: tg });
      break;
    }
  }
}

/** Start of a team's turn: clear its flags. */
export function startTurn(b0: Battle, team: Team): Battle {
  const b = clone(b0);
  for (const u of b.units) {
    if (u.team !== team) continue;
    u.moved = u.acted = false;
    u.tired = u.braced;
    u.braced = false;
    u.ballast = 0;
  }
  return b;
}

/** End of the player turn: flip the sway on a rope swing and let the beam settle. */
export function endPlayerTurn(b0: Battle): Result {
  const b = clone(b0);
  const c = new Ctx(b);
  if (b.sway) {
    b.sway = -b.sway;
    c.snap();
  }
  settle(c);
  checkOver(b);
  return c.result();
}

// ---------- Enemy AI ----------

/** How well the enemy sees tipping, by act. */
export interface AiCfg {
  tipSense: number;
  noise: number;
}

function totalHp(b: Battle, team: Team): number {
  let s = 0;
  for (const u of b.units) if (u.team === team) s += Math.max(0, u.hp);
  return s;
}

/** Score a state from the view of `team`. Higher is better. */
export function evalFor(b: Battle, team: Team, tipSense = 1): number {
  const foe: Team = team === 'ally' ? 'enemy' : 'ally';
  if (b.over === 'win') return team === 'ally' ? 1e6 : -1e6;
  if (b.over === 'lose') return team === 'ally' ? -1e6 : 1e6;
  const mine = b.units.filter((u) => u.team === team);
  const theirs = b.units.filter((u) => u.team === foe);
  let s = 0;
  s += mine.length * 14 - theirs.length * 14;
  s += totalHp(b, team) * 1.2 - totalHp(b, foe) * 2;
  // Danger: units near the low edge at a high tilt.
  const t = tiltOf(b);
  const dir = Math.sign(t);
  const danger = (u: Unit): number => {
    if (u.float) return 0;
    const fromEdge = dir ? b.R - u.x * dir : b.R - Math.abs(u.x);
    const head = slideAt(u) - Math.abs(t);
    let d = 0;
    if (fromEdge <= 1) d += 1.5;
    if (dir && head <= 1) d += (2 - head) * (fromEdge <= 2 ? 2.5 : 0.8);
    return d;
  };
  for (const u of mine) s -= danger(u) * tipSense * 2.5;
  for (const u of theirs) s += danger(u) * tipSense * 1.5;
  return s;
}

/** Best move + action for one enemy. */
export function planUnit(b: Battle, id: number, cfg: AiCfg): Action[] {
  const u = unitById(b, id);
  if (!u) return [];
  const rng = new Rng(hash(b.seed, b.round, id));
  let best: Action[] = [];
  let bestS = -Infinity;
  const allyPos = allies(b).map((a) => a.x);
  const starts: (number | null)[] = [null, ...reach(b, u)];
  for (const to of starts) {
    let b1 = b;
    const pre: Action[] = [];
    if (to !== null) {
      const mv: Action = { t: 'move', id, to };
      b1 = apply(b, mv).b;
      pre.push(mv);
      if (b1.over || !unitById(b1, id)) {
        const s = scoreE(b, b1, cfg) + rng.next() * cfg.noise;
        if (s > bestS) {
          bestS = s;
          best = pre;
        }
        continue;
      }
    }
    const u1 = unitById(b1, id)!;
    const opts = actOptions(b1, u1);
    for (const a of opts) {
      const b2 = apply(b1, a).b;
      let s = scoreE(b, b2, cfg) + rng.next() * cfg.noise;
      const me = unitById(b2, id);
      if (me && allyPos.length) s -= 0.3 * Math.min(...allies(b2).map((p) => Math.abs(p.x - me.x)), 9);
      if (a.t === 'brace') s -= 1.5;
      if (s > bestS) {
        bestS = s;
        best = [...pre, a];
      }
    }
  }
  return best;
}

function scoreE(b0: Battle, b1: Battle, cfg: AiCfg): number {
  if (b1.over === 'lose') return 1e5;
  const dmg = totalHp(b0, 'ally') - totalHp(b1, 'ally');
  const allyGone = allies(b0).length - allies(b1).length;
  const ownGone = enemies(b0).length - enemies(b1).length;
  const ownDmg = totalHp(b0, 'enemy') - totalHp(b1, 'enemy');
  let s = dmg * 3 + allyGone * 14 * (0.5 + cfg.tipSense / 2) - ownGone * 12 * cfg.tipSense - ownDmg * 1.5;
  // Pressure: ally danger after the move.
  const t = tiltOf(b1);
  if (t) {
    const dir = Math.sign(t);
    for (const a of allies(b1)) {
      if (a.float) continue;
      const fromEdge = b1.R - a.x * dir;
      const head = slideAt(a) - Math.abs(t);
      if (head <= 1 && fromEdge <= 2) s += 2 * cfg.tipSense;
    }
    for (const e of enemies(b1)) {
      if (e.float) continue;
      const fromEdge = b1.R - e.x * dir;
      const head = slideAt(e) - Math.abs(t);
      if (head <= 1 && fromEdge <= 2) s -= 2 * cfg.tipSense;
    }
  }
  return s;
}

/** Order in which enemies act. */
export function enemyOrder(b: Battle): number[] {
  return enemies(b)
    .slice()
    .sort((p, q) => p.id - q.id)
    .map((u) => u.id);
}
