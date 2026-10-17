/** Pure ATB battle simulation. `tick(b, dt)` moves time forward. No DOM. */
import { CLASSES, ELEMS, ENEMIES, GEAR, ITEMS, MOVES, SKILLS, STATUS, type ActionDef, type Cond, type Elem, type Row, type StatusId } from './data';
import { gearOf, heroImmune, heroResist, heroStats, type Hero } from './party';
import { Rng } from './rng';

export type Side = 'hero' | 'enemy';

export interface Unit {
  uid: number;
  side: Side;
  key: string;
  name: string;
  icon: string;
  lvl: number;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
  crit: number;
  row: Row;
  atb: number;
  st: Partial<Record<StatusId, number>>;
  guard: boolean;
  elem: Partial<Record<Elem, number>>;
  immune: StatusId[];
  wElem?: Elem;
  ranged: boolean;
  skills: string[];
  hero?: number;
  rank?: 'elite' | 'boss';
  turns: number;
  cyc: number;
  phase2: boolean;
  used: string[];
  poisonT: number;
  stolen: boolean;
}

export type BEvent =
  | { t: 'act'; uid: number; name: string; icon: string; kind: string; elem?: Elem; item?: boolean; counter?: boolean }
  | { t: 'dmg'; uid: number; amount: number; hp: number; crit?: boolean; elem?: Elem; mul?: number; poison?: boolean }
  | { t: 'heal'; uid: number; amount: number; hp: number; mp?: boolean }
  | { t: 'status'; uid: number; status: StatusId; on: boolean }
  | { t: 'miss'; uid: number; text: string }
  | { t: 'ko'; uid: number }
  | { t: 'revive'; uid: number; hp: number }
  | { t: 'atb'; uid: number }
  | { t: 'spawn'; uid: number }
  | { t: 'msg'; text: string };

export interface Battle {
  units: Unit[];
  time: number;
  rng: Rng;
  ready: number[];
  events: BEvent[];
  result: 'win' | 'lose' | null;
  items: Record<string, number>;
  floor: number;
  nextUid: number;
  loot: string[];
  stealGold: number;
  boss: boolean;
}

export type Command =
  | { kind: 'attack'; target: number }
  | { kind: 'skill'; id: string; target: number | null }
  | { kind: 'item'; id: string; target: number | null }
  | { kind: 'defend' };

/** Damage scale. Tuned with the sim. */
const K = 1.55;
const MITI = 50;
export const ATB_MAX = 100;
const STEP = 0.05;

/** Enemy stats grow inside a zone floor by floor. */
export function enemyScale(floor: number): number {
  const inZone = (floor - 1) % 5;
  return 1 + 0.09 * inZone;
}

export function heroUnit(h: Hero, uid: number, index: number): Unit {
  const s = heroStats(h);
  const c = CLASSES[h.cls];
  const weapon = h.gear.weapon ? GEAR[h.gear.weapon] : undefined;
  return {
    uid,
    side: 'hero',
    key: h.cls,
    name: h.name,
    icon: c.icon,
    lvl: h.lvl,
    hp: Math.min(h.hp, s.hp),
    maxHp: s.hp,
    mp: Math.min(h.mp, s.mp),
    maxMp: s.mp,
    atk: s.atk,
    def: s.def,
    mag: s.mag,
    res: s.res,
    spd: s.spd,
    crit: c.crit,
    row: h.row,
    atb: 0,
    st: {},
    guard: false,
    elem: heroResist(h),
    immune: heroImmune(h),
    wElem: weapon?.elem,
    ranged: weapon?.perk === 'ranged',
    skills: [...h.skills],
    hero: index,
    turns: 0,
    cyc: 0,
    phase2: false,
    used: [],
    poisonT: 0,
    stolen: false,
  };
}

export function enemyUnit(id: string, floor: number, uid: number): Unit {
  const d = ENEMIES[id];
  // Bosses are tuned for their own floor.
  const m = d.rank === 'boss' ? 1 : enemyScale(floor);
  const hp = Math.round(d.hp * m);
  return {
    uid,
    side: 'enemy',
    key: id,
    name: d.name,
    icon: d.icon,
    lvl: floor,
    hp,
    maxHp: hp,
    mp: 999,
    maxMp: 999,
    atk: Math.round(d.atk * m),
    def: Math.round(d.def * (1 + (m - 1) * 0.5)),
    mag: Math.round(d.mag * m),
    res: Math.round(d.res * (1 + (m - 1) * 0.5)),
    spd: d.spd,
    crit: 0.04,
    row: d.row,
    atb: 0,
    st: {},
    guard: false,
    elem: { ...(d.elem ?? {}) },
    immune: [...(d.immune ?? [])],
    ranged: false,
    skills: [],
    rank: d.rank,
    turns: 0,
    cyc: 0,
    phase2: false,
    used: [],
    poisonT: 0,
    stolen: false,
  };
}

export interface BattleOpts {
  hasteStart?: boolean;
}

export function newBattle(heroes: Hero[], enemies: string[], floor: number, seed: number, items: Record<string, number>, opts: BattleOpts = {}): Battle {
  const rng = new Rng(seed);
  const units: Unit[] = [];
  let uid = 1;
  heroes.forEach((h, i) => {
    const u = heroUnit(h, uid++, i);
    const quick = gearOf(h).some((g) => g.perk === 'quick');
    u.atb = rng.int(0, 45) + (quick ? 50 : 0);
    if (opts.hasteStart && u.hp > 0) u.st.haste = STATUS.haste.dur;
    if (u.hp <= 0) u.atb = 0;
    units.push(u);
  });
  for (const id of enemies) {
    const u = enemyUnit(id, floor, uid++);
    u.atb = rng.int(0, 35);
    units.push(u);
  }
  return {
    units,
    time: 0,
    rng,
    ready: [],
    events: [],
    result: null,
    items,
    floor,
    nextUid: uid,
    loot: [],
    stealGold: 0,
    boss: enemies.some((e) => ENEMIES[e].rank === 'boss'),
  };
}

export const alive = (u: Unit): boolean => u.hp > 0;
export const heroes = (b: Battle): Unit[] => b.units.filter((u) => u.side === 'hero');
export const enemies = (b: Battle): Unit[] => b.units.filter((u) => u.side === 'enemy');
export const unit = (b: Battle, uid: number): Unit | undefined => b.units.find((u) => u.uid === uid);
const foesOf = (b: Battle, u: Unit): Unit[] => b.units.filter((x) => x.side !== u.side && alive(x));
const friendsOf = (b: Battle, u: Unit): Unit[] => b.units.filter((x) => x.side === u.side);

/** Time bar fill per second. */
export function fillRate(u: Unit): number {
  let r = (u.spd + 12) * 1.25;
  if (u.st.haste) r *= 1.5;
  if (u.st.slow) r *= 0.5;
  return r;
}

// ---------- Time ----------

/**
 * Moves time forward by `dt` seconds. Enemies act at once when their bar is full.
 * Heroes with a full bar go to `ready` and wait for a command.
 * Returns true when an enemy acted (the caller may want to show it first).
 */
export function tick(b: Battle, dt: number): boolean {
  let left = dt;
  while (left > 1e-9 && !b.result) {
    const d = Math.min(STEP, left);
    left -= d;
    if (stepOnce(b, d)) return true;
  }
  return false;
}

function stepOnce(b: Battle, d: number): boolean {
  b.time += d;
  for (const u of b.units) {
    if (!alive(u)) continue;
    for (const s of Object.keys(u.st) as StatusId[]) {
      u.st[s]! -= d;
      if (u.st[s]! <= 0) {
        delete u.st[s];
        b.events.push({ t: 'status', uid: u.uid, status: s, on: false });
      }
    }
    if (u.st.poison) {
      u.poisonT += d;
      if (u.poisonT >= 2) {
        u.poisonT -= 2;
        const amt = Math.max(1, Math.round(u.maxHp * (u.rank ? 0.015 : 0.04)));
        hurt(b, u, Math.min(amt, u.rank ? 60 : amt), { poison: true });
        if (checkEnd(b)) return true;
        if (!alive(u)) continue;
      }
    } else u.poisonT = 0;
    if (u.st.sleep) continue;
    if (u.atb < ATB_MAX) u.atb = Math.min(ATB_MAX, u.atb + fillRate(u) * d);
  }
  // Ready list: alive, awake heroes with a full bar.
  b.ready = b.ready.filter((uid) => {
    const u = unit(b, uid)!;
    return alive(u) && !u.st.sleep && u.atb >= ATB_MAX;
  });
  for (const u of b.units) {
    if (u.side === 'hero' && alive(u) && !u.st.sleep && u.atb >= ATB_MAX && !b.ready.includes(u.uid)) {
      b.ready.push(u.uid);
      u.guard = false;
    }
  }
  const e = b.units.find((x) => x.side === 'enemy' && alive(x) && !x.st.sleep && x.atb >= ATB_MAX);
  if (e) {
    enemyTurn(b, e);
    return true;
  }
  return false;
}

/** Runs time until a hero is ready, the battle ends, or `maxT` seconds pass. */
export function advance(b: Battle, maxT = 30): void {
  const end = b.time + maxT;
  while (!b.result && b.ready.length === 0 && b.time < end) tick(b, STEP);
}

// ---------- Targets ----------

export function targetsFor(b: Battle, actor: Unit, a: ActionDef): Unit[] {
  switch (a.target) {
    case 'enemy':
    case 'enemies':
    case 'row':
    case 'random':
      return foesOf(b, actor);
    case 'ally':
    case 'allies':
      return friendsOf(b, actor).filter(alive);
    case 'self':
      return [actor];
    case 'ko':
      return friendsOf(b, actor).filter((u) => !alive(u));
  }
}

/** True when the player picks one unit (not a group). */
export const singleTarget = (a: ActionDef): boolean => a.target === 'enemy' || a.target === 'ally' || a.target === 'ko' || a.target === 'row';

function resolveTargets(b: Battle, actor: Unit, a: ActionDef, primary: Unit | null): Unit[] {
  const pool = targetsFor(b, actor, a);
  if (!pool.length) {
    // Phoenix-style actions still heal the living.
    if (a.kind === 'revive' && a.target === 'allies') return friendsOf(b, actor);
    return [];
  }
  const pickOne = (): Unit => (primary && pool.includes(primary) ? primary : pool[b.rng.int(0, pool.length - 1)]);
  switch (a.target) {
    case 'enemy':
    case 'ally':
    case 'ko':
    case 'self':
      return [pickOne()];
    case 'row': {
      const p = pickOne();
      return pool.filter((u) => u.row === p.row);
    }
    case 'random': {
      const out: Unit[] = [];
      for (let i = 0; i < (a.hits ?? 1); i++) out.push(pool[b.rng.int(0, pool.length - 1)]);
      return out;
    }
    case 'enemies':
      return pool;
    case 'allies':
      return a.kind === 'revive' ? friendsOf(b, actor) : pool;
  }
}

// ---------- Math ----------

export function elemFor(a: ActionDef, actor: Unit, t: Unit, rng?: Rng): Elem | undefined {
  if (a.elem === 'best') {
    let best: Elem = 'fire';
    let bm = -9;
    for (const e of ELEMS) {
      const m = mulOf(t, e);
      const score = m < 0 ? 3 : m;
      if (score > bm) {
        bm = score;
        best = e;
      }
    }
    return best;
  }
  if (a.elem === 'rand') return rng ? rng.pick(ELEMS) : 'fire';
  if (a.elem) return a.elem;
  if (a.kind === 'phys') return actor.wElem;
  return undefined;
}

export const mulOf = (t: Unit, e: Elem | undefined): number => (e ? (t.elem[e] ?? 1) : 1);

export const itemScale = (floor: number): number => 1 + 0.16 * (floor - 1);

/** Average damage before the element multiplier, guard and variance. */
export function baseDamage(b: Battle, actor: Unit, a: ActionDef, t: Unit): number {
  if (a.kind === 'flat') return (a.flat ?? 0) * itemScale(b.floor);
  const phys = a.kind === 'phys';
  const stat = phys ? actor.atk : actor.mag;
  const def = phys ? t.def : t.res;
  let d = (a.power ?? 1) * stat * K * (MITI / (MITI + def));
  if (phys) {
    const noRow = a.ignoreRow || actor.ranged;
    if (!noRow && actor.row === 'back') d *= 0.6;
    if (!noRow && t.row === 'back') d *= 0.6;
    if (t.st.protect) d *= 0.65;
  }
  return d;
}

/** Expected damage, for the bot and the UI. Negative means the target absorbs it. */
export function estimate(b: Battle, actor: Unit, a: ActionDef, t: Unit): number {
  let d = baseDamage(b, actor, a, t) * mulOf(t, elemFor(a, actor, t));
  if (t.guard) d *= 0.5;
  if (a.kind === 'phys') d *= a.crit ? 1.5 : 1 + actor.crit * 0.5;
  return d;
}

export function healAmount(actor: Unit, a: ActionDef, t: Unit): number {
  if (a.pct) return t.maxHp * a.pct;
  if (a.flat) return a.flat;
  return (actor.mag * 2.6 + 14) * (a.power ?? 1);
}

// ---------- Effects ----------

function hurt(b: Battle, t: Unit, amount: number, extra: { crit?: boolean; elem?: Elem; mul?: number; poison?: boolean } = {}): void {
  t.hp = Math.max(0, t.hp - amount);
  b.events.push({ t: 'dmg', uid: t.uid, amount, hp: t.hp, ...extra });
  if (t.hp <= 0) ko(b, t);
  else if (t.st.sleep && !extra.poison) {
    delete t.st.sleep;
    b.events.push({ t: 'status', uid: t.uid, status: 'sleep', on: false });
  }
}

function heal(b: Battle, t: Unit, amount: number): void {
  if (!alive(t)) return;
  const a = Math.max(0, Math.min(t.maxHp - t.hp, Math.round(amount)));
  t.hp += a;
  b.events.push({ t: 'heal', uid: t.uid, amount: a, hp: t.hp });
}

function ko(b: Battle, t: Unit): void {
  t.hp = 0;
  t.st = {};
  t.atb = 0;
  t.guard = false;
  b.ready = b.ready.filter((x) => x !== t.uid);
  b.events.push({ t: 'ko', uid: t.uid });
}

function addStatus(b: Battle, t: Unit, s: StatusId, chance: number): boolean {
  if (!alive(t)) return false;
  let c = chance;
  if (t.immune.includes(s)) c = 0;
  if (t.rank === 'boss' && (s === 'slow' || s === 'sleep')) c *= s === 'sleep' ? 0 : 0.5;
  if (t.rank === 'elite' && s === 'sleep') c *= 0.5;
  if (b.rng.next() >= c) {
    b.events.push({ t: 'miss', uid: t.uid, text: c === 0 ? 'Immune' : 'Miss' });
    return false;
  }
  t.st[s] = STATUS[s].dur;
  if (s === 'haste' && t.st.slow) delete t.st.slow;
  if (s === 'slow' && t.st.haste) delete t.st.haste;
  if (s === 'sleep') b.ready = b.ready.filter((x) => x !== t.uid);
  b.events.push({ t: 'status', uid: t.uid, status: s, on: true });
  return true;
}

function cure(b: Battle, t: Unit): void {
  for (const s of ['poison', 'sleep', 'slow'] as StatusId[]) {
    if (t.st[s]) {
      delete t.st[s];
      b.events.push({ t: 'status', uid: t.uid, status: s, on: false });
    }
  }
}

function steal(b: Battle, actor: Unit, t: Unit): void {
  if (t.side !== 'enemy') return;
  const d = ENEMIES[t.key];
  if (t.stolen) {
    b.events.push({ t: 'miss', uid: t.uid, text: 'Nothing left' });
    return;
  }
  const chance = 0.55 + (actor.spd - t.spd) * 0.02 - (t.rank === 'boss' ? 0.25 : 0);
  if (b.rng.next() >= Math.max(0.2, Math.min(0.9, chance))) {
    b.events.push({ t: 'miss', uid: t.uid, text: 'Missed!' });
    return;
  }
  t.stolen = true;
  if (d.steal && ITEMS[d.steal]) {
    b.items[d.steal] = (b.items[d.steal] ?? 0) + 1;
    b.events.push({ t: 'msg', text: `${actor.name} stole ${ITEMS[d.steal].icon} ${ITEMS[d.steal].name}!` });
    b.events.push({ t: 'miss', uid: t.uid, text: `${ITEMS[d.steal].icon}` });
  } else {
    const g = 10 + b.floor * 4;
    b.stealGold += g;
    b.events.push({ t: 'msg', text: `${actor.name} stole ${g} gold!` });
    b.events.push({ t: 'miss', uid: t.uid, text: `💰${g}` });
  }
}

interface ResolveOpts {
  item?: boolean;
  counter?: boolean;
}

/** Performs an action. Returns the enemies that took damage (for counters). */
function resolve(b: Battle, actor: Unit, a: ActionDef, primary: Unit | null, o: ResolveOpts = {}): void {
  const firstElem = a.elem === 'best' || a.elem === 'rand' ? undefined : a.elem ?? (a.kind === 'phys' ? actor.wElem : undefined);
  b.events.push({ t: 'act', uid: actor.uid, name: a.name, icon: a.icon, kind: a.kind, elem: firstElem, item: o.item, counter: o.counter });
  if (!o.item && a.mp && actor.side === 'hero') actor.mp = Math.max(0, actor.mp - a.mp);
  const targets = resolveTargets(b, actor, a, primary);
  const hitFoes: Unit[] = [];
  for (const t of targets) {
    switch (a.kind) {
      case 'phys':
      case 'mag':
      case 'flat': {
        if (!alive(t)) continue;
        const elem = elemFor(a, actor, t, b.rng);
        const mul = mulOf(t, elem);
        let d = baseDamage(b, actor, a, t) * (0.9 + b.rng.next() * 0.2);
        let crit = false;
        if (a.kind === 'phys' && (a.crit || b.rng.next() < actor.crit)) {
          d *= 1.5;
          crit = true;
        }
        if (t.guard) d *= 0.5;
        if (mul < 0) {
          const amt = Math.max(1, Math.round(-d * mul));
          heal(b, t, amt);
          continue;
        }
        const amt = mul === 0 ? 0 : Math.max(1, Math.round(d * mul));
        if (amt === 0) {
          b.events.push({ t: 'miss', uid: t.uid, text: 'Immune' });
          continue;
        }
        hurt(b, t, amt, { crit, elem, mul });
        if (t.side !== actor.side) hitFoes.push(t);
        if (a.drain) heal(b, actor, amt * 0.5);
        if (a.steal) steal(b, actor, t);
        if (a.status && alive(t)) addStatus(b, t, a.status, a.chance ?? 1);
        if (a.atb !== undefined && alive(t)) {
          t.atb = Math.max(0, Math.min(ATB_MAX, t.atb + a.atb));
          if (t.atb < ATB_MAX) b.ready = b.ready.filter((x) => x !== t.uid);
          b.events.push({ t: 'atb', uid: t.uid });
        }
        break;
      }
      case 'heal':
        heal(b, t, healAmount(actor, a, t));
        break;
      case 'revive':
        if (!alive(t)) {
          t.hp = Math.max(1, Math.round(t.maxHp * (a.pct ?? 0.3)));
          t.atb = 0;
          b.events.push({ t: 'revive', uid: t.uid, hp: t.hp });
        } else if (a.target === 'allies') heal(b, t, t.maxHp * (a.pct ?? 0.3) * 0.6);
        break;
      case 'status':
        if (a.id === 'defend') {
          actor.guard = true;
          b.events.push({ t: 'miss', uid: actor.uid, text: '🛡️ Guard' });
        } else if (a.status) addStatus(b, t, a.status, a.chance ?? 1);
        break;
      case 'cure':
        cure(b, t);
        break;
      case 'steal':
        steal(b, actor, t);
        break;
      case 'atb':
        if (t === actor) continue;
        t.atb = Math.max(0, Math.min(ATB_MAX, t.atb + (a.atb ?? 0)));
        b.events.push({ t: 'atb', uid: t.uid });
        break;
      case 'mp': {
        const amt = Math.min(t.maxMp - t.mp, a.flat ?? 0);
        t.mp += amt;
        b.events.push({ t: 'heal', uid: t.uid, amount: amt, hp: t.hp, mp: true });
        break;
      }
      case 'full':
        heal(b, t, t.maxHp);
        t.mp = t.maxMp;
        b.events.push({ t: 'heal', uid: t.uid, amount: t.maxMp, hp: t.hp, mp: true });
        break;
      case 'summon':
        for (const id of a.summon ?? []) {
          if (enemies(b).filter(alive).length >= 5) break;
          const u = enemyUnit(id, b.floor, b.nextUid++);
          u.atb = b.rng.int(0, 40);
          b.units.push(u);
          b.events.push({ t: 'spawn', uid: u.uid });
        }
        break;
    }
  }
  if (checkEnd(b)) return;
  // Counters: each enemy that was hit may answer once.
  if (!o.counter && actor.side === 'hero' && alive(actor)) {
    const seen = new Set<number>();
    for (const t of hitFoes) {
      if (seen.has(t.uid) || !alive(t) || t.st.sleep) continue;
      seen.add(t.uid);
      const counters = ENEMIES[t.key]?.counters ?? [];
      const e = elemFor(a, actor, t);
      const isMag = a.kind === 'mag' || a.kind === 'flat';
      const c = counters.find((x) => x.on === 'any' || (x.on === 'phys' && a.kind === 'phys') || (x.on === 'mag' && isMag) || x.on === e);
      if (c && b.rng.next() < c.chance) {
        const m = MOVES[c.do];
        resolve(b, t, m, m.target === 'enemy' ? actor : null, { counter: true });
        if (b.result || !alive(actor)) return;
      }
    }
  }
}

function checkEnd(b: Battle): boolean {
  if (b.result) return true;
  if (!enemies(b).some(alive)) b.result = 'win';
  else if (!heroes(b).some(alive)) b.result = 'lose';
  if (b.result) b.ready = [];
  return !!b.result;
}

// ---------- Heroes ----------

export function actionOf(cmd: Command): ActionDef {
  if (cmd.kind === 'attack') return SKILLS.attack;
  if (cmd.kind === 'defend') return SKILLS.defend;
  if (cmd.kind === 'item') return ITEMS[cmd.id];
  return SKILLS[cmd.id];
}

export function canUse(b: Battle, u: Unit, cmd: Command): boolean {
  if (cmd.kind === 'skill') {
    const s = SKILLS[cmd.id];
    if (!s || !u.skills.includes(cmd.id) || u.mp < (s.mp ?? 0)) return false;
    return targetsFor(b, u, s).length > 0 || (s.kind === 'revive' && s.target === 'allies');
  }
  if (cmd.kind === 'item') {
    const it = ITEMS[cmd.id];
    return !!it && (b.items[cmd.id] ?? 0) > 0 && targetsFor(b, u, it).length > 0;
  }
  return true;
}

/** Runs a hero command. Returns false when the hero is not ready or the command is not valid. */
export function command(b: Battle, uid: number, cmd: Command): boolean {
  const u = unit(b, uid);
  if (!u || b.result || !b.ready.includes(uid) || !canUse(b, u, cmd)) return false;
  b.ready = b.ready.filter((x) => x !== uid);
  const a = actionOf(cmd);
  const tgt = cmd.kind === 'defend' ? null : cmd.target === null ? null : (unit(b, cmd.target) ?? null);
  u.turns++;
  u.atb = 0;
  if (cmd.kind === 'item') b.items[cmd.id]--;
  resolve(b, u, a, tgt, { item: cmd.kind === 'item' });
  if (a.self && alive(u)) u.atb = a.self;
  return true;
}

// ---------- Enemy AI ----------

function cond(b: Battle, e: Unit, c: Cond): boolean {
  switch (c) {
    case 'half':
      return e.hp < e.maxHp * 0.5;
    case 'low':
      return e.hp < e.maxHp * 0.3;
    case 'first':
      return e.turns === 1;
    case 'nth2':
      return e.turns % 2 === 0;
    case 'nth3':
      return e.turns % 3 === 0;
    case 'allyLow':
      return enemies(b).some((x) => x !== e && alive(x) && x.hp < x.maxHp * 0.5);
    case 'noHaste':
      return !e.st.haste;
    case 'alone':
      return enemies(b).filter(alive).length === 1;
    case 'heroHaste':
      return heroes(b).some((h) => alive(h) && h.st.haste);
  }
}

/** The move an enemy picks this turn. */
export function enemyMove(b: Battle, e: Unit): ActionDef {
  const d = ENEMIES[e.key];
  for (const r of d.rules ?? []) {
    const key = `${r.do}:${r.if ?? ''}`;
    if (r.once && e.used.includes(key)) continue;
    if (r.if && !cond(b, e, r.if)) continue;
    if (r.chance !== undefined && b.rng.next() >= r.chance) continue;
    if (r.once) e.used.push(key);
    return MOVES[r.do];
  }
  if (d.cycle2 && e.hp < e.maxHp * 0.5 && !e.phase2) {
    e.phase2 = true;
    e.cyc = 0;
    b.events.push({ t: 'msg', text: `${d.name} changes its pattern!` });
  }
  const cyc = e.phase2 && d.cycle2 ? d.cycle2 : d.cycle;
  if (cyc) return MOVES[cyc[e.cyc++ % cyc.length]];
  return MOVES.attack;
}

function pickHero(b: Battle): Unit | null {
  const hs = heroes(b).filter(alive);
  if (!hs.length) return null;
  const w = hs.map((h) => [h, h.row === 'front' ? 2 : 1] as const);
  return b.rng.weighted(w);
}

function enemyTurn(b: Battle, e: Unit): void {
  e.turns++;
  e.atb = 0;
  const m = enemyMove(b, e);
  let t: Unit | null = null;
  if (m.target === 'enemy') t = pickHero(b);
  else if (m.target === 'ally') {
    const allies = enemies(b).filter(alive);
    if (m.kind === 'heal') t = allies.reduce((a, x) => (x.hp / x.maxHp < a.hp / a.maxHp ? x : a), allies[0]);
    else {
      const need = allies.filter((x) => x !== e && !(m.status && x.st[m.status]));
      t = need.find((x) => x.rank === 'boss') ?? need[0] ?? e;
    }
  }
  resolve(b, e, m, t);
}

/** Copies HP and MP back to the run heroes after the battle. */
export function writeBack(b: Battle, party: Hero[]): void {
  for (const u of heroes(b)) {
    if (u.hero === undefined) continue;
    const h = party[u.hero];
    h.hp = u.hp;
    h.mp = u.mp;
  }
}

export function enemyIntent(e: Unit): string {
  return ENEMIES[e.key]?.text ?? '';
}
