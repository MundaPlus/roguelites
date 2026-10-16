/** Bots for the debug API and the balance sim. */
import { CLASSES, groupOf } from './data';
import {
  adjacent,
  choose,
  enemies,
  foeDef,
  itemValue,
  stats,
  takeTurn,
  upDef,
  useSkill,
  type Choice,
  type Run,
} from './game';
import { Rng } from './rng';

/** Damage the board would deal next enemy turn (ignores armor). */
export function threat(run: Run): number {
  const s = stats(run.hero);
  let n = run.hero.poison > 0 ? 1 : 0;
  for (const t of enemies(run)) {
    const f = t.e!;
    const d = foeDef(f);
    if (d.special === 'explode') n += f.timer <= 1 ? 5 + run.floor : 1;
    else if (d.special === 'breath' && f.timer <= 1) n += f.atk * 3;
    else n += Math.max(0, f.atk - s.block);
  }
  return n;
}

/** Collect candidate paths with a bounded DFS. Keeps one path per tile set. */
export function candidates(run: Run, budget = 6000, maxLen = 14): number[][] {
  const out = new Map<string, number[]>();
  const N = run.grid.length;
  const nbr: number[][] = [];
  for (let i = 0; i < N; i++) {
    nbr.push([]);
    for (let j = 0; j < N; j++) if (adjacent(i, j) && groupOf(run.grid[i]!.k) === groupOf(run.grid[j]!.k)) nbr[i].push(j);
  }
  let steps = 0;
  const per = Math.max(60, Math.floor(budget / N));
  for (let s = 0; s < N; s++) {
    let local = 0;
    const path = [s];
    const used = new Set([s]);
    const dfs = (): void => {
      if (local++ > per || steps++ > budget) return;
      let ext = false;
      if (path.length < maxLen) {
        for (const j of nbr[path[path.length - 1]]) {
          if (used.has(j)) continue;
          ext = true;
          path.push(j);
          used.add(j);
          dfs();
          used.delete(j);
          path.pop();
        }
      }
      if (path.length >= 3 && (!ext || path.length === 3 || path.length % 2 === 0)) {
        const key = path.slice().sort((a, b) => a - b).join(',');
        if (!out.has(key)) out.set(key, path.slice());
      }
    };
    dfs();
  }
  return [...out.values()];
}

/** Cheap value of a path, before simulation. */
function quick(run: Run, path: number[]): number {
  const s = stats(run.hero);
  const tiles = path.map((i) => run.grid[i]!);
  const g = groupOf(tiles[0].k);
  const h = run.hero;
  if (g === 'attack') {
    const swords = tiles.filter((t) => t.k === 'sword').length;
    const dmg = s.baseDmg + swords * s.swordDmg;
    let v = 0;
    for (const t of tiles) {
      if (!t.e) continue;
      const d = Math.max(0, dmg - Math.max(0, t.e.armor - s.pierce));
      v += d >= t.e.hp ? 4 + t.e.atk * 2 + foeDef(t.e).xp : (d / t.e.hp) * 2;
    }
    return v + swords * 0.1;
  }
  const n = tiles.length;
  if (g === 'shield') return Math.min(n * s.shieldRepair, s.maxArmor - h.armor) * 0.9 + n * 0.25;
  if (g === 'potion') return Math.min(n * s.potionHeal, s.maxHp - h.hp) * (h.hp < s.maxHp * 0.5 ? 1.2 : 0.5);
  return n * s.coinValue * 0.45;
}

const clone = (run: Run): Run => JSON.parse(JSON.stringify(run)) as Run;

/** Value of a whole state, for the smart bot. */
function evalState(run: Run): number {
  if (run.over === 'dead') return -1e6;
  if (run.over === 'win') return 1e6;
  const s = stats(run.hero);
  const h = run.hero;
  return h.hp * 1.6 + h.armor * 1.0 - threat(run) * 2.2 + run.kills * 3 + run.floor * 10 + run.xp * 0.5 + run.coins * 0.35 + run.shields * 0.3 + run.pending.length * 8 + (run.offer ? 8 : 0) - (h.hp < s.maxHp * 0.35 ? 20 : 0);
}

/** The smart bot's move: simulate the best candidates one turn ahead. */
export function bestPath(run: Run, r: Rng, width = 24): number[] {
  const cands = candidates(run).map((p) => ({ p, q: quick(run, p) }));
  cands.sort((a, b) => b.q - a.q);
  let best = cands[0].p;
  let bv = -Infinity;
  for (const c of cands.slice(0, width)) {
    let v = 0;
    for (let k = 0; k < 2; k++) {
      const sim = clone(run);
      sim.rng = (sim.rng + k * 7919 + r.int(0, 1e6)) | 0;
      takeTurn(sim, c.p);
      v += evalState(sim);
    }
    if (v > bv) {
      bv = v;
      best = c.p;
    }
  }
  return best;
}

/** A weak bot: a random short chain. */
export function randomPath(run: Run, r: Rng): number[] {
  const c = candidates(run, 1500, 5);
  return r.pick(c);
}

/** Skill rules for the smart bot. Returns the skill slot to use, or -1. */
export function pickSkill(run: Run): number {
  const h = run.hero;
  const s = stats(h);
  const ids = CLASSES[h.cls].skills;
  const foes = enemies(run);
  const th = threat(run);
  for (let i = 0; i < ids.length; i++) {
    if (h.cds[i] > 0) continue;
    const kinds = run.grid.map((t) => t!.k);
    const count = (k: string) => kinds.filter((x) => x === k).length;
    switch (ids[i]) {
      case 'whirl': {
        const dmg = s.baseDmg + 2 * s.swordDmg;
        const kills = foes.filter((t) => t.e!.hp <= dmg - Math.max(0, t.e!.armor - s.pierce)).length;
        if (kills >= 3 || foes.length >= 7 || (foes.some((t) => foeDef(t.e!).boss) && th > h.armor)) return i;
        break;
      }
      case 'fortify':
        if (h.armor <= s.maxArmor * 0.3 && th >= 4) return i;
        break;
      case 'edge':
        if (count('coin') >= 4 && foes.length >= 2) return i;
        break;
      case 'shuffle':
        if (th > (h.hp + h.armor) * 0.25 && foes.length >= 3) return i;
        break;
      case 'heal':
        if (h.hp < s.maxHp * 0.5 || h.poison >= 6) return i;
        break;
      case 'transmute':
        if (h.hp < s.maxHp * 0.55 && count('shield') >= 4) return i;
        break;
      case 'fireball':
        if (foes.some((t) => foeDef(t.e!).boss || t.e!.hp >= 8)) return i;
        break;
      case 'freeze':
        if (th > (h.hp + h.armor) * 0.3 || foes.some((t) => foeDef(t.e!).special === 'explode' && t.e!.timer <= 1)) return i;
        break;
    }
  }
  return -1;
}

/** Smart choice from an offer. */
export function pickChoice(run: Run): number {
  const o = run.offer!;
  const h = run.hero;
  const s = stats(h);
  const val = (c: Choice): number => {
    if (c.kind === 'item') return itemValue(c.item) - itemValue(h.gear[c.item.slot]);
    const w: Record<string, number> = {
      vital: 7, sharp: 9, might: 7, medic: 6, greed: 4, focus: 5, scholar: 4, pierce: run.floor >= 7 ? 7 : 4,
      second: h.hp < s.maxHp * 0.4 ? 12 : 2, plate: 7, mason: 6, block: 10, spike: 5, hearty: 5,
    };
    return w[upDef(c.id).id] ?? 3;
  };
  let best = 0;
  for (let i = 1; i < o.opts.length; i++) if (val(o.opts[i]) > val(o.opts[best])) best = i;
  if (o.kind === 'shop' && val(o.opts[best]) <= 0) return -1;
  return best;
}

/** One smart bot step on a run. Returns what it did. */
export function botStep(run: Run, r: Rng, smart: boolean): string {
  if (run.offer) {
    const i = smart ? pickChoice(run) : r.int(0, run.offer.opts.length - 1);
    choose(run, i);
    return 'choose';
  }
  if (smart) {
    const k = pickSkill(run);
    if (k >= 0 && useSkill(run, k)) return 'skill';
  }
  takeTurn(run, smart ? bestPath(run, r) : randomPath(run, r));
  return 'move';
}
