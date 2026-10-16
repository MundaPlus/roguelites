# Sweep Saga

Minesweeper roguelite (like Dragonsweeper / DemonCrawl). Status: playable.

## How to play

1. Click any tile to start a floor. The first click is always safe and opens an area.
2. A number on an open tile is a clue. It shows the **total strength** of the monsters on the 8 tiles around it. It does not count them.
3. Click a tile that you know is safe to open it. Every 4 opened tiles give 1 XP.
4. Click a visible monster, or a hidden tile with a monster, to fight it. You lose HP equal to its strength and gain 2 XP per strength point. At 0 HP the run ends.
5. When the XP bar is full, press **Level** (or `L`). A level-up refills your HP and adds 2 max HP. You choose when, so keep it for when you need the heal.
6. Right-click or long-press a hidden tile to mark it with a strength or `?`. The game does not check marks. A mark at or above your HP shows in red.
7. Kill the boss (the strongest monster) to open the stairs 🪜. Then click the stairs or **Descend** (`D`).
8. The game asks for a second click before a fight that can kill you.

Keys: arrows move the cursor, `Space`/`Enter` opens, `1`–`9` mark, `0` clears, `M` marks `?`, `Q` `W` `E` `R` use items, `L` levels up, `D` descends, `H` help, `Esc` menu.

## Rules

- Clues are fixed. A dead monster still counts in the clues around it.
- The monster panel lists every monster type on the floor with its strength and how many are left.
- Each floor is checked by a logic solver before you see it. The boss and almost every tile can be found without a guess.

### Special monsters

| Monster | Rule |
|---|---|
| 👻 Ghost | Always visible. Clues do not count it. |
| 👁️ Gazer | Clues next to a living gazer show `?`. Kill it to see them. |
| 👾 Mimic | Looks like a chest 📦. Clues count its strength. A real chest adds 0. |
| Boss | The strongest monster. Kill it to open the stairs. Gives double XP and gold. |

### Monsters

| Strength | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| Monster | 🐀 Rat | 🦇 Bat | 🐍 Snake | 👺 Goblin | 💀 Skeleton | 👹 Orc | 🧟 Zombie | 🧌 Troll | 🗿 Golem |

Each floor uses 5 strengths in a row (floor 1: 1–5, floor 10: 5–9). Weak monsters are more common.

| Floor | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Size | 8×8 | 8×9 | 9×10 | 9×11 | 10×12 | 10×13 | 11×14 | 11×14 | 12×14 | 12×14 |
| Boss | 🦂 7 | 🕷️ 8 | 🐺 10 | 🧙 10 | 🦑 12 | 🦁 13 | 🧛 14 | 🦖 15 | 👿 17 | 🐉 17 |

### Items

| Item | Effect |
|---|---|
| 🧪 Potion | Heals 5 HP. |
| 📜 Scroll of Sight | Reveals a 3×3 area. Monsters there become visible, mimics lose their mask. |
| 💣 Bomb | Kills one monster (not the boss) with no damage and no XP. On a safe tile it opens it. |
| 🛡️ Ward | The next fight deals 4 less damage. |
| 🗝️ Key | Opens a chest: gold and a random item. |
| 🪙 Coins | Gold for the merchant. |

You have 3 item slots. When the bag is full, items stay on their tile until you have room.

### Boons (pick 1 of 3 after each floor)

Thick Skin (+3 max HP), Scholar (+25% monster XP), Bloodthirst (heal 1 per kill), Chainmail (−1 damage per fight), Gazer Lens, Mimic Sense, Grave Salt (ghosts deal half), Big Pouch (+1 slot), Greed (+50% gold), Lantern (free 3×3 scout per floor), Alchemy (potions +3), Phoenix Feather (survive one lethal fight), Boss Hunter (bosses −3 damage), Keyring (+2 keys, chests give 2 items).

## Run loop

1. 10 floors. Each floor is bigger and has stronger monsters. Ghosts and mimics start on floor 2, gazers on floor 3.
2. HP, level, XP, gold, keys and items carry over between floors.
3. After each floor: pick 1 of 3 boons, then buy items, keys or Vitality (+2 max HP) from the merchant.
4. Kill the Elder Dragon on floor 10 to win.
5. Score: 100 per floor cleared, 3 per kill, 20 per level, your gold, and 1000 + 20 per HP left on a win.

## Meta progress

Each run gives souls 💠 (score / 50). Spend them on the title screen to unlock heroes:

| Hero | Cost | Perk |
|---|---|---|
| 🧝 Wanderer | — | None |
| 🛡️ Knight | 12 | Starts with Thick Skin |
| 🧙‍♂️ Sage | 20 | Gets a Scroll of Sight on every floor |
| 🔮 Seer | 30 | Sees every monster in one row of each floor |
| 🦹 Thief | 40 | Starts with Keyring and Greed |

**Daily** uses a seed from today's date and the Wanderer. The title screen shows your best daily score. The floor layout also depends on where you click first.

## Code

| File | Contents |
|---|---|
| `src/board.ts` | Grid data, clues, flood fill, the logic solver (`deduce`) and the floor generator |
| `src/data.ts` | Monsters, bosses, floor specs, items, boons, heroes and tuning values |
| `src/run.ts` | Run state, actions (`apply`), fights, items, rewards, score and save data |
| `src/bot.ts` | Weak and smart bots for tests and balance sims |
| `src/app.ts` | Screens, DOM grid, input, effects and the debug API |
| `src/sfx.ts` | WebAudio synth sounds |

The solver keeps a set of possible clue values per tile. It narrows the sets with bound checks, a local backtracking search per clue group and the monster counts. It only removes values that are impossible. The generator places monsters after the first click, then plays the floor with the solver (it may kill known monsters to see their clues). It keeps the layout when the boss is found and at most 4% of tiles stay unknown, else it tries again (up to 60 times, about 1.5 tries on average).

Saves: `sweep.run`, `sweep.meta` and `sweep.mute` in `localStorage`.

## Debug

Open the game with `?debug` (add `&fast` to skip the end delay). The console then has `window.debug`:

- `debug.step(smart = true)`: one bot action. The smart bot uses the solver on what the player sees. It opens safe tiles, fights the cheapest known monster, and levels up or drinks a potion only when it is stuck.
- `debug.state()`: `screen` (`title`, `floor`, `reward`, `end`), HP, level, floor and more.
- `debug.gold(n)`, `debug.xp(n)`, `debug.heal()`, `debug.souls(n)`, `debug.floor(n)`, `debug.reveal()`, `debug.reset()`.
