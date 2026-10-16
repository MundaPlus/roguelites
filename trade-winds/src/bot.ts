/** Bots for tests and balance. The smart bot plans trades from the prices the player knows. */
import { BUY_FEE, EL, GOAL, GOODS, GUARD_COST, NG, NP, PORTS, SELL_FEE, SHIPS } from './data';
import { available, midAt, normalStock, sellQuote, type Market } from './market';
import type { Rng } from './rng';
import {
  arrive,
  buy,
  buyShip,
  cargoFree,
  cargoUsed,
  checkEnd,
  hire,
  netWorth,
  repair,
  repairCost,
  repay,
  resolvePirates,
  retire,
  routeRisk,
  sell,
  shipOf,
  startVoyage,
  tradeIn,
  voyageTick,
  type Choice,
  type RunState,
} from './run';

/** Bot options. `retire: false` lets the sim measure full two-year runs. */
export const botOpts = { retire: true };

export type Action =
  | { t: 'sell'; g: number; q: number }
  | { t: 'buy'; g: number; q: number }
  | { t: 'repay'; amt: number }
  | { t: 'repair' }
  | { t: 'ship'; id: string }
  | { t: 'hire'; n: number }
  | { t: 'sail'; to: number }
  | { t: 'retire' }
  | { t: 'pirates'; c: Choice }
  | { t: 'continue' };

/** Typical mid price of a good at a port when the market is at rest. */
const typical = (p: number, g: number): number => GOODS[g].base * Math.pow(GOODS[g].stock / normalStock(p, g), EL);

/** Expected mid price at a port: the known price, faded toward the typical price with age. */
function expected(r: RunState, p: number, g: number): number {
  const k = r.known[p];
  if (!k) return typical(p, g);
  const w = Math.min(1, (r.day - k.day) / 35);
  return k.prices[g] * (1 - w) + typical(p, g) * w;
}

/** Expected sale price of the k-th unit sold at port p. */
function estSell(r: RunState, p: number, g: number, k: number): number {
  const n = normalStock(p, g);
  return expected(r, p, g) * SELL_FEE * Math.pow(n / (n + k), EL);
}

const buyUnit = (m: Market, p: number, g: number, k: number): number => midAt(g, m.ports[p].stock[g] - k, m.ports[p].mult[g]) * BUY_FEE;

interface Plan {
  to: number;
  score: number;
  buys: number[];
}

function plan(r: RunState, reserve: number): Plan {
  const here = r.port;
  const m = r.market;
  let best: Plan = { to: -1, score: -Infinity, buys: [] };
  const free0 = cargoFree(r);
  for (let d = 0; d < NP; d++) {
    if (d === here) continue;
    const risk = routeRisk(r, d);
    let held = 0;
    for (let g = 0; g < NG; g++) for (let k = 0; k < r.cargo[g]; k++) held += estSell(r, d, g, k);
    const buys = GOODS.map(() => 0);
    let gold = r.gold - reserve;
    let free = free0;
    let profit = 0;
    let value = held;
    while (free > 0) {
      let bg = -1;
      let bm = 0;
      let bc = 0;
      for (let g = 0; g < NG; g++) {
        if (buys[g] >= available(m, here, g)) continue;
        const c = buyUnit(m, here, g, buys[g]);
        if (c > gold) continue;
        const marg = estSell(r, d, g, r.cargo[g] + buys[g]) - c;
        // Ask for a margin of at least 8% to cover risk and stale prices.
        if (marg > c * 0.08 && marg > bm) {
          bm = marg;
          bg = g;
          bc = c;
        }
      }
      if (bg < 0) break;
      buys[bg]++;
      gold -= bc;
      free--;
      profit += bm;
      value += bc + bm;
    }
    const lossRisk = risk.pirate * 0.3 * value + risk.storm * 0.1 * value;
    const score = (held * 0.15 + profit - lossRisk) / (risk.days + 1);
    if (score > best.score) best = { to: d, score, buys };
  }
  return best;
}

export function pirateChoice(r: RunState, smart: boolean, rng: Rng): Choice {
  const e = r.encounter;
  if (!e || e.kind !== 'pirates') return 'flee';
  if (!smart) return rng.pick(['fight', 'flee', 'pay'] as const);
  const stake = r.gold + r.cargo.reduce((a, q, g) => a + q * GOODS[g].base, 0);
  if (e.win >= 0.62) return 'fight';
  if (e.tribute <= r.gold && e.tribute < stake * 0.15) return 'pay';
  if (e.flee >= 0.5) return 'flee';
  if (e.tribute <= r.gold && e.tribute < stake * 0.3) return 'pay';
  return e.win > e.flee ? 'fight' : 'flee';
}

/** One bot decision. */
export function botAction(r: RunState, smart: boolean, rng: Rng): Action {
  if (r.encounter) return r.encounter.kind === 'pirates' ? { t: 'pirates', c: pirateChoice(r, smart, rng) } : { t: 'continue' };
  if (r.voyage) return { t: 'continue' };
  return smart ? smartPort(r) : weakPort(r, rng);
}

function weakPort(r: RunState, rng: Rng): Action {
  for (let g = 0; g < NG; g++) if (r.cargo[g] > 0) return { t: 'sell', g, q: r.cargo[g] };
  if (r.debt > 0 && (r.gold > r.debt + 500 || r.day > 330)) return { t: 'repay', amt: r.gold };
  if (r.hull < shipOf(r).hull * 0.5 && r.gold >= 9) return { t: 'repair' };
  let to = rng.int(0, NP - 2);
  if (to >= r.port) to++;
  const g = rng.int(0, NG - 1);
  const unit = buyUnit(r.market, r.port, g, 0);
  const q = Math.min(cargoFree(r), available(r.market, r.port, g), Math.floor((r.gold * 0.6) / (unit * 1.3)));
  if (q > 0 && cargoUsed(r) === 0) return { t: 'buy', g, q };
  return { t: 'sail', to };
}

function smartPort(r: RunState): Action {
  const here = r.port;
  // 1. Sell what sells well here.
  for (let g = 0; g < NG; g++) {
    const q = r.cargo[g] - r.bought[g];
    if (q <= 0) continue;
    const now = sellQuote(r.market, here, g, q) / q;
    let elsewhere = 0;
    for (let d = 0; d < NP; d++) {
      if (d === here) continue;
      let v = 0;
      for (let k = 0; k < q; k++) v += estSell(r, d, g, k);
      const days = routeRisk(r, d).days;
      elsewhere = Math.max(elsewhere, v / q / (1 + 0.03 * days));
    }
    if (now >= elsewhere * 0.9) return { t: 'sell', g, q };
  }
  const ship = shipOf(r);
  // 2. Retire as soon as the goal is safe.
  if (botOpts.retire && r.debt === 0 && netWorth(r) >= GOAL * 1.02) return { t: 'retire' };
  // 3. Repairs and the loan.
  if (r.hull < ship.hull * 0.7 && r.gold >= repairCost(r) * 0.5 && r.gold >= 9) return { t: 'repair' };
  if (r.debt > 0 && (r.gold >= r.debt + 2500 || r.day > 300)) return { t: 'repay', amt: r.gold };
  // 4. A bigger ship at a shipyard.
  if (PORTS[here].shipyard && r.day < 520) {
    const cand = SHIPS.filter((s) => s.cargo > ship.cargo && s.id !== 'cutter' && s.price - tradeIn(r) <= r.gold - 2500 - s.cargo * 25 && cargoUsed(r) <= s.cargo).sort(
      (a, b) => b.cargo - a.cargo,
    );
    if (cand.length) return { t: 'ship', id: cand[0].id };
  }
  // 5. Guards for safer voyages.
  if (r.guards < ship.maxGuards && r.gold > 3000 + GUARD_COST && r.day < 640) return { t: 'hire', n: 1 };
  // 6. Plan the next trade and buy for it.
  const reserve = Math.min(400, Math.round(r.gold * 0.05));
  const p = plan(r, reserve);
  let bg = -1;
  for (let g = 0; g < NG; g++) if (p.buys[g] > 0 && (bg < 0 || p.buys[g] * GOODS[g].base > p.buys[bg] * GOODS[bg].base)) bg = g;
  if (bg >= 0) return { t: 'buy', g: bg, q: p.buys[bg] };
  return { t: 'sail', to: p.to >= 0 ? p.to : (here + 1) % NP };
}

/** Apply a bot action without any UI (used by the headless sim). */
export function applyAction(r: RunState, a: Action): void {
  switch (a.t) {
    case 'sell':
      sell(r, a.g, a.q);
      break;
    case 'buy':
      buy(r, a.g, a.q);
      break;
    case 'repay':
      repay(r, a.amt);
      break;
    case 'repair':
      repair(r);
      break;
    case 'ship':
      buyShip(r, a.id);
      break;
    case 'hire':
      hire(r, a.n);
      break;
    case 'sail':
      startVoyage(r, a.to);
      break;
    case 'retire':
      retire(r);
      break;
    case 'pirates':
      resolvePirates(r, a.c);
      break;
    case 'continue':
      if (r.encounter) r.encounter = null;
      else if (r.voyage) {
        if (r.voyage.done >= r.voyage.days) arrive(r);
        else voyageTick(r);
      }
      break;
  }
  r.outcome = null;
  checkEnd(r);
}
