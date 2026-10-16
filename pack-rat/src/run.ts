/** Run state, shop, economy, ghost opponents and save data. All functions are pure or mutate the run they get. */
import { simulate, type BattleResult, type Fighter } from './battle';
import { CLASSES, CLASS_IDS, ITEMS, ITEM_IDS, sellPrice, type Cls, type ItemDef } from './data';
import { bestBagSpot, bestItemSpot, buildStats, canPlaceBag, canPlaceItem, carried, cellsOf, dropLoose, isBag, randomItemSpot, shape, type Board, type Placed } from './grid';
import { Rng, hash } from './rng';

export const RUN_KEY = 'packrat.run';
export const META_KEY = 'packrat.meta';
export const LIVES = 5;
export const GOAL = 10;
export const SHOP_SIZE = 5;
export const STASH_MAX = 10;
export const REROLL_COST = 1;

export const income = (round: number): number => (round <= 1 ? 10 : 7 + Math.min(round, 10));
export const baseHp = (round: number): number => 30 + 6 * round;
/** Gold value of a ghost build in a round. */
/** Early ghosts are weak so a new run starts with a fair chance. */
export const EARLY_K = [0, 0.5, 0.75];
export const ghostK = (round: number): number => EARLY_K[round - 1] ?? 0.9 + 0.11 * (round - 1);
export const ghostBudget = (round: number): number => {
  let g = 0;
  for (let r = 1; r <= round; r++) g += income(r);
  return Math.round(g * ghostK(round));
};

export interface ShopSlot {
  id: string;
  locked: boolean;
  sold: boolean;
}

export interface Stashed {
  uid: number;
  id: string;
}

export interface RunState {
  v: 1;
  seed: string;
  cls: Cls;
  round: number;
  lives: number;
  trophies: number;
  gold: number;
  board: Board;
  stash: Stashed[];
  shop: ShopSlot[];
  rerolls: number;
  uid: number;
  history: ('W' | 'L')[];
  unlocked: string[];
}

export interface Meta {
  renown: number;
  unlocked: string[];
  runs: number;
  wins: number;
  best: number;
  bestTrophies: number;
  speed: number;
  muted: boolean;
}

export const LOCKED_ITEMS = ITEM_IDS.filter((id) => ITEMS[id].locked);

export function isUnlocked(id: string, unlocked: string[]): boolean {
  const lk = ITEMS[id]?.locked ?? CLASSES[id as Cls]?.locked;
  return !lk || unlocked.includes(id);
}

// ---------- Shop ----------

function rarityWeights(round: number): number[] {
  const t = Math.min(1, (round - 1) / 9);
  return [70 - 45 * t, 25 + 15 * t, 5 + 20 * t, 10 * t];
}

export function pool(cls: Cls, unlocked: string[] | null): ItemDef[] {
  return ITEM_IDS.map((id) => ITEMS[id]).filter((d) => !d.noShop && (d.cls === null || d.cls === cls) && (unlocked === null || isUnlocked(d.id, unlocked)));
}

export function rollItem(rng: Rng, round: number, list: ItemDef[], bagChance: number): string {
  const wantBag = rng.chance(bagChance);
  let cands = list.filter((d) => isBag(d.id) === wantBag);
  const rar = rng.weighted(rarityWeights(round).map((w, i) => [i, w] as const));
  const atR = cands.filter((d) => d.rarity === rar);
  if (atR.length) cands = atR;
  return rng.pick(cands).id;
}

export function fillShop(run: RunState): void {
  const rng = new Rng(hash(run.seed, 'shop', run.round, run.rerolls));
  const list = pool(run.cls, run.unlocked);
  const bagChance = run.round <= 3 ? 0.3 : 0.18;
  const next: ShopSlot[] = [];
  for (let i = 0; i < SHOP_SIZE; i++) {
    const old = run.shop[i];
    if (old && old.locked && !old.sold) next.push(old);
    else next.push({ id: rollItem(rng, run.round, list, bagChance), locked: false, sold: false });
  }
  run.shop = next;
}

// ---------- New run ----------

export function starterBoard(cls: Cls, uid: () => number): Board {
  const b: Board = { bags: [{ uid: uid(), id: 'oldpack', x: 3, y: 2, rot: 0 }], items: [] };
  for (const id of CLASSES[cls].start) {
    const s = bestItemSpot(b, id);
    if (s) b.items.push({ uid: uid(), id, x: s.x, y: s.y, rot: s.rot });
  }
  return b;
}

export function newRun(seed: string, cls: Cls, meta: Meta): RunState {
  const run: RunState = {
    v: 1,
    seed,
    cls,
    round: 1,
    lives: LIVES,
    trophies: 0,
    gold: income(1),
    board: { bags: [], items: [] },
    stash: [],
    shop: [],
    rerolls: 0,
    uid: 1,
    history: [],
    unlocked: [...meta.unlocked],
  };
  run.board = starterBoard(cls, () => run.uid++);
  fillShop(run);
  return run;
}

// ---------- Shop actions ----------

export type PlaceMode = 'best' | 'random' | 'stash';

/** Buys a shop slot. Places it with the packer if it fits, else puts it in the stash. */
export function buy(run: RunState, slot: number, mode: PlaceMode = 'best', rng?: Rng): Placed | Stashed | null {
  const s = run.shop[slot];
  if (!s || s.sold) return null;
  const d = ITEMS[s.id];
  if (run.gold < d.price) return null;
  const spot = mode === 'stash' ? null : isBag(d.id) ? bestBagSpot(run.board, d.id, rng) : mode === 'random' && rng ? randomItemSpot(run.board, d.id, rng) : bestItemSpot(run.board, d.id);
  if (!spot && run.stash.length >= STASH_MAX) return null;
  run.gold -= d.price;
  s.sold = true;
  s.locked = false;
  const uid = run.uid++;
  if (spot) {
    const p: Placed = { uid, id: d.id, x: spot.x, y: spot.y, rot: spot.rot };
    (isBag(d.id) ? run.board.bags : run.board.items).push(p);
    return p;
  }
  const st = { uid, id: d.id };
  run.stash.push(st);
  return st;
}

export function reroll(run: RunState): boolean {
  if (run.gold < REROLL_COST) return false;
  run.gold -= REROLL_COST;
  run.rerolls++;
  fillShop(run);
  return true;
}

/** Removes an item or bag from the board or stash. Items on a removed bag go to the stash. */
export function takeOut(run: RunState, uid: number): string | null {
  const si = run.stash.findIndex((s) => s.uid === uid);
  if (si >= 0) return run.stash.splice(si, 1)[0].id;
  const ii = run.board.items.findIndex((p) => p.uid === uid);
  if (ii >= 0) return run.board.items.splice(ii, 1)[0].id;
  const bi = run.board.bags.findIndex((p) => p.uid === uid);
  if (bi >= 0) {
    const id = run.board.bags.splice(bi, 1)[0].id;
    for (const p of dropLoose(run.board)) run.stash.push({ uid: p.uid, id: p.id });
    return id;
  }
  return null;
}

export function sell(run: RunState, uid: number): number {
  if (run.board.bags.length === 1 && run.board.bags[0].uid === uid) return 0;
  const id = takeOut(run, uid);
  if (!id) return 0;
  const g = sellPrice(ITEMS[id]);
  run.gold += g;
  return g;
}

export function toStash(run: RunState, uid: number): boolean {
  const it = run.board.items.find((p) => p.uid === uid);
  if (!it || run.stash.length >= STASH_MAX) return false;
  takeOut(run, uid);
  run.stash.push({ uid, id: it.id });
  return true;
}

/** Moves (or places from the stash) an item or bag. Bags carry the items that sit fully on them. */
export function move(run: RunState, uid: number, x: number, y: number, rot: number): boolean {
  const b = run.board;
  const st = run.stash.find((s) => s.uid === uid);
  const id = st?.id ?? b.items.find((p) => p.uid === uid)?.id ?? b.bags.find((p) => p.uid === uid)?.id;
  if (!id) return false;
  rot &= 3;
  if (isBag(id)) {
    const old = b.bags.find((p) => p.uid === uid);
    const test: Board = { bags: b.bags.filter((p) => p.uid !== uid).map((p) => ({ ...p })), items: b.items.map((p) => ({ ...p })) };
    if (!canPlaceBag(test, id, rot, x, y)) return false;
    const nb: Placed = { uid, id, x, y, rot };
    if (old) {
      // Cell i of the old bag maps to cell i of the new bag (shape cells keep their order under rotation).
      const from = cellsOf(old);
      const to = cellsOf(nb);
      const k = (rot - old.rot) & 3;
      const ride = new Set(carried(b, uid).map((p) => p.uid));
      for (const it of test.items) {
        if (!ride.has(it.uid)) continue;
        const mapped = cellsOf(it).map(([cx, cy]) => to[from.findIndex(([fx, fy]) => fx === cx && fy === cy)]);
        it.rot = (it.rot + k) & 3;
        it.x = Math.min(...mapped.map((c) => c[0]));
        it.y = Math.min(...mapped.map((c) => c[1]));
      }
    }
    test.bags.push(nb);
    const loose = dropLoose(test);
    run.board = test;
    run.stash = run.stash.filter((s) => s.uid !== uid);
    for (const p of loose) run.stash.push({ uid: p.uid, id: p.id });
    return true;
  }
  const rest: Board = { bags: b.bags, items: b.items.filter((p) => p.uid !== uid) };
  if (!canPlaceItem(rest, id, rot, x, y)) return false;
  run.board = { bags: b.bags, items: [...rest.items, { uid, id, x, y, rot }] };
  run.stash = run.stash.filter((s) => s.uid !== uid);
  return true;
}

/** Rotates in place. Skips rotations that look the same, and nudges the item by one cell if needed. */
export function rotateInPlace(run: RunState, uid: number): boolean {
  const p = run.board.items.find((q) => q.uid === uid) ?? run.board.bags.find((q) => q.uid === uid);
  if (!p) return false;
  const key = (rot: number): string => {
    const s = shape(p.id, rot);
    return JSON.stringify([s.cells.map(String).sort(), s.stars.map(String).sort()]);
  };
  const cur = key(p.rot);
  const offs = [
    [0, 0],
    [-1, 0],
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, -1],
  ];
  for (let k = 1; k < 4; k++) {
    const rot = (p.rot + k) & 3;
    if (key(rot) === cur) continue;
    for (const [dx, dy] of offs) if (move(run, uid, p.x + dx, p.y + dy, rot)) return true;
  }
  return false;
}

// ---------- Ghosts ----------

const NAMES = ['Squeak', 'Whiskers', 'Nibbles', 'Patch', 'Scurry', 'Bramble', 'Cheddar', 'Tansy', 'Rook', 'Pip', 'Sable', 'Thimble', 'Moss', 'Gnaw', 'Hazel', 'Pockets'];
const TITLES = ['Bold', 'Quick', 'Greedy', 'Sly', 'Grim', 'Lucky', 'Hoarder', 'Tinkerer', 'Brave', 'Sneaky'];
const ICONS = ['🐭', '🐀', '🦝', '🦔', '🐿️', '🦫', '🐹'];

export function makeGhost(seed: string, round: number, boss: boolean): Fighter {
  const rng = new Rng(hash(seed, 'ghost', round, boss ? 1 : 0));
  const cls = rng.pick(CLASS_IDS);
  let budget = Math.round(ghostBudget(round) * (boss ? 1.5 : 1));
  let uid = 1;
  const board = starterBoard(cls, () => uid++);
  const list = pool(cls, null);
  const items = list.filter((d) => !isBag(d.id));
  const bags = list.filter((d) => isBag(d.id));
  for (let tries = 0; tries < 140 && budget >= 2; tries++) {
    const id = rollItem(rng, round, items, 0);
    const d = ITEMS[id];
    if (d.price > budget || d.start?.gold) continue;
    const spot = bestItemSpot(board, id, rng);
    if (spot) {
      board.items.push({ uid: uid++, id, x: spot.x, y: spot.y, rot: spot.rot });
      budget -= d.price;
      continue;
    }
    const bagD = rng.pick(bags);
    if (bagD.price > budget - 2) continue;
    const bs = bestBagSpot(board, bagD.id, rng);
    if (!bs) break;
    board.bags.push({ uid: uid++, id: bagD.id, x: bs.x, y: bs.y, rot: bs.rot });
    budget -= bagD.price;
  }
  const name = boss ? 'The Rat King' : `${rng.pick(NAMES)} the ${rng.pick(TITLES)}`;
  return { name, icon: boss ? '👑' : rng.pick(ICONS), cls, board, hp: baseHp(round) + (boss ? 30 : 0) };
}

export function heroFighter(run: RunState): Fighter {
  return { name: 'You', icon: '🐀', cls: run.cls, board: run.board, hp: baseHp(run.round) };
}

export const isBossRound = (run: RunState): boolean => run.trophies === GOAL - 1;
export const fightSeed = (run: RunState): number => hash(run.seed, 'fight', run.round);

export interface FightOut {
  result: BattleResult;
  foe: Fighter;
  round: number;
  boss: boolean;
  gold: number;
}

/** Plays the round's fight and moves the run to the next round. */
export function fight(run: RunState, record = true): FightOut {
  const boss = isBossRound(run);
  const foe = makeGhost(run.seed, run.round, boss);
  const result = simulate(heroFighter(run), foe, fightSeed(run), record);
  const round = run.round;
  if (result.win) run.trophies++;
  else run.lives--;
  run.history.push(result.win ? 'W' : 'L');
  run.round++;
  const gold = income(run.round) + buildStats(run.board).start.gold + (result.win ? 0 : 2);
  run.gold += gold;
  run.rerolls = 0;
  fillShop(run);
  return { result, foe, round, boss, gold };
}

export const runOver = (run: RunState): 'win' | 'loss' | null => (run.trophies >= GOAL ? 'win' : run.lives <= 0 ? 'loss' : null);

export const score = (run: RunState): number => run.trophies * 100 + (run.trophies >= GOAL ? 500 + run.lives * 60 : 0);
export const renownFor = (run: RunState): number => run.trophies + (run.trophies >= GOAL ? 5 : 0);

// ---------- Save data ----------

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
    const ids = [...run.board.bags, ...run.board.items, ...run.stash, ...run.shop].map((p) => p.id);
    if (run.v !== 1 || ids.some((id) => !ITEMS[id]) || !CLASSES[run.cls]) return null;
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
  const base: Meta = { renown: 0, unlocked: [], runs: 0, wins: 0, best: 0, bestTrophies: 0, speed: 2, muted: false };
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
