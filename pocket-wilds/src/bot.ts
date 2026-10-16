/** Bots for the debug API and the balance sim. `smart` plays well, `weak` picks at random. */
import { baseDamage, bestMove, catchChance, isWild, moveScore, speedOf, type Battle, type Stages } from './battle';
import { ITEMS, MOVES, SPECIES, type ItemId } from './data';
import { maxHp, power, powerOf, weakestSlot, type Mon } from './mon';
import { PLAN, TEAM_MAX, TUTOR_COST, alive, canLearn, count, type Action, type RunState } from './run';

export type BotLevel = 'weak' | 'smart';

const hpPct = (m: Mon): number => m.hp / maxHp(m);

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

/** Best attack score of a creature against the current foe. */
function matchup(b: Battle, m: Mon): number {
  const f = b.f[b.fi];
  const zero = { atk: 0, def: 0, spd: 0 };
  const off = Math.max(...m.moves.map((id) => moveScore(m, zero, f, b.fs, id)));
  const def = Math.max(...f.moves.map((id) => moveScore(f, b.fs, m, zero, id))) / Math.max(1, m.hp);
  return off / Math.max(1, f.hp) - def * 0.6;
}

/** Best expected damage per turn of `a` against `d`. */
function dmgOf(a: Mon, as: Stages, d: Mon, ds: Stages): number {
  let best = 0;
  for (const id of a.moves) {
    const mv = MOVES[id];
    if (mv.power > 0) best = Math.max(best, baseDamage(a, as, d, ds, mv) * 0.925 * (mv.acc / 100));
  }
  return best;
}

function battleAction(run: RunState, b: Battle, lvl: BotLevel): Action {
  const p = b.p[b.pi];
  const f = b.f[b.fi];
  const others = b.p.map((m, i) => ({ m, i })).filter(({ m, i }) => m.hp > 0 && i !== b.pi);
  if (b.mustSwitch) {
    if (lvl === 'weak') return { t: 'switch', i: others[randInt(others.length)].i };
    others.sort((x, y) => matchup(b, y.m) - matchup(b, x.m));
    return { t: 'switch', i: others[0].i };
  }
  if (lvl === 'weak') return { t: 'move', i: randInt(p.moves.length) };

  // Taming: wild battles while the team has room, or a rare creature.
  if (isWild(b)) {
    const want = run.team.length < TEAM_MAX || (power(f) > Math.min(...run.team.map(power)) * 1.15 && SPECIES[f.sp].stage >= 1);
    if (want) {
      const charms: ItemId[] = ['charm', 'greatcharm', 'primecharm'];
      const have = charms.filter((c) => count(run, c) > 0);
      const best = have.sort((x, y) => (ITEMS[y].charm ?? 0) - (ITEMS[x].charm ?? 0));
      const pick = best.find((c) => catchChance(f, c) >= 0.35) ?? (hpPct(f) < 0.25 ? best[0] : undefined);
      if (pick && (hpPct(f) < 0.55 || catchChance(f, pick) >= 0.5)) return { t: 'item', id: pick };
      if (have.length && hpPct(f) >= 0.25) {
        // Use the weakest attack that does not knock it out.
        let choice = -1;
        let low = Infinity;
        p.moves.forEach((id, i) => {
          const mv = MOVES[id];
          if (mv.power <= 0) return;
          const s = moveScore(p, b.ps, f, b.fs, id);
          if (s < 1000 && s < low) {
            low = s;
            choice = i;
          }
        });
        if (choice >= 0 && hpPct(p) > 0.35) return { t: 'move', i: choice };
      }
    }
  }

  // Run from wild fights that go badly.
  if (isWild(b) && hpPct(p) < 0.4 && hpPct(f) > 0.4 && !(run.team.length < TEAM_MAX && count(run, 'charm') + count(run, 'greatcharm') > 0 && hpPct(f) < 0.5)) return { t: 'run' };

  // Compare how many turns each side needs to win.
  const zero: Stages = { atk: 0, def: 0, spd: 0 };
  const myDmg = dmgOf(p, b.ps, f, b.fs);
  const foeDmg = dmgOf(f, b.fs, p, b.ps);
  const tKill = Math.ceil(f.hp / Math.max(1, myDmg));
  const tDie = Math.ceil(p.hp / Math.max(1, foeDmg));
  const faster = speedOf(p, b.ps) >= speedOf(f, b.fs);
  const winning = faster ? tKill <= tDie : tKill < tDie;
  if (!winning) {
    let alt: { i: number; margin: number } | null = null;
    for (const o of others) {
      const fd = dmgOf(f, b.fs, o.m, zero);
      const hpAfter = o.m.hp - fd;
      if (hpAfter <= 0) continue;
      const k = Math.ceil(f.hp / Math.max(1, dmgOf(o.m, zero, f, b.fs)));
      const d = Math.ceil(hpAfter / Math.max(1, fd));
      const of = speedOf(o.m, zero) >= speedOf(f, b.fs);
      const margin = d - k + (of ? 1 : 0);
      if (margin > 0 && (!alt || margin > alt.margin)) alt = { i: o.i, margin };
    }
    if (alt) return { t: 'switch', i: alt.i };
    if (isWild(b) && tDie <= 2) return { t: 'run' };
    if (tDie <= 1 && tKill > 1) {
      // Heal only when the healed creature can then win the exchange.
      const canWin = (amount: number): boolean => Math.ceil(Math.min(maxHp(p), p.hp + amount) / Math.max(1, foeDmg)) - 1 >= tKill;
      if (count(run, 'potion') > 0 && canWin(Math.max(20, Math.floor(maxHp(p) / 2)))) return { t: 'item', id: 'potion' };
      if (count(run, 'tonic') > 0 && canWin(maxHp(p))) return { t: 'item', id: 'tonic' };
    }
  }
  if (p.st === 'slp' && p.slp > 1 && count(run, 'cure') > 0 && tDie > 2) return { t: 'item', id: 'cure' };
  return { t: 'move', i: bestMove(p, b.ps, f, b.fs, b.heals[p.uid]) };
}

export function botAction(run: RunState, lvl: BotLevel = 'smart'): Action | null {
  const sc = run.scene;
  switch (sc.k) {
    case 'starter':
      return { t: 'starter', i: lvl === 'weak' ? randInt(sc.opts.length) : 0 };
    case 'map': {
      if (lvl === 'weak') return { t: 'node', i: randInt(run.options.length) };
      // Heal on the map first.
      const boss = PLAN[run.step] === 'boss';
      for (const m of run.team) {
        if (m.hp > 0 && hpPct(m) < (boss ? 0.75 : 0.5) && count(run, 'potion') > (boss ? 0 : 3)) return { t: 'use', id: 'potion', uid: m.uid };
        if (m.st && m.st !== 'slp' && count(run, 'cure') > 0) return { t: 'use', id: 'cure', uid: m.uid };
      }
      if (count(run, 'candy') > 0) {
        const low = [...run.team].sort((a, b) => b.lvl - a.lvl)[0];
        return { t: 'use', id: 'candy', uid: low.uid };
      }
      // Put the strongest healthy creature first.
      const lead = [...alive(run)].sort((a, b) => power(b) * hpPct(b) - power(a) * hpPct(a))[0];
      if (lead && run.team[0] !== lead) return { t: 'lead', uid: lead.uid };
      const avg = run.team.reduce((a, m) => a + hpPct(m), 0) / run.team.length;
      const kinds = run.options.map((o) => o.kind);
      const pref = (k: string): number => kinds.indexOf(k as never);
      const order = avg < 0.55 ? ['rest', 'item', 'trainer', 'wild', 'rare'] : run.team.length < 5 ? ['wild', 'rare', 'trainer', 'item', 'rest'] : ['trainer', 'rare', 'wild', 'item', 'rest'];
      for (const k of order) if (pref(k) >= 0) return { t: 'node', i: pref(k) };
      return { t: 'node', i: 0 };
    }
    case 'battle':
      if (sc.b.over) return { t: 'next' };
      return battleAction(run, sc.b, lvl);
    case 'notice':
    case 'evolve':
      return { t: 'next' };
    case 'learn': {
      const m = run.team.find((x) => x.uid === sc.uid);
      if (!m) return { t: 'learn', slot: -1 };
      if (lvl === 'weak') return { t: 'learn', slot: randInt(5) - 1 };
      const w = weakestSlot(m);
      return { t: 'learn', slot: powerOf(sc.move) > powerOf(m.moves[w]) ? w : -1 };
    }
    case 'full': {
      if (lvl === 'weak') return { t: 'keep', slot: -1 };
      let worst = 0;
      run.team.forEach((m, i) => {
        if (power(m) < power(run.team[worst])) worst = i;
      });
      return { t: 'keep', slot: power(sc.mon) > power(run.team[worst]) ? worst : -1 };
    }
    case 'town': {
      const t = sc.town;
      if (run.team.some((m) => m.hp < maxHp(m) || m.st)) return { t: 'heal' };
      if (lvl === 'weak') return { t: 'leave' };
      // Fuse the weakest creature into the strongest one when the team is big.
      if (!t.fused && run.team.length >= 5) {
        const sorted = [...run.team].sort((a, b) => power(b) - power(a));
        const a = sorted.find((m) => m.fused < 3);
        const b = sorted[sorted.length - 1];
        if (a && b && a !== b) return { t: 'fuse', a: a.uid, b: b.uid };
      }
      const cost = TUTOR_COST(run.region);
      if (run.gold >= cost + 200) {
        for (const id of t.tutor) {
          if (MOVES[id].power <= 0) continue;
          const m = run.team.find((x) => canLearn(x, id) && (x.moves.length < 4 || powerOf(id) > powerOf(x.moves[weakestSlot(x)]) + 15));
          if (m) return { t: 'tutor', move: id, uid: m.uid, slot: m.moves.length < 4 ? -1 : weakestSlot(m) };
        }
      }
      const wants: [ItemId, number][] = [
        ['potion', 5],
        ['greatcharm', 2],
        ['charm', 3],
        ['tonic', 2],
        ['cure', 1],
        ['potion', 8],
        ['tonic', 4],
        ['candy', 99],
      ];
      for (const [id, n] of wants) if (count(run, id) < n && t.shop.includes(id) && run.gold >= ITEMS[id].price) return { t: 'buy', id };
      return { t: 'leave' };
    }
    case 'end':
      return null;
  }
}
