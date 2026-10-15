export const TAU = Math.PI * 2;

export interface Stats {
  maxHp: number;
  speed: number;
  might: number;
  cooldown: number;
  area: number;
  amount: number;
  magnet: number;
  regen: number;
  armor: number;
  growth: number;
  greed: number;
  duration: number;
}

export interface Enemy {
  id: number;
  kind: string;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  xp: number;
  color: string;
  flash: number;
  kx: number;
  ky: number;
  slowT: number;
  dead: boolean;
  elite: boolean;
  boss: boolean;
  wobble: number;
  // Boss AI state.
  aiT: number;
  dashT: number;
  summonT: number;
  dx: number;
  dy: number;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  pierce: number;
  life: number;
  color: string;
  knock: number;
  hits: Set<number>;
}

export type PickupKind = 'gem' | 'coin' | 'heal' | 'magnet' | 'chest';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  value: number;
  pulled: boolean;
  v: number;
  t: number;
  taken: boolean;
}

export interface Zone {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  damage: number;
  tick: number;
  timer: number;
  color: string;
}

export type Effect =
  | { kind: 'slash'; x: number; y: number; dir: number; range: number; height: number; life: number; maxLife: number; color: string }
  | { kind: 'bolt'; pts: number[]; life: number; maxLife: number; color: string }
  | { kind: 'ring'; x: number; y: number; r: number; life: number; maxLife: number; color: string };

export interface FloatText {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
  size: number;
}
