/** Real-time typing battle. Pure state + step functions, no DOM. */
import { ACTS, DIFFS, ENEMIES, SPELLS, type DiffDef, type Elem, type EnemyDef } from './data';
import { Rng } from './rng';
import { WORDS } from './words';

export const FW = 360;
export const FH = 480;
export const PX = FW / 2;
export const PY = 446;
export const LANES = [70, 180, 290];
export const WALL_Y = 322;
/** Below this line, enemies leave their lane and walk straight at you. */
export const TURN_Y = 344;
export const NOVA_R = 165;
export const BASE_MANA_REGEN = 5;

/** Balance knobs (tuned with the headless sim). */
export const TUNE = { speed: 1.1, speedAct: 0.25, hpAct: 0.6, wave: 4, waveAct: 1.5, gap: 1.7, bossHp: 1.25, cast: 4.1 };

export type FightKind = 'fight' | 'elite' | 'boss';

export interface BattleCfg {
  act: number;
  step: number;
  kind: FightKind;
  seed: number;
  spells: string[];
  runes: string[];
  hp: number;
  maxHp: number;
  maxMana: number;
  /** Difficulty id (relaxed, normal, swift). */
  diff?: string;
}

export interface Enemy {
  uid: number;
  id: string;
  x: number;
  y: number;
  baseX: number;
  lane: number;
  hp: number;
  max: number;
  shield: number;
  word: string;
  age: number;
  slow: number;
  freeze: number;
  burn: number;
  burnDps: number;
  shiftT: number;
  supportT: number;
  vx: number;
  vy: number;
  dead: boolean;
  flash: number;
  /** Boss timers. */
  castT: number;
  callT: number;
  /** Seconds this enemy has been held by a wall. */
  held: boolean;
}

export interface Wall {
  lane: number;
  t: number;
  max: number;
  elem: Elem | null;
  tick: number;
}

export interface Spawn {
  at: number;
  id: string;
  lane: number;
}

export type Ev =
  | { t: 'key' }
  | { t: 'typo' }
  | { t: 'hit'; x: number; y: number; dmg: number; color: string }
  | { t: 'shield'; x: number; y: number }
  | { t: 'kill'; x: number; y: number; icon: string; boss: boolean }
  | { t: 'bolt'; x: number; y: number; color: string }
  | { t: 'chain'; x1: number; y1: number; x2: number; y2: number }
  | { t: 'nova'; r: number; color: string }
  | { t: 'wall'; lane: number }
  | { t: 'cast'; spell: string }
  | { t: 'fizzle' }
  | { t: 'hurt'; dmg: number; x: number; y: number }
  | { t: 'block'; x: number; y: number }
  | { t: 'heal'; n: number }
  | { t: 'decoy'; x: number; y: number }
  | { t: 'spawn'; boss: boolean }
  | { t: 'echo' };

export interface Battle {
  cfg: BattleCfg;
  rng: Rng;
  time: number;
  enemies: Enemy[];
  queue: Spawn[];
  uid: number;
  buf: string;
  target: number | null;
  elem: Elem | null;
  shape: 'lance' | null;
  mana: number;
  maxMana: number;
  hp: number;
  maxHp: number;
  ward: number;
  combo: number;
  bestCombo: number;
  /** Correct key presses. */
  keys: number;
  typos: number;
  words: number;
  kills: number;
  walls: Wall[];
  events: Ev[];
  recent: string[];
  over: 'win' | 'lose' | null;
  /** Total time the boss fight lasts is unknown, so the bar uses the queue length. */
  total: number;
}

const has = (b: Battle, rune: string): boolean => b.cfg.runes.includes(rune);
export const diffOf = (cfg: BattleCfg): DiffDef => DIFFS[cfg.diff ?? 'normal'] ?? DIFFS.normal;

export const def = (e: Enemy): EnemyDef => ENEMIES[e.id];
export const isBoss = (e: Enemy): boolean => def(e).special === 'boss';
export const isDecoy = (e: Enemy): boolean => def(e).special === 'decoy';
export const isMissile = (e: Enemy): boolean => def(e).special === 'missile';
export const alive = (b: Battle): Enemy[] => b.enemies.filter((e) => !e.dead);

export function comboCap(b: Battle): number {
  return has(b, 'focus') ? 30 : 20;
}

export function accuracy(b: Battle): number {
  const n = b.keys + b.typos;
  return n === 0 ? 1 : b.keys / n;
}

export function dmgMult(b: Battle): number {
  const combo = 1 + 0.05 * Math.min(b.combo, comboCap(b));
  const acc = 0.5 + 0.5 * accuracy(b);
  return combo * acc * (has(b, 'sharp') ? 1.2 : 1);
}

export function spellCost(b: Battle, id: string): number {
  return Math.round(SPELLS[id].cost * (has(b, 'frugal') ? 0.75 : 1));
}

export function manaRegen(b: Battle): number {
  return BASE_MANA_REGEN * (has(b, 'spring') ? 1.6 : 1);
}

export function laneOf(x: number): number {
  let best = 0;
  for (let i = 1; i < LANES.length; i++) if (Math.abs(LANES[i] - x) < Math.abs(LANES[best] - x)) best = i;
  return best;
}

/** Seconds until this enemy reaches you (rough). */
export function eta(e: Enemy): number {
  const d = def(e);
  if (d.speed <= 0) return 999;
  const dist = Math.hypot(PX - e.x, PY - e.y);
  const sp = d.speed * TUNE.speed * (e.slow > 0 ? 0.4 : 1);
  return dist / sp + (e.freeze > 0 ? e.freeze : 0);
}

// ---------- Setup ----------

/** Seeded spawn table for one fight. */
export function planFight(cfg: BattleCfg, rng: Rng): Spawn[] {
  const act = ACTS[cfg.act];
  const out: Spawn[] = [];
  if (cfg.kind === 'boss') return out;
  // A fight is a few waves. Each wave sends a quick burst of enemies, then a short pause.
  const waves = cfg.kind === 'elite' ? 2 : 3 + (cfg.step >= 4 ? 1 : 0);
  const df = diffOf(cfg);
  const gap = (TUNE.gap - cfg.act * 0.2) * df.pace;
  let t = 1.5;
  let lastLane = -1;
  for (let w = 0; w < waves; w++) {
    const size = TUNE.wave + Math.round(cfg.act * TUNE.waveAct * df.ramp) + Math.floor(cfg.step / 3) + rng.int(0, 1);
    for (let i = 0; i < size; i++) {
      let lane = rng.int(0, 2);
      if (lane === lastLane) lane = rng.int(0, 2);
      lastLane = lane;
      out.push({ at: t, id: rng.weighted(act.pool), lane });
      t += gap * (0.7 + rng.next() * 0.6);
    }
    t += (7 - cfg.act * 0.8) * df.pace;
  }
  if (cfg.kind === 'elite') {
    const at = out[Math.floor(out.length * 0.4)]?.at ?? 4;
    out.push({ at: at + 0.5, id: act.elite, lane: 1 });
    out.sort((a, b) => a.at - b.at);
  }
  return out;
}

export function newBattle(cfg: BattleCfg): Battle {
  const rng = new Rng(cfg.seed);
  const queue = planFight(cfg, rng);
  const b: Battle = {
    cfg,
    rng,
    time: 0,
    enemies: [],
    queue,
    uid: 1,
    buf: '',
    target: null,
    elem: null,
    shape: null,
    mana: has0(cfg, 'font') ? cfg.maxMana : Math.round(cfg.maxMana * 0.5),
    maxMana: cfg.maxMana,
    hp: cfg.hp,
    maxHp: cfg.maxHp,
    ward: has0(cfg, 'ward') ? 1 : 0,
    combo: 0,
    bestCombo: 0,
    keys: 0,
    typos: 0,
    words: 0,
    kills: 0,
    walls: [],
    events: [],
    recent: [],
    over: null,
    total: queue.length,
  };
  if (has0(cfg, 'font') && cfg.spells.includes('fire')) b.elem = 'fire';
  if (cfg.kind === 'boss') spawn(b, ACTS[cfg.act].boss, 1);
  return b;
}

function has0(cfg: BattleCfg, rune: string): boolean {
  return cfg.runes.includes(rune);
}

// ---------- Words ----------

function pickWord(b: Battle, tier: 1 | 2 | 3 | 4, self?: Enemy): string {
  const others = b.enemies.filter((e) => !e.dead && e !== self);
  const used = new Set(others.map((e) => e.word));
  const firsts = new Set(others.map((e) => e.word[0]));
  if (b.buf) firsts.add(b.buf[0]);
  const list = WORDS[tier];
  let w = list[0];
  for (let i = 0; i < 24; i++) {
    w = b.rng.pick(list);
    if (used.has(w) || b.recent.includes(w)) continue;
    if (i < 16 && firsts.has(w[0])) continue;
    if (self && w === self.word) continue;
    break;
  }
  b.recent.push(w);
  if (b.recent.length > 40) b.recent.shift();
  return w;
}

function pickPhrase(b: Battle, self: Enemy): string {
  const list = ACTS[b.cfg.act].phrases.filter((p) => p !== self.word && !b.recent.includes(p));
  const p = b.rng.pick(list.length ? list : ACTS[b.cfg.act].phrases);
  b.recent.push(p);
  if (b.recent.length > 40) b.recent.shift();
  return p;
}

/** Word tier for this enemy, a bit longer in later acts. */
function tierFor(b: Battle, d: EnemyDef): 1 | 2 | 3 | 4 {
  if (d.special === 'missile' || d.special === 'decoy') return 1;
  const up = diffOf(b.cfg).longer && b.cfg.act >= 2 && d.tier < 3 && b.rng.chance(0.3) ? 1 : 0;
  return Math.min(4, d.tier + up) as 1 | 2 | 3 | 4;
}

function newWord(b: Battle, e: Enemy): void {
  e.word = isBoss(e) ? pickPhrase(b, e) : pickWord(b, tierFor(b, def(e)), e);
}

export function spawn(b: Battle, id: string, lane: number, x?: number, y?: number): Enemy {
  const d = ENEMIES[id];
  const scale = (d.special === 'boss' ? TUNE.bossHp : 1 + b.cfg.act * TUNE.hpAct * diffOf(b.cfg).ramp) * diffOf(b.cfg).hp;
  const hp = Math.round(d.hp * (d.special === 'missile' || d.special === 'decoy' ? 1 : scale));
  const bx = x ?? LANES[lane] + (d.special === 'boss' ? 0 : b.rng.int(-24, 24));
  const e: Enemy = {
    uid: b.uid++,
    id,
    x: d.special === 'boss' ? PX : bx,
    y: y ?? (d.special === 'boss' ? 58 : -14),
    baseX: bx,
    lane,
    hp,
    max: hp,
    shield: Math.max(0, (d.shield ?? 0) + (d.shield ? diffOf(b.cfg).shield : 0)),
    word: '',
    age: 0,
    slow: 0,
    freeze: 0,
    burn: 0,
    burnDps: 0,
    shiftT: 3,
    supportT: 4,
    vx: 0,
    vy: 1,
    dead: false,
    flash: 0,
    castT: 4,
    callT: 7,
    held: false,
  };
  if (d.special === 'decoy') e.y = 60 + b.rng.int(0, 120);
  if (d.special === 'missile') {
    const dx = PX - e.x;
    const dy = PY - e.y;
    const l = Math.hypot(dx, dy) || 1;
    e.vx = dx / l;
    e.vy = dy / l;
  }
  newWord(b, e);
  b.enemies.push(e);
  b.events.push({ t: 'spawn', boss: d.special === 'boss' });
  return e;
}

// ---------- Damage ----------

function hitEnemy(b: Battle, e: Enemy, dmg: number, elem: Elem | null, typed: boolean): void {
  if (e.dead) return;
  e.flash = 0.18;
  const d = def(e);
  if (elem === 'fire') {
    e.burn = 3;
    e.burnDps = 4 * (1 + b.cfg.act * 0.25);
  }
  if (elem === 'frost') {
    e.slow = 4;
    if (has(b, 'deepfreeze')) e.freeze = 1.5;
  }
  if (e.shield > 0) {
    e.shield--;
    b.events.push({ t: 'shield', x: e.x, y: e.y });
    newWord(b, e);
    return;
  }
  const n = Math.max(1, Math.round(dmg));
  e.hp -= n;
  b.events.push({ t: 'hit', x: e.x, y: e.y - (d.size ?? 30) / 2, dmg: n, color: elem ? SPELLS[elem].color : '#ffffff' });
  if (e.hp <= 0) kill(b, e);
  else if (typed || d.special === 'shift') newWord(b, e);
}

function kill(b: Battle, e: Enemy, credit = true): void {
  if (e.dead) return;
  e.dead = true;
  const d = def(e);
  if (credit) b.kills++;
  b.events.push({ t: 'kill', x: e.x, y: e.y, icon: d.icon, boss: d.special === 'boss' });
  if (b.target === e.uid) b.target = null;
  if (d.special === 'split') {
    spawn(b, 'slimelet', e.lane, e.x - 14, e.y);
    spawn(b, 'slimelet', e.lane, e.x + 14, e.y + 4);
  }
  if (e.burn > 0 && has(b, 'kindling')) {
    const next = nearestTo(b, e.x, e.y, 130, [e]);
    if (next) {
      next.burn = 3;
      next.burnDps = e.burnDps;
      b.events.push({ t: 'chain', x1: e.x, y1: e.y, x2: next.x, y2: next.y });
    }
  }
  if (d.special === 'boss') {
    for (const o of b.enemies) if (!o.dead) kill(b, o, false);
    b.queue = [];
  }
}

function nearestTo(b: Battle, x: number, y: number, r: number, skip: Enemy[]): Enemy | null {
  let best: Enemy | null = null;
  let bd = r;
  for (const o of b.enemies) {
    if (o.dead || skip.includes(o) || isDecoy(o)) continue;
    const dd = Math.hypot(o.x - x, o.y - y);
    if (dd < bd) {
      bd = dd;
      best = o;
    }
  }
  return best;
}

function hurtPlayer(b: Battle, dmg: number, x: number, y: number): void {
  if (b.ward > 0) {
    b.ward--;
    b.events.push({ t: 'block', x, y });
    return;
  }
  b.hp -= dmg;
  b.events.push({ t: 'hurt', dmg, x, y });
  if (b.hp <= 0) {
    b.hp = 0;
    b.over = 'lose';
  }
}

function heal(b: Battle, n: number): void {
  const before = b.hp;
  b.hp = Math.min(b.maxHp, b.hp + n);
  if (b.hp > before) b.events.push({ t: 'heal', n: b.hp - before });
}

// ---------- Typing ----------

/** Enemies whose word starts with `s`, the locked target first, then the closest. */
function matches(b: Battle, s: string): Enemy[] {
  const list = b.enemies.filter((e) => !e.dead && e.word.startsWith(s));
  list.sort((p, q) => (p.uid === b.target ? -1 : q.uid === b.target ? 1 : eta(p) - eta(q)));
  return list;
}

function spellMatch(b: Battle, s: string): string | null {
  for (const id of b.cfg.spells) if (SPELLS[id].word.startsWith(s)) return id;
  return null;
}

export type KeyResult = 'ok' | 'typo' | 'skip' | 'word' | 'spell';

/** One typed character. A key that fits no word is a typo and breaks the combo. */
export function typeKey(b: Battle, raw: string): KeyResult {
  if (b.over) return 'skip';
  const ch = raw.toLowerCase();
  if (ch === ' ' && !b.buf) return 'skip';
  const next = b.buf + ch;
  const es = matches(b, next);
  const sp = spellMatch(b, next);
  if (!es.length && !sp) {
    b.typos++;
    b.combo = has(b, 'steady') ? Math.floor(b.combo / 2) : 0;
    b.events.push({ t: 'typo' });
    return 'typo';
  }
  b.keys++;
  b.buf = next;
  b.target = es[0]?.uid ?? null;
  b.events.push({ t: 'key' });
  const done = es.find((e) => e.word === next);
  if (done) {
    completeWord(b, done);
    return 'word';
  }
  if (sp && SPELLS[sp].word === next) {
    castSpell(b, sp);
    return 'spell';
  }
  return 'ok';
}

export function backspace(b: Battle): void {
  b.buf = b.buf.slice(0, -1);
  if (!b.buf) b.target = null;
  else b.target = matches(b, b.buf)[0]?.uid ?? null;
}

export function clearBuf(b: Battle): void {
  b.buf = '';
  b.target = null;
}

function completeWord(b: Battle, e: Enemy): void {
  const d = def(e);
  b.buf = '';
  b.target = null;
  if (d.special === 'decoy') {
    kill(b, e, false);
    b.combo = 0;
    b.events.push({ t: 'decoy', x: e.x, y: e.y });
    hurtPlayer(b, 1, e.x, e.y);
    return;
  }
  b.words++;
  b.combo++;
  b.bestCombo = Math.max(b.bestCombo, b.combo);
  const boss = d.special === 'boss';
  const len = e.word.replace(/ /g, '').length;
  let dmg = (boss ? 14 : 8 + Math.min(len, 12)) * dmgMult(b);
  if (len >= 7 && has(b, 'longword')) dmg *= 1.4;
  if (has(b, 'echo') && b.combo % 5 === 0) {
    dmg *= 2;
    b.events.push({ t: 'echo' });
  }
  if (has(b, 'leech') && b.combo % 12 === 0) heal(b, 1);
  const elem = b.elem;
  const shape = b.shape;
  b.elem = null;
  b.shape = null;
  if (elem === 'fire') dmg *= 1.3;
  b.events.push({ t: 'bolt', x: e.x, y: e.y, color: elem ? SPELLS[elem].color : shape ? SPELLS.lance.color : '#bfe9ff' });
  hitEnemy(b, e, dmg, elem, true);
  if (elem === 'volt') {
    const done: Enemy[] = [e];
    let from = e;
    for (let i = 0; i < (has(b, 'arccoil') ? 3 : 1); i++) {
      const o = nearestTo(b, from.x, from.y, 170, done);
      if (!o) break;
      b.events.push({ t: 'chain', x1: from.x, y1: from.y, x2: o.x, y2: o.y });
      hitEnemy(b, o, dmg * 0.6, 'volt', false);
      done.push(o);
      from = o;
    }
  }
  if (shape === 'lance') {
    for (const o of b.enemies) {
      if (o === e || o.dead || isBoss(o) || isDecoy(o) || Math.abs(o.x - e.x) > 46) continue;
      hitEnemy(b, o, dmg * (has(b, 'pierce') ? 1 : 0.7), elem, false);
    }
  }
}

function castSpell(b: Battle, id: string): void {
  const s = SPELLS[id];
  const cost = spellCost(b, id);
  b.buf = '';
  b.target = null;
  if (b.mana < cost) {
    b.events.push({ t: 'fizzle' });
    return;
  }
  b.mana -= cost;
  b.events.push({ t: 'cast', spell: id });
  if (s.kind === 'elem') {
    b.elem = id as Elem;
    return;
  }
  if (s.kind === 'shape') {
    b.shape = 'lance';
    return;
  }
  if (s.kind === 'mend') {
    heal(b, 2);
    return;
  }
  const elem = b.elem;
  b.elem = null;
  if (s.kind === 'nova') {
    const wide = has(b, 'widenova');
    const r = NOVA_R * (wide ? 1.5 : 1);
    let dmg = 14 * dmgMult(b) * (wide ? 1.5 : 1);
    if (elem === 'fire') dmg *= 1.3;
    b.events.push({ t: 'nova', r, color: elem ? SPELLS[elem].color : s.color });
    for (const e of [...b.enemies]) {
      if (e.dead || isBoss(e) || isDecoy(e)) continue;
      if (Math.hypot(e.x - PX, e.y - PY) <= r) hitEnemy(b, e, dmg, elem, false);
    }
    return;
  }
  if (s.kind === 'wall') {
    const threat = b.enemies
      .filter((e) => !e.dead && !isBoss(e) && !isDecoy(e) && e.y < WALL_Y)
      .sort((p, q) => eta(p) - eta(q))[0];
    const lane = threat ? laneOf(threat.x) : 1;
    const dur = has(b, 'stonewall') ? 12 : 6;
    b.walls = b.walls.filter((w) => w.lane !== lane);
    b.walls.push({ lane, t: dur, max: dur, elem, tick: 0 });
    b.events.push({ t: 'wall', lane });
  }
}

// ---------- Time ----------

export function stepBattle(b: Battle, dt: number): void {
  if (b.over) return;
  b.time += dt;
  b.mana = Math.min(b.maxMana, b.mana + manaRegen(b) * dt);
  while (b.queue.length && b.queue[0].at <= b.time) {
    const s = b.queue.shift()!;
    spawn(b, s.id, s.lane);
  }
  for (const w of b.walls) {
    w.t -= dt;
    w.tick -= dt;
  }
  const act = b.cfg.act;
  for (const e of b.enemies) {
    if (e.dead) continue;
    const d = def(e);
    e.age += dt;
    e.flash = Math.max(0, e.flash - dt);
    if (e.burn > 0) {
      e.burn -= dt;
      e.hp -= e.burnDps * dt;
      if (e.hp <= 0) {
        e.hp = 0;
        kill(b, e);
        continue;
      }
    }
    if (d.special === 'decoy') {
      e.x = e.baseX + Math.sin(e.age * 1.3) * 18;
      e.y += d.speed * dt;
      if (e.age > 8) {
        e.dead = true;
        if (b.target === e.uid) b.target = null;
      }
      continue;
    }
    const slowF = e.freeze > 0 ? 0 : e.slow > 0 ? 0.4 : 1;
    e.freeze = Math.max(0, e.freeze - dt);
    e.slow = Math.max(0, e.slow - dt);
    if (d.special === 'shift') {
      e.shiftT -= dt;
      if (e.shiftT <= 0) {
        e.shiftT = 3 * diffOf(b.cfg).pace;
        newWord(b, e);
      }
    }
    if (d.special === 'support') {
      e.supportT -= dt;
      if (e.supportT <= 0) {
        e.supportT = 6 * diffOf(b.cfg).pace;
        const ally = b.rng.pick(b.enemies.filter((o) => !o.dead && o !== e && o.shield < 2 && !isBoss(o) && !isMissile(o) && !isDecoy(o)).concat([e]));
        ally.shield++;
        b.events.push({ t: 'shield', x: ally.x, y: ally.y });
      }
    }
    if (d.special === 'boss') {
      const rage = e.hp < e.max / 2 ? 1.35 : 1;
      const tick = dt * slowF * rage;
      e.castT -= tick;
      e.callT -= tick;
      e.x = PX + Math.sin(b.time * 0.5) * 40;
      if (e.castT <= 0) {
        e.castT = (TUNE.cast - act * 0.6) * diffOf(b.cfg).pace;
        spawn(b, ACTS[act].missile, laneOf(e.x), e.x, e.y + 30);
      }
      const minions = b.enemies.filter((o) => !o.dead && !isBoss(o) && !isMissile(o) && !isDecoy(o)).length;
      if (e.callT <= 0 && minions < 2 + Math.floor(act / 2)) {
        e.callT = (7.5 - act * 0.8) * diffOf(b.cfg).pace;
        const lane = b.rng.int(0, 2);
        spawn(b, b.rng.pick(ACTS[act].minions), lane);
      }
      continue;
    }
    const sp = d.speed * TUNE.speed * diffOf(b.cfg).speed * (1 + act * TUNE.speedAct * diffOf(b.cfg).ramp) * slowF * dt;
    const lane = laneOf(e.x);
    const wall = b.walls.find((w) => w.lane === lane && w.t > 0);
    e.held = false;
    if (d.special === 'missile') {
      const nx = e.x + e.vx * sp;
      const ny = e.y + e.vy * sp;
      if (wall && e.y < WALL_Y && ny >= WALL_Y - 10) {
        kill(b, e, false);
        b.events.push({ t: 'block', x: e.x, y: e.y });
        continue;
      }
      e.x = nx;
      e.y = ny;
    } else if (e.y < TURN_Y) {
      let ny = e.y + sp;
      if (wall && e.y <= WALL_Y - 14 && ny > WALL_Y - 14) {
        ny = WALL_Y - 14;
        e.held = true;
      }
      e.y = ny;
      if (d.special === 'zigzag') e.x = e.baseX + Math.sin(e.age * 2.2) * 26;
    } else {
      const dx = PX - e.x;
      const dy = PY - e.y;
      const l = Math.hypot(dx, dy) || 1;
      e.x += (dx / l) * sp;
      e.y += (dy / l) * sp;
    }
    if (e.held && wall && wall.tick <= 0) {
      if (wall.elem === 'fire') {
        e.burn = 3;
        e.burnDps = 4 * (1 + act * 0.25);
      }
      if (wall.elem === 'frost') e.slow = 4;
      let zap = has(b, 'thornwall') ? 4 : 0;
      if (wall.elem === 'volt') zap += 6;
      if (zap) hitEnemy(b, e, zap, wall.elem, false);
      if (e.dead) continue;
    }
    if (Math.hypot(PX - e.x, PY - e.y) < 20) {
      e.dead = true;
      if (b.target === e.uid) b.target = null;
      hurtPlayer(b, Math.max(1, d.dmg), e.x, e.y);
      if (b.over) return;
    }
  }
  for (const w of b.walls) if (w.tick <= 0) w.tick = 1;
  b.walls = b.walls.filter((w) => w.t > 0);
  b.enemies = b.enemies.filter((e) => !e.dead);
  if (b.buf && !matches(b, b.buf).length && !spellMatch(b, b.buf)) clearBuf(b);
  if (b.target !== null && !b.enemies.some((e) => e.uid === b.target)) b.target = b.buf ? matches(b, b.buf)[0]?.uid ?? null : null;
  const left = b.enemies.filter((e) => !isDecoy(e)).length;
  if (!b.queue.length && left === 0 && b.time > 1) {
    b.over = 'win';
    b.enemies = [];
  }
}

/** Fraction of the fight that is done, for the progress bar. */
export function progress(b: Battle): number {
  if (b.cfg.kind === 'boss') {
    const boss = b.enemies.find(isBoss);
    return boss ? 1 - boss.hp / boss.max : 1;
  }
  return b.total ? 1 - (b.queue.length + b.enemies.filter((e) => !isDecoy(e)).length * 0.5) / b.total : 1;
}
