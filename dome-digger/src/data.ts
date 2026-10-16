/** Static game content: rock layers, ores, upgrades, gadgets, monsters, domes. */

export type Res = 'iron' | 'water' | 'crystal';
export const RES_IDS: readonly Res[] = ['iron', 'water', 'crystal'];
export type Cost = Partial<Record<Res, number>>;

export const RES: Record<Res, { name: string; icon: string; color: string }> = {
  iron: { name: 'Iron', icon: '🔩', color: '#e0a96d' },
  water: { name: 'Water', icon: '💧', color: '#4cc9f0' },
  crystal: { name: 'Crystal', icon: '💎', color: '#e056fd' },
};

export interface Layer {
  name: string;
  /** Last depth (rows below the surface) of this layer. */
  until: number;
  hp: number;
  color: string;
}

export const LAYERS: readonly Layer[] = [
  { name: 'Topsoil', until: 12, hp: 1, color: '#8a5a3a' },
  { name: 'Clay', until: 26, hp: 2.2, color: '#9a6a4a' },
  { name: 'Stone', until: 42, hp: 4, color: '#6b6670' },
  { name: 'Granite', until: 58, hp: 7, color: '#585068' },
  { name: 'Obsidian', until: 999, hp: 11, color: '#3a2f4a' },
];

export const layerAt = (depth: number): number => {
  for (let i = 0; i < LAYERS.length; i++) if (depth <= LAYERS[i].until) return i;
  return LAYERS.length - 1;
};

/** Ore codes in the map: 0 none, 1 iron, 2 water, 3 crystal, 4 gadget. */
export const ORE_RES: (Res | null)[] = [null, 'iron', 'water', 'crystal', null];
export const ORE_PIECES = [0, 2, 2, 1, 0];
export const ORE_HP = [1, 1.3, 1.25, 1.6, 1.5];

// ---------- Upgrades ----------

export type UpId = 'drill' | 'carry' | 'jet' | 'laser' | 'shield';
export const UP_IDS: readonly UpId[] = ['drill', 'carry', 'jet', 'laser', 'shield'];
export const MAX_LV = 6;

export interface UpgradeDef {
  name: string;
  icon: string;
  text: (lv: number) => string;
  /** costs[lv - 1] is the price to go from lv to lv + 1. */
  costs: Cost[];
}

export const drillPower = (lv: number): number => 1.3 * Math.pow(1.5, lv - 1);
export const carryCap = (lv: number): number => 3 + 2 * (lv - 1);
export const slowPer = (lv: number): number => 0.13 - 0.016 * (lv - 1);
export const jetThrust = (lv: number): number => 34 + 5 * (lv - 1);
export const jetMax = (lv: number): number => 4 + 0.9 * (lv - 1);
export const walkSpeed = (lv: number): number => 4.2 + 0.35 * (lv - 1);
export const laserDps = (lv: number): number => 10 * (1 + 0.55 * (lv - 1));
export const laserRot = (lv: number): number => 1.5 + 0.3 * (lv - 1);
export const shieldMax = (lv: number): number => 10 + 14 * (lv - 1);
export const shieldRegen = (lv: number): number => 2 + 1.5 * (lv - 1);

export const UPGRADES: Record<UpId, UpgradeDef> = {
  drill: {
    name: 'Drill',
    icon: '⛏️',
    text: (lv) => `Dig power ${drillPower(lv).toFixed(1)} per second`,
    costs: [{ iron: 3 }, { iron: 6, water: 1 }, { iron: 9, water: 3 }, { iron: 12, water: 4, crystal: 2 }, { iron: 16, water: 6, crystal: 4 }],
  },
  carry: {
    name: 'Cargo rack',
    icon: '🎒',
    text: (lv) => `Carry ${carryCap(lv)} items, -${Math.round(slowPer(lv) * 100)}% speed each`,
    costs: [{ iron: 2 }, { iron: 4 }, { iron: 8, water: 2 }, { iron: 10, water: 3, crystal: 1 }, { iron: 14, water: 5, crystal: 2 }],
  },
  jet: {
    name: 'Jetpack',
    icon: '🚀',
    text: (lv) => `Climb ${jetMax(lv).toFixed(1)} tiles/s, walk ${walkSpeed(lv).toFixed(1)}`,
    costs: [{ iron: 2 }, { iron: 4, water: 1 }, { iron: 7, water: 2 }, { iron: 10, water: 3, crystal: 1 }, { iron: 14, water: 4, crystal: 2 }],
  },
  laser: {
    name: 'Weapon',
    icon: '🔫',
    text: (lv) => `${Math.round(laserDps(lv))} damage per second, turn ${laserRot(lv).toFixed(1)} rad/s`,
    costs: [{ iron: 4 }, { iron: 7, water: 2 }, { iron: 10, water: 4 }, { iron: 14, water: 5, crystal: 3 }, { iron: 18, water: 7, crystal: 5 }],
  },
  shield: {
    name: 'Shield',
    icon: '🛡️',
    text: (lv) => `Shield ${shieldMax(lv)}, regen ${shieldRegen(lv).toFixed(1)}/s`,
    costs: [{ iron: 3, water: 1 }, { iron: 6, water: 2 }, { iron: 9, water: 4 }, { iron: 12, water: 5, crystal: 2 }, { iron: 15, water: 7, crystal: 4 }],
  },
};

export const REPAIR_COST: Cost = { iron: 3, water: 1 };
export const REPAIR_HP = 20;
export const DOME_HP = 100;

// ---------- Gadgets ----------

export type GadgetId = 'lift' | 'blast' | 'drone' | 'chrono' | 'strike' | 'repair' | 'converter' | 'spikes';
export const GADGET_IDS: readonly GadgetId[] = ['lift', 'blast', 'drone', 'chrono', 'strike', 'repair', 'converter', 'spikes'];

export const GADGETS: Record<GadgetId, { name: string; icon: string; text: string; cool?: number }> = {
  lift: { name: 'Lift', icon: '🛗', text: 'Button: go home at once with your cargo. Recharges in 30 s.', cool: 30 },
  blast: { name: 'Blast Charge', icon: '💣', text: 'Button: break the rock around you. Recharges in 18 s.', cool: 18 },
  drone: { name: 'Carrier Drone', icon: '🛸', text: 'Every 8 s it takes one item from your cargo home.' },
  chrono: { name: 'Chrono Anchor', icon: '⏳', text: '+15 s of mining before each wave.' },
  strike: { name: 'Orbital Strike', icon: '🛰️', text: 'Button in a wave: hit every monster hard. Once per wave.' },
  repair: { name: 'Nanobots', icon: '🔧', text: 'The dome heals 12 HP after each wave.' },
  converter: { name: 'Converter', icon: '♻️', text: 'In the workshop: trade 4 iron for 1 crystal.' },
  spikes: { name: 'Spike Ring', icon: '🌵', text: 'Monsters that touch the dome take 8 damage per second.' },
};

// ---------- Domes (meta unlocks) ----------

export type DomeId = 'laser' | 'sword' | 'turret';
export const DOME_IDS: readonly DomeId[] = ['laser', 'sword', 'turret'];

export const DOMES: Record<DomeId, { name: string; icon: string; text: string; cost: number }> = {
  laser: { name: 'Laser Dome', icon: '🔴', text: 'Aim a long beam. It hits the first monster on the line.', cost: 0 },
  sword: { name: 'Sword Dome', icon: '🗡️', text: 'A fast arm sweeps close to the dome. It hits every monster in the arc. 20% more damage.', cost: 12 },
  turret: { name: 'Turret Dome', icon: '🎯', text: 'Aims and fires by itself, also while you dig. Turns slower than the laser.', cost: 20 },
};

// ---------- Monsters ----------

export type MonKind = 'ground' | 'fly' | 'ranged' | 'dive' | 'titan' | 'queen';

export interface MonDef {
  id: string;
  name: string;
  kind: MonKind;
  hp: number;
  speed: number;
  dmg: number;
  /** Seconds between attacks. */
  rate: number;
  size: number;
  cost: number;
  from: number;
  color: string;
  text: string;
}

const mon = (d: MonDef): MonDef => d;

export const MONSTERS: Record<string, MonDef> = {
  crawler: mon({ id: 'crawler', name: 'Crawler', kind: 'ground', hp: 18, speed: 1.3, dmg: 3, rate: 1, size: 1, cost: 2, from: 1, color: '#7bd389', text: 'Walks to the dome and bites.' }),
  bat: mon({ id: 'bat', name: 'Cave Bat', kind: 'fly', hp: 10, speed: 2, dmg: 2, rate: 0.8, size: 0.8, cost: 2, from: 1, color: '#b388eb', text: 'Flies straight at the dome.' }),
  runner: mon({ id: 'runner', name: 'Runner', kind: 'ground', hp: 10, speed: 2.7, dmg: 1.5, rate: 0.7, size: 0.8, cost: 2, from: 2, color: '#f9c74f', text: 'Fast and weak.' }),
  spitter: mon({ id: 'spitter', name: 'Spitter', kind: 'ranged', hp: 22, speed: 1, dmg: 5, rate: 2.5, size: 1.1, cost: 4, from: 3, color: '#90be6d', text: 'Stops at range and spits acid.' }),
  brute: mon({ id: 'brute', name: 'Brute', kind: 'ground', hp: 70, speed: 0.7, dmg: 10, rate: 1.6, size: 1.7, cost: 7, from: 4, color: '#e76f51', text: 'Slow, tough, hits hard.' }),
  diver: mon({ id: 'diver', name: 'Diver', kind: 'dive', hp: 14, speed: 4.5, dmg: 14, rate: 0, size: 0.9, cost: 4, from: 5, color: '#ff4d6d', text: 'Dives into the dome and explodes.' }),
  hornet: mon({ id: 'hornet', name: 'Hornet', kind: 'fly', hp: 32, speed: 1.5, dmg: 4, rate: 0.9, size: 1.1, cost: 5, from: 7, color: '#ffb703', text: 'Armored flyer.' }),
  titan: mon({ id: 'titan', name: 'Rock Titan', kind: 'titan', hp: 260, speed: 0.5, dmg: 20, rate: 2, size: 3, cost: 0, from: 99, color: '#a68a64', text: 'Boss of waves 5 and 10.' }),
  queen: mon({ id: 'queen', name: 'Hive Queen', kind: 'queen', hp: 420, speed: 0.8, dmg: 7, rate: 3, size: 3.2, cost: 0, from: 99, color: '#c9184a', text: 'Final boss. Hovers, spits and calls bats.' }),
};

export const WAVES = 15;
export const BOSS_WAVES: Record<number, string> = { 5: 'titan', 10: 'titan', 15: 'queen' };
