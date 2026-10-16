/** Bots for debug runs and the balance sim. The good bot plans on the move graph; the weak bot only pushes toward the exit. */
import { ITEMS, TS } from './data';
import { EMPTY, LAVA, SPIKES, isBreakable, isSolid } from './data';
import { buildNav, findPath, gridHelpers, type Edge, type Grid } from './nav';
import { noInput, type Ent, type Input, type World } from './world';
import type { Rng } from './rng';

export type Skill = 'good' | 'weak';

export class Bot {
  private path: Edge[] | null = null;
  private edgeT = 0;
  private replanT = 0;
  private bad = new Map<string, number>();
  private lastNode = -1;
  private fleeT = 0;
  private fleeDir = 1;
  private jumped = false;
  private wantUp = false;
  private arriveT = 0;
  private tries = new Map<number, number>();
  private escape: { node: number; action: 'rope' | 'bomb' } | null = null;
  private escapeCd = 0;
  private holdT = 0;
  private combatId = -1;
  private combatT = 0;
  /** Frames since the bot last reached a new node. */
  stuck = 0;

  constructor(
    private w: World,
    private skill: Skill,
    private rng: Rng,
  ) {}

  private node(): number {
    const w = this.w;
    const p = w.p;
    let x = Math.floor((p.x + p.w / 2) / TS);
    const y = Math.floor((p.y + p.h / 2) / TS);
    if (p.onGround && w.getNav().edges[y * w.w + x]?.length === 0) {
      // Standing on the very edge of a ledge: use the tile under the feet.
      for (const fx of [p.x + 0.01, p.x + p.w - 0.01]) {
        const c = Math.floor(fx / TS);
        if (w.getNav().edges[y * w.w + c]?.length) x = c;
      }
    }
    return y * w.w + x;
  }

  private grounded(): boolean {
    const p = this.w.p;
    return p.onGround || p.state === 'climb';
  }

  input(): Input {
    const inp = noInput();
    const w = this.w;
    const p = w.p;
    if (p.dead || w.done) return inp;
    const n = this.node();
    if (n !== this.lastNode) {
      this.lastNode = n;
      this.stuck = 0;
    } else this.stuck++;

    if (this.skill === 'weak') return this.weak(inp);

    // Fight first.
    if (this.combat(inp)) return inp;

    const boss = w.ents.find((e) => e.def?.brain === 'boss' && !e.dead);
    if (boss && boss.state !== 'wait' && p.y > 26 * TS && this.grounded()) {
      this.bossFight(inp, boss);
      return inp;
    }

    if (this.arriveT > 0) {
      this.arriveT--;
      this.arrive(inp);
      return inp;
    }

    if (this.fleeT > 0) {
      this.fleeT--;
      if (this.fleeDir > 0) inp.right = true;
      else inp.left = true;
      if (this.stuck > 20 && p.onGround && this.fleeT % 20 === 0) inp.jump = true;
      return inp;
    }

    if (p.state === 'hang') {
      const e = this.path?.[0];
      const toY = e ? Math.floor(e.to / w.w) : 0;
      if (e && toY < Math.floor(p.y / TS) + 1) inp.jump = w.frame % 2 === 0;
      else inp.down = true;
      return inp;
    }

    if (this.escapeCd > 0) this.escapeCd--;
    if (this.holdT > 0) this.holdT--;
    if (this.escape && n === this.escape.node && p.onGround) {
      if (this.escape.action === 'rope') {
        inp.rope = true;
        this.replanT = 0;
      } else {
        inp.down = true;
        inp.bomb = true;
        const bx = n % w.w;
        const by = Math.floor(n / w.w);
        this.path = findPath(w.getNav(), n, (v) => Math.abs((v % w.w) - bx) >= 4 || Math.abs(Math.floor(v / w.w) - by) >= 3, undefined, 40);
        this.holdT = 170;
      }
      this.escape = null;
      return inp;
    }
    const settled = p.onGround || p.state === 'climb';
    const cur = this.path?.[0];
    if (cur && settled && n !== cur.from && n !== cur.to && (cur.kind === 'jump' || cur.kind === 'fall')) {
      const k = `${cur.from}>${cur.to}`;
      this.bad.set(k, (this.bad.get(k) ?? 0) + 15);
      this.path = null;
    }
    if (settled && this.holdT <= 0 && (this.replanT-- <= 0 || !this.path || w.navDirty)) this.plan();
    const path = this.path;
    if (!path || !path.length) {
      if (this.holdT <= 0 && this.stuck > 60) this.unstick(inp);
      return inp;
    }
    let e = path[0];
    if (n === e.to && this.grounded() && path.length === 1 && e.kind !== 'climb' && Math.abs(p.x + p.w / 2 - ((e.to % w.w) * TS + 8)) > 3) {
      this.steerX(inp, (e.to % w.w) * TS + 8, true);
      return inp;
    }
    if (n === e.to && this.grounded()) {
      path.shift();
      this.edgeT = 0;
      this.jumped = false;
      if (!path.length) {
        this.tries.set(n, (this.tries.get(n) ?? 0) + 1);
        if (!this.escape && this.holdT <= 0) this.arriveT = 24;
        this.replanT = 0;
        return inp;
      }
      e = path[0];
    }
    if (n !== e.from && n !== e.to && this.grounded() && (p.onGround || p.state === 'climb')) {
      if (e.kind === 'jump' || e.kind === 'fall') {
        const k = `${e.from}>${e.to}`;
        this.bad.set(k, (this.bad.get(k) ?? 0) + 15);
      }
      this.replanT = 0;
      this.path = null;
      return inp;
    }
    if (++this.edgeT > 160) {
      const k = `${e.from}>${e.to}`;
      this.bad.set(k, (this.bad.get(k) ?? 0) + 40);
      this.path = null;
      this.replanT = 0;
      this.edgeT = 0;
      return inp;
    }
    this.follow(e, inp);
    if (this.stuck > 400) this.unstick(inp);
    return inp;
  }

  private plan(): void {
    const w = this.w;
    const nav = w.getNav();
    const start = this.node();
    this.replanT = 45;
    const extra = (e: Edge): number => this.bad.get(`${e.from}>${e.to}`) ?? 0;
    const p = w.p;
    const W = w.w;
    const at = (e: Ent): number => Math.floor((e.y + e.h - 1) / TS) * W + Math.floor((e.x + e.w / 2) / TS);
    const boss = w.ents.find((e) => e.def?.brain === 'boss' && !e.dead);
    if (boss) {
      this.path = findPath(nav, start, (v) => Math.floor(v / W) >= 30, extra);
      return;
    }
    // Side goals: the pet, wares we can pay for, loot close by.
    const goals = new Map<number, number>();
    for (const e of w.ents) {
      if (e.kind === 'pet' && e.state === 'wait') goals.set(at(e), 120);
      else if (e.kind === 'ware' && e.value <= w.gold && this.wants(e.eid)) goals.set(at(e), 60);
      else if (e.kind === 'gold' || e.kind === 'gem') goals.set(at(e), 6);
      else if (e.kind === 'item' || e.kind === 'crate') goals.set(at(e), 12);
    }
    if (goals.size) {
      const ok = (v: number, c: number): boolean => goals.has(v) && c <= goals.get(v)! && (this.tries.get(v) ?? 0) < 3;
      const best = findPath(nav, start, ok, (e) => extra(e) + (e.spike ? 500 : 0), 130);
      if (best) {
        const g = best.length ? best[best.length - 1].to : start;
        if (!best.length) {
          this.tries.set(g, (this.tries.get(g) ?? 0) + 1);
          this.arriveT = 24;
        }
        this.path = best;
        return;
      }
    }
    const ex = w.level.exit;
    const goal = ex.y * W + ex.x;
    this.path = findPath(nav, start, (v) => v === goal, extra);
    if (!this.path && p.onGround) {
      // The exit is cut off. Use a rope or a bomb.
      if (!this.escape && this.escapeCd <= 0) {
        this.escapeCd = 120;
        this.planEscape();
      }
      if (this.escape) this.path = findPath(nav, start, (v) => v === this.escape!.node, extra);
    }
  }

  private wants(id: string): boolean {
    const w = this.w;
    if (ITEMS[id].consumable) return id === 'potion' || (id === 'bombbag' && w.bombs < 2) || (id === 'ropepile' && w.ropesLeft < 2);
    return !w.has(id) && ['spring', 'shotgun', 'spikeshoes', 'kapala', 'compass'].includes(id);
  }

  /** At the end of a path: buy, open crates. */
  private arrive(inp: Input): void {
    const w = this.w;
    const p = w.p;
    const ware = w.ents.find((e) => e.kind === 'ware' && Math.abs(e.x + e.w / 2 - (p.x + p.w / 2)) < 10);
    if (ware && ware.value <= w.gold) {
      this.wantUp = !this.wantUp;
      inp.up = this.wantUp;
    }
    const crate = w.ents.find((e) => e.kind === 'crate' && Math.abs(e.x + e.w / 2 - (p.x + p.w / 2)) < 24 && Math.abs(e.y - p.y) < 16);
    if (crate) {
      if ((crate.x + crate.w / 2 > p.x + p.w / 2 ? 1 : -1) !== p.facing) {
        if (crate.x > p.x) inp.right = true;
        else inp.left = true;
      } else inp.attack = w.frame % 4 === 0;
    }
  }

  private steerX(inp: Input, tx: number, tight = false): void {
    const p = this.w.p;
    const pcx = p.x + p.w / 2;
    const diff = tx - pcx;
    const want = Math.max(-2.2, Math.min(2.2, diff * (tight ? 0.25 : 0.4)));
    if (p.vx < want - 0.12) inp.right = true;
    else if (p.vx > want + 0.12) inp.left = true;
  }

  private follow(e: Edge, inp: Input): void {
    const w = this.w;
    const p = w.p;
    const W = w.w;
    const fx = e.from % W;
    const fy = Math.floor(e.from / W);
    const tx = e.to % W;
    const ty = Math.floor(e.to / W);
    const pcx = p.x + p.w / 2;
    const tcx = tx * TS + 8;
    const fcx = fx * TS + 8;
    switch (e.kind) {
      case 'walk':
        if (p.state === 'climb') this.stepOff(inp, fy, tx > fx ? 1 : -1);
        else this.steerX(inp, tcx);
        break;
      case 'fall':
        if (p.state === 'climb') this.stepOff(inp, fy, tx > fx ? 1 : -1);
        else if (p.onGround) {
          // Walk off slowly so we do not drift past a narrow landing.
          const edge = tx > fx ? (fx + 1) * TS : fx * TS;
          const speed = Math.abs(pcx - edge) < 8 ? 1.1 : 2.2;
          const dir = tx > fx ? 1 : -1;
          if (p.vx * dir < speed - 0.1) {
            if (dir > 0) inp.right = true;
            else inp.left = true;
          } else if (p.vx * dir > speed + 0.3) {
            if (dir > 0) inp.left = true;
            else inp.right = true;
          }
        } else this.steerX(inp, tcx, true);
        break;
      case 'drop':
        if (p.state === 'climb' || p.onGround) {
          if (Math.abs(pcx - fcx) > 3 && p.state !== 'climb') this.steerX(inp, fcx, true);
          else inp.down = true;
        } else this.steerX(inp, tcx, true);
        break;
      case 'climb': {
        if (p.state !== 'climb') {
          if (Math.abs(pcx - tcx) > 3) {
            this.steerX(inp, tcx, true);
            if (!p.onGround) {
              if (ty < fy) inp.up = true;
            }
          } else if (ty < fy) inp.up = true;
          else inp.down = true;
        } else if (ty < fy) inp.up = true;
        else inp.down = true;
        break;
      }
      case 'jump': {
        const dy = fy - ty;
        const dir = tx > fx ? 1 : tx < fx ? -1 : 0;
        const ledgeTop = (ty + 1) * TS;
        if (p.onGround && !this.jumped) {
          if (dy >= 1 && Math.abs(tx - fx) === 1) {
            // Hug the wall (or stand at the edge), then jump.
            const edge = dir > 0 ? (fx + 1) * TS - p.w / 2 - 0.5 : fx * TS + p.w / 2 + 0.5;
            const blocked = w.solidAt(dir > 0 ? p.x + p.w + 0.5 : p.x - 0.5, p.y + p.h - 2);
            if (blocked || Math.abs(pcx - edge) < 2.5) {
              inp.jump = true;
              this.jumped = true;
              if (blocked) {
                if (dir > 0) inp.right = true;
                else inp.left = true;
              }
            } else this.steerX(inp, edge, true);
          } else if (dy >= 1 && tx === fx) {
            if (Math.abs(pcx - fcx) > 3) this.steerX(inp, fcx, true);
            else {
              inp.jump = true;
              this.jumped = true;
            }
          } else {
            // Gap jump: get running, jump at the edge.
            if (dir > 0) inp.right = true;
            else inp.left = true;
            if ((pcx - fcx) * dir > 2 && Math.abs(p.vx) > 1.2) {
              inp.jump = true;
              this.jumped = true;
            } else if ((pcx - fcx) * dir > 5) {
              inp.jump = true;
              this.jumped = true;
            }
          }
          break;
        }
        if (p.onGround && this.jumped && p.vy >= 0) {
          // Landed where we started (bonked): try again.
          this.jumped = false;
          break;
        }
        const feet = p.y + p.h;
        const adx = Math.abs(tx - fx);
        inp.jump = dy >= 1 && adx <= 1 ? p.vy < 0 && (dy >= 3 || feet > ledgeTop - 8) : p.vy < 0;
        if (adx >= 2) this.steerX(inp, tcx);
        else if (dy >= 1 && dir !== 0) {
          const wall = w.solidAt(dir > 0 ? p.x + p.w + 0.5 : p.x - 0.5, feet - 1);
          if (feet <= ledgeTop + 0.5 || wall) {
            if (Math.abs(pcx - tcx) > 3 || feet > ledgeTop) {
              if (dir > 0) inp.right = true;
              else inp.left = true;
            } else this.steerX(inp, tcx, true);
          } else this.steerX(inp, fcx, true);
        } else if (dy >= 1) this.steerX(inp, fcx, true);
        else this.steerX(inp, tcx, true);
        break;
      }
    }
  }

  /** True if walking one step that way keeps us on safe ground. */
  private safeStep(dir: number): boolean {
    const w = this.w;
    const p = w.p;
    const x = Math.floor((p.x + p.w / 2 + dir * 10) / TS);
    const y = Math.floor((p.y + p.h / 2) / TS);
    const { ground } = gridHelpers(w.grid());
    return ground(x, y) && w.tile(x, y) !== SPIKES;
  }

  /** Leave a ladder or rope sideways: first climb until the feet are above the floor next to it. */
  private stepOff(inp: Input, row: number, dir: number): void {
    const p = this.w.p;
    if (p.y + p.h > (row + 1) * TS - 0.5) inp.up = true;
    else if (dir > 0) inp.right = true;
    else inp.left = true;
  }

  /** No path to the exit: find a spot where a rope or a bomb opens one. */
  private planEscape(): void {
    const w = this.w;
    const W = w.w;
    const nav = w.getNav();
    const start = this.node();
    const ex = w.level.exit;
    const goal = ex.y * W + ex.x;
    // Nodes we can reach now, cheapest first.
    const seen = new Map<number, number>();
    findPath(nav, start, (v, c) => {
      seen.set(v, c);
      return false;
    });
    const cands = [...seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 60).map(([v]) => v);
    const base = w.grid();
    const { ground } = gridHelpers(base);
    for (const c of cands) {
      const cx0 = c % W;
      const cy0 = Math.floor(c / W);
      if (!ground(cx0, cy0)) continue;
      if (w.ropesLeft > 0) {
        let top = cy0;
        for (let k = 1; k <= 8; k++) {
          if (isSolid(w.tile(cx0, cy0 - k))) break;
          top = cy0 - k;
        }
        if (top < cy0) {
          const g: Grid = { ...base, climb: (x, y) => base.climb(x, y) || (x === cx0 && y >= top && y <= cy0) };
          if (findPath(buildNav(g), c, (v) => v === goal)) {
            this.escape = { node: c, action: 'rope' };
            return;
          }
        }
      }
    }
    if (w.bombs <= 0) return;
    for (const c of cands) {
      const cx0 = c % W;
      const cy0 = Math.floor(c / W);
      if (!ground(cx0, cy0)) continue;
      const bx = cx0 * TS + 8;
      const by = (cy0 + 1) * TS - 4;
      const gone = new Set<number>();
      for (let ty = cy0 - 3; ty <= cy0 + 4; ty++)
        for (let tx = cx0 - 3; tx <= cx0 + 3; tx++) {
          const dx = tx * TS + 8 - bx;
          const dy = ty * TS + 8 - by;
          if (dx * dx + dy * dy <= 40 * 40 && tx > 0 && ty > 0 && tx < W - 1 && ty < w.h - 1 && isBreakable(w.tile(tx, ty)) && w.tile(tx, ty) !== LAVA) gone.add(ty * W + tx);
        }
      if (!gone.size) continue;
      const g: Grid = { ...base, tile: (x, y) => (gone.has(y * W + x) ? EMPTY : base.tile(x, y)) };
      const nav2 = buildNav(g);
      // After the blast, try from every node near the crater.
      for (let dy = -1; dy <= 4; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const v = (cy0 + dy) * W + cx0 + dx;
          if (nav2.edges[v]?.length && findPath(nav2, v, (u) => u === goal) && (findPath(nav2, v, (u) => u === goal)?.length ?? 0) > 0) {
            if (seen.has(v) || dy > 0) {
              this.escape = { node: c, action: 'bomb' };
              return;
            }
          }
        }
    }
  }

  private unstick(inp: Input): void {
    const w = this.w;
    const p = w.p;
    if (!p.onGround) return;
    if (this.stuck > 90 && w.ropesLeft > 0 && this.rng.chance(0.02)) {
      inp.rope = true;
      return;
    }
    if (this.stuck > 150 && w.bombs > 0 && this.rng.chance(0.02)) {
      inp.down = true;
      inp.bomb = true;
      this.fleeT = 150;
      this.fleeDir = this.rng.chance(0.5) ? 1 : -1;
      return;
    }
    if (this.rng.chance(0.03)) inp.jump = true;
    if (this.rng.chance(0.5)) inp.right = true;
    else inp.left = true;
  }

  /** Whip or shoot enemies close by, dodge arrows and falling spiders. Returns true if it took over the input. */
  private combat(inp: Input): boolean {
    const w = this.w;
    const p = w.p;
    if (p.state === 'climb' || p.holding) return false;
    const pcx = p.x + p.w / 2;
    const pcy = p.y + p.h / 2;
    const gun = w.has('shotgun');
    // Arrows flying at us: jump.
    for (const e of w.ents) {
      if (e.kind !== 'arrow' || e.dead) continue;
      const dx = pcx - (e.x + e.w / 2);
      if (Math.sign(dx) === Math.sign(e.vx) && Math.abs(dx) < 48 && Math.abs(e.y - pcy) < 10 && p.onGround) {
        inp.jump = true;
        return true;
      }
    }
    // A trap shakes over our head: keep moving out from under it.
    for (const t of w.traps) {
      if (t.state !== 'shake' || Math.abs(t.x * TS + 8 - pcx) > 14 || t.y * TS > p.y) continue;
      const dir = t.x * TS + 8 > pcx ? -1 : 1;
      if (this.safeStep(dir) || !this.safeStep(-dir)) {
        if (dir > 0) inp.right = true;
        else inp.left = true;
      } else if (dir > 0) inp.left = true;
      else inp.right = true;
      return true;
    }
    for (const f of w.ents) {
      if (f.kind !== 'fall' || f.dead || f.y > p.y || p.y - f.y > 10 * TS) continue;
      const fcx = f.x + f.w / 2;
      if (Math.abs(fcx - pcx) > f.w / 2 + p.w / 2 + 3) {
        // Do not walk under it.
        const dir = fcx > pcx ? 1 : -1;
        if (Math.abs(fcx - pcx) < 34 && Math.sign(p.vx) === dir) {
          if (dir > 0) inp.left = true;
          else inp.right = true;
          return true;
        }
        continue;
      }
      const dir = fcx > pcx ? -1 : 1;
      if (this.safeStep(dir) || !this.safeStep(-dir)) {
        if (dir > 0) inp.right = true;
        else inp.left = true;
      } else if (dir > 0) inp.left = true;
      else inp.right = true;
      return true;
    }
    let target: Ent | null = null;
    let best = Infinity;
    for (const e of w.ents) {
      if (e.kind !== 'enemy' || e.dead || e.def?.brain === 'boss') continue;
      const dx = e.x + e.w / 2 - pcx;
      const dy = e.y + e.h / 2 - pcy;
      if (e.state === 'hang') continue;
      // A spider falling on us: step aside.
      if (e.state === 'drop' && dy < 0 && dy > -90 && Math.abs(dx) < 18 && p.onGround && this.safeStep(dx > 0 ? -1 : 1)) {
        if (dx > 0) inp.left = true;
        else inp.right = true;
        return true;
      }
      const reach = gun ? 70 : 40;
      if (Math.abs(dx) < reach && Math.abs(dy) < (gun ? 10 : 18)) {
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < best) {
          best = d;
          target = e;
        }
      }
    }
    if (!target) return false;
    if (target.id === this.combatId) this.combatT++;
    else {
      this.combatId = target.id;
      this.combatT = 0;
    }
    // Do not wait forever for an enemy that does not come.
    if (this.combatT > 120) {
      if (this.combatT > 300) this.combatT = 0;
      return false;
    }
    const dx = target.x + target.w / 2 - pcx;
    const dir = dx > 0 ? 1 : -1;
    const gap = Math.abs(dx) - target.w / 2 - p.w / 2;
    const inReach = gun ? true : gap < 16;
    if (!inReach) {
      if (this.stuck > 150) return false;
      // Wait for it to come, unless it is slow: then walk up to it.
      if ((target.def?.speed ?? 1) < 0.7 && target.def?.brain !== 'charger' && this.safeStep(dir)) {
        if (dir > 0) inp.right = true;
        else inp.left = true;
      }
      return true;
    }
    if (p.whipCd > 0) {
      if (gap < 6 && p.onGround && this.safeStep(-dir)) {
        if (dir > 0) inp.left = true;
        else inp.right = true;
      }
      return true;
    }
    if (p.facing !== dir) {
      if (dir > 0) inp.right = true;
      else inp.left = true;
      return true;
    }
    inp.attack = true;
    return true;
  }

  private bossFight(inp: Input, boss: Ent): void {
    const w = this.w;
    const p = w.p;
    const pcx = p.x + p.w / 2;
    const bcx = boss.x + boss.w / 2;
    const dx = bcx - pcx;
    const floorY = (w.h - 2) * TS;
    const minX = TS * 1.5;
    const maxX = (w.w - 1.5) * TS;
    if (boss.state === 'air') {
      // Keep away from the landing spot and be in the air when it lands.
      const land = w.bossLanding(boss);
      const dist = pcx - land;
      if (Math.abs(dist) < 56) {
        let away = dist >= 0 ? 1 : -1;
        // Cornered: run under the boss to the other side.
        if ((away > 0 && maxX - pcx < 60) || (away < 0 && pcx - minX < 60)) away = -away;
        if (away > 0) inp.right = true;
        else inp.left = true;
      }
      if (boss.vy > 1 && floorY - (boss.y + boss.h) < 40 && p.onGround) inp.jump = true;
      if (!p.onGround) inp.jump = p.vy < 0;
      return;
    }
    // Idle: stand next to it and whip.
    const side = dx > 0 ? -1 : 1;
    let want = bcx + side * (boss.w / 2 + 12);
    if (want < minX || want > maxX) want = bcx - side * (boss.w / 2 + 12);
    if (Math.abs(pcx - want) > 4) this.steerX(inp, want, true);
    const facing = dx > 0 ? 1 : -1;
    if (Math.abs(dx) < boss.w / 2 + 22 && p.whipCd === 0) {
      if (p.facing !== facing) {
        if (facing > 0) inp.right = true;
        else inp.left = true;
      } else inp.attack = true;
    }
    if (w.bombs > 3 && boss.t > 50 && Math.abs(dx) < 60 && Math.abs(dx) > 30 && p.facing === facing && w.frame % 30 === 0) inp.bomb = true;
  }

  /** The weak bot: walk toward the exit, jump at walls, swing at random. */
  private weak(inp: Input): Input {
    const w = this.w;
    const p = w.p;
    const ex = w.level.exit;
    const tx = ex.x * TS + 8;
    const pcx = p.x + p.w / 2;
    if (Math.abs(tx - pcx) > 6) {
      if (tx > pcx) inp.right = true;
      else inp.left = true;
    }
    if (p.onGround && (Math.abs(p.vx) < 0.3 || this.rng.chance(0.02))) inp.jump = this.rng.chance(0.3);
    if (!p.onGround && p.vy < 0) inp.jump = true;
    if (this.stuck > 200 && this.rng.chance(0.3)) {
      inp.right = !inp.right;
      inp.left = !inp.left;
    }
    if (this.rng.chance(0.05)) inp.attack = true;
    if (p.state === 'hang') inp.jump = this.rng.chance(0.5);
    return inp;
  }
}
