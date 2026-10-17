/** Run state, map plan, rewards, shop, score and save data. Pure logic. */
import { CHARMS, CHARM_ORDER, PENS, PEN_ORDER, PERKS } from './data';
import { LEVELS, type LevelDef } from './levels';
import { Rng, hash } from './rng';

export type NodeKind = 'level' | 'chest' | 'shop' | 'boss';
/** The steps of each world. */
export const PLAN: NodeKind[] = ['level', 'level', 'chest', 'level', 'shop', 'boss'];

export const NODE_INFO: Record<NodeKind, { icon: string; name: string }> = {
  level: { icon: '✏️', name: 'Puzzle' },
  chest: { icon: '🎁', name: 'Chest' },
  shop: { icon: '🛒', name: 'Stationery shop' },
  boss: { icon: '👑', name: 'Boss' },
};

export const GOAL_INFO: Record<LevelDef['goal'], { icon: string; text: string }> = {
  cup: { icon: '🏁', text: 'Get the ball into the cup.' },
  target: { icon: '📦', text: 'Knock the blue crate into the green zone.' },
  keep: { icon: '⏱️', text: 'Keep it off the spikes until the clock runs out.' },
};

export interface LevelPick {
  id: string;
  mirror: boolean;
}

export type Pick =
  | { kind: 'pen'; id: string; n: number }
  | { kind: 'charm'; id: string }
  | { kind: 'ink'; pct: number }
  | { kind: 'heart' };

export interface ShopItem {
  pick: Pick;
  cost: number;
  sold: boolean;
}

export interface RunState {
  seed: string;
  world: number;
  step: number;
  /** Level options per world and step. */
  options: LevelPick[][][];
  hearts: number;
  maxHearts: number;
  /** Stars to spend. */
  wallet: number;
  /** Stars earned this run. */
  earned: number;
  cleared: number;
  inkPct: number;
  pens: Record<string, number>;
  charms: string[];
  patchUsed: boolean[];
  /** The level in play, if any. */
  cur: { pick: LevelPick; misses: number } | null;
  chest: Pick[] | null;
  shop: ShopItem[] | null;
  log: { id: string; stars: number }[];
}

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  bestWorld: number;
  lifetime: number;
  cleared: number;
  threeStars: number;
}

const RUN_KEY = 'inkbridge.run';
const META_KEY = 'inkbridge.meta';

export const rngFor = (r: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(r.seed, ...parts));

export function newRun(seed: string, meta: Meta): RunState {
  const options: LevelPick[][][] = [];
  for (let w = 0; w < 3; w++) {
    const rng = new Rng(hash(seed, 'world', w));
    const pool = rng.shuffle(LEVELS.filter((l) => l.world === w && !l.boss).map((l) => l.id));
    const boss = LEVELS.find((l) => l.world === w && l.boss)!.id;
    let k = 0;
    options.push(
      PLAN.map((kind) => {
        if (kind === 'level') return [0, 1].map(() => ({ id: pool[k++ % pool.length], mirror: rng.chance(0.5) }));
        if (kind === 'boss') return [{ id: boss, mirror: rng.chance(0.5) }];
        return [];
      }),
    );
  }
  const has = (id: string): boolean => meta.lifetime >= (PERKS.find((p) => p.id === id)?.unlock ?? Infinity);
  const hearts = 3 + (has('start-heart') ? 1 : 0);
  return {
    seed,
    world: 0,
    step: 0,
    options,
    hearts,
    maxHearts: hearts,
    wallet: 0,
    earned: 0,
    cleared: 0,
    inkPct: has('start-ink') ? 10 : 0,
    pens: has('start-rubber') ? { rubber: 2 } : {},
    charms: [],
    patchUsed: [false, false, false],
    cur: null,
    chest: null,
    shop: null,
    log: [],
  };
}

export const nodeKind = (r: RunState): NodeKind => PLAN[r.step];

/** Ink budget for a level with the run's upgrades. */
export function inkFor(r: RunState, def: LevelDef): number {
  const pct = r.inkPct + (r.charms.includes('inkwell') ? 25 : 0);
  return Math.round(def.ink * (1 + pct / 100) * 10) / 10;
}

export const timerBonus = (r: RunState): number => (r.charms.includes('hourglass') ? 10 : 0);
export const parFor = (r: RunState, def: LevelDef): number => def.par * (r.charms.includes('hourglass') ? 1.5 : 1);
/** Ink at or below this (base budget) gives the ink star. */
export const starInk = (def: LevelDef): number => Math.round(def.ink * 0.85 * 10) / 10;

/** Stars for a cleared level: clear, ink, time (keep goals: no miss). */
export function starsFor(r: RunState, def: LevelDef, ink: number, t: number, misses: number): { stars: number; ink: boolean; time: boolean } {
  const inkOk = ink <= starInk(def) + 1e-6;
  const timeOk = def.goal === 'keep' ? misses === 0 : t <= parFor(r, def) + 1e-6;
  return { stars: 1 + (inkOk ? 1 : 0) + (timeOk ? 1 : 0), ink: inkOk, time: timeOk };
}

/** Books a cleared level. Returns the stars added to the wallet. */
export function clearLevel(r: RunState, def: LevelDef, stars: number): number {
  let gain = stars;
  if (stars === 3 && r.charms.includes('lens')) gain++;
  r.wallet += gain;
  r.earned += gain;
  r.cleared++;
  r.log.push({ id: def.id, stars });
  if (def.boss) r.hearts = Math.min(r.maxHearts, r.hearts + 1);
  r.cur = null;
  return gain;
}

/** A miss. Returns true when it cost a heart. */
export function missLevel(r: RunState): boolean {
  if (r.cur) r.cur.misses++;
  if (r.charms.includes('patch') && !r.patchUsed[r.world]) {
    r.patchUsed[r.world] = true;
    return false;
  }
  r.hearts--;
  return true;
}

export function advance(r: RunState): 'next' | 'world' | 'won' {
  r.chest = null;
  r.shop = null;
  r.step++;
  if (r.step < PLAN.length) return 'next';
  r.step = 0;
  r.world++;
  return r.world >= 3 ? 'won' : 'world';
}

export function unlockedPens(meta: Meta): string[] {
  return PEN_ORDER.filter((id) => id !== 'pencil' && meta.lifetime >= PENS[id].unlock);
}

export function unlockedCharms(meta: Meta): string[] {
  return CHARM_ORDER.filter((id) => meta.lifetime >= CHARMS[id].unlock);
}

function randomPick(r: RunState, meta: Meta, rng: Rng, avoid: Pick[]): Pick {
  const same = (a: Pick, b: Pick): boolean => a.kind === b.kind && ('id' in a ? 'id' in b && a.id === b.id : true);
  for (let i = 0; i < 20; i++) {
    const kind = rng.weighted<Pick['kind']>([
      ['pen', 4],
      ['charm', 3],
      ['ink', 2],
      ['heart', r.hearts < r.maxHearts ? 2 : 0.5],
    ]);
    let p: Pick;
    if (kind === 'pen') p = { kind, id: rng.pick(unlockedPens(meta)), n: 3 + (r.charms.includes('case') ? 2 : 0) };
    else if (kind === 'charm') {
      const left = unlockedCharms(meta).filter((id) => !r.charms.includes(id));
      if (!left.length) continue;
      p = { kind, id: rng.pick(left) };
    } else if (kind === 'ink') p = { kind, pct: 20 };
    else p = { kind: 'heart' };
    if (!avoid.some((a) => same(a, p))) return p;
  }
  return { kind: 'ink', pct: 15 };
}

export function makeChest(r: RunState, meta: Meta): Pick[] {
  const rng = rngFor(r, 'chest', r.world, r.step);
  const out: Pick[] = [];
  for (let i = 0; i < 3; i++) out.push(randomPick(r, meta, rng, out));
  return out;
}

export function makeShop(r: RunState, meta: Meta): ShopItem[] {
  const rng = rngFor(r, 'shop', r.world, r.step);
  const out: ShopItem[] = [{ pick: { kind: 'heart' }, cost: 4, sold: false }];
  const pens = rng.shuffle(unlockedPens(meta)).slice(0, 2);
  for (const id of pens) out.push({ pick: { kind: 'pen', id, n: 2 + (r.charms.includes('case') ? 2 : 0) }, cost: 3, sold: false });
  out.push({ pick: { kind: 'ink', pct: 15 }, cost: 5, sold: false });
  const left = unlockedCharms(meta).filter((id) => !r.charms.includes(id));
  if (left.length) out.push({ pick: { kind: 'charm', id: rng.pick(left) }, cost: 7, sold: false });
  return out;
}

export function applyPick(r: RunState, p: Pick): void {
  if (p.kind === 'pen') r.pens[p.id] = (r.pens[p.id] ?? 0) + p.n;
  else if (p.kind === 'charm') {
    r.charms.push(p.id);
    if (p.id === 'heart') {
      r.maxHearts++;
      r.hearts = Math.min(r.maxHearts, r.hearts + 1);
    }
  } else if (p.kind === 'ink') r.inkPct += p.pct;
  else r.hearts = Math.min(r.maxHearts, r.hearts + 1);
}

export function pickText(p: Pick): { icon: string; name: string; text: string } {
  if (p.kind === 'pen') return { icon: PENS[p.id].icon, name: `${PENS[p.id].name} ×${p.n}`, text: PENS[p.id].text };
  if (p.kind === 'charm') return { icon: CHARMS[p.id].icon, name: CHARMS[p.id].name, text: CHARMS[p.id].text };
  if (p.kind === 'ink') return { icon: '🖋️', name: `+${p.pct}% ink`, text: 'More ink in every level from now on.' };
  return { icon: '❤️', name: 'Heal 1 heart', text: 'Get back one heart (up to your max).' };
}

export function score(r: RunState, won: boolean): number {
  return r.earned * 10 + r.cleared * 25 + (won ? 200 + r.hearts * 30 : 0);
}

// ---------- Save data ----------

export function saveRun(r: RunState | null): void {
  try {
    if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage may be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    return r && Array.isArray(r.options) ? r : null;
  } catch {
    return null;
  }
}

export const clearRun = (): void => saveRun(null);

export function loadMeta(): Meta {
  const base: Meta = { runs: 0, wins: 0, best: 0, bestWorld: 0, lifetime: 0, cleared: 0, threeStars: 0 };
  try {
    const s = localStorage.getItem(META_KEY);
    return s ? { ...base, ...(JSON.parse(s) as Partial<Meta>) } : base;
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage may be blocked */
  }
}
