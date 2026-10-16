/** Brewing: the potion marker, the queued path, stirring, water, salts and the plan solver. Pure functions. */
import { INGREDIENTS, MAPS, SALTS, ZONE_R, type EffectId, type MapDef, type MapId, type V } from './data';

export const WATER_STEP = 5;
const SAMPLE = 1;

export interface BrewState {
  map: MapId;
  pos: V;
  /** Absolute points of the path that stirring has not used yet. */
  queue: V[];
  /** Points the marker passed, for drawing. */
  trail: V[];
  added: { id: string; grind: number }[];
  salts: string[];
  water: number;
  ruined: boolean;
}

export const dist = (a: V, b: V): number => Math.hypot(a.x - b.x, a.y - b.y);

export function newBrew(map: MapId): BrewState {
  return { map, pos: { x: 0, y: 0 }, queue: [], trail: [{ x: 0, y: 0 }], added: [], salts: [], water: 0, ruined: false };
}

// ---------- Ingredient paths ----------

const pathCache = new Map<string, V[]>();

/** The full path of an ingredient, relative to its start, sampled about every 2 units. */
export function fullPath(id: string): V[] {
  const hit = pathCache.get(id);
  if (hit) return hit;
  const ing = INGREDIENTS[id];
  const pts: V[] = [{ x: 0, y: 0 }];
  let x = 0;
  let y = 0;
  let h = ing.heading;
  for (const [len, curve, turn] of ing.segs) {
    h += turn ?? 0;
    const n = Math.max(1, Math.ceil(len / 2));
    for (let i = 0; i < n; i++) {
      h += (curve * len) / n / 2;
      const r = (h * Math.PI) / 180;
      x += (Math.cos(r) * len) / n;
      y += (Math.sin(r) * len) / n;
      h += (curve * len) / n / 2;
      pts.push({ x, y });
    }
  }
  pathCache.set(id, pts);
  return pts;
}

export function pathLength(pts: V[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1], pts[i]);
  return l;
}

/** The part of the path that a grind level uses (0.25 .. 1). */
export function groundPath(id: string, grind: number): V[] {
  const key = `${id}@${grind}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const full = fullPath(id);
  const want = pathLength(full) * grind;
  const out: V[] = [full[0]];
  let l = 0;
  for (let i = 1; i < full.length; i++) {
    const s = dist(full[i - 1], full[i]);
    if (l + s >= want - 1e-6) {
      const t = (want - l) / s;
      out.push({ x: full[i - 1].x + (full[i].x - full[i - 1].x) * t, y: full[i - 1].y + (full[i].y - full[i - 1].y) * t });
      break;
    }
    l += s;
    out.push(full[i]);
  }
  pathCache.set(key, out);
  return out;
}

export function rotate(p: V, around: V, deg: number): V {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = p.x - around.x;
  const dy = p.y - around.y;
  return { x: around.x + dx * c - dy * s, y: around.y + dx * s + dy * c };
}

// ---------- Map queries ----------

export function inDanger(m: MapDef, p: V): boolean {
  for (const d of m.dangers) if ((p.x - d.x) ** 2 + (p.y - d.y) ** 2 < d.r * d.r) return true;
  return false;
}

export function strengthAt(dd: number): number {
  if (dd <= ZONE_R / 3) return 3;
  if (dd <= (ZONE_R * 2) / 3) return 2;
  if (dd <= ZONE_R) return 1;
  return 0;
}

export interface ZoneHit {
  effect: EffectId;
  strength: number;
  dist: number;
}

/** The effect under the marker, if any. */
export function zoneAt(map: MapId, p: V): ZoneHit | null {
  let best: ZoneHit | null = null;
  for (const zz of MAPS[map].zones) {
    const dd = Math.hypot(p.x - zz.x, p.y - zz.y);
    const s = strengthAt(dd);
    if (s > 0 && (!best || dd < best.dist)) best = { effect: zz.effect, strength: s, dist: dd };
  }
  return best;
}

/**
 * Walk along points from `from`. Returns how far the walk got before it hit danger (or the full length),
 * and the end point. Checks every SAMPLE units.
 */
export function walk(m: MapDef, from: V, pts: V[], maxLen = Infinity): { len: number; end: V; hit: boolean; idx: number } {
  let cur = from;
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const to = pts[i];
    const s = dist(cur, to);
    const n = Math.max(1, Math.ceil(s / SAMPLE));
    for (let k = 1; k <= n; k++) {
      let t = k / n;
      if (len + s * t > maxLen) t = (maxLen - len) / s;
      const p = { x: cur.x + (to.x - cur.x) * t, y: cur.y + (to.y - cur.y) * t };
      if (inDanger(m, p)) return { len: len + s * t, end: p, hit: true, idx: i };
      if (len + s * t >= maxLen - 1e-9) return { len: maxLen, end: p, hit: false, idx: i };
    }
    len += s;
    cur = to;
  }
  return { len, end: cur, hit: false, idx: pts.length };
}

// ---------- Brew actions (mutate the state) ----------

export function addIngredient(b: BrewState, id: string, grind: number): void {
  const start = b.queue.length ? b.queue[b.queue.length - 1] : b.pos;
  const rel = groundPath(id, grind);
  for (let i = 1; i < rel.length; i++) b.queue.push({ x: start.x + rel[i].x, y: start.y + rel[i].y });
  b.added.push({ id, grind });
}

/** Absolute points of the path an ingredient would add (starting at the end of the queue). */
export function previewPath(b: BrewState, id: string, grind: number): V[] {
  const start = b.queue.length ? b.queue[b.queue.length - 1] : b.pos;
  return groundPath(id, grind).map((p) => ({ x: start.x + p.x, y: start.y + p.y }));
}

/** Where the marker would first touch danger along the queue plus extra points. */
export function firstDanger(b: BrewState, extra: V[] = []): V | null {
  const w = walk(MAPS[b.map], b.pos, [...b.queue, ...extra.slice(1)]);
  return w.hit ? w.end : null;
}

export function queueLength(b: BrewState): number {
  return pathLength([b.pos, ...b.queue]);
}

/** Move the marker along the queue by up to `amount`. Returns the distance moved. */
export function stir(b: BrewState, amount: number): number {
  if (b.ruined || !b.queue.length) return 0;
  const m = MAPS[b.map];
  let left = amount;
  let moved = 0;
  while (left > 1e-9 && b.queue.length) {
    const to = b.queue[0];
    const s = dist(b.pos, to);
    const step = Math.min(left, s);
    const w = walk(m, b.pos, [to], step);
    moved += w.len;
    if (w.hit) {
      b.pos = w.end;
      b.trail.push(w.end);
      b.ruined = true;
      return moved;
    }
    left -= step;
    if (step >= s - 1e-9) {
      b.pos = to;
      b.queue.shift();
    } else {
      b.pos = w.end;
    }
    b.trail.push(b.pos);
  }
  return moved;
}

function shift(b: BrewState, dx: number, dy: number): void {
  b.pos = { x: b.pos.x + dx, y: b.pos.y + dy };
  b.queue = b.queue.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  b.trail.push(b.pos);
}

/** Pour water: pull the marker toward the center. The queue moves with it. */
export function pourWater(b: BrewState, n = 1, size = WATER_STEP): number {
  if (b.ruined) return 0;
  const m = MAPS[b.map];
  let moved = 0;
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(b.pos.x, b.pos.y);
    if (l < 0.01) break;
    const step = Math.min(size, l);
    const target = { x: b.pos.x - (b.pos.x / l) * step, y: b.pos.y - (b.pos.y / l) * step };
    const w = walk(m, b.pos, [target]);
    shift(b, w.end.x - b.pos.x, w.end.y - b.pos.y);
    moved += w.len;
    b.water += size / WATER_STEP;
    if (w.hit) {
      b.ruined = true;
      break;
    }
  }
  return moved;
}

/** Use a salt. Returns false when it has no effect (a turn salt with an empty queue). */
export function useSalt(b: BrewState, id: string): boolean {
  if (b.ruined) return false;
  const s = SALTS[id];
  if (s.rot) {
    if (!b.queue.length) return false;
    b.queue = b.queue.map((p) => rotate(p, b.pos, s.rot!));
  } else if (s.push) {
    const to = { x: b.pos.x + s.push.x, y: b.pos.y + s.push.y };
    const w = walk(MAPS[b.map], b.pos, [to]);
    shift(b, w.end.x - b.pos.x, w.end.y - b.pos.y);
    if (w.hit) b.ruined = true;
  }
  b.salts.push(id);
  return true;
}

export function canBottle(b: BrewState): ZoneHit | null {
  if (b.ruined) return null;
  return zoneAt(b.map, b.pos);
}

// ---------- Solver ----------

export type PlanStep =
  | { t: 'water'; n: number }
  | { t: 'add'; id: string; grind: number }
  | { t: 'salt'; id: string }
  | { t: 'stir'; d: number }
  | { t: 'bottle' };

export interface Stock {
  /** Units owned. */
  have: Record<string, number>;
  /** Units for sale and their price. */
  buy: Record<string, { qty: number; price: number }>;
  salts: Record<string, number>;
  gold: number;
}

export interface Solution {
  plan: PlanStep[];
  strength: number;
  /** Gold to spend on ingredients. */
  cost: number;
  /** Units to buy per ingredient. */
  purchase: Record<string, number>;
  /** Owned units used per ingredient. */
  uses: Record<string, number>;
}

interface Node {
  pos: V;
  plan: PlanStep[];
  used: Record<string, number>;
  rot: { sun: number; moon: number };
  cost: number;
}

/** Stir distance that means "stir the whole queue". */
export const FULL = 9999;

const GRINDS = [0.5, 0.75, 1];
const WATERS = [0, 4, 8];

function unitCost(stock: Stock, id: string, usedSoFar: number): number | null {
  const own = stock.have[id] ?? 0;
  if (usedSoFar < own) return INGREDIENTS[id].price * 0.6;
  const b = stock.buy[id];
  if (b && usedSoFar < own + b.qty) return b.price;
  return null;
}

/**
 * Search ingredient sequences (with water and turn salts) that bring the marker into the target zone.
 * Beam search over the marker position after each fully stirred ingredient.
 */
export function solve(
  map: MapId,
  target: EffectId,
  minStr: number,
  stock: Stock,
  opt: { depth?: number; beam?: number; from?: V } = {},
): Solution | null {
  const m = MAPS[map];
  const zone = m.zones.find((zz) => zz.effect === target);
  if (!zone) return null;
  const depth = opt.depth ?? 3;
  const beamW = opt.beam ?? 40;
  const ids = Object.keys(INGREDIENTS).filter((id) => (stock.have[id] ?? 0) > 0 || (stock.buy[id]?.qty ?? 0) > 0);
  const budget = stock.gold;
  let best: { node: Node; strength: number; stir: number; water: number; score: number } | null = null;

  const consider = (node: Node, startPos: V, path: V[]) => {
    // The best stop point along this path (before any danger), then optional water from there.
    const w = walk(m, startPos, path);
    const reach = w.len;
    let cur = startPos;
    let len = 0;
    let bestD = Infinity;
    let bestLen = 0;
    for (const p of path) {
      const s = dist(cur, p);
      const n = Math.max(1, Math.ceil(s));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        const l = len + s * t;
        if (l > reach - 0.5) break;
        const q = { x: cur.x + (p.x - cur.x) * t, y: cur.y + (p.y - cur.y) * t };
        const dd = Math.hypot(q.x - zone.x, q.y - zone.y);
        if (dd < bestD) {
          bestD = dd;
          bestLen = l;
        }
      }
      len += s;
      cur = p;
      if (len > reach) break;
    }
    const tryFinish = (strength: number, stirLen: number, water: number) => {
      if (strength < minStr) return;
      const score = strength * 1000 - node.cost * 4 - node.plan.length - water;
      if (!best || score > best.score) best = { node, strength, stir: stirLen, water, score };
    };
    tryFinish(strengthAt(bestD), bestLen, 0);
    // Water from the end of the path (only when the whole path is safe).
    if (!w.hit) {
      const end = path[path.length - 1];
      const l = Math.hypot(end.x, end.y);
      if (l > 1) {
        const dir = { x: -end.x / l, y: -end.y / l };
        const along = (zone.x - end.x) * dir.x + (zone.y - end.y) * dir.y;
        if (along > 0) {
          const n = Math.min(Math.round(along / WATER_STEP), Math.floor(l / WATER_STEP));
          if (n > 0) {
            const to = { x: end.x + dir.x * n * WATER_STEP, y: end.y + dir.y * n * WATER_STEP };
            const ww = walk(m, end, [to]);
            if (!ww.hit) tryFinish(strengthAt(dist(to, zone)), Infinity, n);
          }
        }
      }
    }
  };

  let beam: Node[] = [{ pos: opt.from ?? { x: 0, y: 0 }, plan: [], used: {}, rot: { sun: 0, moon: 0 }, cost: 0 }];
  for (let dep = 0; dep < depth; dep++) {
    const next: Node[] = [];
    for (const node of beam) {
      for (const wn of WATERS) {
        let start = node.pos;
        const l = Math.hypot(start.x, start.y);
        if (wn > 0) {
          if (l < wn * WATER_STEP * 0.5) continue;
          const step = Math.min(l, wn * WATER_STEP);
          const to = { x: start.x - (start.x / l) * step, y: start.y - (start.y / l) * step };
          if (walk(m, start, [to]).hit) continue;
          start = to;
        }
        for (const id of ids) {
          const used = node.used[id] ?? 0;
          const c = unitCost(stock, id, used);
          if (c === null) continue;
          const cost = node.cost + c;
          for (const g of GRINDS) {
            const rel = groundPath(id, g);
            const rots: number[] = [0];
            const sun = (stock.salts.sun ?? 0) - node.rot.sun;
            const moon = (stock.salts.moon ?? 0) - node.rot.moon;
            if (sun > 0) rots.push(-1);
            if (sun > 1) rots.push(-2);
            if (moon > 0) rots.push(1);
            if (moon > 1) rots.push(2);
            for (const r of rots) {
              const path = rel.slice(1).map((p) => {
                const q = r ? rotate(p, { x: 0, y: 0 }, r * 20) : p;
                return { x: start.x + q.x, y: start.y + q.y };
              });
              const plan: PlanStep[] = [...node.plan];
              if (wn) plan.push({ t: 'water', n: wn });
              plan.push({ t: 'add', id, grind: g });
              for (let k = 0; k < Math.abs(r); k++) plan.push({ t: 'salt', id: r < 0 ? 'sun' : 'moon' });
              plan.push({ t: 'stir', d: FULL });
              const child: Node = {
                pos: path[path.length - 1],
                plan,
                used: { ...node.used, [id]: used + 1 },
                rot: { sun: node.rot.sun + (r < 0 ? -r : 0), moon: node.rot.moon + (r > 0 ? r : 0) },
                cost: cost + Math.abs(r) * 3,
              };
              if (spend(stock, child.used) > budget) continue;
              consider(child, start, path);
              if (dep < depth - 1 && !walk(m, start, path).hit) next.push(child);
            }
          }
        }
      }
    }
    if (best && (best as { strength: number }).strength >= 3) break;
    // Keep the closest distinct positions.
    next.sort((a, b) => dist(a.pos, zone) - dist(b.pos, zone) || a.cost - b.cost);
    const seen = new Set<string>();
    beam = [];
    for (const nd of next) {
      const key = `${Math.round(nd.pos.x / 3)},${Math.round(nd.pos.y / 3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      beam.push(nd);
      if (beam.length >= beamW) break;
    }
    if (!beam.length) break;
  }
  if (!best) return null;
  const b = best as { node: Node; strength: number; stir: number; water: number };
  const plan = b.node.plan.slice(0, -1);
  plan.push({ t: 'stir', d: b.stir === Infinity ? FULL : Math.max(0, b.stir - 0.01) });
  if (b.water) plan.push({ t: 'water', n: b.water });
  plan.push({ t: 'bottle' });
  const purchase: Record<string, number> = {};
  const uses: Record<string, number> = {};
  for (const [id, n] of Object.entries(b.node.used)) {
    const own = stock.have[id] ?? 0;
    uses[id] = Math.min(n, own);
    if (n > own) purchase[id] = n - own;
  }
  return { plan, strength: b.strength, cost: spend(stock, b.node.used), purchase, uses };
}

/** Gold needed to buy the units that are not owned. */
function spend(stock: Stock, used: Record<string, number>): number {
  let g = 0;
  for (const [id, n] of Object.entries(used)) {
    const own = stock.have[id] ?? 0;
    if (n > own) g += (n - own) * (stock.buy[id]?.price ?? 999);
  }
  return g;
}

/** Run a plan on a brew. Used by the bot and the tests. Returns the brew. */
export function runPlan(b: BrewState, plan: PlanStep[]): BrewState {
  for (const s of plan) applyStep(b, s);
  return b;
}

export function applyStep(b: BrewState, s: PlanStep): void {
  if (s.t === 'water') pourWater(b, s.n);
  else if (s.t === 'add') addIngredient(b, s.id, s.grind);
  else if (s.t === 'salt') useSalt(b, s.id);
  else if (s.t === 'stir') stir(b, s.d);
}
