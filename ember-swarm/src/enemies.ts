import type { Enemy } from './types';

export interface EnemyDef {
  hp: number;
  speed: number;
  damage: number;
  r: number;
  xp: number;
  color: string;
  /** First minute this enemy can spawn. */
  from: number;
  weight: number;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  bat: { hp: 5, speed: 100, damage: 4, r: 8, xp: 1, color: '#9b5de5', from: 0, weight: 6 },
  ghoul: { hp: 14, speed: 55, damage: 6, r: 12, xp: 1, color: '#43aa8b', from: 0, weight: 5 },
  imp: { hp: 12, speed: 125, damage: 7, r: 9, xp: 2, color: '#f94144', from: 1.5, weight: 4 },
  brute: { hp: 70, speed: 42, damage: 14, r: 19, xp: 5, color: '#577590', from: 3, weight: 2 },
  wisp: { hp: 30, speed: 85, damage: 10, r: 11, xp: 3, color: '#4cc9f0', from: 5, weight: 3 },
  golem: { hp: 220, speed: 36, damage: 22, r: 26, xp: 12, color: '#8d6e63', from: 7, weight: 1.2 },
};

let nextId = 1;

function base(kind: string, x: number, y: number): Enemy {
  return {
    id: nextId++,
    kind,
    x,
    y,
    r: 10,
    hp: 1,
    maxHp: 1,
    speed: 50,
    damage: 5,
    xp: 1,
    color: '#fff',
    flash: 0,
    kx: 0,
    ky: 0,
    slowT: 0,
    dead: false,
    elite: false,
    boss: false,
    wobble: Math.random() * 6,
    aiT: 4,
    dashT: 0,
    summonT: 6,
    dx: 0,
    dy: 0,
  };
}

export function makeEnemy(kind: string, x: number, y: number, minute: number, elite = false): Enemy {
  const d = ENEMY_DEFS[kind];
  const e = base(kind, x, y);
  const hpScale = 1 + minute * 0.22;
  e.hp = e.maxHp = d.hp * hpScale * (elite ? 9 : 1);
  e.r = d.r * (elite ? 1.7 : 1);
  e.speed = d.speed * (0.9 + Math.random() * 0.2) * (elite ? 0.85 : 1);
  e.damage = d.damage * (1 + minute * 0.06) * (elite ? 1.5 : 1);
  e.xp = d.xp * (elite ? 10 : 1);
  e.color = d.color;
  e.elite = elite;
  return e;
}

export function makeBoss(x: number, y: number): Enemy {
  const e = base('colossus', x, y);
  e.hp = e.maxHp = 12000;
  e.r = 44;
  e.speed = 58;
  e.damage = 35;
  e.xp = 0;
  e.color = '#e85d04';
  e.boss = true;
  return e;
}

export function pickKind(minute: number): string {
  const options = Object.entries(ENEMY_DEFS).filter(([, d]) => minute >= d.from);
  // Bats fade out late game, so the swarm gets tougher instead of only bigger.
  const weights = options.map(([k, d]) => (k === 'bat' && minute > 6 ? d.weight * 0.3 : d.weight));
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return options[i][0];
  }
  return options[0][0];
}

/** A random non-bat enemy type unlocked so far, used for elites. */
export function eliteKind(minute: number): string {
  const options = Object.entries(ENEMY_DEFS).filter(([k, d]) => minute >= d.from && k !== 'bat');
  return options[Math.floor(Math.random() * options.length)][0];
}
