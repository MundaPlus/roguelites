/** Player stats. Items, loadouts and hub upgrades change them. */
export interface Stats {
  maxHp: number; // half hearts
  damage: number;
  dmgMult: number;
  fireRate: number; // shots per second
  shotSpeed: number;
  range: number; // travel distance in px
  shotSize: number;
  speed: number;
  luck: number;
  multishot: number; // extra projectiles per volley
  spread: number; // radians between projectiles
  pierce: number;
  bounce: number;
  homing: number; // turn rate in rad/s
  split: number; // fragments on hit
  explode: number; // explosion radius, 0 = none
  chain: number; // lightning jumps
  burn: number; // burn damage as a fraction of hit damage
  slow: number; // slow duration in s
  crit: number; // chance 0..1
  critMult: number;
  knockback: number;
  wave: boolean;
  boomerang: boolean;
  rearShot: boolean;
  orbitals: number;
  drones: number;
  shield: boolean; // blocks one hit per room
  staticField: boolean; // shockwave when hit
  aura: number; // damage per second to close enemies
  magnet: boolean;
  killHeal: number; // chance to drop half a heart on kill
  dodgeCd: number;
  clusterSplit: boolean; // split fragments also explode
  napalm: boolean; // explosions burn
  shotColor: string;
}

export const baseStats = (): Stats => ({
  maxHp: 6,
  damage: 3.5,
  dmgMult: 1,
  fireRate: 2.8,
  shotSpeed: 460,
  range: 300,
  shotSize: 6,
  speed: 200,
  luck: 0,
  multishot: 0,
  spread: 0.16,
  pierce: 0,
  bounce: 0,
  homing: 0,
  split: 0,
  explode: 0,
  chain: 0,
  burn: 0,
  slow: 0,
  crit: 0.03,
  critMult: 2.5,
  knockback: 60,
  wave: false,
  boomerang: false,
  rearShot: false,
  orbitals: 0,
  drones: 0,
  shield: false,
  staticField: false,
  aura: 0,
  magnet: false,
  killHeal: 0,
  dodgeCd: 0.8,
  clusterSplit: false,
  napalm: false,
  shotColor: '#3df2ff',
});

export type PickupKind = 'coin' | 'heart' | 'halfHeart' | 'bomb' | 'shard';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

export interface Pedestal {
  item: string;
  x: number;
  y: number;
  price: number; // 0 = free
  taken: boolean;
}

/** Shop goods that are not items. */
export interface Ware {
  kind: 'heart' | 'bomb';
  x: number;
  y: number;
  price: number;
  taken: boolean;
}
