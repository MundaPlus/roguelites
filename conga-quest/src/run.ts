/** Run state, shrine offers, meta progress, score and save data. */
import { CLASSES, CLASS_IDS, MAX_PARTY, WAVES, heroStats, xpNeed, type ClassId } from './data';
import { Rng, hash } from './rng';
import type { Carry, HeroSave, World } from './world';

export interface RunState extends Carry {
  seed: string;
  /** The wave to play next (1..15). */
  wave: number;
  fallen: ClassId[];
  rerolls: number;
  revives: number;
  trains: number;
  crashes: number;
  /** True when the shrine of the current wave was used. */
  shrineDone: boolean;
}

export interface Meta {
  runs: number;
  wins: number;
  bestWave: number;
  bestScore: number;
  kills: number;
  leader: ClassId;
}

export type Offer =
  | { kind: 'recruit'; cls: ClassId }
  | { kind: 'upgrade'; index: number }
  | { kind: 'feast' }
  | { kind: 'tithe'; coins: number };

export const COST = { revive: 20, potion: 10, reroll: 6 };
const RUN_KEY = 'conga.run';
const META_KEY = 'conga.meta';

export function unlockedClasses(meta: Meta): ClassId[] {
  return CLASS_IDS.filter((c) => CLASSES[c].unlock <= meta.bestWave || meta.wins > 0);
}

export function newHero(cls: ClassId, level: number): HeroSave {
  return { cls, hp: heroStats(cls, 0, level, {}).maxHp, stars: 0 };
}

export function newRun(seed: string, leader: ClassId, unlocked: ClassId[]): RunState {
  const rng = new Rng(hash(seed, 'start'));
  const others = rng.shuffle(unlocked.filter((c) => c !== leader));
  const heroes = [newHero(leader, 1), newHero(others[0] ?? 'knight', 1), newHero(others[1] ?? 'archer', 1)];
  return { seed, wave: 1, heroes, level: 1, xp: 0, coins: 0, kills: 0, gems: 0, fallen: [], rerolls: 0, revives: 0, trains: 0, crashes: 0, shrineDone: false };
}

/** Takes the result of a cleared wave into the run. */
export function absorb(r: RunState, w: World): void {
  Object.assign(r, w.carry());
  r.fallen.push(...w.fallen);
  r.crashes += w.crashes;
  r.wave = w.wave + 1;
  r.rerolls = 0;
  r.shrineDone = false;
}

export function shrineOffers(r: RunState, unlocked: ClassId[]): Offer[] {
  const rng = new Rng(hash(r.seed, 'shrine', r.wave, r.rerolls));
  const out: Offer[] = [];
  const pool: Offer[] = [];
  if (r.heroes.length < MAX_PARTY) {
    for (const c of rng.shuffle([...unlocked]).slice(0, 2)) pool.push({ kind: 'recruit', cls: c });
  }
  const up = rng.shuffle(r.heroes.map((_, i) => i).filter((i) => r.heroes[i].stars < 3));
  for (const i of up.slice(0, 2)) pool.push({ kind: 'upgrade', index: i });
  rng.shuffle(pool);
  out.push(...pool.slice(0, 2));
  const hurt = r.heroes.some((h) => h.hp < heroStats(h.cls, h.stars, r.level, {}).maxHp * 0.7);
  if (out.length < 3 && pool.length > 2 && !hurt) out.push(pool[2]);
  if (out.length < 3) out.push(hurt || rng.chance(0.5) ? { kind: 'feast' } : { kind: 'tithe', coins: 12 + r.wave });
  return out;
}

export function offerText(r: RunState, o: Offer): { icon: string; title: string; text: string } {
  switch (o.kind) {
    case 'recruit': {
      const d = CLASSES[o.cls];
      return { icon: d.icon, title: `Recruit ${d.name}`, text: d.text };
    }
    case 'upgrade': {
      const h = r.heroes[o.index];
      const d = CLASSES[h.cls];
      return { icon: d.icon, title: `Train ${d.name} ${'★'.repeat(h.stars + 1)}`, text: 'More damage, HP and speed. Heals it to full.' };
    }
    case 'feast':
      return { icon: '🍖', title: 'Feast', text: 'Heal every hero to full HP. +5 gems.' };
    case 'tithe':
      return { icon: '🪙', title: 'Tithe', text: `Take ${o.coins} coins.` };
  }
}

export function maxHpOf(r: RunState, h: HeroSave): number {
  return heroStats(h.cls, h.stars, r.level, {}).maxHp;
}

export function applyOffer(r: RunState, o: Offer): void {
  switch (o.kind) {
    case 'recruit':
      if (r.heroes.length < MAX_PARTY) r.heroes.push(newHero(o.cls, r.level));
      break;
    case 'upgrade': {
      const h = r.heroes[o.index];
      if (h && h.stars < 3) {
        h.stars++;
        h.hp = maxHpOf(r, h);
      }
      break;
    }
    case 'feast':
      for (const h of r.heroes) h.hp = maxHpOf(r, h);
      r.gems += 5;
      r.xp += 5;
      while (r.xp >= xpNeed(r.level)) {
        r.xp -= xpNeed(r.level);
        r.level++;
      }
      break;
    case 'tithe':
      r.coins += o.coins;
      break;
  }
  r.shrineDone = true;
}

export const reviveCost = (r: RunState): number => COST.revive + r.revives * 10;

export function canRevive(r: RunState): boolean {
  return r.fallen.length > 0 && r.heroes.length < MAX_PARTY && r.coins >= reviveCost(r);
}

export function revive(r: RunState): ClassId | null {
  if (!canRevive(r)) return null;
  r.coins -= reviveCost(r);
  r.revives++;
  const cls = r.fallen.pop()!;
  r.heroes.push(newHero(cls, r.level));
  return cls;
}

export const trainCost = (r: RunState): number => 40 + (r.trains ?? 0) * 20;

export function canTrain(r: RunState): boolean {
  return r.heroes[0].stars < 3 && r.coins >= trainCost(r);
}

/** Buys one star for the leader. */
export function train(r: RunState): boolean {
  if (!canTrain(r)) return false;
  r.coins -= trainCost(r);
  r.trains = (r.trains ?? 0) + 1;
  const h = r.heroes[0];
  h.stars++;
  h.hp = maxHpOf(r, h);
  return true;
}

export function potion(r: RunState): boolean {
  if (r.coins < COST.potion) return false;
  r.coins -= COST.potion;
  for (const h of r.heroes) h.hp = Math.min(maxHpOf(r, h), h.hp + Math.ceil(maxHpOf(r, h) * 0.5));
  return true;
}

/** Moves hero `i` to the front of the line. */
export function makeLeader(r: RunState, i: number): void {
  if (i <= 0 || i >= r.heroes.length) return;
  const [h] = r.heroes.splice(i, 1);
  r.heroes.unshift(h);
}

export function score(r: RunState, victory: boolean): number {
  const cleared = Math.min(WAVES, r.wave - 1);
  return cleared * 100 + r.kills * 5 + r.gems * 2 + r.coins + (victory ? 2000 + r.heroes.length * 150 : 0);
}

export function defaultMeta(): Meta {
  return { runs: 0, wins: 0, bestWave: 0, bestScore: 0, kills: 0, leader: 'knight' };
}

export function endRun(meta: Meta, r: RunState, victory: boolean): number {
  const s = score(r, victory);
  meta.runs++;
  if (victory) meta.wins++;
  meta.bestWave = Math.max(meta.bestWave, Math.min(WAVES, r.wave - (victory ? 0 : 1)));
  meta.bestScore = Math.max(meta.bestScore, s);
  meta.kills += r.kills;
  return s;
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return { ...defaultMeta(), ...(JSON.parse(raw) as Partial<Meta>) };
  } catch {
    /* ignore */
  }
  return defaultMeta();
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    if (!r || !Array.isArray(r.heroes) || !r.heroes.length || typeof r.wave !== 'number') return null;
    return r;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}
