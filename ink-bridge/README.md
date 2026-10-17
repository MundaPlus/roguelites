# Ink Bridge

Line-drawing physics puzzle roguelite (like Brain It On / Crayon Physics). Status: playable.

## How to play

1. Draw with the mouse or a finger on the level. When you let go, the line becomes a stroke.
2. Press **Go** (or `Space`). The strokes turn into solid objects. The ball and the crates start to fall.
3. Reach the goal of the level. A miss costs a heart. Your strokes stay, so you can fix them and press Go again.
4. Keys: `Space`/`Enter` Go or continue, `Z`/`Backspace` undo, `1`–`5` pick a pen, `F` faster play, `Esc` menu.

## Rules

- Ink is limited per level. Undo gives the ink back.
- A stroke stops at walls, crates, the ball and striped no-draw zones.
- Strokes that cross each other become one rigid object.
- A stroke that ends near its start (a closed loop) becomes a solid filled block.
- A miss happens when the ball falls out, touches spikes, stops short of the goal, or after 14 seconds.
- Stars per level: 1 for the clear, 1 for ink at or below the ⭐ mark (85% of the base ink), 1 for time from Go to the goal under par. Keep goals give the third star for no miss.
- Bosses have moving parts and a draw timer. The dashed lines show where the parts move. When the timer ends, Go starts by itself.

## Goals

| Goal | Win when |
|---|---|
| 🏁 Cup | The ball enters the green cup. |
| 📦 Target | The blue crate reaches the green zone. |
| ⏱️ Keep | The ball (and orange crates) stay off the spikes and in play until the clock ends. |

## Levels

24 hand-made levels. Each level can appear mirrored. Each stores one known pencil solution, and the sim checks it in both directions.

| World | Levels | Boss |
|---|---|---|
| ⛰️ Paper Hills | First Bridge, Slide In, Step Down, Over the Wall, Catch!, Low Fence, Backstop | 👑 Swing Gate (swinging gate, 30 s timer) |
| 🧰 Workshop | Push Off, Table Top, Narrow Gap, Knock Down, Two Drops, Stairs, Uphill | 👑 The Foreman (crate chute under a hammer, 30 s) |
| ⚙️ Clockwork | Spinner, Piston, Lift, Pendulums, Spike Pit, Tight Ink, Gear Train | 👑 Clock Tower (gear and crusher, 25 s) |

## Pens

| Pen | Effect | Unlock (lifetime stars) |
|---|---|---|
| ✏️ Pencil | Plain ink. No charge limit. | Start |
| 🟢 Rubber | Bouncy strokes. | Start |
| ⚫ Lead | Six times heavier. | Start |
| 📌 Glue | The stroke stays in place. Crossing strokes stay too. | 15 |
| 🧊 Ice | No friction. | 35 |

Other pens have charges. A charge is spent when you clear a level with a stroke of that pen.

## Charms

| Charm | Effect | Unlock |
|---|---|---|
| 🫙 Big Inkwell | +25% ink in every level | Start |
| ⏳ Hourglass | Boss timers +10 s, time star limits +50% | Start |
| 🩹 Patch Kit | The first miss in each world costs no heart | Start |
| 🔭 Star Lens | +1 star for each 3-star level | Start |
| 🧰 Pen Case | +2 charges on every pen you get | 25 |
| 💗 Paper Heart | +1 max heart and heal 1 | 50 |

## Run loop

1. 3 worlds with 6 steps each: puzzle, puzzle, chest, puzzle, shop, boss.
2. At each puzzle step, choose 1 of 2 levels. The map shows a small picture of each.
3. You start with 3 hearts. A miss costs 1. Clearing a boss heals 1. At 0 hearts the run ends.
4. Chest: take 1 of 3 (a pen with charges, a charm, +20% ink, or a heart).
5. Shop: spend stars on a heart (4), pen charges (3), +15% ink (5) or a charm (7).
6. Score: stars × 10 + levels × 25, plus 200 and 30 per heart for a win.

## Meta progress

Stars from all runs add up in the sketchbook on the title screen. They unlock the glue and ice pens, two charms and three perks: Spare Heart (60, +1 heart at the start), Starter Rubber (90), Deep Well (130, +10% ink).

## Balance

The headless sim plays full runs. The weak bot draws random lines. The good bot draws the stored solutions with a hand error (σ in world units).

| Bot | Win rate |
|---|---|
| Random lines | 0% |
| Solution, σ 0.25 | 12% |
| Solution, σ 0.15 | 53% |
| Solution, σ 0.08 | 82% |

## Code

| File | Contents |
|---|---|
| `src/physics.ts` | 2D rigid-body engine: circles, capsules and convex polygons with a round skin, SAT with edge clipping, sequential impulses with warm start, split impulse, sleeping islands, fixed step |
| `src/game.ts` | One level: build, draw phase (stroke sampling, closed loops), Go, movers, goal and miss checks |
| `src/levels.ts` | The 24 levels with their solutions |
| `src/data.ts` | Pens, charms, worlds, perks |
| `src/run.ts` | Run state, map plan, chest, shop, stars, score, save data |
| `src/bot.ts` | Bot drawing (solution with hand error, random lines) |
| `src/draw.ts` | Canvas renderer |
| `src/app.ts` | Screens, input, game loop, debug API |

The physics has no randomness. The same strokes always give the same result.

## Debug

Open with `?debug` to get `window.debug`:

- `state()`: screen, world, step, hearts, wallet, level, phase, strokes, ink, result, end.
- `step()`: one bot action. On a level it draws the stored solution with hand error `debug.sigma` (default 0.08) and presses Go. With `&fast` it plays 3 seconds of physics per call. It returns `'busy'` while a level plays without `fast`.
- `solve(sigma)`: draw the stored solution on the current level.
- `stars(n)`, `lifetime(n)`, `pen(id, n)`: cheats for tests.

Save keys: `inkbridge.run`, `inkbridge.meta`.
