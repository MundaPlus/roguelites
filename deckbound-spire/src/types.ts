export type StatusId =
  | 'strength'
  | 'dexterity'
  | 'weak'
  | 'vulnerable'
  | 'frail'
  | 'poison'
  | 'thorns'
  | 'metallicize'
  | 'ritual'
  | 'artifact'
  | 'demonForm'
  | 'fumes'
  | 'barricade'
  | 'flex'
  | 'enrage';

export type Statuses = Partial<Record<StatusId, number>>;

export interface Fighter {
  hp: number;
  maxHp: number;
  block: number;
  status: Statuses;
}

export type CardType = 'attack' | 'skill' | 'power' | 'status' | 'curse';
export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare' | 'special';
/** enemy: pick one enemy. all: every enemy. none: no pick (random or global effects). */
export type Target = 'enemy' | 'all' | 'self' | 'none';

/**
 * One effect step. Cards, potions, relics and enemy moves all use the same ops.
 * "target" is the chosen enemy for a player card, and the player for an enemy move.
 */
export type Op =
  | { op: 'dmg'; n: number; times?: number; x?: boolean; all?: boolean; random?: boolean; strMul?: number; lifesteal?: boolean; raw?: boolean }
  | { op: 'dmgBlock' }
  | { op: 'block'; n: number; raw?: boolean }
  | { op: 'draw'; n: number }
  | { op: 'energy'; n: number }
  | { op: 'status'; s: StatusId; n: number; to: 'target' | 'self' | 'all' | 'random' }
  | { op: 'mulStatus'; s: StatusId; mul: number; to: 'target' | 'self' }
  | { op: 'heal'; n: number }
  | { op: 'healPct'; n: number }
  | { op: 'loseHp'; n: number }
  | { op: 'hurtSelf'; n: number }
  | { op: 'addCard'; id: string; n: number; to: 'hand' | 'draw' | 'discard' }
  | { op: 'doubleBlock' }
  | { op: 'allyBlock'; n: number }
  | { op: 'healAllies'; n: number }
  | { op: 'statusAllies'; s: StatusId; n: number }
  | { op: 'cleanse' }
  | { op: 'suicide' };

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  /** -1 is X (spend all energy), -2 is unplayable. */
  cost: number;
  target: Target;
  icon: string;
  /** {D} becomes the live damage value and {B} the live block value. */
  desc: string;
  ops: Op[];
  exhaust?: boolean;
  ethereal?: boolean;
  innate?: boolean;
  /** Ops that run when the card is still in hand at the end of the turn. */
  endTurn?: Op[];
  up?: Partial<Pick<CardDef, 'cost' | 'desc' | 'ops' | 'exhaust' | 'ethereal' | 'innate'>>;
}

export interface CardInst {
  uid: number;
  id: string;
  up: boolean;
}

export type Intent =
  | 'attack'
  | 'defend'
  | 'buff'
  | 'debuff'
  | 'attackDefend'
  | 'attackDebuff'
  | 'attackBuff'
  | 'defendBuff'
  | 'defendDebuff'
  | 'unknown'
  | 'special';

export type RoomType = 'monster' | 'elite' | 'event' | 'shop' | 'rest' | 'treasure' | 'boss';
