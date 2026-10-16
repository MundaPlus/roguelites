# Last Bastion

Run-based tower defense roguelite (like Rogue Tower). Status: playable.

## How to play

1. Enemies walk the path from the purple portals to your 🏰 core. Each enemy that gets there takes core HP. At 0 HP the run ends.
2. Pick a tower in the build bar, then tap a free green cell to build it. Tap the button again or press `Esc` to stop building.
3. Tap a tower to see its stats. There you can upgrade it, set its target or sell it.
4. Press **Start wave** when you are ready. Use pause and the 1×, 2× and 3× speed buttons during the wave. You can build and upgrade during a wave.
5. The panel always shows the next wave, so you can plan for flyers, armor or a boss.
6. After each wave, pick one of three cards. Then the path grows by one tile.

Keys: `1`–`5` pick a tower, `Esc` cancels, `Space` starts the wave or pauses, `F` changes the speed, arrow keys move a cursor and `Enter` builds or selects, `T` changes the target, `Q`/`E` upgrade the left/right branch, `S` sells, `H` help, `M` mute.

## Rules

- The map is a 7×7 grid of tiles. Each tile has 3×3 cells. The path is a tree of tiles that starts at the core.
- After each wave one tile is added at the end of a branch. Waves 5, 15, 25 and so on start a new branch with its own portal. Enemies split between the portals.
- When the new path covers a tower, you get its full cost back.
- Each tower of a type makes the next one of that type cost 10% more. Upgrades do not count.
- Selling gives back 70% of the gold spent on the tower.
- Armor takes its value off every hit. A hit always deals at least 25%.
- Bosses ignore stuns and get only part of the slow.
- A wave enrages after 100 seconds: the enemies left move twice as fast.

### Terrain

| Terrain | Effect |
|---|---|
| Grass | You can build here. |
| Hill (light, with a triangle) | You can build here. Towers get +1 range. |
| Forest | No building. Ballista, frost and tesla shots that pass over it miss 30% of the time. |
| Rock, pond | No building. |
| Ford (blue path) | Ground enemies move 30% slower. |

## Towers

Each tower has two upgrade branches. The first upgrade picks the branch. A tower goes up to level 4. Upgrades cost 75%, 125% and 200% of the base cost.

| Tower | Cost | Base | Branch A | Branch B |
|---|---|---|---|---|
| 🏹 Ballista | 50 | 14 damage, 1/s, range 3. Hits flyers. | Sniper: more damage and range, then ignores armor | Repeater: faster, then shoots 2 targets |
| 💣 Mortar | 80 | 26 area damage, 0.45/s, range 4.5. No flyers, no close targets. | Siege: more damage and blast, then stuns | Barrage: faster and longer range, then 3 shells |
| ❄️ Frost | 60 | 4 damage, slows 35% for 1.5 s. | Glacier: stronger slow, then freezes | Blizzard: hits all in range, then chilled enemies take +25% damage |
| ⚡ Tesla | 90 | 22 damage, jumps to 3 enemies. | Arc: up to 10 jumps | Overcharge: more damage and speed, then stuns |
| 🔥 Flame | 70 | 6 damage 3 times a second in a 70° cone, burns 3/s. | Inferno: more damage and burn, then ignores armor | Long reach: more range and a wider cone |

Targets: **First** (closest to the core), **Last**, **Strong** (most HP), **Close** (closest to the tower).

## Enemies

| Enemy | From wave | Notes |
|---|---|---|
| 👺 Grunt | 1 | Plain. |
| 🐺 Runner | 3 | Fast. |
| 🐗 Brute | 5 | Armor 3 (more after wave 25). Costs 2 core HP. |
| 🦇 Bat | 7 | Flies straight from its portal to the core. |
| 🧙 Shaman | 9 | Heals enemies near it. |
| 🟢 Slime | 12 | Splits into 2 blobs. |

Bosses come every 10 waves: 👹 Ogre King (armor), 💀 Lich (raises grunts), 🗿 Iron Golem (armor 12), 🐉 Dragon (flies), 👑 The Tyrant (calls runners). A boss that reaches the core takes 10 HP (the Tyrant 20).

Enemy HP grows each wave. The growth gets steep after wave 15.

## Cards

After each wave you pick one of three cards. Boss waves give rare cards.

| Card | Effect |
|---|---|
| 🏗️ New tower | Unlocks a tower type for this run. Always offered until you own 3 types. |
| ⚔️ Drills / ⏩ Crews / 🔭 Scopes / 🏷️ Plans | One tower type: +20% damage, +15% fire rate, +0.5 range or −20% cost. |
| 💰 War chest | Gold now (40 + 6 per wave). |
| 🧱 Masonry | +5 max core HP and repair 5. |
| 🪙 Bounty | +1 gold per kill. |
| 🏦 Treasury | 5% of your gold after each wave (max 40). |
| 🛠️ Engineers | Upgrades cost 15% less. |
| 🦅 Eagle eye / 🥁 War drums / 🗡️ Whetstone | All towers: +0.3 range, +8% fire rate or +10% damage. |
| ♻️ Salvage | Selling gives back 95%. |
| 💎 Crystal vein | +4 crystals at the end of the run. |
| Rare: ⚙️ Overclock, 🎖️ Arsenal, 👑 Golden age, 🏰 Fortress, ⭐ Veterans | +25% fire rate, +30% damage, +2 gold per kill, +10 max HP and full repair, or one free upgrade for every tower. |

All boosts add up (two +20% cards give +40%, not +44%).

## Run loop

1. Start with 130 gold, 20 core HP, the ballista and a short path.
2. Build, start the wave, earn gold from kills and a clear bonus (12 + 2 per wave).
3. Pick a card. The path grows. Repeat.
4. Survive wave 50 to win. After the win you can go on in endless mode.

## Meta progress

Each run gives crystals 💎: 1 per 2 waves, 3 per boss, 15 for a win. Spend them in the Armory on the title screen:

- Unlock the ⚡ Tesla and 🔥 Flame towers (20 each). Then cards can offer them.
- Unlock starting relics: 👛 Gold purse (+60 gold), 🧱 Stone walls (+5 core HP), 📜 Scholar (a second tower type), 🗡️ Old whetstone (+10% damage). Take one relic per run.

The title screen shows runs, wins, best wave, best score and total kills.

## Balance

A headless sim plays the real game code with two bots (40 runs each):

| Bot | Win rate | Median wave |
|---|---|---|
| Weak: random towers near the path, no upgrades, random cards | 0% | 12 |
| Good: best-coverage cells, upgrades, card priorities (base towers) | 45% | 49 |
| Good with Tesla and Flame unlocked | 40% | 49 |

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Towers and upgrade trees, enemies, bosses, cards, relics |
| `src/map.ts` | Tile grid, terrain, path tree growth, routes for ground and flyers |
| `src/game.ts` | Run state, tower stats, fixed-step battle sim, waves, cards, score |
| `src/bot.ts` | Weak and good bots for the debug API and the balance sim |
| `src/run.ts` | Save data (`last-bastion.run`, `last-bastion.meta`) and unlocks |
| `src/app.ts` | Screens, canvas renderer, effects, input, debug API |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG and hash |

The battle runs in fixed steps of 1/30 s. The speed buttons run more steps per frame, so the game and the sim give the same result for the same input. The run is saved at the start of each wave and after each build, upgrade, sale and card. If you leave during a wave, the wave starts again from its save.

## Debug

Open the game with `?debug` (add `&fast` to simulate whole waves at once). The console then has `window.debug`:

- `debug.step()`: one bot action. On the title it starts a run. In the build phase the good bot spends gold and starts the wave. During a wave it simulates 4 s of game time (a whole wave with `&fast`). On the card screen it picks a card.
- `debug.state()`: `screen` (`title`, `play`, `cards`, `end`), phase, wave, core, gold, towers, enemies, offers and the end result.
- `debug.gold(n)`, `debug.crystals(n)`, `debug.towerCells()`, `debug.screenOf(cx, cy)`.
