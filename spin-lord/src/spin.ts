/**
 * The pure spin function. It places the pool on the grid, then resolves the
 * effects in a fixed order: destroy, transform, grow, pay, expire.
 * It does not change its input.
 */
import { CELLS, GRID_H, GRID_W, ITEMS, SYMBOLS, type SymDef, type Target } from './data';
import type { Rng } from './rng';

export interface SymInst {
  uid: number;
  id: string;
  /** Spins this symbol spent on the grid since it appeared or changed. */
  n: number;
}

export interface SpinCtx {
  items: string[];
  /** 1-based number of this spin in the run. */
  spin: number;
  /** True for the first spin after a rent payment. */
  firstAfterRent: boolean;
  nextUid: number;
}

export type SpinEvent =
  | { t: 'destroy'; cell: number; by: number; coins: number }
  | { t: 'transform'; cell: number; from: string; to: string }
  | { t: 'add'; cell: number; id: string }
  | { t: 'pay'; cell: number; coins: number; mult: number }
  | { t: 'expire'; cell: number; coins: number }
  | { t: 'bonus'; text: string; coins: number };

export interface Cell {
  sym: SymInst | null;
  destroyed: boolean;
}

export interface SpinResult {
  /** The grid as placed, before any effect. */
  placed: (SymInst | null)[];
  /** The grid after all effects. */
  grid: Cell[];
  events: SpinEvent[];
  coins: number;
  /** The new pool after destroy, transform and add. */
  pool: SymInst[];
  nextUid: number;
}

export function neighbors(cell: number): number[] {
  const x = cell % GRID_W;
  const y = Math.floor(cell / GRID_W);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) out.push(ny * GRID_W + nx);
    }
  }
  return out;
}

const NB: number[][] = Array.from({ length: CELLS }, (_, i) => neighbors(i));
/** Multipliers on one cell stop at this value. */
export const MAX_MULT = 12;
const CORNERS = new Set([0, GRID_W - 1, CELLS - GRID_W, CELLS - 1]);

export function matches(def: SymDef, targets: readonly Target[]): boolean {
  for (const t of targets) {
    if (t === '*') return true;
    if (t[0] === '#' ? def.tags.includes(t.slice(1) as never) : def.id === t) return true;
  }
  return false;
}

export function growAfter(def: SymDef, items: readonly string[]): number {
  return Math.max(1, (def.grows?.after ?? 0) - (items.includes('fertilizer') ? 1 : 0));
}

export function spin(pool: readonly SymInst[], ctx: SpinCtx, rng: Rng): SpinResult {
  const items = ctx.items;
  const has = (id: string): boolean => items.includes(id);
  let nextUid = ctx.nextUid;

  // Place: at most 20 random symbols on random cells.
  const order = rng.shuffle(pool.map((s) => ({ ...s })));
  const shown = order.slice(0, CELLS);
  const hidden = order.slice(CELLS);
  const cellsOrder = rng.shuffle(Array.from({ length: CELLS }, (_, i) => i));
  const placed: (SymInst | null)[] = Array(CELLS).fill(null);
  shown.forEach((s, i) => (placed[cellsOrder[i]] = s));
  const grid: Cell[] = placed.map((s) => ({ sym: s ? { ...s, n: s.n + 1 } : null, destroyed: false }));
  const events: SpinEvent[] = [];
  const added: SymInst[] = [];
  let coins = 0;
  const def = (c: number): SymDef | null => (grid[c].sym && !grid[c].destroyed ? SYMBOLS[grid[c].sym!.id] : null);
  const appetite = has('appetite') ? 4 : 0;
  const recycle = has('recycle') ? 2 : 0;

  // 1. Destroy.
  for (let c = 0; c < CELLS; c++) {
    const d = def(c);
    if (!d?.eats) continue;
    let ate = 0;
    for (const nb of NB[c]) {
      const nd = def(nb);
      if (!nd || !matches(nd, d.eats.targets) || nd.id === d.id) continue;
      grid[nb].destroyed = true;
      const gain = d.eats.pay + appetite + recycle;
      coins += gain;
      events.push({ t: 'destroy', cell: nb, by: c, coins: gain });
      if (d.eats.adds) {
        const s = { uid: nextUid++, id: d.eats.adds, n: 0 };
        added.push(s);
        events.push({ t: 'add', cell: c, id: s.id });
      }
      ate++;
      if (d.eats.self) break;
    }
    if (ate && d.eats.self) {
      grid[c].destroyed = true;
      events.push({ t: 'destroy', cell: c, by: c, coins: 0 });
    }
  }

  // 2. Transform.
  for (let c = 0; c < CELLS; c++) {
    const d = def(c);
    if (!d?.grows) continue;
    const s = grid[c].sym!;
    if (s.n >= growAfter(d, items)) {
      events.push({ t: 'transform', cell: c, from: s.id, to: d.grows.to });
      grid[c].sym = { uid: s.uid, id: d.grows.to, n: 0 };
    }
  }

  // 3. Grow: chance to add symbols.
  for (let c = 0; c < CELLS; c++) {
    const d = def(c);
    if (!d?.lays) continue;
    if (rng.next() < d.lays.chance) {
      const s = { uid: nextUid++, id: d.lays.id, n: 0 };
      added.push(s);
      events.push({ t: 'add', cell: c, id: s.id });
    }
  }

  // 4. Pay.
  const crowns = grid.filter((_, c) => def(c)?.special === 'crown').length;
  const distinct = new Set(grid.filter((_, c) => def(c)).map((g) => g.sym!.id)).size;
  const pays: number[] = Array(CELLS).fill(0);
  const mults: number[] = Array(CELLS).fill(1);
  for (let c = 0; c < CELLS; c++) {
    const d = def(c);
    if (!d || d.special === 'mirror') continue;
    const s = grid[c].sym!;
    let base = d.value;
    if (d.expires) base = s.n >= d.expires.after && !(d.id === 'candle' && has('lantern')) ? d.expires.last : d.value;
    if (d.special === 'wine') base += Math.floor(s.n / 3);
    if (d.special === 'dice') base = has('loaded') ? rng.int(4, 6) : rng.int(1, 6);
    if (d.special === 'jackpot' && rng.next() < (has('loaded') ? 0.12 : 0.06)) base = 77;
    if (d.special === 'star') base = distinct;
    let add = 0;
    let mult = 1;
    for (const it of items) {
      const tg = ITEMS[it]?.tagAdd;
      if (tg && d.tags.includes(tg.tag)) add += tg.add;
    }
    let animalsNear = 0;
    for (const nb of NB[c]) {
      const nd = def(nb);
      if (!nd) continue;
      if (nd.tags.includes('animal')) animalsNear++;
      if (nd.boost && matches(d, nd.boost.targets)) {
        add += nd.boost.add ?? 0;
        mult *= nd.boost.mult ?? 1;
      }
    }
    if (d.perAdj) {
      const pa = d.perAdj;
      const cnt = pa.targets === 'empty' ? NB[c].filter((nb) => !def(nb)).length : NB[c].filter((nb) => def(nb) && matches(def(nb)!, pa.targets as Target[])).length;
      add += cnt * pa.pay;
    }
    if (d.special === 'peacock' && animalsNear === 0) mult *= 3;
    if (crowns && d.tags.includes('person')) mult *= 2;
    if (has('corner') && CORNERS.has(c)) mult *= 2;
    mult = Math.min(mult, MAX_MULT);
    pays[c] = (base + add) * mult;
    mults[c] = mult;
  }
  for (let c = 0; c < CELLS; c++) {
    if (def(c)?.special !== 'mirror') continue;
    let best = 0;
    for (const nb of NB[c]) if (def(nb) && def(nb)!.special !== 'mirror') best = Math.max(best, pays[nb]);
    pays[c] = best;
  }
  for (let c = 0; c < CELLS; c++) {
    if (!def(c)) continue;
    coins += pays[c];
    events.push({ t: 'pay', cell: c, coins: pays[c], mult: mults[c] });
  }
  if (has('tipjar')) {
    const empty = grid.filter((g) => !g.sym).length;
    if (empty) {
      coins += empty;
      events.push({ t: 'bonus', text: `🫙 Tip Jar: ${empty} empty cells`, coins: empty });
    }
  }

  // 5. Expire.
  for (let c = 0; c < CELLS; c++) {
    const d = def(c);
    if (!d?.expires) continue;
    if (d.id === 'candle' && has('lantern')) continue;
    if (grid[c].sym!.n >= d.expires.after) {
      grid[c].destroyed = true;
      events.push({ t: 'expire', cell: c, coins: 0 });
    }
  }

  // Global multipliers.
  let double = 0;
  if (has('fourleaf') && ctx.spin % 5 === 0) double++;
  if (has('echo') && ctx.firstAfterRent) double++;
  for (let k = 0; k < double; k++) {
    events.push({ t: 'bonus', text: '×2 spin!', coins });
    coins *= 2;
  }

  // New pool.
  const newPool: SymInst[] = [];
  for (const g of grid) if (g.sym && !g.destroyed) newPool.push(g.sym);
  newPool.push(...hidden, ...added);
  newPool.sort((a, b) => a.uid - b.uid);
  return { placed, grid, events, coins, pool: newPool, nextUid };
}
