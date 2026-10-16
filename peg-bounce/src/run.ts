import { ACTS, ORBS, ORB_IDS, RELICS, RELIC_IDS } from './data';
import type { FightKind, Hero, OrbInst } from './fight';
import { Rng, hash } from './rng';

export type Room = 'fight' | 'elite' | 'shop' | 'rest' | 'treasure' | 'event' | 'boss';

export const ROOM_INFO: Record<Room, { icon: string; name: string; text: string }> = {
  fight: { icon: '⚔️', name: 'Fight', text: 'A group of monsters.' },
  elite: { icon: '💀', name: 'Elite', text: 'A tough fight. Drops a relic.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Buy orbs, relics and healing.' },
  rest: { icon: '🔥', name: 'Campfire', text: 'Heal or upgrade an orb.' },
  treasure: { icon: '🎁', name: 'Treasure', text: 'A free relic.' },
  event: { icon: '❓', name: 'Event', text: 'Something strange.' },
  boss: { icon: '👑', name: 'Boss', text: 'The guardian of this act.' },
};

/** The choices at each step of an act. */
export const PLAN: Room[][] = [
  ['fight'],
  ['fight', 'event'],
  ['fight', 'treasure', 'event'],
  ['elite', 'shop'],
  ['fight', 'event'],
  ['rest', 'shop'],
  ['fight', 'elite'],
  ['rest', 'treasure'],
  ['boss'],
];

export interface RunState {
  v: 1;
  seed: string;
  hero: Hero;
  act: number;
  step: number;
  kills: number;
  fights: number;
  /** Orbs and relics unlocked when the run started. */
  orbPool: string[];
  relicPool: string[];
}

export interface Meta {
  shards: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestAct: number;
  best: number;
}

const RUN_KEY = 'pegbounce.run';
const META_KEY = 'pegbounce.meta';

export const START_HP = 70;

export function newRun(seed: string, meta: Meta): RunState {
  return {
    v: 1,
    seed,
    hero: {
      hp: START_HP,
      maxHp: START_HP,
      gold: 0,
      relics: [],
      bag: [
        { id: 'pebble', lvl: 1 },
        { id: 'pebble', lvl: 1 },
        { id: 'pebble', lvl: 1 },
        { id: 'splitter', lvl: 1 },
      ],
    },
    act: 0,
    step: 0,
    kills: 0,
    fights: 0,
    orbPool: ORB_IDS.filter((id) => ORBS[id].unlock === 0 || meta.unlocked.includes(id)),
    relicPool: RELIC_IDS.filter((id) => RELICS[id].unlock === 0 || meta.unlocked.includes(id)),
  };
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export const fightSeed = (run: RunState, room: Room): number => hash(run.seed, 'fight', run.act, run.step, room);

export const roomKind = (room: Room): FightKind => (room === 'elite' ? 'elite' : room === 'boss' ? 'boss' : 'fight');

export function advance(run: RunState): boolean {
  run.step++;
  if (run.step >= PLAN.length) {
    run.act++;
    run.step = 0;
    return run.act >= ACTS.length;
  }
  return false;
}

// ---------- Rewards ----------

export type Pick = { kind: 'orb'; id: string } | { kind: 'upgrade'; index: number } | { kind: 'relic'; id: string } | { kind: 'maxhp'; n: number };

export interface Rewards {
  gold: number;
  picks: Pick[];
  relic: string | null;
  relicChoice: string[];
}

export const upgradable = (h: Hero): number[] => h.bag.map((o, i) => (o.lvl < 3 ? i : -1)).filter((i) => i >= 0);

export function randomRelics(run: RunState, rng: Rng, n: number): string[] {
  return rng.shuffle(run.relicPool.filter((id) => !run.hero.relics.includes(id))).slice(0, n);
}

export function fightRewards(run: RunState, kind: FightKind): Rewards {
  const rng = rngFor(run, 'reward', run.act, run.step);
  const h = run.hero;
  let gold = kind === 'boss' ? rng.int(50, 60) : kind === 'elite' ? rng.int(25, 35) : rng.int(10, 16) + run.act * 4;
  if (h.relics.includes('purse')) gold = Math.round(gold * 1.3);
  const orbs = rng.shuffle([...run.orbPool]).slice(0, 2);
  const picks: Pick[] = orbs.map((id) => ({ kind: 'orb', id }));
  const up = upgradable(h);
  if (up.length) picks.push({ kind: 'upgrade', index: rng.pick(up) });
  else picks.push({ kind: 'maxhp', n: 6 });
  return {
    gold,
    picks,
    relic: kind === 'elite' ? (randomRelics(run, rng, 1)[0] ?? null) : null,
    relicChoice: kind === 'boss' ? randomRelics(run, rng, 3) : [],
  };
}

export function addRelic(h: Hero, id: string): void {
  if (h.relics.includes(id)) return;
  h.relics.push(id);
  if (id === 'hide') {
    h.maxHp += 20;
    h.hp += 20;
  }
}

export function applyPick(h: Hero, p: Pick): void {
  if (p.kind === 'orb') h.bag.push({ id: p.id, lvl: 1 });
  else if (p.kind === 'upgrade') h.bag[p.index].lvl = Math.min(3, h.bag[p.index].lvl + 1);
  else if (p.kind === 'relic') addRelic(h, p.id);
  else {
    h.maxHp += p.n;
    h.hp += p.n;
  }
}

export const orbName = (o: OrbInst): string => `${ORBS[o.id].icon} ${ORBS[o.id].name}${o.lvl > 1 ? ` ${'★'.repeat(o.lvl - 1)}` : ''}`;

// ---------- Shop ----------

export type ShopItem =
  | { kind: 'orb'; id: string; cost: number; sold: boolean }
  | { kind: 'relic'; id: string; cost: number; sold: boolean }
  | { kind: 'heal'; n: number; cost: number; sold: boolean }
  | { kind: 'remove'; cost: number; sold: boolean }
  | { kind: 'upgrade'; cost: number; sold: boolean };

export function makeShop(run: RunState): ShopItem[] {
  const rng = rngFor(run, 'shop', run.act, run.step);
  const items: ShopItem[] = rng
    .shuffle([...run.orbPool])
    .slice(0, 3)
    .map((id) => ({ kind: 'orb', id, cost: 35 + run.act * 8 + rng.int(0, 10), sold: false }));
  for (const id of randomRelics(run, rng, 2)) items.push({ kind: 'relic', id, cost: 90 + rng.int(0, 30), sold: false });
  items.push({ kind: 'heal', n: 20, cost: 25, sold: false });
  items.push({ kind: 'upgrade', cost: 55, sold: false });
  items.push({ kind: 'remove', cost: 40, sold: false });
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
    id: 'well',
    icon: '⛲',
    title: 'Wishing Well',
    text: 'Coins glitter at the bottom of an old well.',
    options: [
      {
        label: 'Toss 30 gold (gain a random relic)',
        can: (r) => r.hero.gold >= 30,
        run: (r, rng) => {
          r.hero.gold -= 30;
          const id = randomRelics(r, rng, 1)[0];
          if (!id) return 'Nothing happens.';
          addRelic(r.hero, id);
          return `The well gives you ${RELICS[id].icon} ${RELICS[id].name}.`;
        },
      },
      { label: 'Walk on', run: () => 'You walk on.' },
    ],
  },
  {
    id: 'smith',
    icon: '⚒️',
    title: 'Old Smith',
    text: 'A smith offers to work on your orbs, if you hold the hot metal.',
    options: [
      {
        label: 'Upgrade a random orb (lose 8 HP)',
        can: (r) => upgradable(r.hero).length > 0 && r.hero.hp > 8,
        run: (r, rng) => {
          r.hero.hp -= 8;
          const i = rng.pick(upgradable(r.hero));
          r.hero.bag[i].lvl++;
          return `${orbName(r.hero.bag[i])} glows hot.`;
        },
      },
      { label: 'Leave', run: () => 'You leave the smith to his work.' },
    ],
  },
  {
    id: 'shrooms',
    icon: '🍄',
    title: 'Mushroom Ring',
    text: 'Bright mushrooms grow in a perfect circle.',
    options: [
      {
        label: 'Eat one (heal 18 or lose 6)',
        run: (r, rng) => {
          if (rng.chance(0.6)) {
            r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + 18);
            return 'Delicious. You heal 18 HP.';
          }
          r.hero.hp = Math.max(1, r.hero.hp - 6);
          return 'Bitter! You lose 6 HP.';
        },
      },
      { label: 'Leave them', run: () => 'You step around the ring.' },
    ],
  },
  {
    id: 'lost',
    icon: '🎒',
    title: 'Lost Pack',
    text: 'A pack lies in the moss. Someone left in a hurry.',
    options: [
      {
        label: 'Take the orb inside',
        run: (r, rng) => {
          const id = rng.pick(r.orbPool);
          r.hero.bag.push({ id, lvl: 1 });
          return `You find ${ORBS[id].icon} ${ORBS[id].name}.`;
        },
      },
      {
        label: 'Take the coins (25 gold)',
        run: (r) => {
          r.hero.gold += 25;
          return 'You pocket 25 gold.';
        },
      },
    ],
  },
  {
    id: 'altar',
    icon: '🩸',
    title: 'Blood Altar',
    text: 'The altar wants something from you. It offers power in return.',
    options: [
      {
        label: 'Give 10 max HP (gain a random relic)',
        can: (r) => r.hero.maxHp > 30,
        run: (r, rng) => {
          r.hero.maxHp -= 10;
          r.hero.hp = Math.min(r.hero.hp, r.hero.maxHp);
          const id = randomRelics(r, rng, 1)[0];
          if (!id) return 'The altar takes it and gives nothing.';
          addRelic(r.hero, id);
          return `You gain ${RELICS[id].icon} ${RELICS[id].name}.`;
        },
      },
      { label: 'Refuse', run: () => 'You back away.' },
    ],
  },
  {
    id: 'dummy',
    icon: '🎯',
    title: 'Training Yard',
    text: 'An empty yard with straw targets. A coach waves at you.',
    options: [
      {
        label: 'Train (20 gold, upgrade a random orb)',
        can: (r) => r.hero.gold >= 20 && upgradable(r.hero).length > 0,
        run: (r, rng) => {
          r.hero.gold -= 20;
          const i = rng.pick(upgradable(r.hero));
          r.hero.bag[i].lvl++;
          return `${orbName(r.hero.bag[i])} is stronger now.`;
        },
      },
      {
        label: 'Rest a while (heal 8)',
        run: (r) => {
          r.hero.hp = Math.min(r.hero.maxHp, r.hero.hp + 8);
          return 'You heal 8 HP.';
        },
      },
    ],
  },
];

export const pickEvent = (run: RunState): EventDef => rngFor(run, 'event', run.act, run.step).pick(EVENTS);

// ---------- Score and meta ----------

export const score = (run: RunState, victory: boolean): number =>
  run.act * 300 + run.step * 25 + run.kills * 8 + run.hero.gold + (victory ? 1500 : 0);

export const shardsFor = (sc: number): number => Math.floor(sc / 60);

export const LOCKED = [...ORB_IDS.filter((id) => ORBS[id].unlock > 0), ...RELIC_IDS.filter((id) => RELICS[id].unlock > 0)];

export const unlockCost = (id: string): number => ORBS[id]?.unlock ?? RELICS[id]?.unlock ?? 0;

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
    if (run.v !== 1 || run.hero.bag.some((o) => !ORBS[o.id]) || run.hero.relics.some((r) => !RELICS[r])) return null;
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
  const base: Meta = { shards: 0, unlocked: [], runs: 0, wins: 0, bestAct: 0, best: 0 };
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
