/** Room rules. `move(state, dir)` is pure: it returns a new state and never changes the old one. */
import { BITE, type CrateKind, type ItemKind, type MonsterKind, type ToolId } from './data';
import { hash } from './rng';

/** 0 up, 1 right, 2 down, 3 left. 4 means wait. */
export type Dir = 0 | 1 | 2 | 3;
export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const DIR_NAMES = ['up', 'right', 'down', 'left'];

export interface RoomDef {
  w: number;
  h: number;
  /** `#` wall, `.` floor, `_` plate, `x` cracked wall, `D` door. */
  tiles: string[];
}

export interface Crate {
  id: number;
  pos: number;
  kind: CrateKind;
}

export interface Monster {
  id: number;
  pos: number;
  kind: MonsterKind;
  dir: Dir;
  /** Turns to rest after a bite. */
  cd?: number;
}

export interface Item {
  pos: number;
  kind: ItemKind;
  tool?: ToolId;
  n?: number;
}

/** One short visual event of the last move, for the renderer. */
export interface Fx {
  kind: 'push' | 'shove' | 'bump' | 'bite' | 'boom' | 'pick' | 'plate' | 'open' | 'exit' | 'tool' | 'kill' | 'slide' | 'pull' | 'warp' | 'phase' | 'heavy';
  pos: number;
  text?: string;
}

export interface RoomState {
  room: RoomDef;
  p: number;
  facing: Dir;
  crates: Crate[];
  monsters: Monster[];
  items: Item[];
  broken: number[];
  might: boolean;
  budget: number;
  moves: number;
  tools: Partial<Record<ToolId, number>>;
  mode: ToolId | null;
  gold: number;
  keys: number;
  gems: number;
  exited: boolean;
  turn: number;
  fx: Fx[];
}

export const idx = (r: RoomDef, x: number, y: number): number => y * r.w + x;
export const xy = (r: RoomDef, i: number): [number, number] => [i % r.w, Math.floor(i / r.w)];

/** Neighbor index, or -1 when it leaves the grid. */
export function step(r: RoomDef, i: number, d: Dir): number {
  const x = (i % r.w) + DX[d];
  const y = Math.floor(i / r.w) + DY[d];
  if (x < 0 || y < 0 || x >= r.w || y >= r.h) return -1;
  return y * r.w + x;
}

export function tileAt(s: RoomState, i: number): string {
  if (i < 0) return '#';
  const t = s.room.tiles[i];
  if (t === 'x' && s.broken.includes(i)) return '.';
  return t;
}

export const isFloorTile = (t: string): boolean => t === '.' || t === '_';
export const crateAt = (s: RoomState, i: number): Crate | undefined => s.crates.find((c) => c.pos === i);
export const monsterAt = (s: RoomState, i: number): Monster | undefined => s.monsters.find((m) => m.pos === i);

const plateCache = new WeakMap<RoomDef, number[]>();

export function plates(r: RoomDef): number[] {
  let out = plateCache.get(r);
  if (out) return out;
  out = [];
  r.tiles.forEach((t, i) => {
    if (t === '_') out!.push(i);
  });
  plateCache.set(r, out);
  return out;
}

export function isSolved(s: RoomState): boolean {
  for (const p of plates(s.room)) {
    let on = false;
    for (const c of s.crates) if (c.pos === p) on = true;
    if (!on) return false;
  }
  return true;
}

export const doorPos = (r: RoomDef): number => r.tiles.indexOf('D');

/** A crate (or a monster) may enter this cell. */
function freeForCrate(s: RoomState, i: number): boolean {
  return i >= 0 && isFloorTile(tileAt(s, i)) && !crateAt(s, i) && !monsterAt(s, i);
}

function freeForWalk(s: RoomState, i: number): boolean {
  return i >= 0 && isFloorTile(tileAt(s, i)) && !crateAt(s, i) && !monsterAt(s, i);
}

function clone(s: RoomState): RoomState {
  return {
    ...s,
    crates: s.crates.map((c) => ({ ...c })),
    monsters: s.monsters.map((m) => ({ ...m })),
    items: s.items.map((it) => ({ ...it })),
    broken: [...s.broken],
    tools: { ...s.tools },
    fx: [],
  };
}

export interface MoveOpts {
  /** Brute: pushes iron crates without might. */
  strong?: boolean;
  /** Thief: coins count double. */
  coinMult?: number;
  /** The solver skips monsters and items. */
  bare?: boolean;
}

/**
 * Apply one move. `dir` 0-3 moves (or uses the armed tool), 4 waits a turn.
 * A move that does nothing returns a state with only a `bump` effect and the same counters.
 */
export function move(s0: RoomState, dir: Dir | 4, o: MoveOpts = {}): RoomState {
  if (s0.exited || s0.budget <= 0) return { ...s0, fx: [{ kind: 'bump', pos: s0.p }] };
  const s = clone(s0);
  const bump = (text?: string): RoomState => ({ ...s0, facing: dir === 4 ? s0.facing : dir, fx: [{ kind: 'bump', pos: s0.p, text }] });
  if (dir === 4) {
    s.moves++;
    s.budget--;
    s.turn++;
    monstersAct(s, o);
    return s;
  }
  s.facing = dir;
  const t = step(s.room, s.p, dir);
  const solvedBefore = isSolved(s0);

  if (s.mode) {
    const r = useAimed(s, dir, t);
    if (r === 'fail') return bump('Nothing happens');
    if (r === 'done') return finish(s, solvedBefore, o);
    // 'walk': the glove found no crate, so this is a normal step.
  }

  const tile = tileAt(s, t);
  if (tile === 'D') {
    if (!solvedBefore) return bump('The door is shut');
    s.p = t;
    s.exited = true;
    s.moves++;
    s.budget--;
    s.fx.push({ kind: 'exit', pos: t });
    return s;
  }
  if (!isFloorTile(tile)) return bump();
  const mon = monsterAt(s, t);
  if (mon) {
    // Shove the monster back one tile. With no room behind it, it gets squashed.
    const back = step(s.room, t, dir);
    if (canMonsterEnter(s, back, false)) {
      mon.pos = back;
      mon.cd = 1;
      s.fx.push({ kind: 'shove', pos: back, text: 'Shove!' });
    } else {
      s.monsters = s.monsters.filter((m) => m !== mon);
      s.fx.push({ kind: 'kill', pos: t, text: 'Squash!' });
    }
    s.moves++;
    s.budget--;
    s.turn++;
    return finish(s, solvedBefore, o);
  }
  const c = crateAt(s, t);
  if (c) {
    if (c.kind === 'heavy' && !s.might && !o.strong) return { ...s0, facing: dir, fx: [{ kind: 'bump', pos: s0.p, text: 'Too heavy! Find 💪' }, { kind: 'heavy', pos: t }] };
    const t2 = step(s.room, t, dir);
    if (c.kind === 'bomb' && tileAt(s, t2) === 'x') {
      explode(s, t, t2);
      s.moves++;
      s.budget--;
      s.turn++;
      return finish(s, solvedBefore, o);
    }
    const pinned = t2 >= 0 ? monsterAt(s, t2) : undefined;
    if (pinned && !canMonsterEnter(s, step(s.room, t2, dir), false)) {
      // A monster pinned against a wall gets crushed by the crate.
      s.monsters = s.monsters.filter((m) => m !== pinned);
      s.fx.push({ kind: 'kill', pos: t2, text: 'Crushed!' });
    }
    if (!freeForCrate(s, t2)) return bump();
    let dest = t2;
    if (c.kind === 'ice') {
      for (;;) {
        const n = step(s.room, dest, dir);
        if (!freeForCrate(s, n)) break;
        dest = n;
      }
      if (dest !== t2) s.fx.push({ kind: 'slide', pos: dest });
    }
    c.pos = dest;
    s.fx.push({ kind: 'push', pos: dest });
    if (s.room.tiles[dest] === '_') s.fx.push({ kind: 'plate', pos: dest });
  }
  s.p = t;
  s.moves++;
  s.budget--;
  s.turn++;
  return finish(s, solvedBefore, o);
}

/** Pick up items, move monsters, and note when the door opens. */
function finish(s: RoomState, solvedBefore: boolean, o: MoveOpts): RoomState {
  pickUp(s, o);
  monstersAct(s, o);
  if (!solvedBefore && isSolved(s)) s.fx.push({ kind: 'open', pos: doorPos(s.room) });
  return s;
}

function pickUp(s: RoomState, o: MoveOpts): void {
  const here = s.items.filter((it) => it.pos === s.p);
  if (!here.length) return;
  s.items = s.items.filter((it) => it.pos !== s.p);
  for (const it of here) {
    let text = '';
    switch (it.kind) {
      case 'coin': {
        const n = (it.n ?? 1) * (o.coinMult ?? 1);
        s.gold += n;
        text = `+${n} 🪙`;
        break;
      }
      case 'gem':
        s.gems += 1;
        text = '+1 💎';
        break;
      case 'key':
        s.keys += 1;
        text = '+1 🗝️';
        break;
      case 'might':
        s.might = true;
        text = '💪 Might!';
        break;
      case 'tool':
        if (it.tool) s.tools[it.tool] = (s.tools[it.tool] ?? 0) + 1;
        text = 'Tool!';
        break;
    }
    s.fx.push({ kind: 'pick', pos: s.p, text });
  }
}

function explode(s: RoomState, at: number, wall: number): void {
  s.crates = s.crates.filter((c) => c.pos !== at);
  const queue = [wall];
  while (queue.length) {
    const w = queue.pop()!;
    if (s.broken.includes(w)) continue;
    s.broken.push(w);
    for (let d = 0 as Dir; d < 4; d++) {
      const n = step(s.room, w, d as Dir);
      if (n >= 0 && s.room.tiles[n] === 'x' && !s.broken.includes(n)) queue.push(n);
    }
  }
  const [ax, ay] = xy(s.room, at);
  const before = s.monsters.length;
  s.monsters = s.monsters.filter((m) => {
    const [mx, my] = xy(s.room, m.pos);
    const hit = Math.abs(mx - ax) <= 1 && Math.abs(my - ay) <= 1;
    if (hit) s.fx.push({ kind: 'kill', pos: m.pos });
    return !hit;
  });
  s.fx.push({ kind: 'boom', pos: at, text: before > s.monsters.length ? 'Boom! Monster down' : 'Boom!' });
}

/** Aimed tools. 'done' used it, 'fail' did nothing, 'walk' means take a normal step. */
function useAimed(s: RoomState, dir: Dir, t: number): 'done' | 'fail' | 'walk' {
  const mode = s.mode!;
  const spend = (): void => {
    s.tools[mode] = Math.max(0, (s.tools[mode] ?? 0) - 1);
    s.mode = null;
    s.moves++;
    s.budget--;
    s.turn++;
  };
  if (mode === 'glove') {
    const back = step(s.room, s.p, ((dir + 2) % 4) as Dir);
    const c = back >= 0 ? crateAt(s, back) : undefined;
    if (!c) return 'walk';
    if (!freeForWalk(s, t)) return 'fail';
    c.pos = s.p;
    s.p = t;
    s.fx.push({ kind: 'pull', pos: c.pos });
    if (s.room.tiles[c.pos] === '_') s.fx.push({ kind: 'plate', pos: c.pos });
    spend();
    return 'done';
  }
  if (mode === 'warp') {
    let i = t;
    while (i >= 0 && isFloorTile(tileAt(s, i))) {
      const c = crateAt(s, i);
      if (c) {
        const old = s.p;
        s.p = c.pos;
        c.pos = old;
        s.fx.push({ kind: 'warp', pos: s.p }, { kind: 'warp', pos: old });
        if (s.room.tiles[old] === '_') s.fx.push({ kind: 'plate', pos: old });
        spend();
        return 'done';
      }
      if (monsterAt(s, i)) break;
      i = step(s.room, i, dir);
    }
    return 'fail';
  }
  if (mode === 'phase') {
    const tt = tileAt(s, t);
    if (tt !== '#' && tt !== 'x') return 'fail';
    const beyond = step(s.room, t, dir);
    if (!freeForWalk(s, beyond)) return 'fail';
    s.p = beyond;
    s.fx.push({ kind: 'phase', pos: beyond });
    spend();
    return 'done';
  }
  return 'walk';
}

/** Instant tools, or arm / disarm an aimed tool. Pure. */
export function useTool(s0: RoomState, id: ToolId, aimed: boolean): RoomState {
  if (s0.exited) return s0;
  if ((s0.tools[id] ?? 0) <= 0) return s0;
  const s = clone(s0);
  if (aimed) {
    s.mode = s.mode === id ? null : id;
    return s;
  }
  s.tools[id] = (s.tools[id] ?? 0) - 1;
  if (id === 'hourglass') {
    s.budget += 15;
    s.fx.push({ kind: 'tool', pos: s.p, text: '+15 moves' });
  } else if (id === 'tonic') {
    s.might = true;
    s.fx.push({ kind: 'tool', pos: s.p, text: '💪 Might!' });
  }
  return s;
}

/** Monster turn. Monster moves depend only on the state, so undo and replay give the same result. */
function monstersAct(s: RoomState, o: MoveOpts): void {
  if (o.bare) return;
  for (const m of s.monsters) {
    if (m.cd) {
      m.cd--;
      continue;
    }
    let d: Dir | -1 = -1;
    if (m.kind === 'bat') {
      d = m.dir;
      if (!canMonsterEnter(s, step(s.room, m.pos, d), true)) {
        // Turn back. If that is blocked too, turn to the side.
        const tries = [(d + 2) % 4, (d + 1) % 4, (d + 3) % 4] as Dir[];
        d = tries.find((dd) => canMonsterEnter(s, step(s.room, m.pos, dd), true)) ?? -1;
        if (d !== -1) m.dir = d;
      }
    } else if (m.kind === 'skull') {
      const r = hash(m.id, s.turn, m.pos) % 4;
      for (let k = 0; k < 4; k++) {
        const dd = ((r + k) % 4) as Dir;
        if (canMonsterEnter(s, step(s.room, m.pos, dd), true)) {
          d = dd;
          break;
        }
      }
    } else if (m.kind === 'ghoul') {
      if (s.turn % 2 === 0) continue;
      const [mx, my] = xy(s.room, m.pos);
      const [px, py] = xy(s.room, s.p);
      const opts: Dir[] = [];
      const dx = px - mx;
      const dy = py - my;
      if (Math.abs(dx) >= Math.abs(dy)) {
        if (dx) opts.push(dx > 0 ? 1 : 3);
        if (dy) opts.push(dy > 0 ? 2 : 0);
      } else {
        if (dy) opts.push(dy > 0 ? 2 : 0);
        if (dx) opts.push(dx > 0 ? 1 : 3);
      }
      d = opts.find((dd) => canMonsterEnter(s, step(s.room, m.pos, dd), true)) ?? -1;
    }
    if (d === -1) continue;
    const n = step(s.room, m.pos, d);
    if (n === s.p) {
      s.budget = Math.max(0, s.budget - BITE);
      s.fx.push({ kind: 'bite', pos: s.p, text: `-${BITE} moves` });
      m.cd = 2;
      if (m.kind === 'bat') m.dir = ((d + 2) % 4) as Dir;
      continue;
    }
    if (canMonsterEnter(s, n, false)) m.pos = n;
  }
}

/** Monsters keep off the plates, so they never sit where a crate must go. */
function canMonsterEnter(s: RoomState, i: number, playerOk: boolean): boolean {
  if (i < 0) return false;
  if (i === s.p) return playerOk;
  return tileAt(s, i) === '.' && !crateAt(s, i) && !monsterAt(s, i);
}

/** Cells the player can walk to without pushing (monsters and items ignored). */
export function reach(s: RoomState): Uint8Array {
  const r = s.room;
  const w = r.w;
  const n = w * r.h;
  const seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = r.tiles[i];
    if (t !== '.' && t !== '_' && !(t === 'x' && s.broken.includes(i))) seen[i] = 2;
  }
  for (const c of s.crates) seen[c.pos] = 2;
  const stack = [s.p];
  seen[s.p] = 1;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0 && !seen[i - 1]) {
      seen[i - 1] = 1;
      stack.push(i - 1);
    }
    if (x < w - 1 && !seen[i + 1]) {
      seen[i + 1] = 1;
      stack.push(i + 1);
    }
    if (i >= w && !seen[i - w]) {
      seen[i - w] = 1;
      stack.push(i - w);
    }
    if (i + w < n && !seen[i + w]) {
      seen[i + w] = 1;
      stack.push(i + w);
    }
  }
  for (let i = 0; i < n; i++) if (seen[i] === 2) seen[i] = 0;
  return seen;
}

/** Shortest walk (no pushes) from the player to `goal`. Avoids monsters when `avoidMonsters`. */
export function walkPath(s: RoomState, goal: number, avoidMonsters = false): Dir[] | null {
  const r = s.room;
  if (goal === s.p) return [];
  const prev = new Int16Array(r.w * r.h).fill(-1);
  const pdir = new Int8Array(r.w * r.h);
  const q = [s.p];
  prev[s.p] = s.p;
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi];
    for (let d = 0; d < 4; d++) {
      const n = step(r, i, d as Dir);
      if (n < 0 || prev[n] >= 0) continue;
      if (!isFloorTile(tileAt(s, n)) || crateAt(s, n)) continue;
      if (avoidMonsters && monsterAt(s, n)) continue;
      prev[n] = i;
      pdir[n] = d;
      if (n === goal) {
        const path: Dir[] = [];
        let c = n;
        while (c !== s.p) {
          path.push(pdir[c] as Dir);
          c = prev[c];
        }
        return path.reverse();
      }
      q.push(n);
    }
  }
  return null;
}
