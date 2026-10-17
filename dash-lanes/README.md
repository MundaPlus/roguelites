# Dash Lanes

Endless lane runner roguelite (like Subway Surfers with roguelite upgrades). Status: playable.

## How to play

1. The runner moves forward on its own in 3 lanes. The speed rises with the distance.
2. Keys: `←` `→` or `A` `D` switch lanes. `↑` `W` `Space` jump. `↓` `S` slide. `Esc` or `P` opens the menu.
3. Touch or mouse: swipe left, right, up or down. A tap on the left or right third switches lanes. A tap in the middle jumps.
4. Inputs stay in a short buffer (0.16 s). A jump pressed just before landing still counts. The newest jump or slide replaces an older one in the buffer. A slide in the air drops you fast and slides on landing.
5. A crash ends the run, unless you have a shield or an extra hit. If you switch into the side of a train, you bounce back to your lane.
6. Reach 3300 m (6 stages, 2 bosses) to win. Then you can finish or keep running in endless mode.

## Obstacles

| Obstacle | Dodge |
|---|---|
| 🚧 Barrier (low, striped) | Jump |
| Bar (high, on posts) | Slide |
| ⛔ Wall | Switch lanes |
| Train (parked, 1 to 4 cars) | Switch lanes |
| Oncoming train (headlights) | Switch lanes. It moves toward you. |
| ↔ Cart | Switch lanes. It moves between 2 lanes. |

The track is built from 38 hand-made chunks with a difficulty of 1 to 5. Chunks can be mirrored. Each zone has its own chunk mix. The difficulty target rises with the stage and with the progress in the stage. The gap between two chunks is at least 0.55 s of running at the current speed. A perfect bot in the sim checks that all chunks and joins are passable.

## Power-ups

| Power-up | Effect |
|---|---|
| 🧲 Magnet | Pulls coins from all lanes for 10 s. |
| 🛡️ Shield | Blocks one crash (15 s). |
| 🚀 Jetpack | Fly over everything for 6 s, with a coin trail in the air. |
| ✖️ Score x2 | Double score from distance for 10 s. |

## Zones

| Zone | Mix and rule |
|---|---|
| 🚉 Rail Yard | Many parked trains. A good warm-up. |
| 🌃 Neon City | Carts. Power-ups +30%. Score +10%. |
| 🏜️ Red Canyon | Low barriers and oncoming trains. Score +15%. |
| 🏔️ Frost Pass | Walls and bars. Lane switches 20% slower. Score +20%. |
| 🌴 Jungle Ruins | Dense mixed patterns. Score +10%. |
| 🌋 Volcano Line | Oncoming trains and mixed chunks. Speed +8%. Score +40%. |

## Bosses

A boss flies ahead of you and attacks. A red lane with ⚠ gets a beam. An orange wave means jump. A blue laser means slide. When an attack starts, the boss smashes the trains, walls and carts between you and the hit point, and every obstacle close to the hit point. So you can always reach a safe lane and dodge with one move. Each dodged attack gives 40 score. The boss retreats at the end of the stage (+500 score).

| Boss | Stage | Attacks |
|---|---|---|
| 🛸 Drone Chaser | 3 | Beams on 1 or 2 lanes |
| 🤖 Iron Titan | 6 | Beams, slams, sweeps |
| 🐉 Storm Wyrm | Endless | All, faster |

## Run loop

1. Stages: zone 450 m, zone 500 m, boss 550 m, zone 550 m, zone 600 m, boss 650 m. Endless mode repeats zone, zone, boss with a higher difficulty.
2. At each gate ⛩️ choose the next zone (2 or 3 options) and 1 of 3 perks.
3. Gate shop (coins): start shield, jet start, extra hit, reroll perks.
4. 11 stacking perks: Double Jump, Magnet Range, Extra Hit, Steady Pace (slower speed ramp), Feather, Quick Feet, Long Battery, Lucky Find, Gold Touch, Showman, Starter Shield.
5. Score: distance × zone and perk factors, 10 per coin, 40 per dodged attack, 500 per boss.

## Meta progress

Each run gives gems 💎 (score / 250, +3 per boss, +10 for a win). Spend them on the title screen to unlock runners:

| Runner | Cost | Start |
|---|---|---|
| 🏃 Dash | free | None |
| 🐇 Hop | 25 | Double Jump |
| ⚡ Volt | 50 | Long Battery, Magnet Range |
| 🦏 Tank | 80 | Extra Hit, lane switch 10% slower |
| 🧘 Zen | 120 | Steady Pace, Feather, score -10% |

The run is saved at each gate (`dashlanes.run`). If you leave in the middle of a stage, you restart that stage. Stats and unlocks are in `dashlanes.meta`.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Chunks, zones, bosses, perks, power-ups, runners, stage plan |
| `src/game.ts` | Track generation, runner physics, input buffer, collisions, pickups, boss attacks |
| `src/bot.ts` | Lookahead bot. It tests about 70 short action plans on a copy of the runner. |
| `src/run.ts` | Run state, gates, shop, perks to modifiers, score, save data |
| `src/app.ts` | Screens, pseudo-3D Canvas renderer, effects, input, debug API |
| `src/sfx.ts` | WebAudio synth |

The view is a Canvas 2D perspective projection with a vanishing point. Objects are drawn far to near.

## Debug

Open the game with `?debug` (add `&fast` for a short crash wait). The console then has `window.debug`:

- `debug.step()`: one bot action. In a stage it simulates up to 3 s of game time with the dodging bot. At the goal gate it finishes the run.
- `debug.state()`: screen, stage, distance, speed, coins, score, hits, perks and game details.
- `debug.bot(on)`: the bot plays in real time.
- `debug.skip()`, `debug.power(kind)`, `debug.coins(n)`, `debug.gems(n)`.

## Balance (100 sim runs each)

| Bot | Wins |
|---|---|
| Random keys | 0% |
| Weak (0.34 s reaction, short sight, errors) | 8% |
| Good (0.26 s reaction, 1.1 s sight, few errors) | 46% |
| Perfect (no delay) | 100%, 0 crashes and 0 shield hits in 300 runs |

The perfect bot checks fairness: every situation has an escape at the current speed.
