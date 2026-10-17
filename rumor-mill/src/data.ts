/** Static game data: traits, word tiles, agents, towns, names. */

export type Trait = 'plain' | 'gossip' | 'skeptic' | 'loyalist' | 'muddler' | 'guard';

export interface TraitDef {
  icon: string;
  name: string;
  rule: string;
}

export const TRAITS: Record<Trait, TraitDef> = {
  plain: { icon: '', name: 'Townsfolk', rule: 'Passes the rumor on as heard.' },
  gossip: { icon: '🗣️', name: 'Gossip', rule: 'Makes it bigger: sets the tone word to “surely” ❗. A big rumor counts as 2 sources, so a gossip believes at once.' },
  skeptic: { icon: '🧐', name: 'Skeptic', rule: 'Removes one word: the tone word first, else the object, else the verb (then the rumor dies here).' },
  loyalist: { icon: '🛡️', name: 'Loyalist', rule: 'Turns the claim around: adds or removes “did NOT”.' },
  muddler: { icon: '🌀', name: 'Muddler', rule: 'Swaps the object for the next one on the ring 🌾→🪙→🐴→🪣→🌾.' },
  guard: { icon: '💂', name: 'Guard', rule: 'Passes it on unchanged. Then traces it back to your agent, 1 step per turn. If the trace arrives, the agent is exposed and you lose 1 cover ❤️.' },
};

export const TRAIT_IDS: Trait[] = ['plain', 'gossip', 'skeptic', 'loyalist', 'muddler', 'guard'];

export type Slot = 'verb' | 'obj' | 'mod';

export interface WordDef {
  id: string;
  slot: Slot;
  icon: string;
  /** Text in the sentence. Verbs use the past form. */
  text: string;
  /** Base form for "did NOT <base>". Verbs only. */
  base?: string;
  /** Short perk name and rule. Plain words have none. */
  perk?: string;
  rule?: string;
}

export const WORDS: Record<string, WordDef> = {
  stole: { id: 'stole', slot: 'verb', icon: '🫳', text: 'stole', base: 'steal' },
  hid: { id: 'hid', slot: 'verb', icon: '🙈', text: 'hid', base: 'hide' },
  burned: { id: 'burned', slot: 'verb', icon: '🔥', text: 'burned', base: 'burn', perk: 'Wildfire', rule: 'Crosses weak links even when it is not big. Guards trace it 2 steps per turn.' },
  forged: { id: 'forged', slot: 'verb', icon: '✒️', text: 'forged', base: 'forge', perk: 'Sly', rule: 'Guards trace it only 1 step every 2 turns.' },
  bribed: { id: 'bribed', slot: 'verb', icon: '🤝', text: 'bribed', base: 'bribe', perk: 'Shocking', rule: 'Loyalists do not turn it around.' },
  grain: { id: 'grain', slot: 'obj', icon: '🌾', text: 'the grain' },
  gold: { id: 'gold', slot: 'obj', icon: '🪙', text: 'the gold' },
  horses: { id: 'horses', slot: 'obj', icon: '🐴', text: 'the horses' },
  well: { id: 'well', slot: 'obj', icon: '🪣', text: 'the well' },
  letters: { id: 'letters', slot: 'obj', icon: '✉️', text: 'the letters', perk: 'Sealed', rule: 'Skeptics and muddlers cannot change this word.' },
  surely: { id: 'surely', slot: 'mod', icon: '❗', text: 'surely', perk: 'Big', rule: 'Counts as 2 sources, so one teller is enough. Crosses weak links.' },
  whisper: { id: 'whisper', slot: 'mod', icon: '🤫', text: 'they whisper', perk: 'Quiet', rule: 'Guards do not trace it.' },
};

/** Muddlers move the object one step along this ring. */
export const OBJ_RING = ['grain', 'gold', 'horses', 'well'];

export const START_WORDS = ['stole', 'hid', 'grain', 'gold'];

export type AgentId = 'informant' | 'bard' | 'ghost';

export const AGENTS: Record<AgentId, { icon: string; name: string; rule: string }> = {
  informant: { icon: '🕵️', name: 'Informant', rule: 'Plants the rumor as you wrote it.' },
  bard: { icon: '🎻', name: 'Bard', rule: 'Plants it big: adds “surely” ❗ when the rumor has no tone word.' },
  ghost: { icon: '👤', name: 'Ghost', rule: 'Guard traces that reach a ghost fail. It is never exposed.' },
};

export const START_AGENTS: AgentId[] = ['informant', 'informant', 'informant'];

export interface TownDef {
  name: string;
  target: string;
  icon: string;
  n: number;
  guards: number;
  gossip: number;
  skeptic: number;
  loyalist: number;
  muddler: number;
  /** Rival whispers the counter-rumor every `rival` turns. 0 = no rival. */
  rival: number;
  turns: number;
  goal: number;
}

export const TOWNS: TownDef[] = [
  { name: 'Millbrook', target: 'the mayor', icon: '🎩', n: 26, guards: 1, gossip: 4, skeptic: 3, loyalist: 2, muddler: 0, rival: 0, turns: 7, goal: 0.45 },
  { name: 'Ashford', target: 'the priest', icon: '📿', n: 30, guards: 2, gossip: 4, skeptic: 4, loyalist: 3, muddler: 2, rival: 0, turns: 7, goal: 0.52 },
  { name: 'Saltmarsh', target: 'the captain', icon: '⚓', n: 34, guards: 2, gossip: 5, skeptic: 5, loyalist: 3, muddler: 3, rival: 3, turns: 8, goal: 0.58 },
  { name: 'Ironvale', target: 'the banker', icon: '💼', n: 38, guards: 3, gossip: 5, skeptic: 6, loyalist: 4, muddler: 3, rival: 3, turns: 8, goal: 0.62 },
  { name: "Duke's Seat", target: 'the duke', icon: '👑', n: 42, guards: 4, gossip: 6, skeptic: 7, loyalist: 5, muddler: 4, rival: 2, turns: 9, goal: 0.68 },
];

export const NAMES = [
  'Ada', 'Bram', 'Cora', 'Dell', 'Edda', 'Finn', 'Gus', 'Hild', 'Ivo', 'Jory', 'Kit', 'Lena', 'Milo', 'Nell', 'Odo',
  'Pia', 'Quin', 'Rolf', 'Sela', 'Tam', 'Ulla', 'Vik', 'Wren', 'Yara', 'Zed', 'Abe', 'Bea', 'Cal', 'Dot', 'Elm',
  'Fay', 'Gil', 'Hob', 'Ines', 'Jun', 'Kay', 'Lars', 'Mae', 'Ned', 'Ora', 'Pip', 'Rue', 'Sid', 'Tess', 'Una',
  'Vera', 'Will', 'Xan', 'Yves', 'Zoe', 'Alba', 'Benn', 'Cleo', 'Dax', 'Esme', 'Ford', 'Gwen', 'Hal', 'Iris', 'Jem',
];

/** Meta unlocks: total towns won over all runs → item enters the reward pool. */
export const UNLOCKS: { id: string; kind: 'word' | 'agent'; need: number }[] = [
  { id: 'bard', kind: 'agent', need: 2 },
  { id: 'whisper', kind: 'word', need: 4 },
  { id: 'ghost', kind: 'agent', need: 7 },
  { id: 'bribed', kind: 'word', need: 10 },
];

/** Base reward pool, always open. */
export const BASE_POOL: { id: string; kind: 'word' | 'agent' }[] = [
  { id: 'surely', kind: 'word' },
  { id: 'burned', kind: 'word' },
  { id: 'forged', kind: 'word' },
  { id: 'letters', kind: 'word' },
  { id: 'informant', kind: 'agent' },
];
