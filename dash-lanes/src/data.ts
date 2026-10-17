/** Static game data: chunks, zones, bosses, perks, power-ups and runners. */

/** Length of one chunk row in meters. */
export const ROW = 4;

export type Tag = 'basic' | 'train' | 'oncoming' | 'shifter' | 'wall' | 'mixed';

export interface ChunkDef {
  id: string;
  /** Difficulty from 1 (easy) to 5 (hard). */
  d: number;
  tag: Tag;
  /**
   * Rows from near to far. Each row has 3 characters for the lanes left, middle, right.
   * `.` empty, `c` coins, `b` barrier (jump), `B` barrier with a coin arc, `h` bar (slide),
   * `w` wall (switch), `t` train (switch, cells merge), `o` oncoming train,
   * `s` shifter cart (moves between 2 lanes), `p` power-up or coins.
   */
  rows: string[];
}

const C = (id: string, d: number, tag: Tag, s: string): ChunkDef => ({ id, d, tag, rows: s.split('|') });

export const CHUNKS: ChunkDef[] = [
  // Basic: barriers and bars only.
  C('hop', 1, 'basic', '...|.B.|...|c.c|c.c'),
  C('duck', 1, 'basic', 'c.c|.h.|c.c|...'),
  C('side-hops', 1, 'basic', 'B..|...|..B|...|.p.'),
  C('fence', 1, 'basic', 'bbb|...|ccc|ccc'),
  C('low-roof', 1, 'basic', 'hhh|...|ccc'),
  C('mix-row', 2, 'basic', 'b.h|...|...|h.b|...'),
  C('jump-duck', 2, 'basic', 'bbb|...|...|...|...|hhh|...'),
  C('checker', 2, 'basic', 'hbh|...|...|bhb|...'),
  C('zigzag', 3, 'basic', 'h.h|.b.|...|h.h|.b.|...'),
  C('triple', 3, 'basic', 'bhb|...|...|hbh|...|...|bhb'),
  C('stairs', 3, 'basic', 'BBB|...|...|...|hhh|...|...|...|BBB|...'),
  C('gauntlet', 4, 'basic', 'bhb|...|...|hbh|...|...|...|bbb|...|...|...|hhh'),
  // Walls: short tall blocks.
  C('post', 1, 'wall', 'w..|...|..w|...'),
  C('gate2', 2, 'wall', 'ww.|...|...|.ww|...'),
  C('slalom', 3, 'wall', '.ww|...|...|ww.|...|...|.ww'),
  C('wall-mix', 3, 'wall', 'w.w|.b.|...|w.w|.h.|...'),
  C('maze', 4, 'wall', 'ww.|...|.hw|...|w..|.b.|..w'),
  // Static trains.
  C('train-l', 1, 'train', 't..|t..|t..|...|cc.'),
  C('train-r', 1, 'train', '..t|c.t|c.t|..t|...'),
  C('corridor', 2, 'train', 't.t|tct|tct|t.t|...'),
  C('two-trains', 2, 'train', 'tt.|tt.|tt.|..c|..c'),
  C('switch-over', 3, 'train', '.tt|.tt|...|...|tt.|tt.|...'),
  C('tunnel', 3, 'train', 't.t|t.t|tbt|t.t|t.t|t.t|tht|t.t'),
  C('long-cars', 3, 'train', 't.t|t.t|t.t|t..|tb.|t..|t.t|t.t'),
  C('train-hops', 4, 'mixed', 'tb.|t..|t..|t.h|t..|t..|tb.'),
  C('ride-right', 4, 'mixed', 'tt.|tt.|ttb|tt.|tt.|tt.|tth|tt.|tt.|tt.|ttb'),
  C('weave', 5, 'mixed', 't.t|tbt|t.t|t.t|t.t|tht|t.t|t..|...|..t|.ht|..t|..t|.bt'),
  // Oncoming trains.
  C('oncoming-l', 2, 'oncoming', 'o..|o..|o..|...|.c.'),
  C('oncoming-r', 2, 'oncoming', '..o|..o|..o|c..|c..'),
  C('oncoming-mid', 3, 'oncoming', '.o.|.o.|.o.|...|b.b|...'),
  C('rush', 3, 'oncoming', 'o.t|o.t|o.t|...|...'),
  C('squeeze', 4, 'oncoming', 'o.o|o.o|...|.h.|...|.b.'),
  C('rush-hops', 5, 'oncoming', 'o.t|o.t|obt|o.t|o.t|o.t|oht|o.t'),
  // Shifter carts.
  C('cart', 2, 'shifter', 's..|...|...|...|..s|...'),
  C('cart-mid', 3, 'shifter', '.s.|...|...|b.b|...'),
  C('cart-train', 3, 'shifter', 's..|...|...|..t|..t|...'),
  C('carts', 4, 'shifter', 's..|...|...|..s|...|...|s..|...'),
  C('cart-chaos', 5, 'shifter', 's..|...|...|.h.|..s|...|...|bb.|...'),
];

export interface Skin {
  barrier: string;
  bar: string;
  train: string;
  wall: string;
  cart: string;
}

export interface ZoneDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  sky: [string, string];
  ground: string;
  road: string;
  tie: string;
  rail: string;
  scenery: string[];
  mix: Partial<Record<Tag, number>>;
  /** Added to the chunk difficulty target. */
  diff: number;
  speedMul: number;
  scoreMul: number;
  /** Lane switch speed factor (ice is slow). */
  laneMul: number;
  /** Power-up chance factor. */
  luck: number;
  skin: Skin;
}

export const ZONES: Record<string, ZoneDef> = {
  rail: {
    id: 'rail',
    name: 'Rail Yard',
    icon: '🚉',
    text: 'Many parked trains. A good warm-up.',
    sky: ['#4b6c8f', '#c4d7e0'],
    ground: '#5d5a52',
    road: '#3d3a35',
    tie: '#6b5240',
    rail: '#b8b8c0',
    scenery: ['🏭', '🏢', '🏗️', '🛢️'],
    mix: { basic: 2, train: 4, wall: 1, oncoming: 0.6, mixed: 1 },
    diff: 0,
    speedMul: 1,
    scoreMul: 1,
    laneMul: 1,
    luck: 1,
    skin: { barrier: '#e63946', bar: '#f1c40f', train: '#2a9d8f', wall: '#8d6e63', cart: '#e76f51' },
  },
  city: {
    id: 'city',
    name: 'Neon City',
    icon: '🌃',
    text: 'Carts change lanes. Power-ups +30%.',
    sky: ['#120a2e', '#6a2c91'],
    ground: '#1d1830',
    road: '#2a2340',
    tie: '#3e3360',
    rail: '#ff6bd6',
    scenery: ['🏙️', '🏢', '🌆', '🎰'],
    mix: { basic: 2, shifter: 4, wall: 1.5, train: 1 },
    diff: 0.2,
    speedMul: 1,
    scoreMul: 1.1,
    laneMul: 1,
    luck: 1.3,
    skin: { barrier: '#ff4dd2', bar: '#00e5ff', train: '#7b2ff7', wall: '#3a3a5c', cart: '#ffd60a' },
  },
  canyon: {
    id: 'canyon',
    name: 'Red Canyon',
    icon: '🏜️',
    text: 'Low rocks and oncoming ore trains.',
    sky: ['#e76f51', '#f4d6a0'],
    ground: '#b5653a',
    road: '#8a4b2a',
    tie: '#5c3a21',
    rail: '#d9b38c',
    scenery: ['🌵', '🪨', '🌵', '🏜️'],
    mix: { basic: 4, oncoming: 3, wall: 1, train: 1 },
    diff: 0.3,
    speedMul: 1,
    scoreMul: 1.15,
    laneMul: 1,
    luck: 1,
    skin: { barrier: '#8d5a3b', bar: '#c9a227', train: '#6d4c41', wall: '#a0522d', cart: '#d4a373' },
  },
  frost: {
    id: 'frost',
    name: 'Frost Pass',
    icon: '🏔️',
    text: 'Ice: lane switches are 20% slower. Score +20%.',
    sky: ['#8ecae6', '#eaf6ff'],
    ground: '#dfeef7',
    road: '#a9c4d6',
    tie: '#7895a8',
    rail: '#ffffff',
    scenery: ['🌲', '⛄', '🌲', '🏔️'],
    mix: { basic: 3, wall: 3, train: 2, mixed: 1 },
    diff: 0.2,
    speedMul: 0.97,
    scoreMul: 1.2,
    laneMul: 0.8,
    luck: 1,
    skin: { barrier: '#4dabf7', bar: '#a5d8ff', train: '#1c7ed6', wall: '#74c0fc', cart: '#ff8787' },
  },
  jungle: {
    id: 'jungle',
    name: 'Jungle Ruins',
    icon: '🌴',
    text: 'Dense mixed patterns. Score +10%.',
    sky: ['#2d6a4f', '#b7e4c7'],
    ground: '#2d6a4f',
    road: '#5c4a32',
    tie: '#3e2f1c',
    rail: '#c9b07a',
    scenery: ['🌴', '🗿', '🌿', '🌴'],
    mix: { basic: 3, wall: 2, train: 2, mixed: 2, shifter: 1 },
    diff: 0.5,
    speedMul: 1,
    scoreMul: 1.1,
    laneMul: 1,
    luck: 1,
    skin: { barrier: '#6b4226', bar: '#40916c', train: '#795548', wall: '#7f8c5a', cart: '#b08968' },
  },
  volcano: {
    id: 'volcano',
    name: 'Volcano Line',
    icon: '🌋',
    text: 'Hard and fast: speed +8%, score +40%.',
    sky: ['#1a0a0a', '#9d0208'],
    ground: '#2b0f0f',
    road: '#3a1a14',
    tie: '#6a040f',
    rail: '#ff9e00',
    scenery: ['🌋', '🔥', '🪨', '🔥'],
    mix: { basic: 2, oncoming: 3, train: 2, mixed: 2, shifter: 1 },
    diff: 0.8,
    speedMul: 1.08,
    scoreMul: 1.4,
    laneMul: 1,
    luck: 1.1,
    skin: { barrier: '#ff5400', bar: '#ffbd00', train: '#370617', wall: '#6a040f', cart: '#ff6d00' },
  },
};

export const ZONE_IDS = Object.keys(ZONES);
export const START_ZONES = ['rail', 'city', 'canyon'];

export type StrikeKind = 'beam' | 'beam2' | 'slam' | 'sweep';

export interface BossDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  attacks: [StrikeKind, number][];
  /** Seconds between attacks at the start and at the end of the fight. */
  interval: [number, number];
  /** Telegraph time in seconds. */
  tele: number;
  zone: ZoneDef;
}

const bossZone = (id: string, name: string, sky: [string, string], ground: string, road: string, rail: string, scenery: string[]): ZoneDef => ({
  id,
  name,
  icon: '⚠️',
  text: '',
  sky,
  ground,
  road,
  tie: '#222',
  rail,
  scenery,
  mix: { basic: 3, wall: 1.5, train: 1 },
  diff: -0.6,
  speedMul: 1,
  scoreMul: 1.2,
  laneMul: 1,
  luck: 1.2,
  skin: { barrier: '#e63946', bar: '#f1c40f', train: '#495057', wall: '#6c757d', cart: '#e76f51' },
});

export const BOSSES: Record<string, BossDef> = {
  drone: {
    id: 'drone',
    name: 'Drone Chaser',
    icon: '🛸',
    text: 'Fires lane beams. Watch the red lanes and switch away.',
    attacks: [
      ['beam', 3],
      ['beam2', 1],
    ],
    interval: [2.0, 1.5],
    tele: 1.1,
    zone: bossZone('drone-arena', 'Sky Bridge', ['#03045e', '#48cae4'], '#023e8a', '#2b2d42', '#90e0ef', ['🗼', '🛰️', '🏢']),
  },
  titan: {
    id: 'titan',
    name: 'Iron Titan',
    icon: '🤖',
    text: 'Lane beams, ground slams (jump) and laser sweeps (slide).',
    attacks: [
      ['beam', 2],
      ['beam2', 2],
      ['slam', 1.5],
      ['sweep', 1.5],
    ],
    interval: [1.8, 1.35],
    tele: 1.0,
    zone: bossZone('titan-arena', 'Core Foundry', ['#212529', '#e85d04'], '#343a40', '#212529', '#ffba08', ['🏭', '⚙️', '🔩']),
  },
  wyrm: {
    id: 'wyrm',
    name: 'Storm Wyrm',
    icon: '🐉',
    text: 'Endless boss. Fast attacks of every kind.',
    attacks: [
      ['beam', 2],
      ['beam2', 2],
      ['slam', 1.5],
      ['sweep', 1.5],
    ],
    interval: [1.8, 1.3],
    tele: 0.9,
    zone: bossZone('wyrm-arena', 'Storm Peak', ['#10002b', '#5a189a'], '#240046', '#3c096c', '#e0aaff', ['⛈️', '🌩️', '🏔️']),
  },
};

export type PwId = 'magnet' | 'shield' | 'jet' | 'boost';

export interface PowerDef {
  id: PwId;
  name: string;
  icon: string;
  color: string;
  dur: number;
  weight: number;
  text: string;
}

export const POWERS: Record<PwId, PowerDef> = {
  magnet: { id: 'magnet', name: 'Magnet', icon: '🧲', color: '#ff6b6b', dur: 10, weight: 3, text: 'Pulls coins from all lanes.' },
  shield: { id: 'shield', name: 'Shield', icon: '🛡️', color: '#4cc9f0', dur: 15, weight: 2.2, text: 'Blocks one crash.' },
  jet: { id: 'jet', name: 'Jetpack', icon: '🚀', color: '#ffd166', dur: 6, weight: 1.2, text: 'Fly over everything.' },
  boost: { id: 'boost', name: 'Score x2', icon: '✖️', color: '#80ed99', dur: 10, weight: 2, text: 'Double score from distance.' },
};

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  max: number;
}

export const PERKS: Record<string, PerkDef> = {
  double: { id: 'double', name: 'Double Jump', icon: '🦘', text: 'Jump once more in the air.', max: 2 },
  magnet: { id: 'magnet', name: 'Magnet Range', icon: '🧲', text: 'Magnets reach 50% farther. Coins in the next lane fly to you.', max: 3 },
  hit: { id: 'hit', name: 'Extra Hit', icon: '❤️', text: 'Survive one more crash.', max: 5 },
  ramp: { id: 'ramp', name: 'Steady Pace', icon: '🐢', text: 'Speed rises 20% slower.', max: 3 },
  feather: { id: 'feather', name: 'Feather', icon: '🪶', text: 'Lower gravity. Jumps last longer.', max: 2 },
  quick: { id: 'quick', name: 'Quick Feet', icon: '👟', text: 'Faster lane switch and a longer input buffer.', max: 2 },
  battery: { id: 'battery', name: 'Long Battery', icon: '🔋', text: 'Power-ups last 30% longer.', max: 3 },
  lucky: { id: 'lucky', name: 'Lucky Find', icon: '🍀', text: '40% more power-ups.', max: 3 },
  coin: { id: 'coin', name: 'Gold Touch', icon: '🪙', text: 'Each coin is worth 1 more.', max: 3 },
  show: { id: 'show', name: 'Showman', icon: '🎤', text: 'Score +20%.', max: 3 },
  guard: { id: 'guard', name: 'Starter Shield', icon: '🔰', text: 'Start each zone with a shield.', max: 1 },
};

export const PERK_IDS = Object.keys(PERKS);

export interface RunnerDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  hair: string;
  text: string;
  cost: number;
  perks: Record<string, number>;
  laneMul: number;
  scoreMul: number;
}

export const RUNNERS: Record<string, RunnerDef> = {
  dash: { id: 'dash', name: 'Dash', icon: '🏃', color: '#80ed99', hair: '#3d2b1f', text: 'Balanced. No special start.', cost: 0, perks: {}, laneMul: 1, scoreMul: 1 },
  hop: { id: 'hop', name: 'Hop', icon: '🐇', color: '#ffafcc', hair: '#f4f1de', text: 'Starts with Double Jump.', cost: 25, perks: { double: 1 }, laneMul: 1, scoreMul: 1 },
  volt: { id: 'volt', name: 'Volt', icon: '⚡', color: '#ffd60a', hair: '#1d3557', text: 'Starts with Long Battery and Magnet Range.', cost: 50, perks: { battery: 1, magnet: 1 }, laneMul: 1, scoreMul: 1 },
  tank: { id: 'tank', name: 'Tank', icon: '🦏', color: '#adb5bd', hair: '#212529', text: 'Starts with an Extra Hit. Lane switch 10% slower.', cost: 80, perks: { hit: 1 }, laneMul: 0.9, scoreMul: 1 },
  zen: { id: 'zen', name: 'Zen', icon: '🧘', color: '#b8c0ff', hair: '#5a189a', text: 'Starts with Steady Pace and Feather. Score -10%.', cost: 120, perks: { ramp: 1, feather: 1 }, laneMul: 1, scoreMul: 0.9 },
};

export const RUNNER_IDS = Object.keys(RUNNERS);

export interface StageInfo {
  kind: 'zone' | 'boss';
  len: number;
  boss?: string;
}

/** The goal stages. Clearing all of them wins the run. */
const PLAN: StageInfo[] = [
  { kind: 'zone', len: 450 },
  { kind: 'zone', len: 500 },
  { kind: 'boss', len: 550, boss: 'drone' },
  { kind: 'zone', len: 550 },
  { kind: 'zone', len: 600 },
  { kind: 'boss', len: 650, boss: 'titan' },
];

export const GOAL_STAGES = PLAN.length;
export const GOAL = PLAN.reduce((a, s) => a + s.len, 0);

export function stageInfo(i: number): StageInfo {
  if (i < PLAN.length) return PLAN[i];
  const k = i - PLAN.length;
  if (k % 3 === 2) return { kind: 'boss', len: 650, boss: k % 6 === 2 ? 'wyrm' : 'titan' };
  return { kind: 'zone', len: 600 };
}

export function stageStart(i: number): number {
  let d = 0;
  for (let k = 0; k < i; k++) d += stageInfo(k).len;
  return d;
}
