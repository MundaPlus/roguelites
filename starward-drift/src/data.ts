/** Static game data: systems, weapons, races, augments, ship layouts, ships, enemies, events, sectors. */

export type SysId = 'shields' | 'engines' | 'oxygen' | 'medbay' | 'weapons' | 'pilot';
export type Race = 'human' | 'engi' | 'rock' | 'zoltan' | 'lanius';
export type WKind = 'laser' | 'missile' | 'beam' | 'ion' | 'flak';

export const SYS_ORDER: SysId[] = ['shields', 'engines', 'oxygen', 'medbay', 'weapons', 'pilot'];

export interface SysDef {
  name: string;
  icon: string;
  max: number;
  /** Upgrade to level L costs `cost * L` scrap. */
  cost: number;
  /** False for the pilot: it needs no reactor power. */
  power: boolean;
  text: string;
  key: string;
}

export const SYSTEMS: Record<SysId, SysDef> = {
  shields: { name: 'Shields', icon: '🛡️', max: 8, cost: 12, power: true, key: 'A', text: '2 power = 1 shield layer. A layer blocks one laser shot and recharges.' },
  engines: { name: 'Engines', icon: '⚙️', max: 8, cost: 8, power: true, key: 'S', text: '+5% evasion per power. Charges the FTL drive.' },
  oxygen: { name: 'Oxygen', icon: '💨', max: 3, cost: 18, power: true, key: 'D', text: 'Refills the air. Without it, crew suffocate.' },
  medbay: { name: 'Medbay', icon: '🩹', max: 3, cost: 14, power: true, key: 'F', text: 'Heals crew inside the room.' },
  weapons: { name: 'Weapons', icon: '🎯', max: 8, cost: 10, power: true, key: '', text: 'Power capacity for your weapons.' },
  pilot: { name: 'Pilot', icon: '🧭', max: 3, cost: 22, power: false, key: '', text: 'Must be manned for evasion and jumps. Level 2–3 keeps some evasion unmanned.' },
};

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  kind: WKind;
  shots: number;
  dmg: number;
  charge: number;
  power: number;
  cost: number;
  tier: number;
  fire?: number;
  breach?: number;
  /** Ion stacks per hit. */
  ion?: number;
  /** Rooms a beam sweeps. */
  len?: number;
  /** Extra crew damage per hit. */
  crew?: number;
  /** Chain: each volley charges 15% faster, down to 55%. */
  chain?: boolean;
  text: string;
}

const W = (w: WeaponDef): WeaponDef => w;

export const WEAPONS: Record<string, WeaponDef> = {
  basic: W({ id: 'basic', name: 'Basic Laser', icon: '🔹', kind: 'laser', shots: 1, dmg: 1, charge: 10, power: 1, cost: 25, tier: 0, text: '1 shot, 1 damage.' }),
  burst1: W({ id: 'burst1', name: 'Burst Laser I', icon: '🔷', kind: 'laser', shots: 2, dmg: 1, charge: 11, power: 2, cost: 40, tier: 0, text: '2 shots, 1 damage each.' }),
  burst2: W({ id: 'burst2', name: 'Burst Laser II', icon: '💠', kind: 'laser', shots: 3, dmg: 1, charge: 12, power: 2, cost: 70, tier: 1, text: '3 shots, 1 damage each.' }),
  heavy1: W({ id: 'heavy1', name: 'Heavy Laser I', icon: '🔶', kind: 'laser', shots: 1, dmg: 2, charge: 9, power: 1, cost: 50, tier: 1, fire: 0.1, breach: 0.2, crew: 15, text: '1 shot, 2 damage. Can start fires and breaches.' }),
  heavy2: W({ id: 'heavy2', name: 'Heavy Laser II', icon: '🟧', kind: 'laser', shots: 2, dmg: 2, charge: 14, power: 3, cost: 85, tier: 2, fire: 0.15, breach: 0.2, crew: 15, text: '2 shots, 2 damage each.' }),
  chain: W({ id: 'chain', name: 'Chain Laser', icon: '⛓️', kind: 'laser', shots: 2, dmg: 1, charge: 15, power: 2, cost: 70, tier: 2, chain: true, text: '2 shots. Each volley charges faster (down to 55%).' }),
  leto: W({ id: 'leto', name: 'Leto Missile', icon: '🚀', kind: 'missile', shots: 1, dmg: 1, charge: 9, power: 1, cost: 25, tier: 0, text: 'Ignores shields. Uses 1 missile.' }),
  artemis: W({ id: 'artemis', name: 'Artemis Missile', icon: '🧨', kind: 'missile', shots: 1, dmg: 2, charge: 11, power: 1, cost: 50, tier: 1, fire: 0.1, breach: 0.2, text: 'Ignores shields, 2 damage. Uses 1 missile.' }),
  breach: W({ id: 'breach', name: 'Breach Missile', icon: '💣', kind: 'missile', shots: 1, dmg: 3, charge: 16, power: 3, cost: 75, tier: 2, fire: 0.3, breach: 0.6, text: 'Ignores shields, 3 damage, often breaches.' }),
  minibeam: W({ id: 'minibeam', name: 'Mini Beam', icon: '〰️', kind: 'beam', shots: 1, dmg: 1, charge: 12, power: 1, cost: 25, tier: 0, len: 1, text: 'Beam: never misses. Each shield layer cuts 1 damage.' }),
  pike: W({ id: 'pike', name: 'Pike Beam', icon: '⚡', kind: 'beam', shots: 1, dmg: 1, charge: 16, power: 2, cost: 55, tier: 1, len: 3, text: 'Beam that sweeps 3 rooms.' }),
  halberd: W({ id: 'halberd', name: 'Halberd Beam', icon: '🔱', kind: 'beam', shots: 1, dmg: 2, charge: 17, power: 3, cost: 75, tier: 2, len: 2, text: 'Beam, 2 damage over 2 rooms.' }),
  firebeam: W({ id: 'firebeam', name: 'Fire Beam', icon: '🔥', kind: 'beam', shots: 1, dmg: 0, charge: 20, power: 2, cost: 50, tier: 1, len: 2, fire: 0.8, crew: 25, text: 'No hull damage. Sets 2 rooms on fire. Blocked by any shield.' }),
  ion1: W({ id: 'ion1', name: 'Ion Blast', icon: '🌀', kind: 'ion', shots: 1, dmg: 0, charge: 9, power: 1, cost: 30, tier: 0, ion: 1, text: 'Ion: pops a shield layer and stops recharge, or jams a system.' }),
  ion2: W({ id: 'ion2', name: 'Heavy Ion', icon: '🌪️', kind: 'ion', shots: 1, dmg: 0, charge: 13, power: 2, cost: 45, tier: 1, ion: 2, text: 'Ion with 2 stacks.' }),
  flak: W({ id: 'flak', name: 'Flak Gun', icon: '🎇', kind: 'flak', shots: 3, dmg: 1, charge: 15, power: 2, cost: 60, tier: 1, text: '3 shells that spread around the target.' }),
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export interface RaceDef {
  name: string;
  hp: number;
  speed: number;
  repair: number;
  color: string;
  text: string;
}

export const RACES: Record<Race, RaceDef> = {
  human: { name: 'Human', hp: 100, speed: 1, repair: 1, color: '#f4d35e', text: 'Balanced.' },
  engi: { name: 'Engi', hp: 100, speed: 1, repair: 2, color: '#7bdff2', text: 'Repairs twice as fast.' },
  rock: { name: 'Rockman', hp: 150, speed: 0.6, repair: 1, color: '#e07a5f', text: '150 HP, fire does not hurt. Slow.' },
  zoltan: { name: 'Zoltan', hp: 70, speed: 1, repair: 1, color: '#9bf6a8', text: 'Gives 1 free power to the system in its room.' },
  lanius: { name: 'Lanius', hp: 90, speed: 0.8, repair: 1, color: '#c3c7d6', text: 'Needs no oxygen.' },
};

export const RACE_IDS = Object.keys(RACES) as Race[];

export const NAMES = [
  'Ada', 'Bo', 'Cass', 'Dane', 'Eve', 'Finn', 'Gale', 'Hux', 'Iris', 'Jax', 'Kira', 'Lio', 'Mara', 'Nix', 'Orin', 'Pax',
  'Quin', 'Rhea', 'Sol', 'Tam', 'Una', 'Vex', 'Wren', 'Xan', 'Yuri', 'Zed', 'Kel', 'Rio', 'Tess', 'Ivo',
];

export interface AugDef {
  name: string;
  icon: string;
  cost: number;
  text: string;
}

export const AUGMENTS: Record<string, AugDef> = {
  scrap_arm: { name: 'Scrap Arm', icon: '🦾', cost: 50, text: '+15% scrap from all sources.' },
  reloader: { name: 'Auto Reloader', icon: '🔄', cost: 60, text: 'Weapons charge 10% faster.' },
  shield_boost: { name: 'Shield Booster', icon: '🔋', cost: 55, text: 'Shield layers recharge 35% faster.' },
  stealth: { name: 'Stealth Plating', icon: '🌫️', cost: 50, text: '+7% evasion.' },
  nanobots: { name: 'Nano Medbots', icon: '💉', cost: 45, text: 'Crew heal 1 HP per second anywhere.' },
  fire_supp: { name: 'Fire Suppressor', icon: '🧯', cost: 40, text: 'Fires die twice as fast.' },
  replicator: { name: 'Missile Replicator', icon: '♻️', cost: 45, text: '35% chance a missile shot uses no missile.' },
  hull_drone: { name: 'Hull Drone', icon: '🔧', cost: 60, text: 'Repairs 1 hull after each jump.' },
  preigniter: { name: 'Pre-Igniter', icon: '⚡', cost: 110, text: 'Weapons start each fight fully charged.' },
};

export const AUG_IDS = Object.keys(AUGMENTS);

// ---------- Ship layouts ----------

export interface RoomDef {
  x: number;
  y: number;
  w: number;
  h: number;
  sys: SysId | null;
}

export interface LayoutDef {
  w: number;
  h: number;
  rooms: RoomDef[];
}

const R = (x: number, y: number, w: number, h: number, sys: SysId | null = null): RoomDef => ({ x, y, w, h, sys });

/** All layouts face right (the pilot sits at the nose on the right). Enemy ships are drawn mirrored. */
export const LAYOUTS: Record<string, LayoutDef> = {
  kestrel: {
    w: 9,
    h: 3,
    rooms: [R(0, 1, 2, 2, 'engines'), R(2, 0, 2, 1, 'oxygen'), R(2, 1, 2, 2, 'medbay'), R(4, 0, 2, 1), R(4, 1, 2, 2, 'weapons'), R(6, 0, 2, 2, 'shields'), R(6, 2, 2, 1), R(8, 1, 1, 2, 'pilot')],
  },
  cruiser: {
    w: 9,
    h: 4,
    rooms: [R(8, 1, 1, 2, 'pilot'), R(6, 0, 2, 2, 'shields'), R(6, 2, 2, 2, 'oxygen'), R(4, 1, 2, 2, 'weapons'), R(2, 0, 2, 2, 'engines'), R(2, 2, 2, 2, 'medbay'), R(0, 1, 2, 2)],
  },
  small: {
    w: 6,
    h: 3,
    rooms: [R(5, 1, 1, 1, 'pilot'), R(3, 0, 2, 2, 'shields'), R(3, 2, 2, 1, 'weapons'), R(1, 1, 2, 2, 'engines'), R(1, 0, 2, 1, 'oxygen'), R(0, 1, 1, 2, 'medbay')],
  },
  stinger: {
    w: 9,
    h: 2,
    rooms: [R(0, 0, 2, 2, 'engines'), R(2, 0, 1, 1, 'oxygen'), R(2, 1, 1, 1, 'medbay'), R(3, 0, 2, 2, 'weapons'), R(5, 0, 1, 2), R(6, 0, 2, 2, 'shields'), R(8, 0, 1, 2, 'pilot')],
  },
  flagship: {
    w: 12,
    h: 4,
    rooms: [
      R(11, 1, 1, 2, 'pilot'), R(9, 0, 2, 2, 'shields'), R(9, 2, 2, 2, 'weapons'), R(7, 1, 2, 2), R(5, 0, 2, 2, 'engines'), R(5, 2, 2, 1, 'oxygen'),
      R(5, 3, 2, 1, 'medbay'), R(3, 0, 2, 2), R(3, 2, 2, 2), R(1, 1, 2, 2),
    ],
  },
};

// ---------- Player ships ----------

export interface ShipDef {
  id: string;
  name: string;
  icon: string;
  layout: string;
  hull: number;
  reactor: number;
  systems: Record<SysId, number>;
  weapons: string[];
  crew: Race[];
  missiles: number;
  augments: string[];
  text: string;
  unlock: string;
}

const lv = (shields: number, engines: number, oxygen: number, medbay: number, weapons: number, pilot: number): Record<SysId, number> => ({ shields, engines, oxygen, medbay, weapons, pilot });

export const SHIPS: ShipDef[] = [
  { id: 'kestrel', name: 'Kestrel', icon: '🛰️', layout: 'kestrel', hull: 30, reactor: 8, systems: lv(2, 2, 1, 1, 3, 1), weapons: ['burst2', 'artemis'], crew: ['human', 'human', 'human'], missiles: 8, augments: [], text: 'Burst laser and missiles. Three humans.', unlock: 'Always open' },
  { id: 'torus', name: 'Torus', icon: '🔵', layout: 'cruiser', hull: 26, reactor: 8, systems: lv(2, 2, 1, 1, 3, 1), weapons: ['ion1', 'heavy1'], crew: ['engi', 'engi', 'human'], missiles: 4, augments: [], text: 'Ion and heavy laser. Engi crew repair fast.', unlock: 'Reach sector 3' },
  { id: 'basalt', name: 'Basalt Hammer', icon: '🪨', layout: 'stinger', hull: 36, reactor: 9, systems: lv(2, 2, 1, 1, 4, 1), weapons: ['burst1', 'heavy1', 'artemis'], crew: ['rock', 'rock', 'human'], missiles: 12, augments: [], text: 'Thick hull, three weapons. Slow Rockman crew.', unlock: 'Reach sector 5' },
  { id: 'lantern', name: 'Lantern', icon: '🏮', layout: 'small', hull: 26, reactor: 10, systems: lv(4, 2, 1, 1, 3, 1), weapons: ['burst1', 'basic'], crew: ['zoltan', 'zoltan', 'human'], missiles: 4, augments: ['shield_boost'], text: 'Two shield layers at the start. Zoltan crew give free power.', unlock: 'Win one run' },
];

// ---------- Enemies ----------

export interface EnemyTpl {
  id: string;
  name: string;
  layouts: string[];
  races: Race[];
  /** Weapon kinds this ship likes. */
  pool: string[];
  hull: number;
  shields: number;
  engines: number;
  /** Auto ships have no crew. Their systems repair slowly by themselves. */
  auto?: boolean;
  text: string;
}

export const ENEMIES: Record<string, EnemyTpl> = {
  pirate: { id: 'pirate', name: 'Pirate Raider', layouts: ['small', 'kestrel'], races: ['human', 'human', 'rock', 'lanius'], pool: ['basic', 'burst1', 'burst2', 'heavy1', 'leto', 'artemis', 'flak', 'heavy2'], hull: 0, shields: 0, engines: 1, text: 'Pirates want your scrap.' },
  rebel: { id: 'rebel', name: 'Rebel Fighter', layouts: ['small', 'cruiser'], races: ['human'], pool: ['basic', 'burst1', 'burst2', 'leto', 'artemis', 'chain', 'heavy2'], hull: 1, shields: 0, engines: 0, text: 'A rebel ship on patrol.' },
  engi: { id: 'engi', name: 'Engi Defender', layouts: ['cruiser'], races: ['engi', 'engi', 'human'], pool: ['ion1', 'ion2', 'basic', 'burst1', 'pike', 'minibeam'], hull: 2, shields: 0, engines: 0, text: 'An Engi ship that loves ion weapons.' },
  zoltan: { id: 'zoltan', name: 'Zoltan Monitor', layouts: ['stinger', 'small'], races: ['zoltan', 'zoltan', 'human'], pool: ['minibeam', 'pike', 'halberd', 'basic', 'burst1', 'ion1'], hull: -2, shields: 2, engines: 0, text: 'Strong shields, weak hull.' },
  rock: { id: 'rock', name: 'Rock Cruiser', layouts: ['stinger', 'cruiser'], races: ['rock', 'rock', 'human'], pool: ['leto', 'artemis', 'breach', 'heavy1', 'firebeam', 'basic'], hull: 4, shields: 0, engines: -1, text: 'Thick hull, many missiles.' },
  auto: { id: 'auto', name: 'Auto Scout', layouts: ['small'], races: [], pool: ['basic', 'burst1', 'ion1', 'leto', 'burst2', 'flak'], hull: -1, shields: 0, engines: 1, auto: true, text: 'A drone ship with no crew.' },
  elite: { id: 'elite', name: 'Rebel Elite', layouts: ['cruiser', 'kestrel'], races: ['human', 'human', 'engi'], pool: ['burst2', 'heavy1', 'artemis', 'chain', 'pike', 'heavy2', 'flak'], hull: 4, shields: 2, engines: 1, text: 'A rebel fleet warship. It hits hard.' },
  flagship: { id: 'flagship', name: 'Rebel Flagship', layouts: ['flagship'], races: ['human', 'human', 'human', 'engi', 'rock', 'zoltan'], pool: [], hull: 0, shields: 0, engines: 0, text: 'The rebel flagship. Destroy it twice.' },
};

// ---------- Sectors ----------

export interface SectorDef {
  name: string;
  icon: string;
  /** Enemy templates and weights. */
  foes: [string, number][];
  color: string;
}

export const SECTORS: SectorDef[] = [
  { name: 'Civilian Lanes', icon: '🌍', foes: [['pirate', 3], ['rebel', 2], ['auto', 2]], color: '#2a6f97' },
  { name: 'Engi Reach', icon: '🔧', foes: [['engi', 3], ['pirate', 2], ['auto', 2]], color: '#168aad' },
  { name: 'Pirate Nebula', icon: '🏴‍☠️', foes: [['pirate', 4], ['rock', 1], ['rebel', 1]], color: '#6a4c93' },
  { name: 'Zoltan Shell', icon: '💚', foes: [['zoltan', 3], ['auto', 2], ['rebel', 2]], color: '#2d6a4f' },
  { name: 'Rock Homeworlds', icon: '🌋', foes: [['rock', 3], ['pirate', 2], ['rebel', 1]], color: '#9c4221' },
  { name: 'Rebel Stronghold', icon: '🚩', foes: [['rebel', 3], ['elite', 1], ['auto', 1]], color: '#9d0208' },
];

// ---------- Events ----------

export interface Outcome {
  text: string;
  scrap?: [number, number];
  fuel?: number;
  missiles?: number;
  hull?: number;
  /** Damage to every crew member. */
  hurt?: number;
  crewLose?: boolean;
  crewGain?: Race | 'random';
  weapon?: string | 'random';
  augment?: string | 'random';
  upgrade?: SysId;
  /** Enemy template id, or 'sector' for a sector foe. */
  fight?: string;
  /** Extra scrap when the fight is won. */
  bonus?: number;
  store?: boolean;
  /** The fleet moves this much more. */
  fleet?: number;
}

export interface Req {
  race?: Race;
  sys?: SysId;
  lvl?: number;
  scrap?: number;
  fuel?: number;
  missiles?: number;
}

export interface Choice {
  text: string;
  req?: Req;
  /** A paid choice takes this from the player first. */
  pay?: { scrap?: number; fuel?: number; missiles?: number };
  out: [Outcome, number][];
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  text: string;
  choices: Choice[];
}

const leave = (text = 'You move on.'): Choice => ({ text: 'Leave', out: [[{ text }, 1]] });

export const EVENTS: EventDef[] = [
  {
    id: 'derelict', title: 'Derelict Hulk', icon: '🛸', text: 'A dead ship drifts at the beacon. Its hull is cold and dark.',
    choices: [
      { text: 'Search the wreck', out: [[{ text: 'You strip useful parts from the hulk.', scrap: [15, 30] }, 4], [{ text: 'A booby trap goes off as you dock!', hull: -3 }, 1], [{ text: 'You find a weapon still in its rack.', weapon: 'random' }, 1]] },
      leave(),
    ],
  },
  {
    id: 'merchant', title: 'Distress Call', icon: '🆘', text: 'A merchant ship calls for help. Pirates are boarding it.',
    choices: [
      { text: 'Attack the pirates', out: [[{ text: 'The pirates turn their guns on you!', fight: 'pirate', bonus: 20 }, 1]] },
      leave('You leave the merchant to its fate.'),
    ],
  },
  {
    id: 'asteroids', title: 'Asteroid Field', icon: '☄️', text: 'This beacon sits in a field of metal-rich rocks.',
    choices: [
      { text: 'Mine the rocks', out: [[{ text: 'You fill the hold with ore.', scrap: [12, 22] }, 3], [{ text: 'A rock clips your hull.', hull: -3, scrap: [5, 10] }, 2]] },
      { text: 'Rock crew cut the ore by hand', req: { race: 'rock' }, out: [[{ text: 'Your Rockmen mine without a scratch.', scrap: [25, 35] }, 1]] },
      leave(),
    ],
  },
  {
    id: 'refugees', title: 'Refugee Station', icon: '🏚️', text: 'A crowded station begs for fuel to reach a safe world.',
    choices: [
      { text: 'Give 2 fuel', req: { fuel: 3 }, pay: { fuel: 2 }, out: [[{ text: 'A grateful pilot joins your crew.', crewGain: 'random' }, 2], [{ text: 'They pay you in old credits.', scrap: [30, 40] }, 1]] },
      leave('You fly on. The station goes quiet behind you.'),
    ],
  },
  {
    id: 'slaver', title: 'Slaver Ship', icon: '⛓️', text: 'A slaver offers you a crew member for 40 scrap.',
    choices: [
      { text: 'Buy the crew member (40 scrap)', req: { scrap: 40 }, pay: { scrap: 40 }, out: [[{ text: 'Your new crew member is glad to be free.', crewGain: 'random' }, 1]] },
      { text: 'Attack the slavers', out: [[{ text: 'The slavers raise shields!', fight: 'pirate', bonus: 15 }, 1]] },
      leave(),
    ],
  },
  {
    id: 'ionstorm', title: 'Ion Storm', icon: '⛈️', text: 'An ion storm rolls over the beacon. Your systems flicker.',
    choices: [
      { text: 'Ride it out', out: [[{ text: 'The storm passes.' }, 2], [{ text: 'A surge burns your hull.', hull: -2 }, 2]] },
      { text: 'Engi crew tune the reactor', req: { race: 'engi' }, out: [[{ text: 'The Engi harvest the charge and sell the cells.', scrap: [20, 30] }, 1]] },
    ],
  },
  {
    id: 'drydock', title: 'Old Drydock', icon: '🏗️', text: 'An abandoned station still has a working repair dock.',
    choices: [
      { text: 'Dock and repair', out: [[{ text: 'The dock patches your hull.', hull: 8 }, 3], [{ text: 'It is a trap! A drone ship wakes up.', fight: 'auto' }, 1]] },
      leave(),
    ],
  },
  {
    id: 'checkpoint', title: 'Rebel Checkpoint', icon: '🚧', text: 'A rebel checkpoint asks for your papers.',
    choices: [
      { text: 'Pay a bribe (20 scrap)', req: { scrap: 20 }, pay: { scrap: 20 }, out: [[{ text: 'The officer waves you through.' }, 1]] },
      { text: 'Zoltan crew bluff', req: { race: 'zoltan' }, out: [[{ text: 'The officer believes you and even gives you fuel.', fuel: 2 }, 1]] },
      { text: 'Open fire', out: [[{ text: 'Battle stations!', fight: 'rebel', bonus: 10 }, 1]] },
    ],
  },
  {
    id: 'trader', title: 'Fuel Trader', icon: '⛽', text: 'A lone trader sells 3 fuel for 12 scrap.',
    choices: [
      { text: 'Buy fuel (12 scrap)', req: { scrap: 12 }, pay: { scrap: 12 }, out: [[{ text: 'You fill the tanks.', fuel: 3 }, 1]] },
      { text: 'Rob the trader', out: [[{ text: 'The trader has a guard ship!', fight: 'pirate' }, 2], [{ text: 'The trader flees and drops fuel.', fuel: 2 }, 1]] },
      leave(),
    ],
  },
  {
    id: 'cache', title: 'Weapon Cache', icon: '📦', text: 'A sealed weapon cache floats near the beacon.',
    choices: [
      { text: 'Cut it open', out: [[{ text: 'Inside is a weapon in good shape.', weapon: 'random' }, 3], [{ text: 'It explodes!', hull: -3 }, 2], [{ text: 'It holds missiles.', missiles: 4 }, 2]] },
      { text: 'Rock crew open it by hand', req: { race: 'rock' }, out: [[{ text: 'The Rockmen pry it open safely.', weapon: 'random' }, 1]] },
      leave(),
    ],
  },
  {
    id: 'plague', title: 'Plague Ship', icon: '🦠', text: 'A ship full of sick crew asks for medical help.',
    choices: [
      { text: 'Send medics (Medbay 2)', req: { sys: 'medbay', lvl: 2 }, out: [[{ text: 'You cure them. One stays with you.', crewGain: 'random', scrap: [15, 25] }, 1]] },
      { text: 'Help anyway', out: [[{ text: 'Your crew catch the sickness.', hurt: 40, scrap: [20, 30] }, 2], [{ text: 'One of your crew dies of the plague.', crewLose: true }, 1]] },
      leave(),
    ],
  },
  {
    id: 'flare', title: 'Solar Flare', icon: '☀️', text: 'The star at this beacon flares. Heat hits the hull.',
    choices: [
      { text: 'Brace for it', out: [[{ text: 'The heat scorches your hull.', hull: -3 }, 1]] },
      { text: 'Burn hard away (1 fuel)', req: { fuel: 2 }, pay: { fuel: 1 }, out: [[{ text: 'You escape the worst of it.' }, 1]] },
      { text: 'Shields soak it (Shields 4)', req: { sys: 'shields', lvl: 4 }, out: [[{ text: 'Your shields drink the heat. It even charges the cells.', scrap: [10, 15] }, 1]] },
    ],
  },
  {
    id: 'pirates', title: 'Pirate Toll', icon: '🏴‍☠️', text: 'Pirates block the beacon and demand 15 scrap.',
    choices: [
      { text: 'Fight them', out: [[{ text: 'Battle stations!', fight: 'pirate', bonus: 10 }, 1]] },
      { text: 'Pay 15 scrap', req: { scrap: 15 }, pay: { scrap: 15 }, out: [[{ text: 'The pirates let you pass.' }, 1]] },
    ],
  },
  {
    id: 'convoy', title: 'Friendly Convoy', icon: '🚚', text: 'A Federation convoy shares supplies with you.',
    choices: [{ text: 'Thank them', out: [[{ text: 'You get fuel and missiles.', fuel: 3, missiles: 3 }, 2], [{ text: 'They repair your hull.', hull: 6 }, 1]] }],
  },
  {
    id: 'engineer', title: 'Old Engineer', icon: '👴', text: 'A retired engineer offers to tune one of your systems.',
    choices: [
      { text: 'Tune the shields', req: { sys: 'shields' }, out: [[{ text: 'Your shields gain a level.', upgrade: 'shields' }, 1]] },
      { text: 'Tune the engines', req: { sys: 'engines' }, out: [[{ text: 'Your engines gain a level.', upgrade: 'engines' }, 1]] },
      { text: 'Tune the weapons', req: { sys: 'weapons' }, out: [[{ text: 'Your weapons system gains a level.', upgrade: 'weapons' }, 1]] },
    ],
  },
  {
    id: 'trap', title: 'Faint Signal', icon: '📡', text: 'A faint distress signal comes from an escape pod.',
    choices: [
      { text: 'Pick up the pod', out: [[{ text: 'A survivor joins you.', crewGain: 'random' }, 2], [{ text: 'It was bait. Pirates jump in!', fight: 'pirate' }, 2], [{ text: 'The pod holds scrap.', scrap: [20, 30] }, 1]] },
      leave(),
    ],
  },
  {
    id: 'lab', title: 'Science Lab', icon: '🔬', text: 'A research lab offers a test device for your ship.',
    choices: [
      { text: 'Install it', out: [[{ text: 'It works! A new augment.', augment: 'random' }, 2], [{ text: 'It shorts out and sparks a fire.', hull: -2, hurt: 20 }, 1]] },
      leave(),
    ],
  },
  {
    id: 'smuggler', title: 'Smuggler Den', icon: '🕳️', text: 'Smugglers hide a small market in an asteroid.',
    choices: [{ text: 'Visit the market', out: [[{ text: 'They show you their goods.', store: true }, 1]] }],
  },
];

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export const FIGHT_LINES: Record<string, string> = {
  pirate: 'A pirate ship drops out of FTL and powers its weapons.',
  rebel: 'A rebel fighter spots you and moves to attack.',
  engi: 'An Engi ship mistakes you for a raider and attacks.',
  zoltan: 'A Zoltan monitor orders you to stop. Then it opens fire.',
  rock: 'A Rock cruiser charges its missile racks.',
  auto: 'An automated scout locks its guns on you.',
  elite: 'The rebel fleet caught you! An elite warship attacks.',
  flagship: 'The Rebel Flagship waits at the last beacon. End this.',
};
