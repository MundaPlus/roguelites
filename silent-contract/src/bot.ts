/** Bots for tests and balance: one mission action at a time, plus campaign choices. */
import { GADGETS, GUARDS, type GadgetId, type ImplantId } from './data';
import {
  active,
  agentOptions,
  apply,
  agentPaths,
  agentVision,
  awake,
  camCone,
  check,
  guardIntent,
  guardShown,
  idx,
  knownDanger,
  level,
  plannedCone,
  type Action,
  type Mission,
} from './engine';
import { COVER, DOOR, DX, DY, EXIT, LOCK, coneTiles, dist2, distMap, isWalk } from './grid';
import { buy, canBuy, installPending, train, trainCost, type RunState } from './run';

/** Tiles that will be watched during the next enemy phase (known guards only). */
export function threatMap(m: Mission, vis: Uint8Array): Uint8Array {
  const th = new Uint8Array(m.W * m.H);
  for (const g of m.guards) {
    if (!guardShown(m, g, vis)) continue;
    if (g.state === 'ko' && g.ko <= 1) {
      // About to wake up and look around.
      for (const d of [0, 1, 2, 3]) for (const i of coneTiles(m, g.x, g.y, d, GUARDS[g.kind].range + 1)) th[i] = 1;
      continue;
    }
    if (!awake(g)) continue;
    const it = guardIntent(m, g);
    for (const i of plannedCone(m, g, it)) th[i] = 1;
    // Guards may also turn after reaching their goal.
    if (g.state !== 'patrol') {
      const last = it.path.length ? it.path[it.path.length - 1] : idx(m, g.x, g.y);
      const lx = last % m.W;
      const ly = (last / m.W) | 0;
      for (let y = ly - 2; y <= ly + 2; y++)
        for (let x = lx - 2; x <= lx + 2; x++) if (x >= 0 && y >= 0 && x < m.W && y < m.H) th[idx(m, x, y)] = 1;
    }
  }
  for (const o of m.objs) if (o.kind === 'camera' && m.seen[idx(m, o.x, o.y)]) for (const i of camCone(m, o)) th[i] = 1;
  return th;
}

function goalTiles(m: Mission, k: number): number[] {
  const solid = (i: number) => m.t[i] === COVER || m.objs.some((o) => o.kind !== 'camera' && idx(m, o.x, o.y) === i);
  const around = (x: number, y: number): number[] => {
    const out: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
      const i = idx(m, nx, ny);
      if (isWalk(m.t[i]) && !solid(i)) out.push(i);
    }
    return out;
  };
  const occupied = (i: number) => m.agents.some((a, j) => j !== k && !a.out && idx(m, a.x, a.y) === i);
  if (m.goal) return m.t.map((c, i) => (c === EXIT && !occupied(i) ? i : -1)).filter((i) => i >= 0);
  const target = m.objs.find((o) => o.kind === 'target')!;
  const out: number[] = [];
  if (m.pwr >= target.lock) out.push(...around(target.x, target.y));
  else {
    for (const o of m.objs) if (o.kind === 'terminal' && !o.used && m.seen[idx(m, o.x, o.y)]) out.push(...around(o.x, o.y));
    if (!out.length) {
      // Explore: known walkable tiles next to unknown ones.
      for (let i = 0; i < m.t.length; i++) {
        if (!m.seen[i] || !isWalk(m.t[i]) || solid(i)) continue;
        const x = i % m.W;
        const y = (i / m.W) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d];
          const ny = y + DY[d];
          if (nx >= 0 && ny >= 0 && nx < m.W && ny < m.H && !m.seen[idx(m, nx, ny)]) {
            out.push(i);
            break;
          }
        }
      }
    }
    if (!out.length) out.push(...around(target.x, target.y));
  }
  // Safes on the way, when power allows.
  const reserve = m.goal ? 0 : target.lock;
  for (const o of m.objs) if (o.kind === 'safe' && !o.used && m.seen[idx(m, o.x, o.y)] && m.pwr - reserve >= o.lock) out.push(...around(o.x, o.y));
  return out.filter((i) => !occupied(i));
}

/** One action for the current mission. `smart` avoids cones, uses takedowns and gadgets. */
export function botAction(m: Mission, smart: boolean): Action {
  if (m.over) return { t: 'end' };
  const live = m.agents.filter(active);
  if (m.goal && live.length && live.every((a) => m.t[idx(m, a.x, a.y)] === EXIT)) return { t: 'escape' };
  // Give up and leave if things went bad and the team stands on the pad.
  if (!m.goal && level(m) >= 6 && live.length && live.every((a) => m.t[idx(m, a.x, a.y)] === EXIT)) return { t: 'escape' };
  const vis = agentVision(m);
  const danger = smart ? knownDanger(m, vis) : undefined;
  // Smart agents do not walk through closed doors they did not peek through this turn.
  if (danger) for (let i = 0; i < m.t.length; i++) if (((m.t[i] === DOOR || m.t[i] === LOCK) && !m.peek.includes(i)) || !m.seen[i]) danger[i] = 1;
  const threat = smart ? threatMap(m, vis) : new Uint8Array(m.W * m.H);
  const target = m.objs.find((o) => o.kind === 'target')!;
  const reserve = m.goal ? 0 : target.lock;
  for (let k = 0; k < m.agents.length; k++) {
    const a = m.agents[k];
    if (!active(a) || a.ap <= 0) continue;
    const opts = agentOptions(m, k);
    const pick = (f: (o: (typeof opts)[number]) => boolean) => opts.find(f)?.act;
    const revive = pick((o) => o.act.t === 'revive');
    if (revive && revive.t === 'revive') {
      const b = m.agents[revive.b];
      if (!smart || (!danger![idx(m, b.x, b.y)] && !threat[idx(m, b.x, b.y)])) return revive;
    }
    for (const o of opts) {
      if (o.act.t !== 'use') continue;
      const obj = m.objs.find((q) => q.id === (o.act as { obj: number }).obj)!;
      if (obj.kind === 'terminal' || obj.kind === 'target') return o.act;
      if (obj.kind === 'safe' && m.pwr - reserve >= obj.lock) return o.act;
    }
    if (smart) {
      const td = pick((o) => o.act.t === 'takedown');
      if (td) return td;
      // Gadgets.
      for (let s = 0; s < a.gadgets.length; s++) {
        const gd = a.gadgets[s];
        if (gd.n <= 0 || a.ap < GADGETS[gd.id].ap) continue;
        const use = (at: number): Action | null => {
          const act: Action = { t: 'gadget', a: k, slot: s, at };
          return check(m, act) ? null : act;
        };
        const here = idx(m, a.x, a.y);
        if (gd.id === 'buster' && m.pwr < reserve) return use(here)!;
        if (gd.id === 'medkit' && a.hp < a.maxHp - 1) {
          const u = use(here);
          if (u) return u;
        }
        if (gd.id === 'dart' || gd.id === 'taser') {
          for (const g of m.guards) {
            if (!awake(g) || GUARDS[g.kind].mech) continue;
            if (gd.id === 'dart' && g.state !== 'chase' && !threat[here]) continue;
            const u = use(idx(m, g.x, g.y));
            if (u) return u;
          }
        }
        if (gd.id === 'emp' && m.guards.some((g) => GUARDS[g.kind].mech && awake(g) && dist2(g.x, g.y, a.x, a.y) <= 16)) return use(here) ?? { t: 'end' };
      }
      // Hack visible cameras with spare power.
      for (const o of m.objs) {
        if (o.kind !== 'camera' || o.off > 0 || m.pwr - reserve < 1) continue;
        const act: Action = { t: 'hack', obj: o.id };
        if (!check(m, act) && dist2(o.x, o.y, a.x, a.y) <= 30) return act;
      }
    }
    const here0 = idx(m, a.x, a.y);
    // Walk up to a known guard and knock it out this turn.
    if (smart) {
      const tdc = a.implants.includes('reflex') ? 1 : 2;
      const tas = a.gadgets.findIndex((g) => g.id === 'taser' && g.n > 0);
      const { key: k2, prev: _p } = agentPaths(m, k, danger);
      void _p;
      let bestT = -1;
      let bestC = 1e9;
      for (const g of m.guards) {
        if (!awake(g) || GUARDS[g.kind].mech || !guardShown(m, g, vis)) continue;
        const armored = GUARDS[g.kind].armor > 0 && a.combat < 3;
        if (armored && tas < 0) continue;
        const need = armored ? GADGETS.taser.ap : tdc;
        const hunting = g.state === 'chase';
        for (let d = 0; d < 4; d++) {
          const nx = g.x + DX[d];
          const ny = g.y + DY[d];
          if (nx < 0 || ny < 0 || nx >= m.W || ny >= m.H) continue;
          const i = idx(m, nx, ny);
          if (k2[i] < 0 || i === here0) continue;
          const cost = Math.floor(k2[i] / 1000);
          const dz = k2[i] % 1000;
          if (cost + need > a.ap) continue;
          if (dz > 0 && !(hunting && danger![here0] && a.hp > GUARDS[g.kind].dmg)) continue;
          if (threat[i] && !hunting && g.state === 'patrol' && dz > 0) continue;
          if (m.agents.some((b, j) => j !== k && !b.out && idx(m, b.x, b.y) === i)) continue;
          const c = cost + dz * 3;
          if (c < bestC) {
            bestC = c;
            bestT = i;
          }
        }
      }
      if (bestT >= 0 && bestC <= 6) return { t: 'move', a: k, to: bestT };
    }
    // Peek through closed doors that lead to unknown rooms.
    if (smart && a.ap >= 2) {
      for (const o of opts) {
        if (o.act.t !== 'peek') continue;
        const at = o.act.at;
        if (m.peek.includes(at)) continue;
        const dx = at % m.W;
        const dy = (at / m.W) | 0;
        let unknown = 0;
        for (let y = dy - 2; y <= dy + 2; y++)
          for (let x = dx - 2; x <= dx + 2; x++) if (x >= 0 && y >= 0 && x < m.W && y < m.H && !m.seen[idx(m, x, y)]) unknown++;
        if (unknown >= 3) return o.act;
      }
    }
    // Movement.
    const goals = goalTiles(m, k);
    if (!goals.length) continue;
    const solid = (i: number) => m.t[i] === COVER || m.objs.some((o) => o.kind !== 'camera' && idx(m, o.x, o.y) === i);
    const gd = distMap(m, goals, solid);
    const { key } = agentPaths(m, k, danger);
    const here = here0;
    const W_T = m.goal || level(m) >= 4 ? 10 : 25;
    const inDanger = smart && danger![here] > 0;
    const score = (i: number) => (gd[i] < 0 ? 999 : gd[i]) + (smart ? (threat[i] ? W_T : 0) + (danger![i] ? W_T : 0) + (key[i] % 1000) * 3 : 0);
    let best = here;
    let bs = score(here) - (smart ? (key[here] % 1000) * 3 : 0);
    if (m.goal && m.t[here] !== EXIT) {
      // Rush the exit pad when it is in reach.
      let ex = -1;
      let ec = 1e9;
      for (const i of goals) {
        const c = key[i] < 0 ? 1e9 : Math.floor(key[i] / 1000);
        if (c <= a.ap && c < ec) {
          ec = c;
          ex = i;
        }
      }
      if (ex >= 0) return { t: 'move', a: k, to: ex };
    }
    const cands: { i: number; sc: number }[] = [];
    for (let i = 0; i < key.length; i++) {
      if (key[i] < 0 || i === here) continue;
      const cost = Math.floor(key[i] / 1000);
      if (cost > a.ap) continue;
      if (smart && !inDanger && key[i] % 1000 > 0) continue;
      if (m.agents.some((b, j) => j !== k && !b.out && idx(m, b.x, b.y) === i)) continue;
      const sc = score(i) + cost * 0.01;
      if (sc < bs - 0.001) cands.push({ i, sc });
    }
    cands.sort((p, q) => p.sc - q.sc);
    if (!smart) {
      if (cands.length) best = cands[0].i;
    } else {
      // Check the best few by playing the move: doors open and chasers react.
      let real = bs;
      for (const c of cands.slice(0, 6)) {
        const sim = apply(m, { t: 'move', a: k, to: c.i });
        const sa = sim.agents[k];
        const at = idx(sim, sa.x, sa.y);
        const th2 = threatMap(sim, agentVision(sim));
        const sc = (gd[at] < 0 ? 999 : gd[at]) + (th2[at] ? W_T : 0) + (sim.spots > m.spots ? W_T : 0) + Math.floor(key[c.i] / 1000) * 0.01;
        if (sc < real - 0.001) {
          real = sc;
          best = c.i;
        }
      }
    }
    if (best !== here) return { t: 'move', a: k, to: best };
    // Blocked by a door on the way: peek through it first.
    if (smart && a.ap >= 2) {
      for (const o of opts) {
        if (o.act.t !== 'peek' || m.peek.includes(o.act.at)) continue;
        const dd = gd[o.act.at];
        if (dd >= 0 && dd < gd[here]) return o.act;
      }
    }
    if (smart) {
      // Stuck: hack a camera in sight, even with power saved for the target.
      for (const o of m.objs) {
        const act: Action = { t: 'hack', obj: o.id };
        if (o.kind === 'camera' && !check(m, act)) return act;
      }
      // Under pressure, take the risky way.
      if (level(m) >= 4 || m.turn > 16) {
        let rb = here;
        let rs = gd[here] < 0 ? 999 : gd[here];
        for (let i = 0; i < key.length; i++) {
          if (key[i] < 0 || i === here || Math.floor(key[i] / 1000) > a.ap) continue;
          if (m.agents.some((b, j) => j !== k && !b.out && idx(m, b.x, b.y) === i)) continue;
          const sc = (gd[i] < 0 ? 999 : gd[i]) + (threat[i] ? 3 : 0);
          if (sc < rs) {
            rs = sc;
            rb = i;
          }
        }
        if (rb !== here) return { t: 'move', a: k, to: rb };
      }
    }
    if (smart && threat[here]) {
      for (let s = 0; s < a.gadgets.length; s++) {
        const g = a.gadgets[s];
        if (g.n > 0 && (g.id === 'cloak' || g.id === 'smoke') && a.ap >= GADGETS[g.id].ap) {
          const act: Action = { t: 'gadget', a: k, slot: s, at: here };
          if (!check(m, act)) return act;
        }
      }
    }
  }
  return { t: 'end' };
}

// ---------- Campaign choices ----------

export function botPickOffer(r: RunState, smart: boolean): number {
  if (!smart || r.offers.length === 1) return 0;
  let best = 0;
  let bs = -1e9;
  r.offers.forEach((o, i) => {
    let s = -o.stars * 30;
    if (o.kind === 'cell' && r.roster.length < 3) s += 60;
    if (o.kind === 'bank') s += 20;
    if (s > bs) {
      bs = s;
      best = i;
    }
  });
  return best;
}

const WANT: GadgetId[] = ['cloak', 'dart', 'medkit', 'taser', 'smoke', 'emp', 'buster', 'tag', 'keycard', 'noise'];
const WANT_IMP: ImplantId[] = ['servo', 'plate', 'reflex', 'cortex', 'sense', 'nerve', 'pocket', 'siphon'];

/** Spend credits in the safehouse. Returns after all purchases. */
export function botShop(r: RunState, smart: boolean): void {
  if (r.pending) for (let k = 0; k < r.roster.length && r.pending; k++) installPending(r, k);
  if (!smart) return;
  // Hire first.
  r.shop.forEach((it, i) => {
    if (it.kind === 'agent' && r.roster.length < 3) buy(r, i, 0);
  });
  const items = r.shop.map((it, i) => ({ it, i }));
  items.sort((x, y) => {
    const rank = (it: (typeof r.shop)[number]) => (it.kind === 'gadget' ? WANT.indexOf(it.id as GadgetId) : it.kind === 'implant' ? WANT_IMP.indexOf(it.id as ImplantId) + 2 : 99);
    return rank(x.it) - rank(y.it);
  });
  for (const { it, i } of items) {
    if (it.kind === 'agent') continue;
    if (it.kind === 'implant' && WANT_IMP.indexOf(it.id as ImplantId) > 3) continue;
    if (it.kind === 'gadget' && WANT.indexOf(it.id as GadgetId) > 5) continue;
    for (let k = 0; k < r.roster.length; k++) if (!canBuy(r, it, k) && r.credits - it.price >= 40) buy(r, i, k);
  }
  // Train hacking on the best hacker.
  const hk = [...r.roster.keys()].sort((x, y) => r.roster[y].hack - r.roster[x].hack)[0];
  if (hk !== undefined && trainCost(r.roster[hk], 'hack') && r.credits - trainCost(r.roster[hk], 'hack') >= 60) train(r, hk, 'hack');
}
