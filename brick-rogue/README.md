# Brick Rogue

Brick breaker roguelite (like Breakout / Arkanoid roguelites). Status: playable.

## How to play

1. Move the paddle with the mouse. On touch screens, drag anywhere on the play area. The paddle follows your finger 1:1. Keys: `←` `→` or `A` `D`.
2. Launch the ball with a click, a tap, `Space` or `↑`. The ball also launches by itself after 3 s.
3. The hit position on the paddle sets the bounce angle. The edge sends the ball out at up to 60°.
4. Break every brick to clear the wall. In a boss wall, break the boss.
5. If the last ball falls, you lose a life. When you have no lives left, the run ends.
6. After 35 s the bricks creep down 8 px at a time. A brick that reaches the red line breaks and costs a life.
7. `Esc` or `P` pauses and opens the menu.

## Bricks

| Brick | Effect |
|---|---|
| Brick | 1 to 4 HP. The color shows the HP. |
| 🛡️ Armored | 5 + 2 per act HP. Fire and chain zaps do not hurt it. |
| 💣 Explosive | 1 HP. When it breaks, it deals 3 damage to bricks within 54 px. Explosions can chain. |
| ↔️ Moving | Slides left and right with the other movers of its row. |
| 🔺 Shooter | Shoots at the paddle every 3–8 s (faster in later acts). A hit stuns the paddle for 0.8 s. |
| ♻️ Regenerating | Gets 1 HP back every 2.5 s when you do not hit it. |
| 💰 Gold | Gives 8 extra gold and often drops coins. |

Each broken brick gives 1 gold. Each brick has an 11% chance to drop a power-up.

## Power-ups

| Power-up | Effect |
|---|---|
| ⚪ Multi-ball | Two more balls (max 8). |
| ↔ Wide paddle | Paddle 50% wider for 12 s. |
| ⚡ Laser | The paddle fires two lasers every 0.3 s for 8 s. |
| 🐢 Slow ball | Balls 30% slower for 10 s. |
| 🍯 Sticky | The next 3 balls stick to the paddle. |
| ❤ Extra life | +1 life (rare, max 4 lives). At max it gives 15 gold. |
| $ Coins | +10 gold. |

## Upgrades

After each wall you pick 1 of 3 upgrades (4 after elite and boss walls). Shops sell them too.

| Upgrade | Kind | Levels | Effect |
|---|---|---|---|
| 🔥 Fire ball | Ball | 3 | Bricks next to a hit take fire damage. Level 2 reaches diagonals, level 3 deals 2. |
| 🗡️ Pierce ball | Ball | 3 | Passes through 1 / 2 / 4 bricks it breaks per paddle hit. |
| ✨ Split ball | Ball | 3 | Every 4th / 3rd / 2nd paddle hit adds a ball (up to 2 / 3 / 4 in play). |
| 🪨 Heavy ball | Ball | 2 | +1 damage per level (Workshop unlock). |
| 🌩️ Chain ball | Ball | 3 | 20% per level to zap another brick on a hit (Workshop unlock). |
| 🧲 Magnet | Paddle | 2 | Pulls power-ups and falling balls toward the paddle. |
| 🛡️ Shield | Paddle | 2 | A barrier under the paddle saves 1 / 2 balls per wall. |
| 🪽 Wings | Paddle | 2 | +10 paddle width per level. |
| 🔫 Cannon | Paddle | 3 | Fires a laser every 3 / 2.2 / 1.5 s (Workshop unlock). |
| 🍀 Lucky charm | Paddle | 2 | More power-ups and +25% gold per level (Workshop unlock). |

## Paddles

| Paddle | Effect | Unlock |
|---|---|---|
| 🟧 Classic | Width 64, 3 lives. | Free |
| 🟦 Broad | Width 80, 3 lives, balls 10% faster. | 💎 40 |
| 🟥 Forge | Width 62, 2 lives, starts with Heavy ball 1 and Fire ball 1. | 💎 60 |
| 🟩 Gunner | Width 60, 2 lives, starts with Cannon 2 and Shield 1. | 💎 80 |

## Run loop

1. 3 acts. Each act has a branching map of 7 rows with 2–4 nodes per row. The path only goes up.
2. Nodes: 🧱 wall, 💀 elite wall (more HP, more specials, +35 gold), 🛒 shop, 🔧 workshop (+1 life or +1 level on an owned upgrade), 🎁 treasure (a free upgrade and 20 gold).
3. The last row is the boss wall. A boss wall gives +60 gold and 4 upgrade choices.
4. Walls come from 13 seeded templates (Block, Pyramid, Diamond, Checker, Columns, Invader, Conveyor, Ring, Skull, Wings, Zigzag, Fortress, Stripes). The generator mirrors them and turns some bricks into special types. Later acts have more special bricks and more HP.
5. Ball speed: 240 / 410 / 495 px/s per act. In normal walls it rises by up to 45% over 30 s, in boss walls by up to 20%.
6. The first wall of a run is gentle: 22% slower ball, 1-HP bricks, only explosive and moving specials. The second wall is half as gentle.
7. Lives cap at 4. Shops sell a life for 90 + 20 per act gold (+40 per extra buy). The workshop repairs 1 life.

| Act | Boss | Behavior |
|---|---|---|
| 🏚️ Clay Pits | 🗿 Brick Golem (34 HP) | Slides and throws a rock every 5 s. |
| 🏭 Iron Works | 🤴 Turret King (52 HP) | Fires 3-bullet spreads and calls new bricks. |
| 🌋 Ember Keep | 🐉 Brick Hydra (78 HP) | Slides, fires spreads, regrows HP and calls new bricks. |

Bosses move and shoot faster below half HP.

## Meta progress

Score = walls × 100 + bricks × 2 + gold + act × 400 (+2500 for a win). Each run gives shards 💎 (score / 60). Spend them in the Workshop on the title screen to unlock 4 upgrades and 3 paddles. The title screen also shows runs, wins, walls, best act and best score.

The run saves to `localStorage` (`brickrogue.run`, `brickrogue.meta`) on every screen change. If you leave during a wall, that wall starts again when you continue.

## Code

| File | Contents |
|---|---|
| `src/game.ts` | Wall simulation: fixed step (1/120 s), swept ball collision, bricks, bosses, power-ups, bullets, lasers |
| `src/data.ts` | Bricks, power-ups, upgrades, paddles, bosses, acts, wall templates |
| `src/run.ts` | Branching map, loadout, rewards, shop, score, save data |
| `src/bot.ts` | Paddle bot with reaction delay, speed limit and aim error |
| `src/app.ts` | Screens, canvas renderer, effects, input, debug API |
| `src/sfx.ts` | WebAudio synth sounds |

The ball moves by ray casts against the bricks expanded by the ball radius. It stops at the first hit, bounces and uses the rest of its move. So a fast ball never passes through a brick.

## Debug

Open the game with `?debug` (add `&fast` to skip end-of-wall waits). The console then has `window.debug`:

- `debug.step()`: one bot action. In a wall it plays 5 s of game time with the paddle bot. The bot sees the board 0.22 s late, moves at most 1000 px/s and predicts the landing point with an error.
- `debug.state()`: `screen`, act, lives, gold, upgrades and the wall state. `screen` is `'end'` on the win or loss screen.
- `debug.bot(on)`, `debug.clear()` (breaks all bricks), `debug.gold(n)`, `debug.shards(n)`.
