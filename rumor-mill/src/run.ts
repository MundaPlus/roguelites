/** Run state, rewards, shop, score and save data. */
import { AGENTS, BASE_POOL, START_AGENTS, START_WORDS, TOWNS, UNLOCKS, WORDS, type AgentId } from './data';
import { Rng, hash } from './rng';
import { believers, isWon, makeTown, voters, type Ev, type Town } from './town';

export const MAX_AGENTS = 5;

export type Offer = { kind: 'word'; id: string } | { kind: 'agent'; id: AgentId } | { kind: 'cover' } | { kind: 'maxcover' };
export type ShopItem = Offer & { cost: number; sold: boolean };

export interface TownResult {
  name: string;
  won: boolean;
  believers: number;
  voters: number;
  turn: number;
  maxTurns: number;
  coins: number;
  score: number;
}

export interface RunState {
  seed: string;
  townIdx: number;
  cover: number;
  maxCover: number;
  coins: number;
  words: string[];
  agents: AgentId[];
  score: number;
  won: number;
  town: Town;
  phase: 'town' | 'reward';
  result: TownResult | null;
  offers: Offer[];
  picked: boolean;
  shop: ShopItem[];
}

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  townsWon: number;
  bestTowns: number;
}

const RUN_KEY = 'rumor.run';
const META_KEY = 'rumor.meta';

export const seedNum = (seed: string): number => hash(seed);

export function newRun(seed: string): RunState {
  return {
    seed,
    townIdx: 0,
    cover: 3,
    maxCover: 3,
    coins: 0,
    words: [...START_WORDS],
    agents: [...START_AGENTS],
    score: 0,
    won: 0,
    town: makeTown(0, seedNum(seed), START_AGENTS),
    phase: 'town',
    result: null,
    offers: [],
    picked: false,
    shop: [],
  };
}

export const isFinalTown = (r: RunState): boolean => r.townIdx === TOWNS.length - 1;

/** Apply spread events to the run. Returns true when the run is lost. */
export function applyEvents(r: RunState, events: Ev[]): boolean {
  for (const e of events) if (e.kind === 'expose') r.cover--;
  return r.cover <= 0;
}

export function unlocked(meta: Meta, id: string): boolean {
  const u = UNLOCKS.find((x) => x.id === id);
  return !u || meta.townsWon >= u.need;
}

function pool(r: RunState, meta: Meta): Offer[] {
  const out: Offer[] = [];
  const items = [...BASE_POOL, ...UNLOCKS.filter((u) => meta.townsWon >= u.need)];
  for (const it of items) {
    if (it.kind === 'word' && !r.words.includes(it.id)) out.push({ kind: 'word', id: it.id });
    if (it.kind === 'agent' && r.agents.length < MAX_AGENTS) out.push({ kind: 'agent', id: it.id as AgentId });
  }
  if (r.cover < r.maxCover) out.push({ kind: 'cover' });
  out.push({ kind: 'maxcover' });
  return out;
}

const COST: Record<Offer['kind'], number> = { word: 9, agent: 12, cover: 6, maxcover: 10 };

/** End the town. Returns 'win' / 'lose' when the run is over, else 'reward'. */
export function finishTown(r: RunState, meta: Meta): 'win' | 'lose' | 'reward' {
  const t = r.town;
  const won = isWon(t);
  const spare = Math.max(0, t.maxTurns - t.turn);
  const b = believers(t);
  const coins = won ? 5 + spare : 2;
  const score = won ? 100 + b * 3 + spare * 15 : b * 2;
  r.coins += coins;
  r.score += score;
  r.result = { name: t.name, won, believers: b, voters: voters(t), turn: t.turn, maxTurns: t.maxTurns, coins, score };
  if (won) {
    r.won++;
    meta.townsWon++;
  } else r.cover--;
  if (isFinalTown(r)) return won ? 'win' : 'lose';
  if (r.cover <= 0) return 'lose';
  const rng = new Rng(hash(seedNum(r.seed), 'reward', r.townIdx));
  const p = rng.shuffle(pool(r, meta));
  r.offers = p.slice(0, 3);
  r.shop = rng
    .shuffle(pool(r, meta).filter((o) => !r.offers.some((x) => JSON.stringify(x) === JSON.stringify(o))))
    .slice(0, 3)
    .map((o) => ({ ...o, cost: COST[o.kind], sold: false }));
  r.picked = false;
  r.phase = 'reward';
  return 'reward';
}

function give(r: RunState, o: Offer): void {
  if (o.kind === 'word' && !r.words.includes(o.id)) r.words.push(o.id);
  if (o.kind === 'agent' && r.agents.length < MAX_AGENTS) r.agents.push(o.id);
  if (o.kind === 'cover') r.cover = Math.min(r.maxCover, r.cover + 1);
  if (o.kind === 'maxcover') {
    r.maxCover++;
    r.cover++;
  }
}

export function takeOffer(r: RunState, i: number): boolean {
  if (r.picked || !r.offers[i]) return false;
  give(r, r.offers[i]);
  r.picked = true;
  return true;
}

export function canBuy(r: RunState, i: number): boolean {
  const s = r.shop[i];
  if (!s || s.sold || r.coins < s.cost) return false;
  if (s.kind === 'word' && r.words.includes(s.id)) return false;
  if (s.kind === 'agent' && r.agents.length >= MAX_AGENTS) return false;
  if (s.kind === 'cover' && r.cover >= r.maxCover) return false;
  return true;
}

export function buy(r: RunState, i: number): boolean {
  if (!canBuy(r, i)) return false;
  const s = r.shop[i];
  r.coins -= s.cost;
  s.sold = true;
  give(r, s);
  return true;
}

export function nextTown(r: RunState): void {
  r.townIdx++;
  r.town = makeTown(r.townIdx, seedNum(r.seed), r.agents);
  r.phase = 'town';
  r.result = null;
  r.offers = [];
  r.shop = [];
}

export function finalScore(r: RunState, victory: boolean): number {
  return r.score + (victory ? 300 + r.cover * 50 : 0);
}

export function offerText(o: Offer): { icon: string; name: string; text: string } {
  switch (o.kind) {
    case 'word': {
      const w = WORDS[o.id];
      const slot = w.slot === 'verb' ? 'verb' : w.slot === 'obj' ? 'object' : 'tone word';
      return { icon: w.icon, name: `“${w.text}”`, text: `New ${slot}. ${w.perk ? `${w.perk}: ${w.rule}` : 'No perk.'}` };
    }
    case 'agent':
      return { icon: AGENTS[o.id].icon, name: AGENTS[o.id].name, text: `New agent. ${AGENTS[o.id].rule}` };
    case 'cover':
      return { icon: '❤️', name: 'Lie low', text: 'Get back 1 cover.' };
    case 'maxcover':
      return { icon: '🧥', name: 'Safe house', text: '+1 max cover and +1 cover.' };
  }
}

// ---------- Save data ----------

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    return s ? (JSON.parse(s) as RunState) : null;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState | null): void {
  try {
    if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage blocked */
  }
}

export function loadMeta(): Meta {
  const d: Meta = { runs: 0, wins: 0, best: 0, townsWon: 0, bestTowns: 0 };
  try {
    const s = localStorage.getItem(META_KEY);
    return s ? { ...d, ...(JSON.parse(s) as Partial<Meta>) } : d;
  } catch {
    return d;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage blocked */
  }
}

/** Record a finished run in the meta stats. */
export function recordRun(meta: Meta, r: RunState, victory: boolean): number {
  const score = finalScore(r, victory);
  meta.runs++;
  if (victory) meta.wins++;
  meta.best = Math.max(meta.best, score);
  meta.bestTowns = Math.max(meta.bestTowns, r.won);
  return score;
}
