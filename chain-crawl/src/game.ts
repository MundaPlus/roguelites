/** Pure run state and turn logic. No DOM here, so the sim and the app share it. */
import {
  BASE_STATS,
  BOSS_AT,
  BOSS_EVERY,
  CLASSES,
  COLS,
  ENEMIES,
  FORGE_UPS,
  GEAR,
  GOAL_FLOOR,
  LEVEL_UPS,
  ROWS,
  SKILLS,
  SLOTS,
  TIER_NAME,
  groupOf,
  type Kind,
  type Slot,
  type Stats,
  type UpgradeDef,
} from './data';
import { Rng, hash } from './rng';

export interface Foe {
  t: string;
  hp: number;
  max: number;
  atk: number;
  armor: number;
  /** New enemies do not attack in the turn they drop in. */
  fresh: boolean;
  /** Fuse, spawn or breath counter. */
  timer: number;
}

export interface Tile {
  id: number;
  k: Kind;
  e?: Foe;
}

export interface Item {
  slot: Slot;
  name: string;
  icon: string;
  tier: number;
  stats: Partial<Stats>;
}

export interface Hero {
  cls: string;
  hp: number;
  armor: number;
  poison: number;
  level: number;
  ups: Record<string, number>;
  gear: Partial<Record<Slot, Item>>;
  cds: number[];
}

export type OfferKind = 'level' | 'shop' | 'forge';
export type Choice = { kind: 'up'; id: string } | { kind: 'item'; item: Item };

export interface Offer {
  kind: OfferKind;
  opts: Choice[];
}

export interface Run {
  v: 1;
  seed: string;
  rng: number;
  nextId: number;
  grid: (Tile | null)[];
  hero: Hero;
  floor: number;
  floorKills: number;
  kills: number;
  turn: number;
  xp: number;
  xpNeed: number;
  coins: number;
  coinNeed: number;
  shields: number;
  shieldNeed: number;
  pending: OfferKind[];
  offer: Offer | null;
  bossOn: boolean;
  frozen: number;
  over: null | 'win' | 'dead';
  dmgTaken: number;
  biggest: number;
}

export type Ev =
  | { t: 'hit'; id: number; dmg: number; kill: boolean }
  | { t: 'gain'; what: 'armor' | 'heal' | 'coin' | 'shieldbar'; n: number; at: number }
  | { t: 'xp'; n: number; at: number }
  | { t: 'atk'; id: number; dmg: number; through: boolean }
  | { t: 'hurt'; armor: number; hp: number }
  | { t: 'poison'; n: number }
  | { t: 'boom'; id: number; dmg: number }
  | { t: 'spawn'; id: number; from: number }
  | { t: 'regen'; id: number; n: number }
  | { t: 'spike'; id: number; dmg: number; kill: boolean }
  | { t: 'breath'; id: number }
  | { t: 'floor'; n: number }
  | { t: 'boss'; id: number }
  | { t: 'shuffle' }
  | { t: 'cure' }
  | { t: 'win' }
  | { t: 'dead' };

// ---------- Helpers ----------

export const rc = (i: number): [number, number] => [Math.floor(i / COLS), i % COLS];
export const adjacent = (a: number, b: number): boolean => {
  const [ar, ac] = rc(a);
  const [br, bc] = rc(b);
  return a !== b && Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1;
};

function withRng<T>(run: Run, fn: (r: Rng) => T): T {
  const r = new Rng(0);
  r.state = run.rng;
  const out = fn(r);
  run.rng = r.state;
  return out;
}

export function stats(h: Hero): Stats {
  const s: Stats = { ...BASE_STATS, ...CLASSES[h.cls].base };
  const add = (p: Partial<Stats>, times = 1): void => {
    for (const k of Object.keys(p) as (keyof Stats)[]) s[k] += (p[k] ?? 0) * times;
  };
  for (const [id, n] of Object.entries(h.ups)) {
    const u = LEVEL_UPS.find((x) => x.id === id) ?? FORGE_UPS.find((x) => x.id === id);
    if (u?.add) add(u.add, n);
  }
  for (const slot of SLOTS) {
    const it = h.gear[slot];
    if (it) add(it.stats);
  }
  s.maxHp += (h.level - 1) * 2;
  return s;
}

export const killsNeeded = (floor: number): number => 4 + Math.floor(floor / 4);
export const isBossFloor = (floor: number): boolean => floor % BOSS_EVERY === 0;
export const foeDef = (f: Foe) => ENEMIES[f.t];
export const skillCd = (run: Run, id: string): number => Math.max(3, SKILLS[id].cd - stats(run.hero).cdr);

export function makeFoe(id: string, floor: number): Foe {
  const d = ENEMIES[id];
  const hpMul = d.boss ? 1 : 1 + 0.1 * (floor - 1);
  const hp = Math.round(d.hp * hpMul);
  const atk = d.atk > 0 ? d.atk + (d.boss ? 0 : Math.floor((floor - 1) / 6)) : 0;
  return { t: id, hp, max: hp, atk, armor: d.armor + (d.boss ? 0 : Math.floor(floor / 12)), fresh: true, timer: d.sv ?? 0 };
}

function newTile(run: Run, r: Rng, enemyCount: number): Tile {
  const id = run.nextId++;
  const fl = run.floor;
  const ew = enemyCount >= 10 ? 0 : 9 + Math.min(8, fl * 0.4);
  const k = r.weighted<Kind>([
    ['sword', 24],
    ['shield', 18],
    ['coin', 16],
    ['potion', 13],
    ['enemy', ew],
  ]);
  if (k !== 'enemy') return { id, k };
  const pool = Object.values(ENEMIES).filter((d) => !d.boss && fl >= d.from && fl <= d.to);
  const d = r.weighted(pool.map((p) => [p.id, p.w] as const));
  return { id, k, e: makeFoe(d, fl) };
}

export const enemies = (run: Run): Tile[] => run.grid.filter((t): t is Tile => !!t && t.k === 'enemy');

// ---------- New run ----------

export function newRun(seed: string, cls: string): Run {
  const s = stats({ cls, hp: 0, armor: 0, poison: 0, level: 1, ups: {}, gear: {}, cds: [] });
  const run: Run = {
    v: 1,
    seed,
    rng: hash(seed, 'tiles'),
    nextId: 1,
    grid: [],
    hero: { cls, hp: s.maxHp, armor: s.maxArmor, poison: 0, level: 1, ups: {}, gear: {}, cds: [0, 0] },
    floor: 1,
    floorKills: 0,
    kills: 0,
    turn: 0,
    xp: 0,
    xpNeed: 10,
    coins: 0,
    coinNeed: 18,
    shields: 0,
    shieldNeed: 10,
    pending: [],
    offer: null,
    bossOn: false,
    frozen: 0,
    over: null,
    dmgTaken: 0,
    biggest: 0,
  };
  withRng(run, (r) => {
    // A calm start: few enemies on the first board.
    for (let i = 0; i < ROWS * COLS; i++) {
      const t = newTile(run, r, enemies(run).length >= 5 ? 99 : 0);
      if (t.e) t.e.fresh = false;
      run.grid.push(t);
    }
  });
  ensureMove(run);
  return run;
}

// ---------- Paths ----------

export function validStep(run: Run, path: number[], next: number): boolean {
  const t = run.grid[next];
  if (!t || path.includes(next)) return false;
  if (path.length === 0) return true;
  const first = run.grid[path[0]]!;
  return adjacent(path[path.length - 1], next) && groupOf(first.k) === groupOf(t.k);
}

export function validPath(run: Run, path: number[]): boolean {
  if (path.length < 3) return false;
  for (let i = 0; i < path.length; i++) if (!validStep(run, path.slice(0, i), path[i])) return false;
  return true;
}

/** True when some group has 3 connected tiles. */
export function hasMove(run: Run): boolean {
  const seen = new Set<number>();
  for (let i = 0; i < run.grid.length; i++) {
    if (seen.has(i)) continue;
    const g = groupOf(run.grid[i]!.k);
    let size = 0;
    const stack = [i];
    seen.add(i);
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (let j = 0; j < run.grid.length; j++) {
        if (!seen.has(j) && adjacent(c, j) && groupOf(run.grid[j]!.k) === g) {
          seen.add(j);
          stack.push(j);
        }
      }
    }
    if (size >= 3) return true;
  }
  return false;
}

export function shuffleBoard(run: Run): void {
  withRng(run, (r) => {
    for (let n = 0; n < 30; n++) {
      r.shuffle(run.grid);
      if (hasMove(run)) return;
    }
  });
}

function ensureMove(run: Run): Ev[] {
  if (hasMove(run)) return [];
  shuffleBoard(run);
  return [{ t: 'shuffle' }];
}

export interface Preview {
  group: string;
  dmg: number;
  kills: number;
  gain: number;
}

/** Damage one enemy takes from a chain with this many swords. */
export function chainDmg(s: Stats, swords: number, f: Foe): number {
  return Math.max(0, s.baseDmg + swords * s.swordDmg - Math.max(0, f.armor - s.pierce));
}

export function preview(run: Run, path: number[]): Preview | null {
  if (!path.length) return null;
  const s = stats(run.hero);
  const tiles = path.map((i) => run.grid[i]!);
  const g = groupOf(tiles[0].k);
  if (g === 'attack') {
    const swords = tiles.filter((t) => t.k === 'sword').length;
    const foes = tiles.filter((t) => t.e).map((t) => t.e!);
    const dmg = s.baseDmg + swords * s.swordDmg;
    return { group: g, dmg, kills: foes.filter((f) => f.hp <= chainDmg(s, swords, f)).length, gain: 0 };
  }
  const per = g === 'shield' ? s.shieldRepair : g === 'potion' ? s.potionHeal : s.coinValue;
  return { group: g, dmg: 0, kills: 0, gain: per * tiles.length };
}

// ---------- Turn ----------

function killFoe(run: Run, i: number, ev: Ev[]): void {
  const t = run.grid[i]!;
  const d = foeDef(t.e!);
  run.grid[i] = null;
  run.kills++;
  const xp = d.xp + stats(run.hero).xpBonus;
  run.xp += xp;
  ev.push({ t: 'xp', n: xp, at: i });
  if (d.boss) {
    run.bossOn = false;
    if (run.floor >= GOAL_FLOOR) {
      run.over = 'win';
      ev.push({ t: 'win' });
    } else {
      run.floor++;
      run.floorKills = 0;
      ev.push({ t: 'floor', n: run.floor });
    }
  } else if (!isBossFloor(run.floor)) {
    run.floorKills++;
  }
}

/** Step 1: apply the chain and clear its tiles. */
export function resolveChain(run: Run, path: number[]): Ev[] {
  const ev: Ev[] = [];
  const s = stats(run.hero);
  const tiles = path.map((i) => run.grid[i]!);
  const g = groupOf(tiles[0].k);
  const last = path[path.length - 1];
  run.turn++;
  run.biggest = Math.max(run.biggest, path.length);
  if (g === 'attack') {
    const swords = tiles.filter((t) => t.k === 'sword').length;
    for (const i of path) {
      const t = run.grid[i]!;
      if (t.k === 'sword') {
        run.grid[i] = null;
        continue;
      }
      const f = t.e!;
      const dmg = Math.min(f.hp, chainDmg(s, swords, f));
      f.hp -= dmg;
      const kill = f.hp <= 0;
      ev.push({ t: 'hit', id: t.id, dmg, kill });
      if (kill) killFoe(run, i, ev);
    }
  } else {
    for (const i of path) run.grid[i] = null;
    const n = tiles.length;
    if (g === 'shield') {
      const add = n * s.shieldRepair;
      const room = s.maxArmor - run.hero.armor;
      const used = Math.min(room, add);
      run.hero.armor += used;
      ev.push({ t: 'gain', what: 'armor', n: used, at: last });
      // Shields beyond full armor fill the forge bar. Each tile counts once.
      const over = Math.ceil((add - used) / s.shieldRepair);
      if (over > 0) {
        run.shields += over;
        ev.push({ t: 'gain', what: 'shieldbar', n: over, at: last });
      }
    } else if (g === 'potion') {
      const heal = Math.min(s.maxHp - run.hero.hp, n * s.potionHeal);
      run.hero.hp += heal;
      ev.push({ t: 'gain', what: 'heal', n: heal, at: last });
    } else {
      const c = n * s.coinValue;
      run.coins += c;
      ev.push({ t: 'gain', what: 'coin', n: c, at: last });
    }
  }
  return ev;
}

/** Step 2: drop tiles down and fill the gaps from the top. */
export function refill(run: Run): Ev[] {
  const ev: Ev[] = [];
  withRng(run, (r) => {
    const fresh: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const col: Tile[] = [];
      for (let row = ROWS - 1; row >= 0; row--) {
        const t = run.grid[row * COLS + c];
        if (t) col.push(t);
      }
      for (let row = ROWS - 1, k = 0; row >= 0; row--, k++) {
        const i = row * COLS + c;
        if (k < col.length) run.grid[i] = col[k];
        else {
          run.grid[i] = null;
          fresh.push(i);
        }
      }
    }
    // Bosses drop in with the first gap after their floor starts.
    const bossId = BOSS_AT[run.floor];
    let bossPlaced = !(isBossFloor(run.floor) && bossId && !run.bossOn);
    r.shuffle(fresh);
    for (const i of fresh) {
      if (!bossPlaced) {
        bossPlaced = true;
        run.bossOn = true;
        const t: Tile = { id: run.nextId++, k: 'enemy', e: makeFoe(bossId, run.floor) };
        run.grid[i] = t;
        ev.push({ t: 'boss', id: t.id });
        continue;
      }
      run.grid[i] = newTile(run, r, enemies(run).length);
    }
  });
  ev.push(...ensureMove(run));
  return ev;
}

/** Step 3: enemies act. */
export function enemyPhase(run: Run): Ev[] {
  const ev: Ev[] = [];
  const h = run.hero;
  const s = stats(h);
  if (h.poison > 0) {
    h.hp -= 1;
    run.dmgTaken += 1;
    h.poison--;
    ev.push({ t: 'poison', n: 1 });
  }
  if (run.frozen > 0) {
    run.frozen--;
  } else {
    let toArmor = 0;
    let toHp = 0;
    for (let i = 0; i < run.grid.length; i++) {
      const t = run.grid[i];
      if (!t?.e || t.e.fresh) continue;
      const f = t.e;
      const d = foeDef(f);
      if (d.special === 'regen' && f.hp < f.max) {
        const n = Math.min(d.sv ?? 1, f.max - f.hp);
        f.hp += n;
        ev.push({ t: 'regen', id: t.id, n });
      }
      if (d.special === 'explode') {
        f.timer--;
        if (f.timer <= 0) {
          const dmg = 5 + run.floor;
          toHp += dmg;
          ev.push({ t: 'boom', id: t.id, dmg });
          run.grid[i] = null;
          continue;
        }
      }
      if (d.special === 'spawn') {
        f.timer--;
        if (f.timer <= 0) {
          f.timer = d.sv ?? 3;
          withRng(run, (r) => {
            const spots = run.grid.map((x, j) => (x && x.k !== 'enemy' ? j : -1)).filter((j) => j >= 0);
            if (!spots.length) return;
            const j = r.pick(spots);
            const minion = makeFoe(d.id === 'queen' ? 'spider' : 'skeleton', run.floor);
            run.grid[j] = { id: run.nextId++, k: 'enemy', e: minion };
            ev.push({ t: 'spawn', id: run.grid[j]!.id, from: t.id });
          });
        }
      }
      if (f.atk <= 0) continue;
      let dmg = Math.max(0, f.atk - s.block);
      let through = d.special === 'ghost';
      if (d.special === 'breath') {
        f.timer--;
        if (f.timer <= 0) {
          f.timer = d.sv ?? 3;
          dmg = f.atk * 3;
          through = true;
          ev.push({ t: 'breath', id: t.id });
        }
      }
      if (dmg <= 0) continue;
      ev.push({ t: 'atk', id: t.id, dmg, through });
      if (through) toHp += dmg;
      else toArmor += dmg;
      if (d.poison) h.poison += d.poison;
      if (s.spikes > 0) {
        const sd = Math.min(f.hp, Math.max(0, s.spikes - Math.max(0, f.armor - s.pierce)));
        if (sd > 0) {
          f.hp -= sd;
          const kill = f.hp <= 0;
          ev.push({ t: 'spike', id: t.id, dmg: sd, kill });
          if (kill) killFoe(run, i, ev);
        }
      }
    }
    const absorbed = Math.min(h.armor, toArmor);
    h.armor -= absorbed;
    const hpLoss = toArmor - absorbed + toHp;
    h.hp -= hpLoss;
    run.dmgTaken += hpLoss;
    if (absorbed || hpLoss) ev.push({ t: 'hurt', armor: absorbed, hp: hpLoss });
  }
  for (const t of run.grid) if (t?.e) t.e.fresh = false;
  if (run.grid.some((t) => !t)) ev.push(...refill(run));
  for (const t of run.grid) if (t?.e) t.e.fresh = false;
  h.cds = h.cds.map((c) => Math.max(0, c - 1));
  return ev;
}

/** Step 4: floors, bars and death. */
export function settle(run: Run): Ev[] {
  const ev: Ev[] = [];
  if (run.over) return ev;
  if (run.hero.hp <= 0) {
    run.hero.hp = 0;
    run.over = 'dead';
    ev.push({ t: 'dead' });
    return ev;
  }
  while (!isBossFloor(run.floor) && run.floorKills >= killsNeeded(run.floor)) {
    run.floorKills -= killsNeeded(run.floor);
    run.floor++;
    ev.push({ t: 'floor', n: run.floor });
  }
  if (isBossFloor(run.floor)) run.floorKills = 0;
  while (run.xp >= run.xpNeed) {
    run.xp -= run.xpNeed;
    run.xpNeed = Math.round(run.xpNeed * 1.2 + 3);
    run.hero.level++;
    run.hero.hp += 2;
    run.pending.push('level');
  }
  while (run.coins >= run.coinNeed) {
    run.coins -= run.coinNeed;
    run.coinNeed = Math.round(run.coinNeed * 1.15 + 4);
    run.pending.push('shop');
  }
  while (run.shields >= run.shieldNeed) {
    run.shields -= run.shieldNeed;
    run.shieldNeed = Math.round(run.shieldNeed * 1.2 + 2);
    run.pending.push('forge');
  }
  nextOffer(run);
  return ev;
}

/** All steps of one move. The app runs the steps one by one for the animation. */
export function takeTurn(run: Run, path: number[]): Ev[] {
  const ev = resolveChain(run, path);
  ev.push(...refill(run));
  if (!run.over) ev.push(...enemyPhase(run));
  ev.push(...settle(run));
  return ev;
}

// ---------- Skills ----------

export function useSkill(run: Run, slot: number): Ev[] | null {
  const h = run.hero;
  if (h.cds[slot] > 0 || run.over || run.offer) return null;
  const id = CLASSES[h.cls].skills[slot];
  const s = stats(h);
  const ev: Ev[] = [];
  const hitAll = (dmgOf: (f: Foe) => number, only?: number): void => {
    for (let i = 0; i < run.grid.length; i++) {
      const t = run.grid[i];
      if (!t?.e || (only !== undefined && i !== only)) continue;
      const dmg = Math.min(t.e.hp, dmgOf(t.e));
      t.e.hp -= dmg;
      const kill = t.e.hp <= 0;
      ev.push({ t: 'hit', id: t.id, dmg, kill });
      if (kill) killFoe(run, i, ev);
    }
  };
  switch (id) {
    case 'whirl':
      hitAll((f) => chainDmg(s, 2, f));
      break;
    case 'fortify':
      ev.push({ t: 'gain', what: 'armor', n: s.maxArmor - h.armor, at: -1 });
      h.armor = s.maxArmor;
      break;
    case 'edge':
    case 'transmute': {
      const from: Kind = id === 'edge' ? 'coin' : 'shield';
      const to: Kind = id === 'edge' ? 'sword' : 'potion';
      for (const t of run.grid) if (t && t.k === from) t.k = to;
      ev.push(...ensureMove(run));
      break;
    }
    case 'shuffle':
      shuffleBoard(run);
      ev.push({ t: 'shuffle' });
      break;
    case 'heal': {
      const n = Math.min(s.maxHp - h.hp, Math.round(s.maxHp * 0.4));
      h.hp += n;
      h.poison = 0;
      ev.push({ t: 'gain', what: 'heal', n, at: -1 }, { t: 'cure' });
      break;
    }
    case 'fireball': {
      let best = -1;
      run.grid.forEach((t, i) => {
        if (t?.e && (best < 0 || t.e.hp > run.grid[best]!.e!.hp)) best = i;
      });
      if (best >= 0) hitAll(() => 6 + 2 * run.floor, best);
      break;
    }
    case 'freeze':
      run.frozen = 1;
      for (const t of run.grid) if (t?.e && foeDef(t.e).special === 'explode') t.e.timer++;
      break;
  }
  h.cds[slot] = skillCd(run, id);
  if (run.grid.some((t) => !t)) ev.push(...refill(run));
  ev.push(...settle(run));
  return ev;
}

// ---------- Offers (level up, shop, forge) ----------

function upChoices(run: Run, r: Rng, list: UpgradeDef[]): Choice[] {
  const ok = list.filter((u) => !u.max || (run.hero.ups[u.id] ?? 0) < u.max);
  return r.shuffle(ok.slice()).slice(0, 3).map((u) => ({ kind: 'up', id: u.id }));
}

export function rollItem(r: Rng, floor: number, slot?: Slot): Item {
  const pool = GEAR.filter((g) => !slot || g.slot === slot);
  const g = r.pick(pool);
  const base = 1 + Math.floor((floor - 1) / 5);
  const tier = Math.max(1, Math.min(4, base + (r.chance(0.25) ? 1 : 0)));
  const st: Partial<Stats> = {};
  const half: (keyof Stats)[] = ['block', 'pierce', 'coinValue', 'xpBonus', 'cdr'];
  for (const k of Object.keys(g.per) as (keyof Stats)[]) st[k] = half.includes(k) ? Math.ceil((g.per[k]! * tier) / 2) : g.per[k]! * tier;
  return { slot: g.slot, name: `${TIER_NAME[tier]} ${g.name}`, icon: g.icon, tier, stats: st };
}

export function nextOffer(run: Run): void {
  if (run.offer || !run.pending.length || run.over) return;
  const kind = run.pending.shift()!;
  withRng(run, (r) => {
    let opts: Choice[];
    if (kind === 'level') opts = upChoices(run, r, LEVEL_UPS);
    else if (kind === 'forge') opts = upChoices(run, r, FORGE_UPS);
    else {
      const slots = r.shuffle(SLOTS.slice()).slice(0, 3);
      opts = slots.map((sl) => ({ kind: 'item', item: rollItem(r, run.floor, sl) }));
    }
    run.offer = { kind, opts };
  });
}

export const upDef = (id: string): UpgradeDef => LEVEL_UPS.find((u) => u.id === id) ?? FORGE_UPS.find((u) => u.id === id)!;

/** Take choice `i`, or skip with -1. */
export function choose(run: Run, i: number): void {
  const o = run.offer;
  if (!o) return;
  const h = run.hero;
  const c = o.opts[i];
  if (c) {
    const before = stats(h);
    if (c.kind === 'up') {
      h.ups[c.id] = (h.ups[c.id] ?? 0) + 1;
      const u = upDef(c.id);
      if (u.fx === 'heal') {
        h.hp += u.add?.maxHp ?? before.maxHp;
        if (!u.add) h.poison = 0;
      }
      if (u.fx === 'armor') h.armor = stats(h).maxArmor;
    } else {
      h.gear[c.item.slot] = c.item;
      const after = stats(h);
      if (after.maxHp > before.maxHp) h.hp += after.maxHp - before.maxHp;
      if (after.maxArmor > before.maxArmor) h.armor += after.maxArmor - before.maxArmor;
    }
  } else if (o.kind === 'shop') {
    // Skipping the shop heals a bit.
    h.hp += Math.round(stats(h).maxHp * 0.2);
  }
  const s = stats(h);
  h.hp = Math.min(h.hp, s.maxHp);
  h.armor = Math.min(h.armor, s.maxArmor);
  run.offer = null;
  nextOffer(run);
}

/** Rough value of an item for the bot and for the "better" hint. */
export function itemValue(it: Item | undefined): number {
  if (!it) return 0;
  const w: Partial<Record<keyof Stats, number>> = { maxHp: 0.5, maxArmor: 1.2, baseDmg: 2, swordDmg: 3, pierce: 2.5, block: 4, spikes: 1, shieldRepair: 2, potionHeal: 2, coinValue: 1.5, xpBonus: 1.5, cdr: 2 };
  let v = 0;
  for (const k of Object.keys(it.stats) as (keyof Stats)[]) v += (it.stats[k] ?? 0) * (w[k] ?? 1);
  return v;
}

// ---------- Score and save ----------

export function score(run: Run): number {
  return run.floor * 100 + run.kills * 5 + run.hero.level * 20 + (run.over === 'win' ? 1500 : 0);
}

export const gemsFor = (sc: number): number => Math.floor(sc / 100);

export interface Meta {
  gems: number;
  unlocked: string[];
  runs: number;
  wins: number;
  bestFloor: number;
  best: number;
  kills: number;
  muted: boolean;
}

const RUN_KEY = 'chaincrawl.run';
const META_KEY = 'chaincrawl.meta';

export function saveRun(run: Run): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as Run;
    if (run.v !== 1 || !CLASSES[run.hero.cls] || run.grid.length !== ROWS * COLS || run.grid.some((t) => !t || (t.e && !ENEMIES[t.e.t]))) return null;
    if (run.over) return null;
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
  const base: Meta = { gems: 0, unlocked: ['warrior'], runs: 0, wins: 0, bestFloor: 0, best: 0, kills: 0, muted: false };
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

/** Book the end of a run into the meta progress. Returns the gems earned. */
export function finishRun(meta: Meta, run: Run): { score: number; gems: number } {
  const sc = score(run);
  const gems = gemsFor(sc);
  meta.runs++;
  if (run.over === 'win') meta.wins++;
  meta.bestFloor = Math.max(meta.bestFloor, run.floor);
  meta.best = Math.max(meta.best, sc);
  meta.kills += run.kills;
  meta.gems += gems;
  return { score: sc, gems };
}
