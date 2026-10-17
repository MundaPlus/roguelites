/** Static game data: crates, monsters, tools, characters, room templates. */

export type CrateKind = 'box' | 'ice' | 'heavy' | 'bomb';
export type MonsterKind = 'bat' | 'skull' | 'ghoul';
export type ToolId = 'glove' | 'warp' | 'hourglass' | 'phase' | 'tonic';
export type ItemKind = 'coin' | 'gem' | 'key' | 'might' | 'tool';
export type CharId = 'digger' | 'brute' | 'thief' | 'monk';

export interface CrateDef {
  name: string;
  icon: string;
  text: string;
}

export const CRATES: Record<CrateKind, CrateDef> = {
  box: { name: 'Crate', icon: '📦', text: 'Push it one tile. You cannot pull it.' },
  ice: { name: 'Ice crate', icon: '🧊', text: 'Slides until it hits something.' },
  heavy: { name: 'Iron crate', icon: '⚙️', text: 'Too heavy. Grab the 💪 might pickup first.' },
  bomb: { name: 'Bomb crate', icon: '💣', text: 'Push it into a cracked wall to blow it open. The blast also kills monsters next to it.' },
};

export interface MonsterDef {
  name: string;
  icon: string;
  text: string;
  from: number;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  bat: { name: 'Bat', icon: '🦇', text: 'Flies in a straight line. Turns back at walls, or to the side when both ways are blocked.', from: 2 },
  skull: { name: 'Skull', icon: '💀', text: 'Moves in a random direction each turn.', from: 4 },
  ghoul: { name: 'Ghoul', icon: '🧟', text: 'Steps toward you every second turn.', from: 6 },
};

/** Moves lost when a monster bites you. */
export const BITE = 3;

export interface ToolDef {
  name: string;
  icon: string;
  text: string;
  /** True when the tool waits for a direction. */
  aimed: boolean;
  cost: number;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  glove: { name: 'Pull Glove', icon: '🧤', text: 'Your next step pulls the crate behind you.', aimed: true, cost: 14 },
  warp: { name: 'Crate Teleport', icon: '🌀', text: 'Swap places with the first crate in a direction.', aimed: true, cost: 18 },
  hourglass: { name: 'Hourglass', icon: '⏳', text: '+15 moves for this floor.', aimed: false, cost: 16 },
  phase: { name: 'Wall Phase', icon: '👻', text: 'Walk through one wall in a direction.', aimed: true, cost: 15 },
  tonic: { name: 'Might Tonic', icon: '💪', text: 'You can push iron crates in this room.', aimed: false, cost: 10 },
};

export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];

export interface CharDef {
  name: string;
  icon: string;
  text: string;
  cost: number;
}

export const CHARS: Record<CharId, CharDef> = {
  digger: { name: 'Digger', icon: '🧑‍🔧', text: '3 hearts. Starts with a Pull Glove.', cost: 0 },
  brute: { name: 'Brute', icon: '🦍', text: 'Pushes iron crates without might. 10% fewer moves per floor.', cost: 40 },
  thief: { name: 'Thief', icon: '🦹', text: 'Starts with 2 keys. Coins are worth double.', cost: 60 },
  monk: { name: 'Monk', icon: '🧘', text: '4 hearts. Starts with 2 Hourglasses.', cost: 90 },
};

/** Tools you unlock with bones. The others are in the pool from the start. */
export const LOCKED_TOOLS: ToolId[] = ['warp', 'phase'];
export const TOOL_UNLOCK_COST: Partial<Record<ToolId, number>> = { warp: 25, phase: 35 };

export const FLOORS = 10;

export interface FloorTheme {
  name: string;
  icon: string;
  wall: string;
  floor: string;
  floor2: string;
}

export const THEMES: FloorTheme[] = [
  { name: 'Dusty Cellar', icon: '🏚️', wall: '#5a4632', floor: '#2b2219', floor2: '#30261c' },
  { name: 'Bone Halls', icon: '🦴', wall: '#5e5a52', floor: '#26241f', floor2: '#2c2a24' },
  { name: 'Frost Vault', icon: '❄️', wall: '#3f5a6e', floor: '#1d2731', floor2: '#212d38' },
  { name: 'Ember Tomb', icon: '🔥', wall: '#6e3b2c', floor: '#2a1914', floor2: '#311d17' },
  { name: 'Crypt Heart', icon: '👑', wall: '#4e3a66', floor: '#1f1828', floor2: '#251d30' },
];

export const themeFor = (floor: number): FloorTheme => THEMES[Math.min(THEMES.length - 1, Math.floor(floor / 2))];

/**
 * Hand-made room shapes. `#` wall, `.` floor, `_` plate.
 * The crates start on the plates and the generator pulls them away (reverse play),
 * so every shape gives a room that can be solved.
 */
export const TEMPLATES: string[][] = [
  ['#######', '#.....#', '#.#_#.#', '#.....#', '#._#..#', '#.....#', '#######'],
  ['########', '#..#...#', '#..._..#', '##.##..#', '#...._.#', '#......#', '########'],
  ['#######', '##...##', '#..._.#', '#.#.#.#', '#._...#', '##...##', '#######'],
  ['########', '#......#', '#.##_#.#', '#......#', '#.#_##.#', '#......#', '########'],
  ['#########', '#...#...#', '#._...#.#', '#...#...#', '##.###.##', '#.....__#', '#########'],
  ['########', '###....#', '#..._#.#', '#.#....#', '#..._..#', '#..#..##', '########'],
  ['#########', '#.......#', '#.#_.#..#', '#...#.._#', '#._.....#', '#########'],
  ['########', '#....###', '#.##...#', '#.._#..#', '#..._..#', '###._..#', '###....#', '########'],
  ['#########', '##.....##', '#..#_#..#', '#._...._#', '#..#.#..#', '##.....##', '#########'],
  ['##########', '#....#...#', '#._..#._.#', '#........#', '#.##.##..#', '#.._.....#', '##########'],
];

export const ROOM_INFO = {
  puzzle: { icon: '📦', name: 'Crypt room', text: 'Solve the plates to open the door.' },
  stairs: { icon: '🪜', name: 'Stairs', text: 'The way down. Monsters guard it.' },
  treasure: { icon: '💰', name: 'Treasure room', text: 'Optional puzzle with a chest.' },
  vault: { icon: '🔒', name: 'Vault', text: 'Open it with a key 🗝️. No puzzle.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Spend gold on tools.' },
  shrine: { icon: '⛲', name: 'Shrine', text: 'Heal a heart or gain moves.' },
} as const;

export type RoomKind = keyof typeof ROOM_INFO;
