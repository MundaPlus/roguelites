/** Templates, rule cards, enemy colonies, acts and meta unlocks. */
import { orient, parseRule, parseShape, type Rule, type Shape } from './engine';

export interface TemplateDef {
  id: string;
  name: string;
  /** Kind of shape, for the help text: still life, oscillator, spaceship, burst. */
  kind: 'cell' | 'still' | 'osc' | 'ship' | 'burst';
  text: string;
  /** Shape in its default orientation. Ships point up (toward the enemy). */
  shape: Shape;
}

const T = (id: string, name: string, kind: TemplateDef['kind'], text: string, rows: string[], o = 0): TemplateDef => ({
  id,
  name,
  kind,
  text,
  shape: orient(parseShape(rows), o),
});

export const TEMPLATES: Record<string, TemplateDef> = Object.fromEntries(
  [
    T('dot', 'Cell', 'cell', 'One cell. Alone it dies. Add cells next to your shapes to change them.', ['#']),
    T('block', 'Block', 'still', 'Still life (2×2). It never changes. A cheap wall.', ['##', '##']),
    T('blinker', 'Blinker', 'osc', 'Oscillator. Flips between a row and a column each generation.', ['###']),
    T('glider', 'Glider', 'ship', 'Spaceship. Flies diagonally, 1 square every 4 generations. Rotate it to aim.', ['###', '#..', '.#.']),
    T('boat', 'Boat', 'still', 'Still life. A small wall with a bent shape.', ['##.', '#.#', '.#.']),
    T('beehive', 'Beehive', 'still', 'Still life (4 wide). A wider wall.', ['.##.', '#..#', '.##.']),
    T('loaf', 'Loaf', 'still', 'Still life. A strong wall that often survives a hit.', ['.##.', '#..#', '.#.#', '..#.']),
    T('toad', 'Toad', 'osc', 'Oscillator (period 2). Covers 4×4 squares while it pulses.', ['.###', '###.']),
    T('beacon', 'Beacon', 'osc', 'Oscillator (period 2). Two blocks that blink at the touching corners.', ['##..', '##..', '..##', '..##']),
    T('eater', 'Eater', 'still', 'Still life that eats gliders that hit it the right way and survives.', ['##..', '#.#.', '..#.', '..##']),
    T('lwss', 'Light ship', 'ship', 'Lightweight spaceship. Flies straight, 2 squares every 4 generations.', ['.#..#', '#....', '#...#', '####.'], 1),
    T('mwss', 'Middle ship', 'ship', 'Middleweight spaceship. Flies straight like the light ship, with more cells.', ['...#..', '.#...#', '#.....', '#....#', '#####.'], 1),
    T('rpent', 'R-pentomino', 'burst', 'Burst. Five cells that grow into a big messy cloud for many generations.', ['.##', '##.', '.#.']),
    T('diehard', 'Diehard', 'burst', 'Burst. Grows and moves for 130 generations, then vanishes.', ['......#.', '##......', '.#...###']),
    T('acorn', 'Acorn', 'burst', 'Burst. Seven cells that explode into a huge cloud.', ['.#.....', '...#...', '##..###']),
  ].map((t) => [t.id, t]),
);

export const START_TEMPLATES = ['dot', 'block', 'blinker', 'glider'];
export const TEMPLATE_POOL = ['boat', 'beehive', 'loaf', 'toad', 'beacon', 'eater', 'lwss', 'rpent'];

export const tplSize = (id: string): number => TEMPLATES[id].shape.length;

export interface CardDef {
  id: string;
  name: string;
  icon: string;
  text: string;
}

export const CARDS: Record<string, CardDef> = Object.fromEntries(
  [
    { id: 'stubborn', name: 'Stubborn', icon: '🪨', text: 'Your cells also survive with 6 neighbors. Crowded blobs last longer.' },
    { id: 'highlife', name: 'HighLife', icon: '🧬', text: 'Your cells are also born with 6 neighbors.' },
    { id: 'lone', name: 'Lone Root', icon: '🌱', text: 'Your cells also survive with 0 neighbors. Single cells stay as mines.' },
    { id: 'wild', name: 'Wildfire', icon: '🔥', text: 'Your cells are also born with 4 neighbors. Shapes grow fast and wild.' },
    { id: 'thick', name: 'Thick Walls', icon: '🧱', text: 'Your cells die in a clash only with 2 or more enemy neighbors.' },
    { id: 'regrow', name: 'Regrowth', icon: '💚', text: 'Your core heals 1 at the end of each turn.' },
    { id: 'forward', name: 'Forward Zone', icon: '⏫', text: 'Your placement zone reaches 1 row further forward.' },
    { id: 'stencil', name: 'Stencil', icon: '✂️', text: 'Templates with 4 or more cells cost 1 cell less.' },
    { id: 'sharp', name: 'Sharp Edges', icon: '🗡️', text: 'Each of your cells that hits the enemy core deals 2 damage.' },
    { id: 'bank', name: 'Seed Bank', icon: '🏦', text: 'Up to 8 unused cells carry over to the next turn (normally 4).' },
    { id: 'leech', name: 'Leech', icon: '🩸', text: 'Every 6 clashes in a turn heal your core by 1.' },
  ].map((c) => [c.id, c]),
);

export const CARD_POOL = ['stubborn', 'highlife', 'lone', 'thick', 'regrow', 'forward', 'stencil'];

export interface EnemyDef {
  id: string;
  name: string;
  icon: string;
  rule: string;
  /** Short name of the rule family, shown next to the plain words. */
  family: string;
  budget: number;
  core: number;
  templates: string[];
  /** Candidate placements the AI tries per turn. */
  tries: number;
  /** AI weight for its own core safety vs. attack. 1 = even. */
  caution: number;
  armor?: number;
  dmg?: number;
  /** Shown under the name. */
  text: string;
}

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(
  (
    [
      { id: 'moss', name: 'Petri Moss', icon: '🟫', rule: 'B3/S23', family: 'Conway Life', budget: 3, core: 8, templates: ['block', 'blinker'], tries: 2, caution: 2, text: 'A sleepy test colony. It only builds walls.' },
      { id: 'mold', name: 'Green Mold', icon: '🦠', rule: 'B3/S23', family: 'Conway Life', budget: 5, core: 12, templates: ['glider', 'block', 'dot'], tries: 6, caution: 1, text: 'Sends gliders and blocks.' },
      { id: 'yeast', name: 'Yeast Bloom', icon: '🫧', rule: 'B3/S23', family: 'Conway Life', budget: 6, core: 12, templates: ['blinker', 'toad', 'block', 'beehive'], tries: 6, caution: 1.6, text: 'Builds pulsing walls.' },
      { id: 'slime', name: 'Slime Line', icon: '🐌', rule: 'B3/S23', family: 'Conway Life', budget: 5, core: 10, templates: ['glider'], tries: 6, caution: 0.6, text: 'Only gliders. All attack.' },
      { id: 'hive', name: 'HighLife Hive', icon: '🐝', rule: 'B36/S23', family: 'HighLife', budget: 7, core: 16, templates: ['glider', 'rpent', 'block', 'dot'], tries: 10, caution: 1, text: 'Elite. Its cells are also born with 6 neighbors.' },
      { id: 'mother', name: 'Mother Mold', icon: '🍄', rule: 'B3/S23', family: 'Conway Life', budget: 8, core: 24, templates: ['glider', 'lwss', 'block', 'eater'], tries: 12, caution: 1, text: 'Boss. Ships and eaters.' },

      { id: 'coral', name: 'Coral Polyp', icon: '🪸', rule: 'B3/S023', family: 'DotLife', budget: 6, core: 16, templates: ['dot', 'blinker', 'block', 'glider'], tries: 10, caution: 1.2, text: 'Its lone cells do not die. They sit like mines.' },
      { id: 'walker', name: 'Walker Swarm', icon: '🚶', rule: 'B38/S23', family: 'Pedestrian Life', budget: 7, core: 15, templates: ['glider', 'lwss', 'dot'], tries: 10, caution: 0.8, text: 'Ships that also breed with 8 neighbors.' },
      { id: 'dry', name: 'Dry Spores', icon: '🌵', rule: 'B37/S23', family: 'DryLife', budget: 7, core: 16, templates: ['glider', 'rpent', 'beehive'], tries: 10, caution: 1, text: 'Also born with 7 neighbors.' },
      { id: 'stains', name: 'Ink Stain', icon: '🖋️', rule: 'B3678/S235678', family: 'Stains', budget: 6, core: 17, templates: ['dot', 'block', 'rpent'], tries: 12, caution: 1, text: 'Elite. Blots that grow into thick stains and hold the ground.' },
      { id: 'queen', name: 'Coral Queen', icon: '👑', rule: 'B3/S023', family: 'DotLife', budget: 9, core: 30, templates: ['dot', 'blinker', 'glider', 'lwss', 'block'], tries: 14, caution: 1.2, armor: 2, text: 'Boss. Lone cells do not die. Thick skin.' },

      { id: 'twins', name: '2×2 Twins', icon: '👯', rule: 'B36/S125', family: '2×2', budget: 8, core: 20, templates: ['dot', 'block', 'glider'], tries: 12, caution: 1, text: 'Blocks that split and copy.' },
      { id: 'quad', name: 'Square Rot', icon: '🟪', rule: 'B34/S34', family: '34 Life', budget: 8, core: 20, templates: ['dot', 'block', 'blinker', 'rpent'], tries: 12, caution: 1, text: 'Born and survives with 3 or 4. Spreads in square bursts.' },
      { id: 'assim', name: 'Assimilator', icon: '💠', rule: 'B345/S4567', family: 'Assimilation', budget: 9, core: 18, templates: ['dot', 'block', 'beacon', 'toad'], tries: 12, caution: 1, text: 'Grows slow diamonds that are hard to break.' },
      { id: 'morley', name: 'Morley Drift', icon: '🌀', rule: 'B368/S245', family: 'Move', budget: 10, core: 24, templates: ['dot', 'rpent', 'glider', 'block'], tries: 14, caution: 0.8, text: 'Elite. Its shapes crawl and break apart.' },
      { id: 'ancient', name: 'The Ancient', icon: '🗿', rule: 'B3/S23', family: 'Conway Life', budget: 11, core: 40, templates: ['glider', 'lwss', 'mwss', 'eater', 'beacon'], tries: 16, caution: 1, armor: 2, dmg: 2, text: 'Final boss. Thick skin. Each hit deals 2.' },
    ] as EnemyDef[]
  ).map((e) => [e.id, e]),
);

export const enemyRule = (e: EnemyDef): Rule => parseRule(e.rule);

export interface ActDef {
  name: string;
  icon: string;
  fights: string[];
  elite: string;
  boss: string;
}

export const ACTS: ActDef[] = [
  { name: 'Petri Dish', icon: '🌿', fights: ['mold', 'yeast', 'slime'], elite: 'hive', boss: 'mother' },
  { name: 'Coral Reef', icon: '🪸', fights: ['coral', 'walker', 'dry'], elite: 'stains', boss: 'queen' },
  { name: 'Deep Ooze', icon: '🌑', fights: ['twins', 'quad', 'assim'], elite: 'morley', boss: 'ancient' },
];

export interface UnlockDef {
  id: string;
  kind: 'tpl' | 'card';
  cost: number;
}

/** Meta unlocks: add templates and cards to the reward pool of later runs. */
export const UNLOCKS: UnlockDef[] = [
  { id: 'mwss', kind: 'tpl', cost: 20 },
  { id: 'sharp', kind: 'card', cost: 25 },
  { id: 'bank', kind: 'card', cost: 25 },
  { id: 'diehard', kind: 'tpl', cost: 30 },
  { id: 'leech', kind: 'card', cost: 35 },
  { id: 'acorn', kind: 'tpl', cost: 40 },
  { id: 'wild', kind: 'card', cost: 45 },
];
