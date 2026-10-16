/** Static game data: effects, maps, ingredients, salts, places, customers, meta unlocks. */

export interface V {
  x: number;
  y: number;
}

export type EffectId =
  | 'healing'
  | 'fire'
  | 'luck'
  | 'sleep'
  | 'strength'
  | 'frost'
  | 'light'
  | 'poison'
  | 'swift'
  | 'love'
  | 'ghost';

export interface EffectDef {
  name: string;
  icon: string;
  color: string;
  /** Base price of a strength-1 potion before the strength and reputation factors. */
  value: number;
}

export const EFFECTS: Record<EffectId, EffectDef> = {
  healing: { name: 'Healing', icon: '❤️', color: '#ff5d73', value: 26 },
  fire: { name: 'Fire', icon: '🔥', color: '#ff8c32', value: 28 },
  luck: { name: 'Luck', icon: '🍀', color: '#4cd964', value: 34 },
  sleep: { name: 'Sleep', icon: '💤', color: '#8e9aff', value: 30 },
  strength: { name: 'Strength', icon: '💪', color: '#ffb347', value: 32 },
  frost: { name: 'Frost', icon: '❄️', color: '#7fdbff', value: 38 },
  light: { name: 'Light', icon: '✨', color: '#fff27a', value: 42 },
  poison: { name: 'Poison', icon: '☠️', color: '#a4e05a', value: 36 },
  swift: { name: 'Swiftness', icon: '💨', color: '#c9f1ff', value: 36 },
  love: { name: 'Love', icon: '💗', color: '#ff8fd8', value: 40 },
  ghost: { name: 'Invisibility', icon: '👻', color: '#c7b8ff', value: 50 },
};

export const ZONE_R = 13;

export interface Zone {
  effect: EffectId;
  x: number;
  y: number;
}

export interface Danger {
  x: number;
  y: number;
  r: number;
}

export type MapId = 'water' | 'oil' | 'wine';

export interface MapDef {
  id: MapId;
  name: string;
  icon: string;
  tint: string;
  text: string;
  zones: Zone[];
  dangers: Danger[];
}

const z = (effect: EffectId, x: number, y: number): Zone => ({ effect, x, y });
const d = (x: number, y: number, r = 8): Danger => ({ x, y, r });

export const MAPS: Record<MapId, MapDef> = {
  water: {
    id: 'water',
    name: 'Spring Water',
    icon: '💧',
    tint: '#1b2a4a',
    text: 'The first base. Open from day 1.',
    zones: [z('healing', 0, 48), z('fire', 52, 12), z('luck', -50, 34), z('sleep', -38, -48), z('strength', 42, -46), z('frost', -82, -8), z('light', 30, 82)],
    dangers: [d(14, 28), d(-24, 12, 7), d(24, -20, 7), d(-12, -28, 7), d(76, -14), d(-62, 64, 9), d(62, 46), d(-6, 80), d(0, -72, 9), d(-82, -50), d(-84, 30, 7)],
  },
  oil: {
    id: 'oil',
    name: 'Lamp Oil',
    icon: '🛢️',
    tint: '#3a2a12',
    text: 'Opens in week 2. New effects: Poison, Swiftness, Love.',
    zones: [z('poison', 0, -58), z('swift', 58, 40), z('love', -46, 52), z('fire', 72, -28), z('sleep', 8, 64), z('strength', -64, -38), z('healing', -72, 10)],
    dangers: [d(30, 18), d(-20, 28), d(20, -30), d(-28, -18, 7), d(44, -52), d(-46, -70, 9), d(82, 8), d(-92, 40), d(34, 74), d(0, 30, 6), d(-40, 0, 6), d(60, -2, 6)],
  },
  wine: {
    id: 'wine',
    name: 'Dark Wine',
    icon: '🍷',
    tint: '#3a1228',
    text: 'Unlock in the Guild Hall. Opens in week 3. New effect: Invisibility.',
    zones: [z('ghost', -75, -15), z('light', -55, 55), z('luck', 60, -8), z('frost', 42, -58), z('love', 18, 62), z('poison', -30, -72), z('swift', 82, 58)],
    dangers: [d(0, 30, 7), d(28, 24, 7), d(-30, 18), d(30, -28), d(-14, -36), d(-52, -40), d(62, 26), d(72, -42), d(-80, 22), d(0, 92), d(-22, 62, 7), d(48, 88)],
  },
};

export const MAP_ORDER: MapId[] = ['water', 'oil', 'wine'];

export type Rarity = 'common' | 'uncommon' | 'rare';

export interface IngredientDef {
  name: string;
  icon: string;
  rarity: Rarity;
  price: number;
  /** Turtle drawing: start heading in degrees (0 = right, 90 = up), then segments. */
  heading: number;
  /** [length, curve in degrees per unit, sharp turn before the segment]. */
  segs: [number, number, number?][];
  /** Only in markets after this meta unlock. */
  unlock?: string;
}

export const INGREDIENTS: Record<string, IngredientDef> = {
  healroot: { name: 'Healroot', icon: '🌿', rarity: 'common', price: 5, heading: 90, segs: [[10, 0], [10, 0, 14], [10, 0, -24]] },
  firebloom: { name: 'Firebloom', icon: '🌺', rarity: 'common', price: 5, heading: 0, segs: [[32, 1.1]] },
  windgrass: { name: 'Windgrass', icon: '🌾', rarity: 'common', price: 4, heading: 180, segs: [[30, -1.1]] },
  mossbell: { name: 'Mossbell', icon: '🍄', rarity: 'common', price: 4, heading: 235, segs: [[28, 0.9]] },
  ironnut: { name: 'Ironnut', icon: '🌰', rarity: 'common', price: 5, heading: 305, segs: [[30, -0.9]] },
  sunberry: { name: 'Sunberry', icon: '🍒', rarity: 'uncommon', price: 9, heading: 75, segs: [[20, 0], [22, -4]] },
  moonpetal: { name: 'Moonpetal', icon: '🌸', rarity: 'uncommon', price: 10, heading: 100, segs: [[50, 3]] },
  frostfern: { name: 'Frostfern', icon: '🌱', rarity: 'uncommon', price: 9, heading: 195, segs: [[15, 0], [15, 0, -30], [15, 0, 30]] },
  bogbulb: { name: 'Bog Bulb', icon: '🧅', rarity: 'uncommon', price: 8, heading: 270, segs: [[14, 0], [14, 0, 35], [14, 0, -60]] },
  emberpepper: { name: 'Ember Pepper', icon: '🌶️', rarity: 'uncommon', price: 10, heading: 20, segs: [[12, 0, 30], [12, 0, -60], [12, 0, 60], [12, 0, -60]] },
  dragonscale: { name: 'Dragonscale', icon: '🐉', rarity: 'rare', price: 18, heading: 5, segs: [[64, 0]] },
  phoenix: { name: 'Phoenix Plume', icon: '🪶', rarity: 'rare', price: 20, heading: 50, segs: [[60, -0.7]] },
  gravegrape: { name: 'Grave Grape', icon: '🍇', rarity: 'rare', price: 18, heading: 232, segs: [[60, 0.5]], unlock: 'exotic' },
  staranise: { name: 'Star Anise', icon: '⭐', rarity: 'rare', price: 20, heading: 125, segs: [[60, 1]], unlock: 'exotic' },
  ghostorchid: { name: 'Ghost Orchid', icon: '🪻', rarity: 'rare', price: 22, heading: 160, segs: [[30, 0], [30, -3]] },
};

export const ING_IDS = Object.keys(INGREDIENTS);

export interface SaltDef {
  name: string;
  icon: string;
  price: number;
  text: string;
  /** Rotation of the queued path in degrees (positive = counter-clockwise). */
  rot?: number;
  /** Push of the marker and the queued path. */
  push?: V;
}

export const SALTS: Record<string, SaltDef> = {
  sun: { name: 'Sun Salt', icon: '☀️', price: 7, rot: -20, text: 'Turns the queued path 20° clockwise.' },
  moon: { name: 'Moon Salt', icon: '🌙', price: 7, rot: 20, text: 'Turns the queued path 20° counter-clockwise.' },
  gale: { name: 'Gale Salt', icon: '🌬️', price: 6, push: { x: 0, y: 8 }, text: 'Pushes the marker 8 up.' },
  stone: { name: 'Stone Salt', icon: '🪨', price: 6, push: { x: 0, y: -8 }, text: 'Pushes the marker 8 down.' },
};

export const SALT_IDS = Object.keys(SALTS);

export interface PlaceDef {
  name: string;
  icon: string;
  text: string;
  pool: string[];
  min: number;
  max: number;
  /** Chance of a bad event. */
  risk: number;
}

export const PLACES: Record<string, PlaceDef> = {
  woods: {
    name: 'Whisper Woods',
    icon: '🌲',
    text: 'Common herbs. Low risk.',
    pool: ['healroot', 'firebloom', 'windgrass', 'mossbell', 'ironnut', 'sunberry'],
    min: 4,
    max: 6,
    risk: 0.12,
  },
  swamp: {
    name: 'Murk Swamp',
    icon: '🐸',
    text: 'Uncommon roots and flowers. Some risk.',
    pool: ['moonpetal', 'frostfern', 'bogbulb', 'emberpepper', 'sunberry', 'mossbell'],
    min: 3,
    max: 5,
    risk: 0.28,
  },
  peaks: {
    name: 'Dragon Peaks',
    icon: '🏔️',
    text: 'Rare finds. High risk.',
    pool: ['dragonscale', 'phoenix', 'ghostorchid', 'staranise', 'gravegrape', 'emberpepper'],
    min: 2,
    max: 4,
    risk: 0.42,
  },
};

export const CUSTOMERS: [string, string][] = [
  ['🧔', 'Farmer Bram'],
  ['👵', 'Old Nell'],
  ['🤴', 'Prince Aldo'],
  ['🧝', 'Ranger Ilse'],
  ['🧙', 'Hedge Wizard'],
  ['👩‍🌾', 'Miller Hanne'],
  ['🛡️', 'Captain Roth'],
  ['🎭', 'The Bard'],
  ['🧑‍🍳', 'Cook Pim'],
  ['🕵️', 'A stranger'],
  ['👸', 'Lady Vera'],
  ['⚒️', 'Smith Doran'],
  ['🧚', 'A fairy'],
  ['🏴‍☠️', 'Captain Gull'],
];

export interface UnlockDef {
  name: string;
  icon: string;
  cost: number;
  text: string;
}

export const UNLOCKS: Record<string, UnlockDef> = {
  purse: { name: 'Fat Purse', icon: '👛', cost: 3, text: 'Start each run with +20 gold.' },
  salts: { name: 'Salt Cellar', icon: '🧂', cost: 3, text: 'Start each run with 1 extra Sun Salt and 1 Moon Salt.' },
  cart: { name: 'Big Cart', icon: '🛒', cost: 4, text: 'Markets stock 1 more uncommon ingredient.' },
  exotic: { name: 'Exotic Trade', icon: '⭐', cost: 5, text: 'Star Anise and Grave Grape appear in markets.' },
  wine: { name: 'Dark Wine', icon: '🍷', cost: 6, text: 'The Dark Wine map opens in week 3. The guild adds a 60 gold licence fee to weeks 3 and 4.' },
  board: { name: 'Notice Board', icon: '📜', cost: 6, text: 'Customers give 1 more day for strength III orders.' },
};

export const UNLOCK_IDS = Object.keys(UNLOCKS);

export const STRENGTH_NAMES = ['', 'I', 'II', 'III'];
