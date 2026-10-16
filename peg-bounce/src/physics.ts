import type { Rng } from './rng';

/** Board size in board units. The renderer scales it to the screen. */
export const BW = 400;
export const BH = 520;
export const LAUNCH = { x: BW / 2, y: 20 };
export const SPEED = 560;
export const GRAV = 900;
export const PEG_R = 7;
export const DT = 1 / 240;
const MAX_T = 25;
const BOMB_RADIUS = 72;

export type PegKind = 'normal' | 'crit' | 'refresh' | 'bomb';

export interface Peg {
  x: number;
  y: number;
  r: number;
  kind: PegKind;
  /** Hit in the current shot. */
  hit: boolean;
  /** Out of play until the next refresh. */
  broken: boolean;
  bombHits: number;
}

export interface Board {
  pegs: Peg[];
  /** Bucket clock. It keeps running across shots. */
  phase: number;
  bucketW: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  e: number;
  g: number;
  ghost: number;
  canSplit: boolean;
  touching: number[];
  pass: number[];
  slow: number;
  wallT: number;
  alive: boolean;
}

export type ShotEventKind = 'peg' | 'crit' | 'refresh' | 'bomb' | 'bombhit' | 'wall' | 'bucket' | 'split';

export interface ShotEvent {
  kind: ShotEventKind;
  x: number;
  y: number;
}

export interface ShotOpts {
  r: number;
  e: number;
  g: number;
  ghost: number;
  split: boolean;
  /** Bomb pegs explode after this many hits. */
  bombAt: number;
}

export interface Shot {
  balls: Ball[];
  t: number;
  pegHits: number;
  critHits: number;
  crit: boolean;
  refresh: boolean;
  bombs: number;
  walls: number;
  bucket: boolean;
  /** New events since the renderer last read them. */
  events: ShotEvent[];
  done: boolean;
}

export const bucketX = (b: Board, t: number): number => BW / 2 + Math.sin((b.phase + t) * 1.25) * (BW / 2 - b.bucketW / 2 - 6);

function makeBall(x: number, y: number, vx: number, vy: number, o: ShotOpts, canSplit: boolean): Ball {
  return { x, y, vx, vy, r: o.r, e: o.e, g: o.g, ghost: o.ghost, canSplit, touching: [], pass: [], slow: 0, wallT: 0, alive: true };
}

export function aimVector(angle: number): { vx: number; vy: number } {
  return { vx: Math.cos(angle) * SPEED, vy: Math.sin(angle) * SPEED };
}

/** Aim angles point downward: 0 is right, PI/2 straight down, PI left. */
export const clampAngle = (a: number): number => Math.max(0.12, Math.min(Math.PI - 0.12, a));

export function newShot(angle: number, o: ShotOpts): Shot {
  const v = aimVector(angle);
  return {
    balls: [makeBall(LAUNCH.x, LAUNCH.y, v.vx, v.vy, o, o.split)],
    t: 0,
    pegHits: 0,
    critHits: 0,
    crit: false,
    refresh: false,
    bombs: 0,
    walls: 0,
    bucket: false,
    events: [],
    done: false,
  };
}

function explode(b: Board, s: Shot, i: number, o: ShotOpts): void {
  const p = b.pegs[i];
  p.broken = true;
  s.bombs++;
  s.events.push({ kind: 'bomb', x: p.x, y: p.y });
  b.pegs.forEach((q, j) => {
    if (j === i || q.broken) return;
    if (Math.hypot(q.x - p.x, q.y - p.y) > BOMB_RADIUS) return;
    if (q.kind === 'bomb') {
      explode(b, s, j, o);
      return;
    }
    if (!q.hit) hitPeg(b, s, j, o);
  });
}

function hitPeg(b: Board, s: Shot, i: number, o: ShotOpts): void {
  const p = b.pegs[i];
  if (p.kind === 'bomb') {
    p.bombHits++;
    s.events.push({ kind: 'bombhit', x: p.x, y: p.y });
    if (!p.hit) {
      p.hit = true;
      s.pegHits++;
    }
    if (p.bombHits >= o.bombAt) explode(b, s, i, o);
    return;
  }
  if (p.hit) return;
  p.hit = true;
  s.pegHits++;
  if (p.kind === 'crit') {
    s.crit = true;
    s.critHits++;
  }
  if (p.kind === 'refresh') s.refresh = true;
  s.events.push({ kind: p.kind === 'normal' ? 'peg' : p.kind, x: p.x, y: p.y });
}

/** Collide one ball with the pegs. Calls onTouch for each new contact. */
function collide(b: Board, ball: Ball, onTouch: (i: number) => void, onGhost: (i: number) => void): void {
  const now: number[] = [];
  const pegs = b.pegs;
  for (let i = 0; i < pegs.length; i++) {
    const p = pegs[i];
    if (p.broken) continue;
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const rr = ball.r + p.r;
    if (dx * dx + dy * dy >= rr * rr) continue;
    now.push(i);
    if (ball.pass.includes(i)) continue;
    const isNew = !ball.touching.includes(i);
    if (isNew && ball.ghost > 0) {
      ball.ghost--;
      ball.pass.push(i);
      onGhost(i);
      continue;
    }
    const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const nx = dx / d;
    const ny = dy / d;
    ball.x = p.x + nx * rr;
    ball.y = p.y + ny * rr;
    const vn = ball.vx * nx + ball.vy * ny;
    if (vn < 0) {
      ball.vx -= (1 + ball.e) * vn * nx;
      ball.vy -= (1 + ball.e) * vn * ny;
      // A small fixed nudge per peg, so an orb never balances on top of a peg.
      ball.vx += (((i * 7919) % 11) - 5) * 0.8;
    }
    if (isNew) onTouch(i);
  }
  ball.touching = now;
}

function walls(ball: Ball): boolean {
  let hit = false;
  if (ball.x < ball.r) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx) * 0.9;
    hit = true;
  } else if (ball.x > BW - ball.r) {
    ball.x = BW - ball.r;
    ball.vx = -Math.abs(ball.vx) * 0.9;
    hit = true;
  }
  if (ball.y < ball.r) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy) * 0.9;
    hit = true;
  }
  return hit;
}

/** Advance the shot by one fixed step. */
export function stepShot(b: Board, s: Shot, o: ShotOpts): void {
  if (s.done) return;
  const born: Ball[] = [];
  for (const ball of s.balls) {
    if (!ball.alive) continue;
    ball.vy += GRAV * ball.g * DT;
    ball.x += ball.vx * DT;
    ball.y += ball.vy * DT;
    ball.wallT = Math.max(0, ball.wallT - DT);
    if (walls(ball) && ball.wallT <= 0) {
      ball.wallT = 0.08;
      s.walls++;
      s.events.push({ kind: 'wall', x: ball.x, y: ball.y });
    }
    collide(
      b,
      ball,
      (i) => {
        hitPeg(b, s, i, o);
        if (ball.canSplit) {
          ball.canSplit = false;
          const twin = makeBall(ball.x, ball.y, -ball.vx, ball.vy, o, false);
          twin.touching = [...ball.touching, i];
          twin.ghost = ball.ghost;
          born.push(twin);
          s.events.push({ kind: 'split', x: ball.x, y: ball.y });
        }
      },
      (i) => hitPeg(b, s, i, o),
    );
    const bx = bucketX(b, s.t);
    if (ball.vy > 0 && ball.y > BH - 14 && ball.y < BH && Math.abs(ball.x - bx) < b.bucketW / 2) {
      ball.alive = false;
      s.bucket = true;
      s.events.push({ kind: 'bucket', x: ball.x, y: ball.y });
      continue;
    }
    if (ball.y > BH + ball.r) {
      ball.alive = false;
      continue;
    }
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed < 25) {
      ball.slow += DT;
      if (ball.slow > 0.6) {
        ball.vx += ball.x < BW / 2 ? 80 : -80;
        ball.vy -= 60;
      }
      if (ball.slow > 3) ball.alive = false;
    } else ball.slow = 0;
  }
  s.balls.push(...born);
  s.t += DT;
  if (s.t > MAX_T) for (const ball of s.balls) ball.alive = false;
  s.done = s.balls.every((x) => !x.alive);
}

/** Run a whole shot at once (bot and tests). */
export function runShot(b: Board, s: Shot, o: ShotOpts): void {
  while (!s.done) stepShot(b, s, o);
}

/** After a shot: hit pegs break, refresh brings all back, crit and refresh pegs move. */
export function endShot(b: Board, s: Shot, rng: Rng, critCount: number): void {
  for (const p of b.pegs) {
    if (p.hit && p.kind !== 'bomb') p.broken = true;
    p.hit = false;
  }
  const live = b.pegs.filter((p) => !p.broken && p.kind !== 'bomb').length;
  const all = b.pegs.filter((p) => p.kind !== 'bomb').length;
  if (s.refresh || live < all * 0.25) refreshBoard(b);
  b.phase += s.t;
  placeSpecials(b, rng, critCount);
}

export function refreshBoard(b: Board): void {
  for (const p of b.pegs) {
    p.broken = false;
    p.bombHits = 0;
  }
}

export function placeSpecials(b: Board, rng: Rng, critCount: number): void {
  for (const p of b.pegs) if (p.kind === 'crit' || p.kind === 'refresh') p.kind = 'normal';
  const free = rng.shuffle(b.pegs.filter((p) => !p.broken && p.kind === 'normal'));
  for (let i = 0; i < critCount && free.length; i++) free.pop()!.kind = 'crit';
  if (free.length) free.pop()!.kind = 'refresh';
}

/** Points of the aim line: the path up to `bounces` contacts, plus a short tail. */
export function tracePath(b: Board, angle: number, o: ShotOpts, bounces: number): { x: number; y: number }[] {
  const v = aimVector(angle);
  const ball = makeBall(LAUNCH.x, LAUNCH.y, v.vx, v.vy, o, false);
  const pts = [{ x: ball.x, y: ball.y }];
  let hits = 0;
  let tail = -1;
  for (let k = 0; k < 2400; k++) {
    ball.vy += GRAV * ball.g * DT;
    ball.x += ball.vx * DT;
    ball.y += ball.vy * DT;
    if (walls(ball)) hits++;
    collide(
      b,
      ball,
      () => hits++,
      () => undefined,
    );
    if (k % 3 === 0) pts.push({ x: ball.x, y: ball.y });
    if (ball.y > BH) break;
    if (hits >= bounces && tail < 0) tail = 30;
    if (tail >= 0 && --tail <= 0) break;
  }
  pts.push({ x: ball.x, y: ball.y });
  return pts;
}

// ---------- Board layouts ----------

function grid(rng: Rng): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const dy = rng.pick([40, 44]);
  const dx = rng.pick([38, 42]);
  let row = 0;
  for (let y = 95; y < BH - 60; y += dy, row++) {
    const off = row % 2 ? dx / 2 : 0;
    for (let x = 24 + off; x < BW - 20; x += dx) out.push({ x, y });
  }
  return out;
}

function rings(rng: Rng): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const centers = [
    { x: 100, y: 160 },
    { x: 300, y: 160 },
    { x: 200, y: 280 },
    { x: 100, y: 390 },
    { x: 300, y: 390 },
  ];
  for (const c of centers) {
    const n = rng.int(8, 10);
    const rad = rng.int(42, 52);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      out.push({ x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad });
    }
    out.push(c);
  }
  for (const y of [95, 460]) for (let x = 40; x < BW - 30; x += 40) out.push({ x, y });
  return out;
}

function chevrons(rng: Rng): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const gap = rng.pick([34, 38]);
  for (let y0 = 100; y0 < BH - 80; y0 += 92) {
    for (let k = 0; k <= 5; k++) {
      out.push({ x: BW / 2 - 30 - k * gap, y: y0 + k * 12 });
      out.push({ x: BW / 2 + 30 + k * gap, y: y0 + k * 12 });
    }
    out.push({ x: BW / 2, y: y0 + 46 });
  }
  return out;
}

function scatter(rng: Rng): { x: number; y: number }[] {
  // Mirrored random scatter with a minimum distance.
  const half: { x: number; y: number }[] = [];
  for (let tries = 0; tries < 900 && half.length < 38; tries++) {
    const p = { x: rng.int(22, BW / 2 - 10), y: rng.int(92, BH - 62) };
    if (half.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 36 && Math.hypot(BW - q.x - p.x, q.y - p.y) > 36)) half.push(p);
  }
  return [...half, ...half.map((p) => ({ x: BW - p.x, y: p.y }))];
}

export function genBoard(rng: Rng, critCount: number, bombs: number, bucketW: number): Board {
  const layout = rng.pick([grid, rings, chevrons, scatter])(rng);
  const pegs: Peg[] = layout
    .filter((p) => p.x > 12 && p.x < BW - 12 && Math.hypot(p.x - LAUNCH.x, p.y - LAUNCH.y) > 50)
    .map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), r: PEG_R, kind: 'normal' as PegKind, hit: false, broken: false, bombHits: 0 }));
  const pool = rng.shuffle(pegs.filter((p) => p.y > 140));
  for (let i = 0; i < bombs && pool.length; i++) {
    const p = pool.pop()!;
    p.kind = 'bomb';
    p.r = 9;
  }
  const b: Board = { pegs, phase: rng.next() * 10, bucketW };
  placeSpecials(b, rng, critCount);
  return b;
}
