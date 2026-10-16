/** Static game data: hulls, upgrades, rocks, enemies, bosses. */

export interface HullDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  color: string;
  /** Turn speed in rad/s. */
  turn: number;
  /** Thrust in px/s². */
  accel: number;
  maxSpeed: number;
  /** Fraction of speed lost per second. 0 = no drag. */
  drag: number;
  radius: number;
  lives: number;
  fireCd: number;
  dmg: number;
  bulletSpeed: number;
  /** Upgrades the hull starts with. */
  start: Record<string, number>;
  /** Shard cost. 0 = free from the start. */
  unlock: number;
}

export const HULLS: Record<string, HullDef> = {
  arrow: {
    id: 'arrow', name: 'Arrow', icon: '🔺', color: '#8ecae6', text: 'Balanced handling. A light drag slows you down.',
    turn: 4.4, accel: 330, maxSpeed: 360, drag: 0.4, radius: 10, lives: 3, fireCd: 0.22, dmg: 1, bulletSpeed: 560, start: {}, unlock: 0,
  },
  sparrow: {
    id: 'sparrow', name: 'Sparrow', icon: '🐦', color: '#90f1a4', text: 'Small, quick turns, strong drag. Fires fast, weak bullets.',
    turn: 5.4, accel: 420, maxSpeed: 330, drag: 0.9, radius: 8, lives: 3, fireCd: 0.16, dmg: 0.6, bulletSpeed: 600, start: {}, unlock: 30,
  },
  bulwark: {
    id: 'bulwark', name: 'Bulwark', icon: '🛡️', color: '#ffd166', text: 'Heavy and slow to turn. 4 ships and a shield from the start.',
    turn: 3.6, accel: 260, maxSpeed: 300, drag: 0.5, radius: 13, lives: 4, fireCd: 0.25, dmg: 1.05, bulletSpeed: 520, start: { shield: 1 }, unlock: 50,
  },
  drifter: {
    id: 'drifter', name: 'Drifter', icon: '🌀', color: '#c77dff', text: 'Almost no drag. Very fast. Starts with a rear gun.',
    turn: 4.8, accel: 360, maxSpeed: 470, drag: 0.1, radius: 10, lives: 3, fireCd: 0.22, dmg: 1, bulletSpeed: 600, start: { rear: 1 }, unlock: 70,
  },
  lancer: {
    id: 'lancer', name: 'Lancer', icon: '🗡️', color: '#ff8fab', text: 'Slow, heavy shots that pierce one target and fly far.',
    turn: 4, accel: 310, maxSpeed: 360, drag: 0.4, radius: 10, lives: 3, fireCd: 0.44, dmg: 1.55, bulletSpeed: 720, start: { pierce: 1 }, unlock: 90,
  },
};

export const HULL_IDS = Object.keys(HULLS);

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  /** Text per level (index 0 = level 1). */
  text: string[];
  max: number;
  /** Shard cost to unlock. 0 = in the pool from the start. */
  unlock: number;
}

export const UPGRADES: Record<string, UpgradeDef> = {
  rapid: { id: 'rapid', name: 'Rapid Fire', icon: '⚡', max: 3, unlock: 0, text: ['Fire 18% faster.', 'Fire 38% faster.', 'Fire 63% faster.'] },
  spread: { id: 'spread', name: 'Spread Shot', icon: '🔱', max: 3, unlock: 0, text: ['Fire 3 bullets in a fan. Side bullets deal half damage and fly shorter.', 'Fire 5 bullets in a fan.', 'Fire 7 bullets in a fan.'] },
  rear: { id: 'rear', name: 'Rear Gun', icon: '🔙', max: 3, unlock: 0, text: ['1 bullet fires backward.', '2 bullets fire backward.', '3 bullets fire backward.'] },
  pierce: { id: 'pierce', name: 'Piercing Rounds', icon: '📌', max: 3, unlock: 0, text: ['Bullets pass through 1 target.', 'Bullets pass through 2 targets.', 'Bullets pass through 3 targets.'] },
  power: { id: 'power', name: 'Heavy Rounds', icon: '💥', max: 3, unlock: 0, text: ['+30% bullet damage.', '+60% bullet damage.', '+90% bullet damage.'] },
  shield: { id: 'shield', name: 'Shield', icon: '🔵', max: 3, unlock: 0, text: ['Blocks 1 hit. Recharges in 16 s.', 'Blocks 1 hit. Recharges in 11 s.', 'Blocks 1 hit. Recharges in 7 s.'] },
  mines: { id: 'mines', name: 'Mine Layer', icon: '💣', max: 3, unlock: 0, text: ['Drops a mine every 3.5 s.', 'Drops a mine every 2.6 s.', 'Drops a mine every 1.8 s.'] },
  tractor: { id: 'tractor', name: 'Tractor Beam', icon: '🧲', max: 3, unlock: 0, text: ['Pulls credits from 150 px. +15% credits.', 'Pulls credits from 230 px. +30% credits.', 'Pulls credits from 320 px. +45% credits.'] },
  hyper: { id: 'hyper', name: 'Hyperspace', icon: '🌌', max: 3, unlock: 0, text: ['Jump to a safe spot. Cooldown 12 s.', 'Jump to a safe spot. Cooldown 8 s.', 'Jump to a safe spot. Cooldown 5 s.'] },
  engine: { id: 'engine', name: 'Afterburner', icon: '🔥', max: 3, unlock: 0, text: ['+20% thrust, +10% top speed and turn.', '+40% thrust, +20% top speed and turn.', '+60% thrust, +30% top speed and turn.'] },
  wingman: { id: 'wingman', name: 'Wingman', icon: '🛸', max: 3, unlock: 40, text: ['A drone circles you and shoots every 0.9 s.', 'The drone shoots every 0.6 s.', 'The drone shoots every 0.4 s.'] },
  nova: { id: 'nova', name: 'Nova Core', icon: '☀️', max: 3, unlock: 60, text: ['When a hit lands, a blast of 150 px hits everything.', 'Blast of 210 px.', 'Blast of 280 px.'] },
};

export const UP_IDS = Object.keys(UPGRADES);

export type RockKind = 'stone' | 'metal' | 'explosive' | 'crystal';

export const ROCK_INFO: Record<RockKind, { name: string; color: string; hp: number; credit: number; text: string }> = {
  stone: { name: 'Stone', color: '#b8c4d6', hp: 1, credit: 1, text: 'Splits in two when it breaks.' },
  metal: { name: 'Metal', color: '#8d99ae', hp: 3, credit: 2, text: '3× HP. Worth 2× credits.' },
  explosive: { name: 'Explosive', color: '#ff6b35', hp: 1, credit: 1, text: 'Explodes when it breaks. The blast hurts rocks, enemies and you.' },
  crystal: { name: 'Crystal', color: '#4cc9f0', hp: 1.5, credit: 3, text: 'Splits in three. Worth 3× credits.' },
};

/** Size 3 = big, 2 = medium, 1 = small. */
export const ROCK_SIZE: Record<number, { r: number; hp: number; score: number; credit: number; speed: number }> = {
  3: { r: 44, hp: 3, score: 20, credit: 3, speed: 45 },
  2: { r: 25, hp: 2, score: 50, credit: 2, speed: 75 },
  1: { r: 13, hp: 1, score: 100, credit: 1, speed: 110 },
};

export type EnemyKind = 'saucer' | 'hunter' | 'mine' | 'drone' | 'mother' | 'titan' | 'warden';

export interface EnemyDef {
  name: string;
  icon: string;
  color: string;
  r: number;
  hp: number;
  score: number;
  credit: number;
  text: string;
  boss?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  saucer: { name: 'Saucer', icon: '🛸', color: '#f72585', r: 18, hp: 4, score: 200, credit: 8, text: 'Drifts across the field and shoots at you. Not very accurate.' },
  hunter: { name: 'Hunter', icon: '🎯', color: '#ff4d6d', r: 12, hp: 3, score: 500, credit: 12, text: 'A small saucer. Chases you and leads its shots. From wave 7.' },
  mine: { name: 'Space Mine', icon: '✴️', color: '#ffbe0b', r: 10, hp: 2, score: 100, credit: 4, text: 'Drifts. Arms when you come close, then explodes. From wave 4.' },
  drone: { name: 'Homing Drone', icon: '🔻', color: '#fb5607', r: 8, hp: 1, score: 150, credit: 3, text: 'Flies straight at you in packs. From wave 3.' },
  mother: { name: 'Mothership', icon: '🛰️', color: '#f72585', r: 52, hp: 140, score: 3000, credit: 60, boss: true, text: 'Wave 5 boss. Fires rings of bullets and launches drones.' },
  titan: { name: 'Rock Titan', icon: '🌑', color: '#ff9e00', r: 72, hp: 800, score: 5000, credit: 80, boss: true, text: 'Wave 10 boss. A living asteroid. Throws rocks and sheds big rocks as it cracks.' },
  warden: { name: 'Warden', icon: '👁️', color: '#b5179e', r: 30, hp: 600, score: 8000, credit: 0, boss: true, text: 'Wave 15 boss. A fast gunship with spread shots, drones and a bullet spiral.' },
};

/** Waves in a run. A boss every 5 waves. The last wave is the final boss. */
export const WAVES = 15;
export const bossFor = (wave: number): EnemyKind | null => (wave === 5 ? 'mother' : wave === 10 ? 'titan' : wave === 15 ? 'warden' : null);
/** The dock opens after these waves. */
export const isDockWave = (wave: number): boolean => wave % 5 === 2 || wave % 5 === 4;
