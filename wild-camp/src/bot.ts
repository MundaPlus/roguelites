/** Survival bots for the debug API and the balance sim. They read the state, call game actions and return movement. */
import { CREATURES, ITEMS, NODES, PARTS, RECIPES, SEASON_DAYS, STRUCTS, type Slot } from './data';
import {
  canCraft,
  cook,
  count,
  craft,
  dayNum,
  dist,
  eat,
  equip,
  foodValue,
  fuelFire,
  isLit,
  nearFire,
  phase,
  portalStruct,
  seasonDay,
  seasonOf,
  setGoal,
  tierAt,
  useItem,
  dayFrac,
  type Creature,
  type Game,
  type Goal,
  type Input,
  type Struct,
} from './game';
import { reach } from './world';

export type BotLevel = 'good' | 'weak' | 'random';

type Act = { k: 'goal'; goal: Goal } | { k: 'move'; x: number; y: number } | { k: 'craft'; id: string } | { k: 'idle' };

const SRC: Record<string, string[]> = {
  twigs: ['sapling'],
  grass: ['grass'],
  log: ['tree', 'oak'],
  rock: ['boulder', 'vein'],
  flint: ['flint', 'boulder'],
  gold: ['vein', 'boulder'],
  reeds: ['reeds'],
  petals: ['flower'],
  mushroom: ['mushroom'],
};
const CRE_SRC: Record<string, string> = { fur: 'yak', silk: 'spider', tooth: 'wolf' };
const FOOD_NODES = ['berry', 'carrot', 'mushroom'];

export class Bot {
  private wait = 0;
  private reachMask: Uint8Array | null = null;
  base: { x: number; y: number } | null = null;
  mode = '';
  private rdir = { x: 0, y: 0, t: 0 };
  private lastPos = { x: 0, y: 0, t: 0 };
  private banned = new Map<number, number>();

  constructor(
    public level: BotLevel,
    private rand: () => number = Math.random,
  ) {}

  input(g: Game): Input {
    const out: Input = { mx: 0, my: 0 };
    if (g.over || g.winT > 0) return out;
    if (!this.reachMask) this.reachMask = reach(g.w.water, Math.floor(g.w.start.x), Math.floor(g.w.start.y));
    if (this.level === 'random') return this.randomInput(g, out);
    // Dodge boss slams every tick.
    const p = g.p;
    for (const c of g.cre) {
      if (c.st !== 'windup' || c.wx === undefined) continue;
      const area = CREATURES[c.k].area ?? 2;
      const d = dist(p.x, p.y, c.wx, c.wy!);
      if (d < area + 0.6 && this.level === 'good') {
        let dx = p.x - c.wx;
        let dy = p.y - c.wy!;
        if (Math.hypot(dx, dy) < 0.3) {
          dx = p.x - c.x;
          dy = p.y - c.y;
        }
        const len = Math.hypot(dx, dy) || 1;
        setGoal(g, null);
        out.mx = dx / len;
        out.my = dy / len;
        this.mode = 'dodge';
        return out;
      }
      if (this.level === 'good' && p.goal?.kind === 'creature' && p.goal.id === c.id) {
        // Wait outside the slam, then go back in.
        setGoal(g, null);
        this.mode = 'wait';
        return out;
      }
    }
    if (this.wait-- > 0) {
      if (this.mode === 'flee' || this.mode === 'move') return this.moveOut;
      return out;
    }
    this.wait = 6;
    const a = this.level === 'good' ? this.think(g) : this.weak(g);
    return this.apply(g, a, out);
  }

  private moveOut: Input = { mx: 0, my: 0 };
  private fleeUntil = 0;

  private apply(g: Game, a: Act, out: Input): Input {
    this.moveOut = { mx: 0, my: 0 };
    switch (a.k) {
      case 'goal': {
        const cur = g.p.goal;
        if (!cur || cur.kind !== a.goal.kind || cur.id !== a.goal.id || (a.goal.kind === 'pos' && dist(cur.x, cur.y, a.goal.x, a.goal.y) > 0.6)) setGoal(g, a.goal);
        return out;
      }
      case 'move':
        setGoal(g, null);
        out.mx = a.x;
        out.my = a.y;
        this.moveOut = { ...out };
        return out;
      case 'craft':
        craft(g, a.id);
        return out;
      case 'idle':
        setGoal(g, null);
        return out;
    }
  }

  private randomInput(g: Game, out: Input): Input {
    if (this.rdir.t-- <= 0) {
      const a = this.rand() * Math.PI * 2;
      this.rdir = { x: Math.cos(a), y: Math.sin(a), t: 30 + Math.floor(this.rand() * 90) };
    }
    if (g.p.hunger < 60) {
      const i = g.p.inv.findIndex((s) => s && ITEMS[s.id].food);
      if (i >= 0) eat(g, i);
    }
    if (this.rand() < 0.02) {
      const n = this.nearestNode(g, Object.keys(NODES), 6);
      if (n) setGoal(g, { kind: 'node', id: n.id, x: n.x, y: n.y });
    }
    if (g.p.goal) return out;
    out.mx = this.rdir.x;
    out.my = this.rdir.y;
    return out;
  }

  // ---------------- helpers ----------------

  private ok(x: number, y: number): boolean {
    const m = this.reachMask!;
    return m[Math.floor(y) * 72 + Math.floor(x)] === 1;
  }

  private danger(g: Game, x: number, y: number): boolean {
    for (const c of g.cre) {
      const d = CREATURES[c.k];
      if (d.mood !== 'hostile' && !c.angry) continue;
      const r = d.boss ? 10 : c.k === 'spider' && phase(g) === 'day' ? 3.5 : d.aggro;
      if (dist(c.x, c.y, x, y) < r) return true;
    }
    return false;
  }

  nearestNode(g: Game, kinds: string[], maxD = 70, safe = true): { id: number; x: number; y: number; k: string } | null {
    const p = g.p;
    let best = null;
    let bd = maxD;
    for (const n of g.w.nodes) {
      if (n.s !== 0 || !kinds.includes(n.k)) continue;
      if ((this.banned.get(n.id) ?? -1) > g.time) continue;
      const d = dist(n.x, n.y, p.x, p.y);
      if (d >= bd) continue;
      if (!this.ok(n.x, n.y)) continue;
      if (safe && this.danger(g, n.x, n.y)) continue;
      bd = d;
      best = n;
    }
    return best;
  }

  private nearestCre(g: Game, k: string, maxD = 60): Creature | null {
    let best = null;
    let bd = maxD;
    for (const c of g.cre) {
      if (c.k !== k) continue;
      const d = dist(c.x, c.y, g.p.x, g.p.y);
      if (d < bd && this.ok(c.x, c.y)) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private has(g: Game, id: string): boolean {
    const e = g.p.eq;
    return count(g, id) > 0 || e.hand?.id === id || e.head?.id === id || e.body?.id === id;
  }

  private equipId(g: Game, id: string): void {
    const i = g.p.inv.findIndex((s) => s && s.id === id);
    if (i >= 0) equip(g, i);
  }

  private weaponDmg(g: Game): number {
    let best = 10;
    for (const s of [...g.p.inv, g.p.eq.hand]) if (s && ITEMS[s.id].slot === 'hand' && !ITEMS[s.id].light) best = Math.max(best, ITEMS[s.id].dmg ?? 10);
    return best;
  }

  private armor(g: Game): number {
    let a = 0;
    for (const s of [...g.p.inv, g.p.eq.body]) if (s && ITEMS[s.id].absorb && ITEMS[s.id].slot === 'body' && (s.d ?? 0) > 60) a = Math.max(a, ITEMS[s.id].absorb!);
    return a;
  }

  private foodHunger(g: Game): number {
    let n = 0;
    for (const s of g.p.inv) if (s && ITEMS[s.id].food && s.id !== 'mmeat') n += foodValue(g, s).hunger * s.n;
    return n;
  }

  private goNode(n: { id: number; x: number; y: number }): Act {
    return { k: 'goal', goal: { kind: 'node', id: n.id, x: n.x, y: n.y } };
  }

  private goPos(x: number, y: number): Act {
    return { k: 'goal', goal: { kind: 'pos', id: 0, x, y } };
  }

  private litFire(g: Game, maxD: number): Struct | null {
    let best: Struct | null = null;
    let bd = maxD;
    for (const s of g.st) {
      if (s.k !== 'campfire' && s.k !== 'firepit') continue;
      if (s.k === 'campfire' && s.fuel <= 0) continue;
      const d = dist(s.x, s.y, g.p.x, g.p.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  // ---------------- planning ----------------

  /** Next action to get `n` of `item` into the inventory, or null when it is there. */
  private plan(g: Game, item: string, n: number, depth = 0): Act | null {
    const have = count(g, item);
    if (have >= n) return null;
    if (depth > 4) return { k: 'idle' };
    const r = RECIPES.find((x) => x.out === item && !x.place);
    if (r) {
      for (const [it, k] of r.cost) {
        const a = this.plan(g, it, k * Math.max(1, Math.ceil((n - have) / r.n)), depth + 1);
        if (a) return a;
      }
      if (r.tier > tierAt(g)) return this.toBase(g, r.tier);
      return { k: 'craft', id: r.id };
    }
    return this.gather(g, item, depth);
  }

  private toBase(g: Game, tier: number): Act {
    const st = g.st.find((s) => (STRUCTS[s.k].tier ?? 0) >= tier && this.ok(s.x, s.y));
    if (st) return this.goPos(st.x + 1.2, st.y + 0.6);
    if (tier >= 2) return this.planStruct(g, 'alchemy') ?? { k: 'idle' };
    return this.planStruct(g, 'science') ?? { k: 'idle' };
  }

  private planStruct(g: Game, id: string): Act | null {
    const r = RECIPES.find((x) => x.id === id)!;
    for (const [it, k] of r.cost) {
      const a = this.plan(g, it, k);
      if (a) return a;
    }
    if (r.tier > tierAt(g)) return this.toBase(g, r.tier);
    if (id === 'science' || id === 'alchemy') {
      if (!this.base) this.base = { x: g.p.x, y: g.p.y };
      else if (dist(g.p.x, g.p.y, this.base.x, this.base.y) > 3) return this.goPos(this.base.x, this.base.y);
    }
    return { k: 'craft', id };
  }

  private gather(g: Game, item: string, depth = 0): Act {
    const kinds = SRC[item];
    if (kinds) {
      const needTool = (k: string): 'chop' | 'mine' | undefined => NODES[k].tool;
      const usable = kinds.filter((k) => {
        const t = needTool(k);
        if (!t) return true;
        return this.hasTool(g, t);
      });
      if (!usable.length) {
        const t = needTool(kinds[0])!;
        return this.plan(g, t === 'chop' ? 'axe' : 'pickaxe', 1, depth + 1) ?? { k: 'idle' };
      }
      // Prefer the first kind (flint nodes over boulders for flint).
      for (const k of usable) {
        const n = this.nearestNode(g, [k], k === usable[0] ? 22 : 70);
        if (n) return this.goNode(n);
      }
      const n = this.nearestNode(g, usable, 90);
      if (n) return this.goNode(n);
      // Missing tool for the better source?
      const t = kinds.map(needTool).find((x) => x && !this.hasTool(g, x));
      if (t) return this.plan(g, t === 'chop' ? 'axe' : 'pickaxe', 1, depth + 1) ?? { k: 'idle' };
      return this.explore(g);
    }
    const ck = CRE_SRC[item];
    if (ck === 'yak') {
      const ready = this.weaponDmg(g) >= 34 && this.armor(g) >= 0.55 && g.p.hp > g.p.maxHp * 0.8;
      if (!ready || phase(g) !== 'day') return this.explore(g);
      let best: Creature | null = null;
      let bd = 60;
      for (const c of g.cre) {
        if (c.k !== 'yak') continue;
        const d = dist(c.x, c.y, g.p.x, g.p.y);
        const crowd = g.cre.filter((o) => o.k === 'yak' && o !== c && dist(o.x, o.y, c.x, c.y) < 5).length;
        if ((crowd === 0 || c.angry) && d < bd && this.ok(c.x, c.y)) {
          bd = d;
          best = c;
        }
      }
      if (best) return { k: 'goal', goal: { kind: 'creature', id: best.id, x: best.x, y: best.y } };
      return this.explore(g);
    }
    if (ck) {
      if (ck === 'spider') {
        const nest = this.nearestNode(g, ['nest'], 50, false);
        if (nest && phase(g) === 'day') return this.goNode(nest);
      }
      const c = this.nearestCre(g, ck, 60);
      if (c && phase(g) === 'day') return { k: 'goal', goal: { kind: 'creature', id: c.id, x: c.x, y: c.y } };
      return this.explore(g);
    }
    return this.explore(g);
  }

  private hasTool(g: Game, t: 'chop' | 'mine'): boolean {
    const h = g.p.eq.hand;
    if (h && ITEMS[h.id].tool === t) return true;
    return g.p.inv.some((s) => s && ITEMS[s.id].tool === t);
  }

  private explore(g: Game): Act {
    if (this.rdir.t-- <= 0 || !this.ok(g.p.x + this.rdir.x * 6, g.p.y + this.rdir.y * 6)) {
      for (let i = 0; i < 10; i++) {
        const a = this.rand() * Math.PI * 2;
        const x = g.p.x + Math.cos(a) * 12;
        const y = g.p.y + Math.sin(a) * 12;
        if (x > 3 && y > 3 && x < 69 && y < 69 && this.ok(x, y)) {
          this.rdir = { x, y, t: 20 };
          break;
        }
      }
    }
    return this.goPos(this.rdir.x, this.rdir.y);
  }

  // ---------------- the good bot ----------------

  private think(g: Game): Act {
    const p = g.p;
    const ph = phase(g);
    if (!this.base) {
      const sci = g.st.find((s) => s.k === 'science');
      if (sci) this.base = { x: sci.x, y: sci.y };
    }
    this.manageGear(g);

    // Stuck check: ban the goal node if we do not move for a while.
    if (dist(p.x, p.y, this.lastPos.x, this.lastPos.y) > 0.5) this.lastPos = { x: p.x, y: p.y, t: g.time };
    else if (g.time - this.lastPos.t > 12 && p.goal?.kind === 'node') {
      this.banned.set(p.goal.id, g.time + 120);
      setGoal(g, null);
      this.lastPos.t = g.time;
    }

    this.tidy(g);
    // Heal and eat.
    if (p.hp < p.maxHp * 0.5) {
      for (const id of ['salve', 'poultice']) {
        const i = p.inv.findIndex((s) => s?.id === id);
        if (i >= 0) {
          useItem(g, i);
          return { k: 'idle' };
        }
      }
    }
    this.cookAll(g);
    if (p.hunger < p.maxHunger - 35 || (p.hp < p.maxHp * 0.5 && p.hunger < p.maxHunger - 25)) {
      const i = this.bestFood(g, p.hunger < 25);
      if (i >= 0) eat(g, i);
    }
    if (p.san < p.maxSan * 0.45) {
      const i = p.inv.findIndex((s) => s?.id === 'cmushroom');
      if (i >= 0) eat(g, i);
    }

    // Threats
    const t = this.threat(g);
    if (t) {
      const d = CREATURES[t.k];
      const wd = this.weaponDmg(g);
      const strong = wd >= 30 && this.armor(g) > 0;
      const low = p.hp < p.maxHp * 0.35;
      let fight = d.boss ? this.bossReady(g) : (strong && !low) || (wd >= 16 && p.hp > p.maxHp * 0.45) || d.speed > 4 || t.hp <= wd * 2;
      if (g.time < this.fleeUntil && !(d.speed > 4)) fight = false;
      if (!fight && g.time >= this.fleeUntil) this.fleeUntil = g.time + 4;
      if (fight) {
        this.mode = 'fight';
        return { k: 'goal', goal: { kind: 'creature', id: t.id, x: t.x, y: t.y } };
      }
      this.mode = 'flee';
      return this.flee(g);
    }

    // Night and light
    const lateDusk = ph === 'dusk' && this.toNight(g) < 12;
    if (ph === 'night' || lateDusk) {
      this.mode = 'night';
      return this.night(g);
    }
    if (ph === 'dusk') {
      // Head home if the base fire is close enough.
      const pit = g.st.find((s) => s.k === 'firepit' && this.base && dist(s.x, s.y, this.base.x, this.base.y) < 6);
      if (pit && dist(pit.x, pit.y, p.x, p.y) < 40 && dist(pit.x, pit.y, p.x, p.y) > 3) {
        this.mode = 'home';
        return this.goPos(pit.x + 1, pit.y + 1);
      }
    }

    // Temperature
    if (p.temp < 8) {
      this.mode = 'cold';
      return this.warmUp(g);
    }
    if (p.temp > 62) {
      const forest = this.nearestNode(g, ['tree', 'oak'], 30);
      if (forest) {
        this.mode = 'shade';
        return this.goPos(forest.x + 0.6, forest.y + 0.6);
      }
    }

    // Loot
    let loot: Goal | null = null;
    let ld = 1e9;
    for (const d of g.drops) {
      const k = dist(d.x, d.y, p.x, p.y);
      const part = ITEMS[d.s.id].part;
      if (k > (part ? 60 : 9) || (!part && d.s.id === 'rot') || !this.ok(d.x, d.y)) continue;
      const score = part ? k - 100 : k;
      if (score < ld && (part || p.inv.some((x) => !x || (x.id === d.s.id && x.n < ITEMS[x.id].stack)))) {
        ld = score;
        loot = { kind: 'drop', id: d.id, x: d.x, y: d.y };
      }
    }
    if (loot) {
      this.mode = 'loot';
      return { k: 'goal', goal: loot };
    }

    // Portal
    const portal = portalStruct(g);
    const held = PARTS.filter((id) => count(g, id) > 0);
    if (held.length) {
      this.mode = 'portal';
      return { k: 'goal', goal: { kind: 'struct', id: portal.id, x: portal.x, y: portal.y } };
    }

    // Food stock
    if (this.foodHunger(g) < 90 || (p.hunger < 60 && this.foodHunger(g) < 30)) {
      const a = this.getFood(g);
      if (a) {
        this.mode = 'food';
        return a;
      }
    }

    // Boss
    const boss = g.cre.find((c) => CREATURES[c.k].boss);
    if (boss && !this.has(g, 'heart') && !(portal.parts ?? []).includes('heart') && this.bossReady(g) && ph === 'day') {
      this.mode = 'boss';
      return { k: 'goal', goal: { kind: 'creature', id: boss.id, x: boss.x, y: boss.y } };
    }

    // Progress
    const a = this.progress(g);
    if (a) return a;
    this.mode = 'explore';
    return this.explore(g);
  }

/** Run in the land direction that keeps away from all threats. */
  private flee(g: Game): Act {
    const p = g.p;
    let bx = 0;
    let by = 0;
    let bs = -1e9;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = p.x + Math.cos(a) * 3;
      const y = p.y + Math.sin(a) * 3;
      if (!this.ok(x, y) || !this.ok(p.x + Math.cos(a), p.y + Math.sin(a))) continue;
      let s = 0;
      for (const c of g.cre) {
        const d = CREATURES[c.k];
        if (d.mood !== 'hostile' && !c.angry) continue;
        const k = dist(c.x, c.y, x, y);
        if (k < 12) s -= 30 / (k + 0.5);
      }
      if (this.base) s -= dist(x, y, this.base.x, this.base.y) * 0.05;
      if (phase(g) === 'night' && isLit(g, x, y)) s += 20;
      if (s > bs) {
        bs = s;
        bx = Math.cos(a);
        by = Math.sin(a);
      }
    }
    return { k: 'move', x: bx, y: by };
  }

/** Drop junk when the pockets are nearly full. */
  private tidy(g: Game): void {
    const inv = g.p.inv;
    if (inv.filter((x) => !x).length >= 2) return;
    const keep: Record<string, number> = { rot: 0, mmeat: 0, cmmeat: 2, reeds: 6, petals: 6, flint: 6, rock: 12, gold: 8, twigs: 10, grass: 16, log: 12, silk: 6, tooth: 4, fur: 6, fuelx: 3, berries: 10 };
    for (let i = 0; i < inv.length; i++) {
      const s = inv[i];
      if (!s || keep[s.id] === undefined) continue;
      const total = count(g, s.id);
      if (total > keep[s.id]) {
        inv[i] = null;
        return;
      }
    }
    // Duplicate tools.
    const seen = new Set<string>();
    for (let i = 0; i < inv.length; i++) {
      const s = inv[i];
      if (!s || !ITEMS[s.id].slot) continue;
      if (seen.has(s.id) || g.p.eq[ITEMS[s.id].slot!]?.id === s.id) {
        inv[i] = null;
        return;
      }
      seen.add(s.id);
    }
  }

  private toNight(g: Game): number {
    const f = dayFrac(g);
    const s = seasonOf(g);
    const end = { autumn: 0.73, winter: 0.6, spring: 0.73, summer: 0.8 }[s];
    return (end - f) * 160;
  }

  private bossReady(g: Game): boolean {
    const p = g.p;
    return this.weaponDmg(g) >= 34 && this.armor(g) >= 0.55 && p.hp > p.maxHp * 0.6 && p.hunger > 50 && this.foodHunger(g) >= 30;
  }

  private threat(g: Game): Creature | null {
    const p = g.p;
    let best: Creature | null = null;
    let bd = 1e9;
    for (const c of g.cre) {
      const d = CREATURES[c.k];
      const k = dist(c.x, c.y, p.x, p.y);
      const chasing = c.st === 'chase' || c.st === 'windup';
      const hostile = (d.mood === 'hostile' || c.angry) && chasing;
      if (!hostile) continue;
      if (k > (d.boss ? 11 : 7)) continue;
      if (k < bd) {
        bd = k;
        best = c;
      }
    }
    return best;
  }

  private bestFood(g: Game, desperate: boolean): number {
    let bi = -1;
    let bs = -1e9;
    g.p.inv.forEach((s, i) => {
      if (!s || !ITEMS[s.id].food) return;
      const v = foodValue(g, s);
      if (!desperate && (v.hp < -3 || v.san < -9)) return;
      const score = v.hunger + v.hp * 1.5 + v.san * 0.5 - (s.f ?? 1) * 8;
      if (score > bs) {
        bs = score;
        bi = i;
      }
    });
    return bi;
  }

  private cookAll(g: Game): void {
    if (!nearFire(g, 2.5)) return;
    for (let k = 0; k < 10; k++) {
      const i = g.p.inv.findIndex((s) => s && ITEMS[s.id].food?.cook && s.id !== 'berries');
      if (i < 0 || !cook(g, i)) break;
    }
  }

  private getFood(g: Game): Act | null {
    const n = this.nearestNode(g, FOOD_NODES, 26);
    if (n) return this.goNode(n);
    if (this.weaponDmg(g) >= 30) {
      const b = this.nearestCre(g, 'boar', 25) ?? (this.armor(g) > 0 ? this.nearestCre(g, 'yak', 25) : null);
      if (b && phase(g) === 'day') return { k: 'goal', goal: { kind: 'creature', id: b.id, x: b.x, y: b.y } };
    }
    const far = this.nearestNode(g, FOOD_NODES, 60);
    if (far) return this.goNode(far);
    return null;
  }

  private warmUp(g: Game): Act {
    const f = this.litFire(g, 10);
    if (f) {
      if (f.fuel < 50 && dist(f.x, f.y, g.p.x, g.p.y) < 2) fuelFire(g, f);
      return this.goPos(f.x + 1, f.y + 0.5);
    }
    if (canCraft(g, 'campfire')) return { k: 'craft', id: 'campfire' };
    return this.plan(g, 'grass', 3) ?? this.plan(g, 'log', 2) ?? this.explore(g);
  }

  private night(g: Game): Act {
    const p = g.p;
    const f = this.litFire(g, 14);
    if (f && (f.fuel > 15 || this.fuelCount(g) > 0)) {
      const d = dist(f.x, f.y, p.x, p.y);
      if (d < 2.2) {
        if (f.fuel < STRUCTS[f.k].maxFuel! * 0.45) fuelFire(g, f);
        if (f.fuel <= 0 && f.k === 'firepit') fuelFire(g, f);
        this.cookAll(g);
        // Craft at the base while waiting.
        if (tierAt(g) >= 1) {
          const a = this.progress(g, true);
          if (a?.k === 'craft') return a;
        }
        const bed = p.inv.findIndex((s) => s?.id === 'bedroll');
        if (bed >= 0 && phase(g) === 'night' && p.hunger > 70 && f.fuel > 20) useItem(g, bed);
        return { k: 'idle' };
      }
      return this.goPos(f.x + 0.8, f.y + 0.6);
    }
    if (canCraft(g, 'campfire') && this.ok(p.x, p.y)) return { k: 'craft', id: 'campfire' };
    // Torch
    const h = p.eq.hand;
    if (!(h && ITEMS[h.id].light)) {
      for (const id of ['lantern', 'lighter', 'torch']) {
        if (count(g, id) > 0) {
          this.equipId(g, id);
          break;
        }
      }
      if (!(p.eq.hand && ITEMS[p.eq.hand.id].light) && canCraft(g, 'torch')) {
        craft(g, 'torch');
        this.equipId(g, 'torch');
      }
    }
    if (isLit(g, p.x, p.y)) {
      // Use the time: gather close by.
      return this.plan(g, 'grass', 6) ?? this.plan(g, 'log', 4) ?? { k: 'idle' };
    }
    return this.plan(g, 'grass', 3) ?? this.plan(g, 'twigs', 2) ?? { k: 'idle' };
  }

  private fuelCount(g: Game): number {
    return count(g, 'log') + count(g, 'grass') + count(g, 'twigs');
  }

  private manageGear(g: Game): void {
    const p = g.p;
    const season = seasonOf(g);
    const want = (slot: Slot, ids: string[]): void => {
      for (const id of ids) {
        if (p.eq[slot]?.id === id) return;
        if (count(g, id) > 0) {
          this.equipId(g, id);
          return;
        }
      }
    };
    if (season === 'winter' && p.temp < 25) want('body', ['furcoat', 'sarmor', 'warmor', 'garmor']);
    else if (season === 'summer' && p.temp > 50 && phase(g) === 'day') want('body', ['vest', 'sarmor', 'warmor', 'garmor']);
    else want('body', ['sarmor', 'warmor', 'garmor']);
    if (season === 'winter') want('head', ['furhat', 'helm']);
    else if (season === 'summer' && phase(g) === 'day') want('head', ['strawhat', 'helm']);
    else if (p.san < p.maxSan * 0.5) want('head', ['crown', 'helm']);
    else want('head', ['helm']);
    // Put the light away in daylight.
    const h = p.eq.hand;
    if (h && ITEMS[h.id].light && phase(g) === 'day') {
      const i = p.inv.findIndex((s) => s && ITEMS[s.id].dmg && !ITEMS[s.id].light && ITEMS[s.id].slot === 'hand');
      if (i >= 0) equip(g, i);
    }
  }

  /** The next step on the crafting and portal plan. */
  private progress(g: Game, onlyCraft = false): Act | null {
    const p = g.p;
    const day = dayNum(g);
    const wants: [string, number][] = [];
    const lowTool = (id: string): boolean => !this.has(g, id);
    if (lowTool('axe')) wants.push(['axe', 1]);
    if (lowTool('pickaxe')) wants.push(['pickaxe', 1]);
    if (!this.has(g, 'torch') && !this.has(g, 'lantern')) wants.push(['torch', 1]);
    wants.push(['grass', 4], ['log', 3]);
    if (count(g, 'petals') >= 3 && count(g, 'mushroom') >= 1 && count(g, 'poultice') < 3) return { k: 'craft', id: 'poultice' };
    const out: Act[] = [];
    for (const [id, n] of wants) {
      const a = this.plan(g, id, n);
      if (a) {
        if (onlyCraft && a.k !== 'craft') continue;
        this.mode = 'want ' + id;
        return a;
      }
    }
    void out;
    if (!g.st.some((s) => s.k === 'science')) {
      this.mode = 'science';
      const a = this.planStruct(g, 'science');
      if (a && (!onlyCraft || a.k === 'craft')) return a;
      if (onlyCraft) return null;
    }
    const items: [string, number, boolean][] = [
      ['spear', 1, this.weaponDmg(g) < 34],
      ['garmor', 1, this.armor(g) === 0 && !canCraft(g, 'warmor') && count(g, 'log') < 6],
      ['warmor', 1, this.armor(g) < 0.75],
      ['furhat', 1, day >= SEASON_DAYS - 2 && day <= SEASON_DAYS * 2 && !this.has(g, 'furhat')],
      ['strawhat', 1, day >= SEASON_DAYS * 3 && !this.has(g, 'strawhat')],
      ['helm', 1, count(g, 'tooth') >= 2 && !this.has(g, 'helm')],
      ['cmushroom', 0, false],
    ];
    for (const [id, n, need] of items) {
      if (!need || !n) continue;
      const a = this.plan(g, id, n);
      if (a) {
        if (onlyCraft && a.k !== 'craft') continue;
        this.mode = 'want ' + id;
        return a;
      }
    }
    // A fire pit at the base.
    if (this.base && !g.st.some((s) => s.k === 'firepit' && dist(s.x, s.y, this.base!.x, this.base!.y) < 6)) {
      if (dist(p.x, p.y, this.base.x, this.base.y) < 3 || !onlyCraft) {
        const r = this.plan(g, 'rock', 8) ?? this.plan(g, 'log', 2);
        if (r) {
          if (!onlyCraft || r.k === 'craft') {
            this.mode = 'firepit mats';
            return r;
          }
        } else if (dist(p.x, p.y, this.base.x, this.base.y) < 3 && tierAt(g) >= 1) return { k: 'craft', id: 'firepit' };
        else if (!onlyCraft) return this.goPos(this.base.x, this.base.y);
      }
    }
    if (onlyCraft) {
      if (count(g, 'grass') >= 9 && count(g, 'rope') < 2) return { k: 'craft', id: 'rope' };
      return null;
    }
    // Portal parts in the world.
    if (this.weaponDmg(g) >= 34 && this.armor(g) > 0 && p.hp > p.maxHp * 0.55) {
      const mound = this.nearestNode(g, ['pcrank', 'pring', 'pcrystal'], 90, false);
      if (mound) {
        this.mode = 'part';
        return this.goNode(mound);
      }
    }
    // Wait for a boss: keep stock and wood.
    const fuel = this.plan(g, 'log', 8) ?? this.plan(g, 'grass', 12);
    if (fuel) {
      this.mode = 'stock';
      return fuel;
    }
    if (count(g, 'rope') < 2) return this.plan(g, 'rope', 2);
    if (!this.has(g, 'bedroll') && seasonDay(g) > 0) return this.plan(g, 'bedroll', 1);
    return null;
  }

  // ---------------- the weak bot ----------------

  private weak(g: Game): Act {
    const p = g.p;
    if (p.hunger < 50) {
      const i = p.inv.findIndex((s) => s && ITEMS[s.id].food);
      if (i >= 0) eat(g, i);
    }
    for (const c of g.cre) {
      if ((c.angry || CREATURES[c.k].mood === 'hostile') && c.st === 'chase' && dist(c.x, c.y, p.x, p.y) < 4) {
        return { k: 'goal', goal: { kind: 'creature', id: c.id, x: c.x, y: c.y } };
      }
    }
    for (const id of ['axe', 'pickaxe']) if (!this.has(g, id) && canCraft(g, id)) return { k: 'craft', id };
    if (phase(g) !== 'day') {
      const h = p.eq.hand;
      if (!(h && ITEMS[h.id].light)) {
        if (count(g, 'torch') > 0) this.equipId(g, 'torch');
        else if (canCraft(g, 'torch')) {
          craft(g, 'torch');
          this.equipId(g, 'torch');
        }
      }
    }
    if (p.goal && this.rand() < 0.9) return { k: 'goal', goal: p.goal };
    const kinds = ['sapling', 'grass', 'flint', 'berry', 'carrot', 'tree', 'boulder', 'mushroom', 'pcrank', 'pring', 'pcrystal'];
    const n = this.nearestNode(g, [kinds[Math.floor(this.rand() * kinds.length)]], 14, false);
    if (n) return this.goNode(n);
    return this.explore(g);
  }
}
