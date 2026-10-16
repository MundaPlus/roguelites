# Bullet Bloom

Vertical bullet-hell shooter roguelite (like Touhou-style roguelites / Steredenn). Status: playable.

## How to play

1. Your ship fires on its own. You dodge. Only the tiny dot in the middle of the ship (the hitbox) can be hit.
2. Move with the arrow keys or `WASD`. With a mouse or a finger, drag anywhere. The ship moves by the same distance as the pointer (relative drag).
3. Hold `Shift` (or the 🎯 Focus button on touch screens) to focus. You move slowly, the hitbox shows, and your shots close in.
4. Press `X`, `Space` or the ✿ Bomb button to bomb. A bomb clears all bullets, hurts every enemy and makes you safe for about 2 seconds.
5. Right after a hit you have 8 frames to bomb and survive.
6. `Esc` or `P` pauses the game and opens the menu.

## Rules

- **Graze**: a bullet that passes within 14 px of the hitbox grazes it once. Each graze gives 200 points and charges the bomb meter. A full meter gives +1 bomb (8 at most).
- **Items**: enemies drop blue point items and pink bloom items. Blooms charge the bomb meter. Point items are worth more the higher you catch them. Above the dotted line near the top, all items fly to you at full value.
- **Bosses**: each stage has a mid-boss (2 phases) and a boss (3 to 5 phases). Phases have a time limit. A named phase is a spell card. Beat it without a hit or a bomb for a spell card bonus.
- **Lives**: a hit costs one life and clears the bullets. You come back with at least your ship's starting bombs. No lives left ends the run.
- **No-hit bonus**: clear a stage without a hit for 100,000 × the stage number.
- Lives, bombs, the bomb meter and the score carry over between stages.

## Ships

| Ship | Speed | Lives / bombs | Notes | Unlock |
|---|---|---|---|---|
| 🌸 Petal | 3.4 | 3 / 2 | Balanced, two forward streams | Free |
| 🌹 Thorn | 3.1 | 2 / 2 | Starts with Petal Laser, weaker main shot | 🌱 40 |
| 🍃 Breeze | 4.1 | 3 / 2 | Starts with Spread Shot, weaker main shot | 🌱 60 |
| 🦋 Moth | 3.4 | 2 / 3 | Starts with a drone, grazes charge 50% faster | 🌱 90 |

## Ship parts

After each stage, pick one of 3 parts. The offer is seeded by the run.

| Part | Max | Effect |
|---|---|---|
| 🌿 Spread Shot | 3 | +2 angled streams per level. Focus narrows them. |
| 🛰️ Homing Drone | 4 | One drone per level. Drones fire homing needles. |
| 🔆 Petal Laser | 3 | A piercing beam, 21 damage per second per level, +50% in focus. |
| 💥 Power Core | 3 | +20% damage per level. |
| 💣 Bigger Bomb | 3 | Bombs last 0.5 s longer and hit 50% harder per level. +1 bomb. |
| 🚀 Thrusters | 2 | +12% move speed per level. |
| 🧲 Pollen Magnet | 2 | Pulls items from further away. |
| ✴️ Graze Amp | 2 | Grazes charge the bomb 50% faster per level and score double. |
| 🛡️ Bud Shield | 1 | Blocks the first hit in each stage. |
| ❤️ Spare Petal | – | +1 life. |
| 🌺 Bomb Pouch | – | +2 bombs. |

## Stages

| Stage | Enemies | Mid-boss | Boss (spell cards) |
|---|---|---|---|
| 🌼 Meadow Dawn | Bud, Wisp, Sprite, Dart, Beetle | Thistle Sprite | Briar Queen (2) |
| 🪷 Rain Garden | + Orbiter | Dew Fairy | Lotus Warden (2) |
| 🌙 Night Orchard | + Lantern | Owl Lantern | Moon Moth (3) |
| 🍁 Ember Grove | all | Spark Imp | Cinder Rose (3) |
| ✨ Starlit Bloom | all | Star Seedling | The Last Bloom (4) |

Each stage builds its wave list from its own pool with the run seed. Enemy HP, bullet speed and fire rate grow with each stage. From stage 3 some enemies fire extra patterns. From stage 4 Wisps and Darts leave a ring of bullets when they die.

Bullet patterns are data (`Emit` in `src/data.ts`): ring, spiral (with mirror), aimed fan, fan, rain, flower (curving ring) and random spray. Options set the count, speed, layers, spin, curve, acceleration, bursts and delays.

## Run loop

1. Title: continue or start a run, read the rules, unlock ships.
2. Choose a ship.
3. Play a stage: waves, mid-boss, more waves, boss.
4. Pick one of 3 ship parts.
5. Clear stage 5 to win. The win screen offers loop mode: the same run starts again at stage 1, with faster and denser bullets and tougher enemies.
6. The run saves between stages (`bb.run`). If you leave mid-stage, the stage restarts when you continue.

## Meta progress

Each run gives seeds 🌱 (score / 200,000, +3 per cleared stage, +15 for a win). Spend them in the Hangar on the title screen to unlock ships. The title screen also shows runs, wins, best stage, best score and total grazes (`bb.meta`).

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Playfield size, colors, emitter type, enemies, bosses with phases, stages, ships, parts |
| `src/sim.ts` | Fixed 60 Hz simulation: player, shots, laser, bombs, stage script, bosses, emitters, typed-array pools for bullets/shots/items/particles, spatial grid for graze and hit checks |
| `src/bot.ts` | Dodging bots (good, weak, random) for tests and the balance sim |
| `src/run.ts` | Run state, part offers, seeds, save data |
| `src/app.ts` | Screens, canvas renderer, input, fixed-step loop, debug API |
| `src/sfx.ts` | WebAudio synth sounds |

The simulation has no DOM code. The browser loop runs it at a fixed 60 Hz with an accumulator, independent of the frame rate. Bullets live in typed arrays with swap-remove (no allocation per frame). Each frame a counting sort puts the bullets into a 24 px grid. The hit and graze checks and the bot only look at the cells near the player.

## Balance

A headless sim plays full runs with the bots. The good bot looks 16 frames ahead, decides every 4 frames and overlooks 7% of bullets. The weak bot looks 6 frames ahead, decides every 8 frames and overlooks 25% of bullets.

| Bot | Ship | Win rate |
|---|---|---|
| Random | Petal | 0% (dies in stage 1) |
| Weak | Petal | 0% (dies in stage 1) |
| Good | Petal | about 45% |
| Good | Thorn / Breeze / Moth | 48% / 35% / 50% |

## Debug

Open the game with `?debug` (add `&fast` for bot tests). The console then has `window.debug`:

- `debug.step(frames = 600)`: one bot action. In a stage it simulates up to `frames` frames with the dodging bot. On other screens it clicks the next button.
- `debug.state()`: screen, stage, loop, lives, bombs, score, mode, boss phase, bullet count, meta.
- `debug.god(on)`: the player cannot be hit. `debug.auto(on)`: the bot plays in real time.
- `debug.skip()`: end the current boss phase. `debug.seeds(n)`: add seeds.
