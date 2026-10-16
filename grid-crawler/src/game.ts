/**
 * The game state and the pure turn function `act(state, action) => state`.
 * All randomness comes from the RNG state stored in the game, so a replay of the same actions gives the same game.
 */
import {
  ARMORS,
  CLASSES,
  FLOORS,
  MONSTERS,
  POTIONS,
  POTION_COLORS,
  SCROLLS,
  SYLLABLES,
  TRAPS,
  WANDS,
  WAND_WOODS,
  WEAPONS,
  XP_TABLE,
  type MonDef,
  type Spell,
  type TrapKind,
} from './data';
import {
  DIRS,
  H,
  T_DOOR,
  T_DOWN,
  T_FLOOR,
  T_UP,
  T_WALL,
  W,
  canStep,
  computeFov,
  dist,
  distanceMap,
  generate,
  idx,
  inMap,
  line,
  ray,
  walkable,
  type Room,
} from './map';
import { Rng, hash } from './rng';

export type ItemKind = 'weapon' | 'armor' | 'potion' | 'scroll' | 'wand' | 'gold' | 'amulet';

export interface Item {
  uid: number;
  kind: ItemKind;
  id: string;
  plus?: number;
  charges?: number;
  qty?: number;
  x?: number;
  y?: number;
  /** Dropped by the player: no auto pick-up. */
  dropped?: boolean;
}

export type Mode = 'sleep' | 'wander' | 'hunt' | 'flee';

export interface Mon {
  uid: number;
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  energy: number;
  mode: Mode;
  /** Wander target room index. */
  room: number;
  /** Turns since the monster last saw the player. */
  lost: number;
  slow: number;
  fear: number;
  cd: number;
  summoned?: boolean;
}

export interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  str: number;
  agi: number;
  wits: number;
  level: number;
  xp: number;
  energy: number;
  weapon: Item | null;
  armor: Item | null;
  pack: Item[];
  gold: number;
  poison: number;
  haste: number;
  slow: number;
  confuse: number;
  weak: number;
  telepathy: number;
  regen: number;
}

export interface Trap {
  x: number;
  y: number;
  kind: TrapKind;
  known: boolean;
}

export type Fx =
  | { k: 'float'; x: number; y: number; text: string; color: string }
  | { k: 'bolt'; path: [number, number][]; color: string }
  | { k: 'hit'; uid: number }
  | { k: 'hurt' }
  | { k: 'sfx'; name: string }
  | { k: 'floor' };

export interface LogLine {
  t: string;
  c: string;
  n: number;
}

export interface Game {
  v: 1;
  seed: string;
  cls: string;
  floor: number;
  turn: number;
  rng: number;
  tiles: number[];
  seen: number[];
  vis: number[];
  rooms: Room[];
  mons: Mon[];
  items: Item[];
  traps: Trap[];
  p: Player;
  uid: number;
  names: Record<string, string>;
  known: string[];
  log: LogLine[];
  levelUps: number;
  kills: number;
  over: null | 'dead' | 'won';
  cause: string;
  fx: Fx[];
}

export type Action =
  | { t: 'move'; dx: number; dy: number }
  | { t: 'wait' }
  | { t: 'pickup' }
  | { t: 'descend' }
  | { t: 'use'; uid: number; tx?: number; ty?: number }
  | { t: 'drop'; uid: number }
  | { t: 'stat'; stat: 'str' | 'agi' | 'wits' };

export const PACK_MAX = 18;
export const SIGHT = 9;

// ---------- Helpers ----------

/** Runs `fn` with an RNG built from the game state and stores the RNG state back. */
function withRng<T>(g: Game, fn: (r: Rng) => T): T {
  const r = new Rng(0);
  (r as unknown as { s: number }).s = g.rng;
  const out = fn(r);
  g.rng = r.state;
  return out;
}

let R: Rng = new Rng(1);

function msg(g: Game, t: string, c = ''): void {
  g.log.push({ t, c, n: g.turn });
  if (g.log.length > 80) g.log.splice(0, g.log.length - 80);
}

const sfx = (g: Game, name: string): void => {
  g.fx.push({ k: 'sfx', name });
};

export const monAt = (g: Game, x: number, y: number): Mon | undefined => g.mons.find((m) => m.x === x && m.y === y && m.hp > 0);

export const def = (m: Mon): MonDef => MONSTERS[m.id];

export const itemKey = (it: Item): string => `${it.kind}:${it.id}`;

export const isKnown = (g: Game, it: Item): boolean =>
  it.kind === 'weapon' || it.kind === 'armor' || it.kind === 'gold' || it.kind === 'amulet' || g.known.includes(itemKey(it));

const an = (s: string): string => (/^[AEIOU]/i.test(s) ? 'an' : 'a');

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function itemName(g: Game, it: Item): string {
  const plus = (n?: number): string => (n ? ` ${n > 0 ? '+' : ''}${n}` : '');
  const q = it.qty && it.qty > 1 ? `${it.qty} ` : '';
  switch (it.kind) {
    case 'weapon':
      return `${WEAPONS[it.id].name}${plus(it.plus)}`;
    case 'armor':
      return `${ARMORS[it.id].name}${plus(it.plus)}`;
    case 'gold':
      return `${it.qty} gold`;
    case 'amulet':
      return 'the Amulet of the Deep';
    case 'potion':
      return isKnown(g, it) ? `${q}Potion${q ? 's' : ''} of ${POTIONS[it.id].name}` : `${q}${cap(g.names[itemKey(it)])} potion${q ? 's' : ''}`;
    case 'scroll':
      return isKnown(g, it) ? `${q}Scroll${q ? 's' : ''} of ${SCROLLS[it.id].name}` : `${q}Scroll${q ? 's' : ''} "${g.names[itemKey(it)]}"`;
    case 'wand':
      return isKnown(g, it) ? `Wand of ${WANDS[it.id].name} [${it.charges}]` : `${cap(g.names[itemKey(it)])} wand`;
  }
}

export function itemIcon(it: Item): string {
  switch (it.kind) {
    case 'weapon':
      return WEAPONS[it.id].icon;
    case 'armor':
      return ARMORS[it.id].icon;
    case 'potion':
      return '🧪';
    case 'scroll':
      return '📜';
    case 'wand':
      return '🪄';
    case 'gold':
      return '💰';
    case 'amulet':
      return '🧿';
  }
}

/** Color of the unknown name (potions) for the renderer. */
export function potionColor(g: Game, it: Item): string {
  const name = g.names[itemKey(it)];
  return POTION_COLORS.find(([n]) => n === name)?.[1] ?? '#fff';
}

export function itemDesc(g: Game, it: Item): string {
  if (it.kind === 'weapon') {
    const w = WEAPONS[it.id];
    const t = w.trait === 'sneak' ? ' Triple damage on unaware foes.' : w.trait === 'sweep' ? ' Hits all adjacent foes.' : w.trait === 'pierce' ? ' Also hits the foe behind.' : '';
    return `Damage ${w.dmg[0]}-${w.dmg[1]}, accuracy ${w.acc >= 0 ? '+' : ''}${w.acc}%, needs ${w.str} strength.${t}`;
  }
  if (it.kind === 'armor') return `Armor ${ARMORS[it.id].armor}, needs ${ARMORS[it.id].str} strength.`;
  if (!isKnown(g, it)) return 'Unknown. Use it to learn what it does.';
  if (it.kind === 'potion') return POTIONS[it.id].desc;
  if (it.kind === 'scroll') return SCROLLS[it.id].desc;
  if (it.kind === 'wand') return WANDS[it.id].desc;
  return '';
}

const opaqueFn =
  (g: Game) =>
  (i: number): boolean => {
    const t = g.tiles[i];
    if (t === T_WALL) return true;
    if (t === T_DOOR) {
      const x = i % W;
      const y = (i - x) / W;
      return !(g.p.x === x && g.p.y === y) && !monAt(g, x, y);
    }
    return false;
  };

export function updateFov(g: Game): void {
  g.vis = computeFov(g.p.x, g.p.y, SIGHT, opaqueFn(g));
  for (let i = 0; i < g.vis.length; i++) {
    if (!g.vis[i]) continue;
    g.seen[i] = 1;
  }
}

export const canSee = (g: Game, x: number, y: number): boolean => inMap(x, y) && g.vis[idx(x, y)] === 1;

export const strEff = (g: Game): number => g.p.str - (g.p.weak > 0 ? 2 : 0);

export function armorValue(g: Game): number {
  const a = g.p.armor;
  if (!a) return 0;
  const d = ARMORS[a.id];
  return Math.max(0, d.armor + (a.plus ?? 0) - Math.max(0, d.str - strEff(g)));
}

export function weaponStats(g: Game): { min: number; max: number; acc: number } {
  const w = g.p.weapon ? WEAPONS[g.p.weapon.id] : { dmg: [1, 2] as [number, number], acc: 0, str: 0 };
  const plus = g.p.weapon?.plus ?? 0;
  const miss = Math.max(0, w.str - strEff(g));
  const bonus = Math.floor(strEff(g) / 3);
  return {
    min: w.dmg[0] + plus + bonus,
    max: w.dmg[1] + plus + bonus,
    acc: 70 + 3 * g.p.agi + w.acc + plus * 3 - miss * 8,
  };
}

export function hitChance(g: Game, m: Mon): number {
  return Math.max(5, Math.min(98, weaponStats(g).acc - def(m).def));
}

export function monHitChance(g: Game, m: Mon): number {
  return Math.max(10, Math.min(95, def(m).acc - 3 * g.p.agi));
}

export const playerSpeed = (g: Game): number => (g.p.haste > 0 ? 200 : 100) / (g.p.slow > 0 ? 2 : 1);

/** Extra damage for monsters found deeper than their first floor. */
export const monBonus = (g: Game, m: Mon): number => (def(m).boss ? 0 : Math.max(0, Math.floor((g.floor - def(m).depth[0]) / 2)));

const monSpeed = (m: Mon): number => def(m).speed / (m.slow > 0 ? 2 : 1);

export const xpNeeded = (level: number): number => XP_TABLE[Math.min(level, XP_TABLE.length - 1)] + Math.max(0, level - XP_TABLE.length + 1) * 800;

// ---------- Creation ----------

function newUid(g: Game): number {
  return ++g.uid;
}

function makeItem(g: Game, kind: ItemKind, id: string, extra: Partial<Item> = {}): Item {
  const it: Item = { uid: newUid(g), kind, id, ...extra };
  if (kind === 'wand' && it.charges === undefined) it.charges = R.int(...WANDS[id].charges);
  if ((kind === 'potion' || kind === 'scroll') && !it.qty) it.qty = 1;
  return it;
}

function randomItem(g: Game, floor: number): Item {
  const kind = R.weighted<ItemKind>([
    ['potion', 36],
    ['scroll', 30],
    ['weapon', 9],
    ['armor', 9],
    ['wand', 8],
  ]);
  if (kind === 'potion') return makeItem(g, kind, R.weighted(Object.values(POTIONS).map((p) => [p.id, p.freq] as const)));
  if (kind === 'scroll') return makeItem(g, kind, R.weighted(Object.values(SCROLLS).map((p) => [p.id, p.freq] as const)));
  if (kind === 'wand') return makeItem(g, kind, R.weighted(Object.values(WANDS).map((p) => [p.id, p.freq] as const)));
  const plus = (): number => (R.chance(0.25 + floor * 0.03) ? R.int(1, 1 + Math.floor(floor / 4)) : R.chance(0.1) ? -1 : 0);
  if (kind === 'weapon') {
    const opts = Object.values(WEAPONS).filter((w) => w.depth <= floor + 1);
    return makeItem(g, kind, R.pick(opts).id, { plus: plus() });
  }
  const opts = Object.values(ARMORS).filter((a) => a.depth <= floor + 1);
  return makeItem(g, kind, R.pick(opts).id, { plus: plus() });
}

function spawnMon(g: Game, id: string, x: number, y: number, mode: Mode): Mon {
  const d = MONSTERS[id];
  const scale = 1 + Math.max(0, g.floor - d.depth[0]) * 0.16;
  const hp = Math.round(d.hp * (d.boss ? 1 : scale));
  const m: Mon = { uid: newUid(g), id, x, y, hp, maxHp: hp, energy: R.int(0, 99), mode, room: R.int(0, g.rooms.length - 1), lost: 0, slow: 0, fear: 0, cd: 0 };
  g.mons.push(m);
  return m;
}

function freeFloor(g: Game, x: number, y: number): boolean {
  const t = g.tiles[idx(x, y)];
  return (t === T_FLOOR || t === T_DOOR) && !monAt(g, x, y) && !(g.p.x === x && g.p.y === y);
}

function randomFloorTile(g: Game, farFrom?: [number, number], minDist = 0, roomOnly = true): [number, number] {
  for (let tries = 0; tries < 500; tries++) {
    let x: number;
    let y: number;
    if (roomOnly) {
      const r = R.pick(g.rooms);
      x = r.x + R.int(0, r.w - 1);
      y = r.y + R.int(0, r.h - 1);
    } else {
      x = R.int(1, W - 2);
      y = R.int(1, H - 2);
    }
    if (g.tiles[idx(x, y)] !== T_FLOOR || !freeFloor(g, x, y)) continue;
    if (farFrom && dist(x, y, farFrom[0], farFrom[1]) < minDist) continue;
    return [x, y];
  }
  return [g.p.x, g.p.y];
}

function pickMonster(floor: number): string {
  const opts = Object.values(MONSTERS).filter((m) => m.freq > 0 && floor >= m.depth[0] && floor <= m.depth[1]);
  return R.weighted(opts.map((m) => [m.id, m.freq] as const));
}

function placeGroup(g: Game, id: string, x: number, y: number, mode: Mode): void {
  const d = MONSTERS[id];
  spawnMon(g, id, x, y, mode);
  if (d.pack) {
    const n = R.int(...d.pack) - 1;
    for (let i = 0; i < n; i++) {
      const spot = DIRS.map(([dx, dy]) => [x + dx, y + dy] as [number, number]).find(([a, b]) => inMap(a, b) && freeFloor(g, a, b));
      if (spot) spawnMon(g, id, spot[0], spot[1], mode);
    }
  }
  // Goblin war bands: a goblin may bring an archer or a shaman.
  if (id === 'goblin' && g.floor >= 3 && R.chance(0.4)) {
    const spot = DIRS.map(([dx, dy]) => [x + dx, y + dy] as [number, number]).find(([a, b]) => inMap(a, b) && freeFloor(g, a, b));
    if (spot) spawnMon(g, R.chance(0.5) ? 'archer' : 'shaman', spot[0], spot[1], mode);
  }
}

function makeFloor(g: Game): void {
  const lv = generate(new Rng(hash(g.seed, 'floor', g.floor)));
  g.tiles = lv.tiles;
  g.rooms = lv.rooms;
  g.seen = new Array<number>(W * H).fill(0);
  g.vis = new Array<number>(W * H).fill(0);
  g.mons = [];
  g.items = [];
  g.traps = [];
  g.p.x = lv.start[0];
  g.p.y = lv.start[1];
  const f = g.floor;
  const start = lv.start;
  if (f === FLOORS) {
    // The amulet waits in the far room, guarded by the dragon.
    g.tiles[idx(lv.down[0], lv.down[1])] = T_FLOOR;
    g.items.push(makeItem(g, 'amulet', 'amulet', { x: lv.down[0], y: lv.down[1] }));
    const spot = DIRS.map(([dx, dy]) => [lv.down[0] + dx, lv.down[1] + dy] as [number, number]).find(([a, b]) => freeFloor(g, a, b))!;
    spawnMon(g, 'dragon', spot[0], spot[1], 'sleep');
  }
  const groups = 5 + Math.floor(f * 0.8) + R.int(0, 1);
  for (let i = 0; i < groups; i++) {
    const [x, y] = randomFloorTile(g, start, 8);
    placeGroup(g, pickMonster(f), x, y, R.chance(0.55) ? 'sleep' : 'wander');
  }
  const nItems = 5 + R.int(0, 2);
  for (let i = 0; i < nItems; i++) {
    const [x, y] = randomFloorTile(g);
    const it = randomItem(g, f);
    it.x = x;
    it.y = y;
    g.items.push(it);
  }
  const nGold = R.int(3, 5);
  for (let i = 0; i < nGold; i++) {
    const [x, y] = randomFloorTile(g);
    g.items.push(makeItem(g, 'gold', 'gold', { qty: R.int(4, 10) * (2 + f), x, y }));
  }
  const kinds = (Object.keys(TRAPS) as TrapKind[]).filter((k) => TRAPS[k].depth <= f && !(k === 'pit' && f === FLOORS));
  const nTraps = 1 + Math.floor(f / 2) + R.int(0, 1);
  for (let i = 0; i < nTraps; i++) {
    const [x, y] = randomFloorTile(g, start, 4, R.chance(0.5));
    if (g.traps.some((t) => t.x === x && t.y === y) || g.items.some((it) => it.x === x && it.y === y)) continue;
    g.traps.push({ x, y, kind: R.pick(kinds), known: false });
  }
  updateFov(g);
  g.fx.push({ k: 'floor' });
}

export function newGame(seed: string, clsId: string): Game {
  const cls = CLASSES.find((c) => c.id === clsId) ?? CLASSES[0];
  const g: Game = {
    v: 1,
    seed,
    cls: cls.id,
    floor: 1,
    turn: 0,
    rng: hash(seed, 'play'),
    tiles: [],
    seen: [],
    vis: [],
    rooms: [],
    mons: [],
    items: [],
    traps: [],
    p: {
      x: 0,
      y: 0,
      hp: cls.hp,
      maxHp: cls.hp,
      str: cls.str,
      agi: cls.agi,
      wits: cls.wits,
      level: 1,
      xp: 0,
      energy: 100,
      weapon: null,
      armor: null,
      pack: [],
      gold: 0,
      poison: 0,
      haste: 0,
      slow: 0,
      confuse: 0,
      weak: 0,
      telepathy: 0,
      regen: 0,
    },
    uid: 0,
    names: {},
    known: [...cls.knows],
    log: [],
    levelUps: 0,
    kills: 0,
    over: null,
    cause: '',
    fx: [],
  };
  withRng(g, (r) => {
    R = r;
    const colors = r.shuffle(POTION_COLORS.map(([n]) => n));
    Object.keys(POTIONS).forEach((id, i) => (g.names[`potion:${id}`] = colors[i]));
    const woods = r.shuffle([...WAND_WOODS]);
    Object.keys(WANDS).forEach((id, i) => (g.names[`wand:${id}`] = woods[i]));
    const used = new Set<string>();
    for (const id of Object.keys(SCROLLS)) {
      let label = '';
      do label = `${r.pick(SYLLABLES)}${r.pick(SYLLABLES)} ${r.pick(SYLLABLES)}`.toUpperCase();
      while (used.has(label));
      used.add(label);
      g.names[`scroll:${id}`] = label;
    }
    g.p.weapon = makeItem(g, 'weapon', cls.weapon, { plus: cls.weaponPlus });
    g.p.armor = makeItem(g, 'armor', cls.armor, { plus: 0 });
    for (const [kind, id, n] of cls.kit) {
      if (kind === 'wand') for (let i = 0; i < n; i++) g.p.pack.push(makeItem(g, 'wand', id, { charges: WANDS[id].charges[1] + 1 }));
      else g.p.pack.push(makeItem(g, kind as ItemKind, id, { qty: n }));
    }
    makeFloor(g);
  });
  g.fx = [];
  msg(g, `You enter the dungeon as a ${cls.name}. Find the Amulet on floor ${FLOORS}.`, 'info');
  return g;
}

// ---------- Player actions ----------

function addToPack(g: Game, it: Item): boolean {
  if (it.kind === 'gold') {
    g.p.gold += it.qty ?? 0;
    msg(g, `You pick up ${it.qty} gold.`, 'gold');
    g.fx.push({ k: 'float', x: g.p.x, y: g.p.y, text: `+${it.qty}`, color: '#ffd166' });
    sfx(g, 'coin');
    return true;
  }
  if (it.kind === 'amulet') {
    g.over = 'won';
    g.cause = `Escaped with the Amulet on turn ${g.turn}`;
    msg(g, 'You hold the Amulet of the Deep! You win!', 'good');
    sfx(g, 'win');
    return true;
  }
  const stack = (it.kind === 'potion' || it.kind === 'scroll') && g.p.pack.find((o) => o.kind === it.kind && o.id === it.id);
  if (stack) {
    stack.qty = (stack.qty ?? 1) + (it.qty ?? 1);
  } else {
    if (g.p.pack.length >= PACK_MAX) {
      msg(g, 'Your pack is full.', 'warn');
      return false;
    }
    delete it.x;
    delete it.y;
    delete it.dropped;
    g.p.pack.push(it);
  }
  msg(g, `You pick up ${itemName(g, stack || it)}.`);
  sfx(g, 'pickup');
  return true;
}

function pickupHere(g: Game, auto: boolean): boolean {
  const here = g.items.filter((it) => it.x === g.p.x && it.y === g.p.y && (!auto || !it.dropped || it.kind === 'gold'));
  let any = false;
  for (const it of here) {
    if (addToPack(g, it)) {
      g.items = g.items.filter((o) => o !== it);
      any = true;
    }
    if (g.over) break;
  }
  return any;
}

function gainXp(g: Game, n: number): void {
  g.p.xp += n;
  while (g.p.xp >= xpNeeded(g.p.level)) {
    g.p.level++;
    g.levelUps++;
    const gain = 2 + Math.floor(g.p.str / 4);
    g.p.maxHp += gain;
    g.p.hp += gain;
    msg(g, `Welcome to level ${g.p.level}! Choose a stat to train.`, 'good');
    g.fx.push({ k: 'float', x: g.p.x, y: g.p.y, text: 'LEVEL UP', color: '#ffd166' });
    sfx(g, 'level');
  }
}

function killMon(g: Game, m: Mon, byPlayer: boolean): void {
  m.hp = 0;
  g.mons = g.mons.filter((o) => o !== m);
  const d = def(m);
  if (canSee(g, m.x, m.y)) msg(g, `The ${d.name} dies.`, byPlayer ? 'good' : '');
  sfx(g, 'kill');
  if (!byPlayer) return;
  g.kills++;
  gainXp(g, m.summoned ? Math.ceil(d.xp / 3) : d.xp);
  if (!m.summoned && !d.boss) {
    if (R.chance(0.12)) {
      const it = randomItem(g, g.floor);
      it.x = m.x;
      it.y = m.y;
      g.items.push(it);
    } else if (R.chance(0.2)) {
      g.items.push(makeItem(g, 'gold', 'gold', { qty: R.int(2, 6) * (2 + g.floor), x: m.x, y: m.y }));
    }
  }
}

function damageMon(g: Game, m: Mon, n: number, color = '#fff'): void {
  m.hp -= n;
  g.fx.push({ k: 'float', x: m.x, y: m.y, text: `${n}`, color });
  g.fx.push({ k: 'hit', uid: m.uid });
  if (m.mode === 'sleep' || m.mode === 'wander') m.mode = 'hunt';
  if (m.hp <= 0) killMon(g, m, true);
}

function damagePlayer(g: Game, n: number, cause: string): void {
  if (n <= 0) return;
  g.p.hp -= n;
  g.fx.push({ k: 'float', x: g.p.x, y: g.p.y, text: `-${n}`, color: '#ef476f' });
  g.fx.push({ k: 'hurt' });
  if (g.p.hp <= 0 && !g.over) {
    g.p.hp = 0;
    g.over = 'dead';
    g.cause = `${cause} on floor ${g.floor}`;
    msg(g, `You die... ${cause}.`, 'bad');
    sfx(g, 'die');
  }
}

function attackMon(g: Game, m: Mon, main: boolean): void {
  const d = def(m);
  const unaware = m.mode === 'sleep' || m.mode === 'wander';
  const ws = weaponStats(g);
  if (!unaware && R.int(1, 100) > hitChance(g, m)) {
    msg(g, `You miss the ${d.name}.`, 'dim');
    g.fx.push({ k: 'float', x: m.x, y: m.y, text: 'miss', color: '#a8b0b8' });
    sfx(g, 'miss');
    return;
  }
  let dmg = R.int(ws.min, ws.max);
  if (unaware) dmg *= g.p.weapon && WEAPONS[g.p.weapon.id].trait === 'sneak' ? 3 : 2;
  dmg = Math.max(1, dmg - R.int(0, d.armor));
  if (unaware) msg(g, `You strike the unaware ${d.name} for ${dmg}!`, 'good');
  else if (main) msg(g, `You hit the ${d.name} for ${dmg}.`);
  sfx(g, unaware ? 'crit' : 'hit');
  damageMon(g, m, dmg, unaware ? '#ffd166' : '#fff');
  if (m.hp > 0 && m.hp < m.maxHp * 0.25 && def(m).fleeAt && m.mode !== 'flee') m.mode = 'flee';
}

function playerAttack(g: Game, m: Mon, dx: number, dy: number): void {
  const trait = g.p.weapon ? WEAPONS[g.p.weapon.id].trait : undefined;
  attackMon(g, m, true);
  if (trait === 'sweep') {
    for (const [ex, ey] of DIRS) {
      const o = monAt(g, g.p.x + ex, g.p.y + ey);
      if (o && o !== m && canStep(g.tiles, g.p.x, g.p.y, ex, ey)) attackMon(g, o, false);
    }
  } else if (trait === 'pierce') {
    const o = monAt(g, g.p.x + dx * 2, g.p.y + dy * 2);
    if (o && walkable(g.tiles[idx(g.p.x + dx, g.p.y + dy)])) attackMon(g, o, false);
  }
}

function triggerTrap(g: Game, t: Trap): void {
  const seenBefore = t.known;
  t.known = true;
  const name = TRAPS[t.kind].name;
  msg(g, seenBefore ? `You step on the ${name} trap.` : `A hidden ${name} trap!`, 'warn');
  sfx(g, 'trap');
  switch (t.kind) {
    case 'dart':
      damagePlayer(g, R.int(1, 3), 'Hit by a poison dart');
      g.p.poison += 6 + g.floor;
      break;
    case 'alarm':
      for (const m of g.mons) if (m.mode !== 'flee') m.mode = 'hunt';
      msg(g, 'A loud bell rings. The floor wakes up!', 'bad');
      break;
    case 'teleport':
      teleportPlayer(g);
      break;
    case 'pit':
      damagePlayer(g, R.int(2, 5), 'Fell through a trap door');
      if (!g.over) {
        msg(g, 'You fall through the floor!', 'bad');
        changeFloor(g);
      }
      break;
    case 'fire':
      damagePlayer(g, R.int(3, 6) + g.floor, 'Burned by a fire trap');
      g.fx.push({ k: 'bolt', path: [[g.p.x, g.p.y]], color: '#ff7b00' });
      break;
  }
}

function teleportPlayer(g: Game): void {
  const [x, y] = randomFloorTile(g, [g.p.x, g.p.y], 10);
  g.p.x = x;
  g.p.y = y;
  msg(g, 'You are pulled through space!', 'info');
  sfx(g, 'teleport');
  updateFov(g);
}

function changeFloor(g: Game): void {
  if (g.floor >= FLOORS) return;
  g.floor++;
  makeFloor(g);
  msg(g, `You reach floor ${g.floor}.${g.floor === FLOORS ? ' The Amulet is near. So is its guardian.' : ''}`, 'info');
  sfx(g, 'stairs');
}

function enterTile(g: Game, x: number, y: number): void {
  g.p.x = x;
  g.p.y = y;
  sfx(g, 'step');
  pickupHere(g, true);
  if (g.over) return;
  const t = g.traps.find((o) => o.x === x && o.y === y);
  if (t && t.known && R.chance(0.7)) msg(g, `You step carefully past the ${TRAPS[t.kind].name} trap.`, 'dim');
  else if (t) triggerTrap(g, t);
}

function nearestVisibleMon(g: Game): Mon | undefined {
  let best: Mon | undefined;
  let bd = 99;
  for (const m of g.mons) {
    if (!canSee(g, m.x, m.y)) continue;
    const d = dist(m.x, m.y, g.p.x, g.p.y);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

function identify(g: Game, it: Item): void {
  const key = itemKey(it);
  if (g.known.includes(key)) return;
  g.known.push(key);
  msg(g, `It was ${itemName(g, { ...it, qty: 1 })}.`, 'info');
}

function consume(g: Game, it: Item): void {
  if (it.kind === 'potion' || it.kind === 'scroll') {
    it.qty = (it.qty ?? 1) - 1;
    if (it.qty <= 0) g.p.pack = g.p.pack.filter((o) => o !== it);
  }
}

function quaff(g: Game, it: Item): void {
  const p = g.p;
  consume(g, it);
  sfx(g, 'quaff');
  switch (it.id) {
    case 'heal': {
      const n = Math.max(8, Math.round(p.maxHp * 0.5)) + p.wits;
      p.hp = Math.min(p.maxHp, p.hp + n);
      p.poison = 0;
      msg(g, 'You feel much better.', 'good');
      g.fx.push({ k: 'float', x: p.x, y: p.y, text: `+${n}`, color: '#7ee08a' });
      sfx(g, 'heal');
      break;
    }
    case 'extra':
      p.maxHp += 3;
      p.hp = p.maxHp;
      p.poison = 0;
      p.weak = 0;
      msg(g, 'You feel completely healed.', 'good');
      g.fx.push({ k: 'float', x: p.x, y: p.y, text: 'FULL', color: '#7ee08a' });
      sfx(g, 'heal');
      break;
    case 'strength':
      p.str++;
      p.weak = 0;
      msg(g, 'You feel stronger!', 'good');
      g.fx.push({ k: 'float', x: p.x, y: p.y, text: 'STR +1', color: '#ffd166' });
      break;
    case 'life':
      p.maxHp += 8;
      p.hp = p.maxHp;
      msg(g, 'You feel more alive!', 'good');
      g.fx.push({ k: 'float', x: p.x, y: p.y, text: 'MAX HP +8', color: '#7ee08a' });
      break;
    case 'speed':
      p.haste = 25;
      msg(g, 'You feel very fast.', 'good');
      break;
    case 'telepathy':
      p.telepathy = 150;
      msg(g, g.mons.length ? 'You sense the minds on this floor.' : 'You sense no minds here.', 'info');
      break;
    case 'descent':
      identify(g, it);
      if (g.floor >= FLOORS) {
        msg(g, 'You sink a little, then the floor stops you.', 'info');
      } else {
        msg(g, 'You sink through the floor!', 'info');
        changeFloor(g);
      }
      return;
    case 'confusion':
      p.confuse = 10;
      msg(g, 'You feel confused.', 'bad');
      break;
    case 'poison':
      p.poison += 10;
      msg(g, 'You feel sick. Poison!', 'bad');
      break;
  }
  identify(g, it);
}

function read(g: Game, it: Item): void {
  const p = g.p;
  consume(g, it);
  sfx(g, 'read');
  identify(g, it);
  switch (it.id) {
    case 'identify': {
      const unknown = p.pack.find((o) => !isKnown(g, o));
      if (unknown) identify(g, unknown);
      else msg(g, 'You have nothing left to identify.', 'dim');
      break;
    }
    case 'enchantW':
      if (p.weapon) {
        p.weapon.plus = (p.weapon.plus ?? 0) + 1;
        msg(g, `Your ${WEAPONS[p.weapon.id].name} glows blue.`, 'good');
        g.fx.push({ k: 'float', x: p.x, y: p.y, text: '+1', color: '#4cc9f0' });
      } else msg(g, 'Your hands tingle.', 'dim');
      break;
    case 'enchantA':
      if (p.armor) {
        p.armor.plus = (p.armor.plus ?? 0) + 1;
        msg(g, `Your ${ARMORS[p.armor.id].name} glows silver.`, 'good');
        g.fx.push({ k: 'float', x: p.x, y: p.y, text: '+1', color: '#ced4da' });
      } else msg(g, 'Your skin tingles.', 'dim');
      break;
    case 'teleport':
      teleportPlayer(g);
      break;
    case 'mapping':
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (g.tiles[idx(x, y)] !== T_WALL) {
            g.seen[idx(x, y)] = 1;
            for (const [dx, dy] of DIRS) if (inMap(x + dx, y + dy)) g.seen[idx(x + dx, y + dy)] = 1;
          }
        }
      for (const t of g.traps) t.known = true;
      msg(g, 'A map of the floor fills your mind.', 'info');
      break;
    case 'fear': {
      let n = 0;
      for (const m of g.mons)
        if (canSee(g, m.x, m.y) && !def(m).boss) {
          m.fear = 15;
          n++;
        }
      msg(g, n ? 'The monsters flee in terror!' : 'You hear a distant scream.', 'info');
      break;
    }
    case 'aggravate':
      for (const m of g.mons) m.mode = 'hunt';
      msg(g, 'A piercing shriek fills the floor!', 'bad');
      break;
    case 'summon': {
      let n = 0;
      for (const [dx, dy] of R.shuffle([...DIRS])) {
        if (n >= 2 + Math.floor(g.floor / 5)) break;
        if (freeFloor(g, p.x + dx, p.y + dy)) {
          spawnMon(g, pickMonster(g.floor), p.x + dx, p.y + dy, 'hunt');
          n++;
        }
      }
      msg(g, 'Monsters appear around you!', 'bad');
      break;
    }
  }
}

function zap(g: Game, it: Item, tx?: number, ty?: number): boolean {
  if ((it.charges ?? 0) <= 0) {
    msg(g, 'The wand is empty.', 'dim');
    return false;
  }
  let target: [number, number] | null = null;
  if (tx !== undefined && ty !== undefined && (tx !== g.p.x || ty !== g.p.y)) target = [tx, ty];
  else {
    const m = nearestVisibleMon(g);
    if (m) target = [m.x, m.y];
  }
  if (!target) {
    msg(g, 'No target in sight.', 'dim');
    return false;
  }
  it.charges = (it.charges ?? 1) - 1;
  const wasKnown = isKnown(g, it);
  const p = g.p;
  const path = ray(g.tiles, p.x, p.y, target[0], target[1], 12);
  sfx(g, 'zap');
  if (it.id === 'lightning') {
    g.fx.push({ k: 'bolt', path, color: '#bde0fe' });
    let hit = 0;
    for (const [x, y] of path) {
      const m = monAt(g, x, y);
      if (m) {
        hit++;
        msg(g, `Lightning hits the ${def(m).name}.`);
        damageMon(g, m, R.int(5, 10) + p.wits, '#bde0fe');
      }
    }
    if (!hit) msg(g, 'Lightning crackles through the air.', 'dim');
  } else {
    const cut: [number, number][] = [];
    let m: Mon | undefined;
    for (const [x, y] of path) {
      cut.push([x, y]);
      m = monAt(g, x, y);
      if (m) break;
    }
    const color = { fire: '#ff7b00', slow: '#9d4edd', sleep: '#4cc9f0', banish: '#e0aaff' }[it.id] ?? '#fff';
    g.fx.push({ k: 'bolt', path: cut, color });
    if (!m) msg(g, 'The bolt hits nothing.', 'dim');
    else {
      const n = def(m).name;
      switch (it.id) {
        case 'fire':
          msg(g, `The firebolt hits the ${n}.`);
          damageMon(g, m, R.int(7, 13) + p.wits, '#ff7b00');
          break;
        case 'slow':
          m.slow = 30;
          if (m.mode !== 'flee') m.mode = 'hunt';
          msg(g, `The ${n} slows down.`, 'good');
          break;
        case 'sleep':
          if (def(m).boss) msg(g, `The ${n} shrugs off the spell.`, 'dim');
          else {
            m.mode = 'sleep';
            msg(g, `The ${n} falls asleep.`, 'good');
          }
          break;
        case 'banish': {
          if (def(m).boss) {
            msg(g, `The ${n} resists.`, 'dim');
            break;
          }
          const [x, y] = randomFloorTile(g, [p.x, p.y], 12);
          m.x = x;
          m.y = y;
          msg(g, `The ${n} vanishes!`, 'good');
          break;
        }
      }
    }
  }
  if (!wasKnown) identify(g, it);
  return true;
}

function equip(g: Game, it: Item): void {
  const p = g.p;
  p.pack = p.pack.filter((o) => o !== it);
  if (it.kind === 'weapon') {
    if (p.weapon) p.pack.push(p.weapon);
    p.weapon = it;
    const need = WEAPONS[it.id].str;
    msg(g, `You wield the ${itemName(g, it)}.${need > strEff(g) ? ' It is too heavy for you.' : ''}`);
  } else {
    if (p.armor) p.pack.push(p.armor);
    p.armor = it;
    const need = ARMORS[it.id].str;
    msg(g, `You put on the ${itemName(g, it)}.${need > strEff(g) ? ' It is too heavy for you.' : ''}`);
  }
  sfx(g, 'equip');
}

// ---------- Monsters ----------

interface Ctx {
  dmap: number[];
  key: number;
}

const roomMaps = new Map<string, number[][]>();

function roomMap(g: Game, room: number): number[] {
  const key = `${g.seed}:${g.floor}`;
  let maps = roomMaps.get(key);
  if (!maps) {
    if (roomMaps.size > 4) roomMaps.clear();
    maps = g.rooms.map((r) => distanceMap(g.tiles, [[r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)]]));
    roomMaps.set(key, maps);
  }
  return maps[room % maps.length];
}

function playerMap(g: Game, ctx: Ctx): number[] {
  const k = idx(g.p.x, g.p.y);
  if (ctx.key !== k) {
    ctx.dmap = distanceMap(g.tiles, [[g.p.x, g.p.y]]);
    ctx.key = k;
  }
  return ctx.dmap;
}

function monFree(g: Game, x: number, y: number): boolean {
  return inMap(x, y) && walkable(g.tiles[idx(x, y)]) && !monAt(g, x, y) && !(g.p.x === x && g.p.y === y);
}

/** Steps along the map: down (toward) or up (away). Returns false when no step helps. */
function stepOnMap(g: Game, m: Mon, d: number[], away: boolean, sideways = false): boolean {
  const cur = d[idx(m.x, m.y)];
  let best: [number, number] | null = null;
  let bv = cur;
  const dirs = R.shuffle([...DIRS]);
  for (const [dx, dy] of dirs) {
    if (!canStep(g.tiles, m.x, m.y, dx, dy) || !monFree(g, m.x + dx, m.y + dy)) continue;
    const v = d[idx(m.x + dx, m.y + dy)];
    if (away ? v > bv : v < bv) {
      bv = v;
      best = [m.x + dx, m.y + dy];
    }
  }
  if (!best && sideways) {
    for (const [dx, dy] of dirs) {
      if (!canStep(g.tiles, m.x, m.y, dx, dy) || !monFree(g, m.x + dx, m.y + dy)) continue;
      if (d[idx(m.x + dx, m.y + dy)] === cur) {
        best = [m.x + dx, m.y + dy];
        break;
      }
    }
  }
  if (!best) return false;
  m.x = best[0];
  m.y = best[1];
  return true;
}

function clearShot(g: Game, m: Mon): [number, number][] | null {
  const path = line(m.x, m.y, g.p.x, g.p.y);
  for (let i = 0; i < path.length - 1; i++) {
    const [x, y] = path[i];
    const t = g.tiles[idx(x, y)];
    if (t === T_WALL || (t === T_DOOR && !monAt(g, x, y)) || monAt(g, x, y)) return null;
  }
  return path;
}

function monAttack(g: Game, m: Mon): number {
  const d = def(m);
  const p = g.p;
  if (R.int(1, 100) > monHitChance(g, m)) {
    msg(g, `The ${d.name} misses you.`, 'dim');
    g.fx.push({ k: 'float', x: p.x, y: p.y, text: 'dodge', color: '#a8b0b8' });
    sfx(g, 'miss');
    return d.atkCost ?? 100;
  }
  const raw = R.int(...d.atk) + monBonus(g, m);
  const dmg = Math.max(0, raw - R.int(0, armorValue(g)));
  if (dmg === 0) {
    msg(g, `Your armor blocks the ${d.name}.`, 'dim');
    g.fx.push({ k: 'float', x: p.x, y: p.y, text: 'block', color: '#ced4da' });
    sfx(g, 'block');
    return d.atkCost ?? 100;
  }
  msg(g, `The ${d.name} hits you for ${dmg}.`, 'bad');
  sfx(g, 'hurt');
  damagePlayer(g, dmg, `Killed by ${d.boss ? 'the' : an(d.name)} ${d.name}`);
  if (g.over) return 100;
  switch (d.onHit) {
    case 'poison':
      p.poison += 3 + Math.floor(g.floor / 3);
      msg(g, 'You are poisoned.', 'bad');
      break;
    case 'weaken':
      if (p.weak <= 0) msg(g, 'You feel weak.', 'bad');
      p.weak = 40;
      break;
    case 'drain': {
      const n = Math.ceil(dmg / 2);
      m.hp = Math.min(m.maxHp, m.hp + n);
      msg(g, `The ${d.name} drinks your life.`, 'bad');
      break;
    }
    case 'slow':
      p.slow = 6;
      break;
  }
  return d.atkCost ?? 100;
}

function castSpell(g: Game, m: Mon, seesP: boolean, dd: number): boolean {
  const d = def(m);
  if (!d.spells || m.cd > 0) return false;
  const p = g.p;
  for (const s of d.spells as Spell[]) {
    switch (s) {
      case 'heal': {
        const ally = g.mons.find((o) => o !== m && o.hp < o.maxHp * 0.6 && dist(o.x, o.y, m.x, m.y) <= 6);
        if (ally && R.chance(0.7)) {
          const n = Math.round(ally.maxHp * 0.4);
          ally.hp = Math.min(ally.maxHp, ally.hp + n);
          if (canSee(g, ally.x, ally.y)) {
            msg(g, `The ${d.name} heals the ${def(ally).name}.`, 'warn');
            g.fx.push({ k: 'float', x: ally.x, y: ally.y, text: `+${n}`, color: '#7ee08a' });
          }
          m.cd = 3;
          return true;
        }
        break;
      }
      case 'slow':
        if (seesP && dd <= 7 && p.slow <= 0 && R.chance(0.35) && clearShot(g, m)) {
          p.slow = 8;
          msg(g, `The ${d.name} casts a spell. You feel slow.`, 'bad');
          g.fx.push({ k: 'bolt', path: line(m.x, m.y, p.x, p.y), color: '#9d4edd' });
          sfx(g, 'spell');
          m.cd = 6;
          return true;
        }
        break;
      case 'blink':
        if (seesP && dd <= 2 && m.hp < m.maxHp * 0.6 && R.chance(0.5)) {
          const [x, y] = randomFloorTile(g, [p.x, p.y], 6);
          if (dist(x, y, m.x, m.y) <= 10) {
            m.x = x;
            m.y = y;
            msg(g, `The ${d.name} blinks away.`, 'warn');
            m.cd = 4;
            return true;
          }
        }
        break;
      case 'summon': {
        const mine = g.mons.filter((o) => o.summoned).length;
        if (seesP && mine < 3 && R.chance(0.4)) {
          let n = 0;
          for (const [dx, dy] of R.shuffle([...DIRS])) {
            if (n >= 2) break;
            if (freeFloor(g, m.x + dx, m.y + dy)) {
              const s2 = spawnMon(g, 'skeleton', m.x + dx, m.y + dy, 'hunt');
              s2.summoned = true;
              n++;
            }
          }
          if (n) {
            msg(g, `The ${d.name} raises the dead!`, 'bad');
            sfx(g, 'spell');
            m.cd = 8;
            return true;
          }
        }
        break;
      }
      case 'bolt':
        if (seesP && dd <= 7 && R.chance(0.5)) {
          const path = clearShot(g, m);
          if (path) {
            g.fx.push({ k: 'bolt', path, color: '#bde0fe' });
            sfx(g, 'zap');
            const n = R.int(2, 5) + Math.floor(g.floor / 2);
            msg(g, `The ${d.name} casts lightning at you for ${n}.`, 'bad');
            damagePlayer(g, n, `Struck by lightning from ${an(d.name)} ${d.name}`);
            m.cd = 2;
            return true;
          }
        }
        break;
      case 'fire':
        if (seesP && dd <= 6 && dd >= 2 && R.chance(0.6)) {
          const path = clearShot(g, m);
          if (path) {
            g.fx.push({ k: 'bolt', path, color: '#ff7b00' });
            sfx(g, 'fire');
            const n = R.int(8, 16);
            msg(g, `The ${d.name} breathes fire at you for ${n}!`, 'bad');
            damagePlayer(g, n, 'Burned by the Ancient Dragon');
            m.cd = 4;
            return true;
          }
        }
        break;
    }
  }
  return false;
}

/** One monster action. Returns the energy cost. */
function monAct(g: Game, m: Mon, ctx: Ctx): number {
  const d = def(m);
  const p = g.p;
  const dd = dist(m.x, m.y, p.x, p.y);
  const seesP = canSee(g, m.x, m.y) && dd <= SIGHT;
  // Awareness.
  if (m.mode === 'sleep') {
    if (seesP && dd <= 7 && R.chance(dd <= 2 ? 0.25 : 0.08)) {
      m.mode = 'hunt';
      if (canSee(g, m.x, m.y)) msg(g, `The ${d.name} wakes up.`, 'warn');
    }
    return 100;
  }
  if (m.mode === 'wander' && seesP && R.chance(dd <= 3 ? 0.8 : 0.35)) {
    m.mode = 'hunt';
    msg(g, `The ${d.name} notices you!`, 'warn');
    sfx(g, 'alert');
  }
  if (m.mode === 'hunt' || m.mode === 'flee') {
    if (seesP) m.lost = 0;
    else if (++m.lost > 30) m.mode = 'wander';
  }
  // Fleeing rules.
  const hpFrac = m.hp / m.maxHp;
  if (d.fleeAt && hpFrac < d.fleeAt && m.mode === 'hunt') m.mode = 'flee';
  if (m.mode === 'flee' && hpFrac > 0.75) m.mode = 'hunt';
  if (d.pack && m.mode === 'hunt' && hpFrac < 0.5) {
    const allies = g.mons.some((o) => o !== m && o.id === m.id && dist(o.x, o.y, m.x, m.y) <= 3);
    if (!allies) m.mode = 'flee';
  }
  const afraid = m.fear > 0 || m.mode === 'flee';
  const adj = dd === 1 && canStep(g.tiles, m.x, m.y, p.x - m.x, p.y - m.y);

  if (d.stationary) {
    if (m.mode === 'hunt' && castSpell(g, m, seesP, dd)) return 100;
    if (adj && m.mode === 'hunt') return monAttack(g, m);
    return 100;
  }

  if (m.mode === 'wander') {
    if (d.erratic && R.chance(0.5)) return randomStep(g, m);
    const rm = roomMap(g, m.room);
    if (rm[idx(m.x, m.y)] <= 1 || !stepOnMap(g, m, rm, false)) {
      m.room = R.int(0, g.rooms.length - 1);
      if (R.chance(0.3)) randomStep(g, m);
    }
    return 100;
  }

  const dmap = playerMap(g, ctx);
  if (afraid) {
    if (stepOnMap(g, m, dmap, true)) return 100;
    if (adj) return monAttack(g, m);
    return 100;
  }

  // Hunting.
  if (d.erratic && R.chance(0.4)) return randomStep(g, m);
  if (castSpell(g, m, seesP, dd)) return 100;
  if (d.ranged) {
    if (seesP && dd <= 2 && R.chance(0.7) && stepOnMap(g, m, dmap, true)) return 100;
    if (seesP && dd <= d.ranged.range && dd >= 2) {
      const path = clearShot(g, m);
      if (path) {
        g.fx.push({ k: 'bolt', path, color: d.ranged.color });
        sfx(g, 'shoot');
        if (R.int(1, 100) <= monHitChance(g, m)) {
          const n = Math.max(1, R.int(...d.ranged.dmg) - R.int(0, Math.floor(armorValue(g) / 2)));
          msg(g, `The ${d.name} ${d.ranged.verb} you for ${n}.`, 'bad');
          damagePlayer(g, n, `Shot by ${an(d.name)} ${d.name}`);
        } else msg(g, `The ${d.name} misses.`, 'dim');
        return 100;
      }
    }
  }
  if (adj) return monAttack(g, m);
  if (!stepOnMap(g, m, dmap, false, !!d.pack || dd <= 2)) {
    // Blocked by allies: wait.
  }
  return 100;
}

function randomStep(g: Game, m: Mon): number {
  for (const [dx, dy] of R.shuffle([...DIRS])) {
    if (canStep(g.tiles, m.x, m.y, dx, dy) && monFree(g, m.x + dx, m.y + dy)) {
      m.x += dx;
      m.y += dy;
      break;
    }
  }
  return 100;
}

// ---------- Time ----------

function tick(g: Game, ctx: Ctx): void {
  const p = g.p;
  g.turn++;
  p.energy += playerSpeed(g);
  if (p.haste > 0 && --p.haste === 0) msg(g, 'You slow down to normal speed.', 'dim');
  if (p.slow > 0 && --p.slow === 0) msg(g, 'You can move at normal speed again.', 'dim');
  if (p.confuse > 0 && --p.confuse === 0) msg(g, 'Your head clears.', 'dim');
  if (p.weak > 0 && --p.weak === 0) msg(g, 'Your strength returns.', 'dim');
  if (p.telepathy > 0) p.telepathy--;
  if (p.poison > 0) {
    p.poison--;
    damagePlayer(g, 1, 'Died of poison');
    if (g.over) return;
  } else if (p.hp < p.maxHp) {
    const turns = Math.max(40, 220 - p.wits * 10) / (g.cls === 'paladin' ? 1.5 : 1);
    p.regen += p.maxHp / turns;
    while (p.regen >= 1) {
      p.regen -= 1;
      p.hp = Math.min(p.maxHp, p.hp + 1);
    }
  }
  // Spot hidden traps nearby.
  for (const t of g.traps) {
    if (t.known || !canSee(g, t.x, t.y)) continue;
    const dd = dist(t.x, t.y, p.x, p.y);
    if (dd <= 3 && R.chance(0.05 + p.wits * 0.025 + (dd <= 1 ? 0.1 : 0))) {
      t.known = true;
      msg(g, `You spot a ${TRAPS[t.kind].name} trap.`, 'info');
    }
  }
  // Wandering monsters arrive now and then.
  if (g.turn % 90 === 0 && g.mons.length < 30 && R.chance(0.5)) {
    const [x, y] = randomFloorTile(g, [p.x, p.y], 12);
    if (!canSee(g, x, y)) spawnMon(g, pickMonster(g.floor), x, y, 'wander');
  }
  for (const m of [...g.mons]) {
    if (m.hp <= 0) continue;
    if (m.slow > 0) m.slow--;
    if (m.fear > 0) m.fear--;
    if (m.cd > 0) m.cd--;
    if (def(m).regen && m.hp < m.maxHp) m.hp = Math.min(m.maxHp, m.hp + 2);
    else if (g.turn % 12 === 0 && m.hp < m.maxHp) m.hp++;
    m.energy += monSpeed(m);
    let guard = 0;
    while (m.energy >= 100 && m.hp > 0 && !g.over && guard++ < 4) {
      m.energy -= monAct(g, m, ctx);
    }
    if (g.over) return;
  }
  updateFov(g);
}

function endTurn(g: Game, cost = 100): void {
  g.p.energy -= cost;
  const ctx: Ctx = { dmap: [], key: -1 };
  updateFov(g);
  let guard = 0;
  while (g.p.energy < 100 && !g.over && guard++ < 20) tick(g, ctx);
  updateFov(g);
}

/** The pure turn function. Returns a new state; the old one stays as it was. */
export function act(state: Game, a: Action): Game {
  if (state.over) return state;
  const g = structuredClone(state);
  g.fx = [];
  const r = new Rng(0);
  (r as unknown as { s: number }).s = g.rng;
  R = r;
  try {
    perform(g, a);
  } finally {
    g.rng = r.state;
  }
  return g;
}

function perform(g: Game, a: Action): void {
  const p = g.p;
  if (a.t === 'stat') {
    if (g.levelUps <= 0) return;
    g.levelUps--;
    if (a.stat === 'str') {
      p.str++;
      p.maxHp += 2;
      p.hp += 2;
    } else if (a.stat === 'agi') p.agi++;
    else p.wits++;
    msg(g, `${a.stat === 'str' ? 'Strength' : a.stat === 'agi' ? 'Agility' : 'Wits'} +1.`, 'good');
    return;
  }
  if (g.levelUps > 0) return;
  switch (a.t) {
    case 'move': {
      let { dx, dy } = a;
      if (p.confuse > 0 && R.chance(0.6)) [dx, dy] = R.pick(DIRS);
      const nx = p.x + dx;
      const ny = p.y + dy;
      const m = monAt(g, nx, ny);
      if (!canStep(g.tiles, p.x, p.y, dx, dy)) {
        if (p.confuse > 0) {
          msg(g, 'You stumble into the wall.', 'dim');
          endTurn(g);
        } else if (m && dx !== 0 && dy !== 0) msg(g, 'You cannot attack diagonally around a door or corner.', 'dim');
        return;
      }
      if (m) {
        playerAttack(g, m, dx, dy);
        endTurn(g);
        return;
      }
      enterTile(g, nx, ny);
      if (!g.over) endTurn(g);
      return;
    }
    case 'wait':
      // Waiting also searches: a better chance to spot traps.
      for (const t of g.traps) {
        if (!t.known && dist(t.x, t.y, p.x, p.y) <= 2 && R.chance(0.3 + p.wits * 0.05)) {
          t.known = true;
          msg(g, `You find a ${TRAPS[t.kind].name} trap.`, 'info');
        }
      }
      endTurn(g);
      return;
    case 'pickup': {
      const any = g.items.some((it) => it.x === p.x && it.y === p.y);
      if (!any) {
        msg(g, 'There is nothing here.', 'dim');
        return;
      }
      if (pickupHere(g, false) && !g.over) endTurn(g);
      return;
    }
    case 'descend':
      if (g.tiles[idx(p.x, p.y)] !== T_DOWN) {
        msg(g, 'There are no stairs down here.', 'dim');
        return;
      }
      changeFloor(g);
      return;
    case 'drop': {
      const it = p.pack.find((o) => o.uid === a.uid);
      if (!it) return;
      p.pack = p.pack.filter((o) => o !== it);
      it.x = p.x;
      it.y = p.y;
      it.dropped = true;
      g.items.push(it);
      msg(g, `You drop ${itemName(g, it)}.`);
      endTurn(g);
      return;
    }
    case 'use': {
      const it = p.pack.find((o) => o.uid === a.uid);
      if (!it) return;
      if (it.kind === 'potion') quaff(g, it);
      else if (it.kind === 'scroll') read(g, it);
      else if (it.kind === 'wand') {
        if (!zap(g, it, a.tx, a.ty)) return;
      } else if (it.kind === 'weapon' || it.kind === 'armor') equip(g, it);
      if (!g.over) endTurn(g);
      return;
    }
  }
}

// ---------- Queries for the UI and the bot ----------

export const onStairs = (g: Game): boolean => g.tiles[idx(g.p.x, g.p.y)] === T_DOWN;

export const isUpStairs = (t: number): boolean => t === T_UP;

export function visibleMons(g: Game): Mon[] {
  return g.mons.filter((m) => canSee(g, m.x, m.y) || g.p.telepathy > 0);
}

export function score(g: Game): number {
  return g.p.gold + (g.floor - 1) * 150 + g.kills * 5 + g.p.level * 20 + (g.over === 'won' ? 3000 : 0);
}
