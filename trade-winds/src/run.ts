/** Run state, player actions, voyages, encounters, weekly costs and save data. */
import {
  BORROW_LAST_DAY,
  FREE_PORTS,
  FREE_SHIPS,
  GOAL,
  GOODS,
  GUARD_COST,
  GUARD_POWER,
  GUARD_WAGE,
  INTEREST,
  LOAN_DAYS,
  NEWS,
  NG,
  NP,
  PORTS,
  REPAIR_COST,
  RUN_DAYS,
  SEASONS,
  SHIPS,
  START_GOLD,
  START_LOAN,
  UNLOCKS,
  WAREHOUSE_CAP,
  WAREHOUSE_COST,
  WAREHOUSE_FEE,
  seasonOf,
  shipById,
  type ShipDef,
} from './data';
import { applyTrade, buyQuote, initMarket, marketDay, mid, refreshMult, sellQuote, type Market, type News } from './market';
import { Rng, hash } from './rng';

export interface Voyage {
  from: number;
  to: number;
  days: number;
  done: number;
  pirateP: number;
  stormP: number;
  pirates: boolean;
  storm: boolean;
}

export type Encounter =
  | { kind: 'pirates'; ships: number; strength: number; tribute: number; win: number; flee: number }
  | { kind: 'storm' | 'flotsam' | 'tip' | 'wind' | 'calm'; text: string };

export interface Known {
  day: number;
  prices: number[];
}

export interface RunStats {
  voyages: number;
  trades: number;
  profit: number;
  best: number;
  pirates: number;
  won: number;
  storms: number;
}

export interface RunState {
  v: number;
  seed: string;
  day: number;
  port: number;
  startPort: number;
  gold: number;
  debt: number;
  ship: string;
  hull: number;
  guards: number;
  cargo: number[];
  /** Total paid for the cargo of each good (for average cost). */
  paid: number[];
  /** Units bought in this port during this visit. */
  bought: number[];
  wh: (number[] | null)[];
  market: Market;
  known: (Known | null)[];
  news: News[];
  voyage: Voyage | null;
  encounter: Encounter | null;
  /** Result text of the last encounter choice, shown until the player continues. */
  outcome: string | null;
  log: { day: number; text: string }[];
  stats: RunStats;
  loanPaid: number | null;
  over: { victory: boolean; reason: string } | null;
}

export interface Meta {
  renown: number;
  unlocked: string[];
  runs: number;
  wins: number;
  best: number;
}

const RUN_KEY = 'trade-winds.run';
const META_KEY = 'trade-winds.meta';

// ---------- Helpers ----------

export const shipOf = (r: RunState): ShipDef => shipById(r.ship);
export const cargoUsed = (r: RunState): number => r.cargo.reduce((a, b) => a + b, 0);
export const cargoFree = (r: RunState): number => shipOf(r).cargo - cargoUsed(r);
export const week = (day: number): number => Math.floor(day / 7) + 1;
export const power = (r: RunState): number => shipOf(r).guns + r.guards * GUARD_POWER;
export const repairCost = (r: RunState): number => (shipOf(r).hull - r.hull) * REPAIR_COST;
export const tradeIn = (r: RunState): number => Math.floor(shipOf(r).price * 0.5);
export const creditLimit = (r: RunState): number => Math.max(0, Math.min(15000, Math.floor(netWorth(r) * 0.6)) - r.debt);
export const canBorrow = (r: RunState): boolean => r.day < BORROW_LAST_DAY && creditLimit(r) >= 100;

export function log(r: RunState, text: string): void {
  r.log.push({ day: r.day, text });
  if (r.log.length > 40) r.log.shift();
}

function rngFor(r: RunState, ...parts: (string | number)[]): Rng {
  return new Rng(hash(r.seed, ...parts));
}

/** Value of goods at the current port (sell side mid), or at base price at sea. */
function goodsValue(r: RunState, p: number, qty: number[]): number {
  let v = 0;
  for (let g = 0; g < NG; g++) {
    if (!qty[g]) continue;
    const unit = p >= 0 ? mid(r.market, p, g) * 0.95 : GOODS[g].base * 0.8;
    v += unit * qty[g];
  }
  return v;
}

export function netWorth(r: RunState): number {
  let v = r.gold - r.debt + tradeIn(r);
  v += goodsValue(r, r.voyage ? -1 : r.port, r.cargo);
  r.wh.forEach((w, p) => {
    if (w) v += goodsValue(r, p, w) + WAREHOUSE_COST * 0.5;
  });
  return Math.round(v);
}

export const avgCost = (r: RunState, g: number): number => (r.cargo[g] ? Math.round(r.paid[g] / r.cargo[g]) : 0);

export function remember(r: RunState, p: number): void {
  r.known[p] = { day: r.day, prices: GOODS.map((_, g) => Math.round(mid(r.market, p, g))) };
}

export function dangerAt(r: RunState, p: number, day = r.day): number {
  let d = PORTS[p].danger;
  for (const n of r.news) if (n.port === p && day >= n.start && day < n.end) d += n.danger;
  return Math.max(0.03, d);
}

// ---------- New run ----------

export function newRun(seed: string, startPort = 0, ship = 'sloop'): RunState {
  const s = shipById(ship);
  const r: RunState = {
    v: 1,
    seed,
    day: 0,
    port: startPort,
    startPort,
    gold: START_GOLD + START_LOAN,
    debt: START_LOAN,
    ship: s.id,
    hull: s.hull,
    guards: 0,
    cargo: GOODS.map(() => 0),
    paid: GOODS.map(() => 0),
    bought: GOODS.map(() => 0),
    wh: PORTS.map(() => null),
    market: { ports: [] },
    known: PORTS.map(() => null),
    news: [],
    voyage: null,
    encounter: null,
    outcome: null,
    log: [],
    stats: { voyages: 0, trades: 0, profit: 0, best: 0, pirates: 0, won: 0, storms: 0 },
    loanPaid: null,
    over: null,
  };
  // A better start ship costs part of the cash.
  if (s.price > 1500) r.gold -= Math.round((s.price - 1500) * 0.25);
  const rng = rngFor(r, 'init');
  r.market = initMarket(rng, 0, r.news);
  // The merchant's almanac: rough prices for every port at the start.
  for (let p = 0; p < NP; p++) remember(r, p);
  log(r, `You take a loan of ${START_LOAN} gold in ${PORTS[startPort].name}. Repay it within 52 weeks.`);
  return r;
}

// ---------- Trading ----------

export function buy(r: RunState, g: number, q: number): number {
  if (r.voyage || q <= 0) return 0;
  const cost = buyQuote(r.market, r.port, g, q);
  if (cost > r.gold || q > cargoFree(r)) return 0;
  r.gold -= cost;
  r.cargo[g] += q;
  r.paid[g] += cost;
  r.bought[g] += q;
  r.market = applyTrade(r.market, r.port, g, q);
  r.stats.trades++;
  remember(r, r.port);
  return cost;
}

export function sell(r: RunState, g: number, q: number): { income: number; profit: number } {
  q = Math.min(q, r.cargo[g]);
  if (r.voyage || q <= 0) return { income: 0, profit: 0 };
  const income = sellQuote(r.market, r.port, g, q);
  const basis = Math.round((r.paid[g] * q) / r.cargo[g]);
  r.gold += income;
  r.paid[g] -= basis;
  r.cargo[g] -= q;
  r.bought[g] = Math.max(0, Math.min(r.bought[g], r.cargo[g]));
  if (!r.cargo[g]) r.paid[g] = 0;
  r.market = applyTrade(r.market, r.port, g, -q);
  r.stats.trades++;
  const profit = income - basis;
  r.stats.profit += profit;
  r.stats.best = Math.max(r.stats.best, profit);
  remember(r, r.port);
  return { income, profit };
}

// ---------- Harbor services ----------

export function repay(r: RunState, amount: number): number {
  const a = Math.min(Math.floor(amount), r.debt, r.gold);
  if (a <= 0) return 0;
  r.gold -= a;
  r.debt -= a;
  if (r.debt === 0 && r.loanPaid === null) {
    r.loanPaid = r.day;
    log(r, 'You repay the loan in full. The bank is happy.');
  }
  return a;
}

export function borrow(r: RunState, amount: number): number {
  if (!canBorrow(r)) return 0;
  const a = Math.min(Math.floor(amount), creditLimit(r));
  if (a <= 0) return 0;
  r.gold += a;
  r.debt += a;
  r.loanPaid = null;
  log(r, `You borrow ${a} gold.`);
  return a;
}

export function repair(r: RunState): number {
  const missing = shipOf(r).hull - r.hull;
  const pts = Math.min(missing, Math.floor(r.gold / REPAIR_COST));
  if (pts <= 0) return 0;
  r.gold -= pts * REPAIR_COST;
  r.hull += pts;
  return pts;
}

export function buyShip(r: RunState, id: string): boolean {
  const s = shipById(id);
  const cost = s.price - tradeIn(r);
  if (!PORTS[r.port].shipyard || s.id === r.ship || r.gold < cost) return false;
  if (cargoUsed(r) > s.cargo) return false;
  r.gold -= cost;
  const ratio = r.hull / shipOf(r).hull;
  r.ship = s.id;
  r.hull = Math.max(1, Math.round(s.hull * Math.max(ratio, 1)));
  r.guards = Math.min(r.guards, s.maxGuards);
  log(r, `You buy a ${s.name}.`);
  return true;
}

export function hire(r: RunState, n: number): number {
  n = Math.min(n, shipOf(r).maxGuards - r.guards, Math.floor(r.gold / GUARD_COST));
  if (n <= 0) return 0;
  r.gold -= n * GUARD_COST;
  r.guards += n;
  return n;
}

export function dismiss(r: RunState, n: number): number {
  n = Math.min(n, r.guards);
  r.guards -= n;
  return n;
}

export function buildWarehouse(r: RunState): boolean {
  if (r.wh[r.port] || r.gold < WAREHOUSE_COST) return false;
  r.gold -= WAREHOUSE_COST;
  r.wh[r.port] = GOODS.map(() => 0);
  log(r, `You rent a warehouse in ${PORTS[r.port].name}.`);
  return true;
}

export const whUsed = (w: number[] | null): number => (w ? w.reduce((a, b) => a + b, 0) : 0);

/** Move goods from the hold into the warehouse (q > 0) or back (q < 0). */
export function store(r: RunState, g: number, q: number): number {
  const w = r.wh[r.port];
  if (!w || r.voyage) return 0;
  if (q > 0) {
    q = Math.min(q, r.cargo[g], WAREHOUSE_CAP - whUsed(w));
    if (q <= 0) return 0;
    const basis = Math.round((r.paid[g] * q) / r.cargo[g]);
    r.paid[g] -= basis;
    r.cargo[g] -= q;
    r.bought[g] = Math.min(r.bought[g], r.cargo[g]);
    w[g] += q;
    return q;
  }
  const t = Math.min(-q, w[g], cargoFree(r));
  if (t <= 0) return 0;
  w[g] -= t;
  r.cargo[g] += t;
  // Stored goods come back at the port's current mid price as cost basis.
  r.paid[g] += Math.round(mid(r.market, r.port, g) * t);
  return -t;
}

// ---------- Days, weeks and news ----------

function rollNews(r: RunState, rng: Rng): void {
  const active = r.news.filter((n) => r.day < n.end);
  if (active.length >= 6) return;
  const def = rng.pick(NEWS);
  let port = -1;
  if (def.scope === 'local') {
    let cands = PORTS.map((_, i) => i);
    if (def.where?.produces) cands = cands.filter((i) => PORTS[i].produces.includes(def.where!.produces!));
    cands = cands.filter((i) => !active.some((n) => n.port === i));
    if (!cands.length) return;
    port = rng.pick(cands);
  } else if (active.some((n) => n.id === def.id)) return;
  const weeks = rng.int(def.weeks[0], def.weeks[1]);
  const n: News = {
    id: def.id,
    icon: def.icon,
    text: def.text.replace('{port}', port >= 0 ? PORTS[port].name : ''),
    port,
    goods: def.goods.map(([id, m]) => [GOODS.findIndex((g) => g.id === id), m]),
    danger: def.danger ?? 0,
    start: r.day,
    end: r.day + weeks * 7,
  };
  r.news.push(n);
  log(r, `${n.icon} ${n.text}`);
}

/** Advance the world by one day. Returns notes for the player. */
export function advanceDay(r: RunState): string[] {
  const notes: string[] = [];
  const rng = rngFor(r, 'day', r.day);
  r.market = marketDay(r.market, r.day, r.news, rng);
  r.day++;
  const oldSeason = seasonOf(r.day - 1);
  if (seasonOf(r.day) !== oldSeason) notes.push(`${SEASONS[seasonOf(r.day)].icon} ${SEASONS[seasonOf(r.day)].name} begins. ${SEASONS[seasonOf(r.day)].text}`);
  if (r.day % 7 === 0) {
    // Weekly costs.
    if (r.debt > 0) r.debt = Math.ceil(r.debt * (1 + INTEREST));
    const wages = r.guards * GUARD_WAGE;
    if (wages) {
      if (r.gold >= wages) r.gold -= wages;
      else {
        notes.push(`You cannot pay wages. ${r.guards} guards leave.`);
        r.guards = 0;
      }
    }
    const whs = r.wh.filter(Boolean).length;
    if (whs) {
      const fee = whs * WAREHOUSE_FEE;
      if (r.gold >= fee) r.gold -= fee;
      else {
        r.wh = r.wh.map(() => null);
        notes.push('You cannot pay the warehouse fees. The owners seize your goods.');
      }
    }
    const before = r.news.length;
    r.news = r.news.filter((n) => r.day < n.end);
    if (rng.chance(0.8)) rollNews(r, rng);
    if (rng.chance(0.25)) rollNews(r, rng);
    if (r.news.length > before || r.news.some((n) => n.start === r.day)) {
      const n = r.news[r.news.length - 1];
      if (n.start === r.day) notes.push(`${n.icon} ${n.text}`);
    }
    r.market = refreshMult(r.market, r.day, r.news);
    const w = week(r.day);
    if (r.debt > 0 && (w === 40 || w === 48 || w === 51)) notes.push(`⚠️ The loan is due in ${53 - w} weeks. You owe ${r.debt}.`);
  }
  if (!r.voyage) remember(r, r.port);
  return notes;
}

// ---------- Voyages ----------

export function distance(a: number, b: number): number {
  return Math.hypot(PORTS[a].x - PORTS[b].x, PORTS[a].y - PORTS[b].y);
}

export function travelDays(r: RunState, to: number, ship = shipOf(r)): number {
  const s = SEASONS[seasonOf(r.day)];
  return Math.max(2, Math.ceil((distance(r.port, to) / (55 * ship.speed)) * s.slow));
}

export function routeRisk(r: RunState, to: number): { pirate: number; storm: number; days: number } {
  const days = travelDays(r, to);
  const s = SEASONS[seasonOf(r.day)];
  const pd = ((dangerAt(r, r.port) + dangerAt(r, to)) / 2) * 0.045 * s.pirate;
  const sd = 0.014 * s.storm;
  return { days, pirate: 1 - Math.pow(1 - pd, days), storm: 1 - Math.pow(1 - sd, days) };
}

export function startVoyage(r: RunState, to: number): boolean {
  if (r.voyage || to === r.port || r.over) return false;
  const risk = routeRisk(r, to);
  r.voyage = {
    from: r.port,
    to,
    days: risk.days,
    done: 0,
    pirateP: 1 - Math.pow(1 - risk.pirate, 1 / risk.days),
    stormP: 1 - Math.pow(1 - risk.storm, 1 / risk.days),
    pirates: false,
    storm: false,
  };
  r.stats.voyages++;
  log(r, `You set sail for ${PORTS[to].name} (${risk.days} days).`);
  return true;
}

function cargoBaseValue(r: RunState): number {
  return r.cargo.reduce((a, q, g) => a + q * GOODS[g].base, 0);
}

function loseCargo(r: RunState, share: number): string {
  const lost: string[] = [];
  for (let g = 0; g < NG; g++) {
    const q = Math.floor(r.cargo[g] * share);
    if (q <= 0) continue;
    r.paid[g] -= Math.round((r.paid[g] * q) / r.cargo[g]);
    r.cargo[g] -= q;
    lost.push(`${q} ${GOODS[g].icon}`);
  }
  return lost.length ? lost.join(', ') : 'nothing';
}

function damage(r: RunState, share: number): number {
  const d = Math.max(1, Math.round(shipOf(r).hull * share));
  r.hull = Math.max(0, r.hull - d);
  return d;
}

/** One day at sea. Rolls an encounter. Returns notes; sets `r.encounter` when the player must react. */
export function voyageTick(r: RunState): string[] {
  const v = r.voyage!;
  const notes = advanceDay(r);
  v.done++;
  const rng = rngFor(r, 'sea', r.day);
  const s = SEASONS[seasonOf(r.day)];
  const ship = shipOf(r);
  if (!v.pirates && rng.chance(v.pirateP)) {
    v.pirates = true;
    const dz = (dangerAt(r, v.from) + dangerAt(r, v.to)) / 2;
    const ships = rng.int(1, 2 + Math.floor(r.day / 180));
    const strength = Math.round(2 + ships * 2.2 + rng.int(0, 4) + r.day / 70 + dz * 6);
    const pw = power(r);
    const win = Math.max(0.08, Math.min(0.94, pw / (pw + strength) + 0.08));
    const flee = Math.max(0.15, Math.min(0.9, 0.42 + (ship.speed - 1) * 0.9 - ships * 0.04));
    const tribute = Math.round(60 + cargoBaseValue(r) * 0.14 + r.gold * 0.06 + strength * 12);
    r.encounter = { kind: 'pirates', ships, strength, tribute, win, flee };
    r.stats.pirates++;
    return notes;
  }
  if (!v.storm && rng.chance(v.stormP)) {
    v.storm = true;
    r.stats.storms++;
    const d = damage(r, 0.08 + rng.next() * 0.2);
    let text = `A storm hits! The hull takes ${d} damage.`;
    if (cargoUsed(r) && rng.chance(0.5)) {
      const held = r.cargo.map((q, g) => [g, q]).filter(([, q]) => q > 0);
      const [g] = rng.pick(held);
      const q = Math.max(1, Math.floor(r.cargo[g] * (0.2 + rng.next() * 0.25)));
      r.paid[g] -= Math.round((r.paid[g] * q) / r.cargo[g]);
      r.cargo[g] -= q;
      text += ` Waves wash ${q} ${GOODS[g].icon} ${GOODS[g].name} overboard.`;
    }
    v.days++;
    text += ' The voyage takes one more day.';
    if (s.name === 'Winter') text += ' Winter storms are the worst.';
    r.encounter = { kind: 'storm', text };
    log(r, text);
    return notes;
  }
  if (rng.chance(0.035)) {
    const roll = rng.int(0, 3);
    if (roll === 0 && cargoFree(r) > 0) {
      const g = rng.int(0, 5);
      const q = Math.min(cargoFree(r), rng.int(4, 14));
      r.cargo[g] += q;
      const text = `You find floating crates: ${q} ${GOODS[g].icon} ${GOODS[g].name}.`;
      r.encounter = { kind: 'flotsam', text };
      log(r, text);
    } else if (roll === 1) {
      const p = rng.int(0, NP - 1);
      remember(r, p);
      const text = `A passing trader shares fresh prices from ${PORTS[p].name}.`;
      r.encounter = { kind: 'tip', text };
    } else if (roll === 2 && v.days - v.done > 1) {
      v.days--;
      r.encounter = { kind: 'wind', text: 'A fair wind fills the sails. You save a day.' };
    } else {
      r.encounter = { kind: 'calm', text: 'The wind dies. You drift for a day.' };
      v.days++;
    }
  }
  return notes;
}

export type Choice = 'fight' | 'flee' | 'pay';

/** Resolve a pirate encounter. Returns the result text. */
export function resolvePirates(r: RunState, choice: Choice): string {
  const e = r.encounter;
  if (!e || e.kind !== 'pirates') return '';
  const rng = rngFor(r, 'fight', r.day, choice);
  let text = '';
  if (choice === 'pay') {
    if (r.gold >= e.tribute) {
      r.gold -= e.tribute;
      text = `You pay ${e.tribute} gold. The pirates let you pass.`;
    } else {
      const g = r.gold;
      r.gold = 0;
      text = `You pay all your ${g} gold. The pirates take ${loseCargo(r, 0.3)} too.`;
    }
  } else if (choice === 'flee') {
    if (rng.chance(e.flee)) text = 'You catch the wind and escape!';
    else {
      const d = damage(r, 0.12 + rng.next() * 0.12);
      text = `They catch you. They take ${loseCargo(r, 0.3)} and the hull takes ${d} damage.`;
    }
  } else {
    if (rng.chance(e.win)) {
      const loot = Math.round((80 + e.strength * 45) * (0.7 + rng.next() * 0.6));
      const d = damage(r, 0.04 + rng.next() * 0.1);
      r.gold += loot;
      r.stats.won++;
      text = `Victory! You loot ${loot} gold. The hull takes ${d} damage.`;
    } else {
      const d = damage(r, 0.22 + rng.next() * 0.22);
      const lostGuards = r.guards ? rng.int(0, Math.ceil(r.guards / 2)) : 0;
      r.guards -= lostGuards;
      const gold = Math.round(r.gold * 0.2);
      r.gold -= gold;
      text = `Defeat. They take ${loseCargo(r, 0.5)} and ${gold} gold. The hull takes ${d} damage.${lostGuards ? ` ${lostGuards} guards fall.` : ''}`;
    }
  }
  log(r, `🏴‍☠️ ${text}`);
  r.encounter = null;
  r.outcome = text;
  return text;
}

/** End the voyage if the ship has arrived. */
export function arrive(r: RunState): boolean {
  const v = r.voyage;
  if (!v || v.done < v.days || r.encounter) return false;
  r.port = v.to;
  r.voyage = null;
  r.bought = GOODS.map(() => 0);
  remember(r, r.port);
  log(r, `You arrive in ${PORTS[r.port].name}.`);
  return true;
}

// ---------- End of run ----------

export function checkEnd(r: RunState): RunState['over'] {
  if (r.over) return r.over;
  if (r.hull <= 0) r.over = { victory: false, reason: 'Your ship sinks. The sea takes everything.' };
  else if (r.day >= LOAN_DAYS && r.debt > 0)
    r.over = { victory: false, reason: `Week 52 passed with ${r.debt} gold still owed. The bank seizes your ship.` };
  else if (r.day >= RUN_DAYS) {
    const w = netWorth(r);
    r.over = w >= GOAL && r.debt === 0 ? { victory: true, reason: 'Eighteen months at sea. You retire as a Merchant Prince.' } : { victory: false, reason: `Eighteen months at sea, but you fall short of ${GOAL.toLocaleString('en')} gold.` };
  }
  return r.over;
}

/** Retire early. Only allowed with no debt. */
export function retire(r: RunState): RunState['over'] {
  if (r.debt > 0 || r.voyage) return null;
  const w = netWorth(r);
  r.over = w >= GOAL ? { victory: true, reason: 'You retire early as a Merchant Prince.' } : { victory: false, reason: `You retire as a small trader (goal ${GOAL.toLocaleString('en')}).` };
  return r.over;
}

export const renownFor = (r: RunState): number => Math.max(0, Math.floor(netWorth(r) / 2500)) + (r.over?.victory ? 10 : 0) + (r.loanPaid !== null ? 2 : 0);

// ---------- Save data ----------

export function saveRun(r: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    if (r.v !== 1 || !SHIPS.some((s) => s.id === r.ship) || r.cargo.length !== NG || !r.bought || r.market.ports.length !== NP) return null;
    return r;
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
  const base: Meta = { renown: 0, unlocked: [], runs: 0, wins: 0, best: 0 };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
  } catch {
    return base;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function startPorts(m: Meta): number[] {
  const extra = UNLOCKS.filter((u) => u.kind === 'port' && m.unlocked.includes(u.id)).map((u) => u.ref as number);
  return [...FREE_PORTS, ...extra];
}

export function startShips(m: Meta): string[] {
  const extra = UNLOCKS.filter((u) => u.kind === 'ship' && m.unlocked.includes(u.id)).map((u) => u.ref as string);
  return [...FREE_SHIPS, ...extra];
}
