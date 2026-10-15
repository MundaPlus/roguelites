import type { Game } from './game';
import type { Stats } from './types';
import { WEAPONS, WEAPON_IDS, type WeaponId } from './weapons';

export type PassiveId =
  | 'might'
  | 'vitality'
  | 'haste'
  | 'focus'
  | 'reach'
  | 'echo'
  | 'magnet'
  | 'regen'
  | 'armor'
  | 'growth'
  | 'persistence';

export interface PassiveDef {
  id: PassiveId;
  name: string;
  icon: string;
  maxLevel: number;
  desc: string;
  apply(s: Stats, level: number): void;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  might: { id: 'might', name: 'Ember Heart', icon: '❤️‍🔥', maxLevel: 5, desc: '+10% damage.', apply: (s, l) => (s.might += 0.1 * l) },
  vitality: { id: 'vitality', name: 'Iron Flask', icon: '🧪', maxLevel: 5, desc: '+20 max HP.', apply: (s, l) => (s.maxHp += 20 * l) },
  haste: { id: 'haste', name: 'Swift Boots', icon: '👢', maxLevel: 5, desc: '+8% move speed.', apply: (s, l) => (s.speed *= 1 + 0.08 * l) },
  focus: { id: 'focus', name: 'Hourglass', icon: '⏳', maxLevel: 5, desc: '-7% weapon cooldown.', apply: (s, l) => (s.cooldown *= 1 - 0.07 * l) },
  reach: { id: 'reach', name: 'Wide Lens', icon: '🔍', maxLevel: 5, desc: '+10% weapon area.', apply: (s, l) => (s.area += 0.1 * l) },
  echo: { id: 'echo', name: 'Twin Sigil', icon: '♊', maxLevel: 2, desc: '+1 projectile for every weapon.', apply: (s, l) => (s.amount += l) },
  magnet: { id: 'magnet', name: 'Lodestone', icon: '🧲', maxLevel: 5, desc: '+35% pickup range.', apply: (s, l) => (s.magnet *= 1 + 0.35 * l) },
  regen: { id: 'regen', name: 'Phoenix Feather', icon: '🪶', maxLevel: 5, desc: '+0.3 HP per second.', apply: (s, l) => (s.regen += 0.3 * l) },
  armor: { id: 'armor', name: 'Ash Plate', icon: '🛡️', maxLevel: 5, desc: '-1 damage from every hit.', apply: (s, l) => (s.armor += l) },
  growth: { id: 'growth', name: 'Ember Crown', icon: '👑', maxLevel: 5, desc: '+8% experience.', apply: (s, l) => (s.growth += 0.08 * l) },
  persistence: { id: 'persistence', name: 'Long Candle', icon: '🕯️', maxLevel: 5, desc: '+15% effect duration.', apply: (s, l) => (s.duration += 0.15 * l) },
};
export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

export const MAX_WEAPONS = 5;
export const MAX_PASSIVES = 5;

export type Choice =
  | { kind: 'weapon'; id: WeaponId; level: number }
  | { kind: 'passive'; id: PassiveId; level: number }
  | { kind: 'evolve'; id: WeaponId }
  | { kind: 'gold' }
  | { kind: 'heal' };

const key = (c: Choice): string => c.kind + ':' + ('id' in c ? c.id : '');

export function evolutions(g: Game): Choice[] {
  return g.weapons
    .filter((w) => !w.evolved && w.level >= WEAPONS[w.id].maxLevel && g.passives.has(WEAPONS[w.id].evolveWith))
    .map((w) => ({ kind: 'evolve', id: w.id }));
}

export function ownedUpgrades(g: Game): Choice[] {
  const out: Choice[] = [];
  for (const w of g.weapons) {
    if (w.level < WEAPONS[w.id].maxLevel) out.push({ kind: 'weapon', id: w.id, level: w.level + 1 });
  }
  for (const [id, lvl] of g.passives) {
    if (lvl < PASSIVES[id].maxLevel) out.push({ kind: 'passive', id, level: lvl + 1 });
  }
  return out;
}

function newItems(g: Game): Choice[] {
  const out: Choice[] = [];
  if (g.weapons.length < MAX_WEAPONS) {
    for (const id of WEAPON_IDS) {
      if (!g.weapons.some((w) => w.id === id)) out.push({ kind: 'weapon', id, level: 1 });
    }
  }
  if (g.passives.size < MAX_PASSIVES) {
    for (const id of PASSIVE_IDS) {
      if (!g.passives.has(id)) out.push({ kind: 'passive', id, level: 1 });
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Evolutions always come first. Owned items appear twice in the pool, so builds focus. */
export function rollChoices(g: Game, n = 3): Choice[] {
  const owned = ownedUpgrades(g);
  const pool = shuffle([...owned, ...owned, ...newItems(g)]);
  const out: Choice[] = evolutions(g).slice(0, n);
  for (const c of pool) {
    if (out.length >= n) break;
    if (!out.some((o) => key(o) === key(c))) out.push(c);
  }
  if (!out.length) out.push({ kind: 'gold' }, { kind: 'heal' });
  return out;
}
