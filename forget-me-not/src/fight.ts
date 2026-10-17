/** Pure turn-based fight logic. All state is plain JSON, so it can be saved and cloned. */
import { MONSTERS, SKILLS, TUNE, skillPower, type Move, type Tag } from './data';

export interface St {
  poison: number;
  weak: number;
  vuln: number;
  str: number;
  thorns: number;
  stun: number;
  daze: number;
}

export const st0 = (): St => ({ poison: 0, weak: 0, vuln: 0, str: 0, thorns: 0, stun: 0, daze: 0 });

/** A forgotten skill that came back as an enemy. */
export interface EchoTag {
  eid: number;
  skill: string;
  lvl: number;
  forgotOn: number;
}

export interface Foe {
  uid: number;
  id: string;
  name: string;
  icon: string;
  hp: number;
  maxHp: number;
  block: number;
  st: St;
  moves: Move[];
  mi: number;
  echo?: EchoTag;
  elite?: boolean;
  boss?: boolean;
  fled?: boolean;
}

export interface Hero {
  hp: number;
  maxHp: number;
  block: number;
  st: St;
  energy: number;
}

export interface Card {
  id: string;
  lvl: number;
  used: boolean;
  spent: boolean;
}

export type FightKind = 'fight' | 'elite' | 'boss' | 'final';

export interface Fight {
  kind: FightKind;
  act: number;
  turn: number;
  hero: Hero;
  foes: Foe[];
  cards: Card[];
  relics: string[];
  /** Index of the card that is sealed this turn, or -1. */
  sealed: number;
  /** Echoes the final boss can still call. */
  reserve: EchoTag[];
  result: null | 'win' | 'lose';
  nextUid: number;
  target: number;
  escaped: EchoTag[];
  beaten: EchoTag[];
  kills: number;
}

export type Ev =
  | { t: 'dmg'; who: number; n: number; blocked: number }
  | { t: 'block'; who: number; n: number }
  | { t: 'heal'; who: number; n: number }
  | { t: 'st'; who: number; text: string }
  | { t: 'die'; who: number }
  | { t: 'summon'; who: number }
  | { t: 'flee'; who: number }
  | { t: 'msg'; text: string };

export const HERO = -1;

const has = (f: Fight, id: string): boolean => f.relics.includes(id);
export const alive = (f: Fight): Foe[] => f.foes.filter((x) => x.hp > 0 && !x.fled);
export const intent = (foe: Foe): Move => foe.moves[foe.mi % foe.moves.length];

// ---------- Building foes ----------

export function monster(id: string, act: number, uid: number): Foe {
  const d = MONSTERS[id];
  const a = act - 1;
  const boss = d.boss || d.elite;
  const hp = Math.round(d.hp * (boss ? 1 : TUNE.actHp[a]));
  const dm = boss ? 1 : TUNE.actDmg[a];
  const scale = (n?: number): number | undefined => (n ? Math.max(1, Math.round(n * dm)) : n);
  return {
    uid,
    id,
    name: d.name,
    icon: d.icon,
    hp,
    maxHp: hp,
    block: 0,
    st: st0(),
    moves: d.moves.map((m) => ({ ...m, a: scale(m.a), block: scale(m.block) })),
    mi: 0,
    elite: d.elite,
    boss: d.boss,
  };
}

/** HP and moves of the echo that a skill at this level becomes. */
export function echoStats(skill: string, lvl: number, act: number, relics: string[]): { hp: number; moves: Move[] } {
  const d = SKILLS[skill];
  const p = skillPower(skill, lvl);
  const k = TUNE.echoAct[Math.max(0, Math.min(2, act - 1))];
  let hp = Math.round((TUNE.echoHpBase + TUNE.echoHpPer * p) * k);
  if (relics.includes('ink')) hp = Math.ceil(hp / 2);
  const fx = d.lv[lvl - 1];
  const r = (n?: number): number | undefined => (n ? Math.max(1, Math.round(n * TUNE.echoFx * k)) : undefined);
  const m: Move = { name: d.name };
  if (fx.dmg) m.a = r(fx.dmg);
  if (fx.hits) m.hits = fx.hits;
  if (fx.block) m.block = r(fx.block);
  if (fx.heal) m.heal = r(fx.heal);
  if (fx.poison) m.poison = r(fx.poison);
  if (fx.weak) m.weak = fx.weak;
  if (fx.vuln) m.vuln = fx.vuln;
  if (fx.str) m.str = fx.str;
  if (fx.thorns) m.thorns = r(fx.thorns);
  if (fx.leech) m.leech = true;
  if (fx.stun) m.daze = 1;
  const claw: Move = { name: 'Claw', a: Math.max(2, Math.round((2 + p * 0.8) * k)) };
  return { hp, moves: [m, claw] };
}

export function echoFoe(tag: EchoTag, act: number, relics: string[], uid: number): Foe {
  const d = SKILLS[tag.skill];
  const { hp, moves } = echoStats(tag.skill, tag.lvl, act, relics);
  return { uid, id: 'echo', name: `Echo of ${d.name}`, icon: d.icon, hp, maxHp: hp, block: 0, st: st0(), moves, mi: 0, echo: tag };
}

export interface FightSetup {
  kind: FightKind;
  act: number;
  hp: number;
  maxHp: number;
  memory: { id: string; lvl: number }[];
  relics: string[];
  monsters: string[];
  echoes: EchoTag[];
  reserve?: EchoTag[];
}

export function newFight(s: FightSetup): Fight {
  const f: Fight = {
    kind: s.kind,
    act: s.act,
    turn: 1,
    hero: { hp: s.hp, maxHp: s.maxHp, block: 0, st: st0(), energy: TUNE.energy },
    foes: [],
    cards: s.memory.map((c) => ({ id: c.id, lvl: c.lvl, used: false, spent: false })),
    relics: [...s.relics],
    sealed: -1,
    reserve: [...(s.reserve ?? [])],
    result: null,
    nextUid: 1,
    target: 0,
    escaped: [],
    beaten: [],
    kills: 0,
  };
  for (const id of s.monsters) f.foes.push(monster(id, s.act, f.nextUid++));
  for (const e of s.echoes) f.foes.push(echoFoe(e, s.act, f.relics, f.nextUid++));
  if (has(f, 'shell')) f.hero.block = 8;
  if (has(f, 'spark')) f.hero.energy += 1;
  f.target = defaultTarget(f);
  return f;
}

export function defaultTarget(f: Fight): number {
  const a = alive(f);
  if (!a.length) return 0;
  const cur = a.find((x) => x.uid === f.target);
  return cur ? cur.uid : a[0].uid;
}

// ---------- Damage ----------

function hurt(f: Fight, who: number, n: number, ev: Ev[]): number {
  const t = who === HERO ? f.hero : f.foes.find((x) => x.uid === who)!;
  const blocked = Math.min(t.block, n);
  t.block -= blocked;
  const real = Math.min(t.hp, n - blocked);
  t.hp -= real;
  ev.push({ t: 'dmg', who, n: n - blocked, blocked });
  if (who !== HERO && t.hp <= 0) killFoe(f, t as Foe, ev);
  return real;
}

/** Damage that goes past block (poison, thorns). */
function pierce(f: Fight, who: number, n: number, ev: Ev[]): void {
  const t = who === HERO ? f.hero : f.foes.find((x) => x.uid === who)!;
  if (t.hp <= 0 || n <= 0) return;
  t.hp = Math.max(0, t.hp - n);
  ev.push({ t: 'dmg', who, n, blocked: 0 });
  if (who !== HERO && t.hp <= 0) killFoe(f, t as Foe, ev);
}

function killFoe(f: Fight, foe: Foe, ev: Ev[]): void {
  ev.push({ t: 'die', who: foe.uid });
  f.kills++;
  if (foe.echo) {
    f.beaten.push(foe.echo);
    if (has(f, 'candle')) heroHeal(f, 6, ev);
  }
  if (foe.boss && f.kind === 'final' && f.reserve.length) {
    ev.push({ t: 'msg', text: `The Hollow Mind breaks. ${f.reserve.length} waiting echo${f.reserve.length > 1 ? 'es fade' : ' fades'}.` });
    f.reserve = [];
  }
}

function heroHeal(f: Fight, n: number, ev: Ev[]): void {
  const h = f.hero;
  const real = Math.min(n, h.maxHp - h.hp);
  if (real > 0) {
    h.hp += real;
    ev.push({ t: 'heal', who: HERO, n: real });
  }
}

export function heroDamage(f: Fight, base: number, tag: Tag, foe: Foe, execute = false): number {
  let d = base + f.hero.st.str + (tag === 'attack' && has(f, 'whet') ? 2 : 0);
  if (f.hero.st.weak > 0) d *= 0.75;
  if (foe.st.vuln > 0) d *= 1.5;
  if (foe.echo && has(f, 'ward')) d *= 1.5;
  if (execute && foe.hp * 2 < foe.maxHp) d *= 2;
  return Math.max(0, Math.floor(d));
}

export function foeDamage(f: Fight, foe: Foe, base: number): number {
  let d = base + foe.st.str;
  if (foe.st.weak > 0) d *= 0.75;
  if (f.hero.st.vuln > 0) d *= 1.5;
  return Math.max(0, Math.floor(d));
}

// ---------- Hero actions ----------

export function cardCost(f: Fight, i: number): number {
  return SKILLS[f.cards[i].id].cost;
}

export function canUse(f: Fight, i: number): boolean {
  const c = f.cards[i];
  if (!c || f.result || c.used || c.spent || f.sealed === i) return false;
  return cardCost(f, i) <= f.hero.energy;
}

/** Use card i. Single-target effects hit the foe with uid `target` (or the first living foe). */
export function useCard(f: Fight, i: number, target = f.target): Ev[] {
  const ev: Ev[] = [];
  if (!canUse(f, i)) return ev;
  const c = f.cards[i];
  const d = SKILLS[c.id];
  const fx = d.lv[c.lvl - 1];
  const h = f.hero;
  h.energy -= d.cost;
  c.used = true;
  if (d.once) c.spent = true;
  let foe: Foe | undefined = alive(f).find((x) => x.uid === target) ?? alive(f)[0];
  if (fx.str) {
    h.st.str += fx.str;
    ev.push({ t: 'st', who: HERO, text: `+${fx.str} 💪` });
  }
  if (foe && fx.vuln) {
    foe.st.vuln += fx.vuln;
    ev.push({ t: 'st', who: foe.uid, text: `🎯 ${fx.vuln}` });
  }
  if (foe && fx.weak) {
    foe.st.weak += fx.weak;
    ev.push({ t: 'st', who: foe.uid, text: `🌀 ${fx.weak}` });
  }
  if (fx.block) {
    const n = fx.block + (d.tag === 'guard' && has(f, 'knot') ? 2 : 0);
    h.block += n;
    ev.push({ t: 'block', who: HERO, n });
  }
  if (fx.thorns) {
    h.st.thorns += fx.thorns;
    ev.push({ t: 'st', who: HERO, text: `🌵 ${fx.thorns}` });
  }
  if (fx.heal) heroHeal(f, fx.heal, ev);
  if (fx.dmg) {
    const targets = fx.aoe ? alive(f) : foe ? [foe] : [];
    for (const t of targets) {
      for (let k = 0; k < (fx.hits ?? 1); k++) {
        if (t.hp <= 0) break;
        const real = hurt(f, t.uid, heroDamage(f, fx.dmg, d.tag, t, fx.execute), ev);
        if (fx.leech && real > 0) heroHeal(f, real, ev);
        if (t.st.thorns > 0 && t.hp > 0) pierce(f, HERO, t.st.thorns, ev);
      }
    }
    if (d.tag === 'attack' && has(f, 'fang')) heroHeal(f, 1, ev);
  }
  foe = foe && foe.hp > 0 ? foe : undefined;
  if (foe && fx.poison) {
    foe.st.poison += fx.poison;
    ev.push({ t: 'st', who: foe.uid, text: `☠️ ${fx.poison}` });
  }
  if (foe && fx.stun) {
    foe.st.stun = 1;
    ev.push({ t: 'st', who: foe.uid, text: '💫' });
  }
  checkEnd(f, ev);
  f.target = defaultTarget(f);
  return ev;
}

// ---------- Enemy turn ----------

/** End of the hero turn and start of the enemy turn: tick foe poison, reset foe block. */
export function startEnemyTurn(f: Fight): Ev[] {
  const ev: Ev[] = [];
  const h = f.hero;
  if (h.st.weak > 0) h.st.weak--;
  if (h.st.vuln > 0) h.st.vuln--;
  f.sealed = -1;
  for (const foe of alive(f)) {
    foe.block = 0;
    foe.st.thorns = 0;
    if (foe.st.poison > 0) {
      pierce(f, foe.uid, foe.st.poison, ev);
      foe.st.poison--;
    }
  }
  checkEnd(f, ev);
  return ev;
}

/** The foes that act this enemy turn, in order. */
export const actors = (f: Fight): number[] => alive(f).map((x) => x.uid);

export function foeAct(f: Fight, uid: number): Ev[] {
  const ev: Ev[] = [];
  const foe = f.foes.find((x) => x.uid === uid);
  if (!foe || foe.hp <= 0 || foe.fled || f.result) return ev;
  if (foe.st.stun > 0) {
    foe.st.stun = 0;
    ev.push({ t: 'st', who: uid, text: '💫 stunned' });
    return ev;
  }
  const m = intent(foe);
  const h = f.hero;
  if (m.block) {
    foe.block += m.block;
    ev.push({ t: 'block', who: uid, n: m.block });
  }
  if (m.thorns) foe.st.thorns = m.thorns;
  if (m.str) {
    foe.st.str += m.str;
    ev.push({ t: 'st', who: uid, text: `+${m.str} 💪` });
  }
  if (m.heal) {
    const real = Math.min(m.heal, foe.maxHp - foe.hp);
    foe.hp += real;
    if (real) ev.push({ t: 'heal', who: uid, n: real });
  }
  if (m.a) {
    for (let k = 0; k < (m.hits ?? 1); k++) {
      if (h.hp <= 0 || foe.hp <= 0) break;
      const real = hurt(f, HERO, foeDamage(f, foe, m.a), ev);
      if (m.leech && real > 0) {
        const n = Math.min(real, foe.maxHp - foe.hp);
        foe.hp += n;
        if (n) ev.push({ t: 'heal', who: uid, n });
      }
      if (h.st.thorns > 0) pierce(f, uid, h.st.thorns, ev);
    }
  }
  if (m.poison) {
    h.st.poison += m.poison;
    ev.push({ t: 'st', who: HERO, text: `☠️ ${m.poison}` });
  }
  if (m.weak) {
    h.st.weak += m.weak;
    ev.push({ t: 'st', who: HERO, text: `🌀 ${m.weak}` });
  }
  if (m.vuln) {
    h.st.vuln += m.vuln;
    ev.push({ t: 'st', who: HERO, text: `🎯 ${m.vuln}` });
  }
  if (m.daze) {
    h.st.daze += m.daze;
    ev.push({ t: 'st', who: HERO, text: `💫 −${m.daze} energy` });
  }
  if (m.seal) {
    // Seal the strongest card for the next hero turn.
    let best = -1;
    let bp = -1;
    f.cards.forEach((c, i) => {
      const p = c.spent ? -1 : skillPower(c.id, c.lvl);
      if (p > bp) {
        bp = p;
        best = i;
      }
    });
    f.sealed = best;
    if (best >= 0) ev.push({ t: 'msg', text: `🔒 ${SKILLS[f.cards[best].id].name} is sealed next turn.` });
  }
  if (m.summon && alive(f).filter((x) => !x.echo).length < 4) {
    const s = monster(m.summon, f.act, f.nextUid++);
    f.foes.push(s);
    ev.push({ t: 'summon', who: s.uid });
  }
  if (m.call) callEchoes(f, m.call, ev);
  foe.mi++;
  checkEnd(f, ev);
  return ev;
}

/** The final boss brings back echoes from the reserve. */
export function callEchoes(f: Fight, n: number, ev: Ev[]): void {
  for (let k = 0; k < n; k++) {
    if (!f.reserve.length) break;
    if (alive(f).filter((x) => x.echo).length >= TUNE.finalEchoesOnField) break;
    const tag = f.reserve.shift()!;
    const e = echoFoe(tag, f.act, f.relics, f.nextUid++);
    f.foes.push(e);
    ev.push({ t: 'summon', who: e.uid });
    ev.push({ t: 'msg', text: `${e.icon} ${e.name} returns (forgotten on floor ${tag.forgotOn}).` });
  }
}

/** End of the enemy turn and start of the next hero turn. */
export function finishEnemyTurn(f: Fight): Ev[] {
  const ev: Ev[] = [];
  for (const foe of alive(f)) {
    if (foe.st.weak > 0) foe.st.weak--;
    if (foe.st.vuln > 0) foe.st.vuln--;
  }
  if (f.result) return ev;
  const h = f.hero;
  f.turn++;
  h.block = 0;
  h.st.thorns = 0;
  if (h.st.poison > 0) {
    pierce(f, HERO, h.st.poison, ev);
    h.st.poison--;
  }
  h.energy = Math.max(0, TUNE.energy - h.st.daze);
  h.st.daze = 0;
  for (const c of f.cards) c.used = false;
  checkEnd(f, ev);
  f.target = defaultTarget(f);
  return ev;
}

/** Whole enemy turn at once (for the bot and the sim). */
export function endTurn(f: Fight): Ev[] {
  const ev = startEnemyTurn(f);
  for (const uid of actors(f)) ev.push(...foeAct(f, uid));
  ev.push(...finishEnemyTurn(f));
  return ev;
}

export function checkEnd(f: Fight, ev: Ev[]): void {
  if (f.result) return;
  if (f.hero.hp <= 0) {
    f.result = 'lose';
    return;
  }
  const a = alive(f);
  if (f.kind === 'final') {
    if (!a.length && !f.reserve.length) f.result = 'win';
    return;
  }
  if (!a.some((x) => !x.echo)) {
    for (const e of a) {
      e.fled = true;
      f.escaped.push(e.echo!);
      ev.push({ t: 'flee', who: e.uid });
    }
    f.result = 'win';
  }
}

/** Short text of a move for the intent badge. */
export function moveIcons(f: Fight | null, foe: Foe | null, m: Move): string {
  const parts: string[] = [];
  if (m.a) {
    const n = f && foe ? foeDamage(f, foe, m.a) : m.a;
    parts.push(`⚔️${n}${m.hits ? `×${m.hits}` : ''}`);
  }
  if (m.block) parts.push(`🛡️${m.block}`);
  if (m.heal) parts.push(`💚${m.heal}`);
  if (m.leech) parts.push('🩸');
  if (m.thorns) parts.push(`🌵${m.thorns}`);
  if (m.str) parts.push(`💪+${m.str}`);
  if (m.poison) parts.push(`☠️${m.poison}`);
  if (m.weak) parts.push(`🌀${m.weak}`);
  if (m.vuln) parts.push(`🎯${m.vuln}`);
  if (m.daze) parts.push('💫');
  if (m.seal) parts.push('🔒');
  if (m.summon) parts.push('📯');
  if (m.call) parts.push('👻📣');
  return parts.join(' ') || '…';
}

export function moveText(m: Move): string {
  const out: string[] = [];
  if (m.a) out.push(`attacks for ${m.a}${m.hits ? ` ×${m.hits}` : ''}`);
  if (m.leech) out.push('heals the damage dealt');
  if (m.block) out.push(`gains ${m.block} block`);
  if (m.heal) out.push(`heals ${m.heal}`);
  if (m.thorns) out.push(`thorns ${m.thorns}`);
  if (m.str) out.push(`+${m.str} strength`);
  if (m.poison) out.push(`poison ${m.poison}`);
  if (m.weak) out.push(`weak ${m.weak}`);
  if (m.vuln) out.push(`exposed ${m.vuln}`);
  if (m.daze) out.push('you lose 1 energy');
  if (m.seal) out.push('seals your strongest skill');
  if (m.summon) out.push('calls a helper');
  if (m.call) out.push(`calls back ${m.call} echoes`);
  return out.join(', ');
}

export const cloneFight = (f: Fight): Fight => JSON.parse(JSON.stringify(f)) as Fight;
