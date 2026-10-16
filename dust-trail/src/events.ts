/**
 * Text events as data. Conditions use the small language in `run.ts` (`cond`):
 * `food<20`, `skill:medic>=2`, `trait:pious`, `flag:map`, `!flag:map`, `terrain:desert`, `weather:storm`,
 * `region>=1`, `danger>=2`, `party>=3`, `sick`, `hurt`, `rivals`, `friends`, `full`, `chain:x`.
 * `{a}` and `{b}` are the event actors, `{s}` is the traveler who uses the skill, `{town}` is the place.
 */
import type { MemberPlan, NodeKind, Skill } from './data';
import type { SceneKind } from './run';

export interface Fx {
  food?: number;
  water?: number;
  parts?: number;
  med?: number;
  money?: number;
  ammo?: number;
  morale?: number;
  wagon?: number;
  hp?: number; // actor a
  hpB?: number; // actor b
  hpAll?: number;
  sick?: boolean | string;
  cure?: boolean;
  recruit?: boolean | MemberPlan;
  leave?: boolean;
  leaveB?: boolean;
  die?: string;
  flag?: string;
  unflag?: string;
  miles?: number;
  days?: number;
  scene?: SceneKind;
  easy?: boolean;
  rel?: number;
  relAll?: number;
  skill?: [Skill, number];
  trait?: string;
}

export interface Outcome {
  w?: number;
  text: string;
  fx?: Fx;
}

export interface Choice {
  label: string;
  req?: string[];
  skill?: Skill;
  min?: number;
  check?: number; // base success chance; +17% per skill level
  ok?: Outcome[];
  fail?: Outcome[];
  out?: Outcome[];
}

export interface EventDef {
  id: string;
  title: string;
  icon: string;
  text: string;
  when?: string[];
  w?: number;
  node?: NodeKind;
  tag?: 'ruins';
  chain?: string;
  repeat?: boolean;
  actor?: string[];
  pair?: 'any' | 'friend' | 'rival';
  choices: Choice[];
}

const go = (text: string, fx?: Fx): Outcome[] => [{ text, fx }];
const ON: Choice = { label: 'Move on', out: go('You roll on.') };

export const EVENTS: EventDef[] = [
  // ---------- Node arrivals ----------
  {
    id: 'node_river',
    title: 'River Crossing',
    icon: '🌊',
    node: 'river',
    repeat: true,
    text: 'The {town} runs fast and brown. You fill every barrel. Now you must get the wagon across.',
    choices: [
      { label: 'Ford the river', out: go('You drive the oxen into the water.', { scene: 'river' }) },
      { label: 'Pay the ferry ($20)', req: ['money>=20'], out: go('The ferryman takes you across on his raft. Slow, dry and safe.', { money: -20 }) },
      { label: 'Wait a day for the water to drop', out: go('The river is lower the next morning.', { days: 1, scene: 'river', easy: true }) },
      {
        label: 'Look for a shallow ford',
        skill: 'scout',
        check: 0.35,
        ok: go('{s} finds a gravel bar. The water barely reaches the axles.', { scene: 'river', easy: true, morale: 3 }),
        fail: go('{s} finds nothing better. You ford where you are.', { scene: 'river' }),
      },
    ],
  },
  {
    id: 'node_hunt',
    title: 'Hunting Grounds',
    icon: '🦌',
    node: 'hunt',
    repeat: true,
    text: 'Tracks cross the trail everywhere. Deer graze at the edge of the trees.',
    choices: [
      { label: 'Go hunting', req: ['ammo>=1'], out: go('You load the rifles and creep into the grass.', { scene: 'hunt' }) },
      {
        label: 'Set snares overnight',
        skill: 'hunt',
        min: 1,
        out: [
          { w: 3, text: '{s} checks the snares at dawn. Rabbits for days.', fx: { days: 1, food: 18 } },
          { w: 1, text: 'Something stole the bait. Only one thin rabbit.', fx: { days: 1, food: 5 } },
        ],
      },
      ON,
    ],
  },
  {
    id: 'node_pass',
    title: 'Bandit Pass',
    icon: '🏴',
    node: 'pass',
    repeat: true,
    text: 'The trail squeezes between high rocks. Fresh hoof prints. A good place for an ambush.',
    choices: [
      { label: 'Drive through, guns ready', out: go('Shots ring out from the rocks!', { scene: 'ambush' }) },
      {
        label: 'Sneak around at night',
        skill: 'scout',
        check: 0.3,
        ok: go('{s} leads the wagon along a goat path in the dark. Nobody sees you.', { morale: 4 }),
        fail: go('A wheel squeaks. Torches flare up on the rocks.', { scene: 'ambush' }),
      },
      {
        label: 'Talk to the lookout',
        skill: 'talk',
        check: 0.25,
        ok: go('{s} swaps stories and tobacco. The gang lets you pass.', { morale: 3 }),
        fail: go('The lookout laughs and fires a shot in the air.', { scene: 'ambush' }),
      },
      { label: 'Pay the toll ($30)', req: ['money>=30'], out: go('A masked man counts your money and waves you on.', { money: -30, morale: -3 }) },
    ],
  },
  {
    id: 'node_spring',
    title: 'Clear Spring',
    icon: '💧',
    node: 'spring',
    repeat: true,
    text: 'Cold water bubbles out of the rocks. You fill every barrel to the top.',
    choices: [
      { label: 'Rest here a day', out: go('Everyone drinks, washes and sleeps in the shade.', { days: 1, hpAll: 2, morale: 8 }) },
      ON,
    ],
  },
  {
    id: 'node_camp',
    title: 'Sheltered Camp',
    icon: '🔥',
    node: 'camp',
    repeat: true,
    text: 'Old fire rings and a windbreak of rocks. Other wagons rested here before you.',
    choices: [
      { label: 'Rest a day', out: go('A long night of sleep by the fire.', { days: 1, hpAll: 2, morale: 6 }) },
      { label: 'Play music by the fire', req: ['trait:musician'], out: go('The fiddle plays until midnight. Even the oxen seem happy.', { morale: 14, relAll: 1 }) },
      { label: 'Fix up the wagon', skill: 'mech', min: 1, out: go('{s} tightens every bolt and greases the axles.', { days: 1, wagon: 30 }) },
      ON,
    ],
  },
  // ---------- Ruins ----------
  {
    id: 'ruin_farm',
    title: 'Burned Farm',
    icon: '🏚️',
    tag: 'ruins',
    text: 'A farmhouse burned to the ground. The door of the root cellar is still shut.',
    choices: [
      {
        label: 'Open the cellar',
        out: [
          { w: 3, text: 'Jars of beans and a smoked ham!', fx: { food: 20 } },
          { w: 1, text: 'A rattlesnake lives in the cellar. It bites {a}.', fx: { hp: -3, food: 5 } },
          { w: 1, text: 'Only rats and broken jars.' },
        ],
      },
      { label: 'Leave the dead in peace', out: go('You say a few words and move on.', { morale: 2 }) },
    ],
  },
  {
    id: 'ruin_fort',
    title: 'Empty Fort',
    icon: '🏰',
    tag: 'ruins',
    text: 'An army fort, empty for years. The gate hangs open.',
    choices: [
      {
        label: 'Search the armory',
        out: [
          { w: 2, text: 'A crate of cartridges, still dry.', fx: { ammo: 15 } },
          { w: 2, text: 'Wagon parts in the old smithy.', fx: { parts: 1, ammo: 5 } },
          { w: 1, text: 'The floor gives way under {a}.', fx: { hp: -2 } },
        ],
      },
      { label: 'Rest inside the walls', out: go('Safe walls for one night.', { days: 1, hpAll: 2, morale: 6 }) },
    ],
  },
  {
    id: 'ruin_mission',
    title: 'Ruined Mission',
    icon: '⛪',
    tag: 'ruins',
    text: 'A mission church with no roof. An old hermit tends a garden among the stones.',
    choices: [
      { label: 'Trade with the hermit', req: ['ammo>=5'], out: go('He swaps vegetables and herbs for cartridges.', { ammo: -5, food: 12, med: 1 }) },
      {
        label: 'Ask him to join you',
        req: ['!full'],
        skill: 'talk',
        check: 0.3,
        ok: go('"One last journey," he says, and climbs on the wagon.', { recruit: { skills: { medic: 2 }, traits: ['pious'] } }),
        fail: go('He shakes his head and goes back to his beans.'),
      },
      { label: 'Pray in the chapel', out: go('The silence calms everyone.', { morale: 8 }) },
    ],
  },
  {
    id: 'ruin_graveyard',
    title: 'Wagon Graveyard',
    icon: '🛞',
    tag: 'ruins',
    text: 'Dozens of broken wagons lie in a dry wash. Some still have their loads.',
    choices: [
      {
        label: 'Salvage parts',
        skill: 'mech',
        check: 0.45,
        ok: go('{s} pulls two good wheels and an axle.', { parts: 2 }),
        fail: go('Most of it is rotten. One usable part.', { parts: 1, days: 1 }),
      },
      {
        label: 'Search the loads',
        out: [
          { w: 2, text: 'Sealed barrels of water and some hardtack.', fx: { water: 15, food: 8 } },
          { w: 1, text: 'A strongbox with a few coins.', fx: { money: 25 } },
          { w: 1, text: 'The wagons held the sick. {a} catches something.', fx: { sick: true } },
        ],
      },
      ON,
    ],
  },
  {
    id: 'ruin_ghosttown',
    title: 'Ghost Town',
    icon: '👻',
    tag: 'ruins',
    text: 'A whole town, empty. Doors bang in the wind. The saloon sign still swings.',
    choices: [
      {
        label: 'Search the saloon',
        out: [
          { w: 2, text: 'Money behind the bar and a bottle of whiskey.', fx: { money: 30, morale: 4 } },
          { w: 1, text: 'Squatters with guns live here!', fx: { scene: 'ambush' } },
        ],
      },
      { label: 'Search the general store', out: go('Canned food, a little moldy.', { food: 15 }) },
      ON,
    ],
  },
  // ---------- Road events ----------
  {
    id: 'snakebite',
    title: 'Snakebite',
    icon: '🐍',
    text: 'A rattlesnake strikes {a} on the ankle.',
    when: ['!terrain:mountain'],
    choices: [
      {
        label: 'Treat the bite',
        skill: 'medic',
        check: 0.45,
        ok: go('{s} cuts and cleans the wound fast. {a} only limps.', { hp: -1 }),
        fail: go('The poison spreads. {a} is burning with fever.', { hp: -3, sick: 'snake fever' }),
      },
      { label: 'Use medicine', req: ['med>=1'], out: go('The tonic does its work.', { med: -1, hp: -1 }) },
      {
        label: 'Suck out the poison',
        out: [
          { w: 2, text: 'It hurts, but {a} pulls through.', fx: { hp: -3 } },
          { w: 1, text: 'Not fast enough. {a} grows weak and feverish.', fx: { hp: -3, sick: 'snake fever' } },
        ],
      },
    ],
  },
  {
    id: 'cracked_wheel',
    title: 'Cracked Wheel',
    icon: '🛞',
    text: 'A wheel hits a hidden rock with a loud crack.',
    when: ['wagon<70'],
    choices: [
      { label: 'Use a spare part', req: ['parts>=1'], out: go('A new wheel in an hour.', { parts: -1, wagon: 35 }) },
      {
        label: 'Patch it',
        skill: 'mech',
        check: 0.4,
        ok: go('{s} binds the wheel with rawhide. It holds.', { wagon: 15 }),
        fail: go('The patch breaks twice. You lose a day.', { days: 1, wagon: -5 }),
      },
      { label: 'Push on carefully', out: go('The wheel wobbles with every turn.', { wagon: -15 }) },
    ],
  },
  {
    id: 'stranger',
    title: 'Man by the Trail',
    icon: '🧍',
    text: 'A man lies by the trail next to his dead horse. His lips are cracked.',
    when: ['!full'],
    choices: [
      {
        label: 'Give him food and water',
        req: ['food>=5', 'water>=5'],
        out: [
          { w: 2, text: 'He thanks you and asks to ride along. He knows guns.', fx: { food: -5, water: -5, recruit: { skills: { fight: 2 }, traits: [] } } },
          { w: 1, text: 'He presses a pouch of coins into your hand and walks off.', fx: { food: -5, water: -5, money: 35 } },
          { w: 1, text: 'In the morning he is gone, with your ammo.', fx: { food: -5, water: -5, ammo: -10 } },
        ],
      },
      { label: 'Ride on', out: go('Nobody talks for the rest of the day.', { morale: -4 }) },
    ],
  },
  {
    id: 'lost_trail',
    title: 'Lost Trail',
    icon: '❓',
    text: 'The ruts split in a dozen directions. Which one is the trail?',
    choices: [
      {
        label: 'Read the land',
        skill: 'scout',
        check: 0.4,
        ok: go('{s} finds a short cut along a dry creek.', { miles: -12 }),
        fail: go('{s} leads you in a big circle.', { miles: 15 }),
      },
      {
        label: 'Take the widest ruts',
        out: [
          { w: 1, text: 'Lucky guess.', fx: { miles: -5 } },
          { w: 2, text: 'A dead end at a canyon. You turn back.', fx: { miles: 20 } },
        ],
      },
    ],
  },
  {
    id: 'buffalo',
    title: 'Buffalo Herd',
    icon: '🦬',
    text: 'A herd of buffalo blocks the trail from one horizon to the other.',
    when: ['terrain:prairie'],
    choices: [
      { label: 'Hunt', req: ['ammo>=1'], out: go('You crawl into the grass with your rifles.', { scene: 'hunt' }) },
      { label: 'Wait for them to pass', out: go('It takes all day.', { days: 1 }) },
      {
        label: 'Drive through the herd',
        out: [
          { w: 2, text: 'The wagon bumps through the herd.', fx: { wagon: -12 } },
          { w: 1, text: 'A bull rams the wagon. {a} is thrown off.', fx: { wagon: -15, hp: -3 } },
        ],
      },
    ],
  },
  {
    id: 'dust_storm',
    title: 'Dust Storm',
    icon: '🌪️',
    text: 'A brown wall of dust rolls toward you.',
    when: ['region=1'],
    choices: [
      { label: 'Shelter behind the wagon', out: go('You wait it out with wet cloths on your faces.', { days: 1, water: -4 }) },
      {
        label: 'Push on through',
        out: [
          { w: 1, text: 'Sand in every eye and every barrel.', fx: { hpAll: -1, water: -6 } },
          { w: 1, text: 'You lose the trail in the dust.', fx: { miles: 10, hpAll: -1 } },
        ],
      },
    ],
  },
  {
    id: 'spooked_oxen',
    title: 'Spooked Oxen',
    icon: '🐂',
    text: 'Thunder cracks. The oxen bolt and drag the wagon off the trail.',
    when: ['!region=1'],
    choices: [
      {
        label: 'Chase them down',
        skill: 'hunt',
        check: 0.45,
        ok: go('{s} lassos the lead ox. Nothing lost.'),
        fail: go('By the time you catch them, a barrel has split.', { water: -10, wagon: -10 }),
      },
      { label: 'Let them tire out', out: go('You find them grazing a mile off. A day lost.', { days: 1 }) },
    ],
  },
  {
    id: 'quarrel',
    title: 'Quarrel',
    icon: '😤',
    pair: 'rival',
    text: '{a} and {b} start shouting over who drank the last of the coffee.',
    choices: [
      {
        label: 'Calm them down',
        skill: 'talk',
        check: 0.4,
        ok: go('{s} makes them laugh about it. They shake hands.', { rel: 2, morale: 3 }),
        fail: go('Now they are both angry at {s} too.', { rel: -1, morale: -4 }),
      },
      {
        label: 'Let them fight it out',
        out: [
          { w: 1, text: 'Bloody noses, then a grudging respect.', fx: { hp: -2, hpB: -2, rel: 2 } },
          { w: 1, text: 'It gets ugly. {b} swears to never forgive {a}.', fx: { hp: -2, hpB: -2, rel: -2, morale: -5 } },
        ],
      },
      { label: 'Side with {a}', out: go('{a} grins. {b} sulks all day.', { rel: -1, morale: -2 }) },
    ],
  },
  {
    id: 'rival_walks',
    title: 'Last Straw',
    icon: '🚶',
    pair: 'rival',
    when: ['morale<45', 'party>=3'],
    text: '{b} packs a bag. "I will not ride one more mile with {a}."',
    choices: [
      {
        label: 'Make peace',
        skill: 'talk',
        check: 0.3,
        ok: go('{s} gets them to talk all night. {b} stays.', { rel: 2 }),
        fail: go('{b} walks off into the dusk.', { leaveB: true }),
      },
      { label: 'Let {b} go', out: go('{b} takes a share of food and leaves.', { leaveB: true, food: -8, morale: 3 }) },
      { label: 'Ask {a} to apologize', out: go('{a} mumbles sorry. It is enough, for now.', { rel: 1, morale: -2 }) },
    ],
  },
  {
    id: 'campfire_song',
    title: 'Campfire Song',
    icon: '🎶',
    pair: 'friend',
    text: '{a} and {b} sing old songs by the fire.',
    choices: [{ label: 'Join in', out: go('Everyone sleeps well tonight.', { morale: 8, relAll: 1 }) }],
  },
  {
    id: 'cholera_camp',
    title: 'Yellow Flag',
    icon: '🚩',
    text: 'A wagon train camps by the trail under a yellow flag: cholera.',
    choices: [
      {
        label: 'Help the sick',
        skill: 'medic',
        check: 0.4,
        ok: go('{s} saves two children. Their father pays what he can.', { money: 30, morale: 8 }),
        fail: go('{a} catches the sickness.', { sick: 'cholera', morale: 3 }),
      },
      { label: 'Leave them medicine', req: ['med>=1'], out: go('They bless you as you leave.', { med: -1, morale: 6 }) },
      { label: 'Go wide around them', out: go('A long detour through rough ground.', { miles: 10 }) },
    ],
  },
  {
    id: 'peddler',
    title: 'Peddler',
    icon: '🫏',
    text: 'A peddler with an overloaded mule waves you down.',
    choices: [
      { label: 'Trade 10 ammo for 15 food', req: ['ammo>=10'], out: go('Fair trade.', { ammo: -10, food: 15 }) },
      { label: 'Buy medicine ($15)', req: ['money>=15'], out: go('A brown bottle of tonic.', { money: -15, med: 1 }) },
      {
        label: 'Haggle for a bundle',
        skill: 'talk',
        check: 0.35,
        req: ['money>=10'],
        ok: go('{s} talks him into a real bargain.', { money: -10, med: 1, parts: 1 }),
        fail: go('He gets annoyed and sells you only beans.', { money: -10, food: 8 }),
      },
      ON,
    ],
  },
  {
    id: 'guides',
    title: 'Riders',
    icon: '🐎',
    text: 'Native riders offer to show you a short cut, for a share of your goods.',
    choices: [
      { label: 'Pay with food (10)', req: ['food>=10'], out: go('They lead you over a hidden pass.', { food: -10, miles: -25 }) },
      {
        label: 'Talk and trade stories',
        skill: 'talk',
        check: 0.35,
        ok: go('{s} makes friends. They show you the path and a spring.', { miles: -25, water: 15 }),
        fail: go('They lose interest and ride off.'),
      },
      { label: 'Decline', out: go('They nod and ride on.') },
    ],
  },
  {
    id: 'abandoned_wagon',
    title: 'Abandoned Wagon',
    icon: '🛒',
    text: 'A wagon sits by the trail, its oxen long gone.',
    choices: [
      {
        label: 'Search it',
        out: [
          { w: 2, text: 'Sacks of flour, only a little wet.', fx: { food: 15 } },
          { w: 2, text: 'A good spare wheel.', fx: { parts: 1 } },
          { w: 1, text: 'A box of cartridges.', fx: { ammo: 12 } },
          { w: 1, text: 'The owners died of fever inside. {a} gets sick.', fx: { sick: true } },
        ],
      },
      ON,
    ],
  },
  {
    id: 'wolves',
    title: 'Wolves',
    icon: '🐺',
    text: 'Yellow eyes circle the camp at night.',
    choices: [
      {
        label: 'Shoot them',
        skill: 'fight',
        check: 0.4,
        req: ['ammo>=3'],
        ok: go('{s} drops two. Wolf meat is tough but filling.', { ammo: -3, food: 8 }),
        fail: go('They get into the food sacks. {a} is bitten.', { ammo: -3, food: -10, hp: -2 }),
      },
      { label: 'Build the fire high', out: go('You burn a spare plank, but the wolves keep away.', { wagon: -6 }) },
      { label: 'Throw them some meat', req: ['food>=8'], out: go('They take it and slink away.', { food: -8 }) },
    ],
  },
  {
    id: 'thief',
    title: 'Night Thief',
    icon: '🦝',
    text: 'In the morning a sack of flour is gone. Footprints lead into the brush.',
    when: ['food>=10'],
    choices: [
      {
        label: 'Track the thief',
        skill: 'scout',
        check: 0.4,
        ok: go('{s} finds a starving boy with your flour. He begs to come along.', { recruit: { skills: { scout: 1 }, traits: ['light'] } }),
        fail: go('The tracks vanish on the rocks.', { food: -10, days: 1 }),
      },
      { label: 'Let it go', out: go('Someone needed it more.', { food: -10, morale: -2 }) },
    ],
  },
  {
    id: 'fever',
    title: 'Fever',
    icon: '🤒',
    actor: ['!sick'],
    text: '{a} wakes up shivering and burning hot.',
    choices: [
      { label: 'Give medicine', req: ['med>=1'], out: go('The fever breaks by noon.', { med: -1 }) },
      {
        label: 'Nurse {a}',
        skill: 'medic',
        check: 0.5,
        ok: go('{s} keeps {a} cool all night. The fever passes.'),
        fail: go('The fever grows worse.', { sick: 'fever', hp: -1 }),
      },
      {
        label: 'Rest a day',
        out: [
          { w: 1, text: 'A day in the shade helps.', fx: { days: 1 } },
          { w: 1, text: 'Resting does not help.', fx: { days: 1, sick: 'fever' } },
        ],
      },
    ],
  },
  {
    id: 'berries',
    title: 'Berry Bushes',
    icon: '🫐',
    text: 'Bushes heavy with dark berries line the creek.',
    when: ['terrain:forest'],
    choices: [
      {
        label: 'Pick them all',
        out: [
          { w: 3, text: 'Sweet and good.', fx: { food: 10, morale: 3 } },
          { w: 1, text: 'Some were not berries. {a} is sick all night.', fx: { food: 6, sick: 'a bad stomach' } },
        ],
      },
      { label: 'Pick the safe ones', skill: 'hunt', min: 1, out: go('{s} knows which ones. Baskets full.', { food: 14, morale: 3 }) },
      ON,
    ],
  },
  {
    id: 'mirage',
    title: 'Shimmering Water',
    icon: '🏝️',
    text: 'A lake shimmers off the trail. Or is it the heat?',
    when: ['terrain:desert'],
    choices: [
      {
        label: 'Check it out',
        skill: 'scout',
        check: 0.35,
        ok: go('{s} finds a real water hole behind the mirage.', { water: 20 }),
        fail: go('Only hot sand. The detour costs water.', { water: -6, miles: 10 }),
      },
      { label: 'Stay on the trail', out: go('Probably a mirage.') },
    ],
  },
  {
    id: 'rockslide',
    title: 'Rockslide',
    icon: '🪨',
    text: 'Rocks crash down across the trail ahead.',
    when: ['terrain:mountain'],
    choices: [
      { label: 'Clear the rocks', out: go('Hard work all day. {a} hurts a back.', { days: 1, hp: -1 }) },
      { label: 'Find a way around', out: go('A long detour over the ridge.', { miles: 15, wagon: -5 }) },
      { label: 'Pry them loose', req: ['trait:strong'], out: go('Your strongest arms roll the boulders off the edge.', { morale: 4 }) },
    ],
  },
  {
    id: 'frostbite',
    title: 'Frostbite',
    icon: '🥶',
    text: "{a}'s toes are white and numb after a freezing night.",
    when: ['region=2'],
    choices: [
      { label: 'Use medicine', req: ['med>=1'], out: go('Warm salve and wrappings.', { med: -1 }) },
      { label: 'Burn wagon boards for a fire', out: go('The warmth saves the toes.', { wagon: -10 }) },
      { label: 'Walk it off', out: go('{a} limps for a week.', { hp: -3 }) },
    ],
  },
  {
    id: 'nugget',
    title: 'Shiny Rock',
    icon: '🪙',
    text: '{a} spots something shiny in a creek bed.',
    choices: [
      { label: 'Pocket it', out: go('A small gold nugget!', { money: 20 }) },
      {
        label: 'Pan for more',
        out: [
          { w: 1, text: 'A day of panning pays off.', fx: { days: 1, money: 45 } },
          { w: 2, text: 'A day of cold feet and nothing else.', fx: { days: 1, money: 5 } },
        ],
      },
    ],
  },
  {
    id: 'graves',
    title: 'Fresh Graves',
    icon: '🪦',
    text: 'A row of fresh graves by the trail. Some are very small.',
    choices: [
      { label: 'Say a prayer', req: ['trait:pious'], out: go('The prayer gives everyone strength.', { morale: 5 }) },
      { label: 'Keep your eyes on the road', out: go('Nobody talks for a while.', { morale: -5 }) },
    ],
  },
  {
    id: 'homesick',
    title: 'Homesick',
    icon: '🏠',
    actor: ['leaver'],
    when: ['morale<60', 'party>=2'],
    text: '{a} stares east all evening. "Maybe we should turn back."',
    choices: [
      {
        label: 'Give a speech',
        skill: 'talk',
        check: 0.45,
        ok: go('{s} talks about the green valley ahead. {a} wipes their eyes and stays.', { morale: 8 }),
        fail: go('{a} leaves at dawn.', { leave: true }),
      },
      { label: 'Extra rations tonight', req: ['food>=10'], out: go('A full belly helps.', { food: -10, morale: 6 }) },
      { label: 'Let {a} go', out: go('{a} takes a canteen and walks east.', { leave: true, water: -3 }) },
    ],
  },
  {
    id: 'fine_day',
    title: 'Fine Day',
    icon: '🌤️',
    text: 'Cool wind, blue sky, birds in the grass. The oxen walk faster.',
    choices: [{ label: 'Enjoy it', out: go('A perfect day on the trail.', { morale: 6, miles: -6 }) }],
  },
  {
    id: 'wheel_trade',
    title: 'Wheel Trade',
    icon: '🔄',
    text: 'A family has spare wheels but a sick baby.',
    choices: [
      { label: 'Trade 1 medicine for 2 parts', req: ['med>=1'], out: go('The mother hugs you.', { med: -1, parts: 2, morale: 4 }) },
      { label: 'Buy a part ($15)', req: ['money>=15'], out: go('Done.', { money: -15, parts: 1 }) },
      ON,
    ],
  },
  {
    id: 'riders_ridge',
    title: 'Riders on the Ridge',
    icon: '🏴',
    when: ['danger>=2'],
    w: 2,
    text: 'Six riders watch from the ridge, rifles across their saddles.',
    choices: [
      { label: 'Circle the wagon', out: go('They come down shooting!', { scene: 'ambush' }) },
      {
        label: 'Whip the oxen and run',
        out: [
          { w: 1, text: 'You outrun them, but the wagon takes a beating.', fx: { wagon: -20, miles: -10 } },
          { w: 1, text: 'They catch up!', fx: { scene: 'ambush', wagon: -10 } },
        ],
      },
      { label: 'Offer them food (15)', req: ['food>=15'], out: go('They take the sacks and ride off laughing.', { food: -15 }) },
    ],
  },
  {
    id: 'trailing_riders',
    title: 'Followed',
    icon: '👀',
    when: ['danger>=1'],
    text: 'Two riders have trailed you for a day.',
    choices: [
      {
        label: 'Confront them',
        skill: 'fight',
        check: 0.35,
        ok: go('{s} fires a warning shot. They drop their loot and flee.', { money: 15, ammo: 5 }),
        fail: go('They call their friends.', { scene: 'ambush' }),
      },
      { label: 'Keep watch at night', out: go('Nobody sleeps much. They lose interest.', { morale: -4 }) },
    ],
  },
  {
    id: 'hail',
    title: 'Hailstorm',
    icon: '🧊',
    text: 'Hail as big as eggs pounds the wagon cover.',
    when: ['!terrain:desert'],
    choices: [
      { label: 'Hide under the wagon', out: go('Everyone is fine. The cover is torn.', { wagon: -8 }) },
      { label: 'Run for the trees', out: go('{a} gets hit on the head.', { hp: -2 }) },
    ],
  },
  {
    id: 'map_seller',
    title: 'Map Seller',
    icon: '🗺️',
    text: 'A man in a fine coat sells a map with a "secret short cut".',
    choices: [
      {
        label: 'Buy it ($15)',
        req: ['money>=15'],
        out: [
          { w: 2, text: 'The short cut is real!', fx: { money: -15, miles: -25 } },
          { w: 1, text: 'The short cut ends at a cliff.', fx: { money: -15, miles: 15 } },
        ],
      },
      {
        label: 'Look closely at it',
        skill: 'scout',
        check: 0.5,
        ok: go('{s} memorizes the route while you pretend to think.', { miles: -20 }),
        fail: go('It looks like nonsense to {s}.'),
      },
      { label: 'No thanks', out: go('He tips his hat.') },
    ],
  },
  {
    id: 'lame_ox',
    title: 'Lame Ox',
    icon: '🐂',
    text: 'One of the oxen limps badly.',
    choices: [
      { label: 'Rest it for a day', out: go('The ox can walk again.', { days: 1 }) },
      { label: 'Push on', out: go('The other oxen pull harder. The wagon strains.', { wagon: -15 }) },
      { label: 'Butcher it', out: go('Fresh meat tonight, but the wagon is slower now.', { food: 30, miles: 15, morale: -3 }) },
    ],
  },
  {
    id: 'flash_flood',
    title: 'Flash Flood',
    icon: '🌊',
    text: 'Rain in the hills. The dry wash ahead fills with water.',
    when: ['weather:rain'],
    choices: [
      { label: 'Wait on high ground', out: go('The water drops by morning.', { days: 1 }) },
      {
        label: 'Cross fast',
        out: [
          { w: 1, text: 'Just in time.', fx: { wagon: -8 } },
          { w: 1, text: 'The water takes a barrel and knocks {a} over.', fx: { wagon: -12, water: -8, hp: -3 } },
        ],
      },
    ],
  },
  {
    id: 'toothache',
    title: 'Toothache',
    icon: '🦷',
    text: "{a}'s jaw is swollen from a rotten tooth.",
    choices: [
      {
        label: 'Pull it',
        skill: 'medic',
        check: 0.5,
        ok: go('Out in one pull. {a} feels better at once.', { hp: 1 }),
        fail: go('It breaks. Now it is worse.', { hp: -2, sick: 'an infection' }),
      },
      { label: 'Whiskey and patience', out: go('{a} is miserable for days.', { morale: -3 }) },
    ],
  },
  {
    id: 'lessons',
    title: 'Lessons',
    icon: '📚',
    pair: 'any',
    text: '{b} offers to teach {a} to shoot properly.',
    choices: [
      { label: 'Practice for a day', req: ['ammo>=5'], out: go('{a} gets the hang of it.', { days: 1, ammo: -5, skill: ['fight', 1], rel: 1 }) },
      { label: 'Practice tracking instead', out: go('{a} learns to read tracks.', { days: 1, skill: ['hunt', 1], rel: 1 }) },
      { label: 'No time', out: go('Maybe later.') },
    ],
  },
  {
    id: 'fiddle',
    title: 'Fiddle Night',
    icon: '🎻',
    actor: ['trait:musician'],
    text: '{a} takes out the fiddle after supper.',
    choices: [{ label: 'Dance!', out: go('Even the grumpy ones dance.', { morale: 12, relAll: 1 }) }],
  },
  {
    id: 'greedy',
    title: 'Light Purse',
    icon: '💰',
    actor: ['trait:greedy'],
    when: ['money>=20', 'party>=2'],
    text: 'The money box feels light. {a} has new boots.',
    choices: [
      {
        label: 'Confront {a}',
        skill: 'talk',
        check: 0.4,
        ok: go('{a} hands most of it back, red in the face.', { money: 10, morale: 2 }),
        fail: go('{a} storms off into the night with the money.', { leave: true, money: -20 }),
      },
      { label: 'Say nothing', out: go('The money is gone.', { money: -15 }) },
    ],
  },
  {
    id: 'dark_rider',
    title: 'Rider in Black',
    icon: '🕵️',
    text: 'A rider in black asks to share your fire.',
    choices: [
      {
        label: 'Welcome him',
        out: [
          { w: 2, text: 'He tells you of a faster trail.', fx: { miles: -15, morale: 3 } },
          { w: 1, text: 'He leaves before dawn with a box of ammo.', fx: { ammo: -12 } },
        ],
      },
      { label: 'Send him away', out: go('He shrugs and rides on.') },
    ],
  },
  {
    id: 'hot_springs',
    title: 'Hot Springs',
    icon: '♨️',
    text: 'Steam rises from pools of warm water.',
    when: ['terrain:mountain'],
    choices: [
      { label: 'Soak for a day', out: go('Aches melt away.', { days: 1, hpAll: 2, morale: 10, cure: true }) },
      ON,
    ],
  },
  {
    id: 'patrol',
    title: 'Cavalry Patrol',
    icon: '🎖️',
    text: 'A cavalry patrol stops to check on you.',
    choices: [
      {
        label: 'Ask for supplies',
        skill: 'talk',
        check: 0.4,
        ok: go('{s} charms the captain. He spares some cartridges and a medicine kit.', { ammo: 15, med: 1 }),
        fail: go('"Army supplies are for the army."'),
      },
      { label: 'Ask about the trail', out: go('They warn you of a bad stretch. You avoid it.', { miles: -8 }) },
    ],
  },
  {
    id: 'omen',
    title: 'Dark Noon',
    icon: '🌑',
    text: 'At noon the sun goes dark. The oxen bellow. Someone screams.',
    choices: [
      { label: 'Lead a prayer', req: ['trait:pious'], out: go('The sun comes back. Faith holds.', { morale: 6 }) },
      { label: 'Explain the eclipse', skill: 'scout', min: 2, out: go('{s} explains the moon and the sun. People calm down.', { morale: 2 }) },
      { label: 'Wait it out', out: go('It passes, but people are shaken.', { morale: -7 }) },
    ],
  },
  {
    id: 'hungry_family',
    title: 'Hungry Family',
    icon: '👪',
    when: ['food>=30'],
    text: 'A family with empty plates watches you eat.',
    choices: [
      {
        label: 'Share 15 food',
        out: [
          { w: 2, text: 'They thank you with tears.', fx: { food: -15, morale: 10 } },
          { w: 1, text: 'Their oldest son joins you to repay the debt.', fx: { food: -15, morale: 6, recruit: { skills: { mech: 1, hunt: 1 }, traits: ['loyal'] } } },
        ],
      },
      { label: 'Look away', out: go('Supper tastes of guilt.', { morale: -6 }) },
    ],
  },
  {
    id: 'scorpion',
    title: 'Scorpion',
    icon: '🦂',
    when: ['terrain:desert'],
    text: 'A scorpion hides in the boot of {a}.',
    choices: [
      { label: 'Use medicine', req: ['med>=1'], out: go('Just a swollen foot.', { med: -1, hp: -1 }) },
      {
        label: 'Treat the sting',
        skill: 'medic',
        check: 0.5,
        ok: go('{s} draws the poison.', { hp: -1 }),
        fail: go('{a} is sick for days.', { hp: -3, sick: 'scorpion poison' }),
      },
      { label: 'Tough it out', out: go('{a} shakes for a day.', { hp: -3 }) },
    ],
  },
  {
    id: 'water_smell',
    title: 'Dry Barrels',
    icon: '🏜️',
    when: ['water<12'],
    w: 2,
    text: 'The barrels are almost dry. The oxen sniff the wind.',
    choices: [
      {
        label: 'Follow the oxen',
        skill: 'scout',
        check: 0.45,
        ok: go('{s} follows them to a hidden seep.', { water: 25 }),
        fail: go('A muddy hole. Barely a few cups.', { water: 6, days: 1 }),
      },
      { label: 'Dig in the dry creek', out: go('Muddy, but it is water.', { water: 10, days: 1 }) },
    ],
  },
  {
    id: 'hunger',
    title: 'Empty Sacks',
    icon: '🍽️',
    when: ['food<15'],
    w: 2,
    text: 'The food sacks are nearly empty. Everyone is quiet at supper.',
    choices: [
      { label: 'Go hunting', req: ['ammo>=1'], out: go('Desperate times. You load the rifles.', { scene: 'hunt' }) },
      { label: 'Eat the seed corn', out: go('The future can wait. Today you eat.', { food: 15, morale: -8 }) },
      { label: 'Forage', skill: 'hunt', min: 1, out: go('{s} finds roots and birds eggs.', { food: 10, days: 1 }) },
    ],
  },
  {
    id: 'lost_child',
    title: 'Lost Kid',
    icon: '🧒',
    when: ['!full'],
    text: 'A kid sits alone on a rock. Their wagon left without them.',
    choices: [
      { label: 'Take the kid along', out: go('The kid is quick and has sharp eyes.', { food: -5, recruit: { skills: { scout: 1 }, traits: ['cheerful'] } }) },
      { label: 'Point the way and give food', req: ['food>=5'], out: go('The kid runs after the dust cloud.', { food: -5, morale: 3 }) },
    ],
  },
  {
    id: 'broken_axle',
    title: 'Broken Axle',
    icon: '🪓',
    when: ['wagon<40'],
    w: 2,
    text: 'With a loud crack the rear axle splits.',
    choices: [
      { label: 'Use a spare part', req: ['parts>=1'], out: go('A new axle by sundown.', { parts: -1, wagon: 30 }) },
      {
        label: 'Carve a new one',
        skill: 'mech',
        check: 0.4,
        ok: go('{s} carves an axle from a cottonwood log.', { days: 1, wagon: 25 }),
        fail: go('It cracks on the first hill.', { days: 2, wagon: 5 }),
      },
      { label: 'Lash it together', out: go('It holds, barely.', { wagon: -10, days: 1 }) },
    ],
  },
  {
    id: 'brave_scout',
    title: 'Night Noises',
    icon: '🌙',
    actor: ['trait:brave'],
    text: 'Something moves around the wagon at night. {a} grabs a lantern.',
    choices: [
      {
        label: 'Go with {a}',
        out: [
          { w: 2, text: 'Just a lost mule, still carrying a pack!', fx: { food: 10, ammo: 6 } },
          { w: 1, text: 'A bear! {a} drives it off but gets clawed.', fx: { hp: -3, morale: 4 } },
        ],
      },
      { label: 'Stay in the wagon', out: go('In the morning some food is missing.', { food: -6 }) },
    ],
  },
  {
    id: 'good_hunt_chance',
    title: 'Antelope',
    icon: '🦌',
    when: ['ammo>=1', '!terrain:desert'],
    text: 'A herd of antelope grazes close to the trail.',
    choices: [
      { label: 'Hunt', out: go('You slide off the wagon with the rifles.', { scene: 'hunt' }) },
      ON,
    ],
  },
  {
    id: 'sickness_spread',
    title: 'Sickness Spreads',
    icon: '🦠',
    when: ['sick', 'party>=3'],
    actor: ['!sick'],
    text: 'The sickness in the wagon spreads. {a} feels hot.',
    choices: [
      { label: 'Give medicine', req: ['med>=1'], out: go('Caught it early.', { med: -1 }) },
      { label: 'Separate the sick', skill: 'medic', min: 1, out: go('{s} sets up a sick tent. It works.', { days: 1 }) },
      { label: 'Hope for the best', out: go('{a} is sick now too.', { sick: true }) },
    ],
  },
  // ---------- Chain: the Prospector ----------
  {
    id: 'pros_map',
    title: 'Dying Prospector',
    icon: '⛏️',
    chain: 'prospector',
    when: ['!flag:pmap'],
    text: 'An old prospector lies in the shade, coughing. He presses a map into the hand of {a}.',
    choices: [
      { label: 'Take the map', out: go('"The canyon... gold..." He closes his eyes.', { flag: 'pmap', morale: -3 }) },
      {
        label: 'Try to save him',
        skill: 'medic',
        check: 0.3,
        ok: go('He lives! "Call me Gus. I will show you the canyon myself."', { flag: 'pmap', recruit: { skills: { scout: 2 }, traits: ['greedy'] } }),
        fail: go('He dies in the night. You keep his map.', { flag: 'pmap', morale: -4 }),
      },
    ],
  },
  {
    id: 'pros_canyon',
    title: 'The Marked Canyon',
    icon: '🏜️',
    chain: 'prospector',
    when: ['flag:pmap', '!flag:pgold', 'row>=4'],
    w: 3,
    text: 'The canyon from the map lies just off the trail.',
    choices: [
      {
        label: 'Dig where the X is',
        out: [
          { w: 2, text: 'Two days of digging. A sack of gold dust!', fx: { days: 2, money: 80, flag: 'pgold' } },
          { w: 1, text: 'Somebody dug here first. A few flakes.', fx: { days: 2, money: 15, unflag: 'pmap' } },
        ],
      },
      {
        label: 'Read the old marks',
        skill: 'scout',
        check: 0.4,
        ok: go('{s} finds the real spot in one day.', { days: 1, money: 90, flag: 'pgold' }),
        fail: go('{s} gets lost in the side canyons.', { days: 2, money: 10, unflag: 'pmap' }),
      },
      { label: 'Gold is trouble. Move on', out: go('You leave the map on a rock.', { unflag: 'pmap' }) },
    ],
  },
  {
    id: 'pros_jumpers',
    title: 'Claim Jumpers',
    icon: '🔫',
    chain: 'prospector',
    when: ['flag:pgold'],
    w: 3,
    text: 'Riders block the trail. "We hear you found gold. Hand it over."',
    choices: [
      { label: 'Fight', out: go('Guns out!', { scene: 'ambush', unflag: 'pgold' }) },
      { label: 'Pay them ($40)', req: ['money>=40'], out: go('They take the money and leave.', { money: -40, unflag: 'pgold' }) },
      {
        label: 'Bluff',
        skill: 'talk',
        check: 0.35,
        ok: go('{s} swears the gold was fool\'s gold. They ride off cursing.', { unflag: 'pgold', morale: 5 }),
        fail: go('They do not buy it.', { scene: 'ambush', unflag: 'pgold' }),
      },
    ],
  },
  // ---------- Chain: the Rival Wagon ----------
  {
    id: 'rival_meet',
    title: 'The Rival Wagon',
    icon: '🏁',
    chain: 'rival',
    when: ['!flag:rival'],
    text: 'A shiny wagon passes you. Its owner tips his hat: "See you in the valley, slowpokes!"',
    choices: [
      { label: 'Race them', out: go('You whip the oxen. Dust everywhere.', { flag: 'rival', miles: -15, wagon: -10, morale: 5 }) },
      { label: 'Wave and smile', out: go('He seems surprised.', { flag: 'rival,rival_nice' }) },
    ],
  },
  {
    id: 'rival_stuck',
    title: 'Stuck in the Mud',
    icon: '🟫',
    chain: 'rival',
    when: ['flag:rival', '!flag:rival_done', 'row>=3'],
    w: 3,
    text: 'The rival wagon is stuck up to the axles in mud.',
    choices: [
      { label: 'Help them out', out: go('It takes all day. He shakes your hand.', { days: 1, flag: 'rival_done,rival_friend', morale: 4 }) },
      { label: 'Take their spare wheels', out: go('You leave them shouting in the mud.', { parts: 2, flag: 'rival_done,rival_enemy', morale: -3 }) },
      { label: 'Drive past', out: go('You win the race, for now.', { miles: -10, flag: 'rival_done' }) },
    ],
  },
  {
    id: 'rival_gift',
    title: 'Old Friends',
    icon: '🤝',
    chain: 'rival',
    when: ['flag:rival_friend', 'row>=6'],
    w: 3,
    text: 'The rival family camps next to you. "We owe you."',
    choices: [{ label: 'Accept their gifts', out: go('Food, water and medicine.', { food: 20, water: 15, med: 2, flag: 'rival_end', unflag: 'rival_friend' }) }],
  },
  {
    id: 'rival_revenge',
    title: 'Revenge',
    icon: '😡',
    chain: 'rival',
    when: ['flag:rival_enemy', 'row>=6'],
    w: 3,
    text: 'The rival wagon is back, with hired guns. "Time to pay for those wheels."',
    choices: [
      { label: 'Fight', out: go('Here they come!', { scene: 'ambush', unflag: 'rival_enemy' }) },
      { label: 'Pay them back ($35)', req: ['money>=35'], out: go('Debts settled.', { money: -35, unflag: 'rival_enemy' }) },
    ],
  },
  // ---------- Chain: the Preacher ----------
  {
    id: 'preach_meet',
    title: 'The Preacher',
    icon: '📖',
    chain: 'preacher',
    when: ['!flag:preacher'],
    text: 'A thin preacher walks the trail alone, a bible under his arm.',
    choices: [
      { label: 'Give him a ride', req: ['food>=5'], out: go('He blesses the wagon and every ox.', { flag: 'preacher', food: -5, morale: 6 }) },
      { label: 'Hear a sermon', out: go('Strong words about the promised land.', { morale: 4, flag: 'preacher' }) },
      { label: 'Ride past', out: go('He waves anyway.') },
    ],
  },
  {
    id: 'preach_revival',
    title: 'Revival Tent',
    icon: '⛺',
    chain: 'preacher',
    when: ['flag:preacher', '!flag:preach2', 'row>=3'],
    w: 3,
    text: 'The preacher holds a revival in a big tent by the trail.',
    choices: [
      { label: 'Join for a day', out: go('Singing, food and hope.', { days: 1, hpAll: 1, morale: 15, relAll: 1, flag: 'preach2' }) },
      { label: 'Give $15 to the poor', req: ['money>=15', '!full'], out: go('A young follower asks to join you.', { money: -15, recruit: { skills: { medic: 1, talk: 1 }, traits: ['pious'] }, flag: 'preach2' }) },
      { label: 'Keep moving', out: go('The singing fades behind you.', { flag: 'preach2' }) },
    ],
  },
  {
    id: 'preach_flock',
    title: 'The Thirsty Flock',
    icon: '🐑',
    chain: 'preacher',
    when: ['flag:preach2', 'row>=7'],
    w: 3,
    text: "The preacher's flock is stranded. Their barrels are empty.",
    choices: [
      { label: 'Share 15 water', req: ['water>=15'], out: go('The preacher gives you his medicine chest.', { water: -15, med: 3, morale: 10, unflag: 'preach2' }) },
      { label: 'You cannot spare it', out: go('You pass them by.', { morale: -10, unflag: 'preach2' }) },
    ],
  },
  // ---------- Chain: the Outlaw ----------
  {
    id: 'outlaw_poster',
    title: 'Wanted Poster',
    icon: '📜',
    chain: 'outlaw',
    when: ['!flag:outlaw'],
    text: 'A poster on a tree: "WANTED: Black Jack Ketch. $100 reward."',
    choices: [
      { label: 'Keep the poster', out: go('You fold it into a pocket.', { flag: 'outlaw' }) },
      { label: 'Tear it down', out: go('Not your business.') },
    ],
  },
  {
    id: 'outlaw_camp',
    title: 'Hideout',
    icon: '🏕️',
    chain: 'outlaw',
    when: ['flag:outlaw', '!flag:outlaw2', 'row>=4'],
    w: 3,
    text: "Smoke rises from a hidden camp. It is Ketch's gang.",
    choices: [
      { label: 'Attack the camp', out: go('You open fire!', { scene: 'ambush', flag: 'outlaw2' }) },
      {
        label: 'Sneak in and grab Ketch',
        skill: 'scout',
        check: 0.25,
        ok: go('{s} ties Ketch up in his sleep. You haul him along.', { flag: 'outlaw2,ketch' }),
        fail: go('A dog barks. The gang wakes up!', { scene: 'ambush', flag: 'outlaw2' }),
      },
      { label: 'Leave them alone', out: go('Not worth dying for.', { unflag: 'outlaw' }) },
    ],
  },
  {
    id: 'outlaw_bounty',
    title: 'The Sheriff',
    icon: '⭐',
    chain: 'outlaw',
    when: ['flag:outlaw2'],
    w: 3,
    text: 'A sheriff rides up. "Heard you tangled with Ketch\'s gang."',
    choices: [
      { label: 'Hand over Ketch', req: ['flag:ketch'], out: go('"$100, as promised."', { money: 100, morale: 8, unflag: 'outlaw2' }) },
      { label: 'Tell the story', out: go('He pays $40 for the news and some cartridges.', { money: 40, ammo: 10, unflag: 'outlaw2' }) },
    ],
  },
];
