/** Static game data: cards, towers, perks, bosses. */

export type Targets = 'ground' | 'any' | 'buildings';

export interface UnitStats {
  hp: number;
  dmg: number;
  /** Seconds between attacks. */
  rate: number;
  /** Attack reach in field pixels (edge to edge). */
  range: number;
  /** Field pixels per second. */
  speed: number;
  targets: Targets;
  air?: boolean;
  /** Splash radius around the target. */
  splash?: number;
  /** Number of units spawned. */
  count?: number;
  /** Body radius. */
  r: number;
  deathSpawn?: { id: string; n: number };
  deathDmg?: number;
  /** Calls `n` units of `id` every `every` seconds. */
  summon?: { id: string; n: number; every: number };
}

export interface SpellStats {
  radius: number;
  dmg?: number;
  stun?: number;
  freeze?: number;
  heal?: number;
  rage?: number;
  /** Lightning: hits the N enemies with the most HP. */
  bolts?: number;
}

export interface CardDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  type: 'unit' | 'spell';
  text: string;
  /** Short role tags for the draft and the AI. */
  tags: string[];
  unit?: UnitStats;
  spell?: SpellStats;
  /** Meta unlock price in gems. 0 = always in the pool. */
  unlock: number;
  /** Not a deck card (spawned by others). */
  token?: boolean;
}

const u = (s: UnitStats): UnitStats => s;

export const CARDS: Record<string, CardDef> = {
  knight: { id: 'knight', name: 'Knight', icon: '🗡️', cost: 3, type: 'unit', text: 'Sturdy melee fighter.', tags: ['mini-tank', 'melee'], unlock: 0, unit: u({ hp: 680, dmg: 80, rate: 1.1, range: 6, speed: 32, targets: 'ground', r: 10 }) },
  archers: { id: 'archers', name: 'Archers', icon: '🏹', cost: 3, type: 'unit', text: 'Two archers. Hit air and ground.', tags: ['ranged', 'anti-air'], unlock: 0, unit: u({ hp: 170, dmg: 48, rate: 1.0, range: 85, speed: 32, targets: 'any', count: 2, r: 7 }) },
  goblins: { id: 'goblins', name: 'Goblins', icon: '👺', cost: 2, type: 'unit', text: 'Three fast stabbers.', tags: ['swarm', 'melee', 'fast'], unlock: 0, unit: u({ hp: 110, dmg: 55, rate: 1.0, range: 5, speed: 48, targets: 'ground', count: 3, r: 7 }) },
  giant: { id: 'giant', name: 'Giant', icon: '🗿', cost: 5, type: 'unit', text: 'Huge HP. Walks to towers and hits only them.', tags: ['tank', 'siege'], unlock: 0, unit: u({ hp: 2100, dmg: 130, rate: 1.5, range: 6, speed: 24, targets: 'buildings', r: 14 }) },
  bomber: { id: 'bomber', name: 'Bomber', icon: '💣', cost: 3, type: 'unit', text: 'Throws bombs. Splash, ground only.', tags: ['splash', 'ranged'], unlock: 0, unit: u({ hp: 230, dmg: 115, rate: 1.8, range: 75, speed: 32, targets: 'ground', splash: 30, r: 8 }) },
  minions: { id: 'minions', name: 'Minions', icon: '🦇', cost: 3, type: 'unit', text: 'Three flyers. Ground melee cannot hit them.', tags: ['air', 'swarm', 'anti-air'], unlock: 0, unit: u({ hp: 120, dmg: 46, rate: 1.0, range: 30, speed: 44, targets: 'any', air: true, count: 3, r: 7 }) },
  fireball: { id: 'fireball', name: 'Fireball', icon: '🔥', cost: 4, type: 'spell', text: 'Big blast. Deals damage in an area.', tags: ['spell', 'splash'], unlock: 0, spell: { radius: 42, dmg: 400 } },
  arrows: { id: 'arrows', name: 'Arrows', icon: '🎯', cost: 3, type: 'spell', text: 'Rain of arrows on a wide area.', tags: ['spell', 'splash', 'anti-air'], unlock: 0, spell: { radius: 66, dmg: 150 } },
  musketeer: { id: 'musketeer', name: 'Musketeer', icon: '🔫', cost: 4, type: 'unit', text: 'Long range, hits air and ground.', tags: ['ranged', 'anti-air'], unlock: 0, unit: u({ hp: 380, dmg: 105, rate: 1.1, range: 110, speed: 32, targets: 'any', r: 9 }) },
  valkyrie: { id: 'valkyrie', name: 'Valkyrie', icon: '🪓', cost: 4, type: 'unit', text: 'Spins her axe. Melee splash.', tags: ['mini-tank', 'splash', 'melee'], unlock: 0, unit: u({ hp: 1000, dmg: 115, rate: 1.4, range: 6, speed: 32, targets: 'ground', splash: 32, r: 11 }) },
  hog: { id: 'hog', name: 'Hog Rider', icon: '🐗', cost: 4, type: 'unit', text: 'Fast. Runs to towers and hits only them.', tags: ['siege', 'fast'], unlock: 0, unit: u({ hp: 900, dmg: 180, rate: 1.5, range: 6, speed: 56, targets: 'buildings', r: 11 }) },
  skeletons: { id: 'skeletons', name: 'Skeleton Army', icon: '💀', cost: 3, type: 'unit', text: 'Ten weak skeletons. Shred tanks, die to splash.', tags: ['swarm', 'melee', 'dps'], unlock: 0, unit: u({ hp: 45, dmg: 45, rate: 1.0, range: 4, speed: 40, targets: 'ground', count: 10, r: 6 }) },
  spears: { id: 'spears', name: 'Spear Goblins', icon: '🔱', cost: 2, type: 'unit', text: 'Three cheap throwers. Hit air.', tags: ['swarm', 'ranged', 'anti-air'], unlock: 0, unit: u({ hp: 75, dmg: 36, rate: 1.2, range: 80, speed: 44, targets: 'any', count: 3, r: 6 }) },
  zap: { id: 'zap', name: 'Zap', icon: '✨', cost: 2, type: 'spell', text: 'Small shock. Damage and a short stun.', tags: ['spell', 'splash', 'anti-air'], unlock: 0, spell: { radius: 40, dmg: 100, stun: 0.8 } },
  heal: { id: 'heal', name: 'Heal', icon: '💚', cost: 3, type: 'spell', text: 'Heals your units in the area.', tags: ['spell', 'support'], unlock: 0, spell: { radius: 60, heal: 380 } },
  freeze: { id: 'freeze', name: 'Freeze', icon: '❄️', cost: 4, type: 'spell', text: 'Freezes enemy units and towers for 4 s.', tags: ['spell', 'support'], unlock: 0, spell: { radius: 55, dmg: 40, freeze: 4 } },
  // Meta unlocks
  wizard: { id: 'wizard', name: 'Wizard', icon: '🧙', cost: 5, type: 'unit', text: 'Fire splash on air and ground.', tags: ['splash', 'ranged', 'anti-air'], unlock: 30, unit: u({ hp: 420, dmg: 135, rate: 1.4, range: 95, speed: 32, targets: 'any', splash: 30, r: 9 }) },
  babydragon: { id: 'babydragon', name: 'Baby Dragon', icon: '🐉', cost: 4, type: 'unit', text: 'Flying splash.', tags: ['air', 'splash', 'anti-air'], unlock: 30, unit: u({ hp: 560, dmg: 72, rate: 1.5, range: 45, speed: 36, targets: 'any', air: true, splash: 28, r: 11 }) },
  rage: { id: 'rage', name: 'Rage', icon: '😡', cost: 2, type: 'spell', text: 'Your units in the area move and hit 40% faster for 6 s.', tags: ['spell', 'support'], unlock: 30, spell: { radius: 60, rage: 6 } },
  balloon: { id: 'balloon', name: 'Balloon', icon: '🎈', cost: 5, type: 'unit', text: 'Flies to towers. Huge hits. Drops a bomb on death.', tags: ['air', 'siege'], unlock: 45, unit: u({ hp: 950, dmg: 360, rate: 2.5, range: 4, speed: 30, targets: 'buildings', air: true, deathDmg: 180, r: 12 }) },
  pekka: { id: 'pekka', name: 'P.E.K.K.A', icon: '🤖', cost: 7, type: 'unit', text: 'Slow armored giant. Crushes anything on the ground.', tags: ['tank', 'dps', 'melee'], unlock: 45, unit: u({ hp: 1900, dmg: 360, rate: 1.8, range: 7, speed: 24, targets: 'ground', r: 14 }) },
  lightning: { id: 'lightning', name: 'Lightning', icon: '⚡', cost: 6, type: 'spell', text: 'Strikes the 3 strongest enemies in the area.', tags: ['spell'], unlock: 60, spell: { radius: 60, dmg: 520, bolts: 3, stun: 0.5 } },
  golem: { id: 'golem', name: 'Golem', icon: '🪨', cost: 8, type: 'unit', text: 'Massive tank. Splits into 2 Golemites on death.', tags: ['tank', 'siege'], unlock: 60, unit: u({ hp: 3400, dmg: 210, rate: 2.5, range: 7, speed: 20, targets: 'buildings', r: 16, deathSpawn: { id: 'golemite', n: 2 }, deathDmg: 120 }) },
  witch: { id: 'witch', name: 'Witch', icon: '🧹', cost: 5, type: 'unit', text: 'Ranged splash. Calls 3 skeletons every 9 s.', tags: ['splash', 'ranged', 'anti-air', 'summoner'], unlock: 75, unit: u({ hp: 520, dmg: 75, rate: 1.1, range: 80, speed: 30, targets: 'any', splash: 22, r: 10, summon: { id: 'skeleton', n: 3, every: 9 } }) },
  // Tokens (spawned, not drafted)
  golemite: { id: 'golemite', name: 'Golemite', icon: '🪨', cost: 2, type: 'unit', text: 'Small golem.', tags: ['siege'], unlock: 0, token: true, unit: u({ hp: 800, dmg: 60, rate: 2.5, range: 6, speed: 24, targets: 'buildings', r: 10, deathDmg: 40 }) },
  skeleton: { id: 'skeleton', name: 'Skeleton', icon: '💀', cost: 1, type: 'unit', text: 'One skeleton.', tags: ['swarm'], unlock: 0, token: true, unit: u({ hp: 45, dmg: 45, rate: 1.0, range: 4, speed: 40, targets: 'ground', r: 6 }) },
};

export const DECK_CARDS = Object.values(CARDS).filter((c) => !c.token);
export const LOCKED_CARDS = DECK_CARDS.filter((c) => c.unlock > 0).map((c) => c.id);

export const START_DECK = ['knight', 'archers', 'goblins', 'giant', 'bomber', 'minions', 'fireball', 'arrows'];

export type TowerType = 'arrow' | 'cannon' | 'healer' | 'keep';

export interface TowerDef {
  name: string;
  icon: string;
  hp: number;
  dmg: number;
  rate: number;
  range: number;
  targets: Targets;
  splash?: number;
  heal?: number;
  text: string;
}

export const TOWERS: Record<TowerType, TowerDef> = {
  arrow: { name: 'Arrow Tower', icon: '🏹', hp: 1150, dmg: 46, rate: 0.8, range: 105, targets: 'any', text: 'Shoots air and ground.' },
  cannon: { name: 'Cannon Tower', icon: '💥', hp: 1350, dmg: 140, rate: 1.6, range: 108, targets: 'ground', splash: 28, text: 'Splash on ground units. Cannot hit air.' },
  healer: { name: 'Healing Tower', icon: '⛲', hp: 1050, dmg: 32, rate: 0.9, range: 115, targets: 'any', heal: 40, text: 'Heals enemy units and towers near it.' },
  keep: { name: 'Keep', icon: '🏰', hp: 1800, dmg: 60, rate: 0.9, range: 118, targets: 'any', text: 'Wakes up when a tower falls or it is hit. Break it to win.' },
};

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const PERKS: Record<string, PerkDef> = {
  well: { id: 'well', name: 'Deep Well', icon: '🪣', text: 'Max energy 12 instead of 10.' },
  brew: { id: 'brew', name: 'Quick Brew', icon: '⚗️', text: 'Energy fills 12% faster.' },
  start: { id: 'start', name: 'Head Start', icon: '🚩', text: 'Start each battle with 8 energy.' },
  hide: { id: 'hide', name: 'Thick Hide', icon: '🛡️', text: 'Your units have +12% HP.' },
  blades: { id: 'blades', name: 'Sharp Blades', icon: '⚔️', text: 'Your units deal +12% damage.' },
  book: { id: 'book', name: 'Spellbook', icon: '📖', text: 'Your spells are 25% stronger.' },
  siege: { id: 'siege', name: 'Siege Crew', icon: '🔨', text: 'Your units deal +25% damage to towers.' },
  drums: { id: 'drums', name: 'War Drums', icon: '🥁', text: 'Your units move 15% faster.' },
  wall: { id: 'wall', name: 'Stone Wall', icon: '🧱', text: '+20 max camp HP and heal 20.' },
  spy: { id: 'spy', name: 'Spyglass', icon: '🔭', text: 'See the enemy hand. Enemy energy fills 5% slower.' },
};

export interface BossDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  /** Seconds between ability uses. */
  every: number;
}

export const BOSSES: BossDef[] = [
  { id: 'chief', name: 'Goblin Chief', icon: '👹', text: 'The keep sends 3 goblins down a lane every 16 s.', every: 16 },
  { id: 'witch', name: 'Frost Witch', icon: '🧊', text: 'Every 15 s she freezes your biggest group for 2.5 s.', every: 15 },
  { id: 'dragon', name: 'Dragon Lord', icon: '🐲', text: 'A fireball every 13 s. At half HP, a dragon guards each lane.', every: 13 },
];

export interface ActDef {
  name: string;
  icon: string;
  /** Enemy card pool for this act. */
  pool: string[];
  /** Enemy energy fill multiplier. */
  ai: number;
  /** Tower HP multiplier. */
  towerHp: number;
  /** Enemy card level. */
  lvl: number;
}

export const ACTS: ActDef[] = [
  { name: 'Green Border', icon: '🌲', pool: ['knight', 'archers', 'goblins', 'spears', 'bomber', 'minions', 'arrows', 'zap', 'skeletons', 'valkyrie'], ai: 0.45, towerHp: 1, lvl: 1 },
  { name: 'Frost Pass', icon: '🏔️', pool: ['knight', 'archers', 'goblins', 'spears', 'bomber', 'minions', 'arrows', 'zap', 'skeletons', 'valkyrie', 'musketeer', 'fireball', 'babydragon', 'wizard', 'freeze'], ai: 0.55, towerHp: 1.2, lvl: 2 },
  { name: 'Dragon Spire', icon: '🌋', pool: ['knight', 'archers', 'spears', 'bomber', 'minions', 'arrows', 'zap', 'skeletons', 'valkyrie', 'musketeer', 'fireball', 'babydragon', 'wizard', 'pekka', 'witch', 'lightning', 'freeze'], ai: 0.62, towerHp: 1.4, lvl: 3 },
];

/** Stat multiplier for a card level (1..4). */
export const lvlMult = (lvl: number): number => 1 + 0.15 * (lvl - 1);
export const MAX_LVL = 4;
