/** Run state between stages, part offers, scoring and save data. */
import { PARTS, PART_IDS, SHIPS, STAGES } from './data';
import { Rng, hash } from './rng';
import { makeLoadout, type Game, type Loadout } from './sim';

export interface RunState {
  seedText: string;
  seed: number;
  ship: string;
  /** Index of the next stage to play (0..4). */
  stage: number;
  loop: number;
  lives: number;
  bombs: number;
  charge: number;
  score: number;
  parts: Record<string, number>;
  graze: number;
  deaths: number;
  bombsUsed: number;
  spellsSeen: number;
  spellsCaptured: number;
  kills: number;
  /** Part choices waiting after a cleared stage. */
  offer: string[] | null;
  /** Stage summary for the part screen. */
  last: StageResult | null;
  /** Set when the run already counted as a win (loop mode). */
  won: boolean;
  /** Seeds already paid out for this run (loop mode pays the rest later). */
  seedsGiven: number;
}

export interface StageResult {
  stage: number;
  score: number;
  graze: number;
  deaths: number;
  spells: string;
}

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  bestStage: number;
  seeds: number;
  unlocked: string[];
  totalGraze: number;
}

const RUN_KEY = 'bb.run';
const META_KEY = 'bb.meta';

export function newRun(seedText: string, ship: string): RunState {
  const s = SHIPS.find((x) => x.id === ship) ?? SHIPS[0];
  return {
    seedText,
    seed: hash(seedText),
    ship: s.id,
    stage: 0,
    loop: 0,
    lives: s.lives,
    bombs: s.bombs,
    charge: 0,
    score: 0,
    parts: {},
    graze: 0,
    deaths: 0,
    bombsUsed: 0,
    spellsSeen: 0,
    spellsCaptured: 0,
    kills: 0,
    offer: null,
    last: null,
    won: false,
    seedsGiven: 0,
  };
}

export const loadoutOf = (r: RunState): Loadout => makeLoadout(r.ship, r.parts);

/** Part level including the ship's starting parts. */
export function partLevel(r: RunState, id: string): number {
  const s = SHIPS.find((x) => x.id === r.ship) ?? SHIPS[0];
  return (r.parts[id] ?? 0) + (s.start[id] ?? 0);
}

/** Copy the result of a finished stage into the run. */
export function absorbStage(r: RunState, g: Game): void {
  r.lives = g.lives;
  r.bombs = g.bombs;
  r.charge = g.charge;
  r.score = g.score;
  r.graze += g.graze;
  r.deaths += g.deaths;
  r.bombsUsed += g.bombsUsed;
  r.spellsSeen += g.spellsSeen;
  r.spellsCaptured += g.spellsCaptured;
  r.kills += g.kills;
}

/** 3 part choices after stage `stage`. Seeded by the run. */
export function makeOffer(r: RunState): string[] {
  const rng = new Rng(hash(r.seed, 'offer', r.stage, r.loop));
  const pool = PART_IDS.filter((id) => partLevel(r, id) < PARTS[id].max);
  const weights: [string, number][] = pool.map((id) => [id, id === 'life' ? 0.5 : id === 'bombs' ? 0.8 : id === 'shield' ? 0.7 : 1.2]);
  const out: string[] = [];
  while (out.length < 3 && weights.length) {
    const id = rng.weighted(weights);
    out.push(id);
    weights.splice(
      weights.findIndex(([x]) => x === id),
      1,
    );
  }
  return out;
}

export function applyPart(r: RunState, id: string): void {
  if (id === 'life') r.lives++;
  else if (id === 'bombs') r.bombs = Math.min(8, r.bombs + 2);
  else {
    r.parts[id] = (r.parts[id] ?? 0) + 1;
    if (id === 'bigbomb') r.bombs = Math.min(8, r.bombs + 1);
  }
}

/** Seeds for the meta shop. */
export const seedsFor = (r: RunState, victory: boolean): number => Math.floor(r.score / 200000) + (r.stage + r.loop * 5) * 3 + (victory ? 15 : 0);

export const stageName = (i: number): string => STAGES[Math.min(i, STAGES.length - 1)].name;

// ---------- Save data ----------

export function saveRun(r: RunState | null): void {
  try {
    if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    if (typeof r.stage !== 'number' || !r.ship) return null;
    return r;
  } catch {
    return null;
  }
}

export function loadMeta(): Meta {
  const base: Meta = { runs: 0, wins: 0, best: 0, bestStage: 0, seeds: 0, unlocked: ['petal'], totalGraze: 0 };
  try {
    const s = localStorage.getItem(META_KEY);
    if (!s) return base;
    const m = { ...base, ...(JSON.parse(s) as Partial<Meta>) };
    if (!m.unlocked.includes('petal')) m.unlocked.push('petal');
    return m;
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage blocked */
  }
}
