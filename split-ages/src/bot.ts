/** Bots for the debug API and the balance sim. */
import { ITEMS } from './data';
import { futFree, futOptions, nb, pastOptions, stateKey, turn, type Act, type FloorDef, type Mods, type St } from './engine';
import type { Rng } from './rng';
import { solve } from './solver';

export type BotMode = 'smart' | 'fast' | 'good' | 'weak';

/** Chance that the good bot makes a random move instead of the planned one (a human slip). */
export const SLIP = 0.12;

export class Bot {
  private plan: [Act, Act][] = [];
  private expect = '';
  /** True when the last search found no plan: the floor is a dead end from here. */
  stuck = false;

  constructor(
    public mode: BotMode,
    private rng: Rng,
  ) {}

  reset(): void {
    this.plan = [];
    this.expect = '';
  }

  next(def: FloorDef, st: St, mods: Mods): [Act, Act] {
    if (this.mode === 'good' && this.rng.chance(SLIP)) {
      this.plan = [];
      return [this.rng.pick(pastOptions(def, st)), this.rng.pick(futOptions(def, st, mods))];
    }
    if (this.mode !== 'weak') {
      const key = stateKey(def, st);
      if (!this.plan.length || key !== this.expect) {
        const res = solve(def, st, mods, this.mode === 'fast' ? 'fast' : 'safe', 60000);
        this.plan = res.plan ? [...res.plan.acts] : [];
        this.stuck = !res.plan && !res.capped;
      }
      const step = this.plan.shift();
      if (step) {
        this.expect = stateKey(def, turn(def, st, step[0], step[1], mods).st);
        return step;
      }
    }
    return this.weak(def, st, mods);
  }

  /** Future hero walks toward the goal. Past hero acts at random. */
  private weak(def: FloorDef, st: St, mods: Mods): [Act, Act] {
    const pa = this.rng.pick(pastOptions(def, st));
    const goal = def.boss ? def.boss.pos : st.fut.indexOf('X');
    const step = firstStep(def, st, mods, goal);
    const fopts = futOptions(def, st, mods);
    const fa = step && this.rng.chance(0.85) ? step : this.rng.pick(fopts);
    return [pa, fa];
  }
}

/** First step on a shortest future path to `goal` (or next to it for the boss), or null. */
function firstStep(def: FloorDef, st: St, mods: Mods, goal: number): Act | null {
  if (goal < 0) return null;
  const prev = new Map<number, [number, Act]>();
  const q = [st.fp];
  prev.set(st.fp, [-1, 'A']);
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    for (const a of ['U', 'D', 'L', 'R'] as Act[]) {
      const d = nb(c, a);
      if (d < 0 || prev.has(d)) continue;
      if (d === goal) {
        let cur = c;
        let act: Act = a;
        while (cur !== st.fp) {
          const [p, pa] = prev.get(cur)!;
          act = pa;
          cur = p;
        }
        return act;
      }
      if (!futFree(def, st, d, mods)) continue;
      prev.set(d, [c, a]);
      q.push(d);
    }
  }
  return null;
}

/** Reward pick order for the good bots. */
const PRIORITY = ['heart', 'tonic', 'seedbag', 'coat', 'hide', 'steel', 'bronze', 'hourglass', 'rope', 'waders', 'meal', 'orchard', 'paradox', 'scav'];

export function pickReward(offer: string[], mode: BotMode, rng: Rng, hp: number, maxHp: number): string | null {
  if (!offer.length) return null;
  if (mode === 'weak') return rng.pick(offer);
  const order = [...PRIORITY];
  if (hp >= maxHp - 2) order.splice(order.indexOf('tonic'), 1);
  for (const id of order) if (offer.includes(id)) return id;
  return offer.find((id) => !!ITEMS[id]) ?? null;
}
