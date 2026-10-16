/** Simple bots for tests and the balance sim. A good bot plans paths, a weak bot plays carelessly. */
import { MONSTERS, ORE_PIECES, UP_IDS, carryCap, drillPower, slowPer, type UpId } from './data';
import { Rng } from './rng';
import { buyUpgrade, canConvert, canRepair, canUpgrade, convert, repair } from './run';
import {
  ARENA,
  BEDROCK,
  DOME_RAD,
  GROUND,
  H,
  HATCH,
  KH,
  W,
  angleTo,
  canUse,
  idx,
  inDome,
  useGadget,
  weaponDps,
  weaponRot,
  type Fx,
  type Input,
  type Mon,
  type World,
} from './world';

export interface Bot {
  smart: boolean;
  rng: Rng;
  path: number[];
  pi: number;
  repath: number;
  home: boolean;
  stuck: number;
  lx: number;
  ly: number;
  jiggle: number;
  jx: number;
  target: number;
}

export function newBot(smart: boolean, seed = 1): Bot {
  return { smart, rng: new Rng(seed), path: [], pi: 0, repath: 0, home: false, stuck: 0, lx: 0, ly: 0, jiggle: 0, jx: 0, target: -1 };
}

const N = W * H;
const HOME = idx(HATCH, GROUND - 1);

/** Dijkstra over tiles. The cost is an estimate in seconds: moving, or digging then moving. */
function dijkstra(w: World, src: number): { dist: Float64Array; prev: Int32Array } {
  const dist = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const pw = drillPower(w.lv.drill);
  const heap: number[] = [];
  const hd: number[] = [];
  const push = (i: number, d: number): void => {
    heap.push(i);
    hd.push(d);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (hd[p] <= hd[c]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      [hd[p], hd[c]] = [hd[c], hd[p]];
      c = p;
    }
  };
  const pop = (): [number, number] => {
    const top: [number, number] = [heap[0], hd[0]];
    const li = heap.pop()!;
    const ld = hd.pop()!;
    if (heap.length) {
      heap[0] = li;
      hd[0] = ld;
      let c = 0;
      for (;;) {
        const l = c * 2 + 1;
        const r = l + 1;
        let m = c;
        if (l < heap.length && hd[l] < hd[m]) m = l;
        if (r < heap.length && hd[r] < hd[m]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        [hd[m], hd[c]] = [hd[c], hd[m]];
        c = m;
      }
    }
    return top;
  };
  dist[src] = 0;
  push(src, 0);
  while (heap.length) {
    const [i, d] = pop();
    if (d > dist[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const j = idx(nx, ny);
      const hp = w.hp[j];
      if (hp === BEDROCK) continue;
      let c = ny < y ? 0.4 : 0.27;
      if (hp > 0) c += hp / pw + 0.1;
      const nd = d + c;
      if (nd < dist[j]) {
        dist[j] = nd;
        prev[j] = i;
        push(j, nd);
      }
    }
  }
  return { dist, prev };
}

function pathTo(prev: Int32Array, src: number, dst: number): number[] {
  const p: number[] = [];
  let c = dst;
  while (c !== -1 && c !== src) {
    p.push(c);
    c = prev[c];
  }
  return c === src ? p.reverse() : [];
}

const VALUE = [0, 2.2, 2.6, 4, 14];

function plan(w: World, b: Bot): void {
  const k = w.k;
  const src = idx(Math.floor(k.x), Math.floor(k.y));
  b.path = [];
  b.pi = 0;
  b.target = -1;
  const from = dijkstra(w, src);
  const goHome = (): void => {
    b.home = true;
    b.path = inDome(w) ? [] : pathTo(from.prev, src, HOME);
  };
  if (w.phase === 'wave' || k.cargo.length >= carryCap(w.lv.carry)) return goHome();
  const homeD = dijkstra(w, HOME).dist;
  const slow = 1 + slowPer(w.lv.carry) * (k.cargo.length + 1.5);
  let best = -1;
  let bs = 0;
  const looseTiles = new Set(w.loose.map((l) => idx(Math.floor(l.x), Math.floor(l.y))));
  for (let i = 0; i < N; i++) {
    const loose = looseTiles.has(i);
    if (!loose && (w.ore[i] === 0 || w.hp[i] <= 0)) continue;
    const dk = from.dist[i];
    if (!isFinite(dk)) continue;
    const back = homeD[i] * slow * (b.smart ? 1.3 : 0.6) + (b.smart ? 4 : 0);
    if (b.smart && dk + back > w.timer) continue;
    if (!b.smart && w.timer < 22) continue;
    const need = w.ore[i] === 2 && w.res.water < 6 ? 2 : w.ore[i] === 3 && w.res.crystal < 5 ? 1.8 : w.ore[i] === 1 && w.res.iron > 30 ? 0.6 : 1;
    const v = loose ? 2 : VALUE[w.ore[i]] * (b.smart ? need : 1) * (w.ore[i] < 4 ? Math.min(ORE_PIECES[w.ore[i]], carryCap(w.lv.carry) - k.cargo.length) : 1);
    const s = b.smart ? v / (dk + 1.5) : b.rng.next() / (1 + dk * 0.05);
    if (s > bs) {
      bs = s;
      best = i;
    }
  }
  if (best < 0) return goHome();
  b.home = false;
  b.target = best;
  b.path = pathTo(from.prev, src, best);
}

function follow(w: World, b: Bot): Input {
  const k = w.k;
  const cx = Math.floor(k.x);
  const cy = Math.floor(k.y);
  const ci = idx(cx, cy);
  const at = b.path.indexOf(ci, b.pi);
  if (at >= 0) b.pi = at + 1;
  if (b.pi >= b.path.length) {
    b.repath = 0;
    return { x: 0, y: 0, rot: 0, aim: null, fire: false };
  }
  const nt = b.path[b.pi];
  const nx = nt % W;
  const ny = (nt - nx) / W;
  if (Math.abs(nx - cx) + Math.abs(ny - cy) > 1) {
    b.repath = 0;
  }
  let ix = 0;
  let iy = 0;
  if (nx !== cx) {
    ix = Math.sign(nx - cx);
    if (k.y + KH / 2 > ny + 1 + 0.05) iy = -1;
  } else if (ny < cy) iy = -1;
  else if (ny > cy) iy = 1;
  return { x: ix, y: iy, rot: 0, aim: null, fire: false };
}

function defense(w: World, b: Bot, fx: Fx[]): Input {
  let target: Mon | null = null;
  const visible = w.mons.filter((m) => Math.abs(m.x) < ARENA - 0.3);
  if (b.smart) {
    let be = Infinity;
    const rot = weaponRot(w);
    const cur = visible.find((m) => m.uid === b.target);
    for (const m of visible) {
      const d = MONSTERS[m.id];
      const dist = d.kind === 'ground' || d.kind === 'titan' ? Math.abs(m.x) - DOME_RAD : d.kind === 'ranged' ? Math.abs(m.x) - 8 : Math.hypot(m.x, m.y) - DOME_RAD;
      const turn = Math.abs(angleTo(m.x, m.y) - w.angle) / rot;
      const eta = Math.max(0, dist) / d.speed - (d.kind === 'dive' ? 3 : 0) - m.dmg * 0.05 + turn * 1.5 + (m.hp / weaponDps(w)) * 0.3;
      if (eta < be) {
        be = eta;
        target = m;
      }
    }
    if (cur && target && cur !== target && be > -1) {
      const d = MONSTERS[cur.id];
      const dist = d.kind === 'ranged' ? Math.abs(cur.x) - 8 : Math.hypot(cur.x, cur.y) - DOME_RAD - d.size / 2;
      if (dist / d.speed < 6 || be > 1) target = cur;
    }
    const total = w.mons.reduce((a, m) => a + m.hp, 0);
    if (canUse(w, 'strike') && (total > weaponDps(w) * 14 || (w.domeHp < 40 && w.mons.length > 2))) useGadget(w, 'strike', fx);
  } else {
    // Naive: shoot the monster that is closest to the dome right now.
    let bd = Infinity;
    for (const m of visible) {
      const d = Math.hypot(m.x, m.y);
      if (d < bd) {
        bd = d;
        target = m;
      }
    }
    if (canUse(w, 'strike') && w.mons.length > 6) useGadget(w, 'strike', fx);
  }
  b.target = target?.uid ?? -1;
  if (!target) return { x: 0, y: 0, rot: 0, aim: Math.PI / 2, fire: false };
  let aim = angleTo(target.x, target.y);
  if (!b.smart) aim += (b.rng.next() - 0.5) * 0.1;
  return { x: 0, y: 0, rot: 0, aim, fire: true };
}

/** One bot input for this tick. */
export function botInput(w: World, b: Bot, dt: number, fx: Fx[]): Input {
  if (w.phase === 'wave' && w.docked) return defense(w, b, fx);
  const k = w.k;
  // Lift home when the trip is long.
  if (b.smart && b.home && canUse(w, 'lift') && k.y - GROUND > 10) useGadget(w, 'lift', fx);
  b.repath -= dt;
  if (b.repath <= 0 || (w.phase === 'wave' && !b.home)) {
    plan(w, b);
    b.repath = 0.6;
  }
  // Stuck check.
  if (Math.hypot(k.x - b.lx, k.y - b.ly) > 0.05 || k.dig >= 0) {
    b.stuck = 0;
    b.lx = k.x;
    b.ly = k.y;
  } else if ((b.stuck += dt) > 1.2) {
    b.stuck = 0;
    b.jiggle = 0.35;
    b.jx = b.rng.next() < 0.5 ? -1 : 1;
    b.repath = 0;
    if (canUse(w, 'blast')) useGadget(w, 'blast', fx);
  }
  if (b.jiggle > 0) {
    b.jiggle -= dt;
    return { x: b.jx, y: -1, rot: 0, aim: null, fire: false };
  }
  return follow(w, b);
}

/** Spend resources in the workshop. */
export function botShop(w: World, b: Bot): void {
  if (b.smart) {
    while (w.domeHp < w.domeMax - 15 && w.domeHp < 70 && repair(w));
    while (canConvert(w) && w.res.iron > 14 && w.res.crystal < 4) convert(w);
    const weight: Record<UpId, number> = { laser: 1.4, drill: 1.25, shield: 1.0, carry: 1.0, jet: 0.7 };
    for (let guard = 0; guard < 30; guard++) {
      const opts = UP_IDS.filter((id) => canUpgrade(w, id)).sort((a, c) => w.lv[a] / weight[a] - w.lv[c] / weight[c]);
      if (!opts.length) break;
      buyUpgrade(w, opts[0]);
    }
    while (w.domeHp < w.domeMax - 20 && canRepair(w) && w.res.iron > 6) repair(w);
  } else {
    for (let guard = 0; guard < 30; guard++) {
      const opts = UP_IDS.filter((id) => canUpgrade(w, id));
      if (!opts.length || b.rng.next() < 0.3) break;
      buyUpgrade(w, opts[Math.floor(b.rng.next() * opts.length)]);
    }
    if (w.domeHp < 40) repair(w);
  }
}
