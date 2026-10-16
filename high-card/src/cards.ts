/** Playing cards, poker hand types and hand evaluation. Pure functions, no DOM. */

export type Suit = 0 | 1 | 2 | 3;
export type Enh = 'bonus' | 'mult' | 'glass' | 'steel' | 'gold' | 'lucky';
export type Seal = 'red' | 'gold' | 'blue' | 'purple';
export type Edition = 'foil' | 'holo' | 'poly';

export interface Card {
  id: number;
  /** 2..14, 14 is the ace. */
  rank: number;
  suit: Suit;
  enh?: Enh;
  seal?: Seal;
  ed?: Edition;
}

export const SUITS = ['♠', '♥', '♣', '♦'] as const;
export const SUIT_NAMES = ['Spades', 'Hearts', 'Clubs', 'Diamonds'] as const;
export const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
export const rankLabel = (r: number): string => RANK_LABEL[r] ?? String(r);
export const isRed = (s: Suit): boolean => s === 1 || s === 3;
export const isFace = (c: Card): boolean => c.rank >= 11 && c.rank <= 13;
/** Chips a card adds when it scores. */
export const rankChips = (r: number): number => (r === 14 ? 11 : r >= 10 ? 10 : r);
export const cardName = (c: Card): string => `${rankLabel(c.rank)}${SUITS[c.suit]}`;

export const ENH_INFO: Record<Enh, { name: string; text: string }> = {
  bonus: { name: 'Bonus', text: '+30 Chips when scored' },
  mult: { name: 'Mult', text: '+4 Mult when scored' },
  glass: { name: 'Glass', text: '×2 Mult when scored. 1 in 4 chance to break.' },
  steel: { name: 'Steel', text: '×1.5 Mult while held in hand' },
  gold: { name: 'Gold', text: '$3 if held in hand at the end of the round' },
  lucky: { name: 'Lucky', text: '1 in 5 chance for +20 Mult. 1 in 15 chance for $20.' },
};
export const SEAL_INFO: Record<Seal, { name: string; text: string }> = {
  red: { name: 'Red seal', text: 'Triggers one more time' },
  gold: { name: 'Gold seal', text: '$3 when scored' },
  blue: { name: 'Blue seal', text: 'Makes a planet of the last hand if held at the end of the round' },
  purple: { name: 'Purple seal', text: 'Makes a tarot when discarded' },
};
export const ED_INFO: Record<Edition, { name: string; text: string }> = {
  foil: { name: 'Foil', text: '+50 Chips' },
  holo: { name: 'Holographic', text: '+10 Mult' },
  poly: { name: 'Polychrome', text: '×1.5 Mult' },
};

export const HAND_TYPES = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
  'Five of a Kind',
] as const;
export type HandType = (typeof HAND_TYPES)[number];

/** Base chips and mult at level 1, and the gain per level. */
export const HAND_BASE: Record<HandType, { chips: number; mult: number; dc: number; dm: number }> = {
  'High Card': { chips: 5, mult: 1, dc: 10, dm: 1 },
  Pair: { chips: 10, mult: 2, dc: 15, dm: 1 },
  'Two Pair': { chips: 20, mult: 2, dc: 20, dm: 1 },
  'Three of a Kind': { chips: 30, mult: 3, dc: 20, dm: 2 },
  Straight: { chips: 30, mult: 4, dc: 30, dm: 3 },
  Flush: { chips: 35, mult: 4, dc: 15, dm: 2 },
  'Full House': { chips: 40, mult: 4, dc: 25, dm: 2 },
  'Four of a Kind': { chips: 60, mult: 7, dc: 30, dm: 3 },
  'Straight Flush': { chips: 100, mult: 8, dc: 40, dm: 4 },
  'Five of a Kind': { chips: 120, mult: 12, dc: 35, dm: 3 },
};

export function handValue(t: HandType, level: number): { chips: number; mult: number } {
  const b = HAND_BASE[t];
  const l = Math.max(1, level) - 1;
  return { chips: b.chips + b.dc * l, mult: b.mult + b.dm * l };
}

export interface EvalOpts {
  fourFingers?: boolean;
  shortcut?: boolean;
}

export interface HandEval {
  type: HandType;
  /** Indexes into the played cards that score, in play order. */
  scoring: number[];
  /** Every hand type that this hand contains (a Full House contains a Pair). */
  contains: Set<HandType>;
}

function straightIdx(cards: Card[], need: number, shortcut: boolean): number[] | null {
  const n = cards.length;
  let best: number[] | null = null;
  for (let mask = 1; mask < 1 << n; mask++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
    if (idx.length < need || (best && idx.length <= best.length)) continue;
    const ranks = idx.map((i) => cards[i].rank);
    if (new Set(ranks).size !== ranks.length) continue;
    for (const aceLow of [false, true]) {
      const rs = ranks.map((r) => (aceLow && r === 14 ? 1 : r)).sort((a, b) => a - b);
      let ok = true;
      for (let k = 1; k < rs.length; k++) {
        const d = rs[k] - rs[k - 1];
        if (d !== 1 && !(shortcut && d === 2)) ok = false;
      }
      if (ok) {
        best = idx;
        break;
      }
    }
  }
  return best;
}

/** Finds the poker hand of the played cards (1 to 5 cards). */
export function evaluate(cards: Card[], o: EvalOpts = {}): HandEval {
  const need = o.fourFingers ? 4 : 5;
  const byRank = new Map<number, number[]>();
  cards.forEach((c, i) => byRank.set(c.rank, [...(byRank.get(c.rank) ?? []), i]));
  const groups = [...byRank.values()].sort((a, b) => b.length - a.length || cards[b[0]].rank - cards[a[0]].rank);
  const bySuit = new Map<number, number[]>();
  cards.forEach((c, i) => bySuit.set(c.suit, [...(bySuit.get(c.suit) ?? []), i]));
  const flushIdx = [...bySuit.values()].find((g) => g.length >= need) ?? null;
  const strIdx = cards.length >= need ? straightIdx(cards, need, !!o.shortcut) : null;
  const g0 = groups[0]?.length ?? 0;
  const g1 = groups[1]?.length ?? 0;

  const contains = new Set<HandType>(['High Card']);
  if (g0 >= 2) contains.add('Pair');
  if (g0 >= 2 && g1 >= 2) contains.add('Two Pair');
  if (g0 >= 3) contains.add('Three of a Kind');
  if (strIdx) contains.add('Straight');
  if (flushIdx) contains.add('Flush');
  if (g0 >= 3 && g1 >= 2) contains.add('Full House');
  if (g0 >= 4) contains.add('Four of a Kind');
  if (strIdx && flushIdx) contains.add('Straight Flush');
  if (g0 >= 5) contains.add('Five of a Kind');

  const sorted = (a: number[]): number[] => [...new Set(a)].sort((x, y) => x - y);
  let type: HandType;
  let scoring: number[];
  if (g0 >= 5) [type, scoring] = ['Five of a Kind', groups[0]];
  else if (strIdx && flushIdx) [type, scoring] = ['Straight Flush', [...strIdx, ...flushIdx]];
  else if (g0 >= 4) [type, scoring] = ['Four of a Kind', groups[0]];
  else if (g0 >= 3 && g1 >= 2) [type, scoring] = ['Full House', [...groups[0], ...groups[1]]];
  else if (flushIdx) [type, scoring] = ['Flush', flushIdx];
  else if (strIdx) [type, scoring] = ['Straight', strIdx];
  else if (g0 >= 3) [type, scoring] = ['Three of a Kind', groups[0]];
  else if (g0 >= 2 && g1 >= 2) [type, scoring] = ['Two Pair', [...groups[0], ...groups[1]]];
  else if (g0 >= 2) [type, scoring] = ['Pair', groups[0]];
  else {
    type = 'High Card';
    let hi = 0;
    cards.forEach((c, i) => {
      if (c.rank > cards[hi].rank) hi = i;
    });
    scoring = cards.length ? [hi] : [];
  }
  return { type, scoring: sorted(scoring), contains };
}

/** A standard 52-card deck. `filter` removes cards (for special decks). */
export function standardDeck(startId: number, filter?: (c: Card) => boolean): Card[] {
  const out: Card[] = [];
  let id = startId;
  for (const suit of [0, 1, 2, 3] as Suit[]) {
    for (let rank = 2; rank <= 14; rank++) {
      const c: Card = { id: id++, rank, suit };
      if (!filter || filter(c)) out.push(c);
    }
  }
  return out;
}

export function sortHand(cards: Card[], by: 'rank' | 'suit'): Card[] {
  return [...cards].sort((a, b) => (by === 'rank' ? b.rank - a.rank || a.suit - b.suit : a.suit - b.suit || b.rank - a.rank));
}
