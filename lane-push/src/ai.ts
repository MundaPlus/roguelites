/**
 * Shared tactics for the enemy AI and the player bots.
 * The AI only acts through `deploy`, with its own hand and energy.
 */
import { CARDS, lvlMult, type CardDef } from './data';
import {
  CAMP_Y,
  E_MAX_Y,
  E_MIN_Y,
  LANE_X,
  P_MAX_Y,
  P_MIN_Y,
  TOWER_Y,
  cardLevel,
  cluster,
  deploy,
  laneTower,
  tick,
  type Battle,
  type Ent,
  type Team,
} from './sim';

export interface Threat {
  lane: number;
  units: Ent[];
  power: number;
  airPower: number;
  swarm: number;
  tank: boolean;
  /** Y of the most advanced attacker. */
  front: number;
}

export const power = (e: Ent): number => e.hp + (e.dmg / e.rate) * 6;

const isSwarm = (e: Ent): boolean => e.maxHp < 260;
const tankish = (c: CardDef): boolean => c.type === 'unit' && c.tags.some((t) => t === 'tank' || t === 'mini-tank' || t === 'siege');

/** Units of the other team that push toward `def` in each lane. */
export function threats(b: Battle, def: Team): Threat[] {
  const out: Threat[] = [];
  for (let lane = 0; lane < 3; lane++) {
    const units = b.ents.filter((e) => e.kind === 'unit' && e.team !== def && e.lane === lane && e.hp > 0 && (def === 1 ? e.y < 400 : e.y > 250));
    if (!units.length) continue;
    out.push({
      lane,
      units,
      power: units.reduce((a, e) => a + power(e), 0),
      airPower: units.filter((e) => e.air).reduce((a, e) => a + power(e), 0),
      swarm: units.filter(isSwarm).length,
      tank: units.some((e) => e.maxHp >= 1400 || e.targets === 'buildings'),
      front: def === 1 ? Math.min(...units.map((e) => e.y)) : Math.max(...units.map((e) => e.y)),
    });
  }
  return out.sort((a, z) => z.power - a.power);
}

/** Power of `def` units already near the front of a threat. */
export function defense(b: Battle, def: Team, t: Threat): number {
  let p = 0;
  for (const e of b.ents) {
    if (e.team !== def || e.kind !== 'unit' || e.lane !== t.lane || e.hp <= 0) continue;
    if (e.targets === 'buildings') continue;
    if (def === 1 ? e.y < t.front + 60 : e.y > t.front - 60) p += power(e);
  }
  if (def === 1) {
    const tw = laneTower(b, t.lane);
    if (tw && t.front < TOWER_Y + 150) p += 450;
  }
  return p;
}

/** How well a unit card answers a threat. Higher is better. */
export function counterScore(c: CardDef, lvl: number, t: Threat): number {
  if (c.type !== 'unit') return -999;
  const st = c.unit!;
  const n = st.count ?? 1;
  const m = lvlMult(lvl);
  let s = 10;
  const airShare = t.power ? t.airPower / t.power : 0;
  if (st.targets === 'buildings') return -500;
  if (st.targets !== 'any') s -= 140 * airShare;
  else s += 30 * airShare;
  if (t.swarm >= 3) {
    if (st.splash) s += 45;
    else if (n >= 3) s -= 10;
  }
  const dps = ((st.dmg * m) / st.rate) * n;
  if (t.tank) {
    if (dps >= 90) s += 30;
    if (n >= 3 && !st.air) s += 20;
  }
  s += Math.min(35, (st.hp * m * n) / 70);
  s += Math.min(30, dps / 5);
  s -= c.cost * 6;
  return s;
}

/** Value of a damage spell at the best spot. */
export function spellTarget(b: Battle, team: Team, c: CardDef, lvl: number): { x: number; y: number; value: number } | null {
  const s = c.spell!;
  const foe: Team = team === 0 ? 1 : 0;
  const mul = lvlMult(lvl) * b.sides[team].spellMul;
  if (s.dmg) {
    const cl = cluster(b, foe, s.radius * 0.9);
    if (!cl) return null;
    const dmg = s.dmg * mul;
    let value = 0;
    const hits = b.ents.filter((e) => e.team === foe && e.hp > 0 && Math.hypot(e.x - cl.x, e.y - cl.y) <= s.radius + e.r * 0.5);
    if (s.bolts) {
      hits.sort((a, z) => z.hp - a.hp);
      for (const e of hits.slice(0, s.bolts)) value += Math.min(e.hp, dmg * (e.kind === 'tower' ? 0.35 : 1));
    } else for (const e of hits) value += Math.min(e.hp, dmg * (e.kind === 'tower' ? 0.35 : 1)) + (e.hp <= dmg ? 40 : 0);
    return { x: cl.x, y: cl.y, value };
  }
  return null;
}

function placeY(def: Team, c: CardDef, front: number): number {
  const ranged = (c.unit?.range ?? 0) > 40;
  if (def === 1) return Math.max(E_MIN_Y + 10, Math.min(E_MAX_Y, front - (ranged ? 75 : 35)));
  return Math.max(P_MIN_Y, Math.min(P_MAX_Y, front + (ranged ? 75 : 35)));
}

/** Try to answer the worst threat against `def`. */
function defend(b: Battle, def: Team, urgency: number): boolean {
  const side = b.sides[def];
  for (const t of threats(b, def)) {
    const d = defense(b, def, t);
    if (t.power < 200 || t.power < d * 1.15) continue;
    let best: CardDef | null = null;
    let bs = -Infinity;
    for (const id of side.hand) {
      const c = CARDS[id];
      const sc = counterScore(c, cardLevel(side, id), t);
      if (sc > bs) {
        bs = sc;
        best = c;
      }
    }
    if (!best || bs < -100) continue;
    const near = def === 1 ? t.front < TOWER_Y + 120 : t.front > CAMP_Y - 170;
    if (side.energy < best.cost) {
      if (!near && urgency < 1) return true; // save up for it
      const cheap = side.hand
        .map((id) => CARDS[id])
        .filter((c) => c.type === 'unit' && c.cost <= side.energy && counterScore(c, cardLevel(side, c.id), t) > -50)
        .sort((a, z) => counterScore(z, cardLevel(side, z.id), t) - counterScore(a, cardLevel(side, a.id), t))[0];
      if (!cheap) return true;
      best = cheap;
    }
    return deploy(b, def, best.id, LANE_X[t.lane], placeY(def, best, t.front));
  }
  return false;
}

/** Cast a damage, freeze or support spell when it is worth it. */
function useSpells(b: Battle, team: Team): boolean {
  const side = b.sides[team];
  const foe: Team = team === 0 ? 1 : 0;
  for (const id of side.hand) {
    const c = CARDS[id];
    if (c.type !== 'spell' || side.energy < c.cost) continue;
    const lvl = cardLevel(side, id);
    const s = c.spell!;
    if (s.dmg && !s.freeze) {
      const t = spellTarget(b, team, c, lvl);
      // Enemy spells only defend: they hit units on the enemy half or near the camp line.
      if (t && t.value >= c.cost * 115 && (team === 0 || t.y < 330)) return deploy(b, team, id, t.x, t.y);
      if (team === 0 && s.dmg) {
        // Finish a weak tower.
        const dmg = s.dmg * lvlMult(lvl) * side.spellMul * 0.35;
        const tw = b.ents.find((e) => e.kind === 'tower' && e.hp > 0 && e.hp <= dmg);
        if (tw) return deploy(b, team, id, tw.x, tw.y);
      }
    } else if (s.freeze) {
      if (team === 0) {
        for (const tw of b.ents.filter((e) => e.kind === 'tower' && e.hp > 0 && e.awake)) {
          const near = b.ents.filter((e) => e.team === 0 && e.hp > 0 && Math.hypot(e.x - tw.x, e.y - tw.y) < 70);
          if (near.reduce((a, e) => a + e.hp, 0) >= 900 && tw.hp > 500) return deploy(b, team, id, tw.x, tw.y + 20);
        }
      } else {
        const cl = cluster(b, foe, 50, (e) => e.y < TOWER_Y + 160);
        if (cl && cl.hp >= 1300) return deploy(b, team, id, cl.x, cl.y);
      }
    } else if (s.heal) {
      const cl = cluster(b, team, 50, (e) => e.hp < e.maxHp * 0.6);
      if (cl && cl.n >= 2) {
        const miss = b.ents.filter((e) => e.team === team && e.kind === 'unit' && Math.hypot(e.x - cl.x, e.y - cl.y) < s.radius).reduce((a, e) => a + (e.maxHp - e.hp), 0);
        if (miss >= 450) return deploy(b, team, id, cl.x, cl.y);
      }
    } else if (s.rage) {
      const cl = cluster(b, team, 50);
      if (cl && cl.hp >= 1300 && (team === 1 ? cl.y > 420 : cl.y < 260)) return deploy(b, team, id, cl.x, cl.y);
    }
  }
  return false;
}

export interface AiMem {
  t: number;
}

/** Enemy AI: defend first, spells on clusters, push with spare energy. */
export function enemyAi(b: Battle, mem: AiMem): void {
  mem.t -= 1 / 30;
  if (mem.t > 0 || b.over) return;
  mem.t = 0.45 + b.rng.next() * 0.35;
  const side = b.sides[1];
  if (useSpells(b, 1)) return;
  if (defend(b, 1, side.energy / side.max)) return;
  if (side.energy >= side.max - 0.4) {
    const units = side.hand.filter((id) => CARDS[id].type === 'unit');
    if (!units.length) return;
    const id = b.rng.pick(units);
    const counts = [0, 1, 2].map((l) => b.ents.filter((e) => e.team === 0 && e.lane === l).length + b.rng.next());
    const lane = counts.indexOf(Math.min(...counts));
    deploy(b, 1, id, LANE_X[lane], E_MAX_Y - 20);
  }
}

// ---------- Player bots (debug and balance sims) ----------

export interface BotMem {
  t: number;
  lane: number;
  supports: number;
}

export const newBotMem = (): BotMem => ({ t: 0, lane: -1, supports: 0 });

/** Weak bot: random cards into random lanes when it can pay. */
export function weakBot(b: Battle, mem: BotMem): void {
  mem.t -= 1 / 30;
  if (mem.t > 0 || b.over) return;
  mem.t = 0.8 + b.rng.next() * 1.5;
  const side = b.sides[0];
  const ok = side.hand.filter((id) => CARDS[id].cost <= side.energy);
  if (!ok.length) return;
  const id = ok[Math.floor(Math.random() * ok.length)];
  const lane = Math.floor(Math.random() * 3);
  if (CARDS[id].type === 'spell') {
    const foes = b.ents.filter((e) => e.team === 1);
    const f = foes[Math.floor(Math.random() * foes.length)];
    deploy(b, 0, id, f.x, f.y);
  } else deploy(b, 0, id, LANE_X[lane], P_MIN_Y + Math.random() * (P_MAX_Y - P_MIN_Y));
}

function pushLane(b: Battle): number {
  let best = 1;
  let bv = Infinity;
  for (let l = 0; l < 3; l++) {
    const tw = laneTower(b, l);
    const foes = b.ents.filter((e) => e.team === 1 && e.kind === 'unit' && e.lane === l).length;
    const v = (tw ? tw.hp / tw.maxHp : 0) * 10 + foes * 0.5 + (tw?.tower === 'healer' ? 4 : 0) + (tw?.tower === 'cannon' ? 1 : 0);
    if (v < bv) {
      bv = v;
      best = l;
    }
  }
  return best;
}

/** Good bot: defend breaches, one tank per push with support behind, smart spells. */
export function goodBot(b: Battle, mem: BotMem): void {
  mem.t -= 1 / 30;
  if (mem.t > 0 || b.over) return;
  mem.t = 0.3;
  const side = b.sides[0];
  if (useSpells(b, 0)) return;
  if (defend(b, 0, side.energy / side.max)) return;
  const lane = pushLane(b);
  if (lane !== mem.lane) {
    mem.lane = lane;
    mem.supports = 0;
  }
  const own = b.ents.filter((e) => e.team === 0 && e.kind === 'unit' && e.lane === lane);
  const tank = own.filter((e) => tankish(CARDS[e.card])).sort((a, z) => a.y - z.y)[0];
  const hand = side.hand.map((id) => CARDS[id]);
  if (!tank) {
    mem.supports = 0;
    const tanks = hand.filter(tankish).sort((a, z) => z.cost - a.cost);
    const t = tanks.find((c) => side.energy >= Math.min(side.max, c.cost + 3));
    if (t) {
      deploy(b, 0, t.id, LANE_X[lane], P_MAX_Y);
      return;
    }
    if (side.energy >= side.max - 0.3) {
      const cheap = hand.filter((c) => c.type === 'unit').sort((a, z) => a.cost - z.cost)[0];
      if (cheap) deploy(b, 0, cheap.id, LANE_X[lane], P_MAX_Y);
    }
    return;
  }
  if (mem.supports < 3 && tank.y > TOWER_Y + 60) {
    const sup = hand.filter((c) => c.type === 'unit' && !tankish(c) && c.cost <= side.energy).sort((a, z) => z.cost - a.cost)[0];
    if (sup) {
      if (deploy(b, 0, sup.id, LANE_X[lane], Math.max(P_MIN_Y, Math.min(P_MAX_Y, tank.y + 40)))) mem.supports++;
      return;
    }
  }
  if (side.energy >= side.max - 0.3) {
    const c = hand.filter((x) => x.type === 'unit').sort((a, z) => a.cost - z.cost)[0];
    if (c) deploy(b, 0, c.id, LANE_X[lane], P_MIN_Y);
  }
}

/** One full tick with the enemy AI (and an optional player bot). */
export function stepBattle(b: Battle, ai: AiMem, bot?: (b: Battle) => void): void {
  if (b.over) return;
  if (bot) bot(b);
  enemyAi(b, ai);
  tick(b);
}
