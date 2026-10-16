/** Seeded world generation: biomes, water, resource nodes, spawners, portal and parts. */
import { MAP, NODES, SPAWN, type Biome } from './data';
import { Rng } from './rng';

export interface Node {
  id: number;
  k: string;
  x: number;
  y: number;
  /** 0 ready, 1 used (stump, picked, rubble). */
  s: number;
  /** Seconds until regrow. */
  t: number;
  /** Hits left. */
  hp: number;
  /** Spawner: seconds until the next creature. */
  sp?: number;
}

export interface World {
  /** Biome index per tile (0 grass, 1 forest, 2 rocky, 3 marsh). */
  biome: number[];
  /** 1 = water. */
  water: number[];
  start: { x: number; y: number };
  portal: { x: number; y: number };
  nodes: Node[];
}

export const BIOME_IDS: Biome[] = ['grass', 'forest', 'rocky', 'marsh'];

/** Smooth value noise in [0,1]. */
function noise2(seed: number, scale: number): (x: number, y: number) => number {
  const rng = new Rng(seed);
  const N = Math.ceil(MAP / scale) + 3;
  const g: number[] = [];
  for (let i = 0; i < N * N; i++) g.push(rng.next());
  const at = (i: number, j: number): number => g[j * N + i];
  return (x, y) => {
    const fx = x / scale;
    const fy = y / scale;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    const su = u * u * (3 - 2 * u);
    const sv = v * v * (3 - 2 * v);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * su;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * su;
    return a + (b - a) * sv;
  };
}

export const idx = (x: number, y: number): number => Math.floor(y) * MAP + Math.floor(x);

export function inMap(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < MAP && y < MAP;
}

/** Tiles reachable from the start (4-neighbour flood fill over land). */
export function reach(water: number[], sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(MAP * MAP);
  const q = [idx(sx, sy)];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop()!;
    const x = c % MAP;
    const y = (c / MAP) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const n = ny * MAP + nx;
      if (seen[n] || water[n]) continue;
      seen[n] = 1;
      q.push(n);
    }
  }
  return seen;
}

export function generate(seed: number): World {
  const rng = new Rng(seed);
  const c = MAP / 2;
  // Voronoi biome seeds. The first one is the start grassland.
  const seeds: { x: number; y: number; b: number }[] = [{ x: c, y: c, b: 0 }];
  const pool: number[] = [];
  for (let i = 0; i < 9; i++) pool.push(0, 1);
  for (let i = 0; i < 7; i++) pool.push(2, 3);
  rng.shuffle(pool);
  for (const b of pool) {
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = rng.int(4, MAP - 5);
      y = rng.int(4, MAP - 5);
      if (Math.hypot(x - c, y - c) > 7 && seeds.every((s) => Math.hypot(s.x - x, s.y - y) > 6)) break;
    }
    seeds.push({ x, y, b });
  }
  const wx = noise2(seed ^ 0x1234, 7);
  const wy = noise2(seed ^ 0x5678, 7);
  const wn = noise2(seed ^ 0x9abc, 4);
  const biome: number[] = [];
  const water: number[] = [];
  for (let y = 0; y < MAP; y++) {
    for (let x = 0; x < MAP; x++) {
      const px = x + (wx(x, y) - 0.5) * 9;
      const py = y + (wy(x, y) - 0.5) * 9;
      let best = 0;
      let bd = 1e9;
      for (let i = 0; i < seeds.length; i++) {
        const d = (seeds[i].x - px) ** 2 + (seeds[i].y - py) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      const b = seeds[best].b;
      biome.push(b);
      const edge = Math.min(x, y, MAP - 1 - x, MAP - 1 - y);
      const shore = edge < 2 || (edge < 4 && wn(x, y) > 0.55);
      const pond = b === 3 && wn(x, y) > 0.6;
      water.push(shore || pond ? 1 : 0);
    }
  }
  // Keep the start area dry.
  for (let y = c - 3; y <= c + 3; y++) for (let x = c - 3; x <= c + 3; x++) water[idx(x, y)] = 0;
  const ok = reach(water, c, c);

  const nodes: Node[] = [];
  const used = new Set<number>();
  let uid = 1;
  const addNode = (k: string, x: number, y: number): Node => {
    const d = NODES[k];
    const n: Node = { id: uid++, k, x, y, s: 0, t: 0, hp: d.hits };
    if (d.spawns) n.sp = 0;
    nodes.push(n);
    used.add(idx(x, y));
    return n;
  };
  const free = (x: number, y: number): boolean => {
    const i = idx(x, y);
    return inMap(x, y) && ok[i] === 1 && !used.has(i);
  };
  /** A free land tile of the biome at a distance from the start, or null. */
  const findTile = (b: number, minD: number, maxD: number): { x: number; y: number } | null => {
    for (let tries = 0; tries < 3000; tries++) {
      const x = rng.int(3, MAP - 4);
      const y = rng.int(3, MAP - 4);
      const d = Math.hypot(x - c, y - c);
      if (d < minD || d > maxD || (b >= 0 && biome[idx(x, y)] !== b) || !free(x, y)) continue;
      return { x, y };
    }
    return null;
  };

  // Portal and the three found parts.
  const pt = findTile(-1, 13, 20) ?? { x: c + 12, y: c };
  const portal = { x: pt.x + 0.5, y: pt.y + 0.5 };
  used.add(idx(pt.x, pt.y));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) used.add(idx(pt.x + dx, pt.y + dy));
  const partSpots: [string, number][] = [['pring', 1], ['pcrank', 2], ['pcrystal', 3]];
  for (const [k, b] of partSpots) {
    const t = findTile(b, 18, 34) ?? findTile(b, 10, 40) ?? findTile(-1, 18, 34)!;
    addNode(k, t.x + 0.5, t.y + 0.5);
    // Guards: a den of the biome next to the part.
    const guard = b === 1 ? 'nest' : b === 2 ? 'den' : 'pond';
    for (let i = 0; i < 1; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const gx = t.x + rng.int(-3, 3);
        const gy = t.y + rng.int(-3, 3);
        if ((gx !== t.x || gy !== t.y) && free(gx, gy)) {
          addNode(guard, gx + 0.5, gy + 0.5);
          break;
        }
      }
    }
  }

  // Regular nodes.
  for (let y = 2; y < MAP - 2; y++) {
    for (let x = 2; x < MAP - 2; x++) {
      if (!free(x, y)) continue;
      const near = Math.hypot(x - c, y - c);
      const b = BIOME_IDS[biome[idx(x, y)]];
      for (const [k, p] of SPAWN[b]) {
        // No dens right at the start.
        if ((k === 'nest' || k === 'den' || k === 'herd') && near < 10) continue;
        if (rng.chance(p)) {
          addNode(k, x + 0.2 + rng.next() * 0.6, y + 0.2 + rng.next() * 0.6);
          break;
        }
      }
    }
  }
  // A fair start: a few basics close by.
  const kit: [string, number][] = [['sapling', 4], ['grass', 4], ['flint', 3], ['berry', 3], ['tree', 3], ['boulder', 1]];
  for (const [k, n] of kit) {
    let have = nodes.filter((nd) => nd.k === k && Math.hypot(nd.x - c, nd.y - c) < 8).length;
    for (let tries = 0; tries < 200 && have < n; tries++) {
      const x = c + rng.int(-7, 7);
      const y = c + rng.int(-7, 7);
      if (Math.abs(x - c) < 2 && Math.abs(y - c) < 2) continue;
      if (!free(x, y)) continue;
      addNode(k, x + 0.5, y + 0.5);
      have++;
    }
  }
  // Every world needs gold: at least 3 veins.
  let veins = nodes.filter((n) => n.k === 'vein').length;
  for (let tries = 0; tries < 50 && veins < 3; tries++) {
    const t = findTile(2, 8, 40);
    if (t) {
      addNode('vein', t.x + 0.5, t.y + 0.5);
      veins++;
    }
  }
  return { biome, water, start: { x: c + 0.5, y: c + 0.5 }, portal, nodes };
}
