/** Track generation from tile pieces on a grid, and track geometry queries. */
import { THEMES, type Surface, type ThemeId } from './data';
import { Rng } from './rng';

/** Tile size in world units. */
export const T = 200;
/** Half the road width. */
export const HALF = 60;
/** Distance from the center line to the barrier. */
export const EDGE = 86;
/** Radius of the center line in curve tiles. */
export const RAD = T / 2;

export type Feature = 'none' | 'jump' | 'boost';

export interface Tile {
  gx: number;
  gy: number;
  /** Travel direction into the tile. */
  dx: number;
  dy: number;
  /** Travel direction out of the tile. */
  ox: number;
  oy: number;
  /** 0 straight, 1 left turn, -1 right turn (screen coordinates). */
  turn: number;
  /** Curve center (corner of the tile) for curves. */
  cx: number;
  cy: number;
  a0: number;
  sweep: number;
  len: number;
  surface: Surface;
  feature: Feature;
}

export interface Decor {
  x: number;
  y: number;
  icon: string;
  size: number;
}

export interface Track {
  seed: number;
  theme: ThemeId;
  tiles: Tile[];
  gw: number;
  gh: number;
  /** Tile index per grid cell, -1 for no track. */
  grid: Int16Array;
  decor: Decor[];
  /** Total center line length. */
  length: number;
}

const key = (x: number, y: number): string => `${x},${y}`;

/** Boundary loop of a set of cells, or null if it is not one simple loop. */
function boundary(cells: Set<string>): [number, number][] | null {
  const adj = new Map<string, string[]>();
  let edges = 0;
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
    edges++;
  };
  for (const c of cells) {
    const [x, y] = c.split(',').map(Number);
    if (!cells.has(key(x, y - 1))) addEdge(key(x, y), key(x + 1, y));
    if (!cells.has(key(x, y + 1))) addEdge(key(x, y + 1), key(x + 1, y + 1));
    if (!cells.has(key(x - 1, y))) addEdge(key(x, y), key(x, y + 1));
    if (!cells.has(key(x + 1, y))) addEdge(key(x + 1, y), key(x + 1, y + 1));
  }
  for (const n of adj.values()) if (n.length !== 2) return null;
  const start = adj.keys().next().value as string;
  const loop: [number, number][] = [];
  let prev = '';
  let cur = start;
  do {
    const [x, y] = cur.split(',').map(Number);
    loop.push([x, y]);
    const n = adj.get(cur)!;
    const next = n[0] !== prev ? n[0] : n[1];
    prev = cur;
    cur = next;
    if (loop.length > edges + 1) return null;
  } while (cur !== start);
  return loop.length === edges ? loop : null;
}

/** Random polyomino without holes or pinch points. Its boundary is the track. */
function polyLoop(rng: Rng, cw: number, ch: number, target: number): [number, number][] {
  for (let attempt = 0; attempt < 50; attempt++) {
    const cells = new Set<string>([key(rng.int(0, cw - 1), rng.int(0, ch - 1))]);
    let guard = 0;
    while (cells.size < target && guard++ < 400) {
      const cand: string[] = [];
      for (const c of cells) {
        const [x, y] = c.split(',').map(Number);
        for (const [nx, ny] of [
          [x + 1, y],
          [x - 1, y],
          [x, y + 1],
          [x, y - 1],
        ]) {
          if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && !cells.has(key(nx, ny))) cand.push(key(nx, ny));
        }
      }
      if (!cand.length) break;
      rng.shuffle(cand);
      let added = false;
      for (const c of cand) {
        cells.add(c);
        if (boundary(cells)) {
          added = true;
          break;
        }
        cells.delete(c);
      }
      if (!added) break;
    }
    const loop = boundary(cells);
    if (loop && cells.size >= Math.min(target, 4)) return loop;
  }
  return [
    [0, 0],
    [1, 0],
    [2, 0],
    [2, 1],
    [2, 2],
    [1, 2],
    [0, 2],
    [0, 1],
  ];
}

export function makeTile(gx: number, gy: number, dx: number, dy: number, ox: number, oy: number): Tile {
  const cross = dx * oy - dy * ox;
  const turn = cross === 0 ? 0 : cross < 0 ? 1 : -1;
  const mx = (gx + 0.5) * T;
  const my = (gy + 0.5) * T;
  const t: Tile = { gx, gy, dx, dy, ox, oy, turn, cx: mx, cy: my, a0: 0, sweep: 0, len: T, surface: 'asphalt', feature: 'none' };
  if (turn !== 0) {
    t.cx = mx + (-dx + ox) * (T / 2);
    t.cy = my + (-dy + oy) * (T / 2);
    const ex = mx - (dx * T) / 2;
    const ey = my - (dy * T) / 2;
    const xx = mx + (ox * T) / 2;
    const xy = my + (oy * T) / 2;
    t.a0 = Math.atan2(ey - t.cy, ex - t.cx);
    t.sweep = normAngle(Math.atan2(xy - t.cy, xx - t.cx) - t.a0);
    t.len = (Math.PI / 2) * RAD;
  }
  return t;
}

export function normAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Build a track. `size` 0..2 makes the grid bigger. */
export function genTrack(seed: number, theme: ThemeId, size: number): Track {
  const rng = new Rng(seed);
  const cw = 3 + Math.min(1, size) + rng.int(0, 1);
  const ch = 3 + (size >= 2 && rng.chance(0.5) ? 1 : 0);
  const target = Math.round(cw * ch * (0.45 + rng.next() * 0.25));
  let loop = polyLoop(rng, cw, ch, target);
  if (rng.chance(0.5)) loop = loop.reverse();
  // Scale by 2 and add the midpoints, so every side has straight pieces.
  const pts: [number, number][] = [];
  for (let i = 0; i < loop.length; i++) {
    const [x, y] = loop[i];
    const [nx, ny] = loop[(i + 1) % loop.length];
    pts.push([x * 2 + 1, y * 2 + 1]);
    pts.push([x + nx + 1, y + ny + 1]);
  }
  const n = pts.length;
  const dirIn = (i: number): [number, number] => {
    const [x, y] = pts[i];
    const [px, py] = pts[(i - 1 + n) % n];
    return [x - px, y - py];
  };
  const isStraight = (i: number): boolean => {
    const a = dirIn(i);
    const b = dirIn((i + 1) % n);
    return a[0] === b[0] && a[1] === b[1];
  };
  // Start on a straight with a straight before it.
  let start = -1;
  const order = rng.shuffle([...Array(n).keys()]);
  for (const i of order) if (isStraight(i) && isStraight((i - 1 + n) % n)) start = i;
  if (start < 0) for (const i of order) if (isStraight((i - 1 + n) % n)) start = i;
  if (start < 0) start = 0;
  const path = [...pts.slice(start), ...pts.slice(0, start)];
  const gw = cw * 2 + 3;
  const gh = ch * 2 + 3;
  const tiles: Tile[] = path.map(([x, y], i) => {
    const [px, py] = path[(i - 1 + n) % n];
    const [nx, ny] = path[(i + 1) % n];
    return makeTile(x, y, x - px, y - py, nx - x, ny - y);
  });
  // Surfaces in runs. The start area stays asphalt.
  const mix = THEMES[theme].mix;
  let i = 3;
  while (i < n - 2) {
    const s = rng.weighted<Surface>([
      ['asphalt', mix[0]],
      ['dirt', mix[1]],
      ['ice', mix[2]],
    ]);
    const len = rng.int(3, 7);
    for (let j = i; j < Math.min(n - 2, i + len); j++) tiles[j].surface = s;
    i += len;
  }
  // Jumps and boost pads on straight pieces away from the start.
  const straights = rng.shuffle(tiles.map((t, idx) => (t.turn === 0 && idx > 3 && idx < n - 3 ? idx : -1)).filter((x) => x >= 0));
  const jumps = Math.min(straights.length, size >= 1 ? rng.int(1, 2) : rng.int(0, 1));
  let used = 0;
  for (const idx of straights) {
    if (used >= jumps) break;
    if (tiles[idx - 1].turn === 0 || tiles[idx + 1].turn === 0) {
      tiles[idx].feature = 'jump';
      used++;
    }
  }
  const boosts = rng.int(1, 2);
  for (const idx of straights.filter((x) => tiles[x].feature === 'none').slice(0, boosts)) tiles[idx].feature = 'boost';
  const grid = new Int16Array(gw * gh).fill(-1);
  tiles.forEach((t, idx) => (grid[t.gy * gw + t.gx] = idx));
  // Decor on empty cells.
  const decor: Decor[] = [];
  const icons = THEMES[theme].decor;
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      if (grid[y * gw + x] >= 0) continue;
      const k = rng.int(0, 2);
      for (let j = 0; j < k; j++) decor.push({ x: (x + 0.15 + rng.next() * 0.7) * T, y: (y + 0.15 + rng.next() * 0.7) * T, icon: rng.pick(icons), size: 26 + rng.int(0, 22) });
    }
  const length = tiles.reduce((a, t) => a + t.len, 0);
  return { seed, theme, tiles, gw, gh, grid, decor, length };
}

export function tileAt(tr: Track, x: number, y: number): number {
  const gx = Math.floor(x / T);
  const gy = Math.floor(y / T);
  if (gx < 0 || gy < 0 || gx >= tr.gw || gy >= tr.gh) return -1;
  return tr.grid[gy * tr.gw + gx];
}

export interface Local {
  /** Progress through the tile, 0..1. */
  s: number;
  /** Offset from the center line, positive to the left of travel. */
  lat: number;
  dist: number;
  /** Unit vector from the center line toward the point. */
  nx: number;
  ny: number;
}

export function local(t: Tile, x: number, y: number): Local {
  if (t.turn === 0) {
    const mx = (t.gx + 0.5) * T;
    const my = (t.gy + 0.5) * T;
    const s = ((x - mx) * t.dx + (y - my) * t.dy) / T + 0.5;
    const lx = t.dy;
    const ly = -t.dx;
    const lat = (x - mx) * lx + (y - my) * ly;
    const sg = lat >= 0 ? 1 : -1;
    return { s: Math.max(0, Math.min(1, s)), lat, dist: Math.abs(lat), nx: lx * sg, ny: ly * sg };
  }
  const vx = x - t.cx;
  const vy = y - t.cy;
  const r = Math.hypot(vx, vy) || 0.001;
  const s = normAngle(Math.atan2(vy, vx) - t.a0) / t.sweep;
  const out = r - RAD;
  const sg = out >= 0 ? 1 : -1;
  return { s: Math.max(0, Math.min(1, s)), lat: t.turn > 0 ? -out : out, dist: Math.abs(out), nx: (vx / r) * sg, ny: (vy / r) * sg };
}

/** World point at progress s with a left offset, plus the travel heading. */
export function pointAt(t: Tile, s: number, lat: number): { x: number; y: number; dir: number } {
  if (t.turn === 0) {
    const mx = (t.gx + 0.5) * T;
    const my = (t.gy + 0.5) * T;
    return { x: mx + t.dx * (s - 0.5) * T + t.dy * lat, y: my + t.dy * (s - 0.5) * T - t.dx * lat, dir: Math.atan2(t.dy, t.dx) };
  }
  const a = t.a0 + t.sweep * s;
  const r = t.turn > 0 ? RAD - lat : RAD + lat;
  const sg = t.sweep > 0 ? 1 : -1;
  return { x: t.cx + Math.cos(a) * r, y: t.cy + Math.sin(a) * r, dir: Math.atan2(Math.cos(a) * sg, -Math.sin(a) * sg) };
}

/** Racing line offset: outside before a curve, inside in the curve. */
export function lineOffset(tr: Track, k: number, s: number): number {
  const n = tr.tiles.length;
  const t = tr.tiles[k];
  if (t.turn !== 0) return t.turn * HALF * 0.55 * Math.sin(Math.PI * s);
  const prev = tr.tiles[(k - 1 + n) % n];
  const next = tr.tiles[(k + 1) % n];
  let off = 0;
  if (next.turn !== 0) off -= next.turn * HALF * 0.35 * s;
  if (prev.turn !== 0) off -= prev.turn * HALF * 0.35 * (1 - s);
  return off;
}

/** Move forward along the track by a distance. */
export function advance(tr: Track, k: number, s: number, d: number): { k: number; s: number } {
  const n = tr.tiles.length;
  let rem = d;
  let kk = k;
  let ss = s;
  for (let guard = 0; guard < 50; guard++) {
    const len = tr.tiles[kk].len;
    const left = (1 - ss) * len;
    if (rem <= left) return { k: kk, s: ss + rem / len };
    rem -= left;
    kk = (kk + 1) % n;
    ss = 0;
  }
  return { k: kk, s: ss };
}
