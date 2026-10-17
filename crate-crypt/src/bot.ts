/**
 * Bots for the debug API and the balance sim. The room bot follows the BFS solver.
 * `noise` adds human-like detours: a random step and the step back (2 wasted moves).
 * A random step that moves a crate gets undone, like a player who sees the mistake.
 */
import { move, step, walkPath, type Dir, type RoomState } from './puzzle';
import { Rng } from './rng';
import { isOpen, stairsDone, type FloorRoom, type Offer, type RunState } from './run';
import { bare, solve } from './solver';

export interface BotCfg {
  noise: number;
  smart: boolean;
}

export const GOOD: BotCfg = { noise: 0.16, smart: true };
export const WEAK: BotCfg = { noise: 0.45, smart: false };
export const PERFECT: BotCfg = { noise: 0, smart: true };
/** Wastes about 35% of its moves (measured in the sim). */
export const HUMAN: BotCfg = { noise: 0.27, smart: true };

export type BotAct =
  | { act: 'move'; dir: Dir | 4; noise?: boolean }
  | { act: 'undo' }
  | { act: 'restart' }
  | { act: 'collapse' }
  | { act: 'tool'; id: 'hourglass' };

const sameCrates = (a: RoomState, b: RoomState): boolean =>
  a.crates.length === b.crates.length && a.crates.every((c, i) => c.pos === b.crates[i].pos) && a.broken.length === b.broken.length;

export class RoomBot {
  private plan: Dir[] | null = null;
  private blocked = 0;
  private pendingUndo = false;
  private shoved = false;
  private jitter = 0;
  /** Steps left to walk around and shove a monster. */
  private hunt = 0;
  /** Give up on this attempt and restart when the room takes this many moves. */
  private limit = 0;
  private rng: Rng;

  constructor(
    private cfg: BotCfg,
    seed: number,
    private strong: boolean,
  ) {
    this.rng = new Rng(seed);
  }

  reset(): void {
    this.plan = null;
    this.limit = 0;
    this.blocked = 0;
    this.pendingUndo = false;
  }

  decide(s: RoomState): BotAct | null {
    if (s.exited) return null;
    if (s.budget <= 0) return { act: 'collapse' };
    if (this.pendingUndo) return { act: 'undo' };
    if (!this.plan || !this.plan.length) {
      const sol = solve(s, 60000, this.strong);
      if (!sol) {
        this.plan = null;
        return { act: 'restart' };
      }
      this.plan = sol.moves;
      if (!this.limit) this.limit = s.moves + sol.moves.length * 2 + 30;
    }
    if (this.limit && s.moves > this.limit && s.monsters.length) {
      // Monsters keep getting in the way. Start over with a few waits, so they move differently.
      this.limit = 0;
      this.plan = null;
      this.hunt = 0;
      this.blocked = 0;
      this.jitter = this.rng.int(1, 8);
      return { act: 'restart' };
    }
    if (this.cfg.smart && (s.tools.hourglass ?? 0) > 0 && s.budget < this.plan.length + 2) return { act: 'tool', id: 'hourglass' };
    if (this.hunt > 0 || (this.blocked >= 3 && s.monsters.length)) {
      // Walk around and shove the closest monster out of the way. The path is planned again each step.
      const d = this.shovePath(s);
      if (d) {
        if (this.hunt <= 0) this.hunt = 16;
        return { act: 'move', dir: d[0], noise: true };
      }
      this.hunt = 0;
    }
    if (this.blocked >= 12) {
      // A monster is stuck in the way. Start over with a few waits, so the monsters move differently.
      this.plan = null;
      this.blocked = 0;
      this.jitter = this.rng.int(1, 5);
      this.limit = 0;
      this.hunt = 0;
      return { act: 'restart' };
    }
    if (this.jitter > 0) {
      this.jitter--;
      return { act: 'move', dir: 4 };
    }
    // After a shove, step again at once. Waiting only lets the monster come back.
    // Random waits, so the bot does not fall in step with a monster's loop.
    if (this.blocked >= 1 && !this.shoved && this.rng.chance(0.6)) return { act: 'move', dir: 4 };
    if (this.plan.length > 1 && this.rng.chance(this.cfg.noise)) return { act: 'move', dir: this.rng.int(0, 3) as Dir, noise: true };
    return { act: 'move', dir: this.plan[0] };
  }

  private shovePath(s: RoomState): Dir[] | null {
    let best: Dir[] | null = null;
    let bestCost = Infinity;
    for (const m of s.monsters) {
      for (let d = 0 as Dir; d < 4; d++) {
        const stand = step(s.room, m.pos, ((d + 2) % 4) as Dir);
        if (stand < 0) continue;
        const path = walkPath(s, stand, true);
        if (!path) continue;
        // Prefer a shove into something solid: that squashes the monster for good.
        const beyond = step(s.room, m.pos, d as Dir);
        const kill = beyond < 0 || s.room.tiles[beyond] !== '.' || s.crates.some((c) => c.pos === beyond) || s.monsters.some((o) => o.pos === beyond);
        const cost = path.length + (kill ? 0 : 25);
        if (cost < bestCost) {
          bestCost = cost;
          best = [...path, d as Dir];
        }
      }
    }
    return best;
  }

  observe(a: BotAct, before: RoomState, after: RoomState): void {
    if (a.act === 'undo') {
      this.pendingUndo = false;
      return;
    }
    if (a.act === 'restart') {
      this.plan = null;
      return;
    }
    if (a.act !== 'move') return;
    if (a.dir === 4) return;
    const bumped = after.fx.length > 0 && after.fx[0].kind === 'bump';
    this.shoved = after.fx.some((f) => f.kind === 'shove' || f.kind === 'kill');
    if (a.noise && this.hunt > 0) {
      this.hunt--;
      if (!sameCrates(before, after)) this.pendingUndo = true;
      if (this.shoved || bumped || this.hunt <= 0 || this.pendingUndo) {
        this.hunt = 0;
        this.plan = null;
        this.blocked = this.shoved ? 0 : this.blocked + 4;
      }
      return;
    }
    if (a.noise) {
      if (bumped || !this.plan) return;
      if (!sameCrates(before, after)) this.pendingUndo = true;
      else if (after.p !== before.p) this.plan.unshift(((a.dir + 2) % 4) as Dir);
      return;
    }
    const t = step(before.room, before.p, a.dir);
    const t2 = t >= 0 ? step(before.room, t, a.dir) : -1;
    const byMonster = before.monsters.some((m) => m.pos === t || m.pos === t2);
    if (bumped && !byMonster) {
      // The plan no longer fits the room. Plan again, but count it: a loop here ends in a hunt or a restart.
      this.plan = null;
      this.blocked++;
      return;
    }
    if (bumped || (after.p === before.p && this.shoved)) {
      // Blocked by a monster, or a shove: the player did not move.
      this.blocked++;
      return;
    }
    this.blocked = 0;
    this.plan?.shift();
    // A monster can stop an ice crate early. Then the plan is wrong: plan again.
    const exp = move(bare(before), a.dir, { bare: true, strong: this.strong });
    if (!sameCrates(exp, after)) this.plan = null;
    // A pick-up or a bite never changes the plan. A monster can not move crates.
  }
}

/** Floor map choice: a room id, or -1 to go down the stairs. */
export function chooseRoom(run: RunState, cfg: BotCfg, rng: Rng): number {
  const open = run.rooms.filter((r) => isOpen(run, r) && (r.kind !== 'vault' || run.keys > 0));
  const left = run.rooms.filter((r) => r.row === 1 && !r.done).reduce((a, r) => a + r.par, 0);
  const need = left * (1 + cfg.noise * 2.5) + 6;
  if (!cfg.smart) {
    const opts = open.filter((r) => r.kind !== 'shop');
    if (!opts.length) return -1;
    if (stairsDone(run) && rng.chance(0.5)) return -1;
    return rng.pick(opts).id;
  }
  const find = (k: string): FloorRoom | undefined => open.find((r) => r.kind === k);
  const shop = find('shop');
  if (shop && run.gold >= 14) return shop.id;
  const vault = find('vault');
  if (vault) return vault.id;
  const shrine = find('shrine');
  if (shrine) return shrine.id;
  const tr = find('treasure');
  if (tr && run.budget - need > tr.par * (1 + cfg.noise * 2.5) + 10) return tr.id;
  const main = open.find((r) => r.row === 1);
  if (main) return main.id;
  return -1;
}

export function chooseOffer(run: RunState, offers: Offer[], cfg: BotCfg): number {
  if (!cfg.smart) return 0;
  const left = run.rooms.filter((r) => r.row === 1 && !r.done).reduce((a, r) => a + r.par, 0);
  const tight = run.budget < left * (1 + cfg.noise * 2.5);
  const rank = (o: Offer): number => {
    if (o.kind === 'heart') return run.hearts < run.maxHearts ? 50 : 0;
    if (o.kind === 'moves') return tight ? 40 : 20;
    if (o.kind === 'tool') return o.tool === 'hourglass' ? 35 : 10;
    if (o.kind === 'gold') return 15;
    return run.rooms.some((r) => r.kind === 'vault' && !r.done) ? 25 : 8;
  };
  let best = 0;
  offers.forEach((o, i) => {
    if (rank(o) > rank(offers[best])) best = i;
  });
  return best;
}

/** Shop picks for the smart bot, in order. Returns an item index or -1 to leave. */
export function chooseBuy(run: RunState): number {
  const items = run.shop ?? [];
  const want = (i: number): number => {
    const it = items[i];
    if (it.sold || it.cost > run.gold) return -1;
    const o = it.offer;
    if (o.kind === 'heart') return run.hearts < run.maxHearts ? 50 : -1;
    if (o.kind === 'moves') return 30;
    if (o.kind === 'tool' && o.tool === 'hourglass') return 40;
    if (o.kind === 'key') return run.rooms.some((r) => r.kind === 'vault' && !r.done) && run.keys === 0 ? 20 : -1;
    return -1;
  };
  let best = -1;
  let bw = 0;
  items.forEach((_, i) => {
    const w = want(i);
    if (w > bw) {
      bw = w;
      best = i;
    }
  });
  return best;
}
