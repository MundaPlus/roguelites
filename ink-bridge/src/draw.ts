/** Canvas rendering of a level. */
import { PENS, WORLDS } from './data';
import { BALL_R, H, STROKE_R, W, type Draft, type Level } from './game';
import type { Rect } from './levels';
import type { Body, Shape } from './physics';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

export interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export interface View {
  draft: Draft | null;
  /** Seconds, for small animations. */
  clock: number;
  parts: Particle[];
  floats: Float[];
  shake: number;
  /** Flash for a blocked pen start. */
  deny: { x: number; y: number; t: number } | null;
}

const PEN_COLOR = (id: string): string => PENS[id]?.color ?? '#f4f1ea';

function shapePath(ctx: CanvasRenderingContext2D, sh: Shape, s: number): void {
  const v = sh.wv;
  ctx.beginPath();
  if (v.length === 1) {
    ctx.arc(v[0].x * s, (H - v[0].y) * s, sh.r * s, 0, Math.PI * 2);
    return;
  }
  v.forEach((p, i) => (i ? ctx.lineTo(p.x * s, (H - p.y) * s) : ctx.moveTo(p.x * s, (H - p.y) * s)));
  ctx.closePath();
}

function rectPath(ctx: CanvasRenderingContext2D, r: Rect, s: number): void {
  ctx.beginPath();
  ctx.rect(r[0] * s, (H - r[3]) * s, (r[2] - r[0]) * s, (r[3] - r[1]) * s);
}

function hatch(ctx: CanvasRenderingContext2D, s: number, color: string, gap = 0.45): void {
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  for (let x = -H; x < W + H; x += gap) {
    ctx.moveTo(x * s, H * s);
    ctx.lineTo((x + H) * s, 0);
  }
  ctx.stroke();
  ctx.restore();
}

function drawSolid(ctx: CanvasRenderingContext2D, b: Body, s: number, ground: string): void {
  for (const sh of b.shapes) {
    shapePath(ctx, sh, s);
    ctx.fillStyle = '#2b2236';
    ctx.fill();
    shapePath(ctx, sh, s);
    hatch(ctx, s, 'rgba(255,255,255,0.05)');
    shapePath(ctx, sh, s);
    ctx.strokeStyle = ground;
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function drawSpikes(ctx: CanvasRenderingContext2D, r: Rect, s: number): void {
  rectPath(ctx, r, s);
  ctx.fillStyle = '#3a1520';
  ctx.fill();
  const n = Math.max(1, Math.round((r[2] - r[0]) / 0.4));
  const w = (r[2] - r[0]) / n;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = r[0] + i * w;
    ctx.moveTo(x * s, (H - r[3]) * s);
    ctx.lineTo((x + w / 2) * s, (H - r[3] - 0.35) * s);
    ctx.lineTo((x + w) * s, (H - r[3]) * s);
  }
  ctx.fillStyle = '#ef476f';
  ctx.fill();
}

function drawStroke(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], s: number, color: string, closed: boolean, alpha = 1): void {
  if (!pts.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x * s, (H - p.y) * s) : ctx.moveTo(p.x * s, (H - p.y) * s)));
  if (closed) {
    ctx.closePath();
    ctx.fillStyle = color + '55';
    ctx.fill();
  }
  if (pts.length === 1) ctx.lineTo(pts[0].x * s + 0.1, (H - pts[0].y) * s);
  ctx.strokeStyle = color;
  ctx.lineWidth = STROKE_R * 2 * s;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawStrokeBody(ctx: CanvasRenderingContext2D, b: Body, s: number): void {
  for (const sh of b.shapes) {
    const color = PEN_COLOR(sh.tint);
    if (sh.wv.length >= 3) {
      shapePath(ctx, sh, s);
      ctx.fillStyle = color + '55';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = STROKE_R * 2 * s;
      ctx.lineJoin = 'round';
      ctx.stroke();
    } else {
      drawStroke(ctx, sh.wv, s, color, false);
    }
  }
}

function drawBall(ctx: CanvasRenderingContext2D, b: Body, s: number, held: boolean, clock: number): void {
  const x = b.x * s;
  const y = (H - b.y) * s;
  const r = BALL_R * s;
  if (held) {
    ctx.beginPath();
    ctx.arc(x, y, r * (1.35 + 0.1 * Math.sin(clock * 4)), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,209,102,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#fff3c4');
  g.addColorStop(1, '#f4a300');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#7a4a00';
  ctx.lineWidth = Math.max(1, s * 0.04);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(-b.a) * r * 0.8, y + Math.sin(-b.a) * r * 0.8);
  ctx.stroke();
}

function drawCrate(ctx: CanvasRenderingContext2D, b: Body, s: number): void {
  const sh = b.shapes[0];
  const col = sh.tint === 'target' ? '#4cc9f0' : sh.tint === 'keep' ? '#ff9f43' : '#c8925a';
  shapePath(ctx, sh, s);
  ctx.fillStyle = col + 'cc';
  ctx.fill();
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.stroke();
  const v = sh.wv;
  ctx.beginPath();
  ctx.moveTo(v[0].x * s, (H - v[0].y) * s);
  ctx.lineTo(v[2].x * s, (H - v[2].y) * s);
  ctx.moveTo(v[1].x * s, (H - v[1].y) * s);
  ctx.lineTo(v[3].x * s, (H - v[3].y) * s);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.stroke();
}

function drawMover(ctx: CanvasRenderingContext2D, b: Body, s: number): void {
  for (const sh of b.shapes) {
    shapePath(ctx, sh, s);
    const g = ctx.createLinearGradient(0, (H - b.y1) * s, 0, (H - b.y0) * s);
    g.addColorStop(0, '#d7c4e8');
    g.addColorStop(1, '#7b6890');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#ff5d8f';
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(b.x * s, (H - b.y) * s, Math.max(2, s * 0.09), 0, Math.PI * 2);
  ctx.fillStyle = '#ff5d8f';
  ctx.fill();
}

/** The mover's reach, shown while drawing. */
function drawMoverPath(ctx: CanvasRenderingContext2D, L: Level, s: number): void {
  ctx.save();
  ctx.setLineDash([s * 0.15, s * 0.15]);
  ctx.strokeStyle = 'rgba(255,93,143,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.035);
  for (const m of L.movers) {
    const b = m.body;
    const p = m.path;
    if (p.path === 'slide') {
      const dx = (p.dx ?? 0) * (L.mirror ? -1 : 1);
      const dy = p.dy ?? 0;
      for (const sh of b.shapes) {
        ctx.beginPath();
        sh.wv.forEach((q, i) => (i ? ctx.lineTo((q.x + dx) * s, (H - q.y - dy) * s) : ctx.moveTo((q.x + dx) * s, (H - q.y - dy) * s)));
        ctx.closePath();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(b.x * s, (H - b.y) * s);
      ctx.lineTo((b.x + dx) * s, (H - b.y - dy) * s);
      ctx.stroke();
    } else {
      let r = 0;
      for (const sh of b.shapes) for (const q of sh.wv) r = Math.max(r, Math.hypot(q.x - b.x, q.y - b.y));
      ctx.beginPath();
      if (p.path === 'spin') ctx.arc(b.x * s, (H - b.y) * s, r * s, 0, Math.PI * 2);
      else {
        const amp = p.amp ?? 0.5;
        ctx.arc(b.x * s, (H - b.y) * s, r * s, Math.PI / 2 - amp, Math.PI / 2 + amp);
        ctx.moveTo(b.x * s, (H - b.y) * s);
        ctx.arc(b.x * s, (H - b.y) * s, r * s, -Math.PI / 2 - amp, -Math.PI / 2 + amp);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawNoDraw(ctx: CanvasRenderingContext2D, r: Rect, s: number): void {
  rectPath(ctx, r, s);
  ctx.fillStyle = 'rgba(255,159,67,0.08)';
  ctx.fill();
  rectPath(ctx, r, s);
  hatch(ctx, s, 'rgba(255,159,67,0.28)', 0.35);
  rectPath(ctx, r, s);
  ctx.save();
  ctx.setLineDash([s * 0.2, s * 0.12]);
  ctx.strokeStyle = 'rgba(255,159,67,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawGoal(ctx: CanvasRenderingContext2D, L: Level, s: number, clock: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(clock * 3);
  if (L.cup) {
    rectPath(ctx, L.cup, s);
    ctx.fillStyle = `rgba(126,224,138,${0.18 + 0.12 * pulse})`;
    ctx.fill();
    const fx = (L.cup[0] + L.cup[2]) / 2;
    const fy = L.cup[3];
    ctx.strokeStyle = '#7ee08a';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.beginPath();
    ctx.moveTo(fx * s, (H - fy) * s);
    ctx.lineTo(fx * s, (H - fy - 1.1) * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx * s, (H - fy - 1.1) * s);
    ctx.lineTo((fx + 0.6) * s, (H - fy - 0.9) * s);
    ctx.lineTo(fx * s, (H - fy - 0.7) * s);
    ctx.fillStyle = '#7ee08a';
    ctx.fill();
  }
  if (L.zone) {
    rectPath(ctx, L.zone, s);
    ctx.fillStyle = `rgba(126,224,138,${0.12 + 0.1 * pulse})`;
    ctx.fill();
    ctx.save();
    ctx.setLineDash([s * 0.2, s * 0.15]);
    rectPath(ctx, L.zone, s);
    ctx.strokeStyle = '#7ee08a';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawScene(ctx: CanvasRenderingContext2D, L: Level, s: number, v: View | null): void {
  const wd = WORLDS[L.def.world];
  const cw = W * s;
  const ch = H * s;
  ctx.save();
  if (v && v.shake > 0) ctx.translate((Math.random() - 0.5) * v.shake * s, (Math.random() - 0.5) * v.shake * s);
  const g = ctx.createLinearGradient(0, 0, 0, ch);
  g.addColorStop(0, wd.sky[0]);
  g.addColorStop(1, wd.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(-20, -20, cw + 40, ch + 40);
  // Paper grid.
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < W; x++) {
    ctx.moveTo(x * s, 0);
    ctx.lineTo(x * s, ch);
  }
  for (let y = 1; y < H; y++) {
    ctx.moveTo(0, y * s);
    ctx.lineTo(cw, y * s);
  }
  ctx.stroke();
  const clock = v?.clock ?? 0;
  for (const z of L.nodraw) drawNoDraw(ctx, z, s);
  drawGoal(ctx, L, s, clock);
  if (L.phase === 'draw' && L.movers.length) drawMoverPath(ctx, L, s);
  for (const b of L.world.bodies) {
    if (b.role === 'solid') drawSolid(ctx, b, s, wd.ground);
  }
  for (const r of L.spikes) drawSpikes(ctx, r, s);
  for (const b of L.world.bodies) {
    if (b.role === 'mover') drawMover(ctx, b, s);
    else if (b.role === 'stroke') drawStrokeBody(ctx, b, s);
    else if (b.role === 'target' || b.role === 'keep' || b.role === 'crate') drawCrate(ctx, b, s);
  }
  if (L.phase === 'draw') for (const st of L.strokes) drawStroke(ctx, st.pts, s, PEN_COLOR(st.pen), st.closed);
  drawBall(ctx, L.ball, s, L.phase === 'draw', clock);
  if (v?.draft) {
    const d = v.draft;
    drawStroke(ctx, d.pts, s, PEN_COLOR(d.pen), false, 0.85);
    if (d.stopped) {
      const p = d.pts[d.pts.length - 1];
      ctx.strokeStyle = '#ef476f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x * s, (H - p.y) * s, s * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (v?.deny) {
    const a = Math.max(0, 1 - v.deny.t / 0.5);
    ctx.strokeStyle = `rgba(239,71,111,${a})`;
    ctx.lineWidth = 3;
    const x = v.deny.x * s;
    const y = (H - v.deny.y) * s;
    const r = s * 0.35;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y + r);
    ctx.moveTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.stroke();
  }
  if (v) {
    for (const p of v.parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * s - (p.size * s) / 2, (H - p.y) * s - (p.size * s) / 2, p.size * s, p.size * s);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.max(14, s * 0.7)}px system-ui, sans-serif`;
    for (const f of v.floats) {
      ctx.globalAlpha = Math.max(0, 1 - f.t / 1.4);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * s, (H - f.y - f.t * 1.2) * s);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** A small static picture of a level for the map. */
export function drawThumb(ctx: CanvasRenderingContext2D, L: Level, w: number): void {
  drawScene(ctx, L, w / W, null);
}
