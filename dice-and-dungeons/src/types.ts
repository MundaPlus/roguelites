export type Status = 'poison' | 'burn' | 'freeze' | 'shock' | 'weak';

export const STATUS_LIST: readonly Status[] = ['poison', 'burn', 'freeze', 'shock', 'weak'];

export const STATUS_INFO: Record<Status, { icon: string; name: string; text: string }> = {
  poison: { icon: '☠️', name: 'Poison', text: 'Lose this much HP at the start of the turn, then it goes down by 1.' },
  burn: { icon: '🔥', name: 'Burn', text: 'This many dice start on fire. Using a burning die costs 2 HP.' },
  freeze: { icon: '❄️', name: 'Freeze', text: 'This many of the highest dice become 1 at the next roll.' },
  shock: { icon: '⚡', name: 'Shock', text: 'This many equipment are shocked. A die put into shocked equipment only removes the shock.' },
  weak: { icon: '💔', name: 'Weak', text: 'Damage dealt is halved. Goes down by 1 at the end of each turn.' },
};

/** Slot rule. "count" slots collect dice until the total reaches n, then fire. */
export type Req =
  | { k: 'any' }
  | { k: 'even' }
  | { k: 'odd' }
  | { k: 'max'; n: number }
  | { k: 'min'; n: number }
  | { k: 'exact'; n: number }
  | { k: 'count'; n: number };

export type Rarity = 'start' | 'common' | 'rare' | 'enemy';

export type EquipKind = 'attack' | 'defense' | 'utility';

/** A die in the pool. value 0 means a wild die that the player has not set yet. */
export interface Die {
  uid: number;
  value: number;
  faces: readonly number[];
  burning: boolean;
  wild: boolean;
}

export interface OwnedEquip {
  id: string;
  lvl: number;
  on: boolean;
}

export type RoomType = 'fight' | 'elite' | 'boss' | 'event' | 'shop' | 'rest';

export type ClassId = 'warrior' | 'thief' | 'inventor';

export const D6: readonly number[] = [1, 2, 3, 4, 5, 6];

export function accepts(req: Req, v: number): boolean {
  if (v <= 0) return false;
  switch (req.k) {
    case 'any':
    case 'count':
      return true;
    case 'even':
      return v % 2 === 0;
    case 'odd':
      return v % 2 === 1;
    case 'max':
      return v <= req.n;
    case 'min':
      return v >= req.n;
    case 'exact':
      return v === req.n;
  }
}

export function reqLabel(req: Req): string {
  switch (req.k) {
    case 'any':
      return 'Any';
    case 'even':
      return 'Even';
    case 'odd':
      return 'Odd';
    case 'max':
      return `≤${req.n}`;
    case 'min':
      return `≥${req.n}`;
    case 'exact':
      return `=${req.n}`;
    case 'count':
      return `Σ${req.n}`;
  }
}
