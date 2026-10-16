/**
 * The level simulation. Pure state and integer math, no DOM.
 * The same code runs in the browser, in the level checker and in the balance sim.
 */
import { JOB_IDS, type BossId, type Curse, type Job, type Theme } from './data';

export const H = 80;
export const TPS = 30;

// Cell types of the terrain mask.
export const AIR = 0;
export const DIRT = 1;
export const STEEL = 2;
export const WATER = 3;
export const FIRE = 4;
export const BRICK = 5;
export const GATE = 6;

export const solidT = (t: number): boolean => t === DIRT || t === STEEL || t === BRICK || t === GATE;
export const softT = (t: number): boolean => t === DIRT || t === BRICK;
export const deadlyT = (t: number): boolean => t === WATER || t === FIRE;

export const LETHAL = 22;
export const FRAGILE_LETHAL = 16;
export const FUSE = 90;
export const BRICKS = 12;
const DIG_T = 6;
const BASH_T = 4;
const BUILD_T = 6;
const CLIMB_T = 2;
const BLAST = 6;
const TRAP_COOL = 45;
/** Walk speed is `speed / 4` cells per tick. */
export const SPEED_NORMAL = 2;
export const SPEED_FAST = 3;

/** One step of a known solution: the first critter that matches gets the job. */
export interface Trigger {
  job: Job;
  x: number;
  /** Feet row of the critter that gets the job. */
  y: number;
  dir?: 1 | -1;
  state?: 'walk' | 'block';
  /** Index of a trigger that must fire first. */
  after?: number;
}

export interface SwitchDef {
  x: number;
  y: number;
  gate: [number, number, number, number];
}

export interface Level {
  name: string;
  theme: Theme;
  w: number;
  cells: Uint8Array;
  entry: { x: number; y: number; dir: 1 | -1 };
  exit: { x: number; y: number };
  traps: { x: number; y: number }[];
  switches: SwitchDef[];
  wolf: { x1: number; x2: number; y: number } | null;
  flood: { start: number; period: number; type: number; stop: number } | null;
  /** Job counts the known solution needs. */
  jobs: Record<Job, number>;
  solution: Trigger[];
  count: number;
  need: number;
  /** Time limit in ticks. */
  time: number;
  interval: number;
  speed: number;
  lethal: number;
  curse: Curse | null;
  boss: BossId | null;
  segs: string[];
}

export type St = 'fall' | 'walk' | 'block' | 'dig' | 'bash' | 'build' | 'climb' | 'saved' | 'dead';

export interface Critter {
  id: number;
  x: number;
  y: number;
  dir: 1 | -1;
  st: St;
  fall: number;
  acc: number;
  t: number;
  bricks: number;
  climber: boolean;
  floater: boolean;
  fuse: number;
  /** Ticks since the critter came out, for animation. */
  age: number;
}

export type EvKind = 'spawn' | 'save' | 'splat' | 'drown' | 'burn' | 'boom' | 'dig' | 'brick' | 'switch' | 'trap' | 'wolf' | 'assign';

export interface Ev {
  k: EvKind;
  x: number;
  y: number;
}

export interface Game {
  lv: Level;
  cells: Uint8Array;
  w: number;
  tick: number;
  crit: Critter[];
  spawned: number;
  saved: number;
  dead: number;
  jobs: Record<Job, number>;
  traps: { x: number; y: number; cool: number }[];
  sw: boolean[];
  wolf: { x: number; y: number; dir: 1 | -1; acc: number } | null;
  floodRow: number;
  nuked: boolean;
  over: boolean;
  ev: Ev[];
  /** Goes up when the terrain changes, so the renderer can redraw it. */
  ver: number;
  /** Tick of the last save or death. */
  lastChange: number;
}

export const emptyJobs = (): Record<Job, number> => Object.fromEntries(JOB_IDS.map((j) => [j, 0])) as Record<Job, number>;

export function newGame(lv: Level, extra?: Partial<Record<Job, number>>): Game {
  const jobs = emptyJobs();
  for (const j of JOB_IDS) jobs[j] = lv.jobs[j] + (extra?.[j] ?? 0);
  return {
    lv,
    cells: lv.cells.slice(),
    w: lv.w,
    tick: 0,
    crit: [],
    spawned: 0,
    saved: 0,
    dead: 0,
    jobs,
    traps: lv.traps.map((t) => ({ ...t, cool: 0 })),
    sw: lv.switches.map(() => false),
    wolf: lv.wolf ? { x: lv.wolf.x1, y: lv.wolf.y, dir: 1, acc: 0 } : null,
    floodRow: H - 2,
    nuked: false,
    over: false,
    ev: [],
    ver: 0,
    lastChange: 0,
  };
}

export const cellAt = (g: Game, x: number, y: number): number => (x < 0 || x >= g.w || y < 0 ? STEEL : y >= H ? AIR : g.cells[y * g.w + x]);
const solid = (g: Game, x: number, y: number): boolean => solidT(cellAt(g, x, y));

function setCell(g: Game, x: number, y: number, t: number): void {
  if (x < 0 || x >= g.w || y < 0 || y >= H) return;
  g.cells[y * g.w + x] = t;
}

export const alive = (c: Critter): boolean => c.st !== 'dead' && c.st !== 'saved';

function kill(g: Game, c: Critter, k: EvKind): void {
  c.st = 'dead';
  g.dead++;
  g.lastChange = g.tick;
  g.ev.push({ k, x: c.x, y: c.y });
}

function turn(c: Critter): void {
  c.dir = c.dir === 1 ? -1 : 1;
}

function startFall(c: Critter): void {
  c.st = 'fall';
  c.fall = 0;
}

/** Can this critter take this job right now? */
export function canAssign(g: Game, c: Critter, job: Job): boolean {
  if (!alive(c) || g.jobs[job] <= 0) return false;
  switch (job) {
    case 'climber':
      return !c.climber;
    case 'floater':
      return !c.floater;
    case 'bomber':
      return c.fuse < 0;
    case 'blocker':
      return c.st === 'walk';
    default:
      return c.st === 'walk' || c.st === 'block' || ((c.st === 'dig' || c.st === 'bash' || c.st === 'build') && !(c.st === jobState(job)));
  }
}

const jobState = (job: Job): St | null => (job === 'digger' ? 'dig' : job === 'basher' ? 'bash' : job === 'builder' ? 'build' : null);

export function assign(g: Game, c: Critter, job: Job): boolean {
  if (!canAssign(g, c, job)) return false;
  g.jobs[job]--;
  c.t = 0;
  switch (job) {
    case 'climber':
      c.climber = true;
      break;
    case 'floater':
      c.floater = true;
      break;
    case 'bomber':
      c.fuse = FUSE;
      break;
    case 'blocker':
      c.st = 'block';
      break;
    case 'digger':
      c.st = 'dig';
      break;
    case 'basher':
      c.st = 'bash';
      break;
    case 'builder':
      c.st = 'build';
      c.bricks = 0;
      break;
  }
  g.ev.push({ k: 'assign', x: c.x, y: c.y });
  return true;
}

/** Every critter that is out gets a short fuse. Spawning stops. */
export function nuke(g: Game): void {
  if (g.nuked) return;
  g.nuked = true;
  let i = 0;
  for (const c of g.crit) {
    if (!alive(c)) continue;
    if (c.fuse < 0 || c.fuse > 20 + i * 3) c.fuse = 20 + i * 3;
    i++;
  }
}

function explode(g: Game, c: Critter): void {
  const cx = c.x;
  const cy = c.y - 2;
  for (let dy = -BLAST; dy <= BLAST; dy++) {
    for (let dx = -BLAST; dx <= BLAST; dx++) {
      if (dx * dx + dy * dy > BLAST * BLAST + 2) continue;
      const y = cy + dy;
      if (y > c.y) continue;
      if (softT(cellAt(g, cx + dx, y))) setCell(g, cx + dx, y, AIR);
    }
  }
  g.ver++;
  kill(g, c, 'boom');
}

/** A worker that blocks the path: walkers wait behind it instead of turning. */
function workerAhead(g: Game, c: Critter): boolean {
  for (const o of g.crit) {
    if (o === c || o.dir !== c.dir || (o.st !== 'bash' && o.st !== 'build')) continue;
    const d = (o.x - c.x) * c.dir;
    if (d >= 0 && d <= 2 && Math.abs(o.y - c.y) <= 3 ) return true;
  }
  return false;
}

function blockerAhead(g: Game, c: Critter, nx: number): boolean {
  for (const o of g.crit) {
    if (o === c || o.st !== 'block') continue;
    const d = (o.x - c.x) * c.dir;
    if (d > 0 && d <= 2 && Math.abs(o.y - c.y) <= 3 && Math.abs(o.x - nx) <= 1) return true;
  }
  return false;
}

function walkStep(g: Game, c: Critter): void {
  const nx = c.x + c.dir;
  if (blockerAhead(g, c, nx)) return turn(c);
  if (workerAhead(g, c)) return;
  if (solid(g, nx, c.y)) {
    let rise = 1;
    while (rise <= 3 && solid(g, nx, c.y - rise)) rise++;
    if (rise <= 2) {
      c.x = nx;
      c.y -= rise;
    } else if (c.climber) {
      c.st = 'climb';
      c.t = 0;
    } else turn(c);
    return;
  }
  c.x = nx;
  if (solid(g, nx, c.y + 1)) return;
  if (solid(g, nx, c.y + 2)) c.y += 1;
  else if (solid(g, nx, c.y + 3)) c.y += 2;
  else startFall(c);
}

function update(g: Game, c: Critter): void {
  c.age++;
  if (c.fuse > 0) {
    c.fuse--;
    if (c.fuse === 0) return explode(g, c);
  }
  const here = cellAt(g, c.x, c.y);
  const head = cellAt(g, c.x, c.y - 1);
  if (deadlyT(here) || deadlyT(head)) return kill(g, c, here === FIRE || head === FIRE ? 'burn' : 'drown');
  if (solidT(here) && c.st !== 'fall') {
    // Buried by a closing gate or bricks: push up.
    c.y--;
  }
  switch (c.st) {
    case 'fall': {
      if (solid(g, c.x, c.y + 1)) {
        if (c.fall > g.lv.lethal && !c.floater) return kill(g, c, 'splat');
        c.st = 'walk';
        c.fall = 0;
        return;
      }
      if (c.floater && c.fall >= 6) {
        c.t++;
        if (c.t % 3 !== 0) return;
      }
      c.y++;
      c.fall++;
      if (c.y >= H - 1) kill(g, c, 'splat');
      return;
    }
    case 'walk': {
      if (!solid(g, c.x, c.y + 1)) return startFall(c);
      c.acc += g.lv.speed;
      if (c.acc < 4) return;
      c.acc -= 4;
      walkStep(g, c);
      return;
    }
    case 'block':
      if (!solid(g, c.x, c.y + 1)) startFall(c);
      return;
    case 'dig': {
      if (!solid(g, c.x, c.y + 1) && !solid(g, c.x - 1, c.y + 1) && !solid(g, c.x + 1, c.y + 1)) return startFall(c);
      c.t++;
      if (c.t % DIG_T !== 0) return;
      for (let dx = -1; dx <= 1; dx++) {
        const t = cellAt(g, c.x + dx, c.y + 1);
        if (t === STEEL || t === GATE) {
          c.st = 'walk';
          return;
        }
      }
      for (let dx = -2; dx <= 2; dx++) if (softT(cellAt(g, c.x + dx, c.y + 1))) setCell(g, c.x + dx, c.y + 1, AIR);
      g.ver++;
      g.ev.push({ k: 'dig', x: c.x, y: c.y + 1 });
      c.y++;
      if (!solid(g, c.x, c.y + 1) && !solid(g, c.x - 1, c.y + 1) && !solid(g, c.x + 1, c.y + 1)) startFall(c);
      return;
    }
    case 'bash': {
      if (!solid(g, c.x, c.y + 1)) return startFall(c);
      c.t++;
      if (c.t % BASH_T !== 0) return;
      const ahead = (from: number, to: number, test: (t: number) => boolean): boolean => {
        for (let k = from; k <= to; k++) for (let dy = 0; dy <= 3; dy++) if (test(cellAt(g, c.x + c.dir * k, c.y - dy))) return true;
        return false;
      };
      if (ahead(1, 1, (t) => t === STEEL || t === GATE)) {
        c.st = 'walk';
        return;
      }
      if (c.t > BASH_T * 3 && !ahead(1, 4, softT)) {
        c.st = 'walk';
        return;
      }
      for (let k = 1; k <= 2; k++) {
        for (let dy = 0; dy <= 4; dy++) {
          const x = c.x + c.dir * k;
          if (softT(cellAt(g, x, c.y - dy))) setCell(g, x, c.y - dy, AIR);
        }
      }
      g.ver++;
      g.ev.push({ k: 'dig', x: c.x + c.dir * 2, y: c.y - 2 });
      const nx = c.x + c.dir;
      if (!solid(g, nx, c.y)) c.x = nx;
      if (!solid(g, c.x, c.y + 1)) {
        if (solid(g, c.x, c.y + 2)) c.y++;
        else startFall(c);
      }
      return;
    }
    case 'build': {
      c.t++;
      if (c.t % BUILD_T !== 0) return;
      if (c.bricks >= BRICKS) {
        c.st = 'walk';
        return;
      }
      if (solid(g, c.x + c.dir, c.y)) {
        c.st = 'walk';
        return;
      }
      for (let k = 1; k <= 3; k++) if (cellAt(g, c.x + c.dir * k, c.y) === AIR) setCell(g, c.x + c.dir * k, c.y, BRICK);
      c.bricks++;
      g.ver++;
      g.ev.push({ k: 'brick', x: c.x + c.dir * 2, y: c.y });
      // Step up onto the new brick and forward.
      const ny = c.y - 1;
      for (let s = 0; s < 2; s++) {
        const nx = c.x + c.dir;
        if (solid(g, nx, ny) || solid(g, nx, ny - 3)) {
          c.st = 'walk';
          return;
        }
        c.x = nx;
        c.y = ny;
      }
      return;
    }
    case 'climb': {
      c.t++;
      if (c.t % CLIMB_T !== 0) return;
      if (solid(g, c.x, c.y - 4) || c.y < 5) {
        turn(c);
        return startFall(c);
      }
      c.y--;
      if (!solid(g, c.x + c.dir, c.y)) {
        c.x += c.dir;
        c.st = 'walk';
      }
      return;
    }
    default:
      return;
  }
}

/** Advance the level by one tick. `ctrl` may assign jobs first (bots). */
export function tick(g: Game, ctrl?: (g: Game) => void): void {
  if (g.over) return;
  ctrl?.(g);
  const lv = g.lv;
  if (!g.nuked && g.spawned < lv.count && g.tick >= 15 && (g.tick - 15) % lv.interval === 0) {
    g.crit.push({ id: g.spawned, x: lv.entry.x, y: lv.entry.y, dir: lv.entry.dir, st: 'fall', fall: 0, acc: 0, t: 0, bricks: 0, climber: false, floater: false, fuse: -1, age: 0 });
    g.spawned++;
    g.ev.push({ k: 'spawn', x: lv.entry.x, y: lv.entry.y });
  }
  for (const c of g.crit) {
    if (!alive(c)) continue;
    update(g, c);
    if (alive(c) && Math.abs(c.x - lv.exit.x) <= 1 && c.y <= lv.exit.y && c.y >= lv.exit.y - 5) {
      c.st = 'saved';
      g.saved++;
      g.lastChange = g.tick;
      g.ev.push({ k: 'save', x: c.x, y: c.y });
    }
  }
  // Switches open gates.
  lv.switches.forEach((s, i) => {
    if (g.sw[i]) return;
    if (!g.crit.some((c) => alive(c) && Math.abs(c.x - s.x) <= 1 && Math.abs(c.y - s.y) <= 1)) return;
    g.sw[i] = true;
    const [x0, y0, x1, y1] = s.gate;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (cellAt(g, x, y) === GATE) setCell(g, x, y, AIR);
    g.ver++;
    g.ev.push({ k: 'switch', x: s.x, y: s.y });
  });
  // Traps snap the first critter on them, then reload.
  for (const t of g.traps) {
    if (t.cool > 0) {
      t.cool--;
      continue;
    }
    const c = g.crit.find((c) => alive(c) && c.st !== 'fall' && Math.abs(c.x - t.x) <= 1 && Math.abs(c.y - t.y) <= 1);
    if (c) {
      t.cool = TRAP_COOL;
      kill(g, c, 'trap');
    }
  }
  // The wolf patrols its field.
  if (g.wolf && lv.wolf) {
    const wf = g.wolf;
    wf.acc += 3;
    if (wf.acc >= 4) {
      wf.acc -= 4;
      wf.x += wf.dir;
      if (wf.x >= lv.wolf.x2) wf.dir = -1;
      if (wf.x <= lv.wolf.x1) wf.dir = 1;
    }
    for (const c of g.crit) if (alive(c) && Math.abs(c.x - wf.x) <= 2 && Math.abs(c.y - wf.y) <= 3) kill(g, c, 'wolf');
  }
  // Rising water or lava.
  if (lv.flood && g.tick >= lv.flood.start && (g.tick - lv.flood.start) % lv.flood.period === 0 && g.floodRow - 1 > lv.flood.stop) {
    g.floodRow--;
    for (let x = 0; x < g.w; x++) if (cellAt(g, x, g.floodRow) === AIR) setCell(g, x, g.floodRow, lv.flood.type);
    g.ver++;
  }
  g.tick++;
  const busy = g.crit.some((c) => alive(c) && c.st !== 'block');
  const allOut = g.nuked || g.spawned >= lv.count;
  if ((allOut && !busy) || g.tick >= lv.time) {
    g.over = true;
  }
}

/** Critters that came out and did not reach the exit. */
export const lostCount = (g: Game): number => g.spawned - g.saved;

export const won = (g: Game): boolean => g.saved >= g.lv.need;
