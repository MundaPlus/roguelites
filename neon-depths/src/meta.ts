import type { Stats } from './types';

export interface SaveData {
  shards: number;
  upgrades: Record<string, number>;
  unlocked: string[];
  selected: string;
  bestFloor: number;
  runs: number;
  wins: number;
  muted: boolean;
}

const KEY = 'neon-depths-save-v1';

const fresh = (): SaveData => ({ shards: 0, upgrades: {}, unlocked: ['runner'], selected: 'runner', bestFloor: 0, runs: 0, wins: 0, muted: false });

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

export interface HubUpgrade {
  id: string;
  name: string;
  icon: string;
  desc: string;
  max: number;
  cost: number;
  apply(s: Stats, rank: number, run: RunStart): void;
}

/** Things a run starts with besides stats. */
export interface RunStart {
  bombs: number;
  coins: number;
  discount: number;
  items: string[];
}

export const HUB_UPGRADES: HubUpgrade[] = [
  { id: 'hull', name: 'Hull Plating', icon: '❤️', desc: '+1 half heart per rank', max: 4, cost: 12, apply: (s, r) => (s.maxHp += r) },
  { id: 'power', name: 'Power Cell', icon: '🔺', desc: '+6% damage per rank', max: 5, cost: 10, apply: (s, r) => (s.dmgMult *= 1 + 0.06 * r) },
  { id: 'trigger', name: 'Hair Trigger', icon: '⚡', desc: '+5% fire rate per rank', max: 5, cost: 10, apply: (s, r) => (s.fireRate *= 1 + 0.05 * r) },
  { id: 'thrusters', name: 'Thrusters', icon: '💨', desc: '+4% move speed per rank', max: 3, cost: 12, apply: (s, r) => (s.speed *= 1 + 0.04 * r) },
  { id: 'reflex', name: 'Reflex Chip', icon: '🌀', desc: '-8% dodge cooldown per rank', max: 3, cost: 12, apply: (s, r) => (s.dodgeCd *= 1 - 0.08 * r) },
  { id: 'fortune', name: 'Fortune', icon: '🍀', desc: '+0.5 luck per rank', max: 2, cost: 20, apply: (s, r) => (s.luck += 0.5 * r) },
  { id: 'pockets', name: 'Deep Pockets', icon: '💣', desc: '+1 starting bomb per rank', max: 3, cost: 8, apply: (_s, r, run) => (run.bombs += r) },
  { id: 'wallet', name: 'Wallet', icon: '🪙', desc: '+5 starting coins per rank', max: 3, cost: 10, apply: (_s, r, run) => (run.coins += 5 * r) },
  { id: 'haggle', name: 'Haggler', icon: '🏷️', desc: '-10% shop prices per rank', max: 3, cost: 15, apply: (_s, r, run) => (run.discount += 0.1 * r) },
];

export const upgradeCost = (u: HubUpgrade, rank: number): number => u.cost * (rank + 1);

export interface Loadout {
  id: string;
  name: string;
  icon: string;
  desc: string;
  price: number;
  color: string;
  apply(s: Stats, run: RunStart): void;
}

export const LOADOUTS: Loadout[] = [
  { id: 'runner', name: 'Runner', icon: '🏃', desc: 'Balanced. 3 hearts, 1 bomb.', price: 0, color: '#3df2ff', apply: () => {} },
  {
    id: 'gunner', name: 'Gunner', icon: '🔫', desc: 'Starts with Twin Barrel.', price: 30, color: '#ffd23f',
    apply: (_s, run) => run.items.push('twin'),
  },
  {
    id: 'tank', name: 'Bastion', icon: '🛡️', desc: '5 hearts, slower. Starts with Kinetic Rounds.', price: 45, color: '#06d6a0',
    apply: (s, run) => {
      s.maxHp += 4;
      s.speed *= 0.9;
      run.items.push('kinetic');
    },
  },
  {
    id: 'arc', name: 'Arcwright', icon: '🌩️', desc: 'Starts with Arc Coil. -10% damage.', price: 60, color: '#ffee32',
    apply: (s, run) => {
      s.dmgMult *= 0.9;
      run.items.push('arc');
    },
  },
  {
    id: 'phantom', name: 'Phantom', icon: '👻', desc: '2 hearts. Homing shots, fast dodge.', price: 75, color: '#c77dff',
    apply: (s, run) => {
      s.maxHp -= 2;
      s.dodgeCd *= 0.7;
      run.items.push('seeker');
    },
  },
  {
    id: 'demo', name: 'Demolisher', icon: '💣', desc: 'Exploding shots, 5 bombs. -20% fire rate.', price: 90, color: '#ff5e5b',
    apply: (s, run) => {
      s.fireRate *= 0.8;
      run.bombs += 4;
      run.items.push('payload');
    },
  },
];
