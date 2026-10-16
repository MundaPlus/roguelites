/** Planets, tarots, boss blinds, decks and blind targets. */
import type { HandType } from './cards';

export interface PlanetDef {
  id: string;
  name: string;
  icon: string;
  hand: HandType;
}

export const PLANETS: PlanetDef[] = [
  { id: 'pluto', name: 'Pluto', icon: '🪨', hand: 'High Card' },
  { id: 'mercury', name: 'Mercury', icon: '☿️', hand: 'Pair' },
  { id: 'uranus', name: 'Uranus', icon: '🧊', hand: 'Two Pair' },
  { id: 'venus', name: 'Venus', icon: '♀️', hand: 'Three of a Kind' },
  { id: 'saturn', name: 'Saturn', icon: '🪐', hand: 'Straight' },
  { id: 'jupiter', name: 'Jupiter', icon: '🟠', hand: 'Flush' },
  { id: 'earth', name: 'Earth', icon: '🌍', hand: 'Full House' },
  { id: 'mars', name: 'Mars', icon: '🔴', hand: 'Four of a Kind' },
  { id: 'neptune', name: 'Neptune', icon: '🔱', hand: 'Straight Flush' },
  { id: 'planetx', name: 'Planet X', icon: '🌑', hand: 'Five of a Kind' },
];
export const PLANET: Record<string, PlanetDef> = Object.fromEntries(PLANETS.map((p) => [p.id, p]));

export interface TarotDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  /** Number of hand cards to select. 0 means it works without cards. */
  min: number;
  max: number;
  /** Rare tarots show up less often. */
  rare?: boolean;
}

export const TAROTS: TarotDef[] = [
  { id: 'magician', name: 'The Magician', icon: '🎩', text: 'Turns up to 2 cards into Lucky cards', min: 1, max: 2 },
  { id: 'empress', name: 'The Empress', icon: '👸', text: 'Turns up to 2 cards into Mult cards', min: 1, max: 2 },
  { id: 'hierophant', name: 'The Hierophant', icon: '⛪', text: 'Turns up to 2 cards into Bonus cards', min: 1, max: 2 },
  { id: 'justice', name: 'Justice', icon: '⚖️', text: 'Turns 1 card into a Glass card', min: 1, max: 1 },
  { id: 'chariot', name: 'The Chariot', icon: '🛡️', text: 'Turns 1 card into a Steel card', min: 1, max: 1 },
  { id: 'devil', name: 'The Devil', icon: '😈', text: 'Turns 1 card into a Gold card', min: 1, max: 1 },
  { id: 'star', name: 'The Star', icon: '⭐', text: 'Turns up to 3 cards into ♦', min: 1, max: 3 },
  { id: 'moonc', name: 'The Moon', icon: '🌕', text: 'Turns up to 3 cards into ♣', min: 1, max: 3 },
  { id: 'sun', name: 'The Sun', icon: '☀️', text: 'Turns up to 3 cards into ♥', min: 1, max: 3 },
  { id: 'world', name: 'The World', icon: '🌐', text: 'Turns up to 3 cards into ♠', min: 1, max: 3 },
  { id: 'strength', name: 'Strength', icon: '💪', text: 'Raises the rank of up to 2 cards by 1', min: 1, max: 2 },
  { id: 'hanged', name: 'The Hanged Man', icon: '🪢', text: 'Destroys up to 2 cards', min: 1, max: 2 },
  { id: 'death', name: 'Death', icon: '💀', text: 'Select 2 cards. The left card becomes a copy of the right card.', min: 2, max: 2 },
  { id: 'hermit', name: 'The Hermit', icon: '🏮', text: 'Doubles your money (max +$20)', min: 0, max: 0 },
  { id: 'temperance', name: 'Temperance', icon: '🍷', text: 'Gives the total sell value of your jokers (max $50)', min: 0, max: 0 },
  { id: 'priestess', name: 'The High Priestess', icon: '🔮', text: 'Makes up to 2 random planet cards', min: 0, max: 0 },
  { id: 'emperor', name: 'The Emperor', icon: '🤴', text: 'Makes up to 2 random tarot cards', min: 0, max: 0 },
  { id: 'judgement', name: 'Judgement', icon: '📯', text: 'Makes a random joker (needs a free slot)', min: 0, max: 0 },
  { id: 'wheel', name: 'Wheel of Fortune', icon: '🎡', text: '1 in 3 chance to give a random joker Foil, Holographic or Polychrome', min: 0, max: 0 },
  { id: 'aura', name: 'Aura', icon: '🌈', text: 'Gives 1 card Foil, Holographic or Polychrome', min: 1, max: 1, rare: true },
  { id: 'dejavu', name: 'Deja Vu', icon: '🔁', text: 'Adds a Red seal to 1 card', min: 1, max: 1, rare: true },
  { id: 'talisman', name: 'Talisman', icon: '📿', text: 'Adds a Gold seal to 1 card', min: 1, max: 1, rare: true },
  { id: 'trance', name: 'Trance', icon: '💠', text: 'Adds a Blue seal to 1 card', min: 1, max: 1, rare: true },
  { id: 'medium', name: 'Medium', icon: '🕯️', text: 'Adds a Purple seal to 1 card', min: 1, max: 1, rare: true },
];
export const TAROT: Record<string, TarotDef> = Object.fromEntries(TAROTS.map((t) => [t.id, t]));

export interface BossDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  minAnte: number;
  final?: boolean;
  color: string;
}

export const BOSSES: BossDef[] = [
  { id: 'club', name: 'The Club', icon: '♣️', text: 'All ♣ cards are debuffed', minAnte: 1, color: '#4f9d69' },
  { id: 'goad', name: 'The Goad', icon: '♠️', text: 'All ♠ cards are debuffed', minAnte: 1, color: '#5c6bc0' },
  { id: 'head', name: 'The Head', icon: '♥️', text: 'All ♥ cards are debuffed', minAnte: 1, color: '#c2185b' },
  { id: 'window', name: 'The Window', icon: '♦️', text: 'All ♦ cards are debuffed', minAnte: 1, color: '#ef6c00' },
  { id: 'hook', name: 'The Hook', icon: '🪝', text: 'Discards 2 random held cards after each hand', minAnte: 1, color: '#8d6e63' },
  { id: 'psychic', name: 'The Psychic', icon: '👁️‍🗨️', text: 'You must play 5 cards', minAnte: 1, color: '#d4a017' },
  { id: 'manacle', name: 'The Manacle', icon: '⛓️', text: '−1 hand size', minAnte: 1, color: '#607d8b' },
  { id: 'tooth', name: 'The Tooth', icon: '🦷', text: 'Lose $1 for each card played', minAnte: 1, color: '#b71c1c' },
  { id: 'plant', name: 'The Plant', icon: '🌿', text: 'All face cards are debuffed', minAnte: 2, color: '#558b2f' },
  { id: 'wall', name: 'The Wall', icon: '🧱', text: 'Extra large blind (×2 score)', minAnte: 2, color: '#6d4c41' },
  { id: 'needle', name: 'The Needle', icon: '🪡', text: 'Play only 1 hand (smaller blind)', minAnte: 2, color: '#00838f' },
  { id: 'water', name: 'The Water', icon: '💧', text: 'Start with 0 discards', minAnte: 2, color: '#1565c0' },
  { id: 'flint', name: 'The Flint', icon: '🪨', text: 'Base Chips and Mult are halved', minAnte: 2, color: '#e65100' },
  { id: 'mouth', name: 'The Mouth', icon: '👄', text: 'Only one hand type scores this round', minAnte: 2, color: '#ad1457' },
  { id: 'arm', name: 'The Arm', icon: '💪', text: 'Lowers the level of each played hand type by 1', minAnte: 2, color: '#4527a0' },
  { id: 'eye', name: 'The Eye', icon: '👁️', text: 'Repeated hand types score nothing this round', minAnte: 3, color: '#283593' },
  { id: 'vessel', name: 'Violet Vessel', icon: '🏺', text: 'Very large blind (×1.5 score)', minAnte: 8, final: true, color: '#7b1fa2' },
  { id: 'crimson', name: 'Crimson Heart', icon: '❤️‍🔥', text: 'One random joker is disabled each hand', minAnte: 8, final: true, color: '#d50000' },
];
export const BOSS: Record<string, BossDef> = Object.fromEntries(BOSSES.map((b) => [b.id, b]));

export interface DeckDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  /** Best ante needed to unlock (0 = from the start, 9 = win a run). */
  unlock: number;
}

export const DECKS: DeckDef[] = [
  { id: 'red', name: 'Red Deck', icon: '🟥', text: '+1 discard each round', unlock: 0 },
  { id: 'blue', name: 'Blue Deck', icon: '🟦', text: '+1 hand each round', unlock: 3 },
  { id: 'yellow', name: 'Yellow Deck', icon: '🟨', text: 'Start with $10 more', unlock: 4 },
  { id: 'checkered', name: 'Checkered Deck', icon: '🏁', text: '26 ♠ and 26 ♥, no ♣ or ♦', unlock: 5 },
  { id: 'abandoned', name: 'Abandoned Deck', icon: '🏚️', text: 'No face cards (40 cards)', unlock: 6 },
  { id: 'black', name: 'Black Deck', icon: '⬛', text: '+1 joker slot, −1 hand each round', unlock: 9 },
];
export const DECK: Record<string, DeckDef> = Object.fromEntries(DECKS.map((d) => [d.id, d]));

export const WIN_ANTE = 8;
export const ANTE_BASE = [300, 600, 1100, 2200, 4000, 6500, 10000, 15000];
export const BLIND_NAMES = ['Small Blind', 'Big Blind'] as const;
export const BLIND_MULT = [1, 1.5, 2];
export const BLIND_REWARD = [3, 4, 5];

/** Score needed to beat a blind. */
export function blindTarget(ante: number, blind: number, boss: string | null): number {
  let base: number;
  if (ante <= ANTE_BASE.length) base = ANTE_BASE[ante - 1];
  else base = ANTE_BASE[ANTE_BASE.length - 1] * Math.pow(2.2, ante - ANTE_BASE.length);
  let m = BLIND_MULT[blind];
  if (blind === 2 && boss === 'wall') m *= 2;
  if (blind === 2 && boss === 'vessel') m *= 1.5;
  if (blind === 2 && boss === 'needle') m /= 2;
  const t = base * m;
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(t)) - 1));
  return Math.round(t / mag) * mag;
}
