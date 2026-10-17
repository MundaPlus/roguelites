/** Director bots: random, greedy (best card for this turn) and a planner (plans for the whole curve). */
import { HEROES, ROOMS, SERVICES, allCard, type ServiceId } from './data';
import { enterRoom, power, type Hero } from './hero';
import { MIN_DECK, servicePrice, type RunState } from './run';
import type { Rng } from './rng';

export type BotKind = 'random' | 'greedy' | 'good';

const sq = (x: number): number => x * x;

/** Expected boss damage at this level for this hero. */
function bossDmg(h: Hero, level: number): number {
  return power(9, level) * 3.1 * (22 / (22 + h.gear));
}

/** How safe the hero state is. 0 is fine, negative is risky. */
function safety(h: Hero, step: number, level: number): number {
  let v = 0;
  if (h.hp <= 0 || h.stress >= 100 || h.bore >= 100) return -500;
  v -= sq(Math.max(0, h.stress - 45)) / 18 + sq(Math.max(0, h.bore - 45)) / 18;
  if (step <= ROOMS) {
    const need = bossDmg(h, level) * 1.35 + 6;
    if (h.hp < need) v -= (need - h.hp) * 1.2;
  }
  return v;
}

/** Roll the rest of the dungeon out with a careful one-step policy over the cards still in the pile. */
function rollout(h0: Hero, pool: string[], bosses: string[], step: number, level: number): number {
  let h = h0;
  let total = 0;
  const left = [...pool];
  for (let s = step; s <= ROOMS; s++) {
    const opts = s >= ROOMS ? bosses : left;
    if (!opts.length) break;
    let best = -Infinity;
    let bi = 0;
    let bh = h;
    for (let i = 0; i < opts.length; i++) {
      if (i > 0 && opts[i] === opts[i - 1]) continue;
      const o = enterRoom(h, allCard(opts[i]), level, s, null);
      const v = o.points + safety(o.hero, s + 1, level);
      if (v > best) {
        best = v;
        bi = i;
        bh = o.hero;
      }
    }
    total += best;
    h = bh;
    if (h.hp <= 0 || h.stress >= 100 || h.bore >= 100) return total - 500;
    if (s < ROOMS) left.splice(bi, 1);
  }
  // Leave the hero in good shape for the next dungeon.
  return total - sq(Math.max(0, h.stress - 40)) / 30 - sq(Math.max(0, h.bore - 40)) / 30 + h.hp * 0.05;
}

export function chooseCard(r: RunState, kind: BotKind, rng: Rng): number {
  const n = r.hand.length;
  if (kind === 'random') return rng.int(0, n - 1);
  let best = -Infinity;
  let bi = 0;
  for (let i = 0; i < n; i++) {
    const o = enterRoom(r.hero, allCard(r.hand[i]), r.level, r.step, null);
    let v: number;
    if (kind === 'greedy') v = o.points;
    else {
      if (o.end) v = -1000;
      else if (r.step >= ROOMS) v = o.points + safety(o.hero, r.step + 1, r.level);
      else {
        const pool = [...r.pile, ...r.hand.filter((_, j) => j !== i)].sort();
        v = o.points + rollout(o.hero, pool, r.bosses, r.step + 1, r.level);
      }
    }
    if (v > best) {
      best = v;
      bi = i;
    }
  }
  return bi;
}

/** How much this hero likes a card in general. */
export function cardValue(r: RunState, id: string, taste = false): number {
  const t = HEROES[r.hero.type];
  const c = allCard(id);
  const L = t.like;
  const joy = (c.kind === 'fight' ? L.fight * c.danger : 0) + L.loot * c.loot + L.rest * c.rest + L.surprise * c.surprise;
  const f = t.feel;
  const raw = 12 + c.danger * f.danger + c.loot * f.loot + c.surprise * f.surprise - c.rest * f.rest;
  let v = joy * 0.6;
  // Cards near the high targets are scarce in the starter deck.
  if (!taste && raw >= 55 && raw <= 95) v += 8;
  if (raw < t.boreLine) v -= (t.boreLine - raw) * t.boreK * 0.8;
  v -= Math.max(0, power(c.danger, r.level) - t.nerve - r.hero.gear * 0.12) * t.stressK * 1.2;
  if (c.kind === 'trap') v -= (t.trapHate - 1) * 6;
  v += c.rest * t.calm * 0.4 - c.rest * t.restBore;
  return v;
}

export type ShopAct = { act: 'card'; i: number } | { act: 'service'; id: ServiceId; cut?: number } | { act: 'leave' };

export function chooseShop(r: RunState, kind: BotKind, rng: Rng): ShopAct {
  const h = r.hero;
  const can = (id: ServiceId): boolean => r.renown >= servicePrice(r, id);
  if (kind === 'random') {
    if (rng.chance(0.35)) return { act: 'leave' };
    const items = r.shop.map((s, i) => ({ s, i })).filter((x) => !x.s.sold && x.s.price <= r.renown);
    if (items.length) return { act: 'card', i: rng.pick(items).i };
    return { act: 'leave' };
  }
  if (h.hp < h.maxHp * 0.6 && can('heal')) return { act: 'service', id: 'heal' };
  if (h.stress + h.bore > 70 && can('tea')) return { act: 'service', id: 'tea' };
  let best = 4;
  let bi = -1;
  r.shop.forEach((s, i) => {
    if (s.sold || s.price > r.renown) return;
    const v = cardValue(r, s.id);
    if (v > best) {
      best = v;
      bi = i;
    }
  });
  if (bi >= 0) return { act: 'card', i: bi };
  if (r.deck.length > MIN_DECK && can('cut')) {
    let worst = Infinity;
    let wi = -1;
    r.deck.forEach((id, i) => {
      const v = cardValue(r, id);
      if (v < worst) {
        worst = v;
        wi = i;
      }
    });
    if (worst < -2) return { act: 'service', id: 'cut', cut: wi };
  }
  if (can('gear') && r.renown > SERVICES.gear.price + 30) return { act: 'service', id: 'gear' };
  return { act: 'leave' };
}
