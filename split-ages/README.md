# Split Ages

New-concept roguelite: two linked timelines. Status: playable.

Plant a seed in the past. Climb the tree in the future.

## How to play

1. Two boards show the same place. The **past** board is on top (left on wide screens). The **future** board shows the same place 100 years later.
2. You move a hero on each board in the same turn: 🧑‍🌾 in the past and 🧗 in the future. Both heroes share one HP pool.
3. Tap a glowing tile next to a hero to choose its move. Tap the hero itself to act (plant a seed, pull a lever) or to wait. A hero with no chosen move waits.
4. Before you press **Go**, the game shows the result. Tiles that the move changes glow on the other board, and the bar under the boards names the cause, the effect and the damage you take. With a mouse, hovering a tile shows the same preview.
5. Press **Go** (or tap the chosen tile again). A glowing pulse travels from the past tile to the future tile, and the future tile changes.
6. Reach the 🌀 exit with the future hero. The past hero opens the way.
7. **Clear** drops the chosen moves. **Rewind** takes back the last turn (3 per floor). The menu can restart the floor for 2 HP. **Hint** shows the first move of a safe plan (−30 score).

Keys: past `W` `A` `S` `D` move, `E` act or wait. Future: arrow keys move, `/` waits. `Space` plays the turn, `X` clears, `Z` rewinds, `H` gives a hint.

## Rules

- The past action happens first, then the future action, then the enemies act. So a bridge that grows in the past is ready for the future hero in the same turn.
- Walk into an enemy to attack it. At the end of the turn, each enemy hits a hero next to it (ranged enemies hit along a line). Red tiles show where a hero gets hit.
- An enemy from the past and its descendants in the future have the same letter badge.
- A dead-end check runs after each turn. It warns you when no path to the goal is left.

### Cause rules

| Rule | Past action | Effect in the future |
|---|---|---|
| 🌱 Growth | Plant a seed on soil (`E`) | A chasm gets a 🪵 root bridge. Open ground gets a 🌳 tree that blocks. The small icon on the soil shows which. |
| 🧱 Erosion | Walk into a cracked wall | The wall is gone in the future too. |
| 🧬 Lineage | Defeat an ancestor | Its descendants never exist, and their 🎁 treasure is gone too. |
| 🌊 Flooding (floor 3+) | Pull the 🎚️ sluice lever | The river moves: blue-framed tiles drain or flood. Future enemies on flooded tiles drown. |
| 🗿 Monuments (unlock) | Push a statue | The statue stands at the new place. In a chasm or in water it makes a bridge. |
| 🔁 Echo (elite floors) | Runs backward: step on a 🔘 plate in the future | A ⛩️ time gate opens in the past. The past hero starts locked behind it. |

### Enemies

| Enemy | HP | Hit | Moves |
|---|---|---|---|
| 🐗 Boar | 2 | 1 | Stays on its tile |
| 🐺 Wolf | 1 | 1 | Walks back and forth |
| 🐍 Viper | 1 | 2 | Stays on its tile |
| 🦂 Scorpion | 2 | 1 | Stings in a line, 2 tiles |
| 🧌 Troll (elite) | 3 | 2 | Stays on its tile |
| 🤖 Sentry (future) | 2 | 1 | Stays on its tile |
| 🦇 Bat (future) | 1 | 1 | Flies back and forth |
| 🕷️ Spider (future) | 2 | 1 | Crawls back and forth |
| 📡 Beacon (future) | 1 | 1 | Shoots in a line, 3 tiles |
| 🔮 Time Anchor (boss) | 1 | 0 | Shields the boss |

Past families (boar, wolf, viper, scorpion, troll) can have descendants in the future. Future enemies get +1 HP from floor 8 and hit 1 harder from floor 5.

### Items

After each floor, choose 1 of 3 items (4 after an elite floor), or skip for 3 gold. Items for one age take one of 3 slots of that age.

| Item | Age | Effect |
|---|---|---|
| 🌰 Seed Bag | Past | +2 seeds on each floor |
| 🗡️ Bronze Sword | Past | Past hero hits for +1 |
| 🛡️ Hide Shield | Past | Blocks the first hit on the past hero each floor |
| 🍖 Hunter's Meal | Past | Each past kill heals 1 HP |
| 🪢 Rope | Future | Once per floor, swing over one chasm or water tile |
| ⚔️ Steel Blade | Future | Future hero hits for +1 |
| 🧥 Iron Coat | Future | Blocks the first hit on the future hero each floor |
| 🥾 Waders | Future | Walk in water without harm |
| 🪙 Scavenger Kit | Future | Chests give +3 gold |
| ⏳ Hourglass | Both | +1 rewind per floor |
| 🍎 Orchard Charm (unlock) | Both | Each tree you grow heals 1 HP at the floor end |
| 🧿 Paradox Charm (unlock) | Both | When both heroes attack in one turn, the future hit deals +2 |
| ❤️ Heart Root | Now | +2 max HP, heal 2 |
| 🧪 Time Tonic | Now | Heal 3 HP |

## Run loop

1. 12 floors. Floors 1 and 2 teach one rule each. Later floors mix 1 or 2 barriers, each with a gate from a different rule.
2. Floors 4, 8 and 11 are elite floors with the backward Echo rule and a troll.
3. A camp follows floors 4, 8 and 11: Hot Meal (heal 3), Training (+2 max HP) and 2 items for gold.
4. Floor 12 holds 🐲 The Twice-Born. It stands in both ages at once and has one HP pool. Break its 2 🔮 anchors in the past to drop its shield, then hit it in either age. It rests, then claws the 4 tiles next to it (2 damage), then sends a time wave along its row and column 2–3 tiles away (1 damage).
5. Score: 100 per floor, 2 per gold, 5 per kill, 40 per floor on par, 1000 and 20 per HP for a win, −30 per hint.

## Floor generation

- Each floor comes from the run seed. The future board gets barrier columns of walls, chasms and water. Each barrier has one gate that a past action opens.
- The past gets ruins, a river with a ford, decoy soil, seeds, enemies and families with treasure.
- A solver checks every floor. The floor must be clearable with the current HP, and the future hero must not reach the exit without help from the past. Later floors must cost some HP. A floor that fails is built again (up to 90 tries, then a plain fallback floor).
- The solver works in phases: one hero acts while the other waits, and the phase can switch after a cause. Each plan it finds is a real plan. The par turn count comes from this plan, so you can often beat par with moves on both boards at once.

## Meta progress

Each run gives echoes ✨ (score / 400, at least 1). Spend them in the Archive on the title screen: the Monuments rule, 4 start items (pick one before a run) and 2 items for the run pool.

## Code

| File | Contents |
|---|---|
| `src/engine.ts` | Pure turn function `turn(def, state, pastAct, futAct, mods)`, cause rules, enemy phase, danger tiles |
| `src/solver.ts` | Phased search: `safe` (least damage) and `fast` (fewest turns) |
| `src/gen.ts` | Floor generator with solver check |
| `src/data.ts` | Enemies, items, rules, tiles, unlocks |
| `src/run.ts` | Run state, rewards, camp, score, save data (`ages.run`, `ages.meta`) |
| `src/bot.ts` | Bots for the debug API and the balance sim |
| `src/app.ts` | Screens, board painting, preview, cause pulses, input |
| `src/sfx.ts` | WebAudio sounds |

## Balance

Headless sim of full runs (same generator, engine and rewards):

| Bot | Play | Win rate |
|---|---|---|
| Weak | Past hero acts at random, future hero walks to the exit | 0% (0 of 40) |
| Good | Follows the safest plan, but 12% of moves are random slips. Restarts a dead floor. | 30% (12 of 40) |
| Fast | Fewest turns, ignores damage | 95% (19 of 20) |
| Perfect | Least damage | 100% (20 of 20) |

The perfect bot always wins because every floor is checked to be clearable with the current HP.

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.debug`:

- `debug.step()`: one bot action. On a floor the bot follows the safest solver plan.
- `debug.state()`, `debug.solve(mode, cap)`, `debug.dump()`, `debug.hp(n)`, `debug.win()`, `debug.echoes(n)`.
