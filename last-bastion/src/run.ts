/** Save data: the run in progress and the meta progress. All storage access is in try/catch. */
import { RELICS, TOWERS, TOWER_UNLOCK, type TowerId } from './data';
import type { RunState } from './game';

const RUN_KEY = 'last-bastion.run';
const META_KEY = 'last-bastion.meta';

export interface Meta {
  crystals: number;
  unlocked: string[];
  relic: string | null;
  runs: number;
  wins: number;
  bestWave: number;
  best: number;
  kills: number;
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || !run.map?.tiles?.length || run.towers.some((t) => !TOWERS[t.type])) return null;
    return run;
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
  const base: Meta = { crystals: 0, unlocked: [], relic: null, runs: 0, wins: 0, bestWave: 0, best: 0, kills: 0 };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    if (m.relic && !RELICS[m.relic]) m.relic = null;
    return m;
  } catch {
    return base;
  }
}

export function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

/** Tower types that cards can offer in a run. */
export function towerPool(meta: Meta): TowerId[] {
  return (Object.keys(TOWERS) as TowerId[]).filter((t) => !TOWER_UNLOCK[t] || meta.unlocked.includes(t));
}

export const unlockCost = (id: string): number => TOWER_UNLOCK[id as TowerId] ?? RELICS[id]?.cost ?? 0;

export const UNLOCKS: string[] = [...Object.keys(TOWER_UNLOCK), ...Object.keys(RELICS)];
