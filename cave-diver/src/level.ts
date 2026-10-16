/** Level generator: a 4×4 grid of room templates with a sure path from the top to the exit. */
import {
  ARROW,
  CONSUMABLES,
  CRUSH,
  DIRT,
  EMPTY,
  ENEMIES,
  GEMS,
  GOLDV,
  GRID,
  ICE,
  ICICLE,
  ITEMS,
  LADDER,
  LAVA,
  LEVEL_COUNT,
  LEVELS_PER_ZONE,
  MH,
  MW,
  PASSIVES,
  PETS,
  PLAT,
  ROCK,
  RH,
  RW,
  SPIKES,
  ZONES,
  isSolid,
} from './data';
import { buildNav, findPath, gridHelpers, type Grid } from './nav';
import { Rng, hash } from './rng';

export interface Spawn {
  kind: 'enemy' | 'gold' | 'gem' | 'crate' | 'pot' | 'rock' | 'pet' | 'shopkeeper' | 'ware';
  x: number;
  y: number;
  id?: string;
  value?: number;
}

export interface Level {
  index: number;
  zone: number;
  boss: boolean;
  w: number;
  h: number;
  tiles: Uint8Array;
  arrowDir: Map<number, number>;
  entrance: { x: number; y: number };
  exit: { x: number; y: number };
  spawns: Spawn[];
  shop: boolean;
  /** Rooms of the main path, for the debug view. */
  path: { rx: number; ry: number }[];
}

// Path room templates. Side exits are open on rows 4 to 6. Row 7 is the floor.
// '#' dirt, '1' dirt 60%, '2' dirt 30%, '.' empty, '=' wood platform, 'H' ladder, 'g' gold spot.
const LR: string[][] = [
  ['1111111111', '1........1', '..........', '...====...', '..........', '..........', '..g....g..', '##########'],
  ['1111111111', '1..g...111', '...##.....', '..####....', '.......##.', '..........', '....g.....', '##########'],
  ['11111##111', '1........1', '..........', '..g.......', '.####.....', '.####..##.', '.####..##.', '##########'],
  ['1111111111', '..........', '...g......', '..===..===', '..........', '.===......', '..........', '##########'],
  ['1111111111', '1111111111', '1111111111', '1111..1111', '..........', '..........', '...g..g...', '##########'],
  ['1111111111', '2........2', '..........', '..........', '...#..#...', '...#..#...', '.g.#..#.g.', '##########'],
  ['1111111111', '1...g....1', '.####H##..', '.....H....', '.....H....', '.....H....', '.....H....', '##########'],
  ['1111111111', '..........', '......====', '..........', '====......', '..........', '..g....g..', '##########'],
  ['1111111111', '11......11', '1..g..g..1', '..######..', '..........', '..........', '...2..2...', '##########'],
  ['1111111111', '1........1', '..===.....', '......#...', '.....##...', '..g.###...', '...####.g.', '##########'],
];

const SIDE: string[][] = [
  ['1111111111', '1111111111', '11g....111', '11....g111', '1111111111', '1111.11111', '1111111111', '1111111111'],
  ['1111111111', '1........1', '1.g..g...1', '1..####..1', '1........1', '1........1', '1...g....1', '1111111111'],
  ['1111111111', '1111111111', '11111111..', '11.g.11...', '11###11...', '1111111111', '1111111111', '1111111111'],
  ['1111111111', '1111111111', '1111111111', '111....111', '11..g...11', '11.####.11', '1111111111', '1111111111'],
];

const SHOP_ROOM = ['1111111111', '1111111111', '1111111111', '1.........', '1.........', '1.........', '1.........', '##########'];

interface Room {
  path: boolean;
  /** Column (0..8) of the 2-wide hole in the floor, or -1. */
  bottom: number;
  top: number;
  shop: boolean;
}

class Builder {
  tiles = new Uint8Array(MW * MH);
  arrowDir = new Map<number, number>();
  goldSpots: { x: number; y: number }[] = [];

  get(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return ROCK;
    return this.tiles[y * MW + x];
  }

  set(x: number, y: number, t: number): void {
    if (x <= 0 || y <= 0 || x >= MW - 1 || y >= MH - 1) return;
    this.tiles[y * MW + x] = t;
  }

  grid(): Grid {
    return { w: MW, h: MH, tile: (x, y) => this.get(x, y), climb: (x, y) => this.get(x, y) === LADDER };
  }

  border(): void {
    for (let x = 0; x < MW; x++) {
      this.tiles[x] = ROCK;
      this.tiles[(MH - 1) * MW + x] = ROCK;
    }
    for (let y = 0; y < MH; y++) {
      this.tiles[y * MW] = ROCK;
      this.tiles[y * MW + MW - 1] = ROCK;
    }
  }

  stamp(rx: number, ry: number, tpl: string[], mirror: boolean, rng: Rng): void {
    const ox = 1 + rx * RW;
    const oy = 1 + ry * RH;
    for (let y = 0; y < RH; y++) {
      for (let x = 0; x < RW; x++) {
        const c = tpl[y][mirror ? RW - 1 - x : x];
        let t = EMPTY;
        if (c === '#') t = DIRT;
        else if (c === '1') t = rng.chance(0.6) ? DIRT : EMPTY;
        else if (c === '2') t = rng.chance(0.3) ? DIRT : EMPTY;
        else if (c === '=') t = PLAT;
        else if (c === 'H') t = LADDER;
        else if (c === 'g') this.goldSpots.push({ x: ox + x, y: oy + y });
        this.tiles[(oy + y) * MW + ox + x] = t;
      }
    }
  }
}

function connected(b: Builder, from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  const nav = buildNav(b.grid());
  const goal = to.y * MW + to.x;
  return !!findPath(nav, from.y * MW + from.x, (n) => n === goal);
}

export function generateLevel(seed: string, index: number): Level {
  if (index === LEVEL_COUNT - 1) return bossLevel(seed, index);
  for (let attempt = 0; attempt < 30; attempt++) {
    const lv = tryLevel(seed, index, attempt, attempt >= 20);
    if (lv) return lv;
  }
  return tryLevel(seed, index, 99, true)!;
}

function tryLevel(seed: string, index: number, attempt: number, carve: boolean): Level | null {
  const rng = new Rng(hash(seed, 'level', index, attempt));
  const zone = Math.floor(index / LEVELS_PER_ZONE);
  const lvl = index % LEVELS_PER_ZONE;
  const b = new Builder();
  const rooms: Room[][] = Array.from({ length: GRID }, () => Array.from({ length: GRID }, () => ({ path: false, bottom: -1, top: -1, shop: false })));

  // 1. Walk the path from a top room to a bottom room.
  let rx = rng.int(0, GRID - 1);
  let ry = 0;
  const start = { rx, ry };
  const path = [{ rx, ry }];
  rooms[ry][rx].path = true;
  let dir = rng.chance(0.5) ? -1 : 1;
  let end = { rx, ry };
  for (let guard = 0; guard < 64; guard++) {
    const down = rng.chance(0.3);
    const nx = rx + dir;
    if (!down && nx >= 0 && nx < GRID && !rooms[ry][nx].path) {
      rx = nx;
      rooms[ry][rx].path = true;
      path.push({ rx, ry });
      continue;
    }
    if (!down && (nx < 0 || nx >= GRID)) dir = -dir;
    if (!down && rng.chance(0.5)) continue;
    if (ry === GRID - 1) {
      end = { rx, ry };
      break;
    }
    const col = rng.int(1, 7);
    rooms[ry][rx].bottom = col;
    ry++;
    rooms[ry][rx].top = col;
    rooms[ry][rx].path = true;
    path.push({ rx, ry });
    dir = rng.chance(0.5) ? -1 : 1;
    end = { rx, ry };
  }
  if (end.ry !== GRID - 1) return null;

  // 2. Shop room next to the path.
  let shopRoom: { rx: number; ry: number; side: number } | null = null;
  if (lvl > 0 || zone > 0) {
    if (rng.chance(0.45)) {
      const cands: { rx: number; ry: number; side: number }[] = [];
      for (const p of path) {
        for (const d of [-1, 1]) {
          const sx = p.rx + d;
          if (sx >= 0 && sx < GRID && !rooms[p.ry][sx].path && !(p.rx === start.rx && p.ry === start.ry)) cands.push({ rx: sx, ry: p.ry, side: -d });
        }
      }
      if (cands.length) {
        shopRoom = rng.pick(cands);
        rooms[shopRoom.ry][shopRoom.rx].shop = true;
      }
    }
  }

  // 3. Stamp the templates.
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const r = rooms[y][x];
      if (r.shop) {
        // The opening faces the path room.
        b.stamp(x, y, SHOP_ROOM, shopRoom!.side < 0, rng);
      } else if (r.path) {
        b.stamp(x, y, rng.pick(LR), rng.chance(0.5), rng);
      } else {
        b.stamp(x, y, rng.chance(0.5) ? rng.pick(SIDE) : rng.pick(LR), rng.chance(0.5), rng);
      }
    }
  }
  b.border();

  // 4. Carve the drops between rooms.
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const r = rooms[y][x];
      const ox = 1 + x * RW;
      const oy = 1 + y * RH;
      if (r.bottom >= 0) {
        for (let yy = RH - 1; yy >= 0; yy--) {
          const a = b.get(ox + r.bottom, oy + yy);
          const c = b.get(ox + r.bottom + 1, oy + yy);
          if (yy < RH - 1 && !isSolid(a) && !isSolid(c) && a !== LADDER && c !== LADDER) break;
          b.set(ox + r.bottom, oy + yy, EMPTY);
          b.set(ox + r.bottom + 1, oy + yy, EMPTY);
        }
      }
      if (r.top >= 0) {
        for (let yy = 0; yy < RH - 1; yy++) {
          const a = b.get(ox + r.top, oy + yy);
          const c = b.get(ox + r.top + 1, oy + yy);
          if (yy > 0 && !isSolid(a) && !isSolid(c)) break;
          b.set(ox + r.top, oy + yy, EMPTY);
          b.set(ox + r.top + 1, oy + yy, EMPTY);
        }
      }
    }
  }
  // Open the wall between the shop and the path room.
  if (shopRoom) {
    const pathRx = shopRoom.rx - shopRoom.side;
    const wx = shopRoom.side < 0 ? 1 + pathRx * RW : 1 + pathRx * RW + RW - 1;
    const oy = 1 + shopRoom.ry * RH;
    for (let yy = 4; yy <= 6; yy++) b.set(wx, oy + yy, EMPTY);
  }

  const help = gridHelpers(b.grid());
  if (carve) carvePath(b, path, rooms);

  // 5. Entrance and exit.
  const groundIn = (room: { rx: number; ry: number }, avoidCols: number[] = []): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    const ox = 1 + room.rx * RW;
    const oy = 1 + room.ry * RH;
    for (let y = oy + 1; y < oy + RH; y++) {
      for (let x = ox + 1; x < ox + RW - 1; x++) {
        if (avoidCols.includes(x - ox)) continue;
        if (help.ground(x, y) && isSolid(b.get(x, y + 1)) && b.get(x, y) === EMPTY) out.push({ x, y });
      }
    }
    return out;
  };
  const sr = rooms[start.ry][start.rx];
  const entCands = groundIn(start, sr.bottom >= 0 ? [sr.bottom, sr.bottom + 1] : []);
  const exitCands = groundIn(end);
  if (!entCands.length || !exitCands.length) return null;
  const entrance = rng.pick(entCands);
  const exit = rng.pick(exitCands);
  if (!connected(b, entrance, exit)) return null;

  const inRoom = (p: { x: number; y: number }, room: { rx: number; ry: number }): boolean =>
    Math.floor((p.x - 1) / RW) === room.rx && Math.floor((p.y - 1) / RH) === room.ry;
  const near = (p: { x: number; y: number }, q: { x: number; y: number }, d: number): boolean => Math.abs(p.x - q.x) <= d && Math.abs(p.y - q.y) <= d;
  // Columns below each drop, where a falling body lands.
  const landingCols = new Set<number>();
  for (let y = 0; y < GRID; y++)
    for (let x = 0; x < GRID; x++) {
      const r = rooms[y][x];
      if (r.top >= 0) {
        landingCols.add(y * 1000 + 1 + x * RW + r.top);
        landingCols.add(y * 1000 + 1 + x * RW + r.top + 1);
      }
    }
  const underDrop = (p: { x: number; y: number }): boolean => landingCols.has(Math.floor((p.y - 1) / RH) * 1000 + p.x);
  const shopArea = (p: { x: number; y: number }): boolean => !!shopRoom && inRoom(p, shopRoom);
  const safe = (p: { x: number; y: number }): boolean => !inRoom(p, start) && !near(p, exit, 2) && !near(p, entrance, 5) && !shopArea(p);

  // 6. Terrain features per zone.
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      if (b.get(x, y) === DIRT && rng.chance(0.05)) b.set(x, y, GOLDV);
      if (zone === 2 && b.get(x, y) === DIRT && b.get(x, y - 1) === EMPTY && rng.chance(0.4)) b.set(x, y, ICE);
    }

  const floorTiles = (): { x: number; y: number }[] => {
    const out: { x: number; y: number }[] = [];
    for (let y = 1; y < MH - 1; y++)
      for (let x = 1; x < MW - 1; x++) if (b.get(x, y) === EMPTY && isSolid(b.get(x, y + 1))) out.push({ x, y });
    return rng.shuffle(out);
  };

  // Spikes.
  let spikes = 2 + zone * 2 + Math.floor(lvl / 2);
  for (const p of floorTiles()) {
    if (spikes <= 0) break;
    if (!safe(p) || underDrop(p) || near(p, exit, 3)) continue;
    b.set(p.x, p.y, SPIKES);
    spikes--;
  }

  // Lava pools (temple), only where the path stays open.
  if (zone === 3) {
    let pools = 2 + lvl;
    for (const p of floorTiles()) {
      if (pools <= 0) break;
      if (!safe(p) || near(p, exit, 4)) continue;
      const width = rng.int(2, 3);
      const cells: { x: number; y: number }[] = [];
      for (let i = 0; i < width; i++) {
        const x = p.x + i;
        const y = p.y + 1;
        if (b.get(x, y) !== DIRT && b.get(x, y) !== GOLDV) break;
        if (b.get(x, y - 1) !== EMPTY || !isSolid(b.get(x, y + 1))) break;
        cells.push({ x, y });
      }
      if (cells.length < 2) continue;
      const old = cells.map((c) => b.get(c.x, c.y));
      cells.forEach((c) => b.set(c.x, c.y, LAVA));
      if (connected(b, entrance, exit)) pools--;
      else cells.forEach((c, i) => b.set(c.x, c.y, old[i]));
    }
  }

  // Arrow traps in walls that face a walkway.
  let arrows = 1 + zone + (lvl >= 2 ? 1 : 0);
  const wallCands: { x: number; y: number; d: number }[] = [];
  for (let y = 2; y < MH - 2; y++)
    for (let x = 2; x < MW - 2; x++) {
      if (b.get(x, y) !== DIRT) continue;
      for (const d of [-1, 1]) {
        let ok = true;
        for (let k = 1; k <= 3; k++) if (!help.passable(x + d * k, y)) ok = false;
        if (ok && help.ground(x + d, y) && help.ground(x + d * 2, y)) wallCands.push({ x, y, d });
      }
    }
  for (const c of rng.shuffle(wallCands)) {
    if (arrows <= 0) break;
    if (inRoom(c, start) || (c.y === entrance.y && Math.abs(c.x - entrance.x) < 10) || shopArea(c)) continue;
    b.set(c.x, c.y, ARROW);
    b.arrowDir.set(c.y * MW + c.x, c.d);
    arrows--;
  }

  // Falling blocks and icicles hang over open shafts.
  let crush = zone === 0 ? 1 : zone === 1 ? 2 : zone === 3 ? 4 : 0;
  let icicles = zone === 2 ? 5 + lvl : 0;
  const ceilCands: { x: number; y: number }[] = [];
  for (let y = 2; y < MH - 5; y++)
    for (let x = 1; x < MW - 1; x++) {
      if (!isSolid(b.get(x, y - 1)) || b.get(x, y) !== EMPTY) continue;
      let ok = true;
      for (let k = 1; k <= 3; k++) if (b.get(x, y + k) !== EMPTY) ok = false;
      if (ok) ceilCands.push({ x, y });
    }
  for (const c of rng.shuffle(ceilCands)) {
    if (crush <= 0 && icicles <= 0) break;
    if (inRoom(c, start) || near(c, entrance, 4) || shopArea(c)) continue;
    if (crush > 0 && b.get(c.x, c.y - 1) === DIRT) {
      b.set(c.x, c.y - 1, CRUSH);
      crush--;
    } else if (icicles > 0) {
      b.set(c.x, c.y, ICICLE);
      icicles--;
    }
  }

  if (!connected(b, entrance, exit)) return null;

  // 7. Things to spawn.
  const spawns: Spawn[] = [];
  const used = new Set<number>();
  const take = (p: { x: number; y: number }): boolean => {
    const k = p.y * MW + p.x;
    if (used.has(k)) return false;
    used.add(k);
    return true;
  };
  used.add(entrance.y * MW + entrance.x);
  used.add(exit.y * MW + exit.x);

  if (shopRoom) {
    const ox = 1 + shopRoom.rx * RW;
    const oy = 1 + shopRoom.ry * RH;
    const keeperX = shopRoom.side < 0 ? ox + RW - 2 : ox + 1;
    spawns.push({ kind: 'shopkeeper', x: keeperX, y: oy + 6 });
    const pool = rng.shuffle([...PASSIVES]).slice(0, 2).concat(rng.pick(CONSUMABLES));
    const wx = shopRoom.side < 0 ? [ox + 3, ox + 5, ox + 7] : [ox + 2, ox + 4, ox + 6];
    pool.forEach((id, i) => {
      spawns.push({ kind: 'ware', x: wx[i], y: oy + 6, id, value: Math.round((ITEMS[id].price * (1 + zone * 0.15)) / 100) * 100 });
      used.add((oy + 6) * MW + wx[i]);
    });
  }

  const floors = floorTiles().filter(safe);
  const ceilings = ceilCands.filter((c) => safe(c) && b.get(c.x, c.y) === EMPTY);
  const zd = ZONES[zone];
  const enemyCount = 5 + zone * 2 + lvl;
  const ceilCount = Math.round(enemyCount * 0.35);
  for (let i = 0, placed = 0; i < ceilings.length && placed < ceilCount; i++) {
    if (!take(ceilings[i])) continue;
    spawns.push({ kind: 'enemy', id: rng.weighted(zd.ceiling), x: ceilings[i].x, y: ceilings[i].y });
    placed++;
  }
  let walkers = enemyCount - ceilCount;
  let fi = 0;
  for (; fi < floors.length && walkers > 0; fi++) {
    if (!take(floors[fi])) continue;
    spawns.push({ kind: 'enemy', id: rng.weighted(zd.walkers), x: floors[fi].x, y: floors[fi].y });
    walkers--;
  }
  const next = (): { x: number; y: number } | null => {
    for (; fi < floors.length; fi++) if (take(floors[fi])) return floors[fi++];
    return null;
  };
  // Pet, far from the entrance but always reachable.
  const reach = new Set<number>();
  findPath(buildNav(b.grid()), entrance.y * MW + entrance.x, (v) => {
    reach.add(v);
    return false;
  });
  const petSpot = floors.find((p) => !used.has(p.y * MW + p.x) && reach.has(p.y * MW + p.x) && Math.abs(p.x - entrance.x) + Math.abs(p.y - entrance.y) > 12);
  if (petSpot) {
    take(petSpot);
    spawns.push({ kind: 'pet', x: petSpot.x, y: petSpot.y, id: rng.pick(PETS) });
  }
  for (let i = 0; i < 9; i++) {
    const p = next();
    if (p) spawns.push({ kind: 'gold', x: p.x, y: p.y, value: rng.chance(0.25) ? 300 : 100 });
  }
  for (const g of b.goldSpots) {
    if (b.get(g.x, g.y) === EMPTY && !shopArea(g) && rng.chance(0.6) && take(g)) spawns.push({ kind: 'gold', x: g.x, y: g.y, value: 100 });
  }
  const gems = 1 + (rng.chance(0.5) ? 1 : 0);
  for (let i = 0; i < gems; i++) {
    const p = next();
    if (p) spawns.push({ kind: 'gem', x: p.x, y: p.y, value: rng.int(0, Math.min(2, zone + 1)) });
  }
  const crates = rng.int(1, 2);
  for (let i = 0; i < crates; i++) {
    const p = next();
    if (p) spawns.push({ kind: 'crate', x: p.x, y: p.y });
  }
  for (let i = 0; i < 2; i++) {
    const p = next();
    if (p) spawns.push({ kind: 'pot', x: p.x, y: p.y });
  }
  for (let i = 0; i < 2; i++) {
    const p = next();
    if (p) spawns.push({ kind: 'rock', x: p.x, y: p.y });
  }

  return { index, zone, boss: false, w: MW, h: MH, tiles: b.tiles, arrowDir: b.arrowDir, entrance, exit, spawns, shop: !!shopRoom, path };
}

/** Last resort: dig a corridor along the path rooms so the level is always solvable. */
function carvePath(b: Builder, path: { rx: number; ry: number }[], rooms: Room[][]): void {
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const ox = 1 + p.rx * RW;
    const oy = 1 + p.ry * RH;
    for (let y = oy + 4; y <= oy + 6; y++) for (let x = ox; x < ox + RW; x++) b.set(x, y, EMPTY);
    for (let x = ox; x < ox + RW; x++) if (b.get(x, oy + 7) === EMPTY && rooms[p.ry][p.rx].bottom < 0) b.set(x, oy + 7, DIRT);
    const r = rooms[p.ry][p.rx];
    if (r.bottom >= 0) for (let y = oy + 4; y <= oy + RH + 6; y++) for (let x = ox + r.bottom; x <= ox + r.bottom + 1; x++) b.set(x, y, EMPTY);
  }
}

function bossLevel(seed: string, index: number): Level {
  const rng = new Rng(hash(seed, 'boss'));
  const b = new Builder();
  b.tiles.fill(DIRT);
  b.border();
  const box = (x0: number, y0: number, x1: number, y1: number, t: number): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) b.set(x, y, t);
  };
  // Entry hall at the top left, a shaft down into the arena.
  box(2, 2, 10, 4, EMPTY);
  box(9, 5, 10, 13, EMPTY);
  // The arena with a rock floor.
  box(1, 14, MW - 2, MH - 3, EMPTY);
  box(1, MH - 2, MW - 2, MH - 2, ROCK);
  // Two tiers of wood platforms.
  box(4, 29, 10, 29, PLAT);
  box(31, 29, 37, 29, PLAT);
  box(9, 26, 14, 26, PLAT);
  box(27, 26, 32, 26, PLAT);
  box(15, 23, 26, 23, PLAT);
  // Rock pillars to hide behind.
  box(13, 30, 13, 31, ROCK);
  box(28, 30, 28, 31, ROCK);
  const spawns: Spawn[] = [{ kind: 'enemy', id: 'boss', x: 20, y: 31 }];
  for (let i = 0; i < 6; i++) spawns.push({ kind: 'gold', x: 3 + i, y: 4, value: 300 });
  spawns.push({ kind: 'crate', x: 16, y: 22 });
  spawns.push({ kind: 'crate', x: 25, y: 22 });
  spawns.push({ kind: 'rock', x: 10, y: 25 });
  spawns.push({ kind: 'rock', x: 6, y: 31 });
  spawns.push({ kind: 'enemy', id: rng.pick(['mummy', 'scorpion']), x: 34, y: 31 });
  return {
    index,
    zone: 3,
    boss: true,
    w: MW,
    h: MH,
    tiles: b.tiles,
    arrowDir: b.arrowDir,
    entrance: { x: 4, y: 4 },
    exit: { x: 20, y: MH - 3 },
    spawns,
    shop: false,
    path: [],
  };
}

/** Sanity check used by the sim: names in the data tables exist. */
export function dataCheck(): string[] {
  const bad: string[] = [];
  for (const z of ZONES) for (const [id] of [...z.walkers, ...z.ceiling]) if (!ENEMIES[id]) bad.push(id);
  for (const id of [...PASSIVES, ...CONSUMABLES]) if (!ITEMS[id]) bad.push(id);
  if (GEMS.length !== 3) bad.push('gems');
  return bad;
}
