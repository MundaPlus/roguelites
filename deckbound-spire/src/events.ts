import { CARDS, canUpgrade, cardPool, getCard } from './cards';
import type { RelicRarity } from './relics';
import type { Rng } from './rng';
import { addCard, removeCard, upgradeCard, type RunState } from './run';
import type { CardInst } from './types';

/** What an event can ask the game to do. The App implements it. */
export interface EventCtx {
  run: RunState;
  rng: Rng;
  pickCard(title: string, filter?: (c: CardInst) => boolean, upgradePreview?: boolean): Promise<CardInst | null>;
  /** Gives a random relic and returns its label. */
  gainRelic(rarity?: RelicRarity): string;
  loseHp(n: number): void;
  heal(n: number): void;
}

export interface EventPage {
  text: string;
  choices: EventChoice[];
}

/** A string ends the event with that text. A page continues it. */
export type EventResult = string | EventPage;

export interface EventChoice {
  label: string;
  desc: string;
  disabled?: boolean;
  run(ctx: EventCtx): EventResult | Promise<EventResult>;
}

export interface EventDef {
  id: string;
  title: string;
  art: string;
  start(ctx: EventCtx): EventPage;
}

const leave = (text = 'You move on.'): EventChoice => ({ label: 'Leave', desc: '', run: () => text });
const label = (c: CardInst) => getCard(c).name;

/** Removes a card the player picks. Returns null when they cancel. */
async function removeOne(ctx: EventCtx, title = 'Choose a card to remove'): Promise<string | null> {
  const c = await ctx.pickCard(title);
  if (!c) return null;
  removeCard(ctx.run, c.uid);
  return label(c);
}

export const NEOW: EventDef = {
  id: 'neow',
  title: 'The Sleeping Whale',
  art: '🐋',
  start: () => ({
    text: 'At the foot of the Spire, a vast whale opens one eye. "Climb, little one. Take a gift for the road."',
    choices: [
      { label: 'Vigor', desc: 'Raise your Max HP by 8.', run: (c) => ((c.run.maxHp += 8), (c.run.hp += 8), 'You feel sturdier.') },
      {
        label: 'Purge',
        desc: 'Remove a card from your deck.',
        run: async (c) => {
          const name = await removeOne(c);
          return name ? `${name} fades from your deck.` : NEOW.start(c);
        },
      },
      { label: 'Trinket', desc: 'Obtain a random common relic.', run: (c) => `You receive ${c.gainRelic('common')}.` },
      { label: 'Fortune', desc: 'Gain 100 gold.', run: (c) => ((c.run.gold += 100), 'Gold spills into your pouch.') },
    ],
  }),
};

export const EVENTS: EventDef[] = [
  {
    id: 'bigFish',
    title: 'The Big Fish',
    art: '🐟',
    start: (ctx) => ({
      text: 'A huge fish floats in a still pool. It holds out three gifts in its fins.',
      choices: [
        {
          label: 'Banana',
          desc: `Heal ${Math.floor(ctx.run.maxHp / 3)} HP.`,
          run: (c) => (c.heal(Math.floor(c.run.maxHp / 3)), 'You eat the banana. You feel much better.'),
        },
        { label: 'Donut', desc: 'Raise your Max HP by 5.', run: (c) => ((c.run.maxHp += 5), (c.run.hp += 5), 'The donut is surprisingly filling.') },
        {
          label: 'Box',
          desc: 'Obtain a random relic. Become Cursed: Regret.',
          run: (c) => {
            const relic = c.gainRelic();
            addCard(c.run, 'regret');
            return `Inside the box you find ${relic}. A heavy regret settles into your deck.`;
          },
        },
      ],
    }),
  },
  {
    id: 'cleric',
    title: 'The Cleric',
    art: '🧑‍⚕️',
    start: (ctx) => ({
      text: 'A cheerful cleric waves at you. "Healing? Purification? Very fair prices!"',
      choices: [
        {
          label: 'Heal',
          desc: `Pay 35 gold. Heal ${Math.floor(ctx.run.maxHp / 4)} HP.`,
          disabled: ctx.run.gold < 35,
          run: (c) => ((c.run.gold -= 35), c.heal(Math.floor(c.run.maxHp / 4)), 'A warm light closes your wounds.'),
        },
        {
          label: 'Purify',
          desc: 'Pay 50 gold. Remove a card from your deck.',
          disabled: ctx.run.gold < 50,
          run: async (c) => {
            const name = await removeOne(c);
            if (!name) return 'You change your mind and leave.';
            c.run.gold -= 50;
            return `The cleric purifies ${name} from your deck.`;
          },
        },
        leave(),
      ],
    }),
  },
  {
    id: 'goldenIdol',
    title: 'Golden Idol',
    art: '🗿',
    start: () => ({
      text: 'A golden idol rests on a stone pedestal. It looks very valuable. It also looks very trapped.',
      choices: [
        {
          label: 'Take',
          desc: 'Gain 175 gold. Trigger a trap.',
          run: (c) => {
            c.run.gold += 175;
            return {
              text: 'You grab the idol. The floor shakes, and a boulder rolls toward you!',
              choices: [
                { label: 'Outrun', desc: 'Become Cursed: Regret.', run: (k) => (addCard(k.run, 'regret'), 'You escape, but the close call haunts you.') },
                { label: 'Smash', desc: 'Take 12 damage.', run: (k) => (k.loseHp(12), 'You smash through the boulder. It hurts.') },
                {
                  label: 'Hide',
                  desc: `Lose ${Math.floor(c.run.maxHp * 0.08)} Max HP.`,
                  run: (k) => {
                    k.run.maxHp -= Math.floor(k.run.maxHp * 0.08);
                    k.run.hp = Math.min(k.run.hp, k.run.maxHp);
                    return 'You squeeze into a crack. The boulder scrapes past and takes a piece of you with it.';
                  },
                },
              ],
            };
          },
        },
        leave('You leave the idol where it is.'),
      ],
    }),
  },
  {
    id: 'livingWall',
    title: 'Living Wall',
    art: '🧱',
    start: (ctx) => ({
      text: 'A wall of faces blocks the corridor. "Forget. Change. Grow," they chant. "Choose, and pass."',
      choices: [
        {
          label: 'Forget',
          desc: 'Remove a card from your deck.',
          run: async (c) => {
            const name = await removeOne(c);
            return name ? `You forget ${name}.` : 'You hesitate, and the wall lets you pass anyway.';
          },
        },
        {
          label: 'Change',
          desc: 'Transform a card into a random card.',
          run: async (c) => {
            const card = await c.pickCard('Choose a card to transform');
            if (!card) return 'You hesitate, and the wall lets you pass anyway.';
            const pool = [...cardPool('common'), ...cardPool('uncommon'), ...cardPool('rare')].filter((id) => id !== card.id);
            const id = c.rng.pick(pool);
            removeCard(c.run, card.uid);
            addCard(c.run, id);
            return `${label(card)} twists into ${CARDS[id].name}.`;
          },
        },
        {
          label: 'Grow',
          desc: 'Upgrade a card.',
          disabled: !ctx.run.deck.some(canUpgrade),
          run: async (c) => {
            const card = await c.pickCard('Choose a card to upgrade', canUpgrade, true);
            if (!card) return 'You hesitate, and the wall lets you pass anyway.';
            upgradeCard(c.run, card.uid);
            return `${CARDS[card.id].name} grows stronger.`;
          },
        },
      ],
    }),
  },
  {
    id: 'scrapOoze',
    title: 'Scrap Ooze',
    art: '🟣',
    start: () => oozePage(3, 25, 'A pile of acidic ooze bubbles in the corner. Something shiny glints inside.'),
  },
  {
    id: 'wheel',
    title: 'Wheel of Change',
    art: '🎡',
    start: () => ({
      text: 'A giant wheel stands in an empty hall. A sign reads: "Spin me. Everyone wins. Sort of."',
      choices: [
        {
          label: 'Spin',
          desc: 'Get a random outcome.',
          run: async (c) => {
            switch (c.rng.int(0, 5)) {
              case 0:
                c.run.gold += 100;
                return 'Gold! The wheel pays out 100 gold.';
              case 1:
                return `The wheel gives you ${c.gainRelic()}.`;
              case 2:
                c.heal(c.run.maxHp);
                return 'A wave of warmth heals you completely.';
              case 3:
                addCard(c.run, 'regret');
                return 'The wheel laughs at you. Become Cursed: Regret.';
              case 4: {
                const name = await removeOne(c, 'The wheel takes a card. Choose it');
                return name ? `The wheel takes ${name}.` : 'The wheel shrugs and stops.';
              }
              default:
                c.loseHp(Math.floor(c.run.maxHp * 0.1));
                return 'A blade swings out of the wheel and cuts you.';
            }
          },
        },
      ],
    }),
  },
  {
    id: 'shrine',
    title: 'Golden Shrine',
    art: '⛩️',
    start: () => ({
      text: 'A small golden shrine glows softly. Coins are scattered at its base.',
      choices: [
        { label: 'Pray', desc: 'Gain 100 gold.', run: (c) => ((c.run.gold += 100), 'Coins rain down from above.') },
        {
          label: 'Desecrate',
          desc: 'Gain 275 gold. Become Cursed: Regret.',
          run: (c) => ((c.run.gold += 275), addCard(c.run, 'regret'), 'You pry the shrine apart. The gold is real. So is the guilt.'),
        },
        leave(),
      ],
    }),
  },
  {
    id: 'duplicator',
    title: 'Duplicator',
    art: '🪞',
    start: () => ({
      text: 'An old mirror shows your deck instead of your face. One card shimmers, as if it wants to step out.',
      choices: [
        {
          label: 'Duplicate',
          desc: 'Copy a card in your deck.',
          run: async (c) => {
            const card = await c.pickCard('Choose a card to duplicate');
            if (!card) return 'You look away from the mirror.';
            addCard(c.run, card.id, card.up);
            return `A second ${label(card)} steps out of the mirror.`;
          },
        },
        leave(),
      ],
    }),
  },
  {
    id: 'vampires',
    title: 'Vampires',
    art: '🧛',
    start: (ctx) => ({
      text: 'Pale figures surround you. "Join us. Trade your old ways for our hunger."',
      choices: [
        {
          label: 'Accept',
          desc: `Remove all Strikes. Add 5 Bites. Lose ${Math.floor(ctx.run.maxHp * 0.3)} Max HP.`,
          run: (c) => {
            c.run.deck = c.run.deck.filter((x) => x.id !== 'strike');
            for (let i = 0; i < 5; i++) addCard(c.run, 'bite');
            c.run.maxHp -= Math.floor(c.run.maxHp * 0.3);
            c.run.hp = Math.min(c.run.hp, c.run.maxHp);
            return 'You feel cold, and very, very hungry.';
          },
        },
        leave('You refuse. The figures fade into the dark.'),
      ],
    }),
  },
];

function oozePage(cost: number, chance: number, text: string): EventPage {
  return {
    text,
    choices: [
      {
        label: 'Reach inside',
        desc: `Lose ${cost} HP. ${chance}% chance to find a relic.`,
        run: (c) => {
          c.loseHp(cost);
          if (c.run.hp <= 0) return 'The ooze burns you one time too many.';
          if (c.rng.chance(chance / 100)) return `You pull out ${c.gainRelic()}!`;
          return oozePage(cost + 1, Math.min(100, chance + 10), 'The acid stings. Nothing yet, but you feel something close.');
        },
      },
      leave(),
    ],
  };
}
