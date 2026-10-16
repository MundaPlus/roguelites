# Word Smith

Word-spelling combat roguelite (like Bookworm Adventures / Letter Quest). Status: playable.

## How to play

1. Spell a word with the 16 letter tiles. Tap or click tiles, or type the letters on the keyboard. Words need 3 or more letters.
2. Press **Attack** (or `Enter`). The word hits the target enemy. Tap an enemy (or press `←` `→`) to change the target.
3. Keys: `Backspace` removes the last tile, `Esc` clears the word, `0` scrambles the grid, `1`–`4` drink a potion. On the other screens, `1`–`9` pick an option and `Enter` presses the main button.
4. Each word or scramble is one turn. Then the enemy timers go down. An enemy attacks when its timer (`⚔️N in T`) reaches 0.

## Rules

- **Damage** = the sum of the letter values × a length bonus, plus gem and book bonuses.
- Length bonus: 3 letters ×1, 4 ×1.3, 5 ×1.6, 6 ×2, 7 ×2.4, 8 ×2.8, 9 ×3.2, 10 ×3.6.
- Letter values: 1 = A E I O N R S T L, 2 = U D G H C M P B, 3 = F W Y K V, 4 = J X Qu Z.
- "Qu" is one tile with two letters. When you type, the `u` after a `q` is skipped.
- Used tiles are replaced from a weighted letter bag. The grid always has 5 to 7 vowels and few duplicate letters.
- **Scramble** gives new letters to all unlocked tiles. It costs a turn.
- **Block** from gems and books absorbs damage until the end of the fight.
- The dictionary is `public/words.txt`: 52,167 lowercase words of 3–10 letters from `/usr/share/dict/american-english`, without proper nouns, slurs and words with a `q` that is not followed by `u`. It is sorted and prefix-compressed (one digit for the shared prefix, then the rest). The game loads it once into a `Set`.

## Special tiles

| Tile | From | Effect |
|---|---|---|
| Gem tile (colored) | Your gems | Adds the gem effect to the word. |
| 🔒 Locked | Enemies | Cannot be used for 3 turns. |
| Cracked | Enemies | Worth 0. |
| ☠️ Poisoned | Enemies | Hurts you 1 per turn until you use it. |

Each gem you own puts one gem tile on the first grid of a fight (at most 3). New tiles become gem tiles with a chance of 3% per gem (at most 25%).

## Gems

| Gem | Effect |
|---|---|
| 🔴 Ruby | +5 damage |
| 🟢 Emerald | Heal 4 HP |
| 🔵 Sapphire | Gain 6 block |
| 🟣 Amethyst | ×1.5 damage (more amethysts add +0.5 each) |
| 🟡 Topaz | Gain 5 gold |
| ⚫ Onyx | The target attacks 1 turn later |
| 🍏 Jade | Poison the target for 4 (Archive) |
| 💎 Diamond | ×2 damage (Archive) |

You start with a Ruby and a Sapphire.

## Books

| Book | Effect |
|---|---|
| 🗺️ Zephyr Atlas | Words with J, Q, X or Z deal double damage. |
| 🌿 Herbal Primer | Words of 5+ letters heal 2 HP. |
| 📕 First Edition | The first word of each fight is free. |
| 🅰️ Vowel Codex | Vowels are worth +1. |
| 📜 Long Tome | Words of 6+ letters deal +50%. |
| 🛡️ Iron Binding | Start each fight with 8 block. |
| 💰 Gilt Edges | +50% gold from fights. |
| 🌵 Thorn Script | An enemy that hits you takes 3 damage. |
| 🖋️ Ink Blot | Enemies attack 1 turn later at the start of a fight. |
| 👯 Twin Letters | Words with a double letter deal +6. |
| ✏️ Short Story | Words of 3 or 4 letters deal +4. |
| 👜 Gem Satchel | Gem tiles appear twice as often. |
| 🎽 Potion Belt | +1 potion slot and a Health Draught. |
| 🧛 Vampire Verse | Heal 1 HP per 8 damage. |
| 🔀 Shuffle Charm | Scrambling is free. |
| 🎯 Ricochet Rhyme | Overkill damage hits the next enemy (Archive). |
| 🔔 Echo Chamber | A word that starts with the last letter of the previous word deals +50% (Archive). |
| 🔍 Scholar Lens | Letters of value 3+ are worth +2 (Archive). |

## Potions

Potions do not use a turn. You have 3 slots.

| Potion | Effect |
|---|---|
| 🧪 Health Draught | Heal 20 HP |
| 🔥 Fire Flask | 20 damage to the target |
| 💧 Clear Water | Clean all locked, cracked and poisoned tiles |
| ⏳ Hourglass | All enemies attack 2 turns later |
| ✨ Muse Tonic | The next word deals double damage |

## Enemies

The values include the chapter scaling. The second and third enemy of a group start with 1 more turn on the timer.

| Chapter | Enemy | HP | Attack | Effect |
|---|---|---|---|---|
| 1 | 🐛 Bookworm | 48 | 8 every 2 | Chews pages. No tricks. |
| 1 | 🦇 Paper Bat | 28 | 3 every 1 | Weak, but bites every turn. |
| 1 | 🦑 Ink Squid | 56 | 6 every 3 | Its ink cracks 3 tiles. |
| 1 | 🕷️ Dust Mite | 40 | 5 every 2 | Poisons 2 tiles. |
| 1 | 🗿 Gargoyle (elite) | 150 | 14 every 3 | Gains 8 block when it attacks. |
| 1 | 🦉 Owl Archivist (boss) | 300 | 15 every 3 | Locks 3 tiles when it attacks. |
| 2 | 🐸 Bog Frog | 97 | 13 every 2 | Heavy tongue slap. |
| 2 | 🪱 Leech | 81 | 9 every 2 | Heals by the damage it deals. |
| 2 | 🔥 Wisp | 70 | 9 every 2 | Scrambles your grid. |
| 2 | 🧙 Bog Witch | 108 | 11 every 3 | Heals all enemies 10. |
| 2 | 🐊 Old Croc (elite) | 351 | 20 every 3 | Hits 3 harder each attack. |
| 2 | 🐍 Mire Hydra (boss) | 702 | 20 every 2 | Poisons 3 tiles when it attacks. |
| 3 | 🤖 Scribe Golem | 187 | 19 every 3 | Gains 10 block when it attacks. |
| 3 | 😈 Vowel Imp | 136 | 13 every 2 | Turns 2 vowels into hard letters. |
| 3 | 👤 Wraith | 153 | 17 every 2 | Cracks 2 tiles. |
| 3 | 📦 Mimic | 204 | 23 every 3 | Locks 2 tiles. |
| 3 | 💀 Lich (elite) | 612 | 27 every 3 | Heals all enemies 15. |
| 3 | 👁️ The Unspeller (boss) | 1360 | 32 every 3 | Scrambles the grid and locks 2 tiles. |

## Run loop

1. 3 chapters (📚 Dusty Library, 🐸 Murmur Mire, 🗼 Babel Spire) with 8 steps each. At each step, choose a room: fight, elite, shop, event or reading room. The last step is the boss.
2. After a fight: gold and one reward of 3 (a gem, a potion, and a book or +6 max HP). Elites also drop a book. Bosses give a choice of 3 books and heal half of your missing HP.
3. Shop: 2 gems, 2 books, 2 potions and a 20 HP heal.
4. Reading room: heal 35% of max HP, or +6 max HP.
5. 6 events with choices (Wishing Well, Old Librarian, Ink Fountain, Gem Cutter, Riddle Sphinx, Lost Satchel).
6. The run is saved in `localStorage` (`wordsmith.run`) after every turn and screen. Continue resumes the fight, the reward or the shop.

## Meta progress

Each run gives ink 🖋️ (score / 60). Spend it in the Archive on the title screen: 2 gems, 3 books and 3 starting kits (Amethyst gem, Health Draught, +10 max HP). Stats and unlocks are in `wordsmith.meta`.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Letters, values, gems, books, potions, enemies, chapters, scaling |
| `src/dict.ts` | Word list loading and decoding, lookup, search for words the grid can spell |
| `src/fight.ts` | Grid, letter bag, damage, enemy turns, tile effects, potions (pure functions) |
| `src/run.ts` | Map plan, rewards, shop, events, score, save data |
| `src/bot.ts` | Bots for the debug API and the balance sim |
| `src/app.ts` | Screens, effects, input, debug API |
| `src/sfx.ts` | WebAudio sounds |

## Debug

Open the game with `?debug` (add `&fast` to skip the animation waits). The console then has `window.debug`:

- `debug.step()`: one bot action. In a fight the bot searches the word list for the best word the grid can spell. Returns `'busy'` while an animation runs.
- `debug.state()`: `screen`, `hp`, `grid`, `word`, `enemies` and more. `screen` is `'end'` on the win or loss screen.
- `debug.hint()`, `debug.type(word)`, `debug.gold(n)`, `debug.ink(n)`, `debug.win()`.
