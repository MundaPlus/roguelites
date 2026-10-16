/** Static game data: playfield, bullet colors, emitters, enemies, bosses, stages, ships and parts. */

/** Logical playfield size. The canvas scales it to the screen. */
export const W = 360;
export const H = 480;

/** Bullet colors by index. */
export const COLORS = ['#ff70a6', '#ff4d6d', '#ff9f43', '#ffd166', '#7ee08a', '#4cc9f0', '#5b7bff', '#b388ff', '#ffffff'];
export const PINK = 0;
export const RED = 1;
export const ORANGE = 2;
export const YELLOW = 3;
export const GREEN = 4;
export const CYAN = 5;
export const BLUE = 6;
export const PURPLE = 7;
export const WHITE = 8;

/**
 * One bullet emitter. The kind sets the shape of one volley:
 * - ring: `n` bullets in a full circle.
 * - spiral: `n` arms. The angle turns by `spin` after each volley.
 * - aimed: `n` bullets in an `arc` toward the player.
 * - fan: like aimed, but toward `dir` (default straight down).
 * - rain: `n` bullets from random points on the top edge.
 * - flower: a ring whose bullets curve, half left and half right.
 * - random: `n` bullets in random directions within `arc` around `dir`.
 */
export type EmitKind = 'ring' | 'spiral' | 'aimed' | 'fan' | 'rain' | 'flower' | 'random';

export interface Emit {
  k: EmitKind;
  /** Frames between volleys. */
  every: number;
  n?: number;
  spd: number;
  /** With `layers` > 1, the volley repeats at speeds from `spd` to `spd2`. */
  spd2?: number;
  layers?: number;
  arc?: number;
  dir?: number;
  spin?: number;
  /** Bullet radius. */
  r?: number;
  col?: number;
  /** Speed change per frame. */
  acc?: number;
  /** Turn per frame (radians). */
  turn?: number;
  /** Volleys per burst and frames between them. */
  burst?: number;
  gap?: number;
  /** Frames before the first volley. */
  delay?: number;
  /** Ring: point one bullet at the player. */
  aim?: boolean;
  /** Spiral: also fire the mirrored spiral. */
  mirror?: boolean;
  /** Offset from the shooter. */
  ox?: number;
  oy?: number;
  /** Maximum number of volleys. */
  max?: number;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  r: number;
  col: string;
  petals: number;
  /** Point items and bloom items dropped on kill. */
  drop: [number, number];
  emit: Emit[];
  /** Extra emitters from stage 3 on. */
  hard?: Emit[];
  /** Ring of bullets on death from stage 4 on. */
  revenge?: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  bud: { id: 'bud', name: 'Bud', hp: 7, r: 9, col: '#ff8fb8', petals: 5, drop: [1, 0], emit: [{ k: 'aimed', every: 80, n: 1, spd: 2.2, delay: 40, max: 2, col: PINK }], hard: [{ k: 'aimed', every: 80, n: 3, arc: 0.35, spd: 2.4, delay: 60, max: 1, col: RED }] },
  wisp: { id: 'wisp', name: 'Wisp', hp: 10, r: 9, col: '#8be9fd', petals: 4, drop: [1, 1], emit: [{ k: 'aimed', every: 90, n: 3, arc: 0.5, spd: 2.1, delay: 30, max: 2, col: CYAN }], revenge: 6 },
  sprite: { id: 'sprite', name: 'Sprite', hp: 16, r: 10, col: '#c3a6ff', petals: 6, drop: [2, 0], emit: [{ k: 'ring', every: 70, n: 10, spd: 1.6, delay: 50, max: 2, col: PURPLE, aim: true }], hard: [{ k: 'ring', every: 70, n: 10, spd: 1.2, delay: 85, max: 2, col: BLUE, r: 5 }] },
  dart: { id: 'dart', name: 'Dart', hp: 6, r: 8, col: '#ffd166', petals: 3, drop: [1, 0], emit: [], revenge: 8 },
  beetle: { id: 'beetle', name: 'Beetle', hp: 60, r: 14, col: '#7ee08a', petals: 8, drop: [4, 2], emit: [{ k: 'spiral', every: 8, n: 2, spin: 0.29, spd: 1.5, delay: 50, col: GREEN, max: 30 }] },
  orbiter: { id: 'orbiter', name: 'Orbiter', hp: 110, r: 15, col: '#5b7bff', petals: 7, drop: [6, 2], emit: [{ k: 'ring', every: 36, n: 16, spd: 1.4, spin: 0.1, delay: 40, col: BLUE, r: 4.5 }], hard: [{ k: 'aimed', every: 50, n: 5, arc: 0.6, spd: 2.6, delay: 60, col: WHITE }] },
  lantern: { id: 'lantern', name: 'Lantern', hp: 180, r: 17, col: '#ff9f43', petals: 9, drop: [8, 3], emit: [{ k: 'random', every: 3, n: 1, spd: 1.3, spd2: 2.4, arc: 2.4, col: ORANGE, delay: 60 }], hard: [{ k: 'aimed', every: 60, n: 3, arc: 0.3, spd: 3, layers: 3, spd2: 2, col: RED, delay: 80 }] },
};

export type PathKind = 'down' | 'sine' | 'stop' | 'swoop' | 'cross' | 'dive';
export type SpawnX = 'line' | 'left' | 'right' | 'mid' | 'rand' | 'pair' | 'side';

export interface WaveDef {
  e: string;
  n: number;
  /** Frames between spawns. */
  gap: number;
  path: PathKind;
  xs: SpawnX;
  /** Frames until the next wave may start. */
  dur: number;
}

export type Move = 'center' | 'wander' | 'sway' | 'still';

export interface PhaseDef {
  /** Spell card name. Phases without a name are normal attacks. */
  name?: string;
  hp: number;
  /** Time limit in seconds. */
  time: number;
  move: Move;
  emit: Emit[];
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  col: string;
  petals: number;
  r: number;
  phases: PhaseDef[];
}

const TAU = Math.PI * 2;

export const BOSSES: Record<string, BossDef> = {
  // ---------- Stage 1 ----------
  thistle: {
    id: 'thistle', name: 'Thistle Sprite', title: 'Mid-boss', col: '#c3a6ff', petals: 7, r: 16,
    phases: [
      { hp: 520, time: 25, move: 'sway', emit: [{ k: 'ring', every: 50, n: 12, spd: 1.5, aim: true, col: PURPLE }, { k: 'aimed', every: 90, n: 3, arc: 0.4, spd: 2.2, delay: 30, col: PINK }] },
      { name: "Seed Sign 'Thistledown Drift'", hp: 650, time: 30, move: 'center', emit: [{ k: 'rain', every: 7, n: 1, spd: 1.2, r: 4, col: WHITE }, { k: 'aimed', every: 70, n: 3, arc: 0.5, spd: 2, layers: 2, spd2: 1.5, col: PURPLE }] },
    ],
  },
  briar: {
    id: 'briar', name: 'Briar Queen', title: 'Rose of the Meadow', col: '#ff4d6d', petals: 10, r: 20,
    phases: [
      { hp: 900, time: 30, move: 'wander', emit: [{ k: 'ring', every: 45, n: 16, spd: 1.5, col: RED }, { k: 'aimed', every: 80, n: 5, arc: 0.8, spd: 2.2, layers: 2, spd2: 1.6, delay: 20, col: PINK }] },
      { name: "Thorn Sign 'Bramble Spiral'", hp: 1100, time: 35, move: 'center', emit: [{ k: 'spiral', every: 6, n: 3, spin: 0.13, spd: 1.6, mirror: true, col: GREEN, r: 3.5 }] },
      { name: "Rose Sign 'First Bloom'", hp: 1200, time: 40, move: 'sway', emit: [{ k: 'flower', every: 65, n: 16, spd: 1.4, turn: 0.008, col: PINK, r: 4.5 }, { k: 'aimed', every: 70, n: 1, spd: 2.6, burst: 3, gap: 6, col: RED, delay: 30 }] },
    ],
  },
  // ---------- Stage 2 ----------
  dew: {
    id: 'dew', name: 'Dew Fairy', title: 'Mid-boss', col: '#8be9fd', petals: 6, r: 16,
    phases: [
      { hp: 650, time: 25, move: 'sway', emit: [{ k: 'ring', every: 40, n: 14, spd: 1.6, spin: 0.11, col: CYAN }, { k: 'rain', every: 14, n: 1, spd: 1.6, col: BLUE }] },
      { name: "Dew Sign 'Morning Drops'", hp: 800, time: 30, move: 'center', emit: [{ k: 'random', every: 5, n: 2, spd: 1.4, spd2: 2.4, arc: 2.2, col: CYAN, r: 4 }, { k: 'aimed', every: 75, n: 5, arc: 0.6, spd: 2.4, col: WHITE }] },
    ],
  },
  lotus: {
    id: 'lotus', name: 'Lotus Warden', title: 'Keeper of the Pond', col: '#4cc9f0', petals: 12, r: 20,
    phases: [
      { hp: 1100, time: 30, move: 'wander', emit: [{ k: 'aimed', every: 60, n: 7, arc: 1.2, spd: 2.4, layers: 3, spd2: 1.6, col: CYAN }, { k: 'ring', every: 70, n: 20, spd: 1.3, delay: 35, col: BLUE }] },
      { name: "Water Sign 'Lotus Ripple'", hp: 1300, time: 35, move: 'center', emit: [{ k: 'ring', every: 22, n: 24, spd: 1.35, spin: 0.07, col: CYAN, r: 4 }, { k: 'aimed', every: 110, n: 1, spd: 2.6, r: 8, col: WHITE }] },
      { name: "Rain Sign 'Monsoon Garden'", hp: 1400, time: 40, move: 'sway', emit: [{ k: 'rain', every: 5, n: 1, spd: 1.5, spd2: 2.2, col: BLUE }, { k: 'aimed', every: 55, n: 1, spd: 2.8, burst: 3, gap: 5, col: WHITE, delay: 20 }] },
    ],
  },
  // ---------- Stage 3 ----------
  owl: {
    id: 'owl', name: 'Owl Lantern', title: 'Mid-boss', col: '#ffd166', petals: 8, r: 17,
    phases: [
      { hp: 800, time: 25, move: 'sway', emit: [{ k: 'spiral', every: 5, n: 4, spin: 0.17, spd: 1.7, col: YELLOW }] },
      { name: "Hoot Sign 'Twin Lamps'", hp: 950, time: 30, move: 'center', emit: [{ k: 'ring', every: 40, n: 18, spd: 1.6, aim: true, col: ORANGE, ox: -40 }, { k: 'ring', every: 40, n: 18, spd: 1.6, aim: true, col: YELLOW, ox: 40, delay: 20 }] },
    ],
  },
  moth: {
    id: 'moth', name: 'Moon Moth', title: 'Dancer of the Orchard', col: '#b388ff', petals: 12, r: 21,
    phases: [
      { hp: 1300, time: 30, move: 'wander', emit: [{ k: 'ring', every: 36, n: 20, spd: 1.6, spin: 0.15, col: PURPLE }, { k: 'aimed', every: 50, n: 3, arc: 0.3, spd: 2.8, layers: 2, spd2: 2.2, col: WHITE }] },
      { name: "Moth Sign 'Powder Spiral'", hp: 1500, time: 38, move: 'center', emit: [{ k: 'spiral', every: 5, n: 5, spin: 0.09, spd: 0.6, acc: 0.025, mirror: true, col: PURPLE, r: 3.5 }] },
      { name: "Moon Sign 'Crescent Rings'", hp: 1600, time: 40, move: 'sway', emit: [{ k: 'flower', every: 34, n: 22, spd: 1.6, turn: 0.012, col: YELLOW, r: 4 }, { k: 'aimed', every: 70, n: 5, arc: 0.5, spd: 2.6, col: WHITE, delay: 30 }] },
      { name: "Night Sign 'Lamp Swarm'", hp: 1700, time: 42, move: 'wander', emit: [{ k: 'random', every: 3, n: 2, spd: 1.2, spd2: 2.6, arc: TAU, col: ORANGE, r: 3.5 }, { k: 'ring', every: 60, n: 12, spd: 2.4, aim: true, col: RED, r: 6 }] },
    ],
  },
  // ---------- Stage 4 ----------
  imp: {
    id: 'imp', name: 'Spark Imp', title: 'Mid-boss', col: '#ff9f43', petals: 7, r: 16,
    phases: [
      { hp: 950, time: 25, move: 'wander', emit: [{ k: 'aimed', every: 40, n: 9, arc: 1.4, spd: 2.5, layers: 2, spd2: 1.8, col: ORANGE }] },
      { name: "Spark Sign 'Fuse Wheel'", hp: 1150, time: 30, move: 'center', emit: [{ k: 'spiral', every: 4, n: 3, spin: 0.21, spd: 1.9, col: ORANGE }, { k: 'ring', every: 60, n: 16, spd: 1.2, col: RED, r: 6 }] },
    ],
  },
  cinder: {
    id: 'cinder', name: 'Cinder Rose', title: 'Queen of the Ember Grove', col: '#ff6b35', petals: 14, r: 22,
    phases: [
      { hp: 1500, time: 32, move: 'wander', emit: [{ k: 'ring', every: 30, n: 24, spd: 1.7, spin: 0.13, col: ORANGE }, { k: 'aimed', every: 45, n: 5, arc: 0.7, spd: 3, col: YELLOW }] },
      { name: "Fire Sign 'Ember Petals'", hp: 1700, time: 38, move: 'center', emit: [{ k: 'flower', every: 26, n: 20, spd: 1.8, turn: 0.014, col: RED, r: 4 }, { k: 'rain', every: 10, n: 1, spd: 1.5, col: ORANGE }] },
      { name: "Ash Sign 'Smoulder Spiral'", hp: 1800, time: 40, move: 'sway', emit: [{ k: 'spiral', every: 4, n: 4, spin: 0.11, spd: 1.8, mirror: true, col: ORANGE, r: 3.5 }, { k: 'aimed', every: 80, n: 1, spd: 2.4, r: 9, col: RED }] },
      { name: "Blaze Sign 'Wildfire Garden'", hp: 1900, time: 42, move: 'wander', emit: [{ k: 'random', every: 2, n: 1, spd: 1.4, spd2: 2.8, arc: 2.6, col: ORANGE, r: 3.5 }, { k: 'ring', every: 45, n: 18, spd: 2, aim: true, col: YELLOW }] },
    ],
  },
  // ---------- Stage 5 ----------
  seedling: {
    id: 'seedling', name: 'Star Seedling', title: 'Mid-boss', col: '#ffffff', petals: 8, r: 17,
    phases: [
      { hp: 1100, time: 25, move: 'sway', emit: [{ k: 'ring', every: 26, n: 20, spd: 1.8, spin: 0.17, col: WHITE }, { k: 'aimed', every: 60, n: 3, arc: 0.3, spd: 3, col: YELLOW }] },
      { name: "Star Sign 'Seed of Light'", hp: 1300, time: 30, move: 'center', emit: [{ k: 'spiral', every: 4, n: 5, spin: 0.15, spd: 1.5, acc: 0.01, col: YELLOW, r: 3.5 }, { k: 'aimed', every: 70, n: 7, arc: 0.9, spd: 2.6, col: WHITE }] },
    ],
  },
  bloom: {
    id: 'bloom', name: 'The Last Bloom', title: 'Heart of the Starlit Garden', col: '#ff70a6', petals: 16, r: 24,
    phases: [
      { hp: 1700, time: 32, move: 'wander', emit: [{ k: 'ring', every: 26, n: 26, spd: 1.7, spin: 0.09, col: PINK }, { k: 'aimed', every: 40, n: 5, arc: 0.6, spd: 3, layers: 2, spd2: 2.2, col: WHITE }] },
      { name: "Petal Sign 'Thousand Bloom'", hp: 1900, time: 40, move: 'center', emit: [{ k: 'flower', every: 22, n: 24, spd: 1.6, turn: 0.011, col: PINK, r: 4 }, { k: 'flower', every: 22, n: 24, spd: 1.2, turn: -0.009, col: PURPLE, r: 3.5, delay: 11 }] },
      { name: "Star Sign 'Garden Galaxy'", hp: 2000, time: 42, move: 'center', emit: [{ k: 'spiral', every: 4, n: 6, spin: 0.07, spd: 1.7, mirror: true, col: CYAN, r: 3.5 }, { k: 'aimed', every: 90, n: 1, spd: 2.2, r: 10, col: WHITE }] },
      { name: "Thorn Sign 'Crown of Briars'", hp: 2100, time: 42, move: 'sway', emit: [{ k: 'ring', every: 18, n: 18, spd: 1.9, spin: 0.21, col: GREEN }, { k: 'rain', every: 8, n: 1, spd: 1.8, col: RED }, { k: 'aimed', every: 55, n: 3, arc: 0.25, spd: 3.3, col: WHITE }] },
      { name: "Last Sign 'Eternal Spring'", hp: 2400, time: 50, move: 'center', emit: [{ k: 'spiral', every: 3, n: 3, spin: 0.19, spd: 1.6, col: PINK, r: 3.5 }, { k: 'flower', every: 40, n: 20, spd: 1.4, turn: 0.013, col: YELLOW, r: 4.5 }, { k: 'aimed', every: 70, n: 5, arc: 0.5, spd: 2.8, col: WHITE }] },
    ],
  },
};

export interface StageDef {
  name: string;
  sub: string;
  icon: string;
  /** Background gradient (top, bottom) and the color of the scrolling petals. */
  bg: [string, string];
  deco: string;
  waves: WaveDef[];
  mid: string;
  boss: string;
}

const w = (e: string, n: number, gap: number, path: PathKind, xs: SpawnX, dur: number): WaveDef => ({ e, n, gap, path, xs, dur });

export const STAGES: StageDef[] = [
  {
    name: 'Meadow Dawn', sub: 'The garden wakes up', icon: '🌼', bg: ['#2a1a3e', '#3d2350'], deco: '#ff9ec7', mid: 'thistle', boss: 'briar',
    waves: [w('bud', 6, 18, 'down', 'line', 150), w('bud', 5, 20, 'swoop', 'left', 160), w('bud', 5, 20, 'swoop', 'right', 160), w('wisp', 3, 30, 'stop', 'rand', 200), w('sprite', 2, 40, 'stop', 'pair', 220), w('dart', 6, 12, 'dive', 'rand', 140), w('beetle', 1, 1, 'stop', 'mid', 260)],
  },
  {
    name: 'Rain Garden', sub: 'Lily pads and falling dew', icon: '🪷', bg: ['#10243a', '#1b3b52'], deco: '#8be9fd', mid: 'dew', boss: 'lotus',
    waves: [w('wisp', 5, 20, 'sine', 'line', 170), w('bud', 8, 12, 'swoop', 'left', 170), w('bud', 8, 12, 'swoop', 'right', 170), w('sprite', 3, 35, 'stop', 'rand', 220), w('dart', 8, 10, 'dive', 'rand', 150), w('beetle', 2, 60, 'stop', 'pair', 280), w('orbiter', 1, 1, 'stop', 'mid', 300)],
  },
  {
    name: 'Night Orchard', sub: 'Lanterns between the trees', icon: '🌙', bg: ['#0e0b24', '#221a45'], deco: '#ffd166', mid: 'owl', boss: 'moth',
    waves: [w('wisp', 6, 16, 'sine', 'line', 170), w('sprite', 4, 30, 'stop', 'rand', 230), w('dart', 10, 9, 'dive', 'rand', 160), w('bud', 8, 10, 'cross', 'side', 170), w('beetle', 2, 50, 'stop', 'pair', 260), w('lantern', 1, 1, 'stop', 'mid', 320), w('orbiter', 2, 80, 'stop', 'pair', 320)],
  },
  {
    name: 'Ember Grove', sub: 'The leaves are burning', icon: '🍁', bg: ['#2b0f10', '#4a1d16'], deco: '#ff9f43', mid: 'imp', boss: 'cinder',
    waves: [w('dart', 12, 8, 'dive', 'rand', 160), w('wisp', 6, 14, 'swoop', 'left', 170), w('wisp', 6, 14, 'swoop', 'right', 170), w('sprite', 4, 26, 'stop', 'rand', 220), w('lantern', 1, 1, 'stop', 'mid', 300), w('beetle', 3, 40, 'stop', 'line', 280), w('orbiter', 2, 60, 'stop', 'pair', 320)],
  },
  {
    name: 'Starlit Bloom', sub: 'The heart of the garden', icon: '✨', bg: ['#060818', '#1a1035'], deco: '#ffffff', mid: 'seedling', boss: 'bloom',
    waves: [w('sprite', 5, 24, 'stop', 'rand', 230), w('dart', 14, 7, 'dive', 'rand', 160), w('wisp', 8, 12, 'cross', 'side', 180), w('lantern', 2, 90, 'stop', 'pair', 320), w('orbiter', 2, 50, 'stop', 'pair', 300), w('beetle', 3, 35, 'sine', 'line', 260), w('bud', 10, 8, 'swoop', 'left', 160)],
  },
];

export interface ShipDef {
  id: string;
  name: string;
  icon: string;
  col: string;
  text: string;
  speed: number;
  focusSpeed: number;
  /** Damage of one main shot bullet. */
  dmg: number;
  /** Main shot streams. */
  streams: number;
  lives: number;
  bombs: number;
  /** Parts the ship starts with. */
  start: Record<string, number>;
  grazeMul: number;
  /** Seeds needed to unlock. 0 = free. */
  cost: number;
}

export const SHIPS: ShipDef[] = [
  { id: 'petal', name: 'Petal', icon: '🌸', col: '#ff70a6', text: 'Balanced. Two forward streams.', speed: 3.4, focusSpeed: 1.5, dmg: 2, streams: 2, lives: 3, bombs: 2, start: {}, grazeMul: 1, cost: 0 },
  { id: 'thorn', name: 'Thorn', icon: '🌹', col: '#ff4d6d', text: 'Starts with a laser. Weaker main shot. 1 life less.', speed: 3.1, focusSpeed: 1.35, dmg: 1.6, streams: 2, lives: 2, bombs: 2, start: { laser: 1 }, grazeMul: 1, cost: 40 },
  { id: 'breeze', name: 'Breeze', icon: '🍃', col: '#7ee08a', text: 'Fast. Starts with a spread shot, weaker main shot.', speed: 4.1, focusSpeed: 1.8, dmg: 1.7, streams: 2, lives: 3, bombs: 2, start: { spread: 1 }, grazeMul: 1, cost: 60 },
  { id: 'moth', name: 'Moth', icon: '🦋', col: '#b388ff', text: 'Starts with a drone and 3 bombs. Grazing charges 50% faster. 1 life less.', speed: 3.4, focusSpeed: 1.5, dmg: 2, streams: 2, lives: 2, bombs: 3, start: { drone: 1 }, grazeMul: 1.5, cost: 90 },
];

export interface PartDef {
  id: string;
  name: string;
  icon: string;
  max: number;
  text: (lvl: number) => string;
}

export const PARTS: Record<string, PartDef> = {
  spread: { id: 'spread', name: 'Spread Shot', icon: '🌿', max: 3, text: (l) => `+2 angled streams (level ${l}). Focus narrows them.` },
  drone: { id: 'drone', name: 'Homing Drone', icon: '🛰️', max: 4, text: (l) => `${l} drone${l > 1 ? 's' : ''} fire homing needles.` },
  laser: { id: 'laser', name: 'Petal Laser', icon: '🔆', max: 3, text: (l) => `A piercing beam, ${l * 21} damage per second. +50% in focus.` },
  power: { id: 'power', name: 'Power Core', icon: '💥', max: 3, text: (l) => `All shots deal +${l * 20}% damage.` },
  bigbomb: { id: 'bigbomb', name: 'Bigger Bomb', icon: '💣', max: 3, text: (l) => `Bombs last ${(2 + l * 0.5).toFixed(1)} s and hit ${l * 50}% harder. +1 bomb now.` },
  thruster: { id: 'thruster', name: 'Thrusters', icon: '🚀', max: 2, text: (l) => `+${l * 12}% move speed.` },
  magnet: { id: 'magnet', name: 'Pollen Magnet', icon: '🧲', max: 2, text: (l) => `Pull items from ${40 + l * 30} px away.` },
  graze: { id: 'graze', name: 'Graze Amp', icon: '✴️', max: 2, text: (l) => `Grazes charge the bomb ${l * 50}% faster and score double.` },
  shield: { id: 'shield', name: 'Bud Shield', icon: '🛡️', max: 1, text: () => 'Blocks the first hit in each stage.' },
  life: { id: 'life', name: 'Spare Petal', icon: '❤️', max: 9, text: () => '+1 life now.' },
  bombs: { id: 'bombs', name: 'Bomb Pouch', icon: '🌺', max: 9, text: () => '+2 bombs now.' },
};

export const PART_IDS = Object.keys(PARTS);
