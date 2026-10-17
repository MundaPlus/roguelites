/** Static game data: room cards, bosses, hero types, the target fun curve. */

export type Kind = 'empty' | 'fight' | 'loot' | 'rest' | 'trap' | 'mystery' | 'boss';

export interface Stats {
  /** Monster or trap strength, 0–10. */
  danger: number;
  /** Treasure, 0–10. */
  loot: number;
  /** Surprise and wonder, 0–10. */
  surprise: number;
  /** Rest and healing, 0–10. */
  rest: number;
}

export interface Card extends Stats {
  id: string;
  name: string;
  icon: string;
  kind: Kind;
  text: string;
  /** Shop price in renown. */
  price: number;
  /** Meta stars needed before the card shows up in the shop. */
  unlock: number;
  /** Mystery rooms: the second outcome and its chance. */
  alt?: Stats & { chance: number; text: string };
}

const C = (
  id: string,
  icon: string,
  name: string,
  kind: Kind,
  danger: number,
  loot: number,
  surprise: number,
  rest: number,
  price: number,
  unlock: number,
  text: string,
  alt?: Card['alt'],
): Card => ({ id, icon, name, kind, danger, loot, surprise, rest, price, unlock, text, alt });

export const CARDS: Record<string, Card> = Object.fromEntries(
  [
    C('hall', '🕸️', 'Empty Hall', 'empty', 0, 0, 1, 2, 6, 0, 'Dust and cobwebs. A breather.'),
    C('rats', '🐀', 'Rat Nest', 'fight', 2, 1, 1, 0, 8, 0, 'A swarm of rats. A warm-up fight.'),
    C('goblins', '👺', 'Goblin Camp', 'fight', 4, 2, 2, 0, 12, 0, 'Goblins with spears and a small stash.'),
    C('chest', '💰', 'Treasure Chest', 'loot', 0, 5, 2, 0, 12, 0, 'A chest of coins. No guards.'),
    C('camp', '🔥', 'Campfire', 'rest', 0, 0, 0, 6, 10, 0, 'A safe fire. Heals and calms.'),
    C('spikes', '⚙️', 'Spike Trap', 'trap', 3, 0, 4, 0, 8, 0, 'A floor of hidden spikes.'),
    C('altar', '🗿', 'Strange Altar', 'mystery', 0, 6, 6, 1, 12, 0, 'A blessing… or a curse.', { chance: 0.4, danger: 5, loot: 0, surprise: 7, rest: 0, text: 'The altar bites back!' }),
    C('troll', '🧌', 'Troll Bridge', 'fight', 6, 3, 2, 0, 16, 0, 'A troll guards the only bridge.'),
    C('ambush', '🗡️', 'Ambush', 'fight', 5, 1, 7, 0, 16, 0, 'Bandits drop from the ceiling.'),
    C('vault', '🏺', 'Old Vault', 'loot', 1, 8, 2, 0, 20, 0, 'Piles of gold behind a rusty lock.'),
    C('spring', '⛲', 'Healing Spring', 'rest', 0, 0, 2, 9, 18, 0, 'Clear water. Wounds close.'),
    C('mimic', '📦', 'Mimic', 'fight', 4, 5, 8, 0, 20, 0, 'The chest has teeth.'),
    C('library', '📚', 'Quiet Library', 'rest', 0, 1, 5, 4, 14, 0, 'Old books and a soft chair.'),
    C('merchant', '🧙', 'Merchant', 'loot', 0, 4, 3, 3, 14, 0, 'A friendly trader with fair prices.'),
    C('arena', '⚔️', 'Arena', 'fight', 7, 2, 3, 0, 20, 0, 'A crowd cheers for a duel.'),
    C('drake', '🐉', 'Drake Lair', 'fight', 8, 6, 3, 0, 26, 6, 'A young drake on its hoard.'),
    C('portal', '🌀', 'Portal Maze', 'mystery', 1, 2, 9, 0, 18, 6, 'Doors that lead to other doors.', { chance: 0.3, danger: 4, loot: 0, surprise: 9, rest: 0, text: 'The maze spits out a monster!' }),
    C('spores', '🍄', 'Spore Cave', 'trap', 2, 1, 6, 1, 12, 12, 'Glowing spores. Strange dreams.'),
    C('gems', '💎', 'Gem Mine', 'loot', 2, 7, 4, 0, 22, 12, 'Gems in the walls. Something digs nearby.'),
    C('crypt', '👻', 'Haunted Crypt', 'fight', 5, 3, 8, 0, 22, 20, 'Ghosts. Cold hands. Old gold.'),
    C('inn', '🍺', 'Hidden Inn', 'rest', 0, 2, 4, 7, 20, 20, 'A warm inn deep below. Who runs it?'),
    C('pit', '🕳️', 'Pit of Doom', 'trap', 7, 2, 5, 0, 18, 30, 'A long drop into the dark.'),
  ].map((c) => [c.id, c]),
);

/** Boss cards. The last room of each dungeon is one of 3 bosses. */
export const BOSSES: Record<string, Card> = Object.fromEntries(
  [
    C('dragon', '🐲', 'Red Dragon', 'boss', 10, 9, 4, 0, 0, 0, 'Fire, wings and a mountain of gold.'),
    C('lich', '💀', 'Lich King', 'boss', 9, 5, 8, 0, 0, 0, 'Dark magic and many tricks.'),
    C('horror', '🦑', 'Deep Horror', 'boss', 8, 3, 10, 0, 0, 0, 'Too many eyes. Too many arms.'),
    C('golem', '🗿', 'Iron Golem', 'boss', 9, 6, 2, 0, 0, 0, 'Slow, huge and very hard to hurt.'),
    C('queen', '🕷️', 'Spider Queen', 'boss', 7, 4, 7, 0, 0, 0, 'Webs everywhere. Then she drops.'),
    C('ogre', '👹', 'Ogre Chief', 'boss', 8, 7, 3, 0, 0, 0, 'Big club, bigger appetite.'),
  ].map((c) => [c.id, c]),
);

export const allCard = (id: string): Card => CARDS[id] ?? BOSSES[id];

export const STARTER_DECK = ['hall', 'rats', 'rats', 'goblins', 'goblins', 'chest', 'camp', 'spikes', 'altar', 'troll'];

/** Rooms per dungeon before the boss. */
export const ROOMS = 8;
export const DUNGEONS = 5;
/** Fun target per step (8 rooms + boss): rising tension, a short release, a peak at the boss. */
export const TARGET = [25, 35, 45, 55, 68, 38, 52, 70, 90];
/** Fun within this distance of the target gives full points. */
export const ZONE = 8;
/** Fun this far from the target gives no points. */
export const ZONE_OUT = 24;

export type HeroId = 'knight' | 'rogue' | 'barbarian' | 'mage' | 'bard';

export type Reason = 'bored' | 'repeat' | 'stress' | 'hurt' | 'loot' | 'fight' | 'rest' | 'restBad' | 'surprise' | 'trap' | 'zone' | 'calm' | 'nearDeath' | 'boss' | 'nothing';

export interface HeroType {
  id: HeroId;
  name: string;
  icon: string;
  title: string;
  profile: string;
  likes: string;
  dislikes: string;
  hp: number;
  gear: number;
  /** Fun per stat point (rest lowers fun). */
  feel: Stats;
  /** Rooms with less fun than this make the hero bored. */
  boreLine: number;
  /** Boredom per point of fun below the line. */
  boreK: number;
  /** Monster power above this adds stress. */
  nerve: number;
  /** Multiplier on all stress gains. */
  stressK: number;
  /** Stress removed per rest point. */
  calm: number;
  /** Delight per stat point. */
  like: { fight: number; loot: number; rest: number; surprise: number };
  /** Boredom when the same room kind comes twice in a row. */
  repeat: number;
  /** Boredom per rest point. */
  restBore: number;
  /** Boredom in rooms with no loot. */
  noLootBore: number;
  /** Stress multiplier in trap rooms. */
  trapHate: number;
  /** Delight when the fun is in the target zone. */
  zoneLove: number;
  /** Meta stars needed. */
  unlock: number;
  lines: Partial<Record<Reason, string[]>>;
}

export const HEROES: Record<HeroId, HeroType> = {
  knight: {
    id: 'knight',
    name: 'Sir Wary',
    icon: '🛡️',
    title: 'Cautious Knight',
    profile: 'Brave, but only a little at a time. A small fight already feels big to him. Big fights scare him.',
    likes: 'Rest rooms, small fights',
    dislikes: 'Big monsters, low HP',
    hp: 115,
    gear: 4,
    feel: { danger: 7.5, loot: 3, surprise: 4, rest: 2 },
    boreLine: 26,
    boreK: 0.45,
    nerve: 4,
    stressK: 1.35,
    calm: 3.2,
    like: { fight: 0.4, loot: 0.8, rest: 3.2, surprise: 0.4 },
    repeat: 5,
    restBore: 0,
    noLootBore: 0,
    trapHate: 1.2,
    zoneLove: 0,
    unlock: 0,
    lines: {
      rest: ['Ahh, a safe place.', 'A moment of peace. Thank you.', 'I can breathe again.'],
      stress: ['That was too close!', 'My hands are shaking…', 'Please, no more big ones.'],
      fight: ['For honor!', 'A fair fight. Good.'],
      bored: ['Is this a dungeon or a hallway?', 'Hm. Quiet. Too quiet?'],
    },
  },
  rogue: {
    id: 'rogue',
    name: 'Nim Quickfingers',
    icon: '💰',
    title: 'Greedy Rogue',
    profile: 'Here for the gold, not the glory. Rooms without loot bore her fast. Loot makes up for a lot of danger.',
    likes: 'Loot, vaults, mimics',
    dislikes: 'Empty rooms, rooms with no treasure',
    hp: 85,
    gear: 3,
    feel: { danger: 5, loot: 6.5, surprise: 4, rest: 3 },
    boreLine: 38,
    boreK: 0.5,
    nerve: 5,
    stressK: 1.0,
    calm: 2.4,
    like: { fight: 0.3, loot: 3.6, rest: 0, surprise: 0.8 },
    repeat: 4,
    restBore: 0.6,
    noLootBore: 5,
    trapHate: 1,
    zoneLove: 0,
    unlock: 0,
    lines: {
      loot: ['Gold! Shiny!', 'Mine, mine, all mine.', 'Now THIS is a dungeon.'],
      bored: ['No loot? Again?', 'Where is the treasure?', 'Another empty room…'],
      restBad: ['Nice, but nothing to steal.'],
    },
  },
  barbarian: {
    id: 'barbarian',
    name: 'Grok the Loud',
    icon: '🪓',
    title: 'Reckless Barbarian',
    profile: 'Lives for big fights. Small rats and rest stops bore him. Traps feel like cheating to him.',
    likes: 'Big fights, arenas, bosses',
    dislikes: 'Rest rooms, traps, weak monsters',
    hp: 130,
    gear: 5,
    feel: { danger: 6, loot: 2, surprise: 3, rest: 5 },
    boreLine: 48,
    boreK: 0.55,
    nerve: 8,
    stressK: 0.8,
    calm: 1.6,
    like: { fight: 2.4, loot: 0.3, rest: -0.6, surprise: 0.3 },
    repeat: 2,
    restBore: 2.2,
    noLootBore: 0,
    trapHate: 2.4,
    zoneLove: 0,
    unlock: 0,
    lines: {
      fight: ['YES! More of that!', 'Grok SMASH!', 'Ha! Bring the next one!'],
      restBad: ['Resting? Boring.', 'Grok is not tired!'],
      trap: ['Cheap trick! Fight me!', 'Coward floor!'],
      bored: ['Where are the monsters?', 'Grok is falling asleep…'],
    },
  },
  mage: {
    id: 'mage',
    name: 'Ilsa of the Ninth Tower',
    icon: '🔮',
    title: 'Curious Mage',
    profile: 'Wants to see new and strange things. Hates the same room twice. Frail in a fight.',
    likes: 'Mysteries, portals, libraries',
    dislikes: 'Repeats, long fights',
    hp: 72,
    gear: 2,
    feel: { danger: 5, loot: 2.5, surprise: 8, rest: 2 },
    boreLine: 34,
    boreK: 0.45,
    nerve: 4,
    stressK: 1.15,
    calm: 2.6,
    like: { fight: 0, loot: 0.6, rest: 0.8, surprise: 3 },
    repeat: 14,
    restBore: 0,
    noLootBore: 0,
    trapHate: 0.8,
    zoneLove: 0,
    unlock: 8,
    lines: {
      surprise: ['Fascinating!', 'I must write this down.', 'What a strange place!'],
      repeat: ['This again?', 'I have seen this room before.'],
      bored: ['Dull. So dull.', 'Nothing new here.'],
    },
  },
  bard: {
    id: 'bard',
    name: 'Lute Larkspur',
    icon: '🎻',
    title: 'Story-loving Bard',
    profile: 'Wants a good story: build-up, a breather, a big finale. Loves it when the fun follows the curve.',
    likes: 'Fun right on the target curve',
    dislikes: 'Rooms off the curve',
    hp: 90,
    gear: 3,
    feel: { danger: 6, loot: 4, surprise: 5, rest: 3 },
    boreLine: 36,
    boreK: 0.45,
    nerve: 5,
    stressK: 1.15,
    calm: 2.5,
    like: { fight: 0.3, loot: 0.6, rest: 0.4, surprise: 0.6 },
    repeat: 6,
    restBore: 0,
    noLootBore: 0,
    trapHate: 1,
    zoneLove: 14,
    unlock: 20,
    lines: {
      zone: ['What a story!', 'A fine verse for my song.', 'Perfect pacing!'],
      bored: ['This chapter drags.', 'Nobody will sing about this.'],
    },
  },
};

export const HERO_IDS = Object.keys(HEROES) as HeroId[];

export const GENERIC_LINES: Record<Reason, string[]> = {
  bored: ['Another empty room…', 'Yawn.', 'Is anything going to happen?'],
  repeat: ['This again?', 'Same room, new day.'],
  stress: ['Too much! I need a break.', 'I am not paid enough for this.'],
  hurt: ['Ouch! That really hurt.', 'I am bleeding here!'],
  loot: ['Nice loot!', 'Ooh, treasure.'],
  fight: ['Good fight!', 'That got my blood going.'],
  rest: ['A nice rest.', 'I feel better.'],
  restBad: ['A rest. Already?'],
  surprise: ['Whoa! Did not see that coming.', 'What was that?!'],
  trap: ['A trap! Sneaky.', 'Watch your step…'],
  zone: ['This is fun!', 'Now we are talking.'],
  calm: ['Okay. I am calm again.'],
  nearDeath: ['I can barely stand…', 'One more hit and I am done.'],
  boss: ['THE BOSS! This is it!', 'A legend in the making!'],
  nothing: ['Hm.', 'Onward.'],
};

/** Shop services between dungeons. */
export const SERVICES = {
  heal: { icon: '🩹', name: 'Healer', text: '+40 HP for the hero.', price: 18 },
  tea: { icon: '🍵', name: 'Calming Tea', text: '−30 stress and −30 boredom.', price: 18 },
  gear: { icon: '🗡️', name: 'Better Gear', text: '+3 gear. Fights hurt less.', price: 24 },
  cut: { icon: '✂️', name: 'Cut a Card', text: 'Remove one card from your deck.', price: 10 },
} as const;
export type ServiceId = keyof typeof SERVICES;
