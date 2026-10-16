/** Run state: the chapter map, rewards, shop, events, score and save data. */
import { BOOKS, BOOK_IDS, CHAPTERS, GEMS, GEM_IDS, POTIONS, POTION_IDS, type GemId, type PotionId } from './data';
import { newFight, type Fight, type FightKind, type Hero } from './fight';
import { Rng, hash } from './rng';

export type Room = 'fight' | 'elite' | 'shop' | 'rest' | 'event' | 'boss';

export const ROOM_INFO: Record<Room, { icon: string; name: string; text: string }> = {
  fight: { icon: '⚔️', name: 'Fight', text: 'A monster or a small group.' },
  elite: { icon: '💀', name: 'Elite', text: 'A tough foe. Drops a book.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Buy gems, books and potions.' },
  rest: { icon: '🕯️', name: 'Reading Room', text: 'Heal, or study for max HP.' },
  event: { icon: '❓', name: 'Event', text: 'Something strange.' },
  boss: { icon: '👑', name: 'Boss', text: 'The guardian of this chapter.' },
};

/** The room choices at each step of a chapter. */
export const PLAN: Room[][] = [
  ['fight'],
  ['fight', 'event'],
  ['fight', 'shop'],
  ['elite', 'rest'],
  ['fight', 'event'],
  ['fight', 'elite'],
  ['shop', 'rest'],
  ['boss'],
];

export type Pick = { kind: 'gem'; id: GemId } | { kind: 'book'; id: string } | { kind: 'potion'; id: PotionId } | { kind: 'maxhp'; n: number };

export interface Rewards {
  gold: number;
  picks: Pick[];
  /** A book that the elite drops. */
  book: string | null;
  /** Bosses offer a choice of books. */
  bookChoice: string[];
  picked: boolean;
  bookPicked: boolean;
  heal: number;
}

export type ShopItem = { pick: Pick; cost: number; sold: boolean } | { heal: number; cost: number; sold: boolean };

export interface RunState {
  v: 1;
  seed: string;
  hero: Hero;
  chapter: number;
  step: number;
  /** Where the player is. The app resumes here. */
  at: 'map' | 'fight' | 'reward' | 'shop' | 'rest' | 'event';
  fight: Fight | null;
  room: Room | null;
  rewards: Rewards | null;
  shop: ShopItem[] | null;
  event: { id: string; result: string | null } | null;
  kills: number;
  fights: number;
  words: number;
  longest: string;
  best: number;
  gemPool: GemId[];
  bookPool: string[];
}

export interface Meta {
  ink: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestChapter: number;
  best: number;
  longest: string;
}

const RUN_KEY = 'wordsmith.run';
const META_KEY = 'wordsmith.meta';

export const START_HP = 60;

/** Archive unlocks that are not gems or books. */
export const KITS: Record<string, { name: string; icon: string; text: string; unlock: number }> = {
  kitAmethyst: { name: 'Jeweler Kit', icon: '🟣', text: 'Start each run with an Amethyst gem.', unlock: 35 },
  kitPotion: { name: 'Field Kit', icon: '🧪', text: 'Start each run with a Health Draught.', unlock: 20 },
  kitHp: { name: 'Thick Cover', icon: '❤️', text: 'Start each run with +10 max HP.', unlock: 30 },
};

export const LOCKED = [
  ...GEM_IDS.filter((id) => GEMS[id].unlock > 0),
  ...BOOK_IDS.filter((id) => BOOKS[id].unlock > 0),
  ...Object.keys(KITS),
];

export const unlockCost = (id: string): number => GEMS[id as GemId]?.unlock ?? BOOKS[id]?.unlock ?? KITS[id]?.unlock ?? 0;

export function unlockInfo(id: string): { icon: string; name: string; kind: string; text: string } {
  if (GEMS[id as GemId]) return { ...GEMS[id as GemId], kind: 'Gem' };
  if (BOOKS[id]) return { ...BOOKS[id], kind: 'Book' };
  return { ...KITS[id], kind: 'Start' };
}

export function newRun(seed: string, meta: Meta): RunState {
  const has = (id: string): boolean => meta.unlocked.includes(id);
  const hp = START_HP + (has('kitHp') ? 10 : 0);
  const gems: GemId[] = ['ruby', 'sapphire'];
  if (has('kitAmethyst')) gems.push('amethyst');
  return {
    v: 1,
    seed,
    hero: { hp, maxHp: hp, gold: 0, books: [], gems, potions: has('kitPotion') ? ['heal'] : [], slots: 3 },
    chapter: 0,
    step: 0,
    at: 'map',
    fight: null,
    room: null,
    rewards: null,
    shop: null,
    event: null,
    kills: 0,
    fights: 0,
    words: 0,
    longest: '',
    best: 0,
    gemPool: GEM_IDS.filter((id) => GEMS[id].unlock === 0 || has(id)),
    bookPool: BOOK_IDS.filter((id) => BOOKS[id].unlock === 0 || has(id)),
  };
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export const roomKind = (room: Room): FightKind => (room === 'elite' ? 'elite' : room === 'boss' ? 'boss' : 'fight');

export function startFight(run: RunState, room: Room): Fight {
  const ch = CHAPTERS[run.chapter];
  const rng = rngFor(run, 'group', run.chapter, run.step, room);
  const kind = roomKind(room);
  const ids = kind === 'boss' ? [ch.boss] : kind === 'elite' ? [ch.elite] : rng.pick(ch.groups);
  return newFight(run.hero, run.chapter, kind, ids, hash(run.seed, 'fight', run.chapter, run.step, room));
}

/** Go to the next step. Returns true when the last chapter is done. */
export function advance(run: RunState): boolean {
  run.step++;
  if (run.step >= PLAN.length) {
    run.chapter++;
    run.step = 0;
    return run.chapter >= CHAPTERS.length;
  }
  return false;
}

// ---------- Rewards ----------

export function randomBooks(run: RunState, rng: Rng, n: number): string[] {
  return rng.shuffle(run.bookPool.filter((id) => !run.hero.books.includes(id))).slice(0, n);
}

export function fightRewards(run: RunState, kind: FightKind): Rewards {
  const rng = rngFor(run, 'reward', run.chapter, run.step);
  const h = run.hero;
  let gold = kind === 'boss' ? rng.int(45, 55) : kind === 'elite' ? rng.int(25, 32) : rng.int(10, 15) + run.chapter * 3;
  if (h.books.includes('gilt')) gold = Math.round(gold * 1.5);
  const picks: Pick[] = [{ kind: 'gem', id: rng.pick(run.gemPool) }, { kind: 'potion', id: rng.pick(POTION_IDS) }];
  const book = randomBooks(run, rng, 1)[0];
  if (book && rng.chance(0.35)) picks.push({ kind: 'book', id: book });
  else picks.push({ kind: 'maxhp', n: 6 });
  return {
    gold,
    picks,
    book: kind === 'elite' ? (randomBooks(run, rng, 1)[0] ?? null) : null,
    bookChoice: kind === 'boss' ? randomBooks(run, rng, 3) : [],
    picked: false,
    bookPicked: false,
    heal: kind === 'boss' ? Math.round((h.maxHp - Math.max(0, h.hp)) * 0.5) : 0,
  };
}

export function addBook(h: Hero, id: string): void {
  if (h.books.includes(id)) return;
  h.books.push(id);
  if (id === 'belt') {
    h.slots++;
    if (h.potions.length < h.slots) h.potions.push('heal');
  }
}

/** False when the potion belt is full. */
export function canTake(h: Hero, p: Pick): boolean {
  return p.kind !== 'potion' || h.potions.length < h.slots;
}

export function applyPick(h: Hero, p: Pick): void {
  if (p.kind === 'gem') h.gems.push(p.id);
  else if (p.kind === 'book') addBook(h, p.id);
  else if (p.kind === 'potion') {
    if (h.potions.length < h.slots) h.potions.push(p.id);
  } else {
    h.maxHp += p.n;
    h.hp += p.n;
  }
}

export function pickLabel(p: Pick): { icon: string; name: string; text: string } {
  if (p.kind === 'gem') return { icon: GEMS[p.id].icon, name: `${GEMS[p.id].name} gem`, text: `Adds gem tiles. ${GEMS[p.id].text}` };
  if (p.kind === 'book') return { icon: BOOKS[p.id].icon, name: BOOKS[p.id].name, text: BOOKS[p.id].text };
  if (p.kind === 'potion') return { icon: POTIONS[p.id].icon, name: POTIONS[p.id].name, text: POTIONS[p.id].text };
  return { icon: '❤️', name: `+${p.n} max HP`, text: 'Also heals the same amount.' };
}

// ---------- Shop and rest ----------

export function makeShop(run: RunState): ShopItem[] {
  const rng = rngFor(run, 'shop', run.chapter, run.step);
  const items: ShopItem[] = [];
  for (const id of rng.shuffle([...run.gemPool]).slice(0, 2)) items.push({ pick: { kind: 'gem', id }, cost: 28 + rng.int(0, 8), sold: false });
  for (const id of randomBooks(run, rng, 2)) items.push({ pick: { kind: 'book', id }, cost: 60 + rng.int(0, 20), sold: false });
  for (const id of rng.shuffle([...POTION_IDS]).slice(0, 2)) items.push({ pick: { kind: 'potion', id }, cost: POTIONS[id].cost, sold: false });
  items.push({ heal: 20, cost: 22, sold: false });
  return items;
}

export const restHeal = (h: Hero): number => Math.round(h.maxHp * 0.35);

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
    id: 'well',
    icon: '🪙',
    title: 'Wishing Well',
    text: 'A well full of letters instead of water. Something shines at the bottom.',
    options: [
      {
        label: 'Toss 15 gold (gain a random gem)',
        can: (r) => r.hero.gold >= 15,
        run: (r, rng) => {
          r.hero.gold -= 15;
          const id = rng.pick(r.gemPool);
          r.hero.gems.push(id);
          return `The well gives you a ${GEMS[id].icon} ${GEMS[id].name}.`;
        },
      },
      { label: 'Walk on', run: () => 'You walk on.' },
    ],
  },
  {
    id: 'librarian',
    icon: '👓',
    title: 'Old Librarian',
    text: 'A librarian offers you a rare book. The late fee is paid in blood.',
    options: [
      {
        label: 'Take the book (lose 10 HP)',
        can: (r) => r.hero.hp > 10,
        run: (r, rng) => {
          r.hero.hp -= 10;
          const id = randomBooks(r, rng, 1)[0];
          if (!id) return 'The shelves are empty.';
          addBook(r.hero, id);
          return `You get ${BOOKS[id].icon} ${BOOKS[id].name}.`;
        },
      },
      { label: 'Say no', run: () => 'The librarian shrugs.' },
    ],
  },
  {
    id: 'fountain',
    icon: '⛲',
    title: 'Ink Fountain',
    text: 'Warm blue ink bubbles from a stone fountain.',
    options: [
      {
        label: 'Drink (heal 14 HP)',
        run: (r) => {
          r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + 14);
          return 'You feel better. +14 HP.';
        },
      },
      {
        label: 'Fill a flask (gain a random potion)',
        can: (r) => r.hero.potions.length < r.hero.slots,
        run: (r, rng) => {
          const id = rng.pick(POTION_IDS);
          r.hero.potions.push(id);
          return `You get ${POTIONS[id].icon} ${POTIONS[id].name}.`;
        },
      },
    ],
  },
  {
    id: 'cutter',
    icon: '⚒️',
    title: 'Gem Cutter',
    text: 'A dwarf with a loupe wants to buy gems.',
    options: [
      {
        label: 'Sell a random gem (gain 35 gold)',
        can: (r) => r.hero.gems.length > 0,
        run: (r, rng) => {
          const i = rng.int(0, r.hero.gems.length - 1);
          const [id] = r.hero.gems.splice(i, 1);
          r.hero.gold += 35;
          return `You sell the ${GEMS[id].name} for 35 gold.`;
        },
      },
      {
        label: 'Polish your gems (pay 20 gold, gain a random gem)',
        can: (r) => r.hero.gold >= 20,
        run: (r, rng) => {
          r.hero.gold -= 20;
          const id = rng.pick(r.gemPool);
          r.hero.gems.push(id);
          return `The dwarf gives you a ${GEMS[id].icon} ${GEMS[id].name}.`;
        },
      },
      { label: 'Leave', run: () => 'You keep your gems.' },
    ],
  },
  {
    id: 'sphinx',
    icon: '🦁',
    title: 'Riddle Sphinx',
    text: 'A sphinx asks a riddle. A right answer pays well. A wrong one hurts.',
    options: [
      {
        label: 'Answer (60%: +40 gold, else lose 8 HP)',
        run: (r, rng) => {
          if (rng.chance(0.6)) {
            r.hero.gold += 40;
            return 'Correct! The sphinx pays 40 gold.';
          }
          r.hero.hp = Math.max(1, r.hero.hp - 8);
          return 'Wrong! The sphinx swats you. -8 HP.';
        },
      },
      { label: 'Walk away', run: () => 'You do not like riddles.' },
    ],
  },
  {
    id: 'satchel',
    icon: '🎒',
    title: 'Lost Satchel',
    text: 'A satchel lies between two shelves.',
    options: [
      {
        label: 'Take the coins (20 gold)',
        run: (r) => {
          r.hero.gold += 20;
          return 'You pocket 20 gold.';
        },
      },
      {
        label: 'Read the notes (+5 max HP)',
        run: (r) => {
          r.hero.maxHp += 5;
          r.hero.hp += 5;
          return 'Good notes. +5 max HP.';
        },
      },
    ],
  },
];

export const eventDef = (id: string): EventDef => EVENTS.find((e) => e.id === id) ?? EVENTS[0];
export const pickEvent = (run: RunState): EventDef => rngFor(run, 'event', run.chapter, run.step).pick(EVENTS);

// ---------- Score and meta ----------

export const score = (run: RunState, victory: boolean): number =>
  run.chapter * 400 + run.step * 30 + run.kills * 15 + run.longest.length * 20 + run.best + run.hero.gold + (victory ? 1500 + Math.max(0, run.hero.hp) * 5 : 0);

export const inkFor = (sc: number): number => Math.floor(sc / 60);

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
    if (run.v !== 1 || run.hero.books.some((b) => !BOOKS[b]) || run.hero.gems.some((g) => !GEMS[g])) return null;
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

export function loadMeta(): Meta {
  const base: Meta = { ink: 0, unlocked: [], runs: 0, wins: 0, bestChapter: 0, best: 0, longest: '' };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
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
