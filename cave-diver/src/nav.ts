/** Move graph over the tile map. The level check and the bot use the same graph. */
import { LADDER, LAVA, PLAT, SPIKES, isSolid } from './data';

export interface Grid {
  w: number;
  h: number;
  tile(x: number, y: number): number;
  /** Ladder or rope. */
  climb(x: number, y: number): boolean;
}

export type EdgeKind = 'walk' | 'fall' | 'jump' | 'climb' | 'drop';

export interface Edge {
  from: number;
  to: number;
  cost: number;
  kind: EdgeKind;
  spike: boolean;
}

export interface Nav {
  w: number;
  h: number;
  edges: Edge[][];
}

export function gridHelpers(g: Grid) {
  const solid = (x: number, y: number): boolean => x < 0 || y < 0 || x >= g.w || y >= g.h || isSolid(g.tile(x, y));
  const passable = (x: number, y: number): boolean => !solid(x, y) && g.tile(x, y) !== LAVA;
  /** The tile at (x, y) can carry a standing body on its top. */
  const support = (x: number, y: number): boolean => {
    if (solid(x, y)) return true;
    const t = g.tile(x, y);
    return t === PLAT || (t === LADDER && g.tile(x, y - 1) !== LADDER);
  };
  const ground = (x: number, y: number): boolean => passable(x, y) && support(x, y + 1);
  return { solid, passable, support, ground };
}

export function buildNav(g: Grid): Nav {
  const { passable, ground, support, solid } = gridHelpers(g);
  const W = g.w;
  const edges: Edge[][] = Array.from({ length: g.w * g.h }, () => []);
  const id = (x: number, y: number): number => y * W + x;
  const add = (x: number, y: number, tx: number, ty: number, cost: number, kind: EdgeKind, spike = false): void => {
    edges[id(x, y)].push({ from: id(x, y), to: id(tx, ty), cost: cost + (spike ? 60 : 0), kind, spike });
  };
  const clear = (x0: number, x1: number, y: number): boolean => {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) if (!passable(x, y)) return false;
    return true;
  };

  for (let y = 1; y < g.h - 1; y++) {
    for (let x = 1; x < g.w - 1; x++) {
      if (!passable(x, y)) continue;
      const gr = ground(x, y);
      const cl = g.climb(x, y);
      if (!gr && !cl) continue;

      // Climb up and down ladders and ropes.
      if (cl && passable(x, y - 1) && (g.climb(x, y - 1) || ground(x, y - 1))) add(x, y, x, y - 1, 1.5, 'climb');
      if (g.climb(x, y + 1) && passable(x, y + 1)) add(x, y, x, y + 1, 1.5, 'climb');
      // Let go at the bottom of a rope, or drop through a platform.
      if ((cl && !gr && passable(x, y + 1) && !g.climb(x, y + 1)) || (gr && g.tile(x, y + 1) === PLAT)) {
        let yy = y + 1;
        while (yy < g.h - 1 && passable(x, yy) && !ground(x, yy)) yy++;
        if (yy < g.h - 1 && ground(x, yy)) add(x, y, x, yy, 1 + (yy - y) * 0.3, 'drop', g.tile(x, yy) === SPIKES && yy - y > 1);
      }
      for (const d of [-1, 1]) {
        const nx = x + d;
        if (!passable(nx, y)) continue;
        if (ground(nx, y)) {
          add(x, y, nx, y, 1, 'walk');
        } else {
          let yy = y;
          while (yy < g.h - 1 && passable(nx, yy) && !ground(nx, yy)) yy++;
          if (yy < g.h - 1 && ground(nx, yy)) add(x, y, nx, yy, 1 + (yy - y) * 0.3, 'fall', g.tile(nx, yy) === SPIKES && yy - y >= 1);
        }
      }

      if (!gr) continue;

      // Jumps.
      for (let dy = -2; dy <= 3; dy++) {
        const maxDx = dy === 3 ? 1 : dy === 2 ? 2 : dy === 1 ? 3 : 4;
        for (let dx = -maxDx; dx <= maxDx; dx++) {
          const tx = x + dx;
          const ty = y - dy;
          if (tx < 1 || tx >= g.w - 1 || ty < 1 || ty >= g.h - 1) continue;
          if (!ground(tx, ty)) continue;
          const adx = Math.abs(dx);
          if (dy <= 0 && adx < 2) continue;
          let ok = true;
          if (dx === 0) {
            if (dy < 1) continue;
            const t = g.tile(tx, ty + 1);
            if (t !== PLAT && t !== LADDER) continue;
            for (let yy = ty; yy < y && ok; yy++) if (!passable(x, yy) && g.tile(x, yy) !== PLAT) ok = false;
            if (dy === 3 && !passable(x, ty - 1)) ok = false;
          } else if (dy >= 1) {
            for (let yy = ty; yy < y && ok; yy++) if (!passable(x, yy)) ok = false;
            if (ok && dy === 3 && !passable(x, ty - 1)) ok = false;
            if (ok && !clear(x, tx, ty)) ok = false;
            if (ok && adx >= 2 && !clear(x, tx, ty - 1)) ok = false;
          } else {
            // Same level or lower: arc over the gap.
            const step = Math.sign(dx);
            for (let xx = x; xx !== tx + step && ok; xx += step) {
              const yBottom = xx === tx ? ty - 1 : xx === x ? y - 1 : y;
              for (let yy = y - (adx >= 3 ? 3 : 2); yy <= yBottom; yy++) if (!passable(xx, yy) || (yy < y && xx !== x && support(xx, yy) && !solid(xx, yy))) ok = false;
            }
            // Skip it if plain walking does the same.
            if (ok && dy === 0) {
              let gap = false;
              for (let xx = x + step; xx !== tx; xx += step) if (!ground(xx, y)) gap = true;
              if (!gap) ok = false;
            }
          }
          if (!ok) continue;
          add(x, y, tx, ty, 2 + adx * 0.6 + Math.max(dy, 0) * 0.6, 'jump', g.tile(tx, ty) === SPIKES);
        }
      }
    }
  }
  return { w: g.w, h: g.h, edges };
}

/** Dijkstra from `start` to the cheapest node that `goal` accepts. Returns the edges, or null. */
export function findPath(nav: Nav, start: number, goal: (n: number, cost: number) => boolean, extra?: (e: Edge) => number, maxCost = 1e9): Edge[] | null {
  const n = nav.edges.length;
  if (!(start >= 0 && start < n)) return null;
  const dist = new Float64Array(n).fill(Infinity);
  const prev: (Edge | null)[] = new Array(n).fill(null);
  const heap: [number, number][] = [];
  const push = (c: number, v: number): void => {
    heap.push([c, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  dist[start] = 0;
  push(0, start);
  while (heap.length) {
    const [c, v] = pop();
    if (c > dist[v]) continue;
    if (goal(v, c)) {
      const path: Edge[] = [];
      let cur = v;
      while (cur !== start) {
        const e = prev[cur]!;
        path.push(e);
        cur = e.from;
      }
      return path.reverse();
    }
    if (c > maxCost) break;
    for (const e of nav.edges[v]) {
      const nc = c + e.cost + (extra ? extra(e) : 0);
      if (nc < dist[e.to]) {
        dist[e.to] = nc;
        prev[e.to] = e;
        push(nc, e.to);
      }
    }
  }
  return null;
}
