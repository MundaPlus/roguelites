/** Static game data: surfaces, themes, cars, parts, drivers. */

export type Surface = 'asphalt' | 'dirt' | 'ice';

export interface SurfaceDef {
  name: string;
  /** Sideways grip factor. */
  grip: number;
  /** Speed factor. */
  top: number;
  /** Acceleration factor. */
  accel: number;
  color: string;
  edge: string;
}

export const SURFACES: Record<Surface, SurfaceDef> = {
  asphalt: { name: 'Asphalt', grip: 1, top: 1, accel: 1, color: '#3b3d4a', edge: '#2d2f3a' },
  dirt: { name: 'Dirt', grip: 0.55, top: 0.93, accel: 0.85, color: '#8d6038', edge: '#74492a' },
  ice: { name: 'Ice', grip: 0.2, top: 1, accel: 0.55, color: '#b9dff0', edge: '#93c4da' },
};

export type ThemeId = 'city' | 'canyon' | 'tundra' | 'forest';

export interface ThemeDef {
  name: string;
  icon: string;
  /** Weights for asphalt, dirt and ice runs. */
  mix: [number, number, number];
  grass: string;
  grass2: string;
  shoulder: string;
  decor: string[];
}

export const THEMES: Record<ThemeId, ThemeDef> = {
  city: { name: 'City Circuit', icon: '🏙️', mix: [8, 1, 0], grass: '#2f5d3a', grass2: '#2a5434', shoulder: '#596070', decor: ['🏢', '🏬', '🌳', '🚧'] },
  canyon: { name: 'Dust Canyon', icon: '🏜️', mix: [3, 6, 0], grass: '#b9824b', grass2: '#a97543', shoulder: '#cf9a62', decor: ['🌵', '🪨', '🦂', '🌵'] },
  tundra: { name: 'Frost Ring', icon: '❄️', mix: [4, 1, 5], grass: '#dfeef5', grass2: '#cfe2ec', shoulder: '#f4fbff', decor: ['🌲', '⛄', '🧊', '🌲'] },
  forest: { name: 'Pine Rally', icon: '🌲', mix: [4, 4, 1], grass: '#355e2b', grass2: '#2f5426', shoulder: '#6b5a3a', decor: ['🌲', '🌳', '🍄', '🪵'] },
};

export const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Car stats. Multipliers are 1 at base. */
export interface Stats {
  /** Top speed in world units per second. */
  speed: number;
  accel: number;
  grip: number;
  dirt: number;
  ice: number;
  nitroCap: number;
  nitroFill: number;
  nitroPower: number;
  hp: number;
  /** Collision damage dealt. */
  ram: number;
  /** Damage taken. */
  guard: number;
  mass: number;
}

export const BASE_STATS: Stats = {
  speed: 430,
  accel: 1,
  grip: 1,
  dirt: 1,
  ice: 1,
  nitroCap: 100,
  nitroFill: 1,
  nitroPower: 1,
  hp: 100,
  ram: 1,
  guard: 1,
  mass: 1,
};

export interface CarDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  text: string;
  unlock: number;
  mods: Mods;
}

/** Part and car modifiers. Fractions add to the multiplier (0.1 = +10%). `hp` adds flat HP. */
export type Mods = Partial<Record<keyof Stats, number>>;

export const CARS: CarDef[] = [
  { id: 'hatch', name: 'Hot Hatch', icon: '🚗', color: '#e85d04', text: 'Balanced. Good at everything, best at nothing.', unlock: 0, mods: {} },
  { id: 'muscle', name: 'Muscle Car', icon: '🏎️', color: '#d62828', text: 'Fast and heavy. Slides in corners.', unlock: 15, mods: { speed: 0.05, grip: -0.1, hp: 15, mass: 0.15 } },
  { id: 'buggy', name: 'Dune Buggy', icon: '🛻', color: '#e9c46a', text: 'Quick off the line. Loves dirt. Thin armor.', unlock: 25, mods: { accel: 0.1, dirt: 0.35, speed: -0.025, hp: -15 } },
  { id: 'van', name: 'Armored Van', icon: '🚐', color: '#6c757d', text: 'Slow but tough. Rams hard.', unlock: 35, mods: { speed: -0.01, accel: -0.03, hp: 60, ram: 0.5, guard: -0.2, mass: 0.4 } },
  { id: 'kart', name: 'Turbo Kart', icon: '🛺', color: '#2ec4b6', text: 'Sharp grip and quick nitro. Breaks easily.', unlock: 50, mods: { grip: 0.08, accel: 0.06, nitroFill: 0.2, speed: -0.025, hp: -30, mass: -0.2 } },
];

export const CAR_BY_ID: Record<string, CarDef> = Object.fromEntries(CARS.map((c) => [c.id, c]));

export type Slot = 'tires' | 'engine' | 'nitro' | 'armor' | 'gadget';
export const SLOTS: Slot[] = ['tires', 'engine', 'nitro', 'armor', 'gadget'];
export const SLOT_INFO: Record<Slot, { icon: string; name: string }> = {
  tires: { icon: '🛞', name: 'Tires' },
  engine: { icon: '⚙️', name: 'Engine' },
  nitro: { icon: '🔥', name: 'Nitro' },
  armor: { icon: '🛡️', name: 'Armor' },
  gadget: { icon: '🎒', name: 'Gadget' },
};

export type GadgetKind = 'mine' | 'oil' | 'shield' | 'can';

export interface PartDef {
  id: string;
  slot: Slot;
  name: string;
  icon: string;
  rarity: 1 | 2 | 3;
  text: string;
  mods: Mods;
  gadget?: { kind: GadgetKind; charges: number };
}

export const RARITY = ['', 'Common', 'Rare', 'Epic'] as const;
export const RARITY_COLOR = ['', '#b8c0cc', '#4cc9f0', '#c77dff'] as const;

export const PARTS: PartDef[] = [
  // Tires
  { id: 'street', slot: 'tires', name: 'Street Tires', icon: '🛞', rarity: 1, text: '+10% grip.', mods: { grip: 0.1 } },
  { id: 'knobby', slot: 'tires', name: 'Knobby Tires', icon: '🛞', rarity: 1, text: '+40% grip on dirt, +3% grip.', mods: { dirt: 0.4, grip: 0.03 } },
  { id: 'studs', slot: 'tires', name: 'Ice Studs', icon: '🧊', rarity: 1, text: '+70% grip on ice.', mods: { ice: 0.7 } },
  { id: 'slicks', slot: 'tires', name: 'Racing Slicks', icon: '🏁', rarity: 2, text: '+20% grip. −10% on dirt.', mods: { grip: 0.2, dirt: -0.1 } },
  { id: 'driftc', slot: 'tires', name: 'Drift Compound', icon: '🌀', rarity: 2, text: 'Drifts fill nitro 50% faster. −4% grip.', mods: { nitroFill: 0.5, grip: -0.04 } },
  { id: 'allt', slot: 'tires', name: 'All-Terrain Pro', icon: '⛰️', rarity: 3, text: '+15% grip, +35% on dirt, +50% on ice.', mods: { grip: 0.15, dirt: 0.35, ice: 0.5 } },
  // Engines
  { id: 'intake', slot: 'engine', name: 'Tuned Intake', icon: '⚙️', rarity: 1, text: '+4% top speed.', mods: { speed: 0.04 } },
  { id: 'turbo', slot: 'engine', name: 'Turbocharger', icon: '🌪️', rarity: 1, text: '+15% acceleration.', mods: { accel: 0.15 } },
  { id: 'v8', slot: 'engine', name: 'Big V8', icon: '🔩', rarity: 2, text: '+8% top speed, +6% acceleration. Heavier.', mods: { speed: 0.08, accel: 0.06, mass: 0.1 } },
  { id: 'emotor', slot: 'engine', name: 'E-Motor', icon: '⚡', rarity: 2, text: '+25% acceleration, +3% top speed.', mods: { accel: 0.25, speed: 0.03 } },
  { id: 'rotary', slot: 'engine', name: 'Screaming Rotary', icon: '💫', rarity: 3, text: '+12% top speed, +12% acceleration.', mods: { speed: 0.12, accel: 0.12 } },
  { id: 'jet', slot: 'engine', name: 'Jet Turbine', icon: '✈️', rarity: 3, text: '+16% top speed. −6% acceleration.', mods: { speed: 0.16, accel: -0.06 } },
  // Nitro
  { id: 'bottle', slot: 'nitro', name: 'Spare Bottle', icon: '🧯', rarity: 1, text: '+40% nitro tank.', mods: { nitroCap: 0.4 } },
  { id: 'injector', slot: 'nitro', name: 'Fast Injector', icon: '💉', rarity: 1, text: 'Drifts fill nitro 30% faster.', mods: { nitroFill: 0.3 } },
  { id: 'hotmix', slot: 'nitro', name: 'Hot Mix', icon: '🌶️', rarity: 2, text: '+25% nitro power.', mods: { nitroPower: 0.25 } },
  { id: 'twin', slot: 'nitro', name: 'Twin Tanks', icon: '🛢️', rarity: 2, text: '+60% nitro tank, +15% fill.', mods: { nitroCap: 0.6, nitroFill: 0.15 } },
  { id: 'plasma', slot: 'nitro', name: 'Plasma Burner', icon: '☄️', rarity: 3, text: '+35% nitro power, +35% fill.', mods: { nitroPower: 0.35, nitroFill: 0.35 } },
  // Armor
  { id: 'bumpers', slot: 'armor', name: 'Rubber Bumpers', icon: '🧽', rarity: 1, text: '−25% damage taken, +10 HP.', mods: { guard: -0.25, hp: 10 } },
  { id: 'plates', slot: 'armor', name: 'Steel Plates', icon: '🔲', rarity: 1, text: '+35 HP. −2% top speed.', mods: { hp: 35, mass: 0.15, speed: -0.02 } },
  { id: 'ram', slot: 'armor', name: 'Ram Plate', icon: '🐏', rarity: 2, text: 'Rams deal +80% damage. +15 HP.', mods: { ram: 0.8, hp: 15, mass: 0.2 } },
  { id: 'cage', slot: 'armor', name: 'Roll Cage', icon: '🧱', rarity: 2, text: '+50 HP, −15% damage taken. −2% top speed.', mods: { hp: 50, guard: -0.15, speed: -0.02 } },
  { id: 'titan', slot: 'armor', name: 'Titan Shell', icon: '🐢', rarity: 3, text: '+70 HP, −30% damage taken, rams +40%.', mods: { hp: 70, guard: -0.3, ram: 0.4, mass: 0.2 } },
  // Gadgets
  { id: 'mines', slot: 'gadget', name: 'Mine Layer', icon: '💣', rarity: 1, text: '3 mines per race. Drop them behind you.', mods: {}, gadget: { kind: 'mine', charges: 3 } },
  { id: 'oil', slot: 'gadget', name: 'Oil Can', icon: '🛢️', rarity: 1, text: '3 oil slicks per race. Cars on oil lose grip.', mods: {}, gadget: { kind: 'oil', charges: 3 } },
  { id: 'shield', slot: 'gadget', name: 'Shield Generator', icon: '🔰', rarity: 2, text: '2 shields per race. 3 s without damage.', mods: {}, gadget: { kind: 'shield', charges: 2 } },
  { id: 'can', slot: 'gadget', name: 'Nitro Cans', icon: '🥫', rarity: 2, text: '3 cans per race. Each fills 50 nitro.', mods: {}, gadget: { kind: 'can', charges: 3 } },
  { id: 'swarm', slot: 'gadget', name: 'Mine Swarm', icon: '🧨', rarity: 3, text: '6 mines per race.', mods: {}, gadget: { kind: 'mine', charges: 6 } },
];

export const PART_BY_ID: Record<string, PartDef> = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export const PART_PRICE = [0, 70, 130, 210];

export type Personality = 'aggressive' | 'careful' | 'blocker' | 'balanced';

export const PERSONALITY_INFO: Record<Personality, string> = {
  aggressive: 'Rams other cars.',
  careful: 'Brakes early, rarely crashes.',
  blocker: 'Holds the line and drops traps behind.',
  balanced: 'A clean, steady racer.',
};

export interface DriverDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  pers: Personality;
  /** Small skill offset. */
  skill: number;
  gadget: GadgetKind | null;
  boss?: boolean;
}

export const DRIVERS: DriverDef[] = [
  { id: 'rex', name: 'Rex Ramsey', icon: '🐗', color: '#c1121f', pers: 'aggressive', skill: 0, gadget: 'mine' },
  { id: 'polly', name: 'Polly Pace', icon: '🐢', color: '#52b788', pers: 'careful', skill: 0.01, gadget: null },
  { id: 'bram', name: 'Bram Block', icon: '🧱', color: '#9c6644', pers: 'blocker', skill: -0.01, gadget: 'oil' },
  { id: 'zoe', name: 'Zoe Zoom', icon: '⚡', color: '#ffd60a', pers: 'balanced', skill: 0.02, gadget: null },
  { id: 'duke', name: 'Duke Drift', icon: '🌀', color: '#7b2cbf', pers: 'balanced', skill: 0, gadget: 'can' },
  { id: 'ivy', name: 'Ivy Frost', icon: '❄️', color: '#48cae4', pers: 'careful', skill: 0.005, gadget: 'shield' },
  { id: 'max', name: 'Max Crash', icon: '💥', color: '#f77f00', pers: 'aggressive', skill: -0.005, gadget: 'mine' },
  { id: 'nina', name: 'Nina Nitro', icon: '🔥', color: '#ff4d8d', pers: 'blocker', skill: 0.01, gadget: 'oil' },
];

export const BOSSES: DriverDef[] = [
  { id: 'baron', name: 'Baron Skidmark', icon: '🎩', color: '#212529', pers: 'blocker', skill: 0.05, gadget: 'oil', boss: true },
  { id: 'vex', name: 'Queen Vex', icon: '👑', color: '#9d0208', pers: 'aggressive', skill: 0.08, gadget: 'mine', boss: true },
];

export const DRIVER_BY_ID: Record<string, DriverDef> = Object.fromEntries([...DRIVERS, ...BOSSES].map((d) => [d.id, d]));

/** Build the stats from a list of modifiers. */
export function buildStats(mods: Mods[]): Stats {
  const s: Stats = { ...BASE_STATS };
  const add: Record<string, number> = {};
  for (const m of mods) for (const [k, v] of Object.entries(m)) add[k] = (add[k] ?? 0) + (v ?? 0);
  for (const k of Object.keys(s) as (keyof Stats)[]) {
    const v = add[k] ?? 0;
    if (k === 'hp') s.hp = Math.max(40, s.hp + v);
    else s[k] = Math.max(0.2, s[k] * (1 + v));
  }
  return s;
}

export const LAPS = 3;
/** Money for 1st to 6th, as a share of the prize. */
export const PRIZE_SHARE = [1, 0.7, 0.5, 0.3, 0.15, 0];
export const POINTS = [10, 6, 4, 3, 2, 1];
