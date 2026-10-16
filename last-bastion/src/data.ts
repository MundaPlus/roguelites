/** Static game content: towers, upgrades, enemies, bosses, cards and relics. */

export type TowerId = 'ballista' | 'mortar' | 'frost' | 'tesla' | 'flame';
export type Target = 'first' | 'last' | 'strong' | 'close';

export const TARGETS: readonly Target[] = ['first', 'last', 'strong', 'close'];
export const TARGET_NAME: Record<Target, string> = { first: 'First', last: 'Last', strong: 'Strong', close: 'Close' };

/** Changes that an upgrade node makes. `dmg` and `rate` multiply, the others add. */
export interface Mods {
  dmg?: number;
  rate?: number;
  range?: number;
  splash?: number;
  chain?: number;
  slow?: number;
  slowDur?: number;
  burn?: number;
  pierce?: boolean;
  multi?: number;
  stun?: number;
  brittle?: number;
  aura?: boolean;
  cone?: number;
  shells?: number;
}

export interface UpNode {
  name: string;
  text: string;
  mods: Mods;
}

export interface Branch {
  name: string;
  nodes: [UpNode, UpNode, UpNode];
}

export interface TowerDef {
  id: TowerId;
  name: string;
  icon: string;
  color: string;
  cost: number;
  dmg: number;
  rate: number;
  range: number;
  minRange: number;
  splash: number;
  chain: number;
  slow: number;
  slowDur: number;
  burn: number;
  cone: number;
  air: boolean;
  text: string;
  branches: [Branch, Branch];
}

const base = { minRange: 0, splash: 0, chain: 0, slow: 0, slowDur: 0, burn: 0, cone: 0, air: true };

export const TOWERS: Record<TowerId, TowerDef> = {
  ballista: {
    ...base,
    id: 'ballista',
    name: 'Ballista',
    icon: '🏹',
    color: '#e9c46a',
    cost: 50,
    dmg: 14,
    rate: 1,
    range: 3,
    text: 'Single target. Hits flyers.',
    branches: [
      {
        name: 'Sniper',
        nodes: [
          { name: 'Long bolts', text: '+35% damage, +1 range', mods: { dmg: 1.35, range: 1 } },
          { name: 'Heavy bolts', text: '+40% damage, +0.5 range', mods: { dmg: 1.4, range: 0.5 } },
          { name: 'Armor breaker', text: '+30% damage, ignores armor', mods: { dmg: 1.3, pierce: true } },
        ],
      },
      {
        name: 'Repeater',
        nodes: [
          { name: 'Quick crank', text: '+50% fire rate', mods: { rate: 1.5 } },
          { name: 'Spring loader', text: '+40% fire rate, +10% damage', mods: { rate: 1.4, dmg: 1.1 } },
          { name: 'Twin bolts', text: 'Shoots 2 targets, +20% fire rate', mods: { multi: 1, rate: 1.2 } },
        ],
      },
    ],
  },
  mortar: {
    ...base,
    id: 'mortar',
    name: 'Mortar',
    icon: '💣',
    color: '#e76f51',
    cost: 80,
    dmg: 26,
    rate: 0.45,
    range: 4.5,
    minRange: 1.2,
    splash: 1,
    air: false,
    text: 'Area damage. Long range. Cannot hit flyers or close enemies.',
    branches: [
      {
        name: 'Siege',
        nodes: [
          { name: 'Big shells', text: '+40% damage, +0.2 blast', mods: { dmg: 1.4, splash: 0.2 } },
          { name: 'Black powder', text: '+40% damage, +0.3 blast', mods: { dmg: 1.4, splash: 0.3 } },
          { name: 'Shockwave', text: '+30% damage, stuns 0.5 s', mods: { dmg: 1.3, stun: 0.5 } },
        ],
      },
      {
        name: 'Barrage',
        nodes: [
          { name: 'Fast loader', text: '+40% fire rate', mods: { rate: 1.4 } },
          { name: 'Spotter', text: '+30% fire rate, +0.5 range', mods: { rate: 1.3, range: 0.5 } },
          { name: 'Cluster', text: 'Fires 3 shells', mods: { shells: 2 } },
        ],
      },
    ],
  },
  frost: {
    ...base,
    id: 'frost',
    name: 'Frost',
    icon: '❄️',
    color: '#8ecae6',
    cost: 60,
    dmg: 4,
    rate: 1,
    range: 2.5,
    slow: 0.35,
    slowDur: 1.5,
    text: 'Slows the target by 35%. Low damage.',
    branches: [
      {
        name: 'Glacier',
        nodes: [
          { name: 'Deep chill', text: '+10% slow, +0.5 s', mods: { slow: 0.1, slowDur: 0.5 } },
          { name: 'Ice shards', text: '+10% slow, double damage', mods: { slow: 0.1, dmg: 2 } },
          { name: 'Flash freeze', text: 'Hits freeze for 0.4 s', mods: { stun: 0.4 } },
        ],
      },
      {
        name: 'Blizzard',
        nodes: [
          { name: 'Cold wind', text: 'Hits all enemies in range', mods: { aura: true, rate: 0.8 } },
          { name: 'Snow storm', text: '+0.5 range, +60% damage', mods: { range: 0.5, dmg: 1.6 } },
          { name: 'Brittle', text: 'Chilled enemies take +25% damage', mods: { brittle: 0.25 } },
        ],
      },
    ],
  },
  tesla: {
    ...base,
    id: 'tesla',
    name: 'Tesla',
    icon: '⚡',
    color: '#b388ff',
    cost: 90,
    dmg: 22,
    rate: 1,
    range: 2.8,
    chain: 3,
    text: 'Lightning jumps to 3 enemies.',
    branches: [
      {
        name: 'Arc',
        nodes: [
          { name: 'Conductor', text: '+2 jumps', mods: { chain: 2 } },
          { name: 'Wide arc', text: '+2 jumps, +0.4 range', mods: { chain: 2, range: 0.4 } },
          { name: 'Storm web', text: '+3 jumps, +30% damage', mods: { chain: 3, dmg: 1.3 } },
        ],
      },
      {
        name: 'Overcharge',
        nodes: [
          { name: 'Capacitor', text: '+50% damage', mods: { dmg: 1.5 } },
          { name: 'Dynamo', text: '+40% fire rate', mods: { rate: 1.4 } },
          { name: 'Thunderclap', text: '+50% damage, stuns 0.25 s', mods: { dmg: 1.5, stun: 0.25 } },
        ],
      },
    ],
  },
  flame: {
    ...base,
    id: 'flame',
    name: 'Flame',
    icon: '🔥',
    color: '#f4a261',
    cost: 70,
    dmg: 6,
    rate: 3,
    range: 1.8,
    cone: 70,
    burn: 3,
    text: 'Cone of fire. Sets enemies on fire. Short range.',
    branches: [
      {
        name: 'Inferno',
        nodes: [
          { name: 'Hot oil', text: '+40% damage, +3 burn', mods: { dmg: 1.4, burn: 3 } },
          { name: 'Blue flame', text: '+40% damage, +4 burn', mods: { dmg: 1.4, burn: 4 } },
          { name: 'Melt', text: 'Ignores armor, +6 burn', mods: { pierce: true, burn: 6 } },
        ],
      },
      {
        name: 'Long reach',
        nodes: [
          { name: 'Nozzle', text: '+0.6 range', mods: { range: 0.6 } },
          { name: 'Wide spray', text: '+40° cone, +0.4 range', mods: { cone: 40, range: 0.4 } },
          { name: "Dragon's breath", text: '+60% damage, +30% fire rate', mods: { dmg: 1.6, rate: 1.3 } },
        ],
      },
    ],
  },
};

export const TOWER_IDS = Object.keys(TOWERS) as TowerId[];

/** Upgrade cost for level 2, 3 and 4, as a share of the build cost. */
export const UP_COST = [0.75, 1.25, 2];

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  speed: number;
  armor: number;
  gold: number;
  leak: number;
  /** Points of wave budget. 0 means it never appears on its own. */
  cost: number;
  from: number;
  fly?: boolean;
  heal?: boolean;
  split?: string;
  summon?: string;
  boss?: boolean;
  size: number;
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  grunt: { id: 'grunt', name: 'Grunt', icon: '👺', hp: 30, speed: 1, armor: 0, gold: 2, leak: 1, cost: 1, from: 1, size: 0.6, text: 'Plain foot soldier.' },
  runner: { id: 'runner', name: 'Runner', icon: '🐺', hp: 20, speed: 1.7, armor: 0, gold: 2, leak: 1, cost: 1, from: 3, size: 0.55, text: 'Fast.' },
  brute: { id: 'brute', name: 'Brute', icon: '🐗', hp: 70, speed: 0.7, armor: 3, gold: 4, leak: 2, cost: 2.5, from: 5, size: 0.75, text: 'Armor 3: each hit deals 3 less.' },
  bat: { id: 'bat', name: 'Bat', icon: '🦇', hp: 24, speed: 1.2, armor: 0, gold: 3, leak: 1, cost: 1.5, from: 7, fly: true, size: 0.55, text: 'Flies straight to the core.' },
  shaman: { id: 'shaman', name: 'Shaman', icon: '🧙', hp: 45, speed: 0.9, armor: 0, gold: 4, leak: 1, cost: 2.5, from: 9, heal: true, size: 0.65, text: 'Heals enemies close to it.' },
  slime: { id: 'slime', name: 'Slime', icon: '🟢', hp: 50, speed: 0.8, armor: 0, gold: 3, leak: 2, cost: 2.5, from: 12, split: 'blob', size: 0.7, text: 'Splits into 2 blobs.' },
  blob: { id: 'blob', name: 'Blob', icon: '🫧', hp: 16, speed: 1.3, armor: 0, gold: 1, leak: 1, cost: 0, from: 99, size: 0.45, text: 'Small and quick.' },
  ogre: { id: 'ogre', name: 'Ogre King', icon: '👹', hp: 700, speed: 0.55, armor: 3, gold: 40, leak: 10, cost: 0, from: 99, boss: true, size: 1.2, text: 'Boss. Armor 3.' },
  lich: { id: 'lich', name: 'Lich', icon: '💀', hp: 900, speed: 0.5, armor: 0, gold: 60, leak: 10, cost: 0, from: 99, boss: true, summon: 'grunt', size: 1.2, text: 'Boss. Raises grunts.' },
  golem: { id: 'golem', name: 'Iron Golem', icon: '🗿', hp: 1000, speed: 0.45, armor: 12, gold: 80, leak: 10, cost: 0, from: 99, boss: true, size: 1.25, text: 'Boss. Armor 12.' },
  dragon: { id: 'dragon', name: 'Dragon', icon: '🐉', hp: 1300, speed: 0.5, armor: 2, gold: 100, leak: 10, cost: 0, from: 99, boss: true, fly: true, size: 1.3, text: 'Boss. Flies straight to the core.' },
  tyrant: { id: 'tyrant', name: 'The Tyrant', icon: '👑', hp: 1800, speed: 0.45, armor: 6, gold: 150, leak: 20, cost: 0, from: 99, boss: true, summon: 'runner', size: 1.35, text: 'Final boss. Armor 6. Calls runners.' },
};

export const WAVE_TYPES = ['grunt', 'runner', 'brute', 'bat', 'shaman', 'slime'];
export const BOSSES = ['ogre', 'lich', 'golem', 'dragon', 'tyrant'];
export const LAST_WAVE = 50;

export interface CardDef {
  id: string;
  icon: string;
  name: string;
  /** Text. `{t}` is the tower name for tower cards. */
  text: string;
  rare?: boolean;
  /** Needs a tower type argument. */
  typed?: boolean;
}

export const CARDS: Record<string, CardDef> = {
  unlock: { id: 'unlock', icon: '🏗️', name: 'New tower', text: 'Unlock the {t} for this run.', typed: true },
  tdmg: { id: 'tdmg', icon: '⚔️', name: '{t} drills', text: 'All {t} towers deal +20% damage.', typed: true },
  trate: { id: 'trate', icon: '⏩', name: '{t} crews', text: 'All {t} towers fire 15% faster.', typed: true },
  trange: { id: 'trange', icon: '🔭', name: '{t} scopes', text: 'All {t} towers get +0.5 range.', typed: true },
  tcheap: { id: 'tcheap', icon: '🏷️', name: '{t} plans', text: '{t} towers and their upgrades cost 20% less.', typed: true },
  gold: { id: 'gold', icon: '💰', name: 'War chest', text: 'Gain gold now.' },
  walls: { id: 'walls', icon: '🧱', name: 'Masonry', text: '+5 max core HP and repair 5 HP.' },
  bounty: { id: 'bounty', icon: '🪙', name: 'Bounty', text: '+1 gold for each kill.' },
  interest: { id: 'interest', icon: '🏦', name: 'Treasury', text: 'Gain 5% of your gold after each wave (max 40).' },
  engineers: { id: 'engineers', icon: '🛠️', name: 'Engineers', text: 'Upgrades cost 15% less.' },
  eagle: { id: 'eagle', icon: '🦅', name: 'Eagle eye', text: 'All towers get +0.3 range.' },
  drill: { id: 'drill', icon: '🥁', name: 'War drums', text: 'All towers fire 8% faster.' },
  sharp: { id: 'sharp', icon: '🗡️', name: 'Whetstone', text: 'All towers deal +10% damage.' },
  salvage: { id: 'salvage', icon: '♻️', name: 'Salvage', text: 'Selling gives back 95% instead of 70%.' },
  crystal: { id: 'crystal', icon: '💎', name: 'Crystal vein', text: '+4 crystals at the end of the run.' },
  overclock: { id: 'overclock', icon: '⚙️', name: 'Overclock', text: 'All towers fire 25% faster.', rare: true },
  arsenal: { id: 'arsenal', icon: '🎖️', name: 'Arsenal', text: 'All towers deal +30% damage.', rare: true },
  golden: { id: 'golden', icon: '👑', name: 'Golden age', text: '+2 gold for each kill.', rare: true },
  fortress: { id: 'fortress', icon: '🏰', name: 'Fortress', text: '+10 max core HP and full repair.', rare: true },
  veteran: { id: 'veteran', icon: '⭐', name: 'Veterans', text: 'Every tower you own gets one free upgrade.', rare: true },
};

export interface RelicDef {
  id: string;
  icon: string;
  name: string;
  text: string;
  cost: number;
}

export const RELICS: Record<string, RelicDef> = {
  purse: { id: 'purse', icon: '👛', name: 'Gold purse', text: 'Start with +60 gold.', cost: 15 },
  walls: { id: 'walls', icon: '🧱', name: 'Stone walls', text: 'Start with +5 core HP.', cost: 15 },
  scholar: { id: 'scholar', icon: '📜', name: 'Scholar', text: 'Start with a second tower type.', cost: 25 },
  whetstone: { id: 'whetstone', icon: '🗡️', name: 'Old whetstone', text: 'All towers deal +10% damage.', cost: 30 },
};

/** Tower types that must be unlocked with crystals before cards can offer them. */
export const TOWER_UNLOCK: Partial<Record<TowerId, number>> = { tesla: 20, flame: 20 };
