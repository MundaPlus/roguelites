/** Static game data: shapes, materials, spells, curses, worlds and unlocks. */

export type Cell = [number, number];

export interface ShapeDef {
  id: string;
  cells: Cell[];
  set: 'base' | 'small' | 'big';
}

export const SHAPES: Record<string, ShapeDef> = {
  I: { id: 'I', set: 'base', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  O: { id: 'O', set: 'base', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  T: { id: 'T', set: 'base', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  L: { id: 'L', set: 'base', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  J: { id: 'J', set: 'base', cells: [[0, 0], [1, 0], [2, 0], [0, 1]] },
  S: { id: 'S', set: 'base', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  Z: { id: 'Z', set: 'base', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  D: { id: 'D', set: 'small', cells: [[0, 0], [1, 0]] },
  V: { id: 'V', set: 'small', cells: [[0, 0], [1, 0], [0, 1]] },
  I3: { id: 'I3', set: 'small', cells: [[0, 0], [1, 0], [2, 0]] },
  P: { id: 'P', set: 'big', cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
  U: { id: 'U', set: 'big', cells: [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]] },
  X: { id: 'X', set: 'big', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
  I5: { id: 'I5', set: 'big', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  W: { id: 'W', set: 'big', cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
};

export const BASE_SHAPES = Object.values(SHAPES).filter((s) => s.set === 'base').map((s) => s.id);
export const SMALL_SHAPES = Object.values(SHAPES).filter((s) => s.set === 'small').map((s) => s.id);
export const BIG_SHAPES = Object.values(SHAPES).filter((s) => s.set === 'big').map((s) => s.id);

/** Shape colors for wood blocks. */
export const SHAPE_COLOR: Record<string, string> = {
  I: '#4cc9f0',
  O: '#ffd166',
  T: '#c77dff',
  L: '#ff9f43',
  J: '#4895ef',
  S: '#7ee08a',
  Z: '#ef476f',
  D: '#f4a261',
  V: '#e9c46a',
  I3: '#90e0ef',
  P: '#b5838d',
  U: '#9d4edd',
  X: '#e76f51',
  I5: '#2a9d8f',
  W: '#f72585',
};

export interface MatDef {
  id: string;
  name: string;
  density: number;
  fric: number;
  rest: number;
  /** Fill color. `null` uses the shape color. */
  color: string | null;
  text: string;
}

export const MATS: Record<string, MatDef> = {
  wood: { id: 'wood', name: 'Wood', density: 1, fric: 0.75, rest: 0.05, color: null, text: 'Normal block.' },
  stone: { id: 'stone', name: 'Stone', density: 2.4, fric: 0.9, rest: 0.02, color: '#8d99ae', text: 'Heavy and grippy. Good for a base.' },
  ice: { id: 'ice', name: 'Ice', density: 0.9, fric: 0.06, rest: 0.05, color: '#bde0fe', text: 'Slippery. Slides off easily.' },
  iron: { id: 'iron', name: 'Iron', density: 5, fric: 1.2, rest: 0, color: '#5c677d', text: 'Heavy spell block. Pins itself in place.' },
  rock: { id: 'rock', name: 'Rock', density: 2, fric: 0.6, rest: 0.1, color: '#6b4f3a', text: 'Falling debris.' },
  slab: { id: 'slab', name: 'Slab', density: 1, fric: 0.9, rest: 0, color: '#3d405b', text: 'The platform.' },
};

export interface SpellDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  price: number;
  /** Bricks to unlock it in the workshop. 0 means it is there from the start. */
  unlock: number;
}

export const SPELLS: Record<string, SpellDef> = {
  glue: { id: 'glue', name: 'Glue', icon: '🍯', text: 'The falling block sticks to the first thing it touches.', price: 14, unlock: 0 },
  heavy: { id: 'heavy', name: 'Heavy', icon: '⚓', text: 'The falling block turns to iron. It pins itself where it lands.', price: 14, unlock: 0 },
  shrink: { id: 'shrink', name: 'Shrink', icon: '🔹', text: 'The falling block shrinks to 60% size.', price: 10, unlock: 0 },
  vines: { id: 'vines', name: 'Vines', icon: '🌿', text: 'Vines root every resting block. Rooted blocks never move.', price: 24, unlock: 0 },
  calm: { id: 'calm', name: 'Calm', icon: '🕊️', text: 'Stops wind, quakes and boss curses for 20 seconds.', price: 12, unlock: 6 },
  undo: { id: 'undo', name: 'Undo', icon: '↩️', text: 'Removes the last block you placed.', price: 12, unlock: 8 },
  mend: { id: 'mend', name: 'Mend', icon: '💖', text: 'Gain 1 life.', price: 16, unlock: 10 },
  ledge: { id: 'ledge', name: 'Ledge', icon: '🧱', text: 'The platform grows 1 cell on each side for this challenge.', price: 14, unlock: 12 },
};

export const SPELL_IDS = Object.keys(SPELLS);

export interface CurseDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const CURSES: Record<string, CurseDef> = {
  gust: { id: 'gust', name: 'Gust', icon: '🌬️', text: 'A strong wind blows for 4 seconds.' },
  quake: { id: 'quake', name: 'Quake', icon: '🌋', text: 'The platform shakes for 3 seconds.' },
  ice: { id: 'ice', name: 'Frost', icon: '❄️', text: 'The next 2 blocks are ice.' },
  big: { id: 'big', name: 'Bloat', icon: '🎈', text: 'The next block is a big 5-cell block.' },
  debris: { id: 'debris', name: 'Rockfall', icon: '🪨', text: 'Rocks fall on the tower.' },
  slide: { id: 'slide', name: 'Drift', icon: '↔️', text: 'The platform slides for 6 seconds.' },
};

export type ChallengeKind = 'race' | 'hold' | 'ceiling';

export const KIND_INFO: Record<ChallengeKind, { name: string; icon: string; text: string }> = {
  race: { name: 'Race', icon: '🏁', text: 'Build up to the goal line before the timer runs out.' },
  hold: { name: 'Hold', icon: '⏳', text: 'Place the blocks, then keep the tower up through a storm.' },
  ceiling: { name: 'Ceiling', icon: '📏', text: 'Place every block below the laser ceiling.' },
};

export interface BossDef {
  name: string;
  icon: string;
  text: string;
  curses: string[];
  every: number;
}

export interface WorldDef {
  name: string;
  icon: string;
  sky: [string, string];
  ground: string;
  /** Base wind strength (force per cell area). */
  wind: number;
  /** Seconds between quakes, 0 = none. */
  quake: number;
  ice: number;
  stone: number;
  debris: number;
  moving: number;
  platW: number;
  goal: [number, number];
  boss: BossDef;
  elite: string[];
}

export const WORLDS: WorldDef[] = [
  {
    name: 'Meadow',
    icon: '🌼',
    sky: ['#2b4162', '#7aa5c9'],
    ground: '#3a5a40',
    wind: 0.4,
    quake: 0,
    ice: 0,
    stone: 0.12,
    debris: 0,
    moving: 0,
    platW: 6,
    goal: [9, 11],
    boss: { name: 'Gale Giant', icon: '🌪️', text: 'Blows gusts and bloats your blocks.', curses: ['gust', 'big', 'gust'], every: 11 },
    elite: ['gust', 'ice'],
  },
  {
    name: 'Quarry',
    icon: '⛏️',
    sky: ['#3d2c2e', '#a26769'],
    ground: '#6d4c41',
    wind: 0,
    quake: 16,
    ice: 0.12,
    stone: 0.25,
    debris: 0,
    moving: 0,
    platW: 6,
    goal: [12, 14],
    boss: { name: 'Stone Golem', icon: '🗿', text: 'Shakes the ground and drops rocks.', curses: ['quake', 'debris', 'big', 'ice'], every: 10 },
    elite: ['quake', 'debris', 'big'],
  },
  {
    name: 'Sky Peak',
    icon: '🏔️',
    sky: ['#14213d', '#5a6fa8'],
    ground: '#adb5bd',
    wind: 1.4,
    quake: 0,
    ice: 0.22,
    stone: 0.15,
    debris: 0,
    moving: 0.7,
    platW: 6,
    goal: [15, 17],
    boss: { name: 'Storm Wizard', icon: '🧙', text: 'Casts every curse he knows.', curses: ['gust', 'slide', 'ice', 'debris', 'big', 'quake'], every: 9 },
    elite: ['gust', 'slide', 'ice', 'debris'],
  },
];

export interface UnlockDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  cost: number;
}

/** Workshop unlocks bought with bricks. Spell unlocks use the spell ids. */
export const UNLOCKS: UnlockDef[] = [
  ...Object.values(SPELLS)
    .filter((s) => s.unlock > 0)
    .map((s) => ({ id: s.id, name: s.name, icon: s.icon, text: `Spell: ${s.text}`, cost: s.unlock })),
  { id: 'small', name: 'Small blocks', icon: '🧩', text: 'Block set: 2- and 3-cell blocks join the bag.', cost: 14 },
  { id: 'heart', name: 'Extra heart', icon: '❤️', text: 'Start each run with 1 more life.', cost: 20 },
  { id: 'starter', name: 'Starter kit', icon: '🎒', text: 'Start each run with a Glue card.', cost: 10 },
];
