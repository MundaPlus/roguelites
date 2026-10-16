# Wild Camp

Survival crafting roguelite (like Don't Starve). Status: playable.

## How to play

1. Move with `WASD` or the arrow keys. On touch screens, use the stick at the bottom left. You can also click or tap a spot to walk there.
2. `Space` or `E` (✋) acts on the closest thing: pick, chop, mine, pick up, feed a fire, collect a trap, open the gate. Click or tap a thing to walk to it and act on it.
3. `F` (⚔️) attacks the closest creature. Clicking a creature also attacks it.
4. `C` (🔨) opens the crafting menu. The game pauses while a menu is open.
5. Keys `1`–`9` use an inventory slot. Click a slot to see its actions: eat, equip, cook, burn, drop. Click it again to use it.
6. `Esc` opens the menu. The game saves at each dawn, when you open the menu and when you leave the page.

## Rules

- **Needs**: ❤️ health, 🍖 hunger and 🧠 sanity. Hunger drops by 75 per day. At 0 you lose health. Health comes back slowly while you are well fed.
- **Body heat** 🌡️ moves toward the air temperature. Clothes, torches and fires warm you. Below 0° you freeze, above 70° you overheat. The forest gives shade in summer.
- **Day, dusk and night**: one day lasts 160 seconds. At night the screen goes dark. Stand in the light of a fire or hold a light. In the dark, something bites you every few seconds.
- **Sanity** drops at dusk and at night, and much faster in the dark. Below 30%, shades come for you. They go away when your sanity is back above 45%.
- **Food spoils** over days (slower in winter). Stale food gives less. Rotten food turns to 🦠 rot. Cook food at a fire.
- **Tools, weapons, armor and lights wear out.** Armor blocks a share of the damage and loses durability by the amount it blocks.
- **Wolf packs** hunt you on some nights (first on day 5, then every 3 nights).
- **Win**: bring the 4 gate parts to the 🌀 ancient gate. 3 parts are in ✨ strange mounds (forest, rocky land, marsh), next to a spider den, a wolf den or a frog pond. The 4th, the ❤️‍🔥 ancient heart, comes from a season boss.

## Seasons

Each season lasts 5 days. A boss appears on day 2 of each season (autumn only from the second year) and leaves when the season ends.

| Season | Air (day / night) | Notes | Boss |
|---|---|---|---|
| 🍂 Autumn | 32° / 16° | Mild | 🐻 Grizzhorn (year 2+) |
| ❄️ Winter | 10° / −8° | Plants stop growing. Food spoils at half speed. | 🦣 Frost Giant |
| 🌱 Spring | 26° / 14° | Yaks get grumpy | 🫎 Bog Moose |
| ☀️ Summer | 78° / 48° | Hot days. Find shade or cool clothes. | 🐉 Sun Wyrm |

Bosses slam the ground. A red circle shows where. Step out of it.

## World

A seeded 72×72 tile map with 4 biomes: grassland, forest, rocky land and marsh (with ponds). Resource nodes grow back after some days.

| Node | Gives | Notes |
|---|---|---|
| 🌱 Sapling | 2 twigs | Regrows |
| 🌾 Grass tuft | 2 cut grass | Regrows |
| 🌲 Tree / 🌳 Oak | 2–3 logs | Needs an axe |
| 🪨 Boulder / gold vein | Rocks, flint, gold | Needs a pickaxe |
| 🔺 Flint | 1 flint | On the ground |
| 🫐 Berry bush, 🥕 carrot, 🍄 mushroom | Food | Plants do not regrow in winter |
| 🌼 Flower | Petals | +4 sanity when picked |
| 🎋 Reeds | Reeds | Marsh |
| 🕸️ Spider den | Silk | Can be destroyed, spiders defend it |

## Creatures

| Creature | Type | Behavior |
|---|---|---|
| 🐇 Rabbit | Passive | Runs away. Hides at night. Traps catch it. |
| 🦬 Yak | Neutral | Charges when hit, with the yaks close by. Drops meat and fur. |
| 🐗 Boar | Neutral | Charges when hit, or when you come close at night. |
| 🕷️ Spider | Hostile | Sleeps in its den by day, hunts at night. |
| 🐺 Wolf | Hostile | Faster than you. Hunts at night. Drops teeth. |
| 🐸 Frog | Hostile | Marsh. Active by day. |
| 👤 Shade | Hostile | Comes with low sanity. Drops shadow fuel. |

## Crafting

| Tier | Where | Recipes |
|---|---|---|
| 0 | Anywhere | Axe, pickaxe, torch, campfire, trap, grass armor, herb poultice, science machine |
| 1 | Near a ⚗️ science machine | Rope, boards, cut stone, spear, fire pit, log armor, fur hat, fur coat, straw hat, reed vest, flower crown, straw roll, drying rack, tooth helm, alchemy engine |
| 2 | Near a 🔮 alchemy engine | Lantern, tooth spear, stone armor, shadow blade, silk bandage |

Cook food at a burning fire. Hang raw meat on a drying rack to make jerky. Sleep on a straw roll at night by a fire to skip to dawn.

## Survivors (meta progress)

Every day you survive adds to your total. New survivors unlock at a total number of days.

| Survivor | Unlock | Trait |
|---|---|---|
| 🧑 Wren | Start | No tricks |
| 🧔 Bram | 4 days | Starts with an axe, chops twice as fast |
| 👩‍🌾 Ivy | 10 days | Plants feed 40% more, starts with 2 poultices, 125 health |
| 🧑‍🚒 Kael | 18 days | Starts with a lighter, always 15° warmer |
| 💪 Odo | 28 days | +30% damage, 180 health, hungry 35% faster |
| 👩‍🔬 Mira | 40 days | One crafting tier more anywhere, 110 health, 240 sanity |

Score: 100 per day survived, 5 per kill, 200 per boss, 300 per gate part, and on a win 3000 plus 100 per day under 30.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Items, recipes, nodes, creatures, seasons, survivors |
| `src/world.ts` | Seeded map: biomes, water, nodes, the gate and the parts |
| `src/game.ts` | Fixed-step simulation (30 Hz): needs, temperature, light, creatures, crafting, save format |
| `src/bot.ts` | Survival bots (good, weak, random) for the debug API and the balance sim |
| `src/run.ts` | Save data (`wc.run`, `wc.meta`), score, unlocks |
| `src/app.ts` | Screens, canvas renderer with camera and light layer, HUD, inventory, input |
| `src/sfx.ts` | WebAudio synth |

## Debug

Open the game with `?debug` (add `&fast` to skip effects during bot steps). The console then has `window.debug`:

- `debug.step(seconds = 20)`: one bot action. On the title it starts a run. In a run it plays `seconds` of game time with the survival bot. On the end screen it returns `'end'`.
- `debug.state()`: screen, day, season, phase, needs, position, parts, bot mode, end info.
- `debug.give(id, n)`, `debug.day(n)`, `debug.heal()`, `debug.win()`.

## Balance

A headless sim plays the core loop with the bots (100 runs each, Wren):

| Bot | Wins | Average days |
|---|---|---|
| Good (plans crafts, keeps fires, dodges slams) | 54% | 7.4 |
| Weak (gathers at random, torch only) | 0% | 0.7 |
| Random (walks at random) | 0% | 0.5 |
