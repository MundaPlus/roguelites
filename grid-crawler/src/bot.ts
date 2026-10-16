/** Auto-explore and two bot players (weak and good). Used by the debug API, the sim and the `x` key. */
import { ARMORS, MONSTERS, POTIONS, SCROLLS, WEAPONS } from './data';
import { PACK_MAX, type Action, type Game, type Item, type Mon, canSee, def, isKnown, onStairs, strEff, visibleMons } from './game';
import { DIRS, H, T_DOWN, W, canStep, dist, idx, inMap, walkable } from './map';

/** BFS over known tiles. Returns the first step toward the nearest tile that matches `goal`. */
export function stepToward(g: Game, goal: (i: number) => boolean, avoidTraps = true, avoidMons = true): [number, number] | null {
  const start = idx(g.p.x, g.p.y);
  const prev = new Int32Array(W * H).fill(-1);
  prev[start] = start;
  const trap = new Set(avoidTraps ? g.traps.filter((t) => t.known).map((t) => idx(t.x, t.y)) : []);
  const mons = new Set(avoidMons ? g.mons.map((m) => idx(m.x, m.y)) : []);
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i !== start && goal(i)) {
      let c = i;
      while (prev[c] !== start) c = prev[c];
      const x = c % W;
      return [x - g.p.x, (c - x) / W - g.p.y];
    }
    const x = i % W;
    const y = (i - x) / W;
    for (const [dx, dy] of DIRS) {
      if (!canStep(g.tiles, x, y, dx, dy)) continue;
      const j = idx(x + dx, y + dy);
      if (prev[j] !== -1 || !g.seen[j] || trap.has(j)) continue;
      if (mons.has(j) && !goal(j)) continue;
      prev[j] = i;
      q.push(j);
    }
  }
  return null;
}

function isFrontier(g: Game, i: number): boolean {
  if (!g.seen[i] || !walkable(g.tiles[i])) return false;
  const x = i % W;
  const y = (i - x) / W;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (inMap(nx, ny) && !g.seen[idx(nx, ny)]) return true;
  }
  return false;
}

function wantItem(g: Game, it: Item): boolean {
  if (it.dropped && it.kind !== 'gold') return false;
  const stacks = (it.kind === 'potion' || it.kind === 'scroll') && g.p.pack.some((o) => o.kind === it.kind && o.id === it.id);
  if (g.p.pack.length >= PACK_MAX && it.kind !== 'gold' && it.kind !== 'amulet' && !stacks) return false;
  if (it.kind === 'potion' && isKnown(g, it) && POTIONS[it.id].bad) return false;
  if (it.kind === 'scroll' && isKnown(g, it) && SCROLLS[it.id].bad) return false;
  return true;
}

/** One auto-explore step: items first, then unexplored areas. Null when the floor is done. */
export function exploreStep(g: Game): Action | null {
  const items = new Set(g.items.filter((it) => it.x !== undefined && g.seen[idx(it.x, it.y!)] && wantItem(g, it)).map((it) => idx(it.x!, it.y!)));
  const here = idx(g.p.x, g.p.y);
  const goal = (i: number): boolean => (items.has(i) && i !== here) || isFrontier(g, i);
  const dir = stepToward(g, goal) ?? stepToward(g, goal, false) ?? stepToward(g, goal, false, false);
  return dir ? { t: 'move', dx: dir[0], dy: dir[1] } : null;
}

export function stairsStep(g: Game): Action | null {
  if (onStairs(g)) return { t: 'descend' };
  const goal = (i: number): boolean => g.tiles[i] === T_DOWN;
  const dir = stepToward(g, goal) ?? stepToward(g, goal, false) ?? stepToward(g, goal, false, false);
  return dir ? { t: 'move', dx: dir[0], dy: dir[1] } : null;
}

function threats(g: Game): Mon[] {
  return visibleMons(g).filter((m) => canSee(g, m.x, m.y) && (m.mode === 'hunt' || dist(m.x, m.y, g.p.x, g.p.y) <= 2));
}

function adjacent(g: Game): Mon[] {
  return g.mons.filter((m) => dist(m.x, m.y, g.p.x, g.p.y) === 1 && canStep(g.tiles, g.p.x, g.p.y, m.x - g.p.x, m.y - g.p.y));
}

function attackAction(g: Game, m: Mon): Action {
  return { t: 'move', dx: m.x - g.p.x, dy: m.y - g.p.y };
}

function weaponScore(g: Game, it: Item | null): number {
  if (!it) return 0;
  const w = WEAPONS[it.id];
  const miss = Math.max(0, w.str - strEff(g));
  const avg = (w.dmg[0] + w.dmg[1]) / 2 + (it.plus ?? 0);
  const acc = Math.min(98, 70 + 3 * g.p.agi + w.acc + (it.plus ?? 0) * 3 - miss * 8) / 100;
  return avg * acc * (w.trait === 'sweep' ? 1.1 : 1);
}

function armorScore(g: Game, it: Item | null): number {
  if (!it) return 0;
  const a = ARMORS[it.id];
  return a.armor + (it.plus ?? 0) - Math.max(0, a.str - strEff(g)) * 1.5;
}

const find = (g: Game, kind: string, id: string): Item | undefined => g.p.pack.find((o) => o.kind === kind && o.id === id && isKnown(g, o) && (o.kind !== 'wand' || (o.charges ?? 0) > 0));

const danger = (m: Mon): number => {
  const d = MONSTERS[m.id];
  return m.hp + (d.atk[0] + d.atk[1]) * 3 + (d.boss ? 200 : 0);
};

export interface BotMemory {
  floor: number;
  turns: number;
  statCycle: number;
  waits: number;
}

export const newMemory = (): BotMemory => ({ floor: 0, turns: 0, statCycle: 0, waits: 0 });

/** The weak bot: explores, fights what is next to it, walks down as soon as it can. Never uses items. */
export function weakBot(g: Game, rnd: () => number): Action {
  if (g.levelUps > 0) return { t: 'stat', stat: (['str', 'agi', 'wits'] as const)[Math.floor(rnd() * 3)] };
  const adj = adjacent(g);
  if (adj.length) return attackAction(g, adj[0]);
  const st = stairsStep(g);
  if (st && g.seen.some((v, i) => v && g.tiles[i] === T_DOWN)) return st;
  return exploreStep(g) ?? st ?? { t: 'wait' };
}

/** The good bot: uses gear, heals, zaps wands, rests and explores each floor fully. */
export function goodBot(g: Game, mem: BotMemory): Action {
  const p = g.p;
  if (mem.floor !== g.floor) {
    mem.floor = g.floor;
    mem.turns = 0;
  }
  mem.turns++;
  if (g.levelUps > 0) {
    const cycle = ['str', 'agi', 'str', 'agi', 'wits'] as const;
    return { t: 'stat', stat: cycle[mem.statCycle++ % cycle.length] };
  }
  // Better gear.
  for (const it of p.pack) {
    if (it.kind === 'weapon' && weaponScore(g, it) > weaponScore(g, p.weapon) + 0.3) return { t: 'use', uid: it.uid };
    if (it.kind === 'armor' && armorScore(g, it) > armorScore(g, p.armor) + 0.3 && threats(g).length === 0) return { t: 'use', uid: it.uid };
  }
  const th = threats(g);
  const hpf = p.hp / p.maxHp;
  if (th.length) {
    const near = th.filter((m) => dist(m.x, m.y, p.x, p.y) <= 6);
    const total = near.reduce((a, m) => a + danger(m), 0);
    if (hpf < 0.4) {
      const heal = find(g, 'potion', 'extra') ?? find(g, 'potion', 'heal');
      if (heal) return { t: 'use', uid: heal.uid };
      const tele = find(g, 'scroll', 'teleport');
      if (tele && hpf < 0.3) return { t: 'use', uid: tele.uid };
      const fear = find(g, 'scroll', 'fear');
      if (fear) return { t: 'use', uid: fear.uid };
      const unknown = p.pack.find((o) => o.kind === 'potion' && !isKnown(g, o));
      if (unknown && hpf < 0.3) return { t: 'use', uid: unknown.uid };
    }
    // Wands on dangerous foes.
    const big = near.slice().sort((a, b) => danger(b) - danger(a))[0];
    if (big && (danger(big) > p.hp * 1.2 || total > p.hp * 2)) {
      const wand =
        find(g, 'wand', 'fire') ?? find(g, 'wand', 'lightning') ?? find(g, 'wand', 'slow') ?? find(g, 'wand', 'sleep') ?? find(g, 'wand', 'banish') ?? p.pack.find((o) => o.kind === 'wand' && !isKnown(g, o));
      if (wand && !(wand.id === 'slow' && big.slow > 0) && big.mode !== 'sleep') return { t: 'use', uid: wand.uid, tx: big.x, ty: big.y };
      if (total > p.hp * 2.5 && hpf < 0.6) {
        const sp = find(g, 'potion', 'speed');
        if (sp && p.haste <= 0) return { t: 'use', uid: sp.uid };
      }
    }
    const adj = adjacent(g).filter((m) => m.mode !== 'sleep' || adjacent(g).length === 1);
    if (adj.length) {
      adj.sort((a, b) => a.hp - b.hp);
      mem.waits = 0;
      return attackAction(g, adj[0]);
    }
    // Ranged foes and casters: close in. Melee foes: let them come.
    const shooter = near.find((m) => def(m).ranged || def(m).spells || def(m).stationary || m.mode === 'flee');
    if (shooter && shooter.mode !== 'flee') {
      const dir = stepToward(g, (i) => i === idx(shooter.x, shooter.y));
      if (dir) return { t: 'move', dx: dir[0], dy: dir[1] };
    }
    const close = near.filter((m) => m.mode === 'hunt' && !(m.fear > 0));
    if (close.length && mem.waits < 6) {
      mem.waits++;
      return { t: 'wait' };
    }
    if (close.length) {
      const target = close[0];
      const dir = stepToward(g, (i) => i === idx(target.x, target.y));
      if (dir && mem.waits < 12) {
        mem.waits++;
        return { t: 'move', dx: dir[0], dy: dir[1] };
      }
    }
  } else {
    mem.waits = 0;
  }
  // Sleeping or wandering monster close by: sneak attack.
  const prey = visibleMons(g).find((m) => canSee(g, m.x, m.y) && m.mode !== 'hunt' && m.mode !== 'flee' && dist(m.x, m.y, p.x, p.y) <= 5 && danger(m) < p.hp * 3);
  if (prey) {
    const dir = stepToward(g, (i) => i === idx(prey.x, prey.y));
    if (dir) return { t: 'move', dx: dir[0], dy: dir[1] };
  }
  // Safe: rest, then use and identify things.
  if (hpf < 0.7 && mem.turns < 2500 && p.poison === 0) return { t: 'wait' };
  for (const it of p.pack) {
    if (it.kind === 'scroll' && isKnown(g, it) && (it.id === 'enchantA' || it.id === 'enchantW')) return { t: 'use', uid: it.uid };
    if (it.kind === 'potion' && isKnown(g, it) && (it.id === 'strength' || it.id === 'life')) return { t: 'use', uid: it.uid };
    if (it.kind === 'scroll' && isKnown(g, it) && it.id === 'identify' && p.pack.some((o) => !isKnown(g, o))) return { t: 'use', uid: it.uid };
  }
  if (hpf >= 0.95) {
    const unknownScroll = p.pack.find((o) => o.kind === 'scroll' && !isKnown(g, o));
    if (unknownScroll) return { t: 'use', uid: unknownScroll.uid };
    const unknownPotion = p.pack.find((o) => o.kind === 'potion' && !isKnown(g, o) && (o.qty ?? 1) >= 1);
    if (unknownPotion && p.pack.filter((o) => o.kind === 'potion' && !isKnown(g, o)).reduce((a, o) => a + (o.qty ?? 1), 0) >= 2) return { t: 'use', uid: unknownPotion.uid };
  }
  // Drop known junk to keep room.
  const junk = p.pack.find((o) => (o.kind === 'potion' && isKnown(g, o) && POTIONS[o.id].bad) || (o.kind === 'scroll' && isKnown(g, o) && SCROLLS[o.id].bad) || (o.kind === 'wand' && isKnown(g, o) && (o.charges ?? 0) <= 0));
  if (junk) return { t: 'drop', uid: junk.uid };
  const extraGear = p.pack.find((o) => o.kind === 'weapon' || o.kind === 'armor');
  if (extraGear && p.pack.length > 12) return { t: 'drop', uid: extraGear.uid };
  if (mem.turns < 1800) {
    const ex = exploreStep(g);
    if (ex) return ex;
  }
  return stairsStep(g) ?? exploreStep(g) ?? { t: 'wait' };
}
