/** Placement search: the enemy AI and the player bots use the same code. */
import { TEMPLATES } from './data';
import { GENS, H, N, W, countCells, cy, inZone, orient, simulate, stampCells, zoneRows, shapeDrift, parseRule, type Side, type SideCfg } from './engine';
import type { Rng } from './rng';

export interface Stamp {
  tpl: string;
  o: number;
  cells: number[];
  cost: number;
}

export interface AiCtx {
  board: Uint8Array;
  side: Side;
  templates: string[];
  budget: number;
  zoneExtra: number;
  cost: (tpl: string) => number;
  p: SideCfg;
  e: SideCfg;
  /** Core HP left: [player, enemy]. */
  coreP: number;
  coreE: number;
  /** Weight for own core safety. */
  caution: number;
  horizon: number;
}

/** Is the stamp legal: every square in the zone, empty, and not used yet. */
export function legal(board: Uint8Array, cells: number[] | null, side: Side, zoneExtra: number, used?: Set<number>): boolean {
  if (!cells) return false;
  for (const c of cells) if (board[c] || !inZone(c, side, zoneExtra) || used?.has(c)) return false;
  return true;
}

/** Random placement that spends most of the budget. */
export function randomPlacement(rng: Rng, ctx: AiCtx): Stamp[] {
  const out: Stamp[] = [];
  const used = new Set<number>();
  let left = ctx.budget;
  let fails = 0;
  const [y0, y1] = zoneRows(ctx.side, ctx.zoneExtra);
  while (left > 0 && fails < 24) {
    const opts = ctx.templates.filter((t) => ctx.cost(t) <= left);
    if (!opts.length) break;
    // Prefer bigger shapes: a lone dot rarely does anything.
    const tpl = opts.length > 1 && rng.chance(0.75) ? rng.pick(opts.filter((t) => t !== 'dot').length ? opts.filter((t) => t !== 'dot') : opts) : rng.pick(opts);
    const o = TEMPLATES[tpl].kind === 'ship' && rng.chance(0.7) ? rng.pick(forwardOrients(tpl, ctx.side)) : rng.int(0, 7);
    const shape = orient(TEMPLATES[tpl].shape, o);
    const cells = stampCells(shape, rng.int(0, W - 1), rng.int(y0, y1));
    if (!legal(ctx.board, cells, ctx.side, ctx.zoneExtra, used)) {
      fails++;
      continue;
    }
    cells!.forEach((c) => used.add(c));
    const cost = ctx.cost(tpl);
    out.push({ tpl, o, cells: cells!, cost });
    left -= cost;
  }
  return out;
}

const fwdCache = new Map<string, number[]>();

/** Orientations of a ship template that fly toward the other side's core. */
export function forwardOrients(tpl: string, side: Side): number[] {
  const key = `${tpl}${side}`;
  let out = fwdCache.get(key);
  if (!out) {
    out = [];
    for (let o = 0; o < 8; o++) {
      const [, dy] = shapeDrift(orient(TEMPLATES[tpl].shape, o), CONWAY);
      if ((side === 1 && dy < 0) || (side === 2 && dy > 0)) out.push(o);
    }
    if (!out.length) out = [0];
    fwdCache.set(key, out);
  }
  return out;
}

const CONWAY = parseRule('B3/S23');
const work = new Uint8Array(N);

/** Score of a placement from the view of ctx.side, after `horizon` generations. Higher is better. */
export function evaluate(ctx: AiCtx, stamps: Stamp[]): number {
  work.set(ctx.board);
  for (const s of stamps) for (const c of s.cells) work[c] = ctx.side;
  const r = simulate(work, ctx.horizon, ctx.p, ctx.e, ctx.coreE, ctx.coreP);
  const mine = ctx.side;
  const dealt = mine === 1 ? r.dmgE : r.dmgP;
  const taken = mine === 1 ? r.dmgP : r.dmgE;
  const oppLeft = mine === 1 ? ctx.coreE : ctx.coreP;
  const myLeft = mine === 1 ? ctx.coreP : ctx.coreE;
  let score = dealt * 10 - taken * 10 * ctx.caution;
  if (dealt >= oppLeft) score += 1000;
  if (taken >= myLeft) score -= 1000;
  // Board position: own cells count more the further forward they are; enemy cells near my core hurt.
  const b = r.board;
  for (let i = W; i < N - W; i++) {
    const o = b[i];
    if (!o) continue;
    const y = cy(i);
    const prog = o === 1 ? (H - 2 - y) / (H - 3) : (y - 1) / (H - 3);
    if (o === mine) score += 0.3 + 0.9 * prog * prog;
    else score -= (0.3 + 0.9 * prog * prog) * ctx.caution;
  }
  return score;
}

/** Tries `tries` random placements and keeps the best one. A few rounds of mutation follow. */
export function bestPlacement(rng: Rng, ctx: AiCtx, tries: number): Stamp[] {
  let best: Stamp[] = [];
  let bestScore = evaluate(ctx, best);
  for (let k = 0; k < tries; k++) {
    const cand = randomPlacement(rng, ctx);
    const s = evaluate(ctx, cand);
    if (s > bestScore) {
      best = cand;
      bestScore = s;
    }
  }
  return best;
}

export function stampsCells(stamps: Stamp[]): number[] {
  return stamps.flatMap((s) => s.cells);
}

/** Quick summary used by the preview: counts after a simulation. */
export function previewStats(board: Uint8Array, gens: number, p: SideCfg, e: SideCfg) {
  const r = simulate(board, gens, p, e);
  const [c1, c2] = countCells(r.board);
  return { dmgE: r.dmgE, dmgP: r.dmgP, clashes: r.clashes, mine: c1, theirs: c2 };
}

export const DEFAULT_HORIZON = GENS * 3;
