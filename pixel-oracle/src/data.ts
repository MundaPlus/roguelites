/** Game content: monsters, floors, spells, charms and meta unlocks. */

export type Trait = 'none' | 'fog' | 'enrage' | 'drain' | 'curse';

export const TRAITS: Record<Trait, { icon: string; name: string; text: string }> = {
  none: { icon: '', name: '', text: '' },
  fog: { icon: '🌫️', name: 'Fog', text: 'Some clues are hidden (shown as ?). The puzzle is still solvable without them.' },
  enrage: { icon: '💢', name: 'Enrage', text: 'Each mistake adds +1 damage to the next mistakes.' },
  drain: { icon: '🩸', name: 'Drain', text: 'Each mistake also burns 1 mana.' },
  curse: { icon: '🕯️', name: 'Curse', text: 'Spells cost +1 mana in this fight.' },
};

export interface MonsterDef {
  id: string; // = picture id
  icon: string;
  dmg: number;
  trait: Trait;
  fog?: number;
  pack: 'base' | 'sea' | 'star';
}

export const MONSTERS: Record<string, MonsterDef> = {
  slime: { id: 'slime', icon: '🟢', dmg: 1, trait: 'none', pack: 'base' },
  bat: { id: 'bat', icon: '🦇', dmg: 1, trait: 'fog', fog: 1, pack: 'base' },
  spider: { id: 'spider', icon: '🕷️', dmg: 1, trait: 'enrage', pack: 'base' },
  rat: { id: 'rat', icon: '🐀', dmg: 1, trait: 'drain', pack: 'base' },
  crab: { id: 'crab', icon: '🦀', dmg: 1, trait: 'none', pack: 'sea' },
  goblin: { id: 'goblin', icon: '👺', dmg: 1, trait: 'enrage', pack: 'base' },
  skull: { id: 'skull', icon: '💀', dmg: 2, trait: 'none', pack: 'base' },
  ghost: { id: 'ghost', icon: '👻', dmg: 1, trait: 'fog', fog: 2, pack: 'base' },
  snake: { id: 'snake', icon: '🐍', dmg: 1, trait: 'drain', pack: 'base' },
  fish: { id: 'fish', icon: '🐟', dmg: 1, trait: 'curse', pack: 'sea' },
  ufo: { id: 'ufo', icon: '🛸', dmg: 2, trait: 'fog', fog: 2, pack: 'star' },
  golem: { id: 'golem', icon: '🗿', dmg: 2, trait: 'none', pack: 'base' },
  wolf: { id: 'wolf', icon: '🐺', dmg: 1, trait: 'enrage', pack: 'base' },
  wraith: { id: 'wraith', icon: '👤', dmg: 1, trait: 'curse', pack: 'base' },
  mimic: { id: 'mimic', icon: '📦', dmg: 2, trait: 'drain', pack: 'base' },
  squid: { id: 'squid', icon: '🦑', dmg: 2, trait: 'fog', fog: 3, pack: 'sea' },
  demon: { id: 'demon', icon: '👿', dmg: 2, trait: 'enrage', pack: 'base' },
  dragon: { id: 'dragon', icon: '🐉', dmg: 3, trait: 'none', pack: 'base' },
  eye: { id: 'eye', icon: '👁️', dmg: 2, trait: 'fog', fog: 3, pack: 'base' },
  lich: { id: 'lich', icon: '🧙', dmg: 2, trait: 'curse', pack: 'base' },
  whale: { id: 'whale', icon: '🐋', dmg: 2, trait: 'drain', pack: 'sea' },
  // Guardians
  kingslime: { id: 'kingslime', icon: '👑', dmg: 1, trait: 'none', pack: 'base' },
  spiderqueen: { id: 'spiderqueen', icon: '🕸️', dmg: 1, trait: 'fog', fog: 2, pack: 'base' },
  troll: { id: 'troll', icon: '👹', dmg: 2, trait: 'none', pack: 'base' },
  boneknight: { id: 'boneknight', icon: '⚔️', dmg: 2, trait: 'curse', pack: 'base' },
  firegolem: { id: 'firegolem', icon: '🔥', dmg: 2, trait: 'enrage', pack: 'base' },
  serpent: { id: 'serpent', icon: '🌌', dmg: 2, trait: 'fog', fog: 3, pack: 'base' },
  voideye: { id: 'voideye', icon: '🌀', dmg: 2, trait: 'drain', pack: 'base' },
  shadow: { id: 'shadow', icon: '🔮', dmg: 3, trait: 'fog', fog: 4, pack: 'base' },
};

export interface FloorDef {
  name: string;
  icon: string;
  /** Picture sizes for the doors of this floor. */
  sizes: number[];
  /** Size range of random rune grids. */
  rune: [number, number];
  guardian: string;
}

export const FLOORS: FloorDef[] = [
  { name: 'Mossy Steps', icon: '🌿', sizes: [5], rune: [5, 6], guardian: 'kingslime' },
  { name: 'Spider Cellar', icon: '🕸️', sizes: [5, 8], rune: [6, 7], guardian: 'spiderqueen' },
  { name: 'Troll Bridge', icon: '🌉', sizes: [8], rune: [7, 8], guardian: 'troll' },
  { name: 'Bone Crypt', icon: '⚰️', sizes: [8, 10], rune: [8, 9], guardian: 'boneknight' },
  { name: 'Ember Forge', icon: '⚒️', sizes: [10], rune: [9, 10], guardian: 'firegolem' },
  { name: 'Star Library', icon: '📚', sizes: [10, 12], rune: [10, 11], guardian: 'serpent' },
  { name: 'Void Gate', icon: '🌀', sizes: [12], rune: [11, 12], guardian: 'voideye' },
  { name: 'Oracle Spire', icon: '🔮', sizes: [12, 15], rune: [12, 13], guardian: 'shadow' },
];

export type SpellTarget = 'cell' | 'line' | 'none';

export interface SpellDef {
  id: string;
  icon: string;
  name: string;
  cost: number;
  target: SpellTarget;
  text: string;
}

export const SPELLS: Record<string, SpellDef> = {
  peek: { id: 'peek', icon: '👁️', name: 'Peek', cost: 2, target: 'cell', text: 'Check one cell. It is painted or crossed out for you.' },
  clear: { id: 'clear', icon: '✖️', name: 'Clear Line', cost: 2, target: 'line', text: 'Cross out every empty cell of a row or column.' },
  reveal: { id: 'reveal', icon: '☀️', name: 'Reveal Line', cost: 3, target: 'line', text: 'Solve a whole row or column.' },
  insight: { id: 'insight', icon: '💡', name: 'Insight', cost: 3, target: 'none', text: 'The oracle finds the next logical step and does it.' },
  mend: { id: 'mend', icon: '❤️‍🩹', name: 'Mend', cost: 3, target: 'none', text: 'Heal 3 HP.' },
  ward: { id: 'ward', icon: '🛡️', name: 'Ward', cost: 2, target: 'none', text: 'The next 2 mistakes in this puzzle cost no HP.' },
  cross: { id: 'cross', icon: '✚', name: 'Cross Sight', cost: 5, target: 'cell', text: 'Solve the row and the column through a cell.' },
};

export const BASE_SPELLS = ['peek', 'clear', 'reveal'];

export interface CharmDef {
  id: string;
  icon: string;
  name: string;
  text: string;
}

export const CHARMS: Record<string, CharmDef> = {
  quill: { id: 'quill', icon: '🪶', name: 'Forgiving Quill', text: 'The first mistake in each puzzle costs no HP.' },
  prism: { id: 'prism', icon: '🔷', name: 'Mana Prism', text: 'Clean solves give +1 more mana.' },
  coin: { id: 'coin', icon: '🪙', name: 'Lucky Coin', text: '+40% gold from puzzles.' },
  heartstone: { id: 'heartstone', icon: '💗', name: 'Heartstone', text: '+3 max HP and heal 3.' },
  bandage: { id: 'bandage', icon: '🩹', name: 'Field Dressing', text: 'Heal 1 HP after each solved puzzle.' },
  lens: { id: 'lens', icon: '🔍', name: 'Oracle Lens', text: 'The first Peek in each puzzle is free.' },
  keyring: { id: 'keyring', icon: '💍', name: 'Key Ring', text: 'Key pictures give 2 keys.' },
  well: { id: 'well', icon: '🏺', name: 'Mana Well', text: '+3 max mana and +2 mana.' },
  calm: { id: 'calm', icon: '🍵', name: 'Calm Tea', text: 'Monsters deal 1 less damage per mistake (at least 1).' },
  lantern: { id: 'lantern', icon: '🏮', name: 'Lantern', text: 'Fog hides 2 fewer clues.' },
  compass: { id: 'compass', icon: '🧭', name: 'Compass', text: 'Mystery doors show what they hold.' },
  chart: { id: 'chart', icon: '🗺️', name: 'Star Chart', text: 'Each puzzle starts with 2 extra painted cells.' },
  amulet: { id: 'amulet', icon: '🧿', name: 'Ward Amulet', text: 'Start each monster fight with 1 Ward.' },
  hourglass: { id: 'hourglass', icon: '⏳', name: 'Sand Glass', text: 'Guardians deal 1 less damage per mistake (at least 1).' },
};

export interface UnlockDef {
  id: string;
  icon: string;
  name: string;
  text: string;
  cost: number;
  kind: 'spell' | 'pack';
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'insight', icon: '💡', name: 'Insight', text: 'Spell (3 mana): the oracle does the next logical step.', cost: 25, kind: 'spell' },
  { id: 'mend', icon: '❤️‍🩹', name: 'Mend', text: 'Spell (3 mana): heal 3 HP.', cost: 35, kind: 'spell' },
  { id: 'ward', icon: '🛡️', name: 'Ward', text: 'Spell (2 mana): the next 2 mistakes cost no HP.', cost: 40, kind: 'spell' },
  { id: 'cross', icon: '✚', name: 'Cross Sight', text: 'Spell (5 mana): solve a row and a column.', cost: 50, kind: 'spell' },
  { id: 'sea', icon: '🌊', name: 'Deep Sea pack', text: 'Pictures: Crab, Angler Fish, Kraken Spawn, Leviathan, Shell.', cost: 30, kind: 'pack' },
  { id: 'star', icon: '🌠', name: 'Starfall pack', text: 'Pictures: Saucer, Rocket, Ringed Planet, Stars.', cost: 30, kind: 'pack' },
];

export const START = { hp: 8, mana: 3, maxMana: 9 };
