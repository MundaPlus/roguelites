/** The floor grid: tile contents, clues, flood fill, the logic solver and the generator. */
import { NORMALS, floorSpec, type ItemId, type MonsterId } from './data';
import { Rng, hash } from './rng';

export const EMPTY = 0;
export const MON = 1;
export const ITEM = 2;
export const CHEST = 3;

export const HIDDEN = 0;
export const SEEN = 1;
export const OPEN = 2;

/** Pickups that can lie on a tile. 'key' and 'coin' never go into item slots. */
export type Pickup = ItemId | 'key' | 'coin' | '';

export interface Board {
  w: number;
  h: number;
  floor: number;
  /** False until the first click places the monsters. */
  gen: boolean;
  kind: number[];
  mon: (MonsterId | '')[];
  /** Real strength (fight damage) of a monster. */
  str: number[];
  /** What the monster adds to clues (0 for ghosts). */
  cv: number[];
  item: Pickup[];
  st: number[];
  /** Player markers: 0 none, -1 '?', n > 0 a strength guess. */
  mark: number[];
  /** Mimics and chests whose true face is known. */
  unmask: number[];
  clue: number[];
  boss: number;
  bossStr: number;
  /** Clue values a hidden tile can hold, sorted, index 0 is value 0. */
  vals: number[];
  /** Count of tiles per value in `vals` (static). */
  valCount: number[];
  mimicStr: number;
  /** Gazers do not hide clues (Gazer Lens). */
  lens: boolean;
}

export function newBoard(floor: number, lens: boolean): Board {
  const s = floorSpec(floor);
  const n = s.w * s.h;
  return {
    w: s.w,
    h: s.h,
    floor,
    gen: false,
    kind: Array(n).fill(EMPTY),
    mon: Array(n).fill(''),
    str: Array(n).fill(0),
    cv: Array(n).fill(0),
    item: Array(n).fill(''),
    st: Array(n).fill(HIDDEN),
    mark: Array(n).fill(0),
    unmask: Array(n).fill(0),
    clue: Array(n).fill(0),
    boss: -1,
    bossStr: s.boss,
    vals: [0],
    valCount: [n],
    mimicStr: s.mimicStr,
    lens,
  };
}

const nbCache = new Map<string, number[][]>();

/** The 8 neighbors of each tile. */
export function nbrs(b: { w: number; h: number }): number[][] {
  const key = `${b.w}x${b.h}`;
  let res = nbCache.get(key);
  if (res) return res;
  res = [];
  for (let y = 0; y < b.h; y++)
    for (let x = 0; x < b.w; x++) {
      const out: number[] = [];
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < b.w && ny < b.h) out.push(ny * b.w + nx);
        }
      res.push(out);
    }
  nbCache.set(key, res);
  return res;
}

export const isDead = (b: Board, i: number): boolean => b.kind[i] === MON && b.st[i] === OPEN;
export const isAliveMon = (b: Board, i: number): boolean => b.kind[i] === MON && b.st[i] !== OPEN;

/** True when the tile looks like a chest to the player (chest or masked mimic). */
export const looksChest = (b: Board, i: number): boolean =>
  b.st[i] === SEEN && (b.kind[i] === CHEST || (b.mon[i] === 'mimic' && !b.unmask[i]));

/** An open tile shows its clue unless a living gazer stands next to it. */
export function clueShown(b: Board, i: number): boolean {
  if (b.st[i] !== OPEN) return false;
  if (b.lens) return true;
  for (const n of nbrs(b)[i]) if (b.mon[n] === 'gazer' && b.st[n] !== OPEN) return false;
  return true;
}

/** Opens a safe tile and flood-fills from zero clues. Returns the opened tiles. */
export function openFlood(b: Board, start: number): number[] {
  const nb = nbrs(b);
  const out: number[] = [];
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (b.st[i] === OPEN) continue;
    if (b.kind[i] === MON || b.kind[i] === CHEST) continue;
    b.st[i] = OPEN;
    out.push(i);
    if (b.clue[i] === 0 && clueShown(b, i)) for (const n of nb[i]) if (b.st[n] === HIDDEN) stack.push(n);
  }
  return out;
}

// ---------------- Solver ----------------

const popcount = (m: number): number => {
  let c = 0;
  while (m) {
    m &= m - 1;
    c++;
  }
  return c;
};
const lowBit = (m: number): number => 31 - Math.clz32(m & -m);

/** Domain bitmask (over b.vals) for each tile from the player's view. */
export function initialDomains(b: Board): number[] {
  const n = b.w * b.h;
  const full = (1 << b.vals.length) - 1;
  const hiddenMask = full & ~(b.vals.indexOf(b.mimicStr) >= 0 && !hiddenHasValue(b, b.mimicStr) ? 1 << b.vals.indexOf(b.mimicStr) : 0);
  const dom: number[] = Array(n);
  const bit = (v: number) => 1 << b.vals.indexOf(v);
  for (let i = 0; i < n; i++) {
    if (b.st[i] === OPEN) dom[i] = bit(b.cv[i]);
    else if (b.st[i] === SEEN) {
      if (looksChest(b, i)) dom[i] = 1 | bit(b.mimicStr);
      else dom[i] = bit(b.kind[i] === MON ? b.cv[i] : 0);
    } else dom[i] = hiddenMask;
  }
  return dom;
}

/** Hidden tiles can hold value v when a non-mimic, non-ghost monster has it. */
function hiddenHasValue(b: Board, v: number): boolean {
  for (let i = 0; i < b.kind.length; i++) if (b.kind[i] === MON && b.mon[i] !== 'mimic' && b.mon[i] !== 'ghost' && b.cv[i] === v) return true;
  return false;
}

interface Con {
  vars: number[];
  target: number;
}

const NODE_LIMIT = 4000;

/**
 * Narrows the domains with the visible clues and the value counts.
 * It only removes values that are impossible, so it never lies. `dom` is changed in place.
 */
export function deduce(b: Board, dom: number[] = initialDomains(b)): number[] {
  if (!b.gen) return dom;
  const n = b.w * b.h;
  const nb = nbrs(b);
  const vals = b.vals;
  const V = vals.length;
  const mnOf = (m: number) => vals[lowBit(m)];
  const mxOf = (m: number) => vals[31 - Math.clz32(m)];

  const buildCons = (): { cons: Con[]; byVar: Map<number, number[]> } => {
    const cons: Con[] = [];
    const byVar = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      if (!clueShown(b, i)) continue;
      let target = b.clue[i];
      const vars: number[] = [];
      for (const k of nb[i]) {
        const d = dom[k];
        if (popcount(d) === 1) target -= vals[lowBit(d)];
        else vars.push(k);
      }
      if (!vars.length) continue;
      const ci = cons.length;
      cons.push({ vars, target });
      for (const v of vars) {
        const l = byVar.get(v);
        if (l) l.push(ci);
        else byVar.set(v, [ci]);
      }
    }
    return { cons, byVar };
  };

  const countRule = (): boolean => {
    let changed = false;
    for (let k = 0; k < V; k++) {
      const bit = 1 << k;
      let known = 0;
      const cand: number[] = [];
      for (let i = 0; i < n; i++) {
        if (!(dom[i] & bit)) continue;
        if (dom[i] === bit) known++;
        else cand.push(i);
      }
      if (!cand.length) continue;
      if (known >= b.valCount[k]) {
        for (const i of cand) dom[i] &= ~bit;
        changed = true;
      } else if (known + cand.length === b.valCount[k]) {
        for (const i of cand) dom[i] = bit;
        changed = true;
      }
    }
    return changed;
  };

  const boundsRule = (cons: Con[]): boolean => {
    let changed = false;
    for (const c of cons) {
      let mn = 0;
      let mx = 0;
      for (const v of c.vars) {
        mn += mnOf(dom[v]);
        mx += mxOf(dom[v]);
      }
      for (const v of c.vars) {
        const restMn = mn - mnOf(dom[v]);
        const restMx = mx - mxOf(dom[v]);
        let d = dom[v];
        for (let k = 0; k < V; k++) {
          if (!(d & (1 << k))) continue;
          const s = vals[k];
          if (s + restMn > c.target || s + restMx < c.target) d &= ~(1 << k);
        }
        if (d !== dom[v] && d) {
          mn += mnOf(d) - mnOf(dom[v]);
          mx += mxOf(d) - mxOf(dom[v]);
          dom[v] = d;
          changed = true;
        }
      }
    }
    return changed;
  };

  // Backtracking check: is there any assignment of the local system with tile t = value bit?
  const feasible = (t: number, bitIdx: number, cons: Con[], byVar: Map<number, number[]>): boolean => {
    const c1 = byVar.get(t) ?? [];
    const varSet = new Set<number>();
    const useCons = new Set<number>(c1);
    for (const ci of c1) for (const v of cons[ci].vars) varSet.add(v);
    for (const v of [...varSet]) {
      for (const ci of byVar.get(v) ?? []) {
        if (useCons.has(ci)) continue;
        const extra = cons[ci].vars.filter((x) => !varSet.has(x));
        if (varSet.size + extra.length > 16) continue;
        useCons.add(ci);
        for (const x of extra) varSet.add(x);
      }
    }
    const order = [t, ...[...varSet].filter((x) => x !== t)];
    const pos = new Map<number, number>();
    order.forEach((x, k) => pos.set(x, k));
    const cl = [...useCons];
    const tgt = cl.map((ci) => cons[ci].target);
    const sum = cl.map(() => 0);
    const remMin = cl.map(() => 0);
    const remMax = cl.map(() => 0);
    const vc: number[][] = order.map(() => []);
    const doms = order.map((x) => (x === t ? 1 << bitIdx : dom[x]));
    cl.forEach((ci, k) => {
      for (const x of cons[ci].vars) {
        const p = pos.get(x)!;
        vc[p].push(k);
        remMin[k] += mnOf(doms[p]);
        remMax[k] += mxOf(doms[p]);
      }
    });
    let nodes = 0;
    const rec = (k: number): boolean => {
      if (k === order.length) return true;
      if (++nodes > NODE_LIMIT) return true; // unknown: keep the value (safe)
      const m = doms[k];
      const cs = vc[k];
      const a = mnOf(m);
      const z = mxOf(m);
      for (const c of cs) {
        remMin[c] -= a;
        remMax[c] -= z;
      }
      let found = false;
      for (let q = 0; q < V && !found; q++) {
        if (!(m & (1 << q))) continue;
        const v = vals[q];
        let ok = true;
        for (const c of cs) {
          const s = sum[c] + v;
          if (s + remMin[c] > tgt[c] || s + remMax[c] < tgt[c]) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        for (const c of cs) sum[c] += v;
        if (rec(k + 1)) found = true;
        for (const c of cs) sum[c] -= v;
      }
      for (const c of cs) {
        remMin[c] += a;
        remMax[c] += z;
      }
      return found;
    };
    return rec(0);
  };

  for (let pass = 0; pass < 60; pass++) {
    let changed = countRule();
    let { cons, byVar } = buildCons();
    for (let r = 0; r < 20 && boundsRule(cons); r++) changed = true;
    if (changed) ({ cons, byVar } = buildCons());
    let searched = false;
    for (const t of byVar.keys()) {
      const d = dom[t];
      if (popcount(d) < 2) continue;
      let nd = d;
      for (let k = 0; k < V; k++) {
        if (!(d & (1 << k))) continue;
        if (!feasible(t, k, cons, byVar)) nd &= ~(1 << k);
      }
      if (nd !== d && nd) {
        dom[t] = nd;
        searched = true;
        // Rebuild so later tiles use the new fact.
        ({ cons, byVar } = buildCons());
      }
    }
    if (!changed && !searched) break;
  }
  return dom;
}

/** Value of a determined tile, or -1. */
export const known = (b: Board, dom: number[], i: number): number => (popcount(dom[i]) === 1 ? b.vals[lowBit(dom[i])] : -1);

/** Result of a logic-only playthrough. */
export interface SolveResult {
  bossFound: boolean;
  unknown: number;
}

/** Plays the floor with logic only (no HP limits) from the current state. Works on a copy. */
export function logicPlay(src: Board): SolveResult {
  const b: Board = { ...src, st: [...src.st], unmask: [...src.unmask] };
  const n = b.w * b.h;
  let dom = initialDomains(b);
  for (let round = 0; round < 400; round++) {
    deduce(b, dom);
    let acted = false;
    for (let i = 0; i < n; i++) {
      if (b.st[i] === HIDDEN && dom[i] === 1) {
        for (const o of openFlood(b, i)) dom[o] = 1 << b.vals.indexOf(b.cv[o]);
        acted = true;
      }
    }
    if (acted) continue;
    // Kill the weakest monster whose value is known (gives its clue).
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (b.kind[i] !== MON || b.st[i] === OPEN) continue;
      const v = known(b, dom, i);
      const vis = b.st[i] === SEEN && !looksChest(b, i);
      if (v > 0 || vis) if (best < 0 || b.str[i] < b.str[best]) best = i;
    }
    if (best < 0) break;
    b.st[best] = OPEN;
    dom[best] = 1 << b.vals.indexOf(b.cv[best]);
    // A dead gazer shows clues again. Domains only shrink, so keep them.
    dom = deduce(b, dom);
  }
  let unknown = 0;
  for (let i = 0; i < n; i++) if (popcount(dom[i]) > 1) unknown++;
  return { bossFound: b.st[b.boss] === OPEN || known(b, dom, b.boss) === b.bossStr, unknown };
}

/** Places monsters and items after the first click and checks the floor with the solver. */
export function generate(b: Board, first: number, seed: string, opts: { sense: boolean }): { tries: number; unknown: number } {
  const s = floorSpec(b.floor);
  const n = b.w * b.h;
  const nb = nbrs(b);
  const safe = new Set([first, ...nb[first]]);
  let best: { b: Board; score: number; unknown: number } | null = null;
  let tries = 0;
  const maxTries = 60;
  for (let attempt = 0; attempt < maxTries; attempt++) {
    tries++;
    const rng = new Rng(hash(seed, 'floor', b.floor, first, attempt));
    const t = newBoard(b.floor, b.lens);
    const cells = rng.shuffle([...Array(n).keys()].filter((i) => !safe.has(i)));
    let p = 0;
    const put = (mon: MonsterId, str: number, cv: number) => {
      const i = cells[p++];
      t.kind[i] = MON;
      t.mon[i] = mon;
      t.str[i] = str;
      t.cv[i] = cv;
      return i;
    };
    t.boss = put('boss', s.boss, s.boss);
    // Each floor varies a little: every tier gets -1, 0 or +1 monsters.
    s.normals.forEach((cnt, k) => {
      const c = cnt > 0 ? Math.max(1, cnt + rng.int(-1, 1)) : 0;
      for (let q = 0; q < c; q++) put(NORMALS[k], k + 1, k + 1);
    });
    for (let q = 0; q < s.gazer; q++) put('gazer', s.gazerStr, s.gazerStr);
    for (let q = 0; q < s.ghost; q++) t.st[put('ghost', s.ghostStr, 0)] = SEEN;
    for (let q = 0; q < s.mimic; q++) {
      const i = put('mimic', s.mimicStr, s.mimicStr);
      t.st[i] = SEEN;
      if (opts.sense) t.unmask[i] = 1;
    }
    for (let q = 0; q < s.chests; q++) {
      const i = cells[p++];
      t.kind[i] = CHEST;
      t.st[i] = SEEN;
    }
    // Items may also lie in the safe start area.
    const rest = rng.shuffle([...cells.slice(p), ...[...safe].filter((i) => i !== first)]);
    let r = 0;
    const drop = (it: Pickup, cnt: number) => {
      for (let q = 0; q < cnt; q++) {
        const i = rest[r++];
        t.kind[i] = ITEM;
        t.item[i] = it;
      }
    };
    drop('potion', s.potions);
    drop('scroll', s.scrolls);
    drop('key', s.keys);
    drop('coin', s.coins);
    finishBoard(t);
    // Simulate the first click on the copy.
    t.gen = true;
    openFlood(t, first);
    const res = logicPlay(t);
    const limit = Math.floor(n * 0.04);
    const score = (res.bossFound ? 0 : 10000) + res.unknown;
    if (!best || score < best.score) best = { b: t, score, unknown: res.unknown };
    if (res.bossFound && res.unknown <= limit) break;
  }
  const src = best!.b;
  // Undo the simulated first click: the caller opens it for real.
  src.st = src.st.map((v, i) => (v === OPEN && src.kind[i] !== MON ? HIDDEN : v));
  Object.assign(b, { ...src, mark: b.mark });
  return { tries, unknown: best!.unknown };
}

/** Computes clues and the value tables. */
export function finishBoard(t: Board): void {
  const n = t.w * t.h;
  const nb = nbrs(t);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const k of nb[i]) if (t.kind[k] === MON) s += t.cv[k];
    t.clue[i] = s;
  }
  const set = new Set<number>([0]);
  for (let i = 0; i < n; i++) if (t.kind[i] === MON) set.add(t.cv[i]);
  t.vals = [...set].sort((a, c) => a - c);
  t.valCount = t.vals.map((v) => {
    let c = 0;
    for (let i = 0; i < n; i++) if ((t.kind[i] === MON ? t.cv[i] : 0) === v) c++;
    return c;
  });
}
