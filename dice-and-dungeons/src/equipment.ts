import type { EquipKind, Rarity, Req, Status } from './types';

/** What an equipment effect can do. The combat engine gives one Ctx per use. */
export interface Ctx {
  /** Deal damage to the foe. Returns the damage that got through to HP. */
  hit(n: number, opts?: { pierce?: boolean }): number;
  hurtSelf(n: number): void;
  block(n: number): void;
  heal(n: number): void;
  inflict(s: Status, n: number): void;
  cleanse(): void;
  breakShield(): void;
  /** Add new dice to the user's pool. */
  addDice(values: number[]): void;
  /** Add bonus damage to the next hit this turn. */
  focus(n: number): void;
  readonly shield: number;
  /** How many dice with the same value the user placed earlier this turn. */
  readonly sameBefore: number;
  roll(): number;
}

export interface EquipDef {
  id: string;
  name: string;
  icon: string;
  size: 1 | 2;
  rarity: Rarity;
  kind: EquipKind;
  req: (lvl: number) => Req;
  /** Uses per turn. Default 1. Count slots have no limit. */
  uses?: (lvl: number) => number;
  /** Effect text. ▢ stands for the die value. */
  text: (lvl: number) => string;
  run: (c: Ctx, x: number, lvl: number) => void;
  /** Enemy AI priority for a die value. Higher goes first. */
  ai?: (x: number) => number;
}

const any: Req = { k: 'any' };
const even: Req = { k: 'even' };
const odd: Req = { k: 'odd' };
const max = (n: number): Req => ({ k: 'max', n });
const min = (n: number): Req => ({ k: 'min', n });
const count = (n: number): Req => ({ k: 'count', n });
const half = (x: number) => Math.ceil(x / 2);
/** Player items have level 0 or 1. Pick the number for the level. */
const up = (lvl: number, a: number, b: number) => (lvl > 0 ? b : a);
const plus = (n: number) => (n > 0 ? `+${n}` : '');

const LIST: EquipDef[] = [
  // ---------- Starting kits ----------
  {
    id: 'broadsword', name: 'Broadsword', icon: '🗡️', size: 2, rarity: 'start', kind: 'attack',
    req: () => any,
    text: (l) => `Deal ▢${plus(up(l, 0, 2))} damage.`,
    run: (c, x, l) => void c.hit(x + up(l, 0, 2)),
  },
  {
    id: 'buckler', name: 'Buckler', icon: '🛡️', size: 1, rarity: 'start', kind: 'defense',
    req: () => even,
    text: (l) => `Gain ▢${plus(up(l, 0, 2))} shield.`,
    run: (c, x, l) => c.block(x + up(l, 0, 2)),
  },
  {
    id: 'spear', name: 'Spear', icon: '🔱', size: 1, rarity: 'start', kind: 'attack',
    req: () => min(4),
    text: (l) => `Deal ▢+${up(l, 1, 3)} damage.`,
    run: (c, x, l) => void c.hit(x + up(l, 1, 3)),
  },
  {
    id: 'dagger', name: 'Dagger', icon: '🔪', size: 1, rarity: 'start', kind: 'attack',
    req: () => max(3),
    uses: (l) => up(l, 2, 3),
    text: () => 'Deal ▢ damage.',
    run: (c, x) => void c.hit(x),
  },
  {
    id: 'lockpick', name: 'Lockpick', icon: '🗝️', size: 1, rarity: 'start', kind: 'utility',
    req: () => min(2),
    uses: (l) => up(l, 1, 2),
    text: () => 'Split ▢ into two dice.',
    run: (c, x) => c.addDice([Math.floor(x / 2), half(x)]),
  },
  {
    id: 'rapier', name: 'Rapier', icon: '🤺', size: 1, rarity: 'start', kind: 'attack',
    req: () => any,
    text: (l) => `Deal ▢${plus(up(l, 0, 1))} damage. On a 6, deal ${up(l, 4, 6)} more.`,
    run: (c, x, l) => void c.hit(x + up(l, 0, 1) + (x === 6 ? up(l, 4, 6) : 0)),
  },
  {
    id: 'hammer', name: 'Tinker Hammer', icon: '🔨', size: 1, rarity: 'start', kind: 'utility',
    req: () => max(5),
    uses: (l) => up(l, 1, 2),
    text: () => 'Add 1 to ▢.',
    run: (c, x) => c.addDice([x + 1]),
  },
  {
    id: 'spatula', name: 'Spatula', icon: '🍳', size: 1, rarity: 'start', kind: 'utility',
    req: () => any,
    uses: (l) => up(l, 1, 2),
    text: () => 'Flip ▢ to its other side (7 − ▢).',
    run: (c, x) => c.addDice([7 - x]),
  },
  {
    id: 'war-hammer', name: 'War Hammer', icon: '⚒️', size: 2, rarity: 'start', kind: 'attack',
    req: (l) => count(up(l, 12, 10)),
    text: () => 'Deal 14 damage.',
    run: (c) => void c.hit(14),
  },

  // ---------- Rewards and shop ----------
  {
    id: 'bomb', name: 'Bomb', icon: '💣', size: 1, rarity: 'common', kind: 'attack',
    req: () => count(7),
    text: (l) => `Deal ${up(l, 10, 13)} damage. Take 2 damage.`,
    run: (c, _x, l) => {
      c.hit(up(l, 10, 13));
      c.hurtSelf(2);
    },
  },
  {
    id: 'fireball', name: 'Fireball', icon: '☄️', size: 2, rarity: 'common', kind: 'attack',
    req: (l) => (l > 0 ? min(5) : { k: 'exact', n: 6 }),
    text: () => 'Deal 8 damage. Inflict 2 burn.',
    run: (c) => {
      c.hit(8);
      c.inflict('burn', 2);
    },
  },
  {
    id: 'poison-vial', name: 'Poison Vial', icon: '🧪', size: 1, rarity: 'common', kind: 'attack',
    req: () => odd,
    text: (l) => `Inflict ½▢${plus(up(l, 0, 1))} poison (round up).`,
    run: (c, x, l) => c.inflict('poison', half(x) + up(l, 0, 1)),
  },
  {
    id: 'ice-shard', name: 'Ice Shard', icon: '🧊', size: 1, rarity: 'common', kind: 'attack',
    req: () => max(3),
    text: (l) => `Deal ▢ damage. Inflict ${up(l, 1, 2)} freeze.`,
    run: (c, x, l) => {
      c.hit(x);
      c.inflict('freeze', up(l, 1, 2));
    },
  },
  {
    id: 'zapper', name: 'Zapper', icon: '⚡', size: 1, rarity: 'common', kind: 'attack',
    req: () => even,
    text: (l) => `Deal ${up(l, 2, 4)} damage. Inflict 1 shock.`,
    run: (c, _x, l) => {
      c.hit(up(l, 2, 4));
      c.inflict('shock', 1);
    },
  },
  {
    id: 'herb', name: 'Healing Herb', icon: '🌿', size: 1, rarity: 'common', kind: 'defense',
    req: (l) => count(up(l, 9, 7)),
    text: () => 'Heal 6 HP.',
    run: (c) => c.heal(6),
  },
  {
    id: 'twin-blades', name: 'Twin Blades', icon: '⚔️', size: 1, rarity: 'common', kind: 'attack',
    req: () => any,
    text: (l) => `Deal ▢${plus(up(l, 0, 1))} damage. Double it if you used the same number before this turn.`,
    run: (c, x, l) => void c.hit((x + up(l, 0, 1)) * (c.sameBefore > 0 ? 2 : 1)),
  },
  {
    id: 'sling', name: 'Sling', icon: '🪨', size: 1, rarity: 'common', kind: 'attack',
    req: () => max(2),
    text: (l) => `Deal ▢×${up(l, 3, 4)} damage.`,
    run: (c, x, l) => void c.hit(x * up(l, 3, 4)),
  },
  {
    id: 'leech', name: 'Leech Knife', icon: '🩸', size: 1, rarity: 'common', kind: 'attack',
    req: () => max(4),
    text: (l) => (l > 0 ? 'Deal ▢ damage. Heal ▢.' : 'Deal ▢ damage. Heal ½▢ (round up).'),
    run: (c, x, l) => {
      c.hit(x);
      c.heal(l > 0 ? x : half(x));
    },
  },
  {
    id: 'shield-bash', name: 'Shield Bash', icon: '🥊', size: 1, rarity: 'common', kind: 'attack',
    req: () => odd,
    text: (l) => `Deal damage equal to your shield${l > 0 ? ' +3' : ''} (max 20).`,
    run: (c, _x, l) => void c.hit(Math.min(20, c.shield + up(l, 0, 3))),
  },
  {
    id: 'focus', name: 'Battle Focus', icon: '🎯', size: 1, rarity: 'common', kind: 'utility',
    req: () => any,
    text: (l) => `Your next hit this turn deals ▢${plus(up(l, 0, 2))} more damage.`,
    run: (c, x, l) => c.focus(x + up(l, 0, 2)),
  },
  {
    id: 'iron-wall', name: 'Iron Wall', icon: '🧱', size: 2, rarity: 'common', kind: 'defense',
    req: () => count(10),
    text: (l) => `Gain ${up(l, 14, 20)} shield.`,
    run: (c, _x, l) => c.block(up(l, 14, 20)),
  },
  {
    id: 'mirror', name: 'Mirror Shield', icon: '🪞', size: 1, rarity: 'common', kind: 'defense',
    req: () => max(2),
    text: (l) => `Gain ${up(l, 5, 8)} shield.`,
    run: (c, _x, l) => c.block(up(l, 5, 8)),
  },
  {
    id: 'pickaxe', name: 'Pickaxe', icon: '⛏️', size: 1, rarity: 'common', kind: 'attack',
    req: () => min(5),
    text: (l) => `Break all enemy shield. Deal ▢${plus(up(l, 0, 3))} damage.`,
    run: (c, x, l) => {
      c.breakShield();
      c.hit(x + up(l, 0, 3));
    },
  },
  {
    id: 'remedy', name: 'Remedy', icon: '💊', size: 1, rarity: 'common', kind: 'defense',
    req: () => any,
    text: (l) => `Remove all your bad statuses. Heal ${up(l, 2, 5)}.`,
    run: (c, _x, l) => {
      c.cleanse();
      c.heal(up(l, 2, 5));
    },
  },
  {
    id: 'cup', name: "Gambler's Cup", icon: '🥤', size: 1, rarity: 'common', kind: 'utility',
    req: () => any,
    uses: (l) => up(l, 1, 2),
    text: () => 'Roll ▢ again.',
    run: (c) => c.addDice([c.roll()]),
  },
  {
    id: 'morning-star', name: 'Morning Star', icon: '🌟', size: 2, rarity: 'rare', kind: 'attack',
    req: () => min(4),
    text: (l) => `Deal ▢×2${plus(up(l, 0, 2))} damage.`,
    run: (c, x, l) => void c.hit(x * 2 + up(l, 0, 2)),
  },
  {
    id: 'duplicator', name: 'Duplicator', icon: '👯', size: 1, rarity: 'rare', kind: 'utility',
    req: (l) => max(up(l, 3, 4)),
    text: () => 'Get two dice with the value ▢.',
    run: (c, x) => c.addDice([x, x]),
  },
  {
    id: 'thunder-staff', name: 'Thunder Staff', icon: '🌩️', size: 2, rarity: 'rare', kind: 'attack',
    req: (l) => count(up(l, 15, 12)),
    text: () => 'Deal 12 damage. Inflict 2 shock.',
    run: (c) => {
      c.hit(12);
      c.inflict('shock', 2);
    },
  },
  {
    id: 'greatshield', name: 'Tower Shield', icon: '🏯', size: 2, rarity: 'rare', kind: 'defense',
    req: () => min(4),
    text: (l) => `Gain ▢×2${plus(up(l, 0, 3))} shield.`,
    run: (c, x, l) => c.block(x * 2 + up(l, 0, 3)),
  },
  {
    id: 'executioner', name: 'Executioner', icon: '🪓', size: 2, rarity: 'rare', kind: 'attack',
    req: () => ({ k: 'exact', n: 6 }),
    text: (l) => `Deal ${up(l, 15, 20)} damage. Pierces shield.`,
    run: (c, _x, l) => void c.hit(up(l, 15, 20), { pierce: true }),
  },

  // ---------- Enemy equipment. Level scales the numbers. ----------
  {
    id: 'claw', name: 'Claw', icon: '🐾', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => any,
    text: (l) => `Deal ▢${plus(l * 2)} damage.`,
    run: (c, x, l) => void c.hit(x + l * 2),
  },
  {
    id: 'bite', name: 'Bite', icon: '🦷', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => max(3),
    text: (l) => `Deal ▢+${2 + l} damage.`,
    run: (c, x, l) => void c.hit(x + 2 + l),
  },
  {
    id: 'slam', name: 'Slam', icon: '👊', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => min(4),
    text: (l) => `Deal ▢+${1 + l * 2} damage.`,
    run: (c, x, l) => void c.hit(x + 1 + l * 2),
  },
  {
    id: 'harden', name: 'Harden', icon: '🪨', size: 1, rarity: 'enemy', kind: 'defense',
    req: () => even,
    text: (l) => `Gain ▢${plus(l * 2)} shield.`,
    run: (c, x, l) => c.block(x + l * 2),
  },
  {
    id: 'spit', name: 'Spit', icon: '💦', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => odd,
    text: (l) => `Deal ½▢${plus(l)} damage. Inflict 1 weak.`,
    run: (c, x, l) => {
      c.hit(half(x) + l);
      c.inflict('weak', 1);
    },
  },
  {
    id: 'venom', name: 'Venom', icon: '🐍', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => max(4),
    text: (l) => `Inflict ${2 + l} poison.`,
    run: (c, _x, l) => c.inflict('poison', 2 + l),
  },
  {
    id: 'flame', name: 'Flame', icon: '🔥', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => odd,
    text: (l) => `Deal ▢ damage. Inflict ${1 + l} burn.`,
    run: (c, x, l) => {
      c.hit(x);
      c.inflict('burn', 1 + l);
    },
  },
  {
    id: 'frost', name: 'Frost Breath', icon: '❄️', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => min(4),
    text: (l) => `Deal ${2 + l} damage. Inflict ${1 + l} freeze.`,
    run: (c, _x, l) => {
      c.hit(2 + l);
      c.inflict('freeze', 1 + l);
    },
  },
  {
    id: 'spark', name: 'Spark', icon: '⚡', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => any,
    text: (l) => `Deal ½▢${plus(l)} damage. Inflict 1 shock.`,
    run: (c, x, l) => {
      c.hit(half(x) + l);
      c.inflict('shock', 1);
    },
  },
  {
    id: 'drain', name: 'Drain', icon: '🧛', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => min(3),
    text: (l) => `Deal ▢${plus(l)} damage. Heal ½▢.`,
    run: (c, x, l) => {
      c.hit(x + l);
      c.heal(half(x));
    },
  },
  {
    id: 'curse', name: 'Curse', icon: '🕯️', size: 1, rarity: 'enemy', kind: 'attack',
    req: () => max(2),
    text: (l) => (l > 0 ? `Inflict 2 weak. Deal ${l * 2} damage.` : 'Inflict 2 weak.'),
    run: (c, _x, l) => {
      c.inflict('weak', 2);
      if (l > 0) c.hit(l * 2);
    },
    ai: () => 14,
  },
  {
    id: 'smash', name: 'Smash', icon: '💥', size: 2, rarity: 'enemy', kind: 'attack',
    req: (l) => count(10 + l * 4),
    text: (l) => `Deal ${12 + l * 6} damage.`,
    run: (c, _x, l) => void c.hit(12 + l * 6),
  },
  {
    id: 'regrow', name: 'Regrow', icon: '🍄', size: 1, rarity: 'enemy', kind: 'defense',
    req: () => count(8),
    text: (l) => `Heal ${8 + l * 4} HP.`,
    run: (c, _x, l) => c.heal(8 + l * 4),
  },
  {
    id: 'storm', name: 'Dice Storm', icon: '🌪️', size: 2, rarity: 'enemy', kind: 'attack',
    req: () => count(15),
    text: (l) => `Deal ${8 + l * 4} damage. Inflict 2 burn and 1 shock.`,
    run: (c, _x, l) => {
      c.hit(8 + l * 4);
      c.inflict('burn', 2);
      c.inflict('shock', 1);
    },
  },
];

export const EQUIP: Record<string, EquipDef> = Object.fromEntries(LIST.map((e) => [e.id, e]));

export const getEquip = (id: string): EquipDef => {
  const d = EQUIP[id];
  if (!d) throw new Error(`Unknown equipment ${id}`);
  return d;
};

export const REWARD_POOL = LIST.filter((e) => e.rarity === 'common' || e.rarity === 'rare' || e.rarity === 'start').map((e) => e.id);

export const usesOf = (d: EquipDef, lvl: number): number => (d.req(lvl).k === 'count' ? Infinity : (d.uses?.(lvl) ?? 1));
