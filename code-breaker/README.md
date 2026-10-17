# Code Breaker

Deduction puzzle roguelite (like Mastermind and Wordle roguelites). Status: playable.

## How to play

1. Each lock hides a code of colored pegs. Every color also has a symbol (▲ ● ★ ■ ◆ ✚ ♥ ▼), so you can play without color vision.
2. Fill the slots and make a guess. Click a color, or press its number (`1`–`8`) or letter (`R O Y G B P M W`).
3. Click a slot or press `←` `→` to choose a slot. `Backspace` deletes, `Delete` clears the row, `Enter` guesses.
4. The hint shows `●` for each peg with the right color in the right place and `○` for each right color in the wrong place.
5. Open the lock before you run out of tries. Each try you keep gives energy ⚡. A failed lock costs a heart ❤️. With no hearts left, the run ends.
6. `Esc` opens the menu. The `?` button shows the rules.

## Feedback

| Pin | Meaning |
|---|---|
| ● (filled, green) | Right color, right place |
| ○ (ring, white) | Right color, wrong place |
| 🙈 ? | Hidden hint (Blind lock) |
| 🚨 | False hint (Liar lock, only with the Lie Detector) |

## Tools

You pay for tools with energy, inside a lock.

| Tool | Cost | Key | Effect |
|---|---|---|---|
| 🧹 Purge | 5 | `Z` | Removes one color that is not in the code |
| 🔍 Reveal | 9 | `X` | Shows the color of one random peg |
| 🎯 Probe | 3 | `C` | Tests the selected slot: is its color right? (Workshop) |
| 🎟️ Free guess | 7 | `V` | The next guess does not use up a try (Workshop) |

## Locks

Locks grow from floor to floor: 4 pegs and 5 colors on floor 1, 5 pegs and up to 8 colors with repeats in the final vault. Mystery doors have one more color.

| Lock | Rule |
|---|---|
| 🔒 Plain | No special rule |
| 🤥 Liar | One of the first 3 hints is false. +2 tries |
| 🔄 Shifter | After guess 3 the code turns one step to the right |
| 🙈 Blind | The hint of guess 2 stays hidden. +1 try |
| ⏱️ Timed | Open it before the clock runs out |

Blind locks appear after you reach floor 2 once. Timed locks appear after you reach floor 3 once. Special locks give 2–3 extra energy.

Energy for an open lock: 1 + tries left + the lock bonus. Vaults give 2 more.

## Gear

| Gear | Effect |
|---|---|
| 🍀 Lucky Charm | +1 try on every lock |
| 🔋 Battery | +2 energy for each lock you open |
| 🔎 Magnifier | Reveal costs 2 less |
| 📒 Ledger | Each lock starts with one wrong color removed |
| 🚨 Lie Detector | Liar locks mark the false hint |
| ⚓ Anchor | Shifter locks do not turn |
| ⏳ Hourglass | Timed locks give 45 s more. Blind locks show their hint |
| 🛡️ Plating | +1 max heart and heal 1 |
| ⚡ Spark Plug | The first tool on each lock costs 2 less |
| 🔔 Echo Bell | Open a lock with half of its tries left: +3 energy |
| 🩺 Stethoscope | The first guess on each lock is free |
| 🐷 Piggy Bank | Gain 2 energy when you enter a room |

## Run loop

1. 3 floors. On each floor you pick a door 3 times, then you must open the floor vault.
2. Each door shows its room and its lock: code length, colors, repeats, tries, special rule and the number of possible codes.
3. Rooms: 💰 loot (pick 1 of 3 rewards), 🛒 shop (gear and healing for energy), ❓ mystery (rich loot, or a trap that costs energy or a heart). The second door choice on each floor always has a shop.
4. A failed door lock costs a heart and you lose the room. A failed vault costs a heart and resets with a new code.
5. Floor vaults give a choice of 3 gear.
6. After floor 3 comes the final vault: 3 tumblers in a row. Open all 3 to win.
7. Score: 20 per lock, 100 per floor, all energy earned, and 400 + 50 per heart for a win.

## Meta progress

Each run gives keys 🗝️ (score / 80). Spend them in the Workshop on the title screen:

| Unlock | Cost | Effect |
|---|---|---|
| ⚡ Charged Start | 4 | +4 starting energy |
| 🎯 Probe tool | 6 | Adds Probe |
| 🧮 Solver Lens | 8 | Shows how many codes still fit every hint |
| 🎟️ Free Guess tool | 10 | Adds Free guess |
| ❤️ Thick Skin | 14 | +1 max heart |
| 🧰 Starter Kit | 18 | Start with one random gear |

The title screen also shows records and the lock types you found.

## Balance

Headless sim, 400 runs per bot, no unlocks, all lock types:

| Bot | Play | Win rate |
|---|---|---|
| Weak | Guesses a code that fits the hints, but 40% of guesses are random. No tools, random doors and loot | 5.5% |
| Good | Same guesses, uses tools, shops, doors and loot well | 44% |
| Best | Picks the guess that splits the possible codes best, uses tools | 99.5% |

With every Workshop unlock the good bot wins 76%.

## Code

| File | Contents |
|---|---|
| `src/solver.ts` | Feedback score, the code space per lock shape, code rotation |
| `src/lock.ts` | Lock state, guesses, special rules, tools, and the solver that lists the codes that still fit |
| `src/data.ts` | Colors, tools, lock types, gear, floors, Workshop unlocks |
| `src/run.ts` | Doors, rooms, shop, rewards, vaults, score |
| `src/bot.ts` | Bots for the debug API and the balance sim |
| `src/app.ts` | Screens, input, timer, saves, debug API |
| `src/sfx.ts` | WebAudio sounds |

The run saves to `localStorage` (`code-breaker.run`, `code-breaker.meta`) after each action.

## Debug

Open the game with `?debug` (add `&fast` to skip animation waits and stop the clock on Timed locks). The console then has `window.debug`:

- `debug.step()`: one bot action (the good bot). Returns `'busy'` during an animation and `'end'` on the end screen.
- `debug.state()`: screen, run phase, floor, hearts, energy, gear, lock info and meta.
- `debug.code()`: the secret code of the open lock.
- `debug.energy(n)`, `debug.keys(n)`.
