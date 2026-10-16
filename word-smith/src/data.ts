/** Static game data: letters, gems, books, potions, enemies and chapters. */

/** Tile letters. The tile `q` shows "Qu" and spells the two letters "qu". */
export const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
export const VOWELS = 'aeiou';

/** Letter values. Common letters 1, rare letters up to 4. */
export const VALUE: Record<string, number> = {
  a: 1, e: 1, i: 1, o: 1, n: 1, r: 1, s: 1, t: 1, l: 1,
  u: 2, d: 2, g: 2, h: 2, c: 2, m: 2, p: 2, b: 2,
  f: 3, w: 3, y: 3, k: 3, v: 3,
  j: 4, x: 4, q: 4, z: 4,
};

/** Weights of the letter bag (about English letter frequency). */
export const WEIGHT: Record<string, number> = {
  e: 12, a: 9, i: 8, o: 8, u: 4,
  n: 6, r: 6, t: 6, s: 6, l: 4, d: 4, g: 3, c: 3, m: 3, h: 3, p: 2, b: 2,
  f: 2, w: 2, y: 2, k: 1.2, v: 1.2,
  j: 0.5, x: 0.5, q: 0.5, z: 0.5,
};

/** Damage multiplier by word length in letters ("Qu" counts as 2). */
export function lengthMult(len: number): number {
  const t = [0, 0, 0, 1, 1.3, 1.6, 2, 2.4, 2.8, 3.2, 3.6];
  return len >= t.length ? 3.6 + (len - 10) * 0.4 : t[len];
}

export type GemId = 'ruby' | 'emerald' | 'sapphire' | 'amethyst' | 'topaz' | 'onyx' | 'jade' | 'diamond';

export interface GemDef {
  name: string;
  icon: string;
  color: string;
  text: string;
  /** 0 = always available, else the Archive cost in ink. */
  unlock: number;
}

export const GEMS: Record<GemId, GemDef> = {
  ruby: { name: 'Ruby', icon: '🔴', color: '#ef476f', text: 'The word deals +5 damage.', unlock: 0 },
  emerald: { name: 'Emerald', icon: '🟢', color: '#2ec27e', text: 'Heal 4 HP.', unlock: 0 },
  sapphire: { name: 'Sapphire', icon: '🔵', color: '#4cc9f0', text: 'Gain 6 block.', unlock: 0 },
  amethyst: { name: 'Amethyst', icon: '🟣', color: '#b388ff', text: 'The word deals ×1.5 damage.', unlock: 0 },
  topaz: { name: 'Topaz', icon: '🟡', color: '#ffd166', text: 'Gain 5 gold.', unlock: 0 },
  onyx: { name: 'Onyx', icon: '⚫', color: '#9e9e9e', text: 'The target attacks 1 turn later.', unlock: 0 },
  jade: { name: 'Jade', icon: '🍏', color: '#a7c957', text: 'Poison the target for 4.', unlock: 30 },
  diamond: { name: 'Diamond', icon: '💎', color: '#e0fbfc', text: 'The word deals double damage.', unlock: 50 },
};
export const GEM_IDS = Object.keys(GEMS) as GemId[];

export interface BookDef {
  name: string;
  icon: string;
  text: string;
  unlock: number;
}

export const BOOKS: Record<string, BookDef> = {
  atlas: { name: 'Zephyr Atlas', icon: '🗺️', text: 'Words with J, Q, X or Z deal double damage.', unlock: 0 },
  herbal: { name: 'Herbal Primer', icon: '🌿', text: 'Words of 5+ letters heal 2 HP.', unlock: 0 },
  first: { name: 'First Edition', icon: '📕', text: 'The first word of each fight is free: enemy timers do not move.', unlock: 0 },
  vowel: { name: 'Vowel Codex', icon: '🅰️', text: 'Vowels are worth +1.', unlock: 0 },
  long: { name: 'Long Tome', icon: '📜', text: 'Words of 6+ letters deal +50% damage.', unlock: 0 },
  iron: { name: 'Iron Binding', icon: '🛡️', text: 'Start each fight with 8 block.', unlock: 0 },
  gilt: { name: 'Gilt Edges', icon: '💰', text: '+50% gold from fights.', unlock: 0 },
  thorn: { name: 'Thorn Script', icon: '🌵', text: 'When an enemy hits you, it takes 3 damage.', unlock: 0 },
  ink: { name: 'Ink Blot', icon: '🖋️', text: 'Enemies attack 1 turn later at the start of each fight.', unlock: 0 },
  double: { name: 'Twin Letters', icon: '👯', text: 'Words with a double letter (like "ll") deal +6 damage.', unlock: 0 },
  short: { name: 'Short Story', icon: '✏️', text: 'Words of 3 or 4 letters deal +4 damage.', unlock: 0 },
  satchel: { name: 'Gem Satchel', icon: '👜', text: 'Gem tiles appear twice as often.', unlock: 0 },
  belt: { name: 'Potion Belt', icon: '🎽', text: '+1 potion slot. Get a Health Draught now.', unlock: 0 },
  vamp: { name: 'Vampire Verse', icon: '🧛', text: 'Heal 1 HP per 8 damage you deal.', unlock: 0 },
  shuffle: { name: 'Shuffle Charm', icon: '🔀', text: 'Scrambling the grid is free (enemy timers do not move).', unlock: 0 },
  ricochet: { name: 'Ricochet Rhyme', icon: '🎯', text: 'Overkill damage hits the next enemy.', unlock: 25 },
  echo: { name: 'Echo Chamber', icon: '🔔', text: 'Words that start with the last letter of your previous word deal +50%.', unlock: 25 },
  scholar: { name: 'Scholar Lens', icon: '🔍', text: 'Rare letters (value 3+) are worth +2.', unlock: 40 },
};
export const BOOK_IDS = Object.keys(BOOKS);

export type PotionId = 'heal' | 'fire' | 'water' | 'time' | 'muse';

export const POTIONS: Record<PotionId, { name: string; icon: string; text: string; cost: number }> = {
  heal: { name: 'Health Draught', icon: '🧪', text: 'Heal 20 HP.', cost: 18 },
  fire: { name: 'Fire Flask', icon: '🔥', text: 'Deal 20 damage to the target.', cost: 18 },
  water: { name: 'Clear Water', icon: '💧', text: 'Clean all locked, cracked and poisoned tiles.', cost: 12 },
  time: { name: 'Hourglass', icon: '⏳', text: 'All enemies attack 2 turns later.', cost: 15 },
  muse: { name: 'Muse Tonic', icon: '✨', text: 'Your next word deals double damage.', cost: 15 },
};
export const POTION_IDS = Object.keys(POTIONS) as PotionId[];

export type Ability = 'none' | 'lock' | 'poison' | 'crack' | 'scramble' | 'shield' | 'heal' | 'enrage' | 'drain' | 'steal';

export interface EnemyDef {
  name: string;
  icon: string;
  hp: number;
  atk: number;
  /** Turns between attacks. */
  timer: number;
  ability: Ability;
  /** Strength of the ability (tiles, block or heal). */
  n: number;
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  // Chapter 1: Dusty Library
  worm: { name: 'Bookworm', icon: '🐛', hp: 24, atk: 5, timer: 2, ability: 'none', n: 0, text: 'Chews pages. No tricks.' },
  bat: { name: 'Paper Bat', icon: '🦇', hp: 14, atk: 2, timer: 1, ability: 'none', n: 0, text: 'Weak, but bites every turn.' },
  squid: { name: 'Ink Squid', icon: '🦑', hp: 28, atk: 4, timer: 3, ability: 'crack', n: 3, text: 'Its ink cracks 3 tiles.' },
  mite: { name: 'Dust Mite', icon: '🕷️', hp: 20, atk: 3, timer: 2, ability: 'poison', n: 2, text: 'Poisons 2 tiles.' },
  gargoyle: { name: 'Gargoyle', icon: '🗿', hp: 75, atk: 9, timer: 3, ability: 'shield', n: 8, text: 'Gains 8 block when it attacks.' },
  owl: { name: 'Owl Archivist', icon: '🦉', hp: 150, atk: 10, timer: 3, ability: 'lock', n: 3, text: 'Locks 3 tiles when it attacks.' },
  // Chapter 2: Murmur Mire
  frog: { name: 'Bog Frog', icon: '🐸', hp: 36, atk: 7, timer: 2, ability: 'none', n: 0, text: 'Heavy tongue slap.' },
  leech: { name: 'Leech', icon: '🪱', hp: 30, atk: 5, timer: 2, ability: 'drain', n: 0, text: 'Heals by the damage it deals.' },
  wisp: { name: 'Wisp', icon: '🔥', hp: 26, atk: 5, timer: 2, ability: 'scramble', n: 0, text: 'Scrambles your grid.' },
  witch: { name: 'Bog Witch', icon: '🧙', hp: 40, atk: 6, timer: 3, ability: 'heal', n: 10, text: 'Heals all enemies 10.' },
  croc: { name: 'Old Croc', icon: '🐊', hp: 130, atk: 11, timer: 3, ability: 'enrage', n: 3, text: 'Hits 3 harder each attack.' },
  hydra: { name: 'Mire Hydra', icon: '🐍', hp: 260, atk: 11, timer: 2, ability: 'poison', n: 3, text: 'Poisons 3 tiles when it attacks.' },
  // Chapter 3: Babel Spire
  golem: { name: 'Scribe Golem', icon: '🤖', hp: 55, atk: 9, timer: 3, ability: 'shield', n: 10, text: 'Gains 10 block when it attacks.' },
  imp: { name: 'Vowel Imp', icon: '😈', hp: 40, atk: 6, timer: 2, ability: 'steal', n: 2, text: 'Turns 2 vowels into hard letters.' },
  mimic: { name: 'Mimic', icon: '📦', hp: 60, atk: 11, timer: 3, ability: 'lock', n: 2, text: 'Locks 2 tiles.' },
  wraith: { name: 'Wraith', icon: '👤', hp: 45, atk: 8, timer: 2, ability: 'crack', n: 2, text: 'Cracks 2 tiles.' },
  lich: { name: 'Lich', icon: '💀', hp: 180, atk: 13, timer: 3, ability: 'heal', n: 15, text: 'Heals all enemies 15.' },
  unspeller: { name: 'The Unspeller', icon: '👁️', hp: 400, atk: 15, timer: 3, ability: 'scramble', n: 2, text: 'Scrambles the grid and locks 2 tiles.' },
};

export interface ChapterDef {
  name: string;
  icon: string;
  /** Possible groups for normal fights. */
  groups: string[][];
  elite: string;
  boss: string;
  bossLine: string;
}

export const CHAPTERS: ChapterDef[] = [
  {
    name: 'Dusty Library',
    icon: '📚',
    groups: [['worm'], ['bat', 'bat'], ['squid'], ['mite', 'bat'], ['worm', 'bat'], ['mite', 'worm']],
    elite: 'gargoyle',
    boss: 'owl',
    bossLine: 'The Owl Archivist guards the last shelf.',
  },
  {
    name: 'Murmur Mire',
    icon: '🐸',
    groups: [['frog'], ['leech', 'wisp'], ['witch', 'frog'], ['wisp', 'wisp'], ['leech', 'frog'], ['witch', 'leech']],
    elite: 'croc',
    boss: 'hydra',
    bossLine: 'The Mire Hydra rises from the swamp.',
  },
  {
    name: 'Babel Spire',
    icon: '🗼',
    groups: [['golem'], ['imp', 'wraith'], ['mimic'], ['wraith', 'golem'], ['imp', 'mimic'], ['imp', 'imp', 'wraith']],
    elite: 'lich',
    boss: 'unspeller',
    bossLine: 'The Unspeller waits at the top of the spire.',
  },
];

/** Enemy HP and attack scale by chapter (tuned with the sim). */
export const HP_SCALE = [2, 2.7, 3.4];
export const ATK_SCALE = [1.5, 1.8, 2.1];
