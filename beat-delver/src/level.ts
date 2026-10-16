/** Seeded floor generator: rooms and corridors, a shop, chests, stairs, enemies. */
import { DX, DY, ENEMIES, FLOORS_PER_ZONE, ITEMS, ZONES } from './data';
import { Rng } from './rng';
import { DIRT, FLOOR, GEMW, GOLDV, ROCK, STONE, updateSeen, type Enemy, type Hero, type Pedestal, type World } from './world';

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

const cx = (r: Room): number => r.x + Math.floor(r.w / 2);
const cy = (r: Room): number => r.y + Math.floor(r.h / 2);

/** Item weights for shops. Chests use the same pool without food. */
const SHOP_POOL: [string, number][] = [
  ['w_spear', 3],
  ['w_broad', 3],
  ['w_whip', 2],
  ['w_rapier', 2],
  ['w_long', 2],
  ['leather', 3],
  ['chain', 2],
  ['plate', 1],
  ['torch', 2],
  ['lantern', 1],
  ['bombs', 3],
  ['fireball', 2],
  ['freeze', 2],
  ['heal', 2],
  ['quake', 1],
  ['ring_gold', 2],
  ['ring_luck', 2],
  ['ring_vigor', 2],
  ['apple', 4],
  ['cheese', 3],
  ['heart', 3],
  ['whet', 2],
  ['pick', 2],
];

/** False for items that would do nothing for this hero. */
export function useful(h: Hero, id: string): boolean {
  const it = ITEMS[id];
  switch (it.kind) {
    case 'weapon':
      return h.weapon !== it.v;
    case 'armor':
      return h.armor < (it.v as number) && !(h.armor === 2 && it.v === 1);
    case 'torch':
      return h.torch < (it.v as number);
    case 'spell':
      return h.spell !== id;
    case 'pick':
      return !h.pick;
    default:
      return true;
  }
}

export function pickItems(rng: Rng, h: Hero, n: number, food: boolean): string[] {
  const out: string[] = [];
  for (let guard = 0; out.length < n && guard < 200; guard++) {
    const id = rng.weighted(SHOP_POOL);
    if (out.includes(id) || !useful(h, id)) continue;
    if (!food && ITEMS[id].kind === 'food') continue;
    out.push(id);
  }
  return out;
}

export const priceOf = (id: string, zone: number): number => Math.round((ITEMS[id].cost * (1.4 + 0.3 * zone)) / 5) * 5;

function makeEnemy(id: string, x: number, y: number, uid: number, rng: Rng, zone = 0): Enemy {
  const d = ENEMIES[id];
  const hp = d.hp + (zone >= 2 && d.hp >= 2 && !d.boss && (d.every >= 2 || d.move !== 'chase') ? 1 : 0);
  return {
    uid,
    id,
    x,
    y,
    hp,
    max: hp,
    cd: rng.int(0, d.every - 1),
    dir: d.move === 'bounce' ? rng.pick([0, 2]) : rng.int(0, 3),
    aim: -1,
    stun: 0,
    summonCd: d.summonEvery ?? 0,
    slamCd: d.slamEvery ?? 0,
    hitAt: -1,
  };
}

function baseWorld(zone: number, floor: number, w: number, h: number, hero: Hero, seed: number): World {
  return {
    zone,
    floor,
    boss: floor === FLOORS_PER_ZONE - 1,
    w,
    h,
    tiles: new Array(w * h).fill(DIRT),
    seen: new Array(w * h).fill(0),
    px: 0,
    py: 0,
    face: 2,
    hero,
    enemies: [],
    gold: [],
    chests: [],
    shop: [],
    keeper: null,
    stairs: { x: 0, y: 0 },
    locked: true,
    stairsShown: true,
    bombs: [],
    danger: [],
    beat: 0,
    mult: 1,
    rng: seed ^ 0x5bd1e995,
    uid: 1,
    frozen: 0,
    shieldUsed: false,
    exit: false,
    dead: false,
    won: false,
    missed: 0,
    onBeat: 0,
    lockMsg: false,
  };
}

function bossFloor(seed: number, zone: number, floor: number, hero: Hero): World {
  const rng = new Rng(seed);
  const W = 19;
  const H = 17;
  const w = baseWorld(zone, floor, W, H, hero, seed);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) w.tiles[y * W + x] = ROCK;
  for (let y = 2; y <= 14; y++) for (let x = 2; x <= 16; x++) w.tiles[y * W + x] = FLOOR;
  for (const [x, y] of [[5, 5], [13, 5], [5, 11], [13, 11]]) w.tiles[y * W + x] = STONE;
  w.px = 9;
  w.py = 13;
  w.face = 0;
  w.stairsShown = false;
  const z = ZONES[zone];
  w.enemies.push(makeEnemy(z.boss, 9, 4, w.uid++, rng));
  const boss = w.enemies[0];
  boss.cd = 1;
  for (let i = 0; i < 2; i++) {
    const id = rng.weighted(z.pool);
    w.enemies.push(makeEnemy(id, 6 + i * 6, 7, w.uid++, rng, zone));
  }
  w.seen.fill(1);
  return w;
}

export function genFloor(seed: number, zone: number, floor: number, hero: Hero): World {
  if (floor === FLOORS_PER_ZONE - 1) return bossFloor(seed, zone, floor, hero);
  const rng = new Rng(seed);
  const W = 33;
  const H = 25;
  const z = ZONES[zone];
  const w = baseWorld(zone, floor, W, H, hero, seed);
  const T = w.tiles;
  const at = (x: number, y: number): number => y * W + x;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) T[at(x, y)] = ROCK;

  const rooms: Room[] = [];
  for (let tries = 0; tries < 400 && rooms.length < 9; tries++) {
    const r: Room = { w: rng.int(4, 8), h: rng.int(4, 6), x: 0, y: 0 };
    r.x = rng.int(2, W - r.w - 2);
    r.y = rng.int(2, H - r.h - 2);
    if (rooms.some((o) => r.x < o.x + o.w + 2 && o.x < r.x + r.w + 2 && r.y < o.y + o.h + 2 && o.y < r.y + r.h + 2)) continue;
    rooms.push(r);
  }
  for (const r of rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) T[at(x, y)] = FLOOR;
  // Stone walls, placed before corridors so corridors cut through them.
  for (let i = 0; i < T.length; i++) if (T[i] === DIRT && rng.chance(z.stone)) T[i] = STONE;
  rooms.sort((a, b) => cx(a) - cx(b));
  const carve = (a: Room, b: Room): void => {
    let x = cx(a);
    let y = cy(a);
    const hFirst = rng.chance(0.5);
    const tx = cx(b);
    const ty = cy(b);
    const stepX = (): void => {
      while (x !== tx) {
        x += Math.sign(tx - x);
        if (T[at(x, y)] !== ROCK) T[at(x, y)] = FLOOR;
      }
    };
    const stepY = (): void => {
      while (y !== ty) {
        y += Math.sign(ty - y);
        if (T[at(x, y)] !== ROCK) T[at(x, y)] = FLOOR;
      }
    };
    if (hFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
  };
  for (let i = 1; i < rooms.length; i++) carve(rooms[i - 1], rooms[i]);
  for (let i = 0; i < 2; i++) carve(rng.pick(rooms), rng.pick(rooms));

  const start = rng.pick(rooms);
  w.px = cx(start);
  w.py = cy(start);
  // Walking distance from the start picks the stairs room.
  const dist = new Array(W * H).fill(-1);
  const q = [at(w.px, w.py)];
  dist[q[0]] = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const p = q[qi];
    const x = p % W;
    const y = (p / W) | 0;
    for (let k = 0; k < 4; k++) {
      const n = at(x + DX[k], y + DY[k]);
      if (T[n] === FLOOR && dist[n] < 0) {
        dist[n] = dist[p] + 1;
        q.push(n);
      }
    }
  }
  const others = rooms.filter((r) => r !== start);
  const stairsRoom = others.reduce((a, b) => (dist[at(cx(b), cy(b))] > dist[at(cx(a), cy(a))] ? b : a));
  w.stairs = { x: cx(stairsRoom), y: cy(stairsRoom) };
  const taken = new Set<number>([at(w.px, w.py), at(w.stairs.x, w.stairs.y)]);

  // Shop.
  const shopRoom = rng.shuffle(others.filter((r) => r !== stairsRoom && r.w >= 5 && r.h >= 4))[0];
  if (shopRoom) {
    const sx = cx(shopRoom);
    w.keeper = { x: sx, y: shopRoom.y };
    taken.add(at(sx, shopRoom.y));
    const items = pickItems(rng, hero, 3, true);
    items.forEach((id, i) => {
      const p: Pedestal = { x: sx - 2 + i * 2, y: shopRoom.y + 2, item: id, cost: priceOf(id, zone), sold: false };
      w.shop.push(p);
      taken.add(at(p.x, p.y));
    });
    for (let y = shopRoom.y; y < shopRoom.y + shopRoom.h; y++) for (let x = shopRoom.x; x < shopRoom.x + shopRoom.w; x++) w.seen[at(x, y)] = 1;
  }
  const freeIn = (r: Room): [number, number] | null => {
    for (let i = 0; i < 30; i++) {
      const x = rng.int(r.x, r.x + r.w - 1);
      const y = rng.int(r.y, r.y + r.h - 1);
      if (T[at(x, y)] === FLOOR && !taken.has(at(x, y))) return [x, y];
    }
    return null;
  };
  const spawnRooms = others.filter((r) => r !== shopRoom);
  // Chests.
  const nChests = 1 + (rng.chance(0.45) ? 1 : 0);
  const chestItems = pickItems(rng, hero, nChests, false);
  for (const id of chestItems) {
    const p = freeIn(rng.pick(spawnRooms));
    if (!p) continue;
    w.chests.push({ x: p[0], y: p[1], item: id });
    taken.add(at(p[0], p[1]));
  }
  // Gold veins and one hidden diamond in walls next to open floor.
  const edge: number[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (T[at(x, y)] !== DIRT) continue;
      if ([0, 1, 2, 3].some((k) => T[at(x + DX[k], y + DY[k])] === FLOOR)) edge.push(at(x, y));
    }
  }
  for (const i of edge) if (rng.chance(0.04)) T[i] = GOLDV;
  const gemAt = edge.filter((i) => T[i] === DIRT && Math.abs((i % W) - w.px) + Math.abs(((i / W) | 0) - w.py) > 6);
  if (gemAt.length) T[rng.pick(gemAt)] = GEMW;

  // Mini-boss next to the stairs.
  const miniSpots = [0, 1, 2, 3].map((k) => [w.stairs.x + DX[k], w.stairs.y + DY[k]]).filter(([x, y]) => T[at(x, y)] === FLOOR && !taken.has(at(x, y)));
  const [mx, my] = miniSpots.length ? miniSpots[0] : [w.stairs.x, w.stairs.y - 1];
  T[at(mx, my)] = FLOOR;
  w.enemies.push(makeEnemy(z.mini, mx, my, w.uid++, rng, zone));
  taken.add(at(mx, my));

  // Enemies.
  const count = 8 + zone * 3 + floor * 2;
  for (let i = 0, guard = 0; i < count && guard < 300; guard++) {
    const p = freeIn(rng.pick(spawnRooms));
    if (!p || Math.abs(p[0] - w.px) + Math.abs(p[1] - w.py) < 6) continue;
    w.enemies.push(makeEnemy(rng.weighted(z.pool), p[0], p[1], w.uid++, rng, zone));
    taken.add(at(p[0], p[1]));
    i++;
  }
  updateSeen(w);
  return w;
}

