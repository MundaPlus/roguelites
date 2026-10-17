/** Run state: dungeons, deck, hand, shop, score and save data. Pure functions on plain objects. */
import { BOSSES, CARDS, DUNGEONS, HEROES, HERO_IDS, ROOMS, SERVICES, STARTER_DECK, TARGET, allCard, type HeroId, type ServiceId } from './data';
import { enterRoom, newHero, type EndReason, type Hero, type Outcome } from './hero';
import { Rng, hash } from './rng';

export interface PathRoom {
  card: string;
  fun: number;
  target: number;
  fit: number;
  points: number;
  twist: string | null;
}

export interface DungeonResult {
  stars: number;
  pct: number;
  points: number;
}

export interface ShopItem {
  id: string;
  price: number;
  sold: boolean;
}

export type Phase = 'play' | 'review' | 'shop' | 'over';
export type RunEnd = EndReason | 'fired' | 'won' | 'abandon';

export interface RunState {
  v: 1;
  seed: string;
  hero: Hero;
  level: number;
  step: number;
  deck: string[];
  pile: string[];
  hand: string[];
  bosses: string[];
  path: PathRoom[];
  dunPoints: number;
  renown: number;
  score: number;
  /** Guild trust. A dungeon under the pass mark costs 1. At 0 you are fired. */
  trust: number;
  results: DungeonResult[];
  phase: Phase;
  shop: ShopItem[];
  bought: Partial<Record<ServiceId, number>>;
  thought: string;
  end: RunEnd | null;
  stats: { rooms: number; inZone: number; dmg: number; loot: number };
  /** Meta stars at run start. Cards with a higher unlock stay out of the shop. */
  cardStars: number;
}

export interface Meta {
  stars: number;
  runs: number;
  wins: number;
  best: number;
  lastHero: HeroId | null;
  seen: HeroId[];
}

export const RUN_KEY = 'director.run';
export const META_KEY = 'director.meta';
export const TRUST = 2;
/** Stars needed per dungeon. Fewer costs 1 trust. */
export const PASS = 3;
export const STAR_PCT = [30, 45, 60, 75, 88];

export function starsFor(pct: number): number {
  let s = 0;
  for (const t of STAR_PCT) if (pct >= t) s++;
  return s;
}

export function unlockedHeroes(meta: Meta): HeroId[] {
  return HERO_IDS.filter((id) => HEROES[id].unlock <= meta.stars);
}

export function newRun(seed: string, meta: Meta, forceHero?: HeroId): RunState {
  const rng = new Rng(hash(seed, 'hero'));
  const pool = unlockedHeroes(meta).filter((h) => h !== meta.lastHero || unlockedHeroes(meta).length < 2);
  const type = forceHero ?? rng.pick(pool);
  const r: RunState = {
    v: 1,
    seed,
    hero: newHero(type),
    level: 0,
    step: 0,
    deck: [...STARTER_DECK],
    pile: [],
    hand: [],
    bosses: [],
    path: [],
    dunPoints: 0,
    renown: 0,
    score: 0,
    trust: TRUST,
    results: [],
    phase: 'play',
    shop: [],
    bought: {},
    thought: 'A new dungeon! Let us see what you built.',
    end: null,
    stats: { rooms: 0, inZone: 0, dmg: 0, loot: 0 },
    cardStars: meta.stars,
  };
  startDungeon(r);
  return r;
}

export function startDungeon(r: RunState): void {
  const rng = new Rng(hash(r.seed, r.level, 'deck'));
  r.step = 0;
  r.pile = rng.shuffle([...r.deck]);
  r.bosses = rng.shuffle(Object.keys(BOSSES)).slice(0, 3);
  r.path = [];
  r.dunPoints = 0;
  r.hero.fun = 15;
  r.hero.lastKind = null;
  r.phase = 'play';
  drawHand(r);
}

function drawHand(r: RunState): void {
  r.hand = r.step >= ROOMS ? [...r.bosses] : r.pile.splice(0, 3);
}

export const targetAt = (step: number): number => TARGET[Math.min(step, TARGET.length - 1)];

/** Expected outcome of a hand card, for the preview. */
export function preview(r: RunState, id: string): Outcome {
  return enterRoom(r.hero, allCard(id), r.level, r.step, null);
}

/** Place hand card `i` and let the hero walk in. */
export function playCard(r: RunState, i: number): Outcome {
  const id = r.hand[i];
  const card = allCard(id);
  const o = enterRoom(r.hero, card, r.level, r.step, new Rng(hash(r.seed, r.level, r.step, 'room')));
  r.hero = o.hero;
  r.path.push({ card: id, fun: o.hero.fun, target: targetAt(r.step), fit: o.fit, points: o.points, twist: o.twist });
  r.dunPoints += o.points;
  r.stats.rooms++;
  r.stats.dmg += o.dmg;
  r.stats.loot += o.gold;
  if (o.fit >= 1) r.stats.inZone++;
  r.thought = o.twist ? `${o.twist} ${o.thought}` : o.thought;
  if (card.kind !== 'boss') r.pile.push(...r.hand.filter((_, j) => j !== i));
  r.hand = [];
  r.step++;
  if (o.end) {
    r.end = o.end;
    r.phase = 'over';
    r.score = Math.round(r.score + r.dunPoints);
    return o;
  }
  if (r.step > ROOMS) finishDungeon(r);
  else drawHand(r);
  return o;
}

/** The fun fit share of the dungeon, 0–100. */
export function dungeonPct(r: RunState): number {
  const max = ROOMS + 3;
  const got = r.path.reduce((a, p) => a + p.fit * (allCard(p.card).kind === 'boss' ? 3 : 1), 0);
  return Math.round((got / max) * 100);
}

function finishDungeon(r: RunState): void {
  const pct = dungeonPct(r);
  const stars = starsFor(pct);
  const points = Math.round(r.dunPoints);
  r.results.push({ stars, pct, points });
  r.renown += points;
  r.score += points + stars * 15;
  if (stars < PASS) r.trust--;
  if (r.trust <= 0) {
    r.end = 'fired';
    r.phase = 'over';
    return;
  }
  r.level++;
  if (r.level >= DUNGEONS) {
    r.end = 'won';
    r.phase = 'over';
    r.score += 150 + r.trust * 25;
    return;
  }
  // The hero rests between dungeons.
  const h = r.hero;
  h.hp = Math.min(h.maxHp, Math.round(h.hp + h.maxHp * 0.3));
  h.bore = Math.round(h.bore * 0.5);
  h.stress = Math.round(h.stress * 0.6);
  h.delight = Math.round(h.delight * 0.6);
  r.phase = 'review';
  r.thought = stars >= PASS ? 'What a dungeon! Is there another one?' : 'Hm. That one was not great.';
  makeShop(r);
}

export function makeShop(r: RunState): void {
  const rng = new Rng(hash(r.seed, r.level, 'shop'));
  const pool = Object.values(CARDS).filter((c) => c.unlock <= r.cardStars && c.id !== 'hall');
  r.shop = rng
    .shuffle(pool)
    .slice(0, 4)
    .map((c) => ({ id: c.id, price: c.price + r.level * 2, sold: false }));
  r.bought = {};
}

export function servicePrice(r: RunState, id: ServiceId): number {
  return SERVICES[id].price + (r.bought[id] ?? 0) * 8 + r.level * 2;
}

export function buyCard(r: RunState, i: number): boolean {
  const it = r.shop[i];
  if (!it || it.sold || r.renown < it.price) return false;
  r.renown -= it.price;
  it.sold = true;
  r.deck.push(it.id);
  return true;
}

export const MIN_DECK = ROOMS + 2;

export function buyService(r: RunState, id: ServiceId, cut?: number): boolean {
  const price = servicePrice(r, id);
  if (r.renown < price) return false;
  const h = r.hero;
  if (id === 'heal') {
    if (h.hp >= h.maxHp) return false;
    h.hp = Math.min(h.maxHp, h.hp + 40);
  } else if (id === 'tea') {
    if (h.stress <= 0 && h.bore <= 0) return false;
    h.stress = Math.max(0, h.stress - 30);
    h.bore = Math.max(0, h.bore - 30);
  } else if (id === 'gear') {
    h.gear += 3;
  } else if (id === 'cut') {
    if (cut === undefined || cut < 0 || cut >= r.deck.length || r.deck.length <= MIN_DECK) return false;
    r.deck.splice(cut, 1);
  }
  r.renown -= price;
  r.bought[id] = (r.bought[id] ?? 0) + 1;
  return true;
}

export function nextDungeon(r: RunState): void {
  startDungeon(r);
  r.thought = `Dungeon ${r.level + 1}! I am ready.`;
}

/** Meta stars from a finished run. */
export function runStars(r: RunState): number {
  return r.results.reduce((a, x) => a + x.stars, 0) + (r.end === 'won' ? 5 : 0);
}

// ---------- Save data ----------

export function saveRun(run: RunState | null): void {
  try {
    if (!run || run.phase === 'over') localStorage.removeItem(RUN_KEY);
    else localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || !HEROES[run.hero?.type] || !Array.isArray(run.deck) || run.phase === 'over') return null;
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
  const base: Meta = { stars: 0, runs: 0, wins: 0, best: 0, lastHero: null, seen: [] };
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

/** Book a finished run into the meta progress. Returns the stars gained. */
export function recordEnd(meta: Meta, r: RunState): number {
  const s = runStars(r);
  meta.stars += s;
  meta.runs++;
  if (r.end === 'won') meta.wins++;
  meta.best = Math.max(meta.best, r.score);
  meta.lastHero = r.hero.type;
  if (!meta.seen.includes(r.hero.type)) meta.seen.push(r.hero.type);
  saveMeta(meta);
  return s;
}
