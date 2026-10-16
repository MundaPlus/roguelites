/** Static game data: skills, traits, terrain, weather, names, groups, unlocks. */

export type Skill = 'hunt' | 'medic' | 'mech' | 'scout' | 'talk' | 'fight';
export const SKILLS: Skill[] = ['hunt', 'medic', 'mech', 'scout', 'talk', 'fight'];

export const SKILL_INFO: Record<Skill, { name: string; icon: string; text: string }> = {
  hunt: { name: 'Hunter', icon: '🎯', text: 'Bigger hit circle and slower game in hunts. Opens tracking choices.' },
  medic: { name: 'Medic', icon: '⚕️', text: 'Sick travelers recover faster. Medicine heals more. Opens doctor choices.' },
  mech: { name: 'Mechanic', icon: '🔧', text: 'Less wagon wear. Parts repair more. Opens repair choices.' },
  scout: { name: 'Scout', icon: '🧭', text: 'Fewer rocks in river crossings. Can sneak past bandits. Opens path choices.' },
  talk: { name: 'Talker', icon: '💬', text: 'Lower shop prices and better job pay. Opens trade and talk choices.' },
  fight: { name: 'Gunhand', icon: '🔫', text: 'Shoots bandits by itself in ambushes. Opens fight choices.' },
};

export interface TraitDef {
  name: string;
  icon: string;
  text: string;
}

export const TRAITS: Record<string, TraitDef> = {
  tough: { name: 'Tough', icon: '🪨', text: '+3 max HP.' },
  frail: { name: 'Frail', icon: '🥀', text: '-2 max HP. Gets sick more often.' },
  glutton: { name: 'Glutton', icon: '🍗', text: 'Eats 50% more food.' },
  light: { name: 'Light Eater', icon: '🥄', text: 'Eats 25% less food.' },
  cheerful: { name: 'Cheerful', icon: '😄', text: '+1 morale each day.' },
  grumpy: { name: 'Grumpy', icon: '😠', text: '-1 morale every second day. Starts quarrels.' },
  brave: { name: 'Brave', icon: '🦁', text: 'Shoots faster in ambushes. Never leaves the wagon.' },
  coward: { name: 'Coward', icon: '🐇', text: 'Leaves first when morale is low.' },
  lucky: { name: 'Lucky', icon: '🍀', text: '+10% on skill checks.' },
  pious: { name: 'Pious', icon: '🙏', text: 'Deaths hurt morale less. Likes preachers.' },
  sharp: { name: 'Sharpshooter', icon: '👁️', text: 'Your shots hit from further away while this traveler lives.' },
  greedy: { name: 'Greedy', icon: '💰', text: 'Finds more money. Sometimes takes it.' },
  strong: { name: 'Strong', icon: '💪', text: 'Carries 20 more meat home from hunts. Helps with heavy work.' },
  musician: { name: 'Musician', icon: '🎻', text: 'Rest and camps give more morale.' },
  loyal: { name: 'Loyal', icon: '🐕', text: 'Never leaves the wagon.' },
};

export type Terrain = 'prairie' | 'forest' | 'badlands' | 'desert' | 'mountain' | 'valley';

export interface TerrainDef {
  name: string;
  icon: string;
  water: number; // water use per traveler per day
  wear: number; // wagon wear per day
  sick: number; // extra sickness chance per day
  ground: string; // color for the travel strip
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  prairie: { name: 'Prairie', icon: '🌾', water: 1, wear: 3, sick: 0, ground: '#8a7a3c' },
  forest: { name: 'Forest', icon: '🌲', water: 0.5, wear: 4, sick: 0.01, ground: '#3f5b32' },
  badlands: { name: 'Badlands', icon: '🪨', water: 1.5, wear: 6, sick: 0, ground: '#8b5a3c' },
  desert: { name: 'Desert', icon: '🏜️', water: 2, wear: 5, sick: 0.01, ground: '#c49a5a' },
  mountain: { name: 'Mountains', icon: '⛰️', water: 1, wear: 7, sick: 0.02, ground: '#6b6872' },
  valley: { name: 'Green Valley', icon: '🌄', water: 0.5, wear: 1, sick: 0, ground: '#5f8a45' },
};

export type Weather = 'clear' | 'hot' | 'rain' | 'storm' | 'cold' | 'dust';

export interface WeatherDef {
  name: string;
  icon: string;
  water: number; // multiplier on water use
  food: number; // multiplier on food use
  wear: number; // extra wear
  speed: number; // multiplier on miles
  sick: number; // extra sickness chance
  morale: number;
  rain: number; // water collected
}

export const WEATHER: Record<Weather, WeatherDef> = {
  clear: { name: 'Clear', icon: '☀️', water: 1, food: 1, wear: 0, speed: 1, sick: 0, morale: 0.5, rain: 0 },
  hot: { name: 'Heat', icon: '🥵', water: 1.5, food: 1, wear: 0, speed: 0.9, sick: 0.01, morale: -1, rain: 0 },
  rain: { name: 'Rain', icon: '🌧️', water: 0.5, food: 1, wear: 1, speed: 0.85, sick: 0.01, morale: -0.5, rain: 4 },
  storm: { name: 'Storm', icon: '⛈️', water: 0.5, food: 1, wear: 4, speed: 0.6, sick: 0.03, morale: -2, rain: 6 },
  cold: { name: 'Cold', icon: '🥶', water: 0.8, food: 1.3, wear: 1, speed: 0.9, sick: 0.03, morale: -1, rain: 0 },
  dust: { name: 'Dust Storm', icon: '🌪️', water: 1.3, food: 1, wear: 2, speed: 0.6, sick: 0.01, morale: -2, rain: 0 },
};

/** Weather weights per terrain. */
export const WEATHER_TABLE: Record<Terrain, [Weather, number][]> = {
  prairie: [['clear', 5], ['hot', 2], ['rain', 3], ['storm', 1], ['cold', 1]],
  forest: [['clear', 4], ['rain', 4], ['storm', 1], ['cold', 2]],
  badlands: [['clear', 4], ['hot', 3], ['dust', 2], ['storm', 1]],
  desert: [['clear', 3], ['hot', 5], ['dust', 3], ['rain', 1]],
  mountain: [['clear', 3], ['cold', 4], ['storm', 2], ['rain', 2]],
  valley: [['clear', 6], ['rain', 2]],
};

/** Terrain weights per region (map third). */
export const REGIONS: { name: string; terrain: [Terrain, number][] }[] = [
  { name: 'The Long Plains', terrain: [['prairie', 5], ['forest', 3]] },
  { name: 'The Dry Basin', terrain: [['desert', 4], ['badlands', 4], ['prairie', 1]] },
  { name: 'The High Pass', terrain: [['mountain', 5], ['forest', 3], ['badlands', 1]] },
];

export type NodeKind = 'start' | 'town' | 'river' | 'hunt' | 'pass' | 'spring' | 'camp' | 'ruins' | 'end';

export const NODE_INFO: Record<NodeKind, { name: string; icon: string; text: string }> = {
  start: { name: 'Independence', icon: '🏘️', text: 'The trail starts here.' },
  town: { name: 'Town', icon: '🏘️', text: 'Shop, jobs, doctor, recruits.' },
  river: { name: 'River', icon: '🌊', text: 'Refill water. Ford it, pay the ferry or wait.' },
  hunt: { name: 'Hunting Grounds', icon: '🦌', text: 'Plenty of game. Hunt for food.' },
  pass: { name: 'Bandit Pass', icon: '🏴', text: 'A narrow pass. Bandits wait here.' },
  spring: { name: 'Spring', icon: '💧', text: 'Clean water. Fill the barrels.' },
  camp: { name: 'Camp', icon: '🔥', text: 'A good place to rest.' },
  ruins: { name: 'Ruins', icon: '❔', text: 'Something happened here. Search it.' },
  end: { name: 'Green Valley', icon: '🌄', text: 'The end of the trail. Raiders guard the last gate.' },
};

export const TOWN_NAMES = [
  'Fort Laramie', 'Dry Creek', 'Sweetwater', 'Bent Nail', 'Cobb Station', 'Redrock', 'Hope Springs', 'Last Chance',
  'Cedar Bluff', 'Willow Bend', 'Copper Gulch', 'Saint Agnes', 'Burnt Fork', 'Fort Hall', 'Kettle Falls',
];

export const RIVER_NAMES = ['Platte', 'Snake', 'Green', 'Sweetwater', 'Big Blue', 'Kaw', 'Bear', 'Powder'];

export const NAMES: [string, string][] = [
  ['Ada', '👩'], ['Bo', '🧔'], ['Clara', '👩‍🦰'], ['Dutch', '🤠'], ['Eli', '👨'], ['Faye', '👱‍♀️'], ['Gus', '👴'],
  ['Hattie', '👵'], ['Ike', '🧑'], ['June', '👩‍🌾'], ['Kit', '🧒'], ['Lena', '👩‍🦱'], ['Moses', '👨‍🦳'], ['Nell', '👧'],
  ['Otto', '👨‍🌾'], ['Pearl', '👩‍🦳'], ['Quinn', '🧑‍🦰'], ['Ruth', '🙍‍♀️'], ['Silas', '🧓'], ['Tess', '💁‍♀️'],
  ['Uri', '🧑‍🦱'], ['Vera', '👸'], ['Walt', '👨‍🦰'], ['Wren', '🧕'], ['Zeke', '🤠'], ['Abe', '🎩'], ['Bea', '👩‍🍳'],
  ['Cal', '🧑‍🔧'], ['Dot', '👩‍⚕️'], ['Ezra', '🧑‍🌾'],
];

export interface Res {
  food: number;
  water: number;
  parts: number;
  med: number;
  money: number;
  ammo: number;
}

export const RES_INFO: Record<keyof Res | 'morale' | 'wagon', { name: string; icon: string }> = {
  food: { name: 'Food', icon: '🍖' },
  water: { name: 'Water', icon: '💧' },
  parts: { name: 'Parts', icon: '⚙️' },
  med: { name: 'Medicine', icon: '💊' },
  money: { name: 'Money', icon: '💲' },
  ammo: { name: 'Ammo', icon: '🧨' },
  morale: { name: 'Morale', icon: '🙂' },
  wagon: { name: 'Wagon', icon: '🛞' },
};

export interface MemberPlan {
  skills: Partial<Record<Skill, number>>;
  traits: string[];
}

export interface GroupDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  cost: number; // trail marks to unlock (0 = free)
  members: MemberPlan[];
  res: Partial<Res>;
  morale?: number;
  waterCap?: number;
}

export const BASE_RES: Res = { food: 60, water: 30, parts: 2, med: 2, money: 70, ammo: 25 };

export const GROUPS: GroupDef[] = [
  {
    id: 'settlers',
    name: 'Settler Family',
    icon: '👨‍👩‍👧',
    text: 'A balanced family with a little of everything.',
    cost: 0,
    members: [
      { skills: { hunt: 1, fight: 1 }, traits: ['tough'] },
      { skills: { medic: 2 }, traits: ['pious'] },
      { skills: { mech: 1, scout: 1 }, traits: [] },
      { skills: { talk: 2 }, traits: ['cheerful'] },
    ],
    res: {},
  },
  {
    id: 'trappers',
    name: 'Fur Trappers',
    icon: '🦫',
    text: 'Two hunters and a scout. Lots of ammo, little food.',
    cost: 4,
    members: [
      { skills: { hunt: 2, fight: 1 }, traits: ['sharp'] },
      { skills: { hunt: 2 }, traits: ['strong'] },
      { skills: { scout: 2 }, traits: ['light'] },
      { skills: { medic: 1 }, traits: ['grumpy'] },
    ],
    res: { ammo: 50, food: 45, money: 55 },
  },
  {
    id: 'medics',
    name: 'Mission Doctors',
    icon: '⛪',
    text: 'Two doctors with a chest of medicine and a thin purse.',
    cost: 5,
    members: [
      { skills: { medic: 3 }, traits: ['pious'] },
      { skills: { medic: 2, talk: 1 }, traits: ['loyal'] },
      { skills: { mech: 1, hunt: 1 }, traits: [] },
      { skills: { fight: 1 }, traits: ['frail'] },
    ],
    res: { med: 6, money: 55 },
  },
  {
    id: 'freight',
    name: 'Freight Crew',
    icon: '🛠️',
    text: 'Haulers with spare parts and big barrels.',
    cost: 6,
    members: [
      { skills: { mech: 3 }, traits: ['strong'] },
      { skills: { mech: 1, fight: 1 }, traits: ['tough'] },
      { skills: { scout: 1, hunt: 1 }, traits: ['glutton'] },
      { skills: { talk: 1 }, traits: [] },
    ],
    res: { parts: 5, water: 45, money: 80 },
    waterCap: 55,
  },
  {
    id: 'guns',
    name: 'Hired Guns',
    icon: '🔫',
    text: 'Gunhands with ammo and cash, but no patience.',
    cost: 7,
    members: [
      { skills: { fight: 3 }, traits: ['brave'] },
      { skills: { fight: 2, hunt: 1 }, traits: ['greedy'] },
      { skills: { fight: 1, scout: 1 }, traits: ['grumpy'] },
      { skills: { medic: 1 }, traits: [] },
    ],
    res: { ammo: 45, money: 100 },
    morale: 55,
  },
  {
    id: 'show',
    name: 'Traveling Show',
    icon: '🎪',
    text: 'Musicians and talkers. High spirits, weak hands.',
    cost: 8,
    members: [
      { skills: { talk: 3 }, traits: ['musician'] },
      { skills: { talk: 1, medic: 1 }, traits: ['cheerful'] },
      { skills: { scout: 1 }, traits: ['lucky'] },
      { skills: { mech: 1 }, traits: ['musician'] },
    ],
    res: { money: 120 },
    morale: 90,
  },
];

export interface ChainDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  cost: number;
}

/** Event chains. Chains with cost 0 are always in the deck. */
export const CHAINS: ChainDef[] = [
  { id: 'prospector', name: 'The Prospector', icon: '⛏️', text: 'An old map that points to gold.', cost: 0 },
  { id: 'rival', name: 'The Rival Wagon', icon: '🏁', text: 'Another caravan races you west.', cost: 3 },
  { id: 'preacher', name: 'The Preacher', icon: '📖', text: 'A wandering preacher and his flock.', cost: 4 },
  { id: 'outlaw', name: 'The Outlaw', icon: '🤠', text: 'A wanted man, a bounty and a hideout.', cost: 5 },
];

export const MAX_PARTY = 5;
export const ROWS = 12; // rows 0..11, row 11 is the end
