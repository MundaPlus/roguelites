/** Backpack grid: shapes, rotation, placement rules, star links, final item stats and the auto-packer. */
import { ITEMS, type Buff, type Eff, type ItemDef, type Start } from './data';
import type { Rng } from './rng';

export const GW = 9;
export const GH = 7;

export interface Placed {
  uid: number;
  id: string;
  x: number;
  y: number;
  rot: number;
}

export interface Board {
  bags: Placed[];
  items: Placed[];
}

export type Pt = [number, number];

export interface Shape {
  cells: Pt[];
  stars: Pt[];
  w: number;
  h: number;
}

const cache = new Map<string, Shape>();

/** Shape of an item at a rotation (0..3, clockwise). Cells start at 0,0. Stars can be outside. */
export function shape(id: string, rot: number): Shape {
  const key = `${id}:${rot & 3}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const mask = ITEMS[id].mask;
  let cells: Pt[] = [];
  let stars: Pt[] = [];
  mask.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '#') cells.push([x, y]);
      else if (c === '*') stars.push([x, y]);
    }),
  );
  for (let i = 0; i < (rot & 3); i++) {
    cells = cells.map(([x, y]) => [-y, x]);
    stars = stars.map(([x, y]) => [-y, x]);
  }
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  cells = cells.map(([x, y]) => [x - mx, y - my]);
  stars = stars.map(([x, y]) => [x - mx, y - my]);
  const s: Shape = { cells, stars, w: Math.max(...cells.map((c) => c[0])) + 1, h: Math.max(...cells.map((c) => c[1])) + 1 };
  cache.set(key, s);
  return s;
}

export const isBag = (id: string): boolean => ITEMS[id].tags.includes('bag');
export const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GW && y < GH;

export function cellsOf(p: { id: string; x: number; y: number; rot: number }): Pt[] {
  return shape(p.id, p.rot).cells.map(([cx, cy]) => [cx + p.x, cy + p.y]);
}

export function starsOf(p: Placed): Pt[] {
  return shape(p.id, p.rot).stars.map(([cx, cy]) => [cx + p.x, cy + p.y]);
}

/** Map of cell -> uid (or -1) for bags or items. */
export function cellMap(list: Placed[], ignore = -1): Int32Array {
  const m = new Int32Array(GW * GH).fill(-1);
  for (const p of list) {
    if (p.uid === ignore) continue;
    for (const [x, y] of cellsOf(p)) if (inBounds(x, y)) m[y * GW + x] = p.uid;
  }
  return m;
}

export function canPlaceBag(b: Board, id: string, rot: number, x: number, y: number, ignore = -1): boolean {
  const m = cellMap(b.bags, ignore);
  return cellsOf({ id, x, y, rot }).every(([cx, cy]) => inBounds(cx, cy) && m[cy * GW + cx] < 0);
}

export function canPlaceItem(b: Board, id: string, rot: number, x: number, y: number, ignore = -1, bagMap?: Int32Array, itemMap?: Int32Array): boolean {
  const bm = bagMap ?? cellMap(b.bags);
  const im = itemMap ?? cellMap(b.items, ignore);
  return cellsOf({ id, x, y, rot }).every(([cx, cy]) => inBounds(cx, cy) && bm[cy * GW + cx] >= 0 && im[cy * GW + cx] < 0);
}

export function canPlace(b: Board, id: string, rot: number, x: number, y: number, ignore = -1): boolean {
  return isBag(id) ? canPlaceBag(b, id, rot, x, y, ignore) : canPlaceItem(b, id, rot, x, y, ignore);
}

export const cloneBoard = (b: Board): Board => ({ bags: b.bags.map((p) => ({ ...p })), items: b.items.map((p) => ({ ...p })) });

/** Items that sit fully on the cells of one bag. They move with the bag. */
export function carried(b: Board, bagUid: number): Placed[] {
  const bag = b.bags.find((p) => p.uid === bagUid);
  if (!bag) return [];
  const set = new Set(cellsOf(bag).map(([x, y]) => y * GW + x));
  return b.items.filter((it) => cellsOf(it).every(([x, y]) => set.has(y * GW + x)));
}

/** Removes items that no longer fit (off bags or overlapping). Returns them. */
export function dropLoose(b: Board): Placed[] {
  const bm = cellMap(b.bags);
  const used = new Int32Array(GW * GH).fill(-1);
  const keep: Placed[] = [];
  const loose: Placed[] = [];
  for (const it of b.items) {
    const cs = cellsOf(it);
    if (cs.every(([x, y]) => inBounds(x, y) && bm[y * GW + x] >= 0 && used[y * GW + x] < 0)) {
      cs.forEach(([x, y]) => (used[y * GW + x] = it.uid));
      keep.push(it);
    } else loose.push(it);
  }
  b.items = keep;
  return loose;
}

// ---------- Stats ----------

export interface ItemStat {
  uid: number;
  id: string;
  cd: number;
  cost: number;
  eff: Eff | null;
  lowHp: Eff | null;
  uses: number;
  /** uids of the items whose stars buff this item. */
  from: number[];
}

export interface Link {
  from: number;
  to: number;
  x: number;
  y: number;
}

export interface BuildStats {
  items: ItemStat[];
  links: Link[];
  start: Required<Start>;
  /** Star cells of every item, with the uid of a matching target or -1. */
  stars: { uid: number; x: number; y: number; hit: number }[];
}

function applyBuff(e: Eff, b: Buff, base: Eff): void {
  if (b.dmg && base.dmg) e.dmg = (e.dmg ?? 0) + b.dmg;
  if (b.block && base.block) e.block = (e.block ?? 0) + b.block;
  if (b.heal && base.heal) e.heal = (e.heal ?? 0) + b.heal;
  if (b.poison && base.poison) e.poison = (e.poison ?? 0) + b.poison;
  if (b.crit && base.dmg) e.crit = (e.crit ?? 0) + b.crit;
}

const matches = (d: ItemDef, tag: string): boolean => !d.tags.includes('bag') && (tag === 'any' || d.tags.includes(tag as never));

export function buildStats(b: Board): BuildStats {
  const im = cellMap(b.items);
  const bm = cellMap(b.bags);
  const byUid = new Map(b.items.map((p) => [p.uid, p]));
  const cdBonus = new Map<number, number>();
  const effs = new Map<number, { eff: Eff | null; low: Eff | null }>();
  const from = new Map<number, number[]>();
  for (const p of b.items) {
    const d = ITEMS[p.id];
    effs.set(p.uid, { eff: d.eff ? { ...d.eff } : null, low: d.lowHp ? { ...d.lowHp } : null });
    from.set(p.uid, []);
    cdBonus.set(p.uid, 0);
  }
  const give = (target: Placed, buff: Buff): void => {
    const d = ITEMS[target.id];
    const e = effs.get(target.uid)!;
    if (e.eff && d.eff) applyBuff(e.eff, buff, d.eff);
    if (e.low && d.lowHp) applyBuff(e.low, buff, d.lowHp);
    if (buff.cd && d.cd) cdBonus.set(target.uid, cdBonus.get(target.uid)! + buff.cd);
  };
  const links: Link[] = [];
  const stars: BuildStats['stars'] = [];
  for (const s of b.items) {
    const d = ITEMS[s.id];
    if (!d.star) continue;
    const done = new Set<number>();
    for (const [x, y] of starsOf(s)) {
      const t = inBounds(x, y) ? im[y * GW + x] : -1;
      const tp = t >= 0 ? byUid.get(t) : undefined;
      const ok = !!tp && t !== s.uid && matches(ITEMS[tp.id], d.star.tag);
      stars.push({ uid: s.uid, x, y, hit: ok ? t : -1 });
      if (!ok || done.has(t)) continue;
      done.add(t);
      give(tp!, d.star.buff);
      from.get(t)!.push(s.uid);
      links.push({ from: s.uid, to: t, x, y });
    }
  }
  // Bag buffs: an item with at least one cell on the bag gets it once.
  for (const bag of b.bags) {
    const inner = ITEMS[bag.id].inner;
    if (!inner) continue;
    const got = new Set<number>();
    for (const [x, y] of cellsOf(bag)) {
      const t = im[y * GW + x];
      if (t < 0 || got.has(t) || bm[y * GW + x] !== bag.uid) continue;
      const tp = byUid.get(t)!;
      if (!matches(ITEMS[tp.id], inner.tag)) continue;
      got.add(t);
      give(tp, inner.buff);
    }
  }
  const start: Required<Start> = { hp: 0, block: 0, regen: 0, thorns: 0, stam: 0, gold: 0, rage: 0 };
  const items: ItemStat[] = b.items.map((p) => {
    const d = ITEMS[p.id];
    if (d.start) for (const k of Object.keys(d.start) as (keyof Start)[]) start[k] += d.start[k] ?? 0;
    const e = effs.get(p.uid)!;
    const bonus = Math.min(60, cdBonus.get(p.uid)!);
    return {
      uid: p.uid,
      id: p.id,
      cd: d.cd ? Math.round(d.cd * (1 - bonus / 100) * 100) / 100 : 0,
      cost: d.cost ?? 0,
      eff: e.eff,
      lowHp: e.low,
      uses: d.uses ?? 0,
      from: from.get(p.uid)!,
    };
  });
  return { items, links, start, stars };
}

// ---------- Auto-packer (used by ghosts, bots and the auto-place on buy) ----------

export interface Spot {
  x: number;
  y: number;
  rot: number;
  score: number;
}

function neighbors(m: Int32Array, cells: Pt[], self: number): number {
  let n = 0;
  for (const [x, y] of cells)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(nx, ny) && m[ny * GW + nx] >= 0 && m[ny * GW + nx] !== self) n++;
    }
  return n;
}

/** Best spot for an item: most star links, then snug against other items. */
export function bestItemSpot(b: Board, id: string, rng?: Rng, ignore = -1): Spot | null {
  const bm = cellMap(b.bags);
  const im = cellMap(b.items, ignore);
  const rest = b.items.filter((p) => p.uid !== ignore);
  const base = buildStats({ bags: b.bags, items: rest }).links.length;
  let best: Spot | null = null;
  const rots = ITEMS[id].mask.length === 1 && ITEMS[id].mask[0].length === 1 ? [0] : [0, 1, 2, 3];
  for (const rot of rots)
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (!canPlaceItem(b, id, rot, x, y, ignore, bm, im)) continue;
        const p: Placed = { uid: -2, id, x, y, rot };
        const links = buildStats({ bags: b.bags, items: [...rest, p] }).links.length - base;
        const score = links * 3 + neighbors(im, cellsOf(p), -2) * 0.25 + (rng ? rng.next() * 0.2 : 0);
        if (!best || score > best.score) best = { x, y, rot, score };
      }
  return best;
}

/** Any valid spot, picked at random (the weak bot). */
export function randomItemSpot(b: Board, id: string, rng: Rng): Spot | null {
  const bm = cellMap(b.bags);
  const im = cellMap(b.items);
  const all: Spot[] = [];
  for (let rot = 0; rot < 4; rot++)
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (canPlaceItem(b, id, rot, x, y, -1, bm, im)) all.push({ x, y, rot, score: 0 });
  return all.length ? rng.pick(all) : null;
}

/** Best spot for a bag: touching other bags, close to the center. */
export function bestBagSpot(b: Board, id: string, rng?: Rng): Spot | null {
  const bm = cellMap(b.bags);
  let best: Spot | null = null;
  for (let rot = 0; rot < 4; rot++)
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (!canPlaceBag(b, id, rot, x, y)) continue;
        const cells = cellsOf({ id, x, y, rot });
        const touch = neighbors(bm, cells, -2);
        if (b.bags.length && !touch) continue;
        const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length - (GW - 1) / 2;
        const cy = cells.reduce((a, c) => a + c[1], 0) / cells.length - (GH - 1) / 2;
        const score = touch - Math.hypot(cx, cy) * 0.4 + (rng ? rng.next() * 0.3 : 0);
        if (!best || score > best.score) best = { x, y, rot, score };
      }
  return best;
}

export const freeCells = (b: Board): number => {
  const bm = cellMap(b.bags);
  const im = cellMap(b.items);
  let n = 0;
  for (let i = 0; i < bm.length; i++) if (bm[i] >= 0 && im[i] < 0) n++;
  return n;
};
