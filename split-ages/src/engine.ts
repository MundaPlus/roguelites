/**
 * Pure turn engine for two linked boards. The past board and the future board share one layout.
 * `turn(def, state, pastAct, futAct, mods)` returns a new state and a list of events.
 * The past action resolves first, so its causes change the future before the future hero moves.
 */
import { FOES, type Age } from './data';

export const W = 7;
export const H = 7;
export const N = W * H;

export type Act = 'U' | 'D' | 'L' | 'R' | 'A';
export const ACTS: Act[] = ['U', 'D', 'L', 'R', 'A'];
const DX: Record<Act, number> = { U: 0, D: 0, L: -1, R: 1, A: 0 };
const DY: Record<Act, number> = { U: -1, D: 1, L: 0, R: 0, A: 0 };

export const cx = (c: number): number => c % W;
export const cy = (c: number): number => (c / W) | 0;
export const at = (x: number, y: number): number => y * W + x;

/** Neighbor cell in direction `a`, or -1 at the edge. `A` returns the cell itself. */
export function nb(c: number, a: Act): number {
  const x = cx(c) + DX[a];
  const y = cy(c) + DY[a];
  if (x < 0 || y < 0 || x >= W || y >= H) return -1;
  return at(x, y);
}

export const adj = (a: number, b: number): boolean => Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b)) === 1;

export function dirTo(from: number, to: number): Act | null {
  for (const a of ['U', 'D', 'L', 'R'] as Act[]) if (nb(from, a) === to) return a;
  return from === to ? 'A' : null;
}

export const cellName = (c: number): string => `${'ABCDEFG'[cx(c)]}${cy(c) + 1}`;

// ---------- Definitions ----------

export interface FoeDef {
  type: string;
  age: Age;
  pos: number;
  hp: number;
  patrol?: number[];
  /** Index of the ancestor in `def.foes`, or -1. */
  parent: number;
  /** Lineage family number for the badge, or -1. */
  fam: number;
}

export interface ChestDef {
  cell: number;
  gold: number;
  heal: number;
  /** Index of the ancestor foe in `def.foes`, or -1. */
  parent: number;
  fam: number;
}

export interface FloorDef {
  floor: number;
  kind: 'normal' | 'elite' | 'boss';
  rules: string[];
  past: string;
  fut: string;
  pastStart: number;
  futStart: number;
  foes: FoeDef[];
  chests: ChestDef[];
  floodA: number[];
  floodB: number[];
  links: { plate: number; gate: number }[];
  statues: number[];
  seeds: number;
  boss: { pos: number; hp: number } | null;
  /** Fewest turns of the safest solution the solver found. */
  par: number;
  parDmg: number;
}

export interface Foe {
  i: number;
  pos: number;
  hp: number;
  pi: number;
  dir: number;
}

export interface St {
  past: string;
  fut: string;
  pp: number;
  fp: number;
  hp: number;
  maxHp: number;
  seeds: number;
  sluice: boolean;
  foes: Foe[];
  chests: number[];
  statues: number[];
  bossHp: number;
  turn: number;
  rope: number;
  usedP: boolean;
  usedF: boolean;
  gold: number;
  kills: number;
  grown: number;
  done: '' | 'exit' | 'boss' | 'dead';
}

export interface Mods {
  atkP: number;
  atkF: number;
  shieldP: boolean;
  shieldF: boolean;
  rope: number;
  waders: boolean;
  meal: boolean;
  scav: boolean;
  paradox: boolean;
  orchard: boolean;
  seeds: number;
  rewinds: number;
}

export const BASE_MODS: Mods = {
  atkP: 1,
  atkF: 1,
  shieldP: false,
  shieldF: false,
  rope: 0,
  waders: false,
  meal: false,
  scav: false,
  paradox: false,
  orchard: false,
  seeds: 0,
  rewinds: 3,
};

export interface Spot {
  age: Age;
  cell: number;
}

export type Ev =
  | { k: 'move'; age: Age; from: number; to: number; who: 'hero' | 'foe' | 'statue' }
  | { k: 'bump'; age: Age; from: number; to: number }
  | { k: 'dmg'; age: Age; cell: number; n: number; hero: boolean }
  | { k: 'kill'; age: Age; cell: number; icon: string }
  | { k: 'block'; age: Age; cell: number; text: string }
  | { k: 'pick'; age: Age; cell: number; text: string }
  | { k: 'cause'; from: Spot; to: Spot; rule: string; text: string; icon: string }
  | { k: 'wave'; cells: number[] }
  | { k: 'info'; age: Age; cell: number; text: string };

// ---------- Tiles ----------

const PAST_WALK = '.,sSLg*';
const FUT_WALK = '.,RXPp$';

export function setTile(s: string, c: number, t: string): string {
  return s.slice(0, c) + t + s.slice(c + 1);
}

export function initState(def: FloorDef, hp: number, maxHp: number, mods: Mods): St {
  return {
    past: def.past,
    fut: def.fut,
    pp: def.pastStart,
    fp: def.futStart,
    hp,
    maxHp,
    seeds: def.seeds + mods.seeds,
    sluice: false,
    foes: def.foes.map((f, i) => ({ i, pos: f.pos, hp: f.hp, pi: 0, dir: 1 })),
    chests: def.chests.map((_, i) => i),
    statues: [...def.statues],
    bossHp: def.boss ? def.boss.hp : 0,
    turn: 0,
    rope: mods.rope,
    usedP: false,
    usedF: false,
    gold: 0,
    kills: 0,
    grown: 0,
    done: '',
  };
}

export function clone(st: St): St {
  return { ...st, foes: st.foes.map((f) => ({ ...f })), chests: [...st.chests], statues: [...st.statues] };
}

export function foeAt(def: FloorDef, st: St, age: Age, c: number): number {
  for (let i = 0; i < st.foes.length; i++) {
    const f = st.foes[i];
    if (f.pos === c && def.foes[f.i].age === age) return i;
  }
  return -1;
}

export const bossAlive = (def: FloorDef, st: St): boolean => !!def.boss && st.bossHp > 0;
export const bossAt = (def: FloorDef, st: St, c: number): boolean => bossAlive(def, st) && def.boss!.pos === c;
export const anchorsLeft = (def: FloorDef, st: St): number => st.foes.filter((f) => def.foes[f.i].type === 'anchor').length;

/** Free for the past hero to stand on (no actor there). */
export function pastFree(def: FloorDef, st: St, c: number): boolean {
  return PAST_WALK.includes(st.past[c]) && foeAt(def, st, 'past', c) < 0 && !st.statues.includes(c) && !bossAt(def, st, c);
}

/** Ground the future hero can stand on, ignoring actors. A statue in a chasm or water is a bridge. */
export function futGround(st: St, c: number, mods: Mods): boolean {
  const t = st.fut[c];
  if (st.statues.includes(c)) return t === '_' || t === '~';
  return FUT_WALK.includes(t) || (t === '~' && mods.waders);
}

export function futFree(def: FloorDef, st: St, c: number, mods: Mods): boolean {
  return futGround(st, c, mods) && foeAt(def, st, 'fut', c) < 0 && !bossAt(def, st, c);
}

/** Can a foe step on this cell? Foes never enter water or chasms. */
function foeFree(def: FloorDef, st: St, age: Age, c: number): boolean {
  if (age === 'past') return pastFree(def, st, c) && c !== st.pp;
  const t = st.fut[c];
  if (st.statues.includes(c) || !FUT_WALK.includes(t) || t === 'X') return false;
  return foeAt(def, st, 'fut', c) < 0 && !bossAt(def, st, c) && c !== st.fp;
}

const BLOCKS_SHOT = '#cGT';

/** Foes in the future hit 1 harder from this floor on. */
export const FUTURE_HARD_FLOOR = 5;

export function foeDmg(def: FloorDef, fd: FoeDef): number {
  const base = FOES[fd.type].dmg;
  return base > 0 && fd.age === 'fut' && def.floor >= FUTURE_HARD_FLOOR ? base + 1 : base;
}

// ---------- Options ----------

function pushTarget(def: FloorDef, st: St, from: number, a: Act): number {
  const c = nb(from, a);
  const d = c < 0 ? -1 : nb(c, a);
  if (d < 0 || !pastFree(def, st, d)) return -1;
  // The future must allow it: no hero crushed, no hero dropped into a chasm, no foe crushed.
  const fGround = st.fut[d] === '_' || st.fut[d] === '~';
  if (st.fp === d && !fGround) return -1;
  if (foeAt(def, st, 'fut', d) >= 0 || bossAt(def, st, d)) return -1;
  if (st.fp === c && (st.fut[c] === '_' || st.fut[c] === '~')) return -1;
  if (st.fut[d] === 'X') return -1;
  return d;
}

export function canPlant(def: FloorDef, st: St): boolean {
  const c = st.pp;
  return st.past[c] === 's' && st.seeds > 0 && st.fp !== c && foeAt(def, st, 'fut', c) < 0 && st.fut[c] !== 'X';
}

/** Legal past actions. `A` is always legal (act or wait). */
export function pastOptions(def: FloorDef, st: St): Act[] {
  const out: Act[] = [];
  for (const a of ['U', 'D', 'L', 'R'] as Act[]) {
    const c = nb(st.pp, a);
    if (c < 0) continue;
    if (foeAt(def, st, 'past', c) >= 0 || bossAt(def, st, c) || st.past[c] === 'c' || pastFree(def, st, c)) out.push(a);
    else if (st.statues.includes(c) && pushTarget(def, st, st.pp, a) >= 0) out.push(a);
  }
  out.push('A');
  return out;
}

export function futOptions(def: FloorDef, st: St, mods: Mods): Act[] {
  const out: Act[] = [];
  for (const a of ['U', 'D', 'L', 'R'] as Act[]) {
    const c = nb(st.fp, a);
    if (c < 0) continue;
    if (foeAt(def, st, 'fut', c) >= 0 || bossAt(def, st, c) || futFree(def, st, c, mods)) out.push(a);
    else if (st.rope > 0 && (st.fut[c] === '_' || st.fut[c] === '~')) {
      const d = nb(c, a);
      if (d >= 0 && futFree(def, st, d, mods)) out.push(a);
    }
  }
  out.push('A');
  return out;
}

export function isAttack(def: FloorDef, st: St, age: Age, a: Act): boolean {
  if (a === 'A') return false;
  const c = nb(age === 'past' ? st.pp : st.fp, a);
  return c >= 0 && (foeAt(def, st, age, c) >= 0 || bossAt(def, st, c));
}

// ---------- Resolution ----------

function hurt(st: St, age: Age, n: number, mods: Mods, ev: Ev[]): void {
  const cell = age === 'past' ? st.pp : st.fp;
  if (n <= 0) return;
  if (age === 'past' && mods.shieldP && !st.usedP) {
    st.usedP = true;
    ev.push({ k: 'block', age, cell, text: '🛡️ Blocked' });
    return;
  }
  if (age === 'fut' && mods.shieldF && !st.usedF) {
    st.usedF = true;
    ev.push({ k: 'block', age, cell, text: '🧥 Blocked' });
    return;
  }
  st.hp -= n;
  ev.push({ k: 'dmg', age, cell, n, hero: true });
}

function killFoe(def: FloorDef, st: St, idx: number, mods: Mods, ev: Ev[], cause: boolean): void {
  const f = st.foes[idx];
  const fd = def.foes[f.i];
  st.foes.splice(idx, 1);
  ev.push({ k: 'kill', age: fd.age, cell: f.pos, icon: FOES[fd.type].icon });
  if (cause) return;
  st.kills++;
  if (fd.age === 'past' && mods.meal && st.hp < st.maxHp) {
    st.hp++;
    ev.push({ k: 'pick', age: 'past', cell: f.pos, text: '+1 ❤️' });
  }
  if (fd.age !== 'past') return;
  // Lineage: descendants and their treasure never exist.
  for (let j = st.foes.length - 1; j >= 0; j--) {
    const g = st.foes[j];
    if (def.foes[g.i].parent === f.i) {
      ev.push({ k: 'cause', from: { age: 'past', cell: f.pos }, to: { age: 'fut', cell: g.pos }, rule: 'lineage', icon: FOES[def.foes[g.i].type].icon, text: `No ${FOES[def.foes[g.i].type].name} is born` });
      killFoe(def, st, j, mods, ev, true);
    }
  }
  for (let j = st.chests.length - 1; j >= 0; j--) {
    const ch = def.chests[st.chests[j]];
    if (ch.parent === f.i) {
      ev.push({ k: 'cause', from: { age: 'past', cell: f.pos }, to: { age: 'fut', cell: ch.cell }, rule: 'lineage', icon: '🎁', text: 'Its treasure is gone' });
      st.chests.splice(j, 1);
    }
  }
  if (fd.type === 'anchor' && def.boss) {
    const left = anchorsLeft(def, st);
    ev.push({ k: 'cause', from: { age: 'past', cell: f.pos }, to: { age: 'fut', cell: def.boss.pos }, rule: 'lineage', icon: '🔮', text: left ? `Boss shield weakens (${left} left)` : 'Boss shield breaks' });
  }
}

function attackFoe(def: FloorDef, st: St, age: Age, idx: number, dmg: number, mods: Mods, ev: Ev[]): void {
  const f = st.foes[idx];
  f.hp -= dmg;
  ev.push({ k: 'dmg', age, cell: f.pos, n: dmg, hero: false });
  if (f.hp <= 0) killFoe(def, st, idx, mods, ev, false);
}

function hitBoss(def: FloorDef, st: St, age: Age, dmg: number, ev: Ev[]): void {
  const c = def.boss!.pos;
  if (anchorsLeft(def, st) > 0) {
    ev.push({ k: 'block', age, cell: c, text: '🔮 Shielded' });
    return;
  }
  st.bossHp -= dmg;
  ev.push({ k: 'dmg', age, cell: c, n: dmg, hero: false });
  if (st.bossHp <= 0) {
    st.bossHp = 0;
    st.done = 'boss';
    ev.push({ k: 'kill', age: 'past', cell: c, icon: '🐲' });
    ev.push({ k: 'kill', age: 'fut', cell: c, icon: '🐲' });
  }
}

function toggleSluice(def: FloorDef, st: St, mods: Mods, ev: Ev[]): void {
  st.sluice = !st.sluice;
  const wet = st.sluice ? def.floodB : def.floodA;
  const dry = st.sluice ? def.floodA : def.floodB;
  for (const c of dry) {
    st.fut = setTile(st.fut, c, '.');
    ev.push({ k: 'cause', from: { age: 'past', cell: st.pp }, to: { age: 'fut', cell: c }, rule: 'flooding', icon: '🏜️', text: 'The water drains' });
  }
  for (const c of wet) {
    st.fut = setTile(st.fut, c, '~');
    ev.push({ k: 'cause', from: { age: 'past', cell: st.pp }, to: { age: 'fut', cell: c }, rule: 'flooding', icon: '🌊', text: 'The ground floods' });
    const fi = foeAt(def, st, 'fut', c);
    if (fi >= 0 && !st.statues.includes(c)) killFoe(def, st, fi, mods, ev, true);
  }
}

function doPast(def: FloorDef, st: St, a: Act, mods: Mods, ev: Ev[]): boolean {
  const p = st.pp;
  if (a === 'A') {
    if (st.past[p] === 's' && canPlant(def, st)) {
      st.seeds--;
      st.grown++;
      st.past = setTile(st.past, p, 'S');
      const old = st.fut[p];
      const bridge = old === '_' || old === '~';
      st.fut = setTile(st.fut, p, bridge ? 'R' : 'T');
      ev.push({ k: 'cause', from: { age: 'past', cell: p }, to: { age: 'fut', cell: p }, rule: 'growth', icon: bridge ? '🪵' : '🌳', text: bridge ? 'Roots bridge the gap' : 'A tree grows and blocks the way' });
    } else if (st.past[p] === 'L') {
      toggleSluice(def, st, mods, ev);
    }
    return false;
  }
  const c = nb(p, a);
  if (c < 0) return false;
  const fi = foeAt(def, st, 'past', c);
  if (fi >= 0) {
    ev.push({ k: 'bump', age: 'past', from: p, to: c });
    attackFoe(def, st, 'past', fi, mods.atkP, mods, ev);
    return true;
  }
  if (bossAt(def, st, c)) {
    ev.push({ k: 'bump', age: 'past', from: p, to: c });
    hitBoss(def, st, 'past', mods.atkP, ev);
    return true;
  }
  if (st.past[c] === 'c') {
    ev.push({ k: 'bump', age: 'past', from: p, to: c });
    st.past = setTile(st.past, c, ',');
    ev.push({ k: 'info', age: 'past', cell: c, text: 'Crack!' });
    if (st.fut[c] === '#') {
      st.fut = setTile(st.fut, c, ',');
      ev.push({ k: 'cause', from: { age: 'past', cell: c }, to: { age: 'fut', cell: c }, rule: 'erosion', icon: '🧱', text: 'The wall is gone' });
    }
    return false;
  }
  const si = st.statues.indexOf(c);
  if (si >= 0) {
    const d = pushTarget(def, st, p, a);
    if (d < 0) return false;
    st.statues[si] = d;
    ev.push({ k: 'move', age: 'past', from: c, to: d, who: 'statue' });
    ev.push({ k: 'move', age: 'past', from: p, to: c, who: 'hero' });
    st.pp = c;
    const bridge = st.fut[d] === '_' || st.fut[d] === '~';
    ev.push({ k: 'cause', from: { age: 'past', cell: d }, to: { age: 'fut', cell: d }, rule: 'monuments', icon: '🗿', text: bridge ? 'The statue fills the gap' : 'The statue stands here now' });
    return false;
  }
  if (!pastFree(def, st, c)) return false;
  ev.push({ k: 'move', age: 'past', from: p, to: c, who: 'hero' });
  st.pp = c;
  if (st.past[c] === '*') {
    st.seeds++;
    st.past = setTile(st.past, c, '.');
    ev.push({ k: 'pick', age: 'past', cell: c, text: '+1 🌰' });
  }
  return false;
}

function doFut(def: FloorDef, st: St, a: Act, mods: Mods, ev: Ev[], pastHit: boolean): void {
  if (a === 'A') return;
  const p = st.fp;
  const c = nb(p, a);
  if (c < 0) return;
  const bonus = mods.paradox && pastHit ? 2 : 0;
  const fi = foeAt(def, st, 'fut', c);
  if (fi >= 0) {
    ev.push({ k: 'bump', age: 'fut', from: p, to: c });
    attackFoe(def, st, 'fut', fi, mods.atkF + bonus, mods, ev);
    return;
  }
  if (bossAt(def, st, c)) {
    ev.push({ k: 'bump', age: 'fut', from: p, to: c });
    hitBoss(def, st, 'fut', mods.atkF + bonus, ev);
    return;
  }
  let dest = -1;
  if (futFree(def, st, c, mods)) dest = c;
  else if (st.rope > 0 && (st.fut[c] === '_' || st.fut[c] === '~')) {
    const d = nb(c, a);
    if (d >= 0 && futFree(def, st, d, mods)) {
      dest = d;
      st.rope--;
      ev.push({ k: 'info', age: 'fut', cell: c, text: '🪢 Swing!' });
    }
  }
  if (dest < 0) return;
  ev.push({ k: 'move', age: 'fut', from: p, to: dest, who: 'hero' });
  st.fp = dest;
  const t = st.fut[dest];
  if (t === '$') {
    st.gold++;
    st.fut = setTile(st.fut, dest, '.');
    ev.push({ k: 'pick', age: 'fut', cell: dest, text: '+1 💰' });
  } else if (t === 'P') {
    st.fut = setTile(st.fut, dest, 'p');
    for (const l of def.links) {
      if (l.plate !== dest || st.past[l.gate] !== 'G') continue;
      st.past = setTile(st.past, l.gate, 'g');
      ev.push({ k: 'cause', from: { age: 'fut', cell: dest }, to: { age: 'past', cell: l.gate }, rule: 'echo', icon: '⛩️', text: 'A time gate opens in the past' });
    }
  } else if (t === 'X' && !def.boss) {
    st.done = 'exit';
  }
  const ci = st.chests.findIndex((i) => def.chests[i].cell === dest);
  if (ci >= 0) {
    const ch = def.chests[st.chests[ci]];
    st.chests.splice(ci, 1);
    const gold = ch.gold + (mods.scav && ch.gold > 0 ? 3 : 0);
    st.gold += gold;
    if (ch.heal) st.hp = Math.min(st.maxHp, st.hp + ch.heal);
    ev.push({ k: 'pick', age: 'fut', cell: dest, text: ch.heal ? `+${ch.heal} ❤️` : `+${gold} 💰` });
  }
}

/** Cells hit by a ranged foe or the boss wave: straight lines, stopped by walls. */
export function lineCells(st: St, age: Age, from: number, range: number): number[] {
  const out: number[] = [];
  const tiles = age === 'past' ? st.past : st.fut;
  for (const a of ['U', 'D', 'L', 'R'] as Act[]) {
    let c = from;
    for (let i = 0; i < range; i++) {
      c = nb(c, a);
      if (c < 0 || BLOCKS_SHOT.includes(tiles[c]) || (age === 'past' && st.statues.includes(c))) break;
      out.push(c);
    }
  }
  return out;
}

/** What the boss does at the end of this turn. */
export function bossIntent(st: St): 'rest' | 'claw' | 'wave' {
  const m = st.turn % 3;
  return m === 0 ? 'rest' : m === 1 ? 'claw' : 'wave';
}

export const BOSS_WAVE = 3;

/** The time wave hits the boss row and column from 2 to 3 tiles away. Tiles next to the boss are safe. */
export function waveCells(st: St, age: Age, b: number): number[] {
  return lineCells(st, age, b, BOSS_WAVE).filter((c) => !adj(c, b));
}

/** Cells where a hero gets hit at the end of this turn if it stands there. */
export function dangerCells(def: FloorDef, st: St, age: Age): Map<number, number> {
  const out = new Map<number, number>();
  const add = (c: number, n: number): void => {
    out.set(c, (out.get(c) ?? 0) + n);
  };
  for (const f of st.foes) {
    const fd = def.foes[f.i];
    if (fd.age !== age) continue;
    const T = FOES[fd.type];
    const dmg = foeDmg(def, fd);
    if (dmg <= 0) continue;
    const cells = T.move === 'ranged' ? lineCells(st, age, f.pos, T.range ?? 1) : [nb(f.pos, 'U'), nb(f.pos, 'D'), nb(f.pos, 'L'), nb(f.pos, 'R')].filter((c) => c >= 0);
    for (const c of cells) add(c, dmg);
  }
  if (bossAlive(def, st)) {
    const b = def.boss!.pos;
    const intent = bossIntent(st);
    if (intent === 'claw') for (const a of ['U', 'D', 'L', 'R'] as Act[]) {
      const c = nb(b, a);
      if (c >= 0) add(c, 2);
    }
    if (intent === 'wave') for (const c of waveCells(st, age, b)) add(c, 1);
  }
  return out;
}

function enemyPhase(def: FloorDef, st: St, mods: Mods, ev: Ev[]): void {
  for (const f of [...st.foes]) {
    if (!st.foes.includes(f)) continue;
    const fd = def.foes[f.i];
    const T = FOES[fd.type];
    const hero = fd.age === 'past' ? st.pp : st.fp;
    const dmg = foeDmg(def, fd);
    const inReach = dmg > 0 && (adj(f.pos, hero) || (T.move === 'ranged' && lineCells(st, fd.age, f.pos, T.range ?? 1).includes(hero)));
    if (inReach) {
      ev.push({ k: 'bump', age: fd.age, from: f.pos, to: hero });
      hurt(st, fd.age, dmg, mods, ev);
      continue;
    }
    if (T.move !== 'patrol' || !fd.patrol || fd.patrol.length < 2) continue;
    const path = fd.patrol;
    let ni = f.pi + f.dir;
    if (ni < 0 || ni >= path.length) {
      f.dir = -f.dir;
      ni = f.pi + f.dir;
    }
    const to = path[ni];
    if (foeFree(def, st, fd.age, to)) {
      ev.push({ k: 'move', age: fd.age, from: f.pos, to, who: 'foe' });
      f.pos = to;
      f.pi = ni;
    } else {
      f.dir = -f.dir;
    }
  }
  if (bossAlive(def, st)) {
    const b = def.boss!.pos;
    const intent = bossIntent(st);
    for (const age of ['past', 'fut'] as Age[]) {
      const hero = age === 'past' ? st.pp : st.fp;
      if (intent === 'claw' && adj(b, hero)) {
        ev.push({ k: 'bump', age, from: b, to: hero });
        hurt(st, age, 2, mods, ev);
      }
      if (intent === 'wave' && waveCells(st, age, b).includes(hero)) hurt(st, age, 1, mods, ev);
    }
    if (intent === 'wave') ev.push({ k: 'wave', cells: waveCells(st, 'fut', b) });
  }
  if (st.fut[st.fp] === '~' && !mods.waders && !st.statues.includes(st.fp)) {
    ev.push({ k: 'info', age: 'fut', cell: st.fp, text: 'Swept!' });
    hurt(st, 'fut', 1, mods, ev);
  }
}

/** Past half of a turn. Returns the state after the past action and whether the past hero attacked. */
export function pastHalf(def: FloorDef, st0: St, pa: Act, mods: Mods, ev: Ev[]): { st: St; hit: boolean } {
  const st = clone(st0);
  const hit = doPast(def, st, pa, mods, ev);
  return { st, hit };
}

/** Future half plus the enemy phase. Mutates `st`. */
export function futHalf(def: FloorDef, st: St, fa: Act, mods: Mods, ev: Ev[], pastHit: boolean): void {
  if (!st.done) doFut(def, st, fa, mods, ev, pastHit);
  if (!st.done) enemyPhase(def, st, mods, ev);
  st.turn++;
  if (st.hp <= 0 && st.done !== 'boss' && st.done !== 'exit') {
    st.hp = 0;
    st.done = 'dead';
  }
}

/** One full turn. Illegal actions become a wait. */
export function turn(def: FloorDef, st0: St, pa: Act, fa: Act, mods: Mods): { st: St; ev: Ev[]; pa: Act; fa: Act } {
  const ev: Ev[] = [];
  if (!pastOptions(def, st0).includes(pa)) pa = 'A';
  const { st, hit } = pastHalf(def, st0, pa, mods, ev);
  if (!st.done && !futOptions(def, st, mods).includes(fa)) fa = 'A';
  futHalf(def, st, fa, mods, ev, hit);
  return { st, ev, pa, fa };
}

/** State key for search: everything that changes how the floor plays. */
export function stateKey(def: FloorDef, st: St): string {
  let k = `${st.pp},${st.fp},${st.seeds},${st.rope},${st.usedP ? 1 : 0}${st.usedF ? 1 : 0}|${st.past}|${st.fut}|`;
  for (const f of st.foes) k += `${f.i}.${f.pos}.${f.hp}.${f.dir};`;
  if (st.statues.length) k += `|${st.statues.join(',')}`;
  if (def.boss) k += `|${st.bossHp}.${st.turn % 3}`;
  return k;
}

/** Short text for what the past action does where the hero stands. */
export function actLabel(def: FloorDef, st: St): string {
  const t = st.past[st.pp];
  if (t === 's') {
    if (st.seeds <= 0) return 'Wait (no seeds)';
    if (!canPlant(def, st)) return 'Wait (the future is in the way)';
    return 'Plant 🌱';
  }
  if (t === 'L') return 'Pull lever 🎚️';
  return 'Wait';
}
