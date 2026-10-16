# Brew Rogue

Potion-brewing roguelite (like Potion Craft). Status: playable.

## How to play

1. Each day, accept customer orders from the board. An order names an effect, a minimum strength (★ to ★★★), a deadline and a price.
2. Press **Brew** and choose a base. Each base has its own effect map.
3. Tap an ingredient to see its path as a gold preview line. A ❌ shows where the path would touch danger. Set the grind, then press **Add**.
4. Hold **Stir** to move the marker along the dotted queue. Hold **Water** to pull the marker and the queue toward the center.
5. Stop inside an effect circle and press **Bottle**. The closer to the middle, the stronger the potion (I, II, III).
6. Deliver the potion from "Your orders". Pay the guild debt at the end of every week.

Keys: `1`–`9` pick an ingredient, `←` `→` grind, `A` add, `S` stir (hold), `W` water (hold), `B` bottle, `Esc` menu. On the day screen: `B` brew, `M` market, `G` gather, `E` end day. Mouse and touch work for everything.

## Rules

- A day has 3 hours. A brew takes 1 hour (when you bottle it or when it is ruined). A gathering trip takes 2 hours.
- Touching a 💀 danger zone ruins the potion. The ingredients are lost.
- Grind sets how much of the ingredient path you use: 25%, 50%, 75% or 100%.
- An order is lost at the end of its last day. You lose 3 reputation and the rival gains 2.
- A stronger potion than asked pays 15% more per level. Each delivery gives +1 ⭐.
- Morwen, the rival, takes orders from the board. Her share is `0.7 × her ⭐ / (your ⭐ + her ⭐)`, up to 75%.
- Debts: 180, 400, 650 and 880 gold at the end of weeks 1–4. If you cannot pay, the run ends.
- On day 16 the Guild Master orders a strength III potion for the last day. If you fail it, the run ends.
- Win: pay all 4 debts.

## Maps

| Base | Opens | Effects |
|---|---|---|
| 💧 Spring Water | Day 1 | Healing, Fire, Luck, Sleep, Strength, Frost, Light |
| 🛢️ Lamp Oil | Week 2 | Poison, Swiftness, Love, Fire, Sleep, Strength, Healing |
| 🍷 Dark Wine | Week 3 (Guild Hall unlock) | Invisibility, Light, Luck, Frost, Love, Poison, Swiftness |

Each map has 7 effect zones and 11–12 danger zones.

## Ingredients and salts

| Ingredient | Rarity | Path |
|---|---|---|
| 🌿 Healroot | common | up, small zigzag |
| 🌺 Firebloom | common | right, bends up |
| 🌾 Windgrass | common | left, bends up |
| 🍄 Mossbell | common | down-left |
| 🌰 Ironnut | common | down-right |
| 🍒 Sunberry | uncommon | up, then hooks right |
| 🌸 Moonpetal | uncommon | big arc to the left |
| 🌱 Frostfern | uncommon | long left zigzag |
| 🧅 Bog Bulb | uncommon | down with a kink |
| 🌶️ Ember Pepper | uncommon | right zigzag |
| 🐉 Dragonscale | rare | long straight right |
| 🪶 Phoenix Plume | rare | long up-right |
| 🪻 Ghost Orchid | rare | left, then curls |
| ⭐ Star Anise | rare (unlock) | long up-left |
| 🍇 Grave Grape | rare (unlock) | long down-left |

| Salt | Effect |
|---|---|
| ☀️ Sun Salt | Turns the queued path 20° clockwise |
| 🌙 Moon Salt | Turns the queued path 20° counter-clockwise |
| 🌬️ Gale Salt | Pushes the marker 8 up |
| 🪨 Stone Salt | Pushes the marker 8 down |

## Gathering

| Place | Finds | Risk |
|---|---|---|
| 🌲 Whisper Woods | 4–6 common | 12% |
| 🐸 Murk Swamp | 3–5 uncommon | 28% |
| 🏔️ Dragon Peaks | 2–4 rare | 42% |

Bad events: bandits (lose 25% gold), storm (half the finds), injury (1 hour less tomorrow), wolves (nothing).

## Run loop

1. 4 weeks of 5 days. Each morning brings 3 customers, a new market stock and the rival's claims.
2. Spend the day on brews, market visits and trips. Then end the day.
3. At night, late orders fail and the weekly debt is due on day 5 of each week.
4. The run ends with a win after the last debt, or a loss. The score is gold earned + 5 × ⭐ + 10 × days (+300 for a win).

## Meta progress

Each run gives seals 🔖 (score / 150). Spend them in the Guild Hall on the title screen:

| Unlock | Effect |
|---|---|
| 👛 Fat Purse | +20 starting gold |
| 🧂 Salt Cellar | 1 extra Sun Salt and 1 Moon Salt at the start |
| 🛒 Big Cart | Markets stock 1 more uncommon ingredient |
| ⭐ Exotic Trade | Star Anise and Grave Grape appear |
| 🍷 Dark Wine | The Wine map opens in week 3. The week 3 and 4 debts cost 60 gold more |
| 📜 Notice Board | Strength III orders give 1 more day |

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Effects, maps, ingredients, salts, places, customers, unlocks |
| `src/brew.ts` | Marker, queue, stir, water, salts, danger checks, beam-search solver |
| `src/run.ts` | Days, orders, market, gathering, rival, debt, score, saves |
| `src/bot.ts` | Smart and weak bots, shared by the sim and the debug API |
| `src/app.ts` | Screens, SVG map, hold-to-stir loop, input, debug API |
| `src/sfx.ts` | WebAudio sounds |

Saves: `brew.run` and `brew.meta` in `localStorage`.

## Debug

Open the game with `?debug` (add `&fast` to skip animations). The console then has `window.debug`:

- `debug.step()`: one bot action. The bot searches ingredient sequences (with water and turn salts) for each order, buys what it needs and plays the plan step by step. Returns `'busy'` while the marker moves.
- `debug.state()`, `debug.gold(n)`, `debug.seals(n)`.
