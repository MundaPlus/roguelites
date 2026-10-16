/** Run state: map, rewards, shop, events, score and save data. */
import { ACTS, HEROES, HERO_IDS, MAX_POTIONS, POTIONS, POTION_IDS, RELICS, RELIC_IDS, SPELLS } from './data';
import { cardsLeft, lossDamage, newFight, type Fight, type HeroIn, type SpellInst } from './game';
import { Rng, hash } from './rng';

export type Room = 'fight' | 'elite' | 'shop' | 'rest' | 'treasure' | 'event' | 'boss';

export const ROOM_INFO: Record<Room, { icon: string; name: string; text: string }> = {
  fight: { icon: '⚔️', name: 'Fight', text: 'An enemy tableau. Win a spell or an item.' },
  elite: { icon: '💀', name: 'Elite', text: 'A big tableau. Drops a relic.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Spells, relics, potions and healing.' },
  rest: { icon: '🔥', name: 'Campfire', text: 'Heal, or upgrade a spell.' },
  treasure: { icon: '🎁', name: 'Treasure', text: 'A free relic.' },
  event: { icon: '❓', name: 'Event', text: 'A stranger with an offer.' },
  boss: { icon: '👑', name: 'Boss', text: 'The guardian of this act.' },
};

/** The room choices at each step of an act. */
export const PLAN: Room[][] = [
  ['fight'],
  ['fight', 'event'],
  ['fight', 'shop'],
  ['elite', 'rest'],
  ['fight', 'treasure', 'event'],
  ['rest', 'shop'],
  ['boss'],
];

export interface Hero {
  hp: number;
  maxHp: number;
  deck: number;
  gold: number;
  spells: SpellInst[];
  relics: string[];
  potions: string[];
}

export interface RunState {
  v: 1;
  seed: string;
  heroId: string;
  hero: Hero;
  act: number;
  step: number;
  wins: number;
  losses: number;
  /** Times the current boss was retried. Changes the deal. */
  tries: number;
  room: Room | null;
  fight: Fight | null;
  /** The result screen after a fight, saved so a reload cannot replay the fight. */
  after: AfterFight | null;
}

export interface AfterFight {
  out: FightOutcome;
  rewards: Rewards | null;
  picked: boolean;
  relicPicked: boolean;
}

export interface Meta {
  gems: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestAct: number;
  best: number;
}

const RUN_KEY = 'solsiege.run';
const META_KEY = 'solsiege.meta';

export function newRun(seed: string, heroId: string): RunState {
  const d = HEROES[heroId];
  return {
    v: 1,
    seed,
    heroId,
    hero: {
      hp: d.hp,
      maxHp: d.hp,
      deck: d.deck,
      gold: 0,
      spells: d.start.map((id) => ({ id, lvl: 1 })),
      relics: d.relic ? [d.relic] : [],
      potions: ['elixir'],
    },
    act: 0,
    step: 0,
    wins: 0,
    losses: 0,
    tries: 0,
    room: null,
    fight: null,
    after: null,
  };
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export const maxSpells = (h: Hero): number => (h.relics.includes('grimoire') ? 7 : 6);

export function enemyFor(run: RunState, room: Room): string {
  const act = ACTS[run.act];
  if (room === 'boss') return act.boss;
  if (room === 'elite') return act.elite;
  return rngFor(run, 'enemy', run.act, run.step).pick(act.fights);
}

export function startFight(run: RunState, room: Room): Fight {
  const h = run.hero;
  const hin: HeroIn = { hp: h.hp, maxHp: h.maxHp, deck: h.deck, spells: h.spells, relics: h.relics, potions: h.potions };
  run.room = room;
  run.fight = newFight(hash(run.seed, 'deal', run.act, run.step, run.tries), enemyFor(run, room), run.act, hin);
  return run.fight;
}

export interface FightOutcome {
  result: 'win' | 'lose' | 'dead';
  gold: number;
  damage: number;
  heal: number;
  left: number;
}

/** Write the fight result back into the hero. */
export function finishFight(run: RunState, f: Fight): FightOutcome {
  const h = run.hero;
  h.hp = Math.max(0, f.hp);
  h.potions = [...f.potions];
  const left = cardsLeft(f);
  run.fight = null;
  if (f.over === 'win') {
    run.wins++;
    const kind = run.room;
    let gold = (kind === 'boss' ? 45 : kind === 'elite' ? 28 : 10 + run.act * 3) + f.gold;
    if (h.relics.includes('tooth')) gold = Math.round(gold * 1.4);
    h.gold += gold;
    let heal = 0;
    if (h.relics.includes('bloodstone')) heal += 3;
    if (kind === 'boss') heal += Math.round(h.maxHp * 0.4);
    heal = Math.min(heal, h.maxHp - h.hp);
    h.hp += heal;
    return { result: 'win', gold, damage: 0, heal, left };
  }
  if (h.hp <= 0) return { result: 'dead', gold: 0, damage: 0, heal: 0, left };
  run.losses++;
  const damage = lossDamage(f);
  h.hp = Math.max(0, h.hp - damage);
  return { result: h.hp <= 0 ? 'dead' : 'lose', gold: 0, damage, heal: 0, left };
}

/** Next step of the map. Returns true when the run is won. */
export function advance(run: RunState): boolean {
  run.room = null;
  run.after = null;
  run.tries = 0;
  run.step++;
  if (run.step >= PLAN.length) {
    run.act++;
    run.step = 0;
    return run.act >= ACTS.length;
  }
  return false;
}

// ---------- Rewards ----------

export type Pick =
  | { kind: 'spell'; id: string }
  | { kind: 'upgrade'; index: number }
  | { kind: 'relic'; id: string }
  | { kind: 'potion'; id: string }
  | { kind: 'deck'; n: number }
  | { kind: 'maxhp'; n: number };

export interface Rewards {
  picks: Pick[];
  relic: string | null;
  relicChoice: string[];
}

export const learnable = (run: RunState): string[] =>
  HEROES[run.heroId].book.filter((id) => !run.hero.spells.some((s) => s.id === id));

export const upgradable = (h: Hero): number[] => h.spells.map((s, i) => (s.lvl < 2 ? i : -1)).filter((i) => i >= 0);

export function randomRelics(run: RunState, rng: Rng, n: number): string[] {
  return rng.shuffle(RELIC_IDS.filter((id) => !run.hero.relics.includes(id))).slice(0, n);
}

export function fightRewards(run: RunState): Rewards {
  const rng = rngFor(run, 'reward', run.act, run.step, run.tries);
  const h = run.hero;
  const picks: Pick[] = [];
  if (h.spells.length < maxSpells(h)) {
    for (const id of rng.shuffle(learnable(run)).slice(0, 2)) picks.push({ kind: 'spell', id });
  }
  const up = rng.shuffle(upgradable(h));
  while (picks.length < 2 && up.length) picks.push({ kind: 'upgrade', index: up.pop()! });
  const extra: Pick[] = [{ kind: 'deck', n: 2 }, { kind: 'maxhp', n: 5 }];
  if (h.potions.length < MAX_POTIONS) extra.push({ kind: 'potion', id: rng.pick(POTION_IDS) });
  picks.push(rng.pick(extra));
  return {
    picks,
    relic: run.room === 'elite' ? (randomRelics(run, rng, 1)[0] ?? null) : null,
    relicChoice: run.room === 'boss' ? randomRelics(run, rng, 3) : [],
  };
}

export function addRelic(h: Hero, id: string): void {
  if (!h.relics.includes(id)) h.relics.push(id);
}

export function applyPick(h: Hero, p: Pick): void {
  if (p.kind === 'spell') h.spells.push({ id: p.id, lvl: 1 });
  else if (p.kind === 'upgrade') h.spells[p.index].lvl = 2;
  else if (p.kind === 'relic') addRelic(h, p.id);
  else if (p.kind === 'potion') {
    if (h.potions.length < MAX_POTIONS) h.potions.push(p.id);
  } else if (p.kind === 'deck') h.deck += p.n;
  else {
    h.maxHp += p.n;
    h.hp += p.n;
  }
}

export const spellName = (s: SpellInst): string => `${SPELLS[s.id].icon} ${SPELLS[s.id].name}${s.lvl > 1 ? '+' : ''}`;

// ---------- Shop ----------

export type ShopItem =
  | { kind: 'spell'; id: string; cost: number; sold: boolean }
  | { kind: 'relic'; id: string; cost: number; sold: boolean }
  | { kind: 'potion'; id: string; cost: number; sold: boolean }
  | { kind: 'heal'; n: number; cost: number; sold: boolean }
  | { kind: 'deck'; n: number; cost: number; sold: boolean }
  | { kind: 'upgrade'; cost: number; sold: boolean };

export function makeShop(run: RunState): ShopItem[] {
  const rng = rngFor(run, 'shop', run.act, run.step);
  const items: ShopItem[] = [];
  for (const id of rng.shuffle(learnable(run)).slice(0, 2)) items.push({ kind: 'spell', id, cost: 45 + run.act * 10 + rng.int(0, 10), sold: false });
  for (const id of randomRelics(run, rng, 2)) items.push({ kind: 'relic', id, cost: 110 + rng.int(0, 30), sold: false });
  for (const id of rng.shuffle([...POTION_IDS]).slice(0, 2)) items.push({ kind: 'potion', id, cost: 25 + rng.int(0, 10), sold: false });
  items.push({ kind: 'heal', n: 12, cost: 30, sold: false });
  items.push({ kind: 'deck', n: 2, cost: 50, sold: false });
  items.push({ kind: 'upgrade', cost: 55, sold: false });
  return items;
}

export function canBuy(run: RunState, it: ShopItem): boolean {
  const h = run.hero;
  if (it.sold || h.gold < it.cost) return false;
  if (it.kind === 'spell') return h.spells.length < maxSpells(h);
  if (it.kind === 'potion') return h.potions.length < MAX_POTIONS;
  if (it.kind === 'heal') return h.hp < h.maxHp;
  if (it.kind === 'upgrade') return upgradable(h).length > 0;
  return true;
}

/** Buy an item. Upgrades need a spell index. */
export function buy(run: RunState, it: ShopItem, index = -1): boolean {
  if (!canBuy(run, it)) return false;
  const h = run.hero;
  if (it.kind === 'upgrade') {
    if (!upgradable(h).includes(index)) return false;
    h.spells[index].lvl = 2;
  } else if (it.kind === 'spell') h.spells.push({ id: it.id, lvl: 1 });
  else if (it.kind === 'relic') addRelic(h, it.id);
  else if (it.kind === 'potion') h.potions.push(it.id);
  else if (it.kind === 'heal') h.hp = Math.min(h.maxHp, h.hp + it.n);
  else h.deck += it.n;
  h.gold -= it.cost;
  it.sold = true;
  return true;
}

export const restHeal = (h: Hero): number => Math.min(h.maxHp - h.hp, Math.round(h.maxHp * 0.3));

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
    id: 'teller',
    icon: '🔮',
    title: 'Fortune Teller',
    text: 'An old woman turns a card. "I can teach you what it means."',
    options: [
      {
        label: 'Pay 30 gold (learn a random spell)',
        can: (r) => r.hero.gold >= 30 && learnable(r).length > 0 && r.hero.spells.length < maxSpells(r.hero),
        run: (r, rng) => {
          r.hero.gold -= 30;
          const id = rng.pick(learnable(r));
          r.hero.spells.push({ id, lvl: 1 });
          return `You learn ${SPELLS[id].icon} ${SPELLS[id].name}.`;
        },
      },
      { label: 'Walk on', run: () => 'You walk on.' },
    ],
  },
  {
    id: 'sharp',
    icon: '🎲',
    title: 'Card Sharp',
    text: 'A grinning man shuffles three cups. "Find the queen, double your gold."',
    options: [
      {
        label: 'Bet 25 gold (half chance to win 60)',
        can: (r) => r.hero.gold >= 25,
        run: (r, rng) => {
          r.hero.gold -= 25;
          if (rng.chance(0.5)) {
            r.hero.gold += 60;
            return 'You find the queen. +60 gold.';
          }
          return 'The cup is empty. He laughs.';
        },
      },
      {
        label: 'Take his spare deck (+3 stock cards)',
        run: (r) => {
          r.hero.deck += 3;
          return 'Your stock grows by 3 cards.';
        },
      },
    ],
  },
  {
    id: 'shrine',
    icon: '⛩️',
    title: 'Blood Shrine',
    text: 'The shrine wants blood. It offers a relic in return.',
    options: [
      {
        label: 'Give 6 max HP (gain a random relic)',
        can: (r) => r.hero.maxHp > 20,
        run: (r, rng) => {
          r.hero.maxHp -= 6;
          r.hero.hp = Math.min(r.hero.hp, r.hero.maxHp);
          const id = randomRelics(r, rng, 1)[0];
          if (!id) return 'The shrine takes it and gives nothing.';
          addRelic(r.hero, id);
          return `You gain ${RELICS[id].icon} ${RELICS[id].name}.`;
        },
      },
      {
        label: 'Pray (heal 8)',
        run: (r) => {
          r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + 8);
          return 'You feel better. +8 HP.';
        },
      },
    ],
  },
  {
    id: 'library',
    icon: '📚',
    title: 'Dusty Library',
    text: 'Shelves of spell books. Some pages are still readable.',
    options: [
      {
        label: 'Study (upgrade a random spell)',
        can: (r) => upgradable(r.hero).length > 0,
        run: (r, rng) => {
          const i = rng.pick(upgradable(r.hero));
          r.hero.spells[i].lvl = 2;
          return `${spellName(r.hero.spells[i])} costs less now.`;
        },
      },
      {
        label: 'Sell old books (+30 gold)',
        run: (r) => {
          r.hero.gold += 30;
          return 'You pocket 30 gold.';
        },
      },
    ],
  },
  {
    id: 'peddler',
    icon: '🧺',
    title: 'Potion Peddler',
    text: 'A peddler with a basket of bottles. "One free sample, friend."',
    options: [
      {
        label: 'Take a sample (random potion)',
        can: (r) => r.hero.potions.length < MAX_POTIONS,
        run: (r, rng) => {
          const id = rng.pick(POTION_IDS);
          r.hero.potions.push(id);
          return `You get ${POTIONS[id].icon} ${POTIONS[id].name}.`;
        },
      },
      {
        label: 'Ask for directions (heal 5)',
        run: (r) => {
          r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + 5);
          return 'A short cut saves your legs. +5 HP.';
        },
      },
    ],
  },
];

export const pickEvent = (run: RunState): EventDef => rngFor(run, 'event', run.act, run.step).pick(EVENTS);

// ---------- Score and meta ----------

export const score = (run: RunState, victory: boolean): number =>
  run.act * 300 + run.step * 30 + run.wins * 25 + run.hero.gold + (victory ? 1500 + run.hero.hp * 10 : 0);

export const gemsFor = (sc: number): number => Math.floor(sc / 80);

export const lockedHeroes = (): string[] => HERO_IDS.filter((id) => HEROES[id].unlock > 0);

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
    if (run.v !== 1 || !HEROES[run.heroId] || run.hero.spells.some((s) => !SPELLS[s.id]) || run.hero.relics.some((r) => !RELICS[r])) return null;
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
  const base: Meta = { gems: 0, unlocked: [], runs: 0, wins: 0, bestAct: 0, best: 0 };
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
