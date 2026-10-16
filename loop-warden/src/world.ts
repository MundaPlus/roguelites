/** Pure run state and simulation. No DOM. The app, the bot and the headless sim all use this module. */
import {
  CARD_IDS,
  CLASSES,
  ENEMIES,
  H,
  MAPS,
  RARITY,
  RES_KEYS,
  SLOTS,
  SLOT_NAMES,
  TILES,
  W,
  zeroRes,
  type Res,
  type ResKey,
  type Slot,
  type Stats,
} from './data';
import { Rng, hash } from './rng';

export const WALK = 1.5; // road cells per second
export const DAY = 7; // seconds of walking per day
export const METER_MAX = 150;
export const HAND_MAX = 8;
export const INV_MAX = 10;
export const MAX_ON_CELL = 4;
export const BATTLE_MAX = 6;

export interface Item {
  uid: number;
  slot: Slot;
  rarity: number;
  level: number;
  name: string;
  stats: Partial<Stats>;
}

export interface Placed {
  id: string;
  age: number;
}

export interface MapEnemy {
  uid: number;
  id: string;
  /** Road index on the path. */
  at: number;
  lvl: number;
}

export interface Foe {
  uid: number;
  id: string;
  hp: number;
  max: number;
  atk: number;
  def: number;
  spd: number;
  eva: number;
  vamp: number;
  cd: number;
}

export interface Battle {
  foes: Foe[];
  heroCd: number;
  boss: boolean;
  t: number;
  summonT: number;
  /** Loot collected during the fight, paid out at the end. */
  items: number;
  cards: number;
  metal: number;
}

export type EndKind = 'win' | 'death' | 'retreat' | 'camp';

export interface EndInfo {
  kind: EndKind;
  score: number;
  kept: Res;
  loop: number;
  kills: number;
  day: number;
}

export interface Meta {
  res: Res;
  built: string[];
  stats: { runs: number; wins: number; bestLoop: number; bestScore: number; kills: number };
}

export interface Run {
  v: 1;
  seed: string;
  rs: number;
  cls: string;
  map: number;
  path: number[];
  tiles: (Placed | null)[];
  enemies: MapEnemy[];
  hp: number;
  pos: number;
  loop: number;
  day: number;
  dayT: number;
  hand: string[];
  inv: Item[];
  gear: Record<Slot, Item | null>;
  potions: number;
  maxPotions: number;
  meter: number;
  bossWarned: boolean;
  res: Res;
  kills: number;
  placed: number;
  battle: Battle | null;
  /** Waiting for the player's choice at the camp. */
  camp: boolean;
  over: EndInfo | null;
  uid: number;
  time: number;
  /** Bonuses from camp buildings, fixed at run start. */
  bonus: { hp: number; dmg: number; campHeal: number; potions: number };
  unlocked: string[];
}

/** Things that happened during a tick. The app turns them into sounds and effects. */
export type Ev =
  | { t: 'hit'; who: 'hero' | 'foe'; uid: number; dmg: number; crit: boolean }
  | { t: 'miss'; who: 'hero' | 'foe'; uid: number }
  | { t: 'kill'; uid: number; id: string }
  | { t: 'battle'; boss: boolean }
  | { t: 'won'; items: number; cards: number; metal: number }
  | { t: 'day'; day: number }
  | { t: 'heal'; n: number; cell: number }
  | { t: 'res'; res: ResKey; n: number; cell: number }
  | { t: 'spawn'; at: number; id: string }
  | { t: 'camp' }
  | { t: 'boss-ready' }
  | { t: 'summon' }
  | { t: 'card'; id: string }
  | { t: 'scrap'; n: number }
  | { t: 'end'; kind: EndKind };

// ---------- Grid helpers ----------

export const cx = (cell: number): number => cell % W;
export const cy = (cell: number): number => Math.floor(cell / W);
export const cellAt = (x: number, y: number): number => (x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x);

export function n4(cell: number): number[] {
  const x = cx(cell);
  const y = cy(cell);
  return [cellAt(x + 1, y), cellAt(x - 1, y), cellAt(x, y + 1), cellAt(x, y - 1)].filter((c) => c >= 0);
}

export function n8(cell: number): number[] {
  const out: number[] = [];
  const x = cx(cell);
  const y = cy(cell);
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const c = cellAt(x + dx, y + dy);
      if (c >= 0) out.push(c);
    }
  return out;
}

export const cheb = (a: number, b: number): number => Math.max(Math.abs(cx(a) - cx(b)), Math.abs(cy(a) - cy(b)));

/** Builds the ordered road path of a map. Index 0 is the camp. Throws when the map is not a clean loop. */
export function buildPath(mapIdx: number): number[] {
  const rows = MAPS[mapIdx];
  const road = new Set<number>();
  let camp = -1;
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#' || ch === 'C') road.add(cellAt(x, y));
      if (ch === 'C') camp = cellAt(x, y);
    }),
  );
  for (const c of road) {
    const k = n4(c).filter((n) => road.has(n)).length;
    if (k !== 2) throw new Error(`map ${mapIdx}: cell ${cx(c)},${cy(c)} has ${k} road neighbors`);
  }
  const path = [camp];
  // Go right (clockwise) first if possible.
  let prev = camp;
  let cur = road.has(camp + 1) ? camp + 1 : n4(camp).find((n) => road.has(n))!;
  while (cur !== camp) {
    path.push(cur);
    const nxt = n4(cur).find((n) => road.has(n) && n !== prev)!;
    prev = cur;
    cur = nxt;
  }
  if (path.length !== road.size) throw new Error(`map ${mapIdx}: loop has ${path.length} of ${road.size} cells`);
  return path;
}

const pathCache = new Map<string, Map<number, number>>();
/** Map from cell to road index (-1 if not road). */
export function roadIndex(run: Run): Map<number, number> {
  const key = run.path.join(',');
  let m = pathCache.get(key);
  if (!m) {
    m = new Map(run.path.map((c, i) => [c, i]));
    pathCache.set(key, m);
  }
  return m;
}

export const isRoad = (run: Run, cell: number): boolean => roadIndex(run).has(cell);

// ---------- Run creation ----------

export function newRun(seed: string, cls: string, meta: Meta): Run {
  const rng = new Rng(hash(seed, 'run'));
  const map = rng.int(0, MAPS.length - 1);
  const path = buildPath(map);
  const built = new Set(meta.built);
  const unlocked = CARD_IDS.filter((id) => !TILES[id].unlock || built.has(TILES[id].unlock!));
  const run: Run = {
    v: 1,
    seed,
    rs: 0,
    cls,
    map,
    path,
    tiles: new Array(W * H).fill(null),
    enemies: [],
    hp: 1,
    pos: 0,
    loop: 1,
    day: 1,
    dayT: 0,
    hand: [],
    inv: [],
    gear: { weapon: null, armor: null, shield: null, ring: null },
    potions: 1 + (built.has('herbalist') ? 1 : 0),
    maxPotions: 2 + (built.has('herbalist') ? 1 : 0),
    meter: 0,
    bossWarned: false,
    res: zeroRes(),
    kills: 0,
    placed: 0,
    battle: null,
    camp: false,
    over: null,
    uid: 1,
    time: 0,
    bonus: {
      hp: built.has('gym') ? 15 : 0,
      dmg: built.has('forge') ? 2 : 0,
      campHeal: built.has('kitchen') ? 0.1 : 0,
      potions: built.has('herbalist') ? 1 : 0,
    },
    unlocked,
  };
  const startCards = 3 + (built.has('depot') ? 2 : 0);
  for (let i = 0; i < startCards; i++) run.hand.push(rng.pick(unlocked.filter((c) => c !== 'oblivion')));
  const w = genItem(rng, run, 1, 'weapon', built.has('smithy') ? 1 : 0);
  run.gear.weapon = w;
  // A few slimes on the road so the first loop has something to fight.
  for (let i = 0; i < 3; i++) {
    const at = rng.int(3, path.length - 2);
    run.enemies.push({ uid: run.uid++, id: 'slime', at, lvl: 1 });
  }
  run.rs = rng.raw;
  run.hp = heroStats(run).maxHp;
  return run;
}

// ---------- Items ----------

const AFFIX: { stat: keyof Stats; base: number; per: number }[] = [
  { stat: 'dmg', base: 1, per: 0.5 },
  { stat: 'maxHp', base: 5, per: 2.5 },
  { stat: 'def', base: 1, per: 0.25 },
  { stat: 'spd', base: 0.06, per: 0.004 },
  { stat: 'crit', base: 0.04, per: 0.003 },
  { stat: 'vamp', base: 0.03, per: 0.003 },
  { stat: 'eva', base: 0.03, per: 0.003 },
];

const RARITY_PREFIX = ['', 'Fine', 'Grand', 'Mythic'];

export function genItem(rng: Rng, run: Run, level: number, slot?: Slot, minRarity = 0): Item {
  const s = slot ?? rng.pick(SLOTS);
  let rarity: number = rng.weighted<number>([
    [0, 60],
    [1, 26 + level * 1.5],
    [2, 8 + level],
    [3, 1.5 + level * 0.5],
  ] as const);
  rarity = Math.max(rarity, minRarity);
  const r = RARITY[rarity];
  const m = r.mult;
  const stats: Partial<Stats> = {};
  const add = (k: keyof Stats, v: number) => {
    stats[k] = (stats[k] ?? 0) + v;
  };
  if (s === 'weapon') add('dmg', Math.round((2 + 1.3 * level) * m));
  if (s === 'armor') add('maxHp', Math.round((8 + 6 * level) * m));
  if (s === 'shield') {
    add('def', Math.round((1 + 0.6 * level) * m));
    if (rarity >= 2) add('eva', 0.03);
  }
  if (s === 'ring') {
    const k = rng.pick(['crit', 'vamp', 'spd', 'eva'] as const);
    add(k, round2((k === 'spd' ? 0.08 : 0.05) * m + level * 0.004));
  }
  for (let i = 0; i < r.affixes; i++) {
    const a = rng.pick(AFFIX);
    const v = a.base + a.per * level;
    add(a.stat, a.stat === 'dmg' || a.stat === 'maxHp' || a.stat === 'def' ? Math.max(1, Math.round(v)) : round2(v));
  }
  const prefix = RARITY_PREFIX[rarity];
  const name = `${prefix ? prefix + ' ' : ''}${rng.pick(SLOT_NAMES[s])}`;
  return { uid: run.uid++, slot: s, rarity, level, name, stats };
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** One number to compare items. Used by the UI arrows and the bot. */
export function itemPower(it: Item | null): number {
  if (!it) return 0;
  const s = it.stats;
  return (s.dmg ?? 0) * 3 + (s.maxHp ?? 0) * 0.45 + (s.def ?? 0) * 4 + (s.spd ?? 0) * 45 + (s.crit ?? 0) * 40 + (s.vamp ?? 0) * 70 + (s.eva ?? 0) * 70;
}

export function equip(run: Run, uid: number): boolean {
  const i = run.inv.findIndex((it) => it.uid === uid);
  if (i < 0) return false;
  const it = run.inv[i];
  const before = heroStats(run).maxHp;
  const old = run.gear[it.slot];
  run.gear[it.slot] = it;
  run.inv.splice(i, 1);
  if (old) run.inv.push(old);
  const after = heroStats(run).maxHp;
  if (after > before) run.hp += after - before;
  run.hp = Math.min(run.hp, after);
  return true;
}

/** Scrap an inventory item for metal. */
export function scrap(run: Run, uid: number): number {
  const i = run.inv.findIndex((it) => it.uid === uid);
  if (i < 0) return 0;
  const n = 1 + run.inv[i].rarity;
  run.inv.splice(i, 1);
  run.res.metal += n;
  return n;
}

/** Equips the best item for each slot. Returns the number of swaps. */
export function autoEquip(run: Run): number {
  let n = 0;
  for (const s of SLOTS) {
    let best = run.gear[s];
    for (const it of run.inv) if (it.slot === s && itemPower(it) > itemPower(best)) best = it;
    if (best && best !== run.gear[s]) {
      equip(run, best.uid);
      n++;
    }
  }
  return n;
}

// ---------- Hero stats ----------

export interface TileBonus {
  hp: number;
  spd: number;
  peaks: number;
}

export function mountainGroups(run: Run): number[][] {
  const seen = new Set<number>();
  const groups: number[][] = [];
  run.tiles.forEach((t, c) => {
    if (t?.id !== 'mountain' || seen.has(c)) return;
    const g: number[] = [];
    const stack = [c];
    seen.add(c);
    while (stack.length) {
      const k = stack.pop()!;
      g.push(k);
      for (const n of n4(k))
        if (!seen.has(n) && run.tiles[n]?.id === 'mountain') {
          seen.add(n);
          stack.push(n);
        }
    }
    groups.push(g);
  });
  return groups;
}

export const PEAK_SIZE = 9;

export function tileBonus(run: Run): TileBonus {
  let hp = 0;
  let spd = 0;
  let peaks = 0;
  for (const g of mountainGroups(run)) {
    let gh = 0;
    for (const c of g) gh += 6 + 2 * n4(c).filter((n) => run.tiles[n]?.id === 'mountain').length;
    if (g.length >= PEAK_SIZE) {
      gh = Math.round(gh * 1.5);
      peaks++;
    }
    hp += gh;
  }
  run.tiles.forEach((t, c) => {
    if (t?.id !== 'forest') return;
    const k = n4(c).filter((n) => run.tiles[n]?.id === 'forest').length;
    spd += k >= 2 ? 0.08 : 0.05;
  });
  return { hp, spd, peaks };
}

export function isBlooming(run: Run, cell: number): boolean {
  return n8(cell).some((n) => run.tiles[n] && run.tiles[n]!.id !== 'meadow');
}

export function isRuined(run: Run, cell: number): boolean {
  return n8(cell).some((n) => run.tiles[n]?.id === 'mansion');
}

export function heroStats(run: Run): Stats {
  const b = CLASSES[run.cls].base;
  const s: Stats = { ...b };
  s.maxHp += run.bonus.hp;
  s.dmg += run.bonus.dmg;
  let spdPct = 0;
  for (const slot of SLOTS) {
    const it = run.gear[slot];
    if (!it) continue;
    for (const [k, v] of Object.entries(it.stats) as [keyof Stats, number][]) {
      if (k === 'spd') spdPct += v;
      else s[k] += v;
    }
  }
  const tb = tileBonus(run);
  s.maxHp += tb.hp;
  spdPct += tb.spd;
  s.spd = b.spd * (1 + spdPct);
  s.eva = Math.min(0.6, s.eva);
  s.crit = Math.min(0.6, s.crit);
  s.vamp = Math.min(0.5, s.vamp);
  return s;
}

// ---------- Placement ----------

export function canPlace(run: Run, card: string, cell: number): boolean {
  if (cell < 0 || cell >= W * H) return false;
  const def = TILES[card];
  const road = isRoad(run, cell);
  const t = run.tiles[cell];
  switch (def.place) {
    case 'road':
      return road && cell !== run.path[0] && !t;
    case 'side':
      return !road && !t;
    case 'roadside':
      return !road && !t && n4(cell).some((n) => isRoad(run, n));
    case 'tile':
      return !!t;
  }
}

export function validCells(run: Run, card: string): number[] {
  const out: number[] = [];
  for (let c = 0; c < W * H; c++) if (canPlace(run, card, c)) out.push(c);
  return out;
}

export function place(run: Run, handIdx: number, cell: number): boolean {
  const card = run.hand[handIdx];
  if (!card || run.battle || run.over || !canPlace(run, card, cell)) return false;
  run.hand.splice(handIdx, 1);
  if (card === 'oblivion') {
    run.tiles[cell] = null;
    const ri = roadIndex(run).get(cell);
    if (ri !== undefined) run.enemies = run.enemies.filter((e) => e.at !== ri);
    clampHp(run);
    return true;
  }
  const before = heroStats(run).maxHp;
  run.tiles[cell] = { id: card, age: 0 };
  run.placed++;
  run.meter = Math.min(METER_MAX, run.meter + TILES[card].meter);
  // New max HP from mountains also fills current HP by the same amount.
  const after = heroStats(run).maxHp;
  if (after > before) run.hp += after - before;
  return true;
}

function clampHp(run: Run): void {
  run.hp = Math.min(run.hp, heroStats(run).maxHp);
}

// ---------- Simulation ----------

function scale(lvl: number): number {
  return 1 + 0.3 * (lvl - 1) + 0.02 * (lvl - 1) * (lvl - 1);
}

export function makeFoe(run: Run, rng: Rng, id: string, lvl: number): Foe {
  const d = ENEMIES[id];
  const k = d.boss ? 1 + 0.12 * (lvl - 1) : scale(lvl);
  const hp = Math.round(d.hp * k);
  return {
    uid: run.uid++,
    id,
    hp,
    max: hp,
    atk: Math.round(d.atk * k * 10) / 10,
    def: d.def + Math.floor((lvl - 1) / 3),
    spd: d.spd,
    eva: d.eva,
    vamp: d.vamp,
    cd: (1 / d.spd) * (0.4 + rng.next() * 0.6),
  };
}

function lanternFactor(run: Run, cell: number): number {
  let f = 1;
  run.tiles.forEach((t, c) => {
    if (t?.id === 'lantern' && cheb(c, cell) <= 2) f *= 0.5;
  });
  return Math.max(0.25, f);
}

export function nearBeacon(run: Run, cell: number): boolean {
  return run.tiles.some((t, c) => t?.id === 'beacon' && cheb(c, cell) <= 2);
}

const countAt = (run: Run, at: number): number => run.enemies.reduce((a, e) => a + (e.at === at ? 1 : 0), 0);

function spawnAt(run: Run, ev: Ev[], at: number, id: string): void {
  if (at <= 0 || countAt(run, at) >= MAX_ON_CELL) return;
  run.enemies.push({ uid: run.uid++, id, at, lvl: run.loop });
  ev.push({ t: 'spawn', at, id });
}

/** Road indices next to a cell (4-neighbors), or the nearest ones. */
function roadNear(run: Run, cell: number): number[] {
  const ri = roadIndex(run);
  const own = ri.get(cell);
  if (own !== undefined) return [own];
  let best = 99;
  let out: number[] = [];
  run.path.forEach((c, i) => {
    if (i === 0) return;
    const d = cheb(c, cell);
    if (d < best) {
      best = d;
      out = [i];
    } else if (d === best) out.push(i);
  });
  return out;
}

function gain(run: Run, ev: Ev[], res: ResKey, n: number, cell: number): void {
  run.res[res] += n;
  ev.push({ t: 'res', res, n, cell });
}

function drawCard(run: Run, rng: Rng, ev: Ev[]): void {
  const pool = run.unlocked;
  const weights = pool.map((id) => [id, id === 'oblivion' ? 0.5 : 1] as const);
  const id = rng.weighted(weights);
  run.hand.push(id);
  ev.push({ t: 'card', id });
  while (run.hand.length > HAND_MAX) {
    run.hand.shift();
    const r = rng.pick(RES_KEYS);
    run.res[r] += 1;
    ev.push({ t: 'scrap', n: 1 });
  }
}

function newDay(run: Run, rng: Rng, ev: Ev[]): void {
  run.day++;
  ev.push({ t: 'day', day: run.day });
  drawCard(run, rng, ev);
  const max = heroStats(run).maxHp;
  const ri = roadIndex(run);
  // Plain road: slimes.
  run.path.forEach((c, i) => {
    if (i === 0 || run.tiles[c]) return;
    if (rng.chance(0.035 * lanternFactor(run, c))) spawnAt(run, ev, i, 'slime');
  });
  const groups = mountainGroups(run);
  run.tiles.forEach((t, c) => {
    if (!t) return;
    t.age++;
    const def = TILES[t.id];
    if (def.yieldRes && t.age % def.yieldRes.every === 0) gain(run, ev, def.yieldRes.res, 1, c);
    if (t.id === 'meadow') {
      const n = isBlooming(run, c) ? 5 : 2;
      const h = Math.min(n, max - run.hp);
      if (h > 0 && !run.battle) {
        run.hp += h;
        ev.push({ t: 'heal', n: h, cell: c });
      }
    }
    if (t.id === 'village' && isRuined(run, c) && t.age % 2 === 0) {
      const near = roadNear(run, c);
      spawnAt(run, ev, rng.pick(near), 'ghoul');
    }
    if (def.spawn && t.age % def.spawn.every === 0) {
      const near = roadNear(run, c);
      const at = ri.get(c) ?? rng.pick(near);
      const mine = run.enemies.filter((e) => e.id === def.spawn!.enemy && near.includes(e.at)).length;
      if (mine < def.spawn.max && rng.chance(lanternFactor(run, run.path[at]))) spawnAt(run, ev, at, def.spawn.enemy);
    }
  });
  for (const g of groups) {
    if (g.length < PEAK_SIZE || run.day % 4 !== 0) continue;
    const near = roadNear(run, g[Math.floor(g.length / 2)]);
    spawnAt(run, ev, rng.pick(near), 'harpy');
  }
}

function startBattle(run: Run, rng: Rng, ev: Ev[], at: number): void {
  const L = run.path.length;
  const near = [at, (at + 1) % L, (at - 1 + L) % L];
  const join = run.enemies.filter((e) => near.includes(e.at)).slice(0, BATTLE_MAX);
  if (!join.length) return;
  const ids = new Set(join.map((e) => e.uid));
  run.enemies = run.enemies.filter((e) => !ids.has(e.uid));
  run.battle = {
    foes: join.map((e) => makeFoe(run, rng, e.id, e.lvl)),
    heroCd: 0.35,
    boss: false,
    t: 0,
    summonT: 0,
    items: 0,
    cards: 0,
    metal: 0,
  };
  ev.push({ t: 'battle', boss: false });
}

function startBoss(run: Run, rng: Rng, ev: Ev[]): void {
  const foes = [makeFoe(run, rng, 'lich', run.loop)];
  for (let i = 0; i < 2; i++) foes.push(makeFoe(run, rng, 'skeleton', run.loop));
  run.battle = { foes, heroCd: 0.35, boss: true, t: 0, summonT: 7, items: 0, cards: 0, metal: 0 };
  ev.push({ t: 'battle', boss: true });
}

function arriveCamp(run: Run, rng: Rng, ev: Ev[]): void {
  run.loop++;
  const s = heroStats(run);
  const heal = Math.round(s.maxHp * (0.25 + run.bonus.campHeal + CLASSES[run.cls].campHeal));
  const h = Math.min(heal, s.maxHp - run.hp);
  if (h > 0) {
    run.hp += h;
    ev.push({ t: 'heal', n: h, cell: run.path[0] });
  }
  run.potions = Math.min(run.maxPotions, run.potions + 1);
  run.meter = Math.min(METER_MAX, run.meter + 4);
  if (run.meter >= METER_MAX) {
    startBoss(run, rng, ev);
    return;
  }
  run.camp = true;
  ev.push({ t: 'camp' });
}

function enterCell(run: Run, rng: Rng, ev: Ev[], idx: number): void {
  if (idx === 0) {
    arriveCamp(run, rng, ev);
    return;
  }
  const cell = run.path[idx];
  // Villages heal when the hero walks past.
  for (const n of n4(cell)) {
    const t = run.tiles[n];
    if (t?.id === 'village' && !isRuined(run, n)) {
      const max = heroStats(run).maxHp;
      const h = Math.min(8 + 2 * run.loop, max - run.hp);
      if (h > 0) {
        run.hp += h;
        ev.push({ t: 'heal', n: h, cell: n });
      }
    }
  }
  startBattle(run, rng, ev, idx);
}

function battleTick(run: Run, rng: Rng, ev: Ev[], dt: number): void {
  const b = run.battle!;
  const s = heroStats(run);
  const beacon = nearBeacon(run, run.path[Math.floor(run.pos)]);
  b.t += dt;
  b.heroCd -= dt;
  if (b.heroCd <= 0) {
    b.heroCd += 1 / (s.spd * (beacon ? 1.1 : 1));
    const f = b.foes[0];
    if (f) {
      if (rng.chance(f.eva)) ev.push({ t: 'miss', who: 'foe', uid: f.uid });
      else {
        const crit = rng.chance(s.crit);
        let d = s.dmg * (0.85 + rng.next() * 0.3) * (crit ? 2 : 1);
        d = Math.max(1, Math.round(d - f.def));
        f.hp -= d;
        ev.push({ t: 'hit', who: 'foe', uid: f.uid, dmg: d, crit });
        if (s.vamp > 0) run.hp = Math.min(s.maxHp, run.hp + Math.max(1, Math.round(d * s.vamp)));
        if (f.hp <= 0) killFoe(run, rng, ev, f);
      }
    }
  }
  for (const f of [...b.foes]) {
    if (f.hp <= 0) continue;
    f.cd -= dt;
    if (f.cd > 0) continue;
    f.cd += 1 / f.spd;
    if (rng.chance(s.eva)) {
      ev.push({ t: 'miss', who: 'hero', uid: f.uid });
      continue;
    }
    const d = Math.max(1, Math.round(f.atk * (0.85 + rng.next() * 0.3) - s.def));
    run.hp -= d;
    ev.push({ t: 'hit', who: 'hero', uid: f.uid, dmg: d, crit: false });
    if (f.vamp) f.hp = Math.min(f.max, f.hp + Math.round(d * f.vamp));
    if (run.hp <= 0) {
      run.hp = 0;
      endRun(run, 'death');
      ev.push({ t: 'end', kind: 'death' });
      return;
    }
  }
  if (b.boss && b.foes.some((f) => f.id === 'lich')) {
    b.summonT -= dt;
    if (b.summonT <= 0) {
      b.summonT = 7;
      if (b.foes.length < BATTLE_MAX) {
        b.foes.push(makeFoe(run, rng, 'skeleton', run.loop));
        ev.push({ t: 'summon' });
      }
    }
  }
  if (!b.foes.length) {
    run.battle = null;
    if (b.boss) {
      endRun(run, 'win');
      ev.push({ t: 'end', kind: 'win' });
      return;
    }
    for (let i = 0; i < b.items; i++) {
      run.inv.push(genItem(rng, run, run.loop));
      while (run.inv.length > INV_MAX) {
        const worst = run.inv.reduce((a, x) => (itemPower(x) < itemPower(a) ? x : a));
        scrap(run, worst.uid);
      }
    }
    for (let i = 0; i < b.cards; i++) drawCard(run, rng, ev);
    run.res.metal += b.metal;
    ev.push({ t: 'won', items: b.items, cards: b.cards, metal: b.metal });
  }
}

function killFoe(run: Run, rng: Rng, ev: Ev[], f: Foe): void {
  const b = run.battle!;
  b.foes = b.foes.filter((x) => x !== f);
  run.kills++;
  ev.push({ t: 'kill', uid: f.uid, id: f.id });
  if (f.id === 'lich') {
    b.foes = [];
    return;
  }
  const big = f.id === 'vampire' || f.id === 'ghoul' || f.id === 'harpy';
  if (rng.chance(big ? 0.6 : f.id === 'spider' ? 0.2 : 0.35)) b.items++;
  if (rng.chance(f.id === 'spider' ? 0.2 : 0.4)) b.cards++;
  if (rng.chance(0.3)) b.metal++;
}

const STEP = 0.05;

/** Advances the run by `dt` seconds in small fixed steps. Returns the events. */
export function tick(run: Run, dt: number): Ev[] {
  const ev: Ev[] = [];
  const rng = new Rng(run.rs);
  let left = dt;
  while (left > 1e-9 && !run.over && !run.camp) {
    const d = Math.min(STEP, left);
    left -= d;
    step(run, rng, ev, d);
  }
  run.rs = rng.raw;
  return ev;
}

function step(run: Run, rng: Rng, ev: Ev[], dt: number): void {
  run.time += dt;
  if (run.battle) {
    battleTick(run, rng, ev, dt);
    return;
  }
  const L = run.path.length;
  const cur = Math.floor(run.pos);
  const fast = nearBeacon(run, run.path[cur]) ? 1.6 : 1;
  run.pos += WALK * fast * dt;
  run.dayT += dt;
  if (run.dayT >= DAY) {
    run.dayT -= DAY;
    newDay(run, rng, ev);
  }
  if (Math.floor(run.pos) !== cur) {
    if (run.pos >= L) run.pos -= L;
    const idx = Math.floor(run.pos);
    enterCell(run, rng, ev, idx);
    if (run.battle || run.camp) run.pos = idx;
  }
  if (!run.bossWarned && run.meter >= METER_MAX) {
    run.bossWarned = true;
    ev.push({ t: 'boss-ready' });
  }
}

export function drinkPotion(run: Run): number {
  if (run.potions <= 0 || run.over) return 0;
  const max = heroStats(run).maxHp;
  const h = Math.min(Math.round(max * 0.4), max - run.hp);
  if (h <= 0) return 0;
  run.potions--;
  run.hp += h;
  return h;
}

export function campContinue(run: Run): void {
  run.camp = false;
}

export const KEEP: Record<EndKind, number> = { win: 1, camp: 1, retreat: 0.6, death: 0.3 };

export function score(run: Run, kind: EndKind): number {
  return run.kills * 5 + (run.loop - 1) * 40 + run.placed * 3 + (kind === 'win' ? 1000 : 0) + (kind === 'camp' ? 50 : 0);
}

export function endRun(run: Run, kind: EndKind): void {
  const keep = KEEP[kind];
  const kept = zeroRes();
  for (const k of RES_KEYS) kept[k] = Math.floor(run.res[k] * keep) + (kind === 'win' ? 10 : 0);
  run.over = { kind, score: score(run, kind), kept, loop: run.loop, kills: run.kills, day: run.day };
  run.battle = null;
  run.camp = false;
}

// ---------- Save data ----------

const RUN_KEY = 'loopwarden.run';
const META_KEY = 'loopwarden.meta';

export function newMeta(): Meta {
  return { res: zeroRes(), built: [], stats: { runs: 0, wins: 0, bestLoop: 0, bestScore: 0, kills: 0 } };
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = JSON.parse(raw) as Meta;
      return { ...newMeta(), ...m, res: { ...zeroRes(), ...m.res }, stats: { ...newMeta().stats, ...m.stats } };
    }
  } catch {
    /* ignore */
  }
  return newMeta();
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Run;
    if (r.v !== 1 || r.over) return null;
    return r;
  } catch {
    return null;
  }
}

export function saveRun(r: Run | null): void {
  try {
    if (!r || r.over) localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

/** Adds the run result to the meta progress. */
export function bankRun(meta: Meta, run: Run): void {
  const o = run.over!;
  for (const k of RES_KEYS) meta.res[k] += o.kept[k];
  meta.stats.runs++;
  if (o.kind === 'win') meta.stats.wins++;
  meta.stats.bestLoop = Math.max(meta.stats.bestLoop, o.loop);
  meta.stats.bestScore = Math.max(meta.stats.bestScore, o.score);
  meta.stats.kills += o.kills;
}

export function canBuild(meta: Meta, cost: Partial<Res>): boolean {
  return RES_KEYS.every((k) => meta.res[k] >= (cost[k] ?? 0));
}
