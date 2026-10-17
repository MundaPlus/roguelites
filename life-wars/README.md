# Life Wars

New-concept roguelite: fight with cellular automata. Status: playable.

Place a few cells. Let the board run. Kill the enemy core.

## How to play

1. Each turn the enemy places its cells first. They pulse with a white ring.
2. Pick a template under the board and stamp it in your green zone (the bottom 5 rows).
   - Mouse: the template follows the pointer. Click to stamp. Right-click rotates.
   - Touch: the first tap aims (a ghost shows the shape). A second tap on the same square stamps. The `✓ Stamp` button does the same.
   - Keys: `1`–`9` pick a template, arrows move the aim, `Space` stamps, `R` rotates, `F` mirrors, `Z` undoes, `X` clears.
3. Tap one of your new cells to take its stamp back.
4. The ghost preview shows the board after 1, 4, 12 or 24 generations (dashed outlines). Green dots show where your cells will pass. The line under the board shows the damage and the cell count.
5. Press `▶ Run` (or `Enter`). The board runs 12 generations. `⏩ Fast` (or `Space`) speeds up the animation. `⏭ Skip` (or `S`) jumps to the end.

## Rules

- Every square has 8 neighbors. Each color counts only its own neighbors and follows its own rule.
- The rule shows in plain words next to each colony, for example "Born on an empty square with 3 neighbors. Survives with 2 or 3 neighbors, else dies." The code (`B3/S23`) shows too.
- Clash: when green and pink cells touch, both die. When both colors would be born on the same square, it stays empty.
- Core hit: a cell that reaches the row next to the enemy core hits it for 1 and is used up.
- Invaders: at the end of each turn, each of your cells inside the enemy zone hits the enemy core for 1 (at most 8 per turn). The enemy hurts you the same way.
- Your core HP carries over between fights. After turn 12 of a fight, overgrowth costs you 3 core HP per turn.
- You get 6 cells per turn at the start. Up to 4 unused cells carry over to the next turn.

## Templates

| Template | Kind | Cells | Notes |
|---|---|---|---|
| Cell | single | 1 | Dies alone. Use it to change other shapes. |
| Block | still life | 4 | Never changes. A cheap wall. |
| Blinker | oscillator | 3 | Flips between a row and a column. |
| Glider | spaceship | 5 | Flies diagonally, 1 square every 4 generations. |
| Boat, Beehive, Loaf | still life | 5–7 | Wider walls. |
| Toad, Beacon | oscillator | 6–8 | Period-2 guards. |
| Eater | still life | 7 | Eats gliders that hit it the right way. |
| Light ship | spaceship | 9 | Flies straight, 2 squares every 4 generations. |
| R-pentomino | burst | 5 | Grows into a big cloud. |
| Middle ship, Diehard, Acorn | ship / burst | 7–11 | Spore Lab unlocks. |

The start set is Cell, Block, Blinker and Glider. Ship buttons show their flight direction (↖ ↑ …) for the current rotation.

## Rule cards

| Card | Effect |
|---|---|
| 🪨 Stubborn | Your cells also survive with 6 neighbors. |
| 🧬 HighLife | Your cells are also born with 6 neighbors. |
| 🌱 Lone Root | Your cells also survive with 0 neighbors. |
| 🧱 Thick Walls | Your cells die in a clash only with 2+ enemy neighbors. |
| 💚 Regrowth | Your core heals 1 per turn. |
| ⏫ Forward Zone | Your zone reaches 1 row further forward. |
| ✂️ Stencil | Templates with 4+ cells cost 1 less. |
| 🗡️ Sharp Edges | Each core hit deals 2 (unlock). |
| 🏦 Seed Bank | Up to 8 unused cells carry over (unlock). |
| 🩸 Leech | Every 6 clashes in a turn heal your core 1 (unlock). |
| 🔥 Wildfire | Your cells are also born with 4 neighbors (unlock). |

## Enemies

| Act | Fights | Elite | Boss |
|---|---|---|---|
| 🌿 Petri Dish | Green Mold, Yeast Bloom, Slime Line (Conway Life) | 🐝 HighLife Hive (B36/S23) | 🍄 Mother Mold: ships and eaters |
| 🪸 Coral Reef | Coral Polyp (DotLife B3/S023), Walker Swarm (Pedestrian B38/S23), Dry Spores (DryLife B37/S23) | 🖋️ Ink Stain (Stains B3678/S235678) | 👑 Coral Queen: DotLife, thick skin |
| 🌑 Deep Ooze | 2×2 Twins (B36/S125), Square Rot (B34/S34), Assimilator (B345/S4567) | 🌀 Morley Drift (Move B368/S245) | 🗿 The Ancient: thick skin, hits deal 2 |

The first fight of a run can be a tutorial against Petri Moss. A coach box teaches the glider, the block, the blinker and the preview. It is on by default until you win it once.

The enemy AI tries a number of random placements with its own templates and keeps the one with the best simulated result after 36 generations.

## Run loop

1. 3 acts. Each act: fight, fight, a fork, fight, boss.
2. After a fight: spores 🍄 and one pick of 3 (a template, a rule card, +1 cell per turn, healing or more max core HP).
3. The fork: an elite (always offers +1 cell per turn, more spores) or the lab (heal 6, shop with templates, rule cards, healing and +1 cell).
4. A boss heals your core by 40% of its max.
5. Win by beating The Ancient. Score: fights, elites, bosses, damage dealt, and the core left on a win.

## Meta progress

Each run gives samples 🧪 (score / 60). The Spore Lab on the title screen unlocks 3 templates and 4 rule cards for the reward pool of later runs. The title screen also shows runs, wins, best act and best score.

## Code

| File | Contents |
|---|---|
| `src/engine.ts` | Board (typed arrays), two-color life step, clash, core hits, invaders, shapes, rule words |
| `src/data.ts` | Templates, rule cards, enemies, acts, unlocks |
| `src/ai.ts` | Random placement, placement scoring by simulation, best-of-N search |
| `src/bot.ts` | Player bots (random and smart) and reward picks |
| `src/run.ts` | Run state, map, turn resolution, rewards, lab, score, saves (`life.run`, `life.meta`) |
| `src/app.ts` | Screens, canvas renderer, ghost preview, generation animation, input, debug API |
| `src/sfx.ts` | WebAudio synth |

## Debug

Open the game with `?debug` (add `&fast` to skip the animations). The console then has `window.debug`:

- `debug.step(tries?)`: one bot action. In a fight the smart bot tries `tries` placements (default 30), keeps the best simulated one and runs the turn.
- `debug.state()`: screen, stage, act, core, enemy, turn and more.
- `debug.win()`, `debug.core(n)`, `debug.samples(n)`, `debug.rewards()`.

## Balance

A headless sim plays full runs with the same rules (see `CHANGELOG.md` for the numbers). A random placer never wins. The smart bot with 30 tries wins about half the runs. With 10 tries it wins about a quarter.
