/** Hand-made levels. Units: the play area is 20 × 12, y points up. */

/** Flat list of points: x0, y0, x1, y1, ... */
export type Pts = number[];
/** x0, y0, x1, y1 */
export type Rect = [number, number, number, number];

export interface CrateDef {
  x: number;
  y: number;
  w: number;
  h: number;
  role: 'crate' | 'target' | 'keep';
}

export interface MoverDef {
  pts: Pts;
  path: 'slide' | 'spin' | 'swing';
  dx?: number;
  dy?: number;
  period?: number;
  speed?: number;
  amp?: number;
}

export interface LevelDef {
  id: string;
  name: string;
  world: number;
  boss?: boolean;
  goal: 'cup' | 'target' | 'keep';
  ball: [number, number];
  /** Ink budget (stroke length). */
  ink: number;
  /** Seconds from Go to the goal for the time star (keep goals: no miss). */
  par: number;
  solids: Pts[];
  cup?: Rect;
  /** The target crate must reach this zone. */
  zone?: Rect;
  nodraw?: Rect[];
  spikes?: Rect[];
  crates?: CrateDef[];
  movers?: MoverDef[];
  /** Seconds to survive for 'keep' goals. */
  keep?: number;
  /** Boss draw timer in seconds. */
  timer?: number;
  /** One known solution: pencil strokes. */
  sol: Pts[];
  tip: string;
}

const box = (x0: number, y0: number, x1: number, y1: number): Pts => [x0, y0, x1, y0, x1, y1, x0, y1];
/** A sloped slab whose top runs from (xa, ya) to (xb, yb). */
const slab = (xa: number, ya: number, xb: number, yb: number, th = 0.7): Pts => [xa, ya - th, xb, yb - th, xb, yb, xa, ya];
const GROUND = box(0, 0, 20, 1);

export const LEVELS: LevelDef[] = [
  // ---------- World 1: Paper Hills ----------
  {
    id: 'w1-bridge',
    name: 'First Bridge',
    world: 0,
    goal: 'cup',
    ball: [1, 8.2],
    ink: 10,
    par: 6.5,
    solids: [slab(0, 8, 6.5, 6), box(11, 0, 14.5, 6), box(14.5, 0, 17, 4.6), box(17, 0, 20, 7.5)],
    cup: [14.5, 4.6, 17, 6],
    sol: [[5.6, 6.65, 11.6, 6.45]],
    tip: 'Draw a line across the gap. It falls when you press Go.',
  },
  {
    id: 'w1-slide',
    name: 'Slide In',
    world: 0,
    goal: 'cup',
    ball: [3, 10.5],
    ink: 18,
    par: 3.5,
    solids: [GROUND, box(1.5, 1, 2.2, 8), box(14.3, 1, 14.6, 2.4), box(17, 1, 20, 6)],
    spikes: [[2.2, 1, 14.3, 1.4]],
    cup: [14.6, 1, 17, 2.4],
    sol: [[1.6, 8.7, 14.4, 2.75]],
    tip: 'A ramp needs two supports, or it falls.',
  },
  {
    id: 'w1-step',
    name: 'Step Down',
    world: 0,
    goal: 'cup',
    ball: [0.8, 10.2],
    ink: 12,
    par: 4.5,
    solids: [slab(0, 10, 5, 7.5), GROUND, box(8, 1, 8.8, 5), box(12, 0, 15, 4), box(15, 0, 17.5, 2.8), box(17.5, 0, 20, 6)],
    spikes: [[0, 1, 8, 1.4], [8.8, 1, 12, 1.4]],
    cup: [15, 2.8, 17.5, 4],
    sol: [[4.6, 7.9, 12.4, 4.45]],
    tip: 'Lean the bridge on both edges.',
  },
  {
    id: 'w1-wall',
    name: 'Over the Wall',
    world: 0,
    goal: 'cup',
    ball: [0.8, 9.3],
    ink: 14,
    par: 6,
    solids: [slab(0, 9, 6, 7.2), GROUND, box(9.5, 1, 10.5, 6.5), box(14, 1, 14.3, 2.4), box(17, 1, 20, 5)],
    spikes: [[0, 1, 9.5, 1.4], [10.5, 1, 14, 1.4]],
    cup: [14.3, 1, 17, 2.4],
    sol: [[5.7, 7.5, 10, 7.6, 14.6, 2.9]],
    tip: 'One stroke can bend over a wall.',
  },
  {
    id: 'w1-catch',
    name: 'Catch!',
    world: 0,
    goal: 'keep',
    keep: 4,
    ball: [10, 10.5],
    ink: 14,
    par: 4,
    solids: [GROUND, box(5, 1.4, 6, 5.5), box(14, 1.4, 15, 5.5)],
    spikes: [[0, 1, 20, 1.4]],
    sol: [[5.4, 6.0, 10, 5.0, 14.6, 6.0]],
    tip: 'Keep the ball off the spikes for 4 seconds.',
  },
  {
    id: 'w1-fence',
    name: 'Low Fence',
    world: 0,
    goal: 'cup',
    ball: [1, 8.2],
    ink: 10,
    par: 5.5,
    solids: [slab(0, 8, 6.5, 5.6), box(11.5, 0, 14.5, 5.6), box(14.5, 0, 17, 4.2), box(17, 0, 20, 7)],
    nodraw: [[7.5, 6.6, 10.5, 12]],
    cup: [14.5, 4.2, 17, 5.6],
    sol: [[5.6, 6.3, 12, 6.0]],
    tip: 'You cannot draw in the striped zone. Go under it.',
  },
  {
    id: 'w1-backstop',
    name: 'Backstop',
    world: 0,
    goal: 'cup',
    ball: [0.7, 10.2],
    ink: 9,
    par: 4,
    solids: [slab(0, 10, 8, 1, 1), box(0, 0, 9.8, 1), box(9.8, 0, 11.6, 0.3), box(11.6, 0, 20, 1)],
    spikes: [[14.5, 1, 20, 1.4]],
    cup: [9.8, 0.3, 11.6, 1],
    sol: [[11.95, 1.4, 13.4, 1.4, 13.4, 3.8, 11.95, 3.8, 11.95, 1.45]],
    tip: 'Close a loop to make a solid block.',
  },
  {
    id: 'w1-boss',
    name: 'Swing Gate',
    world: 0,
    boss: true,
    goal: 'cup',
    ball: [3, 10.5],
    ink: 17,
    par: 3.5,
    timer: 30,
    solids: [GROUND, box(1.5, 1, 2.2, 8), box(9, 1, 9.6, 4), box(14.3, 1, 14.6, 2.4), box(17, 1, 20, 6)],
    spikes: [[2.2, 1, 9, 1.4], [9.6, 1, 14.3, 1.4]],
    movers: [{ pts: box(7.8, 6.8, 8.2, 9.8), path: 'swing', amp: 0.7, period: 2.6 }],
    cup: [14.6, 1, 17, 2.4],
    sol: [[1.6, 8.7, 9.3, 4.45, 14.4, 2.8]],
    tip: 'Boss: the gate swings once you press Go. Keep the ball below it. The timer starts the level for you.',
  },
  // ---------- World 2: Workshop ----------
  {
    id: 'w2-push',
    name: 'Push Off',
    world: 1,
    goal: 'target',
    ball: [0.8, 10.2],
    ink: 8,
    par: 5.5,
    solids: [slab(0, 10, 5, 7.6), box(9, 0, 14, 6), box(14, 0, 20, 1), box(19.6, 1, 20, 6)],
    crates: [{ x: 12.8, y: 6.5, w: 1, h: 1, role: 'target' }],
    zone: [14.2, 1, 19.6, 4],
    sol: [[4.6, 8.05, 9.4, 6.4]],
    tip: 'Knock the blue crate into the green bin.',
  },
  {
    id: 'w2-table',
    name: 'Table Top',
    world: 1,
    goal: 'target',
    ball: [3.6, 10.5],
    ink: 9,
    par: 4,
    solids: [GROUND, box(2, 1, 2.8, 7.5), box(8, 1, 12, 5), box(18, 1, 20, 6)],
    spikes: [[2.8, 1, 8, 1.4]],
    crates: [{ x: 11.2, y: 5.5, w: 1, h: 1, role: 'target' }],
    zone: [12.4, 1, 18, 3],
    sol: [[2.3, 7.95, 8.5, 5.4]],
    tip: 'Ramp the ball onto the table.',
  },
  {
    id: 'w2-narrow',
    name: 'Narrow Gap',
    world: 1,
    goal: 'cup',
    ball: [0.8, 9.2],
    ink: 12,
    par: 4.5,
    solids: [slab(0, 9, 6, 5.4), box(14, 0, 16, 4.6), box(16, 0, 18, 3.4), box(18, 0, 20, 6.5)],
    nodraw: [[6.8, 6.2, 13.2, 12], [6.8, 0, 13.2, 3.2]],
    cup: [16, 3.4, 18, 4.6],
    sol: [[5.6, 5.95, 14.4, 5.0]],
    tip: 'Thread the bridge through the gap in the zones.',
  },
  {
    id: 'w2-topple',
    name: 'Knock Down',
    world: 1,
    goal: 'target',
    ball: [0.8, 10.2],
    ink: 8,
    par: 5,
    solids: [slab(0, 10, 5, 7.5), GROUND, box(8.5, 1, 12, 6)],
    spikes: [[0, 1, 8.5, 1.4]],
    crates: [{ x: 11.3, y: 7.0, w: 0.6, h: 2, role: 'target' }],
    zone: [12.2, 1, 20, 4],
    sol: [[4.6, 7.95, 8.9, 6.4]],
    tip: 'Tall crates tip over easily.',
  },
  {
    id: 'w2-baskets',
    name: 'Two Drops',
    world: 1,
    goal: 'keep',
    keep: 4,
    ball: [13.2, 10.5],
    ink: 19,
    par: 4,
    solids: [GROUND, box(3, 1.4, 4, 6), box(9.5, 1.4, 10.5, 6), box(16, 1.4, 17, 6)],
    spikes: [[0, 1, 20, 1.4]],
    crates: [{ x: 6.8, y: 10.5, w: 1, h: 1, role: 'keep' }],
    sol: [[3.4, 6.5, 6.8, 5.9, 10, 6.5, 13.2, 5.9, 16.6, 6.5]],
    tip: 'Keep the ball and the orange crate up for 4 seconds.',
  },
  {
    id: 'w2-stairs',
    name: 'Stairs',
    world: 1,
    goal: 'cup',
    ball: [0.7, 10.8],
    ink: 10,
    par: 6,
    solids: [slab(0, 10.6, 4, 9, 1), GROUND, [6.6, 0, 9, 0, 9, 6.8, 6.6, 7.3], [11.6, 0, 14, 0, 14, 4.8, 11.6, 5.3], box(14, 0, 16, 3.8), box(16, 0, 18, 2.6), box(18, 0, 20, 5)],
    spikes: [[4, 1, 6.6, 1.4], [9, 1, 11.6, 1.4]],
    cup: [16, 2.6, 18, 3.8],
    sol: [[3.6, 9.55, 7.0, 7.65], [8.6, 7.25, 12.0, 5.65]],
    tip: 'Two short strokes cost less than one long one.',
  },
  {
    id: 'w2-uphill',
    name: 'Uphill',
    world: 1,
    goal: 'cup',
    ball: [0.7, 11],
    ink: 11,
    par: 5,
    solids: [slab(0, 10.6, 6, 4, 1), GROUND, box(14, 1, 16, 5.5), box(16, 1, 18, 4.3), box(18, 1, 20, 7)],
    spikes: [[0, 1, 14, 1.4]],
    cup: [16, 4.3, 18, 5.5],
    sol: [[5.7, 4.6, 14.4, 6.0]],
    tip: 'A fast ball can roll uphill.',
  },
  {
    id: 'w2-boss',
    name: 'The Foreman',
    world: 1,
    boss: true,
    goal: 'target',
    ball: [0.8, 10.2],
    ink: 13,
    par: 5.5,
    timer: 30,
    solids: [slab(0, 10, 5, 7.6), [9, 0, 12, 0, 12, 5.6, 9, 6], box(12, 4.4, 12.5, 4.7), box(12, 0, 20, 1), box(16.2, 1, 16.5, 2), box(19.6, 1, 20, 6)],
    nodraw: [[5.6, 8.6, 9, 12]],
    crates: [{ x: 11.0, y: 6.28, w: 1, h: 1, role: 'target' }],
    movers: [{ pts: box(13.8, 6.4, 14.2, 9.6), path: 'swing', amp: 0.9, period: 2.2 }],
    zone: [16.5, 1, 19.6, 3],
    sol: [[4.6, 8.05, 9.4, 6.4], [12.25, 5.2, 16.35, 2.4]],
    tip: 'Boss: the crate must reach the far bin. Build it a chute, and mind the hammer.',
  },
  // ---------- World 3: Clockwork ----------
  {
    id: 'w3-spinner',
    name: 'Spinner',
    world: 2,
    goal: 'cup',
    ball: [0.8, 10.6],
    ink: 10,
    par: 5,
    solids: [slab(0, 10.5, 6, 7.6), GROUND, box(14, 1, 15.5, 7), box(15.5, 1, 17.5, 5.8), box(17.5, 1, 20, 8.5)],
    spikes: [[0, 1, 14, 1.4]],
    movers: [{ pts: box(8, 4.3, 12, 4.7), path: 'spin', speed: 1.4 }],
    cup: [15.5, 5.8, 17.5, 7],
    sol: [[5.6, 8.05, 14.4, 7.45]],
    tip: 'The bar spins after Go. Stay out of its circle.',
  },
  {
    id: 'w3-piston',
    name: 'Piston',
    world: 2,
    goal: 'cup',
    ball: [3.2, 6.45],
    ink: 8,
    par: 6.5,
    solids: [box(0, 0, 8, 6), GROUND, box(13, 1, 14, 6), box(14, 1, 16.5, 4.6), box(16.5, 1, 20, 7.5)],
    spikes: [[8, 1, 13, 1.4]],
    movers: [{ pts: box(0.4, 6.05, 2.4, 7.4), path: 'slide', dx: 3.5, period: 1.6 }],
    cup: [14, 4.6, 16.5, 6],
    sol: [[7.6, 6.45, 13.4, 6.4]],
    tip: 'The piston kicks the ball. Give it a road.',
  },
  {
    id: 'w3-lift',
    name: 'Lift',
    world: 2,
    goal: 'cup',
    ball: [0.8, 10.6],
    ink: 9,
    par: 4.5,
    solids: [slab(0, 10.5, 5.5, 7.0), GROUND, box(13, 1, 15, 6.2), box(15, 1, 17.2, 5), box(17.2, 1, 20, 8)],
    spikes: [[0, 1, 13, 1.4]],
    movers: [{ pts: box(7.5, 2.0, 10.5, 2.4), path: 'slide', dy: 3.2, period: 3 }],
    cup: [15, 5, 17.2, 6.2],
    sol: [[5.2, 7.45, 13.4, 6.6]],
    tip: 'The lift pushes up anything above it.',
  },
  {
    id: 'w3-pendulum',
    name: 'Pendulums',
    world: 2,
    goal: 'cup',
    ball: [0.8, 10.6],
    ink: 13,
    par: 4.5,
    solids: [slab(0, 10.5, 4.5, 8.2), GROUND, box(9.6, 1, 10.4, 4), box(15, 1, 15.3, 2.4), box(17.6, 1, 20, 6)],
    spikes: [[0, 1, 9.6, 1.4], [10.4, 1, 15, 1.4]],
    movers: [
      { pts: box(7.8, 7.6, 8.2, 10.8), path: 'swing', amp: 0.8, period: 2 },
      { pts: box(12.8, 4.9, 13.2, 8.3), path: 'swing', amp: 0.8, period: 2.4 },
    ],
    cup: [15.3, 1, 17.6, 2.4],
    sol: [[4.2, 8.75, 10, 4.45, 15.2, 2.85]],
    tip: 'Two gates swing. Go low.',
  },
  {
    id: 'w3-pit',
    name: 'Spike Pit',
    world: 2,
    goal: 'keep',
    keep: 5,
    ball: [10, 10.5],
    ink: 12,
    par: 5,
    solids: [GROUND, box(4.5, 1.4, 5.5, 5.5), box(14.5, 1.4, 15.5, 5.5)],
    spikes: [[0, 1, 20, 1.4]],
    movers: [{ pts: box(-2, 7.2, 1, 7.6), path: 'slide', dx: 21, period: 5 }],
    sol: [[5, 6.0, 7.5, 5.6, 12.5, 5.6, 15, 6.0]],
    tip: 'A sweeper bar passes over. Keep the basket low.',
  },
  {
    id: 'w3-tight',
    name: 'Tight Ink',
    world: 2,
    goal: 'cup',
    ball: [0.8, 10.6],
    ink: 5,
    par: 4,
    solids: [slab(0, 10.5, 7, 6.2), GROUND, box(9.5, 1, 13, 5.6), box(13, 1, 15.5, 4.2), box(15.5, 1, 20, 7)],
    spikes: [[0, 1, 9.5, 1.4]],
    movers: [{ pts: box(16.0, 7.4, 19.4, 7.8), path: 'spin', speed: 2 }],
    cup: [13, 4.2, 15.5, 5.6],
    sol: [[6.6, 6.75, 9.9, 6.05]],
    tip: 'Only 5 ink. Short and sharp.',
  },
  {
    id: 'w3-gears',
    name: 'Gear Train',
    world: 2,
    goal: 'target',
    ball: [0.8, 10.6],
    ink: 9,
    par: 5.5,
    solids: [slab(0, 10.5, 5, 8), box(9, 1, 13, 6.5), GROUND, box(19.6, 1, 20, 6)],
    spikes: [[0, 1, 9, 1.4]],
    crates: [{ x: 12.3, y: 7.0, w: 0.8, h: 1, role: 'target' }],
    movers: [{ pts: box(14.5, 2.6, 17.5, 3.0), path: 'spin', speed: 1.5 }],
    zone: [13.2, 1.4, 19.6, 3.5],
    sol: [[4.6, 8.45, 9.4, 6.9]],
    tip: 'Push the crate down past the gear.',
  },
  {
    id: 'w3-boss',
    name: 'Clock Tower',
    world: 2,
    boss: true,
    goal: 'cup',
    ball: [0.8, 10.6],
    ink: 14,
    par: 4.5,
    timer: 25,
    solids: [slab(0, 10.5, 4.5, 8.4), GROUND, box(9.6, 1, 10.4, 5.2), box(15.2, 1, 15.5, 3.4), box(17.8, 1, 20, 6.5)],
    spikes: [[0, 1, 9.6, 1.4], [10.4, 1, 15.2, 1.4]],
    movers: [
      { pts: box(5.5, 3.2, 9, 3.6), path: 'spin', speed: 1.6 },
      { pts: box(11.4, 9.5, 14.4, 9.9), path: 'slide', dy: -2.8, period: 2.2 },
    ],
    cup: [15.5, 1, 17.8, 3.4],
    sol: [[4.2, 8.95, 10, 5.65, 15.4, 3.9]],
    tip: 'Boss: a gear below, a crusher above, and a timer.',
  },
];

export const levelById = (id: string): LevelDef => LEVELS.find((l) => l.id === id)!;
