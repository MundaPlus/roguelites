# High Card

Poker-hand scoring roguelite (like Balatro). Status: design only. The page is a placeholder.

## Play style

Combo math. Each round has a score target. You draw 8 cards and play up to 5 cards as a poker hand. The score is **chips × mult**.

- Each hand type has base chips and base mult (pair, two pair, flush, straight, full house, and others).
- Each card adds its rank value to the chips.
- You have a limited number of hands and discards per round.

## Run loop

1. An ante has three blinds: small, big and boss. Each blind has a higher score target.
2. Boss blinds add a rule (for example, "hearts score 0" or "you must play 5 cards").
3. After each blind, visit the shop: jokers, planet cards (level up a hand type), tarot cards (change cards in your deck).
4. Beat ante 8 to win. You can continue in endless mode.

## Core systems

- **Deck**: 52 cards. Cards can get enhancements (glass, steel, gold), seals and editions.
- **Jokers**: up to 5 slots. Each joker adds chips, adds mult or multiplies mult. The order of jokers matters.
- **Hand levels**: planet cards raise the base chips and mult of one hand type.
- **Meta**: unlock decks and jokers.

## Tech plan

- DOM with card elements and CSS transitions.
- Pure scoring function `score(hand, jokers, state)` that also returns each step, so the UI can show the count one step at a time.
- Seeded RNG, so a run can be replayed from its seed.
