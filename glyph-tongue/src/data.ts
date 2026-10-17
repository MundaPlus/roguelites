/** Static content: foes, acts, charms and meta perks. */

export type Intent =
  | { t: 'atk'; n: number; hits?: number }
  | { t: 'guard'; n: number }
  | { t: 'buff'; n: number }
  | { t: 'heal'; n: number }
  | { t: 'silence'; n: number }
  | { t: 'venom'; n: number }
  | { t: 'summon'; id: string }
  | { t: 'idle' };

export interface FoeDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  pattern: Intent[];
  /** Start the pattern at a random point. */
  shuffle?: boolean;
}

const F = (id: string, name: string, icon: string, hp: number, pattern: Intent[], shuffle = true): FoeDef => ({ id, name, icon, hp, pattern, shuffle });

export const FOES: Record<string, FoeDef> = {
  strawDummy: F('strawDummy', 'Straw Dummy', '🎎', 60, [{ t: 'idle' }], false),
  twigDummy: F('twigDummy', 'Twig Dummy', '🪆', 40, [{ t: 'idle' }], false),
  // Act 1: The Mire
  slime: F('slime', 'Bog Slime', '🟢', 22, [{ t: 'atk', n: 5 }, { t: 'atk', n: 5 }, { t: 'guard', n: 6 }]),
  imp: F('imp', 'Ink Imp', '😈', 16, [{ t: 'atk', n: 4 }, { t: 'atk', n: 7 }]),
  moth: F('moth', 'Mute Moth', '🦋', 15, [{ t: 'silence', n: 1 }, { t: 'atk', n: 5 }]),
  toad: F('toad', 'Spit Toad', '🐸', 20, [{ t: 'venom', n: 3 }, { t: 'atk', n: 4 }]),
  tutor: F('tutor', 'Stone Tutor', '🗿', 48, [{ t: 'atk', n: 8 }, { t: 'guard', n: 10 }, { t: 'atk', n: 11 }], false),
  golem: F('golem', 'Babbling Golem', '🪨', 80, [{ t: 'atk', n: 9 }, { t: 'guard', n: 12 }, { t: 'atk', n: 4, hits: 3 }, { t: 'buff', n: 2 }], false),
  // Act 2: The Archive
  wolf: F('wolf', 'Paper Wolf', '🐺', 28, [{ t: 'atk', n: 7 }, { t: 'atk', n: 9 }]),
  mimic: F('mimic', 'Scroll Mimic', '📦', 34, [{ t: 'guard', n: 10 }, { t: 'atk', n: 12 }]),
  wisp: F('wisp', 'Hush Wisp', '👻', 22, [{ t: 'silence', n: 2 }, { t: 'atk', n: 6 }]),
  inkling: F('inkling', 'Inkling', '🦑', 14, [{ t: 'atk', n: 5 }, { t: 'venom', n: 2 }]),
  archivist: F('archivist', 'Archivist', '🦉', 75, [{ t: 'atk', n: 10 }, { t: 'heal', n: 10 }, { t: 'atk', n: 13 }], false),
  wraith: F('wraith', 'Scribe Wraith', '🕯️', 125, [{ t: 'silence', n: 2 }, { t: 'atk', n: 12 }, { t: 'venom', n: 4 }, { t: 'guard', n: 14 }, { t: 'summon', id: 'inkling' }], false),
  // Act 3: The Spire
  knight: F('knight', 'Glyph Knight', '🛡️', 42, [{ t: 'guard', n: 12 }, { t: 'atk', n: 13 }]),
  bat: F('bat', 'Echo Bat', '🦇', 28, [{ t: 'atk', n: 6, hits: 2 }, { t: 'atk', n: 8 }]),
  eater: F('eater', 'Rune Eater', '🐛', 36, [{ t: 'silence', n: 1 }, { t: 'atk', n: 11 }, { t: 'buff', n: 2 }]),
  adder: F('adder', 'Spire Adder', '🐍', 30, [{ t: 'venom', n: 4 }, { t: 'atk', n: 9 }]),
  hydra: F('hydra', 'Grammar Hydra', '🐉', 110, [{ t: 'atk', n: 8, hits: 2 }, { t: 'buff', n: 3 }, { t: 'atk', n: 15 }], false),
  unspeaker: F('unspeaker', 'The Unspeaker', '🌑', 190, [{ t: 'atk', n: 14 }, { t: 'silence', n: 3 }, { t: 'atk', n: 8, hits: 2 }, { t: 'guard', n: 20 }, { t: 'summon', id: 'eater' }], false),
};

export interface ActDef {
  name: string;
  icon: string;
  pool: string[];
  size: [number, number];
  elite: string;
  boss: string;
  hpMul: number;
  atkMul: number;
  /** Damage per silent rune in a real fight ("wild magic"). */
  wild: number;
}

export const ACTS: ActDef[] = [
  { name: 'The Mire', icon: '🌿', pool: ['slime', 'imp', 'moth', 'toad'], size: [1, 2], elite: 'tutor', boss: 'golem', hpMul: 1, atkMul: 1, wild: 1 },
  { name: 'The Archive', icon: '📚', pool: ['wolf', 'mimic', 'wisp', 'inkling'], size: [2, 2], elite: 'archivist', boss: 'wraith', hpMul: 1.05, atkMul: 1.1, wild: 2 },
  { name: 'The Spire', icon: '🗼', pool: ['knight', 'bat', 'eater', 'adder'], size: [2, 3], elite: 'hydra', boss: 'unspeaker', hpMul: 1.05, atkMul: 1.1, wild: 3 },
];

export interface CharmDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const CHARMS: Record<string, CharmDef> = {
  mirror: { id: 'mirror', name: 'Mirror Ward', icon: '🪞', text: 'Start each fight with 6 shield.' },
  lantern: { id: 'lantern', name: 'Lantern', icon: '🏮', text: 'Test rooms and study give 3 more casts.' },
  lens: { id: 'lens', name: 'Lens of Reading', icon: '🔍', text: 'The cast log shows which element each rune bound to.' },
  fang: { id: 'fang', name: 'Fang', icon: '🦷', text: 'Heal 1 for each foe your spell damages.' },
  cloak: { id: 'cloak', name: 'Thick Cloak', icon: '🧥', text: '+10 max HP.' },
  calm: { id: 'calm', name: 'Calm Mind', icon: '🧘', text: 'Wild magic deals 1 less per silent rune.' },
  inkwell: { id: 'inkwell', name: 'Ink Well', icon: '🖋️', text: '+12 gold after each fight.' },
  phoenix: { id: 'phoenix', name: 'Phoenix Quill', icon: '🪶', text: 'Once per run, survive a killing blow with 12 HP.' },
};

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  cost: number;
}

export const PERKS: PerkDef[] = [
  { id: 'linguist', name: 'Linguist', icon: '🗣️', text: 'Start each run with one grammar rule revealed.', cost: 6 },
  { id: 'candle', name: 'Long Candle', icon: '🕯️', text: 'Test rooms give 3 more casts.', cost: 4 },
  { id: 'seventh', name: 'Seventh Rune', icon: '🔓', text: 'Start runs with 7 runes instead of 6.', cost: 8 },
  { id: 'satchel', name: 'Scholar Satchel', icon: '🎒', text: 'Start runs with 1 hint scroll.', cost: 5 },
  { id: 'hide', name: 'Tough Hide', icon: '🦏', text: '+8 max HP.', cost: 5 },
];
