import type { Dir } from './dungeon';
import { ROOM_H, ROOM_W } from './dungeon';
import { type Enemy, type EnemyDef, every, fan, ring } from './enemies';
import type { Game } from './game';
import { TAU, angleTo, pickRandom, rand } from './math';

interface Attack {
  dur: number;
  run(e: Enemy, g: Game, dt: number, t: number, phase: number): void;
}

const CX = ROOM_W / 2;
const CY = ROOM_H / 2;

/** True the first time it is called in the current attack. */
function once(e: Enemy, key: string): boolean {
  if (e.data[key]) return false;
  e.data[key] = 1;
  return true;
}

function moveTo(e: Enemy, dt: number, tx: number, ty: number, speed: number): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  const want = d > 4 ? speed : 0;
  const k = Math.min(1, dt * 3);
  e.vx += ((d ? dx / d : 0) * want - e.vx) * k;
  e.vy += ((d ? dy / d : 0) * want - e.vy) * k;
}

function halt(e: Enemy, dt: number): void {
  moveTo(e, dt, e.x, e.y, 0);
}

const aim = (e: Enemy, g: Game) => angleTo(e.x, e.y, g.player.x, g.player.y);

/** Runs the attack list in a loop. Phase changes at the HP thresholds. */
function runBoss(e: Enemy, g: Game, dt: number, attacks: (phase: number) => Attack[], thresholds: number[]): void {
  const frac = e.hp / e.maxHp;
  const phase = 1 + thresholds.filter((t) => frac < t).length;
  if (e.data.phase === undefined) {
    e.data.phase = phase;
    e.data.atk = 0;
    e.data.at = 0;
    e.data.intro = 1.3;
  }
  if (phase !== e.data.phase) {
    e.data.phase = phase;
    g.bossPhase(e);
  }
  if (e.data.intro > 0) {
    e.data.intro -= dt;
    halt(e, dt);
    return;
  }
  const list = attacks(phase);
  const a = list[e.data.atk % list.length];
  e.data.at += dt;
  a.run(e, g, dt, e.data.at, phase);
  if (e.data.at >= a.dur) {
    e.data.atk = (e.data.atk + 1) % list.length;
    e.data.at = 0;
    e.tele = 0;
    for (const k of Object.keys(e.data)) if (k.startsWith('_')) delete e.data[k];
  }
}

function teleport(e: Enemy, g: Game, t: number, at: number, near: [number, number]): void {
  if (t < at) e.alpha = Math.max(0.05, 1 - t / at);
  else if (once(e, '_tp')) {
    const p = g.freePoint(near[0], near[1]);
    e.x = p.x;
    e.y = p.y;
    g.burst(e.x, e.y, e.def.color, 20);
  } else e.alpha = Math.min(1, e.alpha + 0.08);
}

// Core Sentinel: rings, aimed fans, spirals when enraged.
const sentinel = (p: number): Attack[] => {
  const list: Attack[] = [
    {
      dur: 4.2,
      run(e, g, dt, t, ph) {
        moveTo(e, dt, CX + Math.cos(t * 0.8) * 150, CY + Math.sin(t * 1.6) * 70, 90);
        if (every(e, '_r', 1.4, dt, 0.3)) {
          e.data.off = (e.data.off ?? 0) + 0.22;
          ring(g, e.x, e.y, 14, 125, e.data.off);
        }
        if (ph >= 2 && every(e, '_s', 0.13, dt)) {
          e.data._a = (e.data._a ?? 0) + 0.4;
          g.enemyShot(e.x, e.y, e.data._a, 150);
        }
      },
    },
    {
      dur: 2.4,
      run(e, g, dt) {
        halt(e, dt);
        if (every(e, '_f', 0.45, dt, 0.35)) fan(g, e.x, e.y, aim(e, g), 5, 0.2, 190);
      },
    },
  ];
  if (p >= 2) {
    list.push({
      dur: 3,
      run(e, g, dt, t) {
        moveTo(e, dt, g.player.x, g.player.y, 40);
        if (every(e, '_s', 0.1, dt)) {
          for (let k = 0; k < 2; k++) g.enemyShot(e.x, e.y, t * 2.6 + k * Math.PI, 145);
        }
      },
    });
  }
  return list;
};

// Hive Mother: summons swarmers and charges across the room.
const hive = (p: number): Attack[] => [
  {
    dur: 3,
    run(e, g, dt) {
      const a = aim(e, g);
      moveTo(e, dt, g.player.x - Math.cos(a) * 190, g.player.y - Math.sin(a) * 190, 80);
      if (once(e, '_sum') && g.countAlive('swarmer') < 9) {
        for (let i = 0; i < (p >= 2 ? 4 : 3); i++) g.spawn('swarmer', e.x + rand(-30, 30), e.y + rand(-30, 30));
      }
      if (every(e, '_f', 0.8, dt)) g.enemyShot(e.x, e.y, a, 200, { r: 7 });
    },
  },
  {
    dur: 1.9,
    run(e, g, dt, t) {
      if (t < 0.8) {
        halt(e, dt);
        if (t < 0.6) e.teleAng = aim(e, g);
        e.tele = 0.1;
        e.ang = e.teleAng;
      } else if (t < 1.5) {
        e.tele = 0;
        e.vx = Math.cos(e.teleAng) * 440;
        e.vy = Math.sin(e.teleAng) * 440;
      } else {
        halt(e, dt);
        if (once(e, '_ring')) {
          ring(g, e.x, e.y, p >= 2 ? 16 : 10, 140, rand(0, 1));
          g.shake(6);
        }
      }
    },
  },
  {
    dur: 2.4,
    run(e, g, dt) {
      halt(e, dt);
      if (every(e, '_f', 0.5, dt, 0.2)) fan(g, e.x, e.y, aim(e, g), 7, 0.15, 170);
    },
  },
];

// Prism Warden: teleports, rotating bullet streams, sniper volleys.
const prism = (p: number): Attack[] => [
  {
    dur: 1,
    run(e, g, dt, t) {
      halt(e, dt);
      teleport(e, g, t, 0.5, [200, 420]);
    },
  },
  {
    dur: 3.4,
    run(e, g, dt) {
      halt(e, dt);
      e.ang += dt * (p >= 2 ? 1.1 : 0.85) * (e.data.dir ?? 1);
      const arms = p >= 2 ? 6 : 4;
      if (every(e, '_s', 0.075, dt)) {
        for (let k = 0; k < arms; k++) g.enemyShot(e.x, e.y, e.ang + (k / arms) * TAU, 200, { color: '#4cc9f0' });
      }
      if (once(e, '_d')) e.data.dir = -(e.data.dir ?? 1);
    },
  },
  {
    dur: 2.6,
    run(e, g, dt, t) {
      halt(e, dt);
      const shot = Math.floor((t - 0.1) / 0.8);
      const local = (t - 0.1) % 0.8;
      if (shot >= 0 && shot < 3) {
        if (local < 0.5) e.teleAng = aim(e, g);
        e.tele = local < 0.65 ? 0.1 : 0;
        if (local >= 0.65 && once(e, `_s${shot}`)) fan(g, e.x, e.y, e.teleAng, p >= 2 ? 5 : 3, 0.12, 420, { r: 6, color: '#ffffff' });
      }
    },
  },
];

// Glitch King: bullet walls with gaps, teleport hops, curving rings.
const glitch = (p: number): Attack[] => [
  {
    dur: 3.6,
    run(e, g, dt) {
      moveTo(e, dt, CX, 90, 120);
      if (every(e, '_w', p >= 2 ? 0.9 : 1.15, dt, 0.2)) {
        const sides: Dir[] = p >= 2 ? ['w', 'e', 'n', 's'] : ['w', 'e'];
        g.bulletWall(pickRandom(sides), rand(0.2, 0.8), 120, p >= 2 ? 150 : 130);
      }
    },
  },
  {
    dur: 3.1,
    run(e, g, dt) {
      halt(e, dt);
      if (every(e, '_h', 1, dt, 0.1)) {
        const pt = g.freePoint(140, 230);
        g.burst(e.x, e.y, e.def.color, 12);
        e.x = pt.x;
        e.y = pt.y;
        ring(g, e.x, e.y, p >= 2 ? 16 : 12, 120, rand(0, 1), { color: '#c77dff' });
      }
    },
  },
  {
    dur: 2.6,
    run(e, g, dt) {
      halt(e, dt);
      if (every(e, '_c', 0.32, dt, 0.1)) {
        e.data.sign = -(e.data.sign ?? 1);
        ring(g, e.x, e.y, 8, 130, rand(0, 1), { curve: 0.9 * e.data.sign, color: '#e0aaff' });
      }
    },
  },
];

// Overmind: three phases that mix everything.
const overmind = (p: number): Attack[] => {
  const list: Attack[] = [
    {
      dur: 3.5,
      run(e, g, dt, t) {
        moveTo(e, dt, CX, CY, 70);
        if (every(e, '_s', p >= 3 ? 0.07 : 0.1, dt)) {
          for (let k = 0; k < 3; k++) g.enemyShot(e.x, e.y, t * 1.9 + (k * TAU) / 3, 140);
          if (p >= 3) for (let k = 0; k < 3; k++) g.enemyShot(e.x, e.y, -t * 1.9 + (k * TAU) / 3, 120, { color: '#ffb3b3' });
        }
      },
    },
    {
      dur: 2.6,
      run(e, g, dt) {
        moveTo(e, dt, g.player.x, g.player.y, 45);
        if (once(e, '_sum') && g.countAlive() < 7) {
          g.spawn('drone', e.x - 40, e.y);
          g.spawn('drone', e.x + 40, e.y);
          if (p >= 2) g.spawn('caster', e.x, e.y + 40);
        }
        if (every(e, '_h', 0.7, dt, 0.3)) g.enemyShot(e.x, e.y, aim(e, g) + rand(-0.6, 0.6), 110, { r: 9, homing: 1.7, life: 4.5, color: '#ff006e' });
      },
    },
    {
      dur: 2,
      run(e, g, dt) {
        halt(e, dt);
        if (every(e, '_r', 0.5, dt, 0.1)) ring(g, e.x, e.y, 18, 150, rand(0, 1));
      },
    },
  ];
  if (p >= 2) {
    list.splice(2, 0, {
      dur: 3.3,
      run(e, g, dt) {
        moveTo(e, dt, CX, CY, 70);
        if (every(e, '_w', 1.1, dt, 0.2)) g.bulletWall(pickRandom<Dir>(['w', 'e', 'n', 's']), rand(0.2, 0.8), 110, 140);
      },
    });
  }
  return list;
};

const boss = (
  id: string, name: string, hp: number, r: number, color: string, shape: EnemyDef['shape'],
  attacks: (p: number) => Attack[], thresholds: number[],
): EnemyDef => ({
  id, name, hp, r, speed: 80, color, shape, flying: true, cost: 0, minFloor: 1, heavy: true, boss: true,
  update: (e, g, dt) => runBoss(e, g, dt, attacks, thresholds),
});

/** One boss per floor, in order. */
export const BOSSES: EnemyDef[] = [
  boss('sentinel', 'Core Sentinel', 340, 30, '#00f5d4', 'octagon', sentinel, [0.5]),
  boss('hive', 'Hive Mother', 560, 34, '#ffd23f', 'hex', hive, [0.5]),
  boss('prism', 'Prism Warden', 760, 28, '#4cc9f0', 'diamond', prism, [0.5]),
  boss('glitch', 'Glitch King', 950, 28, '#c77dff', 'square', glitch, [0.5]),
  boss('overmind', 'The Overmind', 1300, 38, '#ff3b3b', 'star', overmind, [0.6, 0.3]),
];
