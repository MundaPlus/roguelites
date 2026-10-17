/**
 * Room generator. A shape comes from a hand-made template or from random wall blocks.
 * The crates start on the plates (solved) and get pulled away by reverse play,
 * so a solution always exists. The BFS solver then checks it and measures it.
 */
import { MONSTERS, TEMPLATES, TOOL_IDS, type CrateKind, type MonsterKind, type ToolId } from './data';
import { isFloorTile, reach, step, type Crate, type Dir, type Item, type Monster, type RoomDef, type RoomState } from './puzzle';
import { Rng } from './rng';
import { solve } from './solver';

export type GenKind = 'puzzle' | 'stairs' | 'treasure' | 'final';

export interface GenRoom {
  start: RoomState;
  par: number;
  pushes: number;
  solution: Dir[];
  template: boolean;
}

function transform(rows: string[], rot: number, flip: boolean): string[] {
  let g = rows.map((r) => r.split(''));
  if (flip) g = g.map((r) => r.reverse());
  for (let k = 0; k < rot; k++) {
    const h = g.length;
    const w = g[0].length;
    const n: string[][] = [];
    for (let x = 0; x < w; x++) {
      n.push([]);
      for (let y = h - 1; y >= 0; y--) n[x].push(g[y][x]);
    }
    g = n;
  }
  return g.map((r) => r.join(''));
}

function connected(tiles: string[], w: number, h: number): boolean {
  const floor = tiles.map((t) => isFloorTile(t));
  const start = floor.indexOf(true);
  if (start < 0) return false;
  const seen = new Uint8Array(w * h);
  const st = [start];
  seen[start] = 1;
  let n = 1;
  const r: RoomDef = { w, h, tiles };
  while (st.length) {
    const i = st.pop()!;
    for (let d = 0; d < 4; d++) {
      const j = step(r, i, d as Dir);
      if (j >= 0 && !seen[j] && floor[j]) {
        seen[j] = 1;
        n++;
        st.push(j);
      }
    }
  }
  return n === floor.filter(Boolean).length;
}

function randomShape(rng: Rng, floor: number, crates: number, big: boolean): string[] | null {
  const w = rng.int(7, 8 + Math.min(2, Math.floor(floor / 4))) + (big ? 1 : 0);
  const h = rng.int(6, 7 + Math.min(1, Math.floor(floor / 5))) + (big ? 1 : 0);
  const tiles: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '.');
  const blocks = rng.int(3, 5 + Math.floor((w * h) / 30));
  for (let b = 0; b < blocks; b++) {
    const x = rng.int(1, w - 2);
    const y = rng.int(1, h - 2);
    const cells = [[x, y]];
    if (rng.chance(0.5)) cells.push(rng.chance(0.5) ? [x + 1, y] : [x, y + 1]);
    const back = [...tiles];
    for (const [cx, cy] of cells) if (cx < w - 1 && cy < h - 1) tiles[cy * w + cx] = '#';
    if (!connected(tiles, w, h)) tiles.splice(0, tiles.length, ...back);
  }
  const free = tiles.map((t, i) => (t === '.' ? i : -1)).filter((i) => i >= 0);
  if (free.length < crates * 4 + 6) return null;
  // Plates away from dead corners: at least 2 open neighbors.
  const r: RoomDef = { w, h, tiles };
  const good = free.filter((i) => [0, 1, 2, 3].filter((d) => tiles[step(r, i, d as Dir)] === '.').length >= 3);
  rng.shuffle(good);
  if (good.length < crates) return null;
  for (let k = 0; k < crates; k++) tiles[good[k]] = '_';
  const rows: string[] = [];
  for (let y = 0; y < h; y++) rows.push(tiles.slice(y * w, y * w + w).join(''));
  return rows;
}

function placeDoor(rng: Rng, r: RoomDef): number {
  const opts: number[] = [];
  for (let i = 0; i < r.tiles.length; i++) {
    if (r.tiles[i] !== '#') continue;
    const x = i % r.w;
    const y = Math.floor(i / r.w);
    if (!(x === 0 || y === 0 || x === r.w - 1 || y === r.h - 1)) continue;
    for (let d = 0; d < 4; d++) {
      const n = step(r, i, d as Dir);
      if (n >= 0 && isFloorTile(r.tiles[n])) opts.push(i);
    }
  }
  return opts.length ? rng.pick(opts) : -1;
}

/** Reverse play: pull crates off their plates. Returns the scrambled state or null. */
function scramble(rng: Rng, base: RoomState, pulls: number): RoomState | null {
  let s: RoomState = { ...base, crates: base.crates.map((c) => ({ ...c })) };
  const moved = new Set<number>();
  let last: [number, number] | null = null;
  for (let k = 0; k < pulls; k++) {
    const r = reach(s);
    const opts: [Crate, Dir][] = [];
    for (const c of s.crates) {
      for (let d = 0 as Dir; d < 4; d++) {
        const stand = step(s.room, c.pos, d as Dir);
        const to = stand >= 0 ? step(s.room, stand, d as Dir) : -1;
        if (stand < 0 || to < 0 || !r[stand]) continue;
        if (!isFloorTile(s.room.tiles[to]) || s.crates.some((o) => o.pos === to)) continue;
        opts.push([c, d as Dir]);
      }
    }
    if (!opts.length) break;
    let pick = rng.pick(opts);
    if (last && rng.chance(0.55)) {
      const same = opts.find(([c, d]) => c.id === last![0] && d === last![1]);
      if (same) pick = same;
    }
    const [c, d] = pick;
    const stand = step(s.room, c.pos, d);
    const to = step(s.room, stand, d);
    c.pos = stand;
    s = { ...s, p: to };
    moved.add(c.id);
    last = [c.id, d];
  }
  if (moved.size < s.crates.length) return null;
  if (s.crates.some((c) => s.room.tiles[c.pos] === '_')) return null;
  // Start anywhere the player can walk to.
  const r = reach(s);
  const cells = [...r.keys()].filter((i) => r[i]);
  s = { ...s, p: rng.pick(cells) };
  return s;
}

function emptyState(room: RoomDef): RoomState {
  return {
    room,
    p: 0,
    facing: 2,
    crates: [],
    monsters: [],
    items: [],
    broken: [],
    might: false,
    budget: 0,
    moves: 0,
    tools: {},
    mode: null,
    gold: 0,
    keys: 0,
    gems: 0,
    exited: false,
    turn: 0,
    fx: [],
  };
}

export interface GenOpts {
  floor: number;
  kind: GenKind;
  seed: number;
  tools: ToolId[];
}

export function crateCount(floor: number, kind: GenKind, rng: Rng): number {
  if (kind === 'final') return 4;
  if (floor < 2) return 2;
  if (floor < 5) return rng.chance(kind === 'stairs' ? 0.8 : 0.5) ? 3 : 2;
  if (floor < 8) return 3;
  return rng.chance(kind === 'stairs' ? 0.6 : 0.3) ? 4 : 3;
}

export function generate(o: GenOpts): GenRoom {
  const rng = new Rng(o.seed);
  const f = o.floor;
  const minPush = Math.min(10, 3 + f + (o.kind === 'stairs' ? 1 : 0)) + (o.kind === 'final' ? 3 : 0);
  let best: GenRoom | null = null;
  for (let attempt = 0; attempt < 40 && !(best && attempt >= 18); attempt++) {
    // After 18 failed tries, use fewer crates and a bigger solver budget.
    const pass = Math.floor(attempt / 18);
    const crates = Math.max(2, crateCount(f, o.kind, rng) - pass);
    let rows: string[] | null;
    let template = false;
    if (o.kind !== 'final' && pass === 0 && rng.chance(0.45)) {
      rows = transform(rng.pick(TEMPLATES), rng.int(0, 3), rng.chance(0.5));
      template = true;
    } else {
      rows = randomShape(rng, f, crates, o.kind === 'final');
    }
    if (!rows) continue;
    const w = rows[0].length;
    const h = rows.length;
    const tiles = rows.join('').split('');
    const room0: RoomDef = { w, h, tiles };
    const door = placeDoor(rng, room0);
    if (door < 0) continue;
    tiles[door] = 'D';
    const room: RoomDef = { w, h, tiles };
    const base = emptyState(room);
    let id = 0;
    base.crates = tiles.map((t, i) => (t === '_' ? i : -1)).filter((i) => i >= 0).map((pos) => ({ id: id++, pos, kind: 'box' as CrateKind }));
    const inner = [0, 1, 2, 3].map((d) => step(room, door, d as Dir)).find((n) => n >= 0 && isFloorTile(tiles[n]))!;
    if (base.crates.some((c) => c.pos === inner)) continue;
    base.p = inner;
    let tries = 0;
    let s: RoomState | null = null;
    let sol = null;
    while (tries++ < 5) {
      const cand = scramble(rng, base, rng.int(12, 24 + f * 4));
      if (!cand) continue;
      const so = solve(cand, 8000 * (pass + 1));
      if (!so) continue;
      if (!sol || so.pushes > sol.pushes) {
        s = cand;
        sol = so;
      }
      if (sol.pushes >= minPush) break;
    }
    if (!s || !sol) continue;
    const g: GenRoom = { start: s, par: sol.moves.length, pushes: sol.pushes, solution: sol.moves, template };
    if (!best || g.pushes > best.pushes) best = g;
    if (sol.pushes >= minPush) break;
  }
  if (!best) throw new Error('room generation failed');
  return decorate(best, o, rng);
}

/** Special crates, cracked walls, monsters and loot. Each change is checked with the solver. */
function decorate(g: GenRoom, o: GenOpts, rng: Rng): GenRoom {
  const f = o.floor;
  let cur = g;
  const resolve = (s: RoomState): GenRoom | null => {
    const so = solve(s, 12000);
    return so ? { ...cur, start: s, par: so.moves.length, pushes: so.pushes, solution: so.moves } : null;
  };
  const freeCells = (s: RoomState): number[] => {
    const r = reach(s);
    return [...r.keys()].filter((i) => r[i] && i !== s.p && s.room.tiles[i] === '.' && !s.items.some((it) => it.pos === i));
  };
  // Ice crate.
  if (f >= 1 && rng.chance(Math.min(0.7, 0.25 + f * 0.06))) {
    const s = { ...cur.start, crates: cur.start.crates.map((c) => ({ ...c })) };
    rng.pick(s.crates).kind = 'ice';
    const n = resolve(s);
    if (n && n.pushes >= 2) cur = n;
  }
  // Iron crate with a might pickup.
  if (f >= 3 && rng.chance(Math.min(0.6, 0.2 + f * 0.05))) {
    const s = { ...cur.start, crates: cur.start.crates.map((c) => ({ ...c })), items: [...cur.start.items] };
    const boxes = s.crates.filter((c) => c.kind === 'box');
    const cells = freeCells(s);
    if (boxes.length && cells.length) {
      rng.pick(boxes).kind = 'heavy';
      s.items.push({ pos: rng.pick(cells), kind: 'might' });
      const n = resolve(s);
      if (n) cur = n;
    }
  }
  // Cracked wall with a chest, and a bomb crate.
  if (o.kind === 'treasure' || (f >= 1 && rng.chance(0.35))) {
    const s = { ...cur.start, crates: cur.start.crates.map((c) => ({ ...c })), items: [...cur.start.items], room: { ...cur.start.room, tiles: [...cur.start.room.tiles] } };
    const r = s.room;
    const walls: number[] = [];
    for (let i = 0; i < r.tiles.length; i++) {
      if (r.tiles[i] !== '#') continue;
      const x = i % r.w;
      const y = Math.floor(i / r.w);
      if ((x === 0 || x === r.w - 1) && (y === 0 || y === r.h - 1)) continue;
      // A bomb must be able to reach it: floor in front and floor two steps in front.
      for (let d = 0 as Dir; d < 4; d++) {
        const a = step(r, i, d as Dir);
        const b = a >= 0 ? step(r, a, d as Dir) : -1;
        const c = b >= 0 ? step(r, b, d as Dir) : -1;
        if (a >= 0 && b >= 0 && c >= 0 && r.tiles[a] === '.' && r.tiles[b] === '.' && isFloorTile(r.tiles[c])) walls.push(i * 4 + d);
      }
    }
    if (walls.length) {
      const pick = rng.pick(walls);
      const wall = Math.floor(pick / 4);
      const d = (pick % 4) as Dir;
      const bombAt = step(r, step(r, wall, d), d);
      if (!s.crates.some((c) => c.pos === bombAt || c.pos === step(r, wall, d)) && bombAt !== s.p) {
        r.tiles[wall] = 'x';
        const loot: Item = rng.chance(0.4) ? { pos: wall, kind: 'tool', tool: rng.pick(o.tools.length ? o.tools : TOOL_IDS) } : rng.chance(0.5) ? { pos: wall, kind: 'key' } : { pos: wall, kind: 'coin', n: 6 + f };
        s.items.push(loot, { pos: wall, kind: 'gem' });
        s.crates.push({ id: 90, pos: bombAt, kind: 'bomb' });
        const n = resolve(s);
        if (n) cur = n;
      }
    }
  }
  const s: RoomState = { ...cur.start, items: [...cur.start.items], monsters: [] as Monster[] };
  // Loot on the floor.
  const coins = rng.int(1, 2) + (o.kind === 'treasure' ? 3 : 0);
  for (let k = 0; k < coins; k++) {
    const cells = freeCells(s);
    if (cells.length) s.items.push({ pos: rng.pick(cells), kind: 'coin', n: rng.int(1, 3) + Math.floor(f / 3) });
  }
  if (o.kind === 'treasure' || rng.chance(0.12)) {
    const cells = freeCells(s);
    if (cells.length) s.items.push({ pos: rng.pick(cells), kind: 'key' });
  }
  // Monsters.
  const kinds = (Object.keys(MONSTERS) as MonsterKind[]).filter((k) => f >= MONSTERS[k].from);
  let mons = 0;
  if (kinds.length) {
    if (o.kind === 'stairs') mons = f >= 7 ? 2 : 1;
    else if (o.kind === 'final') mons = 2;
    else if (rng.chance(0.25 + f * 0.04)) mons = 1;
  }
  const [px, py] = [s.p % s.room.w, Math.floor(s.p / s.room.w)];
  for (let k = 0; k < mons; k++) {
    const all = freeCells(s).filter((i) => !s.monsters.some((m) => m.pos === i) && s.room.tiles[i] !== '_');
    const dist = (i: number): number => Math.abs((i % s.room.w) - px) + Math.abs(Math.floor(i / s.room.w) - py);
    const far = all.filter((i) => dist(i) >= 4);
    const cells = far.length ? far : all.filter((i) => dist(i) >= 2);
    if (!cells.length) break;
    s.monsters.push({ id: k + 1, pos: rng.pick(cells), kind: rng.pick(kinds), dir: rng.int(0, 3) as Dir });
  }
  return { ...cur, start: s };
}
