import type { Stats } from './types';
import type { WeaponId } from './weapons';

export interface SaveData {
  gold: number;
  upgrades: Record<string, number>;
  unlocked: string[];
  selected: string;
  best: { time: number; level: number; kills: number };
  runs: number;
  wins: number;
}

const KEY = 'ember-swarm-save-v1';

const fresh = (): SaveData => ({
  gold: 0,
  upgrades: {},
  unlocked: ['kael'],
  selected: 'kael',
  best: { time: 0, level: 0, kills: 0 },
  runs: 0,
  wins: 0,
});

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    // Storage can be blocked (private mode). Play continues without saves.
  }
  return fresh();
}

export function writeSave(s: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // See loadSave.
  }
}

export interface MetaUpgrade {
  id: string;
  name: string;
  icon: string;
  desc: string;
  max: number;
  cost: number;
  apply(s: Stats, rank: number): void;
}

export const META_UPGRADES: MetaUpgrade[] = [
  { id: 'might', name: 'Might', icon: '💪', desc: '+5% damage per rank', max: 5, cost: 60, apply: (s, r) => (s.might += 0.05 * r) },
  { id: 'vitality', name: 'Vitality', icon: '❤️', desc: '+10 max HP per rank', max: 5, cost: 50, apply: (s, r) => (s.maxHp += 10 * r) },
  { id: 'swiftness', name: 'Swiftness', icon: '💨', desc: '+4% move speed per rank', max: 3, cost: 70, apply: (s, r) => (s.speed *= 1 + 0.04 * r) },
  { id: 'magnet', name: 'Attraction', icon: '🧲', desc: '+15% pickup range per rank', max: 3, cost: 40, apply: (s, r) => (s.magnet *= 1 + 0.15 * r) },
  { id: 'greed', name: 'Greed', icon: '🪙', desc: '+10% gold per rank', max: 5, cost: 50, apply: (s, r) => (s.greed += 0.1 * r) },
  { id: 'growth', name: 'Growth', icon: '📈', desc: '+5% experience per rank', max: 5, cost: 60, apply: (s, r) => (s.growth += 0.05 * r) },
  { id: 'recovery', name: 'Recovery', icon: '🩹', desc: '+0.1 HP/s per rank', max: 3, cost: 80, apply: (s, r) => (s.regen += 0.1 * r) },
  { id: 'reroll', name: 'Reroll', icon: '🎲', desc: '+1 level-up reroll per run', max: 3, cost: 100, apply: () => {} },
];

export const upgradeCost = (u: MetaUpgrade, rank: number): number => u.cost * (rank + 1);

export function applyMeta(s: Stats, save: SaveData): void {
  for (const u of META_UPGRADES) {
    const rank = save.upgrades[u.id] ?? 0;
    if (rank) u.apply(s, rank);
  }
}

export interface CharacterDef {
  id: string;
  name: string;
  title: string;
  color: string;
  weapon: WeaponId;
  price: number;
  bonus: string;
  apply(s: Stats): void;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'kael', name: 'Kael', title: 'Ember Mage', color: '#ff9f1c', weapon: 'bolt', price: 0, bonus: '+10% damage', apply: (s) => (s.might += 0.1) },
  { id: 'vera', name: 'Vera', title: 'Flame Dancer', color: '#f15bb5', weapon: 'whip', price: 150, bonus: '+10% move speed', apply: (s) => (s.speed *= 1.1) },
  { id: 'ozzy', name: 'Ozzy', title: 'Cinder Monk', color: '#fee440', weapon: 'orbit', price: 300, bonus: '+20 max HP, +1 armor', apply: (s) => ((s.maxHp += 20), (s.armor += 1)) },
  { id: 'lyra', name: 'Lyra', title: 'Pyromancer', color: '#ff5400', weapon: 'firebomb', price: 500, bonus: '+15% area', apply: (s) => (s.area += 0.15) },
  { id: 'zed', name: 'Zed', title: 'Storm Caller', color: '#00bbf9', weapon: 'chain', price: 800, bonus: '-10% cooldown', apply: (s) => (s.cooldown *= 0.9) },
];
