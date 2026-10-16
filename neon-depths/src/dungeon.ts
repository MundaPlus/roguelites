import { Rng } from './math';
import type { Pedestal, Pickup, Ware } from './types';

export const TILE = 40;
export const COLS = 17;
export const ROWS = 11;
export const ROOM_W = COLS * TILE;
export const ROOM_H = ROWS * TILE;

export const T = { Floor: 0, Wall: 1, Rock: 2, Pit: 3, Door: 4, Block: 5 } as const;

export type Dir = 'n' | 's' | 'e' | 'w';
export const DIRS: Record<Dir, { dx: number; dy: number; tx: number; ty: number; opp: Dir }> = {
  n: { dx: 0, dy: -1, tx: 8, ty: 0, opp: 's' },
  s: { dx: 0, dy: 1, tx: 8, ty: 10, opp: 'n' },
  w: { dx: -1, dy: 0, tx: 0, ty: 5, opp: 'e' },
  e: { dx: 1, dy: 0, tx: 16, ty: 5, opp: 'w' },
};

export type RoomType = 'start' | 'fight' | 'treasure' | 'shop' | 'challenge' | 'boss';

export interface Room {
  gx: number;
  gy: number;
  type: RoomType;
  tiles: Uint8Array;
  doors: Partial<Record<Dir, true>>;
  cleared: boolean;
  visited: boolean;
  dist: number;
  pickups: Pickup[];
  pedestals: Pedestal[];
  wares: Ware[];
  hatch: boolean;
  wave: number;
  dirty: boolean;
}

export interface Palette {
  name: string;
  wall: string;
  bg: string;
  grid: string;
  rock: string;
}

export const PALETTES: Palette[] = [
  { name: 'Circuit Sprawl', wall: '#00f5d4', bg: '#05070d', grid: '#0c1c26', rock: '#2ec4b6' },
  { name: 'Sewer Grid', wall: '#7cff4f', bg: '#060a06', grid: '#122313', rock: '#57cc3a' },
  { name: 'Neon Gardens', wall: '#ff4fd8', bg: '#0b050d', grid: '#220f27', rock: '#d63ab4' },
  { name: 'Data Core', wall: '#4f8bff', bg: '#04060f', grid: '#0e1738', rock: '#3a6ad6' },
  { name: 'The Abyss', wall: '#ff3b3b', bg: '#0d0404', grid: '#2a0c0c', rock: '#c42a2a' },
];

export interface Floor {
  n: number; // 1-based
  palette: Palette;
  rooms: Map<string, Room>;
  start: Room;
}

export const roomKey = (gx: number, gy: number): string => `${gx},${gy}`;

// Interior templates, 15 x 9. '#' rock, 'X' block, 'o' pit, '?' maybe rock.
const TEMPLATES: string[][] = [
  ['...............', '...............', '..X.........X..', '...............', '...............', '...............', '..X.........X..', '...............', '...............'],
  ['...............', '.##.........##.', '.#...........#.', '...............', '.......#.......', '...............', '.#...........#.', '.##.........##.', '...............'],
  ['...............', '...............', '....ooo.ooo....', '....o.....o....', '...............', '....o.....o....', '....ooo.ooo....', '...............', '...............'],
  ['...............', '...#.......#...', '...#.......#...', '...#.......#...', '...............', '...#.......#...', '...#.......#...', '...#.......#...', '...............'],
  ['...............', '..#...#.#...#..', '...............', '....#.....#....', '...............', '....#.....#....', '...............', '..#...#.#...#..', '...............'],
  ['...............', '...............', '...ooooooooo...', '...ooooooooo...', '...............', '...ooooooooo...', '...ooooooooo...', '...............', '...............'],
  ['...............', '...............', '...##.....##...', '...#.......#...', '...............', '...#.......#...', '...##.....##...', '...............', '...............'],
  ['...............', '.X.............', '..X.........X..', '...X.......X...', '...............', '...X.......X...', '..X.........X..', '.X...........X.', '...............'],
  ['...............', '.?.?.?...?.?.?.', '...............', '.?.?.?...?.?.?.', '...............', '.?.?.?...?.?.?.', '...............', '.?.?.?...?.?.?.', '...............'],
  ['ooo.........ooo', 'oo...........oo', 'o.............o', '...............', '...............', '...............', 'o.............o', 'oo...........oo', 'ooo.........ooo'],
  ['...............', '..oo.......oo..', '..oo.......oo..', '.......X.......', '......XXX......', '.......X.......', '..oo.......oo..', '..oo.......oo..', '...............'],
  ['...............', '...............', '.#####...#####.', '...............', '...............', '...............', '.#####...#####.', '...............', '...............'],
  ['.....#...#.....', '.....#...#.....', '.....#...#.....', '...............', '...............', '...............', '.....#...#.....', '.....#...#.....', '.....#...#.....'],
  ['...............', '.XX.........XX.', '.X...........X.', '.....?...?.....', '...............', '.....?...?.....', '.X...........X.', '.XX.........XX.', '...............'],
];
const EMPTY = 0;
const PILLARS = 0; // template 0 keeps the centre free
const ARENA = 9;

export const idx = (tx: number, ty: number): number => ty * COLS + tx;

export function walkable(t: number): boolean {
  return t === T.Floor || t === T.Door;
}

/** Tiles that stop bullets. Pits do not. */
export function blocksShots(t: number): boolean {
  return t === T.Wall || t === T.Rock || t === T.Block || t === T.Door;
}

function buildTiles(doors: Partial<Record<Dir, true>>, template: number, rng: Rng): Uint8Array {
  const tiles = new Uint8Array(COLS * ROWS);
  const tpl = TEMPLATES[template];
  const fx = rng.chance(0.5);
  const fy = rng.chance(0.5);
  for (let ty = 0; ty < ROWS; ty++) {
    for (let tx = 0; tx < COLS; tx++) {
      if (tx === 0 || ty === 0 || tx === COLS - 1 || ty === ROWS - 1) {
        tiles[idx(tx, ty)] = T.Wall;
        continue;
      }
      const ix = fx ? 14 - (tx - 1) : tx - 1;
      const iy = fy ? 8 - (ty - 1) : ty - 1;
      const c = tpl[iy][ix];
      tiles[idx(tx, ty)] =
        c === '#' ? T.Rock : c === 'X' ? T.Block : c === 'o' ? T.Pit : c === '?' ? (rng.chance(0.45) ? T.Rock : T.Floor) : T.Floor;
    }
  }
  for (const d of Object.keys(doors) as Dir[]) tiles[idx(DIRS[d].tx, DIRS[d].ty)] = T.Door;
  return tiles;
}

/** Ground tiles reachable from (sx, sy). */
export function reachable(tiles: Uint8Array, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(COLS * ROWS);
  const q = [idx(sx, sy)];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop()!;
    const x = i % COLS;
    const y = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const j = idx(nx, ny);
      if (!seen[j] && walkable(tiles[j])) {
        seen[j] = 1;
        q.push(j);
      }
    }
  }
  return seen;
}

function doorsConnected(tiles: Uint8Array, doors: Partial<Record<Dir, true>>): boolean {
  const list = Object.keys(doors) as Dir[];
  const r = reachable(tiles, 8, 5);
  if (!walkable(tiles[idx(8, 5)])) {
    // Centre is blocked: start the check at the first door instead.
    if (!list.length) return true;
    const a = reachable(tiles, DIRS[list[0]].tx, DIRS[list[0]].ty);
    return list.every((d) => a[idx(DIRS[d].tx, DIRS[d].ty)] === 1);
  }
  return list.every((d) => r[idx(DIRS[d].tx, DIRS[d].ty)] === 1);
}

function makeRoomTiles(room: Room, rng: Rng): Uint8Array {
  let tpl: number;
  if (room.type === 'start' || room.type === 'shop') tpl = EMPTY;
  else if (room.type === 'treasure') tpl = rng.chance(0.5) ? EMPTY : PILLARS;
  else if (room.type === 'boss') tpl = rng.pick([EMPTY, PILLARS, ARENA]);
  else tpl = rng.int(0, TEMPLATES.length - 1);
  for (let tries = 0; tries < 6; tries++) {
    const tiles = buildTiles(room.doors, tpl, rng);
    if (doorsConnected(tiles, room.doors)) return tiles;
  }
  return buildTiles(room.doors, EMPTY, rng);
}

const GRID = 9;

export function generateFloor(n: number, rng: Rng): Floor {
  const target = 7 + n * 2 + rng.int(0, 2);
  const needDeadEnds = n >= 2 ? 4 : 3;
  for (let attempt = 0; attempt < 500; attempt++) {
    const cells = new Map<string, [number, number]>();
    const has = (x: number, y: number) => cells.has(roomKey(x, y));
    const neighbours = (x: number, y: number) => [has(x + 1, y), has(x - 1, y), has(x, y + 1), has(x, y - 1)].filter(Boolean).length;
    cells.set(roomKey(4, 4), [4, 4]);
    const queue: [number, number][] = [[4, 4]];
    let guard = 0;
    while (queue.length && cells.size < target && guard++ < 400) {
      const [x, y] = queue.shift()!;
      for (const d of rng.shuffle(Object.values(DIRS).slice())) {
        const nx = x + d.dx;
        const ny = y + d.dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID || has(nx, ny)) continue;
        if (neighbours(nx, ny) > 1 || cells.size >= target || rng.chance(0.5)) continue;
        cells.set(roomKey(nx, ny), [nx, ny]);
        queue.push([nx, ny]);
      }
      if (!queue.length && cells.size < target) queue.push([4, 4]);
    }
    if (cells.size < target) continue;
    const deadEnds = [...cells.values()].filter(([x, y]) => !(x === 4 && y === 4) && neighbours(x, y) === 1);
    if (deadEnds.length < needDeadEnds) continue;

    // Distance from the start room, for the boss placement.
    const dist = new Map<string, number>([[roomKey(4, 4), 0]]);
    const bq: [number, number][] = [[4, 4]];
    while (bq.length) {
      const [x, y] = bq.shift()!;
      for (const d of Object.values(DIRS)) {
        const k = roomKey(x + d.dx, y + d.dy);
        if (cells.has(k) && !dist.has(k)) {
          dist.set(k, dist.get(roomKey(x, y))! + 1);
          bq.push([x + d.dx, y + d.dy]);
        }
      }
    }
    deadEnds.sort((a, b) => dist.get(roomKey(b[0], b[1]))! - dist.get(roomKey(a[0], a[1]))!);
    if (dist.get(roomKey(deadEnds[0][0], deadEnds[0][1]))! < 3) continue;

    const types = new Map<string, RoomType>();
    types.set(roomKey(4, 4), 'start');
    types.set(roomKey(...deadEnds[0]), 'boss');
    const rest = rng.shuffle(deadEnds.slice(1));
    types.set(roomKey(...rest[0]), 'treasure');
    types.set(roomKey(...rest[1]), 'shop');
    if (n >= 2 && rest[2]) types.set(roomKey(...rest[2]), 'challenge');

    const rooms = new Map<string, Room>();
    for (const [k, [x, y]] of cells) {
      const doors: Partial<Record<Dir, true>> = {};
      for (const [name, d] of Object.entries(DIRS) as [Dir, (typeof DIRS)[Dir]][]) if (has(x + d.dx, y + d.dy)) doors[name] = true;
      const type = types.get(k) ?? 'fight';
      const room: Room = {
        gx: x,
        gy: y,
        type,
        tiles: new Uint8Array(0),
        doors,
        cleared: type === 'start' || type === 'treasure' || type === 'shop',
        visited: false,
        dist: dist.get(k) ?? 0,
        pickups: [],
        pedestals: [],
        wares: [],
        hatch: false,
        wave: 0,
        dirty: true,
      };
      room.tiles = makeRoomTiles(room, rng);
      rooms.set(k, room);
    }
    return { n, palette: PALETTES[(n - 1) % PALETTES.length], rooms, start: rooms.get(roomKey(4, 4))! };
  }
  throw new Error('Floor generation failed');
}

/** Centre of a tile in room coordinates. */
export const tileCenter = (tx: number, ty: number): { x: number; y: number } => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });

/** Nearest ground tile to (tx, ty) that is reachable, by ring search. */
export function nearestFree(tiles: Uint8Array, tx: number, ty: number, ok?: Uint8Array): { x: number; y: number } {
  for (let r = 0; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) continue;
        const i = idx(x, y);
        if (tiles[i] === T.Floor && (!ok || ok[i])) return tileCenter(x, y);
      }
    }
  }
  return tileCenter(tx, ty);
}
