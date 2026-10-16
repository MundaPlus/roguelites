/** Save data: the current run and the meta progress (renown, class unlocks, records). */
import { CLASSES } from './data';
import { type Game, score } from './game';

const RUN_KEY = 'gridcrawler.run';
const META_KEY = 'gridcrawler.meta';

export interface Meta {
  renown: number;
  unlocked: string[];
  runs: number;
  wins: number;
  deepest: number;
  best: number;
  kills: number;
  last: string;
}

export function saveRun(g: Game): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(g));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): Game | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw) as Game;
    if (g.v !== 1 || g.over || !Array.isArray(g.tiles)) return null;
    return g;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadMeta(): Meta {
  const base: Meta = { renown: 0, unlocked: ['warrior'], runs: 0, wins: 0, deepest: 0, best: 0, kills: 0, last: 'warrior' };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    if (!m.unlocked.includes('warrior')) m.unlocked.push('warrior');
    return m;
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export const renownFor = (g: Game): number => Math.floor(score(g) / 60);

/** Books the end of a run into the meta progress. Returns the renown gained. */
export function finishRun(meta: Meta, g: Game): number {
  const gain = renownFor(g);
  meta.renown += gain;
  meta.runs++;
  if (g.over === 'won') meta.wins++;
  meta.deepest = Math.max(meta.deepest, g.floor);
  meta.best = Math.max(meta.best, score(g));
  meta.kills += g.kills;
  saveMeta(meta);
  clearRun();
  return gain;
}

export function unlock(meta: Meta, id: string): boolean {
  const c = CLASSES.find((k) => k.id === id);
  if (!c || meta.unlocked.includes(id) || meta.renown < c.cost) return false;
  meta.renown -= c.cost;
  meta.unlocked.push(id);
  saveMeta(meta);
  return true;
}
