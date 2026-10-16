/** Fighting bots for the debug API and the balance sim. They read the game state and fill an Input. */
import { ENEMIES, FOODS, SPECIALS, type EMove } from './data';
import { DEPTH, W, emptyInput, type Actor, type Game, type Input } from './game';

export type BotLevel = 'good' | 'weak' | 'random';

export class Bot {
  private hold: Input = emptyInput();
  private holdT = 0;
  private press = 0;
  private seen = new Map<string, boolean>();
  /** Frames before the bot reacts to an enemy wind-up. */
  react = 12;
  /** Chance to miss a wind-up. */
  miss = 0.2;

  constructor(
    public level: BotLevel,
    private rand: () => number = Math.random,
  ) {}

  input(g: Game, out: Input): void {
    const r = this.level === 'random' ? this.randomInput() : this.level === 'weak' ? this.weakInput(g) : this.goodInput(g);
    Object.assign(out, r);
  }

  private randomInput(): Input {
    if (--this.holdT <= 0) {
      this.holdT = 10;
      const r = this.rand;
      this.hold = { mx: r() * 2 - 0.8, mz: r() * 2 - 1, light: r() < 0.5, heavy: r() < 0.2, jump: r() < 0.08, grab: r() < 0.08, sp1: r() < 0.05, sp2: r() < 0.03 };
      return this.hold;
    }
    return { ...this.hold, light: false, heavy: false, jump: false, grab: false, sp1: false, sp2: false };
  }

  private weakInput(g: Game): Input {
    // Slow reactions: decide every 9 frames and hold the stick.
    if (--this.holdT > 0) return { ...this.hold, light: false, heavy: false, jump: false, grab: false, sp1: false, sp2: false };
    this.holdT = 9;
    const p = g.p;
    const inp = emptyInput();
    const foes = g.alive().filter((e) => !e.entering);
    if (!foes.length) {
      inp.mx = 1;
      inp.mz = (48 - p.z) / 48;
    } else {
      const t = this.nearest(g, foes);
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      inp.mx = Math.abs(dx) > 30 ? Math.sign(dx) : Math.abs(dx) < 14 ? -Math.sign(dx) : 0;
      inp.mz = Math.abs(dz) > 8 ? Math.sign(dz) * 0.8 : 0;
      if (Math.abs(dz) < 12 && Math.abs(dx) < 44) {
        inp.mx = Math.sign(dx) * 0.3;
        inp.light = true;
        inp.heavy = this.rand() < 0.2;
      }
      if (this.rand() < 0.25) {
        inp.mx = this.rand() * 2 - 1;
        inp.mz = this.rand() * 2 - 1;
      }
    }
    this.hold = inp;
    return inp;
  }

  private nearest(g: Game, foes: Actor[]): Actor {
    const p = g.p;
    let best = foes[0];
    let bd = 1e9;
    for (const e of foes) {
      let d = Math.abs(e.x - p.x) + Math.abs(e.z - p.z) * 2;
      if (e.st === 'hit' || (e.st === 'air' && e.hp > 0)) d -= 40;
      if (e.st === 'down' || e.st === 'getup') d += 120;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private goodInput(g: Game): Input {
    const p = g.p;
    const inp = emptyInput();
    this.press++;
    const foes = g.alive().filter((e) => !e.entering || (e.x > g.camX && e.x < g.camX + W));

    if (p.st === 'grab') {
      // Knee twice, then throw toward other enemies.
      if (this.press % 6 === 0) {
        const others = foes.filter((e) => e.id !== p.held);
        const behind = others.filter((e) => (e.x - p.x) * p.f < 0).length;
        const ahead = others.length - behind;
        if (p.knees < 2) inp.light = true;
        else {
          inp.heavy = true;
          if (behind > ahead) inp.mx = -p.f;
        }
      }
      return inp;
    }

    // Use a special when crowded or in trouble.
    const near = foes.filter((e) => Math.abs(e.x - p.x) < 70 && Math.abs(e.z - p.z) < 24 && e.st !== 'down' && e.st !== 'getup').length;
    for (let i = 0; i < g.o.specials.length; i++) {
      if (g.cds[i] > 0) continue;
      const sid = g.o.specials[i];
      const want = sid === 'rage' ? p.hp < p.max * 0.5 && near >= 1 : near >= 3 || (p.st === 'hit' && near >= 2) || (sid !== 'spin' && foes.some((e) => e.boss && Math.abs(e.x - p.x) < 40 && Math.abs(e.z - p.z) < 10 && e.st === 'hit'));
      if (want && (p.st === 'idle' || p.st === 'hit' || p.st === 'jump')) {
        const t = foes.length ? this.nearest(g, foes) : null;
        if (t && SPECIALS[sid].move.dash) inp.mx = t.x >= p.x ? 1 : -1;
        if (i === 0) inp.sp1 = true;
        else inp.sp2 = true;
        return inp;
      }
    }

    // Food when hurt.
    if (p.hp < p.max * 0.7) {
      const food = g.items.find((it) => it.kind === 'food' && it.x > g.camX && it.x < g.camX + W && (p.hp < p.max * 0.4 || FOODS[it.type].heal <= p.max - p.hp + 10));
      if (food && (near === 0 || p.hp < p.max * 0.35)) {
        this.steer(inp, food.x - p.x, food.z - p.z);
        return inp;
      }
    }

    // Dodge projectiles in my lane.
    for (const pr of g.projs) {
      if (pr.team !== 'e') continue;
      const key = `p${pr.id}`;
      if (!this.seen.has(key)) this.seen.set(key, this.rand() < this.miss);
      if (this.seen.get(key)) continue;
      const toward = Math.sign(p.x - pr.x) === Math.sign(pr.vx);
      if (!toward || Math.abs(pr.x - p.x) > 150) continue;
      if (Math.abs(pr.z - p.z) < 18) {
        if (pr.kind === 'wave' ? Math.abs(pr.x - p.x) < 36 : Math.abs(pr.x - p.x) < 22) {
          if (p.st === 'idle') inp.jump = true;
        } else if (pr.kind !== 'wave') inp.mz = this.away(p.z, pr.z);
        else continue;
        return inp;
      }
    }

    // Dodge an enemy wind-up aimed at me.
    for (const e of foes) {
      if (e.st !== 'attack' || !e.move) continue;
      const m = e.move as EMove;
      if (e.t >= m.su + m.act || m.proj || m.summon || e.t < this.react) continue;
      const key = `${e.id}:${g.tick - e.t}`;
      if (!this.seen.has(key)) {
        if (this.seen.size > 200) this.seen.clear();
        this.seen.set(key, this.rand() < this.miss);
      }
      if (this.seen.get(key)) continue;
      const dx = (p.x - e.x) * e.f;
      const reach = m.dash ? 200 : m.leap ? 140 : m.reach + 14;
      if (dx > -6 && dx < reach && Math.abs(e.z - p.z) < 16) {
        if (m.dash || m.leap || e.boss || ENEMIES[e.kind].ai === 'heavy') {
          inp.mz = this.away(p.z, e.z);
          inp.mx = m.dash || m.leap ? 0 : e.f;
          return inp;
        }
      }
    }

    // Weapon pickup.
    if (!p.weapon) {
      const w = g.items.find((it) => it.kind === 'weapon' && it.x > g.camX + 10 && it.x < g.camX + W - 10 && Math.abs(it.x - p.x) < 150);
      if (w && near <= 1) {
        const dx = w.x - p.x;
        const dz = w.z - p.z;
        if (Math.abs(dx) < 16 && Math.abs(dz) < 10) {
          if (this.press % 4 === 0) inp.grab = true;
        } else this.steer(inp, dx, dz);
        return inp;
      }
    }

    if (!foes.length) {
      // Break props on the way, grab cash, walk on.
      const pr = g.props.find((x) => x.x > g.camX && x.x < g.camX + W && x.x > p.x - 40);
      const cash = g.items.find((it) => it.kind === 'cash' && it.x > g.camX && it.x < g.camX + W);
      if (cash) this.steer(inp, cash.x - p.x, cash.z - p.z);
      else if (pr) {
        const dx = pr.x - 22 - p.x;
        const dz = pr.z - p.z;
        if (Math.abs(dx) < 8 && Math.abs(dz) < 6) {
          inp.mx = p.f === 1 ? 0 : 0.3;
          if (this.press % 8 === 0) inp.light = true;
        } else this.steer(inp, dx, dz);
      } else {
        inp.mx = 1;
        inp.mz = (48 - p.z) / 30;
      }
      return inp;
    }

    const t = this.nearest(g, foes);
    const dx = t.x - p.x;
    const dz = t.z - p.z;
    const side = dx >= 0 ? 1 : -1;
    const range = p.weapon ? 30 : 22;
    const inRange = Math.abs(dz) < 7 && Math.abs(dx) < range + 12 * t.size && Math.abs(dx) > 6;
    if (inRange && t.st !== 'down' && t.st !== 'getup') {
      if (p.f !== side && p.st === 'idle') inp.mx = side * 0.3;
      const grabbable = !t.boss && (ENEMIES[t.kind].grab || g.fd.strongGrab) && !p.weapon;
      if (grabbable && t.st === 'hit' && this.rand() < 0.04 && Math.abs(dx) < 26) inp.grab = true;
      else if (this.press % 5 === 0) {
        if (p.weapon && g.alive().length > 1 && this.rand() < 0.15) inp.heavy = true;
        else inp.light = true;
      } else if (t.st === 'air' && this.press % 5 === 2) inp.light = true;
      return inp;
    }
    // Move into position on the near side of the target.
    const tx = t.x - side * (range - 2);
    this.steer(inp, tx - p.x, dz);
    if (Math.abs(tx - p.x) < 4) inp.mx = side * 0.25;
    return inp;
  }

  /** Depth direction away from z0, toward the side with room. */
  private away(z: number, z0: number): number {
    if (z < 14) return 1;
    if (z > DEPTH - 14) return -1;
    if (Math.abs(z - z0) > 1) return Math.sign(z - z0);
    return z > DEPTH / 2 ? -1 : 1;
  }

  private steer(inp: Input, dx: number, dz: number): void {
    inp.mx = Math.abs(dx) > 3 ? Math.max(-1, Math.min(1, dx / 12)) : 0;
    inp.mz = Math.abs(dz) > 2 ? Math.max(-1, Math.min(1, dz / 8)) : 0;
  }
}
