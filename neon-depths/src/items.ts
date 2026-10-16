import type { Stats } from './types';

export type Rarity = 'common' | 'rare' | 'legendary';
export type Pool = 'treasure' | 'shop' | 'boss';

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  rarity: Rarity;
  pools: Pool[];
  /** Stackable items can show up again after you take them. */
  stack?: boolean;
  apply(s: Stats): void;
}

const T: Pool[] = ['treasure', 'shop'];
const TB: Pool[] = ['treasure', 'shop', 'boss'];
const B: Pool[] = ['boss'];

export const ITEMS: ItemDef[] = [
  // Stat items
  { id: 'overclock', name: 'Overclock', icon: '🔺', desc: '+1 damage', rarity: 'common', pools: T, stack: true, apply: (s) => (s.damage += 1) },
  { id: 'capacitor', name: 'Capacitor', icon: '⚡', desc: '+20% fire rate', rarity: 'common', pools: T, stack: true, apply: (s) => (s.fireRate *= 1.2) },
  { id: 'rail', name: 'Rail Barrel', icon: '🚄', desc: '+25% shot speed, +20% range', rarity: 'common', pools: T, apply: (s) => ((s.shotSpeed *= 1.25), (s.range *= 1.2)) },
  { id: 'scope', name: 'Long Scope', icon: '🔭', desc: '+35% range, +5% crit chance', rarity: 'common', pools: T, apply: (s) => ((s.range *= 1.35), (s.crit += 0.05)) },
  { id: 'servos', name: 'Leg Servos', icon: '🦿', desc: '+12% move speed', rarity: 'common', pools: T, stack: true, apply: (s) => (s.speed *= 1.12) },
  { id: 'heartcore', name: 'Heart Core', icon: '💗', desc: '+1 heart container', rarity: 'common', pools: TB, stack: true, apply: (s) => (s.maxHp += 2) },
  { id: 'bloat', name: 'Plasma Bloat', icon: '🫧', desc: 'Bigger shots, +15% damage', rarity: 'common', pools: T, apply: (s) => ((s.shotSize *= 1.6), (s.dmgMult *= 1.15)) },
  { id: 'luckychip', name: 'Lucky Chip', icon: '🍀', desc: '+1 luck: more drops, +3% crit', rarity: 'common', pools: T, stack: true, apply: (s) => ((s.luck += 1), (s.crit += 0.03)) },
  { id: 'magnet', name: 'Magnet Coil', icon: '🧲', desc: 'Pickups fly to you', rarity: 'common', pools: T, apply: (s) => (s.magnet = true) },
  { id: 'blink', name: 'Blink Boots', icon: '👟', desc: 'Dodge cooldown -40%, +5% speed', rarity: 'common', pools: T, apply: (s) => ((s.dodgeCd *= 0.6), (s.speed *= 1.05)) },
  { id: 'leech', name: 'Leech Module', icon: '🩸', desc: 'Kills can drop half hearts', rarity: 'common', pools: T, apply: (s) => (s.killHeal += 0.06) },
  // Shot modifiers
  { id: 'phase', name: 'Phase Rounds', icon: '👻', desc: 'Shots pierce 2 enemies', rarity: 'rare', pools: TB, apply: (s) => (s.pierce += 2) },
  { id: 'seeker', name: 'Seeker Chip', icon: '🎯', desc: 'Shots home in on enemies', rarity: 'rare', pools: TB, apply: (s) => ((s.homing += 4), (s.shotColor = '#c77dff')) },
  { id: 'fractal', name: 'Fractal Shot', icon: '❄️', desc: 'Shots split into 2 fragments on hit', rarity: 'rare', pools: TB, apply: (s) => (s.split += 2) },
  { id: 'ricochet', name: 'Ricochet', icon: '🏓', desc: 'Shots bounce off walls twice', rarity: 'common', pools: T, apply: (s) => ((s.bounce += 2), (s.range *= 1.2)) },
  { id: 'payload', name: 'Payload', icon: '💥', desc: 'Shots explode on hit', rarity: 'rare', pools: TB, apply: (s) => ((s.explode = Math.max(s.explode, 42) + 8), (s.shotColor = '#ff5e5b')) },
  { id: 'arc', name: 'Arc Coil', icon: '🌩️', desc: 'Hits chain lightning to 2 enemies', rarity: 'rare', pools: TB, apply: (s) => ((s.chain += 2), (s.shotColor = '#ffee32')) },
  { id: 'thermite', name: 'Thermite', icon: '🔥', desc: 'Shots set enemies on fire', rarity: 'common', pools: T, apply: (s) => ((s.burn += 0.8), (s.shotColor = '#ff9f1c')) },
  { id: 'cryo', name: 'Cryo Rounds', icon: '🧊', desc: 'Shots slow enemies', rarity: 'common', pools: T, apply: (s) => ((s.slow += 1.5), (s.shotColor = '#8ecae6')) },
  { id: 'twin', name: 'Twin Barrel', icon: '✌️', desc: '+1 shot, -10% damage', rarity: 'rare', pools: TB, apply: (s) => ((s.multishot += 1), (s.dmgMult *= 0.9)) },
  { id: 'spread', name: 'Spread Array', icon: '🔱', desc: '+2 shots, -25% damage', rarity: 'rare', pools: TB, apply: (s) => ((s.multishot += 2), (s.dmgMult *= 0.75), (s.spread += 0.06)) },
  { id: 'sine', name: 'Sine Driver', icon: '〰️', desc: 'Shots weave, +15% damage', rarity: 'common', pools: T, apply: (s) => ((s.wave = true), (s.dmgMult *= 1.15)) },
  { id: 'loop', name: 'Return Loop', icon: '🪃', desc: 'Shots fly back and pierce', rarity: 'rare', pools: TB, apply: (s) => ((s.boomerang = true), (s.pierce += 1)) },
  { id: 'rear', name: 'Rear Guard', icon: '🔙', desc: 'Also fire a shot backward', rarity: 'common', pools: T, apply: (s) => (s.rearShot = true) },
  { id: 'kinetic', name: 'Kinetic Rounds', icon: '🥊', desc: 'Strong knockback, +20% damage', rarity: 'common', pools: T, apply: (s) => ((s.knockback += 140), (s.dmgMult *= 1.2)) },
  { id: 'lens', name: 'Glass Lens', icon: '🔍', desc: '+15% crit chance', rarity: 'rare', pools: TB, apply: (s) => (s.crit += 0.15) },
  // Helpers and defense
  { id: 'satellite', name: 'Satellite', icon: '🛰️', desc: 'An orbiting drone blocks bullets', rarity: 'rare', pools: TB, stack: true, apply: (s) => (s.orbitals += 1) },
  { id: 'gundrone', name: 'Gun Drone', icon: '🤖', desc: 'A drone shoots at enemies', rarity: 'rare', pools: TB, stack: true, apply: (s) => (s.drones += 1) },
  { id: 'aegis', name: 'Aegis Cell', icon: '🛡️', desc: 'Block 1 hit in every room', rarity: 'rare', pools: TB, apply: (s) => (s.shield = true) },
  { id: 'static', name: 'Static Field', icon: '🌀', desc: 'When hit, a shockwave clears bullets', rarity: 'rare', pools: TB, apply: (s) => (s.staticField = true) },
  // Boss items
  { id: 'halo', name: 'Neon Halo', icon: '😇', desc: '+50% damage, homing, burning aura', rarity: 'legendary', pools: B, apply: (s) => ((s.dmgMult *= 1.5), (s.homing += 3), (s.aura += 12), (s.shotColor = '#fff3b0')) },
  { id: 'lance', name: 'Prism Lance', icon: '🔆', desc: 'Fast shots pierce everything', rarity: 'legendary', pools: B, apply: (s) => ((s.pierce += 99), (s.shotSpeed *= 1.6), (s.range *= 1.4), (s.fireRate *= 0.85), (s.shotColor = '#ffffff')) },
  { id: 'glass', name: 'Glass Cannon', icon: '🍷', desc: 'Damage x2, -1 heart container', rarity: 'legendary', pools: B, apply: (s) => ((s.dmgMult *= 2), (s.maxHp = Math.max(2, s.maxHp - 2))) },
  { id: 'hive', name: 'Hive Mind', icon: '🐝', desc: '+2 satellites, +1 gun drone', rarity: 'legendary', pools: B, apply: (s) => ((s.orbitals += 2), (s.drones += 1)) },
  { id: 'overdrive', name: 'Overdrive Core', icon: '🚀', desc: '+60% fire rate, +10% speed', rarity: 'legendary', pools: B, apply: (s) => ((s.fireRate *= 1.6), (s.speed *= 1.1)) },
  { id: 'quantum', name: 'Quantum Split', icon: '⚛️', desc: 'Shots pierce and split into 3', rarity: 'legendary', pools: B, apply: (s) => ((s.split += 3), (s.pierce += 1)) },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export interface Synergy {
  id: string;
  name: string;
  desc: string;
  needs: [string[], string[]]; // one id from each list
  apply(s: Stats): void;
}

export const SYNERGIES: Synergy[] = [
  { id: 'ghost', name: 'Ghost Swarm', desc: 'Homing + pierce: +20% damage', needs: [['seeker', 'halo'], ['phase', 'lance', 'loop']], apply: (s) => (s.dmgMult *= 1.2) },
  { id: 'cluster', name: 'Cluster Bombs', desc: 'Fragments explode too', needs: [['payload'], ['fractal', 'quantum']], apply: (s) => (s.clusterSplit = true) },
  { id: 'supercon', name: 'Superconductor', desc: 'Lightning jumps 2 more times', needs: [['arc'], ['cryo']], apply: (s) => (s.chain += 2) },
  { id: 'napalm', name: 'Napalm', desc: 'Explosions burn, +30% radius', needs: [['payload'], ['thermite']], apply: (s) => ((s.napalm = true), (s.explode *= 1.3)) },
  { id: 'barrage', name: 'Missile Barrage', desc: 'Multishot + homing: +15% fire rate', needs: [['twin', 'spread'], ['seeker', 'halo']], apply: (s) => (s.fireRate *= 1.15) },
  { id: 'pinball', name: 'Pinball', desc: '+3 bounces, +10% damage', needs: [['ricochet'], ['loop', 'sine']], apply: (s) => ((s.bounce += 3), (s.dmgMult *= 1.1)) },
  { id: 'fortress', name: 'Fortress', desc: '+1 satellite', needs: [['satellite', 'hive'], ['aegis', 'static']], apply: (s) => (s.orbitals += 1) },
  { id: 'sniper', name: 'Sniper', desc: 'Crits deal x3.5 damage', needs: [['lens'], ['scope', 'rail']], apply: (s) => (s.critMult = 3.5) },
];

export function activeSynergies(items: string[]): Synergy[] {
  const has = new Set(items);
  return SYNERGIES.filter((y) => y.needs[0].some((i) => has.has(i)) && y.needs[1].some((i) => has.has(i)));
}

export const ITEM_PRICE: Record<Rarity, number> = { common: 12, rare: 18, legendary: 30 };
