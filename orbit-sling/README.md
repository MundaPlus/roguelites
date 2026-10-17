# Orbit Sling

Gravity slingshot roguelite (like Angry Birds in space / Gravitee). Status: playable.

## How to play

1. Press anywhere on the space map and pull back like a sling. The shot flies the other way. A longer pull gives more power. Let go to fire. Pull back to the start point to cancel.
2. Keys: `←` `→` turn the aim (`Shift` for big steps), `↑` `↓` power, `1`-`6` pick a shot type, `Space` or `Enter` fires. The **Fire** button fires the current aim.
3. The dotted aim line shows the first part of the path. A red cross marks a crash inside that part.
4. During a shot, tap or press `Space` to play it 4 times faster.
5. Hit every target before the shots run out.

## Rules

- Every planet pulls the shot. Black holes pull hard and swallow it. Repulsor stars push it away.
- Planets, moons, asteroids and shields stop the shot. Shots fly through targets, so one shot can hit several.
- Moons, drifting targets and turning shields move once after each shot. A faint ring shows their next place.
- Out of shots: the hull loses 1 point and you jump on. A boss system must be cleared, so a failed boss comes back with a new layout. At 0 hull the run ends.

## Physics

- Bodies stay fixed during a shot. The field is static, so a leapfrog (kick-drift-kick) integrator with a fixed step of 1/200 s keeps orbits stable.
- The aim line, the bot and the real shot all call the same `simulate` function. The aim line is the real path, only shorter.

## Space objects

| Object | Effect |
|---|---|
| 🪐 Planet, ice world, lava world, gas giant | Pull the shot. Size sets the pull. Block on contact. |
| 🌙 Moon | Small body on an orbit. Moves between shots. |
| 🕳️ Black hole | Very strong pull. Swallows every shot, also phase shots. |
| ✴️ Repulsor star | Pushes the shot away. |
| 🪨 Asteroid | Blocks. Heavy shots smash it. |
| 🟦 Shield | A wall or a turning arc. Blocks. Heavy shots smash it. |
| 🎯 Beacon | Target, 1 hit. Some drift on an orbit. |
| 🟧 Armored target | Target, 2 hits. |
| 🔴 Core | Boss target, 2 to 5 hits. |
| 📦 Crate | Optional. +15 credits. |

## Shot types

| Shot | Effect | Shop price (pack of 2) |
|---|---|---|
| ⚪ Slug | Plain shot. Always available. | — |
| ✳️ Split | Splits into 3 after 0.5 s. | 22 |
| 🌑 Heavy | Gravity pulls it 60% harder. Smashes asteroids and shields. | 26 |
| 👻 Phase | Passes through the first planet or moon. | 26 |
| 🪃 Boomerang | Curves back to the launcher. A catch gives the system shot back. | 30 |
| 🎯 Seeker | Steers a little toward the closest target. Sold only after the Hunter Bay is unlocked. | 32 |

## Credits

| Source | Credits |
|---|---|
| Hit | 6 |
| Bank shot (the path turned 100°+ before the hit) | +10 |
| Orbit shot (300°+) | +22 |
| Multi (several targets in one shot) | +8 per extra target |
| System cleared / hard / boss | 15 / 30 / 60 |
| Spare shot at the end | 8 each |
| Clean sweep (no misses) | 15 |

Hard systems pay ×1.5 for shots.

## Launcher upgrades

| Upgrade | Effect | Max |
|---|---|---|
| 🔭 Long Sight | Aim line +40% | 3 |
| ⚡ Power Coil | Max power +12% | 2 |
| 🧲 Target Magnet | Targets 3 px easier to hit | 2 |
| 📦 Spare Rack | +1 shot per system | 2 |
| 🛰️ Salvage Drone | +20% credits | 2 |
| 🛡️ Hull Plating | +1 max hull, repair 1 | 2 |
| 🧠 Trick Computer | Bank and orbit bonus ×1.5 | 1 |

## Run loop

1. 5 sectors: Cradle Belt, Ion Reach, Rubble Drift, Event Horizon, Crown Nebula. Each sector adds new hazards.
2. Each sector has 6 jumps: system, system or hard system, trade post or anomaly, system or hard system, trade post or station, boss.
3. Bosses: The Sentinel, Twin Wardens, The Hive, The Maw, The Crown.
4. Trade post: 3 shot packs, 2 upgrades, 1 hull repair. Station: repair, refit (+1 split, heavy, phase) or +35 credits.
5. 6 anomalies with choices: Derelict Probe, Solar Flare, Wandering Trader, Comet Tail, Distress Beacon, Gravity Rift.
6. Every system is generated from the run seed. The generator checks that a plain shot can reach each target.

## Meta progress

Each run gives stardust (score / 45, +25 for a win). Spend it in the Hangar on the title screen.

| Launcher | Cost | Start kit |
|---|---|---|
| 🚀 Sling Mk I | free | 1 split, 1 heavy |
| 🔭 Longeye | 30 | Long Sight ×2, 1 phase |
| ✳️ Scatter Rig | 45 | 4 splits, splits make 5 pieces |
| ⚓ Gravity Anchor | 55 | 3 heavy, +1 hull |
| 👻 Phantom Drive | 70 | 3 phase, 2 boomerangs, phase passes 2 planets |
| 🎯 Hunter Bay | 90 | 3 seekers, Target Magnet, seekers in shops |

Saves: `orbit-sling.run` (the run, saved after every shot) and `orbit-sling.meta`.

## Code

| File | Contents |
|---|---|
| `src/physics.ts` | Scene at a turn, leapfrog integrator, collisions, trick detection |
| `src/gen.ts` | Seeded system and boss layouts, reachability check |
| `src/data.ts` | Shot types, upgrades, launchers, sectors, map plan, events |
| `src/run.ts` | Run state, credits, shop, station, events, save data |
| `src/bot.ts` | Bots that search angle and power with the same integrator |
| `src/app.ts` | Screens, canvas renderer, input, debug API |

## Debug

Open the game with `?debug` (add `&fast` to resolve shots at once). The console then has `window.debug`:

- `debug.step()`: one bot action. In a system the bot searches angle, power and shot type, then fires with a small aim error.
- `debug.state()`, `debug.credits(n)`, `debug.dust(n)`, `debug.win()`.
