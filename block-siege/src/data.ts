/** Static game content: shapes, special blocks, enemies, relics and acts. */

export interface ShapeDef {
  id: string;
  name: string;
  /** Size of the square rotation box. */
  n: number;
  /** Cells in spawn rotation, as [x, y] with y going down. */
  cells: [number, number][];
  color: string;
  /** Shards needed to unlock in the Armory. 0 = always in the pool. */
  unlock: number;
  /** Starter shapes and enemy junk never show up as rewards. */
  pool: boolean;
  text: string;
}

export const SHAPES: Record<string, ShapeDef> = {
  I: { id: 'I', name: 'I', n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: '#4cc9f0', unlock: 0, pool: true, text: 'Four in a row. The Tetris piece.' },
  O: { id: 'O', name: 'O', n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]], color: '#ffd166', unlock: 0, pool: true, text: 'A 2×2 square.' },
  T: { id: 'T', name: 'T', n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: '#c77dff', unlock: 0, pool: true, text: 'The T-spin piece.' },
  S: { id: 'S', name: 'S', n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: '#7ee08a', unlock: 0, pool: true, text: 'A step to the right.' },
  Z: { id: 'Z', name: 'Z', n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: '#ef476f', unlock: 0, pool: true, text: 'A step to the left.' },
  J: { id: 'J', name: 'J', n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: '#4361ee', unlock: 0, pool: true, text: 'A hook to the left.' },
  L: { id: 'L', name: 'L', n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: '#ff9f43', unlock: 0, pool: true, text: 'A hook to the right.' },
  dot: { id: 'dot', name: 'Dot', n: 1, cells: [[0, 0]], color: '#f1eaf9', unlock: 0, pool: true, text: 'One cell. Fills any hole.' },
  duo: { id: 'duo', name: 'Domino', n: 2, cells: [[0, 0], [1, 0]], color: '#90e0ef', unlock: 0, pool: true, text: 'Two cells.' },
  i3: { id: 'i3', name: 'Tri-I', n: 3, cells: [[0, 1], [1, 1], [2, 1]], color: '#48cae4', unlock: 0, pool: true, text: 'Three in a row.' },
  v3: { id: 'v3', name: 'Corner', n: 2, cells: [[0, 0], [0, 1], [1, 1]], color: '#ffb4a2', unlock: 0, pool: true, text: 'A small corner of three cells.' },
  p5: { id: 'p5', name: 'P', n: 3, cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]], color: '#e9c46a', unlock: 0, pool: true, text: 'Pentomino. A square with a tail.' },
  u5: { id: 'u5', name: 'U', n: 3, cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]], color: '#2a9d8f', unlock: 6, pool: true, text: 'Pentomino. A cup.' },
  i5: { id: 'i5', name: 'Long I', n: 5, cells: [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]], color: '#00b4d8', unlock: 8, pool: true, text: 'Pentomino. Five in a row.' },
  plus: { id: 'plus', name: 'Plus', n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]], color: '#f72585', unlock: 10, pool: true, text: 'Pentomino. A cross. Hard to place.' },
  junk: { id: 'junk', name: 'Rubble', n: 3, cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]], color: '#6c757d', unlock: 0, pool: false, text: 'Junk from an enemy. Gone after the fight.' },
};

export const SHAPE_IDS = Object.keys(SHAPES);
export const STANDARD = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export interface SpecialDef {
  id: string;
  icon: string;
  name: string;
  color: string;
  unlock: number;
  /** Effect text per level (1 and 2). */
  text: [string, string];
}

export const SPECIALS: Record<string, SpecialDef> = {
  fire: { id: 'fire', icon: '🔥', name: 'Fire', color: '#ff7b00', unlock: 0, text: ['Burns the enemy for 6 over 3 s.', 'Burns the enemy for 12 over 6 s.'] },
  ice: { id: 'ice', icon: '❄️', name: 'Ice', color: '#a2d2ff', unlock: 0, text: ['The enemy timer runs at half speed for 5 s.', 'The enemy timer runs at half speed for 8 s.'] },
  heart: { id: 'heart', icon: '❤️', name: 'Heart', color: '#ff4d6d', unlock: 0, text: ['Heals you 2 HP.', 'Heals you 4 HP.'] },
  bomb: { id: 'bomb', icon: '💣', name: 'Bomb', color: '#adb5bd', unlock: 6, text: ['Clears the 3×3 area and deals 4.', 'Clears the 5×3 area and deals 8.'] },
  gold: { id: 'gold', icon: '🪙', name: 'Gold', color: '#ffd166', unlock: 5, text: ['Gives 4 gold.', 'Gives 9 gold.'] },
  star: { id: 'star', icon: '⭐', name: 'Star', color: '#fff3b0', unlock: 8, text: ['The clear deals +50% damage.', 'The clear deals double damage.'] },
};

export const SPECIAL_IDS = Object.keys(SPECIALS);

/** One card of the piece bag. */
export interface Card {
  s: string;
  /** Special block id, if the piece carries one. */
  x?: string;
  /** Level of the special block (1 or 2). */
  l?: number;
}

export type MoveKind = 'garbage' | 'hit' | 'speed' | 'lock' | 'shield' | 'blind' | 'heal' | 'junk';

export interface Move {
  k: MoveKind;
  n: number;
}

export const MOVE_INFO: Record<MoveKind, { icon: string; text: (n: number) => string }> = {
  garbage: { icon: '🧱', text: (n) => `Pushes ${n} garbage row${n > 1 ? 's' : ''} into your well` },
  hit: { icon: '⚔️', text: (n) => `Hits you for ${n}` },
  speed: { icon: '⏩', text: (n) => `Speeds up the drop for ${n} s` },
  lock: { icon: '🔒', text: (n) => `Locks ${n} cells of your stack` },
  shield: { icon: '🛡️', text: (n) => `Gains ${n} shield` },
  blind: { icon: '🌫️', text: (n) => `Hides your next queue for ${n} s` },
  heal: { icon: '💚', text: (n) => `Heals itself for ${n}` },
  junk: { icon: '🪨', text: (n) => `Puts ${n} Rubble piece${n > 1 ? 's' : ''} in your queue` },
};

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  /** Seconds between attacks. */
  every: number;
  /** Attacks in order. The list repeats. */
  moves: Move[];
}

const m = (k: MoveKind, n: number): Move => ({ k, n });

export const ENEMIES: Record<string, EnemyDef> = {
  // Act 1
  slime: { id: 'slime', name: 'Slime', icon: '🟢', hp: 30, every: 6, moves: [m('garbage', 1), m('hit', 5)] },
  sapper: { id: 'sapper', name: 'Goblin Sapper', icon: '🧨', hp: 34, every: 6, moves: [m('garbage', 1), m('lock', 2), m('hit', 5)] },
  rats: { id: 'rats', name: 'Rat Swarm', icon: '🐀', hp: 26, every: 5, moves: [m('hit', 3), m('hit', 3), m('garbage', 1)] },
  archer: { id: 'archer', name: 'Archer', icon: '🏹', hp: 30, every: 5.5, moves: [m('hit', 6), m('speed', 6)] },
  ogre: { id: 'ogre', name: 'Ogre', icon: '👹', hp: 70, every: 6, moves: [m('garbage', 2), m('hit', 8), m('shield', 8), m('hit', 8)] },
  tower: { id: 'tower', name: 'Siege Tower', icon: '🗼', hp: 120, every: 5.5, moves: [m('garbage', 2), m('speed', 7), m('hit', 10), m('shield', 12), m('hit', 8)] },
  // Act 2
  skeleton: { id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 34, every: 6, moves: [m('garbage', 1), m('hit', 6)] },
  wraith: { id: 'wraith', name: 'Wraith', icon: '👻', hp: 30, every: 6, moves: [m('blind', 8), m('hit', 6), m('garbage', 1), m('hit', 5)] },
  spider: { id: 'spider', name: 'Cave Spider', icon: '🕷️', hp: 36, every: 6, moves: [m('lock', 3), m('hit', 5), m('garbage', 1)] },
  cultist: { id: 'cultist', name: 'Cultist', icon: '🧙', hp: 32, every: 6.5, moves: [m('junk', 2), m('hit', 6), m('heal', 8), m('garbage', 1)] },
  knight: { id: 'knight', name: 'Bone Knight', icon: '⚔️', hp: 80, every: 6, moves: [m('shield', 10), m('garbage', 2), m('hit', 9), m('hit', 7)] },
  lich: { id: 'lich', name: 'Lich', icon: '☠️', hp: 150, every: 5.5, moves: [m('junk', 2), m('hit', 9), m('garbage', 2), m('blind', 8), m('hit', 10), m('lock', 3)] },
  // Act 3
  gargoyle: { id: 'gargoyle', name: 'Gargoyle', icon: '🗿', hp: 40, every: 6, moves: [m('garbage', 2), m('hit', 6), m('shield', 8)] },
  stormmage: { id: 'stormmage', name: 'Storm Mage', icon: '🌩️', hp: 34, every: 6, moves: [m('speed', 7), m('garbage', 1), m('hit', 6)] },
  imp: { id: 'imp', name: 'Imp', icon: '😈', hp: 30, every: 5, moves: [m('junk', 1), m('hit', 4), m('hit', 4)] },
  harpy: { id: 'harpy', name: 'Harpy', icon: '🦅', hp: 36, every: 5.5, moves: [m('hit', 6), m('garbage', 1), m('lock', 2)] },
  golem: { id: 'golem', name: 'Iron Golem', icon: '🤖', hp: 90, every: 6.5, moves: [m('garbage', 3), m('hit', 10), m('shield', 14)] },
  dragon: { id: 'dragon', name: 'Storm Dragon', icon: '🐉', hp: 215, every: 5, moves: [m('garbage', 2), m('hit', 10), m('speed', 7), m('hit', 12), m('junk', 2), m('shield', 15), m('garbage', 3)] },
};

export interface ActDef {
  name: string;
  icon: string;
  enemies: string[];
  elite: string;
  boss: string;
  /** Enemy HP multiplier. */
  hpMul: number;
  /** Enemy hit damage multiplier. */
  hitMul: number;
  /** Rows per second at the start of a fight. */
  gravity: number;
  bg: string;
}

export const ACTS: ActDef[] = [
  { name: 'Outer Walls', icon: '🏰', enemies: ['slime', 'sapper', 'rats', 'archer'], elite: 'ogre', boss: 'tower', hpMul: 1, hitMul: 1, gravity: 0.9, bg: '#2a1530' },
  { name: 'Catacombs', icon: '🕯️', enemies: ['skeleton', 'wraith', 'spider', 'cultist'], elite: 'knight', boss: 'lich', hpMul: 1.6, hitMul: 1.75, gravity: 1.3, bg: '#151a2e' },
  { name: 'Sky Citadel', icon: '⛈️', enemies: ['gargoyle', 'stormmage', 'imp', 'harpy'], elite: 'golem', boss: 'dragon', hpMul: 2.3, hitMul: 2.4, gravity: 1.8, bg: '#10242a' },
];

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  unlock: number;
}

export const RELICS: Record<string, RelicDef> = {
  twinhold: { id: 'twinhold', name: 'Twin Pouch', icon: '👝', text: 'The hold slot holds 2 pieces.', unlock: 0 },
  spin: { id: 'spin', name: 'Spinning Top', icon: '🌀', text: 'T-spins deal double damage.', unlock: 0 },
  whetstone: { id: 'whetstone', name: 'Whetstone', icon: '🗡️', text: 'All line damage +25%.', unlock: 0 },
  feather: { id: 'feather', name: 'Feather', icon: '🪶', text: 'Pieces fall 30% slower.', unlock: 0 },
  anchor: { id: 'anchor', name: 'Anchor', icon: '⚓', text: 'Garbage attacks push 1 row less.', unlock: 0 },
  lockpick: { id: 'lockpick', name: 'Lockpick', icon: '🗝️', text: 'Lock attacks fail.', unlock: 0 },
  drum: { id: 'drum', name: 'War Drum', icon: '🥁', text: 'Combo bonus is doubled.', unlock: 0 },
  helm: { id: 'helm', name: 'Iron Helm', icon: '⛑️', text: 'A top-out costs half the HP.', unlock: 0 },
  frost: { id: 'frost', name: 'Frost Core', icon: '🧊', text: 'Enemy timers run 15% slower.', unlock: 0 },
  piggy: { id: 'piggy', name: 'Piggy Bank', icon: '🐷', text: '+30% gold from fights.', unlock: 0 },
  prism: { id: 'prism', name: 'Prism', icon: '🔮', text: 'Every 8th piece carries a random special block.', unlock: 0 },
  fang: { id: 'fang', name: 'Vampire Fang', icon: '🦷', text: 'Heal 2 HP for each clear of 3 or more lines.', unlock: 0 },
  spyglass: { id: 'spyglass', name: 'Spyglass', icon: '🔭', text: 'See 5 next pieces. Blind attacks fail.', unlock: 0 },
  thorns: { id: 'thorns', name: 'Thorn Mail', icon: '🌵', text: 'When an enemy hits you, it takes 5 damage.', unlock: 8 },
  gloves: { id: 'gloves', name: 'Sticky Gloves', icon: '🧤', text: 'Lock delay is 1 s instead of 0.5 s.', unlock: 6 },
  crown: { id: 'crown', name: 'Perfect Crown', icon: '👑', text: 'Tetrises (4 lines) deal +50% damage.', unlock: 10 },
};

export const RELIC_IDS = Object.keys(RELICS);
