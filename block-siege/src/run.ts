/** Run state: map, rewards, shop, events, save and meta progress. No DOM. */
import { ACTS, RELICS, RELIC_IDS, SHAPES, SHAPE_IDS, SPECIALS, SPECIAL_IDS, type Card } from './data';
import type { FightKind } from './fight';
import { Rng, hash } from './rng';

export type Room = 'fight' | 'elite' | 'shop' | 'rest' | 'treasure' | 'event' | 'boss';

export const ROOM_INFO: Record<Room, { icon: string; name: string; text: string }> = {
  fight: { icon: '⚔️', name: 'Fight', text: 'One enemy above your well.' },
  elite: { icon: '💀', name: 'Elite', text: 'A tough enemy. Drops a relic.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Buy pieces, relics and healing. Remove pieces.' },
  rest: { icon: '🔥', name: 'Campfire', text: 'Heal or upgrade a special block.' },
  treasure: { icon: '🎁', name: 'Treasure', text: 'A free relic.' },
  event: { icon: '❓', name: 'Event', text: 'Something strange.' },
  boss: { icon: '👑', name: 'Boss', text: 'The guardian of this act.' },
};

/** The room choices at each step of an act. */
export const PLAN: Room[][] = [
  ['fight'],
  ['fight', 'event'],
  ['elite', 'shop', 'fight'],
  ['fight', 'treasure', 'event'],
  ['rest', 'shop'],
  ['fight', 'elite'],
  ['rest', 'treasure'],
  ['boss'],
];

export interface Hero {
  hp: number;
  maxHp: number;
  gold: number;
  /** Damage per attack unit. */
  power: number;
  relics: string[];
  deck: Card[];
}

export interface RunState {
  v: 1;
  seed: string;
  hero: Hero;
  act: number;
  step: number;
  kills: number;
  lines: number;
  best: number;
  shapePool: string[];
  specialPool: string[];
  relicPool: string[];
}

export interface Settings {
  das: number;
  arr: number;
}

export interface Meta {
  shards: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestAct: number;
  best: number;
  lines: number;
  muted?: boolean;
  settings: Settings;
}

const RUN_KEY = 'blocksiege.run';
const META_KEY = 'blocksiege.meta';

export const START_HP = 60;

export function newRun(seed: string, meta: Meta): RunState {
  const own = (id: string, unlock: number): boolean => unlock === 0 || meta.unlocked.includes(id);
  return {
    v: 1,
    seed,
    hero: {
      hp: START_HP,
      maxHp: START_HP,
      gold: 0,
      power: 2,
      relics: [],
      deck: [{ s: 'I', x: 'fire', l: 1 }, { s: 'O' }, { s: 'T' }, { s: 'S' }, { s: 'Z' }, { s: 'J' }, { s: 'L', x: 'ice', l: 1 }],
    },
    act: 0,
    step: 0,
    kills: 0,
    lines: 0,
    best: 0,
    shapePool: SHAPE_IDS.filter((id) => SHAPES[id].pool && own(id, SHAPES[id].unlock)),
    specialPool: SPECIAL_IDS.filter((id) => own(id, SPECIALS[id].unlock)),
    relicPool: RELIC_IDS.filter((id) => own(id, RELICS[id].unlock)),
  };
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export const fightSeed = (run: RunState, room: Room): number => hash(run.seed, 'fight', run.act, run.step, room);

export const roomKind = (room: Room): FightKind => (room === 'elite' ? 'elite' : room === 'boss' ? 'boss' : 'fight');

export function pickEnemy(run: RunState, room: Room): string {
  const act = ACTS[run.act];
  if (room === 'boss') return act.boss;
  if (room === 'elite') return act.elite;
  return rngFor(run, 'enemy', run.act, run.step).pick(act.enemies);
}

/** Moves to the next step. Returns true when the run is won. */
export function advance(run: RunState): boolean {
  run.step++;
  if (run.step >= PLAN.length) {
    run.act++;
    run.step = 0;
    return run.act >= ACTS.length;
  }
  return false;
}

// ---------- Cards ----------

export function cardName(c: Card): string {
  const sh = SHAPES[c.s];
  const sp = c.x ? ` ${SPECIALS[c.x].icon}${(c.l ?? 1) > 1 ? '+' : ''}` : '';
  return `${sh.name}${sp}`;
}

export function cardText(c: Card): string {
  const sh = SHAPES[c.s];
  return c.x ? `${sh.text} ${SPECIALS[c.x].name}: ${SPECIALS[c.x].text[(c.l ?? 1) - 1]}` : sh.text;
}

export const plainCards = (h: Hero): number[] => h.deck.map((c, i) => (!c.x ? i : -1)).filter((i) => i >= 0);
export const upgradable = (h: Hero): number[] => h.deck.map((c, i) => (c.x && (c.l ?? 1) < 2 ? i : -1)).filter((i) => i >= 0);

function randomCard(run: RunState, rng: Rng, specialChance: number): Card {
  // Standard shapes are more common than odd ones.
  const s = rng.weighted(run.shapePool.map((id) => [id, ['I', 'O', 'T', 'S', 'Z', 'J', 'L'].includes(id) ? 3 : 2] as const));
  return rng.chance(specialChance) ? { s, x: rng.pick(run.specialPool), l: 1 } : { s };
}

// ---------- Rewards ----------

export type Pick =
  | { kind: 'card'; card: Card }
  | { kind: 'imbue'; index: number; x: string }
  | { kind: 'upgrade'; index: number }
  | { kind: 'maxhp'; n: number }
  | { kind: 'power'; n: number };

export interface Rewards {
  gold: number;
  picks: Pick[];
  relic: string | null;
  relicChoice: string[];
}

export function randomRelics(run: RunState, rng: Rng, n: number): string[] {
  return rng.shuffle(run.relicPool.filter((id) => !run.hero.relics.includes(id))).slice(0, n);
}

export function fightRewards(run: RunState, kind: FightKind, extraGold: number): Rewards {
  const rng = rngFor(run, 'reward', run.act, run.step);
  const h = run.hero;
  let gold = kind === 'boss' ? rng.int(45, 55) : kind === 'elite' ? rng.int(25, 32) : rng.int(12, 18) + run.act * 3;
  if (h.relics.includes('piggy')) gold = Math.round(gold * 1.3);
  gold += extraGold;
  const picks: Pick[] = [{ kind: 'card', card: randomCard(run, rng, 0.5) }];
  const plain = plainCards(h);
  if (plain.length && rng.chance(0.6)) picks.push({ kind: 'imbue', index: rng.pick(plain), x: rng.pick(run.specialPool) });
  else picks.push({ kind: 'card', card: randomCard(run, rng, 0.8) });
  const up = upgradable(h);
  if (up.length && rng.chance(0.6)) picks.push({ kind: 'upgrade', index: rng.pick(up) });
  else if (kind !== 'fight' || rng.chance(0.4)) picks.push({ kind: 'power', n: 0.25 });
  else picks.push({ kind: 'maxhp', n: 6 });
  return {
    gold,
    picks,
    relic: kind === 'elite' ? (randomRelics(run, rng, 1)[0] ?? null) : null,
    relicChoice: kind === 'boss' ? randomRelics(run, rng, 3) : [],
  };
}

export function pickText(h: Hero, p: Pick): { icon: string; title: string; text: string } {
  switch (p.kind) {
    case 'card':
      return { icon: p.card.x ? SPECIALS[p.card.x].icon : '🧩', title: `Add ${cardName(p.card)}`, text: cardText(p.card) };
    case 'imbue':
      return { icon: SPECIALS[p.x].icon, title: `${SPECIALS[p.x].name} on ${cardName(h.deck[p.index])}`, text: SPECIALS[p.x].text[0] };
    case 'upgrade': {
      const c = h.deck[p.index];
      return { icon: '⬆️', title: `Upgrade ${cardName(c)}`, text: SPECIALS[c.x!].text[1] };
    }
    case 'maxhp':
      return { icon: '💗', title: `+${p.n} max HP`, text: 'Also heals the same amount.' };
    case 'power':
      return { icon: '💥', title: `+${Math.round(p.n * 50)}% damage`, text: `Damage per attack unit ${h.power} → ${h.power + p.n}.` };
  }
}

export function addRelic(h: Hero, id: string): void {
  if (h.relics.includes(id)) return;
  h.relics.push(id);
}

export function applyPick(h: Hero, p: Pick): void {
  switch (p.kind) {
    case 'card':
      h.deck.push({ ...p.card });
      break;
    case 'imbue':
      h.deck[p.index] = { ...h.deck[p.index], x: p.x, l: 1 };
      break;
    case 'upgrade':
      h.deck[p.index] = { ...h.deck[p.index], l: 2 };
      break;
    case 'maxhp':
      h.maxHp += p.n;
      h.hp += p.n;
      break;
    case 'power':
      h.power += p.n;
      break;
  }
}

// ---------- Shop ----------

export type ShopItem =
  | { kind: 'card'; card: Card; cost: number; sold: boolean }
  | { kind: 'relic'; id: string; cost: number; sold: boolean }
  | { kind: 'heal'; n: number; cost: number; sold: boolean }
  | { kind: 'remove'; cost: number; sold: boolean }
  | { kind: 'imbue'; x: string; cost: number; sold: boolean }
  | { kind: 'upgrade'; cost: number; sold: boolean };

export function makeShop(run: RunState): ShopItem[] {
  const rng = rngFor(run, 'shop', run.act, run.step);
  const items: ShopItem[] = [];
  for (let i = 0; i < 3; i++) {
    const card = randomCard(run, rng, 0.6);
    items.push({ kind: 'card', card, cost: (card.x ? 40 : 25) + run.act * 6 + rng.int(0, 8), sold: false });
  }
  for (const id of randomRelics(run, rng, 2)) items.push({ kind: 'relic', id, cost: 85 + rng.int(0, 25), sold: false });
  items.push({ kind: 'imbue', x: rng.pick(run.specialPool), cost: 45, sold: false });
  items.push({ kind: 'heal', n: 18, cost: 25, sold: false });
  items.push({ kind: 'upgrade', cost: 50, sold: false });
  items.push({ kind: 'remove', cost: 35, sold: false });
  return items;
}

// ---------- Events ----------

export interface EventDef {
  id: string;
  icon: string;
  title: string;
  text: string;
  options: { label: string; can?: (run: RunState) => boolean; run: (run: RunState, rng: Rng) => string }[];
}

export const EVENTS: EventDef[] = [
  {
    id: 'mason',
    icon: '🧱',
    title: "Mason's Cart",
    text: 'A mason sells odd stones from his cart.',
    options: [
      {
        label: 'Buy a random piece (20 gold)',
        can: (r) => r.hero.gold >= 20,
        run: (r, rng) => {
          r.hero.gold -= 20;
          const c = randomCard(r, rng, 0.7);
          r.hero.deck.push(c);
          return `You get ${cardName(c)}.`;
        },
      },
      { label: 'Walk on', run: () => 'You walk on.' },
    ],
  },
  {
    id: 'forge',
    icon: '⚒️',
    title: 'Cursed Forge',
    text: 'The forge burns with a cold blue flame. It can bind power into stone.',
    options: [
      {
        label: 'Put a special block on a random piece (lose 6 HP)',
        can: (r) => plainCards(r.hero).length > 0 && r.hero.hp > 6,
        run: (r, rng) => {
          r.hero.hp -= 6;
          const i = rng.pick(plainCards(r.hero));
          const x = rng.pick(r.specialPool);
          r.hero.deck[i] = { ...r.hero.deck[i], x, l: 1 };
          return `${cardName(r.hero.deck[i])} glows.`;
        },
      },
      { label: 'Leave', run: () => 'You leave the forge.' },
    ],
  },
  {
    id: 'spring',
    icon: '⛲',
    title: 'Healing Spring',
    text: 'Clear water bubbles up between the stones.',
    options: [
      {
        label: 'Drink (heal 15)',
        run: (r) => {
          r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + 15);
          return 'You heal 15 HP.';
        },
      },
      {
        label: 'Bathe (+4 max HP)',
        run: (r) => {
          r.hero.maxHp += 4;
          r.hero.hp += 4;
          return 'You feel tougher. +4 max HP.';
        },
      },
    ],
  },
  {
    id: 'gambler',
    icon: '🎲',
    title: 'Gambler',
    text: 'A grinning gambler shakes a cup of dice.',
    options: [
      {
        label: 'Bet 25 gold (50%: a relic)',
        can: (r) => r.hero.gold >= 25,
        run: (r, rng) => {
          r.hero.gold -= 25;
          if (!rng.chance(0.5)) return 'Snake eyes. You lose the bet.';
          const id = randomRelics(r, rng, 1)[0];
          if (!id) return 'You win, but he has nothing left to give.';
          addRelic(r.hero, id);
          return `You win ${RELICS[id].icon} ${RELICS[id].name}.`;
        },
      },
      { label: 'Decline', run: () => 'You keep your coins.' },
    ],
  },
  {
    id: 'rubble',
    icon: '⛏️',
    title: 'Rubble Pile',
    text: 'A pile of broken bricks. Something shines inside.',
    options: [
      {
        label: 'Dig for gold (+22 gold)',
        run: (r) => {
          r.hero.gold += 22;
          return 'You find 22 gold.';
        },
      },
      {
        label: 'Throw away an S or Z piece',
        can: (r) => r.hero.deck.some((c) => c.s === 'S' || c.s === 'Z') && r.hero.deck.length > 5,
        run: (r, rng) => {
          const idx = r.hero.deck.map((c, i) => (c.s === 'S' || c.s === 'Z' ? i : -1)).filter((i) => i >= 0);
          const i = rng.pick(idx);
          const name = cardName(r.hero.deck[i]);
          r.hero.deck.splice(i, 1);
          return `You throw ${name} on the pile.`;
        },
      },
    ],
  },
  {
    id: 'mage',
    icon: '🧝',
    title: 'Old Mage',
    text: 'An old mage offers to strengthen your magic stones, for a price in blood.',
    options: [
      {
        label: 'Upgrade a random special block (lose 8 HP)',
        can: (r) => upgradable(r.hero).length > 0 && r.hero.hp > 8,
        run: (r, rng) => {
          r.hero.hp -= 8;
          const i = rng.pick(upgradable(r.hero));
          r.hero.deck[i] = { ...r.hero.deck[i], l: 2 };
          return `${cardName(r.hero.deck[i])} is stronger now.`;
        },
      },
      {
        label: 'Learn a trick (+25% damage, lose 10 HP)',
        can: (r) => r.hero.hp > 10,
        run: (r) => {
          r.hero.hp -= 10;
          r.hero.power += 0.25;
          return 'Your strikes hit harder.';
        },
      },
      { label: 'Leave', run: () => 'You leave the mage.' },
    ],
  },
];

export const pickEvent = (run: RunState): EventDef => rngFor(run, 'event', run.act, run.step).pick(EVENTS);

// ---------- Score and meta ----------

export const score = (run: RunState, victory: boolean): number =>
  run.act * 300 + run.step * 30 + run.kills * 10 + run.lines * 2 + run.hero.gold + (victory ? 1500 : 0);

export const shardsFor = (sc: number): number => Math.floor(sc / 70);

export const LOCKED = [
  ...SHAPE_IDS.filter((id) => SHAPES[id].unlock > 0),
  ...SPECIAL_IDS.filter((id) => SPECIALS[id].unlock > 0),
  ...RELIC_IDS.filter((id) => RELICS[id].unlock > 0),
];

export const unlockCost = (id: string): number => SHAPES[id]?.unlock ?? SPECIALS[id]?.unlock ?? RELICS[id]?.unlock ?? 0;

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || run.hero.deck.some((c) => !SHAPES[c.s] || (c.x && !SPECIALS[c.x])) || run.hero.relics.some((r) => !RELICS[r])) return null;
    return run;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export const DEFAULT_SETTINGS: Settings = { das: 160, arr: 40 };

export function loadMeta(): Meta {
  const base: Meta = { shards: 0, unlocked: [], runs: 0, wins: 0, bestAct: 0, best: 0, lines: 0, settings: { ...DEFAULT_SETTINGS } };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    m.settings = { ...DEFAULT_SETTINGS, ...m.settings };
    return m;
  } catch {
    return base;
  }
}

export function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}
