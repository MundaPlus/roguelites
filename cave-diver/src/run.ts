/** Run state, meta progress, score and save data. */
import { LEVEL_COUNT, LEVELS_PER_ZONE } from './data';
import type { Carry, World } from './world';

export interface RunState {
  seed: string;
  /** Index of the level to play next (0..15). */
  level: number;
  startLevel: number;
  hp: number;
  bombs: number;
  ropes: number;
  gold: number;
  items: string[];
  kills: number;
  pets: number;
  frames: number;
}

export interface Meta {
  runs: number;
  wins: number;
  bestLevel: number;
  bestScore: number;
  /** How often each zone was reached. Index 0 is unused. */
  reached: number[];
  pets: number;
  kills: number;
}

export const SHORTCUT_NEED = 3;
const RUN_KEY = 'cave.run';
const META_KEY = 'cave.meta';

export function newRun(seed: string, startZone = 0): RunState {
  const startLevel = startZone * LEVELS_PER_ZONE;
  return { seed, level: startLevel, startLevel, hp: 4, bombs: 4, ropes: 4, gold: 0, items: [], kills: 0, pets: 0, frames: 0 };
}

export function carryOf(r: RunState): Carry {
  return { hp: r.hp, bombs: r.bombs, ropes: r.ropes, gold: r.gold, items: [...r.items], kills: r.kills };
}

/** Takes the result of a cleared level into the run. Returns true if the run is won. */
export function finishLevel(r: RunState, w: World, meta: Meta): boolean {
  r.hp = w.hp + (w.petRescued ? 1 : 0);
  r.bombs = w.bombs;
  r.ropes = w.ropesLeft;
  r.gold = w.gold;
  r.items = [...w.items];
  r.kills = w.kills;
  r.frames += w.frame;
  if (w.petRescued) r.pets++;
  r.level++;
  if (r.level >= LEVEL_COUNT) return true;
  if (r.level % LEVELS_PER_ZONE === 0) {
    const z = r.level / LEVELS_PER_ZONE;
    meta.reached[z] = (meta.reached[z] ?? 0) + 1;
  }
  return false;
}

export function score(r: RunState, victory: boolean): number {
  return r.gold + (r.level - r.startLevel) * 1000 + r.pets * 500 + (victory ? 10000 : 0);
}

export function shortcutOpen(meta: Meta, zone: number): boolean {
  return zone === 0 || (meta.reached[zone] ?? 0) >= SHORTCUT_NEED;
}

export function defaultMeta(): Meta {
  return { runs: 0, wins: 0, bestLevel: 0, bestScore: 0, reached: [0, 0, 0, 0], pets: 0, kills: 0 };
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
    if (typeof r.level !== 'number' || r.level >= LEVEL_COUNT || r.hp <= 0) return null;
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

/** Records the end of a run in the meta stats. */
export function endRun(meta: Meta, r: RunState, victory: boolean): number {
  const s = score(r, victory);
  meta.runs++;
  if (victory) meta.wins++;
  meta.bestLevel = Math.max(meta.bestLevel, r.level + (victory ? 0 : 1));
  meta.bestScore = Math.max(meta.bestScore, s);
  meta.pets += r.pets;
  meta.kills += r.kills;
  return s;
}
