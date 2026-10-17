/** Run state: the tower map, rooms, rewards, shop, inn, events, save data. No DOM. */
import { CLASSES, CLASS_IDS, ENEMIES, EVENTS, GEAR, GEAR_IDS, ITEMS, ROOMS, TOP_FLOOR, UNLOCKS, isBossFloor, zoneOf, type EventDef, type RoomKind } from './data';
import { clampHero, gainXp, heroStats, newHero, xpNeeded, type Hero } from './party';
import { Rng, hash } from './rng';
import { writeBack, type Battle } from './battle';

export const RUN_KEY = 'tbt.run';
export const META_KEY = 'tbt.meta';
export const MAX_PARTY = 4;

export interface Room {
  kind: RoomKind;
  /** Enemy ids for fights (shown as a hint before you enter). */
  foes?: string[];
}

export interface RunState {
  v: 1;
  seed: string;
  floor: number;
  doors: Room[];
  room: Room | null;
  heroes: Hero[];
  items: Record<string, number>;
  bag: string[];
  gold: number;
  nextId: number;
  hasteNext: boolean;
  kills: number;
  battles: number;
  bosses: number;
  /** Shop stock and inn offers for the current room. */
  shop: ShopItem[] | null;
  recruits: string[] | null;
  event: string | null;
  /** Classes that can join (unlocked when the run started). */
  pool: string[];
}

export interface Meta {
  crystals: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestFloor: number;
  best: number;
  mode: 'wait' | 'active';
  speed: number;
}

export interface ShopItem {
  kind: 'item' | 'gear';
  id: string;
  price: number;
  sold?: boolean;
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export function unlockedClasses(meta: Meta): string[] {
  return CLASS_IDS.filter((c) => CLASSES[c].cost === 0 || meta.unlocked.includes(c));
}

export function partySize(meta: Meta): number {
  return meta.unlocked.includes('trio') ? 3 : 2;
}

export function newRun(seed: string, classes: string[], meta: Meta): RunState {
  const rng = new Rng(hash(seed, 'start'));
  const lvl = meta.unlocked.includes('veteran') ? 2 : 1;
  const heroes: Hero[] = [];
  classes.forEach((c, i) => heroes.push(newHero(i + 1, c, lvl, rng, heroes.map((h) => h.name))));
  const run: RunState = {
    v: 1,
    seed,
    floor: 1,
    doors: [],
    room: null,
    heroes,
    items: { potion: 3, ether: 1, phoenix_down: 0 },
    bag: [],
    gold: 60,
    nextId: heroes.length + 1,
    hasteNext: false,
    kills: 0,
    battles: 0,
    bosses: 0,
    shop: null,
    recruits: null,
    event: null,
    pool: unlockedClasses(meta),
  };
  if (meta.unlocked.includes('stock')) {
    run.items.potion += 2;
    run.items.phoenix_down += 1;
  }
  if (meta.unlocked.includes('purse')) run.gold += 80;
  if (meta.unlocked.includes('charm')) run.bag.push('lucky_charm');
  run.doors = makeDoors(run);
  return run;
}

// ---------- Map ----------

export function encounter(run: RunState, floor: number, kind: RoomKind, salt: number): string[] {
  const z = zoneOf(floor);
  const rng = rngFor(run, 'foes', floor, salt);
  if (kind === 'boss') return [z.boss];
  if (kind === 'elite') {
    const adds = floor % 5 >= 3 ? 1 : 0;
    const out = [z.elite];
    for (let i = 0; i < adds; i++) out.push(rng.weighted(z.pool));
    return out;
  }
  const inZone = (floor - 1) % 5;
  const zi = Math.floor((floor - 1) / 5);
  const min = zi === 0 ? (floor === 1 ? 2 : 2) : 3;
  const max = zi === 0 ? (inZone >= 2 ? 3 : 2) : inZone >= 2 ? 4 : 3;
  const n = rng.int(min, max);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(rng.weighted(z.pool));
  return out;
}

export function makeDoors(run: RunState): Room[] {
  const f = run.floor;
  if (isBossFloor(f)) return [{ kind: 'boss', foes: encounter(run, f, 'boss', 0) }];
  const rng = rngFor(run, 'doors', f);
  const kinds: RoomKind[] = [];
  if (f === 1) kinds.push('battle', 'battle');
  else {
    const n = rng.chance(0.6) ? 3 : 2;
    const must: RoomKind[] = ['battle'];
    if (f % 5 === 4 || f === 2) must.push('inn');
    if (f === 7 || f === 12) must.push('shop');
    kinds.push(...must);
    const table: [RoomKind, number][] = [
      ['battle', 40],
      ['elite', f >= 3 ? 12 : 0],
      ['inn', 10],
      ['shop', 12],
      ['event', 16],
      ['treasure', f >= 2 ? 6 : 0],
    ];
    let guard = 0;
    while (kinds.length < n && guard++ < 50) {
      const k = rng.weighted(table);
      if (k !== 'battle' && kinds.includes(k)) continue;
      kinds.push(k);
    }
    rng.shuffle(kinds);
  }
  return kinds.map((k, i) => (k === 'battle' || k === 'elite' ? { kind: k, foes: encounter(run, f, k, i) } : { kind: k }));
}

/** Moves to the next floor. Returns true when the tower is cleared. */
export function nextFloor(run: RunState): boolean {
  run.room = null;
  run.shop = null;
  run.recruits = null;
  run.event = null;
  if (run.floor >= TOP_FLOOR) return true;
  run.floor++;
  run.doors = makeDoors(run);
  return false;
}

export function enterRoom(run: RunState, i: number): Room {
  const room = run.doors[i];
  run.room = room;
  if (room.kind === 'shop') run.shop = makeShop(run);
  if (room.kind === 'inn') run.recruits = makeRecruits(run);
  if (room.kind === 'event') run.event = pickEvent(run).id;
  return room;
}

export const battleSeed = (run: RunState): number => hash(run.seed, 'battle', run.floor, run.room?.kind ?? '', (run.room?.foes ?? []).join());

export const living = (run: RunState): Hero[] => run.heroes.filter((h) => h.hp > 0);

// ---------- Rewards ----------

export interface Rewards {
  gold: number;
  xp: number;
  levels: { hero: number; ups: number }[];
  items: string[];
  gear: string[];
  picked: boolean;
  crystals: number;
}

export function gearTier(floor: number): 1 | 2 | 3 {
  return floor <= 5 ? 1 : floor <= 10 ? 2 : 3;
}

export function randomGear(rng: Rng, floor: number, n: number, bias = 0): string[] {
  const tier = Math.min(3, gearTier(floor) + bias);
  const pool = GEAR_IDS.filter((g) => !GEAR[g].meta && (GEAR[g].tier === tier || (GEAR[g].tier === tier - 1 && rng.chance(0.3))));
  rng.shuffle(pool);
  return pool.slice(0, n);
}

const goldMul = (run: RunState): number => (run.heroes.some((h) => h.gear.acc === 'lucky_charm') ? 1.25 : 1);

/** Applies the end of a won battle: HP/MP, gold, XP, drops. */
export function winBattle(run: RunState, b: Battle): Rewards {
  writeBack(b, run.heroes);
  run.items = b.items;
  const rng = rngFor(run, 'loot', run.floor, b.time | 0);
  const foes = b.units.filter((u) => u.side === 'enemy');
  run.kills += foes.length;
  run.battles++;
  const kind = run.room?.kind ?? 'battle';
  let gold = 0;
  let xp = 0;
  const items: string[] = [];
  for (const u of foes) {
    const d = ENEMIES[u.key];
    const m = 1 + 0.1 * ((run.floor - 1) % 5);
    gold += d.gold * m;
    xp += d.xp * m;
    if (d.drop && rng.chance(d.drop[1])) items.push(d.drop[0]);
  }
  gold = Math.round(gold * goldMul(run) * (0.9 + rng.next() * 0.2)) + b.stealGold;
  xp = Math.round(xp);
  run.gold += gold;
  for (const i of items) run.items[i] = (run.items[i] ?? 0) + 1;
  const levels: Rewards['levels'] = [];
  run.heroes.forEach((h, i) => {
    if (h.hp <= 0) return;
    const ups = gainXp(h, xp);
    if (ups) levels.push({ hero: i, ups });
    // A short breather after each battle.
    const s = heroStats(h);
    h.mp = Math.min(s.mp, h.mp + Math.round(s.mp * 0.12));
  });
  let gear: string[] = [];
  let crystals = 0;
  if (kind === 'elite') gear = randomGear(rng, run.floor, 3);
  if (kind === 'boss') {
    run.bosses++;
    gear = randomGear(rng, run.floor + 1, 3, 1);
    crystals = 10 * run.bosses;
  }
  return { gold, xp, levels, items, gear, picked: false, crystals };
}

// ---------- Shop ----------

export function makeShop(run: RunState): ShopItem[] {
  const rng = rngFor(run, 'shop', run.floor);
  const items: ShopItem[] = ['potion', 'ether', 'phoenix_down', 'remedy'].map((id) => ({ kind: 'item', id, price: ITEMS[id].price }));
  const extra = rng.shuffle(['hipotion', 'tonic', 'firebomb', 'icegem', 'voltjar', 'elixir']).slice(0, 2);
  for (const id of extra) items.push({ kind: 'item', id, price: ITEMS[id].price });
  for (const g of randomGear(rng, run.floor, 3)) items.push({ kind: 'gear', id: g, price: GEAR[g].price });
  if (run.floor >= 6) items.find((i) => i.id === 'potion')!.id = 'hipotion';
  for (const i of items) if (i.kind === 'item') i.price = ITEMS[i.id].price;
  return items;
}

export function buy(run: RunState, i: number): boolean {
  const s = run.shop?.[i];
  if (!s || s.sold || run.gold < s.price) return false;
  run.gold -= s.price;
  if (s.kind === 'item') run.items[s.id] = (run.items[s.id] ?? 0) + 1;
  else {
    run.bag.push(s.id);
    s.sold = true;
  }
  return true;
}

// ---------- Inn ----------

export const restCost = (run: RunState): number => 10 + run.floor * 5;
export const recruitCost = (run: RunState): number => 50 + run.floor * 10;

export function makeRecruits(run: RunState): string[] {
  const rng = rngFor(run, 'inn', run.floor);
  const have = run.heroes.map((h) => h.cls);
  let pool = run.pool.filter((c) => !have.includes(c));
  if (pool.length < 2) pool = [...run.pool];
  return rng.shuffle([...pool]).slice(0, 2);
}

export function rest(run: RunState): boolean {
  const cost = restCost(run);
  if (run.gold < cost) return false;
  run.gold -= cost;
  for (const h of run.heroes) {
    const s = heroStats(h);
    h.hp = s.hp;
    h.mp = s.mp;
  }
  return true;
}

export function recruitLevel(run: RunState): number {
  const avg = run.heroes.reduce((a, h) => a + h.lvl, 0) / Math.max(1, run.heroes.length);
  return Math.max(1, Math.round(avg) - 1);
}

export function recruit(run: RunState, cls: string, free = false): Hero | null {
  if (run.heroes.length >= MAX_PARTY) return null;
  const cost = free ? 0 : recruitCost(run);
  if (run.gold < cost) return null;
  run.gold -= cost;
  const h = newHero(run.nextId++, cls, recruitLevel(run), rngFor(run, 'recruit', run.floor, cls), run.heroes.map((x) => x.name));
  run.heroes.push(h);
  if (run.recruits) run.recruits = run.recruits.filter((c) => c !== cls);
  return h;
}

// ---------- Gear ----------

export function equip(run: RunState, hero: number, bagIndex: number): void {
  const h = run.heroes[hero];
  const g = GEAR[run.bag[bagIndex]];
  if (!h || !g) return;
  const old = h.gear[g.slot];
  run.bag.splice(bagIndex, 1);
  if (old) run.bag.push(old);
  h.gear[g.slot] = g.id;
  clampHero(h);
}

export function unequip(run: RunState, hero: number, slot: 'weapon' | 'armor' | 'acc'): void {
  const h = run.heroes[hero];
  const old = h?.gear[slot];
  if (!old) return;
  delete h.gear[slot];
  run.bag.push(old);
  clampHero(h);
}

// ---------- Events ----------

export function pickEvent(run: RunState): EventDef {
  return rngFor(run, 'event', run.floor).pick(EVENTS);
}

export function eventDef(run: RunState): EventDef | null {
  return EVENTS.find((e) => e.id === run.event) ?? null;
}

export function optionOk(run: RunState, need: EventDef['options'][number]['need']): boolean {
  switch (need) {
    case undefined:
      return true;
    case 'gold50':
      return run.gold >= 50;
    case 'gold100':
      return run.gold >= 100;
    case 'gold120':
      return run.gold >= 120;
    case 'potion':
      return (run.items.potion ?? 0) > 0;
    case 'thief':
      return run.heroes.some((h) => h.cls === 'thief' && h.hp > 0);
    case 'room':
      return run.heroes.length < MAX_PARTY;
  }
}

function xpAll(run: RunState, frac: number): string {
  const ups: string[] = [];
  for (const h of run.heroes) {
    if (h.hp <= 0) continue;
    if (gainXp(h, Math.round(xpNeeded(h.lvl) * frac))) ups.push(h.name);
  }
  return ups.length ? ` Level up: ${ups.join(', ')}!` : '';
}

/** Runs an event option. Returns the result text. */
export function runEvent(run: RunState, opt: number): string {
  const ev = eventDef(run);
  if (!ev) return '';
  const o = ev.options[opt];
  if (!o || !optionOk(run, o.need)) return '';
  const rng = rngFor(run, 'event-roll', run.floor, opt);
  const hurtAll = (p: number): void => {
    for (const h of run.heroes) if (h.hp > 0) h.hp = Math.max(1, h.hp - Math.round(heroStats(h).hp * p));
  };
  const gearGift = (): string => {
    const g = randomGear(rng, run.floor, 1)[0];
    run.bag.push(g);
    return `${GEAR[g].icon} ${GEAR[g].name}`;
  };
  switch (`${ev.id}:${opt}`) {
    case 'fountain:0':
      for (const h of run.heroes) {
        if (h.hp <= 0) continue;
        const s = heroStats(h);
        h.hp = Math.min(s.hp, h.hp + Math.round(s.hp * 0.5));
        h.mp = Math.min(s.mp, h.mp + Math.round(s.mp * 0.3));
      }
      return 'The water is cold and sweet. The party feels better.';
    case 'fountain:1':
      run.hasteNext = true;
      return 'Time flows faster around you. The next battle starts with Haste.';
    case 'merchant:0':
      run.gold -= 50;
      return `The box holds ${gearGift()}.`;
    case 'merchant:1':
      run.items.potion--;
      run.items.phoenix_down = (run.items.phoenix_down ?? 0) + 1;
      return 'You trade a Potion for a 🪶 Phoenix Down.';
    case 'shrine:0':
      if (rng.chance(0.6)) {
        const h = rng.pick(run.heroes.filter((x) => x.hp > 0));
        gainXp(h, xpNeeded(h.lvl) - h.xp);
        return `A warm light. ${h.name} gains a level!`;
      }
      hurtAll(0.2);
      return 'The bells ring backwards. Every hero loses 20% HP.';
    case 'shrine:1':
      run.gold -= 50;
      return `The god of hours accepts the gold.${xpAll(run, 0.5)}`;
    case 'chest:0':
      if (rng.chance(0.6)) return `Inside: ${gearGift()}.`;
      hurtAll(0.25);
      return 'A needle trap! Every hero loses 25% HP.';
    case 'chest:1':
      return `The thief cuts the wire. Inside: ${gearGift()}.`;
    case 'adventurer:0': {
      const cls = rng.pick(run.pool);
      const h = recruit(run, cls, true);
      if (!h) return 'There is no room in the party.';
      h.hp = Math.round(heroStats(h).hp * 0.5);
      return `${CLASSES[cls].icon} ${h.name} the ${CLASSES[cls].name} joins the party!`;
    }
    case 'adventurer:1':
      run.items.potion--;
      run.gold += 80;
      return 'The adventurer thanks you and pays 80 gold.';
    case 'library:0':
      return `The party reads about time magic.${xpAll(run, 0.35)}`;
    case 'library:1':
      if (rng.chance(0.5)) return `The words burn into your minds.${xpAll(run, 1)}`;
      hurtAll(0.3);
      return 'The tome bites! Every hero loses 30% HP.';
    case 'dice:0':
      run.gold -= 50;
      if (rng.chance(0.5)) {
        run.gold += 120;
        return 'Double sixes! You win 120 gold.';
      }
      return 'The skeletons laugh. You lose 50 gold.';
    case 'dice:1':
      run.gold -= 100;
      if (rng.chance(0.45)) {
        run.gold += 260;
        return 'A lucky throw! You win 260 gold.';
      }
      return 'Snake eyes. You lose 100 gold.';
    case 'clockmaker:0':
      run.gold -= 120;
      run.bag.push('hourglass');
      return 'You buy an ⏳ Hourglass. Its wearer starts battles with a half-full time bar.';
    case 'clockmaker:1':
      for (const h of run.heroes) if (h.hp > 0) h.mp = heroStats(h).mp;
      return 'The tea tastes of cinnamon. All MP is back.';
    default:
      return 'You walk on.';
  }
}

// ---------- Score, save, meta ----------

export function score(run: RunState, victory: boolean): number {
  const lv = run.heroes.reduce((a, h) => a + h.lvl, 0);
  return (run.floor - 1) * 80 + run.kills * 6 + run.bosses * 250 + lv * 10 + Math.floor(run.gold / 4) + (victory ? 1500 : 0);
}

export const crystalsFor = (s: number): number => Math.floor(s / 40);

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
    if (run.v !== 1 || !Array.isArray(run.heroes) || run.heroes.some((h) => !CLASSES[h.cls]) || run.bag.some((g) => !GEAR[g]) || !Array.isArray(run.pool)) return null;
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
  const base: Meta = { crystals: 0, unlocked: [], runs: 0, wins: 0, bestFloor: 0, best: 0, mode: 'wait', speed: 1 };
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

export const unlockCost = (id: string): number => UNLOCKS.find((u) => u.id === id)?.cost ?? 999;

export const roomName = (k: RoomKind): string => ROOMS[k].name;
