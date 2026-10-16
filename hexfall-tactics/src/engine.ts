import {
  addFx,
  clone,
  damage,
  disarmed,
  emptyTiles,
  enemies,
  mechs,
  place,
  pos,
  rand,
  tileAt,
  unitAt,
  unitById,
  type Battle,
  type Unit,
} from './board';
import { HEXES, dist, neighbors, onBoard, ring, step, type Hex } from './hex';
import { ENEMIES } from './units';
import { WEAPONS, aims, fire, intentTarget, repair, type Target } from './weapons';

// ---------- Units ----------

export function makeEnemy(b: Battle, kind: string, h: Hex, alpha: boolean): Unit {
  const d = ENEMIES[kind];
  const hp = d.hp + (alpha ? 2 : 0);
  return {
    id: b.nextId++,
    side: 'enemy',
    kind,
    q: h.q,
    r: h.r,
    hp,
    max: hp,
    move: d.move,
    flying: !!d.flying,
    jump: !!d.jump,
    stable: !!d.stable,
    boss: !!d.boss,
    alpha,
    burning: false,
    shield: false,
    slot: -1,
    moved: false,
    acted: false,
    weapons: [{ id: d.weapon, lvl: 0 }],
    bonus: alpha ? 1 : 0,
    perks: [],
    intent: null,
  };
}

export function enemyName(u: Unit): string {
  return `${u.alpha ? 'Alpha ' : ''}${ENEMIES[u.kind].name}`;
}

// ---------- Movement ----------

function passable(b: Battle, u: Unit, h: Hex): boolean {
  const t = tileAt(b, h);
  if (!t || t.t === 'mountain' || t.t === 'building') return false;
  if (u.flying) return true;
  if (t.t === 'chasm') return false;
  // Enemies do not walk into water, they would drown. Mechs can wade in.
  return !(t.t === 'water' && u.side === 'enemy' && !u.stable);
}

/** Tiles where the unit can end its move, including its own tile. Units pass through allies. */
export function reach(b: Battle, u: Unit): Hex[] {
  const start = pos(u);
  const out: Hex[] = [start];
  if (u.move <= 0) return out;
  if (u.jump) {
    for (const h of HEXES) {
      const k = dist(start, h);
      if (k >= 1 && k <= u.move && passable(b, u, h) && !unitAt(b, h)) out.push(h);
    }
    return out;
  }
  const seen = new Set<string>([`${start.q},${start.r}`]);
  let frontier = [start];
  for (let k = 0; k < u.move; k++) {
    const next: Hex[] = [];
    for (const f of frontier) {
      for (const n of neighbors(f)) {
        const key = `${n.q},${n.r}`;
        if (seen.has(key) || !passable(b, u, n)) continue;
        const o = unitAt(b, n);
        if (o && o.side !== u.side) continue;
        seen.add(key);
        next.push(n);
        if (!o) out.push(n);
      }
    }
    frontier = next;
  }
  return out;
}

// ---------- Player actions (each returns a new battle) ----------

export const canMove = (u: Unit): boolean => u.side === 'mech' && !u.moved && !u.acted;
export const canAct = (u: Unit): boolean => u.side === 'mech' && !u.acted;

export function moveMech(b: Battle, id: number, h: Hex): Battle {
  const c = clone(b);
  const u = unitById(c, id)!;
  place(c, u, h);
  u.moved = true;
  return c;
}

export function attack(b: Battle, id: number, slot: number, t: Target): Battle {
  const c = clone(b);
  const u = unitById(c, id)!;
  u.acted = true;
  u.moved = true;
  fire(c, u, slot, t);
  return c;
}

export function repairMech(b: Battle, id: number): Battle {
  const c = clone(b);
  const u = unitById(c, id)!;
  u.acted = true;
  u.moved = true;
  repair(c, u);
  return c;
}

/** Unique shots only: several clicked tiles can give the same shot. */
export function uniqueAims(b: Battle, u: Unit, slot: number): Target[] {
  const { id, lvl } = u.weapons[slot];
  const seen = new Set<string>();
  return aims(b, u, WEAPONS[id], lvl).filter((t) => {
    const k = `${t.hit.q},${t.hit.r},${t.dir},${t.dist},${t.land ? `${t.land.q},${t.land.r}` : ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- Enemy planning ----------

function hitScore(before: Battle, after: Battle, selfId: number): number {
  let s = (before.power - after.power) * 10;
  if (after.over === 'lose') s += 40;
  for (const m of mechs(before)) {
    const a = unitById(after, m.id);
    if (!a) s += 14;
    else s += (m.hp - a.hp) * 5 + (m.shield && !a.shield ? 2 : 0);
  }
  for (const e of enemies(before)) {
    const a = unitById(after, e.id);
    const w = e.id === selfId ? 2 : 1;
    if (!a) s -= 9 * w;
    else s -= (e.hp - a.hp) * 3 * w;
  }
  return s;
}

function nearestGoal(b: Battle, h: Hex): number {
  let best = 99;
  for (const g of HEXES) {
    const t = tileAt(b, g)!;
    if (t.t === 'building') best = Math.min(best, dist(h, g));
  }
  for (const m of mechs(b)) best = Math.min(best, dist(h, pos(m)));
  return best;
}

export function planEnemy(b: Battle, u: Unit, order: number): void {
  const w = WEAPONS[u.weapons[0].id];
  let best = -Infinity;
  let bestH = pos(u);
  let bestT: Target | null = null;
  for (const h of reach(b, u)) {
    const sim = clone(b);
    const su = unitById(sim, u.id)!;
    su.q = h.q;
    su.r = h.r;
    const tile = tileAt(sim, h)!;
    const base = (tile.fire && !u.flying ? -3 : 0) - nearestGoal(sim, h) * 0.15;
    const seen = new Set<string>();
    for (const t of aims(sim, su, w, 0)) {
      const key = `${t.hit.q},${t.hit.r},${t.dir}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const s = clone(sim);
      fire(s, unitById(s, u.id)!, 0, t);
      const score = hitScore(sim, s, u.id) + base + rand(b) * 1.2;
      if (score > best) {
        best = score;
        bestH = h;
        bestT = t;
      }
    }
  }
  place(b, u, bestH);
  if (!b.units.includes(u)) return;
  u.intent = bestT ? { dir: bestT.dir, dist: bestT.dist, order } : null;
}

export function planEnemies(b: Battle): void {
  let order = 1;
  for (const u of [...enemies(b)].sort((a, c) => a.id - c.id)) {
    if (!b.units.includes(u)) continue;
    planEnemy(b, u, order++);
  }
}

export function placeSpawns(b: Battle): void {
  b.spawns = [];
  if (b.turn >= b.turns) return;
  const taken = (h: Hex) => b.spawns.some((s) => s.q === h.q && s.r === h.r);
  for (const boss of enemies(b).filter((u) => ENEMIES[u.kind].brood)) {
    const free = neighbors(pos(boss)).filter((h) => {
      const t = tileAt(b, h)!;
      return (t.t === 'ground' || t.t === 'forest') && !unitAt(b, h) && !t.fire && !taken(h);
    });
    for (let i = 0; i < (ENEMIES[boss.kind].brood ?? 0) && free.length; i++) {
      const h = free.splice(Math.floor(rand(b) * free.length), 1)[0];
      b.spawns.push({ ...h, kind: 'scuttler' });
    }
  }
  const n = b.spawnPlan[b.turn - 1] ?? 0;
  const pool = emptyTiles(b).filter((h) => ring(h) >= 2 && !tileAt(b, h)!.fire && !taken(h));
  // Prefer the outer rings, like enemies coming in from the edge.
  pool.sort((a, c) => ring(c) - ring(a) + (rand(b) - 0.5) * 3);
  for (let i = 0; i < n && pool.length; i++) b.spawns.push(pool.shift()!);
}

export function pickEnemyKind(b: Battle): string {
  const total = b.roster.reduce((a, [, w]) => a + w, 0);
  let roll = rand(b) * total;
  for (const [k, w] of b.roster) {
    roll -= w;
    if (roll < 0) return k;
  }
  return b.roster[0][0];
}

// ---------- Enemy phase steps (each mutates the battle) ----------

/** Burning units take 1 damage. */
export function fireStep(b: Battle): void {
  b.fx = [];
  b.actor = -1;
  for (const u of [...b.units]) {
    if (u.burning && b.units.includes(u)) damage(b, pos(u), 1);
  }
}

export const attackOrder = (b: Battle): Unit[] =>
  enemies(b)
    .filter((u) => u.intent)
    .sort((a, c) => a.intent!.order - c.intent!.order);

export function attackStep(b: Battle, id: number): void {
  b.fx = [];
  const u = unitById(b, id);
  if (!u || !u.intent || b.over) return;
  if (disarmed(b, u)) {
    addFx(b, 'cancel', pos(u));
  } else {
    const t = intentTarget(b, u);
    if (t) fire(b, u, 0, t);
  }
  u.intent = null;
}

export function spawnStep(b: Battle): void {
  b.fx = [];
  b.actor = -1;
  for (const s of b.spawns) {
    if (b.over) break;
    const t = tileAt(b, s)!;
    if (unitAt(b, s)) {
      addFx(b, 'block', s);
      b.stats.blocked++;
      damage(b, s, 1);
    } else if (t.t === 'ground' || t.t === 'forest') {
      const kind = s.kind ?? pickEnemyKind(b);
      const e = makeEnemy(b, kind, s, !s.kind && rand(b) < b.alphaChance);
      b.units.push(e);
      addFx(b, 'spawn', s);
    }
  }
  b.spawns = [];
}

/** End of the round: clear smoke, then plan the next round or end the battle. */
export function endRound(b: Battle): void {
  b.fx = [];
  for (const t of b.tiles) t.smoke = false;
  for (const u of b.units) {
    u.moved = false;
    u.acted = false;
    u.intent = null;
  }
  if (b.over) return;
  b.turn++;
  if (b.turn > b.turns) {
    b.over = 'win';
    return;
  }
  planEnemies(b);
  placeSpawns(b);
}

/** Run the whole enemy phase at once. The UI plays the same steps one by one. */
export function resolveRound(b: Battle): Battle {
  const c = clone(b);
  fireStep(c);
  for (const u of attackOrder(c)) attackStep(c, u.id);
  if (!c.over) spawnStep(c);
  endRound(c);
  return c;
}

// ---------- Bot (debug autoplay and balance tests) ----------

function evalAfterAttacks(b: Battle): number {
  const s = clone(b);
  fireStep(s);
  for (const u of attackOrder(s)) attackStep(s, u.id);
  if (s.over === 'win') return 1e5;
  let score = s.power * 30 + (s.over === 'lose' ? -1e5 : 0);
  for (const m of mechs(s)) score += 40 + m.hp * 6 + (m.burning ? -3 : 0);
  for (const e of enemies(s)) score -= 10 + e.hp * 2 - (e.burning ? 3 : 0);
  for (const sp of s.spawns) if (unitAt(s, sp)?.side === 'mech') score += 4;
  return score;
}

export type BotAction = { id: number; to: Hex; act: 'none' | 'repair' | number; t?: Target };

function applyBot(b: Battle, a: BotAction): Battle {
  const u = unitById(b, a.id)!;
  let c = a.to.q !== u.q || a.to.r !== u.r ? moveMech(b, a.id, a.to) : clone(b);
  if (a.act === 'repair') c = repairMech(c, a.id);
  else if (typeof a.act === 'number' && a.t) c = attack(c, a.id, a.act, a.t);
  return c;
}

/** Greedy squad plan: pick the best single mech action, apply it, repeat. */
export function botTurn(b: Battle): BotAction[] {
  const plan: BotAction[] = [];
  let cur = b;
  for (;;) {
    const ready = mechs(cur).filter((m) => canAct(m));
    if (!ready.length || cur.over) break;
    let best: { a: BotAction; s: number } | null = null;
    for (const m of ready) {
      const tiles = canMove(m) ? reach(cur, m) : [pos(m)];
      for (const h of tiles) {
        const moved = h.q === m.q && h.r === m.r ? cur : moveMech(cur, m.id, h);
        const mu = unitById(moved, m.id);
        if (!mu) continue;
        const tryA = (a: BotAction, after: Battle) => {
          const s = evalAfterAttacks(after) + (h.q === m.q && h.r === m.r ? 0.5 : 0);
          if (!best || s > best.s) best = { a, s };
        };
        tryA({ id: m.id, to: h, act: 'none' }, moved);
        if (mu.hp < mu.max || mu.burning) tryA({ id: m.id, to: h, act: 'repair' }, repairMech(moved, m.id));
        if (disarmed(moved, mu)) continue;
        mu.weapons.forEach((_, slot) => {
          for (const t of uniqueAims(moved, mu, slot)) tryA({ id: m.id, to: h, act: slot, t }, attack(moved, m.id, slot, t));
        });
      }
    }
    if (!best) break;
    const chosen: BotAction = (best as { a: BotAction }).a;
    plan.push(chosen);
    cur = applyBot(cur, chosen);
    const u = unitById(cur, chosen.id);
    if (u) {
      u.acted = true;
      u.moved = true;
    }
  }
  return plan;
}

export { applyBot, onBoard, step };
