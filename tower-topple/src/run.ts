/** Run state: map, challenge specs, rewards, shop, score and save data. */
import { BASE_SHAPES, KIND_INFO, SMALL_SHAPES, SPELLS, SPELL_IDS, UNLOCKS, WORLDS, type ChallengeKind } from './data';
import type { ChallengeSpec, GameResult } from './game';
import { Rng, hash } from './rng';

export type NodeKind = ChallengeKind | 'elite' | 'boss' | 'rest' | 'shop';

export interface MapNode {
  kind: NodeKind;
  /** Challenge type for elite and boss nodes. */
  ch: ChallengeKind;
}

export interface RunState {
  seed: string;
  world: number;
  step: number;
  lives: number;
  maxLives: number;
  coins: number;
  hand: string[];
  score: number;
  cleared: number;
  bestHeight: number;
  map: MapNode[][][];
  /** The node picked at each step of the current world. */
  path: number[];
  unlocked: string[];
}

export interface Meta {
  bricks: number;
  unlocked: string[];
  runs: number;
  wins: number;
  best: number;
  bestHeight: number;
  bestWorld: number;
}

export const STEPS = 6;
export const HAND_MAX = 5;
export const MAX_LIVES = 9;

export const NODE_INFO: Record<NodeKind, { name: string; icon: string; text: string }> = {
  race: KIND_INFO.race,
  hold: KIND_INFO.hold,
  ceiling: KIND_INFO.ceiling,
  elite: { name: 'Elite', icon: '💀', text: 'A harder challenge with a curse. Better rewards.' },
  boss: { name: 'Boss', icon: '👑', text: 'The world boss casts curses while you build.' },
  rest: { name: 'Camp', icon: '🔥', text: 'Rest for 3 lives, or study a new spell.' },
  shop: { name: 'Shop', icon: '🛒', text: 'Buy spells and lives with coins.' },
};

/** Step plans per world. `c` is a random challenge. */
const PLAN: string[][] = [
  ['c', 'c'],
  ['c', 'c', 'shop'],
  ['elite', 'c', 'rest'],
  ['c', 'shop', 'c'],
  ['rest', 'elite', 'c'],
  ['boss'],
];

const KINDS: ChallengeKind[] = ['race', 'hold', 'ceiling'];

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

function makeMap(seed: string): MapNode[][][] {
  return WORLDS.map((_, w) => {
    const rng = new Rng(hash(seed, 'map', w));
    return PLAN.map((row) => {
      const used = new Set<ChallengeKind>();
      return row.map((k) => {
        let ch = rng.pick(KINDS);
        if (k === 'c') {
          // Different challenge types side by side when possible.
          for (let i = 0; i < 4 && used.has(ch); i++) ch = rng.pick(KINDS);
          used.add(ch);
          return { kind: ch, ch };
        }
        if (k === 'boss') return { kind: 'boss', ch: 'race' };
        if (k === 'elite') return { kind: 'elite', ch: rng.pick(KINDS) };
        return { kind: k as NodeKind, ch };
      });
    });
  });
}

export function newRun(seed: string, meta: Meta): RunState {
  const lives = 5 + (meta.unlocked.includes('heart') ? 1 : 0);
  return {
    seed,
    world: 0,
    step: 0,
    lives,
    maxLives: Math.max(lives, 7),
    coins: 10,
    hand: meta.unlocked.includes('starter') ? ['glue'] : [],
    score: 0,
    cleared: 0,
    bestHeight: 0,
    map: makeMap(seed),
    path: [],
    unlocked: [...meta.unlocked],
  };
}

export const choices = (run: RunState): MapNode[] => run.map[run.world][run.step];

/** Spells this run can find. */
export const spellPool = (run: RunState): string[] => SPELL_IDS.filter((id) => SPELLS[id].unlock === 0 || run.unlocked.includes(id));

export function makeSpec(run: RunState, node: MapNode): ChallengeSpec {
  const W = WORLDS[run.world];
  const w = run.world;
  const rng = rngFor(run, 'spec', w, run.step, node.kind);
  const kind: ChallengeKind = node.kind === 'elite' || node.kind === 'boss' ? node.ch : (node.kind as ChallengeKind);
  const tier: ChallengeSpec['tier'] = node.kind === 'elite' ? 'elite' : node.kind === 'boss' ? 'boss' : 'normal';
  const shapes = [...BASE_SHAPES, ...(run.unlocked.includes('small') ? SMALL_SHAPES : [])];
  const spec: ChallengeSpec = {
    kind,
    world: w,
    tier,
    goal: 0,
    blocks: 0,
    time: 0,
    hold: 0,
    platW: W.platW,
    wind: W.wind,
    quake: W.quake,
    moving: W.moving,
    ice: W.ice,
    stone: W.stone,
    debris: W.debris,
    curses: [],
    curseEvery: 0,
    shapes,
    bigBlocks: false,
    seed: hash(run.seed, 'ch', w, run.step, node.kind),
  };
  if (kind === 'race') {
    spec.goal = rng.int(W.goal[0], W.goal[1]);
    spec.time = 60 + spec.goal * 4;
  } else if (kind === 'hold') {
    spec.blocks = 8 + w * 2 + rng.int(0, 2);
    spec.hold = 14 + w * 4;
  } else {
    spec.platW = W.platW + 2;
    spec.goal = 4 + w + rng.int(0, 1);
    spec.blocks = Math.round((spec.platW * spec.goal * 0.7) / 4);
  }
  if (tier === 'elite') {
    spec.curses = W.elite;
    spec.curseEvery = 12;
    if (kind === 'race') spec.goal += 2;
    if (kind === 'hold') spec.blocks += 2;
    if (kind === 'ceiling') spec.blocks += 1;
  }
  if (tier === 'boss') {
    spec.curses = W.boss.curses;
    spec.curseEvery = W.boss.every;
    spec.goal += 3;
    spec.time += 25;
  }
  return spec;
}

// ---------- Rewards ----------

export interface Rewards {
  coins: number;
  picks: string[];
  extra: string | null;
  life: number;
}

export function rewardsFor(run: RunState, node: MapNode, res: GameResult): Rewards {
  const rng = rngFor(run, 'reward', run.world, run.step);
  const pool = spellPool(run);
  const picks = rng.shuffle([...pool]).slice(0, 3);
  let coins = 8 + run.world * 2;
  if (res.timeLeft > 0) coins += Math.floor(res.timeLeft / 6);
  if (res.livesLost === 0) coins += 4;
  if (node.kind === 'elite') coins += 10;
  if (node.kind === 'boss') coins += 15;
  return {
    coins,
    picks,
    extra: node.kind === 'elite' ? rng.pick(pool) : null,
    life: (node.kind === 'boss' ? 2 : 0) + (res.livesLost === 0 ? 1 : 0),
  };
}

export function scoreFor(node: MapNode, res: GameResult): number {
  const base = node.kind === 'boss' ? 300 : node.kind === 'elite' ? 180 : 100;
  return base + Math.round(res.height * 5) + Math.round(res.timeLeft) - res.livesLost * 10;
}

export function addCard(run: RunState, id: string): boolean {
  if (run.hand.length >= HAND_MAX) return false;
  run.hand.push(id);
  return true;
}

export interface ShopItem {
  id: string;
  kind: 'spell' | 'life' | 'maxlife';
  price: number;
  sold: boolean;
}

export function makeShop(run: RunState): ShopItem[] {
  const rng = rngFor(run, 'shop', run.world, run.step);
  const items: ShopItem[] = rng
    .shuffle([...spellPool(run)])
    .slice(0, 4)
    .map((id) => ({ id, kind: 'spell' as const, price: SPELLS[id].price + run.world * 2, sold: false }));
  items.push({ id: 'life', kind: 'life', price: 14 + run.world * 3, sold: false });
  items.push({ id: 'maxlife', kind: 'maxlife', price: 26 + run.world * 4, sold: false });
  return items;
}

/** Moves to the next step. Returns true when the run is won. */
export function advance(run: RunState): boolean {
  run.step++;
  if (run.step >= STEPS) {
    run.world++;
    run.step = 0;
    run.path = [];
    if (run.world >= WORLDS.length) return true;
  }
  return false;
}

export function finalScore(run: RunState, victory: boolean): number {
  return run.score + run.world * 300 + run.coins + (victory ? 1000 : 0);
}

export const bricksFor = (score: number): number => Math.max(1, Math.floor(score / 150));

// ---------- Save data ----------

const RUN_KEY = 'towertopple.run';
const META_KEY = 'towertopple.meta';

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
    return r && Array.isArray(r.map) && typeof r.lives === 'number' ? r : null;
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
  const base: Meta = { bricks: 0, unlocked: [], runs: 0, wins: 0, best: 0, bestHeight: 0, bestWorld: 0 };
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

export const unlockDef = (id: string) => UNLOCKS.find((u) => u.id === id)!;

// ---------- Shared run steps (used by the app and the sim) ----------

/** Applies a finished challenge. Returns rewards when it was won. */
export function applyChallenge(run: RunState, node: MapNode, res: GameResult, livesAfter: number): Rewards | null {
  run.lives = Math.min(run.maxLives, livesAfter);
  run.bestHeight = Math.max(run.bestHeight, res.height);
  if (!res.won) {
    // A failed goal costs 1 more life. The run goes on while lives remain.
    if (run.lives > 0 && res.reason !== 'Out of lives') run.lives--;
    run.coins += 3;
    return null;
  }
  run.cleared++;
  run.score += scoreFor(node, res);
  const rw = rewardsFor(run, node, res);
  run.coins += rw.coins;
  run.lives = Math.min(run.maxLives, run.lives + rw.life);
  if (rw.extra) addCard(run, rw.extra);
  return rw;
}

export function restHeal(run: RunState): number {
  const before = run.lives;
  run.lives = Math.min(run.maxLives, run.lives + 3);
  return run.lives - before;
}

export function buy(run: RunState, item: ShopItem): boolean {
  if (item.sold || run.coins < item.price) return false;
  if (item.kind === 'spell' && run.hand.length >= HAND_MAX) return false;
  if (item.kind === 'life' && run.lives >= run.maxLives) return false;
  run.coins -= item.price;
  item.sold = true;
  if (item.kind === 'spell') run.hand.push(item.id);
  else if (item.kind === 'life') run.lives++;
  else {
    run.maxLives = Math.min(MAX_LIVES, run.maxLives + 1);
    run.lives++;
  }
  return true;
}
