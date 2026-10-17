/**
 * Breadth-first solver over pushes. Monsters are ignored. It finds the fewest pushes,
 * then turns them into a full list of moves (walks + pushes + the walk out of the door).
 */
import { doorPos, isSolved, move, reach, step, walkPath, type Dir, type RoomState } from './puzzle';

const KIND_CODE: Record<string, number> = { box: 0, ice: 1, heavy: 2, bomb: 3 };

export interface Solution {
  moves: Dir[];
  pushes: number;
  nodes: number;
}

interface Node {
  s: RoomState;
  r: Uint8Array;
  parent: number;
  from: number;
  dir: Dir;
}

/** Strip monsters and all items except might pickups. */
export function bare(s: RoomState): RoomState {
  return { ...s, monsters: [], items: s.items.filter((it) => it.kind === 'might'), mode: null, budget: 9999, fx: [] };
}

function absorbMight(s: RoomState, r: Uint8Array): RoomState {
  const it = s.items.find((x) => x.kind === 'might' && r[x.pos]);
  if (!it || s.might) return s;
  return { ...s, might: true, items: s.items.filter((x) => x !== it) };
}

function key(s: RoomState, r: Uint8Array): string {
  let min = 0;
  while (!r[min]) min++;
  const codes = s.crates.map((c) => c.pos * 4 + KIND_CODE[c.kind]).sort((a, b) => a - b);
  const br = [...s.broken].sort((a, b) => a - b);
  return String.fromCharCode(min, s.might ? 1 : 0, ...codes, 999, ...br);
}

function exitOpen(s: RoomState, r: Uint8Array): boolean {
  if (!isSolved(s)) return false;
  const d = doorPos(s.room);
  for (let k = 0; k < 4; k++) {
    const n = step(s.room, d, k as Dir);
    if (n >= 0 && r[n]) return true;
  }
  return false;
}

export function solve(start: RoomState, maxNodes = 60000, strong = false): Solution | null {
  const s0 = bare(start);
  const nodes: Node[] = [];
  const seen = new Set<string>();
  const r0 = reach(s0);
  const a0 = absorbMight(s0, r0);
  seen.add(key(a0, r0));
  nodes.push({ s: s0, r: r0, parent: -1, from: -1, dir: 0 });
  let goal = -1;
  if (exitOpen(a0, r0)) goal = 0;
  for (let qi = 0; qi < nodes.length && goal < 0; qi++) {
    if (nodes.length > maxNodes) return null;
    const raw = nodes[qi].s;
    const r = nodes[qi].r;
    const s = absorbMight(raw, r);
    const occ = new Set(s.crates.map((c) => c.pos));
    for (const c of s.crates) {
      for (let d = 0 as Dir; d < 4; d++) {
        const from = step(s.room, c.pos, ((d + 2) % 4) as Dir);
        if (from < 0 || !r[from]) continue;
        const t2 = step(s.room, c.pos, d as Dir);
        if (t2 < 0 || occ.has(t2)) continue;
        const tt = s.room.tiles[t2];
        if (tt === 'x') {
          if (c.kind !== 'bomb' && !s.broken.includes(t2)) continue;
        } else if (tt !== '.' && tt !== '_') continue;
        if (c.kind === 'heavy' && !s.might && !strong) continue;
        const ns = move({ ...s, p: from }, d as Dir, { bare: true, strong });
        if (ns.fx.length && ns.fx[0].kind === 'bump') continue;
        const nr = reach(ns);
        const na = absorbMight(ns, nr);
        const k = key(na, nr);
        if (seen.has(k)) continue;
        seen.add(k);
        nodes.push({ s: ns, r: nr, parent: qi, from, dir: d as Dir });
        if (exitOpen(na, nr)) {
          goal = nodes.length - 1;
          break;
        }
      }
      if (goal >= 0) break;
    }
  }
  if (goal < 0) return null;
  const chain: Node[] = [];
  for (let n = goal; n > 0; n = nodes[n].parent) chain.push(nodes[n]);
  chain.reverse();
  const moves = expand(start, chain.map((n) => [n.from, n.dir] as [number, Dir]), strong);
  if (!moves) return null;
  return { moves, pushes: chain.length, nodes: nodes.length };
}

/** Turn a list of pushes into moves by walking between them. Returns null if a walk fails. */
function expand(start: RoomState, pushes: [number, Dir][], strong: boolean): Dir[] | null {
  let s = bare(start);
  const out: Dir[] = [];
  const walk = (goal: number): boolean => {
    const path = walkPath(s, goal);
    if (!path) return false;
    for (const d of path) {
      s = move(s, d, { bare: true, strong });
      out.push(d);
    }
    return true;
  };
  for (const [from, d] of pushes) {
    const need = !s.might && !strong && s.crates.some((c) => c.kind === 'heavy' && c.pos === step(s.room, from, d));
    if (need) {
      const it = s.items.find((x) => x.kind === 'might');
      if (it && !walk(it.pos)) return null;
    }
    if (!walk(from)) return null;
    s = move(s, d, { bare: true, strong });
    out.push(d);
  }
  const door = doorPos(s.room);
  let best: Dir[] | null = null;
  let bestD: Dir = 0;
  for (let k = 0; k < 4; k++) {
    const n = step(s.room, door, k as Dir);
    if (n < 0) continue;
    const p = walkPath(s, n);
    if (p && (!best || p.length < best.length)) {
      best = p;
      bestD = ((k + 2) % 4) as Dir;
    }
  }
  if (!best) return null;
  for (const d of best) {
    s = move(s, d, { bare: true, strong });
    out.push(d);
  }
  out.push(bestD);
  return out;
}

/** Check a move list on the bare room. */
export function verify(start: RoomState, moves: Dir[], strong = false): boolean {
  let s = bare(start);
  for (const d of moves) s = move(s, d, { bare: true, strong });
  return s.exited;
}
