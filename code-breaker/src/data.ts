/** Static content: peg colors, tools, gear, lock types, floors and meta unlocks. */

export interface PegColor {
  name: string;
  hex: string;
  /** Text color on the peg. */
  ink: string;
  /** Symbol on the peg, so players can tell pegs apart without color. */
  sym: string;
  /** Keyboard key (the number key `index + 1` works too). */
  key: string;
}

export const COLORS: readonly PegColor[] = [
  { name: 'Red', hex: '#e8504f', ink: '#2a0606', sym: '▲', key: 'r' },
  { name: 'Orange', hex: '#f39b2f', ink: '#2c1500', sym: '●', key: 'o' },
  { name: 'Yellow', hex: '#f2e14c', ink: '#2b2600', sym: '★', key: 'y' },
  { name: 'Green', hex: '#3fbf6f', ink: '#03200d', sym: '■', key: 'g' },
  { name: 'Blue', hex: '#3d8fe0', ink: '#03162b', sym: '◆', key: 'b' },
  { name: 'Purple', hex: '#a66ad9', ink: '#1b0630', sym: '✚', key: 'p' },
  { name: 'Magenta', hex: '#f283c0', ink: '#320a20', sym: '♥', key: 'm' },
  { name: 'White', hex: '#ececec', ink: '#202020', sym: '▼', key: 'w' },
];

export type ToolId = 'reveal' | 'purge' | 'free' | 'probe';

export interface ToolDef {
  id: ToolId;
  icon: string;
  name: string;
  cost: number;
  key: string;
  text: string;
  /** Meta unlock that makes this tool available. Undefined means always available. */
  unlock?: string;
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'purge', icon: '🧹', name: 'Purge', cost: 5, key: 'z', text: 'Removes one color that is not in the code.' },
  { id: 'reveal', icon: '🔍', name: 'Reveal', cost: 9, key: 'x', text: 'Shows the color of one random peg.' },
  { id: 'probe', icon: '🎯', name: 'Probe', cost: 3, key: 'c', text: 'Tests the selected slot: is its color right?', unlock: 'probe' },
  { id: 'free', icon: '🎟️', name: 'Free guess', cost: 7, key: 'v', text: 'Your next guess does not use up a try.', unlock: 'free' },
];

export type ModId = 'none' | 'liar' | 'shifter' | 'blind' | 'timed';

export interface ModDef {
  id: ModId;
  icon: string;
  name: string;
  text: string;
  /** Extra energy when you open a lock with this rule. */
  bonus: number;
  /** Extra tries this rule adds to the lock. */
  tries: number;
  /** Meta unlock (best floor reached) before this lock type appears. */
  needFloor: number;
}

export const MODS: Record<ModId, ModDef> = {
  none: { id: 'none', icon: '🔒', name: 'Plain lock', text: 'No special rule.', bonus: 0, tries: 0, needFloor: 0 },
  liar: { id: 'liar', icon: '🤥', name: 'Liar lock', text: 'One of the first 3 hints is false. +2 tries.', bonus: 2, tries: 2, needFloor: 0 },
  shifter: { id: 'shifter', icon: '🔄', name: 'Shifter lock', text: 'After guess 3 the code turns one step to the right.', bonus: 2, tries: 0, needFloor: 0 },
  blind: { id: 'blind', icon: '🙈', name: 'Blind lock', text: 'The hint of guess 2 stays hidden. +1 try.', bonus: 2, tries: 1, needFloor: 2 },
  timed: { id: 'timed', icon: '⏱️', name: 'Timed lock', text: 'Open it before the clock runs out.', bonus: 3, tries: 0, needFloor: 3 },
};

export type GearId =
  | 'charm'
  | 'battery'
  | 'magnifier'
  | 'ledger'
  | 'detector'
  | 'anchor'
  | 'hourglass'
  | 'plating'
  | 'spark'
  | 'echo'
  | 'stetho'
  | 'piggy';

export interface GearDef {
  id: GearId;
  icon: string;
  name: string;
  text: string;
  price: number;
}

export const GEAR: Record<GearId, GearDef> = {
  charm: { id: 'charm', icon: '🍀', name: 'Lucky Charm', text: '+1 try on every lock.', price: 20 },
  battery: { id: 'battery', icon: '🔋', name: 'Battery', text: '+2 energy for each lock you open.', price: 10 },
  magnifier: { id: 'magnifier', icon: '🔎', name: 'Magnifier', text: 'Reveal costs 2 less.', price: 9 },
  ledger: { id: 'ledger', icon: '📒', name: 'Ledger', text: 'Each lock starts with one wrong color removed.', price: 14 },
  detector: { id: 'detector', icon: '🚨', name: 'Lie Detector', text: 'Liar locks mark the false hint.', price: 8 },
  anchor: { id: 'anchor', icon: '⚓', name: 'Anchor', text: 'Shifter locks do not turn.', price: 8 },
  hourglass: { id: 'hourglass', icon: '⏳', name: 'Hourglass', text: 'Timed locks give 45 s more. Blind locks show their hint.', price: 7 },
  plating: { id: 'plating', icon: '🛡️', name: 'Plating', text: '+1 max heart and heal 1.', price: 12 },
  spark: { id: 'spark', icon: '⚡', name: 'Spark Plug', text: 'The first tool on each lock costs 2 less.', price: 10 },
  echo: { id: 'echo', icon: '🔔', name: 'Echo Bell', text: 'Open a lock with half of its tries left: +3 energy.', price: 10 },
  stetho: { id: 'stetho', icon: '🩺', name: 'Stethoscope', text: 'The first guess on each lock is free.', price: 22 },
  piggy: { id: 'piggy', icon: '🐷', name: 'Piggy Bank', text: 'Gain 2 energy when you enter a room.', price: 9 },
};

export const GEAR_IDS = Object.keys(GEAR) as GearId[];

export type RoomKind = 'loot' | 'shop' | 'mystery' | 'vault';

export const ROOMS: Record<RoomKind, { icon: string; name: string; text: string }> = {
  loot: { icon: '💰', name: 'Loot room', text: 'Pick one of 3 rewards.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Spend energy on gear and repairs.' },
  mystery: { icon: '❓', name: 'Mystery room', text: 'Rich loot or a trap.' },
  vault: { icon: '🏦', name: 'Floor vault', text: 'You must open it. Pick one of 3 gear.' },
};

export interface FloorDef {
  name: string;
  icon: string;
  len: number;
  colors: number;
  /** Chance that a lock allows repeated colors. */
  rep: number;
  limit: number;
  /** Chance that a door lock has a special rule. */
  modChance: number;
  vault: { len: number; colors: number; rep: boolean; limit: number; mod: boolean };
}

export const FLOORS: readonly FloorDef[] = [
  { name: 'Outer Hall', icon: '🚪', len: 4, colors: 5, rep: 0, limit: 5, modChance: 0.25, vault: { len: 4, colors: 6, rep: false, limit: 5, mod: false } },
  { name: 'Iron Gallery', icon: '⛓️', len: 4, colors: 6, rep: 0.5, limit: 5, modChance: 0.5, vault: { len: 4, colors: 6, rep: true, limit: 6, mod: true } },
  { name: 'Gold Stacks', icon: '🪙', len: 5, colors: 7, rep: 0.5, limit: 5, modChance: 0.7, vault: { len: 5, colors: 7, rep: false, limit: 5, mod: true } },
];

/** The final vault: three tumblers in a row. */
export const FINAL: readonly { len: number; colors: number; rep: boolean; limit: number }[] = [
  { len: 5, colors: 7, rep: true, limit: 5 },
  { len: 5, colors: 8, rep: false, limit: 5 },
  { len: 5, colors: 8, rep: true, limit: 5 },
];

/** Door choices per floor before the floor vault. */
export const STEPS_PER_FLOOR = 3;

export interface UnlockDef {
  id: string;
  icon: string;
  name: string;
  text: string;
  cost: number;
}

export const UNLOCKS: readonly UnlockDef[] = [
  { id: 'energy', icon: '⚡', name: 'Charged Start', text: 'Start each run with +4 energy.', cost: 4 },
  { id: 'probe', icon: '🎯', name: 'Probe tool', text: 'Adds the Probe tool: test one slot.', cost: 6 },
  { id: 'lens', icon: '🧮', name: 'Solver Lens', text: 'Shows how many codes are still possible.', cost: 8 },
  { id: 'free', icon: '🎟️', name: 'Free Guess tool', text: 'Adds the Free guess tool.', cost: 10 },
  { id: 'heart', icon: '❤️', name: 'Thick Skin', text: 'Start each run with +1 max heart.', cost: 14 },
  { id: 'kit', icon: '🧰', name: 'Starter Kit', text: 'Start each run with one random gear.', cost: 18 },
];
