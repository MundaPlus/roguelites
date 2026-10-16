/**
 * The wall simulation: paddle, balls, bricks, power-ups and bullets.
 * Pure state and a fixed-step `step()`. No DOM, so the headless sim and the bot use it too.
 * Balls move with swept collision (ray vs. expanded boxes), so fast balls never tunnel.
 */
import { ACTS, BOSSES, BOSS_ESCORT, POWERS, TEMPLATES, type BrickType, type PowerId } from './data';
import { Rng } from './rng';

export const W = 360;
export const H = 560;
export const COLS = 10;
export const CELL_W = 34;
export const CELL_H = 16;
export const GRID_X = 10;
export const GRID_Y = 48;
export const BRICK_W = 32;
export const BRICK_H = 14;
export const PADDLE_Y = 516;
export const PADDLE_H = 10;
export const BALL_R = 5;
export const SHIELD_Y = 546;
export const DANGER_Y = 466;
export const DT = 1 / 120;
export const MAX_BALLS = 8;
export const MAX_LIVES = 4;

export type WallKind = 'wall' | 'elite' | 'boss';

export interface Brick {
  id: number;
  type: BrickType;
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  max: number;
  /** Timer for shooting and regrowth. */
  t: number;
  /** Moving group, or -1. */
  group: number;
  /** x when the group offset is 0. */
  baseX: number;
  /** Flash timer after a hit. */
  hitT: number;
  lastHit: number;
  dead: boolean;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
  /** Offset from the paddle center while stuck. */
  off: number;
  stuckT: number;
  pierce: number;
}

export interface Drop {
  x: number;
  y: number;
  vy: number;
  kind: PowerId;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Laser {
  x: number;
  y: number;
}

export interface Group {
  off: number;
  vx: number;
  min: number;
  max: number;
}

export type FxKind = 'hit' | 'kill' | 'boom' | 'paddle' | 'wall' | 'power' | 'lost' | 'stun' | 'zap' | 'laser' | 'shield' | 'breach' | 'shoot' | 'gold' | 'boss' | 'clear' | 'split';

export interface Fx {
  k: FxKind;
  x: number;
  y: number;
  /** Extra data: damage, color, target position or text. */
  n?: number;
  c?: string;
  x2?: number;
  y2?: number;
  text?: string;
}

/** What the run gives the wall. */
export interface Loadout {
  lives: number;
  paddleW: number;
  dmg: number;
  speedMul: number;
  mods: Record<string, number>;
  /** 0 = normal wall. 1 = first wall of a run, 0.5 = second: slower ball, plain 1-HP bricks. */
  gentle?: number;
}

export interface Paddle {
  x: number;
  w: number;
  baseW: number;
  stun: number;
  wideT: number;
  laserT: number;
  laserCd: number;
  cannonCd: number;
  sticky: number;
}

export interface Game {
  act: number;
  kind: WallKind;
  template: string;
  rng: Rng;
  time: number;
  baseSpeed: number;
  speed: number;
  paddle: Paddle;
  balls: Ball[];
  bricks: Brick[];
  groups: Group[];
  drops: Drop[];
  bullets: Bullet[];
  lasers: Laser[];
  lives: number;
  gold: number;
  kills: number;
  shield: number;
  slowT: number;
  descendT: number;
  idleT: number;
  paddleHits: number;
  dmg: number;
  mods: Record<string, number>;
  boss: Brick | null;
  bossId: number;
  /** Boss slide direction: 1 or -1. */
  bossDir: number;
  spawnT: number;
  state: 'play' | 'won' | 'lost';
  fx: Fx[];
  nextId: number;
  /** Lives lost in this wall (for stats). */
  livesLost: number;
  gentle: number;
}

export interface Input {
  /** Target paddle x in board units, or null for keyboard control. */
  x: number | null;
  /** Keyboard direction: -1, 0 or 1. */
  dir: number;
  launch: boolean;
}

export const NO_INPUT: Input = { x: null, dir: 0, launch: false };

const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

// ---------- Wall generation ----------

function brickHp(rng: Rng, act: number, row: number, rows: number, elite: boolean): number {
  const top = row < rows / 2 ? 1 : 0;
  const base = [1, 1, 2][act] + (elite ? 1 : 0);
  return base + top + (rng.chance(0.25 + act * 0.1) ? 1 : 0);
}

function specialHp(type: BrickType, act: number, elite: boolean): number {
  const e = elite ? 1 : 0;
  switch (type) {
    case 'armor':
      return 5 + act * 2 + e;
    case 'bomb':
      return 1;
    case 'shooter':
      return 2 + act + e;
    case 'regen':
      return 3 + act + e;
    case 'gold':
      return 2 + act;
    default:
      return 1 + act + e;
  }
}

function addBrick(g: Game, type: BrickType, col: number, row: number, hp: number): Brick {
  const x = GRID_X + col * CELL_W + (CELL_W - BRICK_W) / 2;
  const b: Brick = {
    id: g.nextId++,
    type,
    x,
    y: GRID_Y + row * CELL_H + (CELL_H - BRICK_H) / 2,
    w: BRICK_W,
    h: BRICK_H,
    hp,
    max: hp,
    t: 2 + g.rng.next() * 3,
    group: -1,
    baseX: x,
    hitT: 0,
    lastHit: 0,
    dead: false,
  };
  g.bricks.push(b);
  return b;
}

/** Fill bricks from template rows, starting at grid row `row0`. */
function fillRows(g: Game, rows: string[], row0: number, mirror: boolean, special: number): void {
  const rng = g.rng;
  const act = g.act;
  const elite = g.kind === 'elite';
  const pool: [BrickType, number][] = [
    ['bomb', 3],
    ['armor', 2],
    ['shooter', act === 0 ? 1 : 3],
    ['regen', act === 0 ? 0.5 : 2],
    ['gold', 1],
  ];
  rows.forEach((line0, r) => {
    const line = mirror ? [...line0].reverse().join('') : line0;
    const movers: Brick[] = [];
    for (let c = 0; c < COLS; c++) {
      const ch = line[c];
      if (ch === '.' || ch === undefined) continue;
      let type: BrickType = 'normal';
      if (ch === 'X') type = 'bomb';
      else if (ch === 'A') type = 'armor';
      else if (ch === 'S') type = 'shooter';
      else if (ch === 'M') type = 'mover';
      else if (ch === 'R') type = 'regen';
      else if (ch === 'G') type = 'gold';
      else if (rng.chance(special)) type = rng.weighted(pool);
      // Gentle walls only keep explosives and movers as specials.
      if (g.gentle > 0 && type !== 'bomb' && type !== 'mover') type = 'normal';
      let hp = type === 'normal' ? brickHp(rng, act, r, rows.length, elite) : specialHp(type, act, elite);
      if (g.gentle >= 1) hp = 1;
      else if (g.gentle > 0) hp = Math.min(hp, 2);
      const b = addBrick(g, type, c, row0 + r, hp);
      if (type === 'mover') movers.push(b);
    }
    if (movers.length) {
      // All movers of a row slide together inside the free space of that row.
      const lo = Math.min(...movers.map((b) => b.baseX));
      const hi = Math.max(...movers.map((b) => b.baseX));
      const left = GRID_X + 1;
      const right = GRID_X + (COLS - 1) * CELL_W + 1;
      const id = g.groups.length;
      g.groups.push({ off: 0, vx: (40 + act * 12) * (rng.chance(0.5) ? 1 : -1), min: left - lo, max: right - hi });
      for (const b of movers) b.group = id;
    }
  });
}

export function newGame(seed: number, act: number, kind: WallKind, lo: Loadout): Game {
  const rng = new Rng(seed);
  const g: Game = {
    act,
    kind,
    template: '',
    rng,
    time: 0,
    baseSpeed: 300,
    speed: 300,
    paddle: { x: W / 2, w: lo.paddleW, baseW: lo.paddleW, stun: 0, wideT: 0, laserT: 0, laserCd: 0, cannonCd: 2, sticky: 0 },
    balls: [],
    bricks: [],
    groups: [],
    drops: [],
    bullets: [],
    lasers: [],
    lives: lo.lives,
    gold: 0,
    kills: 0,
    shield: lo.mods.shield ?? 0,
    slowT: 0,
    descendT: 0,
    idleT: 0,
    paddleHits: 0,
    dmg: lo.dmg,
    mods: lo.mods,
    boss: null,
    bossId: act,
    bossDir: 1,
    spawnT: 0,
    state: 'play',
    fx: [],
    nextId: 1,
    livesLost: 0,
    gentle: lo.gentle ?? 0,
  };
  const actSpeed = ACTS[act]?.speed ?? 370;
  g.baseSpeed = actSpeed * lo.speedMul * (kind === 'elite' ? 1.05 : 1) * (1 - 0.22 * g.gentle);
  g.speed = g.baseSpeed;
  const mirror = rng.chance(0.5);
  if (kind === 'boss') {
    const def = BOSSES[act];
    g.template = def.name;
    const b: Brick = {
      id: g.nextId++,
      type: 'boss',
      x: W / 2 - 68,
      y: GRID_Y + 2,
      w: 136,
      h: CELL_H * 3 - 4,
      hp: def.hp,
      max: def.hp,
      t: def.shootEvery,
      group: -1,
      baseX: W / 2 - 68,
      hitT: 0,
      lastHit: 0,
      dead: false,
    };
    g.bricks.push(b);
    g.boss = b;
    g.spawnT = def.spawnEvery;
    fillRows(g, BOSS_ESCORT[act], 3, mirror, 0.12 + act * 0.05);
  } else {
    // Early walls use the simpler templates.
    const pool = g.gentle > 0 ? TEMPLATES.filter((t) => ['Block', 'Pyramid', 'Checker', 'Invader', 'Stripes'].includes(t.name)) : act === 0 ? TEMPLATES.filter((t) => !['Fortress', 'Skull', 'Diamond'].includes(t.name)) : TEMPLATES;
    const t = rng.pick(pool);
    g.template = t.name;
    const special = [0.1, 0.24, 0.34][act] + (kind === 'elite' ? 0.12 : 0);
    fillRows(g, t.rows, kind === 'elite' ? 0 : 1, mirror, special);
  }
  serve(g);
  return g;
}

function serve(g: Game): void {
  g.balls.push({ id: g.nextId++, x: g.paddle.x, y: PADDLE_Y - BALL_R - 0.5, vx: 0, vy: 0, stuck: true, off: (g.rng.next() - 0.5) * 16, stuckT: 0, pierce: 0 });
}

// ---------- Damage ----------

function pierceFor(lvl: number): number {
  return [0, 1, 2, 4][lvl] ?? 0;
}

function dropPower(g: Game, b: Brick): void {
  const charm = g.mods.charm ?? 0;
  const chance = 0.11 + charm * 0.05 + (b.type === 'gold' ? 0.5 : 0);
  if (!g.rng.chance(chance)) return;
  const items: [PowerId, number][] = Object.entries(POWERS).map(([k, v]) => [k as PowerId, v.weight]);
  const kind = b.type === 'gold' ? 'coin' : g.rng.weighted(items);
  g.drops.push({ x: b.x + b.w / 2, y: b.y + b.h / 2, vy: 95 + g.rng.next() * 30, kind });
}

/** Hurt a brick. `src` decides which side effects apply. */
export function hurt(g: Game, b: Brick, dmg: number, src: 'ball' | 'fire' | 'boom' | 'laser' | 'zap'): boolean {
  if (b.dead || dmg <= 0) return false;
  if (b.type === 'armor' && (src === 'fire' || src === 'zap')) return false;
  b.hp -= dmg;
  b.hitT = 0.15;
  b.lastHit = g.time;
  g.idleT = 0;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  if (b.hp > 0) {
    g.fx.push({ k: b.type === 'boss' ? 'boss' : 'hit', x: cx, y: cy, n: dmg });
    return false;
  }
  b.dead = true;
  g.kills++;
  const charm = g.mods.charm ?? 0;
  let gold = b.type === 'boss' ? 0 : 1;
  if (b.type === 'gold') gold += 8;
  gold = Math.round(gold * (1 + charm * 0.25));
  g.gold += gold;
  g.fx.push({ k: 'kill', x: cx, y: cy, c: b.type, n: gold });
  if (b.type === 'gold') g.fx.push({ k: 'gold', x: cx, y: cy, n: gold });
  if (b.type === 'bomb') {
    g.fx.push({ k: 'boom', x: cx, y: cy, n: 54 });
    for (const o of g.bricks) {
      if (o.dead) continue;
      const dx = o.x + o.w / 2 - cx;
      const dy = o.y + o.h / 2 - cy;
      if (o.type === 'boss' ? Math.abs(dx) < o.w / 2 + 40 && Math.abs(dy) < o.h / 2 + 30 : dx * dx + dy * dy < 54 * 54) hurt(g, o, 3, 'boom');
    }
  }
  if (b.type !== 'boss') dropPower(g, b);
  return true;
}

function ballHit(g: Game, ball: Ball, b: Brick): boolean {
  const killed = hurt(g, b, g.dmg, 'ball');
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const fire = g.mods.fire ?? 0;
  if (fire > 0 && b.type !== 'boss') {
    const rx = CELL_W + 4;
    const ry = fire >= 2 ? CELL_H + 4 : 2;
    for (const o of g.bricks) {
      if (o === b || o.dead || o.type === 'boss') continue;
      const dx = Math.abs(o.x + o.w / 2 - cx);
      const dy = Math.abs(o.y + o.h / 2 - cy);
      if (dx <= rx && dy <= ry && (dx > 2 || dy > 2)) hurt(g, o, fire >= 3 ? 2 : 1, 'fire');
    }
    g.fx.push({ k: 'hit', x: cx, y: cy, c: 'fire' });
  }
  const chain = g.mods.chain ?? 0;
  if (chain > 0 && g.rng.chance(chain * 0.2)) {
    const alive = g.bricks.filter((o) => !o.dead && o !== b && o.type !== 'armor');
    if (alive.length) {
      const t = g.rng.pick(alive);
      g.fx.push({ k: 'zap', x: cx, y: cy, x2: t.x + t.w / 2, y2: t.y + t.h / 2 });
      hurt(g, t, 1, 'zap');
    }
  }
  void ball;
  return killed;
}

// ---------- Swept ball movement ----------

interface Hit {
  t: number;
  kind: 'wl' | 'wr' | 'wt' | 'paddle' | 'shield' | 'brick';
  axis: 'x' | 'y';
  brick?: Brick;
}

/** Ray (x,y)+(mx,my)*t against a box. Returns entry time and axis, or null. */
function rayBox(x: number, y: number, mx: number, my: number, x0: number, y0: number, x1: number, y1: number): { t: number; axis: 'x' | 'y' } | null {
  let txIn: number;
  let txOut: number;
  let tyIn: number;
  let tyOut: number;
  if (mx !== 0) {
    const a = (x0 - x) / mx;
    const b = (x1 - x) / mx;
    txIn = Math.min(a, b);
    txOut = Math.max(a, b);
  } else if (x > x0 && x < x1) {
    txIn = -Infinity;
    txOut = Infinity;
  } else return null;
  if (my !== 0) {
    const a = (y0 - y) / my;
    const b = (y1 - y) / my;
    tyIn = Math.min(a, b);
    tyOut = Math.max(a, b);
  } else if (y > y0 && y < y1) {
    tyIn = -Infinity;
    tyOut = Infinity;
  } else return null;
  const tIn = Math.max(txIn, tyIn);
  const tOut = Math.min(txOut, tyOut);
  if (tIn > tOut || tOut <= 0 || tIn > 1) return null;
  // Starting inside the box: ignore it (the ball leaves on its own).
  if (tIn < 0) return null;
  return { t: tIn, axis: txIn > tyIn ? 'x' : 'y' };
}

function paddleBounce(g: Game, ball: Ball): void {
  const p = g.paddle;
  const off = clamp((ball.x - p.x) / (p.w / 2), -1, 1);
  const ang = off * 1.05;
  const s = Math.hypot(ball.vx, ball.vy) || g.speed;
  ball.vx = s * Math.sin(ang);
  ball.vy = -s * Math.cos(ang);
  ball.y = Math.min(ball.y, PADDLE_Y - BALL_R - 0.01);
  ball.pierce = pierceFor(g.mods.pierce ?? 0);
  g.paddleHits++;
  g.fx.push({ k: 'paddle', x: ball.x, y: PADDLE_Y });
  if (p.sticky > 0) {
    p.sticky--;
    ball.stuck = true;
    ball.off = ball.x - p.x;
    ball.stuckT = 0;
    ball.vx = 0;
    ball.vy = 0;
    return;
  }
  const split = g.mods.split ?? 0;
  if (split > 0 && g.paddleHits % (5 - split) === 0 && g.balls.filter((b) => !b.stuck).length < 1 + split) {
    const a2 = clamp(-ang * 0.6 + (g.rng.next() - 0.5) * 0.4, -1, 1);
    g.balls.push({ id: g.nextId++, x: ball.x, y: ball.y, vx: s * Math.sin(a2), vy: -s * Math.cos(a2), stuck: false, off: 0, stuckT: 0, pierce: ball.pierce });
    g.fx.push({ k: 'split', x: ball.x, y: ball.y });
  }
}

/** Move one ball by its velocity for one step, bouncing on everything it meets on the way. */
function moveBall(g: Game, ball: Ball): void {
  let mx = ball.vx * DT;
  let my = ball.vy * DT;
  const p = g.paddle;
  const r = BALL_R;
  for (let iter = 0; iter < 8; iter++) {
    const len = Math.hypot(mx, my);
    if (len < 1e-6) return;
    let best: Hit | null = null;
    const consider = (h: Hit): void => {
      if (!best || h.t < best.t) best = h;
    };
    if (mx < 0 && ball.x + mx < r) consider({ t: (r - ball.x) / mx, kind: 'wl', axis: 'x' });
    if (mx > 0 && ball.x + mx > W - r) consider({ t: (W - r - ball.x) / mx, kind: 'wr', axis: 'x' });
    if (my < 0 && ball.y + my < r) consider({ t: (r - ball.y) / my, kind: 'wt', axis: 'y' });
    // Paddle: only from above. A paddle that jumped onto the ball also counts.
    if (my > 0) {
      const top = PADDLE_Y - r;
      const px0 = p.x - p.w / 2 - r;
      const px1 = p.x + p.w / 2 + r;
      if (ball.y <= top && ball.y + my >= top) {
        const t = (top - ball.y) / my;
        const hx = ball.x + mx * t;
        if (hx >= px0 && hx <= px1) consider({ t, kind: 'paddle', axis: 'y' });
      } else if (ball.y > top && ball.y < PADDLE_Y + PADDLE_H && ball.x >= px0 && ball.x <= px1) {
        consider({ t: 0, kind: 'paddle', axis: 'y' });
      }
      if (g.shield > 0) {
        const sy = SHIELD_Y - r;
        if (ball.y <= sy && ball.y + my >= sy) consider({ t: (sy - ball.y) / my, kind: 'shield', axis: 'y' });
      }
    }
    // Bricks (broadphase on the swept box).
    const bx0 = Math.min(ball.x, ball.x + mx) - r;
    const bx1 = Math.max(ball.x, ball.x + mx) + r;
    const by0 = Math.min(ball.y, ball.y + my) - r;
    const by1 = Math.max(ball.y, ball.y + my) + r;
    for (const b of g.bricks) {
      if (b.dead || b.x > bx1 || b.x + b.w < bx0 || b.y > by1 || b.y + b.h < by0) continue;
      const h = rayBox(ball.x, ball.y, mx, my, b.x - r, b.y - r, b.x + b.w + r, b.y + b.h + r);
      if (h) consider({ t: h.t, kind: 'brick', axis: h.axis, brick: b });
    }
    const hit = best as Hit | null;
    if (!hit) {
      ball.x += mx;
      ball.y += my;
      return;
    }
    const t = Math.max(0, hit.t - 1e-4);
    ball.x += mx * t;
    ball.y += my * t;
    const rest = len * (1 - t);
    switch (hit.kind) {
      case 'wl':
      case 'wr':
        ball.vx = -ball.vx;
        g.fx.push({ k: 'wall', x: ball.x, y: ball.y });
        break;
      case 'wt':
        ball.vy = Math.abs(ball.vy);
        g.fx.push({ k: 'wall', x: ball.x, y: ball.y });
        break;
      case 'shield':
        ball.vy = -Math.abs(ball.vy);
        g.shield--;
        g.fx.push({ k: 'shield', x: ball.x, y: SHIELD_Y });
        break;
      case 'paddle':
        paddleBounce(g, ball);
        if (ball.stuck) return;
        break;
      case 'brick': {
        const killed = ballHit(g, ball, hit.brick!);
        if (killed && ball.pierce > 0) {
          ball.pierce--;
        } else if (hit.axis === 'x') ball.vx = -ball.vx;
        else ball.vy = -ball.vy;
        break;
      }
    }
    const s = Math.hypot(ball.vx, ball.vy) || 1;
    mx = (ball.vx / s) * rest;
    my = (ball.vy / s) * rest;
  }
}

// ---------- Power-ups ----------

function applyPower(g: Game, kind: PowerId): void {
  const p = g.paddle;
  switch (kind) {
    case 'multi': {
      const src = g.balls.find((b) => !b.stuck) ?? g.balls[0];
      if (!src) break;
      if (src.stuck) launch(g, src);
      const s = Math.hypot(src.vx, src.vy) || g.speed;
      const base = Math.atan2(src.vx, -src.vy);
      for (const d of [-0.45, 0.45]) {
        if (g.balls.length >= MAX_BALLS) break;
        const a = clamp(base + d, -1.2, 1.2);
        const dir = src.vy > 0 ? 1 : -1;
        g.balls.push({ id: g.nextId++, x: src.x, y: src.y, vx: s * Math.sin(a), vy: -dir * s * Math.cos(a), stuck: false, off: 0, stuckT: 0, pierce: src.pierce });
      }
      break;
    }
    case 'wide':
      p.wideT = 12;
      break;
    case 'laser':
      p.laserT = 8;
      break;
    case 'slow':
      g.slowT = 10;
      break;
    case 'sticky':
      p.sticky = 3;
      break;
    case 'life':
      if (g.lives < MAX_LIVES) g.lives++;
      else g.gold += 15;
      break;
    case 'coin':
      g.gold += 10;
      break;
  }
}

function launch(g: Game, ball: Ball): void {
  const p = g.paddle;
  const off = clamp(ball.off / (p.w / 2), -1, 1);
  const ang = clamp(off * 1.05, -1, 1) || 0.12;
  ball.stuck = false;
  ball.vx = g.speed * Math.sin(ang);
  ball.vy = -g.speed * Math.cos(ang);
  ball.pierce = pierceFor(g.mods.pierce ?? 0);
}

// ---------- Main step ----------

/** Advance the wall by one fixed step of DT seconds. */
export function step(g: Game, input: Input): void {
  if (g.state !== 'play') return;
  if (g.fx.length > 400) g.fx.splice(0, g.fx.length - 200);
  g.time += DT;
  g.idleT += DT;
  const p = g.paddle;
  const rng = g.rng;

  // Timers and speed.
  p.wideT = Math.max(0, p.wideT - DT);
  p.laserT = Math.max(0, p.laserT - DT);
  p.stun = Math.max(0, p.stun - DT);
  g.slowT = Math.max(0, g.slowT - DT);
  const targetW = p.baseW * (p.wideT > 0 ? 1.5 : 1);
  p.w += (targetW - p.w) * Math.min(1, DT * 10);
  g.speed = g.baseSpeed * (1 + (g.kind === 'boss' ? Math.min(0.2, g.time / 200) : Math.min(0.45, g.time / 70))) * (g.slowT > 0 ? 0.7 : 1);

  // Paddle.
  if (p.stun <= 0) {
    if (input.x !== null) p.x = input.x;
    else p.x += input.dir * 560 * DT;
  }
  p.x = clamp(p.x, p.w / 2, W - p.w / 2);

  // Balls.
  const magnet = g.mods.magnet ?? 0;
  for (const ball of g.balls) {
    if (ball.stuck) {
      ball.stuckT += DT;
      ball.off = clamp(ball.off, -p.w / 2 + 2, p.w / 2 - 2);
      ball.x = p.x + ball.off;
      ball.y = PADDLE_Y - BALL_R - 0.5;
      if (input.launch || ball.stuckT > 3) launch(g, ball);
      continue;
    }
    if (magnet > 0 && ball.vy > 0 && ball.y > H * 0.55) {
      const pull = clamp(p.x - ball.x, -60, 60) * magnet;
      ball.vx += pull * DT * 3;
    }
    const s = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx = (ball.vx / s) * g.speed;
    ball.vy = (ball.vy / s) * g.speed;
    // Keep the ball from flying almost flat.
    const minVy = g.speed * 0.3;
    if (Math.abs(ball.vy) < minVy) {
      ball.vy = (ball.vy < 0 ? -1 : 1) * minVy;
      ball.vx = Math.sign(ball.vx || 1) * Math.sqrt(g.speed * g.speed - minVy * minVy);
    }
    moveBall(g, ball);
  }
  // Rescue balls that got out of the board, drop balls that fell.
  for (const ball of g.balls) {
    if (ball.x < BALL_R || ball.x > W - BALL_R) ball.x = clamp(ball.x, BALL_R, W - BALL_R);
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      ball.vy = Math.abs(ball.vy);
    }
  }
  g.balls = g.balls.filter((b) => b.y < H + BALL_R * 2);
  if (g.balls.length === 0) {
    loseLife(g, p.x, PADDLE_Y);
    if (g.state !== 'play') return;
    p.wideT = 0;
    p.laserT = 0;
    p.sticky = 0;
    g.slowT = 0;
    serve(g);
  }

  // Anti-loop: nudge balls that bounce for a long time without a brick hit.
  if (g.idleT > 9) {
    g.idleT = 0;
    for (const b of g.balls) {
      if (b.stuck) continue;
      const a = (rng.next() - 0.5) * 0.6;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      [b.vx, b.vy] = [b.vx * c - b.vy * sn, b.vx * sn + b.vy * c];
    }
  }

  // Moving groups.
  for (const gr of g.groups) {
    gr.off += gr.vx * DT;
    if (gr.off < gr.min) {
      gr.off = gr.min;
      gr.vx = Math.abs(gr.vx);
    } else if (gr.off > gr.max) {
      gr.off = gr.max;
      gr.vx = -Math.abs(gr.vx);
    }
  }

  // Bricks.
  const shootGap = [6, 4, 3.2][g.act] ?? 3.2;
  for (const b of g.bricks) {
    if (b.dead) continue;
    b.hitT = Math.max(0, b.hitT - DT);
    if (b.group >= 0) b.x = b.baseX + g.groups[b.group].off;
    if (b.type === 'regen' && b.hp < b.max && g.time - b.lastHit > 1.5) {
      b.t -= DT;
      if (b.t <= 0) {
        b.t = 2.5;
        b.hp++;
      }
    } else if (b.type === 'shooter') {
      b.t -= DT;
      if (b.t <= 0) {
        b.t = shootGap + rng.next() * 2;
        fire(g, b.x + b.w / 2, b.y + b.h, 1, 150 + g.act * 25);
      }
    }
  }
  if (g.boss && !g.boss.dead) bossStep(g, g.boss);

  // Bricks creep down in normal walls.
  if (g.kind !== 'boss' && g.time > 35) {
    g.descendT += DT;
    const every = g.kind === 'elite' ? 9 : 11;
    if (g.descendT >= every) {
      g.descendT = 0;
      let breach = false;
      for (const b of g.bricks) {
        if (b.dead) continue;
        b.y += 8;
        if (b.y + b.h >= DANGER_Y) {
          b.dead = true;
          breach = true;
          g.fx.push({ k: 'boom', x: b.x + b.w / 2, y: b.y + b.h / 2, n: 20 });
        }
      }
      if (breach) {
        g.fx.push({ k: 'breach', x: W / 2, y: DANGER_Y });
        loseLife(g, W / 2, DANGER_Y);
        if (g.state !== 'play') return;
      }
    }
  }

  // Lasers: the paddle power-up and the cannon part.
  if (p.laserT > 0) {
    p.laserCd -= DT;
    if (p.laserCd <= 0) {
      p.laserCd = 0.3;
      g.lasers.push({ x: p.x - p.w / 2 + 4, y: PADDLE_Y - 2 }, { x: p.x + p.w / 2 - 4, y: PADDLE_Y - 2 });
      g.fx.push({ k: 'laser', x: p.x, y: PADDLE_Y });
    }
  }
  const cannon = g.mods.cannon ?? 0;
  if (cannon > 0) {
    p.cannonCd -= DT;
    if (p.cannonCd <= 0) {
      p.cannonCd = [3, 2.2, 1.5][cannon - 1] ?? 1.5;
      g.lasers.push({ x: p.x, y: PADDLE_Y - 4 });
      g.fx.push({ k: 'laser', x: p.x, y: PADDLE_Y });
    }
  }
  for (const l of g.lasers) {
    const y0 = l.y;
    l.y -= 620 * DT;
    let hitB: Brick | null = null;
    for (const b of g.bricks) {
      if (b.dead || l.x < b.x || l.x > b.x + b.w || b.y > y0 || b.y + b.h < l.y) continue;
      if (!hitB || b.y > hitB.y) hitB = b;
    }
    if (hitB) {
      hurt(g, hitB, 1, 'laser');
      l.y = -100;
    }
  }
  g.lasers = g.lasers.filter((l) => l.y > -10);

  // Enemy bullets.
  for (const bu of g.bullets) {
    bu.x += bu.vx * DT;
    bu.y += bu.vy * DT;
    if (bu.y >= PADDLE_Y - 3 && bu.y <= PADDLE_Y + PADDLE_H + 3 && Math.abs(bu.x - p.x) <= p.w / 2 + 3) {
      bu.y = H + 50;
      p.stun = 0.8;
      g.fx.push({ k: 'stun', x: bu.x, y: PADDLE_Y });
    }
  }
  g.bullets = g.bullets.filter((b) => b.y < H + 10 && b.x > -10 && b.x < W + 10);

  // Falling power-ups.
  for (const d of g.drops) {
    d.y += d.vy * DT;
    if (magnet > 0 && d.y > H * 0.45) d.x += clamp(p.x - d.x, -1, 1) * 70 * magnet * DT;
    if (d.y >= PADDLE_Y - 6 && d.y <= PADDLE_Y + PADDLE_H + 6 && Math.abs(d.x - p.x) <= p.w / 2 + 8) {
      d.y = H + 50;
      applyPower(g, d.kind);
      g.fx.push({ k: 'power', x: d.x, y: PADDLE_Y, text: d.kind });
    }
  }
  g.drops = g.drops.filter((d) => d.y < H + 10);

  // Clean up and check the end of the wall.
  if (g.bricks.some((b) => b.dead)) g.bricks = g.bricks.filter((b) => !b.dead);
  const won = g.boss ? g.boss.dead : g.bricks.length === 0;
  if (won) {
    for (const b of g.bricks) g.fx.push({ k: 'boom', x: b.x + b.w / 2, y: b.y + b.h / 2, n: 16 });
    g.bricks = [];
    g.state = 'won';
    g.fx.push({ k: 'clear', x: W / 2, y: H / 2 });
  }
}

function loseLife(g: Game, x: number, y: number): void {
  g.lives--;
  g.livesLost++;
  g.fx.push({ k: 'lost', x, y });
  if (g.lives <= 0) {
    g.lives = 0;
    g.state = 'lost';
  }
}

function fire(g: Game, x: number, y: number, n: number, speed: number): void {
  const p = g.paddle;
  const base = Math.atan2(p.x - x, PADDLE_Y - y);
  for (let i = 0; i < n; i++) {
    const a = base + (i - (n - 1) / 2) * 0.28;
    g.bullets.push({ x, y, vx: Math.sin(a) * speed, vy: Math.cos(a) * speed });
  }
  g.fx.push({ k: 'shoot', x, y });
}

function bossStep(g: Game, b: Brick): void {
  const def = BOSSES[g.bossId];
  // Slide.
  if (def.speed > 0) {
    const fast = b.hp < b.max / 2 ? 1.4 : 1;
    b.baseX += def.speed * fast * DT * g.bossDir;
    if (b.baseX < 4) {
      b.baseX = 4;
      g.bossDir = 1;
    } else if (b.baseX + b.w > W - 4) {
      b.baseX = W - 4 - b.w;
      g.bossDir = -1;
    }
    b.x = b.baseX;
  }
  if (def.regen > 0 && b.hp < b.max && g.time - b.lastHit > 1) {
    b.hp = Math.min(b.max, b.hp + def.regen * DT);
  }
  if (def.shootEvery > 0) {
    b.t -= DT;
    if (b.t <= 0) {
      b.t = def.shootEvery * (b.hp < b.max / 2 ? 0.75 : 1);
      fire(g, b.x + b.w / 2, b.y + b.h, def.spread, 165 + g.act * 20);
    }
  }
  if (def.spawnEvery > 0) {
    g.spawnT -= DT;
    if (g.spawnT <= 0) {
      g.spawnT = def.spawnEvery;
      // New bricks fill empty cells of the escort rows.
      const cells: [number, number][] = [];
      for (let row = 3; row < 6; row++) {
        for (let c = 0; c < COLS; c++) {
          const x = GRID_X + c * CELL_W + 1;
          const y = GRID_Y + row * CELL_H + 1;
          if (!g.bricks.some((o) => !o.dead && Math.abs(o.x - x) < CELL_W - 2 && Math.abs(o.y - y) < CELL_H - 2)) cells.push([c, row]);
        }
      }
      g.rng.shuffle(cells);
      const n = Math.min(cells.length, 4 + g.act);
      for (let i = 0; i < n; i++) {
        const [c, row] = cells[i];
        const nb = addBrick(g, g.rng.chance(0.2) ? 'bomb' : 'normal', c, row, 1 + g.act);
        if (nb.type === 'bomb') nb.hp = nb.max = 1;
        // Do not trap a ball inside a new brick.
        if (g.balls.some((ball) => ball.x > nb.x - BALL_R && ball.x < nb.x + nb.w + BALL_R && ball.y > nb.y - BALL_R && ball.y < nb.y + nb.h + BALL_R)) nb.dead = true;
      }
      g.fx.push({ k: 'shoot', x: b.x + b.w / 2, y: b.y + b.h });
    }
  }
}

/** Number of bricks that still count for the wall (for the HUD). */
export const bricksLeft = (g: Game): number => g.bricks.length;
