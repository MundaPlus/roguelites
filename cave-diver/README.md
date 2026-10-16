# Cave Diver

Side-view platformer roguelite (like Spelunky). Status: playable.

## How to play

1. Get to the exit door at the bottom of each cave. A path from the entrance to the exit always exists.
2. Keys: `←→` or `A D` move. `Z`, `Space` or `K` jump. `X` or `J` whip. `C` or `L` bomb. `V` or `R` rope. `↑` climbs and buys. `↓` climbs down and looks down. `Esc` opens the menu. `M` mutes.
3. Touch: the on-screen pad has a d-pad and Rope, Bomb, Whip and Jump buttons. The 🎮 button in the top bar shows or hides the pad.
4. Hold jump to jump higher. You can still jump for a moment after you leave a ledge, and a jump pressed just before you land still counts.
5. Jump into the edge of a wall to hang on it. Jump again to climb up.
6. Jump on an enemy to stomp it. `↓` + whip picks up a rock or a pot. Whip again to throw it.
7. `↓` + bomb drops a bomb at your feet. A rope reaches up to 8 tiles.

## Rules

- You start with 4 HP, 4 bombs and 4 ropes.
- Each level has one pet. Touch it and reach the exit with it for +1 HP.
- Crates hold bombs, ropes, an item, a potion or a gem. Whip them open.
- Some levels have a shop. Stand on an item and press `↑` to buy it.
- After 3:00 in a level a ghost comes. It passes through walls. Its touch costs 2 HP.
- Spikes hurt (2) when you fall on them, not when you walk over them.

## Zones

| Zone | Levels | Enemies | Traps |
|---|---|---|---|
| ⛏️ Mines | 1-1 to 1-4 | Snake, Caveman, Bat, Spider | Spikes, arrow traps, 1 falling block |
| 🌿 Jungle | 2-1 to 2-4 | Frog, Mantrap, Snake, Caveman, Bat, Spider | Spikes, arrow traps, falling blocks |
| ❄️ Ice Caves | 3-1 to 3-4 | Yeti, Caveman, Frog, Bat, Spider | Ice floors, icicles, spikes, arrow traps |
| 🏛️ Temple | 4-1 to 4-3 | Mummy, Scorpion, Caveman, Bat | Lava, falling blocks, spikes, arrow traps |
| 🗿 Boss | 4-4 | Stone King | It leaps and shakes the floor when it lands. Jump as it lands. |

## Enemies

| Enemy | HP | Behavior |
|---|---|---|
| 🐍 Snake | 1 | Walks back and forth. |
| 🦇 Bat | 1 | Hangs on the ceiling, flies at you. |
| 🕷️ Spider | 1 | Drops when you walk below, then hops. |
| 🧔 Caveman | 2 | Charges when he sees you on his row. |
| 🐸 Frog | 1 | Hops at you. |
| 🪴 Mantrap | 3 | Slow walker. |
| 🦍 Yeti | 3 | Slow. Its hit knocks you far. |
| 🧟 Mummy | 4 | Very slow. Hits for 2. |
| 🦂 Scorpion | 2 | Runs at you on its row. |
| 🗿 Stone King | 24 | Boss. Calls mummies and scorpions. |

## Items

| Item | Effect |
|---|---|
| 🥾 Spring Shoes | Jump higher |
| 🧤 Climbing Gloves | Wall slide and wall jump |
| 🔫 Shotgun | Attack fires 5 pellets |
| 🚀 Jetpack | Press jump again in the air to fly |
| 🧭 Compass | An arrow points to the exit |
| 🧣 Cape | Hold jump to fall slowly |
| 👟 Spike Shoes | Stomps deal 3 damage |
| ⚾ Pitcher's Mitt | Throw much farther |
| 🍷 Kapala | +1 HP every 8 kills |
| 💣 Bomb Bag / 🪢 Rope Pile / 🧪 Potion | +3 bombs / +3 ropes / +1 HP |

## Run loop

1. Title screen: new run or continue. Pick a start zone.
2. 16 levels in 4 zones. After each level a summary screen shows the time, gold, kills and the pet.
3. Level 4-4 is the Stone King. Beat it and walk through the exit to win.
4. The end screen shows the score: gold + 1000 per level cleared + 500 per pet + 10000 for a win.

## Meta progress

- The title screen shows runs, wins, the deepest level, the best score, pets saved and enemies beaten.
- Reach a zone 3 times to open a shortcut that starts the run in that zone.
- Save data: `cave.run` (the run at the start of the current level) and `cave.meta` in `localStorage`. A continued run restarts the current level.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Tiles, zones, enemies, items |
| `src/level.ts` | Level generator: 4×4 room templates, path walk, drops, shop, traps, spawns, boss arena |
| `src/nav.ts` | Move graph (walk, fall, jump, climb, drop) and Dijkstra. The level check and the bot use it |
| `src/world.ts` | 60 Hz simulation: player physics, enemies, items, bombs, ropes, traps, ghost, boss |
| `src/bot.ts` | Good bot (plans on the move graph) and weak bot (pushes toward the exit) |
| `src/run.ts` | Run state, score, meta, save data |
| `src/render.ts` | Canvas renderer, camera, particles |
| `src/app.ts` | Screens, input (keys, touch pad), game loop, debug API |
| `src/sfx.ts` | WebAudio synth |

The generator checks every level with the move graph. If a level has no path to the exit, it tries again, and at last it digs a corridor.

## Debug

Open the game with `?debug` (add `&fast` for longer bot steps). The console then has `window.debug`:

- `debug.state()`: screen (`title`, `play`, `cleared`, `end`), level, HP, gold, player, boss HP, teleports.
- `debug.step()`: one bot action. In a level it plays 2 s of game time (10 s with `&fast`) with the good bot. If the bot needs more than 2 minutes in a level, it teleports to the exit and `teleports` goes up.
- `debug.win()`, `debug.hp(n)`, `debug.level(i)`, `debug.item(id)`, `debug.human()`.

## Balance

A headless sim plays full runs (200 seeds per bot): the good bot wins 46%, the weak bot wins 0%.
