/** Static game data: clauses, specials, fighters, enemies, perks, upgrades, unlocks. */

export type Side = 0 | 1;
export type Intent = 'atk' | 'grd' | 'spc';
export type SpcId = 'lunge' | 'mend' | 'bash' | 'venom' | 'smash' | 'fortify' | 'drain' | 'hex' | 'rage';
export type Style = 'aggro' | 'turtle' | 'sustain';

export type ClauseId =
  | 'bloodless'
  | 'longguard'
  | 'lowground'
  | 'foulair'
  | 'quickdraw'
  | 'hush'
  | 'cap'
  | 'sharp'
  | 'spikes'
  | 'haste'
  | 'bloodrush'
  | 'fuse'
  | 'first'
  | 'edge'
  | 'bulwark'
  | 'leech'
  | 'headstart'
  | 'opening'
  | 'tax'
  | 'gag'
  | 'riposte'
  | 'fury'
  | 'second'
  | 'focus';

export interface ClauseDef {
  id: ClauseId;
  icon: string;
  name: string;
  /** law: the same rule for both sides. own: only the side that takes it (the holder) gets it. */
  kind: 'law' | 'own';
  text: string;
  /** Short gain phrase from the holder's view, used in the foe's reasons. */
  gain: string;
}

const C = (id: ClauseId, icon: string, name: string, kind: 'law' | 'own', text: string, gain: string): ClauseDef => ({ id, icon, name, kind, text, gain });

export const CLAUSES: Record<ClauseId, ClauseDef> = {
  bloodless: C('bloodless', '🚫', 'Bloodless', 'law', 'No one can heal.', 'no healing'),
  longguard: C('longguard', '🧱', 'Long Guard', 'law', 'Block halves at round end instead of fading.', 'block that stays'),
  lowground: C('lowground', '🩸', 'Low Ground', 'law', 'The side with less HP acts first.', 'the hurt side first'),
  foulair: C('foulair', '☠️', 'Foul Air', 'law', 'Both sides lose 2 HP at each round start.', '2 HP lost each round'),
  quickdraw: C('quickdraw', '⚡', 'Quickdraw', 'law', 'The first hit each round deals double.', 'a double first hit'),
  hush: C('hush', '🤐', 'Hush', 'law', 'No one can use a Special in rounds 1–2.', 'no early Specials'),
  cap: C('cap', '⚖️', 'Cap', 'law', 'No hit deals more than 7.', 'small hits only'),
  sharp: C('sharp', '📌', 'Sharp Blades', 'law', 'Hits ignore 3 block.', 'hits through guard'),
  spikes: C('spikes', '🌵', 'Spikes', 'law', 'Hit a side that guards, take 4 back.', 'thorns on guard'),
  haste: C('haste', '⏩', 'Haste', 'law', 'Specials recharge 1 round faster.', 'more Specials'),
  bloodrush: C('bloodrush', '🔥', 'Bloodrush', 'law', 'Hits deal +3 to a side below half HP.', 'fast finishes'),
  fuse: C('fuse', '⏰', 'Short Fuse', 'law', 'Overtime starts in round 4, not 6.', 'an early overtime'),
  first: C('first', '🥇', 'First Move', 'own', 'Holder acts first each round. Low Ground beats it.', 'the first move'),
  edge: C('edge', '🗡️', 'Edge', 'own', 'Holder’s hits deal +3.', '+3 on each hit'),
  bulwark: C('bulwark', '🛡️', 'Bulwark', 'own', 'Holder’s Guard gives +5 block.', '+5 block'),
  leech: C('leech', '🧛', 'Leech', 'own', 'Holder heals 3 on each hit that deals damage.', 'heal on hit'),
  headstart: C('headstart', '🏁', 'Head Start', 'own', 'Holder starts with 10 block.', '10 free block'),
  opening: C('opening', '🎯', 'Opening Blow', 'own', 'Holder’s first hit in the fight deals +8.', 'a +8 first hit'),
  tax: C('tax', '📜', 'Guard Tax', 'own', 'The other side’s Guard gives 4 less block.', 'a weak foe guard'),
  gag: C('gag', '🙊', 'Gag', 'own', 'The other side can’t use a Special in rounds 1–3.', 'a gagged foe'),
  riposte: C('riposte', '🤺', 'Riposte', 'own', 'When the holder guards and is hit, it deals 5 back.', 'a 5 counter'),
  fury: C('fury', '💢', 'Fury', 'own', 'Holder’s hits deal +4 while it is below half HP.', '+4 when hurt'),
  second: C('second', '🩹', 'Second Wind', 'own', 'Holder heals 8 at the start of round 3.', 'a heal of 8'),
  focus: C('focus', '⏱️', 'Focus', 'own', 'Holder’s Special recharges 1 round faster.', 'a faster Special'),
};

export const CLAUSE_IDS = Object.keys(CLAUSES) as ClauseId[];

export interface SpcDef {
  name: string;
  icon: string;
  text: (pow: number) => string;
}

export const SPECIALS: Record<SpcId, SpcDef> = {
  lunge: { name: 'Lunge', icon: '🤺', text: (p) => `Hit for ATK+${p}. Ignores block.` },
  mend: { name: 'Mend', icon: '💚', text: (p) => `Heal ${p}.` },
  bash: { name: 'Shield Bash', icon: '🛡️', text: (p) => `Guard, then hit for ${p}.` },
  venom: { name: 'Venom', icon: '🧪', text: (p) => `Hit for ATK. Poison: lose ${p} HP at each round start, 3 rounds.` },
  smash: { name: 'Smash', icon: '💥', text: (p) => `Hit for ATK+${p}.` },
  fortify: { name: 'Fortify', icon: '🏰', text: (p) => `Guard with +${p} block.` },
  drain: { name: 'Drain', icon: '🩸', text: (p) => `Hit for ${p}. Heal the damage dealt.` },
  hex: { name: 'Hex', icon: '🌀', text: (p) => `Hit for ATK. The other side's hits deal ${p} less for 2 rounds.` },
  rage: { name: 'Rage', icon: '😤', text: (p) => `+${p} ATK for the rest of the fight. No hit.` },
};

export interface FighterDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  grd: number;
  spc: SpcId;
  pow: number;
  cd: number;
  text: string;
}

export const FIGHTERS: FighterDef[] = [
  { id: 'duelist', name: 'Duelist', icon: '🧑‍🎤', hp: 40, atk: 6, grd: 6, spc: 'lunge', pow: 3, cd: 3, text: 'Even stats. Lunge ignores block.' },
  { id: 'cleric', name: 'Cleric', icon: '🧝', hp: 38, atk: 6, grd: 6, spc: 'mend', pow: 10, cd: 3, text: 'Heals in a fight. Fears Bloodless.' },
  { id: 'warden', name: 'Warden', icon: '🧔', hp: 40, atk: 5, grd: 7, spc: 'bash', pow: 4, cd: 2, text: 'Big guard. Bash guards and hits.' },
  { id: 'venomist', name: 'Venomist', icon: '🧙', hp: 38, atk: 6, grd: 5, spc: 'venom', pow: 3, cd: 3, text: 'Poison ticks through block.' },
];

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  hp: number;
  atk: number;
  grd: number;
  spc: SpcId;
  pow: number;
  cd: number;
  style: Style;
  /** The clause this enemy brings to each offer. */
  sig: ClauseId;
  /** Boss only: a clause that is active from the start and can't be removed. */
  sealed?: ClauseId;
}

const E = (id: string, name: string, icon: string, hp: number, atk: number, grd: number, spc: SpcId, pow: number, cd: number, style: Style, sig: ClauseId, sealed?: ClauseId): EnemyDef => ({
  id,
  name,
  icon,
  hp,
  atk,
  grd,
  spc,
  pow,
  cd,
  style,
  sig,
  sealed,
});

export const ENEMIES: { normal: EnemyDef[]; elite: EnemyDef[]; boss: EnemyDef }[] = [
  {
    normal: [
      E('wolf', 'Dire Wolf', '🐺', 18, 4, 3, 'smash', 4, 3, 'aggro', 'quickdraw'),
      E('crab', 'Shellback', '🦀', 21, 4, 6, 'fortify', 4, 3, 'turtle', 'longguard'),
      E('ghoul', 'Ghoul', '🧟', 19, 4, 4, 'drain', 6, 3, 'sustain', 'leech'),
      E('adder', 'Adder', '🐍', 15, 4, 3, 'venom', 2, 3, 'aggro', 'foulair'),
      E('imp', 'Imp', '👺', 15, 5, 3, 'hex', 2, 3, 'aggro', 'first'),
    ],
    elite: [E('captain', 'Bandit Captain', '🏴‍☠️', 24, 5, 5, 'smash', 4, 3, 'aggro', 'edge')],
    boss: E('notary', 'The Notary', '⚖️', 34, 5, 6, 'fortify', 5, 3, 'turtle', 'spikes', 'tax'),
  },
  {
    normal: [
      E('vamp', 'Vampire', '🦇', 24, 5, 4, 'drain', 7, 3, 'sustain', 'leech'),
      E('golem', 'Golem', '🗿', 28, 5, 7, 'fortify', 5, 3, 'turtle', 'bulwark'),
      E('boar', 'Tusk Boar', '🐗', 24, 6, 4, 'smash', 4, 3, 'aggro', 'first'),
      E('witch', 'Hedge Witch', '🧹', 22, 5, 4, 'hex', 3, 2, 'aggro', 'hush'),
      E('scorp', 'Scorpion', '🦂', 20, 5, 5, 'venom', 3, 3, 'aggro', 'sharp'),
    ],
    elite: [E('knight', 'Iron Knight', '🤖', 32, 6, 7, 'bash', 6, 2, 'turtle', 'riposte')],
    boss: E('magistrate', 'The Magistrate', '🏛️', 36, 6, 6, 'smash', 4, 3, 'aggro', 'opening', 'first'),
  },
  {
    normal: [
      E('drake', 'Drake', '🐉', 32, 7, 5, 'smash', 5, 3, 'aggro', 'quickdraw'),
      E('lich', 'Lich', '💀', 30, 6, 5, 'drain', 8, 3, 'sustain', 'second'),
      E('spider', 'Spider Queen', '🕷️', 28, 6, 5, 'venom', 3, 3, 'aggro', 'foulair'),
      E('berserk', 'Berserker', '🪓', 32, 6, 3, 'rage', 2, 2, 'aggro', 'fury'),
      E('sentinel', 'Sentinel', '🗽', 38, 6, 9, 'fortify', 6, 3, 'turtle', 'longguard'),
    ],
    elite: [E('ogre', 'Ogre', '👹', 40, 7, 6, 'smash', 6, 3, 'aggro', 'bloodrush')],
    boss: E('chancellor', 'Arch-Chancellor', '👑', 56, 7, 7, 'hex', 3, 3, 'aggro', 'edge', 'gag'),
  },
];

export type PerkId = 'veto' | 'fourth' | 'mind' | 'extra';

export const PERKS: Record<PerkId, { icon: string; name: string; text: string; cost: number }> = {
  veto: { icon: '✂️', name: 'Veto', text: 'Once per draft, burn a clause without spending your pick.', cost: 60 },
  fourth: { icon: '➕', name: 'Fourth Clause', text: 'You get one extra pick at the end of each draft.', cost: 80 },
  mind: { icon: '🔮', name: 'Mind Reader', text: 'See the foe’s whole wish list, not only its top 2.', cost: 35 },
  extra: { icon: '📜', name: 'Extra Offer', text: 'Each offer gets one more card from your pool.', cost: 50 },
};

export type UpgradeId = 'vit' | 'str' | 'stance' | 'mastery' | 'drill';

export const UPGRADES: Record<UpgradeId, { icon: string; name: string; text: string }> = {
  vit: { icon: '❤️', name: 'Vitality', text: '+6 max HP and heal 6.' },
  str: { icon: '💪', name: 'Strength', text: '+1 ATK.' },
  stance: { icon: '🛡️', name: 'Stance', text: '+2 Guard.' },
  mastery: { icon: '✨', name: 'Mastery', text: 'Special power +2.' },
  drill: { icon: '⏱️', name: 'Drill', text: 'Special recharge −1 (at least 2).' },
};

export interface Unlock {
  id: string;
  icon: string;
  name: string;
  text: string;
  cost: number;
}

export const UNLOCKS: Unlock[] = [
  { id: 'f:cleric', icon: '🧝', name: 'Cleric', text: 'Fighter. Mend heals 10.', cost: 3 },
  { id: 'f:warden', icon: '🧔', name: 'Warden', text: 'Fighter. Guard 7, Shield Bash.', cost: 5 },
  { id: 'f:venomist', icon: '🧙', name: 'Venomist', text: 'Fighter. Venom poisons.', cost: 7 },
  { id: 'c:riposte', icon: '🤺', name: 'Riposte', text: 'Clause card for the pool.', cost: 2 },
  { id: 'c:fury', icon: '💢', name: 'Fury', text: 'Clause card for the pool.', cost: 2 },
  { id: 'c:second', icon: '🩹', name: 'Second Wind', text: 'Clause card for the pool.', cost: 3 },
  { id: 'c:focus', icon: '⏱️', name: 'Focus', text: 'Clause card for the pool.', cost: 3 },
];

export const LOCKED_CLAUSES: ClauseId[] = ['riposte', 'fury', 'second', 'focus'];

export function clausePool(unlocked: string[]): ClauseId[] {
  return CLAUSE_IDS.filter((id) => !LOCKED_CLAUSES.includes(id) || unlocked.includes(`c:${id}`));
}

export function fighterUnlocked(id: string, unlocked: string[]): boolean {
  return id === 'duelist' || unlocked.includes(`f:${id}`);
}

export const INTENT_NAME: Record<Intent, string> = { atk: 'Attack', grd: 'Guard', spc: 'Special' };
export const INTENT_ICON: Record<Intent, string> = { atk: '⚔️', grd: '🛡️', spc: '✨' };
