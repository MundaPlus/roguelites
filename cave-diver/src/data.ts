/** Static game data: tiles, zones, enemies, items. */

export const TS = 16;
export const RW = 10;
export const RH = 8;
export const GRID = 4;
export const MW = RW * GRID + 2;
export const MH = RH * GRID + 2;
export const FPS = 60;
export const LEVELS_PER_ZONE = 4;
export const LEVEL_COUNT = 16;

// Tile ids
export const EMPTY = 0;
export const DIRT = 1;
export const ROCK = 2;
export const LADDER = 3;
export const SPIKES = 4;
export const LAVA = 5;
export const PLAT = 6;
export const ARROW = 7;
export const ICE = 8;
export const GOLDV = 9;
export const CRUSH = 10;
export const ICICLE = 11;

const SOLID = new Set([DIRT, ROCK, ARROW, ICE, GOLDV, CRUSH]);
export const isSolid = (t: number): boolean => SOLID.has(t);
/** Tiles a bomb can remove. */
export const isBreakable = (t: number): boolean => t !== EMPTY && t !== ROCK;

export interface ZoneDef {
  name: string;
  icon: string;
  bg: string;
  bg2: string;
  dirt: string;
  dark: string;
  edge: string;
  rock: string;
  walkers: readonly (readonly [string, number])[];
  ceiling: readonly (readonly [string, number])[];
}

export const ZONES: ZoneDef[] = [
  {
    name: 'Mines',
    icon: '⛏️',
    bg: '#1b120c',
    bg2: '#24180f',
    dirt: '#7a5232',
    dark: '#5a3a22',
    edge: '#a87a4c',
    rock: '#3d342e',
    walkers: [
      ['snake', 4],
      ['caveman', 2],
    ],
    ceiling: [
      ['bat', 2],
      ['spider', 2],
    ],
  },
  {
    name: 'Jungle',
    icon: '🌿',
    bg: '#0d1a10',
    bg2: '#132416',
    dirt: '#4f5d2f',
    dark: '#36421f',
    edge: '#7fb24a',
    rock: '#2f3a2c',
    walkers: [
      ['frog', 3],
      ['mantrap', 2],
      ['snake', 1],
      ['caveman', 2],
    ],
    ceiling: [
      ['bat', 2],
      ['spider', 2],
    ],
  },
  {
    name: 'Ice Caves',
    icon: '❄️',
    bg: '#0b1420',
    bg2: '#101d2e',
    dirt: '#5b7a99',
    dark: '#3f5a75',
    edge: '#dff3ff',
    rock: '#2c3a4a',
    walkers: [
      ['yeti', 3],
      ['caveman', 2],
      ['frog', 1],
    ],
    ceiling: [
      ['bat', 3],
      ['spider', 1],
    ],
  },
  {
    name: 'Temple',
    icon: '🏛️',
    bg: '#1c160a',
    bg2: '#271e0d',
    dirt: '#a08850',
    dark: '#7a6638',
    edge: '#e9c46a',
    rock: '#4a3f28',
    walkers: [
      ['mummy', 3],
      ['scorpion', 3],
      ['caveman', 1],
    ],
    ceiling: [['bat', 2]],
  },
];

export type Brain = 'walker' | 'charger' | 'hopper' | 'bat' | 'spider' | 'chaser' | 'boss';

export interface EnemyDef {
  name: string;
  icon: string;
  hp: number;
  dmg: number;
  speed: number;
  brain: Brain;
  w: number;
  h: number;
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  snake: { name: 'Snake', icon: '🐍', hp: 1, dmg: 1, speed: 0.5, brain: 'walker', w: 14, h: 10, text: 'Walks back and forth. Turns at walls and ledges.' },
  bat: { name: 'Bat', icon: '🦇', hp: 1, dmg: 1, speed: 1.3, brain: 'bat', w: 12, h: 10, text: 'Hangs on the ceiling. Flies at you when you come near.' },
  spider: { name: 'Spider', icon: '🕷️', hp: 1, dmg: 1, speed: 2, brain: 'spider', w: 12, h: 10, text: 'Drops from the ceiling when you walk below, then hops at you.' },
  caveman: { name: 'Caveman', icon: '🧔', hp: 2, dmg: 1, speed: 0.5, brain: 'charger', w: 12, h: 14, text: 'Walks slowly. Charges when he sees you on his row.' },
  frog: { name: 'Frog', icon: '🐸', hp: 1, dmg: 1, speed: 1.6, brain: 'hopper', w: 12, h: 10, text: 'Hops at you from up to 8 tiles away.' },
  mantrap: { name: 'Mantrap', icon: '🪴', hp: 3, dmg: 1, speed: 0.6, brain: 'walker', w: 14, h: 14, text: 'A walking plant. Tough, but slow.' },
  yeti: { name: 'Yeti', icon: '🦍', hp: 3, dmg: 1, speed: 0.45, brain: 'walker', w: 14, h: 15, text: 'Slow and tough. Its hit knocks you far.' },
  mummy: { name: 'Mummy', icon: '🧟', hp: 4, dmg: 2, speed: 0.3, brain: 'walker', w: 12, h: 15, text: 'Very slow, very tough. Hits for 2.' },
  scorpion: { name: 'Scorpion', icon: '🦂', hp: 2, dmg: 1, speed: 1.0, brain: 'chaser', w: 14, h: 10, text: 'Runs at you when you are on its row.' },
  boss: { name: 'Stone King', icon: '🗿', hp: 24, dmg: 1, speed: 3, brain: 'boss', w: 28, h: 28, text: 'Leaps at you. Its landing shakes the floor. Calls the temple guards.' },
};

export interface ItemDef {
  name: string;
  icon: string;
  text: string;
  price: number;
  /** Consumables apply at once and are never "owned". */
  consumable?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  spring: { name: 'Spring Shoes', icon: '🥾', text: 'Jump higher.', price: 3000 },
  gloves: { name: 'Climbing Gloves', icon: '🧤', text: 'Slide down walls and jump off them.', price: 3500 },
  shotgun: { name: 'Shotgun', icon: '🔫', text: 'Attack fires 5 pellets instead of the whip.', price: 5000 },
  jetpack: { name: 'Jetpack', icon: '🚀', text: 'Press jump again in the air to fly for a short time.', price: 6000 },
  compass: { name: 'Compass', icon: '🧭', text: 'An arrow points to the exit.', price: 1500 },
  cape: { name: 'Cape', icon: '🧣', text: 'Hold jump to fall slowly.', price: 3000 },
  spikeshoes: { name: 'Spike Shoes', icon: '👟', text: 'Stomps deal 3 damage.', price: 2500 },
  mitt: { name: "Pitcher's Mitt", icon: '⚾', text: 'Throw bombs, rocks and pots much farther.', price: 2000 },
  kapala: { name: 'Kapala', icon: '🍷', text: 'Heal 1 HP for every 8 kills.', price: 4000 },
  bombbag: { name: 'Bomb Bag', icon: '💣', text: '+3 bombs.', price: 1500, consumable: true },
  ropepile: { name: 'Rope Pile', icon: '🪢', text: '+3 ropes.', price: 1000, consumable: true },
  potion: { name: 'Health Potion', icon: '🧪', text: '+1 HP.', price: 2500, consumable: true },
};

export const PASSIVES = ['spring', 'gloves', 'shotgun', 'jetpack', 'compass', 'cape', 'spikeshoes', 'mitt', 'kapala'];
export const CONSUMABLES = ['bombbag', 'ropepile', 'potion'];

export const GEMS = [
  { color: '#4cc9f0', value: 500 },
  { color: '#06d6a0', value: 800 },
  { color: '#ef476f', value: 1200 },
];

export const PETS = ['🐶', '🐱', '🐹'];

export const levelName = (index: number): string => `${Math.floor(index / LEVELS_PER_ZONE) + 1}-${(index % LEVELS_PER_ZONE) + 1}`;
export const zoneOf = (index: number): number => Math.min(3, Math.floor(index / LEVELS_PER_ZONE));
