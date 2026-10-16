/** Run state: map, battle setup, rewards, shop, meta progress, save data. */
import { ACTS, BOSSES, CARDS, DECK_CARDS, LOCKED_CARDS, MAX_LVL, PERKS, START_DECK } from './data';
import { Rng, hash } from './rng';
import type { BattleSetup, Layout } from './sim';

export type Room = 'battle' | 'elite' | 'boss' | 'shop' | 'rest';

export const ROOM_INFO: Record<Room, { icon: string; name: string; text: string }> = {
  battle: { icon: '⚔️', name: 'Battle', text: 'Break the keep. Draft a card after.' },
  elite: { icon: '💀', name: 'Elite', text: 'Special towers. A perk and more gold.' },
  boss: { icon: '👑', name: 'Boss', text: 'A keep with a special power.' },
  shop: { icon: '🛒', name: 'Shop', text: 'Buy cards, upgrades, perks or repairs.' },
  rest: { icon: '🔥', name: 'Camp', text: 'Repair the camp or train a card.' },
};

/** Room options per step of each act. */
export const PLAN: Room[][] = [['battle'], ['battle', 'elite'], ['shop', 'rest'], ['battle', 'elite'], ['boss']];

export interface CardInst {
  id: string;
  lvl: number;
}

export interface Rewards {
  room: Room;
  win: boolean;
  gold: number;
  campLoss: number;
  /** Card draft options (empty after a loss). */
  draft: string[];
  perks: string[];
  cardDone: boolean;
  perkDone: boolean;
  towers: number;
}

export interface ShopItem {
  kind: 'card' | 'upgrade' | 'repair' | 'perk';
  id: string;
  cost: number;
  sold: boolean;
}

export interface RunState {
  v: 1;
  seed: string;
  act: number;
  step: number;
  camp: number;
  campMax: number;
  gold: number;
  deck: CardInst[];
  perks: string[];
  room: Room | null;
  rewards: Rewards | null;
  shop: ShopItem[] | null;
  stats: { won: number; lost: number; towers: number; elites: number; bosses: number; played: number };
  unlocked: string[];
}

export interface Meta {
  gems: number;
  runs: number;
  wins: number;
  best: number;
  bestAct: number;
  towers: number;
  unlocked: string[];
}

const RUN_KEY = 'lanepush.run';
const META_KEY = 'lanepush.meta';

export function newRun(seed: string, meta: Meta): RunState {
  return {
    v: 1,
    seed,
    act: 0,
    step: 0,
    camp: 40,
    campMax: 40,
    gold: 20,
    deck: START_DECK.map((id) => ({ id, lvl: 1 })),
    perks: [],
    room: null,
    rewards: null,
    shop: null,
    stats: { won: 0, lost: 0, towers: 0, elites: 0, bosses: 0, played: 0 },
    unlocked: meta.unlocked.slice(),
  };
}

export const rngFor = (r: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(r.seed, r.act, r.step, ...parts));

export function cardPool(r: RunState): string[] {
  return DECK_CARDS.filter((c) => c.unlock === 0 || r.unlocked.includes(c.id)).map((c) => c.id);
}

const LAYOUTS: Record<string, Layout> = {
  standard: { name: 'Three Towers', lanes: ['arrow', 'arrow', 'arrow'], laneHp: [1, 1, 1], keepHp: 1 },
  bastion: { name: 'Bastion', lanes: ['arrow', 'arrow', 'arrow'], laneHp: [0.85, 1.45, 0.85], keepHp: 1 },
  twin: { name: 'Twin Gate', lanes: ['arrow', null, 'arrow'], laneHp: [1.15, 1, 1.15], keepHp: 1.3 },
  cannons: { name: 'Cannon Wall', lanes: ['cannon', 'arrow', 'cannon'], laneHp: [1, 1, 1], keepHp: 1.05 },
  spring: { name: 'Healing Spring', lanes: ['arrow', 'healer', 'arrow'], laneHp: [1, 1, 1], keepHp: 1.05 },
  boss: { name: 'Boss Keep', lanes: ['arrow', 'arrow', 'arrow'], laneHp: [1, 1, 1], keepHp: 1.25 },
};

export interface Encounter {
  room: Room;
  layout: Layout;
  deck: string[];
  boss: string | null;
  lvl: number;
  ai: number;
  towerHp: number;
}

/** The enemy for the current node. Same seed, same enemy. */
export function encounter(r: RunState, room: Room): Encounter {
  const rng = rngFor(r, 'enc', room);
  const act = ACTS[r.act];
  let layout = LAYOUTS[rng.pick(['standard', 'bastion', 'twin'])];
  if (room === 'elite') layout = LAYOUTS[rng.pick(['cannons', 'spring'])];
  if (room === 'boss') layout = LAYOUTS.boss;
  // Deck: 8 cards with at least 2 that hit air and 1 spell.
  let deck: string[] = [];
  for (let tries = 0; tries < 50; tries++) {
    deck = rng.shuffle(act.pool.slice()).slice(0, 8);
    const air = deck.filter((id) => CARDS[id].unit?.targets === 'any').length;
    const spells = deck.filter((id) => CARDS[id].type === 'spell').length;
    if (air >= 2 && spells >= 1 && spells <= 3) break;
  }
  const ai = act.ai + (room === 'elite' ? 0.04 : room === 'boss' ? 0.06 : 0) + r.step * 0.01;
  return {
    room,
    layout,
    deck,
    boss: room === 'boss' ? BOSSES[r.act].id : null,
    lvl: act.lvl,
    ai,
    towerHp: act.towerHp * (room === 'elite' ? 1.1 : 1),
  };
}

export function battleSetup(r: RunState, room: Room): BattleSetup {
  const enc = encounter(r, room);
  const has = (p: string): boolean => r.perks.includes(p);
  return {
    seed: hash(r.seed, r.act, r.step, room, r.stats.played),
    layout: enc.layout,
    towerHpMul: enc.towerHp,
    boss: enc.boss,
    enemy: { deck: enc.deck, lvl: enc.lvl, rateMul: enc.ai * (has('spy') ? 0.95 : 1) },
    player: {
      deck: r.deck.map((c) => ({ ...c })),
      camp: r.camp,
      campMax: r.campMax,
      max: has('well') ? 12 : 10,
      rateMul: 1.15 * (has('brew') ? 1.12 : 1),
      startEnergy: has('start') ? 8 : 5,
      hpMul: has('hide') ? 1.12 : 1,
      dmgMul: has('blades') ? 1.12 : 1,
      spdMul: has('drums') ? 1.15 : 1,
      spellMul: has('book') ? 1.25 : 1,
      siegeMul: has('siege') ? 1.25 : 1,
    },
  };
}

export const roomAt = (r: RunState): Room[] => PLAN[r.step];

function draftOptions(r: RunState, rng: Rng, n: number): string[] {
  const own = new Set(r.deck.map((c) => c.id));
  const pool = rng.shuffle(cardPool(r).filter((id) => !own.has(id)));
  return pool.slice(0, n);
}

function perkOptions(r: RunState, rng: Rng, n: number): string[] {
  return rng.shuffle(Object.keys(PERKS).filter((p) => !r.perks.includes(p))).slice(0, n);
}

/** Apply a finished battle to the run and build the reward screen. */
export function finishBattle(r: RunState, room: Room, win: boolean, camp: number, towers: number): Rewards {
  const rng = rngFor(r, 'reward', room, r.stats.played);
  r.stats.played++;
  r.stats.towers += towers;
  r.camp = camp;
  let campLoss = 0;
  let gold = 0;
  if (win) {
    r.stats.won++;
    gold = room === 'boss' ? 60 : room === 'elite' ? 40 : 22 + r.act * 4;
    if (room === 'elite') r.stats.elites++;
    if (room === 'boss') {
      r.stats.bosses++;
      r.camp = Math.min(r.campMax, r.camp + Math.round(r.campMax * 0.5));
    }
  } else {
    r.stats.lost++;
    campLoss = room === 'boss' ? 14 : 8;
    r.camp = Math.max(0, r.camp - campLoss);
    gold = 6;
  }
  r.gold += gold;
  const perks = win && room !== 'battle' ? perkOptions(r, rng, 3) : [];
  const draft = win ? draftOptions(r, rng, 3) : [];
  return { room, win, gold, campLoss, draft, perks, cardDone: !draft.length, perkDone: !perks.length, towers };
}

/** Move to the next node. A lost boss stays (try again). Returns 'win' when the run is won. */
export function advance(r: RunState): 'win' | 'next' {
  const lostBoss = r.rewards && r.rewards.room === 'boss' && !r.rewards.win;
  r.rewards = null;
  r.shop = null;
  r.room = null;
  if (lostBoss) return 'next';
  r.step++;
  if (r.step >= PLAN.length) {
    r.step = 0;
    r.act++;
    if (r.act >= ACTS.length) return 'win';
  }
  return 'next';
}

export function draftLevel(r: RunState): number {
  return Math.min(MAX_LVL, 1 + r.act);
}

export function addCard(r: RunState, id: string, replace: number): void {
  r.deck[replace] = { id, lvl: draftLevel(r) };
}

export function upgradeCard(r: RunState, i: number): boolean {
  const c = r.deck[i];
  if (!c || c.lvl >= MAX_LVL) return false;
  c.lvl++;
  return true;
}

export function addPerk(r: RunState, id: string): void {
  if (!PERKS[id] || r.perks.includes(id)) return;
  r.perks.push(id);
  if (id === 'wall') {
    r.campMax += 20;
    r.camp = Math.min(r.campMax, r.camp + 20);
  }
}

export const upgradable = (r: RunState): number[] => r.deck.map((c, i) => (c.lvl < MAX_LVL ? i : -1)).filter((i) => i >= 0);

export const upgradeCost = (lvl: number): number => 30 + lvl * 15;

export function makeShop(r: RunState): ShopItem[] {
  const rng = rngFor(r, 'shop');
  const items: ShopItem[] = draftOptions(r, rng, 3).map((id) => ({ kind: 'card', id, cost: 30 + CARDS[id].cost * 6, sold: false }));
  items.push({ kind: 'upgrade', id: '', cost: 0, sold: false });
  items.push({ kind: 'repair', id: '', cost: 25, sold: false });
  const perk = perkOptions(r, rng, 1)[0];
  if (perk) items.push({ kind: 'perk', id: perk, cost: 75, sold: false });
  return items;
}

export const REST_HEAL = 0.35;

export function score(r: RunState, victory: boolean): number {
  const s = r.stats;
  return s.won * 40 + s.elites * 50 + s.bosses * 150 + s.towers * 10 + r.act * 60 + (victory ? 400 + r.camp * 5 : 0);
}

export const gemsFor = (sc: number): number => Math.floor(sc / 40);

export const unlockList = (): string[] => LOCKED_CARDS;

// ---------- Save data ----------

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    return r && r.v === 1 && Array.isArray(r.deck) ? r : null;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState | null): void {
  try {
    if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage blocked */
  }
}

export function defaultMeta(): Meta {
  return { gems: 0, runs: 0, wins: 0, best: 0, bestAct: 0, towers: 0, unlocked: [] };
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return defaultMeta();
    return { ...defaultMeta(), ...(JSON.parse(raw) as Partial<Meta>) };
  } catch {
    return defaultMeta();
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage blocked */
  }
}

/** Close a run: update meta, return score and gems. */
export function endRun(r: RunState, meta: Meta, victory: boolean): { score: number; gems: number } {
  const sc = score(r, victory);
  const gems = gemsFor(sc);
  meta.runs++;
  if (victory) meta.wins++;
  meta.best = Math.max(meta.best, sc);
  meta.bestAct = Math.max(meta.bestAct, victory ? 3 : r.act + 1);
  meta.towers += r.stats.towers;
  meta.gems += gems;
  return { score: sc, gems };
}

// ---------- Bot choices (debug API and balance sims) ----------

const CARD_VALUE: Record<string, number> = {
  giant: 9, golem: 8, pekka: 8, valkyrie: 8, musketeer: 8, wizard: 8, babydragon: 8, witch: 7, hog: 7, knight: 7, balloon: 6,
  fireball: 7, arrows: 6, freeze: 6, lightning: 6, bomber: 6, archers: 5, minions: 6, skeletons: 5, zap: 5, spears: 4, goblins: 4, heal: 3, rage: 4,
};

/** Bot pick on the reward screen: a better card replaces the weakest, else upgrade. */
export function botDraft(r: RunState, draft: string[]): { kind: 'card'; id: string; replace: number } | { kind: 'upgrade'; i: number } | null {
  const val = (id: string, lvl: number): number => (CARD_VALUE[id] ?? 5) + lvl * 2;
  let weakest = 0;
  for (let i = 1; i < r.deck.length; i++) if (val(r.deck[i].id, r.deck[i].lvl) < val(r.deck[weakest].id, r.deck[weakest].lvl)) weakest = i;
  const best = draft.slice().sort((a, z) => (CARD_VALUE[z] ?? 5) - (CARD_VALUE[a] ?? 5))[0];
  const keepTank = (i: number): boolean => {
    const tanks = r.deck.filter((c) => CARDS[c.id].tags.some((t) => t === 'tank' || t === 'siege'));
    return tanks.length <= 1 && CARDS[r.deck[i].id].tags.some((t) => t === 'tank' || t === 'siege');
  };
  if (best && val(best, draftLevel(r)) > val(r.deck[weakest].id, r.deck[weakest].lvl) + 1 && !keepTank(weakest)) return { kind: 'card', id: best, replace: weakest };
  const up = upgradable(r).sort((a, z) => val(r.deck[z].id, 0) - val(r.deck[a].id, 0) || r.deck[a].lvl - r.deck[z].lvl);
  const pick = up.sort((a, z) => r.deck[a].lvl - r.deck[z].lvl || val(r.deck[z].id, 0) - val(r.deck[a].id, 0))[0];
  return pick !== undefined ? { kind: 'upgrade', i: pick } : null;
}
