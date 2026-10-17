/** Static game data: lamps, figures, enemies, bosses, acts. */

export type LampKind = 'lantern' | 'candle' | 'rose' | 'flicker' | 'moon' | 'torch' | 'wisp';

export interface LampDef {
  name: string;
  icon: string;
  /** Lights figures up to this many tiles away (also diagonal). */
  reach: number;
  /** Shadow length in tiles. 0 = no shadows. */
  len: number;
  /** Extra damage for shadows this lamp makes. */
  dmg: number;
  /** How far you can move it in one move. */
  move: number;
  /** Heals figures of its own side that it lights. */
  heal: number;
  /** Shadow length is rolled 1–4 each turn. */
  flicker: boolean;
  text: string;
}

export const LAMPS: Record<LampKind, LampDef> = {
  lantern: { name: 'Lantern', icon: '🏮', reach: 4, len: 3, dmg: 0, move: 3, heal: 0, flicker: false, text: 'Reach 4, shadows 3. The plain lamp.' },
  candle: { name: 'Candle', icon: '🕯️', reach: 3, len: 2, dmg: 1, move: 3, heal: 0, flicker: false, text: 'Reach 3, shadows 2, and its shadows deal +1 damage.' },
  rose: { name: 'Rose Lamp', icon: '🌹', reach: 3, len: 0, dmg: 0, move: 3, heal: 1, flicker: false, text: 'Casts no shadows. Heals each of your figures in reach by 1 per turn.' },
  flicker: { name: 'Flicker Lamp', icon: '✨', reach: 4, len: 3, dmg: 0, move: 4, heal: 0, flicker: true, text: 'Reach 4. Shadow length is rolled 1–5 every turn (shown on the lamp). Moves 4.' },
  moon: { name: 'Moon', icon: '🌕', reach: 9, len: 4, dmg: 0, move: 1, heal: 0, flicker: false, text: 'Lights the whole room. Shadows 4. Moves only 1 tile.' },
  torch: { name: 'Torch', icon: '🔥', reach: 2, len: 2, dmg: 1, move: 0, heal: 0, flicker: false, text: 'Enemy torch. Reach 2, shadows 2, +1 damage.' },
  wisp: { name: 'Will-o-wisp', icon: '🪔', reach: 3, len: 2, dmg: 0, move: 2, heal: 0, flicker: false, text: 'Enemy lamp. Floats 2 tiles each turn. Cannot be hurt.' },
};

/** Lamps the player can find. */
export const PLAYER_LAMPS: LampKind[] = ['lantern', 'candle', 'rose', 'flicker', 'moon'];

export interface FigDef {
  name: string;
  icon: string;
  hp: number;
  atk: number;
  /** Extra shadow length. */
  tall: number;
  /** Shadow passes through enemy figures and hits all of them. */
  pierce?: boolean;
  /** Tiles it can walk per turn (enemies only). */
  walk?: number;
  /** Lamp it carries on its own tile (enemies only). */
  lamp?: LampKind;
  /** Extra tiles of a large figure, relative to its anchor. */
  cells?: [number, number][];
  text: string;
}

export type HeroKind = 'squire' | 'pikeman' | 'duelist' | 'giant' | 'witch';

export const HEROES: Record<HeroKind, FigDef> = {
  squire: { name: 'Squire', icon: '🛡️', hp: 7, atk: 1, tall: 0, text: 'Tough. Short shadow.' },
  pikeman: { name: 'Pikeman', icon: '🔱', hp: 5, atk: 1, tall: 1, text: 'Tall: its shadows are 1 tile longer.' },
  duelist: { name: 'Duelist', icon: '🤺', hp: 5, atk: 2, tall: 0, text: 'Hits hard: 2 damage per shadow.' },
  giant: { name: 'Giant', icon: '🧌', hp: 8, atk: 2, tall: 1, text: 'Big, tall and strong.' },
  witch: { name: 'Witch', icon: '🧙', hp: 4, atk: 2, tall: 1, pierce: true, text: 'Her shadows pass through enemies and hit all of them.' },
};

export const START_HEROES: HeroKind[] = ['squire', 'pikeman', 'duelist'];

export type FoeKind = 'imp' | 'hound' | 'bearer' | 'brute' | 'idol' | 'torcher' | 'wraith' | 'serpent' | 'spider' | 'eclipse';

export const FOES: Record<FoeKind, FigDef> = {
  imp: { name: 'Imp', icon: '👺', hp: 3, atk: 1, tall: 0, walk: 1, text: 'Walks 1 tile per turn.' },
  hound: { name: 'Hound', icon: '🐺', hp: 2, atk: 1, tall: 0, walk: 2, text: 'Fast: walks 2 tiles per turn.' },
  bearer: { name: 'Lamp Bearer', icon: '👻', hp: 3, atk: 1, tall: 0, walk: 1, lamp: 'wisp', text: 'Carries a lamp (reach 3, shadows 2) and walks 1 tile per turn.' },
  brute: { name: 'Brute', icon: '👹', hp: 6, atk: 2, tall: 0, text: 'Stands still. 2 damage per shadow.' },
  idol: { name: 'Idol', icon: '🗿', hp: 5, atk: 1, tall: 2, text: 'Stands still. Very tall: shadows 2 tiles longer.' },
  torcher: { name: 'Torcher', icon: '🧟', hp: 3, atk: 1, tall: 0, walk: 2, lamp: 'torch', text: 'Carries a torch (reach 2, shadows 2, +1 damage). Walks 2 tiles.' },
  wraith: { name: 'Wraith', icon: '💀', hp: 4, atk: 2, tall: 0, walk: 1, text: 'Walks 1 tile per turn. 2 damage per shadow.' },
  serpent: { name: 'Bone Serpent', icon: '🐍', hp: 12, atk: 1, tall: 0, cells: [[1, 0], [2, 0]], text: 'Boss. 3 tiles long. Each tile casts its own shadow.' },
  spider: { name: 'Spider Queen', icon: '🕷️', hp: 15, atk: 2, tall: 0, cells: [[1, 0], [0, 1]], text: 'Boss. L-shaped. 2 damage per shadow.' },
  eclipse: { name: 'Eclipse', icon: '🌑', hp: 20, atk: 2, tall: 1, cells: [[1, 0], [0, 1], [1, 1]], text: 'Boss. 2×2 and tall. 2 damage per shadow.' },
};

export interface ActDef {
  name: string;
  icon: string;
  foes: [FoeKind, number][];
  boss: FoeKind;
  /** Free enemy lamps (wisps) in the boss room. */
  wisps: number;
  /** Extra HP for every enemy in this act. */
  hp: number;
}

export const ACTS: ActDef[] = [
  { name: 'Cellar', icon: '🍷', foes: [['imp', 3], ['hound', 2], ['bearer', 3]], boss: 'serpent', wisps: 1, hp: 0 },
  { name: 'Crypt', icon: '⚰️', foes: [['imp', 2], ['hound', 2], ['bearer', 3], ['brute', 2], ['idol', 2], ['torcher', 2]], boss: 'spider', wisps: 1, hp: 1 },
  { name: 'Bell Tower', icon: '🔔', foes: [['hound', 2], ['bearer', 3], ['brute', 2], ['idol', 2], ['torcher', 2], ['wraith', 3]], boss: 'eclipse', wisps: 2, hp: 1 },
];
