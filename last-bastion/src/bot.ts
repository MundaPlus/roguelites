/** Simple bots for the debug API and the headless balance sim. */
import { TOWERS, type TowerId } from './data';
import { buildCost, build, canBuildAt, mapInfo, towerStats, upgrade, upgradeCost, type Offer, type RunState, type Tower } from './game';
import { CELLS, cellAt, type MapInfo } from './map';
import type { Rng } from './rng';

export type Policy = 'weak' | 'good';

/** Route sample points, every 0.5 cells. Shared parts near the core count once per route. */
const cache = new WeakMap<MapInfo, { x: number; y: number }[][]>();

function samples(info: MapInfo, fly: boolean): { x: number; y: number }[] {
  let c = cache.get(info);
  if (!c) {
    c = [sampleRoutes(info, false), sampleRoutes(info, true)];
    cache.set(info, c);
  }
  return c[fly ? 1 : 0];
}

function sampleRoutes(info: MapInfo, fly: boolean): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const r of info.routes) {
    if (r.fly !== fly) continue;
    for (let d = 0; d < r.total; d += 0.5) {
      let s = 0;
      while (s < r.pts.length - 2 && r.cum[s + 1] < d) s++;
      const a = r.pts[s];
      const b = r.pts[s + 1];
      const k = (d - r.cum[s]) / (r.cum[s + 1] - r.cum[s] || 1);
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
  }
  return out;
}

function coverage(run: RunState, info: MapInfo, type: TowerId, cx: number, cy: number, range: number): number {
  const g = samples(info, false);
  const f = TOWERS[type].air ? samples(info, true) : [];
  const x = cx + 0.5;
  const y = cy + 0.5;
  const min2 = TOWERS[type].minRange ** 2;
  const r2 = range * range;
  let n = 0;
  for (const p of g) {
    const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d2 <= r2 && d2 >= min2) n++;
  }
  for (const p of f) if ((p.x - x) ** 2 + (p.y - y) ** 2 <= r2) n += run.wave >= 6 ? 0.5 : 0.1;
  return n;
}

const VALUE: Record<TowerId, number> = { ballista: 20, mortar: 17, frost: 8, tesla: 17, flame: 16 };

function rangeFor(run: RunState, info: MapInfo, type: TowerId, cx: number, cy: number): number {
  return TOWERS[type].range + run.mods.range + run.mods.type[type].range + (cellAt(info, cx, cy) === 'hill' ? 1 : 0);
}

function bestCell(run: RunState, info: MapInfo, type: TowerId): { x: number; y: number; cov: number } | null {
  let best: { x: number; y: number; cov: number } | null = null;
  for (let cy = 0; cy < CELLS; cy++)
    for (let cx = 0; cx < CELLS; cx++) {
      if (!canBuildAt(run, cx, cy)) continue;
      const cov = coverage(run, info, type, cx, cy, rangeFor(run, info, type, cx, cy));
      if (!best || cov > best.cov) best = { x: cx, y: cy, cov };
    }
  return best;
}

const BRANCH: Record<TowerId, number> = { ballista: 0, mortar: 0, frost: 0, tesla: 0, flame: 0 };

/** Spend gold. Returns the number of actions taken. */
export function botSpend(run: RunState, policy: Policy, rng: Rng): number {
  const info = mapInfo(run);
  let acts = 0;
  if (policy === 'weak') {
    for (let k = 0; k < 10; k++) {
      const type = rng.pick(run.have);
      if (run.gold < buildCost(run, type)) break;
      const cells: { x: number; y: number }[] = [];
      for (let cy = 0; cy < CELLS; cy++)
        for (let cx = 0; cx < CELLS; cx++) if (canBuildAt(run, cx, cy) && coverage(run, info, type, cx, cy, 2.2) > 0) cells.push({ x: cx, y: cy });
      if (!cells.length) break;
      const c = rng.pick(cells);
      if (build(run, type, c.x, c.y)) acts++;
    }
    return acts;
  }
  for (let k = 0; k < 30; k++) {
    let bestV = 0;
    let doIt: (() => boolean) | null = null;
    let need = 0;
    const counts = new Map<TowerId, number>();
    for (const t of run.towers) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
    const n = run.towers.length;
    for (const type of run.have) {
      const c = bestCell(run, info, type);
      if (!c || c.cov < 4) continue;
      const cnt = counts.get(type) ?? 0;
      let mix = 1 / (1 + 0.12 * cnt);
      if (type === 'mortar' && cnt > n * 0.4) mix *= 0.5;
      if (type === 'frost' && cnt >= 2 + run.wave / 15) mix *= 0.3;
      const cost = buildCost(run, type);
      const v = (c.cov * VALUE[type] * mix * run.mods.type[type].dmg) / cost;
      if (v > bestV) {
        bestV = v;
        need = cost;
        doIt = () => !!build(run, type, c.x, c.y);
      }
    }
    for (const t of run.towers) {
      const cost = upgradeCost(run, t);
      if (!cost) continue;
      const s = towerStats(run, t, info);
      const cov = coverage(run, info, t.type, t.x, t.y, s.range);
      const v = (cov * VALUE[t.type] * 0.55 * Math.pow(1.35, t.lvl - 1) * run.mods.type[t.type].dmg) / cost;
      if (v > bestV) {
        bestV = v;
        need = cost;
        const tt: Tower = t;
        doIt = () => upgrade(run, tt, BRANCH[tt.type]);
      }
    }
    if (!doIt || run.gold < need) break;
    if (doIt()) acts++;
    else break;
  }
  return acts;
}

export function botCard(run: RunState, policy: Policy, rng: Rng): number {
  const offers = run.offers ?? [];
  if (!offers.length) return -1;
  if (policy === 'weak') return rng.int(0, offers.length - 1);
  const spent = new Map<TowerId, number>();
  for (const t of run.towers) spent.set(t.type, (spent.get(t.type) ?? 0) + t.spent);
  const top = [...spent.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const score = (o: Offer): number => {
    const low = run.core < run.coreMax * 0.6;
    switch (o.id) {
      case 'unlock':
        return run.have.length < 3 ? 10 : 3;
      case 'arsenal':
      case 'overclock':
        return 9;
      case 'veteran':
        return 8;
      case 'fortress':
        return low ? 9.5 : 3;
      case 'golden':
        return run.wave < 30 ? 7 : 3;
      case 'tdmg':
        return o.arg === top ? 6.5 : 3;
      case 'trate':
        return o.arg === top ? 6 : 2.5;
      case 'walls':
        return low ? 8 : 1;
      case 'sharp':
        return 5;
      case 'drill':
        return 4;
      case 'bounty':
        return run.wave < 25 ? 5 : 2;
      case 'gold':
        return 4.5;
      case 'engineers':
        return 4;
      case 'interest':
        return run.wave < 20 ? 3.5 : 1;
      default:
        return 2;
    }
  };
  let best = 0;
  offers.forEach((o, i) => {
    if (score(o) > score(offers[best])) best = i;
  });
  return best;
}
