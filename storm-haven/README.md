# Storm Haven

Settlement builder roguelite (like Against the Storm). Status: playable.

## How to play

1. Choose a settlement on the world map. Each one has a biome, villager species and maybe curses.
2. Pick a blueprint. Then pick buildings in the **Build** tab and tap cleared ground to place them. Free villagers walk over and build them.
3. Tap a building and press ＋ to add a worker. Workers gather or craft, then carry the goods to the Hearth or a Warehouse.
4. Meet the orders in the **Orders** tab. Reach the reputation goal ⭐ before the Queen's impatience 😠 reaches 100%.
5. After a win, choose a capital upgrade. Then choose the next settlement.

Controls: drag to pan, mouse wheel or pinch to zoom, tap to place or select. Keys: `WASD`/arrows pan, `+` `−` zoom, `Space` pause, `0`–`3` speed, `R` road tool, `Esc` cancels or opens the menu.

## Rules

- The game runs at 4 ticks per second. Speeds are pause, 1×, 2× and 3×. Modals pause the game.
- The map is 36×36 tiles of forest, ground, roads and water. Buildings stand on cleared ground. Roads make villagers walk 70% faster. Forest makes them slower.
- Woodcutters cut trees next to open ground. Hidden glades open when the clearing reaches them.
- Glades hold resource nodes (berries, mushrooms, herbs, stone, clay) and sometimes an event.
- Villagers eat every 55 s. Liked food gives +3 resolve, bread and stew +1 more. No food gives −6.
- A shelter gives +1 resolve, a house +3. Homeless villagers get −3 (−6 in the storm). A luxury (tea or ale) gives +3.
- Villagers with resolve below 0 for 25 s leave and add 3% impatience. Villagers with resolve 10 or more add reputation slowly.
- Newcomers arrive every 95 s while the average resolve is 2 or more.
- Each settlement has 5 orders (6 in the final one). Two are open at the start. Each open order offers a choice of 2 tasks. A done order gives reputation, lowers impatience by 6% and opens the next order.

### Seasons

| Season | Length | Effect |
|---|---|---|
| 🌦️ Drizzle | 100 s | Farms work 30% faster. A new year gives a blueprint pick. |
| ☀️ Clearance | 70 s | The caravan visits a Trading Post. |
| ⛈️ Storm | 50 s | −2 resolve, farms stop, work and walking are slower, dangers count double. |

## Goods (15 + coins)

| Raw | From | Processed | Recipe |
|---|---|---|---|
| 🪵 Wood | Woodcutters' Camp | 🪜 Planks | 3 wood → 2 planks |
| 🌾 Grain | Farm | 🥣 Flour | 3 grain → 2 flour |
| 🫐 Berries | Gatherers' Hut | 🍞 Bread | 2 flour + 1 wood → 4 bread |
| 🍄 Mushrooms | Gatherers' Hut | 🧱 Bricks | 2 clay + 1 wood → 2 bricks |
| 🌿 Herbs | Gatherers' Hut | 🍵 Tea | 2 herbs → 2 tea |
| 🪨 Stone | Quarry | 🍺 Ale | 3 grain → 2 ale |
| 🏺 Clay | Quarry | 🍲 Stew | 2 mushrooms + 1 herbs → 3 stew |
| | | 🔨 Tools | 1 planks + 2 stone → 1 tools |

Coins 🪙 come from selling goods to the caravan.

## Buildings (19)

| Building | Cost | Notes |
|---|---|---|
| 🔥 Hearth | — | Start building and storage |
| 🛤️ Road | 1 wood | Built at once |
| 🛖 Shelter | 8 wood | 3 beds |
| 🪓 Woodcutters' Camp | 3 planks | 2 workers, range 7 |
| 🧺 Gatherers' Hut | 8 wood | 2 workers, range 8 |
| ⛏️ Quarry | 8 wood, 4 planks | 2 workers, range 8 |
| 🌾 Farm | 6 wood, 4 planks | 2 workers |
| 🪚 Lumber Mill | 12 wood | 2 workers |
| 📦 Warehouse | 10 wood, 4 planks | Second drop point |
| 🏡 House | 6 planks, 4 bricks | Blueprint. 5 beds |
| ⚙️ Mill, 🥖 Bakery, 🍺 Brewery, 🍲 Cookhouse | 8 planks, 4 stone | Blueprints |
| 🏭 Brickyard | 6 planks, 6 stone | Blueprint |
| 🍵 Tea House | 8 planks, 4 clay | Blueprint |
| 🔨 Toolsmith | 10 planks, 6 stone | Blueprint |
| ⚖️ Trading Post | 12 planks, 4 bricks | Blueprint. Caravan trade and tribute (25 🪙: −8% impatience) |
| ⛩️ Shrine | 8 bricks, 2 tools | Blueprint. +2 resolve for all |

The first 8 buildings are always available. The others come from blueprint picks: one at the start, one each new year and one per Ancient Ruins.

## Species

| Species | Likes | Luxury | Skilled at (+40%) |
|---|---|---|---|
| 🧑 Human | bread, berries | ale | farm, mill, bakery, brewery |
| 🦫 Beaver | bread, mushrooms | tea | woodcutter, lumber mill, toolsmith |
| 🦊 Fox | berries, stew | tea | gatherer, cookhouse, tea house |
| 🦎 Lizard | stew, mushrooms | ale | quarry, brickyard, toolsmith. Half storm penalty |

## Glade events

| Event | Danger while open | Cost to solve | Reward |
|---|---|---|---|
| 🧟 Rotting Den | −2 resolve | 10 planks, 4 herbs | +1 reputation |
| 🌀 Storm Altar | +35% impatience | 10 stone, 12 wood | +1 reputation |
| 🐺 Wolf Lair | −1 resolve, −15% work | 20 wood, 10 berries | +1 reputation |
| 🏛️ Ancient Ruins | — | 6 planks | Blueprint pick |
| 🎁 Lost Cache | — | free | Goods |
| 💧 Silver Spring | — | 10 wood | +1 resolve for all |

## World map

| Biome | Species | Special |
|---|---|---|
| 🌳 Royal Woodlands | human, beaver, fox | Balanced |
| 🐸 Clay Marshes | beaver, lizard, fox | Much clay and mushrooms, farms −25% |
| ⛰️ Stone Highlands | human, lizard, beaver | Much stone, storms +30% |
| 🍎 Scarlet Orchard | human, fox, beaver | Farms +25%, more dangers |
| ⛈️ Blightstorm Vale | all four | Final settlement. More dangers, longer storms, 2 curses |

Curses: Endless Rain, Hungry Mouths, Restless Spirits, Impatient Queen, Hardwood, Haunted Glades, Thin Caravan, Rot.

## Run loop

1. A run has 4 settlements. Choose 1 of 3 biomes for each of the first 3, and 1 of 2 final settlements.
2. The reputation goal is 13, 14, 15 and 17 for the final one.
3. A lost settlement costs 1 favor 💠 (2 at the start). At 0 favor the run ends. Losing the final settlement ends the run.
4. After each win, choose 1 of 3 capital upgrades for the rest of the run: Sharp Axes, Seed Stock, Craft Guild, Extra Settlers, Supply Wagon, Royal Envoy, Cozy Homes, Archive Copies, Scouts, Festivals.

## Meta progress

Each run gives crowns 👑. Spend them on the title screen on lasting upgrades: Capital Stores, Settler Charter, Royal Patience, Storm Lore, Royal Library and Queen's Favor. Save keys: `storm-haven.run`, `storm-haven.meta`, `storm-haven.mute`.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Goods, buildings, species, biomes, curses, events, perks, meta upgrades |
| `src/sim.ts` | Map generation, villager jobs and hauling, needs, seasons, orders, player actions |
| `src/run.ts` | World map, settlement flow, capital upgrades, score, save data |
| `src/bot.ts` | Build-order bot (`smartBot`) and random bot (`weakBot`) |
| `src/app.ts` | Screens, canvas map with camera, side panel, input, debug API |
| `src/sfx.ts` | WebAudio synth |

The simulation has no DOM code and keeps its RNG state in the save, so the bots and a headless sim use the same rules as the game.

## Debug

Open the game with `?debug` (add `&fast` for bigger steps). The console then has `window.debug`:

- `debug.state()`: screen, settlement summary, run and end data.
- `debug.step(ticks?)`: one bot action. In a settlement it plays 200 ticks (50 s, 400 with `&fast`) with the build-order bot.
- `debug.win()`, `debug.give(good, n)`, `debug.crowns(n)`.
