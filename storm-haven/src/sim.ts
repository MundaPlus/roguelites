/** Settlement simulation. Pure state + fixed ticks. No DOM. */
import {
  BASE_BLUEPRINTS,
  BIOMES,
  BLUEPRINT_POOL,
  BUILDINGS,
  EVENTS,
  EVENT_IDS,
  FOODS,
  GOODS,
  GOOD_IDS,
  RES_IDS,
  SEASONS,
  SPECIES,
  type Bag,
  type BiomeId,
  type BuildingId,
  type CurseId,
  type EventId,
  type GoodId,
  type MetaId,
  type PerkId,
  type ResId,
  type SeasonId,
  type SpeciesId,
} from './data';

export const TPS = 4;
export const W = 36;
export const H = 36;
export const T_FOREST = 0;
export const T_GROUND = 1;
export const T_ROAD = 2;
export const T_WATER = 3;

const EAT_SECS = 55;
const LUX_SECS = 80;
const NEWCOMER_SECS = 95;
const IMP_RATE = 100 / (15 * 60);
const HIGH_RESOLVE = 10;
const REP_TRICKLE = 0.0012;

export interface Glade {
  id: number;
  x: number;
  y: number;
  r: number;
  open: boolean;
  ev: EventId | null;
  /** none: no event. hidden: not found yet. active: found, unsolved. solving: paid. done. */
  es: 'none' | 'hidden' | 'active' | 'solving' | 'done';
  et: number;
}

export interface Building {
  id: number;
  def: BuildingId;
  x: number;
  y: number;
  built: boolean;
  prog: number;
  w: number[];
  inb: Bag;
  out: Bag;
}

export interface Villager {
  id: number;
  sp: SpeciesId;
  x: number;
  y: number;
  job: number;
  home: number;
  st: 'idle' | 'go' | 'work';
  act: string;
  tgt: number;
  tx: number;
  ty: number;
  tt: number;
  wait: number;
  carry: Bag;
  ck: 'in' | 'out' | '';
  resolve: number;
  meal: number;
  mq: number;
  lux: number;
  luxOn: boolean;
  low: number;
  note: string;
}

export interface OrderOpt {
  kind: 'make' | 'build' | 'pop' | 'housed' | 'resolve' | 'glades' | 'events';
  good?: GoodId;
  bld?: BuildingId;
  n: number;
  base: number;
  text: string;
}

export interface Order {
  rep: number;
  opts: OrderOpt[] | null;
  o: OrderOpt | null;
  done: boolean;
  timer: number;
}

export interface Caravan {
  left: number;
  offers: { good: GoodId; n: number; price: number; sold: boolean }[];
}

export interface Mods {
  chop: number;
  gather: number;
  farm: number;
  craft: number;
  imp: number;
  resolve: number;
  housed: number;
  lux: number;
  storm: number;
  stormLen: number;
  eat: number;
  bpOptions: number;
  gladeCost: number;
  gladeTime: number;
}

export interface Fx {
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface Settlement {
  seed: number;
  rs: number;
  biome: BiomeId;
  curses: CurseId[];
  final: boolean;
  name: string;
  t: number;
  tiles: number[];
  amt: number[];
  res: number[];
  gl: number[];
  fog: number[];
  glades: Glade[];
  b: Building[];
  nextId: number;
  v: Villager[];
  stock: Record<GoodId, number>;
  made: Record<GoodId, number>;
  blueprints: BuildingId[];
  bpPicks: number;
  bpOffer: BuildingId[] | null;
  orders: Order[];
  unlocked: number;
  rep: number;
  repGoal: number;
  imp: number;
  left: number;
  arrived: number;
  solved: number;
  bonusResolve: number;
  caravan: Caravan | null;
  mods: Mods;
  season: SeasonId;
  year: number;
  nextNew: number;
  done: '' | 'win' | 'lose';
  why: string;
  fx: Fx[];
  ev: string[];
  msgs: string[];
}

export interface SettleOpts {
  seed: number;
  biome: BiomeId;
  curses: CurseId[];
  final: boolean;
  step: number;
  name: string;
  perks: PerkId[];
  meta: Partial<Record<MetaId, number>>;
}

// ---------- RNG kept inside the state, so saves stay deterministic ----------

export function rnd(s: Settlement): number {
  s.rs = (s.rs + 0x6d2b79f5) | 0;
  let t = s.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rint = (s: Settlement, a: number, b: number): number => a + Math.floor(rnd(s) * (b - a + 1));
function rpick<T>(s: Settlement, arr: readonly T[]): T {
  return arr[Math.floor(rnd(s) * arr.length)];
}
function rweighted<T>(s: Settlement, items: [T, number][]): T {
  const total = items.reduce((a, [, w]) => a + w, 0);
  let r = rnd(s) * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1][0];
}

export const idx = (x: number, y: number): number => y * W + x;
export const inMap = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H;
function emptyStock(): Record<GoodId, number> {
  const o = {} as Record<GoodId, number>;
  for (const g of GOOD_IDS) o[g] = 0;
  return o;
}

function computeMods(o: SettleOpts): Mods {
  const p = (id: PerkId): number => o.perks.filter((x) => x === id).length;
  const m = (id: MetaId): number => o.meta[id] ?? 0;
  const c = (id: CurseId): boolean => o.curses.includes(id);
  return {
    chop: (1 + 0.3 * p('axes')) / (c('hardwood') ? 1.4 : 1),
    gather: 1 + 0.3 * p('axes'),
    farm: (1 + 0.3 * p('seeds')) * BIOMES[o.biome].farm,
    craft: 1 + 0.2 * p('guild'),
    imp: Math.max(0.4, (1 - 0.12 * p('envoy') - 0.06 * m('patience')) * (c('impatient') ? 1.2 : 1) * (o.final ? 1.1 : 1)),
    resolve: c('restless') ? -1 : 0,
    housed: p('cozy'),
    lux: 3 + 2 * p('festival'),
    storm: Math.max(0, 2 - m('lore')),
    stormLen: BIOMES[o.biome].stormLen * (c('longStorm') ? 1.4 : 1),
    eat: c('hungry') ? 1.35 : 1,
    bpOptions: 3 + Math.min(1, m('library')),
    gladeCost: Math.pow(0.6, p('scouts')),
    gladeTime: Math.pow(0.5, p('scouts')),
  };
}

// ---------- Creation ----------

export function newSettlement(o: SettleOpts): Settlement {
  const bio = BIOMES[o.biome];
  const s: Settlement = {
    seed: o.seed,
    rs: o.seed | 0,
    biome: o.biome,
    curses: o.curses,
    final: o.final,
    name: o.name,
    t: 0,
    tiles: new Array(W * H).fill(T_FOREST),
    amt: new Array(W * H).fill(0),
    res: new Array(W * H).fill(-1),
    gl: new Array(W * H).fill(-1),
    fog: new Array(W * H).fill(0),
    glades: [],
    b: [],
    nextId: 1,
    v: [],
    stock: emptyStock(),
    made: emptyStock(),
    blueprints: [...BASE_BLUEPRINTS],
    bpPicks: 1 + o.perks.filter((p) => p === 'archive').length,
    bpOffer: null,
    orders: [],
    unlocked: 2,
    rep: 0,
    repGoal: o.final ? 17 : 13 + o.step,
    imp: 0,
    left: 0,
    arrived: 0,
    solved: 0,
    bonusResolve: 0,
    caravan: null,
    mods: computeMods(o),
    season: 'drizzle',
    year: 1,
    nextNew: NEWCOMER_SECS,
    done: '',
    why: '',
    fx: [],
    ev: [],
    msgs: [],
  };
  const cx = W >> 1;
  const cy = H >> 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      s.amt[i] = rint(s, 3, 6);
      if (Math.hypot(x - cx, y - cy) <= 3.3) s.tiles[i] = T_GROUND;
    }
  // Ponds for looks.
  for (let k = 0; k < 3; k++) {
    const px = rint(s, 3, W - 4);
    const py = rint(s, 3, H - 4);
    if (Math.hypot(px - cx, py - cy) < 8) continue;
    const pr = 1 + rnd(s) * 1.2;
    for (let y = py - 2; y <= py + 2; y++)
      for (let x = px - 2; x <= px + 2; x++) if (inMap(x, y) && Math.hypot(x - px, y - py) <= pr) s.tiles[idx(x, y)] = T_WATER;
  }
  // Glades.
  const nG = 9 + (o.final ? 1 : 0);
  let dangers = 0;
  const wantDangers = Math.round((2 + o.step * 0.5) * bio.danger) + (o.curses.includes('haunted') ? 2 : 0);
  for (let tries = 0; tries < 400 && s.glades.length < nG; tries++) {
    const first = s.glades.length === 0;
    const ang = rnd(s) * Math.PI * 2;
    const dist = first ? 6.5 + rnd(s) : 7 + rnd(s) * 10;
    const r = first ? 2 : rpick(s, [2, 2, 2.5, 3]);
    const gx = Math.round(cx + Math.cos(ang) * dist);
    const gy = Math.round(cy + Math.sin(ang) * dist);
    if (gx - r < 1 || gy - r < 1 || gx + r > W - 2 || gy + r > H - 2) continue;
    if (s.glades.some((g) => Math.hypot(g.x - gx, g.y - gy) < g.r + r + 2.5)) continue;
    const g: Glade = { id: s.glades.length, x: gx, y: gy, r, open: false, ev: null, es: 'none', et: 0 };
    s.glades.push(g);
    const cells: number[] = [];
    for (let y = gy - 3; y <= gy + 3; y++)
      for (let x = gx - 3; x <= gx + 3; x++)
        if (inMap(x, y) && Math.hypot(x - gx, y - gy) <= r + 0.3) {
          const i = idx(x, y);
          s.tiles[i] = T_GROUND;
          s.gl[i] = g.id;
          s.fog[i] = 1;
          if (x !== gx || y !== gy) cells.push(i);
        }
    const resW = RES_IDS.map((k, n) => [n, bio.res[k]] as [number, number]);
    const firstRes: ResId[] = ['stone', rpick(s, ['berries', 'mushrooms'] as ResId[]), rpick(s, ['clay', 'herbs'] as ResId[])];
    const nRes = first ? 3 : rint(s, 2, 4);
    for (let k = 0; k < nRes && cells.length; k++) {
      const i = cells.splice(Math.floor(rnd(s) * cells.length), 1)[0];
      const kind = first ? RES_IDS.indexOf(firstRes[k]) : rweighted(s, resW);
      s.res[i] = kind;
      s.amt[i] = rint(s, 22, 36);
    }
    if (!first) {
      const danger = dangers < wantDangers && rnd(s) < 0.7;
      const pool = EVENT_IDS.filter((e) => EVENTS[e].danger === danger).map((e) => [e, EVENTS[e].weight] as [EventId, number]);
      if (danger || rnd(s) < 0.45) {
        g.ev = rweighted(s, pool);
        g.es = 'hidden';
        if (danger) dangers++;
      }
    }
  }
  // One berry bush next to the hearth.
  const bi = idx(cx + 2, cy - 2);
  s.res[bi] = RES_IDS.indexOf('berries');
  s.amt[bi] = 30;
  addBuilding(s, 'hearth', cx, cy, true);
  // Start goods and villagers.
  const p = (id: PerkId): number => o.perks.filter((x) => x === id).length;
  const stores = o.meta.stores ?? 0;
  s.stock.wood = 30 + 8 * stores;
  s.stock.planks = 12 + 15 * p('wagon');
  s.stock.berries = Math.round((40 + 8 * stores + 20 * p('wagon')) * (o.curses.includes('rot') ? 0.5 : 1));
  const nv = 7 + 2 * p('settlers') + (o.meta.charter ?? 0) - (o.curses.includes('thin') ? 1 : 0) + (o.final ? 1 : 0);
  for (let k = 0; k < nv; k++) spawn(s, bio.species[k % bio.species.length]);
  s.arrived = 0;
  for (let k = 0; k < (o.final ? 6 : 5); k++) s.orders.push({ rep: [2, 2, 3, 3, 4, 4][k], opts: null, o: null, done: false, timer: 0 });
  s.unlocked = 2;
  makeOrderOpts(s, 0);
  makeOrderOpts(s, 1);
  offerBlueprints(s);
  return s;
}

function addBuilding(s: Settlement, def: BuildingId, x: number, y: number, built: boolean): Building {
  const b: Building = { id: s.nextId++, def, x, y, built, prog: built ? 1 : 0, w: [], inb: {}, out: {} };
  s.b.push(b);
  return b;
}

function spawn(s: Settlement, sp: SpeciesId): Villager {
  const h = s.b[0] ?? { x: W >> 1, y: H >> 1 };
  const v: Villager = {
    id: s.nextId++,
    sp,
    x: h.x + (rnd(s) - 0.5),
    y: h.y + 0.6,
    job: -1,
    home: -1,
    st: 'idle',
    act: '',
    tgt: -1,
    tx: 0,
    ty: 0,
    tt: 0,
    wait: rint(s, 0, 8),
    carry: {},
    ck: '',
    resolve: 5,
    meal: rint(s, 10, EAT_SECS),
    mq: 0,
    lux: rint(s, 5, 30),
    luxOn: false,
    low: 0,
    note: '',
  };
  s.v.push(v);
  s.arrived++;
  return v;
}

// ---------- Queries ----------

export const bById = (s: Settlement, id: number): Building | undefined => s.b.find((b) => b.id === id);
export const vById = (s: Settlement, id: number): Villager | undefined => s.v.find((v) => v.id === id);
export const builtCount = (s: Settlement, def: BuildingId): number => s.b.filter((b) => b.def === def && b.built).length;
export const hasBuilt = (s: Settlement, def: BuildingId): boolean => s.b.some((b) => b.def === def && b.built);

export function yearLen(s: Settlement): number {
  return SEASONS.drizzle.len + SEASONS.clearance.len + Math.round(SEASONS.storm.len * s.mods.stormLen);
}

export function seasonAt(s: Settlement, sec: number): { season: SeasonId; left: number; year: number } {
  const yl = yearLen(s);
  const y = Math.floor(sec / yl);
  const r = sec - y * yl;
  const d = SEASONS.drizzle.len;
  const c = SEASONS.clearance.len;
  if (r < d) return { season: 'drizzle', left: d - r, year: y + 1 };
  if (r < d + c) return { season: 'clearance', left: d + c - r, year: y + 1 };
  return { season: 'storm', left: yl - r, year: y + 1 };
}

export const secs = (s: Settlement): number => Math.floor(s.t / TPS);
export const free = (s: Settlement): Villager[] => s.v.filter((v) => v.job < 0);

export function avgResolve(s: Settlement): number {
  if (!s.v.length) return 0;
  return s.v.reduce((a, v) => a + v.resolve, 0) / s.v.length;
}

export function housedCount(s: Settlement): number {
  return s.v.filter((v) => v.home >= 0).length;
}

export function housing(s: Settlement): number {
  return s.b.filter((b) => b.built && BUILDINGS[b.def].cap).reduce((a, b) => a + (BUILDINGS[b.def].cap ?? 0), 0);
}

export function activeEvents(s: Settlement): Glade[] {
  return s.glades.filter((g) => g.es === 'active' || g.es === 'solving');
}

function dangerSum(s: Settlement, key: 'resolve' | 'imp' | 'work'): number {
  const storm = s.season === 'storm' ? 2 : 1;
  let t = 0;
  for (const g of s.glades) if (g.ev && (g.es === 'active' || g.es === 'solving')) t += (EVENTS[g.ev][key] ?? 0) * storm;
  return t;
}

export function canAfford(s: Settlement, cost: Bag, mul = 1): boolean {
  return (Object.keys(cost) as GoodId[]).every((g) => s.stock[g] >= Math.ceil((cost[g] ?? 0) * mul));
}

function pay(s: Settlement, cost: Bag, mul = 1): void {
  for (const g of Object.keys(cost) as GoodId[]) s.stock[g] -= Math.ceil((cost[g] ?? 0) * mul);
}

export const bagTotal = (b: Bag): number => Object.values(b).reduce((a, n) => a + (n ?? 0), 0);

// ---------- Player actions ----------

export function canPlace(s: Settlement, def: BuildingId, x: number, y: number): string {
  if (!inMap(x, y)) return 'Outside the map';
  if (!s.blueprints.includes(def)) return 'No blueprint';
  const i = idx(x, y);
  if (s.fog[i]) return 'Not explored';
  const t = s.tiles[i];
  if (t === T_FOREST) return 'Forest: cut it first';
  if (t === T_WATER) return 'Water';
  if (s.res[i] >= 0) return 'Resource node';
  if (s.b.some((b) => b.x === x && b.y === y)) return 'Occupied';
  if (def === 'road' && t === T_ROAD) return 'Already a road';
  if (s.gl[i] >= 0) {
    const g = s.glades[s.gl[i]];
    if (g.ev && g.es !== 'done' && g.es !== 'none' && g.x === x && g.y === y) return 'Glade event';
  }
  if (!canAfford(s, BUILDINGS[def].cost)) return 'Not enough goods';
  return '';
}

export function place(s: Settlement, def: BuildingId, x: number, y: number): Building | null {
  if (canPlace(s, def, x, y)) return null;
  pay(s, BUILDINGS[def].cost);
  if (def === 'road') {
    s.tiles[idx(x, y)] = T_ROAD;
    return null;
  }
  const b = addBuilding(s, def, x, y, false);
  s.ev.push('place');
  return b;
}

export function demolish(s: Settlement, id: number): void {
  const b = bById(s, id);
  if (!b || b.def === 'hearth') return;
  const cost = BUILDINGS[b.def].cost;
  for (const g of Object.keys(cost) as GoodId[]) s.stock[g] += b.built ? Math.floor((cost[g] ?? 0) / 2) : cost[g] ?? 0;
  for (const g of Object.keys(b.inb) as GoodId[]) s.stock[g] += b.inb[g] ?? 0;
  for (const g of Object.keys(b.out) as GoodId[]) s.stock[g] += b.out[g] ?? 0;
  for (const v of s.v) {
    if (v.job === id) release(s, v);
    if (v.home === id) v.home = -1;
    if (v.tgt === id && v.job < 0) v.st = 'idle';
  }
  s.b = s.b.filter((x) => x !== b);
}

export function removeRoad(s: Settlement, x: number, y: number): void {
  const i = idx(x, y);
  if (s.tiles[i] === T_ROAD) s.tiles[i] = T_GROUND;
}

function release(s: Settlement, v: Villager): void {
  const b = bById(s, v.job);
  if (b) b.w = b.w.filter((x) => x !== v.id);
  for (const g of Object.keys(v.carry) as GoodId[]) s.stock[g] += v.carry[g] ?? 0;
  v.carry = {};
  v.ck = '';
  v.job = -1;
  v.st = 'idle';
  v.wait = 0;
  v.note = '';
}

/** Assign the best free villager to the building. Skilled species first. */
export function assign(s: Settlement, id: number, sp?: SpeciesId): boolean {
  const b = bById(s, id);
  if (!b || !b.built) return false;
  const d = BUILDINGS[b.def];
  if (b.w.length >= d.workers) return false;
  const pool = free(s).filter((v) => !sp || v.sp === sp);
  if (!pool.length) return false;
  pool.sort((a, c) => (SPECIES[c.sp].skills.includes(b.def) ? 1 : 0) - (SPECIES[a.sp].skills.includes(b.def) ? 1 : 0) || a.id - c.id);
  const v = pool[0];
  v.job = b.id;
  v.st = 'idle';
  v.wait = 0;
  v.act = '';
  b.w.push(v.id);
  return true;
}

export function unassign(s: Settlement, id: number): boolean {
  const b = bById(s, id);
  if (!b || !b.w.length) return false;
  const v = vById(s, b.w[b.w.length - 1]);
  if (v) release(s, v);
  else b.w.pop();
  return true;
}

export function offerBlueprints(s: Settlement): void {
  if (s.bpOffer || s.bpPicks <= 0) return;
  const pool = BLUEPRINT_POOL.filter((b) => !s.blueprints.includes(b));
  if (!pool.length) {
    s.bpPicks = 0;
    return;
  }
  const out: BuildingId[] = [];
  while (out.length < s.mods.bpOptions && pool.length) out.push(pool.splice(Math.floor(rnd(s) * pool.length), 1)[0]);
  s.bpOffer = out;
}

export function pickBlueprint(s: Settlement, i: number): void {
  if (!s.bpOffer || !s.bpOffer[i]) return;
  s.blueprints.push(s.bpOffer[i]);
  s.bpOffer = null;
  s.bpPicks--;
  offerBlueprints(s);
}

export function pickOrder(s: Settlement, oi: number, k: number): void {
  const o = s.orders[oi];
  if (!o || !o.opts || !o.opts[k] || oi >= s.unlocked) return;
  o.o = { ...o.opts[k] };
  o.opts = null;
  if (o.o.kind === 'make') o.o.base = s.made[o.o.good!];
}

export function eventCost(s: Settlement, g: Glade): Bag {
  const c: Bag = {};
  if (!g.ev) return c;
  const base = EVENTS[g.ev].cost;
  for (const k of Object.keys(base) as GoodId[]) c[k] = Math.ceil((base[k] ?? 0) * s.mods.gladeCost);
  return c;
}

export function solveEvent(s: Settlement, gid: number): boolean {
  const g = s.glades[gid];
  if (!g || g.es !== 'active' || !g.ev) return false;
  const c = eventCost(s, g);
  if (!canAfford(s, c)) return false;
  pay(s, c);
  g.es = 'solving';
  g.et = Math.ceil(EVENTS[g.ev].time * s.mods.gladeTime);
  return true;
}

export function sell(s: Settlement, good: GoodId, n: number): boolean {
  if (!s.caravan || s.stock[good] < n || good === 'coins') return false;
  s.stock[good] -= n;
  s.stock.coins += GOODS[good].value * n;
  s.ev.push('coin');
  return true;
}

export function buy(s: Settlement, k: number): boolean {
  const c = s.caravan;
  const of = c?.offers[k];
  if (!c || !of || of.sold || s.stock.coins < of.price) return false;
  s.stock.coins -= of.price;
  s.stock[of.good] += of.n;
  of.sold = true;
  s.ev.push('coin');
  return true;
}

export const TRIBUTE = 25;
export function tribute(s: Settlement): boolean {
  if (!hasBuilt(s, 'trading') || s.stock.coins < TRIBUTE) return false;
  s.stock.coins -= TRIBUTE;
  s.imp = Math.max(0, s.imp - 8);
  s.ev.push('coin');
  return true;
}

// ---------- Orders ----------

const MAKE_BASE: Partial<Record<GoodId, number>> = {
  wood: 70,
  planks: 30,
  grain: 40,
  berries: 35,
  mushrooms: 30,
  herbs: 25,
  stone: 25,
  clay: 25,
  flour: 24,
  bread: 30,
  bricks: 20,
  tea: 16,
  ale: 16,
  stew: 24,
  tools: 6,
};

function producible(s: Settlement): GoodId[] {
  const out = new Set<GoodId>(['wood']);
  const resOpen = new Set<ResId>();
  s.res.forEach((r, i) => {
    if (r >= 0 && !s.fog[i]) resOpen.add(RES_IDS[r]);
  });
  for (const b of s.blueprints) {
    const d = BUILDINGS[b];
    if (d.gathers) for (const g of d.gathers) if (g !== 'wood' && resOpen.has(g)) out.add(g);
    if (d.output) for (const g of Object.keys(d.output) as GoodId[]) out.add(g);
  }
  return [...out];
}

function makeOrderOpts(s: Settlement, oi: number): void {
  const o = s.orders[oi];
  const tier = oi;
  const scale = (1 + 0.3 * tier) * (s.final ? 1.25 : 1);
  const gen = (): OrderOpt => {
    const kinds: [OrderOpt['kind'], number][] = [
      ['make', 5],
      ['build', 2],
      ['pop', 1],
      ['housed', 1],
      ['resolve', tier >= 1 ? 1 : 0],
      ['glades', 1],
      ['events', s.glades.some((g) => g.es === 'hidden' || g.es === 'active') ? 1 : 0],
    ];
    const kind = rweighted(s, kinds);
    switch (kind) {
      case 'make': {
        const g = rpick(s, producible(s).filter((x) => MAKE_BASE[x]));
        const n = Math.round(((MAKE_BASE[g] ?? 20) * scale) / 2) * 2;
        return { kind, good: g, n, base: s.made[g], text: `Produce ${n} ${GOODS[g].icon} ${GOODS[g].name}` };
      }
      case 'build': {
        const opts: BuildingId[] = ['shelter', 'warehouse'];
        if (s.blueprints.includes('house')) opts.push('house');
        if (s.blueprints.includes('shrine')) opts.push('shrine');
        const bd = rpick(s, opts);
        const n = bd === 'shelter' ? 3 + tier : bd === 'house' ? 2 + (tier >> 1) : bd === 'warehouse' ? 2 + (tier >> 1) : 1;
        return { kind, bld: bd, n, base: 0, text: `Have ${n} ${BUILDINGS[bd].icon} ${BUILDINGS[bd].name}${n > 1 ? 's' : ''}` };
      }
      case 'pop': {
        const n = Math.max(s.v.length, 7) + 3 + tier;
        return { kind, n, base: 0, text: `Reach ${n} villagers` };
      }
      case 'housed': {
        const n = 7 + 2 * tier;
        return { kind, n, base: 0, text: `House ${n} villagers` };
      }
      case 'resolve': {
        const n = 5 + tier;
        return { kind, n, base: 0, text: `Keep average resolve ≥ ${n} for 60 s` };
      }
      case 'glades': {
        const open = s.glades.filter((g) => g.open).length;
        const n = Math.min(s.glades.length, open + 2 + (tier >> 1));
        return { kind, n, base: 0, text: `Discover ${n} glades` };
      }
      default: {
        const n = s.solved + 1;
        return { kind: 'events', n, base: 0, text: `Solve ${n} glade event${n > 1 ? 's' : ''}` };
      }
    }
  };
  const a = gen();
  let b = gen();
  for (let k = 0; k < 6 && b.text === a.text; k++) b = gen();
  o.opts = [a, b];
}

export function orderProgress(s: Settlement, o: OrderOpt, ord?: Order): number {
  switch (o.kind) {
    case 'make':
      return s.made[o.good!] - o.base;
    case 'build':
      return builtCount(s, o.bld!);
    case 'pop':
      return s.v.length;
    case 'housed':
      return housedCount(s);
    case 'resolve':
      return ord ? Math.floor(ord.timer) : 0;
    case 'glades':
      return s.glades.filter((g) => g.open).length;
    case 'events':
      return s.solved;
  }
}

export const orderTarget = (o: OrderOpt): number => (o.kind === 'resolve' ? 60 : o.n);

function checkOrders(s: Settlement): void {
  for (let i = 0; i < s.unlocked && i < s.orders.length; i++) {
    const ord = s.orders[i];
    if (ord.done || !ord.o) continue;
    if (ord.o.kind === 'resolve') ord.timer = avgResolve(s) >= ord.o.n ? ord.timer + 1 : 0;
    if (orderProgress(s, ord.o, ord) >= orderTarget(ord.o)) {
      ord.done = true;
      s.rep += ord.rep;
      s.imp = Math.max(0, s.imp - 6);
      s.ev.push('order');
      s.msgs.push(`Order done: ${ord.o.text} (+${ord.rep} reputation)`);
      if (s.unlocked < s.orders.length) {
        makeOrderOpts(s, s.unlocked);
        s.unlocked++;
      }
    }
  }
}

// ---------- Simulation ----------

function fx(s: Settlement, x: number, y: number, text: string, color = '#fff'): void {
  s.fx.push({ x, y, text, color });
  if (s.fx.length > 40) s.fx.shift();
}

function nearestStorage(s: Settlement, x: number, y: number): Building {
  let best = s.b[0];
  let bd = Infinity;
  for (const b of s.b) {
    if (!b.built || (b.def !== 'hearth' && b.def !== 'warehouse')) continue;
    const d = Math.abs(b.x - x) + Math.abs(b.y - y);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return best;
}

function goTo(v: Villager, x: number, y: number, act: string, tgt: number): void {
  v.st = 'go';
  v.tx = x;
  v.ty = y;
  v.act = act;
  v.tgt = tgt;
}

function goStorage(s: Settlement, v: Villager, act: 'drop' | 'fetch'): void {
  const st = nearestStorage(s, v.x, v.y);
  goTo(v, st.x, st.y + 0.35, act, st.id);
}

function move(s: Settlement, v: Villager): boolean {
  const dx = v.tx - v.x;
  const dy = v.ty - v.y;
  const d = Math.hypot(dx, dy);
  const tx = Math.round(v.x);
  const ty = Math.round(v.y);
  const t = inMap(tx, ty) ? s.tiles[idx(tx, ty)] : T_GROUND;
  const sp = 0.42 * (t === T_ROAD ? 1.7 : t === T_FOREST ? 0.6 : t === T_WATER ? 0.5 : 1) * (s.season === 'storm' ? 0.85 : 1);
  if (d <= sp) {
    v.x = v.tx;
    v.y = v.ty;
    return true;
  }
  v.x += (dx / d) * sp;
  v.y += (dy / d) * sp;
  return false;
}

function workMul(s: Settlement, v: Villager, b: Building): number {
  const d = BUILDINGS[b.def];
  let m = SPECIES[v.sp].skills.includes(b.def) ? 1.4 : 1;
  if (b.def === 'woodcutter') m *= s.mods.chop;
  else if (d.kind === 'gather') m *= s.mods.gather;
  else if (b.def === 'farm') m *= s.mods.farm * (s.season === 'drizzle' ? 1.3 : 1);
  else m *= s.mods.craft;
  if (s.season === 'storm') m *= 0.8;
  m *= Math.max(0.3, 1 + dangerSum(s, 'work'));
  return m;
}

function findTarget(s: Settlement, b: Building, v: Villager): number {
  const d = BUILDINGS[b.def];
  const r = d.radius ?? 6;
  const wood = d.gathers!.includes('wood');
  const kinds = d.gathers!.filter((g) => g !== 'wood').map((g) => RES_IDS.indexOf(g as ResId));
  const taken = new Set<number>();
  for (const o of s.v) if (o !== v && o.job === b.id && o.act === 'gather') taken.add(o.tgt);
  let best = -1;
  let bd = Infinity;
  for (let y = Math.max(0, b.y - r); y <= Math.min(H - 1, b.y + r); y++)
    for (let x = Math.max(0, b.x - r); x <= Math.min(W - 1, b.x + r); x++) {
      const i = idx(x, y);
      if (s.fog[i]) continue;
      let ok = false;
      if (wood) ok = s.tiles[i] === T_FOREST && s.amt[i] > 0 && touchesOpen(s, x, y);
      if (!ok && kinds.length) ok = s.res[i] >= 0 && kinds.includes(s.res[i]) && s.amt[i] > 0;
      if (!ok) continue;
      let dd = Math.hypot(x - b.x, y - b.y);
      if (dd > r + 0.5) continue;
      if (taken.has(i)) dd += 3;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
  return best;
}

function touchesOpen(s: Settlement, x: number, y: number): boolean {
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx;
    const ny = y + dy;
    if (inMap(nx, ny) && s.tiles[idx(nx, ny)] !== T_FOREST && !s.fog[idx(nx, ny)]) return true;
  }
  return false;
}

function clearTile(s: Settlement, i: number): void {
  s.tiles[i] = T_GROUND;
  s.amt[i] = 0;
  const x = i % W;
  const y = Math.floor(i / W);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny);
      if (s.gl[j] >= 0 && s.fog[j]) revealGlade(s, s.gl[j]);
    }
}

export function revealGlade(s: Settlement, gid: number): void {
  const g = s.glades[gid];
  if (g.open) return;
  g.open = true;
  for (let i = 0; i < s.gl.length; i++) if (s.gl[i] === gid) s.fog[i] = 0;
  if (g.ev && g.es === 'hidden') {
    g.es = 'active';
    const e = EVENTS[g.ev];
    s.ev.push(e.danger ? 'danger' : 'glade');
    s.msgs.push(`${e.danger ? 'Dangerous glade' : 'Glade'} found: ${e.icon} ${e.name}`);
  } else {
    s.ev.push('glade');
    s.msgs.push('A new glade is open.');
  }
  fx(s, g.x, g.y, '🌿 Glade!', '#9be564');
}

function hasInputs(b: Building, d: { input?: Bag }): boolean {
  return (Object.keys(d.input ?? {}) as GoodId[]).every((g) => (b.inb[g] ?? 0) >= (d.input![g] ?? 0));
}

function stockHasInputs(s: Settlement, d: { input?: Bag }): boolean {
  return (Object.keys(d.input ?? {}) as GoodId[]).every((g) => s.stock[g] >= (d.input![g] ?? 0));
}

function decideWorker(s: Settlement, v: Villager, b: Building): void {
  const d = BUILDINGS[b.def];
  if (bagTotal(v.carry) > 0) {
    if (v.ck === 'in') goTo(v, b.x, b.y + 0.3, 'load', b.id);
    else goStorage(s, v, 'drop');
    return;
  }
  if (d.kind === 'gather') {
    const t = findTarget(s, b, v);
    if (t < 0) {
      v.note = 'Nothing to gather in range';
      v.wait = 12;
      if (Math.hypot(v.x - b.x, v.y - b.y) > 1) goTo(v, b.x, b.y + 0.3, 'wander', -1);
      return;
    }
    v.note = '';
    goTo(v, t % W, Math.floor(t / W), 'gather', t);
    return;
  }
  // Craft building (farm has no input).
  const outN = bagTotal(b.out);
  const stormStop = b.def === 'farm' && s.season === 'storm';
  const canWork = hasInputs(b, d) && !stormStop;
  if (outN >= 6 || (outN > 0 && !canWork)) {
    v.carry = { ...b.out };
    v.ck = 'out';
    b.out = {};
    goStorage(s, v, 'drop');
    return;
  }
  if (canWork) {
    v.note = '';
    if (Math.hypot(v.x - b.x, v.y - b.y) < 0.8) startCraft(s, v, b);
    else goTo(v, b.x, b.y + 0.3, 'craft', b.id);
    return;
  }
  if (stormStop) {
    v.note = 'Farms rest in the storm';
    v.wait = 12;
    return;
  }
  // Only one worker fetches at a time.
  const fetching = s.v.some((o) => o !== v && o.job === b.id && (o.act === 'fetch' || o.act === 'load') && o.st === 'go');
  if (!fetching && stockHasInputs(s, d)) {
    v.note = '';
    goStorage(s, v, 'fetch');
    return;
  }
  v.note = fetching ? 'Waiting for goods' : 'No input goods in storage';
  v.wait = 8;
}

function startCraft(s: Settlement, v: Villager, b: Building): void {
  const d = BUILDINGS[b.def];
  v.st = 'work';
  v.act = 'craft';
  v.tgt = b.id;
  v.tt = Math.ceil(((d.time ?? 6) * TPS) / workMul(s, v, b));
}

function arrive(s: Settlement, v: Villager): void {
  const b = v.job >= 0 ? bById(s, v.job) : undefined;
  switch (v.act) {
    case 'gather': {
      if (!b) return void (v.st = 'idle');
      v.st = 'work';
      v.tt = Math.ceil(((BUILDINGS[b.def].time ?? 5) * TPS) / workMul(s, v, b));
      return;
    }
    case 'drop': {
      let first = '';
      for (const g of Object.keys(v.carry) as GoodId[]) {
        const n = v.carry[g] ?? 0;
        s.stock[g] += n;
        s.made[g] += n;
        if (!first && n) first = `+${n}${GOODS[g].icon}`;
      }
      if (first) {
        fx(s, v.x, v.y - 0.4, first, '#ffe8a3');
        s.ev.push('drop');
      }
      v.carry = {};
      v.ck = '';
      v.st = 'idle';
      return;
    }
    case 'fetch': {
      v.st = 'idle';
      if (!b) return;
      const d = BUILDINGS[b.def];
      if (!stockHasInputs(s, d)) return;
      const cycles = (Object.keys(d.input!) as GoodId[]).reduce((m, g) => Math.min(m, Math.floor(s.stock[g] / (d.input![g] ?? 1))), 3);
      for (const g of Object.keys(d.input!) as GoodId[]) {
        const n = (d.input![g] ?? 0) * cycles;
        s.stock[g] -= n;
        v.carry[g] = n;
      }
      v.ck = 'in';
      goTo(v, b.x, b.y + 0.3, 'load', b.id);
      return;
    }
    case 'load': {
      if (b) for (const g of Object.keys(v.carry) as GoodId[]) b.inb[g] = (b.inb[g] ?? 0) + (v.carry[g] ?? 0);
      else for (const g of Object.keys(v.carry) as GoodId[]) s.stock[g] += v.carry[g] ?? 0;
      v.carry = {};
      v.ck = '';
      v.st = 'idle';
      return;
    }
    case 'craft':
      if (b) startCraft(s, v, b);
      else v.st = 'idle';
      return;
    case 'build': {
      const site = bById(s, v.tgt);
      if (!site || site.built) return void (v.st = 'idle');
      v.st = 'work';
      v.act = 'build';
      return;
    }
    default:
      v.st = 'idle';
  }
}

function finish(s: Settlement, v: Villager): void {
  const b = bById(s, v.job);
  v.st = 'idle';
  if (!b) return;
  const d = BUILDINGS[b.def];
  if (v.act === 'gather') {
    const i = v.tgt;
    if (s.tiles[i] === T_FOREST && s.amt[i] > 0 && d.gathers!.includes('wood')) {
      s.amt[i]--;
      v.carry = { wood: 2 };
      v.ck = 'out';
      s.ev.push('chop');
      if (s.amt[i] <= 0) clearTile(s, i);
    } else if (s.res[i] >= 0 && s.amt[i] > 0) {
      const g = RES_IDS[s.res[i]] as GoodId;
      s.amt[i]--;
      v.carry = { [g]: 2 };
      v.ck = 'out';
      if (s.amt[i] <= 0) s.res[i] = -1;
    }
    if (bagTotal(v.carry)) goStorage(s, v, 'drop');
    return;
  }
  if (v.act === 'craft') {
    if (!hasInputs(b, d) || (b.def === 'farm' && s.season === 'storm')) return;
    for (const g of Object.keys(d.input ?? {}) as GoodId[]) b.inb[g] = (b.inb[g] ?? 0) - (d.input![g] ?? 0);
    for (const g of Object.keys(d.output ?? {}) as GoodId[]) b.out[g] = (b.out[g] ?? 0) + (d.output![g] ?? 0);
  }
}

function freeTick(s: Settlement, v: Villager): void {
  if (v.st === 'work' && v.act === 'build') {
    const site = bById(s, v.tgt);
    if (!site || site.built) {
      v.st = 'idle';
      return;
    }
    site.prog += 1 / (BUILDINGS[site.def].build * TPS);
    if (site.prog >= 1) completeSite(s, site);
    return;
  }
  if (v.st === 'go') {
    if (v.act === 'build' && !bById(s, v.tgt)) v.st = 'idle';
    else if (move(s, v)) arrive(s, v);
    return;
  }
  if (v.wait > 0) {
    v.wait--;
    return;
  }
  // Look for a site.
  let best: Building | null = null;
  let bd = Infinity;
  for (const b of s.b) {
    if (b.built) continue;
    const builders = s.v.filter((o) => o.job < 0 && o.tgt === b.id && o.act === 'build').length;
    const d = Math.hypot(b.x - v.x, b.y - v.y) + builders * 4;
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  if (best) {
    goTo(v, best.x + (rnd(s) - 0.5) * 0.6, best.y + 0.4, 'build', best.id);
    return;
  }
  const h = s.b[0];
  goTo(v, h.x + (rnd(s) - 0.5) * 4, h.y + (rnd(s) - 0.5) * 4, 'wander', -1);
  v.wait = rint(s, 8, 24);
}

function completeSite(s: Settlement, b: Building): void {
  b.built = true;
  b.prog = 1;
  s.ev.push('built');
  fx(s, b.x, b.y - 0.5, `${BUILDINGS[b.def].icon} built`, '#9be564');
  for (const v of s.v) if (v.job < 0 && v.tgt === b.id && v.act === 'build') v.st = 'idle';
}

function villagerTick(s: Settlement, v: Villager): void {
  if (v.job < 0) return freeTick(s, v);
  const b = bById(s, v.job);
  if (!b) {
    release(s, v);
    return;
  }
  switch (v.st) {
    case 'go':
      if (move(s, v)) arrive(s, v);
      return;
    case 'work':
      if (--v.tt <= 0) finish(s, v);
      return;
    default:
      if (v.wait > 0) {
        v.wait--;
        return;
      }
      decideWorker(s, v, b);
  }
}

export function resolveTarget(s: Settlement, v: Villager): { total: number; parts: [string, number][] } {
  const sp = SPECIES[v.sp];
  const parts: [string, number][] = [['Base', sp.base]];
  if (s.mods.resolve) parts.push(['Curse', s.mods.resolve]);
  if (s.bonusResolve) parts.push(['Spring', s.bonusResolve]);
  parts.push([v.mq < 0 ? 'Hungry' : v.mq >= 3 ? 'Liked food' : v.mq > 0 ? 'Good food' : 'Plain food', v.mq]);
  const home = bById(s, v.home);
  if (home) parts.push([BUILDINGS[home.def].name, (home.def === 'house' ? 3 : 1) + s.mods.housed]);
  else parts.push(['Homeless', s.season === 'storm' ? -6 : -3]);
  if (v.luxOn) parts.push([`${GOODS[sp.lux].name}`, s.mods.lux]);
  if (s.season === 'storm') parts.push(['Storm', -Math.round(s.mods.storm * sp.storm)]);
  if (hasBuilt(s, 'shrine')) parts.push(['Shrine', 2]);
  const dr = dangerSum(s, 'resolve');
  if (dr) parts.push(['Dangers', dr]);
  return { total: parts.reduce((a, [, n]) => a + n, 0), parts };
}

function eat(s: Settlement, v: Villager): void {
  v.meal--;
  if (v.meal > 0) return;
  const sp = SPECIES[v.sp];
  const order = [...sp.likes.filter((g) => s.stock[g] > 0), ...FOODS.filter((g) => s.stock[g] > 0 && !sp.likes.includes(g))];
  const g = order[0];
  if (!g) {
    v.mq = -6;
    v.meal = 8;
    return;
  }
  s.stock[g]--;
  v.mq = (sp.likes.includes(g) ? 3 : 0) + (GOODS[g].food === 'complex' ? 1 : 0);
  v.meal = Math.round(EAT_SECS / s.mods.eat);
}

function luxury(s: Settlement, v: Villager): void {
  v.lux--;
  if (v.lux > 0) return;
  const g = SPECIES[v.sp].lux;
  if (s.stock[g] > 0) {
    s.stock[g]--;
    v.luxOn = true;
    v.lux = LUX_SECS;
  } else {
    v.luxOn = false;
    v.lux = 12;
  }
}

function secondTick(s: Settlement): void {
  const sec = secs(s);
  const sa = seasonAt(s, sec);
  if (sa.season !== s.season) {
    s.season = sa.season;
    s.ev.push(sa.season === 'storm' ? 'storm' : 'season');
    s.msgs.push(`${SEASONS[sa.season].icon} ${SEASONS[sa.season].name}: ${SEASONS[sa.season].text}`);
    if (sa.season === 'drizzle') {
      s.year = sa.year;
      s.bpPicks++;
      offerBlueprints(s);
    }
    if (sa.season === 'clearance' && hasBuilt(s, 'trading')) {
      const pool = (['planks', 'bricks', 'tools', 'bread', 'tea', 'ale', 'stone', 'clay', 'herbs'] as GoodId[]).slice();
      const offers: Caravan['offers'] = [];
      for (let k = 0; k < 3; k++) {
        const g = pool.splice(Math.floor(rnd(s) * pool.length), 1)[0];
        const n = g === 'tools' ? 3 : 10;
        offers.push({ good: g, n, price: Math.ceil(GOODS[g].value * n * 1.5), sold: false });
      }
      s.caravan = { left: SEASONS.clearance.len, offers };
      s.msgs.push('⚖️ A caravan arrives at the Trading Post.');
      s.ev.push('coin');
    }
  }
  if (s.caravan && --s.caravan.left <= 0) s.caravan = null;

  // Homes.
  const houses = s.b.filter((b) => b.built && BUILDINGS[b.def].cap);
  const occ = new Map<number, number>();
  for (const v of s.v) if (v.home >= 0) occ.set(v.home, (occ.get(v.home) ?? 0) + 1);
  for (const v of s.v) {
    if (v.home >= 0 && !houses.some((h) => h.id === v.home)) v.home = -1;
    if (v.home >= 0) continue;
    const sorted = houses.filter((h) => (occ.get(h.id) ?? 0) < (BUILDINGS[h.def].cap ?? 0)).sort((a, b) => (b.def === 'house' ? 1 : 0) - (a.def === 'house' ? 1 : 0));
    if (sorted[0]) {
      v.home = sorted[0].id;
      occ.set(v.home, (occ.get(v.home) ?? 0) + 1);
    }
  }
  // Needs and resolve.
  let high = 0;
  for (const v of [...s.v]) {
    eat(s, v);
    luxury(s, v);
    const tgt = resolveTarget(s, v).total;
    if (v.resolve < tgt) v.resolve = Math.min(tgt, v.resolve + 0.5);
    else v.resolve = Math.max(tgt, v.resolve - 0.5);
    if (v.resolve >= HIGH_RESOLVE) high++;
    if (v.resolve < 0) v.low++;
    else v.low = Math.max(0, v.low - 2);
    if (v.low >= 25) leave(s, v);
  }
  s.rep += high * REP_TRICKLE * (s.final ? 0.8 : 1);
  // Newcomers.
  if (--s.nextNew <= 0) {
    s.nextNew = NEWCOMER_SECS;
    const avg = avgResolve(s);
    if (s.v.length && avg >= 2) {
      const n = avg >= 8 ? 2 : 1;
      for (let k = 0; k < n; k++) spawn(s, rpick(s, BIOMES[s.biome].species));
      s.ev.push('arrive');
      s.msgs.push(`${n} newcomer${n > 1 ? 's' : ''} arrived.`);
    }
  }
  // Glade events.
  for (const g of s.glades) {
    if (g.es === 'solving' && --g.et <= 0) {
      g.es = 'done';
      s.solved++;
      const e = g.ev!;
      if (EVENTS[e].danger) s.rep += 1;
      if (e === 'ruins') {
        s.bpPicks++;
        offerBlueprints(s);
      }
      if (e === 'spring') s.bonusResolve += 1;
      if (e === 'cache') {
        const loot: GoodId[] = ['planks', 'bricks', 'bread', 'tools', 'stone'];
        const a = rpick(s, loot);
        const n = a === 'tools' ? 3 : 12;
        s.stock[a] += n;
        s.stock.planks += 6;
        fx(s, g.x, g.y, `+${n}${GOODS[a].icon}`, '#ffe8a3');
      }
      s.ev.push('order');
      s.msgs.push(`Solved: ${EVENTS[e].icon} ${EVENTS[e].name} (${EVENTS[e].reward})`);
      fx(s, g.x, g.y - 0.6, '✔ solved', '#9be564');
    }
  }
  // Impatience.
  s.imp += IMP_RATE * s.mods.imp * (1 + dangerSum(s, 'imp'));
  checkOrders(s);
  if (s.rep >= s.repGoal) {
    s.done = 'win';
    s.why = 'The Queen is pleased. The settlement is yours.';
  } else if (s.imp >= 100) {
    s.done = 'lose';
    s.why = 'The Queen ran out of patience.';
  } else if (!s.v.length) {
    s.done = 'lose';
    s.why = 'All villagers left.';
  }
}

function leave(s: Settlement, v: Villager): void {
  if (v.job >= 0) release(s, v);
  s.v = s.v.filter((x) => x !== v);
  s.left++;
  s.imp += 3;
  s.ev.push('leave');
  s.msgs.push(`A ${SPECIES[v.sp].name.toLowerCase()} left the settlement.`);
  fx(s, v.x, v.y, '💔', '#ff6b6b');
}

export function tick(s: Settlement): void {
  if (s.done) return;
  s.t++;
  for (const v of s.v) villagerTick(s, v);
  if (s.t % TPS === 0) secondTick(s);
  if (s.ev.length > 60) s.ev.splice(0, s.ev.length - 60);
  if (s.msgs.length > 30) s.msgs.splice(0, s.msgs.length - 30);
}
