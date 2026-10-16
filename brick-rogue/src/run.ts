/** Run state: branching map, loadout, rewards, shop, workshop, save data and meta progress. */
import { ACTS, PADDLES, PADDLE_IDS, UPGRADES, UP_IDS } from './data';
import { MAX_LIVES, type Game, type Loadout, type WallKind } from './game';
import { Rng, hash } from './rng';

export type NodeKind = 'wall' | 'elite' | 'shop' | 'rest' | 'treasure' | 'boss';

export const NODE_INFO: Record<NodeKind, { icon: string; name: string; text: string }> = {
  wall: { icon: '🧱', name: 'Wall', text: 'A brick wall. Gold and an upgrade.' },
  elite: { icon: '💀', name: 'Elite wall', text: 'Tougher bricks, more gold, a better upgrade.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Buy upgrades and lives.' },
  rest: { icon: '🔧', name: 'Workshop', text: 'Repair (+1 life) or tune an upgrade.' },
  treasure: { icon: '🎁', name: 'Treasure', text: 'A free upgrade and some gold.' },
  boss: { icon: '👑', name: 'Boss wall', text: 'The guardian of this act.' },
};

export interface MapNode {
  id: number;
  row: number;
  lane: number;
  kind: NodeKind;
  next: number[];
}

/** Rows per act. The last row is the boss. */
export const ROWS = 7;
export const LANES = 4;

/** Build the branching map of one act. The same seed gives the same map. */
export function makeMap(seed: string, act: number): MapNode[] {
  const rng = new Rng(hash(seed, 'map', act));
  const nodes: MapNode[] = [];
  const rows: MapNode[][] = [];
  for (let row = 0; row < ROWS; row++) {
    let lanes: number[];
    if (row === ROWS - 1) lanes = [1.5];
    else {
      const n = row === 0 ? 3 : rng.int(2, 4);
      lanes = rng.shuffle([0, 1, 2, 3]).slice(0, n).sort((a, b) => a - b);
    }
    const list = lanes.map((lane) => {
      let kind: NodeKind;
      if (row === ROWS - 1) kind = 'boss';
      else if (row === 0) kind = 'wall';
      else if (row === ROWS - 2) kind = rng.weighted<NodeKind>([['rest', 3], ['shop', 3], ['wall', 2], ['treasure', 1]]);
      else
        kind = rng.weighted<NodeKind>([
          ['wall', 5],
          ['elite', row >= 2 ? 2 : 0],
          ['shop', row >= 2 ? 1.6 : 0.6],
          ['rest', row >= 2 ? 1 : 0],
          ['treasure', 1],
        ]);
      const node: MapNode = { id: nodes.length, row, lane, kind, next: [] };
      nodes.push(node);
      return node;
    });
    rows.push(list);
  }
  // Every row has a shop or a workshop somewhere after row 2.
  if (!nodes.some((n) => n.kind === 'shop')) {
    const c = rows[3][0];
    c.kind = 'shop';
  }
  // Edges: each node links to the next-row nodes within one lane, at least the nearest one.
  for (let row = 0; row < ROWS - 1; row++) {
    const cur = rows[row];
    const nxt = rows[row + 1];
    for (const n of cur) {
      const near = nxt.filter((m) => Math.abs(m.lane - n.lane) <= 1);
      if (near.length) n.next = near.map((m) => m.id);
      else {
        const best = [...nxt].sort((a, b) => Math.abs(a.lane - n.lane) - Math.abs(b.lane - n.lane))[0];
        n.next = [best.id];
      }
    }
    // Every next-row node needs a way in.
    for (const m of nxt) {
      if (cur.some((n) => n.next.includes(m.id))) continue;
      const best = [...cur].sort((a, b) => Math.abs(a.lane - m.lane) - Math.abs(b.lane - m.lane))[0];
      best.next.push(m.id);
    }
  }
  return nodes;
}

export type RunScreen = 'map' | 'wall' | 'reward' | 'shop' | 'rest' | 'treasure';

export interface Offer {
  id: string;
  cost: number;
  sold: boolean;
}

export interface RewardState {
  kind: WallKind;
  gold: number;
  bonus: number;
  offers: string[];
  picked: boolean;
  life: boolean;
}

export interface RunState {
  v: 1;
  seed: string;
  paddle: string;
  act: number;
  /** Node id where the player stands, -1 at the start of an act. */
  at: number;
  /** Node being played or visited. */
  node: number;
  /** Node ids visited in this act. */
  path: number[];
  screen: RunScreen;
  lives: number;
  gold: number;
  mods: Record<string, number>;
  pool: string[];
  walls: number;
  kills: number;
  livesLost: number;
  reward: RewardState | null;
  shop: { items: Offer[]; lifeCost: number; lifeSold: number } | null;
  treasure: string | null;
}

export interface Meta {
  shards: number;
  unlocked: string[];
  paddle: string;
  runs: number;
  wins: number;
  bestAct: number;
  best: number;
  walls: number;
}

const RUN_KEY = 'brickrogue.run';
const META_KEY = 'brickrogue.meta';

export function newRun(seed: string, meta: Meta): RunState {
  const pd = PADDLES[meta.unlocked.includes(meta.paddle) || PADDLES[meta.paddle]?.unlock === 0 ? meta.paddle : 'classic'] ?? PADDLES.classic;
  return {
    v: 1,
    seed,
    paddle: pd.id,
    act: 0,
    at: -1,
    node: -1,
    path: [],
    screen: 'map',
    lives: pd.lives,
    gold: 0,
    mods: { ...pd.start },
    pool: UP_IDS.filter((id) => UPGRADES[id].unlock === 0 || meta.unlocked.includes(id)),
    walls: 0,
    kills: 0,
    livesLost: 0,
    reward: null,
    shop: null,
    treasure: null,
  };
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

const mapCache = new Map<string, MapNode[]>();
export function actMap(run: RunState): MapNode[] {
  const key = `${run.seed}|${run.act}`;
  let m = mapCache.get(key);
  if (!m) {
    m = makeMap(run.seed, run.act);
    mapCache.set(key, m);
  }
  return m;
}

/** Nodes the player can go to next. */
export function choices(run: RunState): MapNode[] {
  const m = actMap(run);
  if (run.at < 0) return m.filter((n) => n.row === 0);
  return m[run.at].next.map((id) => m[id]);
}

export function loadout(run: RunState): Loadout {
  const pd = PADDLES[run.paddle] ?? PADDLES.classic;
  const mods = run.mods;
  return {
    lives: run.lives,
    paddleW: pd.width + (mods.wings ?? 0) * 10,
    dmg: 1 + (mods.heavy ?? 0),
    speedMul: pd.speedMul,
    gentle: run.walls === 0 ? 1 : run.walls === 1 ? 0.5 : 0,
    mods: { ...mods },
  };
}

export const wallSeed = (run: RunState): number => hash(run.seed, 'wall', run.act, run.node);

export const nodeKind = (run: RunState): NodeKind => actMap(run)[run.node]?.kind ?? 'wall';

/** Move to a map node. Returns its kind. */
export function enterNode(run: RunState, id: number): NodeKind {
  run.node = id;
  run.at = id;
  run.path.push(id);
  const kind = actMap(run)[id].kind;
  if (kind === 'wall' || kind === 'elite' || kind === 'boss') run.screen = 'wall';
  else if (kind === 'shop') {
    run.screen = 'shop';
    run.shop = makeShop(run);
  } else if (kind === 'rest') run.screen = 'rest';
  else {
    run.screen = 'treasure';
    const rng = rngFor(run, 'treasure', run.act, id);
    const opts = upgradeChoices(run, rng, 1);
    run.treasure = opts[0] ?? null;
    if (run.treasure) addUpgrade(run, run.treasure);
    run.gold += 20;
  }
  return kind;
}

// ---------- Upgrades ----------

export const canTake = (run: RunState, id: string): boolean => (run.mods[id] ?? 0) < UPGRADES[id].max;

export function addUpgrade(run: RunState, id: string): void {
  if (!canTake(run, id)) return;
  run.mods[id] = (run.mods[id] ?? 0) + 1;
}

export function upgradeChoices(run: RunState, rng: Rng, n: number): string[] {
  const avail = run.pool.filter((id) => canTake(run, id));
  return rng.shuffle([...avail]).slice(0, n);
}

/** Effect text for the next level of an upgrade. */
export function upText(run: RunState, id: string): string {
  const lvl = run.mods[id] ?? 0;
  const d = UPGRADES[id];
  return d.text[Math.min(lvl, d.max - 1)];
}

export const lvlTag = (lvl: number): string => (lvl > 0 ? ` ${'★'.repeat(lvl)}` : '');

// ---------- Wall results ----------

/** Apply a cleared wall to the run and make the reward screen. */
export function wallWon(run: RunState, g: Game): RewardState {
  run.lives = g.lives;
  run.kills += g.kills;
  run.walls++;
  run.livesLost += g.livesLost;
  const kind = g.kind;
  const rng = rngFor(run, 'reward', run.act, run.node);
  const bonus = kind === 'boss' ? 60 : kind === 'elite' ? 35 : 12 + run.act * 4;
  run.gold += g.gold + bonus;
  const life = false;
  if (life) run.lives = Math.min(MAX_LIVES, run.lives + 1);
  const rw: RewardState = { kind, gold: g.gold, bonus, offers: upgradeChoices(run, rng, kind === 'wall' ? 3 : 4), picked: false, life };
  run.reward = rw;
  run.screen = 'reward';
  return rw;
}

export function wallLost(run: RunState, g: Game): void {
  run.lives = 0;
  run.kills += g.kills;
  run.livesLost += g.livesLost;
  run.gold += g.gold;
}

/** After a reward, shop, workshop or treasure: back to the map, or to the next act after a boss. Returns true when the run is won. */
export function leaveNode(run: RunState): boolean {
  const kind = nodeKind(run);
  run.reward = null;
  run.shop = null;
  run.treasure = null;
  run.screen = 'map';
  if (kind === 'boss') {
    run.act++;
    run.at = -1;
    run.node = -1;
    run.path = [];
    if (run.act >= ACTS.length) return true;
  }
  return false;
}

// ---------- Shop ----------

export function priceOf(run: RunState, id: string): number {
  return UPGRADES[id].cost + (run.mods[id] ?? 0) * 20 + run.act * 10;
}

export function makeShop(run: RunState): { items: Offer[]; lifeCost: number; lifeSold: number } {
  const rng = rngFor(run, 'shop', run.act, run.node);
  const items = upgradeChoices(run, rng, 4).map((id) => ({ id, cost: priceOf(run, id), sold: false }));
  return { items, lifeCost: 90 + run.act * 20, lifeSold: 0 };
}

export function buy(run: RunState, i: number): boolean {
  const s = run.shop;
  if (!s) return false;
  const it = s.items[i];
  if (!it || it.sold || run.gold < it.cost || !canTake(run, it.id)) return false;
  run.gold -= it.cost;
  it.sold = true;
  addUpgrade(run, it.id);
  return true;
}

export const lifePrice = (run: RunState): number => (run.shop ? run.shop.lifeCost + run.shop.lifeSold * 40 : 999);

export function buyLife(run: RunState): boolean {
  const s = run.shop;
  if (!s || run.gold < lifePrice(run) || run.lives >= MAX_LIVES) return false;
  run.gold -= lifePrice(run);
  s.lifeSold++;
  run.lives++;
  return true;
}

// ---------- Score and meta ----------

export const score = (run: RunState, victory: boolean): number => run.walls * 100 + run.kills * 2 + run.gold + run.act * 400 + (victory ? 2500 : 0);

export const shardsFor = (sc: number): number => Math.floor(sc / 60);

export const LOCKED: string[] = [...UP_IDS.filter((id) => UPGRADES[id].unlock > 0), ...PADDLE_IDS.filter((id) => PADDLES[id].unlock > 0)];

export const unlockCost = (id: string): number => UPGRADES[id]?.unlock ?? PADDLES[id]?.unlock ?? 0;

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
    if (run.v !== 1 || !Array.isArray(run.path) || !PADDLES[run.paddle] || Object.keys(run.mods).some((id) => !UPGRADES[id])) return null;
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
  const base: Meta = { shards: 0, unlocked: [], paddle: 'classic', runs: 0, wins: 0, bestAct: 0, best: 0, walls: 0 };
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
