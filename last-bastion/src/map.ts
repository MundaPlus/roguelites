/** The map: a 7×7 grid of 3×3-cell tiles. The path is a tree of tiles that grows from the core. */
import { Rng, hash } from './rng';

export const TILE = 3;
export const GRID = 7;
export const CELLS = TILE * GRID;
export const CORE_T = 3;

export type Cell = 'void' | 'grass' | 'hill' | 'forest' | 'rock' | 'pond' | 'path' | 'ford' | 'core';

export interface PathTile {
  x: number;
  y: number;
  /** Index of the tile one step closer to the core. -1 for the core tile. */
  parent: number;
}

export interface MapState {
  tiles: PathTile[];
}

export interface Pt {
  x: number;
  y: number;
}

export interface Route {
  pts: Pt[];
  /** Distance from the start to each point. */
  cum: number[];
  total: number;
  fly: boolean;
}

export interface MapInfo {
  cells: Cell[];
  /** Tile is visible (a path tile or next to one). */
  revealed: boolean[];
  /** Ground route of leaf i is routes[2i], its flyer route is routes[2i + 1]. */
  routes: Route[];
  leaves: number[];
  spawns: Pt[];
  core: Pt;
  bounds: { x0: number; y0: number; x1: number; y1: number };
}

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];

const inGrid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GRID && y < GRID;

export const cellIdx = (cx: number, cy: number): number => cy * CELLS + cx;

export function dirTo(a: PathTile, b: PathTile): number {
  for (let d = 0; d < 4; d++) if (a.x + DX[d] === b.x && a.y + DY[d] === b.y) return d;
  return -1;
}

type Flavor = 'plain' | 'hills' | 'woods' | 'lake';

function flavor(seed: number, tx: number, ty: number): Flavor {
  const h = hash(seed, 'flavor', tx, ty) % 100;
  if (tx === CORE_T && ty === CORE_T) return 'plain';
  return h < 45 ? 'plain' : h < 65 ? 'hills' : h < 85 ? 'woods' : 'lake';
}

function landCell(seed: number, cx: number, cy: number): Cell {
  const f = flavor(seed, Math.floor(cx / TILE), Math.floor(cy / TILE));
  const h = (hash(seed, 'cell', cx, cy) % 1000) / 1000;
  const table: Record<Flavor, [number, number, number, number]> = {
    // hill, forest, rock, pond (cumulative)
    plain: [0.08, 0.16, 0.2, 0.22],
    hills: [0.45, 0.5, 0.6, 0.6],
    woods: [0.05, 0.45, 0.48, 0.5],
    lake: [0.05, 0.12, 0.12, 0.42],
  };
  const t = table[f];
  if (h < t[0]) return 'hill';
  if (h < t[1]) return 'forest';
  if (h < t[2]) return 'rock';
  if (h < t[3]) return 'pond';
  return 'grass';
}

export function isFord(seed: number, map: MapState, i: number): boolean {
  if (i < 3) return false;
  const t = map.tiles[i];
  return hash(seed, 'ford', t.x, t.y) % 100 < 18;
}

/** Direction of the open end of a leaf tile (away from its parent). */
function farDir(map: MapState, i: number): number {
  const t = map.tiles[i];
  const p = map.tiles[t.parent];
  return (dirTo(t, p) + 2) % 4;
}

export function newMap(seed: number): MapState {
  const map: MapState = { tiles: [{ x: CORE_T, y: CORE_T, parent: -1 }] };
  const rng = new Rng(hash(seed, 'start'));
  let d = rng.int(0, 3);
  for (let k = 0; k < 3; k++) {
    const last = map.tiles[map.tiles.length - 1];
    if (k === 2 && rng.chance(0.6)) d = (d + (rng.chance(0.5) ? 1 : 3)) % 4;
    map.tiles.push({ x: last.x + DX[d], y: last.y + DY[d], parent: map.tiles.length - 1 });
  }
  return map;
}

export function buildInfo(seed: number, map: MapState): MapInfo {
  const cells: Cell[] = new Array(CELLS * CELLS).fill('void');
  const tileAt = new Map<number, number>();
  map.tiles.forEach((t, i) => tileAt.set(t.y * GRID + t.x, i));
  const revealed: boolean[] = new Array(GRID * GRID).fill(false);
  for (const t of map.tiles)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (inGrid(t.x + dx, t.y + dy)) revealed[(t.y + dy) * GRID + t.x + dx] = true;
  for (let ty = 0; ty < GRID; ty++)
    for (let tx = 0; tx < GRID; tx++) {
      if (!revealed[ty * GRID + tx]) continue;
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) cells[cellIdx(tx * TILE + x, ty * TILE + y)] = landCell(seed, tx * TILE + x, ty * TILE + y);
    }
  const children: number[][] = map.tiles.map(() => []);
  map.tiles.forEach((t, i) => {
    if (t.parent >= 0) children[t.parent].push(i);
  });
  const leaves: number[] = [];
  map.tiles.forEach((t, i) => {
    const ford = isFord(seed, map, i);
    const pc: Cell = ford ? 'ford' : 'path';
    const cx = t.x * TILE + 1;
    const cy = t.y * TILE + 1;
    cells[cellIdx(cx, cy)] = i === 0 ? 'core' : pc;
    const dirs: number[] = children[i].map((c) => dirTo(t, map.tiles[c]));
    if (t.parent >= 0) dirs.push(dirTo(t, map.tiles[t.parent]));
    if (i > 0 && children[i].length === 0) {
      leaves.push(i);
      dirs.push(farDir(map, i));
    }
    for (const d of dirs) cells[cellIdx(cx + DX[d], cy + DY[d])] = pc;
  });
  const center = (i: number): Pt => ({ x: map.tiles[i].x * TILE + 1.5, y: map.tiles[i].y * TILE + 1.5 });
  const core = center(0);
  const routes: Route[] = [];
  const spawns: Pt[] = [];
  for (const leaf of leaves) {
    const fd = farDir(map, leaf);
    const c = center(leaf);
    const sp = { x: c.x + DX[fd] * 1.5, y: c.y + DY[fd] * 1.5 };
    spawns.push(sp);
    const pts: Pt[] = [sp];
    for (let i = leaf; i >= 0; i = map.tiles[i].parent) pts.push(center(i));
    routes.push(makeRoute(pts, false), makeRoute([sp, core], true));
  }
  let x0 = GRID;
  let y0 = GRID;
  let x1 = 0;
  let y1 = 0;
  for (let ty = 0; ty < GRID; ty++)
    for (let tx = 0; tx < GRID; tx++)
      if (revealed[ty * GRID + tx]) {
        x0 = Math.min(x0, tx);
        y0 = Math.min(y0, ty);
        x1 = Math.max(x1, tx + 1);
        y1 = Math.max(y1, ty + 1);
      }
  return { cells, revealed, routes, leaves, spawns, core, bounds: { x0: x0 * TILE, y0: y0 * TILE, x1: x1 * TILE, y1: y1 * TILE } };
}

function makeRoute(pts: Pt[], fly: boolean): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return { pts, cum, total: cum[cum.length - 1], fly };
}

/** Position at distance d along the route. `seg` is a search hint, returned updated. */
export function posAt(r: Route, d: number, seg = 0): { x: number; y: number; seg: number } {
  let s = Math.max(0, Math.min(seg, r.pts.length - 2));
  while (s < r.pts.length - 2 && r.cum[s + 1] < d) s++;
  while (s > 0 && r.cum[s] > d) s--;
  const a = r.pts[s];
  const b = r.pts[s + 1];
  const len = r.cum[s + 1] - r.cum[s] || 1;
  const k = Math.max(0, Math.min(1, (d - r.cum[s]) / len));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, seg: s };
}

export const cellAt = (info: MapInfo, x: number, y: number): Cell => {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= CELLS || cy >= CELLS) return 'void';
  return info.cells[cellIdx(cx, cy)];
};

export const buildable = (c: Cell): boolean => c === 'grass' || c === 'hill';

/**
 * Add one path tile. Most waves extend a leaf. Waves 5, 15, 25... start a new branch.
 * `towersIn(tx, ty)` counts towers in a tile, so the path avoids them when it can.
 * Returns the new tile index, or -1 when the map is full.
 */
export function growMap(seed: number, map: MapState, wave: number, towersIn: (tx: number, ty: number) => number): number {
  const rng = new Rng(hash(seed, 'grow', wave));
  const occ = new Set(map.tiles.map((t) => t.y * GRID + t.x));
  const children = map.tiles.map(() => 0);
  map.tiles.forEach((t) => {
    if (t.parent >= 0) children[t.parent]++;
  });
  const isLeaf = (i: number): boolean => i > 0 && children[i] === 0;
  const split = wave % 10 === 5;
  const options = (pick: (i: number) => boolean): { from: number; x: number; y: number; score: number }[] => {
    const out: { from: number; x: number; y: number; score: number }[] = [];
    map.tiles.forEach((t, i) => {
      if (!pick(i)) return;
      for (let d = 0; d < 4; d++) {
        const x = t.x + DX[d];
        const y = t.y + DY[d];
        if (!inGrid(x, y) || occ.has(y * GRID + x)) continue;
        // A leaf needs a free cell on its far side for the spawn stub to look right; count neighbours.
        let near = 0;
        for (let k = 0; k < 4; k++) if (occ.has((y + DY[k]) * GRID + x + DX[k])) near++;
        out.push({ from: i, x, y, score: towersIn(x, y) * 3 + near + rng.next() * 1.5 });
      }
    });
    return out;
  };
  let opts = split ? options((i) => !isLeaf(i) && i > 0) : options(isLeaf);
  if (!opts.length) opts = options(() => true);
  if (!opts.length) return -1;
  opts.sort((a, b) => a.score - b.score);
  const o = opts[0];
  map.tiles.push({ x: o.x, y: o.y, parent: o.from });
  return map.tiles.length - 1;
}
