/** Tile codes, line of sight, view cones and guard paths. Pure functions. */

export const FLOOR = 0;
export const WALL = 1;
export const DOOR = 2;
export const OPEN = 3;
export const LOCK = 4;
export const COVER = 5;
export const EXIT = 6;

/** Directions: 0 east, 1 south, 2 west, 3 north. */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];

export interface GridLike {
  W: number;
  H: number;
  t: number[];
  smoke: number[];
}

export const isDoor = (c: number): boolean => c === DOOR || c === LOCK || c === OPEN;
export const isClosedDoor = (c: number): boolean => c === DOOR || c === LOCK;
/** Tiles a unit can stand on (doors open when walked through). */
export const isWalk = (c: number): boolean => c === FLOOR || c === EXIT || c === OPEN || c === DOOR || c === LOCK;

export function opaque(g: GridLike, i: number): boolean {
  const c = g.t[i];
  return c === WALL || c === DOOR || c === LOCK || g.smoke[i] > 0;
}

export const cheb = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
export const dist2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;

export function dirTo(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 0 : 2;
  return dy >= 0 ? 1 : 3;
}

/**
 * Line of sight between tile centers. Walls, closed doors and smoke block it.
 * With `cover`, a target right behind a cover tile is hidden, unless the viewer is next to that cover.
 */
export function los(g: GridLike, x0: number, y0: number, x1: number, y1: number, cover: boolean): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const n = Math.max(Math.abs(dx), Math.abs(dy)) * 4;
  if (n === 0) return true;
  let last = -1;
  for (let k = 1; k < n; k++) {
    const fx = Math.floor(x0 + 0.5 + (dx * k) / n + 1e-4);
    const fy = Math.floor(y0 + 0.5 + (dy * k) / n + 1e-4);
    if ((fx === x0 && fy === y0) || (fx === x1 && fy === y1)) continue;
    const i = fy * g.W + fx;
    if (i === last) continue;
    last = i;
    if (opaque(g, i)) return false;
    if (cover && g.t[i] === 5 && cheb(fx, fy, x1, y1) === 1 && cheb(fx, fy, x0, y0) > 1) return false;
  }
  return true;
}

/** True when tile (tx,ty) lies in the 90° cone of a viewer at (x,y) facing d with range r. */
export function inConeShape(x: number, y: number, d: number, r: number, tx: number, ty: number): boolean {
  const dx = tx - x;
  const dy = ty - y;
  const fwd = dx * DX[d] + dy * DY[d];
  if (fwd <= 0) return false;
  const side = Math.abs(dx * DY[d] - dy * DX[d]);
  if (side > fwd) return false;
  return dx * dx + dy * dy <= (r + 0.5) * (r + 0.5);
}

/** Tiles where a viewer would spot an agent. Uses the cover rule. */
export function coneTiles(g: GridLike, x: number, y: number, d: number, r: number): number[] {
  const out: number[] = [];
  for (let ty = Math.max(0, y - r); ty <= Math.min(g.H - 1, y + r); ty++) {
    for (let tx = Math.max(0, x - r); tx <= Math.min(g.W - 1, x + r); tx++) {
      if (!inConeShape(x, y, d, r, tx, ty)) continue;
      const i = ty * g.W + tx;
      const c = g.t[i];
      if (c === 1 || c === 5 || c === 2 || c === 4) continue;
      if (los(g, x, y, tx, ty, true)) out.push(i);
    }
  }
  return out;
}

export function sees(g: GridLike, x: number, y: number, d: number, r: number, tx: number, ty: number): boolean {
  return inConeShape(x, y, d, r, tx, ty) && los(g, x, y, tx, ty, true);
}

/** BFS path for guards (they open doors and walk over bodies). Returns tiles after the start, or null. */
export function bfsPath(g: GridLike, from: number, to: number, solid: (i: number) => boolean): number[] | null {
  if (from === to) return [];
  const prev = new Int32Array(g.W * g.H).fill(-1);
  prev[from] = from;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    const cx = cur % g.W;
    const cy = (cur / g.W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) continue;
      const ni = ny * g.W + nx;
      if (prev[ni] !== -1) continue;
      if (ni !== to && (!isWalk(g.t[ni]) || solid(ni))) continue;
      if (ni === to && !isWalk(g.t[ni])) continue;
      prev[ni] = cur;
      if (ni === to) {
        const path: number[] = [];
        let p = to;
        while (p !== from) {
          path.push(p);
          p = prev[p];
        }
        return path.reverse();
      }
      q.push(ni);
    }
  }
  return null;
}

/** BFS distance map over walkable tiles. */
export function distMap(g: GridLike, from: number[], solid: (i: number) => boolean): Int32Array {
  const d = new Int32Array(g.W * g.H).fill(-1);
  const q: number[] = [];
  for (const f of from) {
    d[f] = 0;
    q.push(f);
  }
  for (let h = 0; h < q.length; h++) {
    const cur = q[h];
    const cx = cur % g.W;
    const cy = (cur / g.W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DX[k];
      const ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= g.W || ny >= g.H) continue;
      const ni = ny * g.W + nx;
      if (d[ni] !== -1 || !isWalk(g.t[ni]) || solid(ni)) continue;
      d[ni] = d[cur] + 1;
      q.push(ni);
    }
  }
  return d;
}
