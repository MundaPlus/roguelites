/** Static game data: jobs, curses, themes, acts, unlocks. */

export type Job = 'blocker' | 'digger' | 'basher' | 'builder' | 'climber' | 'floater' | 'bomber';

export const JOB_IDS: Job[] = ['blocker', 'digger', 'basher', 'builder', 'climber', 'floater', 'bomber'];

export const JOBS: Record<Job, { icon: string; name: string; text: string }> = {
  blocker: { icon: '✋', name: 'Blocker', text: 'Stands still. Other critters turn around at it.' },
  digger: { icon: '⛏️', name: 'Digger', text: 'Digs straight down through dirt and bricks.' },
  basher: { icon: '👊', name: 'Basher', text: 'Digs a tunnel forward through dirt and bricks.' },
  builder: { icon: '🧱', name: 'Builder', text: 'Lays 12 bricks as a stair, up and forward.' },
  climber: { icon: '🧗', name: 'Climber', text: 'Climbs up walls. Keeps the skill.' },
  floater: { icon: '☂️', name: 'Floater', text: 'Opens an umbrella and survives any fall. Keeps the skill.' },
  bomber: { icon: '💣', name: 'Bomber', text: 'Explodes after 3 seconds and blasts dirt away.' },
};

export type Curse = 'fast' | 'short' | 'fragile';

export const CURSE_IDS: Curse[] = ['fast', 'short', 'fragile'];

export const CURSES: Record<Curse, { icon: string; name: string; text: string }> = {
  fast: { icon: '💨', name: 'Stampede', text: 'Critters walk 50% faster.' },
  short: { icon: '🌙', name: 'Dusk', text: 'Much less time on the clock.' },
  fragile: { icon: '🥚', name: 'Fragile', text: 'A shorter fall kills (16 instead of 22).' },
};

export type Theme = 'meadow' | 'caves' | 'volcano';

export interface ThemeDef {
  sky: [string, string];
  dirt: [number, number, number];
  top: [number, number, number];
  steel: [number, number, number];
}

export const THEMES: Record<Theme, ThemeDef> = {
  meadow: { sky: ['#0d2a3a', '#16404f'], dirt: [122, 86, 54], top: [96, 178, 92], steel: [112, 124, 138] },
  caves: { sky: ['#0b1424', '#1a2238'], dirt: [104, 84, 74], top: [110, 168, 150], steel: [140, 150, 168] },
  volcano: { sky: ['#1e0d12', '#3a1618'], dirt: [98, 58, 52], top: [200, 110, 60], steel: [120, 112, 118] },
};

export type BossId = 'flood' | 'wolf' | 'furnace';

export const BOSSES: Record<BossId, { icon: string; name: string; text: string }> = {
  flood: { icon: '🌊', name: 'The Flood', text: 'Water rises from below. Get the herd up high, fast.' },
  wolf: { icon: '🐺', name: 'The Wolf', text: 'A wolf guards the field. Dig under it.' },
  furnace: { icon: '🌋', name: 'The Furnace', text: 'Lava rises and fire is everywhere.' },
};

export const ACTS: { name: string; icon: string; theme: Theme; boss: BossId }[] = [
  { name: 'Green Meadow', icon: '🌿', theme: 'meadow', boss: 'flood' },
  { name: 'Echo Caves', icon: '🪨', theme: 'caves', boss: 'wolf' },
  { name: 'Ash Peaks', icon: '🌋', theme: 'volcano', boss: 'furnace' },
];

/** Level packs add obstacle types to the level generator. */
export type Pack = 'meadow' | 'caves' | 'volcano';

export interface UnlockDef {
  id: string;
  icon: string;
  name: string;
  text: string;
  cost: number;
}

/** Meta unlocks bought with wool on the title screen. */
export const UNLOCKS: UnlockDef[] = [
  { id: 'bomber', icon: '💣', name: 'Bomber job', text: 'Bombers can show up as rewards.', cost: 6 },
  { id: 'caves', icon: '🪨', name: 'Cave pack', text: 'New obstacles: tunnels under traps, locked gates, deep pits.', cost: 10 },
  { id: 'kit', icon: '🎒', name: "Shepherd's kit", text: 'Start each run with +1 builder, basher and digger.', cost: 14 },
  { id: 'flock', icon: '🐑', name: 'Big flock', text: 'Start each run with 5 more critters.', cost: 16 },
  { id: 'volcano', icon: '🌋', name: 'Volcano pack', text: 'New obstacles: fire pits, fire strips, hot tunnels.', cost: 20 },
  { id: 'bell', icon: '🔔', name: 'Bell sheep', text: 'Start each run with 4 hearts instead of 3.', cost: 26 },
];
