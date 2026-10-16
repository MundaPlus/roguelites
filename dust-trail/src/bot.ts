/** Bot decisions, shared by the headless sim and the `?debug` API. */
import { MAX_PARTY, TERRAIN } from './data';
import type { Fx, Outcome } from './events';
import type { Rng } from './rng';
import {
  SHOP,
  best,
  canRepair,
  canTreat,
  choiceViews,
  eventDef,
  foodPerDay,
  here,
  jobOk,
  jobPay,
  node,
  recruitOk,
  shopOk,
  shopPrice,
  type RunState,
  type ShopKey,
} from './run';

export type TownAction = { kind: 'buy'; key: ShopKey } | { kind: 'job'; i: number } | { kind: 'recruit'; i: number } | { kind: 'leave' };
export type CareAction = { kind: 'treat'; uid: number } | { kind: 'repair' } | { kind: 'rations'; v: number } | null;

function fxValue(r: RunState, fx: Fx | undefined): number {
  if (!fx) return 0;
  const n = r.party.length;
  const waterLow = r.res.water < r.waterCap / 2;
  let v = 0;
  v += (fx.food ?? 0) * (r.res.food < 40 ? 0.9 : 0.4);
  v += (fx.water ?? 0) * (waterLow ? 1 : 0.3);
  v += (fx.parts ?? 0) * (r.res.parts < 2 ? 14 : 6);
  v += (fx.med ?? 0) * (r.res.med < 2 ? 12 : 6);
  v += (fx.money ?? 0) * 0.35;
  v += (fx.ammo ?? 0) * (r.res.ammo < 15 ? 0.6 : 0.2);
  v += (fx.morale ?? 0) * (r.morale < 40 ? 1.2 : 0.5);
  v += (fx.wagon ?? 0) * (r.wagon < 50 ? 0.6 : 0.25);
  v += (fx.hp ?? 0) * 5 + (fx.hpB ?? 0) * 5 + (fx.hpAll ?? 0) * 4 * n;
  if (fx.sick) v -= 14;
  if (fx.cure) v += 8;
  if (fx.recruit) v += r.party.length < MAX_PARTY ? 35 : 0;
  if (fx.leave || fx.leaveB) v -= 45;
  if (fx.die) v -= 60;
  v -= (fx.miles ?? 0) * 0.5;
  v -= (fx.days ?? 0) * (foodPerDay(r) * 0.6 + 4);
  if (fx.scene === 'hunt') v += r.res.ammo > 5 ? 14 : -5;
  if (fx.scene === 'river') v -= fx.easy ? 6 : 14;
  if (fx.scene === 'ambush') v -= 22;
  v += (fx.rel ?? 0) * 2 + (fx.relAll ?? 0) * 4;
  if (fx.skill) v += 6;
  return v;
}

const avg = (r: RunState, list: Outcome[] | undefined): number => {
  if (!list || !list.length) return 0;
  const tw = list.reduce((s, o) => s + (o.w ?? 1), 0);
  return list.reduce((s, o) => s + ((o.w ?? 1) / tw) * fxValue(r, o.fx), 0);
};

export function botChoice(r: RunState, smart: boolean, rng: Rng): number {
  const views = choiceViews(r);
  const ok = views.map((v, i) => (v.ok ? i : -1)).filter((i) => i >= 0);
  if (!ok.length) return 0;
  if (!smart) return rng.pick(ok);
  const ev = eventDef(r);
  let bi = ok[0];
  let bv = -1e9;
  for (const i of ok) {
    const c = ev.choices[i];
    let v: number;
    if (c.skill && c.check !== undefined) {
      const m = /(\d+)%/.exec(views[i].tag);
      const p = m ? Number(m[1]) / 100 : 0.5;
      v = p * avg(r, c.ok) + (1 - p) * avg(r, c.fail);
    } else v = avg(r, c.out ?? c.ok);
    if (v > bv) {
      bv = v;
      bi = i;
    }
  }
  return bi;
}

export function botLink(r: RunState, smart: boolean, rng: Rng): number {
  const links = here(r).links;
  if (!smart) return rng.int(0, links.length - 1);
  const days = (m: number): number => m / 12;
  let bi = 0;
  let bv = -1e9;
  links.forEach((l, i) => {
    const n = node(r, l.to);
    const d = days(l.miles);
    let v = -l.miles * 0.4 - l.danger * 9;
    const water = r.res.water - r.party.length * TERRAIN[n.terrain].water * d * 1.2;
    if (water < 0) v += water * 3;
    const food = r.res.food - foodPerDay(r) * d;
    if (n.kind === 'town') v += 18 + (r.res.food < 50 ? 15 : 0) + (r.res.money > 60 ? 10 : 0);
    if (n.kind === 'spring' || n.kind === 'river') v += r.res.water < r.waterCap * 0.6 ? 14 : 4;
    if (n.kind === 'hunt') v += r.res.ammo >= 8 ? (food < 30 ? 22 : 8) : -5;
    if (n.kind === 'pass') v -= 14 - (best(r, 'scout') + best(r, 'fight')) * 2;
    if (n.kind === 'river') v -= 4;
    if (n.kind === 'camp') v += r.party.some((t) => t.hp < t.maxHp * 0.6) ? 10 : 2;
    if (n.kind === 'ruins') v += 4;
    if (food < 0) v += food;
    if (v > bv) {
      bv = v;
      bi = i;
    }
  });
  return bi;
}

/** Healing, repair and rations. One action per call, null when nothing to do. */
export function botCare(r: RunState, smart: boolean): CareAction {
  if (!smart) {
    const sick = r.party.find((t) => t.sick && canTreat(r, t) && t.hp <= 3);
    return sick ? { kind: 'treat', uid: sick.uid } : null;
  }
  const sick = r.party.find((t) => t.sick && canTreat(r, t) && (t.hp <= 6 || r.res.med >= 2));
  if (sick) return { kind: 'treat', uid: sick.uid };
  const low = r.party.find((t) => t.hp <= 3 && canTreat(r, t));
  if (low) return { kind: 'treat', uid: low.uid };
  if (r.wagon < 25 && r.res.parts >= 2 && canRepair(r)) return { kind: 'repair' };
  const daysOfFood = r.res.food / Math.max(1, foodPerDay({ ...r, rations: 1 }));
  const want = daysOfFood > 18 ? 2 : daysOfFood < 6 ? 0 : 1;
  if (want !== r.rations) return { kind: 'rations', v: want };
  return null;
}

export function botTown(r: RunState, smart: boolean, rng: Rng): TownAction {
  const t = r.town!;
  const can = (k: ShopKey): boolean => !shopOk(r, k);
  if (!smart) {
    const opts = SHOP.filter((s) => can(s.key) && s.key !== 'barrel' && s.key !== 'inn');
    if (opts.length && rng.chance(0.75)) return { kind: 'buy', key: rng.pick(opts).key };
    return { kind: 'leave' };
  }
  const money = r.res.money;
  const daily = foodPerDay({ ...r, rations: 1 });
  const foodTarget = daily * (here(r).row >= 9 ? 9 : 15);
  if (can('water') && r.res.water < r.waterCap - 5) return { kind: 'buy', key: 'water' };
  if (r.party.some((p) => p.sick || p.hp <= p.maxHp * 0.5) && can('doctor') && money > shopPrice(r, 'doctor') + 30) return { kind: 'buy', key: 'doctor' };
  if (r.res.food < foodTarget * 0.6 && can('food')) return { kind: 'buy', key: 'food' };
  if (r.wagon < 50 && can('repair') && money > shopPrice(r, 'repair') + 30) return { kind: 'buy', key: 'repair' };
  if (r.res.parts < 1 && can('parts')) return { kind: 'buy', key: 'parts' };
  if (r.res.med < 1 && can('med')) return { kind: 'buy', key: 'med' };
  if (r.res.food < foodTarget && can('food')) return { kind: 'buy', key: 'food' };
  if (r.res.ammo < 20 && can('ammo') && money > 40) return { kind: 'buy', key: 'ammo' };
  if (r.party.length < 4) {
    const i = t.recruits.findIndex((_, k) => !recruitOk(r, k));
    if (i >= 0 && money > 70) return { kind: 'recruit', i };
  }
  if (r.waterCap < 55 && can('barrel') && money > shopPrice(r, 'barrel') + 50) return { kind: 'buy', key: 'barrel' };
  if (r.res.parts < 2 && can('parts') && money > 50) return { kind: 'buy', key: 'parts' };
  if (r.res.med < 2 && can('med') && money > 50) return { kind: 'buy', key: 'med' };
  if (r.morale < 45 && can('inn') && money > 50) return { kind: 'buy', key: 'inn' };
  // Work when poor and the food lasts.
  if (money < 50 && r.res.food > daily * 4) {
    let bi = -1;
    let bv = 0;
    t.jobs.forEach((j, i) => {
      if (jobOk(r, i)) return;
      const v = jobPay(r, j) / j.days - daily * 0.8;
      if (v > bv) {
        bv = v;
        bi = i;
      }
    });
    if (bi >= 0) return { kind: 'job', i: bi };
  }
  return { kind: 'leave' };
}
