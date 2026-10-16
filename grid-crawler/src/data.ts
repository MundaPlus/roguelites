/** Static game content: monsters, items, traps, classes. */

export type Spell = 'bolt' | 'heal' | 'slow' | 'blink' | 'summon' | 'fire';
export type OnHit = 'poison' | 'drain' | 'weaken' | 'slow';

export interface MonDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: [number, number];
  /** Base hit chance in percent. */
  acc: number;
  /** Evasion in percent, subtracted from the hit chance of the player. */
  def: number;
  armor: number;
  /** Energy per tick. 100 = normal, 200 = two moves per player turn, 50 = one move per two turns. */
  speed: number;
  /** Energy cost of a melee attack (default 100). */
  atkCost?: number;
  xp: number;
  depth: [number, number];
  /** Spawn weight inside the depth range. */
  freq: number;
  /** Flee when HP falls below this share of max HP. */
  fleeAt?: number;
  pack?: [number, number];
  /** Ranged attack: keeps its distance and shoots. */
  ranged?: { range: number; dmg: [number, number]; verb: string; color: string };
  spells?: Spell[];
  onHit?: OnHit;
  erratic?: boolean;
  regen?: boolean;
  stationary?: boolean;
  boss?: boolean;
  /** Short rule text for the help and the inspect panel. */
  note: string;
}

const M = (d: MonDef): MonDef => d;

export const MONSTERS: Record<string, MonDef> = Object.fromEntries(
  [
    M({ id: 'rat', name: 'Rat', icon: '🐀', hp: 6, atk: [1, 3], acc: 70, def: 0, armor: 0, speed: 100, xp: 2, depth: [1, 3], freq: 10, note: 'Weak. Wanders the halls.' }),
    M({ id: 'kobold', name: 'Kobold', icon: '🦎', hp: 7, atk: [1, 4], acc: 70, def: 5, armor: 0, speed: 100, xp: 3, depth: [1, 4], freq: 10, fleeAt: 0.3, note: 'Runs away when hurt.' }),
    M({ id: 'jackal', name: 'Jackal', icon: '🐕', hp: 8, atk: [2, 3], acc: 70, def: 10, armor: 0, speed: 200, atkCost: 200, xp: 3, depth: [1, 4], freq: 8, pack: [2, 4], note: 'Fast pack. Moves twice per turn and surrounds you.' }),
    M({ id: 'goblin', name: 'Goblin', icon: '👺', hp: 15, atk: [2, 5], acc: 75, def: 10, armor: 0, speed: 100, xp: 6, depth: [2, 6], freq: 9, fleeAt: 0.2, note: 'Hunts you down. Flees when nearly dead.' }),
    M({ id: 'archer', name: 'Goblin Archer', icon: '🏹', hp: 10, atk: [1, 3], acc: 70, def: 10, armor: 0, speed: 100, xp: 6, depth: [2, 7], freq: 7, ranged: { range: 6, dmg: [2, 4], verb: 'shoots an arrow at', color: '#e9c46a' }, note: 'Keeps its distance and shoots arrows.' }),
    M({ id: 'bat', name: 'Bat', icon: '🦇', hp: 9, atk: [1, 3], acc: 75, def: 25, armor: 0, speed: 200, xp: 4, depth: [2, 6], freq: 7, erratic: true, note: 'Fast and erratic. Hard to hit.' }),
    M({ id: 'shaman', name: 'Goblin Shaman', icon: '🧙', hp: 11, atk: [1, 3], acc: 70, def: 10, armor: 0, speed: 100, xp: 8, depth: [3, 7], freq: 6, spells: ['heal', 'bolt'], fleeAt: 0.3, note: 'Caster. Heals its allies and casts lightning.' }),
    M({ id: 'snake', name: 'Pit Viper', icon: '🐍', hp: 12, atk: [1, 3], acc: 80, def: 15, armor: 0, speed: 100, xp: 6, depth: [3, 6], freq: 6, onHit: 'poison', note: 'Its bite poisons you.' }),
    M({ id: 'centipede', name: 'Centipede', icon: '🐛', hp: 20, atk: [2, 4], acc: 80, def: 5, armor: 1, speed: 50, xp: 9, depth: [4, 8], freq: 5, onHit: 'weaken', note: 'Slow. Its bite makes you weak.' }),
    M({ id: 'spider', name: 'Giant Spider', icon: '🕷️', hp: 18, atk: [3, 5], acc: 80, def: 15, armor: 1, speed: 100, xp: 12, depth: [4, 9], freq: 6, onHit: 'poison', note: 'Strong poison bite.' }),
    M({ id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 22, atk: [3, 7], acc: 80, def: 5, armor: 2, speed: 100, xp: 12, depth: [4, 9], freq: 7, note: 'Tough and tireless.' }),
    M({ id: 'zombie', name: 'Zombie', icon: '🧟', hp: 45, atk: [5, 9], acc: 75, def: 0, armor: 1, speed: 50, xp: 16, depth: [5, 9], freq: 5, note: 'Very slow but very tough. Walk away from it.' }),
    M({ id: 'orc', name: 'Orc', icon: '🐗', hp: 28, atk: [4, 8], acc: 80, def: 10, armor: 2, speed: 100, xp: 16, depth: [5, 10], freq: 7, pack: [2, 3], fleeAt: 0.15, note: 'Fights in groups.' }),
    M({ id: 'imp', name: 'Fire Imp', icon: '😈', hp: 16, atk: [2, 5], acc: 80, def: 25, armor: 0, speed: 150, xp: 14, depth: [6, 10], freq: 5, ranged: { range: 5, dmg: [4, 7], verb: 'hurls fire at', color: '#ff7b00' }, fleeAt: 0.4, note: 'Quick. Throws fire and flees when hurt.' }),
    M({ id: 'ogre', name: 'Ogre', icon: '👹', hp: 55, atk: [9, 15], acc: 75, def: 0, armor: 1, speed: 100, atkCost: 200, xp: 25, depth: [6, 11], freq: 5, note: 'Hits very hard, but each swing takes two turns.' }),
    M({ id: 'wolf', name: 'Dire Wolf', icon: '🐺', hp: 22, atk: [4, 7], acc: 80, def: 15, armor: 1, speed: 200, atkCost: 200, xp: 14, depth: [6, 10], freq: 5, pack: [2, 4], note: 'Fast pack hunter.' }),
    M({ id: 'eye', name: 'Watching Eye', icon: '👁️', hp: 24, atk: [1, 2], acc: 60, def: 0, armor: 0, speed: 100, xp: 15, depth: [6, 11], freq: 4, stationary: true, spells: ['slow', 'bolt'], note: 'Does not move. Its gaze slows you.' }),
    M({ id: 'wraith', name: 'Wraith', icon: '👻', hp: 34, atk: [5, 9], acc: 85, def: 20, armor: 0, speed: 100, xp: 22, depth: [7, 12], freq: 5, onHit: 'drain', note: 'Drains your life to heal itself.' }),
    M({ id: 'mage', name: 'Dark Mage', icon: '🧝', hp: 24, atk: [2, 4], acc: 75, def: 15, armor: 0, speed: 100, xp: 22, depth: [7, 12], freq: 5, spells: ['slow', 'blink', 'bolt'], note: 'Caster. Slows you, blinks away, casts lightning.' }),
    M({ id: 'troll', name: 'Troll', icon: '🧌', hp: 65, atk: [8, 14], acc: 85, def: 10, armor: 3, speed: 100, xp: 35, depth: [8, 12], freq: 5, regen: true, note: 'Regenerates fast. Finish it quickly.' }),
    M({ id: 'golem', name: 'Stone Golem', icon: '🗿', hp: 100, atk: [8, 14], acc: 80, def: 0, armor: 6, speed: 100, atkCost: 150, xp: 40, depth: [9, 12], freq: 3, note: 'Thick stone armor. Slow swings.' }),
    M({ id: 'lich', name: 'Lich', icon: '☠️', hp: 45, atk: [3, 6], acc: 80, def: 15, armor: 2, speed: 100, xp: 45, depth: [10, 12], freq: 3, spells: ['summon', 'bolt', 'blink'], note: 'Caster. Raises skeletons and casts lightning.' }),
    M({ id: 'vampire', name: 'Vampire', icon: '🧛', hp: 55, atk: [6, 11], acc: 85, def: 20, armor: 2, speed: 100, xp: 40, depth: [10, 12], freq: 4, onHit: 'drain', fleeAt: 0.2, note: 'Drains life. Flees to heal.' }),
    M({ id: 'dragon', name: 'Ancient Dragon', icon: '🐉', hp: 200, atk: [10, 18], acc: 85, def: 5, armor: 5, speed: 100, xp: 200, depth: [99, 99], freq: 0, boss: true, spells: ['fire'], note: 'Guards the Amulet on floor 12. Breathes fire.' }),
  ].map((m) => [m.id, m]),
);

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  dmg: [number, number];
  acc: number;
  str: number;
  /** dagger: triple damage on unaware foes; axe: hits all adjacent; spear: hits the foe behind. */
  trait?: 'sneak' | 'sweep' | 'pierce';
  depth: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  dagger: { id: 'dagger', name: 'Dagger', icon: '🔪', dmg: [2, 4], acc: 10, str: 1, trait: 'sneak', depth: 1 },
  sword: { id: 'sword', name: 'Short Sword', icon: '🗡️', dmg: [2, 6], acc: 5, str: 3, depth: 1 },
  mace: { id: 'mace', name: 'Mace', icon: '🔨', dmg: [3, 8], acc: 0, str: 4, depth: 2 },
  axe: { id: 'axe', name: 'Axe', icon: '🪓', dmg: [3, 8], acc: 0, str: 5, trait: 'sweep', depth: 3 },
  spear: { id: 'spear', name: 'Spear', icon: '🔱', dmg: [3, 9], acc: 0, str: 5, trait: 'pierce', depth: 3 },
  hammer: { id: 'hammer', name: 'War Hammer', icon: '⚒️', dmg: [5, 13], acc: -5, str: 7, depth: 5 },
  greatsword: { id: 'greatsword', name: 'Greatsword', icon: '⚔️', dmg: [7, 15], acc: -5, str: 8, depth: 7 },
};

export interface ArmorDef {
  id: string;
  name: string;
  icon: string;
  armor: number;
  str: number;
  depth: number;
}

export const ARMORS: Record<string, ArmorDef> = {
  leather: { id: 'leather', name: 'Leather Armor', icon: '🧥', armor: 1, str: 1, depth: 1 },
  studded: { id: 'studded', name: 'Studded Leather', icon: '🦺', armor: 2, str: 3, depth: 2 },
  ring: { id: 'ring', name: 'Ring Mail', icon: '👘', armor: 3, str: 4, depth: 3 },
  chain: { id: 'chain', name: 'Chain Mail', icon: '🥋', armor: 4, str: 5, depth: 4 },
  banded: { id: 'banded', name: 'Banded Mail', icon: '🛡️', armor: 5, str: 6, depth: 6 },
  plate: { id: 'plate', name: 'Plate Armor', icon: '🪖', armor: 7, str: 8, depth: 8 },
};

export interface MagicDef {
  id: string;
  name: string;
  desc: string;
  freq: number;
  /** Bad items hurt you. The bot avoids them once known. */
  bad?: boolean;
}

export const POTIONS: Record<string, MagicDef> = {
  heal: { id: 'heal', name: 'Healing', desc: 'Heals half of your HP and cures poison.', freq: 30 },
  extra: { id: 'extra', name: 'Extra Healing', desc: 'Heals all HP and raises max HP by 3.', freq: 10 },
  strength: { id: 'strength', name: 'Strength', desc: 'Strength +1 for good.', freq: 8 },
  life: { id: 'life', name: 'Life', desc: 'Max HP +8 and full heal.', freq: 4 },
  speed: { id: 'speed', name: 'Speed', desc: 'You act twice per turn for 25 turns.', freq: 10 },
  telepathy: { id: 'telepathy', name: 'Telepathy', desc: 'Shows all monsters on the floor.', freq: 10 },
  descent: { id: 'descent', name: 'Descent', desc: 'You sink through the floor to the next level.', freq: 7 },
  confusion: { id: 'confusion', name: 'Confusion', desc: 'You stumble in random directions for a while.', freq: 9, bad: true },
  poison: { id: 'poison', name: 'Poison', desc: 'Poisons you for 10 turns.', freq: 9, bad: true },
};

export const SCROLLS: Record<string, MagicDef> = {
  identify: { id: 'identify', name: 'Identify', desc: 'Identifies an unknown item kind in your pack.', freq: 25 },
  enchantW: { id: 'enchantW', name: 'Enchant Weapon', desc: 'Your weapon gets +1.', freq: 14 },
  enchantA: { id: 'enchantA', name: 'Enchant Armor', desc: 'Your armor gets +1.', freq: 14 },
  teleport: { id: 'teleport', name: 'Teleportation', desc: 'Moves you to a random spot on the floor.', freq: 10 },
  mapping: { id: 'mapping', name: 'Magic Mapping', desc: 'Shows the map of the floor and its traps.', freq: 10 },
  fear: { id: 'fear', name: 'Fear', desc: 'Monsters in view flee for 15 turns.', freq: 9 },
  aggravate: { id: 'aggravate', name: 'Aggravate', desc: 'Wakes every monster on the floor.', freq: 7, bad: true },
  summon: { id: 'summon', name: 'Summon Monster', desc: 'Calls monsters next to you.', freq: 6, bad: true },
};

export const WANDS: Record<string, MagicDef & { charges: [number, number] }> = {
  fire: { id: 'fire', name: 'Firebolt', desc: 'A bolt of fire hits the first monster in line.', freq: 10, charges: [3, 5] },
  lightning: { id: 'lightning', name: 'Lightning', desc: 'Lightning hits every monster in a line.', freq: 8, charges: [3, 5] },
  slow: { id: 'slow', name: 'Slowness', desc: 'The target moves at half speed for 30 turns.', freq: 8, charges: [3, 6] },
  sleep: { id: 'sleep', name: 'Sleep', desc: 'The target falls asleep.', freq: 8, charges: [3, 6] },
  banish: { id: 'banish', name: 'Teleport Other', desc: 'Sends the target to a random spot on the floor.', freq: 6, charges: [2, 4] },
};

export const POTION_COLORS: [string, string][] = [
  ['crimson', '#e63946'],
  ['azure', '#4cc9f0'],
  ['emerald', '#2ec27e'],
  ['amber', '#f4a261'],
  ['violet', '#9d4edd'],
  ['murky', '#7f6a4f'],
  ['pink', '#ff70a6'],
  ['silver', '#ced4da'],
  ['inky', '#3a3a5a'],
  ['golden', '#ffd166'],
];

export const WAND_WOODS = ['oak', 'bone', 'iron', 'glass', 'ebony', 'copper', 'willow'];

export const SYLLABLES = ['zun', 'xal', 'bek', 'mor', 'tha', 'quo', 'vel', 'ish', 'rak', 'nim', 'oth', 'pra', 'lux', 'dor', 'fen', 'gri'];

export type TrapKind = 'dart' | 'alarm' | 'teleport' | 'pit' | 'fire';

export const TRAPS: Record<TrapKind, { name: string; icon: string; desc: string; depth: number }> = {
  dart: { name: 'Poison Dart', icon: '🎯', desc: 'Shoots a poison dart.', depth: 1 },
  alarm: { name: 'Alarm', icon: '🔔', desc: 'Wakes the monsters on the floor.', depth: 1 },
  teleport: { name: 'Teleport', icon: '🌀', desc: 'Sends you to a random spot.', depth: 2 },
  pit: { name: 'Trap Door', icon: '🕳️', desc: 'You fall to the next floor.', depth: 3 },
  fire: { name: 'Fire', icon: '🔥', desc: 'A burst of flame burns you.', depth: 4 },
};

export interface ClassDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  str: number;
  agi: number;
  wits: number;
  weapon: string;
  weaponPlus: number;
  armor: string;
  /** Starting pack: [kind, id, count]. */
  kit: [string, string, number][];
  /** Item kinds known from the start. */
  knows: string[];
  cost: number;
  desc: string;
}

export const CLASSES: ClassDef[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    icon: '🛡️',
    hp: 32,
    str: 6,
    agi: 4,
    wits: 2,
    weapon: 'sword',
    weaponPlus: 1,
    armor: 'ring',
    kit: [['potion', 'heal', 2]],
    knows: ['potion:heal'],
    cost: 0,
    desc: 'Strong and well armored. Starts with 2 healing potions.',
  },
  {
    id: 'rogue',
    name: 'Rogue',
    icon: '🗡️',
    hp: 26,
    str: 4,
    agi: 6,
    wits: 4,
    weapon: 'dagger',
    weaponPlus: 1,
    armor: 'leather',
    kit: [
      ['potion', 'heal', 1],
      ['scroll', 'teleport', 1],
    ],
    knows: ['potion:heal', 'potion:poison', 'potion:confusion', 'scroll:teleport'],
    cost: 40,
    desc: 'Quick and sneaky. Triple damage on unaware foes. Knows bad potions.',
  },
  {
    id: 'mage',
    name: 'Mage',
    icon: '🔮',
    hp: 22,
    str: 3,
    agi: 5,
    wits: 8,
    weapon: 'dagger',
    weaponPlus: 0,
    armor: 'leather',
    kit: [
      ['wand', 'fire', 1],
      ['wand', 'slow', 1],
      ['scroll', 'identify', 1],
    ],
    knows: ['wand:fire', 'wand:lightning', 'wand:slow', 'wand:sleep', 'wand:banish', 'scroll:identify'],
    cost: 80,
    desc: 'Frail but clever. Knows all wands and makes them stronger.',
  },
  {
    id: 'paladin',
    name: 'Paladin',
    icon: '⚜️',
    hp: 30,
    str: 6,
    agi: 2,
    wits: 3,
    weapon: 'mace',
    weaponPlus: 0,
    armor: 'chain',
    kit: [
      ['potion', 'heal', 1],
      ['potion', 'extra', 1],
    ],
    knows: ['potion:heal', 'potion:extra'],
    cost: 150,
    desc: 'Heavy armor. Heals 50% faster than the others.',
  },
];

/** XP needed to reach level n+1 from level n (index = current level). */
export const XP_TABLE = [0, 10, 25, 50, 90, 150, 230, 340, 480, 660, 880, 1150, 1500, 1950, 2500, 3200];

export const FLOORS = 12;
