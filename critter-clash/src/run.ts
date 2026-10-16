import { battle, type BattleResult } from './battle';
import {
  BUY_COST,
  CRITTERS,
  FOOD,
  FOODS,
  FOOD_COST,
  MAX_STAT,
  PACKS,
  REROLL_COST,
  SHOP_CRITTERS,
  START_GOLD,
  START_LIVES,
  TEAM_SIZE,
  WIN_TROPHIES,
  foodSize,
  levelOf,
  lifeLoss,
  shopSize,
  tierFor,
  type Ctx,
  type PackId,
  type PerkId,
  type Trigger,
  type Unit,
} from './data';
import { Rng, hash } from './rng';

export interface ShopSlot {
  u: Unit;
  frozen: boolean;
  /** Bonus slot from a level up. It goes away on reroll unless frozen. */
  bonus?: boolean;
}

export interface FoodSlot {
  id: string;
  frozen: boolean;
}

export interface RunState {
  v: 1;
  seed: string;
  round: number;
  gold: number;
  lives: number;
  trophies: number;
  team: Unit[];
  shop: (ShopSlot | null)[];
  foods: (FoodSlot | null)[];
  uid: number;
  rolls: number;
  packs: PackId[];
  history: ('W' | 'L' | 'D')[];
}

export interface Meta {
  stars: number;
  packs: PackId[];
  runs: number;
  wins: number;
  bestTrophies: number;
  best: number;
}

/** A visible effect for the UI: a floating text over one critter. */
export interface Note {
  uid: number;
  text: string;
  color?: string;
}

const RUN_KEY = 'critter.run';
const META_KEY = 'critter.meta';

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

export function newRun(seed: string, packs: PackId[]): RunState {
  const run: RunState = {
    v: 1,
    seed,
    round: 1,
    gold: START_GOLD,
    lives: START_LIVES,
    trophies: 0,
    team: [],
    shop: [],
    foods: [],
    uid: 1,
    rolls: 0,
    packs: [...packs],
    history: [],
  };
  fillShop(run, rngFor(run, 'shop', 1, 0));
  return run;
}

export function makeUnit(run: RunState, id: string): Unit {
  const d = CRITTERS[id];
  return { uid: run.uid++, id, atk: d.atk, hp: d.hp, xp: 0, perk: null };
}

export const pool = (run: RunState, maxTier = tierFor(run.round)) =>
  SHOP_CRITTERS.filter((c) => c.tier <= maxTier && run.packs.includes(c.pack));

/** Refill every slot that is not frozen. */
export function fillShop(run: RunState, rng: Rng): void {
  const n = shopSize(run.round);
  const kept = run.shop.filter((s): s is ShopSlot => !!s && s.frozen);
  const shop: ShopSlot[] = [...kept];
  const p = pool(run);
  while (shop.length < n) shop.push({ u: makeUnit(run, rng.pick(p).id), frozen: false });
  run.shop = shop;
  const fk = run.foods.filter((s): s is FoodSlot => !!s && s.frozen);
  const fp = FOODS.filter((f) => f.tier <= tierFor(run.round));
  const foods: FoodSlot[] = [...fk];
  while (foods.length < foodSize(run.round)) foods.push({ id: rng.pick(fp).id, frozen: false });
  run.foods = foods;
}

// ---------- Shop effect context ----------

class ShopCtx implements Ctx {
  readonly mode = 'shop' as const;
  arg: Unit | null = null;
  constructor(
    private run: RunState,
    readonly rng: Rng,
    readonly notes: Note[],
  ) {}

  friends(me: Unit): Unit[] {
    return this.run.team.filter((u) => u !== me);
  }
  foes(): Unit[] {
    return [];
  }
  ahead(me: Unit): Unit[] {
    const i = this.run.team.indexOf(me);
    return i < 0 ? [] : this.run.team.slice(0, i).reverse();
  }
  behind(me: Unit): Unit[] {
    const i = this.run.team.indexOf(me);
    return i < 0 ? [] : this.run.team.slice(i + 1);
  }
  buff(t: Unit, atk: number, hp: number): void {
    const a0 = t.atk;
    const h0 = t.hp;
    t.atk = Math.max(1, Math.min(MAX_STAT, t.atk + atk));
    t.hp = Math.max(1, Math.min(MAX_STAT, t.hp + hp));
    const da = t.atk - a0;
    const dh = t.hp - h0;
    if (da || dh) this.notes.push({ uid: t.uid, text: `+${da}/+${dh}`, color: '#7ee08a' });
  }
  hit(): void {}
  summon(): void {}
  givePerk(t: Unit, perk: PerkId): void {
    t.perk = perk;
  }
  gold(n: number): void {
    this.run.gold += n;
  }
  goldLeft(): number {
    return this.run.gold;
  }
  shopBuff(atk: number, hp: number): void {
    for (const s of this.run.shop) if (s) this.buff(s.u, atk, hp);
  }
  once(): boolean {
    return true;
  }
}

function fire(run: RunState, u: Unit, kind: Trigger, notes: Note[], arg: Unit | null = null): void {
  const d = CRITTERS[u.id];
  if (d.trigger !== kind) return;
  const c = new ShopCtx(run, rngFor(run, 'fx', run.round, run.uid, u.uid, kind), notes);
  c.arg = arg;
  notes.push({ uid: u.uid, text: `${d.icon}!`, color: '#ffb703' });
  d.fx(c, u, levelOf(u.xp));
}

// ---------- Shop actions (all return false when not allowed) ----------

export type Act =
  | { k: 'buy'; i: number; to?: number }
  | { k: 'food'; i: number; to?: number }
  | { k: 'sell'; i: number }
  | { k: 'move'; from: number; to: number }
  | { k: 'reroll' }
  | { k: 'freeze'; food: boolean; i: number };

export interface ActResult {
  ok: boolean;
  notes: Note[];
  msg?: string;
  levelUp?: boolean;
}

const fail = (msg: string): ActResult => ({ ok: false, notes: [], msg });

/** Merge `src` into `dst`. Returns true on a level up. */
function merge(run: RunState, dst: Unit, src: Unit, notes: Note[]): boolean {
  const before = levelOf(dst.xp);
  dst.atk = Math.min(MAX_STAT, Math.max(dst.atk, src.atk) + 1);
  dst.hp = Math.min(MAX_STAT, Math.max(dst.hp, src.hp) + 1);
  dst.xp = Math.min(5, dst.xp + 1 + src.xp);
  if (!dst.perk) dst.perk = src.perk;
  const up = levelOf(dst.xp) > before;
  notes.push({ uid: dst.uid, text: up ? 'LEVEL UP!' : '+1/+1', color: up ? '#ffd166' : '#7ee08a' });
  if (up) levelUpBonus(run, dst);
  return up;
}

/** A level up adds one critter of a higher tier to the shop. */
function levelUpBonus(run: RunState, u: Unit): void {
  const tier = Math.min(6, tierFor(run.round) + 1);
  const p = pool(run, tier).filter((c) => c.tier === tier);
  if (!p.length) return;
  const rng = rngFor(run, 'bonus', run.round, u.uid, u.xp);
  run.shop.push({ u: makeUnit(run, rng.pick(p).id), frozen: false, bonus: true });
}

export const canMerge = (a: Unit, b: Unit): boolean => a.id === b.id && a.uid !== b.uid && a.xp < 5;

export function apply(run: RunState, a: Act): ActResult {
  const notes: Note[] = [];
  switch (a.k) {
    case 'buy': {
      const s = run.shop[a.i];
      if (!s) return fail('That slot is empty.');
      if (run.gold < BUY_COST) return fail(`You need ${BUY_COST} gold.`);
      const at = a.to !== undefined ? run.team[a.to] : undefined;
      let target = at && canMerge(at, s.u) ? at : undefined;
      if (!target && a.to === undefined) target = run.team.find((u) => canMerge(u, s.u));
      if (target) {
        run.gold -= BUY_COST;
        run.shop[a.i] = null;
        const up = merge(run, target, s.u, notes);
        fire(run, target, 'buy', notes);
        return { ok: true, notes, levelUp: up };
      }
      if (run.team.length >= TEAM_SIZE) return fail('Your team is full. Sell a critter or merge.');
      run.gold -= BUY_COST;
      run.shop[a.i] = null;
      const u = s.u;
      const pos = a.to === undefined ? run.team.length : Math.min(a.to, run.team.length);
      run.team.splice(pos, 0, u);
      fire(run, u, 'buy', notes);
      for (const f of [...run.team]) if (f !== u) fire(run, f, 'summon', notes, u);
      return { ok: true, notes };
    }
    case 'food': {
      const s = run.foods[a.i];
      if (!s) return fail('That slot is empty.');
      const f = FOOD[s.id];
      if (run.gold < FOOD_COST) return fail(`You need ${FOOD_COST} gold.`);
      if (!run.team.length) return fail('Buy a critter first.');
      const t = a.to !== undefined ? run.team[a.to] : undefined;
      if (f.target && !t) return fail('Pick a critter to feed.');
      run.gold -= FOOD_COST;
      run.foods[a.i] = null;
      const c = new ShopCtx(run, rngFor(run, 'food', run.round, run.uid, a.i, run.gold), notes);
      let up = false;
      if (t) {
        if (f.perk) {
          t.perk = f.perk;
          notes.push({ uid: t.uid, text: f.icon });
        }
        if (f.id === 'apple') c.buff(t, 1, 1);
        if (f.id === 'pear') c.buff(t, 2, 2);
        if (f.id === 'choco' && t.xp < 5) {
          const before = levelOf(t.xp);
          t.xp++;
          up = levelOf(t.xp) > before;
          notes.push({ uid: t.uid, text: up ? 'LEVEL UP!' : '+1 xp', color: '#ffd166' });
          if (up) levelUpBonus(run, t);
        }
      } else {
        const n = f.id === 'sushi' ? 3 : 2;
        const v = f.id === 'sushi' ? 2 : 1;
        for (const u of c.rng.shuffle([...run.team]).slice(0, n)) c.buff(u, v, v);
      }
      return { ok: true, notes, levelUp: up };
    }
    case 'sell': {
      const u = run.team[a.i];
      if (!u) return fail('No critter there.');
      fire(run, u, 'sell', notes);
      run.team.splice(run.team.indexOf(u), 1);
      run.gold += levelOf(u.xp);
      return { ok: true, notes };
    }
    case 'move': {
      const u = run.team[a.from];
      if (!u || a.from === a.to) return fail('');
      const o = run.team[a.to];
      if (o && canMerge(o, u)) {
        run.team.splice(a.from, 1);
        const up = merge(run, o, u, notes);
        return { ok: true, notes, levelUp: up };
      }
      run.team.splice(a.from, 1);
      run.team.splice(Math.min(a.to, run.team.length), 0, u);
      return { ok: true, notes };
    }
    case 'reroll': {
      if (run.gold < REROLL_COST) return fail('You need 1 gold.');
      run.gold -= REROLL_COST;
      run.rolls++;
      run.shop = run.shop.filter((s) => s && (!s.bonus || s.frozen));
      fillShop(run, rngFor(run, 'shop', run.round, run.rolls));
      return { ok: true, notes };
    }
    case 'freeze': {
      const s = a.food ? run.foods[a.i] : run.shop[a.i];
      if (!s) return fail('');
      s.frozen = !s.frozen;
      return { ok: true, notes };
    }
  }
}

// ---------- End of turn and battle ----------

/** End-of-turn triggers, front to back. */
export function endTurnEffects(run: RunState): Note[] {
  const notes: Note[] = [];
  for (const u of [...run.team]) fire(run, u, 'endturn', notes);
  return notes;
}

export interface RoundReport {
  round: number;
  result: BattleResult;
  enemy: Unit[];
  champion: boolean;
  lost: number;
  team: Unit[];
}

export const isChampionRound = (run: RunState): boolean => run.trophies === WIN_TROPHIES - 1;

/** Fight this round's opponent, then move the run on to the next round. */
export function fightRound(run: RunState, oppBot: (r: RunState) => void): RoundReport {
  const champion = isChampionRound(run);
  const enemy = makeOpponent(run, oppBot, champion);
  const team = run.team.map((u) => ({ ...u }));
  const result = battle(team, enemy, hash(run.seed, 'battle', run.round));
  let lost = 0;
  if (result.outcome === 'win') {
    run.trophies++;
    run.history.push('W');
  } else if (result.outcome === 'loss') {
    lost = lifeLoss(run.round);
    run.lives = Math.max(0, run.lives - lost);
    run.history.push('L');
  } else run.history.push('D');
  const report: RoundReport = { round: run.round, result, enemy, champion, lost, team };
  run.round++;
  run.gold = START_GOLD;
  run.rolls = 0;
  run.shop = run.shop.filter((s) => s && s.frozen);
  fillShop(run, rngFor(run, 'shop', run.round, 0));
  return report;
}

export const runOver = (run: RunState): 'win' | 'loss' | null =>
  run.trophies >= WIN_TROPHIES ? 'win' : run.lives <= 0 ? 'loss' : null;

/** Champion teams get extra gold each round. */
export const CHAMPION_GOLD = 1;

/**
 * Build an opponent for this round: a bot plays its own shop from round 1
 * up to this round with the same gold per round.
 */
export function makeOpponent(run: RunState, oppBot: (r: RunState) => void, champion = false): Unit[] {
  const o = newRun(`${run.seed}|opp|${run.round}`, run.packs);
  for (let r = 1; r <= run.round; r++) {
    if (r > 1) {
      o.round = r;
      o.gold = START_GOLD;
      o.rolls = 0;
      o.shop = o.shop.filter((s) => s && s.frozen);
      fillShop(o, rngFor(o, 'shop', r, 0));
    }
    if (champion) o.gold += CHAMPION_GOLD;
    oppBot(o);
    endTurnEffects(o);
  }
  return o.team.map((u) => ({ ...u, uid: u.uid + 50000 }));
}

// ---------- Score and save data ----------

export function score(run: RunState, victory: boolean): number {
  const wins = run.history.filter((h) => h === 'W').length;
  return wins * 100 + (victory ? 500 + run.lives * 60 : 0) + Math.max(0, 30 - run.round) * (victory ? 10 : 0);
}

export const starsFor = (run: RunState, victory: boolean): number => run.trophies + (victory ? 5 : 0);

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
    if (run.v !== 1 || !Array.isArray(run.team) || run.team.some((u) => !CRITTERS[u.id])) return null;
    if (run.foods.some((f) => f && !FOOD[f.id])) return null;
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
  const base: Meta = { stars: 0, packs: ['meadow'], runs: 0, wins: 0, bestTrophies: 0, best: 0 };
  try {
    const m = { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
    m.packs = m.packs.filter((p) => PACKS.some((x) => x.id === p));
    if (!m.packs.includes('meadow')) m.packs.unshift('meadow');
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
