/** Rumor claims and the deterministic mutation rules. Pure functions. */
import { OBJ_RING, WORDS, type Trait } from './data';

/** A rumor about the town's target. The subject is fixed per town. */
export interface Claim {
  verb: string;
  obj: string | null;
  /** Tone word: surely / whisper. Not part of the claim identity. */
  mod: string | null;
  not: boolean;
}

/** Identity of a claim. Two sources must give the same key to make a believer. */
export const keyOf = (c: Claim): string => `${c.not ? '!' : ''}${c.verb}|${c.obj ?? '-'}`;

export const isBig = (c: Claim): boolean => c.mod === 'surely';
export const crossesWeak = (c: Claim): boolean => isBig(c) || c.verb === 'burned';
export const isQuiet = (c: Claim): boolean => c.mod === 'whisper';
export const traceSpeed = (c: Claim): number => (c.verb === 'burned' ? 2 : c.verb === 'forged' ? 0.5 : 1);

export const sameClaim = (a: Claim, b: Claim): boolean => a.verb === b.verb && a.obj === b.obj && a.mod === b.mod && a.not === b.not;

/** What a person of this trait passes on (and holds) after hearing `c`. `null`: the rumor dies. */
export function mutate(trait: Trait | 'rival', c: Claim): Claim | null {
  switch (trait) {
    case 'gossip':
      return c.mod === 'surely' ? c : { ...c, mod: 'surely' };
    case 'skeptic':
      if (c.mod) return { ...c, mod: null };
      if (c.obj === 'letters') return c;
      if (c.obj) return { ...c, obj: null };
      return null;
    case 'loyalist':
      return c.verb === 'bribed' ? c : { ...c, not: !c.not };
    case 'muddler': {
      const i = c.obj ? OBJ_RING.indexOf(c.obj) : -1;
      if (i < 0) return c;
      return { ...c, obj: OBJ_RING[(i + 1) % OBJ_RING.length] };
    }
    case 'plain':
      return c.mod === 'surely' ? { ...c, mod: null } : c;
    default:
      return c;
  }
}

/** One part of a rendered claim with its change mark. */
export interface Part {
  text: string;
  icon: string;
  mark: '' | 'new' | 'old';
}

function verbParts(c: Claim): { text: string; icon: string } {
  const w = WORDS[c.verb];
  return c.not ? { text: `did NOT ${w.base}`, icon: '🚫' + w.icon } : { text: w.text, icon: w.icon };
}

/**
 * Parts of `c` in reading order. With `prev`, changed words come as an
 * `old` part (struck out) followed by a `new` part (highlighted).
 */
export function claimParts(c: Claim, target: string, prev?: Claim | null): Part[] {
  const out: Part[] = [];
  const slot = (now: { text: string; icon: string } | null, was: { text: string; icon: string } | null): void => {
    if (prev && was && (!now || now.text !== was.text)) out.push({ ...was, mark: 'old' });
    if (now) out.push({ ...now, mark: prev && (!was || was.text !== now.text) ? 'new' : '' });
  };
  const word = (id: string | null) => (id ? { text: WORDS[id].text, icon: WORDS[id].icon } : null);
  slot(word(c.mod), prev ? word(prev.mod) : null);
  out.push({ text: target, icon: '', mark: '' });
  slot(verbParts(c), prev ? verbParts(prev) : null);
  slot(word(c.obj), prev ? word(prev.obj) : null);
  return out;
}

export const claimText = (c: Claim, target: string): string =>
  claimParts(c, target)
    .map((p) => p.text)
    .join(' ');

/** Short label of what changed, for floating text. */
export function changeLabel(prev: Claim, now: Claim): string {
  if (now.not !== prev.not) return now.not ? '🚫 NOT' : '✅ un-NOT';
  if (now.mod !== prev.mod) return now.mod ? `+${WORDS[now.mod].icon}` : `−${WORDS[prev.mod!].icon}`;
  if (now.obj !== prev.obj) return now.obj ? `${WORDS[prev.obj!].icon}→${WORDS[now.obj].icon}` : `−${WORDS[prev.obj!].icon}`;
  return '';
}
