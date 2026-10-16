# Beat Delver

Rhythm dungeon crawler roguelite (like Crypt of the NecroDancer). Status: playable.

## How to play

1. Each beat you get one move: up, down, left or right. Keys: arrows or `WASD`. On touch screens, tap beside the hero or use the pad under the map.
2. The beat bar under the map shows the next beats. Markers slide to the heart. Press when they reach it. The green zone is the timing window.
3. Moving into a monster attacks it. Moving into a dirt wall digs it. Moving into a chest opens it.
4. Monsters also move on the beat. A monster that glows acts on the next beat. A red glow near you means an attack is coming.
5. `B` drops a bomb. `Q` (or `Space`) casts your spell. `Esc` opens the menu and pauses the music.

## Rules

- **Timing.** An on-beat press acts at once. Then the monsters act. When a beat passes without a press, you miss the beat and only the monsters act. A press far from the beat is "off beat": you do not act.
- **Gold multiplier.** Each kill raises it by 1, up to ×3 (more with a Ring of Gold). A missed beat, an off-beat press or a hit resets it to ×1. Monsters drop their gold times the multiplier. The floor lights up in disco colors while the multiplier is up.
- **Walls.** Dirt walls take one beat to dig. Stone needs a pickaxe or a bomb. The outer wall cannot be dug. Gold veins give gold. One wall per floor hides a diamond.
- **Light.** You see 3.6 tiles around you. A torch adds 2 and a lantern adds 4. Boss arenas are fully lit.
- **Shop.** The shopkeeper 🧔 sells 3 items. Step on an item to buy it.
- **Bombs** explode 3 beats later in a 3×3 area. They deal 3 to monsters, 2 to you and break all walls but the outer wall.
- **Spells** recharge with kills. You can hold one spell.
- **Bosses** are pushed back one tile when you hit them and then lose a beat. Against a wall they fight back.

## Weapons

| Weapon | Damage | Attack shape |
|---|---|---|
| 🗡️ Dagger | 1 | 1 tile ahead |
| 🔱 Spear | 1 | The first enemy up to 2 tiles ahead |
| ⚔️ Broadsword | 1 | All 3 tiles in the row ahead |
| ➰ Whip | 1 | One enemy in the 5 tiles of the row ahead |
| 🤺 Rapier | 1 | 1 tile ahead. Lunges at an enemy 2 tiles away for double damage |
| 🗡 Longsword | 2 | Both tiles in a line of 2 |

A Whetstone adds +1 damage to any weapon.

## Items

| Item | Effect |
|---|---|
| 🦺 Leather Armor | Blocks the first hit on each floor |
| 🧥 Chainmail | Hits of 2 or more deal 1 less |
| 🛡️ Plate Armor | Chainmail and leather together |
| 🔥 Torch / 🏮 Lantern | You see 2 / 4 tiles farther |
| 💣 Bomb Pack | +3 bombs |
| ☄️ Fireball | 3 damage to every enemy in a line ahead (4 kills to recharge) |
| ❄️ Freeze | All enemies stop for 6 beats (6 kills) |
| 💖 Heal | Heals 2 HP (7 kills) |
| 🌋 Quake | Digs all walls within 2 tiles, 1 damage to enemies next to you (3 kills) |
| 💍 Ring of Gold | The multiplier goes 1 higher |
| 🍀 Lucky Charm | +2 gold per gold pile |
| 💚 Ring of Vigor | Heal 1 HP at the start of each floor |
| 🍎 Apple / 🧀 Cheese | Heal 2 / 4 HP |
| ❤️ Heart Container | +1 max HP and heals 1 |
| 🪨 Whetstone | +1 weapon damage |
| ⛏️ Pickaxe | Dig stone walls |

Shop prices rise with each zone.

## Monsters

Each monster has a fixed pattern. Monsters that act every second or third beat can be hit between their steps.

| Zone | BPM | Monsters | Mini-boss (floors 1–2) | Boss (floor 3) |
|---|---|---|---|---|
| ⚰️ Crypt | 100 | 🟢 Slime (hops up and down), 🦇 Bat (random, every 2nd beat), 💀 Skeleton (chases, every 2nd), 🧟 Zombie (walks straight) | 👹 Ogre: chases every 3rd beat | 🤴 Bone King: calls skeletons |
| 🕳️ Caverns | 112 | 🦇 Bat, 🔵 Blue Slime (walks a square), 🕷️ Spider (chases every beat), ☠️ Bone Knight (2 HP, every 2nd), 🍄 Spore Cap (never moves) | 🐂 Minotaur: charges in lines | 🕸️ Spider Queen: fast, lays spiders |
| 🔥 Forge | 124 | 😈 Fire Imp, 🐗 Boar (aims, then charges), 🟠 Lava Slime, ☠️ Bone Knight, 🍄 Spore Cap | 🗿 Golem: tough, every 3rd beat | 🤖 Forge Titan: slams the 3×3 area around it |
| 🌌 Abyss | 136 | 👻 Wraith (diagonal), 🧙 Lich (3 HP), 🧟‍♂️ Ghoul, 🐗 Boar, 😈 Fire Imp | 🐲 Drake: hits for 4 | 🎻 The Conductor: strikes its row and column, calls wraiths |

The tempo rises by 4 BPM per floor. From the Forge on, slow monsters with 2 or more HP get +1 HP. Boss slams flash red one beat before they hit.

## Run loop

1. 4 zones with 3 floors each. Floors 1 and 2 are random dungeons with rooms, corridors, a shop, 1–2 chests and locked stairs 🔒. The mini-boss stands next to the stairs. Kill it to open them.
2. Floor 3 is the boss arena. Beat the boss to open the stairs. The boss of the Abyss ends the run with a win.
3. After each zone boss, choose a reward: full heal, +1 max HP or an item.
4. The run saves at the start of each floor. Continue starts that floor again from the beginning.
5. Score: gold earned + 5 per kill + 60 per floor + 20 per diamond + 600 for a win.

## Meta progress

Diamonds 💎 come from hidden walls, mini-bosses (1), bosses (2), depth (1 per 3 floors) and a win (5). Spend them on the title screen:

| Unlock | Cost | Effect |
|---|---|---|
| 🧝 Ranger | 8 | Spear, torch, 4 HP, 2 bombs |
| 🤺 Knight | 12 | Broadsword, leather armor, 4 HP |
| 🎩 Gambler | 10 | Dagger, 3 HP, Ring of Gold, 40 gold |
| 💣 Powder Pouch | 4 | +2 bombs at the start |
| 🔥 Old Torch | 5 | Start with a torch |
| ❤️ Stout Heart | 8 | +1 max HP at the start |

The Delver (dagger, 5 HP, 1 bomb) is free.

## Timing settings

- **Input latency** (−150 to 300 ms) moves the timing window. Raise it when your on-beat presses count as late.
- **Calibrate** plays a click at 100 BPM. Tap 8 times. The game suggests the median offset as the latency.
- **Wide timing window** sets the window to ±170 ms instead of ±110 ms (never more than 42% of a beat).

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Weapons and attack shapes, items, monsters, zones, delvers, unlocks |
| `src/world.ts` | Floor state and `resolveBeat`: player action, bombs, boss slams, monster patterns |
| `src/level.ts` | Seeded floor generator (rooms, corridors, shop, chests, veins, monsters) and the boss arena |
| `src/run.ts` | Run and meta state, save data, zone rewards, score |
| `src/bot.ts` | Path costs, a two-beat lookahead bot and a weak bot |
| `src/render.ts` | Canvas map renderer and the beat bar |
| `src/sfx.ts` | WebAudio synth and the generated drum and bass loop |
| `src/app.ts` | Screens, the beat clock, input, calibration, debug API |

The beat clock uses `AudioContext.currentTime`. The music is scheduled 150 ms ahead from the same clock, so the beat you hear and the timing window match. When the audio clock does not run, the page clock takes over.

## Debug

Open the game with `?debug`. The console then has `window.debug`:

- `debug.state()`: screen, zone, floor, HP, gold, beat, multiplier, enemy count, `nextIn` (seconds to the next beat), end data.
- `debug.step()`: one bot action. On a floor the lookahead bot plays one beat and the clock restarts one beat later.
- `debug.world()`, `debug.skip()` (finish the floor), `debug.gold(n)`, `debug.diamonds(n)`.

With `?debug&fast` the beat clock stops. Beats happen only through `step()` (4 beats per call) and the effects are skipped. A full bot run takes about 300–500 calls.

## Balance

A headless sim plays full runs with the game rules:

| Bot | Win rate |
|---|---|
| Weak bot (walks to the stairs, hits what is in the way, misses 12% of beats) | 0 / 150 |
| Lookahead bot, 10% missed beats | 84 / 150 (56%) |
| Lookahead bot, 5% missed beats | 118 / 150 (79%) |
