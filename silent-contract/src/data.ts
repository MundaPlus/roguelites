/** Static game content: agents, gadgets, implants, guards, alarm rules, missions, room templates. */

export type AgentId = 'decker' | 'shade' | 'brick' | 'vesper' | 'patch' | 'wisp' | 'rook' | 'fennec';
export type GadgetId = 'dart' | 'smoke' | 'noise' | 'emp' | 'cloak' | 'medkit' | 'keycard' | 'buster' | 'taser' | 'tag';
export type ImplantId = 'servo' | 'plate' | 'cortex' | 'reflex' | 'nerve' | 'sense' | 'pocket' | 'siphon';
export type GuardKind = 'guard' | 'sentry' | 'enforcer' | 'drone' | 'captain';
export type MissionKind = 'bank' | 'lab' | 'server' | 'cell' | 'clinic' | 'vault';
export type Skill = 'hack' | 'stealth' | 'combat';

export interface AgentDef {
  id: AgentId;
  name: string;
  icon: string;
  color: string;
  hp: number;
  hack: number;
  stealth: number;
  combat: number;
  gadgets: GadgetId[];
  text: string;
  /** Intel cost to unlock in the meta shop. 0 = unlocked from the start. */
  unlock: number;
}

export const AGENTS: Record<AgentId, AgentDef> = {
  decker: { id: 'decker', name: 'Decker', icon: '👩‍💻', color: '#4cc9f0', hp: 4, hack: 2, stealth: 1, combat: 0, gadgets: ['buster'], text: 'Hacker. Terminals give her more power.', unlock: 0 },
  shade: { id: 'shade', name: 'Shade', icon: '🥷', color: '#b388ff', hp: 4, hack: 0, stealth: 2, combat: 1, gadgets: ['cloak'], text: 'Infiltrator. Fast, with a cloak.', unlock: 0 },
  brick: { id: 'brick', name: 'Brick', icon: '🦾', color: '#ff9f43', hp: 5, hack: 0, stealth: 1, combat: 2, gadgets: ['taser'], text: 'Muscle. Long takedowns, a taser for armor.', unlock: 0 },
  vesper: { id: 'vesper', name: 'Vesper', icon: '🎯', color: '#ef476f', hp: 4, hack: 1, stealth: 1, combat: 1, gadgets: ['dart'], text: 'Marksman. Stun darts from range.', unlock: 3 },
  patch: { id: 'patch', name: 'Patch', icon: '🩺', color: '#7ee08a', hp: 4, hack: 1, stealth: 1, combat: 0, gadgets: ['medkit', 'smoke'], text: 'Medic. Heals and hides the team.', unlock: 4 },
  wisp: { id: 'wisp', name: 'Wisp', icon: '👻', color: '#e0e0ff', hp: 3, hack: 0, stealth: 3, combat: 0, gadgets: ['noise'], text: 'Ghost. Cameras cannot see her.', unlock: 5 },
  rook: { id: 'rook', name: 'Rook', icon: '🤖', color: '#ffd166', hp: 6, hack: 1, stealth: 0, combat: 2, gadgets: ['emp'], text: 'Android. Tough, with an EMP.', unlock: 6 },
  fennec: { id: 'fennec', name: 'Fennec', icon: '🦊', color: '#f78c6b', hp: 4, hack: 1, stealth: 2, combat: 1, gadgets: ['tag', 'keycard'], text: 'Scout. Tags guards, opens locks.', unlock: 8 },
};
export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export type GadgetTarget = 'self' | 'tile' | 'guard' | 'ally' | 'device';

export interface GadgetDef {
  id: GadgetId;
  name: string;
  icon: string;
  text: string;
  ap: number;
  charges: number;
  target: GadgetTarget;
  range: number;
  price: number;
}

export const GADGETS: Record<GadgetId, GadgetDef> = {
  dart: { id: 'dart', name: 'Stun Dart', icon: '💉', text: 'Knock out a guard in sight up to 5 tiles away for 2 turns. Not armored guards.', ap: 2, charges: 2, target: 'guard', range: 5, price: 70 },
  smoke: { id: 'smoke', name: 'Smoke Bomb', icon: '💨', text: 'A 3×3 cloud for 2 turns. Nothing sees through smoke.', ap: 1, charges: 1, target: 'tile', range: 4, price: 50 },
  noise: { id: 'noise', name: 'Noisemaker', icon: '📣', text: 'Guards within 6 tiles of the spot go there to look.', ap: 1, charges: 2, target: 'tile', range: 7, price: 40 },
  emp: { id: 'emp', name: 'EMP Pack', icon: '⚡', text: 'Turns off cameras and drones within 4 tiles for 3 turns.', ap: 2, charges: 1, target: 'self', range: 4, price: 70 },
  cloak: { id: 'cloak', name: 'Cloak', icon: '🕶️', text: 'Nobody can see you until your next turn.', ap: 1, charges: 1, target: 'self', range: 0, price: 90 },
  medkit: { id: 'medkit', name: 'Medkit', icon: '🩹', text: 'Heal 2 HP on yourself or an adjacent agent. Also revives.', ap: 1, charges: 2, target: 'ally', range: 1, price: 50 },
  keycard: { id: 'keycard', name: 'Keycard', icon: '🗝️', text: 'Open an adjacent safe, target or locked door with no power.', ap: 1, charges: 1, target: 'device', range: 1, price: 60 },
  buster: { id: 'buster', name: 'Buster Chip', icon: '💾', text: '+2 power at once.', ap: 0, charges: 1, target: 'self', range: 0, price: 50 },
  taser: { id: 'taser', name: 'Shock Taser', icon: '🔌', text: 'Knock out an adjacent guard for 3 turns, also armored ones.', ap: 2, charges: 2, target: 'guard', range: 1, price: 80 },
  tag: { id: 'tag', name: 'Tag Lens', icon: '🔭', text: 'Tag a guard in sight. You see it and its plan at all times.', ap: 0, charges: 3, target: 'guard', range: 8, price: 30 },
};
export const GADGET_IDS = Object.keys(GADGETS) as GadgetId[];

export interface ImplantDef {
  id: ImplantId;
  name: string;
  icon: string;
  text: string;
  price: number;
}

export const IMPLANTS: Record<ImplantId, ImplantDef> = {
  servo: { id: 'servo', name: 'Leg Servos', icon: '🦿', text: '+1 AP each turn.', price: 120 },
  plate: { id: 'plate', name: 'Dermal Plate', icon: '🛡️', text: '+1 max HP.', price: 90 },
  cortex: { id: 'cortex', name: 'Cortex Link', icon: '🧠', text: '+1 hacking.', price: 100 },
  reflex: { id: 'reflex', name: 'Reflex Wire', icon: '🥊', text: 'Takedowns cost 1 AP.', price: 100 },
  nerve: { id: 'nerve', name: 'Nerve Lock', icon: '💤', text: 'Your knockouts last 2 turns longer.', price: 80 },
  sense: { id: 'sense', name: 'Sixth Sense', icon: '👁️', text: 'See guards within 4 tiles through walls.', price: 90 },
  pocket: { id: 'pocket', name: 'Hidden Pocket', icon: '🎒', text: '+1 gadget slot.', price: 70 },
  siphon: { id: 'siphon', name: 'Loot Scanner', icon: '💰', text: 'Safes give 50% more credits.', price: 80 },
};
export const IMPLANT_IDS = Object.keys(IMPLANTS) as ImplantId[];

export interface GuardDef {
  kind: GuardKind;
  name: string;
  icon: string;
  armor: number;
  dmg: number;
  range: number;
  speed: number;
  chase: number;
  /** Mechanical units cannot be knocked out. EMP or a hack turns them off. */
  mech: boolean;
  text: string;
}

export const GUARDS: Record<GuardKind, GuardDef> = {
  guard: { kind: 'guard', name: 'Guard', icon: '💂', armor: 0, dmg: 1, range: 4, speed: 2, chase: 4, mech: false, text: 'Walks a patrol route. Shoots for 1.' },
  sentry: { kind: 'sentry', name: 'Sentry', icon: '👮', armor: 0, dmg: 1, range: 4, speed: 0, chase: 3, mech: false, text: 'Stands still and turns between two directions.' },
  enforcer: { kind: 'enforcer', name: 'Enforcer', icon: '🪖', armor: 1, dmg: 2, range: 4, speed: 3, chase: 4, mech: false, text: 'Armored. Needs combat 3 or a taser. Shoots for 2.' },
  drone: { kind: 'drone', name: 'Drone', icon: '🛸', armor: 0, dmg: 0, range: 4, speed: 3, chase: 3, mech: true, text: 'Flying camera. Raises the alarm and calls guards. EMP or hack it (2 power).' },
  captain: { kind: 'captain', name: 'Captain', icon: '🎖️', armor: 1, dmg: 2, range: 5, speed: 2, chase: 4, mech: false, text: 'Vault boss. Armored, sees far, wakes up fast.' },
};

export const ALARM_STEP = 6;
export const ALARM_MAX = 6;

export const ALARM_RULES: string[] = [
  'Quiet. The alarm rises 1 tick each turn.',
  'Patrols walk 1 tile faster.',
  'A reinforcement guard arrives.',
  'Disabled cameras reboot. A drone arrives.',
  'Lockdown: closed doors lock (3 AP to force).',
  'Two enforcers arrive and hunt you.',
  'Full alert: guards see 1 tile farther. A hunting enforcer arrives every 2 turns.',
];

export interface MissionDef {
  kind: MissionKind;
  name: string;
  icon: string;
  target: string;
  targetIcon: string;
  reward: string;
  credits: number;
}

export const MISSIONS: Record<MissionKind, MissionDef> = {
  bank: { kind: 'bank', name: 'Bank Branch', icon: '🏦', target: 'Vault box', targetIcon: '💰', reward: 'Many credits', credits: 170 },
  lab: { kind: 'lab', name: 'Research Lab', icon: '🧪', target: 'Prototype', targetIcon: '📦', reward: 'A gadget + credits', credits: 70 },
  server: { kind: 'server', name: 'Server Farm', icon: '🖥️', target: 'Mainframe', targetIcon: '🗄️', reward: 'Intel + credits, more terminals', credits: 100 },
  cell: { kind: 'cell', name: 'Detention Block', icon: '⛓️', target: 'Prisoner', targetIcon: '🧍', reward: 'A free agent', credits: 40 },
  clinic: { kind: 'clinic', name: 'Cyber Clinic', icon: '🏥', target: 'Implant case', targetIcon: '🧬', reward: 'A free implant', credits: 50 },
  vault: { kind: 'vault', name: 'The Vault', icon: '🏛️', target: 'The Contract', targetIcon: '📜', reward: 'Win the run', credits: 400 },
};
export const OFFER_KINDS: MissionKind[] = ['bank', 'lab', 'server', 'cell', 'clinic'];

export const CORPS = ['Helix', 'Omnicore', 'Saito', 'Kestrel', 'Vantor', 'Nyx', 'Ardent', 'Plexus', 'Corvid', 'Lumen'];

/** 4×4 room interiors. `.` floor, `c` cover. Rotated and mirrored at random. */
export const ROOMS: { name: string; rows: string[] }[] = [
  { name: 'Hall', rows: ['....', '....', '....', '....'] },
  { name: 'Office', rows: ['.cc.', '....', '....', '.cc.'] },
  { name: 'Storage', rows: ['c..c', '....', '....', 'c..c'] },
  { name: 'Lobby', rows: ['....', '.cc.', '.cc.', '....'] },
  { name: 'Racks', rows: ['....', 'c.c.', 'c.c.', '....'] },
  { name: 'Lounge', rows: ['cc..', '....', '....', '..c.'] },
  { name: 'Lab', rows: ['....', 'c..c', 'c..c', '....'] },
  { name: 'Archive', rows: ['c...', 'c...', '...c', '...c'] },
  { name: 'Desk', rows: ['....', '.c..', '....', '..c.'] },
];

export const DAYS = 6;
export const MAX_TEAM = 4;
export const GADGET_SLOTS = 2;
export const IMPLANT_SLOTS = 2;
export const HIRE_PRICE = 140;
export const trainPrice = (lvl: number): number => 50 + lvl * 40;

export interface LoadoutDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  cost: number;
}

export const LOADOUTS: LoadoutDef[] = [
  { id: 'cash', name: 'Seed Money', icon: '💳', text: 'Start each run with +100 credits.', cost: 4 },
  { id: 'rewind', name: 'Time Buffer', icon: '⏪', text: '+1 rewind in every mission.', cost: 5 },
  { id: 'kit', name: 'Field Kit', icon: '🧰', text: 'Every starting agent gets a Medkit.', cost: 6 },
];
