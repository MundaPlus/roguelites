/** Floor state and the beat rules. Pure logic: no DOM, no audio. */
import { DX, DY, ENEMIES, ITEMS, SHAPES, SPELL_CHARGE, WEAPONS, type EnemyDef } from './data';

export const FLOOR = 0;
export const DIRT = 1;
export const STONE = 2;
export const ROCK = 3;
export const GOLDV = 4;
export const GEMW = 5;

export interface Hero {
  char: string;
  hp: number;
  maxHp: number;
  gold: number;
  diamonds: number;
  weapon: string;
  whet: number;
  /** 0 none, 1 leather, 2 chainmail, 3 plate. */
  armor: number;
  /** 0 none, 1 torch, 2 lantern. */
  torch: number;
  bombs: number;
  spell: string | null;
  charge: number;
  rings: string[];
  pick: boolean;
  kills: number;
  goldEarned: number;
}

export interface Enemy {
  uid: number;
  id: string;
  x: number;
  y: number;
  hp: number;
  max: number;
  /** Beats left until the next action. 0 means it acts on the next beat. */
  cd: number;
  dir: number;
  /** Charge direction, -1 when not aiming. */
  aim: number;
  stun: number;
  summonCd: number;
  slamCd: number;
  hitAt: number;
}

export interface Pedestal {
  x: number;
  y: number;
  item: string;
  cost: number;
  sold: boolean;
}

export interface World {
  zone: number;
  floor: number;
  boss: boolean;
  w: number;
  h: number;
  tiles: number[];
  seen: number[];
  px: number;
  py: number;
  face: number;
  hero: Hero;
  enemies: Enemy[];
  gold: { x: number; y: number; n: number }[];
  chests: { x: number; y: number; item: string }[];
  shop: Pedestal[];
  keeper: { x: number; y: number } | null;
  stairs: { x: number; y: number };
  locked: boolean;
  stairsShown: boolean;
  bombs: { x: number; y: number; t: number }[];
  danger: { x: number; y: number; at: number; dmg: number }[];
  beat: number;
  mult: number;
  rng: number;
  uid: number;
  frozen: number;
  shieldUsed: boolean;
  exit: boolean;
  dead: boolean;
  won: boolean;
  missed: number;
  onBeat: number;
  lockMsg: boolean;
}

export type Action = { kind: 'move'; dir: number } | { kind: 'bomb' } | { kind: 'spell' } | { kind: 'none' };

export type Ev =
  | { t: 'float'; x: number; y: number; text: string; color: string }
  | { t: 'sfx'; s: string }
  | { t: 'shake'; n: number }
  | { t: 'boom'; x: number; y: number }
  | { t: 'msg'; text: string }
  | { t: 'slash'; x: number; y: number };

export const edef = (e: Enemy): EnemyDef => ENEMIES[e.id];

export function rand(w: World): number {
  w.rng = (w.rng + 0x6d2b79f5) | 0;
  let t = w.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function tile(w: World, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w.w || y >= w.h) return ROCK;
  return w.tiles[y * w.w + x];
}

export function setTile(w: World, x: number, y: number, t: number): void {
  if (x < 0 || y < 0 || x >= w.w || y >= w.h) return;
  w.tiles[y * w.w + x] = t;
}

export const enemyAt = (w: World, x: number, y: number): Enemy | undefined => w.enemies.find((e) => e.x === x && e.y === y);
const pedAt = (w: World, x: number, y: number): Pedestal | undefined => w.shop.find((p) => p.x === x && p.y === y && !p.sold);
const chestAt = (w: World, x: number, y: number) => w.chests.find((c) => c.x === x && c.y === y);
const isKeeper = (w: World, x: number, y: number): boolean => !!w.keeper && w.keeper.x === x && w.keeper.y === y;

/** True when an enemy may step on this tile. */
export function freeForEnemy(w: World, x: number, y: number): boolean {
  if (tile(w, x, y) !== FLOOR) return false;
  if (x === w.px && y === w.py) return false;
  if (enemyAt(w, x, y) || isKeeper(w, x, y) || pedAt(w, x, y) || chestAt(w, x, y)) return false;
  return true;
}

export const multCap = (h: Hero): number => 3 + h.rings.filter((r) => r === 'ring_gold').length;
export const weaponDmg = (h: Hero): number => WEAPONS[h.weapon].dmg + h.whet;
export const lightRadius = (h: Hero): number => 3.6 + h.torch * 2;
export const spellReady = (h: Hero): boolean => !!h.spell && h.charge >= SPELL_CHARGE[h.spell];
/** The enemy acts on the next beat. Used for the flash and by the bot. */
export const isReady = (w: World, e: Enemy): boolean => w.frozen === 0 && e.stun === 0 && e.cd === 0;

export function rot(ox: number, oy: number, dir: number): [number, number] {
  switch (dir) {
    case 1:
      return [-oy, ox];
    case 2:
      return [-ox, -oy];
    case 3:
      return [oy, -ox];
    default:
      return [ox, oy];
  }
}

export function cloneWorld(w: World): World {
  return {
    ...w,
    tiles: w.tiles.slice(),
    seen: w.seen,
    hero: { ...w.hero, rings: w.hero.rings.slice() },
    enemies: w.enemies.map((e) => ({ ...e })),
    gold: w.gold.map((g) => ({ ...g })),
    chests: w.chests.slice(),
    shop: w.shop.map((p) => ({ ...p })),
    bombs: w.bombs.map((b) => ({ ...b })),
    danger: w.danger.slice(),
  };
}

/** Item effects. Used by shop pedestals, chests and zone rewards. */
export function giveItem(h: Hero, id: string): void {
  const it = ITEMS[id];
  switch (it.kind) {
    case 'weapon':
      h.weapon = it.v as string;
      break;
    case 'armor':
      h.armor = Math.max(h.armor, it.v as number);
      break;
    case 'torch':
      h.torch = Math.max(h.torch, it.v as number);
      break;
    case 'bombs':
      h.bombs += it.v as number;
      break;
    case 'spell':
      h.spell = id;
      h.charge = SPELL_CHARGE[id];
      break;
    case 'ring':
      h.rings.push(id);
      break;
    case 'food':
      h.hp = Math.min(h.maxHp, h.hp + (it.v as number));
      break;
    case 'heart':
      h.maxHp++;
      h.hp++;
      break;
    case 'whet':
      h.whet++;
      break;
    case 'pick':
      h.pick = true;
      break;
  }
}

function hurtPlayer(w: World, dmg: number, ev: Ev[]): void {
  const h = w.hero;
  if ((h.armor === 1 || h.armor === 3) && !w.shieldUsed) {
    w.shieldUsed = true;
    ev.push({ t: 'float', x: w.px, y: w.py, text: 'Blocked', color: '#8ecae6' }, { t: 'sfx', s: 'shield' });
    return;
  }
  if (h.armor >= 2 && dmg >= 2) dmg--;
  h.hp -= dmg;
  if (w.mult > 1) ev.push({ t: 'msg', text: 'Multiplier lost' });
  w.mult = 1;
  ev.push({ t: 'float', x: w.px, y: w.py, text: `-${dmg}`, color: '#ff4d6d' }, { t: 'sfx', s: 'hurt' }, { t: 'shake', n: 6 + dmg * 2 });
  if (h.hp <= 0) {
    h.hp = 0;
    w.dead = true;
  }
}

function dropGold(w: World, x: number, y: number, n: number): void {
  const g = w.gold.find((p) => p.x === x && p.y === y);
  if (g) g.n += n;
  else w.gold.push({ x, y, n });
}

function killEnemy(w: World, e: Enemy, ev: Ev[]): void {
  const d = edef(e);
  w.enemies = w.enemies.filter((x) => x !== e);
  const h = w.hero;
  const luck = h.rings.filter((r) => r === 'ring_luck').length * 2;
  dropGold(w, e.x, e.y, d.gold * w.mult + luck);
  h.kills++;
  h.charge++;
  if (w.mult < multCap(h)) {
    w.mult++;
    ev.push({ t: 'float', x: w.px, y: w.py - 0.6, text: `×${w.mult}`, color: '#ffd166' });
  }
  ev.push({ t: 'sfx', s: 'kill' });
  if (d.mini) {
    w.locked = false;
    h.diamonds++;
    ev.push({ t: 'msg', text: `${d.icon} ${d.name} falls. The stairs open! 💎 +1` }, { t: 'sfx', s: 'unlock' });
  }
  if (d.boss) {
    w.enemies = [];
    w.danger = [];
    h.diamonds += 2;
    w.stairs = { x: e.x, y: e.y };
    w.stairsShown = true;
    w.locked = false;
    if (w.zone === 3) w.won = true;
    ev.push({ t: 'msg', text: `${d.icon} ${d.name} is defeated! 💎 +2` }, { t: 'sfx', s: 'win' }, { t: 'shake', n: 14 });
  }
}

function damageEnemy(w: World, e: Enemy, dmg: number, ev: Ev[], push = -1): void {
  e.hp -= dmg;
  e.hitAt = w.beat;
  ev.push({ t: 'float', x: e.x, y: e.y, text: `-${dmg}`, color: '#fff' }, { t: 'slash', x: e.x, y: e.y });
  if (e.hp <= 0) return killEnemy(w, e, ev);
  ev.push({ t: 'sfx', s: 'hit' });
  if (edef(e).boss && push >= 0) {
    const nx = e.x + DX[push];
    const ny = e.y + DY[push];
    if (freeForEnemy(w, nx, ny)) {
      e.x = nx;
      e.y = ny;
      e.stun = 1;
    }
  }
}

function dig(w: World, x: number, y: number, ev: Ev[], force: boolean): boolean {
  const t = tile(w, x, y);
  if (t === FLOOR || t === ROCK) return false;
  if (t === STONE && !force && !w.hero.pick) return false;
  setTile(w, x, y, FLOOR);
  if (t === GOLDV) {
    const n = 4 + w.zone * 3;
    w.hero.gold += n;
    w.hero.goldEarned += n;
    ev.push({ t: 'float', x, y, text: `+${n}💰`, color: '#ffd166' }, { t: 'sfx', s: 'coin' });
  } else if (t === GEMW) {
    w.hero.diamonds++;
    ev.push({ t: 'float', x, y, text: '+1💎', color: '#7df9ff' }, { t: 'sfx', s: 'gem' });
  }
  return true;
}

/** Enemies the weapon hits when you press `dir`. */
export function weaponHits(w: World, dir: number): { targets: Enemy[]; lunge: boolean } {
  const sh = SHAPES[WEAPONS[w.hero.weapon].shape];
  const out: Enemy[] = [];
  let lunge = false;
  for (const [ox, oy] of sh.cells) {
    if (oy === -2) {
      const [mx, my] = rot(0, -1, dir);
      if (tile(w, w.px + mx, w.py + my) !== FLOOR) continue;
    }
    const [rx, ry] = rot(ox, oy, dir);
    const e = enemyAt(w, w.px + rx, w.py + ry);
    if (!e) continue;
    out.push(e);
    if (!sh.all) {
      if (WEAPONS[w.hero.weapon].shape === 'rapier' && oy === -2) lunge = true;
      break;
    }
  }
  return { targets: out, lunge };
}

function playerMove(w: World, dir: number, ev: Ev[]): void {
  const h = w.hero;
  w.face = dir;
  const { targets, lunge } = weaponHits(w, dir);
  if (targets.length) {
    let dmg = weaponDmg(h);
    if (lunge) {
      w.px += DX[dir];
      w.py += DY[dir];
      dmg *= 2;
    }
    ev.push({ t: 'sfx', s: 'swing' });
    for (const e of targets) damageEnemy(w, e, dmg, ev, dir);
    return;
  }
  const tx = w.px + DX[dir];
  const ty = w.py + DY[dir];
  const t = tile(w, tx, ty);
  if (t !== FLOOR) {
    if (dig(w, tx, ty, ev, false)) ev.push({ t: 'sfx', s: 'dig' });
    else ev.push({ t: 'sfx', s: 'clink' }, ...(t === STONE ? [{ t: 'msg', text: 'Stone. You need a pickaxe ⛏️ or a bomb.' } as Ev] : []));
    return;
  }
  if (isKeeper(w, tx, ty)) {
    ev.push({ t: 'msg', text: '🧔 "Step on an item to buy it."' });
    return;
  }
  const chest = chestAt(w, tx, ty);
  if (chest) {
    w.chests = w.chests.filter((c) => c !== chest);
    giveItem(h, chest.item);
    const it = ITEMS[chest.item];
    ev.push({ t: 'msg', text: `Chest: ${it.icon} ${it.name}` }, { t: 'sfx', s: 'item' });
    return;
  }
  const ped = pedAt(w, tx, ty);
  if (ped) {
    if (h.gold < ped.cost) {
      ev.push({ t: 'msg', text: `${ITEMS[ped.item].name} costs ${ped.cost} gold.` }, { t: 'sfx', s: 'deny' });
      return;
    }
    h.gold -= ped.cost;
    ped.sold = true;
    giveItem(h, ped.item);
    ev.push({ t: 'msg', text: `Bought ${ITEMS[ped.item].icon} ${ITEMS[ped.item].name}` }, { t: 'sfx', s: 'item' });
  }
  w.px = tx;
  w.py = ty;
  ev.push({ t: 'sfx', s: 'step' });
  const g = w.gold.find((p) => p.x === tx && p.y === ty);
  if (g) {
    w.gold = w.gold.filter((p) => p !== g);
    h.gold += g.n;
    h.goldEarned += g.n;
    ev.push({ t: 'float', x: tx, y: ty, text: `+${g.n}💰`, color: '#ffd166' }, { t: 'sfx', s: 'coin' });
  }
  if (w.stairsShown && tx === w.stairs.x && ty === w.stairs.y) {
    if (!w.locked) {
      w.exit = true;
      ev.push({ t: 'sfx', s: 'stairs' });
    } else if (!w.lockMsg) {
      w.lockMsg = true;
      ev.push({ t: 'msg', text: 'The stairs are locked. Defeat the guardian.' });
    }
  }
}

function castSpell(w: World, ev: Ev[]): void {
  const h = w.hero;
  if (!h.spell) return;
  if (!spellReady(h)) {
    ev.push({ t: 'msg', text: `Spell charging: ${h.charge}/${SPELL_CHARGE[h.spell]} kills` }, { t: 'sfx', s: 'deny' });
    return;
  }
  h.charge = 0;
  ev.push({ t: 'sfx', s: 'spell' });
  if (h.spell === 'fireball') {
    let x = w.px;
    let y = w.py;
    for (let i = 0; i < 8; i++) {
      x += DX[w.face];
      y += DY[w.face];
      if (tile(w, x, y) !== FLOOR) break;
      ev.push({ t: 'boom', x, y });
      const e = enemyAt(w, x, y);
      if (e) damageEnemy(w, e, 3, ev);
    }
  } else if (h.spell === 'freeze') {
    w.frozen = 6;
    ev.push({ t: 'msg', text: '❄️ Everything freezes for 6 beats.' });
  } else if (h.spell === 'heal') {
    h.hp = Math.min(h.maxHp, h.hp + 2);
    ev.push({ t: 'float', x: w.px, y: w.py, text: '+2❤️', color: '#7ee08a' });
  } else if (h.spell === 'quake') {
    for (let y = w.py - 2; y <= w.py + 2; y++) for (let x = w.px - 2; x <= w.px + 2; x++) dig(w, x, y, ev, true);
    for (const e of w.enemies.slice()) if (Math.abs(e.x - w.px) <= 1 && Math.abs(e.y - w.py) <= 1) damageEnemy(w, e, 1, ev);
    ev.push({ t: 'shake', n: 10 });
  }
}

/** Try to step. Attacks the player when the target is the player's tile. */
function enemyStep(w: World, e: Enemy, dir: number, ev: Ev[]): 'attack' | 'move' | 'blocked' {
  const tx = e.x + DX[dir];
  const ty = e.y + DY[dir];
  if (tx === w.px && ty === w.py) {
    hurtPlayer(w, edef(e).dmg, ev);
    return 'attack';
  }
  if (!freeForEnemy(w, tx, ty)) return 'blocked';
  e.x = tx;
  e.y = ty;
  return 'move';
}

function chase(w: World, e: Enemy, ev: Ev[]): void {
  const dx = w.px - e.x;
  const dy = w.py - e.y;
  const hDir = dx > 0 ? 1 : 3;
  const vDir = dy > 0 ? 2 : 0;
  const order = Math.abs(dx) >= Math.abs(dy) ? [dx ? hDir : -1, dy ? vDir : -1] : [dy ? vDir : -1, dx ? hDir : -1];
  for (const d of order) if (d >= 0 && enemyStep(w, e, d, ev) !== 'blocked') return;
}

const dist = (w: World, e: Enemy): number => Math.abs(w.px - e.x) + Math.abs(w.py - e.y);

/** The direction to the player when it stands in a clear row or column within 6 tiles. */
function lineTo(w: World, e: Enemy): number {
  if (e.x !== w.px && e.y !== w.py) return -1;
  if (dist(w, e) > 6) return -1;
  const dir = e.x === w.px ? (w.py > e.y ? 2 : 0) : w.px > e.x ? 1 : 3;
  let x = e.x + DX[dir];
  let y = e.y + DY[dir];
  while (x !== w.px || y !== w.py) {
    if (!freeForEnemy(w, x, y)) return -1;
    x += DX[dir];
    y += DY[dir];
  }
  return dir;
}

function bossTick(w: World, e: Enemy, ev: Ev[]): boolean {
  const d = edef(e);
  if (d.summon && d.summonEvery) {
    e.summonCd--;
    if (e.summonCd <= 0) {
      e.summonCd = d.summonEvery;
      if (w.enemies.length < 5) {
        const free = [0, 1, 2, 3].map((k) => [e.x + DX[k], e.y + DY[k]]).filter(([x, y]) => freeForEnemy(w, x, y));
        if (free.length) {
          const [x, y] = free[Math.floor(rand(w) * free.length)];
          const md = ENEMIES[d.summon];
          w.enemies.push({ uid: w.uid++, id: md.id, x, y, hp: md.hp, max: md.hp, cd: md.every, dir: 0, aim: -1, stun: 0, summonCd: 0, slamCd: 0, hitAt: -1 });
          ev.push({ t: 'float', x, y, text: '✨', color: '#c77dff' }, { t: 'sfx', s: 'summon' });
        }
      }
    }
  }
  if (d.slam && d.slamEvery && e.stun === 0) {
    e.slamCd--;
    if (e.slamCd <= 0) {
      e.slamCd = d.slamEvery;
      const tiles: [number, number][] = [];
      if (d.slam === 'area') {
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) tiles.push([e.x + x, e.y + y]);
      } else {
        for (let k = 0; k < 4; k++) {
          for (let i = 1; i <= 5; i++) {
            const x = e.x + DX[k] * i;
            const y = e.y + DY[k] * i;
            if (tile(w, x, y) !== FLOOR) break;
            tiles.push([x, y]);
          }
        }
      }
      for (const [x, y] of tiles) if (tile(w, x, y) === FLOOR) w.danger.push({ x, y, at: w.beat + 1, dmg: d.dmg });
      ev.push({ t: 'sfx', s: 'warn' });
      return true;
    }
  }
  return false;
}

function enemyAct(w: World, e: Enemy, ev: Ev[]): void {
  const d = edef(e);
  if (d.boss && bossTick(w, e, ev)) return;
  if (e.stun > 0) {
    e.stun--;
    return;
  }
  if (e.cd > 0) {
    e.cd--;
    return;
  }
  e.cd = d.every - 1;
  switch (d.move) {
    case 'still':
      if (dist(w, e) === 1) hurtPlayer(w, d.dmg, ev);
      break;
    case 'bounce':
      enemyStep(w, e, e.dir, ev);
      e.dir = 2 - e.dir;
      break;
    case 'square':
      enemyStep(w, e, e.dir, ev);
      e.dir = (e.dir + 1) % 4;
      break;
    case 'line':
      if (enemyStep(w, e, e.dir, ev) === 'blocked') e.dir = (e.dir + 2) % 4;
      break;
    case 'random':
      enemyStep(w, e, Math.floor(rand(w) * 4), ev);
      break;
    case 'chase':
      if (dist(w, e) <= 9 || e.hitAt >= 0) chase(w, e, ev);
      break;
    case 'diag': {
      if (dist(w, e) > 9) break;
      const sx = Math.sign(w.px - e.x);
      const sy = Math.sign(w.py - e.y);
      if (sx && sy) {
        const tx = e.x + sx;
        const ty = e.y + sy;
        if (tx === w.px && ty === w.py) {
          hurtPlayer(w, d.dmg, ev);
          break;
        }
        if (freeForEnemy(w, tx, ty)) {
          e.x = tx;
          e.y = ty;
          break;
        }
      }
      chase(w, e, ev);
      break;
    }
    case 'charge': {
      if (e.aim >= 0) {
        for (let i = 0; i < 8; i++) if (enemyStep(w, e, e.aim, ev) !== 'move') break;
        e.aim = -1;
        e.stun = 2;
        ev.push({ t: 'sfx', s: 'charge' });
        break;
      }
      const dir = lineTo(w, e);
      if (dir >= 0) e.aim = dir;
      else if (d.mini && dist(w, e) <= 9 && rand(w) < 0.6) chase(w, e, ev);
      else if (rand(w) < 0.3) enemyStep(w, e, Math.floor(rand(w) * 4), ev);
      break;
    }
  }
}

function tickBombs(w: World, ev: Ev[]): void {
  for (const b of w.bombs) b.t--;
  const now = w.bombs.filter((b) => b.t <= 0);
  w.bombs = w.bombs.filter((b) => b.t > 0);
  for (const b of now) {
    ev.push({ t: 'sfx', s: 'boom' }, { t: 'shake', n: 12 });
    let hurt = false;
    for (let y = b.y - 1; y <= b.y + 1; y++) {
      for (let x = b.x - 1; x <= b.x + 1; x++) {
        ev.push({ t: 'boom', x, y });
        dig(w, x, y, ev, true);
        const e = enemyAt(w, x, y);
        if (e) damageEnemy(w, e, 3, ev);
        if (x === w.px && y === w.py) hurt = true;
      }
    }
    if (hurt && !w.dead) hurtPlayer(w, 2, ev);
  }
}

export function updateSeen(w: World): void {
  const r = lightRadius(w.hero);
  const ri = Math.ceil(r);
  for (let y = w.py - ri; y <= w.py + ri; y++) {
    for (let x = w.px - ri; x <= w.px + ri; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      if ((x - w.px) ** 2 + (y - w.py) ** 2 <= r * r) w.seen[y * w.w + x] = 1;
    }
  }
}

/**
 * Resolve one beat. `onBeat` false (or action 'none') means the player missed the beat:
 * the multiplier resets and only the world moves.
 */
export function resolveBeat(w: World, act: Action, onBeat: boolean): Ev[] {
  const ev: Ev[] = [];
  if (w.dead || w.exit || w.won) return ev;
  w.beat++;
  if (!onBeat || act.kind === 'none') {
    w.missed++;
    if (w.mult > 1) ev.push({ t: 'msg', text: 'Missed beat: multiplier lost' });
    w.mult = 1;
    ev.push({ t: 'sfx', s: 'miss' });
  } else {
    w.onBeat++;
    if (act.kind === 'move') playerMove(w, act.dir, ev);
    else if (act.kind === 'bomb') {
      if (w.hero.bombs > 0 && !w.bombs.some((b) => b.x === w.px && b.y === w.py)) {
        w.hero.bombs--;
        w.bombs.push({ x: w.px, y: w.py, t: 3 });
        ev.push({ t: 'sfx', s: 'fuse' });
      } else ev.push({ t: 'sfx', s: 'deny' });
    } else if (act.kind === 'spell') castSpell(w, ev);
  }
  if (w.exit || w.won) return ev;
  tickBombs(w, ev);
  const due = w.danger.filter((d) => d.at <= w.beat);
  w.danger = w.danger.filter((d) => d.at > w.beat);
  for (const d of due) {
    ev.push({ t: 'boom', x: d.x, y: d.y });
    if (d.x === w.px && d.y === w.py && !w.dead) hurtPlayer(w, d.dmg, ev);
  }
  if (w.frozen > 0) w.frozen--;
  else for (const e of w.enemies.slice()) if (!w.dead && w.enemies.includes(e)) enemyAct(w, e, ev);
  updateSeen(w);
  return ev;
}
