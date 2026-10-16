/** Simple bots for the headless balance sim and the debug API. */
import { EVENT_MAP, SYSTEMS, WEAPONS, type Outcome, type SysId } from './data';
import { DT, tick, type Combat } from './combat';
import { Rng } from './rng';
import {
  FUEL_COST,
  FLEET_STEP,
  MAX_CREW,
  MAX_WEAPONS,
  MISSILE_COST,
  buyFuel,
  buyHull,
  buyItem,
  buyMissile,
  choose,
  endCombat,
  hullCost,
  newRun,
  jump,
  proceed,
  upgradeReactor,
  upgradeSys,
  type RunState,
} from './run';
import { autoPower, layoutOf, reactorCost, toggleWeapon, upgradeCost, type Ship } from './ship';

export type BotLevel = 'weak' | 'good';

// ---------- Combat ----------

export function botSetup(c: Combat, level: BotLevel): void {
  if (level !== 'good') return;
  const p = c.player;
  for (const s of Object.values(p.systems)) if (s && s.id !== 'pilot') (s.power = 0), (s.want = 0);
  p.weapons.forEach((w) => ((w.powered = false), (w.want = false)));
  autoPower(p, ['shields', 'weapons', 'oxygen', 'engines', 'medbay']);
  p.shields = Math.floor((p.systems.shields?.power ?? 0) / 2);
}

export function botThink(c: Combat, level: BotLevel, rng: Rng): void {
  const P = c.player;
  const E = c.enemy;
  const rooms = layoutOf(E.layout).def.rooms;
  if (level === 'weak') {
    P.weapons.forEach((w) => {
      if (w.target === null) w.target = rng.int(0, rooms.length - 1);
    });
    return;
  }
  // Power any weapon that is off but fits.
  P.weapons.forEach((w, i) => {
    if (!w.powered) toggleWeapon(P, i);
  });
  const sh = E.systems.shields;
  const shRoom = sh?.room ?? 0;
  const wRoom = E.systems.weapons?.room ?? shRoom;
  const L = E.shields;
  const shieldsUp = !!sh && sh.level - sh.dmg >= 2;
  const primary = shieldsUp ? shRoom : wRoom;
  const lasers = P.weapons.filter((w) => w.powered && ['laser', 'flak'].includes(WEAPONS[w.id].kind));
  const shots = lasers.reduce((a, w) => a + WEAPONS[w.id].shots, 0);
  const ready = lasers.every((w) => w.charge >= 1);
  for (const w of P.weapons) {
    const d = WEAPONS[w.id];
    if (!w.powered) continue;
    if (d.kind === 'ion') w.target = sh ? shRoom : wRoom;
    else if (d.kind === 'missile') w.target = L > 0 || c.boss || P.missiles > 8 ? primary : null;
    else if (d.kind === 'beam') w.target = L === 0 || d.dmg > L ? wRoom : null;
    else w.target = L === 0 || (ready && shots > 0) ? primary : null;
  }
  if (P.hull <= 5 && P.ftl >= 1 && c.boss === 0 && E.hull > 4) c.fleeing = true;
}

/** Play a whole fight with the bot. Returns the combat time. */
export function botFight(c: Combat, level: BotLevel, rng: Rng, maxT = 600): void {
  botSetup(c, level);
  c.paused = false;
  let think = 0;
  while (!c.result) {
    if (think <= 0) {
      botThink(c, level, rng);
      think = 0.5;
    }
    tick(c, DT);
    think -= DT;
    if (c.t > maxT) {
      if (c.boss) c.result = 'lose';
      else c.result = 'fled';
    }
    if (c.ev.length > 100) c.ev.length = 0;
  }
}

// ---------- Map, events, store ----------

function hops(run: RunState, from: number, to: number): number {
  const seen = new Map([[from, 0]]);
  const q = [from];
  while (q.length) {
    const t = q.shift()!;
    if (t === to) return seen.get(t)!;
    for (const n of run.map[t].nb)
      if (!seen.has(n)) {
        seen.set(n, seen.get(t)! + 1);
        q.push(n);
      }
  }
  return 99;
}

export function botMap(run: RunState, level: BotLevel, rng: Rng): number {
  const here = run.map[run.at];
  void level;
  const exit = 1;
  const exitB = run.map[exit];
  const margin = (exitB.x - run.fleet) / 0.075;
  let best = here.nb[0];
  let bs = -Infinity;
  for (const n of here.nb) {
    const b = run.map[n];
    const d = hops(run, n, exit);
    let s = -d * 0.6;
    if (b.x < run.fleet + FLEET_STEP && b.kind !== 'start') s -= 50;
    const rush = margin < d + 3 || run.fuel < d + 2;
    if (rush) s -= d * 5;
    else if (run.fuel < 5 && b.kind === 'store' && run.scrap >= 12) s += 8;
    else {
      s += b.visited ? -1.5 : 3;
      if (b.kind === 'store' && run.scrap >= 45) s += 2.5;
      if (b.x < run.fleet + 0.12) s -= 3;
    }
    if (n === exit && !rush && margin > d + 5) s -= 2;
    s += rng.next() * 0.3;
    if (s > bs) {
      bs = s;
      best = n;
    }
  }
  return best;
}

function value(run: RunState, o: Outcome): number {
  let v = 0;
  const s = run.ship;
  if (o.scrap) v += (o.scrap[0] + o.scrap[1]) / 2;
  if (o.fuel) v += o.fuel * (run.fuel < 5 ? 8 : 3);
  if (o.missiles) v += o.missiles * 2;
  if (o.hull) v += o.hull * (o.hull < 0 ? 4 : s.hull < s.maxHull ? 3 : 0);
  if (o.crewGain) v += s.crew.length < 5 ? 45 : 15;
  if (o.weapon) v += 30;
  if (o.augment) v += 30;
  if (o.upgrade) v += 40;
  if (o.hurt) v -= o.hurt * 0.1;
  if (o.crewLose) v -= 70;
  if (o.fight) v += s.hull > s.maxHull * 0.5 ? 18 + (o.bonus ?? 0) : -25;
  if (o.store) v += 10;
  return v;
}

export function botEvent(run: RunState, level: BotLevel, rng: Rng): number {
  const n = run.node;
  if (!n || n.kind !== 'event') return 0;
  const ok = n.choices.map((c, i) => [c, i] as const).filter(([c]) => c.ok);
  if (!ok.length) return 0;
  if (level === 'weak') return rng.pick(ok)[1];
  const sector = ok.find(([c]) => c.act === 'sector' || c.act.startsWith('fight:'));
  if (sector) return sector[1];
  const ev = EVENT_MAP[n.id];
  if (!ev) return ok[0][1];
  let best = ok[0][1];
  let bv = -Infinity;
  for (const [c, i] of ok) {
    const ch = ev.choices[Number(c.act.slice(1))];
    const tot = ch.out.reduce((a, [, w]) => a + w, 0);
    let v = ch.out.reduce((a, [o, w]) => a + (value(run, o) * w) / tot, 0);
    v -= (ch.pay?.scrap ?? 0) + (ch.pay?.fuel ?? 0) * (run.fuel < 10 ? 30 : 6);
    if (v > bv) {
      bv = v;
      best = i;
    }
  }
  return best;
}

const W_VALUE: Record<string, number> = { burst2: 9, heavy2: 9, halberd: 8, breach: 7, chain: 8, heavy1: 7, burst1: 6, pike: 6, artemis: 6, flak: 6, ion2: 6, ion1: 5, basic: 3, leto: 3, minibeam: 3, firebeam: 4 };

export function botStore(run: RunState, level: BotLevel): void {
  const s = run.ship;
  const st = run.map[run.at].store ?? [];
  if (level === 'weak') {
    if (s.hull < s.maxHull * 0.5) buyHull(run, 8);
    while (run.fuel < 3 && buyFuel(run)) {
      /* buy */
    }
    return;
  }
  while (run.fuel < 8 && run.scrap >= FUEL_COST && buyFuel(run)) {
    /* buy */
  }
  if (s.hull < s.maxHull * 0.8) buyHull(run, s.maxHull - s.hull);
  while (run.fuel < 10 && run.scrap >= FUEL_COST && buyFuel(run)) {
    /* buy */
  }
  const usesMissiles = s.weapons.some((w) => WEAPONS[w.id].kind === 'missile');
  while (usesMissiles && s.missiles < 6 && run.scrap >= MISSILE_COST && buyMissile(run)) {
    /* buy */
  }
  st.forEach((it, i) => {
    if (it.sold || run.scrap < it.cost) return;
    if (it.kind === 'weapon') {
      const worst = Math.min(...s.weapons.map((w) => W_VALUE[w.id] ?? 3));
      if (s.weapons.length < MAX_WEAPONS ? (W_VALUE[it.id] ?? 3) >= 5 : false) buyItem(run, i);
      else if (s.weapons.length >= MAX_WEAPONS && (W_VALUE[it.id] ?? 3) > worst + 2) {
        const wi = s.weapons.findIndex((w) => (W_VALUE[w.id] ?? 3) === worst);
        s.weapons.splice(wi, 1);
        buyItem(run, i);
      }
    } else if (it.kind === 'crew' && s.crew.length < Math.min(MAX_CREW, 5)) buyItem(run, i);
    else if (it.kind === 'augment' && run.scrap > it.cost + 40) buyItem(run, i);
  });
  botUpgrade(run, level);
}

function needReactor(s: Ship): number {
  const lv = (id: SysId): number => s.systems[id]?.level ?? 0;
  const wNeed = s.weapons.reduce((a, w) => a + WEAPONS[w.id].power, 0);
  return lv('shields') + Math.min(lv('engines'), 4) + 1 + 1 + Math.min(wNeed, lv('weapons'));
}

export function botUpgrade(run: RunState, level: BotLevel): void {
  if (level === 'weak') return;
  const s = run.ship;
  const reserve = (s.hull < s.maxHull * 0.6 ? 10 * hullCost(run) : 0) + Math.max(0, 9 - run.fuel) * FUEL_COST;
  for (let guard = 0; guard < 20; guard++) {
    const lv = (id: SysId): number => s.systems[id]?.level ?? 0;
    const wNeed = s.weapons.reduce((a, w) => a + WEAPONS[w.id].power, 0);
    let pick: SysId | 'reactor' | null = null;
    const shieldGoal = run.sector >= 3 ? 6 : 4;
    if (lv('weapons') < wNeed) pick = 'weapons';
    else if (lv('shields') < shieldGoal) pick = 'shields';
    else if (s.reactor < needReactor(s)) pick = 'reactor';
    else if (lv('engines') < 4) pick = 'engines';
    else if (lv('pilot') < 2) pick = 'pilot';
    else if (lv('shields') < 8 && run.sector >= 4) pick = 'shields';
    if (pick !== 'reactor' && s.reactor < needReactor(s) && pick !== 'weapons') pick = 'reactor';
    if (!pick) return;
    const cost = pick === 'reactor' ? reactorCost(s.reactor) : upgradeCost(pick, lv(pick));
    if (run.scrap - cost < reserve) return;
    const ok = pick === 'reactor' ? upgradeReactor(run) : upgradeSys(run, pick);
    if (!ok) return;
    if (pick !== 'reactor' && lv(pick) >= SYSTEMS[pick].max) return;
  }
}

// ---------- Whole run (sim) ----------

export interface SimResult {
  victory: boolean;
  sector: number;
  score: number;
  kills: number;
  jumps: number;
  cause: string;
}

export function playRun(seed: string, level: BotLevel, shipId = 'kestrel', trace?: (r: RunState) => void): SimResult {
  const run = newRun(shipId, seed);
  const rng = new Rng(seed.length * 977 + seed.charCodeAt(0));
  let cause = '';
  for (let guard = 0; guard < 3000 && !run.over; guard++) {
    if (run.combat) {
      const c = run.combat;
      const h0 = run.ship.hull;
      botFight(c, level, rng);
      if (c.tpl === 'flagship' && trace) trace({ ...run, flag: { h0, res: c.result, boss: c.boss, t: c.t, eh: c.enemy.hull } } as RunState);
      if (c.result === 'lose') cause = `${c.tpl} s${run.sector + 1}${run.ship.crew.length ? '' : ' crew'}`;
      endCombat(run);
      continue;
    }
    const n = run.node;
    if (n) {
      if (n.kind === 'event') {
        if (n.result || !n.choices.length) proceed(run);
        else choose(run, botEvent(run, level, rng));
      } else if (n.kind === 'store') {
        botStore(run, level);
        proceed(run);
      } else proceed(run);
      if (run.over && !cause) cause = 'event';
      continue;
    }
    botUpgrade(run, level);
    if (trace) trace(run);
    jump(run, botMap(run, level, rng));
    if (run.over && !cause) cause = 'fuel';
  }
  return { victory: !!run.over?.victory, sector: run.sector + 1, score: run.over?.score ?? 0, kills: run.stats.kills, jumps: run.stats.jumps, cause: run.over ? cause : 'stuck' };
}
