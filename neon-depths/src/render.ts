import { COLS, type Palette, ROOM_H, ROOM_W, ROWS, type Room, T, TILE, idx } from './dungeon';
import type { Shape } from './enemies';
import { TAU } from './math';

const glowCache = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + '88');
  grad.addColorStop(1, color + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

/** Soft glow from a cached sprite. Much faster than shadowBlur. */
export function drawGlow(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number): void {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(glowSprite(color), x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = prev;
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.8, y - r * 1.2, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.8, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  ctx.closePath();
}

/** A heart filled `fill` of `max` halves. */
export function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: number, max: number): void {
  ctx.save();
  heartPath(ctx, x, y, r);
  ctx.fillStyle = 'rgba(40,10,20,0.8)';
  ctx.fill();
  if (fill > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - r * 1.5, y - r * 1.5, (r * 3 * fill) / max, r * 3);
    ctx.clip();
    heartPath(ctx, x, y, r);
    ctx.fillStyle = '#ff2e63';
    ctx.shadowColor = '#ff2e63';
    ctx.shadowBlur = r;
    ctx.fill();
    ctx.restore();
  }
  heartPath(ctx, x, y, r);
  ctx.strokeStyle = '#ff6b8b';
  ctx.lineWidth = Math.max(1, r / 6);
  ctx.stroke();
  ctx.restore();
}

export function shapePath(ctx: CanvasRenderingContext2D, shape: Shape, r: number, t: number): void {
  ctx.beginPath();
  const poly = (n: number, rot = 0, rr = r) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
  };
  switch (shape) {
    case 'diamond':
      poly(4);
      break;
    case 'triangle':
      poly(3);
      break;
    case 'square':
      poly(4, Math.PI / 4, r * 1.2);
      break;
    case 'hex':
      poly(6);
      break;
    case 'octagon':
      poly(8, Math.PI / 8);
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        const rr = i % 2 ? r * 0.5 : r;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    case 'cross':
      ctx.moveTo(r, 0);
      ctx.lineTo(r * 0.3, r * 0.3);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.3, r * 0.3);
      ctx.lineTo(-r, 0);
      ctx.lineTo(-r * 0.3, -r * 0.3);
      ctx.lineTo(0, -r);
      ctx.lineTo(r * 0.3, -r * 0.3);
      ctx.closePath();
      break;
    case 'arrow':
      ctx.moveTo(r * 1.2, 0);
      ctx.lineTo(-r, -r * 0.8);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r, r * 0.8);
      ctx.closePath();
      break;
    case 'blob':
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * TAU;
        const rr = r * (1 + Math.sin(a * 3 + t * 5) * 0.08);
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
    default:
      ctx.arc(0, 0, r, 0, TAU);
  }
}

const RES = 2;

/** Draws walls, floor, rocks and pits once into an offscreen canvas. */
export function drawRoomStatic(room: Room, pal: Palette, reuse: HTMLCanvasElement | undefined, hint: boolean): HTMLCanvasElement {
  const c = reuse ?? document.createElement('canvas');
  c.width = ROOM_W * RES;
  c.height = ROOM_H * RES;
  const g = c.getContext('2d')!;
  g.setTransform(RES, 0, 0, RES, 0, 0);
  g.fillStyle = pal.bg;
  g.fillRect(0, 0, ROOM_W, ROOM_H);
  // Grid
  g.strokeStyle = pal.grid;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = TILE; x <= ROOM_W - TILE; x += TILE / 2) {
    g.moveTo(x, TILE);
    g.lineTo(x, ROOM_H - TILE);
  }
  for (let y = TILE; y <= ROOM_H - TILE; y += TILE / 2) {
    g.moveTo(TILE, y);
    g.lineTo(ROOM_W - TILE, y);
  }
  g.stroke();
  // Wall band
  g.fillStyle = '#000000';
  g.fillRect(0, 0, ROOM_W, TILE);
  g.fillRect(0, ROOM_H - TILE, ROOM_W, TILE);
  g.fillRect(0, 0, TILE, ROOM_H);
  g.fillRect(ROOM_W - TILE, 0, TILE, ROOM_H);
  g.save();
  g.strokeStyle = pal.wall;
  g.shadowColor = pal.wall;
  g.shadowBlur = 14;
  g.lineWidth = 3;
  g.strokeRect(TILE - 2, TILE - 2, ROOM_W - TILE * 2 + 4, ROOM_H - TILE * 2 + 4);
  g.globalAlpha = 0.35;
  g.lineWidth = 1;
  g.strokeRect(10, 10, ROOM_W - 20, ROOM_H - 20);
  g.restore();
  // Tiles
  for (let ty = 1; ty < ROWS - 1; ty++) {
    for (let tx = 1; tx < COLS - 1; tx++) {
      const t = room.tiles[idx(tx, ty)];
      const x = tx * TILE;
      const y = ty * TILE;
      if (t === T.Pit) {
        g.fillStyle = '#000';
        g.fillRect(x, y, TILE, TILE);
        g.save();
        g.strokeStyle = pal.wall;
        g.globalAlpha = 0.35;
        g.lineWidth = 1;
        const open = (dx: number, dy: number) => room.tiles[idx(tx + dx, ty + dy)] !== T.Pit;
        g.beginPath();
        if (open(0, -1)) {
          g.moveTo(x, y + 0.5);
          g.lineTo(x + TILE, y + 0.5);
        }
        if (open(0, 1)) {
          g.moveTo(x, y + TILE - 0.5);
          g.lineTo(x + TILE, y + TILE - 0.5);
        }
        if (open(-1, 0)) {
          g.moveTo(x + 0.5, y);
          g.lineTo(x + 0.5, y + TILE);
        }
        if (open(1, 0)) {
          g.moveTo(x + TILE - 0.5, y);
          g.lineTo(x + TILE - 0.5, y + TILE);
        }
        g.stroke();
        g.restore();
      } else if (t === T.Rock) {
        g.save();
        g.fillStyle = '#0c0c14';
        g.strokeStyle = pal.rock;
        g.shadowColor = pal.rock;
        g.shadowBlur = 8;
        g.lineWidth = 2;
        g.beginPath();
        g.roundRect(x + 4, y + 4, TILE - 8, TILE - 8, 7);
        g.fill();
        g.stroke();
        g.shadowBlur = 0;
        g.globalAlpha = 0.4;
        g.beginPath();
        g.moveTo(x + 12, y + 14);
        g.lineTo(x + 20, y + 22);
        g.lineTo(x + 28, y + 16);
        g.stroke();
        g.restore();
      } else if (t === T.Block) {
        g.save();
        g.fillStyle = '#16161f';
        g.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
        g.strokeStyle = '#4a4a5e';
        g.lineWidth = 2;
        g.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
        g.beginPath();
        g.moveTo(x + 8, y + 8);
        g.lineTo(x + TILE - 8, y + TILE - 8);
        g.moveTo(x + TILE - 8, y + 8);
        g.lineTo(x + 8, y + TILE - 8);
        g.stroke();
        g.restore();
      }
    }
  }
  // Door gaps in the wall line
  for (const d of Object.keys(room.doors)) {
    const pos = { n: [8, 0], s: [8, 10], w: [0, 5], e: [16, 5] }[d as 'n']!;
    g.fillStyle = pal.bg;
    g.fillRect(pos[0] * TILE, pos[1] * TILE, TILE, TILE);
  }
  if (hint) {
    g.save();
    g.fillStyle = pal.wall;
    g.globalAlpha = 0.35;
    g.textAlign = 'center';
    g.font = 'bold 13px system-ui';
    g.fillText('WASD move · Mouse aim · Click shoot · Space dodge · E bomb', ROOM_W / 2, ROOM_H / 2 - 50);
    g.font = '11px system-ui';
    g.fillText('Arrow keys also shoot · F auto-fire · Tab map · Esc pause', ROOM_W / 2, ROOM_H / 2 - 30);
    g.restore();
  }
  return c;
}
