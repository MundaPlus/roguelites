/** Steering bots for the debug API and the balance sim. */
import { CLASSES, DX, DY, GRID_H, GRID_W, MAX_PARTY, opposite, type Dir } from './data';
import { Rng } from './rng';
import { COST, applyOffer, canRevive, canTrain, makeLeader, maxHpOf, potion, revive, shrineOffers, train, trainCost, type Offer, type RunState } from './run';
import type { ClassId } from './data';
import type { World } from './world';

export type BotKind = 'weak' | 'good';

export class Bot {
  private key = '';

  constructor(
    private kind: BotKind,
    private rng: Rng,
  ) {}

  /** Call once per sim step. Queues a turn when the line reaches a new cell. */
  drive(w: World): void {
    if (!w.heroes.length || w.done) return;
    const key = `${w.moves}|${w.crashes}|${w.heroes.length}|${w.pauseT > 0}`;
    if (key === this.key) return;
    this.key = key;
    const d = this.kind === 'good' ? this.good(w) : this.weak(w);
    if (d !== null && d !== w.heading) w.queue(d);
  }

  private free(w: World, x: number, y: number): boolean {
    return !w.isRock(x, y) && !w.bodyAt(x, y);
  }

  private weak(w: World): Dir | null {
    const h = w.heroes[0];
    const opts: Dir[] = [];
    for (let d = 0; d < 4; d++) {
      if (w.heroes.length > 1 && d === opposite(w.heading)) continue;
      if (this.free(w, h.x + DX[d], h.y + DY[d])) opts.push(d as Dir);
    }
    if (!opts.length) return null;
    const ahead = opts.includes(w.heading);
    // It notices a wall ahead only most of the time.
    if (!ahead && this.rng.chance(0.85)) return this.rng.pick(opts);
    if (this.rng.chance(0.22)) return this.rng.pick(opts);
    return w.heading;
  }

  private good(w: World): Dir | null {
    const h = w.heroes[0];
    const n = w.heroes.length;
    const block = new Uint8Array(GRID_W * GRID_H);
    for (let i = 0; i < n - 1; i++) block[w.heroes[i].y * GRID_W + w.heroes[i].x] = 1;
    let best: Dir | null = null;
    let bs = -Infinity;
    for (let d = 0; d < 4; d++) {
      if (n > 1 && d === opposite(w.heading)) continue;
      const nx = h.x + DX[d];
      const ny = h.y + DY[d];
      if (!this.free(w, nx, ny)) continue;
      // Flood fill from the next cell gives the room and the path length to each pickup.
      const dist = new Int16Array(GRID_W * GRID_H).fill(-1);
      const q = [ny * GRID_W + nx];
      dist[q[0]] = 0;
      for (let qi = 0; qi < q.length && q.length < 200; qi++) {
        const c = q[qi];
        const x = c % GRID_W;
        const y = (c - x) / GRID_W;
        for (let k = 0; k < 4; k++) {
          const ax = x + DX[k];
          const ay = y + DY[k];
          if (w.isRock(ax, ay)) continue;
          const j = ay * GRID_W + ax;
          if (dist[j] >= 0 || block[j]) continue;
          dist[j] = dist[c] + 1;
          q.push(j);
        }
      }
      const room = q.length;
      let s = room < n + 6 ? -1000 + room * 10 : Math.min(room, 60) * 0.2;
      // Pickups.
      for (const p of w.pickups) {
        const pd = dist[p.y * GRID_W + p.x];
        if (pd < 0 || pd > p.life / 0.16) continue;
        const wgt = p.kind === 'cage' ? 40 : p.kind === 'food' ? 14 : p.kind === 'gem' ? 6 + p.value : 4;
        s += wgt / (1 + pd);
      }
      // Enemies: keep them in range, but do not walk into bosses and charge lanes.
      let near = 99;
      for (const e of w.enemies) {
        if (e.state === 'spawn') continue;
        const md = Math.abs(e.x - nx) + Math.abs(e.y - ny);
        near = Math.min(near, md);
        if (e.def.boss && e.def.brain !== 'ranged' && Math.max(Math.abs(e.x - nx), Math.abs(e.y - ny)) <= 2) s -= 12;
        if (md <= 1 && !e.def.boss) s -= 1.5;
        if (e.state === 'wind' && (e.x === nx || e.y === ny)) s -= 6;
      }
      if (near < 99) s -= Math.abs(near - 3) * 0.6;
      // Enemy bolts that fly at the next cell.
      for (const b of w.shots) {
        if (!b.enemy) continue;
        const t = ((nx + 0.5 - b.x) * b.vx + (ny + 0.5 - b.y) * b.vy) / (b.speed * b.speed);
        if (t < 0 || t > 0.6) continue;
        const px = b.x + b.vx * t;
        const py = b.y + b.vy * t;
        if (Math.hypot(px - nx - 0.5, py - ny - 0.5) < 0.6) s -= 4;
      }
      // Stay away from the edge a bit.
      const edge = Math.min(nx, ny, GRID_W - 1 - nx, GRID_H - 1 - ny);
      if (edge === 0) s -= 1;
      if (d === w.heading) s += 0.4;
      s += this.rng.next() * 0.2;
      if (s > bs) {
        bs = s;
        best = d as Dir;
      }
    }
    return best;
  }

  /** Uses the shrine and the shop. Returns a short log text. */
  shrine(r: RunState, unlocked: ClassId[]): string {
    const offers = shrineOffers(r, unlocked);
    if (this.kind === 'weak') {
      const o = this.rng.pick(offers);
      applyOffer(r, o);
      return o.kind;
    }
    const pick = this.choose(r, offers);
    applyOffer(r, pick);
    while (canRevive(r)) revive(r);
    const ratio = r.heroes.reduce((a, h) => a + h.hp / maxHpOf(r, h), 0) / r.heroes.length;
    if (ratio < 0.6 && r.coins >= COST.potion) potion(r);
    // The toughest hero leads.
    let bi = 0;
    r.heroes.forEach((h, i) => {
      if (h.hp > r.heroes[bi].hp) bi = i;
    });
    makeLeader(r, bi);
    // Train heroes with spare coins, keeping some for a revive.
    for (let k = 0; k < r.heroes.length && r.coins >= 40 + COST.revive; k++) {
      let wi = 0;
      r.heroes.forEach((h, i) => {
        if (h.stars < r.heroes[wi].stars) wi = i;
      });
      makeLeader(r, wi);
      if (!canTrain(r) || r.coins - trainCost(r) < COST.revive) break;
      train(r);
    }
    makeLeader(r, r.heroes.reduce((b, h, i) => (h.hp > r.heroes[b].hp ? i : b), 0));
    return pick.kind;
  }

  private choose(r: RunState, offers: Offer[]): Offer {
    const counts: Partial<Record<ClassId, number>> = {};
    for (const h of r.heroes) counts[h.cls] = (counts[h.cls] ?? 0) + 1;
    const ratio = r.heroes.reduce((a, h) => a + h.hp / maxHpOf(r, h), 0) / r.heroes.length;
    let best = offers[0];
    let bs = -Infinity;
    for (const o of offers) {
      let s = 0;
      if (o.kind === 'recruit') {
        s = r.heroes.length < MAX_PARTY ? 10 - r.heroes.length : -5;
        const c = counts[o.cls] ?? 0;
        if (c === 1 || c === 2) s += 3;
        if (o.cls === 'cleric' && !counts.cleric) s += 2;
        if (CLASSES[o.cls].pattern === 'melee' && !counts.knight && o.cls === 'knight') s += 1;
      } else if (o.kind === 'upgrade') s = 4 + r.heroes[o.index].stars;
      else if (o.kind === 'feast') s = ratio < 0.55 ? 9 : 2;
      else s = 1.5;
      if (s > bs) {
        bs = s;
        best = o;
      }
    }
    return best;
  }
}
