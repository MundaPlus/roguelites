# Chain Crawl

Swipe-chain puzzle combat roguelite (like Dungeon Raid). Status: playable.

## How to play

1. Drag a path through 3 or more matching tiles on the 6×6 board. Paths go in all 8 directions. A path may not use the same tile twice. Drag back one step to undo it.
2. Release to clear the chain. Tiles fall down and new tiles drop in from the top.
3. After each move, every enemy on the board attacks. Armor takes the damage first, then HP.
4. Keys: arrows move a cursor, `Space` or `Enter` adds the tile under the cursor, `Space` on the last tile clears the chain, `Backspace` undoes a step, `Esc` cancels. `1` `2` use skills. `1` `2` `3` pick a reward, `0` leaves the shop. `H` opens the help, `M` mutes.

## Tiles

| Tile | Chain effect |
|---|---|
| ⚔️ Sword | Chains with enemies. Each enemy in the chain takes base damage + damage per sword × swords in the chain. |
| 👾 Enemy | Chains with swords and other enemies. Red number: HP. Orange: attack. Blue: armor. Purple: turns until its special. |
| 🛡️ Shield | +1 armor per shield (up to max armor). Shields beyond full armor fill the forge bar. |
| 🧪 Potion | Heals 2 HP per potion. |
| 🪙 Coin | Fills the shop bar. |

- An enemy with 💤 just dropped in. It does not attack this turn.
- Enemy armor lowers the damage of each hit. Armor pierce cancels enemy armor.
- When no chain of 3 is possible, the board shuffles by itself.

## Bars

| Bar | Fills from | When full |
|---|---|---|
| ⭐ XP | Kills | Level up: pick 1 of 3 upgrades. +2 max HP per level. |
| 🪙 Coins | Coin tiles | Shop: pick 1 of 3 gear pieces, or leave and heal 20%. |
| 🛡️ Forge | Extra shields | Forge: pick 1 of 3 armor upgrades. |

Each bar needs a bit more after each fill.

## Enemies

| Enemy | From floor | Notes |
|---|---|---|
| 🐀 Rat | 1 | Weak |
| 🦇 Bat | 1 | 2 HP, attack 2 |
| 👺 Goblin | 2 | Plain fighter |
| 🕷️ Spider | 3 | Each bite poisons for 2 turns (1 damage per turn) |
| 💀 Skeleton | 4 | Armor 1 |
| 💣 Bomb Imp | 5 | No attack. Explodes when its fuse ends, through armor |
| 🦠 Ooze | 6 | Heals 2 per turn |
| 👻 Ghost | 8 | Attack goes through armor |
| 👹 Orc | 9 | Tough |
| 🧙 Necromancer | 11 | Turns a tile into a Skeleton every 3 turns |
| 🤺 Dark Knight | 13 | Armor 2 |
| 🧌 Troll | 15 | Heals 3 per turn |

Enemy HP grows 10% per floor. Attack grows by 1 every 6 floors.

## Bosses

A boss drops in on every 5th floor. The floor ends when the boss dies.

| Floor | Boss | HP | Special |
|---|---|---|---|
| 5 | 🦂 Brood Queen | 34 | Poisons, calls a Spider every 3 turns |
| 10 | 🗿 Stone Golem | 50 | Armor 3 |
| 15 | 🧟 Lich | 60 | Armor 1, raises a Skeleton every 2 turns |
| 20 | 🐉 Ember Dragon | 100 | Armor 2, every 3rd turn triple damage through armor |

## Classes and skills

Skills do not use a turn. Each skill recharges over turns.

| Class | Cost | Stats | Skills |
|---|---|---|---|
| 🪓 Warrior | free | 50 HP, 6 armor, base damage 2 | 🌪️ Whirlwind (hit all enemies, cd 9), 🧱 Fortify (fill armor, cd 10) |
| 🗡️ Rogue | 💎 25 | 45 HP, 2 per coin, pierce 1 | 🗡️ Coin Edge (coins become swords, cd 8), 🔀 Shuffle (cd 6) |
| ⛪ Cleric | 💎 40 | 60 HP, 5 armor, 3 per potion | ✨ Prayer (heal 40%, cure poison, cd 11), ⚗️ Transmute (shields become potions, cd 8) |
| 🔮 Mage | 💎 60 | 40 HP, 3 armor, 2 per sword | 🔥 Fireball (6 + 2 per floor to the toughest enemy, cd 7), ❄️ Frost Nova (no enemy attacks next turn, cd 10) |

## Upgrades and gear

- Level-up picks (9): Vitality, Sharpen, Might, Herbalist, Greed, Focus, Scholar, Piercing, Second Wind.
- Forge picks (5): Thick Plate, Mason, Bulwark (block), Spikes, Hearty.
- Gear has 4 slots: weapon, armor, shield, helmet. 12 gear types come in 4 tiers (Iron, Steel, Mithril, Dragon). The tier goes up every 5 floors.

| Slot | Gear |
|---|---|
| 🗡️ Weapon | Shortsword (+sword damage), War Club (+base damage), Spear (+base, pierce), Axe (+sword, +base) |
| 🥋 Armor | Chain Mail (+max armor), Spiked Vest (+armor, spikes), Robe (+HP, +potion heal) |
| 🛡️ Shield | Buckler (+block), Tower Shield (+armor, +armor per shield) |
| ⛑️ Helmet | Helm (+max armor), Lucky Hat (+coin value), Circlet (+XP, +HP) |

Block lowers each enemy hit. Spikes hurt each enemy that attacks you.

## Run loop

1. Choose a class on the title screen and start a run.
2. Each floor needs 4–9 kills. Then you go down one floor.
3. Floors 5, 10, 15 and 20 hold a boss. Kill the dragon on floor 20 to win.
4. Score: floor × 100 + kills × 5 + level × 20, +1500 for a win. Each 100 points give 1 gem 💎.
5. Gems unlock classes. The title screen shows runs, wins, best floor, best score and total kills.

The run saves after each move (`chaincrawl.run`). The meta progress lives in `chaincrawl.meta`.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Tiles, enemies, bosses, classes, skills, upgrades, gear |
| `src/game.ts` | Pure run state: path checks, chain, gravity refill, enemy turn, bars, offers, skills, save data |
| `src/bot.ts` | Path search (bounded DFS), weak and smart bots, skill and reward rules |
| `src/app.ts` | Screens, DOM board with keyed tiles, drag input, animation, debug API |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG. The run saves its RNG state, so tile drops stay the same after a reload. |

A turn runs in 4 steps: `resolveChain`, `refill`, `enemyPhase`, `settle`. `takeTurn` runs all of them. The app runs them one by one with animation waits in between.

## Balance

A headless sim plays 40 runs per class with 3 bots:

| Bot | Warrior | Rogue | Cleric | Mage |
|---|---|---|---|---|
| Weak (random 3-chains, no skills) | 0% | 0% | 0% | 0% |
| Greedy (best chain by a quick score, no skills) | 20% | 33% | 25% | 18% |
| Smart (simulates the top chains one turn ahead, uses skills) | 53% | 60% | 57% | 43% |

## Debug

Open the game with `?debug` (add `&fast` to skip animation waits). The console then has `window.debug`:

- `debug.step()`: one bot action (start a run, close a modal, pick a reward, use a skill or play the smart bot's best chain). It returns `'busy'` while an animation runs and `'end'` on the end screen.
- `debug.state()`: `screen` (`title`, `play`, `end`), floor, HP, armor, level, kills, enemies, offer and the end result.
- `debug.win()`, `debug.hp(n)`, `debug.gems(n)`, `debug.floor(n)`.
