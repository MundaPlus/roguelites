/**
 * Fixed-tick battle simulation. Both sides use the same rules:
 * energy, a hand of 4 with a cycling queue, and the same unit logic.
 * Team 0 = player (bottom, walks up). Team 1 = enemy (top, walks down).
 */
import { BOSSES, CARDS, TOWERS, lvlMult, type CardDef, type Targets, type TowerType } from './data';
import { Rng } from './rng';

export const W = 360;
export const H = 600;
export const DT = 1 / 30;
export const LANE_X = [70, 180, 290];
export const TOWER_Y = 118;
export const KEEP_X = 180;
export const KEEP_Y = 44;
export const RIVER_Y = 300;
export const P_MIN_Y = 335;
export const P_MAX_Y = 578;
export const E_MIN_Y = 72;
export const E_MAX_Y = 265;
export const CAMP_Y = 592;
export const BATTLE_TIME = 180;
export const DOUBLE_AT = 60;
/** Global walk speed factor. */
export const SPEED = 1.45;
/** Energy per second at base rate. */
export const BASE_RATE = 1 / 2.8;

export type Team = 0 | 1;

export interface Ent {
  id: number;
  team: Team;
  kind: 'unit' | 'tower';
  /** Card id, or tower type for towers. */
  card: string;
  icon: string;
  /** Lane 0..2, or -1 for the keep (reachable from every lane). */
  lane: number;
  x: number;
  y: number;
  /** Side offset inside the lane. */
  xo: number;
  hp: number;
  maxHp: number;
  dmg: number;
  rate: number;
  cd: number;
  range: number;
  sight: number;
  speed: number;
  targets: Targets;
  air: boolean;
  splash: number;
  r: number;
  stun: number;
  freeze: number;
  rage: number;
  target: number;
  flash: number;
  lvl: number;
  deathDmg: number;
  deathSpawn?: { id: string; n: number };
  summon?: { id: string; n: number; every: number };
  summonT: number;
  tower?: TowerType;
  heal: number;
  /** The keep only shoots once awake. */
  awake: boolean;
}

export interface Side {
  energy: number;
  max: number;
  /** Energy per second. */
  rate: number;
  hand: string[];
  queue: string[];
  levels: Record<string, number>;
  hpMul: number;
  dmgMul: number;
  spdMul: number;
  spellMul: number;
  siegeMul: number;
  played: number;
}

export type Ev =
  | { k: 'shot'; x1: number; y1: number; x2: number; y2: number; team: Team; big: boolean }
  | { k: 'hit'; x: number; y: number; n: number; tower: boolean; team: Team }
  | { k: 'boom'; x: number; y: number; r: number; color: string }
  | { k: 'death'; x: number; y: number; icon: string; tower: boolean; team: Team }
  | { k: 'deploy'; x: number; y: number; team: Team; card: string }
  | { k: 'breach'; x: number; n: number }
  | { k: 'heal'; x: number; y: number; n: number }
  | { k: 'boss'; text: string };

export interface Layout {
  name: string;
  /** Tower type per lane, or null for an open lane. */
  lanes: (TowerType | null)[];
  laneHp: number[];
  keepHp: number;
}

export interface BattleSetup {
  seed: number;
  layout: Layout;
  towerHpMul: number;
  boss: string | null;
  enemy: { deck: string[]; lvl: number; rateMul: number };
  player: {
    deck: { id: string; lvl: number }[];
    camp: number;
    campMax: number;
    max: number;
    rateMul: number;
    startEnergy: number;
    hpMul: number;
    dmgMul: number;
    spdMul: number;
    spellMul: number;
    siegeMul: number;
  };
}

export interface Battle {
  t: number;
  time: number;
  ents: Ent[];
  nextId: number;
  sides: [Side, Side];
  camp: number;
  campMax: number;
  over: null | 'win' | 'lose';
  reason: string;
  events: Ev[];
  rng: Rng;
  layout: Layout;
  boss: string | null;
  bossT: number;
  bossHalf: boolean;
  aiT: number;
  towersDown: number;
  breaches: number;
  enemyLvl: number;
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);
export const edge = (a: Ent, b: Ent): number => dist(a, b) - a.r - b.r;

export function cardLevel(side: Side, id: string): number {
  return side.levels[id] ?? 1;
}

function makeSide(deck: { id: string; lvl: number }[], rng: Rng): Side {
  const ids = rng.shuffle(deck.map((c) => c.id));
  const levels: Record<string, number> = {};
  for (const c of deck) levels[c.id] = c.lvl;
  return {
    energy: 5,
    max: 10,
    rate: BASE_RATE,
    hand: ids.slice(0, 4),
    queue: ids.slice(4),
    levels,
    hpMul: 1,
    dmgMul: 1,
    spdMul: 1,
    spellMul: 1,
    siegeMul: 1,
    played: 0,
  };
}

export function createBattle(s: BattleSetup): Battle {
  const rng = new Rng(s.seed);
  const p = makeSide(s.player.deck, rng);
  p.max = s.player.max;
  p.rate = BASE_RATE * s.player.rateMul;
  p.energy = s.player.startEnergy;
  p.hpMul = s.player.hpMul;
  p.dmgMul = s.player.dmgMul;
  p.spdMul = s.player.spdMul;
  p.spellMul = s.player.spellMul;
  p.siegeMul = s.player.siegeMul;
  const e = makeSide(
    s.enemy.deck.map((id) => ({ id, lvl: s.enemy.lvl })),
    rng,
  );
  e.rate = BASE_RATE * s.enemy.rateMul;
  const b: Battle = {
    t: 0,
    time: BATTLE_TIME,
    ents: [],
    nextId: 1,
    sides: [p, e],
    camp: s.player.camp,
    campMax: s.player.campMax,
    over: null,
    reason: '',
    events: [],
    rng,
    layout: s.layout,
    boss: s.boss,
    bossT: 8,
    bossHalf: false,
    aiT: 1.5,
    towersDown: 0,
    breaches: 0,
    enemyLvl: s.enemy.lvl,
  };
  s.layout.lanes.forEach((type, lane) => {
    if (type) addTower(b, type, lane, LANE_X[lane], TOWER_Y, s.layout.laneHp[lane] * s.towerHpMul, s.enemy.lvl);
  });
  addTower(b, 'keep', -1, KEEP_X, KEEP_Y, s.layout.keepHp * s.towerHpMul, s.enemy.lvl);
  return b;
}

function addTower(b: Battle, type: TowerType, lane: number, x: number, y: number, hpMul: number, lvl: number): void {
  const d = TOWERS[type];
  const hp = Math.round(d.hp * hpMul);
  const dm = 1 + 0.12 * (lvl - 1);
  b.ents.push({
    id: b.nextId++,
    team: 1,
    kind: 'tower',
    card: type,
    icon: d.icon,
    lane,
    x,
    y,
    xo: 0,
    hp,
    maxHp: hp,
    dmg: Math.round(d.dmg * dm),
    rate: d.rate,
    cd: 0,
    range: d.range,
    sight: d.range,
    speed: 0,
    targets: d.targets,
    air: false,
    splash: d.splash ?? 0,
    r: type === 'keep' ? 24 : 19,
    stun: 0,
    freeze: 0,
    rage: 0,
    target: -1,
    flash: 0,
    lvl,
    deathDmg: 0,
    summonT: 0,
    tower: type,
    heal: (d.heal ?? 0) * dm,
    awake: type !== 'keep',
  });
}

export function keep(b: Battle): Ent | undefined {
  return b.ents.find((e) => e.tower === 'keep');
}

export function laneTower(b: Battle, lane: number): Ent | undefined {
  return b.ents.find((e) => e.kind === 'tower' && e.lane === lane && e.hp > 0);
}

export function spawnUnit(b: Battle, team: Team, id: string, lvl: number, lane: number, x: number, y: number): Ent {
  const c = CARDS[id];
  const st = c.unit!;
  const side = b.sides[team];
  const m = lvlMult(lvl);
  const hp = Math.round(st.hp * m * side.hpMul);
  const e: Ent = {
    id: b.nextId++,
    team,
    kind: 'unit',
    card: id,
    icon: c.icon,
    lane,
    x,
    y,
    xo: x - LANE_X[lane],
    hp,
    maxHp: hp,
    dmg: Math.round(st.dmg * m * side.dmgMul),
    rate: st.rate,
    cd: 0.4,
    range: st.range,
    sight: Math.max(100, st.range + 25),
    speed: st.speed * SPEED * side.spdMul,
    targets: st.targets,
    air: !!st.air,
    splash: st.splash ?? 0,
    r: st.r,
    stun: 0,
    freeze: 0,
    rage: 0,
    target: -1,
    flash: 0,
    lvl,
    deathDmg: Math.round((st.deathDmg ?? 0) * m),
    deathSpawn: st.deathSpawn,
    summon: st.summon,
    summonT: st.summon ? st.summon.every * 0.5 : 0,
    heal: 0,
    awake: true,
  };
  b.ents.push(e);
  return e;
}

/** Snap a drop point to a legal deploy spot for this card. */
export function dropPoint(team: Team, card: CardDef, x: number, y: number): { x: number; y: number; lane: number } {
  if (card.type === 'spell') {
    return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)), lane: nearestLane(x) };
  }
  const lane = nearestLane(x);
  const [lo, hi] = team === 0 ? [P_MIN_Y, P_MAX_Y] : [E_MIN_Y, E_MAX_Y];
  return { x: LANE_X[lane], y: Math.max(lo, Math.min(hi, y)), lane };
}

export function nearestLane(x: number): number {
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(LANE_X[i] - x) < Math.abs(LANE_X[best] - x)) best = i;
  return best;
}

export function canPlay(b: Battle, team: Team, id: string): boolean {
  const s = b.sides[team];
  return !b.over && s.hand.includes(id) && s.energy >= CARDS[id].cost;
}

/** Play a card from the hand. Returns false when it is not allowed. */
export function deploy(b: Battle, team: Team, id: string, x: number, y: number): boolean {
  if (!canPlay(b, team, id)) return false;
  const side = b.sides[team];
  const c = CARDS[id];
  side.energy -= c.cost;
  side.played++;
  const i = side.hand.indexOf(id);
  side.hand[i] = side.queue.shift()!;
  side.queue.push(id);
  const lvl = cardLevel(side, id);
  const p = dropPoint(team, c, x, y);
  b.events.push({ k: 'deploy', x: p.x, y: p.y, team, card: id });
  if (c.type === 'spell') {
    castSpell(b, team, c, lvl, p.x, p.y);
    return true;
  }
  const n = c.unit!.count ?? 1;
  for (let k = 0; k < n; k++) {
    const ox = n === 1 ? 0 : ((k % 3) - 1) * 13 + (b.rng.next() - 0.5) * 4;
    const oy = n === 1 ? 0 : Math.floor(k / 3) * 11 * (team === 0 ? 1 : -1);
    spawnUnit(b, team, id, lvl, p.lane, p.x + ox, p.y + oy);
  }
  return true;
}

function castSpell(b: Battle, team: Team, c: CardDef, lvl: number, x: number, y: number): void {
  const s = c.spell!;
  const side = b.sides[team];
  const m = lvlMult(lvl) * side.spellMul;
  const foes = b.ents.filter((e) => e.team !== team && e.hp > 0 && dist(e, { x, y }) <= s.radius + e.r * 0.5);
  const color = s.freeze ? '#9be7ff' : s.heal ? '#7ee08a' : s.rage ? '#ff4d6d' : s.bolts ? '#fff27a' : '#ff9f43';
  b.events.push({ k: 'boom', x, y, r: s.radius, color });
  if (s.bolts) {
    foes.sort((a, z) => z.hp - a.hp);
    for (const e of foes.slice(0, s.bolts)) {
      hurt(b, e, s.dmg! * m * (e.kind === 'tower' ? 0.35 : 1), team);
      e.stun = Math.max(e.stun, s.stun ?? 0);
      b.events.push({ k: 'shot', x1: e.x, y1: 0, x2: e.x, y2: e.y, team, big: true });
    }
  } else {
    for (const e of foes) {
      if (s.dmg) hurt(b, e, s.dmg * m * (e.kind === 'tower' ? 0.35 : 1), team);
      if (s.stun) e.stun = Math.max(e.stun, s.stun);
      if (s.freeze) e.freeze = Math.max(e.freeze, s.freeze * Math.sqrt(side.spellMul));
    }
  }
  if (s.heal || s.rage) {
    for (const a of b.ents) {
      if (a.team !== team || a.kind !== 'unit' || dist(a, { x, y }) > s.radius + a.r) continue;
      if (s.heal) {
        const before = a.hp;
        a.hp = Math.min(a.maxHp, a.hp + s.heal * m);
        if (a.hp > before) b.events.push({ k: 'heal', x: a.x, y: a.y, n: Math.round(a.hp - before) });
      }
      if (s.rage) a.rage = s.rage * Math.sqrt(side.spellMul);
    }
  }
}

function hurt(b: Battle, e: Ent, n: number, from: Team): void {
  if (e.hp <= 0) return;
  const d = Math.max(1, Math.round(n));
  e.hp -= d;
  e.flash = 0.12;
  if (e.tower === 'keep' && !e.awake) e.awake = true;
  b.events.push({ k: 'hit', x: e.x, y: e.y, n: d, tower: e.kind === 'tower', team: from });
}

export function canHit(a: { targets: Targets }, e: Ent): boolean {
  if (a.targets === 'buildings') return e.kind === 'tower';
  if (a.targets === 'ground' && e.air) return false;
  return true;
}

const sameLane = (u: Ent, e: Ent): boolean => e.lane === -1 || u.lane === -1 || e.lane === u.lane;

function findTarget(b: Battle, u: Ent): Ent | null {
  const cur = u.target >= 0 ? b.ents.find((e) => e.id === u.target && e.hp > 0) : undefined;
  if (cur && edge(u, cur) <= u.sight + 30) return cur;
  if (u.targets === 'buildings') {
    if (u.team === 1) return null;
    const t = laneTower(b, u.lane) ?? keep(b);
    return t && t.hp > 0 ? t : null;
  }
  let best: Ent | null = null;
  let bd = Infinity;
  for (const e of b.ents) {
    if (e.team === u.team || e.hp <= 0 || !canHit(u, e) || !sameLane(u, e)) continue;
    const d = edge(u, e);
    if (d > u.sight) continue;
    // Prefer units over buildings at the same distance.
    const score = d + (e.kind === 'tower' ? 15 : 0);
    if (score < bd) {
      bd = score;
      best = e;
    }
  }
  return best;
}

function attack(b: Battle, a: Ent, t: Ent): void {
  const side = b.sides[a.team];
  let dmg = a.dmg;
  if (a.kind === 'unit' && a.team === 0 && t.kind === 'tower') dmg *= side.siegeMul;
  if (a.range > 20 || a.kind === 'tower') b.events.push({ k: 'shot', x1: a.x, y1: a.y - (a.air ? 10 : 0), x2: t.x, y2: t.y - (t.air ? 10 : 0), team: a.team, big: a.splash > 0 });
  if (a.splash > 0) {
    b.events.push({ k: 'boom', x: t.x, y: t.y, r: a.splash, color: a.team === 0 ? '#ffd166' : '#ff9f43' });
    for (const e of b.ents) {
      if (e.team === a.team || e.hp <= 0 || !canHit(a, e)) continue;
      if (e !== t && dist(e, t) > a.splash + e.r) continue;
      let d = dmg;
      if (a.kind === 'unit' && a.team === 0 && e.kind === 'tower') d = a.dmg * side.siegeMul;
      hurt(b, e, d, a.team);
    }
  } else hurt(b, t, dmg, a.team);
}

function moveTo(u: Ent, x: number, y: number, stopAt: number, mul: number): void {
  const d = Math.hypot(x - u.x, y - u.y);
  if (d <= stopAt) return;
  const step = Math.min(d - stopAt, u.speed * DT * mul);
  u.x += ((x - u.x) / d) * step;
  u.y += ((y - u.y) / d) * step;
}

function unitStep(b: Battle, u: Ent): void {
  const mul = u.rage > 0 ? 1.4 : 1;
  if (u.summon) {
    u.summonT -= DT;
    if (u.summonT <= 0) {
      u.summonT = u.summon.every;
      for (let k = 0; k < u.summon.n; k++) spawnUnit(b, u.team, u.summon.id, u.lvl, u.lane, u.x + (k - 1) * 12, u.y + (u.team === 0 ? 14 : -14));
    }
  }
  const t = findTarget(b, u);
  u.target = t ? t.id : -1;
  if (t) {
    const d = edge(u, t);
    if (d <= u.range) {
      if (u.cd <= 0) {
        attack(b, u, t);
        u.cd = u.rate / mul;
      }
      return;
    }
    moveTo(u, t.x, t.y, u.r + t.r + u.range * 0.8, mul);
    return;
  }
  if (u.team === 0) {
    const tw = laneTower(b, u.lane);
    const goal = tw ?? keep(b);
    if (!goal) return;
    if (tw) moveTo(u, LANE_X[u.lane] + u.xo, TOWER_Y + 20, 0, mul);
    else moveTo(u, goal.x, goal.y, goal.r + u.r + u.range * 0.8, mul);
  } else {
    moveTo(u, LANE_X[u.lane] + u.xo, CAMP_Y + 10, 0, mul);
    if (u.y >= CAMP_Y) breach(b, u);
  }
}

/** Camp damage when an enemy unit reaches the bottom. */
export function breachDmg(id: string): number {
  const c = CARDS[id];
  return Math.max(1, Math.round((c.cost * 1.5) / (c.unit?.count ?? 1)));
}

function breach(b: Battle, u: Ent): void {
  const n = breachDmg(u.card);
  b.camp = Math.max(0, b.camp - n);
  b.breaches += n;
  u.hp = 0;
  u.deathDmg = 0;
  u.deathSpawn = undefined;
  b.events.push({ k: 'breach', x: u.x, n });
}

function towerStep(b: Battle, t: Ent): void {
  if (!t.awake) return;
  if (t.heal > 0) {
    t.summonT -= DT;
    if (t.summonT <= 0) {
      t.summonT = 1;
      for (const a of b.ents) {
        if (a.team !== t.team || a.hp <= 0 || a.hp >= a.maxHp || dist(a, t) > t.range + 10) continue;
        const n = Math.min(a.maxHp - a.hp, a.kind === 'tower' ? t.heal * 0.6 : t.heal);
        a.hp += n;
        b.events.push({ k: 'heal', x: a.x, y: a.y, n: Math.round(n) });
      }
    }
  }
  let best: Ent | null = null;
  let bd = Infinity;
  for (const e of b.ents) {
    if (e.team === t.team || e.hp <= 0 || !canHit(t, e)) continue;
    const d = edge(t, e);
    if (d <= t.range && d < bd) {
      bd = d;
      best = e;
    }
  }
  if (best && t.cd <= 0) {
    attack(b, t, best);
    t.cd = t.rate;
  }
}

/** Densest spot of a team's units: the unit with the most HP of its team within `r`. */
export function cluster(b: Battle, team: Team, r: number, filter?: (e: Ent) => boolean): { x: number; y: number; hp: number; n: number } | null {
  const list = b.ents.filter((e) => e.team === team && e.kind === 'unit' && e.hp > 0 && (!filter || filter(e)));
  let best: { x: number; y: number; hp: number; n: number } | null = null;
  for (const c of list) {
    let hp = 0;
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (const e of list) {
      if (dist(c, e) <= r) {
        hp += e.hp;
        n++;
        sx += e.x;
        sy += e.y;
      }
    }
    if (!best || hp > best.hp) best = { x: sx / n, y: sy / n, hp, n };
  }
  return best;
}

function bossStep(b: Battle): void {
  const k = keep(b);
  if (!b.boss || !k || k.hp <= 0) return;
  const def = BOSSES.find((x) => x.id === b.boss)!;
  if (b.boss === 'dragon' && !b.bossHalf && k.hp < k.maxHp / 2) {
    b.bossHalf = true;
    for (let l = 0; l < 3; l++) spawnUnit(b, 1, 'babydragon', b.enemyLvl, l, LANE_X[l], TOWER_Y + 30);
    b.events.push({ k: 'boss', text: 'Dragons guard every lane!' });
  }
  b.bossT -= DT;
  if (b.bossT > 0) return;
  b.bossT = def.every;
  if (b.boss === 'chief') {
    const counts = [0, 1, 2].map((l) => b.ents.filter((e) => e.team === 0 && e.lane === l).length);
    const lane = counts.indexOf(Math.max(...counts));
    for (let i = 0; i < 3; i++) spawnUnit(b, 1, 'goblins', b.enemyLvl, lane, LANE_X[lane] + (i - 1) * 12, TOWER_Y + 34);
    b.events.push({ k: 'boss', text: 'The Chief sends goblins!' });
  } else if (b.boss === 'witch') {
    const c = cluster(b, 0, 55);
    if (!c) return;
    for (const e of b.ents) if (e.team === 0 && e.hp > 0 && dist(e, c) <= 62) e.freeze = Math.max(e.freeze, 2.5);
    b.events.push({ k: 'boom', x: c.x, y: c.y, r: 62, color: '#9be7ff' });
    b.events.push({ k: 'boss', text: 'Frost Witch: freeze!' });
  } else if (b.boss === 'dragon') {
    const c = cluster(b, 0, 42);
    if (!c) return;
    const dmg = 230 * lvlMult(b.enemyLvl);
    for (const e of b.ents) if (e.team === 0 && e.hp > 0 && dist(e, c) <= 44 + e.r * 0.5) hurt(b, e, dmg, 1);
    b.events.push({ k: 'shot', x1: k.x, y1: k.y, x2: c.x, y2: c.y, team: 1, big: true });
    b.events.push({ k: 'boom', x: c.x, y: c.y, r: 44, color: '#ff6b35' });
  }
}

function separate(b: Battle): void {
  const us = b.ents.filter((e) => e.kind === 'unit' && e.hp > 0);
  for (let i = 0; i < us.length; i++) {
    const a = us[i];
    for (let j = i + 1; j < us.length; j++) {
      const c = us[j];
      if (a.air !== c.air) continue;
      const dx = c.x - a.x;
      const dy = c.y - a.y;
      const min = (a.r + c.r) * 0.8;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.01;
      const push = (min - d) * 0.35;
      const nx = d2 ? dx / d : (i % 2 ? 1 : -1);
      const ny = d2 ? dy / d : 0;
      a.x -= nx * push;
      a.y -= ny * push;
      c.x += nx * push;
      c.y += ny * push;
    }
  }
  for (const u of us) {
    // Keep units in their lane, except near the keep where lanes meet.
    if (u.y < TOWER_Y + 30) continue;
    const lx = LANE_X[u.lane];
    u.x = Math.max(lx - 34, Math.min(lx + 34, u.x));
  }
}

/** Advance the battle by one fixed tick. The enemy AI runs outside (see ai.ts). */
export function tick(b: Battle): void {
  if (b.over) return;
  b.t += DT;
  b.time -= DT;
  const boost = b.time <= DOUBLE_AT ? 2 : 1;
  for (const s of b.sides) s.energy = Math.min(s.max, s.energy + s.rate * boost * DT);
  bossStep(b);
  const list = b.ents.slice();
  for (const e of list) {
    if (e.hp <= 0) continue;
    e.flash = Math.max(0, e.flash - DT);
    e.rage = Math.max(0, e.rage - DT);
    e.cd -= DT * (e.rage > 0 ? 1.4 : 1);
    if (e.freeze > 0 || e.stun > 0) {
      e.freeze = Math.max(0, e.freeze - DT);
      e.stun = Math.max(0, e.stun - DT);
      continue;
    }
    if (e.kind === 'tower') towerStep(b, e);
    else unitStep(b, e);
  }
  separate(b);
  cleanup(b);
  const k = keep(b);
  if (!k || k.hp <= 0) {
    b.over = 'win';
    b.reason = 'The keep falls!';
  } else if (b.camp <= 0) {
    b.over = 'lose';
    b.reason = 'Your camp was overrun.';
  } else if (b.time <= 0) {
    b.over = 'lose';
    b.reason = 'Time ran out.';
  }
}

function cleanup(b: Battle): void {
  const dead = b.ents.filter((e) => e.hp <= 0);
  if (!dead.length) return;
  b.ents = b.ents.filter((e) => e.hp > 0);
  for (const d of dead) {
    b.events.push({ k: 'death', x: d.x, y: d.y, icon: d.icon, tower: d.kind === 'tower', team: d.team });
    if (d.kind === 'tower') {
      if (d.tower !== 'keep') {
        b.towersDown++;
        const k = keep(b);
        if (k) k.awake = true;
      }
      continue;
    }
    if (d.deathDmg > 0) {
      b.events.push({ k: 'boom', x: d.x, y: d.y, r: 32, color: '#ff9f43' });
      for (const e of b.ents) if (e.team !== d.team && dist(e, d) <= 32 + e.r && (e.kind === 'tower' || !e.air)) hurt(b, e, d.deathDmg, d.team);
    }
    if (d.deathSpawn) {
      for (let k = 0; k < d.deathSpawn.n; k++) spawnUnit(b, d.team, d.deathSpawn.id, d.lvl, d.lane, d.x + (k ? 10 : -10), d.y);
    }
  }
}

/** Remaining HP fraction of all enemy towers, for scoring and UI. */
export function towerState(b: Battle): { type: TowerType; lane: number; hp: number; max: number }[] {
  const out: { type: TowerType; lane: number; hp: number; max: number }[] = [];
  b.layout.lanes.forEach((t, lane) => {
    if (!t) return;
    const e = b.ents.find((x) => x.kind === 'tower' && x.lane === lane);
    out.push({ type: t, lane, hp: e ? e.hp : 0, max: e ? e.maxHp : 1 });
  });
  const k = keep(b);
  out.push({ type: 'keep', lane: -1, hp: k ? k.hp : 0, max: k ? k.maxHp : 1 });
  return out;
}

