/** Run state: world map, capital upgrades, save data. */
import { BIOMES, CURSE_IDS, METAS, PERK_IDS, type BiomeId, type CurseId, type MetaId, type PerkId } from './data';
import { Rng, hash } from './rng';
import { newSettlement, type Settlement } from './sim';

export const SETTLEMENTS = 4;
const RUN_KEY = 'storm-haven.run';
const META_KEY = 'storm-haven.meta';

export interface WorldNode {
  name: string;
  biome: BiomeId;
  curses: CurseId[];
  crowns: number;
}

export interface Done {
  name: string;
  biome: BiomeId;
  won: boolean;
  rep: number;
}

export interface RunState {
  v: 1;
  seed: string;
  step: number;
  favor: number;
  perks: PerkId[];
  phase: 'world' | 'settle' | 'reward';
  choices: WorldNode[];
  node: WorldNode | null;
  settle: Settlement | null;
  rewards: PerkId[];
  history: Done[];
  crowns: number;
  score: number;
}

export interface Meta {
  crowns: number;
  levels: Partial<Record<MetaId, number>>;
  runs: number;
  wins: number;
  settled: number;
  best: number;
}

const NAMES = ['Ashford', 'Mossgate', 'Rainhollow', 'Thornwick', 'Emberfall', 'Greywater', 'Willowmere', 'Stonebrook', 'Fernhaven', 'Dunmarsh', 'Oakrest', 'Mistvale', 'Brightmoor', 'Hollowell', 'Redcliff', 'Sablewood'];

export const rngFor = (run: RunState, ...tag: (string | number)[]): Rng => new Rng(hash(run.seed, ...tag));

export function newRun(seed: string, meta: Meta): RunState {
  const run: RunState = {
    v: 1,
    seed,
    step: 0,
    favor: 2 + (meta.levels.favor ?? 0),
    perks: [],
    phase: 'world',
    choices: [],
    node: null,
    settle: null,
    rewards: [],
    history: [],
    crowns: 0,
    score: 0,
  };
  run.choices = worldChoices(run);
  return run;
}

export function isFinal(run: RunState): boolean {
  return run.step >= SETTLEMENTS - 1;
}

export function worldChoices(run: RunState): WorldNode[] {
  const r = rngFor(run, 'world', run.step);
  const used = new Set(run.history.map((h) => h.name));
  const name = (): string => {
    let n = r.pick(NAMES);
    for (let k = 0; k < 20 && used.has(n); k++) n = r.pick(NAMES);
    used.add(n);
    return n;
  };
  if (isFinal(run)) {
    return [0, 1].map(() => {
      const curses = r.shuffle([...CURSE_IDS]).slice(0, 2);
      return { name: name(), biome: 'vale' as BiomeId, curses, crowns: 6 };
    });
  }
  const biomes = r.shuffle(['woods', 'marsh', 'highlands', 'orchard'] as BiomeId[]).slice(0, 3);
  return biomes.map((biome, i) => {
    const nc = Math.min(2, (run.step === 0 ? 0 : 1) + (i === 2 ? 1 : 0) + (run.step === 2 && i > 0 ? 1 : 0));
    const curses = r.shuffle([...CURSE_IDS]).slice(0, nc);
    return { name: name(), biome, curses, crowns: 2 + run.step + nc };
  });
}

export function startSettlement(run: RunState, i: number, meta: Meta): void {
  const node = run.choices[i];
  run.node = node;
  run.settle = newSettlement({
    seed: hash(run.seed, 'settle', run.step, i),
    biome: node.biome,
    curses: node.curses,
    final: isFinal(run),
    step: run.step,
    name: node.name,
    perks: run.perks,
    meta: meta.levels,
  });
  run.phase = 'settle';
}

/** Ends the current settlement. Returns 'next', 'won' (run won) or 'lost' (run lost). */
export function endSettlement(run: RunState): 'next' | 'won' | 'lost' {
  const s = run.settle!;
  const won = s.done === 'win';
  run.history.push({ name: s.name, biome: s.biome, won, rep: Math.floor(s.rep) });
  run.score += Math.floor(s.rep) * 20 + s.v.length * 5 + (won ? 300 + Math.max(0, Math.round(100 - s.imp)) * 3 : 0);
  if (won) run.crowns += run.node!.crowns;
  const final = isFinal(run);
  run.settle = null;
  if (final) {
    if (won) run.score += 1000;
    return won ? 'won' : 'lost';
  }
  if (!won) {
    run.favor--;
    if (run.favor <= 0) return 'lost';
    run.step++;
    run.choices = worldChoices(run);
    run.phase = 'world';
    return 'next';
  }
  const r = rngFor(run, 'perk', run.step);
  run.rewards = r.shuffle([...PERK_IDS]).slice(0, 3);
  run.phase = 'reward';
  return 'next';
}

export function takePerk(run: RunState, i: number): void {
  const p = run.rewards[i];
  if (p) run.perks.push(p);
  run.rewards = [];
  run.step++;
  run.choices = worldChoices(run);
  run.phase = 'world';
}

export function finishRun(run: RunState, meta: Meta, won: boolean): number {
  const crowns = run.crowns + (won ? 5 : 0) + run.history.filter((h) => h.won).length;
  meta.crowns += crowns;
  meta.runs++;
  if (won) meta.wins++;
  meta.settled += run.history.filter((h) => h.won).length;
  meta.best = Math.max(meta.best, run.score);
  return crowns;
}

export function metaCost(meta: Meta, id: MetaId): number | null {
  const lvl = meta.levels[id] ?? 0;
  return METAS[id].costs[lvl] ?? null;
}

export function buyMeta(meta: Meta, id: MetaId): boolean {
  const c = metaCost(meta, id);
  if (c === null || meta.crowns < c) return false;
  meta.crowns -= c;
  meta.levels[id] = (meta.levels[id] ?? 0) + 1;
  return true;
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
    if (run.v !== 1 || !Array.isArray(run.choices) || (run.settle && !BIOMES[run.settle.biome])) return null;
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
  const base: Meta = { crowns: 0, levels: {}, runs: 0, wins: 0, settled: 0, best: 0 };
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
