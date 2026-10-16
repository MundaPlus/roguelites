/** Static game data: suits, spells, relics, potions, enemies, acts and heroes. */

export type Color = 'r' | 'y' | 'g' | 'b';
export const COLORS: Color[] = ['r', 'y', 'g', 'b'];
export type Mana = Record<Color, number>;

/** Suit index 0..3. Each suit gives mana of one color. */
export const SUITS = ['♥', '♦', '♣', '♠'];
export const SUIT_COLOR: Color[] = ['r', 'y', 'g', 'b'];
export const COLOR_INFO: Record<Color, { name: string; css: string; suit: string }> = {
  r: { name: 'Ruby', css: '#ff4d6d', suit: '♥' },
  y: { name: 'Amber', css: '#ffb703', suit: '♦' },
  g: { name: 'Jade', css: '#52d17c', suit: '♣' },
  b: { name: 'Azure', css: '#4cc9f0', suit: '♠' },
};
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const MANA_CAP = 12;

// ---------- Spells ----------

export type Target = 'none' | 'top' | 'dir';

export interface SpellDef {
  name: string;
  icon: string;
  cost: Partial<Mana>;
  target: Target;
  text: string;
}

export const SPELLS: Record<string, SpellDef> = {
  nudge: { name: 'Nudge', icon: '↕️', cost: { b: 2 }, target: 'dir', text: 'Your card goes 1 up or 1 down.' },
  joker: { name: 'Joker', icon: '🃏', cost: { b: 3, y: 1 }, target: 'none', text: 'Your card becomes wild. It matches any card.' },
  fireball: { name: 'Fireball', icon: '🔥', cost: { r: 3 }, target: 'top', text: 'Burn one top card, also a locked one.' },
  cleave: { name: 'Cleave', icon: '🪓', cost: { r: 4 }, target: 'top', text: 'Remove the top 2 cards of a column.' },
  quake: { name: 'Quake', icon: '🌋', cost: { g: 4 }, target: 'none', text: 'Remove the top card of 3 random columns.' },
  meteor: { name: 'Meteor', icon: '☄️', cost: { r: 5, g: 1 }, target: 'none', text: 'Remove 5 random cards anywhere in the tableau.' },
  sight: { name: 'Foresight', icon: '👁️', cost: { b: 1 }, target: 'none', text: 'Turn all face-down cards face up.' },
  shatter: { name: 'Shatter', icon: '🔨', cost: { r: 2 }, target: 'none', text: 'Break all locks, armor and bombs.' },
  bulwark: { name: 'Bulwark', icon: '🛡️', cost: { y: 3 }, target: 'none', text: 'Gain 4 shield. Shield blocks lost cards and HP.' },
  mend: { name: 'Mend', icon: '🌿', cost: { g: 3 }, target: 'none', text: 'Add 3 cards to your stock.' },
  rejuv: { name: 'Rejuvenate', icon: '💚', cost: { g: 4 }, target: 'none', text: 'Heal 5 HP.' },
  haste: { name: 'Haste', icon: '💨', cost: { y: 2 }, target: 'none', text: 'Draw a card. The enemy does not act.' },
  smoke: { name: 'Smoke', icon: '🌫️', cost: { y: 3, g: 1 }, target: 'none', text: 'Your next 2 draws give the enemy no turn.' },
  frost: { name: 'Frost', icon: '❄️', cost: { b: 3 }, target: 'none', text: 'All enemy timers and bombs wait 2 more turns.' },
  sleight: { name: 'Sleight', icon: '🔀', cost: { b: 2, y: 1 }, target: 'top', text: 'Swap your card with a top card.' },
  prism: { name: 'Prism', icon: '🔷', cost: { g: 2 }, target: 'none', text: 'Gain 1 Ruby, 1 Amber and 1 Azure mana.' },
  longshot: { name: 'Long Shot', icon: '🏹', cost: { y: 2 }, target: 'top', text: 'Play a top card that is 2 away from your card.' },
};

/** Spells listed in this order in the UI and in pick lists. */
export const SPELL_IDS = Object.keys(SPELLS);

/** Level 2 makes the biggest part of the cost 1 cheaper. */
export function spellCost(id: string, lvl: number): Partial<Mana> {
  const c = { ...SPELLS[id].cost };
  if (lvl > 1) {
    let best: Color | null = null;
    for (const k of COLORS) if ((c[k] ?? 0) > (best ? (c[best] ?? 0) : 0)) best = k;
    if (best && (c[best] ?? 0) > 1) c[best] = (c[best] ?? 0) - 1;
    else if (best) delete c[best];
  }
  return c;
}

// ---------- Relics and potions ----------

export interface ItemDef {
  name: string;
  icon: string;
  text: string;
}

export const RELICS: Record<string, ItemDef> = {
  ouroboros: { name: 'Ouroboros', icon: '🐍', text: 'King and Ace connect: K plays on A and A plays on K.' },
  helm: { name: 'Iron Helm', icon: '🪖', text: 'Start each fight with 3 shield.' },
  extradeck: { name: 'Extra Deck', icon: '🎴', text: '+4 cards in your stock each fight.' },
  prismstone: { name: 'Prism Stone', icon: '💎', text: 'Start each fight with 1 mana of each color.' },
  streak: { name: 'Hot Streak', icon: '🔥', text: 'Every 6 cards in a row without a draw give 1 mana of each color.' },
  key: { name: 'Skeleton Key', icon: '🗝️', text: 'Locks open 2 clears sooner.' },
  pickaxe: { name: 'Pickaxe', icon: '⛏️', text: 'Armored cards clear in one play.' },
  eye: { name: 'Third Eye', icon: '🧿', text: 'All tableau cards start face up.' },
  tooth: { name: 'Gold Tooth', icon: '🦷', text: '+40% gold from fights.' },
  bloodstone: { name: 'Bloodstone', icon: '🩸', text: 'Heal 3 HP after each fight you win.' },
  cactus: { name: 'Cactus', icon: '🌵', text: 'When the enemy strikes, it loses a random top card.' },
  coin: { name: 'Lucky Coin', icon: '🪙', text: 'Your first 2 draws each fight give the enemy no turn.' },
  well: { name: 'Wellspring', icon: '⛲', text: 'J, Q and K give 2 mana.' },
  blast: { name: 'Blast Shield', icon: '🧯', text: 'Bombs deal half damage.' },
  hourglass: { name: 'Hourglass', icon: '⏳', text: 'Enemy timers start 2 turns later.' },
  grimoire: { name: 'Grimoire', icon: '📕', text: 'You can know 7 spells instead of 6.' },
};
export const RELIC_IDS = Object.keys(RELICS);

export const POTIONS: Record<string, ItemDef> = {
  elixir: { name: 'Elixir', icon: '🧪', text: 'Heal 10 HP.' },
  pack: { name: 'Card Pack', icon: '📦', text: 'Add 5 cards to your stock.' },
  flask: { name: 'Mana Flask', icon: '⚗️', text: 'Gain 2 mana of each color.' },
  wildpot: { name: 'Wild Brew', icon: '🍹', text: 'Your card becomes wild.' },
};
export const POTION_IDS = Object.keys(POTIONS);
export const MAX_POTIONS = 3;

// ---------- Enemies ----------

export type AbilityKind = 'strike' | 'wound' | 'lock' | 'armor' | 'grow' | 'bomb' | 'drain' | 'hex';

export interface Ability {
  k: AbilityKind;
  n: number;
  every: number;
}

export const ABILITY_INFO: Record<AbilityKind, { name: string; icon: string; text: (n: number) => string }> = {
  strike: { name: 'Strike', icon: '⚔️', text: (n) => `You lose ${n} stock card${n > 1 ? 's' : ''}.` },
  wound: { name: 'Wound', icon: '🩸', text: (n) => `You lose ${n} HP.` },
  lock: { name: 'Lock', icon: '🔒', text: (n) => `Locks ${n} card${n > 1 ? 's' : ''}. A lock opens after 3 clears.` },
  armor: { name: 'Armor', icon: '🛡️', text: (n) => `Armors ${n} top card${n > 1 ? 's' : ''}. Armor takes one play to break.` },
  grow: { name: 'Grow', icon: '🌱', text: (n) => `Adds ${n} card${n > 1 ? 's' : ''} to the tableau.` },
  bomb: { name: 'Bomb', icon: '💣', text: (n) => `Arms a bomb for 3 turns. It burns ${n} stock cards.` },
  drain: { name: 'Drain', icon: '🌀', text: (n) => `Takes ${n} of your biggest mana.` },
  hex: { name: 'Hex', icon: '🪄', text: () => 'Changes your card to a random rank.' },
};

export interface EnemyDef {
  name: string;
  icon: string;
  tier: 'fight' | 'elite' | 'boss';
  /** Cards per column. */
  layout: number[];
  /** Share of the non-top cards that start face down. */
  down: number;
  lock?: number;
  armor?: number;
  gold?: number;
  abilities: Ability[];
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  // Act 1: Crypt Gate
  rats: { name: 'Rat Swarm', icon: '🐀', tier: 'fight', layout: [3, 3, 3, 3, 3], down: 0.5, abilities: [{ k: 'strike', n: 1, every: 3 }], text: 'Many small bites.' },
  goblin: { name: 'Goblin Thief', icon: '👺', tier: 'fight', layout: [2, 3, 4, 4, 3, 2], down: 0.5, gold: 3, abilities: [{ k: 'strike', n: 2, every: 3 }, { k: 'drain', n: 2, every: 4 }], text: 'Steals mana. Carries gold cards.' },
  skeleton: { name: 'Skeleton', icon: '💀', tier: 'fight', layout: [3, 4, 4, 4, 3], down: 0.4, armor: 2, abilities: [{ k: 'strike', n: 2, every: 4 }, { k: 'armor', n: 1, every: 4 }], text: 'Bony armor on its cards.' },
  slime: { name: 'Green Slime', icon: '🟢', tier: 'fight', layout: [3, 3, 3, 3, 3, 3], down: 0.3, abilities: [{ k: 'grow', n: 1, every: 3 }, { k: 'strike', n: 1, every: 3 }], text: 'Grows new cards.' },
  ogre: { name: 'Ogre', icon: '👹', tier: 'elite', layout: [4, 4, 5, 5, 4, 4], down: 0.5, armor: 3, abilities: [{ k: 'strike', n: 3, every: 3 }, { k: 'wound', n: 2, every: 4 }], text: 'Hits hard and hurts you.' },
  warden: { name: 'Stone Warden', icon: '🗿', tier: 'boss', layout: [4, 4, 5, 5, 4, 4], down: 0.5, lock: 3, abilities: [{ k: 'strike', n: 2, every: 3 }, { k: 'lock', n: 2, every: 4 }], text: 'Guardian of the gate. Locks your cards.' },
  // Act 2: Sunken Mire
  witch: { name: 'Bog Witch', icon: '🧙', tier: 'fight', layout: [4, 4, 4, 4, 4], down: 0.7, abilities: [{ k: 'hex', n: 1, every: 3 }, { k: 'strike', n: 2, every: 3 }], text: 'Hexes your card.' },
  bandit: { name: 'Bandit', icon: '🥷', tier: 'fight', layout: [3, 4, 5, 5, 4, 3], down: 0.5, gold: 4, abilities: [{ k: 'drain', n: 2, every: 3 }, { k: 'strike', n: 2, every: 2 }], text: 'Fast strikes, steals mana.' },
  imp: { name: 'Bomb Imp', icon: '😈', tier: 'fight', layout: [4, 4, 4, 4, 4], down: 0.5, abilities: [{ k: 'bomb', n: 4, every: 3 }, { k: 'strike', n: 1, every: 2 }], text: 'Arms bombs. Clear them in time.' },
  ghoul: { name: 'Ghoul', icon: '🧟', tier: 'fight', layout: [5, 4, 4, 4, 5], down: 0.6, abilities: [{ k: 'grow', n: 2, every: 4 }, { k: 'wound', n: 2, every: 4 }], text: 'Rots back and bites.' },
  troll: { name: 'Bog Troll', icon: '🧌', tier: 'elite', layout: [5, 5, 5, 5, 5], down: 0.5, armor: 5, abilities: [{ k: 'grow', n: 2, every: 3 }, { k: 'strike', n: 3, every: 3 }], text: 'Thick hide, fast regrowth.' },
  hydra: { name: 'Mire Hydra', icon: '🐉', tier: 'boss', layout: [5, 5, 6, 6, 5, 5], down: 0.6, abilities: [{ k: 'grow', n: 2, every: 3 }, { k: 'strike', n: 3, every: 2 }, { k: 'bomb', n: 5, every: 4 }], text: 'Two heads grow back for each one cut.' },
  // Act 3: Gilded Spire
  wraith: { name: 'Wraith', icon: '👻', tier: 'fight', layout: [5, 5, 5, 5, 5], down: 1, abilities: [{ k: 'hex', n: 1, every: 2 }, { k: 'strike', n: 2, every: 2 }], text: 'All its cards hide face down.' },
  golem: { name: 'Iron Golem', icon: '🦾', tier: 'fight', layout: [4, 5, 5, 5, 5, 4], down: 0.4, armor: 6, abilities: [{ k: 'armor', n: 2, every: 3 }, { k: 'strike', n: 3, every: 2 }], text: 'Armor everywhere.' },
  knight: { name: 'Black Knight', icon: '🐴', tier: 'fight', layout: [4, 5, 5, 5, 4], down: 0.5, lock: 4, abilities: [{ k: 'strike', n: 3, every: 2 }, { k: 'lock', n: 2, every: 3 }], text: 'Locks the field.' },
  demon: { name: 'Pit Demon', icon: '👿', tier: 'fight', layout: [5, 5, 5, 5, 5], down: 0.5, abilities: [{ k: 'bomb', n: 5, every: 2 }, { k: 'wound', n: 3, every: 3 }], text: 'Bombs and burns.' },
  wyrm: { name: 'Gilded Wyrm', icon: '🐲', tier: 'elite', layout: [5, 6, 6, 6, 5], down: 0.5, armor: 4, lock: 3, abilities: [{ k: 'strike', n: 4, every: 2 }, { k: 'grow', n: 2, every: 3 }, { k: 'bomb', n: 6, every: 4 }], text: 'Old, rich and angry.' },
  dealer: { name: 'The Dealer', icon: '🎩', tier: 'boss', layout: [6, 6, 6, 7, 6, 6, 6], down: 0.6, lock: 4, armor: 4, gold: 4, abilities: [{ k: 'strike', n: 3, every: 2 }, { k: 'hex', n: 1, every: 3 }, { k: 'lock', n: 2, every: 3 }, { k: 'bomb', n: 6, every: 4 }, { k: 'grow', n: 2, every: 4 }], text: 'The house always wins. Beat it to end the run.' },
};

export interface ActDef {
  name: string;
  icon: string;
  fights: string[];
  elite: string;
  boss: string;
}

export const ACTS: ActDef[] = [
  { name: 'Crypt Gate', icon: '🪦', fights: ['rats', 'goblin', 'skeleton', 'slime'], elite: 'ogre', boss: 'warden' },
  { name: 'Sunken Mire', icon: '🌫️', fights: ['witch', 'bandit', 'imp', 'ghoul'], elite: 'troll', boss: 'hydra' },
  { name: 'Gilded Spire', icon: '🏰', fights: ['wraith', 'golem', 'knight', 'demon'], elite: 'wyrm', boss: 'dealer' },
];

// ---------- Heroes ----------

export interface HeroDef {
  name: string;
  icon: string;
  hp: number;
  deck: number;
  start: string[];
  book: string[];
  relic?: string;
  unlock: number;
  text: string;
}

export const HEROES: Record<string, HeroDef> = {
  knight: {
    name: 'Knight',
    icon: '🛡️',
    hp: 32,
    deck: 24,
    start: ['nudge', 'cleave', 'bulwark'],
    book: ['fireball', 'shatter', 'rejuv', 'frost', 'meteor', 'mend', 'haste', 'prism'],
    unlock: 0,
    text: 'Tough. Strong attacks and shields.',
  },
  mage: {
    name: 'Mage',
    icon: '🔮',
    hp: 25,
    deck: 22,
    start: ['nudge', 'fireball', 'joker'],
    book: ['sight', 'meteor', 'frost', 'prism', 'sleight', 'quake', 'mend', 'haste'],
    relic: 'prismstone',
    unlock: 25,
    text: 'Frail. Starts with mana and wild cards.',
  },
  rogue: {
    name: 'Rogue',
    icon: '🗡️',
    hp: 26,
    deck: 24,
    start: ['longshot', 'sleight', 'fireball'],
    book: ['haste', 'joker', 'nudge', 'smoke', 'sight', 'quake', 'shatter', 'bulwark', 'rejuv'],
    relic: 'ouroboros',
    unlock: 40,
    text: 'Tricky. Kings link to Aces from the start.',
  },
};
export const HERO_IDS = Object.keys(HEROES);
