/** Static content: generator tiers, upgrades, skill trees, challenges, run paths, regions, wonder. */

export interface TierDef {
  name: string;
  icon: string;
  /** log10 of the base cost. */
  cost: number;
  /** log10 of the cost growth per set of 10 bought. */
  step: number;
}

/** Tier 1 makes gold. Every higher tier makes the tier below it. */
export const TIERS: TierDef[] = [
  { name: 'Peasant', icon: '👨‍🌾', cost: 1, step: 3 },
  { name: 'Farm', icon: '🌾', cost: 2, step: 4 },
  { name: 'Mill', icon: '⚙️', cost: 4, step: 5 },
  { name: 'Market', icon: '🏪', cost: 6, step: 6 },
  { name: 'Guild', icon: '⚒️', cost: 9, step: 8 },
  { name: 'Castle', icon: '🏰', cost: 13, step: 10 },
  { name: 'City', icon: '🏙️', cost: 18, step: 12 },
  { name: 'Province', icon: '🗺️', cost: 24, step: 15 },
];

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  /** log10 of the cost in gold. */
  cost: number;
  text: string;
}

/** Gold upgrades. They reset on each prestige (unless kept by the Archives skill). */
export const UPGRADES: UpgradeDef[] = [
  { id: 'u_tools', name: 'Iron Tools', icon: '🔨', cost: 2, text: 'Clicks ×5.' },
  { id: 'u_plow', name: 'Plowshares', icon: '🪓', cost: 3, text: 'Peasants ×3.' },
  { id: 'u_taxes', name: 'Tax Office', icon: '🧾', cost: 4, text: 'Each click also gives 5% of your gold per second.' },
  { id: 'u_irrig', name: 'Irrigation', icon: '💧', cost: 5, text: 'Farms ×3.' },
  { id: 'u_touch', name: 'Golden Touch', icon: '✋', cost: 6, text: 'Clicks get a 10% chance to crit for ×10.' },
  { id: 'u_guild', name: 'Guild Charter', icon: '📜', cost: 8, text: 'Set bonus +0.2 (each full set of 10 gives more).' },
  { id: 'u_mint', name: 'Royal Mint', icon: '🪙', cost: 10, text: 'All production ×5.' },
  { id: 'u_trade', name: 'Trade Routes', icon: '🐫', cost: 13, text: 'Gold income ×(1 + digits of your gold).' },
  { id: 'u_clock', name: 'Clockwork', icon: '🕰️', cost: 16, text: 'Decrees give +0.02 more each.' },
  { id: 'u_gran', name: 'Granaries', icon: '🏚️', cost: 21, text: 'Tiers 1–4 ×10.' },
  { id: 'u_cath', name: 'Cathedrals', icon: '⛪', cost: 30, text: 'Tiers 5–8 ×10.' },
  { id: 'u_bazaar', name: 'Grand Bazaar', icon: '🎪', cost: 45, text: 'All production ×100.' },
  { id: 'u_press', name: 'Printing Press', icon: '🖨️', cost: 60, text: 'Decree costs grow ×5 instead of ×10.' },
  { id: 'u_roads', name: 'Imperial Roads', icon: '🛣️', cost: 80, text: 'All production ×(sets of 10 owned in total).' },
  { id: 'u_golden', name: 'Golden Age', icon: '🌅', cost: 110, text: 'All production ×1e5.' },
  { id: 'u_ledger', name: 'Eternal Ledger', icon: '📖', cost: 150, text: 'Set bonus +0.3.' },
];

export interface NodeDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  text: string;
  req: string[];
  /** Grid position in the tree view (column 0–2, row). */
  x: number;
  y: number;
}

export interface LayerDef {
  id: 'crown' | 'sigil' | 'star';
  name: string;
  verb: string;
  /** Plural for stats, e.g. "Dynasties". */
  plural: string;
  cur: string;
  curIcon: string;
  /** log10 of the gold needed to prestige. */
  req: number;
  /** Gain = floor(10^((digits − req) / div)). */
  div: number;
  /** Passive bonus: all production ×(1 + earned)^pow. */
  pow: number;
  mechanic: string;
  tree: NodeDef[];
}

export const LAYERS: LayerDef[] = [
  {
    id: 'crown',
    name: 'Ascension',
    verb: 'Ascend',
    plural: 'Ascensions',
    cur: 'Crowns',
    curIcon: '👑',
    req: 40,
    div: 5,
    pow: 2,
    mechanic: 'Run paths, challenges and the crown tree.',
    tree: [
      { id: 'c_favor', name: 'Royal Favor', icon: '💛', cost: 1, text: 'All production ×3.', req: [], x: 0, y: 0 },
      { id: 'c_click', name: 'Royal Touch', icon: '👆', cost: 1, text: 'Clicks ×10 and also give 10% of gold per second.', req: [], x: 2, y: 0 },
      { id: 'c_seed', name: 'Seed Money', icon: '💰', cost: 2, text: 'Start each run with 1M gold.', req: ['c_favor'], x: 0, y: 1 },
      { id: 'c_auto1', name: 'Stewards', icon: '🤖', cost: 3, text: 'Autobuy tiers 1–4 and decrees.', req: ['c_favor'], x: 1, y: 1 },
      { id: 'c_chal', name: 'War Council', icon: '⚔️', cost: 2, text: 'Unlock challenges.', req: ['c_click'], x: 2, y: 1 },
      { id: 'c_mile', name: 'Guild Masters', icon: '⚒️', cost: 6, text: 'Set bonus +0.25.', req: ['c_seed'], x: 0, y: 2 },
      { id: 'c_auto2', name: 'Chamberlains', icon: '🎩', cost: 10, text: 'Autobuy tiers 5–8 and upgrades.', req: ['c_auto1'], x: 1, y: 2 },
      { id: 'c_offline', name: 'Night Watch', icon: '🌙', cost: 5, text: 'Offline time counts in full and the cap is 12 h (base: half speed, 2 h).', req: ['c_chal'], x: 2, y: 2 },
      { id: 'c_gain', name: 'Heralds', icon: '📯', cost: 40, text: 'Crown gain ×3.', req: ['c_mile'], x: 0, y: 3 },
      { id: 'c_keep', name: 'Archives', icon: '🗄️', cost: 25, text: 'Keep upgrades when you ascend.', req: ['c_auto2'], x: 1, y: 3 },
      { id: 'c_paths', name: 'Cartographers', icon: '🧭', cost: 15, text: 'Path choices show 4 offers.', req: ['c_offline'], x: 2, y: 3 },
      { id: 'c_decree', name: 'Iron Law', icon: '⚖️', cost: 120, text: 'Decrees give +0.02 more each.', req: ['c_gain'], x: 0, y: 4 },
      { id: 'c_dyn', name: 'Bloodline', icon: '🩸', cost: 300, text: 'Unlock the Dynasty layer.', req: ['c_keep', 'c_gain'], x: 1, y: 4 },
    ],
  },
  {
    id: 'sigil',
    name: 'Dynasty',
    verb: 'Found a Dynasty',
    plural: 'Dynasties',
    cur: 'Sigils',
    curIcon: '🏺',
    req: 120,
    div: 15,
    pow: 1.5,
    mechanic: 'Conquest: buy regions that keep their bonus through ascensions.',
    tree: [
      { id: 's_keep', name: 'Old Blood', icon: '🧬', cost: 1, text: 'Keep the crown tree when you found a dynasty.', req: [], x: 0, y: 0 },
      { id: 's_wealth', name: 'Inheritance', icon: '💎', cost: 1, text: 'All production ×1000.', req: [], x: 2, y: 0 },
      { id: 's_crowns', name: 'Coronations', icon: '👑', cost: 2, text: 'Crown gain ×10.', req: ['s_wealth'], x: 2, y: 1 },
      { id: 's_auto', name: 'Regents', icon: '🔁', cost: 3, text: 'Auto-ascend when the gain at least doubles your crowns. Paths are picked for you.', req: ['s_keep'], x: 0, y: 1 },
      { id: 's_mile', name: 'Master Builders', icon: '🧱', cost: 5, text: 'Set bonus +0.5.', req: ['s_crowns'], x: 2, y: 2 },
      { id: 's_conq', name: 'Generals', icon: '🎖️', cost: 5, text: 'Region costs ÷1e10.', req: ['s_auto'], x: 0, y: 2 },
      { id: 's_decree', name: 'High Court', icon: '🏛️', cost: 12, text: 'Decrees give +0.03 more each.', req: ['s_mile'], x: 2, y: 3 },
      { id: 's_offline', name: 'Long Nights', icon: '🛌', cost: 8, text: 'Offline cap 24 h.', req: ['s_conq'], x: 0, y: 3 },
      { id: 's_path', name: 'Pilgrims', icon: '🛤️', cost: 20, text: 'Curses are half as strong (by digits).', req: ['s_offline'], x: 1, y: 4 },
      { id: 's_trans', name: 'Starborn', icon: '🌠', cost: 150, text: 'Unlock the Transcend layer.', req: ['s_decree', 's_path'], x: 1, y: 5 },
    ],
  },
  {
    id: 'star',
    name: 'Transcendence',
    verb: 'Transcend',
    plural: 'Transcendences',
    cur: 'Stars',
    curIcon: '✨',
    req: 350,
    div: 30,
    pow: 1.5,
    mechanic: 'The Wonder: build its 5 stages to finish the game.',
    tree: [
      { id: 't_keep', name: 'Eternal Line', icon: '♾️', cost: 1, text: 'Keep the sigil tree when you transcend.', req: [], x: 0, y: 0 },
      { id: 't_mult', name: 'Starlight', icon: '🌟', cost: 1, text: 'All production ×1e10.', req: [], x: 2, y: 0 },
      { id: 't_auto', name: 'Oracles', icon: '🔮', cost: 2, text: 'Auto-found a dynasty when the gain at least doubles your sigils.', req: ['t_keep'], x: 0, y: 1 },
      { id: 't_sig', name: 'Star Seals', icon: '🔆', cost: 3, text: 'Sigil gain ×10.', req: ['t_mult'], x: 2, y: 1 },
      { id: 't_conq', name: 'Star Maps', icon: '🗺️', cost: 4, text: 'Keep regions when you found a dynasty or transcend.', req: ['t_auto'], x: 0, y: 2 },
      { id: 't_wonder', name: 'Architects', icon: '📐', cost: 6, text: 'Wonder costs need 10% fewer digits.', req: ['t_sig'], x: 2, y: 2 },
      { id: 't_mile', name: 'Celestial Guilds', icon: '🪐', cost: 10, text: 'Set bonus +1.', req: ['t_conq', 't_wonder'], x: 1, y: 3 },
      { id: 't_power', name: 'Supernova', icon: '💥', cost: 25, text: 'Gold income ^1.05.', req: ['t_mile'], x: 1, y: 4 },
    ],
  },
];

export interface ChallengeDef {
  id: string;
  name: string;
  icon: string;
  rule: string;
  reward: string;
}

/** A challenge is an ascension run with a rule. Reach the ascension goal to complete it. */
export const CHALLENGES: ChallengeDef[] = [
  { id: 'ch_noclick', name: 'Hands Tied', icon: '🪢', rule: 'Clicking does nothing.', reward: 'All production ×3.' },
  { id: 'ch_small', name: 'Small Realm', icon: '🏘️', rule: 'Only tiers 1–3 exist.', reward: 'Tiers 1–3 ×100.' },
  { id: 'ch_inflation', name: 'Inflation', icon: '📈', rule: 'Generator cost growth per set is doubled (in digits).', reward: 'Generator cost growth −10% (in digits).' },
  { id: 'ch_austerity', name: 'Austerity', icon: '🚫', rule: 'Upgrades cannot be bought.', reward: 'All production ×10.' },
  { id: 'ch_lean', name: 'Lean Times', icon: '🥀', rule: 'Gold income ^0.8.', reward: 'Gold income ^1.02.' },
  { id: 'ch_lawless', name: 'Lawless', icon: '🏴', rule: 'Decrees cannot be bought.', reward: 'Decrees give +0.02 more each.' },
];

export interface ModDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  /** Bot rating: higher is better for the player. */
  score: number;
}

export const BLESSINGS: ModDef[] = [
  { id: 'b_harvest', name: 'Bountiful Harvest', icon: '🌽', text: 'Peasants ×100.', score: 3 },
  { id: 'b_golden', name: 'Golden Era', icon: '🌞', text: 'All production ×10.', score: 4 },
  { id: 'b_cheap', name: 'Cheap Labor', icon: '🧺', text: 'Generator costs ÷1000.', score: 3 },
  { id: 'b_hands', name: 'Busy Hands', icon: '🙌', text: 'Clicks ×100 and give +20% of gold per second.', score: 2 },
  { id: 'b_law', name: 'Strong Law', icon: '📜', text: 'Decrees give +0.03 more each.', score: 5 },
  { id: 'b_fest', name: 'Guild Festival', icon: '🎉', text: 'Set bonus +0.3.', score: 5 },
  { id: 'b_prosper', name: 'Prosperity', icon: '🍀', text: 'Prestige gain ×2.', score: 4 },
  { id: 'b_momentum', name: 'Momentum', icon: '🌀', text: 'All production ×(1 + minutes in this run)².', score: 4 },
  { id: 'b_luck', name: 'Lucky Mint', icon: '🎲', text: 'Clicks crit 30% of the time for ×50.', score: 1 },
  { id: 'b_scholar', name: 'Scholars', icon: '🎓', text: 'Upgrades cost ÷1e5.', score: 2 },
];

export const CURSES: ModDef[] = [
  { id: 'k_plague', name: 'Plague', icon: '🦠', text: 'Peasants ×0.05.', score: -3 },
  { id: 'k_taxes', name: 'Heavy Taxes', icon: '💸', text: 'All production ×0.1.', score: -4 },
  { id: 'k_corrupt', name: 'Corruption', icon: '🐍', text: 'Generator cost growth per set +25% (in digits).', score: -3 },
  { id: 'k_clumsy', name: 'Clumsy', icon: '🫠', text: 'Clicks ×0.01.', score: -1 },
  { id: 'k_unrest', name: 'Unrest', icon: '🔥', text: 'Upgrades cost ×1e4.', score: -2 },
  { id: 'k_lawless', name: 'Bribed Judges', icon: '⚖️', text: 'Decree costs ×1e4.', score: -3 },
  { id: 'k_greed', name: 'Greedy Nobles', icon: '🤑', text: 'Prestige gain ×0.6.', score: -3 },
  { id: 'k_roads', name: 'Broken Roads', icon: '🚧', text: 'Tiers 5–8 ×0.01.', score: -2 },
];

export interface GoalDef {
  id: string;
  name: string;
  icon: string;
  text: string;
  score: number;
}

/** A run goal. Meet it when you prestige and the gain is ×1.5. */
export const GOALS: GoalDef[] = [
  { id: 'g_swift', name: 'Swift', icon: '⚡', text: 'Prestige within 10 minutes of the run start.', score: 2 },
  { id: 'g_handsoff', name: 'Hands Off', icon: '🧘', text: 'Prestige without clicking.', score: 1 },
  { id: 'g_builder', name: 'Builder', icon: '🏗️', text: 'Own at least 10 bought of every tier.', score: 1 },
  { id: 'g_frugal', name: 'Frugal', icon: '🪶', text: 'Prestige with at most 6 upgrades.', score: 1 },
  { id: 'g_overflow', name: 'Overflow', icon: '🌊', text: 'Prestige with 3 more digits of gold than needed.', score: 2 },
  { id: 'g_lawmaker', name: 'Lawmaker', icon: '🏛️', text: 'Own at least 30 decrees.', score: 2 },
];

export interface RegionDef {
  name: string;
  icon: string;
  /** log10 of the gold cost. */
  cost: number;
  text: string;
}

/** Conquest regions (Dynasty layer). Buy them in order. */
export const REGIONS: RegionDef[] = [
  { name: 'Green Valley', icon: '🌳', cost: 60, text: 'Peasants ×1e4.' },
  { name: 'Salt Coast', icon: '🧂', cost: 75, text: 'Crown gain ×3.' },
  { name: 'Iron Hills', icon: '⛏️', cost: 90, text: 'Set bonus +0.2.' },
  { name: 'River Delta', icon: '🌊', cost: 105, text: 'All production ×1e5.' },
  { name: 'Highlands', icon: '🏔️', cost: 120, text: 'Decrees give +0.02 more each.' },
  { name: 'Desert Realm', icon: '🏜️', cost: 140, text: 'Crown gain ×10.' },
  { name: 'Jade Coast', icon: '🐉', cost: 160, text: 'All production ×1e10.' },
  { name: 'Frozen North', icon: '❄️', cost: 180, text: 'Sigil gain ×3.' },
  { name: 'Sky Isles', icon: '☁️', cost: 200, text: 'All production ×1e15.' },
  { name: "World's End", icon: '🌋', cost: 230, text: 'Gold income ^1.03.' },
];

export interface StageDef {
  name: string;
  icon: string;
  /** log10 of the gold cost. */
  cost: number;
}

/** The Wonder (Transcendence layer). Build all 5 stages to finish the game. */
export const WONDER: StageDef[] = [
  { name: 'Foundation', icon: '🧱', cost: 350 },
  { name: 'Colonnade', icon: '🏛️', cost: 420 },
  { name: 'Great Hall', icon: '🕌', cost: 590 },
  { name: 'Golden Dome', icon: '🛕', cost: 590 },
  { name: 'Eternal Spire', icon: '🗼', cost: 700 },
];

/** Each Wonder stage gives all production this bonus (log10). */
export const WONDER_BONUS = 10;

export const NODE: Record<string, NodeDef> = Object.fromEntries(LAYERS.flatMap((l) => l.tree.map((n) => [n.id, n])));
export const BLESS: Record<string, ModDef> = Object.fromEntries(BLESSINGS.map((b) => [b.id, b]));
export const CURSE: Record<string, ModDef> = Object.fromEntries(CURSES.map((b) => [b.id, b]));
export const GOAL: Record<string, GoalDef> = Object.fromEntries(GOALS.map((b) => [b.id, b]));
export const CHAL: Record<string, ChallengeDef> = Object.fromEntries(CHALLENGES.map((b) => [b.id, b]));
export const UPG: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((b) => [b.id, b]));
