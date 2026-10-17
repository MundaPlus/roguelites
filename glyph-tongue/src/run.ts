/** Run state, map plan, rewards, shop, score and save data. */
import { ACTS, CHARMS, FOES } from './data';
import { cast, enemyTurn, isTest, startFight, type CastResult, type Ev, type Fight, type FightKind, type Hero } from './fight';
import { allFacts, factKey, genWorld, parseFactKey, roleOf, type Ctx, type Fact, type Outcome, type World } from './lang';
import { Rng, hash } from './rng';

export type RoomKind = 'test' | 'fight' | 'elite' | 'boss' | 'rest' | 'shop' | 'study' | 'library';
export type At = 'map' | 'fight' | 'reward' | 'shop' | 'rest' | 'library' | 'end';

export const ROOM_INFO: Record<RoomKind, { icon: string; name: string; text: string }> = {
  test: { icon: '🎎', name: 'Test room', text: 'Safe. Cast at dummies. Nothing hurts you here.' },
  fight: { icon: '⚔️', name: 'Fight', text: 'Foes that hit back. Silent runes backfire.' },
  elite: { icon: '💀', name: 'Elite', text: 'A strong foe. Drops a charm.' },
  boss: { icon: '👑', name: 'Boss', text: 'Beat it to finish the act.' },
  rest: { icon: '🔥', name: 'Campfire', text: 'Heal, or study at a dummy.' },
  shop: { icon: '🛒', name: 'Scribe shop', text: 'Buy scrolls, runes and spell length.' },
  study: { icon: '📖', name: 'Study hall', text: 'A short safe test room.' },
  library: { icon: '🏛️', name: 'Library', text: 'Pay HP to read one rule.' },
};

const MID: RoomKind[][] = [['fight', 'study'], ['fight', 'library'], ['elite', 'fight'], ['rest', 'shop'], ['fight', 'study'], ['fight', 'elite'], ['rest', 'shop'], ['boss']];
export const PLAN: RoomKind[][][] = [
  [['test'], ['test'], ['fight'], ['fight', 'library'], ['rest', 'shop'], ['fight', 'elite'], ['fight', 'study'], ['rest', 'shop'], ['boss']],
  MID,
  MID,
];

export interface LogEntry {
  where: string;
  spell: number[];
  ctx: Ctx;
  names: string[];
  silent: boolean[];
  bind: number[];
  outs: Outcome[];
  reson: boolean;
  backlash: number;
  test: boolean;
}

export type Pick = { t: 'rune'; r: number } | { t: 'len' } | { t: 'scroll' } | { t: 'charm'; id: string } | { t: 'hp' } | { t: 'heal' };

export interface Rewards {
  gold: number;
  picks: Pick[];
  taken: boolean;
  charm: string | null;
  charmTaken: boolean;
}

export interface ShopItem {
  pick: Pick;
  cost: number;
  sold: boolean;
}

export interface RunState {
  v: 1;
  seed: string;
  world: World;
  hero: Hero;
  act: number;
  step: number;
  at: At;
  room: RoomKind | null;
  fight: Fight | null;
  rewards: Rewards | null;
  shop: ShopItem[] | null;
  known: string[];
  notes: string[];
  guesses: string[];
  grammarNote: string;
  log: LogEntry[];
  score: number;
  kills: number;
  casts: number;
  perks: string[];
  victory: boolean;
}

export interface Meta {
  ink: number;
  perks: string[];
  runs: number;
  wins: number;
  bestAct: number;
  best: number;
  casts: number;
}

const RUN_KEY = 'glyph.run';
const META_KEY = 'glyph.meta';
export const MAX_LEN = 6;
export const LOG_CAP = 200;

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

function startRunes(world: World, rng: Rng, n: number): number[] {
  for (let tries = 0; tries < 200; tries++) {
    const set = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]).slice(0, n);
    const m = set.map((r) => world.mean[r]);
    const dmg = m.includes('harm') || m.includes('drain');
    const foeRoute = world.def === 'foe' || m.some((x) => x === 'foe' || x === 'all' || x === 'weak' || x === 'spread' || x === 'twin');
    if (dmg && foeRoute) return set.sort((a, b) => a - b);
  }
  return [0, 1, 2, 3, 4, 5, 6, 7].slice(0, n);
}

export function newRun(seed: string, meta: Meta): RunState {
  const base = new Rng(hash(seed, 'world'));
  const world = genWorld(base);
  const perks = [...meta.perks];
  const hp = 45 + (perks.includes('hide') ? 8 : 0);
  const hero: Hero = {
    hp,
    maxHp: hp,
    gold: 0,
    charms: [],
    runes: startRunes(world, new Rng(hash(seed, 'runes')), perks.includes('seventh') ? 7 : 6),
    maxLen: 3,
    scrolls: perks.includes('satchel') ? 1 : 0,
    phoenix: false,
  };
  const run: RunState = {
    v: 1,
    seed,
    world,
    hero,
    act: 0,
    step: 0,
    at: 'map',
    room: null,
    fight: null,
    rewards: null,
    shop: null,
    known: [],
    notes: Array(8).fill(''),
    guesses: Array(8).fill(''),
    grammarNote: '',
    log: [],
    score: 0,
    kills: 0,
    casts: 0,
    perks,
    victory: false,
  };
  if (perks.includes('linguist')) {
    const grammar = allFacts(world).filter((f) => f.t !== 'rune');
    const f = new Rng(hash(seed, 'linguist')).pick(grammar);
    run.known.push(factKey(f));
  }
  return run;
}

export const roomOptions = (run: RunState): RoomKind[] => PLAN[run.act][run.step];

export function testCasts(run: RunState, kind: FightKind): number {
  const base = kind === 'test' ? 6 : 5;
  return base + (run.perks.includes('candle') ? 3 : 0) + (run.hero.charms.includes('lantern') ? 3 : 0);
}

export function enterRoom(run: RunState, room: RoomKind): void {
  run.room = room;
  const rng = rngFor(run, 'room', run.act, run.step);
  switch (room) {
    case 'test':
    case 'study':
    case 'fight':
    case 'elite':
    case 'boss':
      run.fight = startFight(room, run.act, rng, run.hero, testCasts(run, room));
      run.at = 'fight';
      break;
    case 'rest':
      run.at = 'rest';
      break;
    case 'library':
      run.at = 'library';
      break;
    case 'shop':
      run.shop = makeShop(run, rng);
      run.at = 'shop';
      break;
  }
}

export function whereText(run: RunState): string {
  const f = run.fight;
  return `${run.act + 1}-${run.step + 1} ${f ? ROOM_INFO[f.kind].name : ''}`.trim();
}

/** Cast in the current fight and write the log entry. */
export function doCast(run: RunState, spell: number[]): CastResult {
  const f = run.fight!;
  const names = f.foes.map((x) => FOES[x.id].name);
  const res = cast(f, run.hero, run.world, spell);
  const p = res.parsed;
  run.log.push({ where: whereText(run), spell: [...spell], ctx: res.ctx, names, silent: p.silent, bind: p.bind, outs: p.outs, reson: p.reson, backlash: p.backlash, test: isTest(f) });
  if (run.log.length > LOG_CAP) run.log.splice(0, run.log.length - LOG_CAP);
  run.casts++;
  for (const e of res.evs) if (e.t === 'kill') run.kills++;
  return res;
}

export function doEnemyTurn(run: RunState): Ev[] {
  const f = run.fight!;
  return enemyTurn(f, run.hero, rngFor(run, 'turn', run.act, run.step, f.turn));
}

const lockedRunes = (run: RunState): number[] => [0, 1, 2, 3, 4, 5, 6, 7].filter((r) => !run.hero.runes.includes(r));
const freeCharms = (run: RunState): string[] => Object.keys(CHARMS).filter((c) => !run.hero.charms.includes(c));

function randomPick(run: RunState, rng: Rng, t: Pick['t']): Pick | null {
  switch (t) {
    case 'rune': {
      const l = lockedRunes(run);
      return l.length ? { t, r: rng.pick(l) } : null;
    }
    case 'len':
      return run.hero.maxLen < MAX_LEN ? { t } : null;
    case 'charm': {
      const c = freeCharms(run);
      return c.length ? { t, id: rng.pick(c) } : null;
    }
    case 'scroll':
      return run.known.length < allFacts(run.world).length ? { t } : null;
    default:
      return { t } as Pick;
  }
}

/** Called when a fight is won. Test rooms give nothing. */
export function finishFight(run: RunState): void {
  const f = run.fight!;
  const rng = rngFor(run, 'reward', run.act, run.step);
  run.fight = null;
  if (isTest(f)) {
    advance(run);
    return;
  }
  const mul = run.act + 1;
  run.score += f.kind === 'boss' ? 60 * mul : f.kind === 'elite' ? 25 * mul : 10 * mul;
  let gold = f.kind === 'boss' ? 45 : f.kind === 'elite' ? 30 : rng.int(14, 20);
  if (run.hero.charms.includes('inkwell')) gold += 12;
  run.hero.gold += gold;
  const types = rng.shuffle(['rune', 'len', 'scroll', 'charm', 'hp'] as Pick['t'][]);
  const picks: Pick[] = [];
  for (const t of types) {
    if (picks.length >= 3) break;
    if (t === 'charm' && f.kind !== 'fight') continue;
    const p = randomPick(run, rng, t);
    if (p) picks.push(p);
  }
  const charm = f.kind !== 'fight' ? randomPick(run, rng, 'charm') : null;
  run.rewards = { gold, picks, taken: false, charm: charm && charm.t === 'charm' ? charm.id : null, charmTaken: false };
  run.at = 'reward';
}

export function addCharm(h: Hero, id: string): void {
  if (h.charms.includes(id)) return;
  h.charms.push(id);
  if (id === 'cloak') {
    h.maxHp += 10;
    h.hp += 10;
  }
  if (id === 'phoenix') h.phoenix = true;
}

/** Apply a reward or shop pick. Returns a fact text key when a scroll was read at once (never: scrolls are kept). */
export function applyPick(run: RunState, p: Pick): void {
  const h = run.hero;
  switch (p.t) {
    case 'rune':
      if (!h.runes.includes(p.r)) h.runes.push(p.r);
      h.runes.sort((a, b) => a - b);
      break;
    case 'len':
      h.maxLen = Math.min(MAX_LEN, h.maxLen + 1);
      break;
    case 'scroll':
      h.scrolls++;
      break;
    case 'charm':
      addCharm(h, p.id);
      break;
    case 'hp':
      h.maxHp += 6;
      h.hp += 6;
      break;
    case 'heal':
      h.hp = Math.min(h.maxHp, h.hp + 15);
      break;
  }
}

export function makeShop(run: RunState, rng: Rng): ShopItem[] {
  const items: ShopItem[] = [];
  const add = (p: Pick | null, cost: number) => p && items.push({ pick: p, cost, sold: false });
  add(randomPick(run, rng, 'scroll'), 40);
  add(randomPick(run, rng, 'len'), 65);
  add(randomPick(run, rng, 'rune'), 50);
  add({ t: 'heal' }, 20);
  add(randomPick(run, rng, 'charm'), 70);
  return items;
}

export function buy(run: RunState, i: number): boolean {
  const it = run.shop?.[i];
  if (!it || it.sold || run.hero.gold < it.cost) return false;
  run.hero.gold -= it.cost;
  it.sold = it.pick.t !== 'heal';
  applyPick(run, it.pick);
  return true;
}

export const unknownFacts = (run: RunState): Fact[] => allFacts(run.world).filter((f) => !run.known.includes(factKey(f)));

/** Reveal one random hidden fact. Returns it, or null when all facts are known. */
export function revealFact(run: RunState, why: string): Fact | null {
  const u = unknownFacts(run);
  if (!u.length) return null;
  const f = rngFor(run, 'reveal', why, run.known.length).pick(u);
  run.known.push(factKey(f));
  return f;
}

export function useScroll(run: RunState): Fact | null {
  if (run.hero.scrolls <= 0) return null;
  const f = revealFact(run, 'scroll');
  if (f) run.hero.scrolls--;
  return f;
}

export const knownFacts = (run: RunState): Fact[] => run.known.map(parseFactKey);

export function restHeal(run: RunState): number {
  const h = run.hero;
  const before = h.hp;
  h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.3));
  return h.hp - before;
}

export const LIBRARY_COST = 6;

export function advance(run: RunState): void {
  run.room = null;
  run.rewards = null;
  run.shop = null;
  run.fight = null;
  run.step++;
  run.at = 'map';
  if (run.step >= PLAN[run.act].length) {
    run.act++;
    run.step = 0;
    if (run.act >= ACTS.length) {
      run.victory = true;
      run.score += 250;
      run.at = 'end';
      return;
    }
    const h = run.hero;
    h.hp = Math.min(h.maxHp, h.hp + Math.round(h.maxHp * 0.5));
  }
}

export function finalScore(run: RunState): number {
  return run.score + run.kills * 2 + guessedRight(run) * 5;
}

export const inkFor = (score: number): number => Math.floor(score / 40);

/** How many runes the run has learned: roles the player guessed right. */
export function guessedRight(run: RunState): number {
  return run.guesses.filter((g, r) => g && g === run.world.mean[r]).length;
}

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
    if (run.v !== 1 || !run.world || run.world.mean.length !== 8 || run.at === 'end') return null;
    if (run.world.mean.some((m) => !roleOf(m))) return null;
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
  const base: Meta = { ink: 0, perks: [], runs: 0, wins: 0, bestAct: 0, best: 0, casts: 0 };
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

/** Book the end of a run into the meta progress. */
export function endRun(run: RunState, meta: Meta): { score: number; ink: number } {
  const score = finalScore(run);
  const ink = inkFor(score);
  meta.runs++;
  if (run.victory) meta.wins++;
  meta.bestAct = Math.max(meta.bestAct, Math.min(run.act + 1, 3));
  meta.best = Math.max(meta.best, score);
  meta.ink += ink;
  meta.casts += run.casts;
  run.at = 'end';
  return { score, ink };
}
