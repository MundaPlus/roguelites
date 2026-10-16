/** Static game data: spells, runes, enemies, acts. */

export type Elem = 'fire' | 'frost' | 'volt';

export interface SpellDef {
  id: string;
  /** The word you type. */
  word: string;
  icon: string;
  kind: 'elem' | 'shape' | 'nova' | 'wall' | 'mend';
  cost: number;
  color: string;
  text: string;
}

export const SPELLS: Record<string, SpellDef> = {
  fire: { id: 'fire', word: 'fire', icon: '🔥', kind: 'elem', cost: 10, color: '#ff7b3a', text: 'Element. The next word deals +30% damage and burns for 3 s.' },
  frost: { id: 'frost', word: 'frost', icon: '❄️', kind: 'elem', cost: 10, color: '#8fd8ff', text: 'Element. The next word slows the target to 40% speed for 4 s.' },
  volt: { id: 'volt', word: 'volt', icon: '⚡', kind: 'elem', cost: 10, color: '#ffe14d', text: 'Element. The next word chains to 1 more enemy for 60% damage.' },
  lance: { id: 'lance', word: 'lance', icon: '🗡️', kind: 'shape', cost: 15, color: '#d6b4ff', text: 'Shape. The next word also hits every enemy in the same lane for 70%.' },
  nova: { id: 'nova', word: 'nova', icon: '💥', kind: 'nova', cost: 30, color: '#ff8ad8', text: 'Casts at once. Hits every enemy near you. Uses the primed element.' },
  wall: { id: 'wall', word: 'wall', icon: '🧱', kind: 'wall', cost: 25, color: '#c9a66b', text: 'Casts at once. Blocks the lane of the closest enemy for 6 s. Uses the primed element.' },
  mend: { id: 'mend', word: 'mend', icon: '💚', kind: 'mend', cost: 35, color: '#7ee08a', text: 'Casts at once. Heals 2 HP.' },
};

export const SPELL_ORDER = ['fire', 'frost', 'volt', 'lance', 'nova', 'wall', 'mend'];

export interface RuneDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const RUNES: Record<string, RuneDef> = {
  kindling: { id: 'kindling', name: 'Kindling', icon: '🕯️', text: 'Fire also spreads: a burning enemy that dies sets the closest enemy on fire.' },
  deepfreeze: { id: 'deepfreeze', name: 'Deep Freeze', icon: '🧊', text: 'Frost freezes the target in place for 1.5 s before the slow.' },
  arccoil: { id: 'arccoil', name: 'Arc Coil', icon: '🌀', text: 'Volt chains to 2 more enemies.' },
  widenova: { id: 'widenova', name: 'Wide Nova', icon: '⭕', text: 'Nova reaches 50% farther and deals +50% damage.' },
  stonewall: { id: 'stonewall', name: 'Stone Wall', icon: '🪨', text: 'Walls last twice as long.' },
  thornwall: { id: 'thornwall', name: 'Thorn Wall', icon: '🌵', text: 'Walls deal 4 damage per second to enemies that touch them.' },
  pierce: { id: 'pierce', name: 'Piercing Lance', icon: '📌', text: 'Lance deals full damage to every enemy in the lane.' },
  focus: { id: 'focus', name: 'Focus', icon: '🎯', text: 'Combo can go up to 30 (max ×2.5 damage).' },
  steady: { id: 'steady', name: 'Steady Hand', icon: '✋', text: 'A typo halves your combo instead of resetting it.' },
  well: { id: 'well', name: 'Mana Well', icon: '🏺', text: '+40 max mana.' },
  spring: { id: 'spring', name: 'Quick Spring', icon: '⛲', text: 'Mana refills 60% faster.' },
  frugal: { id: 'frugal', name: 'Frugal Ink', icon: '🖋️', text: 'Spells cost 25% less mana.' },
  sharp: { id: 'sharp', name: 'Sharp Mind', icon: '🧠', text: '+20% damage.' },
  longword: { id: 'longword', name: 'Long Words', icon: '📜', text: 'Words with 7 or more letters deal +40% damage.' },
  ward: { id: 'ward', name: 'Ward', icon: '🔰', text: 'Each fight starts with a ward that blocks one hit.' },
  font: { id: 'font', name: 'Full Font', icon: '💧', text: 'Each fight starts with full mana and fire primed for free.' },
  goldtongue: { id: 'goldtongue', name: 'Gold Tongue', icon: '🪙', text: '+30% gold from fights.' },
  echo: { id: 'echo', name: 'Echo', icon: '🔔', text: 'Every 5th word in a combo deals double damage.' },
  leech: { id: 'leech', name: 'Leech Quill', icon: '🩸', text: 'Every 12th word in a combo heals 1 HP.' },
};

export type Special = 'none' | 'split' | 'decoy' | 'shift' | 'zigzag' | 'support' | 'missile' | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  /** Pixels per second on the field. */
  speed: number;
  tier: 1 | 2 | 3 | 4;
  /** Damage when it reaches you. */
  dmg: number;
  shield?: number;
  special?: Special;
  size?: number;
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  // Act 1
  imp: { id: 'imp', name: 'Imp', icon: '😈', hp: 10, speed: 26, tier: 1, dmg: 1, text: 'Quick and weak.' },
  slime: { id: 'slime', name: 'Slime', icon: '🟢', hp: 14, speed: 14, tier: 2, dmg: 1, special: 'split', text: 'Splits into two slimelets when it dies.' },
  slimelet: { id: 'slimelet', name: 'Slimelet', icon: '🟩', hp: 6, speed: 22, tier: 1, dmg: 1, size: 20, text: 'A small piece of slime.' },
  goblin: { id: 'goblin', name: 'Goblin', icon: '👺', hp: 22, speed: 17, tier: 2, dmg: 1, text: 'Needs two words.' },
  bat: { id: 'bat', name: 'Bat', icon: '🦇', hp: 8, speed: 32, tier: 1, dmg: 1, special: 'zigzag', text: 'Fast. Flies in a zigzag.' },
  wisp: { id: 'wisp', name: 'Wisp', icon: '🎐', hp: 1, speed: 6, tier: 1, dmg: 0, special: 'decoy', text: 'Decoy (red word). Typing it costs 1 HP and your combo. It fades after 8 s.' },
  ogre: { id: 'ogre', name: 'Ogre Brute', icon: '👹', hp: 44, speed: 10, tier: 4, dmg: 3, size: 40, text: 'Elite. Long words, hits hard.' },
  treant: { id: 'treant', name: 'Elder Treant', icon: '🌳', hp: 100, speed: 0, tier: 4, dmg: 0, special: 'boss', size: 64, text: 'Boss. Throws acorns and calls imps and bats.' },
  acorn: { id: 'acorn', name: 'Acorn', icon: '🌰', hp: 1, speed: 44, tier: 1, dmg: 1, special: 'missile', size: 20, text: 'A missile from the boss.' },
  // Act 2
  skeleton: { id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 16, speed: 17, tier: 2, dmg: 1, shield: 1, text: 'Has a shield word (blue) to break first.' },
  icebat: { id: 'icebat', name: 'Ice Bat', icon: '🦇', hp: 10, speed: 34, tier: 1, dmg: 1, special: 'zigzag', text: 'Fast. Flies in a zigzag.' },
  golem: { id: 'golem', name: 'Ice Golem', icon: '🗿', hp: 40, speed: 9, tier: 3, dmg: 2, size: 36, text: 'Slow and tough. Hits for 2.' },
  wraith: { id: 'wraith', name: 'Wraith', icon: '👤', hp: 14, speed: 20, tier: 2, dmg: 1, special: 'shift', text: 'Its word changes every 3 s.' },
  shifter: { id: 'shifter', name: 'Shapeshifter', icon: '🎭', hp: 50, speed: 11, tier: 3, dmg: 3, shield: 1, special: 'shift', size: 40, text: 'Elite. Its word changes every 3 s, also while you type.' },
  queen: { id: 'queen', name: 'Frost Queen', icon: '👸', hp: 150, speed: 0, tier: 4, dmg: 0, special: 'boss', size: 64, text: 'Boss. Throws ice shards and calls skeletons and ice bats.' },
  shard: { id: 'shard', name: 'Ice Shard', icon: '❄️', hp: 1, speed: 50, tier: 1, dmg: 1, special: 'missile', size: 20, text: 'A missile from the boss.' },
  // Act 3
  knight: { id: 'knight', name: 'Storm Knight', icon: '🛡️', hp: 24, speed: 14, tier: 3, dmg: 2, shield: 2, text: 'Two shield words.' },
  drake: { id: 'drake', name: 'Drake', icon: '🐉', hp: 18, speed: 30, tier: 2, dmg: 1, text: 'Fast and sturdy.' },
  cultist: { id: 'cultist', name: 'Cultist', icon: '🦹', hp: 16, speed: 15, tier: 2, dmg: 1, special: 'support', text: 'Gives a shield word to an ally every 6 s.' },
  specter: { id: 'specter', name: 'Specter', icon: '👻', hp: 20, speed: 19, tier: 3, dmg: 1, special: 'shift', text: 'Its word changes every 3 s.' },
  lich: { id: 'lich', name: 'Dread Lich', icon: '🧟', hp: 64, speed: 10, tier: 4, dmg: 3, shield: 2, special: 'shift', size: 42, text: 'Elite. Long words that change, two shields.' },
  archmage: { id: 'archmage', name: 'Storm Archmage', icon: '🧛', hp: 210, speed: 0, tier: 4, dmg: 0, special: 'boss', size: 64, text: 'Boss. Throws sparks and calls knights and drakes.' },
  spark: { id: 'spark', name: 'Spark', icon: '⚡', hp: 1, speed: 56, tier: 1, dmg: 1, special: 'missile', size: 20, text: 'A missile from the boss.' },
};

export interface ActDef {
  name: string;
  icon: string;
  /** Weighted enemy pool for normal fights. */
  pool: [string, number][];
  elite: string;
  boss: string;
  missile: string;
  /** Minions the boss calls. */
  minions: string[];
  phrases: string[];
  sky: [string, string];
}

export const ACTS: ActDef[] = [
  {
    name: 'Whisper Woods',
    icon: '🌲',
    pool: [['imp', 5], ['slime', 3], ['goblin', 3], ['bat', 3], ['wisp', 1]],
    elite: 'ogre',
    boss: 'treant',
    missile: 'acorn',
    minions: ['imp', 'bat', 'goblin'],
    phrases: ['roots run deep', 'the forest remembers', 'leaves fall like rain', 'you shall not pass', 'bark and branch rise', 'moss covers all', 'old wood never breaks', 'the wind carries seeds'],
    sky: ['#0f2a1f', '#08140f'],
  },
  {
    name: 'Frost Caves',
    icon: '🧊',
    pool: [['skeleton', 4], ['icebat', 3], ['golem', 2], ['wraith', 3], ['imp', 2], ['wisp', 1]],
    elite: 'shifter',
    boss: 'queen',
    missile: 'shard',
    minions: ['skeleton', 'icebat', 'wraith'],
    phrases: ['winter never ends', 'cold hands and cold heart', 'the ice will hold you', 'snow buries every path', 'freeze in silence', 'my crown is made of frost', 'no warmth reaches here', 'sleep under the glacier'],
    sky: ['#0f2236', '#070f1a'],
  },
  {
    name: 'Storm Spire',
    icon: '⚡',
    pool: [['knight', 3], ['drake', 3], ['cultist', 2], ['specter', 3], ['icebat', 2], ['wisp', 1]],
    elite: 'lich',
    boss: 'archmage',
    missile: 'spark',
    minions: ['knight', 'drake', 'specter'],
    phrases: ['the storm obeys me', 'thunder breaks the sky', 'your words are mine', 'kneel before the tempest', 'every spell has a price', 'lightning writes your end', 'the tower touches heaven', 'silence is the last spell'],
    sky: ['#231a3a', '#0d0a1a'],
  },
];

/** Things the Grimoire can unlock between runs. */
export interface UnlockDef {
  id: string;
  kind: 'spell' | 'rune';
  cost: number;
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'frost', kind: 'spell', cost: 40 },
  { id: 'volt', kind: 'spell', cost: 50 },
  { id: 'wall', kind: 'spell', cost: 45 },
  { id: 'echo', kind: 'rune', cost: 60 },
  { id: 'leech', kind: 'rune', cost: 60 },
  { id: 'font', kind: 'rune', cost: 70 },
];

export const START_SPELLS = ['fire', 'nova'];

export interface DiffDef {
  id: string;
  name: string;
  icon: string;
  /** Enemy walk speed. */
  speed: number;
  /** Time between spawns and waves, and boss timers. Higher is slower. */
  pace: number;
  /** Enemy HP. */
  hp: number;
  /** How fast speed and HP grow per act. */
  ramp: number;
  /** Shield words added to each enemy (can be negative). */
  shield: number;
  /** Later acts may use longer words. */
  longer: boolean;
  text: string;
}

export const DIFFS: Record<string, DiffDef> = {
  relaxed: { id: 'relaxed', name: 'Relaxed', icon: '🐢', speed: 0.5, pace: 1.95, hp: 0.75, ramp: 0.1, shield: -1, longer: false, text: 'Slow enemies and calm waves. For about 35–45 WPM.' },
  normal: { id: 'normal', name: 'Normal', icon: '🧙', speed: 1, pace: 1, hp: 1, ramp: 1, shield: 0, longer: true, text: 'The standard pace. For about 50–60 WPM.' },
  swift: { id: 'swift', name: 'Swift', icon: '⚡', speed: 1.28, pace: 0.81, hp: 1.1, ramp: 1, shield: 0, longer: true, text: 'Fast enemies and dense waves. For 80+ WPM.' },
};

export const DIFF_ORDER = ['relaxed', 'normal', 'swift'];
