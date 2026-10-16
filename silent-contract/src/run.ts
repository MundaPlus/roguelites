/** Campaign state: days, mission offers, rewards, the safehouse shop, score and save data. */
import {
  AGENTS,
  AGENT_IDS,
  CORPS,
  DAYS,
  GADGETS,
  GADGET_IDS,
  HIRE_PRICE,
  IMPLANTS,
  IMPLANT_IDS,
  IMPLANT_SLOTS,
  MAX_TEAM,
  MISSIONS,
  OFFER_KINDS,
  trainPrice,
  type AgentId,
  type GadgetId,
  type ImplantId,
  type MissionKind,
  type Skill,
} from './data';
import { slots, type MAgent, type Mission } from './engine';
import { makeMission } from './level';
import { Rng, hash } from './rng';

export interface RosterAgent {
  id: AgentId;
  hp: number;
  hack: number;
  stealth: number;
  combat: number;
  gadgets: GadgetId[];
  implants: ImplantId[];
  missions: number;
}

export interface Offer {
  kind: MissionKind;
  stars: number;
  sec: number;
  corp: string;
  seed: number;
}

export interface ShopItem {
  kind: 'gadget' | 'implant' | 'agent';
  id: string;
  price: number;
  sold: boolean;
}

export interface Report {
  kind: MissionKind;
  success: boolean;
  credits: number;
  loot: number;
  bonus: string[];
  lost: AgentId[];
  turns: number;
  kos: number;
  spots: number;
}

export interface RunState {
  seed: string;
  day: number;
  credits: number;
  roster: RosterAgent[];
  offers: Offer[];
  phase: 'map' | 'mission' | 'report' | 'shop';
  mission: Mission | null;
  offer: Offer | null;
  report: Report | null;
  shop: ShopItem[];
  /** A free implant from the clinic that waits for an agent. */
  pending: ImplantId | null;
  rewinds: number;
  stats: { missions: number; success: number; earned: number; kos: number; lost: number };
  over: '' | 'won' | 'lost';
}

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  intel: number;
  unlocked: AgentId[];
  loadouts: string[];
  missions: number;
}

const RUN_KEY = 'silent.run';
const META_KEY = 'silent.meta';

export function rosterAgent(id: AgentId): RosterAgent {
  const d = AGENTS[id];
  return { id, hp: d.hp, hack: d.hack, stealth: d.stealth, combat: d.combat, gadgets: [...d.gadgets], implants: [], missions: 0 };
}

export function newRun(seedText: string, team: AgentId[], meta: Meta): RunState {
  const roster = team.map(rosterAgent);
  if (meta.loadouts.includes('kit')) for (const r of roster) if (r.gadgets.length < slots(r)) r.gadgets.push('medkit');
  const run: RunState = {
    seed: seedText,
    day: 1,
    credits: 60 + (meta.loadouts.includes('cash') ? 100 : 0),
    roster,
    offers: [],
    phase: 'map',
    mission: null,
    offer: null,
    report: null,
    shop: [],
    pending: null,
    rewinds: 2 + (meta.loadouts.includes('rewind') ? 1 : 0),
    stats: { missions: 0, success: 0, earned: 0, kos: 0, lost: 0 },
    over: '',
  };
  run.offers = makeOffers(run);
  return run;
}

const seedNum = (r: RunState): number => hash(r.seed);

export function isFinal(r: RunState): boolean {
  return r.day >= DAYS;
}

export function makeOffers(r: RunState): Offer[] {
  const rng = new Rng(hash(seedNum(r), 'offers', r.day));
  if (isFinal(r)) return [{ kind: 'vault', stars: 3, sec: 8, corp: 'Sovereign', seed: rng.int(1, 1e9) }];
  const kinds = rng.shuffle([...OFFER_KINDS]).slice(0, 3);
  const corps = rng.shuffle([...CORPS]);
  return kinds.map((kind, i) => {
    const stars = i === 0 ? 1 : rng.int(1, 3);
    return { kind, stars, sec: Math.min(7, Math.round(r.day * 0.7) + stars - 1), corp: corps[i], seed: rng.int(1, 1e9) };
  });
}

export function offerReward(o: Offer): number {
  return Math.round(MISSIONS[o.kind].credits * (1 + 0.3 * (o.stars - 1)));
}

export function toMAgent(r: RosterAgent): MAgent {
  const hack = Math.min(3, r.hack + (r.implants.includes('cortex') ? 1 : 0));
  const maxHp = r.hp + (r.implants.includes('plate') ? 1 : 0);
  const maxAp = 5 + r.stealth + (r.implants.includes('servo') ? 1 : 0);
  return {
    id: r.id,
    x: 0,
    y: 0,
    hp: maxHp,
    maxHp,
    ap: maxAp,
    maxAp,
    down: false,
    out: false,
    hack,
    stealth: r.stealth,
    combat: r.combat,
    gadgets: r.gadgets.map((id) => ({ id, n: GADGETS[id].charges })),
    implants: [...r.implants],
    cloak: 0,
  };
}

export function startMission(r: RunState, i: number): void {
  const o = r.offers[i];
  r.offer = o;
  r.mission = makeMission({ seed: o.seed, kind: o.kind, sec: o.sec, team: r.roster.map(toMAgent), rewinds: r.rewinds });
  r.phase = 'mission';
}

/** Close the mission: pay rewards, remove captured agents, build the report. */
export function finishMission(r: RunState, meta: Meta): Report {
  const m = r.mission!;
  const o = r.offer!;
  const escaped = m.over === 'escaped' && m.agents.some((a) => a.out);
  const success = escaped && m.goal;
  const lost = m.agents.filter((a) => !a.out).map((a) => a.id);
  const rng = new Rng(hash(seedNum(r), 'reward', r.day));
  const bonus: string[] = [];
  let credits = escaped ? m.credits : 0;
  r.roster = r.roster.filter((a) => !lost.includes(a.id));
  for (const a of r.roster) a.missions++;
  if (success) {
    const pay = offerReward(o);
    credits += pay;
    if (o.kind === 'lab') {
      const g = rng.pick(GADGET_IDS);
      const who = r.roster.find((a) => a.gadgets.length < slots(a));
      if (who) {
        who.gadgets.push(g);
        bonus.push(`${GADGETS[g].icon} ${GADGETS[g].name} for ${AGENTS[who.id].name}`);
      } else {
        credits += GADGETS[g].price;
        bonus.push(`${GADGETS[g].icon} ${GADGETS[g].name} sold for ${GADGETS[g].price}¢ (no free slot)`);
      }
    }
    if (o.kind === 'server') {
      meta.intel += 2;
      bonus.push('🧩 +2 intel for unlocks');
    }
    if (o.kind === 'cell') {
      const free = AGENT_IDS.filter((id) => !r.roster.some((a) => a.id === id));
      if (r.roster.length < MAX_TEAM && free.length) {
        const id = rng.pick(free);
        r.roster.push(rosterAgent(id));
        bonus.push(`${AGENTS[id].icon} ${AGENTS[id].name} joins the team`);
      } else {
        credits += 120;
        bonus.push('Team is full: +120¢');
      }
    }
    if (o.kind === 'clinic') {
      const imp = rng.pick(IMPLANT_IDS);
      r.pending = imp;
      bonus.push(`${IMPLANTS[imp].icon} ${IMPLANTS[imp].name} (install it in the safehouse)`);
    }
  }
  r.credits += credits;
  r.stats.missions++;
  if (success) r.stats.success++;
  r.stats.earned += credits;
  r.stats.kos += m.kos;
  r.stats.lost += lost.length;
  meta.missions++;
  const rep: Report = { kind: o.kind, success, credits, loot: escaped ? m.credits : 0, bonus, lost, turns: m.turn, kos: m.kos, spots: m.spots };
  r.report = rep;
  r.mission = null;
  r.phase = 'report';
  if (r.roster.length === 0) r.over = 'lost';
  else if (o.kind === 'vault') r.over = success ? 'won' : 'lost';
  return rep;
}

export function makeShop(r: RunState, meta: Meta): ShopItem[] {
  const rng = new Rng(hash(seedNum(r), 'shop', r.day));
  const items: ShopItem[] = [];
  for (const g of rng.shuffle([...GADGET_IDS]).slice(0, 3)) items.push({ kind: 'gadget', id: g, price: GADGETS[g].price, sold: false });
  for (const i of rng.shuffle([...IMPLANT_IDS]).slice(0, 2)) items.push({ kind: 'implant', id: i, price: IMPLANTS[i].price, sold: false });
  const hire = meta.unlocked.filter((id) => !r.roster.some((a) => a.id === id));
  if (hire.length && r.roster.length < MAX_TEAM) items.push({ kind: 'agent', id: rng.pick(hire), price: HIRE_PRICE, sold: false });
  return items;
}

export function toShop(r: RunState, meta: Meta): void {
  r.shop = makeShop(r, meta);
  r.phase = 'shop';
  r.report = null;
}

/** Can agent `k` take this shop item? Returns '' or a reason. */
export function canBuy(r: RunState, item: ShopItem, k: number): string {
  if (item.sold) return 'Sold.';
  if (r.credits < item.price) return 'Not enough credits.';
  if (item.kind === 'agent') return r.roster.length < MAX_TEAM ? '' : 'The team is full.';
  const a = r.roster[k];
  if (!a) return 'Pick an agent.';
  if (item.kind === 'gadget') return a.gadgets.length < slots(a) ? '' : 'No free gadget slot.';
  if (a.implants.includes(item.id as ImplantId)) return 'Already installed.';
  return a.implants.length < IMPLANT_SLOTS ? '' : 'No free implant slot.';
}

export function buy(r: RunState, idx: number, k: number): boolean {
  const item = r.shop[idx];
  if (!item || canBuy(r, item, k)) return false;
  r.credits -= item.price;
  item.sold = true;
  if (item.kind === 'agent') r.roster.push(rosterAgent(item.id as AgentId));
  else if (item.kind === 'gadget') r.roster[k].gadgets.push(item.id as GadgetId);
  else r.roster[k].implants.push(item.id as ImplantId);
  return true;
}

export function installPending(r: RunState, k: number): boolean {
  const a = r.roster[k];
  if (!r.pending || !a || a.implants.length >= IMPLANT_SLOTS || a.implants.includes(r.pending)) return false;
  a.implants.push(r.pending);
  r.pending = null;
  return true;
}

export function trainCost(a: RosterAgent, s: Skill): number {
  return a[s] >= 3 ? 0 : trainPrice(a[s]);
}

export function train(r: RunState, k: number, s: Skill): boolean {
  const a = r.roster[k];
  const c = trainCost(a, s);
  if (!a || a[s] >= 3 || r.credits < c) return false;
  r.credits -= c;
  a[s]++;
  return true;
}

export function sellGadget(r: RunState, k: number, slot: number): void {
  const a = r.roster[k];
  const g = a?.gadgets[slot];
  if (!g) return;
  a.gadgets.splice(slot, 1);
  r.credits += Math.floor(GADGETS[g].price / 2);
}

export function nextDay(r: RunState): void {
  r.day++;
  r.offers = makeOffers(r);
  r.phase = 'map';
  r.shop = [];
}

export function score(r: RunState): number {
  return r.stats.earned + r.stats.success * 150 + (r.over === 'won' ? 1000 : 0) + r.roster.length * 50 + r.stats.kos * 5;
}

/** Intel earned at the end of a run. */
export function intelFor(r: RunState): number {
  return 1 + Math.floor(score(r) / 300);
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(RUN_KEY);
    return s ? (JSON.parse(s) as RunState) : null;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState | null): void {
  try {
    if (r) localStorage.setItem(RUN_KEY, JSON.stringify(r));
    else localStorage.removeItem(RUN_KEY);
  } catch {
    /* storage may be blocked */
  }
}

export function defaultMeta(): Meta {
  return { runs: 0, wins: 0, best: 0, intel: 0, unlocked: AGENT_IDS.filter((id) => AGENTS[id].unlock === 0), loadouts: [], missions: 0 };
}

export function loadMeta(): Meta {
  try {
    const s = localStorage.getItem(META_KEY);
    if (s) return { ...defaultMeta(), ...(JSON.parse(s) as Partial<Meta>) };
  } catch {
    /* ignore */
  }
  return defaultMeta();
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}
