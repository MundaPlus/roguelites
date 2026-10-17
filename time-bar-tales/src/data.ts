/** Static game data: elements, statuses, classes, skills, enemies, items, gear, events. */

export type Elem = 'fire' | 'ice' | 'thunder' | 'holy' | 'dark';
export const ELEMS: Elem[] = ['fire', 'ice', 'thunder', 'holy', 'dark'];
export const ELEM_ICON: Record<Elem, string> = { fire: '🔥', ice: '❄️', thunder: '⚡', holy: '✨', dark: '🌑' };
export const ELEM_NAME: Record<Elem, string> = { fire: 'Fire', ice: 'Ice', thunder: 'Thunder', holy: 'Holy', dark: 'Dark' };

export type StatusId = 'haste' | 'slow' | 'poison' | 'sleep' | 'protect';
export const STATUS: Record<StatusId, { name: string; icon: string; dur: number; bad: boolean; text: string }> = {
  haste: { name: 'Haste', icon: '⏩', dur: 16, bad: false, text: 'The time bar fills 50% faster.' },
  slow: { name: 'Slow', icon: '🐌', dur: 14, bad: true, text: 'The time bar fills 50% slower.' },
  poison: { name: 'Poison', icon: '☠️', dur: 18, bad: true, text: 'Loses 4% of max HP every 2 seconds.' },
  sleep: { name: 'Sleep', icon: '💤', dur: 10, bad: true, text: 'The time bar stops. A hit wakes the unit.' },
  protect: { name: 'Protect', icon: '🔰', dur: 20, bad: false, text: 'Takes 35% less physical damage.' },
};

export type Row = 'front' | 'back';

export interface Stats {
  hp: number;
  mp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
}
export const STAT_KEYS: (keyof Stats)[] = ['hp', 'mp', 'atk', 'def', 'mag', 'res', 'spd'];
export const STAT_NAME: Record<keyof Stats, string> = { hp: 'HP', mp: 'MP', atk: 'Attack', def: 'Defense', mag: 'Magic', res: 'Spirit', spd: 'Speed' };

/** Who an action can hit. Relative to the user: "enemy" is the other side. */
export type Target = 'enemy' | 'enemies' | 'row' | 'random' | 'ally' | 'allies' | 'self' | 'ko';

export type Kind = 'phys' | 'mag' | 'heal' | 'revive' | 'status' | 'cure' | 'steal' | 'atb' | 'summon' | 'mp' | 'full' | 'flat';

export interface ActionDef {
  id: string;
  name: string;
  icon: string;
  kind: Kind;
  target: Target;
  mp?: number;
  power?: number;
  /** Fixed amount (items) or percent of max HP (`pct`). */
  flat?: number;
  pct?: number;
  elem?: Elem | 'best' | 'rand';
  status?: StatusId;
  chance?: number;
  hits?: number;
  crit?: boolean;
  drain?: boolean;
  steal?: boolean;
  ignoreRow?: boolean;
  /** Change of the targets' time bars (−100 empties them). */
  atb?: number;
  /** The user's time bar after the action (default 0). */
  self?: number;
  summon?: string[];
  text: string;
}

// ---------- Hero skills ----------

const sk = (a: ActionDef): ActionDef => a;

export const SKILLS: Record<string, ActionDef> = {
  attack: sk({ id: 'attack', name: 'Attack', icon: '⚔️', kind: 'phys', target: 'enemy', power: 1, text: 'A weapon hit on one enemy.' }),
  // Knight
  power_strike: sk({ id: 'power_strike', name: 'Power Strike', icon: '💥', kind: 'phys', target: 'enemy', mp: 4, power: 1.8, text: 'A heavy blow. 180% damage.' }),
  fortify: sk({ id: 'fortify', name: 'Fortify', icon: '🔰', kind: 'status', target: 'self', mp: 3, status: 'protect', chance: 1, self: 50, text: 'Protect on self. The time bar keeps half.' }),
  holy_blade: sk({ id: 'holy_blade', name: 'Holy Blade', icon: '✨', kind: 'phys', target: 'enemy', mp: 7, power: 1.7, elem: 'holy', text: 'A holy strike. 170% damage.' }),
  sweep: sk({ id: 'sweep', name: 'Sweep', icon: '🌀', kind: 'phys', target: 'row', mp: 7, power: 1.0, text: 'Hits every enemy in one row.' }),
  shield_wall: sk({ id: 'shield_wall', name: 'Shield Wall', icon: '🏰', kind: 'status', target: 'allies', mp: 12, status: 'protect', chance: 1, text: 'Protect on the whole party.' }),
  lionheart: sk({ id: 'lionheart', name: 'Lionheart', icon: '🦁', kind: 'phys', target: 'enemy', mp: 14, power: 3.0, ignoreRow: true, text: '300% damage. Ignores rows.' }),
  valor: sk({ id: 'valor', name: 'Valor', icon: '⚜️', kind: 'phys', target: 'enemies', mp: 16, power: 1.15, ignoreRow: true, text: 'Hits all enemies. Ignores rows.' }),
  // Mage
  fire: sk({ id: 'fire', name: 'Fire', icon: '🔥', kind: 'mag', target: 'enemy', mp: 4, power: 1.5, elem: 'fire', text: 'Fire spell on one enemy.' }),
  blizzard: sk({ id: 'blizzard', name: 'Blizzard', icon: '❄️', kind: 'mag', target: 'enemy', mp: 4, power: 1.5, elem: 'ice', text: 'Ice spell on one enemy.' }),
  thunder: sk({ id: 'thunder', name: 'Thunder', icon: '⚡', kind: 'mag', target: 'enemy', mp: 4, power: 1.5, elem: 'thunder', text: 'Thunder spell on one enemy.' }),
  fira: sk({ id: 'fira', name: 'Fira', icon: '☄️', kind: 'mag', target: 'enemies', mp: 10, power: 1.0, elem: 'fire', text: 'Fire on all enemies.' }),
  sleep: sk({ id: 'sleep', name: 'Sleep', icon: '💤', kind: 'status', target: 'enemy', mp: 5, status: 'sleep', chance: 0.8, text: 'Puts one enemy to sleep (80%).' }),
  flare: sk({ id: 'flare', name: 'Flare', icon: '🌟', kind: 'mag', target: 'enemy', mp: 18, power: 3.2, text: 'A huge blast on one enemy. No element.' }),
  tempest: sk({ id: 'tempest', name: 'Tempest', icon: '🌈', kind: 'mag', target: 'enemies', mp: 20, power: 1.1, elem: 'best', text: 'All enemies. Each takes its worst element.' }),
  // Thief
  steal: sk({ id: 'steal', name: 'Steal', icon: '🫳', kind: 'steal', target: 'enemy', mp: 0, text: 'Takes an item or gold from one enemy.' }),
  quick_hit: sk({ id: 'quick_hit', name: 'Quick Hit', icon: '💨', kind: 'phys', target: 'enemy', mp: 3, power: 0.9, self: 60, text: 'A fast hit. The time bar keeps 60%.' }),
  poison_edge: sk({ id: 'poison_edge', name: 'Poison Edge', icon: '🧪', kind: 'phys', target: 'enemy', mp: 4, power: 1.1, status: 'poison', chance: 0.85, text: 'A hit that poisons (85%).' }),
  flurry: sk({ id: 'flurry', name: 'Flurry', icon: '🌪️', kind: 'phys', target: 'random', mp: 8, power: 0.6, hits: 4, text: '4 hits on random enemies.' }),
  slow_dart: sk({ id: 'slow_dart', name: 'Slow Dart', icon: '🎯', kind: 'phys', target: 'enemy', mp: 5, power: 0.8, status: 'slow', chance: 0.85, ignoreRow: true, text: 'A dart that slows (85%).' }),
  assassinate: sk({ id: 'assassinate', name: 'Assassinate', icon: '🗡️', kind: 'phys', target: 'enemy', mp: 12, power: 2.0, crit: true, text: 'Always a critical hit. 300% damage.' }),
  mug: sk({ id: 'mug', name: 'Mug', icon: '💰', kind: 'phys', target: 'enemy', mp: 6, power: 1.4, steal: true, text: 'Hits and steals at once.' }),
  // Healer
  cure: sk({ id: 'cure', name: 'Cure', icon: '💚', kind: 'heal', target: 'ally', mp: 4, power: 1.0, text: 'Heals one ally.' }),
  protect: sk({ id: 'protect', name: 'Protect', icon: '🔰', kind: 'status', target: 'ally', mp: 5, status: 'protect', chance: 1, text: 'Protect on one ally.' }),
  esuna: sk({ id: 'esuna', name: 'Esuna', icon: '🌿', kind: 'cure', target: 'ally', mp: 3, text: 'Cures poison, sleep and slow.' }),
  cura: sk({ id: 'cura', name: 'Cura', icon: '💖', kind: 'heal', target: 'allies', mp: 11, power: 0.7, text: 'Heals the whole party.' }),
  banish: sk({ id: 'banish', name: 'Banish', icon: '✨', kind: 'mag', target: 'enemy', mp: 7, power: 1.8, elem: 'holy', text: 'Holy light on one enemy.' }),
  raise: sk({ id: 'raise', name: 'Raise', icon: '🪽', kind: 'revive', target: 'ko', mp: 14, pct: 0.4, text: 'Revives a fallen ally with 40% HP.' }),
  haste: sk({ id: 'haste', name: 'Haste', icon: '⏩', kind: 'status', target: 'ally', mp: 7, status: 'haste', chance: 1, text: 'Haste on one ally.' }),
  // Bard
  swift_song: sk({ id: 'swift_song', name: 'Swift Song', icon: '🎵', kind: 'status', target: 'ally', mp: 5, status: 'haste', chance: 1, text: 'Haste on one ally.' }),
  lullaby: sk({ id: 'lullaby', name: 'Lullaby', icon: '🎶', kind: 'status', target: 'enemies', mp: 8, status: 'sleep', chance: 0.45, text: 'Sleep on all enemies (45% each).' }),
  dirge: sk({ id: 'dirge', name: 'Dirge', icon: '🎼', kind: 'status', target: 'enemies', mp: 7, status: 'slow', chance: 0.6, text: 'Slow on all enemies (60% each).' }),
  hymn: sk({ id: 'hymn', name: 'Hymn', icon: '🎻', kind: 'heal', target: 'allies', mp: 9, power: 0.6, text: 'Heals the whole party.' }),
  shrill: sk({ id: 'shrill', name: 'Shrill Note', icon: '📯', kind: 'mag', target: 'enemies', mp: 9, power: 0.95, elem: 'thunder', text: 'Thunder on all enemies.' }),
  requiem: sk({ id: 'requiem', name: 'Requiem', icon: '🕯️', kind: 'mag', target: 'enemies', mp: 16, power: 1.35, elem: 'holy', text: 'Holy damage on all enemies.' }),
  encore: sk({ id: 'encore', name: 'Encore', icon: '🔁', kind: 'atb', target: 'allies', mp: 16, atb: 100, text: 'Fills the time bars of all other allies.' }),
  // Summoner
  salamander: sk({ id: 'salamander', name: 'Salamander', icon: '🦎', kind: 'mag', target: 'enemies', mp: 12, power: 1.25, elem: 'fire', text: 'Summon: fire on all enemies.' }),
  frost_wyrm: sk({ id: 'frost_wyrm', name: 'Frost Wyrm', icon: '🐉', kind: 'mag', target: 'enemies', mp: 12, power: 1.25, elem: 'ice', text: 'Summon: ice on all enemies.' }),
  storm_roc: sk({ id: 'storm_roc', name: 'Storm Roc', icon: '🦅', kind: 'mag', target: 'enemies', mp: 12, power: 1.25, elem: 'thunder', text: 'Summon: thunder on all enemies.' }),
  ruby_fox: sk({ id: 'ruby_fox', name: 'Ruby Fox', icon: '🦊', kind: 'status', target: 'allies', mp: 12, status: 'protect', chance: 1, text: 'Summon: Protect on the party.' }),
  sun_lion: sk({ id: 'sun_lion', name: 'Sun Lion', icon: '🌞', kind: 'mag', target: 'enemies', mp: 18, power: 1.5, elem: 'holy', text: 'Summon: holy light on all enemies.' }),
  night_dragon: sk({ id: 'night_dragon', name: 'Night Dragon', icon: '🐲', kind: 'mag', target: 'enemies', mp: 30, power: 2.2, elem: 'dark', text: 'Summon: dark fire on all enemies.' }),
  phoenix: sk({ id: 'phoenix', name: 'Phoenix', icon: '🌅', kind: 'revive', target: 'allies', mp: 30, pct: 0.35, text: 'Summon: revives all fallen allies (35%) and heals the rest.' }),
  defend: sk({ id: 'defend', name: 'Defend', icon: '🛡️', kind: 'status', target: 'self', text: 'Halves damage until your next command.' }),
};

// ---------- Classes ----------

export interface ClassDef {
  id: string;
  name: string;
  icon: string;
  row: Row;
  base: Stats;
  grow: Stats;
  crit: number;
  start: string;
  /** 3 tiers with 2 skills each. Tier n needs level 2n and a skill of the tier before. */
  tree: [string, string][];
  gear: { weapon?: string; armor?: string; acc?: string };
  names: string[];
  text: string;
  /** Crystal cost in the Guild. 0 means unlocked from the start. */
  cost: number;
}

export const CLASSES: Record<string, ClassDef> = {
  knight: {
    id: 'knight', name: 'Knight', icon: '🤺', row: 'front', crit: 0.05,
    base: { hp: 120, mp: 14, atk: 14, def: 12, mag: 4, res: 8, spd: 9 },
    grow: { hp: 15, mp: 2, atk: 2.4, def: 2, mag: 0.4, res: 1.1, spd: 0.35 },
    start: 'power_strike',
    tree: [['fortify', 'holy_blade'], ['sweep', 'shield_wall'], ['lionheart', 'valor']],
    gear: { weapon: 'bronze_sword', armor: 'leather' },
    names: ['Aldric', 'Bryn', 'Cedric', 'Dara', 'Gareth', 'Isolde'],
    text: 'Front line. High HP and defense. Strong single hits.', cost: 0,
  },
  mage: {
    id: 'mage', name: 'Mage', icon: '🧙', row: 'back', crit: 0.03,
    base: { hp: 72, mp: 40, atk: 6, def: 5, mag: 16, res: 12, spd: 10 },
    grow: { hp: 8, mp: 5, atk: 0.6, def: 0.8, mag: 2.5, res: 1.6, spd: 0.4 },
    start: 'fire',
    tree: [['blizzard', 'thunder'], ['fira', 'sleep'], ['flare', 'tempest']],
    gear: { weapon: 'oak_staff', armor: 'robe' },
    names: ['Merla', 'Quill', 'Ozric', 'Vela', 'Zane', 'Ysolt'],
    text: 'Back row. Elemental spells that hit weaknesses.', cost: 0,
  },
  thief: {
    id: 'thief', name: 'Thief', icon: '🥷', row: 'front', crit: 0.15,
    base: { hp: 88, mp: 16, atk: 12, def: 7, mag: 6, res: 7, spd: 15 },
    grow: { hp: 10, mp: 2, atk: 2, def: 1.1, mag: 0.6, res: 0.9, spd: 0.6 },
    start: 'steal',
    tree: [['quick_hit', 'poison_edge'], ['flurry', 'slow_dart'], ['assassinate', 'mug']],
    gear: { weapon: 'hunting_knife', armor: 'leather' },
    names: ['Rook', 'Sly', 'Nim', 'Kestrel', 'Vex', 'Wren'],
    text: 'Very fast. Steals items. 15% critical hits.', cost: 0,
  },
  healer: {
    id: 'healer', name: 'Healer', icon: '🧝', row: 'back', crit: 0.03,
    base: { hp: 80, mp: 34, atk: 7, def: 6, mag: 13, res: 14, spd: 11 },
    grow: { hp: 9, mp: 4.5, atk: 0.8, def: 0.9, mag: 2, res: 1.8, spd: 0.4 },
    start: 'cure',
    tree: [['protect', 'esuna'], ['cura', 'banish'], ['raise', 'haste']],
    gear: { weapon: 'oak_staff', armor: 'robe' },
    names: ['Elia', 'Rosa', 'Tamsin', 'Faye', 'Lior', 'Ansel'],
    text: 'Back row. Heals, cures and buffs the party.', cost: 0,
  },
  bard: {
    id: 'bard', name: 'Bard', icon: '🧚', row: 'back', crit: 0.05,
    base: { hp: 82, mp: 28, atk: 9, def: 7, mag: 11, res: 11, spd: 13 },
    grow: { hp: 9, mp: 3.5, atk: 1.2, def: 1, mag: 1.7, res: 1.4, spd: 0.5 },
    start: 'swift_song',
    tree: [['lullaby', 'dirge'], ['hymn', 'shrill'], ['requiem', 'encore']],
    gear: { weapon: 'hunting_knife', armor: 'robe' },
    names: ['Lark', 'Melody', 'Piper', 'Rhyme', 'Sonnet', 'Tune'],
    text: 'Songs that bend time: haste, sleep, slow and Encore.', cost: 50,
  },
  summoner: {
    id: 'summoner', name: 'Summoner', icon: '🧞', row: 'back', crit: 0.03,
    base: { hp: 76, mp: 46, atk: 6, def: 5, mag: 15, res: 13, spd: 8 },
    grow: { hp: 8, mp: 6, atk: 0.6, def: 0.8, mag: 2.3, res: 1.6, spd: 0.3 },
    start: 'salamander',
    tree: [['frost_wyrm', 'storm_roc'], ['ruby_fox', 'sun_lion'], ['night_dragon', 'phoenix']],
    gear: { weapon: 'oak_staff', armor: 'robe' },
    names: ['Asha', 'Bael', 'Cyra', 'Draven', 'Ember', 'Juno'],
    text: 'Slow but mighty. Summons hit all enemies.', cost: 70,
  },
};
export const CLASS_IDS = Object.keys(CLASSES);

// ---------- Items ----------

export interface ItemDef extends ActionDef {
  price: number;
}

const it = (a: ItemDef): ItemDef => a;

export const ITEMS: Record<string, ItemDef> = {
  potion: it({ id: 'potion', name: 'Potion', icon: '🧪', kind: 'heal', target: 'ally', flat: 100, price: 30, text: 'Heals 100 HP.' }),
  hipotion: it({ id: 'hipotion', name: 'Hi-Potion', icon: '🍶', kind: 'heal', target: 'ally', flat: 260, price: 75, text: 'Heals 260 HP.' }),
  ether: it({ id: 'ether', name: 'Ether', icon: '💧', kind: 'mp', target: 'ally', flat: 30, price: 60, text: 'Restores 30 MP.' }),
  phoenix_down: it({ id: 'phoenix_down', name: 'Phoenix Down', icon: '🪶', kind: 'revive', target: 'ko', pct: 0.3, price: 90, text: 'Revives a fallen ally with 30% HP.' }),
  remedy: it({ id: 'remedy', name: 'Remedy', icon: '🌿', kind: 'cure', target: 'ally', price: 25, text: 'Cures poison, sleep and slow.' }),
  tonic: it({ id: 'tonic', name: 'Speed Tonic', icon: '🥤', kind: 'status', target: 'ally', status: 'haste', chance: 1, price: 40, text: 'Haste on one ally.' }),
  firebomb: it({ id: 'firebomb', name: 'Fire Bomb', icon: '💣', kind: 'flat', target: 'enemies', flat: 60, elem: 'fire', price: 50, text: 'Fire damage to all enemies. Grows with the floor.' }),
  icegem: it({ id: 'icegem', name: 'Ice Gem', icon: '🧊', kind: 'flat', target: 'enemies', flat: 60, elem: 'ice', price: 50, text: 'Ice damage to all enemies. Grows with the floor.' }),
  voltjar: it({ id: 'voltjar', name: 'Volt Jar', icon: '🔋', kind: 'flat', target: 'enemies', flat: 60, elem: 'thunder', price: 50, text: 'Thunder damage to all enemies. Grows with the floor.' }),
  elixir: it({ id: 'elixir', name: 'Elixir', icon: '⚗️', kind: 'full', target: 'ally', price: 200, text: 'Full HP and MP for one ally.' }),
};
export const ITEM_IDS = Object.keys(ITEMS);

// ---------- Gear ----------

export type Slot = 'weapon' | 'armor' | 'acc';
export const SLOT_NAME: Record<Slot, string> = { weapon: 'Weapon', armor: 'Armor', acc: 'Accessory' };

export interface GearDef {
  id: string;
  name: string;
  icon: string;
  slot: Slot;
  tier: 1 | 2 | 3;
  stats: Partial<Stats>;
  elem?: Elem;
  resist?: Partial<Record<Elem, number>>;
  immune?: StatusId[];
  perk?: 'quick' | 'gold' | 'ranged';
  price: number;
  /** Only from the Guild, never in shops. */
  meta?: boolean;
}

export const GEAR: Record<string, GearDef> = {
  bronze_sword: { id: 'bronze_sword', name: 'Bronze Sword', icon: '🗡️', slot: 'weapon', tier: 1, stats: { atk: 4 }, price: 50 },
  oak_staff: { id: 'oak_staff', name: 'Oak Staff', icon: '🪄', slot: 'weapon', tier: 1, stats: { mag: 4, mp: 5 }, price: 50 },
  hunting_knife: { id: 'hunting_knife', name: 'Hunting Knife', icon: '🔪', slot: 'weapon', tier: 1, stats: { atk: 3, spd: 1 }, price: 50 },
  iron_axe: { id: 'iron_axe', name: 'Iron Axe', icon: '🪓', slot: 'weapon', tier: 1, stats: { atk: 7, spd: -1 }, price: 80 },
  flame_blade: { id: 'flame_blade', name: 'Flame Blade', icon: '🔥', slot: 'weapon', tier: 2, stats: { atk: 9 }, elem: 'fire', price: 150 },
  frost_rod: { id: 'frost_rod', name: 'Frost Rod', icon: '🧊', slot: 'weapon', tier: 2, stats: { mag: 9, mp: 8 }, elem: 'ice', price: 150 },
  thunder_spear: { id: 'thunder_spear', name: 'Thunder Spear', icon: '🔱', slot: 'weapon', tier: 2, stats: { atk: 10 }, elem: 'thunder', price: 160 },
  holy_mace: { id: 'holy_mace', name: 'Holy Mace', icon: '🔨', slot: 'weapon', tier: 2, stats: { atk: 7, mag: 5 }, elem: 'holy', price: 160 },
  shadow_dagger: { id: 'shadow_dagger', name: 'Shadow Dagger', icon: '🌑', slot: 'weapon', tier: 2, stats: { atk: 8, spd: 2 }, elem: 'dark', price: 160 },
  long_bow: { id: 'long_bow', name: 'Long Bow', icon: '🏹', slot: 'weapon', tier: 2, stats: { atk: 8 }, perk: 'ranged', price: 150 },
  mythril_sword: { id: 'mythril_sword', name: 'Mythril Sword', icon: '⚔️', slot: 'weapon', tier: 3, stats: { atk: 16 }, price: 300 },
  sage_staff: { id: 'sage_staff', name: 'Sage Staff', icon: '📿', slot: 'weapon', tier: 3, stats: { mag: 16, mp: 15 }, price: 300 },
  rune_blade: { id: 'rune_blade', name: 'Rune Blade', icon: '🌟', slot: 'weapon', tier: 3, stats: { atk: 12, mag: 9 }, elem: 'holy', price: 320 },
  dragon_bow: { id: 'dragon_bow', name: 'Dragon Bow', icon: '🎯', slot: 'weapon', tier: 3, stats: { atk: 14, spd: 2 }, perk: 'ranged', price: 330 },
  leather: { id: 'leather', name: 'Leather Vest', icon: '🦺', slot: 'armor', tier: 1, stats: { def: 4, hp: 10 }, price: 45 },
  robe: { id: 'robe', name: 'Silk Robe', icon: '👘', slot: 'armor', tier: 1, stats: { res: 4, mp: 8 }, price: 45 },
  chain: { id: 'chain', name: 'Chain Mail', icon: '⛓️', slot: 'armor', tier: 2, stats: { def: 10, hp: 30, spd: -1 }, price: 150 },
  flame_mail: { id: 'flame_mail', name: 'Flame Mail', icon: '🧯', slot: 'armor', tier: 2, stats: { def: 7, hp: 15 }, resist: { fire: 0.5 }, price: 150 },
  frost_cloak: { id: 'frost_cloak', name: 'Frost Cloak', icon: '🧥', slot: 'armor', tier: 2, stats: { res: 7, mp: 8 }, resist: { ice: 0.5 }, price: 150 },
  storm_coat: { id: 'storm_coat', name: 'Storm Coat', icon: '🥼', slot: 'armor', tier: 2, stats: { def: 5, res: 5 }, resist: { thunder: 0.5 }, price: 150 },
  mythril_mail: { id: 'mythril_mail', name: 'Mythril Mail', icon: '🛡️', slot: 'armor', tier: 3, stats: { def: 16, hp: 60 }, price: 300 },
  holy_robe: { id: 'holy_robe', name: 'Holy Robe', icon: '🥻', slot: 'armor', tier: 3, stats: { res: 14, mp: 15, hp: 20 }, resist: { holy: 0.5, dark: 0.5 }, price: 300 },
  dragon_mail: { id: 'dragon_mail', name: 'Dragon Mail', icon: '🐲', slot: 'armor', tier: 3, stats: { def: 12, res: 8, hp: 30 }, resist: { fire: 0.6, ice: 0.6, thunder: 0.6 }, price: 340 },
  power_ring: { id: 'power_ring', name: 'Power Ring', icon: '💍', slot: 'acc', tier: 1, stats: { atk: 5 }, price: 70 },
  swift_boots: { id: 'swift_boots', name: 'Swift Boots', icon: '👢', slot: 'acc', tier: 1, stats: { spd: 3 }, price: 80 },
  amulet: { id: 'amulet', name: 'Antidote Amulet', icon: '🧿', slot: 'acc', tier: 1, stats: { res: 2 }, immune: ['poison'], price: 60 },
  angel_charm: { id: 'angel_charm', name: 'Angel Charm', icon: '🪽', slot: 'acc', tier: 1, stats: { hp: 35 }, price: 70 },
  mage_earring: { id: 'mage_earring', name: 'Mage Earring', icon: '🌙', slot: 'acc', tier: 2, stats: { mag: 7 }, price: 150 },
  hourglass: { id: 'hourglass', name: 'Hourglass', icon: '⏳', slot: 'acc', tier: 2, stats: { spd: 1 }, perk: 'quick', price: 140 },
  star_pendant: { id: 'star_pendant', name: 'Star Pendant', icon: '⭐', slot: 'acc', tier: 2, stats: { res: 6 }, immune: ['sleep'], price: 130 },
  guard_bangle: { id: 'guard_bangle', name: 'Guard Bangle', icon: '🔰', slot: 'acc', tier: 2, stats: { def: 6, hp: 25 }, price: 140 },
  ribbon: { id: 'ribbon', name: 'Ribbon', icon: '🎀', slot: 'acc', tier: 3, stats: { res: 4 }, immune: ['poison', 'sleep', 'slow'], price: 280 },
  sprint_shoes: { id: 'sprint_shoes', name: 'Sprint Shoes', icon: '👟', slot: 'acc', tier: 3, stats: { spd: 6 }, price: 300 },
  dragon_fang: { id: 'dragon_fang', name: 'Dragon Fang', icon: '🦷', slot: 'acc', tier: 3, stats: { atk: 8, mag: 8 }, price: 320 },
  lucky_charm: { id: 'lucky_charm', name: 'Lucky Charm', icon: '🍀', slot: 'acc', tier: 1, stats: { res: 3 }, perk: 'gold', price: 0, meta: true },
};
export const GEAR_IDS = Object.keys(GEAR);

export function gearText(g: GearDef): string {
  const parts = STAT_KEYS.filter((k) => g.stats[k]).map((k) => `${STAT_NAME[k]} ${g.stats[k]! > 0 ? '+' : ''}${g.stats[k]}`);
  if (g.elem) parts.push(`${ELEM_ICON[g.elem]} attacks`);
  for (const e of ELEMS) if (g.resist?.[e] !== undefined) parts.push(`${ELEM_ICON[e]} resist`);
  if (g.immune?.length) parts.push(`no ${g.immune.map((s) => STATUS[s].name.toLowerCase()).join('/')}`);
  if (g.perk === 'quick') parts.push('time bar starts half full');
  if (g.perk === 'gold') parts.push('+25% gold');
  if (g.perk === 'ranged') parts.push('no row penalty');
  return parts.join(' · ');
}

// ---------- Enemies ----------

export type Cond = 'half' | 'low' | 'first' | 'nth2' | 'nth3' | 'allyLow' | 'noHaste' | 'alone' | 'heroHaste';

export interface AiRule {
  if?: Cond;
  do: string;
  chance?: number;
  once?: boolean;
}

export interface Counter {
  on: 'phys' | 'mag' | 'any' | Elem;
  do: string;
  chance: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  def: number;
  mag: number;
  res: number;
  spd: number;
  xp: number;
  gold: number;
  row: Row;
  /** Element multipliers: 2 weak, 0.5 resist, 0 immune, −1 absorb. */
  elem?: Partial<Record<Elem, number>>;
  immune?: StatusId[];
  rules?: AiRule[];
  cycle?: string[];
  /** Pattern below 50% HP. */
  cycle2?: string[];
  counters?: Counter[];
  drop?: [string, number];
  steal?: string;
  rank?: 'elite' | 'boss';
  text: string;
}

const mv = (a: Omit<ActionDef, 'text'> & { text?: string }): ActionDef => ({ text: '', ...a });

export const MOVES: Record<string, ActionDef> = {
  attack: mv({ id: 'attack', name: 'Attack', icon: '⚔️', kind: 'phys', target: 'enemy', power: 1 }),
  leech: mv({ id: 'leech', name: 'Leech', icon: '🩸', kind: 'phys', target: 'enemy', power: 0.9, drain: true }),
  frenzy: mv({ id: 'frenzy', name: 'Frenzy', icon: '😤', kind: 'status', target: 'self', status: 'haste', chance: 1 }),
  spore: mv({ id: 'spore', name: 'Sleep Spore', icon: '💤', kind: 'status', target: 'enemy', status: 'sleep', chance: 0.5 }),
  toxic: mv({ id: 'toxic', name: 'Toxic Puff', icon: '🤢', kind: 'mag', target: 'enemy', power: 0.5, status: 'poison', chance: 0.7 }),
  bite: mv({ id: 'bite', name: 'Plague Bite', icon: '🦷', kind: 'phys', target: 'enemy', power: 1, status: 'poison', chance: 0.45 }),
  ember: mv({ id: 'ember', name: 'Ember', icon: '🔥', kind: 'mag', target: 'enemy', power: 1, elem: 'fire' }),
  club: mv({ id: 'club', name: 'Club Swing', icon: '🏏', kind: 'phys', target: 'enemy', power: 1.2 }),
  smash: mv({ id: 'smash', name: 'Smash', icon: '💥', kind: 'phys', target: 'enemy', power: 1.8 }),
  roar: mv({ id: 'roar', name: 'Roar', icon: '📢', kind: 'status', target: 'enemies', status: 'slow', chance: 0.55 }),
  regen: mv({ id: 'regen', name: 'Regenerate', icon: '💚', kind: 'heal', target: 'self', pct: 0.22 }),
  stomp: mv({ id: 'stomp', name: 'Stomp', icon: '🦶', kind: 'phys', target: 'enemies', power: 0.7 }),
  frostbite: mv({ id: 'frostbite', name: 'Frostbite', icon: '🥶', kind: 'phys', target: 'enemy', power: 1.1, elem: 'ice' }),
  blizzard: mv({ id: 'blizzard', name: 'Blizzard', icon: '❄️', kind: 'mag', target: 'enemy', power: 1, elem: 'ice' }),
  bonecrush: mv({ id: 'bonecrush', name: 'Bonecrush', icon: '🦴', kind: 'phys', target: 'enemy', power: 1.5 }),
  avalanche: mv({ id: 'avalanche', name: 'Avalanche', icon: '🏔️', kind: 'phys', target: 'enemies', power: 0.75, elem: 'ice' }),
  curse: mv({ id: 'curse', name: 'Curse', icon: '🌑', kind: 'mag', target: 'enemy', power: 1, elem: 'dark' }),
  haunt: mv({ id: 'haunt', name: 'Haunt', icon: '💤', kind: 'status', target: 'enemy', status: 'sleep', chance: 0.45 }),
  prism: mv({ id: 'prism', name: 'Prism Beam', icon: '🔆', kind: 'mag', target: 'enemy', power: 1.2 }),
  quake: mv({ id: 'quake', name: 'Quake', icon: '🌋', kind: 'phys', target: 'enemies', power: 0.85 }),
  claw: mv({ id: 'claw', name: 'Claw', icon: '🐾', kind: 'phys', target: 'enemy', power: 1.25 }),
  frost_breath: mv({ id: 'frost_breath', name: 'Frost Breath', icon: '🌬️', kind: 'mag', target: 'enemies', power: 0.85, elem: 'ice' }),
  tail: mv({ id: 'tail', name: 'Tail Sweep', icon: '🌀', kind: 'phys', target: 'enemies', power: 0.7 }),
  glacier: mv({ id: 'glacier', name: 'Glacier', icon: '🧊', kind: 'mag', target: 'enemies', power: 1.1, elem: 'ice', status: 'slow', chance: 0.4 }),
  icewall: mv({ id: 'icewall', name: 'Ice Wall', icon: '🔰', kind: 'status', target: 'self', status: 'protect', chance: 1 }),
  gust: mv({ id: 'gust', name: 'Gust', icon: '🌪️', kind: 'phys', target: 'enemies', power: 0.6 }),
  bolt: mv({ id: 'bolt', name: 'Bolt', icon: '⚡', kind: 'mag', target: 'enemy', power: 1.1, elem: 'thunder' }),
  static: mv({ id: 'static', name: 'Static', icon: '🌩️', kind: 'mag', target: 'enemies', power: 0.6, elem: 'thunder' }),
  sting: mv({ id: 'sting', name: 'Sting', icon: '🦂', kind: 'phys', target: 'enemy', power: 1, status: 'poison', chance: 0.6 }),
  frost: mv({ id: 'frost', name: 'Frost Wave', icon: '🌊', kind: 'mag', target: 'enemy', power: 1.1, elem: 'ice' }),
  hiss: mv({ id: 'hiss', name: 'Hiss', icon: '🐍', kind: 'status', target: 'enemy', status: 'slow', chance: 0.65 }),
  mend: mv({ id: 'mend', name: 'Mend', icon: '💚', kind: 'heal', target: 'ally', pct: 0.25 }),
  shadow: mv({ id: 'shadow', name: 'Shadow Storm', icon: '🌑', kind: 'mag', target: 'enemies', power: 0.75, elem: 'dark' }),
  pact: mv({ id: 'pact', name: 'Dark Pact', icon: '😈', kind: 'status', target: 'self', status: 'haste', chance: 1 }),
  drain: mv({ id: 'drain', name: 'Drain', icon: '🩸', kind: 'mag', target: 'enemy', power: 1, elem: 'dark', drain: true }),
  flame_breath: mv({ id: 'flame_breath', name: 'Flame Breath', icon: '🔥', kind: 'mag', target: 'enemies', power: 0.75, elem: 'fire' }),
  ice_breath: mv({ id: 'ice_breath', name: 'Ice Breath', icon: '❄️', kind: 'mag', target: 'enemies', power: 0.75, elem: 'ice' }),
  volt_breath: mv({ id: 'volt_breath', name: 'Volt Breath', icon: '⚡', kind: 'mag', target: 'enemies', power: 0.75, elem: 'thunder' }),
  maul: mv({ id: 'maul', name: 'Maul', icon: '🦁', kind: 'phys', target: 'enemy', power: 1.5 }),
  timebolt: mv({ id: 'timebolt', name: 'Time Bolt', icon: '🕐', kind: 'mag', target: 'enemy', power: 1.3 }),
  slowga: mv({ id: 'slowga', name: 'Slowga', icon: '🐌', kind: 'status', target: 'enemies', status: 'slow', chance: 0.7 }),
  tempest: mv({ id: 'tempest', name: 'Tempest', icon: '🌈', kind: 'mag', target: 'enemies', power: 0.65, elem: 'rand' }),
  timecrush: mv({ id: 'timecrush', name: 'Time Crush', icon: '⌛', kind: 'mag', target: 'enemies', power: 0.5, atb: -100 }),
  quicken: mv({ id: 'quicken', name: 'Quicken', icon: '⏩', kind: 'status', target: 'self', status: 'haste', chance: 1 }),
  gears: mv({ id: 'gears', name: 'Call Gears', icon: '⚙️', kind: 'summon', target: 'self', summon: ['gear', 'gear'] }),
  windup: mv({ id: 'windup', name: 'Wind Up', icon: '🔧', kind: 'status', target: 'ally', status: 'haste', chance: 1 }),
  saplings: mv({ id: 'saplings', name: 'Call Imps', icon: '👺', kind: 'summon', target: 'self', summon: ['goblin'] }),
};

export const ENEMIES: Record<string, EnemyDef> = {
  // Zone 1: Mossy Halls
  jelly: { id: 'jelly', name: 'Green Jelly', icon: '🦠', hp: 42, atk: 13, def: 3, mag: 6, res: 6, spd: 7, xp: 7, gold: 8, row: 'front', elem: { fire: 2, ice: 0.5 }, drop: ['potion', 0.2], steal: 'potion', text: 'Soft and slow. Weak to fire.' },
  bat: { id: 'bat', name: 'Cave Bat', icon: '🦇', hp: 30, atk: 12, def: 2, mag: 4, res: 4, spd: 16, xp: 6, gold: 6, row: 'back', elem: { thunder: 2 }, rules: [{ do: 'leech', chance: 0.35 }], steal: 'remedy', text: 'Fast. Drains HP. Weak to thunder.' },
  goblin: { id: 'goblin', name: 'Goblin', icon: '👺', hp: 52, atk: 15, def: 5, mag: 4, res: 4, spd: 10, xp: 8, gold: 12, row: 'front', rules: [{ if: 'half', do: 'frenzy', once: true }], steal: 'potion', drop: ['potion', 0.15], text: 'Gets hasted when hurt.' },
  shroom: { id: 'shroom', name: 'Spore Cap', icon: '🍄', hp: 46, atk: 10, def: 4, mag: 12, res: 8, spd: 8, xp: 8, gold: 10, row: 'back', elem: { fire: 2 }, cycle: ['spore', 'attack', 'toxic'], steal: 'remedy', drop: ['remedy', 0.25], text: 'Puts heroes to sleep and poisons them.' },
  rat: { id: 'rat', name: 'Plague Rat', icon: '🐀', hp: 32, atk: 13, def: 3, mag: 4, res: 4, spd: 14, xp: 6, gold: 7, row: 'front', rules: [{ do: 'bite', chance: 0.35 }], steal: 'remedy', text: 'Its bite poisons.' },
  wisp: { id: 'wisp', name: 'Ember Wisp', icon: '🕯️', hp: 38, atk: 8, def: 6, mag: 15, res: 14, spd: 11, xp: 9, gold: 11, row: 'back', elem: { fire: -1, ice: 2 }, cycle: ['ember', 'attack'], steal: 'firebomb', text: 'Casts fire. Absorbs fire, weak to ice.' },
  ogre: { id: 'ogre', name: 'Ogre', icon: '👹', hp: 210, atk: 21, def: 8, mag: 4, res: 5, spd: 7, xp: 32, gold: 45, row: 'front', rank: 'elite', rules: [{ if: 'nth3', do: 'smash' }], counters: [{ on: 'phys', do: 'club', chance: 0.35 }], steal: 'hipotion', text: 'Counters physical hits. Smashes every third turn.' },
  troll: { id: 'troll', name: 'Troll King', icon: '🧌', hp: 480, atk: 22, def: 10, mag: 8, res: 8, spd: 9, xp: 90, gold: 120, row: 'front', rank: 'boss', elem: { fire: 2 }, immune: ['sleep'], rules: [{ if: 'low', do: 'regen', once: true }, { if: 'half', do: 'saplings', once: true }], cycle: ['attack', 'smash', 'roar', 'stomp'], counters: [{ on: 'fire', do: 'frenzy', chance: 0.4 }], steal: 'ether', text: 'Boss of floor 5. Calls goblins at half HP and regenerates once. Fire makes it angry.' },
  // Zone 2: Frost Galleries
  wolf: { id: 'wolf', name: 'Ice Wolf', icon: '🐺', hp: 95, atk: 25, def: 8, mag: 6, res: 8, spd: 17, xp: 18, gold: 18, row: 'front', elem: { fire: 2, ice: 0.5 }, rules: [{ do: 'frostbite', chance: 0.3 }], steal: 'potion', text: 'Fast pack hunter. Weak to fire.' },
  imp: { id: 'imp', name: 'Frost Imp', icon: '😈', hp: 80, atk: 12, def: 8, mag: 25, res: 16, spd: 13, xp: 20, gold: 22, row: 'back', elem: { fire: 2, ice: -1 }, cycle: ['blizzard', 'blizzard', 'attack'], counters: [{ on: 'fire', do: 'blizzard', chance: 0.4 }], steal: 'icegem', drop: ['ether', 0.12], text: 'Casts Blizzard. Answers fire with ice.' },
  skeleton: { id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 115, atk: 27, def: 14, mag: 4, res: 6, spd: 10, xp: 20, gold: 18, row: 'front', elem: { holy: 2, fire: 1.5, dark: 0 }, immune: ['poison', 'sleep'], rules: [{ do: 'bonecrush', chance: 0.25 }], counters: [{ on: 'phys', do: 'attack', chance: 0.2 }], steal: 'phoenix_down', text: 'Undead. Weak to holy and fire.' },
  yeti: { id: 'yeti', name: 'Yeti', icon: '🦍', hp: 165, atk: 30, def: 10, mag: 6, res: 8, spd: 8, xp: 26, gold: 24, row: 'front', elem: { fire: 2, ice: 0.5 }, rules: [{ if: 'nth3', do: 'avalanche' }], steal: 'hipotion', text: 'Big and slow. Avalanche every third turn.' },
  ghost: { id: 'ghost', name: 'Wraith', icon: '👻', hp: 85, atk: 10, def: 34, mag: 24, res: 18, spd: 12, xp: 22, gold: 20, row: 'back', elem: { holy: 2, dark: 0 }, immune: ['poison', 'sleep'], rules: [{ do: 'haunt', chance: 0.3 }], cycle: ['curse'], steal: 'ether', text: 'Hard to hit with weapons. Use magic or holy.' },
  golem: { id: 'golem', name: 'Crystal Golem', icon: '🗿', hp: 420, atk: 32, def: 26, mag: 26, res: 10, spd: 6, xp: 70, gold: 80, row: 'front', rank: 'elite', elem: { thunder: 2 }, immune: ['poison', 'sleep'], cycle: ['attack', 'attack', 'quake'], counters: [{ on: 'mag', do: 'prism', chance: 0.5 }], steal: 'elixir', text: 'Very hard skin. Counters spells with a beam. Weak to thunder.' },
  dragon: { id: 'dragon', name: 'Rime Dragon', icon: '🐉', hp: 1050, atk: 33, def: 16, mag: 30, res: 18, spd: 11, xp: 220, gold: 220, row: 'front', rank: 'boss', elem: { fire: 2, ice: -1 }, immune: ['sleep'], cycle: ['claw', 'frost_breath', 'claw', 'tail'], cycle2: ['frost_breath', 'claw', 'glacier', 'claw'], counters: [{ on: 'fire', do: 'icewall', chance: 0.5 }], steal: 'elixir', text: 'Boss of floor 10. Absorbs ice. Gets fierce below half HP. Fire makes it raise an ice wall.' },
  // Zone 3: Storm Spire
  harpy: { id: 'harpy', name: 'Harpy', icon: '🦅', hp: 160, atk: 38, def: 14, mag: 10, res: 14, spd: 20, xp: 40, gold: 30, row: 'back', elem: { thunder: 2 }, rules: [{ do: 'gust', chance: 0.3 }], steal: 'tonic', text: 'Very fast. Gusts hit the whole party.' },
  stormling: { id: 'stormling', name: 'Stormling', icon: '🌩️', hp: 150, atk: 14, def: 14, mag: 40, res: 26, spd: 15, xp: 42, gold: 32, row: 'back', elem: { thunder: -1, ice: 2 }, cycle: ['bolt', 'bolt', 'static'], counters: [{ on: 'mag', do: 'static', chance: 0.3 }], steal: 'voltjar', text: 'Casts thunder. Absorbs thunder, weak to ice.' },
  scorpion: { id: 'scorpion', name: 'Iron Scorpion', icon: '🦂', hp: 215, atk: 40, def: 26, mag: 8, res: 12, spd: 12, xp: 46, gold: 34, row: 'front', elem: { ice: 2 }, immune: ['poison'], rules: [{ do: 'sting', chance: 0.4 }], counters: [{ on: 'phys', do: 'sting', chance: 0.3 }], steal: 'remedy', text: 'Armored. Counters weapon hits with poison.' },
  naga: { id: 'naga', name: 'Naga', icon: '🐍', hp: 185, atk: 34, def: 16, mag: 36, res: 20, spd: 13, xp: 44, gold: 36, row: 'front', elem: { thunder: 2, ice: 0.5 }, rules: [{ if: 'allyLow', do: 'mend', chance: 0.6 }], cycle: ['attack', 'frost', 'hiss'], steal: 'ether', text: 'Heals hurt allies. Slows heroes.' },
  demon: { id: 'demon', name: 'Demon', icon: '👿', hp: 230, atk: 42, def: 18, mag: 38, res: 22, spd: 14, xp: 52, gold: 44, row: 'front', elem: { holy: 2, dark: -1 }, rules: [{ if: 'low', do: 'pact', once: true }, { if: 'nth3', do: 'shadow' }], steal: 'hipotion', text: 'Shadow Storm every third turn. Weak to holy.' },
  vampire: { id: 'vampire', name: 'Vampire', icon: '🧛', hp: 200, atk: 40, def: 16, mag: 36, res: 22, spd: 16, xp: 50, gold: 46, row: 'back', elem: { holy: 2, fire: 1.5, dark: 0 }, immune: ['poison'], rules: [{ do: 'drain', chance: 0.45 }], steal: 'phoenix_down', text: 'Drains HP. Weak to holy and fire.' },
  chimera: { id: 'chimera', name: 'Chimera', icon: '🦁', hp: 760, atk: 46, def: 22, mag: 42, res: 22, spd: 13, xp: 130, gold: 140, row: 'front', rank: 'elite', elem: { fire: 0.5, ice: 0.5, thunder: 0.5, holy: 1.5 }, immune: ['sleep'], cycle: ['flame_breath', 'maul', 'ice_breath', 'maul', 'volt_breath', 'maul'], steal: 'elixir', text: 'Three heads, three breaths. Resists fire, ice and thunder.' },
  gear: { id: 'gear', name: 'Clockgear', icon: '⚙️', hp: 110, atk: 28, def: 30, mag: 10, res: 12, spd: 18, xp: 20, gold: 10, row: 'back', elem: { thunder: 2 }, immune: ['poison', 'sleep'], rules: [{ if: 'nth2', do: 'windup' }], text: 'Hastes its master. Weak to thunder.' },
  chrono: { id: 'chrono', name: 'The Chronomancer', icon: '🕰️', hp: 1600, atk: 38, def: 22, mag: 37, res: 28, spd: 14, xp: 0, gold: 0, row: 'front', rank: 'boss', elem: { dark: 0.5, holy: 1.25 }, immune: ['sleep', 'poison'], rules: [{ if: 'half', do: 'gears', once: true }, { if: 'noHaste', do: 'quicken', chance: 0.35 }], cycle: ['timebolt', 'tempest', 'slowga', 'timebolt'], cycle2: ['timecrush', 'timebolt', 'tempest', 'timebolt', 'slowga'], counters: [{ on: 'any', do: 'timebolt', chance: 0.12 }], text: 'Master of the tower. Bends time: slows heroes and empties their time bars.' },
};

export interface Zone {
  name: string;
  icon: string;
  floors: [number, number];
  pool: [string, number][];
  elite: string;
  boss: string;
  bg: string;
}

export const ZONES: Zone[] = [
  { name: 'Mossy Halls', icon: '🌿', floors: [1, 5], pool: [['jelly', 3], ['bat', 3], ['goblin', 3], ['shroom', 2], ['rat', 2], ['wisp', 2]], elite: 'ogre', boss: 'troll', bg: 'moss' },
  { name: 'Frost Galleries', icon: '❄️', floors: [6, 10], pool: [['wolf', 3], ['imp', 3], ['skeleton', 3], ['yeti', 2], ['ghost', 2]], elite: 'golem', boss: 'dragon', bg: 'frost' },
  { name: 'Storm Spire', icon: '⚡', floors: [11, 15], pool: [['harpy', 3], ['stormling', 3], ['scorpion', 2], ['naga', 2], ['demon', 2], ['vampire', 2]], elite: 'chimera', boss: 'chrono', bg: 'storm' },
];
export const TOP_FLOOR = 15;
export const zoneOf = (floor: number): Zone => ZONES[Math.min(2, Math.floor((Math.max(1, floor) - 1) / 5))];
export const isBossFloor = (floor: number): boolean => floor % 5 === 0;

// ---------- Rooms ----------

export type RoomKind = 'battle' | 'elite' | 'inn' | 'shop' | 'event' | 'treasure' | 'boss';
export const ROOMS: Record<RoomKind, { name: string; icon: string; text: string }> = {
  battle: { name: 'Battle', icon: '⚔️', text: 'A group of monsters. Gold and XP.' },
  elite: { name: 'Elite', icon: '💀', text: 'A strong foe. Gear as a reward.' },
  inn: { name: 'Inn', icon: '🛏️', text: 'Rest and recruit heroes.' },
  shop: { name: 'Shop', icon: '🛒', text: 'Buy items and gear.' },
  event: { name: 'Event', icon: '❓', text: 'Something strange happens.' },
  treasure: { name: 'Treasure', icon: '🎁', text: 'Pick a piece of gear.' },
  boss: { name: 'Floor Boss', icon: '👑', text: 'The guardian of this floor.' },
};

// ---------- Guild (meta unlocks) ----------

export interface UnlockDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  text: string;
}

export const UNLOCKS: UnlockDef[] = [
  { id: 'bard', name: 'Bard class', icon: '🧚', cost: 50, text: 'Songs: haste, sleep, slow, Encore.' },
  { id: 'summoner', name: 'Summoner class', icon: '🧞', cost: 70, text: 'Summons that hit all enemies.' },
  { id: 'stock', name: 'Supply crate', icon: '📦', cost: 25, text: 'Start with 2 more Potions and a Phoenix Down.' },
  { id: 'purse', name: 'Fat purse', icon: '👛', cost: 30, text: 'Start with 80 more gold.' },
  { id: 'charm', name: 'Lucky Charm', icon: '🍀', cost: 35, text: 'Start with the Lucky Charm (+25% gold).' },
  { id: 'veteran', name: 'Veterans', icon: '🎖️', cost: 60, text: 'Starting heroes begin at level 2.' },
  { id: 'trio', name: 'Third hero', icon: '👥', cost: 90, text: 'Start the run with 3 heroes.' },
];

// ---------- Events ----------

export interface EventDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  options: { label: string; need?: 'gold50' | 'gold100' | 'gold120' | 'potion' | 'thief' | 'room' }[];
}

export const EVENTS: EventDef[] = [
  { id: 'fountain', name: 'Time Fountain', icon: '⛲', text: 'Water flows upward here. It sparkles with old magic.', options: [{ label: 'Drink: heal 50% HP and 30% MP' }, { label: 'Bathe: the party starts the next battle with Haste' }] },
  { id: 'merchant', name: 'Lost Merchant', icon: '🧳', text: 'A merchant lost on the stairs offers a deal.', options: [{ label: 'Buy a mystery box (50 gold)', need: 'gold50' }, { label: 'Trade a Potion for a Phoenix Down', need: 'potion' }, { label: 'Walk on' }] },
  { id: 'shrine', name: 'Old Shrine', icon: '⛩️', text: 'A dusty shrine to the god of hours.', options: [{ label: 'Pray (60% blessing, 40% curse)' }, { label: 'Leave an offering (50 gold): all heroes gain XP', need: 'gold50' }, { label: 'Walk on' }] },
  { id: 'chest', name: 'Trapped Chest', icon: '🧰', text: 'A chest with a wire at the lock.', options: [{ label: 'Open it (60% gear, 40% trap)' }, { label: 'Let the thief disarm it', need: 'thief' }, { label: 'Walk on' }] },
  { id: 'adventurer', name: 'Lost Adventurer', icon: '🧭', text: 'A hurt adventurer sits on the stairs.', options: [{ label: 'Invite them to the party', need: 'room' }, { label: 'Give a Potion: they pay 80 gold', need: 'potion' }, { label: 'Walk on' }] },
  { id: 'library', name: 'Clock Library', icon: '📚', text: 'Shelves of books on time magic.', options: [{ label: 'Study: all heroes gain XP' }, { label: 'Read the forbidden tome (50% big XP, 50% lose HP)' }] },
  { id: 'dice', name: 'Gambling Den', icon: '🎲', text: 'Two skeletons play dice and wave you over.', options: [{ label: 'Bet 50 gold (50%: win 120)', need: 'gold50' }, { label: 'Bet 100 gold (45%: win 260)', need: 'gold100' }, { label: 'Walk on' }] },
  { id: 'clockmaker', name: 'Clockmaker', icon: '🔧', text: 'An old clockmaker works at a bench.', options: [{ label: 'Buy an Hourglass (120 gold)', need: 'gold120' }, { label: 'Ask for tea: all heroes refill MP' }] },
];
