# Block Siege

Falling-block combat roguelite (like Tetris with enemies). Status: playable.

## How to play

1. Pieces fall into a 10×20 well. Fill a whole row to clear it.
2. Each clear fires an attack at the enemy above the well.
3. The enemy acts on a timer. The bar under its intent shows when it acts next.
4. Keys: `←` `→` move, `↓` soft drop, `Space` hard drop, `↑` or `X` rotate right, `Z` rotate left, `C` or `Shift` hold, `Esc` menu.
5. Touch: drag left or right to move. Tap the right half to rotate right, the left half to rotate left. Swipe down to hard drop. Swipe up to hold. The buttons under the well do the same.
6. The menu sets DAS (delay before auto shift) and ARR (auto repeat rate).

## Rules

- Rotation uses the SRS states and wall kick tables. I and Long I use the I table. Other shapes use the JLSTZ table.
- The ghost piece shows where the piece lands. Lock delay is 0.5 s, with up to 15 resets per row.
- Hold keeps one piece. You can hold once per piece.
- A top-out costs 10 HP (+4 per act) and wipes all but the bottom 8 rows.
- A row with a locked cell (🔒) does not clear the first time. It unlocks and clears with the next piece.

### Damage

Damage = attack units × damage per unit (starts at 2).

| Clear | Units |
|---|---|
| Single / Double / Triple / Tetris | 1 / 3 / 6 / 10 |
| 5 rows (Long I) | 15 |
| T-Spin Single / Double / Triple | 4 / 8 / 12 |
| T-Spin Mini (0 / 1 / 2 rows) | 0 / 1 / 3 |
| Back-to-back Tetris or T-spin | ×1.5 |
| Combo (clears in a row) | +1 unit per 2 combo steps, up to +5 |
| Perfect clear | +10 |

A shield absorbs damage before HP.

### Special blocks

A piece with a special block carries it on one cell. The effect happens when that cell's row clears. Level 2 is stronger.

| Block | Level 1 | Level 2 |
|---|---|---|
| 🔥 Fire | Burns 6 over 3 s | Burns 12 over 6 s |
| ❄️ Ice | Enemy timer at half speed for 5 s | 8 s |
| ❤️ Heart | Heal 2 | Heal 4 |
| 💣 Bomb | Clears the 3×3 area, deals 4 | 5×3 area, deals 8 (Armory) |
| 🪙 Gold | 4 gold | 9 gold (Armory) |
| ⭐ Star | Clear deals +50% | Clear deals double (Armory) |

## Shapes

The bag starts with the 7 standard pieces. The I carries 🔥 and the L carries ❄️.

| Shape | Cells | Notes |
|---|---|---|
| I O T S Z J L | 4 | Standard tetrominoes |
| Dot | 1 | Fills any hole |
| Domino | 2 | |
| Tri-I, Corner | 3 | |
| P | 5 | Pentomino |
| U, Long I, Plus | 5 | Pentominoes (Armory) |
| Rubble | 5 | Junk from enemies. It leaves after the fight. |

## Enemies

Each enemy repeats its list of moves. Moves: 🧱 garbage rows (one hole), ⚔️ hit, ⏩ speed up the drop ×3, 🔒 lock cells, 🛡️ shield, 🌫️ hide the next queue, 💚 heal, 🪨 add Rubble pieces to the queue.

| Act | Enemies | Elite | Boss |
|---|---|---|---|
| 🏰 Outer Walls | Slime, Goblin Sapper, Rat Swarm, Archer | 👹 Ogre | 🗼 Siege Tower |
| 🕯️ Catacombs | Skeleton, Wraith, Cave Spider, Cultist | ⚔️ Bone Knight | ☠️ Lich |
| ⛈️ Sky Citadel | Gargoyle, Storm Mage, Imp, Harpy | 🤖 Iron Golem | 🐉 Storm Dragon |

Enemy HP, hits, shields and drop speed grow with each act.

## Relics

| Relic | Effect |
|---|---|
| 👝 Twin Pouch | The hold slot holds 2 pieces |
| 🌀 Spinning Top | T-spins deal double damage |
| 🗡️ Whetstone | Line damage +25% |
| 🪶 Feather | Pieces fall 30% slower |
| ⚓ Anchor | Garbage attacks push 1 row less |
| 🗝️ Lockpick | Lock attacks fail |
| 🥁 War Drum | Combo bonus doubled |
| ⛑️ Iron Helm | Top-outs cost half HP |
| 🧊 Frost Core | Enemy timers 15% slower |
| 🐷 Piggy Bank | +30% gold from fights |
| 🔮 Prism | Every 8th piece carries a random special block |
| 🦷 Vampire Fang | Heal 2 per clear of 3+ rows |
| 🔭 Spyglass | See 5 next pieces, blind attacks fail |
| 🌵 Thorn Mail | Hits on you deal 5 back (Armory) |
| 🧤 Sticky Gloves | Lock delay 1 s (Armory) |
| 👑 Perfect Crown | Tetrises deal +50% (Armory) |

## Run loop

1. 3 acts with 8 steps each. At each step choose a room: fight, elite, event, treasure, shop or campfire. Step 8 is the boss.
2. After a fight: gold and one pick of 3. A pick adds a piece, puts a special block on a plain piece, upgrades a special block, or gives max HP or damage. Elites also drop a relic. Bosses give a choice of 3 relics.
3. The piece bag works like a deck. Every piece comes once, then the bag reshuffles. More pieces mean you see each one less often.
4. Shop: pieces, relics, a special block, healing, an upgrade, or piece removal.
5. Campfire: heal 30% of max HP, upgrade a special block, or remove a piece.
6. Events: Mason's Cart, Cursed Forge, Healing Spring, Gambler, Rubble Pile, Old Mage.
7. The run saves on the map (`blocksiege.run`). Meta progress (`blocksiege.meta`) keeps shards, unlocks, stats and settings. Spend shards in the Armory on the title screen.

## Code map

| File | Role |
|---|---|
| `src/well.ts` | Pure well logic: grid, SRS rotation and kicks, hold, queue, gravity, lock delay, clears, garbage, locks. `reduce(state, input)` returns a new state. |
| `src/fight.ts` | One fight: damage, combos, specials, enemy timer and moves. No DOM. |
| `src/run.ts` | Run state, map plan, rewards, shop, events, save and meta. |
| `src/data.ts` | Shapes, special blocks, enemies, acts and relics. |
| `src/bot.ts` | Placement bot: tries each rotation and column, scores the grid. |
| `src/app.ts` | Screens, canvas drawing, input (keys with DAS/ARR, touch, buttons), effects. |
| `src/sfx.ts` | WebAudio synth sounds. |
| `src/rng.ts` | Seeded RNG and hash. |

## Debug API

Open the page with `?debug` to get `window.debug`. Add `&fast` to skip the end-of-fight wait and stop the real-time clock (only the bot moves time).

- `state()`: screen, modal, act, step, HP, gold, deck size, relics, enemy, fight time and end result. `screen` is `'end'` on the win or loss screen.
- `step()`: one bot action. In a fight it lets 0.6 s pass, then places one piece with the placement bot. On other screens it clicks a sensible button.
- `win()`: kill the current enemy. `gold(n)`, `relic(id)`, `shards(n)`: cheats for tests.

## Balance

A headless sim plays full runs. The bot places one piece per think time.

| Bot | Win rate (100 runs) |
|---|---|
| Random placements | 0% |
| Noisy heuristic, 1.2 s per piece, random choices | 0% |
| Heuristic, 1.5 s per piece, smart choices | 18% |
| Heuristic, 1.0 s per piece, smart choices | 61% |
