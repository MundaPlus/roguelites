import { HEXES, idx, onBoard, step, type Hex } from './hex';

export type Terrain = 'ground' | 'forest' | 'water' | 'chasm' | 'mountain' | 'building';

export interface Tile {
  t: Terrain;
  hp: number;
  max: number;
  fire: boolean;
  smoke: boolean;
  shield: boolean;
  rubble: boolean;
  reactor: boolean;
  spire: boolean;
}

export type Side = 'mech' | 'enemy';

/** A planned enemy attack. It is stored relative to the enemy, so it moves when the enemy moves. */
/** A tile where an enemy emerges at the end of the round. `kind` is fixed for boss broods. */
export interface Spawn extends Hex {
  kind?: string;
}

export interface Intent {
  dir: number;
  dist: number;
  order: number;
}

export interface Unit {
  id: number;
  side: Side;
  /** Mech frame id or enemy id. */
  kind: string;
  q: number;
  r: number;
  hp: number;
  max: number;
  move: number;
  flying: boolean;
  jump: boolean;
  stable: boolean;
  boss: boolean;
  alpha: boolean;
  burning: boolean;
  shield: boolean;
  /** Squad slot for mechs, -1 for enemies. */
  slot: number;
  moved: boolean;
  acted: boolean;
  /** Weapons as { id, lvl }. Enemies have one. */
  weapons: { id: string; lvl: number }[];
  /** Extra damage for weapons that deal damage (alpha enemies, the Gunner perk). */
  bonus: number;
  perks: string[];
  intent: Intent | null;
}

export type FxKind = 'dmg' | 'push' | 'bump' | 'die' | 'drown' | 'fall' | 'fire' | 'smoke' | 'shield' | 'break' | 'heal' | 'spawn' | 'block' | 'cancel';

export interface Fx {
  kind: FxKind;
  h: Hex;
  n?: number;
}

export interface Stats {
  kills: number;
  blocked: number;
  mechDmg: number;
  powerLost: number;
  bossKilled: boolean;
  /** Kills per squad slot. */
  xp: number[];
  /** Squad slots whose mech was destroyed. */
  lost: number[];
}

export type Goal = 'survive' | 'boss';

export interface Battle {
  tiles: Tile[];
  units: Unit[];
  turn: number;
  turns: number;
  power: number;
  /** Tiles where enemies emerge at the end of this round. */
  spawns: Spawn[];
  /** Spawn markers for each round, by round number. */
  spawnPlan: number[];
  nextId: number;
  /** RNG state, so the battle stays a plain value. */
  rs: number;
  stats: Stats;
  fx: Fx[];
  roster: [string, number][];
  alphaChance: number;
  goal: Goal;
  over: null | 'win' | 'lose';
  loseReason: string;
  /** Id of the unit that acts now, for kill credit. */
  actor: number;
}

// ---------- Basics ----------

export function rand(b: Battle): number {
  b.rs = (b.rs + 0x6d2b79f5) | 0;
  let t = b.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function clone(b: Battle): Battle {
  return {
    ...b,
    tiles: b.tiles.map((t) => ({ ...t })),
    units: b.units.map((u) => ({ ...u, weapons: u.weapons, perks: u.perks, intent: u.intent ? { ...u.intent } : null })),
    spawns: b.spawns.map((h) => ({ ...h })),
    stats: { ...b.stats, xp: [...b.stats.xp], lost: [...b.stats.lost] },
    fx: [],
  };
}

export const tileAt = (b: Battle, h: Hex): Tile | undefined => b.tiles[idx(h)];

export const unitAt = (b: Battle, h: Hex): Unit | undefined => b.units.find((u) => u.q === h.q && u.r === h.r);

export const unitById = (b: Battle, id: number): Unit | undefined => b.units.find((u) => u.id === id);

export const pos = (u: Unit): Hex => ({ q: u.q, r: u.r });

export const isSolid = (t: Tile): boolean => t.t === 'mountain' || t.t === 'building';

/** True when a unit or a solid tile stands on h. Off-board tiles are not blocked, they are just off-board. */
export function blocked(b: Battle, h: Hex): boolean {
  const t = tileAt(b, h);
  if (!t) return false;
  return isSolid(t) || !!unitAt(b, h);
}

export const mechs = (b: Battle): Unit[] => b.units.filter((u) => u.side === 'mech');
export const enemies = (b: Battle): Unit[] => b.units.filter((u) => u.side === 'enemy');

/** In smoke or (for mechs) in water, a unit cannot use weapons. The Steady perk ignores both. */
export function disarmed(b: Battle, u: Unit): boolean {
  if (u.perks.includes('steady')) return false;
  const t = tileAt(b, pos(u))!;
  if (t.smoke) return true;
  return u.side === 'mech' && t.t === 'water' && !u.flying;
}

function fx(b: Battle, kind: FxKind, h: Hex, n?: number): void {
  b.fx.push({ kind, h: { ...h }, n });
}

function checkLoss(b: Battle): void {
  if (b.over) return;
  if (b.power <= 0) {
    b.over = 'lose';
    b.loseReason = 'The power grid failed.';
  } else if (mechs(b).length === 0) {
    b.over = 'lose';
    b.loseReason = 'All mechs were destroyed.';
  }
}

// ---------- Effects ----------

export function kill(b: Battle, u: Unit, kind: FxKind = 'die'): void {
  b.units = b.units.filter((x) => x.id !== u.id);
  fx(b, kind, pos(u));
  if (u.side === 'enemy') {
    b.stats.kills++;
    const actor = unitById(b, b.actor);
    if (actor && actor.side === 'mech') b.stats.xp[actor.slot]++;
    if (u.boss) {
      b.stats.bossKilled = true;
      if (b.goal === 'boss' && !b.over) b.over = 'win';
    }
  } else {
    b.stats.lost.push(u.slot);
  }
  checkLoss(b);
}

function hurt(b: Battle, u: Unit, n: number): void {
  if (u.shield) {
    u.shield = false;
    fx(b, 'break', pos(u));
    return;
  }
  u.hp -= n;
  fx(b, 'dmg', pos(u), n);
  if (u.side === 'mech') b.stats.mechDmg += n;
  if (u.hp <= 0) kill(b, u);
}

/** Set a tile on fire. Water, chasms, mountains and buildings do not burn. */
export function ignite(b: Battle, h: Hex): void {
  const t = tileAt(b, h);
  if (!t || t.t === 'water' || t.t === 'chasm' || isSolid(t)) return;
  t.fire = true;
  t.smoke = false;
  if (t.t === 'forest') t.t = 'ground';
  fx(b, 'fire', h);
  const u = unitAt(b, h);
  if (u && !u.perks.includes('steady')) u.burning = true;
}

export function damage(b: Battle, h: Hex, n: number, o: { spareBuildings?: boolean } = {}): void {
  const t = tileAt(b, h);
  if (!t || n <= 0) return;
  const u = unitAt(b, h);
  if (u) {
    hurt(b, u, n);
  } else if (t.t === 'building') {
    if (o.spareBuildings) return;
    if (t.shield) {
      t.shield = false;
      fx(b, 'break', h);
      return;
    }
    // Each hit takes one block of a building, whatever the damage. One block is one grid power.
    const lost = 1;
    t.hp -= lost;
    b.power -= lost;
    b.stats.powerLost += lost;
    fx(b, 'dmg', h, lost);
    if (t.hp <= 0) {
      t.t = 'ground';
      t.rubble = true;
      if (t.spire && !b.over) {
        b.over = 'lose';
        b.loseReason = 'The Spire fell.';
      }
    }
    checkLoss(b);
    return;
  } else if (t.t === 'mountain') {
    t.hp -= 1;
    fx(b, 'dmg', h, 1);
    if (t.hp <= 0) {
      t.t = 'ground';
      t.rubble = true;
    }
    return;
  }
  // Damage sets a forest on fire, also under a unit.
  if (t.t === 'forest') ignite(b, h);
}

/** Apply the tile under a unit after it moved there. */
export function enterTile(b: Battle, u: Unit): void {
  const t = tileAt(b, pos(u))!;
  if (!u.flying) {
    if (t.t === 'chasm') {
      kill(b, u, 'fall');
      return;
    }
    if (t.t === 'water') {
      if (u.side === 'enemy' && !u.stable) {
        kill(b, u, 'drown');
        return;
      }
      u.burning = false;
    }
  }
  if (t.fire && !u.perks.includes('steady')) u.burning = true;
}

export function place(b: Battle, u: Unit, h: Hex): void {
  u.q = h.q;
  u.r = h.r;
  enterTile(b, u);
}

/** Push the unit on h one tile in dir. A blocked push bumps: both sides take 1 damage. */
export function push(b: Battle, h: Hex, dir: number): void {
  const u = unitAt(b, h);
  if (!u || u.stable) return;
  const to = step(h, dir);
  if (!onBoard(to)) return;
  if (blocked(b, to)) {
    fx(b, 'bump', h);
    damage(b, h, 1);
    damage(b, to, 1);
    return;
  }
  fx(b, 'push', to);
  place(b, u, to);
}

/** Slide the unit on h up to n tiles in dir. It stops before anything in the way, without damage. */
export function slide(b: Battle, h: Hex, dir: number, n: number): void {
  const u = unitAt(b, h);
  if (!u || u.stable) return;
  for (let i = 0; i < n; i++) {
    const to = step(pos(u), dir);
    if (!onBoard(to) || blocked(b, to)) break;
    fx(b, 'push', to);
    place(b, u, to);
    if (!b.units.includes(u)) break;
  }
}

export function smoke(b: Battle, h: Hex): void {
  const t = tileAt(b, h);
  if (!t || isSolid(t)) return;
  t.smoke = true;
  t.fire = false;
  fx(b, 'smoke', h);
}

export function shield(b: Battle, h: Hex, friendOnly = false): void {
  const t = tileAt(b, h);
  if (!t) return;
  const u = unitAt(b, h);
  if (u) {
    if (friendOnly && u.side !== 'mech') return;
    u.shield = true;
    fx(b, 'shield', h);
  } else if (t.t === 'building') {
    t.shield = true;
    fx(b, 'shield', h);
  }
}

export function heal(b: Battle, u: Unit, n: number): void {
  u.hp = Math.min(u.max, u.hp + n);
  u.burning = false;
  fx(b, 'heal', pos(u), n);
}

export function emptyTiles(b: Battle): Hex[] {
  return HEXES.filter((h) => {
    const t = tileAt(b, h)!;
    return (t.t === 'ground' || t.t === 'forest') && !unitAt(b, h);
  });
}

export { fx as addFx };
