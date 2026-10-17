/**
 * One puzzle in play. Pure functions over a plain, saveable object.
 * Cell states: 0 unknown, 1 painted, 2 player mark (not checked), 3 known empty.
 */
import { SPELLS, type Trait } from './data';
import { cluesOf, lineCells, solveLine } from './nonogram';
import { Rng } from './rng';

export interface Puzzle {
  w: number;
  h: number;
  /** '0'/'1' per cell, row by row. */
  sol: string;
  pic: string | null;
  rows: number[][];
  cols: number[][];
  hidden: number[];
  cells: number[];
  givens: number[];
  mistakes: number;
  dmg: number;
  trait: Trait;
  ward: number;
  freePeek: number;
  solved: boolean;
}

export interface MoveResult {
  painted: number[];
  emptied: number[];
  wrong: number | null;
  dmg: number;
  manaLoss: number;
  lines: number[];
  solved: boolean;
}

const blank = (): MoveResult => ({ painted: [], emptied: [], wrong: null, dmg: 0, manaLoss: 0, lines: [], solved: false });

export function newPuzzle(sol: Uint8Array, w: number, h: number, opts: { pic: string | null; givens: number[]; hidden: number[]; dmg: number; trait: Trait; ward: number; freePeek: number }): Puzzle {
  const clues = cluesOf(sol, w, h);
  const p: Puzzle = {
    w,
    h,
    sol: Array.from(sol).join(''),
    pic: opts.pic,
    rows: clues.rows,
    cols: clues.cols,
    hidden: opts.hidden,
    cells: new Array(w * h).fill(0),
    givens: opts.givens,
    mistakes: 0,
    dmg: opts.dmg,
    trait: opts.trait,
    ward: opts.ward,
    freePeek: opts.freePeek,
    solved: false,
  };
  for (const i of opts.givens) p.cells[i] = filled(p, i) ? 1 : 3;
  checkLines(p, [...Array(w + h).keys()]);
  return p;
}

export const filled = (p: Puzzle, i: number): boolean => p.sol[i] === '1';
export const lineCount = (p: Puzzle): number => p.w + p.h;
export const cellsOfLine = (p: Puzzle, li: number): number[] => lineCells(li, p.w, p.h);
export const linesOfCell = (p: Puzzle, i: number): number[] => [Math.floor(i / p.w), p.h + (i % p.w)];

export function lineDone(p: Puzzle, li: number): boolean {
  return cellsOfLine(p, li).every((i) => !filled(p, i) || p.cells[i] === 1);
}

/** Mark the rest of finished lines as known empty and show their hidden clues. Returns newly finished lines. */
function checkLines(p: Puzzle, lines: number[]): number[] {
  const done: number[] = [];
  for (const li of new Set(lines)) {
    if (!lineDone(p, li)) continue;
    let changed = false;
    for (const i of cellsOfLine(p, li)) {
      if (p.cells[i] !== 1 && p.cells[i] !== 3) {
        p.cells[i] = 3;
        changed = true;
      }
    }
    const hid = p.hidden.indexOf(li);
    if (hid >= 0) p.hidden.splice(hid, 1);
    if (changed || hid >= 0) done.push(li);
  }
  return done;
}

function finish(p: Puzzle, res: MoveResult): MoveResult {
  const touched = [...res.painted, ...res.emptied].flatMap((i) => linesOfCell(p, i));
  res.lines = checkLines(p, touched);
  // A line finished by painting counts too, even when no cell was left to cross out.
  for (const li of new Set(res.painted.flatMap((i) => linesOfCell(p, i)))) if (lineDone(p, li) && !res.lines.includes(li)) res.lines.push(li);
  if (!p.solved && p.cells.every((v, i) => !filled(p, i) || v === 1)) {
    p.solved = true;
    for (let i = 0; i < p.cells.length; i++) if (p.cells[i] !== 1) p.cells[i] = 3;
    p.hidden = [];
    res.solved = true;
  }
  return res;
}

/** Damage for the next mistake, before Ward. */
export const mistakeDmg = (p: Puzzle): number => p.dmg + (p.trait === 'enrage' ? p.mistakes : 0);

/** Paint cells in order. Stops at the first wrong cell. */
export function paint(p: Puzzle, idxs: number[]): MoveResult {
  const res = blank();
  for (const i of idxs) {
    if (p.solved || p.cells[i] === 1 || p.cells[i] === 3) continue;
    if (filled(p, i)) {
      p.cells[i] = 1;
      res.painted.push(i);
    } else {
      p.cells[i] = 3;
      res.wrong = i;
      res.emptied.push(i);
      if (p.ward > 0) p.ward--;
      else res.dmg = mistakeDmg(p);
      p.mistakes++;
      if (p.trait === 'drain') res.manaLoss = 1;
      break;
    }
  }
  return finish(p, res);
}

/** Toggle player marks. `on` true sets marks on unknown cells, false clears marks. */
export function mark(p: Puzzle, idxs: number[], on: boolean): number[] {
  const out: number[] = [];
  for (const i of idxs) {
    if (on && p.cells[i] === 0) p.cells[i] = 2;
    else if (!on && p.cells[i] === 2) p.cells[i] = 0;
    else continue;
    out.push(i);
  }
  return out;
}

export function spellCost(p: Puzzle | null, id: string): number {
  const base = SPELLS[id].cost;
  if (id === 'peek' && p && p.freePeek > 0) return 0;
  return base + (p?.trait === 'curse' ? 1 : 0);
}

/** Set cells to their true state. */
function revealCells(p: Puzzle, idxs: number[]): MoveResult {
  const res = blank();
  for (const i of idxs) {
    if (p.cells[i] === 1 || p.cells[i] === 3) continue;
    if (filled(p, i)) {
      p.cells[i] = 1;
      res.painted.push(i);
    } else {
      p.cells[i] = 3;
      res.emptied.push(i);
    }
  }
  return finish(p, res);
}

export function castPeek(p: Puzzle, i: number): MoveResult {
  if (p.freePeek > 0) p.freePeek--;
  return revealCells(p, [i]);
}

export function castClear(p: Puzzle, li: number): MoveResult {
  return revealCells(
    p,
    cellsOfLine(p, li).filter((i) => !filled(p, i)),
  );
}

export const castReveal = (p: Puzzle, li: number): MoveResult => revealCells(p, cellsOfLine(p, li));

export const castCross = (p: Puzzle, i: number): MoveResult => revealCells(p, [...new Set(linesOfCell(p, i).flatMap((li) => cellsOfLine(p, li)))]);

/** What a careful player knows: painted cells, known empties and correct marks. */
function knownGrid(p: Puzzle): Int8Array {
  const k = new Int8Array(p.cells.length);
  p.cells.forEach((v, i) => {
    if (v === 1) k[i] = 1;
    else if (v === 3 || (v === 2 && !filled(p, i))) k[i] = 2;
  });
  return k;
}

export interface Deduction {
  line: number;
  fills: number[];
  empties: number[];
}

/** The line where logic finds the most new cells right now. Null when no visible line gives anything. */
export function bestDeduction(p: Puzzle): Deduction | null {
  const k = knownGrid(p);
  let best: Deduction | null = null;
  let bestN = 0;
  for (let li = 0; li < lineCount(p); li++) {
    if (p.hidden.includes(li)) continue;
    const cells = cellsOfLine(p, li);
    const line = Int8Array.from(cells, (i) => k[i]);
    if (!line.includes(0)) continue;
    const clue = li < p.h ? p.rows[li] : p.cols[li - p.h];
    const res = solveLine(clue, line);
    if (!res) continue;
    const fills: number[] = [];
    const empties: number[] = [];
    cells.forEach((ci, j) => {
      if (line[j] !== 0) return;
      if (res[j] === 1) fills.push(ci);
      else if (res[j] === 2) empties.push(ci);
    });
    // Unknown cells that the player already marked count less: they only need a paint check.
    const n = fills.length * 2 + empties.filter((ci) => p.cells[ci] === 0).length;
    if (n > bestN) {
      bestN = n;
      best = { line: li, fills, empties };
    }
  }
  return best;
}

/** Insight spell: apply the best deduction as true cells. */
export function castInsight(p: Puzzle): MoveResult {
  const d = bestDeduction(p);
  if (d) return revealCells(p, [...d.fills, ...d.empties]);
  const open = p.cells.map((v, i) => (v === 0 || v === 2) && filled(p, i) ? i : -1).filter((i) => i >= 0);
  return revealCells(p, open.slice(0, 1));
}

export function unknownCells(p: Puzzle): number[] {
  const out: number[] = [];
  p.cells.forEach((v, i) => {
    if (v === 0) out.push(i);
  });
  return out;
}

/** A guess: a random unknown cell. */
export function randomUnknown(p: Puzzle, rng: Rng): number | null {
  const u = unknownCells(p);
  return u.length ? rng.pick(u) : null;
}

export const progress = (p: Puzzle): number => {
  let need = 0;
  let got = 0;
  for (let i = 0; i < p.cells.length; i++) {
    if (!filled(p, i)) continue;
    need++;
    if (p.cells[i] === 1) got++;
  }
  return need ? got / need : 1;
};
