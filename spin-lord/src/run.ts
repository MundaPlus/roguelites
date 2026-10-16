/** Run state, rent, offers, score and save data. No DOM here. */
import { ITEM_LIST, ITEMS, LANDLORDS, RENTS, START_POOL, SYMBOL_LIST, SYMBOLS, WIN_RENTS, type Rarity } from './data';
import { Rng, hash } from './rng';
import { spin, type SpinResult, type SymInst } from './spin';

export type Phase = 'spin' | 'pick' | 'rent' | 'item' | 'won' | 'over';

export interface RunState {
  seed: string;
  level: number;
  pool: SymInst[];
  nextUid: number;
  items: string[];
  coins: number;
  /** Rents paid so far. */
  rent: number;
  spinsLeft: number;
  /** Total spins so far. */
  spin: number;
  removals: number;
  rerolls: number;
  phase: Phase;
  offer: string[];
  itemOffer: string[];
  rerollCount: number;
  firstAfterRent: boolean;
  endless: boolean;
  earned: number;
  bestSpin: number;
  unlocked: string[];
  /** Medals already given to the meta (at the win, before endless mode). */
  medalsGiven: number;
}

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  bestRent: number;
  medals: number;
  unlocked: string[];
  /** Highest landlord level the player may pick. */
  maxLevel: number;
  spins: number;
}

const RUN_KEY = 'spinlord.run';
const META_KEY = 'spinlord.meta';

export function rentAt(rent: number, level: number): { spins: number; due: number } {
  const mult = LANDLORDS[level]?.mult ?? 1;
  if (rent < RENTS.length) {
    const r = RENTS[rent];
    return { spins: r.spins, due: Math.round((r.due * mult) / 5) * 5 };
  }
  const last = RENTS[RENTS.length - 1];
  const k = rent - RENTS.length + 1;
  return { spins: last.spins, due: Math.round((last.due * mult * Math.pow(1.3, k)) / 5) * 5 };
}

export function spinsFor(r: RunState, rent: number): number {
  return rentAt(rent, r.level).spins + (r.items.includes('hourglass') ? 1 : 0);
}

export function newRun(seed: string, level: number, meta: Meta): RunState {
  const r: RunState = {
    seed,
    level,
    pool: START_POOL.map((id, i) => ({ uid: i + 1, id, n: 0 })),
    nextUid: START_POOL.length + 1,
    items: [],
    coins: 1,
    rent: 0,
    spinsLeft: 0,
    spin: 0,
    removals: level >= 2 ? 0 : 1,
    rerolls: level >= 3 ? 0 : 1,
    phase: 'spin',
    offer: [],
    itemOffer: [],
    rerollCount: 0,
    firstAfterRent: false,
    endless: false,
    earned: 0,
    bestSpin: 0,
    unlocked: [...meta.unlocked],
    medalsGiven: 0,
  };
  r.spinsLeft = spinsFor(r, 0);
  return r;
}

export function due(r: RunState): number {
  return rentAt(r.rent, r.level).due;
}

const symAvailable = (r: RunState, id: string): boolean => !SYMBOLS[id].locked || r.unlocked.includes(id);
const itemAvailable = (r: RunState, id: string): boolean => !ITEMS[id].locked || r.unlocked.includes(id);

function rarityWeights(r: RunState): Record<Rarity, number> {
  const k = Math.min(r.rent, 12);
  const lucky = r.items.includes('horseshoe') ? 2 : 1;
  return {
    common: Math.max(30, 72 - k * 4),
    uncommon: 24 + k * 2,
    rare: (3 + k * 1.2) * lucky,
    'very rare': (0.6 + k * 0.4) * lucky,
  };
}

export function makeOffer(r: RunState): string[] {
  const rng = new Rng(hash(r.seed, 'offer', r.spin, r.rerollCount));
  const n = r.items.includes('telescope') ? 4 : 3;
  const w = rarityWeights(r);
  const out: string[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const rar = rng.weighted(Object.entries(w) as [Rarity, number][]);
    const opts = SYMBOL_LIST.filter((s) => s.rarity === rar && symAvailable(r, s.id) && !out.includes(s.id));
    if (opts.length) out.push(rng.pick(opts).id);
  }
  return out;
}

export function makeItemOffer(r: RunState): string[] {
  const rng = new Rng(hash(r.seed, 'item', r.rent));
  const pool = ITEM_LIST.filter((i) => !r.items.includes(i.id) && itemAvailable(r, i.id));
  const weight = (rar: Rarity): number => ({ common: 5, uncommon: 4, rare: 2, 'very rare': 1 })[rar];
  const out: string[] = [];
  while (out.length < 3 && pool.length) {
    const it = rng.weighted(pool.map((i) => [i, weight(i.rarity)] as const));
    out.push(it.id);
    pool.splice(pool.indexOf(it), 1);
  }
  return out;
}

export interface SpinOutcome {
  result: SpinResult;
  /** Extra coins from items after the spin (savings). */
  extra: number;
  /** Removal tokens from the eraser. */
  eraser: boolean;
}

/** Spins once and applies the result to the run. */
export function doSpin(r: RunState): SpinOutcome {
  if (r.phase !== 'spin') throw new Error('not ready to spin');
  r.spin++;
  const rng = new Rng(hash(r.seed, 'spin', r.spin));
  const result = spin(r.pool, { items: r.items, spin: r.spin, firstAfterRent: r.firstAfterRent, nextUid: r.nextUid }, rng);
  r.pool = result.pool;
  r.nextUid = result.nextUid;
  r.coins += result.coins;
  r.earned += result.coins;
  r.bestSpin = Math.max(r.bestSpin, result.coins);
  let extra = 0;
  if (r.items.includes('savings')) extra = Math.min(6, Math.floor(r.coins / 20));
  r.coins += extra;
  r.earned += extra;
  const eraser = r.items.includes('eraser') && r.spin % 4 === 0;
  if (eraser) r.removals++;
  r.firstAfterRent = false;
  r.spinsLeft--;
  r.rerollCount = 0;
  r.offer = makeOffer(r);
  r.phase = 'pick';
  return { result, extra, eraser };
}

function afterPick(r: RunState): void {
  r.offer = [];
  r.phase = r.spinsLeft <= 0 ? 'rent' : 'spin';
}

export function pickSymbol(r: RunState, i: number): void {
  if (r.phase !== 'pick' || !r.offer[i]) return;
  r.pool.push({ uid: r.nextUid++, id: r.offer[i], n: 0 });
  afterPick(r);
}

export function skipPick(r: RunState): void {
  if (r.phase !== 'pick') return;
  afterPick(r);
}

export function reroll(r: RunState): boolean {
  if (r.phase !== 'pick' || r.rerolls <= 0) return false;
  r.rerolls--;
  r.rerollCount++;
  r.offer = makeOffer(r);
  return true;
}

export function removeSymbol(r: RunState, uid: number): boolean {
  if (r.removals <= 0 || (r.phase !== 'spin' && r.phase !== 'pick')) return false;
  const i = r.pool.findIndex((s) => s.uid === uid);
  if (i < 0) return false;
  r.pool.splice(i, 1);
  r.removals--;
  return true;
}

/** Pays the rent. Returns false when the coins do not cover it (the run is lost). */
export function payRent(r: RunState): boolean {
  if (r.phase !== 'rent') return false;
  const d = due(r);
  if (r.coins < d) {
    r.phase = 'over';
    return false;
  }
  r.coins -= d;
  r.rent++;
  r.removals++;
  r.rerolls++;
  r.firstAfterRent = true;
  r.spinsLeft = spinsFor(r, r.rent);
  if (r.rent === WIN_RENTS && !r.endless) {
    r.phase = 'won';
    return true;
  }
  r.itemOffer = makeItemOffer(r);
  r.phase = r.itemOffer.length ? 'item' : 'spin';
  return true;
}

export function pickItem(r: RunState, i: number): void {
  if (r.phase !== 'item') return;
  const id = r.itemOffer[i];
  if (id) r.items.push(id);
  r.itemOffer = [];
  r.phase = 'spin';
}

export function goEndless(r: RunState): void {
  if (r.phase !== 'won') return;
  r.endless = true;
  r.itemOffer = makeItemOffer(r);
  r.phase = r.itemOffer.length ? 'item' : 'spin';
}

export function score(r: RunState): number {
  return r.earned + r.rent * 100 + (r.rent >= WIN_RENTS ? 1000 : 0) + r.level * 500;
}

export function medalsFor(r: RunState): number {
  return r.rent + (r.rent >= WIN_RENTS ? 5 + r.level * 3 : 0);
}

// ---------- Meta unlocks ----------

export const LOCKED: string[] = [...SYMBOL_LIST.filter((s) => s.locked).map((s) => s.id), ...ITEM_LIST.filter((i) => i.locked).map((i) => i.id)];

export function unlockCost(id: string): number {
  const s = SYMBOLS[id];
  if (s) return s.rarity === 'very rare' ? 12 : 8;
  return ITEMS[id].rarity === 'rare' ? 10 : 6;
}

// ---------- Save data ----------

export function defaultMeta(): Meta {
  return { runs: 0, wins: 0, best: 0, bestRent: 0, medals: 0, unlocked: [], maxLevel: 0, spins: 0 };
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return { ...defaultMeta(), ...JSON.parse(raw) };
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
    if (!Array.isArray(r.pool) || typeof r.coins !== 'number' || r.phase === 'over') return null;
    return r;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState | null): void {
  try {
    if (r && r.phase !== 'over') localStorage.setItem(RUN_KEY, JSON.stringify(r));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}
