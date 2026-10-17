/**
 * Small 2D rigid-body engine for drawn shapes.
 * A shape is a convex core (1 point = circle, 2 points = capsule, 3+ points = polygon)
 * with a round skin of radius r. A body is a rigid compound of shapes.
 * Contacts use SAT with edge clipping, sequential impulses with warm starting
 * and split-impulse position correction (after Box2D-lite). Calm islands sleep.
 * The world steps with a fixed time step, so the same input gives the same result.
 */

export const DT = 1 / 120;
export const SUBSTEPS = 2;

export interface V {
  x: number;
  y: number;
}

export interface Mat {
  density: number;
  fric: number;
  rest: number;
}

export interface Shape {
  /** Core vertices in body space. Polygons are CCW. */
  lv: V[];
  r: number;
  mat: Mat;
  /** Draw color or pen id. */
  tint: string;
  wv: V[];
  wn: V[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Kind = 'dynamic' | 'static' | 'kinematic';

export interface Body {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  w: number;
  m: number;
  I: number;
  invM: number;
  invI: number;
  shapes: Shape[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  asleep: boolean;
  sleepT: number;
  role: string;
  im: number;
  iI: number;
  bvx: number;
  bvy: number;
  bw: number;
  nc: number;
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
  cs: Contact[];
  fric: number;
  rest: number;
  stamp: number;
}

interface Raw {
  px: number;
  py: number;
  nx: number;
  ny: number;
  sep: number;
  key: number;
}

const MARGIN = 0.02;

// ---------- Geometry helpers ----------

export function closestOnSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): V {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: ax + t * dx, y: ay + t * dy };
}

const faceCount = (s: Shape): number => (s.wv.length === 2 ? 2 : s.wv.length);

/** Distance from a point to the core of a shape (0 inside a polygon). */
export function coreDistance(s: Shape, px: number, py: number): number {
  const v = s.wv;
  if (v.length === 1) return Math.hypot(px - v[0].x, py - v[0].y);
  if (v.length >= 3) {
    let inside = true;
    for (let i = 0; i < v.length; i++) {
      const n = s.wn[i];
      if ((px - v[i].x) * n.x + (py - v[i].y) * n.y > 0) {
        inside = false;
        break;
      }
    }
    if (inside) return 0;
  }
  let best = Infinity;
  const ne = v.length === 2 ? 1 : v.length;
  for (let i = 0; i < ne; i++) {
    const a = v[i];
    const b = v[(i + 1) % v.length];
    const q = closestOnSeg(px, py, a.x, a.y, b.x, b.y);
    best = Math.min(best, Math.hypot(px - q.x, py - q.y));
  }
  return best;
}

/** Closest points between two disjoint cores, by brute force over vertex-edge pairs. */
function coreClosest(A: Shape, B: Shape): { d: number; pa: V; pb: V } {
  let d = Infinity;
  let pa: V = A.wv[0];
  let pb: V = B.wv[0];
  const test = (P: Shape, Q: Shape, swap: boolean): void => {
    const qn = Q.wv.length === 1 ? 0 : Q.wv.length === 2 ? 1 : Q.wv.length;
    for (const p of P.wv) {
      if (qn === 0) {
        const q = Q.wv[0];
        const dd = Math.hypot(p.x - q.x, p.y - q.y);
        if (dd < d) {
          d = dd;
          pa = swap ? q : p;
          pb = swap ? p : q;
        }
        continue;
      }
      for (let i = 0; i < qn; i++) {
        const a = Q.wv[i];
        const b = Q.wv[(i + 1) % Q.wv.length];
        const q = closestOnSeg(p.x, p.y, a.x, a.y, b.x, b.y);
        const dd = Math.hypot(p.x - q.x, p.y - q.y);
        if (dd < d) {
          d = dd;
          pa = swap ? q : p;
          pb = swap ? p : q;
        }
      }
    }
  };
  test(A, B, false);
  test(B, A, true);
  return { d, pa, pb };
}

/** Contact of a round point (c, rc) against shape S. The normal points from S to the point. */
function pointContact(S: Shape, cx: number, cy: number, rc: number): Raw[] {
  const v = S.wv;
  const R = S.r + rc;
  if (v.length >= 3) {
    let best = -Infinity;
    let bi = 0;
    for (let i = 0; i < v.length; i++) {
      const n = S.wn[i];
      const s = (cx - v[i].x) * n.x + (cy - v[i].y) * n.y;
      if (s > best) {
        best = s;
        bi = i;
      }
    }
    if (best > R + MARGIN) return [];
    if (best <= 0) {
      const n = S.wn[bi];
      const sep = best - R;
      // Surface of S along n, and surface of the point.
      const sx = cx - n.x * best + n.x * S.r;
      const sy = cy - n.y * best + n.y * S.r;
      const tx = cx - n.x * rc;
      const ty = cy - n.y * rc;
      return [{ px: (sx + tx) / 2, py: (sy + ty) / 2, nx: n.x, ny: n.y, sep, key: 1 }];
    }
  }
  let q: V;
  if (v.length === 1) q = v[0];
  else {
    let bd = Infinity;
    q = v[0];
    const ne = v.length === 2 ? 1 : v.length;
    for (let i = 0; i < ne; i++) {
      const a = v[i];
      const b = v[(i + 1) % v.length];
      const c = closestOnSeg(cx, cy, a.x, a.y, b.x, b.y);
      const dd = (c.x - cx) ** 2 + (c.y - cy) ** 2;
      if (dd < bd) {
        bd = dd;
        q = c;
      }
    }
  }
  const dx = cx - q.x;
  const dy = cy - q.y;
  const d = Math.hypot(dx, dy);
  if (d > R + MARGIN) return [];
  const nx = d > 1e-9 ? dx / d : 0;
  const ny = d > 1e-9 ? dy / d : 1;
  const sep = d - R;
  const sx = q.x + nx * S.r;
  const sy = q.y + ny * S.r;
  const tx = cx - nx * rc;
  const ty = cy - ny * rc;
  return [{ px: (sx + tx) / 2, py: (sy + ty) / 2, nx, ny, sep, key: 2 }];
}

function maxSep(P: Shape, Q: Shape): [number, number] {
  let best = -Infinity;
  let bi = 0;
  const nf = faceCount(P);
  for (let i = 0; i < nf; i++) {
    const n = P.wn[i];
    const v = P.wv[i];
    let mn = Infinity;
    for (const q of Q.wv) {
      const s = (q.x - v.x) * n.x + (q.y - v.y) * n.y;
      if (s < mn) mn = s;
    }
    if (mn > best) {
      best = mn;
      bi = i;
    }
  }
  return [bi, best];
}

/** Contacts between two shapes in world space. The normal points from A to B. */
export function collide(A: Shape, B: Shape): Raw[] {
  const na = A.wv.length;
  const nb = B.wv.length;
  if (nb === 1) return pointContact(A, B.wv[0].x, B.wv[0].y, B.r);
  if (na === 1) {
    return pointContact(B, A.wv[0].x, A.wv[0].y, A.r).map((c) => ({ ...c, nx: -c.nx, ny: -c.ny }));
  }
  const R = A.r + B.r;
  const [ia, sa] = maxSep(A, B);
  if (sa > R + MARGIN) return [];
  const [ib, sb] = maxSep(B, A);
  if (sb > R + MARGIN) return [];
  let flip = false;
  let ref = A;
  let inc = B;
  let i1 = ia;
  let s = sa;
  if (sb > sa + 0.005) {
    flip = true;
    ref = B;
    inc = A;
    i1 = ib;
    s = sb;
  }
  if (s > 0.002) {
    const cc = coreClosest(A, B);
    if (cc.d > R + MARGIN) return [];
    if (cc.d > s + 0.01) {
      const nx = (cc.pb.x - cc.pa.x) / cc.d;
      const ny = (cc.pb.y - cc.pa.y) / cc.d;
      const ax = cc.pa.x + nx * A.r;
      const ay = cc.pa.y + ny * A.r;
      const bx = cc.pb.x - nx * B.r;
      const by = cc.pb.y - ny * B.r;
      return [{ px: (ax + bx) / 2, py: (ay + by) / 2, nx, ny, sep: cc.d - R, key: 3 }];
    }
  }
  const nr = ref.wv.length;
  const n = ref.wn[i1];
  const v1 = ref.wv[i1];
  const v2 = ref.wv[(i1 + 1) % nr];
  // Incident face: the most anti-parallel face of the other shape.
  const nf = faceCount(inc);
  let j = 0;
  let md = Infinity;
  for (let k = 0; k < nf; k++) {
    const d = inc.wn[k].x * n.x + inc.wn[k].y * n.y;
    if (d < md) {
      md = d;
      j = k;
    }
  }
  const w1 = inc.wv[j];
  const w2 = inc.wv[(j + 1) % inc.wv.length];
  let tx = v2.x - v1.x;
  let ty = v2.y - v1.y;
  const len = Math.hypot(tx, ty);
  tx /= len;
  ty /= len;
  const s1 = (w1.x - v1.x) * tx + (w1.y - v1.y) * ty;
  const s2 = (w2.x - v1.x) * tx + (w2.y - v1.y) * ty;
  let ua = 0;
  let ub = 1;
  if (Math.abs(s2 - s1) > 1e-9) {
    const u0 = (0 - s1) / (s2 - s1);
    const uL = (len - s1) / (s2 - s1);
    ua = Math.max(0, Math.min(u0, uL));
    ub = Math.min(1, Math.max(u0, uL));
    if (ua > ub) return [];
  } else if (s1 < 0 || s1 > len) return [];
  const out: Raw[] = [];
  const us = ub - ua < 1e-6 ? [ua] : [ua, ub];
  us.forEach((u, k) => {
    const px = w1.x + u * (w2.x - w1.x);
    const py = w1.y + u * (w2.y - w1.y);
    const dist = (px - v1.x) * n.x + (py - v1.y) * n.y;
    const sep = dist - R;
    if (sep > MARGIN) return;
    const rx = px - n.x * dist + n.x * ref.r;
    const ry = py - n.y * dist + n.y * ref.r;
    const ix = px - n.x * inc.r;
    const iy = py - n.y * inc.r;
    out.push({ px: (rx + ix) / 2, py: (ry + iy) / 2, nx: flip ? -n.x : n.x, ny: flip ? -n.y : n.y, sep, key: 16 + (flip ? 1 : 0) + (i1 << 1) + (j << 7) + (k << 13) });
  });
  return out;
}

// ---------- Bodies ----------

let nextId = 1;

export interface ShapeDef {
  /** World-space core points. */
  v: V[];
  r: number;
  mat: Mat;
  tint: string;
}

function polyArea(v: V[]): number {
  let a = 0;
  for (let i = 0; i < v.length; i++) {
    const p = v[i];
    const q = v[(i + 1) % v.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Mass, centroid and inertia about the centroid of one shape. */
function shapeMass(s: ShapeDef): { m: number; cx: number; cy: number; I: number } {
  const v = s.v;
  const rho = s.mat.density;
  if (v.length === 1) {
    const m = rho * Math.PI * s.r * s.r;
    return { m, cx: v[0].x, cy: v[0].y, I: (m * s.r * s.r) / 2 };
  }
  if (v.length === 2) {
    const L = Math.hypot(v[1].x - v[0].x, v[1].y - v[0].y);
    const mr = rho * 2 * s.r * L;
    const mc = rho * Math.PI * s.r * s.r;
    const I = (mr * (L * L + 4 * s.r * s.r)) / 12 + mc * (s.r * s.r * 0.5 + (L * L) / 4);
    return { m: mr + mc, cx: (v[0].x + v[1].x) / 2, cy: (v[0].y + v[1].y) / 2, I };
  }
  // Polygon (the skin adds area along the perimeter).
  let area = 0;
  let cx = 0;
  let cy = 0;
  let I = 0;
  const o = v[0];
  for (let i = 1; i < v.length - 1; i++) {
    const e1x = v[i].x - o.x;
    const e1y = v[i].y - o.y;
    const e2x = v[i + 1].x - o.x;
    const e2y = v[i + 1].y - o.y;
    const D = e1x * e2y - e1y * e2x;
    const ta = D / 2;
    area += ta;
    cx += (ta * (e1x + e2x)) / 3;
    cy += (ta * (e1y + e2y)) / 3;
    const intx2 = e1x * e1x + e2x * e1x + e2x * e2x;
    const inty2 = e1y * e1y + e2y * e1y + e2y * e2y;
    I += (D / 12) * (intx2 + inty2);
  }
  cx /= area;
  cy /= area;
  let per = 0;
  for (let i = 0; i < v.length; i++) per += Math.hypot(v[(i + 1) % v.length].x - v[i].x, v[(i + 1) % v.length].y - v[i].y);
  const k = (area + per * s.r) / area;
  const m = rho * area * k;
  // I about origin o -> about centroid.
  const Ic = rho * k * (I - area * (cx * cx + cy * cy));
  return { m, cx: cx + o.x, cy: cy + o.y, I: Ic };
}

export function makeBody(defs: ShapeDef[], kind: Kind, role: string): Body {
  let m = 0;
  let mx = 0;
  let my = 0;
  const parts = defs.map((d) => {
    if (d.v.length >= 3 && polyArea(d.v) < 0) d.v = [...d.v].reverse();
    const p = shapeMass(d);
    m += p.m;
    mx += p.m * p.cx;
    my += p.m * p.cy;
    return p;
  });
  const cx = mx / m;
  const cy = my / m;
  let I = 0;
  parts.forEach((p) => (I += p.I + p.m * ((p.cx - cx) ** 2 + (p.cy - cy) ** 2)));
  const shapes: Shape[] = defs.map((d) => ({
    lv: d.v.map((q) => ({ x: q.x - cx, y: q.y - cy })),
    r: d.r,
    mat: d.mat,
    tint: d.tint,
    wv: [],
    wn: [],
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
  }));
  const b: Body = {
    id: nextId++,
    kind,
    x: cx,
    y: cy,
    a: 0,
    vx: 0,
    vy: 0,
    w: 0,
    m,
    I,
    invM: 0,
    invI: 0,
    shapes,
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    asleep: false,
    sleepT: 0,
    role,
    im: 0,
    iI: 0,
    bvx: 0,
    bvy: 0,
    bw: 0,
    nc: 0,
  };
  setKind(b, kind);
  updateCache(b);
  return b;
}

export function setKind(b: Body, kind: Kind): void {
  b.kind = kind;
  b.invM = kind === 'dynamic' ? 1 / b.m : 0;
  b.invI = kind === 'dynamic' ? 1 / b.I : 0;
  b.asleep = false;
  b.sleepT = 0;
}

export function updateCache(b: Body): void {
  const c = Math.cos(b.a);
  const s = Math.sin(b.a);
  let X0 = Infinity;
  let Y0 = Infinity;
  let X1 = -Infinity;
  let Y1 = -Infinity;
  for (const sh of b.shapes) {
    sh.wv = sh.lv.map((p) => ({ x: b.x + c * p.x - s * p.y, y: b.y + s * p.x + c * p.y }));
    const v = sh.wv;
    if (v.length === 2) {
      const dx = v[1].x - v[0].x;
      const dy = v[1].y - v[0].y;
      const l = Math.hypot(dx, dy) || 1;
      sh.wn = [
        { x: dy / l, y: -dx / l },
        { x: -dy / l, y: dx / l },
      ];
    } else if (v.length >= 3) {
      sh.wn = v.map((p, i) => {
        const q = v[(i + 1) % v.length];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const l = Math.hypot(dx, dy) || 1;
        return { x: dy / l, y: -dx / l };
      });
    } else sh.wn = [];
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of v) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
    sh.x0 = x0 - sh.r;
    sh.y0 = y0 - sh.r;
    sh.x1 = x1 + sh.r;
    sh.y1 = y1 + sh.r;
    X0 = Math.min(X0, sh.x0);
    Y0 = Math.min(Y0, sh.y0);
    X1 = Math.max(X1, sh.x1);
    Y1 = Math.max(Y1, sh.y1);
  }
  b.x0 = X0;
  b.y0 = Y0;
  b.x1 = X1;
  b.y1 = Y1;
}

/** Deepest overlap between two bodies (negative = overlap). */
export function bodyOverlap(A: Body, B: Body): number {
  let worst = Infinity;
  if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) return worst;
  for (const sa of A.shapes) {
    for (const sb of B.shapes) {
      if (sa.x1 < sb.x0 || sb.x1 < sa.x0 || sa.y1 < sb.y0 || sb.y1 < sa.y0) continue;
      for (const c of collide(sa, sb)) worst = Math.min(worst, c.sep);
    }
  }
  return worst;
}

// ---------- Solver ----------

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
  for (const c of cs) {
    const [dvx, dvy] = relVel(a, b, c);
    const vn = dvx * c.nx + dvy * c.ny;
    const pn0 = c.pn;
    c.pn = Math.max(pn0 + c.mn * (-vn + c.bounce), 0);
    const d = c.pn - pn0;
    applyP(a, b, c, d * c.nx, d * c.ny);
  }
}

const LIN_SLEEP = 0.08;
const ANG_SLEEP = 0.08;
const SLEEP_TIME = 0.7;
const ALLOWED_PEN = 0.01;
const BIAS = 0.25;
const MAX_SPEED = 24;

export interface Hit {
  a: Body;
  b: Body;
  speed: number;
}

export class World {
  bodies: Body[] = [];
  gy = -14;
  iterations = 10;
  private arbs = new Map<string, Arbiter>();
  private stamp = 0;
  /** New contacts with a fast normal speed in the last step (for sounds). */
  hits: Hit[] = [];

  add(b: Body): Body {
    updateCache(b);
    this.bodies.push(b);
    return b;
  }

  remove(b: Body): void {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
    for (const [k, a] of this.arbs) if (a.a === b || a.b === b) this.arbs.delete(k);
    for (const o of this.bodies) this.wake(o);
  }

  wake(b: Body): void {
    if (b.kind === 'dynamic' && b.asleep) {
      b.asleep = false;
      b.sleepT = 0;
    }
  }

  /** True when the two bodies touch now. */
  touching(a: Body, b: Body): boolean {
    for (const ar of this.arbs.values()) {
      if (ar.cs.length && ((ar.a === a && ar.b === b) || (ar.a === b && ar.b === a))) return true;
    }
    return false;
  }

  private active(b: Body): boolean {
    if (b.kind === 'dynamic') return !b.asleep;
    if (b.kind === 'kinematic') return b.vx !== 0 || b.vy !== 0 || b.w !== 0;
    return false;
  }

  private broadphase(): void {
    this.stamp++;
    this.hits = [];
    for (const b of this.bodies) b.nc = 0;
    const bs = this.bodies;
    for (let i = 0; i < bs.length; i++) {
      const A = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const B = bs[j];
        if (A.kind !== 'dynamic' && B.kind !== 'dynamic') continue;
        if (!this.active(A) && !this.active(B)) continue;
        if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
        let any = false;
        for (let ia = 0; ia < A.shapes.length; ia++) {
          const sa = A.shapes[ia];
          if (sa.x1 < B.x0 || B.x1 < sa.x0 || sa.y1 < B.y0 || B.y1 < sa.y0) continue;
          for (let ib = 0; ib < B.shapes.length; ib++) {
            const sb = B.shapes[ib];
            const key = `${A.id}:${ia}:${B.id}:${ib}`;
            const old = this.arbs.get(key);
            const raw = sa.x1 < sb.x0 || sb.x1 < sa.x0 || sa.y1 < sb.y0 || sb.y1 < sa.y0 ? [] : collide(sa, sb);
            if (raw.length === 0) {
              if (old) this.arbs.delete(key);
              continue;
            }
            any = true;
            const cs: Contact[] = raw.map((r) => {
              let prev = old?.cs.find((c) => c.key === r.key);
              if (!prev && old) {
                let best = 0.1 * 0.1;
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
              const fric = Math.sqrt(sa.mat.fric * sb.mat.fric);
              const rest = Math.max(sa.mat.rest, sb.mat.rest);
              this.arbs.set(key, { a: A, b: B, cs, fric, rest, stamp: this.stamp });
              const c = cs[0];
              const [dvx, dvy] = relVel(A, B, c);
              const sp = -(dvx * c.nx + dvy * c.ny);
              if (sp > 1.5) this.hits.push({ a: A, b: B, speed: sp });
            }
          }
        }
        if (any) {
          A.nc++;
          B.nc++;
          if (A.asleep && this.active(B)) this.wake(A);
          if (B.asleep && this.active(A)) this.wake(B);
        }
      }
    }
    for (const [k, a] of this.arbs) if (a.stamp !== this.stamp) this.arbs.delete(k);
  }

  step(dt: number = DT): void {
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
        if (b.kind === 'dynamic') b.vx = b.vy = b.w = 0;
        continue;
      }
      b.vy += dt * this.gy;
      const damp = 1 / (1 + dt * 0.05);
      b.vx *= damp;
      b.vy *= damp;
      b.w *= 1 / (1 + dt * 0.05);
    }
    const arbs = [...this.arbs.values()];
    for (const ar of arbs) {
      for (const c of ar.cs) {
        const [dvx, dvy] = relVel(ar.a, ar.b, c);
        const vn = dvx * c.nx + dvy * c.ny;
        c.bounce = vn < -1.2 ? -ar.rest * vn : 0;
      }
    }
    for (const ar of arbs) {
      const { a, b } = ar;
      for (const c of ar.cs) {
        const r1x = c.px - a.x;
        const r1y = c.py - a.y;
        const r2x = c.px - b.x;
        const r2y = c.py - b.y;
        const rn1 = r1x * c.nx + r1y * c.ny;
        const rn2 = r2x * c.nx + r2y * c.ny;
        let k = a.im + b.im + a.iI * (r1x * r1x + r1y * r1y - rn1 * rn1) + b.iI * (r2x * r2x + r2y * r2y - rn2 * rn2);
        c.mn = k > 0 ? 1 / k : 0;
        const tx = c.ny;
        const ty = -c.nx;
        const rt1 = r1x * tx + r1y * ty;
        const rt2 = r2x * tx + r2y * ty;
        k = a.im + b.im + a.iI * (r1x * r1x + r1y * r1y - rt1 * rt1) + b.iI * (r2x * r2x + r2y * r2y - rt2 * rt2);
        c.mt = k > 0 ? 1 / k : 0;
        c.bias = Math.min(4, -BIAS * inv * Math.min(0, c.sep + ALLOWED_PEN));
        c.pb = 0;
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
    for (let it = 0; it < this.iterations; it++) for (const ar of arbs) solveVelocity(ar);
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
    for (const b of this.bodies) {
      const bx = b.bvx;
      const by = b.bvy;
      const bw = b.bw;
      b.bvx = b.bvy = b.bw = 0;
      if (b.kind !== 'dynamic' || b.asleep) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) {
        b.vx *= MAX_SPEED / sp;
        b.vy *= MAX_SPEED / sp;
      }
      if (Math.abs(b.w) > 30) b.w = Math.sign(b.w) * 30;
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
    const busy = new Set<Body>();
    for (const ar of this.arbs.values()) {
      if (ar.cs.length === 0) continue;
      if (parent.has(ar.a) && parent.has(ar.b)) parent.set(find(ar.a), find(ar.b));
      // Touching a moving kinematic body keeps the island awake.
      if (ar.a.kind === 'kinematic' && this.active(ar.a) && parent.has(ar.b)) busy.add(ar.b);
      if (ar.b.kind === 'kinematic' && this.active(ar.b) && parent.has(ar.a)) busy.add(ar.a);
    }
    const minT = new Map<Body, number>();
    for (const b of dyn) {
      const r = find(b);
      minT.set(r, Math.min(minT.get(r) ?? Infinity, busy.has(b) ? 0 : b.sleepT));
    }
    for (const b of dyn) {
      if ((minT.get(find(b)) ?? 0) >= SLEEP_TIME) {
        b.asleep = true;
        b.vx = b.vy = b.w = 0;
      }
    }
  }
}
