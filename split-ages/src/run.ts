/** Run state, floor flow, rewards, camp shop, score and save data. */
import { BASE_POOL, CAMP_AFTER, FLOORS, ITEMS, SLOTS, UNLOCKS } from './data';
import { BASE_MODS, initState, type FloorDef, type Mods, type St } from './engine';
import { floorKind, genFloor } from './gen';
import { Rng, hash } from './rng';

export interface ShopItem {
  id: string;
  cost: number;
  sold: boolean;
}

export interface RunState {
  v: 1;
  seed: string;
  floor: number;
  hp: number;
  maxHp: number;
  gold: number;
  items: string[];
  unlocked: string[];
  stage: 'floor' | 'reward' | 'camp';
  def: FloorDef | null;
  st: St | null;
  start: St | null;
  rewinds: number;
  offer: string[];
  shop: ShopItem[];
  turns: number;
  kills: number;
  goldEarned: number;
  onPar: number;
  hints: number;
  restarts: number;
  /** Turns used on the floor that is being played (kept across rewinds for honest scoring). */
  floorTurns: number;
}

export interface Meta {
  echoes: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestFloor: number;
  best: number;
  startItem: string;
}

const RUN_KEY = 'ages.run';
const META_KEY = 'ages.meta';

export const START_HP = 10;

export function newRun(seed: string, meta: Meta): RunState {
  const run: RunState = {
    v: 1,
    seed,
    floor: 1,
    hp: START_HP,
    maxHp: START_HP,
    gold: 0,
    items: [],
    unlocked: [...meta.unlocked],
    stage: 'floor',
    def: null,
    st: null,
    start: null,
    rewinds: 0,
    offer: [],
    shop: [],
    turns: 0,
    kills: 0,
    goldEarned: 0,
    onPar: 0,
    hints: 0,
    restarts: 0,
    floorTurns: 0,
  };
  if (meta.startItem && ITEMS[meta.startItem] && meta.unlocked.includes(`start-${meta.startItem}`)) run.items.push(meta.startItem);
  enterFloor(run);
  return run;
}

export function modsFor(run: RunState): Mods {
  const m: Mods = { ...BASE_MODS };
  for (const id of run.items) {
    switch (id) {
      case 'seedbag':
        m.seeds += 2;
        break;
      case 'bronze':
        m.atkP += 1;
        break;
      case 'hide':
        m.shieldP = true;
        break;
      case 'meal':
        m.meal = true;
        break;
      case 'rope':
        m.rope += 1;
        break;
      case 'steel':
        m.atkF += 1;
        break;
      case 'coat':
        m.shieldF = true;
        break;
      case 'waders':
        m.waders = true;
        break;
      case 'scav':
        m.scav = true;
        break;
      case 'hourglass':
        m.rewinds += 1;
        break;
      case 'orchard':
        m.orchard = true;
        break;
      case 'paradox':
        m.paradox = true;
        break;
    }
  }
  return m;
}

export function enterFloor(run: RunState): void {
  const mods = modsFor(run);
  const def = genFloor(hash(run.seed, 'floor', run.floor), { floor: run.floor, hp: run.hp, maxHp: run.maxHp, mods, unlocked: run.unlocked });
  run.def = def;
  run.st = initState(def, run.hp, run.maxHp, mods);
  run.start = run.st;
  run.rewinds = mods.rewinds;
  run.stage = 'floor';
  run.floorTurns = 0;
}

/** Restart the floor from its first turn. Costs 2 HP. */
export function restartFloor(run: RunState): boolean {
  if (!run.start || run.start.hp <= 2) return false;
  run.restarts++;
  run.st = { ...run.start, hp: run.start.hp - 2 };
  run.start = run.st;
  run.rewinds = modsFor(run).rewinds;
  return true;
}

export interface FloorResult {
  heal: number;
  gold: number;
  par: boolean;
}

/** Apply the end of a cleared floor and prepare the item offer. */
export function finishFloor(run: RunState): FloorResult {
  const st = run.st!;
  const def = run.def!;
  const mods = modsFor(run);
  let heal = 0;
  if (mods.orchard) heal += st.grown;
  const elite = def.kind === 'elite';
  const bonusGold = elite ? 8 : 2;
  run.hp = Math.min(run.maxHp, st.hp + heal);
  run.gold += st.gold + bonusGold;
  run.goldEarned += st.gold + bonusGold;
  run.kills += st.kills;
  run.turns += run.floorTurns;
  const par = run.floorTurns <= def.par;
  if (par) run.onPar++;
  run.def = null;
  run.st = null;
  run.start = null;
  run.stage = 'reward';
  run.offer = makeOffer(run, elite ? 4 : 3);
  return { heal, gold: st.gold + bonusGold, par };
}

export function itemPool(run: RunState): string[] {
  const pool = [...BASE_POOL];
  if (run.unlocked.includes('pool-orchard')) pool.push('orchard');
  if (run.unlocked.includes('pool-paradox')) pool.push('paradox');
  return pool.filter((id) => ITEMS[id].instant || !run.items.includes(id));
}

function makeOffer(run: RunState, n: number): string[] {
  const rng = new Rng(hash(run.seed, 'offer', run.floor));
  const pool = rng.shuffle(itemPool(run));
  const out: string[] = [];
  for (const id of pool) {
    if (out.length >= n) break;
    // Instant items show up less often.
    if (ITEMS[id].instant && rng.chance(0.7)) continue;
    out.push(id);
  }
  return out;
}

/** The item that leaves when the age slots are full, or null. */
export function replaces(run: RunState, id: string): string | null {
  const age = ITEMS[id].age;
  if (ITEMS[id].instant || age === 'both') return null;
  const same = run.items.filter((x) => ITEMS[x].age === age);
  return same.length >= SLOTS ? same[0] : null;
}

export function takeItem(run: RunState, id: string): void {
  const it = ITEMS[id];
  if (id === 'heart') {
    run.maxHp += 2;
    run.hp = Math.min(run.maxHp, run.hp + 2);
    return;
  }
  if (id === 'tonic') {
    run.hp = Math.min(run.maxHp, run.hp + 3);
    return;
  }
  if (it.instant) return;
  const old = replaces(run, id);
  if (old) run.items.splice(run.items.indexOf(old), 1);
  run.items.push(id);
}

/** After the reward: the camp or the next floor. Returns 'camp', 'floor' or 'won'. */
export function advance(run: RunState): 'camp' | 'floor' | 'won' {
  if (run.stage === 'reward' && CAMP_AFTER.includes(run.floor)) {
    run.stage = 'camp';
    run.shop = makeShop(run);
    return 'camp';
  }
  if (run.floor >= FLOORS) return 'won';
  run.floor++;
  enterFloor(run);
  return 'floor';
}

function makeShop(run: RunState): ShopItem[] {
  const rng = new Rng(hash(run.seed, 'shop', run.floor));
  const pool = rng.shuffle(itemPool(run).filter((id) => !ITEMS[id].instant));
  return [
    { id: 'heal', cost: 6, sold: false },
    { id: 'maxhp', cost: 8, sold: false },
    ...pool.slice(0, 2).map((id) => ({ id, cost: 8, sold: false })),
  ];
}

export function buy(run: RunState, i: number): boolean {
  const s = run.shop[i];
  if (!s || s.sold || run.gold < s.cost) return false;
  run.gold -= s.cost;
  if (s.id === 'heal') {
    run.hp = Math.min(run.maxHp, run.hp + 3);
    s.cost += 3;
    return true;
  }
  s.sold = true;
  if (s.id === 'maxhp') {
    run.maxHp += 2;
    run.hp += 2;
    return true;
  }
  takeItem(run, s.id);
  return true;
}

export const SHOP_INFO: Record<string, { icon: string; name: string; text: string }> = {
  heal: { icon: '🍲', name: 'Hot Meal', text: 'Heal 3 HP. You can buy it again (+3 gold each time).' },
  maxhp: { icon: '💪', name: 'Training', text: '+2 max HP.' },
};

export function score(run: RunState, victory: boolean): number {
  const cleared = victory ? FLOORS : run.floor - 1;
  return cleared * 100 + run.goldEarned * 2 + run.kills * 5 + run.onPar * 40 - run.hints * 30 + (victory ? 1000 + run.hp * 20 : 0);
}

export const echoesFor = (sc: number): number => Math.max(1, Math.floor(sc / 400));

export const floorLabel = (floor: number): string => {
  const k = floorKind(floor);
  return k === 'boss' ? 'Boss' : k === 'elite' ? 'Elite' : '';
};

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
    if (run.v !== 1 || run.items.some((id) => !ITEMS[id])) return null;
    if (run.stage === 'floor' && (!run.def || !run.st)) return null;
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
  const base: Meta = { echoes: 0, unlocked: [], runs: 0, wins: 0, bestFloor: 0, best: 0, startItem: '' };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    m.unlocked = m.unlocked.filter((id) => UNLOCKS.some((u) => u.id === id));
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
