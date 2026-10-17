/** Heroes: stats from class, level and gear. XP, levels and the skill tree. */
import { CLASSES, ELEMS, GEAR, STAT_KEYS, type Elem, type GearDef, type Row, type Slot, type Stats, type StatusId } from './data';
import type { Rng } from './rng';

export interface Hero {
  id: number;
  cls: string;
  name: string;
  lvl: number;
  xp: number;
  hp: number;
  mp: number;
  row: Row;
  skills: string[];
  points: number;
  gear: Partial<Record<Slot, string>>;
}

export const MAX_LEVEL = 15;

export function xpNeeded(lvl: number): number {
  return Math.round(12 * Math.pow(lvl, 1.42));
}

export function gearOf(h: Hero): GearDef[] {
  return Object.values(h.gear)
    .filter((g): g is string => !!g && !!GEAR[g])
    .map((g) => GEAR[g]);
}

export function heroStats(h: Hero): Stats {
  const c = CLASSES[h.cls];
  const s = {} as Stats;
  for (const k of STAT_KEYS) s[k] = Math.round(c.base[k] + c.grow[k] * (h.lvl - 1));
  for (const g of gearOf(h)) for (const k of STAT_KEYS) s[k] += g.stats[k] ?? 0;
  s.spd = Math.max(1, s.spd);
  return s;
}

export function heroResist(h: Hero): Partial<Record<Elem, number>> {
  const r: Partial<Record<Elem, number>> = {};
  for (const g of gearOf(h)) for (const e of ELEMS) if (g.resist?.[e] !== undefined) r[e] = Math.min(r[e] ?? 1, g.resist[e]!);
  return r;
}

export function heroImmune(h: Hero): StatusId[] {
  return [...new Set(gearOf(h).flatMap((g) => g.immune ?? []))];
}

export function newHero(id: number, cls: string, lvl: number, rng: Rng, taken: string[] = []): Hero {
  const c = CLASSES[cls];
  const names = c.names.filter((n) => !taken.includes(n));
  const h: Hero = {
    id,
    cls,
    name: rng.pick(names.length ? names : c.names),
    lvl: 1,
    xp: 0,
    hp: 0,
    mp: 0,
    row: c.row,
    skills: [c.start],
    points: 0,
    gear: { ...c.gear },
  };
  for (let i = 1; i < lvl; i++) {
    h.lvl++;
    h.points++;
  }
  const s = heroStats(h);
  h.hp = s.hp;
  h.mp = s.mp;
  return h;
}

/** Adds XP. Returns the number of levels gained. HP and MP grow with the new max. */
export function gainXp(h: Hero, xp: number): number {
  if (h.lvl >= MAX_LEVEL) return 0;
  h.xp += xp;
  let ups = 0;
  while (h.lvl < MAX_LEVEL && h.xp >= xpNeeded(h.lvl)) {
    const before = heroStats(h);
    h.xp -= xpNeeded(h.lvl);
    h.lvl++;
    h.points++;
    ups++;
    const after = heroStats(h);
    if (h.hp > 0) h.hp += after.hp - before.hp;
    h.mp += after.mp - before.mp;
  }
  if (h.lvl >= MAX_LEVEL) h.xp = 0;
  return ups;
}

/** Why a tree skill cannot be learned yet, or null when it can. */
export function learnBlock(h: Hero, skill: string): string | null {
  const c = CLASSES[h.cls];
  const tier = c.tree.findIndex((t) => t.includes(skill));
  if (tier < 0) return 'Not in this tree';
  if (h.skills.includes(skill)) return 'Learned';
  const lvl = 2 + tier * 2;
  if (h.lvl < lvl) return `Needs level ${lvl}`;
  if (tier > 0 && !c.tree[tier - 1].some((s) => h.skills.includes(s))) return 'Needs a skill of the tier above';
  if (h.points < 1) return 'No skill points';
  return null;
}

export function learn(h: Hero, skill: string): boolean {
  if (learnBlock(h, skill)) return false;
  h.skills.push(skill);
  h.points--;
  return true;
}

export function clampHero(h: Hero): void {
  const s = heroStats(h);
  h.hp = Math.max(0, Math.min(s.hp, h.hp));
  h.mp = Math.max(0, Math.min(s.mp, h.mp));
}
