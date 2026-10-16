/**
 * Pure well logic: grid, pieces, SRS rotation with wall kicks, hold, queue,
 * gravity, lock delay, line clears, garbage and locked cells.
 * No DOM. `reduce(state, input)` returns a new state for tests.
 */
import { SHAPES, SPECIAL_IDS, type Card } from './data';
import { Rng } from './rng';

export const W = 10;
/** 20 visible rows plus 2 hidden rows on top. */
export const H = 22;
export const HIDDEN = 2;
export const MAX_RESETS = 15;

// Cell encoding: bits 0-7 colour index (0 = empty), 8-11 special, 12-13 level, bit 14 locked.
export const GARBAGE = 200;
const SPECIAL_SHIFT = 8;
const LEVEL_SHIFT = 12;
export const LOCKED = 1 << 14;

const SHAPE_INDEX: Record<string, number> = {};
export const SHAPE_BY_INDEX: string[] = [''];
for (const id of Object.keys(SHAPES)) {
  SHAPE_INDEX[id] = SHAPE_BY_INDEX.length;
  SHAPE_BY_INDEX.push(id);
}

export const cellColor = (v: number): number => v & 0xff;
export const cellSpecial = (v: number): string | null => {
  const i = (v >> SPECIAL_SHIFT) & 0xf;
  return i ? SPECIAL_IDS[i - 1] : null;
};
export const cellLevel = (v: number): number => ((v >> LEVEL_SHIFT) & 3) || 1;
export const isLocked = (v: number): boolean => (v & LOCKED) !== 0;

export function encodeCell(shape: string, special?: string, lvl = 1): number {
  let v = SHAPE_INDEX[shape] ?? GARBAGE;
  if (special) v |= (SPECIAL_IDS.indexOf(special) + 1) << SPECIAL_SHIFT;
  if (special) v |= lvl << LEVEL_SHIFT;
  return v;
}

export interface Piece {
  card: Card;
  rot: number;
  x: number;
  y: number;
}

export interface Well {
  grid: number[];
  cur: Piece | null;
  hold: Card[];
  holdCap: number;
  holdUsed: boolean;
  queue: Card[];
  pile: Card[];
  deck: Card[];
  rs: number;
  lastRot: boolean;
  lastKick: number;
  lockT: number;
  resets: number;
  fall: number;
  lowest: number;
}

export type Input = 'left' | 'right' | 'cw' | 'ccw' | 'soft' | 'hard' | 'hold';

export interface LockResult {
  /** Grid rows that were cleared (before removal). */
  rows: number[];
  lines: number;
  tspin: 'none' | 'mini' | 'full';
  specials: { id: string; lvl: number; x: number; y: number }[];
  perfect: boolean;
  /** Locked cells that broke in full rows. */
  unlocked: number;
  /** Cells of the piece that locked, for effects. */
  cells: [number, number][];
  card: Card;
}

// ---------- Geometry ----------

const rotCache = new Map<string, [number, number][]>();

/** Cells of a shape in a rotation. The cell order stays the same in every rotation. */
export function shapeCells(s: string, rot: number): [number, number][] {
  const key = `${s}/${rot}`;
  let c = rotCache.get(key);
  if (c) return c;
  const def = SHAPES[s];
  c = def.cells.map(([x, y]) => {
    let cx = x;
    let cy = y;
    for (let i = 0; i < rot; i++) [cx, cy] = [def.n - 1 - cy, cx];
    return [cx, cy] as [number, number];
  });
  rotCache.set(key, c);
  return c;
}

/** Index of the cell that carries the special block. */
export const specialIndex = (s: string): number => (SHAPES[s].cells.length > 2 ? 1 : 0);

// SRS kick tables, y up as in the guideline. Converted to y down at use.
const KICK_JLSTZ: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const KICK_I: Record<string, [number, number][]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

// ---------- State ----------

export function newWell(deck: Card[], seed: number, holdCap = 1): Well {
  const w: Well = {
    grid: new Array(W * H).fill(0),
    cur: null,
    hold: [],
    holdCap,
    holdUsed: false,
    queue: [],
    pile: [],
    deck: deck.map((c) => ({ ...c })),
    rs: seed | 0,
    lastRot: false,
    lastKick: 0,
    lockT: 0,
    resets: 0,
    fall: 0,
    lowest: 0,
  };
  fillQueue(w);
  return w;
}

export const cloneWell = (w: Well): Well => JSON.parse(JSON.stringify(w)) as Well;

export function fillQueue(w: Well, n = 6): void {
  while (w.queue.length < n) {
    if (!w.pile.length) {
      const rng = new Rng(w.rs);
      w.pile = rng.shuffle(w.deck.map((c) => ({ ...c })));
      w.rs = rng.state;
    }
    w.queue.push(w.pile.shift()!);
  }
}

export const cellAt = (w: Well, x: number, y: number): number => w.grid[y * W + x];

/** True if the piece fits. Cells above the grid (y < 0) count as free. */
export function fits(w: Well, s: string, rot: number, x: number, y: number): boolean {
  for (const [cx, cy] of shapeCells(s, rot)) {
    const gx = x + cx;
    const gy = y + cy;
    if (gx < 0 || gx >= W || gy >= H) return false;
    if (gy >= 0 && w.grid[gy * W + gx]) return false;
  }
  return true;
}

export function spawnPos(s: string): { x: number; y: number } {
  const def = SHAPES[s];
  const maxY = Math.max(...def.cells.map(([, y]) => y));
  return { x: Math.floor((W - def.n) / 2), y: HIDDEN - maxY };
}

/** Puts a card in play. Returns false if it does not fit (top-out). */
export function spawnCard(w: Well, card: Card): boolean {
  const p = spawnPos(card.s);
  w.cur = { card, rot: 0, x: p.x, y: p.y };
  w.lastRot = false;
  w.lastKick = 0;
  w.lockT = 0;
  w.resets = 0;
  w.fall = 0;
  w.lowest = p.y;
  return fits(w, card.s, 0, p.x, p.y);
}

export function spawnNext(w: Well): boolean {
  fillQueue(w);
  const card = w.queue.shift()!;
  fillQueue(w);
  w.holdUsed = false;
  return spawnCard(w, card);
}

export function grounded(w: Well): boolean {
  const p = w.cur;
  return !!p && !fits(w, p.card.s, p.rot, p.x, p.y + 1);
}

function resetLock(w: Well): void {
  if (grounded(w) && w.resets < MAX_RESETS) {
    w.lockT = 0;
    w.resets++;
  }
}

export function move(w: Well, dx: number): boolean {
  const p = w.cur;
  if (!p || !fits(w, p.card.s, p.rot, p.x + dx, p.y)) return false;
  p.x += dx;
  w.lastRot = false;
  resetLock(w);
  return true;
}

export function rotate(w: Well, dir: 1 | -1): boolean {
  const p = w.cur;
  if (!p) return false;
  const s = p.card.s;
  if (s === 'O' || s === 'dot') return false;
  const to = (p.rot + dir + 4) % 4;
  const table = s === 'I' || s === 'i5' ? KICK_I : KICK_JLSTZ;
  const kicks = table[`${p.rot}>${to}`];
  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i];
    if (fits(w, s, to, p.x + kx, p.y - ky)) {
      p.x += kx;
      p.y -= ky;
      p.rot = to;
      w.lastRot = true;
      w.lastKick = i;
      resetLock(w);
      return true;
    }
  }
  return false;
}

/** Moves the piece down one row. */
export function stepDown(w: Well): boolean {
  const p = w.cur;
  if (!p || !fits(w, p.card.s, p.rot, p.x, p.y + 1)) return false;
  p.y++;
  w.lastRot = false;
  if (p.y > w.lowest) {
    w.lowest = p.y;
    w.resets = 0;
    w.lockT = 0;
  }
  return true;
}

export function dropDistance(w: Well): number {
  const p = w.cur;
  if (!p) return 0;
  let d = 0;
  while (fits(w, p.card.s, p.rot, p.x, p.y + d + 1)) d++;
  return d;
}

/** Swaps the current piece with the hold slot. Once per piece. */
export function hold(w: Well): boolean {
  const p = w.cur;
  if (!p || w.holdUsed) return false;
  const card = p.card;
  w.hold.push(card);
  if (w.hold.length > w.holdCap) {
    const out = w.hold.shift()!;
    spawnCard(w, out);
  } else {
    spawnNext(w);
  }
  w.holdUsed = true;
  return true;
}

function filled(w: Well, x: number, y: number): boolean {
  return x < 0 || x >= W || y >= H || (y >= 0 && w.grid[y * W + x] !== 0);
}

function tspinKind(w: Well, p: Piece): 'none' | 'mini' | 'full' {
  if (p.card.s !== 'T' || !w.lastRot) return 'none';
  const c = [filled(w, p.x, p.y), filled(w, p.x + 2, p.y), filled(w, p.x + 2, p.y + 2), filled(w, p.x, p.y + 2)];
  if (c.filter(Boolean).length < 3) return 'none';
  // Corners in front of the T's point for each rotation.
  const front: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
  ];
  const [a, b] = front[p.rot];
  return (c[a] && c[b]) || w.lastKick === 4 ? 'full' : 'mini';
}

/** Writes the piece into the grid, clears full rows and returns what happened. */
export function lock(w: Well): LockResult {
  const p = w.cur!;
  const tspin = tspinKind(w, p);
  const cells = shapeCells(p.card.s, p.rot);
  const si = p.card.x ? specialIndex(p.card.s) : -1;
  const placed: [number, number][] = [];
  cells.forEach(([cx, cy], i) => {
    const gx = p.x + cx;
    const gy = p.y + cy;
    placed.push([gx, gy]);
    if (gy < 0) return;
    w.grid[gy * W + gx] = i === si ? encodeCell(p.card.s, p.card.x, p.card.l ?? 1) : encodeCell(p.card.s);
  });
  w.cur = null;
  const res = clearRows(w);
  return { ...res, tspin, cells: placed, card: p.card };
}

/** Clears full rows. Full rows with locked cells unlock instead and clear later. */
export function clearRows(w: Well): Omit<LockResult, 'tspin' | 'cells' | 'card'> {
  const rows: number[] = [];
  let unlocked = 0;
  for (let y = 0; y < H; y++) {
    let full = true;
    let locks = 0;
    for (let x = 0; x < W; x++) {
      const v = w.grid[y * W + x];
      if (!v) {
        full = false;
        break;
      }
      if (v & LOCKED) locks++;
    }
    if (!full) continue;
    if (locks) {
      for (let x = 0; x < W; x++) w.grid[y * W + x] &= ~LOCKED;
      unlocked += locks;
    } else rows.push(y);
  }
  const specials: LockResult['specials'] = [];
  const rowSet = new Set(rows);
  for (const y of rows) {
    for (let x = 0; x < W; x++) {
      const v = w.grid[y * W + x];
      const id = cellSpecial(v);
      if (id) specials.push({ id, lvl: cellLevel(v), x, y });
    }
  }
  // Bombs clear the area around them in rows that stay.
  for (const sp of specials) {
    if (sp.id !== 'bomb') continue;
    const rx = sp.lvl >= 2 ? 2 : 1;
    for (let y = sp.y - 1; y <= sp.y + 1; y++) {
      if (y < 0 || y >= H || rowSet.has(y)) continue;
      for (let x = sp.x - rx; x <= sp.x + rx; x++) if (x >= 0 && x < W) w.grid[y * W + x] = 0;
    }
  }
  if (rows.length) {
    const keep: number[][] = [];
    for (let y = 0; y < H; y++) if (!rowSet.has(y)) keep.push(w.grid.slice(y * W, y * W + W));
    const empty = rows.length;
    w.grid = [...new Array(empty * W).fill(0), ...keep.flat()];
  }
  const perfect = rows.length > 0 && w.grid.every((v) => v === 0);
  return { rows, lines: rows.length, specials, perfect, unlocked };
}

/** True if any block sits in the hidden rows. */
export const overTop = (w: Well): boolean => w.grid.slice(0, HIDDEN * W).some((v) => v !== 0);

/** Pushes garbage rows in from the bottom. Each attack has one hole column. */
export function addGarbage(w: Well, n: number, hole: number): void {
  if (n <= 0) return;
  const row = new Array(W).fill(GARBAGE);
  row[hole] = 0;
  const rows: number[] = [];
  for (let i = 0; i < n; i++) rows.push(...row);
  w.grid = [...w.grid.slice(n * W), ...rows];
  // Lift the active piece if the new rows hit it.
  const p = w.cur;
  if (p) {
    let lift = 0;
    while (!fits(w, p.card.s, p.rot, p.x, p.y - lift) && lift < H) lift++;
    p.y -= lift;
    w.lowest = Math.min(w.lowest, p.y);
  }
}

/** Locks up to n random filled cells. Returns how many were locked. */
export function lockCells(w: Well, n: number, rng: Rng): number {
  const free: number[] = [];
  for (let i = HIDDEN * W; i < w.grid.length; i++) if (w.grid[i] && !(w.grid[i] & LOCKED)) free.push(i);
  rng.shuffle(free);
  const k = Math.min(n, free.length);
  for (let i = 0; i < k; i++) w.grid[free[i]] |= LOCKED;
  return k;
}

/** Clears every row above the bottom `keep` rows. Used after a top-out. */
export function wipeTop(w: Well, keep: number): void {
  for (let i = 0; i < (H - keep) * W; i++) w.grid[i] = 0;
}

/** Gravity and lock delay. Returns a lock result when the piece locks. */
export function tick(w: Well, dt: number, rowsPerSec: number, lockDelay: number): LockResult | null {
  if (!w.cur) return null;
  w.fall += dt * rowsPerSec;
  while (w.fall >= 1) {
    w.fall -= 1;
    if (!stepDown(w)) {
      w.fall = 0;
      break;
    }
  }
  if (grounded(w)) {
    w.lockT += dt;
    if (w.lockT >= lockDelay) return lock(w);
  } else w.lockT = 0;
  return null;
}

export function hardDrop(w: Well): { res: LockResult; dist: number } {
  let dist = 0;
  while (stepDown(w)) dist++;
  return { res: lock(w), dist };
}

/** Applies one input in place. Returns a lock result for a hard drop. */
export function apply(w: Well, input: Input): LockResult | null {
  switch (input) {
    case 'left':
      move(w, -1);
      return null;
    case 'right':
      move(w, 1);
      return null;
    case 'cw':
      rotate(w, 1);
      return null;
    case 'ccw':
      rotate(w, -1);
      return null;
    case 'soft':
      stepDown(w);
      return null;
    case 'hold':
      hold(w);
      return null;
    case 'hard':
      return w.cur ? hardDrop(w).res : null;
  }
}

/** Pure form for tests: `(state, input) => state`. Spawns the next piece after a lock. */
export function reduce(w: Well, input: Input): Well {
  const n = cloneWell(w);
  if (!n.cur) spawnNext(n);
  const res = apply(n, input);
  if (res) spawnNext(n);
  return n;
}
