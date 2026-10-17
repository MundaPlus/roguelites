# Pixel Oracle

Nonogram logic roguelite (like Picross roguelites). Status: playable.

## How to play

1. Each row and each column has number clues. The numbers give the runs of painted cells in that line, in order. "3 1" means a run of 3, at least one gap, then a run of 1.
2. Paint the cells you are sure of. Drag to paint a straight line of cells. The game checks each paint against the solution.
3. A wrong paint costs HP (💥 on the puzzle bar) and shows the cell as empty. The drag stops at the wrong cell.
4. Mark cells that you think are empty: right-click, or switch to Mark mode. Marks are your notes. The game does not check them.
5. When all painted cells of a line are found, the clue turns grey and the rest of the line is crossed out.
6. Paint every filled cell to reveal the picture.

Every puzzle can be solved by logic, with no guessing (see "Puzzle checks").

Controls:

| Input | Action |
|---|---|
| Mouse | Click or drag to paint. Right button marks. |
| Touch | Tap or drag to paint. Use the Mark button to mark. |
| Keys | Arrows move the cursor. `Z` / `Space` paint, `X` marks. Hold the key and move to drag. `Q` switches mode. `1`–`7` pick a spell. `Esc` cancels a spell or opens the menu. `?` opens the help. |
| Map | `1`–`3` pick a door. `Enter` presses the main button. |

## Rules

- You start with 8 HP, 3 mana (max 9) and 3 spells.
- A clean solve (no mistakes) gives +1 mana. A solve with mistakes gives no mana. Rune puzzles give +1 more.
- Damage per mistake: chests, keys, mystery pictures and runes deal 1 on floors 1–3, 2 on floors 4–6 and 3 on floors 7–8. Monsters deal their own damage, +1 on floors 4–6 and +2 on floors 7–8.
- HP 0 ends the run.

## Spells

| Spell | Mana | Effect | Source |
|---|---|---|---|
| 👁️ Peek | 2 | Check one cell. It is painted or crossed out. | Start |
| ✖️ Clear Line | 2 | Cross out every empty cell of a row or column. | Start |
| ☀️ Reveal Line | 3 | Solve a whole row or column. | Start |
| 💡 Insight | 3 | The line solver does the next logical step. | Unlock |
| ❤️‍🩹 Mend | 3 | Heal 3 HP. | Unlock |
| 🛡️ Ward | 2 | The next 2 mistakes in this puzzle cost no HP. | Unlock |
| ✚ Cross Sight | 5 | Solve the row and the column through a cell. | Unlock |

Line spells target a clue (tap it), or a cell and then "Row" or "Column". Keys: `R` row, `C` column at the cursor.

## Doors

Each floor has 2 steps with 3 doors each, then the floor guardian.

| Door | Puzzle | Prize |
|---|---|---|
| ⚔️ Monster | Its picture | Gold. 15% chance of a key. |
| 🧰 Chest | A chest picture | Gold. 25% a choice of 2 charms, else a potion (+2 HP). |
| 🗝️ Key | A key picture | 1 key and a little gold. |
| ❓ Mystery | A hidden picture | The picture decides: treasure (gold), potion (+3 HP), mana (+3), charm (choice of 2) or key. |
| 🔣 Rune | A random grid | Gold and +1 mana. |
| ⛩️ Shrine | None | Refill all HP. |
| 🛒 Shop | None | Heal 3, +2 max HP, +3 mana, a key, 2 charms. |
| 🔐 Vault | None | Use a key, choose 1 of 3 charms. Only offered when you have a key. |
| 👑 Guardian | The floor boss | Gold and a choice of 3 charms. The last guardian wins the run. |

## Monsters

Traits: 🌫️ Fog hides some clues (shown as `?`, the puzzle stays solvable without them). 💢 Enrage adds +1 damage per earlier mistake. 🩸 Drain burns 1 mana per mistake. 🕯️ Curse makes spells cost +1.

| Size | Monsters (base damage, trait) |
|---|---|
| 5×5 | Green Slime (1), Cave Bat (1, fog 1), Spider (1, enrage), Rat (1, drain), Crab (1) 🌊 |
| 8×8 | Goblin (1, enrage), Skeleton (2), Ghost (1, fog 2), Viper (1, drain), Angler Fish (1, curse) 🌊, Saucer (2, fog 2) 🌠 |
| 10×10 | Stone Golem (2), Dire Wolf (1, enrage), Wraith (1, curse), Mimic (2, drain), Kraken Spawn (2, fog 3) 🌊 |
| 12×12 | Demon (2, enrage), Dragon (3), Beholder (2, fog 3), Lich (2, curse), Leviathan (2, drain) 🌊 |

| Floor | Name | Door sizes | Guardian |
|---|---|---|---|
| 1 | 🌿 Mossy Steps | 5×5 | 👑 King Slime 8×8 (1) |
| 2 | 🕸️ Spider Cellar | 5×5, 8×8 | 🕸️ Spider Queen 8×8 (1, fog 2) |
| 3 | 🌉 Troll Bridge | 8×8 | 👹 Cave Troll 10×10 (2) |
| 4 | ⚰️ Bone Crypt | 8×8, 10×10 | ⚔️ Bone Knight 10×10 (2, curse) |
| 5 | ⚒️ Ember Forge | 10×10 | 🔥 Fire Golem 12×12 (2, enrage) |
| 6 | 📚 Star Library | 10×10, 12×12 | 🌌 Star Serpent 12×12 (2, fog 3) |
| 7 | 🌀 Void Gate | 12×12 | 🌀 Void Eye 15×15 (2, drain) |
| 8 | 🔮 Oracle Spire | 12×12, 15×15 | 🔮 Oracle's Shadow 15×15 (3, fog 4) |

Rune grids use sizes from 5×5 up to 13×13.

## Charms

| Charm | Effect |
|---|---|
| 🪶 Forgiving Quill | The first mistake in each puzzle costs no HP. |
| 🔷 Mana Prism | Clean solves give +1 more mana. |
| 🪙 Lucky Coin | +40% gold from puzzles. |
| 💗 Heartstone | +3 max HP and heal 3. |
| 🩹 Field Dressing | Heal 1 HP after each solved puzzle. |
| 🔍 Oracle Lens | The first Peek in each puzzle is free. |
| 💍 Key Ring | Key pictures give 2 keys. |
| 🏺 Mana Well | +3 max mana and +2 mana. |
| 🍵 Calm Tea | Monsters deal 1 less damage per mistake (at least 1). |
| 🏮 Lantern | Fog hides 2 fewer clues. |
| 🧭 Compass | Mystery doors show what they hold. |
| 🗺️ Star Chart | Each puzzle starts with 2 extra painted cells. |
| 🧿 Ward Amulet | Start each monster fight with 1 Ward. |
| ⏳ Sand Glass | Guardians deal 1 less damage per mistake (at least 1). |

## Pictures

55 hand-made pixel pictures (`src/pictures.ts`): 13 of 5×5, 15 of 8×8, 15 of 10×10, 9 of 12×12, 3 of 15×15. Each letter in the data sets a color, so a solved puzzle shows the picture in color. The gallery on the title screen shows every picture you found.

## Meta progress

Each run gives shards 💎 (score / 40). Spend them in the Oracle's Library on the title screen:

- Spells: Insight (25), Mend (35), Ward (40), Cross Sight (50).
- Picture packs: 🌊 Deep Sea (30) and 🌠 Starfall (30). They add pictures and monsters to the door pool.

Score: 100 per floor cleared, 10 per puzzle, 15 per clean solve, 5 per monster, +gold, +500 for a win.

## Puzzle checks

- `src/nonogram.ts` has a line solver. It works one line at a time with a dynamic program over all block placements, and repeats until nothing changes.
- Random grids are generated again until the line solver can finish them.
- A hand-made picture that the line solver cannot finish gets a few given cells (shown at the start) until it can. Most pictures need none. The rest need 1–4.
- Fog only hides a clue when the puzzle stays line-solvable without it.

## Run loop

1. Title screen: continue, new run, unlocks, gallery.
2. Floor map: pick 1 of 3 doors, two times. Then fight the guardian.
3. Puzzle screen: solve the picture. Spells cost mana.
4. Reward panel: the picture appears in color, with gold, mana, keys or charm choices.
5. Clear 8 floors to win. The end screen shows the score, shards and the pictures of the run.

The run saves after every move (`pixel-oracle.run`). Meta data is in `pixel-oracle.meta`.

## Code

| File | Contents |
|---|---|
| `src/pictures.ts` | Picture data, color palette |
| `src/nonogram.ts` | Clues, line solver, solvability check, givens, random grids, fog choice |
| `src/puzzle.ts` | One puzzle in play: paint, mark, line completion, spell effects, best deduction |
| `src/game.ts` | Run rules for moves: damage, mana, death, solve rewards, shrine, vault |
| `src/run.ts` | Run state, doors, puzzle setup, rewards, shop, score, save data |
| `src/data.ts` | Monsters, traits, floors, spells, charms, unlocks |
| `src/bot.ts` | Bot player for the debug API and the balance sim |
| `src/app.ts` | Screens, DOM board, drag and keyboard input, effects |
| `src/sfx.ts` | WebAudio sounds |

## Balance

A headless sim plays full runs with the bot. The bot solves with the line solver. Per painted cell it can slip and paint a wrong cell of the same line. Per step it can get stuck and guess (scaled by grid size). A smart bot picks doors by need, buys charms and heals, and uses Peek when stuck. 400 runs each:

| Bot | Slip / stuck | Win rate | Mean floor reached |
|---|---|---|---|
| Random painter | 30% / 50% | 0% | 1.9 |
| Weak (random doors, no spells) | 4% / 12% | 0.3% | 4.4 |
| Weak but smart | 4% / 12% | 27% | 6.4 |
| Good (smart) | 3% / 8% | 64% | 7.4 |
| Expert (smart) | 2% / 5% | 91% | 7.8 |

## Debug

Open the game with `?debug` (add `&fast` to skip the reveal waits). The console then has `window.debug`:

- `debug.step()`: one bot action (start a run, pick a door, solve one line or slip, cast, pick a charm, buy, leave). Returns `'busy'` during the reveal animation.
- `debug.state()`: `screen`, floor, HP, mana, gold, keys, charms, doors, puzzle progress, end result.
- `debug.hp(n)`, `debug.mana(n)`, `debug.shards(n)`, `debug.solve()`.
