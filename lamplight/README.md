# Lamplight

New-concept roguelite: move the lights, shadows fight. Status: playable.

You never move your figures. You move the lamps. The shadows fight.

## How to play

1. Drag one of your lamps to a new tile. You can also tap a lamp (on the board or in the tray) and then tap a tile. Mouse users can point at a tile to preview it first.
2. The board always shows the next strike: every shadow, every hit (`−N` badges, 💀 for a kill) and every clash 💥. The panel under the board sums it up: damage you deal and damage you take.
3. Placing a lamp is free until you press **Cast**. `↺ Reset` puts the lamps back.
4. **Cast** resolves all shadows at once, in both directions. Then the enemies walk and move their lamps. What you see before you cast is what happens.
5. Keys: `1`–`4` pick a lamp, arrows move the cursor, `Space` places, `Enter` casts, `R` resets, `Esc` cancels.

## Rules

- **Light:** a lamp lights every figure within its reach. Reach is a square around the lamp (diagonal steps count as 1). Walls block light.
- **Shadow:** each lit figure casts a shadow away from the lamp. Draw a line from the lamp through the figure. The shadow continues that line for the lamp's shadow length. Tall figures add to the length.
- Walls, figures and lamps stop shadows.
- Lamps light both sides. Your lamps also make enemies cast shadows, and enemy lamps make your figures cast shadows.
- **Hit:** a shadow that reaches an enemy figure deals the owner's attack plus the lamp's bonus damage.
- **Clash:** when one of your shadows crosses an enemy shadow, both shadows stop on that tile. Both owners take 1 damage.
- Your shadows are blue with dots. Enemy shadows are red with stripes.
- **Turn:** you have 1 lamp move per turn (2 with the Second Hand upgrade). A lamp moves up to its move range, measured from where it started the turn.
- **The dark:** after turn 12, every figure on both sides loses 1, then 2, then 3 HP at the end of each turn. This stops stalemates.
- Enemies walk toward your figures and pick the spot that hurts you most in the next strike. Free enemy lamps (wisps) do the same.

## Lamps

| Lamp | Reach | Shadow | Move | Notes |
|---|---|---|---|---|
| 🏮 Lantern | 4 | 3 | 3 | Start lamp |
| 🕯️ Candle | 3 | 2 | 3 | +1 damage. Start lamp |
| 🌹 Rose Lamp | 3 | 0 | 3 | No shadows. Heals your lit figures by 1 per turn |
| ✨ Flicker Lamp | 4 | 1–5 | 4 | Length is rolled each turn and shown on the lamp (unlock) |
| 🌕 Moon | whole room | 4 | 1 | Lights everything (unlock) |

Enemy lamps: 🪔 Will-o-wisp (reach 3, shadow 2, floats 2 tiles), 🔥 Torch (reach 2, shadow 2, +1 damage).

## Figures

| Figure | HP | Attack | Tall | Notes |
|---|---|---|---|---|
| 🛡️ Squire | 7 | 1 | 0 | Start figure |
| 🔱 Pikeman | 5 | 1 | +1 | Start figure |
| 🤺 Duelist | 5 | 2 | 0 | Start figure |
| 🧌 Giant | 8 | 2 | +1 | Unlock |
| 🧙 Witch | 4 | 2 | +1 | Shadows pass through enemies and hit all of them (unlock) |

## Enemies

| Enemy | HP | Attack | Notes |
|---|---|---|---|
| 👺 Imp | 3 | 1 | Walks 1 |
| 🐺 Hound | 2 | 1 | Walks 2 |
| 👻 Lamp Bearer | 3 | 1 | Carries a wisp lamp, walks 1 |
| 🧟 Torcher | 3 | 1 | Carries a torch, walks 2 (act 2+) |
| 👹 Brute | 6 | 2 | Stands still (act 2+) |
| 🗿 Idol | 5 | 1 | Stands still, tall +2 (act 2+) |
| 💀 Wraith | 4 | 2 | Walks 1 (act 3) |

Enemies get +1 HP in acts 2 and 3, and +1 more in elite rooms.

| Act | Boss | Shape | HP | Lamps |
|---|---|---|---|---|
| 🍷 Cellar | 🐍 Bone Serpent | 3×1 | 12 | 1 wisp |
| ⚰️ Crypt | 🕷️ Spider Queen | L, 3 tiles | 15 | 1 wisp |
| 🔔 Bell Tower | 🌑 Eclipse | 2×2, tall +1 | 20 | 2 wisps |

Bosses do not move. Each of their tiles casts its own shadow.

## Run loop

1. 3 acts with 4 rooms each. Room 1 is a fight. Rooms 2 and 3 offer two doors: ⚔️ Fight, 💀 Elite (more enemies, two reward picks) or 🔥 Hearth (heal 4, no fight). Room 4 is the boss.
2. Rooms are generated from the run seed: 4–7 walls, your figures in the lower half, enemies in the upper half. Every room has at least one enemy lamp.
3. After a won room, all figures heal 2 HP. Then pick 1 of 3: a new lamp (max 4), a new figure (max 5) or an upgrade (lamp +1 shadow, +1 reach, +2 move, +1 damage; figure +3 HP, +1 attack, +1 tall; heal 5; Second Hand from act 2).
4. A figure that dies is gone for the rest of the run. A boss win heals all figures to full.
5. The run is lost when all your figures die. It is won when the act 3 boss falls.
6. Score: 50 per room, 10 per kill, 150 per boss, and 500 + 10 per HP left on a win.

## Meta progress

The title screen shows runs, wins, best score and kills. Unlocks: ✨ Flicker Lamp (reach act 2), 🧌 Giant (beat the first boss), 🌕 Moon (beat the second boss), 🧙 Witch (win a run). Save keys: `lamp.run`, `lamp.meta`.

## Code

| File | Contents |
|---|---|
| `src/battle.ts` | Pure rules: light, line of sight, shadows, clashes, strike, enemy turn, room generator, bots |
| `src/data.ts` | Lamps, figures, enemies, bosses, acts |
| `src/run.ts` | Doors, rewards, upgrades, score, unlocks, save data |
| `src/app.ts` | Screens, SVG board, preview, strike animation, input, debug API |
| `src/sfx.ts` | WebAudio synth |
| `src/rng.ts` | Seeded RNG |

`resolve(battle)` is the one pure shadow function. The preview, the strike, the enemy AI and the bots all call it, so the preview always matches the result.

## Balance

A headless sim plays full runs (200 runs per bot, no unlocks):

| Bot | Win rate |
|---|---|
| Random lamp mover | 0% |
| Greedy search (every lamp, every tile, best next strike) | 40% |
| Search + look-ahead (top 4 moves played out through the enemy turn) | 50% |

With all unlocks the look-ahead bot wins 37% (it always takes the first offer, often a new lamp).

## Debug

Open the game with `?debug` (add `&fast` to skip animation waits). The console then has `window.debug`:

- `debug.step()`: one bot action. In a battle the look-ahead bot moves the lamps and casts.
- `debug.state()`: screen, act, room, turn, figures, lamps and the predicted strike.
- `debug.win()`: win the current battle.
