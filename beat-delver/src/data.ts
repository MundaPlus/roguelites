/** Static game data: weapons, items, enemies, zones, characters, unlocks. */

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
export const DIR_NAME = ['up', 'right', 'down', 'left'];

export type Shape = 'dagger' | 'spear' | 'broad' | 'whip' | 'rapier' | 'long';

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  dmg: number;
  shape: Shape;
  text: string;
}

/** Attack offsets for facing up. `all` hits every enemy in the shape, else only the first one. */
export const SHAPES: Record<Shape, { cells: [number, number][]; all: boolean }> = {
  dagger: { cells: [[0, -1]], all: false },
  spear: { cells: [[0, -1], [0, -2]], all: false },
  broad: { cells: [[0, -1], [-1, -1], [1, -1]], all: true },
  whip: { cells: [[0, -1], [-1, -1], [1, -1], [-2, -1], [2, -1]], all: false },
  rapier: { cells: [[0, -1], [0, -2]], all: false },
  long: { cells: [[0, -1], [0, -2]], all: true },
};

export const WEAPONS: Record<string, WeaponDef> = {
  dagger: { id: 'dagger', name: 'Dagger', icon: '🗡️', dmg: 1, shape: 'dagger', text: 'Hits 1 tile ahead.' },
  spear: { id: 'spear', name: 'Spear', icon: '🔱', dmg: 1, shape: 'spear', text: 'Hits the first enemy up to 2 tiles ahead.' },
  broad: { id: 'broad', name: 'Broadsword', icon: '⚔️', dmg: 1, shape: 'broad', text: 'Hits all 3 tiles in the row ahead.' },
  whip: { id: 'whip', name: 'Whip', icon: '➰', dmg: 1, shape: 'whip', text: 'Hits one enemy in the 5 tiles of the row ahead.' },
  rapier: { id: 'rapier', name: 'Rapier', icon: '🤺', dmg: 1, shape: 'rapier', text: 'Hits 1 tile ahead. Lunges at an enemy 2 tiles away for double damage.' },
  long: { id: 'long', name: 'Longsword', icon: '🗡', dmg: 2, shape: 'long', text: 'Deals 2. Hits both tiles in a line of 2.' },
};

export type ItemKind = 'weapon' | 'armor' | 'torch' | 'bombs' | 'spell' | 'ring' | 'food' | 'heart' | 'whet' | 'pick';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  kind: ItemKind;
  cost: number;
  text: string;
  /** Weapon id, armor level, torch level, bomb count, heal amount. */
  v?: string | number;
}

export const ITEMS: Record<string, ItemDef> = {
  w_spear: { id: 'w_spear', name: 'Spear', icon: '🔱', kind: 'weapon', cost: 30, v: 'spear', text: WEAPONS.spear.text },
  w_broad: { id: 'w_broad', name: 'Broadsword', icon: '⚔️', kind: 'weapon', cost: 45, v: 'broad', text: WEAPONS.broad.text },
  w_whip: { id: 'w_whip', name: 'Whip', icon: '➰', kind: 'weapon', cost: 35, v: 'whip', text: WEAPONS.whip.text },
  w_rapier: { id: 'w_rapier', name: 'Rapier', icon: '🤺', kind: 'weapon', cost: 40, v: 'rapier', text: WEAPONS.rapier.text },
  w_long: { id: 'w_long', name: 'Longsword', icon: '🗡', kind: 'weapon', cost: 70, v: 'long', text: WEAPONS.long.text },
  leather: { id: 'leather', name: 'Leather Armor', icon: '🦺', kind: 'armor', cost: 25, v: 1, text: 'Blocks the first hit on each floor.' },
  chain: { id: 'chain', name: 'Chainmail', icon: '🧥', kind: 'armor', cost: 50, v: 2, text: 'Hits of 2 or more deal 1 less.' },
  plate: { id: 'plate', name: 'Plate Armor', icon: '🛡️', kind: 'armor', cost: 85, v: 3, text: 'Chainmail and leather together.' },
  torch: { id: 'torch', name: 'Torch', icon: '🔥', kind: 'torch', cost: 20, v: 1, text: 'You see 2 tiles farther.' },
  lantern: { id: 'lantern', name: 'Lantern', icon: '🏮', kind: 'torch', cost: 40, v: 2, text: 'You see 4 tiles farther.' },
  bombs: { id: 'bombs', name: 'Bomb Pack', icon: '💣', kind: 'bombs', cost: 20, v: 3, text: '+3 bombs. A bomb explodes 3 beats later in a 3×3 area.' },
  fireball: { id: 'fireball', name: 'Fireball Spell', icon: '☄️', kind: 'spell', cost: 40, text: 'Deals 3 to every enemy in a line ahead. Recharges after 4 kills.' },
  freeze: { id: 'freeze', name: 'Freeze Spell', icon: '❄️', kind: 'spell', cost: 35, text: 'All enemies stop for 6 beats. Recharges after 6 kills.' },
  heal: { id: 'heal', name: 'Heal Spell', icon: '💖', kind: 'spell', cost: 45, text: 'Heals 2 HP. Recharges after 7 kills.' },
  quake: { id: 'quake', name: 'Quake Spell', icon: '🌋', kind: 'spell', cost: 35, text: 'Digs all walls within 2 tiles and deals 1 to enemies next to you. Recharges after 3 kills.' },
  ring_gold: { id: 'ring_gold', name: 'Ring of Gold', icon: '💍', kind: 'ring', cost: 40, text: 'The gold multiplier goes 1 higher.' },
  ring_luck: { id: 'ring_luck', name: 'Lucky Charm', icon: '🍀', kind: 'ring', cost: 30, text: 'Every gold pile gives +2 gold.' },
  ring_vigor: { id: 'ring_vigor', name: 'Ring of Vigor', icon: '💚', kind: 'ring', cost: 45, text: 'Heal 1 HP at the start of each floor.' },
  apple: { id: 'apple', name: 'Apple', icon: '🍎', kind: 'food', cost: 18, v: 2, text: 'Heals 2 HP.' },
  cheese: { id: 'cheese', name: 'Cheese', icon: '🧀', kind: 'food', cost: 32, v: 4, text: 'Heals 4 HP.' },
  heart: { id: 'heart', name: 'Heart Container', icon: '❤️', kind: 'heart', cost: 65, text: '+1 max HP and heals 1.' },
  whet: { id: 'whet', name: 'Whetstone', icon: '🪨', kind: 'whet', cost: 60, text: 'Your weapon deals +1 damage.' },
  pick: { id: 'pick', name: 'Pickaxe', icon: '⛏️', kind: 'pick', cost: 25, text: 'You can dig stone walls.' },
};

export const SPELL_CHARGE: Record<string, number> = { fireball: 4, freeze: 6, heal: 7, quake: 3 };

export type Move = 'still' | 'bounce' | 'square' | 'chase' | 'random' | 'charge' | 'diag' | 'line';

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  dmg: number;
  gold: number;
  move: Move;
  /** Acts every N beats. */
  every: number;
  text: string;
  mini?: boolean;
  boss?: boolean;
  summon?: string;
  summonEvery?: number;
  slam?: 'area' | 'cross';
  slamEvery?: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  slime: { id: 'slime', name: 'Green Slime', icon: '🟢', hp: 1, dmg: 1, gold: 2, move: 'bounce', every: 1, text: 'Hops up, then down, every beat.' },
  bat: { id: 'bat', name: 'Bat', icon: '🦇', hp: 1, dmg: 1, gold: 2, move: 'random', every: 2, text: 'Flies in a random direction every second beat.' },
  skeleton: { id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 1, dmg: 1, gold: 3, move: 'chase', every: 2, text: 'Walks to you every second beat.' },
  zombie: { id: 'zombie', name: 'Zombie', icon: '🧟', hp: 1, dmg: 2, gold: 3, move: 'line', every: 2, text: 'Walks in a straight line every second beat. Turns at walls.' },
  bslime: { id: 'bslime', name: 'Blue Slime', icon: '🔵', hp: 2, dmg: 2, gold: 4, move: 'square', every: 1, text: 'Moves in a small square: right, down, left, up.' },
  spider: { id: 'spider', name: 'Spider', icon: '🕷️', hp: 1, dmg: 1, gold: 3, move: 'chase', every: 1, text: 'Runs to you every beat.' },
  knight: { id: 'knight', name: 'Bone Knight', icon: '☠️', hp: 2, dmg: 2, gold: 5, move: 'chase', every: 2, text: 'Walks to you every second beat. Hit it twice between its steps.' },
  imp: { id: 'imp', name: 'Fire Imp', icon: '😈', hp: 1, dmg: 2, gold: 4, move: 'chase', every: 1, text: 'Runs to you every beat. Hits hard.' },
  boar: { id: 'boar', name: 'Boar', icon: '🐗', hp: 2, dmg: 2, gold: 5, move: 'charge', every: 1, text: 'Aims when you stand in its row or column, then charges. Dazed after.' },
  lslime: { id: 'lslime', name: 'Lava Slime', icon: '🟠', hp: 2, dmg: 3, gold: 5, move: 'square', every: 1, text: 'Moves in a small square. Hits for 3.' },
  wraith: { id: 'wraith', name: 'Wraith', icon: '👻', hp: 1, dmg: 2, gold: 5, move: 'diag', every: 1, text: 'Floats to you diagonally every beat.' },
  lich: { id: 'lich', name: 'Lich', icon: '🧙', hp: 3, dmg: 3, gold: 8, move: 'chase', every: 2, text: 'Walks to you every second beat. 3 HP.' },
  ghoul: { id: 'ghoul', name: 'Ghoul', icon: '🧟‍♂️', hp: 2, dmg: 2, gold: 6, move: 'chase', every: 1, text: 'Runs to you every beat. 2 HP.' },
  shroom: { id: 'shroom', name: 'Spore Cap', icon: '🍄', hp: 2, dmg: 2, gold: 4, move: 'still', every: 2, text: 'Never moves. Hits you next to it every second beat.' },
  // Mini-bosses guard the stairs.
  ogre: { id: 'ogre', name: 'Ogre', icon: '👹', hp: 4, dmg: 3, gold: 15, move: 'chase', every: 3, mini: true, text: 'Steps every third beat. Guards the stairs.' },
  minotaur: { id: 'minotaur', name: 'Minotaur', icon: '🐂', hp: 5, dmg: 3, gold: 20, move: 'charge', every: 1, mini: true, text: 'Charges along rows and columns. Dazed after a charge.' },
  golem: { id: 'golem', name: 'Golem', icon: '🗿', hp: 6, dmg: 4, gold: 25, move: 'chase', every: 3, mini: true, text: 'Steps every third beat. Very tough.' },
  drake: { id: 'drake', name: 'Drake', icon: '🐲', hp: 6, dmg: 4, gold: 30, move: 'chase', every: 2, mini: true, text: 'Steps every second beat. Hits for 4.' },
  // Zone bosses.
  boneking: { id: 'boneking', name: 'Bone King', icon: '🤴', hp: 10, dmg: 3, gold: 40, move: 'chase', every: 2, boss: true, summon: 'skeleton', summonEvery: 8, text: 'Calls a skeleton every 8 beats.' },
  queen: { id: 'queen', name: 'Spider Queen', icon: '🕸️', hp: 12, dmg: 3, gold: 50, move: 'chase', every: 1, boss: true, summon: 'spider', summonEvery: 9, text: 'Fast. Lays a spider every 9 beats.' },
  titan: { id: 'titan', name: 'Forge Titan', icon: '🤖', hp: 15, dmg: 4, gold: 60, move: 'chase', every: 2, boss: true, slam: 'area', slamEvery: 6, summon: 'imp', summonEvery: 12, text: 'Slams the 3×3 area around it every 6 beats. The tiles flash first.' },
  conductor: { id: 'conductor', name: 'The Conductor', icon: '🎻', hp: 18, dmg: 4, gold: 80, move: 'chase', every: 1, boss: true, slam: 'cross', slamEvery: 7, summon: 'wraith', summonEvery: 10, text: 'Strikes its row and column every 7 beats. Calls wraiths.' },
};

export interface ZoneDef {
  name: string;
  icon: string;
  bpm: number;
  pool: [string, number][];
  mini: string;
  boss: string;
  /** Share of walls made of stone. */
  stone: number;
  floor: string;
  wall: string;
  /** Bass root note in Hz and the scale steps of the loop. */
  root: number;
  bass: number[];
}

export const ZONES: ZoneDef[] = [
  { name: 'Crypt', icon: '⚰️', bpm: 100, pool: [['slime', 3], ['bat', 3], ['skeleton', 4], ['zombie', 2]], mini: 'ogre', boss: 'boneking', stone: 0.05, floor: '#2a2236', wall: '#5a4a3a', root: 55, bass: [0, 0, 7, 5, 0, 3, 7, 10] },
  { name: 'Caverns', icon: '🕳️', bpm: 112, pool: [['bat', 2], ['bslime', 3], ['spider', 3], ['knight', 3], ['shroom', 2]], mini: 'minotaur', boss: 'queen', stone: 0.12, floor: '#1f2a33', wall: '#3f5560', root: 61.7, bass: [0, 3, 5, 7, 0, 7, 5, 3] },
  { name: 'Forge', icon: '🔥', bpm: 124, pool: [['imp', 3], ['boar', 3], ['lslime', 3], ['knight', 2], ['shroom', 1]], mini: 'golem', boss: 'titan', stone: 0.2, floor: '#2e1d1a', wall: '#6a3a28', root: 65.4, bass: [0, 0, 12, 0, 10, 0, 7, 5] },
  { name: 'Abyss', icon: '🌌', bpm: 136, pool: [['wraith', 3], ['lich', 2], ['ghoul', 3], ['boar', 2], ['imp', 2]], mini: 'drake', boss: 'conductor', stone: 0.28, floor: '#191a2e', wall: '#3b3466', root: 49, bass: [0, 7, 3, 10, 0, 7, 12, 10] },
];

export const FLOORS_PER_ZONE = 3;

export interface CharDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  hp: number;
  weapon: string;
  armor: number;
  bombs: number;
  torch: number;
  gold: number;
  rings: string[];
  cost: number;
}

export const CHARS: CharDef[] = [
  { id: 'delver', name: 'Delver', icon: '🧑', text: 'Dagger, 5 HP, 1 bomb.', hp: 5, weapon: 'dagger', armor: 0, bombs: 1, torch: 0, gold: 0, rings: [], cost: 0 },
  { id: 'ranger', name: 'Ranger', icon: '🧝', text: 'Spear, torch, 4 HP, 2 bombs.', hp: 4, weapon: 'spear', armor: 0, bombs: 2, torch: 1, gold: 0, rings: [], cost: 8 },
  { id: 'knight', name: 'Knight', icon: '🤺', text: 'Broadsword, leather armor, 4 HP.', hp: 4, weapon: 'broad', armor: 1, bombs: 0, torch: 0, gold: 0, rings: [], cost: 12 },
  { id: 'gambler', name: 'Gambler', icon: '🎩', text: 'Dagger, 3 HP, Ring of Gold, 40 gold.', hp: 3, weapon: 'dagger', armor: 0, bombs: 1, torch: 0, gold: 40, rings: ['ring_gold'], cost: 10 },
];

export interface UnlockDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  cost: number;
}

export const START_UNLOCKS: UnlockDef[] = [
  { id: 'u_bombs', name: 'Powder Pouch', icon: '💣', text: 'Start every run with 2 more bombs.', cost: 4 },
  { id: 'u_torch', name: 'Old Torch', icon: '🔥', text: 'Start every run with a torch.', cost: 5 },
  { id: 'u_heart', name: 'Stout Heart', icon: '❤️', text: 'Start every run with +1 max HP.', cost: 8 },
];
