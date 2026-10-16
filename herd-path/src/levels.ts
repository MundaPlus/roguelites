/**
 * Level generator. A level is a chain of hand-made obstacle segments with seeded
 * sizes. Each segment writes its own known solution (job triggers). The generator
 * then plays the solution in the simulation and keeps the level only when it works.
 */
import { playOut, solutionCtrl } from './bot';
import { ACTS, JOB_IDS, type BossId, type Curse, type Pack, type Theme } from './data';
import {
  AIR,
  DIRT,
  FIRE,
  FRAGILE_LETHAL,
  GATE,
  H,
  LETHAL,
  SPEED_FAST,
  SPEED_NORMAL,
  STEEL,
  WATER,
  emptyJobs,
  newGame,
  type Level,
  type SwitchDef,
  type Trigger,
} from './game';
import { Rng, hash } from './rng';

const W_MAX = 320;

class Builder {
  cells = new Uint8Array(W_MAX * H);
  x = 0;
  fy = 40;
  traps: { x: number; y: number }[] = [];
  switches: SwitchDef[] = [];
  wolf: Level['wolf'] = null;
  sol: Trigger[] = [];
  /** True after an obstacle that kills critters walking back to the left. */
  unsafe = false;
  segs: string[] = [];

  set(x: number, y: number, t: number): void {
    if (x >= 0 && x < W_MAX && y >= 0 && y < H) this.cells[y * W_MAX + x] = t;
  }

  get(x: number, y: number): number {
    return x >= 0 && x < W_MAX && y >= 0 && y < H ? this.cells[y * W_MAX + x] : STEEL;
  }

  rect(x0: number, y0: number, x1: number, y1: number, t: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }

  /** A ground column with its surface at `top`. */
  col(x: number, top: number): void {
    for (let y = top; y < H; y++) this.set(x, y, y >= H - 2 ? STEEL : DIRT);
  }

  flat(n: number, top = this.fy): void {
    for (let i = 0; i < n; i++) this.col(this.x + i, top);
    this.x += n;
  }

  add(t: Omit<Trigger, 'y'> & { y?: number }): number {
    this.sol.push({ y: this.fy - 1, ...t } as Trigger);
    return this.sol.length - 1;
  }
}

export type SegKind = 'wall' | 'gap' | 'deepgap' | 'firegap' | 'shelf' | 'dropdown' | 'trapzone' | 'firestrip' | 'tunnel' | 'firetunnel' | 'gatehouse';

export const SEG_INFO: Record<SegKind, { name: string; jobs: string; pack: Pack }> = {
  wall: { name: 'Dirt wall', jobs: '👊 or ✋+💣', pack: 'meadow' },
  gap: { name: 'Creek', jobs: '🧱', pack: 'meadow' },
  shelf: { name: 'High shelf', jobs: '🧱', pack: 'meadow' },
  dropdown: { name: 'Burrow', jobs: '⛏️', pack: 'meadow' },
  trapzone: { name: 'Snap trap', jobs: '🧱', pack: 'meadow' },
  tunnel: { name: 'Trap field', jobs: '⛏️+👊', pack: 'caves' },
  gatehouse: { name: 'Locked gate', jobs: '🧗', pack: 'caves' },
  deepgap: { name: 'Deep pit', jobs: '🧱', pack: 'caves' },
  firegap: { name: 'Fire pit', jobs: '🧱', pack: 'volcano' },
  firestrip: { name: 'Hot coals', jobs: '🧱', pack: 'volcano' },
  firetunnel: { name: 'Burning field', jobs: '⛏️+👊', pack: 'volcano' },
};

interface SegOpts {
  first: boolean;
  act: number;
  wolf?: boolean;
}

/** Each segment returns false when it does not fit here (the caller picks another). */
const SEGS: Record<SegKind, (b: Builder, r: Rng, o: SegOpts) => boolean> = {
  wall(b, r, o) {
    const hw = r.int(7, Math.min(18, b.fy - 8));
    if (hw < 7) return false;
    const a = r.int(6, 10);
    const ww = r.int(4, 9);
    b.flat(a);
    const wx = b.x;
    for (let i = 0; i < ww; i++) b.col(wx + i, b.fy - hw);
    b.x += ww;
    b.flat(r.int(6, 10));
    if (o.first && ww <= 5 && r.chance(0.5)) {
      const i = b.add({ job: 'blocker', x: wx - 1, dir: 1 });
      b.add({ job: 'bomber', x: wx - 1, state: 'block', after: i });
    } else b.add({ job: 'basher', x: wx - 1, dir: 1 });
    return true;
  },
  gap: (b, r, o) => pit(b, r, o, 'water'),
  deepgap: (b, r, o) => pit(b, r, o, 'deep'),
  firegap: (b, r, o) => pit(b, r, o, 'fire'),
  shelf(b, r) {
    const h = r.int(4, Math.min(10, b.fy - 22));
    if (h < 4) return false;
    const d = 2 * h + 2;
    const start = b.x;
    b.flat(d);
    const face = b.x;
    const steelFace = r.chance(0.5);
    const p = r.int(9, 13);
    b.flat(p, b.fy - h);
    if (steelFace) for (let y = b.fy - h; y < b.fy + 2; y++) b.set(face, y, STEEL);
    b.add({ job: 'builder', x: start, dir: 1 });
    b.fy -= h;
    return true;
  },
  dropdown(b, r) {
    const t = r.int(4, 6);
    const ch = r.int(6, 10);
    if (b.fy + t + ch > 70 || b.fy < 20) return false;
    const p = r.int(16, 22);
    const x0 = b.x;
    for (let i = 0; i < p; i++) {
      b.col(x0 + i, b.fy + t + ch);
      b.rect(x0 + i, b.fy, x0 + i, b.fy + t - 1, DIRT);
    }
    b.rect(x0 + p, Math.max(2, b.fy - 16), x0 + p + 2, b.fy + t - 1, STEEL);
    const low = b.fy + t + ch;
    for (let i = 0; i < 3 + r.int(6, 10); i++) b.col(x0 + p + i, low);
    b.add({ job: 'digger', x: x0 + p - 6, dir: 1 });
    b.x = x0 + p + 3 + 8;
    for (let i = x0 + p + 3; i < b.x; i++) b.col(i, low);
    b.fy = low;
    return true;
  },
  trapzone: (b, r, o) => strip(b, r, o, 'trap'),
  firestrip: (b, r, o) => strip(b, r, o, 'fire'),
  tunnel: (b, r, o) => tunnel(b, r, o, o.wolf ? 'wolf' : 'trap'),
  firetunnel: (b, r, o) => tunnel(b, r, o, 'fire'),
  gatehouse(b, r, o) {
    if (b.unsafe && !o.first) return false;
    const hg = r.int(10, Math.min(16, b.fy - 8));
    if (hg < 10) return false;
    const a = r.int(8, 12);
    const start = b.x;
    b.flat(a + 3 + r.int(8, 12));
    const gx = start + a;
    b.rect(gx, b.fy - hg, gx + 2, b.fy - 1, GATE);
    b.switches.push({ x: gx + 1, y: b.fy - hg - 1, gate: [gx, b.fy - hg, gx + 2, b.fy - 1] });
    b.add({ job: 'climber', x: start + 2, dir: 1 });
    return true;
  },
};

function pit(b: Builder, r: Rng, o: SegOpts, kind: 'water' | 'fire' | 'deep'): boolean {
  if (kind === 'deep' && b.fy > 50) kind = 'water';
  const lip = r.int(4, 6);
  const g = r.int(5, Math.min(16, 11 + o.act * 2));
  const drop = r.pick([0, 0, 2, 4]);
  if (b.fy + drop > 66) return false;
  b.flat(lip);
  const e = b.x - 1;
  for (let i = 0; i < g; i++) {
    const x = b.x + i;
    if (kind === 'deep') b.col(x, Math.min(H - 3, b.fy + 27));
    else {
      const bottom = b.fy + r.int(9, 12);
      b.col(x, bottom);
      b.rect(x, bottom - 4, x, bottom - 1, kind === 'fire' ? FIRE : WATER);
    }
  }
  // Fill under the liquid surface so the pool is flat.
  if (kind !== 'deep') {
    let top = H;
    for (let i = 0; i < g; i++) for (let y = 0; y < H; y++) if (b.get(b.x + i, y) === WATER || b.get(b.x + i, y) === FIRE) top = Math.min(top, y);
    for (let i = 0; i < g; i++) for (let y = top; y < H; y++) if (b.get(b.x + i, y) === AIR) b.set(b.x + i, y, kind === 'fire' ? FIRE : WATER);
  }
  b.x += g;
  b.flat(30 - g, b.fy + drop);
  b.add({ job: 'builder', x: e, dir: 1 });
  b.fy += drop;
  b.unsafe = true;
  return true;
}

function strip(b: Builder, r: Rng, _o: SegOpts, kind: 'trap' | 'fire'): boolean {
  const x0 = b.x;
  b.flat(36);
  if (kind === 'fire') {
    const w = r.int(4, 7);
    b.rect(x0 + 11, b.fy - 1, x0 + 11 + w, b.fy - 1, FIRE);
  } else {
    b.traps.push({ x: x0 + r.int(11, 13), y: b.fy - 1 });
    b.traps.push({ x: x0 + r.int(17, 20), y: b.fy - 1 });
  }
  b.add({ job: 'builder', x: x0 + 4, dir: 1 });
  b.unsafe = true;
  return true;
}

function tunnel(b: Builder, r: Rng, _o: SegOpts, kind: 'trap' | 'fire' | 'wolf'): boolean {
  const t = r.int(6, 8);
  if (b.fy + t + 2 > 74) return false;
  const a = r.int(5, 8);
  const l = r.int(22, 28);
  const x0 = b.x;
  for (let i = 0; i < a + l; i++) {
    b.col(x0 + i, b.fy);
    b.rect(x0 + i, b.fy + t, x0 + i, b.fy + t + 1, STEEL);
  }
  const digX = x0 + a + 2;
  const face = x0 + a + l;
  if (kind === 'wolf') b.wolf = { x1: digX + 7, x2: face - 3, y: b.fy - 1 };
  else if (kind === 'fire') b.rect(digX + 7, b.fy - 1, digX + 7 + r.int(4, 8), b.fy - 1, FIRE);
  else {
    b.traps.push({ x: digX + r.int(8, 11), y: b.fy - 1 });
    b.traps.push({ x: digX + r.int(15, 19), y: b.fy - 1 });
  }
  const i = b.add({ job: 'digger', x: digX, dir: 1 });
  b.add({ job: 'basher', x: digX + 2, dir: 1, y: b.fy + t - 1, after: i });
  b.x = face;
  b.fy += t;
  b.flat(r.int(8, 12));
  return true;
}

export type NodeKind = 'level' | 'cursed' | 'boss';

export interface LevelReq {
  seed: number;
  act: number;
  /** Row on the act map, 0 = first. */
  depth: number;
  kind: NodeKind;
  curse: Curse | null;
  packs: Pack[];
  herd: number;
  /** Extra jobs the level gives on top of the solution (easy acts). */
  slack: number;
}

const POOLS: Record<Pack, SegKind[]> = {
  meadow: ['wall', 'gap', 'shelf', 'dropdown', 'trapzone'],
  caves: ['tunnel', 'gatehouse', 'deepgap'],
  volcano: ['firegap', 'firestrip', 'firetunnel'],
};

const LEVEL_NAMES = ['Clover Hill', 'Mossy Bank', 'Old Fence', 'Foggy Dip', 'Thistle Run', 'Muddy Lane', 'Stone Step', 'Fern Gully', 'Echo Shelf', 'Crow Rock', 'Bramble Way', 'Lantern Pass', 'Ember Trail', 'Ash Bridge', 'Cinder Steps', 'Dusty Ledge', 'Willow Bend', 'Hollow Log', 'Pebble Ford', 'Windy Top'];

export const needFor = (act: number, depth: number, kind: NodeKind): number => 7 + act * 3 + depth + (kind === 'boss' ? 2 : 0);

export function plan(r: Rng, req: LevelReq): { kinds: SegKind[]; boss: BossId | null } {
  if (req.kind === 'boss') {
    const boss = ACTS[req.act].boss;
    if (boss === 'flood') return { kinds: [r.pick(['wall', 'gap', 'trapzone'] as SegKind[]), r.pick(['wall', 'shelf', 'gap'] as SegKind[]), 'shelf'], boss };
    if (boss === 'wolf') return { kinds: [r.pick(['wall', 'shelf', 'dropdown'] as SegKind[]), 'tunnel', r.pick(['gap', 'wall', 'deepgap'] as SegKind[])], boss };
    return { kinds: [r.pick(['wall', 'firestrip'] as SegKind[]), 'firegap', r.pick(['wall', 'firegap', 'firestrip'] as SegKind[]), 'shelf'], boss };
  }
  const pool = req.packs.flatMap((p) => POOLS[p]);
  const n = req.act === 0 ? 2 : req.act === 1 ? r.int(2, 3) : 3;
  const kinds: SegKind[] = [];
  for (let i = 0; i < n; i++) {
    let k = r.pick(pool);
    if (kinds.includes(k)) k = r.pick(pool);
    kinds.push(k);
  }
  return { kinds, boss: null };
}

export function build(r: Rng, req: LevelReq, kinds: SegKind[], boss: BossId | null): Builder {
  const b = new Builder();
  b.fy = boss === 'flood' || boss === 'furnace' ? r.int(52, 58) : r.int(36, 46);
  b.flat(14);
  let first = true;
  for (const k of kinds) {
    const save = { x: b.x, fy: b.fy, n: b.sol.length, traps: b.traps.length, sw: b.switches.length, unsafe: b.unsafe };
    let ok = SEGS[k](b, r, { first, act: req.act, wolf: boss === 'wolf' && k === 'tunnel' });
    if (!ok) {
      // Undo and put a plain wall or creek there instead.
      b.x = save.x;
      b.fy = save.fy;
      b.sol.length = save.n;
      b.traps.length = save.traps;
      b.switches.length = save.sw;
      b.unsafe = save.unsafe;
      ok = SEGS[b.fy > 30 ? 'wall' : 'gap'](b, r, { first, act: req.act });
      b.segs.push(ok ? (b.fy > 30 ? 'wall' : 'gap') : 'flat');
    } else b.segs.push(k);
    b.flat(r.int(3, 6));
    first = false;
  }
  b.flat(14);
  return b;
}

export function finish(b: Builder, r: Rng, req: LevelReq, boss: BossId | null, theme: Theme): Level {
  const w = b.x;
  const cells = new Uint8Array(w * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) cells[y * w + x] = b.cells[y * W_MAX + x];
  const jobs = emptyJobs();
  for (const t of b.sol) jobs[t.job]++;
  const entryTop = b.get(5, 0) ? 0 : (() => {
    for (let y = 0; y < H; y++) if (b.get(5, y) !== AIR) return y;
    return 40;
  })();
  const exitX = w - 7;
  let exitTop = 0;
  for (let y = 0; y < H; y++)
    if (b.get(exitX, y) !== AIR) {
      exitTop = y;
      break;
    }
  const lv: Level = {
    name: boss ? '' : r.pick(LEVEL_NAMES),
    theme,
    w,
    cells,
    entry: { x: 5, y: entryTop - 11, dir: 1 },
    exit: { x: exitX, y: exitTop - 1 },
    traps: b.traps,
    switches: b.switches,
    wolf: b.wolf,
    flood: null,
    jobs,
    solution: b.sol,
    count: Math.min(40, req.herd),
    need: 1,
    time: 30 * 600,
    interval: 22,
    speed: req.curse === 'fast' ? SPEED_FAST : SPEED_NORMAL,
    lethal: req.curse === 'fragile' ? FRAGILE_LETHAL : LETHAL,
    curse: req.curse,
    boss,
    segs: b.segs,
  };
  if (boss === 'flood' || boss === 'furnace') {
    lv.flood = { start: 240, period: boss === 'flood' ? r.int(30, 40) : r.int(24, 32), type: boss === 'flood' ? WATER : FIRE, stop: exitTop };
  }
  return lv;
}

export interface Checked {
  lv: Level;
  /** How many the known solution saves. */
  best: number;
  attempts: number;
}

/** Saved count over time for the known solution, to set the need and the clock. */
function savedTimes(lv: Level): number[] {
  const g = newGame(lv);
  const ctrl = solutionCtrl(lv.solution);
  const times: number[] = [];
  let last = 0;
  for (let i = 0; i < 20000 && !g.over; i++) {
    playOut(g, ctrl, 1);
    while (last < g.saved) {
      times.push(g.tick);
      last++;
    }
  }
  return times;
}

/** Makes a level and proves it with the known solution. */
export function makeLevel(req: LevelReq): Checked {
  const theme = ACTS[req.act].theme;
  const count = Math.min(40, req.herd);
  const want = Math.min(count, needFor(req.act, req.depth, req.kind));
  for (let a = 0; a < 16; a++) {
    const r = new Rng(hash(req.seed, 'lvl', a));
    const { kinds, boss } = plan(r, req);
    const b = build(r, req, kinds, boss);
    if (b.x > W_MAX - 4) continue;
    const lv = finish(b, r, req, boss, theme);
    const times = savedTimes(lv);
    const best = times.length;
    if (best < Math.max(want, Math.ceil(count * 0.8))) continue;
    return { lv: finalize(lv, times, want, req), best, attempts: a + 1 };
  }
  // Fallback: a plain wall level that always works.
  const r = new Rng(hash(req.seed, 'fallback'));
  const b = build(r, req, ['wall'], null);
  const lv = finish(b, r, { ...req, curse: null }, null, theme);
  const times = savedTimes(lv);
  return { lv: finalize(lv, times, Math.min(want, times.length), req), best: times.length, attempts: 17 };
}

function finalize(lv: Level, times: number[], want: number, req: LevelReq): Level {
  const need = Math.max(1, Math.min(want, times.length));
  const tNeed = times[need - 1] ?? 600;
  const tAll = times[times.length - 1] ?? 600;
  lv.need = need;
  lv.time = req.curse === 'short' ? Math.round(tNeed * 1.15 + 150) : Math.round(tAll * 1.45 + 600);
  lv.time = Math.ceil(lv.time / 30) * 30;
  if (req.slack > 0) for (const j of JOB_IDS) if (lv.jobs[j] > 0) lv.jobs[j] += req.slack;
  return lv;
}

