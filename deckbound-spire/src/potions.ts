import type { Op } from './types';

export interface PotionDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  target: 'enemy' | 'none';
  ops: Op[];
}

const list: PotionDef[] = [
  { id: 'fire', name: 'Fire Potion', icon: '🔥', desc: 'Deal 20 damage to an enemy.', target: 'enemy', ops: [{ op: 'dmg', n: 20, raw: true }] },
  { id: 'explosive', name: 'Explosive Potion', icon: '💣', desc: 'Deal 10 damage to ALL enemies.', target: 'none', ops: [{ op: 'dmg', n: 10, all: true, raw: true }] },
  { id: 'block', name: 'Block Potion', icon: '🛡️', desc: 'Gain 12 Block.', target: 'none', ops: [{ op: 'block', n: 12, raw: true }] },
  { id: 'strength', name: 'Strength Potion', icon: '💪', desc: 'Gain 2 Strength.', target: 'none', ops: [{ op: 'status', s: 'strength', n: 2, to: 'self' }] },
  { id: 'dexterity', name: 'Dexterity Potion', icon: '👟', desc: 'Gain 2 Dexterity.', target: 'none', ops: [{ op: 'status', s: 'dexterity', n: 2, to: 'self' }] },
  { id: 'swift', name: 'Swift Potion', icon: '💨', desc: 'Draw 3 cards.', target: 'none', ops: [{ op: 'draw', n: 3 }] },
  { id: 'energy', name: 'Energy Potion', icon: '⚡', desc: 'Gain 2 Energy.', target: 'none', ops: [{ op: 'energy', n: 2 }] },
  { id: 'poison', name: 'Poison Potion', icon: '☠️', desc: 'Apply 6 Poison to an enemy.', target: 'enemy', ops: [{ op: 'status', s: 'poison', n: 6, to: 'target' }] },
  { id: 'weak', name: 'Weak Potion', icon: '🥀', desc: 'Apply 3 Weak to an enemy.', target: 'enemy', ops: [{ op: 'status', s: 'weak', n: 3, to: 'target' }] },
  { id: 'fear', name: 'Fear Potion', icon: '💔', desc: 'Apply 3 Vulnerable to an enemy.', target: 'enemy', ops: [{ op: 'status', s: 'vulnerable', n: 3, to: 'target' }] },
  { id: 'blood', name: 'Blood Potion', icon: '❤️', desc: 'Heal 20% of your Max HP.', target: 'none', ops: [{ op: 'healPct', n: 20 }] },
];

export const POTIONS: Record<string, PotionDef> = Object.fromEntries(list.map((p) => [p.id, p]));
export const POTION_IDS = list.map((p) => p.id);
