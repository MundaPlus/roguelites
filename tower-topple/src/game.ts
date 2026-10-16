/**
 * One challenge: the tower world, the falling piece, hazards, spells and rules.
 * Pure logic, no DOM. The app and the headless sim both drive it with `tick()`.
 */
import { BIG_SHAPES, CURSES, MATS, SHAPES, SHAPE_COLOR, type Cell, type ChallengeKind } from './data';
import { DT, World, cellsToRects, freeze, makeBody, overlap, pointIn, updateCache, type Body, type WBox } from './physics';
import { Rng } from './rng';

export const VIEW_W = 16;
export const VIEW_H = 22;
export const FALL_SPEED = 2.4;
export const DROP_SPEED = 16;
const LOST_Y = -5;
const GOAL_HOLD = 2;

export interface ChallengeSpec {
  kind: ChallengeKind;
  world: number;
  tier: 'normal' | 'elite' | 'boss';
  /** Race: goal height. Ceiling: ceiling height. Hold: not used. */
  goal: number;
  /** Hold and ceiling: blocks to place. */
  blocks: number;
  /** Race: time limit in seconds. */
  time: number;
  /** Hold: storm length in seconds. */
  hold: number;
  platW: number;
  wind: number;
  quake: number;
  moving: number;
  ice: number;
  stone: number;
  debris: number;
  curses: string[];
  curseEvery: number;
  shapes: string[];
  bigBlocks: boolean;
  seed: number;
}

export interface Piece {
  shape: string;
  cells: Cell[];
  cs: number;
  mat: string;
  left: number;
  bottom: number;
  glue: boolean;
  heavy: boolean;
}

export type GameEvent =
  | { type: 'land'; x: number; y: number; speed: number }
  | { type: 'lost'; x: number; y: number }
  | { type: 'zap'; x: number; y: number }
  | { type: 'spared'; x: number; y: number }
  | { type: 'spell'; id: string }
  | { type: 'warn'; id: string }
  | { type: 'curse'; id: string }
  | { type: 'goal' }
  | { type: 'storm' }
  | { type: 'glue'; x: number; y: number }
  | { type: 'pin'; x: number; y: number }
  | { type: 'spawn' }
  | { type: 'move' }
  | { type: 'rotate' }
  | { type: 'end'; won: boolean; reason: string };

export interface GameResult {
  won: boolean;
  reason: string;
  height: number;
  livesLost: number;
  timeLeft: number;
  placed: number;
}

const rotCW = (cells: Cell[]): Cell[] => norm(cells.map(([x, y]) => [y, -x] as Cell));

function norm(cells: Cell[]): Cell[] {
  const mx = Math.min(...cells.map((c) => c[0]));
  const my = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => [x - mx, y - my] as Cell);
}

const snap = (v: number): number => Math.round(v * 2) / 2;

export const pieceW = (p: { cells: Cell[]; cs: number }): number => (Math.max(...p.cells.map((c) => c[0])) + 1) * p.cs;
export const pieceH = (p: { cells: Cell[]; cs: number }): number => (Math.max(...p.cells.map((c) => c[1])) + 1) * p.cs;

/** World boxes of a piece at a pose. */
export function pieceBoxes(cells: Cell[], cs: number, left: number, bottom: number): WBox[] {
  return cellsToRects(cells).map((r) => ({ x: left + (r.x + r.w / 2) * cs, y: bottom + (r.y + r.h / 2) * cs, c: 1, s: 0, hw: (r.w * cs) / 2, hh: (r.h * cs) / 2 }));
}

export const matProps = (m: string) => MATS[m] ?? MATS.wood;

export const blockColor = (shape: string, mat: string): string => MATS[mat]?.color ?? SHAPE_COLOR[shape] ?? '#ffd166';

export class Game {
  readonly spec: ChallengeSpec;
  world = new World();
  platform: Body;
  platBaseW: number;
  rng: Rng;
  t = 0;
  lives: number;
  livesLost = 0;
  piece: Piece | null = null;
  next: string;
  bag: string[] = [];
  placed = 0;
  /** Placed blocks in order, for undo. */
  order: Body[] = [];
  height = 0;
  maxHeight = 0;
  camY = -4;
  goalT = 0;
  status: 'play' | 'won' | 'lost' = 'play';
  reason = '';
  events: GameEvent[] = [];
  /** Hold: 'build' then 'storm'. */
  phase: 'build' | 'storm' = 'build';
  stormT = 0;
  settleT = 0;
  drop = false;
  slam = false;
  // Hazards
  wind = 0;
  gustT = 0;
  gustDir = 1;
  quakeT = 0;
  slideT = 0;
  calmT = 0;
  iceNext = 0;
  bigNext = 0;
  curseT = 0;
  warned = false;
  nextCurse = '';
  rocks: { at: number; x: number }[] = [];
  platOffset = 0;
  ledge = 0;
  spawnWait = 0;
  collapseT = 0;
  collapseN = 0;

  constructor(spec: ChallengeSpec, lives: number) {
    this.spec = spec;
    this.lives = lives;
    this.rng = new Rng(spec.seed);
    this.platBaseW = spec.platW;
    this.platform = this.world.add(makeBody([{ cx: 0, cy: -0.5, hw: spec.platW / 2, hh: 0.5, mat: 'slab', cs: 1 }], matProps, { role: 'platform' }, 'kinematic'));
    this.next = this.drawShape();
    this.curseT = spec.curseEvery > 0 ? spec.curseEvery : 0;
    if (spec.curses.length) this.nextCurse = this.rng.pick(spec.curses);
    this.spawn();
  }

  get kind(): ChallengeKind {
    return this.spec.kind;
  }

  get timeLeft(): number {
    return this.spec.time > 0 ? Math.max(0, this.spec.time - this.t) : 0;
  }

  get platW(): number {
    return this.platBaseW + this.ledge * 2;
  }

  /** Blocks the player must still place (hold and ceiling). */
  get toPlace(): number {
    return Math.max(0, this.spec.blocks - this.placed);
  }

  blocks(): Body[] {
    return this.world.bodies.filter((b) => b.tag.role === 'block');
  }

  private drawShape(): string {
    if (this.bag.length === 0) this.bag = this.rng.shuffle([...this.spec.shapes]);
    return this.bag.pop()!;
  }

  private spawn(): void {
    if (this.status !== 'play') return;
    if (this.kind !== 'race' && this.placed >= this.spec.blocks) {
      this.piece = null;
      return;
    }
    let shape = this.next;
    this.next = this.drawShape();
    if (this.bigNext > 0 || (this.spec.bigBlocks && this.rng.chance(0.25))) {
      shape = this.rng.pick(BIG_SHAPES);
      this.bigNext = Math.max(0, this.bigNext - 1);
    }
    let mat = 'wood';
    if (this.iceNext > 0) {
      mat = 'ice';
      this.iceNext--;
    } else if (this.rng.chance(this.spec.ice)) mat = 'ice';
    else if (this.rng.chance(this.spec.stone)) mat = 'stone';
    let cells = SHAPES[shape].cells.map((c) => [...c] as Cell);
    // Long blocks start flat.
    const p: Piece = { shape, cells, cs: 1, mat, left: 0, bottom: 0, glue: false, heavy: false };
    const w = pieceW(p);
    if (this.rng.chance(0.3) && shape !== 'O') {
      cells = rotCW(cells);
      p.cells = cells;
    }
    p.left = snap(-pieceW(p) / 2);
    void w;
    p.bottom = this.spawnY(p);
    this.piece = p;
    this.slam = false;
    this.events.push({ type: 'spawn' });
  }

  /** Spawn height: near the top of the view, well above the tower. */
  spawnY(p: { cells: Cell[]; cs: number }): number {
    const cam = Math.max(-4, this.height - 9);
    return Math.max(cam + VIEW_H - 1.5 - pieceH(p), this.topAny() + 3);
  }

  /** Highest point of any block, settled or not. */
  topAny(): number {
    let top = 0;
    for (const b of this.world.bodies) if (b.tag.role === 'block' && b.y > LOST_Y + 2) top = Math.max(top, b.y1);
    return top;
  }

  /** True when the piece at this pose overlaps a body. */
  hits(cells: Cell[], cs: number, left: number, bottom: number): boolean {
    const pb = pieceBoxes(cells, cs, left, bottom);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const b of pb) {
      x0 = Math.min(x0, b.x - b.hw);
      x1 = Math.max(x1, b.x + b.hw);
      y0 = Math.min(y0, b.y - b.hh);
      y1 = Math.max(y1, b.y + b.hh);
    }
    for (const body of this.world.bodies) {
      if (body.tag.role === 'debris') continue;
      if (body.x1 < x0 || body.x0 > x1 || body.y1 < y0 || body.y0 > y1) continue;
      for (const wb of body.wb) for (const b of pb) if (overlap(b, wb, 0.01)) return true;
    }
    return false;
  }

  /** Where the piece would land if it fell straight down (bottom y), or null if it misses everything. */
  landing(cells: Cell[], cs: number, left: number, from: number): number | null {
    let y = from;
    if (this.hits(cells, cs, left, y)) return y;
    // Coarse steps, then fine.
    while (y > LOST_Y) {
      if (this.hits(cells, cs, left, y - 0.25)) break;
      y -= 0.25;
    }
    if (y <= LOST_Y) return null;
    while (!this.hits(cells, cs, left, y - 0.02) && y > LOST_Y) y -= 0.02;
    return y;
  }

  // ---------- Player input ----------

  move(dir: number): boolean {
    const p = this.piece;
    if (!p || this.status !== 'play') return false;
    const nl = p.left + dir * 0.5;
    if (Math.abs(nl + pieceW(p) / 2) > VIEW_W / 2 - 0.5) return false;
    if (this.hits(p.cells, p.cs, nl, p.bottom)) return false;
    p.left = nl;
    this.events.push({ type: 'move' });
    return true;
  }

  rotate(): boolean {
    const p = this.piece;
    if (!p || this.status !== 'play') return false;
    const cells = rotCW(p.cells);
    const cx = p.left + pieceW(p) / 2;
    const cy = p.bottom + pieceH(p) / 2;
    const np = { cells, cs: p.cs };
    const base = snap(cx - pieceW(np) / 2);
    const bottom = Math.round((cy - pieceH(np) / 2) * 4) / 4;
    for (const k of [0, 0.5, -0.5, 1, -1]) {
      if (!this.hits(cells, p.cs, base + k, bottom)) {
        p.cells = cells;
        p.left = base + k;
        p.bottom = bottom;
        this.events.push({ type: 'rotate' });
        return true;
      }
    }
    return false;
  }

  /** Puts the piece at a pose at once (bot and tests). */
  place(cells: Cell[], left: number): boolean {
    const p = this.piece;
    if (!p) return false;
    if (this.hits(cells, p.cs, left, p.bottom)) return false;
    p.cells = cells;
    p.left = left;
    return true;
  }

  // ---------- Spells ----------

  canCast(id: string): boolean {
    if (this.status !== 'play') return false;
    switch (id) {
      case 'glue':
      case 'heavy':
      case 'shrink':
        return !!this.piece && !this.piece.glue && !this.piece.heavy && (id !== 'shrink' || this.piece.cs === 1);
      case 'vines':
        return this.blocks().some((b) => b.kind === 'dynamic');
      case 'undo':
        return this.order.some((b) => this.world.bodies.includes(b));
      case 'ledge':
        return this.ledge < 2;
      default:
        return true;
    }
  }

  cast(id: string): boolean {
    if (!this.canCast(id)) return false;
    const p = this.piece;
    switch (id) {
      case 'glue':
        p!.glue = true;
        break;
      case 'heavy':
        p!.heavy = true;
        p!.mat = 'iron';
        break;
      case 'shrink': {
        const cx = p!.left + pieceW(p!) / 2;
        p!.cs = 0.6;
        p!.left = snap(cx - pieceW(p!) / 2);
        break;
      }
      case 'vines':
        for (const b of this.blocks()) {
          if (b.kind !== 'dynamic') continue;
          if (b.asleep || Math.hypot(b.vx, b.vy) < 0.5) {
            freeze(b);
            b.tag.rooted = true;
          }
        }
        break;
      case 'calm':
        this.calmT = 20;
        this.gustT = 0;
        this.quakeT = 0;
        this.slideT = 0;
        break;
      case 'undo': {
        for (let i = this.order.length - 1; i >= 0; i--) {
          const b = this.order[i];
          if (this.world.bodies.includes(b)) {
            this.world.remove(b);
            this.order.splice(i, 1);
            this.placed = Math.max(0, this.placed - 1);
            if (!this.piece && this.phase === 'build') this.spawn();
            break;
          }
        }
        break;
      }
      case 'mend':
        this.lives++;
        break;
      case 'ledge': {
        this.ledge++;
        const box = this.platform.boxes[0];
        box.hw = this.platW / 2;
        updateCache(this.platform);
        break;
      }
    }
    this.events.push({ type: 'spell', id });
    return true;
  }

  // ---------- Simulation ----------

  /** One fixed step. */
  tick(): void {
    if (this.status !== 'play') return;
    this.t += DT;
    if (this.collapseT > 0) this.collapseT -= DT;
    const calm = this.calmT > 0;
    if (calm) this.calmT -= DT;
    this.hazards(calm);
    this.movePiece();
    this.world.step(DT);
    this.afterStep();
    this.rules();
  }

  private hazards(calm: boolean): void {
    const s = this.spec;
    // Boss and elite curses.
    if (s.curses.length && s.curseEvery > 0 && !calm) {
      this.curseT -= DT;
      if (!this.warned && this.curseT <= 1.5) {
        this.warned = true;
        this.events.push({ type: 'warn', id: this.nextCurse });
      }
      if (this.curseT <= 0) {
        this.curse(this.nextCurse);
        this.nextCurse = this.rng.pick(s.curses);
        this.curseT = s.curseEvery;
        this.warned = false;
      }
    }
    // Wind: a slow swing plus gusts.
    let wind = s.wind * Math.sin((this.t * Math.PI * 2) / 13);
    if (this.phase === 'storm') wind += (1.1 + 0.5 * s.world) * Math.sin((this.t * Math.PI * 2) / 7) + (s.wind > 0 ? 0.8 * Math.sign(wind) : 0);
    if (this.gustT > 0) {
      this.gustT -= DT;
      wind += 3.2 * this.gustDir;
    }
    if (calm) wind = 0;
    this.wind = wind;
    if (Math.abs(wind) > 0.05) {
      for (const b of this.world.bodies) {
        if (b.kind !== 'dynamic') continue;
        if (b.asleep && Math.abs(wind) > 0.4) this.world.wake(b);
        // Higher blocks catch more wind.
        const exposure = 0.6 + Math.min(1, Math.max(0, b.y) / 12);
        b.fx += wind * b.area * exposure;
      }
    }
    // Quakes on a timer, plus curse quakes.
    if (s.quake > 0 && !calm && this.t % s.quake < DT && this.t > 3) {
      this.quakeT = 2.5;
      this.events.push({ type: 'curse', id: 'quake' });
    }
    if (this.phase === 'storm' && s.world > 0 && !calm && this.t % 6 < DT) this.quakeT = Math.max(this.quakeT, 1.5);
    let off = 0;
    if (s.moving > 0) off += s.moving * Math.sin(this.t * 0.55);
    if (this.slideT > 0) {
      this.slideT -= DT;
      off += 1.6 * Math.sin((6 - this.slideT) * 1.05);
    }
    if (this.quakeT > 0) {
      this.quakeT -= DT;
      off += 0.14 * Math.sin(this.t * Math.PI * 2 * 3.2);
    }
    if (calm) off = this.platOffset * 0.95;
    const vx = (off - this.platform.x) / DT;
    this.platform.vx = Math.abs(vx) < 1e-4 ? 0 : vx;
    this.platOffset = off;
    // Rocks.
    if (s.debris > 0 && !calm && this.rng.chance((s.debris / 10) * DT)) this.rocks.push({ at: this.t, x: this.rng.next() * 6 - 3 });
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i];
      if (this.t >= r.at) {
        this.rocks.splice(i, 1);
        const top = this.topAny();
        const rock = makeBody([{ cx: r.x, cy: Math.max(top + 6, this.camY + VIEW_H - 1), hw: 0.3, hh: 0.3, mat: 'rock', cs: 0.6 }], matProps, { role: 'debris', placedAt: this.t });
        rock.vy = -6;
        rock.w = this.rng.next() * 4 - 2;
        this.world.add(rock);
      }
    }
  }

  private curse(id: string): void {
    this.events.push({ type: 'curse', id });
    switch (id) {
      case 'gust':
        this.gustT = 4;
        this.gustDir = this.rng.chance(0.5) ? 1 : -1;
        break;
      case 'quake':
        this.quakeT = 3;
        break;
      case 'ice':
        this.iceNext += 2;
        break;
      case 'big':
        this.bigNext = 1;
        break;
      case 'debris':
        for (let i = 0; i < 4; i++) this.rocks.push({ at: this.t + i * 0.5, x: this.rng.next() * 5 - 2.5 });
        break;
      case 'slide':
        this.slideT = 6;
        break;
    }
    void CURSES;
  }

  private movePiece(): void {
    if (this.spawnWait > 0) {
      this.spawnWait -= DT;
      if (this.spawnWait <= 0) this.spawn();
      return;
    }
    const p = this.piece;
    if (!p) return;
    const speed = this.drop || this.slam ? DROP_SPEED : FALL_SPEED;
    let dy = speed * DT;
    while (dy > 0) {
      const d = Math.min(0.1, dy);
      dy -= d;
      if (this.hits(p.cells, p.cs, p.left, p.bottom - d)) {
        this.lock(Math.min(speed, 5));
        return;
      }
      p.bottom -= d;
      if (p.bottom < -1.2) {
        // Missed the platform: let physics take it.
        this.lock(speed);
        return;
      }
    }
  }

  /** The falling piece becomes a physics body. */
  private lock(speed: number): void {
    const p = this.piece!;
    const boxes = cellsToRects(p.cells).map((r) => ({ cx: p.left + (r.x + r.w / 2) * p.cs, cy: p.bottom + (r.y + r.h / 2) * p.cs, hw: (r.w * p.cs) / 2, hh: (r.h * p.cs) / 2, mat: p.mat, cs: p.cs, col: blockColor(p.shape, p.mat) }));
    const body = makeBody(boxes, matProps, { role: 'block', placedAt: this.t, glue: p.glue, heavy: p.heavy, order: this.placed });
    body.vy = -speed;
    this.world.add(body);
    this.order.push(body);
    this.placed++;
    this.piece = null;
    this.settleT = 0;
    this.spawnWait = 0.35;
    if (this.kind !== 'race' && this.placed >= this.spec.blocks) this.spawnWait = 0;
  }

  private afterStep(): void {
    for (const [b, other] of this.world.touched) {
      b.tag.touched = this.t;
      const sp = Math.hypot(b.vx, b.vy);
      if (b.tag.role === 'block') this.events.push({ type: 'land', x: b.x, y: b.y0, speed: Math.max(sp, 1) });
      if (b.tag.glue && b.tag.role === 'block' && (other.tag.role === 'block' || other.tag.role === 'platform')) this.glue(b, other);
    }
    for (const b of this.world.bodies) {
      if (b.tag.heavy && b.kind === 'dynamic' && b.tag.touched !== undefined && this.t - b.tag.touched > 0.35) {
        freeze(b);
        b.tag.rooted = true;
        this.events.push({ type: 'pin', x: b.x, y: b.y });
      }
    }
    // Lost blocks and old debris.
    for (const b of [...this.world.bodies]) {
      if (b.tag.role === 'platform') continue;
      const out = b.y < LOST_Y || Math.abs(b.x) > VIEW_W;
      if (b.tag.role === 'debris') {
        if (out || this.t - (b.tag.placedAt ?? 0) > 7) this.world.remove(b);
        continue;
      }
      if (out) {
        this.world.remove(b);
        this.loseLife(b.x, Math.max(b.y, this.camY + 1), 'lost');
      }
    }
    // Ceiling: settled blocks above the laser are zapped.
    if (this.kind === 'ceiling') {
      for (const b of this.blocks()) {
        if ((b.asleep || b.kind === 'static') && b.y1 > this.spec.goal + 0.08) {
          this.world.remove(b);
          this.loseLife(b.x, b.y, 'zap');
        }
      }
    }
    // Tower height from settled blocks.
    let h = 0;
    for (const b of this.blocks()) {
      const settled = b.asleep || b.kind === 'static' || (b.tag.touched !== undefined && Math.hypot(b.vx, b.vy) < 0.8 && Math.abs(b.w) < 0.8);
      if (settled && b.y > -1) h = Math.max(h, b.y1);
    }
    this.height = h;
    this.maxHeight = Math.max(this.maxHeight, h);
    const target = Math.max(-4, h - 9);
    this.camY += (target - this.camY) * 0.05;
  }

  private loseLife(x: number, y: number, type: 'lost' | 'zap'): void {
    // A collapse costs at most 2 lives: more blocks lost in the same 2 seconds are free.
    if (this.collapseT > 0 && this.collapseN >= 2) {
      this.events.push({ type: 'spared', x, y });
      return;
    }
    if (this.collapseT <= 0) this.collapseN = 0;
    this.collapseN++;
    this.collapseT = 2;
    this.lives--;
    this.livesLost++;
    this.events.push({ type, x, y });
    if (this.lives <= 0) this.finish(false, 'Out of lives');
  }

  /** Glue: the block merges with what it touched. The platform makes it rooted. */
  private glue(b: Body, other: Body): void {
    b.tag.glue = false;
    if (other.tag.role === 'platform' || other.kind === 'static') {
      freeze(b);
      b.tag.rooted = true;
      this.events.push({ type: 'glue', x: b.x, y: b.y });
      return;
    }
    const boxes = [...b.wb.map((w, i) => ({ w, box: b.boxes[i] })), ...other.wb.map((w, i) => ({ w, box: other.boxes[i] }))].map(({ w, box }) => ({
      cx: w.x,
      cy: w.y,
      hw: box.hw,
      hh: box.hh,
      a: Math.atan2(w.s, w.c),
      mat: box.mat,
      cs: box.cs,
      col: box.col,
    }));
    const merged = makeBody(boxes, matProps, { ...other.tag, glue: false, touched: this.t, order: other.tag.order });
    const m = b.m + other.m;
    merged.vx = (b.vx * b.m + other.vx * other.m) / m;
    merged.vy = (b.vy * b.m + other.vy * other.m) / m;
    merged.w = (b.w * b.m + other.w * other.m) / m;
    this.world.remove(b);
    this.world.remove(other);
    this.world.add(merged);
    const i = this.order.indexOf(other);
    if (i >= 0) this.order[i] = merged;
    const j = this.order.indexOf(b);
    if (j >= 0) this.order.splice(j, 1);
    this.events.push({ type: 'glue', x: b.x, y: b.y });
  }

  private rules(): void {
    if (this.status !== 'play') return;
    const s = this.spec;
    if (s.kind === 'race') {
      if (this.height >= s.goal) {
        if (this.goalT === 0) this.events.push({ type: 'goal' });
        this.goalT += DT;
        if (this.goalT >= GOAL_HOLD) this.finish(true, 'Goal reached');
      } else this.goalT = Math.max(0, this.goalT - DT * 1.5);
      if (this.status === 'play' && s.time > 0 && this.t >= s.time) this.finish(false, 'Time is up');
      return;
    }
    const allDown = this.placed >= s.blocks && !this.piece;
    if (!allDown) return;
    const awake = this.blocks().some((b) => b.kind === 'dynamic' && !b.asleep);
    this.settleT += DT;
    if (s.kind === 'ceiling') {
      if ((!awake && this.settleT > 0.5) || this.settleT > 6) this.finish(true, 'All blocks fit');
      return;
    }
    // Hold: after all blocks are down and calm, the storm starts.
    if (this.phase === 'build') {
      if ((!awake && this.settleT > 0.5) || this.settleT > 4) {
        this.phase = 'storm';
        this.stormT = 0;
        this.events.push({ type: 'storm' });
      }
      return;
    }
    this.stormT += DT;
    if (this.stormT >= s.hold) this.finish(true, 'The tower held');
  }

  private finish(won: boolean, reason: string): void {
    if (this.status !== 'play') return;
    this.status = won ? 'won' : 'lost';
    this.reason = reason;
    this.piece = null;
    this.events.push({ type: 'end', won, reason });
  }

  result(): GameResult {
    return { won: this.status === 'won', reason: this.reason, height: this.maxHeight, livesLost: this.livesLost, timeLeft: this.timeLeft, placed: this.placed };
  }

  /** Abort (menu: abandon). */
  forfeit(): void {
    this.finish(false, 'Gave up');
  }

  /** Probe: is this point inside a body (not the piece)? */
  solidAt(x: number, y: number): Body | null {
    for (const b of this.world.bodies) {
      if (b.tag.role === 'debris') continue;
      if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
      for (const wb of b.wb) if (pointIn(wb, x, y)) return b;
    }
    return null;
  }
}

export { rotCW, norm };
