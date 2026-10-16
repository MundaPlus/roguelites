/** One fight: the well, the enemy above it, damage and enemy attacks. No DOM. */
import { ACTS, ENEMIES, SPECIAL_IDS, type Card, type Move, type MoveKind } from './data';
import { Rng } from './rng';
import {
  HIDDEN,
  W,
  addGarbage,
  apply,
  fits,
  lockCells,
  newWell,
  overTop,
  spawnNext,
  tick as wellTick,
  wipeTop,
  type Input,
  type LockResult,
  type Well,
} from './well';

export type FightKind = 'fight' | 'elite' | 'boss';

export interface EnemyInst {
  id: string;
  hp: number;
  max: number;
  shield: number;
  burn: number;
  every: number;
  timer: number;
  /** Seconds of ice slow left. */
  slow: number;
  mi: number;
  hitMul: number;
}

export type FEvent =
  | { t: 'clear'; lines: number; rows: number[]; dmg: number; label: string; specials: LockResult['specials']; shielded: number }
  | { t: 'lock'; cells: [number, number][] }
  | { t: 'special'; id: string; text: string }
  | { t: 'enemy'; move: Move; text: string }
  | { t: 'hurt'; n: number; why: string }
  | { t: 'heal'; n: number }
  | { t: 'burn'; n: number }
  | { t: 'topout'; n: number }
  | { t: 'unlock'; n: number }
  | { t: 'hold' }
  | { t: 'thorns'; n: number };

export interface Fight {
  kind: FightKind;
  act: number;
  well: Well;
  enemy: EnemyInst;
  hp: number;
  maxHp: number;
  power: number;
  relics: string[];
  gold: number;
  time: number;
  gravity: number;
  speedT: number;
  blindT: number;
  combo: number;
  b2b: boolean;
  lines: number;
  pieces: number;
  dealt: number;
  best: number;
  rs: number;
  ev: FEvent[];
  over: '' | 'win' | 'lose';
}

export interface FightSetup {
  kind: FightKind;
  act: number;
  enemyId: string;
  deck: Card[];
  hp: number;
  maxHp: number;
  power: number;
  relics: string[];
  seed: number;
}

/** Attack units for 0..4 lines, T-spins and T-spin minis. 1/3/6/10 as in the design. */
export const LINE_UNITS = [0, 1, 3, 6, 10, 15];
export const TSPIN_UNITS = [0, 4, 8, 12];
export const MINI_UNITS = [0, 1, 3];
export const LOCK_DELAY = 0.5;
export const SOFT_RATE = 22;

export const topoutDamage = (f: Fight): number => {
  const n = 10 + f.act * 4;
  return f.relics.includes('helm') ? Math.ceil(n / 2) : n;
};

export function startFight(s: FightSetup): Fight {
  const def = ENEMIES[s.enemyId];
  const act = ACTS[s.act];
  const max = Math.round(def.hp * act.hpMul);
  const every = def.every * (s.relics.includes('frost') ? 1.15 : 1);
  const f: Fight = {
    kind: s.kind,
    act: s.act,
    well: newWell(s.deck, s.seed, s.relics.includes('twinhold') ? 2 : 1),
    enemy: { id: def.id, hp: max, max, shield: 0, burn: 0, every, timer: every + 2, slow: 0, mi: 0, hitMul: act.hitMul },
    hp: s.hp,
    maxHp: s.maxHp,
    power: s.power,
    relics: s.relics,
    gold: 0,
    time: 0,
    gravity: act.gravity * (s.relics.includes('feather') ? 0.7 : 1),
    speedT: 0,
    blindT: 0,
    combo: -1,
    b2b: false,
    lines: 0,
    pieces: 0,
    dealt: 0,
    best: 0,
    rs: (s.seed ^ 0x5bd1e995) | 0,
    ev: [],
    over: '',
  };
  spawnNext(f.well);
  return f;
}

export const curMove = (f: Fight): Move => {
  const def = ENEMIES[f.enemy.id];
  return def.moves[f.enemy.mi % def.moves.length];
};

/** The value of a move after act scaling. */
export function moveValue(f: Fight, mv: Move): number {
  if (mv.k === 'hit') return Math.round(mv.n * f.enemy.hitMul);
  if (mv.k === 'shield' || mv.k === 'heal') return Math.round(mv.n * ACTS[f.act].hpMul);
  if (mv.k === 'garbage' && f.relics.includes('anchor')) return Math.max(0, mv.n - 1);
  return mv.n;
}

export const rowsPerSec = (f: Fight): number => f.gravity * (f.speedT > 0 ? 3 : 1);
export const lockDelay = (f: Fight): number => (f.relics.includes('gloves') ? 1 : LOCK_DELAY);
export const blinded = (f: Fight): boolean => f.blindT > 0 && !f.relics.includes('spyglass');

function rng(f: Fight): { r: Rng; done: () => void } {
  const r = new Rng(f.rs);
  return { r, done: () => (f.rs = r.state) };
}

export function hurt(f: Fight, n: number, why: string): void {
  if (f.over || n <= 0) return;
  f.hp -= n;
  f.ev.push({ t: 'hurt', n, why });
  if (f.hp <= 0) {
    f.hp = 0;
    f.over = 'lose';
  }
}

function heal(f: Fight, n: number): void {
  const before = f.hp;
  f.hp = Math.min(f.maxHp, f.hp + n);
  if (f.hp > before) f.ev.push({ t: 'heal', n: f.hp - before });
}

/** Deals damage to the enemy. Shield absorbs first. Returns the shield part. */
export function damage(f: Fight, n: number): number {
  const e = f.enemy;
  const sh = Math.min(e.shield, n);
  e.shield -= sh;
  e.hp -= n - sh;
  f.dealt += n - sh;
  if (e.hp <= 0 && !f.over) {
    e.hp = 0;
    f.over = 'win';
  }
  return sh;
}

function topout(f: Fight): void {
  const n = topoutDamage(f);
  wipeTop(f.well, 8);
  f.combo = -1;
  f.ev.push({ t: 'topout', n });
  hurt(f, n, 'Top-out');
}

function nextPiece(f: Fight): void {
  if (f.over) return;
  if (f.relics.includes('prism') && f.pieces % 8 === 7) {
    const q = f.well.queue;
    if (q[0] && !q[0].x) {
      const r = rng(f);
      q[0] = { ...q[0], x: r.r.pick(SPECIAL_IDS.filter((x) => x !== 'gold')), l: 1 };
      r.done();
    }
  }
  if (!spawnNext(f.well)) {
    topout(f);
    if (!f.over && !spawnNext(f.well)) {
      wipeTop(f.well, 0);
      spawnNext(f.well);
    }
  }
}

/** Damage and effects of a locked piece. Then the next piece spawns. */
export function resolveLock(f: Fight, res: LockResult): void {
  f.pieces++;
  f.ev.push({ t: 'lock', cells: res.cells });
  if (res.unlocked) f.ev.push({ t: 'unlock', n: res.unlocked });
  const lines = res.lines;
  if (lines > 0) {
    f.lines += lines;
    f.combo++;
    let units: number;
    let label: string;
    if (res.tspin === 'full') {
      units = TSPIN_UNITS[Math.min(3, lines)];
      label = ['', 'T-Spin Single', 'T-Spin Double', 'T-Spin Triple'][Math.min(3, lines)];
    } else if (res.tspin === 'mini') {
      units = MINI_UNITS[Math.min(2, lines)];
      label = 'T-Spin Mini';
    } else {
      units = LINE_UNITS[Math.min(5, lines)];
      label = ['', 'Single', 'Double', 'Triple', 'TETRIS', 'PENTRIS'][Math.min(5, lines)];
    }
    if (res.tspin !== 'none' && f.relics.includes('spin')) units *= 2;
    if (lines >= 4 && f.relics.includes('crown')) units *= 1.5;
    const hard = lines >= 4 || res.tspin !== 'none';
    if (hard && f.b2b) {
      units *= 1.5;
      label = `B2B ${label}`;
    }
    f.b2b = hard ? true : false;
    const comboBonus = Math.min(5, Math.floor(f.combo / 2)) * (f.relics.includes('drum') ? 2 : 1);
    units += comboBonus;
    if (f.combo >= 1) label += ` · ${f.combo + 1} combo`;
    if (res.perfect) {
      units += 10;
      label += ' · PERFECT';
    }
    let mul = f.power * (f.relics.includes('whetstone') ? 1.25 : 1);
    for (const sp of res.specials) if (sp.id === 'star') mul *= sp.lvl >= 2 ? 2 : 1.5;
    let dmg = Math.max(1, Math.round(units * mul));
    let bomb = 0;
    for (const sp of res.specials) {
      const two = sp.lvl >= 2;
      switch (sp.id) {
        case 'fire':
          f.enemy.burn += two ? 12 : 6;
          f.ev.push({ t: 'special', id: 'fire', text: `🔥 Burn +${two ? 12 : 6}` });
          break;
        case 'ice':
          f.enemy.slow = Math.max(f.enemy.slow, two ? 8 : 5);
          f.ev.push({ t: 'special', id: 'ice', text: `❄️ Slow ${two ? 8 : 5}s` });
          break;
        case 'heart':
          heal(f, two ? 4 : 2);
          break;
        case 'bomb':
          bomb += two ? 8 : 4;
          f.ev.push({ t: 'special', id: 'bomb', text: `💣 Boom` });
          break;
        case 'gold':
          f.gold += two ? 9 : 4;
          f.ev.push({ t: 'special', id: 'gold', text: `🪙 +${two ? 9 : 4}` });
          break;
        case 'star':
          f.ev.push({ t: 'special', id: 'star', text: `⭐ Power` });
          break;
      }
    }
    dmg += bomb;
    if (lines >= 3 && f.relics.includes('fang')) heal(f, 2);
    f.best = Math.max(f.best, dmg);
    const shielded = damage(f, dmg);
    f.ev.push({ t: 'clear', lines, rows: res.rows, dmg, label, specials: res.specials, shielded });
  } else {
    f.combo = -1;
  }
  if (overTop(f.well)) topout(f);
  nextPiece(f);
}

/** Runs the enemy's current move. */
export function enemyAct(f: Fight): void {
  const mv = curMove(f);
  const n = moveValue(f, mv);
  const e = f.enemy;
  const r = rng(f);
  let text = '';
  switch (mv.k as MoveKind) {
    case 'garbage':
      if (n > 0) {
        addGarbage(f.well, n, r.r.int(0, W - 1));
        if (f.well.cur && !fits(f.well, f.well.cur.card.s, f.well.cur.rot, f.well.cur.x, f.well.cur.y)) topout(f);
        else if (overTop(f.well)) {
          topout(f);
        }
      }
      text = n > 0 ? `+${n} garbage` : 'Anchor holds';
      break;
    case 'hit':
      hurt(f, n, ENEMIES[e.id].name);
      if (f.relics.includes('thorns')) {
        damage(f, 5);
        f.ev.push({ t: 'thorns', n: 5 });
      }
      text = `Hit ${n}`;
      break;
    case 'speed':
      f.speedT += n;
      text = 'Speed up!';
      break;
    case 'lock':
      if (f.relics.includes('lockpick')) text = 'Lockpick!';
      else text = `${lockCells(f.well, n, r.r)} cells locked`;
      break;
    case 'shield':
      e.shield += n;
      text = `Shield +${n}`;
      break;
    case 'blind':
      if (f.relics.includes('spyglass')) text = 'Spyglass!';
      else {
        f.blindT += n;
        text = 'Blinded!';
      }
      break;
    case 'heal':
      e.hp = Math.min(e.max, e.hp + n);
      text = `Heals ${n}`;
      break;
    case 'junk':
      for (let i = 0; i < n; i++) f.well.queue.splice(Math.min(i * 2, f.well.queue.length), 0, { s: 'junk' });
      text = `+${n} rubble`;
      break;
  }
  r.done();
  f.ev.push({ t: 'enemy', move: mv, text });
  e.mi++;
  e.timer = e.every;
}

/** Player input. Returns false if nothing changed. */
export function input(f: Fight, inp: Input): boolean {
  if (f.over || !f.well.cur) return false;
  const w = f.well;
  const before = w.cur ? `${w.cur.x},${w.cur.y},${w.cur.rot},${w.cur.card.s}` : '';
  const res = apply(w, inp);
  if (res) {
    resolveLock(f, res);
    return true;
  }
  if (inp === 'hold') {
    const p = w.cur;
    if (p && !fits(w, p.card.s, p.rot, p.x, p.y)) {
      topout(f);
      if (!f.over) spawnNext(w);
    }
    if (`${w.cur?.x},${w.cur?.y},${w.cur?.rot},${w.cur?.card.s}` !== before) f.ev.push({ t: 'hold' });
  }
  return `${w.cur?.x},${w.cur?.y},${w.cur?.rot},${w.cur?.card.s}` !== before;
}

/** Advances time. `soft` is true while soft drop is held. */
export function tick(f: Fight, dt: number, soft = false): void {
  if (f.over) return;
  f.time += dt;
  if (f.speedT > 0) f.speedT = Math.max(0, f.speedT - dt);
  if (f.blindT > 0) f.blindT = Math.max(0, f.blindT - dt);
  const e = f.enemy;
  // Burn deals 2 per second.
  if (e.burn > 0) {
    const before = Math.ceil(e.burn);
    e.burn = Math.max(0, e.burn - 2 * dt);
    const n = before - Math.ceil(e.burn);
    if (n > 0) {
      damage(f, n);
      f.ev.push({ t: 'burn', n });
      if (f.over) return;
    }
  }
  // Ice slows the enemy timer to half speed. It does not stack.
  e.timer -= e.slow > 0 ? dt / 2 : dt;
  if (e.slow > 0) e.slow = Math.max(0, e.slow - dt);
  if (e.timer <= 0) enemyAct(f);
  if (f.over) return;
  const rate = soft ? Math.max(SOFT_RATE, rowsPerSec(f) * 2) : rowsPerSec(f);
  const res = wellTick(f.well, dt, rate, lockDelay(f));
  if (res) resolveLock(f, res);
}

/** Highest stack row in visible terms (0 = empty well, 20 = full). */
export function stackHeight(w: Well): number {
  for (let y = HIDDEN; y < w.grid.length / W; y++) {
    for (let x = 0; x < W; x++) if (w.grid[y * W + x]) return w.grid.length / W - y;
  }
  return 0;
}
