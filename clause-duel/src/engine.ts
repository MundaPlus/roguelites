/** Pure fight engine. `playRound(fight, myIntent, foeIntent)` returns a new fight and the events. */
import { CLAUSES, SPECIALS, type ClauseId, type Intent, type Side, type SpcId, type Style } from './data';
import type { Rng } from './rng';

export interface Stats {
  name: string;
  icon: string;
  hp: number;
  max: number;
  atk: number;
  grd: number;
  spc: SpcId;
  pow: number;
  cd: number;
}

export interface FS extends Stats {
  /** Rounds until the Special is ready. 0 = ready. */
  ready: number;
  block: number;
  poison: number;
  poisonT: number;
  weak: number;
  weakT: number;
  hitOnce: boolean;
}

export interface Clause {
  id: ClauseId;
  owner: Side;
  sealed?: boolean;
}

export interface Fight {
  f: [FS, FS];
  round: number;
  cl: Clause[];
  /** 0 = running, 1 = you win, 2 = foe wins. */
  over: 0 | 1 | 2;
  hitRound: boolean;
}

/** One visible effect. `s` is the side that the number lands on. */
export interface Ev {
  k: 'dmg' | 'heal' | 'block' | 'note';
  s: Side;
  n: number;
  txt: string;
  cl?: ClauseId;
}

export const NAMES: [string, string] = ['You', 'Foe'];
export const MAX_ROUNDS = 40;

export const has = (F: Fight, id: ClauseId): boolean => F.cl.some((c) => c.id === id);
export const own = (F: Fight, id: ClauseId, s: Side): boolean => F.cl.some((c) => c.id === id && c.owner === s);
const other = (s: Side): Side => (s === 0 ? 1 : 0);

export function newFight(me: Stats, foe: Stats, cl: Clause[]): Fight {
  const mk = (s: Stats): FS => ({ ...s, ready: 0, block: 0, poison: 0, poisonT: 0, weak: 0, weakT: 0, hitOnce: false });
  const F: Fight = { f: [mk(me), mk(foe)], round: 1, cl: cl.map((c) => ({ ...c })), over: 0, hitRound: false };
  for (const s of [0, 1] as Side[]) if (own(F, 'headstart', s)) F.f[s].block += 10;
  return F;
}

export function cloneFight(F: Fight): Fight {
  return { f: [{ ...F.f[0] }, { ...F.f[1] }], round: F.round, cl: F.cl, over: F.over, hitRound: F.hitRound };
}

export function overtimeStart(F: Fight): number {
  return has(F, 'fuse') ? 4 : 6;
}

export function overtimeBonus(F: Fight): number {
  const ot = overtimeStart(F);
  return F.round >= ot ? 3 * (F.round - ot + 1) : 0;
}

export function guardValue(F: Fight, s: Side): number {
  let g = F.f[s].grd;
  if (own(F, 'bulwark', s)) g += 5;
  if (own(F, 'tax', other(s))) g -= 4;
  return Math.max(0, g);
}

export function spcCooldown(F: Fight, s: Side): number {
  let c = F.f[s].cd;
  if (has(F, 'haste')) c--;
  if (own(F, 'focus', s)) c--;
  return Math.max(1, c);
}

/** Why the Special is blocked this round, or '' when it is ready. */
export function spcBlock(F: Fight, s: Side): string {
  if (F.f[s].ready > 0) return `ready in ${F.f[s].ready}`;
  if (has(F, 'hush') && F.round <= 2) return 'Hush';
  if (own(F, 'gag', other(s)) && F.round <= 3) return 'Gag';
  return '';
}

export function firstActor(F: Fight): { side: Side; why: string } {
  if (has(F, 'lowground') && F.f[0].hp !== F.f[1].hp) return { side: F.f[0].hp < F.f[1].hp ? 0 : 1, why: 'Low Ground' };
  const fm = F.cl.find((c) => c.id === 'first');
  if (fm) return { side: fm.owner, why: 'First Move' };
  return { side: 0, why: 'you by default' };
}

const isGuarding = (F: Fight, s: Side, it: Intent): boolean => it === 'grd' || (it === 'spc' && (F.f[s].spc === 'bash' || F.f[s].spc === 'fortify'));

function heal(F: Fight, s: Side, n: number, ev: Ev[], src: string): void {
  const f = F.f[s];
  if (n <= 0) return;
  if (has(F, 'bloodless')) {
    ev.push({ k: 'note', s, n: 0, txt: `${NAMES[s]}: ${src} heal stopped`, cl: 'bloodless' });
    return;
  }
  const got = Math.min(n, f.max - f.hp);
  f.hp += got;
  if (got > 0) ev.push({ k: 'heal', s, n: got, txt: `${NAMES[s]} heal ${got} (${src})` });
}

function lose(F: Fight, s: Side, n: number, ev: Ev[], txt: string, cl?: ClauseId): void {
  if (n <= 0) return;
  F.f[s].hp -= n;
  ev.push({ k: 'dmg', s, n, txt, cl });
}

/** Damage of a hit before block. Also returns the clause names that changed it. */
export function hitDamage(F: Fight, src: Side, base: number): { d: number; why: ClauseId[] } {
  const a = F.f[src];
  const t = F.f[other(src)];
  const why: ClauseId[] = [];
  let d = base;
  if (own(F, 'edge', src)) {
    d += 3;
    why.push('edge');
  }
  if (own(F, 'opening', src) && !a.hitOnce) {
    d += 8;
    why.push('opening');
  }
  if (own(F, 'fury', src) && a.hp * 2 < a.max) {
    d += 4;
    why.push('fury');
  }
  if (has(F, 'bloodrush') && t.hp * 2 < t.max) {
    d += 3;
    why.push('bloodrush');
  }
  d += overtimeBonus(F);
  if (a.weakT > 0) d -= a.weak;
  d = Math.max(0, d);
  if (has(F, 'quickdraw') && !F.hitRound) {
    d *= 2;
    why.push('quickdraw');
  }
  if (has(F, 'cap') && d > 7) {
    d = 7;
    why.push('cap');
  }
  return { d, why };
}

function hit(F: Fight, src: Side, base: number, it: [Intent, Intent], ev: Ev[], label: string, pierceAll = false): number {
  const tg = other(src);
  const t = F.f[tg];
  const { d, why } = hitDamage(F, src, base);
  let pierce = 0;
  if (pierceAll) pierce = t.block;
  else if (has(F, 'sharp') && t.block > 0) {
    pierce = Math.min(3, t.block);
    why.push('sharp');
  }
  const absorbed = Math.min(t.block - pierce, d);
  t.block -= absorbed;
  const dealt = d - absorbed;
  t.hp -= dealt;
  F.hitRound = true;
  F.f[src].hitOnce = true;
  const blk = absorbed > 0 ? ` (${absorbed} blocked)` : '';
  ev.push({ k: 'dmg', s: tg, n: dealt, txt: `${NAMES[src]} ${label}: ${dealt} damage${blk}`, cl: why[0] });
  for (const w of why.slice(1)) ev.push({ k: 'note', s: src, n: 0, txt: `${CLAUSES[w].name} applies`, cl: w });
  if (isGuarding(F, tg, it[tg])) {
    if (has(F, 'spikes')) lose(F, src, 4, ev, `${NAMES[src]} take 4 from Spikes`, 'spikes');
    if (own(F, 'riposte', tg)) lose(F, src, 5, ev, `${NAMES[tg]} riposte for 5`, 'riposte');
  }
  if (own(F, 'leech', src) && dealt > 0) heal(F, src, 3, ev, 'Leech');
  return dealt;
}

function checkOver(F: Fight): boolean {
  if (F.f[0].hp <= 0) F.over = 2;
  else if (F.f[1].hp <= 0) F.over = 1;
  return F.over !== 0;
}

/** The intent that really happens: a blocked Special turns into an Attack. */
export function realIntent(F: Fight, s: Side, it: Intent): Intent {
  return it === 'spc' && spcBlock(F, s) ? 'atk' : it;
}

export function playRound(F0: Fight, i0: Intent, i1: Intent): { F: Fight; ev: Ev[] } {
  const F = cloneFight(F0);
  const ev: Ev[] = [];
  if (F.over) return { F, ev };
  F.hitRound = false;
  // Round start.
  if (has(F, 'foulair')) for (const s of [0, 1] as Side[]) lose(F, s, 2, ev, `${NAMES[s]} lose 2 to Foul Air`, 'foulair');
  for (const s of [0, 1] as Side[]) {
    const f = F.f[s];
    if (f.poisonT > 0) {
      lose(F, s, f.poison, ev, `${NAMES[s]} lose ${f.poison} to poison`);
      f.poisonT--;
    }
  }
  if (F.round === 3) for (const s of [0, 1] as Side[]) if (own(F, 'second', s)) heal(F, s, 8, ev, 'Second Wind');
  if (checkOver(F)) return { F, ev };

  const it: [Intent, Intent] = [realIntent(F, 0, i0), realIntent(F, 1, i1)];
  // Guard phase: guards land before any hit.
  for (const s of [0, 1] as Side[]) {
    const f = F.f[s];
    if (isGuarding(F, s, it[s])) {
      const n = guardValue(F, s) + (it[s] === 'spc' && f.spc === 'fortify' ? f.pow : 0);
      f.block += n;
      ev.push({ k: 'block', s, n, txt: `${NAMES[s]} guard: +${n} block` });
    }
  }
  const first = firstActor(F).side;
  for (const s of [first, other(first)]) {
    if (F.over) break;
    const f = F.f[s];
    const tg = other(s);
    if (it[s] === 'atk') hit(F, s, f.atk, it, ev, 'attack');
    else if (it[s] === 'spc') {
      f.ready = spcCooldown(F, s);
      const name = SPECIALS[f.spc].name;
      switch (f.spc) {
        case 'lunge':
          hit(F, s, f.atk + f.pow, it, ev, name, true);
          break;
        case 'smash':
          hit(F, s, f.atk + f.pow, it, ev, name);
          break;
        case 'bash':
          hit(F, s, f.pow, it, ev, name);
          break;
        case 'drain': {
          const d = hit(F, s, f.pow, it, ev, name);
          heal(F, s, d, ev, 'Drain');
          break;
        }
        case 'venom':
          hit(F, s, f.atk, it, ev, name);
          F.f[tg].poison = f.pow;
          F.f[tg].poisonT = 3;
          ev.push({ k: 'note', s: tg, n: 0, txt: `${NAMES[tg]} poisoned (${f.pow} × 3)` });
          break;
        case 'hex':
          hit(F, s, f.atk, it, ev, name);
          F.f[tg].weak = f.pow;
          F.f[tg].weakT = 2;
          ev.push({ k: 'note', s: tg, n: 0, txt: `${NAMES[tg]} hexed: hits −${f.pow}` });
          break;
        case 'mend':
          heal(F, s, f.pow, ev, 'Mend');
          break;
        case 'rage':
          f.atk += f.pow;
          ev.push({ k: 'note', s, n: 0, txt: `${NAMES[s]} rage: ATK +${f.pow}` });
          break;
        case 'fortify':
          break;
      }
    }
    checkOver(F);
  }
  // Round end.
  for (const s of [0, 1] as Side[]) {
    const f = F.f[s];
    f.block = has(F, 'longguard') ? Math.floor(f.block / 2) : 0;
    if (f.ready > 0) f.ready--;
    if (f.weakT > 0) f.weakT--;
  }
  F.round++;
  if (!F.over && F.round > MAX_ROUNDS) F.over = 2;
  return { F, ev };
}

// ---------- AI ----------

const STYLE_GUARD: Record<Style, number> = { aggro: 0.2, turtle: 0.45, sustain: 0.3 };

/** The foe picks its intent before it knows yours. The intent is shown to you. */
export function foeIntent(F: Fight, style: Style, rng: Rng): Intent {
  const f = F.f[1];
  if (!spcBlock(F, 1)) {
    let p = 0.75;
    if (f.spc === 'drain' || f.spc === 'mend') p = has(F, 'bloodless') ? 0.3 : f.hp < f.max * 0.8 ? 0.9 : 0.5;
    if (f.spc === 'rage') p = 0.9;
    if (rng.chance(p)) return 'spc';
  }
  if (f.block > 4 && has(F, 'longguard')) return rng.chance(0.75) ? 'atk' : 'grd';
  return rng.chance(STYLE_GUARD[style]) ? 'grd' : 'atk';
}

/** Value of a fight state from your side. Higher is better. */
function value(F: Fight): number {
  if (F.over === 1) return 1000 + F.f[0].hp;
  if (F.over === 2) return -1000 + F.f[1].hp * -1;
  const me = F.f[0];
  const fo = F.f[1];
  let v = me.hp - 1.15 * fo.hp;
  v += fo.poisonT * fo.poison * 0.9 - me.poisonT * me.poison * 0.9;
  if (has(F, 'longguard')) v += (me.block - fo.block) * 0.4;
  v -= me.ready * 0.8;
  return v;
}

export function legalIntents(F: Fight, s: Side): Intent[] {
  return spcBlock(F, s) ? ['atk', 'grd'] : ['atk', 'grd', 'spc'];
}

/** Your bot: tries each intent against the shown foe intent and keeps the best. */
export function botIntent(F: Fight, foe: Intent): Intent {
  let best: Intent = 'atk';
  let bv = -Infinity;
  for (const it of legalIntents(F, 0)) {
    const v = value(playRound(F, it, foe).F);
    if (v > bv + 1e-9) {
      bv = v;
      best = it;
    }
  }
  return best;
}

/** Plays a whole fight with the bots. Returns the fight at its end. */
export function autoFight(F: Fight, style: Style, rng: Rng): Fight {
  let cur = F;
  while (!cur.over) {
    const fi = foeIntent(cur, style, rng);
    cur = playRound(cur, botIntent(cur, fi), fi).F;
  }
  return cur;
}

/** Short text of what an intent does now, for the intent row and the buttons. */
export function intentText(F0: Fight, s: Side, it: Intent): string {
  // Quickdraw: assume the first actor hits first, so only its hit is doubled.
  const F = { ...F0, hitRound: firstActor(F0).side !== s };
  const f = F.f[s];
  if (it === 'spc' && spcBlock(F, s)) return `Blocked: ${spcBlock(F, s)}`;
  const real = realIntent(F, s, it);
  if (real === 'grd') return `Guard ${guardValue(F, s)}`;
  if (real === 'atk') return `Attack ${hitDamage(F, s, f.atk).d}`;
  const n = SPECIALS[f.spc].name;
  switch (f.spc) {
    case 'lunge':
    case 'smash':
      return `${n} ${hitDamage(F, s, f.atk + f.pow).d}`;
    case 'bash':
      return `${n} ${hitDamage(F, s, f.pow).d}`;
    case 'drain':
      return `${n} ${hitDamage(F, s, f.pow).d}`;
    case 'fortify':
      return `${n} ${guardValue(F, s) + f.pow}`;
    case 'mend':
      return `${n} ${f.pow}`;
    default:
      return n;
  }
}
