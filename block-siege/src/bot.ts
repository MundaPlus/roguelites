/** Placement bot for tests and the balance sim. Tries every rotation and column, then scores the grid. */
import type { Rng } from './rng';
import { H, W, apply, hold, lock, stepDown, type Input, type Well } from './well';

export interface Plan {
  inputs: Input[];
  score: number;
}

function lightClone(w: Well): Well {
  return {
    ...w,
    grid: w.grid.slice(),
    cur: w.cur ? { ...w.cur } : null,
    hold: w.hold.slice(),
    queue: w.queue.slice(),
    pile: w.pile.slice(),
  };
}

/** Grid score (higher is better). Weights from the classic "near perfect" Tetris AI. */
export function evalGrid(grid: number[], lines: number, multiBonus: number): number {
  const heights: number[] = [];
  let holes = 0;
  for (let x = 0; x < W; x++) {
    let h = 0;
    let seen = false;
    for (let y = 0; y < H; y++) {
      const v = grid[y * W + x];
      if (v && !seen) {
        seen = true;
        h = H - y;
      } else if (!v && seen) holes++;
    }
    heights.push(h);
  }
  let agg = 0;
  let bump = 0;
  let max = 0;
  for (let x = 0; x < W; x++) {
    agg += heights[x];
    max = Math.max(max, heights[x]);
    if (x > 0) bump += Math.abs(heights[x] - heights[x - 1]);
  }
  const lineScore = lines * 0.76 + (lines >= 2 ? multiBonus * lines * lines : 0);
  const danger = max > 13 ? (max - 13) * 3 : 0;
  return -0.51 * agg + lineScore - 0.36 * holes - 0.18 * bump - danger;
}

/** All distinct placements reachable by rotate, shift and hard drop. */
export function plans(w: Well, allowHold = true): Plan[] {
  const out: Plan[] = [];
  const seen = new Set<string>();
  const branches: { pre: Input[]; base: Well }[] = [{ pre: [], base: w }];
  if (allowHold && !w.holdUsed) {
    const h = lightClone(w);
    if (hold(h) && h.cur) branches.push({ pre: ['hold'], base: h });
  }
  for (const br of branches) {
    if (!br.base.cur) continue;
    for (const r of [0, 1, 2, 3]) {
      const rotIn: Input[] = r === 0 ? [] : r === 1 ? ['cw'] : r === 2 ? ['cw', 'cw'] : ['ccw'];
      const rw = lightClone(br.base);
      for (const i of rotIn) apply(rw, i);
      for (let dx = -6; dx <= 6; dx++) {
        const mw = lightClone(rw);
        const moves: Input[] = [];
        for (let k = 0; k < Math.abs(dx); k++) {
          const i: Input = dx < 0 ? 'left' : 'right';
          const px = mw.cur!.x;
          apply(mw, i);
          if (mw.cur!.x === px) break;
          moves.push(i);
        }
        const p = mw.cur!;
        const key = `${br.pre.join()}|${p.card.s}|${p.rot}|${p.x}`;
        if (seen.has(key)) continue;
        seen.add(key);
        while (stepDown(mw));
        const res = lock(mw);
        let score = evalGrid(mw.grid, res.lines, 0.15);
        if (res.specials.length) score += 0.2 * res.specials.length;
        out.push({ inputs: [...br.pre, ...rotIn, ...moves, 'hard'], score });
      }
    }
  }
  return out;
}

/** The best plan by grid score. A noise amount makes a weaker bot. */
export function bestPlan(w: Well, rng?: Rng, noise = 0): Plan | null {
  const ps = plans(w);
  if (!ps.length) return null;
  let best = ps[0];
  let bs = -Infinity;
  for (const p of ps) {
    const s = p.score + (rng && noise ? (rng.next() - 0.5) * noise : 0);
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best;
}

export function randomPlan(w: Well, rng: Rng): Plan | null {
  const ps = plans(w, false);
  return ps.length ? rng.pick(ps) : null;
}
