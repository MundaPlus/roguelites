/** Pure fight logic: the letter grid, words, damage, enemy turns and potions. */
import { ATK_SCALE, BOOKS, ENEMIES, GEMS, HP_SCALE, LETTERS, POTIONS, VALUE, VOWELS, WEIGHT, lengthMult, type EnemyDef, type GemId, type PotionId } from './data';
import { isWord, spell } from './dict';
import { Rng, hash } from './rng';

export const GRID = 16;
export const MIN_VOWELS = 5;
export const MAX_VOWELS = 7;

export interface Tile {
  id: number;
  ch: string;
  gem?: GemId;
  /** Turns left until the tile unlocks. */
  lock?: number;
  crack?: boolean;
  poison?: boolean;
}

export interface Hero {
  hp: number;
  maxHp: number;
  gold: number;
  books: string[];
  gems: GemId[];
  potions: PotionId[];
  slots: number;
}

export type FightKind = 'fight' | 'elite' | 'boss';

export interface EnemyInst {
  uid: number;
  id: string;
  hp: number;
  max: number;
  atk: number;
  /** Turns until the next attack. */
  wait: number;
  block: number;
  poison: number;
}

export interface Fight {
  kind: FightKind;
  chapter: number;
  seed: number;
  rolls: number;
  turn: number;
  enemies: EnemyInst[];
  grid: Tile[];
  nextId: number;
  block: number;
  target: number;
  words: number;
  lastWord: string;
  muse: boolean;
  /** Stats for the score. */
  best: number;
  longest: string;
  kills: number;
}

/** Visual effects that the app plays after an action. */
export type Fx =
  | { k: 'hit'; uid: number; n: number }
  | { k: 'kill'; uid: number }
  | { k: 'heal'; n: number }
  | { k: 'block'; n: number }
  | { k: 'gold'; n: number }
  | { k: 'hurt'; n: number }
  | { k: 'eattack'; uid: number; n: number }
  | { k: 'eheal'; uid: number; n: number }
  | { k: 'eblock'; uid: number; n: number }
  | { k: 'epoison'; uid: number; n: number }
  | { k: 'msg'; text: string };

export const has = (h: Hero, book: string): boolean => h.books.includes(book);
export const def = (e: EnemyInst): EnemyDef => ENEMIES[e.id];
export const alive = (f: Fight): EnemyInst[] => f.enemies.filter((e) => e.hp > 0);
export const usable = (t: Tile): boolean => !t.lock;
export const isVowel = (c: string): boolean => VOWELS.includes(c);
/** Letters a tile adds to the word ("Qu" adds 2). */
export const tileLen = (t: Tile): number => (t.ch === 'q' ? 2 : 1);

function rng(f: Fight): Rng {
  return new Rng(hash(f.seed, f.rolls++));
}

/** Draw one letter for the grid, keeping 5–8 vowels and few duplicates. */
function drawLetter(r: Rng, others: string[]): string {
  const vowels = others.filter(isVowel).length;
  const pool = LETTERS.split('').filter((c) => {
    if (vowels < MIN_VOWELS && !isVowel(c)) return false;
    if (vowels >= MAX_VOWELS && isVowel(c)) return false;
    const same = others.filter((o) => o === c).length;
    return same < (VALUE[c] >= 3 ? 1 : c === 'e' ? 3 : 2);
  });
  return r.weighted(pool.map((c) => [c, WEIGHT[c]] as const));
}

function gemRate(h: Hero): number {
  return Math.min(0.25, 0.03 * h.gems.length * (has(h, 'satchel') ? 2 : 1));
}

function newTile(f: Fight, h: Hero, r: Rng, others: string[]): Tile {
  const t: Tile = { id: f.nextId++, ch: drawLetter(r, others) };
  if (h.gems.length && r.chance(gemRate(h))) t.gem = r.pick(h.gems);
  return t;
}

export function newFight(h: Hero, chapter: number, kind: FightKind, ids: string[], seed: number): Fight {
  const f: Fight = {
    kind,
    chapter,
    seed,
    rolls: 0,
    turn: 0,
    enemies: [],
    grid: [],
    nextId: 1,
    block: has(h, 'iron') ? 8 : 0,
    target: 0,
    words: 0,
    lastWord: '',
    muse: false,
    best: 0,
    longest: '',
    kills: 0,
  };
  const late = has(h, 'ink') ? 1 : 0;
  f.enemies = ids.map((id, i) => {
    const d = ENEMIES[id];
    const max = Math.round(d.hp * HP_SCALE[chapter]);
    return { uid: i + 1, id, hp: max, max, atk: Math.round(d.atk * ATK_SCALE[chapter]), wait: d.timer + late + (i > 0 ? 1 : 0), block: 0, poison: 0 };
  });
  f.target = f.enemies[0].uid;
  const r = rng(f);
  for (let i = 0; i < GRID; i++) f.grid.push(newTile(f, h, r, f.grid.map((t) => t.ch)));
  // Each gem you own puts one gem tile on the first grid (at most 3).
  const free = r.shuffle(f.grid.filter((t) => !t.gem));
  const start = r.shuffle([...h.gems]).slice(0, 3);
  start.forEach((g, i) => {
    if (free[i]) free[i].gem = g;
  });
  return f;
}

export function targetOf(f: Fight): EnemyInst | undefined {
  return f.enemies.find((e) => e.uid === f.target && e.hp > 0) ?? alive(f)[0];
}

// ---------- Words and damage ----------

export interface Preview {
  word: string;
  len: number;
  valid: boolean;
  reason: string;
  dmg: number;
  heal: number;
  block: number;
  gold: number;
  poison: number;
  delay: number;
  notes: string[];
}

export function tileValue(h: Hero, t: Tile): number {
  if (t.crack) return 0;
  let v = VALUE[t.ch];
  if (has(h, 'vowel') && isVowel(t.ch)) v += 1;
  if (has(h, 'scholar') && VALUE[t.ch] >= 3) v += 2;
  return v;
}

export function preview(h: Hero, f: Fight, sel: number[]): Preview {
  const tiles = sel.map((i) => f.grid[i]);
  const word = spell(tiles.map((t) => t.ch));
  const len = word.length;
  const p: Preview = { word, len, valid: false, reason: '', dmg: 0, heal: 0, block: 0, gold: 0, poison: 0, delay: 0, notes: [] };
  if (len < 3) {
    p.reason = len ? 'Too short' : '';
  } else if (!isWord(word)) {
    p.reason = 'Not a word';
  } else p.valid = true;
  const base = tiles.reduce((a, t) => a + tileValue(h, t), 0);
  let flat = 0;
  let mult = 1;
  let gemMult = 1;
  for (const t of tiles) {
    switch (t.gem) {
      case 'ruby':
        flat += 5;
        break;
      case 'emerald':
        p.heal += 4;
        break;
      case 'sapphire':
        p.block += 6;
        break;
      case 'amethyst':
        gemMult += 0.5;
        break;
      case 'topaz':
        p.gold += 5;
        break;
      case 'onyx':
        p.delay += 1;
        break;
      case 'jade':
        p.poison += 4;
        break;
      case 'diamond':
        gemMult += 1;
        break;
    }
  }
  mult *= gemMult;
  if (has(h, 'short') && len >= 3 && len <= 4) {
    flat += 4;
    p.notes.push('✏️ +4');
  }
  if (has(h, 'double') && /(.)\1/.test(word)) {
    flat += 6;
    p.notes.push('👯 +6');
  }
  if (has(h, 'atlas') && /[jqxz]/.test(word)) {
    mult *= 2;
    p.notes.push('🗺️ ×2');
  }
  if (has(h, 'long') && len >= 6) {
    mult *= 1.5;
    p.notes.push('📜 ×1.5');
  }
  if (has(h, 'echo') && f.lastWord && word[0] === f.lastWord[f.lastWord.length - 1]) {
    mult *= 1.5;
    p.notes.push('🔔 ×1.5');
  }
  if (f.muse) {
    mult *= 2;
    p.notes.push('✨ ×2');
  }
  p.dmg = len >= 3 ? Math.round((base * lengthMult(len) + flat) * mult) : 0;
  if (has(h, 'herbal') && len >= 5) p.heal += 2;
  if (has(h, 'vamp')) p.heal += Math.floor(p.dmg / 8);
  return p;
}

function damageEnemy(f: Fight, e: EnemyInst, n: number, fx: Fx[]): number {
  const blocked = Math.min(e.block, n);
  e.block -= blocked;
  const dealt = Math.min(e.hp, n - blocked);
  e.hp -= dealt;
  fx.push({ k: 'hit', uid: e.uid, n: n - blocked });
  if (e.hp <= 0) {
    fx.push({ k: 'kill', uid: e.uid });
    f.kills++;
  }
  return n - blocked - dealt;
}

function healHero(h: Hero, n: number, fx: Fx[]): void {
  const got = Math.min(n, h.maxHp - h.hp);
  if (got <= 0) return;
  h.hp += got;
  fx.push({ k: 'heal', n: got });
}

/** Replace the tiles at these grid indexes with new draws. */
function refill(h: Hero, f: Fight, idx: number[]): void {
  const r = rng(f);
  const set = new Set(idx);
  for (const i of idx) {
    const others = f.grid.filter((_, j) => !set.has(j)).map((t) => t.ch);
    f.grid[i] = newTile(f, h, r, others);
    set.delete(i);
  }
}

/** Play the selected tiles as a word. Returns the effects and whether the turn is free. */
export function playWord(h: Hero, f: Fight, sel: number[]): { fx: Fx[]; free: boolean } | null {
  if (sel.some((i) => !f.grid[i] || !usable(f.grid[i])) || new Set(sel).size !== sel.length) return null;
  const p = preview(h, f, sel);
  if (!p.valid) return null;
  const fx: Fx[] = [];
  let t = targetOf(f);
  if (!t) return null;
  let left = damageEnemy(f, t, p.dmg, fx);
  if (has(h, 'ricochet')) {
    while (left > 0 && (t = alive(f)[0])) left = damageEnemy(f, t, left, fx);
  }
  t = targetOf(f);
  if (p.poison && t) {
    t.poison += p.poison;
    fx.push({ k: 'epoison', uid: t.uid, n: p.poison });
  }
  if (p.delay && t) t.wait += p.delay;
  if (p.heal) healHero(h, p.heal, fx);
  if (p.block) {
    f.block += p.block;
    fx.push({ k: 'block', n: p.block });
  }
  if (p.gold) {
    h.gold += p.gold;
    fx.push({ k: 'gold', n: p.gold });
  }
  f.best = Math.max(f.best, p.dmg);
  if (p.word.length > f.longest.length) f.longest = p.word;
  f.muse = false;
  f.lastWord = p.word;
  const free = f.words === 0 && has(h, 'first');
  f.words++;
  refill(h, f, sel);
  return { fx, free };
}

/** New letters for every unlocked tile. Specials stay. */
export function scramble(h: Hero, f: Fight): boolean {
  const r = rng(f);
  const idx = f.grid.map((_, i) => i).filter((i) => usable(f.grid[i]));
  for (const i of idx) f.grid[i] = { ...f.grid[i], id: f.nextId++, ch: '' };
  for (const i of idx) f.grid[i].ch = drawLetter(r, f.grid.filter((t) => t.ch).map((t) => t.ch));
  return has(h, 'shuffle');
}

// ---------- Enemy turn ----------

function pickTiles(f: Fight, r: Rng, n: number, ok: (t: Tile) => boolean): Tile[] {
  return r.shuffle(f.grid.filter(ok)).slice(0, n);
}

function ability(h: Hero, f: Fight, e: EnemyInst, fx: Fx[]): void {
  const d = def(e);
  const r = rng(f);
  switch (d.ability) {
    case 'lock':
      for (const t of pickTiles(f, r, d.n, (t) => !t.lock)) t.lock = 3;
      fx.push({ k: 'msg', text: `${d.icon} locks ${d.n} tiles` });
      break;
    case 'poison':
      for (const t of pickTiles(f, r, d.n, (t) => !t.poison && !t.lock)) t.poison = true;
      fx.push({ k: 'msg', text: `${d.icon} poisons ${d.n} tiles` });
      break;
    case 'crack':
      for (const t of pickTiles(f, r, d.n, (t) => !t.crack && !t.lock)) t.crack = true;
      fx.push({ k: 'msg', text: `${d.icon} cracks ${d.n} tiles` });
      break;
    case 'scramble':
      scramble(h, f);
      if (d.n) for (const t of pickTiles(f, r, d.n, (t) => !t.lock)) t.lock = 3;
      fx.push({ k: 'msg', text: `${d.icon} scrambles the grid` });
      break;
    case 'steal':
      for (const t of pickTiles(f, r, d.n, (t) => isVowel(t.ch) && !t.lock)) t.ch = r.pick(['j', 'x', 'z', 'k', 'v', 'w']);
      fx.push({ k: 'msg', text: `${d.icon} steals ${d.n} vowels` });
      break;
    case 'shield':
      e.block += d.n;
      fx.push({ k: 'eblock', uid: e.uid, n: d.n });
      break;
    case 'heal':
      for (const o of alive(f)) {
        const n = Math.min(d.n, o.max - o.hp);
        if (n > 0) {
          o.hp += n;
          fx.push({ k: 'eheal', uid: o.uid, n });
        }
      }
      break;
    case 'enrage':
      e.atk += d.n;
      break;
    default:
      break;
  }
}

function hurtHero(h: Hero, f: Fight, n: number, fx: Fx[]): number {
  const blocked = Math.min(f.block, n);
  f.block -= blocked;
  const dealt = n - blocked;
  h.hp -= dealt;
  fx.push({ k: 'hurt', n: dealt });
  return dealt;
}

/** The enemies act after a word or a scramble. */
export function enemyTurn(h: Hero, f: Fight): Fx[] {
  const fx: Fx[] = [];
  f.turn++;
  for (const e of alive(f)) {
    if (e.poison > 0) {
      damageEnemy(f, e, e.poison, fx);
      e.poison--;
    }
  }
  const bad = f.grid.filter((t) => t.poison).length;
  if (bad) hurtHero(h, f, bad, fx);
  for (const t of f.grid) {
    if (t.lock && --t.lock <= 0) delete t.lock;
  }
  for (const e of alive(f)) {
    if (h.hp <= 0) break;
    e.wait--;
    if (e.wait > 0) continue;
    e.wait = def(e).timer;
    fx.push({ k: 'eattack', uid: e.uid, n: e.atk });
    const dealt = hurtHero(h, f, e.atk, fx);
    if (def(e).ability === 'drain' && dealt > 0) {
      const n = Math.min(dealt, e.max - e.hp);
      if (n > 0) {
        e.hp += n;
        fx.push({ k: 'eheal', uid: e.uid, n });
      }
    }
    if (has(h, 'thorn')) damageEnemy(f, e, 3, fx);
    if (e.hp > 0) ability(h, f, e, fx);
  }
  return fx;
}

// ---------- Potions ----------

export function usePotion(h: Hero, f: Fight, i: number): Fx[] | null {
  const id = h.potions[i];
  if (!id) return null;
  const fx: Fx[] = [];
  const t = targetOf(f);
  switch (id) {
    case 'heal':
      if (h.hp >= h.maxHp) return null;
      healHero(h, 20, fx);
      break;
    case 'fire':
      if (!t) return null;
      damageEnemy(f, t, 20, fx);
      break;
    case 'water':
      for (const tile of f.grid) {
        delete tile.lock;
        delete tile.crack;
        delete tile.poison;
      }
      fx.push({ k: 'msg', text: '💧 The grid is clean' });
      break;
    case 'time':
      for (const e of alive(f)) e.wait += 2;
      fx.push({ k: 'msg', text: '⏳ Enemies slow down' });
      break;
    case 'muse':
      if (f.muse) return null;
      f.muse = true;
      fx.push({ k: 'msg', text: '✨ Next word ×2' });
      break;
  }
  h.potions.splice(i, 1);
  return fx;
}

export function fightResult(h: Hero, f: Fight): 'win' | 'lose' | null {
  if (h.hp <= 0) return 'lose';
  if (!alive(f).length) return 'win';
  return null;
}

// ---------- Tile choice ----------

/** Rank of a tile when the player types its letter: gems first, cracked last. */
function tileRank(t: Tile): number {
  if (t.gem) return 0;
  if (t.poison) return 1;
  if (t.crack) return 3;
  return 2;
}

/** The best free tile for a letter, or -1. */
export function tileFor(f: Fight, ch: string, taken: number[]): number {
  let best = -1;
  for (let i = 0; i < f.grid.length; i++) {
    const t = f.grid[i];
    if (t.ch !== ch || !usable(t) || taken.includes(i)) continue;
    if (best < 0 || tileRank(t) < tileRank(f.grid[best])) best = i;
  }
  return best;
}

/** Tiles for a token string ("q" = Qu), or null. */
export function tilesFor(f: Fight, tokens: string): number[] | null {
  const sel: number[] = [];
  for (const c of tokens) {
    const i = tileFor(f, c, sel);
    if (i < 0) return null;
    sel.push(i);
  }
  return sel;
}

export const potionInfo = (id: PotionId): string => `${POTIONS[id].icon} ${POTIONS[id].name}: ${POTIONS[id].text}`;
export const gemInfo = (id: GemId): string => `${GEMS[id].icon} ${GEMS[id].name}: ${GEMS[id].text}`;
export const bookInfo = (id: string): string => `${BOOKS[id].icon} ${BOOKS[id].name}: ${BOOKS[id].text}`;
