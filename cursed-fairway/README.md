# Cursed Fairway

Side-view golf roguelite (like Cursed to Golf). Status: playable.

## How to play

1. Drag back from anywhere on the course and let go, like a slingshot. The ball flies opposite to the drag. A longer drag gives more power.
2. The dotted arc shows the first part of the flight. It includes the wind and the club. The driver shows the shortest arc.
3. Keys: `←` `→` angle, `↑` `↓` power (`Shift` for big steps), `Space` shoots. `1`–`6` pick a club. `Z` `X` `C` `V` `B` `N` `M` play the aces in hand. `O` shows the whole hole.
4. Tap the course or press `Space` during a flight to play it 3 times faster.
5. The big number is the shot counter. Each shot costs 1. When it is 0 and the ball is not in the cup, the run ends.

## Rules

- Each hole starts with a camera preview of the whole course. Then the camera follows the ball.
- The shot counter starts at about 1 shot per 700 units of course, plus 1 on hazard-heavy holes and on boss holes. The first two holes give 1 extra shot.
- Idols 🗿 give +2 shots when the ball flies through them. Coins give 4 gold.
- Wind pushes the ball only while it is in the air.
- An Extra Shot ace in hand is used by itself when the counter hits 0.
- Leftover shots give 4 gold each at the end of the hole.

## Surfaces

| Surface | Effect |
|---|---|
| Grass | Normal bounce and roll. |
| Green | Rolls far. The game picks the putter when the ball stops here. |
| Sand | Kills the bounce and stops the ball fast. Shots from sand lose 40% power. |
| Ice | Slides with almost no friction. |
| Water | The ball goes back to where the shot started. -1 shot. |
| Spikes | -1 shot (once per shot) and a hard bounce. If the ball stops on spikes, it goes back. |
| Rock | Cliff faces, pillars and moving gates. Bouncy. |

## Clubs

Clubs go up to level 3 (★★). Each level gives +7% power and a 25% longer aim arc.

| Club | Launch angle | Notes |
|---|---|---|
| Driver | 10°–38° | Farthest. Short aim arc. |
| Rescue | 14°–45° | Ignores the sand penalty. Locker unlock. |
| Iron | 18°–55° | Middle distance. |
| Wedge | 40°–78° | High arc, stops soon. |
| Lob Wedge | 58°–86° | Almost straight up. Locker unlock. |
| Putter | ground | Rolls along the ground. Long aim arc. |

## Ace cards

Aces are used once. You hold up to 5.

| Ace | Type | Effect |
|---|---|---|
| 🌀 Curve Ball | arm | The ball bends toward the flag in the air. |
| 🛑 Air Brake | flight | The ball stops and drops straight down. |
| 🪨 Stone Skip | arm | The ball skips on water. It sinks when it gets slow. |
| ➕ Extra Shot | now | +1 shot. |
| ↩️ Mulligan | now | Undo the last shot and get it back. |
| 💥 Power Tee | arm | +30% power. |
| 🍃 Still Air | arm | No wind. |
| 🚀 Rocket | flight | Strong push in the direction of travel. Locker unlock. |
| 🍯 Sticky Ball | arm | The ball stops where it first lands. Locker unlock. |
| 🦅 Eagle Eye | arm | The aim arc shows the whole flight to the first landing. Locker unlock. |
| 🧊 Deep Freeze | now | All water on the hole turns to ice. Locker unlock. |

"Arm" aces are used by the next shot. "Flight" aces work while the ball flies.

## Charms

Charms are passive. Bosses offer a choice of 3. The pro shop sells 2.

| Charm | Effect |
|---|---|
| 🍀 Lucky Tee | +1 shot on every hole |
| 🧲 Idol Magnet | Idols give +3 shots |
| 🔭 Long Sight | Aim arc 60% longer |
| 🛟 Water Wings | The first water hazard on each hole is free |
| 🥾 Sand Boots | No power loss in sand |
| 🧤 Gold Glove | +50% gold |
| 🃏 Card Sleeve | Hold 2 more aces, a free ace each zone |
| 🛡️ Spike Guard | Spikes cost no shot |

## Zones and bosses

| Holes | Zone | Pieces | Boss (last hole) |
|---|---|---|---|
| 1–4 | 🌳 Fair Meadows | hills, bunkers, ponds, plateaus | 🐹 Gopher King: the flag moves between 3 cups after each shot |
| 5–8 | 🏜️ Dune Links | desert sand, cliffs, pillars, strong wind | 🧞 Storm Djinn: the wind turns and grows after each shot |
| 9–13 | ❄️ Frost Peaks | ice, chasms, spike pits, moving gates | ⛄ Frost Golem: extra moving gates before the green |
| 14–18 | 💀 Cursed Crypt | spike chasms, gates, pillars | 👻 Cursed Caddie: moving cups, turning wind and gates |

Holes are built from hand-made pieces picked with the run seed. Each piece can carry an idol or coins.

## Run loop

1. Before each hole, choose a path: a normal hole, a ☠️ curse hole, a ⏩ shortcut or the 🛒 pro shop. Boss holes offer only the boss or the shop first.
2. Curse holes add one curse (Gale, Thin Card, Blindfold, Thorns, Slick Green). They pay double gold and a free ace.
3. A shortcut is one long hole that counts as two.
4. After a hole: gold, then pick 1 of 3 aces. After a boss: pick 1 of 3 charms.
5. Pro shop: 3 aces, 2 charms, a club upgrade, and Practice (+2 shots on the next hole).
6. Win by clearing hole 18.

## Meta progress

Each run gives tokens 🎟️ (score / 250). Spend them in the Locker on the title screen. It unlocks 2 clubs and 4 aces for later runs. The title screen also shows runs, wins, best hole and best score.

## Code

| File | Contents |
|---|---|
| `src/physics.ts` | Fixed-step ball physics (1/120 s, sub-steps), surfaces, blocks, cups, pickups, aim arc trace |
| `src/course.ts` | Hole builder from seeded pieces, greens and cups |
| `src/golf.ts` | Hole state: launch, shot cost, hazards, idols, boss tricks, Mulligan |
| `src/run.ts` | Path choices, rewards, shop, aces, score, save data |
| `src/bot.ts` | Shot search with the real physics, run choices for the bot |
| `src/data.ts` | Clubs, aces, charms, zones, bosses, curses |
| `src/app.ts` | Screens, canvas renderer, camera, input, debug API |

The physics has no randomness. The aim arc, the real shot and the bot use the same `stepShot`, so the arc matches the flight. Moving gates follow a hole clock that only runs during flights.

Save keys: `cursedfairway.run`, `cursedfairway.meta`.

## Debug

Open the game with `?debug` (add `&fast` to skip waits and play shots at once). The console then has `window.debug`:

- `debug.step()`: one bot action. On a hole, the bot searches club, angle and power with the physics and shoots with a small aim error.
- `debug.state()`: screen, phase, hole, shots, hand, ball, cup and the end result.
- `debug.gold(n)`, `debug.tokens(n)`, `debug.jump(idx, node)` (start hole `idx` as `'hole'`, `'curse'`, `'shortcut'` or `'boss'`).

## Balance

A headless sim plays full runs with two bots. The good bot searches every club, prefers shots that still work with a small aim error, and uses aces. The weak bot samples few shots and has a big aim error. Results (120 runs each): good bot wins 60%, weak bot wins 0% and fails at hole 3–4 on average.
