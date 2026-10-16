# Drift Rocks

Inertia space shooter roguelite (like Asteroids roguelites). Status: playable.

## How to play

1. Your ship turns and thrusts. It keeps its speed until you thrust the other way. A light drag slows most hulls.
2. The field wraps at the edges.
3. Shoot every rock and enemy to clear the wave. Big rocks split into smaller rocks.
4. Fly over the gold credits to collect them. They fade after 10 s.
5. After each wave, pick 1 of 3 upgrades. After waves 2, 4, 7, 9, 12 and 14 the dock sells upgrades and spare ships.
6. Waves 5, 10 and 15 have a boss. Beat the wave 15 boss to win. The run ends when the last ship is lost.

### Controls

| Input | Steer | Thrust | Fire | Hyperspace | Pause |
|---|---|---|---|---|---|
| Keyboard | `←` `→` or `A` `D` | `↑` or `W` | `Space` or `J` (hold) | `Shift`, `K`, `↓` or `S` | `Esc` or `P` |
| Mouse | The ship turns to the pointer | Right button | Left button | — | — |
| Touch | Drag on the left side. The ship turns to the stick direction. | Push the stick far | Hold FIRE | JUMP button | ☰ |
| Gamepad | Left stick (heading) or d-pad | Push the stick far, d-pad up or LT | A, RB or RT | B or LB | Start |

On the pick screen, keys `1`–`3` pick a card. In the dock, `1`–`4` buy and `Enter` launches.

## Rocks

| Rock | Effect |
|---|---|
| Stone | Splits in two. |
| Metal | 3× HP. Worth 2× credits. From wave 2. |
| Explosive | Explodes when it breaks. The blast hurts rocks, enemies and you. From wave 3. |
| Crystal | Splits in three. Worth 3× credits. From wave 2. |

Sizes: big (3 HP) → 2 medium (2 HP) → 2 small (1 HP). Small rocks give the most points. Rock HP and speed grow with each wave.

## Enemies

| Enemy | Behavior | From wave |
|---|---|---|
| 🛸 Saucer | Drifts and shoots at you with a wide spread. | 2 |
| 🔻 Homing Drone | Flies at you in packs. | 3 |
| ✴️ Space Mine | Drifts. Arms when you come close, then explodes. | 4 |
| 🎯 Hunter | Chases you and leads its shots. | 7 |
| 🛰️ Mothership (boss) | Rings of bullets, launches drones. | 5 |
| 🌑 Rock Titan (boss) | Throws small rocks. Sheds 2 big rocks at 75%, 50% and 25% HP. | 10 |
| 👁️ Warden (boss) | Fast gunship. Spread shots, drones below 66% HP, a bullet spiral below 33% HP. | 15 |

When a boss dies, the rest of the field breaks up and the wave ends.

## Upgrades

Each upgrade has 3 levels.

| Upgrade | Level 1 → 3 |
|---|---|
| ⚡ Rapid Fire | Fire 18% → 63% faster |
| 🔱 Spread Shot | 3 → 7 bullets in a fan. Side bullets deal half damage. |
| 🔙 Rear Gun | 1 → 3 bullets backward |
| 📌 Piercing Rounds | Bullets pass through 1 → 3 targets |
| 💥 Heavy Rounds | +30% → +90% damage |
| 🔵 Shield | Blocks 1 hit. Recharges in 16 → 7 s. |
| 💣 Mine Layer | Drops a mine every 3.5 → 1.8 s |
| 🧲 Tractor Beam | Pulls credits from 150 → 320 px. +15% → +45% credits. |
| 🌌 Hyperspace | Jump to a safe spot. Cooldown 12 → 5 s. |
| 🔥 Afterburner | +20% → +60% thrust, +10% → +30% top speed and turn |
| 🛸 Wingman (Hangar) | A drone circles you and shoots every 0.9 → 0.4 s |
| ☀️ Nova Core (Hangar) | When a hit lands on you, a blast of 150 → 280 px hits everything |

The dock sells upgrades for 60 + 50 per owned level, and spare ships for 90 (+50 per ship bought). You can hold 6 ships.

## Hulls

| Hull | Handling | Unlock |
|---|---|---|
| 🔺 Arrow | Balanced. Light drag. 3 ships. | Free |
| 🐦 Sparrow | Small, quick turns, strong drag. Fast, weak bullets. | 💎 30 |
| 🛡️ Bulwark | Heavy, slow turns. 4 ships and a shield from the start. | 💎 50 |
| 🌀 Drifter | Almost no drag, very fast. Starts with a rear gun. | 💎 70 |
| 🗡️ Lancer | Slow, heavy shots that pierce one target and fly far. | 💎 90 |

## Meta progress

Each run gives shards 💎 (score / 4000 + waves cleared). Spend them in the Hangar on the title screen to unlock hulls and the Wingman and Nova Core upgrades. The title screen shows runs, wins, best wave, best score and kills.

The run saves at the start of each wave and on the pick and dock screens (`drift.run`, `drift.meta` in `localStorage`). Continue restarts the current wave.

## Code

| File | Contents |
|---|---|
| `src/game.ts` | Fixed-step wave simulation (60 Hz): ship physics, rocks, enemies, bosses, collisions, blasts, credits |
| `src/data.ts` | Hulls, upgrades, rock kinds and sizes, enemies, boss and dock waves |
| `src/run.ts` | Run state, upgrade offers, dock, score, save data, meta |
| `src/bot.ts` | Bots for the debug API and the balance sim |
| `src/app.ts` | Screens, canvas renderer (vector glow), effects, keyboard, mouse, touch and gamepad input |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG |

The world size depends on the screen shape but keeps the same area, so a phone gets a tall field with the same rock density.

## Debug

Open the game with `?debug` (add `&fast` to skip the wave-end waits). The console then has `window.debug`:

- `debug.step()`: one bot action. In a wave it plays 5 s of game time with the bot. On the pick and dock screens it picks and buys by a priority list.
- `debug.state()`: screen, wave, lives, credits, score, upgrades and a summary of the wave.
- `debug.credits(n)`, `debug.shards(n)`, `debug.wave(n)`, `debug.clear()`, `debug.bot(on)`.

## Balance

A headless sim plays full runs with two bots. The good bot reacts every 0.12 s with a small aim error. It aims with lead, dodges threats and buys upgrades by priority. The weak bot turns, thrusts and fires at random.

| Bot (100 runs, Arrow) | Win rate | Median wave reached |
|---|---|---|
| Weak | 0% | 2 |
| Good | 36% | 8 |

Good bot with the other hulls (60 runs each): Sparrow 53%, Bulwark 37%, Drifter 27%, Lancer 63%.
