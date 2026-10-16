/** Bots for the sim and the debug API. They see the whole floor. */
import { DX, DY, ITEMS } from './data';
import { useful } from './level';
import { FLOOR, GEMW, GOLDV, DIRT, STONE, cloneWorld, edef, enemyAt, isReady, resolveBeat, spellReady, tile, type Action, type World } from './world';

const INF = 1e9;

/** Walking cost map to (gx, gy). Walls you can dig cost 2 (dig, then step). */
export function distMap(w: World, gx: number, gy: number): Int32Array {
  const W = w.w;
  const d = new Int32Array(W * w.h).fill(INF);
  const buckets: number[][] = [[gy * W + gx]];
  d[gy * W + gx] = 0;
  const blocked = new Set<number>();
  if (w.keeper) blocked.add(w.keeper.y * W + w.keeper.x);
  for (const p of w.shop) if (!p.sold && w.hero.gold < p.cost) blocked.add(p.y * W + p.x);
  for (let c = 0; c < buckets.length; c++) {
    const b = buckets[c];
    if (!b) continue;
    for (const p of b) {
      if (d[p] !== c) continue;
      const x = p % W;
      const y = (p / W) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k];
        const ny = y + DY[k];
        const t = tile(w, nx, ny);
        const n = ny * W + nx;
        let cost = 1;
        if (t === DIRT || t === GOLDV || t === GEMW) cost = 2;
        else if (t === STONE) cost = w.hero.pick ? 2 : INF;
        else if (t !== FLOOR) cost = INF;
        if (cost >= INF || blocked.has(n)) continue;
        if (d[n] > c + cost) {
          d[n] = c + cost;
          (buckets[c + cost] ??= []).push(n);
        }
      }
    }
  }
  return d;
}

const WEAPON_RANK: Record<string, number> = { dagger: 0, whip: 1, rapier: 1, spear: 2, broad: 3, long: 4 };

/** How much the good bot wants a shop item. */
function want(w: World, id: string): number {
  const h = w.hero;
  const it = ITEMS[id];
  if (!useful(h, id)) return 0;
  switch (it.kind) {
    case 'food':
      return h.hp <= h.maxHp - (it.v as number) ? 6 : h.hp < h.maxHp - 1 ? 3 : 0;
    case 'heart':
      return 5;
    case 'whet':
      return 5;
    case 'armor':
      return 4;
    case 'weapon':
      return WEAPON_RANK[it.v as string] > WEAPON_RANK[h.weapon] ? 4 : 0;
    case 'spell':
      return h.spell ? 0 : 3;
    case 'ring':
      return 2;
    case 'pick':
      return 1;
    default:
      return 1;
  }
}

export function pickGoal(w: World, smart: boolean): { x: number; y: number } {
  const boss = w.enemies.find((e) => edef(e).boss);
  if (w.boss) return boss ? { x: boss.x, y: boss.y } : w.stairs;
  const mini = w.enemies.find((e) => edef(e).mini);
  if (smart && w.beat < 500) {
    const md = (x: number, y: number): number => Math.abs(x - w.px) + Math.abs(y - w.py);
    const buy = w.shop.filter((p) => !p.sold && p.cost <= w.hero.gold && want(w, p.item) >= 3).sort((a, b) => want(w, b.item) - want(w, a.item))[0];
    if (buy) return buy;
    const chest = w.chests.slice().sort((a, b) => md(a.x, a.y) - md(b.x, b.y))[0];
    if (chest && md(chest.x, chest.y) < 30) return chest;
    const gold = w.gold.slice().sort((a, b) => md(a.x, a.y) - md(b.x, b.y))[0];
    if (gold && md(gold.x, gold.y) <= 6) return gold;
    const foe = w.enemies.filter((e) => !edef(e).mini && edef(e).move !== 'still' && md(e.x, e.y) <= 6).sort((a, b) => md(a.x, a.y) - md(b.x, b.y))[0];
    if (foe) return foe;
  }
  if (w.locked && mini) return { x: mini.x, y: mini.y };
  return w.stairs;
}

const MOVES: Action[] = [0, 1, 2, 3].map((dir) => ({ kind: 'move', dir }) as Action);

function leaf(before: World, c: World, dm: Int32Array): number {
  if (c.dead) return -1e9;
  if (c.won || c.exit) return 1e7;
  let s = 0;
  s += (c.hero.hp - before.hero.hp) * 1000;
  s += (before.enemies.length - c.enemies.length) * 150;
  const hpSum = (x: World): number => x.enemies.reduce((a, e) => a + e.hp, 0);
  s += Math.max(0, hpSum(before) - hpSum(c)) * 70;
  s += (c.hero.goldEarned - before.hero.goldEarned) * 3;
  s += (c.hero.diamonds - before.hero.diamonds) * 100;
  s += (c.shop.filter((p) => p.sold).length - before.shop.filter((p) => p.sold).length) * 600;
  s += (before.chests.length - c.chests.length) * 400;
  s -= (c.locked ? 0 : 0) + Math.min(dm[c.py * c.w + c.px], 500) * 12;
  const fear = c.beat < 350 ? 1 : c.beat < 700 ? 0.35 : c.beat < 1000 ? 0.1 : 0;
  for (const e of c.enemies) {
    if (!isReady(c, e)) continue;
    const dd = Math.abs(e.x - c.px) + Math.abs(e.y - c.py);
    if (dd === 1 || (edef(e).move === 'charge' && e.aim >= 0) || (edef(e).move === 'diag' && Math.abs(e.x - c.px) === 1 && Math.abs(e.y - c.py) === 1)) s -= 120 * edef(e).dmg * fear;
  }
  if (c.danger.some((d) => d.at === c.beat + 1 && d.x === c.px && d.y === c.py)) s -= 1500;
  if (c.bombs.some((b) => b.t === 1 && Math.abs(b.x - c.px) <= 1 && Math.abs(b.y - c.py) <= 1)) s -= 1500;
  return s;
}

function candidates(w: World): Action[] {
  const out = MOVES.slice();
  if (spellReady(w.hero)) {
    const sp = w.hero.spell!;
    const near = w.enemies.filter((e) => Math.abs(e.x - w.px) + Math.abs(e.y - w.py) <= 4).length;
    if (sp === 'heal' ? w.hero.hp <= w.hero.maxHp - 2 : sp === 'quake' ? false : near > 0) out.push({ kind: 'spell' });
  }
  return out;
}

/** Two-beat lookahead with the world rules. */
export function goodBot(w: World): Action {
  const g = pickGoal(w, true);
  const dm = distMap(w, g.x, g.y);
  let best: Action = MOVES[0];
  let bs = -Infinity;
  for (const a of candidates(w)) {
    const c = cloneWorld(w);
    c.rng ^= 0x2545f491;
    resolveBeat(c, a, true);
    let s = leaf(w, c, dm);
    if (!c.dead && !c.exit && !c.won) {
      let b2 = -Infinity;
      for (const a2 of candidates(c)) {
        const c2 = cloneWorld(c);
        resolveBeat(c2, a2, true);
        b2 = Math.max(b2, leaf(c, c2, dm));
      }
      s += 0.85 * b2;
    }
    if (s > bs) {
      bs = s;
      best = a;
    }
  }
  return best;
}

/** Walks to the stairs and hits what is in the way. Misses some beats. */
export function weakBot(w: World, rnd: () => number, miss = 0.12): Action {
  if (rnd() < miss) return { kind: 'none' };
  const g = pickGoal(w, false);
  const dm = distMap(w, g.x, g.y);
  let best = 0;
  let bd = INF;
  for (let k = 0; k < 4; k++) {
    const x = w.px + DX[k];
    const y = w.py + DY[k];
    const v = enemyAt(w, x, y) ? 0 : dm[y * w.w + x] + rnd() * 0.5;
    if (v < bd) {
      bd = v;
      best = k;
    }
  }
  return { kind: 'move', dir: best };
}

