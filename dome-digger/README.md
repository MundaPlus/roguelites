# Dome Digger

Mining plus wave defense roguelite (like Dome Keeper). Status: playable.

## How to play

1. A timer at the top counts down to the next wave. Until then, dig under the dome.
2. Move into rock to drill it. Keys: arrows or WASD, `↑` or `Space` uses the jetpack. On touch screens, use the pad under the map, or hold a finger on the side of the keeper you want to go. The mouse works the same way.
3. Ore drops into your cargo. You carry only a few items, and each item slows you down. Walk into the dome to drop the cargo.
4. When the timer ends, the wave starts. The weapon fires only while the keeper is in the dome, so fly back up fast.
5. Defense: move the mouse (or drag a finger) to aim and hold the button to fire. Keys: `←` `→` turn, `Space` fires. The pad has turn and fire buttons.
6. After each wave, buy upgrades in the workshop. You can also open it from the dome while mining (`U`).
7. Hold the dome for 15 waves to win.

Other keys: `E` lift, `Q` blast charge, `F` orbital strike, `M` mute, `Esc` menu.

## Rules

- The map is 22 tiles wide and 72 tiles deep. It has caves, ore veins and 5 gadget blocks (glowing `?`).
- Dig time = tile HP / drill power. Ore tiles have more HP than plain rock.
- The dome has 100 HP and a shield. The shield takes damage first. It refills when the dome takes no damage for 3 s.
- The laser hits the first monster on its line. It also burns acid spit out of the air.
- Monsters get 7% more HP and 6% more damage per wave. Each wave has a larger budget of monsters.
- Mining time per cycle: 62.5 s at wave 1, up to 80 s from wave 8 (+15 s with the Chrono Anchor).

## Rock layers

| Layer | Depth | Tile HP |
|---|---|---|
| Topsoil | 0–12 | 1 |
| Clay | 13–26 | 2.2 |
| Stone | 27–42 | 4 |
| Granite | 43–58 | 7 |
| Obsidian | 59–72 | 11 |

| Ore | Where | Items per tile |
|---|---|---|
| 🔩 Iron | 1–55 m, mostly near the top | 2 |
| 💧 Water | 6–66 m | 2 |
| 💎 Crystal | 26–70 m | 1 |

## Upgrades

Each upgrade goes from level 1 to 6. Costs rise with the level and need water and crystal at higher levels.

| Upgrade | Effect per level |
|---|---|
| ⛏️ Drill | Dig power ×1.5 (1.3 at level 1) |
| 🎒 Cargo rack | +2 items, less slowdown per item |
| 🚀 Jetpack | Faster climb and walk |
| 🔫 Weapon | +55% damage, faster turning |
| 🛡️ Shield | +14 shield, faster regen |

The workshop also repairs the dome: +20 HP for 🔩3 💧1.

## Gadgets

Each map hides 5 of these 8 gadgets. The seed sets which ones.

| Gadget | Effect |
|---|---|
| 🛗 Lift | Button: go home at once with your cargo. Recharges in 30 s. |
| 💣 Blast Charge | Button: break the rock around you. Recharges in 18 s. |
| 🛸 Carrier Drone | Every 8 s it takes one item from your cargo home. |
| ⏳ Chrono Anchor | +15 s of mining before each wave. |
| 🛰️ Orbital Strike | Button in a wave: hit every monster for 50 + 12 × wave. Once per wave. |
| 🔧 Nanobots | The dome heals 12 HP after each wave. |
| ♻️ Converter | In the workshop: trade 4 iron for 1 crystal. |
| 🌵 Spike Ring | Monsters that touch the dome take 8 damage per second. |

## Monsters

| Monster | Type | From wave | Notes |
|---|---|---|---|
| Crawler | ground | 1 | Walks to the dome and bites. |
| Cave Bat | flyer | 1 | Flies straight at the dome. |
| Runner | ground | 2 | Fast and weak. |
| Spitter | ranged | 3 | Stops at range and spits acid. |
| Brute | ground | 4 | Slow, tough, hits hard. |
| Diver | flyer | 5 | Dives into the dome and explodes. |
| Hornet | flyer | 7 | Armored flyer. |
| Rock Titan | boss | 5, 10 | Huge walker. Stronger on wave 10. |
| Hive Queen | boss | 15 | Hovers, spits and calls bats. |

## Domes (meta progress)

Each run gives cores 🔆 (score / 150). Spend them on the title screen.

| Dome | Cost | Weapon |
|---|---|---|
| 🔴 Laser Dome | free | Long beam that hits the first monster on the line. |
| 🗡️ Sword Dome | 12 | Short arm that sweeps an arc and hits every monster in it. +20% damage, turns fast. |
| 🎯 Turret Dome | 20 | Aims and fires by itself, also while you dig. Turns slower. |

## Run loop

1. Title: pick a dome, start a run. A run has a random seed for the map and the waves.
2. Mine until the timer ends. Return to the dome.
3. Defend the dome until the wave is gone.
4. Workshop: upgrades, repair, converter. Then the next mining cycle starts.
5. The run ends when the dome HP reaches 0 (loss) or after wave 15 (win). The end screen shows the score and the cores you get.

The run saves to `localStorage` (`domedig.run`) every 5 s and at each screen change. Meta progress is in `domedig.meta`.

## Code

| File | Contents |
|---|---|
| `src/world.ts` | World state, map generator, keeper physics and digging, waves, monsters, weapons, gadgets |
| `src/data.ts` | Layers, ores, upgrades, gadgets, domes, monsters |
| `src/run.ts` | Workshop rules, score, save data |
| `src/bot.ts` | Path-finding mining bot and defense bot (tests and balance) |
| `src/render.ts` | Canvas drawing of the mine view, the defense view and the HUD |
| `src/app.ts` | Screens, game loop, input, effects, debug API |
| `src/sfx.ts` | WebAudio synth sounds |

The world is plain JSON. One fixed step is 1/60 s. Only the rows near the camera are drawn.

## Debug

Open the game with `?debug`. The console then has `window.debug`:

- `debug.step()`: one bot action. On the title it starts a run. In play it simulates 2 s of game time with the bot (6 s with `&fast`). In the workshop it buys upgrades and goes on.
- `debug.state()`: screen (`title`, `play`, `shop`, `end`), phase, wave, timer, HP, resources, levels and more.
- `debug.human()`: give control back to the player after bot steps.
- `debug.res(n)`, `debug.wave()` (start the wave now), `debug.win()`, `debug.lose()`.
