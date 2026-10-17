/** Static game data: unit kinds, skills, items, beams, acts. */

export type Team = 'ally' | 'enemy' | 'none';

export interface Kind {
  id: string;
  name: string;
  icon: string;
  team: Team;
  /** Weight. Negative weight lifts its side of the beam. */
  w: number;
  hp: number;
  /** Grip: the beam must tilt this many steps more before the unit slides. */
  grip: number;
  move: number;
  atk: number;
  knock: number;
  /** 1 = melee. More = can hit units up to this many cells away. */
  range: number;
  skills: string[];
  /** Floats: never slides. */
  float?: boolean;
  /** Extra weight per hit taken (max +4). */
  grow?: number;
  boss?: boolean;
  text: string;
}

const K = (k: Omit<Kind, 'skills'> & { skills?: string[] }): Kind => ({ skills: [], ...k });

export const KINDS: Record<string, Kind> = {
  // ---- Allies ----
  warden: K({ id: 'warden', name: 'Warden', icon: '🛡️', team: 'ally', w: 4, hp: 9, grip: 1, move: 2, atk: 2, knock: 1, range: 1, text: 'Solid front line.' }),
  rogue: K({ id: 'rogue', name: 'Rogue', icon: '🗡️', team: 'ally', w: 2, hp: 6, grip: 2, move: 3, atk: 3, knock: 0, range: 1, text: 'Light and sure-footed. Hits hard, never pushes.' }),
  archer: K({ id: 'archer', name: 'Archer', icon: '🏹', team: 'ally', w: 2, hp: 5, grip: 1, move: 2, atk: 2, knock: 1, range: 3, text: 'Shoots up to 3 cells away.' }),
  smith: K({ id: 'smith', name: 'Smith', icon: '🔨', team: 'ally', w: 5, hp: 10, grip: 1, move: 1, atk: 2, knock: 2, range: 1, text: 'Heavy hammer. Knocks back 2 cells.' }),
  aeronaut: K({ id: 'aeronaut', name: 'Aeronaut', icon: '🎈', team: 'ally', w: -2, hp: 5, grip: 0, move: 3, atk: 1, knock: 1, range: 1, float: true, skills: ['hook'], text: 'Negative weight: lifts its side. Never slides.' }),
  anchor: K({ id: 'anchor', name: 'Anchor', icon: '⚓', team: 'ally', w: 7, hp: 11, grip: 2, move: 2, atk: 1, knock: 1, range: 1, text: 'Very heavy, very stable. Moves the balance a lot.' }),
  sponge: K({ id: 'sponge', name: 'Sponge', icon: '🧽', team: 'ally', w: 2, hp: 9, grip: 1, move: 2, atk: 2, knock: 1, range: 1, grow: 1, text: 'Gets 1 heavier each time it is hit (max +4).' }),

  // ---- Act 1 enemies ----
  rat: K({ id: 'rat', name: 'Rat', icon: '🐀', team: 'enemy', w: 1, hp: 3, grip: 2, move: 2, atk: 1, knock: 0, range: 1, text: 'Light and quick.' }),
  boar: K({ id: 'boar', name: 'Boar', icon: '🐗', team: 'enemy', w: 5, hp: 6, grip: 0, move: 1, atk: 2, knock: 1, range: 1, text: 'Heavy, slides easily.' }),
  goblin: K({ id: 'goblin', name: 'Goblin', icon: '👺', team: 'enemy', w: 3, hp: 4, grip: 1, move: 2, atk: 1, knock: 1, range: 1, skills: ['shove'], text: 'Shoves units 2 cells.' }),
  bat: K({ id: 'bat', name: 'Bat', icon: '🦇', team: 'enemy', w: -1, hp: 3, grip: 0, move: 3, atk: 1, knock: 1, range: 1, float: true, text: 'Negative weight. Never slides.' }),
  // ---- Act 2 enemies ----
  slinger: K({ id: 'slinger', name: 'Slinger', icon: '🪃', team: 'enemy', w: 2, hp: 4, grip: 1, move: 2, atk: 1, knock: 1, range: 3, text: 'Throws up to 3 cells away.' }),
  ogre: K({ id: 'ogre', name: 'Ogre', icon: '🧌', team: 'enemy', w: 7, hp: 11, grip: 1, move: 1, atk: 3, knock: 1, range: 1, text: 'Huge and heavy. Easier to tip than to kill.' }),
  hookman: K({ id: 'hookman', name: 'Hookman', icon: '🪝', team: 'enemy', w: 3, hp: 5, grip: 1, move: 1, atk: 1, knock: 0, range: 1, skills: ['hook'], text: 'Pulls units from 2–4 cells away.' }),
  gasbag: K({ id: 'gasbag', name: 'Gas Bag', icon: '🫧', team: 'enemy', w: -3, hp: 4, grip: 0, move: 2, atk: 1, knock: 1, range: 1, float: true, text: 'Weight −3. Lifts its side.' }),
  // ---- Act 3 enemies ----
  golem: K({ id: 'golem', name: 'Golem', icon: '🗿', team: 'enemy', w: 8, hp: 12, grip: 2, move: 1, atk: 2, knock: 2, range: 1, text: 'A rock. Knocks back 2.' }),
  bloater: K({ id: 'bloater', name: 'Bloater', icon: '🐡', team: 'enemy', w: 3, hp: 9, grip: 0, move: 1, atk: 2, knock: 0, range: 1, grow: 2, text: 'Gets 2 heavier each time it is hit.' }),
  rhino: K({ id: 'rhino', name: 'Rhino', icon: '🦏', team: 'enemy', w: 6, hp: 9, grip: 1, move: 2, atk: 3, knock: 2, range: 1, text: 'Charges and knocks back 2.' }),
  imp: K({ id: 'imp', name: 'Imp', icon: '😈', team: 'enemy', w: 1, hp: 5, grip: 2, move: 3, atk: 2, knock: 0, range: 1, skills: ['swap'], text: 'Swaps places with units.' }),
  // ---- Bosses ----
  frog: K({ id: 'frog', name: 'Bog King', icon: '🐸', team: 'enemy', w: 8, hp: 16, grip: 2, move: 2, atk: 3, knock: 1, range: 1, boss: true, skills: ['leap'], text: 'Boss. Leaps across the beam.' }),
  colossus: K({ id: 'colossus', name: 'Iron Colossus', icon: '🤖', team: 'enemy', w: 10, hp: 20, grip: 2, move: 1, atk: 3, knock: 2, range: 1, boss: true, skills: ['slam'], text: 'Boss. Slams everything next to it.' }),
  keeper: K({ id: 'keeper', name: 'Scalekeeper', icon: '👑', team: 'enemy', w: 6, hp: 22, grip: 3, move: 2, atk: 3, knock: 1, range: 1, boss: true, skills: ['drop', 'hook'], text: 'Boss. Drops boulders to tip the beam.' }),
  // ---- Objects ----
  crate: K({ id: 'crate', name: 'Crate', icon: '📦', team: 'none', w: 3, hp: 3, grip: 0, move: 0, atk: 0, knock: 0, range: 0, text: 'Just weight. Push it around.' }),
  boulder: K({ id: 'boulder', name: 'Boulder', icon: '🪨', team: 'none', w: 4, hp: 4, grip: 1, move: 0, atk: 0, knock: 0, range: 0, text: 'Dropped by the Scalekeeper.' }),
};

export const ALLY_IDS = ['warden', 'rogue', 'archer', 'smith', 'aeronaut', 'anchor', 'sponge'] as const;

export interface SkillDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  /** Who can learn it after a fight. */
  learn: boolean;
}

export const SKILLS: Record<string, SkillDef> = {
  shove: { id: 'shove', name: 'Shove', icon: '👐', text: 'Push a unit next to you 2 cells away. No damage.', learn: true },
  hook: { id: 'hook', name: 'Hook', icon: '🪝', text: 'Pull a unit 2–4 cells away next to you, 1 damage.', learn: true },
  ballast: { id: 'ballast', name: 'Ballast', icon: '🧱', text: '+3 weight until your next turn.', learn: true },
  leap: { id: 'leap', name: 'Leap', icon: '🦘', text: 'Jump to an empty cell up to 4 away, over units.', learn: true },
  swap: { id: 'swap', name: 'Swap', icon: '🔄', text: 'Swap places with a unit up to 2 cells away.', learn: true },
  slam: { id: 'slam', name: 'Slam', icon: '💥', text: 'Hit both neighbours for 1 and knock them 1 away.', learn: true },
  drop: { id: 'drop', name: 'Drop', icon: '🪨', text: 'Drop a boulder (weight 4) on any empty cell.', learn: false },
};

export const LEARNABLE = Object.values(SKILLS)
  .filter((s) => s.learn)
  .map((s) => s.id);

export interface ItemDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const ITEMS: Record<string, ItemDef> = {
  chalk: { id: 'chalk', name: 'Chalk', icon: '🧂', text: 'All your units get +1 grip.' },
  whetstone: { id: 'whetstone', name: 'Whetstone', icon: '🔪', text: 'All your attacks deal +1 damage.' },
  pole: { id: 'pole', name: 'Long Pole', icon: '🦯', text: 'Your attacks knock back 1 cell further.' },
  rope: { id: 'rope', name: 'Climbing Rope', icon: '🪢', text: 'Once per fight, an ally that would fall hangs on at the edge (2 damage).' },
  bandage: { id: 'bandage', name: 'Bandages', icon: '🩹', text: 'Heal 3 more after each fight.' },
  boots: { id: 'boots', name: 'Spiked Boots', icon: '🥾', text: 'Ice does not make your units slide further.' },
  helmet: { id: 'helmet', name: 'Helmets', icon: '⛑️', text: '+2 max HP for every unit, now and later.' },
  springs: { id: 'springs', name: 'Spring Shoes', icon: '👟', text: 'All your units move 1 cell further.' },
};

export const ITEM_IDS = Object.keys(ITEMS);

export interface BeamDef {
  id: string;
  name: string;
  icon: string;
  /** Half length: cells go from -R to +R. */
  R: number;
  /** Moment needed for one tilt step. */
  step: number;
  pivots: number[];
  ice: boolean;
  rope: boolean;
  text: string;
}

export const BEAMS: Record<string, BeamDef> = {
  plain: { id: 'plain', name: 'Plank', icon: '🪵', R: 5, step: 7, pivots: [0], ice: false, rope: false, text: 'One pivot in the middle.' },
  short: { id: 'short', name: 'Short Plank', icon: '🪵', R: 4, step: 6, pivots: [0], ice: false, rope: false, text: 'Short and touchy. Less room before the edge.' },
  twin: { id: 'twin', name: 'Twin Trestle', icon: '⛩️', R: 5, step: 7, pivots: [-2, 2], ice: false, rope: false, text: 'Two pivots at −2 and +2. It only tilts over the outer pivot on the heavy side.' },
  ice: { id: 'ice', name: 'Ice Beam', icon: '🧊', R: 5, step: 7, pivots: [0], ice: true, rope: false, text: 'Icy. Units that slide go 1 cell further.' },
  swing: { id: 'swing', name: 'Rope Swing', icon: '🪢', R: 5, step: 7, pivots: [0], ice: false, rope: true, text: 'Hangs from a rope. It sways 1 tilt step to one side, and the sway flips each time you end your turn.' },
};

export interface ActDef {
  name: string;
  icon: string;
  beams: string[];
  bossBeam: string;
  enemies: string[];
  boss: string;
  bossAdds: string[];
}

export const ACTS: ActDef[] = [
  { name: 'Rickety Bridge', icon: '🌉', beams: ['plain', 'twin', 'plain'], bossBeam: 'plain', enemies: ['rat', 'boar', 'goblin', 'bat'], boss: 'frog', bossAdds: ['rat', 'goblin'] },
  { name: 'Frozen Gorge', icon: '🏔️', beams: ['ice', 'short', 'twin'], bossBeam: 'ice', enemies: ['slinger', 'ogre', 'hookman', 'gasbag', 'goblin'], boss: 'colossus', bossAdds: ['slinger', 'gasbag'] },
  { name: 'Sky Scales', icon: '☁️', beams: ['swing', 'ice', 'plain', 'twin'], bossBeam: 'swing', enemies: ['golem', 'bloater', 'rhino', 'imp', 'slinger', 'hookman'], boss: 'keeper', bossAdds: ['imp', 'bloater'] },
];

export interface SquadDef {
  id: string;
  name: string;
  icon: string;
  units: string[];
  /** Item the party starts with. */
  item?: string;
  text: string;
}

export const SQUADS: SquadDef[] = [
  { id: 'balanced', name: 'Guild', icon: '⚖️', units: ['warden', 'rogue', 'archer'], text: 'Front line, striker, shooter.' },
  { id: 'heavy', name: 'Ironfoot', icon: '⚓', units: ['smith', 'anchor', 'rogue'], item: 'chalk', text: 'Heavy hitters. Starts with Chalk (+1 grip).' },
  { id: 'odd', name: 'Oddballs', icon: '🎈', units: ['aeronaut', 'sponge', 'warden'], item: 'helmet', text: 'Weird weights. Starts with Helmets (+2 max HP).' },
];
