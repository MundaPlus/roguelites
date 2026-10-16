/** Static game data: tiles, enemies, bosses, classes, skills, upgrades and gear. */

export type Kind = 'sword' | 'shield' | 'coin' | 'potion' | 'enemy';
/** Tiles chain when their groups match. Swords and enemies share the 'attack' group. */
export type Group = 'attack' | 'shield' | 'coin' | 'potion';

export const groupOf = (k: Kind): Group => (k === 'sword' || k === 'enemy' ? 'attack' : k);

export const TILE_ICON: Record<Exclude<Kind, 'enemy'>, string> = {
  sword: '⚔️',
  shield: '🛡️',
  coin: '🪙',
  potion: '🧪',
};

export const ROWS = 6;
export const COLS = 6;
export const GOAL_FLOOR = 20;
export const BOSS_EVERY = 5;

/** Hero stats. Class base + upgrades + gear add up to these. */
export interface Stats {
  maxHp: number;
  maxArmor: number;
  baseDmg: number;
  swordDmg: number;
  pierce: number;
  block: number;
  spikes: number;
  shieldRepair: number;
  potionHeal: number;
  coinValue: number;
  xpBonus: number;
  cdr: number;
}

export const STAT_LABEL: Record<keyof Stats, string> = {
  maxHp: 'Max HP',
  maxArmor: 'Max armor',
  baseDmg: 'Base damage',
  swordDmg: 'Damage per sword',
  pierce: 'Armor pierce',
  block: 'Block',
  spikes: 'Spikes',
  shieldRepair: 'Armor per shield',
  potionHeal: 'Heal per potion',
  coinValue: 'Coin value',
  xpBonus: 'XP per kill',
  cdr: 'Skill cooldown',
};

export const STAT_ICON: Record<keyof Stats, string> = {
  maxHp: '❤️',
  maxArmor: '🛡️',
  baseDmg: '✊',
  swordDmg: '⚔️',
  pierce: '📌',
  block: '🧱',
  spikes: '🌵',
  shieldRepair: '🔧',
  potionHeal: '🧪',
  coinValue: '🪙',
  xpBonus: '⭐',
  cdr: '⏱️',
};

export type Special = 'poison' | 'explode' | 'spawn' | 'regen' | 'ghost' | 'breath';

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  armor: number;
  xp: number;
  /** First floor where it appears, and its spawn weight. */
  from: number;
  to: number;
  w: number;
  special?: Special;
  /** Value of the special: poison per hit, regen per turn, turns between spawns or breaths, fuse length. */
  sv?: number;
  boss?: boolean;
  /** Poison added per hit. */
  poison?: number;
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  rat: { id: 'rat', name: 'Rat', icon: '🐀', hp: 3, atk: 1, armor: 0, xp: 1, from: 1, to: 9, w: 10, text: 'Weak, but they come in packs.' },
  bat: { id: 'bat', name: 'Bat', icon: '🦇', hp: 2, atk: 2, armor: 0, xp: 1, from: 1, to: 11, w: 8, text: 'Frail, bites hard.' },
  goblin: { id: 'goblin', name: 'Goblin', icon: '👺', hp: 5, atk: 2, armor: 0, xp: 2, from: 2, to: 14, w: 9, text: 'A plain fighter.' },
  spider: { id: 'spider', name: 'Spider', icon: '🕷️', hp: 4, atk: 1, armor: 0, xp: 2, from: 3, to: 16, w: 6, special: 'poison', poison: 2, text: 'Each bite poisons you for 2 more turns. Poison deals 1 damage per turn.' },
  skeleton: { id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 6, atk: 2, armor: 1, xp: 2, from: 4, to: 20, w: 8, text: 'Armor 1: each hit deals 1 less.' },
  bomber: { id: 'bomber', name: 'Bomb Imp', icon: '💣', hp: 4, atk: 0, armor: 0, xp: 2, from: 5, to: 20, w: 4, special: 'explode', sv: 4, text: 'Does not attack. Explodes when its fuse ends: big damage, armor does not help.' },
  ooze: { id: 'ooze', name: 'Ooze', icon: '🦠', hp: 7, atk: 1, armor: 0, xp: 2, from: 6, to: 20, w: 6, special: 'regen', sv: 2, text: 'Heals 2 HP each turn.' },
  ghost: { id: 'ghost', name: 'Ghost', icon: '👻', hp: 5, atk: 3, armor: 0, xp: 3, from: 8, to: 20, w: 5, special: 'ghost', text: 'Its attack passes through your armor.' },
  orc: { id: 'orc', name: 'Orc', icon: '👹', hp: 10, atk: 3, armor: 0, xp: 3, from: 9, to: 20, w: 7, text: 'Tough and strong.' },
  necro: { id: 'necro', name: 'Necromancer', icon: '🧙', hp: 7, atk: 2, armor: 0, xp: 4, from: 11, to: 20, w: 3, special: 'spawn', sv: 3, text: 'Every 3 turns it turns a tile into a Skeleton.' },
  knight: { id: 'knight', name: 'Dark Knight', icon: '🤺', hp: 11, atk: 4, armor: 2, xp: 4, from: 13, to: 20, w: 5, text: 'Armor 2.' },
  troll: { id: 'troll', name: 'Troll', icon: '🧌', hp: 16, atk: 4, armor: 0, xp: 5, from: 15, to: 20, w: 4, special: 'regen', sv: 3, text: 'Heals 3 HP each turn.' },
  // Bosses
  queen: { id: 'queen', name: 'Brood Queen', icon: '🦂', hp: 34, atk: 3, armor: 0, xp: 12, from: 5, to: 5, w: 0, special: 'spawn', sv: 3, poison: 3, boss: true, text: 'Boss. Each hit poisons you for 3 more turns, and calls a Spider every 3 turns.' },
  golem: { id: 'golem', name: 'Stone Golem', icon: '🗿', hp: 50, atk: 5, armor: 3, xp: 16, from: 10, to: 10, w: 0, boss: true, text: 'Boss. Armor 3: bring armor pierce or long chains.' },
  lich: { id: 'lich', name: 'Lich', icon: '🧟', hp: 60, atk: 5, armor: 1, xp: 20, from: 15, to: 15, w: 0, special: 'spawn', sv: 2, boss: true, text: 'Boss. Raises a Skeleton every 2 turns. Armor 1.' },
  dragon: { id: 'dragon', name: 'Ember Dragon', icon: '🐉', hp: 100, atk: 6, armor: 2, xp: 30, from: 20, to: 20, w: 0, special: 'breath', sv: 3, boss: true, text: 'Final boss. Every 3rd turn it breathes fire for triple damage through armor.' },
};

export const BOSS_AT: Record<number, string> = { 5: 'queen', 10: 'golem', 15: 'lich', 20: 'dragon' };

export interface SkillDef {
  id: string;
  name: string;
  icon: string;
  cd: number;
  text: string;
}

export const SKILLS: Record<string, SkillDef> = {
  whirl: { id: 'whirl', name: 'Whirlwind', icon: '🌪️', cd: 9, text: 'Hit every enemy for base damage + 2 swords.' },
  fortify: { id: 'fortify', name: 'Fortify', icon: '🧱', cd: 10, text: 'Fill your armor to max.' },
  edge: { id: 'edge', name: 'Coin Edge', icon: '🗡️', cd: 8, text: 'Turn every coin on the board into a sword.' },
  shuffle: { id: 'shuffle', name: 'Shuffle', icon: '🔀', cd: 6, text: 'Mix all tiles on the board.' },
  heal: { id: 'heal', name: 'Prayer', icon: '✨', cd: 11, text: 'Heal 40% of max HP and cure poison.' },
  transmute: { id: 'transmute', name: 'Transmute', icon: '⚗️', cd: 8, text: 'Turn every shield on the board into a potion.' },
  fireball: { id: 'fireball', name: 'Fireball', icon: '🔥', cd: 7, text: 'Hit the toughest enemy for 6 + 2 per floor. Ignores armor.' },
  freeze: { id: 'freeze', name: 'Frost Nova', icon: '❄️', cd: 10, text: 'Enemies do not attack for the next turn. Fuses stop too.' },
};

export interface ClassDef {
  id: string;
  name: string;
  icon: string;
  skills: [string, string];
  base: Partial<Stats>;
  cost: number;
  text: string;
}

export const BASE_STATS: Stats = {
  maxHp: 50,
  maxArmor: 4,
  baseDmg: 1,
  swordDmg: 1,
  pierce: 0,
  block: 0,
  spikes: 0,
  shieldRepair: 1,
  potionHeal: 2,
  coinValue: 1,
  xpBonus: 0,
  cdr: 0,
};

export const CLASSES: Record<string, ClassDef> = {
  warrior: { id: 'warrior', name: 'Warrior', icon: '🪓', skills: ['whirl', 'fortify'], base: { maxArmor: 6, baseDmg: 2 }, cost: 0, text: 'Solid armor and hits. Whirlwind and Fortify.' },
  rogue: { id: 'rogue', name: 'Rogue', icon: '🗡️', skills: ['edge', 'shuffle'], base: { maxHp: 45, coinValue: 2, pierce: 1 }, cost: 25, text: 'Double coins, armor pierce 1. Coin Edge and Shuffle.' },
  cleric: { id: 'cleric', name: 'Cleric', icon: '⛪', skills: ['heal', 'transmute'], base: { maxHp: 60, potionHeal: 3, maxArmor: 5 }, cost: 40, text: 'More HP and better potions. Prayer and Transmute.' },
  mage: { id: 'mage', name: 'Mage', icon: '🔮', skills: ['fireball', 'freeze'], base: { maxHp: 40, swordDmg: 2, maxArmor: 3 }, cost: 60, text: 'Frail, but each sword hits for 2. Fireball and Frost Nova.' },
};

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  add?: Partial<Stats>;
  /** Special effect handled in game.ts. */
  fx?: 'heal' | 'armor';
  max?: number;
}

/** Level-up choices (from the XP bar). */
export const LEVEL_UPS: UpgradeDef[] = [
  { id: 'vital', name: 'Vitality', icon: '❤️', text: '+8 max HP, heal 8', add: { maxHp: 8 }, fx: 'heal' },
  { id: 'sharp', name: 'Sharpen', icon: '⚔️', text: '+1 damage per sword', add: { swordDmg: 1 } },
  { id: 'might', name: 'Might', icon: '✊', text: '+2 base damage', add: { baseDmg: 2 } },
  { id: 'medic', name: 'Herbalist', icon: '🧪', text: '+1 heal per potion', add: { potionHeal: 1 } },
  { id: 'greed', name: 'Greed', icon: '🪙', text: '+1 coin per coin tile', add: { coinValue: 1 }, max: 3 },
  { id: 'focus', name: 'Focus', icon: '⏱️', text: 'Skill cooldowns −1', add: { cdr: 1 }, max: 3 },
  { id: 'scholar', name: 'Scholar', icon: '⭐', text: '+1 XP per kill', add: { xpBonus: 1 }, max: 3 },
  { id: 'pierce', name: 'Piercing', icon: '📌', text: '+1 armor pierce', add: { pierce: 1 }, max: 3 },
  { id: 'second', name: 'Second Wind', icon: '💖', text: 'Heal to full and cure poison', fx: 'heal' },
];

/** Forge choices (from the shield bar). */
export const FORGE_UPS: UpgradeDef[] = [
  { id: 'plate', name: 'Thick Plate', icon: '🛡️', text: '+2 max armor, fill armor', add: { maxArmor: 2 }, fx: 'armor' },
  { id: 'mason', name: 'Mason', icon: '🔧', text: '+1 armor per shield', add: { shieldRepair: 1 }, max: 3 },
  { id: 'block', name: 'Bulwark', icon: '🧱', text: '+1 block (each hit deals 1 less)', add: { block: 1 }, max: 3 },
  { id: 'spike', name: 'Spikes', icon: '🌵', text: '+2 spikes (attackers take damage)', add: { spikes: 2 } },
  { id: 'hearty', name: 'Hearty', icon: '❤️', text: '+5 max HP', add: { maxHp: 5 }, fx: 'heal' },
];

export type Slot = 'weapon' | 'armor' | 'shield' | 'helmet';
export const SLOTS: Slot[] = ['weapon', 'armor', 'shield', 'helmet'];
export const SLOT_ICON: Record<Slot, string> = { weapon: '🗡️', armor: '🥋', shield: '🛡️', helmet: '⛑️' };

/** Gear templates. Each roll scales the stats by tier (1–4). */
export interface GearDef {
  slot: Slot;
  name: string;
  icon: string;
  /** Stats at tier 1. Each tier adds the same again. */
  per: Partial<Stats>;
}

export const GEAR: GearDef[] = [
  { slot: 'weapon', name: 'Shortsword', icon: '🗡️', per: { swordDmg: 1 } },
  { slot: 'weapon', name: 'War Club', icon: '🏏', per: { baseDmg: 2 } },
  { slot: 'weapon', name: 'Spear', icon: '🔱', per: { baseDmg: 1, pierce: 1 } },
  { slot: 'weapon', name: 'Axe', icon: '🪓', per: { swordDmg: 1, baseDmg: 1 } },
  { slot: 'armor', name: 'Chain Mail', icon: '🥋', per: { maxArmor: 3 } },
  { slot: 'armor', name: 'Spiked Vest', icon: '🦔', per: { maxArmor: 1, spikes: 2 } },
  { slot: 'armor', name: 'Robe', icon: '👘', per: { maxHp: 6, potionHeal: 1 } },
  { slot: 'shield', name: 'Buckler', icon: '🛡️', per: { block: 1 } },
  { slot: 'shield', name: 'Tower Shield', icon: '🚪', per: { maxArmor: 2, shieldRepair: 1 } },
  { slot: 'helmet', name: 'Helm', icon: '⛑️', per: { maxArmor: 2 } },
  { slot: 'helmet', name: 'Lucky Hat', icon: '🎩', per: { coinValue: 1 } },
  { slot: 'helmet', name: 'Circlet', icon: '👑', per: { xpBonus: 1, maxHp: 3 } },
];

export const TIER_NAME = ['', 'Iron', 'Steel', 'Mithril', 'Dragon'];
