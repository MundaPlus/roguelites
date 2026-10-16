export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  move: number;
  weapon: string;
  flying?: boolean;
  jump?: boolean;
  stable?: boolean;
  boss?: boolean;
  /** Extra spawn markers this enemy calls each round. */
  brood?: number;
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = {
  scuttler: { id: 'scuttler', name: 'Scuttler', icon: '🦂', hp: 2, move: 3, weapon: 'claws', text: 'Fast and weak.' },
  spitter: { id: 'spitter', name: 'Spitter', icon: '🐛', hp: 2, move: 2, weapon: 'spit', text: 'Shoots in a straight line.' },
  beetle: { id: 'beetle', name: 'Mortar Beetle', icon: '🪲', hp: 3, move: 2, weapon: 'mortar', text: 'Lobs over walls. Keep it busy.' },
  brute: { id: 'brute', name: 'Horn Brute', icon: '🦏', hp: 4, move: 2, weapon: 'slam', text: 'Tough. Its slam pushes.' },
  digger: { id: 'digger', name: 'Digger', icon: '🐜', hp: 3, move: 3, weapon: 'sweep', text: 'Hits three tiles at once.' },
  firefly: { id: 'firefly', name: 'Firefly', icon: '🦟', hp: 2, move: 4, weapon: 'firespit', flying: true, text: 'Flies over water and chasms.' },
  leaper: { id: 'leaper', name: 'Leaper', icon: '🦗', hp: 3, move: 4, weapon: 'bite', jump: true, text: 'Jumps over anything in its way.' },
  tyrant: {
    id: 'tyrant',
    name: 'Hive Tyrant',
    icon: '🦖',
    hp: 6,
    move: 2,
    weapon: 'crush',
    stable: true,
    boss: true,
    brood: 1,
    text: 'Island boss. Cannot be pushed. Kill it to end the battle.',
  },
  queen: {
    id: 'queen',
    name: 'Hive Queen',
    icon: '🕷️',
    hp: 12,
    move: 0,
    weapon: 'barrage',
    stable: true,
    boss: true,
    brood: 2,
    text: 'The final boss. Does not move. Kill it, or hold out until the end.',
  },
};

export interface FrameDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  move: number;
  weapon: string;
  flying?: boolean;
}

export const FRAMES: Record<string, FrameDef> = {
  ram: { id: 'ram', name: 'Titan Mech', icon: '🦾', hp: 3, move: 3, weapon: 'fist' },
  cannon: { id: 'cannon', name: 'Cannon Mech', icon: '🛞', hp: 3, move: 3, weapon: 'cannon' },
  lobber: { id: 'lobber', name: 'Siege Mech', icon: '📡', hp: 2, move: 3, weapon: 'lobber' },
  phase: { id: 'phase', name: 'Phase Mech', icon: '💠', hp: 2, move: 4, weapon: 'swap' },
  hook: { id: 'hook', name: 'Hook Mech', icon: '⚓', hp: 3, move: 3, weapon: 'grapple' },
  mist: { id: 'mist', name: 'Mist Mech', icon: '🛸', hp: 2, move: 4, weapon: 'mist', flying: true },
  flame: { id: 'flame', name: 'Pyro Mech', icon: '🧯', hp: 3, move: 3, weapon: 'flame' },
  aegis: { id: 'aegis', name: 'Aegis Mech', icon: '⛨', hp: 2, move: 3, weapon: 'aegis' },
  quake: { id: 'quake', name: 'Quake Mech', icon: '🗿', hp: 4, move: 3, weapon: 'quake' },
};

export type SquadId = 'vanguard' | 'flux' | 'blaze';

export interface SquadDef {
  id: SquadId;
  name: string;
  icon: string;
  frames: [string, string, string];
  /** Islands cleared (best run) needed to unlock. */
  unlock: number;
  text: string;
}

export const SQUADS: Record<SquadId, SquadDef> = {
  vanguard: { id: 'vanguard', name: 'Vanguard', icon: '🛡️', frames: ['ram', 'cannon', 'lobber'], unlock: 0, text: 'Punch, shoot and shell. Straight pushes.' },
  flux: { id: 'flux', name: 'Flux', icon: '🌀', frames: ['phase', 'hook', 'mist'], unlock: 1, text: 'Swap, pull and smoke. No damage, all control.' },
  blaze: { id: 'blaze', name: 'Blaze', icon: '🔥', frames: ['flame', 'aegis', 'quake'], unlock: 2, text: 'Fire, shields and a slam. Burn them down.' },
};

export const SQUAD_IDS: SquadId[] = ['vanguard', 'flux', 'blaze'];

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const PERKS: Record<string, PerkDef> = {
  fast: { id: 'fast', name: 'Thrusters', icon: '👟', text: '+1 move.' },
  tough: { id: 'tough', name: 'Plating', icon: '🧱', text: '+2 max HP.' },
  gunner: { id: 'gunner', name: 'Gunner', icon: '🎖️', text: '+1 damage with weapons that deal damage.' },
  steady: { id: 'steady', name: 'Steady', icon: '🧘', text: 'Weapons work in smoke and water. Never burns.' },
  medic: { id: 'medic', name: 'Field Medic', icon: '🩹', text: 'Repair heals 3 instead of 1.' },
};

export const PERK_IDS = Object.keys(PERKS);

/** Kills needed for each pilot level. */
export const LEVELS = [3, 8];

export const PILOT_NAMES = [
  'Ada', 'Bram', 'Cass', 'Dov', 'Esme', 'Finn', 'Gale', 'Hiro', 'Ines', 'Jax', 'Kira', 'Lev', 'Mara', 'Nico',
  'Orla', 'Pax', 'Quin', 'Rhea', 'Sol', 'Tam', 'Uma', 'Vik', 'Wren', 'Yara', 'Zed',
];
