/** Static game data: monsters, bosses, items, boons, heroes and floor specs. */

export type MonsterId =
  | 'rat'
  | 'bat'
  | 'snake'
  | 'goblin'
  | 'skeleton'
  | 'orc'
  | 'zombie'
  | 'troll'
  | 'golem'
  | 'demon'
  | 'ghost'
  | 'gazer'
  | 'mimic'
  | 'boss';

export interface MonsterDef {
  id: MonsterId;
  name: string;
  icon: string;
  /** Rule text for specials. */
  text?: string;
}

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  rat: { id: 'rat', name: 'Rat', icon: '🐀' },
  bat: { id: 'bat', name: 'Bat', icon: '🦇' },
  snake: { id: 'snake', name: 'Snake', icon: '🐍' },
  goblin: { id: 'goblin', name: 'Goblin', icon: '👺' },
  skeleton: { id: 'skeleton', name: 'Skeleton', icon: '💀' },
  orc: { id: 'orc', name: 'Orc', icon: '👹' },
  zombie: { id: 'zombie', name: 'Zombie', icon: '🧟' },
  troll: { id: 'troll', name: 'Troll', icon: '🧌' },
  golem: { id: 'golem', name: 'Golem', icon: '🗿' },
  demon: { id: 'demon', name: 'Demon', icon: '😈' },
  ghost: { id: 'ghost', name: 'Ghost', icon: '👻', text: 'Always visible. Not counted in clues.' },
  gazer: { id: 'gazer', name: 'Gazer', icon: '👁️', text: 'Hides the clues next to it while it lives.' },
  mimic: { id: 'mimic', name: 'Mimic', icon: '👾', text: 'Looks like a chest. Counted in clues.' },
  boss: { id: 'boss', name: 'Boss', icon: '🐉', text: 'Strongest monster. Kill it to open the stairs.' },
};

/** Normal monsters in strength order: index 0 has strength 1. */
export const NORMALS: MonsterId[] = ['rat', 'bat', 'snake', 'goblin', 'skeleton', 'orc', 'zombie', 'troll', 'golem', 'demon'];

export interface BossDef {
  name: string;
  icon: string;
}

export const BOSSES: BossDef[] = [
  { name: 'Giant Scorpion', icon: '🦂' },
  { name: 'Spider Queen', icon: '🕷️' },
  { name: 'Wolf Alpha', icon: '🐺' },
  { name: 'Dark Mage', icon: '🧙' },
  { name: 'Kraken', icon: '🦑' },
  { name: 'Manticore', icon: '🦁' },
  { name: 'Vampire Lord', icon: '🧛' },
  { name: 'Behemoth', icon: '🦖' },
  { name: 'Archfiend', icon: '👿' },
  { name: 'Elder Dragon', icon: '🐉' },
];

export const FLOORS = 10;

export interface FloorSpec {
  w: number;
  h: number;
  /** Counts of normal monsters by strength (index 0 = strength 1). */
  normals: number[];
  boss: number;
  ghost: number;
  ghostStr: number;
  gazer: number;
  gazerStr: number;
  mimic: number;
  mimicStr: number;
  chests: number;
  potions: number;
  scrolls: number;
  keys: number;
  coins: number;
}

/** Floor layout and monster mix. Floors grow in size and strength. */
export function floorSpec(f: number): FloorSpec {
  const w = Math.min(12, 7 + Math.ceil(f / 2));
  const h = Math.min(14, 7 + f);
  const lo = 1 + Math.floor((f - 1) / 2);
  const area = w * h;
  const total = Math.round(area * 0.16);
  const weights = [5, 4, 3, 2, 2];
  const wsum = weights.reduce((a, b) => a + b, 0);
  const normals = Array(10).fill(0) as number[];
  let left = total;
  weights.forEach((wt, k) => {
    const n = k === weights.length - 1 ? left : Math.round((total * wt) / wsum);
    normals[lo - 1 + k] += Math.max(1, n);
    left -= n;
  });
  const hi = lo + 4;
  return {
    w,
    h,
    normals,
    boss: hi + TUNE.bossAdd + Math.ceil(f * TUNE.bossMul),
    ghost: f >= 2 ? 1 + Math.floor(f / 4) : 0,
    ghostStr: lo + 2,
    gazer: f >= 3 ? 1 + Math.floor(f / 6) : 0,
    gazerStr: lo + 1,
    mimic: f >= 2 ? 1 + Math.floor(f / 5) : 0,
    mimicStr: lo + 3,
    chests: 1 + Math.floor(f / 4),
    potions: 1,
    scrolls: f % 2 === 1 ? 1 : 0,
    keys: 1 + Math.floor(f / 4),
    coins: 2 + Math.floor(f / 3),
  };
}

export type ItemId = 'potion' | 'scroll' | 'bomb' | 'ward';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  text: string;
  price: number;
  /** True when the item needs a target tile. */
  target: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  potion: { id: 'potion', name: 'Potion', icon: '🧪', text: 'Heals 5 HP.', price: 8, target: false },
  scroll: { id: 'scroll', name: 'Scroll of Sight', icon: '📜', text: 'Reveals a 3×3 area. Monsters there become visible.', price: 10, target: true },
  bomb: { id: 'bomb', name: 'Bomb', icon: '💣', text: 'Kills one monster (not the boss) with no damage and no XP. On a safe tile it opens it.', price: 12, target: true },
  ward: { id: 'ward', name: 'Ward', icon: '🛡️', text: 'Your next fight deals 4 less damage.', price: 7, target: false },
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export type BoonId =
  | 'tough'
  | 'scholar'
  | 'vamp'
  | 'armor'
  | 'lens'
  | 'sense'
  | 'salt'
  | 'pouch'
  | 'greed'
  | 'lantern'
  | 'alchemy'
  | 'phoenix'
  | 'hunter'
  | 'keyring';

export interface BoonDef {
  id: BoonId;
  name: string;
  icon: string;
  text: string;
  /** Can be taken more than once. */
  stack?: boolean;
}

export const BOONS: Record<BoonId, BoonDef> = {
  tough: { id: 'tough', name: 'Thick Skin', icon: '🫀', text: '+3 max HP and heal 3.', stack: true },
  scholar: { id: 'scholar', name: 'Scholar', icon: '🎓', text: 'Monsters give 25% more XP.' },
  vamp: { id: 'vamp', name: 'Bloodthirst', icon: '🩸', text: 'Heal 1 HP after each kill.' },
  armor: { id: 'armor', name: 'Chainmail', icon: '⛓️', text: 'Fights deal 1 less damage (min 1).' },
  lens: { id: 'lens', name: 'Gazer Lens', icon: '🔍', text: 'Gazers do not hide clues.' },
  sense: { id: 'sense', name: 'Mimic Sense', icon: '👃', text: 'Mimics show their true face.' },
  salt: { id: 'salt', name: 'Grave Salt', icon: '🧂', text: 'Ghosts deal half damage.' },
  pouch: { id: 'pouch', name: 'Big Pouch', icon: '👝', text: '+1 item slot.', stack: true },
  greed: { id: 'greed', name: 'Greed', icon: '💰', text: 'Gold finds give 50% more.' },
  lantern: { id: 'lantern', name: 'Lantern', icon: '🏮', text: 'Each floor starts with a free 3×3 scout.' },
  alchemy: { id: 'alchemy', name: 'Alchemy', icon: '⚗️', text: 'Potions heal 3 more.' },
  phoenix: { id: 'phoenix', name: 'Phoenix Feather', icon: '🪶', text: 'Once: a lethal fight leaves you at 1 HP.' },
  hunter: { id: 'hunter', name: 'Boss Hunter', icon: '🏹', text: 'Bosses deal 3 less damage.' },
  keyring: { id: 'keyring', name: 'Keyring', icon: '🔑', text: '+2 keys. Chests give an extra item.' },
};

export const BOON_IDS = Object.keys(BOONS) as BoonId[];

export type HeroId = 'wanderer' | 'knight' | 'sage' | 'seer' | 'thief';

export interface HeroDef {
  id: HeroId;
  name: string;
  icon: string;
  text: string;
  cost: number;
}

export const HEROES: Record<HeroId, HeroDef> = {
  wanderer: { id: 'wanderer', name: 'Wanderer', icon: '🧝', text: 'No perk. A clean start.', cost: 0 },
  knight: { id: 'knight', name: 'Knight', icon: '🛡️', text: 'Starts with Thick Skin (+3 max HP).', cost: 12 },
  sage: { id: 'sage', name: 'Sage', icon: '🧙‍♂️', text: 'Gets a Scroll of Sight on every floor.', cost: 20 },
  seer: { id: 'seer', name: 'Seer', icon: '🔮', text: 'Sees every monster in one row of each floor.', cost: 30 },
  thief: { id: 'thief', name: 'Thief', icon: '🦹', text: 'Starts with Keyring and Greed.', cost: 40 },
};

export const HERO_IDS = Object.keys(HEROES) as HeroId[];

/** XP needed to go from level L to L+1. */
export const TUNE = { xpA: 6, xpB: 8, xpC: 0.25, hpPerLevel: 2, tilesPerXp: 4, bossAdd: 1, bossMul: 0.7, xpMul: 2 };

export const xpNeed = (level: number): number => Math.round(TUNE.xpA + TUNE.xpB * (level - 1) + TUNE.xpC * (level - 1) * (level - 1));

/** Opened safe tiles per 1 XP. */
export const TILES_PER_XP = (): number => TUNE.tilesPerXp;

export const START_HP = 6;
export const HP_PER_LEVEL = (): number => TUNE.hpPerLevel;
export const BASE_SLOTS = 3;
