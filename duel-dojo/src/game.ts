/** Pure fight simulation at a locked 60 Hz. One call of `step` = one frame. */
import { NORMALS, SPECIALS, SUPERS, type BoxDef, type FighterDef, type Level, type Mods, type MoveDef, type ProjDef, type Slot } from './data';
import { Rng } from './rng';

export const W = 640;
export const H = 360;
export const GROUND = 314;
export const WALL_L = 22;
export const WALL_R = 618;
export const GRAV = 0.55;
export const ROUND_FRAMES = 60 * 60;
const HALF = 18;
const BUFFER = 8;
const DOWN_FRAMES = 42;

export interface Input {
  l: boolean;
  r: boolean;
  u: boolean;
  d: boolean;
  /** Light attack. */
  a: boolean;
  /** Heavy attack. */
  b: boolean;
  /** Special. */
  s: boolean;
  /** Throw. */
  t: boolean;
}

export const noInput = (): Input => ({ l: false, r: false, u: false, d: false, a: false, b: false, s: false, t: false });

export type St = 'idle' | 'walk' | 'crouch' | 'prejump' | 'air' | 'land' | 'move' | 'hit' | 'block' | 'fall' | 'down' | 'ko' | 'thrown';

/** Frames a thrown fighter has to break the throw. */
export const TECH_WINDOW = 10;

type Btn = 'a' | 'b' | 's' | 't';
interface Press {
  b: Btn;
  dir: number;
  age: number;
  motion: Slot | null;
}

export interface Stats {
  dealt: number;
  taken: number;
  hits: number;
  blocks: number;
  throws: number;
  supers: number;
  counters: number;
  maxCombo: number;
}

export interface Fighter {
  side: 0 | 1;
  def: FighterDef;
  name: string;
  gi: string;
  belt: string;
  hair: string;
  mods: Mods;
  specials: Partial<Record<Slot, string>>;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  hp: number;
  maxHp: number;
  meter: number;
  st: St;
  /** Frames in the current state. */
  t: number;
  /** Walk direction for drawing: 1 forward, -1 back. */
  walk: number;
  move: MoveDef | null;
  /** Frame of the current move, 1-based once it starts. */
  mf: number;
  /** Last hit segment that connected (multi-hit moves). */
  seg: number;
  /** Hits or blocks caused by this move. */
  contact: number;
  chain: number;
  motionBonus: boolean;
  stun: number;
  crouchBlock: boolean;
  inv: number;
  /** Hits taken in the current combo. */
  combo: number;
  comboDmg: number;
  airUsed: boolean;
  jumpVx: number;
  buf: Press[];
  dirs: number[];
  prev: Input;
  flash: number;
  usedWind: boolean;
  firstHit: boolean;
  ko: boolean;
  stats: Stats;
}

export interface Proj {
  owner: 0 | 1;
  def: ProjDef;
  x: number;
  vx: number;
  hits: number;
  life: number;
  cool: number;
  mult: number;
  age: number;
}

export type EvKind = 'hit' | 'block' | 'throw' | 'tech' | 'super' | 'parry' | 'proj' | 'whiff' | 'jump' | 'clash' | 'wind' | 'special' | 'land' | 'down';

export interface Ev {
  k: EvKind;
  x: number;
  y: number;
  /** The fighter the event is about (victim for hits). */
  side: 0 | 1;
  dmg?: number;
  big?: boolean;
  counter?: boolean;
  combo?: number;
  text?: string;
}

export interface Fight {
  fs: [Fighter, Fighter];
  projs: Proj[];
  frame: number;
  timer: number;
  hitstop: number;
  freeze: number;
  freezeSide: 0 | 1;
  over: null | { winner: 0 | 1 | -1; reason: 'ko' | 'time' };
  events: Ev[];
  rng: Rng;
}

export interface FighterSetup {
  def: FighterDef;
  name: string;
  gi: string;
  belt: string;
  hair: string;
  mods: Mods;
  specials: Partial<Record<Slot, string>>;
  hp: number;
  maxHp: number;
}

const emptyStats = (): Stats => ({ dealt: 0, taken: 0, hits: 0, blocks: 0, throws: 0, supers: 0, counters: 0, maxCombo: 0 });

function makeFighter(side: 0 | 1, s: FighterSetup): Fighter {
  return {
    side,
    def: s.def,
    name: s.name,
    gi: s.gi,
    belt: s.belt,
    hair: s.hair,
    mods: s.mods,
    specials: { ...s.specials },
    x: side === 0 ? 230 : 410,
    y: 0,
    vx: 0,
    vy: 0,
    face: side === 0 ? 1 : -1,
    hp: s.hp,
    maxHp: s.maxHp,
    meter: s.mods.startMeter,
    st: 'idle',
    t: 0,
    walk: 0,
    move: null,
    mf: 0,
    seg: -1,
    contact: 0,
    chain: 0,
    motionBonus: false,
    stun: 0,
    crouchBlock: false,
    inv: 0,
    combo: 0,
    comboDmg: 0,
    airUsed: false,
    jumpVx: 0,
    buf: [],
    dirs: [],
    prev: noInput(),
    flash: 0,
    usedWind: false,
    firstHit: false,
    ko: false,
    stats: emptyStats(),
  };
}

export function newFight(a: FighterSetup, b: FighterSetup, seed: number): Fight {
  return { fs: [makeFighter(0, a), makeFighter(1, b)], projs: [], frame: 0, timer: ROUND_FRAMES, hitstop: 0, freeze: 0, freezeSide: 0, over: null, events: [], rng: new Rng(seed) };
}

// ---------- Boxes ----------

export interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

export function toWorld(f: Fighter, b: BoxDef): Box {
  const s = f.def.size;
  const dx = b[0] * s;
  const w = b[2] * s;
  const x1 = f.face > 0 ? f.x + dx : f.x - dx - w;
  const y1 = f.y + b[1] * s;
  return { x1, x2: x1 + w, y1, y2: y1 + b[3] * s };
}

const overlap = (a: Box, b: Box): boolean => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

export type Phase = 'startup' | 'active' | 'recovery' | null;

export function phase(f: Fighter): Phase {
  const m = f.move;
  if (f.st !== 'move' || !m) return null;
  if (f.mf <= m.startup) return 'startup';
  if (f.mf <= m.startup + m.active) return 'active';
  return 'recovery';
}

const isCrouching = (f: Fighter): boolean => f.st === 'crouch' || (f.st === 'block' && f.crouchBlock) || (f.st === 'move' && !!f.move?.crouch);

export function isInvul(f: Fighter): boolean {
  if (f.inv > 0 || f.st === 'fall' || f.st === 'down' || f.st === 'ko' || f.st === 'thrown') return true;
  const m = f.move;
  return f.st === 'move' && !!m?.invul && f.mf >= m.invul[0] && f.mf <= m.invul[1];
}

export function hurtboxes(f: Fighter): Box[] {
  if (isInvul(f)) return [];
  const m = f.st === 'move' ? f.move : null;
  let body: BoxDef;
  if (m?.body && f.mf >= 1 && f.mf <= m.startup + m.active) body = m.body;
  else if (isCrouching(f)) body = [-20, 0, 40, 62];
  else if (f.y > 0 || f.st === 'air') body = [-16, 4, 32, 76];
  else body = [-HALF, 0, HALF * 2, 100];
  const out = [toWorld(f, body)];
  const ph = phase(f);
  if (m && !m.proj && !m.parry && m.box[2] > 0 && (ph === 'active' || (ph === 'recovery' && f.mf <= m.startup + m.active + m.recovery / 2))) {
    out.push(toWorld(f, [Math.max(m.box[0], 0), m.box[1], m.box[2] * 0.75, m.box[3]]));
  }
  return out;
}

/** The active hitbox, or null. */
export function hitbox(f: Fighter): Box | null {
  const m = f.move;
  if (!m || phase(f) !== 'active' || m.proj || m.parry || m.box[2] <= 0) return null;
  const b: BoxDef = m.level === 'throw' ? [m.box[0], m.box[1], m.box[2] + f.mods.throwRange, m.box[3]] : m.box;
  return toWorld(f, b);
}

export const projBox = (p: Proj): Box => ({ x1: p.x - p.def.w / 2, x2: p.x + p.def.w / 2, y1: p.def.y, y2: p.def.y + p.def.h });

// ---------- Input ----------

/** Numpad direction relative to the facing: 6 = forward, 4 = back, 2 = down, 8 = up. */
export function dirOf(face: number, i: Input): number {
  const right = i.r && !i.l;
  const left = i.l && !i.r;
  const fwd = face > 0 ? right : left;
  const back = face > 0 ? left : right;
  const h = back ? 0 : fwd ? 2 : 1;
  const v = i.d ? 0 : i.u ? 2 : 1;
  return v * 3 + h + 1;
}

function seqIn(dirs: number[], seq: number[][], window: number): boolean {
  let k = 0;
  for (let i = Math.max(0, dirs.length - window); i < dirs.length && k < seq.length; i++) if (seq[k].includes(dirs[i])) k++;
  return k === seq.length;
}

/** Motion inputs, newest direction last. */
export function detectMotion(dirs: number[]): Slot | null {
  if (seqIn(dirs, [[6], [2], [3]], 16)) return 'd';
  if (seqIn(dirs, [[2], [3], [6]], 14)) return 'f';
  if (seqIn(dirs, [[2], [1], [4]], 14)) return 'b';
  if (seqIn(dirs, [[2], [5, 4, 6], [2]], 14)) return 'n';
  return null;
}

function readInput(f: Fighter, inp: Input, age: boolean): void {
  const dir = dirOf(f.face, inp);
  f.dirs.push(dir);
  if (f.dirs.length > 24) f.dirs.shift();
  if (age) {
    for (const p of f.buf) p.age++;
    f.buf = f.buf.filter((p) => p.age <= BUFFER);
  }
  const btns: Btn[] = ['a', 'b', 's', 't'];
  let motion: Slot | null | undefined;
  for (const b of btns) {
    if (inp[b] && !f.prev[b]) {
      if ((b === 'a' || b === 'b') && motion === undefined) motion = f.mods.motion ? detectMotion(f.dirs) : null;
      f.buf.push({ b, dir, age: 0, motion: b === 'a' || b === 'b' ? (motion ?? null) : null });
    }
  }
  f.prev = { ...inp };
}

const grounded = (f: Fighter): boolean => f.y <= 0;
const freeStates: St[] = ['idle', 'walk', 'crouch'];

function canCancel(f: Fighter, m: MoveDef): boolean {
  const cur = f.move;
  if (f.st !== 'move' || !cur || cur.air || f.contact === 0 || f.mf <= cur.startup) return false;
  if (m.level === 'throw' && m.tier < 3) return false;
  if (m.tier > cur.tier) return true;
  return cur.tier === 1 && m.tier === 1 && f.chain < 2;
}

function slotFor(dir: number): Slot {
  if (dir === 6) return 'f';
  if (dir === 4) return 'b';
  if (dir <= 3) return 'd';
  return 'n';
}

function specialMove(f: Fighter, slot: Slot): MoveDef | null {
  const id = f.specials[slot] ?? f.specials.n;
  return id ? SPECIALS[id] : null;
}

function hasProj(fight: Fight, f: Fighter): boolean {
  return fight.projs.some((p) => p.owner === f.side && p.def.kind !== 'big' && p.def.kind !== 'beam');
}

/** Picks the move for the oldest usable buffered press. */
function chooseMove(fight: Fight, f: Fighter): { move: MoveDef; used: Press[]; motion: boolean } | null {
  const free = freeStates.includes(f.st) && grounded(f);
  const inAir = f.st === 'air' && !f.airUsed;
  const cancel = f.st === 'move';
  if (!free && !inAir && !cancel) return null;
  const buf = f.buf;
  const ok = (m: MoveDef | null): m is MoveDef => !!m && (free || (cancel && canCancel(f, m))) && !(m.proj && m.tier === 3 && hasProj(fight, f));
  // Super: special + heavy pressed together.
  const s = buf.find((p) => p.b === 's');
  const hv = buf.find((p) => p.b === 'b');
  if (s && hv && Math.abs(s.age - hv.age) <= 3 && f.meter >= 100 && !inAir) {
    const m = SUPERS[f.def.super];
    if (ok(m)) return { move: m, used: [s, hv], motion: false };
  }
  // Throw: throw button, or light + heavy together.
  const tp = buf.find((p) => p.b === 't');
  const lt = buf.find((p) => p.b === 'a');
  if (!inAir && (tp || (lt && hv && Math.abs(lt.age - hv.age) <= 2))) {
    if (free) return { move: NORMALS.T, used: tp ? [tp] : [lt!, hv!], motion: false };
  }
  for (const p of buf) {
    if (inAir) {
      if (p.b === 'a' || p.b === 'b') return { move: NORMALS[p.b === 'a' ? 'jL' : 'jH'], used: [p], motion: false };
      continue;
    }
    if (p.b === 's') {
      const m = specialMove(f, slotFor(p.dir));
      if (ok(m)) return { move: m, used: [p], motion: false };
      continue;
    }
    if (p.b === 'a' || p.b === 'b') {
      if (p.motion && f.specials[p.motion]) {
        const m = SPECIALS[f.specials[p.motion]!];
        if (ok(m)) return { move: m, used: [p], motion: true };
      }
      const crouch = p.dir <= 3;
      const id = p.b === 'a' ? (crouch ? 'cL' : 'L') : crouch ? 'cH' : 'H';
      if (ok(NORMALS[id])) return { move: NORMALS[id], used: [p], motion: false };
    }
  }
  return null;
}

function startMove(fight: Fight, f: Fighter, m: MoveDef, motion: boolean): void {
  const chained = f.st === 'move' && f.move?.tier === 1 && m.tier === 1;
  f.chain = chained ? f.chain + 1 : 0;
  f.st = 'move';
  f.move = m;
  f.mf = 0;
  f.seg = -1;
  f.contact = 0;
  f.motionBonus = motion;
  f.t = 0;
  if (m.air) f.airUsed = true;
  else f.vx = 0;
  if (m.tier === 4) {
    f.meter = 0;
    f.stats.supers++;
    fight.freeze = 34;
    fight.freezeSide = f.side;
    fight.events.push({ k: 'super', x: f.x, y: f.y + 60, side: f.side, text: m.name });
  } else if (m.tier === 3) {
    fight.events.push({ k: 'special', x: f.x, y: f.y + 60, side: f.side, text: m.name });
  }
}

function act(fight: Fight, f: Fighter): void {
  const pick = chooseMove(fight, f);
  if (pick) {
    f.buf = f.buf.filter((p) => !pick.used.includes(p));
    startMove(fight, f, pick.move, pick.motion);
    return;
  }
  if (!freeStates.includes(f.st) || !grounded(f)) return;
  const dir = f.dirs[f.dirs.length - 1] ?? 5;
  const spd = f.mods.speed * f.def.walk;
  if (dir >= 7) {
    f.st = 'prejump';
    f.t = 0;
    const h = dir === 9 ? 1 : dir === 7 ? -1 : 0;
    f.jumpVx = f.face * h * 3.1 * Math.sqrt(spd);
    return;
  }
  if (dir <= 3) {
    if (f.st !== 'crouch') f.t = 0;
    f.st = 'crouch';
    f.walk = 0;
    return;
  }
  if (dir === 6 || dir === 4) {
    if (f.st !== 'walk') f.t = 0;
    f.st = 'walk';
    f.walk = dir === 6 ? 1 : -1;
    f.x += f.face * (dir === 6 ? 2.3 : -1.8) * spd;
    return;
  }
  if (f.st !== 'idle') f.t = 0;
  f.st = 'idle';
  f.walk = 0;
}

function toIdle(f: Fighter): void {
  f.st = 'idle';
  f.t = 0;
  f.move = null;
  f.combo = 0;
  f.comboDmg = 0;
}

function airPhysics(f: Fighter): boolean {
  f.x += f.vx;
  f.y += f.vy;
  f.vy -= GRAV;
  if (f.y <= 0 && f.vy < 0) {
    f.y = 0;
    f.vy = 0;
    return true;
  }
  return false;
}

function spawnProj(fight: Fight, f: Fighter, d: ProjDef): void {
  const mult = f.mods.dmg * f.def.dmg * (f.move?.tier === 4 ? f.mods.superDmg : 1) * (f.motionBonus ? 1.1 : 1);
  fight.projs.push({ owner: f.side, def: d, x: f.x + f.face * (34 + d.w / 2), vx: f.face * d.speed, hits: d.hits, life: d.life, cool: 0, mult, age: 0 });
  fight.events.push({ k: 'proj', x: f.x + f.face * 34, y: d.y + d.h / 2, side: f.side });
}

function update(fight: Fight, f: Fighter): void {
  f.t++;
  switch (f.st) {
    case 'prejump':
      if (f.t >= 3) {
        f.st = 'air';
        f.t = 0;
        f.vy = 10.4;
        f.vx = f.jumpVx;
        f.airUsed = false;
        f.y = 0.1;
        fight.events.push({ k: 'jump', x: f.x, y: 0, side: f.side });
      }
      break;
    case 'air':
      if (airPhysics(f)) {
        f.st = 'land';
        f.t = 0;
        f.vx = 0;
        fight.events.push({ k: 'land', x: f.x, y: 0, side: f.side });
      }
      break;
    case 'land':
      if (f.t >= 3) toIdle(f);
      break;
    case 'move': {
      const m = f.move!;
      f.mf++;
      if (m.dash && f.mf >= m.dash.from && f.mf <= m.dash.to) f.x += f.face * m.dash.vx;
      if (m.jump && f.mf === m.jump.at) {
        f.vy = m.jump.vy;
        f.vx = f.face * m.jump.vx;
        f.y = 0.1;
      }
      if (m.proj && f.mf === m.startup + 1) spawnProj(fight, f, m.proj);
      if (f.y > 0) {
        if (airPhysics(f)) {
          f.vx = 0;
          if (m.air) {
            f.st = 'land';
            f.t = -2;
            f.move = null;
            break;
          }
        }
      }
      if (f.mf >= m.startup + m.active + m.recovery) {
        if (m.level === 'throw' && f.contact === 0 && m.tier < 4) fight.events.push({ k: 'whiff', x: f.x, y: 60, side: f.side });
        if (f.y > 0) {
          f.st = 'air';
          f.airUsed = true;
          f.move = null;
        } else toIdle(f);
      }
      break;
    }
    case 'hit':
    case 'block':
      if (--f.stun <= 0) toIdle(f);
      break;
    case 'fall':
      if (airPhysics(f)) {
        f.vx = 0;
        f.st = f.ko ? 'ko' : 'down';
        f.t = 0;
        fight.events.push({ k: 'down', x: f.x, y: 0, side: f.side });
      }
      break;
    case 'thrown':
      updateThrown(fight, f);
      break;
    case 'down':
      if (f.t >= DOWN_FRAMES - f.mods.wake) {
        toIdle(f);
        f.inv = 6;
      }
      break;
    default:
      break;
  }
  // Knockback slide on the ground.
  if (f.y <= 0 && f.st !== 'air' && f.st !== 'fall') {
    f.x += f.vx;
    f.vx *= 0.8;
    if (Math.abs(f.vx) < 0.05) f.vx = 0;
  }
}

// ---------- Hits ----------

interface Src {
  dmg: number;
  hitstun: number;
  blockstun: number;
  level: Level;
  kd: boolean;
  chip: number;
  push: number;
  tier: number;
  mult: number;
  /** X of the hit source, for the block direction. */
  fromX: number;
  hy: number;
  proj: boolean;
  noTech: boolean;
}

function holdingAway(d: Fighter, fromX: number): boolean {
  const i = d.prev;
  return fromX >= d.x ? i.l && !i.r : i.r && !i.l;
}

function canBlock(d: Fighter, s: Src): boolean {
  if (s.level === 'throw' || d.y > 0) return false;
  if (!(freeStates.includes(d.st) || d.st === 'block' || d.st === 'land')) return false;
  if (!holdingAway(d, s.fromX)) return false;
  const crouch = d.prev.d;
  if (s.level === 'low' && !crouch) return false;
  if (s.level === 'high' && crouch) return false;
  return true;
}

function addMeter(f: Fighter, n: number): void {
  f.meter = Math.min(100, f.meter + n * f.mods.meter);
}

function damage(fight: Fight, a: Fighter, d: Fighter, s: Src, counter: boolean, isThrow: boolean): number {
  let dmg = s.dmg * s.mult;
  if (isThrow) dmg *= a.def.throwDmg * a.mods.throwDmg;
  const scale = Math.max(0.35, 1 - (a.mods.momentum ? 0.06 : 0.12) * d.combo);
  dmg *= scale;
  if (counter) dmg *= a.mods.counter;
  if (a.mods.firstStrike && !a.firstHit) dmg *= 2;
  a.firstHit = true;
  dmg *= d.mods.taken;
  dmg = Math.max(1, Math.round(dmg));
  d.hp -= dmg;
  d.stats.taken += dmg;
  a.stats.dealt += dmg;
  a.stats.hits++;
  if (a.mods.vamp > 0) a.hp = Math.min(a.maxHp, a.hp + dmg * a.mods.vamp);
  d.combo++;
  d.comboDmg += dmg;
  a.stats.maxCombo = Math.max(a.stats.maxCombo, d.combo);
  addMeter(a, dmg * 1.1);
  addMeter(d, dmg * 0.5);
  d.flash = 6;
  if (d.hp <= 0) {
    d.hp = 0;
    d.ko = true;
  } else if (d.mods.secondWind && !d.usedWind && d.hp < d.maxHp * 0.3) {
    d.usedWind = true;
    d.hp = Math.min(d.maxHp, d.hp + d.maxHp * 0.15);
    fight.events.push({ k: 'wind', x: d.x, y: 110, side: d.side });
  }
  return dmg;
}

function knockdown(d: Fighter, away: number, vy: number, vx: number): void {
  d.st = 'fall';
  d.move = null;
  d.t = 0;
  d.vy = vy;
  d.vx = away * vx;
  d.y = Math.max(d.y, 0.1);
}

function applyStrike(fight: Fight, a: Fighter, d: Fighter, s: Src): void {
  const away = s.fromX <= d.x ? 1 : -1;
  // Counter stance.
  if (d.st === 'move' && d.move?.parry && phase(d) === 'active') {
    fight.events.push({ k: 'parry', x: d.x + d.face * 20, y: d.y + 70, side: d.side });
    fight.hitstop = 14;
    addMeter(d, 12);
    if (!s.proj) {
      const back: Src = { ...s, dmg: d.move.dmg, mult: d.mods.dmg * d.def.dmg, fromX: d.x, kd: true, level: 'mid', proj: false };
      const dmg = damage(fight, d, a, back, false, false);
      knockdown(a, a.x >= d.x ? 1 : -1, 6.5, 3);
      fight.events.push({ k: 'hit', x: a.x, y: a.y + 70, side: a.side, dmg, big: true, combo: a.combo });
    }
    toIdle(d);
    return;
  }
  if (canBlock(d, s)) {
    const chip = d.mods.chipGuard ? 0 : s.chip * s.mult;
    if (chip > 0 && d.hp > 1) d.hp = Math.max(1, d.hp - chip);
    d.st = 'block';
    d.move = null;
    d.crouchBlock = d.prev.d;
    d.stun = s.blockstun;
    d.t = 0;
    d.vx = away * s.push * 0.9;
    d.stats.blocks++;
    addMeter(d, d.mods.chipGuard ? 8 : 4);
    addMeter(a, 3);
    if (d.mods.thorns > 0 && !s.proj && a.hp > 1) a.hp = Math.max(1, a.hp - d.mods.thorns);
    fight.hitstop = Math.max(fight.hitstop, s.tier >= 2 ? 7 : 5);
    fight.events.push({ k: 'block', x: d.x - away * 14, y: s.hy, side: d.side, big: s.tier >= 2 });
    cornerPush(a, d, away, s.push);
    return;
  }
  const counter = d.st === 'move' && (phase(d) === 'startup' || phase(d) === 'active');
  if (counter) a.stats.counters++;
  const dmg = damage(fight, a, d, s, counter, false);
  if (d.ko || s.kd || d.y > 0) knockdown(d, away, s.kd ? 6.5 : 5.5, s.kd ? 2.6 : 2);
  else {
    d.st = 'hit';
    d.move = null;
    d.t = 0;
    d.stun = s.hitstun + (counter ? 4 : 0);
    d.vx = away * s.push;
  }
  fight.hitstop = Math.max(fight.hitstop, Math.min(16, Math.round(5 + dmg * 0.6)));
  fight.events.push({ k: 'hit', x: d.x - away * 12, y: s.hy, side: d.side, dmg, big: dmg >= 10 || s.tier >= 4, counter, combo: d.combo });
  cornerPush(a, d, away, s.push);
}

/** Pushback goes to the attacker when the defender is at a wall. */
function cornerPush(a: Fighter, d: Fighter, away: number, push: number): void {
  const atWall = (away > 0 && d.x >= WALL_R - HALF - 4) || (away < 0 && d.x <= WALL_L + HALF + 4);
  if (atWall && a.y <= 0) a.vx = -away * push * 0.8;
}

function throwable(d: Fighter): boolean {
  return d.y <= 0 && !isInvul(d) && d.st !== 'hit' && d.st !== 'block' && d.st !== 'prejump';
}

function applyThrow(fight: Fight, a: Fighter, d: Fighter, m: MoveDef): void {
  a.contact++;
  d.move = null;
  d.vx = 0;
  d.x = a.x + a.face * 30 * a.def.size;
  if (!m.noTech) {
    if (d.mods.escape > 0 && fight.rng.chance(d.mods.escape)) {
      tech(fight, a, d);
      return;
    }
    // The victim can still break it in the tech window.
    d.st = 'thrown';
    d.t = 0;
    d.buf = [];
    return;
  }
  finishThrow(fight, a, d, m);
}

function tech(fight: Fight, a: Fighter, d: Fighter): void {
  for (const f of [a, d]) {
    f.st = 'block';
    f.move = null;
    f.stun = 14;
    f.vx = (f === a ? -a.face : a.face) * 6;
  }
  fight.hitstop = 8;
  fight.events.push({ k: 'tech', x: (a.x + d.x) / 2, y: 70, side: d.side });
}

function finishThrow(fight: Fight, a: Fighter, d: Fighter, m: MoveDef): void {
  const away = a.face;
  a.stats.throws++;
  const s: Src = { dmg: m.dmg, hitstun: 0, blockstun: 0, level: 'throw', kd: true, chip: 0, push: 0, tier: m.tier, mult: a.mods.dmg * a.def.dmg * (m.tier === 4 ? a.mods.superDmg : 1), fromX: a.x, hy: 60, proj: false, noTech: !!m.noTech };
  const dmg = damage(fight, a, d, s, false, true);
  d.x = a.x + away * 30;
  knockdown(d, away, 8, 3.2);
  fight.hitstop = m.tier === 4 ? 18 : 11;
  fight.events.push({ k: 'throw', x: d.x, y: 60, side: d.side, dmg, big: true, combo: d.combo });
}

/** A thrown fighter: break the throw with throw (or light + heavy), else take it. */
function updateThrown(fight: Fight, d: Fighter): void {
  const a = fight.fs[1 - d.side];
  if (a.st !== 'move' || a.move?.level !== 'throw') {
    toIdle(d);
    return;
  }
  const pressed = (b: Btn): boolean => d.buf.some((p) => p.b === b);
  if (pressed('t') || (pressed('a') && pressed('b'))) {
    tech(fight, a, d);
    return;
  }
  if (d.t >= TECH_WINDOW) finishThrow(fight, a, d, a.move);
}

function srcOf(a: Fighter, m: MoveDef): Src {
  const hb = hitbox(a)!;
  return {
    dmg: m.dmg,
    hitstun: m.hitstun,
    blockstun: m.blockstun,
    level: m.level,
    kd: !!m.kd,
    chip: m.chip ?? 0,
    push: m.push ?? 3,
    tier: m.tier,
    mult: a.mods.dmg * a.def.dmg * (m.tier === 4 ? a.mods.superDmg : 1) * (a.motionBonus ? 1.1 : 1),
    fromX: a.x,
    hy: (hb.y1 + hb.y2) / 2,
    proj: false,
    noTech: !!m.noTech,
  };
}

function resolveHits(fight: Fight): void {
  const pending: { a: Fighter; d: Fighter; m: MoveDef; seg: number }[] = [];
  for (const a of fight.fs) {
    const d = fight.fs[1 - a.side];
    const m = a.move;
    const hb = hitbox(a);
    if (!m || !hb || a.ko) continue;
    const segLen = m.active / (m.hits ?? 1);
    const seg = Math.min((m.hits ?? 1) - 1, Math.floor((a.mf - m.startup - 1) / segLen));
    if (seg <= a.seg) continue;
    if (m.level === 'throw') {
      if (throwable(d) && overlap(hb, toWorld(d, [-HALF, 0, HALF * 2, 100]))) pending.push({ a, d, m, seg });
    } else if (hurtboxes(d).some((b) => overlap(hb, b))) pending.push({ a, d, m, seg });
  }
  // Strikes beat throws on the same frame.
  const strikes = pending.filter((p) => p.m.level !== 'throw');
  const list = strikes.length && strikes.length < pending.length ? strikes : pending;
  const srcs = list.map((p) => srcOf(p.a, p.m));
  list.forEach((p, i) => {
    p.a.seg = p.seg;
    if (p.m.level === 'throw') applyThrow(fight, p.a, p.d, p.m);
    else {
      p.a.contact++;
      applyStrike(fight, p.a, p.d, srcs[i]);
    }
  });
}

function stepProjs(fight: Fight): void {
  for (const p of fight.projs) {
    p.age++;
    p.life--;
    if (p.cool > 0) p.cool--;
    else p.x += p.vx;
  }
  // Projectiles cancel each other out.
  for (const p of fight.projs) {
    for (const q of fight.projs) {
      if (p.owner >= q.owner || p.hits <= 0 || q.hits <= 0) continue;
      if (overlap(projBox(p), projBox(q))) {
        const n = Math.min(p.hits, q.hits);
        p.hits -= n;
        q.hits -= n;
        fight.events.push({ k: 'clash', x: (p.x + q.x) / 2, y: (p.def.y + q.def.y) / 2 + 12, side: p.owner });
      }
    }
  }
  for (const p of fight.projs) {
    if (p.hits <= 0 || p.cool > 0) continue;
    const a = fight.fs[p.owner];
    const d = fight.fs[1 - p.owner];
    if (d.st === 'move' && d.move?.projInv && phase(d) === 'active') continue;
    const pb = projBox(p);
    if (!hurtboxes(d).some((b) => overlap(pb, b))) continue;
    p.hits--;
    p.cool = 7;
    const s: Src = {
      dmg: p.def.dmg,
      hitstun: p.def.hitstun,
      blockstun: p.def.blockstun,
      level: p.def.level,
      kd: !!p.def.kd || (p.hits === 0 && p.def.hits > 1),
      chip: p.def.chip,
      push: p.def.hits > 1 ? 2 : 4,
      tier: p.def.hits > 1 ? 4 : 3,
      mult: p.mult,
      fromX: p.x - p.vx * 4,
      hy: p.def.y + p.def.h / 2,
      proj: true,
      noTech: true,
    };
    applyStrike(fight, a, d, s);
  }
  fight.projs = fight.projs.filter((p) => p.hits > 0 && p.life > 0 && p.x > -40 && p.x < W + 40);
}

function separate(fight: Fight): void {
  const [a, b] = fight.fs;
  const lying = (f: Fighter): boolean => f.st === 'down' || f.st === 'ko' || f.st === 'fall';
  if (!lying(a) && !lying(b) && Math.abs(a.y - b.y) < 60) {
    const md = HALF * (a.def.size + b.def.size);
    const dx = a.x - b.x;
    if (Math.abs(dx) < md) {
      const dir = dx !== 0 ? Math.sign(dx) : a.face > 0 ? -1 : 1;
      const push = (md - Math.abs(dx)) / 2;
      a.x += dir * push;
      b.x -= dir * push;
    }
  }
  for (const f of fight.fs) f.x = Math.max(WALL_L + HALF, Math.min(WALL_R - HALF, f.x));
  if (!lying(a) && !lying(b) && Math.abs(a.y - b.y) < 60) {
    const md = HALF * (a.def.size + b.def.size);
    const dx = a.x - b.x;
    if (Math.abs(dx) < md - 0.5) {
      const dir = dx !== 0 ? Math.sign(dx) : 1;
      // One of them is at a wall: move the other.
      const atWall = (f: Fighter): boolean => f.x <= WALL_L + HALF + 0.5 || f.x >= WALL_R - HALF - 0.5;
      if (atWall(a)) b.x = a.x - dir * md;
      else a.x = b.x + dir * md;
    }
  }
}

function faceEachOther(fight: Fight): void {
  for (const f of fight.fs) {
    const o = fight.fs[1 - f.side];
    if (f.y > 0 || !['idle', 'walk', 'crouch', 'land', 'prejump', 'down'].includes(f.st)) continue;
    const dx = o.x - f.x;
    if (Math.abs(dx) > 2) f.face = dx > 0 ? 1 : -1;
  }
}

/** Advance the fight by one frame. */
export function step(fight: Fight, ins: [Input, Input]): void {
  fight.events = [];
  const frozen = fight.freeze > 0 || fight.hitstop > 0;
  for (const f of fight.fs) readInput(f, fight.over || f.ko ? noInput() : ins[f.side], !frozen);
  if (fight.freeze > 0) {
    fight.freeze--;
    return;
  }
  if (fight.hitstop > 0) {
    fight.hitstop--;
    return;
  }
  fight.frame++;
  if (!fight.over) {
    fight.timer--;
    for (const f of fight.fs) act(fight, f);
  }
  for (const f of fight.fs) update(fight, f);
  stepProjs(fight);
  if (!fight.over) resolveHits(fight);
  separate(fight);
  faceEachOther(fight);
  for (const f of fight.fs) {
    if (f.inv > 0) f.inv--;
    if (f.flash > 0) f.flash--;
  }
  if (!fight.over) {
    const [a, b] = fight.fs;
    if (a.ko || b.ko) fight.over = { winner: a.ko && b.ko ? -1 : a.ko ? 1 : 0, reason: 'ko' };
    else if (fight.timer <= 0) {
      const ra = a.hp / a.maxHp;
      const rb = b.hp / b.maxHp;
      fight.over = { winner: ra > rb ? 0 : rb > ra ? 1 : -1, reason: 'time' };
    }
  }
}

/** Grounded and free to act (no move, no stun). */
export const isFree = (f: Fighter): boolean => freeStates.includes(f.st) && f.y <= 0;
