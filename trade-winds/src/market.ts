/** Market model. `marketDay` is a pure daily update: it returns a new market and does not change its input. */
import { BUY_FEE, EL, GOODS, NG, NP, PORTS, SEASONS, SELL_FEE, seasonOf, stockFactor } from './data';
import { Rng } from './rng';

export interface PortMarket {
  /** Current stock per good (supply). */
  stock: number[];
  /** Local demand drift per good (1 = normal). */
  demand: number[];
  /** Total price multiplier per good: demand × season × news. */
  mult: number[];
  /** Mid price per good for the last HIST days, oldest first. */
  hist: number[][];
}

export interface Market {
  ports: PortMarket[];
}

/** An active news card. */
export interface News {
  id: string;
  icon: string;
  text: string;
  /** Port index, or -1 for every port. */
  port: number;
  goods: [number, number][];
  danger: number;
  start: number;
  end: number;
}

export const HIST = 84;

/** Normal stock of a good in a port. */
export const normalStock = (p: number, g: number): number => GOODS[g].stock * stockFactor(p, g);
/** Lowest stock a port sells down to. */
export const minStock = (g: number): number => Math.max(3, GOODS[g].stock * 0.12);

export function newsMult(news: readonly News[], p: number, g: number, day: number): number {
  let m = 1;
  for (const n of news) {
    if (day < n.start || day >= n.end) continue;
    if (n.port !== -1 && n.port !== p) continue;
    for (const [ng, v] of n.goods) if (ng === g) m *= v;
  }
  return m;
}

export function seasonMult(g: number, day: number): number {
  return SEASONS[seasonOf(day)].demand[GOODS[g].id] ?? 1;
}

/** Mid price for a given stock and multiplier. */
export const midAt = (g: number, stock: number, mult: number): number => GOODS[g].base * mult * Math.pow(GOODS[g].stock / Math.max(1, stock), EL);

export const mid = (m: Market, p: number, g: number): number => midAt(g, m.ports[p].stock[g], m.ports[p].mult[g]);
export const buyPrice = (m: Market, p: number, g: number): number => Math.max(1, Math.round(mid(m, p, g) * BUY_FEE));
export const sellPrice = (m: Market, p: number, g: number): number => Math.max(1, Math.round(mid(m, p, g) * SELL_FEE));

/** Units the port can still sell. */
export const available = (m: Market, p: number, g: number): number => Math.max(0, Math.floor(m.ports[p].stock[g] - minStock(g)));

/** Total cost to buy q units. Each unit moves the stock and the price. */
export function buyQuote(m: Market, p: number, g: number, q: number): number {
  const pm = m.ports[p];
  let t = 0;
  for (let i = 0; i < q; i++) t += midAt(g, pm.stock[g] - i, pm.mult[g]) * BUY_FEE;
  return Math.round(t);
}

/** Total income for selling q units. */
export function sellQuote(m: Market, p: number, g: number, q: number): number {
  const pm = m.ports[p];
  let t = 0;
  for (let i = 0; i < q; i++) t += midAt(g, pm.stock[g] + i, pm.mult[g]) * SELL_FEE;
  return Math.round(t);
}

/** Most units affordable with this gold. */
export function maxAffordable(m: Market, p: number, g: number, gold: number, cap: number): number {
  const pm = m.ports[p];
  const lim = Math.min(cap, available(m, p, g));
  let t = 0;
  let q = 0;
  while (q < lim) {
    const c = midAt(g, pm.stock[g] - q, pm.mult[g]) * BUY_FEE;
    if (t + c > gold + 0.49) break;
    t += c;
    q++;
  }
  return q;
}

/** A copy of the market with the trade applied (positive q = the port sells to you). */
export function applyTrade(m: Market, p: number, g: number, q: number): Market {
  const ports = m.ports.slice();
  const pm = ports[p];
  const stock = pm.stock.slice();
  stock[g] = stock[g] - q;
  ports[p] = { ...pm, stock };
  return { ports };
}

function multFor(demand: number, p: number, g: number, day: number, news: readonly News[]): number {
  return demand * seasonMult(g, day) * newsMult(news, p, g, day);
}

/** A new market at its normal state, with a short random history. */
export function initMarket(rng: Rng, day: number, news: readonly News[]): Market {
  const ports: PortMarket[] = [];
  for (let p = 0; p < NP; p++) {
    const stock: number[] = [];
    const demand: number[] = [];
    const mult: number[] = [];
    const hist: number[][] = [];
    for (let g = 0; g < NG; g++) {
      stock.push(normalStock(p, g) * (0.85 + rng.next() * 0.3));
      demand.push(0.92 + rng.next() * 0.16);
      mult.push(multFor(demand[g], p, g, day, news));
      hist.push([]);
    }
    ports.push({ stock, demand, mult, hist });
  }
  let m: Market = { ports };
  // Warm up 28 days so the charts start with some history.
  for (let d = day - 28; d < day; d++) m = marketDay(m, d, news, rng);
  return m;
}

/**
 * Pure daily update. Stock moves back toward normal at the port's recovery speed,
 * demand drifts back to 1 with small noise, then the multiplier and history update.
 */
export function marketDay(m: Market, day: number, news: readonly News[], rng: Rng): Market {
  const ports = m.ports.map((pm, p) => {
    const r = PORTS[p].recovery;
    const stock: number[] = [];
    const demand: number[] = [];
    const mult: number[] = [];
    const hist: number[][] = [];
    for (let g = 0; g < NG; g++) {
      const n = normalStock(p, g);
      let s = pm.stock[g] + (n - pm.stock[g]) * r;
      s *= 1 + (rng.next() - 0.5) * 0.08;
      stock.push(Math.max(minStock(g), Math.min(n * 3, s)));
      const d = 1 + (pm.demand[g] - 1) * 0.93 + (rng.next() - 0.5) * 0.05;
      demand.push(Math.max(0.75, Math.min(1.3, d)));
      mult.push(multFor(demand[g], p, g, day + 1, news));
      const h = pm.hist[g].slice(-(HIST - 1));
      h.push(Math.round(midAt(g, stock[g], mult[g])));
      hist.push(h);
    }
    return { stock, demand, mult, hist };
  });
  return { ports };
}

/** Recompute multipliers after news changes (same day, no stock change). */
export function refreshMult(m: Market, day: number, news: readonly News[]): Market {
  return {
    ports: m.ports.map((pm, p) => ({ ...pm, mult: pm.demand.map((d, g) => multFor(d, p, g, day, news)) })),
  };
}
