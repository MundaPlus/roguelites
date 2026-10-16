/** Symbols, items and the rent schedule. */

export type Tag = 'fruit' | 'food' | 'animal' | 'plant' | 'ore' | 'gem' | 'person' | 'magic' | 'sea';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'very rare';

/**
 * A target is a symbol id (`milk`) or a tag (`#fruit`). `*` matches every symbol.
 */
export type Target = string;

export interface SymDef {
  id: string;
  name: string;
  icon: string;
  value: number;
  rarity: Rarity;
  tags: Tag[];
  text: string;
  /** Destroys adjacent targets in the destroy phase and gains `pay` for each. */
  eats?: { targets: Target[]; pay: number; adds?: string; self?: boolean };
  /** Changes adjacent targets in the pay phase. */
  boost?: { targets: Target[]; mult?: number; add?: number };
  /** Turns into another symbol after this many spins on the grid. */
  grows?: { to: string; after: number };
  /** Pays this much more for each adjacent target (or empty cell). */
  perAdj?: { targets: Target[] | 'empty'; pay: number };
  /** Destroyed after this many spins on the grid. Pays `last` on its last spin. */
  expires?: { after: number; last: number };
  /** Chance per spin to add a symbol to the pool. */
  lays?: { id: string; chance: number };
  special?: 'mirror' | 'star' | 'dice' | 'jackpot' | 'wine' | 'crown' | 'peacock';
  /** Not in the offers until unlocked in the meta shop. */
  locked?: boolean;
}

const S = (d: SymDef): SymDef => d;

export const SYMBOL_LIST: SymDef[] = [
  // ----- Common -----
  S({ id: 'coin', name: 'Coin', icon: '🪙', value: 1, rarity: 'common', tags: [], text: 'Pays 1.' }),
  S({ id: 'cherry', name: 'Cherry', icon: '🍒', value: 1, rarity: 'common', tags: ['fruit', 'food'], text: 'Pays 1.' }),
  S({ id: 'banana', name: 'Banana', icon: '🍌', value: 1, rarity: 'common', tags: ['fruit', 'food'], text: 'Pays 1. Monkeys eat it.' }),
  S({ id: 'coconut', name: 'Coconut', icon: '🥥', value: 2, rarity: 'common', tags: ['fruit', 'food'], text: 'Pays 2. Monkeys eat it.' }),
  S({ id: 'milk', name: 'Milk', icon: '🥛', value: 1, rarity: 'common', tags: ['food'], text: 'Pays 1. Cats and toddlers drink it.' }),
  S({ id: 'cheese', name: 'Cheese', icon: '🧀', value: 1, rarity: 'common', tags: ['food'], text: 'Pays 1. Mice eat it.' }),
  S({ id: 'candy', name: 'Candy', icon: '🍬', value: 1, rarity: 'common', tags: ['food'], text: 'Pays 1. Toddlers eat it.' }),
  S({ id: 'honey', name: 'Honey', icon: '🍯', value: 2, rarity: 'common', tags: ['food'], text: 'Pays 2. Bears eat it.' }),
  S({ id: 'fish', name: 'Fish', icon: '🐟', value: 1, rarity: 'common', tags: ['sea', 'food'], text: 'Pays 1. Bears eat it.' }),
  S({ id: 'ore', name: 'Ore', icon: '🪨', value: 1, rarity: 'common', tags: ['ore'], text: 'Pays 1. Miners break it into gems.' }),
  S({ id: 'seed', name: 'Seed', icon: '🌱', value: 1, rarity: 'common', tags: ['plant'], text: 'Pays 1. Grows into a Flower after 3 spins.', grows: { to: 'flower', after: 3 } }),
  S({ id: 'sapling', name: 'Sapling', icon: '🌿', value: 1, rarity: 'common', tags: ['plant'], text: 'Pays 1. Grows into a Tree after 5 spins.', grows: { to: 'tree', after: 5 } }),
  S({ id: 'egg', name: 'Egg', icon: '🥚', value: 1, rarity: 'common', tags: ['food'], text: 'Pays 1. Hatches into a Chicken after 4 spins.', grows: { to: 'chicken', after: 4 } }),
  S({ id: 'caterpillar', name: 'Caterpillar', icon: '🐛', value: 1, rarity: 'common', tags: ['animal'], text: 'Pays 1. Becomes a Butterfly after 4 spins.', grows: { to: 'butterfly', after: 4 } }),
  S({ id: 'cat', name: 'Cat', icon: '🐱', value: 1, rarity: 'common', tags: ['animal'], text: 'Pays 1. Drinks adjacent Milk for +9.', eats: { targets: ['milk'], pay: 9 } }),
  S({ id: 'mouse', name: 'Mouse', icon: '🐭', value: 1, rarity: 'common', tags: ['animal'], text: 'Pays 1. Eats adjacent Cheese for +7.', eats: { targets: ['cheese'], pay: 7 } }),
  S({ id: 'chicken', name: 'Chicken', icon: '🐔', value: 2, rarity: 'common', tags: ['animal'], text: 'Pays 2. 10% chance to lay an Egg.', lays: { id: 'egg', chance: 0.1 } }),
  S({ id: 'miner', name: 'Miner', icon: '👷', value: 1, rarity: 'common', tags: ['person'], text: 'Pays 1. Breaks adjacent Ore for +4 and adds a Gem.', eats: { targets: ['ore'], pay: 4, adds: 'gem' } }),
  S({ id: 'candle', name: 'Candle', icon: '🕯️', value: 3, rarity: 'common', tags: ['magic'], text: 'Pays 3. Burns out after 5 spins.', expires: { after: 5, last: 3 } }),
  S({ id: 'flower', name: 'Flower', icon: '🌻', value: 2, rarity: 'common', tags: ['plant'], text: 'Pays 2.' }),

  // ----- Uncommon -----
  S({ id: 'monkey', name: 'Monkey', icon: '🐒', value: 1, rarity: 'uncommon', tags: ['animal'], text: 'Pays 1. Eats adjacent Bananas and Coconuts for +7.', eats: { targets: ['banana', 'coconut'], pay: 7 } }),
  S({ id: 'bear', name: 'Bear', icon: '🐻', value: 2, rarity: 'uncommon', tags: ['animal'], text: 'Pays 2. Eats adjacent Honey and Fish for +10.', eats: { targets: ['honey', 'fish'], pay: 10 } }),
  S({ id: 'fox', name: 'Fox', icon: '🦊', value: 2, rarity: 'uncommon', tags: ['animal'], text: 'Pays 2. Eats adjacent Eggs and Chickens for +9.', eats: { targets: ['egg', 'chicken'], pay: 9 } }),
  S({ id: 'toddler', name: 'Toddler', icon: '👶', value: 1, rarity: 'uncommon', tags: ['person'], text: 'Pays 1. Eats adjacent Candy and Milk for +6.', eats: { targets: ['candy', 'milk'], pay: 6 } }),
  S({ id: 'bee', name: 'Bee', icon: '🐝', value: 1, rarity: 'uncommon', tags: ['animal'], text: 'Pays 1. Adjacent plants pay ×2.', boost: { targets: ['#plant'], mult: 2 } }),
  S({ id: 'farmer', name: 'Farmer', icon: '🧑‍🌾', value: 1, rarity: 'uncommon', tags: ['person'], text: 'Pays 1. Adjacent plants and fruit pay +2.', boost: { targets: ['#plant', '#fruit'], add: 2 } }),
  S({ id: 'chef', name: 'Chef', icon: '🧑‍🍳', value: 2, rarity: 'uncommon', tags: ['person'], text: 'Pays 2. Adjacent food pays ×2.', boost: { targets: ['#food'], mult: 2 } }),
  S({ id: 'magnet', name: 'Magnet', icon: '🧲', value: 1, rarity: 'uncommon', tags: [], text: 'Pays 1. Adjacent Ore and Coins pay ×2.', boost: { targets: ['#ore', 'coin'], mult: 2 } }),
  S({ id: 'clover', name: 'Clover', icon: '🍀', value: 1, rarity: 'uncommon', tags: ['plant'], text: 'Pays 1. Adjacent symbols pay +1.', boost: { targets: ['*'], add: 1 } }),
  S({ id: 'gem', name: 'Gem', icon: '💎', value: 3, rarity: 'uncommon', tags: ['ore', 'gem'], text: 'Pays 3.' }),
  S({ id: 'wine', name: 'Wine', icon: '🍷', value: 2, rarity: 'uncommon', tags: ['food'], text: 'Pays 2. Pays +1 more for every 3 spins on the grid.', special: 'wine' }),
  S({ id: 'butterfly', name: 'Butterfly', icon: '🦋', value: 4, rarity: 'uncommon', tags: ['animal'], text: 'Pays 4.' }),
  S({ id: 'tree', name: 'Tree', icon: '🌳', value: 3, rarity: 'uncommon', tags: ['plant'], text: 'Pays 3. Lumberjacks chop it.' }),
  S({ id: 'lumberjack', name: 'Lumberjack', icon: '🧔', value: 1, rarity: 'uncommon', tags: ['person'], text: 'Pays 1. Chops adjacent Trees for +14 and plants a Sapling.', eats: { targets: ['tree'], pay: 14, adds: 'sapling' } }),
  S({ id: 'dice', name: 'Dice', icon: '🎲', value: 0, rarity: 'uncommon', tags: [], text: 'Pays 1 to 6 at random.', special: 'dice' }),
  S({ id: 'owl', name: 'Owl', icon: '🦉', value: 1, rarity: 'uncommon', tags: ['animal'], text: 'Pays 1, +2 for each adjacent animal.', perAdj: { targets: ['#animal'], pay: 2 } }),
  S({ id: 'hermit', name: 'Hermit', icon: '🧘', value: 1, rarity: 'uncommon', tags: ['person'], text: 'Pays 1, +2 for each adjacent empty cell.', perAdj: { targets: 'empty', pay: 2 } }),
  S({ id: 'piggy', name: 'Piggy Bank', icon: '🐷', value: 0, rarity: 'uncommon', tags: [], text: 'Pays 0. On its 6th spin it breaks and pays 25.', expires: { after: 6, last: 25 } }),
  S({ id: 'chest', name: 'Chest', icon: '🧰', value: 1, rarity: 'uncommon', tags: [], text: 'Pays 1. A Key or a Pirate opens it.' }),
  S({ id: 'key', name: 'Key', icon: '🗝️', value: 1, rarity: 'uncommon', tags: [], text: 'Pays 1. Opens an adjacent Chest for +25. Both break.', eats: { targets: ['chest'], pay: 25, self: true } }),

  // ----- Rare -----
  S({ id: 'sun', name: 'Sun', icon: '☀️', value: 2, rarity: 'rare', tags: [], text: 'Pays 2. Adjacent plants pay ×3.', boost: { targets: ['#plant'], mult: 3 } }),
  S({ id: 'rainbow', name: 'Rainbow', icon: '🌈', value: 2, rarity: 'rare', tags: [], text: 'Pays 2. Adjacent fruit pays ×3.', boost: { targets: ['#fruit'], mult: 3 } }),
  S({ id: 'king', name: 'King', icon: '🤴', value: 2, rarity: 'rare', tags: ['person'], text: 'Pays 2. Adjacent Coins and gems pay ×3.', boost: { targets: ['coin', '#gem'], mult: 3 } }),
  S({ id: 'witch', name: 'Witch', icon: '🧙', value: 2, rarity: 'rare', tags: ['person', 'magic'], text: 'Pays 2. Adjacent magic pays ×2. +4 for each adjacent Cat.', boost: { targets: ['#magic'], mult: 2 }, perAdj: { targets: ['cat'], pay: 4 } }),
  S({ id: 'mirror', name: 'Mirror', icon: '🪞', value: 0, rarity: 'rare', tags: ['magic'], text: 'Pays the same as the best adjacent symbol.', special: 'mirror' }),
  S({ id: 'peacock', name: 'Peacock', icon: '🦚', value: 3, rarity: 'rare', tags: ['animal'], text: 'Pays 3. Pays ×3 when no other animal is adjacent.', special: 'peacock' }),
  S({ id: 'pirate', name: 'Pirate', icon: '🏴‍☠️', value: 2, rarity: 'rare', tags: ['person'], text: 'Pays 2. Opens adjacent Chests for +18.', eats: { targets: ['chest'], pay: 18 }, locked: true }),
  S({ id: 'unicorn', name: 'Unicorn', icon: '🦄', value: 3, rarity: 'rare', tags: ['animal', 'magic'], text: 'Pays 3. Adjacent animals and magic pay ×2.', boost: { targets: ['#animal', '#magic'], mult: 2 }, locked: true }),

  // ----- Very rare -----
  S({ id: 'star', name: 'Star', icon: '⭐', value: 0, rarity: 'very rare', tags: ['magic'], text: 'Pays 1 for each different symbol on the grid.', special: 'star' }),
  S({ id: 'crown', name: 'Crown', icon: '👑', value: 3, rarity: 'very rare', tags: [], text: 'Pays 3. Every person on the grid pays ×2. More Crowns do not stack.', special: 'crown' }),
  S({ id: 'dragon', name: 'Dragon', icon: '🐉', value: 10, rarity: 'very rare', tags: ['animal', 'magic'], text: 'Pays 10. Eats adjacent animals for +3.', eats: { targets: ['#animal'], pay: 3 }, locked: true }),
  S({ id: 'jackpot', name: 'Jackpot', icon: '🎰', value: 3, rarity: 'very rare', tags: [], text: 'Pays 3. 6% chance to pay 77.', special: 'jackpot', locked: true }),
  S({ id: 'volcano', name: 'Volcano', icon: '🌋', value: 2, rarity: 'very rare', tags: [], text: 'Pays 2. Destroys every adjacent symbol for +5 each.', eats: { targets: ['*'], pay: 5 }, locked: true }),
];

export const SYMBOLS: Record<string, SymDef> = Object.fromEntries(SYMBOL_LIST.map((s) => [s.id, s]));

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  rarity: Rarity;
  /** Pay +add for each symbol with this tag. */
  tagAdd?: { tag: Tag; add: number };
  locked?: boolean;
}

export const ITEM_LIST: ItemDef[] = [
  { id: 'basket', name: 'Fruit Basket', icon: '🧺', rarity: 'common', text: 'Fruit pays +1.', tagAdd: { tag: 'fruit', add: 1 } },
  { id: 'salt', name: 'Salt Shaker', icon: '🧂', rarity: 'common', text: 'Food pays +1.', tagAdd: { tag: 'food', add: 1 } },
  { id: 'collar', name: 'Pet Collar', icon: '🦮', rarity: 'common', text: 'Animals pay +1.', tagAdd: { tag: 'animal', add: 1 } },
  { id: 'badge', name: 'Name Badge', icon: '📛', rarity: 'common', text: 'People pay +1.', tagAdd: { tag: 'person', add: 1 } },
  { id: 'cart', name: 'Mine Cart', icon: '🛒', rarity: 'common', text: 'Ore pays +1.', tagAdd: { tag: 'ore', add: 1 } },
  { id: 'can', name: 'Watering Can', icon: '🚿', rarity: 'common', text: 'Plants pay +1.', tagAdd: { tag: 'plant', add: 1 } },
  { id: 'grimoire', name: 'Grimoire', icon: '📕', rarity: 'uncommon', text: 'Magic pays +2.', tagAdd: { tag: 'magic', add: 2 } },
  { id: 'polish', name: 'Gem Polish', icon: '🧴', rarity: 'uncommon', text: 'Gems pay +2.', tagAdd: { tag: 'gem', add: 2 } },
  { id: 'tipjar', name: 'Tip Jar', icon: '🫙', rarity: 'common', text: 'Each empty cell pays 1.' },
  { id: 'appetite', name: 'Big Appetite', icon: '🍴', rarity: 'uncommon', text: 'Symbols that eat or break gain +4 more each time.' },
  { id: 'recycle', name: 'Recycling Bin', icon: '♻️', rarity: 'uncommon', text: 'Each destroyed symbol pays +2.' },
  { id: 'fertilizer', name: 'Fertilizer', icon: '💩', rarity: 'common', text: 'Symbols that grow need 1 spin less.' },
  { id: 'savings', name: 'Savings Book', icon: '📒', rarity: 'uncommon', text: 'After each spin, gain 1 coin for each 20 coins you hold (up to 6).' },
  { id: 'telescope', name: 'Telescope', icon: '🔭', rarity: 'uncommon', text: 'Symbol offers show 4 symbols.' },
  { id: 'horseshoe', name: 'Horseshoe', icon: '🐴', rarity: 'uncommon', text: 'Rare and very rare symbols show up twice as often.' },
  { id: 'hourglass', name: 'Hourglass', icon: '⏳', rarity: 'rare', text: 'Each rent period has 1 more spin.' },
  { id: 'fourleaf', name: 'Four-Leaf Charm', icon: '☘️', rarity: 'rare', text: 'Every 5th spin pays ×2.' },
  { id: 'eraser', name: 'Eraser', icon: '🧽', rarity: 'common', text: 'Gain a removal token every 4 spins.' },
  { id: 'lantern', name: 'Lantern', icon: '🏮', rarity: 'uncommon', text: 'Candles never burn out. Magic pays +1.', tagAdd: { tag: 'magic', add: 1 }, locked: true },
  { id: 'loaded', name: 'Loaded Dice', icon: '🎯', rarity: 'uncommon', text: 'Dice pay at least 4. Jackpots hit twice as often.', locked: true },
  { id: 'echo', name: 'Echo Bell', icon: '🔔', rarity: 'rare', text: 'The first spin after each rent pays ×2.', locked: true },
  { id: 'corner', name: 'Cornerstone', icon: '🧱', rarity: 'rare', text: 'Symbols in the 4 corners pay ×2.', locked: true },
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_LIST.map((i) => [i.id, i]));

/** Rent schedule: spins in the period and the amount due at its end. */
export const RENTS: { spins: number; due: number }[] = [
  { spins: 5, due: 25 },
  { spins: 5, due: 60 },
  { spins: 6, due: 120 },
  { spins: 6, due: 200 },
  { spins: 7, due: 330 },
  { spins: 7, due: 500 },
  { spins: 8, due: 750 },
  { spins: 8, due: 1100 },
  { spins: 8, due: 1650 },
  { spins: 9, due: 2400 },
  { spins: 9, due: 3200 },
  { spins: 10, due: 4400 },
];

export const WIN_RENTS = RENTS.length;

/** Landlord levels. A win at one level unlocks the next. */
export const LANDLORDS = [
  { name: 'Fair Landlord', icon: '🙂', mult: 1, text: 'The normal rent schedule.' },
  { name: 'Greedy Landlord', icon: '😏', mult: 1.15, text: 'Rent is 15% higher.' },
  { name: 'Ruthless Landlord', icon: '😠', mult: 1.3, text: 'Rent is 30% higher. No starting removal token.' },
  { name: 'Tyrant Landlord', icon: '👿', mult: 1.5, text: 'Rent is 50% higher. No starting tokens.' },
];

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c9c3b0',
  uncommon: '#5ec46b',
  rare: '#4ea8ff',
  'very rare': '#d77dff',
};

export const START_POOL = ['coin', 'cherry', 'cat', 'milk', 'seed'];
export const GRID_W = 5;
export const GRID_H = 4;
export const CELLS = GRID_W * GRID_H;
