/** Creature instances: stats, XP, level-ups, move learning and evolution. */
import { MOVES, NATURES, SPECIES, type StatKey, type Status, type Type } from './data';
import type { Rng } from './rng';

export interface Mon {
  uid: number;
  sp: string;
  lvl: number;
  /** XP toward the next level. */
  xp: number;
  hp: number;
  moves: string[];
  nat: number;
  st: Status | null;
  /** Sleep turns left. */
  slp: number;
  /** Fusion stars. Each star gives +10% to all stats. */
  fused: number;
}

export const MAX_LVL = 60;
export const MAX_FUSED = 3;

export function types(m: Mon): Type[] {
  return SPECIES[m.sp].types;
}

function natMul(m: Mon, k: StatKey): number {
  const n = NATURES[m.nat];
  return n.up === k ? 1.1 : n.down === k ? 0.9 : 1;
}

export function stat(m: Mon, k: Exclude<StatKey, 'hp'>): number {
  const i = k === 'atk' ? 1 : k === 'def' ? 2 : 3;
  const b = SPECIES[m.sp].base[i];
  return Math.floor((Math.floor((b * 2 * m.lvl) / 100) + 5) * natMul(m, k) * (1 + 0.1 * m.fused));
}

export function maxHp(m: Mon): number {
  const b = SPECIES[m.sp].base[0];
  return Math.floor((Math.floor((b * 2 * m.lvl) / 100) + m.lvl + 10) * 1.6 * natMul(m, 'hp') * (1 + 0.1 * m.fused));
}

/** XP needed to go from this level to the next. */
export function xpNeed(lvl: number): number {
  return Math.round(0.4 * lvl * lvl + 5 * lvl);
}

/** XP a defeated creature gives to a creature of level `own`. Lower foes give less, higher foes give more. */
export function xpYield(sp: string, lvl: number, trainer: boolean, own = lvl): number {
  const scale = Math.pow((2 * lvl + 10) / (lvl + own + 10), 2.5);
  return Math.round(((SPECIES[sp].xp * lvl) / 5) * 1.4 * (trainer ? 1.3 : 1) * scale);
}

/** The last 4 moves the species knows at this level. */
export function movesAt(sp: string, lvl: number): string[] {
  const known = SPECIES[sp].learn.filter(([l]) => l <= lvl).map(([, id]) => id);
  return known.slice(-4);
}

export function makeMon(sp: string, lvl: number, uid: number, rng: Rng): Mon {
  const m: Mon = { uid, sp, lvl, xp: 0, hp: 0, moves: movesAt(sp, lvl), nat: rng.int(0, NATURES.length - 1), st: null, slp: 0, fused: 0 };
  m.hp = maxHp(m);
  return m;
}

export function powerOf(id: string): number {
  const m = MOVES[id];
  return m.power > 0 ? (m.power * m.acc) / 100 : 45;
}

/** The weakest move slot (status moves count as power 45). */
export function weakestSlot(m: Mon): number {
  let best = 0;
  m.moves.forEach((id, i) => {
    if (powerOf(id) < powerOf(m.moves[best])) best = i;
  });
  return best;
}

export type Growth = { kind: 'level'; lvl: number } | { kind: 'learned'; move: string } | { kind: 'learn'; move: string } | { kind: 'evolve'; to: string };

/** Raise one level: HP grows by the same amount as max HP. Returns new moves and evolutions. */
export function levelUp(m: Mon): Growth[] {
  if (m.lvl >= MAX_LVL) return [];
  const before = maxHp(m);
  m.lvl++;
  if (m.hp > 0) m.hp += maxHp(m) - before;
  const out: Growth[] = [{ kind: 'level', lvl: m.lvl }];
  for (const [l, id] of SPECIES[m.sp].learn) {
    if (l !== m.lvl || m.moves.includes(id)) continue;
    if (m.moves.length < 4) {
      m.moves.push(id);
      out.push({ kind: 'learned', move: id });
    } else out.push({ kind: 'learn', move: id });
  }
  const evo = SPECIES[m.sp].evo;
  if (evo && m.lvl >= evo.lvl) out.push({ kind: 'evolve', to: evo.to });
  return out;
}

export function gainXp(m: Mon, xp: number): Growth[] {
  const out: Growth[] = [];
  m.xp += xp;
  while (m.lvl < MAX_LVL && m.xp >= xpNeed(m.lvl)) {
    m.xp -= xpNeed(m.lvl);
    out.push(...levelUp(m));
  }
  if (m.lvl >= MAX_LVL) m.xp = 0;
  return out;
}

export function evolve(m: Mon, to: string): void {
  const before = maxHp(m);
  m.sp = to;
  if (m.hp > 0) m.hp = Math.max(1, m.hp + maxHp(m) - before);
}

export function heal(m: Mon, amount: number): number {
  const before = m.hp;
  m.hp = Math.min(maxHp(m), m.hp + amount);
  return m.hp - before;
}

export function power(m: Mon): number {
  return maxHp(m) + stat(m, 'atk') * 2 + stat(m, 'def') + stat(m, 'spd');
}
