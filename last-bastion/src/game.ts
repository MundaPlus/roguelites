/** Run state and the fixed-step battle simulation. No DOM here, so the headless sim uses the same code. */
import { BOSSES, ENEMIES, LAST_WAVE, TOWERS, UP_COST, WAVE_TYPES, type Mods, type Target, type TowerId } from './data';
import { CELLS, TILE, buildInfo, buildable, cellAt, cellIdx, growMap, newMap, posAt, type MapInfo, type MapState } from './map';
import { Rng, hash } from './rng';

export const DT = 1 / 30;

export interface Tower {
  id: number;
  type: TowerId;
  x: number;
  y: number;
  lvl: number;
  /** -1 until the first upgrade picks a branch. */
  branch: number;
  target: Target;
  spent: number;
  kills: number;
  dmg: number;
  cd: number;
}

export interface TypeMods {
  dmg: number;
  rate: number;
  range: number;
  cost: number;
}

export interface RunMods {
  dmg: number;
  rate: number;
  range: number;
  killGold: number;
  interest: number;
  upCost: number;
  refund: number;
  crystals: number;
  type: Record<TowerId, TypeMods>;
}

export interface Offer {
  id: string;
  arg?: TowerId;
}

export interface RunState {
  v: 1;
  seed: number;
  seedText: string;
  /** Waves cleared. The next wave is wave + 1. */
  wave: number;
  gold: number;
  core: number;
  coreMax: number;
  map: MapState;
  towers: Tower[];
  nextId: number;
  mods: RunMods;
  have: TowerId[];
  /** Tower types that cards may unlock (from meta progress). */
  pool: TowerId[];
  relic: string | null;
  offers: Offer[] | null;
  endless: boolean;
  won: boolean;
  stats: { kills: number; leaks: number; bosses: number; built: number; gold: number };
  cards: string[];
  /** Crystals already paid out for this run. */
  paid: number;
}

export interface Enemy {
  uid: number;
  type: string;
  hp: number;
  max: number;
  armor: number;
  speed: number;
  route: number;
  d: number;
  seg: number;
  x: number;
  y: number;
  slowT: number;
  slowF: number;
  burnT: number;
  burnDps: number;
  stunT: number;
  brittleT: number;
  brittle: number;
  abilT: number;
  hitT: number;
  stunImm: number;
  dead: boolean;
}

export interface Shell {
  x0: number;
  y0: number;
  x: number;
  y: number;
  t: number;
  T: number;
  dmg: number;
  splash: number;
  stun: number;
  pierce: boolean;
  tower: number;
}

export type Ev =
  | { k: 'shot'; t: TowerId; x0: number; y0: number; x1: number; y1: number }
  | { k: 'chain'; pts: number[] }
  | { k: 'boom'; x: number; y: number; r: number }
  | { k: 'flame'; x: number; y: number; a: number; r: number; cone: number }
  | { k: 'frost'; x: number; y: number; r: number }
  | { k: 'kill'; x: number; y: number; gold: number; boss: boolean }
  | { k: 'leak'; n: number; x: number; y: number }
  | { k: 'heal'; x: number; y: number }
  | { k: 'block'; x: number; y: number }
  | { k: 'fire'; t: TowerId; id: number };

export interface Battle {
  wave: number;
  t: number;
  enemies: Enemy[];
  shells: Shell[];
  spawns: { at: number; type: string; route: number }[];
  si: number;
  uid: number;
  rng: Rng;
  events: Ev[];
  fx: boolean;
  info: MapInfo;
  killed: number;
  leaked: number;
  gold: number;
}

export interface Stats {
  dmg: number;
  rate: number;
  range: number;
  minRange: number;
  splash: number;
  chain: number;
  slow: number;
  slowDur: number;
  burn: number;
  pierce: boolean;
  multi: number;
  stun: number;
  brittle: number;
  aura: boolean;
  cone: number;
  shells: number;
  air: boolean;
}

// ---------- Run setup ----------

const typeMods = (): Record<TowerId, TypeMods> => {
  const m = {} as Record<TowerId, TypeMods>;
  for (const id of Object.keys(TOWERS) as TowerId[]) m[id] = { dmg: 1, rate: 1, range: 0, cost: 1 };
  return m;
};

export function newRun(seedText: string, pool: TowerId[], relic: string | null): RunState {
  const seed = hash('lb', seedText);
  const run: RunState = {
    v: 1,
    seed,
    seedText,
    wave: 0,
    gold: 130,
    core: 20,
    coreMax: 20,
    map: newMap(seed),
    towers: [],
    nextId: 1,
    mods: { dmg: 1, rate: 1, range: 0, killGold: 0, interest: 0, upCost: 1, refund: 0.7, crystals: 0, type: typeMods() },
    have: ['ballista'],
    pool: [...pool],
    relic,
    offers: null,
    endless: false,
    won: false,
    stats: { kills: 0, leaks: 0, bosses: 0, built: 0, gold: 0 },
    cards: [],
    paid: 0,
  };
  if (relic === 'purse') run.gold += 60;
  if (relic === 'walls') {
    run.core += 5;
    run.coreMax += 5;
  }
  if (relic === 'whetstone') run.mods.dmg += 0.1;
  if (relic === 'scholar') {
    const extra = pool.filter((t) => t !== 'ballista');
    if (extra.length) run.have.push(new Rng(hash(seed, 'scholar')).pick(extra));
  }
  return run;
}

let infoCache: { key: string; info: MapInfo } | null = null;

/** Map info for the current map. Cached until a tile is added. */
export function mapInfo(run: RunState): MapInfo {
  const key = `${run.seed}:${run.map.tiles.length}`;
  if (!infoCache || infoCache.key !== key) infoCache = { key, info: buildInfo(run.seed, run.map) };
  return infoCache.info;
}

// ---------- Towers ----------

export function towerStats(run: RunState, t: Tower, info?: MapInfo): Stats {
  const d = TOWERS[t.type];
  const tm = run.mods.type[t.type];
  const s: Stats = {
    dmg: d.dmg * run.mods.dmg * tm.dmg,
    rate: d.rate * run.mods.rate * tm.rate,
    range: d.range + run.mods.range + tm.range,
    minRange: d.minRange,
    splash: d.splash,
    chain: d.chain,
    slow: d.slow,
    slowDur: d.slowDur,
    burn: d.burn,
    pierce: false,
    multi: 1,
    stun: 0,
    brittle: 0,
    aura: false,
    cone: d.cone,
    shells: 1,
    air: d.air,
  };
  if (t.branch >= 0) {
    const nodes = d.branches[t.branch].nodes;
    for (let i = 0; i < t.lvl - 1; i++) applyMods(s, nodes[i].mods);
  }
  if (info && cellAt(info, t.x, t.y) === 'hill') s.range += 1;
  s.burn *= run.mods.dmg * tm.dmg;
  return s;
}

function applyMods(s: Stats, m: Mods): void {
  if (m.dmg) s.dmg *= m.dmg;
  if (m.rate) s.rate *= m.rate;
  if (m.range) s.range += m.range;
  if (m.splash) s.splash += m.splash;
  if (m.chain) s.chain += m.chain;
  if (m.slow) s.slow += m.slow;
  if (m.slowDur) s.slowDur += m.slowDur;
  if (m.burn) s.burn += m.burn;
  if (m.pierce) s.pierce = true;
  if (m.multi) s.multi += m.multi;
  if (m.stun) s.stun = Math.max(s.stun, m.stun);
  if (m.brittle) s.brittle = m.brittle;
  if (m.aura) s.aura = true;
  if (m.cone) s.cone += m.cone;
  if (m.shells) s.shells += m.shells;
}

/** Each tower of a type makes the next one of that type cost 10% more. */
export const COST_STEP = 0.1;
export const buildCost = (run: RunState, type: TowerId): number =>
  Math.round(TOWERS[type].cost * run.mods.type[type].cost * (1 + COST_STEP * run.towers.filter((t) => t.type === type).length));

/** Cost of the next upgrade, or 0 at max level. */
export function upgradeCost(run: RunState, t: Tower): number {
  if (t.lvl >= 4) return 0;
  return Math.round(TOWERS[t.type].cost * UP_COST[t.lvl - 1] * run.mods.upCost * run.mods.type[t.type].cost);
}

export const sellValue = (run: RunState, t: Tower): number => Math.floor(t.spent * run.mods.refund);

export const towerAt = (run: RunState, cx: number, cy: number): Tower | undefined => run.towers.find((t) => t.x === cx && t.y === cy);

export function canBuildAt(run: RunState, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= CELLS || cy >= CELLS) return false;
  return buildable(mapInfo(run).cells[cellIdx(cx, cy)]) && !towerAt(run, cx, cy);
}

export function build(run: RunState, type: TowerId, cx: number, cy: number): Tower | null {
  const cost = buildCost(run, type);
  if (!run.have.includes(type) || run.gold < cost || !canBuildAt(run, cx, cy)) return null;
  run.gold -= cost;
  const t: Tower = { id: run.nextId++, type, x: cx, y: cy, lvl: 1, branch: -1, target: type === 'flame' ? 'close' : 'first', spent: cost, kills: 0, dmg: 0, cd: 0 };
  run.towers.push(t);
  run.stats.built++;
  return t;
}

export function upgrade(run: RunState, t: Tower, branch: number): boolean {
  const cost = upgradeCost(run, t);
  if (!cost || run.gold < cost) return false;
  if (t.branch < 0) t.branch = branch;
  run.gold -= cost;
  t.spent += cost;
  t.lvl++;
  return true;
}

export function sell(run: RunState, t: Tower): number {
  const v = sellValue(run, t);
  run.gold += v;
  run.towers = run.towers.filter((x) => x !== t);
  return v;
}

// ---------- Waves ----------

export const hpMul = (n: number): number => 1 + 0.08 * (n - 1) + 0.006 * (n - 1) * (n - 1) + HPQ * Math.max(0, n - 15) ** 3;
export let HPQ = 0.0038;
export const setHPQ = (v: number): void => {
  HPQ = v;
};
export const isBossWave = (n: number): boolean => n % 10 === 0;
export const bossOf = (n: number): string => BOSSES[(n / 10 - 1) % BOSSES.length];

export interface WaveSpec {
  n: number;
  boss: string | null;
  list: { type: string; count: number }[];
  /** Spawn times and types, without routes. */
  spawns: { at: number; type: string }[];
}

export function waveSpec(seed: number, n: number): WaveSpec {
  const rng = new Rng(hash(seed, 'wave', n));
  const boss = isBossWave(n) ? bossOf(n) : null;
  let budget = 5 + n * 1.6 + Math.max(0, n - 30) * 0.8;
  if (boss) budget *= 0.5;
  const pool = WAVE_TYPES.filter((t) => ENEMIES[t].from <= n);
  const groups = Math.min(4, 1 + Math.floor(n / 7));
  const spawns: { at: number; type: string }[] = [];
  const counts = new Map<string, number>();
  let at = 0;
  const gapMul = Math.max(0.45, 1 - n * 0.012);
  if (boss) {
    spawns.push({ at: 0, type: boss });
    counts.set(boss, 1);
    at = 2;
  }
  for (let g = 0; g < groups; g++) {
    // Newer types get more weight so each new enemy shows up soon after it unlocks.
    const type = rng.weighted(pool.map((t) => [t, 1 + (n - ENEMIES[t].from < 6 ? 1.5 : 0)] as const));
    const def = ENEMIES[type];
    const count = Math.max(1, Math.round(budget / groups / def.cost));
    const gap = (type === 'runner' ? 0.45 : def.cost >= 2 ? 1.1 : 0.75) * gapMul;
    for (let i = 0; i < count; i++) spawns.push({ at: at + i * gap, type });
    counts.set(type, (counts.get(type) ?? 0) + count);
    at += count * gap + 1.5;
  }
  const list = [...counts.entries()].map(([type, count]) => ({ type, count }));
  return { n, boss, list, spawns };
}

export function startWave(run: RunState, fx = true): Battle {
  const n = run.wave + 1;
  const info = mapInfo(run);
  const spec = waveSpec(run.seed, n);
  const leaves = info.leaves.length;
  const spawns = spec.spawns.map((s, i) => {
    const leaf = i % leaves;
    return { at: s.at, type: s.type, route: leaf * 2 + (ENEMIES[s.type].fly ? 1 : 0) };
  });
  spawns.sort((a, b) => a.at - b.at);
  for (const t of run.towers) t.cd = 0;
  return { wave: n, t: 0, enemies: [], shells: [], spawns, si: 0, uid: 1, rng: new Rng(hash(run.seed, 'battle', n)), events: [], fx, info, killed: 0, leaked: 0, gold: 0 };
}

function spawnEnemy(b: Battle, type: string, route: number, d = 0): Enemy {
  const def = ENEMIES[type];
  const n = b.wave;
  const r = b.info.routes[route];
  const p = posAt(r, d);
  const hp = Math.round(def.hp * (def.boss ? 0.55 + 0.45 * hpMul(n) : hpMul(n)));
  const e: Enemy = {
    uid: b.uid++,
    type,
    hp,
    max: hp,
    armor: def.armor + (def.armor && n > 25 ? Math.floor((n - 25) / 8) : 0),
    speed: def.speed * (1 + Math.min(0.25, n * 0.005)),
    route,
    d,
    seg: p.seg,
    x: p.x,
    y: p.y,
    slowT: 0,
    slowF: 0,
    burnT: 0,
    burnDps: 0,
    stunT: 0,
    brittleT: 0,
    brittle: 0,
    abilT: def.heal ? 2.5 : def.summon ? 3 : 0,
    hitT: 0,
    stunImm: 0,
    dead: false,
  };
  b.enemies.push(e);
  return e;
}

/** Stun an enemy. Bosses ignore stuns, and each stun gives a short immunity so nothing stays frozen forever. */
function stun(e: Enemy, dur: number): void {
  if (dur <= 0 || e.stunImm > 0 || ENEMIES[e.type].boss) return;
  e.stunT = dur;
  e.stunImm = dur + 0.8;
}

/** After this many seconds a wave enrages: enemies move twice as fast. */
export const ENRAGE = 100;

const remaining = (b: Battle, e: Enemy): number => b.info.routes[e.route].total - e.d;

function hurt(run: RunState, b: Battle, e: Enemy, raw: number, pierce: boolean, t: Tower | null): void {
  if (e.dead) return;
  let dmg = pierce ? raw : Math.max(raw * 0.25, raw - e.armor);
  if (e.brittleT > 0) dmg *= 1 + e.brittle;
  e.hp -= dmg;
  e.hitT = 0.12;
  if (t) t.dmg += dmg;
  if (e.hp <= 0) {
    e.dead = true;
    const def = ENEMIES[e.type];
    const gold = def.gold + run.mods.killGold;
    run.gold += gold;
    run.stats.gold += gold;
    run.stats.kills++;
    b.killed++;
    b.gold += gold;
    if (def.boss) run.stats.bosses++;
    if (t) t.kills++;
    if (b.fx) b.events.push({ k: 'kill', x: e.x, y: e.y, gold, boss: !!def.boss });
    if (def.split) for (let i = 0; i < 2; i++) spawnEnemy(b, def.split, e.route, Math.max(0, e.d - 0.3 * i));
  }
}

function lineBlocked(info: MapInfo, x0: number, y0: number, x1: number, y1: number): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(len / 0.3);
  for (let i = 1; i < steps; i++) {
    const k = i / steps;
    if (cellAt(info, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k) === 'forest') return true;
  }
  return false;
}

function inRange(b: Battle, tx: number, ty: number, s: Stats): Enemy[] {
  const out: Enemy[] = [];
  const r2 = s.range * s.range;
  const m2 = s.minRange * s.minRange;
  for (const e of b.enemies) {
    if (e.dead) continue;
    if (!s.air && ENEMIES[e.type].fly) continue;
    const d2 = (e.x - tx) ** 2 + (e.y - ty) ** 2;
    if (d2 <= r2 && d2 >= m2) out.push(e);
  }
  return out;
}

function rank(b: Battle, list: Enemy[], mode: Target, tx: number, ty: number): Enemy[] {
  const key = (e: Enemy): number => {
    switch (mode) {
      case 'first':
        return remaining(b, e);
      case 'last':
        return -remaining(b, e);
      case 'strong':
        return -e.hp;
      case 'close':
        return (e.x - tx) ** 2 + (e.y - ty) ** 2;
    }
  };
  return list.sort((a, c) => key(a) - key(c));
}

function fire(run: RunState, b: Battle, t: Tower, s: Stats): boolean {
  const tx = t.x + 0.5;
  const ty = t.y + 0.5;
  const cands = inRange(b, tx, ty, s);
  if (!cands.length) return false;
  const fx = b.fx;
  const info = b.info;
  if (fx) b.events.push({ k: 'fire', t: t.type, id: t.id });
  switch (t.type) {
    case 'ballista': {
      const targets = rank(b, cands, t.target, tx, ty).slice(0, s.multi);
      for (const e of targets) {
        if (fx) b.events.push({ k: 'shot', t: 'ballista', x0: tx, y0: ty, x1: e.x, y1: e.y });
        if (lineBlocked(info, tx, ty, e.x, e.y) && b.rng.chance(0.3)) {
          if (fx) b.events.push({ k: 'block', x: e.x, y: e.y });
          continue;
        }
        hurt(run, b, e, s.dmg, s.pierce, t);
      }
      return true;
    }
    case 'mortar': {
      const e = rank(b, cands, t.target, tx, ty)[0];
      const def = ENEMIES[e.type];
      const T = 0.8;
      const lead = posAt(info.routes[e.route], e.d + def.speed * T * (e.slowT > 0 ? 1 - e.slowF : 1), e.seg);
      for (let i = 0; i < s.shells; i++) {
        const ox = i === 0 ? 0 : (b.rng.next() - 0.5) * 1.4;
        const oy = i === 0 ? 0 : (b.rng.next() - 0.5) * 1.4;
        b.shells.push({ x0: tx, y0: ty, x: lead.x + ox, y: lead.y + oy, t: 0, T: T + i * 0.12, dmg: s.dmg, splash: s.splash, stun: s.stun, pierce: s.pierce, tower: t.id });
      }
      return true;
    }
    case 'frost': {
      const hitList = s.aura ? cands : rank(b, cands, t.target, tx, ty).slice(0, 1);
      if (fx) {
        if (s.aura) b.events.push({ k: 'frost', x: tx, y: ty, r: s.range });
        else b.events.push({ k: 'shot', t: 'frost', x0: tx, y0: ty, x1: hitList[0].x, y1: hitList[0].y });
      }
      for (const e of hitList) {
        if (!s.aura && lineBlocked(info, tx, ty, e.x, e.y) && b.rng.chance(0.3)) {
          if (fx) b.events.push({ k: 'block', x: e.x, y: e.y });
          continue;
        }
        const boss = ENEMIES[e.type].boss;
        const slow = Math.min(0.7, s.slow) * (boss ? 0.6 : 1);
        if (e.slowT <= 0 || slow >= e.slowF) e.slowF = slow;
        e.slowT = Math.max(e.slowT, s.slowDur);
        if (s.stun) stun(e, s.stun);
        if (s.brittle) {
          e.brittle = s.brittle;
          e.brittleT = Math.max(e.brittleT, s.slowDur);
        }
        hurt(run, b, e, s.dmg, false, t);
      }
      return true;
    }
    case 'tesla': {
      const first = rank(b, cands, t.target, tx, ty)[0];
      if (lineBlocked(info, tx, ty, first.x, first.y) && b.rng.chance(0.3)) {
        if (fx) b.events.push({ k: 'block', x: first.x, y: first.y });
        return true;
      }
      const hit = new Set<number>();
      const pts = [tx, ty];
      let cur: Enemy | undefined = first;
      let dmg = s.dmg;
      for (let i = 0; i < s.chain && cur; i++) {
        hit.add(cur.uid);
        pts.push(cur.x, cur.y);
        hurt(run, b, cur, dmg, false, t);
        if (s.stun) stun(cur, s.stun);
        dmg *= 0.92;
        let best: Enemy | undefined;
        let bd = 2.2 * 2.2;
        for (const e of b.enemies) {
          if (e.dead || hit.has(e.uid)) continue;
          const d2 = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
          if (d2 < bd) {
            bd = d2;
            best = e;
          }
        }
        cur = best;
      }
      if (fx) b.events.push({ k: 'chain', pts });
      return true;
    }
    case 'flame': {
      const e = rank(b, cands, t.target, tx, ty)[0];
      const a = Math.atan2(e.y - ty, e.x - tx);
      const half = (s.cone / 2) * (Math.PI / 180);
      if (fx) b.events.push({ k: 'flame', x: tx, y: ty, a, r: s.range, cone: s.cone });
      for (const o of cands) {
        let da = Math.atan2(o.y - ty, o.x - tx) - a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const near = (o.x - tx) ** 2 + (o.y - ty) ** 2 < 0.36;
        if (Math.abs(da) > half && !near) continue;
        hurt(run, b, o, s.dmg, s.pierce, t);
        o.burnT = 2;
        o.burnDps = Math.max(o.burnDps, s.burn);
      }
      return true;
    }
  }
}

/** Advance the battle by dt seconds. */
export function stepBattle(run: RunState, b: Battle, dt = DT): void {
  b.t += dt;
  const info = b.info;
  while (b.si < b.spawns.length && b.spawns[b.si].at <= b.t) {
    const s = b.spawns[b.si++];
    spawnEnemy(b, s.type, s.route);
  }
  // Enemies
  for (const e of b.enemies) {
    if (e.dead) continue;
    const def = ENEMIES[e.type];
    if (e.hitT > 0) e.hitT -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt;
      hurt(run, b, e, e.burnDps * dt, true, null);
      if (e.burnT <= 0) e.burnDps = 0;
      if (e.dead) continue;
    }
    if (e.brittleT > 0) e.brittleT -= dt;
    if (e.stunImm > 0) e.stunImm -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (def.heal || def.summon) {
      e.abilT -= dt;
      if (e.abilT <= 0) {
        if (def.heal) {
          e.abilT = 2.5;
          for (const o of b.enemies)
            if (!o.dead && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 1.6 * 1.6) o.hp = Math.min(o.max, o.hp + o.max * (ENEMIES[o.type].boss ? 0.02 : 0.12));
          if (b.fx) b.events.push({ k: 'heal', x: e.x, y: e.y });
        } else if (def.summon) {
          e.abilT = def.summon === 'runner' ? 2.5 : 3;
          if (!def.fly) spawnEnemy(b, def.summon, e.route, Math.max(0, e.d - 0.4));
        }
      }
    }
    if (e.stunT > 0) {
      e.stunT -= dt;
      continue;
    }
    let v = e.speed * (e.slowT > 0 ? 1 - e.slowF : 1);
    if (!def.fly && cellAt(info, e.x, e.y) === 'ford') v *= 0.7;
    if (b.t > ENRAGE) v *= 2;
    e.d += v * dt;
    const r = info.routes[e.route];
    if (e.d >= r.total) {
      e.dead = true;
      run.core -= def.leak;
      run.stats.leaks += def.leak;
      b.leaked += def.leak;
      if (b.fx) b.events.push({ k: 'leak', n: def.leak, x: e.x, y: e.y });
      continue;
    }
    const p = posAt(r, e.d, e.seg);
    e.x = p.x;
    e.y = p.y;
    e.seg = p.seg;
  }
  // Towers
  for (const t of run.towers) {
    t.cd -= dt;
    if (t.cd > 0) continue;
    const s = towerStats(run, t, info);
    if (fire(run, b, t, s)) t.cd += 1 / s.rate;
    else t.cd = 0;
  }
  // Mortar shells
  for (const sh of b.shells) {
    sh.t += dt;
    if (sh.t < sh.T) continue;
    const t = run.towers.find((x) => x.id === sh.tower) ?? null;
    if (b.fx) b.events.push({ k: 'boom', x: sh.x, y: sh.y, r: sh.splash });
    const r2 = sh.splash * sh.splash;
    for (const e of b.enemies) {
      if (e.dead || ENEMIES[e.type].fly) continue;
      if ((e.x - sh.x) ** 2 + (e.y - sh.y) ** 2 > r2) continue;
      hurt(run, b, e, sh.dmg, sh.pierce, t);
      if (sh.stun) stun(e, sh.stun);
    }
  }
  if (b.shells.length) b.shells = b.shells.filter((s) => s.t < s.T);
  if (b.enemies.some((e) => e.dead)) b.enemies = b.enemies.filter((e) => !e.dead);
}

export const battleOver = (run: RunState, b: Battle): boolean => run.core <= 0 || (b.si >= b.spawns.length && b.enemies.length === 0 && b.shells.length === 0);

export interface WaveResult {
  bonus: number;
  interest: number;
  won: boolean;
  lost: boolean;
  tile: number;
  refunds: number;
}

/** Wave clear bonus for wave n. */
export const clearBonus = (n: number): number => 12 + n * 2;

/** Apply the end of a wave. On a clear this pays the bonus and sets the card offers. */
export function finishWave(run: RunState, b: Battle): WaveResult {
  const res: WaveResult = { bonus: 0, interest: 0, won: false, lost: false, tile: -1, refunds: 0 };
  if (run.core <= 0) {
    run.core = 0;
    res.lost = true;
    return res;
  }
  run.wave = b.wave;
  res.bonus = clearBonus(b.wave);
  res.interest = Math.min(40, Math.floor(run.gold * run.mods.interest));
  run.gold += res.bonus + res.interest;
  run.stats.gold += res.bonus + res.interest;
  if (run.wave >= LAST_WAVE && !run.won) {
    run.won = true;
    res.won = true;
    return res;
  }
  run.offers = makeOffers(run);
  return res;
}

/** Add the next map tile. Towers on cells that turn into path are refunded in full. */
export function growAfterWave(run: RunState): { tile: number; refunds: number } {
  const tile = growMap(run.seed, run.map, run.wave + 1, (tx, ty) => run.towers.filter((t) => Math.floor(t.x / TILE) === tx && Math.floor(t.y / TILE) === ty).length);
  let refunds = 0;
  const info = mapInfo(run);
  run.towers = run.towers.filter((t) => {
    if (buildable(info.cells[cellIdx(t.x, t.y)])) return true;
    run.gold += t.spent;
    refunds += t.spent;
    return false;
  });
  return { tile, refunds };
}

// ---------- Cards ----------

function typedOk(run: RunState, id: string, arg: TowerId): boolean {
  if (id === 'unlock') return !run.have.includes(arg) && run.pool.includes(arg);
  return run.have.includes(arg);
}

export function makeOffers(run: RunState): Offer[] {
  const rng = new Rng(hash(run.seed, 'cards', run.wave));
  const rare = isBossWave(run.wave);
  const out: Offer[] = [];
  const used = new Set<string>();
  const add = (o: Offer): void => {
    const k = `${o.id}:${o.arg ?? ''}`;
    if (used.has(k)) return;
    used.add(k);
    out.push(o);
  };
  const missing = run.pool.filter((t) => !run.have.includes(t));
  // Until you own 3 tower types, one card is always a new tower. Later it shows up now and then.
  if (missing.length && (run.have.length < 3 || rng.chance(0.25))) add({ id: 'unlock', arg: rng.pick(missing) });
  const rarePool = ['overclock', 'arsenal', 'golden', 'fortress', 'veteran'];
  const common: (readonly [string, number])[] = [
    ['tdmg', 3],
    ['trate', 2],
    ['trange', 1.5],
    ['tcheap', 1.2],
    ['gold', 2],
    ['walls', run.core < run.coreMax ? 2 : 1],
    ['bounty', 1.2],
    ['interest', run.mods.interest < 0.15 ? 1 : 0],
    ['engineers', 1],
    ['eagle', 1],
    ['drill', 1.2],
    ['sharp', 1.2],
    ['salvage', run.mods.refund < 0.9 ? 0.5 : 0],
    ['crystal', 0.6],
  ];
  let guard = 0;
  while (out.length < 3 && guard++ < 60) {
    if (rare && out.length < 3 && guard < 20) {
      add({ id: rng.pick(rarePool) });
      continue;
    }
    const id = rng.weighted(common);
    if (id.startsWith('t')) add({ id, arg: rng.pick(run.have) });
    else add({ id });
  }
  return out.filter((o) => !o.arg || typedOk(run, o.id, o.arg));
}

export const offerGold = (run: RunState): number => 40 + run.wave * 6;

export function applyCard(run: RunState, o: Offer): void {
  const m = run.mods;
  const tm = o.arg ? m.type[o.arg] : null;
  switch (o.id) {
    case 'unlock':
      if (o.arg && !run.have.includes(o.arg)) run.have.push(o.arg);
      break;
    case 'tdmg':
      tm!.dmg += 0.2;
      break;
    case 'trate':
      tm!.rate += 0.15;
      break;
    case 'trange':
      tm!.range += 0.5;
      break;
    case 'tcheap':
      tm!.cost = Math.max(0.5, tm!.cost - 0.2);
      break;
    case 'gold':
      run.gold += offerGold(run);
      break;
    case 'walls':
      run.coreMax += 5;
      run.core = Math.min(run.coreMax, run.core + 5);
      break;
    case 'bounty':
      m.killGold += 1;
      break;
    case 'interest':
      m.interest += 0.05;
      break;
    case 'engineers':
      m.upCost = Math.max(0.5, m.upCost - 0.15);
      break;
    case 'eagle':
      m.range += 0.3;
      break;
    case 'drill':
      m.rate += 0.08;
      break;
    case 'sharp':
      m.dmg += 0.1;
      break;
    case 'salvage':
      m.refund = 0.95;
      break;
    case 'crystal':
      m.crystals += 4;
      break;
    case 'overclock':
      m.rate += 0.25;
      break;
    case 'arsenal':
      m.dmg += 0.3;
      break;
    case 'golden':
      m.killGold += 2;
      break;
    case 'fortress':
      run.coreMax += 10;
      run.core = run.coreMax;
      break;
    case 'veteran':
      for (const t of run.towers)
        if (t.lvl < 4) {
          if (t.branch < 0) t.branch = 0;
          t.lvl++;
        }
      break;
  }
}

// ---------- Score ----------

export function score(run: RunState): number {
  return run.wave * 100 + run.stats.kills + run.core * 20 + run.stats.bosses * 250 + (run.won ? 2000 : 0);
}

export function crystalsFor(run: RunState): number {
  return Math.floor(run.wave / 2) + run.stats.bosses * 3 + (run.won ? 15 : 0) + run.mods.crystals;
}
