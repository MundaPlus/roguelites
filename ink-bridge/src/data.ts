import type { Mat } from './physics';

export interface PenDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  mat: Mat;
  /** Glue strokes stay where you draw them. */
  glue?: boolean;
  text: string;
  /** Lifetime stars needed before chests can hold this pen. */
  unlock: number;
}

export const PENS: Record<string, PenDef> = {
  pencil: { id: 'pencil', name: 'Pencil', icon: '✏️', color: '#f4f1ea', mat: { density: 1, fric: 0.7, rest: 0.05 }, text: 'Plain ink. Always in your hand. No charge limit.', unlock: 0 },
  rubber: { id: 'rubber', name: 'Rubber Pen', icon: '🟢', color: '#5ee08a', mat: { density: 1, fric: 0.95, rest: 0.85 }, text: 'Bouncy strokes. The ball jumps off them.', unlock: 0 },
  heavy: { id: 'heavy', name: 'Lead Pen', icon: '⚫', color: '#8d99ae', mat: { density: 6, fric: 0.8, rest: 0 }, text: 'Six times heavier. Pushes crates and holds bridges down.', unlock: 0 },
  glue: { id: 'glue', name: 'Glue Pen', icon: '📌', color: '#ffd166', mat: { density: 1, fric: 0.8, rest: 0.05 }, glue: true, text: 'The stroke stays where you draw it. Strokes that cross it stay too.', unlock: 15 },
  ice: { id: 'ice', name: 'Ice Pen', icon: '🧊', color: '#7fd8ff', mat: { density: 1, fric: 0.01, rest: 0 }, text: 'No friction. Crates and balls slide far.', unlock: 35 },
};

export const PEN_ORDER = ['pencil', 'rubber', 'heavy', 'glue', 'ice'];

export interface CharmDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  unlock: number;
}

export const CHARMS: Record<string, CharmDef> = {
  inkwell: { id: 'inkwell', name: 'Big Inkwell', icon: '🫙', text: '+25% ink in every level.', unlock: 0 },
  hourglass: { id: 'hourglass', name: 'Hourglass', icon: '⏳', text: 'Boss timers +10 s. Time star limits +50%.', unlock: 0 },
  patch: { id: 'patch', name: 'Patch Kit', icon: '🩹', text: 'The first miss in each world costs no heart.', unlock: 0 },
  lens: { id: 'lens', name: 'Star Lens', icon: '🔭', text: '+1 star for each level you clear with 3 stars.', unlock: 0 },
  case: { id: 'case', name: 'Pen Case', icon: '🧰', text: 'Every pen you find has +2 charges.', unlock: 25 },
  heart: { id: 'heart', name: 'Paper Heart', icon: '💗', text: '+1 max heart and heal 1 now.', unlock: 50 },
};

export const CHARM_ORDER = ['inkwell', 'hourglass', 'patch', 'lens', 'case', 'heart'];

export interface WorldDef {
  name: string;
  icon: string;
  sky: [string, string];
  ground: string;
  text: string;
}

export const WORLDS: WorldDef[] = [
  { name: 'Paper Hills', icon: '⛰️', sky: ['#2a1b33', '#120c18'], ground: '#c9a6ff', text: 'Gaps, ramps and cups. Learn the pencil.' },
  { name: 'Workshop', icon: '🧰', sky: ['#1b2633', '#0c1218'], ground: '#ffb36b', text: 'Crates, targets and no-draw zones.' },
  { name: 'Clockwork', icon: '⚙️', sky: ['#33201b', '#180f0c'], ground: '#ff5d8f', text: 'Moving parts, spikes and tight ink.' },
];

/** Meta unlocks that change the start of a run. */
export const PERKS = [
  { id: 'start-heart', name: 'Spare Heart', icon: '❤️', text: 'Start each run with +1 heart.', unlock: 60 },
  { id: 'start-rubber', name: 'Starter Rubber', icon: '🟢', text: 'Start each run with a Rubber Pen (2 charges).', unlock: 90 },
  { id: 'start-ink', name: 'Deep Well', icon: '🖋️', text: 'Start each run with +10% ink.', unlock: 130 },
];
