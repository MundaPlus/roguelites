/** Static game data: moves with frame data, fighters, opponents, stages, techniques. */

/** Box relative to the fighter: [forward offset, height above the feet, width, height]. */
export type BoxDef = [number, number, number, number];
export type Level = 'mid' | 'low' | 'high' | 'throw';
export type Slot = 'n' | 'f' | 'b' | 'd';
export type Limb = 'fist' | 'foot' | 'both' | 'body';

export interface ProjDef {
  speed: number;
  dmg: number;
  hits: number;
  hitstun: number;
  blockstun: number;
  chip: number;
  w: number;
  h: number;
  /** Height of the bottom edge above the ground. */
  y: number;
  level: Level;
  kd?: boolean;
  life: number;
  color: string;
  kind: 'orb' | 'blade' | 'wave' | 'big' | 'beam';
}

export interface MoveDef {
  id: string;
  name: string;
  /** 1 light, 2 heavy, 3 special, 4 super. A move cancels into a higher tier on contact. */
  tier: 1 | 2 | 3 | 4;
  startup: number;
  active: number;
  recovery: number;
  dmg: number;
  hitstun: number;
  blockstun: number;
  level: Level;
  box: BoxDef;
  limb: Limb;
  push?: number;
  kd?: boolean;
  chip?: number;
  /** Number of hits spread over the active frames. */
  hits?: number;
  /** Forward speed between two move frames. */
  dash?: { from: number; to: number; vx: number };
  /** The fighter leaves the ground on this frame. */
  jump?: { at: number; vy: number; vx: number };
  /** Invulnerable on these move frames (inclusive, 1-based). */
  invul?: [number, number];
  /** Ignores projectiles while active. */
  projInv?: boolean;
  /** Replaces the body hurtbox during the move. */
  body?: BoxDef;
  /** Air normal: can only start in the air, ends on landing. */
  air?: boolean;
  /** Counter stance: an attack that touches the fighter in the active frames is countered. */
  parry?: boolean;
  proj?: ProjDef;
  /** Throws that cannot be teched. */
  noTech?: boolean;
  /** Crouching move: uses the crouch hurtbox. */
  crouch?: boolean;
}

const m = (d: MoveDef): MoveDef => d;

export const NORMALS: Record<string, MoveDef> = {
  L: m({ id: 'L', name: 'Jab', tier: 1, startup: 4, active: 3, recovery: 7, dmg: 4, hitstun: 14, blockstun: 10, level: 'mid', box: [8, 66, 40, 16], push: 3, limb: 'fist' }),
  H: m({ id: 'H', name: 'Straight', tier: 2, startup: 8, active: 4, recovery: 17, dmg: 9, hitstun: 19, blockstun: 14, level: 'mid', box: [8, 60, 58, 20], push: 5, limb: 'fist' }),
  cL: m({ id: 'cL', name: 'Low Kick', tier: 1, startup: 5, active: 3, recovery: 8, dmg: 3, hitstun: 13, blockstun: 9, level: 'low', box: [8, 2, 46, 16], push: 3, limb: 'foot', crouch: true }),
  cH: m({ id: 'cH', name: 'Sweep', tier: 2, startup: 9, active: 4, recovery: 22, dmg: 8, hitstun: 0, blockstun: 12, level: 'low', box: [6, 0, 72, 14], push: 4, kd: true, limb: 'foot', crouch: true }),
  jL: m({ id: 'jL', name: 'Air Knee', tier: 1, startup: 4, active: 8, recovery: 4, dmg: 5, hitstun: 14, blockstun: 10, level: 'high', box: [4, 14, 34, 28], limb: 'foot', air: true }),
  jH: m({ id: 'jH', name: 'Jump Kick', tier: 2, startup: 7, active: 6, recovery: 6, dmg: 9, hitstun: 18, blockstun: 12, level: 'high', box: [6, -10, 48, 34], limb: 'foot', air: true }),
  T: m({ id: 'T', name: 'Throw', tier: 1, startup: 5, active: 2, recovery: 22, dmg: 12, hitstun: 0, blockstun: 0, level: 'throw', box: [6, 10, 34, 70], limb: 'both', kd: true }),
};

export interface SpecialDef extends MoveDef {
  slot: Slot;
  icon: string;
  text: string;
}

const sp = (d: SpecialDef): SpecialDef => d;

export const SPECIALS: Record<string, SpecialDef> = {
  fireball: sp({
    id: 'fireball', name: 'Ki Blast', icon: '🔵', slot: 'n', text: 'A slow energy ball. Zones and chips.',
    tier: 3, startup: 12, active: 2, recovery: 26, dmg: 0, hitstun: 0, blockstun: 0, level: 'mid', box: [0, 0, 0, 0], limb: 'both',
    proj: { speed: 5, dmg: 8, hits: 1, hitstun: 18, blockstun: 14, chip: 2, w: 26, h: 24, y: 58, level: 'mid', life: 130, color: '#5ad1ff', kind: 'orb' },
  }),
  sonic: sp({
    id: 'sonic', name: 'Wind Blade', icon: '🌀', slot: 'n', text: 'A fast, weak blade. Short recovery.',
    tier: 3, startup: 9, active: 2, recovery: 21, dmg: 0, hitstun: 0, blockstun: 0, level: 'mid', box: [0, 0, 0, 0], limb: 'fist',
    proj: { speed: 8, dmg: 6, hits: 1, hitstun: 16, blockstun: 12, chip: 1, w: 32, h: 14, y: 64, level: 'mid', life: 90, color: '#b8f2e6', kind: 'blade' },
  }),
  quake: sp({
    id: 'quake', name: 'Earth Wave', icon: '🌋', slot: 'd', text: 'A low shock wave on the ground. Block it low.',
    tier: 3, startup: 14, active: 2, recovery: 24, dmg: 0, hitstun: 0, blockstun: 0, level: 'low', box: [0, 0, 0, 0], limb: 'fist',
    proj: { speed: 4.2, dmg: 8, hits: 1, hitstun: 0, blockstun: 12, chip: 2, w: 30, h: 18, y: 0, level: 'low', kd: true, life: 100, color: '#e0a458', kind: 'wave' },
  }),
  lariat: sp({
    id: 'lariat', name: 'Iron Lariat', icon: '🌪️', slot: 'n', text: 'Spinning arms hit both sides. Passes through projectiles.',
    tier: 3, startup: 8, active: 20, recovery: 16, dmg: 6, hits: 2, hitstun: 18, blockstun: 12, chip: 1, level: 'mid', box: [-34, 52, 96, 30], limb: 'body', projInv: true, push: 4,
    dash: { from: 8, to: 28, vx: 1.6 },
  }),
  flipkick: sp({
    id: 'flipkick', name: 'Falling Crescent', icon: '🌙', slot: 'n', text: 'A hop into a kick from above. Hits high: crouch block fails.',
    tier: 3, startup: 17, active: 5, recovery: 12, dmg: 9, hitstun: 19, blockstun: 12, level: 'high', box: [4, -30, 46, 52], limb: 'foot', push: 4,
    jump: { at: 6, vy: 7, vx: 3 },
  }),
  dashpunch: sp({
    id: 'dashpunch', name: 'Tiger Rush', icon: '🐯', slot: 'f', text: 'A fast dash into a punch. Unsafe on block.',
    tier: 3, startup: 10, active: 5, recovery: 18, dmg: 10, hitstun: 20, blockstun: 13, chip: 1, level: 'mid', box: [6, 60, 46, 20], limb: 'fist', push: 6,
    dash: { from: 3, to: 15, vx: 7 },
  }),
  grab: sp({
    id: 'grab', name: 'Bear Hug', icon: '🐻', slot: 'f', text: 'A long command grab. Beats block, cannot be teched.',
    tier: 3, startup: 6, active: 3, recovery: 32, dmg: 18, hitstun: 0, blockstun: 0, level: 'throw', box: [6, 10, 52, 70], limb: 'both', kd: true, noTech: true,
  }),
  palm: sp({
    id: 'palm', name: 'Thunder Palm', icon: '⚡', slot: 'f', text: 'A heavy palm strike that pushes far and chips hard.',
    tier: 3, startup: 13, active: 4, recovery: 20, dmg: 13, hitstun: 22, blockstun: 16, chip: 3, level: 'mid', box: [6, 48, 52, 36], limb: 'both', push: 12,
    dash: { from: 5, to: 16, vx: 2 },
  }),
  spinkick: sp({
    id: 'spinkick', name: 'Whirlwind Kick', icon: '🌀', slot: 'b', text: 'Three spinning kicks that travel. Jumps over low hits.',
    tier: 3, startup: 8, active: 21, recovery: 14, dmg: 4, hits: 3, hitstun: 17, blockstun: 10, chip: 1, level: 'mid', box: [-10, 46, 72, 22], limb: 'foot', push: 3,
    body: [-16, 34, 32, 70], dash: { from: 6, to: 29, vx: 4 },
  }),
  parry: sp({
    id: 'parry', name: 'Mirror Stance', icon: '🪞', slot: 'b', text: 'A counter stance. An attack that touches you is countered for 14.',
    tier: 3, startup: 3, active: 20, recovery: 14, dmg: 14, hitstun: 0, blockstun: 0, level: 'mid', box: [0, 0, 0, 0], limb: 'both', parry: true, kd: true,
  }),
  uppercut: sp({
    id: 'uppercut', name: 'Rising Dragon', icon: '🐉', slot: 'd', text: 'An invincible rising punch. The best anti-air. Very unsafe.',
    tier: 3, startup: 3, active: 10, recovery: 26, dmg: 12, hitstun: 0, blockstun: 14, level: 'mid', box: [2, 30, 36, 92], limb: 'fist', kd: true, invul: [1, 8],
    jump: { at: 3, vy: 9, vx: 1.2 },
  }),
  slide: sp({
    id: 'slide', name: 'Serpent Slide', icon: '🐍', slot: 'd', text: 'A low slide under projectiles. Knocks down.',
    tier: 3, startup: 7, active: 14, recovery: 16, dmg: 8, hitstun: 0, blockstun: 12, level: 'low', box: [10, 0, 46, 18], limb: 'foot', kd: true,
    body: [-26, 0, 52, 34], dash: { from: 5, to: 20, vx: 6.5 }, crouch: true,
  }),
};
export const SPECIAL_IDS = Object.keys(SPECIALS);

export const SUPERS: Record<string, MoveDef> = {
  shinku: m({
    id: 'shinku', name: 'Shinku Blast', tier: 4, startup: 6, active: 2, recovery: 30, dmg: 0, hitstun: 0, blockstun: 0, level: 'mid', box: [0, 0, 0, 0], limb: 'both', invul: [1, 10],
    proj: { speed: 6, dmg: 6, hits: 5, hitstun: 22, blockstun: 14, chip: 2, w: 46, h: 44, y: 46, level: 'mid', life: 150, color: '#8be9ff', kind: 'big' },
  }),
  blossom: m({
    id: 'blossom', name: 'Thousand Blossoms', tier: 4, startup: 5, active: 30, recovery: 22, dmg: 5, hits: 6, hitstun: 22, blockstun: 10, chip: 1, level: 'mid', box: [4, 30, 52, 60], limb: 'both', invul: [1, 8], push: 1,
    dash: { from: 2, to: 32, vx: 8 },
  }),
  mountain: m({
    id: 'mountain', name: 'Mountain Drop', tier: 4, startup: 3, active: 5, recovery: 30, dmg: 34, hitstun: 0, blockstun: 0, level: 'throw', box: [6, 0, 74, 92], limb: 'both', invul: [1, 6], kd: true, noTech: true,
  }),
  beam: m({
    id: 'beam', name: 'Storm Beam', tier: 4, startup: 10, active: 2, recovery: 34, dmg: 0, hitstun: 0, blockstun: 0, level: 'mid', box: [0, 0, 0, 0], limb: 'both', invul: [1, 12],
    proj: { speed: 11, dmg: 7, hits: 4, hitstun: 22, blockstun: 14, chip: 2, w: 64, h: 30, y: 56, level: 'mid', life: 80, color: '#c3f73a', kind: 'beam' },
  }),
  demon: m({
    id: 'demon', name: 'Raging Demon', tier: 4, startup: 12, active: 10, recovery: 30, dmg: 38, hitstun: 0, blockstun: 0, level: 'throw', box: [6, 0, 42, 92], limb: 'both', invul: [1, 14], kd: true, noTech: true,
    dash: { from: 1, to: 22, vx: 6 },
  }),
};

export interface FighterDef {
  id: string;
  name: string;
  icon: string;
  title: string;
  text: string;
  hp: number;
  walk: number;
  dmg: number;
  /** Damage multiplier for throws. */
  throwDmg: number;
  size: number;
  gi: string;
  belt: string;
  skin: string;
  hair: string;
  specials: Partial<Record<Slot, string>>;
  super: string;
  /** Honor cost to unlock. 0 = free. -1 = unlocked by winning a run. */
  cost: number;
}

export const FIGHTERS: Record<string, FighterDef> = {
  kai: {
    id: 'kai', name: 'Kai', icon: '🥋', title: 'Balanced', text: 'Ki Blast, Rising Dragon, Whirlwind Kick. Good at every range.',
    hp: 105, walk: 1, dmg: 1, throwDmg: 1, size: 1, gi: '#f4f1e8', belt: '#d62828', skin: '#e8b48a', hair: '#2b2118',
    specials: { n: 'fireball', d: 'uppercut', b: 'spinkick' }, super: 'shinku', cost: 0,
  },
  mei: {
    id: 'mei', name: 'Mei', icon: '🐯', title: 'Rushdown', text: 'Fast walk, Tiger Rush, overhead and slide. Low HP.',
    hp: 106, walk: 1.25, dmg: 1.06, throwDmg: 1, size: 0.94, gi: '#4cc9f0', belt: '#f9c74f', skin: '#f1c6a0', hair: '#111',
    specials: { f: 'dashpunch', n: 'flipkick', d: 'slide' }, super: 'blossom', cost: 40,
  },
  rook: {
    id: 'rook', name: 'Rook', icon: '🐻', title: 'Grappler', text: 'Big and slow. Bear Hug grab, Lariat, strong throws.',
    hp: 118, walk: 0.8, dmg: 1.05, throwDmg: 1.15, size: 1.12, gi: '#8d5a3b', belt: '#222', skin: '#c68b59', hair: '#5a3a22',
    specials: { f: 'grab', n: 'lariat', d: 'quake' }, super: 'mountain', cost: 70,
  },
  zed: {
    id: 'zed', name: 'Zed', icon: '🌀', title: 'Zoner', text: 'Wind Blade, Earth Wave and a counter stance. Keeps you out.',
    hp: 106, walk: 0.95, dmg: 1.06, throwDmg: 1, size: 1, gi: '#2a9d8f', belt: '#e9c46a', skin: '#d9a47c', hair: '#e5e5e5',
    specials: { n: 'sonic', d: 'quake', b: 'parry' }, super: 'beam', cost: 110,
  },
  oni: {
    id: 'oni', name: 'Oni', icon: '👹', title: 'Boss', text: 'The Shogun himself. Four specials and the Raging Demon.',
    hp: 104, walk: 1.05, dmg: 1, throwDmg: 1, size: 1.08, gi: '#3b1f2b', belt: '#c1121f', skin: '#a33b3b', hair: '#f8f8f8',
    specials: { n: 'fireball', f: 'dashpunch', d: 'uppercut', b: 'spinkick' }, super: 'demon', cost: -1,
  },
};
export const FIGHTER_IDS = Object.keys(FIGHTERS);

export type Style = 'rushdown' | 'zoner' | 'grappler' | 'counter' | 'balanced' | 'boss';

export const STYLE_INFO: Record<Style, { icon: string; text: string }> = {
  rushdown: { icon: '🔥', text: 'Walks in and attacks all the time.' },
  zoner: { icon: '🎯', text: 'Keeps distance and throws projectiles.' },
  grappler: { icon: '🤼', text: 'Walks in to throw and grab you.' },
  counter: { icon: '🛡️', text: 'Waits, blocks and punishes mistakes.' },
  balanced: { icon: '⚖️', text: 'A bit of everything.' },
  boss: { icon: '👑', text: 'Reads you and mixes every style.' },
};

export interface OppDef {
  id: string;
  icon: string;
  name: string;
  base: string;
  style: Style;
  gi: string;
  belt: string;
  hair?: string;
  specials?: Partial<Record<Slot, string>>;
  line: string;
}

export const OPPONENTS: OppDef[] = [
  { id: 'tora', icon: '🐯', name: 'Tora', base: 'mei', style: 'rushdown', gi: '#f77f00', belt: '#111', line: 'Keep up, if you can.' },
  { id: 'blaze', icon: '🔥', name: 'Blaze', base: 'kai', style: 'rushdown', gi: '#e63946', belt: '#ffd166', specials: { f: 'dashpunch', d: 'uppercut' }, line: 'No breaks. No mercy.' },
  { id: 'viper', icon: '🐍', name: 'Viper', base: 'mei', style: 'rushdown', gi: '#80b918', belt: '#2b2d42', specials: { d: 'slide', f: 'dashpunch', b: 'spinkick' }, line: 'Watch your feet.' },
  { id: 'kaze', icon: '🌬️', name: 'Kaze', base: 'zed', style: 'zoner', gi: '#0096c7', belt: '#caf0f8', line: 'You will never touch me.' },
  { id: 'hoshi', icon: '⭐', name: 'Hoshi', base: 'kai', style: 'zoner', gi: '#7b2cbf', belt: '#e0aaff', specials: { n: 'fireball', d: 'quake' }, line: 'The stars fall on you.' },
  { id: 'gorr', icon: '🦍', name: 'Gorr', base: 'rook', style: 'grappler', gi: '#6c584c', belt: '#dda15e', line: 'Come closer. Closer.' },
  { id: 'bigbo', icon: '🐻', name: 'Big Bo', base: 'rook', style: 'grappler', gi: '#386641', belt: '#f2e8cf', specials: { f: 'grab', n: 'lariat', b: 'parry' }, line: 'Hug time!' },
  { id: 'ren', icon: '🧓', name: 'Sensei Ren', base: 'kai', style: 'counter', gi: '#adb5bd', belt: '#212529', specials: { n: 'fireball', b: 'parry', d: 'uppercut' }, line: 'Show me your mistake.' },
  { id: 'monk', icon: '🧘', name: 'Mirror Monk', base: 'zed', style: 'counter', gi: '#ffb703', belt: '#9d0208', specials: { b: 'parry', f: 'palm', d: 'uppercut' }, line: 'Your strength is mine.' },
  { id: 'jin', icon: '🥋', name: 'Jin', base: 'kai', style: 'balanced', gi: '#1d3557', belt: '#f1faee', line: 'A clean fight, then.' },
];

export const BOSS: OppDef = { id: 'shogun', icon: '👹', name: 'Oni Shogun', base: 'oni', style: 'boss', gi: '#3b1f2b', belt: '#c1121f', line: 'Kneel, or be broken.' };

export interface StageDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  sky: [string, string];
  floor: [string, string];
}

export const STAGES: Record<string, StageDef> = {
  dojo: { id: 'dojo', name: 'Old Dojo', icon: '🏯', cost: 0, sky: ['#3a2618', '#1e130c'], floor: ['#8a5a32', '#5c3a1e'] },
  bamboo: { id: 'bamboo', name: 'Bamboo Grove', icon: '🎋', cost: 30, sky: ['#1f4d3a', '#0d2219'], floor: ['#4f6b33', '#2f4220'] },
  roof: { id: 'roof', name: 'Neon Rooftop', icon: '🌃', cost: 50, sky: ['#1a1440', '#07051a'], floor: ['#3a3a4a', '#202030'] },
  temple: { id: 'temple', name: 'Red Temple', icon: '⛩️', cost: 80, sky: ['#f4a261', '#9c3d27'], floor: ['#7a4b3a', '#4a2a20'] },
  volcano: { id: 'volcano', name: 'Oni Gate', icon: '🌋', cost: -1, sky: ['#4a0e0e', '#120404'], floor: ['#2b1d1d', '#140b0b'] },
};
export const STAGE_IDS = Object.keys(STAGES);

export interface Mods {
  dmg: number;
  taken: number;
  speed: number;
  meter: number;
  startMeter: number;
  throwDmg: number;
  throwRange: number;
  superDmg: number;
  vamp: number;
  chipGuard: boolean;
  thorns: number;
  secondWind: boolean;
  counter: number;
  momentum: boolean;
  wake: number;
  escape: number;
  firstStrike: boolean;
  motion: boolean;
}

export const baseMods = (): Mods => ({
  dmg: 1,
  taken: 1,
  speed: 1,
  meter: 1,
  startMeter: 0,
  throwDmg: 1,
  throwRange: 0,
  superDmg: 1,
  vamp: 0,
  chipGuard: false,
  thorns: 0,
  secondWind: false,
  counter: 1.2,
  momentum: false,
  wake: 0,
  escape: 0,
  firstStrike: false,
  motion: false,
});

export interface TechDef {
  id: string;
  name: string;
  icon: string;
  kind: 'stat' | 'passive';
  text: string;
  max: number;
  apply: (m: Mods) => void;
}

export const TECHS: Record<string, TechDef> = {
  vigor: { id: 'vigor', name: 'Iron Body', icon: '❤️', kind: 'stat', text: '+15 max HP and heal 15.', max: 3, apply: () => undefined },
  power: { id: 'power', name: 'Power', icon: '💪', kind: 'stat', text: '+12% damage.', max: 3, apply: (m) => (m.dmg += 0.12) },
  swift: { id: 'swift', name: 'Swift Feet', icon: '👟', kind: 'stat', text: '+12% walk and jump speed.', max: 3, apply: (m) => (m.speed += 0.12) },
  focus: { id: 'focus', name: 'Focus', icon: '🔆', kind: 'stat', text: '+35% super meter gain.', max: 3, apply: (m) => (m.meter += 0.35) },
  guard: { id: 'guard', name: 'Hard Skin', icon: '🛡️', kind: 'stat', text: 'Take 10% less damage.', max: 3, apply: (m) => (m.taken *= 0.9) },
  vamp: { id: 'vamp', name: 'Leech Fist', icon: '🩸', kind: 'passive', text: 'Heal 12% of the damage you deal.', max: 1, apply: (m) => (m.vamp += 0.12) },
  ironguard: { id: 'ironguard', name: 'Iron Guard', icon: '🧱', kind: 'passive', text: 'No chip damage. Blocking gives double meter.', max: 1, apply: (m) => (m.chipGuard = true) },
  secondwind: { id: 'secondwind', name: 'Second Wind', icon: '🌬️', kind: 'passive', text: 'Once per fight, below 30% HP, heal 15% of max HP.', max: 1, apply: (m) => (m.secondWind = true) },
  countersense: { id: 'countersense', name: 'Counter Sense', icon: '🎯', kind: 'passive', text: 'Counter hits deal +50% instead of +20%.', max: 1, apply: (m) => (m.counter = 1.5) },
  ready: { id: 'ready', name: 'Battle Ready', icon: '⚡', kind: 'passive', text: 'Start each fight with 50 super meter.', max: 1, apply: (m) => (m.startMeter = 50) },
  grip: { id: 'grip', name: 'Iron Grip', icon: '✊', kind: 'passive', text: 'Throws deal +60% and reach further.', max: 1, apply: (m) => ((m.throwDmg *= 1.6), (m.throwRange += 14)) },
  thorns: { id: 'thorns', name: 'Spiked Guard', icon: '🌵', kind: 'passive', text: 'Each attack you block deals 2 to the attacker.', max: 1, apply: (m) => (m.thorns = 2) },
  momentum: { id: 'momentum', name: 'Momentum', icon: '🌊', kind: 'passive', text: 'Combo damage drops half as fast.', max: 1, apply: (m) => (m.momentum = true) },
  meditate: { id: 'meditate', name: 'Meditation', icon: '🧘', kind: 'passive', text: 'Heal 15% more of max HP after each win.', max: 1, apply: () => undefined },
  overdrive: { id: 'overdrive', name: 'Overdrive', icon: '☄️', kind: 'passive', text: 'Your super deals +40% damage.', max: 1, apply: (m) => (m.superDmg += 0.4) },
  kipup: { id: 'kipup', name: 'Kip-up', icon: '🤸', kind: 'passive', text: 'Get up 15 frames faster after a knockdown.', max: 1, apply: (m) => (m.wake = 15) },
  slippery: { id: 'slippery', name: 'Slippery', icon: '🧈', kind: 'passive', text: 'Half of the normal throws on you break by themselves.', max: 1, apply: (m) => (m.escape = 0.5) },
  firststrike: { id: 'firststrike', name: 'First Strike', icon: '🗡️', kind: 'passive', text: 'Your first hit in each fight deals double damage.', max: 1, apply: (m) => (m.firstStrike = true) },
};
export const TECH_IDS = Object.keys(TECHS);

export const SLOT_NAME: Record<Slot, string> = { n: 'S', f: '→ S', b: '← S', d: '↓ S' };
export const SLOT_MOTION: Record<Slot, string> = { n: '↓↓ + atk', f: '↓↘→ + atk', b: '↓↙← + atk', d: '→↓↘ + atk' };

/** Difficulty of each ladder rung (0-7). Rung 7 is the boss. */
export const RUNGS = [
  { react: 34, block: 0.15, aggro: 0.45, hp: 0.7, dmg: 0.5, mistake: 0.25, combo: 0.2 },
  { react: 31, block: 0.2, aggro: 0.5, hp: 0.75, dmg: 0.54, mistake: 0.21, combo: 0.28 },
  { react: 28, block: 0.26, aggro: 0.55, hp: 0.8, dmg: 0.58, mistake: 0.18, combo: 0.36 },
  { react: 25, block: 0.32, aggro: 0.6, hp: 0.85, dmg: 0.62, mistake: 0.15, combo: 0.44 },
  { react: 22, block: 0.37, aggro: 0.64, hp: 0.9, dmg: 0.66, mistake: 0.13, combo: 0.5 },
  { react: 20, block: 0.42, aggro: 0.68, hp: 0.95, dmg: 0.7, mistake: 0.11, combo: 0.55 },
  { react: 18, block: 0.46, aggro: 0.72, hp: 0.98, dmg: 0.72, mistake: 0.09, combo: 0.6 },
  { react: 16, block: 0.5, aggro: 0.75, hp: 1.15, dmg: 0.88, mistake: 0.06, combo: 0.7 },
];
