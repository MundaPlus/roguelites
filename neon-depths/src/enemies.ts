import type { Game } from './game';
import { TAU, angleTo, dist, rand } from './math';

export type Shape = 'diamond' | 'triangle' | 'circle' | 'square' | 'hex' | 'star' | 'octagon' | 'cross' | 'blob' | 'arrow';

export interface Enemy {
  def: EnemyDef;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  ang: number;
  t: number; // age in s
  state: number;
  timer: number;
  flash: number;
  slowT: number;
  burnT: number;
  burnDps: number;
  elite: boolean;
  spawnT: number; // > 0 while the spawn portal plays
  dead: boolean;
  kx: number; // knockback velocity
  ky: number;
  tele: number; // > 0 draws an aim line
  teleAng: number;
  alpha: number;
  data: Record<string, number>;
}

export interface EnemyDef {
  id: string;
  name: string;
  hp: number;
  r: number;
  speed: number;
  color: string;
  shape: Shape;
  flying?: boolean;
  cost: number; // encounter budget, 0 = never picked on its own
  minFloor: number;
  pack?: number; // spawns in groups
  heavy?: boolean; // less knockback
  boss?: boolean;
  update(e: Enemy, g: Game, dt: number): void;
  onDeath?(e: Enemy, g: Game): void;
}

export interface ShotOpts {
  r?: number;
  color?: string;
  accel?: number;
  curve?: number;
  homing?: number;
  life?: number;
}

/** True once each `interval` seconds. Keeps its timer in e.data[key]. */
export function every(e: Enemy, key: string, interval: number, dt: number, first = interval): boolean {
  if (e.data[key] === undefined) e.data[key] = first;
  e.data[key] -= dt;
  if (e.data[key] <= 0) {
    e.data[key] += interval;
    return true;
  }
  return false;
}

export function ring(g: Game, x: number, y: number, n: number, speed: number, off = 0, o: ShotOpts = {}): void {
  for (let i = 0; i < n; i++) g.enemyShot(x, y, off + (i / n) * TAU, speed, o);
}

export function fan(g: Game, x: number, y: number, ang: number, n: number, spread: number, speed: number, o: ShotOpts = {}): void {
  for (let i = 0; i < n; i++) g.enemyShot(x, y, ang + (i - (n - 1) / 2) * spread, speed, o);
}

const toPlayer = (e: Enemy, g: Game) => angleTo(e.x, e.y, g.player.x, g.player.y);
const playerDist = (e: Enemy, g: Game) => dist(e.x, e.y, g.player.x, g.player.y);

/** Steers toward the player. Ground enemies follow the flow field around obstacles. */
export function chase(e: Enemy, g: Game, dt: number, mul = 1, wobble = 0): void {
  const d = e.def.flying ? { x: Math.cos(toPlayer(e, g)), y: Math.sin(toPlayer(e, g)) } : g.pathDir(e);
  let ax = d.x;
  let ay = d.y;
  if (wobble) {
    const w = Math.sin(e.t * 6 + e.data.seed) * wobble;
    ax += -d.y * w;
    ay += d.x * w;
  }
  const sp = e.speed * mul;
  const k = Math.min(1, dt * 6);
  e.vx += (ax * sp - e.vx) * k;
  e.vy += (ay * sp - e.vy) * k;
  e.ang = Math.atan2(e.vy, e.vx);
}

/** Keeps between lo and hi px from the player, strafing at the right range. */
export function keepRange(e: Enemy, g: Game, dt: number, lo: number, hi: number): void {
  const d = playerDist(e, g);
  const a = toPlayer(e, g);
  let tx = 0;
  let ty = 0;
  if (d < lo && g.openAt(e.x - Math.cos(a) * 60, e.y - Math.sin(a) * 60, !!e.def.flying)) {
    tx = -Math.cos(a);
    ty = -Math.sin(a);
  } else if (d > hi) {
    const p = e.def.flying ? { x: Math.cos(a), y: Math.sin(a) } : g.pathDir(e);
    tx = p.x;
    ty = p.y;
  } else {
    const side = e.data.seed > 0.5 ? 1 : -1;
    tx = -Math.sin(a) * side * 0.6;
    ty = Math.cos(a) * side * 0.6;
  }
  const k = Math.min(1, dt * 4);
  e.vx += (tx * e.speed - e.vx) * k;
  e.vy += (ty * e.speed - e.vy) * k;
  e.ang = a;
}

function stop(e: Enemy, dt: number): void {
  const k = Math.min(1, dt * 8);
  e.vx -= e.vx * k;
  e.vy -= e.vy * k;
}

const bulletSpeed = (g: Game, base: number) => base * (1 + (g.floorN - 1) * 0.06);

export const ENEMIES: EnemyDef[] = [
  {
    id: 'drone', name: 'Drone', hp: 9, r: 11, speed: 85, color: '#ff3d7f', shape: 'diamond', flying: true, cost: 1, minFloor: 1,
    update: (e, g, dt) => chase(e, g, dt, 1, 0.4),
  },
  {
    id: 'crawler', name: 'Crawler', hp: 13, r: 12, speed: 112, color: '#ff8c42', shape: 'triangle', cost: 1.2, minFloor: 1,
    update: (e, g, dt) => chase(e, g, dt),
  },
  {
    id: 'swarmer', name: 'Swarmer', hp: 4, r: 7, speed: 150, color: '#ffd23f', shape: 'circle', flying: true, cost: 1.5, minFloor: 1, pack: 4,
    update: (e, g, dt) => chase(e, g, dt, 1, 0.9),
  },
  {
    id: 'turret', name: 'Turret', hp: 20, r: 14, speed: 0, color: '#4cc9f0', shape: 'square', cost: 1.8, minFloor: 1, heavy: true,
    update(e, g, dt) {
      e.vx = 0;
      e.vy = 0;
      e.ang = toPlayer(e, g);
      if (every(e, 'fire', 2.1, dt, rand(0.8, 2))) {
        const n = g.floorN >= 4 ? 5 : g.floorN >= 2 ? 3 : 1;
        fan(g, e.x, e.y, e.ang, n, 0.22, bulletSpeed(g, 175));
        e.flash = 0.1;
      }
    },
  },
  {
    id: 'dasher', name: 'Dasher', hp: 18, r: 13, speed: 60, color: '#f72585', shape: 'arrow', cost: 2, minFloor: 1,
    update(e, g, dt) {
      e.timer -= dt;
      if (e.state === 0) {
        chase(e, g, dt, 0.7);
        if (e.timer <= 0 && playerDist(e, g) < 330) {
          e.state = 1;
          e.timer = 0.6;
          e.tele = 0.6;
          e.teleAng = toPlayer(e, g);
        }
      } else if (e.state === 1) {
        stop(e, dt);
        e.ang = e.teleAng;
        if (e.timer <= 0) {
          e.state = 2;
          e.timer = 0.42;
          e.vx = Math.cos(e.teleAng) * 470;
          e.vy = Math.sin(e.teleAng) * 470;
        }
      } else if (e.timer <= 0) {
        e.state = 0;
        e.timer = rand(1.2, 2);
      }
    },
  },
  {
    id: 'blob', name: 'Blob', hp: 26, r: 17, speed: 52, color: '#80ff72', shape: 'blob', cost: 2.2, minFloor: 1,
    update: (e, g, dt) => chase(e, g, dt),
    onDeath(e, g) {
      for (let i = 0; i < 2; i++) g.spawn('blobling', e.x + (i ? 10 : -10), e.y, e.elite);
    },
  },
  {
    id: 'blobling', name: 'Blobling', hp: 9, r: 10, speed: 92, color: '#80ff72', shape: 'blob', cost: 0, minFloor: 1,
    update: (e, g, dt) => chase(e, g, dt, 1, 0.3),
  },
  {
    id: 'caster', name: 'Caster', hp: 24, r: 14, speed: 55, color: '#b388ff', shape: 'hex', cost: 3, minFloor: 2,
    update(e, g, dt) {
      keepRange(e, g, dt, 150, 260);
      if (every(e, 'fire', 2.6, dt, rand(1, 2.4))) {
        e.data.off = (e.data.off ?? 0) + 0.2;
        ring(g, e.x, e.y, g.floorN >= 4 ? 12 : 8, bulletSpeed(g, 125), e.data.off);
        e.flash = 0.12;
      }
    },
  },
  {
    id: 'sniper', name: 'Sniper', hp: 16, r: 12, speed: 70, color: '#ff595e', shape: 'cross', cost: 2.5, minFloor: 2,
    update(e, g, dt) {
      e.timer -= dt;
      if (e.state === 0) {
        keepRange(e, g, dt, 220, 330);
        if (e.timer <= 0) {
          e.state = 1;
          e.timer = 0.9;
          e.tele = 0.9;
        }
      } else {
        stop(e, dt);
        if (e.timer > 0.25) e.teleAng = toPlayer(e, g);
        e.ang = e.teleAng;
        if (e.timer <= 0) {
          g.enemyShot(e.x, e.y, e.teleAng, bulletSpeed(g, 470), { r: 6, color: '#ff595e' });
          e.state = 0;
          e.timer = rand(2.2, 3.2);
        }
      }
    },
  },
  {
    id: 'bomber', name: 'Bomber', hp: 12, r: 12, speed: 122, color: '#ff9e00', shape: 'circle', cost: 1.8, minFloor: 2,
    update(e, g, dt) {
      if (e.state === 0) {
        chase(e, g, dt);
        if (playerDist(e, g) < 55) {
          e.state = 1;
          e.timer = 0.6;
        }
      } else {
        stop(e, dt);
        e.timer -= dt;
        e.flash = Math.sin(e.timer * 40) > 0 ? 0.05 : 0;
        if (e.timer <= 0) g.killEnemy(e, false);
      }
    },
    onDeath: (e, g) => g.explode(e.x, e.y, 70, 25, true),
  },
  {
    id: 'phantom', name: 'Phantom', hp: 14, r: 10, speed: 40, color: '#9bf6ff', shape: 'circle', flying: true, cost: 2.5, minFloor: 3,
    update(e, g, dt) {
      e.timer -= dt;
      if (e.state === 0) {
        chase(e, g, dt, 0.6);
        e.alpha = Math.min(1, e.alpha + dt * 3);
        if (e.timer <= 0) {
          e.state = 1;
          e.timer = 0.4;
        }
      } else if (e.state === 1) {
        e.alpha = Math.max(0.1, e.timer / 0.4);
        if (e.timer <= 0) {
          const p = g.freePoint(130, 220);
          e.x = p.x;
          e.y = p.y;
          e.state = 2;
          e.timer = 0.5;
        }
      } else {
        e.alpha = Math.min(1, e.alpha + dt * 3);
        if (e.timer <= 0) {
          ring(g, e.x, e.y, 6, bulletSpeed(g, 120), rand(0, 1), { color: '#9bf6ff' });
          e.state = 0;
          e.timer = rand(2.5, 3.5);
        }
      }
    },
  },
  {
    id: 'tank', name: 'Bulwark', hp: 70, r: 20, speed: 42, color: '#06d6a0', shape: 'octagon', cost: 4, minFloor: 3, heavy: true,
    update(e, g, dt) {
      chase(e, g, dt);
      if (every(e, 'fire', 3, dt, rand(1, 3))) e.data.burst = 3;
      if ((e.data.burst ?? 0) > 0 && every(e, 'b', 0.16, dt, 0)) {
        e.data.burst--;
        g.enemyShot(e.x, e.y, toPlayer(e, g), bulletSpeed(g, 210), { r: 6 });
      }
    },
  },
  {
    id: 'spinner', name: 'Spinner', hp: 34, r: 15, speed: 65, color: '#f15bb5', shape: 'star', flying: true, cost: 4, minFloor: 4,
    update(e, g, dt) {
      if (e.data.dx === undefined) {
        const a = rand(0, TAU);
        e.data.dx = Math.cos(a);
        e.data.dy = Math.sin(a);
      }
      e.vx = e.data.dx * e.speed;
      e.vy = e.data.dy * e.speed;
      if (e.x < 70 || e.x > 610) e.data.dx = (e.x < 70 ? 1 : -1) * Math.abs(e.data.dx);
      if (e.y < 70 || e.y > 370) e.data.dy = (e.y < 70 ? 1 : -1) * Math.abs(e.data.dy);
      e.ang += dt * 2.5;
      const cycle = e.t % 3.5;
      if (cycle < 2 && every(e, 'fire', 0.14, dt)) {
        g.enemyShot(e.x, e.y, e.ang, bulletSpeed(g, 115));
        g.enemyShot(e.x, e.y, e.ang + Math.PI, bulletSpeed(g, 115));
      }
    },
  },
];

export const ENEMY_BY_ID: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map((d) => [d.id, d]));
