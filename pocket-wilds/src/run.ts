/** Run state machine: map, nodes, towns, rewards, save data. `act(run, action)` is the only way to change a run. */
import { battleTurn, isWild, nameOf, newBattle, type Battle, type BattleKind, type Choice, type LogEntry } from './battle';
import {
  CHAMPION,
  CHAMP_LVL,
  GYM_LVL,
  ITEMS,
  LEADERS,
  MOVES,
  RARE_UNLOCKS,
  REGIONS,
  SPECIES,
  SPECIES_IDS,
  STARTERS,
  STARTER_UNLOCKS,
  TRAINERS,
  baseForm,
  formAt,
  type ItemId,
} from './data';
import { MAX_FUSED, evolve, gainXp, heal, levelUp, makeMon, maxHp, xpYield, type Growth, type Mon } from './mon';
import { Rng, hash } from './rng';

export type NodeKind = 'wild' | 'rare' | 'trainer' | 'item' | 'rest' | 'town' | 'gym' | 'champion';

export const NODE_INFO: Record<NodeKind, { icon: string; name: string; text: string }> = {
  wild: { icon: '🌿', name: 'Tall grass', text: 'Meet a wild creature. Weaken it and tame it.' },
  rare: { icon: '✨', name: 'Rare den', text: 'A strong, rare creature. Hard to tame.' },
  trainer: { icon: '🧢', name: 'Trainer', text: 'Battle a trainer for XP and gold.' },
  item: { icon: '🎁', name: 'Supplies', text: 'Find items or gold.' },
  rest: { icon: '🏕️', name: 'Rest spot', text: 'Heal every creature by 60% and cure status.' },
  town: { icon: '🏘️', name: 'Town', text: 'Healer, shop, move tutor and fusion shrine.' },
  gym: { icon: '🏟️', name: 'Gym', text: 'Beat the leader to earn a badge.' },
  champion: { icon: '👑', name: 'Champion', text: 'The final battle.' },
};

/** Steps per region. 'route' steps offer 2–3 random nodes. */
export const PLAN: ('route' | 'town' | 'boss')[] = ['route', 'route', 'route', 'town', 'route', 'route', 'route', 'boss'];

export const TEAM_MAX = 6;
export const STARTER_LVL = 7;
export const BUDDY_LVL = 6;
export const TUTOR_COST = (region: number): number => 200 + 60 * region;

export interface NodeOpt {
  kind: NodeKind;
  /** Preview text, e.g. the trainer name. */
  label: string;
  icon: string;
}

export interface TownState {
  shop: ItemId[];
  tutor: string[];
  fused: boolean;
}

export type Scene =
  | { k: 'starter'; opts: string[]; buddy: string }
  | { k: 'map' }
  | { k: 'battle'; b: Battle; node: NodeKind }
  | { k: 'notice'; icon: string; title: string; lines: string[] }
  | { k: 'learn'; uid: number; move: string }
  | { k: 'evolve'; uid: number; from: string; to: string }
  | { k: 'full'; mon: Mon }
  | { k: 'town'; town: TownState }
  | { k: 'end'; victory: boolean; score: number; shards: number };

export interface RunState {
  v: 1;
  seed: string;
  region: number;
  step: number;
  options: NodeOpt[];
  team: Mon[];
  bag: Partial<Record<ItemId, number>>;
  gold: number;
  badges: number;
  leaders: number[];
  scene: Scene;
  queue: Scene[];
  uid: number;
  lost: { sp: string; lvl: number }[];
  dex: string[];
  battles: number;
  unlocked: string[];
  recorded: boolean;
}

export type Action =
  | { t: 'starter'; i: number }
  | { t: 'node'; i: number }
  | Choice
  | { t: 'next' }
  | { t: 'learn'; slot: number }
  | { t: 'keep'; slot: number }
  | { t: 'heal' }
  | { t: 'buy'; id: ItemId }
  | { t: 'tutor'; move: string; uid: number; slot: number }
  | { t: 'fuse'; a: number; b: number }
  | { t: 'leave' }
  | { t: 'use'; id: ItemId; uid: number }
  | { t: 'lead'; uid: number };

export interface Result {
  ok: boolean;
  msg?: string;
  log?: LogEntry[];
}

export const rngFor = (run: RunState, ...parts: (string | number)[]): Rng => new Rng(hash(run.seed, ...parts));

// ---------- Run creation ----------

export function newRun(seed: string, unlocked: string[]): RunState {
  const rng = new Rng(hash(seed, 'start'));
  const starters = [...STARTERS, ...STARTER_UNLOCKS.filter((s) => unlocked.includes(s))];
  const opts = rng.shuffle([...starters]).slice(0, 3);
  const leaders = rng.shuffle(LEADERS.map((_, i) => i)).slice(0, 4);
  const run: RunState = {
    v: 1,
    seed,
    region: 0,
    step: 0,
    options: [],
    team: [],
    bag: { potion: 4, charm: 5 },
    gold: 200,
    badges: 0,
    leaders,
    scene: { k: 'starter', opts, buddy: rng.pick(REGIONS[0].pool.filter((id) => !STARTERS.includes(id) && !STARTER_UNLOCKS.includes(id))) },
    queue: [],
    uid: 1,
    lost: [],
    dex: [],
    battles: 0,
    unlocked: [...unlocked],
    recorded: false,
  };
  run.options = makeOptions(run);
  return run;
}

export function makeOptions(run: RunState): NodeOpt[] {
  const kind = PLAN[run.step];
  if (kind === 'town') return [{ kind: 'town', label: `${REGIONS[run.region].name} Town`, icon: NODE_INFO.town.icon }];
  if (kind === 'boss') {
    if (run.region >= 4) return [{ kind: 'champion', label: CHAMPION.name, icon: CHAMPION.icon }];
    const l = LEADERS[run.leaders[run.region]];
    return [{ kind: 'gym', label: `${l.title}: ${l.name}`, icon: l.icon }];
  }
  const rng = rngFor(run, 'opts', run.region, run.step);
  const n = rng.chance(0.55) ? 3 : 2;
  const bag: [NodeKind, number][] = [
    ['wild', 3],
    ['trainer', 3],
    ['item', 1.3],
    ['rest', 1.3],
    ['rare', 0.8],
  ];
  const out: NodeOpt[] = [];
  while (out.length < n) {
    const k = rng.weighted(bag.filter(([kk]) => !out.some((o) => o.kind === kk)));
    let label = NODE_INFO[k].name;
    let icon = NODE_INFO[k].icon;
    if (k === 'trainer') {
      const t = TRAINERS[rng.int(0, TRAINERS.length - 1)];
      label = t.name;
      icon = t.icon;
    }
    out.push({ kind: k, label, icon });
  }
  return out;
}

// ---------- Helpers ----------

function pool(run: RunState): string[] {
  return REGIONS[run.region].pool;
}

/** Rare den species. Sanctuary unlocks join from region 2 on. */
function rarePool(run: RunState): string[] {
  const extra = RARE_UNLOCKS.filter((id) => run.unlocked.includes(id) && run.region >= 1);
  return [...REGIONS[run.region].rare, ...extra];
}

function mk(run: RunState, sp: string, lvl: number, rng: Rng): Mon {
  return makeMon(formAt(sp, lvl), lvl, run.uid++, rng);
}

export function alive(run: RunState): Mon[] {
  return run.team.filter((m) => m.hp > 0);
}

function addItem(run: RunState, id: ItemId, n = 1): void {
  run.bag[id] = (run.bag[id] ?? 0) + n;
}

export function count(run: RunState, id: ItemId): number {
  return run.bag[id] ?? 0;
}

function flow(run: RunState): void {
  run.scene = run.queue.shift() ?? { k: 'map' };
}

/** Show scenes now, then come back to the current scene. */
function interrupt(run: RunState, scenes: Scene[]): void {
  if (!scenes.length) return;
  run.queue.unshift(...scenes, run.scene);
  flow(run);
}

function advance(run: RunState): void {
  run.step++;
  if (run.step >= PLAN.length) {
    run.step = 0;
    run.region++;
  }
  run.options = makeOptions(run);
}

/** Turn level-up results into text lines and follow-up scenes. */
function growthScenes(m: Mon, gs: Growth[], lines: string[], scenes: Scene[]): void {
  const lv = gs.filter((g) => g.kind === 'level');
  if (lv.length) lines.push(`${nameOf(m)} grew to Lv ${m.lvl}!`);
  for (const g of gs) {
    if (g.kind === 'learned') lines.push(`${nameOf(m)} learned ${MOVES[g.move].name}!`);
    if (g.kind === 'learn') scenes.push({ k: 'learn', uid: m.uid, move: g.move });
  }
  const evo = gs.find((g) => g.kind === 'evolve');
  if (evo && evo.kind === 'evolve' && !scenes.some((s) => s.k === 'evolve' && s.uid === m.uid)) scenes.push({ k: 'evolve', uid: m.uid, from: m.sp, to: evo.to });
}

export function score(run: RunState, victory: boolean): number {
  const levels = run.team.reduce((a, m) => a + m.lvl, 0);
  return run.badges * 600 + (victory ? 3000 : 0) + run.region * 200 + run.step * 25 + run.dex.length * 40 + levels * 5;
}

function endRun(run: RunState, victory: boolean): void {
  const s = score(run, victory);
  run.queue = [];
  run.scene = { k: 'end', victory, score: s, shards: Math.floor(s / 150) };
}

// ---------- Nodes ----------

function startBattle(run: RunState, kind: BattleKind, node: NodeKind): void {
  const rng = rngFor(run, 'battle', run.region, run.step, node);
  const reg = REGIONS[run.region];
  const [lo, hi] = reg.lvl;
  let foes: Mon[] = [];
  let name = '';
  let icon = '';
  let potions = 0;
  if (kind === 'wild') {
    foes = [mk(run, rng.pick(pool(run)), rng.int(lo, hi), rng)];
  } else if (kind === 'rare') {
    foes = [mk(run, rng.pick(rarePool(run)), run.region === 0 ? hi : hi + 1, rng)];
  } else if (kind === 'trainer') {
    const opt = run.options.find((o) => o.kind === 'trainer');
    name = opt?.label ?? 'Trainer';
    icon = opt?.icon ?? '🧢';
    const n = Math.min(3, 1 + (run.region >= 2 ? 1 : 0) + (run.region >= 1 && rng.chance(0.35) ? 1 : 0));
    for (let i = 0; i < n; i++) foes.push(mk(run, rng.pick(pool(run)), rng.int(lo + 1, hi), rng));
  } else if (kind === 'gym') {
    const l = LEADERS[run.leaders[run.region]];
    name = l.name;
    icon = l.icon;
    const tier = run.region;
    const size = 3 + (tier >= 3 ? 1 : 0);
    const picks = tier <= 1 ? l.team.slice(0, tier + 1) : rng.shuffle(l.team.slice(0, 3)).slice(0, size - 1);
    const sps = [...picks, baseForm(l.team[3])];
    foes = sps.map((sp, i) => mk(run, baseForm(sp), GYM_LVL[tier] + (i === sps.length - 1 ? 1 : 0), rng));
    potions = tier >= 1 ? 1 : 0;
  } else {
    name = CHAMPION.name;
    icon = CHAMPION.icon;
    const sps = rng.shuffle(CHAMPION.team.slice(2)).slice(0, 3);
    foes = [CHAMPION.team[1], ...sps, CHAMPION.team[0]].map((sp, i) => mk(run, sp, CHAMP_LVL + Math.floor(i / 2), rng));
    potions = 2;
  }
  run.scene = { k: 'battle', b: newBattle(kind, run.team, foes, rng.int(1, 2 ** 30), name, icon, potions), node };
}

function enterNode(run: RunState, i: number): Result {
  const opt = run.options[i];
  if (!opt) return { ok: false };
  if (opt.kind === 'wild' || opt.kind === 'rare' || opt.kind === 'trainer' || opt.kind === 'gym' || opt.kind === 'champion') {
    if (!alive(run).length) return { ok: false };
    startBattle(run, opt.kind, opt.kind);
    return { ok: true };
  }
  const rng = rngFor(run, 'node', run.region, run.step, opt.kind);
  if (opt.kind === 'rest') {
    for (const m of run.team) {
      heal(m, Math.ceil(maxHp(m) * 0.6));
      m.st = null;
      m.slp = 0;
    }
    advance(run);
    run.queue.push({ k: 'notice', icon: '🏕️', title: 'Rest spot', lines: ['Your team rests by the fire.', 'Every creature heals 60% of max HP. Status is cured.'] });
    flow(run);
    return { ok: true };
  }
  if (opt.kind === 'item') {
    const lines: string[] = [];
    const n = rng.int(2, 3);
    for (let k = 0; k < n; k++) {
      const roll = rng.weighted<ItemId | 'gold'>([
        ['potion', 3],
        ['charm', 3],
        ['greatcharm', 1.5],
        ['cure', 1.5],
        ['gold', 3],
        ['tonic', 1],
        ['candy', 0.6],
      ]);
      if (roll === 'gold') {
        const g = 60 + 30 * run.region + rng.int(0, 60);
        run.gold += g;
        lines.push(`💰 ${g} gold`);
      } else {
        addItem(run, roll);
        lines.push(`${ITEMS[roll].icon} ${ITEMS[roll].name}`);
      }
    }
    advance(run);
    run.queue.push({ k: 'notice', icon: '🎁', title: 'Supplies', lines: ['You found:', ...lines] });
    flow(run);
    return { ok: true };
  }
  // Town
  const shop: ItemId[] = ['potion', 'tonic', 'cure', 'charm', 'greatcharm', 'candy'];
  if (run.region >= 2) shop.splice(5, 0, 'primecharm');
  const strong = Object.values(MOVES).filter((m) => m.power >= 65 || (m.power === 0 && (m.status || m.self)));
  const tutor = rng.shuffle(strong.map((m) => m.id)).slice(0, 3);
  run.scene = { k: 'town', town: { shop, tutor, fused: false } };
  return { ok: true };
}

/** Moves a creature can learn from the tutor: its own types, its second pool, and Beast moves. */
export function canLearn(m: Mon, move: string): boolean {
  const sp = SPECIES[m.sp];
  const t = MOVES[move].type;
  return !m.moves.includes(move) && (sp.types.includes(t) || sp.cover === t || t === 'beast');
}

function finishBattle(run: RunState, scene: Extract<Scene, { k: 'battle' }>): void {
  const b = scene.b;
  run.battles++;
  const lines: string[] = [];
  const scenes: Scene[] = [];
  const fainted = b.p.filter((m) => m.hp <= 0);
  for (const m of fainted) {
    run.lost.push({ sp: m.sp, lvl: m.lvl });
    lines.push(`💀 ${nameOf(m)} is gone.`);
  }
  run.team = b.p.filter((m) => m.hp > 0);
  if (b.over === 'lose' || !run.team.length) {
    endRun(run, false);
    return;
  }
  // After a battle, creatures wake up and catch their breath.
  for (const m of run.team) {
    if (m.st === 'slp') m.st = null;
    m.slp = 0;
    heal(m, Math.ceil(maxHp(m) * 0.25));
  }
  const trainer = !isWild(b);
  if (b.ko.length) {
    let shown = 0;
    for (const m of run.team) {
      const xp = b.ko.reduce((a, k) => a + xpYield(k.sp, k.lvl, trainer, m.lvl), 0);
      const got = b.fought.includes(m.uid) ? xp : Math.round(xp * 0.6);
      shown = Math.max(shown, got);
      const gs = gainXp(m, got);
      growthScenes(m, gs, lines, scenes);
    }
    lines.unshift(`Your team gains up to ${shown} XP.`);
  }
  if (b.over === 'win') {
    const g = b.kind === 'wild' || b.kind === 'rare' ? 10 + 3 * b.f[0].lvl : b.f.reduce((a, m) => a + m.lvl * 8, 0);
    run.gold += g;
    lines.unshift(`You won! +${g} gold.`);
  }
  if (b.over === 'fled') lines.unshift('You ran away.');
  if (b.over === 'caught' && b.caught) {
    const c = b.caught;
    if (!run.dex.includes(c.sp)) run.dex.push(c.sp);
    if (run.team.length < TEAM_MAX) {
      run.team.push(c);
      lines.unshift(`${SPECIES[c.sp].icon} ${nameOf(c)} (Lv ${c.lvl}) joined your team!`);
    } else scenes.unshift({ k: 'full', mon: c });
  }
  if (b.over === 'win' && b.kind === 'gym') {
    run.badges++;
    const bonus = 250 + 150 * run.region;
    run.gold += bonus;
    addItem(run, 'greatcharm');
    addItem(run, 'potion', 2);
    for (const m of run.team) {
      m.hp = maxHp(m);
      m.st = null;
    }
    const l = LEADERS[run.leaders[run.region]];
    scenes.unshift({
      k: 'notice',
      icon: '🏅',
      title: `${l.title} badge!`,
      lines: [`${l.name}: "You earned this badge."`, `+${bonus} gold, 💠 Great Charm, 🧪 Potion ×2.`, 'Your team is fully healed.', `Badges: ${run.badges} / 4.`],
    });
  }
  if (b.over === 'win' && b.kind === 'champion') {
    run.badges = Math.max(run.badges, 4);
    endRun(run, true);
    return;
  }
  advance(run);
  const title = b.over === 'caught' ? 'Tamed!' : b.over === 'fled' ? 'Escaped' : 'Victory';
  run.queue.push({ k: 'notice', icon: b.over === 'caught' ? '🔮' : b.over === 'fled' ? '💨' : '🏆', title, lines }, ...scenes);
  flow(run);
}

// ---------- Actions ----------

export function act(run: RunState, a: Action): Result {
  const sc = run.scene;
  // Field actions work on the map and in towns.
  if (a.t === 'use' || a.t === 'lead') {
    if (sc.k !== 'map' && sc.k !== 'town') return { ok: false };
    const m = run.team.find((x) => x.uid === a.uid);
    if (!m) return { ok: false };
    if (a.t === 'lead') {
      run.team = [m, ...run.team.filter((x) => x !== m)];
      return { ok: true };
    }
    if (count(run, a.id) <= 0 || !ITEMS[a.id].field) return { ok: false, msg: 'You have none.' };
    if (a.id === 'potion' || a.id === 'tonic') {
      if (m.hp >= maxHp(m) && (a.id === 'potion' || !m.st)) return { ok: false, msg: 'HP is already full.' };
      heal(m, a.id === 'tonic' ? maxHp(m) : Math.max(20, Math.floor(maxHp(m) / 2)));
      if (a.id === 'tonic') m.st = null;
    } else if (a.id === 'cure') {
      if (!m.st) return { ok: false, msg: 'No status to cure.' };
      m.st = null;
      m.slp = 0;
    } else if (a.id === 'candy') {
      const lines: string[] = [];
      const scenes: Scene[] = [];
      growthScenes(m, levelUp(m), lines, scenes);
      run.bag[a.id]!--;
      interrupt(run, scenes);
      return { ok: true, msg: lines.join(' ') };
    }
    run.bag[a.id]!--;
    return { ok: true };
  }
  switch (sc.k) {
    case 'starter': {
      if (a.t !== 'starter' || !sc.opts[a.i]) return { ok: false };
      const rng = rngFor(run, 'starter');
      const m = makeMon(sc.opts[a.i], STARTER_LVL, run.uid++, rng);
      const buddy = makeMon(sc.buddy, BUDDY_LVL, run.uid++, rng);
      run.team = [m, buddy];
      run.dex.push(m.sp, buddy.sp);
      run.queue.push({
        k: 'notice',
        icon: SPECIES[m.sp].icon,
        title: `${nameOf(m)} is your partner!`,
        lines: [`A wild ${SPECIES[buddy.sp].icon} ${nameOf(buddy)} follows you too.`, `Region 1: ${REGIONS[0].icon} ${REGIONS[0].name}. ${REGIONS[0].text}`, 'Pick a path at each step. Tame wild creatures to grow your team.', 'Beat 4 gym leaders and the Champion to win.'],
      });
      flow(run);
      return { ok: true };
    }
    case 'map':
      if (a.t !== 'node') return { ok: false };
      return enterNode(run, a.i);
    case 'battle': {
      const b = sc.b;
      if (a.t === 'next') {
        if (!b.over) return { ok: false };
        finishBattle(run, sc);
        return { ok: true };
      }
      if (a.t !== 'move' && a.t !== 'switch' && a.t !== 'item' && a.t !== 'run') return { ok: false };
      if (a.t === 'item' && count(run, a.id) <= 0) return { ok: false, msg: 'You have none left.' };
      const r = battleTurn(b, a);
      if (!r.log.length) return { ok: false };
      if (a.t === 'item') run.bag[a.id]!--;
      sc.b = r.state;
      return { ok: true, log: r.log };
    }
    case 'notice':
      if (a.t !== 'next') return { ok: false };
      flow(run);
      return { ok: true };
    case 'evolve': {
      if (a.t !== 'next') return { ok: false };
      const m = run.team.find((x) => x.uid === sc.uid);
      if (m && m.sp === sc.from) {
        evolve(m, sc.to);
        // A new form can learn a move at this level.
        const add = SPECIES[m.sp].learn.filter(([l, id]) => l === m.lvl && !m.moves.includes(id)).map(([, id]) => id);
        for (const id of add) {
          if (m.moves.length < 4) m.moves.push(id);
          else run.queue.unshift({ k: 'learn', uid: m.uid, move: id });
        }
      }
      flow(run);
      return { ok: true };
    }
    case 'learn': {
      if (a.t !== 'learn') return { ok: false };
      const m = run.team.find((x) => x.uid === sc.uid);
      if (m && a.slot >= 0 && a.slot < m.moves.length && !m.moves.includes(sc.move)) m.moves[a.slot] = sc.move;
      flow(run);
      return { ok: true };
    }
    case 'full': {
      if (a.t !== 'keep') return { ok: false };
      if (a.slot >= 0 && run.team[a.slot]) run.team[a.slot] = sc.mon;
      flow(run);
      return { ok: true };
    }
    case 'town': {
      const t = sc.town;
      if (a.t === 'leave') {
        advance(run);
        flow(run);
        return { ok: true };
      }
      if (a.t === 'heal') {
        for (const m of run.team) {
          m.hp = maxHp(m);
          m.st = null;
          m.slp = 0;
        }
        return { ok: true, msg: 'Your team is fully healed.' };
      }
      if (a.t === 'buy') {
        const it = ITEMS[a.id];
        if (!t.shop.includes(a.id) || run.gold < it.price) return { ok: false, msg: 'Not enough gold.' };
        run.gold -= it.price;
        addItem(run, a.id);
        return { ok: true, msg: `Bought ${it.name}.` };
      }
      if (a.t === 'tutor') {
        const m = run.team.find((x) => x.uid === a.uid);
        const cost = TUTOR_COST(run.region);
        if (!m || !t.tutor.includes(a.move) || !canLearn(m, a.move) || run.gold < cost) return { ok: false, msg: 'The tutor cannot teach that.' };
        if (m.moves.length < 4) m.moves.push(a.move);
        else if (a.slot >= 0 && a.slot < 4) m.moves[a.slot] = a.move;
        else return { ok: false };
        run.gold -= cost;
        return { ok: true, msg: `${nameOf(m)} learned ${MOVES[a.move].name}!` };
      }
      if (a.t === 'fuse') {
        const ma = run.team.find((x) => x.uid === a.a);
        const mb = run.team.find((x) => x.uid === a.b);
        if (t.fused || !ma || !mb || ma === mb || ma.fused >= MAX_FUSED) return { ok: false, msg: 'The shrine is silent.' };
        t.fused = true;
        run.team = run.team.filter((x) => x !== mb);
        ma.fused++;
        const lines: string[] = [];
        const scenes: Scene[] = [];
        const target = Math.max(ma.lvl, mb.lvl) + 1;
        while (ma.lvl < target) growthScenes(ma, levelUp(ma), lines, scenes);
        ma.xp = 0;
        // Take the donor's strongest attack if it beats the weakest one.
        const donor = [...mb.moves].filter((id) => !ma.moves.includes(id) && MOVES[id].power > 0).sort((x, y) => MOVES[y].power - MOVES[x].power)[0];
        if (donor) {
          if (ma.moves.length < 4) ma.moves.push(donor);
          else {
            const weak = ma.moves.reduce((wi, id, i) => (MOVES[id].power < MOVES[ma.moves[wi]].power ? i : wi), 0);
            if (MOVES[ma.moves[weak]].power < MOVES[donor].power) ma.moves[weak] = donor;
          }
        }
        ma.hp = maxHp(ma);
        ma.st = null;
        interrupt(run, scenes);
        return { ok: true, msg: `${nameOf(mb)} merged into ${nameOf(ma)}! ★${ma.fused}, Lv ${ma.lvl}.` };
      }
      return { ok: false };
    }
    case 'end':
      return { ok: false };
  }
}

// ---------- Save data ----------

const RUN_KEY = 'pocketwilds.run';
const META_KEY = 'pocketwilds.meta';

export interface Meta {
  runs: number;
  wins: number;
  best: number;
  bestBadges: number;
  shards: number;
  unlocked: string[];
  dex: string[];
}

export function saveRun(run: RunState): void {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* storage can be blocked */
  }
}

export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const run = JSON.parse(raw) as RunState;
    if (run.v !== 1 || run.scene.k === 'end' || run.team.some((m) => !SPECIES[m.sp] || m.moves.some((id) => !MOVES[id]))) return null;
    return run;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

export function loadMeta(): Meta {
  const base: Meta = { runs: 0, wins: 0, best: 0, bestBadges: 0, shards: 0, unlocked: [], dex: [] };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as Partial<Meta>) };
  } catch {
    return base;
  }
}

export function saveMeta(meta: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

export const UNLOCKS: { id: string; cost: number; kind: 'starter' | 'wild' }[] = [
  ...STARTER_UNLOCKS.map((id) => ({ id, cost: 12, kind: 'starter' as const })),
  ...RARE_UNLOCKS.map((id, i) => ({ id, cost: 20 + i * 8, kind: 'wild' as const })),
];

/** Record the end of a run in the meta data once. */
export function recordEnd(run: RunState, meta: Meta): void {
  if (run.recorded || run.scene.k !== 'end') return;
  run.recorded = true;
  const e = run.scene;
  if (e.victory) meta.wins++;
  meta.best = Math.max(meta.best, e.score);
  meta.bestBadges = Math.max(meta.bestBadges, run.badges);
  meta.shards += e.shards;
  for (const id of run.dex) if (!meta.dex.includes(id)) meta.dex.push(id);
}

export const TOTAL_SPECIES = SPECIES_IDS.length;
