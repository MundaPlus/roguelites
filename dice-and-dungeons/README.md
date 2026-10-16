# Dice & Dungeons

Dice-placement puzzle-combat roguelite (like Dicey Dungeons, with poker-style combos). Status: playable.

## How to play

1. Choose a hero and climb 5 floors of the tower.
2. Each turn you roll your dice. Drag a die onto an equipment card, or tap the die and then the card.
3. Each card has a slot rule: **Any**, **Even**, **Odd**, **≤N**, **≥N**, **=N**. A **Σ N** card collects dice until the total is N, then fires.
4. Most cards work once per turn. Utility cards (Lockpick, Spatula, Tinker Hammer, Duplicator, Gambler's Cup) give you new dice back.
5. Shield blocks damage until the start of your next turn.
6. Press **End turn**. The enemy rolls its dice and uses its cards. You can see its cards at all times.

Keys: `1`–`9` select a die, then `1`–`9` select a card. `Enter` ends the turn. `Esc` clears the selection.

## Combos

- **Pair, Triple, Four of a Kind**: use a number that you already used this turn. Bonus damage: +2, +5, +10.
- **Straight**: use 3 or more numbers in a row this turn (for example 2-3-4). Bonus shield: +3, +6, +10, +15.

## Statuses

| Status | Effect |
|---|---|
| ☠️ Poison | Lose this much HP at the start of the turn, then it goes down by 1. |
| 🔥 Burn | This many dice start on fire. Using a burning die costs 2 HP. |
| ❄️ Freeze | This many of the highest dice become 1. |
| ⚡ Shock | This many cards are blocked. A die put into a shocked card only removes the shock. |
| 💔 Weak | Damage dealt is halved. Goes down by 1 at the end of each turn. |

## Run loop

- Each floor has 6 steps: fight → fight or event → elite or shop → fight or event → campfire or shop → boss.
- After a fight, heal 15% of max HP and choose one reward: new equipment, an upgrade, a die face, or max HP.
- Elites also give a relic. Bosses give a relic choice, a big heal, and a new die (floors 1 and 3) or +8 max HP (floors 2 and 4).
- The backpack has 6 space. Equipment has size 1 or 2. Manage it on the map screen. Only equipped cards go into a fight.
- Dice upgrades: a **Loaded Face** changes the lowest face of a die to 6. A **Wild Face** (★) lets you choose the value after the roll.

## Heroes

| Hero | HP | Dice | Perk | Unlock |
|---|---|---|---|---|
| 🛡️ Warrior | 44 | 2 | Second Wind: 8 shield the first time HP drops below half in a fight. | Start |
| 🗝️ Thief | 36 | 2 | Quick Hands: reroll up to 2 dice each turn. | Reach floor 2 |
| ⚙️ Inventor | 34 | 3 | Tinker: each die in a Σ card counts 1 more. | Reach floor 4 |

## Content

- 30 player cards, 14 enemy cards, 15 relics, 7 events.
- 28 enemies: 3 or 4 normal enemies, 1 elite and 1 boss on each floor. The final boss is The Dice Lord.

## Code

| File | What it holds |
|---|---|
| `src/types.ts` | Dice, slot rules (`Req`, `accepts`), statuses. |
| `src/equipment.ts` | All cards: slot rule, text, effect (`run(ctx, x, lvl)`). |
| `src/enemies.ts` | Enemy stats and cards per floor. |
| `src/relics.ts` | Relics. The combat engine checks them by id. |
| `src/combat.ts` | Combat engine: turns, statuses, combos, enemy AI (`aiStep`). No DOM. |
| `src/run.ts` | Heroes, floor plan, rewards, shop, events, save data. |
| `src/app.ts` | DOM UI, drag and drop (pointer events), screens. |

Save data is in `localStorage` (`dd-run`, `dd-meta`). Each run has a seed, so the encounters and rewards for each step are the same after a reload.

## Debug

Open the game with `?debug`. Then use `window.dice` in the browser console:
- `god()`: HP never drops below 1.
- `win()`: win the current fight.
- `gold(n)`, `give(id)`, `relic(id)`, `unlockAll()`.
- `state()`, `step()`: the bot test uses these. `step()` does one sensible action on any screen.
