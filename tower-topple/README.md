# Tower Topple

Physics stacking roguelite (like Tricky Towers). Status: playable.

## How to play

1. Blocks fall from the top of the screen. Move them with `←` `→` (or `A` `D`), turn them with `↑` (or `W`, `X`), and drop them with `Space`. Hold `↓` to fall faster.
2. With a mouse or a finger, drag on the tower view to move the block. Tap to turn it. Swipe down to drop it. Phones also get 5 buttons below the view: move left, turn, fall faster, drop, move right.
3. While a block falls, you control it. When it touches the tower, physics takes over. The block has weight and friction, and it can slide, tip and fall.
4. A block that falls off the platform costs 1 life. One collapse costs at most 2 lives: more blocks lost in the same 2 seconds are free. At 0 lives the run ends.
5. Spell cards sit in your hand (up to 5). Click a card or press `1`–`5` to cast it. Each card is used once.
6. `Esc` opens the menu (resume, abandon run, title screen). The top bar has the help, sound and menu buttons.

## Challenges

| Challenge | Goal | Fail |
|---|---|---|
| 🏁 Race | Build up to the goal line. The settled tower must stay above it for 2 seconds. | The timer runs out (−1 life). |
| ⏳ Hold | Place all blocks. Then a storm (wind swings, quakes from world 2) hits the tower for 14–22 s. | Out of lives. |
| 📏 Ceiling | Place all blocks below the red laser. A block that comes to rest above it is zapped (−1 life). | Out of lives. |

Elites add a curse every 12 s. Bosses are races with a higher goal and their own curses.

## Blocks

- Shapes: the 7 tetrominoes (I, O, T, L, J, S, Z). The Workshop unlock "Small blocks" adds 2- and 3-cell blocks. The Bloat curse sends 5-cell blocks.
- Materials: wood (normal), stone (heavy, grippy), ice (slippery), iron (from the Heavy spell). Ice and stone blocks come by chance per world.

## Spells

| Spell | Effect | Source |
|---|---|---|
| 🍯 Glue | The falling block sticks to the first thing it touches. On the platform it becomes rooted. | Start |
| ⚓ Heavy | The falling block turns to iron and pins itself where it lands. | Start |
| 🔹 Shrink | The falling block shrinks to 60% size. | Start |
| 🌿 Vines | Roots every resting block. Rooted blocks never move. | Start |
| 🕊️ Calm | Stops wind, quakes and curses for 20 s. | Workshop |
| ↩️ Undo | Removes the last block you placed. | Workshop |
| 💖 Mend | Gain 1 life. | Workshop |
| 🧱 Ledge | The platform grows 1 cell on each side. | Workshop |

## Worlds and curses

| World | Hazards | Boss | Boss curses |
|---|---|---|---|
| 🌼 Meadow | Light breeze, stone blocks | 🌪️ Gale Giant | Gust, Bloat |
| ⛏️ Quarry | Quakes every 16 s, ice and stone blocks | 🗿 Stone Golem | Quake, Rockfall, Bloat, Frost |
| 🏔️ Sky Peak | Wind, moving platform, ice and stone blocks | 🧙 Storm Wizard | All 6 curses |

Curses: 🌬️ Gust (strong wind for 4 s), 🌋 Quake (the platform shakes for 3 s), ❄️ Frost (the next 2 blocks are ice), 🎈 Bloat (the next block has 5 cells), 🪨 Rockfall (rocks fall on the tower), ↔️ Drift (the platform slides for 6 s). A warning shows 1.5 s before each curse.

## Run loop

1. 3 worlds with 6 steps each. At each step choose a node: a challenge, an elite, a camp or a shop. Step 6 is the boss.
2. A won challenge gives coins (more when time is left), 1 spell card from a pick of 3, and +1 life when you lost no life. Elites also give a bonus card. Bosses give +2 lives.
3. A failed challenge costs 1 more life and gives 3 coins. The run goes on while you have lives.
4. Camp: rest for 3 lives, or study (take 1 of 3 spells).
5. Shop: 4 spells, 1 life, and +1 max life.
6. Beat the Storm Wizard to win.

The run saves to `localStorage` (`towertopple.run`) at each step. If you leave during a challenge, "Continue" costs 1 life.

## Meta progress

Each run gives bricks 🧱 (score / 150). Spend them in the Workshop on the title screen: 4 spells, the small block set, an extra starting heart and a starter Glue card. The title screen also shows runs, wins, best world, best height and best score (`towertopple.meta`).

## Physics

`src/physics.ts` is a small rigid-body engine written for this game. No library.

- Each body is a compound of boxes. A polyomino is split into few rectangles.
- Box contacts use the Box2D-lite clipping method. The solver uses sequential impulses with warm starting, a 2-point block solver, friction and restitution for fast hits.
- Position errors are fixed with split impulses, so they do not add energy.
- Calm groups of touching bodies go to sleep. A moving body wakes the sleeping bodies it touches.
- The world steps at a fixed 60 Hz. A brick wall of 56 blocks stands in tests.

## Balance

Headless sim (`esbuild` bundle of the game modules, bots play full runs):

| Bot | Runs | Wins |
|---|---|---|
| Random spots, random choices | 100 | 0% |
| Best spot, no spells | 50 | 0% |
| Best spot, spells, sensible choices | 100 | 44% |

Most good-bot runs that fail end in world 3 (Sky Peak boss wins about 63% of tries).

## Code

| File | Contents |
|---|---|
| `src/physics.ts` | Rigid-body engine: box contacts, solver, sleeping |
| `src/game.ts` | One challenge: falling piece, hazards, curses, spells, rules |
| `src/data.ts` | Shapes, materials, spells, curses, worlds, unlocks |
| `src/run.ts` | Map, challenge specs, rewards, shop, score, save data |
| `src/bot.ts` | Drop-spot scoring for the bots |
| `src/app.ts` | Screens, canvas renderer, input, debug API |
| `src/sfx.ts` | WebAudio sound effects |

## Debug

Open the game with `?debug` (add `&fast` to skip the end-of-challenge wait). The console then has `window.debug`:

- `debug.step()`: one bot action. In a challenge it plays 1 s of game time (4 s with `fast`) with the smart bot.
- `debug.state()`: screen, world, step, lives, coins, hand, and the challenge state.
- `debug.card(id)`, `debug.lives(n)`, `debug.bricks(n)`, `debug.win()`.
