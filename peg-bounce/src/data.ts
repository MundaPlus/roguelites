// ---------- Orbs ----------

export interface OrbDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Damage per peg for levels 1–3. */
  dmg: [number, number, number];
  /** Damage per peg on a crit shot. */
  crit: [number, number, number];
  text: string;
  r?: number;
  /** Bounce (restitution). */
  e?: number;
  /** Gravity factor. */
  g?: number;
  split?: boolean;
  pierce?: boolean;
  splash?: boolean;
  /** Passes through this many pegs without a bounce. */
  ghost?: number;
  poisonEvery?: number;
  goldPer?: number;
  healEvery?: number;
  wallHits?: boolean;
  /** Shards to unlock it in the Armory. 0 = unlocked from the start. */
  unlock: number;
}

export const ORBS: Record<string, OrbDef> = {
  pebble: { id: 'pebble', name: 'Pebble', icon: '🪨', color: '#d6d3cf', dmg: [2, 3, 4], crit: [4, 6, 8], text: 'A plain stone. Reliable.', unlock: 0 },
  splitter: { id: 'splitter', name: 'Splitter', icon: '🔷', color: '#4cc9f0', dmg: [1, 2, 2], crit: [3, 4, 5], split: true, text: 'Splits in two at the first peg it hits.', unlock: 0 },
  lancer: { id: 'lancer', name: 'Lancer', icon: '🗡️', color: '#f1f3f5', dmg: [1, 2, 3], crit: [3, 4, 6], pierce: true, text: 'The attack hits every enemy.', unlock: 0 },
  boulder: { id: 'boulder', name: 'Boulder', icon: '🌑', color: '#8d939a', dmg: [3, 4, 5], crit: [5, 7, 9], r: 10, e: 0.45, g: 1.35, text: 'Heavy. Bounces less, hits harder.', unlock: 0 },
  bouncer: { id: 'bouncer', name: 'Bouncer', icon: '🟢', color: '#80ed99', dmg: [1, 2, 2], crit: [3, 4, 5], e: 0.92, wallHits: true, text: 'Very bouncy. Wall hits count as pegs.', unlock: 0 },
  fireball: { id: 'fireball', name: 'Fireball', icon: '🔥', color: '#ff7b00', dmg: [2, 2, 3], crit: [4, 5, 6], splash: true, text: 'The attack also hits the enemy behind the target for half.', unlock: 0 },
  venom: { id: 'venom', name: 'Venom', icon: '🧪', color: '#9ef01a', dmg: [1, 1, 2], crit: [2, 3, 4], poisonEvery: 4, text: 'Every 4 pegs add 1 poison to the target.', unlock: 0 },
  ghost: { id: 'ghost', name: 'Ghost', icon: '👻', color: '#e0aaff', dmg: [2, 3, 3], crit: [4, 5, 6], ghost: 4, text: 'Passes through the first 4 pegs it hits.', unlock: 30 },
  midas: { id: 'midas', name: 'Midas', icon: '🪙', color: '#ffd60a', dmg: [1, 2, 2], crit: [3, 3, 4], goldPer: 1, text: 'Every peg also gives 1 gold.', unlock: 40 },
  mender: { id: 'mender', name: 'Mender', icon: '💚', color: '#2dc653', dmg: [1, 1, 2], crit: [2, 3, 3], healEvery: 5, text: 'Every 5 pegs heal you 1 HP.', unlock: 40 },
};

export const ORB_IDS = Object.keys(ORBS);

// ---------- Relics ----------

export interface RelicDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  unlock: number;
}

const relic = (id: string, icon: string, name: string, text: string, unlock = 0): RelicDef => ({ id, icon, name, text, unlock });

export const RELICS: Record<string, RelicDef> = Object.fromEntries(
  [
    relic('whetstone', '🔪', 'Whetstone', 'Pegs deal +1 damage.'),
    relic('rubber', '🎈', 'Rubber Coat', 'Orbs bounce 15% more.'),
    relic('lens', '🔍', 'Crit Lens', '+1 crit peg on each board.'),
    relic('fang', '🦷', 'Vampire Fang', 'Every 10th peg in a shot heals 2 HP.'),
    relic('hide', '🐢', 'Turtle Shell', '+20 max HP.'),
    relic('purse', '💰', 'Fat Purse', '+30% gold from fights.'),
    relic('wind', '🌬️', 'Second Wind', 'Refresh pegs also heal 4 HP.'),
    relic('keg', '🧨', 'Powder Keg', 'Bombs explode after 1 hit and deal +4 damage.', 30),
    relic('bucket', '🪣', 'Big Bucket', 'The bucket is twice as wide.'),
    relic('spikes', '🌵', 'Cactus Walls', 'Wall hits count as pegs for every orb.'),
    relic('thorns', '🌹', 'Thorn Mail', 'Enemies that hit you take 3 damage.'),
    relic('echo', '🔔', 'Echo Bell', 'The first shot of each fight deals double damage.', 40),
    relic('crown', '👑', 'Gilded Crown', 'Crit pegs give 4 gold when hit.', 30),
    relic('helmet', '🪖', 'Iron Helmet', 'Take 1 less damage from each hit.'),
    relic('needle', '💉', 'Poison Needle', 'Each attack adds 2 poison to the target.'),
    relic('scope', '🔭', 'Long Scope', 'The aim line shows two bounces.', 30),
  ].map((r) => [r.id, r]),
);

export const RELIC_IDS = Object.keys(RELICS);

// ---------- Enemies ----------

export type Special = 'shield' | 'summon' | 'explode' | 'heal' | 'armor' | 'regen';

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  speed: number;
  /** Attacks when its slot is this close to the hero (slot 1 is next to the hero). */
  range: number;
  special?: Special;
  /** Shield size, heal or regen amount, armor, or the summoned enemy id. */
  value?: number;
  summon?: string;
  /** Summon every N turns. */
  every?: number;
  boss?: boolean;
  text: string;
}

const enemy = (d: EnemyDef): EnemyDef => d;

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(
  [
    // Act 1
    enemy({ id: 'slime', name: 'Slime', icon: '🫧', hp: 20, atk: 3, speed: 1, range: 1, text: 'Slow and soft.' }),
    enemy({ id: 'bat', name: 'Bat', icon: '🦇', hp: 13, atk: 2, speed: 2, range: 1, text: 'Fast.' }),
    enemy({ id: 'archer', name: 'Goblin Archer', icon: '👺', hp: 17, atk: 3, speed: 1, range: 4, text: 'Shoots from 4 slots away.' }),
    enemy({ id: 'shroom', name: 'Shroom', icon: '🍄', hp: 26, atk: 2, speed: 1, range: 1, special: 'heal', value: 3, text: 'Heals the most hurt ally by 3 each turn.' }),
    enemy({ id: 'ogre', name: 'Ogre', icon: '👹', hp: 70, atk: 7, speed: 1, range: 1, text: 'Elite. Big and slow.' }),
    enemy({ id: 'sapling', name: 'Sapling', icon: '🌱', hp: 9, atk: 2, speed: 1, range: 1, text: 'Grown by the Treant.' }),
    enemy({ id: 'treant', name: 'Elder Treant', icon: '🌳', hp: 170, atk: 6, speed: 0, range: 3, special: 'summon', summon: 'sapling', every: 2, boss: true, text: 'Boss. Roots in place. Grows a Sapling every 2 turns.' }),
    // Act 2
    enemy({ id: 'skeleton', name: 'Skeleton', icon: '💀', hp: 28, atk: 4, speed: 1, range: 1, text: 'Rattles forward.' }),
    enemy({ id: 'knight', name: 'Shield Knight', icon: '🛡️', hp: 30, atk: 4, speed: 1, range: 1, special: 'shield', value: 8, text: 'Raises an 8 shield each turn.' }),
    enemy({ id: 'imp', name: 'Bomb Imp', icon: '😈', hp: 16, atk: 12, speed: 2, range: 1, special: 'explode', text: 'Explodes next to you for 12, then dies.' }),
    enemy({ id: 'spider', name: 'Cave Spider', icon: '🕷️', hp: 22, atk: 3, speed: 2, range: 2, text: 'Spits from 2 slots away.' }),
    enemy({ id: 'golem', name: 'Golem', icon: '🗿', hp: 120, atk: 9, speed: 1, range: 1, special: 'armor', value: 3, text: 'Elite. Armor 3: each attack deals 3 less.' }),
    enemy({ id: 'lich', name: 'Lich', icon: '🧙', hp: 280, atk: 7, speed: 0, range: 6, special: 'summon', summon: 'skeleton', every: 3, boss: true, text: 'Boss. Casts from afar. Raises a Skeleton every 3 turns.' }),
    // Act 3
    enemy({ id: 'wolf', name: 'Dire Wolf', icon: '🐺', hp: 30, atk: 6, speed: 3, range: 1, text: 'Very fast.' }),
    enemy({ id: 'mage', name: 'Dark Mage', icon: '🧝', hp: 28, atk: 5, speed: 1, range: 4, special: 'heal', value: 5, text: 'Casts from 4 slots away. Heals an ally by 5.' }),
    enemy({ id: 'guard', name: 'Tower Guard', icon: '⚔️', hp: 40, atk: 6, speed: 1, range: 1, special: 'shield', value: 12, text: 'Raises a 12 shield each turn.' }),
    enemy({ id: 'boar', name: 'War Boar', icon: '🐗', hp: 42, atk: 7, speed: 2, range: 1, text: 'Charges in.' }),
    enemy({ id: 'troll', name: 'Troll', icon: '🧌', hp: 170, atk: 10, speed: 1, range: 1, special: 'regen', value: 10, text: 'Elite. Regains 10 HP each turn.' }),
    enemy({ id: 'whelp', name: 'Whelp', icon: '🦎', hp: 20, atk: 4, speed: 2, range: 1, text: 'Hatched by the Dragon.' }),
    enemy({ id: 'dragon', name: 'Ember Dragon', icon: '🐉', hp: 420, atk: 10, speed: 0, range: 7, special: 'summon', summon: 'whelp', every: 3, boss: true, text: 'Boss. Breathes fire from afar. Hatches a Whelp every 3 turns.' }),
  ].map((e) => [e.id, e]),
);

export interface ActDef {
  name: string;
  icon: string;
  pool: string[];
  elite: string;
  boss: string;
  bg: string;
}

export const ACTS: ActDef[] = [
  { name: 'Mossy Woods', icon: '🌲', pool: ['slime', 'bat', 'archer', 'shroom'], elite: 'ogre', boss: 'treant', bg: '#16241a' },
  { name: 'Deep Caves', icon: '🕯️', pool: ['skeleton', 'knight', 'imp', 'spider', 'bat'], elite: 'golem', boss: 'lich', bg: '#1c1a26' },
  { name: 'Dragon Keep', icon: '🏰', pool: ['wolf', 'mage', 'guard', 'boar', 'skeleton'], elite: 'troll', boss: 'dragon', bg: '#2a1616' },
];
