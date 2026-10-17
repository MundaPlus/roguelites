# Poker Face

New-concept roguelite: opponents learn how you bluff. Status: playable.

Announce your move. Lie if you dare. The enemy remembers.

## How to play

1. Each round has two steps. First you **claim** an action. The claim can be true or a lie.
2. The foe reads your claim and claims an action of its own. Its face shows a **tell**.
3. Then you pick your **real action**. Both picks are revealed. The box "Round N" shows both claims, both picks and the result.
4. Click or tap the action buttons. Keys: `1`–`4` or `S` `F` `G` `C`. `L` and `B` use the active relics. `Esc` opens the menu.

## Rules

The four actions form a cycle. Each action beats the next one.

| Pairing | Result |
|---|---|
| ⚔️ Strike vs 🌀 Feint | Strike wins |
| 🌀 Feint vs 🛡️ Guard | Feint wins |
| 🛡️ Guard vs 🔥 Charge | Guard wins |
| 🔥 Charge vs ⚔️ Strike | Charge wins |
| Strike vs Guard, Feint vs Charge | The Guard or Feint side takes 1 (a graze) |
| Same action | Strike: both take 2. Charge: both take 3. Feint, Guard: nothing |

The winner deals the damage of its move. From round 16 on, both sides lose 1 HP per round.

### How the enemy sees you

The panel "How it sees you" shows the foe's model of you. It updates each round.

- **Trusts your claims**: its belief that your claim is true.
- **Actions it thinks you favor**: before your claim. After your claim it shows what it **expects you to play**.
- **Its best answer**: the action that beats what it expects.
- **Second-guesses**: the chance that it plays against your counter instead. It goes up by 16% when you win a round and down by 6% when it wins.

The foe picks its action from its model, with some noise. In 20% of rounds it picks at random. If you always tell the truth, it trusts you and counters your claim. If you always lie, it ignores your claim and guesses from your favorite actions.

### The foe's claims and tells

- A foe's claim is true at a fixed rate (55–75%). The rate drops when you keep countering its claims.
- Its tell (calm or nervous face) shows the truth 80–85% of the time in hall 1 and 60–70% later. "Tells and habits" on the foe card shows the exact numbers.
- Some foes claim the opposite of their real pick when they bluff. Others claim a random action.

### Your record

Every claim goes into your run record. A new foe starts with a trust that mixes its own nature and your record. A run of lies follows you to the next hall.

## Foe types

| Type | How it reads you | How to beat it |
|---|---|---|
| 🐑 Gullible | Trusts claims, changes its mind slowly. Thinks a liar picks at random. | Lie, but not every round. |
| 🙀 Paranoid | Starts at low trust. One lie counts like three true claims. Guesses your favorites. | Tell the truth when it does not trust you. |
| 📊 Statistician | Counts your last 10 rounds: how often you lie and what you play instead of your claim. Second-guesses more. | Do not lie the same way twice in a row. |
| 🪞 Mirror | Expects you to repeat your last round. Bluffs when you bluffed last round. | Break your own pattern. |

## Foes

| Hall | Foes | Champion |
|---|---|---|
| 🍺 The Back Room | Drunk Sailor (gullible), Pickpocket (paranoid), Street Mime (mirror), Card Counter (statistician) | Madame Fortune: paranoid, then gullible at half HP |
| 🎭 The Masquerade | Velvet Fox, Iron Nun, Twin Dancer, Bored Heir | Masked Duke: mirror, then statistician |
| 👑 The Throne Room | Spymaster, Inquisitor, Court Jester, Old Knight | Faceless King: changes type at each quarter of its HP |

Each hall has 2 random foes from its 4, then the champion. Hall 1 always opens with the Drunk Sailor. Hall 1 foes hit softer and have clearer tells. Every foe has its own calm and nervous tell, HP and damage.

## Moves

You have one move per action. Rewards replace a move with a stronger one.

| Action | Start | Other moves |
|---|---|---|
| ⚔️ Strike | Jab 3 | Hook 4, Cleave 6 (+2 taken on a loss), Rend 3 + bleed (unlock) |
| 🌀 Feint | Feint 3 | Misdirect (the foe forgets the round), Pocket Sand (next tell is honest), Gambit 6 (unlock) |
| 🛡️ Guard | Block 3 | Parry 4, Bulwark 3 + heal 2, Riposte 6 (unlock) |
| 🔥 Charge | Rush 5 | Meteor 8 (+2 taken on a loss), Second Wind 5 + heal 2, Battering Ram 6 (unlock) |

## Relics

| Relic | Effect |
|---|---|
| 🎭 Blank Mask | New foes do not know your record. |
| 👁️ Third Eye | Tells are honest 15% more often. |
| 💧 Lethe Vial | Once per duel: the foe forgets everything about you. |
| 🔮 Crystal Ball | Once per duel: see the foe's real pick before you act. |
| 🩸 Vampire Fang | Heal 1 when you win a round. |
| 🪨 Thick Skin | Take 1 less from grazes and clashes. |
| 🪙 Liar's Coin | A bluff that wins deals +2. |
| 💍 Oath Ring | A true claim that wins deals +2. |
| 🍷 Wine Flask | Heal 6 after each duel. |
| 🗡️ Whetstone | Strike and Charge deal +1. |
| 🧤 Iron Gauntlet | Guard and Feint deal +1. |
| ♠️ Ace Up the Sleeve | The foe fully believes your first claim of each duel (unlock). |
| 🕸️ Short Veil | Foes remember only your last 4 rounds (unlock). |
| 🦁 Lion Heart | +10 max HP (unlock). |

## Run loop

1. 3 halls with 2 duels and a champion each (9 duels).
2. After a duel you heal 4 (16 after a champion). Then pick one: a new move, a relic or 14 HP. A champion gives a choice of 3 relics.
3. You start with 40 HP. The run ends when you reach 0 HP or beat the Faceless King.
4. Score: 100 per duel, 5 per winning bluff, 3 per winning true claim, 4 per HP left, 1500 for a win.

## Meta progress

Each run gives shards 💎 (score / 80). Spend them on the title screen to unlock 4 moves and 3 relics. The title screen also shows runs, wins, best hall, best score and bluffs landed. Saves use `localStorage` keys `bluff.run` and `bluff.meta`.

## Balance

`sim.ts` (in the scratchpad, not in the repo) plays 600 runs per bot with the real round functions.

| Bot | Win rate | Reaches hall 2 | Notes |
|---|---|---|---|
| Always honest | 0% | 32% | Wins 17% of rounds. Foes trust it and counter the claim. |
| Always lie | 0% | 85% | Wins 26% of rounds. |
| Random | 0% | 87% | Wins 25% of rounds. |
| Alternate true/lie | 0% | 84% | |
| Honest claims, counter calm claims | 10.5% | 100% | |
| Model only (ignores claims and tells) | 17.8% | 99% | |
| Adaptive (model + claims + tells + record) | 71.5% | 100% | About 65 rounds per run. Lies 25% of the time to gullible foes and 32% to paranoid ones. |

## Code

| File | Contents |
|---|---|
| `src/data.ts` | Actions and the cycle, moves, relics, foes, tells, halls |
| `src/duel.ts` | Pure duel logic: belief model per foe type, enemy AI, `announce(duel, player, claim)` and `resolve(duel, player, act)` |
| `src/run.ts` | Run state, ladder, rewards, score, save data |
| `src/bot.ts` | Bots for the sim and the debug API. They use only the numbers on screen. |
| `src/app.ts` | Screens, reveal animation, floats, input, debug API |
| `src/sfx.ts` | WebAudio sounds |

Toasts show at the top of the screen. Floating numbers show on the foe portrait and your HP card. Neither covers the action buttons.

## Debug

Open the game with `?debug` (add `&fast` to skip the reveal wait). The console then has `window.debug`:

- `debug.step()`: one action of the adaptive bot. Returns `'busy'` during the reveal.
- `debug.state()`: screen, HP, hall, duel state (foe, type, trust, second-guess rate, phase) and the end result.
- `debug.hp(n)`, `debug.win()` (sets the foe to 1 HP), `debug.shards(n)`.
