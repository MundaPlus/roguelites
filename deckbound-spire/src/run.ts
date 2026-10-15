import { CARDS, cardPool } from './cards';
import { generateMap, type MapNode } from './map';
import { RELICS, relicsOf, type RelicInst, type RelicRarity } from './relics';
import { Rng, hash, randomSeedText } from './rng';
import type { CardInst } from './types';

export interface RunState {
  seedText: string;
  seed: number;
  /** 1 to 3. */
  act: number;
  /** Rooms entered in total, over all acts. */
  floor: number;
  hp: number;
  maxHp: number;
  gold: number;
  deck: CardInst[];
  relics: RelicInst[];
  potions: (string | null)[];
  nextUid: number;
  map: MapNode[];
  /** Current node id. null at the start of an act. "boss" in the boss room. */
  pos: string | null;
  /** Node ids visited in this act, in order. */
  path: string[];
  /** Node id being played. Used to re-enter it after a page reload. */
  pending: string | null;
  removeCost: number;
  seenEvents: string[];
  fightsThisAct: number;
  lastElite: string;
  stats: { kills: number; elites: number; bosses: number };
  /** The opening blessing is done. */
  blessed: boolean;
}

export type RewardKind = 'monster' | 'elite' | 'boss';

export function newRun(seedText = randomSeedText()): RunState {
  seedText = seedText.trim().toUpperCase() || randomSeedText();
  const run: RunState = {
    seedText,
    seed: hash(seedText),
    act: 1,
    floor: 0,
    hp: 80,
    maxHp: 80,
    gold: 99,
    deck: [],
    relics: [],
    potions: [null, null, null],
    nextUid: 1,
    map: [],
    pos: null,
    path: [],
    pending: null,
    removeCost: 75,
    seenEvents: [],
    fightsThisAct: 0,
    lastElite: '',
    stats: { kills: 0, elites: 0, bosses: 0 },
    blessed: false,
  };
  for (let i = 0; i < 5; i++) addCard(run, 'strike');
  for (let i = 0; i < 4; i++) addCard(run, 'defend');
  addCard(run, 'bash');
  addRelic(run, 'burningBlood');
  startAct(run, 1);
  return run;
}

export function startAct(run: RunState, act: number): void {
  run.act = act;
  run.pos = null;
  run.path = [];
  run.fightsThisAct = 0;
  run.lastElite = '';
  run.map = generateMap(new Rng(hash(run.seed, act, 'map')));
}

/** A fresh RNG for one purpose at the current floor. Re-entering a room gives the same result. */
export function rngFor(run: RunState, tag: string): Rng {
  return new Rng(hash(run.seed, run.act, run.floor, tag));
}

export function addCard(run: RunState, id: string, up = false): CardInst {
  const inst = { uid: run.nextUid++, id, up };
  run.deck.push(inst);
  return inst;
}

export function removeCard(run: RunState, uid: number): void {
  run.deck = run.deck.filter((c) => c.uid !== uid);
}

export function upgradeCard(run: RunState, uid: number): void {
  const c = run.deck.find((x) => x.uid === uid);
  if (c && CARDS[c.id].up) c.up = true;
}

export const hasRelic = (run: RunState, id: string): boolean => run.relics.some((r) => r.id === id);

export function addRelic(run: RunState, id: string): void {
  if (hasRelic(run, id)) return;
  run.relics.push({ id, counter: 0 });
  RELICS[id].onPickup?.(run);
}

export function obtainPotion(run: RunState, id: string): boolean {
  if (hasRelic(run, 'sozu')) return false;
  const slot = run.potions.indexOf(null);
  if (slot < 0) return false;
  run.potions[slot] = id;
  return true;
}

export function rollRelicRarity(rng: Rng): RelicRarity {
  return rng.weighted([['common', 50], ['uncommon', 33], ['rare', 17]] as const);
}

/** A random relic the player does not own. Falls back to other rarities when one runs out. */
export function randomRelic(run: RunState, rng: Rng, rarity: RelicRarity): string | null {
  const order: RelicRarity[] = rarity === 'boss' ? ['boss'] : [rarity, 'common', 'uncommon', 'rare'];
  for (const r of order) {
    const pool = relicsOf(r).filter((id) => !hasRelic(run, id));
    if (pool.length) return rng.pick(pool);
  }
  return null;
}

export function cardChoices(rng: Rng, kind: RewardKind, n = 3): string[] {
  const out: string[] = [];
  while (out.length < n) {
    const rarity =
      kind === 'boss' ? 'rare' : rng.weighted(kind === 'elite' ? ([['common', 50], ['uncommon', 40], ['rare', 10]] as const) : ([['common', 60], ['uncommon', 37], ['rare', 3]] as const));
    const id = rng.pick(cardPool(rarity));
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

export function cardPrice(rng: Rng, id: string): number {
  const base = { starter: 50, common: 50, uncommon: 75, rare: 150, special: 50 }[CARDS[id].rarity];
  return Math.round(base * (0.9 + rng.next() * 0.2));
}

export function relicPrice(rng: Rng, id: string): number {
  const base = { starter: 150, common: 150, uncommon: 250, rare: 300, boss: 300 }[RELICS[id].rarity];
  return Math.round(base * (0.95 + rng.next() * 0.1));
}

export function score(run: RunState, victory: boolean): number {
  return run.floor * 5 + run.stats.kills * 2 + run.stats.elites * 25 + run.stats.bosses * 100 + (victory ? 250 : 0);
}

// ---------------------------------------------------------------- storage

const RUN_KEY = 'deckbound-run-v1';
const META_KEY = 'deckbound-meta-v1';

export interface Meta {
  runs: number;
  wins: number;
  bestFloor: number;
  bestScore: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked. The game still works, without saves.
  }
}

export const loadRun = (): RunState | null => read<RunState>(RUN_KEY);
export const saveRun = (run: RunState): void => write(RUN_KEY, run);
export const clearRun = (): void => write(RUN_KEY, null);
export const loadMeta = (): Meta => ({ runs: 0, wins: 0, bestFloor: 0, bestScore: 0, ...read<Meta>(META_KEY) });
export const saveMeta = (m: Meta): void => write(META_KEY, m);
