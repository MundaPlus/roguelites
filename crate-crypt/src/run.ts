/** Run state: floors, rooms, budget, rewards, shop, save data and meta progress. No DOM here. */
import { CHARS, FLOORS, LOCKED_TOOLS, TOOLS, TOOL_IDS, TOOL_UNLOCK_COST, type CharId, type RoomKind, type ToolId } from './data';
import { generate, type GenKind, type GenRoom } from './gen';
import type { RoomState } from './puzzle';
import { Rng, hash } from './rng';

export interface FloorRoom {
  id: number;
  kind: RoomKind;
  seed: number;
  col: number;
  row: number;
  /** The room this one hangs from (-1 for the first room). */
  link: number;
  done: boolean;
  par: number;
}

export type Offer =
  | { kind: 'tool'; tool: ToolId }
  | { kind: 'gold'; n: number }
  | { kind: 'moves'; n: number }
  | { kind: 'key' }
  | { kind: 'heart' };

export interface ShopItem {
  offer: Offer;
  cost: number;
  sold: boolean;
}

export interface RunStats {
  rooms: number;
  moves: number;
  bites: number;
  collapses: number;
  tools: number;
  goldEarned: number;
  leftover: number;
}

export interface RunState {
  v: 1;
  seed: string;
  char: CharId;
  floor: number;
  hearts: number;
  maxHearts: number;
  gold: number;
  keys: number;
  gems: number;
  tools: Partial<Record<ToolId, number>>;
  pool: ToolId[];
  budget: number;
  floorBudget: number;
  rooms: FloorRoom[];
  cur: number;
  live: RoomState | null;
  entry: RoomState | null;
  shop: ShopItem[] | null;
  offers: Offer[] | null;
  stats: RunStats;
  over: null | 'win' | 'loss';
}

export interface Meta {
  runs: number;
  wins: number;
  bestFloor: number;
  best: number;
  bones: number;
  unlocked: string[];
  char: CharId;
  totalRooms: number;
}

const RUN_KEY = 'crate-crypt.run';
const META_KEY = 'crate-crypt.meta';

/** Budget = sum of the par of the main rooms × slack + a small base. */
export function slack(floor: number): number {
  return 1.25 - floor * 0.012;
}

const genCache = new Map<string, GenRoom>();

export function genKind(run: RunState, r: FloorRoom): GenKind {
  if (r.kind === 'stairs') return run.floor === FLOORS - 1 ? 'final' : 'stairs';
  return r.kind === 'treasure' ? 'treasure' : 'puzzle';
}

export function roomGen(run: RunState, r: FloorRoom): GenRoom {
  const key = `${r.seed}|${run.floor}|${r.kind}|${run.pool.join(',')}`;
  let g = genCache.get(key);
  if (!g) {
    g = generate({ floor: run.floor, kind: genKind(run, r), seed: r.seed, tools: run.pool });
    if (genCache.size > 200) genCache.clear();
    genCache.set(key, g);
  }
  return g;
}

export const isPuzzle = (k: RoomKind): boolean => k === 'puzzle' || k === 'stairs' || k === 'treasure';

export function newRun(seed: string, char: CharId, meta: Meta): RunState {
  const pool = TOOL_IDS.filter((t) => !LOCKED_TOOLS.includes(t) || meta.unlocked.includes(t));
  const run: RunState = {
    v: 1,
    seed,
    char,
    floor: 0,
    hearts: char === 'monk' ? 4 : 3,
    maxHearts: char === 'monk' ? 4 : 3,
    gold: 5,
    keys: char === 'thief' ? 2 : 0,
    gems: 0,
    tools: char === 'digger' ? { glove: 1 } : char === 'monk' ? { hourglass: 2 } : {},
    pool,
    budget: 0,
    floorBudget: 0,
    rooms: [],
    cur: -1,
    live: null,
    entry: null,
    shop: null,
    offers: null,
    stats: { rooms: 0, moves: 0, bites: 0, collapses: 0, tools: 0, goldEarned: 0, leftover: 0 },
    over: null,
  };
  startFloor(run);
  return run;
}

/** Build the floor map and its budget. Generates the main rooms to know their par. */
export function startFloor(run: RunState): void {
  const f = run.floor;
  const rng = new Rng(hash(run.seed, 'floor', f));
  const n = 3 + Math.floor(f / 3);
  const rooms: FloorRoom[] = [];
  for (let i = 0; i < n; i++) {
    rooms.push({ id: i, kind: i === n - 1 ? 'stairs' : 'puzzle', seed: hash(run.seed, f, i), col: i, row: 1, link: i - 1, done: false, par: 0 });
  }
  const sides: RoomKind[] = ['shop', 'treasure'];
  if (rng.chance(0.6)) sides.push('vault');
  if (f % 2 === 1 || rng.chance(0.3)) sides.push('shrine');
  if (f >= 4 && rng.chance(0.5)) sides.push('treasure');
  const slots: [number, number][] = [];
  for (let c = 0; c < n; c++) for (const row of [0, 2]) slots.push([c, row]);
  rng.shuffle(slots);
  sides.forEach((kind, k) => {
    const [col, row] = slots[k];
    const id = rooms.length;
    rooms.push({ id, kind, seed: hash(run.seed, f, 'side', k), col, row, link: col, done: false, par: 0 });
  });
  run.rooms = rooms;
  for (const r of rooms) if (isPuzzle(r.kind)) r.par = roomGen(run, r).par;
  const main = rooms.filter((r) => r.row === 1).reduce((a, r) => a + r.par, 0);
  let budget = Math.round(main * slack(f)) + 15;
  if (run.char === 'brute') budget = Math.round(budget * 0.9);
  run.floorBudget = budget;
  run.budget = budget;
  run.cur = -1;
  run.live = null;
  run.entry = null;
  run.shop = null;
  run.offers = null;
}

export function isOpen(run: RunState, r: FloorRoom): boolean {
  if (r.done) return false;
  if (r.link < 0) return true;
  return run.rooms[r.link].done;
}

export function stairsDone(run: RunState): boolean {
  return run.rooms.some((r) => r.kind === 'stairs' && r.done);
}

/** The room state the player starts a puzzle room with. */
export function enterPuzzle(run: RunState, r: FloorRoom): RoomState {
  const g = roomGen(run, r);
  const s: RoomState = { ...g.start, budget: run.budget, tools: { ...run.tools }, fx: [] };
  run.cur = r.id;
  run.entry = s;
  run.live = s;
  return s;
}

export const moveOpts = (run: RunState) => ({ strong: run.char === 'brute', coinMult: run.char === 'thief' ? 2 : 1 });

/** Out of moves: lose a heart and get more moves. Returns false when the run is lost. */
export function collapse(run: RunState, s: RoomState): RoomState | null {
  run.hearts--;
  run.stats.collapses++;
  if (run.hearts <= 0) return null;
  const add = Math.max(15, Math.round(run.floorBudget * 0.15));
  if (run.entry) run.entry = { ...run.entry, budget: run.entry.budget + add };
  return { ...s, budget: s.budget + add, fx: [{ kind: 'tool', pos: s.p, text: `+${add} moves` }] };
}

/** Leave a solved room: take its loot, mark it done and roll the reward. */
export function finishRoom(run: RunState, s: RoomState): Offer[] {
  const r = run.rooms[run.cur];
  run.budget = s.budget;
  const used = Object.keys(run.tools).reduce((a, k) => a + Math.max(0, (run.tools[k as ToolId] ?? 0) - (s.tools[k as ToolId] ?? 0)), 0);
  run.stats.tools += used;
  run.tools = { ...s.tools };
  run.gold += s.gold;
  run.stats.goldEarned += s.gold;
  run.keys += s.keys;
  run.gems += s.gems;
  run.stats.moves += s.moves;
  run.stats.rooms++;
  r.done = true;
  run.live = null;
  run.entry = null;
  const rng = new Rng(hash(run.seed, 'reward', run.floor, r.id));
  const f = run.floor;
  const offers: Offer[] = [
    { kind: 'tool', tool: rng.pick(run.pool) },
    rng.chance(0.5) ? { kind: 'gold', n: 6 + f * 2 } : { kind: 'moves', n: 5 + Math.floor(f / 2) },
    rng.chance(0.3) ? { kind: 'key' } : rng.chance(0.5) ? { kind: 'moves', n: 5 + Math.floor(f / 2) } : { kind: 'gold', n: 6 + f * 2 },
  ];
  if (r.kind === 'treasure') {
    offers[0] = { kind: 'tool', tool: rng.pick(run.pool) };
    offers[1] = { kind: 'gold', n: 14 + f * 3 };
    offers[2] = run.hearts < run.maxHearts && rng.chance(0.5) ? { kind: 'heart' } : { kind: 'tool', tool: rng.pick(run.pool) };
  }
  run.offers = offers;
  return offers;
}

export function applyOffer(run: RunState, o: Offer): void {
  switch (o.kind) {
    case 'tool':
      run.tools[o.tool] = (run.tools[o.tool] ?? 0) + 1;
      break;
    case 'gold':
      run.gold += o.n;
      run.stats.goldEarned += o.n;
      break;
    case 'moves':
      run.budget += o.n;
      break;
    case 'key':
      run.keys++;
      break;
    case 'heart':
      run.hearts = Math.min(run.maxHearts, run.hearts + 1);
      break;
  }
}

export function offerText(o: Offer): { icon: string; name: string; text: string } {
  switch (o.kind) {
    case 'tool':
      return { icon: TOOLS[o.tool].icon, name: TOOLS[o.tool].name, text: TOOLS[o.tool].text };
    case 'gold':
      return { icon: '🪙', name: `${o.n} gold`, text: 'Spend it in shops.' };
    case 'moves':
      return { icon: '🕯️', name: `+${o.n} moves`, text: 'Added to this floor’s budget.' };
    case 'key':
      return { icon: '🗝️', name: 'Key', text: 'Opens a vault.' };
    case 'heart':
      return { icon: '❤️', name: 'Heart', text: 'Heal one heart.' };
  }
}

export function makeShop(run: RunState, r: FloorRoom): ShopItem[] {
  const rng = new Rng(hash(run.seed, 'shop', run.floor, r.id));
  const pool = rng.shuffle([...run.pool]);
  const items: ShopItem[] = pool.slice(0, 3).map((t) => ({ offer: { kind: 'tool', tool: t }, cost: TOOLS[t].cost + run.floor, sold: false }));
  items.push({ offer: { kind: 'moves', n: 12 }, cost: 10 + run.floor, sold: false });
  items.push({ offer: { kind: 'key' }, cost: 14, sold: false });
  items.push({ offer: { kind: 'heart' }, cost: 30 + run.floor * 3, sold: false });
  return items;
}

export function buy(run: RunState, i: number): boolean {
  const it = run.shop?.[i];
  if (!it || it.sold || run.gold < it.cost) return false;
  if (it.offer.kind === 'heart' && run.hearts >= run.maxHearts) return false;
  run.gold -= it.cost;
  it.sold = true;
  applyOffer(run, it.offer);
  return true;
}

/** Vault loot. Uses a key. */
export function openVault(run: RunState, r: FloorRoom): Offer[] | null {
  if (run.keys <= 0) return null;
  run.keys--;
  const rng = new Rng(hash(run.seed, 'vault', run.floor, r.id));
  const loot: Offer[] = [{ kind: 'tool', tool: rng.pick(run.pool) }, { kind: 'gold', n: 10 + run.floor * 2 }, { kind: 'tool', tool: rng.pick(run.pool) }];
  for (const o of loot) applyOffer(run, o);
  run.gems++;
  r.done = true;
  return loot;
}

export function shrine(run: RunState, r: FloorRoom, heal: boolean): void {
  if (heal) run.hearts = Math.min(run.maxHearts, run.hearts + 1);
  else run.budget += 15 + run.floor;
  r.done = true;
}

/** Go down. Left-over moves turn into gold. Returns true when the run is won. */
export function descend(run: RunState): boolean {
  const left = run.budget;
  run.stats.leftover += left;
  const g = Math.floor(left / 4);
  run.gold += g;
  run.stats.goldEarned += g;
  run.floor++;
  if (run.floor >= FLOORS) {
    run.over = 'win';
    return true;
  }
  startFloor(run);
  return false;
}

export function score(run: RunState): number {
  return run.floor * 100 + run.stats.goldEarned + run.gems * 25 + run.stats.leftover + (run.over === 'win' ? 500 + run.hearts * 50 : 0);
}

export const bonesFor = (sc: number): number => Math.floor(sc / 50);

export function saveRun(run: RunState | null): void {
  try {
    if (!run || run.over) localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || !CHARS[run.char] || !Array.isArray(run.rooms)) return null;
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
  const base: Meta = { runs: 0, wins: 0, bestFloor: 0, best: 0, bones: 0, unlocked: ['digger'], char: 'digger', totalRooms: 0 };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    if (!CHARS[m.char] || !m.unlocked.includes(m.char)) m.char = 'digger';
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

export function unlockCost(id: string): number {
  if (id in CHARS) return CHARS[id as CharId].cost;
  return TOOL_UNLOCK_COST[id as ToolId] ?? 0;
}

/** Record the end of a run in the meta save. Returns the bones earned. */
export function recordEnd(meta: Meta, run: RunState): { score: number; bones: number } {
  const sc = score(run);
  const bones = bonesFor(sc);
  meta.runs++;
  if (run.over === 'win') meta.wins++;
  meta.bestFloor = Math.max(meta.bestFloor, run.floor + (run.over === 'win' ? 0 : 1));
  meta.best = Math.max(meta.best, sc);
  meta.bones += bones;
  meta.totalRooms += run.stats.rooms;
  return { score: sc, bones };
}
