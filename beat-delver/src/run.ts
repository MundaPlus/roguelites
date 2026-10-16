/** Run and meta state, save data, zone rewards, score. */
import { CHARS, FLOORS_PER_ZONE, ITEMS, ZONES } from './data';
import { pickItems } from './level';
import { Rng, hash } from './rng';
import { giveItem, type Hero } from './world';

export interface Settings {
  /** Input latency in ms. Positive means you hear the beat late. */
  lat: number;
  wide: boolean;
}

export interface Meta {
  diamonds: number;
  runs: number;
  wins: number;
  best: number;
  bestDepth: number;
  unlocked: string[];
  char: string;
  settings: Settings;
}

export type RewardKind = 'heal' | 'maxhp' | 'item' | 'gold';

export interface Reward {
  kind: RewardKind;
  item?: string;
  n?: number;
}

export interface RunState {
  seed: string;
  zone: number;
  floor: number;
  hero: Hero;
  /** Zone reward picks waiting after a boss. */
  reward: Reward[] | null;
  beats: number;
  missed: number;
}

const RUN_KEY = 'beatdelver.run';
const META_KEY = 'beatdelver.meta';

export function defaultMeta(): Meta {
  return { diamonds: 0, runs: 0, wins: 0, best: 0, bestDepth: 0, unlocked: ['delver'], char: 'delver', settings: { lat: 0, wide: false } };
}

export function loadMeta(): Meta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = { ...defaultMeta(), ...JSON.parse(raw) } as Meta;
      m.settings = { ...defaultMeta().settings, ...m.settings };
      return m;
    }
  } catch {
    /* storage blocked */
  }
  return defaultMeta();
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* storage blocked */
  }
}

export function saveRun(r: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(r));
  } catch {
    /* storage blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (raw) return JSON.parse(raw) as RunState;
  } catch {
    /* storage blocked */
  }
  return null;
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage blocked */
  }
}

export function newHero(charId: string, unlocked: string[]): Hero {
  const c = CHARS.find((x) => x.id === charId) ?? CHARS[0];
  const h: Hero = {
    char: c.id,
    hp: c.hp,
    maxHp: c.hp,
    gold: c.gold,
    diamonds: 0,
    weapon: c.weapon,
    whet: 0,
    armor: c.armor,
    torch: c.torch,
    bombs: c.bombs,
    spell: null,
    charge: 0,
    rings: c.rings.slice(),
    pick: false,
    kills: 0,
    goldEarned: 0,
  };
  if (unlocked.includes('u_bombs')) h.bombs += 2;
  if (unlocked.includes('u_torch')) h.torch = Math.max(h.torch, 1);
  if (unlocked.includes('u_heart')) {
    h.maxHp++;
    h.hp++;
  }
  return h;
}

export function newRun(seed: string, meta: Meta): RunState {
  return { seed, zone: 0, floor: 0, hero: newHero(meta.char, meta.unlocked), reward: null, beats: 0, missed: 0 };
}

export const floorSeed = (r: RunState): number => hash(r.seed, 'floor', r.zone, r.floor);

/** Floors cleared so far, 0 to 12. */
export const depth = (r: RunState): number => r.zone * FLOORS_PER_ZONE + r.floor;

export function bpmOf(zone: number, floor: number): number {
  return ZONES[zone].bpm + floor * 4;
}

export function zoneRewards(r: RunState): Reward[] {
  const rng = new Rng(hash(r.seed, 'reward', r.zone));
  const [item] = pickItems(rng, r.hero, 1, false);
  return [{ kind: 'heal' }, { kind: 'maxhp', n: 1 }, item ? { kind: 'item', item } : { kind: 'gold', n: 60 }];
}

export function applyReward(h: Hero, rw: Reward): void {
  if (rw.kind === 'heal') h.hp = h.maxHp;
  else if (rw.kind === 'maxhp') {
    h.maxHp += rw.n ?? 2;
    h.hp += rw.n ?? 2;
  } else if (rw.kind === 'gold') h.gold += rw.n ?? 0;
  else if (rw.item) giveItem(h, rw.item);
}

export function rewardText(rw: Reward, h: Hero): { icon: string; name: string; text: string } {
  if (rw.kind === 'heal') return { icon: '💖', name: 'Full heal', text: `Heal to ${h.maxHp} HP (now ${h.hp}).` };
  if (rw.kind === 'maxhp') return { icon: '❤️', name: `+${rw.n} max HP`, text: 'Also heals that much.' };
  if (rw.kind === 'gold') return { icon: '💰', name: `${rw.n} gold`, text: 'For the next shop.' };
  const it = ITEMS[rw.item!];
  return { icon: it.icon, name: it.name, text: it.text };
}

export function score(r: RunState, won: boolean): number {
  const h = r.hero;
  return h.goldEarned + h.kills * 5 + depth(r) * 60 + h.diamonds * 20 + (won ? 600 : 0);
}

/** Diamonds kept for the meta shop: those found plus a bonus for depth and a win. */
export function diamondsFor(r: RunState, won: boolean): number {
  return r.hero.diamonds + Math.floor(depth(r) / 3) + (won ? 5 : 0);
}
