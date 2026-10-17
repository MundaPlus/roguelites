/**
 * One level: geometry, the draw phase, the run phase and the goal checks.
 * Pure logic with no DOM. The app, the bot and the headless sim all use it.
 */
import { PENS } from './data';
import type { LevelDef, MoverDef, Pts, Rect } from './levels';
import { DT, SUBSTEPS, World, bodyOverlap, coreDistance, makeBody, setKind, type Body, type Mat, type ShapeDef, type V } from './physics';

export const W = 20;
export const H = 12;
export const STROKE_R = 0.11;
export const SAMPLE = 0.3;
export const BALL_R = 0.4;
/** Seconds of play after Go before a level counts as a miss. */
export const RUN_LIMIT = 14;

const SOLID: Mat = { density: 1, fric: 0.7, rest: 0.1 };
const BALL_MAT: Mat = { density: 1, fric: 0.6, rest: 0.25 };
const CRATE_MAT: Mat = { density: 0.4, fric: 0.35, rest: 0.05 };

export interface Stroke {
  pts: V[];
  pen: string;
  closed: boolean;
  ink: number;
}

export interface Draft {
  pts: V[];
  ink: number;
  stopped: boolean;
  pen: string;
}

export type Phase = 'draw' | 'run' | 'won' | 'lost';

export interface Mover {
  body: Body;
  path: MoverDef;
  x0: number;
  y0: number;
  mirror: boolean;
}

export interface Level {
  def: LevelDef;
  mirror: boolean;
  world: World;
  ball: Body;
  crates: Body[];
  target: Body | null;
  keeps: Body[];
  movers: Mover[];
  strokeBodies: Body[];
  strokes: Stroke[];
  inkMax: number;
  phase: Phase;
  /** Seconds since Go. */
  t: number;
  /** Seconds spent in the draw phase (for the boss timer). */
  drawT: number;
  stillT: number;
  why: string;
  cup: Rect | null;
  zone: Rect | null;
  nodraw: Rect[];
  spikes: Rect[];
  timer: number;
  /** Impacts in the last tick, for sounds and dust. */
  hits: { x: number; y: number; speed: number }[];
}

const mx = (L: { mirror: boolean }, x: number): number => (L.mirror ? W - x : x);
const mrect = (mirror: boolean, r: Rect): Rect => (mirror ? [W - r[2], r[1], W - r[0], r[3]] : r);
const toV = (p: Pts, mirror: boolean): V[] => {
  const out: V[] = [];
  for (let i = 0; i < p.length; i += 2) out.push({ x: mirror ? W - p[i] : p[i], y: p[i + 1] });
  return out;
};
export const inRect = (r: Rect, x: number, y: number, pad = 0): boolean => x >= r[0] - pad && x <= r[2] + pad && y >= r[1] - pad && y <= r[3] + pad;

function rectPts(x0: number, y0: number, x1: number, y1: number): V[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

export function buildLevel(def: LevelDef, mirror: boolean, inkMax: number, timerBonus = 0): Level {
  const world = new World();
  for (const p of def.solids) world.add(makeBody([{ v: toV(p, mirror), r: 0, mat: SOLID, tint: 'solid' }], 'static', 'solid'));
  for (const s of def.spikes ?? []) {
    const r = mrect(mirror, s);
    world.add(makeBody([{ v: rectPts(r[0], r[1], r[2], r[3]), r: 0, mat: SOLID, tint: 'spike' }], 'static', 'spike'));
  }
  const [bx, by] = def.ball;
  const ball = world.add(makeBody([{ v: [{ x: mirror ? W - bx : bx, y: by }], r: BALL_R, mat: BALL_MAT, tint: 'ball' }], 'static', 'ball'));
  const crates: Body[] = [];
  const keeps: Body[] = [ball];
  let target: Body | null = null;
  for (const c of def.crates ?? []) {
    const cx = mirror ? W - c.x : c.x;
    const b = world.add(makeBody([{ v: rectPts(cx - c.w / 2, c.y - c.h / 2, cx + c.w / 2, c.y + c.h / 2), r: 0.03, mat: CRATE_MAT, tint: c.role }], 'static', c.role));
    crates.push(b);
    if (c.role === 'target') target = b;
    if (c.role === 'keep') keeps.push(b);
  }
  const movers: Mover[] = [];
  for (const m of def.movers ?? []) {
    const b = world.add(makeBody([{ v: toV(m.pts, mirror), r: 0, mat: SOLID, tint: 'mover' }], 'kinematic', 'mover'));
    movers.push({ body: b, path: m, x0: b.x, y0: b.y, mirror });
  }
  return {
    def,
    mirror,
    world,
    ball,
    crates,
    target,
    keeps,
    movers,
    strokeBodies: [],
    strokes: [],
    inkMax,
    phase: 'draw',
    t: 0,
    drawT: 0,
    stillT: 0,
    why: '',
    cup: def.cup ? mrect(mirror, def.cup) : null,
    zone: def.zone ? mrect(mirror, def.zone) : null,
    nodraw: (def.nodraw ?? []).map((r) => mrect(mirror, r)),
    spikes: (def.spikes ?? []).map((r) => mrect(mirror, r)),
    timer: def.timer ? def.timer + timerBonus : 0,
    hits: [],
  };
}

export const inkUsed = (L: Level): number => L.strokes.reduce((a, s) => a + s.ink, 0);
export const inkLeft = (L: Level): number => Math.max(0, L.inkMax - inkUsed(L));

/** Can a stroke pass this point? */
export function canDraw(L: Level, x: number, y: number): boolean {
  if (x < STROKE_R || x > W - STROKE_R || y < STROKE_R || y > H - STROKE_R) return false;
  for (const z of L.nodraw) if (inRect(z, x, y, STROKE_R)) return false;
  for (const b of L.world.bodies) {
    if (b.x0 > x + 0.5 || b.x1 < x - 0.5 || b.y0 > y + 0.5 || b.y1 < y - 0.5) continue;
    for (const s of b.shapes) if (coreDistance(s, x, y) < s.r + STROKE_R + 0.03) return false;
  }
  return true;
}

export function startDraft(L: Level, x: number, y: number, pen: string): Draft | null {
  if (L.phase !== 'draw' || inkLeft(L) < SAMPLE || !canDraw(L, x, y)) return null;
  return { pts: [{ x, y }], ink: 0, stopped: false, pen };
}

/** Moves the pen to (x, y). Adds samples until the ink runs out or the pen hits something. */
export function extendDraft(L: Level, d: Draft, x: number, y: number): void {
  if (d.stopped) return;
  const left = inkLeft(L);
  for (let guard = 0; guard < 400; guard++) {
    const last = d.pts[d.pts.length - 1];
    const dx = x - last.x;
    const dy = y - last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < SAMPLE) return;
    const nx = last.x + (dx / dist) * SAMPLE;
    const ny = last.y + (dy / dist) * SAMPLE;
    if (d.ink + SAMPLE > left + 1e-9 || !canDraw(L, nx, ny)) {
      d.stopped = true;
      return;
    }
    d.pts.push({ x: nx, y: ny });
    d.ink += SAMPLE;
  }
}

function hull(pts: V[]): V[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: V, a: V, b: V): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: V[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: V[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Drops hull points until at most `max` remain, removing the one that changes the area least. */
function reduce(poly: V[], max: number): V[] {
  const p = [...poly];
  while (p.length > max) {
    let bi = 0;
    let ba = Infinity;
    for (let i = 0; i < p.length; i++) {
      const a = p[(i + p.length - 1) % p.length];
      const b = p[i];
      const c = p[(i + 1) % p.length];
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      if (area < ba) {
        ba = area;
        bi = i;
      }
    }
    p.splice(bi, 1);
  }
  return p;
}

/** Shape defs of a stroke in world space. */
export function strokeShapes(s: Stroke): ShapeDef[] {
  const pen = PENS[s.pen] ?? PENS.pencil;
  if (s.closed) return [{ v: s.pts, r: STROKE_R, mat: pen.mat, tint: s.pen }];
  if (s.pts.length === 1) return [{ v: [s.pts[0]], r: STROKE_R * 1.6, mat: pen.mat, tint: s.pen }];
  const out: ShapeDef[] = [];
  for (let i = 0; i + 1 < s.pts.length; i++) out.push({ v: [s.pts[i], s.pts[i + 1]], r: STROKE_R, mat: pen.mat, tint: s.pen });
  return out;
}

/** Simplifies collinear runs so long straight strokes use few segments. */
function simplify(pts: V[]): V[] {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    const a = pts[anchor];
    const b = pts[i];
    let ok = i - anchor <= 6;
    for (let k = anchor + 1; k < i && ok; k++) {
      const p = pts[k];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const d = Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
      if (d > 0.04) ok = false;
    }
    if (!ok) {
      anchor = i - 1;
      out.push(pts[anchor]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Turns a draft into a stroke. Returns null when it is too short. */
export function finishDraft(L: Level, d: Draft): Stroke | null {
  if (d.pts.length < 2) return null;
  const first = d.pts[0];
  const last = d.pts[d.pts.length - 1];
  if (d.ink >= 2.4 && Math.hypot(last.x - first.x, last.y - first.y) < 0.8) {
    const poly = reduce(hull(d.pts), 10);
    let area = 0;
    for (let i = 0; i < poly.length; i++) area += poly[i].x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * poly[i].y;
    if (poly.length >= 3 && Math.abs(area) / 2 > 0.4) {
      // A closed shape may not swallow other things.
      const tmp = makeBody([{ v: poly, r: STROKE_R, mat: PENS.pencil.mat, tint: d.pen }], 'static', 'tmp');
      const clash = L.world.bodies.some((b) => bodyOverlap(tmp, b) < 0.02);
      const free = poly.every((p) => !L.nodraw.some((z) => inRect(z, p.x, p.y, STROKE_R)));
      if (!clash && free) return { pts: poly, pen: d.pen, closed: true, ink: d.ink };
    }
  }
  return { pts: simplify(d.pts), pen: d.pen, closed: false, ink: d.ink };
}

/** Draws a whole polyline at once (bot and solutions). */
export function drawPolyline(L: Level, pts: V[], pen = 'pencil'): Stroke | null {
  if (pts.length === 0) return null;
  const d = startDraft(L, pts[0].x, pts[0].y, pen);
  if (!d) return null;
  for (let i = 1; i < pts.length; i++) extendDraft(L, d, pts[i].x, pts[i].y);
  const s = finishDraft(L, d);
  if (s) L.strokes.push(s);
  return s;
}

export function solutionStrokes(L: Level): V[][] {
  return L.def.sol.map((p) => toV(p, L.mirror));
}

/** Starts the physics: strokes become bodies, the ball and crates fall. */
export function go(L: Level): void {
  if (L.phase !== 'draw') return;
  const shapes = L.strokes.map((s) => strokeShapes(s));
  const n = shapes.length;
  const parent = shapes.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const tmp = shapes.map((sh) => makeBody(sh, 'static', 'tmp'));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (bodyOverlap(tmp[i], tmp[j]) < 0.01) parent[find(i)] = find(j);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  for (const idx of groups.values()) {
    const defs = idx.flatMap((i) => shapes[i]);
    const glue = idx.some((i) => PENS[L.strokes[i].pen]?.glue);
    const b = makeBody(defs, glue ? 'static' : 'dynamic', 'stroke');
    L.world.add(b);
    L.strokeBodies.push(b);
  }
  setKind(L.ball, 'dynamic');
  for (const c of L.crates) setKind(c, 'dynamic');
  L.phase = 'run';
  L.t = 0;
  L.stillT = 0;
}

function moverPose(m: Mover, t: number): [number, number, number] {
  const p = m.path;
  if (p.path === 'slide') {
    const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / (p.period ?? 4));
    return [m.x0 + (p.dx ?? 0) * k * (m.mirror ? -1 : 1), m.y0 + (p.dy ?? 0) * k, 0];
  }
  if (p.path === 'spin') return [m.x0, m.y0, (p.speed ?? 1) * t];
  return [m.x0, m.y0, (p.amp ?? 0.5) * Math.sin((2 * Math.PI * t) / (p.period ?? 3))];
}

function rectCircle(r: Rect, x: number, y: number, rad: number): boolean {
  const cx = Math.max(r[0], Math.min(r[2], x));
  const cy = Math.max(r[1], Math.min(r[3], y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
}

const lost = (b: Body): boolean => b.y < -1.5 || b.x < -1.5 || b.x > W + 1.5;

/** One frame (1/60 s). Returns the phase after it. */
export function tick(L: Level): Phase {
  L.hits = [];
  if (L.phase === 'draw') {
    L.drawT += 1 / 60;
    if (L.timer && L.drawT >= L.timer) go(L);
    return L.phase;
  }
  if (L.phase !== 'run') return L.phase;
  for (let s = 0; s < SUBSTEPS; s++) {
    const t1 = L.t + DT;
    for (const m of L.movers) {
      const [x, y, a] = moverPose(m, t1);
      const b = m.body;
      // Mirror flips the turn direction too.
      const aa = L.mirror ? -a : a;
      b.vx = (x - b.x) / DT;
      b.vy = (y - b.y) / DT;
      b.w = (aa - b.a) / DT;
    }
    L.world.step(DT);
    L.t = t1;
    for (const h of L.world.hits) L.hits.push({ x: (h.a.x + h.b.x) / 2, y: (h.a.y + h.b.y) / 2, speed: h.speed });
  }
  const def = L.def;
  // Losses.
  for (const k of L.keeps) {
    if (lost(k)) return fail(L, k === L.ball ? 'The ball fell out.' : 'The crate fell out.');
    const rad = k === L.ball ? BALL_R : 0.5;
    for (const s of L.spikes) if (rectCircle(s, k.x, k.y, rad + 0.06)) return fail(L, k === L.ball ? 'The ball hit the spikes.' : 'The crate hit the spikes.');
  }
  // Wins.
  if (def.goal === 'cup' && L.cup && inRect(L.cup, L.ball.x, L.ball.y)) return win(L);
  if (def.goal === 'target' && L.target && L.zone && inRect(L.zone, L.target.x, L.target.y)) return win(L);
  if (def.goal === 'keep' && L.t >= (def.keep ?? 4)) return win(L);
  if (def.goal === 'target' && L.target && lost(L.target)) return fail(L, 'The target fell out.');
  // Stuck or too slow.
  if (def.goal !== 'keep') {
    const watch = def.goal === 'target' && L.target ? [L.ball, L.target] : [L.ball];
    const calm = watch.every((b) => b.asleep || Math.hypot(b.vx, b.vy) < 0.05);
    L.stillT = calm ? L.stillT + 1 / 60 : 0;
    if (L.t > 1 && L.stillT > 1.5) return fail(L, 'Everything stopped short of the goal.');
    if (L.t > RUN_LIMIT) return fail(L, 'Out of time.');
  }
  return L.phase;
}

function win(L: Level): Phase {
  L.phase = 'won';
  return L.phase;
}

function fail(L: Level, why: string): Phase {
  L.phase = 'lost';
  L.why = why;
  return L.phase;
}

/** A fresh copy of the level with the same strokes, ready to draw again. */
export function retry(L: Level, timerBonus = 0): Level {
  const n = buildLevel(L.def, L.mirror, L.inkMax, timerBonus);
  n.strokes = L.strokes.map((s) => ({ ...s, pts: s.pts.map((p) => ({ ...p })) }));
  return n;
}

/** Plays the run phase to the end. For the bot and the sim. */
export function playOut(L: Level, maxFrames = 60 * 30): Phase {
  if (L.phase === 'draw') go(L);
  for (let i = 0; i < maxFrames && L.phase === 'run'; i++) tick(L);
  if (L.phase === 'run') fail(L, 'Out of time.');
  return L.phase;
}

export { mx };
