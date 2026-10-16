/** Sea map: regions, islands, rocks, ports, fishing spots, nav grid and path finding. */
import { PORTS, REGIONS, type RegionId } from './data';
import { Rng, hash } from './rng';

export const WW = 2400;
export const WH = 1800;
export const CELL = 60;
export const GW = WW / CELL;
export const GH = WH / CELL;

export interface Circle {
  x: number;
  y: number;
  r: number;
}
export interface Island extends Circle {
  port: number;
}
export interface Spot extends Circle {
  region: number;
  depth: number;
}
export interface World {
  islands: Island[];
  rocks: Circle[];
  spots: Spot[];
  /** Region index per nav cell. */
  region: Uint8Array;
  /** 1 = land or rocks in the cell (for the bot path finder). */
  block: Uint8Array;
}

const d2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + (ay - by) ** 2;

export function regionAtCell(seed: string, cx: number, cy: number): number {
  const x = cx * CELL + CELL / 2;
  const y = cy * CELL + CELL / 2;
  let best = 0;
  let bd = Infinity;
  REGIONS.forEach((r, i) => {
    const warp = ((hash(seed, 'warp', cx >> 1, cy >> 1, i) % 1000) / 1000) * 140;
    const d = Math.sqrt(d2(x, y, r.cx, r.cy)) + warp;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

export function cellOf(x: number, y: number): number {
  const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / CELL)));
  const cy = Math.max(0, Math.min(GH - 1, Math.floor(y / CELL)));
  return cy * GW + cx;
}

export function regionAt(w: World, x: number, y: number): number {
  return w.region[cellOf(x, y)];
}

export function makeWorld(seed: string): World {
  const rng = new Rng(hash(seed, 'world'));
  const region = new Uint8Array(GW * GH);
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) region[cy * GW + cx] = regionAtCell(seed, cx, cy);
  // The dock cell always belongs to the port's region.
  PORTS.forEach((p) => {
    const ri = REGIONS.findIndex((r) => r.id === p.region);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) region[cellOf(p.dx + dx * CELL, p.dy + dy * CELL)] = ri;
  });
  const islands: Island[] = PORTS.map((p, i) => ({ x: p.ix, y: p.iy, r: p.ir, port: i }));
  const docks = PORTS.map((p) => ({ x: p.dx, y: p.dy }));
  const clearOf = (x: number, y: number, r: number, gap: number): boolean =>
    x > r + 40 &&
    y > r + 40 &&
    x < WW - r - 40 &&
    y < WH - r - 40 &&
    islands.every((o) => d2(x, y, o.x, o.y) > (o.r + r + gap) ** 2) &&
    docks.every((o) => d2(x, y, o.x, o.y) > (r + 150) ** 2);
  // Extra islands.
  for (let tries = 0; islands.length < PORTS.length + 9 && tries < 400; tries++) {
    const r = rng.int(45, 105);
    const x = rng.int(100, WW - 100);
    const y = rng.int(100, WH - 100);
    if (clearOf(x, y, r, 160)) islands.push({ x, y, r, port: -1 });
  }
  // Rocks, in clusters, more in some regions.
  const rocks: Circle[] = [];
  REGIONS.forEach((reg, ri) => {
    let placed = 0;
    for (let tries = 0; placed < reg.rocks && tries < reg.rocks * 40; tries++) {
      const cx = reg.cx + rng.int(-380, 380);
      const cy = reg.cy + rng.int(-330, 330);
      const n = rng.int(1, 3);
      for (let k = 0; k < n && placed < reg.rocks; k++) {
        const r = rng.int(9, 20);
        const x = cx + rng.int(-40, 40);
        const y = cy + rng.int(-40, 40);
        if (region[cellOf(x, y)] !== ri || !clearOf(x, y, r, 30)) continue;
        if (rocks.some((o) => d2(x, y, o.x, o.y) < (o.r + r + 4) ** 2)) continue;
        rocks.push({ x, y, r });
        placed++;
      }
    }
  });
  // Fishing spots.
  const spots: Spot[] = [];
  REGIONS.forEach((reg, ri) => {
    const want = ri === 4 ? 6 : 7;
    let n = 0;
    for (let tries = 0; n < want && tries < 1500; tries++) {
      const x = reg.cx + rng.int(-480, 480);
      const y = reg.cy + rng.int(-420, 420);
      if (region[cellOf(x, y)] !== ri || !clearOf(x, y, 30, 40)) continue;
      if (rocks.some((o) => d2(x, y, o.x, o.y) < (o.r + 60) ** 2)) continue;
      if (spots.some((o) => d2(x, y, o.x, o.y) < 170 ** 2)) continue;
      const deepChance = ri >= 3 ? 0.6 : 0.3;
      let depth = rng.chance(deepChance) ? 2 : 1;
      if (ri === 4 && rng.chance(0.5)) depth = 3;
      if (n === 0) depth = 1;
      if (n === 1) depth = 2;
      if (ri === 4 && n === 2) depth = 3;
      spots.push({ x, y, r: 30, region: ri, depth });
      n++;
    }
  });
  // Blocked nav cells (with a margin for the boat).
  const block = new Uint8Array(GW * GH);
  for (let cy = 0; cy < GH; cy++)
    for (let cx = 0; cx < GW; cx++) {
      const x = cx * CELL + CELL / 2;
      const y = cy * CELL + CELL / 2;
      const hit = (o: Circle, m: number): boolean => d2(x, y, o.x, o.y) < (o.r + m) ** 2;
      if (islands.some((o) => hit(o, 34)) || rocks.some((o) => hit(o, 40))) block[cy * GW + cx] = 1;
    }
  return { islands, rocks, spots, region, block };
}

export function regionName(i: number): string {
  return REGIONS[i].name;
}

export const regionId = (i: number): RegionId => REGIONS[i].id;

/** A* over the nav grid. Returns world points (cell centers) or null. */
export function findPath(w: World, locked: (cell: number) => boolean, sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
  const start = cellOf(sx, sy);
  const goal = cellOf(tx, ty);
  const N = GW * GH;
  const g = new Float32Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const f = new Float32Array(N).fill(Infinity);
  // Binary heap of cells ordered by f.
  const heap: number[] = [start];
  const push = (c: number): void => {
    heap.push(c);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[heap[p]] <= f[heap[i]]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const gx = goal % GW;
  const gy = Math.floor(goal / GW);
  const h = (c: number): number => Math.hypot((c % GW) - gx, Math.floor(c / GW) - gy);
  g[start] = 0;
  f[start] = h(start);
  while (heap.length) {
    const c = pop();
    if (c === goal) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const cx = c % GW;
    const cy = Math.floor(c / GW);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        if (closed[n]) continue;
        if (n !== goal && locked(n)) continue;
        // Blocked cells cost a lot but stay passable, so a boat in a tight pocket still finds a way out.
        const cut = dx && dy && (w.block[cy * GW + nx] || w.block[ny * GW + cx]);
        const ng = g[c] + (dx && dy ? 1.414 : 1) + (w.block[n] && n !== goal ? 30 : 0) + (cut ? 30 : 0);
        if (ng < g[n]) {
          g[n] = ng;
          from[n] = c;
          f[n] = ng + h(n);
          push(n);
        }
      }
  }
  if (from[goal] < 0 && goal !== start) return null;
  const path: { x: number; y: number }[] = [];
  for (let c = goal; c !== start && c >= 0; c = from[c]) path.push({ x: (c % GW) * CELL + CELL / 2, y: Math.floor(c / GW) * CELL + CELL / 2 });
  path.reverse();
  if (path.length) path[path.length - 1] = { x: tx, y: ty };
  else path.push({ x: tx, y: ty });
  return path;
}
