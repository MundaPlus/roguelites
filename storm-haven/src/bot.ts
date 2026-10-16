/** Build-order bots. `smartBot` plays well, `weakBot` plays at random. Both act on a Settlement. */
import { BUILDINGS, EVENTS, RES_IDS, type BuildingId, type GoodId, type ResId } from './data';
import {
  H,
  W,
  activeEvents,
  assign,
  bagTotal,
  canAfford,
  canPlace,
  eventCost,
  free,
  housing,
  orderProgress,
  orderTarget,
  pickBlueprint,
  pickOrder,
  place,
  sell,
  solveEvent,
  tribute,
  unassign,
  type Building,
  type OrderOpt,
  type Settlement,
} from './sim';

const BP_ORDER: BuildingId[] = ['brewery', 'mill', 'bakery', 'teahouse', 'brickyard', 'house', 'cookhouse', 'toolsmith', 'shrine', 'trading'];

function blueprintScore(s: Settlement, b: BuildingId): number {
  let sc = 20 - BP_ORDER.indexOf(b) * 2;
  if (b === 'bakery' && s.blueprints.includes('mill')) sc += 15;
  if (b === 'mill' && s.blueprints.includes('bakery')) sc += 15;
  if (b === 'house' && s.blueprints.includes('brickyard')) sc += 8;
  if (b === 'teahouse' && openRes(s, 'herbs')) sc += 4;
  if (b === 'cookhouse' && openRes(s, 'mushrooms') && openRes(s, 'herbs')) sc += 6;
  return sc;
}

function openRes(s: Settlement, r: ResId): boolean {
  const k = RES_IDS.indexOf(r);
  return s.res.some((x, i) => x === k && !s.fog[i] && s.amt[i] > 0);
}

function orderEase(s: Settlement, o: OrderOpt): number {
  const left = orderTarget(o) - orderProgress(s, o);
  switch (o.kind) {
    case 'make': {
      const g = o.good!;
      const fast: GoodId[] = ['wood', 'planks', 'grain', 'berries', 'stone', 'clay', 'herbs', 'mushrooms'];
      return (fast.includes(g) ? 1 : 2.5) * left;
    }
    case 'build':
      return left * (o.bld === 'shelter' ? 6 : o.bld === 'warehouse' ? 10 : 30);
    case 'glades':
      return left * 25;
    case 'housed':
      return Math.max(0, o.n - housing(s)) * 8 + 10;
    case 'pop':
      return left * 25;
    case 'events':
      return 60;
    case 'resolve':
      return 90;
  }
}

/** Free tile nearest to (x, y) where the building can stand. */
function spot(s: Settlement, def: BuildingId, x: number, y: number, maxR = 12, avoidHearth = true): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  const h = s.b[0];
  for (let ty = Math.max(0, Math.round(y) - maxR); ty <= Math.min(H - 1, Math.round(y) + maxR); ty++)
    for (let tx = Math.max(0, Math.round(x) - maxR); tx <= Math.min(W - 1, Math.round(x) + maxR); tx++) {
      if (canPlace(s, def, tx, ty)) continue;
      if (avoidHearth && Math.abs(tx - h.x) <= 1 && Math.abs(ty - h.y) <= 1) continue;
      const d = Math.hypot(tx - x, ty - y);
      if (d < bd) {
        bd = d;
        best = { x: tx, y: ty };
      }
    }
  return best;
}

function served(s: Settlement, def: BuildingId, x: number, y: number): boolean {
  const r = BUILDINGS[def].radius ?? 6;
  return s.b.some((b) => b.def === def && Math.hypot(b.x - x, b.y - y) <= r - 1);
}

function unservedNode(s: Settlement, def: BuildingId, kinds: ResId[]): { x: number; y: number } | null {
  const h = s.b[0];
  const ks = kinds.map((k) => RES_IDS.indexOf(k));
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  s.res.forEach((r, i) => {
    if (r < 0 || s.fog[i] || !ks.includes(r) || s.amt[i] <= 3) return;
    const x = i % W;
    const y = Math.floor(i / W);
    if (served(s, def, x, y)) return;
    const d = Math.hypot(x - h.x, y - h.y);
    if (d < bd) {
      bd = d;
      best = { x, y };
    }
  });
  return best;
}

function towardGlade(s: Settlement): { x: number; y: number } {
  const h = s.b[0];
  const g = s.glades.filter((x) => !x.open).sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
  if (!g) return { x: h.x + 3, y: h.y };
  const d = Math.hypot(g.x - h.x, g.y - h.y);
  const k = Math.min(1, 3.5 / d);
  return { x: h.x + (g.x - h.x) * k, y: h.y + (g.y - h.y) * k };
}

const count = (s: Settlement, def: BuildingId): number => s.b.filter((b) => b.def === def).length;
const food = (s: Settlement): number => s.stock.berries + s.stock.mushrooms + s.stock.bread + s.stock.stew;

function tryBuild(s: Settlement, def: BuildingId, at?: { x: number; y: number } | null): boolean {
  if (!s.blueprints.includes(def) || !canAfford(s, BUILDINGS[def].cost)) return false;
  const h = s.b[0];
  const p = spot(s, def, at?.x ?? h.x, at?.y ?? h.y);
  if (!p) return false;
  return !!place(s, def, p.x, p.y);
}

function buildStep(s: Settlement): void {
  const sites = s.b.filter((b) => !b.built).length;
  if (sites >= 2 || (sites >= 1 && free(s).length === 0)) return;
  const pop = s.v.length;
  const has = (d: BuildingId): number => count(s, d);
  const own = (d: BuildingId): boolean => s.blueprints.includes(d);
  // Order of wants. The first affordable one is built.
  const wants: [BuildingId, boolean, ({ x: number; y: number } | null)?][] = [
    ['woodcutter', has('woodcutter') < 1, towardGlade(s)],
    ['gatherer', has('gatherer') < 1 && !!unservedNode(s, 'gatherer', ['berries', 'mushrooms', 'herbs']), unservedNode(s, 'gatherer', ['berries', 'mushrooms', 'herbs'])],
    ['shelter', housing(s) < pop && !(own('house') && s.stock.bricks >= 4 && s.stock.planks >= 6)],
    ['house', own('house') && housing(s) < pop + 2],
    ['lumber', has('lumber') < 1],
    ['quarry', has('quarry') < 1 && !!unservedNode(s, 'quarry', ['stone', 'clay']), unservedNode(s, 'quarry', ['stone', 'clay'])],
    ['farm', has('farm') < 1],
    ['woodcutter', has('woodcutter') < 2 && s.glades.some((g) => !g.open), towardGlade(s)],
    ['mill', own('mill') && has('mill') < 1],
    ['bakery', own('bakery') && has('bakery') < 1 && (has('mill') > 0 || !own('mill'))],
    ['brewery', own('brewery') && has('brewery') < 1],
    ['teahouse', own('teahouse') && has('teahouse') < 1 && openRes(s, 'herbs')],
    ['cookhouse', own('cookhouse') && has('cookhouse') < 1 && openRes(s, 'mushrooms')],
    ['brickyard', own('brickyard') && has('brickyard') < 1 && openRes(s, 'clay')],
    ['gatherer', has('gatherer') < 3 && !!unservedNode(s, 'gatherer', ['berries', 'mushrooms', 'herbs']), unservedNode(s, 'gatherer', ['berries', 'mushrooms', 'herbs'])],
    ['quarry', has('quarry') < 2 && !!unservedNode(s, 'quarry', ['stone', 'clay']), unservedNode(s, 'quarry', ['stone', 'clay'])],
    ['farm', has('farm') < 2 && (own('mill') || own('brewery')) && pop >= 10],
    ['warehouse', has('warehouse') < 1 && s.b.length > 9],
    ['shrine', own('shrine') && has('shrine') < 1],
    ['toolsmith', own('toolsmith') && has('toolsmith') < 1 && pop >= 12],
    ['trading', own('trading') && has('trading') < 1 && pop >= 12],
    ['woodcutter', has('woodcutter') < 3 && s.glades.some((g) => !g.open) && pop >= 12, towardGlade(s)],
  ];
  // Order needs come right after the basics. They never block.
  const extra: [BuildingId, boolean][] = [];
  for (const o of s.orders.slice(0, s.unlocked)) {
    if (o.done || !o.o) continue;
    if (o.o.kind === 'build' && builtCount2(s, o.o.bld!) < o.o.n) extra.push([o.o.bld!, true]);
  }
  const basics = has('woodcutter') > 0 && has('gatherer') + has('farm') > 0 && has('lumber') > 0;
  if (basics) wants.splice(2, 0, ...extra);
  for (const [def, ok, at] of wants) {
    if (!ok) continue;
    if (tryBuild(s, def, at)) return;
    // Wait for goods for the most urgent want, except order extras and cheap ones.
    if (def !== 'warehouse' && !extra.some((e) => e[0] === def)) return;
  }
}

const builtCount2 = (s: Settlement, d: BuildingId): number => s.b.filter((b) => b.def === d).length;

function staffStep(s: Settlement): void {
  const pop = s.v.length;
  const sites = s.b.filter((b) => !b.built).length;
  let avail = pop - (sites ? Math.min(2, sites + 1) : 0);
  const lowFood = food(s) < pop * 3;
  const pr: Building[] = [];
  const by = (d: BuildingId): Building[] => s.b.filter((b) => b.def === d && b.built);
  const useful = (b: Building): boolean => {
    const d = BUILDINGS[b.def];
    if (d.kind === 'gather') return !s.v.some((v) => v.job === b.id && v.note.startsWith('Nothing'));
    if (b.def === 'farm') return s.season !== 'storm';
    if (d.input && bagTotal(d.input) > 0) {
      const ok = (Object.keys(d.input) as GoodId[]).every((g) => s.stock[g] + (b.inb[g] ?? 0) >= (d.input![g] ?? 0) * 2);
      return ok || bagTotal(b.out) > 0;
    }
    return true;
  };
  const order: BuildingId[] = lowFood
    ? ['gatherer', 'woodcutter', 'farm', 'mill', 'bakery', 'cookhouse', 'lumber', 'quarry', 'brickyard', 'brewery', 'teahouse', 'toolsmith']
    : ['woodcutter', 'gatherer', 'lumber', 'farm', 'mill', 'bakery', 'quarry', 'brewery', 'teahouse', 'cookhouse', 'brickyard', 'toolsmith'];
  // First pass: one worker each. Second pass: fill.
  for (const pass of [1, 2])
    for (const d of order)
      for (const b of by(d)) {
        if (!useful(b)) continue;
        const want = pass === 1 ? 1 : BUILDINGS[d].workers;
        for (let k = pr.filter((x) => x === b).length; k < want; k++) pr.push(b);
      }
  const desired = new Map<number, number>();
  for (const b of pr) {
    if (avail <= 0) break;
    desired.set(b.id, (desired.get(b.id) ?? 0) + 1);
    avail--;
  }
  for (const b of s.b) while (b.w.length > (desired.get(b.id) ?? 0)) unassign(s, b.id);
  for (const b of s.b) while (b.w.length < (desired.get(b.id) ?? 0) && assign(s, b.id));
}

export function smartBot(s: Settlement): void {
  if (s.done) return;
  if (s.bpOffer) {
    const best = s.bpOffer.map((b, i) => [i, blueprintScore(s, b)] as [number, number]).sort((a, b) => b[1] - a[1])[0];
    pickBlueprint(s, best[0]);
  }
  s.orders.forEach((o, i) => {
    if (i < s.unlocked && o.opts) {
      const k = orderEase(s, o.opts[0]) <= orderEase(s, o.opts[1]) ? 0 : 1;
      pickOrder(s, i, k);
    }
  });
  for (const g of activeEvents(s)) {
    if (g.es !== 'active' || !g.ev) continue;
    const c = eventCost(s, g);
    const reserve = (Object.keys(c) as GoodId[]).every((k) => s.stock[k] - (c[k] ?? 0) >= (k === 'wood' || k === 'planks' ? 10 : k === 'berries' ? s.v.length * 2 : 0));
    if ((EVENTS[g.ev].danger || g.ev !== 'ruins' || s.stock.planks > 20) && reserve) solveEvent(s, g.id);
  }
  buildStep(s);
  staffStep(s);
  if (s.caravan) {
    if (s.stock.wood > 60) sell(s, 'wood', 20);
    if (s.stock.grain > 40) sell(s, 'grain', 10);
  }
  if (s.imp > 40) tribute(s);
}

/** A careless player: random blueprints and orders, random buildings in random places, random staffing. */
export function weakBot(s: Settlement, r: () => number): void {
  if (s.done) return;
  if (s.bpOffer) pickBlueprint(s, Math.floor(r() * s.bpOffer.length));
  s.orders.forEach((o, i) => {
    if (i < s.unlocked && o.opts) pickOrder(s, i, r() < 0.5 ? 0 : 1);
  });
  if (r() < 0.35) {
    const opts = s.blueprints.filter((b) => b !== 'road' && canAfford(s, BUILDINGS[b].cost));
    if (opts.length) {
      const def = opts[Math.floor(r() * opts.length)];
      const h = s.b[0];
      const p = spot(s, def, h.x + (r() - 0.5) * 10, h.y + (r() - 0.5) * 10);
      if (p) place(s, def, p.x, p.y);
    }
  }
  const built = s.b.filter((b) => b.built && BUILDINGS[b.def].workers > 0);
  if (built.length && r() < 0.6) {
    const b = built[Math.floor(r() * built.length)];
    if (r() < 0.75) assign(s, b.id);
    else unassign(s, b.id);
  }
}
