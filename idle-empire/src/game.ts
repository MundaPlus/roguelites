/** Pure game state and rules. No DOM here, so the sim and the bot can use it. */
import { Big } from './big';
import { BLESSINGS, CHALLENGES, CURSES, GOALS, LAYERS, NODE, REGIONS, TIERS, UPG, UPGRADES, WONDER, WONDER_BONUS } from './data';
import { Rng, hash } from './rng';

export interface Gen {
  amt: Big;
  bought: number;
}

/** One run path: a blessing, a curse and a goal. */
export interface Offer {
  b: string;
  c: string;
  g: string;
}

export interface LayerState {
  cur: Big;
  earned: Big;
  tree: string[];
  count: number;
}

export interface Game {
  v: 1;
  seed: number;
  gold: Big;
  best: Big;
  gens: Gen[];
  ups: string[];
  decrees: number;
  runTime: number;
  runClicks: number;
  path: Offer | null;
  offers: Offer[] | null;
  offerN: number;
  challenge: string | null;
  chDone: string[];
  layers: LayerState[];
  regions: number;
  wonder: number;
  time: number;
  clicks: number;
  totalGold: Big;
  bestLog: number;
  saved: number;
  auto: boolean;
  autoPrestige: boolean;
  finished: boolean;
  abandoned: boolean;
}

export interface Mods {
  tier: Big[];
  goldPow: number;
  click: Big;
  clickPct: number;
  critChance: number;
  critMult: number;
  decree: number;
  setBonus: number;
  genCost: number;
  stepMul: number;
  upCost: number;
  decreeCost: number;
  decreeGrow: number;
  gain: number[];
  maxTier: number;
  noClick: boolean;
  noUps: boolean;
  noDecree: boolean;
  offlineCap: number;
  offlineRate: number;
}

export function newGame(seed = (Math.random() * 2 ** 31) | 0): Game {
  const g: Game = {
    v: 1,
    seed,
    gold: Big.of(10),
    best: Big.of(10),
    gens: TIERS.map(() => ({ amt: Big.ZERO, bought: 0 })),
    ups: [],
    decrees: 0,
    runTime: 0,
    runClicks: 0,
    path: null,
    offers: null,
    offerN: 0,
    challenge: null,
    chDone: [],
    layers: LAYERS.map(() => ({ cur: Big.ZERO, earned: Big.ZERO, tree: [], count: 0 })),
    regions: 0,
    wonder: 0,
    time: 0,
    clicks: 0,
    totalGold: Big.ZERO,
    bestLog: 1,
    saved: Date.now(),
    auto: true,
    autoPrestige: true,
    finished: false,
    abandoned: false,
  };
  return g;
}

/** True if a skill node or upgrade is owned. */
export function has(g: Game, id: string): boolean {
  if (id.startsWith('u_')) return g.ups.includes(id);
  const layer = id[0] === 'c' ? 0 : id[0] === 's' ? 1 : 2;
  return g.layers[layer].tree.includes(id);
}

const done = (g: Game, id: string): boolean => g.chDone.includes(id);

/** All multipliers and rule changes for the current state. */
export function calcMods(g: Game): Mods {
  const ch = g.challenge;
  const bless = !ch && g.path ? g.path.b : '';
  const curse = !ch && g.path ? g.path.c : '';
  const cs = has(g, 's_path') ? 0.5 : 1;
  const curseF = (f: number): number => Math.pow(f, cs);
  const h = (id: string): boolean => has(g, id);

  let all = Big.ONE;
  const mulAll = (v: Big | number): void => {
    all = all.mul(v);
  };
  if (h('u_mint')) mulAll(5);
  if (h('u_bazaar')) mulAll(100);
  if (h('u_golden')) mulAll(1e5);
  if (h('u_roads')) {
    const sets = g.gens.reduce((a, x) => a + Math.floor(x.bought / 10), 0);
    mulAll(Math.max(1, sets));
  }
  if (h('c_favor')) mulAll(3);
  if (h('s_wealth')) mulAll(1000);
  if (h('t_mult')) mulAll(1e10);
  LAYERS.forEach((l, i) => mulAll(g.layers[i].earned.add(1).pow(l.pow)));
  if (done(g, 'ch_noclick')) mulAll(3);
  if (done(g, 'ch_austerity')) mulAll(10);
  if (bless === 'b_golden') mulAll(10);
  if (bless === 'b_momentum') mulAll(Math.pow(1 + g.runTime / 60, 2));
  if (curse === 'k_taxes') mulAll(curseF(0.1));
  if (g.regions > 3) mulAll(1e5);
  if (g.regions > 6) mulAll(1e10);
  if (g.regions > 8) mulAll(1e15);
  if (g.wonder > 0) mulAll(Big.pow10(WONDER_BONUS * g.wonder));

  let decree = 1.125;
  if (h('u_clock')) decree += 0.02;
  if (h('c_decree')) decree += 0.02;
  if (h('s_decree')) decree += 0.03;
  if (done(g, 'ch_lawless')) decree += 0.02;
  if (g.regions > 4) decree += 0.02;
  if (bless === 'b_law') decree += 0.03;
  if (g.decrees > 0) mulAll(Big.pow10(Math.log10(decree) * g.decrees));

  let setBonus = 2;
  if (h('u_guild')) setBonus += 0.2;
  if (h('u_ledger')) setBonus += 0.3;
  if (h('c_mile')) setBonus += 0.25;
  if (h('s_mile')) setBonus += 0.5;
  if (h('t_mile')) setBonus += 1;
  if (g.regions > 2) setBonus += 0.2;
  if (bless === 'b_fest') setBonus += 0.3;
  const setLog = Math.log10(setBonus);

  const tier = g.gens.map((gen, t) => {
    let v = Big.pow10(setLog * Math.floor(gen.bought / 10));
    if (t === 0) {
      v = v.mul(all);
      if (h('u_plow')) v = v.mul(3);
      if (bless === 'b_harvest') v = v.mul(100);
      if (curse === 'k_plague') v = v.mul(curseF(0.05));
      if (g.regions > 0) v = v.mul(1e4);
      if (h('u_trade')) v = v.mul(1 + Math.max(0, g.gold.log10()));
    }
    if (t === 1 && h('u_irrig')) v = v.mul(3);
    if (t < 4 && h('u_gran')) v = v.mul(10);
    if (t < 3 && done(g, 'ch_small')) v = v.mul(100);
    if (t >= 4) {
      if (h('u_cath')) v = v.mul(10);
      if (curse === 'k_roads') v = v.mul(curseF(0.01));
    }
    return v;
  });

  let goldPow = 1;
  if (ch === 'ch_lean') goldPow *= 0.8;
  if (done(g, 'ch_lean')) goldPow *= 1.02;
  if (h('t_power')) goldPow *= 1.05;
  if (g.regions > 9) goldPow *= 1.03;

  let click = 1;
  let clickPct = 0;
  if (h('u_tools')) click *= 5;
  if (h('c_click')) {
    click *= 10;
    clickPct += 0.1;
  }
  if (h('u_taxes')) clickPct += 0.05;
  if (bless === 'b_hands') {
    click *= 100;
    clickPct += 0.2;
  }
  if (curse === 'k_clumsy') click *= curseF(0.01);
  let critChance = h('u_touch') ? 0.1 : 0;
  let critMult = 10;
  if (bless === 'b_luck') {
    critChance = 0.3;
    critMult = 50;
  }

  let genCost = 0;
  if (bless === 'b_cheap') genCost -= 3;
  let stepMul = 1;
  if (curse === 'k_corrupt') stepMul *= 1 + 0.25 * cs;
  if (ch === 'ch_inflation') stepMul *= 2;
  if (done(g, 'ch_inflation')) stepMul *= 0.9;
  let upCost = 0;
  if (bless === 'b_scholar') upCost -= 5;
  if (curse === 'k_unrest') upCost += 4 * cs;
  let decreeCost = 0;
  if (curse === 'k_lawless') decreeCost += 4 * cs;
  const decreeGrow = h('u_press') ? Math.log10(5) : 1;

  const gain = [1, 1, 1];
  if (h('c_gain')) gain[0] *= 3;
  if (h('s_crowns')) gain[0] *= 10;
  if (g.regions > 1) gain[0] *= 3;
  if (g.regions > 5) gain[0] *= 10;
  if (h('t_sig')) gain[1] *= 10;
  if (g.regions > 7) gain[1] *= 3;
  for (let i = 0; i < 3; i++) {
    if (bless === 'b_prosper') gain[i] *= 2;
    if (curse === 'k_greed') gain[i] *= curseF(0.6);
  }

  let offlineCap = 2 * 3600;
  let offlineRate = 0.5;
  if (h('c_offline')) {
    offlineCap = 12 * 3600;
    offlineRate = 1;
  }
  if (h('s_offline')) offlineCap = 24 * 3600;

  return {
    tier,
    goldPow,
    click: Big.of(click),
    clickPct,
    critChance,
    critMult,
    decree,
    setBonus,
    genCost,
    stepMul,
    upCost,
    decreeCost,
    decreeGrow,
    gain,
    maxTier: ch === 'ch_small' ? 3 : 8,
    noClick: ch === 'ch_noclick',
    noUps: ch === 'ch_austerity',
    noDecree: ch === 'ch_lawless',
    offlineCap,
    offlineRate,
  };
}

// ---------- Production ----------

/** Gold per second. */
export function income(g: Game, m = calcMods(g)): Big {
  const r = g.gens[0].amt.mul(m.tier[0]);
  return m.goldPow === 1 ? r : r.pow(m.goldPow);
}

/** Units per second that tier t makes of tier t-1 (t ≥ 1). */
export function tierRate(g: Game, t: number, m = calcMods(g)): Big {
  if (t >= m.maxTier) return Big.ZERO;
  return g.gens[t].amt.mul(m.tier[t]);
}

/** Advances the game by dt seconds. Returns the gold earned. */
export function tick(g: Game, dt: number): Big {
  const m = calcMods(g);
  const rates = g.gens.map((_, t) => (t > 0 ? tierRate(g, t, m) : Big.ZERO));
  const earn = income(g, m).mul(dt);
  for (let t = 1; t < g.gens.length; t++) {
    if (!rates[t].isZero()) g.gens[t - 1].amt = g.gens[t - 1].amt.add(rates[t].mul(dt));
  }
  addGold(g, earn);
  g.runTime += dt;
  g.time += dt;
  automate(g);
  return earn;
}

export function addGold(g: Game, v: Big): void {
  g.gold = g.gold.add(v);
  g.totalGold = g.totalGold.add(v);
  if (g.gold.gt(g.best)) g.best = g.gold;
  const l = g.gold.log10();
  if (l > g.bestLog) g.bestLog = l;
}

/** One click. Returns the gold and whether it was a crit. */
export function click(g: Game, m = calcMods(g)): { v: Big; crit: boolean } {
  if (m.noClick) return { v: Big.ZERO, crit: false };
  let v = m.click.max(Big.ONE).add(income(g, m).mul(m.clickPct));
  const crit = m.critChance > 0 && Math.random() < m.critChance;
  if (crit) v = v.mul(m.critMult);
  addGold(g, v);
  g.runClicks++;
  g.clicks++;
  return { v, crit };
}

// ---------- Buying ----------

export function genCost(g: Game, t: number, m = calcMods(g)): Big {
  const d = TIERS[t];
  return Big.pow10(d.cost + Math.floor(g.gens[t].bought / 10) * d.step * m.stepMul + m.genCost);
}

export function tierOpen(g: Game, t: number, m = calcMods(g)): boolean {
  return t < m.maxTier && (t === 0 || g.gens[t - 1].bought > 0);
}

/** Buys up to n units of tier t (stops at the end of a set if `toSet`). Returns the number bought. */
export function buyGen(g: Game, t: number, n = 1, m = calcMods(g)): number {
  if (!tierOpen(g, t, m)) return 0;
  let got = 0;
  let guard = 0;
  while (got < n && guard++ < 500) {
    const cost = genCost(g, t, m);
    if (g.gold.lt(cost)) break;
    const left = 10 - (g.gens[t].bought % 10);
    const can = Math.min(left, n - got, Math.floor(g.gold.div(cost).toNumber() + 1e-9));
    if (can <= 0) break;
    g.gold = g.gold.sub(cost.mul(can));
    g.gens[t].bought += can;
    g.gens[t].amt = g.gens[t].amt.add(can);
    got += can;
  }
  return got;
}

/** Buys units of tier t until the current set of 10 is full. */
export function buySet(g: Game, t: number, m = calcMods(g)): number {
  const left = 10 - (g.gens[t].bought % 10);
  const cost = genCost(g, t, m).mul(left);
  if (g.gold.lt(cost)) return 0;
  return buyGen(g, t, left, m);
}

export function decreeCost(g: Game, m = calcMods(g)): Big {
  return Big.pow10(3 + g.decrees * m.decreeGrow + m.decreeCost);
}

export function buyDecree(g: Game, n = 1, m = calcMods(g)): number {
  if (m.noDecree) return 0;
  let got = 0;
  while (got < n) {
    const c = decreeCost(g, m);
    if (g.gold.lt(c)) break;
    g.gold = g.gold.sub(c);
    g.decrees++;
    got++;
  }
  return got;
}

export function upCost(g: Game, id: string, m = calcMods(g)): Big {
  return Big.pow10(UPG[id].cost + m.upCost);
}

export function canUp(g: Game, id: string, m = calcMods(g)): boolean {
  return !m.noUps && !g.ups.includes(id) && g.gold.gte(upCost(g, id, m));
}

export function buyUp(g: Game, id: string, m = calcMods(g)): boolean {
  if (!canUp(g, id, m)) return false;
  g.gold = g.gold.sub(upCost(g, id, m));
  g.ups.push(id);
  return true;
}

/** Buys the most of everything, highest tier first. Used by "Max all" and autobuyers. */
export function buyMax(g: Game, tiers: number[], decrees: boolean, ups: boolean): number {
  let n = 0;
  if (ups) {
    for (const u of UPGRADES) {
      const m = calcMods(g);
      if (buyUp(g, u.id, m)) n++;
    }
  }
  const m = calcMods(g);
  for (const t of [...tiers].sort((a, b) => b - a)) n += buyGen(g, t, 1e9, m);
  if (decrees) n += buyDecree(g, 1e9, m);
  return n;
}

export function nodeCost(id: string): Big {
  return Big.of(NODE[id].cost);
}

export function canNode(g: Game, layer: number, id: string): boolean {
  const L = g.layers[layer];
  const n = NODE[id];
  return !L.tree.includes(id) && n.req.every((r) => L.tree.includes(r)) && L.cur.gte(nodeCost(id));
}

export function buyNode(g: Game, layer: number, id: string): boolean {
  if (!canNode(g, layer, id)) return false;
  const L = g.layers[layer];
  L.cur = L.cur.sub(nodeCost(id));
  L.tree.push(id);
  return true;
}

export function regionCost(g: Game, r = g.regions): Big {
  return Big.pow10(REGIONS[r].cost - (has(g, 's_conq') ? 10 : 0));
}

export const conquestOpen = (g: Game): boolean => g.layers[1].count > 0;
export const wonderOpen = (g: Game): boolean => g.layers[2].count > 0;

export function buyRegion(g: Game): boolean {
  if (!conquestOpen(g) || g.regions >= REGIONS.length) return false;
  const c = regionCost(g);
  if (g.gold.lt(c)) return false;
  g.gold = g.gold.sub(c);
  g.regions++;
  return true;
}

export function wonderCost(g: Game, s = g.wonder): Big {
  return Big.pow10(WONDER[s].cost * (has(g, 't_wonder') ? 0.9 : 1));
}

export function buyWonder(g: Game): boolean {
  if (!wonderOpen(g) || g.wonder >= WONDER.length) return false;
  const c = wonderCost(g);
  if (g.gold.lt(c)) return false;
  g.gold = g.gold.sub(c);
  g.wonder++;
  if (g.wonder >= WONDER.length) g.finished = true;
  return true;
}

// ---------- Prestige ----------

/** True if this prestige layer is unlocked at all. */
export function layerOpen(g: Game, i: number): boolean {
  if (i === 0) return true;
  if (i === 1) return has(g, 'c_dyn') || g.layers[1].count > 0;
  return has(g, 's_trans') || g.layers[2].count > 0;
}

export function goalMet(g: Game, layer: number): boolean {
  if (!g.path || g.challenge) return false;
  switch (g.path.g) {
    case 'g_swift':
      return g.runTime <= 600;
    case 'g_handsoff':
      return g.runClicks === 0;
    case 'g_builder':
      return g.gens.every((x) => x.bought >= 10);
    case 'g_frugal':
      return g.ups.length <= 6;
    case 'g_overflow':
      return g.best.log10() >= LAYERS[layer].req + 3;
    case 'g_lawmaker':
      return g.decrees >= 30;
  }
  return false;
}

/** Currency gained by prestiging on layer i now (0 if not possible). */
export function gainOf(g: Game, i: number, m = calcMods(g)): Big {
  if (!layerOpen(g, i)) return Big.ZERO;
  if (g.challenge && i > 0) return Big.ZERO;
  const L = LAYERS[i];
  const d = g.best.log10();
  if (d < L.req) return Big.ZERO;
  let v = Big.pow10((d - L.req) / L.div).mul(m.gain[i]);
  if (goalMet(g, i)) v = v.mul(1.5);
  return v.floor().max(Big.ONE);
}

export function canPrestige(g: Game, i: number): boolean {
  return gainOf(g, i).gte(1);
}

/** Starts a fresh run: gold, generators, upgrades and decrees reset. */
function resetRun(g: Game): void {
  g.gold = Big.of(has(g, 'c_seed') ? 1e6 : 10);
  g.best = g.gold;
  g.gens = TIERS.map(() => ({ amt: Big.ZERO, bought: 0 }));
  if (!has(g, 'c_keep')) g.ups = [];
  g.decrees = 0;
  g.runTime = 0;
  g.runClicks = 0;
  g.path = null;
  g.challenge = null;
}

export function makeOffers(g: Game): Offer[] {
  const rng = new Rng(hash(g.seed, 'offers', g.offerN++));
  const n = has(g, 'c_paths') ? 4 : 3;
  const bl = rng.shuffle(BLESSINGS.map((b) => b.id));
  const out: Offer[] = [];
  for (let i = 0; i < n; i++) out.push({ b: bl[i], c: rng.pick(CURSES).id, g: rng.pick(GOALS).id });
  return out;
}

/** Prestige on layer i. Returns the gain. */
export function prestige(g: Game, i: number): Big {
  const gain = gainOf(g, i);
  if (gain.lt(1)) return Big.ZERO;
  if (g.challenge && i === 0 && !g.chDone.includes(g.challenge)) g.chDone.push(g.challenge);
  const L = g.layers[i];
  L.cur = L.cur.add(gain);
  L.earned = L.earned.add(gain);
  L.count++;
  if (i >= 2) {
    const S = g.layers[1];
    S.cur = Big.ZERO;
    S.earned = Big.ZERO;
    if (!has(g, 't_keep')) S.tree = [];
  }
  if (i >= 1) {
    const C = g.layers[0];
    C.cur = Big.ZERO;
    C.earned = Big.ZERO;
    if (!has(g, 's_keep')) C.tree = [];
    if (!has(g, 't_conq')) g.regions = 0;
    if (!has(g, 'c_keep')) g.ups = [];
  }
  resetRun(g);
  g.offers = makeOffers(g);
  return gain;
}

export function pickOffer(g: Game, k: number): void {
  if (!g.offers || !g.offers[k]) return;
  g.path = g.offers[k];
  g.offers = null;
}

export function enterChallenge(g: Game, id: string): void {
  if (!has(g, 'c_chal') || !CHALLENGES.some((c) => c.id === id)) return;
  resetRun(g);
  g.offers = null;
  g.challenge = id;
}

export function exitChallenge(g: Game): void {
  if (!g.challenge) return;
  resetRun(g);
  g.offers = makeOffers(g);
}

/** Bot rating of an offer (also used by auto-pick). */
export function offerScore(o: Offer): number {
  const b = BLESSINGS.find((x) => x.id === o.b)?.score ?? 0;
  const c = CURSES.find((x) => x.id === o.c)?.score ?? 0;
  const gl = GOALS.find((x) => x.id === o.g)?.score ?? 0;
  return b + c + gl * 0.5;
}

export function bestOffer(offers: Offer[]): number {
  let best = 0;
  offers.forEach((o, i) => {
    if (offerScore(o) > offerScore(offers[best])) best = i;
  });
  return best;
}

/** Autobuyers and auto-prestige. Runs at the end of each tick. */
export function automate(g: Game): void {
  if (g.auto) {
    const t1 = has(g, 'c_auto1');
    const t2 = has(g, 'c_auto2');
    if (t1 || t2) {
      const tiers = [...(t1 ? [0, 1, 2, 3] : []), ...(t2 ? [4, 5, 6, 7] : [])];
      buyMax(g, tiers, t1, t2);
    }
  }
  if (!g.autoPrestige) return;
  if (g.offers && has(g, 's_auto')) pickOffer(g, bestOffer(g.offers));
  if (has(g, 't_auto') && layerOpen(g, 1) && !g.challenge) {
    const gn = gainOf(g, 1);
    if (gn.gte(1) && gn.gte(g.layers[1].earned)) {
      prestige(g, 1);
      if (has(g, 's_auto') && g.offers) pickOffer(g, bestOffer(g.offers));
      return;
    }
  }
  if (has(g, 's_auto') && !g.challenge) {
    const gn = gainOf(g, 0);
    if (gn.gte(1) && gn.gte(g.layers[0].earned)) {
      prestige(g, 0);
      if (g.offers) pickOffer(g, bestOffer(g.offers));
    }
  }
}

// ---------- Offline ----------

export interface OfflineReport {
  away: number;
  used: number;
  gold: Big;
  prestiges: number;
}

/** Simulates time away in up to 400 chunks. */
export function offline(g: Game, seconds: number): OfflineReport {
  const m = calcMods(g);
  const used = Math.min(seconds, m.offlineCap) * m.offlineRate;
  const before = g.totalGold;
  const pBefore = g.layers.reduce((a, l) => a + l.count, 0);
  if (used > 0) {
    const n = Math.min(400, Math.ceil(used));
    const dt = used / n;
    for (let i = 0; i < n && !g.finished; i++) tick(g, dt);
  }
  const pAfter = g.layers.reduce((a, l) => a + l.count, 0);
  return { away: seconds, used, gold: g.totalGold.sub(before), prestiges: pAfter - pBefore };
}

// ---------- Score and save ----------

export function score(g: Game): number {
  let s = Math.floor(g.bestLog * 100) + g.wonder * 5000 + g.chDone.length * 500;
  s += g.layers.reduce((a, l, i) => a + l.count * (i + 1) * 50, 0);
  if (g.finished) s += Math.floor(1e6 / (1 + g.time / 3600));
  return s;
}

const reviveGame = (o: Record<string, unknown>): Game | null => {
  if (!o || o.v !== 1) return null;
  const g = o as unknown as Game;
  const B = (v: unknown): Big => Big.parse(String(v ?? '0'));
  g.gold = B(g.gold);
  g.best = B(g.best);
  g.totalGold = B(g.totalGold);
  if (!Array.isArray(g.gens) || g.gens.length !== TIERS.length) return null;
  g.gens = g.gens.map((x) => ({ amt: B(x.amt), bought: Number(x.bought) || 0 }));
  if (!Array.isArray(g.layers) || g.layers.length !== LAYERS.length) return null;
  g.layers = g.layers.map((l) => ({ cur: B(l.cur), earned: B(l.earned), tree: (l.tree ?? []).filter((id) => NODE[id]), count: Number(l.count) || 0 }));
  g.ups = (g.ups ?? []).filter((id) => UPG[id]);
  g.chDone = g.chDone ?? [];
  return g;
};

export function serialize(g: Game): string {
  return JSON.stringify(g);
}

export function deserialize(text: string): Game | null {
  try {
    return reviveGame(JSON.parse(text) as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Save text for export: a prefix and base64 JSON. */
export function exportSave(g: Game): string {
  return 'IE1:' + btoa(serialize(g));
}

export function importSave(text: string): Game | null {
  const t = text.trim();
  try {
    if (t.startsWith('IE1:')) return deserialize(atob(t.slice(4)));
    return deserialize(t);
  } catch {
    return null;
  }
}
