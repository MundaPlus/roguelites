/**
 * Floor generator. It builds a future board with barrier columns that the future hero cannot cross,
 * and gives each barrier one gate that only a past action opens (or a costly fight).
 * Every floor is checked with the solver: it must be clearable with the current HP,
 * and the future hero must not reach the exit without help from the past. Bad floors are rebuilt.
 */
import { ELITE_FLOORS, FLOORS, FOES, FUTURE_ONLY, GATE_FAMILIES, PAST_FAMILIES } from './data';
import { BASE_MODS, H, W, at, cx, cy, futFree, initState, type ChestDef, type FloorDef, type FoeDef, type Mods } from './engine';
import { Rng, hash } from './rng';
import { futReach, solve } from './solver';

export interface GenCtx {
  floor: number;
  hp: number;
  maxHp: number;
  mods: Mods;
  /** Unlocked optional rules, for example `monuments`. */
  unlocked: string[];
}

export function floorKind(floor: number): FloorDef['kind'] {
  if (floor >= FLOORS) return 'boss';
  return ELITE_FLOORS.includes(floor) ? 'elite' : 'normal';
}

export interface GenStats {
  attempts: number;
  states: number;
}

export const lastGen: GenStats = { attempts: 0, states: 0 };

export function genFloor(seed: number, ctx: GenCtx): FloorDef {
  lastGen.attempts = 0;
  lastGen.states = 0;
  for (let attempt = 0; attempt < 90; attempt++) {
    lastGen.attempts++;
    const rng = new Rng(hash(seed, ctx.floor, attempt));
    const level = attempt < 40 ? 0 : attempt < 70 ? 1 : 2;
    const def = build(rng, ctx, level);
    if (def && check(def, ctx, false, attempt < 60 ? minDamage(ctx) : 0)) return def;
  }
  const fb = fallback(ctx);
  check(fb, ctx, true);
  return fb;
}

/** Later floors should cost some HP even with perfect play, while the hero has HP to spare. */
function minDamage(ctx: GenCtx): number {
  if (ctx.floor >= 9 && ctx.hp >= 8) return 3;
  if (ctx.floor >= 5 && ctx.hp >= 6) return 2;
  if (ctx.floor >= 3 && ctx.hp >= 4) return 1;
  return 0;
}

function check(def: FloorDef, ctx: GenCtx, force = false, minDmg = 0): boolean {
  const st0 = initState(def, ctx.hp, ctx.maxHp, ctx.mods);
  if (def.kind !== 'boss' && !force) {
    const exit = def.fut.indexOf('X');
    const plain = { ...BASE_MODS };
    const reach = futReach(st0.fp, (c) => futFree(def, st0, c, plain));
    if (reach.has(exit)) return false;
  }
  const res = solve(def, st0, ctx.mods, 'safe', 20000);
  lastGen.states += res.states;
  if (!res.plan) return false;
  if (!force && (res.plan.dmg >= ctx.hp || res.plan.dmg < minDmg || res.plan.turns < 6 || res.plan.turns > 40)) return false;
  def.par = res.plan.turns;
  def.parDmg = res.plan.dmg;
  return true;
}

type Grid = string[];

function build(rng: Rng, ctx: GenCtx, level: number): FloorDef | null {
  const floor = ctx.floor;
  const kind = floorKind(floor);
  const P: Grid = Array(W * H).fill('.');
  const F: Grid = Array(W * H).fill('.');
  const foes: FoeDef[] = [];
  const chests: ChestDef[] = [];
  const floodA: number[] = [];
  const floodB: number[] = [];
  const links: { plate: number; gate: number }[] = [];
  const statues: number[] = [];
  const used = new Set<number>();
  const rules = new Set<string>();
  let seeds = 0;
  let fam = 0;

  const gatesN = kind === 'boss' || level === 2 ? 1 : floor <= 2 ? 1 : floor <= 6 ? (rng.chance(0.5) ? 2 : 1) : 2;
  const cols = gatesN === 1 ? [kind === 'boss' ? 3 : rng.pick([2, 3, 4])] : [2, 4];
  const flooding = floor >= 3;
  const monuments = ctx.unlocked.includes('monuments') && floor >= 2;
  const elite = kind === 'elite';

  // Elite pocket: the past hero starts locked in the bottom-left corner behind a time gate.
  const pocket = elite ? [at(0, 5), at(1, 5), at(0, 6), at(1, 6)] : [];
  const pocketWalls = elite ? [at(2, 5), at(2, 6), at(0, 4), at(1, 4), at(2, 4)] : [];

  // River in the past (dry in the future).
  const riverCols = [1, 5].filter((x) => !cols.includes(x) && !(elite && x === 1) && !(kind === 'boss' && x === 5));
  if (floor >= 2 && level === 0 && riverCols.length && rng.chance(0.45)) {
    const rx = rng.pick(riverCols);
    const ford = rng.int(0, H - 1);
    for (let y = 0; y < H; y++) if (y !== ford) P[at(rx, y)] = '~';
    if (rng.chance(0.4)) {
      const y2 = rng.int(0, H - 1);
      if (y2 !== ford) P[at(rx, y2)] = rng.chance(0.5) ? 'c' : '.';
    }
  }

  // Barriers and gates.
  let gateTypes = ['growth', 'erosion', 'lineage'];
  if (flooding) gateTypes.push('flooding');
  if (monuments) gateTypes.push('monuments');
  gateTypes = rng.shuffle(gateTypes);
  // Early floors teach one rule at a time.
  if (floor === 1) gateTypes = ['growth'];
  if (floor === 2) gateTypes = rng.pick([['erosion'], ['lineage']]);
  for (let gi = 0; gi < cols.length; gi++) {
    const bx = cols[gi];
    for (let y = 0; y < H; y++) {
      const c = at(bx, y);
      F[c] = rng.weighted<string>(flooding ? [['#', 3], ['_', 2], ['~', 1]] : [['#', 3], ['_', 2]]);
      if (P[c] !== '~') P[c] = rng.chance(0.4) ? '#' : '.';
      used.add(c);
    }
    let gy = rng.int(0, H - 1);
    if (elite && bx === 2) gy = rng.int(0, 3);
    const g = at(bx, gy);
    const type = gateTypes[gi % gateTypes.length];
    rules.add(type);
    if (type === 'growth') {
      F[g] = '_';
      P[g] = 's';
      seeds++;
    } else if (type === 'erosion') {
      F[g] = '#';
      P[g] = 'c';
    } else if (type === 'lineage') {
      F[g] = '.';
      P[g] = '.';
      const famType = rng.pick(elite ? [...GATE_FAMILIES, 'troll'] : GATE_FAMILIES);
      const ai = foes.length;
      foes.push({ type: famType, age: 'past', pos: -1, hp: FOES[famType].hp, parent: -1, fam });
      foes.push({ type: famType, age: 'fut', pos: g, hp: FOES[famType].hp + (floor >= 8 ? 1 : 0), parent: ai, fam });
      const behind = at(bx + 1, gy);
      if (bx + 1 < W && F[behind] === '.') {
        chests.push({ cell: behind, gold: rng.int(3, 6), heal: 0, parent: ai, fam });
        used.add(behind);
      }
      fam++;
    } else if (type === 'flooding') {
      F[g] = '~';
      P[g] = '.';
      floodA.push(g);
    } else if (type === 'monuments') {
      if (bx < 2) return null;
      F[g] = '_';
      P[g] = '.';
      const s = at(bx - 1, gy);
      const pusher = at(bx - 2, gy);
      if (P[s] === '~' || P[pusher] === '~') return null;
      P[s] = '.';
      P[pusher] = '.';
      F[s] = '.';
      statues.push(s);
      used.add(s);
      used.add(pusher);
    }
  }

  // Ruins: past walls. Some still stand in the future, some fell to rubble.
  const nonBarrier = (c: number): boolean => !cols.includes(cx(c));
  const randomCell = (ok: (c: number) => boolean): number => {
    for (let i = 0; i < 60; i++) {
      const c = rng.int(0, W * H - 1);
      if (ok(c)) return c;
    }
    return -1;
  };
  const ruins = rng.int(2, 4);
  for (let i = 0; i < ruins; i++) {
    const c = randomCell((c) => nonBarrier(c) && P[c] === '.' && F[c] === '.' && !used.has(c) && cx(c) !== 0 && cx(c) !== W - 1);
    if (c < 0) continue;
    P[c] = rng.chance(0.25) ? 'c' : '#';
    F[c] = rng.chance(0.5) ? '#' : ',';
  }
  // Future-only damage: rocks and sinkholes.
  const scars = rng.int(0, 2);
  for (let i = 0; i < scars; i++) {
    const c = randomCell((c) => nonBarrier(c) && F[c] === '.' && !used.has(c) && cx(c) > 0 && cx(c) < W - 1);
    if (c >= 0) F[c] = rng.pick(['#', '_']);
  }

  // Elite pocket and echo plate.
  if (elite) {
    for (const c of pocket) {
      P[c] = '.';
      used.add(c);
    }
    for (const c of pocketWalls) P[c] = '#';
    const gate = rng.pick([at(2, 5), at(2, 6), at(0, 4), at(1, 4)]);
    P[gate] = 'G';
    used.add(gate);
    rules.add('echo');
    const plateCell = randomCell((c) => cx(c) <= 1 && F[c] === '.' && !used.has(c));
    if (plateCell < 0) return null;
    F[plateCell] = 'P';
    used.add(plateCell);
    links.push({ plate: plateCell, gate });
  }

  // Starts and exit.
  const pickEdge = (x: number, grid: Grid): number => {
    const ys = rng.shuffle([0, 1, 2, 3, 4, 5, 6]);
    for (const y of ys) {
      const c = at(x, y);
      if (grid[c] === '.' && !used.has(c)) return c;
    }
    return -1;
  };
  const pastStart = elite ? rng.pick(pocket) : pickEdge(0, P);
  const futStart = pickEdge(0, F);
  if (pastStart < 0 || futStart < 0) return null;
  used.add(pastStart);
  used.add(futStart);
  let boss: FloorDef['boss'] = null;
  if (kind === 'boss') {
    const b = at(5, rng.int(2, 4));
    P[b] = '.';
    F[b] = '.';
    for (const c of [b - 1, b + 1, b - W, b + W]) {
      if (P[c] === '#' || P[c] === 'c') P[c] = '.';
      if (F[c] !== '.') F[c] = '.';
      used.add(c);
    }
    used.add(b);
    boss = { pos: b, hp: 5 };
  } else {
    const exit = pickEdge(W - 1, F);
    if (exit < 0) return null;
    F[exit] = 'X';
    used.add(exit);
  }

  // Sluice lever and the cells that flood when it is pulled.
  if (floodA.length) {
    const lever = randomCell((c) => nonBarrier(c) && P[c] === '.' && !used.has(c));
    if (lever < 0) return null;
    P[lever] = 'L';
    used.add(lever);
    const nB = rng.int(1, 3);
    for (let i = 0; i < nB; i++) {
      const c = randomCell((c) => nonBarrier(c) && F[c] === '.' && !used.has(c));
      if (c >= 0) {
        floodB.push(c);
        used.add(c);
      }
    }
  }

  // Decoy soil: planting here grows a tree that blocks the future.
  if (rules.has('growth') && rng.chance(0.4)) {
    const c = randomCell((c) => nonBarrier(c) && P[c] === '.' && F[c] === '.' && !used.has(c));
    if (c >= 0) {
      P[c] = 's';
      used.add(c);
    }
  }
  // A seed to pick up instead of a seed in the pocket.
  if (seeds > 0 && level === 0 && rng.chance(0.35)) {
    const c = randomCell((c) => P[c] === '.' && !used.has(c));
    if (c >= 0) {
      P[c] = '*';
      used.add(c);
      seeds--;
    }
  }

  const free = (age: 'past' | 'fut', ok: (c: number) => boolean = () => true): number =>
    randomCell((c) => (age === 'past' ? P[c] === '.' : F[c] === '.') && !used.has(c) && ok(c));
  const track = (age: 'past' | 'fut', c: number): number[] | undefined => {
    const grid = age === 'past' ? P : F;
    const dirs = rng.shuffle([1, -1, W, -W]);
    for (const d of dirs) {
      const path = [c];
      let cur = c;
      const len = rng.int(3, 4);
      while (path.length < len) {
        const n = cur + d;
        if (n < 0 || n >= W * H || (Math.abs(d) === 1 && cy(n) !== cy(cur))) break;
        if (grid[n] !== '.' || used.has(n)) break;
        path.push(n);
        cur = n;
      }
      if (path.length >= 2) return path;
    }
    return undefined;
  };
  const placeFoe = (f: FoeDef, ok?: (c: number) => boolean): boolean => {
    if (f.pos < 0) {
      const c = free(f.age, ok);
      if (c < 0) return false;
      f.pos = c;
    }
    used.add(f.pos);
    if (FOES[f.type].move === 'patrol') f.patrol = track(f.age, f.pos);
    return true;
  };
  // Gate ancestors first.
  for (const f of foes) if (!placeFoe(f, (c) => nonBarrier(c) && !pocket.includes(c))) return null;

  const hpUp = floor >= 8 ? 1 : 0;
  // Extra families: an ancestor in the past, descendants and a chest in the future.
  const families = floor <= 1 ? 0 : rng.int(0, 1) + (floor >= 7 && rng.chance(0.5) ? 1 : 0);
  for (let i = 0; i < families && level < 2; i++) {
    const pool = PAST_FAMILIES.filter((t) => t !== 'scorp' || floor >= 5);
    const type = rng.pick(pool);
    const ai = foes.length;
    const anc: FoeDef = { type, age: 'past', pos: -1, hp: FOES[type].hp, parent: -1, fam };
    if (!placeFoe(anc, (c) => nonBarrier(c) && !pocket.includes(c))) return null;
    foes.push(anc);
    const kids = floor >= 6 && rng.chance(0.4) ? 2 : 1;
    let last = -1;
    for (let k = 0; k < kids; k++) {
      const d: FoeDef = { type, age: 'fut', pos: -1, hp: FOES[type].hp + hpUp, parent: ai, fam };
      if (!placeFoe(d, (c) => nonBarrier(c) && cx(c) >= 2)) return null;
      foes.push(d);
      last = d.pos;
    }
    const spot = [last + 1, last - 1, last + W, last - W].find((c) => c >= 0 && c < W * H && Math.abs(cx(c) - cx(last)) <= 1 && F[c] === '.' && !used.has(c));
    if (spot !== undefined) {
      chests.push({ cell: spot, gold: rng.int(4, 7), heal: 0, parent: ai, fam });
      used.add(spot);
    }
    fam++;
  }
  // Past foes without descendants.
  const loners = level === 2 ? 0 : floor <= 2 ? rng.int(0, 1) : rng.int(0, floor >= 6 ? 2 : 1);
  for (let i = 0; i < loners; i++) {
    const type = rng.pick(PAST_FAMILIES.filter((t) => t !== 'scorp' || floor >= 4));
    const f: FoeDef = { type, age: 'past', pos: -1, hp: FOES[type].hp, parent: -1, fam: -1 };
    if (placeFoe(f, (c) => !pocket.includes(c))) foes.push(f);
  }
  // Future-only foes.
  const wild = level === 2 ? 0 : floor <= 1 ? 0 : floor <= 3 ? rng.int(0, 1) : floor <= 7 ? rng.int(1, 3) : rng.int(2, 3);
  for (let i = 0; i < wild; i++) {
    const pool = FUTURE_ONLY.filter((t) => (t !== 'spider' || floor >= 5) && (t !== 'beacon' || floor >= 6));
    const type = rng.pick(pool);
    const f: FoeDef = { type, age: 'fut', pos: -1, hp: FOES[type].hp + hpUp, parent: -1, fam: -1 };
    if (placeFoe(f, (c) => cx(c) >= 1)) foes.push(f);
  }
  // Elite troll in the past.
  if (elite) {
    const f: FoeDef = { type: 'troll', age: 'past', pos: -1, hp: FOES.troll.hp, parent: -1, fam: -1 };
    if (placeFoe(f, (c) => !pocket.includes(c) && cx(c) >= 2)) foes.push(f);
  }
  // Boss anchors.
  if (kind === 'boss') {
    for (let i = 0; i < 2; i++) {
      const f: FoeDef = { type: 'anchor', age: 'past', pos: -1, hp: 1, parent: -1, fam: -1 };
      if (!placeFoe(f, (c) => cx(c) >= 2)) return null;
      foes.push(f);
    }
  }
  // Gems and a loose chest.
  const gems = rng.int(1, 3);
  for (let i = 0; i < gems; i++) {
    const c = free('fut');
    if (c >= 0) {
      F[c] = '$';
      used.add(c);
    }
  }
  if (rng.chance(0.35)) {
    const c = free('fut', (c) => cx(c) >= 1);
    if (c >= 0) {
      const heart = rng.chance(0.25);
      chests.push({ cell: c, gold: heart ? 0 : rng.int(2, 4), heal: heart ? 2 : 0, parent: -1, fam: -1 });
      used.add(c);
    }
  }

  const def: FloorDef = {
    floor,
    kind,
    rules: [...rules],
    past: P.join(''),
    fut: F.join(''),
    pastStart,
    futStart,
    foes,
    chests,
    floodA,
    floodB,
    links,
    statues,
    seeds,
    boss,
    par: 0,
    parDmg: 0,
  };
  return transform(def, rng.int(0, 3));
}

/** Mirror the floor so the start is not always on the left. 0 = none, 1 = flip x, 2 = flip y, 3 = both. */
function transform(def: FloorDef, t: number): FloorDef {
  if (t === 0) return def;
  const m = (c: number): number => {
    let x = cx(c);
    let y = cy(c);
    if (t & 1) x = W - 1 - x;
    if (t & 2) y = H - 1 - y;
    return at(x, y);
  };
  const mapStr = (s: string): string => {
    const out = Array(W * H);
    for (let c = 0; c < W * H; c++) out[m(c)] = s[c];
    return out.join('');
  };
  return {
    ...def,
    past: mapStr(def.past),
    fut: mapStr(def.fut),
    pastStart: m(def.pastStart),
    futStart: m(def.futStart),
    foes: def.foes.map((f) => ({ ...f, pos: m(f.pos), patrol: f.patrol?.map(m) })),
    chests: def.chests.map((ch) => ({ ...ch, cell: m(ch.cell) })),
    floodA: def.floodA.map(m),
    floodB: def.floodB.map(m),
    links: def.links.map((l) => ({ plate: m(l.plate), gate: m(l.gate) })),
    statues: def.statues.map(m),
    boss: def.boss ? { ...def.boss, pos: m(def.boss.pos) } : null,
  };
}

/** A plain floor that is always clearable: one soil gate. */
function fallback(ctx: GenCtx): FloorDef {
  const P = Array(W * H).fill('.');
  const F = Array(W * H).fill('.');
  for (let y = 0; y < H; y++) F[at(3, y)] = '_';
  P[at(3, 3)] = 's';
  const kind = floorKind(ctx.floor);
  const foes: FoeDef[] = [];
  let boss: FloorDef['boss'] = null;
  if (kind === 'boss') {
    boss = { pos: at(5, 3), hp: 6 };
    foes.push({ type: 'anchor', age: 'past', pos: at(4, 1), hp: 1, parent: -1, fam: -1 });
  } else F[at(6, 3)] = 'X';
  return {
    floor: ctx.floor,
    kind,
    rules: ['growth'],
    past: P.join(''),
    fut: F.join(''),
    pastStart: at(0, 3),
    futStart: at(0, 3),
    foes,
    chests: [],
    floodA: [],
    floodB: [],
    links: [],
    statues: [],
    seeds: 1,
    boss,
    par: 0,
    parDmg: 0,
  };
}
