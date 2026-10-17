/**
 * Board and life rules. Pure functions on typed arrays, so the AI can simulate many placements.
 *
 * Layout: row 0 is the enemy core, row H-1 is the player core. Cells live in rows 1..H-2.
 * Owner values: 0 empty, 1 player, 2 enemy.
 */
export const W = 16;
export const H = 14;
export const N = W * H;
/** Rows in each placement zone. */
export const ZONE = 5;
/** Generations per turn. */
export const GENS = 12;

export type Side = 1 | 2;

/** Life rule of one color. `b` and `s` are bit masks: bit n set = count n is in the set. */
export interface Rule {
  b: number;
  s: number;
}

/** Everything that decides how one color behaves in a generation. */
export interface SideCfg {
  b: number;
  s: number;
  /** Hostile neighbors needed to kill a cell of this color in a clash. */
  armor: number;
  /** Core damage per cell that reaches the enemy core. */
  dmg: number;
}

export const mask = (...ns: number[]): number => ns.reduce((m, n) => m | (1 << n), 0);

/** Parses `B3/S23`. */
export function parseRule(txt: string): Rule {
  const m = /^B(\d*)\/S(\d*)$/.exec(txt);
  if (!m) throw new Error(`bad rule ${txt}`);
  return { b: mask(...[...m[1]].map(Number)), s: mask(...[...m[2]].map(Number)) };
}

export function ruleCode(r: Rule): string {
  const list = (m: number) => [...Array(9).keys()].filter((n) => m & (1 << n)).join('');
  return `B${list(r.b)}/S${list(r.s)}`;
}

function countList(m: number): number[] {
  return [...Array(9).keys()].filter((n) => m & (1 << n));
}

/** "3", "2 or 3", "1–5", "3, 6 or 7". */
export function countWords(m: number): string {
  const ns = countList(m);
  if (!ns.length) return '';
  const parts: string[] = [];
  let i = 0;
  while (i < ns.length) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    if (j - i >= 2) parts.push(`${ns[i]}–${ns[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(ns[k]));
    i = j + 1;
  }
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

/** The rule in plain words, for the UI. */
export function ruleWords(r: Rule): { born: string; lives: string } {
  const born = r.b ? `Born on an empty square with ${countWords(r.b)} neighbors.` : 'Never born.';
  let lives: string;
  if (!r.s) lives = 'Never survives: every cell lives one generation.';
  else if ((r.s & 0x1ff) === 0x1ff) lives = 'Never dies of crowding or loneliness.';
  else lives = `Survives with ${countWords(r.s)} neighbors, else dies.`;
  return { born, lives };
}

export const idx = (x: number, y: number): number => y * W + x;
export const cx = (i: number): number => i % W;
export const cy = (i: number): number => (i / W) | 0;

/** Placement zone rows (inclusive) of a side. `extra` moves the front row toward the enemy. */
export function zoneRows(side: Side, extra = 0): [number, number] {
  return side === 1 ? [H - 1 - ZONE - extra, H - 2] : [1, ZONE + extra];
}

export function inZone(i: number, side: Side, extra = 0): boolean {
  const y = cy(i);
  const [a, b] = zoneRows(side, extra);
  return y >= a && y <= b;
}

export interface GenEvents {
  /** Squares where cells died in a clash (two colors touched). */
  clash: number[];
  /** Squares where a player cell hit the enemy core. */
  hitE: number[];
  /** Squares where an enemy cell hit the player core. */
  hitP: number[];
}

export interface StepOut {
  dmgE: number;
  dmgP: number;
  clashes: number;
}

const hostile = new Uint8Array(N);

/**
 * One generation. Reads `cur`, writes `next` (must be a different array).
 * 1. Each color counts only its own neighbors and follows its own rule.
 *    An empty square that both colors would fill stays empty (a clash).
 * 2. A cell with at least `armor` hostile neighbors dies. Both sides die at once.
 * 3. A player cell in row 1 hits the enemy core and is used up. Same for enemy cells in row H-2.
 */
export function step(cur: Uint8Array, next: Uint8Array, p: SideCfg, e: SideCfg, ev?: GenEvents): StepOut {
  next.fill(0);
  let clashes = 0;
  for (let y = 1; y < H - 1; y++) {
    const y0 = y > 1 ? y - 1 : y;
    const y1 = y < H - 2 ? y + 1 : y;
    for (let x = 0; x < W; x++) {
      let n1 = 0;
      let n2 = 0;
      const x0 = x > 0 ? x - 1 : x;
      const x1 = x < W - 1 ? x + 1 : x;
      for (let yy = y0; yy <= y1; yy++) {
        const row = yy * W;
        for (let xx = x0; xx <= x1; xx++) {
          const o = cur[row + xx];
          if (o === 1) n1++;
          else if (o === 2) n2++;
        }
      }
      const i = y * W + x;
      const o = cur[i];
      if (o === 1) {
        n1--;
        if (p.s & (1 << n1)) next[i] = 1;
      } else if (o === 2) {
        n2--;
        if (e.s & (1 << n2)) next[i] = 2;
      } else {
        const b1 = (p.b & (1 << n1)) !== 0;
        const b2 = (e.b & (1 << n2)) !== 0;
        if (b1 && b2) {
          clashes++;
          ev?.clash.push(i);
        } else if (b1) next[i] = 1;
        else if (b2) next[i] = 2;
      }
    }
  }
  // Clash pass: count hostile neighbors on the new board, then remove at once.
  hostile.fill(0);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = next[i];
      if (!o) continue;
      let h = 0;
      for (let yy = y - 1; yy <= y + 1; yy++) {
        if (yy < 1 || yy > H - 2) continue;
        for (let xx = x - 1; xx <= x + 1; xx++) {
          if (xx < 0 || xx >= W) continue;
          const q = next[yy * W + xx];
          if (q && q !== o) h++;
        }
      }
      hostile[i] = h;
    }
  }
  for (let i = W; i < N - W; i++) {
    const o = next[i];
    if (!o) continue;
    if (hostile[i] >= (o === 1 ? p.armor : e.armor)) {
      next[i] = 0;
      clashes++;
      ev?.clash.push(i);
    }
  }
  // Core hits.
  let dmgE = 0;
  let dmgP = 0;
  for (let x = 0; x < W; x++) {
    const a = W + x;
    if (next[a] === 1) {
      next[a] = 0;
      dmgE += p.dmg;
      ev?.hitE.push(a);
    }
    const b = (H - 2) * W + x;
    if (next[b] === 2) {
      next[b] = 0;
      dmgP += e.dmg;
      ev?.hitP.push(b);
    }
  }
  return { dmgE, dmgP, clashes };
}

export interface SimResult {
  dmgE: number;
  dmgP: number;
  clashes: number;
  board: Uint8Array;
  /** Gen at which the first enemy core hit happened (or -1). */
  firstHitE: number;
}

const simA = new Uint8Array(N);
const simB = new Uint8Array(N);

/** Runs `gens` generations from `start`. Returns totals and the final board (a shared buffer, copy it to keep it). */
export function simulate(start: Uint8Array, gens: number, p: SideCfg, e: SideCfg, eCoreLeft = Infinity, pCoreLeft = Infinity): SimResult {
  let a = simA;
  let b = simB;
  a.set(start);
  let dmgE = 0;
  let dmgP = 0;
  let clashes = 0;
  let firstHitE = -1;
  for (let g = 0; g < gens; g++) {
    const r = step(a, b, p, e);
    dmgE += r.dmgE;
    dmgP += r.dmgP;
    clashes += r.clashes;
    if (r.dmgE && firstHitE < 0) firstHitE = g;
    const t = a;
    a = b;
    b = t;
    if ((g + 1) % GENS === 0) {
      const [tp, te] = territory(a);
      dmgE += tp * p.dmg;
      dmgP += te * e.dmg;
    }
    if (dmgE >= eCoreLeft || dmgP >= pCoreLeft) break;
  }
  return { dmgE, dmgP, clashes, board: a, firstHitE };
}

/** Most invader hits per side and turn. */
export let INVADE_CAP = 8;
export const setInvadeCap = (n: number): void => {
  INVADE_CAP = n;
};

/** Invaders: [player cells in the enemy zone, enemy cells in the player zone]. */
export function territory(board: Uint8Array): [number, number] {
  let tp = 0;
  let te = 0;
  for (let i = W; i <= ZONE * W + W - 1; i++) if (board[i] === 1) tp++;
  for (let i = (H - 1 - ZONE) * W; i < (H - 1) * W; i++) if (board[i] === 2) te++;
  return [Math.min(tp, INVADE_CAP), Math.min(te, INVADE_CAP)];
}

export function countCells(board: Uint8Array): [number, number] {
  let c1 = 0;
  let c2 = 0;
  for (let i = 0; i < N; i++) {
    if (board[i] === 1) c1++;
    else if (board[i] === 2) c2++;
  }
  return [c1, c2];
}

// ---------- Shapes ----------

export type Shape = [number, number][];

export function parseShape(rows: string[]): Shape {
  const out: Shape = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === '#' && out.push([x, y])));
  return out;
}

function normalize(s: Shape): Shape {
  const mx = Math.min(...s.map((c) => c[0]));
  const my = Math.min(...s.map((c) => c[1]));
  return s.map(([x, y]) => [x - mx, y - my] as [number, number]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** Orientation 0..7: rotation (0..3, clockwise quarter turns) + 4 for a mirror. */
export function orient(s: Shape, o: number): Shape {
  let out = s.map(([x, y]) => [x, y] as [number, number]);
  if (o >= 4) out = out.map(([x, y]) => [-x, y]);
  for (let r = 0; r < o % 4; r++) out = out.map(([x, y]) => [-y, x]);
  return normalize(out);
}

/** Board squares of a shape stamped with its center on (x, y). Null when a square is off the board. */
export function stampCells(s: Shape, x: number, y: number): number[] | null {
  const w = Math.max(...s.map((c) => c[0])) + 1;
  const h = Math.max(...s.map((c) => c[1])) + 1;
  const ox = x - ((w - 1) >> 1);
  const oy = y - ((h - 1) >> 1);
  const out: number[] = [];
  for (const [dx, dy] of s) {
    const px = ox + dx;
    const py = oy + dy;
    if (px < 0 || px >= W || py < 1 || py > H - 2) return null;
    out.push(py * W + px);
  }
  return out;
}

/** Direction arrow of a moving shape after orientation, found by simulation (for spaceships). */
export function shapeDrift(s: Shape, rule: Rule, gens = 12): [number, number] {
  const bw = 40;
  const grid = new Set(s.map(([x, y]) => `${x + 18},${y + 18}`));
  let cur = grid;
  for (let g = 0; g < gens; g++) {
    const cnt = new Map<string, number>();
    for (const k of cur) {
      const [x, y] = k.split(',').map(Number);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= bw || ny >= bw) continue;
          const kk = `${nx},${ny}`;
          cnt.set(kk, (cnt.get(kk) ?? 0) + 1);
        }
    }
    const nx = new Set<string>();
    for (const [k, n] of cnt) {
      if (cur.has(k) ? rule.s & (1 << n) : rule.b & (1 << n)) nx.add(k);
    }
    cur = nx;
    if (!cur.size) return [0, 0];
  }
  const avg = (set: Set<string>) => {
    let sx = 0;
    let sy = 0;
    for (const k of set) {
      const [x, y] = k.split(',').map(Number);
      sx += x;
      sy += y;
    }
    return [sx / set.size, sy / set.size];
  };
  const a = avg(grid);
  const b = avg(cur);
  return [Math.round(b[0] - a[0]), Math.round(b[1] - a[1])];
}

export function boardToString(b: Uint8Array): string {
  return Array.from(b).join('');
}

export function boardFromString(s: string): Uint8Array {
  const b = new Uint8Array(N);
  for (let i = 0; i < N && i < s.length; i++) b[i] = Number(s[i]) as 0 | 1 | 2;
  return b;
}
