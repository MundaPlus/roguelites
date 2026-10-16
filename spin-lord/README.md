# Spin Lord

Slot-machine deck builder roguelite (like Luck be a Landlord). Status: playable.

## How to play

1. Press **SPIN** (or `Space`). Your symbols land at random on a 5×4 grid. Each symbol pays coins. Empty cells pay nothing.
2. Many symbols react to the 8 cells around them. A Cat next to Milk drinks it for +9. A Miner breaks Ore into a Gem.
3. After each spin, add 1 of 3 offered symbols to your pool, or skip. Keys: `1`–`4` pick, `S` skip, `R` reroll.
4. Rent comes due every few spins. If you cannot pay, the run ends. Pay 12 rents to win.
5. After each rent, pick 1 of 3 items. Items are passive rules.
6. Tap a symbol on the grid to read what it does. Open the pool with 👜 (or `P`) to see all symbols and to remove one.
7. Tap the screen or press `Space` during a spin to skip the animation.

## Rules

- The pool can hold any number of symbols. If it has more than 20, only 20 random ones land each spin.
- Each spin resolves in a fixed order: destroy, transform, grow, pay, burn-out. Then the item rules that double a spin apply.
  - **Destroy**: symbols that eat or break remove adjacent targets and gain coins. Destroyed symbols leave the pool.
  - **Transform**: symbols that grow (Seed, Egg, Sapling, Caterpillar) change after a number of spins on the grid. The corner number counts down.
  - **Grow**: Chickens may lay Eggs. New symbols join the pool.
  - **Pay**: each symbol pays (value + bonuses) × multipliers. Multipliers on one cell stop at ×12.
  - **Burn-out**: Candles and Piggy Banks leave after their last spin.
- ✂️ Removal tokens remove one symbol from the pool. 🎲 Reroll tokens show 3 new offers. You start with 1 of each and get 1 of each per paid rent.
- Offers get more rare symbols as the run goes on.
- After 12 rents you win. You can then keep spinning in endless mode. Rent grows by 30% each period there.

## Symbols

| Symbol | Rarity | Tags | Effect |
|---|---|---|---|
| 🪙 Coin | common | – | Pays 1. |
| 🍒 Cherry | common | fruit, food | Pays 1. |
| 🍌 Banana | common | fruit, food | Pays 1. Monkeys eat it. |
| 🥥 Coconut | common | fruit, food | Pays 2. Monkeys eat it. |
| 🥛 Milk | common | food | Pays 1. Cats and toddlers drink it. |
| 🧀 Cheese | common | food | Pays 1. Mice eat it. |
| 🍬 Candy | common | food | Pays 1. Toddlers eat it. |
| 🍯 Honey | common | food | Pays 2. Bears eat it. |
| 🐟 Fish | common | sea, food | Pays 1. Bears eat it. |
| 🪨 Ore | common | ore | Pays 1. Miners break it into gems. |
| 🌱 Seed | common | plant | Pays 1. Grows into a Flower after 3 spins. |
| 🌿 Sapling | common | plant | Pays 1. Grows into a Tree after 5 spins. |
| 🥚 Egg | common | food | Pays 1. Hatches into a Chicken after 4 spins. |
| 🐛 Caterpillar | common | animal | Pays 1. Becomes a Butterfly after 4 spins. |
| 🐱 Cat | common | animal | Pays 1. Drinks adjacent Milk for +9. |
| 🐭 Mouse | common | animal | Pays 1. Eats adjacent Cheese for +7. |
| 🐔 Chicken | common | animal | Pays 2. 10% chance to lay an Egg. |
| 👷 Miner | common | person | Pays 1. Breaks adjacent Ore for +4 and adds a Gem. |
| 🕯️ Candle | common | magic | Pays 3. Burns out after 5 spins. |
| 🌻 Flower | common | plant | Pays 2. |
| 🐒 Monkey | uncommon | animal | Pays 1. Eats adjacent Bananas and Coconuts for +7. |
| 🐻 Bear | uncommon | animal | Pays 2. Eats adjacent Honey and Fish for +10. |
| 🦊 Fox | uncommon | animal | Pays 2. Eats adjacent Eggs and Chickens for +9. |
| 👶 Toddler | uncommon | person | Pays 1. Eats adjacent Candy and Milk for +6. |
| 🐝 Bee | uncommon | animal | Pays 1. Adjacent plants pay ×2. |
| 🧑‍🌾 Farmer | uncommon | person | Pays 1. Adjacent plants and fruit pay +2. |
| 🧑‍🍳 Chef | uncommon | person | Pays 2. Adjacent food pays ×2. |
| 🧲 Magnet | uncommon | – | Pays 1. Adjacent Ore and Coins pay ×2. |
| 🍀 Clover | uncommon | plant | Pays 1. Adjacent symbols pay +1. |
| 💎 Gem | uncommon | ore, gem | Pays 3. |
| 🍷 Wine | uncommon | food | Pays 2. Pays +1 more for every 3 spins on the grid. |
| 🦋 Butterfly | uncommon | animal | Pays 4. |
| 🌳 Tree | uncommon | plant | Pays 3. Lumberjacks chop it. |
| 🧔 Lumberjack | uncommon | person | Pays 1. Chops adjacent Trees for +14 and plants a Sapling. |
| 🎲 Dice | uncommon | – | Pays 1 to 6 at random. |
| 🦉 Owl | uncommon | animal | Pays 1, +2 for each adjacent animal. |
| 🧘 Hermit | uncommon | person | Pays 1, +2 for each adjacent empty cell. |
| 🐷 Piggy Bank | uncommon | – | Pays 0. On its 6th spin it breaks and pays 25. |
| 🧰 Chest | uncommon | – | Pays 1. A Key or a Pirate opens it. |
| 🗝️ Key | uncommon | – | Pays 1. Opens an adjacent Chest for +25. Both break. |
| ☀️ Sun | rare | – | Pays 2. Adjacent plants pay ×3. |
| 🌈 Rainbow | rare | – | Pays 2. Adjacent fruit pays ×3. |
| 🤴 King | rare | person | Pays 2. Adjacent Coins and gems pay ×3. |
| 🧙 Witch | rare | person, magic | Pays 2. Adjacent magic pays ×2. +4 for each adjacent Cat. |
| 🪞 Mirror | rare | magic | Pays the same as the best adjacent symbol. |
| 🦚 Peacock | rare | animal | Pays 3. Pays ×3 when no other animal is adjacent. |
| 🏴‍☠️ Pirate 🔒 | rare | person | Pays 2. Opens adjacent Chests for +18. |
| 🦄 Unicorn 🔒 | rare | animal, magic | Pays 3. Adjacent animals and magic pay ×2. |
| ⭐ Star | very rare | magic | Pays 1 for each different symbol on the grid. |
| 👑 Crown | very rare | – | Pays 3. Every person on the grid pays ×2. More Crowns do not stack. |
| 🐉 Dragon 🔒 | very rare | animal, magic | Pays 10. Eats adjacent animals for +3. |
| 🎰 Jackpot 🔒 | very rare | – | Pays 3. 6% chance to pay 77. |
| 🌋 Volcano 🔒 | very rare | – | Pays 2. Destroys every adjacent symbol for +5 each. |

## Items

| Item | Rarity | Effect |
|---|---|---|
| 🧺 Fruit Basket | common | Fruit pays +1. |
| 🧂 Salt Shaker | common | Food pays +1. |
| 🦮 Pet Collar | common | Animals pay +1. |
| 📛 Name Badge | common | People pay +1. |
| 🛒 Mine Cart | common | Ore pays +1. |
| 🚿 Watering Can | common | Plants pay +1. |
| 📕 Grimoire | uncommon | Magic pays +2. |
| 🧴 Gem Polish | uncommon | Gems pay +2. |
| 🫙 Tip Jar | common | Each empty cell pays 1. |
| 🍴 Big Appetite | uncommon | Symbols that eat or break gain +4 more each time. |
| ♻️ Recycling Bin | uncommon | Each destroyed symbol pays +2. |
| 💩 Fertilizer | common | Symbols that grow need 1 spin less. |
| 📒 Savings Book | uncommon | After each spin, gain 1 coin for each 20 coins you hold (up to 6). |
| 🔭 Telescope | uncommon | Symbol offers show 4 symbols. |
| 🐴 Horseshoe | uncommon | Rare and very rare symbols show up twice as often. |
| ⏳ Hourglass | rare | Each rent period has 1 more spin. |
| ☘️ Four-Leaf Charm | rare | Every 5th spin pays ×2. |
| 🧽 Eraser | common | Gain a removal token every 4 spins. |
| 🏮 Lantern 🔒 | uncommon | Candles never burn out. Magic pays +1. |
| 🎯 Loaded Dice 🔒 | uncommon | Dice pay at least 4. Jackpots hit twice as often. |
| 🔔 Echo Bell 🔒 | rare | The first spin after each rent pays ×2. |
| 🧱 Cornerstone 🔒 | rare | Symbols in the 4 corners pay ×2. |

## Rent schedule

| Rent | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Spins | 5 | 5 | 6 | 6 | 7 | 7 | 8 | 8 | 8 | 9 | 9 | 10 |
| Due 🪙 | 25 | 60 | 120 | 200 | 330 | 500 | 750 | 1100 | 1650 | 2400 | 3200 | 4400 |

## Run loop

1. Title screen: pick the landlord level, start or continue a run.
2. Spin, pick a symbol, spin again. Use tokens to shape the pool.
3. At the end of each period, pay the rent. Then pick an item.
4. Win after 12 rents (then endless mode is open), or lose when you cannot pay.
5. The end screen shows the score: coins earned + 100 per rent + 1000 for a win + 500 per landlord level.

## Meta progress

Each paid rent gives 1 🏅 medal. A win gives 5 more, plus 3 per landlord level. Spend medals on the title screen to unlock 5 symbols and 4 items (🔒 in the tables). A win at one landlord level unlocks the next one.

| Landlord | Rule |
|---|---|
| 🙂 Fair Landlord | The normal rent schedule. |
| 😏 Greedy Landlord | Rent is 15% higher. |
| 😠 Ruthless Landlord | Rent is 30% higher. No starting removal token. |
| 👿 Tyrant Landlord | Rent is 50% higher. No starting tokens. |

The run saves to `localStorage` (`spinlord.run`, `spinlord.meta`) after each action.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Symbols, items, rent schedule, landlord levels |
| `src/spin.ts` | Pure spin function `spin(pool, ctx, rng) => { placed, grid, events, coins, pool }` |
| `src/run.ts` | Run state, offers, rent, tokens, score, save data |
| `src/bot.ts` | Bots: rate choices by simulating a few spins (debug API and balance sim) |
| `src/app.ts` | Screens, reel animation, step-by-step effect playback, input |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG. Each spin uses its own RNG from the run seed and the spin number |

## Debug

Open the game with `?debug` (add `&fast` to skip the animations). The console then has `window.debug`:

- `debug.step()`: one bot action (start, remove, spin, pick, reroll, pay rent, pick item). Returns `'busy'` while a spin animates and `'end'` on the end screen.
- `debug.state()`: screen, phase, rent, coins, pool, items and the end result.
- `debug.coins(n)`, `debug.give(id)`, `debug.item(id)`, `debug.medals(n)`.
