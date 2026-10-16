/** Run state, player actions, rewards, score and save data. Pure logic, no DOM. */
import {
  CHEST,
  HIDDEN,
  MON,
  OPEN,
  SEEN,
  generate,
  isAliveMon,
  nbrs,
  newBoard,
  openFlood,
  type Board,
} from './board';
import {
  BASE_SLOTS,
  BOONS,
  BOON_IDS,
  BOSSES,
  FLOORS,
  HEROES,
  HP_PER_LEVEL,
  ITEMS,
  ITEM_IDS,
  MONSTERS,
  START_HP,
  TILES_PER_XP,
  TUNE,
  xpNeed,
  type BoonId,
  type HeroId,
  type ItemId,
} from './data';
import { Rng, hash } from './rng';

export type Phase = 'floor' | 'reward' | 'over';

export interface ShopOffer {
  kind: 'item' | 'key' | 'maxhp';
  item?: ItemId;
  price: number;
  sold: boolean;
}

export interface RunStats {
  kills: number;
  tiles: number;
  chests: number;
  gold: number;
  bosses: number;
  levels: number;
}

export interface RunState {
  seed: string;
  daily: string | null;
  hero: HeroId;
  floor: number;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  /** Opened tiles toward the next tile XP. */
  tileBank: number;
  gold: number;
  keys: number;
  items: ItemId[];
  boons: BoonId[];
  ward: number;
  phoenixUsed: boolean;
  board: Board;
  phase: Phase;
  boonOffer: BoonId[];
  boonPicked: boolean;
  shop: ShopOffer[];
  stats: RunStats;
  over: null | 'win' | 'dead';
  killedBy: string;
}

/** Visual and sound events for the UI. */
export interface Fx {
  t: 'open' | 'hit' | 'kill' | 'xp' | 'gold' | 'key' | 'item' | 'heal' | 'level' | 'deny' | 'boss' | 'chest' | 'scout' | 'bomb' | 'dead' | 'win' | 'stairs' | 'phoenix' | 'ward';
  i?: number;
  n?: number;
  text?: string;
}

export type Action =
  | { t: 'tile'; i: number }
  | { t: 'level' }
  | { t: 'use'; slot: number; i?: number }
  | { t: 'descend' }
  | { t: 'boon'; k: number }
  | { t: 'buy'; k: number }
  | { t: 'next' };

export const has = (r: RunState, b: BoonId): boolean => r.boons.includes(b);
export const slots = (r: RunState): number => BASE_SLOTS + r.boons.filter((b) => b === 'pouch').length;
export const need = (r: RunState): number => xpNeed(r.level);
export const canLevel = (r: RunState): boolean => r.xp >= need(r);

export function newRun(hero: HeroId, seed: string, daily: string | null = null): RunState {
  const r: RunState = {
    seed,
    daily,
    hero,
    floor: 1,
    hp: START_HP,
    maxHp: START_HP,
    level: 1,
    xp: 0,
    tileBank: 0,
    gold: 0,
    keys: 0,
    items: ['potion'],
    boons: [],
    ward: 0,
    phoenixUsed: false,
    board: newBoard(1, false),
    phase: 'floor',
    boonOffer: [],
    boonPicked: false,
    shop: [],
    stats: { kills: 0, tiles: 0, chests: 0, gold: 0, bosses: 0, levels: 0 },
    over: null,
    killedBy: '',
  };
  if (hero === 'knight') {
    addBoon(r, 'tough');
  }
  if (hero === 'thief') {
    addBoon(r, 'keyring');
    addBoon(r, 'greed');
  }
  startFloor(r);
  return r;
}

function addBoon(r: RunState, b: BoonId): void {
  r.boons.push(b);
  if (b === 'tough') {
    r.maxHp += 3;
    r.hp = Math.min(r.maxHp, r.hp + 3);
  }
  if (b === 'keyring') r.keys += 2;
}

function startFloor(r: RunState): void {
  r.board = newBoard(r.floor, has(r, 'lens'));
  r.phase = 'floor';
  if (r.hero === 'sage') giveItem(r, 'scroll');
}

function giveItem(r: RunState, it: ItemId): boolean {
  if (r.items.length >= slots(r)) return false;
  r.items.push(it);
  return true;
}

export const bossDef = (r: RunState) => BOSSES[r.floor - 1];

/** Name and icon of the monster on tile i, as the game shows it after a fight. */
export function monLabel(r: RunState, i: number): { name: string; icon: string } {
  const b = r.board;
  if (b.mon[i] === 'boss') return bossDef(r);
  const d = MONSTERS[b.mon[i] as keyof typeof MONSTERS];
  return { name: d?.name ?? '?', icon: d?.icon ?? '?' };
}

/** Damage a fight with the monster on tile i deals now (without the ward). */
export function baseDamage(r: RunState, i: number): number {
  const b = r.board;
  let d = b.str[i];
  if (b.mon[i] === 'ghost' && has(r, 'salt')) d = Math.ceil(d / 2);
  if (b.mon[i] === 'boss' && has(r, 'hunter')) d -= 3;
  if (has(r, 'armor')) d -= 1;
  return Math.max(1, d);
}

/** Damage for a monster of strength s (for markers and bot guesses). */
export function damageFor(r: RunState, s: number, boss = false): number {
  let d = s;
  if (boss && has(r, 'hunter')) d -= 3;
  if (has(r, 'armor')) d -= 1;
  return Math.max(1, d - r.ward);
}

export const damage = (r: RunState, i: number): number => Math.max(0, baseDamage(r, i) - r.ward);

function xpFor(r: RunState, i: number): number {
  const b = r.board;
  const base = (b.mon[i] === 'boss' ? b.str[i] * 2 : b.str[i]) * TUNE.xpMul;
  return Math.round(base * (has(r, 'scholar') ? 1.25 : 1));
}

function goldGain(r: RunState, g: number): number {
  const v = Math.round(g * (has(r, 'greed') ? 1.5 : 1));
  r.gold += v;
  r.stats.gold += v;
  return v;
}

/** Collects the pickup on an open tile. */
function pickup(r: RunState, i: number, fx: Fx[]): void {
  const b = r.board;
  const it = b.item[i];
  if (!it) return;
  if (it === 'coin') {
    fx.push({ t: 'gold', i, n: goldGain(r, 3 + r.floor) });
    b.item[i] = '';
  } else if (it === 'key') {
    r.keys++;
    fx.push({ t: 'key', i });
    b.item[i] = '';
  } else if (giveItem(r, it)) {
    fx.push({ t: 'item', i, text: ITEMS[it].icon });
    b.item[i] = '';
  }
}

function openTiles(r: RunState, i: number, fx: Fx[]): void {
  const opened = openFlood(r.board, i);
  r.stats.tiles += opened.length;
  for (const o of opened) {
    fx.push({ t: 'open', i: o });
    pickup(r, o, fx);
  }
  if (opened.length) {
    const before = Math.floor(r.tileBank / TILES_PER_XP());
    r.tileBank += opened.length;
    const gain = Math.floor(r.tileBank / TILES_PER_XP()) - before;
    if (gain) {
      r.xp += gain;
      fx.push({ t: 'xp', i, n: gain });
    }
  }
}

/** Reveals a 3×3 area around i. */
function scout(r: RunState, i: number, fx: Fx[]): void {
  const b = r.board;
  for (const k of [i, ...nbrs(b)[i]]) {
    if (b.st[k] === HIDDEN) {
      if (b.kind[k] === MON) b.st[k] = SEEN;
      else openTiles(r, k, fx);
    } else if (b.st[k] === SEEN) b.unmask[k] = 1;
  }
  fx.push({ t: 'scout', i });
}

function afterGen(r: RunState, fx: Fx[]): void {
  const b = r.board;
  const rng = new Rng(hash(r.seed, 'perk', r.floor));
  if (r.hero === 'seer') {
    const y = rng.int(0, b.h - 1);
    for (let x = 0; x < b.w; x++) {
      const k = y * b.w + x;
      if (b.kind[k] === MON && b.st[k] === HIDDEN) b.st[k] = SEEN;
      if (b.mon[k] === 'mimic') b.unmask[k] = 1;
    }
    fx.push({ t: 'scout', i: y * b.w });
  }
  if (has(r, 'lantern')) {
    const hid = [...b.st.keys()].filter((k) => b.st[k] === HIDDEN);
    if (hid.length) scout(r, rng.pick(hid), fx);
  }
}

function fight(r: RunState, i: number, fx: Fx[]): void {
  const dmg = damage(r, i);
  if (r.ward) fx.push({ t: 'ward', i });
  r.ward = 0;
  r.hp -= dmg;
  fx.push({ t: 'hit', i, n: dmg });
  if (r.hp <= 0) {
    if (has(r, 'phoenix') && !r.phoenixUsed) {
      r.phoenixUsed = true;
      r.hp = 1;
      fx.push({ t: 'phoenix', i });
    } else {
      r.hp = 0;
      r.over = 'dead';
      r.phase = 'over';
      r.killedBy = monLabel(r, i).name;
      fx.push({ t: 'dead', i });
      return;
    }
  }
  killAt(r, i, fx, true);
}

function killAt(r: RunState, i: number, fx: Fx[], withXp: boolean): void {
  const b = r.board;
  b.st[i] = OPEN;
  b.unmask[i] = 1;
  r.stats.kills++;
  fx.push({ t: 'kill', i });
  if (withXp) {
    const x = xpFor(r, i);
    r.xp += x;
    fx.push({ t: 'xp', i, n: x });
  }
  if (has(r, 'vamp') && r.hp < r.maxHp) {
    r.hp++;
    fx.push({ t: 'heal', i, n: 1 });
  }
  if (b.mon[i] === 'boss') {
    r.stats.bosses++;
    fx.push({ t: 'gold', i, n: goldGain(r, 10 + 5 * r.floor) });
    if (r.floor >= FLOORS) {
      r.over = 'win';
      r.phase = 'over';
      fx.push({ t: 'win', i });
    } else fx.push({ t: 'stairs', i });
  }
}

export const stairsOpen = (r: RunState): boolean => r.board.gen && r.board.boss >= 0 && r.board.st[r.board.boss] === OPEN;

/** Main input: a click on tile i. */
function clickTile(r: RunState, i: number, fx: Fx[]): void {
  const b = r.board;
  if (!b.gen) {
    generate(b, i, r.seed, { sense: has(r, 'sense') });
    b.gen = true;
    openTiles(r, i, fx);
    afterGen(r, fx);
    return;
  }
  if (b.st[i] === OPEN) {
    if (b.item[i]) {
      pickup(r, i, fx);
      if (b.item[i]) fx.push({ t: 'deny', i, text: 'Bag full' });
    }
    return;
  }
  if (b.kind[i] === MON) {
    fight(r, i, fx);
    return;
  }
  if (b.kind[i] === CHEST) {
    if (r.keys <= 0) {
      b.unmask[i] = 1;
      fx.push({ t: 'deny', i, text: 'Needs a key 🗝️' });
      return;
    }
    r.keys--;
    b.st[i] = OPEN;
    r.stats.chests++;
    fx.push({ t: 'chest', i });
    fx.push({ t: 'gold', i, n: goldGain(r, 8 + 3 * r.floor) });
    const rng = new Rng(hash(r.seed, 'chest', r.floor, i));
    const n = has(r, 'keyring') ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const it = rng.pick(ITEM_IDS);
      if (giveItem(r, it)) fx.push({ t: 'item', i, text: ITEMS[it].icon });
    }
    return;
  }
  openTiles(r, i, fx);
}

export function apply(r: RunState, a: Action): Fx[] {
  const fx: Fx[] = [];
  if (r.over) return fx;
  switch (a.t) {
    case 'tile':
      if (r.phase !== 'floor') break;
      if (stairsOpen(r) && a.i === r.board.boss) return apply(r, { t: 'descend' });
      clickTile(r, a.i, fx);
      break;
    case 'level':
      if (!canLevel(r)) break;
      r.xp -= need(r);
      r.level++;
      r.stats.levels++;
      r.maxHp += HP_PER_LEVEL();
      r.hp = r.maxHp;
      fx.push({ t: 'level' });
      break;
    case 'use':
      useItem(r, a.slot, a.i, fx);
      break;
    case 'descend':
      if (!stairsOpen(r)) break;
      r.phase = 'reward';
      makeReward(r);
      fx.push({ t: 'stairs' });
      break;
    case 'boon':
      if (r.phase === 'reward' && !r.boonPicked && r.boonOffer[a.k]) {
        addBoon(r, r.boonOffer[a.k]);
        r.boonPicked = true;
      }
      break;
    case 'buy': {
      const o = r.shop[a.k];
      if (r.phase !== 'reward' || !o || o.sold || r.gold < o.price) break;
      if (o.kind === 'item' && !giveItem(r, o.item!)) break;
      if (o.kind === 'key') r.keys++;
      if (o.kind === 'maxhp') {
        r.maxHp += 2;
        r.hp += 2;
      }
      r.gold -= o.price;
      o.sold = true;
      break;
    }
    case 'next':
      if (r.phase !== 'reward') break;
      r.floor++;
      startFloor(r);
      break;
  }
  return fx;
}

export function useItem(r: RunState, slot: number, target: number | undefined, fx: Fx[]): void {
  const it = r.items[slot];
  if (!it || r.phase !== 'floor') return;
  const b = r.board;
  if (ITEMS[it].target) {
    if (target === undefined || !b.gen) return;
    if (it === 'scroll') scout(r, target, fx);
    if (it === 'bomb') {
      if (b.st[target] === OPEN) return;
      if (b.mon[target] === 'boss') {
        fx.push({ t: 'deny', i: target, text: 'The boss shrugs off bombs' });
        return;
      }
      fx.push({ t: 'bomb', i: target });
      if (isAliveMon(b, target)) killAt(r, target, fx, false);
      else if (b.kind[target] === CHEST) {
        b.unmask[target] = 1;
        fx.push({ t: 'deny', i: target, text: 'Just a chest' });
      } else openTiles(r, target, fx);
    }
  } else if (it === 'potion') {
    const heal = Math.min(r.maxHp - r.hp, 5 + (has(r, 'alchemy') ? 3 : 0));
    r.hp += heal;
    fx.push({ t: 'heal', n: heal });
  } else if (it === 'ward') {
    r.ward += 4;
    fx.push({ t: 'ward' });
  }
  r.items.splice(slot, 1);
}

function makeReward(r: RunState): void {
  const rng = new Rng(hash(r.seed, 'reward', r.floor));
  const pool = BOON_IDS.filter((b) => BOONS[b].stack || !has(r, b));
  r.boonOffer = rng.shuffle([...pool]).slice(0, 3);
  r.boonPicked = false;
  const f = r.floor;
  const items = rng.shuffle([...ITEM_IDS, 'potion' as ItemId]).slice(0, 3);
  r.shop = [
    ...items.map((it) => ({ kind: 'item' as const, item: it, price: ITEMS[it].price + Math.floor(f / 2), sold: false })),
    { kind: 'key', price: 5 + Math.floor(f / 3), sold: false },
    { kind: 'maxhp', price: 14 + 2 * f, sold: false },
  ];
}

export function score(r: RunState): number {
  const floors = r.over === 'win' ? FLOORS : r.floor - 1;
  return floors * 100 + r.stats.kills * 3 + r.level * 20 + r.gold + (r.over === 'win' ? 1000 + r.hp * 20 : 0);
}

/** Total HP of hidden monsters left on the floor, by type, for the legend. */
export function legend(r: RunState): { icon: string; name: string; str: number; left: number; total: number; text?: string }[] {
  const b = r.board;
  const map = new Map<string, { icon: string; name: string; str: number; left: number; total: number; text?: string }>();
  const order: string[] = [];
  for (let i = 0; i < b.kind.length; i++) {
    if (b.kind[i] !== MON) continue;
    const key = b.mon[i] as string;
    let e = map.get(key);
    if (!e) {
      const lab = monLabel(r, i);
      e = { icon: lab.icon, name: lab.name, str: b.str[i], left: 0, total: 0, text: MONSTERS[b.mon[i] as keyof typeof MONSTERS]?.text };
      map.set(key, e);
      order.push(key);
    }
    e.total++;
    if (b.st[i] !== OPEN) e.left++;
  }
  return order.map((k) => map.get(k)!).sort((a, c) => a.str - c.str);
}


// ---------------- Save data ----------------

export interface Meta {
  souls: number;
  unlocked: HeroId[];
  runs: number;
  wins: number;
  best: number;
  bestFloor: number;
  kills: number;
  daily: { date: string; best: number } | null;
}

export const defaultMeta = (): Meta => ({ souls: 0, unlocked: ['wanderer'], runs: 0, wins: 0, best: 0, bestFloor: 0, kills: 0, daily: null });

const RUN_KEY = 'sweep.run';
const META_KEY = 'sweep.meta';

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    return r && r.board && !r.over ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState | null): void {
  try {
    if (!r || r.over) localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

export function loadMeta(): Meta {
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) return { ...defaultMeta(), ...(JSON.parse(s) as Partial<Meta>) };
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

/** Applies a finished run to the meta progress. Returns the souls earned. */
export function finishRun(m: Meta, r: RunState): number {
  const sc = score(r);
  const souls = Math.floor(sc / 50);
  m.souls += souls;
  m.runs++;
  if (r.over === 'win') m.wins++;
  m.best = Math.max(m.best, sc);
  m.bestFloor = Math.max(m.bestFloor, r.over === 'win' ? FLOORS : r.floor);
  m.kills += r.stats.kills;
  if (r.daily) {
    if (!m.daily || m.daily.date !== r.daily) m.daily = { date: r.daily, best: sc };
    else m.daily.best = Math.max(m.daily.best, sc);
  }
  return souls;
}

export const heroDef = (r: RunState) => HEROES[r.hero];
