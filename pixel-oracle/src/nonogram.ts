/**
 * Nonogram core: clues, a line solver and puzzle generation.
 * Solver cell states: 0 unknown, 1 filled, 2 empty.
 */
import { Rng } from './rng';

export interface Clues {
  rows: number[][];
  cols: number[][];
}

/** Run lengths of a line of 0/1 values. An empty line gives [0]. */
export function lineClue(line: ArrayLike<number>): number[] {
  const out: number[] = [];
  let run = 0;
  for (let i = 0; i < line.length; i++) {
    if (line[i]) run++;
    else if (run) {
      out.push(run);
      run = 0;
    }
  }
  if (run) out.push(run);
  return out.length ? out : [0];
}

export function cluesOf(sol: ArrayLike<number>, w: number, h: number): Clues {
  const rows: number[][] = [];
  const cols: number[][] = [];
  for (let r = 0; r < h; r++) {
    const line: number[] = [];
    for (let c = 0; c < w; c++) line.push(sol[r * w + c]);
    rows.push(lineClue(line));
  }
  for (let c = 0; c < w; c++) {
    const line: number[] = [];
    for (let r = 0; r < h; r++) line.push(sol[r * w + c]);
    cols.push(lineClue(line));
  }
  return { rows, cols };
}

/** Cell indexes of line `li`. Lines 0..h-1 are rows, h..h+w-1 are columns. */
export function lineCells(li: number, w: number, h: number): number[] {
  const out: number[] = [];
  if (li < h) for (let c = 0; c < w; c++) out.push(li * w + c);
  else for (let r = 0; r < h; r++) out.push(r * w + (li - h));
  return out;
}

/**
 * Solve one line as far as logic allows.
 * Returns the new line, or null when no arrangement fits.
 */
export function solveLine(clue: number[], line: Int8Array): Int8Array | null {
  const n = line.length;
  const blocks = clue.length === 1 && clue[0] === 0 ? [] : clue;
  const k = blocks.length;
  // emptyPre[i] = number of known-empty cells before i.
  const emptyPre = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) emptyPre[i + 1] = emptyPre[i] + (line[i] === 2 ? 1 : 0);
  const canBlock = (i: number, len: number): boolean => i + len <= n && emptyPre[i + len] - emptyPre[i] === 0;
  // S[i*(k+1)+j]: cells i.. can hold blocks j..k-1.
  const W = k + 1;
  const S = new Uint8Array((n + 2) * W);
  S[n * W + k] = 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = 0; j <= k; j++) {
      let ok = line[i] !== 1 && S[(i + 1) * W + j] === 1;
      if (!ok && j < k) {
        const len = blocks[j];
        if (canBlock(i, len)) {
          const e = i + len;
          if (e === n) ok = S[n * W + j + 1] === 1;
          else ok = line[e] !== 1 && S[(e + 1) * W + j + 1] === 1;
        }
      }
      S[i * W + j] = ok ? 1 : 0;
    }
  }
  if (!S[0 * W + 0]) return null;
  const P = new Uint8Array((n + 2) * W);
  P[0] = 1;
  const canEmpty = new Uint8Array(n);
  const fillDiff = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= k; j++) {
      if (!P[i * W + j] || !S[i * W + j]) continue;
      if (line[i] !== 1 && S[(i + 1) * W + j]) {
        canEmpty[i] = 1;
        P[(i + 1) * W + j] = 1;
      }
      if (j < k) {
        const len = blocks[j];
        if (!canBlock(i, len)) continue;
        const e = i + len;
        if (e === n) {
          if (S[n * W + j + 1]) {
            fillDiff[i]++;
            fillDiff[e]--;
            P[n * W + j + 1] = 1;
          }
        } else if (line[e] !== 1 && S[(e + 1) * W + j + 1]) {
          fillDiff[i]++;
          fillDiff[e]--;
          canEmpty[e] = 1;
          P[(e + 1) * W + j + 1] = 1;
        }
      }
    }
  }
  const out = new Int8Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += fillDiff[i];
    const f = acc > 0;
    const e = canEmpty[i] === 1;
    if (f && e) out[i] = 0;
    else if (f) out[i] = 1;
    else if (e) out[i] = 2;
    else return null;
  }
  return out;
}

export interface SolveResult {
  grid: Int8Array;
  solved: boolean;
  broken: boolean;
}

/**
 * Line-by-line solver. Lines in `hidden` give no information.
 * `known` holds the start state (0 unknown, 1 filled, 2 empty).
 */
export function lineSolve(w: number, h: number, clues: Clues, known: Int8Array, hidden: number[] = []): SolveResult {
  const grid = Int8Array.from(known);
  const hid = new Set(hidden);
  const total = w + h;
  const dirty = new Uint8Array(total).fill(1);
  const cellsOf: number[][] = [];
  for (let li = 0; li < total; li++) cellsOf.push(lineCells(li, w, h));
  let changed = true;
  while (changed) {
    changed = false;
    for (let li = 0; li < total; li++) {
      if (!dirty[li] || hid.has(li)) continue;
      dirty[li] = 0;
      const cells = cellsOf[li];
      const line = new Int8Array(cells.length);
      for (let i = 0; i < cells.length; i++) line[i] = grid[cells[i]];
      const clue = li < h ? clues.rows[li] : clues.cols[li - h];
      const res = solveLine(clue, line);
      if (!res) return { grid, solved: false, broken: true };
      for (let i = 0; i < cells.length; i++) {
        if (res[i] !== line[i]) {
          grid[cells[i]] = res[i];
          changed = true;
          const idx = cells[i];
          const r = Math.floor(idx / w);
          const c = idx % w;
          dirty[r] = 1;
          dirty[h + c] = 1;
        }
      }
    }
  }
  return { grid, solved: grid.every((v) => v !== 0), broken: false };
}

/**
 * Pick given cells (shown at the start) until the puzzle is line-solvable.
 * Returns the list of given cell indexes. Empty for puzzles that need no help.
 */
export function givensFor(sol: Uint8Array, w: number, h: number, rng: Rng, hidden: number[] = [], extra = 0): number[] {
  const clues = cluesOf(sol, w, h);
  const known = new Int8Array(w * h);
  const givens: number[] = [];
  const add = (i: number): void => {
    givens.push(i);
    known[i] = sol[i] ? 1 : 2;
  };
  for (let e = 0; e < extra; e++) {
    const free = [...known.keys()].filter((i) => known[i] === 0 && sol[i]);
    if (free.length) add(rng.pick(free));
  }
  for (let guard = 0; guard < w * h; guard++) {
    const res = lineSolve(w, h, clues, known, hidden);
    if (res.solved) return givens;
    // Prefer filled cells that the solver could not find. They help more than empty cells.
    const open = [...res.grid.keys()].filter((i) => res.grid[i] === 0);
    const filled = open.filter((i) => sol[i]);
    add(rng.pick(filled.length ? filled : open));
  }
  return givens;
}

export function isLineSolvable(sol: Uint8Array, w: number, h: number, hidden: number[] = [], givens: number[] = []): boolean {
  const known = new Int8Array(w * h);
  for (const i of givens) known[i] = sol[i] ? 1 : 2;
  return lineSolve(w, h, cluesOf(sol, w, h), known, hidden).solved;
}

/**
 * Random grid that the line solver can finish with no givens.
 * Half the grids use mirror symmetry so they look like runes.
 */
export function randomGrid(rng: Rng, w: number, h: number): Uint8Array {
  let last = new Uint8Array(w * h);
  for (let tries = 0; tries < 200; tries++) {
    const g = new Uint8Array(w * h);
    const dens = 0.52 + rng.next() * 0.14;
    const mirror = rng.chance(0.5);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (mirror && c >= Math.ceil(w / 2)) g[r * w + c] = g[r * w + (w - 1 - c)];
        else g[r * w + c] = rng.chance(dens) ? 1 : 0;
      }
    }
    last = g;
    if (isLineSolvable(g, w, h)) return g;
  }
  return last;
}

/**
 * Choose up to `count` clue lines to hide. Each hidden line keeps the puzzle line-solvable.
 */
export function pickFog(sol: Uint8Array, w: number, h: number, rng: Rng, count: number, givens: number[]): number[] {
  const order = rng.shuffle([...Array(w + h).keys()]);
  const hidden: number[] = [];
  for (const li of order) {
    if (hidden.length >= count) break;
    if (isLineSolvable(sol, w, h, [...hidden, li], givens)) hidden.push(li);
  }
  return hidden;
}
