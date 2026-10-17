# Crate Crypt

Push-block puzzle roguelite (like Sokoban roguelites). Status: playable.

## How to play

1. Push crates onto all plates. Then the door 🚪 opens and you walk out.
2. You push one crate at a time. You cannot pull.
3. Keys: arrows or `WASD` move, `Z` undoes, `R` resets the room, `Space` waits a turn, `1`–`5` use tools, `Esc` cancels an aimed tool.
4. Touch: swipe on the board, tap a tile next to the hero, or use the on-screen arrows.

## Rules

- **Move budget 🕯️.** Each floor gives one budget for all its rooms. Every step, push, shove and wait costs 1.
- **Undo is free and unlimited** inside a room. It also gives the moves back. When you leave a room, its moves are spent.
- **Out of moves.** Undo to find a shorter way, or collapse: lose a ❤️ and get 15% of the floor budget (at least 15). No hearts left ends the run.
- **Par** is the move count of the solver's solution. The floor budget is the par of the main rooms × slack + 15. The slack goes from 1.25 on floor 1 to 1.14 on floor 10.
- **Monsters** move after each of your moves. Walk into a monster to shove it back one tile. With no room behind it, it gets squashed. A monster that walks into you bites: −3 moves. Monsters block crates, but a crate crushes a monster that is pinned against a wall. Monsters never step on plates.
- Left-over moves turn into gold (1 per 4) when you go down the stairs.

## Content

| Crate | Effect |
|---|---|
| 📦 Crate | Moves one tile per push. |
| 🧊 Ice crate | Slides until it hits a wall, a crate or a monster. |
| ⚙️ Iron crate | Needs might: walk over the 💪 pickup in the room, or drink a Might Tonic. |
| 💣 Bomb crate | Push it into a cracked wall: the wall breaks and shows a chest (gem + key, tool or gold). The blast kills monsters next to it. |

| Monster | From floor | Pattern |
|---|---|---|
| 🦇 Bat | 3 | Flies in a line, turns at walls. |
| 💀 Skull | 5 | Random step each turn (seeded, so undo replays it). |
| 🧟 Ghoul | 7 | Steps toward you every second turn. |

| Tool | Effect | Shop price |
|---|---|---|
| 🧤 Pull Glove | Next step pulls the crate behind you. | 14 |
| 🌀 Crate Teleport | Swap places with the first crate in a direction (unlock). | 18 |
| ⏳ Hourglass | +15 moves. | 16 |
| 👻 Wall Phase | Walk through one wall (unlock). | 15 |
| 💪 Might Tonic | Push iron crates in this room. | 10 |

| Character | Perk | Cost |
|---|---|---|
| 🧑‍🔧 Digger | 3 hearts, starts with a Pull Glove. | free |
| 🦍 Brute | Pushes iron crates without might. 10% fewer moves. | 40 🦴 |
| 🦹 Thief | Starts with 2 keys. Coins count double. | 60 🦴 |
| 🧘 Monk | 4 hearts, starts with 2 Hourglasses. | 90 🦴 |

## Run loop

1. 10 floors in 5 themes. Each floor is a map of connected rooms.
2. The middle row is the main path: 3 to 6 puzzle rooms. The last one is the stairs room 🪜, with monsters. Floor 10 ends with the Crypt Heart, a bigger room with 4 crates.
3. Side rooms hang off the main rooms: 🛒 shop, 💰 treasure puzzle, 🔒 vault (costs a key 🗝️), ⛲ shrine (heal a heart or +moves).
4. After each puzzle room, pick 1 of 3 rewards: a tool, gold, moves or a key.
5. Clear the stairs room, then go down. Reach the bottom of floor 10 to win.

## Room generation

1. A shape comes from one of 10 hand-made templates (rotated and mirrored) or from random wall blocks.
2. The crates start on the plates. Reverse play then pulls them away with random pulls. A pull is a legal move backwards, so the room can always be solved.
3. A breadth-first solver over pushes checks the room and gives its par. The generator keeps the hardest of a few tries.
4. Ice, iron and bomb crates are added one by one. Each change is checked with the solver again and dropped if the room breaks.

## Meta progress

Each run gives bones 🦴 (score / 50). Spend them on the title screen on 3 characters and 2 tools.

## Code

| File | Contents |
|---|---|
| `src/puzzle.ts` | Pure rules: `move(state, dir) => state`, tools, monsters, reach and walk paths |
| `src/solver.ts` | BFS over pushes, turned into a full move list |
| `src/gen.ts` | Templates, random shapes, reverse play, special crates, loot, monsters |
| `src/run.ts` | Floor map, budget, rewards, shop, vault, shrine, score, save data |
| `src/bot.ts` | Solver bot with optional noise, floor and shop choices |
| `src/data.ts` | Crates, monsters, tools, characters, themes, templates |
| `src/app.ts` | Screens, canvas renderer, animations, input, debug API |

The undo stack is a list of earlier states, because `move` never changes its input.

## Balance

A headless sim plays full runs with the bots in `src/bot.ts` (100 runs per bot). The bots follow the solver. Noise adds a random step and the step back. A random push gets undone.

| Bot | Wasted moves | Wins |
|---|---|---|
| Perfect (no noise) | 2% | 97 of 100 |
| Human-like (noise 0.27) | 37% | 44 of 100 |
| Weak (noise 0.45, random rooms) | — | 0 of 100 |

Monsters can still cost the perfect bot a run: it does not dodge bites.

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.debug`:

- `debug.step()`: one bot action. In a room the bot plays one move of the solver plan.
- `debug.state()`: screen, floor, hearts, budget, gold, room info and the end result.
- `debug.floor(n)`, `debug.skip()`, `debug.tool(id, n)`, `debug.gold(n)`, `debug.bones(n)`.
