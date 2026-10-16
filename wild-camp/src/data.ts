/** Static game data: items, recipes, nodes, creatures, characters, seasons. */

/** Length of one game day in seconds. */
export const DAY = 160;
/** Days per season. */
export const SEASON_DAYS = 5;
/** Fixed simulation step in seconds. */
export const DT = 1 / 30;
export const MAP = 72;
export const INV_SIZE = 15;

export type Biome = 'grass' | 'forest' | 'rocky' | 'marsh';

export const BIOMES: Record<Biome, { name: string; color: string; alt: string }> = {
  grass: { name: 'Grassland', color: '#6b8f3a', alt: '#73973f' },
  forest: { name: 'Forest', color: '#2f5a2e', alt: '#346233' },
  rocky: { name: 'Rocky land', color: '#7d7466', alt: '#857c6d' },
  marsh: { name: 'Marsh', color: '#4c5b45', alt: '#53634b' },
};

export type Season = 'autumn' | 'winter' | 'spring' | 'summer';
export const SEASONS: Season[] = ['autumn', 'winter', 'spring', 'summer'];

export interface SeasonDef {
  name: string;
  icon: string;
  /** End of day and end of dusk, as a fraction of the day. Night fills the rest. */
  dayEnd: number;
  duskEnd: number;
  /** Air temperature at day, dusk and night. */
  temp: [number, number, number];
  tint: string;
  boss: string;
  grows: boolean;
}

export const SEASON_DEFS: Record<Season, SeasonDef> = {
  autumn: { name: 'Autumn', icon: '🍂', dayEnd: 0.55, duskEnd: 0.73, temp: [32, 24, 16], tint: 'rgba(200,120,30,0.10)', boss: 'grizz', grows: true },
  winter: { name: 'Winter', icon: '❄️', dayEnd: 0.42, duskEnd: 0.6, temp: [10, 3, -8], tint: 'rgba(235,245,255,0.42)', boss: 'giant', grows: false },
  spring: { name: 'Spring', icon: '🌱', dayEnd: 0.55, duskEnd: 0.73, temp: [26, 20, 14], tint: 'rgba(60,200,80,0.07)', boss: 'moose', grows: true },
  summer: { name: 'Summer', icon: '☀️', dayEnd: 0.65, duskEnd: 0.8, temp: [78, 64, 48], tint: 'rgba(255,210,80,0.14)', boss: 'wyrm', grows: true },
};

// ---------------- Items ----------------

export type Slot = 'hand' | 'head' | 'body';

export interface FoodDef {
  hunger: number;
  hp: number;
  san: number;
  /** Item id this food becomes on a fire. */
  cook?: string;
  /** Days until it rots. */
  spoil: number;
  plant?: boolean;
}

export interface ItemDef {
  name: string;
  icon: string;
  stack: number;
  text: string;
  food?: FoodDef;
  slot?: Slot;
  /** Tool action. */
  tool?: 'chop' | 'mine';
  dmg?: number;
  /** Uses for tools and weapons, hit points for armor, seconds for lights. */
  dur?: number;
  absorb?: number;
  warm?: number;
  cool?: number;
  light?: number;
  /** Fuel seconds when added to a fire. */
  fuel?: number;
  heal?: number;
  san?: number;
  part?: boolean;
  place?: string;
}

export const ITEMS: Record<string, ItemDef> = {
  twigs: { name: 'Twigs', icon: '🥢', stack: 40, text: 'From saplings. Tools and torches.', fuel: 12 },
  grass: { name: 'Cut grass', icon: '🌾', stack: 40, text: 'From grass tufts. Rope, torches, fires.', fuel: 15 },
  log: { name: 'Log', icon: '🪵', stack: 40, text: 'Chop trees with an axe.', fuel: 45 },
  rock: { name: 'Rocks', icon: '🪨', stack: 40, text: 'Mine boulders with a pickaxe.' },
  flint: { name: 'Flint', icon: '🔺', stack: 40, text: 'Sharp edges for tools. On the ground in rocky land.' },
  gold: { name: 'Gold nugget', icon: '🟡', stack: 40, text: 'From boulders, mostly gold veins.' },
  reeds: { name: 'Reeds', icon: '🎋', stack: 40, text: 'Marsh plants by the water.', fuel: 10 },
  petals: { name: 'Petals', icon: '🌸', stack: 40, text: 'Pick flowers. Calms the mind.' },
  silk: { name: 'Silk', icon: '🧵', stack: 40, text: 'Spiders and their dens drop it.' },
  fur: { name: 'Fur', icon: '🧶', stack: 40, text: 'Yaks drop it. Warm clothes.' },
  tooth: { name: 'Wolf tooth', icon: '🦷', stack: 40, text: 'Wolves drop it. Strong weapons.' },
  fuelx: { name: 'Shadow fuel', icon: '🌑', stack: 40, text: 'What is left of a shade.', fuel: 60 },
  rope: { name: 'Rope', icon: '➰', stack: 40, text: 'Needs a science machine.' },
  boards: { name: 'Boards', icon: '🟫', stack: 40, text: 'Needs a science machine.', fuel: 60 },
  stone: { name: 'Cut stone', icon: '🧱', stack: 40, text: 'Needs a science machine.' },
  rot: { name: 'Rot', icon: '🦠', stack: 40, text: 'Spoiled food. It burns, a little.', fuel: 8 },

  berries: { name: 'Berries', icon: '🫐', stack: 20, text: 'Raw berries.', food: { hunger: 9, hp: 0, san: 0, cook: 'rberries', spoil: 4, plant: true } },
  rberries: { name: 'Roasted berries', icon: '🍇', stack: 20, text: 'Warm and sweet.', food: { hunger: 12, hp: 1, san: 0, spoil: 3, plant: true } },
  carrot: { name: 'Carrot', icon: '🥕', stack: 20, text: 'Pulled from the ground.', food: { hunger: 12, hp: 1, san: 0, cook: 'rcarrot', spoil: 6, plant: true } },
  rcarrot: { name: 'Roasted carrot', icon: '🍠', stack: 20, text: 'Soft and filling.', food: { hunger: 14, hp: 3, san: 0, spoil: 4, plant: true } },
  mushroom: { name: 'Mushroom', icon: '🍄', stack: 20, text: 'Raw it hurts the mind. Cook it.', food: { hunger: 8, hp: 0, san: -10, cook: 'cmushroom', spoil: 5, plant: true } },
  cmushroom: { name: 'Cooked mushroom', icon: '🍲', stack: 20, text: 'Calms the mind.', food: { hunger: 8, hp: 2, san: 12, spoil: 4, plant: true } },
  morsel: { name: 'Morsel', icon: '🍗', stack: 20, text: 'Small raw meat.', food: { hunger: 12, hp: -2, san: -3, cook: 'cmorsel', spoil: 3 } },
  cmorsel: { name: 'Cooked morsel', icon: '🍖', stack: 20, text: 'Small cooked meat.', food: { hunger: 14, hp: 4, san: 0, spoil: 4 } },
  meat: { name: 'Meat', icon: '🥩', stack: 20, text: 'Raw meat.', food: { hunger: 25, hp: -4, san: -6, cook: 'cmeat', spoil: 3 } },
  cmeat: { name: 'Cooked meat', icon: '🍖', stack: 20, text: 'A real meal. Heals a bit.', food: { hunger: 30, hp: 10, san: 2, spoil: 5 } },
  mmeat: { name: 'Monster meat', icon: '🫀', stack: 20, text: 'Raw it hurts a lot.', food: { hunger: 18, hp: -15, san: -15, cook: 'cmmeat', spoil: 3 } },
  cmmeat: { name: 'Cooked monster meat', icon: '🍢', stack: 20, text: 'Still not good.', food: { hunger: 18, hp: -3, san: -8, spoil: 4 } },
  legs: { name: 'Frog legs', icon: '🦵', stack: 20, text: 'Raw frog legs.', food: { hunger: 12, hp: 0, san: -4, cook: 'clegs', spoil: 3 } },
  clegs: { name: 'Cooked frog legs', icon: '🍤', stack: 20, text: 'Better than it sounds.', food: { hunger: 14, hp: 6, san: 0, spoil: 4 } },
  jerky: { name: 'Jerky', icon: '🥓', stack: 20, text: 'Dried meat. Lasts a long time.', food: { hunger: 25, hp: 15, san: 10, spoil: 20 } },

  axe: { name: 'Axe', icon: '🪓', stack: 1, text: 'Chops trees. Also a weak weapon.', slot: 'hand', tool: 'chop', dmg: 16, dur: 60 },
  pickaxe: { name: 'Pickaxe', icon: '⛏️', stack: 1, text: 'Mines boulders. Also a weak weapon.', slot: 'hand', tool: 'mine', dmg: 16, dur: 50 },
  torch: { name: 'Torch', icon: '🔥', stack: 1, text: 'Light for the night. Burns while you hold it.', slot: 'hand', light: 4.5, dur: 80, dmg: 10, warm: 6 },
  lighter: { name: 'Lighter', icon: '🕯️', stack: 1, text: 'Kael\'s old lighter. Small light, long burn.', slot: 'hand', light: 3.6, dur: 360, dmg: 8, warm: 6 },
  lantern: { name: 'Lantern', icon: '🏮', stack: 1, text: 'A bright light that burns a long time.', slot: 'hand', light: 6, dur: 420, dmg: 10 },
  spear: { name: 'Spear', icon: '🔱', stack: 1, text: 'A real weapon.', slot: 'hand', dmg: 34, dur: 120 },
  tspear: { name: 'Tooth spear', icon: '🗡️', stack: 1, text: 'Wolf teeth on a pole. Hits hard.', slot: 'hand', dmg: 51, dur: 150 },
  blade: { name: 'Shadow blade', icon: '⚔️', stack: 1, text: 'Cuts deep. Drains the mind while held.', slot: 'hand', dmg: 70, dur: 120 },
  garmor: { name: 'Grass armor', icon: '🦺', stack: 1, text: 'Blocks 55% of damage.', slot: 'body', absorb: 0.55, dur: 160 },
  warmor: { name: 'Log armor', icon: '🛡️', stack: 1, text: 'Blocks 75% of damage.', slot: 'body', absorb: 0.75, dur: 400 },
  sarmor: { name: 'Stone armor', icon: '🪖', stack: 1, text: 'Blocks 85% of damage.', slot: 'body', absorb: 0.85, dur: 500 },
  helm: { name: 'Tooth helm', icon: '⛑️', stack: 1, text: 'Blocks 65% of damage. Stacks with armor.', slot: 'head', absorb: 0.65, dur: 250 },
  furhat: { name: 'Fur hat', icon: '🧢', stack: 1, text: 'Warm in winter (+25).', slot: 'head', warm: 25 },
  furcoat: { name: 'Fur coat', icon: '🧥', stack: 1, text: 'Very warm in winter (+40).', slot: 'body', warm: 40 },
  strawhat: { name: 'Straw hat', icon: '👒', stack: 1, text: 'Shade in summer (-15).', slot: 'head', cool: 15 },
  vest: { name: 'Reed vest', icon: '🥋', stack: 1, text: 'Cool in summer (-25).', slot: 'body', cool: 25 },
  crown: { name: 'Flower crown', icon: '💐', stack: 1, text: 'Slowly calms the mind.', slot: 'head', san: 0.12, dur: 600 },
  poultice: { name: 'Herb poultice', icon: '🩹', stack: 10, text: 'Heals 30 health.', heal: 30 },
  salve: { name: 'Silk bandage', icon: '💊', stack: 10, text: 'Heals 60 health.', heal: 60 },
  bedroll: { name: 'Straw roll', icon: '🛏️', stack: 5, text: 'Sleep by a fire at night. Skips to dawn: +40 sanity, +25 health, costs hunger.' },
  trap: { name: 'Trap', icon: '🪤', stack: 5, text: 'Place it near a rabbit hole. It catches rabbits.', place: 'trap' },

  crank: { name: 'Gate crank', icon: '⚙️', stack: 1, text: 'A portal part.', part: true },
  ring: { name: 'Rune ring', icon: '💍', stack: 1, text: 'A portal part.', part: true },
  crystal: { name: 'Bog crystal', icon: '💎', stack: 1, text: 'A portal part.', part: true },
  heart: { name: 'Ancient heart', icon: '❤️‍🔥', stack: 1, text: 'A portal part. Only great beasts carry one.', part: true },
};

export const PARTS = ['crank', 'ring', 'crystal', 'heart'] as const;

// ---------------- Structures ----------------

export interface StructDef {
  name: string;
  icon: string;
  /** Science tier this structure gives when you stand near it. */
  tier?: number;
  maxFuel?: number;
  text: string;
}

export const STRUCTS: Record<string, StructDef> = {
  campfire: { name: 'Campfire', icon: '🔥', maxFuel: 180, text: 'Light and warmth. Goes out for good when the fuel ends.' },
  firepit: { name: 'Fire pit', icon: '🔥', maxFuel: 320, text: 'A stone fire. You can light it again.' },
  science: { name: 'Science machine', icon: '⚗️', tier: 1, text: 'Unlocks tier 1 recipes nearby.' },
  alchemy: { name: 'Alchemy engine', icon: '🔮', tier: 2, text: 'Unlocks tier 2 recipes nearby.' },
  trap: { name: 'Trap', icon: '🪤', text: 'Catches rabbits near holes.' },
  portal: { name: 'Ancient gate', icon: '🌀', text: 'Bring the 4 parts here.' },
  rack: { name: 'Drying rack', icon: '🪝', text: 'Hang raw meat. It turns to jerky.' },
};

// ---------------- Recipes ----------------

export interface Recipe {
  id: string;
  /** Output item, or structure when `place` is set. */
  out: string;
  n: number;
  tier: number;
  cost: [string, number][];
  place?: string;
}

export const RECIPES: Recipe[] = [
  { id: 'axe', out: 'axe', n: 1, tier: 0, cost: [['twigs', 1], ['flint', 1]] },
  { id: 'pickaxe', out: 'pickaxe', n: 1, tier: 0, cost: [['twigs', 2], ['flint', 2]] },
  { id: 'torch', out: 'torch', n: 1, tier: 0, cost: [['grass', 2], ['twigs', 2]] },
  { id: 'campfire', out: 'campfire', n: 1, tier: 0, cost: [['grass', 3], ['log', 2]], place: 'campfire' },
  { id: 'trap', out: 'trap', n: 1, tier: 0, cost: [['grass', 6], ['twigs', 2]] },
  { id: 'garmor', out: 'garmor', n: 1, tier: 0, cost: [['grass', 10], ['twigs', 2]] },
  { id: 'poultice', out: 'poultice', n: 1, tier: 0, cost: [['petals', 3], ['mushroom', 1]] },
  { id: 'science', out: 'science', n: 1, tier: 0, cost: [['gold', 1], ['log', 4], ['rock', 4]], place: 'science' },

  { id: 'rope', out: 'rope', n: 1, tier: 1, cost: [['grass', 3]] },
  { id: 'boards', out: 'boards', n: 1, tier: 1, cost: [['log', 4]] },
  { id: 'stone', out: 'stone', n: 1, tier: 1, cost: [['rock', 3]] },
  { id: 'spear', out: 'spear', n: 1, tier: 1, cost: [['twigs', 2], ['rope', 1], ['flint', 1]] },
  { id: 'firepit', out: 'firepit', n: 1, tier: 1, cost: [['log', 2], ['rock', 8]], place: 'firepit' },
  { id: 'warmor', out: 'warmor', n: 1, tier: 1, cost: [['log', 8], ['rope', 2]] },
  { id: 'furhat', out: 'furhat', n: 1, tier: 1, cost: [['fur', 2], ['rope', 1]] },
  { id: 'furcoat', out: 'furcoat', n: 1, tier: 1, cost: [['fur', 4], ['rope', 2], ['silk', 2]] },
  { id: 'strawhat', out: 'strawhat', n: 1, tier: 1, cost: [['grass', 12]] },
  { id: 'vest', out: 'vest', n: 1, tier: 1, cost: [['reeds', 6], ['rope', 2]] },
  { id: 'crown', out: 'crown', n: 1, tier: 1, cost: [['petals', 10]] },
  { id: 'bedroll', out: 'bedroll', n: 1, tier: 1, cost: [['grass', 6], ['rope', 1]] },
  { id: 'rack', out: 'rack', n: 1, tier: 1, cost: [['twigs', 3], ['rope', 2], ['log', 2]], place: 'rack' },
  { id: 'helm', out: 'helm', n: 1, tier: 1, cost: [['tooth', 2], ['rope', 2], ['rock', 2]] },
  { id: 'alchemy', out: 'alchemy', n: 1, tier: 1, cost: [['boards', 4], ['stone', 2], ['gold', 6]], place: 'alchemy' },

  { id: 'lantern', out: 'lantern', n: 1, tier: 2, cost: [['gold', 2], ['rope', 2], ['boards', 1]] },
  { id: 'tspear', out: 'tspear', n: 1, tier: 2, cost: [['tooth', 2], ['boards', 1], ['rope', 1]] },
  { id: 'sarmor', out: 'sarmor', n: 1, tier: 2, cost: [['stone', 6], ['rope', 2]] },
  { id: 'blade', out: 'blade', n: 1, tier: 2, cost: [['fuelx', 3], ['tooth', 1], ['gold', 1]] },
  { id: 'salve', out: 'salve', n: 1, tier: 2, cost: [['silk', 2], ['petals', 4]] },
];

// ---------------- Resource nodes ----------------

export interface NodeDef {
  name: string;
  icon: string;
  /** Icon when picked or chopped, or null when the node disappears. */
  used: string | null;
  tool?: 'chop' | 'mine';
  hits: number;
  drops: [string, number, number][];
  /** Regrow time in days. 0 means it does not regrow. */
  regrow: number;
  /** Plants do not regrow in winter. */
  plant?: boolean;
  size: number;
  /** A spawner home for creatures. */
  spawns?: string;
  san?: number;
}

export const NODES: Record<string, NodeDef> = {
  tree: { name: 'Tree', icon: '🌲', used: '🪵', tool: 'chop', hits: 4, drops: [['log', 2, 1], ['log', 1, 0.5]], regrow: 3, size: 1.5 },
  oak: { name: 'Oak', icon: '🌳', used: '🪵', tool: 'chop', hits: 5, drops: [['log', 3, 1]], regrow: 4, size: 1.5 },
  sapling: { name: 'Sapling', icon: '🌱', used: '·', hits: 1, drops: [['twigs', 2, 1]], regrow: 1.5, plant: true, size: 0.8 },
  grass: { name: 'Grass tuft', icon: '🌾', used: '·', hits: 1, drops: [['grass', 2, 1]], regrow: 1.5, plant: true, size: 0.8 },
  berry: { name: 'Berry bush', icon: '🫐', used: '🌿', hits: 1, drops: [['berries', 2, 1], ['berries', 1, 0.3]], regrow: 2.5, plant: true, size: 1 },
  carrot: { name: 'Carrot', icon: '🥕', used: null, hits: 1, drops: [['carrot', 1, 1]], regrow: 3, plant: true, size: 0.7 },
  flower: { name: 'Flower', icon: '🌼', used: null, hits: 1, drops: [['petals', 1, 1]], regrow: 1, plant: true, size: 0.7, san: 4 },
  mushroom: { name: 'Mushroom', icon: '🍄', used: null, hits: 1, drops: [['mushroom', 1, 1]], regrow: 2, plant: true, size: 0.7 },
  reeds: { name: 'Reeds', icon: '🎋', used: '·', hits: 1, drops: [['reeds', 1, 1]], regrow: 2, plant: true, size: 0.9 },
  flint: { name: 'Flint', icon: '🔺', used: null, hits: 1, drops: [['flint', 1, 1]], regrow: 4, size: 0.5 },
  boulder: { name: 'Boulder', icon: '🪨', used: '⋯', tool: 'mine', hits: 5, drops: [['rock', 2, 1], ['flint', 1, 1], ['gold', 1, 0.2]], regrow: 6, size: 1.3 },
  vein: { name: 'Gold vein', icon: '🪨', used: '⋯', tool: 'mine', hits: 6, drops: [['rock', 2, 1], ['gold', 2, 1], ['gold', 1, 0.5]], regrow: 8, size: 1.3 },
  burrow: { name: 'Rabbit hole', icon: '🕳️', used: null, hits: 0, drops: [], regrow: 0, size: 0.6, spawns: 'rabbit' },
  nest: { name: 'Spider den', icon: '🕸️', used: null, hits: 12, drops: [['silk', 4, 1], ['mmeat', 1, 1]], regrow: 0, size: 1.4, spawns: 'spider' },
  den: { name: 'Wolf den', icon: '🦴', used: null, hits: 0, drops: [], regrow: 0, size: 1.2, spawns: 'wolf' },
  pond: { name: 'Frog pond', icon: '🪷', used: null, hits: 0, drops: [], regrow: 0, size: 1, spawns: 'frog' },
  herd: { name: 'Yak trail', icon: '🐾', used: null, hits: 0, drops: [], regrow: 0, size: 0.6, spawns: 'yak' },
  sty: { name: 'Boar wallow', icon: '🐾', used: null, hits: 0, drops: [], regrow: 0, size: 0.6, spawns: 'boar' },
  pcrank: { name: 'Strange mound', icon: '✨', used: null, hits: 3, drops: [['crank', 1, 1]], regrow: 0, size: 1 },
  pring: { name: 'Strange mound', icon: '✨', used: null, hits: 3, drops: [['ring', 1, 1]], regrow: 0, size: 1 },
  pcrystal: { name: 'Strange mound', icon: '✨', used: null, hits: 3, drops: [['crystal', 1, 1]], regrow: 0, size: 1 },
};

/** Node density per tile, per biome. */
export const SPAWN: Record<Biome, [string, number][]> = {
  grass: [['grass', 0.055], ['sapling', 0.035], ['berry', 0.03], ['tree', 0.02], ['flower', 0.035], ['carrot', 0.014], ['flint', 0.008], ['burrow', 0.008], ['boulder', 0.004], ['herd', 0.0035]],
  forest: [['tree', 0.2], ['oak', 0.04], ['sapling', 0.04], ['berry', 0.014], ['mushroom', 0.018], ['grass', 0.012], ['nest', 0.005], ['sty', 0.004], ['flower', 0.006]],
  rocky: [['boulder', 0.075], ['vein', 0.012], ['flint', 0.04], ['tree', 0.006], ['den', 0.003], ['sapling', 0.01]],
  marsh: [['reeds', 0.06], ['grass', 0.03], ['mushroom', 0.016], ['tree', 0.012], ['pond', 0.008], ['sapling', 0.01], ['flower', 0.008]],
};

// ---------------- Creatures ----------------

export type Mood = 'passive' | 'neutral' | 'hostile';

export interface CreatureDef {
  name: string;
  icon: string;
  hp: number;
  dmg: number;
  speed: number;
  /** Attack cooldown in seconds. */
  cd: number;
  range: number;
  aggro: number;
  mood: Mood;
  /** Active time: 'day', 'night' or 'always'. */
  active: 'day' | 'night' | 'always';
  drops: [string, number, number][];
  size: number;
  boss?: boolean;
  /** Seconds of the attack wind-up (bosses telegraph a ground slam). */
  windup?: number;
  /** Area radius of the attack. */
  area?: number;
  text: string;
}

export const CREATURES: Record<string, CreatureDef> = {
  rabbit: { name: 'Rabbit', icon: '🐇', hp: 25, dmg: 0, speed: 4.6, cd: 1, range: 0, aggro: 4, mood: 'passive', active: 'day', drops: [['morsel', 1, 1]], size: 0.8, text: 'Runs away. Hides in its hole at night. Traps catch it.' },
  yak: { name: 'Yak', icon: '🦬', hp: 320, dmg: 25, speed: 1.4, cd: 3, range: 1.6, aggro: 0, mood: 'neutral', active: 'always', drops: [['meat', 3, 1], ['fur', 2, 1]], size: 1.5, text: 'Calm until hit. Then the yaks close by charge. Grumpy in spring.' },
  boar: { name: 'Boar', icon: '🐗', hp: 140, dmg: 15, speed: 3.2, cd: 2.2, range: 1.3, aggro: 0, mood: 'neutral', active: 'always', drops: [['meat', 1, 1], ['meat', 1, 0.5]], size: 1.1, text: 'Forest pig. Calm until hit. At night it charges when you come close.' },
  spider: { name: 'Spider', icon: '🕷️', hp: 90, dmg: 13, speed: 3.5, cd: 2.4, range: 1.2, aggro: 7, mood: 'hostile', active: 'night', drops: [['mmeat', 1, 1], ['silk', 1, 0.6]], size: 1, text: 'Sleeps in its den by day. Hunts at night.' },
  wolf: { name: 'Wolf', icon: '🐺', hp: 120, dmg: 15, speed: 4.5, cd: 2, range: 1.2, aggro: 9, mood: 'hostile', active: 'night', drops: [['meat', 1, 1], ['tooth', 1, 0.6]], size: 1.1, text: 'Faster than you. Packs hunt at night.' },
  frog: { name: 'Frog', icon: '🐸', hp: 70, dmg: 8, speed: 3, cd: 2, range: 1.1, aggro: 4.5, mood: 'hostile', active: 'day', drops: [['legs', 1, 1]], size: 0.8, text: 'Marsh pest. Sleeps at night.' },
  shade: { name: 'Shade', icon: '👤', hp: 120, dmg: 20, speed: 3.2, cd: 2.2, range: 1.3, aggro: 14, mood: 'hostile', active: 'always', drops: [['fuelx', 1, 1]], size: 1.2, text: 'Comes when your mind slips. Goes away when you calm down.' },
  grizz: { name: 'Grizzhorn', icon: '🐻', hp: 900, dmg: 55, speed: 2.4, cd: 3, range: 1.8, aggro: 10, mood: 'hostile', active: 'always', drops: [['heart', 1, 1], ['meat', 4, 1], ['fur', 3, 1]], size: 2.3, boss: true, windup: 0.9, area: 2.2, text: 'Autumn boss from the second year on. Slow. Slams the ground.' },
  giant: { name: 'Frost Giant', icon: '🦣', hp: 1800, dmg: 70, speed: 2.2, cd: 3.2, range: 2, aggro: 10, mood: 'hostile', active: 'always', drops: [['heart', 1, 1], ['meat', 6, 1], ['fur', 4, 1]], size: 2.6, boss: true, windup: 1, area: 2.5, text: 'Winter boss. Slow. Slams the ground.' },
  moose: { name: 'Bog Moose', icon: '🫎', hp: 1500, dmg: 60, speed: 2.6, cd: 2.8, range: 1.9, aggro: 10, mood: 'hostile', active: 'always', drops: [['heart', 1, 1], ['meat', 5, 1]], size: 2.4, boss: true, windup: 0.85, area: 2.3, text: 'Spring boss. Charges and stomps.' },
  wyrm: { name: 'Sun Wyrm', icon: '🐉', hp: 1600, dmg: 65, speed: 2.5, cd: 3, range: 2, aggro: 10, mood: 'hostile', active: 'always', drops: [['heart', 1, 1], ['meat', 4, 1], ['tooth', 3, 1]], size: 2.6, boss: true, windup: 0.95, area: 2.5, text: 'Summer boss. Burns the ground.' },
};

// ---------------- Characters ----------------

export interface CharDef {
  name: string;
  icon: string;
  title: string;
  text: string;
  hp: number;
  hunger: number;
  san: number;
  /** Total days survived over all runs to unlock. */
  unlock: number;
  kit: [string, number][];
  hungerRate?: number;
  dmgMul?: number;
  chopMul?: number;
  plantMul?: number;
  warm?: number;
  tierBonus?: number;
}

export const CHARS: Record<string, CharDef> = {
  wren: { name: 'Wren', icon: '🧑', title: 'the Wanderer', text: 'No tricks. A good start.', hp: 150, hunger: 150, san: 200, unlock: 0, kit: [] },
  bram: { name: 'Bram', icon: '🧔', title: 'the Woodsman', text: 'Starts with an axe. Chops twice as fast.', hp: 150, hunger: 150, san: 160, unlock: 4, kit: [['axe', 1]], chopMul: 2 },
  ivy: { name: 'Ivy', icon: '👩‍🌾', title: 'the Herbalist', text: 'Plants feed her 40% more. Starts with 2 poultices. Less health.', hp: 125, hunger: 150, san: 200, unlock: 10, kit: [['poultice', 2]], plantMul: 1.4 },
  kael: { name: 'Kael', icon: '🧑‍🚒', title: 'the Fire-touched', text: 'Starts with a lighter. Always runs 15° warmer, also in summer.', hp: 150, hunger: 150, san: 180, unlock: 18, kit: [['lighter', 1]], warm: 15 },
  odo: { name: 'Odo', icon: '💪', title: 'the Strongman', text: '+30% damage and 180 health. Gets hungry 35% faster.', hp: 180, hunger: 150, san: 160, unlock: 28, kit: [], dmgMul: 1.3, hungerRate: 1.35 },
  mira: { name: 'Mira', icon: '👩‍🔬', title: 'the Scholar', text: 'Knows one tier more anywhere. Fragile body.', hp: 110, hunger: 150, san: 240, unlock: 40, kit: [], tierBonus: 1 },
};

export const CHAR_IDS = Object.keys(CHARS);
