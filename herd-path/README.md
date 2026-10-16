# Herd Path

Unit guiding puzzle roguelite (like Lemmings). Status: playable.

## How to play

1. Critters drop from the hatch and walk on their own. They step up small bumps, turn at walls and fall off edges.
2. Pick a job in the job bar (keys `1`–`7`). Then click or tap a critter to give it the job.
3. Get at least the shown number of critters into the barn before the clock runs out.
4. The level starts paused. Look at it first, then press **Let them out**. You can give jobs while the game is paused.
5. Keys: `Space` pause, `F` speed x3, `N` twice nuke, `R` restart, `←` `→` look around, `Esc` menu.
6. On narrow screens the view zooms in. Drag the view or tap the mini map to look around.

## Rules

- A fall of more than 22 cells kills a critter. Water, fire, snap traps and the wolf also kill.
- Dirt and bricks can be dug. Steel and gates cannot.
- Each level gives a limited number of each job. The level gives the jobs its known solution needs. Rewards add extra jobs to every level.
- A level ends when no critter is still walking, when time runs out, or after a nuke. Blockers that still stand at the end count as lost.
- Clear: save at least the number needed. Critters that came out and did not reach the barn leave your herd for good.
- Fail or restart: you lose one heart and try the same level again with the full herd. With no hearts left, the run ends.
- Need per level: 7 + 3 × act + map row (+2 for bosses), but never more than the herd.

## Jobs

| Job | Effect |
|---|---|
| ✋ Blocker | Stands still. Other critters turn around at it. Another job (or a bomb) frees it. |
| ⛏️ Digger | Digs straight down, 5 cells wide, until it falls through or hits steel. |
| 👊 Basher | Digs a tunnel forward until no dirt is ahead. Stops at steel. |
| 🧱 Builder | Lays 12 bricks as a stair (1 up for every 2 forward). Stops at a wall. |
| 🧗 Climber | Climbs up walls. The skill stays with the critter. |
| ☂️ Floater | Opens an umbrella and survives any fall. The skill stays. |
| 💣 Bomber | Explodes after 3 seconds. Blasts dirt above its feet (radius 6). The critter is lost. |

Walkers wait behind a busy basher or builder instead of turning around.

## Obstacles

A level is a chain of hand-made obstacle segments. The seed sets their sizes: wall width and height, gap width, shelf height, depth, trap and hazard spots.

| Segment | Pack | Known solution |
|---|---|---|
| Dirt wall | Meadow | 👊 at the wall, or ✋ then 💣 on the blocker |
| Creek (water gap) | Meadow | 🧱 at the edge |
| High shelf | Meadow | 🧱 2 × height + 2 cells before the face |
| Burrow (platform over a cave, steel wall at the end) | Meadow | ⛏️ near the end of the platform |
| Snap trap (two traps on the path) | Meadow | 🧱 before the traps |
| Trap field (thick floor, traps on top) | Cave pack | ⛏️ then 👊 under the traps |
| Locked gate (lever on top) | Cave pack | 🧗 climbs the gate and pulls the lever |
| Deep pit | Cave pack | 🧱 at the edge |
| Fire pit, hot coals, burning field | Volcano pack | Like creek, snap trap and trap field |

## Bosses

| Act | Boss | Level |
|---|---|---|
| 🌿 Green Meadow | 🌊 The Flood | Water rises from the bottom up to the barn's floor. The barn is on a high shelf. |
| 🪨 Echo Caves | 🐺 The Wolf | A wolf patrols a field. Go under it with a digger and a basher. |
| 🌋 Ash Peaks | 🌋 The Furnace | Four fire segments and rising lava. |

## Curses

Cursed fields give two rewards.

| Curse | Effect |
|---|---|
| 💨 Stampede | Critters walk 50% faster. |
| 🌙 Dusk | The clock is 1.15 × the time the known solution needs to reach the goal, plus 5 s. |
| 🥚 Fragile | A fall of more than 16 cells kills. |

## Level check

Every level is proved before you see it:

1. The generator builds the segments and writes their solution as job triggers ("the first walker at x = 40 that walks right gets a builder").
2. It plays the triggers in the simulation with your herd size and the curse.
3. It keeps the level only when the solution saves at least the need and 80% of the herd. Else it tries the next seed (up to 16 tries), then falls back to a plain wall level.
4. The clock is set from the solution: 1.45 × the time of the last save + 20 s.

## Run loop

1. 3 acts. Each act has a map of 5 rows with branching paths: a first field, 3 rows of 2–3 choices, and the boss.
2. Nodes: 🌾 field (one reward), ☠️ cursed field (two rewards), 🌼 meadow (heal a heart, 5 lambs, or +2 of a job).
3. Rewards: pick 1 of 3. Extra jobs (+2 of a job in every level, or a new job type), 4 lambs (critters), or a heart. Bosses give +3 jobs, 7 lambs or a big heart (+1 max heart and full heal).
4. Start: 20 critters, 3 hearts, no extra jobs. Act 1 levels give 1 spare job of each needed type.
5. Clear the Furnace to win. Score: 10 per saved critter, 30 per cleared level, 150 per act, and on a win 1000 + 100 per heart + 10 per critter.

## Meta progress

Each run gives wool 🧶 (score / 200). Spend it in the barn on the title screen.

| Unlock | Cost | Effect |
|---|---|---|
| 💣 Bomber job | 6 | Bombers can show up as rewards. |
| 🪨 Cave pack | 10 | Adds trap fields, locked gates and deep pits. |
| 🎒 Shepherd's kit | 14 | Start with +1 builder, basher and digger. |
| 🐑 Big flock | 16 | Start with 25 critters. |
| 🌋 Volcano pack | 20 | Adds fire pits, hot coals and burning fields. |
| 🔔 Bell sheep | 26 | Start with 4 hearts. |

The run is saved in `localStorage` (`herdpath.run`, `herdpath.meta`). A reload during a level restarts that level without a heart cost.

## Balance

A headless sim plays full runs (200 runs per bot):

| Bot | Base game | With cave + volcano packs | All unlocks |
|---|---|---|---|
| Weak (random jobs on random critters, 0.5 per second) | 0% | 0% | 0% |
| Good (replays the solution with 0–5 ticks delay, 10% misses, 5% wrong clicks) | 45% | 28% | 41% |
| Perfect (exact replay) | 100% | 100% | 100% |

## Code

| File | Contents |
|---|---|
| `src/game.ts` | Terrain mask, critter state machine, jobs, traps, gates, wolf, flood. Pure and deterministic. |
| `src/levels.ts` | Segment builders, level plans, the level check |
| `src/bot.ts` | Solution replay (exact or noisy), random clicks, stall nuke |
| `src/run.ts` | Act maps, rewards, meadows, score, save data |
| `src/data.ts` | Jobs, curses, themes, acts, bosses, unlocks |
| `src/app.ts` | Screens, canvas renderer, camera, input, debug API |
| `src/sfx.ts` | WebAudio synth |

## Debug

Open the game with `?debug` (add `&fast` for big steps). The console then has `window.debug`:

- `debug.step()`: one bot action. In a level the bot replays the known solution and plays 45 ticks (400 with `&fast`).
- `debug.state()`: screen, run, level stats, critters, view.
- `debug.solve()`: the bot plays the current level from now on.
- `debug.win()`, `debug.wool(n)`.
