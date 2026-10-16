/** Run state: days, orders, market, gathering, guild debt, the rival, meta progress and saves. Pure logic. */
import { addIngredient, canBottle, newBrew, useSalt, type BrewState } from './brew';
import {
  CUSTOMERS,
  EFFECTS,
  INGREDIENTS,
  ING_IDS,
  MAPS,
  PLACES,
  SALTS,
  SALT_IDS,
  UNLOCKS,
  type EffectId,
  type MapId,
} from './data';
import { Rng, hash } from './rng';

export const DAYS_PER_WEEK = 5;
export const WEEKS = 4;
export const LAST_DAY = DAYS_PER_WEEK * WEEKS - 1;
export const HOURS = 3;
export const MAX_ACTIVE = 4;
export const DEBTS = [180, 400, 650, 880];
export const GRAND_DAY = 15;
export const STR_MULT = [0, 1, 1.4, 1.9];

export interface Order {
  id: number;
  icon: string;
  who: string;
  effect: EffectId;
  strength: number;
  /** Last day (index) to deliver. */
  due: number;
  price: number;
  grand?: boolean;
  /** Taken by the rival before you could accept it. */
  rival?: boolean;
}

export interface Potion {
  effect: EffectId;
  strength: number;
}

export interface Ware {
  id: string;
  qty: number;
  price: number;
}

export interface Stats {
  delivered: number;
  failed: number;
  earned: number;
  brewed: number;
  ruined: number;
  trips: number;
}

export interface RunState {
  seed: string;
  day: number;
  hours: number;
  gold: number;
  rep: number;
  rivalRep: number;
  inv: Record<string, number>;
  salts: Record<string, number>;
  potions: Potion[];
  board: Order[];
  active: Order[];
  market: Ware[];
  saltMarket: Ware[];
  maps: MapId[];
  meta: string[];
  injured: number;
  nextId: number;
  trips: number;
  stats: Stats;
  /** Messages from the last night. */
  news: string[];
  brew: BrewState | null;
  brewFor: number | null;
  result: 'win' | 'lose' | null;
  reason: string;
}

export const week = (day: number): number => Math.floor(day / DAYS_PER_WEEK);
export const dayInWeek = (day: number): number => (day % DAYS_PER_WEEK) + 1;
export const daysToDebt = (day: number): number => DAYS_PER_WEEK - (day % DAYS_PER_WEEK) - 1;
export const WINE_FEE = 60;
/** The debt due this week. The Dark Wine licence adds a fee from week 3. */
export const debtNow = (run: RunState): number =>
  DEBTS[Math.min(week(run.day), WEEKS - 1)] + (run.meta.includes('wine') && week(run.day) >= 2 ? WINE_FEE : 0);

export function rngFor(run: RunState, ...parts: (string | number)[]): Rng {
  return new Rng(hash(run.seed, ...parts));
}

export function newRun(seed: string, meta: Meta): RunState {
  const run: RunState = {
    seed,
    day: 0,
    hours: HOURS,
    gold: 50 + (meta.unlocked.includes('purse') ? 20 : 0),
    rep: 5,
    rivalRep: 5,
    inv: { healroot: 2, firebloom: 2, windgrass: 1, mossbell: 1, ironnut: 1 },
    salts: meta.unlocked.includes('salts') ? { sun: 2, moon: 1 } : { sun: 1 },
    potions: [],
    board: [],
    active: [],
    market: [],
    saltMarket: [],
    maps: ['water'],
    meta: [...meta.unlocked],
    injured: 0,
    nextId: 1,
    trips: 0,
    stats: { delivered: 0, failed: 0, earned: 0, brewed: 0, ruined: 0, trips: 0 },
    news: [],
    brew: null,
    brewFor: null,
    result: null,
    reason: '',
  };
  startDay(run);
  return run;
}

/** All effects that the open maps can make. */
export function openEffects(run: RunState): EffectId[] {
  const s = new Set<EffectId>();
  for (const m of run.maps) for (const z of MAPS[m].zones) s.add(z.effect);
  return [...s];
}

export function mapsWith(run: RunState, effect: EffectId): MapId[] {
  return run.maps.filter((m) => MAPS[m].zones.some((z) => z.effect === effect));
}

export function priceFor(run: RunState, effect: EffectId, strength: number, roll: number): number {
  return Math.round(EFFECTS[effect].value * STR_MULT[strength] * (1 + Math.min(run.rep, 40) * 0.01) * roll);
}

function makeOrder(run: RunState, rng: Rng): Order {
  const effects = openEffects(run);
  const w = week(run.day);
  // Newer maps get more orders, so new effects matter.
  const newest = MAPS[run.maps[run.maps.length - 1]].zones.map((z) => z.effect);
  const effect = rng.chance(0.35) ? rng.pick(newest) : rng.pick(effects);
  const strength = rng.weighted([
    [1, Math.max(1, 5 - w * 1.5)],
    [2, 3 + w * 0.5],
    [3, 0.5 + w],
  ] as const);
  const [icon, who] = rng.pick(CUSTOMERS);
  return {
    id: run.nextId++,
    icon,
    who,
    effect,
    strength,
    due: run.day + rng.int(1, 3) + (strength === 3 ? 1 + (run.meta.includes('board') ? 1 : 0) : 0),
    price: priceFor(run, effect, strength, 0.9 + rng.next() * 0.3),
  };
}

function makeMarket(run: RunState): void {
  const rng = rngFor(run, 'market', run.day);
  const w = week(run.day);
  const pool = ING_IDS.filter((id) => !INGREDIENTS[id].unlock || run.meta.includes(INGREDIENTS[id].unlock!));
  const commons = rng.shuffle(pool.filter((id) => INGREDIENTS[id].rarity === 'common'));
  const uncommons = rng.shuffle(pool.filter((id) => INGREDIENTS[id].rarity === 'uncommon'));
  const rares = rng.shuffle(pool.filter((id) => INGREDIENTS[id].rarity === 'rare'));
  const extra = run.meta.includes('cart') ? 1 : 0;
  const picks = [
    ...commons.slice(0, 3),
    ...uncommons.slice(0, 2 + Math.min(1, w) + (extra ? 1 : 0)),
    ...rares.slice(0, rng.int(0, 1) + (w >= 2 ? 1 : 0)),
  ];
  run.market = picks.map((id) => ({
    id,
    qty: INGREDIENTS[id].rarity === 'rare' ? rng.int(1, 2) : rng.int(2, 4),
    price: Math.max(2, Math.round(INGREDIENTS[id].price * (0.85 + rng.next() * 0.4))),
  }));
  run.saltMarket = rng
    .shuffle([...SALT_IDS])
    .slice(0, 2)
    .map((id) => ({ id, qty: rng.int(1, 3), price: SALTS[id].price }));
}

/** Chance that the rival takes each order on the board. */
export function rivalShare(run: RunState): number {
  return Math.min(0.75, (0.7 * run.rivalRep) / (run.rep + run.rivalRep + 1));
}

export function startDay(run: RunState): void {
  run.hours = Math.max(1, HOURS - run.injured);
  run.injured = 0;
  run.trips = 0;
  if (run.day >= DAYS_PER_WEEK && !run.maps.includes('oil')) {
    run.maps.push('oil');
    run.news.push('🛢️ The Lamp Oil map is open. New effects: Poison, Swiftness, Love.');
  }
  if (run.day >= DAYS_PER_WEEK * 2 && run.meta.includes('wine') && !run.maps.includes('wine')) {
    run.maps.push('wine');
    run.news.push('🍷 The Dark Wine map is open. New effect: Invisibility.');
  }
  const rng = rngFor(run, 'board', run.day);
  const n = 3 + (run.rep >= 25 ? 1 : 0);
  run.board = [];
  for (let i = 0; i < n; i++) run.board.push(makeOrder(run, rng));
  // The rival takes good orders. The higher their reputation is compared to yours, the more they take.
  const share = rivalShare(run);
  let claims = 0;
  for (const o of [...run.board].sort((a, b) => b.price - a.price)) {
    if (claims < run.board.length - 1 && rng.chance(share)) {
      o.rival = true;
      claims++;
    }
  }
  if (claims) run.news.push(`🧙‍♀️ Morwen, the rival alchemist, took ${claims} of today's orders.`);
  if (run.day === GRAND_DAY) {
    const effects = openEffects(run);
    const fx = rng.pick(effects.filter((e) => EFFECTS[e].value >= 34).length ? effects.filter((e) => EFFECTS[e].value >= 34) : effects);
    run.active.push({
      id: run.nextId++,
      icon: '🎓',
      who: 'Guild Master',
      effect: fx,
      strength: 3,
      due: LAST_DAY,
      price: 160,
      grand: true,
    });
    run.news.push(`🎓 The Guild Master orders a strong ${EFFECTS[fx].name} potion (III) by the last day. Fail it and you lose your license.`);
  }
  makeMarket(run);
}

export function accept(run: RunState, id: number): boolean {
  const i = run.board.findIndex((o) => o.id === id && !o.rival);
  if (i < 0 || run.active.length >= MAX_ACTIVE) return false;
  run.active.push(run.board[i]);
  run.board.splice(i, 1);
  return true;
}

export function buy(run: RunState, id: string, salt = false): boolean {
  const list = salt ? run.saltMarket : run.market;
  const w = list.find((x) => x.id === id);
  if (!w || w.qty <= 0 || run.gold < w.price) return false;
  w.qty--;
  run.gold -= w.price;
  const bag = salt ? run.salts : run.inv;
  bag[id] = (bag[id] ?? 0) + 1;
  return true;
}

export const potionValue = (p: Potion): number => Math.round(EFFECTS[p.effect].value * STR_MULT[p.strength] * 0.5);

export function sellPotion(run: RunState, idx: number): number {
  const p = run.potions[idx];
  if (!p) return 0;
  const v = potionValue(p);
  run.potions.splice(idx, 1);
  run.gold += v;
  run.stats.earned += v;
  return v;
}

export const fits = (p: Potion, o: Order): boolean => p.effect === o.effect && p.strength >= o.strength;

export function deliverPay(o: Order, p: Potion): number {
  return Math.round(o.price * (1 + (p.strength - o.strength) * 0.15));
}

export function deliver(run: RunState, orderId: number, potionIdx: number): number {
  const oi = run.active.findIndex((o) => o.id === orderId);
  const p = run.potions[potionIdx];
  if (oi < 0 || !p || !fits(p, run.active[oi])) return 0;
  const o = run.active[oi];
  const pay = deliverPay(o, p);
  run.gold += pay;
  run.stats.earned += pay;
  run.stats.delivered++;
  run.rep += 1 + (o.grand ? 5 : 0);
  run.active.splice(oi, 1);
  run.potions.splice(potionIdx, 1);
  return pay;
}

/** The best potion for an order: the weakest one that fits. */
export function potionFor(run: RunState, o: Order): number {
  let best = -1;
  run.potions.forEach((p, i) => {
    if (fits(p, o) && (best < 0 || p.strength < run.potions[best].strength)) best = i;
  });
  return best;
}

// ---------- Brewing inside a run ----------

export function startBrew(run: RunState, map: MapId, orderId: number | null = null): boolean {
  if (run.hours < 1 || !run.maps.includes(map)) return false;
  run.brew = newBrew(map);
  run.brewFor = orderId;
  return true;
}

export function brewAdd(run: RunState, id: string, grind: number): boolean {
  const b = run.brew;
  if (!b || b.ruined || (run.inv[id] ?? 0) <= 0) return false;
  run.inv[id]--;
  if (!run.inv[id]) delete run.inv[id];
  addIngredient(b, id, grind);
  return true;
}

export function brewSalt(run: RunState, id: string): boolean {
  const b = run.brew;
  if (!b || (run.salts[id] ?? 0) <= 0) return false;
  if (!useSalt(b, id)) return false;
  run.salts[id]--;
  if (!run.salts[id]) delete run.salts[id];
  return true;
}

/** Bottle the potion. Uses 1 hour. */
export function bottle(run: RunState): Potion | null {
  const b = run.brew;
  if (!b) return null;
  const z = canBottle(b);
  if (!z) return null;
  const p: Potion = { effect: z.effect, strength: z.strength };
  run.potions.push(p);
  run.hours--;
  run.stats.brewed++;
  run.brew = null;
  run.brewFor = null;
  return p;
}

/** End a ruined or unwanted brew. The ingredients are lost. Uses 1 hour if anything was added. */
export function dropBrew(run: RunState): void {
  const b = run.brew;
  if (!b) return;
  if (b.ruined) run.stats.ruined++;
  if (b.added.length || b.ruined) run.hours--;
  run.brew = null;
  run.brewFor = null;
}

// ---------- Gathering ----------

export interface TripResult {
  found: Record<string, number>;
  event: string;
  bad: boolean;
}

export function gather(run: RunState, place: string): TripResult | null {
  const pl = PLACES[place];
  if (!pl || run.hours < 2) return null;
  run.hours -= 2;
  run.stats.trips++;
  const rng = rngFor(run, 'trip', run.day, run.trips++, place);
  const pool = pl.pool.filter((id) => !INGREDIENTS[id].unlock || run.meta.includes(INGREDIENTS[id].unlock!));
  let n = rng.int(pl.min, pl.max);
  let event = 'A quiet trip.';
  let bad = false;
  if (rng.chance(pl.risk)) {
    bad = true;
    const roll = rng.int(0, 3);
    if (roll === 0) {
      const lost = Math.round(run.gold * 0.25);
      run.gold -= lost;
      event = `🗡️ Bandits! You lose ${lost} gold.`;
    } else if (roll === 1) {
      n = Math.ceil(n / 2);
      event = '⛈️ A storm. You find only half as much.';
    } else if (roll === 2) {
      run.injured = 1;
      event = '🤕 You twist an ankle. Tomorrow you have 1 hour less.';
    } else {
      n = 0;
      event = '🐺 Wolves chase you home with empty hands.';
    }
  } else if (rng.chance(0.25)) {
    n++;
    event = '🌟 A lucky find: one more ingredient.';
  }
  const found: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const id = rng.pick(pool);
    found[id] = (found[id] ?? 0) + 1;
    run.inv[id] = (run.inv[id] ?? 0) + 1;
  }
  return { found, event, bad };
}

// ---------- Night ----------

/** End the day: fail late orders, pay the weekly debt, then start the next day. */
export function endDay(run: RunState): void {
  run.news = [];
  if (run.brew) dropBrew(run);
  for (const o of [...run.active]) {
    if (o.due <= run.day) {
      run.active.splice(run.active.indexOf(o), 1);
      run.stats.failed++;
      run.rep = Math.max(0, run.rep - 3);
      run.rivalRep += 2;
      run.news.push(`❌ ${o.who} waited in vain for ${EFFECTS[o.effect].name}. Reputation −3.`);
      if (o.grand) {
        run.result = 'lose';
        run.reason = 'You failed the Guild Master. The guild takes your license.';
        return;
      }
    }
  }
  if (daysToDebt(run.day) === 0) {
    const due = debtNow(run);
    if (run.gold < due) {
      run.result = 'lose';
      run.reason = `The guild wanted ${due} gold. You had ${run.gold}. They close your shop.`;
      return;
    }
    run.gold -= due;
    run.news.push(`🏛️ You paid ${due} gold to the guild.`);
    if (run.day >= LAST_DAY) {
      run.result = 'win';
      run.reason = 'You paid every debt. The guild names you a master alchemist!';
      return;
    }
  }
  run.day++;
  const rng = rngFor(run, 'rival', run.day);
  run.rivalRep += rng.int(2, 3) + (rng.chance(week(run.day) * 0.35) ? 1 : 0);
  startDay(run);
}

// ---------- Score and meta ----------

export function score(run: RunState): number {
  return run.stats.earned + run.rep * 5 + run.day * 10 + (run.result === 'win' ? 300 : 0);
}

export const sealsFor = (s: number): number => Math.floor(s / 150);

export interface Meta {
  seals: number;
  runs: number;
  wins: number;
  best: number;
  bestDay: number;
  unlocked: string[];
}

const RUN_KEY = 'brew.run';
const META_KEY = 'brew.meta';

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage may be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    return r && typeof r.day === 'number' && !r.result ? r : null;
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
  const base: Meta = { seals: 0, runs: 0, wins: 0, best: 0, bestDay: 0, unlocked: [] };
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

export function unlock(meta: Meta, id: string): boolean {
  const u = UNLOCKS[id];
  if (!u || meta.unlocked.includes(id) || meta.seals < u.cost) return false;
  meta.seals -= u.cost;
  meta.unlocked.push(id);
  return true;
}

/** Record the end of a run in the meta. Returns the seals gained. */
export function finishRun(meta: Meta, run: RunState): number {
  const s = score(run);
  const seals = sealsFor(s);
  meta.runs++;
  if (run.result === 'win') meta.wins++;
  meta.best = Math.max(meta.best, s);
  meta.bestDay = Math.max(meta.bestDay, run.day + 1);
  meta.seals += seals;
  return seals;
}
