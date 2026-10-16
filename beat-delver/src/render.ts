/** Canvas drawing: the dungeon view and the beat bar. */
import { DX, DY, ITEMS, ZONES, CHARS } from './data';
import { DIRT, FLOOR, GEMW, GOLDV, ROCK, STONE, edef, isReady, lightRadius, type World } from './world';

export const TS = 32;
export const BAR = 58;

export interface Float {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export interface Fx {
  floats: Float[];
  booms: { x: number; y: number; t: number }[];
  slashes: { x: number; y: number; t: number }[];
  shake: number;
}

export interface Anim {
  /** Positions before the last beat, by enemy uid. The player uses uid 0. */
  prev: Map<number, [number, number]>;
  /** 0 → 1 progress of the move tween. */
  k: number;
  /** 1 on the beat, falls to 0. */
  pulse: number;
  time: number;
}

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

function emoji(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number): void {
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(s, x, y + size * 0.05);
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

export function drawWorld(ctx: CanvasRenderingContext2D, w: World, cols: number, rows: number, a: Anim, fx: Fx): void {
  const z = ZONES[w.zone];
  const VW = cols * TS;
  const VH = rows * TS;
  ctx.fillStyle = '#07040b';
  ctx.fillRect(0, 0, VW, VH);
  const lerp = (uid: number, x: number, y: number): [number, number] => {
    const p = a.prev.get(uid);
    if (!p || a.k >= 1) return [x, y];
    const e = 1 - (1 - a.k) * (1 - a.k);
    return [p[0] + (x - p[0]) * e, p[1] + (y - p[1]) * e];
  };
  const [ppx, ppy] = lerp(0, w.px, w.py);
  // Camera follows the player, clamped to the map.
  let camX = ppx + 0.5 - cols / 2;
  let camY = ppy + 0.5 - rows / 2;
  camX = Math.max(0, Math.min(w.w - cols, camX));
  camY = Math.max(0, Math.min(w.h - rows, camY));
  if (w.w < cols) camX = (w.w - cols) / 2;
  if (w.h < rows) camY = (w.h - rows) / 2;
  ctx.save();
  if (fx.shake > 0.3) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
  const sx = (x: number): number => (x - camX) * TS;
  const sy = (y: number): number => (y - camY) * TS;
  const r = lightRadius(w.hero);
  const lit = (x: number, y: number): boolean => w.boss || (x - w.px) ** 2 + (y - w.py) ** 2 <= r * r;
  const disco = w.mult > 1;
  const x0 = Math.floor(camX);
  const y0 = Math.floor(camY);
  for (let y = y0; y <= y0 + rows + 1; y++) {
    for (let x = x0; x <= x0 + cols + 1; x++) {
      if (x < 0 || y < 0 || x >= w.w || y >= w.h) continue;
      const seen = w.seen[y * w.w + x] || w.boss;
      if (!seen) continue;
      const t = w.tiles[y * w.w + x];
      const vis = lit(x, y);
      const X = sx(x);
      const Y = sy(y);
      if (t === FLOOR) {
        const odd = (x + y + (disco ? w.beat : 0)) % 2 === 0;
        let c = odd ? shade(z.floor, 1.25) : z.floor;
        if (disco && vis && odd) c = w.mult >= 3 ? 'rgba(255,0,110,0.32)' : 'rgba(58,134,255,0.28)';
        ctx.fillStyle = shade(z.floor, 1);
        ctx.fillRect(X, Y, TS, TS);
        ctx.fillStyle = c;
        ctx.fillRect(X, Y, TS, TS);
      } else {
        const base = t === STONE ? '#6b6b78' : t === ROCK ? '#1b1820' : z.wall;
        ctx.fillStyle = base;
        ctx.fillRect(X, Y, TS, TS);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(X, Y, TS, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(X, Y + TS - 4, TS, 4);
        if (t === DIRT) {
          ctx.fillStyle = 'rgba(0,0,0,0.18)';
          ctx.fillRect(X + 6, Y + 12, 4, 4);
          ctx.fillRect(X + 20, Y + 20, 5, 4);
        }
        if (t === GOLDV) {
          ctx.fillStyle = '#ffd166';
          for (const [ox, oy] of [[8, 10], [20, 14], [12, 22]]) ctx.fillRect(X + ox, Y + oy, 4, 4);
        }
        if (t === GEMW && vis) emoji(ctx, '💎', X + TS / 2, Y + TS / 2, TS * 0.5 + Math.sin(a.time * 6) * 2);
      }
      if (!vis) {
        ctx.fillStyle = 'rgba(5,3,10,0.62)';
        ctx.fillRect(X, Y, TS, TS);
      }
    }
  }
  const show = (x: number, y: number): boolean => lit(x, y);
  // Stairs, shop, chests, gold, bombs.
  if (w.stairsShown && (w.seen[w.stairs.y * w.w + w.stairs.x] || w.boss)) {
    const X = sx(w.stairs.x);
    const Y = sy(w.stairs.y);
    ctx.fillStyle = w.locked ? '#3a2a3a' : '#2b9348';
    ctx.fillRect(X + 3, Y + 3, TS - 6, TS - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 3; i++) ctx.fillRect(X + 6, Y + 8 + i * 7, TS - 12, 3);
    if (w.locked) emoji(ctx, '🔒', X + TS / 2, Y + TS / 2, TS * 0.5);
  }
  if (w.keeper && w.seen[w.keeper.y * w.w + w.keeper.x]) emoji(ctx, '🧔', sx(w.keeper.x) + TS / 2, sy(w.keeper.y) + TS / 2 + Math.sin(a.time * 8) * 1.5, TS * 0.8);
  for (const p of w.shop) {
    if (p.sold || !w.seen[p.y * w.w + p.x]) continue;
    const X = sx(p.x);
    const Y = sy(p.y);
    ctx.fillStyle = 'rgba(255,209,102,0.15)';
    ctx.fillRect(X + 2, Y + 2, TS - 4, TS - 4);
    emoji(ctx, ITEMS[p.item].icon, X + TS / 2, Y + TS / 2 - 3, TS * 0.6);
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = w.hero.gold >= p.cost ? '#ffd166' : '#ff6b81';
    ctx.textAlign = 'center';
    ctx.fillText(String(p.cost), X + TS / 2, Y + TS - 3);
  }
  for (const c of w.chests) if (show(c.x, c.y) || w.seen[c.y * w.w + c.x]) emoji(ctx, '🎁', sx(c.x) + TS / 2, sy(c.y) + TS / 2, TS * 0.7);
  for (const g of w.gold) if (show(g.x, g.y)) emoji(ctx, g.n >= 10 ? '💰' : '🪙', sx(g.x) + TS / 2, sy(g.y) + TS / 2, TS * 0.55);
  for (const d of w.danger) {
    ctx.fillStyle = `rgba(255,30,60,${0.35 + 0.25 * a.pulse})`;
    ctx.fillRect(sx(d.x) + 1, sy(d.y) + 1, TS - 2, TS - 2);
  }
  for (const b of w.bombs) {
    emoji(ctx, '💣', sx(b.x) + TS / 2, sy(b.y) + TS / 2, TS * (0.65 + 0.1 * a.pulse));
    ctx.font = 'bold 12px system-ui';
    ctx.fillStyle = '#ff4d6d';
    ctx.fillText(String(b.t), sx(b.x) + TS - 6, sy(b.y) + 8);
  }
  // Enemies.
  for (const e of w.enemies) {
    if (!show(e.x, e.y)) continue;
    const d = edef(e);
    const [ex, ey] = lerp(e.uid, e.x, e.y);
    const X = sx(ex) + TS / 2;
    const Y = sy(ey) + TS / 2;
    const ready = isReady(w, e);
    const big = d.boss ? 1.25 : d.mini ? 1.05 : 0.8;
    const hop = ready ? -3 * a.pulse : 0;
    if (ready) {
      const adj = Math.abs(e.x - w.px) + Math.abs(e.y - w.py) <= 2;
      ctx.fillStyle = adj ? `rgba(255,60,80,${0.25 + 0.35 * a.pulse})` : `rgba(255,255,255,${0.1 + 0.2 * a.pulse})`;
      ctx.beginPath();
      ctx.arc(X, Y + 2, TS * 0.45 * big, 0, Math.PI * 2);
      ctx.fill();
    }
    if (w.frozen > 0) {
      ctx.fillStyle = 'rgba(140,220,255,0.35)';
      ctx.fillRect(X - TS / 2 + 2, Y - TS / 2 + 2, TS - 4, TS - 4);
    }
    emoji(ctx, d.icon, X, Y + hop, TS * big);
    if (e.aim >= 0) {
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.lineTo(X + DX[e.aim] * TS * 0.7, Y + DY[e.aim] * TS * 0.7);
      ctx.stroke();
    }
    if (e.stun > 0) emoji(ctx, '💫', X + 9, Y - 12, 12);
    if (e.max > 1) {
      const bw = Math.min(TS - 4, e.max * 6);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(X - bw / 2, Y + TS / 2 - 5, bw, 4);
      ctx.fillStyle = d.boss ? '#ff006e' : '#ff8fab';
      ctx.fillRect(X - bw / 2, Y + TS / 2 - 5, (bw * Math.max(0, e.hp)) / e.max, 4);
    }
  }
  // Player.
  {
    const X = sx(ppx) + TS / 2;
    const Y = sy(ppy) + TS / 2;
    ctx.fillStyle = `rgba(255,0,110,${0.18 + 0.2 * a.pulse})`;
    ctx.beginPath();
    ctx.arc(X, Y + 2, TS * 0.48, 0, Math.PI * 2);
    ctx.fill();
    const icon = CHARS.find((c) => c.id === w.hero.char)?.icon ?? '🧑';
    emoji(ctx, icon, X, Y - 2 * a.pulse, TS * 0.85);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    const fx2 = X + DX[w.face] * TS * 0.45;
    const fy2 = Y + DY[w.face] * TS * 0.45;
    ctx.arc(fx2, fy2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Effects.
  for (const b of fx.booms) {
    const k = b.t / 0.35;
    ctx.fillStyle = `rgba(255,${Math.round(160 * k)},40,${0.7 * (1 - k)})`;
    ctx.fillRect(sx(b.x) + 2 - k * 3, sy(b.y) + 2 - k * 3, TS - 4 + k * 6, TS - 4 + k * 6);
  }
  for (const s of fx.slashes) {
    const k = s.t / 0.2;
    ctx.strokeStyle = `rgba(255,255,255,${1 - k})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx(s.x) + 4, sy(s.y) + 4 + k * 6);
    ctx.lineTo(sx(s.x) + TS - 4, sy(s.y) + TS - 4 - k * 6);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  for (const f of fx.floats) {
    const k = f.t / 1;
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.font = `bold 14px system-ui, ${EMOJI_FONT}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const X = sx(f.x) + TS / 2;
    const Y = sy(f.y) + 4 - k * 22;
    ctx.strokeText(f.text, X, Y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, X, Y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

export interface BarState {
  /** Seconds from now to each upcoming beat. */
  next: number[];
  spb: number;
  win: number;
  pulse: number;
  miss: number;
  judge: string;
  judgeT: number;
  judgeColor: string;
  mult: number;
  countIn: number;
}

export function drawBar(ctx: CanvasRenderingContext2D, y: number, width: number, b: BarState): void {
  ctx.fillStyle = '#0d0714';
  ctx.fillRect(0, y, width, BAR);
  ctx.fillStyle = 'rgba(255,0,110,0.35)';
  ctx.fillRect(0, y, width, 2);
  const cx = width / 2;
  const cy = y + BAR / 2;
  const half = width / 2 - 10;
  const span = b.spb * 4;
  // Timing window around the heart.
  const ww = Math.min(half, (b.win / span) * half);
  ctx.fillStyle = 'rgba(126,224,138,0.18)';
  ctx.fillRect(cx - ww, y + 8, ww * 2, BAR - 16);
  for (const dt of b.next) {
    if (dt < -b.win || dt > span) continue;
    const off = (dt / span) * half;
    const alpha = Math.min(1, (span - dt) / (b.spb * 0.8));
    ctx.fillStyle = `rgba(58,200,255,${alpha})`;
    ctx.fillRect(cx - off - 3, y + 12, 6, BAR - 24);
    ctx.fillRect(cx + off - 3, y + 12, 6, BAR - 24);
  }
  const missed = b.miss > 0;
  emoji(ctx, missed ? '💔' : '❤️', cx, cy, 30 + 10 * b.pulse);
  ctx.textAlign = 'left';
  ctx.font = 'bold 15px system-ui';
  ctx.fillStyle = b.mult > 1 ? '#ffd166' : '#a99bbd';
  ctx.fillText(`×${b.mult}`, 10, cy + 1);
  if (b.countIn > 0) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillText(`Get ready… ${b.countIn}`, width - 10, cy + 1);
  } else if (b.judgeT < 0.6 && b.judge) {
    ctx.textAlign = 'right';
    ctx.globalAlpha = 1 - b.judgeT / 0.6;
    ctx.fillStyle = b.judgeColor;
    ctx.fillText(b.judge, width - 10, cy + 1);
    ctx.globalAlpha = 1;
  }
}

