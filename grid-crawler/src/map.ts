/** Map generation, field of view, lines and path finding. All functions are pure. */
import type { Rng } from './rng';

export const W = 50;
export const H = 34;

export const T_WALL = 0;
export const T_FLOOR = 1;
export const T_DOOR = 2;
export const T_DOWN = 3;
export const T_UP = 4;

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Level {
  tiles: number[];
  rooms: Room[];
  start: [number, number];
  down: [number, number];
}

export const idx = (x: number, y: number): number => y * W + x;
export const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
export const walkable = (t: number): boolean => t !== T_WALL;

export const DIRS: [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

export const dist = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

/** A diagonal step may not cut a wall corner and may not enter or leave a door. */
export function canStep(tiles: number[], x: number, y: number, dx: number, dy: number): boolean {
  const nx = x + dx;
  const ny = y + dy;
  if (!inMap(nx, ny) || !walkable(tiles[idx(nx, ny)])) return false;
  if (dx !== 0 && dy !== 0) {
    if (tiles[idx(x, y)] === T_DOOR || tiles[idx(nx, ny)] === T_DOOR) return false;
    if (!walkable(tiles[idx(x + dx, y)]) || !walkable(tiles[idx(x, y + dy)])) return false;
  }
  return true;
}

function carve(tiles: number[], x: number, y: number): void {
  if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && tiles[idx(x, y)] === T_WALL) tiles[idx(x, y)] = T_FLOOR;
}

function center(r: Room): [number, number] {
  return [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)];
}

function corridor(tiles: number[], a: Room, b: Room, rng: Rng): void {
  const [ax, ay] = center(a);
  const [bx, by] = center(b);
  const hLine = (y: number, x0: number, x1: number): void => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) carve(tiles, x, y);
  };
  const vLine = (x: number, y0: number, y1: number): void => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) carve(tiles, x, y);
  };
  if (rng.chance(0.5)) {
    hLine(ay, ax, bx);
    vLine(bx, ay, by);
  } else {
    vLine(ax, ay, by);
    hLine(by, ax, bx);
  }
}

/** Rooms and corridors with doors. The stairs down go into the room farthest from the start. */
export function generate(rng: Rng): Level {
  for (;;) {
    const tiles = new Array<number>(W * H).fill(T_WALL);
    const rooms: Room[] = [];
    for (let tries = 0; tries < 400 && rooms.length < 13; tries++) {
      const w = rng.int(4, 10);
      const h = rng.int(3, 7);
      const x = rng.int(1, W - w - 2);
      const y = rng.int(1, H - h - 2);
      if (rooms.some((r) => x - 2 < r.x + r.w && x + w + 2 > r.x && y - 2 < r.y + r.h && y + h + 2 > r.y)) continue;
      rooms.push({ x, y, w, h });
    }
    if (rooms.length < 7) continue;
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[idx(x, y)] = T_FLOOR;
    // Mark room interiors so corridors through rooms do not make doors there.
    const inRoom = new Array<boolean>(W * H).fill(false);
    for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) inRoom[idx(x, y)] = true;
    const order = rooms.map((_, i) => i).sort((a, b) => center(rooms[a])[0] - center(rooms[b])[0]);
    for (let i = 1; i < order.length; i++) corridor(tiles, rooms[order[i - 1]], rooms[order[i]], rng);
    const extra = rng.int(2, 4);
    for (let i = 0; i < extra; i++) corridor(tiles, rng.pick(rooms), rng.pick(rooms), rng);
    // Doors: corridor tiles on a room's outer ring, with walls on both sides.
    for (const r of rooms) {
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        for (let x = r.x - 1; x <= r.x + r.w; x++) {
          const edge = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
          if (!edge || !inMap(x, y) || tiles[idx(x, y)] !== T_FLOOR || inRoom[idx(x, y)]) continue;
          const corner = (x === r.x - 1 || x === r.x + r.w) && (y === r.y - 1 || y === r.y + r.h);
          if (corner) continue;
          const wallsH = tiles[idx(x - 1, y)] === T_WALL && tiles[idx(x + 1, y)] === T_WALL;
          const wallsV = tiles[idx(x, y - 1)] === T_WALL && tiles[idx(x, y + 1)] === T_WALL;
          if ((wallsH || wallsV) && rng.chance(0.7)) tiles[idx(x, y)] = T_DOOR;
        }
      }
    }
    const first = rooms[0];
    const start: [number, number] = [first.x + rng.int(0, first.w - 1), first.y + rng.int(0, first.h - 1)];
    const d = distanceMap(tiles, [start]);
    let best = -1;
    let down: [number, number] = start;
    for (const r of rooms.slice(1)) {
      const [cx, cy] = center(r);
      const v = d[idx(cx, cy)];
      if (v > best && v < 9999) {
        best = v;
        down = [cx, cy];
      }
    }
    // Every room must be reachable.
    if (rooms.some((r) => d[idx(...center(r))] >= 9999) || best < 15) continue;
    tiles[idx(start[0], start[1])] = T_UP;
    tiles[idx(down[0], down[1])] = T_DOWN;
    return { tiles, rooms, start, down };
  }
}

/** BFS distance from the sources over walkable tiles. 9999 means unreachable. */
export function distanceMap(tiles: number[], sources: [number, number][], blocked?: (i: number) => boolean): number[] {
  const d = new Array<number>(W * H).fill(9999);
  const q: number[] = [];
  for (const [x, y] of sources) {
    d[idx(x, y)] = 0;
    q.push(idx(x, y));
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS) {
      if (!canStep(tiles, x, y, dx, dy)) continue;
      const j = idx(x + dx, y + dy);
      if (d[j] <= d[i] + 1 || (blocked && blocked(j))) continue;
      d[j] = d[i] + 1;
      q.push(j);
    }
  }
  return d;
}

/** Path from (sx,sy) to (tx,ty) as a list of steps (without the start). Null when there is none. */
export function findPath(
  tiles: number[],
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  passable: (i: number) => boolean,
): [number, number][] | null {
  if (!inMap(tx, ty)) return null;
  const d = distanceMap(tiles, [[tx, ty]], (j) => !passable(j) && j !== idx(sx, sy));
  if (d[idx(sx, sy)] >= 9999) return null;
  const path: [number, number][] = [];
  let x = sx;
  let y = sy;
  while (x !== tx || y !== ty) {
    let bx = -1;
    let by = -1;
    let bv = d[idx(x, y)];
    for (const [dx, dy] of DIRS) {
      if (!canStep(tiles, x, y, dx, dy)) continue;
      const v = d[idx(x + dx, y + dy)];
      if (v < bv) {
        bv = v;
        bx = x + dx;
        by = y + dy;
      }
    }
    if (bx < 0) return null;
    x = bx;
    y = by;
    path.push([x, y]);
    if (path.length > W * H) return null;
  }
  return path;
}

/** Bresenham line from a to b, without the start tile. */
export function line(ax: number, ay: number, bx: number, by: number): [number, number][] {
  const out: [number, number][] = [];
  const dx = Math.abs(bx - ax);
  const dy = -Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx + dy;
  let x = ax;
  let y = ay;
  while (x !== bx || y !== by) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    out.push([x, y]);
  }
  return out;
}

/** Extends the line from a through b up to `len` tiles, stopping at walls. */
export function ray(tiles: number[], ax: number, ay: number, bx: number, by: number, len: number): [number, number][] {
  const fx = ax + (bx - ax) * 20;
  const fy = ay + (by - ay) * 20;
  const out: [number, number][] = [];
  for (const [x, y] of line(ax, ay, fx, fy)) {
    if (!inMap(x, y) || tiles[idx(x, y)] === T_WALL || out.length >= len) break;
    out.push([x, y]);
  }
  return out;
}

/**
 * Recursive shadow casting (8 octants). `opaque(i)` says if a tile blocks sight.
 * Returns an array with 1 for each visible tile.
 */
export function computeFov(ox: number, oy: number, radius: number, opaque: (i: number) => boolean): number[] {
  const vis = new Array<number>(W * H).fill(0);
  vis[idx(ox, oy)] = 1;
  const mult = [
    [1, 0, 0, -1, -1, 0, 0, 1],
    [0, 1, -1, 0, 0, -1, 1, 0],
    [0, 1, 1, 0, 0, -1, -1, 0],
    [1, 0, 0, 1, -1, 0, 0, -1],
  ];
  const r2 = radius * radius + radius;
  const cast = (row: number, start: number, end: number, xx: number, xy: number, yx: number, yy: number): void => {
    if (start < end) return;
    let newStart = 0;
    for (let j = row; j <= radius; j++) {
      let dx = -j - 1;
      const dy = -j;
      let blocked = false;
      while (dx <= 0) {
        dx += 1;
        const X = ox + dx * xx + dy * xy;
        const Y = oy + dx * yx + dy * yy;
        const lSlope = (dx - 0.5) / (dy + 0.5);
        const rSlope = (dx + 0.5) / (dy - 0.5);
        if (start < rSlope) continue;
        if (end > lSlope) break;
        if (!inMap(X, Y)) continue;
        const i = idx(X, Y);
        if (dx * dx + dy * dy < r2) vis[i] = 1;
        if (blocked) {
          if (opaque(i)) {
            newStart = rSlope;
            continue;
          }
          blocked = false;
          start = newStart;
        } else if (opaque(i) && j < radius) {
          blocked = true;
          cast(j + 1, start, lSlope, xx, xy, yx, yy);
          newStart = rSlope;
        }
      }
      if (blocked) break;
    }
  };
  for (let o = 0; o < 8; o++) cast(1, 1.0, 0.0, mult[0][o], mult[1][o], mult[2][o], mult[3][o]);
  return vis;
}
