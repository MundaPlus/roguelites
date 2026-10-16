# Conga Quest

Snake-style party crawler roguelite (like Nimble Quest). Status: playable.

## How to play

1. Your heroes walk in one line on an 18×18 grid. The line moves one cell every 0.18 s.
2. Steer the leader with the arrow keys or `WASD`. On touch screens, swipe on the arena or use the 🎮 arrows. One turn can wait in the queue.
3. The line cannot reverse. At the start of a wave the line waits until your first turn, or for 2.5 s.
4. Heroes attack on their own when an enemy is in range.
5. `Esc` or `P` opens the menu. `M` mutes the sound. In the shrine, `1` `2` `3` pick a gift and `Enter` starts the next wave.

## Rules

- **Crash**: when the leader hits the wall, a rock or the line, the leader dies. The line stops for 0.9 s. Then the next hero leads. If you do not turn during the stop, the line turns to the side with the most free space.
- **Damage**: enemies hurt the heroes that they touch. A hero at 0 HP leaves the line, and the heroes behind it close the gap.
- **Ram**: the leader hits an enemy it walks through for half of its damage.
- **Gems** 💎 level up the whole party. Each level gives +14% damage and +12% max HP and heals 25%. The leader picks up gems and coins in the 8 cells around it.
- **Coins** 🪙 pay for the shrine shop. **Food** 🍖 heals every hero by 35%.
- **Captives** 🔒: some waves have a caged hero. Run over the cage to add the hero to the line.
- The run ends when the last hero falls. You win when you beat the boss of wave 15.

## Heroes

| Hero | HP | Attack | Unlock |
|---|---|---|---|
| 🛡️ Knight | 16 | Melee, hits up to 2 enemies next to it | Start |
| 🏹 Archer | 9 | Arrow at the nearest enemy, range 6 | Start |
| 🔮 Mage | 8 | Fire blast on a 3×3 area, range 5 | Start |
| ✨ Cleric | 10 | Heals the most hurt hero. Smites when all are well | Start |
| 🗡️ Rogue | 10 | Fast stabs, 25% crit for ×2 | Best wave 4 |
| ❄️ Frost Witch | 8 | Ice bolt, slows the target to half speed for 2 s | Best wave 7 |
| 💣 Bomber | 11 | Slow, heavy bomb on a 3×3 area | Best wave 11 |

Each star (★, up to 3) gives +35% damage, +25% max HP and 7% faster attacks.

## Synergies

Two heroes of one class give tier I. Three or more give tier II.

| Class | Synergy | Tier I | Tier II |
|---|---|---|---|
| 🛡️ | Shield Wall | All heroes take 1 less damage | 2 less damage |
| 🏹 | Volley | Archers +1 range, +20% speed | +2 range, +40% speed |
| 🔮 | Arcana | Blasts deal +30% damage | +60% damage |
| ✨ | Sanctuary | Heals +2 | Heals +4, every heal also gives the party +1 HP |
| 🗡️ | Ambush | Crit chance +20% | +40% |
| ❄️ | Deep Freeze | Slow lasts +1.5 s | +3 s, ice bolts hit 3×3 |
| 💣 | Siege | All damage +15% | +30% |

## Enemies

| Enemy | Behavior |
|---|---|
| 🟢 Slime | Slow chaser |
| 👺 Goblin | Quick chaser |
| 🦇 Bat | Fast and erratic |
| 💀 Skeleton Archer | Keeps 3–5 cells away and shoots bolts |
| 🐗 Boar | Sees a hero in its row or column, winds up (red lane), then charges until it hits something |
| 🟣 Blob | Splits into 2 slimes |
| 👻 Wraith | Floats through rocks |
| 😈 Fire Imp | Throws fireballs from range |

| Boss | Wave | Pattern |
|---|---|---|
| 👑 Slime King | 5 | Chases and spawns 2 slimes every 4.5 s |
| ☠️ Bone Lord | 10 | Keeps its distance, rings of 8 bolts, calls skeleton archers |
| 🐉 Ember Drake | 15 | Charges like a boar and spits 3 fireballs |

Enemy HP grows by 24% and damage by 20% per wave. Spawns show a swirl for 0.9 s before the enemy acts.

## Run loop

1. 3 stages with 5 waves each: 🌿 Mossy Meadow, 🕯️ Bone Crypt, 🌋 Ember Peak. Each stage has its own enemy pool and rocks.
2. Waves 5, 10 and 15 are boss waves.
3. After each wave a shrine offers 3 gifts. Pick one: recruit a hero, train a hero (+1 ★, full heal), feast (full heal, +5 gems) or tithe (coins).
4. The shrine shop: revive the last fallen hero (20 🪙, +10 each time), potion (10 🪙, heal 50%), train the leader (40 🪙, +20 each time), reroll the gifts (6 🪙).
5. Tap a hero in the shrine to make it the leader. The line holds up to 8 heroes.
6. Score: 100 per wave, 5 per kill, 2 per gem, 1 per coin. A win adds 2000 and 150 per living hero.

## Meta progress

The title screen shows runs, wins, the best wave, the best score and the total kills. Your best wave unlocks new classes (a win unlocks all). Pick the starting leader on the title screen. The other two starting heroes are random.

The run saves before each wave and at the shrine (`conga.run`). Meta data is in `conga.meta`. If you leave during a wave, the wave restarts when you continue.

## Balance

A headless sim plays full runs with two bots (100 runs each):

| Bot | Starting classes | All classes |
|---|---|---|
| Weak (random turns, random gifts) | 0% wins, dies at wave 2–3 | 0% wins |
| Good (flood-fill steering, smart gifts and shop) | 60% wins | 41% wins |

The good bot never crashes. Most of its losses are at the Bone Lord and the Ember Drake.

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Grid size, hero classes, stat formula, synergies, enemies, stages |
| `src/world.ts` | One wave: line movement, crashes, hero attacks, enemy brains, shots, pickups, `BAL` knobs |
| `src/run.ts` | Run state, shrine gifts, shop, score, save data |
| `src/bot.ts` | Steering bots (weak and good) and the shrine choices |
| `src/render.ts` | Canvas renderer with smooth movement between ticks and effects |
| `src/app.ts` | Screens, input (keys, swipe, pad), game loop, debug API |
| `src/sfx.ts` | WebAudio synth |
| `src/rng.ts` | Seeded RNG |

The world runs at a fixed 30 steps per second. The renderer draws every hero and enemy between its last cell and its current cell.

## Debug

Open the game with `?debug` (add `&fast` to skip the pauses and play 10 s per step). The console then has `window.debug`:

- `debug.step()`: one bot action. In a wave, the good bot plays 2 s (10 s with `fast`). In the shrine, it picks a gift and shops.
- `debug.state()`: screen, wave, heroes, leader position, level, coins, kills, enemies, score, end data.
- `debug.clear()` kills every enemy of the wave. `debug.wave(n)` starts wave `n`. `debug.xp(n)` and `debug.coins(n)` add gems and coins.
