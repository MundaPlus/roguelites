/**
 * Small 2D rigid-body engine for stacking.
 * Bodies are compounds of oriented boxes. The contact solver uses sequential
 * impulses with warm starting (after Box2D-lite). Calm groups of touching
 * bodies go to sleep. The world steps with a fixed time step.
 */

export const DT = 1 / 60;

/** A box in body space. `cs` is the cell size, used to draw cell seams. */
export interface Box {
  ox: number;
  oy: number;
  a: number;
  hw: number;
  hh: number;
  mat: string;
  cs: number;
  /** Draw color. */
  col?: string;
}

/** A box in world space. */
export interface WBox {
  x: number;
  y: number;
  c: number;
  s: number;
  hw: number;
  hh: number;
}

export interface Body {
  id: number;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  w: number;
  m: number;
  invM: number;
  invI: number;
  fric: number;
  rest: number;
  boxes: Box[];
  wb: WBox[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Static bodies never move. Kinematic bodies move by their velocity only. */
  kind: 'dynamic' | 'static' | 'kinematic';
  asleep: boolean;
  sleepT: number;
  fx: number;
  fy: number;
  area: number;
  /** Game data. */
  tag: BodyTag;
  // Solver values for this step.
  im: number;
  iI: number;
  bvx: number;
  bvy: number;
  bw: number;
  /** Number of touching boxes in this step. */
  nc: number;
}

export interface BodyTag {
  role: 'platform' | 'block' | 'debris';
  placedAt?: number;
  glue?: boolean;
  heavy?: boolean;
  rooted?: boolean;
  touched?: number;
  order?: number;
}

interface Contact {
  px: number;
  py: number;
  nx: number;
  ny: number;
  sep: number;
  key: number;
  pn: number;
  pt: number;
  mn: number;
  mt: number;
  bias: number;
  bounce: number;
  pb: number;
}

interface Arbiter {
  a: Body;
  b: Body;
  ia: number;
  ib: number;
  cs: Contact[];
  fric: number;
  rest: number;
  stamp: number;
}

// ---------- Box vs. box (Box2D-lite clipping) ----------

const EDGE1 = 1;
const EDGE2 = 2;
const EDGE3 = 3;
const EDGE4 = 4;

interface CV {
  x: number;
  y: number;
  in1: number;
  in2: number;
  out1: number;
  out2: number;
}

const cv = (x: number, y: number, in2: number, out2: number): CV => ({ x, y, in1: 0, in2, out1: 0, out2 });

function clip(vIn: CV[], nx: number, ny: number, offset: number, edge: number): CV[] {
  const out: CV[] = [];
  const d0 = nx * vIn[0].x + ny * vIn[0].y - offset;
  const d1 = nx * vIn[1].x + ny * vIn[1].y - offset;
  if (d0 <= 0) out.push(vIn[0]);
  if (d1 <= 0) out.push(vIn[1]);
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    const v: CV = { ...(d0 > 0 ? vIn[0] : vIn[1]) };
    v.x = vIn[0].x + t * (vIn[1].x - vIn[0].x);
    v.y = vIn[0].y + t * (vIn[1].y - vIn[0].y);
    if (d0 > 0) {
      v.in1 = edge;
      v.in2 = 0;
    } else {
      v.out1 = edge;
      v.out2 = 0;
    }
    out.push(v);
  }
  return out;
}

function incidentEdge(b: WBox, nx: number, ny: number): CV[] {
  // Normal into the incident box frame, sign flipped.
  const lx = -(b.c * nx + b.s * ny);
  const ly = -(-b.s * nx + b.c * ny);
  const h = { x: b.hw, y: b.hh };
  let e: CV[];
  if (Math.abs(lx) > Math.abs(ly)) {
    e = lx >= 0 ? [cv(h.x, -h.y, EDGE3, EDGE4), cv(h.x, h.y, EDGE4, EDGE1)] : [cv(-h.x, h.y, EDGE1, EDGE2), cv(-h.x, -h.y, EDGE2, EDGE3)];
  } else {
    e = ly >= 0 ? [cv(h.x, h.y, EDGE4, EDGE1), cv(-h.x, h.y, EDGE1, EDGE2)] : [cv(-h.x, -h.y, EDGE2, EDGE3), cv(h.x, -h.y, EDGE3, EDGE4)];
  }
  for (const v of e) {
    const x = b.x + b.c * v.x - b.s * v.y;
    const y = b.y + b.s * v.x + b.c * v.y;
    v.x = x;
    v.y = y;
  }
  return e;
}

interface RawContact {
  px: number;
  py: number;
  nx: number;
  ny: number;
  sep: number;
  key: number;
}

/** Contacts between two boxes. The normal points from A to B. */
export function collide(A: WBox, B: WBox): RawContact[] {
  const dpx = B.x - A.x;
  const dpy = B.y - A.y;
  const dAx = A.c * dpx + A.s * dpy;
  const dAy = -A.s * dpx + A.c * dpy;
  const dBx = B.c * dpx + B.s * dpy;
  const dBy = -B.s * dpx + B.c * dpy;
  // C = RotA^T * RotB
  const cd = Math.abs(A.c * B.c + A.s * B.s);
  const sd = Math.abs(A.c * B.s - A.s * B.c);
  const faceAx = Math.abs(dAx) - A.hw - (cd * B.hw + sd * B.hh);
  const faceAy = Math.abs(dAy) - A.hh - (sd * B.hw + cd * B.hh);
  if (faceAx > 0 || faceAy > 0) return [];
  const faceBx = Math.abs(dBx) - (cd * A.hw + sd * A.hh) - B.hw;
  const faceBy = Math.abs(dBy) - (sd * A.hw + cd * A.hh) - B.hh;
  if (faceBx > 0 || faceBy > 0) return [];

  const relTol = 0.95;
  const absTol = 0.01;
  let axis = 0;
  let sep = faceAx;
  let nx = dAx > 0 ? A.c : -A.c;
  let ny = dAx > 0 ? A.s : -A.s;
  if (faceAy > relTol * sep + absTol * A.hh) {
    axis = 1;
    sep = faceAy;
    nx = dAy > 0 ? -A.s : A.s;
    ny = dAy > 0 ? A.c : -A.c;
  }
  if (faceBx > relTol * sep + absTol * B.hw) {
    axis = 2;
    sep = faceBx;
    nx = dBx > 0 ? B.c : -B.c;
    ny = dBx > 0 ? B.s : -B.s;
  }
  if (faceBy > relTol * sep + absTol * B.hh) {
    axis = 3;
    sep = faceBy;
    nx = dBy > 0 ? -B.s : B.s;
    ny = dBy > 0 ? B.c : -B.c;
  }

  let fnx: number, fny: number, front: number, snx: number, sny: number, negSide: number, posSide: number, negEdge: number, posEdge: number;
  let inc: CV[];
  if (axis === 0) {
    fnx = nx;
    fny = ny;
    front = A.x * fnx + A.y * fny + A.hw;
    snx = -A.s;
    sny = A.c;
    const side = A.x * snx + A.y * sny;
    negSide = -side + A.hh;
    posSide = side + A.hh;
    negEdge = EDGE3;
    posEdge = EDGE1;
    inc = incidentEdge(B, fnx, fny);
  } else if (axis === 1) {
    fnx = nx;
    fny = ny;
    front = A.x * fnx + A.y * fny + A.hh;
    snx = A.c;
    sny = A.s;
    const side = A.x * snx + A.y * sny;
    negSide = -side + A.hw;
    posSide = side + A.hw;
    negEdge = EDGE2;
    posEdge = EDGE4;
    inc = incidentEdge(B, fnx, fny);
  } else if (axis === 2) {
    fnx = -nx;
    fny = -ny;
    front = B.x * fnx + B.y * fny + B.hw;
    snx = -B.s;
    sny = B.c;
    const side = B.x * snx + B.y * sny;
    negSide = -side + B.hh;
    posSide = side + B.hh;
    negEdge = EDGE3;
    posEdge = EDGE1;
    inc = incidentEdge(A, fnx, fny);
  } else {
    fnx = -nx;
    fny = -ny;
    front = B.x * fnx + B.y * fny + B.hh;
    snx = B.c;
    sny = B.s;
    const side = B.x * snx + B.y * sny;
    negSide = -side + B.hw;
    posSide = side + B.hw;
    negEdge = EDGE2;
    posEdge = EDGE4;
    inc = incidentEdge(A, fnx, fny);
  }
  const c1 = clip(inc, -snx, -sny, negSide, negEdge);
  if (c1.length < 2) return [];
  const c2 = clip(c1, snx, sny, posSide, posEdge);
  if (c2.length < 2) return [];
  const out: RawContact[] = [];
  for (const v of c2) {
    const s = fnx * v.x + fny * v.y - front;
    if (s <= 0) {
      let { in1, in2, out1, out2 } = v;
      if (axis >= 2) {
        [in1, in2] = [in2, in1];
        [out1, out2] = [out2, out1];
      }
      out.push({ px: v.x - s * fnx, py: v.y - s * fny, nx, ny, sep: s, key: in1 | (in2 << 3) | (out1 << 6) | (out2 << 9) });
    }
  }
  return out;
}

/** True when two boxes overlap by more than `margin`. */
export function overlap(A: WBox, B: WBox, margin = 0.02): boolean {
  const dpx = B.x - A.x;
  const dpy = B.y - A.y;
  const cd = Math.abs(A.c * B.c + A.s * B.s);
  const sd = Math.abs(A.c * B.s - A.s * B.c);
  const dAx = A.c * dpx + A.s * dpy;
  const dAy = -A.s * dpx + A.c * dpy;
  if (Math.abs(dAx) - A.hw - (cd * B.hw + sd * B.hh) > -margin) return false;
  if (Math.abs(dAy) - A.hh - (sd * B.hw + cd * B.hh) > -margin) return false;
  const dBx = B.c * dpx + B.s * dpy;
  const dBy = -B.s * dpx + B.c * dpy;
  if (Math.abs(dBx) - (cd * A.hw + sd * A.hh) - B.hw > -margin) return false;
  if (Math.abs(dBy) - (sd * A.hw + cd * A.hh) - B.hh > -margin) return false;
  return true;
}

/** True when the point lies inside the box. */
export function pointIn(b: WBox, px: number, py: number): boolean {
  const dx = px - b.x;
  const dy = py - b.y;
  const lx = b.c * dx + b.s * dy;
  const ly = -b.s * dx + b.c * dy;
  return Math.abs(lx) <= b.hw && Math.abs(ly) <= b.hh;
}

// ---------- Bodies ----------

export interface MatProps {
  density: number;
  fric: number;
  rest: number;
}

/** World boxes for a body pose. */
export function worldBoxes(boxes: Box[], x: number, y: number, a: number): WBox[] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return boxes.map((b) => {
    const ba = a + b.a;
    return { x: x + c * b.ox - s * b.oy, y: y + s * b.ox + c * b.oy, c: Math.cos(ba), s: Math.sin(ba), hw: b.hw, hh: b.hh };
  });
}

export function updateCache(b: Body): void {
  b.wb = worldBoxes(b.boxes, b.x, b.y, b.a);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const w of b.wb) {
    const ex = Math.abs(w.c) * w.hw + Math.abs(w.s) * w.hh;
    const ey = Math.abs(w.s) * w.hw + Math.abs(w.c) * w.hh;
    x0 = Math.min(x0, w.x - ex);
    x1 = Math.max(x1, w.x + ex);
    y0 = Math.min(y0, w.y - ey);
    y1 = Math.max(y1, w.y + ey);
  }
  b.x0 = x0;
  b.y0 = y0;
  b.x1 = x1;
  b.y1 = y1;
}

/** Splits grid cells (unit squares at integer coords) into few rectangles. */
export function cellsToRects(cells: [number, number][]): { x: number; y: number; w: number; h: number }[] {
  const set = new Set(cells.map(([x, y]) => `${x},${y}`));
  const ys = [...new Set(cells.map((c) => c[1]))].sort((a, b) => a - b);
  const runs: { x: number; y: number; w: number; h: number }[] = [];
  for (const y of ys) {
    const xs = cells.filter((c) => c[1] === y).map((c) => c[0]).sort((a, b) => a - b);
    let start = xs[0];
    let prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === prev + 1) {
        prev = xs[i];
        continue;
      }
      runs.push({ x: start, y, w: prev - start + 1, h: 1 });
      if (i < xs.length) {
        start = xs[i];
        prev = xs[i];
      }
    }
  }
  // Merge runs with the same x span on the row right above.
  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      if (b.x === a.x && b.w === a.w && b.y === a.y + a.h) {
        a.h += b.h;
        runs.splice(j, 1);
        j--;
      }
    }
  }
  void set;
  return runs;
}

let nextId = 1;

/** A dynamic body from grid cells of size `cs`. The body origin is the centroid. */
export function makeBody(boxes: { cx: number; cy: number; hw: number; hh: number; a?: number; mat: string; cs: number; col?: string }[], props: (mat: string) => MatProps, tag: BodyTag, kind: Body['kind'] = 'dynamic'): Body {
  let m = 0;
  let mx = 0;
  let my = 0;
  let area = 0;
  let fr = 0;
  let re = 0;
  for (const b of boxes) {
    const p = props(b.mat);
    const ar = 4 * b.hw * b.hh;
    const bm = ar * p.density;
    m += bm;
    area += ar;
    mx += bm * b.cx;
    my += bm * b.cy;
    fr += p.fric * ar;
    re += p.rest * ar;
  }
  const cx = mx / m;
  const cy = my / m;
  let I = 0;
  const local: Box[] = boxes.map((b) => {
    const p = props(b.mat);
    const bm = 4 * b.hw * b.hh * p.density;
    const ox = b.cx - cx;
    const oy = b.cy - cy;
    I += (bm * (4 * b.hw * b.hw + 4 * b.hh * b.hh)) / 12 + bm * (ox * ox + oy * oy);
    return { ox, oy, a: b.a ?? 0, hw: b.hw, hh: b.hh, mat: b.mat, cs: b.cs, col: b.col };
  });
  const dyn = kind === 'dynamic';
  const body: Body = {
    id: nextId++,
    x: cx,
    y: cy,
    a: 0,
    vx: 0,
    vy: 0,
    w: 0,
    m,
    invM: dyn ? 1 / m : 0,
    invI: dyn ? 1 / I : 0,
    fric: fr / area,
    rest: re / area,
    boxes: local,
    wb: [],
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    kind,
    asleep: false,
    sleepT: 0,
    fx: 0,
    fy: 0,
    area,
    tag,
    im: 0,
    iI: 0,
    bvx: 0,
    bvy: 0,
    bw: 0,
    nc: 0,
  };
  updateCache(body);
  return body;
}

/** Turns a body into a static one in place (rooted blocks). */
export function freeze(b: Body): void {
  b.kind = 'static';
  b.invM = 0;
  b.invI = 0;
  b.vx = b.vy = b.w = 0;
  b.asleep = false;
}

// ---------- Velocity solver ----------

function applyP(a: Body, b: Body, c: Contact, Px: number, Py: number): void {
  const r1x = c.px - a.x;
  const r1y = c.py - a.y;
  const r2x = c.px - b.x;
  const r2y = c.py - b.y;
  a.vx -= a.im * Px;
  a.vy -= a.im * Py;
  a.w -= a.iI * (r1x * Py - r1y * Px);
  b.vx += b.im * Px;
  b.vy += b.im * Py;
  b.w += b.iI * (r2x * Py - r2y * Px);
}

function relVel(a: Body, b: Body, c: Contact): [number, number] {
  const r1x = c.px - a.x;
  const r1y = c.py - a.y;
  const r2x = c.px - b.x;
  const r2y = c.py - b.y;
  return [b.vx - b.w * r2y - a.vx + a.w * r1y, b.vy + b.w * r2x - a.vy - a.w * r1x];
}

/** Friction first, then the normal impulses. Two-point contacts use a block solver (as in Box2D). */
function solveVelocity(ar: Arbiter): void {
  const { a, b, cs } = ar;
  for (const c of cs) {
    const [dvx, dvy] = relVel(a, b, c);
    const tx = c.ny;
    const ty = -c.nx;
    const vt = dvx * tx + dvy * ty;
    const maxPt = ar.fric * c.pn;
    const pt0 = c.pt;
    c.pt = Math.max(-maxPt, Math.min(maxPt, pt0 - c.mt * vt));
    const d = c.pt - pt0;
    applyP(a, b, c, d * tx, d * ty);
  }
  if (cs.length === 2) {
    const c1 = cs[0];
    const c2 = cs[1];
    const nx = c1.nx;
    const ny = c1.ny;
    const rn1A = (c1.px - a.x) * ny - (c1.py - a.y) * nx;
    const rn1B = (c1.px - b.x) * ny - (c1.py - b.y) * nx;
    const rn2A = (c2.px - a.x) * ny - (c2.py - a.y) * nx;
    const rn2B = (c2.px - b.x) * ny - (c2.py - b.y) * nx;
    const k11 = a.im + b.im + a.iI * rn1A * rn1A + b.iI * rn1B * rn1B;
    const k22 = a.im + b.im + a.iI * rn2A * rn2A + b.iI * rn2B * rn2B;
    const k12 = a.im + b.im + a.iI * rn1A * rn2A + b.iI * rn1B * rn2B;
    const det = k11 * k22 - k12 * k12;
    if (k11 > 0 && k11 * k11 < 1000 * det) {
      const [v1x, v1y] = relVel(a, b, c1);
      const [v2x, v2y] = relVel(a, b, c2);
      const vn1 = v1x * nx + v1y * ny;
      const vn2 = v2x * nx + v2y * ny;
      const ax = c1.pn;
      const ay = c2.pn;
      const bx = vn1 - c1.bounce - (k11 * ax + k12 * ay);
      const by = vn2 - c2.bounce - (k12 * ax + k22 * ay);
      let x1 = -(k22 * bx - k12 * by) / det;
      let x2 = -(-k12 * bx + k11 * by) / det;
      let ok = x1 >= 0 && x2 >= 0;
      if (!ok) {
        x1 = -bx / k11;
        x2 = 0;
        ok = x1 >= 0 && k12 * x1 + by >= 0;
      }
      if (!ok) {
        x1 = 0;
        x2 = -by / k22;
        ok = x2 >= 0 && k12 * x2 + bx >= 0;
      }
      if (!ok) {
        x1 = 0;
        x2 = 0;
        ok = bx >= 0 && by >= 0;
      }
      if (ok) {
        const d1 = x1 - ax;
        const d2 = x2 - ay;
        c1.pn = x1;
        c2.pn = x2;
        applyP(a, b, c1, d1 * nx, d1 * ny);
        applyP(a, b, c2, d2 * nx, d2 * ny);
        return;
      }
    }
  }
  for (const c of cs) {
    const [dvx, dvy] = relVel(a, b, c);
    const vn = dvx * c.nx + dvy * c.ny;
    const pn0 = c.pn;
    c.pn = Math.max(pn0 + c.mn * (-vn + c.bounce), 0);
    const d = c.pn - pn0;
    applyP(a, b, c, d * c.nx, d * c.ny);
  }
}

// ---------- World ----------

const LIN_SLEEP = 0.12;
const ANG_SLEEP = 0.1;
const SLEEP_TIME = 0.6;
const ALLOWED_PEN = 0.01;
const BIAS = 0.2;

export class World {
  bodies: Body[] = [];
  gx = 0;
  gy = -20;
  iterations = 12;
  restSpeed = 0.6;
  restDamp = 0.9;
  private arbs = new Map<string, Arbiter>();
  private stamp = 0;
  /** Bodies that touched something for the first time in the last step. */
  touched: [Body, Body][] = [];

  add(b: Body): Body {
    updateCache(b);
    this.bodies.push(b);
    return b;
  }

  remove(b: Body): void {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    for (const [k, a] of this.arbs) if (a.a === b || a.b === b) this.arbs.delete(k);
    this.wakeAll();
  }

  wakeAll(): void {
    for (const b of this.bodies) {
      if (b.kind === 'dynamic') {
        b.asleep = false;
        b.sleepT = 0;
      }
    }
  }

  wake(b: Body): void {
    if (b.kind === 'dynamic' && b.asleep) {
      b.asleep = false;
      b.sleepT = 0;
    }
  }

  /** Bodies that touch `b` now. */
  contactsOf(b: Body): Body[] {
    const out: Body[] = [];
    for (const a of this.arbs.values()) {
      if (a.cs.length === 0) continue;
      if (a.a === b && !out.includes(a.b)) out.push(a.b);
      else if (a.b === b && !out.includes(a.a)) out.push(a.a);
    }
    return out;
  }

  private moving(b: Body): boolean {
    if (b.kind === 'kinematic') return b.vx !== 0 || b.vy !== 0 || b.w !== 0;
    return b.kind === 'dynamic' && !b.asleep && b.sleepT === 0;
  }

  private broadphase(): void {
    this.stamp++;
    this.touched = [];
    for (const b of this.bodies) b.nc = 0;
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const A = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const B = bs[j];
        const aAct = (A.kind === 'dynamic' && !A.asleep) || (A.kind === 'kinematic' && this.moving(A));
        const bAct = (B.kind === 'dynamic' && !B.asleep) || (B.kind === 'kinematic' && this.moving(B));
        if (!aAct && !bAct) continue;
        if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
        let any = false;
        for (let ia = 0; ia < A.wb.length; ia++) {
          for (let ib = 0; ib < B.wb.length; ib++) {
            const key = `${A.id}:${ia}:${B.id}:${ib}`;
            const raw = collide(A.wb[ia], B.wb[ib]);
            const old = this.arbs.get(key);
            if (raw.length === 0) {
              if (old) this.arbs.delete(key);
              continue;
            }
            any = true;
            const cs: Contact[] = raw.map((r) => {
              // Match by feature, else by position (aligned edges make clip features flicker).
              let prev = old?.cs.find((c) => c.key === r.key);
              if (!prev && old) {
                let best = 0.15 * 0.15;
                for (const c of old.cs) {
                  const d = (c.px - r.px) ** 2 + (c.py - r.py) ** 2;
                  if (d < best) {
                    best = d;
                    prev = c;
                  }
                }
              }
              return { ...r, pn: prev ? prev.pn : 0, pt: prev ? prev.pt : 0, mn: 0, mt: 0, bias: 0, bounce: 0, pb: 0 };
            });
            if (old) {
              old.cs = cs;
              old.stamp = this.stamp;
            } else {
              this.arbs.set(key, { a: A, b: B, ia, ib, cs, fric: Math.sqrt(A.fric * B.fric), rest: Math.max(A.rest, B.rest), stamp: this.stamp });
            }
          }
        }
        if (any) {
          A.nc++;
          B.nc++;
          // A moving body wakes a sleeping one it touches.
          if (A.asleep && this.moving(B)) this.wake(A);
          if (B.asleep && this.moving(A)) this.wake(B);
          if (A.kind === 'dynamic' && A.tag.touched === undefined) this.touched.push([A, B]);
          if (B.kind === 'dynamic' && B.tag.touched === undefined) this.touched.push([B, A]);
        }
      }
    }
    for (const [k, a] of this.arbs) if (a.stamp !== this.stamp) this.arbs.delete(k);
  }

  step(dt: number): void {
    // Kinematic bodies move by their own velocity.
    for (const b of this.bodies) {
      if (b.kind === 'kinematic') {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.a += b.w * dt;
        updateCache(b);
      }
    }
    this.broadphase();
    const inv = 1 / dt;
    for (const b of this.bodies) {
      const act = b.kind === 'dynamic' && !b.asleep;
      b.im = act ? b.invM : 0;
      b.iI = act ? b.invI : 0;
      if (!act) {
        if (b.kind === 'dynamic') {
          b.vx = b.vy = b.w = 0;
        }
        b.fx = b.fy = 0;
        continue;
      }
      b.vx += dt * (this.gx + b.invM * b.fx);
      b.vy += dt * (this.gy + b.invM * b.fy);
      b.fx = b.fy = 0;
      const damp = 1 / (1 + dt * 0.1);
      b.vx *= damp;
      b.vy *= damp;
      b.w *= 1 / (1 + dt * 0.4);
    }
    const arbs = [...this.arbs.values()];
    // Restitution for fast hits only, from the velocities before warm starting.
    for (const ar of arbs) {
      for (const c of ar.cs) {
        const [dvx, dvy] = relVel(ar.a, ar.b, c);
        const vn = dvx * c.nx + dvy * c.ny;
        c.bounce = vn < -2 ? -ar.rest * vn : 0;
      }
    }
    // Pre-step.
    for (const ar of arbs) {
      const { a, b } = ar;
      for (const c of ar.cs) {
        const r1x = c.px - a.x;
        const r1y = c.py - a.y;
        const r2x = c.px - b.x;
        const r2y = c.py - b.y;
        const rn1 = r1x * c.nx + r1y * c.ny;
        const rn2 = r2x * c.nx + r2y * c.ny;
        let kN = a.im + b.im + a.iI * (r1x * r1x + r1y * r1y - rn1 * rn1) + b.iI * (r2x * r2x + r2y * r2y - rn2 * rn2);
        c.mn = kN > 0 ? 1 / kN : 0;
        const tx = c.ny;
        const ty = -c.nx;
        const rt1 = r1x * tx + r1y * ty;
        const rt2 = r2x * tx + r2y * ty;
        kN = a.im + b.im + a.iI * (r1x * r1x + r1y * r1y - rt1 * rt1) + b.iI * (r2x * r2x + r2y * r2y - rt2 * rt2);
        c.mt = kN > 0 ? 1 / kN : 0;
        c.bias = Math.min(3, -BIAS * inv * Math.min(0, c.sep + ALLOWED_PEN));
        c.pb = 0;
        // Warm start.
        const Px = c.pn * c.nx + c.pt * tx;
        const Py = c.pn * c.ny + c.pt * ty;
        a.vx -= a.im * Px;
        a.vy -= a.im * Py;
        a.w -= a.iI * (r1x * Py - r1y * Px);
        b.vx += b.im * Px;
        b.vy += b.im * Py;
        b.w += b.iI * (r2x * Py - r2y * Px);
      }
    }
    for (let it = 0; it < this.iterations; it++) {
      for (const ar of arbs) solveVelocity(ar);
    }
    // Calm bodies in contact lose energy fast, so stacks settle and stop jittering.
    for (const b of this.bodies) {
      if (b.kind !== 'dynamic' || b.asleep || b.nc === 0) continue;
      if (b.vx * b.vx + b.vy * b.vy < this.restSpeed * this.restSpeed && Math.abs(b.w) < this.restSpeed) {
        b.vx *= this.restDamp;
        b.vy *= this.restDamp;
        b.w *= this.restDamp;
      }
    }
    // Split impulse: position errors are fixed with pseudo velocities that do not add energy.
    for (let it = 0; it < this.iterations; it++) {
      for (const ar of arbs) {
        const { a, b } = ar;
        for (const c of ar.cs) {
          if (c.bias <= 0) continue;
          const r1x = c.px - a.x;
          const r1y = c.py - a.y;
          const r2x = c.px - b.x;
          const r2y = c.py - b.y;
          const dvx = b.bvx - b.bw * r2y - a.bvx + a.bw * r1y;
          const dvy = b.bvy + b.bw * r2x - a.bvy - a.bw * r1x;
          const vn = dvx * c.nx + dvy * c.ny;
          const pb0 = c.pb;
          c.pb = Math.max(0, pb0 + c.mn * (c.bias - vn));
          const d = c.pb - pb0;
          const Px = d * c.nx;
          const Py = d * c.ny;
          a.bvx -= a.im * Px;
          a.bvy -= a.im * Py;
          a.bw -= a.iI * (r1x * Py - r1y * Px);
          b.bvx += b.im * Px;
          b.bvy += b.im * Py;
          b.bw += b.iI * (r2x * Py - r2y * Px);
        }
      }
    }
    // Integrate positions.
    for (const b of this.bodies) {
      const bx = b.bvx;
      const by = b.bvy;
      const bw = b.bw;
      b.bvx = b.bvy = b.bw = 0;
      if (b.kind !== 'dynamic' || b.asleep) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 40) {
        b.vx *= 40 / sp;
        b.vy *= 40 / sp;
      }
      b.x += dt * (b.vx + bx);
      b.y += dt * (b.vy + by);
      b.a += dt * (b.w + bw);
      updateCache(b);
      if (b.vx * b.vx + b.vy * b.vy < LIN_SLEEP * LIN_SLEEP && b.w * b.w < ANG_SLEEP * ANG_SLEEP) b.sleepT += dt;
      else b.sleepT = 0;
    }
    this.sleepIslands();
  }

  private sleepIslands(): void {
    const dyn = this.bodies.filter((b) => b.kind === 'dynamic' && !b.asleep);
    if (dyn.length === 0) return;
    const parent = new Map<Body, Body>();
    for (const b of dyn) parent.set(b, b);
    const find = (b: Body): Body => {
      let r = b;
      while (parent.get(r) !== r) r = parent.get(r)!;
      parent.set(b, r);
      return r;
    };
    for (const ar of this.arbs.values()) {
      if (ar.cs.length === 0) continue;
      if (parent.has(ar.a) && parent.has(ar.b)) parent.set(find(ar.a), find(ar.b));
    }
    const minT = new Map<Body, number>();
    for (const b of dyn) {
      const r = find(b);
      minT.set(r, Math.min(minT.get(r) ?? Infinity, b.sleepT));
    }
    for (const b of dyn) {
      if ((minT.get(find(b)) ?? 0) >= SLEEP_TIME) {
        b.asleep = true;
        b.vx = b.vy = b.w = 0;
      }
    }
  }
}
