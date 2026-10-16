/**
 * Fixed-step ball physics on a polyline course. No randomness: the aim arc,
 * the real shot and the bot all call the same `stepShot`.
 * World units: y grows downward, like the canvas.
 */

export type Surface = 'grass' | 'green' | 'sand' | 'ice' | 'water' | 'spikes' | 'rock';

export const DT = 1 / 120;
export const G = 600;
export const R = 6;
/** Half width and depth of a cup notch. */
export const CUP_HW = 12;
export const CUP_D = 16;
export const PICK_R = 16;

/** e: bounce, keep: tangent speed kept on a bounce, roll: rolling slow-down (units/s²). */
export const SURF: Record<Surface, { e: number; keep: number; roll: number }> = {
  grass: { e: 0.36, keep: 0.8, roll: 200 },
  green: { e: 0.3, keep: 0.85, roll: 110 },
  sand: { e: 0.06, keep: 0.25, roll: 900 },
  ice: { e: 0.36, keep: 0.97, roll: 36 },
  water: { e: 0.6, keep: 0.9, roll: 120 },
  spikes: { e: 0.72, keep: 0.75, roll: 260 },
  rock: { e: 0.5, keep: 0.85, roll: 220 },
};

export interface Pt {
  x: number;
  y: number;
  /** Surface of the segment that ends at this point. */
  s: Surface;
}

export interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  s: Surface;
}

/** A rock block. Moving blocks swing around (x, y) with the hole clock. */
export interface Block {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
  period: number;
  phase: number;
}

export interface Pickup {
  kind: 'idol' | 'coin';
  x: number;
  y: number;
}

export interface Cup {
  x: number;
  /** Rim height. */
  y: number;
}

export interface Course {
  w: number;
  pts: Pt[];
  segs: Seg[];
  cups: Cup[];
  blocks: Block[];
  pickups: Pickup[];
  tee: { x: number; y: number };
  top: number;
  bottom: number;
  /** Segment indexes per 64-unit column. */
  grid: number[][];
}

export interface Env {
  open: number;
  taken: boolean[];
  /** Hole clock at the start of the shot. Moving blocks use it. */
  t0: number;
  wind: number;
  curve: boolean;
  skip: boolean;
  sticky: boolean;
  frozen: boolean;
  /** Flight aces planned at fixed times (bot search and replays). */
  plan?: { t: number; kind: 'brake' | 'rocket' }[];
}

export type Ev =
  | { k: 'bounce'; x: number; y: number; v: number; s: Surface }
  | { k: 'spike'; x: number; y: number }
  | { k: 'water'; x: number; y: number }
  | { k: 'skip'; x: number; y: number }
  | { k: 'pickup'; x: number; y: number; i: number }
  | { k: 'cup'; x: number; y: number };

export type End = 'stop' | 'cup' | 'water' | 'spikes' | 'lost';

export interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  ground: boolean;
  rest: number;
  slow: number;
  /** Surface touched last, and the contact normal. */
  surf: Surface;
  nx: number;
  ny: number;
  airborne: boolean;
  landed: boolean;
  spiked: boolean;
  got: number[];
  events: Ev[];
  done: boolean;
  end: End | null;
  /** Trail for drawing. */
  trail: { x: number; y: number }[];
}

const CELL = 64;

export function buildGrid(c: Course): void {
  const cols = Math.ceil(c.w / CELL) + 2;
  c.grid = Array.from({ length: cols }, () => []);
  c.segs.forEach((s, i) => {
    const a = Math.max(0, Math.floor((Math.min(s.x1, s.x2) - R - 2) / CELL));
    const b = Math.min(cols - 1, Math.floor((Math.max(s.x1, s.x2) + R + 2) / CELL));
    for (let k = a; k <= b; k++) c.grid[k].push(i);
  });
}

export function blockPos(b: Block, t: number): { x: number; y: number } {
  const a = (2 * Math.PI * t) / b.period + b.phase;
  return { x: b.x + b.ax * Math.sin(a), y: b.y + b.ay * Math.sin(a) };
}

export function newShot(x: number, y: number, vx: number, vy: number, surf: Surface): Shot {
  return {
    x,
    y,
    vx,
    vy,
    t: 0,
    ground: false,
    rest: 0,
    slow: 0,
    surf,
    nx: 0,
    ny: -1,
    airborne: true,
    landed: false,
    spiked: false,
    got: [],
    events: [],
    done: false,
    end: null,
    trail: [],
  };
}

function finish(sh: Shot, end: End): void {
  sh.done = true;
  sh.end = end;
}

/** Apply a contact with normal (nx, ny) on a surface. */
function contact(sh: Shot, nx: number, ny: number, s: Surface, env: Env): void {
  let surf = s;
  if (surf === 'water' && env.frozen) surf = 'ice';
  if (surf === 'water' && !env.skip) {
    sh.events.push({ k: 'water', x: sh.x, y: sh.y });
    return finish(sh, 'water');
  }
  if (surf === 'spikes' && !sh.spiked) {
    sh.spiked = true;
    sh.events.push({ k: 'spike', x: sh.x, y: sh.y });
  }
  const p = SURF[surf];
  const vn = sh.vx * nx + sh.vy * ny;
  if (vn < 0) {
    const tx = -ny;
    const ty = nx;
    const vt = sh.vx * tx + sh.vy * ty;
    let vn2 = 0;
    let vt2 = vt;
    if (-vn > 50) {
      if (env.sticky && ny < -0.3 && surf !== 'water') {
        sh.vx = 0;
        sh.vy = 0;
        sh.surf = surf;
        sh.nx = nx;
        sh.ny = ny;
        sh.events.push({ k: 'bounce', x: sh.x, y: sh.y, v: -vn, s: surf });
        return finish(sh, surf === 'spikes' ? 'spikes' : 'stop');
      }
      vn2 = -vn * p.e;
      vt2 = vt * p.keep;
      if (-vn > 90) sh.events.push(surf === 'water' ? { k: 'skip', x: sh.x, y: sh.y } : { k: 'bounce', x: sh.x, y: sh.y, v: -vn, s: surf });
    }
    sh.vx = vn2 * nx + vt2 * tx;
    sh.vy = vn2 * ny + vt2 * ty;
  }
  if (ny < -0.35) {
    sh.ground = true;
    sh.landed = true;
  }
  sh.surf = surf;
  sh.nx = nx;
  sh.ny = ny;
}

function hitSeg(sh: Shot, s: Seg, env: Env): void {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return;
  let t = ((sh.x - s.x1) * dx + (sh.y - s.y1) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = s.x1 + t * dx;
  const py = s.y1 + t * dy;
  const ex = sh.x - px;
  const ey = sh.y - py;
  const d2 = ex * ex + ey * ey;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2);
  let nx: number;
  let ny: number;
  if (d < 1e-6) {
    const l = Math.sqrt(l2);
    nx = dy / l;
    ny = -dx / l;
  } else {
    nx = ex / d;
    ny = ey / d;
  }
  sh.x = px + nx * R;
  sh.y = py + ny * R;
  contact(sh, nx, ny, s.s, env);
}

function hitBlock(sh: Shot, b: Block, env: Env): void {
  const p = blockPos(b, env.t0 + sh.t);
  const l = p.x - b.w / 2;
  const r = p.x + b.w / 2;
  const t = p.y - b.h / 2;
  const bt = p.y + b.h / 2;
  if (sh.x < l - R || sh.x > r + R || sh.y < t - R || sh.y > bt + R) return;
  const cx = Math.max(l, Math.min(r, sh.x));
  const cy = Math.max(t, Math.min(bt, sh.y));
  const ex = sh.x - cx;
  const ey = sh.y - cy;
  const d2 = ex * ex + ey * ey;
  let nx: number;
  let ny: number;
  if (d2 > 1e-9) {
    if (d2 >= R * R) return;
    const d = Math.sqrt(d2);
    nx = ex / d;
    ny = ey / d;
    sh.x = cx + nx * R;
    sh.y = cy + ny * R;
  } else {
    // The center is inside: push out on the shortest axis.
    const pen = [sh.x - l, r - sh.x, sh.y - t, bt - sh.y];
    const m = pen.indexOf(Math.min(...pen));
    nx = m === 0 ? -1 : m === 1 ? 1 : 0;
    ny = m === 2 ? -1 : m === 3 ? 1 : 0;
    if (m === 0) sh.x = l - R;
    else if (m === 1) sh.x = r + R;
    else if (m === 2) sh.y = t - R;
    else sh.y = bt + R;
  }
  contact(sh, nx, ny, 'rock', env);
}

/** Lids close the cups that are not open (boss holes have several cups). */
function lid(c: Cup): Seg {
  return { x1: c.x - CUP_HW - 1, y1: c.y, x2: c.x + CUP_HW + 1, y2: c.y, s: 'green' };
}

/** One fixed step of DT. */
export function stepShot(c: Course, sh: Shot, env: Env): void {
  if (sh.done) return;
  if (env.plan) {
    for (const p of env.plan) if (Math.abs(p.t - sh.t) < DT / 2) flightAce(sh, p.kind);
  }
  const air = !sh.ground;
  sh.ground = false;
  if (air) {
    sh.vx += env.wind * DT;
    if (env.curve) {
      const cx = c.cups[env.open].x;
      sh.vx += Math.sign(cx - sh.x) * 160 * DT;
    }
  }
  sh.vy += G * DT;
  const sp = Math.hypot(sh.vx, sh.vy);
  const n = Math.max(1, Math.ceil((sp * DT) / (R * 0.45)));
  for (let i = 0; i < n && !sh.done; i++) {
    sh.x += (sh.vx * DT) / n;
    sh.y += (sh.vy * DT) / n;
    const col = Math.floor(sh.x / CELL);
    const ids = c.grid[Math.max(0, Math.min(c.grid.length - 1, col))];
    for (const k of ids) {
      hitSeg(sh, c.segs[k], env);
      if (sh.done) return;
    }
    c.cups.forEach((cup, j) => {
      if (j !== env.open && Math.abs(cup.x - sh.x) < CUP_HW + R + 2) hitSeg(sh, lid(cup), env);
    });
    for (const b of c.blocks) {
      hitBlock(sh, b, env);
      if (sh.done) return;
    }
    const cup = c.cups[env.open];
    if (Math.abs(sh.x - cup.x) < CUP_HW - 1 && sh.y > cup.y + 1) {
      sh.events.push({ k: 'cup', x: cup.x, y: cup.y });
      return finish(sh, 'cup');
    }
  }
  // Pickups
  c.pickups.forEach((p, i) => {
    if (env.taken[i] || sh.got.includes(i)) return;
    if (Math.abs(p.x - sh.x) < PICK_R + R && Math.hypot(p.x - sh.x, p.y - sh.y) < PICK_R + R) {
      sh.got.push(i);
      sh.events.push({ k: 'pickup', x: p.x, y: p.y, i });
    }
  });
  if (sh.ground) {
    sh.airborne = false;
    const roll = SURF[sh.surf].roll;
    const v = Math.hypot(sh.vx, sh.vy);
    if (v > 0) {
      const k = Math.max(0, v - roll * DT) / v;
      sh.vx *= k;
      sh.vy *= k;
    }
    if (sh.surf === 'water' && v < 140) {
      sh.events.push({ k: 'water', x: sh.x, y: sh.y });
      return finish(sh, 'water');
    }
  } else sh.airborne = true;
  sh.t += DT;
  const v = Math.hypot(sh.vx, sh.vy);
  if (sh.ground && v < 9) sh.rest += DT;
  else sh.rest = 0;
  if (v < 4) sh.slow += DT;
  else sh.slow = 0;
  if (sh.rest > 0.2 || sh.slow > 1) {
    sh.vx = 0;
    sh.vy = 0;
    return finish(sh, sh.surf === 'spikes' ? 'spikes' : 'stop');
  }
  if (sh.y > c.bottom + 200 || sh.x < -50 || sh.x > c.w + 50) return finish(sh, 'lost');
  if (sh.t > 30) {
    sh.vx = 0;
    sh.vy = 0;
    finish(sh, sh.surf === 'spikes' ? 'spikes' : 'stop');
  }
}

/** In-flight aces. Brake drops the ball straight down. Rocket boosts it. */
export function flightAce(sh: Shot, kind: 'brake' | 'rocket'): void {
  if (kind === 'brake') {
    sh.vx = 0;
    sh.vy = 0;
  } else {
    const v = Math.hypot(sh.vx, sh.vy) || 1;
    sh.vx += (sh.vx / v) * 320;
    sh.vy += (sh.vy / v) * 320 - 60;
  }
}

/** Run a shot to its end. Returns the finished shot. */
export function runShot(c: Course, sh: Shot, env: Env, maxSteps = 4000): Shot {
  for (let i = 0; i < maxSteps && !sh.done; i++) stepShot(c, sh, env);
  if (!sh.done) finish(sh, sh.surf === 'spikes' ? 'spikes' : 'stop');
  return sh;
}

/**
 * Aim arc: the first `secs` of the flight. Stops at the first ground contact
 * unless `roll` is set (the putter shows its roll).
 */
export function trace(c: Course, sh: Shot, env: Env, secs: number, roll: boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const steps = Math.round(secs / DT);
  for (let i = 0; i < steps && !sh.done; i++) {
    stepShot(c, sh, env);
    if (i % 3 === 0) out.push({ x: sh.x, y: sh.y });
    if (!roll && sh.landed) break;
  }
  out.push({ x: sh.x, y: sh.y });
  return out;
}

/** Ground height under x (the highest segment), for placing things. */
export function groundY(c: Course, x: number): number {
  let best = Infinity;
  for (const s of c.segs) {
    const a = Math.min(s.x1, s.x2);
    const b = Math.max(s.x1, s.x2);
    if (x < a || x > b || a === b) continue;
    const y = s.y1 + ((x - s.x1) / (s.x2 - s.x1)) * (s.y2 - s.y1);
    if (y < best) best = y;
  }
  return best === Infinity ? 0 : best;
}
