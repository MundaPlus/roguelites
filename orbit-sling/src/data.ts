/** Static game content: shot types, upgrades, launchers, sectors, events. */

export type ShotId = 'std' | 'split' | 'heavy' | 'phase' | 'boomer' | 'seeker';

export interface ShotDef {
  id: ShotId;
  name: string;
  icon: string;
  color: string;
  text: string;
  /** Price of a pack of 2 in the shop. 0 = not sold. */
  price: number;
}

export const SHOTS: Record<ShotId, ShotDef> = {
  std: { id: 'std', name: 'Slug', icon: '⚪', color: '#9ad1ff', text: 'A plain shot. You always have it.', price: 0 },
  split: { id: 'split', name: 'Split', icon: '✳️', color: '#ffd166', text: 'Splits into 3 after half a second.', price: 22 },
  heavy: { id: 'heavy', name: 'Heavy', icon: '🌑', color: '#ff8c42', text: 'Gravity pulls it 60% harder. Smashes asteroids and shields.', price: 26 },
  phase: { id: 'phase', name: 'Phase', icon: '👻', color: '#b388ff', text: 'Passes through the first planet or moon it touches.', price: 26 },
  boomer: { id: 'boomer', name: 'Boomerang', icon: '🪃', color: '#4ce0b3', text: 'Curves back to the launcher. Catch it and the system shot comes back.', price: 30 },
  seeker: { id: 'seeker', name: 'Seeker', icon: '🎯', color: '#ff5d8f', text: 'Steers a little toward the closest target.', price: 32 },
};

export const SPECIALS: ShotId[] = ['split', 'heavy', 'phase', 'boomer', 'seeker'];

export type UpgId = 'sight' | 'coil' | 'magnet' | 'extra' | 'salvage' | 'plating' | 'trick';

export interface UpgDef {
  id: UpgId;
  name: string;
  icon: string;
  text: string;
  max: number;
  price: number;
}

export const UPGRADES: Record<UpgId, UpgDef> = {
  sight: { id: 'sight', name: 'Long Sight', icon: '🔭', text: 'The aim line is 40% longer.', max: 3, price: 34 },
  coil: { id: 'coil', name: 'Power Coil', icon: '⚡', text: 'Max launch power +12%.', max: 2, price: 30 },
  magnet: { id: 'magnet', name: 'Target Magnet', icon: '🧲', text: 'Targets are 3 px easier to hit.', max: 2, price: 40 },
  extra: { id: 'extra', name: 'Spare Rack', icon: '📦', text: '+1 shot in every system.', max: 2, price: 55 },
  salvage: { id: 'salvage', name: 'Salvage Drone', icon: '🛰️', text: '+20% credits from shots.', max: 2, price: 38 },
  plating: { id: 'plating', name: 'Hull Plating', icon: '🛡️', text: '+1 max hull and repair 1 hull.', max: 2, price: 48 },
  trick: { id: 'trick', name: 'Trick Computer', icon: '🧠', text: 'Bank and orbit bonuses ×1.5.', max: 1, price: 42 },
};

export type LauncherId = 'mk1' | 'longeye' | 'scatter' | 'anchor' | 'phantom' | 'hunter';

export interface LauncherDef {
  id: LauncherId;
  name: string;
  icon: string;
  text: string;
  /** Stardust cost to unlock. 0 = free. */
  cost: number;
  ammo: Partial<Record<ShotId, number>>;
  upgrades: Partial<Record<UpgId, number>>;
  hull: number;
  /** Number of pieces of a split shot. */
  splitN: number;
  /** Planets a phase shot can pass through. */
  phaseN: number;
}

export const LAUNCHERS: Record<LauncherId, LauncherDef> = {
  mk1: { id: 'mk1', name: 'Sling Mk I', icon: '🚀', text: 'Balanced. Starts with 1 split and 1 heavy.', cost: 0, ammo: { split: 1, heavy: 1 }, upgrades: {}, hull: 3, splitN: 3, phaseN: 1 },
  longeye: { id: 'longeye', name: 'Longeye', icon: '🔭', text: 'Starts with Long Sight ×2 and 1 phase.', cost: 30, ammo: { phase: 1 }, upgrades: { sight: 2 }, hull: 3, splitN: 3, phaseN: 1 },
  scatter: { id: 'scatter', name: 'Scatter Rig', icon: '✳️', text: 'Starts with 4 splits. Splits make 5 pieces.', cost: 45, ammo: { split: 4 }, upgrades: {}, hull: 3, splitN: 5, phaseN: 1 },
  anchor: { id: 'anchor', name: 'Gravity Anchor', icon: '⚓', text: 'Starts with 3 heavy shots and +1 hull.', cost: 55, ammo: { heavy: 3 }, upgrades: {}, hull: 4, splitN: 3, phaseN: 1 },
  phantom: { id: 'phantom', name: 'Phantom Drive', icon: '👻', text: 'Starts with 3 phase and 2 boomerangs. Phase passes 2 planets.', cost: 70, ammo: { phase: 3, boomer: 2 }, upgrades: {}, hull: 3, splitN: 3, phaseN: 2 },
  hunter: { id: 'hunter', name: 'Hunter Bay', icon: '🎯', text: 'Starts with 3 seekers and a Target Magnet.', cost: 90, ammo: { seeker: 3 }, upgrades: { magnet: 1 }, hull: 3, splitN: 3, phaseN: 1 },
};

export const LAUNCHER_ORDER: LauncherId[] = ['mk1', 'longeye', 'scatter', 'anchor', 'phantom', 'hunter'];

export interface SectorDef {
  name: string;
  icon: string;
  hue: number;
  boss: string;
  bossText: string;
  text: string;
}

export const SECTORS: SectorDef[] = [
  { name: 'Cradle Belt', icon: '🌍', hue: 220, boss: 'The Sentinel', bossText: 'A core behind a turning shield.', text: 'Calm planets and a few rocks.' },
  { name: 'Ion Reach', icon: '🌙', hue: 190, boss: 'Twin Wardens', bossText: 'Two shielded cores among moons.', text: 'Moons and shield walls.' },
  { name: 'Rubble Drift', icon: '☄️', hue: 30, boss: 'The Hive', bossText: 'A core inside a ring of rocks.', text: 'Asteroid fields and repulsor stars.' },
  { name: 'Event Horizon', icon: '🕳️', hue: 280, boss: 'The Maw', bossText: 'A core on the lip of a black hole.', text: 'Black holes bend everything.' },
  { name: 'Crown Nebula', icon: '👑', hue: 330, boss: 'The Crown', bossText: 'A core with two shields and guard moons.', text: 'Everything at once.' },
];

export type NodeKind = 'system' | 'hard' | 'shop' | 'station' | 'anomaly' | 'boss';

export const NODE_INFO: Record<NodeKind, { icon: string; name: string; text: string }> = {
  system: { icon: '🪐', name: 'System', text: 'Hit every target.' },
  hard: { icon: '🔥', name: 'Hard system', text: 'More targets, fewer spare shots, ×1.5 credits.' },
  shop: { icon: '🛒', name: 'Trade post', text: 'Buy shots and launcher upgrades.' },
  station: { icon: '🔧', name: 'Station', text: 'Repair the hull or refit.' },
  anomaly: { icon: '❓', name: 'Anomaly', text: 'Something strange on the scanner.' },
  boss: { icon: '💀', name: 'Boss system', text: 'Destroy the core to leave the sector.' },
};

/** The map plan of every sector: the options at each step. */
export const PLAN: NodeKind[][] = [['system'], ['system', 'hard'], ['shop', 'anomaly'], ['system', 'hard'], ['shop', 'station'], ['boss']];

export interface EventOpt {
  label: string;
  /** Effect id handled in run.ts. */
  fx: string;
  cost?: number;
  hull?: number;
}

export interface EventDef {
  id: string;
  icon: string;
  title: string;
  text: string;
  options: EventOpt[];
}

export const EVENTS: EventDef[] = [
  {
    id: 'probe',
    icon: '🛸',
    title: 'Derelict Probe',
    text: 'An old probe drifts past. Its cargo bay is still sealed.',
    options: [
      { label: 'Strip it for parts (+30 credits)', fx: 'credits30' },
      { label: 'Open the cargo bay (+2 random special shots)', fx: 'ammo2' },
    ],
  },
  {
    id: 'flare',
    icon: '☀️',
    title: 'Solar Flare',
    text: 'A star throws out a flare. You can surf it for a bounty, but it burns the hull.',
    options: [
      { label: 'Surf the flare (−1 hull, +70 credits)', fx: 'flare', hull: 1 },
      { label: 'Wait it out', fx: 'none' },
    ],
  },
  {
    id: 'trader',
    icon: '🧑‍🚀',
    title: 'Wandering Trader',
    text: 'A trader offers a used part for your launcher.',
    options: [
      { label: 'Buy a random upgrade (35 credits)', fx: 'upgrade', cost: 35 },
      { label: 'Trade 1 hull for a random upgrade', fx: 'upgrade', hull: 1 },
      { label: 'Fly on', fx: 'none' },
    ],
  },
  {
    id: 'comet',
    icon: '☄️',
    title: 'Comet Tail',
    text: 'The comet tail is full of ice you can shape into shots.',
    options: [
      { label: 'Harvest it (+2 split, +1 heavy)', fx: 'comet' },
      { label: 'Sell the ice (+25 credits)', fx: 'credits25' },
    ],
  },
  {
    id: 'beacon',
    icon: '🆘',
    title: 'Distress Beacon',
    text: 'A crew is stuck on a dead moon. They can fix your hull if you take them home.',
    options: [
      { label: 'Rescue them (repair 1 hull, +1 phase)', fx: 'rescue' },
      { label: 'Report it for a reward (+20 credits)', fx: 'credits20' },
    ],
  },
  {
    id: 'rift',
    icon: '🌀',
    title: 'Gravity Rift',
    text: 'A rift folds space. Something valuable floats inside.',
    options: [
      { label: 'Reach in (−1 hull, then a gamble: a hull plate or 3 shots)', fx: 'rift', hull: 1 },
      { label: 'Leave it alone', fx: 'none' },
    ],
  },
];
