/**
 * Fight rules as pure functions. Every action takes a Fight and returns a new Fight
 * plus a list of events for the UI. The old Fight stays unchanged, so undo is a
 * matter of keeping the previous object.
 */
import {
  ABILITY_INFO,
  COLORS,
  ENEMIES,
  MANA_CAP,
  SPELLS,
  SUIT_COLOR,
  spellCost,
  type Ability,
  type Color,
  type Mana,
} from './data';
import { Rng, hash } from './rng';

export interface Card {
  id: number;
  rank: number;
  suit: number;
  up: boolean;
  /** Clears left until the lock opens. */
  lock?: number;
  armor?: number;
  /** Turns left until the bomb explodes. */
  bomb?: number;
  bombDmg?: number;
  gold?: number;
}

export interface SpellInst {
  id: string;
  lvl: number;
}

export interface Fight {
  seed: number;
  /** Counter for the action RNG. */
  n: number;
  nextId: number;
  enemy: string;
  act: number;
  cols: Card[][];
  stock: Card[];
  waste: Card[];
  wild: boolean;
  mana: Mana;
  shield: number;
  hp: number;
  maxHp: number;
  timers: number[];
  turn: number;
  streak: number;
  cleared: number;
  total: number;
  /** Draws left that give the enemy no turn. */
  free: number;
  gold: number;
  spells: SpellInst[];
  relics: string[];
  potions: string[];
  over: null | 'win' | 'lose' | 'dead';
}

export type Ev =
  | { k: 'clear'; id: number; color: Color; n: number; gold: number }
  | { k: 'armor'; id: number; ghost: number }
  | { k: 'flip'; id: number }
  | { k: 'unlock'; id: number }
  | { k: 'draw'; id: number; free: boolean }
  | { k: 'ability'; i: number; name: string; icon: string }
  | { k: 'burn'; n: number; blocked: number }
  | { k: 'hurt'; n: number; blocked: number }
  | { k: 'add'; ids: number[] }
  | { k: 'remove'; ids: number[] }
  | { k: 'morph'; id: number }
  | { k: 'bomb'; id: number; dmg: number }
  | { k: 'mana'; color: Color | 'all'; n: number }
  | { k: 'drain'; color: Color; n: number }
  | { k: 'heal'; n: number }
  | { k: 'shield'; n: number }
  | { k: 'stock'; n: number }
  | { k: 'cast'; id: string }
  | { k: 'potion'; id: string }
  | { k: 'win' };

export interface Result {
  f: Fight;
  ev: Ev[];
}

export interface HeroIn {
  hp: number;
  maxHp: number;
  deck: number;
  spells: SpellInst[];
  relics: string[];
  potions: string[];
}

const clone = (f: Fight): Fight => JSON.parse(JSON.stringify(f)) as Fight;
const has = (f: Fight, relic: string): boolean => f.relics.includes(relic);
const rngOf = (f: Fight): Rng => new Rng(hash(f.seed, 'act', f.n++));

export const LOCK_CLEARS = 3;
const lockValue = (f: Fight): number => Math.max(1, LOCK_CLEARS - (has(f, 'key') ? 2 : 0));
const randCard = (f: Fight, rng: Rng): Card => ({ id: f.nextId++, rank: rng.int(1, 13), suit: rng.int(0, 3), up: true });

export const abilities = (f: Fight): Ability[] => ENEMIES[f.enemy].abilities;
export const cur = (f: Fight): Card | undefined => f.waste[f.waste.length - 1];
export const top = (f: Fight, col: number): Card | undefined => f.cols[col]?.[f.cols[col].length - 1];
export const cardsLeft = (f: Fight): number => f.cols.reduce((a, c) => a + c.length, 0);

// ---------- Setup ----------

export function newFight(seed: number, enemy: string, act: number, hero: HeroIn): Fight {
  const def = ENEMIES[enemy];
  const rng = new Rng(seed);
  const f: Fight = {
    seed,
    n: 0,
    nextId: 1,
    enemy,
    act,
    cols: [],
    stock: [],
    waste: [],
    wild: false,
    mana: { r: 0, y: 0, g: 0, b: 0 },
    shield: 0,
    hp: hero.hp,
    maxHp: hero.maxHp,
    timers: def.abilities.map((a) => a.every + (hero.relics.includes('hourglass') ? 2 : 0)),
    turn: 0,
    streak: 0,
    cleared: 0,
    total: 0,
    free: 0,
    gold: 0,
    spells: hero.spells.map((s) => ({ ...s })),
    relics: [...hero.relics],
    potions: [...hero.potions],
    over: null,
  };
  const eye = has(f, 'eye');
  for (const depth of def.layout) {
    const col: Card[] = [];
    for (let i = 0; i < depth; i++) {
      const c = randCard(f, rng);
      c.up = eye || i === depth - 1 || !rng.chance(def.down);
      col.push(c);
    }
    f.cols.push(col);
  }
  const all = f.cols.flat();
  const mark = (n: number, fn: (c: Card) => void): void => rng.shuffle([...all]).slice(0, n).forEach(fn);
  mark(def.lock ?? 0, (c) => (c.lock = lockValue(f)));
  mark(def.armor ?? 0, (c) => {
    if (!c.lock) c.armor = 1;
  });
  mark(def.gold ?? 0, (c) => (c.gold = 4 + act * 2));
  f.total = all.length;
  const size = hero.deck + (has(f, 'extradeck') ? 4 : 0);
  for (let i = 0; i < size; i++) f.stock.push(randCard(f, rng));
  const first = f.stock.pop()!;
  f.waste.push(first);
  if (has(f, 'prismstone')) for (const c of COLORS) f.mana[c] = 1;
  if (has(f, 'helm')) f.shield = 3;
  if (has(f, 'coin')) f.free = 2;
  return f;
}

// ---------- Queries ----------

function dist(f: Fight, a: number, b: number): number {
  const d = Math.abs(a - b);
  return has(f, 'ouroboros') ? Math.min(d, 13 - d) : d;
}

export function matches(f: Fight, c: Card): boolean {
  const w = cur(f);
  if (!w) return false;
  return f.wild || dist(f, c.rank, w.rank) === 1;
}

export function canPlay(f: Fight, col: number): boolean {
  if (f.over) return false;
  const c = top(f, col);
  return !!c && !c.lock && matches(f, c);
}

export const plays = (f: Fight): number[] => f.cols.map((_, i) => i).filter((i) => canPlay(f, i));

export function affordable(f: Fight, cost: Partial<Mana>): boolean {
  return COLORS.every((c) => f.mana[c] >= (cost[c] ?? 0));
}

/** Columns a targeted spell can aim at. */
export function targets(f: Fight, spell: string): number[] {
  const w = cur(f);
  return f.cols
    .map((col, i) => {
      const t = col[col.length - 1];
      if (!t) return -1;
      if (spell === 'sleight' && t.lock) return -1;
      if (spell === 'longshot' && (t.lock || !w || dist(f, t.rank, w.rank) !== 2)) return -1;
      return i;
    })
    .filter((i) => i >= 0);
}

export function canCast(f: Fight, i: number): boolean {
  const s = f.spells[i];
  if (!s || f.over || !affordable(f, spellCost(s.id, s.lvl))) return false;
  const all = f.cols.flat();
  switch (s.id) {
    case 'joker':
      return !f.wild;
    case 'haste':
      return f.stock.length > 0;
    case 'sight':
      return all.some((c) => !c.up);
    case 'shatter':
      return all.some((c) => c.lock || c.armor || c.bomb);
    case 'rejuv':
      return f.hp < f.maxHp;
    default:
      return SPELLS[s.id].target !== 'top' || targets(f, s.id).length > 0;
  }
}

export function potionUsable(f: Fight, i: number): boolean {
  const p = f.potions[i];
  if (!p || f.over) return false;
  if (p === 'elixir') return f.hp < f.maxHp;
  if (p === 'wildpot') return !f.wild;
  return true;
}

/** No play, no stock, no spell and no potion: the fight is lost. */
export function stuck(f: Fight): boolean {
  if (f.over || f.stock.length > 0 || plays(f).length > 0) return false;
  return !f.spells.some((_, i) => canCast(f, i)) && !f.potions.some((_, i) => potionUsable(f, i));
}

// ---------- Helpers that change a cloned fight ----------

function addMana(f: Fight, c: Color, n: number): void {
  f.mana[c] = Math.min(MANA_CAP, f.mana[c] + n);
}

function revealTops(f: Fight, ev: Ev[]): void {
  for (const col of f.cols) {
    const t = col[col.length - 1];
    if (t && !t.up) {
      t.up = true;
      ev.push({ k: 'flip', id: t.id });
    }
  }
}

function checkWin(f: Fight, ev: Ev[]): void {
  if (!f.over && cardsLeft(f) === 0) {
    f.over = 'win';
    ev.push({ k: 'win' });
  }
}

function strip(c: Card): void {
  delete c.lock;
  delete c.armor;
  delete c.bomb;
  delete c.bombDmg;
  c.up = true;
}

/** Take a card off the table into the waste as the new current card. Gives mana. */
function clearInto(f: Fight, col: number, ev: Ev[]): void {
  const c = f.cols[col].pop()!;
  const gold = c.gold ?? 0;
  strip(c);
  delete c.gold;
  const color = SUIT_COLOR[c.suit];
  const n = has(f, 'well') && c.rank >= 11 ? 3 : 2;
  addMana(f, color, n);
  f.gold += gold;
  f.waste.push(c);
  f.wild = false;
  f.streak++;
  f.cleared++;
  ev.push({ k: 'clear', id: c.id, color, n, gold });
  if (has(f, 'streak') && f.streak % 6 === 0) {
    for (const k of COLORS) addMana(f, k, 1);
    ev.push({ k: 'mana', color: 'all', n: 1 });
  }
  for (const x of f.cols.flat()) {
    if (x.lock) {
      x.lock--;
      if (x.lock <= 0) {
        delete x.lock;
        ev.push({ k: 'unlock', id: x.id });
      }
    }
  }
  revealTops(f, ev);
  checkWin(f, ev);
}

/** Remove cards from the table without mana (spell damage). */
function removeCards(f: Fight, ids: number[], ev: Ev[]): void {
  if (!ids.length) return;
  const set = new Set(ids);
  f.cols = f.cols.map((col) => col.filter((c) => !set.has(c.id)));
  ev.push({ k: 'remove', ids });
  revealTops(f, ev);
  checkWin(f, ev);
}

function hurt(f: Fight, n: number, ev: Ev[]): void {
  const blocked = Math.min(f.shield, n);
  f.shield -= blocked;
  f.hp -= n - blocked;
  ev.push({ k: 'hurt', n: n - blocked, blocked });
  if (f.hp <= 0) f.over = 'dead';
}

/** Lose stock cards. Shield blocks first. With no stock left, the rest hits HP. */
function burn(f: Fight, n: number, ev: Ev[]): void {
  const blocked = Math.min(f.shield, n);
  f.shield -= blocked;
  const rest = n - blocked;
  const lost = Math.min(rest, f.stock.length);
  f.stock.splice(f.stock.length - lost, lost);
  ev.push({ k: 'burn', n: lost, blocked });
  if (rest > lost) hurt(f, rest - lost, ev);
}

function setCur(f: Fight, rank: number, ev: Ev[]): void {
  const w = f.waste.pop()!;
  const c: Card = { id: f.nextId++, rank, suit: w.suit, up: true };
  f.waste.push(c);
  f.wild = false;
  ev.push({ k: 'morph', id: c.id });
}

function drawInto(f: Fight, free: boolean, ev: Ev[]): boolean {
  const c = f.stock.pop();
  if (!c) return false;
  c.up = true;
  f.waste.push(c);
  f.wild = false;
  f.streak = 0;
  let enemy = !free;
  if (enemy && f.free > 0) {
    f.free--;
    enemy = false;
  }
  ev.push({ k: 'draw', id: c.id, free: !enemy });
  return enemy;
}

// ---------- Actions ----------

/** Play the top card of a column onto the waste. */
export function play(f0: Fight, col: number): Result {
  if (!canPlay(f0, col)) return { f: f0, ev: [] };
  const f = clone(f0);
  const ev: Ev[] = [];
  const c = top(f, col)!;
  if (c.armor && !has(f, 'pickaxe')) {
    delete c.armor;
    const ghost: Card = { id: f.nextId++, rank: c.rank, suit: c.suit, up: true };
    f.waste.push(ghost);
    f.wild = false;
    f.streak++;
    ev.push({ k: 'armor', id: c.id, ghost: ghost.id });
    return { f, ev };
  }
  clearInto(f, col, ev);
  return { f, ev };
}

/** Draw from the stock. `enemy` says if the enemy gets a turn next. */
export function draw(f0: Fight): Result & { enemy: boolean } {
  if (f0.over || !f0.stock.length) return { f: f0, ev: [], enemy: false };
  const f = clone(f0);
  const ev: Ev[] = [];
  const enemy = drawInto(f, false, ev);
  return { f, ev, enemy };
}

/** Strikes and bombs get +2 per act, wounds +1 per act. */
export const power = (f: Fight, a: Ability): number => a.n + (a.k === 'strike' || a.k === 'bomb' ? 2 * f.act : a.k === 'wound' ? f.act : 0);

function fire(f: Fight, a0: Ability, ev: Ev[]): void {
  const rng = rngOf(f);
  const a = { ...a0, n: power(f, a0) };
  const tops = (): Card[] => f.cols.map((c) => c[c.length - 1]).filter((c): c is Card => !!c);
  switch (a.k) {
    case 'strike':
      burn(f, a.n, ev);
      if (has(f, 'cactus')) {
        const t = tops();
        if (t.length) removeCards(f, [rng.pick(t).id], ev);
      }
      break;
    case 'wound':
      hurt(f, a.n, ev);
      break;
    case 'lock':
      for (const c of rng.shuffle(f.cols.flat().filter((c) => !c.lock)).slice(0, a.n)) {
        delete c.armor;
        c.lock = lockValue(f);
      }
      break;
    case 'armor':
      for (const c of rng.shuffle(tops().filter((c) => !c.armor && !c.lock)).slice(0, a.n)) c.armor = 1;
      break;
    case 'grow': {
      const ids: number[] = [];
      for (let i = 0; i < a.n; i++) {
        const c = randCard(f, rng);
        f.cols[rng.int(0, f.cols.length - 1)].push(c);
        ids.push(c.id);
      }
      ev.push({ k: 'add', ids });
      break;
    }
    case 'bomb': {
      const t = tops().filter((c) => !c.bomb);
      if (t.length) {
        const c = rng.pick(t);
        c.bomb = 3;
        c.bombDmg = a.n;
      }
      break;
    }
    case 'drain': {
      const color = COLORS.reduce((b, c) => (f.mana[c] > f.mana[b] ? c : b), 'r' as Color);
      const n = Math.min(a.n, f.mana[color]);
      f.mana[color] -= n;
      ev.push({ k: 'drain', color, n });
      break;
    }
    case 'hex': {
      const w = cur(f);
      if (w) {
        let r = rng.int(1, 12);
        if (r >= w.rank) r++;
        setCur(f, r, ev);
      }
      break;
    }
  }
}

/** The enemy acts: timers tick, abilities fire, bombs count down. */
export function enemyTurn(f0: Fight): Result {
  if (f0.over) return { f: f0, ev: [] };
  const f = clone(f0);
  const ev: Ev[] = [];
  f.turn++;
  abilities(f).forEach((a, i) => {
    if (f.over) return;
    f.timers[i]--;
    if (f.timers[i] <= 0) {
      f.timers[i] = a.every;
      ev.push({ k: 'ability', i, name: ABILITY_INFO[a.k].name, icon: ABILITY_INFO[a.k].icon });
      fire(f, a, ev);
    }
  });
  for (const c of f.cols.flat()) {
    if (f.over) break;
    if (c.bomb) {
      c.bomb--;
      if (c.bomb <= 0) {
        const dmg = has(f, 'blast') ? Math.ceil((c.bombDmg ?? 0) / 2) : (c.bombDmg ?? 0);
        delete c.bomb;
        delete c.bombDmg;
        ev.push({ k: 'bomb', id: c.id, dmg });
        burn(f, dmg, ev);
      }
    }
  }
  return { f, ev };
}

export function cast(f0: Fight, i: number, target = 0): Result {
  if (!canCast(f0, i)) return { f: f0, ev: [] };
  const id = f0.spells[i].id;
  if (SPELLS[id].target === 'top' && !targets(f0, id).includes(target)) return { f: f0, ev: [] };
  const f = clone(f0);
  const ev: Ev[] = [{ k: 'cast', id }];
  const cost = spellCost(id, f.spells[i].lvl);
  for (const c of COLORS) f.mana[c] -= cost[c] ?? 0;
  const all = f.cols.flat();
  switch (id) {
    case 'nudge': {
      const w = cur(f)!;
      const r = w.rank + (target < 0 ? -1 : 1);
      setCur(f, r > 13 ? 1 : r < 1 ? 13 : r, ev);
      break;
    }
    case 'joker':
      f.wild = true;
      break;
    case 'fireball':
      removeCards(f, [top(f, target)!.id], ev);
      break;
    case 'cleave':
      removeCards(f, f.cols[target].slice(-2).map((c) => c.id), ev);
      break;
    case 'quake': {
      const rng = rngOf(f);
      const cols = rng.shuffle(f.cols.map((_, k) => k).filter((k) => f.cols[k].length)).slice(0, 3);
      removeCards(f, cols.map((k) => top(f, k)!.id), ev);
      break;
    }
    case 'meteor': {
      const rng = rngOf(f);
      removeCards(f, rng.shuffle([...all]).slice(0, 5).map((c) => c.id), ev);
      break;
    }
    case 'sight':
      for (const c of all) {
        if (!c.up) {
          c.up = true;
          ev.push({ k: 'flip', id: c.id });
        }
      }
      break;
    case 'shatter':
      for (const c of all) {
        delete c.lock;
        delete c.armor;
        delete c.bomb;
        delete c.bombDmg;
      }
      break;
    case 'bulwark':
      f.shield += 4;
      ev.push({ k: 'shield', n: 4 });
      break;
    case 'mend': {
      const rng = rngOf(f);
      for (let k = 0; k < 3; k++) f.stock.unshift(randCard(f, rng));
      ev.push({ k: 'stock', n: 3 });
      break;
    }
    case 'rejuv': {
      const n = Math.min(5, f.maxHp - f.hp);
      f.hp += n;
      ev.push({ k: 'heal', n });
      break;
    }
    case 'haste':
      drawInto(f, true, ev);
      break;
    case 'smoke':
      f.free += 2;
      break;
    case 'frost':
      f.timers = f.timers.map((t) => t + 2);
      for (const c of all) if (c.bomb) c.bomb += 2;
      break;
    case 'sleight': {
      const t = f.cols[target].pop()!;
      const w = f.waste.pop()!;
      strip(t);
      w.up = true;
      f.cols[target].push(w);
      f.waste.push(t);
      f.wild = false;
      ev.push({ k: 'morph', id: t.id });
      break;
    }
    case 'prism':
      for (const c of ['r', 'y', 'b'] as Color[]) addMana(f, c, 1);
      ev.push({ k: 'mana', color: 'all', n: 1 });
      break;
    case 'longshot':
      clearInto(f, target, ev);
      break;
  }
  return { f, ev };
}

export function usePotion(f0: Fight, i: number): Result {
  if (!potionUsable(f0, i)) return { f: f0, ev: [] };
  const f = clone(f0);
  const ev: Ev[] = [];
  const [p] = f.potions.splice(i, 1);
  ev.push({ k: 'potion', id: p });
  if (p === 'elixir') {
    const n = Math.min(10, f.maxHp - f.hp);
    f.hp += n;
    ev.push({ k: 'heal', n });
  } else if (p === 'pack') {
    const rng = rngOf(f);
    for (let k = 0; k < 5; k++) f.stock.unshift(randCard(f, rng));
    ev.push({ k: 'stock', n: 5 });
  } else if (p === 'flask') {
    for (const c of COLORS) addMana(f, c, 2);
    ev.push({ k: 'mana', color: 'all', n: 2 });
  } else if (p === 'wildpot') {
    f.wild = true;
  }
  return { f, ev };
}

export function concede(f0: Fight): Fight {
  return { ...clone(f0), over: 'lose' };
}

/** HP lost when you run out of cards: 3, plus 2 per act, plus 1 per card left. */
export const lossDamage = (f: Fight): number => 3 + f.act * 2 + cardsLeft(f);
