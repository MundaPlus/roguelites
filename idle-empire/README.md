# Idle Empire

Incremental idle roguelite with prestige (like Cookie Clicker or Antimatter Dimensions). Status: playable.

## How to play

1. Click the coin (or press `Space`) for gold. Buy a 👨‍🌾 Peasant: it makes gold every second.
2. Each tier makes the tier below it. Farms make Peasants, Mills make Farms, up to Provinces.
3. Every full set of 10 of a tier multiplies its output by the set bonus (×2 at the start). The price jumps after each set.
4. Decrees multiply all gold income. Upgrades multiply output and add new mechanics (crits, click scaling).
5. At 1e40 gold you can ascend. The run resets and you get 👑 crowns.
6. Build all 5 stages of the Wonder to finish the game.

Keys: `Space` click, `M` max all, `1`–`8` fill the current set of a tier, `D` decree, `Esc` menu. Touch works for every control. The layout fits a 390 px wide phone.

## Rules

- Big numbers use a small class in `src/big.ts` (mantissa and exponent). Numbers show with short names up to Dc (1e33), then in scientific notation.
- Generator cost = base × step^(sets bought). Base costs go from 10 to 1e24. Steps go from 1e3 to 1e15 per set.
- Global multipliers (upgrades, decrees, prestige bonuses) act on gold income only. Set bonuses act on each tier.
- The game saves to `localStorage` every 10 seconds, on tab hide and on close.
- Offline progress uses the save time stamp. The base is half speed with a 2 h cap. Night Watch gives full speed and 12 h. Long Nights gives 24 h. A summary shows when you come back.
- The Save tab exports the save as text (`IE1:` + base64 JSON) and imports it again.

## Prestige layers

| Layer | Needs | Currency | Gain | Passive bonus | New mechanic |
|---|---|---|---|---|---|
| Ascension | 1e40 gold | 👑 Crowns | ×10 per 5 more digits | gold ×(1 + crowns earned)² | Run paths, challenges, crown tree |
| Dynasty | 1e120 gold, Bloodline skill | 🏺 Sigils | ×10 per 15 more digits | gold ×(1 + sigils earned)^1.5 | Conquest (10 regions) |
| Transcendence | 1e350 gold, Starborn skill | ✨ Stars | ×10 per 30 more digits | gold ×(1 + stars earned)^1.5 | The Wonder (5 stages) |

A higher layer resets the lower layers. Skills can keep the lower trees (Old Blood, Eternal Line) and the regions (Star Maps).

## Skill trees

| Tree | Nodes | Examples |
|---|---|---|
| 👑 Crowns | 13 | Stewards and Chamberlains (autobuyers), War Council (challenges), Archives (keep upgrades), Cartographers (4 path offers), Bloodline |
| 🏺 Sigils | 10 | Old Blood, Regents (auto-ascend and auto path pick), Generals (cheaper regions), Pilgrims (curses at half strength), Starborn |
| ✨ Stars | 8 | Eternal Line, Oracles (auto-dynasty), Architects (cheaper Wonder), Supernova (gold income ^1.05) |

## Run paths (the roguelite part)

After each prestige you choose 1 of 3 paths (4 with Cartographers). The offers come from a seeded RNG. Each path has a blessing, a curse and a goal. Meet the goal when you prestige and the gain is ×1.5.

| Blessings (10) | Curses (8) | Goals (6) |
|---|---|---|
| Bountiful Harvest, Golden Era, Cheap Labor, Busy Hands, Strong Law, Guild Festival, Prosperity, Momentum, Lucky Mint, Scholars | Plague, Heavy Taxes, Corruption, Clumsy, Unrest, Bribed Judges, Greedy Nobles, Broken Roads | Swift, Hands Off, Builder, Frugal, Overflow, Lawmaker |

## Challenges

A challenge is an ascension run with a rule. Reach 1e40 gold to complete it. The reward stays forever.

| Challenge | Rule | Reward |
|---|---|---|
| 🪢 Hands Tied | Clicking does nothing | All production ×3 |
| 🏘️ Small Realm | Only tiers 1–3 | Tiers 1–3 ×100 |
| 📈 Inflation | Cost growth per set ×2 (in digits) | Cost growth −10% |
| 🚫 Austerity | No upgrades | All production ×10 |
| 🥀 Lean Times | Gold income ^0.8 | Gold income ^1.02 |
| 🏴 Lawless | No decrees | Decrees +0.02 each |

## Content

- 8 generator tiers, 16 upgrades, decrees.
- 3 prestige layers with 31 skill nodes.
- 6 challenges, 10 blessings, 8 curses, 6 goals.
- 10 conquest regions (1e60 to 1e230 gold).
- 5 Wonder stages (1e350 to 1e700 gold). The last stage ends the game with a victory.
- Abandoning the empire (menu) ends the game as a defeat. Both end screens show a score.
- Score = 100 per digit of the best gold, 5000 per Wonder stage, 500 per challenge, points per prestige, and a time bonus for a finished game.
- The title screen shows empires started, Wonders built, best time and best score.

## Code

| File | Contents |
|---|---|
| `src/big.ts` | Big number class and number formatting |
| `src/data.ts` | Tiers, upgrades, layers and skill trees, challenges, blessings, curses, goals, regions, Wonder |
| `src/game.ts` | Pure game state: multipliers, tick, buying, prestige, offline progress, save and export |
| `src/bot.ts` | Good bot (debug and sim) and weak bot (sim) |
| `src/app.ts` | Screens, tabs, data bindings updated 5 times per second, input, debug API |
| `src/sfx.ts` | WebAudio synth sounds |
| `src/rng.ts` | Seeded RNG and hash (from Peg Bounce) |

## Balance

A headless sim plays 20 seeds per bot for up to 8 hours of game time.

| Bot | First ascension | First dynasty | First transcendence | Wonder done |
|---|---|---|---|---|
| Good (buys max every second, clicks for 3 min per run, waits until a prestige doubles its currency, does challenges) | 7.5 min | 55 min | 1.24 h | 20/20, median 2.4 h |
| Weak (3 random buys per second, no clicks, prestiges at once) | 12.8 min | 3.4 h | – | 8/20 within 8 h |

A real player buys less often than the good bot. Expect the first ascension after 10–20 minutes and the end after a few hours (with offline time).

## Debug

Open the game with `?debug`. The console then has `window.debug`:

- `debug.state()`: screen (`title`, `game`, `end`), tab, gold, prestige counts, regions, Wonder stage and the end result.
- `debug.step()`: one bot action. On the title it starts a game. With path offers it picks the best one. In the game it plays 10 s of game time with the good bot (120 s with `&fast`). A full game reaches `end` in about 80 steps with `?debug&fast`.
- `debug.gold(digits)`: adds 10^digits gold.
