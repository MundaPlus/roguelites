# Dust Trail

Caravan journey survival roguelite (like Oregon Trail / Death Road to Canada). Status: playable.

## How to play

1. Choose a starting group and set out from Independence. Buy supplies in the first town.
2. On the map, pick the next stop. Each road shows its miles, its danger (💀) and the water you need.
3. The wagon then travels day by day. Each day costs food and water. Events can stop the wagon.
4. In events, pick a choice. A choice with a skill tag uses your best traveler at that skill. The % shows the success chance.
5. Some choices start a short real-time scene: a hunt, a river crossing or a bandit ambush.
6. Reach Green Valley at the bottom of the map with at least one traveler alive. Raiders guard the last gate.

Input:

- Mouse or touch: click or tap buttons, map nodes, animals and bandits. In the river, hold the mouse or finger where the wagon should go.
- Keys: `1`–`4` choose a stop or a choice. `Enter` continues. `Space` stops and starts the wagon. In scenes, arrows move the aim and `Space` shoots. In the river, `←` `→` or `A` `D` steer. `Esc` opens the menu.

## Rules

- **Food**: each traveler eats 1 per day (Glutton 1.5, Light Eater 0.75). Rations change this: Lean ×0.6, Normal ×1, Full ×1.4. Cold weather adds 30%.
- **Water**: each traveler drinks by terrain and weather. Rain refills the barrels a little. Rivers, springs and towns fill them. The barrels hold 40 (bigger barrels in towns).
- **Hunger and thirst**: with no food, each traveler loses 1 HP per day. With no water, 2 HP per day.
- **Wagon**: wears down each day by terrain, weather and pace. At 0 it uses a spare part. With no parts, it crawls at half speed. Mechanics lower the wear.
- **Pace**: Steady is 12 miles per day. Hard is 18 miles per day, with more wear, more sickness and HP loss.
- **Health**: travelers have 10 HP (Tough 13, Frail 8). They heal on Normal and Full rations. Sickness drains HP until it passes or you use medicine (💊 Treat on the traveler card).
- **Morale**: 0–100. Weather, rations, hunger, traits and friendships change it each day. Below 25, travelers may walk away with some food. A death costs 15 morale (8 with a Pious traveler) and more for friends.
- **Relations**: each pair of travelers has a relation from −3 to 3. Friends (💛) raise morale. Rivals (⚡) lower it and start quarrels.
- **Danger**: each road has danger 0–3. It raises the chance of events and opens bandit events.
- **Loss**: the run ends when nobody is left.

## Skills and traits

| Skill | Effect |
|---|---|
| 🎯 Hunter | Bigger hit circle and slower game in hunts. Opens tracking choices. |
| ⚕️ Medic | Sick travelers recover faster. Medicine heals more. Opens doctor choices. |
| 🔧 Mechanic | Less wagon wear, better repairs, less river damage. |
| 🧭 Scout | Fewer obstacles in rivers. Sneak past bandits. Opens path choices. |
| 💬 Talker | Lower prices, better job pay. Opens trade and talk choices. |
| 🔫 Gunhand | Shoots bandits by itself in ambushes. |

15 traits: Tough, Frail, Glutton, Light Eater, Cheerful, Grumpy, Brave, Coward, Lucky, Pious, Sharpshooter, Greedy, Strong, Musician, Loyal.

## Map and places

The map has 12 rows in 3 regions: The Long Plains (prairie, forest), The Dry Basin (desert, badlands) and The High Pass (mountains, forest). Rows 3, 6 and 9 always have a town.

| Place | What happens |
|---|---|
| 🏘️ Town | Store (food, water, ammo, parts, medicine, repair, doctor, inn, bigger barrel), 3 jobs, 1–2 recruits |
| 🌊 River | Fills water. Ford it (river scene), pay the ferry, wait a day for an easier ford, or scout a shallow ford |
| 🦌 Hunting grounds | Hunt (hunt scene) or set snares |
| 🏴 Bandit pass | Fight (ambush scene), sneak around, talk or pay the toll |
| 💧 Spring | Fills water. Rest a day |
| 🔥 Camp | Rest, play music or fix the wagon |
| ❔ Ruins | One of 5 ruin events |
| 🌄 Green Valley | The final ambush with the raider boss |

## Real-time scenes

| Scene | Play | Result |
|---|---|---|
| 🦌 Hunt (20 s) | Shoot rabbits, turkeys, ducks, deer, boars and bison. Each shot costs 1 ammo. | Meat, up to 50 (+20 per Strong traveler) |
| 🌊 River (13–16 s) | Steer the wagon past rocks, logs and snags against a changing current. | Each hit damages the wagon and loses supplies. Rocks can throw a traveler into the water. |
| 🏴 Ambush (32 s, boss 45 s) | Shoot thugs, riders and gunmen before they reach the wagon. Gunhands fire by themselves. | Bandits at the wagon steal supplies and hurt travelers. Shoot a fleeing bandit to get the loot back. |

## Events

72 data-driven events in `src/events.ts`: 5 place events, 5 ruin events, 49 road events and 13 events in 4 chains. Each event has conditions, choices with requirements or skill checks, and weighted outcomes.

Conditions use a small language: `food<20`, `skill:medic>=2`, `trait:pious`, `flag:pmap`, `!flag:pmap`, `terrain:desert`, `weather:rain`, `region=1`, `danger>=2`, `row>=6`, `party>=3`, `sick`, `rivals`, `friends`, `full`. A skill check succeeds with `base + 17% per level` (+10% for Lucky).

| Chain | Events |
|---|---|
| ⛏️ The Prospector | A dying man's map, the marked canyon, the claim jumpers |
| 🏁 The Rival Wagon (unlock) | A race, a wagon stuck in the mud, gifts or revenge |
| 📖 The Preacher (unlock) | A ride, a revival tent, the thirsty flock |
| 🤠 The Outlaw (unlock) | A wanted poster, the hideout, the sheriff's bounty |

## Starting groups

| Group | Unlock | Members and supplies |
|---|---|---|
| 👨‍👩‍👧 Settler Family | free | Hunter/Gunhand, Medic 2, Mechanic/Scout, Talker 2 |
| 🦫 Fur Trappers | ✦ 4 | Two Hunters 2, Scout 2. 50 ammo, less food |
| ⛪ Mission Doctors | ✦ 5 | Medic 3, Medic 2. 6 medicine, less money |
| 🛠️ Freight Crew | ✦ 6 | Mechanic 3. 5 parts, 55 water space |
| 🔫 Hired Guns | ✦ 7 | Gunhand 3, 2, 1. 45 ammo, $100, low morale |
| 🎪 Traveling Show | ✦ 8 | Talker 3, two Musicians. $120, morale 90 |

## Run loop and score

1. Title → choose group → town in Independence → map → travel days and events → places and scenes → towns → Green Valley.
2. Score: 40 per map row reached and 0.3 per mile. A win adds 400, 150 per survivor, 5 per HP, half the money, a quarter of the food, 2 per morale and 6 per day under 70.
3. Each run gives trail marks ✦ (score / 120, +3 for a win). Spend them on the title screen to unlock groups and event chains.

Save keys: `dusttrail.run` (the current run) and `dusttrail.meta` (stats and unlocks).

## Balance

The headless sim plays 500 runs per group with two bots:

| Bot | Settlers | Other groups |
|---|---|---|
| Weak (random choices, random roads, random aim) | 0% | 0% |
| Good (scores each choice, plans water and food, aims well) | 41% | 31–45% |
| Good choices, random aim | 15% | 2–18% |

A good run takes about 65–70 days, about 19 events, 1–2 hunts and 1–2 fights.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Skills, traits, terrain, weather, regions, names, groups, chains |
| `src/events.ts` | All events as data |
| `src/run.ts` | Run state, map generation, condition language, events, daily upkeep, towns, score, save data |
| `src/scenes.ts` | Hunt, river and ambush: pure state, fixed-step update, results, bot input |
| `src/bot.ts` | Bot decisions for the sim and the debug API |
| `src/app.ts` | Screens, SVG map, canvas renderer, input, debug API |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG |

All rules live in `run.ts` and `scenes.ts`. The app and the sim call the same functions.

## Debug

Open the game with `?debug` (add `&fast` for short day waits). The console then has `window.debug`:

- `debug.state()`: `screen` (`title`, `setup`, `map`, `travel`, `event`, `town`, `scene`, `report`, `end`), day, row, party, resources, event, scene and result.
- `debug.step()`: one bot action for the current screen. In a scene it plays 2 seconds of game time with bot aim.
