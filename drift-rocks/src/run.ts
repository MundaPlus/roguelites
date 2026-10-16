/** Run state: waves, upgrade picks, dock, save data and meta progress. */
import { HULLS, HULL_IDS, UPGRADES, UP_IDS, WAVES, isDockWave } from './data';
import type { Game } from './game';
import { Rng, hash } from './rng';

export type Stage = 'play' | 'pick' | 'dock';

export interface DockItem {
  kind: 'life' | 'up';
  id: string;
  cost: number;
  sold: boolean;
}

export interface RunState {
  seed: string;
  hull: string;
  /** The wave to play next (1-based). */
  wave: number;
  lives: number;
  credits: number;
  score: number;
  kills: number;
  mods: Record<string, number>;
  stage: Stage;
  offers: string[];
  dock: DockItem[];
  livesBought: number;
  /** Unlocked upgrade ids at run start. */
  pool: string[];
}

export interface Meta {
  shards: number;
  unlocked: string[];
  hull: string;
  runs: number;
  wins: number;
  bestWave: number;
  best: number;
  kills: number;
}

export const MAX_LIVES = 6;

/** Things that cost shards: hulls and upgrades with an unlock price. */
export const LOCKED: string[] = [...HULL_IDS.filter((id) => HULLS[id].unlock > 0), ...UP_IDS.filter((id) => UPGRADES[id].unlock > 0)];

export const unlockCost = (id: string): number => HULLS[id]?.unlock ?? UPGRADES[id]?.unlock ?? 0;

export function owns(meta: Meta, id: string): boolean {
  return unlockCost(id) === 0 || meta.unlocked.includes(id);
}

export function newRun(seed: string, meta: Meta): RunState {
  const hull = owns(meta, meta.hull) ? meta.hull : 'arrow';
  const h = HULLS[hull];
  return {
    seed, hull, wave: 1, lives: h.lives, credits: 0, score: 0, kills: 0, mods: { ...h.start }, stage: 'play', offers: [], dock: [], livesBought: 0,
    pool: UP_IDS.filter((id) => owns(meta, id)),
  };
}

/** Copy the wave result back into the run. */
export function absorb(run: RunState, g: Game): void {
  run.lives = g.lives;
  run.credits = g.credits;
  run.score = g.score;
  run.kills += g.gained.kills;
}

export const upgradable = (run: RunState): string[] => run.pool.filter((id) => (run.mods[id] ?? 0) < UPGRADES[id].max);

export function makeOffers(run: RunState): string[] {
  const rng = new Rng(hash(run.seed, 'offer', run.wave));
  return rng.shuffle(upgradable(run)).slice(0, 3);
}

export const upCost = (run: RunState, id: string): number => 60 + 50 * (run.mods[id] ?? 0);
export const lifeCost = (run: RunState): number => 90 + 50 * run.livesBought;

export function makeDock(run: RunState): DockItem[] {
  const rng = new Rng(hash(run.seed, 'dock', run.wave));
  const ups = rng.shuffle(upgradable(run)).slice(0, 3);
  return [{ kind: 'life', id: 'life', cost: lifeCost(run), sold: false }, ...ups.map((id) => ({ kind: 'up' as const, id, cost: upCost(run, id), sold: false }))];
}

export function applyUp(run: RunState, id: string): void {
  run.mods[id] = Math.min(UPGRADES[id].max, (run.mods[id] ?? 0) + 1);
}

export function buy(run: RunState, i: number): boolean {
  const it = run.dock[i];
  if (!it || it.sold || run.credits < it.cost) return false;
  if (it.kind === 'life') {
    if (run.lives >= MAX_LIVES) return false;
    run.lives++;
    run.livesBought++;
  } else {
    if ((run.mods[it.id] ?? 0) >= UPGRADES[it.id].max) return false;
    applyUp(run, it.id);
  }
  run.credits -= it.cost;
  it.sold = true;
  return true;
}

/** After a cleared wave: go to the upgrade pick. Returns true when the run is won. */
export function waveCleared(run: RunState): boolean {
  if (run.wave >= WAVES) return true;
  run.offers = makeOffers(run);
  run.stage = run.offers.length ? 'pick' : 'play';
  if (!run.offers.length) afterPick(run);
  return false;
}

/** After the pick: open the dock on dock waves, else go to the next wave. */
export function afterPick(run: RunState): void {
  run.offers = [];
  if (isDockWave(run.wave)) {
    run.dock = makeDock(run);
    run.stage = 'dock';
  } else {
    run.wave++;
    run.stage = 'play';
  }
}

export function leaveDock(run: RunState): void {
  run.dock = [];
  run.wave++;
  run.stage = 'play';
}

export function finalScore(run: RunState, victory: boolean): number {
  return run.score + (victory ? 5000 + run.lives * 1000 : 0) + run.credits;
}

export const shardsFor = (score: number, waves: number): number => Math.floor(score / 4000) + waves;

// ---------- Save data ----------

const RUN_KEY = 'drift.run';
const META_KEY = 'drift.meta';

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage full or blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    if (!r || typeof r.wave !== 'number' || !HULLS[r.hull]) return null;
    return r;
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
  const base: Meta = { shards: 0, unlocked: [], hull: 'arrow', runs: 0, wins: 0, bestWave: 0, best: 0, kills: 0 };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
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
