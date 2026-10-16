/** Seeded facility generator: a 3×3 grid of rooms from templates, joined by doors and arches. */
import { ROOMS, type GuardKind, type MissionKind } from './data';
import { DOOR, DX, DY, EXIT, FLOOR, WALL, COVER, coneTiles, distMap, isWalk } from './grid';
import { CAM_RANGE, agentVision, guardIntent, newGuard, plannedCone, type MAgent, type Mission, type Obj } from './engine';
import { Rng, hash } from './rng';

const CW = 3;
const CH = 3;
const RS = 4;
export const MAP_W = CW * (RS + 1) + 1;
export const MAP_H = CH * (RS + 1) + 1;

interface Edge {
  a: number;
  b: number;
}

const cellX = (c: number): number => (c % CW) * (RS + 1) + 1;
const cellY = (c: number): number => Math.floor(c / CW) * (RS + 1) + 1;

function cellTiles(c: number): number[] {
  const out: number[] = [];
  for (let y = 0; y < RS; y++) for (let x = 0; x < RS; x++) out.push((cellY(c) + y) * MAP_W + cellX(c) + x);
  return out;
}

function neighbors(c: number): number[] {
  const x = c % CW;
  const y = Math.floor(c / CW);
  const out: number[] = [];
  if (x > 0) out.push(c - 1);
  if (x < CW - 1) out.push(c + 1);
  if (y > 0) out.push(c - CW);
  if (y < CH - 1) out.push(c + CW);
  return out;
}

/** The 4 wall tiles between two neighbor cells. */
function wallBetween(a: number, b: number): number[] {
  const [p, q] = a < b ? [a, b] : [b, a];
  const out: number[] = [];
  if (q === p + 1) {
    const x = cellX(q) - 1;
    for (let k = 0; k < RS; k++) out.push((cellY(p) + k) * MAP_W + x);
  } else {
    const y = cellY(q) - 1;
    for (let k = 0; k < RS; k++) out.push(y * MAP_W + cellX(p) + k);
  }
  return out;
}

function template(rng: Rng): string[][] {
  let g = rng.pick(ROOMS).rows.map((r) => r.split(''));
  const rot = rng.int(0, 3);
  for (let k = 0; k < rot; k++) g = g[0].map((_, i) => g.map((row) => row[i]).reverse());
  if (rng.chance(0.5)) g = g.map((r) => [...r].reverse());
  return g;
}

export interface MissionSetup {
  seed: number;
  kind: MissionKind;
  sec: number;
  team: MAgent[];
  rewinds: number;
}

function guardPlan(kind: MissionKind, sec: number, rng: Rng): GuardKind[] {
  const n = kind === 'vault' ? 4 : Math.min(5, 2 + Math.floor((sec - 1) / 2));
  const out: GuardKind[] = [];
  if (kind === 'vault') out.push('captain');
  if (sec >= 5 && kind !== 'vault') out.push('enforcer');
  if (sec >= 4) out.push('drone');
  while (out.length < n) out.push(rng.chance(0.3) ? 'sentry' : 'guard');
  return out.slice(0, n);
}

/** Build one mission. Retries until the layout is connected and the start is safe. */
export function makeMission(s: MissionSetup): Mission {
  for (let attempt = 0; attempt < 200; attempt++) {
    const m = tryMake(s, new Rng(hash(s.seed, 'level', attempt)));
    if (m) return m;
  }
  throw new Error('level generation failed');
}

function tryMake(s: MissionSetup, rng: Rng): Mission | null {
  const W = MAP_W;
  const H = MAP_H;
  const t = new Array<number>(W * H).fill(WALL);
  const cells = CW * CH;
  // Spanning tree with a random DFS, then some extra links.
  const start = rng.pick([0, 1, 2, 3, 5, 6, 7, 8]);
  const seen = new Set<number>([start]);
  const stack = [start];
  const edges: Edge[] = [];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const ns = rng.shuffle(neighbors(c).filter((n) => !seen.has(n)));
    if (!ns.length) {
      stack.pop();
      continue;
    }
    seen.add(ns[0]);
    edges.push({ a: c, b: ns[0] });
    stack.push(ns[0]);
  }
  const extra = rng.int(1, 3);
  for (let k = 0; k < 20 && edges.length < cells - 1 + extra; k++) {
    const a = rng.int(0, cells - 1);
    const b = rng.pick(neighbors(a));
    if (edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))) continue;
    edges.push({ a, b });
  }
  // Cell graph distances from the start.
  const cd = new Array<number>(cells).fill(-1);
  cd[start] = 0;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    for (const e of edges) {
      const o = e.a === q[h] ? e.b : e.b === q[h] ? e.a : -1;
      if (o >= 0 && cd[o] < 0) {
        cd[o] = cd[q[h]] + 1;
        q.push(o);
      }
    }
  }
  const far = Math.max(...cd);
  const target = rng.pick(cd.map((d, c) => (d === far ? c : -1)).filter((c) => c >= 0));
  // Carve rooms.
  for (let c = 0; c < cells; c++) {
    const tpl = c === start ? null : template(rng);
    for (let y = 0; y < RS; y++)
      for (let x = 0; x < RS; x++) t[(cellY(c) + y) * W + cellX(c) + x] = tpl && tpl[y][x] === 'c' ? COVER : FLOOR;
  }
  // Doors and arches.
  for (const e of edges) {
    const wall = wallBetween(e.a, e.b);
    const special = e.a === start || e.b === start || e.a === target || e.b === target;
    if (!special && rng.chance(0.3)) {
      const k = rng.int(0, RS - 2);
      t[wall[k]] = FLOOR;
      t[wall[k + 1]] = FLOOR;
    } else t[wall[rng.int(0, RS - 1)]] = DOOR;
  }
  // Keep the tiles next to doors and arches clear.
  const isWallLine = (i: number) => (i % W) % (RS + 1) === 0 || Math.floor(i / W) % (RS + 1) === 0;
  for (let i = 0; i < t.length; i++) {
    if (!isWallLine(i) || (t[i] !== FLOOR && t[i] !== DOOR)) continue;
    const x = i % W;
    const y = Math.floor(i / W);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (t[ny * W + nx] === COVER) t[ny * W + nx] = FLOOR;
    }
  }
  // Exit pad: a 2×2 corner of the start room, away from the doors.
  const sx = cellX(start);
  const sy = cellY(start);
  const corners = [
    [sx, sy],
    [sx + 2, sy],
    [sx, sy + 2],
    [sx + 2, sy + 2],
  ];
  const nearDoor = (x: number, y: number) =>
    [0, 1, 2, 3].some((d) => {
      const nx = x + DX[d];
      const ny = y + DY[d];
      return t[ny * W + nx] === DOOR;
    });
  const corner = rng.shuffle(corners).find(([cx, cy]) => !nearDoor(cx, cy) && !nearDoor(cx + 1, cy) && !nearDoor(cx, cy + 1) && !nearDoor(cx + 1, cy + 1)) ?? corners[0];
  const exits: number[] = [];
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) exits.push((corner[1] + y) * W + corner[0] + x);
  for (const i of exits) t[i] = EXIT;

  const m: Mission = {
    seed: s.seed,
    kind: s.kind,
    sec: s.sec,
    W,
    H,
    t,
    seen: new Array<number>(W * H).fill(0),
    peek: [],
    smoke: new Array<number>(W * H).fill(0),
    objs: [],
    guards: [],
    agents: s.team.map((a, k) => ({ ...a, gadgets: a.gadgets.map((g) => ({ ...g })), x: exits[k] % W, y: Math.floor(exits[k] / W) })),
    turn: 1,
    alarm: 0,
    pwr: 0,
    credits: 0,
    goal: false,
    rewinds: s.rewinds,
    over: '',
    nextId: 1,
    fx: [],
    log: [],
    spots: 0,
    kos: 0,
    ev: [],
  };

  // Object spots: floor next to a wall, not next to a door or an arch.
  const used = new Set<number>(exits);
  const spot = (c: number): number => {
    const opts = cellTiles(c).filter((i) => {
      if (t[i] !== FLOOR || used.has(i)) return false;
      const x = i % W;
      const y = Math.floor(i / W);
      let walls = 0;
      for (let d = 0; d < 4; d++) {
        const ni = (y + DY[d]) * W + x + DX[d];
        if (t[ni] === DOOR) return false;
        if (t[ni] === FLOOR && isWallLine(ni)) return false;
        if (t[ni] === WALL) walls++;
      }
      return walls > 0;
    });
    if (!opts.length) return -1;
    const i = rng.pick(opts);
    used.add(i);
    return i;
  };
  const addObj = (kind: Obj['kind'], at: number, lock: number, credits: number, dir = 0) => {
    m.objs.push({ id: m.nextId++, kind, x: at % W, y: Math.floor(at / W), used: false, lock, credits, dir, off: 0, tripped: -1 });
  };
  const tAt = spot(target);
  if (tAt < 0) return null;
  addObj('target', tAt, s.kind === 'vault' ? 4 : 2 + Math.floor(s.sec / 3), 0);
  const others = rng.shuffle([...Array(cells).keys()].filter((c) => c !== start));
  const nTerm = s.kind === 'server' || s.kind === 'vault' ? 3 : 2;
  const nSafe = s.kind === 'vault' ? 2 : rng.int(1, 2);
  let oi = 0;
  for (let k = 0; k < nTerm; k++) {
    const c = others.filter((x) => x !== target)[oi++ % (cells - 2)];
    const at = spot(c);
    if (at < 0) return null;
    addObj('terminal', at, 0, 0);
  }
  for (let k = 0; k < nSafe; k++) {
    const c = others[oi++ % (cells - 1)];
    const at = spot(c);
    if (at < 0) continue;
    addObj('safe', at, rng.int(1, 2), rng.int(30, 55) + s.sec * 8);
  }
  // Connectivity: every floor tile and every object is reachable from the exit.
  const solid = (i: number) => t[i] === COVER || m.objs.some((o) => o.y * W + o.x === i);
  const dm = distMap(m, [exits[0]], solid);
  for (let i = 0; i < t.length; i++) if ((t[i] === FLOOR || t[i] === EXIT || t[i] === DOOR) && !solid(i) && dm[i] < 0) return null;
  for (const o of m.objs) {
    const ok = [0, 1, 2, 3].some((d) => {
      const ni = (o.y + DY[d]) * W + o.x + DX[d];
      return dm[ni] >= 0;
    });
    if (!ok) return null;
  }
  const startTiles = new Set(cellTiles(start));
  // Cameras on room walls, looking in.
  const nCam = s.kind === 'vault' ? 3 : Math.min(3, 1 + Math.floor(s.sec / 3)) + (s.kind === 'server' ? 1 : 0);
  for (let k = 0, tries = 0; k < nCam && tries < 60; tries++) {
    const c = rng.pick(others);
    if (cd[c] < 1) continue;
    const d = rng.int(0, 3);
    // The wall opposite to direction d, looking in direction d.
    const off = rng.int(1, 2);
    let x: number;
    let y: number;
    if (d === 0) [x, y] = [cellX(c) - 1, cellY(c) + off];
    else if (d === 2) [x, y] = [cellX(c) + RS, cellY(c) + off];
    else if (d === 1) [x, y] = [cellX(c) + off, cellY(c) - 1];
    else [x, y] = [cellX(c) + off, cellY(c) + RS];
    const i = y * W + x;
    if (t[i] !== WALL || m.objs.some((o) => o.x === x && o.y === y)) continue;
    const cone = coneTiles(m, x, y, d, CAM_RANGE);
    if (cone.some((j) => startTiles.has(j))) continue;
    addObj('camera', i, 0, 0, d);
    k++;
  }
  // Guards, away from the start.
  const kinds = guardPlan(s.kind, s.sec, rng);
  const minD = s.kind === 'vault' ? 1 : 2;
  const guardCells = [...Array(cells).keys()].filter((c) => cd[c] >= minD);
  const free = (i: number) => t[i] === FLOOR && !solid(i) && !m.guards.some((g) => g.y * W + g.x === i);
  for (const kind of kinds) {
    let placed = false;
    for (let tries = 0; tries < 40 && !placed; tries++) {
      const c = kind === 'captain' ? target : rng.pick(guardCells);
      const at = rng.pick(cellTiles(c).filter(free));
      if (at === undefined) continue;
      let route: number[] = [at];
      if (kind !== 'sentry' && kind !== 'captain') {
        const pts = rng.shuffle(others.filter((o) => o !== c)).slice(0, rng.int(1, 2));
        for (const p of pts) {
          const tile = rng.pick(cellTiles(p).filter(free));
          if (tile !== undefined) route.push(tile);
        }
      }
      if (kind === 'captain') route = [at, ...cellTiles(target).filter(free).slice(0, 1)];
      const g = newGuard(m, kind, at, route);
      // Face an open direction.
      const dirs = [0, 1, 2, 3].filter((d) => isWalk(t[(g.y + DY[d]) * W + g.x + DX[d]]));
      g.dir = dirs.length ? rng.pick(dirs) : 0;
      g.dirs = [g.dir, (g.dir + (rng.chance(0.5) ? 1 : 3)) % 4];
      const it = guardIntent(m, g);
      const cone = plannedCone(m, g, it);
      if (cone.some((j) => startTiles.has(j))) {
        m.nextId--;
        continue;
      }
      m.guards.push(g);
      placed = true;
    }
  }
  if (m.guards.length < Math.max(1, kinds.length - 1)) return null;
  // Intel: the target room and the cameras are on the building plan.
  for (const o of m.objs) if (o.kind === 'camera') m.seen[o.y * W + o.x] = 1;
  for (const i of cellTiles(target)) m.seen[i] = 1;
  const v = agentVision(m);
  for (let i = 0; i < v.length; i++) if (v[i]) m.seen[i] = 1;
  return m;
}
