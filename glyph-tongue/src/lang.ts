/** The rune language: meanings, grammar, world generation and the spell parser. Pure functions only. */
import { Rng } from './rng';

export const RUNE_COUNT = 8;
export const RUNE_NAMES = ['Ash', 'Bel', 'Cor', 'Dun', 'Eth', 'Fyr', 'Gal', 'Tir'];
/** SVG path data (24×24 viewBox, stroked) for each rune. */
export const RUNE_PATHS = [
  'M8 3v18M8 4l9 4M8 10l9 4',
  'M7 21V3l10 6-10 6 10 6',
  'M17 4L7 12l10 8',
  'M6 3v18M18 3v18M6 7l12 10',
  'M12 3v18M5 8l7 5 7-5',
  'M5 4l14 16M19 4L5 20',
  'M12 3l7 9-7 9-7-9z',
  'M12 3v18M12 3l6 6M12 3L6 9',
];

export type Kind = 'harm' | 'mend' | 'ward' | 'venom' | 'drain' | 'hex';
export type Tgt = 'self' | 'foe' | 'all' | 'weak';
export type Mod = 'amp' | 'swell' | 'half' | 'spread' | 'twin';
export type Meaning = Kind | Tgt | Mod;
export type Role = 'el' | 'tgt' | 'mod';
export type Side = 'before' | 'after';
export type Def = 'self' | 'foe';

export const KINDS: Kind[] = ['harm', 'mend', 'ward', 'venom', 'drain', 'hex'];
export const TGTS: Tgt[] = ['self', 'foe', 'all', 'weak'];
export const MODS: Mod[] = ['amp', 'swell', 'half', 'spread', 'twin'];
export const MEANINGS: Meaning[] = [...KINDS, ...TGTS, ...MODS];
export const ROLE_COUNT: Record<Role, number> = { el: 3, tgt: 2, mod: 3 };

export const BASE: Record<Kind, number> = { harm: 6, mend: 5, ward: 6, venom: 4, drain: 4, hex: 5 };

export function roleOf(m: Meaning): Role {
  if ((KINDS as string[]).includes(m)) return 'el';
  if ((TGTS as string[]).includes(m)) return 'tgt';
  return 'mod';
}

export const MEANING_INFO: Record<Meaning, { name: string; text: string; icon: string }> = {
  harm: { name: 'Harm', icon: '🔥', text: `Element. Deals ${BASE.harm} damage.` },
  mend: { name: 'Mend', icon: '💚', text: `Element. Heals ${BASE.mend} HP.` },
  ward: { name: 'Ward', icon: '🛡️', text: `Element. Gives ${BASE.ward} shield until the next turn.` },
  venom: { name: 'Venom', icon: '☠️', text: `Element. Adds ${BASE.venom} poison. Poison deals its value each turn, then drops by 1.` },
  drain: { name: 'Drain', icon: '🩸', text: `Element. Deals ${BASE.drain} damage and heals the caster by the same amount.` },
  hex: { name: 'Hex', icon: '🌀', text: `Element. Dulls the next hit of the target by ${BASE.hex}.` },
  self: { name: 'Self', icon: '🙋', text: 'Target. The element hits you.' },
  foe: { name: 'Foe', icon: '🎯', text: 'Target. The element hits the selected foe.' },
  all: { name: 'All', icon: '👥', text: 'Target. The element hits every foe.' },
  weak: { name: 'Weakest', icon: '🩹', text: 'Target. The element hits the foe with the lowest HP.' },
  amp: { name: 'Amp', icon: '✖️', text: 'Modifier. ×2 power (each extra Amp adds +1×).' },
  swell: { name: 'Swell', icon: '➕', text: 'Modifier. +3 power.' },
  half: { name: 'Half', icon: '➗', text: 'Modifier. ×0.5 power.' },
  spread: { name: 'Spread', icon: '💫', text: 'Modifier. The element hits every foe at ×0.6 power.' },
  twin: { name: 'Twin', icon: '🪞', text: 'Modifier. The element also hits the other side (you, or the selected foe).' },
};

export type Special =
  | { t: 'cancel'; a: number; b: number }
  | { t: 'reson'; a: number; b: number }
  | { t: 'stutter' }
  | { t: 'head' }
  | { t: 'taboo'; a: number };

export const SPECIAL_INFO: Record<Special['t'], { name: string; text: string }> = {
  cancel: { name: 'Cancel pair', text: 'Two runes cancel. When both are in a spell, every copy of both goes silent.' },
  reson: { name: 'Resonance', text: 'Two runes resonate. When they stand next to each other, every effect of the spell gets +4.' },
  stutter: { name: 'Stutter', text: 'A rune written twice in a row goes silent (all copies in that row).' },
  head: { name: 'Head word', text: 'Only the first element of a spell works. Later elements go silent.' },
  taboo: { name: 'Taboo', text: 'One rune is taboo. Any spell that holds it burns you for 3.' },
};

export interface World {
  mean: Meaning[];
  tgtSide: Side;
  modSide: Side;
  def: Def;
  specials: Special[];
}

/** Fight context at cast time: selected foe, weakest foe, living foes (indexes into the foe list). */
export interface Ctx {
  sel: number;
  weak: number;
  alive: number[];
}

/** Target -1 means the hero. */
export interface Outcome {
  pos: number;
  rune: number;
  kind: Kind;
  tg: number[];
  amt: number;
}

export interface Parsed {
  silent: boolean[];
  /** Hidden: the element position each rune bound to (-1 = none). Only shown with the Lens charm. */
  bind: number[];
  outs: Outcome[];
  reson: boolean;
  backlash: number;
}

export const TABOO_DMG = 3;
export const RESON_BONUS = 4;

export function genWorld(rng: Rng): World {
  for (;;) {
    const runes = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
    const mean: Meaning[] = new Array(RUNE_COUNT);
    const kinds = rng.shuffle([...KINDS]).slice(0, 3);
    const tgts = rng.shuffle([...TGTS]).slice(0, 2);
    const mods = rng.shuffle([...MODS]).slice(0, 3);
    if (!kinds.includes('harm') && !kinds.includes('drain')) continue;
    [...kinds, ...tgts, ...mods].forEach((m, i) => (mean[runes[i]] = m));
    const def: Def = rng.chance(0.5) ? 'self' : 'foe';
    if (def === 'foe' && !tgts.includes('self')) continue;
    const types = rng.shuffle(['cancel', 'reson', 'stutter', 'head', 'taboo'] as Special['t'][]).slice(0, 2);
    const pair = (): [number, number] => {
      const p = rng.shuffle([0, 1, 2, 3, 4, 5, 6, 7]);
      return [Math.min(p[0], p[1]), Math.max(p[0], p[1])];
    };
    const specials: Special[] = [];
    let used = '';
    for (const t of types) {
      if (t === 'cancel' || t === 'reson') {
        let [a, b] = pair();
        while (`${a},${b}` === used) [a, b] = pair();
        used = `${a},${b}`;
        specials.push({ t, a, b });
      } else if (t === 'taboo') specials.push({ t, a: rng.int(0, 7) });
      else specials.push({ t });
    }
    return { mean, tgtSide: rng.chance(0.5) ? 'before' : 'after', modSide: rng.chance(0.5) ? 'before' : 'after', def, specials };
  }
}

export function specialKey(s: Special): string {
  switch (s.t) {
    case 'cancel':
    case 'reson':
      return `${s.t}:${Math.min(s.a, s.b)}:${Math.max(s.a, s.b)}`;
    case 'taboo':
      return `taboo:${s.a}`;
    default:
      return s.t;
  }
}

/** Turn a rune string into effects with the grammar of the world. */
export function parse(w: World, spell: number[], ctx: Ctx, opt: { reson?: boolean } = {}): Parsed {
  const n = spell.length;
  const removed = new Array<boolean>(n).fill(false);
  const sp = (t: Special['t']) => w.specials.filter((s) => s.t === t);
  if (sp('stutter').length) {
    for (let i = 0; i < n; i++) if ((i > 0 && spell[i] === spell[i - 1]) || (i < n - 1 && spell[i] === spell[i + 1])) removed[i] = true;
  }
  for (const s of sp('cancel')) {
    if (s.t !== 'cancel') continue;
    const hasA = spell.some((r, i) => r === s.a && !removed[i]);
    const hasB = spell.some((r, i) => r === s.b && !removed[i]);
    if (hasA && hasB) spell.forEach((r, i) => (r === s.a || r === s.b) && (removed[i] = true));
  }
  const isEl = (i: number) => roleOf(w.mean[spell[i]]) === 'el';
  if (sp('head').length) {
    let first = true;
    for (let i = 0; i < n; i++) {
      if (removed[i] || !isEl(i)) continue;
      if (first) first = false;
      else removed[i] = true;
    }
  }
  const bind = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    if (removed[i] || isEl(i)) continue;
    const side = roleOf(w.mean[spell[i]]) === 'tgt' ? w.tgtSide : w.modSide;
    if (side === 'before') {
      for (let j = i + 1; j < n; j++) if (!removed[j] && isEl(j)) {
        bind[i] = j;
        break;
      }
    } else {
      for (let j = i - 1; j >= 0; j--) if (!removed[j] && isEl(j)) {
        bind[i] = j;
        break;
      }
    }
  }
  // Only the target closest to its element counts.
  for (let e = 0; e < n; e++) {
    const ts = [...Array(n).keys()].filter((i) => bind[i] === e && roleOf(w.mean[spell[i]]) === 'tgt');
    if (ts.length > 1) {
      ts.sort((a, b) => Math.abs(a - e) - Math.abs(b - e) || a - b);
      ts.slice(1).forEach((i) => (bind[i] = -1));
    }
  }
  const silent = spell.map((_, i) => removed[i] || (!isEl(i) && bind[i] < 0));
  let reson = false;
  if (opt.reson !== undefined) reson = opt.reson;
  else
    for (const s of sp('reson')) {
      if (s.t !== 'reson') continue;
      for (let i = 0; i + 1 < n; i++) {
        const a = spell[i];
        const b = spell[i + 1];
        if (!removed[i] && !removed[i + 1] && ((a === s.a && b === s.b) || (a === s.b && b === s.a))) reson = true;
      }
    }
  let backlash = 0;
  for (const s of sp('taboo')) if (s.t === 'taboo' && spell.includes(s.a)) backlash += TABOO_DMG;

  const outs: Outcome[] = [];
  for (let p = 0; p < n; p++) {
    if (silent[p] || !isEl(p)) continue;
    const kind = w.mean[spell[p]] as Kind;
    const words = [...Array(n).keys()].filter((i) => bind[i] === p).map((i) => w.mean[spell[i]]);
    const t = (words.find((m) => roleOf(m) === 'tgt') as Tgt | undefined) ?? w.def;
    let tg: number[] = t === 'self' ? [-1] : t === 'foe' ? [ctx.sel] : t === 'all' ? [...ctx.alive] : [ctx.weak];
    const cnt = (m: Mod) => words.filter((x) => x === m).length;
    const spread = cnt('spread') > 0;
    if (spread) tg = [...ctx.alive];
    if (cnt('twin') > 0) {
      if (tg.includes(-1)) {
        if (!tg.includes(ctx.sel)) tg.push(ctx.sel);
      } else tg.push(-1);
    }
    let amt = BASE[kind] + 3 * cnt('swell') + (reson ? RESON_BONUS : 0);
    amt *= 1 + cnt('amp');
    for (let k = 0; k < cnt('half'); k++) amt *= 0.5;
    if (spread) amt *= 0.6;
    amt = Math.max(1, Math.round(amt));
    outs.push({ pos: p, rune: spell[p], kind, tg, amt });
  }
  return { silent, bind, outs, reson, backlash };
}

/** A canonical string of what the player can see from a cast. The bot compares these. */
export function signature(p: Parsed): string {
  return `${p.silent.map((s) => (s ? 1 : 0)).join('')}|${p.outs.map((o) => `${o.pos}${o.kind[0]}${o.tg.join(',')}=${o.amt}`).join(';')}`;
}

// ---------- Facts (hint scrolls and the Linguist perk) ----------

export type Fact = { t: 'rune'; r: number } | { t: 'tgtSide' } | { t: 'modSide' } | { t: 'def' } | { t: 'special'; i: number };

export function factKey(f: Fact): string {
  return f.t === 'rune' ? `rune:${f.r}` : f.t === 'special' ? `special:${f.i}` : f.t;
}

export function parseFactKey(k: string): Fact {
  const [t, v] = k.split(':');
  if (t === 'rune') return { t: 'rune', r: Number(v) };
  if (t === 'special') return { t: 'special', i: Number(v) };
  return { t } as Fact;
}

export function allFacts(w: World): Fact[] {
  return [
    ...w.mean.map((_, r) => ({ t: 'rune', r }) as Fact),
    { t: 'tgtSide' },
    { t: 'modSide' },
    { t: 'def' },
    ...w.specials.map((_, i) => ({ t: 'special', i }) as Fact),
  ];
}

/** Text with rune tokens like {r3}. The UI turns the tokens into glyphs. */
export function factText(w: World, f: Fact): string {
  switch (f.t) {
    case 'rune': {
      const m = w.mean[f.r];
      return `{r${f.r}} means ${MEANING_INFO[m].name}. ${MEANING_INFO[m].text}`;
    }
    case 'tgtSide':
      return `Target runes go ${w.tgtSide.toUpperCase()} the element they change.`;
    case 'modSide':
      return `Modifier runes go ${w.modSide.toUpperCase()} the element they change.`;
    case 'def':
      return `An element with no target rune hits ${w.def === 'self' ? 'YOU' : 'the selected foe'}.`;
    case 'special': {
      const s = w.specials[f.i];
      switch (s.t) {
        case 'cancel':
          return `{r${s.a}} and {r${s.b}} cancel: in one spell, both go silent.`;
        case 'reson':
          return `{r${s.a}} next to {r${s.b}} resonates: +${RESON_BONUS} to every effect.`;
        case 'stutter':
          return 'Stutter: a rune written twice in a row goes silent.';
        case 'head':
          return 'Head word: only the first element of a spell works.';
        case 'taboo':
          return `{r${s.a}} is taboo: any spell with it burns you for ${TABOO_DMG}.`;
      }
    }
  }
}
