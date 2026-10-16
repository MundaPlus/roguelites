import {
  blocked,
  damage,
  heal,
  ignite,
  isSolid,
  place,
  pos,
  push,
  shield,
  slide,
  smoke,
  tileAt,
  unitAt,
  type Battle,
  type Unit,
} from './board';
import { ARROWS, DIRS, HEXES, R, dirTo, dist, onBoard, opp, step, type Hex } from './hex';

export type Aim = 'melee' | 'proj' | 'art' | 'self' | 'line' | 'charge' | 'tele';

/** One aimed use of a weapon. `h` is the tile the player clicks, `hit` the tile the shot reaches. */
export interface Target {
  h: Hex;
  hit: Hex;
  dir: number;
  dist: number;
  /** Charge only: where the mech stops. */
  land?: Hex;
}

/** One effect on one tile. The effects of a shot apply in list order. */
export interface Op {
  h: Hex;
  dmg?: number;
  push?: number;
  pull?: { dir: number; n: number };
  ignite?: boolean;
  smoke?: boolean;
  shield?: boolean;
  friendOnly?: boolean;
  spare?: boolean;
  /** Repair 1 HP of a mech on the tile. */
  mend?: boolean;
}

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  aim: Aim;
  enemy?: boolean;
  /** Line, tele and art use it. */
  range?: (lvl: number) => number;
  /** Base damage. 0 for tools. Bonus damage only adds to weapons with damage. */
  dmg: (lvl: number) => number;
  text: (lvl: number, dmg: number) => string;
  /** What Mk II adds. */
  up?: string;
  ops: (b: Battle, u: Unit, t: Target, lvl: number, dmg: number) => Op[];
  /** Movement of the user before the effects (charge, swap, grapple to a wall). */
  pre?: (b: Battle, u: Unit, t: Target, lvl: number) => void;
}

const ring6 = (h: Hex, o: Omit<Op, 'h' | 'push'> = {}, pushOut = true): Op[] =>
  DIRS.map((_, d) => ({ h: step(h, d), ...(pushOut ? { push: d } : {}), ...o })).filter((op) => onBoard(op.h));

const dmgPush = (t: Target, dmg: number): Op[] => [{ h: t.hit, dmg, push: t.dir }];

const W: WeaponDef[] = [
  // ---------- Vanguard squad ----------
  {
    id: 'fist',
    name: 'Titan Fist',
    icon: '👊',
    aim: 'melee',
    dmg: (l) => (l ? 3 : 2),
    text: (_, d) => `Punch an adjacent tile for ${d} damage and push it.`,
    up: '+1 damage.',
    ops: (_b, _u, t, _l, d) => dmgPush(t, d),
  },
  {
    id: 'cannon',
    name: 'Pulse Cannon',
    icon: '💥',
    aim: 'proj',
    dmg: (l) => (l ? 2 : 1),
    text: (_, d) => `Shot flies in a line to the first thing it hits. ${d} damage and push.`,
    up: '+1 damage.',
    ops: (_b, _u, t, _l, d) => dmgPush(t, d),
  },
  {
    id: 'lobber',
    name: 'Shell Lobber',
    icon: '🎯',
    aim: 'art',
    dmg: (l) => (l ? 2 : 1),
    text: (_, d) => `Lob a shell over obstacles, 2+ tiles away. ${d} damage to the target, push all tiles next to it away.`,
    up: '+1 damage on the target.',
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, dmg: d }, ...ring6(t.hit)],
  },
  // ---------- Flux squad ----------
  {
    id: 'swap',
    name: 'Phase Swap',
    icon: '🌀',
    aim: 'tele',
    range: (l) => (l ? 5 : 3),
    dmg: () => 0,
    text: (l) => `Teleport to a tile up to ${l ? 5 : 3} away. A unit there swaps places with you.`,
    up: 'Range 5.',
    ops: () => [],
    pre: (b, u, t) => {
      const from = pos(u);
      const other = unitAt(b, t.hit);
      u.q = t.hit.q;
      u.r = t.hit.r;
      if (other) place(b, other, from);
      place(b, u, t.hit);
    },
  },
  {
    id: 'grapple',
    name: 'Grapple Hook',
    icon: '🪝',
    aim: 'proj',
    dmg: (l) => (l ? 2 : 1),
    text: (_, d) => `Hook the first thing in a line. Pull a unit next to you and deal ${d} damage. Hook a wall to pull yourself to it.`,
    up: '+1 damage.',
    pre: (b, u, t) => {
      const tile = tileAt(b, t.hit);
      if (tile && isSolid(tile)) slide(b, pos(u), t.dir, t.dist - 1);
    },
    ops: (b, _u, t, _l, d) => (unitAt(b, t.hit) ? [{ h: t.hit, dmg: d, pull: { dir: opp(t.dir), n: t.dist - 1 } }] : []),
  },
  {
    id: 'mist',
    name: 'Smoke Mortar',
    icon: '☁️',
    aim: 'art',
    dmg: (l) => (l ? 1 : 0),
    text: (l) => `Lob smoke 2+ tiles away on the target and the tile behind it${l ? ', 1 damage to the target' : ''}. Units in smoke cannot attack.`,
    up: '1 damage to the target.',
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, smoke: true, dmg: d }, { h: step(t.hit, t.dir), smoke: true }],
  },
  // ---------- Blaze squad ----------
  {
    id: 'flame',
    name: 'Flamethrower',
    icon: '🔥',
    aim: 'line',
    range: (l) => (l ? 3 : 2),
    dmg: () => 1,
    text: (l, d) => `Set 1–${l ? 3 : 2} tiles in a line on fire. The last one takes ${d} damage and is pushed. Burning units take 1 damage each turn.`,
    up: 'Range 3.',
    ops: (_b, u, t, _l, d) => {
      const out: Op[] = [];
      for (let k = 1; k <= t.dist; k++) out.push({ h: step(pos(u), t.dir, k), ignite: true });
      out.push({ h: t.hit, dmg: d, push: t.dir });
      return out;
    },
  },
  {
    id: 'aegis',
    name: 'Shield Projector',
    icon: '🔰',
    aim: 'art',
    dmg: () => 0,
    text: (l) => `Shield mechs and buildings on the target and all tiles next to it${l ? ', and repair those mechs by 1' : ''}. A shield blocks the next damage.`,
    up: 'Shielded mechs also repair 1 HP.',
    ops: (_b, _u, t, l) => [{ h: t.hit, shield: true, friendOnly: true, mend: l > 0 }, ...ring6(t.hit, { shield: true, friendOnly: true, mend: l > 0 }, false)],
  },
  {
    id: 'quake',
    name: 'Ground Slam',
    icon: '🔨',
    aim: 'self',
    dmg: (l) => (l ? 2 : 1),
    text: (_, d) => `${d} damage to all 6 units next to you and push them away. Spares buildings.`,
    up: '+1 damage.',
    ops: (_b, u, _t, _l, d) => ring6(pos(u), { dmg: d, spare: true }),
  },
  // ---------- Hangar extras ----------
  {
    id: 'rockets',
    name: 'Rocket Battery',
    icon: '🚀',
    aim: 'art',
    dmg: (l) => (l ? 3 : 2),
    text: (_, d) => `Lob rockets 2+ tiles away for ${d} damage. No push.`,
    up: '+1 damage.',
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, dmg: d }],
  },
  {
    id: 'repulse',
    name: 'Repulsor',
    icon: '🧲',
    aim: 'self',
    dmg: () => 0,
    text: (l) => `Push all 6 tiles next to you away.${l ? ' Shield yourself.' : ''}`,
    up: 'Also shields you.',
    pre: (b, u, _t, l) => {
      if (l) shield(b, pos(u));
    },
    ops: (_b, u) => ring6(pos(u)),
  },
  {
    id: 'spear',
    name: 'Arc Spear',
    icon: '🔱',
    aim: 'line',
    range: () => 2,
    dmg: (l) => (l ? 2 : 1),
    text: (_, d) => `Pierce 1–2 tiles in a line for ${d} damage each and push the last one.`,
    up: '+1 damage.',
    ops: (_b, _u, t, _l, d) => {
      const out: Op[] = [];
      for (let k = t.dist - 1; k >= 1; k--) out.push({ h: step(t.hit, opp(t.dir), k), dmg: d });
      out.push({ h: t.hit, dmg: d, push: t.dir });
      return out;
    },
  },
  {
    id: 'ram',
    name: 'Ram Thrusters',
    icon: '🐏',
    aim: 'charge',
    dmg: (l) => (l ? 3 : 2),
    text: (_, d) => `Charge in a line until something blocks you. Hit it for ${d} damage and push it.`,
    up: '+1 damage.',
    pre: (b, u, t) => {
      if (t.land) place(b, u, t.land);
    },
    ops: (_b, _u, t, _l, d) => (t.dist > 0 ? dmgPush(t, d) : []),
  },
  // ---------- Enemy attacks ----------
  {
    id: 'claws',
    name: 'Claws',
    icon: '🦀',
    aim: 'melee',
    enemy: true,
    dmg: () => 1,
    text: (_, d) => `Claws an adjacent tile for ${d} damage.`,
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, dmg: d }],
  },
  {
    id: 'spit',
    name: 'Acid Spit',
    icon: '🟢',
    aim: 'proj',
    enemy: true,
    dmg: () => 1,
    text: (_, d) => `Spits in a line at the first thing in the way for ${d} damage.`,
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, dmg: d }],
  },
  {
    id: 'mortar',
    name: 'Bile Mortar',
    icon: '🟤',
    aim: 'art',
    enemy: true,
    dmg: () => 1,
    text: (_, d) => `Lobs bile 2+ tiles away over obstacles for ${d} damage.`,
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, dmg: d }],
  },
  {
    id: 'slam',
    name: 'Horn Slam',
    icon: '🦏',
    aim: 'melee',
    enemy: true,
    dmg: () => 2,
    text: (_, d) => `Rams an adjacent tile for ${d} damage and pushes it.`,
    ops: (_b, _u, t, _l, d) => dmgPush(t, d),
  },
  {
    id: 'sweep',
    name: 'Tail Sweep',
    icon: '🌪️',
    aim: 'melee',
    enemy: true,
    dmg: () => 1,
    text: (_, d) => `Sweeps 3 adjacent tiles in an arc for ${d} damage each.`,
    ops: (_b, u, t, _l, d) =>
      [step(pos(u), (t.dir + 1) % 6), t.hit, step(pos(u), (t.dir + 5) % 6)].filter(onBoard).map((h) => ({ h, dmg: d })),
  },
  {
    id: 'firespit',
    name: 'Fire Spit',
    icon: '🟠',
    aim: 'proj',
    enemy: true,
    dmg: () => 1,
    text: (_, d) => `Spits fire in a line for ${d} damage and sets the tile on fire.`,
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, dmg: d, ignite: true }],
  },
  {
    id: 'bite',
    name: 'Leaping Bite',
    icon: '🦷',
    aim: 'melee',
    enemy: true,
    dmg: () => 2,
    text: (_, d) => `Bites an adjacent tile for ${d} damage.`,
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, dmg: d }],
  },
  {
    id: 'crush',
    name: 'Tyrant Crush',
    icon: '🦖',
    aim: 'melee',
    enemy: true,
    dmg: () => 3,
    text: (_, d) => `Crushes an adjacent tile for ${d} damage and pushes it. Calls a new hatchling each turn.`,
    ops: (_b, _u, t, _l, d) => dmgPush(t, d),
  },
  {
    id: 'barrage',
    name: 'Hive Barrage',
    icon: '🟣',
    aim: 'art',
    enemy: true,
    dmg: () => 2,
    text: (_, d) => `Lobs a spore 2+ tiles away for ${d} damage and pushes the tiles next to it. Calls 2 hatchlings each turn.`,
    ops: (_b, _u, t, _l, d) => [{ h: t.hit, dmg: d }, ...ring6(t.hit)],
  },
];

export const WEAPONS: Record<string, WeaponDef> = Object.fromEntries(W.map((w) => [w.id, w]));

/** Weapons the hangar can sell. */
export const SHOP_WEAPONS = W.filter((w) => !w.enemy).map((w) => w.id);

export const weaponDmg = (w: WeaponDef, lvl: number, bonus: number): number => (w.dmg(lvl) > 0 ? w.dmg(lvl) + bonus : 0);

export const weaponText = (id: string, lvl: number, bonus = 0): string => {
  const w = WEAPONS[id];
  return w.text(lvl, weaponDmg(w, lvl, bonus));
};

/** First blocked tile along dir, or the last board tile when nothing blocks. Returns its distance. */
function firstHit(b: Battle, from: Hex, dir: number): number {
  let k = 1;
  for (; ; k++) {
    const h = step(from, dir, k);
    if (!onBoard(h)) return k - 1;
    if (blocked(b, h)) return k;
  }
}

/** All tiles the player can aim at. Several clicked tiles can map to the same shot. */
export function aims(b: Battle, u: Unit, w: WeaponDef, lvl: number): Target[] {
  const p = pos(u);
  const out: Target[] = [];
  switch (w.aim) {
    case 'melee':
      for (let d = 0; d < 6; d++) {
        const h = step(p, d);
        if (onBoard(h)) out.push({ h, hit: h, dir: d, dist: 1 });
      }
      break;
    case 'proj':
      for (let d = 0; d < 6; d++) {
        const f = firstHit(b, p, d);
        const hit = step(p, d, f);
        for (let k = 1; k <= f; k++) out.push({ h: step(p, d, k), hit, dir: d, dist: f });
      }
      break;
    case 'art':
      for (let d = 0; d < 6; d++) {
        for (let k = 2; k <= 2 * R; k++) {
          const h = step(p, d, k);
          if (onBoard(h)) out.push({ h, hit: h, dir: d, dist: k });
        }
      }
      break;
    case 'self':
      out.push({ h: p, hit: p, dir: 0, dist: 0 });
      break;
    case 'line': {
      const n = w.range!(lvl);
      for (let d = 0; d < 6; d++) {
        for (let k = 1; k <= n; k++) {
          const h = step(p, d, k);
          if (onBoard(h)) out.push({ h, hit: h, dir: d, dist: k });
        }
      }
      break;
    }
    case 'charge':
      for (let d = 0; d < 6; d++) {
        let k = 1;
        let hitK = 0;
        for (; ; k++) {
          const h = step(p, d, k);
          if (!onBoard(h)) break;
          if (blocked(b, h)) {
            hitK = k;
            break;
          }
          const t = tileAt(b, h)!;
          if ((t.t === 'water' || t.t === 'chasm') && !u.flying) break;
        }
        const landK = hitK ? hitK - 1 : k - 1;
        if (!hitK && landK === 0) continue;
        const land = step(p, d, landK);
        const last = hitK ? hitK : landK;
        for (let i = 1; i <= last; i++) {
          out.push({ h: step(p, d, i), hit: hitK ? step(p, d, hitK) : land, dir: d, dist: hitK, land: landK ? land : undefined });
        }
      }
      break;
    case 'tele': {
      const n = w.range!(lvl);
      for (const h of HEXES) {
        const k = dist(p, h);
        if (k < 1 || k > n) continue;
        const t = tileAt(b, h)!;
        if (isSolid(t) || (t.t === 'chasm' && !u.flying)) continue;
        out.push({ h, hit: h, dir: dirTo(p, h), dist: k });
      }
      break;
    }
  }
  return out;
}

/** The current target of a stored intent. It follows the enemy when the enemy is pushed. */
export function intentTarget(b: Battle, u: Unit): Target | null {
  if (!u.intent) return null;
  const w = WEAPONS[u.weapons[0].id];
  const p = pos(u);
  const { dir } = u.intent;
  let k = u.intent.dist;
  if (w.aim === 'proj') k = firstHit(b, p, dir);
  if (k < 1) return null;
  const hit = step(p, dir, k);
  if (!onBoard(hit)) return null;
  return { h: hit, hit, dir, dist: k };
}

export function opsOf(b: Battle, u: Unit, slot: number, t: Target): Op[] {
  const { id, lvl } = u.weapons[slot];
  const w = WEAPONS[id];
  return w.ops(b, u, t, lvl, weaponDmg(w, lvl, u.bonus));
}

/** Use a weapon. Mutates the battle. */
export function fire(b: Battle, u: Unit, slot: number, t: Target): void {
  const { id, lvl } = u.weapons[slot];
  const w = WEAPONS[id];
  b.actor = u.id;
  w.pre?.(b, u, t, lvl);
  if (b.over && b.over === 'lose') return;
  const dmg = weaponDmg(w, lvl, u.bonus);
  for (const op of w.ops(b, u, t, lvl, dmg)) {
    if (op.shield) shield(b, op.h, op.friendOnly);
    if (op.mend) {
      const m = unitAt(b, op.h);
      if (m?.side === 'mech' && m.hp < m.max) heal(b, m, 1);
    }
    if (op.smoke) smoke(b, op.h);
    if (op.dmg) damage(b, op.h, op.dmg, { spareBuildings: op.spare });
    if (op.ignite) ignite(b, op.h);
    if (op.push !== undefined) push(b, op.h, op.push);
    if (op.pull) slide(b, op.h, op.pull.dir, op.pull.n);
  }
}

export const repairAmount = (u: Unit): number => (u.perks.includes('medic') ? 3 : 1);

export function repair(b: Battle, u: Unit): void {
  heal(b, u, repairAmount(u));
}

export const arrow = (d: number): string => ARROWS[d];
