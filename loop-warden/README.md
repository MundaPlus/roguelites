# Loop Warden

Loop-building auto-battler roguelite (like Loop Hero). Status: playable.

## How to play

1. Pick a hero and start an expedition. The hero walks the loop road alone and fights every enemy it meets.
2. You do not steer the hero. You place tile cards around the loop. Pick a card from your hand, then tap a lit cell. The game pauses while a card is selected.
3. Road cards spawn enemies. Enemies drop items, cards and ⚙️ metal. Side cards make the hero stronger.
4. Tap an item in the bag to equip or scrap it. ▲ marks an item that is better than the one you wear. **Best gear** equips the best item for each slot.
5. Drink a potion (🧪) to heal 40% of max HP. The camp gives back one potion per loop.
6. Keys: `1`–`8` pick a card, arrows move the cursor, `Enter` places, `Esc` cancels or opens the menu, `Space` pauses, `S` changes the speed (1×, 2×, 3×), `Q` drinks a potion, `E` equips the best gear, `M` mutes.

## Rules

- **Days:** a day lasts 7 seconds of walking. The clock stops during fights. Each day you draw a card, tiles spawn enemies and yield resources, and plain road can spawn a Slime.
- **Fights:** the hero fights the enemies on its cell and on the two road cells next to it (up to 6). Every fighter attacks on its own timer. Damage minus defense, at least 1. Crits deal double. Evasion makes an attack miss. Vampirism heals by a share of the damage dealt.
- **Loops:** enemies spawned in later loops are stronger (HP and attack ×1.3 at loop 2, ×2 at loop 4). The camp heals 25% of max HP each loop.
- **Boss meter 🧙:** placing a tile adds its meter points. Each loop adds 4. When the meter reaches 150, the Lich waits at the camp. Beat it to win.
- **Retreat:** at the camp you can retreat and keep 100% of your resources. The menu retreat keeps 60%. Death keeps 30%. A win keeps 100% plus 10 of each resource.
- **Hand and bag:** the hand holds 8 cards. An extra card pushes out the oldest one for 1 random resource. The bag holds 10 items. An extra item scraps the weakest one for metal.

## Tiles

| Card | Place | Meter | Effect |
|---|---|---|---|
| 🪦 Graveyard | Road | 5 | A Skeleton every 3 days (max 2). +1 ⚙️ every 4 days. |
| 🌳 Grove | Road | 4 | A Ratwolf every 2 days (max 2). +1 🪵 every 2 days. |
| 🕸️ Spider Cocoon | Road | 3 | A Spider every day (max 3). |
| 🏚️ Vampire Mansion | Next to road | 6 | A Vampire every 3 days (max 2). +1 ⚙️ every 3 days. (Crypt) |
| 🌼 Meadow | Off road | 1 | Heals 2 HP each day, 5 when it blooms. +1 🍖 every 3 days. |
| ⛰️ Mountain | Off road | 2 | +6 max HP, +2 per mountain next to it. +1 🪨 every 3 days. |
| 🌲 Forest | Off road | 2 | +5% attack speed, +8% as a Thicket. +1 🪵 every 4 days. |
| 🏘️ Village | Next to road | 2 | Heals 8 + 2 × loop when you walk past. +1 🍖 every 2 days. (Farm) |
| 🏮 Lantern | Off road | 1 | Road cells within 2 spawn 50% less. Stacks down to 25%. (Lamplighter) |
| 🗼 Beacon | Next to road | 2 | Within 2 cells you walk 60% faster and attack 10% faster. (Lighthouse) |
| 🕳️ Oblivion | On a tile | 0 | Removes the tile and the enemies on its cell. |

### Combos

| Combo | Effect |
|---|---|
| Blooming meadow | A meadow next to (8 directions) any other tile heals 5 instead of 2. |
| Mountain range | Each mountain gets +2 HP for each mountain next to it. |
| Peak 🏔️ | 9 or more linked mountains give +50% HP, but a Harpy spawns nearby every 4 days. |
| Thicket | A forest with 2 or more forest neighbors gives +8% attack speed instead of 5%. |
| Ghoul nest 🔥 | A village next to a Vampire Mansion stops healing and spawns a Ghoul every 2 days. |

## Enemies

| Enemy | HP | Attack | Speed | Notes |
|---|---|---|---|---|
| 🟢 Slime | 12 | 3 | 0.8/s | Spawns on plain road |
| 🕷️ Spider | 7 | 2 | 1.4/s | Weak, comes in numbers |
| 🐺 Ratwolf | 16 | 4 | 1.0/s | |
| 💀 Skeleton | 22 | 5 | 0.75/s | Defense 1 |
| 🧛 Vampire | 26 | 5 | 0.9/s | Heals 30% of its damage |
| 🧟 Ghoul | 32 | 6 | 0.7/s | Defense 2 |
| 🦅 Harpy | 18 | 5 | 1.2/s | 30% evasion |
| 🧙 The Lich (boss) | 420 | 14 | 0.75/s | Starts with 2 Skeletons and raises one every 7 seconds |

## Heroes and items

| Class | HP | DMG | Speed | Special | Unlock |
|---|---|---|---|---|---|
| 🤺 Warrior | 110 | 5 | 0.9/s | Defense 1 | Start |
| 🥷 Rogue | 80 | 4 | 1.3/s | 20% crit, 8% evasion | Thieves' Guild |
| 🧝 Priest | 95 | 4 | 0.95/s | 10% vampirism, camp heals 15% more | Chapel |

Items have 4 slots: ⚔️ weapon (damage), 🥋 armor (HP), 🛡️ shield (defense), 💍 ring (crit, vampirism, speed or evasion). Rarity is Common, Rare, Epic or Legendary. Each rarity above Common adds one extra random stat and raises the main stat. Item level is the loop number, so later drops are stronger.

## Camp (meta progress)

Resources you bring home go to the camp. Buildings stay for every later run.

| Building | Cost | Effect |
|---|---|---|
| 🌿 Herbalist | 🪵8 🍖8 | +1 starting potion and +1 potion slot |
| 🏋️ Gymnasium | 🪵12 🪨8 | +15 max HP |
| 🌾 Farm | 🪵10 🍖6 | Unlocks Village |
| ⚒️ Smithy | 🪨12 ⚙️10 | Start with a rare weapon |
| 🏮 Lamplighter | 🪵10 ⚙️8 | Unlocks Lantern |
| 🍲 Field Kitchen | 🪵10 🍖18 | The camp heals 35% instead of 25% |
| ⚰️ Crypt | 🪨16 ⚙️12 | Unlocks Vampire Mansion |
| 🗡️ Thieves' Guild | 🍖12 ⚙️18 | Unlocks Rogue |
| 🗼 Lighthouse | 🪵14 🪨20 | Unlocks Beacon |
| 📦 Supply Depot | 🪵18 🪨14 | +2 starting cards |
| ⛪ Chapel | 🪨26 🍖20 | Unlocks Priest |
| 🔥 War Forge | 🪨24 ⚙️30 | +2 damage |

The title screen shows runs, wins, best loop, best score and total kills.

## Run loop

1. Choose a class and a seed. The seed picks one of 4 loop layouts (30 to 42 road cells) and all random rolls.
2. Walk loops. Place tiles, equip drops and use potions. Each camp visit offers a retreat.
3. Fill the boss meter when you feel strong enough. The Lich appears at the camp.
4. Win, retreat or die. The score is kills × 5 + finished loops × 40 + tiles × 3, plus 1000 for a win or 50 for a camp retreat.
5. Spend resources at the camp. Start the next run.

The run saves to `localStorage` (`loopwarden.run`) every few seconds and at each camp. The meta progress is in `loopwarden.meta`.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Maps, tiles, enemies, classes, item names, rarity, camp buildings |
| `src/world.ts` | Pure run state: path building, placement rules, combos, hero stats, day/spawn/fight simulation, items, save data |
| `src/bot.ts` | `random` and `smart` bots for the debug API and the balance sim |
| `src/app.ts` | Screens, canvas renderer, effects, input, debug API |
| `src/rng.ts` | Seeded RNG (mulberry32) and `hash` |
| `src/sfx.ts` | WebAudio synth sounds |

`world.tick(run, dt)` advances the run in fixed 0.05 s steps and returns events. The app turns events into sounds and floating numbers.

## Debug

Open the game with `?debug` (add `&fast` to end runs without the short end delay). The console then has `window.debug`:

- `debug.state()`: `screen` (`title`, `setup`, `camp`, `play`, `end`), loop, day, HP, boss meter, fight, hand, result and meta.
- `debug.step()`: one bot action. On menus it starts or continues a run. In play the smart bot places cards, equips, drinks potions, walks on at the camp and plays 3 seconds of game time.
- `debug.res(n)`: adds `n` of each resource to the camp.
- `debug.meter()`: fills the boss meter.

A fast bot run reaches the `end` screen in about 100 steps.
