# Pack Rat

Backpack-builder auto-battler roguelite (like Backpack Hero / Backpack Battles). Status: playable.

## How to play

1. Choose a class. Each class has its own items in the shop. Neutral items show up for all classes.
2. In the shop, drag a card into your backpack. Or press its price to buy it and let the game place it.
3. Drag items to move them. Double tap or right-click an item to rotate it. Press `R` to rotate the selected item or the item you drag. On touch screens, a second finger rotates the item you drag.
4. Press **Fight**. The fight runs by itself. Each item acts when its cooldown fills.
5. Win 10 fights before you lose 5 lives.

Keys: `R` rotate, `F` or `Enter` fight, `E` reroll, `Esc` deselect. In a fight, `Space` skips and then continues.

## Rules

- **Grid**: the backpack is 9 × 7 cells. Items only work on bag cells. You start with a 3 × 3 Old Pack. Buy more bags to get more cells.
- **Bags** carry the items that sit fully on them when you move them. Items that lose their bag cells go to the stash. You cannot sell your last bag.
- **Stars ★**: many items have star cells next to them. An item that sits on a star and has the right tag gets the buff. A buff only raises effects the item already has (a +2 damage star does nothing for an apple). A gold ★ on an item shows that it has buffs.
- **Stash**: up to 10 items. Items in the stash do not fight.
- **Shop**: 5 cards per round. Reroll costs 1 gold. A locked card 🔒 stays for the next round. Drag an item onto the shop to sell it for half its price.
- **Gold**: 10 at the start, then 7 + round (up to 17) each round. A lost fight gives 2 extra gold.
- **HP**: 30 + 6 × round, the same for both sides, plus item bonuses.
- **Stamina ⚡**: 10, refills 1 per second. Weapons cost stamina. Magic items do not.
- **Block 🛡️** soaks damage before HP. It does not decay.
- **Poison ☠️** deals its stacks every 2 seconds and ignores block. Then it loses 1 stack. Each heal also removes 1 stack.
- **Crit** doubles the damage. **Stun** pauses all enemy items.
- **Fatigue**: after 20 seconds both sides lose 1, 2, 3 … HP per second.

## Classes

| Class | Start | Style | Unlock |
|---|---|---|---|
| ⚔️ Knight | 🗡️ 🛡️ 🍎 🪨 | Big weapons, armor, rage | Free |
| 🌿 Herbalist | 🎯 🌱 🍎 | Poison, healing | 🎖️ 5 |
| ✨ Mage | 🪄 🔮 🍎 | Magic items without stamina | 🎖️ 12 |

## Items

| Group | Items |
|---|---|
| Bags | 👝 Pouch, 🎽 Sash, 👜 Saddlebag, 💼 Satchel, 🍱 Lunch Box (food 25% faster), 🧰 Tool Belt (weapons +1), 🛄 Duffel (locked), 🧺 Herb Basket, 👛 Spell Pouch, 🗃️ Scabbard |
| Weapons | 🗡️ Wooden Sword, 🔪 Dagger, 🏏 Spiked Club, 🔱 Spear (ignores block), 🔨 Hammer (stun), 🪓 Axe, ⚔️ Greatsword, 🎯 Poison Dart, 🥀 Thistle Whip, 🪄 Wand, 🦯 Star Staff |
| Armor | 🛡️ Wooden Shield, 🦺 Leather Vest, 🌵 Thorn Mail, 🧱 Tower Shield, ⛓️ Chain Mail, 🥋 Mage Robe |
| Food and potions | 🍎 Apple, 🍌 Banana, 🍄 Mushroom, 🥖 Baguette, 🧀 Cheese, 🍖 Roast Meat, 🌱 Healing Herbs, 🥕 Mandrake, 🧪 Health Potion, ⚗️ Venom Flask |
| Stars | 🪨 Whetstone, 🍀 Clover, ♦️ Ruby, 🔷 Sapphire, 🟢 Emerald, 🔶 Topaz, 🟣 Amethyst, 🧤 Gloves, 🏮 Lantern, ⌛ Hourglass, 👑 Crown, 📯 War Horn, 🌿 Nettle, 🔮 Mana Crystal, 🦠 Spore Sack |
| Other | 🐷 Piggy Bank (+1 gold per round), 💣 Bomb, 📿 Amulet, 🗿 Rage Totem, 🔥 Fire Orb, ❄️ Frost Orb, 📕 Spellbook |

Rarity: common, rare, epic, legendary. Rarer items show up more often in later rounds.

## Run loop

1. Each round: shop, then a fight against a ghost build.
2. The ghost is generated from the run seed and the round. It has a random class and the class start items. Its gold budget is a share of your total income: nothing extra in round 1, ×0.5 in round 2, ×0.75 in round 3, then ×1.2 in round 4 and +0.11 per round after that. The auto-packer places its items for the most star links.
3. A win gives a trophy 🏆. A loss costs a life ❤️.
4. The fight for the 10th trophy is against the Rat King 👑 (budget ×1.5, +30 HP).
5. Score: 100 per trophy. A full win adds 500 and 60 per life left.

## Meta progress

Each run gives renown 🎖️: 1 per trophy, +5 for a full win. Spend it on the title screen to unlock the Herbalist, the Mage and 6 items (Duffel, Amulet, Crown, Rage Totem, Spore Sack, Star Staff).

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Items, bags, classes, item text |
| `src/grid.ts` | Shapes and rotation, placement rules, star links and buffs, auto-packer |
| `src/battle.ts` | Fixed-step fight simulation (0.1 s ticks) that records frames and events |
| `src/run.ts` | Run state, shop, ghosts, economy, save data |
| `src/bot.ts` | Smart and weak shop bots |
| `src/app.ts` | Screens, drag and drop, battle replay, input, debug API |
| `src/sfx.ts` | WebAudio synth |
| `src/rng.ts` | Seeded RNG and hash |

The fight is a pure function of the two builds and a seed. The app plays back its frames with bars, cooldown bars and floating numbers.

Save keys: `packrat.run` and `packrat.meta` in `localStorage`.

## Debug

Open the game with `?debug` (add `&fast` to skip the fight replay). The console then has `window.debug`:

- `debug.step()`: one bot action. On the shop screen the smart bot buys, places, sells, rerolls or starts the fight. Returns `'busy'` while a replay runs.
- `debug.state()`: screen, round, lives, trophies, gold, items, shop, battle and end data.
- `debug.gold(n)`, `debug.renown(n)`.
