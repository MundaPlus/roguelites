/** Static content: clubs, ace cards, charms, zones, bosses and curses. */

export interface ClubDef {
  name: string;
  short: string;
  /** Top launch speed at full power, level 1. */
  vmax: number;
  /** Launch angle range in degrees. 0..0 means a ground shot. */
  emin: number;
  emax: number;
  /** Seconds of flight the aim arc shows at level 1. */
  arc: number;
  text: string;
  /** Meta cost in tokens. 0 = in every bag from the start. */
  unlock: number;
  sandOk?: boolean;
}

export const CLUBS: Record<string, ClubDef> = {
  driver: { name: 'Driver', short: '1W', vmax: 690, emin: 10, emax: 38, arc: 0.3, text: 'Far and low. The aim arc is short.', unlock: 0 },
  rescue: { name: 'Rescue', short: 'RH', vmax: 610, emin: 14, emax: 45, arc: 0.45, text: 'Long club that ignores sand.', unlock: 7, sandOk: true },
  iron: { name: 'Iron', short: '7i', vmax: 570, emin: 18, emax: 55, arc: 0.5, text: 'Middle distance. A good all-round club.', unlock: 0 },
  wedge: { name: 'Wedge', short: 'W', vmax: 450, emin: 40, emax: 78, arc: 0.8, text: 'High arc. The ball stops soon after it lands.', unlock: 0 },
  lob: { name: 'Lob Wedge', short: 'LW', vmax: 470, emin: 58, emax: 86, arc: 1.0, text: 'Almost straight up. Climbs over tall walls.', unlock: 5 },
  putter: { name: 'Putter', short: 'P', vmax: 340, emin: 0, emax: 0, arc: 2.4, text: 'Rolls the ball along the ground.', unlock: 0 },
};

export const CLUB_IDS = Object.keys(CLUBS);
export const MAX_CLUB_LVL = 3;

export type AceUse = 'arm' | 'now' | 'flight';

export interface AceDef {
  name: string;
  icon: string;
  use: AceUse;
  text: string;
  unlock: number;
  cost: number;
}

export const ACES: Record<string, AceDef> = {
  curve: { name: 'Curve Ball', icon: '🌀', use: 'arm', text: 'The ball bends toward the flag while it is in the air.', unlock: 0, cost: 24 },
  brake: { name: 'Air Brake', icon: '🛑', use: 'flight', text: 'Use it during a flight: the ball stops and drops straight down.', unlock: 0, cost: 20 },
  skip: { name: 'Stone Skip', icon: '🪨', use: 'arm', text: 'The ball skips on water this shot. It sinks if it gets slow.', unlock: 0, cost: 16 },
  extra: { name: 'Extra Shot', icon: '➕', use: 'now', text: '+1 shot. Used by itself when you run out of shots.', unlock: 0, cost: 26 },
  mulligan: { name: 'Mulligan', icon: '↩️', use: 'now', text: 'Take back the last shot: the ball goes back and you get the shot back.', unlock: 0, cost: 22 },
  power: { name: 'Power Tee', icon: '💥', use: 'arm', text: '+30% power this shot.', unlock: 0, cost: 16 },
  calm: { name: 'Still Air', icon: '🍃', use: 'arm', text: 'No wind this shot.', unlock: 0, cost: 12 },
  rocket: { name: 'Rocket', icon: '🚀', use: 'flight', text: 'Use it during a flight: a strong push in the direction of travel.', unlock: 4, cost: 20 },
  sticky: { name: 'Sticky Ball', icon: '🍯', use: 'arm', text: 'The ball stops where it first lands.', unlock: 5, cost: 20 },
  eagle: { name: 'Eagle Eye', icon: '🦅', use: 'arm', text: 'The aim arc shows the whole flight up to the first landing.', unlock: 6, cost: 18 },
  freeze: { name: 'Deep Freeze', icon: '🧊', use: 'now', text: 'All water on this hole turns to ice.', unlock: 4, cost: 18 },
};

export const ACE_IDS = Object.keys(ACES);
export const HAND_MAX = 5;

export interface CharmDef {
  name: string;
  icon: string;
  text: string;
  cost: number;
}

export const CHARMS: Record<string, CharmDef> = {
  lucky: { name: 'Lucky Tee', icon: '🍀', text: '+1 shot on every hole.', cost: 80 },
  magnet: { name: 'Idol Magnet', icon: '🧲', text: 'Idols give +3 shots instead of +2.', cost: 60 },
  scope: { name: 'Long Sight', icon: '🔭', text: 'The aim arc is 60% longer.', cost: 55 },
  wings: { name: 'Water Wings', icon: '🛟', text: 'The first water hazard on each hole costs no shot.', cost: 50 },
  boots: { name: 'Sand Boots', icon: '🥾', text: 'Shots from sand keep full power.', cost: 45 },
  glove: { name: 'Gold Glove', icon: '🧤', text: '+50% gold from holes and coins.', cost: 50 },
  sleeve: { name: 'Card Sleeve', icon: '🃏', text: 'Hold 2 more aces. Get a random ace at the start of each zone.', cost: 55 },
  guard: { name: 'Spike Guard', icon: '🛡️', text: 'Spikes cost no shot.', cost: 45 },
};

export const CHARM_IDS = Object.keys(CHARMS);

export interface ZoneDef {
  name: string;
  icon: string;
  sky: [string, string];
  hills: string;
  dirt: string;
  grass: string;
  wind: number;
  /** Piece weights for the course builder. */
  pieces: Record<string, number>;
  boss: string;
}

export const ZONES: ZoneDef[] = [
  {
    name: 'Fair Meadows',
    icon: '🌳',
    sky: ['#14324f', '#3d6f98'],
    hills: '#1f4a3a',
    dirt: '#3a2a1c',
    grass: '#55b832',
    wind: 18,
    pieces: { flat: 2, hill: 3, dip: 2, bunker: 3, pond: 2, ramp: 2, plateau: 1 },
    boss: 'gopher',
  },
  {
    name: 'Dune Links',
    icon: '🏜️',
    sky: ['#3b2a4a', '#b5704a'],
    hills: '#6b4a32',
    dirt: '#4a3420',
    grass: '#8fbf3a',
    wind: 45,
    pieces: { flat: 1, hill: 2, bunker: 4, desert: 3, pond: 1, cliff: 2, plateau: 2, pillar: 1 },
    boss: 'djinn',
  },
  {
    name: 'Frost Peaks',
    icon: '❄️',
    sky: ['#0e1d38', '#4a6c9b'],
    hills: '#2b3f5e',
    dirt: '#2c3140',
    grass: '#7fc8a0',
    wind: 32,
    pieces: { hill: 2, ice: 3, pond: 2, spikes: 2, cliff: 2, chasm: 2, gate: 2, pillar: 1 },
    boss: 'golem',
  },
  {
    name: 'Cursed Crypt',
    icon: '💀',
    sky: ['#12081c', '#4a1f4f'],
    hills: '#2a1533',
    dirt: '#24161f',
    grass: '#6aa84f',
    wind: 45,
    pieces: { hill: 1, spikes: 3, chasm: 2, gate: 3, ice: 1, bunker: 1, cliff: 2, pillar: 2 },
    boss: 'caddie',
  },
];

export interface BossDef {
  name: string;
  icon: string;
  text: string;
  cups: number;
  windShift: boolean;
  gates: boolean;
}

export const BOSSES: Record<string, BossDef> = {
  gopher: { name: 'Gopher King', icon: '🐹', text: 'Moves the flag to another cup after each shot.', cups: 3, windShift: false, gates: false },
  djinn: { name: 'Storm Djinn', icon: '🧞', text: 'The wind turns and grows after each shot.', cups: 1, windShift: true, gates: false },
  golem: { name: 'Frost Golem', icon: '⛄', text: 'Stone gates move up and down in front of the green.', cups: 1, windShift: false, gates: true },
  caddie: { name: 'Cursed Caddie', icon: '👻', text: 'Moving cups, turning wind and gates, all at once.', cups: 3, windShift: true, gates: true },
};

export interface CurseDef {
  name: string;
  icon: string;
  text: string;
}

export const CURSES: Record<string, CurseDef> = {
  gale: { name: 'Gale', icon: '🌪️', text: 'Very strong wind.' },
  thin: { name: 'Thin Card', icon: '✂️', text: '1 shot less.' },
  blind: { name: 'Blindfold', icon: '🙈', text: 'The aim arc is half as long.' },
  spiky: { name: 'Thorns', icon: '🦔', text: 'Extra spike pits.' },
  slick: { name: 'Slick Green', icon: '🧊', text: 'The green is ice.' },
};

export const CURSE_IDS = Object.keys(CURSES);
