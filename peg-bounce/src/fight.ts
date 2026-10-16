import { ACTS, ENEMIES, ORBS, type EnemyDef, type OrbDef } from './data';
import { genBoard, type Board, type Shot, type ShotOpts } from './physics';
import { Rng } from './rng';

/** Slots on the lane. Slot 1 is next to the hero. */
export const SLOTS = 8;

/** Enemy HP factor per act, on top of the base HP in data.ts. */
export const HP_SCALE = [2, 2.4, 2.8];

/** Enemy attack factor per act. */
export const ATK_SCALE = [1.3, 1.4, 1.5];

export const enemyAtk = (e: EnemyInst, act: number): number => Math.round(ENEMIES[e.id].atk * ATK_SCALE[act]);

export interface OrbInst {
  id: string;
  lvl: number;
}

export interface Hero {
  hp: number;
  maxHp: number;
  gold: number;
  relics: string[];
  bag: OrbInst[];
}

export interface EnemyInst {
  uid: number;
  id: string;
  hp: number;
  max: number;
  slot: number;
  shield: number;
  poison: number;
  age: number;
}

export type FightKind = 'fight' | 'elite' | 'boss';

export interface Fight {
  kind: FightKind;
  act: number;
  board: Board;
  rng: Rng;
  enemies: EnemyInst[];
  nextUid: number;
  /** Bag indexes still to draw, in order. */
  draw: number[];
  cur: number;
  shots: number;
  turn: number;
  discards: number;
  kills: number;
}

export const has = (h: Hero, relic: string): boolean => h.relics.includes(relic);

export const critCount = (h: Hero): number => 2 + (has(h, 'lens') ? 1 : 0);

export function shotOpts(h: Hero, orb: OrbDef): ShotOpts {
  const e = Math.min(0.97, (orb.e ?? 0.7) * (has(h, 'rubber') ? 1.15 : 1));
  return { r: orb.r ?? 7, e, g: orb.g ?? 1, ghost: orb.ghost ?? 0, split: !!orb.split, bombAt: has(h, 'keg') ? 1 : 2 };
}

export const def = (e: EnemyInst): EnemyDef => ENEMIES[e.id];

function makeEnemy(f: Fight, id: string, slot: number): EnemyInst {
  const d = ENEMIES[id];
  const hp = Math.round(d.hp * HP_SCALE[f.act] * (d.boss ? 0.8 : 1));
  return { uid: f.nextUid++, id, hp, max: hp, slot, shield: 0, poison: 0, age: 0 };
}

export function startFight(h: Hero, act: number, kind: FightKind, seed: number): Fight {
  const rng = new Rng(seed);
  const a = ACTS[act];
  const board = genBoard(rng, critCount(h), 2, has(h, 'bucket') ? 110 : 56);
  const f: Fight = { kind, act, board, rng, enemies: [], nextUid: 1, draw: [], cur: -1, shots: 0, turn: 1, discards: 1, kills: 0 };
  const slots = rng.shuffle([4, 5, 6, 7, 8]);
  if (kind === 'boss') {
    const boss = ENEMIES[a.boss];
    const bossSlot = Math.min(SLOTS, boss.range);
    f.enemies.push(makeEnemy(f, a.boss, bossSlot));
    const free = slots.filter((s) => s !== bossSlot);
    for (let i = 0; i < 2; i++) f.enemies.push(makeEnemy(f, rng.pick(a.pool), free[i]));
  } else if (kind === 'elite') {
    f.enemies.push(makeEnemy(f, a.elite, slots[0]));
    for (let i = 1; i <= 1 + (act > 0 ? 1 : 0); i++) f.enemies.push(makeEnemy(f, rng.pick(a.pool), slots[i]));
  } else {
    const n = act === 0 ? rng.int(2, 3) : act === 1 ? 3 : rng.int(3, 4);
    for (let i = 0; i < n; i++) f.enemies.push(makeEnemy(f, rng.pick(a.pool), slots[i]));
  }
  f.enemies.sort((x, y) => x.slot - y.slot);
  drawOrb(h, f);
  return f;
}

// ---------- Orb bag ----------

export function drawOrb(h: Hero, f: Fight): void {
  if (!f.draw.length) f.draw = f.rng.shuffle(h.bag.map((_, i) => i));
  f.cur = f.draw.shift()!;
}

export const curOrb = (h: Hero, f: Fight): OrbInst => h.bag[f.cur];

export const nextOrb = (h: Hero, f: Fight): OrbInst | null => (f.draw.length ? h.bag[f.draw[0]] : null);

export function discard(h: Hero, f: Fight): boolean {
  if (f.discards <= 0 || h.bag.length < 2) return false;
  f.discards--;
  drawOrb(h, f);
  return true;
}

// ---------- The player's attack ----------

export interface Attack {
  orb: OrbInst;
  hits: number;
  perPeg: number;
  crit: boolean;
  bucket: boolean;
  echo: boolean;
  total: number;
  bombs: number;
  bombDmg: number;
  poison: number;
  gold: number;
  heal: number;
}

export function computeAttack(h: Hero, f: Fight, s: Shot): Attack {
  const orb = curOrb(h, f);
  const d = ORBS[orb.id];
  const lvl = orb.lvl - 1;
  const hits = s.pegHits + (d.wallHits || has(h, 'spikes') ? s.walls : 0);
  const perPeg = (s.crit ? d.crit[lvl] : d.dmg[lvl]) + (has(h, 'whetstone') ? 1 : 0);
  let total = hits * perPeg;
  if (s.bucket) total = Math.ceil(total * 1.5);
  const echo = has(h, 'echo') && f.shots === 0;
  if (echo) total *= 2;
  let heal = 0;
  if (d.healEvery) heal += Math.floor(hits / d.healEvery);
  if (has(h, 'fang')) heal += Math.floor(s.pegHits / 10) * 2;
  if (has(h, 'wind') && s.refresh) heal += 4;
  let gold = 0;
  if (d.goldPer) gold += hits * d.goldPer;
  if (has(h, 'crown')) gold += s.critHits * 4;
  let poison = d.poisonEvery ? Math.floor(hits / d.poisonEvery) : 0;
  if (has(h, 'needle') && hits > 0) poison += 2;
  return {
    orb,
    hits,
    perPeg,
    crit: s.crit,
    bucket: s.bucket,
    echo,
    total,
    bombs: s.bombs,
    bombDmg: s.bombs * (6 + (has(h, 'keg') ? 4 : 0)),
    poison,
    gold,
    heal,
  };
}

export interface Hit {
  uid: number;
  dmg: number;
  blocked: number;
  killed: boolean;
}

/** Damage one enemy. Shield first, then armor per attack. */
function hurt(f: Fight, e: EnemyInst, n: number): Hit {
  const d = def(e);
  let dmg = n;
  let blocked = 0;
  if (d.special === 'armor') {
    blocked += Math.min(dmg, d.value ?? 0);
    dmg -= Math.min(dmg, d.value ?? 0);
  }
  const s = Math.min(e.shield, dmg);
  e.shield -= s;
  dmg -= s;
  blocked += s;
  e.hp -= dmg;
  const killed = e.hp <= 0;
  if (killed) {
    f.enemies = f.enemies.filter((x) => x !== e);
    f.kills++;
  }
  return { uid: e.uid, dmg, blocked, killed };
}

export const front = (f: Fight): EnemyInst | undefined => [...f.enemies].sort((a, b) => a.slot - b.slot)[0];

/** Apply the attack. Returns the hits for the animation. */
export function applyAttack(h: Hero, f: Fight, a: Attack): Hit[] {
  const out: Hit[] = [];
  const d = ORBS[a.orb.id];
  f.shots++;
  const order = [...f.enemies].sort((x, y) => x.slot - y.slot);
  if (a.total > 0 && order.length) {
    if (d.pierce) {
      for (const e of order) out.push(hurt(f, e, a.total));
    } else {
      const t = order[0];
      if (a.poison) t.poison += a.poison;
      out.push(hurt(f, t, a.total));
      if (d.splash && order[1]) out.push(hurt(f, order[1], Math.ceil(a.total / 2)));
    }
  }
  if (a.bombDmg > 0) for (const e of [...f.enemies]) out.push(hurt(f, e, a.bombDmg));
  h.hp = Math.min(h.maxHp, h.hp + a.heal);
  h.gold += a.gold;
  return out;
}

// ---------- Enemy turn ----------

export type EnemyEvent =
  | { kind: 'poison'; uid: number; dmg: number; killed: boolean }
  | { kind: 'regen' | 'heal'; uid: number; target: number; amount: number }
  | { kind: 'shield'; uid: number; amount: number }
  | { kind: 'summon'; uid: number; spawned: number }
  | { kind: 'move'; uid: number; to: number }
  | { kind: 'attack'; uid: number; dmg: number; thorns: Hit | null; explode: boolean };

const atkEvery = (d: EnemyDef): number => (d.boss ? 2 : 1);

/** What the enemy will do on its next turn, for the intent icon. */
export function intent(e: EnemyInst, act: number): { attack: boolean; dmg: number } {
  const d = def(e);
  const charged = (e.age + 1) % atkEvery(d) === 0;
  return { attack: e.slot <= d.range && charged, dmg: enemyAtk(e, act) };
}

export function enemyTurn(h: Hero, f: Fight): EnemyEvent[] {
  const ev: EnemyEvent[] = [];
  const order = [...f.enemies].sort((a, b) => a.slot - b.slot);
  const free = (slot: number) => slot >= 1 && slot <= SLOTS && !f.enemies.some((x) => x.slot === slot);
  for (const e of order) {
    if (!f.enemies.includes(e) || h.hp <= 0) continue;
    const d = def(e);
    if (e.poison > 0) {
      const dmg = e.poison;
      e.poison--;
      e.hp -= dmg;
      const killed = e.hp <= 0;
      if (killed) {
        f.enemies = f.enemies.filter((x) => x !== e);
        f.kills++;
      }
      ev.push({ kind: 'poison', uid: e.uid, dmg, killed });
      if (killed) continue;
    }
    e.age++;
    if (d.special === 'regen' && e.hp < e.max) {
      const n = Math.min(d.value ?? 0, e.max - e.hp);
      e.hp += n;
      ev.push({ kind: 'regen', uid: e.uid, target: e.uid, amount: n });
    }
    if (d.special === 'shield') {
      e.shield = d.value ?? 0;
      ev.push({ kind: 'shield', uid: e.uid, amount: e.shield });
    }
    if (d.special === 'heal') {
      const hurtAlly = f.enemies.filter((x) => x !== e && x.hp < x.max).sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
      if (hurtAlly) {
        const n = Math.min(d.value ?? 0, hurtAlly.max - hurtAlly.hp);
        hurtAlly.hp += n;
        ev.push({ kind: 'heal', uid: e.uid, target: hurtAlly.uid, amount: n });
      }
    }
    if (d.special === 'summon' && d.summon && e.age % (d.every ?? 2) === 0) {
      const slot = [e.slot + 1, e.slot - 1, e.slot + 2, e.slot + 3, 8, 7, 6, 5].find(free);
      if (slot) {
        const s = makeEnemy(f, d.summon, slot);
        f.enemies.push(s);
        ev.push({ kind: 'summon', uid: e.uid, spawned: s.uid });
      }
    }
    if (e.slot <= d.range) {
      if (e.age % atkEvery(d) !== 0) continue;
      const dmg = Math.max(0, enemyAtk(e, f.act) - (has(h, 'helmet') ? 1 : 0));
      h.hp -= dmg;
      let thorns: Hit | null = null;
      const explode = d.special === 'explode';
      if (explode) {
        f.enemies = f.enemies.filter((x) => x !== e);
      } else if (has(h, 'thorns')) {
        thorns = hurt(f, e, 3);
      }
      ev.push({ kind: 'attack', uid: e.uid, dmg, thorns, explode });
    } else {
      let moved = false;
      for (let k = 0; k < d.speed; k++) {
        if (e.slot <= d.range || !free(e.slot - 1)) break;
        e.slot--;
        moved = true;
      }
      if (moved) ev.push({ kind: 'move', uid: e.uid, to: e.slot });
    }
  }
  f.turn++;
  return ev;
}
