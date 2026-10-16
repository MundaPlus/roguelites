/** Static game data: regions, fish, gear, ports, curses, night events. */

export type RegionId = 'shallows' | 'kelp' | 'coral' | 'ash' | 'trench';
export type Pattern = 'steady' | 'jumpy' | 'diver' | 'thrash' | 'erratic';
export type TimeOfDay = 'day' | 'night' | 'any';
export type CurseId = 'whisper' | 'heavy' | 'gnaw' | 'leak';

export interface RegionDef {
  id: RegionId;
  name: string;
  /** Map center used to split the sea into regions. */
  cx: number;
  cy: number;
  water: string;
  rocks: number;
  /** A catch of this fish opens the region. Null = open from the start. */
  key: string | null;
}

export const REGIONS: RegionDef[] = [
  { id: 'shallows', name: 'Grey Shallows', cx: 470, cy: 1000, water: '#1b4a5e', rocks: 10, key: null },
  { id: 'kelp', name: 'Kelp Reach', cx: 870, cy: 380, water: '#17503f', rocks: 14, key: null },
  { id: 'coral', name: 'Coral Teeth', cx: 1080, cy: 1440, water: '#1d4f63', rocks: 38, key: 'pearlcarp' },
  { id: 'ash', name: 'Ashen Flats', cx: 1860, cy: 1330, water: '#3a3a40', rocks: 18, key: 'goldgrouper' },
  { id: 'trench', name: 'The Trench', cx: 1860, cy: 460, water: '#0f2236', rocks: 16, key: 'crownturtle' },
];

export const regionIndex = (id: RegionId): number => REGIONS.findIndex((r) => r.id === id);

export interface FishDef {
  id: string;
  name: string;
  icon: string;
  region: RegionId;
  /** Rows of '#' (cell) and '.' (empty). */
  shape: string[];
  value: number;
  pattern: Pattern;
  /** Pull strength. Above 0.8 the fish raises the tension even when you do not reel. */
  power: number;
  /** Seconds of reeling in the safe zone to land the fish. */
  stamina: number;
  time: TimeOfDay;
  /** Water depth the fish needs (spot depth and rod depth). */
  depth: number;
  weight: number;
  /** Region this fish opens when you land it. */
  unlocks?: RegionId;
  color: string;
}

export const FISH: FishDef[] = [
  // Grey Shallows
  { id: 'sprat', name: 'Sprat', icon: '🐟', region: 'shallows', shape: ['#'], value: 7, pattern: 'steady', power: 0.25, stamina: 2, time: 'any', depth: 1, weight: 10, color: '#9fb7c4' },
  { id: 'mackerel', name: 'Mackerel', icon: '🐟', region: 'shallows', shape: ['##'], value: 15, pattern: 'jumpy', power: 0.35, stamina: 2.5, time: 'day', depth: 1, weight: 8, color: '#5fa8d3' },
  { id: 'flounder', name: 'Flounder', icon: '🐠', region: 'shallows', shape: ['##', '##'], value: 26, pattern: 'steady', power: 0.4, stamina: 3, time: 'any', depth: 1, weight: 6, color: '#c2a878' },
  { id: 'cod', name: 'Cod', icon: '🐟', region: 'shallows', shape: ['###'], value: 30, pattern: 'diver', power: 0.42, stamina: 3, time: 'any', depth: 2, weight: 6, color: '#a3b18a' },
  { id: 'gloomeel', name: 'Gloom Eel', icon: '🐍', region: 'shallows', shape: ['####'], value: 52, pattern: 'thrash', power: 0.5, stamina: 3.5, time: 'night', depth: 1, weight: 5, color: '#6c757d' },
  { id: 'pearlcarp', name: 'Pearl Carp', icon: '🐡', region: 'shallows', shape: ['##', '#.'], value: 120, pattern: 'jumpy', power: 0.55, stamina: 4, time: 'any', depth: 1, weight: 1.8, unlocks: 'coral', color: '#f8edeb' },
  // Kelp Reach
  { id: 'kelpfish', name: 'Kelpfish', icon: '🐟', region: 'kelp', shape: ['##'], value: 17, pattern: 'steady', power: 0.3, stamina: 2.2, time: 'any', depth: 1, weight: 10, color: '#74c69d' },
  { id: 'bass', name: 'Sea Bass', icon: '🐠', region: 'kelp', shape: ['##', '##'], value: 36, pattern: 'diver', power: 0.45, stamina: 3.2, time: 'day', depth: 1, weight: 7, color: '#adb5bd' },
  { id: 'lionfish', name: 'Lionfish', icon: '🐡', region: 'kelp', shape: ['#.', '##'], value: 42, pattern: 'jumpy', power: 0.5, stamina: 3, time: 'any', depth: 1, weight: 5, color: '#e76f51' },
  { id: 'squid', name: 'Lantern Squid', icon: '🦑', region: 'kelp', shape: ['###', '.#.'], value: 60, pattern: 'erratic', power: 0.5, stamina: 3.4, time: 'night', depth: 1, weight: 5, color: '#f4a261' },
  { id: 'lobster', name: 'Rock Lobster', icon: '🦞', region: 'kelp', shape: ['#.', '##', '#.'], value: 55, pattern: 'steady', power: 0.48, stamina: 3, time: 'any', depth: 2, weight: 4, color: '#d62828' },
  { id: 'goldgrouper', name: 'Golden Grouper', icon: '🐠', region: 'kelp', shape: ['##', '##', '##'], value: 200, pattern: 'diver', power: 0.62, stamina: 4.5, time: 'any', depth: 2, weight: 1.8, unlocks: 'ash', color: '#ffd166' },
  // Coral Teeth
  { id: 'parrot', name: 'Parrotfish', icon: '🐠', region: 'coral', shape: ['##', '##'], value: 46, pattern: 'steady', power: 0.45, stamina: 3, time: 'day', depth: 1, weight: 8, color: '#48cae4' },
  { id: 'jelly', name: 'Box Jelly', icon: '🪼', region: 'coral', shape: ['#', '#'], value: 40, pattern: 'jumpy', power: 0.4, stamina: 2.6, time: 'night', depth: 1, weight: 6, color: '#cdb4db' },
  { id: 'moray', name: 'Moray Eel', icon: '🐍', region: 'coral', shape: ['####'], value: 70, pattern: 'thrash', power: 0.6, stamina: 3.5, time: 'any', depth: 1, weight: 6, color: '#90a955' },
  { id: 'reefshark', name: 'Reef Shark', icon: '🦈', region: 'coral', shape: ['####', '.##.'], value: 130, pattern: 'diver', power: 0.68, stamina: 4.5, time: 'any', depth: 2, weight: 3, color: '#8d99ae' },
  { id: 'crownturtle', name: 'Crown Turtle', icon: '🐢', region: 'coral', shape: ['.#.', '###', '.#.'], value: 320, pattern: 'diver', power: 0.7, stamina: 5, time: 'any', depth: 2, weight: 1.8, unlocks: 'trench', color: '#52b788' },
  // Ashen Flats
  { id: 'ashsole', name: 'Ash Sole', icon: '🐟', region: 'ash', shape: ['###', '###'], value: 85, pattern: 'steady', power: 0.5, stamina: 3.5, time: 'any', depth: 1, weight: 7, color: '#b5a99a' },
  { id: 'cindercrab', name: 'Cinder Crab', icon: '🦀', region: 'ash', shape: ['##', '##'], value: 74, pattern: 'jumpy', power: 0.55, stamina: 3, time: 'any', depth: 1, weight: 7, color: '#e85d04' },
  { id: 'bonepike', name: 'Bone Pike', icon: '🐟', region: 'ash', shape: ['#####'], value: 120, pattern: 'thrash', power: 0.65, stamina: 4, time: 'night', depth: 2, weight: 4, color: '#e9ecef' },
  { id: 'emberkoi', name: 'Ember Koi', icon: '🐠', region: 'ash', shape: ['##.', '###'], value: 340, pattern: 'erratic', power: 0.72, stamina: 5, time: 'any', depth: 2, weight: 1.8, unlocks: 'trench', color: '#ff7b00' },
  // The Trench
  { id: 'angler', name: 'Anglerfish', icon: '🐡', region: 'trench', shape: ['##', '##'], value: 150, pattern: 'jumpy', power: 0.62, stamina: 4, time: 'any', depth: 2, weight: 7, color: '#3a86ff' },
  { id: 'gulper', name: 'Gulper Eel', icon: '🐍', region: 'trench', shape: ['###', '##.'], value: 190, pattern: 'diver', power: 0.7, stamina: 4.5, time: 'any', depth: 2, weight: 6, color: '#5a189a' },
  { id: 'oarfish', name: 'Oarfish', icon: '🐉', region: 'trench', shape: ['#####'], value: 250, pattern: 'thrash', power: 0.72, stamina: 5, time: 'night', depth: 3, weight: 4, color: '#ef476f' },
  { id: 'oldmother', name: 'The Old Mother', icon: '🐋', region: 'trench', shape: ['###', '###', '###'], value: 1200, pattern: 'erratic', power: 0.8, stamina: 7, time: 'night', depth: 3, weight: 0.5, color: '#9d4edd' },
];

export const FISH_BY_ID: Record<string, FishDef> = Object.fromEntries(FISH.map((f) => [f.id, f]));

export const PATTERN_TEXT: Record<Pattern, string> = {
  steady: 'Steady: an even pull.',
  jumpy: 'Jumpy: short hard tugs.',
  diver: 'Deep diver: long strong dives, then a rest.',
  thrash: 'Thrasher: the pull rises and falls fast.',
  erratic: 'Erratic: the pull changes at random.',
};

export interface CurseDef {
  id: CurseId;
  name: string;
  text: string;
}

export const CURSES: Record<CurseId, CurseDef> = {
  whisper: { id: 'whisper', name: 'Whispering', text: 'Panic rises 30% faster while it is aboard.' },
  heavy: { id: 'heavy', name: 'Heavy', text: 'The boat is 10% slower while it is aboard.' },
  gnaw: { id: 'gnaw', name: 'Gnawing', text: 'At dawn it eats a fish next to it.' },
  leak: { id: 'leak', name: 'Leaking', text: 'At night it can crack the hull.' },
};

export const ABERRANT_PREFIX = ['Twisted', 'Many-eyed', 'Hollow', 'Pale', 'Weeping', 'Toothed'];

// ---------- Gear ----------

export interface RodDef {
  name: string;
  cost: number;
  /** Slows down line strain. */
  strength: number;
  /** Width of the safe tension zone. */
  zone: number;
  depth: number;
}
export interface EngineDef {
  name: string;
  cost: number;
  speed: number;
}
export interface HullDef {
  name: string;
  cost: number;
  hp: number;
}
export interface HoldDef {
  name: string;
  cost: number;
  w: number;
  h: number;
}
export interface LampDef {
  name: string;
  cost: number;
  radius: number;
  /** Light damage to shades per second. */
  burn: number;
  /** Multiplier on panic gain at night. */
  calm: number;
}
export interface LureDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  text: string;
}

export const RODS: RodDef[] = [
  { name: 'Bamboo Rod', cost: 0, strength: 1, zone: 0.3, depth: 1 },
  { name: 'Fiberglass Rod', cost: 170, strength: 1.4, zone: 0.34, depth: 2 },
  { name: 'Carbon Rod', cost: 460, strength: 1.9, zone: 0.38, depth: 2 },
  { name: 'Abyssal Rod', cost: 1000, strength: 2.6, zone: 0.44, depth: 3 },
];
export const ENGINES: EngineDef[] = [
  { name: 'Putter Engine', cost: 0, speed: 1 },
  { name: 'Twin Engine', cost: 190, speed: 1.22 },
  { name: 'Diesel Engine', cost: 480, speed: 1.45 },
  { name: 'Turbine', cost: 950, speed: 1.75 },
];
export const HULLS: HullDef[] = [
  { name: 'Plank Hull', cost: 0, hp: 3 },
  { name: 'Oak Hull', cost: 150, hp: 4 },
  { name: 'Steel Hull', cost: 400, hp: 5 },
  { name: 'Ironclad Hull', cost: 850, hp: 6 },
];
export const HOLDS: HoldDef[] = [
  { name: 'Crate Hold', cost: 0, w: 5, h: 4 },
  { name: 'Wide Hold', cost: 150, w: 6, h: 4 },
  { name: 'Deep Hold', cost: 380, w: 6, h: 5 },
  { name: 'Great Hold', cost: 780, w: 7, h: 6 },
];
export const LAMPS: LampDef[] = [
  { name: 'Candle', cost: 0, radius: 130, burn: 0.25, calm: 1 },
  { name: 'Oil Lamp', cost: 140, radius: 180, burn: 0.5, calm: 0.8 },
  { name: 'Searchlight', cost: 400, radius: 250, burn: 0.9, calm: 0.6 },
  { name: 'Lighthouse Lens', cost: 880, radius: 330, burn: 1.4, calm: 0.45 },
];
export const LURES: LureDef[] = [
  { id: 'plain', name: 'Plain Hook', icon: '🪝', cost: 0, text: 'No bonus.' },
  { id: 'spinner', name: 'Spinner', icon: '🌀', cost: 90, text: 'Fast bites. A cast costs 30% less time.' },
  { id: 'glow', name: 'Glow Lure', icon: '✨', cost: 160, text: 'Night fish bite twice as often. Panic rises 20% slower.' },
  { id: 'jig', name: 'Deep Jig', icon: '⚓', cost: 220, text: '+1 rod depth.' },
  { id: 'silver', name: 'Silver Lure', icon: '🥈', cost: 320, text: 'Rare fish bite 2.5 times as often.' },
];
export const LURE_BY_ID: Record<string, LureDef> = Object.fromEntries(LURES.map((l) => [l.id, l]));

export type GearCat = 'rod' | 'engine' | 'hull' | 'hold' | 'lamp';
export const GEAR: Record<GearCat, { label: string; icon: string; tiers: { name: string; cost: number }[] }> = {
  rod: { label: 'Rod', icon: '🎣', tiers: RODS },
  engine: { label: 'Engine', icon: '⚙️', tiers: ENGINES },
  hull: { label: 'Hull', icon: '🛡️', tiers: HULLS },
  hold: { label: 'Hold', icon: '📦', tiers: HOLDS },
  lamp: { label: 'Lamp', icon: '🏮', tiers: LAMPS },
};
export const GEAR_CATS: GearCat[] = ['rod', 'engine', 'hull', 'hold', 'lamp'];

export function gearStat(cat: GearCat, tier: number): string {
  switch (cat) {
    case 'rod': {
      const r = RODS[tier];
      return `strength ${r.strength} · zone ${Math.round(r.zone * 100)}% · depth ${r.depth}`;
    }
    case 'engine':
      return `speed ×${ENGINES[tier].speed}`;
    case 'hull':
      return `${HULLS[tier].hp} hull points`;
    case 'hold':
      return `${HOLDS[tier].w}×${HOLDS[tier].h} cells`;
    case 'lamp':
      return `light ${LAMPS[tier].radius} · panic ×${LAMPS[tier].calm}`;
  }
}

// ---------- Ports ----------

export interface PortDef {
  name: string;
  region: RegionId;
  /** Island center and radius. */
  ix: number;
  iy: number;
  ir: number;
  /** Dock point in the water. */
  dx: number;
  dy: number;
  /** Highest gear tier sold here per category (-1 = none). */
  shop: Partial<Record<GearCat, number>>;
  lures: boolean;
  /** Price multiplier for aberrant fish. */
  aberrant: number;
  home?: boolean;
}

export const PORTS: PortDef[] = [
  { name: 'Greyharbor', region: 'shallows', ix: 150, iy: 1000, ir: 120, dx: 305, dy: 1000, shop: { rod: 1, engine: 1, hull: 1, hold: 1, lamp: 1 }, lures: false, aberrant: 2.2, home: true },
  { name: 'Kelpmoor', region: 'kelp', ix: 760, iy: 140, ir: 90, dx: 760, dy: 265, shop: { hold: 2, rod: 1 }, lures: true, aberrant: 2.2 },
  { name: 'Reefwatch', region: 'coral', ix: 1000, iy: 1710, ir: 90, dx: 1000, dy: 1585, shop: { rod: 2, hull: 2, engine: 2, lamp: 2 }, lures: false, aberrant: 2.2 },
  { name: 'Cinder Pier', region: 'ash', ix: 2260, iy: 1500, ir: 100, dx: 2125, dy: 1500, shop: { lamp: 3, hold: 3, engine: 3 }, lures: true, aberrant: 3.4 },
  { name: 'Lantern Rock', region: 'trench', ix: 2210, iy: 190, ir: 90, dx: 2085, dy: 260, shop: { rod: 3, hull: 3, engine: 3, lamp: 3 }, lures: false, aberrant: 2.6 },
];

// ---------- Night events ----------

export interface EventDef {
  id: string;
  icon: string;
  title: string;
  text: string;
  opts: string[];
}

export const EVENTS: EventDef[] = [
  { id: 'lantern', icon: '🏮', title: 'A drifting lantern', text: 'A lit lantern bobs on the black water. Nobody holds it.', opts: ['Pull it aboard', 'Steer around it'] },
  { id: 'singing', icon: '🎶', title: 'Singing below', text: 'A low song comes up through the hull. It knows your name.', opts: ['Listen', 'Rev the engine to drown it out'] },
  { id: 'drowned', icon: '🧟', title: 'The drowned man', text: 'A grey man treads water next to the boat. "A fish," he says. "Just one."', opts: ['Give him your cheapest fish', 'Refuse'] },
  { id: 'whispers', icon: '👁️', title: 'Your catch whispers', text: 'Something in the hold is talking. It wants to stay.', opts: ['Throw the strangest fish overboard', 'Keep listening'] },
  { id: 'eyes', icon: '👀', title: 'Eyes in the fog', text: 'Dozens of pale eyes blink at you from the fog.', opts: ['Shine the lamp at them', 'Cut the engine and wait'] },
  { id: 'ghostship', icon: '⛵', title: 'A ghost ship', text: 'A ship with torn sails glides past. Its crew points at the water.', opts: ['Search where they point', 'Turn away'] },
  { id: 'tangle', icon: '🪢', title: 'Something on the line', text: 'Your spare line went taut. Something heavy is down there.', opts: ['Haul it up', 'Cut the line'] },
  { id: 'bell', icon: '🔔', title: 'A bell under water', text: 'A bell rings far below, slow and steady.', opts: ['Count the rings', 'Cover your ears'] },
];

export const DEBT = 10000;
export const LAST_DAY = 14;
export const DAY_START = 360; // 06:00
export const NIGHT_START = 1200; // 20:00
export const DAY_END = 1800; // 06:00 next day
