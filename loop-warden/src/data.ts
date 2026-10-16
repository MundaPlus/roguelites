/** Static game data: maps, tiles, enemies, classes, items and camp buildings. */

export const W = 13;
export const H = 9;

/** Loop layouts. `C` is the camp, `#` is road. Each road cell has exactly two road neighbors. */
export const MAPS: string[][] = [
  [
    '.............',
    '.C#######....',
    '.#......#....',
    '.#......###..',
    '.#........#..',
    '.###......#..',
    '...#......#..',
    '...########..',
    '.............',
  ],
  [
    '.............',
    '...C#####....',
    '...#....#....',
    '.###....####.',
    '.#.........#.',
    '.###.......#.',
    '...#....####.',
    '...######....',
    '.............',
  ],
  [
    '.............',
    '.C######.....',
    '.#.....#.....',
    '.#.....####..',
    '.#........#..',
    '.#..####..#..',
    '.#..#..#..#..',
    '.####..####..',
    '.............',
  ],
  [
    '.............',
    '..C########..',
    '..#.......#..',
    '..#..###..#..',
    '..####.#..#..',
    '.......#..#..',
    '..######..#..',
    '..#.......#..',
    '..#########..',
  ],
];

export type ResKey = 'wood' | 'stone' | 'food' | 'metal';
export type Res = Record<ResKey, number>;
export const RES_KEYS: ResKey[] = ['wood', 'stone', 'food', 'metal'];
export const RES_ICON: Record<ResKey, string> = { wood: '🪵', stone: '🪨', food: '🍖', metal: '⚙️' };
export const zeroRes = (): Res => ({ wood: 0, stone: 0, food: 0, metal: 0 });

/** Where a card may go. `side`: any empty non-road cell. `roadside`: empty non-road cell next to the road. `tile`: on a placed tile. */
export type Place = 'road' | 'side' | 'roadside' | 'tile';

export interface TileDef {
  id: string;
  name: string;
  icon: string;
  place: Place;
  /** Boss meter points when placed. */
  meter: number;
  desc: string;
  color: string;
  spawn?: { enemy: string; every: number; max: number };
  /** Resource yield: `n` of `res` every `every` days. */
  yieldRes?: { res: ResKey; every: number };
  /** Camp building that unlocks the card. Missing = always unlocked. */
  unlock?: string;
}

export const TILES: Record<string, TileDef> = {
  graveyard: {
    id: 'graveyard',
    name: 'Graveyard',
    icon: '🪦',
    place: 'road',
    meter: 5,
    color: '#4a4e69',
    desc: 'Road. Raises a Skeleton every 3 days (max 2).',
    spawn: { enemy: 'skeleton', every: 3, max: 2 },
    yieldRes: { res: 'metal', every: 4 },
  },
  grove: {
    id: 'grove',
    name: 'Grove',
    icon: '🌳',
    place: 'road',
    meter: 4,
    color: '#386641',
    desc: 'Road. A Ratwolf every 2 days (max 2). +1 🪵 every 2 days.',
    spawn: { enemy: 'ratwolf', every: 2, max: 2 },
    yieldRes: { res: 'wood', every: 2 },
  },
  cocoon: {
    id: 'cocoon',
    name: 'Spider Cocoon',
    icon: '🕸️',
    place: 'road',
    meter: 3,
    color: '#6c757d',
    desc: 'Road. A Spider every day (max 3).',
    spawn: { enemy: 'spider', every: 1, max: 3 },
  },
  mansion: {
    id: 'mansion',
    name: 'Vampire Mansion',
    icon: '🏚️',
    place: 'roadside',
    meter: 6,
    color: '#6a040f',
    desc: 'Next to road. A Vampire every 3 days (max 2). +1 ⚙️ every 3 days. Ruins a Village next to it.',
    spawn: { enemy: 'vampire', every: 3, max: 2 },
    yieldRes: { res: 'metal', every: 3 },
    unlock: 'crypt',
  },
  meadow: {
    id: 'meadow',
    name: 'Meadow',
    icon: '🌼',
    place: 'side',
    meter: 1,
    color: '#7cb518',
    desc: 'Heals 2 HP each day. Blooms (heals 5) next to any other tile. +1 🍖 every 3 days.',
    yieldRes: { res: 'food', every: 3 },
  },
  mountain: {
    id: 'mountain',
    name: 'Mountain',
    icon: '⛰️',
    place: 'side',
    meter: 2,
    color: '#7f6a55',
    desc: '+6 max HP, +2 per mountain next to it. 9 linked mountains make a Peak (+50%, Harpies). +1 🪨 every 3 days.',
    yieldRes: { res: 'stone', every: 3 },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    icon: '🌲',
    place: 'side',
    meter: 2,
    color: '#2d6a4f',
    desc: '+5% attack speed. A Thicket (2+ forests next to it) gives +8%. +1 🪵 every 4 days.',
    yieldRes: { res: 'wood', every: 4 },
  },
  village: {
    id: 'village',
    name: 'Village',
    icon: '🏘️',
    place: 'roadside',
    meter: 2,
    color: '#bc6c25',
    desc: 'Next to road. Heals 8 + 2×loop when you pass. +1 🍖 every 2 days. Next to a Mansion it turns into a Ghoul nest.',
    yieldRes: { res: 'food', every: 2 },
    unlock: 'farm',
  },
  lantern: {
    id: 'lantern',
    name: 'Lantern',
    icon: '🏮',
    place: 'side',
    meter: 1,
    color: '#e09f3e',
    desc: 'Road cells within 2 spawn 50% less. Stacks.',
    unlock: 'lamplighter',
  },
  beacon: {
    id: 'beacon',
    name: 'Beacon',
    icon: '🗼',
    place: 'roadside',
    meter: 2,
    color: '#48cae4',
    desc: 'Next to road. You walk 60% faster within 2 cells and hit 10% faster there.',
    unlock: 'lighthouse',
  },
  oblivion: {
    id: 'oblivion',
    name: 'Oblivion',
    icon: '🕳️',
    place: 'tile',
    meter: 0,
    color: '#240046',
    desc: 'Removes a placed tile and the enemies on it.',
  },
};

export const CARD_IDS = Object.keys(TILES);

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  /** Attacks per second. */
  spd: number;
  def: number;
  eva: number;
  vamp: number;
  boss?: boolean;
}

export const ENEMIES: Record<string, EnemyDef> = {
  slime: { id: 'slime', name: 'Slime', icon: '🟢', hp: 12, atk: 3, spd: 0.8, def: 0, eva: 0, vamp: 0 },
  spider: { id: 'spider', name: 'Spider', icon: '🕷️', hp: 7, atk: 2, spd: 1.4, def: 0, eva: 0.05, vamp: 0 },
  ratwolf: { id: 'ratwolf', name: 'Ratwolf', icon: '🐺', hp: 16, atk: 4, spd: 1.0, def: 0, eva: 0.05, vamp: 0 },
  skeleton: { id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 22, atk: 5, spd: 0.75, def: 1, eva: 0, vamp: 0 },
  vampire: { id: 'vampire', name: 'Vampire', icon: '🧛', hp: 26, atk: 5, spd: 0.9, def: 1, eva: 0.1, vamp: 0.3 },
  ghoul: { id: 'ghoul', name: 'Ghoul', icon: '🧟', hp: 32, atk: 6, spd: 0.7, def: 2, eva: 0, vamp: 0 },
  harpy: { id: 'harpy', name: 'Harpy', icon: '🦅', hp: 18, atk: 5, spd: 1.2, def: 0, eva: 0.3, vamp: 0 },
  lich: { id: 'lich', name: 'The Lich', icon: '🧙', hp: 420, atk: 14, spd: 0.75, def: 3, eva: 0.05, vamp: 0, boss: true },
};

export interface Stats {
  maxHp: number;
  dmg: number;
  def: number;
  /** Attacks per second. Items add a percent bonus instead. */
  spd: number;
  eva: number;
  vamp: number;
  crit: number;
}

export interface ClassDef {
  id: string;
  name: string;
  icon: string;
  /** Emoji drawn on the map. */
  hero: string;
  desc: string;
  base: Stats;
  /** Camp heal bonus as a share of max HP. */
  campHeal: number;
  unlock?: string;
}

export const CLASSES: Record<string, ClassDef> = {
  warrior: {
    id: 'warrior',
    name: 'Warrior',
    icon: '🛡️',
    hero: '🤺',
    desc: 'Sturdy. High HP and a little defense.',
    base: { maxHp: 110, dmg: 5, def: 1, spd: 0.9, eva: 0, vamp: 0, crit: 0.05 },
    campHeal: 0,
  },
  rogue: {
    id: 'rogue',
    name: 'Rogue',
    icon: '🗡️',
    hero: '🥷',
    desc: 'Fast. Strikes often and crits a lot, but has less HP.',
    base: { maxHp: 80, dmg: 4, def: 0, spd: 1.3, eva: 0.08, vamp: 0, crit: 0.2 },
    campHeal: 0,
    unlock: 'guild',
  },
  priest: {
    id: 'priest',
    name: 'Priest',
    icon: '✝️',
    hero: '🧝',
    desc: 'Drains life with each hit. The camp heals 15% more.',
    base: { maxHp: 95, dmg: 4, def: 0, spd: 0.95, eva: 0, vamp: 0.1, crit: 0.05 },
    campHeal: 0.15,
    unlock: 'chapel',
  },
};

export type Slot = 'weapon' | 'armor' | 'shield' | 'ring';
export const SLOTS: Slot[] = ['weapon', 'armor', 'shield', 'ring'];
export const SLOT_ICON: Record<Slot, string> = { weapon: '⚔️', armor: '🥋', shield: '🛡️', ring: '💍' };
export const SLOT_NAMES: Record<Slot, string[]> = {
  weapon: ['Blade', 'Axe', 'Mace', 'Spear', 'Saber'],
  armor: ['Vest', 'Mail', 'Plate', 'Cuirass', 'Robe'],
  shield: ['Buckler', 'Kite Shield', 'Tower Shield', 'Targe'],
  ring: ['Ring', 'Band', 'Loop', 'Signet'],
};

export const RARITY = [
  { name: 'Common', color: '#c9c9c9', mult: 1, affixes: 0 },
  { name: 'Rare', color: '#4cc9f0', mult: 1.25, affixes: 1 },
  { name: 'Epic', color: '#c77dff', mult: 1.5, affixes: 2 },
  { name: 'Legendary', color: '#ffb703', mult: 1.9, affixes: 3 },
];

export const STAT_LABEL: Record<keyof Stats, string> = {
  maxHp: 'HP',
  dmg: 'DMG',
  def: 'DEF',
  spd: 'SPD',
  eva: 'EVA',
  vamp: 'VAMP',
  crit: 'CRIT',
};

export const PCT_STATS: (keyof Stats)[] = ['spd', 'eva', 'vamp', 'crit'];

export interface BuildingDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: Partial<Res>;
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'herbalist', name: 'Herbalist', icon: '🌿', desc: 'Start each run with 1 more potion and hold 1 more.', cost: { wood: 8, food: 8 } },
  { id: 'gym', name: 'Gymnasium', icon: '🏋️', desc: '+15 max HP for every class.', cost: { wood: 12, stone: 8 } },
  { id: 'farm', name: 'Farm', icon: '🌾', desc: 'Unlocks the Village card.', cost: { wood: 10, food: 6 } },
  { id: 'smithy', name: 'Smithy', icon: '⚒️', desc: 'Start with a rare weapon.', cost: { stone: 12, metal: 10 } },
  { id: 'lamplighter', name: 'Lamplighter', icon: '🏮', desc: 'Unlocks the Lantern card.', cost: { wood: 10, metal: 8 } },
  { id: 'kitchen', name: 'Field Kitchen', icon: '🍲', desc: 'The camp heals 35% instead of 25%.', cost: { food: 18, wood: 10 } },
  { id: 'crypt', name: 'Crypt', icon: '⚰️', desc: 'Unlocks the Vampire Mansion card.', cost: { stone: 16, metal: 12 } },
  { id: 'guild', name: "Thieves' Guild", icon: '🗡️', desc: 'Unlocks the Rogue class.', cost: { metal: 18, food: 12 } },
  { id: 'lighthouse', name: 'Lighthouse', icon: '🗼', desc: 'Unlocks the Beacon card.', cost: { stone: 20, wood: 14 } },
  { id: 'depot', name: 'Supply Depot', icon: '📦', desc: 'Start each run with 2 more cards.', cost: { wood: 18, stone: 14 } },
  { id: 'chapel', name: 'Chapel', icon: '⛪', desc: 'Unlocks the Priest class.', cost: { stone: 26, food: 20 } },
  { id: 'forge', name: 'War Forge', icon: '🔥', desc: '+2 damage for every class.', cost: { metal: 30, stone: 24 } },
];
