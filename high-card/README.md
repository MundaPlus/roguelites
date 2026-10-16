# High Card

Poker-hand scoring roguelite (like Balatro). Status: playable.

## How to play

1. Each blind has a score target. Reach it before you run out of hands.
2. You hold 8 cards. Select 1 to 5 cards and press **Play hand**. The best poker hand in them scores.
3. The score is **chips × mult**. The hand type gives base chips and mult. Each scored card adds its rank in chips (A = 11, J/Q/K = 10).
4. Only the cards that make the hand score. High Card scores one card. Unscored cards still leave your hand.
5. **Discard** 1 to 5 cards to draw new ones. You have 4 hands and 3 discards per round (the Red Deck gives +1 discard).
6. The scoring shows each step: the hand, each card, held cards, then each joker from left to right.
7. Keys: `1`–`9` select cards, `Enter` plays, `D` discards, `S` changes the sort, `C` clears the selection, `L` shows hand levels, `H` help, `Esc` menu. In the shop: `R` rerolls, `Enter` goes on. Mouse, touch and keyboard all work.

## Hand types

| Hand | Base chips × mult | Per level |
|---|---|---|
| High Card | 5 × 1 | +10 / +1 |
| Pair | 10 × 2 | +15 / +1 |
| Two Pair | 20 × 2 | +20 / +1 |
| Three of a Kind | 30 × 3 | +20 / +2 |
| Straight | 30 × 4 | +30 / +3 |
| Flush | 35 × 4 | +15 / +2 |
| Full House | 40 × 4 | +25 / +2 |
| Four of a Kind | 60 × 7 | +30 / +3 |
| Straight Flush | 100 × 8 | +40 / +4 |
| Five of a Kind | 120 × 12 | +35 / +3 |

## Run loop

1. An ante has three blinds: small (×1), big (×1.5) and boss (×2). Base targets per ante: 300, 600, 1,100, 2,200, 4,000, 6,500, 10,000, 15,000.
2. The boss blind adds a rule. You see it before the ante starts.
3. After each blind you cash out: $3 / $4 / $5, $1 per hand left, and $1 interest per $5 you hold (max $5).
4. Then the shop: 2 cards (jokers, planets, tarots), 2 packs and a reroll ($5, +$1 each time).
5. Beat the boss of ante 8 to win. Then you can go on in endless mode (targets ×2.2 per ante).

## Cards

| Kind | Options |
|---|---|
| Enhancements | Bonus (+30 chips), Mult (+4 mult), Glass (×2 mult, 1 in 4 breaks), Steel (×1.5 mult while held), Gold ($3 if held at round end), Lucky (1 in 5: +20 mult, 1 in 15: $20) |
| Seals | Red (triggers again), Gold ($3 when scored), Blue (planet of the last hand if held at round end), Purple (tarot when discarded) |
| Editions | Foil (+50 chips), Holographic (+10 mult), Polychrome (×1.5 mult). Cards and jokers can have them. |

## Jokers

67 jokers in 3 rarities: 40 common, 18 uncommon, 9 rare. You hold up to 5. They act from left to right, so +mult jokers should sit left of ×mult jokers. Click a joker to move it (◀ ▶) or sell it.

| Group | Examples |
|---|---|
| +Mult | Joker, Jolly/Zany/Mad/Crazy/Droll (hand contains …), Half Joker, Abstract Joker, Gros Michel, Supernova, Raised Fist |
| +Chips | Sly/Wily/Clever/Devious/Crafty, Banner, Blue Joker, Ice Cream, Odd Todd, Scary Face, Bull |
| ×Mult | The Duo/Trio/Family/Order/Tribe, Cavendish, Blackboard, Card Sharp, Photograph, Baron, Joker Stencil, Constellation |
| Per card | Greedy/Lusty/Wrathful/Gluttonous (suits), Even Steven, Fibonacci, Scholar, Smiley Face, Shoot the Moon (held queens) |
| Scaling | Green Joker, Ride the Bus, Runner, Spare Trousers, Square Joker, Wee Joker, Hologram, Steel Joker |
| Retrigger | Hack, Sock and Buskin, Dusk, Mime |
| Rules | Four Fingers, Shortcut, Splash, Juggler, Drunkard |
| Money | Golden Joker, Egg, Delayed Gratification, Bootstraps |
| Copy | Blueprint (copies the joker to its right), Brainstorm (copies the leftmost joker) |

## Consumables

You hold up to 2. Click one, then press **Use**. Tarots that change cards need cards selected in your hand during a round.

- **10 planets**: each one raises one hand type by one level.
- **24 tarots**: enhance cards (Magician, Empress, Hierophant, Justice, Chariot, Devil), change suits (Star, Moon, Sun, World), Strength (+1 rank), Hanged Man (destroy), Death (copy a card), Hermit (double money), Temperance (joker sell value), High Priestess (2 planets), Emperor (2 tarots), Judgement (a joker), Wheel of Fortune (joker edition), and rare ones: Aura (card edition), Deja Vu, Talisman, Trance, Medium (seals).

## Packs

| Pack | Price | Content |
|---|---|---|
| 🎪 Buffoon | $5 | Pick 1 of 2 jokers |
| 🌌 Celestial | $4 | Pick 1 of 3 planets, used at once |
| 🔮 Arcana | $4 | Pick 1 of 3 tarots |
| 🂠 Standard | $4 | Pick 1 of 3 enhanced cards for your deck |

## Boss blinds

| Boss | Rule | From ante |
|---|---|---|
| The Club / Goad / Head / Window | All ♣ / ♠ / ♥ / ♦ cards are debuffed (they score nothing) | 1 |
| The Hook | Discards 2 random held cards after each hand | 1 |
| The Psychic | You must play 5 cards | 1 |
| The Manacle | −1 hand size | 1 |
| The Tooth | Lose $1 per card played | 1 |
| The Plant | Face cards are debuffed | 2 |
| The Wall | ×2 target | 2 |
| The Needle | Only 1 hand (target ×0.5) | 2 |
| The Water | No discards | 2 |
| The Flint | Base chips and mult are halved | 2 |
| The Mouth | Only the first hand type you play scores | 2 |
| The Arm | Each played hand type loses a level | 2 |
| The Eye | Repeated hand types score nothing | 3 |
| Violet Vessel (final) | ×1.5 target | 8 |
| Crimson Heart (final) | One random joker is disabled each hand | 8 |

## Meta progress

- The title screen shows runs, wins, best ante, best hand and best score.
- 9 jokers start locked. One unlocks for every 6 blinds you beat over all runs.
- 6 decks: Red (+1 discard), Blue (+1 hand, reach ante 3), Yellow (+$10, ante 4), Checkered (only ♠ and ♥, ante 5), Abandoned (no face cards, ante 6), Black (+1 joker slot, −1 hand, win a run).
- Score = 100 per blind beaten + 1,000 for a win + a small bonus for the best hand.

The run saves to `localStorage` (`highcard.run`) after every action. Meta stats are in `highcard.meta`.

## Code

| File | Contents |
|---|---|
| `src/cards.ts` | Card type, hand types, hand evaluation (with Four Fingers and Shortcut) |
| `src/jokers.ts` | Joker definitions as small hook functions, copy logic |
| `src/score.ts` | Pure `score()` that returns every step for the animation |
| `src/data.ts` | Planets, tarots, bosses, decks, blind targets |
| `src/run.ts` | Run state and every action: rounds, cash out, shop, packs, consumables, save |
| `src/bot.ts` | Random, greedy and smart bots (debug API and balance sim) |
| `src/app.ts` | Screens, DOM cards, scoring animation, input |
| `src/sfx.ts` | WebAudio synth sounds |

All randomness comes from a seeded RNG (`rng.ts`). The seed shows on the blind screen.

## Balance

A headless sim plays the run with three bots (red deck):

| Bot | Win rate |
|---|---|
| Random (random cards, random buys) | 0% |
| Greedy (best hand, never discards, buys jokers) | 2% |
| Smart (discards for flushes and pairs, uses consumables, orders jokers) | 36% |

## Debug

Open the game with `?debug` (add `&fast` to skip animation waits). The console then has `window.debug`:

- `debug.step()`: one bot action for the current screen (async). It returns `'busy'` while the scoring animation runs.
- `debug.state()`: screen, stage, ante, blind, money, score, target, hands, discards, jokers, end info. `screen` is `'end'` on the win and loss screen.
- `debug.money(n)`, `debug.joker(id)`, `debug.unlockAll()`.
