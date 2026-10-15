import type { StatusId } from './types';

export interface StatusDef {
  name: string;
  icon: string;
  debuff: boolean;
  /** Loses 1 stack at the end of the owner's turn. */
  ticks?: boolean;
  desc(n: number): string;
}

export const STATUSES: Record<StatusId, StatusDef> = {
  strength: { name: 'Strength', icon: '💪', debuff: false, desc: (n) => `Attacks deal ${n} ${n >= 0 ? 'more' : 'less'} damage.` },
  dexterity: { name: 'Dexterity', icon: '👟', debuff: false, desc: (n) => `Block from cards ${n >= 0 ? '+' : ''}${n}.` },
  weak: { name: 'Weak', icon: '🥀', debuff: true, ticks: true, desc: (n) => `Attacks deal 25% less damage for ${n} turn(s).` },
  vulnerable: { name: 'Vulnerable', icon: '💔', debuff: true, ticks: true, desc: (n) => `Takes 50% more attack damage for ${n} turn(s).` },
  frail: { name: 'Frail', icon: '🦴', debuff: true, ticks: true, desc: (n) => `Gains 25% less Block from cards for ${n} turn(s).` },
  poison: { name: 'Poison', icon: '☠️', debuff: true, desc: (n) => `Loses ${n} HP at the start of its turn, then Poison goes down by 1.` },
  thorns: { name: 'Thorns', icon: '🌵', debuff: false, desc: (n) => `Attackers take ${n} damage per hit.` },
  metallicize: { name: 'Metallicize', icon: '🔩', debuff: false, desc: (n) => `Gains ${n} Block at the end of its turn.` },
  ritual: { name: 'Ritual', icon: '🕯️', debuff: false, desc: (n) => `Gains ${n} Strength at the end of its turn.` },
  artifact: { name: 'Artifact', icon: '🔮', debuff: false, desc: (n) => `Negates the next ${n} debuff(s).` },
  demonForm: { name: 'Demon Form', icon: '😈', debuff: false, desc: (n) => `Gains ${n} Strength at the start of each turn.` },
  fumes: { name: 'Noxious Fumes', icon: '☁️', debuff: false, desc: (n) => `Applies ${n} Poison to ALL enemies at the start of each turn.` },
  barricade: { name: 'Barricade', icon: '🧱', debuff: false, desc: () => 'Block is not removed at the start of the turn.' },
  flex: { name: 'Flex', icon: '🔻', debuff: true, desc: (n) => `Loses ${n} Strength at the end of this turn.` },
  enrage: { name: 'Enrage', icon: '😤', debuff: false, desc: (n) => `Gains ${n} Strength whenever you play a Skill.` },
};

export function isDebuff(s: StatusId, n: number): boolean {
  if (s === 'strength' || s === 'dexterity') return n < 0;
  return STATUSES[s].debuff;
}
