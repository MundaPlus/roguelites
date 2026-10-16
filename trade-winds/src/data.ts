/** Static game data: goods, ports, ships, seasons, news cards. */

export interface GoodDef {
  id: string;
  name: string;
  icon: string;
  /** Mid price when the stock sits at the reference level. */
  base: number;
  /** Reference stock. Producers hold more, consumers hold less. */
  stock: number;
}

export const GOODS: GoodDef[] = [
  { id: 'grain', name: 'Grain', icon: '🌾', base: 16, stock: 240 },
  { id: 'timber', name: 'Timber', icon: '🪵', base: 30, stock: 200 },
  { id: 'wine', name: 'Wine', icon: '🍷', base: 55, stock: 150 },
  { id: 'cloth', name: 'Cloth', icon: '🧵', base: 80, stock: 120 },
  { id: 'iron', name: 'Iron', icon: '⚙️', base: 110, stock: 100 },
  { id: 'spice', name: 'Spice', icon: '🌶️', base: 200, stock: 70 },
  { id: 'silk', name: 'Silk', icon: '🎐', base: 340, stock: 50 },
  { id: 'gems', name: 'Gems', icon: '💎', base: 640, stock: 30 },
];

export const NG = GOODS.length;
export const gi = (id: string): number => GOODS.findIndex((g) => g.id === id);

export interface PortDef {
  name: string;
  x: number;
  y: number;
  /** Base pirate danger near this port (0..1). */
  danger: number;
  /** Market recovery speed per day (share of the gap to the normal stock). */
  recovery: number;
  produces: string[];
  consumes: string[];
  shipyard: boolean;
  blurb: string;
}

export const PORTS: PortDef[] = [
  { name: 'Haven', x: 130, y: 470, danger: 0.15, recovery: 0.1, produces: ['grain', 'timber'], consumes: ['iron', 'silk'], shipyard: true, blurb: 'A quiet home port with a busy grain quay.' },
  { name: 'Brightwater', x: 300, y: 300, danger: 0.15, recovery: 0.11, produces: ['cloth', 'wine'], consumes: ['grain', 'gems'], shipyard: false, blurb: 'Rich weavers and richer buyers of jewels.' },
  { name: 'Northreach', x: 230, y: 105, danger: 0.25, recovery: 0.07, produces: ['timber', 'iron'], consumes: ['wine', 'spice'], shipyard: false, blurb: 'Cold forests and iron mines in the north.' },
  { name: 'Saltcrag', x: 340, y: 565, danger: 0.25, recovery: 0.08, produces: ['timber', 'cloth'], consumes: ['silk', 'grain'], shipyard: true, blurb: 'A rocky harbour of carpenters and tailors.' },
  { name: 'Valdora', x: 545, y: 150, danger: 0.2, recovery: 0.1, produces: ['silk', 'wine'], consumes: ['iron', 'timber'], shipyard: true, blurb: 'Vineyards and silk farms on warm hills.' },
  { name: 'Corsa', x: 500, y: 400, danger: 0.55, recovery: 0.08, produces: ['iron', 'grain'], consumes: ['silk', 'cloth'], shipyard: false, blurb: 'A free port. Pirates drink in its taverns.' },
  { name: 'Tidewick', x: 655, y: 580, danger: 0.4, recovery: 0.07, produces: ['grain', 'wine'], consumes: ['gems', 'spice'], shipyard: false, blurb: 'Fishing town with a taste for luxury.' },
  { name: 'Amberly', x: 860, y: 110, danger: 0.25, recovery: 0.09, produces: ['gems', 'cloth'], consumes: ['spice', 'wine'], shipyard: true, blurb: 'A jewel city behind high sea walls.' },
  { name: 'Kestrel', x: 760, y: 335, danger: 0.5, recovery: 0.07, produces: ['spice', 'gems'], consumes: ['cloth', 'grain'], shipyard: false, blurb: 'Spice island in pirate waters.' },
  { name: 'Mistral', x: 895, y: 520, danger: 0.4, recovery: 0.08, produces: ['spice', 'silk'], consumes: ['timber', 'iron'], shipyard: false, blurb: 'Far eastern market of silk and pepper.' },
];

export const NP = PORTS.length;

/** Normal stock multiplier: producers hold much more, consumers much less. */
export const PROD_STOCK = 1.5;
export const CONS_STOCK = 0.68;

/** Price elasticity: mid = base × demand × (ref / stock) ^ EL. */
export const EL = 0.8;
/** Buy above and sell below the mid price. */
export const BUY_FEE = 1.05;
export const SELL_FEE = 0.95;

export function stockFactor(p: number, g: number): number {
  const port = PORTS[p];
  const id = GOODS[g].id;
  if (port.produces.includes(id)) return PROD_STOCK;
  if (port.consumes.includes(id)) return CONS_STOCK;
  return 1;
}

export interface ShipDef {
  id: string;
  name: string;
  cargo: number;
  hull: number;
  /** Speed factor: map units per day = 55 × speed. */
  speed: number;
  guns: number;
  maxGuards: number;
  price: number;
  text: string;
}

export const SHIPS: ShipDef[] = [
  { id: 'sloop', name: 'Sloop', cargo: 40, hull: 40, speed: 1, guns: 2, maxGuards: 2, price: 1500, text: 'Small and cheap. Your first ship.' },
  { id: 'cutter', name: 'Cutter', cargo: 32, hull: 36, speed: 1.4, guns: 1, maxGuards: 2, price: 2200, text: 'Fast. Short voyages, easy escapes.' },
  { id: 'brig', name: 'Brig', cargo: 80, hull: 70, speed: 1, guns: 5, maxGuards: 4, price: 6500, text: 'A sturdy all-round trader.' },
  { id: 'clipper', name: 'Clipper', cargo: 110, hull: 70, speed: 1.35, guns: 3, maxGuards: 4, price: 16000, text: 'Large and fast, but thin hull.' },
  { id: 'galleon', name: 'Galleon', cargo: 180, hull: 130, speed: 0.85, guns: 8, maxGuards: 6, price: 24000, text: 'Huge hold. Slow and heavy.' },
  { id: 'frigate', name: 'Frigate', cargo: 140, hull: 170, speed: 1.1, guns: 14, maxGuards: 10, price: 38000, text: 'A warship with a merchant hold.' },
];

export const shipById = (id: string): ShipDef => SHIPS.find((s) => s.id === id) ?? SHIPS[0];

export const GUARD_COST = 150;
export const GUARD_WAGE = 15;
export const GUARD_POWER = 1.5;
export const WAREHOUSE_COST = 1500;
export const WAREHOUSE_CAP = 100;
export const WAREHOUSE_FEE = 20;
export const REPAIR_COST = 9;
export const INTEREST = 0.015;
export const START_LOAN = 3000;
export const START_GOLD = 500;
export const LOAN_DAYS = 364;
export const RUN_DAYS = 546;
export const BORROW_LAST_DAY = 280;
export const GOAL = 55000;

export interface SeasonDef {
  name: string;
  icon: string;
  storm: number;
  pirate: number;
  slow: number;
  demand: Record<string, number>;
  text: string;
}

export const SEASONS: SeasonDef[] = [
  { name: 'Spring', icon: '🌱', storm: 1, pirate: 1, slow: 1, demand: { cloth: 1.12, timber: 1.1 }, text: 'Calm seas. Builders and tailors buy.' },
  { name: 'Summer', icon: '☀️', storm: 0.6, pirate: 1.4, slow: 1, demand: { wine: 1.2, silk: 1.1 }, text: 'Pirates hunt in the warm months.' },
  { name: 'Autumn', icon: '🍂', storm: 1.5, pirate: 1, slow: 1.1, demand: { grain: 0.75, wine: 0.85 }, text: 'Harvest time: grain and wine get cheap.' },
  { name: 'Winter', icon: '❄️', storm: 2.4, pirate: 0.7, slow: 1.25, demand: { grain: 1.3, timber: 1.25, spice: 1.1 }, text: 'Storms and slow winds. Fuel and food get dear.' },
];

export const seasonOf = (day: number): number => Math.floor((((day % 364) + 364) % 364) / 91);

export interface NewsDef {
  id: string;
  icon: string;
  /** Text with {port} in it. */
  text: string;
  /** 'local' picks one port, 'global' hits every port. */
  scope: 'local' | 'global';
  goods: [string, number][];
  /** Added pirate danger at the port. */
  danger?: number;
  weeks: [number, number];
  /** Only ports that produce (or consume) this good. */
  where?: { produces?: string; consumes?: string };
}

export const NEWS: NewsDef[] = [
  { id: 'famine', icon: '🥀', text: 'Famine in {port}. Grain is worth gold.', scope: 'local', goods: [['grain', 2.4]], weeks: [3, 6] },
  { id: 'war', icon: '⚔️', text: '{port} goes to war. Iron and timber are in demand.', scope: 'local', goods: [['iron', 2], ['timber', 1.5]], danger: 0.2, weeks: [4, 7] },
  { id: 'harvest', icon: '🌻', text: 'Bumper harvest at {port}. Grain and wine flood the market.', scope: 'local', goods: [['grain', 0.5], ['wine', 0.7]], weeks: [3, 5] },
  { id: 'silkfleet', icon: '🚢', text: 'A silk fleet unloads at {port}. Silk is cheap.', scope: 'local', goods: [['silk', 0.55]], weeks: [2, 4] },
  { id: 'wedding', icon: '💍', text: 'Royal wedding in {port}. Gems, wine and silk sell high.', scope: 'local', goods: [['gems', 1.8], ['wine', 1.6], ['silk', 1.4]], weeks: [2, 4] },
  { id: 'plague', icon: '🦠', text: 'Plague in {port}. Cloth and spice for medicine are scarce.', scope: 'local', goods: [['cloth', 1.7], ['spice', 1.6], ['wine', 0.8]], weeks: [3, 6] },
  { id: 'shipyard', icon: '🔨', text: 'Shipbuilding boom at {port}. Timber and iron wanted.', scope: 'local', goods: [['timber', 1.9], ['iron', 1.4]], weeks: [3, 6] },
  { id: 'festival', icon: '🎉', text: 'Harvest festival in {port}. Wine and grain wanted.', scope: 'local', goods: [['wine', 1.8], ['grain', 1.3]], weeks: [2, 3] },
  { id: 'fashion', icon: '👗', text: 'A new fashion in {port}. Cloth and silk are the rage.', scope: 'local', goods: [['cloth', 1.7], ['silk', 1.5]], weeks: [3, 5] },
  { id: 'gemrush', icon: '⛏️', text: 'New gem mine at {port}. Gems are cheap.', scope: 'local', goods: [['gems', 0.6]], weeks: [3, 5], where: { produces: 'gems' } },
  { id: 'mineflood', icon: '🌊', text: 'Mines flood near {port}. Iron is scarce.', scope: 'local', goods: [['iron', 1.9]], weeks: [3, 6], where: { produces: 'iron' } },
  { id: 'pirates', icon: '🏴‍☠️', text: 'A pirate fleet hunts near {port}.', scope: 'local', goods: [], danger: 0.6, weeks: [3, 6] },
  { id: 'navy', icon: '⚓', text: 'The navy patrols near {port}. The sea is safer.', scope: 'local', goods: [], danger: -0.4, weeks: [3, 6] },
  { id: 'blight', icon: '🍂', text: 'Blight in the spice groves. Spice is dear everywhere.', scope: 'global', goods: [['spice', 1.5]], weeks: [3, 5] },
  { id: 'glut', icon: '📦', text: 'Too much timber everywhere. Prices fall.', scope: 'global', goods: [['timber', 0.7]], weeks: [3, 5] },
  { id: 'craze', icon: '✨', text: 'Gem craze across the sea. Gems sell high everywhere.', scope: 'global', goods: [['gems', 1.35]], weeks: [3, 5] },
];

export interface Unlock {
  id: string;
  kind: 'port' | 'ship';
  ref: number | string;
  cost: number;
}

export const UNLOCKS: Unlock[] = [
  { id: 'port-valdora', kind: 'port', ref: 4, cost: 12 },
  { id: 'port-amberly', kind: 'port', ref: 7, cost: 20 },
  { id: 'port-kestrel', kind: 'port', ref: 8, cost: 28 },
  { id: 'ship-cutter', kind: 'ship', ref: 'cutter', cost: 15 },
  { id: 'ship-brig', kind: 'ship', ref: 'brig', cost: 40 },
];

/** Start choices that need no unlock. */
export const FREE_PORTS = [0, 3];
export const FREE_SHIPS = ['sloop'];
