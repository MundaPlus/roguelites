/** Bots for tests and balance sims. The smart bot scores drop spots; the weak bot drops at random. */
import type { Cell } from './data';
import { Game, pieceH, pieceW, rotCW } from './game';
import type { Rng } from './rng';

export interface Plan {
  cells: Cell[];
  left: number;
  score: number;
  top: number;
  stable: boolean;
}

const key = (cells: Cell[]): string => cells.map((c) => c.join(',')).sort().join(';');

/** All distinct rotations of the current piece. */
function rotations(cells: Cell[]): Cell[][] {
  const out: Cell[][] = [];
  const seen = new Set<string>();
  let c = cells;
  for (let i = 0; i < 4; i++) {
    const k = key(c);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
    c = rotCW(c);
  }
  return out;
}

/** Scores one drop spot. Higher is better. */
export function evaluate(g: Game, cells: Cell[], left: number): Plan | null {
  const p = g.piece!;
  const cs = p.cs;
  const y = g.landing(cells, cs, left, p.bottom);
  if (y === null) return null;
  const set = new Set(cells.map((c) => c.join(',')));
  const sup: number[] = [];
  let probes = 0;
  for (const [cx, cy] of cells) {
    if (set.has(`${cx},${cy - 1}`)) continue;
    for (const fx of [0.15, 0.5, 0.85]) {
      probes++;
      const px = left + (cx + fx) * cs;
      const py = y + cy * cs - 0.12;
      const b = g.solidAt(px, py);
      if (b) sup.push(px);
    }
  }
  const w = pieceW({ cells, cs });
  const h = pieceH({ cells, cs });
  const top = y + h;
  const comX = left + (cells.reduce((a, c) => a + c[0] + 0.5, 0) / cells.length) * cs;
  const px = g.platform.x;
  const half = g.platW / 2;
  const overhang = Math.max(0, left + w - (px + half)) + Math.max(0, px - half - left);
  let score = 0;
  let stable = false;
  if (sup.length === 0) score -= 30;
  else {
    const minS = Math.min(...sup);
    const maxS = Math.max(...sup);
    const margin = Math.min(comX - minS, maxS - comX);
    stable = margin > 0.1;
    score += 5 * (sup.length / probes) + (stable ? 4 : -14) + 1.5 * Math.min(margin, 1);
  }
  const gaps = probes - sup.length;
  score -= 3 * overhang + 0.25 * Math.abs(comX - px);
  const kind = g.kind;
  if (kind === 'race') {
    score += 0.35 * top - 0.3 * gaps - 0.6 * Math.max(0, h - w);
    // Do not build a thin spike far above the rest of the tower.
    if (top > g.height + 3.2) score -= 3;
  } else if (kind === 'hold') {
    score += -0.5 * top - 0.4 * gaps - 0.8 * Math.max(0, h - w);
  } else {
    score += -1.4 * top - 0.7 * gaps;
    if (top > g.spec.goal - 0.02) score -= 60;
  }
  return { cells, left, score, top, stable };
}

/** The smart bot's best spot for the current piece. */
export function bestPlan(g: Game): Plan | null {
  const p = g.piece;
  if (!p) return null;
  let best: Plan | null = null;
  const half = g.platW / 2 + 1;
  for (const cells of rotations(p.cells)) {
    const w = pieceW({ cells, cs: p.cs });
    for (let l = Math.round((g.platform.x - half) * 2) / 2; l + w <= g.platform.x + half + 0.01; l += 0.5) {
      if (g.hits(cells, p.cs, l, p.bottom)) continue;
      const e = evaluate(g, cells, l);
      if (e && (!best || e.score > best.score)) best = e;
    }
  }
  return best;
}

/** The weak bot: a random rotation and spot over the platform. */
export function randomPlan(g: Game, rng: Rng): Plan | null {
  const p = g.piece;
  if (!p) return null;
  const rots = rotations(p.cells);
  const cells = rng.pick(rots);
  const w = pieceW({ cells, cs: p.cs });
  const half = g.platW / 2;
  const span = Math.max(0, g.platW - w + 1);
  const left = Math.round((g.platform.x - half - 0.5 + rng.next() * span) * 2) / 2;
  return { cells, left, score: 0, top: 0, stable: false };
}

/** Which spell the smart bot casts now, if any. */
export function botSpell(g: Game, hand: string[], plan: Plan | null): string | null {
  const has = (id: string): boolean => hand.includes(id) && g.canCast(id);
  const s = g.spec;
  if (has('mend') && g.lives <= 2) return 'mend';
  if (has('ledge') && g.placed === 0) return 'ledge';
  const danger = g.gustT > 0 || g.quakeT > 0 || g.slideT > 0 || (s.curses.length > 0 && g.curseT < 1.5);
  if (has('calm') && danger && g.calmT <= 0 && g.placed > 2) return 'calm';
  if (g.piece && plan) {
    if (has('heavy') && g.placed < 2 && s.kind !== 'ceiling') return 'heavy';
    if (has('glue') && (!plan.stable || (s.kind === 'race' && g.height > s.goal * 0.5))) return 'glue';
    if (has('shrink') && s.kind === 'ceiling' && plan.top > s.goal - 0.05) return 'shrink';
  }
  if (has('vines')) {
    if (s.kind === 'race' && g.height >= s.goal * 0.55) return 'vines';
    if (s.kind === 'hold' && g.placed >= s.blocks - 1) return 'vines';
  }
  return null;
}
